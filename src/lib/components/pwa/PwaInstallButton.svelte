<script>
    import { getInstallState, promptInstall } from '../../pwa/install.svelte.js';

    const installState = getInstallState();

    async function handleInstall() {
        await promptInstall();
    }
</script>

{#if installState.canShowNative && !installState.installed}
    <button
        type="button"
        onclick={handleInstall}
        class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 rounded-full text-emerald-300 hover:text-emerald-200 text-xs font-medium transition-all backdrop-blur-md shadow-lg shadow-black/20 min-h-9"
        aria-label="Instalar la app en tu dispositivo"
        title="Instalar la app en tu dispositivo"
    >
        <span class="text-sm">📲</span>
        <span class="hidden sm:inline">Instalar</span>
    </button>
{/if}
