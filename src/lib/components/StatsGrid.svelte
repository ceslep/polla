<script>
    import { stats } from '../stores.svelte.js';

    /** @type {{onPendingClick?: () => void, onRankingClick?: () => void}} */
    let { onPendingClick = () => {}, onRankingClick = () => {} } = $props();

    const currentStats = $derived(stats());
</script>

<div class="mb-6 md:mb-8">
    <div class="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
        <div class="bg-white/10 p-2 md:p-4 rounded-xl text-center">
            <div class="text-2xl md:text-3xl font-bold text-cyan-400">{currentStats.total}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Total</div>
        </div>
        <button onclick={onPendingClick} class="bg-white/10 p-2 md:p-4 rounded-xl text-center hover:bg-white/20 transition-colors cursor-pointer min-h-[60px] md:min-h-0">
            <div class="text-2xl md:text-3xl font-bold text-orange-400">{currentStats.pending}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Pendientes</div>
        </button>
        <div class="bg-white/10 p-2 md:p-4 rounded-xl text-center">
            <div class="text-2xl md:text-3xl font-bold text-emerald-400">{currentStats.exact + currentStats.correct}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Aciertos</div>
        </div>
        <div class="bg-white/10 p-2 md:p-4 rounded-xl text-center">
            <div class="text-2xl md:text-3xl font-bold text-red-400">{currentStats.incorrect}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Erradas</div>
        </div>
        <div class="bg-white/10 p-2 md:p-4 rounded-xl text-center">
            <div class="text-2xl md:text-3xl font-bold text-blue-400">{currentStats.exact}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Exactas</div>
        </div>
        <a href="#/ranking" class="bg-white/10 p-2 md:p-4 rounded-xl text-center hover:bg-white/20 transition-colors cursor-pointer border border-yellow-500/30 bg-yellow-500/5">
            <div class="text-2xl md:text-3xl font-bold text-yellow-400">{currentStats.points}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Puntos</div>
        </a>
    </div>
</div>
