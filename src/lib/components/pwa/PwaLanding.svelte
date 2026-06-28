<script>
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import { dismissIosHint, getInstallState } from '../../pwa/install.svelte.js';
    import PwaShareBets from './PwaShareBets.svelte';
    import GoalsAnalysisModal from './GoalsAnalysisModal.svelte';
    import UpdateToast from './UpdateToast.svelte';

    /**
     * @typedef {import('svelte/store').Writable<boolean>} BoolStore
     * @typedef {Object} Props
     * @property {any} state
     * @property {boolean} [isDev]
     * @property {string} [devTestDate]
     * @property {any[]} [bets]
     * @property {{ required: boolean, firstMatchHHMM: string | null }} [preMatchInfo]
     * @property {string} [todayDate]
     * @property {BoolStore} [needRefresh]   - store de useRegisterSW (App.svelte)
     * @property {BoolStore} [offlineReady] - store de useRegisterSW (App.svelte)
     * @property {() => void} [onSquads]
     * @property {() => void} [onCountdownZero] - se dispara una vez cuando el cronómetro llega a cero
     */
    /** @type {Props} */
    let {
        state: windowState,
        isDev = false,
        devTestDate = '',
        bets = [],
        preMatchInfo = { required: false, firstMatchHHMM: null },
        todayDate = '',
        needRefresh,
        offlineReady,
        onSquads = () => {},
        onCountdownZero = () => {}
    } = $props();

    const installState = getInstallState();

    const isWindowOpen = $derived(windowState?.status === 'open');
    // En dev mode el botón siempre se puede pulsar aunque la ventana esté cerrada.
    const canBet = $derived(isDev || isWindowOpen);

    /** True si hay al menos una apuesta de tipo score para `todayDate`. */
    const hasShareableBets = $derived.by(() => {
        for (const b of bets) {
            if (b.type === 'score' && b.matchDate === todayDate && b.participant) return true;
        }
        return false;
    });

    function goRank() {
        setStep('ranking');
    }

    function goRank2() {
        setStep('ranking2');
    }

    function goTodayBets() {
        setStep('today-bets');
    }

    function goResults() {
        setStep('results');
    }

    function goMovement() {
        setStep('movement');
    }

    function goSquads() {
        onSquads();
    }

    function goBet() {
        if (!canBet) return;
        setStep('login');
    }

    function goShare() {
        showShareModal = true;
    }

    function goGoals() {
        showGoalsModal = true;
    }

    /** Abre/cierra el modal con instrucciones manuales de instalación. */
    let showManualInstall = $state(false);
    /** Abre/cierra el modal de mensaje para WhatsApp. */
    let showShareModal = $state(false);
    /** Abre/cierra el modal de análisis de goles. */
    let showGoalsModal = $state(false);

    // ---- Búsqueda manual de actualizaciones --------------------------

    let checkingUpdate = $state(false);
    /** @type {string} */
    let toastMessage = $state('');
    /** @type {'info' | 'success' | 'error'} */
    let toastVariant = $state('info');

    /**
     * Fuerza la verificación de updates contra el servidor. Útil cuando
     * el usuario sospecha que hay una nueva versión pero el chequeo
     * automático (60min + visibilitychange) no la detectó aún.
     */
    async function checkForUpdates() {
        if (checkingUpdate) return;
        checkingUpdate = true;
        toastMessage = '';
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            await reg?.update();
            // El SW puede tardar 1-2s en procesar la respuesta y actualizar
            // el store `needRefresh`. Esperamos un momento antes de chequear.
            await new Promise((r) => setTimeout(r, 1500));
            if (needRefresh && $needRefresh) {
                toastMessage = 'Nueva versión encontrada. Actualizá desde el banner.';
                toastVariant = 'info';
            } else {
                toastMessage = `Estás al día (v${__APP_VERSION__}).`;
                toastVariant = 'success';
            }
        } catch (e) {
            console.warn('[PwaLanding] checkForUpdates error:', e);
            toastMessage = 'No se pudo verificar. Revisá tu conexión y reintentá.';
            toastVariant = 'error';
        } finally {
            checkingUpdate = false;
        }
    }

    function closeToast() {
        toastMessage = '';
    }

    // ---- Countdown elegante hasta apertura/cierre de ventana -----------

    const COT_TZ = 'America/Bogota';

    /** @param {number} n */
    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    /** @param {number} ms */
    function formatCountdown(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
    }

    /** @param {string|null|undefined} iso */
    function formatCotDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const fmtDate = new Intl.DateTimeFormat('es-CO', {
            timeZone: COT_TZ, day: 'numeric', month: 'short'
        });
        const fmtTime = new Intl.DateTimeFormat('en-GB', {
            timeZone: COT_TZ, hour: '2-digit', minute: '2-digit', hour12: false
        });
        return `${fmtDate.format(d)} · ${fmtTime.format(d)}`;
    }

    function resolveCountdownTarget() {
        if (windowState?.status === 'open') return windowState.closeAt;
        if (windowState?.status === 'closed') return windowState.nextOpenAt;
        if (windowState?.status === 'upcoming') return windowState.openAt;
        return null;
    }

    const countdownTarget = $derived.by(() => {
        if (windowState?.status === 'open') return windowState.closeAt;
        if (windowState?.status === 'closed') return windowState.nextOpenAt;
        if (windowState?.status === 'upcoming') return windowState.openAt;
        return null;
    });

    const countdownMeta = $derived.by(() => {
        if (windowState?.status === 'open') {
            return {
                label: 'La ventana cierra en',
                dotColor: 'bg-emerald-400',
                borderClass: 'from-emerald-500 to-cyan-500',
                digitClass: 'text-emerald-400'
            };
        }
        return {
            label: 'La ventana abre en',
            dotColor: 'bg-red-400',
            borderClass: 'from-red-500 to-orange-500',
            digitClass: 'text-red-400'
        };
    });

    let countdownText = $state(formatCountdown(new Date(resolveCountdownTarget() || 0).getTime() - Date.now()));
    /** Evita disparar onCountdownZero más de una vez por el mismo target. */
    let countdownZeroFired = $state(false);

    $effect(() => {
        const target = countdownTarget;
        countdownZeroFired = false;
        if (!target) {
            countdownText = '';
            return;
        }
        const targetMs = new Date(target).getTime();
        function tick() {
            const remaining = targetMs - Date.now();
            countdownText = formatCountdown(remaining);
            if (remaining <= 0 && !countdownZeroFired) {
                countdownZeroFired = true;
                onCountdownZero();
            }
        }
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    });
</script>

<div class="min-h-screen relative overflow-hidden flex flex-col items-center text-white p-4 md:p-8">
    <!-- Background con radial gradient animado -->
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-40 animate-gradient"
        style="background: radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.25), transparent 50%), radial-gradient(circle at 80% 80%, rgba(6, 182, 212, 0.20), transparent 50%), radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.08), transparent 60%);"
    ></div>

    <div class="w-full max-w-md animate-fade-in">
        <!-- Hero -->
        <div class="text-center mb-8 pt-6">
            <div class="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 mb-4 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10 shadow-2xl shadow-emerald-500/10">
                <img src="./balon.png" alt="" class="w-12 h-12 md:w-14 md:h-14 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            </div>
            <h1 class="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent italic tracking-tighter">
                POLLA 2026
            </h1>
            <p class="text-gray-400 mt-2 text-sm md:text-base">Apuesta los marcadores del día</p>
        </div>

        {#if isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-xs text-center font-medium space-y-1">
                <div>⚙️ DEV MODE — ventana siempre abierta</div>
                <div class="text-amber-300/80">Fecha y hora ignoradas · login real contra gsheets</div>
                {#if devTestDate}
                    <div class="text-amber-300/80 pt-1 border-t border-amber-500/20">
                        🧪 Fecha de prueba: <span class="font-mono text-amber-200">{devTestDate}</span> (hoy)
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Estado de la ventana -->
        <div class="mb-6 text-center">
            {#if isDev}
                <div class="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/40 rounded-full px-4 py-1.5 text-amber-300 text-sm font-medium">
                    <span class="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                    DEV — ventana siempre abierta
                </div>
            {:else if windowState?.status === 'open'}
                <div class="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/40 rounded-full px-4 py-1.5 text-emerald-300 text-sm font-medium">
                    <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                    Apuestas abiertas · cierran {windowState.firstMatchLocalTime} (hora Colombia)
                </div>
            {:else if windowState?.status === 'closed'}
                <div class="inline-flex items-center gap-2 bg-red-500/15 border border-red-500/40 rounded-full px-4 py-1.5 text-red-300 text-sm font-medium">
                    🔒 Ventana cerrada
                </div>
            {:else if windowState?.status === 'upcoming'}
                <div class="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/40 rounded-full px-4 py-1.5 text-amber-300 text-sm font-medium">
                    ⏳ Próximamente
                </div>
            {:else}
                <div class="inline-flex items-center gap-2 bg-gray-500/15 border border-gray-500/40 rounded-full px-4 py-1.5 text-gray-300 text-sm font-medium">
                    📭 Sin partidos próximos
                </div>
            {/if}
        </div>

        <!-- Countdown elegante -->
        {#if countdownTarget && countdownText}
            {@const meta = countdownMeta}
            {@const targetCot = formatCotDateTime(countdownTarget)}
            <div class="mb-6" aria-live="polite">
                <div class="glass-strong rounded-3xl overflow-hidden">
                    <div class="h-1 bg-gradient-to-r {meta.borderClass}"></div>
                    <div class="p-3 text-center">
                        <div class="flex items-center justify-center gap-1.5 mb-2">
                            <span class="w-1 h-1 rounded-full {meta.dotColor} animate-pulse"></span>
                            <span class="text-[9px] uppercase tracking-[0.15em] text-gray-400 font-semibold">{meta.label}</span>
                        </div>
                        <div class="flex items-center justify-center gap-1 md:gap-1.5 font-mono tabular-nums">
                            {#each countdownText.split(':') as part, i (`countdown-${i}`)}
                                <div class="flex flex-col items-center">
                                    <div class="glass rounded-lg min-w-[2.25rem] md:min-w-[2.75rem] px-1 py-1 md:py-1.5">
                                        <span class="text-xl md:text-2xl font-black {meta.digitClass}">{part}</span>
                                    </div>
                                    <span class="mt-1 text-[8px] uppercase tracking-widest text-gray-500">
                                        {i === 0 ? 'Hrs' : i === 1 ? 'Min' : 'Seg'}
                                    </span>
                                </div>
                                {#if i < 2}
                                    <span class="text-sm md:text-base font-black {meta.digitClass} self-start mt-1 md:mt-1.5 animate-pulse">:</span>
                                {/if}
                            {/each}
                        </div>
                        {#if targetCot}
                            <div class="mt-2 text-[9px] text-gray-500">
                                {windowState?.status === 'open' ? 'Cierra' : 'Abre'} el <span class="font-medium text-gray-400">{targetCot}</span> (hora Colombia)
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <div class="space-y-4">
            <!-- Acción principal -->
            <button
                class="relative w-full overflow-hidden bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-3xl text-left px-6 py-5 transition-all min-h-20 shadow-xl shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed group hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/30 disabled:hover:translate-y-0 animate-shine"
                onclick={goBet}
                disabled={!canBet}
            >
                <div class="relative flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110" aria-hidden="true">✏️</div>
                    <div class="flex-1">
                        <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-950/70 font-black">
                            Acción principal
                        </div>
                        <div class="font-black text-xl text-white">
                            {#if isDev}
                                Realizar apuesta (DEV)
                            {:else}
                                Realizar apuesta
                            {/if}
                        </div>
                        <div class="text-xs text-emerald-50/90">
                            {#if isDev}
                                Modo pruebas · usa partidos del día más cercano
                            {:else if isWindowOpen}
                                Inicia sesión con tu celular
                            {:else if windowState?.status === 'upcoming'}
                                Disponible cuando abra la ventana
                            {:else if windowState?.status === 'closed'}
                                La ventana de hoy ya cerró
                            {:else}
                                No hay partidos próximos
                            {/if}
                        </div>
                    </div>
                    <div class="text-2xl group-hover:translate-x-1 transition-transform" aria-hidden="true">→</div>
                </div>
            </button>

            <!-- Consultas frecuentes -->
            <div class="grid grid-cols-2 gap-3">
                <button
                    class="glass hover:bg-white/10 rounded-3xl text-left p-4 transition-all min-h-28 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                    onclick={goRank}
                >
                    <div class="text-3xl mb-3 transition-transform group-hover:scale-110" aria-hidden="true">📊</div>
                    <div class="font-black text-base leading-tight">Ver ranking</div>
                    <div class="mt-1 text-[11px] text-gray-400 leading-snug">No requiere iniciar sesión</div>
                </button>

                <button
                    class="glass hover:bg-white/10 rounded-3xl text-left p-4 transition-all min-h-28 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                    onclick={goRank2}
                >
                    <div class="text-3xl mb-3 transition-transform group-hover:scale-110" aria-hidden="true">📈</div>
                    <div class="font-black text-base leading-tight">Ranking Parte 2</div>
                    <div class="mt-1 text-[11px] text-gray-400 leading-snug">Segunda fase del torneo</div>
                </button>

                <button
                    class="glass hover:bg-white/10 rounded-3xl text-left p-4 transition-all min-h-28 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                    onclick={goTodayBets}
                >
                    <div class="text-3xl mb-3 transition-transform group-hover:scale-110" aria-hidden="true">📅</div>
                    <div class="font-black text-base leading-tight">Apuestas de hoy</div>
                    <div class="mt-1 text-[11px] text-gray-400 leading-snug">Cómo van ganando</div>
                </button>

                <button
                    class="glass hover:bg-white/10 rounded-3xl text-left p-4 transition-all min-h-28 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                    onclick={goResults}
                >
                    <div class="text-3xl mb-3 transition-transform group-hover:scale-110" aria-hidden="true">🌍</div>
                    <div class="font-black text-base leading-tight">Resultados</div>
                    <div class="mt-1 text-[11px] text-gray-400 leading-snug">Partidos y posiciones</div>
                </button>

                <button
                    class="glass hover:bg-white/10 rounded-3xl text-left p-4 transition-all min-h-28 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                    onclick={goMovement}
                >
                    <div class="text-3xl mb-3 transition-transform group-hover:scale-110" aria-hidden="true">📈</div>
                    <div class="font-black text-base leading-tight">Movimiento</div>
                    <div class="mt-1 text-[11px] text-gray-400 leading-snug">Subidas y bajadas</div>
                </button>
            </div>

            <!-- Herramientas secundarias -->
            <div class="glass rounded-3xl p-3 space-y-2">
                <div class="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-gray-500 font-black">
                    Más herramientas
                </div>

                <button
                    class="w-full hover:bg-white/10 rounded-2xl text-left px-3 py-3 transition-all group disabled:opacity-35 disabled:cursor-not-allowed"
                    onclick={goShare}
                    disabled={!hasShareableBets}
                    title={hasShareableBets ? 'Generar mensaje para pegar en el grupo de WhatsApp' : 'Aún no hay apuestas para hoy'}
                    data-pwa-tutorial="share-card"
                >
                    <div class="flex items-center gap-3">
                        <div class="text-2xl transition-transform group-hover:scale-110" aria-hidden="true">📤</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm">Mensaje para WhatsApp</div>
                            <div class="text-[11px] text-gray-400 truncate">
                                {#if hasShareableBets}
                                    Pega las apuestas de hoy en el grupo
                                {:else}
                                    Todavía no hay apuestas de hoy
                                {/if}
                            </div>
                        </div>
                        <div class="text-gray-500 group-hover:text-white transition-colors" aria-hidden="true">→</div>
                    </div>
                </button>

                <div class="grid grid-cols-2 gap-2">
                    <button
                        class="hover:bg-white/10 rounded-2xl text-left px-3 py-3 transition-all group"
                        onclick={goGoals}
                    >
                        <div class="text-2xl mb-1 transition-transform group-hover:scale-110" aria-hidden="true">⚽</div>
                        <div class="font-bold text-sm leading-tight">Análisis de goles</div>
                    </button>

                    <button
                        class="hover:bg-white/10 rounded-2xl text-left px-3 py-3 transition-all group"
                        onclick={goSquads}
                    >
                        <div class="text-2xl mb-1 transition-transform group-hover:scale-110" aria-hidden="true">👕</div>
                        <div class="font-bold text-sm leading-tight">Plantillas</div>
                    </button>
                </div>
            </div>
        </div>

        <div class="text-center mt-8 space-y-2">
            {#if !installState.installed}
                <button
                    type="button"
                    onclick={() => showManualInstall = true}
                    class="text-gray-500 hover:text-gray-300 text-sm underline"
                >
                    📲 ¿Cómo instalar la app?
                </button>
            {/if}
            <button
                type="button"
                onclick={checkForUpdates}
                disabled={checkingUpdate}
                class="text-gray-500 hover:text-gray-300 text-sm underline disabled:opacity-50 disabled:cursor-wait"
            >
                {checkingUpdate ? '⏳ Buscando…' : '🔄 Buscar actualizaciones'}
            </button>
            <p class="text-gray-700 text-[10px] font-mono pt-1">Polla 2026 · v{__APP_VERSION__}</p>
        </div>
    </div>

    <!-- Toast de feedback de la verificación manual -->
    <UpdateToast message={toastMessage} variant={toastVariant} onClose={closeToast} />

    <!-- Modal iOS: instrucciones manuales (Safari no expone beforeinstallprompt) -->
    {#if installState.isIos && !installState.installed && !installState.iosDismissed}
        <div
            class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
            onclick={(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) dismissIosHint(); }}
            onkeydown={(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') dismissIosHint(); }}
            role="dialog"
            tabindex="-1"
            aria-modal="true"
            aria-labelledby="ios-install-title"
        >
            <div class="glass-strong rounded-3xl p-6 max-w-md w-full space-y-4 animate-slide-up" aria-hidden="false">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-500/40 flex items-center justify-center text-2xl">📲</div>
                    <h3 id="ios-install-title" class="text-lg font-bold text-white">Instala la app</h3>
                </div>
                <p class="text-gray-300 text-sm">
                    Para tener la polla siempre a mano en tu iPhone o iPad:
                </p>
                <ol class="space-y-3 text-sm text-gray-200">
                    <li class="flex items-start gap-3">
                        <span class="text-emerald-400 font-black text-lg shrink-0">1.</span>
                        <span>
                            Toca el botón
                            <span class="inline-flex items-center justify-center w-6 h-6 mx-1 rounded bg-white/10 text-blue-400 align-middle" aria-hidden="true">⬆</span>
                            <strong class="text-white">Compartir</strong> en la barra del navegador.
                        </span>
                    </li>
                    <li class="flex items-start gap-3">
                        <span class="text-emerald-400 font-black text-lg shrink-0">2.</span>
                        <span>Elige <strong class="text-white">Añadir a pantalla de inicio</strong> <span class="text-gray-400" aria-hidden="true">⊞</span>.</span>
                    </li>
                    <li class="flex items-start gap-3">
                        <span class="text-emerald-400 font-black text-lg shrink-0">3.</span>
                        <span>Toca <strong class="text-white">Añadir</strong>.</span>
                    </li>
                </ol>
                <button
                    type="button"
                    class="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold transition-all min-h-12"
                    onclick={dismissIosHint}
                >
                    Entendido
                </button>
            </div>
        </div>
    {/if}

    <!-- Modal: instrucciones manuales de instalación (Android/Chrome/Edge) -->
    {#if showManualInstall}
        <div
            class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
            onclick={(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) showManualInstall = false; }}
            onkeydown={(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') showManualInstall = false; }}
            role="dialog"
            tabindex="-1"
            aria-modal="true"
            aria-labelledby="manual-install-title"
        >
            <div class="glass-strong rounded-3xl p-6 max-w-md w-full space-y-4 animate-slide-up" aria-hidden="false">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-500/40 flex items-center justify-center text-2xl">📲</div>
                    <h3 id="manual-install-title" class="text-lg font-bold text-white">Instala la app</h3>
                </div>
                <p class="text-gray-300 text-sm">
                    Si el botón <strong class="text-white">"Instalar app"</strong> no aparece arriba, instala manualmente desde el menú del navegador:
                </p>
                {#if installState.isIos}
                    <ol class="space-y-3 text-sm text-gray-200">
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">1.</span>
                            <span>
                                Toca el botón
                                <span class="inline-flex items-center justify-center w-6 h-6 mx-1 rounded bg-white/10 text-blue-400 align-middle" aria-hidden="true">⬆</span>
                                <strong class="text-white">Compartir</strong> en la barra del navegador.
                            </span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">2.</span>
                            <span>Elige <strong class="text-white">Añadir a pantalla de inicio</strong> <span class="text-gray-400" aria-hidden="true">⊞</span>.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">3.</span>
                            <span>Toca <strong class="text-white">Añadir</strong>.</span>
                        </li>
                    </ol>
                {:else}
                    <ol class="space-y-3 text-sm text-gray-200">
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">1.</span>
                            <span>
                                Abre el menú del navegador
                                <span class="inline-flex items-center justify-center w-5 h-5 mx-1 rounded bg-white/10 align-middle text-xs" aria-hidden="true">⋮</span>
                                (Chrome/Edge: arriba a la derecha).
                            </span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">2.</span>
                            <span>Elige <strong class="text-white">"Instalar app"</strong> o <strong class="text-white">"Añadir a pantalla de inicio"</strong>.</span>
                        </li>
                        <li class="flex items-start gap-3">
                            <span class="text-emerald-400 font-black text-lg shrink-0">3.</span>
                            <span>Confirma con <strong class="text-white">Instalar</strong>.</span>
                        </li>
                    </ol>
                    <p class="text-xs text-gray-500 pt-2 border-t border-white/10">
                        Si el menú no muestra esa opción, abre esta URL en Chrome o Edge desktop
                        (algunos navegadores no soportan instalación de PWA).
                    </p>
                {/if}
                <button
                    type="button"
                    class="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold transition-all min-h-12"
                    onclick={() => showManualInstall = false}
                >
                    Entendido
                </button>
            </div>
        </div>
    {/if}

    <!-- Modal: mensaje para WhatsApp (genera texto de apuestas del día) -->
    {#if showShareModal}
        <PwaShareBets {bets} {todayDate} {preMatchInfo} onClose={() => showShareModal = false} />
    {/if}

    <!-- Modal: análisis de goles -->
    {#if showGoalsModal}
        <GoalsAnalysisModal onClose={() => showGoalsModal = false} />
    {/if}
</div>
