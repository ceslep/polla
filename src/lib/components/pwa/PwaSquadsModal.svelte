<script>
    import { onMount } from 'svelte';
    import { loadSquads, selectStarters, getFormations, calculateAge } from '../../pwa/squads.js';
    import { getFlagData } from '../../flags.js';
    import SquadPitch from './SquadPitch.svelte';

    /**
     * @typedef {Object} Props
     * @property {() => void} onClose
     */
    /** @type {Props} */
    let { onClose } = $props();

    /** @type {any[]} */
    let squads = $state([]);
    let loading = $state(true);
    /** @type {string|null} */
    let error = $state(null);
    /** @type {string} */
    let search = $state('');
    /** @type {string} */
    let groupFilter = $state('ALL');
    /** @type {any|null} */
    let selectedSquad = $state(null);
    /** @type {string} */
    let formation = $state('4-3-3');
    /** @type {any|null} */
    let selectedPlayer = $state(null);

    const formations = getFormations();

    const groups = $derived.by(() => {
        const set = new Set(squads.map((s) => s.group));
        return ['ALL', ...Array.from(set).sort()];
    });

    const filteredSquads = $derived.by(() => {
        const q = search.trim().toLowerCase();
        return squads.filter((s) => {
            const matchesGroup = groupFilter === 'ALL' || s.group === groupFilter;
            const matchesSearch = !q || s.name.toLowerCase().includes(q);
            return matchesGroup && matchesSearch;
        });
    });

    /**
     * @param {string} name
     * @returns {string | null}
     */
    function flagUrl(name) {
        return getFlagData(name)?.flag || null;
    }

    const selectedTeam = $derived.by(() => {
        if (!selectedSquad) return null;
        const { starters, substitutes } = selectStarters(selectedSquad.players, formation);
        const enriched = (/** @type {any[]} */ list) =>
            list.map((p) => ({ ...p, age: calculateAge(p.date_of_birth), flagData: getFlagData(p.club.country) }));
        return {
            ...selectedSquad,
            flagData: getFlagData(selectedSquad.name),
            starters: enriched(starters),
            substitutes: enriched(substitutes)
        };
    });

    onMount(() => {
        fetchSquads();
    });

    async function fetchSquads() {
        loading = true;
        error = null;
        try {
            squads = await loadSquads();
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            console.error('[SquadsModal] error cargando plantillas:', e);
        } finally {
            loading = false;
        }
    }

    /**
     * @param {any} squad
     */
    function openSquad(squad) {
        selectedSquad = squad;
        selectedPlayer = null;
    }

    function backToGrid() {
        selectedSquad = null;
        selectedPlayer = null;
    }

    /**
     * @param {any} player
     */
    function selectPlayer(player) {
        selectedPlayer = player;
    }

    function handleKeydown(/** @type {KeyboardEvent} */ e) {
        if (e.key === 'Escape') onClose();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
    onclick={(/** @type {MouseEvent} */ e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={(/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') onClose(); }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="squads-title"
    tabindex="-1"
>
    <div class="relative w-full max-w-5xl h-[92vh] md:h-[90vh] bg-[#111] md:rounded-3xl overflow-hidden flex flex-col shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-slide-up">
        <!-- Header -->
        <header class="flex-none px-4 sm:px-6 py-4 border-b border-white/10 bg-[#111]/95 backdrop-blur-md z-10">
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 min-w-0">
                    {#if selectedSquad}
                        <button
                            type="button"
                            onclick={backToGrid}
                            class="flex-none p-2 -ml-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Volver a equipos"
                        >
                            ←
                        </button>
                    {/if}
                    <h2 id="squads-title" class="text-lg sm:text-xl font-bold text-white truncate">
                        {#if selectedSquad}
                            {selectedSquad.name}
                        {:else}
                            Plantillas Mundial 2026
                        {/if}
                    </h2>
                </div>
                <button
                    type="button"
                    onclick={onClose}
                    class="flex-none p-2 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Cerrar"
                >
                    ✕
                </button>
            </div>

            {#if !selectedSquad}
                <!-- Filtros grid -->
                <div class="mt-4 flex flex-col sm:flex-row gap-3">
                    <div class="relative flex-1">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                        <input
                            type="text"
                            bind:value={search}
                            placeholder="Buscar equipo..."
                            class="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                        />
                    </div>
                    <div class="flex gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                        {#each groups as g}
                            <button
                                type="button"
                                onclick={() => groupFilter = g}
                                class="flex-none px-3 py-2 rounded-xl text-xs font-semibold transition-all border {groupFilter === g ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-transparent' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}"
                            >
                                {g === 'ALL' ? 'Todos' : `Grupo ${g}`}
                            </button>
                        {/each}
                    </div>
                </div>
            {:else}
                <!-- Selector de formación -->
                <div class="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    <span class="text-xs text-gray-500 flex-none">Formación:</span>
                    {#each formations as f}
                        <button
                            type="button"
                            onclick={() => formation = f}
                            class="flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border {formation === f ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-transparent' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}"
                        >
                            {f}
                        </button>
                    {/each}
                </div>
            {/if}
        </header>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 scroll-smooth">
            {#if loading}
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                    {#each Array(15) as _, i}
                        <div class="aspect-square rounded-2xl bg-white/5 animate-pulse"></div>
                    {/each}
                </div>
            {:else if error}
                <div class="flex flex-col items-center justify-center h-full text-center py-12">
                    <div class="text-5xl mb-4">⚠️</div>
                    <p class="text-gray-300 mb-4 max-w-md">{error}</p>
                    <button
                        type="button"
                        onclick={fetchSquads}
                        class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-xl text-white font-bold transition-all"
                    >
                        🔄 Reintentar
                    </button>
                </div>
            {:else if !selectedSquad}
                <!-- Grid de equipos -->
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 stagger-children">
                    {#each filteredSquads as squad, idx (squad.fifa_code)}
                        <button
                            type="button"
                            onclick={() => openSquad(squad)}
                            class="group relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl glass hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/20 text-center min-h-[140px]"
                            style="--i: {idx}"
                        >
                            {#if flagUrl(squad.name)}
                                <img
                                    src={flagUrl(squad.name)}
                                    alt=""
                                    class="w-12 h-9 sm:w-14 sm:h-10 object-cover rounded-md shadow-md group-hover:scale-110 transition-transform duration-300"
                                />
                            {:else}
                                <div class="w-12 h-9 sm:w-14 sm:h-10 rounded-md bg-white/10 flex items-center justify-center text-xl">🏳️</div>
                            {/if}
                            <div>
                                <div class="text-sm font-bold text-white leading-tight">{squad.name}</div>
                                <div class="text-[10px] text-emerald-400 font-semibold mt-0.5">{squad.fifa_code} · Grupo {squad.group}</div>
                            </div>
                        </button>
                    {/each}
                </div>

                {#if filteredSquads.length === 0}
                    <div class="text-center py-16 text-gray-500">
                        <div class="text-4xl mb-2">🔍</div>
                        No se encontraron equipos.
                    </div>
                {/if}
            {:else if selectedTeam}
                <!-- Vista de plantilla -->
                <div class="flex flex-col lg:flex-row gap-6 animate-scale-in">
                    <!-- Columna izquierda: campo -->
                    <div class="flex-1 min-w-0">
                        <SquadPitch
                            starters={selectedTeam.starters}
                            {formation}
                            {selectedPlayer}
                            onSelectPlayer={selectPlayer}
                        />

                        <!-- Leyenda de posiciones -->
                        <div class="mt-4 flex flex-wrap justify-center gap-3 text-xs">
                            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-gradient-to-br from-amber-500 to-orange-500"></span> Portero</div>
                            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500"></span> Jugador</div>
                            <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full ring-2 ring-white"></span> Seleccionado</div>
                        </div>
                    </div>

                    <!-- Columna derecha: detalles y suplentes -->
                    <div class="flex-1 min-w-0 flex flex-col gap-4">
                        <!-- Info del equipo -->
                        <div class="glass-strong rounded-2xl p-4 flex items-center gap-4">
                            {#if selectedTeam.flagData?.flag}
                                <img src={selectedTeam.flagData.flag} alt="" class="w-16 h-12 object-cover rounded-lg shadow-lg" />
                            {/if}
                            <div>
                                <h3 class="text-xl font-bold text-white">{selectedTeam.name}</h3>
                                <p class="text-sm text-gray-400">{selectedTeam.fifa_code} · Grupo {selectedTeam.group} · {selectedTeam.players.length} jugadores</p>
                            </div>
                        </div>

                        <!-- Jugador seleccionado -->
                        {#if selectedPlayer}
                            <div class="glass-strong rounded-2xl p-4 animate-slide-up">
                                <div class="flex items-center gap-3 mb-3">
                                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-lg font-bold text-white">
                                        {selectedPlayer.number}
                                    </div>
                                    <div>
                                        <div class="text-lg font-bold text-white">{selectedPlayer.name}</div>
                                        <div class="text-sm text-emerald-400">{selectedPlayer.pos} · {selectedPlayer.age} años</div>
                                    </div>
                                </div>
                                <div class="text-sm text-gray-300">
                                    <span class="text-gray-500">Club:</span> {selectedPlayer.club.name}
                                    <span class="text-gray-500 ml-3">País club:</span> {selectedPlayer.club.country}
                                </div>
                            </div>
                        {:else}
                            <div class="glass rounded-2xl p-4 text-center text-gray-500 text-sm">
                                Tocá una ficha en el campo para ver detalles del jugador.
                            </div>
                        {/if}

                        <!-- Suplentes -->
                        <div class="glass-strong rounded-2xl p-4 flex-1">
                            <h4 class="text-sm font-bold text-white uppercase tracking-wider mb-3">Banco de suplentes</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                {#each selectedTeam.substitutes as sub}
                                    <button
                                        type="button"
                                        onclick={() => selectPlayer(sub)}
                                        class="flex items-center gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                                    >
                                        <span class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">{sub.number}</span>
                                        <div class="min-w-0">
                                            <div class="text-sm font-medium text-white truncate">{sub.name}</div>
                                            <div class="text-[10px] text-gray-400">{sub.pos} · {sub.club.name}</div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
