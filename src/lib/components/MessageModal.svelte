<script>
    /** @type {{ message: string, type?: 'info' | 'warning' | 'error' | 'success', onClose: () => void }} */
    let { message, type = 'info', onClose } = $props();

    /** @type {Record<string, string>} */
    const iconMap = {
        info: 'ℹ️',
        warning: '🔒',
        error: '❌',
        success: '✅'
    };
</script>

<div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation">
    <div
        class="bg-gray-900 border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        class:border-blue-500={type === 'info'}
        class:border-orange-500={type === 'warning'}
        class:border-red-500={type === 'error'}
        class:border-emerald-500={type === 'success'}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div class="text-center">
            <div class="text-5xl mb-4">{iconMap[type]}</div>
            <p class="text-white text-lg mb-6 whitespace-pre-line">{message}</p>
            <button
                class="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-semibold transition-all"
                onclick={onClose}
            >
                Aceptar
            </button>
        </div>
    </div>
</div>