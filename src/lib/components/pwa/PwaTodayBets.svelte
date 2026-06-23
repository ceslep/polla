<script>
    import { getFlagData } from '../../flags.js';
    import { PREMATCH_PASSWORD } from '../../pwa/prematchGuard.js';

    /**
     * @type {{
     *   bets?: any[],
     *   matches?: any[],
     *   todayDate?: string,
     *   preMatchInfo?: { required: boolean, firstMatchHHMM: string | null },
     *   onBack: () => void
     * }}
     */
    let {
        bets = [],
        matches = [],
        todayDate = '',
        preMatchInfo = { required: false, firstMatchHHMM: null },
        onBack
    } = $props();

    // ---- Pre-match password gate ----------------------------------------
    // El flag `preMatchInfo.required` se calcula en PwaApp (única fuente
    // de verdad de `rawMatches` + reloj). Acá solo guardamos el estado
    // de UI (input, error, desbloqueo).

    /** @type {string} */
    let passwordInput = $state('');
    /** @type {string} */
    let passwordError = $state('');
    /** Sin persistencia: al desmontar el componente se olvida. */
    let isUnlocked = $state(false);

    const requiresPassword = $derived(preMatchInfo.required && !isUnlocked);

    function checkPassword() {
        if (passwordInput === PREMATCH_PASSWORD) {
            isUnlocked = true;
            passwordError = '';
            passwordInput = '';
        } else {
            passwordError = 'Clave incorrecta';
        }
    }

    /** @param {SubmitEvent} e */
    function handlePasswordSubmit(e) {
        e.preventDefault();
        checkPassword();
    }

    // ---- Filtros y búsqueda (estado UI) ---------------------------------

    /** Texto de búsqueda sobre el nombre del participante. */
    let searchTerm = $state('');

    /** Filtro por estado de la apuesta. 'all' = sin filtro. */
    let statusFilter = $state(/** @type {'all' | 'exact' | 'correct' | 'incorrect' | 'pending'} */('all'));

    /** Modo de ordenamiento. 'alpha' = alfabético, 'points' = por puntos desc. */
    let sortMode = $state(/** @type {'alpha' | 'points'} */('alpha'));

    const hasActiveFilters = $derived(
        searchTerm.trim() !== '' || statusFilter !== 'all' || sortMode !== 'alpha'
    );

    function clearFilters() {
        searchTerm = '';
        statusFilter = 'all';
        sortMode = 'alpha';
    }

    /**
     * Apuestas del día agrupadas por participante y filtradas/ordenadas.
     * Solo incluye bets de tipo 'score' cuya matchDate === todayDate.
     *
     * @typedef {{
     *   participant: string,
     *   bets: any[],
     *   points: number,
     *   resolved: number,
     *   total: number,
     *   isLeader: boolean
     * }} ParticipantBlock
     * @type {ParticipantBlock[]}
     */
    const blocks = $derived.by(() => {
        const today = bets.filter(
            (/** @type {any} */ b) => b.type === 'score' && b.matchDate === todayDate
        );
        /** @type {Map<string, {bets: any[], points: number, resolved: number}>} */
        const acc = new Map();
        for (const b of today) {
            if (!b.participant) continue;
            let cur = acc.get(b.participant);
            if (!cur) {
                cur = { bets: [], points: 0, resolved: 0 };
                acc.set(b.participant, cur);
            }
            cur.bets.push(b);
            if (b.status && b.status !== 'pending') {
                cur.points += Number(b.points) || 0;
                cur.resolved += 1;
            }
        }
        // Construir los bloques base.
        let list = [...acc.entries()].map(([participant, v]) => ({
            participant,
            bets: v.bets.slice().sort((/** @type {any} */ a, /** @type {any} */ b) =>
                String(a.matchDate || '').localeCompare(String(b.matchDate || ''))
            ),
            points: v.points,
            resolved: v.resolved,
            total: v.bets.length
        }));

        // 1. Filtrar por búsqueda de nombre.
        const term = searchTerm.trim().toLowerCase();
        if (term) {
            list = list.filter((b) => b.participant.toLowerCase().includes(term));
        }

        // 2. Filtrar bets dentro de cada bloque por status. Si el bloque
        //    queda sin bets, se oculta.
        if (statusFilter !== 'all') {
            list = list
                .map((b) => {
                    const filteredBets = b.bets.filter(
                        (/** @type {any} */ bet) => (bet.status || 'pending') === statusFilter
                    );
                    return { ...b, bets: filteredBets };
                })
                .filter((b) => b.bets.length > 0);
        }

        // 3. Ordenar.
        if (sortMode === 'points') {
            list.sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                // Desempate: alfabético.
                return a.participant.localeCompare(b.participant, 'es', { sensitivity: 'base' });
            });
        } else {
            list.sort((a, b) =>
                a.participant.localeCompare(b.participant, 'es', { sensitivity: 'base' })
            );
        }

        // 4. Marcar al líder entre los bloques VISIBLES (no entre los
        //    originales) para que el resaltado respete los filtros.
        let maxPoints = 0;
        for (const b of list) {
            if (b.points > maxPoints) maxPoints = b.points;
        }
        return list.map((b) => ({ ...b, isLeader: maxPoints > 0 && b.points === maxPoints }));
    });

    const totalBets = $derived(blocks.reduce((sum, b) => sum + b.bets.length, 0));

    /**
     * Resuelve la flag data (URL del SVG, emoji fallback) para un equipo.
     * Cachea para no recomputar en cada render del loop.
     * @type {Map<string, {flag: string, emoji: string, spanishName: string} | null>}
     */
    const flagCache = $derived.by(() => {
        const cache = new Map();
        for (const block of blocks) {
            for (const bet of block.bets) {
                const pred = bet.prediction || {};
                for (const team of [pred.homeTeam, pred.awayTeam]) {
                    if (team && !cache.has(team)) {
                        cache.set(team, getFlagData(team));
                    }
                }
            }
        }
        return cache;
    });

    /** @param {any} team */
    function flag(team) {
        return flagCache.get(team) || null;
    }

    /** @param {any} bet */
    function statusInfo(bet) {
        const status = bet.status || 'pending';
        const points = Number(bet.points) || 0;
        if (status === 'exact')   return { label: 'Exacto',     sub: `${points} pts`, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/40' };
        if (status === 'correct') return { label: 'Acertó',     sub: `${points} pts`, color: 'text-amber-300',   bg: 'bg-amber-500/15 border-amber-500/40' };
        if (status === 'incorrect') return { label: 'Falló',    sub: '0 pts',       color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/40' };
        return { label: 'Pendiente', sub: '—', color: 'text-gray-400', bg: 'bg-white/5 border-white/10' };
    }

    /**
     * Busca el resultado real del partido desde `matches` para mostrarlo
     * junto a la predicción (cuando el partido ya terminó).
     * @param {any} bet
     */
    function realResultFor(bet) {
        const pred = bet.prediction || {};
        const match = matches.find((/** @type {any} */ m) =>
            m.id === bet.matchId
            || (m.date === bet.matchDate
                && ((m.homeTeam === pred.homeTeam && m.awayTeam === pred.awayTeam)
                    || (m.homeTeam === pred.awayTeam && m.awayTeam === pred.homeTeam)))
        );
        if (match && match.homeScore != null && match.awayScore != null) {
            return { homeScore: match.homeScore, awayScore: match.awayScore };
        }
        return null;
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-3 sm:p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl">
        <!-- Header sticky-like -->
        <div class="mb-4 sm:mb-6 flex items-center gap-3">
            <button
                class="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-lg sm:text-xl transition-all border border-white/10 shrink-0"
                onclick={onBack}
                aria-label="Volver"
            >←</button>
            <div class="flex-1 min-w-0">
                <h2 class="text-lg sm:text-2xl font-bold text-cyan-400 truncate">📅 Apuestas de hoy</h2>
                <p class="text-[11px] sm:text-xs text-gray-400 truncate">
                    {todayDate} · {blocks.length} participante{blocks.length !== 1 ? 's' : ''} · {totalBets} apuesta{totalBets !== 1 ? 's' : ''}
                </p>
            </div>
        </div>

        {#if requiresPassword}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-4">
                <div class="text-5xl mb-3 text-center">🔒</div>
                <h3 class="text-lg sm:text-xl font-bold text-white mb-2 text-center">Apuestas del día bloqueadas</h3>
                {#if preMatchInfo.firstMatchHHMM}
                    <p class="text-sm text-gray-400 mb-4 sm:mb-6 text-center">
                        Los partidos de hoy ({todayDate}) inician a las
                        <span class="text-cyan-300 font-mono">{preMatchInfo.firstMatchHHMM}</span>
                        (hora Colombia). La clave se desactiva 1 minuto antes.
                    </p>
                {:else}
                    <p class="text-sm text-gray-400 mb-4 sm:mb-6 text-center">
                        Ingresa la clave para ver las apuestas del día ({todayDate}) antes de que empiecen los partidos.
                    </p>
                {/if}
                <form onsubmit={handlePasswordSubmit} class="space-y-3 sm:space-y-4">
                    <input
                        type="password"
                        bind:value={passwordInput}
                        placeholder="Clave"
                        autocomplete="off"
                        class="w-full bg-white/5 border-2 border-white/10 focus:border-cyan-500/60 focus:bg-white/[0.07] rounded-2xl px-4 py-3 text-base text-white placeholder-gray-500 outline-none transition-all text-center tracking-widest"
                    />
                    {#if passwordError}
                        <p class="text-red-400 text-sm text-center">{passwordError}</p>
                    {/if}
                    <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                            type="button"
                            class="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all min-h-12"
                            onclick={onBack}
                        >← Volver</button>
                        <button
                            type="submit"
                            class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold transition-all min-h-12 shadow-lg shadow-emerald-500/30"
                        >Entrar →</button>
                    </div>
                </form>
            </div>
        {:else}
            <div class="text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 text-center px-2">
                Solo lectura — no requiere iniciar sesión.
            </div>

        <!-- Barra de búsqueda + filtros -->
        <div class="mb-3 sm:mb-4 space-y-2 sm:space-y-2.5">
            <!-- Buscador -->
            <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base sm:text-lg pointer-events-none" aria-hidden="true">🔍</span>
                <input
                    type="search"
                    inputmode="search"
                    autocomplete="off"
                    placeholder="Buscar participante…"
                    bind:value={searchTerm}
                    aria-label="Buscar participante por nombre"
                    class="w-full bg-white/5 border-2 border-white/10 focus:border-cyan-500/60 focus:bg-white/[0.07] rounded-2xl pl-9 sm:pl-10 pr-9 py-2.5 sm:py-3 text-sm sm:text-base text-white placeholder-gray-500 outline-none transition-all"
                />
                {#if searchTerm}
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white text-lg rounded-lg hover:bg-white/10 transition-colors"
                        onclick={() => searchTerm = ''}
                        aria-label="Limpiar búsqueda"
                    >✕</button>
                {/if}
            </div>

            <!-- Chips de filtro por estado -->
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                {#each [
                    { value: 'all',       label: 'Todos',      icon: '📋' },
                    { value: 'exact',     label: 'Exacto',     icon: '🎯' },
                    { value: 'correct',   label: 'Acertó',     icon: '✅' },
                    { value: 'incorrect', label: 'Falló',      icon: '✗' },
                    { value: 'pending',   label: 'Pendiente',  icon: '⏳' }
                ] as chip (chip.value)}
                    <button
                        type="button"
                        class="shrink-0 inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold border transition-all min-h-8
                            {statusFilter === chip.value
                                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}"
                        onclick={() => statusFilter = /** @type {any} */ (chip.value)}
                        aria-pressed={statusFilter === chip.value}
                    >
                        <span aria-hidden="true">{chip.icon}</span>
                        <span>{chip.label}</span>
                    </button>
                {/each}
            </div>

            <!-- Toggle de orden + limpiar -->
            <div class="flex items-center justify-between gap-2">
                <div class="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5">
                    <button
                        type="button"
                        class="px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold transition-all min-h-7
                            {sortMode === 'alpha'
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : 'text-gray-400 hover:text-white'}"
                        onclick={() => sortMode = 'alpha'}
                        aria-pressed={sortMode === 'alpha'}
                    >A–Z</button>
                    <button
                        type="button"
                        class="px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold transition-all min-h-7
                            {sortMode === 'points'
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : 'text-gray-400 hover:text-white'}"
                        onclick={() => sortMode = 'points'}
                        aria-pressed={sortMode === 'points'}
                    >Por puntos</button>
                </div>
                {#if hasActiveFilters}
                    <button
                        type="button"
                        class="text-xs sm:text-sm text-gray-400 hover:text-white underline transition-colors min-h-7"
                        onclick={clearFilters}
                    >Limpiar filtros</button>
                {/if}
            </div>
        </div>

        <!-- Contador de resultados filtrados -->
        {#if hasActiveFilters}
            <div class="text-[11px] sm:text-xs text-gray-500 mb-2 sm:mb-3 text-center">
                {blocks.length} participante{blocks.length !== 1 ? 's' : ''} · {totalBets} apuesta{totalBets !== 1 ? 's' : ''}
                {#if searchTerm}
                    · búsqueda: <span class="text-cyan-300">"{searchTerm}"</span>
                {/if}
            </div>
        {/if}

        {#if blocks.length === 0}
            {@const emptyBecauseFilters = hasActiveFilters && (bets.some((/** @type {any} */ b) => b.type === 'score' && b.matchDate === todayDate))}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 text-center">
                <div class="text-5xl mb-3">{emptyBecauseFilters ? '🔎' : '📭'}</div>
                {#if emptyBecauseFilters}
                    <p class="text-gray-400 text-sm">No hay apuestas que coincidan con los filtros actuales.</p>
                    <button
                        type="button"
                        class="mt-3 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-xl text-cyan-200 text-sm font-semibold transition-all min-h-9"
                        onclick={clearFilters}
                    >Limpiar filtros</button>
                {:else}
                    <p class="text-gray-400 text-sm">Aún no hay apuestas para hoy ({todayDate}) en la hoja <code class="text-cyan-400 font-mono">apuestas</code>.</p>
                {/if}
            </div>
        {:else}
            <div class="space-y-3 sm:space-y-4">
                {#each blocks as block (block.participant)}
                    <div
                        class="bg-white/5 border {block.isLeader ? 'border-amber-400/60 ring-1 ring-amber-400/30' : 'border-white/10'} rounded-2xl p-3 sm:p-4 transition-all"
                    >
                        <!-- Header del participante -->
                        <div class="flex items-center gap-2 sm:gap-3 mb-2.5 sm:mb-3">
                            <div class="text-xl sm:text-2xl shrink-0 leading-none">{block.isLeader ? '🥇' : '👤'}</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-sm sm:text-base md:text-lg truncate">
                                    {block.participant}
                                </div>
                                <div class="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 truncate">
                                    {block.total} apuesta{block.total !== 1 ? 's' : ''}
                                    {#if block.resolved !== block.total && block.total > 0}
                                        · {block.resolved} calificada{block.resolved !== 1 ? 's' : ''}
                                    {/if}
                                </div>
                            </div>
                            <div class="text-right shrink-0 pl-1">
                                <div class="text-2xl sm:text-3xl font-black {block.isLeader ? 'text-amber-400' : 'text-cyan-400'} leading-none">
                                    {block.points}
                                </div>
                                <div class="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">pts hoy</div>
                            </div>
                        </div>

                        <!-- Lista de apuestas -->
                        <div class="space-y-1.5 sm:space-y-2">
                            {#each block.bets as bet (bet.id || `${bet.participant}-${bet.matchId}-${bet.matchDate}`)}
                                {@const pred = bet.prediction || {}}
                                {@const homeF = flag(pred.homeTeam || '')}
                                {@const awayF = flag(pred.awayTeam || '')}
                                {@const homeName = homeF?.spanishName || pred.homeTeam || '?'}
                                {@const awayName = awayF?.spanishName || pred.awayTeam || '?'}
                                {@const real = realResultFor(bet)}
                                {@const st = statusInfo(bet)}
                                <div class="bg-black/30 border border-white/5 rounded-xl p-2 sm:p-2.5">
                                    <!-- Equipo local -->
                                    <div class="flex items-center gap-2">
                                        <div class="w-7 sm:w-8 shrink-0 flex justify-center">
                                            {#if homeF}
                                                <img
                                                    src={homeF.flag}
                                                    alt={homeName}
                                                    title={homeName}
                                                    loading="lazy"
                                                    class="h-4 w-6 sm:h-5 sm:w-7 rounded-sm ring-1 ring-white/10 object-cover"
                                                />
                                            {:else}
                                                <span class="text-base sm:text-lg" aria-hidden="true">🏳️</span>
                                            {/if}
                                        </div>
                                        <div class="flex-1 min-w-0 text-xs sm:text-sm font-medium truncate">
                                            {homeName}
                                        </div>
                                        <div class="font-mono font-bold text-sm sm:text-base tabular-nums shrink-0 pl-1">
                                            {pred.homeScore ?? '?'}
                                        </div>
                                    </div>
                                    <!-- Equipo visitante -->
                                    <div class="flex items-center gap-2 mt-1">
                                        <div class="w-7 sm:w-8 shrink-0 flex justify-center">
                                            {#if awayF}
                                                <img
                                                    src={awayF.flag}
                                                    alt={awayName}
                                                    title={awayName}
                                                    loading="lazy"
                                                    class="h-4 w-6 sm:h-5 sm:w-7 rounded-sm ring-1 ring-white/10 object-cover"
                                                />
                                            {:else}
                                                <span class="text-base sm:text-lg" aria-hidden="true">🏳️</span>
                                            {/if}
                                        </div>
                                        <div class="flex-1 min-w-0 text-xs sm:text-sm font-medium truncate">
                                            {awayName}
                                        </div>
                                        <div class="font-mono font-bold text-sm sm:text-base tabular-nums shrink-0 pl-1">
                                            {pred.awayScore ?? '?'}
                                        </div>
                                    </div>
                                    <!-- Footer: resultado real + estado -->
                                    <div class="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-white/5">
                                        <div class="text-[10px] sm:text-xs text-gray-500 font-mono tabular-nums truncate">
                                            {#if real}
                                                Real {real.homeScore}-{real.awayScore}
                                            {:else}
                                                <span class="text-gray-600">— sin resultado —</span>
                                            {/if}
                                        </div>
                                        <div
                                            class="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md border {st.bg} text-[10px] sm:text-xs font-semibold whitespace-nowrap shrink-0"
                                        >
                                            <span class={st.color}>{st.label}</span>
                                            {#if bet.status && bet.status !== 'pending'}
                                                <span class="text-gray-400">· {st.sub}</span>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
        {/if}
    </div>
</div>
