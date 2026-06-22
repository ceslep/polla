<script>
    import { appState, uniqueBets, MIN_POINTS_THRESHOLD } from '../stores.svelte.js';

    let { onClose = () => {} } = $props();

    const participantStats = $derived(() => {
        const map = new Map();
        for (const bet of uniqueBets()) {
            if (!map.has(bet.participant)) {
                map.set(bet.participant, {
                    phone: bet.phone,
                    name: bet.participant,
                    points: 0,
                    exact: 0,
                    correct: 0,
                    incorrect: 0,
                    pending: 0,
                    total: 0
                });
            }
            const p = map.get(bet.participant);
            p.total++;
            p.points += Number(bet.points) || 0;
            if (bet.status === 'exact') p.exact++;
            else if (bet.status === 'correct') p.correct++;
            else if (bet.status === 'incorrect') p.incorrect++;
            else if (bet.status === 'pending') p.pending++;
        }
        return [...map.values()]
            .filter(p => p.points >= MIN_POINTS_THRESHOLD)
            .sort((a, b) => b.points - a.points);
    });

    /** @param {number} index */
    function getPosition(index) {
        if (index === 0) return '1ro';
        if (index === 1) return '2do';
        if (index === 2) return '3ro';
        return `${index + 1}to`;
    }
</script>

<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" role="dialog" tabindex="-1" onclick={() => onClose()} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden overflow-x-hidden" role="document" onclick={(e) => e.stopPropagation()}>
        <div class="p-4 border-b border-white/10 flex justify-between items-center">
            <div class="flex items-center gap-3">
                <button
                    onclick={() => { window.location.hash = '/'; onClose(); }}
                    class="text-gray-400 hover:text-white text-lg cursor-pointer"
                    title="Volver al inicio"
                >
                    🏠
                </button>
                <h2 class="text-xl font-bold text-yellow-400">🏆 Ranking de Participantes</h2>
            </div>
            <button onclick={() => onClose()} class="text-gray-400 hover:text-white text-2xl cursor-pointer">&times;</button>
        </div>
        <div class="p-4 overflow-y-auto max-h-[75vh] overflow-x-hidden">
            <!-- Mobile Card View -->
            <div class="block md:hidden space-y-3 overflow-x-hidden">
                {#each participantStats() as p, i}
                    <button
                        class="w-full text-left bg-white/5 hover:bg-white/10 rounded-2xl p-4 border border-white/10 transition-colors {i === 0 ? 'border-yellow-500/30 bg-yellow-500/5' : i === 1 ? 'border-gray-400/20' : i === 2 ? 'border-orange-400/20' : ''}"
                        onclick={() => window.location.hash = `/participant/${encodeURIComponent(p.name)}`}
                    >
                        <div class="flex items-center justify-between mb-2">
                            {#if i === 0}
                                <img src={`${import.meta.env.BASE_URL}m1.png`} alt="1° lugar" class="w-12 h-12 object-contain drop-shadow-md" />
                            {:else if i === 1}
                                <img src={`${import.meta.env.BASE_URL}m2.png`} alt="2° lugar" class="w-10 h-10 object-contain drop-shadow-md" />
                            {:else if i === 2}
                                <img src={`${import.meta.env.BASE_URL}m3.png`} alt="3° lugar" class="w-10 h-10 object-contain drop-shadow-md" />
                            {:else}
                                <div class="relative w-10 h-10 shrink-0 flex items-center justify-center">
                                    <img src={`${import.meta.env.BASE_URL}balon.png`} alt="" class="w-full h-full object-contain drop-shadow-md" />
                                    <span class="absolute inset-0 flex items-center justify-center font-black text-yellow-400 text-2xl [-webkit-text-stroke:_0.5px_black]">
                                        {i + 1}
                                    </span>
                                </div>
                            {/if}
                            <span class="text-2xl font-black text-yellow-400">{p.points} pts</span>
                        </div>
                        <div class="text-white font-semibold text-base mb-2">{p.name}</div>
                        <div class="flex items-center gap-4 text-xs">
                            <span class="text-cyan-400">⭐ {p.exact}</span>
                            <span class="text-emerald-400">✓ {p.correct}</span>
                            <span class="text-red-400">✗ {p.incorrect}</span>
                            <span class="text-orange-400">⏳ {p.pending}</span>
                        </div>
                    </button>
                {/each}
            </div>

            <!-- Desktop Table View -->
            <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-sm min-w-[500px]">
                    <thead class="text-left text-gray-400 border-b border-white/10">
                        <tr>
                            <th class="pb-3 pr-2 md:pr-4">#</th>
                            <th class="pb-3 pr-4">Participante</th>
                            <th class="pb-3 pr-2 md:pr-4 text-center">Pts</th>
                            <th class="pb-3 pr-2 md:pr-4 text-center hidden sm:table-cell">Exactas</th>
                            <th class="pb-3 pr-2 md:pr-4 text-center hidden sm:table-cell">Aciertos</th>
                            <th class="pb-3 pr-2 md:pr-4 text-center hidden sm:table-cell">Erradas</th>
                            <th class="pb-3 pr-2 md:pr-4 text-center hidden md:table-cell">Pendientes</th>
                            <th class="pb-3 text-center hidden md:table-cell">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each participantStats() as p, i}
                            <tr
                                class="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                                onclick={() => window.location.hash = `/participant/${encodeURIComponent(p.name)}`}
                            >
                                <td class="py-2 md:py-3 pr-2 md:pr-4">
                                    {#if i === 0}
                                        <img src={`${import.meta.env.BASE_URL}m1.png`} alt="1° lugar" class="w-10 h-10 object-contain drop-shadow-md" />
                                    {:else if i === 1}
                                        <img src={`${import.meta.env.BASE_URL}m2.png`} alt="2° lugar" class="w-8 h-8 object-contain drop-shadow-md" />
                                    {:else if i === 2}
                                        <img src={`${import.meta.env.BASE_URL}m3.png`} alt="3° lugar" class="w-8 h-8 object-contain drop-shadow-md" />
                                    {:else}
                                        <div class="relative w-8 h-8 shrink-0 flex items-center justify-center">
                                            <img src={`${import.meta.env.BASE_URL}balon.png`} alt="" class="w-full h-full object-contain drop-shadow-md" />
                                            <span class="absolute inset-0 flex items-center justify-center font-black text-yellow-400 text-lg md:text-xl [-webkit-text-stroke:_0.5px_black]">
                                                {i + 1}
                                            </span>
                                        </div>
                                    {/if}
                                </td>
                                <td class="py-2 md:py-3 pr-4 font-medium text-sm md:text-base">{p.name}</td>
                                <td class="py-2 md:py-3 pr-2 md:pr-4 text-center font-bold text-yellow-400">{p.points}</td>
                                <td class="py-2 md:py-3 pr-2 md:pr-4 text-center text-cyan-400 hidden sm:table-cell">{p.exact}</td>
                                <td class="py-2 md:py-3 pr-2 md:pr-4 text-center text-emerald-400 hidden sm:table-cell">{p.correct}</td>
                                <td class="py-2 md:py-3 pr-2 md:pr-4 text-center text-red-400 hidden sm:table-cell">{p.incorrect}</td>
                                <td class="py-2 md:py-3 pr-2 md:pr-4 text-center text-orange-400 hidden md:table-cell">{p.pending}</td>
                                <td class="py-2 md:py-3 text-center text-gray-400 hidden md:table-cell">{p.total}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
