<script>
    import { appState, safeFormatDate } from '../stores.svelte.js';
    import { collectParserWorkarounds } from '../parser.js';

    /** @type {{ onClose: () => void }} */
    let { onClose } = $props();

    /**
     * @param {Date} d
     * @returns {string}
     */
    function formatLocalDate(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * @param {string} dateStr
     * @returns {string}
     */
    function formatDateLong(dateStr) {
        if (!dateStr) return '-';
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return dateStr;
        try {
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch { return dateStr; }
    }

    const todayStr = formatLocalDate(new Date());

    /** @type {Record<string, string>} */
    const dateBounds = $derived.by(() => {
        /** @type {string[]} */
        const all = [];
        for (const bet of appState.bets) {
            const d = safeFormatDate(bet.timestamp);
            if (d) all.push(d);
        }
        all.sort();
        if (all.length === 0) return { min: todayStr, max: todayStr };
        return { min: all[0], max: all[all.length - 1] };
    });

    let selectedDate = $state(todayStr);

    $effect(() => {
        if (selectedDate < dateBounds.min) selectedDate = dateBounds.min;
        if (selectedDate > dateBounds.max) selectedDate = dateBounds.max;
    });

    /**
     * @typedef {{
     *   messageId: string,
     *   participant: string,
     *   phone: string,
     *   timestamp: string,
     *   originalMessage: string,
     *   derivedBets: any[]
     * }} MessageGroup
     */

    /** @type {MessageGroup[]} */
    const groups = $derived.by(() => {
        /** @type {Map<string, MessageGroup>} */
        const map = new Map();
        for (const bet of appState.bets) {
            if (!bet || !bet.messageId) continue;
            if (!map.has(bet.messageId)) {
                map.set(bet.messageId, {
                    messageId: bet.messageId,
                    participant: bet.participant || 'Desconocido',
                    phone: bet.phone || '',
                    timestamp: bet.timestamp || '',
                    originalMessage: bet.originalMessage || '',
                    derivedBets: []
                });
            }
            const group = map.get(bet.messageId);
            if (group) group.derivedBets.push(bet);
        }
        return [...map.values()];
    });

    /** @type {Array<MessageGroup & { issues: import('../parser.js').ParserIssue[] }>} */
    const reports = $derived.by(() => {
        const out = [];
        for (const g of groups) {
            if (safeFormatDate(g.timestamp) !== selectedDate) continue;
            const issues = collectParserWorkarounds(g.originalMessage, g.derivedBets);
            if (issues.length === 0) continue;
            out.push({ ...g, issues });
        }
        out.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        return out;
    });

    const totalIssues = $derived(reports.reduce((sum, r) => sum + r.issues.length, 0));

    /**
     * @param {'low'|'medium'|'high'} sev
     * @returns {{ dot: string, label: string }}
     */
    function severityStyle(sev) {
        switch (sev) {
            case 'high': return { dot: 'bg-red-500', label: 'text-red-300' };
            case 'medium': return { dot: 'bg-amber-500', label: 'text-amber-300' };
            case 'low': return { dot: 'bg-cyan-500', label: 'text-cyan-300' };
            default: return { dot: 'bg-gray-500', label: 'text-gray-300' };
        }
    }

    /** @param {string} type */
    function typeLabel(type) {
        switch (type) {
            case 'score': return 'Partido';
            case 'champion': return 'Campeón';
            case 'runnerup': return 'Subcampeón';
            case 'topscorer': return 'Goleador';
            default: return type;
        }
    }

    /**
     * Construye un mensaje en español, listo para pegar en WhatsApp,
     * dirigido al participante cuyo mensaje tuvo problemas de formato.
     * No incluye el mensaje original, ni issues detallados, ni ejemplos
     * de marcadores, para evitar que el parser se confunda si el admin
     * reenvía el texto al grupo.
     * @param {MessageGroup & { issues: import('../parser.js').ParserIssue[] }} r
     * @returns {string}
     */
    function buildWhatsAppTextForReport(r) {
        const lines = [];
        lines.push(`*Hola ${r.participant}* 👋`);
        lines.push('');
        lines.push('En la *Polla del Mundial 2026* tu mensaje no se pudo registrar porque tiene problemas con los nombres de los países.');

        const unknownTeams = r.issues
            .filter((i) => i.code === 'unknown_team' && i.snippet)
            .map((i) => i.snippet || '')
            .filter(Boolean);
        const uniqueTeams = [...new Set(unknownTeams)];
        if (uniqueTeams.length > 0) {
            lines.push('');
            lines.push('*Países que escribiste y no se reconocieron:*');
            for (const team of uniqueTeams) lines.push(`• ${team}`);
            lines.push('');
            lines.push('Por favor revisa la escritura de esos países (respetando tildes, mayúsculas y nombres completos como «Bosnia & Herzegovina», «Curaçao» o «República Checa») y vuelve a enviar tu mensaje.');
        } else {
            lines.push('');
            lines.push('Por favor revisa el formato de tu mensaje y vuelve a enviarlo para que las apuestas queden registradas correctamente.');
        }

        lines.push('');
        lines.push('⚠️ *¡Importante! Elimina tu propio mensaje y luego coloca correctamente.*');
        lines.push('');
        lines.push('Gracias 🙏');
        return lines.join('\n');
    }

    /**
     * @param {Array<MessageGroup & { issues: import('../parser.js').ParserIssue[] }>} reports
     * @returns {string}
     */
    function buildWhatsAppTextForAll(reports) {
        if (reports.length === 0) return '';
        const lines = [];
        lines.push('*Polla Mundial 2026 — Mensajes con formato dudoso* ⚠️');
        lines.push('');
        lines.push('Lista de participantes que deben revisar y reenviar sus apuestas:');
        lines.push('');
        for (const r of reports) {
            lines.push('━━━━━━━━━━━━━━━━━━');
            lines.push(buildWhatsAppTextForReport(r));
            lines.push('');
        }
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push('⚠️ *Recuerda: si tu mensaje aparece en este listado, elimina tu propio mensaje y vuelve a enviarlo con el formato correcto.*');
        return lines.join('\n');
    }

    /** @type {Record<string, string | null>} */
    let copyFeedback = $state({});
    /** @type {string | null} */
    let copyAllFeedback = $state(null);

    /**
     * @param {string} messageId
     * @param {string} text
     */
    function copyToClipboard(messageId, text) {
        if (!navigator.clipboard || !text) return;
        navigator.clipboard.writeText(text).then(
            () => {
                copyFeedback[messageId] = '¡Copiado!';
                setTimeout(() => {
                    if (copyFeedback[messageId] === '¡Copiado!') copyFeedback[messageId] = null;
                }, 2000);
            },
            () => {
                copyFeedback[messageId] = 'Error al copiar';
                setTimeout(() => {
                    if (copyFeedback[messageId] === 'Error al copiar') copyFeedback[messageId] = null;
                }, 2500);
            }
        );
    }

    function copyAllToClipboard() {
        const text = buildWhatsAppTextForAll(reports);
        if (!text || !navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(
            () => {
                copyAllFeedback = '¡Copiado!';
                setTimeout(() => {
                    if (copyAllFeedback === '¡Copiado!') copyAllFeedback = null;
                }, 2000);
            },
            () => {
                copyAllFeedback = 'Error al copiar';
                setTimeout(() => {
                    if (copyAllFeedback === 'Error al copiar') copyAllFeedback = null;
                }, 2500);
            }
        );
    }

    function jumpToToday() {
        selectedDate = todayStr;
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-gray-900 text-white border border-white/10 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
        <div class="p-6 border-b border-white/10 flex flex-col gap-4 md:flex-row md:justify-between md:items-center flex-shrink-0">
            <div>
                <h2 class="text-xl font-bold text-amber-400 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>Mensajes con formato dudoso</span>
                </h2>
                <p class="text-xs text-gray-400 mt-1">
                    {reports.length} mensaje{reports.length === 1 ? '' : 's'} · {totalIssues} issue{totalIssues === 1 ? '' : 's'} el {formatDateLong(selectedDate)}
                </p>
            </div>
            <div class="flex items-center gap-2">
                <label for="malformed-date" class="text-xs text-gray-400 hidden sm:inline">Fecha:</label>
                <input
                    id="malformed-date"
                    type="date"
                    bind:value={selectedDate}
                    min={dateBounds.min}
                    max={dateBounds.max}
                    class="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
                <button
                    class="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                    onclick={jumpToToday}
                    disabled={selectedDate === todayStr}
                >
                    Hoy
                </button>
                <button class="text-gray-400 hover:text-white text-2xl ml-1" onclick={onClose} aria-label="Cerrar">&times;</button>
            </div>
        </div>

        <div class="p-6 space-y-4 overflow-y-auto flex-1">
            {#if reports.length === 0}
                <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
                    <div class="text-5xl mb-3">✅</div>
                    <div class="text-emerald-300 font-bold">Sin mensajes dudosos para esta fecha</div>
                    <p class="text-gray-400 text-sm mt-1">El parser no tuvo que aplicar workarounds sobre los mensajes del {formatDateLong(selectedDate)}.</p>
                </div>
            {:else}
                {#each reports as r (r.messageId)}
                    <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div class="flex items-start justify-between gap-3 mb-3">
                            <div class="min-w-0 flex-1">
                                <div class="text-white font-semibold truncate">{r.participant}</div>
                                <div class="text-xs text-gray-500">
                                    {r.phone || 'sin teléfono'} · {r.timestamp || '-'}
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-xs text-gray-400">{r.issues.length} issue{r.issues.length === 1 ? '' : 's'}</span>
                                <button
                                    type="button"
                                    class="text-xs px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onclick={() => copyToClipboard(r.messageId, buildWhatsAppTextForReport(r))}
                                    title="Copiar texto para WhatsApp"
                                >
                                    {copyFeedback[r.messageId] ?? '📋 Copiar'}
                                </button>
                            </div>
                        </div>

                        <pre class="bg-black/30 border border-white/5 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap break-words font-mono mb-3">{r.originalMessage || '(mensaje vacío)'}</pre>

                        <div class="space-y-1.5 mb-3">
                            {#each r.issues as issue}
                                {@const style = severityStyle(issue.severity)}
                                <div class="flex items-start gap-2 text-sm">
                                    <span class="w-2 h-2 rounded-full {style.dot} mt-1.5 shrink-0"></span>
                                    <div class="min-w-0 flex-1">
                                        <span class={style.label}>{issue.label}</span>
                                        {#if issue.snippet}
                                            <code class="ml-1 px-1.5 py-0.5 rounded bg-black/30 text-gray-300 text-xs">«{issue.snippet}»</code>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>

                        <div class="flex flex-wrap gap-1.5">
                            {#each r.derivedBets as bet}
                                <span class="px-2 py-0.5 rounded text-xs {
                                    bet.type === 'score' ? 'bg-blue-500/20 text-blue-300' :
                                    bet.type === 'champion' ? 'bg-yellow-500/20 text-yellow-300' :
                                    bet.type === 'runnerup' ? 'bg-purple-500/20 text-purple-300' :
                                    'bg-gray-500/20 text-gray-300'
                                }">
                                    {typeLabel(bet.type)}{bet.bet_text ? `: ${bet.bet_text}` : ''}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

        <div class="p-6 bg-white/5 border-t border-white/10 flex flex-wrap justify-between items-center gap-3 flex-shrink-0">
            <span class="text-xs text-gray-500">Datos desde Google Sheets (no editable aquí).</span>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="px-4 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={copyAllToClipboard}
                    disabled={reports.length === 0}
                    title="Copiar todos los mensajes para WhatsApp"
                >
                    {copyAllFeedback ?? '📋 Copiar todo para WhatsApp'}
                </button>
                <button
                    class="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors"
                    onclick={onClose}
                >
                    Cerrar
                </button>
            </div>
        </div>
    </div>
</div>
