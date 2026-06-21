// Shim $state for Node (Svelte 5 rune not available outside Svelte runtime).
// parser.js imports betKey from stores.svelte.js which uses $state at module scope.
globalThis.$state = (obj) => obj;

const { collectParserWorkarounds } = await import('./src/lib/parser.js');

/** @type {Array<{ name: string, text: string, derivedBets?: any[], expectCodes: string[], expectNoCodes?: string[] }>} */
const cases = [
    {
        name: 'typo o→0',
        text: 'Canadá 2 catar o',
        expectCodes: ['o_for_zero']
    },
    {
        name: 'número pegado sin espacio',
        text: 'Haití 1escocia 1',
        expectCodes: ['no_space_num_text']
    },
    {
        name: 'marcador con guión entre números',
        text: 'Austria 2-1 Turquía',
        expectCodes: ['hyphen_score']
    },
    {
        name: 'línea huérfana con sólo número',
        text: 'Estados Unidos 2 Australia\n0',
        expectCodes: ['orphan_number']
    },
    {
        name: 'marcador partido en dos líneas',
        text: 'USA 2\nAustralia 0',
        expectCodes: ['cross_line_score']
    },
    {
        name: 'número pegado a equipo en línea 2',
        text: 'Brasil 4 Haiti 0\nTurquía 1paraguay 1',
        expectCodes: ['no_space_num_text']
    },
    {
        name: 'bien formateado (sin issues)',
        text: 'Brasil 3 Marruecos 1\nMéxico 1 Corea del Sur 1',
        expectCodes: []
    },
    {
        name: 'texto vacío',
        text: '',
        expectCodes: []
    },
    {
        name: 'reparse_recovered (bet con id _reparse_0)',
        text: 'México 1 Corea del Sur 1',
        derivedBets: [{ id: 'abc_score_reparse_0', type: 'score' }],
        expectCodes: ['reparse_recovered']
    },
    {
        name: 'equipo no canónico detectado vía derivedBets',
        text: 'ZZTeam 2 YYTeam 1',
        derivedBets: [{
            id: 'b1',
            type: 'score',
            prediction: { homeTeam: 'ZZTeam', awayTeam: 'YYTeam' }
        }],
        expectCodes: ['unknown_team', 'unknown_team']
    },
    {
        name: 'dedup por (code, snippet) cuando home y away son el mismo equipo no canónico',
        text: 'ZZTeam 2 ZZTeam 1',
        derivedBets: [{
            id: 'b1',
            type: 'score',
            prediction: { homeTeam: 'ZZTeam', awayTeam: 'ZZTeam' }
        }],
        expectCodes: ['unknown_team']
    }
];

/**
 * @param {string} label
 * @param {boolean} cond
 */
function assert(label, cond) {
    if (!cond) {
        console.error('  ✗', label);
        process.exitCode = 1;
    } else {
        console.log('  ✓', label);
    }
}

for (const c of cases) {
    console.log(`\n[${c.name}]`);
    console.log('  text:', JSON.stringify(c.text));
    const issues = collectParserWorkarounds(c.text, c.derivedBets || []);
    const codes = issues.map(i => i.code);
    console.log('  issues:', JSON.stringify(issues, null, 2));
    console.log('  codes:', JSON.stringify(codes));

    for (const expected of c.expectCodes) {
        const n = codes.filter(c => c === expected).length;
        assert(`contains code ${expected} (≥1)`, n >= 1);
    }

    for (const c2 of codes) {
        const expectedN = c.expectCodes.filter(e => e === c2).length;
        if (expectedN === 0) {
            assert(`does NOT contain code ${c2}`, false);
        }
    }

    if (c.expectCodes.length === 0) {
        assert('no issues expected', codes.length === 0);
    }
}

console.log('\n✓ test_malformed.mjs finished');
