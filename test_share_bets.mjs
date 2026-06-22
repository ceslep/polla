// Smoke test: verifica que el formato del mensaje generado por PwaShareBets
// coincida con el spec del usuario:
//   Tangarife
//   🇦🇷 Argentina vs Austria 🇦🇹: 3-1
//   🇫🇷 France vs Iraq 🇮🇶: 3-0
//   ...
//
// Participantes separados por una línea en blanco.

globalThis.$state = (o) => o;
globalThis.$derived = (fn) => fn();

// Replicamos la lógica exacta de PwaShareBets.svelte (extracto del componente).
const { getFlagData } = await import('./src/lib/flags.js');

/**
 * @param {any[]} bets
 * @param {string} todayDate
 */
function buildMessage(bets, todayDate) {
    const filtered = bets.filter((b) => b.type === 'score' && b.matchDate === todayDate);
    /** @type {Map<string, any[]>} */
    const byPart = new Map();
    for (const b of filtered) {
        if (!b.participant) continue;
        let arr = byPart.get(b.participant);
        if (!arr) { arr = []; byPart.set(b.participant, arr); }
        arr.push(b);
    }
    const sortedParts = [...byPart.keys()].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    /** @type {string[]} */
    const blocks = [];
    for (const p of sortedParts) {
        const partBets = byPart.get(p) || [];
        partBets.sort((a, b) => String(a.matchDate || '').localeCompare(String(b.matchDate || '')));
        /** @type {string[]} */
        const lines = [p];
        for (const bet of partBets) {
            const pred = bet.prediction || {};
            const homeData = getFlagData(pred.homeTeam || '');
            const awayData = getFlagData(pred.awayTeam || '');
            const homeEmoji = homeData?.emoji || '';
            const awayEmoji = awayData?.emoji || '';
            const homeName = homeData?.spanishName || pred.homeTeam || '?';
            const awayName = awayData?.spanishName || pred.awayTeam || '?';
            const hs = pred.homeScore;
            const as = pred.awayScore;
            if (hs == null || as == null) continue;
            lines.push(`${homeEmoji} ${homeName} vs ${awayEmoji} ${awayName}: ${hs}-${as}`);
        }
        if (lines.length > 1) blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n');
}

// Sample data
const sample = [
    { participant: 'Tangarife', type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'Argentina', awayTeam: 'Austria', homeScore: 3, awayScore: 1 } },
    { participant: 'Tangarife', type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'France',   awayTeam: 'Iraq',    homeScore: 3, awayScore: 0 } },
    { participant: 'Tangarife', type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'Norway',   awayTeam: 'Senegal', homeScore: 2, awayScore: 1 } },
    { participant: 'Tangarife', type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'Jordan',   awayTeam: 'Algeria', homeScore: 0, awayScore: 2 } },
    { participant: 'Maria',     type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'Argentina', awayTeam: 'Austria', homeScore: 2, awayScore: 2 } },
    { participant: 'Maria',     type: 'score', matchDate: '2026-06-22', prediction: { homeTeam: 'France',   awayTeam: 'Iraq',    homeScore: 1, awayScore: 1 } },
    { participant: 'Pedro',     type: 'score', matchDate: '2026-06-23', prediction: { homeTeam: 'Brazil',   awayTeam: 'Mexico',  homeScore: 2, awayScore: 0 } }, // otro día, NO debe salir
    { participant: 'Tangarife', type: 'champion', matchDate: '2026-06-22', prediction: { champion: 'Brazil' } }, // type !== score, NO debe salir
];

const msg = buildMessage(sample, '2026-06-22');
console.log('--- MENSAJE GENERADO ---\n' + msg + '\n--- FIN ---');

const expected = [
    'Maria',
    '🇦🇷 Argentina vs 🇦🇹 Austria: 2-2',
    '🇫🇷 Francia vs 🇮🇶 Irak: 1-1',
    '',
    'Tangarife',
    '🇦🇷 Argentina vs 🇦🇹 Austria: 3-1',
    '🇫🇷 Francia vs 🇮🇶 Irak: 3-0',
    '🇳🇴 Noruega vs 🇸🇳 Senegal: 2-1',
    '🇯🇴 Jordania vs 🇩🇿 Argelia: 0-2',
].join('\n');

const ok = msg === expected;
console.log(ok ? 'OK — formato coincide con spec' : 'FAIL — formato difiere del spec');
if (!ok) {
    console.log('\n--- ESPERADO ---\n' + expected);
    console.log('\n--- OBTENIDO ---\n' + msg);
}
process.exit(ok ? 0 : 1);
