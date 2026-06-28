<script>
    import { onMount } from 'svelte';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import PwaParticipantDetailParte2 from './PwaParticipantDetailParte2.svelte';
    import PwaMyBetsModalParte2 from './PwaMyBetsModalParte2.svelte';
    import PwaTournamentBetsModalParte2 from './PwaTournamentBetsModalParte2.svelte';

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

    /** Abre la modal de apuestas especiales (campeón, subcampeón, etc.) */
    let showTournamentBets = $state(false);

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

    /* ──────────────────────────────────────────────────────────────────
     * Derivados SOLO-DISPLAY (no alteran el cálculo del ranking).
     * ────────────────────────────────────────────────────────────────── */

    /** Resumen para los chips del header y para normalizar las barras. */
    const summary = $derived.by(() => ({
        participantes: ranking.length,
        totalApuestas: ranking.reduce((s, r) => s + r.betsCount, 0),
        lider: ranking[0]?.participant ?? '',
        maxPoints: ranking[0]?.points ?? 0
    }));

    /** ¿Hay un término de búsqueda activo? Controla podio vs lista plana. */
    const isSearching = $derived(search.trim().length > 0);

    /** Top-3 para el podio (solo cuando no hay búsqueda y hay ≥3). */
    const podium = $derived(ranking.slice(0, 3));

    /** Puestos 4+ (cuando se muestra el podio). */
    const rest = $derived(ranking.slice(3));

    /**
     * % de puntos relativo al líder, para la barra de progreso (display).
     * @param {number} points
     */
    function pointsPct(points) {
        return summary.maxPoints > 0 ? Math.round((points / summary.maxPoints) * 100) : 0;
    }

    /**
     * Inicial(es) del nombre para el avatar del podio (display-only).
     * @param {string} name
     */
    function initials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    /** Orden visual del podio: 2.º · 1.º · 3.º (el 1.º al centro, elevado). */
    const PODIUM_VISUAL_ORDER = [1, 0, 2];

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

    /* ── Helpers visuales del podio (display-only) ── */

    /** Anillo/acento del avatar del podio según posición lógica. @param {number} i */
    function podiumAvatar(i) {
        if (i === 0) return 'bg-gradient-to-br from-amber-300 to-yellow-600 text-yellow-950 ring-amber-300/60';
        if (i === 1) return 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 ring-slate-200/60';
        return 'bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950 ring-orange-300/60';
    }

    /** Altura del pedestal según posición lógica. @param {number} i */
    function pedestalHeight(i) {
        if (i === 0) return 'h-20 md:h-28';
        if (i === 1) return 'h-14 md:h-20';
        return 'h-10 md:h-14';
    }

    /** Color del pedestal según posición lógica. @param {number} i */
    function pedestalClasses(i) {
        if (i === 0) return 'bg-gradient-to-b from-amber-400/30 to-amber-500/5 border-amber-400/40';
        if (i === 1) return 'bg-gradient-to-b from-slate-300/25 to-slate-400/5 border-slate-300/40';
        return 'bg-gradient-to-b from-orange-400/25 to-orange-500/5 border-orange-400/40';
    }

    const medalEmoji = ['🥇', '🥈', '🥉'];
</script>

<div class="min-h-screen bg-[#0c0c0e] text-white animate-fade-in relative overflow-hidden">
    <!-- Atmósfera: gradiente mesh + blur orbs -->
    <div class="pointer-events-none fixed inset-0 bg-gradient-to-br from-cyan-500/[0.07] via-transparent to-amber-500/[0.07]"></div>
    <div class="pointer-events-none fixed -top-24 -right-20 w-80 h-80 bg-amber-500/10 blur-[100px] rounded-full"></div>
    <div class="pointer-events-none fixed -top-32 -left-20 w-80 h-80 bg-cyan-500/10 blur-[100px] rounded-full"></div>

    <div class="relative w-full max-w-2xl mx-auto p-4 md:p-8">
        <!-- ===== Hero header ===== -->
        <div class="mb-5 flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <button
                    class="w-11 h-11 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-xl transition-all border border-white/10 flex-shrink-0"
                    onclick={back}
                    aria-label="Volver"
                >←</button>
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="text-3xl animate-float">🏆</span>
                    <h2 class="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-white to-amber-300 bg-clip-text text-transparent animate-gradient truncate">
                        Ranking · Parte 2
                    </h2>
                </div>
            </div>

            <!-- Chips de resumen (solo-display) -->
            {#if ranking.length > 0}
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-[11px] md:text-xs font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        👥 {summary.participantes} participantes
                    </span>
                    <span class="text-[11px] md:text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-cyan-300">
                        🎯 {summary.totalApuestas} apuestas
                    </span>
                    {#if summary.lider}
                        <span class="text-[11px] md:text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 max-w-[12rem] truncate">
                            👑 {summary.lider}
                        </span>
                    {/if}
                </div>
            {/if}

            <div class="grid grid-cols-2 gap-2">
                <button
                    class="group w-full px-3 py-3 flex items-center justify-center gap-2 bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 hover:from-cyan-500/30 hover:to-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95"
                    onclick={openMyBets}
                    aria-label="Ver mis apuestas de hoy"
                ><span class="group-hover:scale-110 transition-transform">📋</span> Mis apuestas</button>
                <button
                    class="group w-full px-3 py-3 flex items-center justify-center gap-2 bg-gradient-to-br from-amber-500/20 to-amber-600/10 hover:from-amber-500/30 hover:to-amber-600/20 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95"
                    onclick={() => showTournamentBets = true}
                    aria-label="Ver apuestas especiales del torneo"
                ><span class="group-hover:scale-110 transition-transform">🏆</span> Especiales</button>
            </div>
        </div>

        {#if ranking.length === 0}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-8 text-center animate-fade-in">
                <div class="text-5xl mb-3">📭</div>
                <p class="text-gray-400">Aún no hay apuestas en la hoja <span class="text-cyan-400 font-mono">apuestas2</span>.</p>
            </div>
        {:else}
            <!-- ===== Podio top-3 (solo sin búsqueda y ≥3) ===== -->
            {#if !isSearching && ranking.length >= 3}
                <div class="relative mb-6 pt-10">
                    <!-- Confeti del campeón -->
                    {#if !reducedMotion}
                        <div class="absolute inset-x-0 -top-2 h-full pointer-events-none overflow-visible z-0" aria-hidden="true">
                            {#each confetti as c, ci (ci)}
                                <div
                                    class="absolute rounded-sm"
                                    style="left: {c.left}%; top: 0%; width: {c.size}rem; height: {c.size * 1.25}rem; background: {c.color}; animation: confetti-fall {c.duration}s linear {c.delay}s forwards; transform-origin: center;"
                                ></div>
                            {/each}
                        </div>
                    {/if}

                    <div class="relative z-10 grid grid-cols-3 gap-2 md:gap-3 items-end">
                        {#each PODIUM_VISUAL_ORDER as pos (pos)}
                            {#if podium[pos]}
                                {@const r = podium[pos]}
                                {@const champ = pos === 0}
                                <div
                                    role="button"
                                    tabindex="0"
                                    onclick={() => selectedParticipant = r.participant}
                                    onkeydown={(e) => handleCardKeydown(e, r.participant)}
                                    class="flex flex-col items-center cursor-pointer group {champ ? 'animate-pulse-once' : ''}"
                                >
                                    <!-- Corona del campeón -->
                                    {#if champ}
                                        <div class="text-2xl md:text-3xl mb-1 animate-float">👑</div>
                                    {/if}
                                    <!-- Avatar -->
                                    <div class="relative {champ ? 'animate-glow-pulse rounded-full' : ''}">
                                        <div class="flex items-center justify-center rounded-full ring-2 font-black transition-transform group-hover:scale-105 {podiumAvatar(pos)} {champ ? 'w-16 h-16 md:w-20 md:h-20 text-xl md:text-2xl' : 'w-12 h-12 md:w-16 md:h-16 text-base md:text-xl'}">
                                            {initials(r.participant)}
                                        </div>
                                        <div class="absolute -bottom-1 -right-1 text-lg md:text-2xl animate-medal-bounce">{medalEmoji[pos]}</div>
                                    </div>
                                    <!-- Nombre -->
                                    <div class="mt-2 w-full text-center px-0.5">
                                        <div class="font-bold truncate {champ ? 'text-sm md:text-base text-white' : 'text-xs md:text-sm text-gray-200'}">{r.participant}</div>
                                    </div>
                                    <!-- Puntos -->
                                    <div class="font-black tabular-nums animate-number-pop {champ ? 'text-2xl md:text-3xl text-amber-300' : 'text-lg md:text-xl text-cyan-300'}">{r.points}</div>
                                    <div class="text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">pts</div>
                                    <!-- Pedestal -->
                                    <div class="w-full rounded-t-xl border-t border-x flex items-start justify-center pt-1.5 {pedestalHeight(pos)} {pedestalClasses(pos)}">
                                        <span class="text-base md:text-lg font-black opacity-40">{pos + 1}</span>
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- ===== Búsqueda (sticky) ===== -->
            <div class="sticky top-2 z-20 mb-4">
                <div class="relative">
                    <input
                        type="text"
                        inputmode="search"
                        autocomplete="off"
                        placeholder="🔍 Buscar participante..."
                        bind:value={search}
                        aria-label="Buscar participante"
                        class="w-full bg-gray-900/80 backdrop-blur-md border-2 border-white/10 focus:border-cyan-500/60 focus:bg-gray-900/90 rounded-2xl pl-4 pr-12 py-3 text-white placeholder-gray-500 outline-none transition-all shadow-lg"
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
            </div>

            <!-- ===== Lista de ranking ===== -->
            {#if isSearching}
                {#if filteredRanking.length === 0}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center animate-fade-in">
                        <div class="text-4xl mb-2">🔍</div>
                        <p class="text-gray-400 text-sm">Sin coincidencias para <span class="text-cyan-400 font-semibold">"{search}"</span>.</p>
                    </div>
                {:else}
                    <div class="space-y-2 stagger-children">
                        {#each filteredRanking as r, i (r.participant)}
                            {@const rank = ranking.indexOf(r)}
                            {@render rankRow(r, rank, i)}
                        {/each}
                    </div>
                {/if}
            {:else}
                <div class="space-y-2 stagger-children">
                    {#each rest as r, i (r.participant)}
                        {@render rankRow(r, i + 3, i)}
                    {/each}
                    {#if rest.length === 0}
                        <div class="text-center text-xs text-gray-600 py-4">Solo hay {ranking.length} participante{ranking.length !== 1 ? 's' : ''}.</div>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>

<!--
  Fila de ranking reutilizable.
  @param r  Entrada del ranking.
  @param rank  Posición lógica (0-based) — define medalla y barra.
  @param staggerIdx  Índice para el retraso escalonado.
-->
{#snippet rankRow(/** @type {{participant: string, points: number, resolved: number, betsCount: number}} */ r, /** @type {number} */ rank, /** @type {number} */ staggerIdx)}
    {@const pct = pointsPct(r.points)}
    <div
        role="button"
        tabindex="0"
        onclick={() => selectedParticipant = r.participant}
        onkeydown={(e) => handleCardKeydown(e, r.participant)}
        class="relative flex items-center gap-3 rounded-xl px-3.5 py-3 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 overflow-hidden"
        style="--i: {staggerIdx}"
    >
        <!-- Barra de progreso de fondo (proporcional al líder) -->
        <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/10 to-emerald-500/[0.04] transition-all" style="width: {pct}%"></div>

        <!-- Badge de posición -->
        <div class="relative w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 flex-shrink-0">
            <span class="text-sm font-black text-gray-300 tabular-nums">{rank + 1}</span>
        </div>

        <!-- Nombre + meta -->
        <div class="relative flex-1 min-w-0">
            <div class="font-bold text-sm md:text-base truncate">{r.participant}</div>
            <div class="text-xs text-gray-500">
                {r.betsCount} apuesta{r.betsCount !== 1 ? 's' : ''}
                {#if r.resolved !== r.betsCount}
                    · {r.resolved} calificada{r.resolved !== 1 ? 's' : ''}
                {/if}
            </div>
        </div>

        <!-- Puntos -->
        <div class="relative text-right flex-shrink-0">
            <div class="text-2xl font-black text-cyan-400 tabular-nums">{r.points}</div>
            <div class="text-[10px] uppercase tracking-wider text-gray-500">pts</div>
        </div>
    </div>
{/snippet}

{#if selectedParticipant}
    <PwaParticipantDetailParte2
        participant={selectedParticipant}
        {bets}
        onClose={() => selectedParticipant = null}
    />
{/if}

{#if showMyBets && pwaSession.authPhone}
    <PwaMyBetsModalParte2
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

{#if showTournamentBets}
    <PwaTournamentBetsModalParte2
        onClose={() => showTournamentBets = false}
    />
{/if}

