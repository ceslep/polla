<script>
    import { computeMovement, getLatestFinishedDate, MIN_POINTS_THRESHOLD } from '../stores.svelte.js';

    /** @type {{ bets: any[], matches: any[], winners?: Array<{participant: string, points: number, rank: number}>, onClose: () => void, onRefresh?: () => void, loading?: boolean }} */
    let { bets = [], matches = [], winners = /** @type {Array<{participant: string, points: number, rank: number}>} */ ([]), onClose, onRefresh = undefined, loading = false } = $props();

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
            .filter(([, points]) => points >= MIN_POINTS_THRESHOLD)
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);
        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }

    const computedWinners = $derived(
        winners.length > 0
            ? winners.filter(w => w.points >= MIN_POINTS_THRESHOLD)
            : calculateWinners()
    );
    const movement = $derived(computeMovement(bets, matches, computedWinners));
    const yesterday = $derived(getLatestFinishedDate(matches));

    const up = $derived(
        movement
            .filter(m => m.kind === 'up')
            .map(m => ({ ...m, ptsDelta: m.currPoints - m.prevPoints }))
            .sort((a, b) => (b.currPoints - b.prevPoints) - (a.currPoints - a.prevPoints) || (a.prevRank || 0) - (b.prevRank || 0))
    );
    const down = $derived(
        movement
            .filter(m => m.kind === 'down')
            .map(m => ({ ...m, ptsDelta: m.currPoints - m.prevPoints }))
            .sort((a, b) => (a.currPoints - a.prevPoints) - (b.currPoints - b.prevPoints) || (b.prevRank || 0) - (a.prevRank || 0))
    );
    const same = $derived(movement.filter(m => m.kind === 'same'));
    const fresh = $derived(movement.filter(m => m.kind === 'new'));

    const hasMovement = $derived(movement.length > 0);

    /**
     * Snapshot A: ranking del día ANTERIOR a `yesterday` (puestos antes de los
     * resultados de ayer). Se reconstruye con la misma lógica que
     * `computeMovement` para `pointsBefore`, pero ordenado completo.
     * @type {Array<{participant: string, points: number, rank: number}>}
     */
    const snapshotA = $derived.by(() => {
        if (!yesterday) return [];
        /** @type {Map<string, number>} */
        const pointsBefore = new Map();
        for (const bet of bets) {
            if (bet.type !== 'score' || bet.status === 'pending') continue;
            const points = Number(bet.points) || 0;
            if (points === 0) continue;
            const pred = bet.prediction || {};
            const h = pred.homeTeam, a = pred.awayTeam;
            if (!h || !a) continue;
            const match = matches.find(m =>
                (m.homeTeam === h && m.awayTeam === a) ||
                (m.homeTeam === a && m.awayTeam === h));
            if (!match || !match.date) continue;
            if (match.date >= yesterday) continue;
            pointsBefore.set(bet.participant, (pointsBefore.get(bet.participant) || 0) + points);
        }
        const sorted = [...pointsBefore.entries()].sort((a, b) => b[1] - a[1]);
        return sorted.map(([participant, points], i) => ({ participant, points, rank: i + 1 }));
    });

    /**
     * Snapshot B: ranking ACTUAL (incluye los resultados de ayer).
     * @type {Array<{participant: string, points: number, rank: number}>}
     */
    const snapshotB = $derived(
        [...computedWinners].sort((a, b) => a.rank - b.rank)
    );

    /**
     * Mapa de movement indexado por participant para lookup O(1).
     * @type {Map<string, {kind: string, prevRank: number|null, currRank: number, prevPoints: number, currPoints: number}>}
     */
    const movementByParticipant = $derived(
        new Map(movement.map(m => [m.participant, m]))
    );

    const hasSnapshots = $derived(snapshotA.length > 0 || snapshotB.length > 0);

    /** Resumen agregado del movimiento. */
    const summary = $derived.by(() => {
        const upWithPoints = up.filter(m => m.currPoints - m.prevPoints > 0);
        const upNoPoints = up.filter(m => m.currPoints - m.prevPoints === 0);
        const downWithLoss = down.filter(m => m.currPoints - m.prevPoints < 0);
        const downNoLoss = down.filter(m => m.currPoints - m.prevPoints === 0);
        const totalUpPts = upWithPoints.reduce((sum, m) => sum + (m.currPoints - m.prevPoints), 0);
        const totalDownPts = downWithLoss.reduce((sum, m) => sum + (m.currPoints - m.prevPoints), 0);
        return {
            upCount: up.length,
            upWithPointsCount: upWithPoints.length,
            upNoPointsCount: upNoPoints.length,
            downCount: down.length,
            downWithLossCount: downWithLoss.length,
            downNoLossCount: downNoLoss.length,
            sameCount: same.length,
            freshCount: fresh.length,
            totalUpPts,
            totalDownPts
        };
    });

    /**
     * Resultados del último día finalizado (yesterday), agrupados por participante.
     * Cada bet muestra: predicción, resultado real del openfootball, status (exact/correct/incorrect).
     * @type {Array<{participant: string, bets: Array<any>, exact: number, correct: number, incorrect: number, total: number}>}
     */
    const latestResultsByParticipant = $derived.by(() => {
        if (!yesterday) return [];
        const results = [];
        for (const bet of bets) {
            if (bet.type !== 'score' || bet.status === 'pending') continue;
            const pred = bet.prediction || {};
            if (!pred.homeTeam || !pred.awayTeam) continue;
            const match = matches.find(m =>
                m.date === yesterday && (
                    (m.homeTeam === pred.homeTeam && m.awayTeam === pred.awayTeam) ||
                    (m.homeTeam === pred.awayTeam && m.awayTeam === pred.homeTeam)
                )
            );
            if (!match) continue;
            results.push({
                participant: bet.participant,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                homeScore: pred.homeScore,
                awayScore: pred.awayScore,
                realHome: match.homeScore,
                realAway: match.awayScore,
                status: bet.status,
                points: Number(bet.points) || 0
            });
        }
        /** @type {Map<string, any[]>} */
        const byParticipant = new Map();
        for (const r of results) {
            const list = byParticipant.get(r.participant);
            if (list) list.push(r);
            else byParticipant.set(r.participant, [r]);
        }
        return Array.from(byParticipant.entries())
            .map(([participant, pBets]) => ({
                participant,
                bets: pBets,
                exact: pBets.filter(b => b.status === 'exact').length,
                correct: pBets.filter(b => b.status === 'correct').length,
                incorrect: pBets.filter(b => b.status === 'incorrect').length,
                total: pBets.length
            }))
            .sort((a, b) => (b.exact * 2 + b.correct) - (a.exact * 2 + a.correct));
    });

    const hasLatestResults = $derived(latestResultsByParticipant.length > 0);

    /**
     * "Snapshot A" (ayer): la fecha anterior a `yesterday` que tiene resultados.
     * Se usa en el header y en el copy para clarificar la comparación.
     */
    const dayBeforeYesterday = $derived.by(() => {
        if (!yesterday) return null;
        const finished = matches
            .filter(m => m.homeScore !== null && m.awayScore !== null && m.date < yesterday)
            .map(m => m.date)
            .sort();
        return finished.length > 0 ? finished[finished.length - 1] : null;
    });

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
        const compareNote = dayBeforeYesterday
            ? `(comparando ${formatDateShort(dayBeforeYesterday)} → ${formatDateShort(yesterday)}, hoy ${todayStr})`
            : `(corte: ${formatDateShort(yesterday)}, hoy ${todayStr})`;
        lines.push(compareNote);
        lines.push('');

        if (hasLatestResults) {
            lines.push(`⚽ RESULTADOS DEL ${formatDateShort(yesterday)}:`);
            for (const p of latestResultsByParticipant) {
                const acc = p.exact > 0 || p.correct > 0 ? `${p.exact}E ${p.correct}A` : '—';
                lines.push(`• ${cleanName(p.participant)} [${acc}]:`);
                for (const b of p.bets) {
                    const mark = b.status === 'exact' ? '✓' : b.status === 'correct' ? '~' : '✗';
                    const pts = b.points > 0 ? ` (+${b.points})` : '';
                    lines.push(`   ${mark} ${b.homeTeam} ${b.homeScore}-${b.awayScore} ${b.awayTeam} → real ${b.realHome}-${b.realAway}${pts}`);
                }
            }
            lines.push('');
        }

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 text-white border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            <div>
                <h2 class="text-xl font-bold text-cyan-400">📊 Movimiento de puestos</h2>
                <p class="text-xs text-gray-400 mt-1">
                    {#if yesterday && dayBeforeYesterday}
                        Comparando <span class="text-gray-300">{formatDateShort(dayBeforeYesterday)}</span> → <span class="text-cyan-400 font-bold">{formatDateShort(yesterday)}</span>
                    {:else if yesterday}
                        Corte: <span class="text-gray-300">{formatDateShort(yesterday)}</span>
                    {:else}
                        Sin partidos finalizados
                    {/if}
                </p>
            </div>
            <div class="flex items-center gap-2">
                {#if onRefresh}
                    <button
                        class="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all {loading ? 'animate-spin' : ''}"
                        onclick={onRefresh}
                        disabled={loading}
                        aria-label="Refrescar"
                        title="Refrescar datos"
                    >
                        🔄
                    </button>
                {/if}
                <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
            </div>
        </div>

        <div class="p-6 space-y-5 overflow-y-auto flex-1">
            {#if hasLatestResults}
                <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                    <h3 class="text-amber-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                        <span>⚽</span> Últimos resultados · {yesterday ? formatDateShort(yesterday) : ''}
                    </h3>
                    <div class="space-y-3">
                        {#each latestResultsByParticipant as p}
                            <div class="bg-black/20 rounded-xl p-3">
                                <div class="flex items-center justify-between gap-2 mb-2">
                                    <div class="text-white font-semibold truncate min-w-0">{p.participant}</div>
                                    <div class="flex items-center gap-1.5 text-xs shrink-0">
                                        {#if p.exact > 0}
                                            <span class="text-emerald-400 font-bold">✓{p.exact}</span>
                                        {/if}
                                        {#if p.correct > 0}
                                            <span class="text-amber-400 font-bold">~{p.correct}</span>
                                        {/if}
                                        {#if p.incorrect > 0}
                                            <span class="text-red-400 font-bold">✗{p.incorrect}</span>
                                        {/if}
                                        <span class="text-gray-500 text-[10px] ml-1">/ {p.total}</span>
                                    </div>
                                </div>
                                <div class="space-y-1">
                                    {#each p.bets as b}
                                        {@const mark = b.status === 'exact' ? '✓' : b.status === 'correct' ? '~' : '✗'}
                                        {@const pts = b.points > 0 ? `+${b.points}` : '0'}
                                        <div class="flex items-center justify-between text-xs gap-2">
                                            <div class="min-w-0 flex-1 truncate">
                                                <span class={b.status === 'exact' ? 'text-emerald-400 font-bold mr-1' : b.status === 'correct' ? 'text-amber-400 font-bold mr-1' : 'text-red-400 font-bold mr-1'}>{mark}</span>
                                                <span class="text-gray-200">{b.homeTeam} {b.homeScore}-{b.awayScore} {b.awayTeam}</span>
                                                <span class="text-gray-500 ml-1.5">→ {b.realHome}-{b.realAway}</span>
                                            </div>
                                            <div class={b.status === 'exact' ? 'text-emerald-400 font-bold shrink-0' : b.status === 'correct' ? 'text-amber-400 font-bold shrink-0' : 'text-red-400 font-bold shrink-0'}>
                                                {pts}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if hasMovement}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <h3 class="text-gray-300 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                        <span>📈</span> Resumen del día
                    </h3>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                            <div class="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase">
                                <span>⬆️</span> Subieron
                            </div>
                            <div class="text-white font-black text-lg">{summary.upCount}</div>
                            {#if summary.upWithPointsCount > 0}
                                <div class="text-emerald-300 text-xs">
                                    {summary.upWithPointsCount} con puntos (+{summary.totalUpPts})
                                </div>
                            {/if}
                            {#if summary.upNoPointsCount > 0}
                                <div class="text-gray-400 text-xs">{summary.upNoPointsCount} sin cambio de puntos</div>
                            {/if}
                        </div>
                        <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                            <div class="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase">
                                <span>⬇️</span> Bajaron
                            </div>
                            <div class="text-white font-black text-lg">{summary.downCount}</div>
                            {#if summary.downWithLossCount > 0}
                                <div class="text-red-300 text-xs">
                                    {summary.downWithLossCount} perdieron ({summary.totalDownPts} pts)
                                </div>
                            {/if}
                            {#if summary.downNoLossCount > 0}
                                <div class="text-gray-400 text-xs">{summary.downNoLossCount} sin cambio de puntos</div>
                            {/if}
                        </div>
                        <div class="bg-white/5 border border-white/10 rounded-lg p-2.5">
                            <div class="flex items-center gap-1.5 text-gray-300 font-bold text-xs uppercase">
                                <span>=</span> Mantuvieron
                            </div>
                            <div class="text-white font-black text-lg">{summary.sameCount}</div>
                        </div>
                        <div class="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2.5">
                            <div class="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase">
                                <span>🆕</span> Nuevos
                            </div>
                            <div class="text-white font-black text-lg">{summary.freshCount}</div>
                        </div>
                    </div>
                </div>
            {/if}

            {#if hasSnapshots}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <h3 class="text-gray-300 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                        <span>🔀</span> Comparación de ranking
                    </h3>
                    <div class="grid grid-cols-2 gap-2 mb-2 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                        <div class="text-center">
                            Snapshot A
                            <div class="text-gray-500 normal-case font-normal">{dayBeforeYesterday ? formatDateShort(dayBeforeYesterday) : '—'}</div>
                        </div>
                        <div class="text-center">
                            Snapshot B (actual)
                            <div class="text-cyan-400 normal-case font-normal">{yesterday ? formatDateShort(yesterday) : '—'}</div>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        {#each Array.from({ length: Math.max(snapshotA.length, snapshotB.length) }, (_, i) => i) as i}
                            {@const a = snapshotA[i]}
                            {@const b = snapshotB[i]}
                            {@const m = b ? movementByParticipant.get(b.participant) : null}
                            {@const kind = m?.kind ?? null}
                            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center bg-black/20 rounded-lg p-2 text-xs">
                                <!-- Snapshot A -->
                                <div class="text-right min-w-0">
                                    {#if a}
                                        <div class="text-gray-300 font-semibold truncate">{a.participant}</div>
                                        <div class="text-gray-500 text-[10px]">{a.points} pts</div>
                                    {:else}
                                        <div class="text-gray-600 italic text-[10px]">—</div>
                                    {/if}
                                </div>
                                <!-- Arrow + rank change -->
                                <div class="text-center shrink-0 min-w-[3rem]">
                                    {#if a && b}
                                        {#if kind === 'up'}
                                            <div class="text-emerald-400 font-black text-sm">⬆️ {a.rank}°</div>
                                            <div class="text-[10px] text-emerald-300/70">+{a.rank - b.rank}</div>
                                        {:else if kind === 'down'}
                                            <div class="text-red-400 font-black text-sm">⬇️ {a.rank}°</div>
                                            <div class="text-[10px] text-red-300/70">-{b.rank - a.rank}</div>
                                        {:else if kind === 'same'}
                                            <div class="text-gray-400 font-bold text-sm">= {a.rank}°</div>
                                        {:else if kind === 'new'}
                                            <div class="text-cyan-400 font-black text-sm">🆕</div>
                                        {/if}
                                    {:else if b}
                                        <div class="text-cyan-400 font-black text-sm">🆕</div>
                                    {:else}
                                        <div class="text-gray-600">—</div>
                                    {/if}
                                </div>
                                <!-- Snapshot B -->
                                <div class="text-left min-w-0">
                                    {#if b}
                                        <div class="text-white font-semibold truncate">{b.participant}</div>
                                        <div class="text-cyan-400 text-[10px] font-bold">{b.points} pts</div>
                                    {:else}
                                        <div class="text-gray-600 italic text-[10px]">—</div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if !hasMovement && !hasLatestResults}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                    <div class="text-5xl mb-3">📭</div>
                    <div class="text-gray-300 font-bold">Sin movimiento para mostrar</div>
                    <p class="text-gray-500 text-sm mt-1">Necesitamos apuestas en partidos finalizados para calcular el cambio de puestos.</p>
                    <div class="mt-4 text-left bg-black/20 rounded-xl p-3 text-xs space-y-1">
                        <div class="text-gray-400">Estado actual:</div>
                        <div>📊 Bets cargados: <span class="text-white font-bold">{bets.length}</span></div>
                        <div>⚽ Partidos finalizados: <span class="text-white font-bold">{matches.filter(m => m.homeScore !== null && m.awayScore !== null).length}</span></div>
                        <div>📅 Última fecha finalizada: <span class="text-white font-bold">{yesterday || '—'}</span></div>
                    </div>
                </div>
            {:else}
                {#if up.length > 0}
                    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                        <h3 class="text-emerald-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>⬆️</span> Subieron ({up.length})
                            {#if summary.upWithPointsCount > 0}
                                <span class="text-xs text-emerald-300/80 font-medium normal-case">
                                    · {summary.upWithPointsCount} con puntos
                                </span>
                            {/if}
                        </h3>
                        <div class="space-y-2">
                            {#each up as m}
                                {@const delta = (m.prevRank || 0) - m.currRank}
                                {@const ptsDelta = m.currPoints - m.prevPoints}
                                {@const phone = getPhone(m.participant)}
                                {@const gainedPts = ptsDelta > 0}
                                <div class="bg-black/20 rounded-lg p-3 border-l-4 {gainedPts ? 'border-emerald-500' : 'border-gray-600'}">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-2">
                                                <div class="text-white font-semibold truncate">{m.participant}</div>
                                                {#if gainedPts}
                                                    <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                                                        con puntos
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if phone}
                                                <div class="text-xs text-gray-500">{phone}</div>
                                            {/if}
                                        </div>
                                        <div class="text-right shrink-0">
                                            <div class="text-emerald-400 font-black text-sm">+{delta} puestos</div>
                                            <div class="text-xs text-gray-400 flex items-center gap-1 justify-end mt-0.5">
                                                <span class="text-gray-500">{m.prevRank}°</span>
                                                <span class="text-emerald-400">➜</span>
                                                <span class="text-white font-bold">{m.currRank}°</span>
                                            </div>
                                        </div>
                                    </div>
                                    {#if ptsDelta !== 0}
                                        <div class="text-xs text-emerald-300/80 mt-1.5 pt-1.5 border-t border-white/5">
                                            {ptsDelta > 0 ? '+' : ''}{ptsDelta} pts · {m.prevPoints} → <span class="text-white font-bold">{m.currPoints}</span>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if down.length > 0}
                    <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                        <h3 class="text-red-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>⬇️</span> Bajaron ({down.length})
                            {#if summary.downWithLossCount > 0}
                                <span class="text-xs text-red-300/80 font-medium normal-case">
                                    · {summary.downWithLossCount} perdieron puntos
                                </span>
                            {/if}
                        </h3>
                        <div class="space-y-2">
                            {#each down as m}
                                {@const delta = m.currRank - (m.prevRank || 0)}
                                {@const ptsDelta = m.currPoints - m.prevPoints}
                                {@const phone = getPhone(m.participant)}
                                {@const lostPts = ptsDelta < 0}
                                <div class="bg-black/20 rounded-lg p-3 border-l-4 {lostPts ? 'border-red-500' : 'border-gray-600'}">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-2">
                                                <div class="text-white font-semibold truncate">{m.participant}</div>
                                                {#if lostPts}
                                                    <span class="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">
                                                        perdió puntos
                                                    </span>
                                                {/if}
                                            </div>
                                            {#if phone}
                                                <div class="text-xs text-gray-500">{phone}</div>
                                            {/if}
                                        </div>
                                        <div class="text-right shrink-0">
                                            <div class="text-red-400 font-black text-sm">-{delta} puestos</div>
                                            <div class="text-xs text-gray-400 flex items-center gap-1 justify-end mt-0.5">
                                                <span class="text-gray-500">{m.prevRank}°</span>
                                                <span class="text-red-400">➜</span>
                                                <span class="text-white font-bold">{m.currRank}°</span>
                                            </div>
                                        </div>
                                    </div>
                                    {#if ptsDelta !== 0}
                                        <div class="text-xs text-red-300/80 mt-1.5 pt-1.5 border-t border-white/5">
                                            {ptsDelta > 0 ? '+' : ''}{ptsDelta} pts · {m.prevPoints} → <span class="text-white font-bold">{m.currPoints}</span>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if same.length > 0}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <h3 class="text-gray-300 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>=</span> Mantuvieron ({same.length})
                        </h3>
                        <div class="space-y-1">
                            {#each same as m}
                                {@const phone = getPhone(m.participant)}
                                <div class="flex items-center justify-between gap-2 bg-black/20 rounded-lg p-2 px-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="text-gray-200 text-sm truncate">{m.participant}</div>
                                        {#if phone}
                                            <div class="text-xs text-gray-500">{phone}</div>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-400 shrink-0">
                                        {m.currRank}°
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                {#if fresh.length > 0}
                    <div class="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4">
                        <h3 class="text-cyan-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>🆕</span> Nuevos ({fresh.length})
                        </h3>
                        <div class="space-y-1">
                            {#each fresh as m}
                                {@const phone = getPhone(m.participant)}
                                <div class="flex items-center justify-between gap-2 bg-black/20 rounded-lg p-2 px-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="text-cyan-100 text-sm truncate">{m.participant}</div>
                                        {#if phone}
                                            <div class="text-xs text-gray-500">{phone}</div>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-cyan-300 shrink-0">
                                        entró en {m.currRank}°
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            {/if}
        </div>

        <div class="p-6 bg-white/5 border-t border-white/10 flex justify-between items-center flex-shrink-0">
            <div class="flex items-center gap-2">
                {#if copyMessage}
                    <span class="text-emerald-400 text-sm font-medium">{copyMessage}</span>
                {/if}
                <button
                    class="px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                    onclick={copyToWhatsApp}
                    disabled={!hasMovement}
                >
                    📋 Copiar
                </button>
            </div>
            <button
                class="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors"
                onclick={onClose}
            >
                Cerrar
            </button>
        </div>
    </div>
</div>
