<script>
    /**
     * SyncStatus — chip de "última actualización" + botón recargar.
     *
     * Muestra hace cuánto se sincronizaron los datos con Google Sheets /
     * OpenFootball (fuente: `appState.sync`) y un botón ↻ para recargar a
     * demanda. El color del punto refleja la frescura:
     *   verde = fresco (<60s), cyan = ok, ámbar = añejo (>5min),
     *   gris = sin conexión, spinner = recargando.
     *
     * El padre pasa `onRefresh` (el handler `refreshData(fase)` de PwaApp).
     * El componente NO conoce la fase — solo dispara el callback y refleja
     * `appState.sync.refreshing` que el handler activa/desactiva.
     *
     * @typedef {Object} Props
     * @property {() => (void | Promise<void>)} [onRefresh]
     * @property {boolean} [compact]  - oculta el texto, deja solo punto + botón
     */
    import { syncAgeLabel, syncStatusKind, appState } from '../../stores.svelte.js';

    /** @type {Props} */
    let { onRefresh = () => {}, compact = false } = $props();

    /** Reloj reactivo: sube cada segundo para refrescar la etiqueta "hace Xs". */
    let now = $state(Date.now());
    $effect(() => {
        const id = setInterval(() => { now = Date.now(); }, 1000);
        return () => clearInterval(id);
    });

    const kind = $derived(syncStatusKind(now));
    const label = $derived(syncAgeLabel(now));

    const dotClass = $derived.by(() => {
        switch (kind) {
            case 'fresh': return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]';
            case 'ok': return 'bg-cyan-400';
            case 'stale': return 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]';
            case 'offline': return 'bg-gray-500';
            case 'empty': return 'bg-gray-600';
            default: return 'bg-cyan-400';
        }
    });

    const text = $derived.by(() => {
        switch (kind) {
            case 'refreshing': return 'Actualizando…';
            case 'offline': return 'Sin conexión';
            case 'stale': return `${label} · desactualizado`;
            case 'empty': return 'Sin datos';
            default: return `Act. ${label}`;
        }
    });

    const refreshing = $derived(appState.sync.refreshing);

    async function handleClick() {
        if (refreshing || !appState.sync.online) return;
        await onRefresh();
    }
</script>

<div
    class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full glass border border-white/10 text-[11px] md:text-xs"
    role="status"
    aria-live="polite"
>
    {#if kind === 'refreshing'}
        <span
            class="w-2 h-2 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin"
            aria-hidden="true"
        ></span>
    {:else}
        <span class="w-2 h-2 rounded-full {dotClass}" aria-hidden="true"></span>
    {/if}

    {#if !compact}
        <span class="{kind === 'stale' ? 'text-amber-300' : 'text-gray-300'} whitespace-nowrap tabular-nums">
            {text}
        </span>
    {/if}

    <button
        type="button"
        onclick={handleClick}
        disabled={refreshing || !appState.sync.online}
        class="ml-0.5 w-6 h-6 -mr-1 flex items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed {kind === 'stale' ? 'text-amber-300 bg-amber-400/10' : ''}"
        aria-label="Recargar datos"
        title="Recargar datos"
    >
        <span class="text-sm {refreshing ? 'animate-spin' : ''}" aria-hidden="true">↻</span>
    </button>
</div>
