<script>
    import { appState } from '../stores.svelte.js';

    let { name, onClose = () => {} } = $props();

    let activeTab = $state('all');

    const participant = $derived(() => {
        return appState.bets.find(b => b.participant === name)?.participant || 'Desconocido';
    });

    const participantBets = $derived(() => {
        return appState.bets.filter(b => b.participant === name);
    });

    const stats = $derived(() => {
        const bets = participantBets().filter(b => b.status !== 'pending');
        return {
            exact: bets.filter(b => b.status === 'exact').length,
            correct: bets.filter(b => b.status === 'correct').length,
            incorrect: bets.filter(b => b.status === 'incorrect').length,
            pending: participantBets().filter(b => b.status === 'pending').length,
            points: participantBets().reduce((sum, b) => sum + (Number(b.points) || 0), 0),
            total: participantBets().length
        };
    });

    const participantRank = $derived(() => {
        const map = new Map();
        for (const bet of appState.bets) {
            if (!map.has(bet.participant)) {
                map.set(bet.participant, { name: bet.participant, points: 0 });
            }
            map.get(bet.participant).points += Number(bet.points) || 0;
        }
        const sorted = [...map.values()].sort((a, b) => b.points - a.points);
        const index = sorted.findIndex(p => p.name === name);
        return {
            position: index + 1,
            total: sorted.length
        };
    });

    const filteredBets = $derived(() => {
        const bets = participantBets();
        switch (activeTab) {
            case 'exact': return bets.filter(b => b.status === 'exact');
            case 'correct': return bets.filter(b => b.status === 'correct');
            case 'incorrect': return bets.filter(b => b.status === 'incorrect');
            case 'pending': return bets.filter(b => b.status === 'pending');
            default: return bets;
        }
    });

    const tomorrowMatches = $derived(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const tomorrowMatchesList = appState.matches.filter(/** @param {any} m */ m => m.date === tomorrowStr);

        const betTeams = new Set(
            participantBets()
                .filter(/** @param {any} b */ b => b.type === 'score')
                .map(/** @param {any} b */ b => {
                    const h = (b.prediction?.homeTeam || '').toLowerCase();
                    const a = (b.prediction?.awayTeam || '').toLowerCase();
                    return [h, a].sort().join('|');
                })
        );

        return tomorrowMatchesList.filter(/** @param {any} m */ m => {
            const matchKey = [m.homeTeam.toLowerCase(), m.awayTeam.toLowerCase()].sort().join('|');
            return !betTeams.has(matchKey);
        });
    });

    /** @param {string} dateStr */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    /** @param {string} status */
    function getStatusBadge(status) {
        switch (status) {
            case 'exact': return { label: 'EXACTA', class: 'bg-cyan-500/20 text-cyan-400' };
            case 'correct': return { label: 'ACIERTO', class: 'bg-emerald-500/20 text-emerald-400' };
            case 'incorrect': return { label: 'ERRADA', class: 'bg-red-500/20 text-red-400' };
            case 'pending': return { label: 'PENDIENTE', class: 'bg-orange-500/20 text-orange-400' };
            default: return { label: status, class: 'bg-gray-500/20 text-gray-400' };
        }
    }
</script>

<div class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" role="dialog" onclick={() => onClose()}>
    <div class="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" role="document" onclick={(e) => e.stopPropagation()}>
        <div class="p-4 border-b border-white/10">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white">{participant()}</h2>
                    <p class="text-gray-400 text-sm">{appState.bets.find(b => b.participant === name)?.phone || ''}</p>
                    <p class="text-yellow-400 font-medium mt-1">
                        Puesto {participantRank().position} de {participantRank().total} participantes
                        <span class="text-gray-500">•</span>
                        <span class="font-bold text-yellow-400">{stats().points} puntos</span>
                    </p>
                </div>
                <button onclick={() => onClose()} class="text-gray-400 hover:text-white text-2xl cursor-pointer">&times;</button>
            </div>
        </div>

        <div class="p-4 border-b border-white/10">
            <div class="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
                <div class="bg-cyan-500/10 rounded-lg p-2 md:p-3">
                    <div class="text-xl md:text-2xl font-bold text-cyan-400">{stats().exact}</div>
                    <div class="text-xs text-gray-400">Exactas</div>
                </div>
                <div class="bg-emerald-500/10 rounded-lg p-2 md:p-3">
                    <div class="text-xl md:text-2xl font-bold text-emerald-400">{stats().correct}</div>
                    <div class="text-xs text-gray-400">Aciertos</div>
                </div>
                <div class="bg-red-500/10 rounded-lg p-2 md:p-3">
                    <div class="text-xl md:text-2xl font-bold text-red-400">{stats().incorrect}</div>
                    <div class="text-xs text-gray-400">Erradas</div>
                </div>
                <div class="bg-orange-500/10 rounded-lg p-2 md:p-3">
                    <div class="text-xl md:text-2xl font-bold text-orange-400">{stats().pending}</div>
                    <div class="text-xs text-gray-400">Pendientes</div>
                </div>
                <div class="col-span-1 md:col-span-1 bg-yellow-500/20 rounded-lg p-2 md:p-3 border border-yellow-500/30">
                    <div class="text-xl md:text-2xl font-black text-yellow-400">{stats().points}</div>
                    <div class="text-xs text-yellow-400/70 uppercase font-bold">Puntos</div>
                </div>
            </div>
        </div>

        <div class="p-4 border-b border-white/10">
            <div class="flex gap-2 flex-wrap overflow-x-auto pb-1 -mx-1 px-1">
                <button
                    onclick={() => activeTab = 'all'}
                    class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                >
                    Todas
                </button>
                <button
                    onclick={() => activeTab = 'exact'}
                    class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {activeTab === 'exact' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                >
                    Exactas
                </button>
                <button
                    onclick={() => activeTab = 'correct'}
                    class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {activeTab === 'correct' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                >
                    Aciertos
                </button>
                <button
                    onclick={() => activeTab = 'incorrect'}
                    class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {activeTab === 'incorrect' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                >
                    Erradas
                </button>
                <button
                    onclick={() => activeTab = 'pending'}
                    class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap {activeTab === 'pending' ? 'bg-orange-500/20 text-orange-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                >
                    Pendientes
                </button>
            </div>
        </div>

        <div class="p-4 overflow-y-auto max-h-[40vh]">
            {#if filteredBets().length === 0}
                <p class="text-gray-500 text-center py-8">No hay apuestas en esta categoría</p>
            {:else}
                <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[400px]">
                        <thead class="text-left text-gray-400">
                            <tr>
                                <th class="pb-2">Fecha</th>
                                <th class="pb-2">Apuesta</th>
                                <th class="pb-2">Resultado</th>
                                <th class="pb-2 text-right">Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredBets() as bet}
                                {@const badge = getStatusBadge(bet.status)}
                                <tr class="border-t border-white/5">
                                    <td class="py-2 text-gray-400 whitespace-nowrap">{bet.timestamp ? bet.timestamp.split(' ')[0] : '-'}</td>
                                    <td class="py-2">{bet.bet_text}</td>
                                    <td class="py-2">
                                        <span class="px-2 py-0.5 rounded text-xs {badge.class}">{badge.label}</span>
                                    </td>
                                    <td class="py-2 text-right font-medium {bet.points > 0 ? 'text-yellow-400' : 'text-gray-500'}">
                                        {Number(bet.points) || 0}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>

        {#if tomorrowMatches().length > 0}
            <div class="p-4 border-t border-white/10 bg-orange-500/5">
                <h3 class="text-sm font-bold text-orange-400 mb-3">⚽ Próximos partidos de mañana - ¡Aún no has apostado!</h3>
                <div class="grid gap-2">
                    {#each tomorrowMatches() as match}
                        <div class="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2">
                            <span class="text-gray-300">{match.homeTeam}</span>
                            <span class="text-gray-500 mx-3">vs</span>
                            <span class="text-gray-300">{match.awayTeam}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>
