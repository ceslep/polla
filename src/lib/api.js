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

const TEAM_ALIASES_API = {
    'Mexico': 'Mexico',
    'South Africa': 'South Africa',
    'Sudafrica': 'South Africa',
    'Sudamérica': 'South Africa',
    'South Korea': 'South Korea',
    'Korea': 'South Korea',
    'Corea': 'South Korea',
    'Corea del Sur': 'South Korea',
    'Czech Republic': 'Czechia',
    'Czechia': 'Czechia',
    'República Checa': 'Czechia',
    'Rep checa': 'Czechia',
    'R checa': 'Czechia',
    'Chequia': 'Czechia',
    'Canada': 'Canada',
    'Canda': 'Canada',
    'Bosnia & Herzegovina': 'Bosnia',
    'Bosnia': 'Bosnia',
    'Qatar': 'Qatar',
    'Qarar': 'Qatar',
    'Switzerland': 'Switzerland',
    'Zuisa': 'Switzerland',
    'Suiza': 'Switzerland',
    'Brazil': 'Brazil',
    'Brasil': 'Brazil',
    'Morocco': 'Morocco',
    'Marruecos': 'Morocco',
    'Haiti': 'Haiti',
    'Scotland': 'Scotland',
    'Escocia': 'Scotland',
    'Escosia': 'Scotland',
    'USA': 'United States',
    'United States': 'United States',
    'Estados Unidos': 'United States',
    'EEUU': 'United States',
    'Paraguay': 'Paraguay',
    'Australia': 'Australia',
    'Turkey': 'Turkey',
    'Turquia': 'Turkey',
    'Germany': 'Germany',
    'Alemania': 'Germany',
    'Aleman': 'Germany',
    'Curaçao': 'Curacao',
    'Curacao': 'Curacao',
    'Curazao': 'Curacao',
    'Corazao': 'Curacao',
    'Ivory Coast': 'Ivory Coast',
    'Costa': 'Ivory Coast',
    'Costa Marfil': 'Ivory Coast',
    'Costa de Marfil': 'Ivory Coast',
    'Costa d Marfil': 'Ivory Coast',
    'C marfil': 'Ivory Coast',
    'C maril': 'Ivory Coast',
    'C verde': 'Ivory Coast',
    'Verde': 'Ivory Coast',
    'Ecuador': 'Ecuador',
    'Netherlands': 'Netherlands',
    'Paises Bajos': 'Netherlands',
    'P bajos': 'Netherlands',
    'Holanda': 'Netherlands',
    'Japan': 'Japan',
    'Japón': 'Japan',
    'Sweden': 'Sweden',
    'Suecia': 'Sweden',
    'Suecis': 'Sweden',
    'Tunisia': 'Tunisia',
    'Tunes': 'Tunisia',
    'Tinez': 'Tunisia',
    'Tines': 'Tunisia',
    'Tunez': 'Tunisia',
    'Belgium': 'Belgium',
    'Bélgica': 'Belgium',
    'Egypt': 'Egypt',
    'Egipto': 'Egypt',
    'Iran': 'Iran',
    'Irán': 'Iran',
    'New Zealand': 'New Zealand',
    'Nueva Zelanda': 'New Zealand',
    'N zelanda': 'New Zealand',
    'Spain': 'Spain',
    'España': 'Spain',
    'Espana': 'Spain',
    'Saudi Arabia': 'Saudi Arabia',
    'Arabia Saudita': 'Saudi Arabia',
    'Arabia': 'Saudi Arabia',
    'Cape Verde': 'Cape Verde',
    'Cabo Verde': 'Cape Verde',
    'Uruguay': 'Uruguay',
    'France': 'France',
    'Francia': 'France',
    'Senegal': 'Senegal',
    'Iraq': 'Iraq',
    'Irak': 'Iraq',
    'Norway': 'Norway',
    'Noruega': 'Norway',
    'Argentina': 'Argentina',
    'Algeria': 'Algeria',
    'Argelia': 'Algeria',
    'Austria': 'Austria',
    'Jordan': 'Jordan',
    'Jordania': 'Jordan',
    'Portugal': 'Portugal',
    'DR Congo': 'DR Congo',
    'RD Congo': 'DR Congo',
    'Uzbekistan': 'Uzbekistan',
    'Colombia': 'Colombia',
    'England': 'England',
    'Inglaterra': 'England',
    'Croatia': 'Croatia',
    'Croacia': 'Croatia',
    'Ghana': 'Ghana',
    'Panama': 'Panama',
    'Panamá': 'Panama'
};

/**
 * @param {string} name
 * @returns {string}
 */
function normalizeTeamNameApi(name) {
    if (!name) return '';
    const stripped = name
        .replace(/\p{Emoji_Presentation}/gu, '')
        .replace(/\p{Extended_Pictographic}/gu, '');
    const lower = stripped.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    return TEAM_ALIASES_API[/** @type {keyof typeof TEAM_ALIASES_API} */ (lower)] || lower;
}

/**
 * @returns {Promise<Match[]>}
 */
export async function loadMatchesFromGitHub() {
    console.log('Fetching from:', GITHUB_MATCHES_URL);
    try {
        const response = await fetch(GITHUB_MATCHES_URL);
        console.log('Response status:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        console.log('Data received, matches count:', (data.matches || []).length);

        const matches = data.matches || [];
        const withScores = matches.filter((/** @type {any} */ m) => m.score && m.score.ft);
        console.log('Matches with scores:', withScores.length);

        return withScores
            .map((/** @type {any} */ m, /** @type {number} */ index) => ({
                id: index + 1,
                date: m.date,
                homeTeam: normalizeTeamNameApi(m.team1),
                homeShort: m.team1,
                awayTeam: normalizeTeamNameApi(m.team2),
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
