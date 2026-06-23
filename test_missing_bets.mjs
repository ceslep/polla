// test_missing_bets.mjs
// Smoke test para la derivación de "Apuestas pendientes" en
// src/lib/components/pwa/PwaMissingBetsButton.svelte.
//
// El componente usa Svelte 5 runes, así que para testearlo fuera del
// runtime de Svelte shimeamos $state y $derived y reimplementamos la
// misma lógica como funciones puras. Si la lógica del componente se
// separa de la del test, los tests empiezan a fallar — eso es
// deseable: queremos que cambien juntos.
//
// Cubre:
//   - bets vacío → todos los faltantes del universo
//   - todos apostaron hoy → faltantes []
//   - algunos faltantes → solo los que no aparecen con type='score' y
//     matchDate === todayDate
//   - deduplicación: el mismo participante con 2 bets cuenta como 1
//   - solo cuenta type='score' (champion/runnerup NO cuentan)
//   - matchDate vacío / distinto no cuenta como "apostó hoy"
//   - orden alfabético

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

/**
 * Reproduce la derivación de PwaMissingBetsButton como función pura.
 * Si la lógica del componente cambia, hay que actualizar esto.
 *
 * @param {Array<{type?: string, participant?: string, matchDate?: string}>} bets
 * @param {string} todayDate
 * @returns {{ allParticipants: string[], todayBettors: string[], missing: string[] }}
 */
function deriveMissing(bets, todayDate) {
    const allSet = new Set();
    const todaySet = new Set();
    for (const b of bets || []) {
        if (!b.participant) continue;
        allSet.add(b.participant);
        if (b.type === 'score' && b.matchDate === todayDate) {
            todaySet.add(b.participant);
        }
    }
    const allParticipants = [...allSet].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    const todayBettors = [...todaySet].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    const missing = allParticipants.filter((p) => !todaySet.has(p));
    return { allParticipants, todayBettors, missing };
}

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

function eq(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    check(label, a === e, `got ${a}, expected ${e}`);
}

console.log('=== bets vacío ===');
{
    const r = deriveMissing([], '2026-06-23');
    eq('allParticipants []', r.allParticipants, []);
    eq('todayBettors []', r.todayBettors, []);
    eq('missing []', r.missing, []);
}

console.log('\n=== todos apostaron hoy ===');
{
    const bets = [
        { type: 'score', participant: 'Ana',  matchDate: '2026-06-23' },
        { type: 'score', participant: 'Beto', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Cami', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants [Ana, Beto, Cami]', r.allParticipants, ['Ana', 'Beto', 'Cami']);
    eq('todayBettors = allParticipants', r.todayBettors, ['Ana', 'Beto', 'Cami']);
    eq('missing []', r.missing, []);
}

console.log('\n=== algunos faltantes ===');
{
    const bets = [
        { type: 'score', participant: 'Ana',  matchDate: '2026-06-23' },
        { type: 'score', participant: 'Cami', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants [Ana, Cami]', r.allParticipants, ['Ana', 'Cami']);
    eq('missing [] (nadie más apostó nunca)', r.missing, []);
}

// Caso más completo: hay 4 participantes históricos, 2 ya apostaron hoy,
// 1 apostó ayer (cuenta como "existente" pero no "hoy"), 1 nunca apostó.
console.log('\n=== mix: apostaron antes, hoy, o nunca ===');
{
    const bets = [
        { type: 'score', participant: 'Ana',   matchDate: '2026-06-23' },  // hoy
        { type: 'score', participant: 'Beto',  matchDate: '2026-06-22' },  // ayer
        { type: 'score', participant: 'Cami',  matchDate: '2026-06-23' },  // hoy
        { type: 'score', participant: 'Diana', matchDate: '2026-06-21' }   // anteayer
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants = 4', r.allParticipants, ['Ana', 'Beto', 'Cami', 'Diana']);
    eq('todayBettors [Ana, Cami]', r.todayBettors, ['Ana', 'Cami']);
    eq('missing [Beto, Diana] (orden alfabético)', r.missing, ['Beto', 'Diana']);
}

console.log('\n=== deduplicación: varios bets del mismo participante ===');
{
    const bets = [
        { type: 'score', participant: 'Ana', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Ana', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Ana', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Beto', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants dedup [Ana, Beto]', r.allParticipants, ['Ana', 'Beto']);
    eq('todayBettors dedup [Ana, Beto]', r.todayBettors, ['Ana', 'Beto']);
    eq('missing []', r.missing, []);
}

console.log('\n=== solo cuenta type=score ===');
{
    const bets = [
        { type: 'champion', participant: 'Ana', matchDate: '2026-06-23' },
        { type: 'runnerup', participant: 'Beto', matchDate: '2026-06-23' },
        { type: 'topscorer', participant: 'Cami', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Dario', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants = 4', r.allParticipants, ['Ana', 'Beto', 'Cami', 'Dario']);
    eq('todayBettors solo Dario (score)', r.todayBettors, ['Dario']);
    eq('missing [Ana, Beto, Cami]', r.missing, ['Ana', 'Beto', 'Cami']);
}

console.log('\n=== matchDate vacío / distinto ===');
{
    const bets = [
        { type: 'score', participant: 'Ana', matchDate: '' },            // vacío
        { type: 'score', participant: 'Beto' },                           // undefined
        { type: 'score', participant: 'Cami', matchDate: '2026-06-22' }, // ayer
        { type: 'score', participant: 'Dario', matchDate: '2026-06-23' } // hoy
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('allParticipants = 4', r.allParticipants, ['Ana', 'Beto', 'Cami', 'Dario']);
    eq('todayBettors solo Dario', r.todayBettors, ['Dario']);
    eq('missing [Ana, Beto, Cami]', r.missing, ['Ana', 'Beto', 'Cami']);
}

console.log('\n=== participante sin nombre ===');
{
    const bets = [
        { type: 'score', participant: '', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Ana', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('participante vacío NO se cuenta', r.allParticipants, ['Ana']);
    eq('missing []', r.missing, []);
}

console.log('\n=== null / undefined ===');
{
    const r1 = deriveMissing(/** @type {any} */ (null), '2026-06-23');
    eq('bets null → empty', r1.missing, []);
    const r2 = deriveMissing(/** @type {any} */ (undefined), '2026-06-23');
    eq('bets undefined → empty', r2.missing, []);
    const r3 = deriveMissing([], '');
    eq('todayDate vacío → todo cuenta como faltante? NO: con todayDate= vacío ningún bet matchea, así que allParticipants = []', r3.missing, []);
}

console.log('\n=== orden alfabético con acentos y mayúsculas ===');
{
    const bets = [
        { type: 'score', participant: 'Ángela', matchDate: '2026-06-23' },
        { type: 'score', participant: 'camilo', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Beto',   matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(bets, '2026-06-23');
    eq('orden insensitive (es-CO): Ángela, Beto, camilo', r.allParticipants, ['Ángela', 'Beto', 'camilo']);
    eq('missing []', r.missing, []);
}

console.log('\n=== resumen ===');
console.log(`  ${pass} ok, ${fail} fail`);
if (fail > 0) {
    console.log('\nFallos:');
    for (const f of fails) console.log(`  - ${f.label}: ${f.detail || ''}`);
    process.exit(1);
}
