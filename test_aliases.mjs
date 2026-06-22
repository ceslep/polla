globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();
const { normalizeTeamName, resolveTeamName } = await import('./src/lib/parser.js');
for (const w of [
    'araudia', 'Araudia', 'ARAUDIA',
    'araudia saudita', 'araudia saudí', 'araudia saudi',
    'arabia saudita', 'saudi arabia',
    'egyto', 'Egyto', 'egipto', 'egypt',
    'España 3 Araudia Saudita 1', 'España 3 Araudia Saudita 0'
]) {
    console.log('normalize(', w, ') ->', JSON.stringify(normalizeTeamName(w)), '| resolveTeam ->', JSON.stringify(resolveTeamName(w)));
}

