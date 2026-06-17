import { normalizeTeamName } from './src/lib/parser.js';
import { loadWorldCupMatches } from './src/lib/api.js';

const allRawMatches = await loadWorldCupMatches();
const allMatchesFormatted = allRawMatches
    .filter(m => m.team1 && m.team2)
    .map((m, i) => ({
        id: i + 1,
        date: m.date,
        homeTeam: normalizeTeamName(m.team1),
        homeShort: m.team1,
        awayTeam: normalizeTeamName(m.team2),
        awayShort: m.team2,
        homeScore: m.score?.ft?.[0] ?? null,
        awayScore: m.score?.ft?.[1] ?? null
    }));

console.log('Sample match:', allMatchesFormatted[0]);
console.log('Has Qatar matches:', allMatchesFormatted.filter(m => m.homeTeam.includes('Qatar') || m.awayTeam.includes('Qatar')));

const bet = {
    type: 'score',
    prediction: { homeTeam: 'Qatar', awayTeam: 'Switzerland' },
    timestamp: '2026/6/12 20:29:15'
};

function findMatchForBet(bet, matches) {
    if (bet.type !== 'score') return null;

    const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
    const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');

    for (const match of matches) {
        const mHomeNorm = normalizeTeamName(match.homeTeam);
        const mAwayNorm = normalizeTeamName(match.awayTeam);
        const mHomeShort = normalizeTeamName(match.homeShort);
        const mAwayShort = normalizeTeamName(match.awayShort);

        const teamsMatch =
            ((homeNorm === mHomeNorm || homeNorm === mHomeShort) &&
             (awayNorm === mAwayNorm || awayNorm === mAwayShort)) ||
            ((homeNorm === mAwayNorm || homeNorm === mAwayShort) &&
             (awayNorm === mHomeNorm || awayNorm === mHomeShort));

        if (teamsMatch) {
            return match;
        }
    }
    return null;
}

const result = findMatchForBet(bet, allMatchesFormatted);
console.log('findMatchForBet result:', result ? result.homeTeam + ' vs ' + result.awayTeam : 'null');
