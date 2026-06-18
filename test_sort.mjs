// Test for sortByTimestampDesc()
globalThis.$state = (o) => o;
const mod = await import('./src/lib/stores.svelte.js');
const { sortByTimestampDesc, appState } = mod;

const b = (timestamp, id = 'x') => ({
    id, messageId: 'm', timestamp, participant: 'p', phone: '',
    type: 'score', bet_text: '', prediction: {},
    status: 'pending', points: 0, real_result: null,
    verified: false, manuallyEdited: false, originalMessage: ''
});

let pass = 0, fail = 0;
function test(name, cond) {
    if (cond) { pass++; console.log('  PASS:', name); }
    else { fail++; console.log('  FAIL:', name); }
}

console.log('--- 1. Orden descendente básico ---');
let r = sortByTimestampDesc([
    b('2026/6/12 10:00', 'a'),
    b('2026/6/17 08:00', 'b'),
    b('2026/6/15 12:00', 'c'),
]);
test('3 elementos', r.length === 3);
test('más reciente primero (b)', r[0].id === 'b');
test('medio (c)', r[1].id === 'c');
test('más antiguo (a)', r[2].id === 'a');

console.log('--- 2. No muta el array original ---');
const original = [b('2026/6/12 10:00', 'a'), b('2026/6/17 08:00', 'b')];
const originalOrder = original.map(x => x.id);
sortByTimestampDesc(original);
test('orden original preservado', original.map(x => x.id).join(',') === originalOrder.join(','));

console.log('--- 3. Mismo timestamp: preserva orden de inserción ---');
r = sortByTimestampDesc([
    b('2026/6/17 08:00', 'first'),
    b('2026/6/17 08:00', 'second'),
    b('2026/6/17 08:00', 'third'),
]);
test('mismo ts: first → second → third', r.map(x => x.id).join(',') === 'first,second,third');

console.log('--- 4. Timestamps vacíos van al final ---');
r = sortByTimestampDesc([
    b('', 'no-ts'),
    b('2026/6/17 08:00', 'with-ts'),
]);
test('sin ts al final', r[1].id === 'no-ts');

console.log('--- 5. Array vacío ---');
r = sortByTimestampDesc([]);
test('array vacío → vacío', r.length === 0);

console.log('--- 6. Un solo elemento ---');
r = sortByTimestampDesc([b('2026/6/17 08:00', 'only')]);
test('un elemento se preserva', r.length === 1 && r[0].id === 'only');

console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
