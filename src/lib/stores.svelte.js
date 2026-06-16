import { normalizeTeamName } from './parser.js';

/** @typedef {import('./types.js').Bet} Bet */
/** @typedef {import('./types.js').Match} Match */

/** @type {{ bets: Bet[], matches: Match[], isLoading: boolean, filters: { participant: string, status: string, search: string, sort: string, type: string, date: string }, participantAliases: Record<string, string> }} */
export const appState = $state({
    bets: [],
    matches: [],
    isLoading: false,
    filters: {
        participant: '',
        status: '',
        search: '',
        sort: 'timestamp-desc',
        type: 'score',
        date: ''
    },
    participantAliases: {}
});

/** @type {() => string[]} */
export const uniqueDates = () => {
    const dates = new Set();
    appState.bets.forEach(bet => {
        const d = getBetDate(bet);
        if (d) dates.add(d);
    });
    return [...dates].sort().reverse();
};

/** @type {() => string[]} */
export const matchDates = () => {
    const dates = new Set();
    appState.matches.forEach(match => {
        const d = safeFormatDate(match.date);
        if (d) dates.add(d);
    });
    if (dates.size === 0) {
        appState.bets.forEach(bet => {
            const d = getBetDate(bet);
            if (d) dates.add(d);
        });
    }
    return [...dates].sort().reverse();
};

/** @param {string | undefined} dateStr */
function safeFormatDate(dateStr) {
    if (!dateStr) return null;
    try {
        let d;
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const [datePart] = dateStr.split(' ');
            const [year, month, day] = datePart.split('/');
            d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-').map(Number);
            d = new Date(year, month - 1, day);
        } else {
            d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return null;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch { return null; }
}

/**
 * @param {Bet} bet
 * @returns {string | null}
 */
export function getBetDate(bet) {
    if (bet.type === 'score' && appState.matches.length > 0) {
        const match = findMatchForBet(bet, appState.matches);
        if (match) return safeFormatDate(match.date);
    }
    return safeFormatDate(bet.timestamp);
}

/** @type {() => Map<string, number>} */
export const matchesPerDate = () => {
    const map = new Map();
    if (appState.matches.length > 0) {
        appState.matches.forEach(match => {
            const d = safeFormatDate(match.date);
            if (d) {
                map.set(d, (map.get(d) || 0) + 1);
            }
        });
    } else {
        appState.bets.forEach(bet => {
            const d = getBetDate(bet);
            if (d) {
                map.set(d, (map.get(d) || 0) + 1);
            }
        });
    }
    return map;
};

/** @type {() => Map<string, number>} */
export const finishedMatchesPerDate = () => {
    const map = new Map();
    if (appState.matches.length > 0) {
        appState.matches.forEach(match => {
            const d = safeFormatDate(match.date);
            if (d && match.homeScore !== null) {
                map.set(d, (map.get(d) || 0) + 1);
            }
        });
    }
    return map;
};

/** @type {(date: string) => { hasAllBets: boolean, missing: string[], malformed: string[], participants: string[], totalMatches: number, finishedMatches: number }} */
export const validateDateBets = (date) => {
    const dateBets = appState.bets.filter(bet => {
        const d = getBetDate(bet);
        return d === date;
    });

    const allParticipants = [...new Set(appState.bets.map(b => b.participant))].sort();
    const matchesOnDate = appState.matches.filter(m => {
        const mDate = safeFormatDate(m.date);
        if (!mDate) return false;
        return mDate === date;
    });

    const totalMatches = matchesOnDate.length;
    const finishedMatches = matchesOnDate.filter(m => m.homeScore !== null).length;
    const missing = [];
    const malformed = [];

    for (const participant of allParticipants) {
        const participantBets = dateBets.filter(b => b.participant === participant && b.type === 'score');
        if (participantBets.length < totalMatches) {
            missing.push(participant);
        } else {
            const hasMalformed = participantBets.some(b => isBetPotentiallyMalformed(b));
            if (hasMalformed) {
                malformed.push(participant);
            }
        }
    }

    return {
        hasAllBets: missing.length === 0 && malformed.length === 0,
        missing,
        malformed,
        participants: allParticipants,
        totalMatches,
        finishedMatches
    };
};

/** @param {Bet} bet */
export function isBetPotentiallyMalformed(bet) {
    if (bet.type === 'score') {
        if (!bet.prediction?.homeTeam || !bet.prediction?.awayTeam) return true;
        if (!bet.prediction?.homeScore && bet.prediction?.homeScore !== 0) return true;
        if (!bet.prediction?.awayScore && bet.prediction?.awayScore !== 0) return true;
        if (bet.prediction.homeTeam.length < 2 || bet.prediction.awayTeam.length < 2) return true;
    }
    if (bet.type === 'champion' || bet.type === 'runnerup') {
        if (!bet.prediction?.champion && !bet.prediction?.runnerup) return true;
    }
    if (bet.type === 'topscorer') {
        if (!bet.prediction?.topscorer) return true;
    }
    return false;
}

export const filteredBets = () => {
    /** @type {Bet[]} */
    let result = appState.bets.filter(bet => {
        if (appState.filters.participant && bet.participant !== appState.filters.participant) return false;
        if (appState.filters.status && bet.status !== appState.filters.status) return false;
        if (appState.filters.type && bet.type !== appState.filters.type) return false;
        if (appState.filters.date) {
            const betDate = getBetDate(bet);
            if (betDate !== appState.filters.date) return false;
        }
        if (appState.filters.search) {
            const search = appState.filters.search.toLowerCase();
            const text = (bet.bet_text + ' ' + bet.participant).toLowerCase();
            if (!text.includes(search)) return false;
        }
        return true;
    });

    result.sort((a, b) => {
        switch (appState.filters.sort) {
            case 'timestamp-desc':
                return (b.timestamp || '').localeCompare(a.timestamp || '');
            case 'timestamp-asc':
                return (a.timestamp || '').localeCompare(b.timestamp || '');
            case 'points-desc':
                return (b.points || 0) - (a.points || 0);
            case 'participant':
                return (a.participant || '').localeCompare(b.participant || '');
            default:
                return 0;
        }
    });

    return result;
};

export const stats = () => {
    const total = appState.bets.length;
    const pending = appState.bets.filter(b => b.status === 'pending').length;
    const exact = appState.bets.filter(b => b.status === 'exact').length;
    const correct = appState.bets.filter(b => b.status === 'correct').length;
    const incorrect = appState.bets.filter(b => b.status === 'incorrect').length;
    const points = appState.bets.reduce((sum, b) => sum + (b.points || 0), 0);

    return { total, pending, exact, correct, incorrect, points };
};

export const participants = () => {
    return [...new Set(appState.bets.map(b => b.participant))].sort();
};

/**
 * @param {Bet} bet
 * @param {Match[]} matches
 */
export function findMatchForBet(bet, matches) {
    if (bet.type !== 'score') return null;

    const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
    const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');

    console.log('findMatchForBet:', { homeNorm, awayNorm, matchesCount: matches.length });

    for (const match of matches) {
        const mHomeNorm = normalizeTeamName(match.homeTeam);
        const mAwayNorm = normalizeTeamName(match.awayTeam);
        const mHomeShort = normalizeTeamName(match.homeShort);
        const mAwayShort = normalizeTeamName(match.awayShort);

        console.log('Comparing:', { homeNorm, awayNorm, mHomeNorm, mAwayNorm });

        if ((homeNorm === mHomeNorm || homeNorm === mHomeShort) &&
            (awayNorm === mAwayNorm || awayNorm === mAwayShort)) {
            console.log('Match found!');
            return match;
        }

        // Try inverted in case of order issues in message
        if ((homeNorm === mAwayNorm || homeNorm === mAwayShort) &&
            (awayNorm === mHomeNorm || awayNorm === mHomeShort)) {
            console.log('Match found (inverted)!');
            return match;
        }
    }

    console.log('No match found');
    return null;
}

/** @param {string} original @param {string} alias */
export function setParticipantAlias(original, alias) {
    if (alias && alias.trim()) {
        appState.participantAliases[original] = alias.trim();
    } else {
        delete appState.participantAliases[original];
    }
}

/** @param {string} original @returns {string} */
export function getParticipantAlias(original) {
    return appState.participantAliases[original] || original;
}

/** @returns {Record<string, string>} */
export function getAllParticipantAliases() {
    return { ...appState.participantAliases };
}
