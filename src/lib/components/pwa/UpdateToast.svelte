<script>
    /**
     * UpdateToast — toast simple para feedback de "Buscar actualizaciones".
     * Tres variantes (`info` | `success` | `error`), auto-dismiss a 4s.
     *
     * Patrón: el padre (PwaLanding) controla `message` + `variant`. Cuando
     * el padre quiere mostrar un toast, setea las dos props; el componente
     * arranca un timer para auto-ocultar. Si llega un nuevo mensaje antes
     * de que termine el timer, se resetea.
     *
     * @typedef {'info' | 'success' | 'error'} ToastVariant
     * @typedef {Object} Props
     * @property {string} message
     * @property {ToastVariant} [variant]
     * @property {number} [durationMs] - 0 = no auto-dismiss
     * @property {() => void} [onClose]
     */
    /** @type {Props} */
    let { message, variant = 'info', durationMs = 4000, onClose = () => {} } = $props();

    /** @type {ReturnType<typeof setTimeout>|null} */
    let dismissTimer = null;
    /** Último mensaje visto: si cambia, reiniciamos el timer. */
    let lastMessage = $state('');
    let visible = $state(false);

    $effect(() => {
        if (message && message !== lastMessage) {
            lastMessage = message;
            visible = true;
            if (dismissTimer) clearTimeout(dismissTimer);
            if (durationMs > 0) {
                dismissTimer = setTimeout(() => {
                    visible = false;
                    onClose();
                }, durationMs);
            }
        } else if (!message) {
            visible = false;
            if (dismissTimer) clearTimeout(dismissTimer);
        }
    });

    function manualClose() {
        visible = false;
        if (dismissTimer) clearTimeout(dismissTimer);
        onClose();
    }

    const variantStyles = $derived.by(() => {
        switch (variant) {
            case 'success':
                return {
                    icon: '✓',
                    classes: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100'
                };
            case 'error':
                return {
                    icon: '⚠',
                    classes: 'bg-red-500/15 border-red-500/40 text-red-100'
                };
            case 'info':
            default:
                return {
                    icon: 'ℹ',
                    classes: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-100'
                };
        }
    });
</script>

{#if visible && message}
    <div
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[calc(100vw-2rem)] max-w-sm animate-slide-up"
        role="status"
        aria-live="polite"
    >
        <div
            class="glass-strong border rounded-2xl p-3 shadow-2xl shadow-black/50 flex items-start gap-3 {variantStyles.classes}"
        >
            <div class="text-lg shrink-0 mt-0.5" aria-hidden="true">
                {variantStyles.icon}
            </div>
            <div class="flex-1 min-w-0 text-sm leading-relaxed">
                {message}
            </div>
            <button
                type="button"
                onclick={manualClose}
                class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-current opacity-70 hover:opacity-100 transition-all"
                aria-label="Cerrar notificación"
            >✕</button>
        </div>
    </div>
{/if}
