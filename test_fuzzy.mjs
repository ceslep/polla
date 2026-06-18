globalThis.$state = (o) => o;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const stores = await import('./src/lib/stores.svelte.js');
const { findMatchForBet, findMatchSuggestion, applyMatchSuggestion, dismissMatchSuggestion, appState } = stores;
const { loadMatchesFromGitHub } = await import('./src/lib/api.js');

const matches = await loadMatchesFromGitHub();
console.log('Matches loaded:', matches.length);

let pass = 0, fail = 0;
function test(name, cond) {
    if (cond) { pass++; console.log('  PASS:', name); }
    else { fail++; console.log('  FAIL:', name); }
}

function bet(home, away, date = '2026/6/13') {
    return { type: 'score', prediction: { homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0 }, timestamp: `${date} 12:00` };
}

console.log('--- 1. Match exacto: Australia-Turkey el 2026-06-13 ---');
const b1 = bet('Australia', 'Turkey');
const m1 = findMatchForBet(b1, matches);
test('Australia-Turkey encontrado por match exacto', m1 !== null);
test('Australia-Turkey match -> Australia home', m1 && m1.homeTeam === 'Australia');

console.log('--- 2. Fuzzy: Austria-Turkey (Austria no juega el 6-13) -> sugiere Australia-Turkey ---');
const b2 = bet('Austria', 'Turkey');
const m2 = findMatchForBet(b2, matches);
const s2 = findMatchSuggestion(b2, matches);
test('Austria-Turkey NO match exacto', m2 === null);
test('Austria-Turkey SI tiene sugerencia', s2 !== null);
test('Sugerencia apunta a Australia-Turkey', s2 && s2.match.homeTeam === 'Australia' && s2.match.awayTeam === 'Turkey');
test('Distancia total = 2 (austria->australia)', s2 && s2.distance === 2);

console.log('--- 3. Fuzzy: Austrlia (typo 1 letra) -> Australia ---');
const b3 = bet('Austrlia', 'Turkey');
const m3 = findMatchForBet(b3, matches);
const s3 = findMatchSuggestion(b3, matches);
test('Austrlia-Turkey NO match exacto', m3 === null);
test('Austrlia-Turkey SI tiene sugerencia', s3 !== null);
test('Sugerencia -> Australia-Turkey', s3 && s3.match.homeTeam === 'Australia');
test('Distancia total = 1 (austrlia->australia)', s3 && s3.distance === 1);

console.log('--- 4. Sin candidato fuzzy: equipo inventado ---');
const b4 = bet('Atlantis', 'El Dorado');
const s4 = findMatchSuggestion(b4, matches);
test('Atlantis-El Dorado sin sugerencia', s4 === null);

console.log('--- 5. Fuzzy no cruza fechas: Austria en fecha donde no hay partido ---');
const b5 = bet('Austria', 'Turkey', '2026/6/15');
const s5 = findMatchSuggestion(b5, matches);
test('Austria-Turkey 6-15 sin sugerencia (no cruza fechas)', s5 === null);

console.log('--- 6. applyMatchSuggestion actualiza prediction y limpia sugerencia ---');
appState.bets = [{ id: 'x1', type: 'score', prediction: { homeTeam: 'Austria', awayTeam: 'Turkey', homeScore: 2, awayScore: 1 }, timestamp: '2026/6/13 12:00', status: 'pending', points: 0, suggestedMatch: { homeTeam: 'Australia', awayTeam: 'Turkey', homeScore: 2, awayScore: 0, date: '2026-06-13', distance: 2 } }];
applyMatchSuggestion('x1');
const after = appState.bets[0];
test('prediction.homeTeam ahora es Australia', after.prediction.homeTeam === 'Australia');
test('prediction.awayTeam ahora es Turkey', after.prediction.awayTeam === 'Turkey');
test('manuallyEdited = true', after.manuallyEdited === true);
test('suggestedMatch limpiado', after.suggestedMatch === null);

console.log('--- 7. dismissMatchSuggestion limpia sin tocar prediction ---');
appState.bets = [{ id: 'x2', type: 'score', prediction: { homeTeam: 'Austria', awayTeam: 'Turkey', homeScore: 2, awayScore: 1 }, timestamp: '2026/6/13 12:00', status: 'pending', points: 0, suggestedMatch: { homeTeam: 'Australia', awayTeam: 'Turkey', homeScore: 2, awayScore: 0, date: '2026-06-13', distance: 2 } }];
dismissMatchSuggestion('x2');
const dismissed = appState.bets[0];
test('dismiss: prediction.homeTeam intacto (Austria)', dismissed.prediction.homeTeam === 'Austria');
test('dismiss: suggestedMatch limpiado', dismissed.suggestedMatch === null);

console.log();
console.log('=== Result:', pass, 'pass,', fail, 'fail ===');
process.exit(fail > 0 ? 1 : 0);
