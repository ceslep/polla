import countries from '../../public/countries.json' with { type: 'json' };
import { normalizeTeamName } from './parser.js';

/**
 * Banderas de selecciones.
 *
 * El parser normaliza los nombres de equipo a su forma canónica en inglés
 * (Mexico, South Korea, Argentina, etc.). Aquí mapeamos esa forma canónica
 * al código ISO y luego a los datos del país (flag URL, emoji, nombre español).
 */

/** @type {Record<string, { flag: string, emoji: string, spanishName: string }>} */
const COUNTRIES_BY_CODE = {};
for (const c of countries) {
    COUNTRIES_BY_CODE[c.code.toLowerCase()] = {
        flag: c.flag,
        emoji: c.emoji,
        spanishName: c.country
    };
}

const TEAM_TO_ISO = {
    'mexico': 'mx',
    'south africa': 'za',
    'south korea': 'kr',
    'czech republic': 'cz',
    'czechia': 'cz',
    'france': 'fr',
    'spain': 'es',
    'argentina': 'ar',
    'england': 'gb-eng',
    'scotland': 'gb-sct',
    'united kingdom': 'gb',
    'brazil': 'br',
    'germany': 'de',
    'portugal': 'pt',
    'netherlands': 'nl',
    'belgium': 'be',
    'italy': 'it',
    'uruguay': 'uy',
    'colombia': 'co',
    'chile': 'cl',
    'usa': 'us',
    'united states': 'us',
    'canada': 'ca',
    'japan': 'jp',
    'australia': 'au',
    'saudi arabia': 'sa',
    'qatar': 'qa',
    'united arab emirates': 'ae',
    'morocco': 'ma',
    'senegal': 'sn',
    'ghana': 'gh',
    'cameroon': 'cm',
    'bosnia & herzegovina': 'ba',
    'bosnia and herzegovina': 'ba',
    'bosnia': 'ba',
    'paraguay': 'py',
    'haiti': 'ht',
    'switzerland': 'ch',
    'turkey': 'tr',
    'curacao': 'cw',
    'curaçao': 'cw',
    'ecuador': 'ec',
    'ivory coast': 'ci',
    'sweden': 'se',
    'tunisia': 'tn',
    'egypt': 'eg',
    'iran': 'ir',
    'new zealand': 'nz',
    'cape verde': 'cv',
    'iraq': 'iq',
    'norway': 'no',
    'algeria': 'dz',
    'austria': 'at',
    'jordan': 'jo',
    'dr congo': 'cd',
    'uzbekistan': 'uz',
    'croatia': 'hr',
    'panama': 'pa',
    'denmark': 'dk',
    'poland': 'pl',
    'ukraine': 'ua',
    'serbia': 'rs',
    'wales': 'gb-wls',
    'hungary': 'hu',
    'russia': 'ru'
};

const SUBDIVISION_EMOJI = {
    'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿'
};

const SUBDIVISION_SPAIN = {
    'gb-eng': 'Inglaterra',
    'gb-sct': 'Escocia',
    'gb-wls': 'Gales'
};

/** @param {string} iso */
function emojiFromIso(iso) {
    if (SUBDIVISION_EMOJI[/** @type {keyof typeof SUBDIVISION_EMOJI} */ (iso)]) {
        return SUBDIVISION_EMOJI[/** @type {keyof typeof SUBDIVISION_EMOJI} */ (iso)];
    }
    if (iso.length !== 2) return '';
    const base = 0x1f1e6;
    const a = iso.toUpperCase().charCodeAt(0) - 65;
    const b = iso.toUpperCase().charCodeAt(1) - 65;
    return String.fromCodePoint(base + a, base + b);
}

/** @param {string} iso */
function getSpanishNameFromIso(iso) {
    if (SUBDIVISION_SPAIN[/** @type {keyof typeof SUBDIVISION_SPAIN} */ (iso)]) {
        return SUBDIVISION_SPAIN[/** @type {keyof typeof SUBDIVISION_SPAIN} */ (iso)];
    }
    const fromJson = COUNTRIES_BY_CODE[iso];
    return fromJson?.spanishName || null;
}

/** @param {string} teamName */
export function getFlagData(teamName) {
    if (!teamName) return null;

    let iso = TEAM_TO_ISO[/** @type {keyof typeof TEAM_TO_ISO} */ (teamName.toLowerCase().trim())];
    if (!iso) {
        const canonical = normalizeTeamName(teamName);
        iso = TEAM_TO_ISO[/** @type {keyof typeof TEAM_TO_ISO} */ (canonical.toLowerCase().trim())];
    }
    if (!iso) return null;

    const fromJson = COUNTRIES_BY_CODE[iso];
    const flagUrl = fromJson?.flag || `https://flagcdn.com/${iso}.svg`;
    const spanish = fromJson?.spanishName || getSpanishNameFromIso(iso) || teamName;

    return {
        flag: flagUrl,
        emoji: emojiFromIso(iso),
        spanishName: spanish,
        englishName: teamName
    };
}
