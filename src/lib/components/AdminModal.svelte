<script>
    /** @type {{ onConfirm: () => void, onClose: () => void, title?: string, message?: string }} */
    let { 
        onConfirm, 
        onClose, 
        title = 'Acceso Administrativo', 
        message = 'Por favor, introduce la clave de administrador para continuar.' 
    } = $props();

    const isDev = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    let password = $state('');
    let error = $state(false);

    function handleSubmit() {
        if (isDev || password === 'polla2026') {
            onConfirm();
        } else {
            error = true;
            password = '';
        }
    }

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') onClose();
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
            <h2 class="text-xl font-bold text-cyan-400 flex items-center gap-2">
                <span>🔒</span> {title}
            </h2>
            <button class="text-gray-400 hover:text-white text-2xl" onclick={onClose}>&times;</button>
        </div>

        <div class="p-8 space-y-6">
            <p class="text-gray-300 text-center">{message}</p>
            
            <div class="space-y-2">
                <!-- svelte-ignore a11y_autofocus -->
                <input
                    type="password"
                    bind:value={password}
                    placeholder="Clave de administrador"
                    class="w-full bg-white/5 border {error ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-4 text-center text-xl tracking-widest text-white outline-none focus:border-cyan-500 transition-all"
                    onkeydown={handleKeydown}
                    autofocus
                />
                {#if error}
                    <p class="text-red-400 text-sm text-center font-medium animate-pulse">Clave incorrecta. Inténtalo de nuevo.</p>
                {/if}
            </div>

            <div class="flex gap-3 pt-2">
                <button
                    class="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all"
                    onclick={onClose}
                >
                    Cancelar
                </button>
                <button
                    class="flex-1 px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-900/20 transition-all"
                    onclick={handleSubmit}
                >
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>
