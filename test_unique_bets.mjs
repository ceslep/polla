// Test for uniqueBets() dedup logic
// Shim $state for Node (Svelte 5 rune not available outside Svelte runtime)
globalThis.$state = (obj) => obj;

const mod = await import('./src/lib/stores.svelte.js');
const { appState, uniqueBets } = mod;

// Helper to construct a bet
const b = (overrides) => ({
    id: 'x',
    messageId: 'm',
    timestamp: '2026/6/12 10:00',
    participant: 'Ricardo',
    phone: '',
    type: 'score',
    bet_text: '',
    prediction: {},
    status: 'pending',
    points: 0,
    real_result: null,
    verified: false,
    manuallyEdited: false,
    originalMessage: '',
    ...overrides
});

let pass = 0, fail = 0;
function test(name, cond) {
    if (cond) { pass++; console.log('  PASS:', name); }
    else { fail++; console.log('  FAIL:', name); }
}

console.log('--- 1. Dedup básico: misma predicción 2 veces ---');
appState.bets = [
    b({ id: 'a', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 1 } }),
    b({ id: 'b', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 1 } }),
];
let r = uniqueBets();
test('2 entradas → 1 única', r.length === 1);
test('puntos sumados correctamente (0+0=0)', r.reduce((s, x) => s + (Number(x.points) || 0), 0) === 0);

console.log('--- 2. Prioridad: scored gana sobre pending ---');
appState.bets = [
    b({ id: 'a', points: 0, status: 'pending' }),
    b({ id: 'b', points: 5, status: 'exact' }),
];
r = uniqueBets();
test('2 entradas → 1 única', r.length === 1);
test('conserva la calificada (id=b)', r[0].id === 'b');
test('puntos = 5 (no 0)', r[0].points === 5);

console.log('--- 3. Prioridad: manuallyEdited gana sobre scored ---');
appState.bets = [
    b({ id: 'a', points: 5, status: 'exact', manuallyEdited: false }),
    b({ id: 'b', points: 0, status: 'pending', manuallyEdited: true }),
];
r = uniqueBets();
test('conserva la editada (id=b)', r[0].id === 'b');

console.log('--- 4. Equipos invertidos = mismo cruce ---');
appState.bets = [
    b({ id: 'a', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 0 } }),
    b({ id: 'b', prediction: { homeTeam: 'Bosnia & Herzegovina', awayTeam: 'Canada', homeScore: 0, awayScore: 1 } }),
];
r = uniqueBets();
test('invertidos → 1 única', r.length === 1);

console.log('--- 5. Diferente participante = no dedup ---');
appState.bets = [
    b({ id: 'a', participant: 'Ricardo', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 1 } }),
    b({ id: 'b', participant: 'Pedro',   prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 1 } }),
];
r = uniqueBets();
test('2 participantes → 2 apuestas', r.length === 2);

console.log('--- 6. Diferente tipo = no dedup ---');
appState.bets = [
    b({ id: 'a', type: 'champion', prediction: { champion: 'Argentina' } }),
    b({ id: 'b', type: 'runnerup', prediction: { runnerup: 'Argentina' } }),
];
r = uniqueBets();
test('champion + runnerup → 2 apuestas', r.length === 2);

console.log('--- 7. Stats con duplicados: Ricardo solo debería contar una vez ---');
appState.bets = [
    b({ id: 'a', participant: 'Ricardo', points: 5, status: 'exact', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia', homeScore: 1, awayScore: 1 } }),
    b({ id: 'b', participant: 'Ricardo', points: 5, status: 'exact', prediction: { homeTeam: 'Canada', awayTeam: 'Bosnia', homeScore: 1, awayScore: 1 } }),
    b({ id: 'c', participant: 'Ricardo', points: 3, status: 'correct', prediction: { homeTeam: 'Portugal', awayTeam: 'Croatia', homeScore: 2, awayScore: 1 } }),
    b({ id: 'd', participant: 'Pedro',   points: 5, status: 'exact', prediction: { homeTeam: 'Mexico', awayTeam: 'USA', homeScore: 0, awayScore: 0 } }),
];
r = uniqueBets();
const totalPts = r.reduce((s, x) => s + (Number(x.points) || 0), 0);
test('4 entradas → 3 únicas (1 dedupe)', r.length === 3);
test('puntos = 5+3+5 = 13 (no 18)', totalPts === 13);

console.log('--- 8. Puntos por participante sin duplicar ---');
const byP = new Map();
for (const bet of uniqueBets()) {
    if (bet.status === 'pending') continue;
    byP.set(bet.participant, (byP.get(bet.participant) || 0) + (Number(bet.points) || 0));
}
test('Ricardo = 8 (5+3)', byP.get('Ricardo') === 8);
test('Pedro = 5', byP.get('Pedro') === 5);

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
