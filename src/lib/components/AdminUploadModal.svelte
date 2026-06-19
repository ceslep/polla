<script>
    /** @type {{ onConfirm: (file: File) => void, onClose: () => void }} */
    let { onConfirm, onClose } = $props();

    let fileInput = $state(/** @type {HTMLInputElement | null} */ (null));
    let selectedFile = $state(/** @type {File | null} */ (null));
    let error = $state('');

    function handleFileChange(/** @type {Event} */ e) {
        const input = /** @type {HTMLInputElement} */ (e.target);
        const file = input.files?.[0] || null;
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            error = 'Solo se permiten archivos .json';
            selectedFile = null;
            return;
        }

        error = '';
        selectedFile = file;
    }

    function handleSubmit() {
        if (!selectedFile) {
            error = 'Selecciona un archivo JSON';
            return;
        }
        onConfirm(selectedFile);
    }

    function handleKeydown(/** @type {KeyboardEvent} */ e) {
        if (e.key === 'Escape') onClose();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
            <h2 class="text-xl font-bold text-cyan-400 flex items-center gap-2">
                <span>📁</span> Cargar Archivo JSON
            </h2>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-8 space-y-6">
            <p class="text-gray-300 text-center">Selecciona un archivo JSON con apuestas para fusionar.</p>

            <div class="space-y-2">
                <input
                    type="file"
                    accept=".json"
                    class="hidden"
                    bind:this={fileInput}
                    onchange={handleFileChange}
                />
                <button
                    class="w-full px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2 min-h-11"
                    onclick={() => fileInput?.click()}
                >
                    {#if selectedFile}
                        <span class="text-green-400">✓</span> {selectedFile.name}
                    {:else}
                        <span>📂</span> Seleccionar archivo...
                    {/if}
                </button>

                {#if error}
                    <p class="text-red-400 text-sm text-center font-medium animate-pulse">{error}</p>
                {/if}
            </div>

            <div class="flex gap-3 pt-2">
                <button
                    class="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all min-h-11"
                    onclick={onClose}
                >
                    Cancelar
                </button>
                <button
                    class="flex-1 px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-900/20 transition-all min-h-11 disabled:opacity-50"
                    onclick={handleSubmit}
                    disabled={!selectedFile}
                >
                    Cargar y Guardar
                </button>
            </div>
        </div>
    </div>
</div>
