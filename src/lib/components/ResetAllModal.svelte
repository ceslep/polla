<script>
    /** @type {{ onConfirm: () => void, onClose: () => void }} */
    let { onConfirm, onClose } = $props();

    function handleConfirm() {
        onConfirm();
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Escape') onClose();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 border border-red-500/30 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-red-500/30 flex justify-between items-center bg-red-500/10">
            <h2 class="text-xl font-bold text-red-400 flex items-center gap-2">
                <span>⚠️</span> Reset Total
            </h2>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-8 space-y-6">
            <div class="text-center space-y-4">
                <div class="text-5xl">🗑️</div>
                <p class="text-white text-lg font-medium">¿Estás seguro de que deseas hacer un <span class="text-red-400 font-bold">Reset Total</span>?</p>
            </div>

            <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-2">
                <p class="text-red-300 text-sm font-semibold">Esta acción eliminará:</p>
                <ul class="text-gray-300 text-sm space-y-1">
                    <li class="flex items-center gap-2"><span class="text-red-400">•</span> Todas las apuestas en Google Sheets</li>
                    <li class="flex items-center gap-2"><span class="text-red-400">•</span> Todas las apuestas cargadas en la vista</li>
                </ul>
            </div>

            <p class="text-gray-400 text-sm text-center">Después podrás cargar un archivo JSON completo para empezar de cero.</p>

            <div class="flex gap-3 pt-2">
                <button
                    class="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all min-h-11"
                    onclick={onClose}
                >
                    Cancelar
                </button>
                <button
                    class="flex-1 px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/20 transition-all min-h-11"
                    onclick={handleConfirm}
                >
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>
