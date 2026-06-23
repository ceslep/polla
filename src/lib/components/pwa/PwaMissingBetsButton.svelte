<script>
    /**
     * PwaMissingBetsButton.svelte
     *
     * Botón flotante "📋 N" + modal con la lista de participantes que NO
     * han enviado apuesta de tipo `score` con `matchDate === todayDate`.
     * Desde el modal se puede copiar un texto pre-armado al portapapeles
     * para notificar al grupo de WhatsApp.
     *
     * Limitación: la lista de "todos los participantes" se deriva de los
     * nombres únicos en `bets` (que viene de `pwaScoredBets` →
     * `loadAllPwaBets`). NO incluye a quien se registró en la hoja
     * `participantes` y nunca apostó. Para incluir a esos habría que
     * crear un endpoint PHP nuevo (ver AGENTS.md).
     *
     * Props:
     *   - bets: any[]                — apuestas scored (puede estar vacío durante el load)
     *   - todayDate: string          — 'YYYY-MM-DD' en COT
     *   - firstMatchHHMM: string|null — 'HH:MM' del primer partido del día (opcional)
     */

    /**
     * @type {{
     *   bets?: any[],
     *   todayDate?: string,
     *   firstMatchHHMM?: string | null
     * }}
     */
    let {
        bets = [],
        todayDate = '',
        firstMatchHHMM = null
    } = $props();

    let showModal = $state(false);
    /** Texto editable del textarea. Se sincroniza con `baseMessage` cuando
     *  cambia el conjunto de faltantes, pero NO en cada keystroke del
     *  ticker (así no pisamos lo que el admin está escribiendo). */
    let textareaValue = $state('');
    let copyState = $state(/** @type {'idle' | 'copied' | 'error'} */('idle'));

    /**
     * Set de todos los participantes que han apostado al menos una vez
     * (a través de todos los partidos, no solo hoy). No incluye gente
     * registrada en `participantes` que nunca apostó.
     * @type {Set<string>}
     */
    const allParticipants = $derived.by(() => {
        const set = new Set();
        for (const b of bets) {
            if (b.participant) set.add(b.participant);
        }
        return set;
    });

    /**
     * Set de participantes que YA apostaron HOY (apuesta de tipo score
     * con matchDate === todayDate).
     * @type {Set<string>}
     */
    const todayBettors = $derived.by(() => {
        const set = new Set();
        for (const b of bets) {
            if (
                b.type === 'score'
                && b.participant
                && b.matchDate === todayDate
            ) {
                set.add(b.participant);
            }
        }
        return set;
    });

    /** Lista de faltantes, ordenada alfabéticamente. */
    const missing = $derived(
        [...allParticipants]
            .filter((p) => !todayBettors.has(p))
            .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    );

    /** URL canónica del form (igual que el start_url del manifest). */
    const FORM_URL = 'https://app.iedeoccidente.com/polla/#/apostar';

    /**
     * Texto base pre-armado. NO se usa directamente para el copy — va al
     * `textareaValue` (editable) y eso es lo que se copia.
     */
    const baseMessage = $derived.by(() => {
        if (missing.length === 0) return '';
        const lines = [];
        lines.push('🔔 Recordatorio polla 2026');
        lines.push(`Apuestas pendientes de hoy (${todayDate}):`);
        lines.push('');
        for (const name of missing) {
            lines.push(`• ${name}`);
        }
        if (firstMatchHHMM) {
            lines.push('');
            lines.push(`Los partidos inician a las ${firstMatchHHMM} (hora Colombia).`);
            lines.push('La ventana cierra 1 minuto antes.');
        }
        lines.push('');
        lines.push(`👉 ${FORM_URL}`);
        return lines.join('\n');
    });

    /**
     * Sincroniza el textarea con el mensaje base SOLO cuando cambia el
     * conjunto de faltantes (no en cada tick del reloj). Para detectar el
     * cambio usamos un "signature" estable: el join de los nombres
     * faltantes. Si el admin ya editó el textarea y luego se une un
     * nuevo faltante, sobrescribimos (no hay forma de preservar sus
     * ediciones sin un sistema más complejo).
     */
    let lastMissingSig = '';
    $effect(() => {
        const sig = missing.join('|');
        if (sig !== lastMissingSig) {
            lastMissingSig = sig;
            textareaValue = baseMessage;
        }
    });

    async function handleCopy() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textareaValue);
            } else {
                // Fallback para http://localhost en browsers que no soportan
                // navigator.clipboard, o Safari viejo.
                const ta = document.createElement('textarea');
                ta.value = textareaValue;
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
        if (e.target === e.currentTarget) showModal = false;
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Escape') showModal = false;
    }

    /** Color del badge: amber para "pendientes", verde para "todos al día". */
    const badgeClass = $derived(
        missing.length === 0
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    );
</script>

<!-- Botón flotante (vive dentro del wrapper flex del PwaApp). -->
<button
    type="button"
    onclick={() => showModal = true}
    class="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full text-gray-300 hover:text-white text-xs font-medium transition-all backdrop-blur-md shadow-lg shadow-black/20 min-h-9"
    aria-label="Ver apuestas pendientes de hoy"
    title="Participantes que aún no han enviado sus apuestas de hoy"
>
    <span class="text-sm">📋</span>
    <span class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold border {badgeClass}">
        {missing.length}
    </span>
    <span class="hidden sm:inline">Pendientes</span>
</button>

{#if showModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-slide-up">
            <div class="p-5 md:p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-full bg-amber-500/20 ring-1 ring-amber-500/40 flex items-center justify-center text-amber-300 text-xl shrink-0">📋</div>
                    <div class="min-w-0">
                        <h2 class="text-lg md:text-xl font-black text-amber-300 truncate">Apuestas pendientes</h2>
                        <p class="text-xs text-gray-400">
                            {todayDate} · {missing.length} de {allParticipants.size} participante{allParticipants.size !== 1 ? 's' : ''} no han enviado
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
                    onclick={() => showModal = false}
                    aria-label="Cerrar"
                >×</button>
            </div>

            <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {#if bets.length === 0}
                    <div class="text-center py-12 text-gray-400">
                        <div class="text-5xl mb-3">⏳</div>
                        <p class="text-sm">Cargando datos de apuestas desde la hoja <code class="text-cyan-400 font-mono">apuestas</code>…</p>
                    </div>
                {:else if missing.length === 0}
                    <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
                        <div class="text-5xl mb-3">🎉</div>
                        <h3 class="text-lg font-bold text-emerald-300 mb-1">¡Todos han enviado sus apuestas!</h3>
                        <p class="text-sm text-gray-400">
                            Los {allParticipants.size} participantes registrados ya apostaron para el {todayDate}.
                        </p>
                    </div>
                {:else}
                    <!-- Lista de faltantes -->
                    <div>
                        <h3 class="text-sm font-semibold text-gray-300 mb-2">
                            Faltan {missing.length} participante{missing.length !== 1 ? 's' : ''}:
                        </h3>
                        <ul class="bg-black/30 border border-white/10 rounded-2xl p-3 md:p-4 space-y-1 max-h-[30vh] overflow-y-auto">
                            {#each missing as name (name)}
                                <li class="flex items-center gap-2 text-sm">
                                    <span class="text-amber-300 shrink-0">•</span>
                                    <span class="truncate">{name}</span>
                                </li>
                            {/each}
                        </ul>
                    </div>

                    <!-- Textarea editable + texto pre-armado -->
                    <div>
                        <label for="missing-bets-message" class="text-sm font-semibold text-gray-300 mb-2 block">
                            Mensaje para el grupo de WhatsApp
                            <span class="text-xs text-gray-500 font-normal">(editable)</span>
                        </label>
                        <textarea
                            id="missing-bets-message"
                            bind:value={textareaValue}
                            rows="10"
                            class="w-full bg-black/40 border border-white/10 focus:border-cyan-500/60 rounded-2xl p-3 md:p-4 text-sm font-sans leading-relaxed text-white resize-y outline-none transition-all"
                        ></textarea>
                    </div>
                {/if}
            </div>

            <div class="p-4 md:p-5 border-t border-white/10 flex-shrink-0 bg-black/20 flex gap-2">
                <button
                    type="button"
                    class="flex-1 py-3 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
                    onclick={() => showModal = false}
                >Cerrar</button>
                {#if missing.length > 0}
                    <button
                        type="button"
                        class="flex-1 py-3 rounded-2xl text-white font-bold transition-all min-h-12
                            {copyState === 'copied'
                                ? 'bg-emerald-500'
                                : copyState === 'error'
                                    ? 'bg-red-500'
                                    : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/30'}"
                        onclick={handleCopy}
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
{/if}
