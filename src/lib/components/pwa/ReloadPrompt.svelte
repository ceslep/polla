<script>
    import { useRegisterSW } from 'virtual:pwa-register/svelte';

    /**
     * Modal fullscreen que aparece cuando hay una nueva versión del SW
     * disponible. `useRegisterSW` viene del virtual module
     * `virtual:pwa-register/svelte` (de vite-plugin-pwa). Los stores
     * `needRefresh` y `offlineReady` son Svelte writables; usamos el
     * prefijo `$` para auto-suscribirse.
     *
     * Diseñado como modal (no banner) para que el usuario no lo ignore:
     * z-60, backdrop con blur, card centrada. El botón "Después" sólo
     * oculta el modal; `needRefresh` sigue en true, así que reaparece
     * en la próxima navegación dentro de la PWA.
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

    /** Cierra con Escape. */
    /** @param {KeyboardEvent} e */
    function onKeydown(/** @type {KeyboardEvent} */ e) {
        if (e.key === 'Escape') close();
    }

    const isVisible = $derived($needRefreshStore);
</script>

<svelte:window on:keydown={isVisible ? onKeydown : null} />

{#if isVisible}
    <!--
        svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions
    -->
    <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        onclick={close}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reload-prompt-title"
        tabindex="-1"
    >
        <!--
            svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions
            a11y_no_noninteractive_element_interactions
        -->
        <div
            class="w-full max-w-md glass-strong rounded-3xl p-6 shadow-2xl shadow-black/60 border border-white/10 animate-slide-up"
            onclick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            role="presentation"
        >
            <div class="flex items-start gap-4 mb-4">
                <div class="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-white/10 flex items-center justify-center text-3xl">
                    {#if $needRefreshStore}
                        🔄
                    {:else}
                        ✅
                    {/if}
                </div>
                <div class="flex-1 min-w-0">
                    <h2 id="reload-prompt-title" class="text-lg font-bold text-white leading-tight">
                        {#if $needRefreshStore}
                            Nueva versión disponible
                        {:else}
                            App lista para usar sin conexión
                        {/if}
                    </h2>
                    <p class="text-xs text-gray-400 mt-1 font-mono">
                        v{__APP_VERSION__}
                    </p>
                </div>
            </div>

            <p class="text-sm text-gray-200 mb-5 leading-relaxed">
                {#if $needRefreshStore}
                    Estás en <span class="font-mono text-cyan-300">v{__APP_VERSION__}</span>.
                    Hay una versión más reciente con mejoras y correcciones. Toca
                    <strong>Actualizar</strong> para obtenerla — la app se recargará
                    automáticamente.
                {:else}
                    Ya puedes usar la polla aunque pierdas conexión. Los partidos y
                    marcadores se servirán desde el caché del dispositivo.
                {/if}
            </p>

            <div class="flex gap-2">
                {#if $needRefreshStore}
                    <button
                        type="button"
                        onclick={reload}
                        class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 rounded-xl text-white text-sm font-bold transition-all min-h-12 shadow-lg shadow-emerald-500/30"
                    >
                        Actualizar
                    </button>
                {/if}
                <button
                    type="button"
                    onclick={close}
                    class="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm font-semibold transition-all min-h-12"
                >
                    {$needRefreshStore ? 'Después' : 'Entendido'}
                </button>
            </div>
        </div>
    </div>
{/if}
