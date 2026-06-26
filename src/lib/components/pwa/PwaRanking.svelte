<script>
    import { onMount } from 'svelte';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import PwaParticipantDetail from './PwaParticipantDetail.svelte';
    import PwaMyBetsModal from './PwaMyBetsModal.svelte';

    /** @type {{
     *   bets: any[],
     *   onBack: () => void,
     *   canGoBet?: boolean,
     *   onGoBet?: () => void,
     *   onRefresh?: () => Promise<void>
     * }} */
    let {
        bets = [],
        onBack,
        canGoBet = false,
        onGoBet = () => {},
        onRefresh = async () => {}
    } = $props();

    /** Participante seleccionado para ver detalle (null = ninguno). */
    let selectedParticipant = $state(/** @type {string | null} */ (null));

    /** Abre el modal "Mis apuestas de hoy". Si no hay sesión activa, manda
     *  al usuario a login en vez de abrir el modal (caso anónimo en
     *  ranking público). */
    let showMyBets = $state(false);

    /** Respeta preferencia de movimiento reducido. */
    let reducedMotion = $state(false);

    onMount(() => {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    function openMyBets() {
        if (!pwaSession.authPhone) {
            setStep('login');
        } else {
            showMyBets = true;
        }
    }

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

    /**
     * Confeti dorado para el primer puesto. Generado una sola vez.
     */
    const confetti = $derived.by(() => {
        const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#10b981', '#06b6d4', '#f472b6'];
        return Array.from({ length: 28 }, (_, i) => ({
            left: 8 + Math.random() * 84,
            delay: Math.random() * 1.2,
            duration: 2 + Math.random() * 2,
            color: colors[i % colors.length],
            size: 0.35 + Math.random() * 0.4
        }));
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

    /**
     * Devuelve las clases del podio según la posición.
     * @param {number} i
     */
    function podiumClasses(i) {
        if (i === 0) {
            return 'bg-gradient-to-r from-yellow-500/20 via-amber-500/15 to-yellow-500/20 border-amber-400/60 shadow-[0_0_22px_rgba(251,191,36,0.18)] animate-glow-pulse';
        }
        if (i === 1) {
            return 'bg-gradient-to-r from-slate-400/20 via-gray-300/15 to-slate-400/20 border-slate-300/60 shadow-[0_0_18px_rgba(203,213,225,0.12)]';
        }
        return 'bg-gradient-to-r from-orange-500/20 via-amber-700/15 to-orange-500/20 border-orange-400/60 shadow-[0_0_18px_rgba(251,146,60,0.12)]';
    }

    /**
     * Devuelve las clases de la medalla según la posición.
     * @param {number} i
     */
    function medalClasses(i) {
        if (i === 0) return 'text-amber-400 animate-float';
        if (i === 1) return 'text-slate-300 animate-float';
        if (i === 2) return 'text-orange-400 animate-float';
        return 'text-gray-500';
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center animate-fade-in">
    <div class="w-full max-w-2xl">
        <div class="mb-6 flex flex-col gap-3">
            <div class="flex items-center gap-3">
                <button
                    class="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                    onclick={back}
                    aria-label="Volver"
                >←</button>
                <h2 class="text-2xl font-bold text-cyan-400 flex-1">🏆 Ranking</h2>
            </div>
            <button
                class="w-full px-3 py-3 flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-semibold transition-all"
                onclick={openMyBets}
                aria-label="Ver mis apuestas de hoy"
            >📋 Mis apuestas</button>
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
                <div class="space-y-2 stagger-children">
                    {#each filteredRanking as r, i (r.participant)}
                        {@const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                        {@const isPodium = i < 3}
                        <div class="relative" style="--i: {i}">
                            {#if i === 0 && !reducedMotion}
                                <div class="absolute -inset-2 pointer-events-none overflow-visible z-0" aria-hidden="true">
                                    {#each confetti as c}
                                        <div
                                            class="absolute rounded-sm"
                                            style="left: {c.left}%; top: -10%; width: {c.size}rem; height: {c.size * 1.25}rem; background: {c.color}; animation: confetti-fall {c.duration}s linear {c.delay}s forwards; transform-origin: center;"
                                        ></div>
                                    {/each}
                                </div>
                            {/if}
                            <div
                                role="button"
                                tabindex="0"
                                onclick={() => selectedParticipant = r.participant}
                                onkeydown={(e) => handleCardKeydown(e, r.participant)}
                                class="relative z-10 flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg border-2 {isPodium ? podiumClasses(i) : 'bg-white/5 border-white/10 hover:border-cyan-500/30'} {isPodium ? 'overflow-hidden animate-shine' : ''}"
                            >
                                <div class="w-10 text-center text-lg font-bold {medalClasses(i)}">
                                    {medal}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm md:text-base truncate">{r.participant}</div>
                                    <div class="text-xs text-gray-500">
                                        {r.betsCount} apuesta{r.betsCount !== 1 ? 's' : ''}
                                        {#if r.resolved !== r.betsCount}
                                            · {r.resolved} calificada{r.resolved !== 1 ? 's' : ''}
                                        {/if}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-2xl font-black {isPodium ? 'text-white' : 'text-cyan-400'}">{r.points}</div>
                                    <div class="text-[10px] uppercase tracking-wider {isPodium ? 'text-white/70' : 'text-gray-500'}">pts</div>
                                </div>
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

{#if showMyBets && pwaSession.authPhone}
    <PwaMyBetsModal
        {bets}
        phone={pwaSession.authPhone}
        todayDate={pwaSession.date ?? ''}
        participantName={pwaSession.authParticipant ?? ''}
        {canGoBet}
        onGoBet={onGoBet}
        onRefresh={onRefresh}
        onClose={() => showMyBets = false}
    />
{/if}
