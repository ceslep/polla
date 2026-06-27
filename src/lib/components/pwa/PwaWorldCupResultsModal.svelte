<script>
  import { loadWorldCupMatches } from "../../api.js";
  import { getFlagData } from "../../flags.js";
  import { matchLocalToCot, nowCotParts } from "../../pwa/window.js";

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
  let selectedFilter = $state("all");
  let expandedMatch = $state(/** @type {number | null} */ (null));
  let teamSearch = $state("");
  /** @type {string | null} */
  let selectedTeamForWins = $state(null);
  let showStandings = $state(false);

  const groupFilters = [
    { key: "Group A", label: "A" },
    { key: "Group B", label: "B" },
    { key: "Group C", label: "C" },
    { key: "Group D", label: "D" },
    { key: "Group E", label: "E" },
    { key: "Group F", label: "F" },
    { key: "Group G", label: "G" },
    { key: "Group H", label: "H" },
    { key: "Group I", label: "I" },
    { key: "Group J", label: "J" },
    { key: "Group K", label: "K" },
    { key: "Group L", label: "L" },
  ];

  const knockoutFilters = [
    { key: "all", label: "Todos" },
    { key: "Round of 32", label: "16vos" },
    { key: "Round of 16", label: "8vos" },
    { key: "Quarter-final", label: "4tos" },
    { key: "Semi-final", label: "Semi" },
    { key: "Match for third place", label: "3er Lugar" },
    { key: "Final", label: "Final" },
  ];

  /**
   * Orden cronológico de las rondas del mundial 2026, de más reciente
   * (Final = índice 0) a más antiguo (Matchday 1). El sort usa este array
   * para decidir quién va primero dentro de cada bucket.
   *
   * Los matchdays de grupo se ordenan por número (1..20). El 20 es un
   * techo seguro: el 2026 tiene ~12 matchdays de grupos pero se deja
   * margen por si el JSON trae más.
   */
  const MATCHDAY_ORDER = [
    "Final",
    "Match for third place",
    "Semi-final",
    "Quarter-final",
    "Round of 16",
    "Round of 32",
    ...Array.from({ length: 20 }, (_, i) => `Matchday ${20 - i}`),
  ];

  /**
   * Índice cronológico de un round (0 = Final, el más reciente).
   * Devuelve null si el round no está reconocido — el sort pone esos al
   * final de su bucket.
   * @param {string|undefined} round
   * @returns {number|null}
   */
  function matchdayIndex(round) {
    if (!round) return null;
    const idx = MATCHDAY_ORDER.indexOf(round);
    return idx === -1 ? null : idx;
  }

  /** Día actual en COT (YYYY-MM-DD). Se usa para bucketear pendientes. */
  const todayCot = $derived(nowCotParts(new Date()).date);

  /**
   * Fecha COT (YYYY-MM-DD) del partido. Fallback a m.date si no parsea.
   * @param {any} m
   */
  function cotDateOf(m) {
    return matchLocalToCot(m.date, m.time)?.cotDate || m.date;
  }

  /**
   * Hora de inicio en COT (HH:MM). Vacío si no parsea.
   * @param {any} m
   */
  function cotKickoff(m) {
    return matchLocalToCot(m.date, m.time)?.cotTime || "";
  }

  /**
   * Bucket del partido:
   *   0 = pendiente del día actual (COT)
   *   1 = finalizado (de cualquier día)
   *   2 = pendiente de otro día
   * @param {any} m
   * @param {string} cotDate
   */
  function bucket(m, cotDate) {
    if (m.score?.ft != null) return 1;
    return cotDate === todayCot ? 0 : 2;
  }

  /**
   * Estado visual del partido.
   * @param {any} m
   * @returns {'finished' | 'today' | 'tbd' | 'pending'}
   */
  function matchState(m) {
    if (m.score?.ft != null) return "finished";
    if (isTbd(m.team1) || isTbd(m.team2)) return "tbd";
    return cotDateOf(m) === todayCot ? "today" : "pending";
  }

  const uniqueTeams = $derived(() => {
    const teams = new Set();
    matches.forEach((m) => {
      if (!isTbd(m.team1)) teams.add(m.team1);
      if (!isTbd(m.team2)) teams.add(m.team2);
    });
    return [...teams].sort();
  });

  /** Totales para los chips del header. */
  const overallStats = $derived.by(() => {
    let finished = 0;
    let today = 0;
    matches.forEach((m) => {
      const s = matchState(m);
      if (s === "finished") finished++;
      else if (s === "today") today++;
    });
    return { total: matches.length, finished, today };
  });

  /** Equipo resuelto desde el texto de búsqueda (para el botón de victorias). */
  const searchedTeam = $derived.by(() => {
    const s = teamSearch.trim().toLowerCase();
    if (!s) return null;
    return (
      uniqueTeams().find((t) =>
        teamMatchesSearch(/** @type {string} */ (t), s),
      ) || null
    );
  });

  const filteredMatches = $derived.by(() => {
    let result = [...matches];

    if (selectedFilter === "all") {
      // No additional filter
    } else if (selectedFilter.startsWith("Group ")) {
      result = result.filter((m) => m.group === selectedFilter);
    } else {
      result = result.filter((m) => m.round === selectedFilter);
    }

    if (teamSearch.trim()) {
      const search = teamSearch.toLowerCase().trim();
      result = result.filter(
        (m) =>
          teamMatchesSearch(m.team1, search) ||
          teamMatchesSearch(m.team2, search),
      );
    }

    // Pre-computar COT date y bucket para cada match (memoizado dentro del $derived).
    /** @type {{m: any, bucket: number, utcMs: number, matchdayIdx: number|null}[]} */
    const enriched = result.map((m) => {
      const cot = matchLocalToCot(m.date, m.time);
      const cotDate = cot?.cotDate || m.date;
      const utcMs =
        cot?.utcMs ??
        new Date(`${m.date}T${(m.time || "00:00").split(" ")[0]}`).getTime();
      return {
        m,
        bucket: bucket(m, cotDate),
        utcMs,
        matchdayIdx: matchdayIndex(m.round),
      };
    });

    enriched.sort((a, b) => {
      // 1) Bucket primero: pendiente-hoy → finalizados → pendiente-otros.
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;

      // 2) Mismo bucket: por matchday desc, desconocido al final.
      if (a.matchdayIdx == null && b.matchdayIdx == null) {
        return b.utcMs - a.utcMs;
      }
      if (a.matchdayIdx == null) return 1;
      if (b.matchdayIdx == null) return -1;
      if (a.matchdayIdx !== b.matchdayIdx) return a.matchdayIdx - b.matchdayIdx;

      // 3) Mismo matchday: desempate por fecha+hora desc.
      return b.utcMs - a.utcMs;
    });

    return enriched.map((e) => e.m);
  });

  const statsByGroup = $derived.by(() => {
    /** @type {Record<string, {total: number, finished: number}>} */
    const groups = {};
    matches.forEach((m) => {
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
  function getSpanishTeamName(teamName) {
    if (!teamName) return "";
    const data = getFlagData(teamName);
    return data?.spanishName || teamName;
  }

  /** Solo la URL de la bandera (o '' si no hay). @param {string} teamName */
  function flagUrl(teamName) {
    if (!teamName || isTbd(teamName)) return "";
    return getFlagData(teamName)?.flag || "";
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
    if (!teamCode) return "";
    if (teamCode.startsWith("W") || teamCode.startsWith("L")) {
      return teamCode;
    }
    if (teamCode.match(/^\d[A-Z]$/)) {
      const num = teamCode[0];
      const letter = teamCode[1];
      const groupNames = /** @type {Record<string, string>} */ ({
        A: "A",
        B: "B",
        C: "C",
        D: "D",
        E: "E",
        F: "F",
        G: "G",
        H: "H",
        I: "I",
        J: "J",
        K: "K",
        L: "L",
      });
      const position = num === "1" ? "1°" : "2°";
      return `${position} Grupo ${groupNames[letter] || letter}`;
    }
    return teamCode;
  }

  /** @param {string} dateStr */
  function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  /** @param {string} dateStr */
  function formatDate(dateStr) {
    const date = parseLocalDate(dateStr) || new Date(dateStr);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
    });
  }

  /** @param {string} teamName */
  function isTbd(teamName) {
    if (!teamName) return true;
    return (
      teamName.startsWith("W") ||
      teamName.startsWith("L") ||
      teamName.match(/^\d[A-Z]$/)
    );
  }

  function toggleMatch(/** @type {number} */ index) {
    expandedMatch = expandedMatch === index ? null : index;
  }

  function selectTeam(/** @type {string} */ team) {
    teamSearch = team;
  }

  function clearTeamSearch() {
    teamSearch = "";
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
    return matches
      .filter((m) => {
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
      })
      .sort((a, b) => {
        const dateTimeA = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
        return dateTimeB - dateTimeA;
      });
  });

  const selectedTeamStats = $derived.by(() => {
    if (!selectedTeamForWins) return null;
    const wins = teamWins;
    const teamLower = selectedTeamForWins.toLowerCase();
    return {
      total: wins.length,
      goalsFor: wins.reduce((sum, m) => {
        const t1 = m.team1.toLowerCase();
        if (t1.includes(teamLower) || teamLower.includes(t1))
          return sum + (m.score?.ft[0] ?? 0);
        return sum + (m.score?.ft[1] ?? 0);
      }, 0),
      goalsAgainst: wins.reduce((sum, m) => {
        const t1 = m.team1.toLowerCase();
        if (t1.includes(teamLower) || teamLower.includes(t1))
          return sum + (m.score?.ft[1] ?? 0);
        return sum + (m.score?.ft[0] ?? 0);
      }, 0),
    };
  });

  $effect(() => {
    loadMatches();
  });

  const groupStandings = $derived.by(() => {
    /** @type {Record<string, Record<string, {pj: number, pg: number, pp: number, pe: number, gf: number, gc: number, gd: number, pts: number}>>} */
    const standings = {};

    matches
      .filter((m) => m.group && m.score?.ft)
      .forEach((m) => {
        const group = /** @type {string} */ (m.group);
        if (!standings[group]) standings[group] = {};

        [m.team1, m.team2].forEach((team, i) => {
          if (!standings[group][team]) {
            standings[group][team] = {
              pj: 0,
              pg: 0,
              pp: 0,
              pe: 0,
              gf: 0,
              gc: 0,
              gd: 0,
              pts: 0,
            };
          }
          const s = standings[group][team];
          s.pj++;
          const ft =
            /** @type {{ft: [number, number], ht: [number, number]}} */ (
              m.score
            ).ft;
          const goalsFor = i === 0 ? ft[0] : ft[1];
          const goalsAgainst = i === 0 ? ft[1] : ft[0];
          s.gf += goalsFor;
          s.gc += goalsAgainst;
          if (goalsFor > goalsAgainst) {
            s.pg++;
            s.pts += 3;
          } else if (goalsFor < goalsAgainst) {
            s.pp++;
          } else {
            s.pe++;
            s.pts += 1;
          }
        });
      });

    Object.values(standings).forEach((group) => {
      Object.values(group).forEach((s) => {
        s.gd = s.gf - s.gc;
      });
    });

    return standings;
  });

  async function loadMatches() {
    isLoading = true;
    error = null;
    try {
      matches = await loadWorldCupMatches();
    } catch (err) {
      error = err instanceof Error ? err.message : "Error cargando partidos";
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
  role="dialog"
  tabindex="-1"
  onclick={onClose}
  onkeydown={(e) => e.key === "Escape" && onClose()}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="relative bg-gray-900 text-white border border-white/10 rounded-3xl w-full max-w-6xl max-h-[96vh] overflow-hidden shadow-2xl flex flex-col animate-scale-in"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- ===== Header ===== -->
    <div
      class="relative flex-shrink-0 overflow-hidden border-b border-white/10"
    >
      <!-- Atmósfera: gradiente mesh sutil detrás del header -->
      <div
        class="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10"
      ></div>
      <div
        class="pointer-events-none absolute -top-16 -right-10 w-56 h-56 bg-emerald-500/10 blur-3xl rounded-full"
      ></div>
      <div
        class="pointer-events-none absolute -top-20 -left-10 w-56 h-56 bg-cyan-500/10 blur-3xl rounded-full"
      ></div>

      <div class="relative p-3 md:p-5 flex justify-between items-center gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-2xl md:text-3xl animate-float">🏆</span>
            <h2
              class="text-xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-white to-emerald-300 bg-clip-text text-transparent truncate"
            >
              Mundial 2026
            </h2>
          </div>
          <!-- Chips de stats -->
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              class="text-[11px] md:text-xs font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300"
            >
              {overallStats.total} partidos
            </span>
            <span
              class="text-[11px] md:text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-300"
            >
              ✅ {overallStats.finished} jugados
            </span>
            {#if overallStats.today > 0}
              <span
                class="text-[11px] md:text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 animate-glow-pulse"
              >
                ⚡ {overallStats.today} hoy
              </span>
            {/if}
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            class="px-3 py-2 md:px-4 md:py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all border {showStandings
              ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/40'
              : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'}"
            onclick={() => (showStandings = !showStandings)}
          >
            {showStandings ? "⚽ Partidos" : "📊 Posiciones"}
          </button>
          <button
            class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 text-xl transition-all"
            onclick={onClose}
            aria-label="Cerrar">&times;</button
          >
        </div>
      </div>
    </div>

    <!-- ===== Scrollable body ===== -->
    <div class="flex-1 overflow-y-auto">
      {#if !showStandings}
        <!-- Sticky filter bar -->
        <div
          class="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-md border-b border-white/10"
        >
          <!-- Round / group pills (scrollable horizontal on all sizes) -->
          <div
            class="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto no-scrollbar"
          >
            <button
              class="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border {selectedFilter ===
              'all'
                ? 'bg-cyan-600 border-cyan-400 text-white'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'}"
              onclick={() => (selectedFilter = "all")}
            >
              🌐 Todos
            </button>
            <span class="flex-shrink-0 w-px h-6 bg-white/10 mx-0.5"></span>
            {#each groupFilters as gf}
              {@const groupStats = statsByGroup[gf.key]}
              <button
                class="relative flex-shrink-0 w-10 h-10 rounded-xl font-black text-sm transition-all border {selectedFilter ===
                gf.key
                  ? 'bg-cyan-600 border-cyan-400 text-white scale-105'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}"
                onclick={() => (selectedFilter = gf.key)}
                title="{gf.key}{groupStats
                  ? `: ${groupStats.finished}/${groupStats.total}`
                  : ''}"
              >
                {gf.label}
                {#if groupStats && groupStats.finished < groupStats.total}
                  <span
                    class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full ring-2 ring-gray-900"
                  ></span>
                {/if}
              </button>
            {/each}
            <span class="flex-shrink-0 w-px h-6 bg-white/10 mx-0.5"></span>
            {#each knockoutFilters.filter((f) => f.key !== "all") as kf}
              <button
                class="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border {selectedFilter ===
                kf.key
                  ? 'bg-cyan-600 border-cyan-400 text-white'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}"
                onclick={() => (selectedFilter = kf.key)}
              >
                {kf.label}
              </button>
            {/each}
          </div>

          <!-- Search -->
          <div class="px-3 pb-2.5 flex items-center gap-2">
            <div class="flex-1 relative">
              <span
                class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none"
                >🔍</span
              >
              <input
                type="text"
                placeholder="Buscar selección..."
                class="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-500 focus:bg-white/10 transition-all"
                bind:value={teamSearch}
              />
              {#if teamSearch}
                <button
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  onclick={clearTeamSearch}
                  aria-label="Limpiar"
                >
                  ✕
                </button>
              {/if}
            </div>
            {#if searchedTeam}
              <button
                class="flex-shrink-0 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25 transition-all whitespace-nowrap"
                onclick={() =>
                  showTeamWins(/** @type {string} */ (searchedTeam))}
                title="Ver victorias"
              >
                🏆 Victorias
              </button>
            {/if}
            <span
              class="flex-shrink-0 text-xs font-semibold text-gray-400 px-2 tabular-nums"
            >
              {filteredMatches.length}
            </span>
          </div>

          <!-- Team quick filters (scrollable) -->
          {#if teamSearch.length === 0 && uniqueTeams().length > 0}
            <div class="flex gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar">
              {#each uniqueTeams() as team}
                {@const url = flagUrl(/** @type {string} */ (team))}
                <button
                  class="flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-gray-200 transition-all"
                  onclick={() => selectTeam(/** @type {string} */ (team))}
                  title={getSpanishTeamName(/** @type {string} */ (team))}
                >
                  {#if url}<img
                      src={url}
                      class="h-4 w-6 rounded-sm flex-shrink-0"
                      alt=""
                    />{/if}
                  <span class="whitespace-nowrap"
                    >{getSpanishTeamName(/** @type {string} */ (team))}</span
                  >
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Content -->
      <div class="p-3 md:p-4">
        {#if isLoading}
          <div class="space-y-3">
            <div class="flex flex-col items-center justify-center py-6 gap-3">
              <div
                class="animate-spin rounded-full h-10 w-10 border-2 border-white/10 border-t-cyan-500"
              ></div>
              <span class="text-gray-400 text-sm">Cargando partidos...</span>
            </div>
            {#each Array(4) as _}
              <div
                class="h-24 rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden"
              >
                <div class="absolute inset-0 animate-shimmer"></div>
              </div>
            {/each}
          </div>
        {:else if error}
          <div class="text-center py-12 animate-fade-in">
            <div class="text-5xl mb-4">⚠️</div>
            <p class="text-red-400 mb-2">Error: {error}</p>
            <button
              class="mt-4 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white font-semibold transition-all"
              onclick={loadMatches}
            >
              Reintentar
            </button>
          </div>
        {:else if showStandings}
          <!-- ===== Standings ===== -->
          {#if Object.keys(groupStandings).length === 0}
            <div class="text-center py-12 animate-fade-in">
              <div class="text-5xl mb-4">📊</div>
              <p class="text-gray-400">Sin datos de posiciones disponibles</p>
            </div>
          {:else}
            <div class="space-y-5">
              {#each Object.entries(groupStandings).sort() as [group, teams]}
                {@const sorted = Object.entries(teams).sort(
                  (a, b) =>
                    b[1].pts - a[1].pts ||
                    b[1].gd - a[1].gd ||
                    b[1].gf - a[1].gf,
                )}
                <div
                  class="bg-white/5 rounded-2xl border border-white/10 overflow-hidden animate-fade-in"
                >
                  <div
                    class="px-4 py-3 bg-gradient-to-r from-emerald-700/40 via-emerald-800/20 to-transparent border-b border-white/10 flex items-center gap-2"
                  >
                    <span class="text-lg">🏅</span>
                    <h3 class="font-black text-emerald-300 tracking-wide">
                      {group}
                    </h3>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[520px]">
                      <thead class="sticky top-0">
                        <tr
                          class="text-gray-400 text-[11px] uppercase tracking-wider bg-gray-900/80"
                        >
                          <th class="text-left px-4 py-2.5">Selección</th>
                          <th class="px-2 py-2.5">PJ</th>
                          <th class="px-2 py-2.5">PG</th>
                          <th class="px-2 py-2.5">PE</th>
                          <th class="px-2 py-2.5">PP</th>
                          <th class="px-2 py-2.5">GF</th>
                          <th class="px-2 py-2.5">GC</th>
                          <th class="px-2 py-2.5">DG</th>
                          <th class="px-2 py-2.5 font-bold text-emerald-400"
                            >Pts</th
                          >
                        </tr>
                      </thead>
                      <tbody class="stagger-children">
                        {#each sorted as [team, stats], idx}
                          {@const url = flagUrl(team)}
                          <tr
                            class="border-t border-white/5 {idx < 2
                              ? 'bg-gradient-to-r from-emerald-500/10 to-transparent'
                              : ''}"
                            style="--i:{idx}"
                          >
                            <td class="px-4 py-2.5">
                              <div class="flex items-center gap-2.5">
                                <span
                                  class="w-5 text-center text-xs font-bold {idx <
                                  2
                                    ? 'text-amber-400'
                                    : 'text-gray-500'}">{idx + 1}</span
                                >
                                {#if url}<img
                                    src={url}
                                    class="h-5 w-7 rounded-sm flex-shrink-0"
                                    alt=""
                                  />{/if}
                                <span class="truncate font-medium"
                                  >{getSpanishTeamName(team)}</span
                                >
                                {#if idx < 2}<span
                                    class="text-[10px] text-emerald-400">▲</span
                                  >{/if}
                              </div>
                            </td>
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.pj}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.pg}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.pe}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.pp}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.gf}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center text-gray-300 tabular-nums"
                              >{stats.gc}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center tabular-nums {stats.gd >
                              0
                                ? 'text-emerald-400'
                                : stats.gd < 0
                                  ? 'text-red-400'
                                  : 'text-gray-400'}"
                              >{stats.gd > 0 ? "+" : ""}{stats.gd}</td
                            >
                            <td
                              class="px-2 py-2.5 text-center font-black text-emerald-400 tabular-nums"
                              >{stats.pts}</td
                            >
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else if filteredMatches.length === 0}
          <div class="text-center py-12 animate-fade-in">
            <div class="text-5xl mb-4">🔍</div>
            <p class="text-gray-400">No hay partidos para este filtro</p>
            {#if teamSearch}
              <button
                class="mt-3 text-cyan-400 hover:text-cyan-300 font-medium"
                onclick={clearTeamSearch}
              >
                Limpiar búsqueda
              </button>
            {/if}
          </div>
        {:else}
          <!-- ===== Matches list ===== -->
          <div class="space-y-2.5 stagger-children">
            {#each filteredMatches as match, idx}
              {@const isExpanded = expandedMatch === idx}
              {@const state = matchState(match)}
              {@const team1Tbd = isTbd(match.team1)}
              {@const team2Tbd = isTbd(match.team2)}
              {@const ft = match.score?.ft}
              {@const t1Win = ft ? ft[0] > ft[1] : false}
              {@const t2Win = ft ? ft[1] > ft[0] : false}
              {@const url1 = flagUrl(match.team1)}
              {@const url2 = flagUrl(match.team2)}
              {@const kickoff = cotKickoff(match)}
              {@const hasGoals = match.goals1?.length || match.goals2?.length}
              <div
                class="rounded-2xl border overflow-hidden transition-all hover:border-white/25 {state ===
                'today'
                  ? 'border-amber-400/40 bg-gradient-to-r from-amber-400/10 to-transparent animate-glow-pulse'
                  : state === 'finished'
                    ? 'border-emerald-500/20 bg-gradient-to-r from-emerald-900/25 to-transparent'
                    : 'border-white/10 bg-white/[0.03]'}"
                style="--i:{idx}"
              >
                <button
                  type="button"
                  class="w-full text-left p-3.5 md:p-4 cursor-pointer appearance-none border-0 bg-transparent"
                  onclick={() => toggleMatch(idx)}
                >
                  <!-- Meta row -->
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span
                        class="bg-cyan-500/15 text-cyan-300 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide whitespace-nowrap"
                      >
                        {match.round}
                      </span>
                      {#if match.group}
                        <span
                          class="bg-white/10 text-gray-300 text-[10px] md:text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap"
                        >
                          {match.group}
                        </span>
                      {/if}
                      {#if state === "finished"}
                        <span
                          class="bg-emerald-500/20 text-emerald-300 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                          >✅ Final</span
                        >
                      {:else if state === "today"}
                        <span
                          class="bg-amber-400/25 text-amber-200 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                          >⚡ Hoy</span
                        >
                      {:else if state === "tbd"}
                        <span
                          class="bg-yellow-500/15 text-yellow-300 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                          >⏳ Por definir</span
                        >
                      {:else}
                        <span
                          class="bg-orange-500/15 text-orange-300 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                          >🕐 Pendiente</span
                        >
                      {/if}
                    </div>
                    <div
                      class="flex items-center gap-2 md:gap-3 text-[11px] md:text-xs text-gray-400 flex-shrink-0"
                    >
                      <span class="whitespace-nowrap"
                        >📅 {formatDate(match.date)}</span
                      >
                      {#if kickoff}
                        <span
                          class="whitespace-nowrap font-semibold text-gray-300"
                          title="Hora Colombia (COT)">🕐 {kickoff}</span
                        >
                      {/if}
                    </div>
                  </div>

                  <!-- Teams + score: single responsive 3-col grid -->
                  <div
                    class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4"
                  >
                    <!-- Team 1 -->
                    <div
                      class="flex items-center gap-2 min-w-0 {ft && t2Win
                        ? 'opacity-50'
                        : ''}"
                    >
                      {#if !team1Tbd}
                        {#if url1}<img
                            src={url1}
                            class="h-6 w-9 md:h-7 md:w-10 rounded-sm flex-shrink-0 shadow"
                            alt=""
                          />{/if}
                        <span
                          class="font-bold text-sm md:text-lg truncate {t1Win
                            ? 'text-white'
                            : 'text-gray-200'}"
                          >{getSpanishTeamName(match.team1)}</span
                        >
                      {:else}
                        <span
                          class="font-bold text-sm md:text-base text-yellow-500 truncate"
                          >{translateTeamCode(match.team1)}</span
                        >
                      {/if}
                      {#if t1Win}<span
                          class="text-amber-400 text-xs flex-shrink-0">🏆</span
                        >{/if}
                    </div>

                    <!-- Score -->
                    <div
                      class="flex items-center justify-center gap-2 md:gap-3 px-1 flex-shrink-0"
                    >
                      {#if ft}
                        <span
                          class="text-3xl md:text-4xl font-black tabular-nums animate-number-pop {t1Win
                            ? 'text-cyan-300'
                            : 'text-gray-500'}">{ft[0]}</span
                        >
                        <span class="text-lg md:text-2xl text-gray-600">-</span>
                        <span
                          class="text-3xl md:text-4xl font-black tabular-nums animate-number-pop {t2Win
                            ? 'text-cyan-300'
                            : 'text-gray-500'}">{ft[1]}</span
                        >
                      {:else}
                        <span
                          class="text-base md:text-xl font-light text-gray-500 px-2"
                          >vs</span
                        >
                      {/if}
                    </div>

                    <!-- Team 2 -->
                    <div
                      class="flex items-center justify-end gap-2 min-w-0 {ft &&
                      t1Win
                        ? 'opacity-50'
                        : ''}"
                    >
                      {#if t2Win}<span
                          class="text-amber-400 text-xs flex-shrink-0">🏆</span
                        >{/if}
                      {#if !team2Tbd}
                        <span
                          class="font-bold text-sm md:text-lg truncate text-right {t2Win
                            ? 'text-white'
                            : 'text-gray-200'}"
                          >{getSpanishTeamName(match.team2)}</span
                        >
                        {#if url2}<img
                            src={url2}
                            class="h-6 w-9 md:h-7 md:w-10 rounded-sm flex-shrink-0 shadow"
                            alt=""
                          />{/if}
                      {:else}
                        <span
                          class="font-bold text-sm md:text-base text-yellow-500 truncate text-right"
                          >{translateTeamCode(match.team2)}</span
                        >
                      {/if}
                    </div>
                  </div>

                  <!-- Footer: stadium + HT + expand hint -->
                  <div
                    class="mt-3 flex items-center justify-between gap-2 text-[11px] text-gray-500"
                  >
                    <span class="truncate">🏟️ {match.ground}</span>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      {#if match.score?.ht}
                        <span
                          class="bg-white/5 px-2 py-0.5 rounded-full whitespace-nowrap"
                          >HT {match.score.ht[0]}-{match.score.ht[1]}</span
                        >
                      {/if}
                      {#if hasGoals}
                        <span class="text-cyan-400/70"
                          >{isExpanded ? "▲ goles" : "▼ goles"}</span
                        >
                      {/if}
                    </div>
                  </div>
                </button>

                {#if isExpanded && ft && hasGoals}
                  <div
                    class="border-t border-white/10 p-4 bg-black/30 animate-slide-down"
                  >
                    <div class="grid grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <div
                          class="text-[11px] text-gray-400 uppercase tracking-wider mb-2 truncate"
                        >
                          {getSpanishTeamName(match.team1)}
                        </div>
                        {#if match.goals1?.length}
                          {#each match.goals1 as goal}
                            <div
                              class="text-sm text-gray-300 py-1 flex items-center gap-2.5"
                            >
                              <span
                                class="bg-cyan-500/20 text-cyan-300 font-mono text-[11px] px-1.5 py-0.5 rounded"
                                >{goal.minute}'</span
                              >
                              <span class="truncate">⚽ {goal.name}</span>
                            </div>
                          {/each}
                        {:else}
                          <div class="text-gray-600 text-sm italic">
                            Sin goles
                          </div>
                        {/if}
                      </div>
                      <div>
                        <div
                          class="text-[11px] text-gray-400 uppercase tracking-wider mb-2 text-right truncate"
                        >
                          {getSpanishTeamName(match.team2)}
                        </div>
                        {#if match.goals2?.length}
                          {#each match.goals2 as goal}
                            <div
                              class="text-sm text-gray-300 py-1 flex items-center justify-end gap-2.5"
                            >
                              <span class="truncate">{goal.name} ⚽</span>
                              <span
                                class="bg-cyan-500/20 text-cyan-300 font-mono text-[11px] px-1.5 py-0.5 rounded"
                                >{goal.minute}'</span
                              >
                            </div>
                          {/each}
                        {:else}
                          <div class="text-gray-600 text-sm italic text-right">
                            Sin goles
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- ===== Footer ===== -->
    <div
      class="p-3 md:p-4 border-t border-white/10 flex justify-between items-center flex-shrink-0 bg-black/20"
    >
      <div class="text-[11px] text-gray-500 truncate">
        Fuente: openfootball · 🕐 hora Colombia
      </div>
      <button
        class="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-all flex-shrink-0"
        onclick={onClose}
      >
        Cerrar
      </button>
    </div>

    <!-- ===== Team Wins Overlay ===== -->
    {#if selectedTeamForWins}
      {@const url = flagUrl(selectedTeamForWins)}
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div
        class="absolute inset-0 z-20 flex flex-col bg-gray-900 animate-slide-up"
      >
        <!-- Overlay header -->
        <div
          class="relative flex-shrink-0 border-b border-white/10 overflow-hidden"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-emerald-500/10"
          ></div>
          <div
            class="relative p-3 md:p-5 flex items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3 min-w-0">
              <button
                class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/15 transition-all flex-shrink-0"
                onclick={clearTeamWins}
                aria-label="Volver"
              >
                ←
              </button>
              {#if url}<img
                  src={url}
                  class="h-9 w-12 rounded-sm shadow flex-shrink-0"
                  alt=""
                />{/if}
              <div class="min-w-0">
                <h3 class="text-base md:text-xl font-black text-white truncate">
                  {getSpanishTeamName(selectedTeamForWins)}
                </h3>
                {#if selectedTeamStats}
                  <p class="text-xs md:text-sm text-gray-400">
                    <span class="text-amber-400 font-bold"
                      >{selectedTeamStats.total}</span
                    >
                    victorias ·
                    <span class="text-emerald-400 font-semibold"
                      >{selectedTeamStats.goalsFor}</span
                    >
                    GF /
                    <span class="text-red-400 font-semibold"
                      >{selectedTeamStats.goalsAgainst}</span
                    > GC
                  </p>
                {/if}
              </div>
            </div>
            <button
              class="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all flex-shrink-0"
              onclick={clearTeamWins}
            >
              Cerrar
            </button>
          </div>
        </div>

        <!-- Overlay body -->
        <div class="flex-1 overflow-y-auto p-3 md:p-4">
          {#if teamWins.length === 0}
            <div class="text-center py-12 animate-fade-in">
              <div class="text-5xl mb-4">😔</div>
              <p class="text-gray-400">Sin victorias registradas</p>
            </div>
          {:else}
            <div class="space-y-2.5 stagger-children">
              {#each teamWins as match, idx}
                {@const isTeam1 =
                  match.team1
                    .toLowerCase()
                    .includes(selectedTeamForWins.toLowerCase()) ||
                  selectedTeamForWins
                    .toLowerCase()
                    .includes(match.team1.toLowerCase())}
                {@const teamScore = isTeam1
                  ? match.score?.ft[0]
                  : match.score?.ft[1]}
                {@const oppScore = isTeam1
                  ? match.score?.ft[1]
                  : match.score?.ft[0]}
                {@const opponent = isTeam1 ? match.team2 : match.team1}
                {@const oppUrl = flagUrl(opponent)}
                <div
                  class="bg-gradient-to-r from-emerald-900/30 to-transparent rounded-2xl border border-emerald-500/20 p-3.5"
                  style="--i:{idx}"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      {#if oppUrl}<img
                          src={oppUrl}
                          class="h-6 w-9 rounded-sm flex-shrink-0"
                          alt=""
                        />{/if}
                      <div class="min-w-0">
                        <div
                          class="text-[11px] text-gray-500 uppercase tracking-wide"
                        >
                          vs
                        </div>
                        <div class="font-bold text-white truncate">
                          {getSpanishTeamName(opponent)}
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2.5 flex-shrink-0">
                      <span
                        class="text-2xl md:text-3xl font-black text-emerald-400 tabular-nums"
                        >{teamScore}</span
                      >
                      <span class="text-lg text-gray-600">-</span>
                      <span
                        class="text-2xl md:text-3xl font-black text-gray-500 tabular-nums"
                        >{oppScore}</span
                      >
                    </div>
                  </div>
                  <div
                    class="mt-2 flex items-center justify-between text-[11px] text-gray-500 gap-2"
                  >
                    <span class="truncate"
                      >{match.round}{match.group
                        ? ` · ${match.group}`
                        : ""}</span
                    >
                    <span class="whitespace-nowrap flex-shrink-0"
                      >📅 {formatDate(match.date)}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .no-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
</style>
