/**
 * session.svelte.js - Estado de la sesión PWA
 *
 * Maneja la sesión efímera del participante durante el flujo de apuestas:
 * paso actual, credenciales autenticadas, fecha. Se persiste en
 * sessionStorage para sobrevivir a recargas accidentales pero NO a cierre
 * de pestaña (es por sesión).
 *
 * Steps: 'landing' | 'login' | 'ranking' | 'change-password' | 'form' | 'done' | 'history' | 'results' | 'movement'
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
 * @property {'landing'|'login'|'ranking'|'change-password'|'form'|'done'|'history'|'results'|'movement'} step
 * @property {string|null} authParticipant - nombre del participante (columna A de la hoja `participantes`)
 * @property {string|null} authPhone - phone (columna B de la hoja, last 10 digits)
 * @property {string|null} authUsername - last 10 digits (== authPhone)
 * @property {string|null} authPassword - last 4 digits (columna C)
 * @property {string|null} date - YYYY-MM-DD en COT (fecha de la sesión)
 * @property {boolean} submitted - true si ya envió apuestas para esta fecha
 * @property {boolean} mustChangePassword - true si el backend indica que hay que cambiar la pass antes de apostar
 */

/** @type {PwaSession} */
const initial = loadFromStorage() || {
    step: 'landing',
    authParticipant: null,
    authPhone: null,
    authUsername: null,
    authPassword: null,
    date: todayCot(),
    submitted: false,
    mustChangePassword: false
};

export const pwaSession = $state(initial);

/**
 * Resetea a un estado conocido.
 * @param {Partial<PwaSession>} [overrides]
 */
export function resetPwaSession(overrides) {
    pwaSession.step = overrides?.step || 'landing';
    pwaSession.authParticipant = overrides?.authParticipant ?? null;
    pwaSession.authPhone = overrides?.authPhone ?? null;
    pwaSession.authUsername = overrides?.authUsername ?? null;
    pwaSession.authPassword = overrides?.authPassword ?? null;
    pwaSession.date = overrides?.date || todayCot();
    pwaSession.submitted = overrides?.submitted || false;
    pwaSession.mustChangePassword = overrides?.mustChangePassword ?? false;
    persist();
}

/** Mueve a un paso específico. */
export function setStep(/** @type {PwaSession['step']} */ step) {
    pwaSession.step = step;
    persist();
}

/**
 * Marca la sesión como autenticada. Después de esto, los formularios pueden
 * enviar apuestas con las credenciales en el payload. Si `mustChangePassword`
 * es true, salta a la pantalla de cambio de contraseña en vez de ir al form.
 * @param {string} participant - nombre (columna A de `participantes`)
 * @param {string} phone - phone (columna B)
 * @param {string} username - last 10 digits (== phone)
 * @param {string} password - last 4 digits (columna C)
 * @param {boolean} [mustChangePassword=false] - si true, step inicial es 'change-password'
 */
export function loginAs(/** @type {string} */ participant, /** @type {string} */ phone, /** @type {string} */ username, /** @type {string} */ password, /** @type {boolean} */ mustChangePassword = false) {
    pwaSession.authParticipant = participant;
    pwaSession.authPhone = phone;
    pwaSession.authUsername = username;
    pwaSession.authPassword = password;
    pwaSession.mustChangePassword = mustChangePassword;
    pwaSession.step = mustChangePassword ? 'change-password' : 'form';
    persist();
}

/** Actualiza la contraseña en sesión (después de un cambio exitoso) y avanza al form. */
export function completePasswordChange(/** @type {string} */ newPassword) {
    pwaSession.authPassword = newPassword;
    pwaSession.mustChangePassword = false;
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

function persist() {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            step: pwaSession.step,
            authParticipant: pwaSession.authParticipant,
            authPhone: pwaSession.authPhone,
            authUsername: pwaSession.authUsername,
            authPassword: pwaSession.authPassword,
            date: pwaSession.date,
            submitted: pwaSession.submitted,
            mustChangePassword: pwaSession.mustChangePassword
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
        // Normalizar: sesiones guardadas antes de la feature no tienen mustChangePassword
        if (typeof data.mustChangePassword !== 'boolean') {
            data.mustChangePassword = false;
        }
        return data;
    } catch {
        return null;
    }
}
