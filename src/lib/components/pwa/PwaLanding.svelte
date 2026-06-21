<script>
    import { setStep } from '../../pwa/session.svelte.js';

    /** @type {{ state: any, onPickDate: (date: string) => void }} */
    let { state, onPickDate } = $props();

    /** @param {string|null|undefined} iso */
    function formatLocal(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function enter() {
        if (state.status === 'open') {
            onPickDate(state.date);
            setStep('select');
        }
    }

    function goHistory() {
        setStep('history');
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-md">
        <div class="text-center mb-8">
            <div class="text-5xl mb-3">⚽</div>
            <h1 class="text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic tracking-tighter">
                POLLA 2026
            </h1>
            <p class="text-gray-400 mt-2">Apuesta los marcadores del día</p>
        </div>

        <div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 space-y-6">
            {#if state.status === 'open'}
                <div class="text-center">
                    <div class="text-6xl mb-4">🟢</div>
                    <h2 class="text-2xl font-bold text-green-400 mb-2">Apuestas abiertas</h2>
                    <p class="text-gray-300">{state.message}</p>
                </div>
                <div class="text-sm text-gray-400 space-y-1 border-t border-white/10 pt-4">
                    <p>📅 Día: <span class="text-white font-semibold">{state.date}</span></p>
                    <p>⏰ Cierra: <span class="text-white font-semibold">{formatLocal(state.closeAt)}</span></p>
                    <p>⚽ Partidos hoy: <span class="text-white font-semibold">{state.matches?.length || 0}</span></p>
                </div>
                <button
                    class="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-2xl text-white text-lg font-black shadow-lg shadow-cyan-500/30 transition-all min-h-14"
                    onclick={enter}
                >
                    Apostar →
                </button>

            {:else if state.status === 'closed'}
                <div class="text-center">
                    <div class="text-6xl mb-4">🔒</div>
                    <h2 class="text-2xl font-bold text-red-400 mb-2">Ventana cerrada</h2>
                    <p class="text-gray-300">{state.message}</p>
                </div>
                <div class="text-sm text-gray-400 space-y-1 border-t border-white/10 pt-4">
                    <p>⏰ Cerró a las: <span class="text-white font-semibold">{state.firstMatchLocalTime}</span> (hora Colombia)</p>
                </div>
                <button
                    class="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-bold transition-all min-h-12"
                    onclick={goHistory}
                >
                    Ver mis apuestas anteriores
                </button>

            {:else if state.status === 'upcoming'}
                <div class="text-center">
                    <div class="text-6xl mb-4">⏳</div>
                    <h2 class="text-2xl font-bold text-amber-400 mb-2">Próximamente</h2>
                    <p class="text-gray-300">{state.message}</p>
                </div>
                <div class="text-sm text-gray-400 space-y-1 border-t border-white/10 pt-4">
                    <p>📅 Apertura: <span class="text-white font-semibold">{formatLocal(state.openAt)}</span></p>
                    <p>⏰ Cierre: <span class="text-white font-semibold">{formatLocal(state.closeAt)}</span></p>
                </div>

            {:else}
                <div class="text-center">
                    <div class="text-6xl mb-4">📭</div>
                    <h2 class="text-2xl font-bold text-gray-300 mb-2">Sin partidos</h2>
                    <p class="text-gray-400">{state.message}</p>
                </div>
            {/if}
        </div>

        <div class="text-center mt-6">
            <a href="#/" class="text-gray-500 hover:text-gray-300 text-sm underline">
                ← Volver a la app principal
            </a>
        </div>
    </div>
</div>
