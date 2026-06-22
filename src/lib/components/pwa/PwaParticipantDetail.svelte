<script>
    import { getFlagData } from '../../flags.js';

    /** @type {{ participant: string, bets: any[], onClose: () => void }} */
    let { participant, bets = [], onClose } = $props();

    /** Filtro activo: 'all' | 'exact' | 'correct' | 'incorrect' */
    let activeFilter = $state(/** @type {'all' | 'exact' | 'correct' | 'incorrect'} */ ('all'));

    /** Bets del participante. */
    const participantBets = $derived(
        bets
            .filter((/** @type {any} */ b) => b.participant === participant)
            .slice()
            .sort((/** @type {any} */ a, /** @type {any} */ b) => {
                // Más actual → más antiguo. Bets pending (sin matchDate) al final.
                const da = a.matchDate || '';
                const db = b.matchDate || '';
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return db.localeCompare(da);
            })
    );

    /** Resumen por status. */
    const summary = $derived.by(() => {
        let exact = 0, correct = 0, incorrect = 0, totalPts = 0;
        for (const b of participantBets) {
            totalPts += Number(b.points) || 0;
            if (b.status === 'exact') exact++;
            else if (b.status === 'correct') correct++;
            else if (b.status === 'incorrect') incorrect++;
        }
        return { exact, correct, incorrect, total: participantBets.length, totalPts };
    });

    /** Bets visibles según filtro activo. */
    const visibleBets = $derived(
        activeFilter === 'all'
            ? participantBets
            : participantBets.filter((/** @type {any} */ b) => b.status === activeFilter)
    );

    /** Bets agrupadas por status (para vista "Todos"). */
    const groupedByStatus = $derived.by(() => {
        /** @type {{ exact: any[], correct: any[], incorrect: any[] }} */
        const g = { exact: [], correct: [], incorrect: [] };
        for (const b of participantBets) {
            if (b.status === 'exact') g.exact.push(b);
            else if (b.status === 'correct') g.correct.push(b);
            else if (b.status === 'incorrect') g.incorrect.push(b);
        }
        return g;
    });

    /**
     * Formatea YYYY-MM-DD a DD/MM.
     * @param {string} dateStr
     */
    function formatDateShort(dateStr) {
        if (!dateStr) return '—';
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return dateStr;
        return `${m[3]}/${m[2]}`;
    }

    /**
     * @param {string} team
     */
    function flagFor(team) {
        return getFlagData(team);
    }

    /**
     * @param {Event} e
     */
    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) onClose();
    }

    /**
     * @param {KeyboardEvent} e
     */
    function handleKeydown(e) {
        if (e.key === 'Escape') onClose();
    }

    /** @type {Array<{key: 'all'|'exact'|'correct'|'incorrect', label: string, count: number, color: string}>} */
    const filters = $derived([
        { key: 'all',       label: 'Todos',     count: summary.total,     color: 'text-white' },
        { key: 'exact',     label: '✓ Exacto',  count: summary.exact,     color: 'text-emerald-400' },
        { key: 'correct',   label: '~ Acierto', count: summary.correct,   color: 'text-amber-400' },
        { key: 'incorrect', label: '✗ Fallo',   count: summary.incorrect, color: 'text-red-400' }
    ]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-slide-up"
    >
        <!-- Header -->
        <div class="p-5 md:p-6 border-b border-white/10 flex-shrink-0">
            <div class="flex items-start justify-between gap-3 mb-3">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <button
                            class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white transition-all shrink-0"
                            onclick={onClose}
                            aria-label="Cerrar"
                        >←</button>
                        <h2 class="text-xl md:text-2xl font-black text-cyan-400 truncate">{participant}</h2>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-400 ml-11">
                        <span class="text-2xl font-black text-white">{summary.totalPts} <span class="text-[10px] text-gray-500 uppercase">pts</span></span>
                        <span class="text-gray-600">·</span>
                        <span>{summary.total} apuesta{summary.total !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <button
                    class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
                    onclick={onClose}
                    aria-label="Cerrar"
                >×</button>
            </div>

            <!-- Filtros -->
            <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {#each filters as f}
                    <button
                        class="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0
                            {activeFilter === f.key
                                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                                : 'glass text-gray-300 hover:bg-white/10'}"
                        onclick={() => activeFilter = f.key}
                    >
                        <span class={activeFilter === f.key ? '' : f.color}>{f.label}</span>
                        <span class="opacity-70 ml-1">({f.count})</span>
                    </button>
                {/each}
            </div>
        </div>

        <!-- Body scrollable -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {#if participantBets.length === 0}
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">📭</div>
                    <p>Sin apuestas para este participante.</p>
                </div>
            {:else if activeFilter === 'all'}
                <!-- Vista agrupada por status -->
                {#if groupedByStatus.exact.length > 0}
                    <section>
                        <h3 class="text-emerald-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                            <span>✓</span> Exacto <span class="text-emerald-300/60">({groupedByStatus.exact.length} · 5 pts c/u)</span>
                        </h3>
                        <div class="space-y-2">
                            {#each groupedByStatus.exact as b (b.id)}
                                {@const hf = flagFor(b.prediction?.homeTeam || b.homeTeam || '')}
                                {@const af = flagFor(b.prediction?.awayTeam || b.awayTeam || '')}
                                <div class="glass border-emerald-500/20 rounded-2xl p-3">
                                    <div class="flex items-center gap-2 text-sm">
                                        <span class="text-[10px] text-gray-500 font-mono shrink-0">{formatDateShort(b.matchDate)}</span>
                                        {#if hf}<img src={hf.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="font-semibold truncate flex-1 min-w-0">{hf?.spanishName || b.prediction?.homeTeam || b.homeTeam || '?'}</span>
                                        <span class="text-emerald-400 font-black">{b.prediction?.homeScore ?? b.homeScore}</span>
                                        <span class="text-gray-600">-</span>
                                        <span class="text-emerald-400 font-black">{b.prediction?.awayScore ?? b.awayScore}</span>
                                        <span class="font-semibold truncate flex-1 min-w-0 text-right">{af?.spanishName || b.prediction?.awayTeam || b.awayTeam || '?'}</span>
                                        {#if af}<img src={af.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="text-emerald-400 font-bold text-xs shrink-0">+5</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
                {#if groupedByStatus.correct.length > 0}
                    <section>
                        <h3 class="text-amber-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                            <span>~</span> Acierto <span class="text-amber-300/60">({groupedByStatus.correct.length} · 3 pts c/u)</span>
                        </h3>
                        <div class="space-y-2">
                            {#each groupedByStatus.correct as b (b.id)}
                                {@const hf = flagFor(b.prediction?.homeTeam || b.homeTeam || '')}
                                {@const af = flagFor(b.prediction?.awayTeam || b.awayTeam || '')}
                                {@const realH = b.realResult?.match(/\d+/)?.[0] || '?'}
                                {@const realA = b.realResult?.match(/\d+/g)?.[1] || '?'}
                                <div class="glass border-amber-500/20 rounded-2xl p-3">
                                    <div class="flex items-center gap-2 text-sm">
                                        <span class="text-[10px] text-gray-500 font-mono shrink-0">{formatDateShort(b.matchDate)}</span>
                                        {#if hf}<img src={hf.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="font-semibold truncate flex-1 min-w-0">{hf?.spanishName || b.prediction?.homeTeam || b.homeTeam || '?'}</span>
                                        <span class="text-amber-400 font-black">{b.prediction?.homeScore ?? b.homeScore}</span>
                                        <span class="text-gray-600">-</span>
                                        <span class="text-amber-400 font-black">{b.prediction?.awayScore ?? b.awayScore}</span>
                                        <span class="font-semibold truncate flex-1 min-w-0 text-right">{af?.spanishName || b.prediction?.awayTeam || b.awayTeam || '?'}</span>
                                        {#if af}<img src={af.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="text-amber-400 font-bold text-xs shrink-0">+3</span>
                                    </div>
                                    <div class="text-[10px] text-gray-500 mt-1 ml-0">
                                        Real: {realH} - {realA}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
                {#if groupedByStatus.incorrect.length > 0}
                    <section>
                        <h3 class="text-red-400 font-bold text-sm uppercase mb-2 flex items-center gap-2">
                            <span>✗</span> Fallo <span class="text-red-300/60">({groupedByStatus.incorrect.length})</span>
                        </h3>
                        <div class="space-y-2">
                            {#each groupedByStatus.incorrect as b (b.id)}
                                {@const hf = flagFor(b.prediction?.homeTeam || b.homeTeam || '')}
                                {@const af = flagFor(b.prediction?.awayTeam || b.awayTeam || '')}
                                {@const realH = b.realResult?.match(/\d+/)?.[0] || '?'}
                                {@const realA = b.realResult?.match(/\d+/g)?.[1] || '?'}
                                <div class="glass border-red-500/20 rounded-2xl p-3">
                                    <div class="flex items-center gap-2 text-sm">
                                        <span class="text-[10px] text-gray-500 font-mono shrink-0">{formatDateShort(b.matchDate)}</span>
                                        {#if hf}<img src={hf.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="font-semibold truncate flex-1 min-w-0">{hf?.spanishName || b.prediction?.homeTeam || b.homeTeam || '?'}</span>
                                        <span class="text-red-400 font-black line-through opacity-70">{b.prediction?.homeScore ?? b.homeScore}</span>
                                        <span class="text-gray-600">-</span>
                                        <span class="text-red-400 font-black line-through opacity-70">{b.prediction?.awayScore ?? b.awayScore}</span>
                                        <span class="font-semibold truncate flex-1 min-w-0 text-right">{af?.spanishName || b.prediction?.awayTeam || b.awayTeam || '?'}</span>
                                        {#if af}<img src={af.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                        <span class="text-red-400 font-bold text-xs shrink-0">0</span>
                                    </div>
                                    <div class="text-[10px] text-gray-500 mt-1 ml-0">
                                        Real: {realH} - {realA}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
            {:else}
                <!-- Vista filtrada -->
                <div class="space-y-2">
                    {#each visibleBets as b (b.id)}
                        {@const hf = flagFor(b.prediction?.homeTeam || b.homeTeam || '')}
                        {@const af = flagFor(b.prediction?.awayTeam || b.awayTeam || '')}
                        {@const realH = b.realResult?.match(/\d+/)?.[0] || '?'}
                        {@const realA = b.realResult?.match(/\d+/g)?.[1] || '?'}
                        {@const pts = b.status === 'exact' ? 5 : b.status === 'correct' ? 3 : 0}
                        {@const ptsColor = b.status === 'exact' ? 'text-emerald-400' : b.status === 'correct' ? 'text-amber-400' : 'text-red-400'}
                        {@const borderColor = b.status === 'exact' ? 'border-emerald-500/20' : b.status === 'correct' ? 'border-amber-500/20' : 'border-red-500/20'}
                        <div class="glass {borderColor} rounded-2xl p-3">
                            <div class="flex items-center gap-2 text-sm">
                                <span class="text-[10px] text-gray-500 font-mono shrink-0">{formatDateShort(b.matchDate)}</span>
                                {#if hf}<img src={hf.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="font-semibold truncate flex-1 min-w-0">{hf?.spanishName || b.prediction?.homeTeam || b.homeTeam || '?'}</span>
                                <span class="{ptsColor} font-black">{b.prediction?.homeScore ?? b.homeScore}</span>
                                <span class="text-gray-600">-</span>
                                <span class="{ptsColor} font-black">{b.prediction?.awayScore ?? b.awayScore}</span>
                                <span class="font-semibold truncate flex-1 min-w-0 text-right">{af?.spanishName || b.prediction?.awayTeam || b.awayTeam || '?'}</span>
                                {#if af}<img src={af.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="{ptsColor} font-bold text-xs shrink-0">+{pts}</span>
                            </div>
                            <div class="text-[10px] text-gray-500 mt-1">
                                Real: {realH} - {realA}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-white/10 flex-shrink-0 bg-black/20">
            <button
                class="w-full py-3 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all"
                onclick={onClose}
            >
                Cerrar
            </button>
        </div>
    </div>
</div>
