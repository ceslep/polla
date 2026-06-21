<script>
    import { onMount } from 'svelte';
    import { appState } from '../../stores.svelte.js';
    import { loadWorldCupMatches, loadBetsFromSheets } from '../../api.js';
    import { applyPhoneNameOverrides, parseManualBets } from '../../parser.js';
    import { computeWindowState, matchesOnCotDate, matchLocalToCot } from '../../pwa/window.js';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import { getPwaBets } from '../../api.js';

    import PwaLanding from './PwaLanding.svelte';
    import PwaLogin from './PwaLogin.svelte';
    import PwaRanking from './PwaRanking.svelte';
    import PwaForm from './PwaForm.svelte';
    import PwaDone from './PwaDone.svelte';
    import PwaHistory from './PwaHistory.svelte';

    const isDev = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    /**
     * En dev mode, si la ventana real no tiene matches, fabricamos una ventana
     * "DEV" usando el día COT más cercano (pasado o futuro) para que el form
     * sea testeable. No se hacen llamadas a Sheets en este modo.
     * @param {any[]} rawMatches
     * @param {any} originalState
     * @returns {any}
     */
    function buildDevState(rawMatches, originalState) {
        if (!isDev) return originalState;
        if (originalState.matches && originalState.matches.length > 0) {
            return originalState;
        }
        // Buscar el día COT más cercano con partidos.
        /** @type {Set<string>} */
        const days = new Set();
        for (const m of rawMatches) {
            const cot = matchLocalToCot(m.date, m.time);
            if (cot) days.add(cot.cotDate);
        }
        if (days.size === 0) return originalState;
        const sorted = [...days].sort();
        const todayFmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const today = todayFmt.format(new Date());
        const closest = sorted.find(d => d >= today) || sorted[sorted.length - 1];
        const matches = matchesOnCotDate(rawMatches, closest);
        if (matches.length === 0) return originalState;
        return {
            status: 'open',
            date: closest,
            openAt: null,
            closeAt: null,
            firstMatchLocalTime: '23:59',
            matches,
            message: `DEV MODE: usando partidos del ${closest} (no es la fecha real).`
        };
    }

    /** @type {any} */
    let windowState = $state({
        status: 'upcoming',
        date: null,
        openAt: null,
        closeAt: null,
        firstMatchLocalTime: null,
        matches: null,
        message: 'Cargando partidos…'
    });

    let loading = $state(true);
    let doneSavedCount = $state(0);

    onMount(() => {
        load();
        if (appState.bets.length === 0) {
            loadBets();
        }
    });

    async function loadBets() {
        try {
            const sheetsBets = await loadBetsFromSheets();
            const manualBets = parseManualBets();
            if (sheetsBets.length > 0) {
                const betsToAnalyze = applyPhoneNameOverrides(sheetsBets.map((bet) => ({
                    ...bet,
                    verified: false,
                    status: /** @type {any} */ ('pending'),
                    points: Number(bet.points) || 0
                })));
                appState.bets = [...betsToAnalyze, ...manualBets];
            } else if (manualBets.length > 0) {
                appState.bets = manualBets;
            }
        } catch (e) {
            console.error('Error cargando apuestas:', e);
        }
    }

    async function load() {
        loading = true;
        try {
            const raw = await loadWorldCupMatches();
            const withIds = raw.map((m, i) => ({ ...m, id: i + 1 }));
            let s = computeWindowState(withIds);
            // En dev, si la ventana real no tiene matches, usar el día más cercano
            s = buildDevState(withIds, s);
            if (!isDev && s.status === 'open' && pwaSession.authUsername && pwaSession.authPassword && s.date && pwaSession.date === s.date) {
                const existing = await getPwaBets({
                    username: pwaSession.authUsername,
                    password: pwaSession.authPassword,
                    matchDate: s.date
                });
                if (existing.bets && existing.bets.length > 0) {
                    pwaSession.submitted = true;
                    if (pwaSession.step === 'landing' || pwaSession.step === 'login' || pwaSession.step === 'ranking') {
                        setStep('done');
                    }
                }
            }
            windowState = s;
        } catch (e) {
            console.error('Error cargando partidos:', e);
            windowState = {
                status: 'no-matches',
                date: null,
                openAt: null,
                closeAt: null,
                firstMatchLocalTime: null,
                matches: null,
                message: 'Error al cargar el calendario. Reintenta en unos segundos.'
            };
        } finally {
            loading = false;
        }
    }

    function onLoginBack() {
        setStep('landing');
    }

    function onRankingBack() {
        setStep('landing');
    }

    /** @param {number} savedCount */
    function onDone(savedCount) {
        doneSavedCount = savedCount;
    }
</script>

{#if loading && windowState.status === 'upcoming' && !windowState.matches}
    <div class="min-h-screen bg-[#111] text-white flex flex-col items-center justify-center p-8">
        <div class="text-6xl mb-4 animate-spin">⚙️</div>
        <p class="text-gray-400">Cargando partidos del mundial…</p>
    </div>
{:else if pwaSession.step === 'landing'}
    <PwaLanding state={windowState} {isDev} />
{:else if pwaSession.step === 'login'}
    <PwaLogin onBack={onLoginBack} {isDev} />
{:else if pwaSession.step === 'ranking'}
    <PwaRanking onBack={onRankingBack} />
{:else if pwaSession.step === 'form'}
    <PwaForm windowState={windowState} onDone={onDone} {isDev} />
{:else if pwaSession.step === 'done'}
    <PwaDone date={pwaSession.date || windowState.date} savedCount={doneSavedCount} {isDev} />
{:else if pwaSession.step === 'history'}
    <PwaHistory {isDev} />
{:else}
    <PwaLanding state={windowState} {isDev} />
{/if}
