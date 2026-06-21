/**
 * session.svelte.js - Estado de la sesión PWA
 *
 * Maneja la sesión efímera del participante durante el flujo de apuestas:
 * paso actual, participante seleccionado, teléfono, PIN hasheado, fecha.
 * Se persiste en sessionStorage para sobrevivir a recargas accidentales
 * pero NO a cierre de pestaña (es por sesión).
 */

const SESSION_KEY = 'pwaSession';

const COT_TZ = 'America/Bogota';

/** @returns {string} YYYY-MM-DD en COT */
function todayCot() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: COT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return fmt.format(new Date());
}

/**
 * @typedef {Object} PwaSession
 * @property {'landing'|'select'|'pin'|'form'|'done'|'history'} step
 * @property {string|null} participant
 * @property {string|null} phone
 * @property {string|null} pinHash
 * @property {string|null} date - YYYY-MM-DD en COT
 * @property {boolean} submitted - true si el participante ya envió apuestas para esta fecha
 */

/** @type {PwaSession} */
const initial = loadFromStorage() || {
    step: 'landing',
    participant: null,
    phone: null,
    pinHash: null,
    date: todayCot(),
    submitted: false
};

export const pwaSession = $state(initial);

// Persistir en sessionStorage cada vez que cambia (svelte 5 $effect se usa
// en el componente PwaApp, no acá, para mantener este módulo libre de runes
// en su superficie pública — los componentes importan el state directamente).

/**
 * Resetea a un estado conocido.
 * @param {Partial<PwaSession>} [overrides]
 */
export function resetPwaSession(overrides) {
    pwaSession.step = overrides?.step || 'landing';
    pwaSession.participant = overrides?.participant ?? null;
    pwaSession.phone = overrides?.phone ?? null;
    pwaSession.pinHash = overrides?.pinHash ?? null;
    pwaSession.date = overrides?.date || todayCot();
    pwaSession.submitted = overrides?.submitted || false;
    persist();
}

/** Mueve a un paso específico. */
export function setStep(/** @type {PwaSession['step']} */ step) {
    pwaSession.step = step;
    persist();
}

/** Marca la sesión como autenticada y guarda el participante. */
export function login(/** @type {string} */ participant, /** @type {string} */ phone, /** @type {string} */ pinHash) {
    pwaSession.participant = participant;
    pwaSession.phone = phone;
    pwaSession.pinHash = pinHash;
    pwaSession.step = 'form';
    persist();
}

/** Marca que el participante ya envió sus apuestas para la fecha. */
export function markSubmitted() {
    pwaSession.submitted = true;
    pwaSession.step = 'done';
    persist();
}

/** Cierra la sesión por completo. */
export function logout() {
    resetPwaSession({ step: 'landing' });
    sessionStorage.removeItem(SESSION_KEY);
}

/** Hash simple SHA-256 del PIN. Lo usa el server para verificar (no se envía el PIN en claro después de validar). */
export async function hashPin(/** @type {string} */ phone, /** @type {string} */ pin) {
    const text = `${phone}|${pin}|polla2026_salt`;
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function persist() {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            step: pwaSession.step,
            participant: pwaSession.participant,
            phone: pwaSession.phone,
            pinHash: pwaSession.pinHash,
            date: pwaSession.date,
            submitted: pwaSession.submitted
        }));
    } catch (e) {
        // sessionStorage puede fallar en modo privado de Safari; ignorar
    }
}

function loadFromStorage() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Si la fecha guardada no es hoy en COT, descartar (nueva jornada)
        if (data.date !== todayCot()) return null;
        return data;
    } catch {
        return null;
    }
}
