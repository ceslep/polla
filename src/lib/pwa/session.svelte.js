/**
 * session.svelte.js - Estado de la sesión PWA
 *
 * Maneja la sesión efímera del participante durante el flujo de apuestas:
 * paso actual, credenciales autenticadas, fecha. Se persiste en
 * sessionStorage para sobrevivir a recargas accidentales pero NO a cierre
 * de pestaña (es por sesión).
 *
 * Steps: 'landing' | 'login' | 'ranking' | 'change-password' | 'email-prompt' | 'tournament-bets' | 'form' | 'done' | 'history' | 'results' | 'movement' | 'today-bets' | 'root-panel'
 */

const SESSION_KEY = 'pwaSession';
const TOUR_KEY = 'pwaSeenTour';
const INTRO_KEY = 'pwaSeenIntro';
const GOAL_KEY_PREFIX = 'pwaSeenGoal_';

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
 * @property {'landing'|'login'|'ranking'|'tutorial'|'change-password'|'email-prompt'|'tournament-bets'|'form'|'done'|'history'|'results'|'movement'|'today-bets'|'root-panel'} step
 * @property {string|null} authParticipant - nombre del participante (columna A de la hoja `participantes`)
 * @property {string|null} authPhone - phone (columna B de la hoja, last 10 digits)
 * @property {string|null} authUsername - last 10 digits (== authPhone)
 * @property {string|null} authPassword - last 4 digits (columna C)
 * @property {string|null} date - YYYY-MM-DD en COT (fecha de la sesión)
 * @property {boolean} submitted - true si ya envió apuestas para esta fecha
 * @property {boolean} mustChangePassword - true si el backend indica que hay que cambiar la pass antes de apostar
 * @property {boolean} mustProvideEmail - true si el backend indica que la columna E (email) está vacía
 * @property {boolean} isRoot - true si la fila del participante tiene isRoot=TRUE en `participantes` col F. Habilita el panel root (paso 'root-panel') y permite apostar a nombre de otros.
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
    mustChangePassword: false,
    mustProvideEmail: false,
    isRoot: false
};

export const pwaSession = $state(initial);

/**
 * ¿El usuario ya vio el tour de la PWA en esta pestaña?
 * Persistido en sessionStorage con clave separada (no se borra con logout,
 * porque el tour es por-dispositivo, no por-cuenta).
 * @returns {boolean}
 */
export function hasSeenPwaTour() {
    try {
        return sessionStorage.getItem(TOUR_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Marca el tour como visto. Idempotente.
 */
export function markPwaTourSeen() {
    try {
        sessionStorage.setItem(TOUR_KEY, 'true');
    } catch {
        // sessionStorage puede fallar en modo privado de Safari; ignorar
    }
}

/**
 * Resetea el flag del tour. Útil para testing o para "ver de nuevo".
 */
export function resetPwaTour() {
    try {
        sessionStorage.removeItem(TOUR_KEY);
    } catch {
        // ignorar
    }
}

/**
 * ¿El usuario ya vio la animación intro Three.js de la PWA en esta pestaña?
 * Persistido en sessionStorage con clave separada del tour. El intro se
 * muestra una vez por sesión; cerrar y abrir la pestaña lo vuelve a mostrar.
 * @returns {boolean}
 */
export function hasSeenPwaIntro() {
    try {
        return sessionStorage.getItem(INTRO_KEY) === 'true';
    } catch {
        return false;
    }
}

/**
 * Marca el intro como visto. Idempotente. Lo llama PwaApp cuando el
 * componente PwaIntro termina su animación y se desmonta.
 */
export function markPwaIntroSeen() {
    try {
        sessionStorage.setItem(INTRO_KEY, 'true');
    } catch {
        // sessionStorage puede fallar en modo privado de Safari; ignorar
    }
}

/**
 * Resetea el flag del intro. Útil para testing o para "ver de nuevo"
 * desde la consola del navegador.
 */
export function resetPwaIntro() {
    try {
        sessionStorage.removeItem(INTRO_KEY);
    } catch {
        // ignorar
    }
}

/**
 * ¿Ya se mostró la animación del gol Three.js para este step en esta
 * pestaña? Persistido en sessionStorage con clave por step
 * (`pwaSeenGoal_ranking`, `pwaSeenGoal_today-bets`). Una vez por sesión
 * por step; cerrar y abrir la pestaña lo vuelve a mostrar.
 *
 * Mismo patrón defensivo que `hasSeenPwaIntro` / `hasSeenPwaTour`:
 * cualquier error de lectura devuelve `false` (default seguro =
 * mostrar).
 *
 * @param {string} step
 * @returns {boolean}
 */
export function hasSeenGoal(/** @type {string} */ step) {
    if (!step) return false;
    try {
        return sessionStorage.getItem(GOAL_KEY_PREFIX + step) === '1';
    } catch {
        return false;
    }
}

/**
 * Marca la animación del gol como vista para este step. Idempotente.
 * Lo llama PwaGoalOverlay cuando termina su animación y se desmonta.
 * @param {string} step
 */
export function markGoalSeen(/** @type {string} */ step) {
    if (!step) return;
    try {
        sessionStorage.setItem(GOAL_KEY_PREFIX + step, '1');
    } catch {
        // sessionStorage puede fallar en modo privado de Safari; ignorar
    }
}

/**
 * Resetea los flags de la animación del gol para un step específico
 * (o para todos si no se pasa step). Útil para testing o para
 * "ver de nuevo" desde la consola del navegador.
 * @param {string} [step]
 */
export function resetGoalSeen(/** @type {string} */ step) {
    try {
        if (step) {
            sessionStorage.removeItem(GOAL_KEY_PREFIX + step);
        } else {
            // Limpiar todos los prefijos conocidos.
            for (const s of ['ranking', 'today-bets']) {
                sessionStorage.removeItem(GOAL_KEY_PREFIX + s);
            }
        }
    } catch {
        // ignorar
    }
}

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
    pwaSession.mustProvideEmail = overrides?.mustProvideEmail ?? false;
    pwaSession.isRoot = overrides?.isRoot ?? false;
    persist();
}

/** Mueve a un paso específico. */
export function setStep(/** @type {PwaSession['step']} */ step) {
    pwaSession.step = step;
    persist();
}

/**
 * Marca la sesión como autenticada. Después de esto, los formularios pueden
 * enviar apuestas con las credenciales en el payload.
 *
 * Routing de step según flags del backend:
 *   - mustChangePassword=true  → 'change-password' (cambia pass → 'email-prompt' → 'form')
 *   - mustProvideEmail=true    → 'email-prompt' directo (registra email → 'form')
 *   - ambos false              → 'form' directo
 *
 * El modal de email-prompt es inescapable (sin opciones de skip); ver
 * PwaEmailPromptModal.svelte.
 *
 * @param {string} participant - nombre (columna A de `participantes`)
 * @param {string} phone - phone (columna B)
 * @param {string} username - last 10 digits (== phone)
 * @param {string} password - last 4 digits (columna C)
 * @param {boolean} [mustChangePassword=false] - si true, step inicial es 'change-password'
 * @param {boolean} [mustProvideEmail=false] - si true y mustChangePassword=false, step inicial es 'email-prompt'
 * @param {boolean} [isRoot=false] - si true, step inicial es 'root-panel' (panel de administración)
 */
export function loginAs(/** @type {string} */ participant, /** @type {string} */ phone, /** @type {string} */ username, /** @type {string} */ password, /** @type {boolean} */ mustChangePassword = false, /** @type {boolean} */ mustProvideEmail = false, /** @type {boolean} */ isRoot = false) {
    pwaSession.authParticipant = participant;
    pwaSession.authPhone = phone;
    pwaSession.authUsername = username;
    pwaSession.authPassword = password;
    pwaSession.mustChangePassword = mustChangePassword;
    pwaSession.mustProvideEmail = mustProvideEmail;
    pwaSession.isRoot = isRoot;
    if (isRoot) {
        // El root ya tiene onboarding completo (es admin) y va directo al
        // panel root. Ignoramos los flags de cambio de pass / email: el root
        // apostó por sí mismo mucho antes de que esto existiera.
        pwaSession.step = 'root-panel';
    } else if (mustChangePassword) {
        pwaSession.step = 'change-password';
    } else if (mustProvideEmail) {
        pwaSession.step = 'email-prompt';
    } else {
        pwaSession.step = 'form';
    }
    persist();
}

/** Actualiza la contraseña en sesión (después de un cambio exitoso) y
 * avanza al paso de email-prompt (modal de notificaciones obligatorio).
 * El form real no se monta hasta que el modal de email se cierra vía
 * completeEmailPrompt. Esto aplica tanto para el primer cambio
 * (mustChangePassword era true) como para cuando el usuario ya tenía la
 * pass cambiada pero nunca había registrado email (mustProvideEmail=true).
 */
export function completePasswordChange(/** @type {string} */ newPassword) {
    pwaSession.authPassword = newPassword;
    pwaSession.mustChangePassword = false;
    // Si el usuario ya tenía email, el modal igualmente se muestra después
    // del cambio de pass (re-entrada). Para saltarlo necesitaríamos
    // re-consultar el backend; por simplicidad, siempre se muestra.
    pwaSession.step = 'email-prompt';
    persist();
}

/** Cierra el modal de email-prompt y avanza al form. Se llama únicamente
 * cuando el usuario guarda un email válido (no hay opción de skip; ver
 * PwaEmailPromptModal.svelte). */
export function completeEmailPrompt() {
    pwaSession.mustProvideEmail = false;
    pwaSession.step = 'form';
    persist();
}

/** Cierra el formulario obligatorio de apuestas de torneo (campeón,
 * subcampeón, tercer lugar, goleador) y avanza al form de marcadores.
 * Se llama solo después de que el backend confirma el registro de las 4. */
export function completeTournamentBets() {
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
            mustChangePassword: pwaSession.mustChangePassword,
            mustProvideEmail: pwaSession.mustProvideEmail,
            isRoot: pwaSession.isRoot
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
        // Normalizar: sesiones guardadas antes de la feature no tienen estos flags
        if (typeof data.mustChangePassword !== 'boolean') {
            data.mustChangePassword = false;
        }
        if (typeof data.mustProvideEmail !== 'boolean') {
            data.mustProvideEmail = false;
        }
        if (typeof data.isRoot !== 'boolean') {
            data.isRoot = false;
        }
        return data;
    } catch {
        return null;
    }
}
