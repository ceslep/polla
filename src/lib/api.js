import { normalizeTeamName, dropOverLimitMessages, dropOrganizerBets, parseThirdplaceBet } from './parser.js';

const CONFIG_URL = 'https://app.iedeoccidente.com/pollaweb/config.php';
const GITHUB_MATCHES_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

/**
 * Fetch sin pasar por el cache HTTP del navegador (`cache: 'no-store'`).
 * Combinado con la estrategia `NetworkOnly` del SW (vite.config.ts), garantiza
 * que cada petición al JSON de openfootball vaya a la red y traiga la versión
 * más reciente, sin que un cache stale haga que los usuarios vean resultados
 * viejos (ej. un partido ya finalizado mostrándose como "Pendiente").
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
function fetchNoCache(url, init = {}) {
    return fetch(url, { cache: 'no-store', ...init });
}

const SAVE_BETS_URL = 'https://app.iedeoccidente.com/gs/save_bets.php';
const GET_BETS_URL = 'https://app.iedeoccidente.com/gs/get_bets.php';
const CLEAR_BETS_URL = 'https://app.iedeoccidente.com/gs/clear_bets.php';
const SAVE_PWA_BET_URL = 'https://app.iedeoccidente.com/gs/save_pwa_bet.php';
const GET_PWA_BETS_URL = 'https://app.iedeoccidente.com/gs/get_pwa_bets.php';
const GET_ALL_PWA_BETS_URL = 'https://app.iedeoccidente.com/gs/get_all_pwa_bets.php';
const LOGIN_PWA_URL = 'https://app.iedeoccidente.com/gs/login_pwa.php';
const CHANGE_PWA_PASSWORD_URL = 'https://app.iedeoccidente.com/gs/change_pwa_password.php';
const SAVE_PWA_EMAIL_URL = 'https://app.iedeoccidente.com/gs/save_pwa_email.php';
const LIST_PARTICIPANTS_URL = 'https://app.iedeoccidente.com/gs/list_participants.php';
const GET_PWA_BETS_BY_PHONE_URL = 'https://app.iedeoccidente.com/gs/get_pwa_bets_by_phone.php';
// Parte 2: misma infra, hoja `apuestas2` (segunda fase del torneo).
const GET_ALL_PWA_BETS_PARTE2_URL = 'https://app.iedeoccidente.com/gs/get_all_pwa_bets_parte2.php';
const GET_PWA_BETS_PARTE2_URL = 'https://app.iedeoccidente.com/gs/get_pwa_bets_parte2.php';
const SAVE_PWA_BET_PARTE2_URL = 'https://app.iedeoccidente.com/gs/save_pwa_bet_parte2.php';
const SHEETS_SPREADSHEET_ID = '1PIo_oLVjQubdbLodigV3cwOfwQ29k-SGsRmbeorI3nM';
const SHEETS_WORKSHEET = 'datos';

/** @type {{api_key: string, base_url: string} | null} */
let cachedConfig = null;

/** @returns {Promise<{api_key: string, base_url: string}>} */
async function getConfig() {
    if (cachedConfig) return cachedConfig;
    try {
        const res = await fetch(CONFIG_URL);
        const config = await res.json();
        const result = config.football_api;
        cachedConfig = result;
        return result;
    } catch (err) {
        console.warn('Could not fetch config, using fallback');
        cachedConfig = { api_key: '', base_url: '' };
        return cachedConfig;
    }
}

/** @typedef {import('./types.js').Bet} Bet */
/** @typedef {import('./types.js').Match} Match */

/**
 * @returns {Promise<Match[]>}
 */
export async function loadMatchesFromGitHub() {
    try {
        const response = await fetchNoCache(GITHUB_MATCHES_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        const matches = data.matches || [];
        const withScores = matches.filter((/** @type {any} */ m) => m.score && m.score.ft);

        return withScores
            .map((/** @type {any} */ m, /** @type {number} */ index) => ({
                id: index + 1,
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
    } catch (error) {
        console.error('Error loading matches from GitHub:', error);
        throw error;
    }
}

/**
 * @param {string} from
 * @param {string} [to]
 * @returns {Promise<Match[]>}
 */
export async function loadMatches(from = '2026-06-01', to = '2026-07-31') {
    const { api_key, base_url } = await getConfig();
    const url = `${base_url}/competitions/WC/matches?dateFrom=${from}&dateTo=${to}`;

    try {
        const response = await fetch(url, {
            headers: { 'X-Auth-Token': api_key }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `Error API: ${response.status}`);
        }

        const data = await response.json();

        return (data.matches || [])
            .filter((/** @type {any} */ match) => match.status === 'FINISHED' || match.status === 'SCORED' || match.status === 'LIVE')
            .map((/** @type {any} */ match) => ({
                id: match.id,
                date: match.utcDate,
                homeTeam: match.homeTeam.name,
                homeShort: match.homeTeam.shortName || match.homeTeam.tla,
                awayTeam: match.awayTeam.name,
                awayShort: match.awayTeam.shortName || match.awayTeam.tla,
                homeScore: match.score.fullTime.home ?? match.score.extraTime?.home ?? match.score.halfTime?.home ?? null,
                awayScore: match.score.fullTime.away ?? match.score.extraTime?.away ?? match.score.halfTime?.away ?? null,
                resultString: `${match.homeTeam.name} ${match.score.fullTime.home ?? 0} - ${match.score.fullTime.away ?? 0} ${match.awayTeam.name}`
            }));
    } catch (error) {
        console.error('Error loading matches:', error);
        throw error;
    }
}

/**
 * Compara una apuesta de score contra el resultado real. Normaliza el orden
 * local/visitante del bet al del partido antes de calcular el diff, porque
 * `findMatchForBet` ya hace la búsqueda en ambos órdenes: si el usuario
 * escribió "Morocco 3 Scotland 1" pero el partido real es "Scotland 0-1
 * Morocco", el match llega invertido y el diff debe calcularse con los
 * marcadores invertidos también. Sin esta normalización, el sign(diff) del
 * bet queda del lado opuesto al del partido y una apuesta con el ganador
 * correcto se marca como `incorrect` (caso real: "Marruecos 3 Escocia 1"
 * el 2026-06-19).
 * @param {Bet} bet
 * @param {Match} match
 */
export function compareBetWithMatch(bet, match) {
    if (bet.type !== 'score') return { status: 'pending', points: 0 };

    const realHome = match.homeScore;
    const realAway = match.awayScore;

    if (realHome === null || realAway === null) {
        return { status: 'pending', points: 0 };
    }

    const betHomeTeam = normalizeTeamName(bet.prediction.homeTeam || '');
    const betAwayTeam = normalizeTeamName(bet.prediction.awayTeam || '');
    const matchHomeTeam = normalizeTeamName(match.homeTeam);
    const matchAwayTeam = normalizeTeamName(match.awayTeam);

    const betInverted = betHomeTeam === matchAwayTeam && betAwayTeam === matchHomeTeam;

    const rawBetHome = bet.prediction.homeScore || 0;
    const rawBetAway = bet.prediction.awayScore || 0;
    const betHome = betInverted ? rawBetAway : rawBetHome;
    const betAway = betInverted ? rawBetHome : rawBetAway;

    if (betHome === realHome && betAway === realAway) {
        return { status: 'exact', points: 5, realResult: match.resultString };
    }

    const betDiff = betHome - betAway;
    const realDiff = realHome - realAway;

    if (Math.sign(betDiff) === Math.sign(realDiff)) {
        return { status: 'correct', points: 3, realResult: match.resultString };
    }

    return { status: 'incorrect', points: 0, realResult: match.resultString };
}

/**
 * @typedef {Object} WorldCupMatchRaw
 * @property {string} round
 * @property {string} date
 * @property {string} time
 * @property {string} team1
 * @property {string} team2
 * @property {string} [group]
 * @property {string} ground
 * @property {{ft: [number, number], ht: [number, number]}} [score]
 * @property {Array<{name: string, minute: string}>} [goals1]
 * @property {Array<{name: string, minute: string}>} [goals2]
 */

/**
 * @returns {Promise<WorldCupMatchRaw[]>}
 */
export async function loadWorldCupMatches() {
    const response = await fetchNoCache(GITHUB_MATCHES_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.matches || [];
}

/**
 * Obtiene los alias de participantes desde Google Sheets (hoja "alias").
 * @returns {Promise<Array<{participant: string, alias: string}>>}
 */
export async function getAliasesFromSheets() {
    const response = await fetch(GET_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: 'alias'
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result.bets || [];
}

/**
 * Normaliza los alias cargados desde Sheets.
 * @param {any[]} aliases
 * @returns {Record<string, string>}
 */
export function normalizeAliasesFromSheets(aliases) {
    /** @type {Record<string, string>} */
    const map = {};
    for (const row of aliases) {
        if (row.participant && row.alias) {
            map[row.participant] = row.alias;
        }
    }
    return map;
}

/**
 * Guarda los alias de participantes en Google Sheets (hoja "alias").
 * @param {Record<string, string>} aliases - Mapa de participant -> alias
 * @returns {Promise<{ success: boolean, saved: number, rows: number }>}
 */
export async function saveAliasesToSheets(aliases) {
    const rows = Object.entries(aliases).map(([participant, alias]) => ({
        participant,
        alias
    }));

    const response = await fetch(SAVE_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: 'alias',
            bets: rows
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * @param {import('./types.js').Bet[]} bets
 * @returns {Promise<{ success: boolean, saved: number, rows: number, updated?: number, inserted?: number, error?: string }>}
 */
export async function saveBetsToSheets(bets) {
    const response = await fetch(SAVE_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: SHEETS_WORKSHEET,
            bets: bets
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Borra todas las filas de datos en Google Sheets (preserva headers).
 * @returns {Promise<{ success: boolean, deleted: number }>}
 */
export async function clearBetsFromSheets() {
    const response = await fetch(CLEAR_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: SHEETS_WORKSHEET
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Carga las apuestas desde Google Sheets (hoja "datos").
 * Transforma del formato flat de Sheets al formato nested del frontend.
 * @returns {Promise<any[]>}
 */
export async function loadBetsFromSheets() {
    const response = await fetch(GET_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: SHEETS_WORKSHEET
        })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }

    const rows = (result.bets || []).map(/** @param {any} row */ (row) => {
        const rawPoints = row.points;
        let points = 0;
        if (typeof rawPoints === 'number' && !isNaN(rawPoints)) {
            points = rawPoints;
        } else if (typeof rawPoints === 'string') {
            const match = rawPoints.match(/^-?\d+/);
            if (match) {
                points = parseInt(match[0], 10);
            }
        }
        return {
            id: typeof row.id === 'string' ? row.id : String(row.id || ''),
            messageId: typeof row.messageId === 'string' ? row.messageId : String(row.messageId || ''),
            timestamp: typeof row.timestamp === 'string' ? row.timestamp : String(row.timestamp || ''),
            participant: typeof row.participant === 'string' ? row.participant : String(row.participant || ''),
            phone: typeof row.phone === 'string' ? row.phone : String(row.phone || ''),
            type: typeof row.type === 'string' ? row.type : 'score',
            bet_text: typeof row.bet_text === 'string' ? row.bet_text : String(row.bet_text || ''),
            prediction: {
                homeTeam: typeof row.homeTeam === 'string' ? row.homeTeam : String(row.homeTeam || ''),
                awayTeam: typeof row.awayTeam === 'string' ? row.awayTeam : String(row.awayTeam || ''),
                homeScore: row.homeScore !== '' && row.homeScore != null ? Number(row.homeScore) : null,
                awayScore: row.awayScore !== '' && row.awayScore != null ? Number(row.awayScore) : null,
                champion: typeof row.champion === 'string' ? row.champion : String(row.champion || ''),
                runnerup: typeof row.runnerup === 'string' ? row.runnerup : String(row.runnerup || ''),
                topscorer: typeof row.topscorer === 'string' ? row.topscorer : String(row.topscorer || '')
            },
            status: typeof row.status === 'string' ? row.status : 'pending',
            points,
            real_result: typeof row.real_result === 'string' ? row.real_result : (row.realResult ? String(row.realResult) : null),
            verified: row.verified === true || row.verified === 'TRUE' || row.verified === true,
            manuallyEdited: row.manuallyEdited === true || row.manuallyEdited === 'TRUE' || row.manuallyEdited === true,
            originalMessage: typeof row.originalMessage === 'string' ? row.originalMessage : (row.original_message ? String(row.original_message) : '')
        };
    });

    // Sheets puede contener filas duplicadas si el mismo JSON se subió con
    // messageIds distintos (cada messageId genera un `id` único y el UPSERT
    // por id en save_bets.php no las fusiona). Sin dedup, los participantes
    // reciben puntos dobles por el mismo partido. Priorizamos por `id` y, como
    // red de seguridad, por la combinación messageId+timestamp+contenido del
    // marcador (catches el caso de `id` vacío que dejaría pasar el primer filtro).
    const seenIds = new Set();
    const seenContent = new Set();
    const deduped = [];
    for (const bet of rows) {
        if (!bet) continue;
        if (bet.id && seenIds.has(bet.id)) continue;
        const p = bet.prediction || {};
        const contentKey = [
            (bet.messageId || '').toLowerCase().trim(),
            (bet.timestamp || '').trim(),
            (p.homeTeam || '').toLowerCase().trim(),
            (p.awayTeam || '').toLowerCase().trim(),
            p.homeScore ?? '',
            p.awayScore ?? ''
        ].join('|');
        if (seenContent.has(contentKey)) continue;
        if (bet.id) seenIds.add(bet.id);
        seenContent.add(contentKey);
        deduped.push(bet);
    }
    return dropOrganizerBets(dropOverLimitMessages(deduped));
}

/* ============================================================================
 * PWA endpoints
 * ========================================================================= */

/**
 * @typedef {Object} PwaBet
 * @property {number} matchId
 * @property {string} homeTeam
 * @property {string} awayTeam
 * @property {number} homeScore
 * @property {number} awayScore
 */

/**
 * Autentica al participante contra la hoja `participantes`. Devuelve
 * `isRoot: true` si la fila tiene isRoot=TRUE en columna F.
 * @param {{ username: string, password: string, dev?: boolean }} payload
 * @returns {Promise<{success: boolean, participant?: string, phone?: string, username?: string, mustChangePassword?: boolean, mustProvideEmail?: boolean, isRoot?: boolean, error?: string}>}
 */
export async function loginPwa(payload) {
    const response = await fetch(LOGIN_PWA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Cambia la contraseña del participante autenticado. El backend valida
 * currentPassword contra la hoja y, si coincide, escribe la nueva contraseña
 * en columna C y marca columna D como TRUE.
 * @param {{ username: string, currentPassword: string, newPassword: string, dev?: boolean }} payload
 * @returns {Promise<{success: boolean, message?: string, dev?: boolean, error?: string}>}
 */
export async function changePwaPassword(payload) {
    const response = await fetch(CHANGE_PWA_PASSWORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Guarda (o limpia) el email de notificaciones del participante autenticado.
 * El backend valida currentPassword contra la hoja y, si coincide, escribe
 * (o borra, con `email: ''`) la columna E de `participantes`.
 * @param {{ username: string, currentPassword: string, email: string, dev?: boolean }} payload
 * @returns {Promise<{success: boolean, email?: string, message?: string, error?: string}>}
 */
export async function savePwaEmail(payload) {
    const response = await fetch(SAVE_PWA_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Envía las apuestas PWA. Auth via {username, password}. El backend hace
 * INSERT-only (inmutable) y devuelve 200 con saved=N + alreadyExists=M
 * si algún id ya estaba.
 *
 * En root mode: agregar `rootMode: true` + `targetPhone: '...'` al payload.
 * El backend validará que el authed user sea root, escribirá los bets como
 * el target y enviará el email de confirmación al root (no al target).
 *
 * @param {{
 *   date: string,
 *   firstMatchTime: string,
 *   username: string,
 *   password: string,
 *   dev?: boolean,
 *   rootMode?: boolean,
 *   targetPhone?: string,
 *   bets: PwaBet[]
 * }} payload
 * @returns {Promise<{success: boolean, saved: number, alreadyExists: number, message: string, window?: any, error?: string}>}
 */
export async function savePwaBet(payload) {
    const response = await fetch(SAVE_PWA_BET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        const err = new Error(result.error || `Error HTTP ${response.status}`);
        // @ts-ignore
        err.window = result.window;
        throw err;
    }
    return result;
}

/**
 * Lee las apuestas PWA del participante autenticado.
 * @param {{ username: string, password: string, dev?: boolean, matchDate?: string }} payload
 * @returns {Promise<{success: boolean, bets: Array<any>, total: number, participant?: string, phone?: string, error?: string}>}
 */
export async function getPwaBets(payload) {
    const response = await fetch(GET_PWA_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/* ──────────────────────────────────────────────────────────────────────
 * PARTE 2 (segunda fase) — espejos de las funciones PWA apuntando a la
 * hoja `apuestas2` vía endpoints `*_parte2.php`. Misma forma de payload y
 * respuesta; lo único que cambia es la URL (y por tanto la hoja origen).
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Lee TODAS las apuestas de la hoja `apuestas2` (público, sin auth).
 * Espejo de loadAllPwaBets para el ranking de parte 2.
 * @param {{ dev?: boolean }} [payload]
 * @returns {Promise<{success: boolean, bets: Array<any>, total: number, error?: string}>}
 */
export async function loadAllPwaBetsParte2(payload) {
    const response = await fetch(GET_ALL_PWA_BETS_PARTE2_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...(payload || {})
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Lee las apuestas de parte 2 del participante autenticado (hoja `apuestas2`).
 * Espejo de getPwaBets.
 * @param {{ username: string, password: string, dev?: boolean, matchDate?: string }} payload
 * @returns {Promise<{success: boolean, bets: Array<any>, total: number, participant?: string, phone?: string, error?: string}>}
 */
export async function getPwaBetsParte2(payload) {
    const response = await fetch(GET_PWA_BETS_PARTE2_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Guarda apuestas de parte 2 en la hoja `apuestas2`. Espejo de savePwaBet.
 * @param {{ date: string, firstMatchTime: string, username: string, password: string, dev?: boolean, rootMode?: boolean, targetPhone?: string, bets: Array<any> }} payload
 * @returns {Promise<{success: boolean, saved: number, alreadyExists: number, message: string, window?: any, error?: string}>}
 */
export async function savePwaBetParte2(payload) {
    const response = await fetch(SAVE_PWA_BET_PARTE2_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        const err = new Error(result.error || `Error HTTP ${response.status}`);
        // @ts-ignore
        err.window = result.window;
        throw err;
    }
    return result;
}

/**
 * Lee TODAS las apuestas de la hoja `apuestas2` (público, sin auth).
 * @param {{ dev?: boolean }} [payload]
 * @returns {Promise<{success: boolean, bets: Array<any>, total: number, error?: string}>}
 */
export async function loadAllPwaBets(payload) {
    const response = await fetch(GET_ALL_PWA_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...(payload || {})
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Lista los participantes de la hoja `participantes` (root auth required).
 * El caller debe estar logueado como root (isRoot=TRUE). Devuelve la lista
 * completa con name, phone, passwordChanged, email, isRoot (sin contraseña).
 * Pensado para alimentar el panel root (PwaRootPanel).
 * @param {{ username: string, password: string, dev?: boolean }} payload
 * @returns {Promise<{success: boolean, participants: Array<{name: string, phone: string, passwordChanged: boolean, email: string, isRoot: boolean}>, total: number, error?: string}>}
 */
export async function listParticipantsRoot(payload) {
    const response = await fetch(LIST_PARTICIPANTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Lee las apuestas de un participante arbitrario (root auth required).
 * Pensado para que el panel root verifique si un target ya envió apuestas
 * para una fecha, sin pedirle la contraseña al root.
 * @param {{ username: string, password: string, targetPhone: string, matchDate?: string, dev?: boolean }} payload
 * @returns {Promise<{success: boolean, bets: Array<any>, total: number, target: {name: string, phone: string}, error?: string}>}
 */
export async function getPwaBetsByPhoneRoot(payload) {
    const response = await fetch(GET_PWA_BETS_BY_PHONE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            ...payload
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Apuestas especiales (campeón, subcampeón…) para parte 2. Hoy reusa la hoja
 * `datos`; función propia para poder cambiar la fuente sin tocar componentes.
 * @returns {Promise<Array<any>>}
 */
export async function loadTournamentBetsParte2() {
    // Parte 2 reusa la hoja `datos` (mismas apuestas especiales del torneo).
    // Se deja como función propia para poder apuntar a otra hoja en el futuro
    // sin tocar los componentes de parte 2.
    return loadTournamentBets();
}

/**
 * Lee TODAS las apuestas de la hoja `datos` para extraer campeón, subcampeón, etc.
 * @returns {Promise<Array<any>>}
 */
export async function loadTournamentBets() {
    const response = await fetch(GET_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: 'datos'
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result.bets || [];
}

/** Los 4 tipos de apuesta de torneo, en orden de presentación. */
const TOURNAMENT_BET_TYPES = ['champion', 'runnerup', 'thirdplace', 'topscorer'];

/**
 * Guarda las 4 apuestas de torneo (campeón, subcampeón, tercer lugar,
 * goleador) de un participante en la hoja `datos` vía `save_bets.php`.
 *
 * Cada apuesta se persiste como una fila Bet independiente. El `id` es
 * determinista (`tour_<phone>_<type>`) para que el UPSERT de save_bets.php
 * (dedupe por `id`) sea idempotente: re-enviar no crea duplicados.
 *
 * `thirdplace` no tiene columna dedicada en la hoja (solo champion/runnerup/
 * topscorer en L,M,N), así que su valor viaja en `originalMessage` con texto
 * canónico en español, que `parseThirdplaceBet` sabe leer de vuelta. Por
 * consistencia, las 4 incluyen `originalMessage` canónico.
 *
 * @param {{
 *   participant: string,
 *   phone: string,
 *   champion: string,
 *   runnerup: string,
 *   thirdplace: string,
 *   topscorer: string,
 *   timestamp?: string
 * }} payload
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveTournamentBets(payload) {
    const { participant, phone, champion, runnerup, thirdplace, topscorer } = payload;
    const timestamp = payload.timestamp || '';

    /** Texto canónico en español por tipo (para columna originalMessage).
     * @type {Record<string, string>} */
    const labelFor = {
        champion: `Campeón: ${champion}`,
        runnerup: `Subcampeón: ${runnerup}`,
        thirdplace: `Tercer lugar: ${thirdplace}`,
        topscorer: `Goleador: ${topscorer}`,
    };
    /** @type {Record<string, string>} */
    const valueFor = { champion, runnerup, thirdplace, topscorer };

    /** @type {import('./types.js').Bet[]} */
    const bets = TOURNAMENT_BET_TYPES.map((type) => {
        /** @type {import('./types.js').Prediction} */
        const prediction = {};
        // Solo champion/runnerup/topscorer tienen columna dedicada; thirdplace
        // se reconstruye desde originalMessage al leer.
        if (type !== 'thirdplace') {
            prediction[/** @type {'champion'|'runnerup'|'topscorer'} */ (type)] = valueFor[type];
        }
        return {
            id: `tour_${phone}_${type}`,
            messageId: `tour_${phone}_${type}`,
            timestamp,
            participant,
            phone,
            originalMessage: labelFor[type],
            type,
            prediction,
            bet_text: labelFor[type],
            status: 'pending',
            points: 0,
            real_result: null,
            verified: false,
            manuallyEdited: false,
        };
    });

    const response = await fetch(SAVE_BETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            spreadsheetId: SHEETS_SPREADSHEET_ID,
            worksheetTitle: 'datos',
            bets
        })
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`Error HTTP ${response.status}: respuesta no es JSON`);
    }

    if (!response.ok || !result.success) {
        throw new Error(result.error || `Error HTTP ${response.status}`);
    }
    return result;
}

/**
 * Lee las apuestas de torneo de un participante desde la hoja `datos`.
 * Reusa `loadTournamentBets()` (carga toda la hoja) y filtra por teléfono
 * o, como respaldo, por nombre de participante. El teléfono es la clave
 * más estable porque el backend guarda el último valor autenticado y evita
 * reabrir el formulario por diferencias de acentos, espacios o aliases.
 *
 * Para tercer lugar, que no tiene columna dedicada, se deriva de
 * `originalMessage` con `parseThirdplaceBet` — mismo fallback que usa
 * PwaTournamentBetsModal.
 *
 * @param {string} participantName
 * @param {string} [phone]
 * @returns {Promise<{champion: string|null, runnerup: string|null, thirdplace: string|null, topscorer: string|null, hasAll: boolean}>}
 */
export async function getTournamentBetsForParticipant(participantName, phone) {
    /** @type {{champion: string|null, runnerup: string|null, thirdplace: string|null, topscorer: string|null, hasAll: boolean}} */
    const empty = { champion: null, runnerup: null, thirdplace: null, topscorer: null, hasAll: false };
    if (!participantName && !phone) return empty;

    const norm = (/** @type {string} */ s) => (s || '').trim().toLowerCase();
    const target = norm(participantName);
    const normPhone = (/** @type {string | undefined} */ value) => (value || '').replace(/\D/g, '');
    const targetPhone = normPhone(phone);

    let allBets;
    try {
        allBets = await loadTournamentBets();
    } catch {
        return empty;
    }

    const mine = allBets.filter((/** @type {any} */ b) => {
        const betPhone = normPhone(b.phone);
        if (targetPhone && betPhone && betPhone === targetPhone) return true;
        return target && norm(b.participant) === target;
    });

    /** @type {{champion: string|null, runnerup: string|null, thirdplace: string|null, topscorer: string|null, hasAll: boolean}} */
    const result = { champion: null, runnerup: null, thirdplace: null, topscorer: null, hasAll: false };
    for (const bet of mine) {
        const p = bet.prediction || bet;
        if (bet.type === 'champion' && (p.champion || bet.champion)) {
            result.champion = p.champion || bet.champion;
        } else if (bet.type === 'runnerup' && (p.runnerup || bet.runnerup)) {
            result.runnerup = p.runnerup || bet.runnerup;
        } else if (bet.type === 'topscorer' && (p.topscorer || bet.topscorer)) {
            result.topscorer = p.topscorer || bet.topscorer;
        } else if (bet.type === 'thirdplace') {
            result.thirdplace = (p.thirdplace || bet.thirdplace) || parseThirdplaceBet(bet.originalMessage || '');
        }
        // Fallback: parsear originalMessage para tercer lugar si aún falta
        // (apuestas históricas que vinieron de WhatsApp en un solo mensaje).
        if (bet.originalMessage && !result.thirdplace) {
            const t = parseThirdplaceBet(bet.originalMessage);
            if (t) result.thirdplace = t;
        }
    }

    result.hasAll = Boolean(result.champion && result.runnerup && result.thirdplace && result.topscorer);
    return result;
}
