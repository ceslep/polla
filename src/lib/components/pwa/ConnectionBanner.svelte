<script>
    /**
     * ConnectionBanner — barra superior slim que avisa cuando no hay conexión.
     *
     * Espeja `navigator.onLine` en `appState.sync.online` vía los eventos
     * globales online/offline (`<svelte:window>`, patrón Svelte 5 sin $effect).
     * Sin red → banner ámbar fijo. Al recuperar la conexión, dispara
     * `onReconnect` (el padre reejecuta `refreshData` y muestra un toast).
     *
     * Nota de diseño: la app hace cache-wipe en cada apertura (clearCache.js),
     * así que NO hay datos offline que servir — este banner solo informa del
     * estado de red; no habilita modo offline.
     *
     * @typedef {Object} Props
     * @property {() => void} [onReconnect]
     */
    import { appState } from '../../stores.svelte.js';

    /** @type {Props} */
    let { onReconnect = () => {} } = $props();

    function handleOnline() {
        const wasOffline = !appState.sync.online;
        appState.sync.online = true;
        if (wasOffline) onReconnect();
    }

    function handleOffline() {
        appState.sync.online = false;
    }
</script>

<svelte:window ononline={handleOnline} onoffline={handleOffline} />

{#if !appState.sync.online}
    <div
        class="fixed top-0 left-0 right-0 z-[60] animate-slide-down"
        role="alert"
        aria-live="assertive"
    >
        <div class="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/90 backdrop-blur text-black text-xs md:text-sm font-bold shadow-lg">
            <span aria-hidden="true">⚠</span>
            <span>Sin conexión — reconecta para ver datos al día</span>
        </div>
    </div>
{/if}
