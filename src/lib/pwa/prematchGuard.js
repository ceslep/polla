/**
 * prematchGuard.js — Gate de contraseña para vistas pre-partido
 *
 * La contraseña "polla2026" protege `PwaTodayBets` y `PwaShareBets` desde
 * las 00:00 COT del día hasta 1 minuto antes del kickoff del primer
 * partido del día (en COT). Ese corte coincide con la regla de la
 * ventana de apuestas (`closeAt` en `window.js:127`): la ventana de
 * apostar cierra 1 minuto antes del primer partido, y el gate de clave
 * se desactiva en el mismo instante.
 *
 * Si no hay partidos para el día, `getFirstMatchUtcMs` devuelve `null`
 * y `isPreMatch` devuelve `false` — no hay nada que proteger.
 *
 * Sin persistencia: el unlock vive como `$state` local en cada
 * componente, así que al desmontar (back / cerrar modal) se olvida.
 *
 * NOTA de seguridad: la contraseña está hardcoded en el bundle JS. Es
 * un disuasorio, no un límite de seguridad real — el backend de Sheets
 * es público y cualquiera con la URL puede ver los datos directamente.
 * El gate es UX (evitar publicar accidentalmente las apuestas antes de
 * que empiecen los partidos).
 */

import { matchLocalToCot } from './window.js';

export const PREMATCH_PASSWORD = 'polla2026';

/** Margen antes del kickoff en el que el gate sigue activo (1 minuto). */
export const PREMATCH_BUFFER_MS = 60_000;

/**
 * Devuelve el epoch ms (UTC) del primer partido del día COT indicado.
 * `null` si no hay partidos para ese día.
 *
 * Importante: el array de openfootball NO está ordenado por hora COT
 * (viene por estadio/grupo). Hay que iterar y comparar, no tomar el
 * primer elemento.
 *
 * @param {Array<{date: string, time: string}>} matches
 * @param {string} cotDate - 'YYYY-MM-DD' (en COT)
 * @returns {number | null}
 */
export function getFirstMatchUtcMs(matches, cotDate) {
    if (!Array.isArray(matches) || !cotDate) return null;
    let first = null;
    for (const m of matches) {
        const cot = matchLocalToCot(m.date, m.time);
        if (cot && cot.cotDate === cotDate) {
            if (first === null || cot.utcMs < first) {
                first = cot.utcMs;
            }
        }
    }
    return first;
}

/**
 * True si todavía no se cumplió el cutoff pre-partido.
 *
 * El cutoff es `firstMatchUtcMs - bufferMs`. Con el buffer default de
 * 60_000 ms (1 minuto) el gate se desactiva 1 minuto antes del kickoff.
 *
 * - `isPreMatch(null, ...)` → `false` (no hay primer partido que
 *   proteger — todos los partidos del día ya están finalizados o no
 *   hay ninguno; el caller debe mostrar el contenido sin pedir clave).
 * - `isPreMatch(ts, now, 0)` → `true` mientras `now < ts` (corte
 *   exacto al kickoff; no se usa en prod pero queda disponible).
 *
 * @param {number | null} firstMatchUtcMs
 * @param {number} nowUtcMs
 * @param {number} [bufferMs=PREMATCH_BUFFER_MS]
 * @returns {boolean}
 */
export function isPreMatch(firstMatchUtcMs, nowUtcMs, bufferMs = PREMATCH_BUFFER_MS) {
    if (firstMatchUtcMs == null) return false;
    return nowUtcMs < (firstMatchUtcMs - bufferMs);
}
