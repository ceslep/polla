<script>
    import { onMount } from 'svelte';
    import { useRegisterSW } from 'virtual:pwa-register/svelte';
    import PwaApp from './lib/components/pwa/PwaApp.svelte';

    /**
     * App.svelte (jun-2026) — consolidado como redirector puro.
     *
     * La app principal (WhatsApp upload, ranking main, movement, results,
     * bet table, etc.) está APAGADA. Todo se gestiona a través de la PWA en
     * `/#/apostar`. Este componente:
     *
     *   1. Registra el service worker (vite-plugin-pwa) una sola vez, para
     *      que `ReloadPrompt` (montado desde PwaApp) pueda leer `needRefresh`
     *      y `offlineReady` y forzar la actualización offline.
     *   2. Redirige cualquier hash que NO sea `apostar` o `apostar/...`
     *      hacia `/#/apostar`. Cubre los entry points legacy: `/`, `#/`,
     *      `#/ranking`, `#/participant/<nombre>`.
     */

    const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
        onRegistered(swr) {
            console.log('[PWA] SW registered:', swr?.scope || 'no scope');
            if (swr) {
                setInterval(() => swr.update(), 60 * 60 * 1000);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        swr.update();
                    }
                });
            }
        },
        onRegisterError(error) {
            console.log('[PWA] SW registration error:', error);
        }
    });

    /**
     * Redirige a `/#/apostar` salvo que el hash ya sea de la PWA. Se llama
     * en mount y en cada `hashchange` (cubre deep-links viejos).
     */
    function redirectToPwa() {
        const hash = window.location.hash.slice(2) || '/';
        if (hash === 'apostar' || hash.startsWith('apostar/')) return;
        window.location.hash = '/apostar';
    }

    onMount(() => {
        redirectToPwa();
        window.addEventListener('hashchange', redirectToPwa);
        return () => window.removeEventListener('hashchange', redirectToPwa);
    });
</script>

<PwaApp {needRefresh} {offlineReady} {updateServiceWorker} />
