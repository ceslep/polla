<script>
    import { onMount } from 'svelte';
    import { pwaSession, setStep, logout } from '../../pwa/session.svelte.js';
    import { listParticipantsRoot, getPwaBetsByPhoneRoot } from '../../api.js';

    /**
     * @type {{
     *   onBack?: () => void,
     *   onSelect: (target: {name: string, phone: string}) => void,
     *   bets?: any[],
     *   todayDate?: string,
     *   isDev?: boolean
     * }}
     */
    let {
        onBack = () => {},
        onSelect = () => {},
        bets = [],
        todayDate = '',
        isDev = false
    } = $props();

    /** @type {Array<{name: string, phone: string, passwordChanged: boolean, email: string, isRoot: boolean}>} */
    let participants = $state([]);
    let search = $state('');
    let loading = $state(false);
    /** @type {string | null} */
    let error = $state(null);
    /** @type {string | null} */
    let checkingPhone = $state(null);
    /** @type {string | null} */
    let infoMessage = $state(null);

    onMount(() => {
        loadParticipants();
    });

    async function loadParticipants() {
        loading = true;
        error = null;
        try {
            const result = await listParticipantsRoot({
                username: pwaSession.authUsername || '',
                password: pwaSession.authPassword || '',
                dev: isDev
            });
            participants = result.participants || [];
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error cargando participantes.';
            participants = [];
        } finally {
            loading = false;
        }
    }

    /**
     * Set de participantes que YA apostaron hoy (cualquier tipo con
     * matchDate === todayDate). Derivado de `bets` que PwaApp pasa
     * (pwaScoredBets). Es un cache rápido: el check fresco se hace
     * al click via getPwaBetsByPhoneRoot.
     * @type {Set<string>}
     */
    const todayBettorPhones = $derived.by(() => {
        const set = new Set();
        for (const b of bets) {
            if (
                b.type === 'score'
                && b.phone
                && b.matchDate === todayDate
            ) {
                set.add(b.phone);
            }
        }
        return set;
    });

    const filtered = $derived.by(() => {
        const q = search.trim().toLowerCase();
        if (!q) return participants;
        return participants.filter((p) =>
            p.name.toLowerCase().includes(q) || p.phone.includes(q)
        );
    });

    /**
     * Handler cuando el root selecciona un participante. Hace un check
     * fresco contra el backend (no confiamos solo en el cache de
     * pwaScoredBets por si el target acaba de apostar en otro device).
     * @param {{name: string, phone: string, passwordChanged: boolean, email: string, isRoot: boolean}} p
     */
    async function handleSelect(p) {
        if (checkingPhone) return;
        checkingPhone = p.phone;
        error = null;
        infoMessage = null;
        try {
            const result = await getPwaBetsByPhoneRoot({
                username: pwaSession.authUsername || '',
                password: pwaSession.authPassword || '',
                targetPhone: p.phone,
                matchDate: todayDate,
                dev: isDev
            });
            const existing = result.bets || [];
            if (existing.length > 0) {
                error = `${p.name} ya envió sus apuestas hoy. No se pueden modificar.`;
                return;
            }
            onSelect({ name: p.name, phone: p.phone });
        } catch (e) {
            error = e instanceof Error ? e.message : 'Error verificando apuestas del participante.';
        } finally {
            checkingPhone = null;
        }
    }

    function handleBack() {
        onBack();
    }

    function handleLogout() {
        logout();
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Escape') handleBack();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen relative overflow-hidden flex flex-col items-center text-white p-4 md:p-8">
    <div class="absolute inset-0 -z-10 bg-[#0a0a0a]"></div>
    <div
        class="absolute inset-0 -z-10 opacity-40 animate-gradient"
        style="background: radial-gradient(circle at 20% 0%, rgba(251, 191, 36, 0.20), transparent 50%), radial-gradient(circle at 80% 100%, rgba(16, 185, 129, 0.20), transparent 50%);"
    ></div>

    <div class="w-full max-w-2xl animate-fade-in">
        <!-- Header -->
        <div class="mb-6 flex items-center gap-3">
            <button
                class="w-11 h-11 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-xl transition-all"
                onclick={handleBack}
                aria-label="Volver"
            >←</button>
            <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-bold flex items-center gap-2">
                    <span>🔧</span>
                    <span>Panel root</span>
                </h2>
                <p class="text-xs text-gray-400">
                    Hola, <span class="text-white font-semibold">{pwaSession.authParticipant || 'admin'}</span> · {todayDate}
                </p>
            </div>
            <button
                class="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white text-lg transition-colors rounded-lg hover:bg-white/5"
                onclick={handleLogout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
            >⏻</button>
        </div>

        <div class="glass border-amber-500/40 ring-1 ring-amber-500/20 rounded-2xl p-4 text-amber-200 text-sm text-center mb-4 animate-slide-down">
            <div class="font-bold mb-1">Modo administrador</div>
            <div class="text-xs text-amber-300/80">
                Vas a apostar a nombre de otra persona. Solo aparecen los participantes que
                <strong class="text-amber-200">aún no enviaron</strong> sus apuestas de hoy.
            </div>
        </div>

        <!-- Search -->
        <div class="mb-4">
            <div class="relative">
                <input
                    type="text"
                    inputmode="search"
                    autocomplete="off"
                    bind:value={search}
                    placeholder="🔍 Buscar por nombre o celular…"
                    class="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-4 py-3 pl-11 text-white outline-none focus:border-amber-500/60 focus:bg-white/[0.07] transition-all"
                />
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                {#if search}
                    <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
                        onclick={() => search = ''}
                        aria-label="Limpiar búsqueda"
                    >×</button>
                {/if}
            </div>
        </div>

        {#if infoMessage}
            <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-3 text-cyan-200 text-sm text-center mb-4 animate-slide-down">
                ℹ️ {infoMessage}
            </div>
        {/if}

        {#if error}
            <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-red-200 text-sm text-center mb-4 animate-slide-down">
                ⚠️ {error}
            </div>
        {/if}

        <!-- Lista -->
        <div class="glass-strong rounded-3xl p-3 md:p-4 shadow-2xl shadow-black/40">
            {#if loading}
                <div class="text-center py-12 text-gray-400">
                    <div class="w-8 h-8 border-2 border-white/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-3"></div>
                    <p class="text-sm">Cargando participantes desde la hoja…</p>
                </div>
            {:else if filtered.length === 0}
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">{search ? '🔍' : '🎉'}</div>
                    <p class="text-sm">
                        {#if search}
                            No hay coincidencias para "<span class="text-white font-semibold">{search}</span>".
                        {:else}
                            Todos los participantes ya enviaron sus apuestas de hoy.
                        {/if}
                    </p>
                </div>
            {:else}
                <ul class="space-y-1.5 max-h-[60vh] overflow-y-auto">
                    {#each filtered as p (p.phone)}
                        {@const alreadyBet = todayBettorPhones.has(p.phone)}
                        <li>
                            <button
                                type="button"
                                disabled={alreadyBet || checkingPhone === p.phone}
                                onclick={() => handleSelect(p)}
                                class="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all
                                    {alreadyBet
                                        ? 'bg-white/[0.02] border border-white/5 opacity-60 cursor-not-allowed'
                                        : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 hover:-translate-y-0.5'
                                    }"
                            >
                                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-emerald-500/20 ring-1 ring-white/10 flex items-center justify-center text-base font-bold shrink-0">
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-semibold text-sm md:text-base truncate flex items-center gap-2">
                                        {p.name}
                                        {#if p.isRoot}
                                            <span class="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">root</span>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-400 font-mono">{p.phone}</div>
                                </div>
                                {#if alreadyBet}
                                    <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full font-bold shrink-0">
                                        ✓ Ya envió
                                    </span>
                                {:else if checkingPhone === p.phone}
                                    <span class="w-5 h-5 border-2 border-white/30 border-t-amber-400 rounded-full animate-spin shrink-0"></span>
                                {:else}
                                    <span class="text-2xl text-gray-500 shrink-0">→</span>
                                {/if}
                            </button>
                        </li>
                    {/each}
                </ul>
                <div class="mt-3 pt-3 border-t border-white/5 text-xs text-gray-500 text-center">
                    {filtered.length} participante{filtered.length !== 1 ? 's' : ''}
                    {#if search}
                        (filtrado de {participants.length})
                    {/if}
                </div>
            {/if}
        </div>

        <div class="text-center mt-6">
            <button
                type="button"
                class="text-gray-500 hover:text-gray-300 text-sm underline"
                onclick={handleLogout}
            >
                Cerrar sesión y volver al inicio
            </button>
        </div>
    </div>
</div>
