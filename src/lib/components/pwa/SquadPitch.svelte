<script>
    import { getFormationCoords } from '../../pwa/squads.js';

    /**
     * @typedef {Object} Props
     * @property {any[]} starters
     * @property {string} formation
     * @property {any} [selectedPlayer]
     * @property {(player: any) => void} [onSelectPlayer]
     */
    /** @type {Props} */
    let {
        starters,
        formation,
        selectedPlayer = null,
        onSelectPlayer = () => {}
    } = $props();

    const coords = $derived(getFormationCoords(formation));

    /**
     * @param {number} idx
     */
    function posStyle(idx) {
        const c = coords[idx] || { x: 50, y: 50 };
        return `left: ${c.x}%; top: ${c.y}%; transform: translate(-50%, -50%);`;
    }
</script>

<div class="relative w-full max-w-md mx-auto aspect-[2/3] rounded-3xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10">
    <!-- Fondo del campo -->
    <div class="absolute inset-0 bg-gradient-to-b from-pitch-deeper via-pitch-dark to-pitch-deeper"></div>

    <!-- Líneas del campo (SVG) -->
    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 150" preserveAspectRatio="none">
        <!-- Borde exterior -->
        <rect x="2" y="2" width="96" height="146" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" rx="1" />
        <!-- Línea media -->
        <line x1="2" y1="75" x2="98" y2="75" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <!-- Círculo central -->
        <circle cx="50" cy="75" r="12" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <circle cx="50" cy="75" r="1" fill="rgba(255,255,255,0.7)" />
        <!-- Área inferior -->
        <rect x="22" y="112" width="56" height="34" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <rect x="32" y="130" width="36" height="16" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <!-- Punto penal inferior -->
        <circle cx="50" cy="130" r="1" fill="rgba(255,255,255,0.7)" />
        <!-- Semicírculo área inferior -->
        <path d="M 38 112 A 12 12 0 0 1 62 112" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <!-- Área superior -->
        <rect x="22" y="2" width="56" height="34" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <rect x="32" y="2" width="36" height="16" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <!-- Punto penal superior -->
        <circle cx="50" cy="18" r="1" fill="rgba(255,255,255,0.7)" />
        <!-- Semicírculo área superior -->
        <path d="M 38 38 A 12 12 0 0 0 62 38" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.8" />
        <!-- Círculos de córner -->
        <path d="M 2 8 A 6 6 0 0 1 8 2" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.6" />
        <path d="M 92 2 A 6 6 0 0 1 98 8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.6" />
        <path d="M 2 142 A 6 6 0 0 0 8 148" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.6" />
        <path d="M 92 148 A 6 6 0 0 0 98 142" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="0.6" />
    </svg>

    <!-- Sombreado de áreas -->
    <div class="absolute inset-x-[22%] bottom-[2%] h-[22.7%] bg-white/5 pointer-events-none"></div>
    <div class="absolute inset-x-[22%] top-[2%] h-[22.7%] bg-white/5 pointer-events-none"></div>

    <!-- Jugadores -->
    {#each starters as player, idx (player.number)}
        <button
            type="button"
            class="absolute w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50"
            class:bg-gradient-to-br={true}
            class:from-emerald-500={player.pos !== 'GK'}
            class:to-cyan-500={player.pos !== 'GK'}
            class:from-amber-500={player.pos === 'GK'}
            class:to-orange-500={player.pos === 'GK'}
            class:ring-2={selectedPlayer?.number === player.number}
            class:ring-white={selectedPlayer?.number === player.number}
            class:ring-offset-2={selectedPlayer?.number === player.number}
            class:ring-offset-pitch-deeper={selectedPlayer?.number === player.number}
            style="{posStyle(idx)} animation-delay: {idx * 60}ms;"
            style:animation="scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both"
            onclick={() => onSelectPlayer(player)}
            aria-label="{player.name}, {player.pos}"
        >
            {player.number}
        </button>
    {/each}
</div>
