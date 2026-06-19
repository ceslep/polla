<script>
    import { computeMovement, getLatestFinishedDate, uniqueBets } from '../stores.svelte.js';

    /** @type {{ bets: any[], matches: any[], winners?: Array<{participant: string, points: number, rank: number}>, onClose: () => void }} */
    let { bets = [], matches = [], winners = /** @type {Array<{participant: string, points: number, rank: number}>} */ ([]), onClose } = $props();

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

    /** @returns {Array<{participant: string, points: number, rank: number}>} */
    function calculateWinners() {
        const pointsByParticipant = new Map();
        for (const bet of uniqueBets()) {
            if (bet.status === 'pending') continue;
            const current = pointsByParticipant.get(bet.participant) || 0;
            pointsByParticipant.set(bet.participant, current + (Number(bet.points) || 0));
        }
        const sorted = [...pointsByParticipant.entries()]
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);
        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }

    const computedWinners = $derived(winners.length > 0 ? winners : calculateWinners());
    const movement = $derived(computeMovement(bets, matches, computedWinners));
    const yesterday = $derived(getLatestFinishedDate(matches));

    const up = $derived(movement.filter(m => m.kind === 'up'));
    const down = $derived(movement.filter(m => m.kind === 'down'));
    const same = $derived(movement.filter(m => m.kind === 'same'));
    const fresh = $derived(movement.filter(m => m.kind === 'new'));

    const hasMovement = $derived(movement.length > 0);

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            <div>
                <h2 class="text-xl font-bold text-cyan-400">📊 Movimiento de puestos</h2>
                <p class="text-xs text-gray-400 mt-1">
                    {#if yesterday}
                        Corte: <span class="text-gray-300">{formatDateShort(yesterday)}</span>
                    {:else}
                        Sin partidos finalizados
                    {/if}
                </p>
            </div>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-6 space-y-5 overflow-y-auto flex-1">
            {#if !hasMovement}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                    <div class="text-5xl mb-3">📭</div>
                    <div class="text-gray-300 font-bold">Sin movimiento para mostrar</div>
                    <p class="text-gray-500 text-sm mt-1">Necesitamos partidos finalizados para calcular el cambio de puestos.</p>
                </div>
            {:else}
                {#if up.length > 0}
                    <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                        <h3 class="text-emerald-400 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                            <span>⬆️</span> Subieron ({up.length})
                        </h3>
                        <div class="space-y-2">
                            {#each up as m}
                                {@const delta = (m.prevRank || 0) - m.currRank}
                                {@const ptsDelta = m.currPoints - m.prevPoints}
                                {@const phone = getPhone(m.participant)}
                                <div class="bg-black/20 rounded-lg p-3">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <div class="text-white font-semibold truncate">{m.participant}</div>
                                            {#if phone}
                                                <div class="text-xs text-gray-500">{phone}</div>
                                            {/if}
                                        </div>
                                        <div class="text-right shrink-0">
                                            <div class="text-emerald-400 font-black text-sm">+{delta}</div>
                                            <div class="text-xs text-gray-400">
                                                {m.prevRank}° → <span class="text-white font-bold">{m.currRank}°</span>
                                            </div>
                                        </div>
                                    </div>
                                    {#if ptsDelta !== 0}
                                        <div class="text-xs text-emerald-300/80 mt-1">
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
                        </h3>
                        <div class="space-y-2">
                            {#each down as m}
                                {@const delta = m.currRank - (m.prevRank || 0)}
                                {@const ptsDelta = m.currPoints - m.prevPoints}
                                {@const phone = getPhone(m.participant)}
                                <div class="bg-black/20 rounded-lg p-3">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="min-w-0 flex-1">
                                            <div class="text-white font-semibold truncate">{m.participant}</div>
                                            {#if phone}
                                                <div class="text-xs text-gray-500">{phone}</div>
                                            {/if}
                                        </div>
                                        <div class="text-right shrink-0">
                                            <div class="text-red-400 font-black text-sm">-{delta}</div>
                                            <div class="text-xs text-gray-400">
                                                {m.prevRank}° → <span class="text-white font-bold">{m.currRank}°</span>
                                            </div>
                                        </div>
                                    </div>
                                    {#if ptsDelta !== 0}
                                        <div class="text-xs text-red-300/80 mt-1">
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
