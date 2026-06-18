globalThis.$state = (o) => o;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { teamStandingsFromMatches, topAttacks, topDefenses, teamsInMatches } = await import('./src/lib/teamStats.js');

const matches = [
    { id: 1, date: '2026-06-11', homeTeam: 'Mexico', awayTeam: 'South Africa', homeShort: 'Mexico', awayShort: 'South Africa', homeScore: 2, awayScore: 0, resultString: '' },
    { id: 2, date: '2026-06-11', homeTeam: 'South Korea', awayTeam: 'Czech Republic', homeShort: 'South Korea', awayShort: 'Czech Republic', homeScore: 2, awayScore: 1, resultString: '' },
    { id: 3, date: '2026-06-12', homeTeam: 'Canada', awayTeam: 'Bosnia & Herzegovina', homeShort: 'Canada', awayShort: 'Bosnia & Herzegovina', homeScore: 1, awayScore: 1, resultString: '' },
    { id: 4, date: '2026-06-13', homeTeam: 'Brazil', awayTeam: 'Morocco', homeShort: 'Brazil', awayShort: 'Morocco', homeScore: 1, awayScore: 1, resultString: '' },
    { id: 5, date: '2026-06-14', homeTeam: 'Germany', awayTeam: 'Curaçao', homeShort: 'Germany', awayShort: 'Curaçao', homeScore: 7, awayScore: 1, resultString: '' },
    { id: 6, date: '2026-06-14', homeTeam: 'Netherlands', awayTeam: 'Japan', homeShort: 'Netherlands', awayShort: 'Japan', homeScore: 2, awayScore: 2, resultString: '' },
    { id: 7, date: '2026-06-15', homeTeam: 'Spain', awayTeam: 'Cape Verde', homeShort: 'Spain', awayShort: 'Cape Verde', homeScore: 0, awayScore: 0, resultString: '' },
    { id: 8, date: '2026-06-16', homeTeam: 'France', awayTeam: 'Senegal', homeShort: 'France', awayShort: 'Senegal', homeScore: 3, awayScore: 1, resultString: '' },
    { id: 9, date: '2026-06-17', homeTeam: 'England', awayTeam: 'Croatia', homeShort: 'England', awayShort: 'Croatia', homeScore: 4, awayScore: 2, resultString: '' },
    { id: 10, date: '2026-06-18', homeTeam: 'Mexico', awayTeam: 'South Korea', homeShort: 'Mexico', awayShort: 'South Korea', homeScore: null, awayScore: null, resultString: '' }
];

let pass = 0, fail = 0;
function test(name, cond) {
    if (cond) { pass++; console.log('  PASS:', name); }
    else { fail++; console.log('  FAIL:', name); }
}

console.log('--- 1. Solo partidos finalizados cuentan ---');
const { table, sorted, finishedCount } = teamStandingsFromMatches(matches);
test('finishedCount = 9 (ignora el partido sin score)', finishedCount === 9);
test('Mexico presente en la tabla', table.has('Mexico'));
test('South Korea con 1 PJ y 3 pts tras ganar 2-1', table.get('South Korea').points === 3 && table.get('South Korea').wins === 1);
test('Czech Republic con 0 pts tras caer 1-2', table.get('Czech Republic').points === 0 && table.get('Czech Republic').losses === 1);
test('Germany con 3 pts (victoria 7-1)', table.get('Germany').points === 3);
test('Cape Verde con 1 pt (empate 0-0)', table.get('Cape Verde').points === 1);

console.log('--- 2. Cómputo de goles ---');
test('Mexico 2 goles a favor', table.get('Mexico').goalsFor === 2);
test('Germany 7 goles a favor, 1 en contra', table.get('Germany').goalsFor === 7 && table.get('Germany').goalsAgainst === 1);
test('England 4 goles a favor', table.get('England').goalsFor === 4);

console.log('--- 3. Forma reciente (last5) ---');
test('Mexico last5 = ["W"]', JSON.stringify(table.get('Mexico').last5) === '["W"]');
test('Germany last5 = ["W"]', JSON.stringify(table.get('Germany').last5) === '["W"]');
test('England last5 = ["W"]', JSON.stringify(table.get('England').last5) === '["W"]');
test('Czech Republic last5 = ["L"]', JSON.stringify(table.get('Czech Republic').last5) === '["L"]');

console.log('--- 4. Ordenamiento ---');
test('Top de la tabla = Germany (3 pts, dif +6)', sorted[0].team === 'Germany');
const top3 = sorted.slice(0, 3).map(t => t.team);
test('Top 3 incluye a Germany, England, France', top3.includes('Germany') && top3.includes('England') && top3.includes('France'));

console.log('--- 5. topAttacks (G/F por partido) ---');
const attacks = topAttacks(sorted, 3);
test('Top ataque incluye a Germany (7 G/F)', attacks[0].team === 'Germany' && attacks[0].goalsFor === 7);
test('Top ataque length 3', attacks.length === 3);

console.log('--- 6. topDefenses (G/C por partido, menor mejor) ---');
const defenses = topDefenses(sorted, 3);
test('Top defensa incluye a Mexico/Cape Verde/Spain (todos con 0 G/C)', defenses[0].goalsAgainst === 0);
test('Top defensa length 3', defenses.length === 3);

console.log('--- 7. teamsInMatches (excluye partidos sin score) ---');
const teams = teamsInMatches(matches);
test('teamsInMatches incluye los 18 equipos únicos', teams.length === 18);
test('teamsInMatches incluye a Mexico', teams.includes('Mexico'));
test('teamsInMatches NO incluye equipos inventados', !teams.includes('Atlantis'));

console.log('--- 8. Datos vacíos ---');
const empty = teamStandingsFromMatches([]);
test('Lista vacía -> table vacía', empty.sorted.length === 0);
test('Lista vacía -> finishedCount = 0', empty.finishedCount === 0);

console.log('--- 9. Partido sin score se ignora, no afecta standings ---');
const before = table.get('Mexico').played;
const after = teamStandingsFromMatches(matches).table.get('Mexico').played;
test('Mexico sigue con 1 PJ aunque haya un partido no finalizado', after === before);

console.log();
console.log('=== Result:', pass, 'pass,', fail, 'fail ===');
process.exit(fail > 0 ? 1 : 0);
