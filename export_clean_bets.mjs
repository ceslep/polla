// Reconstruye las apuestas "como deberían quedar después de pasarlas por
// el parser actual" a partir de los `originalMessage` ya persistidos en
// Google Sheets.
//
// Diferencias con export_clean_json.mjs:
//   1. NO confía en las columnas `prediction` de Sheets (que pueden venir
//      de una versión vieja del parser). Re-corre `parseMessage` sobre
//      cada `originalMessage` agrupado por `messageId`.
//   2. Suma `parseManualBets()` (mismo flujo que App.svelte refresh).
//   3. Aplica `uniqueBets()` — dedupe por (participante, cruce) usando
//      `betKey` + `shouldReplace` (reimplementados localmente; ver más
//      abajo por qué no importamos stores.svelte.js directamente).
//   4. NO incluye `ranking` en el output (el usuario no lo quiere).
//
// Run:  node export_clean_bets.mjs

// Shim $state — parser.js → stores.svelte.js usa $state a nivel de módulo.
globalThis.$state = (obj) => obj;

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const GET_BETS_URL = 'https://app.iedeoccidente.com/gs/get_bets.php';
const SPREADSHEET_ID = '1PIo_oLVjQubdbLodigV3cwOfwQ29k-SGsRmbeorI3nM';
const SHEETS_WORKSHEET = 'datos';
const GITHUB_MATCHES_URL =
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const {
    parseMessage,
    parseWhatsAppExport,
    parseManualBets,
    dropOverLimitMessages,
    dropOrganizerBets,
    resolveParticipantName,
    isOrganizerAnnouncement,
    CANONICAL_TEAMS
} = await import('./src/lib/parser.js');

const { normalizeTeamName } = await import('./src/lib/parser.js');

// Short SHA para trazabilidad
let parserVersion = 'unknown';
try {
    parserVersion = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
} catch { /* not a git repo or no git available — keep 'unknown' */ }

// Silenciar el `console.log` de debug que parser.js y stores.svelte.js
// dejan intencionalmente para inspección. Solo queremos nuestro propio
// log de pipeline en la salida del script.
const _origLog = console.log;
console.log = () => {};

// ---------- 1. Fetch raw rows from Sheets ----------
_origLog('Fetching raw bets from Sheets...');
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
_origLog(`  -> ${rawBets.length} raw rows`);

// ---------- 2. Group by messageId (reconstruct originalMessage + metadata) ----------
// Cada mensaje de WhatsApp puede estar duplicado en Sheets (uno por cada
// score-bet extraído). Tomamos el primer row de cada messageId como fuente
// de metadatos (participant, phone, timestamp, originalMessage).
const seenMsgIds = new Set();
const seenContent = new Set();
const uniqueRows = [];
for (const row of rawBets) {
    if (!row) continue;
    const id = (row.id || '').toString();
    if (id && seenMsgIds.has(id)) continue;
    if (id) seenMsgIds.add(id);

    // Dedupe de contenido: (messageId, timestamp, homeTeam, awayTeam, homeScore, awayScore)
    const contentKey = [
        (row.messageId || '').toString().toLowerCase().trim(),
        (row.timestamp || '').toString().trim(),
        (row.homeTeam || '').toString().toLowerCase().trim(),
        (row.awayTeam || '').toString().toLowerCase().trim(),
        row.homeScore ?? '', row.awayScore ?? '',
    ].join('|');
    if (seenContent.has(contentKey)) continue;
    seenContent.add(contentKey);

    uniqueRows.push(row);
}
_origLog(`  -> ${uniqueRows.length} after Sheets-side dedup (per row)`);

// Agrupar por messageId: cada messageId → un solo mensaje sintético
const byMessage = new Map();
for (const row of uniqueRows) {
    const mid = (row.messageId || '').toString();
    if (!mid) continue;
    if (!byMessage.has(mid)) {
        byMessage.set(mid, {
            messageId: mid,
            timestamp: row.timestamp,
            participant: row.participant,
            phone: row.phone,
            originalMessage: row.originalMessage || row.original_message || ''
        });
    }
}
const rawMessages = [...byMessage.values()]
    .filter(m => m.originalMessage && m.originalMessage.trim().length > 0)
    .filter(m => !isOrganizerAnnouncement(m.originalMessage));
_origLog(`  -> ${rawMessages.length} unique messages (with originalMessage)`);

// ---------- 3. Re-parse each message with the current parser ----------
// Esto es la clave del "limpio por el parser": NO usamos las columnas
// homeTeam/awayTeam guardadas en Sheets; reconstruimos desde cero
// aplicando FLAG_MAP, TEAM_ALIASES, parseScoreBet, etc. del parser actual.
const parserMessages = rawMessages.map(m => ({
    Message: m.originalMessage,
    'Message Id': m.messageId,
    Time: m.timestamp,
    'Display Name': m.participant,
    Phone: m.phone
}));

// parseWhatsAppExport corre el pipeline completo (parseMessage + filtros).
const parsedFromSheets = parseWhatsAppExport(parserMessages);
_origLog(`  -> ${parsedFromSheets.length} bets after re-parse`);

// ---------- 4. Append manualBets (synthetic messages) ----------
const manualBets = parseManualBets();
_origLog(`  -> +${manualBets.length} manual bets`);

// Combinar y aplicar dropOverLimit + dropOrganizer (defensa adicional)
let allBets = [...parsedFromSheets, ...manualBets];
const beforeOverLimit = allBets.length;
allBets = dropOverLimitMessages(allBets);
const beforeOrganizer = allBets.length;
allBets = dropOrganizerBets(allBets);
_origLog(`  -> after dropOverLimit: ${beforeOverLimit} → ${allBets.length}`);
_origLog(`  -> after dropOrganizer: ${beforeOrganizer} → ${allBets.length}`);

// ---------- 5. uniqueBets() — dedupe por (participante, cruce) ----------
// Reimplementación local de betKey + shouldReplace desde stores.svelte.js
// (mismas reglas). No importamos el módulo entero para no arrastrar
// `appState` con $state (aunque esté shimmeado, queremos mantener el
// script independiente del runtime de Svelte).
function betKey(bet) {
    const p = (bet.participant || '').toLowerCase().trim();
    const t = bet.type || '';
    if (t === 'score') {
        const pred = bet.prediction || {};
        const rawHome = /** @type {any} */ (bet).homeTeam || pred.homeTeam || '';
        const rawAway = /** @type {any} */ (bet).awayTeam || pred.awayTeam || '';
        const h = normalizeTeamName(rawHome).toLowerCase();
        const a = normalizeTeamName(rawAway).toLowerCase();
        const teams = [h, a].sort().join('|');
        return `${p}|score|${teams}`;
    }
    return `${p}|${t}`;
}

function shouldReplace(prev, next) {
    const pm = !!prev.manuallyEdited;
    const nm = !!next.manuallyEdited;
    if (pm !== nm) return nm;
    const pp = Number(prev.points) || 0;
    const np = Number(next.points) || 0;
    if (pp !== np) return np > pp;
    const ps = prev.status === 'pending' ? 0 : 1;
    const ns = next.status === 'pending' ? 0 : 1;
    return ns > ps;
}

// Re-evaluar status/points con la información persistida en Sheets.
// Las bets que vienen del parser actual tienen status='pending', points=0.
// Pero el originalMessage persistido en Sheets ya fue calificado en
// uploads previos; la fila cruda de Sheets tiene status/points correctos.
// Para hacer el "limpio por el parser" correctamente Y mantener el
// scoring actual, enriquecemos cada bet re-parseado con el status/points
// del row de Sheets que tenía el mismo messageId + cruce.
const sheetsIndex = new Map(); // key: messageId|homeTeam|awayTeam → {status, points, real_result, verified, manuallyEdited}
for (const row of rawBets) {
    if (!row || !row.messageId) continue;
    const key = [
        (row.messageId || '').toString(),
        (row.homeTeam || '').toString(),
        (row.awayTeam || '').toString(),
        row.type || 'score'
    ].join('||');
    if (!sheetsIndex.has(key)) {
        sheetsIndex.set(key, {
            status: row.status || 'pending',
            points: Number(row.points) || 0,
            real_result: row.real_result || row.realResult || null,
            verified: row.verified === true || row.verified === 'TRUE',
            manuallyEdited: row.manuallyEdited === true || row.manuallyEdited === 'TRUE',
            bet_text: row.bet_text || ''
        });
    }
}

function findSheetMeta(bet) {
    if (bet.type === 'score') {
        const key = [bet.messageId, bet.prediction.homeTeam, bet.prediction.awayTeam, 'score'].join('||');
        return sheetsIndex.get(key) || null;
    }
    const key = [bet.messageId, '', '', bet.type].join('||');
    return sheetsIndex.get(key) || null;
}

for (const bet of allBets) {
    const meta = findSheetMeta(bet);
    if (meta) {
        bet.status = meta.status;
        bet.points = meta.points;
        bet.real_result = meta.real_result;
        bet.verified = meta.verified;
        bet.manuallyEdited = meta.manuallyEdited;
        if (meta.bet_text) bet.bet_text = meta.bet_text;
    }
}

const seenUnique = new Map();
for (const bet of allBets) {
    if (!bet) continue;
    const key = betKey(bet);
    const prev = seenUnique.get(key);
    if (!prev || shouldReplace(prev, bet)) seenUnique.set(key, bet);
}
const uniqueBetsList = [...seenUnique.values()];
_origLog(`  -> after uniqueBets: ${uniqueBetsList.length}`);

// ---------- 6. Load openfootball matches ----------
_origLog('Loading openfootball matches...');
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
_origLog(`  -> ${matches.length} finished matches loaded`);

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

// ---------- 7. Enrich each score-bet with matchedMatch ----------
const enriched = uniqueBetsList.map(bet => {
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

// ---------- 8. Group by participant → message → bets ----------
enriched.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

const byParticipant = new Map();
for (const bet of enriched) {
    const key = bet.participant || '(sin nombre)';
    if (!byParticipant.has(key)) {
        byParticipant.set(key, {
            participant: key,
            phone: bet.phone,
            messages: [],
            betCount: 0,
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
            status: bet.status,
            points: bet.points,
            real_result: bet.real_result,
            matchedMatch: bet.matchedMatch
                ? {
                    id: bet.matchedMatch.id,
                    date: bet.matchedMatch.date,
                    homeTeam: bet.matchedMatch.homeTeam,
                    homeShort: bet.matchedMatch.homeShort,
                    awayTeam: bet.matchedMatch.awayTeam,
                    awayShort: bet.matchedMatch.awayShort,
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
            status: bet.status,
            points: bet.points,
            real_result: bet.real_result,
        });
    }
    entry.betCount++;
}

// ---------- 9. Build final output ----------
const output = {
    generatedAt: new Date().toISOString(),
    source: {
        site: 'https://ceslep.github.io/polla/',
        spreadsheetId: SPREADSHEET_ID,
        worksheet: SHEETS_WORKSHEET,
        matches: 'openfootball/worldcup.json (2026)',
        parserVersion,
    },
    pipeline: {
        rawSheetsRows: rawBets.length,
        afterSheetsRowDedup: uniqueRows.length,
        uniqueMessagesReparsed: rawMessages.length,
        afterReParse: parsedFromSheets.length,
        plusManualBets: manualBets.length,
        afterDropOverLimit: beforeOverLimit === allBets.length ? allBets.length : beforeOverLimit,
        afterDropOrganizer: allBets.length,
        afterUniqueBets: uniqueBetsList.length,
        finishedMatches: matches.length,
    },
    note: 'JSON limpio: cada `originalMessage` de Sheets fue re-parseado con el parser actual. Aplica uniqueBets (dedupe por participante × cruce). status/points se conservan desde Sheets. Sin ranking. Listo para importar a una BD.',
    participants: [...byParticipant.values()]
        .map(p => ({ ...p, messages: p.messages, betCount: p.betCount }))
        .sort((a, b) => a.participant.localeCompare(b.participant)),
};

const outFile = path.join(ROOT, 'polla_clean.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

_origLog(`\nWrote ${outFile}`);
_origLog(`  participants: ${output.participants.length}`);
const totalBets = output.participants.reduce((s, p) => s + p.betCount, 0);
const totalMessages = output.participants.reduce((s, p) => s + p.messages.length, 0);
_origLog(`  total messages: ${totalMessages}`);
_origLog(`  total bets (after uniqueBets): ${totalBets}`);
_origLog(`  parserVersion: ${parserVersion}`);
