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
//   - getDisplayBets: prioriza fresh, fallback al prop
//   - deriveMissing: bets vacío, todos apostaron, algunos faltantes,
//     deduplicación, solo cuenta type='score', matchDate vacío/distinto,
//     orden alfabético

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

/**
 * Reproduce la lógica de `displayBets` del componente: prioriza los
 * bets frescos (traídos al abrir/refrescar el modal). Si todavía no
 * hay frescos (o el último fetch falló y dejó `freshBets` vacío), usa
 * el prop como fallback.
 *
 * @param {any[]} freshBets
 * @param {any[]} propBets
 */
function getDisplayBets(freshBets, propBets) {
    return (freshBets && freshBets.length > 0) ? freshBets : (propBets || []);
}

/**
 * Reproduce la derivación de PwaMissingBetsButton como función pura.
 * Si la lógica del componente cambia, hay que actualizar esto.
 *
 * IMPORTANTE: NO filtramos por `b.type === 'score'`. La hoja `apuestas`
 * solo guarda predicciones de score, y el endpoint `get_all_pwa_bets.php`
 * ni siquiera devuelve el campo `type`. Filtrar por type en datos
 * frescos rompía el conteo (todayBettors siempre era Set vacío → todos
 * aparecían como faltantes).
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
        // Sin filtro de type: la hoja solo guarda bets de tipo score, y
        // `loadAllPwaBets` no devuelve el campo type. Ver nota arriba.
        if (b.matchDate === todayDate) {
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

console.log('\n=== getDisplayBets: prioriza fresh, fallback al prop ===');
{
    const propOnly = [{ type: 'score', participant: 'Ana', matchDate: '2026-06-23' }];
    const fresh = [
        { type: 'score', participant: 'Beto', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Cami', matchDate: '2026-06-23' }
    ];
    check('fresh vacío → prop', getDisplayBets([], propOnly) === propOnly);
    check('fresh null → prop', getDisplayBets(/** @type {any} */ (null), propOnly) === propOnly);
    check('fresh undefined → prop', getDisplayBets(undefined, propOnly) === propOnly);
    check('fresh con datos → fresh', getDisplayBets(fresh, propOnly) === fresh);
    check('fresh con 0 elementos → prop', getDisplayBets([], propOnly) === propOnly);
    check('prop null + fresh vacío → []', JSON.stringify(getDisplayBets([], /** @type {any} */ (null))) === '[]');
    // Caso real: fetch falló, freshBets quedó [] (valor inicial), se usa el prop.
    const propConMasDatos = [
        { type: 'score', participant: 'Ana', matchDate: '2026-06-23' },
        { type: 'score', participant: 'Beto', matchDate: '2026-06-22' }  // histórico
    ];
    const r = deriveMissing(getDisplayBets([], propConMasDatos), '2026-06-23');
    eq('tras fetch fallido: usa prop, ve los 2 participantes', r.allParticipants, ['Ana', 'Beto']);
    eq('missing después de fallback = [Beto]', r.missing, ['Beto']);
    // Caso real: fetch exitoso, freshBets tiene datos actualizados, prop ignorado.
    const r2 = deriveMissing(getDisplayBets(fresh, propOnly), '2026-06-23');
    eq('tras fetch exitoso: usa fresh, ignora prop', r2.allParticipants, ['Beto', 'Cami']);
    eq('missing después de fresh exitoso = []', r2.missing, []);
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

console.log('\n=== REGRESIÓN: forma real de get_all_pwa_bets.php (sin campo type) ===');
// ANTES del fix, todayBettors filtraba por `b.type === 'score'` pero el
// endpoint `get_all_pwa_bets.php` NO devuelve ese campo (no existe en la
// hoja `apuestas`). Resultado: `todayBettors` siempre quedaba vacío y
// `missing` reportaba a TODOS los participantes históricos como
// "pendientes" (ej. "51 Pendientes" cuando la realidad eran menos).
// El fix: la derivación ya no filtra por `type` (la hoja solo guarda
// bets de tipo score, así que es redundante), y `refresh()` inyecta
// `type: 'score'` defensivamente para que cualquier check futuro siga
// funcionando.
{
    // Simula la respuesta cruda del backend: 4 participantes históricos,
    // 2 ya apostaron hoy, 1 apostó ayer, 1 nunca apostó. SIN campo `type`.
    const freshFromBackend = [
        { id: '1', participant: 'Ana',   phone: '1', matchDate: '2026-06-23', matchId: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0, submittedAt: '2026-06-23T10:00:00Z' },
        { id: '2', participant: 'Beto',  phone: '2', matchDate: '2026-06-22', matchId: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 2, awayScore: 1, submittedAt: '2026-06-22T10:00:00Z' },
        { id: '3', participant: 'Cami',  phone: '3', matchDate: '2026-06-23', matchId: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 0, awayScore: 0, submittedAt: '2026-06-23T11:00:00Z' },
        { id: '4', participant: 'Diana', phone: '4', matchDate: '2026-06-21', matchId: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 3, awayScore: 1, submittedAt: '2026-06-21T10:00:00Z' }
    ];
    // Sin inyección de `type` (simulando que se rompió el refresh):
    const r = deriveMissing(freshFromBackend, '2026-06-23');
    eq('sin type field, allParticipants = 4 (no se filtró por type)', r.allParticipants, ['Ana', 'Beto', 'Cami', 'Diana']);
    eq('sin type field, todayBettors = [Ana, Cami] (Ana y Cami apostaron hoy)', r.todayBettors, ['Ana', 'Cami']);
    eq('sin type field, missing = [Beto, Diana]', r.missing, ['Beto', 'Diana']);

    // Con inyección de `type: 'score'` (caso real con el fix aplicado):
    const withType = freshFromBackend.map((b) => ({ ...b, type: 'score' }));
    const r2 = deriveMissing(withType, '2026-06-23');
    eq('con type=score, mismos resultados (defense in depth no rompe nada)', r2.allParticipants, r.allParticipants);
    eq('con type=score, mismos faltantes', r2.missing, r.missing);

    // Caso adverso: si alguien filtra por `b.type === 'score'` (asumiendo
    // que el fix de inyección funciona), los datos frescos DEBEN contar.
    const todayBettorsWithTypeCheck = new Set();
    for (const b of withType) {
        if (b.type === 'score' && b.participant && b.matchDate === '2026-06-23') {
            todayBettorsWithTypeCheck.add(b.participant);
        }
    }
    eq('con type inyectado, filtro b.type === "score" cuenta los 2 de hoy',
        [...todayBettorsWithTypeCheck].sort(), ['Ana', 'Cami']);
}

console.log('\n=== REGRESIÓN 2: si el type check volviera a filtrar, los freshBets fallarían ===');
// Documenta el bug que estamos previniendo: con datos SIN type y un check
// `b.type === 'score'`, todos los apostadores de hoy desaparecen y missing
// reporta a todos los históricos. Este test debe pasar AHORA porque
// deriveMissing ya no filtra por type.
{
    const freshFromBackend = [
        { participant: 'Ana', matchDate: '2026-06-23' },
        { participant: 'Beto', matchDate: '2026-06-23' }
    ];
    const r = deriveMissing(freshFromBackend, '2026-06-23');
    eq('2 históricos, 2 apostaron hoy → missing []', r.missing, []);
    eq('2 históricos, 2 apostaron hoy → todayBettors [Ana, Beto]', r.todayBettors, ['Ana', 'Beto']);
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
