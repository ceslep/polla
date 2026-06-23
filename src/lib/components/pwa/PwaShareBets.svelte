<script>
    import { getFlagData } from '../../flags.js';
    import { PREMATCH_PASSWORD } from '../../pwa/prematchGuard.js';

    /**
     * @type {{
     *   bets?: any[],
     *   todayDate?: string,
     *   preMatchInfo?: { required: boolean, firstMatchHHMM: string | null },
     *   onClose: () => void
     * }}
     */
    let {
        bets = [],
        todayDate = '',
        preMatchInfo = { required: false, firstMatchHHMM: null },
        onClose
    } = $props();

    // ---- Pre-match password gate ----------------------------------------
    // El flag `preMatchInfo.required` se calcula en PwaApp. Acá solo
    // guardamos el estado de UI (input, error, desbloqueo).

    /** @type {string} */
    let passwordInput = $state('');
    /** @type {string} */
    let passwordError = $state('');
    /** Sin persistencia: al desmontar el modal se olvida. */
    let isUnlocked = $state(false);

    const requiresPassword = $derived(preMatchInfo.required && !isUnlocked);

    function checkPassword() {
        if (passwordInput === PREMATCH_PASSWORD) {
            isUnlocked = true;
            passwordError = '';
            passwordInput = '';
        } else {
            passwordError = 'Clave incorrecta';
        }
    }

    /** @param {SubmitEvent} e */
    function handlePasswordSubmit(e) {
        e.preventDefault();
        checkPassword();
    }

    /** @type {'idle' | 'copied' | 'error'} */
    let copyState = $state('idle');

    /**
     * Construye el mensaje agrupado por participante, ordenados alfabéticamente.
     * Solo incluye apuestas de tipo 'score' cuya matchDate === todayDate,
     * extraídas de la hoja `apuestas` (vía `pwaScoredBets`).
     *
     * Formato por participante (líneas separadas por `\n`):
     *   NombreParticipante
     *   🇦🇷 Argentina vs Austria 🇦🇹: 3-1
     *   🇫🇷 France vs Iraq 🇮🇶: 3-0
     *
     * Participantes separados por una línea en blanco.
     */
    const message = $derived.by(() => {
        const filtered = bets.filter(
            (/** @type {any} */ b) => b.type === 'score' && b.matchDate === todayDate
        );
        /** @type {Map<string, any[]>} */
        const byPart = new Map();
        for (const b of filtered) {
            if (!b.participant) continue;
            let arr = byPart.get(b.participant);
            if (!arr) {
                arr = [];
                byPart.set(b.participant, arr);
            }
            arr.push(b);
        }
        const sortedParts = [...byPart.keys()].sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' })
        );
        /** @type {string[]} */
        const blocks = [];
        for (const p of sortedParts) {
            const partBets = byPart.get(p) || [];
            partBets.sort((/** @type {any} */ a, /** @type {any} */ b) =>
                String(a.matchDate || '').localeCompare(String(b.matchDate || ''))
            );
            /** @type {string[]} */
            const lines = [p];
            for (const bet of partBets) {
                const pred = bet.prediction || {};
                const homeData = getFlagData(pred.homeTeam || '');
                const awayData = getFlagData(pred.awayTeam || '');
                const homeEmoji = homeData?.emoji || '';
                const awayEmoji = awayData?.emoji || '';
                const homeName = homeData?.spanishName || pred.homeTeam || '?';
                const awayName = awayData?.spanishName || pred.awayTeam || '?';
                const hs = pred.homeScore;
                const as = pred.awayScore;
                if (hs == null || as == null) continue;
                lines.push(`${homeEmoji} ${homeName} vs ${awayEmoji} ${awayName}: ${hs}-${as}`);
            }
            if (lines.length > 1) blocks.push(lines.join('\n'));
        }
        return blocks.join('\n\n');
    });

    const participantCount = $derived.by(() => {
        const set = new Set();
        for (const b of bets) {
            if (b.type === 'score' && b.matchDate === todayDate && b.participant) {
                set.add(b.participant);
            }
        }
        return set.size;
    });

    const betCount = $derived.by(() => {
        let n = 0;
        for (const b of bets) {
            if (b.type === 'score' && b.matchDate === todayDate && b.participant) n++;
        }
        return n;
    });

    async function handleCopy() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(message);
            } else {
                // Fallback: textarea + execCommand (Safari viejo, http://localhost en algunos browsers)
                const ta = document.createElement('textarea');
                ta.value = message;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copyState = 'copied';
            setTimeout(() => { copyState = 'idle'; }, 2000);
        } catch (e) {
            console.error('Clipboard write failed:', e);
            copyState = 'error';
            setTimeout(() => { copyState = 'idle'; }, 2000);
        }
    }

    /** @param {Event} e */
    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) onClose();
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Escape') onClose();
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <div class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-slide-up">
        <div class="p-5 md:p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full bg-cyan-500/20 ring-1 ring-cyan-500/40 flex items-center justify-center text-cyan-400 text-xl shrink-0">📤</div>
                <div class="min-w-0">
                    <h2 class="text-lg md:text-xl font-black text-cyan-400 truncate">Mensaje para WhatsApp</h2>
                    <p class="text-xs text-gray-400">
                        {todayDate} · {participantCount} participante{participantCount !== 1 ? 's' : ''} · {betCount} apuesta{betCount !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>
            <button
                class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
                onclick={onClose}
                aria-label="Cerrar"
            >×</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            {#if requiresPassword}
                <div class="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
                    <div class="text-5xl mb-3 text-center">🔒</div>
                    <h3 class="text-lg font-bold text-white mb-2 text-center">Mensaje bloqueado</h3>
                    {#if preMatchInfo.firstMatchHHMM}
                        <p class="text-sm text-gray-400 mb-4 sm:mb-6 text-center">
                            Los partidos de hoy ({todayDate}) inician a las
                            <span class="text-cyan-300 font-mono">{preMatchInfo.firstMatchHHMM}</span>
                            (hora Colombia). La clave se desactiva 1 minuto antes.
                        </p>
                    {:else}
                        <p class="text-sm text-gray-400 mb-4 sm:mb-6 text-center">
                            Ingresa la clave para generar el mensaje de apuestas del día ({todayDate}) antes de que empiecen los partidos.
                        </p>
                    {/if}
                    <form onsubmit={handlePasswordSubmit} class="space-y-3 sm:space-y-4">
                        <input
                            type="password"
                            bind:value={passwordInput}
                            placeholder="Clave"
                            autocomplete="off"
                            class="w-full bg-white/5 border-2 border-white/10 focus:border-cyan-500/60 focus:bg-white/[0.07] rounded-2xl px-4 py-3 text-base text-white placeholder-gray-500 outline-none transition-all text-center tracking-widest"
                        />
                        {#if passwordError}
                            <p class="text-red-400 text-sm text-center">{passwordError}</p>
                        {/if}
                        <button
                            type="submit"
                            class="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-2xl text-white font-bold transition-all min-h-12 shadow-lg shadow-emerald-500/30"
                        >Entrar →</button>
                    </form>
                </div>
            {:else if message.trim().length === 0}
                <div class="text-center py-12 text-gray-400">
                    <div class="text-5xl mb-3">📭</div>
                    <p class="text-sm">No hay apuestas para hoy ({todayDate}) en la hoja <code class="text-cyan-400 font-mono">apuestas</code>.</p>
                </div>
            {:else}
                <div class="text-xs text-gray-400 mb-2">
                    Pegar tal cual en el grupo de WhatsApp:
                </div>
                <pre class="bg-black/40 border border-white/10 rounded-2xl p-4 text-sm whitespace-pre-wrap font-sans leading-relaxed text-white max-h-[55vh] overflow-y-auto">{message}</pre>
            {/if}
        </div>

        <div class="p-4 md:p-5 border-t border-white/10 flex-shrink-0 bg-black/20 flex gap-2">
            <button
                class="flex-1 py-3 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
                onclick={onClose}
            >Cerrar</button>
            {#if !requiresPassword && message.trim().length > 0}
                <button
                    class="flex-1 py-3 rounded-2xl text-white font-bold transition-all min-h-12
                        {copyState === 'copied'
                            ? 'bg-emerald-500'
                            : copyState === 'error'
                                ? 'bg-red-500'
                                : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/30'}"
                    onclick={handleCopy}
                    data-pwa-tutorial="share-copy"
                >
                    {#if copyState === 'copied'}
                        ✓ Copiado
                    {:else if copyState === 'error'}
                        ✗ No se pudo copiar
                    {:else}
                        📋 Copiar al portapapeles
                    {/if}
                </button>
            {/if}
        </div>
    </div>
</div>
