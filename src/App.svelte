<script>
    import { onMount } from 'svelte';
    import { appState, findMatchForBet, participants } from './lib/stores.svelte.js';
    import { loadMatches, loadMatchesFromGitHub, compareBetWithMatch } from './lib/api.js';
    import DropZone from './lib/components/DropZone.svelte';
    import StatsGrid from './lib/components/StatsGrid.svelte';
    import BetTable from './lib/components/BetTable.svelte';
    import BetModal from './lib/components/BetModal.svelte';
    import WorldCupResultsModal from './lib/components/WorldCupResultsModal.svelte';
    import ResultsModal from './lib/components/ResultsModal.svelte';

    let selectedBet = $state(/** @type {any} */ (null));
    let showResultsModal = $state(false);
    let showAnalysisModal = $state(false);
    let analysisSummary = $state(/** @type {{ summary: { total: number, updated: number, errors: number }, errors: string[], winners: Array<{participant: string, points: number, rank: number}> }} */ ({ summary: { total: 0, updated: 0, errors: 0 }, errors: [], winners: [] }));

    /** @param {any} bet */
    function handleSelectBet(bet) {
        selectedBet = bet;
    }

    /** @param {any[]} updatedBets */
    function handleBetUpdate(updatedBets) {
        console.log('Bets updated:', updatedBets.length);
        if (updatedBets.length > 0) {
            selectedBet = updatedBets[0];
        }
    }

    /** @returns {Array<{participant: string, points: number, rank: number}>} */
    function calculateWinners() {
        const pointsByParticipant = new Map();

        for (const bet of appState.bets) {
            const current = pointsByParticipant.get(bet.participant) || 0;
            pointsByParticipant.set(bet.participant, current + (bet.points || 0));
        }

        const sorted = [...pointsByParticipant.entries()]
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);

        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }

    /**
     * @param {boolean} useGitHub
     */
    async function analyzeBets(useGitHub = false) {
        console.log('analyzeBets called, useGitHub:', useGitHub);
        if (appState.bets.length === 0) {
            console.log('No bets to analyze');
            return;
        }

        appState.isLoading = true;
        /** @type {string[]} */
        const errors = [];
        let updatedCount = 0;

        try {
            console.log('Loading matches...');
            const matches = useGitHub
                ? await loadMatchesFromGitHub()
                : await loadMatches();
            console.log('Matches loaded:', matches.length, matches);
            appState.matches = matches;

            const updatedBets = appState.bets.map(bet => {
                if (bet.status !== 'pending' && bet.verified) return bet;

                const match = findMatchForBet(bet, matches);
                if (match) {
                    const result = compareBetWithMatch(bet, match);
                    updatedCount++;
                    return { ...bet, ...result };
                }
                return bet;
            });

            console.log('Updated bets:', updatedBets.length);
            appState.bets = updatedBets;
            localStorage.setItem('polla_bets', JSON.stringify(updatedBets));

            const winners = calculateWinners();
            analysisSummary = {
                summary: { total: appState.bets.length, updated: updatedCount, errors: errors.length },
                errors,
                winners
            };
            showAnalysisModal = true;
        } catch (err) {
            console.error('Error analyzing bets:', err);
            analysisSummary = {
                summary: { total: appState.bets.length, updated: updatedCount, errors: errors.length + 1 },
                errors: [...errors, err instanceof Error ? err.message : 'Error desconocido'],
                winners: []
            };
            showAnalysisModal = true;
        } finally {
            appState.isLoading = false;
        }
    }

    onMount(() => {
        const saved = localStorage.getItem('polla_bets');
        if (saved) {
            try {
                appState.bets = JSON.parse(saved);
                analyzeBets(true);
            } catch (e) { console.error(e); }
        }
    });
</script>

<main class="min-h-screen bg-[#111] text-white selection:bg-cyan-500/30">
    <header class="bg-black/40 border-b border-white/5 backdrop-blur-md sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <h1 class="text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic tracking-tighter">
                POLLA MUNDIALISTA 2026
            </h1>
            
            <div class="flex gap-4">
                <button
                    class="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-500/20"
                    onclick={() => showResultsModal = true}
                >
                    🌐 Resultados
                </button>
                {#if appState.bets.length > 0}
                    <button
                        class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-semibold transition-all border border-white/10"
                        onclick={() => {
                            if (confirm('¿Estás seguro de querer borrar todos los datos?')) {
                                appState.bets = [];
                                localStorage.removeItem('polla_bets');
                            }
                        }}
                    >
                        Resetear
                    </button>
                    <button
                        class="px-6 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50"
                        onclick={() => analyzeBets(true)}
                        disabled={appState.isLoading}
                    >
                        {appState.isLoading ? 'Analizando...' : '🔗 Analizar con GitHub'}
                    </button>
                    <button
                        class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-sm font-bold transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                        onclick={() => analyzeBets(false)}
                        disabled={appState.isLoading}
                    >
                        {appState.isLoading ? 'Analizando...' : '☁️ Analizar con API'}
                    </button>
                {/if}
            </div>
        </div>
    </header>

    <div class="max-w-7xl mx-auto px-6 py-10">
        {#if appState.bets.length === 0}
            <div class="max-w-2xl mx-auto mt-20 text-center">
                <h2 class="text-4xl font-bold mb-4">🏆 ¡Bienvenido a la Polla!</h2>
                <p class="text-gray-400 mb-12">Carga tu exportación de WhatsApp para empezar a calcular puntos.</p>
                <DropZone />
            </div>
        {:else}
            <StatsGrid />
            <BetTable onSelectBet={handleSelectBet} />
        {/if}
    </div>

    {#if selectedBet}
        <BetModal bet={selectedBet} onClose={() => selectedBet = null} onUpdate={handleBetUpdate} />
    {/if}

    {#if showAnalysisModal}
        <ResultsModal
            summary={analysisSummary.summary}
            errors={analysisSummary.errors}
            winners={analysisSummary.winners}
            bets={appState.bets}
            onClose={() => showAnalysisModal = false}
        />
    {/if}

    {#if showResultsModal}
        <WorldCupResultsModal onClose={() => showResultsModal = false} />
    {/if}
</main>

<style>
    :global(body) {
        background-color: #111;
    }
</style>
