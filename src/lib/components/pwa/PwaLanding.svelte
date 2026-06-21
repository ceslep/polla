<script>
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';

    /** @type {{ state: any, isDev?: boolean }} */
    let { state, isDev = false } = $props();

    const isWindowOpen = $derived(state?.status === 'open');

    function goRank() {
        setStep('ranking');
    }

    function goBet() {
        if (!isWindowOpen) return;
        setStep('login');
    }

    /** @param {string|null|undefined} iso */
    function formatLocal(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-md">
        <div class="text-center mb-8">
            <div class="text-5xl mb-3">⚽</div>
            <h1 class="text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic tracking-tighter">
                POLLA 2026
            </h1>
            <p class="text-gray-400 mt-2">Apuesta los marcadores del día</p>
        </div>

        {#if isDev}
            <div class="mb-4 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-xs text-center font-medium">
                ⚙️ DEV MODE — login automático con credenciales dummy
            </div>
        {/if}

        <!-- Estado de la ventana -->
        <div class="mb-6 text-center">
            {#if state?.status === 'open'}
                <div class="inline-flex items-center gap-2 bg-green-500/15 border border-green-500/40 rounded-full px-4 py-1.5 text-green-300 text-sm font-medium">
                    <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    Apuestas abiertas · cierran {state.firstMatchLocalTime} (hora Colombia)
                </div>
            {:else if state?.status === 'closed'}
                <div class="inline-flex items-center gap-2 bg-red-500/15 border border-red-500/40 rounded-full px-4 py-1.5 text-red-300 text-sm font-medium">
                    🔒 Ventana cerrada
                </div>
            {:else if state?.status === 'upcoming'}
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
            <!-- Ver ranking (público) -->
            <button
                class="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-left px-6 transition-all min-h-16 group"
                onclick={goRank}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl">📊</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">Ver ranking</div>
                        <div class="text-xs text-gray-400">No requiere iniciar sesión</div>
                    </div>
                    <div class="text-2xl text-gray-500 group-hover:text-white transition-all">→</div>
                </div>
            </button>

            <!-- Realizar apuesta (requiere login, sólo si ventana abierta) -->
            <button
                class="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-left px-6 transition-all min-h-16 shadow-lg shadow-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:from-cyan-500 disabled:hover:to-blue-500"
                onclick={goBet}
                disabled={!isWindowOpen}
            >
                <div class="flex items-center gap-4">
                    <div class="text-4xl">✏️</div>
                    <div class="flex-1">
                        <div class="font-black text-lg">Realizar apuesta</div>
                        <div class="text-xs text-cyan-100/80">
                            {#if isWindowOpen}
                                Inicia sesión con tu celular
                            {:else if state?.status === 'upcoming'}
                                Disponible cuando abra la ventana
                            {:else if state?.status === 'closed'}
                                La ventana de hoy ya cerró
                            {:else}
                                No hay partidos próximos
                            {/if}
                        </div>
                    </div>
                    <div class="text-2xl">→</div>
                </div>
            </button>
        </div>

        <div class="text-center mt-8">
            <a href="#/" class="text-gray-500 hover:text-gray-300 text-sm underline">
                ← Volver a la app principal
            </a>
        </div>
    </div>
</div>
