<script>
    import { getFlagData } from '../../flags.js';

    /** @type {{ match: any, onClose: () => void }} */
    let { match, onClose } = $props();

    const team1 = $derived(match?.team1 || '');
    const team2 = $derived(match?.team2 || '');

    /**
     * @param {string} teamName
     */
    function isTbd(teamName) {
        if (!teamName) return true;
        return teamName.startsWith('W') || teamName.startsWith('L') || !!teamName.match(/^\d[A-Z]$/);
    }

    const homeFlag = $derived(getFlagData(team1));
    const awayFlag = $derived(getFlagData(team2));

    const isFinished = $derived(!!match?.score?.ft);
    const finalScore = $derived(match?.score?.ft || [null, null]);
    const halfScore = $derived(match?.score?.ht || null);

    const goals1 = $derived(match?.goals1 || []);
    const goals2 = $derived(match?.goals2 || []);

    const round = $derived(match?.round || '');
    const group = $derived(match?.group || '');
    const ground = $derived(match?.ground || '');
    const time = $derived(match?.time || '');
    const date = $derived(match?.date || '');

    const status = $derived.by(() => {
        if (isFinished) return { label: 'Final', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
        if (isTbd(team1) || isTbd(team2)) return { label: 'Por Definir', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' };
        return { label: 'Pendiente', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' };
    });

    /**
     * @param {string} teamName
     */
    function teamDisplay(teamName) {
        if (!teamName) return '?';
        if (isTbd(teamName)) {
            if (teamName.startsWith('W') || teamName.startsWith('L')) return teamName;
            if (teamName.match(/^\d[A-Z]$/)) {
                const num = teamName[0];
                const letter = teamName[1];
                const pos = num === '1' ? '1°' : '2°';
                return `${pos} Grupo ${letter}`;
            }
        }
        return teamName;
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <div
        class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-slide-up"
    >
        <!-- Header -->
        <div class="p-5 md:p-6 border-b border-white/10 flex-shrink-0">
            <div class="flex items-start justify-between gap-3 mb-4">
                <button
                    class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white transition-all shrink-0"
                    onclick={onClose}
                    aria-label="Cerrar"
                >←</button>
                <div class="flex-1 min-w-0 text-center">
                    <div class="flex items-center justify-center gap-3 mb-2">
                        {#if homeFlag && !isTbd(team1)}
                            <img src={homeFlag.flag} alt="" class="h-6 w-9 rounded ring-1 ring-white/20" />
                        {:else}
                            <div class="h-6 w-9 rounded bg-white/10 flex items-center justify-center text-xs text-gray-400">?</div>
                        {/if}
                        <span class="font-bold text-sm md:text-base truncate">{homeFlag?.spanishName || teamDisplay(team1)}</span>
                    </div>
                    {#if isFinished}
                        <div class="text-4xl font-black text-emerald-400 my-1">
                            {finalScore[0]} <span class="text-gray-500">-</span> {finalScore[1]}
                        </div>
                    {:else if isTbd(team1) || isTbd(team2)}
                        <div class="text-2xl text-gray-500 my-1">vs</div>
                    {:else}
                        <div class="text-2xl text-gray-500 my-1">vs</div>
                    {/if}
                    <div class="flex items-center justify-center gap-3">
                        <span class="font-bold text-sm md:text-base truncate">{awayFlag?.spanishName || teamDisplay(team2)}</span>
                        {#if awayFlag && !isTbd(team2)}
                            <img src={awayFlag.flag} alt="" class="h-6 w-9 rounded ring-1 ring-white/20" />
                        {:else}
                            <div class="h-6 w-9 rounded bg-white/10 flex items-center justify-center text-xs text-gray-400">?</div>
                        {/if}
                    </div>
                </div>
                <button
                    class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
                    onclick={onClose}
                    aria-label="Cerrar"
                >×</button>
            </div>

            <div class="flex items-center justify-center gap-2 flex-wrap">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border {status.color}">
                    {status.label}
                </span>
                {#if round}
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                        {round}
                    </span>
                {/if}
                {#if group}
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/10 text-gray-300">
                        {group}
                    </span>
                {/if}
            </div>
        </div>

        <!-- Body scrollable -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <!-- Info: estadio + hora + fecha -->
            <section class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {#if date}
                    <div class="glass rounded-2xl p-3 text-center">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Fecha</div>
                        <div class="font-bold text-sm">{date}</div>
                    </div>
                {/if}
                {#if time}
                    <div class="glass rounded-2xl p-3 text-center">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Hora</div>
                        <div class="font-bold text-sm">⏰ {time}</div>
                    </div>
                {/if}
                {#if ground}
                    <div class="glass rounded-2xl p-3 text-center">
                        <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Estadio</div>
                        <div class="font-bold text-sm">🏟️ {ground}</div>
                    </div>
                {/if}
            </section>

            <!-- Half-time score -->
            {#if isFinished && halfScore}
                <section class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center">
                    <div class="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Medio tiempo</div>
                    <div class="text-2xl font-black text-amber-300">
                        {halfScore[0]} <span class="text-gray-500">-</span> {halfScore[1]}
                    </div>
                </section>
            {/if}

            <!-- Goles -->
            {#if isFinished && (goals1.length > 0 || goals2.length > 0)}
                <section>
                    <h3 class="text-gray-300 font-bold text-sm uppercase mb-3 flex items-center gap-2">
                        <span>⚽</span> Goles
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <!-- Goles equipo 1 -->
                        <div class="glass rounded-2xl p-3">
                            <div class="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                {#if homeFlag}
                                    <img src={homeFlag.flag} alt="" class="h-4 w-6 rounded ring-1 ring-white/10" />
                                {/if}
                                <span class="truncate">{homeFlag?.spanishName || team1}</span>
                                <span class="ml-auto text-cyan-400 font-bold">{goals1.length}</span>
                            </div>
                            {#if goals1.length === 0}
                                <div class="text-gray-500 text-xs italic">Sin goles</div>
                            {:else}
                                <div class="space-y-1.5">
                                    {#each goals1 as goal, idx}
                                        <div class="flex items-center gap-2 text-sm">
                                            <span class="bg-cyan-500/20 text-cyan-400 font-mono text-xs px-1.5 py-0.5 rounded shrink-0">
                                                {goal.minute}'
                                            </span>
                                            <span class="truncate">{goal.name}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <!-- Goles equipo 2 -->
                        <div class="glass rounded-2xl p-3">
                            <div class="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                {#if awayFlag}
                                    <img src={awayFlag.flag} alt="" class="h-4 w-6 rounded ring-1 ring-white/10" />
                                {/if}
                                <span class="truncate">{awayFlag?.spanishName || team2}</span>
                                <span class="ml-auto text-cyan-400 font-bold">{goals2.length}</span>
                            </div>
                            {#if goals2.length === 0}
                                <div class="text-gray-500 text-xs italic">Sin goles</div>
                            {:else}
                                <div class="space-y-1.5">
                                    {#each goals2 as goal, idx}
                                        <div class="flex items-center gap-2 text-sm">
                                            <span class="bg-cyan-500/20 text-cyan-400 font-mono text-xs px-1.5 py-0.5 rounded shrink-0">
                                                {goal.minute}'
                                            </span>
                                            <span class="truncate">{goal.name}</span>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </section>
            {:else if isFinished}
                <section class="bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-gray-400">
                    <div class="text-2xl mb-1">⚽</div>
                    <div class="text-sm">Sin goles registrados</div>
                </section>
            {:else if isTbd(team1) || isTbd(team2)}
                <section class="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-center text-yellow-200">
                    <div class="text-2xl mb-1">⏳</div>
                    <div class="text-sm">Equipos por definir (fase eliminatoria)</div>
                </section>
            {:else}
                <section class="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 text-center text-orange-200">
                    <div class="text-2xl mb-1">⏰</div>
                    <div class="text-sm">Partido pendiente — aún no se ha jugado</div>
                </section>
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
