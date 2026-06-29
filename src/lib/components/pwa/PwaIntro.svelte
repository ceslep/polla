<script>
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';

    /**
     * PwaIntro — intro cinematográfica de estadio nocturno.
     *
     * Capas WebGL (canvas, additive sobre negro):
     *   1. Orbe de energía pulsante (gradiente cálido→cyan) detrás del título.
     *   2. Cuatro haces volumétricos con barrido + flicker (reflectores).
     *   3. Partículas con parpadeo (destellos de estadio).
     *
     * Capas CSS encima del canvas:
     *   - lens flare en el cruce de haces, scanline de barrido, viñeta,
     *     grain animado, shockwave al revelar el título.
     *
     * Timeline (s):
     *   0.0  beams + orbe fade-in
     *   0.6  kicker entra
     *   1.2  título + shockwave
     *   1.4  pico de lens flare
     *   2.2  divisor se expande
     *   2.6  dígitos "2026" caen (stagger 0.12s)
     *   3.6  subtítulo sube
     *   5.4  fade-out comienza
     *   6.4  fade-out completo · 6.7 desmonta
     *
     * @typedef {Object} Props
     * @property {() => void} onClose
     */
    /** @type {Props} */
    let { onClose } = $props();

    let canvasEl = $state(/** @type {HTMLCanvasElement|null} */ (null));
    let containerEl = $state(/** @type {HTMLDivElement|null} */ (null));
    let playing = $state(false);
    let fading = $state(false);

    /** @type {THREE.WebGLRenderer|null} */
    let renderer = null;
    /** @type {THREE.Scene|null} */
    let scene = null;
    /** @type {THREE.OrthographicCamera|null} */
    let camera = null;
    /** @type {THREE.ShaderMaterial[]} */
    let beamMats = [];
    /** @type {THREE.ShaderMaterial|null} */
    let orbMat = null;
    /** @type {THREE.BufferGeometry|null} */
    let orbGeom = null;
    /** @type {THREE.ShaderMaterial|null} */
    let pMat = null;
    /** @type {THREE.BufferGeometry|null} */
    let pGeom = null;
    /** @type {THREE.BufferGeometry[]} */
    let beamGeoms = [];
    let rafId = /** @type {number|null} */ (null);
    let closeTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
    let resizeHandler = /** @type {(() => void)|null} */ (null);
    let contextLostHandler = /** @type {((e: Event) => void)|null} */ (null);
    let disposed = false;
    let playStarted = false;

    const T = {
        beamFull:   1.2,
        title:      1.2,
        flarePeak:  1.4,
        divider:    2.2,
        yearStart:  2.6,
        subtitle:   3.6,
        holdEnd:    5.4,
        fadeOutEnd: 6.4
    };
    const TOTAL = 7.2;
    const CLOSE_MS = 6700;

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        if (closeTimer !== null) { clearTimeout(closeTimer); closeTimer = null; }
        if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
        if (contextLostHandler && canvasEl) {
            canvasEl.removeEventListener('webglcontextlost', contextLostHandler);
            contextLostHandler = null;
        }
        if (pGeom) { pGeom.dispose(); pGeom = null; }
        if (pMat) { pMat.dispose(); pMat = null; }
        if (orbGeom) { orbGeom.dispose(); orbGeom = null; }
        if (orbMat) { orbMat.dispose(); orbMat = null; }
        for (const g of beamGeoms) g.dispose();
        beamGeoms = [];
        for (const m of beamMats) m.dispose();
        beamMats = [];
        if (renderer) { renderer.dispose(); renderer = null; }
        scene = null;
        camera = null;
    }

    onDestroy(dispose);

    /**
     * Trapezoide en clip-space para un haz volumétrico.
     * UV v=1 es la fuente angosta (arriba), v=0 la base ancha.
     */
    function createBeamGeom(
        /** @type {number} */ x1, /** @type {number} */ y1,
        /** @type {number} */ x2, /** @type {number} */ y2,
        /** @type {number} */ x3, /** @type {number} */ y3,
        /** @type {number} */ x4, /** @type {number} */ y4
    ) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            x1, y1, 0,  x2, y2, 0,  x3, y3, 0,  x4, y4, 0
        ]), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
            0, 1,  1, 1,  0, 0,  1, 0
        ]), 2));
        g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
        return g;
    }

    const BEAM_VERT = [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = vec4(position, 1.0);',
        '}'
    ].join('\n');

    // Haz con núcleo brillante, barrido horizontal (uSweep) y flicker (uIntensity).
    const BEAM_FRAG = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform float uIntensity;',
        'uniform float uTime;',
        'uniform float uPhase;',
        'uniform vec3 uColor;',
        'void main() {',
        '  float sweep = sin(uTime * 0.6 + uPhase) * 0.12;',
        '  float cd = abs((vUv.x - 0.5) - sweep) * 2.0;',
        '  float beam = 1.0 - smoothstep(0.0, 0.95, cd);',
        '  beam = pow(beam, 1.7);',
        '  float fade = pow(vUv.y, 0.65);',
        '  float flick = 0.9 + 0.1 * sin(uTime * 9.0 + uPhase * 3.0);',
        '  float i = beam * fade * uIntensity * flick;',
        '  vec3 col = uColor * i;',
        '  float core = pow(beam, 3.5) * fade * uIntensity * 0.5;',
        '  col += vec3(1.0, 0.98, 0.92) * core;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    // Orbe de energía radial, aspecto-corregido, pulsante.
    const ORB_FRAG = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform float uIntensity;',
        'uniform float uTime;',
        'uniform float uAspect;',
        'void main() {',
        '  vec2 p = vUv - 0.5;',
        '  p.x *= uAspect;',
        '  float d = length(p);',
        '  float pulse = 0.5 + 0.5 * sin(uTime * 1.4);',
        '  float r = 0.20 + pulse * 0.025;',
        '  float glow = exp(-pow(d / r, 1.5) * 3.0);',
        '  float core = exp(-pow(d / (r * 0.42), 2.0) * 4.0);',
        '  vec3 warm = vec3(1.0, 0.74, 0.30);',
        '  vec3 cyan = vec3(0.18, 0.82, 1.0);',
        '  vec3 col = mix(cyan, warm, core);',
        '  float i = (glow * 0.55 + core * 1.25) * uIntensity;',
        '  gl_FragColor = vec4(col * i, 1.0);',
        '}'
    ].join('\n');

    function buildScene() {
        if (!canvasEl) return false;

        try {
            renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, alpha: false });
        } catch (e) {
            console.error('[PwaIntro] WebGL no disponible:', e);
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // ── Orbe de energía (fondo, full-quad additive) ──
        orbGeom = new THREE.BufferGeometry();
        orbGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            -1, 1, 0,  1, 1, 0,  -1, -1, 0,  1, -1, 0
        ]), 3));
        orbGeom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
            0, 1,  1, 1,  0, 0,  1, 0
        ]), 2));
        orbGeom.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
        orbMat = new THREE.ShaderMaterial({
            uniforms: {
                uIntensity: { value: 0.0 },
                uTime: { value: 0 },
                uAspect: { value: window.innerWidth / window.innerHeight }
            },
            vertexShader: BEAM_VERT,
            fragmentShader: ORB_FRAG,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        scene.add(new THREE.Mesh(orbGeom, orbMat));

        // ── Haces volumétricos (reflectores cruzados) ──
        /** @type {Array<{geom: [number,number,number,number,number,number,number,number], color: [number,number,number], phase: number}>} */
        const beamDefs = [
            { geom: [-0.95, 1.0, -0.50, 1.0, 0.00, -1.0, 0.45, -1.0], color: [0.98, 0.50, 0.10], phase: 0.0 },
            { geom: [-0.55, 1.0, -0.15, 1.0, 0.35, -1.0, 0.75, -1.0], color: [0.99, 0.72, 0.18], phase: 1.7 },
            { geom: [ 0.50, 1.0,  0.95, 1.0, -0.45, -1.0, 0.00, -1.0], color: [0.20, 0.78, 1.00], phase: 3.1 },
            { geom: [ 0.15, 1.0,  0.55, 1.0, -0.75, -1.0, -0.35, -1.0], color: [0.55, 0.85, 1.00], phase: 4.5 }
        ];
        for (const def of beamDefs) {
            const g = createBeamGeom(...def.geom);
            const m = new THREE.ShaderMaterial({
                uniforms: {
                    uIntensity: { value: 0.0 },
                    uTime: { value: 0 },
                    uPhase: { value: def.phase },
                    uColor: { value: new THREE.Color(def.color[0], def.color[1], def.color[2]) }
                },
                vertexShader: BEAM_VERT,
                fragmentShader: BEAM_FRAG,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: false
            });
            scene.add(new THREE.Mesh(g, m));
            beamGeoms.push(g);
            beamMats.push(m);
        }

        // ── Partículas (destellos de estadio con twinkle) ──
        const PCOUNT = 170;
        const pPos = new Float32Array(PCOUNT * 3);
        const pCol = new Float32Array(PCOUNT * 3);
        const pSeed = new Float32Array(PCOUNT);
        const pSpeed = new Float32Array(PCOUNT);
        const pSize = new Float32Array(PCOUNT);

        for (let i = 0; i < PCOUNT; i++) {
            pPos[i * 3]     = (Math.random() - 0.5) * 2.3;
            pPos[i * 3 + 1] = (Math.random() - 0.5) * 2.0;
            pPos[i * 3 + 2] = 0;
            pSeed[i]  = Math.random() * 6.2831853;
            pSpeed[i] = 0.020 + Math.random() * 0.060;
            pSize[i]  = 1.0 + Math.random() * 2.6;
            // Mezcla cálida (gold) ↔ fría (cyan), con blancos brillantes.
            const t = Math.random();
            if (t < 0.5) {
                pCol[i * 3]     = 1.0;
                pCol[i * 3 + 1] = 0.82 + t * 0.18;
                pCol[i * 3 + 2] = 0.45 + t * 0.3;
            } else {
                pCol[i * 3]     = 0.55 + (1 - t) * 0.4;
                pCol[i * 3 + 1] = 0.88;
                pCol[i * 3 + 2] = 1.0;
            }
        }

        pGeom = new THREE.BufferGeometry();
        pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        pGeom.setAttribute('color',    new THREE.BufferAttribute(pCol, 3));
        pGeom.setAttribute('aSeed',    new THREE.BufferAttribute(pSeed, 1));
        pGeom.setAttribute('aSpeed',   new THREE.BufferAttribute(pSpeed, 1));
        pGeom.setAttribute('aSize',    new THREE.BufferAttribute(pSize, 1));

        pMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPxRatio: { value: renderer.getPixelRatio() },
                uIntensity: { value: 0.0 }
            },
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            vertexShader: [
                'attribute float aSeed;',
                'attribute float aSpeed;',
                'attribute float aSize;',
                'uniform float uTime;',
                'uniform float uPxRatio;',
                'varying vec3 vColor;',
                'varying float vTw;',
                'void main() {',
                '  vec3 pos = position;',
                '  pos.y = mod(pos.y + uTime * aSpeed + 1.2, 2.4) - 1.2;',
                '  pos.x += sin(uTime * 0.3 + aSeed) * 0.04;',
                '  vColor = color;',
                '  float tw = 0.5 + 0.5 * sin(uTime * (2.0 + aSpeed * 8.0) + aSeed * 6.0);',
                '  vTw = tw;',
                '  gl_Position = vec4(pos.xy, 0.0, 1.0);',
                '  gl_PointSize = aSize * (0.7 + tw * 0.7) * uPxRatio;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'varying float vTw;',
                'uniform float uIntensity;',
                'void main() {',
                '  vec2 c = gl_PointCoord - 0.5;',
                '  float d = length(c);',
                '  if (d > 0.5) discard;',
                '  float a = 1.0 - smoothstep(0.0, 0.5, d);',
                '  a = pow(a, 1.8) * (0.3 + vTw * 0.6) * uIntensity;',
                '  gl_FragColor = vec4(vColor, a);',
                '}'
            ].join('\n')
        });

        scene.add(new THREE.Points(pGeom, pMat));

        // ── Resize ──
        resizeHandler = () => {
            if (!renderer || !pMat || !orbMat) return;
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            pMat.uniforms.uPxRatio.value = renderer.getPixelRatio();
            orbMat.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
        };
        window.addEventListener('resize', resizeHandler);
        resizeHandler();

        // ── Context lost ──
        contextLostHandler = () => {
            console.warn('[PwaIntro] WebGL context lost — abortando intro.');
            if (!disposed) onClose?.();
        };
        canvasEl.addEventListener('webglcontextlost', contextLostHandler);

        return true;
    }

    /** @param {number} startT */
    function startLoop(startT) {
        function loop() {
            if (disposed || !renderer || !scene || !camera || !pMat || !orbMat) return;
            const now = performance.now() / 1000;
            const t = now - startT;

            // Rampa de intensidad (smoothstep) compartida por beams + orbe.
            const bp = Math.min(1, t / T.beamFull);
            const ease = bp * bp * (3 - 2 * bp);
            // Atenuación durante el fade-out.
            const out = fading ? Math.max(0, 1 - (t - (T.holdEnd - 0.5)) / 1.4) : 1;
            const lvl = ease * out;

            for (const m of beamMats) {
                m.uniforms.uIntensity.value = lvl;
                m.uniforms.uTime.value = t;
            }
            orbMat.uniforms.uIntensity.value = lvl;
            orbMat.uniforms.uTime.value = t;
            pMat.uniforms.uTime.value = t;
            pMat.uniforms.uIntensity.value = lvl;

            if (t > T.holdEnd - 0.5 && !fading) fading = true;

            renderer.render(scene, camera);

            if (t < TOTAL) {
                rafId = requestAnimationFrame(loop);
            } else {
                rafId = null;
            }
        }
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (playStarted || disposed) return;
        playStarted = true;
        if (containerEl) void containerEl.offsetWidth;
        playing = true;

        closeTimer = setTimeout(() => {
            if (!disposed) onClose?.();
        }, CLOSE_MS);

        const startT = performance.now() / 1000;
        startLoop(startT);
    }

    onMount(() => {
        const mq = typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        if (mq?.matches) {
            onClose?.();
            return;
        }

        const ok = buildScene();
        if (!ok) { onClose?.(); return; }

        const fontTimeout = setTimeout(start, 1500);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => { clearTimeout(fontTimeout); start(); })
                               .catch(() => { clearTimeout(fontTimeout); start(); });
        } else {
            start();
        }
    });
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@1,400;1,600&display=swap" rel="stylesheet">
</svelte:head>

<div
    class="intro-root"
    class:is-playing={playing}
    class:is-fading={fading}
    bind:this={containerEl}
    aria-hidden="true"
>
    <canvas class="intro-canvas" bind:this={canvasEl}></canvas>

    <!-- Atmósfera -->
    <div class="glow-top"></div>
    <div class="scanline"></div>
    <div class="lensflare"></div>
    <div class="vignette"></div>
    <div class="grain"></div>

    <div class="stage" class:playing class:fading>
        <span class="kicker"><i class="k-line"></i>Amigos de Guática<i class="k-line"></i></span>
        <div class="title-wrap">
            <span class="shockwave"></span>
            <h1 class="title-main">Polla Mundialista</h1>
        </div>
        <div class="divider"></div>
        <div class="year" aria-label="2026">
            <span class="year-digit" style="--i:0">2</span>
            <span class="year-digit" style="--i:1">0</span>
            <span class="year-digit" style="--i:2">2</span>
            <span class="year-digit" style="--i:3">6</span>
        </div>
        <p class="subtitle">la gloria se predice</p>
    </div>
</div>

<style>
    .intro-root {
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        background:
            radial-gradient(ellipse 120% 80% at 50% 120%, #0b1430 0%, transparent 60%),
            radial-gradient(ellipse 100% 70% at 50% -10%, #11203f 0%, transparent 55%),
            #04060f;
        overflow: hidden;
    }

    .intro-canvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        z-index: 1;
    }

    /* ── Halo superior ── */
    .glow-top {
        position: fixed;
        top: -20%;
        left: 6%;
        right: 6%;
        height: 64%;
        z-index: 2;
        pointer-events: none;
        background: radial-gradient(ellipse 80% 50% at 50% 0%,
            rgba(245, 166, 35, 0.20) 0%,
            rgba(0, 200, 255, 0.07) 42%,
            transparent 72%);
        opacity: 0;
        transition: opacity 1.5s ease;
    }
    .is-playing .glow-top { opacity: 1; }
    .is-fading .glow-top { opacity: 0; transition: opacity 1.0s ease; }

    /* ── Barrido de luz diagonal ── */
    .scanline {
        position: fixed;
        inset: -30%;
        z-index: 3;
        pointer-events: none;
        background: linear-gradient(105deg,
            transparent 38%,
            rgba(255, 240, 200, 0.05) 48%,
            rgba(0, 220, 255, 0.06) 52%,
            transparent 62%);
        opacity: 0;
        transform: translateX(-30%);
    }
    .is-playing .scanline {
        animation: scan 5.6s 1.0s cubic-bezier(0.45, 0, 0.2, 1) forwards;
    }
    @keyframes scan {
        0%   { opacity: 0;   transform: translateX(-35%); }
        18%  { opacity: 1; }
        80%  { opacity: 0.7; }
        100% { opacity: 0;   transform: translateX(35%); }
    }

    /* ── Lens flare en el cruce de haces ── */
    .lensflare {
        position: fixed;
        top: 50%;
        left: 50%;
        width: min(60vw, 60vh);
        height: min(60vw, 60vh);
        z-index: 4;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.2);
        background: radial-gradient(circle,
            rgba(255, 246, 224, 0.9) 0%,
            rgba(255, 200, 120, 0.35) 14%,
            rgba(0, 220, 255, 0.12) 32%,
            transparent 62%);
        opacity: 0;
        mix-blend-mode: screen;
    }
    .is-playing .lensflare {
        animation: flare 2.2s 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes flare {
        0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.2); }
        45%  { opacity: 0.85; transform: translate(-50%, -50%) scale(1.05); }
        100% { opacity: 0.25; transform: translate(-50%, -50%) scale(1.3); }
    }

    /* ── Viñeta ── */
    .vignette {
        position: fixed;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        background: radial-gradient(ellipse 75% 75% at 50% 48%,
            transparent 45%,
            rgba(2, 4, 10, 0.45) 78%,
            rgba(2, 4, 10, 0.85) 100%);
    }

    /* ── Grain animado ── */
    .grain {
        position: fixed;
        inset: -50%;
        z-index: 21;
        pointer-events: none;
        opacity: 0.07;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        background-size: 160px 160px;
    }
    .is-playing .grain { animation: grain 0.5s steps(4) infinite; }
    @keyframes grain {
        0%   { transform: translate(0, 0); }
        25%  { transform: translate(-3%, 2%); }
        50%  { transform: translate(2%, -3%); }
        75%  { transform: translate(-2%, -2%); }
        100% { transform: translate(3%, 3%); }
    }

    .stage {
        position: fixed;
        inset: 0;
        z-index: 25;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 0 4vw;
        pointer-events: none;
    }

    /* ── Kicker ── */
    .kicker {
        display: inline-flex;
        align-items: center;
        gap: 0.8em;
        font-family: 'Bebas Neue', sans-serif;
        font-size: clamp(0.7rem, 1.8vw, 1.15rem);
        letter-spacing: 0.55em;
        text-transform: uppercase;
        color: #ffd98a;
        text-indent: 0.55em;
        margin-bottom: 1.4vh;
        filter: drop-shadow(0 0 8px rgba(255, 196, 84, 0.5));
        opacity: 0;
        transform: translateY(10px);
    }
    .k-line {
        display: inline-block;
        width: clamp(1.6rem, 6vw, 4rem);
        height: 1px;
        background: linear-gradient(90deg, transparent, #ffd98a, transparent);
        opacity: 0.8;
    }
    .stage.playing .kicker {
        animation: kicker-in 1.1s 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes kicker-in {
        0%   { opacity: 0; transform: translateY(10px); letter-spacing: 0.9em; }
        100% { opacity: 1; transform: translateY(0);    letter-spacing: 0.55em; }
    }

    /* ── Título ── */
    .title-wrap {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .shockwave {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid rgba(255, 224, 150, 0.85);
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
        pointer-events: none;
    }
    .stage.playing .shockwave {
        animation: shock 1.4s 1.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes shock {
        0%   { opacity: 0.9; transform: translate(-50%, -50%) scale(0);    border-width: 3px; }
        100% { opacity: 0;   transform: translate(-50%, -50%) scale(34);   border-width: 0.5px; }
    }

    .title-main {
        font-family: 'Bebas Neue', sans-serif;
        font-weight: 400;
        font-size: clamp(2.8rem, 9vw, 10rem);
        letter-spacing: 0.14em;
        line-height: 0.95;
        text-transform: uppercase;
        text-indent: 0.14em;
        background: linear-gradient(180deg,
            #fff7ea 0%,
            #ffd700 28%,
            #f5a623 58%,
            #b96f00 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 22px rgba(255, 215, 0, 0.6))
                drop-shadow(0 0 56px rgba(245, 166, 35, 0.32));
        opacity: 0;
        transform: translateY(22px);
    }
    .stage.playing .title-main {
        animation: title-in 1.5s 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes title-in {
        0%   { opacity: 0; transform: translateY(22px) scale(0.94); filter: drop-shadow(0 0 46px rgba(255,215,0,0.85)) drop-shadow(0 0 90px rgba(245,166,35,0.55)); }
        55%  { opacity: 1; }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: drop-shadow(0 0 22px rgba(255,215,0,0.6)) drop-shadow(0 0 56px rgba(245,166,35,0.32)); }
    }

    /* ── Divisor ── */
    .divider {
        width: 0;
        height: 1px;
        margin: 2.5vh 0 2vh;
        background: linear-gradient(90deg,
            transparent 0%,
            #f5a623 15%,
            #ffd700 40%,
            #00e5ff 70%,
            transparent 100%);
        opacity: 0;
        box-shadow: 0 0 12px rgba(255, 215, 0, 0.4),
                    0 0 24px rgba(0, 229, 255, 0.25);
    }
    .stage.playing .divider {
        animation: divider-in 0.8s 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes divider-in {
        0%   { width: 0;    opacity: 0; }
        100% { width: 42vw; opacity: 1; }
    }

    /* ── Dígitos del año ── */
    .year {
        font-family: 'Bebas Neue', sans-serif;
        font-weight: 400;
        font-size: clamp(2.2rem, 7vw, 7rem);
        letter-spacing: 0.4em;
        display: flex;
        gap: 0.1em;
        margin-left: 0.4em;
    }
    .year-digit {
        display: inline-block;
        background: linear-gradient(180deg,
            #eafaff 0%,
            #00e5ff 40%,
            #00b8d4 70%,
            #00697f 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 14px rgba(0, 229, 255, 0.75))
                drop-shadow(0 0 32px rgba(0, 229, 255, 0.32));
        opacity: 0;
        transform: translateY(30px) scale(0.8);
    }
    .stage.playing .year-digit {
        animation: digit-in 0.65s calc(2.6s + var(--i) * 0.12s) cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    @keyframes digit-in {
        0%   { opacity: 0; transform: translateY(30px) scale(0.8); }
        60%  { opacity: 1; }
        100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Subtítulo ── */
    .subtitle {
        font-family: 'Cormorant Garamond', serif;
        font-style: italic;
        font-weight: 600;
        font-size: clamp(1.1rem, 2.4vw, 2.2rem);
        letter-spacing: 0.5em;
        text-transform: lowercase;
        margin-top: 3vh;
        margin-left: 0.5em;
        text-indent: 0.5em;
        background: linear-gradient(90deg,
            #ffd54f 0%,
            #ffc107 50%,
            #ff8f00 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.5));
        opacity: 0;
        transform: translateY(-40px);
    }
    .stage.playing .subtitle {
        animation: subtitle-in 1.0s 3.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes subtitle-in {
        0%   { opacity: 0;    transform: translateY(-40px); letter-spacing: 0.8em; }
        100% { opacity: 0.95; transform: translateY(0);     letter-spacing: 0.5em; }
    }

    /* ── Fade out ── */
    .stage.fading .kicker,
    .stage.fading .title-main,
    .stage.fading .divider,
    .stage.fading .year-digit,
    .stage.fading .subtitle {
        animation: fade-out 1.0s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }
    @keyframes fade-out {
        to { opacity: 0; filter: blur(6px); transform: translateY(-6px) scale(0.98); }
    }

    @media (prefers-reduced-motion: reduce) {
        .intro-root { display: none; }
    }
</style>
