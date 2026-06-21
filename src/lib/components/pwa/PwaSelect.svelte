<script>
    import { appState, participants } from '../../stores.svelte.js';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';

    /** @type {{ onSelect: (participant: string, phone: string) => void }} */
    let { onSelect } = $props();

    let search = $state('');

    const participantList = $derived.by(() => {
        // participants() del stores deriva de appState.bets (que carga de Sheets).
        // Si todavía no hay bets, la lista estará vacía. Fallback: mostrar error.
        return participants();
    });

    // Construir mapa participant -> phone desde appState.bets.
    const phoneByParticipant = $derived.by(() => {
        const map = new Map();
        for (const bet of appState.bets) {
            if (bet.participant && bet.phone && !map.has(bet.participant)) {
                map.set(bet.participant, bet.phone);
            }
        }
        return map;
    });

    const filtered = $derived.by(() => {
        const q = search.toLowerCase().trim();
        if (!q) return participantList;
        return participantList.filter(p => p.toLowerCase().includes(q));
    });

    /** @param {string} name */
    function pick(name) {
        const phone = phoneByParticipant.get(name) || '';
        if (!phone) {
            alert('No se encontró el teléfono de este participante. Contacta al admin.');
            return;
        }
        onSelect(name, phone);
    }
</script>

<div class="min-h-screen bg-[#111] text-white p-4 md:p-8 flex flex-col items-center">
    <div class="w-full max-w-2xl">
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-xl transition-all border border-white/10"
                onclick={() => setStep('landing')}
                aria-label="Volver"
            >←</button>
            <h2 class="text-2xl font-bold text-cyan-400">¿Quién eres?</h2>
        </div>

        {#if participantList.length === 0}
            <div class="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
                <p class="text-amber-200">
                    No hay participantes cargados aún. Espera unos segundos mientras
                    la app descarga los datos, o recarga la página.
                </p>
            </div>
        {:else}
            <input
                type="text"
                bind:value={search}
                placeholder="🔍 Buscar tu nombre…"
                class="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-lg outline-none focus:border-cyan-500 transition-all mb-4"
            />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
                {#each filtered as name (name)}
                    <button
                        class="text-left px-4 py-3 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-xl transition-all"
                        onclick={() => pick(name)}
                    >
                        <div class="font-semibold">{name}</div>
                        <div class="text-xs text-gray-500 font-mono">
                            {phoneByParticipant.get(name)}
                        </div>
                    </button>
                {/each}
            </div>

            {#if filtered.length === 0}
                <p class="text-center text-gray-500 mt-6">No se encontraron nombres con «{search}»</p>
            {/if}
        {/if}
    </div>
</div>
