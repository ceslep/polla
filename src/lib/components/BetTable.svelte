<script>
    import { appState, filteredBets, participants, matchDates, matchesPerDate, finishedMatchesPerDate, validateDateBets, isBetPotentiallyMalformed, getBetDate } from '../stores.svelte.js';
    import { getFlagData } from '../flags.js';

    let { onSelectBet } = $props();

    let activeTab = $state('grouped');

    const currentBets = $derived(filteredBets());
    const currentParticipants = $derived(participants());
    const availableDates = $derived(matchDates());
    const totalMatchesMap = $derived(matchesPerDate());
    const finishedMatchesMap = $derived(finishedMatchesPerDate());
    const dateValidation = $derived(appState.filters.date ? validateDateBets(appState.filters.date) : null);

    /** Parse date string as local time (not UTC) to avoid timezone shifts */
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    /** @param {string | number | undefined} ts */
    function formatTimestamp(ts) {
        if (!ts) return '-';
        try {
            const date = new Date(ts);
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' +
                   date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        } catch { return String(ts); }
    }

    /** @param {string} dateStr */
    function formatDateShort(dateStr) {
        try {
            const date = parseLocalDate(dateStr) || new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        } catch { return dateStr; }
    }

    /** @param {any} bet */
    function getTypeIcon(bet) {
        switch (bet.type) {
            case 'score': return '⚽';
            case 'champion': return '🏆';
            case 'runnerup': return '🥈';
            case 'topscorer': return '👟';
            default: return '📋';
        }
    }

    /** @param {any} bet */
    function getTypeLabel(bet) {
        switch (bet.type) {
            case 'score': return 'Partido';
            case 'champion': return 'Campeón';
            case 'runnerup': return 'Sub';
            case 'topscorer': return 'Goleador';
            default: return bet.type;
        }
    }

    /** @type {Record<string, { label: string; class: string }>} */
    const statusMap = {
        'pending': { label: 'Pendiente', class: 'bg-orange-500/20 text-orange-400' },
        'exact': { label: 'Exacta', class: 'bg-cyan-500/20 text-cyan-400' },
        'correct': { label: 'Correcta', class: 'bg-emerald-500/20 text-emerald-400' },
        'incorrect': { label: 'Errada', class: 'bg-red-500/20 text-red-400' }
    };

    /** @param {any} bet */
    function getStatusClass(bet) {
        return statusMap[bet.status]?.class || '';
    }

    /** @param {any} bet */
    function getStatusLabel(bet) {
        return statusMap[bet.status]?.label || bet.status;
    }

    /** @param {string} date */
    function getMatchesForDate(date) {
        return appState.matches.filter(m => {
            if (!m.date) return false;
            const mDate = parseLocalDate(m.date);
            if (!mDate) return false;
            const year = mDate.getFullYear();
            const month = String(mDate.getMonth() + 1).padStart(2, '0');
            const day = String(mDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}` === date;
        });
    }

    /** @param {string} date */
    function getBetsByParticipantForDate(date) {
        const betsByParticipant = new Map();

        for (const p of currentParticipants) {
            betsByParticipant.set(p, []);
        }

        currentBets.forEach(bet => {
            if (betsByParticipant.has(bet.participant)) {
                betsByParticipant.get(bet.participant).push(bet);
            }
        });

        return betsByParticipant;
    }

    /** @type {() => Array<{participant: string, bets: any[], matches: any[], missingCount: number, hasMalformed: boolean}>} */
    const groupedByParticipant = $derived(() => {
        if (!appState.filters.date) return [];

        const date = appState.filters.date;
        const matches = getMatchesForDate(date);
        const betsByParticipant = getBetsByParticipantForDate(date);
        const result = [];

        for (const participant of currentParticipants) {
            const participantBets = betsByParticipant.get(participant) || [];
            const scoreBets = participantBets.filter((/** @type {any} */ b) => b.type === 'score');
            const missingCount = matches.length - scoreBets.length;
            const hasMalformed = scoreBets.some((/** @type {any} */ b) => isBetPotentiallyMalformed(b));

            result.push({
                participant,
                bets: participantBets,
                matches,
                missingCount,
                hasMalformed
            });
        }

        return result;
    });

    /** @type {() => Array<{messageId: string, participant: string, timestamp: string, bets: any[], hasMalformed: boolean, hasManuallyEdited: boolean, scoreBetCount: number}>} */
    const groupedByMessage = $derived(() => {
        if (appState.filters.date) return [];

        const filtered = appState.bets.filter(bet => {
            if (appState.filters.participant && bet.participant !== appState.filters.participant) return false;
            if (appState.filters.type && bet.type !== appState.filters.type) return false;
            if (appState.filters.status && bet.status !== appState.filters.status) return false;
            if (appState.filters.search) {
                const search = appState.filters.search.toLowerCase();
                const text = (bet.bet_text + ' ' + bet.participant).toLowerCase();
                if (!text.includes(search)) return false;
            }
            return true;
        });

        const messageMap = new Map();

        filtered.forEach((/** @type {any} */ bet) => {
            if (!messageMap.has(bet.messageId)) {
                messageMap.set(bet.messageId, {
                    messageId: bet.messageId,
                    participant: bet.participant,
                    timestamp: bet.timestamp,
                    bets: [],
                    hasMalformed: false,
                    hasManuallyEdited: false,
                    scoreBetCount: 0
                });
            }
            const msg = messageMap.get(bet.messageId);
            msg.bets.push(bet);
            if (bet.type === 'score') msg.scoreBetCount++;
            if (isBetPotentiallyMalformed(bet)) msg.hasMalformed = true;
            if (bet.manuallyEdited) msg.hasManuallyEdited = true;
        });

        return [...messageMap.values()].sort((a, b) => {
            const partCompare = (a.participant || '').localeCompare(b.participant || '');
            if (partCompare !== 0) return partCompare;
            return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
    });

    /** @param {string} msgId */
    function getBetsForMessage(msgId) {
        return appState.bets.filter((/** @type {any} */ b) => b.messageId === msgId);
    }

    /** @param {any} bet */
    function formatBetText(bet) {
        if (bet.type === 'score') {
            const homeFlag = getFlagData(bet.prediction.homeTeam);
            const awayFlag = getFlagData(bet.prediction.awayTeam);
            const homeName = homeFlag?.spanishName || bet.prediction.homeTeam;
            const awayName = awayFlag?.spanishName || bet.prediction.awayTeam;
            const homeImg = homeFlag?.flag ? `<img src="${homeFlag.flag}" class="inline-block h-4 w-6 mr-1" alt="${homeName}" />` : '';
            const awayImg = awayFlag?.flag ? `<img src="${awayFlag.flag}" class="inline-block h-4 w-6 ml-1" alt="${awayName}" />` : '';
            return `${homeImg}${homeName} ${bet.prediction.homeScore} - ${bet.prediction.awayScore} ${awayName}${awayImg}`;
        }
        if (bet.type === 'champion') {
            const flag = getFlagData(bet.prediction.champion);
            const img = flag?.flag ? `<img src="${flag.flag}" class="inline-block h-4 w-6 mr-1" alt="${flag.spanishName}" />` : '';
            return `🏆 Campeón: ${img}${flag?.spanishName || bet.prediction.champion}`;
        }
        if (bet.type === 'runnerup') {
            const flag = getFlagData(bet.prediction.runnerup);
            const img = flag?.flag ? `<img src="${flag.flag}" class="inline-block h-4 w-6 mr-1" alt="${flag.spanishName}" />` : '';
            return `🥈 Sub: ${img}${flag?.spanishName || bet.prediction.runnerup}`;
        }
        if (bet.type === 'topscorer') return `👟 Goleador: ${bet.prediction.topscorer}`;
        return bet.bet_text;
    }

    /** @param {string} status */
    function getStatusIcon(status) {
        return { exact: '🎯', correct: '✓', incorrect: '✗', pending: '⏳' }[status] || '❓';
    }

    /** @param {string} status */
    function getStatusColor(status) {
        return { exact: 'text-cyan-400', correct: 'text-emerald-400', incorrect: 'text-red-400', pending: 'text-orange-400' }[status] || 'text-gray-400';
    }

    /** @param {string} status */
    function getStatusText(status) {
        return { exact: 'EXACTA', correct: 'Acierto Ganador', incorrect: 'ERRADA', pending: 'PENDIENTE' }[status] || status?.toUpperCase();
    }

    /** @param {any[]} bets */
    function calculateTotalPoints(bets) {
        return bets.reduce((sum, b) => sum + (b.points || 0), 0);
    }
</script>

<div class="bg-white/5 rounded-2xl overflow-hidden border border-white/10">
    <div class="p-6 border-b border-white/10 flex flex-wrap gap-4 items-center justify-between">
        <div class="flex gap-4 items-center flex-wrap">
            <select
                class="bg-white/10 border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500 text-white"
                bind:value={appState.filters.date}
            >
                <option value="">Todas las fechas</option>
                {#each availableDates as d}
                    {@const totalMatchCount = totalMatchesMap.get(d) || 0}
                    {@const finishedCount = finishedMatchesMap.get(d) || 0}
                    <option value={d}>{formatDateShort(d)} ({totalMatchCount} partidos{finishedCount < totalMatchCount ? `, ${finishedCount} jugados` : ''})</option>
                {/each}
            </select>

            {#if appState.filters.date && dateValidation}
                <div class="flex items-center gap-2 px-3 py-2 rounded-lg {dateValidation.hasAllBets ? 'bg-emerald-500/20' : 'bg-red-500/20'}">
                    {#if dateValidation.hasAllBets}
                        <span class="text-emerald-400 text-sm">✓ {dateValidation.participants.length}×{dateValidation.totalMatches} = {dateValidation.participants.length * dateValidation.totalMatches} apuestas</span>
                    {:else}
                        <span class="text-red-400 text-sm">
                            {#if dateValidation.missing.length > 0}
                                ⚠ Faltan: {dateValidation.missing.length} participantes
                            {/if}
                            {#if dateValidation.malformed.length > 0}
                                {dateValidation.missing.length > 0 ? ' | ' : ''}Parseo errado: {dateValidation.malformed.length}
                            {/if}
                        </span>
                    {/if}
                    {#if dateValidation.finishedMatches > 0}
                        <span class="text-gray-400 text-xs">({dateValidation.finishedMatches} jugados)</span>
                    {/if}
                </div>
            {/if}

            <select
                class="bg-white/10 border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500 text-white"
                bind:value={appState.filters.participant}
            >
                <option value="">Todos los participantes</option>
                {#each currentParticipants as p}
                    <option value={p}>{p}</option>
                {/each}
            </select>

            <select
                class="bg-white/10 border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500 text-white"
                bind:value={appState.filters.type}
            >
                <option value="score">Partidos</option>
                <option value="champion">Campeón</option>
                <option value="runnerup">Subcampeón</option>
                <option value="topscorer">Goleador</option>
                <option value="">Todos los tipos</option>
            </select>

            <select
                class="bg-white/10 border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500 text-white"
                bind:value={appState.filters.status}
            >
                <option value="">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="exact">Exactas</option>
                <option value="correct">Correctas</option>
                <option value="incorrect">Erradas</option>
            </select>
        </div>

        <div class="flex items-center gap-3">
            <div class="flex gap-1 bg-white/10 rounded-lg p-1">
                <button
                    class="px-4 py-2 rounded-md text-sm font-medium transition-all
                    {activeTab === 'grouped' ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}"
                    onclick={() => activeTab = 'grouped'}
                >
                    📋 Por Mensaje
                </button>
                <button
                    class="px-4 py-2 rounded-md text-sm font-medium transition-all
                    {activeTab === 'rows' ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400 hover:text-white'}"
                    onclick={() => activeTab = 'rows'}
                >
                    📝 Filas
                </button>
            </div>

            <input
                type="text"
                placeholder="Buscar..."
                class="bg-white/10 border-white/20 rounded-lg px-4 py-2 text-sm w-48 outline-none focus:border-cyan-500 text-white"
                bind:value={appState.filters.search}
            />
        </div>
    </div>

    <div class="overflow-x-auto">
        <table class="w-full text-left">
            <thead>
                <tr class="text-gray-400 text-xs uppercase tracking-wider border-b border-white/5">
                    <th class="px-6 py-4 font-semibold">Fecha</th>
                    <th class="px-6 py-4 font-semibold">Participante</th>
                    <th class="px-6 py-4 font-semibold">Tipo</th>
                    <th class="px-6 py-4 font-semibold">Apuesta</th>
                    <th class="px-6 py-4 font-semibold">Estado</th>
                    <th class="px-6 py-4 font-semibold">Puntos</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
                {#if activeTab === 'grouped'}
                    {#if groupedByMessage().length > 0}
                        {#each groupedByMessage() as msg}
                            {@const allBets = msg.bets}
                            {@const totalPts = calculateTotalPoints(allBets)}
                            {@const needsAttention = msg.hasMalformed || (!msg.hasManuallyEdited && msg.scoreBetCount === 0)}

                            <tr class="bg-gradient-to-r from-cyan-900/20 to-transparent">
                                <td colspan="6" class="px-6 py-4">
                                    <div class="flex items-start justify-between mb-2">
                                        <div class="flex items-center gap-4">
                                            <div class="bg-cyan-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg">
                                                {msg.participant}
                                            </div>
                                            {#if msg.hasManuallyEdited}
                                                <span class="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full" title="Tiene apuestas editadas">ℹ️ Editado</span>
                                            {/if}
                                        </div>
                                        <div class="text-right">
                                            <div class="text-xs text-gray-400 uppercase">Total</div>
                                            <div class="text-3xl font-black text-yellow-400">{totalPts} PTS</div>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-6 mb-4 p-3 bg-black/20 rounded-xl">
                                        <div class="flex items-center gap-3">
                                            <span class="text-5xl font-black text-white">{allBets.length}</span>
                                            <div>
                                                <div class="text-xs text-gray-400 uppercase tracking-wider">APUESTAS</div>
                                                <div class="flex items-center gap-2 mt-1">
                                                    {#if msg.bets.some(b => b.type === 'champion')}<span class="text-xl">🏆</span>{/if}
                                                    {#if msg.bets.some(b => b.type === 'runnerup')}<span class="text-xl">🥈</span>{/if}
                                                    {#if msg.bets.some(b => b.type === 'topscorer')}<span class="text-xl">👟</span>{/if}
                                                    <span class="text-lg text-gray-300">⚽×{msg.bets.filter(b => b.type === 'score').length}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {#if needsAttention}
                                            <div class="flex items-center gap-2 text-red-400 text-sm">
                                                <span>⚠️</span>
                                                {#if msg.scoreBetCount === 0}
                                                    Sin apuestas de partidos
                                                {:else}
                                                    {msg.bets.filter((/** @type {any} */ b) => isBetPotentiallyMalformed(b)).length} parseo(s) errado(s)
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="space-y-2 mb-4">
                                        {#each allBets as bet}
                                            {@const malformed = isBetPotentiallyMalformed(bet)}
                                            <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg {malformed ? 'border border-red-500/30' : ''}">
                                                <div class="flex items-center gap-3">
                                                    <span class="text-2xl">{getTypeIcon(bet)}</span>
                                                    <div>
                                                        <div class="text-white font-medium text-sm {malformed ? 'text-red-400' : ''}">
                                                            {@html formatBetText(bet)}
                                                        </div>
                                                        <div class="text-xs {getStatusColor(bet.status)}">
                                                            {getStatusText(bet.status)}
                                                            {#if bet.real_result}│ Real: {bet.real_result}{/if}
                                                            {#if malformed}⚠️{/if}
                                                            {#if bet.manuallyEdited}ℹ️{/if}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="flex items-center gap-2">
                                                    <span class="text-xl">{getStatusIcon(bet.status)}</span>
                                                    <span class="text-xl font-bold text-yellow-400">+{bet.points || 0}</span>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>

                                    {#if needsAttention}
                                        <div class="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20 mb-4">
                                            <span class="text-red-400">⚠️</span>
                                            <span class="text-red-300 text-sm flex-1">
                                                {#if msg.scoreBetCount === 0}
                                                    No se detectaron apuestas de partidos.
                                                {:else}
                                                    Hay {msg.bets.filter((/** @type {any} */ b) => isBetPotentiallyMalformed(b)).length} apuesta(s) con problemas de parseo.
                                                {/if}
                                            </span>
                                        </div>
                                    {/if}

                                    <div class="flex items-center justify-between">
                                        <button
                                            class="px-4 py-2 bg-cyan-600/80 hover:bg-cyan-500 text-white text-sm rounded-lg flex items-center gap-2"
                                            onclick={() => onSelectBet(msg.bets[0])}
                                        >
                                            <span>✏️</span> Ver/Editar
                                        </button>
                                        <details class="group">
                                            <summary class="text-gray-500 text-xs cursor-pointer hover:text-gray-400 list-none">
                                                <span class="underline">Ver mensaje original</span>
                                            </summary>
                                            <p class="mt-2 text-gray-400 text-sm italic whitespace-pre-wrap bg-black/20 p-3 rounded-lg">
                                                "{msg.bets[0]?.originalMessage || msg.bets[0]?.original_message || 'Sin mensaje'}"
                                            </p>
                                        </details>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {:else}
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-gray-500 italic">
                                No se encontraron apuestas con los filtros seleccionados
                            </td>
                        </tr>
                    {/if}
                {:else}
                    {#each currentBets as bet}
                        {@const malformed = isBetPotentiallyMalformed(bet)}
                        <tr
                            class="hover:bg-white/5 cursor-pointer transition-colors {malformed ? 'bg-red-500/5' : ''}"
                            onclick={() => onSelectBet(bet)}
                        >
                            <td class="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">
                                {bet.timestamp ? formatTimestamp(bet.timestamp) : '-'}
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-xs font-medium">
                                    {bet.participant}
                                </span>
                                {#if malformed}
                                    <span class="ml-2 text-red-400 text-xs" title="Esta apuesta puede tener problemas de parseo">⚠️</span>
                                {/if}
                                {#if bet.manuallyEdited}
                                    <span class="ml-2 text-cyan-400 text-xs" title="Editado manualmente">ℹ️</span>
                                {/if}
                            </td>
                            <td class="px-6 py-4">
                                <span class="flex items-center gap-1.5">
                                    <span class="text-lg">{getTypeIcon(bet)}</span>
                                    <span class="text-sm text-gray-300">{getTypeLabel(bet)}</span>
                                </span>
                            </td>
                            <td class="px-6 py-4 text-sm font-medium text-white">
                                {@html formatBetText(bet)}
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-3 py-1 rounded-full text-xs font-bold {getStatusClass(bet)}">
                                    {getStatusLabel(bet)}
                                </span>
                            </td>
                            <td class="px-6 py-4 font-bold text-yellow-500">
                                {bet.points || 0}
                            </td>
                        </tr>
                    {/each}
                    {#if currentBets.length === 0}
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-gray-500 italic">
                                No se encontraron apuestas con los filtros seleccionados
                            </td>
                        </tr>
                    {/if}
                {/if}
            </tbody>
        </table>
        {#if currentBets.length === 0}
            <div class="p-12 text-center text-gray-500 italic">
                No se encontraron apuestas con los filtros seleccionados
            </div>
        {/if}
    </div>
</div>

<style>
    :global(select option) {
        background: #1a1a1a;
        color: #ffffff;
    }
</style>