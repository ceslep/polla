import { normalizeTeamName } from './parser.js';

/** @typedef {import('./types.js').Match} Match */
/** @typedef {import('./types.js').TeamStats} TeamStats */
/** @typedef {import('./types.js').FormResult} FormResult */

const EMPTY_TEAM_STATS = () => ({
    team: '',
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    goalsForPerGame: 0,
    goalsAgainstPerGame: 0,
    last5: /** @type {FormResult[]} */ ([]),
    opponents: /** @type {string[]} */ ([])
});

/**
 * @param {Match} match
 * @returns {boolean}
 */
function isFinished(match) {
    return match.homeScore !== null && match.awayScore !== null
        && match.homeScore !== undefined && match.awayScore !== undefined;
}

/**
 * Saca la lista ordenada de equipos canónicos presentes en una colección
 * de partidos. La clave canónica pasa por normalizeTeamName para alinear
 * con flags.js y stores.svelte.js.
 * @param {Match[]} matches
 * @returns {string[]}
 */
export function teamsInMatches(matches) {
    const set = new Set();
    for (const m of matches) {
        set.add(normalizeTeamName(m.homeTeam));
        set.add(normalizeTeamName(m.awayTeam));
    }
    return [...set].filter(Boolean).sort();
}

/**
 * Tabla agregada por equipo a partir de los partidos finalizados.
 * Devuelve un Map<canonicalTeam, TeamStats> y un array paralelo ordenado
 * por puntos FIFA (3 victoria, 1 empate, 0 derrota), diferencia de goles
 * y goles a favor como desempates.
 * @param {Match[]} matches
 * @returns {{ table: Map<string, TeamStats>, sorted: TeamStats[], finishedCount: number }}
 */
export function teamStandingsFromMatches(matches) {
    const table = new Map();
    let finishedCount = 0;

    for (const match of matches) {
        if (!isFinished(match)) continue;
        finishedCount++;
        const home = normalizeTeamName(match.homeTeam);
        const away = normalizeTeamName(match.awayTeam);
        if (!home || !away) continue;

        const homeStats = table.get(home) || { ...EMPTY_TEAM_STATS(), team: home };
        const awayStats = table.get(away) || { ...EMPTY_TEAM_STATS(), team: away };

        const hs = Number(match.homeScore) || 0;
        const as = Number(match.awayScore) || 0;

        homeStats.played += 1;
        homeStats.goalsFor += hs;
        homeStats.goalsAgainst += as;
        homeStats.opponents.push(away);
        if (!homeStats.last5) homeStats.last5 = [];
        if (!awayStats.last5) awayStats.last5 = [];

        awayStats.played += 1;
        awayStats.goalsFor += as;
        awayStats.goalsAgainst += hs;
        awayStats.opponents.push(home);

        if (hs > as) {
            homeStats.wins += 1;
            homeStats.points += 3;
            homeStats.last5.push('W');
            awayStats.losses += 1;
            awayStats.last5.push('L');
        } else if (hs < as) {
            awayStats.wins += 1;
            awayStats.points += 3;
            awayStats.last5.push('W');
            homeStats.losses += 1;
            homeStats.last5.push('L');
        } else {
            homeStats.draws += 1;
            awayStats.draws += 1;
            homeStats.points += 1;
            awayStats.points += 1;
            homeStats.last5.push('D');
            awayStats.last5.push('D');
        }

        table.set(home, homeStats);
        table.set(away, awayStats);
    }

    for (const stats of table.values()) {
        stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
        stats.goalsForPerGame = stats.played ? +(stats.goalsFor / stats.played).toFixed(2) : 0;
        stats.goalsAgainstPerGame = stats.played ? +(stats.goalsAgainst / stats.played).toFixed(2) : 0;
        stats.last5 = stats.last5.slice(-5);
    }

    const sorted = [...table.values()].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.team.localeCompare(b.team);
    });

    return { table, sorted, finishedCount };
}

/**
 * Devuelve los N equipos con mejor promedio de goles a favor por partido
 * (mínimo 1 partido jugado).
 * @param {TeamStats[]} sorted
 * @param {number} n
 * @returns {TeamStats[]}
 */
export function topAttacks(sorted, n = 3) {
    return sorted
        .filter(t => t.played > 0)
        .slice()
        .sort((a, b) => {
            if (b.goalsForPerGame !== a.goalsForPerGame) return b.goalsForPerGame - a.goalsForPerGame;
            if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
            return a.team.localeCompare(b.team);
        })
        .slice(0, n);
}

/**
 * Devuelve los N equipos con mejor promedio de goles en contra por partido
 * (menor es mejor; mínimo 1 partido).
 * @param {TeamStats[]} sorted
 * @param {number} n
 * @returns {TeamStats[]}
 */
export function topDefenses(sorted, n = 3) {
    return sorted
        .filter(t => t.played > 0)
        .slice()
        .sort((a, b) => {
            if (a.goalsAgainstPerGame !== b.goalsAgainstPerGame) return a.goalsAgainstPerGame - b.goalsAgainstPerGame;
            if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
            return a.team.localeCompare(b.team);
        })
        .slice(0, n);
}
