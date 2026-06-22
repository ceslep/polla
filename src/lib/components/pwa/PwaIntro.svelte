<script>
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';

    /**
     * PwaIntro — animación Three.js que se reproduce una vez por sesión
     * al cargar la PWA. Reproduce 1:1 el timeline del antiguo `textto.html`:
     *
     *   t=0.0s  grain fade-in
     *   t=1.0s  título "Polla Mundialista" entra con blur/rotateX
     *   t=2.2s  divisor RGB aparece
     *   t=2.6s  dígitos "2026" caen uno a uno (stagger 0.14s)
     *   t=3.5s  light leak cruza la pantalla
     *   t=4.4s  subtítulo "amigos de Guática" cae desde arriba
     *   t=7.4s  comienza fade-out del stage
     *   t=8.4s  termina fade-out
     *   t=8.4s+2s  se desmonta y queda el contenido PWA debajo
     *   t=9.4s  loop de render se cancela
     *
     * Comportamiento defensivo:
     *   - Si WebGL no está disponible, loguea y llama onClose() inmediato
     *     (no deja al usuario en pantalla negra).
     *   - Si `document.fonts.ready` no resuelve en 1.5s, arranca igual.
     *   - `prefers-reduced-motion: reduce` → salta el intro directo al onClose.
     *   - `onDestroy` libera renderer, geometries, materials y listeners.
     *
     * @typedef {Object} Props
     * @property {() => void} onClose  Llamado cuando la animación debe desmontarse.
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
    /** @type {THREE.ShaderMaterial|null} */
    let grainMat = null;
    /** @type {THREE.ShaderMaterial|null} */
    let pMat = null;
    /** @type {THREE.BufferGeometry|null} */
    let pGeom = null;
    let rafId = /** @type {number|null} */ (null);
    let closeTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
    let resizeHandler = /** @type {(() => void)|null} */ (null);
    let contextLostHandler = /** @type {((e: Event) => void)|null} */ (null);
    let disposed = false;
    let playStarted = false;

    const T = {
        grainIn:    0.8,
        title:      1.0,
        divider:    2.2,
        yearStart:  2.6,
        leak:       3.5,
        subtitle:   4.4,
        holdEnd:    7.4,
        fadeOutEnd: 8.4,
        replay:     8.6
    };
    const TOTAL = 9.4;
    /** -1.0s: el componente se desmonta cuando COMIENZA el fade-out
     *  (t = T.holdEnd = 7.4s). Hard cut. */
    const CLOSE_AFTER_FADE = -1.0;
    /** Duración exacta del intro: animations CSS terminan a T.fadeOutEnd,
     *  y el componente se desmonta CLOSE_AFTER_FADE segundos después. */
    const INTRO_DURATION_MS = (T.fadeOutEnd + CLOSE_AFTER_FADE) * 1000;

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (closeTimer !== null) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (contextLostHandler && canvasEl) {
            canvasEl.removeEventListener('webglcontextlost', contextLostHandler);
            contextLostHandler = null;
        }
        if (pGeom) {
            pGeom.dispose();
            pGeom = null;
        }
        if (pMat) {
            pMat.dispose();
            pMat = null;
        }
        if (grainMat) {
            grainMat.dispose();
            grainMat = null;
        }
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null;
        camera = null;
    }

    onDestroy(dispose);

    function buildScene() {
        if (!canvasEl) return false;
        const canvas = canvasEl;

        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
        } catch (e) {
            console.error('[PwaIntro] WebGL no disponible:', e);
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // ===== Grain fullscreen quad =====
        /** @type {{ value: number }} */
        const uTimeGrain = { value: 0 };
        /** @type {{ value: number }} */
        const uIntensity = { value: 0.0 };
        grainMat = new THREE.ShaderMaterial({
            uniforms: { uTime: uTimeGrain, uIntensity },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() { vUv = uv; gl_Position = vec4(position, 1.0); }'
            ].join('\n'),
            fragmentShader: [
                'precision highp float;',
                'varying vec2 vUv;',
                'uniform float uTime;',
                'uniform float uIntensity;',
                'float hash(vec2 p) {',
                '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
                '}',
                'void main() {',
                '  float g = (hash(gl_FragCoord.xy + fract(uTime * 60.0)) - 0.5) * uIntensity;',
                '  float c = (hash(gl_FragCoord.xy * 0.37 + 7.0) - 0.5) * 0.012;',
                '  vec3 col = vec3(g + c * 0.6, g, g - c * 0.4) + 0.004;',
                '  gl_FragColor = vec4(col, 1.0);',
                '}'
            ].join('\n')
        });
        const grainMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), grainMat);
        scene.add(grainMesh);

        // ===== Particle field =====
        const PALETTE = [
            [1.00, 0.18, 0.33],   // crimson
            [0.00, 0.90, 1.00],   // cyan
            [1.00, 0.76, 0.03]    // gold
        ];
        const PCOUNT = 120;
        const pPos    = new Float32Array(PCOUNT * 3);
        const pCol    = new Float32Array(PCOUNT * 3);
        const pSeed   = new Float32Array(PCOUNT);
        const pSpeed  = new Float32Array(PCOUNT);

        for (let i = 0; i < PCOUNT; i++) {
            pPos[i*3]   = (Math.random() - 0.5) * 2.4;
            pPos[i*3+1] = (Math.random() - 0.5) * 2.0;
            pPos[i*3+2] = 0;
            pSeed[i]    = Math.random() * 6.2831853;
            pSpeed[i]   = 0.04 + Math.random() * 0.08;
            const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            pCol[i*3]   = c[0];
            pCol[i*3+1] = c[1];
            pCol[i*3+2] = c[2];
        }

        pGeom = new THREE.BufferGeometry();
        pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        pGeom.setAttribute('color',    new THREE.BufferAttribute(pCol, 3));
        pGeom.setAttribute('aSeed',    new THREE.BufferAttribute(pSeed, 1));
        pGeom.setAttribute('aSpeed',   new THREE.BufferAttribute(pSpeed, 1));

        pMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uPxRatio: { value: renderer.getPixelRatio() } },
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            vertexShader: [
                'attribute float aSeed;',
                'attribute float aSpeed;',
                'uniform float uTime;',
                'uniform float uPxRatio;',
                'varying vec3 vColor;',
                'void main() {',
                '  vec3 pos = position;',
                '  pos.y = mod(pos.y + uTime * aSpeed + 1.2, 2.4) - 1.2;',
                '  pos.x += sin(uTime * 0.4 + aSeed) * 0.04;',
                '  vColor = color;',
                '  gl_Position = vec4(pos.xy, 0.0, 1.0);',
                '  gl_PointSize = (1.5 + aSeed * 0.04) * uPxRatio;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'void main() {',
                '  vec2 c = gl_PointCoord - 0.5;',
                '  float d = length(c);',
                '  if (d > 0.5) discard;',
                '  float alpha = (1.0 - d * 2.0);',
                '  alpha = pow(alpha, 1.5) * 0.55;',
                '  gl_FragColor = vec4(vColor, alpha);',
                '}'
            ].join('\n')
        });

        const particles = new THREE.Points(pGeom, pMat);
        scene.add(particles);

        resizeHandler = () => {
            if (!renderer || !pMat) return;
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            pMat.uniforms.uPxRatio.value = renderer.getPixelRatio();
        };
        window.addEventListener('resize', resizeHandler);
        resizeHandler();

        contextLostHandler = () => {
            console.warn('[PwaIntro] WebGL context lost — abortando intro.');
            if (!disposed) onClose?.();
        };
        canvas.addEventListener('webglcontextlost', contextLostHandler);

        return true;
    }

    /**
     * @param {number} startT
     */
    function startLoop(startT) {
        function loop() {
            if (disposed || !renderer || !scene || !camera || !grainMat || !pMat) return;
            const now = performance.now() / 1000;
            const t = now - startT;

            /** @type {any} */
            const grainUniforms = grainMat.uniforms;
            /** @type {any} */
            const pUniforms = pMat.uniforms;
            grainUniforms.uTime.value = now;
            pUniforms.uTime.value = t;

            const g = Math.min(1, t / T.grainIn);
            grainUniforms.uIntensity.value = g * 0.06;

            if (t > T.holdEnd - 0.7 && !fading) fading = true;

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
        // Forzar reflow para que las animaciones CSS arranquen limpias.
        if (containerEl) void containerEl.offsetWidth;
        playing = true;

        // El close se programa con un setTimeout dedicado, independiente del
        // render loop (que termina a los 9.4s y NO puede disparar el close).
        // INTRO_DURATION_MS = T.fadeOutEnd (8.4s) + CLOSE_AFTER_FADE (2.0s).
        closeTimer = setTimeout(() => {
            if (!disposed) onClose?.();
        }, INTRO_DURATION_MS);

        const startT = performance.now() / 1000;
        startLoop(startT);
    }

    onMount(() => {
        // Accesibilidad: respetar prefers-reduced-motion.
        const mq = typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        if (mq?.matches) {
            onClose?.();
            return;
        }

        const ok = buildScene();
        if (!ok) {
            onClose?.();
            return;
        }

        // Esperar fuentes listas con timeout defensivo.
        const fontTimeout = setTimeout(start, 1500);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                clearTimeout(fontTimeout);
                start();
            }).catch(() => {
                clearTimeout(fontTimeout);
                start();
            });
        } else {
            start();
        }
    });
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Cormorant+Garamond:ital,wght@1,400;1,600&family=Bebas+Neue&display=swap" rel="stylesheet">
</svelte:head>

<div
    class="intro-root"
    class:is-playing={playing}
    class:is-fading={fading}
    bind:this={containerEl}
    aria-hidden="true"
>
    <canvas class="intro-canvas" bind:this={canvasEl}></canvas>

    <div class="cine cine-top"></div>
    <div class="cine cine-bot"></div>
    <div class="vignette"></div>
    <div class="light-leak"></div>

    <div class="stage" class:playing class:fading>
        <h1 class="title-main">Polla Mundialista</h1>
        <div class="divider"></div>
        <div class="year" aria-label="2026">
            <span class="year-digit" style="--i:0">2</span>
            <span class="year-digit" style="--i:1">0</span>
            <span class="year-digit" style="--i:2">2</span>
            <span class="year-digit" style="--i:3">6</span>
        </div>
        <p class="subtitle">Amigos de Guática</p>
    </div>
</div>

<style>
    .intro-root {
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        background: #03030a;
        overflow: hidden;
    }

    /* Body-gradient equivalente al del HTML original (radiales violeta/azul).
       Renderizado dentro del componente para no contaminar el body de la app. */
    .intro-root::before {
        content: '';
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
            radial-gradient(ellipse 90% 60% at 50% 32%, rgba(60, 10, 80, 0.35) 0%, transparent 65%),
            radial-gradient(ellipse 70% 50% at 50% 70%, rgba(0, 40, 80, 0.25) 0%, transparent 65%),
            radial-gradient(ellipse at center, #08060f 0%, #03030a 60%, #000 100%);
    }

    .intro-canvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        z-index: 1;
    }

    .cine {
        position: fixed;
        left: 0;
        right: 0;
        height: 9vh;
        background: #000;
        z-index: 30;
        pointer-events: none;
    }
    .cine-top {
        top: 0;
        box-shadow: 0 1px 0 rgba(255, 45, 85, 0.35), 0 0 18px rgba(255, 45, 85, 0.18);
    }
    .cine-bot {
        bottom: 0;
        box-shadow: 0 -1px 0 rgba(0, 229, 255, 0.35), 0 0 18px rgba(0, 229, 255, 0.18);
    }

    .vignette {
        position: fixed;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        background: radial-gradient(ellipse at center,
            transparent 30%,
            rgba(0, 0, 0, 0.55) 78%,
            rgba(0, 0, 0, 0.92) 100%);
        opacity: 0.7;
        transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .is-playing .vignette,
    .is-fading .vignette {
        opacity: 1;
    }

    .light-leak {
        position: fixed;
        top: 50%;
        left: 0;
        width: 70vw;
        height: 80vh;
        transform: translate(-110%, -50%) rotate(-6deg);
        z-index: 15;
        pointer-events: none;
        background: linear-gradient(90deg,
            rgba(255, 45, 85, 0.0) 0%,
            rgba(255, 45, 85, 0.55) 15%,
            rgba(255, 179, 0, 0.65) 50%,
            rgba(0, 229, 255, 0.55) 85%,
            rgba(0, 229, 255, 0.0) 100%);
        mix-blend-mode: screen;
        filter: blur(30px);
        opacity: 0;
    }
    .is-playing .light-leak {
        animation: leak-sweep 1.0s 3.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes leak-sweep {
        0%   { transform: translate(-110%, -50%) rotate(-6deg); opacity: 0; }
        15%  { opacity: 1; }
        100% { transform: translate(220%, -50%) rotate(-6deg); opacity: 0; }
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

    .title-main {
        font-family: 'Bebas Neue', 'Playfair Display', serif;
        font-weight: 400;
        font-size: clamp(2.4rem, 8.4vw, 9.5rem);
        letter-spacing: 0.16em;
        line-height: 0.95;
        text-transform: uppercase;
        background: linear-gradient(180deg,
            #ff8a9b 0%,
            #ff2d55 35%,
            #ff1744 65%,
            #b8001f 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: blur(20px) drop-shadow(0 0 30px rgba(255, 45, 85, 0.55)) drop-shadow(0 0 60px rgba(255, 45, 85, 0.25));
        opacity: 0;
        transform: scale(0.82) rotateX(18deg);
        transform-origin: center;
    }
    .stage.playing .title-main {
        animation: title-in 1.6s 1.0s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes title-in {
        0%   { filter: blur(20px) drop-shadow(0 0 30px rgba(255,45,85,0.55)) drop-shadow(0 0 60px rgba(255,45,85,0.25)); opacity: 0; transform: scale(0.82) rotateX(18deg); }
        55%  { filter: blur(2px)  drop-shadow(0 0 30px rgba(255,45,85,0.75)) drop-shadow(0 0 60px rgba(255,45,85,0.35)); opacity: 1; transform: scale(1.04) rotateX(0deg); }
        100% { filter: blur(0px)  drop-shadow(0 0 18px rgba(255,45,85,0.55)) drop-shadow(0 0 40px rgba(255,45,85,0.22)); opacity: 1; transform: scale(1.0) rotateX(0deg); }
    }

    .divider {
        width: 0;
        height: 1px;
        margin: 2.2vh 0 2vh;
        background: linear-gradient(90deg,
            transparent 0%,
            #ff2d55 20%,
            #ffc107 50%,
            #00e5ff 80%,
            transparent 100%);
        opacity: 0;
        box-shadow: 0 0 12px rgba(255, 193, 7, 0.5);
    }
    .stage.playing .divider {
        animation: divider-in 1.0s 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes divider-in {
        0%   { width: 0;    opacity: 0; }
        100% { width: 44vw; opacity: 0.95; }
    }

    .year {
        font-family: 'Bebas Neue', 'Playfair Display', serif;
        font-weight: 400;
        font-size: clamp(2rem, 6.5vw, 6.5rem);
        letter-spacing: 0.38em;
        display: flex;
        gap: 0.1em;
        margin-left: 0.38em;
    }
    .year-digit {
        display: inline-block;
        background: linear-gradient(180deg,
            #b3f5ff 0%,
            #00e5ff 40%,
            #00b8d4 70%,
            #006978 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 14px rgba(0, 229, 255, 0.7)) drop-shadow(0 0 32px rgba(0, 229, 255, 0.3));
        opacity: 0;
        clip-path: inset(0 100% 0 0);
        transform: translateY(40px) scale(0.7);
    }
    .stage.playing .year-digit {
        animation: digit-in 0.75s calc(2.6s + var(--i) * 0.14s) cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    @keyframes digit-in {
        0%   { opacity: 0; clip-path: inset(0 100% 0 0); transform: translateY(40px) scale(0.7); }
        50%  { opacity: 1; }
        100% { opacity: 1; clip-path: inset(0 0 0 0); transform: translateY(0) scale(1.0); }
    }

    .subtitle {
        font-family: 'Cormorant Garamond', 'Playfair Display', serif;
        font-style: italic;
        font-weight: 600;
        font-size: clamp(1.2rem, 2.4vw, 2.3rem);
        letter-spacing: 0.6em;
        text-transform: lowercase;
        margin-top: 2.8vh;
        margin-left: 0.6em;
        background: linear-gradient(90deg,
            #ffd54f 0%,
            #ffc107 50%,
            #ff8f00 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 12px rgba(255, 193, 7, 0.6)) drop-shadow(0 0 28px rgba(255, 193, 7, 0.25));
        opacity: 0;
        transform: translateY(-80px);
    }
    .stage.playing .subtitle {
        animation: subtitle-in 1.3s 4.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes subtitle-in {
        0%   { opacity: 0; transform: translateY(-80px); letter-spacing: 0.95em; filter: blur(6px); }
        50%  { opacity: 1; filter: blur(0px); }
        100% { opacity: 0.95; transform: translateY(0); letter-spacing: 0.6em; filter: blur(0px); }
    }

    .stage.fading .title-main,
    .stage.fading .divider,
    .stage.fading .year-digit,
    .stage.fading .subtitle {
        animation: fade-out 1.0s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }
    @keyframes fade-out {
        to { opacity: 0; filter: blur(8px); transform: translateY(-8px) scale(0.97); }
    }

    @media (prefers-reduced-motion: reduce) {
        .intro-root { display: none; }
    }
</style>
