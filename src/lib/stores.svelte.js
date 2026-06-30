import { normalizeTeamName } from './parser.js';
import { saveBetsToSheets } from './api.js';

/** @typedef {import('./types.js').Bet} Bet */
/** @typedef {import('./types.js').Match} Match */

/** Puntuación mínima para aparecer en tablas de ranking y mensajes. */
export const MIN_POINTS_THRESHOLD = 13;

/** @type {{ bets: Bet[], matches: Match[], allMatches: Match[], isLoading: boolean, saving: boolean, sheetsUnavailable: boolean, filters: { participant: string, status: string, search: string, sort: string, type: string, date: string }, participantAliases: Record<string, string> }} */
export const appState = $state({
    bets: [],
    matches: [],
    allMatches: [],
    isLoading: false,
    saving: false,
    sheetsUnavailable: false,
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

/**
 * Clave canónica de "cruce único" para deduplicar apuestas de un mismo
 * participante sobre el mismo partido. Score usa (participante + equipos
 * normalizados); los demás tipos (campeón/subcampeón/goleador) usan
 * (participante + tipo) porque no hay dos equipos.
 * @param {Bet} bet
 * @returns {string}
 */
export function betKey(bet) {
    const p = (bet.participant || '').toLowerCase().trim();
    const t = bet.type || '';
    if (t === 'score') {
        const pred = bet.prediction || {};
        // Acepta tanto bets anidados (prediction.homeTeam) como filas planas
        // de Sheets (homeTeam/awayTeam en el top-level con prediction vacío).
        // Los campos top-level NO están en el typedef de Bet pero existen
        // en el shape que devuelve `loadBetsFromSheets`.
        const rawHome = /** @type {any} */ (bet).homeTeam || pred.homeTeam || '';
        const rawAway = /** @type {any} */ (bet).awayTeam || pred.awayTeam || '';
        const h = normalizeTeamName(rawHome).toLowerCase();
        const a = normalizeTeamName(rawAway).toLowerCase();
        // Orden estable (home, away) → no genera duplicados si una versión
        // trae los equipos invertidos respecto a otra.
        const teams = [h, a].sort().join('|');
        return `${p}|score|${teams}`;
    }
    return `${p}|${t}`;
}

/**
 * Reglas de prioridad cuando dos apuestas colisionan en betKey: conservar
 * la entrada "más fiable" para scoring. Orden de preferencia:
 *   1. manuallyEdited (corrección explícita del usuario gana)
 *   2. points más altos (la ya calificada gana sobre la pendiente)
 *   3. status !== 'pending' (si empatan en puntos, la calificada gana)
 *   4. orden original (preservar orden estable de aparición)
 * @param {Bet} prev
 * @param {Bet} next
 * @returns {boolean}
 */
function shouldReplace(prev, next) {
    const pm = !!prev.manuallyEdited;
    const nm = !!next.manuallyEdited;
    if (pm !== nm) return nm; // true > false

    const pp = Number(prev.points) || 0;
    const np = Number(next.points) || 0;
    if (pp !== np) return np > pp;

    const ps = prev.status === 'pending' ? 0 : 1;
    const ns = next.status === 'pending' ? 0 : 1;
    return ns > ps;
}

/**
 * Devuelve appState.bets deduplicado por cruce único. Las vistas que
 * muestran puntos o conteos por participante deben usar este helper en
 * lugar de iterar appState.bets directamente, para evitar que un mismo
 * partido sume puntos dos veces (causa histórica: Sheets acumulaba filas
 * con messageIds distintos y el parser producía 2 entradas para el mismo
 * contenido). El array original NO se muta.
 * @type {() => Bet[]}
 */
export const uniqueBets = () => {
    const seen = new Map();
    for (const bet of appState.bets) {
        if (!bet) continue;
        const key = betKey(bet);
        const prev = seen.get(key);
        if (!prev || shouldReplace(prev, bet)) seen.set(key, bet);
    }
    return [...seen.values()];
};

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
export function safeFormatDate(dateStr) {
    if (!dateStr) return null;
    try {
        let d;
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const [datePart] = dateStr.split(' ');
            const parts = datePart.split('/');
            if (parts[0].length === 4) {
                const [year, month, day] = parts;
                d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else {
                const [day, month, year] = parts;
                d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }
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
    const unique = uniqueBets();
    const dateBets = unique.filter(bet => {
        const d = getBetDate(bet);
        return d === date;
    });

    const allParticipants = [...new Set(unique.map(b => b.participant))].sort();
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
    let result = uniqueBets().filter(bet => {
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
        // Ocultar apuestas de score cuyos equipos no forman un partido real en ninguna fecha.
        // Las apuestas de partidos existentes (aunque sea fecha equivocada o aún sin jugar)
        // sí se muestran.
        if (bet.type === 'score' && !teamsMatchAnyDate(bet, appState.allMatches)) {
            return false;
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
                return (Number(b.points) || 0) - (Number(a.points) || 0);
            case 'participant':
                return (a.participant || '').localeCompare(b.participant || '');
            default:
                return 0;
        }
    });

    return result;
};

export const stats = () => {
    const bets = uniqueBets();
    const total = bets.length;
    const pending = bets.filter(b => b.status === 'pending').length;
    const exact = bets.filter(b => b.status === 'exact').length;
    const correct = bets.filter(b => b.status === 'correct').length;
    const incorrect = bets.filter(b => b.status === 'incorrect').length;
    const points = bets.filter(b => b.status !== 'pending').reduce((sum, b) => sum + (Number(b.points) || 0), 0);

    return { total, pending, exact, correct, incorrect, points };
};

/**
 * Ordena por timestamp descendente (más reciente primero). Locale-safe:
 * el formato "2026/6/17 07:03:05" ordena lexicográficamente igual que
 * cronológicamente porque año/mes/día tienen ancho fijo. Devuelve un array
 * NUEVO (no muta). Si dos elementos comparten timestamp, preserva el orden
 * de inserción (estable). Cada elemento debe tener un campo `timestamp`
 * (string) — funciona con `Bet` y con cualquier objeto agrupado por mensaje.
 * @template {{ timestamp?: string }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export const sortByTimestampDesc = (items) => {
    return [...items].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
};

export const participants = () => {
    return [...new Set(uniqueBets().map(b => b.participant))].sort();
};

/**
 * Suma de puntos por participante (sólo apuestas con status !== 'pending',
 * consistente con calculateWinners). Sirve como fuente única de la
 * puntuación total a usar en filtros y rankings.
 * @type {() => Map<string, number>}
 */
export const participantPoints = () => {
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const bet of uniqueBets()) {
        if (bet.status === 'pending') continue;
        map.set(bet.participant, (map.get(bet.participant) || 0) + (Number(bet.points) || 0));
    }
    return map;
};

/**
 * Conjunto de participantes cuya puntuación total alcanza el umbral mínimo
 * (MIN_POINTS_THRESHOLD). Usar en lugar de participants() cuando se quiere
 * ocultar a los participantes con bajo rendimiento de tablas de ranking y
 * mensajes. Las apuestas individuales NO se filtran; este helper sólo
 * decide qué participantes mostrar.
 * @type {() => Set<string>}
 */
export const qualifyingParticipants = () => {
    const out = new Set();
    for (const [name, pts] of participantPoints()) {
        if (pts >= MIN_POINTS_THRESHOLD) out.add(name);
    }
    return out;
};

/**
 * @param {Bet} bet
 * @param {Match[]} matches
 */
export function findMatchForBet(bet, matches) {
    if (bet.type !== 'score') return null;
    if (!bet.prediction) return null;

    const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
    const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');

    // La fecha del partido debe coincidir con el día en que se envió la apuesta.
    // Si no coinciden, el cruce no concuerda con la fecha → no se empareja
    // (no califica y queda oculto del listado).
    const betDay = safeFormatDate(bet.timestamp);

    for (const match of matches) {
        const mHomeNorm = normalizeTeamName(match.homeTeam);
        const mAwayNorm = normalizeTeamName(match.awayTeam);
        const mHomeShort = normalizeTeamName(match.homeShort);
        const mAwayShort = normalizeTeamName(match.awayShort);

        const teamsMatch =
            ((homeNorm === mHomeNorm || homeNorm === mHomeShort) &&
             (awayNorm === mAwayNorm || awayNorm === mAwayShort)) ||
            // Invertido por si el orden local/visitante difiere en el mensaje.
            ((homeNorm === mAwayNorm || homeNorm === mAwayShort) &&
             (awayNorm === mHomeNorm || awayNorm === mHomeShort));

        if (!teamsMatch) continue;

        const matchDay = safeFormatDate(match.date);
        if (betDay && matchDay && betDay !== matchDay) continue;

        return match;
    }

    return null;
}

const FUZZY_MAX_DISTANCE = 2;

/** @param {string} a @param {string} b @returns {number} */
function levenshtein(a, b) {
    const sa = (a || '').toLowerCase();
    const sb = (b || '').toLowerCase();
    if (sa === sb) return 0;
    if (!sa.length) return sb.length;
    if (!sb.length) return sa.length;
    const m = sa.length;
    const n = sb.length;
    const prev = new Array(n + 1);
    /** @type {number[]} */
    const curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        for (let j = 0; j <= n; j++) prev[j] = curr[j];
    }
    return prev[n];
}

/**
 * Fallback cuando findMatchForBet devuelve null: busca un partido del mismo
 * día cuyos nombres de equipo estén a distancia Levenshtein ≤ FUZZY_MAX_DISTANCE
 * de los de la apuesta. Sirve para sugerir "Austria 2 - Turkey 1" → "Australia
 * 2 - 0 Turkey" cuando el participante omitió letras al escribir.
 * Sólo sugiere si AMBOS equipos emparejan dentro del umbral; si hay varios
 * candidatos, devuelve el de menor suma de distancias. No muta nada.
 * @param {Bet} bet
 * @param {Match[]} matches
 * @returns {{ match: Match, distance: number } | null}
 */
export function findMatchSuggestion(bet, matches) {
    if (bet.type !== 'score') return null;
    if (!bet.prediction) return null;
    const home = bet.prediction.homeTeam || '';
    const away = bet.prediction.awayTeam || '';
    if (!home || !away) return null;

    const betDay = safeFormatDate(bet.timestamp);
    let best = /** @type {Match | null} */ (null);
    let bestDist = Infinity;

    for (const match of matches) {
        if (betDay && safeFormatDate(match.date) !== betDay) continue;
        const homes = [match.homeTeam, match.homeShort].filter(Boolean);
        const aways = [match.awayTeam, match.awayShort].filter(Boolean);
        for (const invert of [false, true]) {
            const candH = invert ? aways : homes;
            const candA = invert ? homes : aways;
            for (const ch of candH) {
                for (const ca of candA) {
                    const dh = levenshtein(home, ch);
                    const da = levenshtein(away, ca);
                    if (dh <= FUZZY_MAX_DISTANCE && da <= FUZZY_MAX_DISTANCE) {
                        const total = dh + da;
                        if (total < bestDist) {
                            bestDist = total;
                            best = match;
                        }
                    }
                }
            }
        }
    }

    return best ? { match: best, distance: bestDist } : null;
}

/**
 * ¿Los equipos de la apuesta forman un partido real del calendario, en cualquier
 * fecha? Sirve para distinguir "cruce equivocado de fecha" (existe pero otro día →
 * se oculta) de "equipo no reconocido / partido inexistente" (se muestra pendiente).
 * @param {Bet} bet
 * @param {Match[]} matches
 * @returns {boolean}
 */
export function teamsMatchAnyDate(bet, matches) {
    if (bet.type !== 'score') return false;

    const homeNorm = normalizeTeamName(bet.prediction.homeTeam || '');
    const awayNorm = normalizeTeamName(bet.prediction.awayTeam || '');

    return matches.some(match => {
        const mHomeNorm = normalizeTeamName(match.homeTeam);
        const mAwayNorm = normalizeTeamName(match.awayTeam);
        const mHomeShort = normalizeTeamName(match.homeShort);
        const mAwayShort = normalizeTeamName(match.awayShort);

        return (
            ((homeNorm === mHomeNorm || homeNorm === mHomeShort) &&
             (awayNorm === mAwayNorm || awayNorm === mAwayShort)) ||
            ((homeNorm === mAwayNorm || homeNorm === mAwayShort) &&
             (awayNorm === mHomeNorm || awayNorm === mHomeShort))
        );
    });
}

/**
 * Filter bets to only those that have a corresponding real match
 * @param {Bet[]} bets
 * @param {Match[]} matches
 * @returns {Bet[]}
 */
export function filterBetsWithRealMatches(bets, matches) {
    return bets.filter(bet => {
        if (bet.type !== 'score') return true;
        return findMatchForBet(bet, matches) !== null;
    });
}

/** @param {string} original @param {string} alias */
export function setParticipantAlias(original, alias) {
    if (alias && alias.trim()) {
        appState.participantAliases[original] = alias.trim();
    } else {
        delete appState.participantAliases[original];
    }
}

/**
 * Aplica la sugerencia fuzzy de un bet: reemplaza homeTeam/awayTeam por los
 * del partido sugerido, marca manuallyEdited y limpia la sugerencia. NO
 * re-analiza — el caller debe invocar analyzeBets() si quiere recalcular
 * el status contra el resultado real. Persiste el cambio en Google Sheets.
 * @param {string} betId
 * @returns {Promise<void>}
 */
export async function applyMatchSuggestion(betId) {
    const bet = appState.bets.find(b => b.id === betId);
    if (!bet || !bet.suggestedMatch) return;
    const updated = {
        ...bet,
        prediction: {
            ...bet.prediction,
            homeTeam: bet.suggestedMatch.homeTeam,
            awayTeam: bet.suggestedMatch.awayTeam
        },
        manuallyEdited: true,
        suggestedMatch: null
    };
    appState.bets = appState.bets.map(b => b.id === betId ? updated : b);
    if (appState.sheetsUnavailable) return;
    appState.saving = true;
    try {
        await saveBetsToSheets(appState.bets);
    } catch (err) {
        appState.sheetsUnavailable = true;
        console.error('Error guardando sugerencia aplicada en Sheets:', err);
    } finally {
        appState.saving = false;
    }
}

/**
 * @param {string} betId
 * @returns {Promise<void>}
 */
export async function dismissMatchSuggestion(betId) {
    const bet = appState.bets.find(b => b.id === betId);
    if (!bet || !bet.suggestedMatch) return;
    appState.bets = appState.bets.map(b => b.id === betId ? { ...b, suggestedMatch: null } : b);
    if (appState.sheetsUnavailable) return;
    appState.saving = true;
    try {
        await saveBetsToSheets(appState.bets);
    } catch (err) {
        appState.sheetsUnavailable = true;
        console.error('Error guardando sugerencia descartada en Sheets:', err);
    } finally {
        appState.saving = false;
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

/**
 * Fecha más reciente con partidos finalizados (o null si no hay ninguno).
 * @param {Match[]} matches
 * @returns {string | null}
 */
export function getLatestFinishedDate(matches) {
    const finished = matches.filter(m => m.homeScore !== null && m.awayScore !== null);
    if (finished.length === 0) return null;
    return finished.map(m => m.date).sort().reverse()[0];
}

/**
 * @typedef {{ participant: string, prevRank: number|null, currRank: number,
 *              prevPoints: number, currPoints: number,
 *              kind: 'up'|'down'|'same'|'new' }} Movement
 */

/**
 * Calcula el movimiento de cada participante comparando el ranking "antes de
 * ayer" (snapshot A: solo apuestas cuyo partido es anterior a la última fecha
 * con resultados) contra el ranking actual (snapshot B = currentWinners).
 * "Ayer" = última fecha con partidos finalizados.
 * @param {Bet[]} bets
 * @param {Match[]} matches
 * @param {Array<{participant: string, points: number, rank: number}>} currentWinners
 * @returns {Movement[]}
 */
export function computeMovement(bets, matches, currentWinners) {
    const yesterday = getLatestFinishedDate(matches);
    if (!yesterday) return [];

    /** @type {Map<string, number>} */
    const pointsBefore = new Map();
    for (const bet of bets) {
        if (bet.type !== 'score' || bet.status === 'pending') continue;
        const points = Number(bet.points) || 0;
        if (points === 0) continue;
        const pred = bet.prediction || {};
        const h = normalizeTeamName(pred.homeTeam || '');
        const a = normalizeTeamName(pred.awayTeam || '');
        if (!h || !a) continue;
        const match = matches.find(m => {
            const mHome = m.homeTeam;
            const mAway = m.awayTeam;
            const mHomeShort = normalizeTeamName(m.homeShort || '');
            const mAwayShort = normalizeTeamName(m.awayShort || '');
            return (
                ((mHome === h || mHomeShort === h) && (mAway === a || mAwayShort === a)) ||
                ((mHome === a || mHomeShort === a) && (mAway === h || mAwayShort === h))
            );
        });
        if (!match || !match.date) continue;
        if (match.date >= yesterday) continue;
        pointsBefore.set(bet.participant, (pointsBefore.get(bet.participant) || 0) + points);
    }

    const sortedA = [...pointsBefore.entries()].sort((a, b) => b[1] - a[1]);
    /** @type {Map<string, number>} */
    const rankA = new Map();
    sortedA.forEach(([p], i) => rankA.set(p, i + 1));

    return currentWinners.map(w => {
        const prevRank = rankA.get(w.participant) ?? null;
        const prevPoints = pointsBefore.get(w.participant) ?? 0;
        /** @type {'up'|'down'|'same'|'new'} */
        let kind;
        if (prevRank === null) kind = 'new';
        else if (w.rank < prevRank) kind = 'up';
        else if (w.rank > prevRank) kind = 'down';
        else kind = 'same';
        return {
            participant: w.participant,
            prevRank,
            currRank: w.rank,
            prevPoints,
            currPoints: w.points,
            kind
        };
    });
}
