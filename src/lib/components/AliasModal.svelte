<script>
    import { appState, participants } from '../stores.svelte.js';
    import { saveAliasesToSheets } from '../api.js';
    import MessageModal from './MessageModal.svelte';

    let { onClose } = $props();

    /** @type {Record<string, string>} */
    let editingAliases = $state({});
    let isSaving = $state(false);
    let showMessage = $state(false);
    /** @type {string} */
    let messageText = $state('');
    /** @type {'info' | 'warning' | 'error' | 'success'} */
    let messageType = $state('info');

    $effect(() => {
        editingAliases = { ...appState.participantAliases };
    });

    /**
     * @param {string} participant
     * @returns {string}
     */
    function getDisplayName(participant) {
        return editingAliases[participant] || participant;
    }

    /**
     * @param {string} participant
     * @param {string} value
     */
    function handleAliasChange(participant, value) {
        editingAliases[participant] = value;
    }

    /** @returns {boolean} */
    function hasChanges() {
        const orig = appState.participantAliases;
        const edit = editingAliases;
        const keys = new Set([...Object.keys(orig), ...Object.keys(edit)]);
        for (const key of keys) {
            if ((orig[key] || '') !== (edit[key] || '')) return true;
        }
        return false;
    }

    /** @returns {Promise<void>} */
    async function saveChanges() {
        if (isSaving) return;
        isSaving = true;
        try {
            /** @type {Record<string, string>} */
            const toSave = {};
            for (const [participant, alias] of Object.entries(editingAliases)) {
                if (alias && alias.trim()) {
                    toSave[participant] = alias.trim();
                }
            }
            await saveAliasesToSheets(toSave);
            appState.participantAliases = toSave;
            showMessageModal('Alias guardados correctamente en Google Sheets.', 'success');
            setTimeout(() => onClose(), 1500);
        } catch (err) {
            showMessageModal('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'), 'error');
        } finally {
            isSaving = false;
        }
    }

    function clearAll() {
        if (confirm('¿Eliminar todos los alias?')) {
            editingAliases = {};
        }
    }

    /**
     * @param {string} text
     * @param {'info' | 'warning' | 'error' | 'success'} [type]
     */
    function showMessageModal(text, type = 'info') {
        messageText = text;
        messageType = type;
        showMessage = true;
    }

    const currentParticipants = $derived(participants());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onclick={onClose} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bg-gray-900 text-white border border-white/10 rounded-2xl sm:rounded-3xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            <h2 class="text-xl font-bold text-cyan-400">Alias de Participantes</h2>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <p class="text-gray-400 text-sm">Ingresa un alias para cada participante. Si dejas vacío, se mostrará el nombre original.</p>

            {#if currentParticipants.length === 0}
                <div class="text-center text-gray-500 py-8">No hay participantes cargados.</div>
            {:else}
                <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                    {#each currentParticipants as participant}
                        <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                            <div class="flex-1 min-w-0">
                                <div class="text-xs text-gray-500 uppercase mb-1">Original</div>
                                <div class="text-white font-medium truncate">{participant}</div>
                            </div>
                            <div class="text-gray-500 px-2">→</div>
                            <div class="flex-1">
                                <div class="text-xs text-gray-500 uppercase mb-1">Alias</div>
                                <input
                                    type="text"
                                    value={editingAliases[participant] || ''}
                                    oninput={(e) => handleAliasChange(participant, e.currentTarget.value)}
                                    class="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500"
                                    placeholder={participant}
                                />
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="p-6 bg-white/5 border-t border-white/10 flex justify-between gap-3 flex-shrink-0">
            <button
                class="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors"
                onclick={clearAll}
            >
                Limpiar todo
            </button>
            <div class="flex gap-3">
                <button
                    class="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors"
                    onclick={onClose}
                >
                    Cancelar
                </button>
                <button
                    class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                    onclick={saveChanges}
                    disabled={isSaving || !hasChanges()}
                >
                    {#if isSaving}
                        Guardando...
                    {:else}
                        Guardar en Sheets
                    {/if}
                </button>
            </div>
        </div>
    </div>
</div>

{#if showMessage}
    <MessageModal
        message={messageText}
        type={messageType}
        onClose={() => showMessage = false}
    />
{/if}