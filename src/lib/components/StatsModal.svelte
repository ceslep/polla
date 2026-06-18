<script>
    import { appState, uniqueBets } from '../stores.svelte.js';
    import { getFlagData } from '../flags.js';
    import { globalAccuracy, participantAccuracy, specialBetTallies } from '../accuracy.js';
    import { teamStandingsFromMatches, topAttacks, topDefenses } from '../teamStats.js';
    import { loadFifaRankings } from '../fifa.js';

    /** @type {{onClose?: () => void}} */
    let { onClose = () => {} } = $props();

    /** @type {any} */
    const fifa = $state({ updated: null, source: '', rankings: [] });
    let fifaLoading = $state(true);

    $effect(() => {
        let cancelled = false;
        (async () => {
            const data = await loadFifaRankings();
            if (cancelled) return;
            fifa.updated = data.updated;
            fifa.source = data.source || '';
            fifa.rankings = data.rankings;
            fifaLoading = false;
        })();
        return () => { cancelled = true; };
    });

    const globalStats = $derived(globalAccuracy(uniqueBets()));
    const perParticipant = $derived(participantAccuracy(uniqueBets()));
    const special = $derived(specialBetTallies(uniqueBets()));
    const standingsData = $derived(teamStandingsFromMatches(appState.allMatches));
    const sortedStandings = $derived(standingsData.sorted);
    const attacks = $derived(topAttacks(sortedStandings, 3));
    const defenses = $derived(topDefenses(sortedStandings, 3));

    /** @param {string} team @returns {string} */
    function teamLabel(team) {
        const data = getFlagData(team);
        return data?.spanishName || team;
    }

    /** @param {string} team @returns {string | null} */
    function flagUrl(team) {
        const data = getFlagData(team);
        return data?.flag || null;
    }

    /** @param {string} team @returns {string} */
    function teamEmoji(team) {
        const data = getFlagData(team);
        return data?.emoji || '';
    }

    /** @param {string} value @returns {string} */
    function predictionLabel(value) {
        const team = getFlagData(value);
        if (team) return team.spanishName;
        return value;
    }

    /** @param {string} value @returns {string | null} */
    function predictionFlag(value) {
        const team = getFlagData(value);
        return team?.flag || null;
    }

    /** @param {number} n */
    function fmt(n) {
        return n.toLocaleString('es-ES');
    }

    /** @param {string} result */
    function sparklineClass(result) {
        if (result === 'W') return 'bg-emerald-500';
        if (result === 'L') return 'bg-red-500';
        return 'bg-yellow-500';
    }

    const DONUT_SEGMENTS = [
        { key: 'exact', label: 'Exactas', color: '#22d3ee' },
        { key: 'correct', label: 'Aciertos', color: '#34d399' },
        { key: 'incorrect', label: 'Erradas', color: '#f87171' },
        { key: 'pending', label: 'Pendientes', color: '#fb923c' }
    ];

    const donutData = $derived.by(() => {
        const g = globalStats;
        const total = g.exact + g.correct + g.incorrect + g.pending;
        if (!total) return { segments: [], total: 0 };
        const values = {
            exact: g.exact,
            correct: g.correct,
            incorrect: g.incorrect,
            pending: g.pending
        };
        const R = 38;
        const C = 2 * Math.PI * R;
        let offset = 0;
        const segments = DONUT_SEGMENTS.map(s => {
            const v = values[/** @type {keyof typeof values} */ (s.key)];
            const fraction = v / total;
            const length = fraction * C;
            const seg = {
                key: s.key,
                label: s.label,
                color: s.color,
                value: v,
                pct: +(100 * fraction).toFixed(1),
                dasharray: `${length.toFixed(2)} ${(C - length).toFixed(2)}`,
                dashoffset: -offset
            };
            offset += length;
            return seg;
        });
        return { segments, total, R, C };
    });

    /** @param {number} idx */
    function positionLabel(idx) {
        if (idx === 0) return '1ro';
        if (idx === 1) return '2do';
        if (idx === 2) return '3ro';
        return `${idx + 1}to`;
    }
</script>

<div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 md:p-4" role="dialog" onclick={() => onClose()}>
    <div class="bg-gray-900 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" role="document" onclick={(e) => e.stopPropagation()}>
        <div class="p-4 border-b border-white/10 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-3">
                <h2 class="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">📊 Estadísticas</h2>
            </div>
            <button onclick={() => onClose()} class="text-gray-400 hover:text-white text-2xl cursor-pointer">&times;</button>
        </div>

        <div class="p-4 md:p-6 overflow-y-auto space-y-6 md:space-y-8">

            <!-- 1. Header tiles -->
            <section>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div class="text-2xl font-bold text-white">{fmt(globalStats.total)}</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider mt-1">Apuestas</div>
                    </div>
                    <div class="bg-cyan-500/10 rounded-xl p-3 text-center border border-cyan-500/20">
                        <div class="text-2xl font-bold text-cyan-400">{fmt(globalStats.exact)}</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider mt-1">Exactas</div>
                    </div>
                    <div class="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/20">
                        <div class="text-2xl font-bold text-emerald-400">{globalStats.accuracyPct}%</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider mt-1">% Acierto global</div>
                    </div>
                    <div class="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                        <div class="text-2xl font-bold text-gray-300">{fmt(standingsData.finishedCount)}</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider mt-1">Partidos finalizados</div>
                    </div>
                </div>
            </section>

            <!-- 2. Donut + breakdown -->
            <section class="bg-white/5 rounded-2xl p-4 border border-white/10">
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Distribución global de resultados</h3>
                {#if donutData.total === 0}
                    <p class="text-gray-500 text-sm text-center py-4">Sin apuestas para mostrar</p>
                {:else}
                    <div class="flex flex-col md:flex-row items-center gap-6">
                        <div class="relative w-32 h-32 shrink-0">
                            <svg viewBox="-50 -50 100 100" class="w-32 h-32 -rotate-90">
                                {#each donutData.segments as seg}
                                    {#if seg.value > 0}
                                        <circle cx="0" cy="0" r={donutData.R} fill="none"
                                            stroke={seg.color} stroke-width="14"
                                            stroke-dasharray={seg.dasharray}
                                            stroke-dashoffset={seg.dashoffset} />
                                    {/if}
                                {/each}
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <div class="text-2xl font-black text-white">{fmt(donutData.total)}</div>
                                <div class="text-[10px] text-gray-400 uppercase">apuestas</div>
                            </div>
                        </div>
                        <div class="flex-1 w-full space-y-2">
                            {#each donutData.segments as seg}
                                <div class="flex items-center gap-3 text-sm">
                                    <span class="w-3 h-3 rounded-sm shrink-0" style:background={seg.color}></span>
                                    <span class="text-gray-300 flex-1">{seg.label}</span>
                                    <span class="text-white font-bold">{fmt(seg.value)}</span>
                                    <span class="text-gray-400 w-14 text-right tabular-nums">{seg.pct}%</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </section>

            <!-- 3. Precisión por participante -->
            <section>
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Precisión por participante</h3>
                {#if perParticipant.length === 0}
                    <p class="text-gray-500 text-sm text-center py-4 bg-white/5 rounded-xl">Sin participantes</p>
                {:else}
                    <!-- Mobile cards -->
                    <div class="block md:hidden space-y-2">
                        {#each perParticipant as p, i}
                            <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-sm {i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'}">{positionLabel(i)}</span>
                                        <span class="text-white font-semibold">{p.participant}</span>
                                    </div>
                                    <span class="text-yellow-400 font-black">{p.points} pts</span>
                                </div>
                                <div class="text-xs text-gray-400">{p.exact} exactas · {p.correct} aciertos · {p.incorrect} erradas · {p.pending} pendientes</div>
                                <div class="mt-2 h-2 bg-white/10 rounded-full overflow-hidden flex">
                                    <div class="bg-cyan-400 h-full" style:width="{p.exactPct}%"></div>
                                    <div class="bg-emerald-400 h-full" style:width="{p.correctPct}%"></div>
                                    <div class="bg-red-400 h-full" style:width="{p.incorrectPct}%"></div>
                                </div>
                                <div class="text-xs text-gray-400 mt-1">% acierto: <span class="text-emerald-400 font-bold">{p.accuracyPct}%</span></div>
                            </div>
                        {/each}
                    </div>

                    <!-- Desktop table -->
                    <div class="hidden md:block overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                        <table class="w-full text-sm min-w-[640px]">
                            <thead class="text-left text-gray-400 border-b border-white/10">
                                <tr>
                                    <th class="py-2 px-3">#</th>
                                    <th class="py-2 px-3">Participante</th>
                                    <th class="py-2 px-3 text-right">Pts</th>
                                    <th class="py-2 px-3 text-right">% Acierto</th>
                                    <th class="py-2 px-3 text-right">Exactas</th>
                                    <th class="py-2 px-3 text-right">Aciertos</th>
                                    <th class="py-2 px-3 text-right">Erradas</th>
                                    <th class="py-2 px-3 text-right">Res.</th>
                                    <th class="py-2 px-3">Distribución</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each perParticipant as p, i}
                                    <tr class="border-b border-white/5 hover:bg-white/5">
                                        <td class="py-2 px-3 font-bold {i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'}">{positionLabel(i)}</td>
                                        <td class="py-2 px-3 font-medium">{p.participant}</td>
                                        <td class="py-2 px-3 text-right font-bold text-yellow-400">{p.points}</td>
                                        <td class="py-2 px-3 text-right text-emerald-400 font-bold">{p.accuracyPct}%</td>
                                        <td class="py-2 px-3 text-right text-cyan-400">{p.exact}</td>
                                        <td class="py-2 px-3 text-right text-emerald-400">{p.correct}</td>
                                        <td class="py-2 px-3 text-right text-red-400">{p.incorrect}</td>
                                        <td class="py-2 px-3 text-right text-gray-400">{p.resolved}</td>
                                        <td class="py-2 px-3 min-w-[140px]">
                                            <div class="h-2 bg-white/10 rounded-full overflow-hidden flex">
                                                <div class="bg-cyan-400 h-full" style:width="{p.exactPct}%"></div>
                                                <div class="bg-emerald-400 h-full" style:width="{p.correctPct}%"></div>
                                                <div class="bg-red-400 h-full" style:width="{p.incorrectPct}%"></div>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </section>

            <!-- 4. Rendimiento por equipo -->
            <section>
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">⚽ Rendimiento por equipo</h3>
                {#if sortedStandings.length === 0}
                    <p class="text-gray-500 text-sm text-center py-4 bg-white/5 rounded-xl">Aún no hay partidos finalizados</p>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                            <h4 class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">🔥 Top 3 ataque (G/F por partido)</h4>
                            {#each attacks as t, i}
                                {@const max = attacks[0]?.goalsForPerGame || 1}
                                <div class="flex items-center gap-2 text-sm py-1">
                                    <span class="text-gray-500 w-4 text-right">{i + 1}</span>
                                    <span class="text-lg">{teamEmoji(t.team)}</span>
                                    <span class="text-white flex-1 truncate">{teamLabel(t.team)}</span>
                                    <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div class="bg-emerald-400 h-full" style:width="{(100 * t.goalsForPerGame / max).toFixed(1)}%"></div>
                                    </div>
                                    <span class="text-emerald-400 font-bold w-16 text-right tabular-nums">{t.goalsForPerGame} G/F</span>
                                </div>
                            {/each}
                        </div>
                        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                            <h4 class="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">🛡️ Top 3 defensa (G/C por partido)</h4>
                            {#each defenses as t, i}
                                {@const max = defenses[0]?.goalsAgainstPerGame || 1}
                                <div class="flex items-center gap-2 text-sm py-1">
                                    <span class="text-gray-500 w-4 text-right">{i + 1}</span>
                                    <span class="text-lg">{teamEmoji(t.team)}</span>
                                    <span class="text-white flex-1 truncate">{teamLabel(t.team)}</span>
                                    <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div class="bg-cyan-400 h-full" style:width="{(100 * t.goalsAgainstPerGame / (max || 1)).toFixed(1)}%"></div>
                                    </div>
                                    <span class="text-cyan-400 font-bold w-16 text-right tabular-nums">{t.goalsAgainstPerGame} G/C</span>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div class="block md:hidden space-y-2">
                        {#each sortedStandings as t}
                            <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="text-lg">{teamEmoji(t.team)}</span>
                                        <span class="text-white font-semibold">{teamLabel(t.team)}</span>
                                    </div>
                                    <span class="text-yellow-400 font-black">{t.points} pts</span>
                                </div>
                                <div class="text-xs text-gray-400 grid grid-cols-4 gap-2 text-center">
                                    <div><span class="text-gray-500">PJ</span> {t.played}</div>
                                    <div><span class="text-emerald-400">G/F</span> {t.goalsFor}</div>
                                    <div><span class="text-red-400">G/C</span> {t.goalsAgainst}</div>
                                    <div><span class="text-gray-500">Dif</span> {t.goalDifference > 0 ? '+' : ''}{t.goalDifference}</div>
                                </div>
                                <div class="flex items-center gap-1 mt-2">
                                    <span class="text-xs text-gray-500">Últimos 5:</span>
                                    {#each t.last5 as r}
                                        <span class="w-3 h-3 rounded-sm {sparklineClass(r)}"></span>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="hidden md:block overflow-x-auto bg-white/5 rounded-xl border border-white/10">
                        <table class="w-full text-sm min-w-[640px]">
                            <thead class="text-left text-gray-400 border-b border-white/10">
                                <tr>
                                    <th class="py-2 px-3">Selección</th>
                                    <th class="py-2 px-3 text-right">PJ</th>
                                    <th class="py-2 px-3 text-right">G/F</th>
                                    <th class="py-2 px-3 text-right">G/C</th>
                                    <th class="py-2 px-3 text-right">Dif</th>
                                    <th class="py-2 px-3 text-right">Pts</th>
                                    <th class="py-2 px-3 text-center">Últimos 5</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each sortedStandings as t}
                                    <tr class="border-b border-white/5 hover:bg-white/5">
                                        <td class="py-2 px-3">
                                            <div class="flex items-center gap-2">
                                                {#if flagUrl(t.team)}
                                                    <img src={flagUrl(t.team)} alt="" class="w-5 h-3.5 object-cover rounded-sm" />
                                                {:else}
                                                    <span class="text-base">{teamEmoji(t.team)}</span>
                                                {/if}
                                                <span class="text-white font-medium">{teamLabel(t.team)}</span>
                                            </div>
                                        </td>
                                        <td class="py-2 px-3 text-right">{t.played}</td>
                                        <td class="py-2 px-3 text-right text-emerald-400">{t.goalsFor}</td>
                                        <td class="py-2 px-3 text-right text-red-400">{t.goalsAgainst}</td>
                                        <td class="py-2 px-3 text-right {t.goalDifference > 0 ? 'text-emerald-400' : t.goalDifference < 0 ? 'text-red-400' : 'text-gray-400'}">{t.goalDifference > 0 ? '+' : ''}{t.goalDifference}</td>
                                        <td class="py-2 px-3 text-right text-yellow-400 font-bold">{t.points}</td>
                                        <td class="py-2 px-3 text-center">
                                            <div class="inline-flex gap-0.5">
                                                {#each t.last5 as r}
                                                    <span class="w-3 h-3 rounded-sm {sparklineClass(r)}"></span>
                                                {/each}
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </section>

            <!-- 5. Predicciones especiales -->
            <section>
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">🏆 Predicciones del grupo (campeón / sub / goleador)</h3>
                {#if special.champion.length === 0 && special.runnerup.length === 0 && special.topscorer.length === 0}
                    <p class="text-gray-500 text-sm text-center py-4 bg-white/5 rounded-xl">Sin predicciones especiales registradas</p>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {#each [
                            { title: '🏆 Campeón', items: special.champion },
                            { title: '🥈 Subcampeón', items: special.runnerup },
                            { title: '⚽ Goleador', items: special.topscorer }
                        ] as block}
                            <div class="bg-white/5 rounded-xl p-3 border border-white/10">
                                <h4 class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-3">{block.title}</h4>
                                {#if block.items.length === 0}
                                    <p class="text-gray-500 text-xs">Sin datos</p>
                                {:else}
                                    {@const top = block.items[0]}
                                    {@const max = top.count || 1}
                                    {#each block.items as item, i}
                                        <div class="flex items-center gap-2 text-sm py-1">
                                            <span class="text-gray-500 w-4 text-right">{i + 1}</span>
                                            {#if predictionFlag(item.value)}
                                                <img src={predictionFlag(item.value)} alt="" class="w-4 h-3 object-cover rounded-sm shrink-0" />
                                            {:else}
                                                <span class="w-4 shrink-0"></span>
                                            {/if}
                                            <span class="text-white flex-1 truncate">{predictionLabel(item.value)}</span>
                                            <div class="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                                                <div class="bg-yellow-400 h-full" style:width="{(100 * item.count / max).toFixed(1)}%"></div>
                                            </div>
                                            <span class="text-yellow-400 font-bold w-14 text-right tabular-nums">{item.pct}%</span>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>

            <!-- 6. Ranking FIFA -->
            <section>
                <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">🌍 Ranking FIFA (masculino)</h3>
                {#if fifaLoading}
                    <p class="text-gray-500 text-sm text-center py-4 bg-white/5 rounded-xl">Cargando ranking…</p>
                {:else if fifa.rankings.length === 0}
                    <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
                        <p class="font-semibold mb-1">📋 Ranking FIFA no disponible</p>
                        <p class="text-yellow-200/70 text-xs">Para habilitarlo, actualiza el archivo <code class="bg-black/30 px-1 rounded">public/fifa_rankings.json</code> con el último snapshot publicado en <a href="https://www.fifa.com/es/world-rankings" target="_blank" rel="noreferrer" class="underline">fifa.com/es/world-rankings</a>.</p>
                    </div>
                {:else}
                    <div class="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        <div class="p-3 text-xs text-gray-400 border-b border-white/10 flex items-center justify-between">
                            <span>Top {Math.min(fifa.rankings.length, 20)} selecciones</span>
                            {#if fifa.updated}
                                <span>Actualizado: {fifa.updated}</span>
                            {/if}
                        </div>
                        <div class="block md:hidden">
                            {#each fifa.rankings.slice(0, 20) as r}
                                <div class="flex items-center gap-2 p-2 border-b border-white/5 text-sm">
                                    <span class="text-yellow-400 font-bold w-8 text-right">{r.rank}</span>
                                    <span class="text-lg">{teamEmoji(r.team)}</span>
                                    <span class="text-white flex-1 truncate">{teamLabel(r.team)}</span>
                                    <span class="text-gray-300 font-bold tabular-nums">{r.points}</span>
                                    {#if typeof r.change === 'number' && r.change !== 0}
                                        <span class="text-xs {r.change > 0 ? 'text-emerald-400' : 'text-red-400'}">{r.change > 0 ? '↑' : '↓'}{Math.abs(r.change)}</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                        <table class="hidden md:table w-full text-sm min-w-[500px]">
                            <thead class="text-left text-gray-400 border-b border-white/10">
                                <tr>
                                    <th class="py-2 px-3 w-12">#</th>
                                    <th class="py-2 px-3">Selección</th>
                                    <th class="py-2 px-3 text-right">Puntos</th>
                                    {#if fifa.rankings.some(/** @param {any} r */ r => typeof r.change === 'number' && r.change !== 0)}
                                        <th class="py-2 px-3 text-right">Δ</th>
                                    {/if}
                                    {#if fifa.rankings.some(/** @param {any} r */ r => r.confederation)}
                                        <th class="py-2 px-3">Confederación</th>
                                    {/if}
                                </tr>
                            </thead>
                            <tbody>
                                {#each fifa.rankings.slice(0, 20) as r}
                                    <tr class="border-b border-white/5 hover:bg-white/5">
                                        <td class="py-1.5 px-3 text-yellow-400 font-bold">{r.rank}</td>
                                        <td class="py-1.5 px-3">
                                            <div class="flex items-center gap-2">
                                                {#if flagUrl(r.team)}
                                                    <img src={flagUrl(r.team)} alt="" class="w-5 h-3.5 object-cover rounded-sm" />
                                                {:else}
                                                    <span class="text-base">{teamEmoji(r.team)}</span>
                                                {/if}
                                                <span class="text-white">{teamLabel(r.team)}</span>
                                            </div>
                                        </td>
                                        <td class="py-1.5 px-3 text-right text-gray-200 font-bold tabular-nums">{r.points}</td>
                                        {#if fifa.rankings.some(/** @param {any} rr */ rr => typeof rr.change === 'number' && rr.change !== 0)}
                                            <td class="py-1.5 px-3 text-right {r.change > 0 ? 'text-emerald-400' : r.change < 0 ? 'text-red-400' : 'text-gray-500'}">{typeof r.change === 'number' && r.change !== 0 ? (r.change > 0 ? '+' : '') + r.change : '—'}</td>
                                        {/if}
                                        {#if fifa.rankings.some(/** @param {any} rr */ rr => rr.confederation)}
                                            <td class="py-1.5 px-3 text-gray-400 text-xs">{r.confederation || ''}</td>
                                        {/if}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </section>

        </div>
    </div>
</div>
