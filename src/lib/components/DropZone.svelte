<script>
    import { appState } from '../stores.svelte.js';
    import { parseWhatsAppExport } from '../parser.js';

    let isDragOver = $state(false);
    let isLoading = $state(false);

    /** @param {File} file */
    function handleFile(file) {
        if (!file || !file.name.endsWith('.json')) {
            alert('Por favor carga un archivo JSON válido');
            return;
        }

        isLoading = true;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const result = e.target?.result;
                if (!result || typeof result !== 'string') {
                    alert('Error al leer el archivo');
                    isLoading = false;
                    return;
                }
                const data = JSON.parse(result);
                const messages = Array.isArray(data) ? data : data.messages || [];
                const bets = parseWhatsAppExport(data);

                console.log(`Parsed ${messages.length} messages, found ${bets.length} bets`);

                if (bets.length === 0) {
                    alert(`No se encontraron apuestas.\n\nMensajes en archivo: ${messages.length}\nRevisa la consola para más detalles.`);
                    isLoading = false;
                    return;
                }

                appState.bets = bets;
                localStorage.setItem('polla_bets', JSON.stringify(bets));
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Error desconocido';
                alert('Error al leer el archivo: ' + message);
            } finally {
                isLoading = false;
            }
        };
        reader.readAsText(file);
    }

    /** @param {DragEvent} e */
    function onDrop(e) {
        e.preventDefault();
        isDragOver = false;
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    }
</script>

<div
    class="flex flex-col items-center justify-center p-12 border-4 border-dashed rounded-3xl transition-all cursor-pointer
    {isDragOver ? 'bg-cyan-500/10 border-cyan-400 scale-105' : 'bg-white/5 border-cyan-500/50 hover:bg-white/10'}"
    role="button"
    tabindex="0"
    ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
    ondragleave={() => isDragOver = false}
    ondrop={onDrop}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('fileInput')?.click(); }}
    onclick={() => !isLoading && document.getElementById('fileInput')?.click()}
>
    {#if isLoading}
        <div class="text-6xl mb-6 animate-spin">⚙️</div>
        <h2 class="text-2xl font-bold text-cyan-400 mb-2">Procesando...</h2>
        <p class="text-gray-400">Extrayendo apuestas de tus mensajes</p>
    {:else}
        <div class="text-6xl mb-6">📂</div>
        <h2 class="text-2xl font-bold text-cyan-400 mb-2">Arrastra tu archivo aquí</h2>
        <p class="text-gray-400">o haz clic para seleccionar (JSON de WhatsApp)</p>
    {/if}

    <input
        type="file"
        id="fileInput"
        class="hidden"
        accept=".json"
        onchange={(e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            if (target.files?.[0]) handleFile(target.files[0]);
        }}
    />
</div>
