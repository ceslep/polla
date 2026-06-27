<script>
    import { pwaSession, markSubmitted, setStep, logout } from '../../pwa/session.svelte.js';
    import { savePwaBet } from '../../api.js';
    import { firstMatchTimeCot } from '../../pwa/window.js';
    import { getFlagData } from '../../flags.js';
    import PwaMatchDetail from './PwaMatchDetail.svelte';

    /**
     * @type {{
     *   windowState: any,
     *   onDone: (savedCount: number, infoMessage?: string) => void,
     *   isDev?: boolean,
     *   existingBets?: any[],
     *   tournamentBets?: {champion: string|null, runnerup: string|null, thirdplace: string|null, topscorer: string|null} | null,
     *   mode?: 'normal' | 'root',
     *   targetParticipant?: { name: string, phone: string } | null,
     *   onRootComplete?: () => void,
     *   onRootCancel?: () => void
     * }}
     */
    let {
        windowState,
        onDone,
        isDev = false,
        existingBets = [],
        tournamentBets = null,
        mode = 'normal',
        targetParticipant = null,
        onRootComplete = () => {},
        onRootCancel = () => {}
    } = $props();

    /** Partido seleccionado para ver detalle (null = ninguno). */
    let selectedMatch = $state(/** @type {any} */ (null));

    /** @type {Record<number, {home: number|null, away: number|null}>} */
    let scores = $state({});

    let submitting = $state(false);
    let error = $state('');
    let showConfirmModal = $state(false);

    const matches = $derived(windowState.matches || []);
    const isRootMode = $derived(mode === 'root' && targetParticipant !== null);
    /** En root mode el header dice "Apostando como X"; en modo normal,
     *  "Hola, X" (donde X es el participante autenticado). */
    const headerName = $derived(
        isRootMode && targetParticipant
            ? targetParticipant.name
            : (pwaSession.authParticipant || '')
    );
    const headerLabel = $derived(isRootMode ? 'Apostando como' : 'Hola,');
    const windowStillOpen = $derived(windowState?.status === 'open');

    /** True cuando el participante ya tiene bets guardados hoy: el form se
     *  renderiza en read-only con los marcadores prellenados y sin botón
     *  Enviar. PwaApp.svelte setea `existingBets` tras el check post-auth. */
    const readOnly = $derived(Array.isArray(existingBets) && existingBets.length > 0);

    // Popular `scores` con los marcadores de los bets existentes al entrar
    // en read-only. Se hace en un $effect (no en derivación) porque mutar
    // un $state desde una derivación es inválido en Svelte 5.
    $effect(() => {
        if (!readOnly) return;
        /** @type {Record<number, {home: number|null, away: number|null}>} */
        const next = {};
        for (const b of existingBets) {
            next[b.matchId] = { home: b.homeScore, away: b.awayScore };
        }
        scores = next;
    });

    /**
     * @param {number} matchId
     * @param {'home'|'away'} side
     * @param {Event} e
     */
    function handleScoreInput(matchId, side, e) {
        const t = /** @type {HTMLInputElement} */ (e.target);
        const v = t.value;
        if (v === '') {
            scores[matchId] = { ...(scores[matchId] || {}), [side]: null };
        } else {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0 && n <= 9) {
                scores[matchId] = { ...(scores[matchId] || {}), [side]: n };
            }
        }
    }

    /**
     * @param {number} matchId
     */
    function isMatchComplete(matchId) {
        const s = scores[matchId];
        return s && s.home !== null && s.home !== undefined
            && s.away !== null && s.away !== undefined;
    }

    const filledCount = $derived.by(() => {
        let n = 0;
        for (const m of matches) {
            if (isMatchComplete(m.id)) n++;
        }
        return n;
    });

    const allFilled = $derived(matches.length > 0 && filledCount === matches.length);
    const progressPercent = $derived(matches.length === 0 ? 0 : Math.round((filledCount / matches.length) * 100));

    /**
     * @param {string} team
     */
    function flagFor(team) {
        return getFlagData(team);
    }

    function openConfirm() {
        if (!allFilled || submitting) return;
        if (!windowStillOpen && !isDev) {
            error = 'La ventana de apuestas se cerró mientras llenabas el formulario.';
            return;
        }
        if (!pwaSession.authUsername || !pwaSession.authPassword) {
            error = 'Sesión inválida. Vuelve a iniciar sesión.';
            logout();
            return;
        }
        showConfirmModal = true;
    }

    function closeConfirm() {
        if (submitting) return;
        showConfirmModal = false;
    }

    async function confirmSubmit() {
        submitting = true;
        error = '';
        try {
            const bets = matches.map(/** @param {any} m */ (m) => ({
                matchId: m.id,
                homeTeam: m.homeTeam || m.team1,
                awayTeam: m.awayTeam || m.team2,
                homeScore: scores[m.id].home,
                awayScore: scores[m.id].away
            }));

            const result = await savePwaBet({
                date: windowState.date,
                firstMatchTime: firstMatchTimeCot(windowState) || '00:00',
                username: pwaSession.authUsername || '',
                password: pwaSession.authPassword || '',
                dev: isDev,
                ...(isRootMode && targetParticipant
                    ? { rootMode: true, targetPhone: targetParticipant.phone }
                    : {}),
                bets
            });
            showConfirmModal = false;

            // Detección de duplicados: el backend es idempotente y devuelve
            // alreadyExists > 0 si todos (o algunos) bets ya estaban guardados.
            const saved = result.saved ?? 0;
            const alreadyExists = result.alreadyExists ?? 0;
            const allDuplicates = saved === 0 && alreadyExists > 0;
            const someDuplicates = saved > 0 && alreadyExists > 0;

            if (isRootMode) {
                // En root mode no marcamos submitted del participante (el root
                // está apostando por otro, no por sí mismo). Simplemente
                // delegamos al padre (logout + volver al landing).
                onRootComplete();
                return;
            }

            if (allDuplicates) {
                // Defensa extra: el form no debería verse después de submit,
                // pero si llegamos acá, mostrar mensaje y saltar a done.
                markSubmitted();
                onDone(alreadyExists, 'Ya enviaste tus apuestas hoy. Solo lectura.');
                return;
            }

            markSubmitted();
            if (someDuplicates) {
                // Mezcla: se guardaron algunos pero otros ya existían.
                // Mostrar mensaje via PwaDone no es trivial, pero al menos
                // marcamos submitted y dejamos que el done muestre los bets guardados.
            }
            onDone(saved);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Error desconocido';
            error = msg;
            showConfirmModal = false;
        } finally {
            submitting = false;
        }
    }
</script>

<div class="min-h-screen relative overflow-hidden text-white">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-30 animate-gradient"
        style="background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.20), transparent 60%);"
    ></div>

    <!-- Sticky progress bar -->
    <div class="sticky top-0 z-30 glass-strong border-b border-white/5">
        <div class="max-w-2xl mx-auto px-4 py-3">
            <div class="flex items-center justify-between gap-3 mb-2">
                <div class="flex-1 min-w-0">
                    <div class="text-xs text-gray-400">{headerLabel} <span class="text-white font-semibold">{headerName}</span></div>
                    <div class="text-xs text-gray-500">{windowState.date} · {matches.length} partido{matches.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black {allFilled ? 'text-emerald-400' : 'text-cyan-400'}">{filledCount}<span class="text-gray-500 text-sm">/{matches.length}</span></div>
                    <div class="text-[10px] uppercase tracking-wider text-gray-500">{progressPercent}%</div>
                </div>
                <button
                    class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5"
                    onclick={logout}
                    aria-label="Cerrar sesión"
                    title="Cerrar sesión"
                >⏻</button>
            </div>
            <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                    class="h-full transition-all duration-500 ease-out rounded-full {allFilled ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'}"
                    style="width: {progressPercent}%"
                ></div>
            </div>
        </div>
    </div>

    <div class="max-w-2xl mx-auto px-4 py-6 pb-32 animate-fade-in">
        {#if isRootMode}
            <div class="mb-4 glass border-amber-500/40 ring-1 ring-amber-500/20 rounded-2xl p-4 text-center animate-slide-down">
                <div class="text-3xl mb-1">🔧</div>
                <div class="text-amber-200 text-sm font-bold mb-1">Modo root — apostando a nombre de {targetParticipant?.name || '?'}</div>
                <div class="text-amber-300/70 text-xs">
                    Los marcadores se guardarán como <strong class="text-amber-200">{targetParticipant?.name || '?'}</strong> y la confirmación llegará al admin.
                </div>
            </div>
        {/if}

        {#if readOnly}
            <div class="mb-4 glass border-emerald-500/40 ring-1 ring-emerald-500/20 rounded-2xl p-4 text-center animate-slide-down">
                <div class="text-3xl mb-1">🔒</div>
                <div class="text-emerald-200 text-sm font-bold mb-1">Ya enviaste tus apuestas</div>
                <div class="text-emerald-300/70 text-xs">
                    Tus marcadores de {windowState.date} son <strong class="text-emerald-200">inmutables</strong> — no se pueden modificar.
                </div>
            </div>
        {/if}

        {#if tournamentBets && (tournamentBets.champion || tournamentBets.runnerup || tournamentBets.thirdplace || tournamentBets.topscorer)}
            <div class="mb-4 glass rounded-3xl p-4 animate-slide-down">
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-lg">🏆</span>
                    <span class="text-sm font-bold">Apuestas de torneo</span>
                    <span class="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-full px-2 py-0.5">🔒 No editable</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    {#each [{ emoji: '🥇', label: 'Campeón', value: tournamentBets.champion, team: true }, { emoji: '🥈', label: 'Subcampeón', value: tournamentBets.runnerup, team: true }, { emoji: '🥉', label: 'Tercer lugar', value: tournamentBets.thirdplace, team: true }, { emoji: '👟', label: 'Goleador', value: tournamentBets.topscorer, team: false }] as item (item.label)}
                        {@const tf = item.team && item.value ? flagFor(item.value) : null}
                        <div class="bg-white/5 rounded-2xl px-3 py-2 min-w-0">
                            <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{item.emoji} {item.label}</div>
                            <div class="flex items-center gap-1.5 min-w-0">
                                {#if tf}<img src={tf.flag} alt="" class="h-3.5 w-5 rounded-sm ring-1 ring-white/10 shrink-0" />{/if}
                                <span class="font-semibold text-sm truncate">{(tf?.spanishName) || item.value || '–'}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if !windowStillOpen && !isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-sm text-center animate-slide-down">
                ⚠️ La ventana de apuestas no está abierta. No podrás enviar.
            </div>
        {/if}

        {#if isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-xs text-center animate-slide-down">
                ⚙️ DEV MODE — ventana siempre abierta · envío real a Sheets
            </div>
        {/if}

        <div class="space-y-3" data-pwa-tutorial="matches">
            {#each matches as m (m.id)}
                {@const s = scores[m.id] || { home: null, away: null }}
                {@const complete = isMatchComplete(m.id)}
                {@const homeFlag = flagFor(m.homeTeam || m.team1 || '')}
                {@const awayFlag = flagFor(m.awayTeam || m.team2 || '')}
                <div class="glass rounded-3xl p-4 transition-all {complete ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} {complete ? 'animate-pulse-once' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <!-- Home team -->
                        <div class="flex-1 flex items-center justify-end gap-2 text-right min-w-0">
                            <div class="min-w-0">
                                <div class="font-bold text-sm md:text-base truncate">{homeFlag?.spanishName || (m.homeTeam || m.team1)}</div>
                                <div class="text-[10px] text-gray-500 truncate">{m.homeTeam || m.team1}</div>
                            </div>
                            {#if homeFlag}
                                <img src={homeFlag.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />
                            {/if}
                        </div>

                        <!-- Score inputs / read-only display -->
                        <div class="flex items-center gap-1.5 shrink-0" data-pwa-tutorial="inputs">
                            {#if readOnly}
                                <div class="w-28 h-16 flex items-center justify-center text-3xl font-black tabular-nums text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 rounded-2xl">
                                    {s.home ?? '–'} <span class="text-gray-500 px-1">—</span> {s.away ?? '–'}
                                </div>
                            {:else}
                                <input
                                    type="number"
                                    inputmode="numeric"
                                    min="0"
                                    max="9"
                                    value={s.home ?? ''}
                                    oninput={(e) => handleScoreInput(m.id, 'home', e)}
                                    class="w-14 h-16 text-center text-3xl font-black bg-white/5 border-2 {complete ? 'border-emerald-500/50 text-emerald-300' : 'border-white/10 text-white'} rounded-2xl outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all"
                                />
                                <span class="text-gray-600 text-xl font-light px-0.5">—</span>
                                <input
                                    type="number"
                                    inputmode="numeric"
                                    min="0"
                                    max="9"
                                    value={s.away ?? ''}
                                    oninput={(e) => handleScoreInput(m.id, 'away', e)}
                                    class="w-14 h-16 text-center text-3xl font-black bg-white/5 border-2 {complete ? 'border-emerald-500/50 text-emerald-300' : 'border-white/10 text-white'} rounded-2xl outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all"
                                />
                            {/if}
                        </div>

                        <!-- Away team -->
                        <div class="flex-1 flex items-center gap-2 min-w-0">
                            {#if awayFlag}
                                <img src={awayFlag.flag} alt="" class="h-5 w-7 rounded-sm ring-1 ring-white/10 shrink-0" />
                            {/if}
                            <div class="min-w-0">
                                <div class="font-bold text-sm md:text-base truncate">{awayFlag?.spanishName || (m.awayTeam || m.team2)}</div>
                                <div class="text-[10px] text-gray-500 truncate">{m.awayTeam || m.team2}</div>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/5">
                        <span class="text-[10px] text-gray-500">⏰ {m.time}</span>
                        <span class="text-[10px] text-gray-500 truncate ml-2 flex-1">{m.ground || ''}</span>
                        {#if complete}
                            <span class="text-[10px] text-emerald-400 font-semibold animate-fade-in mr-2">✓ Listo</span>
                        {/if}
                        <button
                            class="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/40 rounded-lg text-cyan-400 text-xs transition-all shrink-0"
                            onclick={() => selectedMatch = m}
                            title="Ver detalles del partido"
                            aria-label="Ver detalles"
                        >ℹ</button>
                    </div>
                </div>
            {/each}
        </div>

        {#if error}
            <div class="mt-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 text-sm text-center animate-slide-down">
                ⚠️ {error}
            </div>
        {/if}
    </div>

    <!-- Sticky bottom CTA -->
    <div class="fixed bottom-0 left-0 right-0 z-30 glass-strong border-t border-white/10">
        <div class="max-w-2xl mx-auto px-4 py-3">
            {#if readOnly}
                <div class="flex gap-2">
                    <button
                        class="flex-1 py-4 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
                        onclick={() => isRootMode ? onRootCancel() : setStep('landing')}
                    >
                        ← Volver
                    </button>
                    <button
                        class="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold shadow-xl shadow-emerald-500/30 transition-all min-h-12"
                        onclick={logout}
                    >
                        Cerrar sesión
                    </button>
                </div>
            {:else if isRootMode}
                <div class="flex gap-2">
                    <button
                        class="flex-1 py-4 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
                        onclick={onRootCancel}
                    >
                        ← Volver al panel
                    </button>
                    <button
                        class="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-lg font-black shadow-xl shadow-emerald-500/30 transition-all min-h-14 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                        onclick={openConfirm}
                        disabled={!allFilled || submitting || (!windowStillOpen && !isDev)}
                    >
                        {#if submitting}
                            <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            Enviando…
                        {:else if allFilled}
                            ✓ Apostar por {targetParticipant?.name || '?'}
                        {:else}
                            {filledCount} de {matches.length} marcadores listos
                        {/if}
                    </button>
                </div>
            {:else}
                <button
                    class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white text-lg font-black shadow-xl shadow-emerald-500/30 transition-all min-h-14 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    onclick={openConfirm}
                    disabled={!allFilled || submitting || (!windowStillOpen && !isDev)}
                    data-pwa-tutorial="submit"
                >
                    {#if submitting}
                        <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Enviando…
                    {:else if allFilled}
                        ✓ Enviar {matches.length} apuesta{matches.length !== 1 ? 's' : ''}
                    {:else}
                        {filledCount} de {matches.length} marcadores listos
                    {/if}
                </button>
            {/if}
        </div>
    </div>

    <!-- Confirm modal -->
    {#if showConfirmModal}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
            class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
            onclick={closeConfirm}
            onkeydown={(e) => { if (e.key === 'Escape' && !submitting) closeConfirm(); }}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
        >
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
            <div
                class="w-full max-w-lg glass-strong rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 max-h-[85vh] flex flex-col animate-slide-up"
                onclick={(e) => e.stopPropagation()}
                role="presentation"
            >
                <div class="p-5 md:p-6 border-b border-white/10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl">⚽</div>
                        <div>
                            <h3 class="font-bold text-lg">Confirmar apuestas</h3>
                            <p class="text-xs text-gray-400">{windowState.date} · {matches.length} partido{matches.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-5 md:p-6 space-y-2">
                    {#each matches as m (m.id)}
                        {@const s = scores[m.id] || { home: 0, away: 0 }}
                        {@const homeFlag = flagFor(m.homeTeam || m.team1 || '')}
                        {@const awayFlag = flagFor(m.awayTeam || m.team2 || '')}
                        <div class="flex items-center gap-3 bg-white/5 rounded-2xl px-3 py-2.5">
                            <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
                                <span class="font-semibold text-sm truncate">{homeFlag?.spanishName || m.homeTeam || m.team1}</span>
                                {#if homeFlag}
                                    <img src={homeFlag.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />
                                {/if}
                            </div>
                            <div class="font-black text-xl text-emerald-400 tabular-nums shrink-0">{s.home} – {s.away}</div>
                            <div class="flex-1 flex items-center gap-2 min-w-0">
                                {#if awayFlag}
                                    <img src={awayFlag.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />
                                {/if}
                                <span class="font-semibold text-sm truncate">{awayFlag?.spanishName || m.awayTeam || m.team2}</span>
                            </div>
                        </div>
                    {/each}
                </div>

                <div class="p-5 md:p-6 border-t border-white/10 space-y-2">
                    <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-amber-200 text-xs text-center">
                        🔒 Una vez enviadas <strong>no se pueden modificar</strong>.
                    </div>
                    <div class="flex gap-2">
                        <button
                            class="flex-1 py-3 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all"
                            onclick={closeConfirm}
                            disabled={submitting}
                        >
                            Cancelar
                        </button>
                        <button
                            class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            onclick={confirmSubmit}
                            disabled={submitting}
                        >
                            {#if submitting}
                                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Enviando…
                            {:else}
                                ✓ Confirmar y enviar
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

{#if selectedMatch}
    <PwaMatchDetail match={selectedMatch} onClose={() => selectedMatch = null} />
{/if}
