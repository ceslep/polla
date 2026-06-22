// build_apuestas_csv.mjs
// Genera dos CSVs listos para importar a Google Sheets con la nueva hoja "apuestas":
//
//   1. apuestas_seed.csv     — score-bets con matchedMatch (partidos ya jugados)
//   2. apuestas_pending.csv  — score-bets SIN matchedMatch (partidos aún por jugarse
//                              o que el parser no pudo resolver). Útil para
//                              "completar" la base de datos a medida que se
//                              jueguen los partidos.
//
// Esquema (11 columnas A:K, separador coma, UTF-8 con BOM):
//   A:id            bet.id del JSON (literal)
//   B:timestamp     string crudo de WhatsApp (puede tener espacios extra)
//   C:participante  display name
//   D:phone         teléfono
//   E:date          YYYY-MM-DD del partido real (matchedMatch.date) — VACÍO en pending
//   F:              (vacía)
//   G:team1         homeTeam
//   H:team2         awayTeam
//   I:score1        homeScore (entero)
//   J:score2        awayScore (entero)
//   K:datetime      ISO de message.timestamp parseado
//
// Filtro:
//   - Solo type='score'
//   - seed:    matchedMatch no nulo
//   - pending: matchedMatch nulo (cruzó pendiente o no resuelto)
//
// Run:  node build_apuestas_csv.mjs
// Out:  apuestas_seed.csv + apuestas_pending.csv en el cwd

import fs from 'node:fs';
import path from 'node:path';

const INPUT = process.argv[2]
    ?? path.join('C:', 'Users', 'cesle', 'OneDrive', 'Escritorio', 'polla', 'polla_clean.json');
const OUTPUT_SEED = process.argv[3] ?? 'apuestas_seed.csv';
const OUTPUT_PENDING = process.argv[4] ?? 'apuestas_pending.csv';

const HEADERS = [
    'id',         // A
    'timestamp',  // B
    'participante', // C
    'phone',      // D
    'date',       // E
    '',           // F (vacía, sin header)
    'team1',      // G
    'team2',      // H
    'score1',     // I
    'score2',     // J
    'datetime',   // K
];

const payload = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
if (!payload || !Array.isArray(payload.participants)) {
    throw new Error(`JSON inválido: falta 'participants' en ${INPUT}`);
}

function parseTimestampToIso(raw) {
    if (!raw) return '';
    const cleaned = String(raw).trim().replace(/\s+/g, ' ');
    const formats = [
        'YYYY-MM-DD HH:mm:ss',
        'YYYY/M/D HH:mm:ss',
        'YYYY-MM-DDTHH:mm:ss',
        'YYYY/M/DTHH:mm:ss',
    ];
    for (const fmt of formats) {
        let m;
        if (fmt === 'YYYY-MM-DD HH:mm:ss') {
            m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
        } else if (fmt === 'YYYY/M/D HH:mm:ss') {
            m = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (m) {
                const [_, y, mo, d, h, mi, s] = m;
                const pad = (n) => String(n).padStart(2, '0');
                return `${y}-${pad(mo)}-${pad(d)}T${h}:${mi}:${s}`;
            }
        } else if (fmt === 'YYYY-MM-DDTHH:mm:ss') {
            m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
            if (m) return cleaned;
        } else if (fmt === 'YYYY/M/DTHH:mm:ss') {
            m = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})T(\d{2}):(\d{2}):(\d{2})$/);
            if (m) {
                const [_, y, mo, d, h, mi, s] = m;
                const pad = (n) => String(n).padStart(2, '0');
                return `${y}-${pad(mo)}-${pad(d)}T${h}:${mi}:${s}`;
            }
        }
    }
    return '';
}

function csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\r\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function buildCsv(rows) {
    const lines = [];
    lines.push(HEADERS.map(csvEscape).join(','));
    for (const r of rows) {
        lines.push(r.map(csvEscape).join(','));
    }
    const BOM = '\ufeff';
    return BOM + lines.join('\r\n') + '\r\n';
}

const seedRows = [];
const pendingRows = [];
let received = 0, skippedNonScore = 0;
let matched = 0, noMatch = 0;

for (const p of payload.participants) {
    const pname = String(p.participant ?? '');
    const phone = String(p.phone ?? '');
    for (const m of (p.messages ?? [])) {
        const rawTs = String(m.timestamp ?? '');
        const dt = parseTimestampToIso(rawTs);
        for (const bet of (m.bets ?? [])) {
            if (!bet || typeof bet !== 'object') continue;
            received++;
            if (bet.type !== 'score') { skippedNonScore++; continue; }

            const pred = bet.prediction ?? {};
            const mm = bet.matchedMatch;
            const hasMatch = mm && typeof mm === 'object';

            // Celdas comunes (A,B,C,D,F,G,H,I,J,K)
            const cells = [
                String(bet.id ?? ''),                // A
                rawTs,                                // B
                pname,                                // C
                phone,                                // D
                hasMatch ? String(mm.date ?? '') : '', // E
                '',                                   // F
                String(pred.homeTeam ?? ''),          // G
                String(pred.awayTeam ?? ''),          // H
                pred.homeScore ?? '',                 // I
                pred.awayScore ?? '',                 // J
                dt,                                   // K
            ];

            if (hasMatch) {
                seedRows.push(cells);
                matched++;
            } else {
                pendingRows.push(cells);
                noMatch++;
            }
        }
    }
}

const seedCsv = buildCsv(seedRows);
const pendingCsv = buildCsv(pendingRows);
fs.writeFileSync(OUTPUT_SEED, seedCsv, 'utf8');
fs.writeFileSync(OUTPUT_PENDING, pendingCsv, 'utf8');

const stats = {
    input: INPUT,
    seed: {
        output: path.resolve(OUTPUT_SEED),
        rows: seedRows.length,
        lines_in_csv: seedRows.length + 1,
        size_kb: (Buffer.byteLength(seedCsv, 'utf8') / 1024).toFixed(1),
    },
    pending: {
        output: path.resolve(OUTPUT_PENDING),
        rows: pendingRows.length,
        lines_in_csv: pendingRows.length + 1,
        size_kb: (Buffer.byteLength(pendingCsv, 'utf8') / 1024).toFixed(1),
    },
    received,
    matched,
    no_match: noMatch,
    skipped_non_score: skippedNonScore,
};
console.log(JSON.stringify(stats, null, 2));
