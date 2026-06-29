<script>
    import { onMount } from 'svelte';
    import { pwaSession, logout } from '../../pwa/session.svelte.js';
    import { saveTournamentBets, getTournamentBetsForParticipant } from '../../api.js';
    import { loadSquads } from '../../pwa/squads.js';
    import { getFlagData } from '../../flags.js';

    /** @type {{ onComplete: (bets: {champion: string, runnerup: string, thirdplace: string, topscorer: string}) => void }} */
    let { onComplete } = $props();

    let champion = $state('');
    let runnerup = $state('');
    let thirdplace = $state('');
    let topscorer = $state('');

    let loading = $state(true);
    let loadError = $state('');
    let loadingExisting = $state(true);
    let existingError = $state('');
    let saving = $state(false);
    let error = $state('');

    /** @type {Record<string, boolean>} */
    let locked = $state({ champion: false, runnerup: false, thirdplace: false, topscorer: false });
    let openMenu = $state('');
    /** Filtro de búsqueda dentro del menú abierto (solo-UX). */
    let menuQuery = $state('');

    /** @type {string[]} */
    let teams = $state([]);
    /** @type {Array<{ name: string, team: string }>} */
    let players = $state([]);

    onMount(async () => {
        try {
            const squads = await loadSquads();
            teams = squads
                .map((s) => s.name)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));

            /** @type {Array<{ name: string, team: string }>} */
            const nextPlayers = [];
            /** @type {Set<string>} */
            const seen = new Set();
            for (const squad of squads) {
                for (const player of squad.players || []) {
                    if (!player?.name) continue;
                    const key = `${squad.name}::${player.name}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    nextPlayers.push({ name: player.name, team: squad.name || '' });
                }
            }
            players = nextPlayers.sort((a, b) => a.name.localeCompare(b.name));
        } catch {
            loadError = 'No se pudieron cargar las plantillas. Revisa tu conexión e intenta de nuevo.';
        } finally {
            loading = false;
        }
    });

    onMount(async () => {
        try {
            const current = await getTournamentBetsForParticipant(
                pwaSession.authParticipant || '',
                pwaSession.authPhone || undefined
            );
            if (current.champion) {
                champion = current.champion;
                locked.champion = true;
            }
            if (current.runnerup) {
                runnerup = current.runnerup;
                locked.runnerup = true;
            }
            if (current.thirdplace) {
                thirdplace = current.thirdplace;
                locked.thirdplace = true;
            }
            if (current.topscorer) {
                topscorer = current.topscorer;
                locked.topscorer = true;
            }
        } catch {
            existingError = 'No se pudo verificar si ya tenías apuestas guardadas.';
        } finally {
            loadingExisting = false;
        }
    });

    const distinctTeams = $derived(
        !champion || !runnerup || !thirdplace
            ? true
            : (champion !== runnerup && champion !== thirdplace && runnerup !== thirdplace)
    );

    const allFilled = $derived(Boolean(champion && runnerup && thirdplace && topscorer));
    const valid = $derived(allFilled && distinctTeams);

    /* ── Derivados solo-display (no alteran la lógica de guardado) ── */

    /** Nº de campos completos (0–4) para la barra de progreso. */
    const filledCount = $derived(
        [champion, runnerup, thirdplace, topscorer].filter(Boolean).length
    );

    /** Opciones de equipo normalizadas para los selects de podio. */
    const teamOptions = $derived(
        teams.map((t) => {
            const f = getFlagData(t);
            return {
                value: t,
                primary: f?.spanishName || t,
                secondary: '',
                flagTeam: t,
                search: `${f?.spanishName || ''} ${t}`.toLowerCase()
            };
        })
    );

    /** Opciones de jugador normalizadas para el select de goleador. */
    const playerOptions = $derived(
        players.map((p) => {
            const f = getFlagData(p.team);
            return {
                value: p.name,
                primary: p.name,
                secondary: f?.spanishName || p.team,
                flagTeam: p.team,
                search: `${p.name} ${f?.spanishName || p.team}`.toLowerCase()
            };
        })
    );

    /** @param {string} team */
    function flagFor(team) {
        return getFlagData(team);
    }

    /** @param {string} menu */
    function toggleMenu(menu) {
        openMenu = openMenu === menu ? '' : menu;
        menuQuery = '';
    }

    function closeMenus() {
        openMenu = '';
        menuQuery = '';
    }

    /**
     * Asigna el valor seleccionado al campo correspondiente.
     * @param {string} key @param {string} val
     */
    function selectValue(key, val) {
        if (key === 'champion') champion = val;
        else if (key === 'runnerup') runnerup = val;
        else if (key === 'thirdplace') thirdplace = val;
        else if (key === 'topscorer') topscorer = val;
        openMenu = '';
        menuQuery = '';
    }

    /**
     * Filtra opciones por el término de búsqueda del menú (solo-UX).
     * @param {Array<{value:string, primary:string, secondary:string, flagTeam:string, search:string}>} options
     */
    function filterOptions(options) {
        const q = menuQuery.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.search.includes(q));
    }

    async function submit() {
        if (!valid || saving) return;
        if (!pwaSession.authParticipant || !pwaSession.authPhone) {
            error = 'Sesión inválida. Vuelve a iniciar sesión.';
            logout();
            return;
        }
        saving = true;
        error = '';
        try {
            await saveTournamentBets({
                participant: pwaSession.authParticipant,
                phone: pwaSession.authPhone,
                champion,
                runnerup,
                thirdplace,
                topscorer,
                timestamp: new Date().toISOString()
            });

            const check = await getTournamentBetsForParticipant(
                pwaSession.authParticipant,
                pwaSession.authPhone || undefined
            );
            if (!check.hasAll) {
                error = 'El guardado no se confirmó completo. Intenta de nuevo.';
                saving = false;
                return;
            }
            onComplete({ champion, runnerup, thirdplace, topscorer });
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error desconocido al guardar.';
        } finally {
            saving = false;
        }
    }
</script>

<svelte:window onclick={closeMenus} />

<!--
  Tarjeta de selección reutilizable (campeón/subcampeón/tercero/goleador).
  @param cfg.key         clave del campo
  @param cfg.step        número de paso (1–4)
  @param cfg.icon        emoji
  @param cfg.label       etiqueta
  @param cfg.value       valor actual
  @param cfg.locked      ¿guardado/fijo?
  @param cfg.options     opciones normalizadas
  @param cfg.placeholder texto vacío
  @param cfg.dropUp      ¿menú hacia arriba?
  @param cfg.conflict    ¿choca con otro equipo (display)?
-->
{#snippet field(/** @type {{key:string, step:number, icon:string, label:string, value:string, locked:boolean, options:Array<{value:string, primary:string, secondary:string, flagTeam:string, search:string}>, placeholder:string, dropUp:boolean, conflict:boolean}} */ cfg)}
    {@const sel = cfg.options.find((o) => o.value === cfg.value)}
    {@const selFlag = sel ? flagFor(sel.flagTeam) : null}
    {@const isOpen = openMenu === cfg.key}
    <div
        class="group glass rounded-3xl p-4 relative overflow-visible transition-all duration-200 {cfg.value ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-white/5'} {cfg.conflict ? '!border-amber-500/50 !ring-amber-500/30' : ''} {cfg.locked ? 'opacity-95' : ''} {isOpen ? 'z-10 scale-[1.01]' : ''}"
    >
        <div class="flex items-center gap-2.5 mb-2.5">
            <div class="w-8 h-8 flex items-center justify-center rounded-xl text-lg flex-shrink-0 transition-all {cfg.value ? 'bg-emerald-500/20 ring-1 ring-emerald-500/30' : 'bg-white/5 ring-1 ring-white/10'}">
                {cfg.icon}
            </div>
            <div class="flex flex-col min-w-0">
                <span class="text-[10px] uppercase tracking-wider text-gray-500 leading-none">Paso {cfg.step} de 4</span>
                <span class="text-sm font-bold leading-tight">{cfg.label}</span>
            </div>
            {#if cfg.locked}
                <span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">🔒 Fijo</span>
            {:else if cfg.value}
                <span class="ml-auto w-6 h-6 flex items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-black animate-scale-in">✓</span>
            {/if}
        </div>

        <button
            type="button"
            class="w-full custom-select flex items-center justify-between gap-3 transition-all {cfg.value ? 'is-filled' : ''} {isOpen ? 'is-open' : ''}"
            disabled={cfg.locked}
            onclick={(e) => { e.stopPropagation(); toggleMenu(cfg.key); }}
        >
            {#if sel}
                <span class="flex items-center gap-2.5 min-w-0">
                    {#if selFlag}<img src={selFlag.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                    <span class="flex flex-col min-w-0 text-left">
                        <span class="truncate font-semibold">{sel.primary}</span>
                        {#if sel.secondary}<span class="truncate text-[11px] text-gray-400">{sel.secondary}</span>{/if}
                    </span>
                </span>
            {:else}
                <span class="text-gray-400">{cfg.placeholder}</span>
            {/if}
            <span class="text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}">▾</span>
        </button>

        {#if isOpen}
            <div
                class="absolute left-4 right-4 z-[80] rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 overflow-hidden animate-slide-down {cfg.dropUp ? 'bottom-[calc(100%-0.5rem)] mb-2' : 'top-[calc(100%-0.5rem)] mt-2'}"
            >
                <!-- Buscador dentro del menú -->
                <div class="sticky top-0 bg-gray-950/95 backdrop-blur-sm p-2 border-b border-white/5">
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                        type="text"
                        placeholder="🔍 Buscar…"
                        bind:value={menuQuery}
                        autofocus
                        onclick={(e) => e.stopPropagation()}
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-emerald-500/50"
                    />
                </div>
                <div class="max-h-64 overflow-auto overscroll-contain">
                    {#each filterOptions(cfg.options) as o (o.value + '::' + o.flagTeam)}
                        {@const of = flagFor(o.flagTeam)}
                        <button
                            type="button"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-emerald-500/10 transition-colors {o.value === cfg.value ? 'bg-emerald-500/15' : ''}"
                            onclick={(e) => { e.stopPropagation(); selectValue(cfg.key, o.value); }}
                        >
                            {#if of}<img src={of.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                            <span class="flex flex-col min-w-0">
                                <span class="truncate text-sm">{o.primary}</span>
                                {#if o.secondary}<span class="truncate text-[11px] text-gray-400">{o.secondary}</span>{/if}
                            </span>
                            {#if o.value === cfg.value}<span class="ml-auto text-emerald-400">✓</span>{/if}
                        </button>
                    {:else}
                        <div class="px-4 py-6 text-center text-sm text-gray-500">Sin resultados</div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
{/snippet}

<div class="min-h-screen relative overflow-hidden text-white">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div class="absolute inset-0 -z-10 opacity-30 animate-gradient" style="background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.20), transparent 60%);"></div>
    <div class="pointer-events-none absolute -top-24 -right-16 w-72 h-72 -z-10 bg-cyan-500/10 blur-[90px] rounded-full"></div>

    <!-- Header con progreso integrado -->
    <div class="sticky top-0 z-30 glass-strong border-b border-white/5">
        <div class="max-w-2xl mx-auto px-4 py-3">
            <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-xs text-gray-400">Hola, <span class="text-white font-semibold">{pwaSession.authParticipant || ''}</span></div>
                    <div class="text-sm font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">🏆 Apuestas de torneo</div>
                </div>
                <button class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5" onclick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">⏻</button>
            </div>
            <!-- Barra de progreso -->
            {#if !loading && !loadError}
                <div class="mt-2.5 flex items-center gap-2">
                    <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500" style:width="{(filledCount / 4) * 100}%"></div>
                    </div>
                    <span class="text-[11px] font-bold tabular-nums {filledCount === 4 ? 'text-emerald-400' : 'text-gray-400'}">{filledCount}/4</span>
                </div>
            {/if}
        </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-6 pb-32 animate-fade-in">
        <div class="mb-5 glass border-emerald-500/40 ring-1 ring-emerald-500/20 rounded-2xl p-4 flex items-start gap-3 animate-slide-down">
            <div class="text-2xl flex-shrink-0">⚽</div>
            <div class="min-w-0">
                <div class="text-emerald-200 text-sm font-bold mb-0.5">Antes de apostar marcadores</div>
                <div class="text-emerald-300/70 text-xs leading-relaxed">
                    Registra tus apuestas del torneo. Son <strong class="text-emerald-200">obligatorias</strong> y, una vez guardadas, <strong class="text-emerald-200">no se pueden modificar</strong>.
                </div>
            </div>
        </div>

        {#if loading}
            <div class="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                <span class="w-8 h-8 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin"></span>
                <span class="text-sm">Cargando equipos y jugadores…</span>
            </div>
        {:else if loadError}
            <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 text-sm text-center animate-slide-down">⚠️ {loadError}</div>
        {:else}
            {#if existingError}
                <div class="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-amber-200 text-sm text-center animate-slide-down">⚠️ {existingError}</div>
            {/if}

            <div class="space-y-3">
                {@render field({ key: 'champion', step: 1, icon: '🥇', label: 'Campeón', value: champion, locked: locked.champion, options: teamOptions, placeholder: 'Selecciona un equipo…', dropUp: false, conflict: !distinctTeams && Boolean(champion) })}
                {@render field({ key: 'runnerup', step: 2, icon: '🥈', label: 'Subcampeón', value: runnerup, locked: locked.runnerup, options: teamOptions, placeholder: 'Selecciona un equipo…', dropUp: false, conflict: !distinctTeams && Boolean(runnerup) })}
                {@render field({ key: 'thirdplace', step: 3, icon: '🥉', label: 'Tercer lugar', value: thirdplace, locked: locked.thirdplace, options: teamOptions, placeholder: 'Selecciona un equipo…', dropUp: false, conflict: !distinctTeams && Boolean(thirdplace) })}
                {@render field({ key: 'topscorer', step: 4, icon: '👟', label: 'Goleador', value: topscorer, locked: locked.topscorer, options: playerOptions, placeholder: 'Selecciona un jugador…', dropUp: true, conflict: false })}
            </div>

            {#if !distinctTeams}
                <div class="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-amber-200 text-sm text-center animate-slide-down">
                    ⚠️ Campeón, subcampeón y tercer lugar deben ser equipos distintos.
                </div>
            {/if}

            {#if error}
                <div class="mt-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 text-sm text-center animate-slide-down">⚠️ {error}</div>
            {/if}
        {/if}
    </div>

    {#if !loading && !loadError}
        <div class="fixed bottom-0 left-0 right-0 z-30 glass-strong border-t border-white/10">
            <div class="max-w-2xl mx-auto px-4 py-3">
                <button class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-lg font-black shadow-xl shadow-emerald-500/30 transition-all min-h-14 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2" onclick={submit} disabled={!valid || saving || loadingExisting}>
                    {#if saving}
                        <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Guardando…
                    {:else if loadingExisting}
                        <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Verificando…
                    {:else if valid}
                        ✓ Guardar lo faltante y continuar
                    {:else}
                        Completa las apuestas pendientes ({filledCount}/4)
                    {/if}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .custom-select {
        width: 100%;
        min-height: 3.25rem;
        padding: 0.75rem 1rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 1rem;
        background: #111827;
        color: white;
    }
    .custom-select.is-filled {
        border-color: rgba(16, 185, 129, 0.35);
        background: #0f1f1a;
    }
    .custom-select.is-open {
        border-color: rgba(16, 185, 129, 0.6);
    }
    .custom-select:disabled {
        cursor: not-allowed;
        opacity: 0.85;
    }
</style>
