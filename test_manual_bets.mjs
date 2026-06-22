// Shim $state for Node (Svelte 5 rune not available outside Svelte runtime).
// parser.js imports betKey from stores.svelte.js which uses $state at module scope.
globalThis.$state = (obj) => obj;

const { parseManualBets } = await import('./src/lib/parser.js');

const bets = parseManualBets();

let pass = 0, fail = 0;
const expectedMleandro = [
    { type: 'score', homeTeam: 'USA',      awayTeam: 'Australia', homeScore: 3, awayScore: 0 },
    { type: 'score', homeTeam: 'Scotland', awayTeam: 'Morocco',   homeScore: 0, awayScore: 2 },
    { type: 'score', homeTeam: 'Brazil',   awayTeam: 'Haiti',     homeScore: 4, awayScore: 0 },
    { type: 'score', homeTeam: 'Turkey',   awayTeam: 'Paraguay',  homeScore: 0, awayScore: 2 }
];

const expectedYohn = [
    { type: 'champion',  champion: 'Germany' },
    { type: 'runnerup',  runnerup: 'Colombia' },
    { type: 'topscorer', topscorer: 'luis diaz' }
];

const expectedHuguito = [
    { type: 'score', homeTeam: 'Spain',       awayTeam: 'Saudi Arabia', homeScore: 5, awayScore: 1 },
    { type: 'score', homeTeam: 'Belgium',     awayTeam: 'Iran',         homeScore: 4, awayScore: 2 },
    { type: 'score', homeTeam: 'Uruguay',     awayTeam: 'Cape Verde',   homeScore: 4, awayScore: 2 },
    { type: 'score', homeTeam: 'New Zealand', awayTeam: 'Cape Verde',   homeScore: 3, awayScore: 1 }
];

console.log('=== Test parseManualBets ===');
console.log('Bets extraidos:', bets.length);
console.log('');

if (bets.length !== expectedMleandro.length + expectedYohn.length + expectedHuguito.length) {
    console.log('FAIL: se esperaban ' + (expectedMleandro.length + expectedYohn.length + expectedHuguito.length) + ' bets, se obtuvieron ' + bets.length);
    process.exit(1);
}

const mleandro = bets.filter(b => b.participant === 'mleandro0210' || b.phone === '+57 310 5218554');
const yohn = bets.filter(b => b.participant === 'Yohn Alcaraz' || b.phone === '+57 322 4422883');
const huguito = bets.filter(b => b.participant === 'Huguito P ' || b.phone === '+57 315 6389889');

console.log('Bets de mleandro0210:', mleandro.length, '/ esperados:', expectedMleandro.length);
if (mleandro.length === expectedMleandro.length) {
    console.log('OK  participant mleandro0210 resuelto correctamente');
    pass++;
} else {
    console.log('FAIL participant mleandro0210 incorrecto');
    fail++;
}

console.log('Bets de Yohn Alcaraz:', yohn.length, '/ esperados:', expectedYohn.length);
if (yohn.length === expectedYohn.length) {
    console.log('OK  participant Yohn Alcaraz resuelto correctamente');
    pass++;
} else {
    console.log('FAIL participant Yohn Alcaraz incorrecto');
    fail++;
}

for (let i = 0; i < expectedMleandro.length; i++) {
    const e = expectedMleandro[i];
    const b = mleandro[i];
    const ok = b
        && b.type === e.type
        && b.prediction.homeTeam === e.homeTeam
        && b.prediction.awayTeam === e.awayTeam
        && b.prediction.homeScore === e.homeScore
        && b.prediction.awayScore === e.awayScore;
    const tag = ok ? 'OK ' : 'FAIL';
    console.log(tag, 'mleandro[' + i + '] ->', JSON.stringify(b ? b.prediction : null));
    if (ok) pass++; else fail++;
}

for (let i = 0; i < expectedYohn.length; i++) {
    const e = expectedYohn[i];
    const b = yohn[i];
    /** @type {any} */
    const pred = b ? b.prediction : {};
    const value = pred[e.type];
    const ok = b && b.type === e.type && value === e[e.type];
    const tag = ok ? 'OK ' : 'FAIL';
    console.log(tag, 'yohn[' + i + '] ->', JSON.stringify(b ? b.prediction : null));
    if (ok) pass++; else fail++;
}

console.log('Bets de Huguito P:', huguito.length, '/ esperados:', expectedHuguito.length);
if (huguito.length === expectedHuguito.length) {
    console.log('OK  participant Huguito P resuelto correctamente');
    pass++;
} else {
    console.log('FAIL participant Huguito P incorrecto');
    fail++;
}

for (let i = 0; i < expectedHuguito.length; i++) {
    const e = expectedHuguito[i];
    const b = huguito[i];
    const ok = b
        && b.type === e.type
        && b.prediction.homeTeam === e.homeTeam
        && b.prediction.awayTeam === e.awayTeam
        && b.prediction.homeScore === e.homeScore
        && b.prediction.awayScore === e.awayScore;
    const tag = ok ? 'OK ' : 'FAIL';
    console.log(tag, 'huguito[' + i + '] ->', JSON.stringify(b ? b.prediction : null));
    if (ok) pass++; else fail++;
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
