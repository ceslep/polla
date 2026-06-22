<script>
    import { onMount } from 'svelte';
    import { appState, findMatchForBet } from '../../stores.svelte.js';
    import { loadWorldCupMatches, loadBetsFromSheets, loadAllPwaBets, getPwaBets, compareBetWithMatch } from '../../api.js';
    import { applyPhoneNameOverrides, parseManualBets, normalizeTeamName } from '../../parser.js';
    import { computeWindowState, matchesOnCotDate, matchLocalToCot, tomorrowCot, nowCotParts } from '../../pwa/window.js';
    import { pwaSession, setStep } from '../../pwa/session.svelte.js';

    import PwaLanding from './PwaLanding.svelte';
    import PwaLogin from './PwaLogin.svelte';
    import PwaRanking from './PwaRanking.svelte';
    import PwaChangePassword from './PwaChangePassword.svelte';
    import PwaForm from './PwaForm.svelte';
    import PwaDone from './PwaDone.svelte';
    import PwaHistory from './PwaHistory.svelte';
    import WorldCupResultsModal from '../WorldCupResultsModal.svelte';
    import MovementModal from '../MovementModal.svelte';

    /** @type {{ isDev?: boolean }} */
    let { isDev: isDevProp = undefined } = $props();
    const isDev = $derived(isDevProp !== undefined ? isDevProp : (
        (import.meta?.env?.DEV === true) ||
        (typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ));

    /**
     * En dev mode siempre fabricamos una ventana "open" usando el día COT
     * con partidos más cercano (pasado o futuro), ignorando el estado real
     * (closed / upcoming / open). No se hacen llamadas a Sheets en este modo.
     * Si se pasa `nowOverride`, se fuerza ese día COT como "hoy" para el
     * dev (permite probar con partidos de mañana en local).
     * @param {any[]} rawMatches
     * @param {any} _originalState
     * @param {Date} [nowOverride]
     * @returns {any}
     */
    function buildDevState(rawMatches, _originalState, nowOverride) {
        if (!isDev) return _originalState;
        // Buscar el día COT más cercano con partidos.
        /** @type {Set<string>} */
        const days = new Set();
        for (const m of rawMatches) {
            const cot = matchLocalToCot(m.date, m.time);
            if (cot) days.add(cot.cotDate);
        }
        if (days.size === 0) return _originalState;
        const sorted = [...days].sort();
        const todayFmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
        });
        // Si hay override (ej. "mañana" en dev), usarlo como referencia.
        // Si no, usar el día COT real.
        const refDate = nowOverride || new Date();
        const today = todayFmt.format(refDate);
        let closest = sorted.find(d => d >= today) || sorted[sorted.length - 1];
        // Si hay override, forzar exactamente ese día (debe existir en el set).
        if (nowOverride && days.has(today)) {
            closest = today;
        }
        const matches = matchesOnCotDate(rawMatches, closest);
        if (matches.length === 0) return _originalState;
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
    let doneInfoMessage = $state('');
    /** @type {any[]} */
    let rawMatches = $state([]);
    /** @type {any[]} */
    let pwaScoredBets = $state([]);
    /** @type {any[]} */
    let pwaNormalizedMatches = $state([]);

    /**
     * En dev mode, override de fecha: la PWA simula "mañana" para poder
     * probar el envío de apuestas para partidos futuros. El override se
     * aplica tanto a `computeWindowState` (para mostrar los partidos de
     * mañana) como a `pwaSession.date` (para que el check de "ya envió"
     * compare contra mañana y no haya colisión).
     */
    const nowOverride = $derived(isDev ? tomorrowCot() : null);
    const devTestDate = $derived(nowOverride ? nowCotParts(nowOverride).date : '');

    onMount(() => {
        // En dev: setear pwaSession.date a mañana para que el check de
        // "ya envió apuestas" no se dispare contra hoy.
        if (isDev && devTestDate) {
            pwaSession.date = devTestDate;
        }
        load();
        if (appState.bets.length === 0) {
            loadBets();
        }
    });

    // Cuando el usuario navega a 'movement' o 'ranking', re-fetcheamos los
    // PWA bets para que la data esté fresca (por si el usuario acaba de
    // mandar una apuesta). Sin este re-fetch, los bets se cargan UNA vez
    // en onMount y quedan desactualizados.
    let lastFetchedStep = $state(/** @type {string | null} */ (null));
    $effect(() => {
        const step = pwaSession.step;
        if (step === 'movement' || step === 'ranking') {
            if (lastFetchedStep !== step) {
                lastFetchedStep = step;
                loadAndScorePwaBets();
            }
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

    /**
     * Carga todos los PWA bets (público, sin auth), los transforma al formato
     * estándar de `Bet` y los scorea contra los matches normalizados. El
     * resultado se guarda en `pwaScoredBets` para que MovementModal lo use.
     *
     * Si los matches aún no están cargados (ej. el usuario clickeó
     * "Movimiento" antes de que termine la carga inicial), los carga primero.
     */
    async function loadAndScorePwaBets() {
        try {
            // Fallback: si no hay matches normalizados, cargarlos primero.
            if (pwaNormalizedMatches.length === 0) {
                console.log('[PWA] Matches no cargados, cargando ahora...');
                const raw = await loadWorldCupMatches();
                const withIds = raw.map((m, i) => ({ ...m, id: i + 1 }));
                rawMatches = withIds;
                pwaNormalizedMatches = withIds
                    .filter((/** @type {any} */ m) => m.score?.ft)
                    .map((/** @type {any} */ m) => ({
                        id: m.id,
                        date: m.date,
                        time: m.time,
                        ground: m.ground,
                        homeTeam: normalizeTeamName(m.team1),
                        homeShort: m.team1,
                        awayTeam: normalizeTeamName(m.team2),
                        awayShort: m.team2,
                        homeScore: m.score.ft[0],
                        awayScore: m.score.ft[1]
                    }));
                console.log('[PWA] Matches cargados:', pwaNormalizedMatches.length, 'finalizados de', withIds.length, 'totales');
            }

            const result = await loadAllPwaBets();
            const rawBets = result.bets || [];
            console.log('[PWA] Bets recibidos de la hoja:', rawBets.length);
            if (rawBets.length === 0) {
                pwaScoredBets = [];
                return;
            }

            /**
             * Normaliza un date string a formato YYYY-MM-DD.
             * Soporta: "2026-06-13" (ISO), "6/13/2026" (US), "6/13/26" (US corto).
             * @param {string | number | null | undefined} dateStr
             */
            function normalizeDate(dateStr) {
                if (!dateStr) return '';
                const s = String(dateStr).trim();
                // Ya está en ISO
                const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (isoMatch) {
                    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
                }
                // US format: M/D/YYYY o M/D/YY
                const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
                if (usMatch) {
                    let y = usMatch[3];
                    if (y.length === 2) y = '20' + y;
                    return `${y}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
                }
                // Fallback: Date constructor
                const d = new Date(s);
                if (!isNaN(d.getTime())) {
                    return d.toISOString().slice(0, 10);
                }
                return '';
            }

            /** @type {any[]} */
            const scored = [];
            let skippedNoMatch = 0;
            for (const raw of rawBets) {
                const homeTeam = raw.homeTeam || '';
                const awayTeam = raw.awayTeam || '';
                const homeScore = parseInt(String(raw.homeScore ?? ''), 10);
                const awayScore = parseInt(String(raw.awayScore ?? ''), 10);
                if (!homeTeam || !awayTeam || isNaN(homeScore) || isNaN(awayScore)) {
                    continue;
                }
                const matchDate = normalizeDate(raw.matchDate || raw.date || '');
                /** @type {any} */
                const bet = {
                    id: raw.id,
                    type: 'score',
                    participant: raw.participant || '',
                    phone: raw.phone || '',
                    matchId: raw.matchId ? Number(raw.matchId) : null,
                    matchDate,
                    prediction: {
                        homeTeam,
                        awayTeam,
                        homeScore,
                        awayScore
                    },
                    // Importante: timestamp = matchDate (normalizado a YYYY-MM-DD)
                    // para que findMatchForBet pueda matchear el bet con el partido por día.
                    // (submittedAt es el día que el usuario mandó la apuesta, que es
                    // anterior al día del partido, así que no matchearía.)
                    timestamp: matchDate || normalizeDate(raw.submittedAt || '') || ''
                };
                const match = findMatchForBet(bet, pwaNormalizedMatches);
                if (!match) {
                    // No se encontró match en openfootball. Incluímos el bet
                    // igual con status 'pending' para que el ranking muestre
                    // al participante (con 0 puntos), pero el movement lo ignora.
                    scored.push({
                        ...bet,
                        status: 'pending',
                        points: 0
                    });
                    skippedNoMatch++;
                    continue;
                }
                const cmp = compareBetWithMatch(bet, match);
                scored.push({
                    ...bet,
                    status: cmp.status,
                    points: cmp.points,
                    realResult: cmp.realResult
                });
            }
            pwaScoredBets = scored;
            console.log('[PWA] Bets totales:', scored.length, '— scoreados:', scored.length - skippedNoMatch, '— pending (sin match):', skippedNoMatch);
        } catch (e) {
            console.error('Error cargando PWA bets para movement:', e);
            pwaScoredBets = [];
        }
    }

    async function load() {
        loading = true;
        try {
            const raw = await loadWorldCupMatches();
            const withIds = raw.map((m, i) => ({ ...m, id: i + 1 }));
            // Guardar los matches crudos para que MovementModal los use
            // (no pueden ir a appState.matches porque ese espera formato Match normalizado).
            rawMatches = withIds;
            // Matches normalizados para scoring (computeMovement / findMatchForBet
            // / compareBetWithMatch esperan este formato).
            pwaNormalizedMatches = withIds
                .filter((/** @type {any} */ m) => m.score?.ft)
                .map((/** @type {any} */ m) => ({
                    id: m.id,
                    date: m.date,
                    time: m.time,
                    ground: m.ground,
                    homeTeam: normalizeTeamName(m.team1),
                    homeShort: m.team1,
                    awayTeam: normalizeTeamName(m.team2),
                    awayShort: m.team2,
                    homeScore: m.score.ft[0],
                    awayScore: m.score.ft[1]
                }));
            // Cargar y scorear los PWA bets para que MovementModal los pueda usar.
            await loadAndScorePwaBets();
            // En dev mode, pasar `nowOverride` (mañana) para que la ventana
            // se compute contra la fecha de prueba.
            let s = computeWindowState(withIds, nowOverride || undefined);
            // En dev, si la ventana real no tiene matches, usar el día más cercano.
            // Si hay `nowOverride` (ej. "mañana" en dev), forzamos ese día.
            s = buildDevState(withIds, s, nowOverride || undefined);
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

    /**
     * @param {number} savedCount
     * @param {string} [infoMessage]
     */
    function onDone(savedCount, infoMessage) {
        doneSavedCount = savedCount;
        if (infoMessage) {
            doneInfoMessage = infoMessage;
        }
    }

    function onModalClose() {
        setStep('landing');
    }

    /**
     * Calcula los winners desde los PWA bets scoreados.
     * Misma lógica que `calculateWinners` en MovementModal pero aplicada
     * a los bets que la PWA carga desde la hoja `apuestas` (no a los
     * bets de WhatsApp que viven en `appState.bets`).
     *
     * Incluye TODOS los participantes (incluso con 0 puntos) para que el
     * movement y el ranking los muestren a todos.
     * @param {any[]} scoredBets
     * @returns {Array<{participant: string, points: number, rank: number}>}
     */
    function computePwaWinners(scoredBets) {
        /** @type {Map<string, number>} */
        const pointsByParticipant = new Map();
        // Paso 1: registrar todos los participantes únicos (incluso con 0 puntos).
        for (const bet of scoredBets) {
            if (!bet.participant) continue;
            if (!pointsByParticipant.has(bet.participant)) {
                pointsByParticipant.set(bet.participant, 0);
            }
        }
        // Paso 2: sumar puntos solo de bets scoreados (no pending).
        for (const bet of scoredBets) {
            if (bet.status === 'pending') continue;
            const current = pointsByParticipant.get(bet.participant) || 0;
            pointsByParticipant.set(bet.participant, current + (Number(bet.points) || 0));
        }
        const sorted = [...pointsByParticipant.entries()]
            .map(([participant, points]) => ({ participant, points }))
            .sort((a, b) => b.points - a.points);
        return sorted.map((w, i) => ({ ...w, rank: i + 1 }));
    }
</script>

{#if loading && windowState.status === 'upcoming' && !windowState.matches}
    <div class="min-h-screen bg-[#111] text-white flex flex-col items-center justify-center p-8">
        <div class="text-6xl mb-4 animate-spin">⚙️</div>
        <p class="text-gray-400">Cargando partidos del mundial…</p>
    </div>
{:else if pwaSession.step === 'landing'}
    <PwaLanding state={windowState} {isDev} devTestDate={devTestDate} />
{:else if pwaSession.step === 'login'}
    <PwaLogin onBack={onLoginBack} {isDev} />
{:else if pwaSession.step === 'ranking'}
    <PwaRanking bets={pwaScoredBets} onBack={onRankingBack} />
{:else if pwaSession.step === 'change-password'}
    <PwaChangePassword {isDev} />
{:else if pwaSession.submitted || pwaSession.step === 'done'}
    <!-- Guard: si ya envió apuestas hoy, forzar 'done' sin importar el step -->
    <PwaDone date={pwaSession.date || windowState.date} savedCount={doneSavedCount} infoMessage={doneInfoMessage} {isDev} />
{:else if pwaSession.step === 'form'}
    <PwaForm windowState={windowState} onDone={onDone} {isDev} />
{:else if pwaSession.step === 'history'}
    <PwaHistory {isDev} />
{:else if pwaSession.step === 'results'}
    <div class="text-white">
        <WorldCupResultsModal onClose={onModalClose} />
    </div>
{:else if pwaSession.step === 'movement'}
    <div class="text-white">
        <MovementModal
            bets={pwaScoredBets}
            matches={pwaNormalizedMatches}
            winners={pwaScoredBets.length > 0 ? computePwaWinners(pwaScoredBets) : []}
            onClose={onModalClose}
            onRefresh={() => loadAndScorePwaBets()}
        />
    </div>
{:else}
    <PwaLanding state={windowState} {isDev} />
{/if}
