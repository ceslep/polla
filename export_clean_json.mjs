// Reconstruye el estado "antes del ranking" de pollaweb: aplica la limpieza
// de Sheets (dropOverLimit, dropOrganizer) sobre las filas crudas, agrupa
// TODAS las apuestas por participante (incluyendo duplicados que luego
// uniqueBets() colapsa), resuelve el partido real para los score-bets pero
// NO calcula status/points ni arma ranking.
//
// Run:  node export_clean_json.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GET_BETS_URL = 'https://app.iedeoccidente.com/gs/get_bets.php';
const SPREADSHEET_ID = '1PIo_oLVjQubdbLodigV3cwOfwQ29k-SGsRmbeorI3nM';
const SHEETS_WORKSHEET = 'datos';
const GITHUB_MATCHES_URL =
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const TEAM_ALIASES = {
    'mexico': 'Mexico', 'sudafrica': 'South Africa', 'south africa': 'South Africa',
    'corea': 'South Korea', 'corea s': 'South Korea', 'corea del sur': 'South Korea',
    'south korea': 'South Korea', 'korea republic': 'South Korea', 'korea south': 'South Korea',
    'republica': 'South Korea', 'republica de corea': 'South Korea',
    'espania': 'Spain', 'espana': 'Spain', 'spain': 'Spain',
    'francia': 'France', 'france': 'France',
    'estados unidos': 'USA', 'eeuu': 'USA', 'eua': 'USA',
    'usa': 'USA', 'united states': 'USA',
    'marruecos': 'Morocco', 'morocco': 'Morocco',
    'escocia': 'Scotland', 'scotland': 'Scotland',
    'paises bajos': 'Netherlands', 'holanda': 'Netherlands', 'netherlands': 'Netherlands',
    'japon': 'Japan', 'japan': 'Japan',
    'brasil': 'Brazil', 'brazil': 'Brazil',
    'alemania': 'Germany', 'germany': 'Germany',
    'portugal': 'Portugal', 'argentina': 'Argentina',
    'inglaterra': 'England', 'england': 'England',
    'belgica': 'Belgium', 'belgium': 'Belgium',
    'australia': 'Australia', 'austria': 'Austria',
    'turquia': 'Turkey', 'turkey': 'Turkey',
    'czechia': 'Czech Republic', 'czech republic': 'Czech Republic',
    'bosnia': 'Bosnia & Herzegovina', 'bosnia & herzegovina': 'Bosnia & Herzegovina',
    'curacao': 'Cura\u00e7ao',
    'cabo verde': 'Cape Verde', 'cape verde': 'Cape Verde',
    'ir iran': 'Iran', 'iran': 'Iran',
    'new zealand': 'New Zealand', 'nueva zelanda': 'New Zealand',
    'northern ireland': 'Northern Ireland', 'irlanda del norte': 'Northern Ireland',
    'denmark': 'Denmark', 'dinamarca': 'Denmark',
    'sweden': 'Sweden', 'suecia': 'Sweden',
    'norway': 'Norway', 'noruega': 'Norway',
    'switzerland': 'Switzerland', 'suiza': 'Switzerland',
    'poland': 'Poland', 'polonia': 'Poland',
    'serbia': 'Serbia', 'croatia': 'Croatia', 'croacia': 'Croatia',
    'ukraine': 'Ukraine', 'ucrania': 'Ukraine',
    'wales': 'Wales', 'gales': 'Wales',
    'ivory coast': "C\u00f4te d'Ivoire", 'costa de marfil': "C\u00f4te d'Ivoire",
    'senegal': 'Senegal', 'tunisia': 'Tunisia', 'tunez': 'Tunisia',
    'ghana': 'Ghana', 'nigeria': 'Nigeria',
    'colombia': 'Colombia', 'chile': 'Chile', 'uruguay': 'Uruguay',
    'paraguay': 'Paraguay', 'peru': 'Peru', 'ecuador': 'Ecuador',
    'venezuela': 'Venezuela', 'costa rica': 'Costa Rica',
    'panama': 'Panama', 'honduras': 'Honduras',
    'el salvador': 'El Salvador', 'guatemala': 'Guatemala',
    'jamaica': 'Jamaica', 'haiti': 'Haiti',
    'qatar': 'Qatar', 'saudi arabia': 'Saudi Arabia',
    'arabia saudita': 'Saudi Arabia',
    'uae': 'UAE', 'united arab emirates': 'UAE', 'emiratos arabes': 'UAE',
};
function normalizeTeamName(raw) {
    if (!raw) return '';
    const stripped = String(raw).trim();
    const key = stripped.toLowerCase().replace(/\s+/g, ' ').replace(/[.\u2019']/g, '');
    if (TEAM_ALIASES[key]) return TEAM_ALIASES[key];
    return stripped;
}

// 1. Pull raw rows
console.log('Fetching raw bets from Sheets...');
const sheetsRes = await fetch(GET_BETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: SPREADSHEET_ID, worksheetTitle: SHEETS_WORKSHEET }),
});
const sheetsJson = await sheetsRes.json();
if (!sheetsRes.ok || !sheetsJson.success) {
    throw new Error(`Sheets GET failed: ${sheetsRes.status} ${JSON.stringify(sheetsJson).slice(0, 200)}`);
}
const rawBets = sheetsJson.bets || [];
console.log(`  -> ${rawBets.length} raw rows`);

// 2. Map to typed shape
function mapRow(row) {
    const rawPoints = row.points;
    let points = 0;
    if (typeof rawPoints === 'number' && !isNaN(rawPoints)) points = rawPoints;
    else if (typeof rawPoints === 'string') {
        const m = rawPoints.match(/^-?\d+/);
        if (m) points = parseInt(m[0], 10);
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
            topscorer: typeof row.topscorer === 'string' ? row.topscorer : String(row.topscorer || ''),
        },
        status: typeof row.status === 'string' ? row.status : 'pending',
        points,
        real_result: typeof row.real_result === 'string' ? row.real_result : (row.realResult ? String(row.realResult) : null),
        verified: row.verified === true || row.verified === 'TRUE' || row.verified === true,
        manuallyEdited: row.manuallyEdited === true || row.manuallyEdited === 'TRUE' || row.manuallyEdited === true,
        originalMessage: typeof row.originalMessage === 'string' ? row.originalMessage : (row.original_message ? String(row.original_message) : ''),
    };
}
const mapped = rawBets.map(mapRow);

// 3. Sheets-side dedup (loadBetsFromSheets)
const seenIds = new Set();
const seenContent = new Set();
const deduped = [];
for (const bet of mapped) {
    if (!bet) continue;
    if (bet.id && seenIds.has(bet.id)) continue;
    const p = bet.prediction || {};
    const contentKey = [
        (bet.messageId || '').toLowerCase().trim(),
        (bet.timestamp || '').trim(),
        (p.homeTeam || '').toLowerCase().trim(),
        (p.awayTeam || '').toLowerCase().trim(),
        p.homeScore ?? '', p.awayScore ?? '',
    ].join('|');
    if (seenContent.has(contentKey)) continue;
    if (bet.id) seenIds.add(bet.id);
    seenContent.add(contentKey);
    deduped.push(bet);
}
console.log(`  -> ${deduped.length} after Sheets-side dedup`);

// 4. dropOverLimitMessages
const MAX_BETS_PER_MESSAGE = 6;
const counts = new Map();
for (const bet of deduped) {
    if (!bet || !bet.messageId) continue;
    counts.set(bet.messageId, (counts.get(bet.messageId) || 0) + 1);
}
const overLimit = new Set();
for (const [messageId, count] of counts) {
    if (count > MAX_BETS_PER_MESSAGE) overLimit.add(messageId);
}
const noOverLimit = deduped.filter(b => !b || !b.messageId || !overLimit.has(b.messageId));
console.log(`  -> ${noOverLimit.length} after dropOverLimitMessages`);

// 5. dropOrganizerBets
const ORGANIZER_PATTERNS = [
    /^\s*[Mm]arcador\s+/,
    /no se vale/i,
    /cronograma|instrucciones|reglas|reglamento/i,
    /^\s*[Cc]ierre\s+de\s+apuestas/i,
    /sancionado|penalizad/i,
];
function isOrganizerAnnouncement(text) {
    if (!text) return false;
    for (const p of ORGANIZER_PATTERNS) if (p.test(text)) return true;
    return false;
}
const noOrganizer = noOverLimit.filter(bet => !bet || !isOrganizerAnnouncement(bet.originalMessage));
console.log(`  -> ${noOrganizer.length} after dropOrganizerBets`);

// 6. Load openfootball matches (for resolving which real game each score bet targets)
console.log('Loading openfootball matches...');
const matchesRes = await fetch(GITHUB_MATCHES_URL);
if (!matchesRes.ok) throw new Error(`openfootball HTTP ${matchesRes.status}`);
const matchesJson = await matchesRes.json();
const rawMatches = matchesJson.matches || [];
const matches = rawMatches
    .filter(m => m.score && m.score.ft)
    .map((m, i) => ({
        id: i + 1,
        date: m.date,
        homeTeam: normalizeTeamName(m.team1),
        homeShort: m.team1,
        awayTeam: normalizeTeamName(m.team2),
        awayShort: m.team2,
        homeScore: m.score.ft[0],
        awayScore: m.score.ft[1],
        resultString: `${m.team1} ${m.score.ft[0]} - ${m.score.ft[1]} ${m.team2}`,
    }));
console.log(`  -> ${matches.length} finished matches loaded`);

function safeFormatDate(dateStr) {
    if (!dateStr) return null;
    try {
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [y, mo, d] = dateStr.split('-').map(Number);
            const dt = new Date(y, mo - 1, d);
            if (isNaN(dt.getTime())) return null;
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        }
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) return null;
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    } catch { return null; }
}

function findMatchForBet(bet) {
    if (bet.type !== 'score') return null;
    if (!bet.prediction) return null;
    const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
    const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');
    const betDay = safeFormatDate(bet.timestamp);
    for (const match of matches) {
        const mHomeNorm = normalizeTeamName(match.homeTeam);
        const mAwayNorm = normalizeTeamName(match.awayTeam);
        const mHomeShort = normalizeTeamName(match.homeShort);
        const mAwayShort = normalizeTeamName(match.awayShort);
        const teamsMatch =
            ((homeNorm === mHomeNorm || homeNorm === mHomeShort) && (awayNorm === mAwayNorm || awayNorm === mAwayShort)) ||
            ((homeNorm === mAwayNorm || homeNorm === mAwayShort) && (awayNorm === mHomeNorm || awayNorm === mHomeShort));
        if (!teamsMatch) continue;
        const matchDay = safeFormatDate(match.date);
        if (betDay && matchDay && betDay !== matchDay) continue;
        return match;
    }
    return null;
}

// 7. Enrich each score-bet with the matched real match (NO status/points yet).
//    Group by messageId+type so the user can see which bets came from the
//    same WhatsApp message — duplicates across messages stay distinct, as in
//    appState.bets before uniqueBets().
const enriched = noOrganizer.map(bet => {
    if (bet.type !== 'score') return { ...bet, matchedMatch: null };
    const match = findMatchForBet(bet);
    if (!match) return { ...bet, matchedMatch: null };
    return {
        ...bet,
        matchedMatch: {
            id: match.id,
            date: match.date,
            homeTeam: match.homeTeam,
            homeShort: match.homeShort,
            awayTeam: match.awayTeam,
            awayShort: match.awayShort,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            resultString: match.resultString,
        },
    };
});

// 8. Group by participant — preserve chronological order of messages, then
//    bets within each message.
enriched.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

const byParticipant = new Map();
for (const bet of enriched) {
    const key = bet.participant || '(sin nombre)';
    if (!byParticipant.has(key)) {
        byParticipant.set(key, {
            participant: key,
            phone: bet.phone,
            messages: [],   // agrupado por messageId (un mensaje de WhatsApp = una entrada)
        });
    }
    const entry = byParticipant.get(key);
    let msg = entry.messages.find(m => m.messageId === bet.messageId);
    if (!msg) {
        msg = {
            messageId: bet.messageId,
            timestamp: bet.timestamp,
            originalMessage: bet.originalMessage,
            bets: [],
        };
        entry.messages.push(msg);
    }
    if (bet.type === 'score') {
        msg.bets.push({
            id: bet.id,
            type: 'score',
            bet_text: bet.bet_text,
            prediction: {
                homeTeam: bet.prediction.homeTeam,
                awayTeam: bet.prediction.awayTeam,
                homeScore: bet.prediction.homeScore,
                awayScore: bet.prediction.awayScore,
            },
            matchedMatch: bet.matchedMatch
                ? {
                    id: bet.matchedMatch.id,
                    date: bet.matchedMatch.date,
                    homeTeam: bet.matchedMatch.homeTeam,
                    awayTeam: bet.matchedMatch.awayTeam,
                    homeScore: bet.matchedMatch.homeScore,
                    awayScore: bet.matchedMatch.awayScore,
                    resultString: bet.matchedMatch.resultString,
                }
                : null,
        });
    } else {
        msg.bets.push({
            id: bet.id,
            type: bet.type,
            bet_text: bet.bet_text,
            value: bet.prediction[bet.type],
        });
    }
}

const output = {
    generatedAt: new Date().toISOString(),
    source: {
        site: 'https://ceslep.github.io/polla/',
        spreadsheetId: SPREADSHEET_ID,
        worksheet: SHEETS_WORKSHEET,
        matches: 'openfootball/worldcup.json (2026)',
    },
    pipeline: {
        rawSheetsRows: rawBets.length,
        afterSheetsDedup: deduped.length,
        afterDropOverLimit: noOverLimit.length,
        afterDropOrganizer: noOrganizer.length,
        finishedMatches: matches.length,
    },
    note: 'Estado "antes del ranking": incluye apuestas duplicadas entre mensajes que uniqueBets() luego colapsa. No se calcula status/points.',
    participants: [...byParticipant.values()].sort((a, b) => a.participant.localeCompare(b.participant)),
};

const outFile = path.join(ROOT, 'aexpt.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nWrote ${outFile}`);
console.log(`  participants: ${output.participants.length}`);
const totalBets = output.participants.reduce((s, p) => s + p.messages.reduce((ss, m) => ss + m.bets.length, 0), 0);
console.log(`  total bets (incl. dupes): ${totalBets}`);
