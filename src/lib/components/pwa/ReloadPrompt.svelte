<script>
    import { useRegisterSW } from 'virtual:pwa-register/svelte';

    /**
     * Banner que aparece cuando hay una nueva versión del SW disponible.
     * `useRegisterSW` viene del virtual module `virtual:pwa-register/svelte`
     * (de vite-plugin-pwa). Los stores `needRefresh` y `offlineReady` son
     * Svelte writables; usamos `$` prefix para auto-suscribirse.
     *
     * @typedef {import('svelte/store').Writable<boolean>} BoolStore
     * @typedef {Object} Props
     * @property {BoolStore} [needRefresh]
     * @property {BoolStore} [offlineReady]
     * @property {(reloadPage?: boolean) => Promise<void>} [updateServiceWorker]
     */

    /** @type {Props} */
    let { needRefresh, offlineReady, updateServiceWorker } = $props();

    /**
     * Fallback por si ReloadPrompt se monta sin que el padre pase los stores
     * (caso aislado, ej. tests). En producción App.svelte siempre los pasa.
     */
    const fallback = useRegisterSW({});

    const needRefreshStore = $derived(needRefresh || fallback.needRefresh);
    const offlineReadyStore = $derived(offlineReady || fallback.offlineReady);

    /** Resuelve la función de update en el momento del click, no al init. */
    async function reload() {
        const fn = updateServiceWorker || fallback.updateServiceWorker;
        await fn(true);
    }

    function close() {
        needRefreshStore.set(false);
        offlineReadyStore.set(false);
    }
</script>

{#if $needRefreshStore || $offlineReadyStore}
    <div
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md animate-slide-up"
        role="alert"
    >
        <div class="glass-strong rounded-2xl p-4 shadow-2xl shadow-black/50 border border-white/10">
            <div class="flex items-start gap-3">
                <div class="text-2xl shrink-0 mt-0.5">
                    {#if $needRefreshStore}
                        🔄
                    {:else}
                        ✅
                    {/if}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-white">
                        {#if $needRefreshStore}
                            Nueva versión disponible
                        {:else}
                            App lista para usar sin conexión
                        {/if}
                    </div>
                    <div class="text-xs text-gray-300 mt-0.5">
                        {#if $needRefreshStore}
                            Hay cambios listos. Toca Actualizar para recargar.
                        {:else}
                            Ya puedes usar la polla aunque pierdas conexión.
                        {/if}
                    </div>
                </div>
            </div>
            <div class="flex gap-2 mt-3">
                {#if $needRefreshStore}
                    <button
                        type="button"
                        onclick={reload}
                        class="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-xl text-white text-sm font-bold transition-all min-h-10"
                    >
                        Actualizar
                    </button>
                {/if}
                <button
                    type="button"
                    onclick={close}
                    class="flex-1 py-2 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm font-semibold transition-all min-h-10"
                >
                    {$needRefreshStore ? 'Después' : 'Entendido'}
                </button>
            </div>
        </div>
    </div>
{/if}
