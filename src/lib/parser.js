/** @typedef {import('./types.js').Bet} Bet */
import { MANUAL_BETS } from './manualBets.js';
import { betKey } from './stores.svelte.js';

export const FLAG_MAP = {
    '🇲🇽': 'Mexico',
    '🇿🇦': 'South Africa',
    '🇰🇷': 'South Korea',
    '🇨🇿': 'Czech Republic',
    '🇫🇷': 'France',
    '🇪🇸': 'Spain',
    '🇦🇷': 'Argentina',
    '🇬🇧': 'United Kingdom',
    '🏴󠁧󠁢󠁥󠁮󠁧󠁿': 'England',
    '🇧🇷': 'Brazil',
    '🇩🇪': 'Germany',
    '🇵🇹': 'Portugal',
    '🇳🇱': 'Netherlands',
    '🇧🇪': 'Belgium',
    '🇮🇹': 'Italy',
    '🇺🇾': 'Uruguay',
    '🇨🇴': 'Colombia',
    '🇨🇱': 'Chile',
    '🇺🇸': 'USA',
    '🇨🇦': 'Canada',
    '🇯🇵': 'Japan',
    '🇦🇺': 'Australia',
    '🇸🇦': 'Saudi Arabia',
    '🇶🇦': 'Qatar',
    '🇦🇪': 'United Arab Emirates',
    '🇲🇦': 'Morocco',
    '🇸🇳': 'Senegal',
    '🇬🇭': 'Ghana',
    '🇨🇲': 'Cameroon',
    '🇧🇦': 'Bosnia & Herzegovina',
    '🇺🇲': 'USA',
    '🇵🇾': 'Paraguay',
    '🇭🇷': 'Croatia',
    '🇵🇦': 'Panama',
    '🇺🇿': 'Uzbekistan',
    '🇨🇩': 'DR Congo',
    '🇮🇷': 'Iran',
    '🇹🇷': 'Turkey',
    '🇨🇼': 'Curaçao',
    '🇪🇨': 'Ecuador',
    '🇨🇮': 'Ivory Coast',
    '🇸🇪': 'Sweden',
    '🇹🇳': 'Tunisia',
    '🇪🇬': 'Egypt',
    '🇳🇿': 'New Zealand',
    '🇨🇻': 'Cape Verde',
    '🇮🇶': 'Iraq',
    '🇳🇴': 'Norway',
    '🇩🇿': 'Algeria',
    '🇦🇹': 'Austria',
    '🇯🇴': 'Jordan',
    '🏴󠁧󠁢󠁳󠁣󠁴󠁿': 'Scotland',
    '🇨🇭': 'Switzerland'
};

export const TEAM_ALIASES = {
    'mexico': 'Mexico',
    'méxico': 'Mexico',
    'espana': 'Spain',
    'españa': 'Spain',
    'spain': 'Spain',
    'sudafeica': 'South Africa',
    'sudafrica': 'South Africa',
    'sadafrica': 'South Africa',
    'sudafrida': 'South Africa',
    'south africa': 'South Africa',
    'sur africa': 'South Africa',
    'surafrica': 'South Africa',
    'surafric': 'South Africa',
    'corea': 'South Korea',
    'corea del sur': 'South Korea',
    'corea s': 'South Korea',
    'korea': 'South Korea',
    'south korea': 'South Korea',
    'checa': 'Czech Republic',
    'chec': 'Czech Republic',
    'chequia': 'Czech Republic',
    'chekya': 'Czech Republic',
    'czech': 'Czech Republic',
    'rcheca': 'Czech Republic',
    'rep checa': 'Czech Republic',
    'rep. checa': 'Czech Republic',
    'r checa': 'Czech Republic',
    'r. checa': 'Czech Republic',
    'republica checa': 'Czech Republic',
    'república checa': 'Czech Republic',
    'republica c': 'Czech Republic',
    'republica': 'Czech Republic',
    'czech republic': 'Czech Republic',
    'republica ch':'Czech Republic',
    'francia': 'France',
    'france': 'France',
    'argentina': 'Argentina',
    'arg': 'Argentina',
    'inglaterra': 'England',
    'england': 'England',
    'uk': 'United Kingdom',
    'brasil': 'Brazil',
    'brazil': 'Brazil',
    'alemania': 'Germany',
    'alemana': 'Germany',
    'germany': 'Germany',
    'portugal': 'Portugal',
    'holanda': 'Netherlands',
    'paises bajos': 'Netherlands',
    'p bajos': 'Netherlands',
    'netherlands': 'Netherlands',
    'bélgica': 'Belgium',
    'belgica': 'Belgium',
    'belgium': 'Belgium',
    'italia': 'Italy',
    'italy': 'Italy',
    'uruguay': 'Uruguay',
    'colombia': 'Colombia',
    'chile': 'Chile',
    'eeuu': 'USA',
    'euu': 'USA',
    'estados': 'USA',
    'unidos': 'USA',
    'estados unidos': 'USA',
    'usa': 'USA',
    'united states': 'USA',
    'canda': 'Canada',
    'can': 'Canada',
    'canadá': 'Canada',
    'canada': 'Canada',
    'japón': 'Japan',
    'japon': 'Japan',
    'japan': 'Japan',
    'australia': 'Australia',
    'arabia': 'Saudi Arabia',
    'arabia saudita': 'Saudi Arabia',
    'arabia saudí': 'Saudi Arabia',
    'arabia saudi': 'Saudi Arabia',
    'arabiasaudita': 'Saudi Arabia',
    'saudi arabia': 'Saudi Arabia',
    'qatar': 'Qatar',
    'emiratos': 'United Arab Emirates',
    'marruecos': 'Morocco',
    'morocco': 'Morocco',
    'maruecos': 'Morocco',
    'senegal': 'Senegal',
    'sénegal': 'Senegal',
    'ghana': 'Ghana',
    'camerún': 'Cameroon',
    'cameroon': 'Cameroon',
    'bosnia': 'Bosnia & Herzegovina',
    'bos': 'Bosnia & Herzegovina',
    'bósnia': 'Bosnia & Herzegovina',
    'bosnia herzegovina': 'Bosnia & Herzegovina',
    'bosniaherzegovina': 'Bosnia & Herzegovina',
    'paraguay': 'Paraguay',
    'parag': 'Paraguay',
    'haiti': 'Haiti',
    'haití': 'Haiti',
    'escancia': 'Scotland',
    'escocia': 'Scotland',
    'escosia': 'Scotland',
    'escogia': 'Scotland',
    'scotland': 'Scotland',
    'suisa': 'Switzerland',
    'suiza': 'Switzerland',
    'zuisa': 'Switzerland',
    'zuiza': 'Switzerland',
    'switzerland': 'Switzerland',
    'catar': 'Qatar',
    'qarar': 'Qatar',
    'quatar': 'Qatar',
    'irán': 'Iran',
    'iran': 'Iran',
    'turquia': 'Turkey',
    'turquía': 'Turkey',
    'turqui': 'Turkey',
    'turkia': 'Turkey',
    'turquuia': 'Turkey',
    'turkey': 'Turkey',
    'cura': 'Curaçao',
    'curacao': 'Curaçao',
    'curaçao': 'Curaçao',
    'curazao': 'Curaçao',
    'cruzao': 'Curaçao',
    'corazao': 'Curaçao',
    'cucacao': 'Curaçao',
    'ecuador': 'Ecuador',
    'costa': 'Ivory Coast',
    'costa marfil': 'Ivory Coast',
    'costa de marfil': 'Ivory Coast',
    'costa d marfil': 'Ivory Coast',
    'c marfil': 'Ivory Coast',
    'c maril': 'Ivory Coast',
    'c de marfil': 'Ivory Coast',
    'cmarfil': 'Ivory Coast',
    'cmaril': 'Ivory Coast',
    'costamarfil': 'Ivory Coast',
    'costadom': 'Ivory Coast',
    'ivory coast': 'Ivory Coast',
    'fil': 'Ivory Coast',
    'marfil': 'Ivory Coast',
    'suecia': 'Sweden',
    'suecis': 'Sweden',
    'sweden': 'Sweden',
    'tunes': 'Tunisia',
    'tine': 'Tunisia',
    'tinez': 'Tunisia',
    'tines': 'Tunisia',
    'tunez': 'Tunisia',
    'tunel': 'Tunisia',
    'tenez': 'Tunisia',
    'tunisia': 'Tunisia',
    'egipto': 'Egypt',
    'egypt': 'Egypt',
    'n zelanda': 'New Zealand',
    'zelanda': 'New Zealand',
    'nueva zelanda': 'New Zealand',
    'nueva selanda': 'New Zealand',
    'new zealand': 'New Zealand',
    'nz': 'New Zealand',
    'islas cabo verde': 'Cape Verde',
    'cabo verde': 'Cape Verde',
    'c verde': 'Cape Verde',
    'verde': 'Cape Verde',
    'cape verde': 'Cape Verde',
    'iraq': 'Iraq',
    'irak': 'Iraq',
    'noruega': 'Norway',
    'norway': 'Norway',
    'argelia': 'Algeria',
    'algeria': 'Algeria',
    'austria': 'Austria',
    'austria.': 'Austria',
    'jordania': 'Jordan',
    'jordan': 'Jordan',
    'rdcongo': 'DR Congo',
    'dr congo': 'DR Congo',
    'rd congo': 'DR Congo',
    'congo': 'DR Congo',
    'uzbekistan': 'Uzbekistan',
    'usbekistan': 'Uzbekistan',
    'uzbékistan': 'Uzbekistan',
    'uzbekistán': 'Uzbekistan',
    'uzbek': 'Uzbekistan',
    'uzbequistan': 'Uzbekistan',
    'uzbequistán': 'Uzbekistan',
    'croacia': 'Croatia',
    'croatia': 'Croatia',
    'panama': 'Panama',
    'panamá': 'Panama'
};

/**
 * Override de nombre de participante por número de teléfono. Útil cuando el
 * export de WhatsApp trae un `Display Name` inútil ("." , emoji suelto, etc.)
 * y queremos forzar un nombre canónico en toda la app. La clave es el campo
 * `Phone` tal como llega en el JSON de WhatsApp (o en un Bet persistido).
 * Congelado para evitar mutaciones accidentales en runtime.
 * @type {Readonly<Record<string, string>>}
 */
export const PHONE_NAME_OVERRIDES = Object.freeze({
    '+57 321 4877061': 'Julian G',
    '+57 322 6018001': 'Olmer Ballesteros',
    '+57 310 7527343':'Zurdo',
    '+57 314 5762801':'Tangarife',
    '+57 312 4657377':'Jhon Edison',
    '+57 314 3060052':'Albert Gomez',
    '+57 321 7835542':'Delcid Bueno',
    '+57 311 6715577':'John Edison Hoyos'
});

/**
 * Resuelve el participant canónico desde un mensaje crudo de WhatsApp.
 * Prioriza el override por teléfono; si no hay match, usa `Display Name`.
 * @param {{ 'Display Name'?: string, participant?: string, sender?: string, Phone?: string, phone?: string }} message
 * @returns {string}
 */
export function resolveParticipantName(message) {
    const phone = message?.Phone || message?.phone || '';
    if (phone && PHONE_NAME_OVERRIDES[phone]) {
        return PHONE_NAME_OVERRIDES[phone];
    }
    return message?.['Display Name'] || message?.participant || message?.sender || 'Unknown';
}

/**
 * Aplica los overrides phone→nombre a un array de bets ya construidos.
 * Útil para normalizar apuestas cargadas desde Google Sheets que no
 * pasaron por `parseMessage`.
 * @param {any[]} bets
 * @returns {any[]}
 */
export function applyPhoneNameOverrides(bets) {
    if (!Array.isArray(bets)) return bets;
    let changed = false;
    const out = bets.map(b => {
        const override = b?.phone && PHONE_NAME_OVERRIDES[b.phone];
        if (override && b.participant !== override) {
            changed = true;
            return { ...b, participant: override };
        }
        return b;
    });
    return changed ? out : bets;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function normalizeTeamName(name) {
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
    return TEAM_ALIASES[/** @type {keyof typeof TEAM_ALIASES} */ (lower)] || lower;
}

/** Formas canónicas válidas (valores del mapa de alias). Exportado para que
 * `collectParserWorkarounds` y cualquier consumidor externo pueda chequear
 * si un nombre de equipo resuelto está en el set canónico. */
export const CANONICAL_TEAMS = new Set(Object.values(TEAM_ALIASES));

/**
 * Normaliza un texto a un equipo canónico. Si el texto completo no resuelve
 * a un canónico (p.ej. "canada canada" cuando el mensaje trae nombre + bandera,
 * o ruido como "korea s checa 2"), prueba palabras y pares de palabras y devuelve
 * el primer equipo canónico encontrado.
 * @param {string} raw
 * @returns {string}
 */
export function resolveTeamName(raw) {
    const norm = normalizeTeamName(raw);
    if (CANONICAL_TEAMS.has(norm)) return norm;

    const words = norm.split(' ').filter(Boolean);
    // Pares de palabras adyacentes primero (equipos de dos palabras: "south korea").
    for (let k = 0; k < words.length - 1; k++) {
        const pair = normalizeTeamName(words[k] + ' ' + words[k + 1]);
        if (CANONICAL_TEAMS.has(pair)) return pair;
    }
    for (const w of words) {
        const single = normalizeTeamName(w);
        if (CANONICAL_TEAMS.has(single)) return single;
    }
    return norm;
}

/**
 * @param {string} text
 * @returns {Array<{flag: string, country: string}>}
 */
export function extractFlags(text) {
    const flags = [];
    for (const [flag, country] of Object.entries(FLAG_MAP)) {
        if (text.includes(flag)) {
            flags.push({ flag, country });
        }
    }
    return flags;
}

/**
 * @param {string} text
 * @returns {{home: number, away: number} | null}
 */
export function parseScorePattern(text) {
    const patterns = [
        /(\d+)\s*[-–]\s*(\d+)/,
        /(\d+)\s+a\s+(\d+)/,
        /(\d+)\s+[-–vs]+\s+(\d+)/
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return { home: parseInt(match[1]), away: parseInt(match[2]) };
        }
    }
    return null;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function parseChampionBet(text) {
    const championPatterns = [
        /(?:^|\n)[\s]*冠军[^a-zA-Záéíóúüñ]*([a-zA-Záéíóúüñ\s]+)/i,
        /(?:^|\n)[\s]*(?:campeón|campeon|champion|gañador|ganador)[^a-zA-Záéíóúüñ]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
        /(?:^|\n)[\s]*(?:yo apuesto.*?(?:a\s+)?|pienso.*?(?:que\s+)?|creo.*?(?:que\s+)?)(?:que\s+)?([a-zA-Záéíóúüñ\s]+?)\s+(?:es\s+)?(?:el\s+)?(?:campeón|campeon)/i,
    ];

    for (const pattern of championPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const team = normalizeTeamName(match[1].trim());
            if (team && team.length > 2) return team;
        }
    }

    const flagPattern = /(?:campeón|campeon|champion)[^\n]*?([🇲🇽🇿🇦🇰🇷🇨🇿🇫🇷🇪🇸🇦🇷🇬🇧🏴󠁧󠁢󠁥󠁮󠁧󠁿🇧🇷🇩🇪🇵🇹🇳🇱🇧🇪🇮🇹🇺🇾🇨🇱🇺🇸🇨🇦🇯🇵🇦🇺🇸🇦🇶🇦🇦🇪🇲🇦🇸🇳🇬🇭🇨🇲🇧🇦])/;
    const flagMatch = text.match(flagPattern);
    if (flagMatch) {
        const flag = /** @type {keyof typeof FLAG_MAP} */ (flagMatch[1]);
        return FLAG_MAP[flag] || null;
    }

    return null;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function parseRunnerupBet(text) {
    const runnerupPatterns = [
        /(?:^|\n)[\s]*(?:subampeón|subcamp[eé]on|subampion|sub\s*campeón)[^a-zA-Záéíóúüñ]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
        /(?:^|\n)[\s]*(?:segundo|2[º°]?\s*(?:lugar|puesto))[^\w]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
    ];

    for (const pattern of runnerupPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const team = normalizeTeamName(match[1].trim());
            if (team && team.length > 2) return team;
        }
    }

    const flagPattern = /(?:sub(?:camp|amp)[eé]on|sub\s*campeón)[^\n]*?([🇲🇽🇿🇦🇰🇷🇨🇿🇫🇷🇪🇸🇦🇷🇬🇧🏴󠁧󠁢󠁥󠁮󠁧󠁿🇧🇷🇩🇪🇵🇹🇳🇱🇧🇪🇮🇹🇺🇾🇨🇱🇺🇸🇨🇦🇯🇵🇦🇺🇸🇦🇶🇦🇦🇪🇲🇦🇸🇳🇬🇭🇨🇲🇧🇦])/;
    const flagMatch = text.match(flagPattern);
    if (flagMatch) {
        const flag = /** @type {keyof typeof FLAG_MAP} */ (flagMatch[1]);
        return FLAG_MAP[flag] || null;
    }

    return null;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function parseTopscorerBet(text) {
    const topscorerPatterns = [
        /(?:^|\n)[\s]*(?:goleador|goleador|sub\s*goleador)[^a-zA-Záéíóúüñ]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
        /(?:^|\n)[\s]*(?:top scorer|maximo|goles?)[^\w]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
        /(?:^|\n)[\s]*(?:anotador|marcador)[^\w]*([a-zA-Záéíóúüñ\s]+?)(?:\n|$)/i,
    ];

    for (const pattern of topscorerPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            if (name && name.length > 2) return name;
        }
    }
    return null;
}

/**
 * @param {string} text
 * @returns {string}
 */
function replaceFlags(text) {
    let result = text;
    for (const [flag, country] of Object.entries(FLAG_MAP)) {
        result = result.split(flag).join(' ' + country + ' ');
    }
    return result;
}

/**
 * @param {string} text
 * @returns {Array<{home: number, away: number, homeTeam: string, awayTeam: string}>}
 */
export function parseAllScoreBets(text) {
    /** @type {Array<{home: number, away: number, homeTeam: string, awayTeam: string}>} */
    const results = [];
    const seen = new Set();

    // "o" aislado → "0" (typo frecuente de teclado en WhatsApp: "Canadá 2 catar o")
    const textWithZeros = text.replace(/(?<=\s|^)(o|O)(?=\s|$|[.,;:])/g, '0');

    const textWithNames = replaceFlags(textWithZeros)
        // Cualquier emoji no mapeado en FLAG_MAP queda pegado al número (ej. "Usa🇺🇲1");
        // lo convertimos en separador para no perder la apuesta al tokenizar.
        // Importante: las banderas son dos Regional_Indicator seguidos (no son
        // Extended_Pictographic), así que hay que incluirlas explícitamente.
        // ZWJ (\u200d) cubre secuencias compuestas (banderas con TAG, etc.).
        .replace(/(?:\p{Regional_Indicator}{2}|[\p{Extended_Pictographic}\u200d])/gu, ' ');
    const separated = textWithNames.replace(/([A-Za-záéíóúüñÁÉÍÓÚÜÑ])(\d)/g, '$1 $2');
    const rawLines = separated.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Pre-proceso: si una línea es solo un número, unirla a la línea anterior.
    // Caso típico en WhatsApp: "USA 2 Australia\n0" — el 0 (marcador visitante)
    // se fue a una nueva línea por Enter accidental o copy-paste. Sin esta
    // unión, la primera pasada pierde la línea incompleta ("team1 num team2"
    // sin segundo número no matchea) y la segunda pasada no la recupera
    // porque `extractTeamAndNum("0")` retorna null (numIdx===0).
    const lines = [];
    for (const line of rawLines) {
        if (/^\d+$/.test(line) && lines.length > 0) {
            lines[lines.length - 1] += ' ' + line;
        } else {
            lines.push(line);
        }
    }

    /**
     * @param {string} home
     * @param {string} away
     * @param {number} hs
     * @param {number} as_
     */
    function addBet(home, away, hs, as_) {
        const key = `${home}|${away}|${hs}|${as_}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push({
            home: hs,
            away: as_,
            homeTeam: home,
            awayTeam: away
        });
    }

    /**
     * @param {string} line
     * @returns {Array<{home: string, away: string, hs: number, as_: number}>}
     */
    function parseAllMatchesInLine(line) {
        /** @type {Array<{home: string, away: string, hs: number, as_: number}>} */
        const results = [];

        const matchStrings = line.split(/[,;]\s*|\n/).filter(s => s.trim().length > 0);

        for (const matchStr of matchStrings) {
            let cleanMatch = matchStr
                .replace(/\bvs\.?\b/gi, ' ')
                .replace(/\bvrs\.?\b/gi, ' ')
                // "2 a 1" → la "a" es separador de marcador, no equipo: la quitamos.
                .replace(/(\d)\s+a\s+(\d)/gi, '$1 $2')
                // "1 - 1" o "1-1" → convertir a "1§2" para detectar como marcador compuesto
                .replace(/(\d)\s*[-–]\s*(\d)/g, '$1§$2')
                // "3-C" o "3-C verde" → donde C es una letra inicial de equipo: expandir abreviatura
                .replace(/(\d)-([A-ZÁÉÍÓÚÜÑ])(\s+|$)/gi, (match, num, letter, after) => {
                    /** @type {Record<string, string>} */
                    const expansions = {
                        'C': 'Cabo Verde', 'E': 'Ecuador', 'B': 'Brazil', 'I': 'Iran',
                        'A': 'Arabia', 'S': 'Saudi Arabia', 'P': 'Paraguay', 'U': 'Uruguay',
                        'M': 'Marruecos', 'H': 'Haiti'
                    };
                    const teamName = expansions[letter] || letter;
                    return `${num} ${teamName} `;
                })
                // "2-Egipto" → separar número de nombre de equipo (N-TEAM donde TEAM empieza con letra)
                .replace(/(\d)-([A-Za-záéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2')
                // "1- Uruguay" → convertir a "1 Uruguay" (score seguido de guión y espacio antes de equipo)
                .replace(/(\d)[-–]\s+([A-Za-záéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2')
                // "1escocia" → poner espacio entre número y texto
                .replace(/(\d)([A-Za-záéíóúüñÁÉÍÓÚÜÑ])/g, '$1 $2')
                .replace(/([A-Za-záéíóúüñÁÉÍÓÚÜÑ])(\d)/g, '$1 $2')
                .replace(/\s+/g, ' ')
                .trim();

            const tokens = cleanMatch.split(' ').filter(Boolean);
            if (tokens.length < 3) continue;

            const tokenData = [];
            for (const tok of tokens) {
                const hyphenMatch = tok.match(/^(\d+)[-–§](\d+)$/);
                if (hyphenMatch) {
                    tokenData.push({ raw: tok, num: parseInt(hyphenMatch[1]), awayScore: parseInt(hyphenMatch[2]), team: null });
                } else {
                    const cleanTok = tok.replace(/[.,]$/, '');
                    tokenData.push({ raw: tok, num: /^\d+$/.test(cleanTok) ? parseInt(cleanTok) : null, awayScore: null, team: normalizeTeamName(tok.replace(/[.,§]$/, '')) });
                }
            }

            const joinedTokens = [];
            let i = 0;
            while (i < tokenData.length) {
                const td = tokenData[i];
                if (td.num !== null) {
                    if (td.awayScore === null && i + 1 < tokenData.length && tokenData[i + 1].num !== null) {
                        const compoundTd = { raw: td.raw + '§' + tokenData[i + 1].raw, num: td.num, awayScore: tokenData[i + 1].num, team: null };
                        joinedTokens.push(compoundTd);
                        i += 2;
                    } else {
                        joinedTokens.push(td);
                        i++;
                    }
                    continue;
                }

                let combined = td.raw;
                let j = i + 1;
                while (j < tokenData.length && tokenData[j].num === null) {
                    combined += ' ' + tokenData[j].raw;
                    j++;
                }

                joinedTokens.push({
                    raw: combined,
                    num: null,
                    awayScore: null,
                    team: resolveTeamName(combined)
                });
                i = j;
            }

            let pos = 0;
            while (pos + 3 <= joinedTokens.length) {
                const t1 = joinedTokens[pos];
                const s1 = joinedTokens[pos + 1];
                const t2 = joinedTokens[pos + 2];
                const s2 = joinedTokens[pos + 3];

                if (t1.num === null && s1.num !== null && t2.num === null) {
                    if (s1.awayScore !== null) {
                        const homeTeam = t1.team;
                        const awayTeam = t2.team;
                        if (homeTeam && awayTeam && homeTeam !== awayTeam) {
                            results.push({ home: homeTeam, away: awayTeam, hs: s1.num, as_: s1.awayScore });
                        }
                        pos += 3;
                    } else if (s2 && s2.num !== null) {
                        const homeTeam = t1.team;
                        const awayTeam = t2.team;
                        if (homeTeam && awayTeam && homeTeam !== awayTeam) {
                            results.push({ home: homeTeam, away: awayTeam, hs: s1.num, as_: s2.num });
                        }
                        pos += 4;
                    } else {
                        pos++;
                    }
                } else {
                    pos++;
                }
            }
        }

        const seenKeys = new Set();
        const uniqueResults = [];
        for (const r of results) {
            const key = `${r.home}|${r.away}|${r.hs}|${r.as_}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueResults.push(r);
            }
        }
        return uniqueResults;
    }

    for (const line of lines) {
        const matches = parseAllMatchesInLine(line);
        for (const m of matches) {
            addBet(m.home, m.away, m.hs, m.as_);
        }
    }

    /**
     * @param {string} line
     * @returns {{team: string, num: number} | null}
     */
    function extractTeamAndNum(/** @type {string} */ line) {
        const norm = line
            .replace(/\bvs\.?\b/gi, ' ')
            .replace(/[-–]/g, ' ')
            .replace(/\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const tokens = norm.split(' ').filter(Boolean);

        let num = null;
        let numIdx = -1;
        for (let i = 0; i < tokens.length; i++) {
            if (/^\d+$/.test(tokens[i])) {
                num = parseInt(tokens[i]);
                numIdx = i;
                break;
            }
        }
        if (num === null || numIdx === 0) return null;

        const teamTokens = tokens.slice(0, numIdx);
        let team = resolveTeamName(teamTokens.join(' '));
        if (!team || team.length <= 2) {
            team = resolveTeamName(teamTokens[teamTokens.length - 1]);
        }

        return (team !== null && team.length > 2) ? { team, num } : null;
    }

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function lineHasCompleteMatch(/** @type {string} */ line) {
        const matches = parseAllMatchesInLine(line);
        return matches.length > 0;
    }

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function lineHasSingleTeamAndScore(/** @type {string} */ line) {
        const extracted = extractTeamAndNum(line);
        if (!extracted) return false;
        const norm = line
            .replace(/\bvs\.?\b/gi, ' ')
            .replace(/[-–]/g, ' ')
            .replace(/\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const tokens = norm.split(' ').filter(Boolean);
        const numCount = tokens.filter(t => /^\d+$/.test(t)).length;
        return numCount === 1;
    }

    for (let i = 0; i < lines.length - 1; i++) {
        const line1 = lines[i];
        const line2 = lines[i + 1];

        if (lineHasCompleteMatch(line1) || lineHasCompleteMatch(line2)) {
            continue;
        }

        const a = extractTeamAndNum(line1);
        const b = extractTeamAndNum(line2);
        if (a && b && a.team !== b.team) {
            addBet(a.team, b.team, a.num, b.num);
            i++;
        }
    }

    return results;
}

/**
 * @param {string} text
 */
export function parseScoreBet(text) {
    const allScores = parseAllScoreBets(text);
    console.log('parseAllScoreBets:', allScores);

    if (allScores.length > 0) {
        return allScores.map(s => ({
            type: 'score',
            homeTeam: s.homeTeam,
            awayTeam: s.awayTeam,
            homeScore: s.home,
            awayScore: s.away,
            bet_text: `${s.homeTeam} ${s.home} - ${s.away} ${s.awayTeam}`
        }));
    }

    return null;
}

/**
 * @param {any} message
 * @returns {Bet[]}
 */
export function parseMessage(message) {
    const text = message.Message || message.message || message.bet_text || message.original_message || '';
    const timestamp = message.Time || message.timestamp || message.date || '';
    const participant = resolveParticipantName(message);
    const phone = message.Phone || message.phone || '';
    const messageId = message['Message Id'] || message.id || '';

    const existingStatus = message.status || 'pending';
    const existingPoints = Number(message.points) || 0;
    const existingRealResult = message.real_result || null;

    /** @type {Bet[]} */
    const bets = [];

    const champion = parseChampionBet(text);
    if (champion) {
        bets.push({
            id: `${messageId}_champion`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'champion',
            prediction: { champion },
            bet_text: `Campeón: ${champion}`,
            status: existingStatus,
            points: existingPoints,
            real_result: existingRealResult,
            verified: false,
            manuallyEdited: false
        });
    }

    const runnerup = parseRunnerupBet(text);
    if (runnerup) {
        bets.push({
            id: `${messageId}_runnerup`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'runnerup',
            prediction: { runnerup },
            bet_text: `Subcampeón: ${runnerup}`,
            status: existingStatus,
            points: existingPoints,
            real_result: existingRealResult,
            verified: false,
            manuallyEdited: false
        });
    }

    const topscorer = parseTopscorerBet(text);
    if (topscorer) {
        bets.push({
            id: `${messageId}_topscorer`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'topscorer',
            prediction: { topscorer },
            bet_text: `Goleador: ${topscorer}`,
            status: existingStatus,
            points: existingPoints,
            real_result: existingRealResult,
            verified: false,
            manuallyEdited: false
        });
    }

    const scoreBets = parseScoreBet(text);
    console.log('parseScoreBet:', text.substring(0, 50), '→', scoreBets?.length, 'bets');
    if (scoreBets && scoreBets.length > 0) {
        for (const scoreBet of scoreBets) {
            bets.push({
                id: `${messageId}_score_${bets.filter(b => b.type === 'score').length}`,
                messageId,
                timestamp,
                participant,
                phone,
                originalMessage: text,
                type: 'score',
                prediction: {
                    homeTeam: scoreBet.homeTeam,
                    awayTeam: scoreBet.awayTeam,
                    homeScore: scoreBet.homeScore,
                    awayScore: scoreBet.awayScore
                },
                bet_text: scoreBet.bet_text,
                status: existingStatus,
                points: existingPoints,
                real_result: existingRealResult,
                verified: false,
                manuallyEdited: false
            });
        }
    }

    if (bets.length === 0 && (message.bet_text || message.original_message)) {
        bets.push({
            id: messageId || `bet_${Math.random().toString(36).substr(2, 9)}`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: message.type || 'score',
            prediction: message.prediction || {},
            bet_text: message.bet_text || text,
            status: existingStatus,
            points: existingPoints,
            real_result: existingRealResult,
            verified: message.verified || false,
            manuallyEdited: message.manuallyEdited || false
        });
    }

    return bets;
}

/**
 * @param {any} jsonData
 * @returns {Bet[]}
 */
export function parseWhatsAppExport(jsonData) {
    /** @type {Bet[]} */
    const allBets = [];
    const messages = Array.isArray(jsonData) ? jsonData : jsonData.messages || [];

    messages.forEach((/** @type {any} */ msg) => {
        if (!msg.Message && !msg.message && !msg.bet_text && !msg.original_message) return;
        const text = msg.Message || msg.message || msg.bet_text || msg.original_message || '';
        if (isOrganizerAnnouncement(text)) return;
        const bets = parseMessage(msg);
        allBets.push(...bets);
    });

    return dropOverLimitMessages(allBets);
}

const ORGANIZER_PATTERNS = [
    /\bejemplos?\s*:/i,
    /https?:\/\//i,
    /]https[:/.]*ceslep[:/.]*github[:/.]*io[:/.]*polla/i,
    /🏆\s*CLASIFICACI[OÓ]N/i,
    /Recuerden\s+usar\s+el\s+formato/i,
    /Ojo.*ponen.*[Cc]ero/i
];

/**
 * Detecta mensajes del organizador (recordatorios de formato, post de
 * clasificación, plantillas con "Ejemplo:", etc.) que no son apuestas reales.
 * @param {string} text
 * @returns {boolean}
 */
export function isOrganizerAnnouncement(text) {
    if (!text) return false;
    for (const pattern of ORGANIZER_PATTERNS) {
        if (pattern.test(text)) return true;
    }
    return false;
}

/**
 * Descarta apuestas cuyo `originalMessage` matchea algún patrón de mensaje
 * del organizador. Útil para limpiar datos de Google Sheets que fueron
 * parseados antes de que se agregara un filtro nuevo.
 * @param {Bet[]} bets
 * @returns {Bet[]}
 */
export function dropOrganizerBets(bets) {
    return bets.filter(bet => !bet || !isOrganizerAnnouncement(bet.originalMessage));
}

export const MAX_BETS_PER_MESSAGE = 6;

/**
 * Descarta todas las apuestas cuyo `messageId` aparezca en más de
 * MAX_BETS_PER_MESSAGE apuestas. Esos mensajes casi siempre son ruido
 * (texto mal interpretado como varios score-bets) y saturan el ranking
 * con filas que no corresponden a cruces reales. No muta los objetos.
 * @param {Bet[]} bets
 * @returns {Bet[]}
 */
export function dropOverLimitMessages(bets) {
    const counts = new Map();
    for (const bet of bets) {
        if (!bet || !bet.messageId) continue;
        counts.set(bet.messageId, (counts.get(bet.messageId) || 0) + 1);
    }
    const overLimit = new Set();
    for (const [messageId, count] of counts) {
        if (count > MAX_BETS_PER_MESSAGE) overLimit.add(messageId);
    }
    if (overLimit.size === 0) return bets;
    return bets.filter(bet => !bet || !bet.messageId || !overLimit.has(bet.messageId));
}

/**
 * Convierte los mensajes manuales definidos en `manualBets.js` en apuestas
 * estructuradas usando el mismo `parseMessage` que los mensajes del export.
 * Pensado para tapar el caso en que un mensaje real no aparece en el JSON
 * subido (export de WhatsApp no sincronizado al momento de exportar).
 * @returns {Bet[]}
 */
export function parseManualBets() {
    /** @type {Bet[]} */
    const out = [];
    for (const msg of MANUAL_BETS) {
        out.push(...parseMessage(msg));
    }
    return out;
}

/**
 * Re-parsea los `originalMessage` de bets ya persistidas para detectar
 * apuestas que faltan. Caso típico: un mensaje pre-fix del parser solo
 * generó 3 de 4 bets; esas 3 se guardaron en Sheets, pero la 4ª nunca
 * se persistió porque nadie la creó. `refreshFromSheets` solo lee bets
 * de Sheets y las re-califica, así que la 4ª permanece ausente para
 * siempre salvo que (a) se re-suba el JSON original, o (b) este helper
 * la regenere a partir del `originalMessage` persistido.
 *
 * Devuelve solo las bets NUEVAS (no presentes por `betKey` en el input)
 * con IDs únicos del estilo `${messageId}_score_reparse_${idx}` para
 * no colisionar con los `_score_${idx}` que ya están en Sheets. Una vez
 * insertadas, `saveBetsToSheets` hace UPSERT y `betKey` las considera
 * en el `uniqueBets` del próximo refresh —不会再 generarlas de nuevo.
 *
 * @param {Bet[]} sheetsBets
 * @returns {Bet[]}
 */
export function reparseMissingBets(sheetsBets) {
    if (!Array.isArray(sheetsBets) || sheetsBets.length === 0) return [];

    const groups = new Map();
    for (const b of sheetsBets) {
        if (!b || !b.messageId) continue;
        if (!groups.has(b.messageId)) groups.set(b.messageId, []);
        groups.get(b.messageId).push(b);
    }

    const existingKeys = new Set();
    for (const b of sheetsBets) {
        if (!b) continue;
        existingKeys.add(betKey(b));
    }

    /** @type {Bet[]} */
    const out = [];
    for (const [messageId, group] of groups) {
        if (!group.length) continue;
        const first = group[0];
        if (!first.originalMessage) continue;

        const syntheticMsg = {
            Message: first.originalMessage,
            'Message Id': messageId,
            Time: first.timestamp,
            'Display Name': first.participant,
            Phone: first.phone || ''
        };

        const reparsed = parseMessage(syntheticMsg);
        let reparseIdx = 0;
        for (const bet of reparsed) {
            const key = betKey(bet);
            if (existingKeys.has(key)) continue;
            bet.id = `${messageId}_score_reparse_${reparseIdx}`;
            reparseIdx++;
            out.push(bet);
            existingKeys.add(key);
        }
    }
    return out;
}

/**
 * @typedef {Object} ParserIssue
 * @property {string} code - Identificador estable (e.g. `'orphan_number'`, `'o_for_zero'`).
 * @property {string} label - Descripción legible en español.
 * @property {'low'|'medium'|'high'} severity
 * @property {string} [snippet] - Fragmento del originalMessage que disparó la señal.
 */

/**
 * Analiza el texto crudo de un mensaje de WhatsApp y devuelve una lista de
 * "issues" que indican que `parseAllScoreBets` tuvo que aplicar heurísticas
 * o workarounds para extraer las apuestas. Sirve para mostrar al admin qué
 * mensajes llegaron con formato dudoso y revisar el `originalMessage` a mano.
 *
 * No re-parsea (es un analizador estático sobre el texto) y no muta nada.
 * Las señales que detecta coinciden con los workarounds ya implementados
 * en el parser:
 *
 *  - `orphan_number`   línea con sólo un número (caso "USA 2 Australia\n0")
 *  - `o_for_zero`      "o"/"O" aislado entre espacios o puntuación, que el
 *                      parser reescribe como "0" (typo "Canadá 2 catar o")
 *  - `hyphen_score`    marcadores con "-" o "–" ("1-1", "2–3")
 *  - `unknown_flag`    par de Regional_Indicator que NO está en FLAG_MAP
 *  - `no_space_num_text` dígito pegado a letra sin espacio ("1escocia", "2C")
 *  - `cross_line_score` dos líneas adyacentes con patrón "equipo número"
 *                      cada una (el parser las une a través del segundo loop)
 *  - `unknown_team`    `normalizeTeamName` devolvió algo que NO está en
 *                      CANONICAL_TEAMS (typo o equipo no reconocido)
 *  - `reparse_recovered` algún bet derivado tiene id con sufijo `_reparse_N`,
 *                      emitido por `reparseMissingBets` (señal "el parser
 *                      perdió esta apuesta en una versión vieja y se recuperó")
 *
 * Las issues se deduplican por `(code, snippet)` para no spamear cuando
 * un mismo mensaje tiene varios score-bets con el mismo problema.
 *
 * @param {string} text - `originalMessage` del bet o texto crudo del mensaje.
 * @param {Array<{ id?: string, type?: string, prediction?: any }>} [derivedBets=[]]
 *   Bets ya extraídos de este mensaje (para chequear equipos canónicos y
 *   `_reparse_` suffix). Si se omite, esas dos señales no se reportan.
 * @returns {ParserIssue[]}
 */
export function collectParserWorkarounds(text, derivedBets = []) {
    /** @type {ParserIssue[]} */
    const issues = [];
    if (!text) return issues;

    const lines = text.split('\n');
    const nonEmptyLines = lines.map(l => l.trim()).filter(Boolean);

    /** @type {Set<string>} */
    const seen = new Set();
    /** @param {ParserIssue} issue */
    function add(issue) {
        const key = `${issue.code}::${issue.snippet || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push(issue);
    }

    for (const raw of lines) {
        const t = raw.trim();
        if (/^\d+$/.test(t)) {
            add({
                code: 'orphan_number',
                label: 'Línea con sólo un número (probable marcador)',
                severity: 'medium',
                snippet: t
            });
        }
    }

    const oMatches = text.match(/(?<=\s|^)(o|O)(?=\s|$|[.,;:])/g);
    if (oMatches && oMatches.length > 0) {
        add({
            code: 'o_for_zero',
            label: '"o" tipográfica usada como 0',
            severity: 'high',
            snippet: oMatches[0]
        });
    }

    const dashScoreMatches = text.match(/\b\d+\s*[-–]\s*\d+\b/g);
    if (dashScoreMatches && dashScoreMatches.length > 0) {
        add({
            code: 'hyphen_score',
            label: 'Marcador con guión/raya («1-1», «2–3»…)',
            severity: 'medium',
            snippet: dashScoreMatches[0]
        });
    }

    const riPairs = text.match(/\p{Regional_Indicator}{2}/gu) || [];
    for (const pair of riPairs) {
        if (!FLAG_MAP[/** @type {keyof typeof FLAG_MAP} */ (pair)]) {
            add({
                code: 'unknown_flag',
                label: `Bandera no reconocida: ${pair}`,
                severity: 'high',
                snippet: pair
            });
        }
    }

    const noSpaceMatches = text.match(/\d[A-Za-záéíóúüñÁÉÍÓÚÜÑ]/g);
    if (noSpaceMatches && noSpaceMatches.length > 0) {
        add({
            code: 'no_space_num_text',
            label: 'Número pegado a equipo sin espacio',
            severity: 'medium',
            snippet: noSpaceMatches[0]
        });
    }

    for (let i = 0; i < nonEmptyLines.length - 1; i++) {
        const l1 = nonEmptyLines[i];
        const l2 = nonEmptyLines[i + 1];
        const a = singleTeamAndNumberOnLine(l1);
        const b = singleTeamAndNumberOnLine(l2);
        if (a && b && a.team !== b.team) {
            const l1Trim = l1.length > 24 ? l1.slice(0, 22) + '…' : l1;
            const l2Trim = l2.length > 24 ? l2.slice(0, 22) + '…' : l2;
            add({
                code: 'cross_line_score',
                label: 'Marcador partido en dos líneas',
                severity: 'high',
                snippet: `${l1Trim} ⏎ ${l2Trim}`
            });
        }
    }

    /** @type {Set<string>} */
    const reportedTeams = new Set();
    for (const bet of derivedBets) {
        if (bet.type === 'score' && bet.prediction) {
            for (const key of /** @type {const} */ (['homeTeam', 'awayTeam'])) {
                const raw = bet.prediction[key];
                if (!raw) continue;
                const norm = normalizeTeamName(raw);
                if (norm && !CANONICAL_TEAMS.has(norm) && !reportedTeams.has(norm)) {
                    reportedTeams.add(norm);
                    add({
                        code: 'unknown_team',
                        label: `Equipo no canónico: «${norm}»`,
                        severity: 'high',
                        snippet: norm
                    });
                }
            }
        }
    }

    for (const bet of derivedBets) {
        if (typeof bet.id === 'string' && /_reparse_\d+$/.test(bet.id)) {
            add({
                code: 'reparse_recovered',
                label: 'Apuesta recuperada por retro-fix del parser',
                severity: 'low',
                snippet: ''
            });
            break;
        }
    }

    return issues;
}

/**
 * Helper local de `collectParserWorkarounds`. Devuelve `{team, num}` si la
 * línea es del estilo "equipo(s) número" con el número al final (señal de
 * que la línea quedó incompleta y el parser la completará con la línea
 * siguiente). Devuelve null si la línea ya contiene un partido completo
 * (número en el medio, más de un número, etc.).
 * @param {string} line
 * @returns {{ team: string, num: number } | null}
 */
function singleTeamAndNumberOnLine(line) {
    const norm = line
        .replace(/\bvs\.?\b/gi, ' ')
        .replace(/[-–]/g, ' ')
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = norm.split(' ').filter(Boolean);

    /** @type {number[]} */
    const numIdxs = [];
    for (let i = 0; i < tokens.length; i++) {
        if (/^\d+$/.test(tokens[i])) numIdxs.push(i);
    }
    if (numIdxs.length !== 1) return null;

    const numIdx = numIdxs[0];
    if (numIdx === 0) return null;
    if (numIdx < tokens.length - 1) return null;

    const teamTokens = tokens.slice(0, numIdx);
    const team = resolveTeamName(teamTokens.join(' '));
    if (!team || team.length <= 2) return null;

    return { team, num: parseInt(tokens[numIdx], 10) };
}
