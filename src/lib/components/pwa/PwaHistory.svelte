<script>
    import { pwaSession, setStep, logout } from '../../pwa/session.svelte.js';
    import { getPwaBets } from '../../api.js';

    /** @type {{ isDev?: boolean }} */
    let { isDev = false } = $props();

    let loading = $state(false);
    /** @type {Map<string, Array<any>>} */
    let byDate = $state(new Map());

    function back() {
        // Si ya envió apuestas hoy, no permitir volver al form.
        setStep(pwaSession.submitted ? 'done' : 'form');
    }

    $effect(() => {
        if (isDev) {
            // Dev mode: nada persistido, historial vacío.
            byDate = new Map();
        } else if (pwaSession.authUsername && pwaSession.authPassword) {
            load();
        }
    });

    async function load() {
        loading = true;
        try {
            const result = await getPwaBets({
                username: pwaSession.authUsername || '',
                password: pwaSession.authPassword || ''
            });
            const all = result.bets || [];
            const map = new Map();
            for (const b of all) {
                const d = b.matchDate || 'sin fecha';
                if (!map.has(d)) map.set(d, []);
                map.get(d).push(b);
            }
            const sorted = new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
            byDate = sorted;
        } catch (e) {
            console.error('No pude cargar el historial:', e);
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl">
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                onclick={back}
                aria-label="Volver"
            >←</button>
            <h2 class="text-2xl font-bold text-cyan-400">Mis apuestas</h2>
        </div>

        <div class="text-sm text-gray-400 mb-4 text-center">
            Solo lectura. Las apuestas ya enviadas no se pueden modificar.
        </div>

        {#if isDev}
            <div class="mb-4 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm text-center">
                ⚙️ DEV MODE — historial vacío (nada se persiste)
            </div>
        {/if}

        {#if !pwaSession.authUsername}
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
                <p class="text-amber-200">No has iniciado sesión.</p>
            </div>
        {:else if loading}
            <div class="text-center py-8">
                <div class="text-5xl mb-3 animate-spin">⚙️</div>
                <p class="text-gray-500">Cargando…</p>
            </div>
        {:else if byDate.size === 0}
            <div class="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <p class="text-gray-400">No has enviado apuestas todavía.</p>
            </div>
        {:else}
            <div class="space-y-4">
                {#each [...byDate.entries()] as [date, bets] (date)}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <h3 class="font-bold text-cyan-400 mb-3 text-lg">📅 {date}</h3>
                        <div class="space-y-2">
                            {#each bets as b (b.id)}
                                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                                    <div class="text-sm flex-1">
                                        <span class="font-semibold">{b.homeTeam}</span>
                                        <span class="mx-1 text-gray-500">vs</span>
                                        <span class="font-semibold">{b.awayTeam}</span>
                                    </div>
                                    <div class="font-black text-xl text-cyan-400">
                                        {b.homeScore} – {b.awayScore}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}

        <div class="mt-6 flex flex-col gap-3">
            <button
                class="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-white font-bold transition-all min-h-12"
                onclick={logout}
            >
                Cerrar sesión
            </button>
        </div>
    </div>
</div>
