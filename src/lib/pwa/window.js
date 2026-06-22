/**
 * window.js - Cálculo de la ventana de apuestas PWA
 *
 * Convención:
 *   - La ventana es por "día COT" (America/Bogota, UTC-5).
 *   - Ventana = [00:00 COT del día, (primer partido del día en COT) - 1 minuto].
 *   - El campo `time` de openfootball viene como "HH:MM UTC±N" (hora del
 *     estadio con offset explícito). Lo convertimos a COT para agrupar.
 *
 * @typedef {Object} RawMatch
 * @property {number} id
 * @property {string} date - "YYYY-MM-DD" (fecha local del estadio)
 * @property {string} time - "HH:MM UTC±N"
 * @property {string} team1
 * @property {string} team2
 * @property {string} [round]
 * @property {string} [ground]
 *
 * @typedef {Object} WindowState
 * @property {'open' | 'closed' | 'upcoming' | 'no-matches'} status
 * @property {string|null} date - 'YYYY-MM-DD' (en COT) de la ventana aplicable
 * @property {string|null} openAt - ISO del inicio
 * @property {string|null} closeAt - ISO del cierre
 * @property {string|null} firstMatchLocalTime - 'HH:MM' en COT del primer partido
 * @property {RawMatch[]|null} matches - partidos del día aplicable
 * @property {string|null} message - descripción legible para mostrar al usuario
 */

const COT_TZ = 'America/Bogota';

/**
 * Parsea "HH:MM UTC±N" o "HH:MM UTC±NN".
 * @param {string} timeStr
 * @returns {{hours: number, minutes: number, offsetMinutes: number} | null}
 */
export function parseTimeWithOffset(timeStr) {
    if (!timeStr) return null;
    const m = String(timeStr).match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})$/);
    if (!m) return null;
    const hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    const offsetHours = parseInt(m[3], 10);
    if (isNaN(hours) || isNaN(minutes) || isNaN(offsetHours)) return null;
    return {
        hours,
        minutes,
        offsetMinutes: offsetHours * 60
    };
}

/**
 * Convierte la fecha+hora local de un partido a un timestamp UTC.
 * Devuelve también el equivalente en hora COT (HH:MM) y la fecha COT (YYYY-MM-DD).
 * @param {string} dateStr - "YYYY-MM-DD"
 * @param {string} timeStr - "HH:MM UTC±N"
 * @returns {{utcMs: number, cotDate: string, cotTime: string, cotDateTime: Date} | null}
 */
export function matchLocalToCot(dateStr, timeStr) {
    const t = parseTimeWithOffset(timeStr);
    if (!t) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    // Construir un Date en UTC que represente el instante local del partido.
    // local = UTC + offset, así que UTC = local - offset.
    const utcMs = Date.UTC(y, mo - 1, d, t.hours, t.minutes, 0) - t.offsetMinutes * 60 * 1000;
    const cotDateTime = new Date(utcMs);
    // COT = UTC-5. Para mostrar en COT usamos Intl con timezone COT.
    const fmtDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const fmtTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: COT_TZ, hour: '2-digit', minute: '2-digit', hour12: false
    });
    const cotDate = fmtDate.format(cotDateTime); // "YYYY-MM-DD"
    const cotTime = fmtTime.format(cotDateTime); // "HH:MM"
    return { utcMs, cotDate, cotTime, cotDateTime };
}

/**
 * Devuelve los partidos de un día COT específico, ordenados por hora COT asc.
 * @param {RawMatch[]} matches
 * @param {string} cotDate - 'YYYY-MM-DD'
 * @returns {RawMatch[]}
 */
export function matchesOnCotDate(matches, cotDate) {
    /** @type {Array<{m: RawMatch, cot: NonNullable<ReturnType<typeof matchLocalToCot>>}>} */
    const withCot = [];
    for (const m of matches) {
        const cot = matchLocalToCot(m.date, m.time);
        if (cot && cot.cotDate === cotDate) {
            withCot.push({ m, cot });
        }
    }
    withCot.sort((a, b) => a.cot.utcMs - b.cot.utcMs);
    return withCot.map(x => x.m);
}

/**
 * Calcula el estado de la ventana PWA para "ahora" en COT.
 * @param {RawMatch[]} matches
 * @param {Date} [now] - inyectable para tests
 * @returns {WindowState}
 */
export function computeWindowState(matches, now) {
    const _now = now || new Date();

    // Construir mapa de días COT que tienen al menos un partido.
    /** @type {Map<string, {firstMatch: RawMatch, firstMatchUtcMs: number, firstCotTime: string, openMs: number, closeMs: number}>} */
    const days = new Map();

    for (const m of matches || []) {
        const cot = matchLocalToCot(m.date, m.time);
        if (!cot) continue;
        const existing = days.get(cot.cotDate);
        // Reemplazar si no hay entrada previa, o si este match es más
        // temprano en COT. El JSON de openfootball NO está ordenado por
        // hora COT (viene por estadio/grupo): el 22 jun 2026 listaba
        // France (16:00 COT) antes que Argentina (12:00 COT).
        if (!existing || cot.utcMs < existing.firstMatchUtcMs) {
            // open = inicio del día COT (00:00 COT)
            const [y, mo, d] = cot.cotDate.split('-').map(Number);
            // Construir el epoch ms para 00:00 COT de ese día:
            // En COT son las 00:00, así que en UTC son las 05:00.
            const openMs = Date.UTC(y, mo - 1, d, 5, 0, 0);
            // close = primer partido en COT menos 1 minuto
            const [h, mi] = cot.cotTime.split(':').map(Number);
            const closeMs = openMs + h * 3600 * 1000 + mi * 60 * 1000 - 60 * 1000;
            days.set(cot.cotDate, {
                firstMatch: m,
                firstMatchUtcMs: cot.utcMs,
                firstCotTime: cot.cotTime,
                openMs,
                closeMs
            });
        }
    }

    const nowMs = _now.getTime();

    // ¿La ventana actual está abierta?
    for (const [date, info] of days) {
        if (nowMs >= info.openMs && nowMs <= info.closeMs) {
            const dayMatches = matchesOnCotDate(matches, date);
            return {
                status: 'open',
                date,
                openAt: new Date(info.openMs).toISOString(),
                closeAt: new Date(info.closeMs).toISOString(),
                firstMatchLocalTime: info.firstCotTime,
                matches: dayMatches,
                message: `Apuestas abiertas hasta las ${info.firstCotTime} (hora Colombia).`
            };
        }
    }

    // ¿La ventana de hoy ya cerró?
    const fmtToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayCot = fmtToday.format(_now);
    const todayInfo = days.get(todayCot);
    if (todayInfo && nowMs > todayInfo.closeMs) {
        const dayMatches = matchesOnCotDate(matches, todayCot);
        return {
            status: 'closed',
            date: todayCot,
            openAt: new Date(todayInfo.openMs).toISOString(),
            closeAt: new Date(todayInfo.closeMs).toISOString(),
            firstMatchLocalTime: todayInfo.firstCotTime,
            matches: dayMatches,
            message: `La ventana de hoy (${todayCot}) cerró a las ${todayInfo.firstCotTime}.`
        };
    }

    // Próxima ventana futura
    const future = [...days.entries()]
        .filter(([, info]) => info.openMs > nowMs)
        .sort((a, b) => a[1].openMs - b[1].openMs);
    if (future.length > 0) {
        const [date, info] = future[0];
        return {
            status: 'upcoming',
            date,
            openAt: new Date(info.openMs).toISOString(),
            closeAt: new Date(info.closeMs).toISOString(),
            firstMatchLocalTime: info.firstCotTime,
            matches: null,
            message: `Próxima ventana: ${date} desde las 00:00 hasta las ${info.firstCotTime} (hora Colombia).`
        };
    }

    return {
        status: 'no-matches',
        date: null,
        openAt: null,
        closeAt: null,
        firstMatchLocalTime: null,
        matches: null,
        message: 'No hay partidos próximos en el calendario.'
    };
}

/**
 * True si la fecha COT dada tiene ventana abierta en este momento.
 * Helper para PwaForm que ya conoce la fecha.
 * @param {WindowState} state
 */
export function isWindowOpen(state) {
    return state.status === 'open';
}

/**
 * Construye el "firstMatchTime" HH:MM (en COT) que el backend espera
 * para validar la ventana server-side.
 * @param {WindowState} state
 * @returns {string|null} 'HH:MM' o null si no hay ventana
 */
export function firstMatchTimeCot(state) {
    if (!state || !state.firstMatchLocalTime) return null;
    return state.firstMatchLocalTime;
}

/**
 * COT "ahora" como YYYY-MM-DD HH:MM.
 * @param {Date} [now]
 * @returns {{date: string, time: string}}
 */
export function nowCotParts(now) {
    const _now = now || new Date();
    const fmtDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const fmtTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: COT_TZ, hour: '2-digit', minute: '2-digit', hour12: false
    });
    return {
        date: fmtDate.format(_now),
        time: fmtTime.format(_now)
    };
}

/**
 * Devuelve un `Date` que al formatear en COT da la fecha de mañana.
 * Útil para tests de la PWA en dev cuando se quieren probar partidos
 * del día siguiente sin esperar a mañana.
 *
 * El "mediodía COT" (= 17:00 UTC del mismo día) se usa para que el
 * formateo en COT siempre caiga en la fecha correcta sin riesgo de
 * borde por zona horaria.
 *
 * @param {Date} [now] - fecha base (default: new Date())
 * @returns {Date} Date que al formatear en COT da mañana
 */
export function tomorrowCot(now) {
    const base = now || new Date();
    const fmtToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    // Sumar 1 día al "hoy" en COT
    const todayStr = fmtToday.format(base);
    const [y, m, d] = todayStr.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 17, 0, 0));
    return tomorrow;
}

/**
 * Devuelve un `Date` que al formatear en COT da la fecha de hoy.
 * Útil para tests de la PWA en dev: la ventana se computa contra el día
 * actual (en COT) en vez de mañana, permitiendo enviar apuestas para los
 * partidos de hoy.
 *
 * El "mediodía COT" (= 17:00 UTC del mismo día) se usa para que el
 * formateo en COT siempre caiga en la fecha correcta sin riesgo de
 * borde por zona horaria.
 *
 * @param {Date} [now] - fecha base (default: new Date())
 * @returns {Date} Date que al formatear en COT da hoy
 */
export function todayCot(now) {
    const base = now || new Date();
    const fmtToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayStr = fmtToday.format(base);
    const [y, m, d] = todayStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
}
