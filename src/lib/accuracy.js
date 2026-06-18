/** @typedef {import('./types.js').Bet} Bet */
/** @typedef {import('./types.js').ParticipantAccuracy} ParticipantAccuracy */
/** @typedef {import('./types.js').SpecialPrediction} SpecialPrediction */
/** @typedef {import('./types.js').SpecialTallies} SpecialTallies */

/**
 * Cálculo global: total, exactas, correctas, erradas, pendientes y puntos
 * ya otorgados. Se calcula desde un array cualquiera de apuestas (la
 * deduplicación por cruce la hace el caller — usualmente uniqueBets()).
 * @param {Bet[]} bets
 */
export function globalAccuracy(bets) {
    let total = 0;
    let exact = 0;
    let correct = 0;
    let incorrect = 0;
    let pending = 0;
    let points = 0;
    let resolved = 0;
    for (const b of bets) {
        if (!b) continue;
        total++;
        const status = b.status;
        if (status === 'exact') {
            exact++;
            resolved++;
        } else if (status === 'correct') {
            correct++;
            resolved++;
        } else if (status === 'incorrect') {
            incorrect++;
            resolved++;
        } else {
            pending++;
        }
        if (status !== 'pending') points += Number(b.points) || 0;
    }
    const accuracyPct = resolved ? +(100 * (exact + correct) / resolved).toFixed(1) : 0;
    const exactPct = resolved ? +(100 * exact / resolved).toFixed(1) : 0;
    return { total, exact, correct, incorrect, pending, points, resolved, accuracyPct, exactPct };
}

/**
 * Precisión por participante. Devuelve array ordenado por puntos
 * descendentes.
 * @param {Bet[]} bets
 * @returns {ParticipantAccuracy[]}
 */
export function participantAccuracy(bets) {
    const map = new Map();
    for (const b of bets) {
        if (!b) continue;
        const name = b.participant || '(sin nombre)';
        let entry = map.get(name);
        if (!entry) {
            entry = {
                participant: name,
                points: 0,
                resolved: 0,
                exact: 0,
                correct: 0,
                incorrect: 0,
                pending: 0,
                exactPct: 0,
                correctPct: 0,
                incorrectPct: 0,
                accuracyPct: 0
            };
            map.set(name, entry);
        }
        entry.points += Number(b.points) || 0;
        if (b.status === 'exact') { entry.exact++; entry.resolved++; }
        else if (b.status === 'correct') { entry.correct++; entry.resolved++; }
        else if (b.status === 'incorrect') { entry.incorrect++; entry.resolved++; }
        else { entry.pending++; }
    }
    for (const e of map.values()) {
        e.exactPct = e.resolved ? +(100 * e.exact / e.resolved).toFixed(1) : 0;
        e.correctPct = e.resolved ? +(100 * e.correct / e.resolved).toFixed(1) : 0;
        e.incorrectPct = e.resolved ? +(100 * e.incorrect / e.resolved).toFixed(1) : 0;
        e.accuracyPct = e.resolved ? +(100 * (e.exact + e.correct) / e.resolved).toFixed(1) : 0;
    }
    return [...map.values()].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.accuracyPct !== a.accuracyPct) return b.accuracyPct - a.accuracyPct;
        return a.participant.localeCompare(b.participant);
    });
}

/**
 * Convierte un Map<key,count> en un array SpecialPrediction ordenado por
 * frecuencia descendente, con porcentajes sobre el total.
 * @param {Map<string, number>} counts
 * @param {number} total
 * @param {number} limit
 * @returns {SpecialPrediction[]}
 */
function tallyToList(counts, total, limit) {
    if (!total) return [];
    return [...counts.entries()]
        .map(([value, count]) => ({
            value,
            count,
            pct: +(100 * count / total).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, limit);
}

/**
 * Cuenta los favoritos del grupo para las apuestas tipo "champion",
 * "runnerup" y "topscorer". Solo cuenta apuestas donde la predicción
 * es un valor no vacío y la apuesta tiene tipo correspondiente.
 * @param {Bet[]} bets
 * @param {number} limit
 * @returns {SpecialTallies}
 */
export function specialBetTallies(bets, limit = 5) {
    /** @type {Map<string, number>} */
    const champion = new Map();
    /** @type {Map<string, number>} */
    const runnerup = new Map();
    /** @type {Map<string, number>} */
    const topscorer = new Map();
    let cTotal = 0, rTotal = 0, tTotal = 0;

    for (const b of bets) {
        if (!b) continue;
        const p = b.prediction || {};
        if (b.type === 'champion' && p.champion) {
            const v = String(p.champion).trim();
            if (v) { champion.set(v, (champion.get(v) || 0) + 1); cTotal++; }
        } else if (b.type === 'runnerup' && p.runnerup) {
            const v = String(p.runnerup).trim();
            if (v) { runnerup.set(v, (runnerup.get(v) || 0) + 1); rTotal++; }
        } else if (b.type === 'topscorer' && p.topscorer) {
            const v = String(p.topscorer).trim();
            if (v) { topscorer.set(v, (topscorer.get(v) || 0) + 1); tTotal++; }
        }
    }

    return {
        champion: tallyToList(champion, cTotal, limit),
        runnerup: tallyToList(runnerup, rTotal, limit),
        topscorer: tallyToList(topscorer, tTotal, limit)
    };
}
