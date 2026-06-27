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

    /** @param {string} team */
    function flagFor(team) {
        return getFlagData(team);
    }

    /** @param {string} menu */
    function toggleMenu(menu) {
        openMenu = openMenu === menu ? '' : menu;
    }

    function closeMenus() {
        openMenu = '';
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

<div class="min-h-screen relative overflow-hidden text-white">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div class="absolute inset-0 -z-10 opacity-30 animate-gradient" style="background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.20), transparent 60%);"></div>

    <div class="sticky top-0 z-30 glass-strong border-b border-white/5">
        <div class="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
                <div class="text-xs text-gray-400">Hola, <span class="text-white font-semibold">{pwaSession.authParticipant || ''}</span></div>
                <div class="text-sm font-black text-emerald-400">🏆 Apuestas de torneo</div>
            </div>
            <button class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5" onclick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">⏻</button>
        </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-6 pb-32 animate-fade-in">
        <div class="mb-4 glass border-emerald-500/40 ring-1 ring-emerald-500/20 rounded-2xl p-4 text-center animate-slide-down">
            <div class="text-3xl mb-1">⚽</div>
            <div class="text-emerald-200 text-sm font-bold mb-1">Antes de apostar marcadores</div>
            <div class="text-emerald-300/70 text-xs">
                Registra tus apuestas del torneo. Son <strong class="text-emerald-200">obligatorias</strong> y, una vez guardadas, <strong class="text-emerald-200">no se pueden modificar</strong>.
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
                <!-- FIX: z-10 on the active card lifts its entire stacking context above sibling cards -->
                <div class="glass rounded-3xl p-4 {champion ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} {locked.champion ? 'opacity-95' : ''} relative overflow-visible {openMenu === 'champion' ? 'z-10' : ''}">
                    <div class="flex items-center gap-2 text-sm font-bold mb-2">
                        <span class="text-lg">🥇</span> Campeón
                        {#if locked.champion}<span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5">Fijo</span>{/if}
                    </div>
                    <button type="button" class="w-full custom-select flex items-center justify-between gap-3" disabled={locked.champion} onclick={(e) => { e.stopPropagation(); toggleMenu('champion'); }}>
                        {#if champion}
                            {@const cf = flagFor(champion)}
                            <span class="flex items-center gap-2 min-w-0">
                                {#if cf}<img src={cf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="truncate">{cf?.spanishName || champion}</span>
                            </span>
                        {:else}
                            <span class="text-gray-400">Selecciona un equipo…</span>
                        {/if}
                        <span class="text-gray-400">▾</span>
                    </button>
                    {#if openMenu === 'champion'}
                        <div class="absolute left-4 right-4 top-[calc(100%-0.5rem)] z-[80] mt-2 rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 max-h-72 overflow-auto">
                            {#each teams as t (t)}
                                {@const tf = flagFor(t)}
                                <button type="button" class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5" onclick={(e) => { e.stopPropagation(); champion = t; openMenu = ''; }}>
                                    {#if tf}<img src={tf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                    <span class="truncate">{tf?.spanishName || t}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="glass rounded-3xl p-4 {runnerup ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} {locked.runnerup ? 'opacity-95' : ''} relative overflow-visible {openMenu === 'runnerup' ? 'z-10' : ''}">
                    <div class="flex items-center gap-2 text-sm font-bold mb-2">
                        <span class="text-lg">🥈</span> Subcampeón
                        {#if locked.runnerup}<span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5">Fijo</span>{/if}
                    </div>
                    <button type="button" class="w-full custom-select flex items-center justify-between gap-3" disabled={locked.runnerup} onclick={(e) => { e.stopPropagation(); toggleMenu('runnerup'); }}>
                        {#if runnerup}
                            {@const rf = flagFor(runnerup)}
                            <span class="flex items-center gap-2 min-w-0">
                                {#if rf}<img src={rf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="truncate">{rf?.spanishName || runnerup}</span>
                            </span>
                        {:else}
                            <span class="text-gray-400">Selecciona un equipo…</span>
                        {/if}
                        <span class="text-gray-400">▾</span>
                    </button>
                    {#if openMenu === 'runnerup'}
                        <div class="absolute left-4 right-4 top-[calc(100%-0.5rem)] z-[80] mt-2 rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 max-h-72 overflow-auto">
                            {#each teams as t (t)}
                                {@const tf = flagFor(t)}
                                <button type="button" class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5" onclick={(e) => { e.stopPropagation(); runnerup = t; openMenu = ''; }}>
                                    {#if tf}<img src={tf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                    <span class="truncate">{tf?.spanishName || t}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="glass rounded-3xl p-4 {thirdplace ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} {locked.thirdplace ? 'opacity-95' : ''} relative overflow-visible {openMenu === 'thirdplace' ? 'z-10' : ''}">
                    <div class="flex items-center gap-2 text-sm font-bold mb-2">
                        <span class="text-lg">🥉</span> Tercer lugar
                        {#if locked.thirdplace}<span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5">Fijo</span>{/if}
                    </div>
                    <button type="button" class="w-full custom-select flex items-center justify-between gap-3" disabled={locked.thirdplace} onclick={(e) => { e.stopPropagation(); toggleMenu('thirdplace'); }}>
                        {#if thirdplace}
                            {@const tf = flagFor(thirdplace)}
                            <span class="flex items-center gap-2 min-w-0">
                                {#if tf}<img src={tf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="truncate">{tf?.spanishName || thirdplace}</span>
                            </span>
                        {:else}
                            <span class="text-gray-400">Selecciona un equipo…</span>
                        {/if}
                        <span class="text-gray-400">▾</span>
                    </button>
                    {#if openMenu === 'thirdplace'}
                        <div class="absolute left-4 right-4 top-[calc(100%-0.5rem)] z-[80] mt-2 rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 max-h-72 overflow-auto">
                            {#each teams as t (t)}
                                {@const tf = flagFor(t)}
                                <button type="button" class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5" onclick={(e) => { e.stopPropagation(); thirdplace = t; openMenu = ''; }}>
                                    {#if tf}<img src={tf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                    <span class="truncate">{tf?.spanishName || t}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="glass rounded-3xl p-4 {topscorer ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} {locked.topscorer ? 'opacity-95' : ''} relative overflow-visible {openMenu === 'topscorer' ? 'z-10' : ''}">
                    <div class="flex items-center gap-2 text-sm font-bold mb-2">
                        <span class="text-lg">👟</span> Goleador
                        {#if locked.topscorer}<span class="ml-auto text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5">Fijo</span>{/if}
                    </div>
                    <button type="button" class="w-full custom-select flex items-center justify-between gap-3" disabled={locked.topscorer} onclick={(e) => { e.stopPropagation(); toggleMenu('topscorer'); }}>
                        {#if topscorer}
                            {@const selectedPlayer = players.find((p) => p.name === topscorer)}
                            {@const tf = selectedPlayer ? flagFor(selectedPlayer.team) : null}
                            <span class="flex items-center gap-2 min-w-0">
                                {#if tf}<img src={tf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="truncate">{topscorer}</span>
                            </span>
                        {:else}
                            <span class="text-gray-400">Selecciona un jugador…</span>
                        {/if}
                        <span class="text-gray-400">▾</span>
                    </button>
                    {#if openMenu === 'topscorer'}
                        <div class="absolute left-4 right-4 bottom-[calc(100%-0.5rem)] z-[80] mb-2 rounded-2xl border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 max-h-72 overflow-auto">
                            {#each players as p (`${p.team}::${p.name}`)}
                                {@const pf = flagFor(p.team)}
                                <button type="button" class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5" onclick={(e) => { e.stopPropagation(); topscorer = p.name; openMenu = ''; }}>
                                    {#if pf}<img src={pf.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                    <span class="truncate">{p.name} · {pf?.spanishName || p.team}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
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
                        Completa las apuestas pendientes
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
</style>
