/** @typedef {import('./types.js').FifaRankings} FifaRankings */

const PRIMARY_URL = 'https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php';
const FALLBACK_URL = './fifa_rankings.json';

/**
 * @param {any} data
 * @returns {FifaRankings}
 */
function normalize(data) {
    const rankings = Array.isArray(data?.rankings)
        ? data.rankings
            .filter(/** @param {any} r */ r => r && typeof r.team === 'string' && typeof r.rank === 'number')
            .map(/** @param {any} r */ r => ({
                rank: r.rank,
                team: r.team,
                points: Number(r.points) || 0,
                confederation: typeof r.confederation === 'string' ? r.confederation : undefined,
                previousPoints: typeof r.previousPoints === 'number' ? r.previousPoints : undefined,
                change: typeof r.change === 'number' ? r.change : 0
            }))
            .sort((/** @type {any} */ a, /** @type {any} */ b) => a.rank - b.rank)
        : [];
    return {
        updated: typeof data?.updated === 'string' ? data.updated : null,
        source: typeof data?.source === 'string' ? data.source : 'https://www.fifa.com/es/world-rankings',
        rankings
    };
}

/**
 * Carga el ranking FIFA masculino. Orden de preferencia:
 *   1. Endpoint PHP (cache vivo en el host)
 *   2. JSON estático en public/fifa_rankings.json (fallback offline)
 * Si ambos fallan, devuelve un objeto con `rankings: []` para que la UI
 * oculte limpiamente la sección.
 * @returns {Promise<FifaRankings>}
 */
export async function loadFifaRankings() {
    try {
        const res = await fetch(PRIMARY_URL, {
            headers: { Accept: 'application/json' },
            cache: 'no-cache'
        });
        if (res.ok) {
            const data = await res.json();
            return normalize(data);
        }
    } catch (err) {
        console.warn('loadFifaRankings: PHP unreachable, trying local fallback', err);
    }
    try {
        const res = await fetch(FALLBACK_URL, { cache: 'no-cache' });
        if (!res.ok) return { updated: null, source: 'https://www.fifa.com/es/world-rankings', rankings: [] };
        const data = await res.json();
        return normalize(data);
    } catch (err) {
        console.warn('loadFifaRankings: local fallback failed', err);
        return { updated: null, source: 'https://www.fifa.com/es/world-rankings', rankings: [] };
    }
}
