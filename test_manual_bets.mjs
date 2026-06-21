import { parseManualBets } from './src/lib/parser.js';

const bets = parseManualBets();

let pass = 0, fail = 0;
const expected = [
    { type: 'score', homeTeam: 'USA',      awayTeam: 'Australia', homeScore: 3, awayScore: 0 },
    { type: 'score', homeTeam: 'Scotland', awayTeam: 'Morocco',   homeScore: 0, awayScore: 2 },
    { type: 'score', homeTeam: 'Brazil',   awayTeam: 'Haiti',     homeScore: 4, awayScore: 0 },
    { type: 'score', homeTeam: 'Turkey',   awayTeam: 'Paraguay',  homeScore: 0, awayScore: 2 }
];

console.log('=== Test parseManualBets ===');
console.log('Bets extraidos:', bets.length);
console.log('');

if (bets.length !== expected.length) {
    console.log('FAIL: se esperaban ' + expected.length + ' bets, se obtuvieron ' + bets.length);
    process.exit(1);
}

for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const b = bets[i];
    const ok = b
        && b.type === e.type
        && b.prediction.homeTeam === e.homeTeam
        && b.prediction.awayTeam === e.awayTeam
        && b.prediction.homeScore === e.homeScore
        && b.prediction.awayScore === e.awayScore;
    const tag = ok ? 'OK ' : 'FAIL';
    console.log(tag, 'Bet', i, '->', JSON.stringify(b ? b.prediction : null));
    if (ok) pass++; else fail++;
}

const mleandro = bets.filter(b => b.participant === 'mleandro0210' || b.phone === '+57 310 5218554');
console.log('');
console.log('Bets con participant=mleandro0210 o phone=+57 310 5218554:', mleandro.length);
if (mleandro.length === expected.length) {
    console.log('OK  participant resuelto correctamente');
    pass++;
} else {
    console.log('FAIL participant incorrecto');
    fail++;
}

const allScore = bets.every(b => b.type === 'score');
if (allScore) {
    console.log('OK  todas son tipo score (sin champion/runnerup/topscorer colaterales)');
    pass++;
} else {
    console.log('FAIL hay tipos distintos a score');
    fail++;
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
