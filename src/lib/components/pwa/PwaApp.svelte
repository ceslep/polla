<script>
    import { onMount } from 'svelte';
    import { findMatchForBet } from '../../stores.svelte.js';
    import { loadWorldCupMatches, loadAllPwaBets, loadAllPwaBetsParte2, getPwaBets, compareBetWithMatch, getTournamentBetsForParticipant } from '../../api.js';
    import { normalizeTeamName } from '../../parser.js';
    import { computeWindowState, matchesOnCotDate, matchLocalToCot, todayCot, nowCotParts } from '../../pwa/window.js';
    import { getFirstMatchUtcMs, isPreMatch, PREMATCH_BUFFER_MS } from '../../pwa/prematchGuard.js';
    import { pwaSession, setStep, logout, completeEmailPrompt, completeTournamentBets, hasSeenPwaTour, markPwaTourSeen, hasSeenPwaIntro, markPwaIntroSeen, hasSeenGoal } from '../../pwa/session.svelte.js';

    import PwaLanding from './PwaLanding.svelte';
    import PwaLogin from './PwaLogin.svelte';
    import PwaRanking from './PwaRanking.svelte';
    import PwaRankingParte2 from '../parte2/PwaRankingParte2.svelte';
    import PwaChangePassword from './PwaChangePassword.svelte';
    import PwaEmailPromptModal from './PwaEmailPromptModal.svelte';
    import PwaForm from './PwaForm.svelte';
    import PwaTournamentBetsForm from './PwaTournamentBetsForm.svelte';
    import PwaDone from './PwaDone.svelte';
    import PwaHistory from './PwaHistory.svelte';
    import PwaTodayBets from './PwaTodayBets.svelte';
    import PwaRootPanel from './PwaRootPanel.svelte';
    import ReloadPrompt from './ReloadPrompt.svelte';
    import CacheClearButton from './CacheClearButton.svelte';
    import PwaInstallButton from './PwaInstallButton.svelte';
    import PwaMissingBetsButton from './PwaMissingBetsButton.svelte';
    import PwaWorldCupResultsModal from './PwaWorldCupResultsModal.svelte';
    import PwaMovementModal from './PwaMovementModal.svelte';
    import PwaMovementModalParte2 from '../parte2/PwaMovementModalParte2.svelte';
    import PwaSquadsModal from './PwaSquadsModal.svelte';
    import PwaIntro from './PwaIntro.svelte';
    import PwaGoalOverlay from './PwaGoalOverlay.svelte';
    import OnboardingTour from '../OnboardingTour.svelte';
    import TutorialPage from '../TutorialPage.svelte';
    import { tourSteps } from '../tutorialSteps.js';

    /**
     * Disparador del tour in-app. Se activa tras el primer login exitoso
     * si el usuario nunca vio el tour (flag en sessionStorage).
     */
    let triggerOnboardingTour = $state(false);

    /**
     * Intro Three.js: se reproduce una vez por sesión al montar PwaApp.
     * `showIntro` empieza en `true` si no hay flag en sessionStorage
     * (primera visita) y en `false` si ya lo vio en esta pestaña.
     * `hasSeenPwaIntro()` retorna `false` ante cualquier error de lectura
     * → default seguro = mostrar el intro. Cuando el componente termina su
     * animación, llama `handleIntroClose()` que persiste el flag y desmonta
     * el overlay. Mientras el intro corre, la carga de partidos ocurre
     * detrás (`load()` se llama igual en `onMount`).
     */
    let showIntro = $state(!hasSeenPwaIntro());

    function handleIntroClose() {
        markPwaIntroSeen();
        showIntro = false;
    }

    async function handleTourDone() {
        triggerOnboardingTour = false;
        markPwaTourSeen();
    }

    /**
     * Llamado por PwaLogin / PwaChangePassword cuando el usuario termina
     * de autenticarse (login o cambio de password). Si nunca vio el tour,
     * dispara el Driver.js overlay. Caso contrario, va directo al form.
     * @param {string} [participant]
     * @param {string} [phone]
     */
    function handleAuthSuccess(participant, phone) {
        existingBets = [];
        tournamentBets = null;
        tournamentLocked = false;
        if (!hasSeenPwaTour()) {
            // Pequeño delay para que el form termine de montar y los
            // selectores [data-pwa-tutorial] existan en el DOM.
            setTimeout(() => {
                triggerOnboardingTour = true;
            }, 350);
        }
    }

    /**
     * Llamado por PwaChangePassword cuando el backend confirmó el cambio de
     * contraseña. El componente ya llamó a `completePasswordChange()` que
     * movió el step a 'email-prompt', así que el render block se hace cargo.
     */
    function handlePasswordChanged() {
        // No-op: PwaChangePassword invocó completePasswordChange() que
        // movió el step a 'email-prompt'. La rama de render correspondiente
        // montará PwaEmailPromptModal en el próximo tick.
    }

    /**
     * Llamado por PwaEmailPromptModal al cerrarse (con o sin email guardado).
     * Avanza el step a 'form' y dispara el tour si corresponde.
     */
    function handleEmailPromptClose() {
        completeEmailPrompt();
        handleAuthSuccess(pwaSession.authParticipant || undefined, pwaSession.authPhone || undefined);
    }

    function closeTutorial() {
        setStep('landing');
    }

    /**
     * @typedef {Object} PwaAppProps
     * @property {boolean} [isDev]
     * @property {import('svelte/store').Writable<boolean>} [needRefresh]
     * @property {import('svelte/store').Writable<boolean>} [offlineReady]
     * @property {(reloadPage?: boolean) => Promise<void>} [updateServiceWorker]
     */

    /** @type {PwaAppProps} */
    let { isDev: isDevProp = undefined, needRefresh, offlineReady, updateServiceWorker } = $props();
    const isDev = $derived(isDevProp !== undefined ? isDevProp : (
        (import.meta.env.VITE_PWA_DISABLE_DEV !== 'true') &&
        (
            (import.meta.env.DEV === true) ||
            (typeof window !== 'undefined' &&
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
        )
    ));
    $effect(() => {
        console.log('[PwaApp] dev detection:', {
            isDevProp: isDevProp !== undefined ? 'set' : 'unset',
            viteDisableDev: import.meta.env.VITE_PWA_DISABLE_DEV,
            viteDev: import.meta.env.DEV,
            hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
            isDev
        });
    });

    /**
     * En dev mode siempre fabricamos una ventana "open" usando el día COT
     * con partidos más cercano (pasado o futuro), ignorando el estado real
     * (closed / upcoming / open). No se hacen llamadas a Sheets en este modo.
     * Si se pasa `nowOverride`, se fuerza ese día COT como "hoy" para el
     * dev (permite probar con partidos de hoy en local).
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
        // Si hay override (ej. "hoy" en dev), usarlo como referencia.
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
    /**
     * Modo de PwaDone. Solo se usa 'success' (recién envió, con confeti).
     * 'already-submitted' ya no se asigna: cuando hay bets previos, PwaForm
     * se renderiza en read-only en lugar de redirigir a PwaDone.
     * @type {'success' | 'already-submitted'}
     */
    let doneMode = $state('success');
    /** Token de concurrencia para el effect "ya apostó" — evita race conditions
     *  si el step cambia entre el disparo del check y la respuesta. */
    let alreadyBetCheckToken = 0;
    /** @type {any[]} */
    let rawMatches = $state([]);
    /** @type {any[]} */
    let pwaScoredBets = $state([]);
    /** Bets de parte 2 (hoja `apuestas2`) scoreados, para el ranking de parte 2. */
    /** @type {any[]} */
    let pwaScoredBetsParte2 = $state([]);
    /** @type {any[]} */
    let pwaNormalizedMatches = $state([]);
    /** Bets del día ya guardados por el participante autenticado. Si está
     *  no vacío, PwaForm se renderiza en read-only con los marcadores
     *  prellenados (en lugar de redirigir a PwaDone mode='already-submitted'). */
    let existingBets = $state(/** @type {any[]} */ ([]));
    /** Apuestas de torneo del participante autenticado (campeón, subcampeón,
     *  tercer lugar, goleador). Si `tournamentLocked` es true, ya las tiene
     *  registradas y se muestran en read-only dentro de PwaForm. Si faltan,
     *  el gate fuerza el step 'tournament-bets' antes del form. */
    let tournamentBets = $state(/** @type {{champion: string|null, runnerup: string|null, thirdplace: string|null, topscorer: string|null, hasAll: boolean} | null} */ (null));
    let tournamentLocked = $state(false);
    /** Token de concurrencia para el gate de torneo (mismo patrón que
     *  alreadyBetCheckToken): descarta respuestas tardías tras logout. */
    let tournamentCheckToken = 0;
    /** Target seleccionado en el panel root. Cuando está set, PwaForm se
     *  renderiza en mode='root' y los bets se guardan a nombre del target.
     *  Limpiado en handleRootComplete (logout) y handleRootCancel (volver
     *  al panel). */
    /** @type {{name: string, phone: string} | null} */
    let rootTarget = $state(/** @type {any} */ (null));
    /** Controla la visibilidad del modal de plantillas. */
    let showSquadsModal = $state(false);

    /**
     * En dev mode, override de fecha: la PWA simula "hoy" (en COT) para
     * poder probar el envío de apuestas para los partidos del día actual.
     * El override se aplica tanto a `computeWindowState` (para mostrar
     * los partidos de hoy) como a `pwaSession.date` (para que el check
     * de "ya envió" opere contra el mismo día simulado).
     */
    const nowOverride = $derived(isDev ? todayCot() : null);
    const devTestDate = $derived(nowOverride ? nowCotParts(nowOverride).date : '');
    /** Fecha COT que la PWA está mostrando como "hoy" (en dev = devTestDate, en prod = hoy real). */
    const todayDate = $derived(devTestDate || nowCotParts(new Date()).date);

    // ---- Pre-match password gate (consumido por PwaLanding/PwaShareBets
    //      y PwaTodayBets vía `preMatchInfo`). Se calcula acá una sola vez
    //      porque PwaApp es el único que tiene acceso a `rawMatches` (la
    //      lista completa de openfootball). `pwaNormalizedMatches` SOLO
    //      contiene partidos finalizados, así que NO sirve para detectar
    //      el primer partido de un día futuro.

    /** @type {number} ms epoch en UTC. Refresca cada 30s para que el
     *  gate se desactive solo cuando llega el cutoff. */
    let nowUtcMs = $state(Date.now());
    $effect(() => {
        const id = setInterval(() => { nowUtcMs = Date.now(); }, 30000);
        return () => clearInterval(id);
    });

    /**
     * @typedef {Object} PreMatchInfo
     * @property {boolean} required  - true si la puerta debe estar visible
     * @property {string | null} firstMatchHHMM - 'HH:MM' en COT del primer partido del día, o null
     */

    /** @type {PreMatchInfo} */
    const preMatchInfo = $derived.by(() => {
        const utc = getFirstMatchUtcMs(rawMatches, todayDate);
        if (utc == null) return { required: false, firstMatchHHMM: null };
        return {
            required: isPreMatch(utc, nowUtcMs),
            firstMatchHHMM: (() => {
                const fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false
                });
                return fmt.format(new Date(utc));
            })()
        };
    });

    // ---- Auto-reload en cortes horarios --------------------------------
    // Cuando el cronómetro de la landing llega a cero (ventana abre/cierra)
    // o cuando vence el gate pre-partido, recargamos suavemente la app para
    // que se activen las opciones dependientes de la hora. En dev se omite.

    /** @type {string} */
    const AUTO_RELOAD_GUARD_KEY = 'pwaLastAutoReloadAt';
    const AUTO_RELOAD_COOLDOWN_MS = 90_000;

    function canAutoReload() {
        if (isDev) return false;
        try {
            const last = Number(sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY));
            if (last && Date.now() - last < AUTO_RELOAD_COOLDOWN_MS) return false;
        } catch {
            // sessionStorage no disponible: permitir el reload de todos modos.
        }
        return true;
    }

    function markAutoReload() {
        try {
            sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, String(Date.now()));
        } catch {
            // noop
        }
    }

    /** Llamado por PwaLanding cuando el contador llega a cero. */
    function handleCountdownZero() {
        if (!canAutoReload()) return;
        markAutoReload();
        load();
    }

    // Programa un reload exacto cuando vence el gate pre-partido (1 min antes
    // del primer partido). Esto complementa el intervalo de 30 s de nowUtcMs.
    $effect(() => {
        if (isDev || !preMatchInfo.required) return;
        const utc = getFirstMatchUtcMs(rawMatches, todayDate);
        if (utc == null) return;
        const cutoff = utc - PREMATCH_BUFFER_MS;
        const delay = cutoff - Date.now();
        if (delay <= 0) return;
        const id = setTimeout(() => {
            if (!canAutoReload()) return;
            markAutoReload();
            load();
        }, delay);
        return () => clearTimeout(id);
    });

    onMount(() => {
        // En dev: setear pwaSession.date a la fecha simulada (hoy en COT)
        // para que el check de "ya envió apuestas" no se dispare contra
        // una fecha distinta.
        if (isDev && devTestDate) {
            pwaSession.date = devTestDate;
        }
        load();
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
        } else if (step === 'ranking2') {
            if (lastFetchedStep !== step) {
                lastFetchedStep = step;
                loadAndScorePwaBetsParte2();
            }
        }
    });

    /**
     * Detección post-autenticación de "ya apostó hoy". Se dispara cada vez
     * que el step pasa a 'form' con credenciales y fecha listas. El backend
     * es idempotente (save_pwa_bet.php retorna saved=0 + alreadyExists=N si
     * los ids ya están) pero la UX es fea: el usuario llena marcadores y
     * recién al enviar se entera de que ya había apostado. Con este check
     * dejamos PwaForm listo para renderizarse en read-only con los bets
     * prellenados (banner "Ya enviaste", sin botón Enviar).
     *
     * En dev mode el check se salta: PwaApp.buildDevState() siempre abre
     * la ventana y queremos poder iterar marcadores libremente.
     *
     * Race condition: si el usuario hace logout justo después del disparo,
     * la respuesta tardía se descarta comparando `alreadyBetCheckToken`.
     */
    $effect(() => {
        const step = pwaSession.step;
        if (isDev) return;
        if (step !== 'form') return;
        if (!pwaSession.authUsername || !pwaSession.authPassword) return;
        if (!pwaSession.date) return;
        // En root mode el chequeo de "ya envió" se hace contra el TARGET
        // (en PwaRootPanel via getPwaBetsByPhoneRoot). Si lo corriéramos
        // acá contra el root, no encontraría nada (el root rara vez apuesta
        // por sí mismo) y pasaríamos al form en modo writable — lo cual
        // está bien, pero el check contra el target ya bloqueó en el panel.
        // Lo skipeamos para evitar trabajo redundante y ruido en la consola.
        if (pwaSession.isRoot) return;

        const myToken = ++alreadyBetCheckToken;
        const date = pwaSession.date;
        const username = pwaSession.authUsername;
        const password = pwaSession.authPassword;

        (async () => {
            try {
                const result = await getPwaBets({
                    username,
                    password,
                    matchDate: date
                });
                if (myToken !== alreadyBetCheckToken) return;
                if (result.bets && result.bets.length > 0) {
                    pwaSession.submitted = true;
                    existingBets = result.bets;
                    // El form se va a renderizar en read-only con estos bets.
                    // Cancelar el tour que PwaLogin agendó: no tiene sentido
                    // para un usuario que ya envió.
                    triggerOnboardingTour = false;
                }
            } catch (e) {
                // Si falla el check (Sheets caído, timeout), dejamos que el
                // form se muestre: el backend sigue siendo idempotente.
                console.warn('No pude verificar apuestas previas:', e);
            }
        })();
    });

    /**
     * Gate de apuestas de torneo. Antes de dejar entrar al form de marcadores,
     * verifica que el participante tenga registradas las 4 apuestas de torneo
     * (campeón, subcampeón, tercer lugar, goleador). Si las tiene, las guarda
     * en `tournamentBets` + marca `tournamentLocked` para que PwaForm las
     * muestre en read-only. Si faltan, redirige al step 'tournament-bets'
     * (formulario obligatorio).
     *
     * Se salta en root mode. En dev también debe correr, porque la
     * verificación de apuestas de torneo es justamente lo que queremos
     * probar durante desarrollo.
     * Si el usuario ya envió marcadores hoy (existingBets no vacío) NO se le
     * fuerza el formulario: pudo haber apostado antes de existir esta feature.
     * Misma defensa de concurrencia que el check anterior (tournamentCheckToken).
     */
    $effect(() => {
        const step = pwaSession.step;
        if (step !== 'form') return;
        if (pwaSession.isRoot) return;
        if (!pwaSession.authParticipant) return;

        const myToken = ++tournamentCheckToken;
        const participant = pwaSession.authParticipant;

        (async () => {
            try {
                const result = await getTournamentBetsForParticipant(participant, pwaSession.authPhone || undefined);
                if (myToken !== tournamentCheckToken) return;
                tournamentBets = result;
                tournamentLocked = result.hasAll;
                // Si falta cualquiera de las 4 apuestas, forzamos el formulario
                // obligatorio antes del form de marcadores. Cuando el usuario
                // ya tiene las 4, el form normal continúa y las muestra bloqueadas.
                if (!result.hasAll) {
                    setStep('tournament-bets');
                }
            } catch (e) {
                // Si falla el check, dejamos pasar al form: el backend de
                // marcadores es independiente y sigue siendo idempotente.
                console.warn('No pude verificar apuestas de torneo:', e);
            }
        })();
    });

    // ---- Goal animation overlay -----------------------------------------
    // Cuando el usuario entra a 'ranking' o 'today-bets' (vistas públicas
    // de resultados), disparamos la animación Three.js de gol. Se reproduce
    // UNA vez por step por sesión (mismo patrón que el intro y el tour);
    // back-and-forth está protegido por un throttle mínimo de 1.5s.
    let showGoalOverlay = $state(false);
    let lastGoalStep = $state(/** @type {string | null} */ (null));
    let lastGoalAt = 0;
    const GOAL_THROTTLE_MS = 1500;

    $effect(() => {
        const step = pwaSession.step;
        if (step !== 'ranking' && step !== 'today-bets') return;
        if (lastGoalStep === step) return; // ya disparado en este step
        if (hasSeenGoal(step)) {
            // Ya se mostró en esta sesión: solo registramos el último step
            // para que un eventual reset (consola) pueda re-dispararlo.
            lastGoalStep = step;
            return;
        }
        const now = performance.now();
        if (now - lastGoalAt < GOAL_THROTTLE_MS) {
            // Re-entry demasiado rápido; ignorar.
            lastGoalStep = step;
            return;
        }
        lastGoalStep = step;
        lastGoalAt = now;
        console.log(`[PwaApp] Disparando animación de gol para step=${step}`);
        showGoalOverlay = true;
    });

    function handleGoalClose() {
        showGoalOverlay = false;
    }

    /**
     * Garantiza que `pwaNormalizedMatches` esté poblado. Si el usuario navegó
     * a una vista que necesita scoring antes de que termine la carga inicial,
     * carga los matches de openfootball aquí.
     */
    async function ensureNormalizedMatches() {
        if (pwaNormalizedMatches.length > 0) return;
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
                awayScore: m.score.ft[1],
                resultString: `${m.team1} ${m.score.ft[0]} - ${m.score.ft[1]} ${m.team2}`
            }));
        console.log('[PWA] Matches cargados:', pwaNormalizedMatches.length, 'finalizados de', withIds.length, 'totales');
    }

    /**
     * Normaliza un date string a formato YYYY-MM-DD.
     * Soporta: "2026-06-13" (ISO), "6/13/2026" (US), "6/13/26" (US corto).
     * @param {string | number | null | undefined} dateStr
     */
    function normalizeDate(dateStr) {
        if (!dateStr) return '';
        const s = String(dateStr).trim();
        const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (isoMatch) {
            return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        }
        const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (usMatch) {
            let y = usMatch[3];
            if (y.length === 2) y = '20' + y;
            return `${y}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return d.toISOString().slice(0, 10);
        }
        return '';
    }

    /**
     * Transforma filas crudas de la hoja (apuestas/apuestas2) al formato `Bet`
     * y las scorea contra `pwaNormalizedMatches`. Los bets sin match en
     * openfootball quedan como 'pending' (0 pts) para que el participante
     * aparezca igual en el ranking.
     * @param {any[]} rawBets
     * @returns {any[]}
     */
    function scorePwaRawBets(rawBets) {
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
                prediction: { homeTeam, awayTeam, homeScore, awayScore },
                // timestamp = matchDate para que findMatchForBet matchee por día.
                timestamp: matchDate || normalizeDate(raw.submittedAt || '') || ''
            };
            const match = findMatchForBet(bet, pwaNormalizedMatches);
            if (!match) {
                scored.push({ ...bet, status: 'pending', points: 0 });
                skippedNoMatch++;
                continue;
            }
            const cmp = compareBetWithMatch(bet, match);
            scored.push({ ...bet, status: cmp.status, points: cmp.points, realResult: cmp.realResult });
        }
        console.log('[PWA] Bets totales:', scored.length, '— scoreados:', scored.length - skippedNoMatch, '— pending (sin match):', skippedNoMatch);
        return scored;
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
            await ensureNormalizedMatches();
            const result = await loadAllPwaBets();
            const rawBets = result.bets || [];
            console.log('[PWA] Bets recibidos de la hoja:', rawBets.length);
            pwaScoredBets = rawBets.length === 0 ? [] : scorePwaRawBets(rawBets);
        } catch (e) {
            console.error('Error cargando PWA bets para movement:', e);
            pwaScoredBets = [];
        }
    }

    /**
     * Igual que `loadAndScorePwaBets` pero para la segunda fase: lee la hoja
     * `apuestas2` vía `loadAllPwaBetsParte2` y guarda en `pwaScoredBetsParte2`
     * para el ranking de parte 2. Reusa los mismos matches de openfootball.
     */
    async function loadAndScorePwaBetsParte2() {
        try {
            await ensureNormalizedMatches();
            const result = await loadAllPwaBetsParte2();
            const rawBets = result.bets || [];
            console.log('[PWA-P2] Bets recibidos de la hoja apuestas2:', rawBets.length);
            pwaScoredBetsParte2 = rawBets.length === 0 ? [] : scorePwaRawBets(rawBets);
        } catch (e) {
            console.error('Error cargando PWA bets parte 2:', e);
            pwaScoredBetsParte2 = [];
        }
    }

    async function load() {
        loading = true;
        try {
            // Race contra un timeout de 20s para que un fetch colgado no
            // deje la PWA en "Cargando…" para siempre. Si vence, se va al
            // catch con un mensaje accionable y el botón "Reintentar".
            const LOAD_TIMEOUT_MS = 20000;
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout: la carga tomó más de 20s. Revisa tu conexión.')), LOAD_TIMEOUT_MS)
            );
            await Promise.race([
                (async () => {
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
                            awayScore: m.score.ft[1],
                            resultString: `${m.team1} ${m.score.ft[0]} - ${m.score.ft[1]} ${m.team2}`
                        }));
                    await loadAndScorePwaBets();
                    let s = computeWindowState(withIds, nowOverride || undefined);
                    s = buildDevState(withIds, s, nowOverride || undefined);
                    if (!isDev && !pwaSession.isRoot && s.status === 'open' && pwaSession.authUsername && pwaSession.authPassword && s.date && pwaSession.date === s.date) {
                        const existing = await getPwaBets({
                            username: pwaSession.authUsername,
                            password: pwaSession.authPassword,
                            matchDate: s.date
                        });
                        if (existing.bets && existing.bets.length > 0) {
                            pwaSession.submitted = true;
                            existingBets = existing.bets;
                            // Si el usuario re-ingresó (step='form'/'landing'/
                            // 'login'/'ranking'), dejamos que PwaForm se
                            // renderice en read-only con estos bets. El effect
                            // post-auth cubre el caso de login fresco; este
                            // cubre el mount inicial.
                        }
                    }
                    windowState = s;
                })(),
                timeout
            ]);
        } catch (e) {
            console.error('Error cargando partidos:', e);
            const isTimeout = e instanceof Error && e.message.startsWith('Timeout');
            windowState = {
                status: 'no-matches',
                date: null,
                openAt: null,
                closeAt: null,
                firstMatchLocalTime: null,
                matches: null,
                message: isTimeout
                    ? 'La carga tardó demasiado. Revisa tu conexión y reintenta.'
                    : 'Error al cargar el calendario. Reintenta en unos segundos.'
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

    function onRanking2Back() {
        setStep('landing');
    }

    function onTodayBetsBack() {
        setStep('landing');
    }

    function onRootPanelBack() {
        // El root llegó al panel desde el login. "Volver" lo manda al landing
        // (con sesión aún activa). Si quiere salir, usa "Cerrar sesión".
        setStep('landing');
    }

    /**
     * Llamado por PwaRootPanel cuando el root selecciona un participante
     * que NO tiene bets hoy (el panel ya hizo el check via
     * getPwaBetsByPhoneRoot). Avanza al form en root mode.
     * @param {{name: string, phone: string}} target
     */
    function onRootSelect(target) {
        rootTarget = target;
        setStep('form');
    }

    /** Cancelar desde PwaForm en root mode: vuelve al panel root con la
     *  selección limpia. El root sigue logueado (no logout). */
    function onRootCancel() {
        rootTarget = null;
        setStep('root-panel');
    }

    /** Submit exitoso desde PwaForm en root mode: cierra la sesión del
     *  root y vuelve al landing. Decisión de UX: el root ayuda a una
     *  persona por sesión. */
    function onRootComplete() {
        rootTarget = null;
        logout();
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

    /**
     * El participante completó (y el backend confirmó) las 4 apuestas de
     * torneo. Avanza al form de marcadores. Setea `tournamentBets` con las
     * recién guardadas + marca `tournamentLocked` para que PwaForm las
     * muestre en read-only sin esperar a que el gate-effect re-consulte.
     * @param {{champion: string, runnerup: string, thirdplace: string, topscorer: string}} bets
     */
    function onTournamentBetsComplete(bets) {
        tournamentBets = { ...bets, hasAll: true };
        tournamentLocked = true;
        completeTournamentBets();
    }

    function onModalClose() {
        setStep('landing');
    }

    /**
     * Calcula los winners desde los PWA bets scoreados.
     * Misma lógica que `calculateWinners` en MovementModal pero aplicada
     * a los bets que la PWA carga desde la hoja `apuestas` (fuente de
     * verdad única de la PWA).
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
    <div class="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden flex flex-col items-center justify-center p-8 animate-fade-in">
        <!-- Atmósfera -->
        <div class="pointer-events-none absolute inset-0 opacity-40 animate-gradient" style="background: radial-gradient(circle at 50% 30%, rgba(16,185,129,0.18), transparent 60%);"></div>
        <div class="pointer-events-none absolute -top-24 -right-20 w-80 h-80 bg-cyan-500/10 blur-[100px] rounded-full"></div>
        <div class="pointer-events-none absolute -bottom-24 -left-20 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full"></div>

        <div class="relative z-10 flex flex-col items-center text-center">
            <!-- Marca con halo -->
            <div class="relative mb-6">
                <div class="absolute inset-0 rounded-full animate-glow-pulse"></div>
                <div class="text-7xl animate-float">🏆</div>
            </div>
            <h1 class="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-white to-emerald-300 bg-clip-text text-transparent animate-gradient">
                Polla Mundial 2026
            </h1>

            <!-- Barra de progreso indeterminada -->
            <div class="mt-6 w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div class="pwa-loader-bar h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"></div>
            </div>

            <p class="text-gray-400 text-sm mt-5">Cargando partidos del mundial…</p>
            <p class="text-gray-600 text-xs mt-1.5">Si esto tarda más de 20s, reintenta.</p>
        </div>
    </div>
{:else if windowState.status === 'no-matches' && windowState.message && (windowState.message.startsWith('La carga') || windowState.message.startsWith('Error'))}
    <div class="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden flex flex-col items-center justify-center p-8 text-center">
        <!-- Atmósfera -->
        <div class="pointer-events-none absolute inset-0 opacity-30" style="background: radial-gradient(circle at 50% 30%, rgba(251,146,60,0.14), transparent 60%);"></div>
        <div class="pointer-events-none absolute -top-24 -right-20 w-80 h-80 bg-amber-500/10 blur-[100px] rounded-full"></div>

        <div class="relative z-10 max-w-md w-full glass-strong border border-white/10 rounded-3xl p-7 animate-scale-in">
            <div class="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30 text-3xl">⚠️</div>
            <p class="text-gray-200 mb-6 leading-relaxed">{windowState.message}</p>
            <button
                class="w-full px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 rounded-2xl text-white font-black transition-all min-h-12 shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                onclick={() => load()}
            >
                🔄 Reintentar
            </button>
        </div>
    </div>
{:else if pwaSession.step === 'landing'}
    <PwaLanding state={windowState} {isDev} devTestDate={devTestDate} bets={pwaScoredBets} {preMatchInfo} {todayDate} {needRefresh} {offlineReady} onSquads={() => showSquadsModal = true} onCountdownZero={handleCountdownZero} />
{:else if pwaSession.step === 'login'}
    <PwaLogin onBack={onLoginBack} {isDev} onSuccess={handleAuthSuccess} />
{:else if pwaSession.step === 'ranking'}
    <PwaRanking
        bets={pwaScoredBets}
        onBack={onRankingBack}
        canGoBet={!pwaSession.submitted && windowState?.status === 'open'}
        onGoBet={() => setStep('form')}
        onRefresh={loadAndScorePwaBets}
    />
{:else if pwaSession.step === 'ranking2'}
    <PwaRankingParte2
        bets={pwaScoredBetsParte2}
        onBack={onRanking2Back}
        canGoBet={false}
        onGoBet={() => setStep('form')}
        onRefresh={loadAndScorePwaBetsParte2}
    />
{:else if pwaSession.step === 'today-bets'}
    <PwaTodayBets bets={pwaScoredBets} matches={pwaNormalizedMatches} {todayDate} {preMatchInfo} onBack={onTodayBetsBack} />
{:else if pwaSession.step === 'root-panel'}
    <PwaRootPanel
        bets={pwaScoredBets}
        {todayDate}
        {isDev}
        onBack={onRootPanelBack}
        onSelect={onRootSelect}
    />
{:else if pwaSession.step === 'tutorial'}
    <TutorialPage onClose={closeTutorial} />
{:else if pwaSession.step === 'change-password'}
    <PwaChangePassword {isDev} onPasswordChanged={handlePasswordChanged} />
{:else if pwaSession.step === 'email-prompt'}
    <PwaEmailPromptModal onClose={handleEmailPromptClose} />
{:else if pwaSession.step === 'done'}
    <!-- PwaDone post-submit fresco (mode='success' con confeti). El modo
         'already-submitted' ya no se usa: cuando hay bets previos, PwaForm
         se renderiza en read-only. -->
    <PwaDone date={pwaSession.date || windowState.date} savedCount={doneSavedCount} infoMessage={doneInfoMessage} {isDev} mode={doneMode} />
{:else if pwaSession.step === 'tournament-bets'}
    <PwaTournamentBetsForm onComplete={onTournamentBetsComplete} />
{:else if pwaSession.step === 'form'}
    <PwaForm
        windowState={windowState}
        onDone={onDone}
        {isDev}
        existingBets={existingBets}
        tournamentBets={tournamentLocked ? tournamentBets : null}
        mode={rootTarget ? 'root' : 'normal'}
        targetParticipant={rootTarget}
        onRootComplete={onRootComplete}
        onRootCancel={onRootCancel}
    />
{:else if pwaSession.step === 'history'}
    <PwaHistory {isDev} />
{:else if pwaSession.step === 'results'}
    <div class="text-white">
        <PwaWorldCupResultsModal onClose={onModalClose} />
    </div>
{:else if pwaSession.step === 'movement'}
    <div class="text-white">
        <PwaMovementModal
            bets={pwaScoredBets}
            matches={pwaNormalizedMatches}
            winners={pwaScoredBets.length > 0 ? computePwaWinners(pwaScoredBets) : []}
            onClose={onModalClose}
        />
    </div>
{:else}
    <PwaLanding state={windowState} {isDev} bets={pwaScoredBets} {todayDate} {needRefresh} {offlineReady} onSquads={() => showSquadsModal = true} />
{/if}

<!-- Banner de actualización del SW (auto-update prompt). Siempre montado en la PWA. -->
<ReloadPrompt {needRefresh} {offlineReady} {updateServiceWorker} />

{#if showSquadsModal}
    <PwaSquadsModal onClose={() => showSquadsModal = false} />
{/if}

<!-- Botones flotantes del header (top-right). El wrapper flex mantiene
     el orden visual: primero "Pendientes" (a la izquierda), después
     "Instalar" y "Borrar cache" (a la derecha). -->
<div class="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-1.5 py-1.5 rounded-full glass border border-white/10 shadow-lg shadow-black/30 animate-fade-in">
    <PwaMissingBetsButton
        bets={pwaScoredBets}
        {todayDate}
        firstMatchHHMM={preMatchInfo.firstMatchHHMM}
    />
    <PwaInstallButton />
    <CacheClearButton />
</div>

<!-- Tour in-app (Driver.js) — siempre montado; arranca con trigger=true -->
<OnboardingTour
    steps={tourSteps}
    trigger={triggerOnboardingTour}
    onDone={handleTourDone}
    onSkip={handleTourDone}
/>

<!-- Intro Three.js (overlay fullscreen). Se reproduce una vez por sesión
     al montar PwaApp. Mientras corre, la carga de partidos y el render del
     PWA ocurren detrás. Cuando termina su animación + 2s de tail, se
     desmonta y queda el contenido del PWA visible. -->
{#if showIntro}
    <PwaIntro onClose={handleIntroClose} />
{/if}

<!-- Goal Three.js overlay. Se dispara en transiciones a 'ranking' y
     'today-bets'. El componente se autocontrola (arma y desarma su
     escena interna); el orquestador sólo le pasa open y el step. -->
<PwaGoalOverlay
    open={showGoalOverlay}
    triggerKey={pwaSession.step}
    onClose={handleGoalClose}
/>
