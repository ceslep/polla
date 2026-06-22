globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();
const { computeWindowState, parseTimeWithOffset, matchLocalToCot, firstMatchTimeCot, nowCotParts } = await import('./src/lib/pwa/window.js');

console.log('=== parseTimeWithOffset ===');
for (const t of ['12:00 UTC-7', '20:00 UTC-6', '13:00 UTC-6', '18:00 UTC-4', '15:00 UTC-5', '19:00 UTC-5']) {
    console.log(`  ${t} ->`, parseTimeWithOffset(t));
}

console.log('\n=== matchLocalToCot (próximos partidos 21-22 jun) ===');
const sample = [
    { id: 1, date: '2026-06-21', time: '12:00 UTC-4', team1: 'Spain', team2: 'Saudi Arabia' },
    { id: 2, date: '2026-06-21', time: '12:00 UTC-7', team1: 'Belgium', team2: 'Iran' },
    { id: 3, date: '2026-06-21', time: '18:00 UTC-4', team1: 'Uruguay', team2: 'Cape Verde' },
    { id: 4, date: '2026-06-21', time: '18:00 UTC-7', team1: 'New Zealand', team2: 'Egypt' },
    { id: 5, date: '2026-06-22', time: '17:00 UTC-4', team1: 'France', team2: 'Iraq' },
];
for (const m of sample) {
    const cot = matchLocalToCot(m.date, m.time);
    console.log(`  ${m.date} ${m.time}  -> COT ${cot?.cotDate} ${cot?.cotTime}`);
}

console.log('\n=== computeWindowState en 3 momentos ===');
// Crear un mapa con los partidos del 21 jun
const matches21 = sample.filter(m => m.date === '2026-06-21');
const matches22 = sample.filter(m => m.date === '2026-06-22');
const allMatches = sample;

// Momento 1: 21 jun 09:00 COT (antes del primer partido)
const t1 = new Date('2026-06-21T14:00:00Z'); // 09:00 COT
const s1 = computeWindowState(allMatches, t1);
console.log(`  21 jun 09:00 COT: status=${s1.status}, firstMatchCOT=${s1.firstMatchLocalTime}, msg="${s1.message}"`);

// Momento 2: 21 jun 11:00 COT (durante la ventana)
const t2 = new Date('2026-06-21T16:00:00Z'); // 11:00 COT
const s2 = computeWindowState(allMatches, t2);
console.log(`  21 jun 11:00 COT: status=${s2.status}, firstMatchCOT=${s2.firstMatchLocalTime}, matches=${s2.matches?.length}`);

// Momento 3: 21 jun 13:00 COT (ventana cerrada, después de las 11:59)
const t3 = new Date('2026-06-21T18:00:00Z'); // 13:00 COT
const s3 = computeWindowState(allMatches, t3);
console.log(`  21 jun 13:00 COT: status=${s3.status}, msg="${s3.message}"`);

// Momento 4: 22 jun 10:00 COT (día siguiente, ventana abierta)
const t4 = new Date('2026-06-22T15:00:00Z'); // 10:00 COT
const s4 = computeWindowState(allMatches, t4);
console.log(`  22 jun 10:00 COT: status=${s4.status}, firstMatchCOT=${s4.firstMatchLocalTime}`);

// Momento 5: 25 jun 10:00 COT (sin partidos próximos en el dataset)
const t5 = new Date('2026-06-25T15:00:00Z');
const s5 = computeWindowState(allMatches, t5);
console.log(`  25 jun 10:00 COT: status=${s5.status}, msg="${s5.message}"`);

console.log('\n=== firstMatchTimeCot + nowCotParts ===');
console.log('  firstMatchTimeCot(s2):', firstMatchTimeCot(s2));
console.log('  nowCotParts(t2):', nowCotParts(t2));
