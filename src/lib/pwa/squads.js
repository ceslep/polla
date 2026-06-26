/**
 * Helpers para cargar y procesar las plantillas (squads) del Mundial 2026.
 * Fuente: openfootball/worldcup.json
 */

const SQUADS_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.squads.json';

/** @typedef {{ name: string, fifa_code: string, group: string, players: any[] }} Squad */

/**
 * Carga las plantillas desde openfootball.
 * @returns {Promise<Squad[]>}
 */
export async function loadSquads() {
    const res = await fetch(SQUADS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Error cargando plantillas: ${res.status}`);
    return await res.json();
}

/**
 * Calcula la edad a partir de la fecha de nacimiento.
 * @param {string} dateOfBirth
 * @returns {number}
 */
export function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 0;
    const birth = new Date(dateOfBirth);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

/**
 * Selecciona los 11 titulares según la formación y devuelve suplentes.
 * @param {any[]} players
 * @param {string} formation
 * @returns {{ starters: any[], substitutes: any[], bench: any[] }}
 */
export function selectStarters(players, formation) {
    const byPos = {
        GK: players.filter((p) => p.pos === 'GK').sort((a, b) => a.number - b.number),
        DF: players.filter((p) => p.pos === 'DF').sort((a, b) => a.number - b.number),
        MF: players.filter((p) => p.pos === 'MF').sort((a, b) => a.number - b.number),
        FW: players.filter((p) => p.pos === 'FW').sort((a, b) => a.number - b.number)
    };

    const structure = FORMATION_STRUCTURE[formation] || FORMATION_STRUCTURE['4-3-3'];
    const starters = [];

    // Portero
    starters.push(...byPos.GK.slice(0, structure.GK));
    // Defensas
    starters.push(...byPos.DF.slice(0, structure.DF));
    // Mediocampistas
    starters.push(...byPos.MF.slice(0, structure.MF));
    // Delanteros
    starters.push(...byPos.FW.slice(0, structure.FW));

    const starterIds = new Set(starters.map((p) => p.number));
    const substitutes = players
        .filter((p) => !starterIds.has(p.number))
        .sort((a, b) => a.number - b.number);

    return { starters, substitutes, bench: substitutes };
}

/**
 * Estructura de cada formación: cuántos de cada posición.
 * @type {Record<string, { GK: number, DF: number, MF: number, FW: number }>}
 */
const FORMATION_STRUCTURE = {
    '4-3-3': { GK: 1, DF: 4, MF: 3, FW: 3 },
    '4-4-2': { GK: 1, DF: 4, MF: 4, FW: 2 },
    '3-5-2': { GK: 1, DF: 3, MF: 5, FW: 2 },
    '5-3-2': { GK: 1, DF: 5, MF: 3, FW: 2 },
    '4-2-3-1': { GK: 1, DF: 4, MF: 2, FW: 1 }, // 2 + 3 = 5 MF
    '4-5-1': { GK: 1, DF: 4, MF: 5, FW: 1 }
};

/**
 * Devuelve la lista de formaciones disponibles.
 * @returns {string[]}
 */
export function getFormations() {
    return Object.keys(FORMATION_STRUCTURE);
}

/**
 * Coordenadas porcentuales (x, y) para cada una de las 11 posiciones de la formación.
 * x: 0 izquierda, 100 derecha. y: 0 arriba (ataque), 100 abajo (portería).
 * @param {string} formation
 * @returns {Array<{x: number, y: number}>}
 */
export function getFormationCoords(formation) {
    return FORMATION_COORDS[formation] || FORMATION_COORDS['4-3-3'];
}

/**
 * @type {Record<string, Array<{x: number, y: number}>>}
 */
const FORMATION_COORDS = {
    '4-3-3': [
        { x: 50, y: 90 }, // GK
        { x: 15, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 85, y: 70 }, // DF
        { x: 25, y: 48 }, { x: 50, y: 52 }, { x: 75, y: 48 }, // MF
        { x: 20, y: 22 }, { x: 50, y: 18 }, { x: 80, y: 22 } // FW
    ],
    '4-4-2': [
        { x: 50, y: 90 }, // GK
        { x: 15, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 85, y: 70 }, // DF
        { x: 15, y: 50 }, { x: 38, y: 50 }, { x: 62, y: 50 }, { x: 85, y: 50 }, // MF
        { x: 35, y: 22 }, { x: 65, y: 22 } // FW
    ],
    '3-5-2': [
        { x: 50, y: 90 }, // GK
        { x: 25, y: 72 }, { x: 50, y: 72 }, { x: 75, y: 72 }, // DF
        { x: 15, y: 55 }, { x: 35, y: 48 }, { x: 50, y: 55 }, { x: 65, y: 48 }, { x: 85, y: 55 }, // MF
        { x: 35, y: 22 }, { x: 65, y: 22 } // FW
    ],
    '5-3-2': [
        { x: 50, y: 90 }, // GK
        { x: 10, y: 70 }, { x: 30, y: 72 }, { x: 50, y: 74 }, { x: 70, y: 72 }, { x: 90, y: 70 }, // DF
        { x: 25, y: 48 }, { x: 50, y: 50 }, { x: 75, y: 48 }, // MF
        { x: 35, y: 22 }, { x: 65, y: 22 } // FW
    ],
    '4-2-3-1': [
        { x: 50, y: 90 }, // GK
        { x: 15, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 85, y: 70 }, // DF
        { x: 35, y: 55 }, { x: 65, y: 55 }, // MF defensivos
        { x: 20, y: 38 }, { x: 50, y: 38 }, { x: 80, y: 38 }, // MF ofensivos
        { x: 50, y: 20 } // FW
    ],
    '4-5-1': [
        { x: 50, y: 90 }, // GK
        { x: 15, y: 70 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 85, y: 70 }, // DF
        { x: 12, y: 52 }, { x: 31, y: 48 }, { x: 50, y: 52 }, { x: 69, y: 48 }, { x: 88, y: 52 }, // MF
        { x: 50, y: 22 } // FW
    ]
};
