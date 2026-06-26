<script>
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { markGoalSeen } from '../../pwa/session.svelte.js';

    /**
     * PwaGoalOverlay — animación Three.js minimalista: solo el balón pasa
     * y desaparece. Celebra la entrada del usuario a las pantallas públicas
     * `ranking` y `today-bets`.
     *
     * Timeline (~0.55s de animación + 0.25s de fade):
     *   t=0.00s   canvas fade-in
     *   t=0.00s   pelota arranca FUERA de pantalla (abajo-izquierda, x=-6.5)
     *   t=0.00–0.55s  pelota recorre arco parabólico hacia arriba-derecha
     *                  con spin sobre su eje Y. Como sale de pantalla por
     *                  la derecha (x=+6.5), nunca "se queda" en el cuadro.
     *   t=0.55s   la pelota ya está fuera del frame; fin de la animación
     *   t=0.55–0.80s  fade-out del canvas (transparente) sobre el contenido
     *   t=0.80s  onClose()
     *
     * Robustez (mismo patrón que PwaIntro.svelte):
     *   - WebGL no disponible → log + onClose() inmediato, sin canvas
     *   - `prefers-reduced-motion: reduce` → sin canvas, onClose() inmediato
     *   - `webglcontextlost` → warning + onClose()
     *   - `onDestroy` libera renderer, geometrías, materiales, atributos
     *     instanciados y listeners. Guard con `disposed` para idempotencia.
     *
     * @typedef {Object} Props
     * @property {boolean} [open]            Si false, el componente no monta
     *                                       el canvas (cheap unmount).
     * @property {string}  [triggerKey]      Step al que está asociada esta
     *                                       reproducción (p.ej. 'ranking').
     *                                       Se usa para llamar a markGoalSeen
     *                                       cuando termina, así no se repite
     *                                       en la misma sesión.
     * @property {() => void} [onClose]      Llamado al terminar.
     */
    /** @type {Props} */
    let { open = false, triggerKey = '', onClose } = $props();

    let canvasEl = $state(/** @type {HTMLCanvasElement|null} */ (null));
    let visible = $state(false);
    let reduceMotion = false;

    /** @type {THREE.WebGLRenderer|null} */
    let renderer = null;
    /** @type {THREE.Scene|null} */
    let scene = null;
    /** @type {THREE.PerspectiveCamera|null} */
    let camera = null;
    /** @type {THREE.Mesh|null} */
    let ball = null;
    /** @type {THREE.MeshStandardMaterial|THREE.ShaderMaterial|null} */
    let ballMat = null;
    /** @type {THREE.Texture|null} */
    let ballTexture = null;
    /** @type {THREE.BufferGeometry|null} */
    let ballGeom = null;
    /** @type {THREE.Group|null} */
    let ballGroup = null;

    let rafId = /** @type {number|null} */ (null);
    let closeTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
    let resizeHandler = /** @type {(() => void)|null} */ (null);
    let contextLostHandler = /** @type {((e: Event) => void)|null} */ (null);
    let disposed = false;
    let playStarted = false;
    let playFinished = false;
    let startedAt = 0;

    // ---- Constantes de animación (todas tunables arriba del archivo) ---
    const ARC_DURATION = 0.55;    // s, duración del vuelo de la pelota
    const TOTAL_DURATION = 0.55;  // s, fin de la animación lógica
                                  // (igual a ARC_DURATION: la pelota sale
                                  // de pantalla y no hay más render)
    const POST_TOTAL_FADE = 0.25; // s, fade-out del canvas después de la pelota
    // Posiciones en world-space. Cámara mira a (0,0,0) desde (0,0,8) con fov 50.
    // Con fov 50, el viewport "visible" a z=0 es ±~3.7 unidades vertical y
    // ±~6.6 horizontal en 16:9. BALL_END está MÁS ALLÁ del borde derecho
    // para que la pelota salga de pantalla y desaparezca por el borde.
    const BALL_START = new THREE.Vector3(-6.5, -2.6, 0);
    const BALL_END   = new THREE.Vector3( 6.5,  2.6, 0);
    const BALL_CTRL  = new THREE.Vector3(-0.2,  3.2, 0); // control point (arriba)

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
        // Limpiar geometrías y materiales
        if (ballGeom) ballGeom.dispose();
        if (ballMat) ballMat.dispose();
        if (ballTexture) {
            ballTexture.dispose();
            ballTexture = null;
        }
        // Limpiar objetos de la escena
        if (scene) {
            scene.traverse(/** @param {any} obj */ (obj) => {
                if (obj.isMesh || obj.isPoints || obj.isLineSegments) {
                    obj.parent?.remove(obj);
                }
            });
        }
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null;
        camera = null;
        ball = null;
        ballGroup = null;
    }

    onDestroy(dispose);

    /**
     * @returns {Promise<boolean>} true si construyó la escena OK; false si
     *   WebGL no disponible o la textura no cargó (en cuyo caso usa el
     *   shader procedural como fallback).
     */
    async function buildScene() {
        if (!canvasEl) return false;
        const canvas = canvasEl;

        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        } catch (e) {
            console.error('[GoalOverlay] WebGL no disponible:', e);
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.setClearColor(0x000000, 0); // transparente

        scene = new THREE.Scene();
        const aspect = window.innerWidth / window.innerHeight;
        camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);

        // ---- Iluminación -------------------------------------------------
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(4, 6, 5);
        scene.add(dir);

        // ---- Pelota (textura de public/balon.png, con fallback shader) ---
        // Geometría: misma esfera que la versión procedural anterior.
        ballGeom = new THREE.SphereGeometry(0.42, 32, 24);

        // Cargar textura async. Si falla, fallback al ShaderMaterial procedural.
        let useTexture = false;
        try {
            const url = `${import.meta.env.BASE_URL}balon.png`;
            ballTexture = await new THREE.TextureLoader().loadAsync(url);
            ballTexture.colorSpace = THREE.SRGBColorSpace;
            ballTexture.anisotropy = 4; // nitidez en ángulos oblicuos
            useTexture = true;
            console.log('[GoalOverlay] Textura de balón cargada:', url);
        } catch (e) {
            console.warn('[GoalOverlay] No pude cargar balon.png, fallback a shader procedural:', e);
            ballTexture = null;
        }

        if (useTexture && ballTexture) {
            ballMat = new THREE.MeshStandardMaterial({
                map: ballTexture,
                roughness: 0.4,
                metalness: 0.05,
                // `transparent: false` (con alphaTest > 0) descarta píxeles
                // semi-transparentes y renderiza el resto completamente
                // opaco. Sin esto, los píxeles con anti-aliasing del borde
                // del PNG se mezclan con el fondo y dejan ver la red de la
                // portería (que está justo detrás de la pelota).
                transparent: false,
                alphaTest: 0.5,
                side: THREE.FrontSide
            });
        } else {
            // Fallback: shader procedural de pentágonos (mismo código que
            // la versión anterior — se preserva por si el PNG no está
            // disponible, ej. en dev con vite sirviendo sólo lo importado).
            ballMat = new THREE.ShaderMaterial({
                uniforms: {
                    uLightDir: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() }
                },
                vertexShader: [
                    'varying vec3 vNormal;',
                    'varying vec3 vWorldPos;',
                    'void main() {',
                    '  vNormal = normalize(normalMatrix * normal);',
                    '  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
                    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                    '}'
                ].join('\n'),
                fragmentShader: [
                    'varying vec3 vNormal;',
                    'uniform vec3 uLightDir;',
                    'void main() {',
                    '  vec3 p = normalize(vNormal);',
                    '  float k = sin(p.x * 6.0) * sin(p.y * 6.0) * sin(p.z * 6.0);',
                    '  float panel = smoothstep(0.30, 0.35, k);',
                    '  vec3 base = mix(vec3(1.0), vec3(0.05, 0.05, 0.08), panel);',
                    '  float diff = max(dot(vNormal, uLightDir), 0.0);',
                    '  vec3 col = base * (0.45 + 0.55 * diff);',
                    '  float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);',
                    '  col += vec3(0.4, 0.6, 0.8) * rim * 0.35;',
                    '  gl_FragColor = vec4(col, 1.0);',
                    '}'
                ].join('\n')
            });
        }

        ball = new THREE.Mesh(ballGeom, ballMat);
        ballGroup = new THREE.Group();
        ballGroup.add(ball);
        ballGroup.position.copy(BALL_START);
        scene.add(ballGroup);

        resizeHandler = () => {
            if (!renderer || !camera) return;
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', resizeHandler);

        contextLostHandler = () => {
            console.warn('[GoalOverlay] WebGL context lost — abortando.');
            if (!disposed) onClose?.();
        };
        canvas.addEventListener('webglcontextlost', contextLostHandler);

        return true;
    }

    /**
     * Animación por frame. Usa `performance.now()` como base para que
     * sea monotónica y resistente a throttling de pestaña.
     * @param {number} startMs
     */
    function startLoop(startMs) {
        function loop() {
            if (disposed || !renderer || !scene || !camera) return;
            const now = performance.now();
            const t = (now - startMs) / 1000; // segundos desde el inicio

            // ---- Posición de la pelota ----------------------------------
            // El balón recorre un arco cuadrático de Bézier de BALL_START
            // (fuera de pantalla, abajo-izquierda) a BALL_END (fuera de
            // pantalla, arriba-derecha). Como ambos extremos están más
            // allá de los bordes, la pelota "pasa derecho" y desaparece
            // por la derecha sin que la veamos quedarse.
            if (ballGroup && t < ARC_DURATION) {
                const u = t / ARC_DURATION; // 0..1 a lo largo del arco
                const x = (1 - u) * (1 - u) * BALL_START.x + 2 * (1 - u) * u * BALL_CTRL.x + u * u * BALL_END.x;
                const y = (1 - u) * (1 - u) * BALL_START.y + 2 * (1 - u) * u * BALL_CTRL.y + u * u * BALL_END.y;
                const z = (1 - u) * (1 - u) * BALL_START.z + 2 * (1 - u) * u * BALL_CTRL.z + u * u * BALL_END.z;
                ballGroup.position.set(x, y, z);
                if (ball) {
                    ball.rotation.y -= 0.32;
                    ball.rotation.x += 0.08;
                }
            }

            renderer.render(scene, camera);

            if (t < TOTAL_DURATION + POST_TOTAL_FADE) {
                rafId = requestAnimationFrame(loop);
            } else {
                rafId = null;
                // Marcar como visto al terminar (idempotente, paso en sessionStorage).
                if (!playFinished) {
                    playFinished = true;
                    console.log(`[GoalOverlay] step=${triggerKey || '(none)'} terminado`);
                    if (triggerKey) markGoalSeen(triggerKey);
                    onClose?.();
                }
            }
        }
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (playStarted || disposed) return;
        playStarted = true;
        visible = true;
        const startMs = performance.now();
        startedAt = startMs;
        startLoop(startMs);
    }

    // Reaccionar al cambio de `open`. Si pasa de false a true, construir la
    // escena (si no lo estaba ya) y arrancar.
    let mounted = false;
    $effect(() => {
        if (!open || reduceMotion) {
            // Cerrado o no-motion: no-op
            return;
        }
        if (!mounted) {
            mounted = true;
            // Verificar WebGL construyendo la escena (async porque carga
            // la textura de public/balon.png).
            (async () => {
                const ok = await buildScene();
                if (!ok) {
                    onClose?.();
                    return;
                }
                playFinished = false;
                start();
            })();
            return;
        }
        // Reset del flag de terminado por si se reusa el overlay
        playFinished = false;
        start();
    });

    onMount(() => {
        // Accesibilidad: respetar prefers-reduced-motion.
        const mq = typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
        if (mq?.matches) {
            reduceMotion = true;
            // No animar; cerrar inmediatamente.
            onClose?.();
        }
    });
</script>

<canvas
    bind:this={canvasEl}
    class="goal-canvas"
    class:visible
    aria-hidden="true"
></canvas>

<style>
    .goal-canvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 50;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease-out;
        display: block;
    }
    .goal-canvas.visible {
        opacity: 1;
    }
    @media (prefers-reduced-motion: reduce) {
        .goal-canvas {
            display: none !important;
        }
    }
</style>
