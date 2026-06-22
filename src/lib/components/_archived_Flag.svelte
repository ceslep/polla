<script>
    import { getFlagData } from '../flags.js';

    let { teamName, size = 'md' } = $props();

    const data = $derived(getFlagData(teamName));

    const sizeClasses = $derived({
        sm: 'h-4 w-6',
        md: 'h-5 w-7',
        lg: 'h-6 w-9'
    }[size] || 'h-5 w-7');
</script>

{#if data}
    <span class="inline-flex items-center gap-1.5">
        <img src={data.flag} class={sizeClasses} alt={data.spanishName} title={data.spanishName} />
        <span>{data.spanishName}</span>
    </span>
{:else}
    <span>{teamName}</span>
{/if}
