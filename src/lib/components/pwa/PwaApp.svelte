<script>
    import { appState } from '../../stores.svelte.js';
    import { loadWorldCupMatches, loadBetsFromSheets } from '../../api.js';
    import { applyPhoneNameOverrides, parseManualBets } from '../../parser.js';
    import { computeWindowState } from '../../pwa/window.js';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';
    import { getPwaBets } from '../../api.js';

    import PwaLanding from './PwaLanding.svelte';
    import PwaSelect from './PwaSelect.svelte';
    import PwaPin from './PwaPin.svelte';
    import PwaForm from './PwaForm.svelte';
    import PwaDone from './PwaDone.svelte';
    import PwaHistory from './PwaHistory.svelte';

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

    $effect(() => {
        if (appState.bets.length === 0) {
            loadBets();
        }
    });

    $effect(() => {
        load();
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
            // loadWorldCupMatches() devuelve WorldCupMatchRaw[] (sin `id`).
            // computeWindowState espera RawMatch[] con `id`. Mapeamos aquí.
            const withIds = raw.map((m, i) => ({ ...m, id: i + 1 }));
            const s = computeWindowState(withIds);
            if (s.status === 'open' && pwaSession.phone && s.date && pwaSession.date === s.date) {
                const existing = await getPwaBets({ phone: pwaSession.phone, matchDate: s.date });
                if (existing.length > 0) {
                    pwaSession.submitted = true;
                    if (pwaSession.step === 'landing' || pwaSession.step === 'select' || pwaSession.step === 'pin') {
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

    /** @param {string} name @param {string} phone */
    function onSelect(name, phone) {
        pwaSession.participant = name;
        pwaSession.phone = phone;
        setStep('pin');
    }

    function onPinBack() {
        pwaSession.phone = null;
        setStep('select');
    }

    /** @param {number} savedCount */
    function onDone(savedCount) {
        doneSavedCount = savedCount;
    }

    /** @param {string} date */
    function onLandingPickDate(date) {
        pwaSession.date = date;
    }
</script>

{#if loading && windowState.status === 'upcoming' && !windowState.matches}
    <div class="min-h-screen bg-[#111] text-white flex flex-col items-center justify-center p-8">
        <div class="text-6xl mb-4 animate-spin">⚙️</div>
        <p class="text-gray-400">Cargando partidos del mundial…</p>
    </div>
{:else if pwaSession.step === 'landing'}
    <PwaLanding state={windowState} onPickDate={onLandingPickDate} />
{:else if pwaSession.step === 'select'}
    <PwaSelect onSelect={onSelect} />
{:else if pwaSession.step === 'pin'}
    <PwaPin
        participant={pwaSession.participant || ''}
        phone={pwaSession.phone || ''}
        onBack={onPinBack}
    />
{:else if pwaSession.step === 'form'}
    <PwaForm windowState={windowState} onDone={onDone} />
{:else if pwaSession.step === 'done'}
    <PwaDone date={pwaSession.date || windowState.date} savedCount={doneSavedCount} />
{:else if pwaSession.step === 'history'}
    <PwaHistory />
{:else}
    <PwaLanding state={windowState} onPickDate={onLandingPickDate} />
{/if}
