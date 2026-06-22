<script>
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import PwaParticipantDetail from './PwaParticipantDetail.svelte';

    /** @type {{ bets: any[], onBack: () => void }} */
    let { bets = [], onBack } = $props();

    /** Participante seleccionado para ver detalle (null = ninguno). */
    let selectedParticipant = $state(/** @type {string | null} */ (null));

    /** Filtro de búsqueda por nombre (case-insensitive, substring match). */
    let search = $state('');

    /**
     * Ranking calculado desde los PWA bets (hoja `apuestas`), que es la
     * fuente de verdad única de la PWA. Los bets viejos de WhatsApp ya no
     * se cargan (la app principal está apagada).
     *
     * Incluye TODOS los participantes (incluso con 0 puntos).
     */
    const ranking = $derived.by(() => {
        /** @type {Map<string, {points: number, resolved: number, betsCount: number}>} */
        const acc = new Map();
        for (const bet of bets) {
            const p = bet.participant;
            if (!p) continue;
            const cur = acc.get(p) || { points: 0, resolved: 0, betsCount: 0 };
            cur.betsCount += 1;
            if (bet.status !== 'pending') {
                cur.points += Number(bet.points) || 0;
                cur.resolved += 1;
            }
            acc.set(p, cur);
        }
        return [...acc.entries()]
            .map(([participant, v]) => ({
                participant,
                points: v.points,
                resolved: v.resolved,
                betsCount: v.betsCount
            }))
            .sort((a, b) => b.points - a.points);
    });

    /**
     * Ranking filtrado por el término de búsqueda. Coincide por substring
     * case-insensitive sobre el nombre del participante. Si el filtro está
     * vacío, devuelve el ranking completo.
     */
    const filteredRanking = $derived.by(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ranking;
        return ranking.filter(r => r.participant.toLowerCase().includes(q));
    });

    function back() {
        // Si ya envió apuestas hoy, no permitir volver al form.
        if (pwaSession.submitted) {
            setStep('done');
        } else if (pwaSession.authUsername) {
            // Si está logueado, volver al form
            setStep('form');
        } else {
            setStep('landing');
        }
    }

    /**
     * @param {KeyboardEvent} e
     * @param {string} participant
     */
    function handleCardKeydown(e, participant) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectedParticipant = participant;
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

        {#if ranking.length === 0}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <p class="text-gray-400">Aún no hay apuestas en la hoja <span class="text-cyan-400 font-mono">apuestas</span>.</p>
            </div>
        {:else}
            <div class="mb-4 relative">
                <input
                    type="text"
                    inputmode="search"
                    autocomplete="off"
                    placeholder="🔍 Buscar participante..."
                    bind:value={search}
                    aria-label="Buscar participante"
                    class="w-full bg-white/5 border-2 border-white/10 focus:border-cyan-500/60 focus:bg-white/[0.07] rounded-2xl pl-4 pr-12 py-3 text-white placeholder-gray-500 outline-none transition-all"
                />
                {#if search}
                    <button
                        type="button"
                        onclick={() => search = ''}
                        aria-label="Limpiar búsqueda"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-lg transition-all"
                    >✕</button>
                {/if}
            </div>

            {#if filteredRanking.length === 0}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                    <p class="text-gray-400 text-sm">No hay participantes que coincidan con <span class="text-cyan-400 font-semibold">"{search}"</span>.</p>
                </div>
            {:else}
                <div class="space-y-2">
                    {#each filteredRanking as r, i (r.participant)}
                        {@const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                        <div
                            role="button"
                            tabindex="0"
                            onclick={() => selectedParticipant = r.participant}
                            onkeydown={(e) => handleCardKeydown(e, r.participant)}
                            class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg hover:border-cyan-500/30 {i < 3 ? 'border-cyan-500/40' : ''}"
                        >
                            <div class="w-10 text-center text-lg font-bold {i < 3 ? 'text-cyan-400' : 'text-gray-500'}">
                                {medal}
                            </div>
                            <div class="flex-1">
                                <div class="font-bold text-sm md:text-base">{r.participant}</div>
                                <div class="text-xs text-gray-500">
                                    {r.betsCount} apuesta{r.betsCount !== 1 ? 's' : ''}
                                    {#if r.resolved !== r.betsCount}
                                        · {r.resolved} calificada{r.resolved !== 1 ? 's' : ''}
                                    {/if}
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-black text-cyan-400">{r.points}</div>
                                <div class="text-[10px] uppercase tracking-wider text-gray-500">pts</div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    </div>
</div>

{#if selectedParticipant}
    <PwaParticipantDetail
        participant={selectedParticipant}
        {bets}
        onClose={() => selectedParticipant = null}
    />
{/if}
