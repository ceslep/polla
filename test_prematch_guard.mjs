// test_prematch_guard.mjs
// Smoke test para src/lib/pwa/prematchGuard.js
//
// Cubre:
//   - PREMATCH_PASSWORD y PREMATCH_BUFFER_MS
//   - getFirstMatchUtcMs: array vacío, nullish, partidos de varios días,
//     y la REGRESIÓN 2026-06-22 (France listado antes que Argentina en el
//     array de openfootball — el JSON viene por estadio/grupo, no por hora
//     COT, así que la función debe iterar y comparar, no tomar el primer
//     elemento).
//   - isPreMatch con buffer default (60_000 ms = 1 minuto):
//       · (ts - 120_000, ts) → true (2 min antes del kickoff)
//       · (ts - 60_001, ts) → true (1 ms antes del cutoff)
//       · (ts - 60_000, ts) → false (cutoff exacto = 1 min antes del kickoff)
//       · (ts, ts) → false (kickoff)
//       · (ts + 1, ts) → false (post-kickoff)
//   - isPreMatch con buffer 0 (corte exacto):
//       · (ts - 1, ts, 0) → true; (ts, ts, 0) → false
//   - isPreMatch(null, ...) → false (no hay primer partido, no se pide clave)
//   - Caso anti-regresión del bug original: array que SOLO tiene partidos
//     FINALIZADOS del día siguiente. getFirstMatchUtcMs debe devolver null
//     para 'today' porque el array no contiene partidos de 'today'.
//     Esto es lo que rompía PwaApp cuando pasaba pwaNormalizedMatches.
//
// El módulo no usa $state/$derived pero shimeamos igual para que
// funcione aunque se importen archivos que sí lo hagan.

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

const {
    PREMATCH_PASSWORD,
    PREMATCH_BUFFER_MS,
    getFirstMatchUtcMs,
    isPreMatch
} = await import('./src/lib/pwa/prematchGuard.js');
const { matchLocalToCot } = await import('./src/lib/pwa/window.js');

let pass = 0;
let fail = 0;
const fails = [];

function check(label, cond, detail) {
    if (cond) {
        pass++;
        console.log(`  ✓ ${label}`);
    } else {
        fail++;
        fails.push({ label, detail });
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

console.log('=== Constantes ===');
check(
    'PREMATCH_PASSWORD === "polla2026"',
    PREMATCH_PASSWORD === 'polla2026',
    `got ${JSON.stringify(PREMATCH_PASSWORD)}`
);
check(
    'PREMATCH_BUFFER_MS === 60_000',
    PREMATCH_BUFFER_MS === 60000,
    `got ${PREMATCH_BUFFER_MS}`
);

console.log('\n=== getFirstMatchUtcMs: empty / nullish ===');
check('array vacío → null', getFirstMatchUtcMs([], '2026-06-22') === null);
check(
    'cotDate vacío → null',
    getFirstMatchUtcMs([{ date: '2026-06-22', time: '15:00 UTC-5' }], '') === null
);
check(
    'matches null → null',
    getFirstMatchUtcMs(/** @type {any} */ (null), '2026-06-22') === null
);

console.log('\n=== getFirstMatchUtcMs: partidos de varios días ===');
const mixed = [
    { date: '2026-06-21', time: '18:00 UTC-7' },  // 2026-06-21 20:00 COT
    { date: '2026-06-22', time: '12:00 UTC-5' },  // 2026-06-22 12:00 COT (Argentina)
    { date: '2026-06-22', time: '17:00 UTC-4' },  // 2026-06-22 16:00 COT (France)
    { date: '2026-06-23', time: '14:00 UTC-5' }   // 2026-06-23 14:00 COT
];
const cot22 = matchLocalToCot('2026-06-22', '12:00 UTC-5');
check(
    'filtra por cotDate (2026-06-22) y toma el más temprano en COT',
    getFirstMatchUtcMs(mixed, '2026-06-22') === cot22.utcMs,
    `expected ${cot22.utcMs} (Argentina 12:00 COT)`
);
const cot21 = matchLocalToCot('2026-06-21', '18:00 UTC-7');
check(
    'cotDate 2026-06-21 devuelve el único de ese día',
    getFirstMatchUtcMs(mixed, '2026-06-21') === cot21.utcMs
);
check(
    'cotDate sin partidos → null',
    getFirstMatchUtcMs(mixed, '2026-06-25') === null
);

console.log('\n=== REGRESIÓN 2026-06-22: orden de openfootball ===');
// Mismo set que arriba pero poniendo a France PRIMERO en el array
// (que es como viene en worldcup.json: por estadio/grupo, no por hora COT).
const franceFirst = [
    { date: '2026-06-22', time: '17:00 UTC-4' },  // France 16:00 COT
    { date: '2026-06-22', time: '12:00 UTC-5' }   // Argentina 12:00 COT (más temprano)
];
const argUtc = matchLocalToCot('2026-06-22', '12:00 UTC-5').utcMs;
const frUtc = matchLocalToCot('2026-06-22', '17:00 UTC-4').utcMs;
check(
    'France listado antes en el array NO engaña a getFirstMatchUtcMs',
    getFirstMatchUtcMs(franceFirst, '2026-06-22') === argUtc,
    `expected Argentina's ${argUtc}, got ${getFirstMatchUtcMs(franceFirst, '2026-06-22')} (France would be ${frUtc})`
);

console.log('\n=== ANTI-regresión: array SOLO con finalizados del día SIGUIENTE ===');
// Simula el bug original: PwaApp pasaba `pwaNormalizedMatches` (filtrado
// por `m.score?.ft`) y el día actual nunca aparecía porque ningún partido
// del día había terminado. La función debe devolver null para 'today'.
const onlyTomorrowFinished = [
    { date: '2026-06-22', time: '17:00 UTC-4', score: { ft: [1, 0] } },  // ayer finalizado
    { date: '2026-06-22', time: '12:00 UTC-5', score: { ft: [2, 1] } }   // ayer finalizado
];
check(
    'partidos FINALIZADOS del 22-jun NO se cuentan como partidos del 23-jun',
    getFirstMatchUtcMs(onlyTomorrowFinished, '2026-06-23') === null
);

console.log('\n=== isPreMatch: null/undefined ===');
check('isPreMatch(null, 0) → false', isPreMatch(null, 0) === false);
check('isPreMatch(undefined, 0) → false', isPreMatch(undefined, 0) === false);

console.log('\n=== isPreMatch: buffer default (1 minuto) ===');
// ts = kickoff en UTC. Con buffer de 60_000 ms, el cutoff es ts - 60_000.
const ts = 12 * 3600 * 1000;  // mediodía UTC arbitrario
check('2 min antes del kickoff → true', isPreMatch(ts, ts - 120_000) === true);
check('1 ms antes del cutoff → true', isPreMatch(ts, ts - 60_001) === true);
check('exactamente en el cutoff (1 min antes) → false', isPreMatch(ts, ts - 60_000) === false);
check('en el kickoff → false', isPreMatch(ts, ts) === false);
check('1 ms después del kickoff → false', isPreMatch(ts, ts + 1) === false);
check('mucho después del kickoff → false', isPreMatch(ts, ts + 3600_000) === false);

console.log('\n=== isPreMatch: buffer explícito 0 (corte exacto) ===');
check('1 ms antes con buffer 0 → true', isPreMatch(ts, ts - 1, 0) === true);
check('en el kickoff con buffer 0 → false', isPreMatch(ts, ts, 0) === false);

console.log('\n=== isPreMatch: buffer explícito 5 minutos ===');
check(
    '6 min antes con buffer 5 min → true',
    isPreMatch(ts, ts - 6 * 60_000, 5 * 60_000) === true
);
check(
    '5 min antes con buffer 5 min → false (en el cutoff)',
    isPreMatch(ts, ts - 5 * 60_000, 5 * 60_000) === false
);

console.log('\n=== resumen ===');
console.log(`  ${pass} ok, ${fail} fail`);
if (fail > 0) {
    console.log('\nFallos:');
    for (const f of fails) console.log(`  - ${f.label}: ${f.detail || ''}`);
    process.exit(1);
}
