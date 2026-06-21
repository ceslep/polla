<script>
    import { pwaSession, setStep, logout } from '../../pwa/session.svelte.js';
    import { getPwaBets } from '../../api.js';

    /** @type {{ date: string, savedCount: number }} */
    let { date, savedCount } = $props();

    let loading = $state(false);
    /** @type {Array<any>} */
    let bets = $state([]);

    $effect(() => {
        if (pwaSession.phone && date) {
            load();
        }
    });

    async function load() {
        loading = true;
        try {
            const all = await getPwaBets({ phone: pwaSession.phone || '', matchDate: date });
            bets = all;
        } catch (e) {
            console.error('No pude cargar las apuestas:', e);
        } finally {
            loading = false;
        }
    }

    /** @param {string|null|undefined} iso */
    function formatTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl">
        <div class="text-center mb-6">
            <div class="text-6xl mb-3">✅</div>
            <h2 class="text-3xl font-black text-green-400 mb-2">¡Apuestas registradas!</h2>
            <p class="text-gray-300">{savedCount} marcador{savedCount !== 1 ? 'es' : ''} enviado{savedCount !== 1 ? 's' : ''} para el {date}</p>
        </div>

        <div class="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
            <h3 class="font-bold text-cyan-400 text-lg">Tus marcadores</h3>

            {#if loading}
                <p class="text-gray-500 text-center py-4">Cargando…</p>
            {:else if bets.length === 0}
                <p class="text-gray-500 text-center py-4">No se pudieron recuperar las apuestas guardadas.</p>
            {:else}
                <div class="space-y-2">
                    {#each bets as b (b.id)}
                        <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                            <div class="text-sm flex-1">
                                <span class="font-semibold">{b.homeTeam}</span>
                                <span class="mx-2 text-gray-500">vs</span>
                                <span class="font-semibold">{b.awayTeam}</span>
                            </div>
                            <div class="font-black text-2xl text-cyan-400">
                                {b.homeScore} – {b.awayScore}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center">
            <p class="text-amber-200 text-sm">
                🔒 <strong>Inmutables.</strong> No es posible modificarlas una vez enviadas.
            </p>
        </div>

        <div class="mt-6 flex flex-col gap-3">
            <button
                class="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all min-h-12"
                onclick={() => setStep('history')}
            >
                Ver apuestas de otros días
            </button>
            <button
                class="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-white font-bold transition-all min-h-12"
                onclick={logout}
            >
                Cerrar sesión
            </button>
        </div>
    </div>
</div>
