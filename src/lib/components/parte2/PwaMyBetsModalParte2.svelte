<script>
    import { getFlagData } from '../../flags.js';

    /**
     * PwaMyBetsModal.svelte
     *
     * Modal que muestra las apuestas del participante autenticado para la
     * fecha de la sesión (pwaSession.date). Es la contraparte "solo lo mío"
     * del step público PwaTodayBets: PwaTodayBets muestra los marcadores
     * reales de los partidos de hoy; este modal muestra las predicciones
     * del usuario actual y cómo van calificadas.
     *
     * Es read-only (las apuestas son inmutables, igual que en PwaDone /
     * PwaHistory). El único botón accionable es "Ir a apostar" en el
     * empty state, y solo aparece si la ventana de apuestas está abierta
     * y el usuario todavía no ha enviado.
     *
     * Props:
     *   - bets: any[]              — pwaScoredBets (todos los participantes)
     *   - phone: string            — phone del participante logueado (filtro)
     *   - todayDate: string        — 'YYYY-MM-DD' en COT
     *   - participantName: string  — nombre para el header
     *   - canGoBet: boolean        — true si la ventana está abierta y no ha enviado
     *   - onClose: () => void
     *   - onGoBet: () => void      — CTA "Ir a apostar" en el empty state
     *   - onRefresh: () => Promise<void>
     */

    /** @type {{
     *   bets?: any[],
     *   phone?: string,
     *   todayDate?: string,
     *   participantName?: string,
     *   canGoBet?: boolean,
     *   onClose: () => void,
     *   onGoBet: () => void,
     *   onRefresh: () => Promise<void>
     * }} */
    let {
        bets = [],
        phone = '',
        todayDate = '',
        participantName = '',
        canGoBet = false,
        onClose,
        onGoBet,
        onRefresh
    } = $props();

    let refreshing = $state(false);

    /**
     * Bets del participante logueado para `todayDate`. Ordenadas por
     * matchId ascendente (orden cronológico de openfootball). Bets sin
     * matchId (caso legacy) van al final.
     */
    const myBets = $derived(
        bets
            .filter((/** @type {any} */ b) => b.phone === phone && b.matchDate === todayDate)
            .slice()
            .sort((/** @type {any} */ a, /** @type {any} */ b) => {
                const am = a.matchId;
                const bm = b.matchId;
                if (am == null && bm == null) return 0;
                if (am == null) return 1;
                if (bm == null) return -1;
                return am - bm;
            })
    );

    /** Resumen por status. */
    const summary = $derived.by(() => {
        let exact = 0, correct = 0, incorrect = 0, pending = 0, totalPts = 0;
        for (const b of myBets) {
            totalPts += Number(b.points) || 0;
            if (b.status === 'exact') exact++;
            else if (b.status === 'correct') correct++;
            else if (b.status === 'incorrect') incorrect++;
            else if (b.status === 'pending') pending++;
        }
        return { exact, correct, incorrect, pending, total: myBets.length, totalPts };
    });

    /** @param {string} team */
    function flagFor(team) {
        return getFlagData(team);
    }

    /** @param {string} dateStr */
    function formatDateShort(dateStr) {
        if (!dateStr) return '—';
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return dateStr;
        return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
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

    async function handleRefresh() {
        if (refreshing) return;
        refreshing = true;
        try {
            await onRefresh();
        } finally {
            refreshing = false;
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-slide-up">
        <!-- Header -->
        <div class="p-5 md:p-6 border-b border-white/10 flex-shrink-0">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <button
                            class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white transition-all shrink-0"
                            onclick={onClose}
                            aria-label="Cerrar"
                        >←</button>
                        <h2 class="text-xl md:text-2xl font-black text-cyan-400 truncate">📋 Mis apuestas</h2>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-gray-400 ml-11 flex-wrap">
                        <span class="font-semibold text-white truncate max-w-[200px]">{participantName || '—'}</span>
                        <span class="text-gray-600">·</span>
                        <span class="font-mono">{formatDateShort(todayDate)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-base transition-all disabled:opacity-50"
                        onclick={handleRefresh}
                        disabled={refreshing}
                        aria-label="Recargar desde Sheets"
                        title="Recargar"
                    >
                        {#if refreshing}
                            <span class="animate-spin inline-block">⟳</span>
                        {:else}
                            🔄
                        {/if}
                    </button>
                    <button
                        class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
                        onclick={onClose}
                        aria-label="Cerrar"
                    >×</button>
                </div>
            </div>
            {#if myBets.length > 0}
                <div class="ml-11 mt-3 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    <span class="text-2xl font-black text-white">{summary.totalPts} <span class="text-[10px] text-gray-500 uppercase">pts</span></span>
                    <span class="text-gray-600">·</span>
                    <span>{summary.total} apuesta{summary.total !== 1 ? 's' : ''}</span>
                    {#if summary.exact > 0}
                        <span class="text-emerald-400">✓ {summary.exact}</span>
                    {/if}
                    {#if summary.correct > 0}
                        <span class="text-amber-400">~ {summary.correct}</span>
                    {/if}
                    {#if summary.incorrect > 0}
                        <span class="text-red-400">✗ {summary.incorrect}</span>
                    {/if}
                    {#if summary.pending > 0}
                        <span class="text-gray-500">⏳ {summary.pending}</span>
                    {/if}
                </div>
                <div class="ml-11 mt-1 text-[10px] text-gray-500 uppercase tracking-wider">
                    Solo lectura · inmutables
                </div>
            {/if}
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {#if bets.length === 0}
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">⏳</div>
                    <p class="text-sm">Cargando datos de apuestas desde la hoja <code class="text-cyan-400 font-mono">apuestas</code>…</p>
                </div>
            {:else if myBets.length === 0}
                <div class="text-center py-10">
                    <div class="text-5xl mb-3">📭</div>
                    <p class="text-gray-300 mb-1">No has enviado apuestas para esta fecha.</p>
                    <p class="text-xs text-gray-500 mb-6">Si la ventana está abierta, puedes hacerlo desde el formulario.</p>
                    {#if canGoBet}
                        <button
                            type="button"
                            class="px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 rounded-2xl text-white font-bold transition-all shadow-lg shadow-emerald-500/30 min-h-12"
                            onclick={() => { onClose(); onGoBet(); }}
                        >
                            ✏️ Ir a apostar
                        </button>
                    {/if}
                </div>
            {:else}
                <div class="space-y-2">
                    {#each myBets as b (b.id)}
                        {@const hf = flagFor(b.prediction?.homeTeam || b.homeTeam || '')}
                        {@const af = flagFor(b.prediction?.awayTeam || b.awayTeam || '')}
                        {@const realH = b.realResult?.match(/\d+/)?.[0] ?? null}
                        {@const realA = b.realResult?.match(/\d+/g)?.[1] ?? null}
                        {@const statusColor = b.status === 'exact' ? 'border-emerald-500/30 bg-emerald-500/5' :
                            b.status === 'correct' ? 'border-amber-500/30 bg-amber-500/5' :
                            b.status === 'incorrect' ? 'border-red-500/30 bg-red-500/5' :
                            'border-white/10 bg-white/[0.03]'}
                        {@const scoreColor = b.status === 'exact' ? 'text-emerald-400' :
                            b.status === 'correct' ? 'text-amber-400' :
                            b.status === 'incorrect' ? 'text-red-400' :
                            'text-gray-300'}
                        {@const badgeText = b.status === 'exact' ? '✓ Exacto +5' :
                            b.status === 'correct' ? '~ Acierto +3' :
                            b.status === 'incorrect' ? '✗ Fallo' :
                            '⏳ Pendiente'}
                        {@const badgeColor = b.status === 'exact' ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' :
                            b.status === 'correct' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' :
                            b.status === 'incorrect' ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40' :
                            'bg-white/10 text-gray-300 ring-1 ring-white/20'}
                        <div class="border {statusColor} rounded-2xl p-3">
                            <div class="flex items-center gap-2 text-sm">
                                {#if b.matchId}
                                    <span class="text-[10px] text-gray-500 font-mono shrink-0">#{b.matchId}</span>
                                {/if}
                                {#if hf}<img src={hf.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="font-semibold truncate flex-1 min-w-0">{hf?.spanishName || b.prediction?.homeTeam || b.homeTeam || '?'}</span>
                                <span class="{scoreColor} font-black">{b.prediction?.homeScore ?? b.homeScore}</span>
                                <span class="text-gray-600">-</span>
                                <span class="{scoreColor} font-black">{b.prediction?.awayScore ?? b.awayScore}</span>
                                <span class="font-semibold truncate flex-1 min-w-0 text-right">{af?.spanishName || b.prediction?.awayTeam || b.awayTeam || '?'}</span>
                                {#if af}<img src={af.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                            </div>
                            <div class="flex items-center justify-between gap-2 mt-2">
                                <div class="text-[10px] text-gray-500">
                                    {#if realH != null && realA != null}
                                        Real: {realH} - {realA}
                                    {:else if b.status === 'pending'}
                                        Resultado aún no disponible
                                    {:else}
                                        —
                                    {/if}
                                </div>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap {badgeColor}">
                                    {badgeText}
                                </span>
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
