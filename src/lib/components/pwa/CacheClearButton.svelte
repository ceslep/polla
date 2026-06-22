<script>
    /**
     * Botón flotante "Borrar cache" para usuarios. Limpia:
     *   - Todas las Cache Storage entries (incluyendo el SW cache viejo)
     *   - localStorage y sessionStorage
     *   - Unregistra todos los Service Workers registrados
     *   - Recarga la página con `location.reload()` (full reload, no soft)
     *
     * Útil cuando un usuario tiene un SW viejo cacheado y los cambios del
     * deploy no se ven. El SW nuevo se registra solo en el reload.
     */

    let busy = $state(false);

    /**
     * @param {string} msg
     * @returns {void}
     */
    function log(msg) {
        console.log('[PWA:clear-cache]', msg);
    }

    /**
     * @returns {Promise<void>}
     */
    async function clearCaches() {
        if (busy) return;
        busy = true;
        try {
            // 1. Cache Storage
            if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                log(`Cache Storage keys: ${keys.join(', ') || '(vacío)'}`);
                await Promise.all(keys.map((k) => caches.delete(k)));
                log(`✓ ${keys.length} cache(s) eliminada(s)`);
            }

            // 2. localStorage / sessionStorage
            try {
                const lsKeys = Object.keys(localStorage);
                log(`localStorage keys: ${lsKeys.join(', ') || '(vacío)'}`);
                localStorage.clear();
                log('✓ localStorage limpiado');
            } catch (err) {
                log(`localStorage no accesible: ${err instanceof Error ? err.message : err}`);
            }
            try {
                const ssKeys = Object.keys(sessionStorage);
                log(`sessionStorage keys: ${ssKeys.join(', ') || '(vacío)'}`);
                sessionStorage.clear();
                log('✓ sessionStorage limpiado');
            } catch (err) {
                log(`sessionStorage no accesible: ${err instanceof Error ? err.message : err}`);
            }

            // 3. Service Workers
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                log(`SW registrations: ${regs.length}`);
                await Promise.all(regs.map((r) => r.unregister()));
                log(`✓ ${regs.length} SW unregistrado(s)`);
            }
        } catch (err) {
            console.error('[PWA:clear-cache] error:', err);
        } finally {
            // 4. Full reload (true = bypass HTTP cache)
            log('Recargando…');
            window.location.reload();
        }
    }
</script>

<button
    type="button"
    onclick={clearCaches}
    disabled={busy}
    class="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full text-gray-300 hover:text-white text-xs font-medium transition-all backdrop-blur-md shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-wait min-h-9 max-w-[calc(100vw-1.5rem)]"
    aria-label="Borrar cache y recargar"
    title="Borrar cache del Service Worker, localStorage y recargar la app"
>
    {#if busy}
        <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        <span>Borrando…</span>
    {:else}
        <span class="text-sm">🗑️</span>
        <span class="hidden sm:inline">Borrar cache</span>
    {/if}
</button>
