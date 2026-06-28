<script>
    /**
     * Botón flotante "Borrar cache" para usuarios. Limpia caches, storages y
     * Service Workers, y recarga. La lógica vive en `clearCache.js` (compartida
     * con el auto-borrado al abrir la URL en main.js).
     *
     * Útil cuando un usuario tiene un SW viejo cacheado y los cambios del
     * deploy no se ven. El SW nuevo se registra solo en el reload.
     */
    import { clearCachesAndReload } from '../../pwa/clearCache.js';

    let busy = $state(false);

    /**
     * @returns {Promise<void>}
     */
    async function clearCaches() {
        if (busy) return;
        busy = true;
        await clearCachesAndReload();
    }
</script>

<button
    type="button"
    onclick={clearCaches}
    disabled={busy}
    class="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full text-gray-300 hover:text-white text-xs font-medium transition-all backdrop-blur-md shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-wait min-h-9 max-w-[calc(100vw-1.5rem)]"
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
