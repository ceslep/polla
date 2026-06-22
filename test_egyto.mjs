globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();
const { normalizeTeamName } = await import('./src/lib/parser.js');
for (const w of ['egyto', 'Egyto', 'EGYPTO', 'Egipto', 'egypt', 'egipto']) {
    console.log(w, '->', JSON.stringify(normalizeTeamName(w)));
}
