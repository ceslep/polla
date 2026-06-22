<script>
    import { appState } from '../stores.svelte.js';
    import { parseWhatsAppExport, parseManualBets } from '../parser.js';
    import { saveBetsToSheets } from '../api.js';

    let isDragOver = $state(false);
    let isLoading = $state(false);

    /** @param {File} file */
    async function handleFile(file) {
        if (!file || !file.name.endsWith('.json')) {
            alert('Por favor carga un archivo JSON válido');
            return;
        }

        isLoading = true;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const messages = Array.isArray(data) ? data : data.messages || [];
            const bets = parseWhatsAppExport(data);
            const manualBets = parseManualBets();
            const allBets = [...bets, ...manualBets];

            console.log(`Parsed ${messages.length} messages, found ${bets.length} bets (+ ${manualBets.length} manuales)`);

            if (allBets.length === 0) {
                alert(`No se encontraron apuestas.\n\nMensajes en archivo: ${messages.length}\nRevisa la consola para más detalles.`);
                return;
            }

            appState.bets = allBets;
            appState.saving = true;
            try {
                await saveBetsToSheets(allBets);
                appState.sheetsUnavailable = false;
            } catch (err) {
                appState.sheetsUnavailable = true;
                console.error('Error guardando apuestas en Sheets:', err);
                alert('Apuestas cargadas en memoria, pero no se pudieron guardar en Google Sheets. La vista puede ser de solo lectura.');
            } finally {
                appState.saving = false;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al leer el archivo: ' + message);
        } finally {
            isLoading = false;
        }
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
