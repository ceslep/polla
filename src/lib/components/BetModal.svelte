<script>
    import { parseMessage } from '../parser.js';
    import { appState } from '../stores.svelte.js';
    import { getFlagData } from '../flags.js';

    let { bet, onClose, onUpdate } = $props();

    let isEditing = $state(false);
    let editedMessage = $state(bet.originalMessage || bet.original_message || '');
    let parseError = $state(/** @type {string | null} */ (null));
    let parsedPreview = $state(/** @type {any[] | null} */ (null));

    /** @param {string | number | undefined} ts */
    function formatTimestamp(ts) {
        if (!ts) return '-';
        try {
            const date = new Date(ts);
            return date.toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return String(ts); }
    }

    /** @param {any} b */
    function getTypeIcon(b) {
        switch (b.type) {
            case 'score': return '⚽';
            case 'champion': return '🏆';
            case 'runnerup': return '🥈';
            case 'topscorer': return '👟';
            default: return '📋';
        }
    }

    /** @param {any} b */
    function getTypeLabel(b) {
        switch (b.type) {
            case 'score': return 'Partido';
            case 'champion': return 'Campeón';
            case 'runnerup': return 'Sub';
            case 'topscorer': return 'Goleador';
            default: return b.type;
        }
    }

    /** @type {Record<string, { label: string; class: string }>} */
    const statusMap = {
        'pending': { label: 'Pendiente', class: 'bg-orange-500/20 text-orange-400' },
        'exact': { label: 'Exacta', class: 'bg-cyan-500/20 text-cyan-400' },
        'correct': { label: 'Correcta', class: 'bg-emerald-500/20 text-emerald-400' },
        'incorrect': { label: 'Errada', class: 'bg-red-500/20 text-red-400' }
    };

    function startEditing() {
        editedMessage = bet.originalMessage || bet.original_message || '';
        isEditing = true;
        parseError = null;
        parsedPreview = null;
    }

    function cancelEditing() {
        isEditing = false;
        parseError = null;
        parsedPreview = null;
    }

    function previewParse() {
        parseError = null;
        parsedPreview = null;

        const tempMessage = {
            ...bet,
            Message: editedMessage,
            message: editedMessage
        };

        try {
            const parsed = parseMessage(tempMessage);
            if (parsed.length === 0) {
                parseError = 'No se pudo parsear ninguna apuesta del mensaje';
            } else {
                parsedPreview = parsed;
            }
        } catch (e) {
            parseError = 'Error al parsear: ' + (e instanceof Error ? e.message : String(e));
        }
    }

    function saveChanges() {
        parseError = null;

        const tempMessage = {
            ...bet,
            Message: editedMessage,
            message: editedMessage
        };

        try {
            const parsed = parseMessage(tempMessage);
            if (parsed.length === 0) {
                parseError = 'No se pudo parsear ninguna apuesta';
                return;
            }

            const messageId = bet.messageId;
            const oldBets = appState.bets.filter(b => b.messageId !== messageId);
            const newBets = parsed.map((p, idx) => ({
                ...p,
                id: `${messageId}_${p.type}_${idx}`,
                manuallyEdited: true
            }));

            appState.bets = [...oldBets, ...newBets];
            localStorage.setItem('polla_bets', JSON.stringify(appState.bets));

            if (onUpdate) {
                onUpdate(newBets);
            }

            isEditing = false;
            onClose();
        } catch (e) {
            parseError = 'Error al guardar: ' + (e instanceof Error ? e.message : String(e));
        }
    }

    function getMatchDisplay(/** @type {any} */ b) {
        if (b.type === 'score') {
            const homeFlag = getFlagData(b.prediction.homeTeam);
            const awayFlag = getFlagData(b.prediction.awayTeam);
            const homeName = homeFlag?.spanishName || b.prediction.homeTeam;
            const awayName = awayFlag?.spanishName || b.prediction.awayTeam;
            const homeImg = homeFlag?.flag ? `<img src="${homeFlag.flag}" class="inline-block h-4 w-6 mr-1" alt="${homeName}" />` : '';
            const awayImg = awayFlag?.flag ? `<img src="${awayFlag.flag}" class="inline-block h-4 w-6 ml-1" alt="${awayName}" />` : '';
            return `${homeImg}${homeName} ${b.prediction.homeScore} - ${b.prediction.awayScore} ${awayName}${awayImg}`;
        }
        if (b.type === 'champion') {
            const flag = getFlagData(b.prediction.champion);
            const img = flag?.flag ? `<img src="${flag.flag}" class="inline-block h-4 w-6 mr-1" alt="${flag.spanishName}" />` : '';
            return `Campeón: ${img}${flag?.spanishName || b.prediction.champion}`;
        }
        if (b.type === 'runnerup') {
            const flag = getFlagData(b.prediction.runnerup);
            const img = flag?.flag ? `<img src="${flag.flag}" class="inline-block h-4 w-6 mr-1" alt="${flag.spanishName}" />` : '';
            return `Sub: ${img}${flag?.spanishName || b.prediction.runnerup}`;
        }
        if (b.type === 'topscorer') return `Goleador: ${b.prediction.topscorer}`;
        return b.bet_text;
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    onclick={onClose}
>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onclick={(e) => e.stopPropagation()}
    >
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            <h2 class="text-xl font-bold text-cyan-400">Detalles de la Apuesta</h2>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-6 space-y-4 overflow-y-auto flex-1">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="block text-xs text-gray-500 uppercase mb-1">Participante</span>
                    <div class="text-lg font-semibold">{bet.participant}</div>
                </div>
                <div>
                    <span class="block text-xs text-gray-500 uppercase mb-1">Fecha/Hora</span>
                    <div class="text-sm">{formatTimestamp(bet.timestamp)}</div>
                </div>
            </div>

            {#if isEditing}
                <div class="space-y-3">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="block text-xs text-gray-500 uppercase">Mensaje Original</span>
                            <button
                                class="text-xs text-cyan-400 hover:text-cyan-300"
                                onclick={previewParse}
                            >
                                Vista previa del parseo
                            </button>
                        </div>
                        <textarea
                            bind:value={editedMessage}
                            rows="6"
                            class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white text-sm font-mono outline-none focus:border-cyan-500 resize-none"
                            placeholder="Edita el mensaje aquí..."
                        ></textarea>
                    </div>

                    {#if parseError}
                        <div class="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {parseError}
                        </div>
                    {/if}

                    {#if parsedPreview}
                        <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                            <span class="block text-xs text-emerald-400 uppercase mb-2">Vista Previa ({parsedPreview.length} apuestas)</span>
                            {#each parsedPreview as p}
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="text-lg">{getTypeIcon(p)}</span>
                                    <span class="text-gray-300">{getTypeLabel(p)}:</span>
                                    <span class="text-white font-medium">{@html getMatchDisplay(p)}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="p-4 bg-white/5 rounded-xl border border-white/5">
                    <div class="flex items-center justify-between mb-2">
                        <span class="block text-xs text-gray-500 uppercase">Mensaje Original</span>
                        <button
                            class="text-xs text-cyan-400 hover:text-cyan-300"
                            onclick={startEditing}
                        >
                            Editar
                        </button>
                    </div>
                    <p class="text-gray-300 italic whitespace-pre-wrap text-sm leading-relaxed">
                        "{bet.originalMessage || bet.original_message}"
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <span class="block text-xs text-gray-500 uppercase mb-1">Estado</span>
                        <span class="px-3 py-1 rounded-full text-xs font-bold inline-block {statusMap[/** @type {keyof typeof statusMap} */ (bet.status)]?.class || ''}">
                            {statusMap[/** @type {keyof typeof statusMap} */ (bet.status)]?.label || bet.status}
                        </span>
                    </div>
                    <div>
                        <span class="block text-xs text-gray-500 uppercase mb-1">Puntos Ganados</span>
                        <div class="text-2xl font-bold text-yellow-500">{Number(bet.points) || 0}</div>
                    </div>
                </div>

                {#if bet.realResult}
                    <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <span class="block text-xs text-emerald-500/70 uppercase mb-1">Resultado Real</span>
                        <div class="font-bold text-emerald-400">{bet.realResult}</div>
                    </div>
                {/if}
            {/if}
        </div>

        <div class="p-6 bg-white/5 border-t border-white/10 flex justify-end gap-3 flex-shrink-0">
            {#if isEditing}
                <button
                    class="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors"
                    onclick={cancelEditing}
                >
                    Cancelar
                </button>
                <button
                    class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={saveChanges}
                    disabled={!editedMessage.trim()}
                >
                    Guardar Cambios
                </button>
            {:else}
                <button
                    class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-colors"
                    onclick={onClose}
                >
                    Cerrar
                </button>
            {/if}
        </div>
    </div>
</div>
