<script>
    import { pwaSession, setStep, logout } from '../../pwa/session.svelte.js';
    import { getPwaBets, getPwaBetsParte2 } from '../../api.js';
    import { isParte2Date } from '../../pwa/window.js';
    import { getFlagData } from '../../flags.js';

    /**
     * @type {{
     *   date: string,
     *   savedCount: number,
     *   infoMessage?: string,
     *   isDev?: boolean,
     *   mode?: 'success' | 'already-submitted'
     * }}
     */
    let { date, savedCount, infoMessage = '', isDev = false, mode = 'success' } = $props();

    const isAlreadySubmitted = $derived(mode === 'already-submitted');

    let loading = $state(false);
    /** @type {Array<any>} */
    let bets = $state([]);

    /** @type {Array<{left: number, delay: number, duration: number, color: string}>} */
    const confetti = $derived.by(() => {
        const colors = ['#10b981', '#06b6d4', '#fbbf24', '#f472b6', '#a78bfa', '#34d399'];
        /** @type {Array<{left: number, delay: number, duration: number, color: string}>} */
        const out = [];
        for (let i = 0; i < 40; i++) {
            out.push({
                left: Math.random() * 100,
                delay: Math.random() * 1.5,
                duration: 2.5 + Math.random() * 2,
                color: colors[i % colors.length]
            });
        }
        return out;
    });

    $effect(() => {
        if (pwaSession.authUsername && pwaSession.authPassword && date) {
            load();
        }
    });

    async function load() {
        loading = true;
        try {
            // Desde PARTE2_CUTOFF la jornada vive en `apuestas2`: recuperar de ahí.
            const readFn = isParte2Date(date) ? getPwaBetsParte2 : getPwaBets;
            const result = await readFn({
                username: pwaSession.authUsername || '',
                password: pwaSession.authPassword || '',
                matchDate: date
            });
            bets = result.bets || [];
        } catch (e) {
            console.error('No pude cargar las apuestas:', e);
        } finally {
            loading = false;
        }
    }

    /** @param {string} team */
    function flagFor(team) {
        return getFlagData(team);
    }
</script>

<div class="min-h-screen relative overflow-hidden text-white p-4 md:p-8 flex flex-col items-center">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-30 animate-gradient"
        style="background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.30), transparent 60%), radial-gradient(circle at 50% 100%, rgba(251, 191, 36, 0.15), transparent 60%);"
    ></div>

    <!-- Confetti (solo en modo éxito: tras enviar recién. En 'already-submitted'
         no tiene sentido celebrar otra vez.) -->
    {#if !isAlreadySubmitted}
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0">
            {#each confetti as c}
                <div
                    class="absolute w-2 h-3 rounded-sm"
                    style="left: {c.left}%; top: -5%; background: {c.color}; animation: confetti-fall {c.duration}s linear {c.delay}s forwards; transform-origin: center;"
                ></div>
            {/each}
        </div>
    {/if}

    <div class="w-full max-w-2xl relative animate-fade-in">
        <div class="text-center mb-6 pt-6">
            {#if isAlreadySubmitted}
                <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/20 ring-2 ring-cyan-500/40 mb-4 animate-pulse-ring">
                    <span class="text-5xl">🔒</span>
                </div>
                <h2 class="text-3xl md:text-4xl font-black text-white mb-2">Ya enviaste tus apuestas</h2>
                <p class="text-gray-300">
                    Tus marcadores de hoy son <strong class="text-cyan-300">inmutables</strong>. Esta es tu apuesta guardada
                    {isDev ? '(simulado)' : `para el ${date}`}.
                </p>
            {:else}
                <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40 mb-4 animate-pulse-ring">
                    <span class="text-5xl">✅</span>
                </div>
                <h2 class="text-3xl md:text-4xl font-black text-emerald-400 mb-2">¡Apuestas registradas!</h2>
                <p class="text-gray-300">
                    {savedCount} marcador{savedCount !== 1 ? 'es' : ''} enviado{savedCount !== 1 ? 's' : ''} {isDev ? '(simulado)' : `para el ${date}`}
                </p>
            {/if}
        </div>

        {#if isDev}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-sm text-center animate-slide-down">
                ⚙️ DEV MODE — apuestas persistidas (ventana bypassed)
            </div>
        {/if}

        {#if infoMessage}
            <div class="mb-4 glass border-amber-500/40 rounded-2xl p-3 text-amber-200 text-sm text-center font-medium animate-slide-down">
                ℹ️ {infoMessage}
            </div>
        {/if}

        <div class="glass-strong rounded-3xl p-6 space-y-4 shadow-2xl shadow-black/40">
            <h3 class="font-bold text-emerald-400 text-lg flex items-center gap-2">
                <span>⚽</span> Tus marcadores
            </h3>

            {#if loading}
                <div class="flex items-center justify-center gap-2 py-6 text-gray-400">
                    <span class="w-5 h-5 border-2 border-gray-500/30 border-t-emerald-400 rounded-full animate-spin"></span>
                    Cargando…
                </div>
            {:else if bets.length === 0}
                <p class="text-gray-500 text-center py-4">No se pudieron recuperar las apuestas guardadas.</p>
            {:else}
                <div class="space-y-2">
                    {#each bets as b (b.id)}
                        {@const homeFlag = flagFor(b.homeTeam)}
                        {@const awayFlag = flagFor(b.awayTeam)}
                        <div class="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3 animate-slide-up">
                            <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
                                <span class="font-semibold text-sm truncate">{homeFlag?.spanishName || b.homeTeam}</span>
                                {#if homeFlag}
                                    <img src={homeFlag.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />
                                {/if}
                            </div>
                            <div class="font-black text-2xl text-emerald-400 tabular-nums shrink-0">{b.homeScore} – {b.awayScore}</div>
                            <div class="flex-1 flex items-center gap-2 min-w-0">
                                {#if awayFlag}
                                    <img src={awayFlag.flag} alt="" class="h-4 w-6 rounded-sm ring-1 ring-white/10 shrink-0" />
                                {/if}
                                <span class="font-semibold text-sm truncate">{awayFlag?.spanishName || b.awayTeam}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="mt-6 glass border-amber-500/30 rounded-2xl p-4 text-center">
            <p class="text-amber-200 text-sm">
                🔒 <strong>Inmutables.</strong> No es posible modificarlas una vez enviadas.
            </p>
        </div>

        <div class="mt-6 flex flex-col gap-3">
            <button
                class="w-full py-4 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
                onclick={() => setStep('history')}
            >
                📅 Ver apuestas de otros días
            </button>
            <button
                class="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold shadow-xl shadow-emerald-500/30 transition-all min-h-12"
                onclick={logout}
            >
                Cerrar sesión
            </button>
        </div>
    </div>
</div>
