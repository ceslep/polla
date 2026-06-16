<script>
    import { FLAG_MAP } from '../parser.js';
    import { loadWorldCupMatches } from '../api.js';
    import { getFlagData } from '../flags.js';

    let { onClose } = $props();

    /** @typedef {Object} WorldCupMatchRaw
     * @property {string} round
     * @property {string} date
     * @property {string} time
     * @property {string} team1
     * @property {string} team2
     * @property {string} [group]
     * @property {string} ground
     * @property {{ft: [number, number], ht: [number, number]}} [score]
     * @property {Array<{name: string, minute: string}>} [goals1]
     * @property {Array<{name: string, minute: string}>} [goals2]
     */

    /** @type {WorldCupMatchRaw[]} */
    let matches = $state([]);
    let isLoading = $state(true);
    /** @type {string | null} */
    let error = $state(null);
    let selectedFilter = $state('all');
    let expandedMatch = $state(/** @type {number | null} */ (null));
    let teamSearch = $state('');
    /** @type {string | null} */
    let selectedTeamForWins = $state(null);

    const groupFilters = [
        { key: 'Group A', label: 'A' },
        { key: 'Group B', label: 'B' },
        { key: 'Group C', label: 'C' },
        { key: 'Group D', label: 'D' },
        { key: 'Group E', label: 'E' },
        { key: 'Group F', label: 'F' },
        { key: 'Group G', label: 'G' },
        { key: 'Group H', label: 'H' },
        { key: 'Group I', label: 'I' },
        { key: 'Group J', label: 'J' },
        { key: 'Group K', label: 'K' },
        { key: 'Group L', label: 'L' },
    ];

    const knockoutFilters = [
        { key: 'all', label: 'Todos' },
        { key: 'Round of 32', label: 'Octavos' },
        { key: 'Round of 16', label: 'Cuartos' },
        { key: 'Quarter-final', label: 'Semi' },
        { key: 'Semi-final', label: 'Semifinal' },
        { key: 'Match for third place', label: '3er Lugar' },
        { key: 'Final', label: 'Final' },
    ];

    const isGroupFilter = $derived(selectedFilter.startsWith('Group '));
    const isKnockoutFilter = $derived(!isGroupFilter && selectedFilter !== 'all');

    const uniqueTeams = $derived(() => {
        const teams = new Set();
        matches.forEach(m => {
            if (!isTbd(m.team1)) teams.add(m.team1);
            if (!isTbd(m.team2)) teams.add(m.team2);
        });
        return [...teams].sort();
    });

    const filteredMatches = $derived(() => {
        let result = [...matches];

        if (selectedFilter === 'all') {
            // No additional filter
        } else if (selectedFilter.startsWith('Group ')) {
            result = result.filter(m => m.group === selectedFilter);
        } else {
            result = result.filter(m => m.round === selectedFilter);
        }

        if (teamSearch.trim()) {
            const search = teamSearch.toLowerCase().trim();
            result = result.filter(m =>
                teamMatchesSearch(m.team1, search) ||
                teamMatchesSearch(m.team2, search)
            );
        }

        // Sort: finished matches first (by date desc), then pending (by date asc)
        result.sort((a, b) => {
            const aFinished = a.score?.ft != null;
            const bFinished = b.score?.ft != null;
            if (aFinished && !bFinished) return -1;
            if (!aFinished && bFinished) return 1;

            // Both finished or both pending - sort by date
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (aFinished) return dateB - dateA; // finished: newest first
            return dateA - dateB; // pending: oldest first
        });

        return result;
    });

    const statsByGroup = $derived.by(() => {
        /** @type {Record<string, {total: number, finished: number}>} */
        const groups = {};
        matches.forEach(m => {
            if (m.group && !groups[m.group]) {
                groups[m.group] = { total: 0, finished: 0 };
            }
            if (m.group) {
                groups[m.group].total++;
                if (m.score?.ft) groups[m.group].finished++;
            }
        });
        return groups;
    });

    /** @param {string} teamName */
    function getFlag(teamName) {
        if (!teamName) return '';
        for (const [flag, country] of Object.entries(FLAG_MAP)) {
            if (teamName.toLowerCase().includes(country.toLowerCase())) {
                return flag;
            }
        }
        return '';
    }

    /** @param {string} teamName */
    function getFlagHtml(teamName) {
        if (!teamName || isTbd(teamName)) return teamName;
        const data = getFlagData(teamName);
        if (!data) return teamName;
        return `<img src="${data.flag}" class="inline-block h-5 w-7 mr-1" alt="${data.spanishName}" title="${data.spanishName}" />${data.spanishName}`;
    }

    /** @param {string} teamName */
    function getSpanishTeamName(teamName) {
        if (!teamName) return '';
        const data = getFlagData(teamName);
        return data?.spanishName || teamName;
    }

    /** @param {string} teamName @param {string} search */
    function teamMatchesSearch(teamName, search) {
        if (!teamName || isTbd(teamName)) return false;
        const normalized = teamName.toLowerCase();
        const spanishNormalized = getSpanishTeamName(teamName).toLowerCase();
        return normalized.includes(search) || spanishNormalized.includes(search);
    }

    /** @param {string} teamCode */
    function translateTeamCode(teamCode) {
        if (!teamCode) return '';
        if (teamCode.startsWith('W') || teamCode.startsWith('L')) {
            return teamCode;
        }
        if (teamCode.match(/^\d[A-Z]$/)) {
            const num = teamCode[0];
            const letter = teamCode[1];
            const groupNames = /** @type {Record<string, string>} */ ({ A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', H: 'H', I: 'I', J: 'J', K: 'K', L: 'L' });
            const position = num === '1' ? '1°' : '2°';
            return `${position} Grupo ${groupNames[letter] || letter}`;
        }
        return teamCode;
    }

    /** @param {string} dateStr */
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    /** @param {string} dateStr */
    function formatDate(dateStr) {
        const date = parseLocalDate(dateStr) || new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
        });
    }

    /** @param {string} teamName */
    function isTbd(teamName) {
        if (!teamName) return true;
        return teamName.startsWith('W') || teamName.startsWith('L') || teamName.match(/^\d[A-Z]$/);
    }

    function toggleMatch(/** @type {number} */ index) {
        expandedMatch = expandedMatch === index ? null : index;
    }

    function selectTeam(/** @type {string} */ team) {
        teamSearch = team;
    }

    function clearTeamSearch() {
        teamSearch = '';
    }

    /** @param {string} team */
    function showTeamWins(team) {
        selectedTeamForWins = team;
    }

    function clearTeamWins() {
        selectedTeamForWins = null;
    }

    const teamWins = $derived.by(() => {
        if (!selectedTeamForWins) return [];
        const teamLower = selectedTeamForWins.toLowerCase();
        return matches.filter(m => {
            if (!m.score?.ft) return false;
            const t1 = m.team1.toLowerCase();
            const t2 = m.team2.toLowerCase();
            if (t1.includes(teamLower) || teamLower.includes(t1)) {
                return m.score.ft[0] > m.score.ft[1];
            }
            if (t2.includes(teamLower) || teamLower.includes(t2)) {
                return m.score.ft[1] > m.score.ft[0];
            }
            return false;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    const selectedTeamStats = $derived.by(() => {
        if (!selectedTeamForWins) return null;
        const wins = teamWins;
        const teamLower = selectedTeamForWins.toLowerCase();
        return {
            total: wins.length,
            goalsFor: wins.reduce((sum, m) => {
                const t1 = m.team1.toLowerCase();
                if (t1.includes(teamLower) || teamLower.includes(t1)) return sum + (m.score?.ft[0] ?? 0);
                return sum + (m.score?.ft[1] ?? 0);
            }, 0),
            goalsAgainst: wins.reduce((sum, m) => {
                const t1 = m.team1.toLowerCase();
                if (t1.includes(teamLower) || teamLower.includes(t1)) return sum + (m.score?.ft[1] ?? 0);
                return sum + (m.score?.ft[0] ?? 0);
            }, 0),
        };
    });

    $effect(() => {
        loadMatches();
    });

    async function loadMatches() {
        isLoading = true;
        error = null;
        try {
            matches = await loadWorldCupMatches();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Error cargando partidos';
        } finally {
            isLoading = false;
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-6xl max-h-[95vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center flex-shrink-0">
            <div class="flex items-center gap-4">
                <h2 class="text-xl font-bold text-cyan-400">🌍 Resultados Mundial 2026</h2>
                <div class="text-sm text-gray-400">
                    {matches.length} partidos
                </div>
            </div>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <!-- Filter Tabs -->
        <div class="border-b border-white/10 flex-shrink-0">
            <div class="flex items-center justify-center gap-1 p-2 bg-black/20">
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-all {selectedFilter === 'all' ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/10'}"
                    onclick={() => selectedFilter = 'all'}
                >
                    🌐 Todos
                </button>
                {#each groupFilters as gf}
                    {@const groupStats = statsByGroup[gf.key]}
                    <button
                        class="w-11 h-11 rounded-xl font-bold text-sm transition-all relative {selectedFilter === gf.key ? 'bg-cyan-600 text-white scale-110' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                        onclick={() => selectedFilter = gf.key}
                        title="{gf.key}{groupStats ? `: ${groupStats.finished}/${groupStats.total}` : ''}"
                    >
                        {gf.label}
                        {#if groupStats && groupStats.finished < groupStats.total}
                            <span class="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full"></span>
                        {/if}
                    </button>
                {/each}
                {#each knockoutFilters.filter(f => f.key !== 'all') as kf}
                    <button
                        class="px-3 py-2 rounded-lg text-xs font-medium transition-all {selectedFilter === kf.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                        onclick={() => selectedFilter = kf.key}
                    >
                        {kf.label}
                    </button>
                {/each}
            </div>

            <!-- Team Search -->
            <div class="p-3 border-t border-white/5">
                <div class="flex items-center gap-3">
                    <div class="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Buscar selección..."
                            class="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-500"
                            bind:value={teamSearch}
                        />
                        {#if teamSearch}
                            <button
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                onclick={clearTeamSearch}
                            >
                                ✕
                            </button>
                        {/if}
                    </div>
                    <div class="text-sm text-gray-400">
                        {filteredMatches().length} partidos
                    </div>
                </div>

                <!-- Team quick filters -->
                {#if teamSearch.length === 0 && uniqueTeams().length > 0}
                    <div class="flex flex-wrap gap-1 mt-2">
                        {#each uniqueTeams().slice(0, 20) as team}
                            <button
                                class="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-gray-300 transition-all flex items-center gap-1"
                                onclick={() => selectTeam(team)}
                            >
                                <span>{@html getFlagHtml(team)}</span>
                            </button>
                        {/each}
                        {#if uniqueTeams().length > 20}
                            <span class="px-2 py-1 text-xs text-gray-500">+{uniqueTeams().length - 20} más</span>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Matches List -->
        <div class="flex-1 overflow-y-auto p-4">
            {#if isLoading}
                <div class="flex flex-col items-center justify-center h-40 gap-4">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
                    <span class="text-gray-400">Cargando partidos...</span>
                </div>
            {:else if error}
                <div class="text-center py-12">
                    <div class="text-5xl mb-4">⚠️</div>
                    <p class="text-red-400 mb-2">Error: {error}</p>
                    <button class="mt-4 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white font-semibold" onclick={loadMatches}>
                        Reintentar
                    </button>
                </div>
            {:else if filteredMatches().length === 0}
                <div class="text-center py-12">
                    <div class="text-5xl mb-4">🔍</div>
                    <p class="text-gray-400">No hay partidos para este filtro</p>
                    {#if teamSearch}
                        <button class="mt-2 text-cyan-400 hover:text-cyan-300" onclick={clearTeamSearch}>
                            Limpiar búsqueda
                        </button>
                    {/if}
                </div>
            {:else}
                <div class="space-y-3">
                    {#each filteredMatches() as match, idx}
                        {@const isExpanded = expandedMatch === idx}
                        {@const team1Tbd = isTbd(match.team1)}
                        {@const team2Tbd = isTbd(match.team2)}
                        <div
                            class="bg-gradient-to-r {match.score?.ft ? 'from-emerald-900/20 to-transparent' : 'from-white/5 to-transparent'} rounded-2xl border border-white/10 hover:border-white/20 transition-all overflow-hidden"
                        >
                            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                            <div class="w-full text-left p-4 cursor-pointer" onclick={() => toggleMatch(idx)}>
                                <div class="flex items-center justify-between mb-3">
                                    <div class="flex items-center gap-3">
                                        <span class="bg-cyan-600/20 text-cyan-400 text-xs font-bold px-3 py-1 rounded-full uppercase">
                                            {match.round}
                                        </span>
                                        {#if match.group}
                                            <span class="bg-white/10 text-gray-300 text-xs font-medium px-2 py-0.5 rounded">
                                                {match.group}
                                            </span>
                                        {/if}
                                        {#if match.score?.ft}
                                            <span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full">
                                                ✅ Final
                                            </span>
                                        {:else if team1Tbd || team2Tbd}
                                            <span class="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full">
                                                ⏳ Por Definir
                                            </span>
                                        {:else}
                                            <span class="bg-orange-500/20 text-orange-400 text-xs font-bold px-3 py-1 rounded-full">
                                                🕐 Pendiente
                                            </span>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-4 text-sm text-gray-400">
                                        <span>{formatDate(match.date)}</span>
                                        <span>🏟️ {match.ground}</span>
                                    </div>
                                </div>

                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3 flex-1">
                                        {#if !team1Tbd}
                                            <span class="text-2xl">{@html getFlagHtml(match.team1)}</span>
                                        {/if}
                                        <div>
                                            <button
                                                class="font-bold text-xl {team1Tbd ? 'text-yellow-500 cursor-default' : 'text-white hover:text-cyan-400 hover:underline cursor-pointer'}"
                                                onclick={() => { if (!team1Tbd) showTeamWins(match.team1); }}
                                            >
                                                {team1Tbd ? translateTeamCode(match.team1) : match.team1}
                                            </button>
                                            {#if teamSearch && teamMatchesSearch(match.team1, teamSearch.toLowerCase())}
                                                <span class="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Coincidencia</span>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-4 px-6">
                                        {#if match.score?.ft}
                                            <span class="text-4xl font-black text-cyan-400">{match.score.ft[0]}</span>
                                            <span class="text-3xl text-gray-600">-</span>
                                            <span class="text-4xl font-black text-cyan-400">{match.score.ft[1]}</span>
                                        {:else}
                                            <span class="text-2xl font-light text-gray-500">vs</span>
                                        {/if}
                                    </div>

                                    <div class="flex items-center gap-3 flex-1 justify-end">
                                        <div class="text-right">
                                            <button
                                                class="font-bold text-xl {team2Tbd ? 'text-yellow-500 cursor-default' : 'text-white hover:text-cyan-400 hover:underline cursor-pointer'}"
                                                onclick={() => { if (!team2Tbd) showTeamWins(match.team2); }}
                                            >
                                                {team2Tbd ? translateTeamCode(match.team2) : match.team2}
                                            </button>
                                            {#if teamSearch && teamMatchesSearch(match.team2, teamSearch.toLowerCase())}
                                                <span class="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Coincidencia</span>
                                            {/if}
                                        </div>
                                        {#if !team2Tbd}
                                            <span class="text-2xl">{@html getFlagHtml(match.team2)}</span>
                                        {/if}
                                    </div>
                                </div>

                                {#if match.score?.ht}
                                    <div class="mt-2 text-center text-sm text-gray-500">
                                        <span class="bg-white/5 px-3 py-1 rounded-full">HT: {match.score.ht[0]} - {match.score.ht[1]}</span>
                                    </div>
                                {/if}
                            </div>

                            {#if isExpanded && match.score?.ft && (match.goals1?.length || match.goals2?.length)}
                                <div class="border-t border-white/10 p-4 bg-black/20">
                                    <div class="grid grid-cols-2 gap-6">
                                        <div>
                                            {#if match.goals1?.length}
                                                <div class="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                    {@html getFlagHtml(match.team1)}
                                                </div>
                                                {#each match.goals1 as goal}
                                                    <div class="text-sm text-gray-300 py-1.5 flex items-center gap-3">
                                                        <span class="bg-cyan-500/20 text-cyan-400 font-mono text-xs px-2 py-0.5 rounded">{goal.minute}'</span>
                                                        <span>{goal.name}</span>
                                                    </div>
                                                {/each}
                                            {:else}
                                                <div class="text-gray-500 text-sm italic">Sin goles</div>
                                            {/if}
                                        </div>
                                        <div>
                                            {#if match.goals2?.length}
                                                <div class="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-end gap-2">
                                                    {@html getFlagHtml(match.team2)}
                                                </div>
                                                {#each match.goals2 as goal}
                                                    <div class="text-sm text-gray-300 py-1.5 flex items-center justify-end gap-3">
                                                        <span>{goal.name}</span>
                                                        <span class="bg-cyan-500/20 text-cyan-400 font-mono text-xs px-2 py-0.5 rounded">{goal.minute}'</span>
                                                    </div>
                                                {/each}
                                            {:else}
                                                <div class="text-gray-500 text-sm italic text-right">Sin goles</div>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- Team Wins View -->
            {#if selectedTeamForWins}
                <div class="mt-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <button
                                class="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                onclick={clearTeamWins}
                                title="Volver"
                            >
                                ←
                            </button>
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">{@html getFlagHtml(selectedTeamForWins)}</span>
                                <div>
                                    <h3 class="text-lg font-bold text-white">Victorias de {@html getFlagHtml(selectedTeamForWins)}</h3>
                                    {#if selectedTeamStats}
                                        <p class="text-sm text-gray-400">
                                            {selectedTeamStats.total} victorias · 
                                            {selectedTeamStats.goalsFor} GF / {selectedTeamStats.goalsAgainst} GC
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        </div>
                        <button
                            class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
                            onclick={clearTeamWins}
                        >
                            Cerrar
                        </button>
                    </div>

                    {#if teamWins.length === 0}
                        <div class="text-center py-8">
                            <div class="text-5xl mb-4">😔</div>
                            <p class="text-gray-400">Sin victorias registradas</p>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            {#each teamWins as match}
                                {@const isTeam1 = match.team1.toLowerCase().includes(selectedTeamForWins.toLowerCase()) || selectedTeamForWins.toLowerCase().includes(match.team1.toLowerCase())}
                                {@const teamScore = isTeam1 ? match.score?.ft[0] : match.score?.ft[1]}
                                {@const oppScore = isTeam1 ? match.score?.ft[1] : match.score?.ft[0]}
                                {@const opponent = isTeam1 ? match.team2 : match.team1}
                                <div class="bg-emerald-900/20 rounded-2xl border border-emerald-500/20 p-4">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <span class="text-2xl">{@html getFlagHtml(selectedTeamForWins)}</span>
                                            <div>
                                                <div class="font-bold text-white">{@html getFlagHtml(selectedTeamForWins)}</div>
                                                <div class="text-sm text-gray-400 flex items-center gap-2">
                                                    {@html getFlagHtml(opponent)}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-4">
                                            <span class="text-3xl font-black text-emerald-400">{teamScore}</span>
                                            <span class="text-2xl text-gray-600">-</span>
                                            <span class="text-3xl font-black text-gray-400">{oppScore}</span>
                                        </div>
                                    </div>
                                    <div class="mt-2 flex items-center justify-between text-xs text-gray-500">
                                        <span>{match.round}{match.group ? ` · ${match.group}` : ''}</span>
                                        <span>{formatDate(match.date)} · {match.ground}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-white/10 flex justify-between items-center flex-shrink-0 bg-black/20">
            <div class="text-xs text-gray-500">
                Fuente: openfootball.github.io/worldcup.json
            </div>
            <button
                class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-colors"
                onclick={onClose}
            >
                Cerrar
            </button>
        </div>
    </div>
</div>