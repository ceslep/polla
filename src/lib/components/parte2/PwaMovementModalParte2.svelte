<script>
    import { computeMovement, getLatestFinishedDate } from '../../stores.svelte.js';
    import SyncStatus from '../pwa/SyncStatus.svelte';

    /** @type {{ bets: any[], matches: any[], winners?: Array<{participant: string, points: number, rank: number}>, onClose: () => void, onRefresh?: () => (void | Promise<void>) }} */
    let { bets = [], matches = [], winners = /** @type {Array<{participant: string, points: number, rank: number}>} */ ([]), onClose, onRefresh = () => {} } = $props();

    /** Pestaña activa. */
    let tab = $state(/** @type {'movimiento' | 'estadisticas'} */ ('movimiento'));

    /** @param {string} name */
    function cleanName(name) {
        const clean = name
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{2700}-\u{27BF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
            .replace(/[^a-zA-Z0-9ñÑ\s]/g, '')
            .replace(/\s+/g, ' ').trim();
        return clean.length === 0 ? 'sin nombre' : clean;
    }

    /** @param {string} dateStr */
    function formatDateShort(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}`;
    }

    /**
     * Calcula los winners desde el prop `bets` (no desde el estado global).
     * Esto permite que la PWA pase sus propios bets scoreados y se
     * calcule el ranking consistentemente sin contaminarse con bets
     * de WhatsApp u otros orígenes.
     * @returns {Array<{participant: string, points: number, rank: number}>}
     */
    function calculateWinners() {
        const pointsByParticipant = new Map();
        for (const bet of bets) {
            if (bet.status === 'pending') continue;
            const current = pointsByParticipant.get(bet.participant) || 0;
            pointsByParticipant.set(bet.participant, current + (Number(bet.points) || 0));
        }
        const sorted = [...pointsByParticipant.entries()]
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);
        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }

    const computedWinners = $derived(
        winners.length > 0
            ? winners
            : calculateWinners()
    );
    const movement = $derived(computeMovement(bets, matches, computedWinners));
    const yesterday = $derived(getLatestFinishedDate(matches));

    const up = $derived(movement.filter(m => m.kind === 'up'));
    const down = $derived(movement.filter(m => m.kind === 'down'));
    const same = $derived(movement.filter(m => m.kind === 'same'));
    const fresh = $derived(movement.filter(m => m.kind === 'new'));

    const hasMovement = $derived(movement.length > 0);

    /* ──────────────────────────────────────────────────────────────────
     * Estadísticas — derivados SOLO-DISPLAY (no alteran scoring ni ranking)
     * ────────────────────────────────────────────────────────────────── */

    /** Metadatos de cada categoría de apuesta para la UI. */
    const CATEGORY_META = /** @type {Record<string, {icon: string, label: string}>} */ ({
        champion: { icon: '🥇', label: 'Campeón' },
        runnerup: { icon: '🥈', label: 'Subcampeón' },
        thirdplace: { icon: '🥉', label: 'Tercer lugar' },
        topscorer: { icon: '👟', label: 'Goleador' },
        score: { icon: '⚽', label: 'Marcadores' }
    });

    const resolvedBets = $derived(bets.filter(b => b.status !== 'pending'));

    const stats = $derived.by(() => {
        const participants = new Set(bets.map(b => b.participant).filter(Boolean)).size;
        const totalBets = bets.length;
        const resolved = resolvedBets.length;
        const pending = totalBets - resolved;
        let totalPoints = 0;
        let exact = 0, correct = 0, incorrect = 0;
        /** @type {Record<string, {count: number, points: number, hits: number}>} */
        const cat = {};

        for (const b of resolvedBets) {
            const pts = Number(b.points) || 0;
            totalPoints += pts;
            if (b.status === 'exact') exact++;
            else if (b.status === 'correct') correct++;
            else incorrect++;

            const t = b.type || 'score';
            if (!cat[t]) cat[t] = { count: 0, points: 0, hits: 0 };
            cat[t].count++;
            cat[t].points += pts;
            if (b.status === 'exact' || b.status === 'correct') cat[t].hits++;
        }

        const hits = exact + correct;
        const hitRate = resolved > 0 ? Math.round((hits / resolved) * 100) : 0;

        // Categorías ordenadas por puntos desc, solo las que tienen datos.
        const categories = Object.entries(cat)
            .map(([key, v]) => ({
                key,
                icon: CATEGORY_META[key]?.icon || '🎯',
                label: CATEGORY_META[key]?.label || key,
                ...v,
                accuracy: v.count > 0 ? Math.round((v.hits / v.count) * 100) : 0
            }))
            .sort((a, b) => b.points - a.points);
        const maxCatPoints = categories.reduce((m, c) => Math.max(m, c.points), 0);

        return {
            participants, totalBets, resolved, pending, totalPoints,
            exact, correct, incorrect, hits, hitRate,
            avgPerParticipant: participants > 0 ? Math.round(totalPoints / participants) : 0,
            categories, maxCatPoints
        };
    });

    /** Top-10 del ranking para el gráfico de barras de líderes. */
    const leaderboard = $derived(computedWinners.slice(0, 10));
    const maxLeaderPoints = $derived(computedWinners[0]?.points || 0);

    /**
     * Distribución de puntos: total de puntos por participante (resueltos),
     * con medidas de tendencia central, dispersión e histograma.
     * Todo display-only — no toca scoring ni ranking.
     */
    const distribution = $derived.by(() => {
        // Total de puntos por participante (solo apuestas calificadas).
        /** @type {Map<string, number>} */
        const byParticipant = new Map();
        for (const b of resolvedBets) {
            if (!b.participant) continue;
            byParticipant.set(b.participant, (byParticipant.get(b.participant) || 0) + (Number(b.points) || 0));
        }
        const values = [...byParticipant.values()].sort((a, b) => a - b);
        const n = values.length;
        if (n === 0) {
            return { n: 0, mean: 0, median: 0, mode: 0, stdDev: 0, min: 0, max: 0, range: 0, bins: /** @type {Array<{label:string, count:number, lo:number, hi:number}>} */ ([]), maxBin: 0, meanPos: 0, medianPos: 0 };
        }

        const sum = values.reduce((s, v) => s + v, 0);
        const mean = sum / n;

        // Mediana.
        const mid = Math.floor(n / 2);
        const median = n % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];

        // Moda (valor más frecuente; el menor en caso de empate).
        /** @type {Map<number, number>} */
        const freq = new Map();
        let mode = values[0];
        let modeCount = 0;
        for (const v of values) {
            const c = (freq.get(v) || 0) + 1;
            freq.set(v, c);
            if (c > modeCount) { modeCount = c; mode = v; }
        }

        // Desviación estándar poblacional.
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
        const stdDev = Math.sqrt(variance);

        const min = values[0];
        const max = values[n - 1];
        const range = max - min;

        // Histograma: hasta 6 bins de ancho uniforme.
        const binCount = Math.min(6, Math.max(1, range > 0 ? Math.ceil(Math.sqrt(n)) : 1));
        const width = range > 0 ? range / binCount : 1;
        /** @type {Array<{label:string, count:number, lo:number, hi:number}>} */
        const bins = Array.from({ length: binCount }, (_, i) => {
            const lo = min + i * width;
            const hi = i === binCount - 1 ? max : min + (i + 1) * width;
            return { label: `${Math.round(lo)}–${Math.round(hi)}`, count: 0, lo, hi };
        });
        for (const v of values) {
            let idx = width > 0 ? Math.floor((v - min) / width) : 0;
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx].count++;
        }
        const maxBin = bins.reduce((m, b) => Math.max(m, b.count), 0);

        // Posición % de media/mediana sobre el eje [min,max] para los marcadores.
        const meanPos = range > 0 ? ((mean - min) / range) * 100 : 50;
        const medianPos = range > 0 ? ((median - min) / range) * 100 : 50;

        return {
            n,
            mean: Math.round(mean * 10) / 10,
            median: Math.round(median * 10) / 10,
            mode,
            stdDev: Math.round(stdDev * 10) / 10,
            min, max, range,
            bins, maxBin, meanPos, medianPos
        };
    });

    /** Resumen de movimiento para los chips de la pestaña de stats. */
    const moveSummary = $derived([
        { key: 'up', icon: '⬆️', label: 'Subieron', count: up.length, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
        { key: 'down', icon: '⬇️', label: 'Bajaron', count: down.length, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
        { key: 'same', icon: '➖', label: 'Igual', count: same.length, color: 'text-gray-300 bg-white/5 border-white/10' },
        { key: 'new', icon: '🆕', label: 'Nuevos', count: fresh.length, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' }
    ]);

    /** @type {string | null} */
    let copyMessage = $state(null);

    function copyToWhatsApp() {
        if (movement.length === 0) return;
        if (!yesterday) return;

        const today = new Date();
        const todayStr = `${today.getDate()}/${today.getMonth() + 1}`;

        /** @type {string[]} */
        const lines = [];
        lines.push('📊 MOVIMIENTO — Mundial 2026');
        lines.push(`(corte: ${formatDateShort(yesterday)}, hoy ${todayStr})`);
        lines.push('');

        if (up.length > 0) {
            lines.push(`⬆️ SUBIERON (${up.length}):`);
            for (const m of up) {
                const delta = (m.prevRank || 0) - m.currRank;
                const ptsDelta = m.currPoints - m.prevPoints;
                const ptsStr = ptsDelta > 0 ? ` · +${ptsDelta} pts` : '';
                lines.push(`• ${cleanName(m.participant)}: ${m.prevRank}° → ${m.currRank}° (+${delta})${ptsStr}`);
            }
            lines.push('');
        }
        if (down.length > 0) {
            lines.push(`⬇️ BAJARON (${down.length}):`);
            for (const m of down) {
                const delta = m.currRank - (m.prevRank || 0);
                const ptsDelta = m.currPoints - m.prevPoints;
                const ptsStr = ptsDelta < 0 ? ` · ${ptsDelta} pts` : '';
                lines.push(`• ${cleanName(m.participant)}: ${m.prevRank}° → ${m.currRank}° (-${delta})${ptsStr}`);
            }
            lines.push('');
        }
        if (same.length > 0) {
            lines.push(`= MANTUVIERON (${same.length}):`);
            for (const m of same) {
                lines.push(`• ${cleanName(m.participant)}: ${m.currRank}° → ${m.currRank}°`);
            }
            lines.push('');
        }
        if (fresh.length > 0) {
            lines.push(`🆕 NUEVOS (${fresh.length}):`);
            for (const m of fresh) {
                lines.push(`• ${cleanName(m.participant)} entró en ${m.currRank}°`);
            }
            lines.push('');
        }

        const text = lines.join('\n').trimEnd();
        navigator.clipboard.writeText(text).then(() => {
            copyMessage = '¡Copiado!';
            setTimeout(() => { copyMessage = null; }, 2000);
        });
    }

    /** @param {string} participant */
    function getPhone(participant) {
        return bets.find(b => b.participant === participant)?.phone || '';
    }
</script>

<!--
  Fila de movimiento con delta (subieron/bajaron).
  @param m     Objeto de movimiento.
  @param kind  'up' | 'down'.
-->
{#snippet deltaRow(/** @type {any} */ m, /** @type {'up'|'down'} */ kind)}
    {@const delta = kind === 'up' ? (m.prevRank || 0) - m.currRank : m.currRank - (m.prevRank || 0)}
    {@const ptsDelta = m.currPoints - m.prevPoints}
    {@const phone = getPhone(m.participant)}
    {@const accent = kind === 'up' ? 'text-emerald-400' : 'text-red-400'}
    {@const accentSoft = kind === 'up' ? 'text-emerald-300/80' : 'text-red-300/80'}
    <div class="bg-black/20 rounded-xl p-3 transition-all hover:bg-black/30">
        <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
                <div class="text-white font-semibold truncate">{m.participant}</div>
                {#if phone}<div class="text-xs text-gray-500">{phone}</div>{/if}
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <span class="text-base font-black {accent} tabular-nums">{kind === 'up' ? '+' : '-'}{delta}</span>
                <div class="text-right">
                    <div class="text-xs text-gray-400 tabular-nums">
                        {m.prevRank}° → <span class="text-white font-bold">{m.currRank}°</span>
                    </div>
                    {#if ptsDelta !== 0}
                        <div class="text-[11px] {accentSoft} tabular-nums">{ptsDelta > 0 ? '+' : ''}{ptsDelta} pts</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/snippet}

<!--
  Fila simple (mantuvieron / nuevos).
  @param m      Objeto de movimiento.
  @param tone   Clase de color del texto del nombre.
  @param right  Texto a la derecha.
-->
{#snippet simpleRow(/** @type {any} */ m, /** @type {string} */ tone, /** @type {string} */ right)}
    {@const phone = getPhone(m.participant)}
    <div class="flex items-center justify-between gap-2 bg-black/20 rounded-lg p-2 px-3">
        <div class="min-w-0 flex-1">
            <div class="text-sm truncate {tone}">{m.participant}</div>
            {#if phone}<div class="text-xs text-gray-500">{phone}</div>{/if}
        </div>
        <div class="text-xs shrink-0 tabular-nums">{right}</div>
    </div>
{/snippet}

<!-- KPI compacto. -->
{#snippet kpi(/** @type {string} */ icon, /** @type {string|number} */ value, /** @type {string} */ label, /** @type {string} */ accent)}
    <div class="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col items-center text-center">
        <div class="text-xl mb-1">{icon}</div>
        <div class="text-2xl font-black tabular-nums animate-number-pop {accent}">{value}</div>
        <div class="text-[10px] uppercase tracking-wider text-gray-500 leading-tight mt-0.5">{label}</div>
    </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 md:p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="relative bg-gray-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-scale-in" onclick={(e) => e.stopPropagation()}>
        <!-- Header -->
        <div class="relative flex-shrink-0 overflow-hidden border-b border-white/10">
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10"></div>
            <div class="pointer-events-none absolute -top-16 -right-10 w-48 h-48 bg-cyan-500/10 blur-3xl rounded-full"></div>
            <div class="relative p-4 md:p-5 flex justify-between items-center gap-3">
                <div class="min-w-0">
                    <h2 class="text-lg md:text-xl font-black bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">📊 Ranking & Movimiento · Parte 2</h2>
                    <p class="text-xs text-gray-400 mt-0.5">
                        {#if yesterday}
                            Corte: <span class="text-gray-300">{formatDateShort(yesterday)}</span>
                        {:else}
                            Sin partidos finalizados
                        {/if}
                    </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <SyncStatus onRefresh={onRefresh} compact />
                    <button class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 text-xl transition-all" onclick={onClose} aria-label="Cerrar">&times;</button>
                </div>
            </div>

            <!-- Tabs -->
            <div class="relative px-3 md:px-4 pb-3 flex gap-2">
                <button
                    class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border {tab === 'movimiento' ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}"
                    onclick={() => tab = 'movimiento'}
                >
                    📈 Movimiento
                </button>
                <button
                    class="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border {tab === 'estadisticas' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}"
                    onclick={() => tab = 'estadisticas'}
                >
                    📊 Estadísticas
                </button>
            </div>
        </div>

        <!-- Body -->
        <div class="p-4 md:p-5 overflow-y-auto flex-1">
            {#if tab === 'movimiento'}
                <!-- ===== Tab Movimiento ===== -->
                {#if !hasMovement}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center animate-fade-in">
                        <div class="text-5xl mb-3">📭</div>
                        <div class="text-gray-300 font-bold">Sin movimiento para mostrar</div>
                        <p class="text-gray-500 text-sm mt-1">Necesitamos partidos finalizados para calcular el cambio de puestos.</p>
                    </div>
                {:else}
                    <div class="space-y-4">
                        {#if up.length > 0}
                            <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                                <h3 class="text-emerald-400 font-bold text-sm uppercase mb-3 flex items-center gap-2"><span>⬆️</span> Subieron ({up.length})</h3>
                                <div class="space-y-2 stagger-children">
                                    {#each up as m (m.participant)}{@render deltaRow(m, 'up')}{/each}
                                </div>
                            </div>
                        {/if}
                        {#if down.length > 0}
                            <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                                <h3 class="text-red-400 font-bold text-sm uppercase mb-3 flex items-center gap-2"><span>⬇️</span> Bajaron ({down.length})</h3>
                                <div class="space-y-2 stagger-children">
                                    {#each down as m (m.participant)}{@render deltaRow(m, 'down')}{/each}
                                </div>
                            </div>
                        {/if}
                        {#if same.length > 0}
                            <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <h3 class="text-gray-300 font-bold text-sm uppercase mb-3 flex items-center gap-2"><span>➖</span> Mantuvieron ({same.length})</h3>
                                <div class="space-y-1.5 stagger-children">
                                    {#each same as m (m.participant)}{@render simpleRow(m, 'text-gray-200', `${m.currRank}°`)}{/each}
                                </div>
                            </div>
                        {/if}
                        {#if fresh.length > 0}
                            <div class="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4">
                                <h3 class="text-cyan-400 font-bold text-sm uppercase mb-3 flex items-center gap-2"><span>🆕</span> Nuevos ({fresh.length})</h3>
                                <div class="space-y-1.5 stagger-children">
                                    {#each fresh as m (m.participant)}{@render simpleRow(m, 'text-cyan-100', `entró en ${m.currRank}°`)}{/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            {:else}
                <!-- ===== Tab Estadísticas ===== -->
                {#if stats.totalBets === 0}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center animate-fade-in">
                        <div class="text-5xl mb-3">📊</div>
                        <div class="text-gray-300 font-bold">Sin datos todavía</div>
                        <p class="text-gray-500 text-sm mt-1">Aún no hay apuestas registradas.</p>
                    </div>
                {:else}
                    <div class="space-y-5 animate-fade-in">
                        <!-- KPIs -->
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {@render kpi('👥', stats.participants, 'Participantes', 'text-cyan-300')}
                            {@render kpi('🎯', stats.totalBets, 'Apuestas', 'text-white')}
                            {@render kpi('⭐', stats.totalPoints, 'Puntos totales', 'text-amber-300')}
                            {@render kpi('🎖️', `${stats.hitRate}%`, 'Aciertos', 'text-emerald-300')}
                        </div>

                        <!-- Precisión global -->
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">🎯 Precisión global
                                <span class="ml-auto text-xs font-normal text-gray-500">{stats.resolved} calificadas</span>
                            </h3>
                            {#if stats.resolved === 0}
                                <p class="text-gray-500 text-sm text-center py-2">Aún no hay apuestas calificadas.</p>
                            {:else}
                                <!-- Barra apilada -->
                                <div class="flex h-4 rounded-full overflow-hidden bg-white/5">
                                    {#if stats.exact > 0}<div class="bg-gradient-to-r from-emerald-500 to-emerald-400 animate-bar-grow" style:width="{(stats.exact / stats.resolved) * 100}%" style:transform-origin="left" title="Exactos: {stats.exact}"></div>{/if}
                                    {#if stats.correct > 0}<div class="bg-gradient-to-r from-cyan-500 to-cyan-400 animate-bar-grow" style:width="{(stats.correct / stats.resolved) * 100}%" style:transform-origin="left" title="Acertados: {stats.correct}"></div>{/if}
                                    {#if stats.incorrect > 0}<div class="bg-white/15 animate-bar-grow" style:width="{(stats.incorrect / stats.resolved) * 100}%" style:transform-origin="left" title="Fallados: {stats.incorrect}"></div>{/if}
                                </div>
                                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
                                    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span> Exactos <span class="font-bold text-white tabular-nums">{stats.exact}</span></span>
                                    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-cyan-400"></span> Acertados <span class="font-bold text-white tabular-nums">{stats.correct}</span></span>
                                    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-white/30"></span> Fallados <span class="font-bold text-white tabular-nums">{stats.incorrect}</span></span>
                                </div>
                            {/if}
                        </div>

                        <!-- Top líderes -->
                        {#if leaderboard.length > 0}
                            <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">🏆 Top líderes
                                    <span class="ml-auto text-xs font-normal text-gray-500">acumulado</span>
                                </h3>
                                <div class="space-y-2 stagger-children">
                                    {#each leaderboard as w, i (w.participant)}
                                        {@const pct = maxLeaderPoints > 0 ? (w.points / maxLeaderPoints) * 100 : 0}
                                        {@const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                                        <div class="flex items-center gap-2.5" style="--i: {i}">
                                            <span class="w-6 text-center text-sm font-bold {i < 3 ? 'text-amber-400' : 'text-gray-500'} shrink-0">{medal}</span>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center justify-between gap-2 mb-1">
                                                    <span class="text-sm text-gray-200 truncate">{w.participant}</span>
                                                    <span class="text-sm font-black text-cyan-300 tabular-nums shrink-0">{w.points}</span>
                                                </div>
                                                <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                                                    <div class="h-full rounded-full bg-gradient-to-r {i === 0 ? 'from-amber-500 to-amber-300' : 'from-cyan-500 to-emerald-400'} animate-bar-grow" style:width="{pct}%" style:transform-origin="left"></div>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Puntos por categoría -->
                        {#if stats.categories.length > 0}
                            <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">📂 Puntos por categoría</h3>
                                <div class="space-y-3 stagger-children">
                                    {#each stats.categories as c, i (c.key)}
                                        {@const pct = stats.maxCatPoints > 0 ? (c.points / stats.maxCatPoints) * 100 : 0}
                                        <div style="--i: {i}">
                                            <div class="flex items-center justify-between gap-2 mb-1 text-sm">
                                                <span class="flex items-center gap-2 min-w-0"><span>{c.icon}</span><span class="truncate text-gray-200">{c.label}</span></span>
                                                <span class="shrink-0 text-gray-400 text-xs">
                                                    <span class="text-emerald-300 font-bold tabular-nums">{c.points}</span> pts ·
                                                    <span class="tabular-nums">{c.accuracy}%</span>
                                                </span>
                                            </div>
                                            <div class="h-2.5 rounded-full bg-white/5 overflow-hidden">
                                                <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 animate-bar-grow" style:width="{pct}%" style:transform-origin="left"></div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <!-- Tendencia central (puntos por participante) -->
                        {#if distribution.n > 0}
                            <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">📐 Tendencia central
                                    <span class="ml-auto text-xs font-normal text-gray-500">{distribution.n} participantes · pts</span>
                                </h3>
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                    {@render kpi('x̄', distribution.mean, 'Media', 'text-cyan-300')}
                                    {@render kpi('M', distribution.median, 'Mediana', 'text-emerald-300')}
                                    {@render kpi('Mo', distribution.mode, 'Moda', 'text-amber-300')}
                                    {@render kpi('σ', distribution.stdDev, 'Desv. est.', 'text-fuchsia-300')}
                                </div>
                                <!-- Eje min–max con marcadores de media y mediana -->
                                <div class="mt-4">
                                    <div class="relative h-9">
                                        <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-cyan-500/30 via-emerald-500/30 to-amber-500/30"></div>
                                        <!-- Mediana -->
                                        <div class="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2" style:left="{distribution.medianPos}%" title="Mediana: {distribution.median}">
                                            <span class="text-[9px] text-emerald-300 leading-none">M</span>
                                            <span class="flex-1 w-0.5 bg-emerald-400"></span>
                                        </div>
                                        <!-- Media -->
                                        <div class="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2" style:left="{distribution.meanPos}%" title="Media: {distribution.mean}">
                                            <span class="flex-1 w-0.5 bg-cyan-400"></span>
                                            <span class="text-[9px] text-cyan-300 leading-none">x̄</span>
                                        </div>
                                    </div>
                                    <div class="flex justify-between text-[10px] text-gray-500 mt-1 tabular-nums">
                                        <span>mín {distribution.min}</span>
                                        <span>rango {distribution.range}</span>
                                        <span>máx {distribution.max}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Distribución (histograma) -->
                            {#if distribution.bins.length > 0}
                                <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                                    <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">📊 Distribución de puntos
                                        <span class="ml-auto text-xs font-normal text-gray-500">frecuencia</span>
                                    </h3>
                                    <div class="flex items-end gap-1.5 md:gap-2 h-36 pb-1">
                                        {#each distribution.bins as b, i (b.label)}
                                            {@const h = distribution.maxBin > 0 ? (b.count / distribution.maxBin) * 100 : 0}
                                            <div class="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1" style="--i: {i}">
                                                <div class="text-[10px] font-bold text-gray-300 tabular-nums {b.count === 0 ? 'opacity-30' : ''}">{b.count}</div>
                                                <div
                                                    class="w-full rounded-t-md bg-gradient-to-t from-fuchsia-600 via-cyan-500 to-emerald-400 animate-bar-grow {b.count === 0 ? 'opacity-20' : ''}"
                                                    style="height: {Math.max(h, b.count > 0 ? 6 : 2)}%; animation-delay: calc(var(--i) * 60ms)"
                                                    title="{b.label} pts: {b.count}"
                                                ></div>
                                                <div class="text-[9px] text-gray-500 tabular-nums text-center leading-tight">{b.label}</div>
                                            </div>
                                        {/each}
                                    </div>
                                    <p class="text-[10px] text-gray-500 mt-2 text-center">Cuántos participantes caen en cada rango de puntos acumulados.</p>
                                </div>
                            {/if}
                        {/if}

                        <!-- Resumen de movimiento -->
                        <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                            <h3 class="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">📈 Resumen de movimiento
                                <span class="ml-auto text-xs font-normal text-gray-500">vs corte anterior</span>
                            </h3>
                            <div class="grid grid-cols-4 gap-2">
                                {#each moveSummary as s (s.key)}
                                    <div class="rounded-xl border p-2.5 flex flex-col items-center {s.color}">
                                        <div class="text-lg">{s.icon}</div>
                                        <div class="text-xl font-black tabular-nums">{s.count}</div>
                                        <div class="text-[10px] text-gray-400 leading-tight">{s.label}</div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Footer -->
        <div class="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center flex-shrink-0 gap-3">
            <div class="flex items-center gap-2 min-w-0">
                {#if copyMessage}
                    <span class="text-emerald-400 text-sm font-medium animate-fade-in">{copyMessage}</span>
                {/if}
                <button
                    class="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    onclick={copyToWhatsApp}
                    disabled={!hasMovement}
                    title="Copiar movimiento a WhatsApp"
                >
                    📋 Copiar
                </button>
            </div>
            <button
                class="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors shrink-0"
                onclick={onClose}
            >
                Cerrar
            </button>
        </div>
    </div>
</div>
