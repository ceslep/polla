// @ts-nocheck

const FLAG_MAP = {
    '🇲🇽': 'Mexico',
    '🇿🇦': 'South Africa',
    '🇰🇷': 'South Korea',
    '🇨🇿': 'Czechia',
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
    // FIX: 🇨🇱 es Chile, no Colombia. Colombia es 🇨🇴
    '🇨🇱': 'Chile',
    '🇨🇴': 'Colombia',
    '🇺🇸': 'United States',
    '🇺🇲': 'United States', // FIX: alias de bandera USA usado en el chat
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
    '🇧🇦': 'Bosnia and Herzegovina',
    '🇵🇾': 'Paraguay'
};

const TEAM_ALIASES = {
    // Mexico
    'mexico': 'Mexico',
    'méxico': 'Mexico',
    // South Africa
    'sudafeica': 'South Africa',
    'sudafrica': 'South Africa',
    'sudáfrica': 'South Africa',
    'surafrica': 'South Africa',           // FIX: nuevo alias (mensaje 21)
    'sur africa': 'South Africa',
    'sadafrica': 'South Africa',           // FIX: typo del chat (mensaje 1)
    'south africa': 'South Africa',
    // South Korea
    'corea': 'South Korea',
    'corea s': 'South Korea',              // FIX: abreviatura usada en el chat
    'corea del sur': 'South Korea',        // FIX: nombre completo en español
    'korea': 'South Korea',
    'south korea': 'South Korea',
    // Czechia
    'checa': 'Czechia',
    'chequia': 'Czechia',                  // FIX: variante usada en el chat
    'czech': 'Czechia',
    'chec': 'Czechia',
    'república checa': 'Czechia',          // FIX: nombre completo
    'republica checa': 'Czechia',
    'rep. checa': 'Czechia',               // FIX: abreviatura con punto
    'r. checa': 'Czechia',                 // FIX: abreviatura corta
    'r checa': 'Czechia',                  // FIX: sin punto
    'rep checa': 'Czechia',
    // France
    'francia': 'France',
    'france': 'France',
    // Spain
    'españa': 'Spain',
    'espana': 'Spain',
    'spain': 'Spain',
    // Argentina
    'argentina': 'Argentina',
    // England / UK
    'inglaterra': 'England',
    'england': 'England',
    'uk': 'United Kingdom',
    // Brazil
    'brasil': 'Brazil',
    'brazil': 'Brazil',
    // Germany
    'alemania': 'Germany',
    'alemana': 'Germany',
    'germany': 'Germany',
    // Portugal
    'portugal': 'Portugal',
    // Netherlands
    'holanda': 'Netherlands',
    'paises bajos': 'Netherlands',
    'p bajos': 'Netherlands',
    'netherlands': 'Netherlands',
    // Belgium
    'bélgica': 'Belgium',
    'belgica': 'Belgium',
    'belgium': 'Belgium',
    // Italy
    'italia': 'Italy',
    'italy': 'Italy',
    // Uruguay
    'uruguay': 'Uruguay',
    // Colombia
    'colombia': 'Colombia',
    // Chile  FIX: Chile estaba ausente
    'chile': 'Chile',
    // United States
    'eeuu': 'United States',
    'ee.uu': 'United States',              // FIX: variante con puntos (mensaje 64)
    'estados unidos': 'United States',
    'usa': 'United States',
    'euu': 'United States',               // FIX: typo del chat (mensaje 61)
    // Canada
    'canadá': 'Canada',
    'canada': 'Canada',
    'canda': 'Canada',                     // FIX: typo del chat
    'can': 'Canada',                       // FIX: abreviatura (mensaje 60)
    // Japan
    'japón': 'Japan',
    'japon': 'Japan',
    'japan': 'Japan',
    // Australia
    'australia': 'Australia',
    // Saudi Arabia
    'arabia': 'Saudi Arabia',
    'arabia saudita': 'Saudi Arabia',
    'arabia saudí': 'Saudi Arabia',
    'arabia saudi': 'Saudi Arabia',
    // Qatar
    'qatar': 'Qatar',
    // UAE
    'emiratos': 'United Arab Emirates',
    // Morocco
    'marruecos': 'Morocco',
    'morocco': 'Morocco',
    // Senegal
    'senegal': 'Senegal',
    // Ghana
    'ghana': 'Ghana',
    // Cameroon
    'camerún': 'Cameroon',
    'camerun': 'Cameroon',
    'cameroon': 'Cameroon',
    // Bosnia
    'bosnia': 'Bosnia and Herzegovina',
    'bos': 'Bosnia and Herzegovina',       // FIX: abreviatura (mensaje 60)
    'bósnia': 'Bosnia and Herzegovina',    // FIX: typo con tilde (mensaje 56)
    'bosnia-herzegovina': 'Bosnia and Herzegovina',
    'bosnia herzegovina': 'Bosnia and Herzegovina',
    'bosnia-herz': 'Bosnia and Herzegovina',
    // Paraguay
    'paraguay': 'Paraguay',
    'parag': 'Paraguay',
    'parag.': 'Paraguay',
    'para': 'Paraguay',
    // Scotland
    'escancia': 'Scotland',
    'escocia': 'Scotland',
    'escosia': 'Scotland',
    'scotland': 'Scotland',
    // Switzerland
    'suisa': 'Switzerland',
    'suiza': 'Switzerland',
    'zuisa': 'Switzerland',
    'zuiza': 'Switzerland',
    'switzerland': 'Switzerland',
    // Saudi Arabia
    'arabia': 'Saudi Arabia',
    'arabia saudita': 'Saudi Arabia',
    // Qatar
    'qatar': 'Qatar',
    'qarar': 'Qatar',
    // Iran
    'irán': 'Iran',
    'iran': 'Iran',
    // Curaçao
    'cura': 'Curaçao',
    'curacao': 'Curaçao',
    'curaçao': 'Curaçao',
    'curazao': 'Curaçao',
    'cruzao': 'Curaçao',
    'corazao': 'Curaçao',
    // Ivory Coast
    'costa': 'Ivory Coast',
    'costa marfil': 'Ivory Coast',
    'costa de marfil': 'Ivory Coast',
    'costa d marfil': 'Ivory Coast',
    'c marfil': 'Ivory Coast',
    'c maril': 'Ivory Coast',
    'c verde': 'Ivory Coast',
    'verde': 'Ivory Coast',
    'costamarfil': 'Ivory Coast',
    'costadom': 'Ivory Coast',
    'ivory coast': 'Ivory Coast',
    // Tunisia
    'tunes': 'Tunisia',
    'tine': 'Tunisia',
    'tinez': 'Tunisia',
    'tines': 'Tunisia',
    'tunez': 'Tunisia',
    // Sweden
    'suecia': 'Sweden',
    'suecis': 'Sweden',
    'sweden': 'Sweden',
    // New Zealand
    'n zelanda': 'New Zealand',
    'zelanda': 'New Zealand',
    'nueva zelanda': 'New Zealand',
    'nueva selanda': 'New Zealand',
    // Netherlands
    'paises bajos': 'Netherlands',
    'p bajos': 'Netherlands',
    'netherlands': 'Netherlands',
};

// Conjunto de todos los valores canónicos para validación rápida
const CANONICAL_TEAMS = new Set(Object.values(TEAM_ALIASES));

function normalizeTeamName(name) {
    if (!name) return '';
    const lower = name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    return TEAM_ALIASES[lower] || null;
}

function extractFlags(text) {
    const flags = [];
    for (const [flag, country] of Object.entries(FLAG_MAP)) {
        if (text.includes(flag)) {
            flags.push({ flag, country });
        }
    }
    return flags;
}

function parseScores(text) {
    const scores = [];
    const patterns = [
        /(\d+)\s*[-–.]\s*(\d+)/g,
        /(\d+)\s+(?:vs|vrs\.?|vs\.?)\s+(\d+)/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            scores.push({
                home: parseInt(match[1]),
                away: parseInt(match[2]),
                sep: match[0].includes('-') ? '-' : match[0].includes('.') ? '.' : ' '
            });
        }
    }

    return scores;
}

/**
 * Dada una cadena de texto, extrae todos los tokens que sean equipos reconocidos.
 * Reemplaza primero las banderas por su nombre canónico para unificar el procesamiento.
 */
function replaceFlags(text) {
    let result = text;
    for (const [flag, country] of Object.entries(FLAG_MAP)) {
        result = result.split(flag).join(' ' + country + ' ');
    }
    return result;
}

/**
 * FIX PRINCIPAL: parseAllScoreBets completamente reescrito.
 *
 * Estrategia:
 * 1. Reemplazar banderas por nombres canónicos.
 * 2. Procesar línea por línea.
 * 3. En cada línea, tokenizar y buscar equipos (usando TEAM_ALIASES) y números.
 * 4. Soportar formatos:
 *    - "Equipo1 N1 [-/a] N2 Equipo2"
 *    - "Equipo1 N1 Equipo2 N2"
 *    - "Equipo1 N1" + "Equipo2 N2" en líneas consecutivas (multilinea)
 *    - "Equipo1 N1 - N2 Equipo2"
 */
function parseAllScoreBets(text) {
    const bets = [];
    const seen = new Set();

    const textWithNames = replaceFlags(text);
    const lines = textWithNames.split('\n').map(l => l.trim()).filter(Boolean);

    function addBet(home, away, hs, as_) {
        const key = `${home}|${away}|${hs}|${as_}`;
        if (seen.has(key)) return;
        seen.add(key);
        bets.push({
            type: 'score',
            homeTeam: home,
            awayTeam: away,
            homeScore: hs,
            awayScore: as_,
            bet_text: `${home} ${hs} - ${as_} ${away}`
        });
    }

    /**
     * Parsea una sola línea buscando el patrón Equipo Score Score Equipo
     * en sus distintas variantes. Devuelve { home, away, hs, as } o null.
     */
    function parseSingleLine(line) {
        // Tokenizar: dividir por espacios y separadores, conservando números
        // Normalizar separadores "vs", "a", "-", "."
        const normalized = line
            .replace(/\bvs\.?\b/gi, ' ')
            .replace(/\bvrs\.?\b/gi, ' ')
            .replace(/\ba\b/gi, ' ')   // FIX: "2 a 1" -> "2   1"
            .replace(/[-–]/g, ' ')
            .replace(/\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = normalized.split(' ').filter(Boolean);

        // Identificar posición y tipo de cada token
        const parsed = tokens.map(tok => {
            const num = /^\d+$/.test(tok) ? parseInt(tok) : null;
            const team = normalizeTeamName(tok);
            return { raw: tok, num, team };
        });

        // Buscar patrones:
        // Patrón A: [team] [num] [num] [team]   -> home away
        // Patrón B: [team] [num] [team] [num]   -> home away
        // Patrón C: [num] [team] [num] [team]   -> score1 team1 score2 team2 (inusual)

        // Recoger índices de equipos SIN duplicados consecutivos del mismo equipo
        // FIX: al reemplazar banderas, un equipo puede aparecer doble (ej: "Canadá Canada")
        const teamIdxsRaw = parsed.map((p, i) => p.team ? i : -1).filter(i => i >= 0);
        const teamIdxs = teamIdxsRaw.filter((idx, pos) => {
            if (pos === 0) return true;
            return parsed[idx].team !== parsed[teamIdxsRaw[pos - 1]].team;
        });
        const numIdxs  = parsed.map((p, i) => p.num !== null ? i : -1).filter(i => i >= 0);

        if (teamIdxs.length < 2 || numIdxs.length < 2) return null;

        const t1i = teamIdxs[0], t2i = teamIdxs[1];
        const team1 = parsed[t1i].team;
        const team2 = parsed[t2i].team;
        if (team1 === team2) return null;

        // Números que caen entre t1i y t2i (o adyacentes a ellos)
        // Patrón A: t1 n1 n2 t2
        // Patrón B: t1 n1 t2 n2
        const numsAfterT1BeforeT2 = numIdxs.filter(i => i > t1i && i < t2i);
        const numsAfterT2          = numIdxs.filter(i => i > t2i);

        if (numsAfterT1BeforeT2.length >= 2) {
            // Patrón A: t1 n1 n2 t2
            return {
                home: team1, away: team2,
                hs: parsed[numsAfterT1BeforeT2[0]].num,
                as_: parsed[numsAfterT1BeforeT2[1]].num
            };
        }
        if (numsAfterT1BeforeT2.length === 1 && numsAfterT2.length >= 1) {
            // Patrón B: t1 n1 t2 n2
            return {
                home: team1, away: team2,
                hs: parsed[numsAfterT1BeforeT2[0]].num,
                as_: parsed[numsAfterT2[0]].num
            };
        }

        // Patrón C: n1 t1 n2 t2  (ej: "1 Canada 0 Bosnia")
        const numsBeforeT1 = numIdxs.filter(i => i < t1i);
        const numsBetween  = numIdxs.filter(i => i > t1i && i < t2i);
        if (numsBeforeT1.length >= 1 && (numsBetween.length >= 1 || numsAfterT2.length >= 1)) {
            const n1 = parsed[numsBeforeT1[numsBeforeT1.length - 1]].num;
            const n2 = numsBetween.length ? parsed[numsBetween[0]].num : parsed[numsAfterT2[0]].num;
            return { home: team1, away: team2, hs: n1, as_: n2 };
        }

        return null;
    }

    // --- Procesar línea por línea ---
    for (const line of lines) {
        const result = parseSingleLine(line);
        if (result) {
            addBet(result.home, result.away, result.hs, result.as_);
        }
    }

    // --- FIX: Formato multilinea consecutivo ---
    // "México 2"  \n  "Sudáfrica 0"  ->  score México 2 - 0 Sudáfrica
    // Buscar pares de líneas donde cada una tiene exactamente 1 equipo y 1 número
    function extractTeamAndNum(line) {
        const norm = line
            .replace(/\bvs\.?\b/gi, ' ')
            .replace(/[-–]/g, ' ')
            .replace(/\./g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const tokens = norm.split(' ').filter(Boolean);
        let team = null, num = null;
        for (const tok of tokens) {
            if (!team) team = normalizeTeamName(tok);
            if (num === null && /^\d+$/.test(tok)) num = parseInt(tok);
        }
        return (team !== null && num !== null) ? { team, num } : null;
    }

    for (let i = 0; i < lines.length - 1; i++) {
        const a = extractTeamAndNum(lines[i]);
        const b = extractTeamAndNum(lines[i + 1]);
        if (a && b && a.team !== b.team) {
            // Intentar parsear las dos líneas juntas para mayor precisión
            const combinedResult = parseSingleLine(lines[i] + ' ' + lines[i + 1]);
            if (combinedResult) {
                addBet(combinedResult.home, combinedResult.away, combinedResult.hs, combinedResult.as_);
            } else {
                // Formato puro multilinea: cada línea tiene un equipo y su score
                addBet(a.team, b.team, a.num, b.num);
            }
            i++; // saltar la línea siguiente para no reusar
        }
    }

    return bets;
}

/**
 * FIX: parseChampionBet mejorado.
 * - No debe hacer match si la línea contiene "sub" antes de "campeón".
 * - Soporta más variantes: "campeon:", "campeón", banderas.
 */
function parseChampionBet(text) {
    const lines = text.split('\n');
    for (const line of lines) {
        const lineLower = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // FIX: ignorar líneas que sean de subcampeón
        if (/sub\s*camp/i.test(lineLower)) continue;

        // Patrón: "Campeón: Equipo" o "Campeon Equipo" o "Equipo campeón"
        const m = line.match(/(?:camp[eé][oó]n|champion)\s*:?\s*([^\n]+)/i);
        if (m && m[1]) {
            const textWithNames = replaceFlags(m[1].trim());
            for (const tok of textWithNames.split(/\s+/)) {
                const team = normalizeTeamName(tok);
                if (team) return team;
            }
        }

        // Patrón: "Equipo campeón" (el equipo viene antes)
        const m2 = line.match(/([A-Za-z\u00c0-\u024f]+)\s+camp[eé][oó]n/i);
        if (m2 && m2[1]) {
            const team = normalizeTeamName(m2[1].trim());
            if (team) return team;
        }
    }

    // Buscar por bandera adyacente a "campeón" en el texto completo
    const textWithNames = replaceFlags(text);
    for (const line of textWithNames.split('\n')) {
        if (/sub\s*camp/i.test(line)) continue;
        const m = line.match(/(?:camp[eé][oó]n|champion)\s*:?\s*([A-Za-z\u00c0-\u024f\s]+)/i);
        if (m && m[1]) {
            for (const tok of m[1].trim().split(/\s+/)) {
                const team = normalizeTeamName(tok);
                if (team) return team;
            }
        }
    }

    return null;
}

/**
 * FIX: parseRunnerupBet mejorado.
 * - Soporta "Sub campeón" (con espacio), "subcampeon", "Subcampeon".
 * - Soporta banderas.
 */
function parseRunnerupBet(text) {
    const textWithNames = replaceFlags(text);
    const lines = textWithNames.split('\n');

    for (const line of lines) {
        // FIX: incluir "sub campeón" con espacio
        const m = line.match(/sub\s*camp[eé][oó]n\s*:?\s*([^\n]+)/i);
        if (m && m[1]) {
            for (const tok of m[1].trim().split(/\s+/)) {
                const team = normalizeTeamName(tok);
                if (team) return team;
            }
        }
    }

    return null;
}

/**
 * FIX: parseTopscorerBet mejorado.
 * - Soporta "Goleado" (typo), "Gol:", multilinea donde el goleador está en la línea siguiente.
 */
function parseTopscorerBet(text) {
    const lines = text.split('\n').map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // FIX: "Goleado" como typo de "Goleador"
        const m = line.match(/gole(?:ador|ado|r(?:es)?|s?)[\s:]*(.+)/i);
        if (m && m[1] && m[1].trim().length > 0) {
            return m[1].trim();
        }
        // Si la línea es solo "Goleador" (sin nombre en la misma línea), tomar la siguiente
        if (/^gole(?:ador|ado|r(?:es)?|s?)\s*:?\s*$/i.test(line) && i + 1 < lines.length) {
            const next = lines[i + 1].trim();
            if (next.length > 0 && !/camp[eé][oó]n|sub/i.test(next)) {
                return next;
            }
        }
    }

    return null;
}

function parseMessage(message) {
    const text = message.Message || message.message || '';
    const timestamp = message.Time || message.timestamp || message.date || '';
    const participant = message['Display Name'] || message.participant || message.sender || 'Unknown';
    const phone = message.Phone || message.phone || '';
    const messageId = message['Message Id'] || message.id || '';

    const bets = [];

    const champion = parseChampionBet(text);
    if (champion) {
        bets.push({
            id: `${messageId}_bet_${bets.length}`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'champion',
            prediction: { champion },
            bet_text: `Campeón: ${champion}`,
            status: 'pending',
            points: 0,
            real_result: null,
            verified: false,
            manuallyEdited: false
        });
    }

    const runnerup = parseRunnerupBet(text);
    if (runnerup) {
        bets.push({
            id: `${messageId}_bet_${bets.length}`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'runnerup',
            prediction: { runnerup },
            bet_text: `Subcampeón: ${runnerup}`,
            status: 'pending',
            points: 0,
            real_result: null,
            verified: false,
            manuallyEdited: false
        });
    }

    const topscorer = parseTopscorerBet(text);
    if (topscorer) {
        bets.push({
            id: `${messageId}_bet_${bets.length}`,
            messageId,
            timestamp,
            participant,
            phone,
            originalMessage: text,
            type: 'topscorer',
            prediction: { topscorer },
            bet_text: `Goleador: ${topscorer}`,
            status: 'pending',
            points: 0,
            real_result: null,
            verified: false,
            manuallyEdited: false
        });
    }

    const scoreBets = parseAllScoreBets(text);
    for (const scoreBet of scoreBets) {
        bets.push({
            id: `${messageId}_bet_${bets.length}`,
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
            status: 'pending',
            points: 0,
            real_result: null,
            verified: false,
            manuallyEdited: false
        });
    }

    return bets;
}

function parseWhatsAppExport(jsonData) {
    const allBets = [];
    const messages = Array.isArray(jsonData) ? jsonData : jsonData.messages || [];

    console.log('parseWhatsAppExport: mensajes recibidos', messages.length);

    messages.forEach((msg, index) => {
        if (!msg.Message && !msg.message) {
            console.log('Mensaje ' + index + ' sin campo Message');
            return;
        }

        const bets = parseMessage(msg);
        console.log('Mensaje ' + index + ' (' + msg['Display Name'] + '): ' + bets.length + ' bets');
        if (bets.length === 0) {
            console.log('  Texto: ' + (msg.Message || msg.message).substring(0, 100));
        }
        allBets.push(...bets);
    });

    return allBets;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FLAG_MAP,
        TEAM_ALIASES,
        normalizeTeamName,
        replaceFlags,
        extractFlags,
        parseScores,
        parseChampionBet,
        parseRunnerupBet,
        parseTopscorerBet,
        parseAllScoreBets,
        parseMessage,
        parseWhatsAppExport
    };
}