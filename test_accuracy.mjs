globalThis.$state = (o) => o;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { globalAccuracy, participantAccuracy, specialBetTallies } = await import('./src/lib/accuracy.js');

const bets = [
    { id: '1', participant: 'Ana', type: 'score', prediction: { homeTeam: 'Mexico', awayTeam: 'South Africa', homeScore: 2, awayScore: 0 }, status: 'exact', points: 5 },
    { id: '2', participant: 'Ana', type: 'score', prediction: { homeTeam: 'Brazil', awayTeam: 'Morocco', homeScore: 1, awayScore: 1 }, status: 'correct', points: 3 },
    { id: '3', participant: 'Ana', type: 'score', prediction: { homeTeam: 'Spain', awayTeam: 'Cape Verde', homeScore: 1, awayScore: 0 }, status: 'incorrect', points: 0 },
    { id: '4', participant: 'Ana', type: 'champion', prediction: { champion: 'Brazil' }, status: 'pending', points: 0 },
    { id: '5', participant: 'Beto', type: 'score', prediction: { homeTeam: 'Germany', awayTeam: 'Curaçao', homeScore: 7, awayScore: 1 }, status: 'exact', points: 5 },
    { id: '6', participant: 'Beto', type: 'score', prediction: { homeTeam: 'Mexico', awayTeam: 'South Africa', homeScore: 1, awayScore: 2 }, status: 'incorrect', points: 0 },
    { id: '7', participant: 'Beto', type: 'runnerup', prediction: { runnerup: 'Argentina' }, status: 'pending', points: 0 },
    { id: '8', participant: 'Cami', type: 'score', prediction: { homeTeam: 'Mexico', awayTeam: 'South Africa', homeScore: 2, awayScore: 0 }, status: 'exact', points: 5 },
    { id: '9', participant: 'Cami', type: 'score', prediction: { homeTeam: 'Brazil', awayTeam: 'Morocco', homeScore: 1, awayScore: 1 }, status: 'correct', points: 3 },
    { id: '10', participant: 'Cami', type: 'topscorer', prediction: { topscorer: 'Mbappé' }, status: 'pending', points: 0 },
    { id: '11', participant: 'Dani', type: 'champion', prediction: { champion: 'Brazil' }, status: 'pending', points: 0 },
    { id: '12', participant: 'Dani', type: 'runnerup', prediction: { runnerup: 'France' }, status: 'pending', points: 0 },
    { id: '13', participant: 'Dani', type: 'topscorer', prediction: { topscorer: 'Mbappé' }, status: 'pending', points: 0 }
];

let pass = 0, fail = 0;
function test(name, cond) {
    if (cond) { pass++; console.log('  PASS:', name); }
    else { fail++; console.log('  FAIL:', name); }
}

console.log('--- 1. globalAccuracy ---');
const g = globalAccuracy(bets);
test('total = 13', g.total === 13);
test('exact = 3 (Ana, Beto, Cami)', g.exact === 3);
test('correct = 2 (Ana, Cami)', g.correct === 2);
test('incorrect = 2 (Ana, Beto)', g.incorrect === 2);
test('pending = 6 (4 special + 2)', g.pending === 6);
test('points = 21 (5+3+0+5+0+5+3)', g.points === 21);
test('resolved = 7 (3+2+2)', g.resolved === 7);
test('accuracyPct = 71.4 (5/7)', g.accuracyPct === 71.4);
test('exactPct = 42.9 (3/7)', g.exactPct === 42.9);

console.log('--- 2. participantAccuracy ---');
const pp = participantAccuracy(bets);
test('Devuelve 4 participantes', pp.length === 4);
test('Orden por puntos desc: Ana=8, Beto=5, Cami=8, Dani=0', pp[0].points === 8 && pp[1].points === 8);
test('Ana accuracyPct = 66.7 (2/3)', pp[0].participant === 'Ana' ? pp[0].accuracyPct === 66.7 : pp[1].accuracyPct === 66.7);
test('Beto resolved = 2', pp.find(p => p.participant === 'Beto').resolved === 2);
test('Cami resolved = 2', pp.find(p => p.participant === 'Cami').resolved === 2);
test('Cami accuracyPct = 100 (2/2)', pp.find(p => p.participant === 'Cami').accuracyPct === 100);
test('Dani resolved = 0 -> accuracyPct = 0', pp.find(p => p.participant === 'Dani').accuracyPct === 0);
test('Dani pending = 3', pp.find(p => p.participant === 'Dani').pending === 3);

console.log('--- 3. specialBetTallies ---');
const s = specialBetTallies(bets, 5);
test('champion total = 2 (Ana, Dani)', s.champion.length === 1);
test('champion top = Brazil con 2 menciones (100%)', s.champion[0].value === 'Brazil' && s.champion[0].count === 2 && s.champion[0].pct === 100);
test('runnerup total = 2 (Beto, Dani)', s.runnerup.length === 2);
test('topscorer total = 2 (Cami, Dani)', s.topscorer.length === 1);
test('topscorer top = Mbappé con 2 menciones (100%)', s.topscorer[0].value === 'Mbappé' && s.topscorer[0].count === 2);

console.log('--- 4. Edge cases ---');
const empty = globalAccuracy([]);
test('Lista vacía -> accuracyPct = 0', globalAccuracy([]).accuracyPct === 0);
test('Lista vacía -> total = 0', globalAccuracy([]).total === 0);

const onlyPending = globalAccuracy([
    { participant: 'X', type: 'score', prediction: {}, status: 'pending', points: 0 }
]);
test('Solo pendientes -> resolved = 0, accuracyPct = 0', onlyPending.resolved === 0 && onlyPending.accuracyPct === 0);

const noSpecial = specialBetTallies([
    { participant: 'X', type: 'score', prediction: { homeTeam: 'A', awayTeam: 'B' }, status: 'pending', points: 0 }
]);
test('Sin apuestas especiales -> todas las listas vacías', noSpecial.champion.length === 0 && noSpecial.runnerup.length === 0 && noSpecial.topscorer.length === 0);

console.log('--- 5. Bet nulo se ignora ---');
const withNull = globalAccuracy([...bets, null, undefined]);
test('Bets nulos no cuentan', withNull.total === 13);

console.log();
console.log('=== Result:', pass, 'pass,', fail, 'fail ===');
process.exit(fail > 0 ? 1 : 0);
