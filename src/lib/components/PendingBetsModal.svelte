<script>
    import { appState } from '../stores.svelte.js';

    let { onClose = () => {} } = $props();

    const pendingBets = $derived(appState.bets.filter(b => b.status === 'pending'));
</script>

<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick={onClose}>
    <div class="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onclick={(e) => e.stopPropagation()}>
        <div class="p-4 border-b border-white/10 flex justify-between items-center">
            <h2 class="text-xl font-bold text-orange-400">Apuestas Pendientes ({pendingBets.length})</h2>
            <button onclick={onClose} class="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div class="p-4 overflow-y-auto max-h-[60vh]">
            {#if pendingBets.length === 0}
                <p class="text-gray-400 text-center">No hay apuestas pendientes</p>
            {:else}
                <table class="w-full text-sm">
                    <thead class="text-left text-gray-400">
                        <tr>
                            <th class="pb-2">Participante</th>
                            <th class="pb-2">Fecha</th>
                            <th class="pb-2">Apuesta</th>
                            <th class="pb-2">Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each pendingBets as bet}
                            <tr class="border-t border-white/5">
                                <td class="py-2">{bet.participant}</td>
                                <td class="py-2 text-gray-400">{bet.timestamp ? bet.timestamp.split(' ')[0] : '-'}</td>
                                <td class="py-2">{bet.bet_text}</td>
                                <td class="py-2">
                                    <span class="px-2 py-1 rounded text-xs {
                                        bet.type === 'score' ? 'bg-blue-500/20 text-blue-400' :
                                        bet.type === 'champion' ? 'bg-yellow-500/20 text-yellow-400' :
                                        bet.type === 'runnerup' ? 'bg-purple-500/20 text-purple-400' :
                                        'bg-gray-500/20 text-gray-400'
                                    }">
                                        {bet.type}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    </div>
</div>
