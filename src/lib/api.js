import { normalizeTeamName } from './parser.js';

const CONFIG_URL = 'https://app.iedeoccidente.com/pollaweb/config.php';
const GITHUB_MATCHES_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const SAVE_BETS_URL = 'https://app.iedeoccidente.com/gs/save_bets.php';
const GET_BETS_URL = 'https://app.iedeoccidente.com/gs/get_bets.php';
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
        const response = await fetch(GITHUB_MATCHES_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        const matches = data.matches || [];
        const withScores = matches.filter((/** @type {any} */ m) => m.score && m.score.ft);

        return withScores
            .map((/** @type {any} */ m, /** @type {number} */ index) => ({
                id: index + 1,
                date: m.date,
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

    const betHome = bet.prediction.homeScore || 0;
    const betAway = bet.prediction.awayScore || 0;

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
    const response = await fetch(GITHUB_MATCHES_URL);
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
 * Guarda las apuestas en Google Sheets (hoja "datos").
 * @param {any[]} bets - Arreglo de apuestas del frontend
 * @returns {Promise<{ success: boolean, saved: number, rows: number }>}
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

    return (result.bets || []).map(row => {
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
}
