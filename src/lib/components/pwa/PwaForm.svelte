<script>
    import { pwaSession, markSubmitted, setStep, logout } from '../../pwa/session.svelte.js';
    import { savePwaBet } from '../../api.js';
    import { firstMatchTimeCot } from '../../pwa/window.js';

    /** @type {{ windowState: any, onDone: (savedCount: number) => void }} */
    let { windowState, onDone } = $props();

    /** @type {Record<number, {home: number|null, away: number|null}>} */
    let scores = $state({});

    let submitting = $state(false);
    let error = $state('');

    const matches = $derived(windowState.matches || []);
    const participant = $derived(pwaSession.authParticipant || '');

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
            if (!isNaN(n) && n >= 0 && n <= 99) {
                scores[matchId] = { ...(scores[matchId] || {}), [side]: n };
            }
        }
    }

    const allFilled = $derived.by(() => {
        if (matches.length === 0) return false;
        for (const m of matches) {
            const s = scores[m.id];
            if (!s || s.home === null || s.home === undefined
                || s.away === null || s.away === undefined) {
                return false;
            }
        }
        return true;
    });

    const filledCount = $derived.by(() => {
        let n = 0;
        for (const m of matches) {
            const s = scores[m.id];
            if (s && s.home !== null && s.home !== undefined
                && s.away !== null && s.away !== undefined) {
                n++;
            }
        }
        return n;
    });

    const windowStillOpen = $derived(windowState?.status === 'open');

    async function submit() {
        if (!allFilled || submitting) return;
        if (!windowStillOpen) {
            error = 'La ventana de apuestas se cerró mientras llenabas el formulario.';
            return;
        }
        if (!pwaSession.authUsername || !pwaSession.authPassword) {
            error = 'Sesión inválida. Vuelve a iniciar sesión.';
            logout();
            return;
        }
        if (!confirm(`¿Enviar tus apuestas para hoy (${windowState.date})?\n\nUna vez enviadas NO se pueden modificar.`)) {
            return;
        }
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
                username: pwaSession.authUsername,
                password: pwaSession.authPassword,
                bets
            });
            markSubmitted();
            onDone(result.saved);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Error desconocido';
            error = msg;
        } finally {
            submitting = false;
        }
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl">
        <div class="mb-6">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <div class="text-sm text-gray-400">Hola,</div>
                    <h2 class="text-2xl font-bold text-cyan-400">{participant}</h2>
                </div>
                <button
                    class="text-sm text-gray-400 hover:text-white px-3 py-2"
                    onclick={logout}
                >
                    Cerrar sesión
                </button>
            </div>
            <div class="text-sm text-gray-400 mt-2">
                Apuestas para {windowState.date} · {matches.length} partido{matches.length !== 1 ? 's' : ''}
            </div>
        </div>

        {#if !windowStillOpen}
            <div class="mb-4 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm text-center">
                ⚠️ La ventana de apuestas no está abierta. No podrás enviar.
            </div>
        {/if}

        <div class="space-y-3">
            {#each matches as m (m.id)}
                {@const s = scores[m.id] || { home: null, away: null }}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 text-right">
                            <div class="font-bold text-sm md:text-base">{m.homeTeam || m.team1}</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <input
                                type="number"
                                inputmode="numeric"
                                min="0"
                                max="99"
                                value={s.home ?? ''}
                                oninput={(e) => handleScoreInput(m.id, 'home', e)}
                                class="w-14 h-14 text-center text-2xl font-black bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-cyan-500 transition-all"
                            />
                            <span class="text-gray-500 text-xl">—</span>
                            <input
                                type="number"
                                inputmode="numeric"
                                min="0"
                                max="99"
                                value={s.away ?? ''}
                                oninput={(e) => handleScoreInput(m.id, 'away', e)}
                                class="w-14 h-14 text-center text-2xl font-black bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-cyan-500 transition-all"
                            />
                        </div>
                        <div class="flex-1 text-left">
                            <div class="font-bold text-sm md:text-base">{m.awayTeam || m.team2}</div>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 text-center mt-2">
                        {m.time} · {m.ground || ''}
                    </div>
                </div>
            {/each}
        </div>

        {#if error}
            <div class="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
                {error}
            </div>
        {/if}

        <div class="mt-6 flex flex-col gap-3">
            <div class="text-center text-sm text-gray-400">
                {filledCount} de {matches.length} marcadores listos
            </div>
            <button
                class="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 rounded-2xl text-white text-lg font-black shadow-lg shadow-green-500/30 transition-all min-h-14 disabled:opacity-30"
                onclick={submit}
                disabled={!allFilled || submitting || !windowStillOpen}
            >
                {submitting ? 'Enviando…' : '✓ Enviar apuestas'}
            </button>
        </div>
    </div>
</div>
