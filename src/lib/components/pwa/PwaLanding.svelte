<script>
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import { promptInstall, dismissIosHint, getInstallState } from '../../pwa/install.svelte.js';

    /** @type {{ state: any, isDev?: boolean, devTestDate?: string }} */
    let { state: windowState, isDev = false, devTestDate = '' } = $props();

    const installState = getInstallState();

    const isWindowOpen = $derived(windowState?.status === 'open');
    // En dev mode el botón siempre se puede pulsar aunque la ventana esté cerrada.
    const canBet = $derived(isDev || isWindowOpen);

    function goRank() {
        setStep('ranking');
    }

    function goResults() {
        setStep('results');
    }

    function goMovement() {
        setStep('movement');
    }

    function goBet() {
        if (!canBet) return;
        setStep('login');
    }

    function goTutorial() {
        setStep('tutorial');
    }

    /** Abre/cierra el modal con instrucciones manuales de instalación. */
    let showManualInstall = $state(false);
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

        <div class="space-y-3">
            <!-- Tutorial (público, sin login) -->
            <button
                class="w-full glass hover:bg-white/10 rounded-3xl text-left px-6 py-5 transition-all min-h-16 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                onclick={goTutorial}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110">📖</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">¿Cómo funciona?</div>
                        <div class="text-xs text-gray-400">Tutorial paso a paso</div>
                    </div>
                    <div class="text-2xl text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all">→</div>
                </div>
            </button>

            <!-- Ver ranking (público) -->
            <button
                class="w-full glass hover:bg-white/10 rounded-3xl text-left px-6 py-5 transition-all min-h-16 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                onclick={goRank}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110">📊</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">Ver ranking</div>
                        <div class="text-xs text-gray-400">No requiere iniciar sesión</div>
                    </div>
                    <div class="text-2xl text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all">→</div>
                </div>
            </button>

            <!-- Resultados del mundial (público) -->
            <button
                class="w-full glass hover:bg-white/10 rounded-3xl text-left px-6 py-5 transition-all min-h-16 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                onclick={goResults}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110">🌍</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">Resultados del mundial</div>
                        <div class="text-xs text-gray-400">Partidos, goleadores y posiciones</div>
                    </div>
                    <div class="text-2xl text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all">→</div>
                </div>
            </button>

            <!-- Movimiento de puestos (público) -->
            <button
                class="w-full glass hover:bg-white/10 rounded-3xl text-left px-6 py-5 transition-all min-h-16 group hover:-translate-y-0.5 hover:shadow-xl hover:shadow-white/5"
                onclick={goMovement}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110">📈</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">Movimiento de puestos</div>
                        <div class="text-xs text-gray-400">Quiénes subieron y bajaron</div>
                    </div>
                    <div class="text-2xl text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all">→</div>
                </div>
            </button>

            <!-- Realizar apuesta -->
            <button
                class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-3xl text-left px-6 py-5 transition-all min-h-16 shadow-xl shadow-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed group hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-emerald-500/30 disabled:hover:translate-y-0"
                onclick={goBet}
                disabled={!canBet}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl transition-transform group-hover:scale-110">✏️</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">
                            {#if isDev}
                                Realizar apuesta (DEV)
                            {:else}
                                Realizar apuesta
                            {/if}
                        </div>
                        <div class="text-xs text-emerald-50/90">
                            {#if isDev}
                                Modo pruebas — usa partidos del día más cercano
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
                    <div class="text-2xl group-hover:translate-x-1 transition-transform">→</div>
                </div>
            </button>
        </div>

        <div class="text-center mt-8 space-y-2">
            <a href="#/" class="text-gray-500 hover:text-gray-300 text-sm underline block">
                ← Volver a la app principal
            </a>
            {#if !installState.installed}
                <button
                    type="button"
                    onclick={() => showManualInstall = true}
                    class="text-gray-500 hover:text-gray-300 text-sm underline"
                >
                    📲 ¿Cómo instalar la app?
                </button>
            {/if}
        </div>
    </div>

    <!-- Botón flotante: instalar PWA (Chrome/Edge/Desktop) -->
    {#if installState.canShowNative && !installState.installed}
        <button
            type="button"
            class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold shadow-2xl shadow-emerald-500/40 animate-slide-up flex items-center gap-2 max-w-[calc(100vw-2rem)]"
            onclick={promptInstall}
            aria-label="Instalar la app en tu dispositivo"
        >
            <span class="text-xl">📲</span>
            <span>Instalar app</span>
        </button>
    {/if}

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
</div>
