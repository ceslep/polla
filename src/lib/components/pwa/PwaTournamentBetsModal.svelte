<script>
    import { onMount } from 'svelte';
    import { getFlagData } from '../../flags.js';
    import { loadTournamentBets } from '../../api.js';
    import { loadSquads, buildPlayerIndex, matchScorerName } from '../../pwa/squads.js';
    import {
        parseChampionBet,
        parseRunnerupBet,
        parseThirdplaceBet,
        parseTopscorerBet
    } from '../../parser.js';

    /** @type {{ onClose: () => void }} */
    let { onClose } = $props();

    /** Estado de carga y datos */
    let loading = $state(true);
    let error = $state('');
    let rawBets = $state(/** @type {import('../../types.js').TournamentBetRow[]} */ ([]));
    /** Índice de jugadores del Mundial para normalizar nombres de goleadores */
    let playerIndex = $state(/** @type {Array<{ name: string, norm: string, surname: string }>} */ ([]));
    let activeTab = $state(/** @type {'analysis' | 'list'} */ ('analysis'));
    let searchQuery = $state('');

    // Filtros de click en estadísticas
    let filterChampion = $state('');
    let filterRunnerup = $state('');
    let filterThirdplace = $state('');
    let filterTopscorer = $state('');

    onMount(() => {
        loadData();
    });

    async function loadData() {
        try {
            // Cargar apuestas y plantillas en paralelo. Las plantillas alimentan el
            // índice que normaliza nombres de goleadores (p. ej. "Mbape" → "Mbappé").
            const [bets, squads] = await Promise.all([
                loadTournamentBets(),
                loadSquads().catch((e) => {
                    console.warn('No se pudieron cargar plantillas para normalizar goleadores:', e);
                    return [];
                })
            ]);
            rawBets = bets;
            playerIndex = buildPlayerIndex(squads);
            loading = false;
        } catch (e) {
            console.error('Error cargando apuestas de torneo:', e);
            error = 'No se pudieron cargar las apuestas de torneo. Por favor, intenta de nuevo.';
            loading = false;
        }
    }

    /**
     * Normaliza un nombre de goleador escrito a mano al nombre canónico del jugador
     * del Mundial cuando hay coincidencia; si no, capitaliza el texto original.
     * @param {string} raw
     * @returns {string}
     */
    function canonicalScorer(raw) {
        const text = (raw || '').trim();
        if (!text) return '';
        const matched = matchScorerName(text, playerIndex);
        if (matched) return matched;
        return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    }

    /**
     * Procesa y agrupa las apuestas por participante.
     * Normaliza el goleador una sola vez para evitar recalcular en stats/filtros.
     */
    const participantsData = $derived.by(() => {
        /** @type {Map<string, {name: string, phone: string, champion: string, runnerup: string, thirdplace: string, topscorer: string, normalizedTopscorer: string}>} */
        const map = new Map();

        for (const bet of rawBets) {
            const name = bet.participant;
            if (!name) continue;

            if (!map.has(name)) {
                map.set(name, {
                    name,
                    phone: bet.phone || '',
                    champion: '',
                    runnerup: '',
                    thirdplace: '',
                    topscorer: '',
                    normalizedTopscorer: ''
                });
            }

            const p = map.get(name);
            if (!p) continue;

            // Intentar leer de los campos estructurados de la fila
            if (bet.type === 'champion' && bet.champion) p.champion = bet.champion;
            if (bet.type === 'runnerup' && bet.runnerup) p.runnerup = bet.runnerup;
            if (bet.type === 'topscorer' && bet.topscorer) p.topscorer = bet.topscorer;

            // Parser dinámico como fallback o para tercer puesto
            if (bet.originalMessage) {
                if (!p.champion) {
                    const c = parseChampionBet(bet.originalMessage);
                    if (c) p.champion = c;
                }
                if (!p.runnerup) {
                    const r = parseRunnerupBet(bet.originalMessage);
                    if (r) p.runnerup = r;
                }
                if (!p.thirdplace) {
                    const t = parseThirdplaceBet(bet.originalMessage);
                    if (t) p.thirdplace = t;
                }
                if (!p.topscorer) {
                    const s = parseTopscorerBet(bet.originalMessage);
                    if (s) p.topscorer = s;
                }
            }
        }

        // Normalizar topscorer una sola vez por participante
        for (const p of map.values()) {
            p.normalizedTopscorer = canonicalScorer(p.topscorer);
        }

        return [...map.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
        );
    });

    /**
     * Estadísticas agrupadas (para tab de análisis), incluye tercer puesto.
     */
    const stats = $derived.by(() => {
        /** @type {Record<string, number>} */
        const champs = {};
        /** @type {Record<string, number>} */
        const runners = {};
        /** @type {Record<string, number>} */
        const thirds = {};
        /** @type {Record<string, number>} */
        const scorers = {};

        let totalChamps = 0;
        let totalRunners = 0;
        let totalThirds = 0;
        let totalScorers = 0;

        for (const p of participantsData) {
            if (p.champion) {
                champs[p.champion] = (champs[p.champion] || 0) + 1;
                totalChamps++;
            }
            if (p.runnerup) {
                runners[p.runnerup] = (runners[p.runnerup] || 0) + 1;
                totalRunners++;
            }
            if (p.thirdplace) {
                thirds[p.thirdplace] = (thirds[p.thirdplace] || 0) + 1;
                totalThirds++;
            }
            if (p.normalizedTopscorer) {
                scorers[p.normalizedTopscorer] = (scorers[p.normalizedTopscorer] || 0) + 1;
                totalScorers++;
            }
        }

        /** @param {Record<string, number>} obj @param {number} total */
        const toSorted = (obj, total) =>
            Object.entries(obj)
                .map(([value, count]) => ({ value, count, pct: Math.round((count / total) * 100) }))
                .sort((a, b) => b.count - a.count);

        return {
            topChampions: toSorted(champs, totalChamps),
            topRunners: toSorted(runners, totalRunners),
            topThirds: toSorted(thirds, totalThirds),
            topScorers: toSorted(scorers, totalScorers)
        };
    });

    /** Total de filtros activos */
    const activeFilterCount = $derived(
        (filterChampion ? 1 : 0) + (filterRunnerup ? 1 : 0) +
        (filterThirdplace ? 1 : 0) + (filterTopscorer ? 1 : 0)
    );

    /**
     * Filtra los participantes mostrados según búsqueda y filtros de click
     */
    const filteredParticipants = $derived.by(() => {
        const query = searchQuery.trim().toLowerCase();
        return participantsData.filter(p => {
            // Filtro por texto de búsqueda
            if (query && !p.name.toLowerCase().includes(query)) return false;

            // Filtro por selección en estadísticas
            if (filterChampion && p.champion !== filterChampion) return false;
            if (filterRunnerup && p.runnerup !== filterRunnerup) return false;
            if (filterThirdplace && p.thirdplace !== filterThirdplace) return false;
            if (filterTopscorer && p.normalizedTopscorer !== filterTopscorer) return false;

            return true;
        });
    });

    function clearFilters() {
        filterChampion = '';
        filterRunnerup = '';
        filterThirdplace = '';
        filterTopscorer = '';
    }

    /**
     * @param {KeyboardEvent} e
     */
    function handleKeydown(e) {
        if (e.key === 'Escape') onClose();
    }

    /**
     * @param {Event} e
     */
    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) onClose();
    }

    /**
     * Definición de las columnas de estadísticas para reutilizar en el snippet.
     * @type {Array<{ key: string, emoji: string, title: string, color: string, barColor: string, isTeam: boolean }>}
     */
    const STAT_COLUMNS = [
        { key: 'champion', emoji: '🏆', title: 'Campeón Favorito', color: 'text-amber-400', barColor: 'bg-amber-400', isTeam: true },
        { key: 'runnerup', emoji: '🥈', title: 'Subcampeón', color: 'text-slate-300', barColor: 'bg-slate-300', isTeam: true },
        { key: 'thirdplace', emoji: '🥉', title: 'Tercer Puesto', color: 'text-orange-400', barColor: 'bg-orange-400', isTeam: true },
        { key: 'topscorer', emoji: '👟', title: 'Goleador Estrella', color: 'text-emerald-400', barColor: 'bg-emerald-400', isTeam: false }
    ];

    /**
     * Mapea cada key de columna a sus datos de stats y su filtro.
     * @param {string} key
     * @returns {{ items: Array<{value: string, count: number, pct: number}>, filter: string }}
     */
    function getStatData(key) {
        const dataMap = /** @type {Record<string, Array<{value: string, count: number, pct: number}>>} */ ({
            champion: stats.topChampions,
            runnerup: stats.topRunners,
            thirdplace: stats.topThirds,
            topscorer: stats.topScorers
        });
        const filterMap = /** @type {Record<string, string>} */ ({
            champion: filterChampion,
            runnerup: filterRunnerup,
            thirdplace: filterThirdplace,
            topscorer: filterTopscorer
        });
        return { items: dataMap[key] || [], filter: filterMap[key] || '' };
    }

    /**
     * Toggle de filtro por key de columna.
     * @param {string} key
     * @param {string} value
     */
    function toggleFilter(key, value) {
        if (key === 'champion') filterChampion = filterChampion === value ? '' : value;
        else if (key === 'runnerup') filterRunnerup = filterRunnerup === value ? '' : value;
        else if (key === 'thirdplace') filterThirdplace = filterThirdplace === value ? '' : value;
        else if (key === 'topscorer') filterTopscorer = filterTopscorer === value ? '' : value;
        activeTab = 'list';
    }

    /**
     * Definición de las filas de detalle para cada tarjeta de participante.
     * @type {Array<{ key: 'champion' | 'runnerup' | 'thirdplace' | 'topscorer', emoji: string, label: string, color: string, isTeam: boolean }>}
     */
    const DETAIL_ROWS = [
        { key: 'champion', emoji: '🏆', label: 'Campeón', color: 'text-amber-400', isTeam: true },
        { key: 'runnerup', emoji: '🥈', label: 'Subcampeón', color: 'text-slate-300', isTeam: true },
        { key: 'thirdplace', emoji: '🥉', label: 'Tercer puesto', color: 'text-orange-400', isTeam: true },
        { key: 'topscorer', emoji: '👟', label: 'Goleador', color: 'text-emerald-400', isTeam: false }
    ];
</script>

<svelte:window onkeydown={handleKeydown} />

<div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tournament-modal-title"
    tabindex="-1"
>
    <div
        class="w-full md:max-w-4xl max-h-[92vh] flex flex-col bg-gray-950 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/80 overflow-hidden animate-slide-up"
    >
        <!-- Header -->
        <div class="p-5 md:p-6 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
            <div>
                <h2 id="tournament-modal-title" class="text-xl md:text-2xl font-black text-cyan-400 flex items-center gap-2">
                    🏆 Predicciones del Torneo
                </h2>
                <p class="text-xs text-gray-500 mt-1">Apuestas a Campeón, Subcampeón, Tercer puesto y Goleador</p>
            </div>
            <button
                class="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all text-xl"
                onclick={onClose}
                aria-label="Cerrar"
            >×</button>
        </div>

        {#if loading}
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-gray-400">
                <div class="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-sm font-semibold">Cargando apuestas y estadísticas...</p>
            </div>
        {:else if error}
            <div class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div class="text-5xl mb-4">⚠️</div>
                <p class="text-red-400 font-semibold mb-4">{error}</p>
                <button
                    class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold transition-all text-sm"
                    onclick={() => { loading = true; error = ''; loadData(); }}
                >Reintentar</button>
            </div>
        {:else}
            <!-- Sub-Header Tabs & Search -->
            <div class="px-5 md:px-6 py-3 bg-white/[0.02] border-b border-white/5 flex flex-col md:flex-row gap-3 items-center justify-between flex-shrink-0">
                <div class="flex gap-2 w-full md:w-auto">
                    <button
                        class="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all
                            {activeTab === 'analysis' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                        onclick={() => activeTab = 'analysis'}
                    >📊 Análisis de Datos</button>
                    <button
                        class="flex-1 md:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all relative
                            {activeTab === 'list' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}"
                        onclick={() => activeTab = 'list'}
                    >
                        👥 Participantes ({filteredParticipants.length}{activeFilterCount ? '/' + participantsData.length : ''})
                        {#if activeFilterCount}
                            <span class="absolute -top-1.5 -right-1.5 bg-cyan-400 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
                        {/if}
                    </button>
                </div>

                <!-- Buscador rápido (siempre visible) -->
                <div class="relative w-full md:w-64">
                    <input
                        type="text"
                        placeholder="Buscar participante..."
                        bind:value={searchQuery}
                        class="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl pl-3 pr-8 py-1.5 text-xs text-white placeholder-gray-500 outline-none transition-all"
                    />
                    {#if searchQuery}
                        <button
                            onclick={() => searchQuery = ''}
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                        >✕</button>
                    {/if}
                </div>
            </div>

            <!-- Body scrollable -->
            <div class="flex-1 overflow-y-auto p-5 md:p-6">
                {#if activeTab === 'analysis'}
                    <!-- Pestaña de Análisis de Datos -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {#each STAT_COLUMNS as col}
                            {@const sd = getStatData(col.key)}
                            <div class="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                                <h3 class="text-sm font-bold {col.color} uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                    <span>{col.emoji}</span> {col.title}
                                </h3>
                                <div class="space-y-3">
                                    {#each sd.items.slice(0, 5) as item}
                                        {@const f = col.isTeam ? getFlagData(item.value) : null}
                                        <button
                                            onclick={() => toggleFilter(col.key, item.value)}
                                            class="w-full text-left group flex flex-col gap-1.5 p-2 rounded-xl hover:bg-white/5 transition-all
                                                {sd.filter === item.value ? 'bg-cyan-500/10 border border-cyan-500/30' : ''}"
                                        >
                                            <div class="flex items-center justify-between text-xs">
                                                <div class="flex items-center gap-2 font-medium truncate flex-1">
                                                    {#if f}<img src={f.flag} alt="" class="h-3.5 w-5 rounded-sm ring-1 ring-white/10" />{/if}
                                                    <span class="group-hover:text-cyan-400 transition-colors truncate">{f?.spanishName || item.value}</span>
                                                </div>
                                                <span class="text-gray-400 font-bold ml-2 shrink-0">{item.count} voto{item.count !== 1 ? 's' : ''}</span>
                                            </div>
                                            <div class="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                                <div class="{col.barColor} h-full rounded-full" style="width: {item.pct}%"></div>
                                            </div>
                                        </button>
                                    {/each}
                                    {#if sd.items.length === 0}
                                        <p class="text-xs text-gray-600 italic">Sin datos</p>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="mt-6 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center justify-between">
                        <div class="text-xs text-cyan-200">
                            💡 Haz click en cualquier equipo o goleador para filtrar los participantes que lo eligieron.
                        </div>
                        <button
                            class="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                            onclick={() => { activeTab = 'list'; clearFilters(); }}
                        >Ver todos</button>
                    </div>
                {:else}
                    <!-- Pestaña de Listado de Participantes -->
                    {#if activeFilterCount}
                        <div class="mb-4 flex flex-wrap gap-2 items-center">
                            <span class="text-xs text-gray-500">Filtros activos:</span>
                            {#if filterChampion}
                                <span class="bg-amber-400/10 text-amber-300 border border-amber-400/20 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    🏆 Campeón: {filterChampion}
                                    <button onclick={() => filterChampion = ''} class="hover:text-white font-mono ml-1">×</button>
                                </span>
                            {/if}
                            {#if filterRunnerup}
                                <span class="bg-slate-400/10 text-slate-300 border border-slate-400/20 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    🥈 Subcampeón: {filterRunnerup}
                                    <button onclick={() => filterRunnerup = ''} class="hover:text-white font-mono ml-1">×</button>
                                </span>
                            {/if}
                            {#if filterThirdplace}
                                <span class="bg-orange-400/10 text-orange-300 border border-orange-400/20 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    🥉 Tercer puesto: {filterThirdplace}
                                    <button onclick={() => filterThirdplace = ''} class="hover:text-white font-mono ml-1">×</button>
                                </span>
                            {/if}
                            {#if filterTopscorer}
                                <span class="bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    👟 Goleador: {filterTopscorer}
                                    <button onclick={() => filterTopscorer = ''} class="hover:text-white font-mono ml-1">×</button>
                                </span>
                            {/if}
                            <button
                                onclick={clearFilters}
                                class="text-xs text-cyan-400 hover:text-cyan-300 transition-colors ml-auto"
                            >Limpiar filtros</button>
                        </div>
                    {/if}

                    {#if filteredParticipants.length === 0}
                        <div class="text-center py-12 text-gray-500">
                            <div class="text-5xl mb-3">🔍</div>
                            <p>No se encontraron participantes que coincidan con los criterios.</p>
                        </div>
                    {:else}
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {#each filteredParticipants as p}
                                <div class="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:border-cyan-500/30 transition-all hover:scale-[1.01]">
                                    <div class="flex justify-between items-start mb-3">
                                        <div class="font-bold text-sm text-cyan-300 truncate max-w-[70%]">{p.name}</div>
                                        <div class="text-[10px] text-gray-500 font-mono">{p.phone || 'Sin número'}</div>
                                    </div>

                                    <div class="space-y-2 text-xs">
                                        {#each DETAIL_ROWS as row}
                                            {@const value = row.key === 'topscorer' ? p.normalizedTopscorer : p[row.key]}
                                            {@const f = row.isTeam ? getFlagData(value) : null}
                                            <div class="flex items-center justify-between bg-white/[0.02] p-1.5 rounded-lg">
                                                <span class="text-gray-500">{row.emoji} {row.label}</span>
                                                <div class="flex items-center gap-1.5 font-semibold {row.color}">
                                                    {#if f}<img src={f.flag} alt="" class="h-3 w-4.5 rounded-sm ring-1 ring-white/10" />{/if}
                                                    <span>{f?.spanishName || value || '—'}</span>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
</div>
