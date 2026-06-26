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
    let animationDone = $state(false);
    let reducedMotion = $state(false);

    /** @type {SVGPathElement | null} */
    let trendPath = $state(null);
    let trendLineLength = $state(1000);

    // Valores animados para contadores
    let dispTotalGoals = $state(0);
    let dispAvgGoals = $state(0);
    let dispHtGoals = $state(0);
    let disp2hGoals = $state(0);
    let dispFinished = $state(0);
    let dispCleanSheets = $state(0);
    let dispBlowouts = $state(0);

    onMount(() => {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
        animationDone = false;
        try {
            matches = await loadWorldCupMatches();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Error cargando partidos';
        } finally {
            isLoading = false;
        }
    }

    function animateValue(/** @type {(v: number) => void} */ setter, /** @type {number} */ target, /** @type {number} */ duration = 900) {
        const start = performance.now();
        const from = 0;
        const isFloat = !Number.isInteger(target);
        function step(/** @type {number} */ now) {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = from + (target - from) * eased;
            setter(isFloat ? Math.round(val * 100) / 100 : Math.round(val));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function setDisplayNumbers(/** @type {any} */ s) {
        dispTotalGoals = s.totalGoals;
        dispAvgGoals = s.avgGoals;
        dispHtGoals = s.totalHtGoals;
        disp2hGoals = s.total2hGoals;
        dispFinished = s.finishedCount;
        dispCleanSheets = s.cleanSheets;
        dispBlowouts = s.blowouts;
    }

    function animateNumbers(/** @type {any} */ s) {
        animateValue(v => dispTotalGoals = v, s.totalGoals, 950);
        animateValue(v => dispAvgGoals = v, s.avgGoals, 950);
        animateValue(v => dispHtGoals = v, s.totalHtGoals, 950);
        animateValue(v => disp2hGoals = v, s.total2hGoals, 950);
        animateValue(v => dispFinished = v, s.finishedCount, 750);
        animateValue(v => dispCleanSheets = v, s.cleanSheets, 750);
        animateValue(v => dispBlowouts = v, s.blowouts, 750);
    }

    $effect(() => {
        if (!isLoading && !animationDone && stats.finishedCount > 0) {
            animationDone = true;
            if (reducedMotion) setDisplayNumbers(stats);
            else animateNumbers(stats);
        }
    });

    $effect(() => {
        if (trendPath && tab === 'resumen' && stats.trendData.length > 1) {
            trendLineLength = trendPath.getTotalLength();
        }
    });

    /**
     * Parsea un minuto de gol. Soporta "23'", "45+2", "90+3".
     * @param {string} raw
     * @returns {{value: number, isAddedTime: boolean, raw: string}}
     */
    function parseMinute(raw) {
        const str = String(raw).trim();
        const hasPlus = str.includes('+');
        const digits = str.replace(/\D/g, '');
        const value = digits ? parseInt(digits, 10) : 0;
        return { value, isAddedTime: hasPlus, raw: str };
    }

    /**
     * Devuelve la franja de minuto (0-5) para el histograma.
     * @param {number} m
     */
    function minuteBand(m) {
        if (m <= 15) return 0;
        if (m <= 30) return 1;
        if (m <= 45) return 2;
        if (m <= 60) return 3;
        if (m <= 75) return 4;
        return 5;
    }

    const minuteBands = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90+'];

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
        let blowouts = 0;

        let groupMatches = 0;
        let groupGoals = 0;
        let koMatches = 0;
        let koGoals = 0;

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

        /** @type {Array<{band: number, goals: number, ht: number, ft2h: number}>} */
        const goalsByMinute = minuteBands.map((_, i) => ({ band: i, goals: 0, ht: 0, ft2h: 0 }));

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
                total2hGoals += ftTotal;
            }

            // Fase de grupos vs eliminatoria
            const isGroup = m.group || (m.round && /group/i.test(m.round));
            if (isGroup) {
                groupMatches++;
                groupGoals += ftTotal;
            } else {
                koMatches++;
                koGoals += ftTotal;
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

            // Remontada: iban perdiendo al HT y ganaron
            if (ht) {
                const htLeader = ht[0] > ht[1] ? m.team1 : (ht[1] > ht[0] ? m.team2 : null);
                const ftLeader = ft[0] > ft[1] ? m.team1 : (ft[1] > ft[0] ? m.team2 : null);
                if (htLeader && ftLeader && htLeader !== ftLeader) {
                    if (!biggestComeback) biggestComeback = m;
                }
            }

            // Goleadores (hat-tricks)
            for (const g of (m.goals1 || [])) {
                const parsed = parseMinute(g.minute);
                const band = minuteBand(parsed.value);
                const isHt = parsed.isAddedTime || parsed.value <= 45;
                goalsByMinute[band].goals++;
                if (isHt) goalsByMinute[band].ht++;
                else goalsByMinute[band].ft2h++;

                const k = g.name;
                const sa = scorerAgg.get(k) || { goals: 0, team: m.team1 };
                sa.goals++;
                scorerAgg.set(k, sa);
            }
            for (const g of (m.goals2 || [])) {
                const parsed = parseMinute(g.minute);
                const band = minuteBand(parsed.value);
                const isHt = parsed.isAddedTime || parsed.value <= 45;
                goalsByMinute[band].goals++;
                if (isHt) goalsByMinute[band].ht++;
                else goalsByMinute[band].ft2h++;

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

        // Tendencia acumulada
        let cumulative = 0;
        const trendData = perDateRows.map((row, i) => {
            cumulative += row.total;
            const window = perDateRows.slice(Math.max(0, i - 2), i + 1);
            const movingAvg = window.reduce((a, b) => a + b.total, 0) / window.length;
            return { date: row.date, total: row.total, cumulative, movingAvg: +movingAvg.toFixed(2) };
        });

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

        // Goleadores ordenados
        const scorers = [...scorerAgg.entries()]
            .map(([name, v]) => ({ name, goals: v.goals, team: v.team }))
            .sort((a, b) => b.goals - a.goals);

        const topScorer = scorers.length ? scorers[0] : null;

        // Minuto de oro
        const goldenMinute = goalsByMinute.reduce((a, b) => a.goals > b.goals ? a : b, goalsByMinute[0]);

        // Rachas
        const sortedMatches = finished.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
        /** @type {Map<string, Array<{side: 'home'|'away', score: {ft:[number,number]}}>>} */
        const teamMatches = new Map();
        for (const m of sortedMatches) {
            if (!m.score) continue;
            if (!teamMatches.has(m.team1)) teamMatches.set(m.team1, []);
            if (!teamMatches.has(m.team2)) teamMatches.set(m.team2, []);
            const homeList = teamMatches.get(m.team1) || [];
            const awayList = teamMatches.get(m.team2) || [];
            homeList.push({ side: 'home', score: m.score });
            awayList.push({ side: 'away', score: m.score });
            teamMatches.set(m.team1, homeList);
            teamMatches.set(m.team2, awayList);
        }

        let bestScoringStreak = { team: '', streak: 0 };
        let bestCleanSheetStreak = { team: '', streak: 0 };
        for (const [team, list] of teamMatches) {
            let scoreStreak = 0, maxScore = 0;
            let csStreak = 0, maxCs = 0;
            for (const item of list) {
                const gf = item.side === 'home' ? item.score.ft[0] : item.score.ft[1];
                const gc = item.side === 'home' ? item.score.ft[1] : item.score.ft[0];
                if (gf > 0) { scoreStreak++; maxScore = Math.max(maxScore, scoreStreak); }
                else scoreStreak = 0;
                if (gc === 0) { csStreak++; maxCs = Math.max(maxCs, csStreak); }
                else csStreak = 0;
            }
            if (maxScore > bestScoringStreak.streak) bestScoringStreak = { team, streak: maxScore };
            if (maxCs > bestCleanSheetStreak.streak) bestCleanSheetStreak = { team, streak: maxCs };
        }

        // Partidos más emocionantes
        const excitingMatches = finished
            .map(m => {
                const score = m.score;
                if (!score) return null;
                const ftTotal = score.ft[0] + score.ft[1];
                const diff = Math.abs(score.ft[0] - score.ft[1]);
                let excitement = ftTotal;
                if (score.ht) {
                    const htLeader = score.ht[0] > score.ht[1] ? m.team1 : (score.ht[1] > score.ht[0] ? m.team2 : null);
                    const ftLeader = score.ft[0] > score.ft[1] ? m.team1 : (score.ft[1] > score.ft[0] ? m.team2 : null);
                    if (htLeader && ftLeader && htLeader !== ftLeader) excitement += 3;
                }
                if (diff <= 1) excitement += 1;
                return { match: m, excitement };
            })
            .filter(/** @type {(x: any) => x is {match: any, excitement: number}} */ (x => x !== null))
            .sort((a, b) => b.excitement - a.excitement)
            .slice(0, 5)
            .map(x => x.match);

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
            trendData,
            perMatch,
            teamRows,
            topAttacks,
            topDefenses,
            secondHalfTeams,
            scorers,
            hatTricks,
            highestScoring,
            biggestBlowout,
            biggestComeback,
            goalsByMinute,
            goldenMinute,
            topScorer,
            phaseStats: {
                groupAvg: groupMatches ? +(groupGoals / groupMatches).toFixed(2) : 0,
                koAvg: koMatches ? +(koGoals / koMatches).toFixed(2) : 0,
                groupMatches,
                koMatches
            },
            streaks: { bestScoringStreak, bestCleanSheetStreak },
            excitingMatches
        };
    });

    const maxDateGoals = $derived(
        stats.perDateRows.length ? Math.max(...stats.perDateRows.map(r => r.total)) : 1
    );

    const maxMinuteGoals = $derived(
        Math.max(...stats.goalsByMinute.map(b => b.goals), 1)
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
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-4 animate-fade-in"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="goals-title"
    onclick={(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) onClose(); }}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 text-white border border-white/10 rounded-none md:rounded-3xl w-full max-w-5xl h-full md:h-auto md:max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-scale-in" onclick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}>
        <!-- Header -->
        <div class="p-3 md:p-5 border-b border-white/10 flex justify-between items-center flex-shrink-0 gap-2">
            <div class="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                    class="w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center text-white text-xl md:text-2xl rounded-xl hover:bg-white/10 transition-colors"
                    onclick={onClose}
                    aria-label="Volver"
                >←</button>
                <span class="text-2xl md:text-3xl shrink-0 animate-float">⚽</span>
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
                        class="px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap {tab === t.key ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30' : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/10'}"
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
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 stagger-children">
                        <div class="relative overflow-hidden bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/30 rounded-2xl p-3 md:p-4 animate-shine">
                            <div class="text-[10px] md:text-xs text-emerald-300/80 uppercase font-bold tracking-wider">Goles totales</div>
                            <div class="text-2xl md:text-4xl font-black text-emerald-400 tabular-nums animate-number-pop">{dispTotalGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">{dispAvgGoals} / partido</div>
                        </div>
                        <div class="relative overflow-hidden bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 md:p-4 animate-shine" style="--i: 1">
                            <div class="text-[10px] md:text-xs text-amber-300/80 uppercase font-bold tracking-wider">1.er tiempo</div>
                            <div class="text-2xl md:text-4xl font-black text-amber-400 tabular-nums animate-number-pop">{dispHtGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">
                                {stats.totalGoals > 0 ? Math.round(stats.totalHtGoals / stats.totalGoals * 100) : 0}% del total
                            </div>
                        </div>
                        <div class="relative overflow-hidden bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/30 rounded-2xl p-3 md:p-4 animate-shine" style="--i: 2">
                            <div class="text-[10px] md:text-xs text-purple-300/80 uppercase font-bold tracking-wider">2.º tiempo</div>
                            <div class="text-2xl md:text-4xl font-black text-purple-400 tabular-nums animate-number-pop">{disp2hGoals}</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">
                                {stats.totalGoals > 0 ? Math.round(stats.total2hGoals / stats.totalGoals * 100) : 0}% del total
                            </div>
                        </div>
                        <div class="relative overflow-hidden bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-3 md:p-4 animate-shine" style="--i: 3">
                            <div class="text-[10px] md:text-xs text-cyan-300/80 uppercase font-bold tracking-wider">Partidos</div>
                            <div class="text-2xl md:text-4xl font-black text-cyan-400 tabular-nums animate-number-pop">{dispFinished}<span class="text-sm md:text-lg text-gray-500 font-normal">/{stats.totalMatches}</span></div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">{stats.pendingCount} pendientes</div>
                        </div>
                    </div>

                    <!-- Gráfico de barras: goles por jornada -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in" style="animation-delay: 120ms">
                        <h3 class="text-sm md:text-base font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
                            <span>📅</span> Goles por jornada
                        </h3>
                        {#if stats.perDateRows.length === 0}
                            <p class="text-gray-400 text-xs">Sin datos.</p>
                        {:else}
                            <div class="flex items-end gap-1 md:gap-2 h-32 md:h-40 overflow-x-auto pb-1">
                                {#each stats.perDateRows as row, i (row.date)}
                                    <div class="flex-1 min-w-[40px] md:min-w-[60px] h-full flex flex-col items-center justify-end gap-1" style="--i: {i}">
                                        <div class="text-[9px] md:text-xs text-gray-300 font-bold tabular-nums">{row.total}</div>
                                        <div
                                            class="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-400 relative overflow-hidden animate-bar-grow"
                                            style="height: {(100 * row.total / maxDateGoals).toFixed(1)}%; animation-delay: calc(var(--i) * 60ms)"
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

                    <!-- Línea de tendencia acumulada -->
                    {#if stats.trendData.length > 1}
                        {@const maxCumulative = Math.max(...stats.trendData.map(d => d.cumulative), 1)}
                        {@const width = 1000}
                        {@const height = 200}
                        {@const padding = 24}
                        {@const points = stats.trendData.map((d, i) => {
                            const x = padding + (i / (stats.trendData.length - 1)) * (width - padding * 2);
                            const y = height - padding - (d.cumulative / maxCumulative) * (height - padding * 2);
                            return `${x},${y}`;
                        }).join(' ')}
                        {@const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in" style="animation-delay: 180ms">
                            <h3 class="text-sm md:text-base font-bold text-white mb-2 md:mb-3 flex items-center gap-2">
                                <span>📈</span> Tendencia acumulada de goles
                            </h3>
                            <div class="relative h-40 md:h-52">
                                <svg viewBox="0 0 {width} {height}" class="w-full h-full overflow-visible" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color="rgba(6,182,212,0.35)" />
                                            <stop offset="100%" stop-color="rgba(6,182,212,0)" />
                                        </linearGradient>
                                    </defs>
                                    <polyline points={areaPoints} fill="url(#trendGradient)" stroke="none" />
                                    <path bind:this={trendPath} d={`M ${points.replace(/,/g, ' ')}`} fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="animate-draw-line" style="--line-length: {trendLineLength}px" />
                                    {#each stats.trendData as d, i}
                                        {@const x = padding + (i / (stats.trendData.length - 1)) * (width - padding * 2)}
                                        {@const y = height - padding - (d.cumulative / maxCumulative) * (height - padding * 2)}
                                        <circle cx={x} cy={y} r="5" fill="#111827" stroke="#22d3ee" stroke-width="2" class="animate-fade-in" style="animation-delay: {0.8 + i * 0.06}s" />
                                    {/each}
                                </svg>
                            </div>
                            <div class="flex justify-between text-[10px] text-gray-500 mt-1">
                                <span>{shortDate(stats.trendData[0].date)}</span>
                                <span>{shortDate(stats.trendData[stats.trendData.length - 1].date)}</span>
                            </div>
                        </div>
                    {/if}

                    <!-- Nuevas mini stats -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 stagger-children">
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4" style="--i: 4">
                            <div class="text-[10px] md:text-xs text-gray-400">Porterías a cero</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums animate-number-pop">{dispCleanSheets}</div>
                        </div>
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4" style="--i: 5">
                            <div class="text-[10px] md:text-xs text-gray-400">Goleadas (4+ dif.)</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums animate-number-pop">{dispBlowouts}</div>
                        </div>
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 col-span-2 md:col-span-1" style="--i: 6">
                            <div class="text-[10px] md:text-xs text-gray-400">Hat-tricks</div>
                            <div class="text-xl md:text-2xl font-black text-white tabular-nums animate-number-pop">{stats.hatTricks.length}</div>
                        </div>
                        <div class="bg-gradient-to-br from-pink-500/15 to-rose-500/10 border border-pink-500/30 rounded-2xl p-3 md:p-4 col-span-2 md:col-span-1" style="--i: 7">
                            <div class="text-[10px] md:text-xs text-pink-300/80 uppercase font-bold tracking-wider">Minuto de oro</div>
                            <div class="text-xl md:text-2xl font-black text-pink-400 tabular-nums">{minuteBands[stats.goldenMinute.band]}'</div>
                            <div class="text-[10px] md:text-xs text-gray-400 mt-1">{stats.goldenMinute.goals} goles</div>
                        </div>
                    </div>

                    <!-- Histograma goles por minuto -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in" style="animation-delay: 240ms">
                        <h3 class="text-sm md:text-base font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
                            <span>⏱️</span> Goles por franja horaria
                        </h3>
                        <div class="flex items-end gap-1 md:gap-2 h-28 md:h-36">
                            {#each stats.goalsByMinute as band, i (band.band)}
                                <div class="flex-1 h-full flex flex-col items-center justify-end gap-1" style="--i: {i}">
                                    <div class="text-[9px] md:text-xs text-gray-300 font-bold tabular-nums">{band.goals}</div>
                                    <div
                                        class="w-full rounded-t-md bg-gradient-to-t from-cyan-600 to-cyan-400 relative overflow-hidden animate-bar-grow"
                                        style="height: {(100 * band.goals / maxMinuteGoals).toFixed(1)}%; animation-delay: calc(var(--i) * 70ms)"
                                        title="{minuteBands[band.band]}: {band.goals} goles"
                                    >
                                        {#if band.ht > 0}
                                            <div class="absolute bottom-0 left-0 right-0 bg-amber-500/70" style="height: {(100 * band.ht / band.goals).toFixed(1)}%"></div>
                                        {/if}
                                    </div>
                                    <div class="text-[9px] md:text-[10px] text-gray-500 tabular-nums">{minuteBands[band.band]}'</div>
                                </div>
                            {/each}
                        </div>
                        <div class="flex items-center gap-3 mt-3 text-[10px] md:text-xs text-gray-400">
                            <span class="flex items-center gap-1"><span class="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-amber-500/70"></span>1T</span>
                            <span class="flex items-center gap-1"><span class="w-2 h-2 md:w-3 md:h-3 rounded-sm bg-cyan-400"></span>2T</span>
                        </div>
                    </div>
                </div>

            {:else if tab === 'partidos'}
                <!-- ======= TAB: POR PARTIDO ======= -->
                <div class="space-y-2 stagger-children">
                    <div class="text-[10px] md:text-xs text-gray-500 mb-2" style="--i: 0">
                        {stats.perMatch.length} partidos · toca una fila para ver goleadores
                    </div>
                    {#each stats.perMatch.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '')) as m, i (i)}
                        {@const expanded = expandedMatch === i}
                        {@const is2hHeavy = m.ft2hGoals > m.htGoals}
                        {@const isComeback = m.ht && ((m.ht[0] < m.ht[1] && m.ft[0] > m.ft[1]) || (m.ht[1] < m.ht[0] && m.ft[1] > m.ft[0]))}
                        {@const isBlowout = Math.abs(m.ft[0] - m.ft[1]) >= 4}
                        <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-900/10" style="--i: {i + 1}">
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
                                        <div class="text-[10px] md:text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-1">
                                            {#if m.ht}
                                                HT {m.ht[0]}-{m.ht[1]} ·
                                                <span class="text-amber-400">1T {m.htGoals}</span> ·
                                                <span class="text-emerald-400">2T {m.ft2hGoals}</span>
                                                {#if is2hHeavy}<span class="text-purple-400">🔥 2.º T caliente</span>{/if}
                                            {:else}
                                                <span class="text-gray-600">Sin HT</span>
                                            {/if}
                                            {#if m.group}
                                                <span class="text-gray-600"> · Grupo {m.group.replace('Group ', '')}</span>
                                            {:else if m.round}
                                                <span class="text-gray-600"> · {shortRound(m.round)}</span>
                                            {/if}
                                            {#if isComeback}<span class="text-purple-400">🔄 Remontada</span>{/if}
                                            {#if isBlowout}<span class="text-red-400">💥 Goleada</span>{/if}
                                        </div>
                                    </div>
                                    <div class="text-gray-500 text-lg shrink-0">{expanded ? '−' : '+'}</div>
                                </div>
                            </button>
                            {#if expanded && (m.goals1.length || m.goals2.length)}
                                <div class="px-3 md:px-4 pb-3 md:pb-4 pt-0 border-t border-white/5 animate-fade-in">
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
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in">
                        <h3 class="text-sm md:text-base font-bold text-emerald-400 mb-3 flex items-center gap-2">
                            <span>⚔️</span> Top ataques (goles a favor / partido)
                        </h3>
                        <div class="space-y-1.5 md:space-y-2 stagger-children">
                            {#each stats.topAttacks as t, i (t.team)}
                                {@const maxGf = stats.topAttacks[0]?.gfPerGame || 1}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs" style="--i: {i}">
                                    <span class="w-4 text-gray-500 tabular-nums">{i + 1}</span>
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 animate-bar-grow" style="width: {(100 * t.gfPerGame / maxGf).toFixed(1)}%; transform-origin: left; --line-length: 0"></div>
                                    </div>
                                    <span class="w-14 md:w-20 text-right text-emerald-300 font-bold tabular-nums shrink-0">{t.gf} GF · {t.gfPerGame}/P</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Top defensas -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in" style="animation-delay: 80ms">
                        <h3 class="text-sm md:text-base font-bold text-cyan-400 mb-3 flex items-center gap-2">
                            <span>🛡️</span> Top defensas (menos goles en contra / partido)
                        </h3>
                        <div class="space-y-1.5 md:space-y-2 stagger-children">
                            {#each stats.topDefenses as t, i (t.team)}
                                {@const maxGc = stats.topDefenses[0]?.gcPerGame || 1}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs" style="--i: {i}">
                                    <span class="w-4 text-gray-500 tabular-nums">{i + 1}</span>
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 animate-bar-grow" style="width: {(100 * t.gcPerGame / maxGc).toFixed(1)}%; transform-origin: left; --line-length: 0"></div>
                                    </div>
                                    <span class="w-14 md:w-20 text-right text-cyan-300 font-bold tabular-nums shrink-0">{t.gc} GC · {t.gcPerGame}/P</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Equipos "del segundo tiempo" -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-5 animate-scale-in" style="animation-delay: 160ms">
                        <h3 class="text-sm md:text-base font-bold text-purple-400 mb-1 flex items-center gap-2">
                            <span>🔥</span> Equipos del 2.º tiempo
                        </h3>
                        <p class="text-[10px] md:text-xs text-gray-500 mb-3">% de sus goles anotados en el segundo tiempo (mín. 3 goles)</p>
                        <div class="space-y-1.5 md:space-y-2 stagger-children">
                            {#each stats.secondHalfTeams as t, i (t.team)}
                                <div class="flex items-center gap-2 text-[11px] md:text-xs" style="--i: {i}">
                                    {#if flagOf(t.team)}
                                        <img src={flagOf(t.team)} alt="" class="h-3 w-4 md:h-4 md:w-5 object-cover rounded-sm shrink-0 ring-1 ring-white/10" title={nameOf(t.team)} />
                                    {:else}
                                        <span class="w-4 md:w-5 shrink-0"></span>
                                    {/if}
                                    <span class="w-20 md:w-32 truncate font-semibold">{nameOf(t.team)}</span>
                                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div class="h-full bg-gradient-to-r from-purple-500 to-pink-400 animate-bar-grow" style="width: {t.secondHalfPct}%; transform-origin: left; --line-length: 0"></div>
                                    </div>
                                    <span class="w-20 md:w-28 text-right text-purple-300 font-bold tabular-nums shrink-0">{t.gf2h}/{t.gf} = {t.secondHalfPct}%</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Rachas -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 animate-scale-in" style="animation-delay: 240ms">
                        <div class="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-amber-300/80 uppercase font-bold tracking-wider">🔥 Racha anotando</div>
                            {#if stats.streaks.bestScoringStreak.streak > 1}
                                <div class="text-lg md:text-xl font-black text-white mt-1 flex items-center gap-2">
                                    {#if flagOf(stats.streaks.bestScoringStreak.team)}<img src={flagOf(stats.streaks.bestScoringStreak.team)} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10" />{/if}
                                    <span>{nameOf(stats.streaks.bestScoringStreak.team)}</span>
                                </div>
                                <div class="text-[11px] md:text-xs text-amber-400 mt-1">{stats.streaks.bestScoringStreak.streak} partidos seguidos marcando</div>
                            {:else}
                                <div class="text-sm text-gray-500 mt-1">Aún no hay racha destacada</div>
                            {/if}
                        </div>
                        <div class="bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-3 md:p-4">
                            <div class="text-[10px] md:text-xs text-cyan-300/80 uppercase font-bold tracking-wider">🧱 Racha sin recibir gol</div>
                            {#if stats.streaks.bestCleanSheetStreak.streak > 1}
                                <div class="text-lg md:text-xl font-black text-white mt-1 flex items-center gap-2">
                                    {#if flagOf(stats.streaks.bestCleanSheetStreak.team)}<img src={flagOf(stats.streaks.bestCleanSheetStreak.team)} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10" />{/if}
                                    <span>{nameOf(stats.streaks.bestCleanSheetStreak.team)}</span>
                                </div>
                                <div class="text-[11px] md:text-xs text-cyan-400 mt-1">{stats.streaks.bestCleanSheetStreak.streak} partidos seguidos imbatido</div>
                            {:else}
                                <div class="text-sm text-gray-500 mt-1">Aún no hay racha destacada</div>
                            {/if}
                        </div>
                    </div>
                </div>

            {:else if tab === 'curiosidades'}
                <!-- ======= TAB: CURIOSIDADES ======= -->
                <div class="space-y-3 md:space-y-4">
                    <!-- Goleador estrella -->
                    {#if stats.topScorer}
                        <div class="relative overflow-hidden bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 rounded-2xl p-4 md:p-5 animate-scale-in animate-glow-pulse">
                            <div class="absolute inset-0 animate-shimmer opacity-30 pointer-events-none"></div>
                            <div class="relative flex items-center gap-3 md:gap-4">
                                <div class="text-4xl md:text-5xl animate-medal-bounce">👟</div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-[10px] md:text-xs text-amber-300/80 uppercase font-bold tracking-wider">Goleador estrella</div>
                                    <div class="text-lg md:text-2xl font-black text-white truncate">{stats.topScorer.name}</div>
                                    <div class="text-[11px] md:text-xs text-gray-300 flex items-center gap-2">
                                        {#if flagOf(stats.topScorer.team)}<img src={flagOf(stats.topScorer.team)} alt="" class="h-3 w-4 rounded-sm ring-1 ring-white/10" />{/if}
                                        <span>{nameOf(stats.topScorer.team)}</span>
                                        <span class="text-amber-400 font-bold">{stats.topScorer.goals} goles</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Partido con más goles -->
                    {#if stats.highestScoring}
                        {@const m = stats.highestScoring}
                        <div class="bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/30 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 60ms">
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
                        <div class="bg-gradient-to-br from-red-500/15 to-pink-500/10 border border-red-500/30 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 120ms">
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
                        <div class="bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-purple-500/30 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 180ms">
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
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 text-center text-gray-500 text-xs animate-scale-in" style="animation-delay: 180ms">
                            🔄 Aún no hay remontadas registradas
                        </div>
                    {/if}

                    <!-- Partidos más emocionantes -->
                    {#if stats.excitingMatches.length > 0}
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 240ms">
                            <h3 class="text-sm md:text-base font-bold text-rose-400 mb-2 flex items-center gap-2">
                                <span>🍿</span> Partidos más emocionantes
                            </h3>
                            <div class="space-y-2 stagger-children">
                                {#each stats.excitingMatches as m, i (m.date + m.team1 + m.team2)}
                                    <div class="flex items-center gap-2 text-[11px] md:text-xs" style="--i: {i}">
                                        <span class="text-rose-400 font-bold w-4">{i + 1}</span>
                                        <div class="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
                                            {#if flagOf(m.team1)}<img src={flagOf(m.team1)} alt="" class="h-3 w-4 rounded-sm ring-1 ring-white/10" />{/if}
                                            <span class="truncate">{nameOf(m.team1)}</span>
                                            {#if m.score}
                                                <span class="text-cyan-400 font-bold">{m.score.ft[0]}-{m.score.ft[1]}</span>
                                            {/if}
                                            <span class="truncate">{nameOf(m.team2)}</span>
                                            {#if flagOf(m.team2)}<img src={flagOf(m.team2)} alt="" class="h-3 w-4 rounded-sm ring-1 ring-white/10" />{/if}
                                        </div>
                                        <span class="text-gray-500 shrink-0">{shortDate(m.date)}</span>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- Hat-tricks -->
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 300ms">
                        <h3 class="text-sm md:text-base font-bold text-cyan-400 mb-2 flex items-center gap-2">
                            <span>🎯</span> Hat-tricks ({stats.hatTricks.length})
                        </h3>
                        {#if stats.hatTricks.length === 0}
                            <p class="text-[11px] md:text-xs text-gray-500">Aún no hay hat-tricks en el torneo.</p>
                        {:else}
                            <div class="space-y-1.5 stagger-children">
                                {#each stats.hatTricks as ht, i (i)}
                                    {@const m = ht.match}
                                    {@const team = ht.team === 1 ? m.team1 : m.team2}
                                    {@const opp = ht.team === 1 ? m.team2 : m.team1}
                                    <div class="text-[11px] md:text-xs text-gray-300 flex flex-wrap items-center gap-1.5" style="--i: {i}">
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
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 md:p-4 animate-scale-in" style="animation-delay: 360ms">
                        <h3 class="text-sm md:text-base font-bold text-amber-400 mb-2 flex items-center gap-2">
                            <span>👟</span> Top goleadores
                        </h3>
                        {#if stats.scorers.length === 0}
                            <p class="text-[11px] md:text-xs text-gray-500">Sin goleadores registrados aún.</p>
                        {:else}
                            <div class="space-y-1 stagger-children">
                                {#each stats.scorers.slice(0, 10) as s, i (s.name)}
                                    <div class="flex items-center gap-2 text-[11px] md:text-xs" style="--i: {i}">
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
