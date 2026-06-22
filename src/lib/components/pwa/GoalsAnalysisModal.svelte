<script>
    import { onMount } from 'svelte';
    import { loadWorldCupMatches } from '../../api.js';
    import { getFlagData } from '../../flags.js';

    /** @type {{ onClose: () => void }} */
    let { onClose } = $props();

    /**
     * @typedef {Object} WorldCupMatchRaw
     * @property {string} round
     * @property {string} date
     * @property {string} time
     * @property {string} team1
     * @property {string} team2
     * @property {string} [group]
     * @property {string} ground
     * @property {{ft: [number, number], ht: [number, number]}} [score]
     * @property {Array<{name: string, minute: string}>} [goals1]
     * @property {Array<{name: string, minute: string}>} [goals2]
     */

    /** @type {WorldCupMatchRaw[]} */
    let matches = $state([]);
    let isLoading = $state(true);
    /** @type {string | null} */
    let error = $state(null);
    /** @type {'resumen' | 'partidos' | 'equipos' | 'curiosidades'} */
    let tab = $state('resumen');
    /** @type {number | null} */
    let expandedMatch = $state(null);

    onMount(() => {
        load();
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    });

    function handleKey(/** @type {KeyboardEvent} */ e) {
        if (e.key === 'Escape') onClose();
    }

    async function load() {
        isLoading = true;
        error = null;
        try {
            matches = await loadWorldCupMatches();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Error cargando partidos';
        } finally {
            isLoading = false;
        }
    }

    /**
     * Stats agregadas. `$derived.by` para que se recalcule cuando `matches`
     * cambie (ej. si el usuario recarga el modal).
     */
    const stats = $derived.by(() => {
        const finished = matches.filter((/** @type {any} */ m) => m.score?.ft);
        let totalGoals = 0;
        let totalHtGoals = 0;
        let total2hGoals = 0;
        let htPairs = 0;
        let cleanSheets = 0;
        let blowouts = 0; // diferencia >= 4
        /** @type {Map<string, {total: number, ht: number, ft2h: number, count: number}>} */
        const goalsByDate = new Map();
        /** @type {Map<string, {gf: number, gc: number, played: number, gfHt: number, gf2h: number}>} */
        const teamAgg = new Map();
        /** @type {Array<{date: string, total: number, ht: number, ft2h: number, count: number}>} */
        const perDateRows = [];

        /** @type {Map<string, {goals: number, team: string}>} */
        const scorerAgg = new Map();
        /** @type {Array<{match: any, team: 1 | 2, goals: number}>} */
        const hatTricks = [];

        /** @type {any[]} */
        const perMatch = [];
        let highestScoring = /** @type {any | null} */ (null);
        let biggestComeback = /** @type {any | null} */ (null);
        let biggestBlowout = /** @type {any | null} */ (null);

        for (const m of finished) {
            const score = m.score;
            if (!score) continue;
            const ft = score.ft;
            const ht = score.ht;
            const ftTotal = ft[0] + ft[1];
            const htTotal = ht ? ht[0] + ht[1] : 0;
            const ft2h = ht ? ftTotal - htTotal : ftTotal;

            totalGoals += ftTotal;
            if (ht) {
                totalHtGoals += htTotal;
                total2hGoals += ft2h;
                htPairs++;
            } else {
                // Sin HT: lo cuento todo como 2H (no se puede separar)
                total2hGoals += ftTotal;
            }

            // Goles por fecha
            const dKey = m.date;
            const cur = goalsByDate.get(dKey) || { total: 0, ht: 0, ft2h: 0, count: 0 };
            cur.total += ftTotal;
            cur.ht += htTotal;
            cur.ft2h += ft2h;
            cur.count += 1;
            goalsByDate.set(dKey, cur);

            // Acumulado equipos
            const h = m.team1;
            const a = m.team2;
            const htH = ht ? ht[0] : 0;
            const htA = ht ? ht[1] : 0;
            const hAgg = teamAgg.get(h) || { gf: 0, gc: 0, played: 0, gfHt: 0, gf2h: 0 };
            const aAgg = teamAgg.get(a) || { gf: 0, gc: 0, played: 0, gfHt: 0, gf2h: 0 };
            hAgg.gf += ft[0]; hAgg.gc += ft[1]; hAgg.played++;
            hAgg.gfHt += htH; hAgg.gf2h += (ft[0] - htH);
            aAgg.gf += ft[1]; aAgg.gc += ft[0]; aAgg.played++;
            aAgg.gfHt += htA; aAgg.gf2h += (ft[1] - htA);
            teamAgg.set(h, hAgg);
            teamAgg.set(a, aAgg);

            // Porterías a cero
            if (ft[0] === 0 || ft[1] === 0) cleanSheets++;

            // Goleadas (dif >= 4)
            const diff = Math.abs(ft[0] - ft[1]);
            if (diff >= 4) {
                blowouts++;
                if (!biggestBlowout || diff > Math.abs(biggestBlowout.score.ft[0] - biggestBlowout.score.ft[1])) {
                    biggestBlowout = m;
                }
            }

            // Highest scoring
            if (!highestScoring || ftTotal > highestScoring._totalGoals) {
                highestScoring = { ...m, _totalGoals: ftTotal };
            }

            // Remontada: iban perdiendo al HT y ganaron (o empataron con remontada)
            if (ht && ((ht[0] < ft[0] && ht[1] > ht[0] && ft[0] > ft[1]) || (ht[1] < ft[0] && ht[0] > ht[1] && ft[1] > ft[0]))) {
                if (!biggestComeback) biggestComeback = m;
            }

            // Goleadores (hat-tricks)
            for (const g of (m.goals1 || [])) {
                const k = g.name;
                const sa = scorerAgg.get(k) || { goals: 0, team: m.team1 };
                sa.goals++;
                scorerAgg.set(k, sa);
            }
            for (const g of (m.goals2 || [])) {
                const k = g.name;
                const sa = scorerAgg.get(k) || { goals: 0, team: m.team2 };
                sa.goals++;
                scorerAgg.set(k, sa);
            }

            const t1HatTrick = (m.goals1 || []).length >= 3;
            const t2HatTrick = (m.goals2 || []).length >= 3;
            if (t1HatTrick) hatTricks.push({ match: m, team: /** @type {1} */ (1), goals: (m.goals1 || []).length });
            if (t2HatTrick) hatTricks.push({ match: m, team: /** @type {2} */ (2), goals: (m.goals2 || []).length });

            perMatch.push({
                date: m.date,
                time: m.time,
                team1: m.team1,
                team2: m.team2,
                ft: ft,
                ht: ht || null,
                htGoals: htTotal,
                ft2hGoals: ft2h,
                total: ftTotal,
                group: m.group,
                round: m.round,
                goals1: m.goals1 || [],
                goals2: m.goals2 || []
            });
        }

        // Filas por fecha (ordenadas)
        for (const [date, v] of goalsByDate) {
            perDateRows.push({ date, total: v.total, ht: v.ht, ft2h: v.ft2h, count: v.count });
        }
        perDateRows.sort((a, b) => a.date.localeCompare(b.date));

        // Equipos ordenados por goles a favor
        const teamRows = [...teamAgg.entries()].map(([team, v]) => ({
            team,
            gf: v.gf,
            gc: v.gc,
            played: v.played,
            gfHt: v.gfHt,
            gf2h: v.gf2h,
            gd: v.gf - v.gc,
            gfPerGame: v.played ? +(v.gf / v.played).toFixed(2) : 0,
            gcPerGame: v.played ? +(v.gc / v.played).toFixed(2) : 0,
            secondHalfPct: v.gf > 0 ? +((v.gf2h / v.gf) * 100).toFixed(1) : 0
        }));

        const topAttacks = teamRows
            .slice()
            .sort((a, b) => b.gfPerGame - a.gfPerGame || b.gf - a.gf)
            .slice(0, 10);
        const topDefenses = teamRows
            .slice()
            .sort((a, b) => a.gcPerGame - b.gcPerGame || a.gc - b.gc)
            .slice(0, 10);
        const secondHalfTeams = teamRows
            .filter(t => t.gf >= 3)
            .slice()
            .sort((a, b) => b.secondHalfPct - a.secondHalfPct)
            .slice(0, 10);

        // Goleadores ordenados (con equipo para mostrar bandera)
        const scorers = [...scorerAgg.entries()]
            .map(([name, v]) => ({ name, goals: v.goals, team: v.team }))
            .sort((a, b) => b.goals - a.goals);

        return {
            finishedCount: finished.length,
            totalMatches: matches.length,
            pendingCount: matches.length - finished.length,
            totalGoals,
            totalHtGoals,
            total2hGoals,
            htPairs,
            avgGoals: finished.length ? +(totalGoals / finished.length).toFixed(2) : 0,
            cleanSheets,
            blowouts,
            perDateRows,
            perMatch,
            teamRows,
            topAttacks,
            topDefenses,
            secondHalfTeams,
            scorers,
            hatTricks,
            highestScoring,
            biggestBlowout,
            biggestComeback
        };
    });

    const maxDateGoals = $derived(
        stats.perDateRows.length ? Math.max(...stats.perDateRows.map(r => r.total)) : 1
    );

    /** Devuelve el nombre español del equipo (o el original si no hay). */
    function nameOf(/** @type {string} */ team) {
        return getFlagData(team)?.spanishName || team;
    }
    /** Devuelve la URL de la bandera del equipo (o string vacío). */
    function flagOf(/** @type {string} */ team) {
        return getFlagData(team)?.flag || '';
    }

    /** Etiqueta corta de fase: Octavos/Cuartos/etc. */
    function shortRound(/** @type {string} */ round) {
        const map = {
            'Round of 32': 'Octavos',
            'Round of 16': 'Cuartos',
            'Quarter-final': 'Semis',
            'Semi-final': 'Semifinal',
            'Match for third place': '3.er lugar',
            'Final': 'Final'
        };
        return map[/** @type {keyof typeof map} */ (round)] || round;
    }

    /** Formato corto de fecha YYYY-MM-DD → DD/MM. */
    function shortDate(/** @type {string} */ d) {
        if (!d) return '';
        const [y, m, dd] = d.split('-');
        return `${dd}/${m}`;
    }

    /** Devuelve un ratio legible 1.6 = 1.6. */
    function round1(/** @type {number} */ n) {
        return Math.round(n * 10) / 10;
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-4"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="goals-title"
    onclick={(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) onClose(); }}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 text-white border border-white/10 rounded-none md:rounded-3xl w-full max-w-5xl h-full md:h-auto md:max-h-[92vh] overflow-hidden shadow-2xl flex flex-col" onclick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}>
        <!-- Header -->
        <div class="p-3 md:p-5 border-b border-white/10 flex justify-between items-center flex-shrink-0 gap-2">
            <div class="flex items-center gap-2 md:gap-3 min-w-0">
                <span class="text-2xl md:text-3xl shrink-0">⚽</span>
                <div class="min-w-0">
                    <h2 id="goals-title" class="text-base md:text-xl font-bold text-cyan-400 truncate">Análisis de goles</h2>
                    <p class="text-[10px] md:text-xs text-gray-400 truncate">
                        {#if isLoading}
                            Cargando…
                        {:else if error}
                            <span class="text-red-400">{error}</span>
                        {:else}
                            Mundial 2026 · {stats.finishedCount} partidos jugados
                        {/if}
                    </p>
                </div>
            </div>
            <button
                class="w-10 h-10 md:w-11 md:h-11 shrink-0 flex items-center justify-center text-gray-400 hover:text-white text-2xl md:text-3xl rounded-xl hover:bg-white/10 transition-colors"
                onclick={onClose}
                aria-label="Cerrar"
            >&times;</button>
        </div>

        <!-- Tabs -->
        <div class="border-b border-white/10 flex-shrink-0 overflow-x-auto">
            <div class="flex items-center gap-1 p-2 min-w-max">
                {#each [
                    { key: 'resumen', label: 'Resumen', emoji: '📊' },
                    { key: 'partidos', label: 'Por partido', emoji: '📋' },
                    { key: 'equipos', label: 'Por equipo', emoji: '🛡️' },
                    { key: 'curiosidades', label: 'Curiosidades', emoji: '✨' }
                ] as t}
                    <button
                        class="px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap {tab === t.key ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/10'}"
                        onclick={() => tab = /** @type {any} */ (t.key)}
                    >
                        <span class="mr-1">{t.emoji}</span>{t.label}
                    </button>
                {/each}
            </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-3 md:p-6">
            {#if isLoading}
                <div class="flex flex-col items-center justify-center py-16">
                    <div class="text-5xl mb-3 animate-spin">⚙️</div>
                    <p class="text-gray-400 text-sm">Cargando partidos del mundial…</p>
                </div>
            {:else if error}
                <div class="text-center py-16">
                    <div class="text-4xl mb-3">⚠️</div>
                    <p class="text-red-300 mb-4 text-sm">{error}</p>
                    <button class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-sm font-bold" onclick={load}>
                        🔄 Reintentar
                    </button>
                </div>
            {:else if stats.finishedCount === 0}
                <div class="text-center py-16">
                    <div class="text-5xl mb-3">⏳</div>
                    <p class="text-gray-400 text-sm">Aún no hay partidos finalizados.</p>
                </div>
            {:else if tab === 'resumen'}
                <!-- ======= TAB: RESUMEN ======= -->
                <div class="space-y-4 md:space-y-6">
                    <!-- Cards de totales -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                        <div class="bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-emerald-300/80 uppercase font-bold tracking-wider">Goles totales</div>
                            <div class="text-2xl md:text-4xl font-black text-emerald-400 tabular-nums">{stats.totalGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">{stats.avgGoals} / partido</div>
                        </div>
                        <div class="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-amber-300/80 uppercase font-bold tracking-wider">1.er tiempo</div>
                            <div class="text-2xl md:text-4xl font-black text-amber-400 tabular-nums">{stats.totalHtGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">
                                {stats.totalGoals > 0 ? Math.round(stats.totalHtGoals / stats.totalGoals * 100) : 0}% del total
                            </div>
                        </div>
                        <div class="bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-purple-300/80 uppercase font-bold tracking-wider">2.º tiempo</div>
                            <div class="text-2xl md:text-4xl font-black text-purple-400 tabular-nums">{stats.total2hGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">
                                {stats.totalGoals > 0 ? Math.round(stats.total2hGoals / stats.totalGoals * 100) : 0}% del total
                            </div>
                        </div>
                        <div class="bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-cyan-300/80 uppercase font-bold tracking-wider">Partidos</div>
                            <div class="text-2xl md:text-4xl font-black text-cyan-400 tabular-nums">{stats.finishedCount}<span class="text-sm md:text-lg text-gray-500 font-normal">/{stats.totalMatches}</span></div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">{stats.pendingCount} pendientes</div>
                        </div>
                    </div>

                    <!-- Gráfico de barras: goles por jornada -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5">
                        <h3 class="text-sm md:text-base font-bold text-white mb-3 md:mb-4">📅 Goles por jornada</h3>
                        {#if stats.perDateRows.length === 0}
                            <p class="text-gray-400 text-xs">Sin datos.</p>
                        {:else}
                            <div class="flex items-end gap-1 md:gap-2 h-32 md:h-40 overflow-x-auto pb-1">
                                {#each stats.perDateRows as row}
                                    <div class="flex-1 min-w-[40px] md:min-w-[60px] flex flex-col items-center justify-end gap-1">
                                        <div class="text-[9px] md:text-xs text-gray-300 font-bold tabular-nums">{row.total}</div>
                                        <div
                                            class="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-400 relative overflow-hidden"
                                            style="height: {(100 * row.total / maxDateGoals).toFixed(1)}%"
                                            title="{row.date}: {row.total} goles ({row.ht} HT, {row.ft2h} ST, {row.count} partidos)"
                                        >
                                            {#if row.ht > 0}
                                                <div
                                                    class="absolute bottom-0 left-0 right-0 bg-amber-500/70"
                                                    style="height: {(100 * row.ht / row.total).toFixed(1)}%"
                                                ></div>
                                            {/if}
                                        </div>
                                        <div class="text-[9px] md:text-[10px] text-gray-500 tabular-nums">{shortDate(row.date)}</div>
                                    </div>
                                {/each}
                            </div>
                            <div class="flex items-center gap-3 mt-3 text-[10px] md:text-xs text-gray-400">
                                <span class="flex items-center gap-1"><span class="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-amber-500/70"></span>1.er tiempo</span>
                                <span class="flex items-center gap-1"><span class="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-emerald-400"></span>2.º tiempo</span>
                            </div>
                        {/if}
                    </div>

                    <!-- Stats rápidos -->
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-gray-400">Porterías a cero</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums">{stats.cleanSheets}</div>
                        </div>
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-gray-400">Goleadas (4+ dif.)</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums">{stats.blowouts}</div>
                        </div>
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 col-span-2 md:col-span-1">
                            <div class="text-[10px] md:text-xs text-gray-400">Hat-tricks</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums">{stats.hatTricks.length}</div>
                        </div>
                    </div>
                </div>

            {:else if tab === 'partidos'}
                <!-- ======= TAB: POR PARTIDO ======= -->
                <div class="space-y-2">
                    <div class="text-[10px] md:text-xs text-gray-500 mb-2">
                        {stats.perMatch.length} partidos · toca una fila para ver goleadores
                    </div>
                    {#each stats.perMatch.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')) as m, i (i)}
                        {@const expanded = expandedMatch === i}
                        {@const is2hHeavy = m.ft2hGoals > m.htGoals}
                        <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <button
                                class="w-full p-3 md:p-4 text-left hover:bg-white/5 transition-colors"
                                onclick={() => expandedMatch = expanded ? null : i}
                            >
                                <div class="flex items-center gap-2 md:gap-3">
                                    <div class="text-[10px] md:text-xs text-gray-500 w-12 md:w-16 shrink-0 tabular-nums">{shortDate(m.date)}</div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-xs md:text-sm font-semibold truncate flex items-center gap-1 md:gap-1.5 flex-wrap">
                                            {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" />{/if}
                                            <span class="truncate">{nameOf(m.team1)}</span>
                                            <span class="text-cyan-400 tabular-nums">{m.ft[0]}</span>
                                            <span class="text-gray-500 mx-0.5">-</span>
                                            <span class="text-cyan-400 tabular-nums">{m.ft[1]}</span>
                                            <span class="truncate">{nameOf(m.team2)}</span>
                                            {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" />{/if}
                                        </div>
                                        <div class="text-[10px] md:text-xs text-gray-500 mt-0.5">
                                            {#if m.ht}
                                                HT {m.ht[0]}-{m.ht[1]} ·
                                                <span class="text-amber-400">1T {m.htGoals}</span> ·
                                                <span class="text-emerald-400">2T {m.ft2hGoals}</span>
                                                {#if is2hHeavy}<span class="text-purple-400"> · 2.º T caliente</span>{/if}
                                            {:else}
                                                <span class="text-gray-600">Sin HT</span>
                                            {/if}
                                            {#if m.group}
                                                <span class="text-gray-600"> · Grupo {m.group.replace('Group ', '')}</span>
                                            {:else if m.round}
                                                <span class="text-gray-600"> · {shortRound(m.round)}</span>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="text-gray-500 text-lg shrink-0">{expanded ? '−' : '+'}</div>
                                </div>
                            </button>
                            {#if expanded && (m.goals1.length || m.goals2.length)}
                                <div class="px-3 md:px-4 pb-3 md:pb-4 pt-0 border-t border-white/5">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 mt-2">
                                        <div>
                                            <div class="text-[10px] md:text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-3 w-4 md:h-3.5 md:w-5 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                                <span>{nameOf(m.team1)}</span>
                                            </div>
                                            {#if m.goals1.length === 0}
                                                <div class="text-[10px] text-gray-600">Sin goles registrados</div>
                                            {:else}
                                                <ul class="space-y-0.5 text-[11px] md:text-xs">
                                                    {#each m.goals1 as g}
                                                        <li class="flex justify-between gap-2 text-gray-300">
                                                            <span class="truncate flex items-center gap-1">
                                                                <img src={flagOf(m.team1)} alt="" class="h-2.5 w-3.5 object-cover rounded-sm ring-1 ring-white/10 shrink-0" title={nameOf(m.team1)} />
                                                                <span>{g.name}</span>
                                                            </span>
                                                            <span class="text-cyan-400 font-mono shrink-0">{g.minute}'</span>
                                                        </li>
                                                    {/each}
                                                </ul>
                                            {/if}
                                        </div>
                                        <div>
                                            <div class="text-[10px] md:text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-3 w-4 md:h-3.5 md:w-5 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                                <span>{nameOf(m.team2)}</span>
                                            </div>
                                            {#if m.goals2.length === 0}
                                                <div class="text-[10px] text-gray-600">Sin goles registrados</div>
                                            {:else}
                                                <ul class="space-y-0.5 text-[11px] md:text-xs">
                                                    {#each m.goals2 as g}
                                                        <li class="flex justify-between gap-2 text-gray-300">
                                                            <span class="truncate flex items-center gap-1">
                                                                <img src={flagOf(m.team2)} alt="" class="h-2.5 w-3.5 object-cover rounded-sm ring-1 ring-white/10 shrink-0" title={nameOf(m.team2)} />
                                                                <span>{g.name}</span>
                                                            </span>
                                                            <span class="text-cyan-400 font-mono shrink-0">{g.minute}'</span>
                                                        </li>
                                                    {/each}
                                                </ul>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>

            {:else if tab === 'equipos'}
                <!-- ======= TAB: POR EQUIPO ======= -->
                <div class="space-y-4 md:space-y-6">
                    <!-- Top ataques -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5">
                        <h3 class="text-sm md:text-base font-bold text-emerald-400 mb-3">⚔️ Top ataques (goles a favor / partido)</h3>
                        <div class="space-y-1.5 md:space-y-2">
                            {#each stats.topAttacks as t, i (t.team)}
                                {@const maxGf = stats.topAttacks[0]?.gfPerGame || 1}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs">
                                    <span class="w-4 text-gray-500 tabular-nums">{i + 1}</span>
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-300" style="width: {(100 * t.gfPerGame / maxGf).toFixed(1)}%"></div>
                                    </div>
                                    <span class="w-14 md:w-20 text-right text-emerald-300 font-bold tabular-nums shrink-0">{t.gf} GF · {t.gfPerGame}/P</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Top defensas -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5">
                        <h3 class="text-sm md:text-base font-bold text-cyan-400 mb-3">🛡️ Top defensas (menos goles en contra / partido)</h3>
                        <div class="space-y-1.5 md:space-y-2">
                            {#each stats.topDefenses as t, i (t.team)}
                                {@const maxGc = stats.topDefenses[0]?.gcPerGame || 1}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs">
                                    <span class="w-4 text-gray-500 tabular-nums">{i + 1}</span>
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-cyan-500 to-cyan-300" style="width: {(100 * t.gcPerGame / maxGc).toFixed(1)}%"></div>
                                    </div>
                                    <span class="w-14 md:w-20 text-right text-cyan-300 font-bold tabular-nums shrink-0">{t.gc} GC · {t.gcPerGame}/P</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Equipos "del segundo tiempo" -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5">
                        <h3 class="text-sm md:text-base font-bold text-purple-400 mb-1">🔥 Equipos del 2.º tiempo</h3>
                        <p class="text-[10px] md:text-xs text-gray-500 mb-3">% de sus goles anotados en el segundo tiempo (mín. 3 goles)</p>
                        <div class="space-y-1.5 md:space-y-2">
                            {#each stats.secondHalfTeams as t (t.team)}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs">
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-purple-500 to-pink-400" style="width: {t.secondHalfPct}%"></div>
                                    </div>
                                    <span class="w-20 md:w-28 text-right text-purple-300 font-bold tabular-nums shrink-0">{t.gf2h}/{t.gf} = {t.secondHalfPct}%</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

            {:else if tab === 'curiosidades'}
                <!-- ======= TAB: CURIOSIDADES ======= -->
                <div class="space-y-3 md:space-y-4">
                    <!-- Partido con más goles -->
                    {#if stats.highestScoring}
                        {@const m = stats.highestScoring}
                        <div class="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-amber-300/80 uppercase font-bold tracking-wider">🔥 Partido con más goles</div>
                            <div class="text-sm md:text-base font-bold text-white mt-1 flex items-center gap-1.5 md:gap-2 flex-wrap">
                                {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                <span>{nameOf(m.team1)}</span>
                                <span class="text-amber-400">{m.score.ft[0]}</span>
                                <span class="text-gray-500">-</span>
                                <span class="text-amber-400">{m.score.ft[1]}</span>
                                <span>{nameOf(m.team2)}</span>
                                {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                            </div>
                            <div class="text-[11px] md:text-xs text-gray-400 mt-1">
                                {shortDate(m.date)} · {m._totalGoals} goles totales
                            </div>
                        </div>
                    {/if}

                    <!-- Goleada más grande -->
                    {#if stats.biggestBlowout}
                        {@const m = stats.biggestBlowout}
                        {@const winner = m.score.ft[0] > m.score.ft[1] ? m.team1 : m.team2}
                        <div class="bg-gradient-to-br from-red-500/15 to-pink-500/10 border border-red-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-red-300/80 uppercase font-bold tracking-wider">💥 Goleada más grande</div>
                            <div class="text-sm md:text-base font-bold text-white mt-1 flex items-center gap-1.5 md:gap-2 flex-wrap">
                                {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                <span>{nameOf(m.team1)}</span>
                                <span class="text-red-400">{m.score.ft[0]}</span>
                                <span class="text-gray-500">-</span>
                                <span class="text-red-400">{m.score.ft[1]}</span>
                                <span>{nameOf(m.team2)}</span>
                                {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                            </div>
                            <div class="text-[11px] md:text-xs text-gray-400 mt-1">
                                {shortDate(m.date)} · {nameOf(winner)} ganó por {Math.abs(m.score.ft[0] - m.score.ft[1])} goles
                            </div>
                        </div>
                    {/if}

                    <!-- Remontada -->
                    {#if stats.biggestComeback}
                        {@const m = stats.biggestComeback}
                        {@const winner = m.score.ft[0] > m.score.ft[1] ? m.team1 : m.team2}
                        <div class="bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-purple-300/80 uppercase font-bold tracking-wider">🔄 Remontada</div>
                            <div class="text-sm md:text-base font-bold text-white mt-1 flex items-center gap-1.5 md:gap-2 flex-wrap">
                                {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                <span>{nameOf(m.team1)}</span>
                                <span class="text-amber-400 text-xs md:text-sm">{m.score.ht[0]}</span>
                                <span class="text-gray-500 mx-0.5">-</span>
                                <span class="text-amber-400 text-xs md:text-sm">{m.score.ht[1]}</span>
                                <span class="text-gray-600 mx-1">→</span>
                                <span class="text-cyan-400">{m.score.ft[0]}</span>
                                <span class="text-gray-500">-</span>
                                <span class="text-cyan-400">{m.score.ft[1]}</span>
                                <span>{nameOf(m.team2)}</span>
                                {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-4 w-6 md:h-5 md:w-7 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                            </div>
                            <div class="text-[11px] md:text-xs text-gray-400 mt-1">
                                {shortDate(m.date)} · {nameOf(winner)} remontó en el 2.º tiempo
                            </div>
                        </div>
                    {:else}
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 text-center text-gray-500 text-xs">
                            🔄 Aún no hay remontadas registradas
                        </div>
                    {/if}

                    <!-- Hat-tricks -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4">
                        <h3 class="text-sm md:text-base font-bold text-cyan-400 mb-2">🎯 Hat-tricks ({stats.hatTricks.length})</h3>
                        {#if stats.hatTricks.length === 0}
                            <p class="text-[11px] md:text-xs text-gray-500">Aún no hay hat-tricks en el torneo.</p>
                        {:else}
                            <div class="space-y-1.5">
                                {#each stats.hatTricks as ht, i (i)}
                                    {@const m = ht.match}
                                    {@const team = ht.team === 1 ? m.team1 : m.team2}
                                    {@const opp = ht.team === 1 ? m.team2 : m.team1}
                                    <div class="text-[11px] md:text-xs text-gray-300 flex flex-wrap items-center gap-1.5">
                                        {#if flagOf(team)}<img src={flagOf(team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                        <span class="font-semibold">{nameOf(team)}</span>
                                        <span class="text-cyan-400 font-bold">{ht.goals} goles</span>
                                        <span class="text-gray-500">·</span>
                                        <span class="text-gray-500">{shortDate(m.date)}</span>
                                        <span class="text-gray-500">· vs</span>
                                        {#if flagOf(opp)}<img src={flagOf(opp)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm ring-1 ring-white/10" />{/if}
                                        <span>{nameOf(opp)}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Top goleadores -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4">
                        <h3 class="text-sm md:text-base font-bold text-amber-400 mb-2">👟 Top goleadores</h3>
                        {#if stats.scorers.length === 0}
                            <p class="text-[11px] md:text-xs text-gray-500">Sin goleadores registrados aún.</p>
                        {:else}
                            <div class="space-y-1">
                                {#each stats.scorers.slice(0, 10) as s, i (s.name)}
                                    <div class="flex items-center gap-2 text-[11px] md:text-xs">
                                        <span class="w-4 text-gray-500 tabular-nums">{i + 1}</span>
                                        {#if s.team && flagOf(s.team)}
                                            <img src={flagOf(s.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(s.team)} />
                                        {:else}
                                            <span class="w-4 md:w-5 shrink-0"></span>
                                        {/if}
                                        <span class="flex-1 truncate text-gray-200 font-semibold">{s.name}</span>
                                        <span class="text-[10px] text-gray-500 truncate hidden sm:inline">{s.team ? nameOf(s.team) : ''}</span>
                                        <span class="text-amber-400 font-bold tabular-nums">{s.goals}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
