<script>
    import { FLAG_MAP } from '../parser.js';
    import Flag from './Flag.svelte';
    import { sortByTimestampDesc, MIN_POINTS_THRESHOLD } from '../stores.svelte.js';
    import MovementModal from './MovementModal.svelte';

    /** @type {{ summary: { total: number, updated: number, errors: number }, errors?: string[], winners?: Array<{participant: string, points: number, rank: number}>, bets?: any[], matches?: any[], onClose: () => void }} */
    let { summary, errors = [], winners = [], bets = [], matches = [], onClose } = $props();

    /** @type {boolean} */
    let showMovementModal = $state(false);

    /** Solo muestra ganadores que alcanzan el umbral mínimo de puntos. */
    const filteredWinners = $derived(winners.filter(w => w.points >= MIN_POINTS_THRESHOLD));

    /** @param {number} n */
    function formatNumber(n) {
        return n.toLocaleString('es-ES');
    }

    /** @type {string | null} */
    let selectedParticipant = $state(null);

    /** @param {string} participant */
    function getParticipantBets(participant) {
        return sortByTimestampDesc(bets.filter(b => b.participant === participant));
    }

    /** @param {string} participant */
    function getParticipantPhone(participant) {
        const bet = bets.find(b => b.participant === participant);
        return bet?.phone || '';
    }

    /** @param {string} participant */
    function getBetBreakdown(participant) {
        const participantBets = getParticipantBets(participant);
        const exactas = participantBets.filter(b => b.points === 5);
        const correctas = participantBets.filter(b => b.points === 3);
        const draws = participantBets.filter(b => b.points === 2);
        const incorrectas = participantBets.filter(b => b.points === 0 && b.status !== 'pending');
        const pending = participantBets.filter(b => b.status === 'pending');

        return {
            exactas,
            correctas,
            draws,
            incorrectas,
            pending,
            total: participantBets.length,
            totalPoints: participantBets.reduce((sum, b) => sum + (Number(b.points) || 0), 0)
        };
    }

    /** @param {any} bet */
    function getBetStatusClass(bet) {
        if (bet.points === 5) return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400';
        if (bet.points === 3) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
        if (bet.points === 2) return 'bg-blue-500/20 border-blue-500/40 text-blue-400';
        if (bet.points === 0) return 'bg-red-500/20 border-red-500/40 text-red-400';
        return 'bg-gray-500/20 border-gray-500/40 text-gray-400';
    }

    /** @param {any} bet */
    function getBetTypeLabel(bet) {
        if (bet.type === 'champion') return '🏆';
        if (bet.type === 'runnerup') return '🥈';
        if (bet.type === 'topscorer') return '⚽';
        if (bet.type === 'score') return '📊';
        return '?';
    }

    /** @param {any} bet */
    function getBetTypeName(bet) {
        if (bet.type === 'champion') return 'Campeón';
        if (bet.type === 'runnerup') return 'Subcampeón';
        if (bet.type === 'topscorer') return 'Goleador';
        if (bet.type === 'score') return 'Score';
        return bet.type || '';
    }

    /** @param {any} bet */
    function getScoreDisplay(bet) {
        if (bet.type !== 'score' || !bet.prediction) return null;
        return {
            homeTeam: bet.prediction.homeTeam,
            homeScore: bet.prediction.homeScore,
            awayTeam: bet.prediction.awayTeam,
            awayScore: bet.prediction.awayScore
        };
    }

    /** @param {any} bet */
    function getChampionDisplay(bet) {
        if (bet.type !== 'champion' || !bet.prediction) return null;
        return { team: bet.prediction.champion };
    }

    /** @param {any} bet */
    function getRunnerupDisplay(bet) {
        if (bet.type !== 'runnerup' || !bet.prediction) return null;
        return { team: bet.prediction.runnerup };
    }

    /** @param {any} bet */
    function getTopscorerDisplay(bet) {
        if (bet.type !== 'topscorer' || !bet.prediction) return null;
        return { name: bet.prediction.topscorer };
    }

    function clearParticipantSelection() {
        selectedParticipant = null;
    }

    /** @type {string | null} */
    let exportMessage = $state(null);

    function exportToWhatsApp() {
        const header = '🏆 CLASIFICACIÓN POLLA MUNDIAL 2026\n\n';

        /** @param {string} name */
        function cleanName(name) {
            const clean = name
                .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
                .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
                .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
                .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
                .replace(/[\u{2600}-\u{26FF}]/gu, '')
                .replace(/[\u{2700}-\u{27BF}]/gu, '')
                .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
                .replace(/[^a-zA-Z0-9ñÑ\s]/g, '')
                .replace(/\s+/g, ' ').trim();
            if (clean.length === 0) return 'sin nombre';
            return clean;
        }

        const baseUrl = 'https://ceslep.github.io/polla/#/participant/';

        const rows = filteredWinners.map(w => {
            const encodedName = encodeURIComponent(w.participant);
            const url = baseUrl + encodedName;
            return `${w.rank}. [${cleanName(w.participant)}](${url}) - ${w.points} pts`;
        });

        const text = `🏆 CLASIFICACIÓN POLLA MUNDIAL 2026

${rows.join('\n')}`;
        navigator.clipboard.writeText(text).then(() => {
            exportMessage = '¡Copiado!';
            setTimeout(() => { exportMessage = null; }, 2000);
        });
    }

    function openMovementModal() {
        showMovementModal = true;
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            {#if selectedParticipant}
                {@const participantPhone = bets.find(b => b.participant === selectedParticipant)?.phone || ''}
                <div class="flex items-center gap-3">
                    <button
                        class="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        onclick={clearParticipantSelection}
                    >
                        ←
                    </button>
                    <div>
                        <h2 class="text-xl font-bold text-cyan-400">Detalles de {selectedParticipant}</h2>
                        {#if participantPhone}
                            <p class="text-xs text-gray-400">{participantPhone}</p>
                        {/if}
                    </div>
                </div>
            {:else}
                <h2 class="text-xl font-bold text-cyan-400">📊 Análisis Completado</h2>
            {/if}
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-6 space-y-6 overflow-y-auto flex-1">
            {#if selectedParticipant}
                {@const breakdown = getBetBreakdown(selectedParticipant)}
                <!-- Participant Detail View -->
                <div class="space-y-4">
                    <!-- Stats Cards -->
                    <div class="grid grid-cols-4 gap-3">
                        <div class="bg-yellow-500/10 rounded-xl p-3 text-center border border-yellow-500/30">
                            <div class="text-2xl font-black text-yellow-400">{breakdown.exactas.length}</div>
                            <div class="text-xs text-yellow-400/70 uppercase">Exactas (5pt)</div>
                        </div>
                        <div class="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/30">
                            <div class="text-2xl font-black text-emerald-400">{breakdown.correctas.length}</div>
                            <div class="text-xs text-emerald-400/70 uppercase">Correctas (3pt)</div>
                        </div>
                        <div class="bg-blue-500/10 rounded-xl p-3 text-center border border-blue-500/30">
                            <div class="text-2xl font-black text-blue-400">{breakdown.draws.length}</div>
                            <div class="text-xs text-blue-400/70 uppercase">Empates (2pt)</div>
                        </div>
                        <div class="bg-red-500/10 rounded-xl p-3 text-center border border-red-500/30">
                            <div class="text-2xl font-black text-red-400">{breakdown.incorrectas.length}</div>
                            <div class="text-xs text-red-400/70 uppercase">Incorrectas (0pt)</div>
                        </div>
                    </div>

                    <!-- Total Points -->
                    <div class="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                        <span class="text-gray-400">Total de puntos</span>
                        <span class="text-3xl font-black text-yellow-400">{breakdown.totalPoints} pts</span>
                    </div>

                    <!-- Exactas -->
                    {#if breakdown.exactas.length > 0}
                        <div>
                            <h4 class="text-yellow-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                                <span>⭐</span> Exactas ({breakdown.exactas.length})
                            </h4>
                            <div class="space-y-2">
                                {#each breakdown.exactas as bet}
                                    {@const scoreBet = getScoreDisplay(bet)}
                                    {@const champBet = getChampionDisplay(bet)}
                                    {@const runnerupBet = getRunnerupDisplay(bet)}
                                    {@const topscorerBet = getTopscorerDisplay(bet)}
                                    <div class="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <span class="text-sm">{getBetTypeLabel(bet)}</span>
                                                <span class="text-xs text-yellow-400/70">{getBetTypeName(bet)}</span>
                                            </div>
                                            <span class="text-yellow-400 font-bold">{bet.points} pts</span>
                                        </div>
                                        {#if scoreBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={scoreBet.homeTeam} size="sm" />
                                                <span class="text-yellow-400 font-bold">{scoreBet.homeScore}-{scoreBet.awayScore}</span>
                                                <Flag teamName={scoreBet.awayTeam} size="sm" />
                                            </div>
                                        {:else if champBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={champBet.team} size="sm" />
                                            </div>
                                        {:else if runnerupBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={runnerupBet.team} size="sm" />
                                            </div>
                                        {:else if topscorerBet}
                                            <div class="text-white text-sm mt-2 font-medium">
                                                {topscorerBet.name}
                                            </div>
                                        {/if}
                                        {#if bet.realResult}
                                            <div class="text-gray-400 text-xs mt-1">→ {bet.realResult}</div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Correctas -->
                    {#if breakdown.correctas.length > 0}
                        <div>
                            <h4 class="text-emerald-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                                <span>✓</span> Correctas ({breakdown.correctas.length})
                            </h4>
                            <div class="space-y-2">
                                {#each breakdown.correctas as bet}
                                    {@const scoreBet = getScoreDisplay(bet)}
                                    {@const champBet = getChampionDisplay(bet)}
                                    {@const runnerupBet = getRunnerupDisplay(bet)}
                                    {@const topscorerBet = getTopscorerDisplay(bet)}
                                    <div class="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <span class="text-sm">{getBetTypeLabel(bet)}</span>
                                                <span class="text-xs text-emerald-400/70">{getBetTypeName(bet)}</span>
                                            </div>
                                            <span class="text-emerald-400 font-bold">{bet.points} pts</span>
                                        </div>
                                        {#if scoreBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={scoreBet.homeTeam} size="sm" />
                                                <span class="text-emerald-400 font-bold">{scoreBet.homeScore}-{scoreBet.awayScore}</span>
                                                <Flag teamName={scoreBet.awayTeam} size="sm" />
                                            </div>
                                        {:else if champBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={champBet.team} size="sm" />
                                            </div>
                                        {:else if runnerupBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={runnerupBet.team} size="sm" />
                                            </div>
                                        {:else if topscorerBet}
                                            <div class="text-white text-sm mt-2 font-medium">
                                                {topscorerBet.name}
                                            </div>
                                        {/if}
                                        {#if bet.realResult}
                                            <div class="text-gray-400 text-xs mt-1">→ {bet.realResult}</div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Empates -->
                    {#if breakdown.draws.length > 0}
                        <div>
                            <h4 class="text-blue-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                                <span>=</span> Empates ({breakdown.draws.length})
                            </h4>
                            <div class="space-y-2">
                                {#each breakdown.draws as bet}
                                    {@const scoreBet = getScoreDisplay(bet)}
                                    {@const champBet = getChampionDisplay(bet)}
                                    {@const runnerupBet = getRunnerupDisplay(bet)}
                                    {@const topscorerBet = getTopscorerDisplay(bet)}
                                    <div class="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <span class="text-sm">{getBetTypeLabel(bet)}</span>
                                                <span class="text-xs text-blue-400/70">{getBetTypeName(bet)}</span>
                                            </div>
                                            <span class="text-blue-400 font-bold">{bet.points} pts</span>
                                        </div>
                                        {#if scoreBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={scoreBet.homeTeam} size="sm" />
                                                <span class="text-blue-400 font-bold">{scoreBet.homeScore}-{scoreBet.awayScore}</span>
                                                <Flag teamName={scoreBet.awayTeam} size="sm" />
                                            </div>
                                        {:else if champBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={champBet.team} size="sm" />
                                            </div>
                                        {:else if runnerupBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={runnerupBet.team} size="sm" />
                                            </div>
                                        {:else if topscorerBet}
                                            <div class="text-white text-sm mt-2 font-medium">
                                                {topscorerBet.name}
                                            </div>
                                        {/if}
                                        {#if bet.realResult}
                                            <div class="text-gray-400 text-xs mt-1">→ {bet.realResult}</div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Incorrectas -->
                    {#if breakdown.incorrectas.length > 0}
                        <div>
                            <h4 class="text-red-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                                <span>✗</span> Incorrectas ({breakdown.incorrectas.length})
                            </h4>
                            <div class="space-y-2">
                                {#each breakdown.incorrectas as bet}
                                    {@const scoreBet = getScoreDisplay(bet)}
                                    {@const champBet = getChampionDisplay(bet)}
                                    {@const runnerupBet = getRunnerupDisplay(bet)}
                                    {@const topscorerBet = getTopscorerDisplay(bet)}
                                    <div class="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                                        <div class="flex items-center justify-between">
                                            <div class="flex items-center gap-2">
                                                <span class="text-sm">{getBetTypeLabel(bet)}</span>
                                                <span class="text-xs text-red-400/70">{getBetTypeName(bet)}</span>
                                            </div>
                                            <span class="text-red-400 font-bold">{bet.points} pts</span>
                                        </div>
                                        {#if scoreBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={scoreBet.homeTeam} size="sm" />
                                                <span class="text-red-400 font-bold">{scoreBet.homeScore}-{scoreBet.awayScore}</span>
                                                <Flag teamName={scoreBet.awayTeam} size="sm" />
                                            </div>
                                        {:else if champBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={champBet.team} size="sm" />
                                            </div>
                                        {:else if runnerupBet}
                                            <div class="flex items-center gap-2 text-white text-sm mt-2 font-medium">
                                                <Flag teamName={runnerupBet.team} size="sm" />
                                            </div>
                                        {:else if topscorerBet}
                                            <div class="text-white text-sm mt-2 font-medium">
                                                {topscorerBet.name}
                                            </div>
                                        {/if}
                                        {#if bet.realResult}
                                            <div class="text-gray-400 text-xs mt-1">→ {bet.realResult}</div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- Winners List View -->
                <!-- Summary Stats -->
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-white/5 rounded-2xl p-4 text-center">
                        <div class="text-4xl font-black text-white">{formatNumber(summary.total)}</div>
                        <div class="text-xs text-gray-400 uppercase mt-1">Total</div>
                    </div>
                    <div class="bg-emerald-500/10 rounded-2xl p-4 text-center border border-emerald-500/20">
                        <div class="text-4xl font-black text-emerald-400">{formatNumber(summary.updated)}</div>
                        <div class="text-xs text-emerald-400 uppercase mt-1">Actualizadas</div>
                    </div>
                    <div class="bg-red-500/10 rounded-2xl p-4 text-center border border-red-500/20">
                        <div class="text-4xl font-black text-red-400">{formatNumber(summary.errors)}</div>
                        <div class="text-xs text-red-400 uppercase mt-1">Errores</div>
                    </div>
                </div>

                <!-- Errors Section -->
                {#if errors.length > 0}
                    <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                        <h3 class="text-red-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>⚠️</span> Errores Encontrados
                        </h3>
                        <div class="space-y-2 max-h-40 overflow-y-auto">
                            {#each errors.slice(0, 10) as error}
                                <div class="text-red-300 text-sm bg-black/20 rounded-lg p-2">
                                    {error}
                                </div>
                            {/each}
                            {#if errors.length > 10}
                                <div class="text-red-400 text-xs text-center">
                                    ...y {errors.length - 10} errores más
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- Winners Section -->
                {#if filteredWinners.length > 0}
                    <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-yellow-400 font-bold text-sm uppercase flex items-center gap-2">
                                <span>🏆</span> Clasificación Actual
                            </h3>
                            {#if exportMessage}
                                <span class="text-emerald-400 text-sm font-medium">{exportMessage}</span>
                            {:else}
                                <div class="flex gap-2">
                                    <button
                                        class="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-lg transition-colors"
                                        onclick={openMovementModal}
                                    >
                                        📊 Movimiento
                                    </button>
                                    <button
                                        class="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-lg transition-colors"
                                        onclick={exportToWhatsApp}
                                    >
                                        📋 Copiar
                                    </button>
                                </div>
                            {/if}
                        </div>
                        <div class="space-y-2">
                            {#each filteredWinners as winner}
                                {@const winnerPhone = getParticipantPhone(winner.participant)}
                                <button
                                    class="w-full flex items-center justify-between bg-black/20 rounded-lg p-3 hover:bg-white/10 transition-colors {winner.rank <= 3 ? 'border border-yellow-500/30' : ''}"
                                    onclick={() => selectedParticipant = winner.participant}
                                >
                                    <div class="flex items-center gap-3">
                                        {#if winner.rank === 1}
                                            <img src={`${import.meta.env.BASE_URL}m1.png`} alt="1° lugar" class="w-12 h-12 object-contain drop-shadow-md" />
                                        {:else if winner.rank === 2}
                                            <img src={`${import.meta.env.BASE_URL}m2.png`} alt="2° lugar" class="w-10 h-10 object-contain drop-shadow-md" />
                                        {:else if winner.rank === 3}
                                            <img src={`${import.meta.env.BASE_URL}m3.png`} alt="3° lugar" class="w-10 h-10 object-contain drop-shadow-md" />
                                        {:else}
                                            <div class="relative w-8 h-8 shrink-0 flex items-center justify-center">
                                                <img src={`${import.meta.env.BASE_URL}balon.png`} alt="" class="w-full h-full object-contain drop-shadow-md" />
                                                <span class="absolute inset-0 flex items-center justify-center font-black text-yellow-400 text-lg [-webkit-text-stroke:_0.5px_black]">
                                                    {winner.rank}
                                                </span>
                                            </div>
                                        {/if}
                                        <div class="flex flex-col items-start">
                                            <span class="text-white font-semibold">{winner.participant}</span>
                                            {#if winnerPhone}
                                                <span class="text-xs text-gray-500">{winnerPhone}</span>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <span class="text-2xl font-black text-yellow-400">{formatNumber(winner.points)} pts</span>
                                        <span class="text-gray-500">→</span>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}

                <!-- Success Message -->
                {#if summary.errors === 0 && filteredWinners.length === 0}
                    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
                        <div class="text-6xl mb-3">✅</div>
                        <div class="text-emerald-400 font-bold text-lg">¡Análisis exitoso!</div>
                        <div class="text-gray-400 text-sm mt-1">Todas las apuestas fueron procesadas correctamente.</div>
                    </div>
                {/if}
            {/if}
        </div>

        <div class="p-6 bg-white/5 border-t border-white/10 flex justify-between items-center flex-shrink-0">
            {#if !selectedParticipant}
                <div class="flex gap-2 items-center flex-wrap">
                    <button
                        class="px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors flex items-center gap-2"
                        onclick={openMovementModal}
                    >
                        📊 Movimiento
                    </button>
                    <button
                        class="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors flex items-center gap-2"
                        onclick={exportToWhatsApp}
                    >
                        📋 A WhatsApp
                    </button>
                </div>
            {:else}
                <div></div>
            {/if}
            <button
                class="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors"
                onclick={onClose}
            >
                {selectedParticipant ? '← Volver' : 'Continuar'}
            </button>
        </div>
    </div>
</div>

{#if showMovementModal}
    <MovementModal
        {bets}
        {matches}
        winners={filteredWinners}
        onClose={() => showMovementModal = false}
    />
{/if}
