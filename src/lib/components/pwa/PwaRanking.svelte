<script>
    import { onMount } from 'svelte';
    import { appState, uniqueBets, participantPoints } from '../../stores.svelte.js';
    import { loadBetsFromSheets } from '../../api.js';
    import { applyPhoneNameOverrides, parseManualBets } from '../../parser.js';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';

    /** @type {{ onBack: () => void }} */
    let { onBack } = $props();

    let loading = $state(true);

    onMount(() => {
        load();
    });

    async function load() {
        loading = true;
        try {
            if (appState.bets.length === 0) {
                const sheetsBets = await loadBetsFromSheets();
                const manualBets = parseManualBets();
                if (sheetsBets.length > 0) {
                    const betsToAnalyze = applyPhoneNameOverrides(sheetsBets.map((bet) => ({
                        ...bet,
                        verified: false,
                        status: /** @type {any} */ ('pending'),
                        points: Number(bet.points) || 0
                    })));
                    appState.bets = [...betsToAnalyze, ...manualBets];
                } else if (manualBets.length > 0) {
                    appState.bets = manualBets;
                }
            }
        } catch (e) {
            console.error('No pude cargar apuestas para el ranking:', e);
        } finally {
            loading = false;
        }
    }

    const ranking = $derived.by(() => {
        const points = participantPoints();
        return [...points.entries()]
            .map(([participant, pts]) => ({
                participant,
                points: pts,
                resolved: uniqueBets().filter(b => b.participant === participant && b.status !== 'pending').length
            }))
            .sort((a, b) => b.points - a.points);
    });

    function back() {
        if (pwaSession.authUsername) {
            // Si está logueado, volver al form
            setStep('form');
        } else {
            setStep('landing');
        }
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl w-full">
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                onclick={back}
                aria-label="Volver"
            >←</button>
            <h2 class="text-2xl font-bold text-cyan-400">🏆 Ranking</h2>
        </div>

        <div class="text-sm text-gray-400 mb-4 text-center">
            Solo lectura — no requiere iniciar sesión.
        </div>

        {#if loading}
            <div class="text-center py-8">
                <div class="text-5xl mb-3 animate-spin">⚙️</div>
                <p class="text-gray-500">Cargando apuestas…</p>
            </div>
        {:else if ranking.length === 0}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <p class="text-gray-400">Aún no hay apuestas calificadas.</p>
            </div>
        {:else}
            <div class="space-y-2">
                {#each ranking as r, i (r.participant)}
                    {@const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                    <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 {i < 3 ? 'border-cyan-500/40' : ''}">
                        <div class="w-10 text-center text-lg font-bold {i < 3 ? 'text-cyan-400' : 'text-gray-500'}">
                            {medal}
                        </div>
                        <div class="flex-1">
                            <div class="font-bold text-sm md:text-base">{r.participant}</div>
                            <div class="text-xs text-gray-500">{r.resolved} apuestas calificadas</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-black text-cyan-400">{r.points}</div>
                            <div class="text-[10px] uppercase tracking-wider text-gray-500">pts</div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
