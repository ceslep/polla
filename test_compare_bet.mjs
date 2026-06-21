import { compareBetWithMatch } from './src/lib/api.js';

const cases = [
    {
        name: 'Same order, exact score (USA 2-0 Australia)',
        bet: { type: 'score', prediction: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 2, awayScore: 0 } },
        match: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 2, awayScore: 0, resultString: 'USA 2-0 Australia' },
        expected: { status: 'exact', points: 5 }
    },
    {
        name: 'Inverted order, exact score (Morocco 1-0 Scotland vs Scotland 0-1 Morocco)',
        bet: { type: 'score', prediction: { homeTeam: 'Morocco', awayTeam: 'Scotland', homeScore: 1, awayScore: 0 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 0, awayScore: 1, resultString: 'Scotland 0-1 Morocco' },
        expected: { status: 'exact', points: 5 }
    },
    {
        name: 'Same order, sign matches (USA 4-1 Australia vs USA 2-0 Australia)',
        bet: { type: 'score', prediction: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 4, awayScore: 1 } },
        match: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 2, awayScore: 0, resultString: 'USA 2-0 Australia' },
        expected: { status: 'correct', points: 3 }
    },
    {
        name: 'Inverted order, sign matches (Marruecos 3-1 Escocia vs Scotland 0-1 Morocco)',
        bet: { type: 'score', prediction: { homeTeam: 'Morocco', awayTeam: 'Scotland', homeScore: 3, awayScore: 1 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 0, awayScore: 1, resultString: 'Scotland 0-1 Morocco' },
        expected: { status: 'correct', points: 3 }
    },
    {
        name: 'Inverted order, sign matches (Turkey 1-2 Paraguay vs Turkey 0-1 Paraguay)',
        bet: { type: 'score', prediction: { homeTeam: 'Turkey', awayTeam: 'Paraguay', homeScore: 1, awayScore: 2 } },
        match: { homeTeam: 'Turkey', awayTeam: 'Paraguay', homeScore: 0, awayScore: 1, resultString: 'Turkey 0-1 Paraguay' },
        expected: { status: 'correct', points: 3 }
    },
    {
        name: 'Same order, wrong winner (Scotland 1-0 Morocco vs Scotland 0-1 Morocco)',
        bet: { type: 'score', prediction: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 1, awayScore: 0 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 0, awayScore: 1, resultString: 'Scotland 0-1 Morocco' },
        expected: { status: 'incorrect', points: 0 }
    },
    {
        name: 'Inverted order, wrong winner (Morocco 1 Scotland 0 vs Scotland 1-0 Morocco)',
        bet: { type: 'score', prediction: { homeTeam: 'Morocco', awayTeam: 'Scotland', homeScore: 1, awayScore: 0 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 1, awayScore: 0, resultString: 'Scotland 1-0 Morocco' },
        expected: { status: 'incorrect', points: 0 }
    },
    {
        name: 'Inverted order, 0-0 draw exact (Morocco 0-0 Scotland vs Scotland 0-0 Morocco)',
        bet: { type: 'score', prediction: { homeTeam: 'Morocco', awayTeam: 'Scotland', homeScore: 0, awayScore: 0 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 0, awayScore: 0, resultString: 'Scotland 0-0 Morocco' },
        expected: { status: 'exact', points: 5 }
    },
    {
        name: 'Non-score bet returns pending',
        bet: { type: 'champion', prediction: { champion: 'Brazil' } },
        match: { homeTeam: 'Brazil', awayTeam: 'Haiti', homeScore: 3, awayScore: 0, resultString: 'Brazil 3-0 Haiti' },
        expected: { status: 'pending', points: 0 }
    },
    {
        name: 'Match without scores returns pending',
        bet: { type: 'score', prediction: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: 4, awayScore: 1 } },
        match: { homeTeam: 'USA', awayTeam: 'Australia', homeScore: null, awayScore: null, resultString: 'USA vs Australia' },
        expected: { status: 'pending', points: 0 }
    },
    {
        name: 'Bet is not mutated (non-destructive fix)',
        bet: { type: 'score', prediction: { homeTeam: 'Morocco', awayTeam: 'Scotland', homeScore: 3, awayScore: 1 } },
        match: { homeTeam: 'Scotland', awayTeam: 'Morocco', homeScore: 0, awayScore: 1, resultString: 'Scotland 0-1 Morocco' },
        expected: { status: 'correct', points: 3 },
        checkImmutable: true
    }
];

let pass = 0, fail = 0;
for (const c of cases) {
    const before = c.checkImmutable ? JSON.parse(JSON.stringify(c.bet)) : null;
    const result = compareBetWithMatch(c.bet, c.match);
    const ok = result.status === c.expected.status && result.points === c.expected.points;
    const immutableOk = c.checkImmutable
        ? JSON.stringify(c.bet) === JSON.stringify(before)
        : true;
    const finalOk = ok && immutableOk;
    const tag = finalOk ? 'OK ' : 'FAIL';
    console.log(tag, c.name);
    console.log('    ->', result.status, result.points + 'pt',
        ok ? '' : `(expected ${c.expected.status} ${c.expected.points}pt)`);
    if (c.checkImmutable && !immutableOk) {
        console.log('    -> bet was mutated!', { before, after: c.bet });
    }
    if (finalOk) pass++; else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
