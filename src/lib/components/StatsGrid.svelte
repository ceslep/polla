<script>
    import { stats } from '../stores.svelte.js';

    let { onPendingClick = () => {} } = $props();

    const currentStats = $derived(stats());
</script>

<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
    <div class="bg-white/10 p-4 rounded-xl text-center">
        <div class="text-3xl font-bold text-cyan-400">{currentStats.total}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Total</div>
    </div>
    <button onclick={onPendingClick} class="bg-white/10 p-4 rounded-xl text-center hover:bg-white/20 transition-colors cursor-pointer">
        <div class="text-3xl font-bold text-orange-400">{currentStats.pending}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Pendientes</div>
    </button>
    <div class="bg-white/10 p-4 rounded-xl text-center">
        <div class="text-3xl font-bold text-emerald-400">{currentStats.exact + currentStats.correct}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Aciertos</div>
    </div>
    <div class="bg-white/10 p-4 rounded-xl text-center">
        <div class="text-3xl font-bold text-red-400">{currentStats.incorrect}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Erradas</div>
    </div>
    <div class="bg-white/10 p-4 rounded-xl text-center">
        <div class="text-3xl font-bold text-blue-400">{currentStats.exact}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Exactas</div>
    </div>
    <div class="bg-white/10 p-4 rounded-xl text-center border border-yellow-500/30 bg-yellow-500/5">
        <div class="text-3xl font-bold text-yellow-400">{currentStats.points}</div>
        <div class="text-xs text-gray-400 uppercase tracking-wider">Puntos</div>
    </div>
</div>
