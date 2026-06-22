<script>
    import { appState, filteredBets, participants, matchDates, matchesPerDate, finishedMatchesPerDate } from '../stores.svelte.js';

    let {
        isOpen = $bindable(false),
        availableDates = [],
        totalMatchesMap = new Map(),
        finishedMatchesMap = new Map(),
        currentParticipants = [],
        activeTab = 'grouped'
    } = $props();

    /** @param {string} dateStr */
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    /** @param {string} dateStr */
    function formatDateShort(dateStr) {
        try {
            const date = parseLocalDate(dateStr) || new Date(dateStr);
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        } catch { return dateStr; }
    }

    function clearFilters() {
        appState.filters.date = '';
        appState.filters.participant = '';
        appState.filters.type = '';
        appState.filters.status = '';
        appState.filters.search = '';
    }

    const hasActiveFilters = $derived(
        appState.filters.date ||
        appState.filters.participant ||
        appState.filters.type ||
        appState.filters.status ||
        appState.filters.search
    );

    function handleApply() {
        isOpen = false;
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 md:hidden">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={() => isOpen = false}></div>
        <div class="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-white/10 rounded-t-3xl p-4 pb-8 max-h-[85vh] overflow-y-auto">
            <div class="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4"></div>
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-white">Filtros</h3>
                {#if hasActiveFilters}
                    <button
                        class="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
                        onclick={clearFilters}
                    >
                        Limpiar todo
                    </button>
                {/if}
            </div>

            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-2" for="filter-date">Fecha</label>
                    <select
                        id="filter-date"
                        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500"
                        bind:value={appState.filters.date}
                    >
                        <option value="">Todas las fechas</option>
                        {#each availableDates as d}
                            {@const totalMatchCount = totalMatchesMap.get(d) || 0}
                            {@const finishedCount = finishedMatchesMap.get(d) || 0}
                            <option value={d}>{formatDateShort(d)} ({totalMatchCount} partidos{finishedCount < totalMatchCount ? `, ${finishedCount} jugados` : ''})</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-2" for="filter-participant">Participante</label>
                    <select
                        id="filter-participant"
                        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500"
                        bind:value={appState.filters.participant}
                    >
                        <option value="">Todos los participantes</option>
                        {#each currentParticipants as p}
                            <option value={p}>{p}</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-2" for="filter-type">Tipo</label>
                    <select
                        id="filter-type"
                        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500"
                        bind:value={appState.filters.type}
                    >
                        <option value="score">Partidos</option>
                        <option value="champion">Campeón</option>
                        <option value="runnerup">Subcampeón</option>
                        <option value="topscorer">Goleador</option>
                        <option value="">Todos los tipos</option>
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-2" for="filter-status">Estado</label>
                    <select
                        id="filter-status"
                        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:border-cyan-500"
                        bind:value={appState.filters.status}
                    >
                        <option value="">Todos los estados</option>
                        <option value="pending">Pendientes</option>
                        <option value="exact">Exactas</option>
                        <option value="correct">Correctas</option>
                        <option value="incorrect">Erradas</option>
                    </select>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-400 mb-2" for="filter-search">Buscar</label>
                    <input
                        id="filter-search"
                        type="text"
                        placeholder="Buscar en apuestas..."
                        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-cyan-500"
                        bind:value={appState.filters.search}
                    />
                </div>

                <div>
                    <span class="block text-sm font-medium text-gray-400 mb-2">Vista</span>
                    <div class="flex gap-2 bg-white/10 rounded-xl p-1">
                        <button
                            class="flex-1 py-3 rounded-lg text-sm font-medium transition-all
                            {activeTab === 'grouped' ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400'}"
                            onclick={() => activeTab = 'grouped'}
                        >
                            📋 Mensaje
                        </button>
                        <button
                            class="flex-1 py-3 rounded-lg text-sm font-medium transition-all
                            {activeTab === 'rows' ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400'}"
                            onclick={() => activeTab = 'rows'}
                        >
                            📝 Filas
                        </button>
                    </div>
                </div>
            </div>

            <button
                class="w-full mt-6 py-4 bg-cyan-600 hover:bg-cyan-500 rounded-2xl text-white font-bold text-lg transition-all"
                onclick={handleApply}
            >
                Aplicar Filtros
            </button>
        </div>
    </div>
{/if}

<style>
    select option {
        background: #1a1a1a;
        color: #ffffff;
    }
</style>
