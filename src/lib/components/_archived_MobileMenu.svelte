<script>
    /** @type {{onResetAll?: () => void, onAnalyze?: () => void, onRefresh?: () => void, onStats?: () => void, onMovement?: () => void, onMalformed?: () => void, isOpen?: boolean, isLoading?: boolean, isSavingToSheets?: boolean, hasBets?: boolean}} */
    let {
        isOpen = $bindable(false),
        onResetAll = () => {},
        onAnalyze = () => {},
        onRefresh = () => {},
        onStats = () => {},
        onMovement = () => {},
        onMalformed = () => {},
        isLoading = false,
        isSavingToSheets = false,
        hasBets = false
    } = $props();

    /** @param {() => void} action */
    function handleAction(action) {
        isOpen = false;
        action();
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 md:hidden">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={() => isOpen = false}></div>
        <div class="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-white/10 rounded-t-3xl p-6 pb-8 max-h-[80vh] overflow-y-auto">
            <div class="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6"></div>
            <h3 class="text-lg font-bold text-white mb-6 text-center">Menú</h3>
            <div class="space-y-3">
                {#if hasBets}
                    <button
                        class="w-full py-4 px-6 bg-purple-600 hover:bg-purple-500 rounded-2xl text-white font-bold transition-all flex items-center justify-center gap-3 text-lg"
                        onclick={() => handleAction(onStats)}
                    >
                        <span class="text-2xl">📊</span>
                        Estadísticas
                    </button>
                    <button
                        class="w-full py-4 px-6 bg-pink-600 hover:bg-pink-500 rounded-2xl text-white font-bold transition-all flex items-center justify-center gap-3 text-lg"
                        onclick={() => handleAction(onMovement)}
                    >
                        <span class="text-2xl">📈</span>
                        Movimiento
                    </button>
                    <button
                        class="w-full py-4 px-6 bg-amber-600/20 hover:bg-amber-600/30 rounded-2xl text-amber-300 font-semibold transition-all flex items-center justify-center gap-3 text-lg border border-amber-500/30"
                        onclick={() => handleAction(onMalformed)}
                    >
                        <span class="text-2xl">⚠️</span>
                        Formato dudoso
                    </button>
                    <button
                        class="w-full py-4 px-6 bg-orange-600 hover:bg-orange-500 rounded-2xl text-white font-bold transition-all flex items-center justify-center gap-3 text-lg"
                        onclick={() => handleAction(onAnalyze)}
                        disabled={isLoading}
                    >
                        <span class="text-2xl">🔗</span>
                        {isLoading ? 'Analizando...' : 'Analizar con GitHub'}
                    </button>
                    <button
                        class="w-full py-4 px-6 bg-cyan-600/20 hover:bg-cyan-600/30 rounded-2xl text-cyan-300 font-semibold transition-all flex items-center justify-center gap-3 text-lg border border-cyan-500/30"
                        onclick={() => handleAction(onRefresh)}
                        disabled={isLoading || isSavingToSheets}
                    >
                        {#if isSavingToSheets}
                            <div class="w-5 h-5 border-2 border-cyan-300/30 border-t-cyan-300 rounded-full animate-spin"></div>
                            Actualizando...
                        {:else}
                            <span class="text-2xl">🔄</span>
                            Recargar desde Sheets
                        {/if}
                    </button>
                    <button
                        class="w-full py-4 px-6 bg-red-600/20 hover:bg-red-600/30 rounded-2xl text-red-400 font-semibold transition-all flex items-center justify-center gap-3 text-lg border border-red-500/30"
                        onclick={() => handleAction(onResetAll)}
                    >
                        <span class="text-2xl">⚠️</span>
                        Reset Total
                    </button>
                {:else}
                    <p class="text-center text-gray-400 py-8">Carga apuestas para ver más opciones</p>
                {/if}
            </div>
        </div>
    </div>
{/if}
