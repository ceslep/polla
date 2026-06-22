/**
 * install.svelte.js - Manejo de instalación PWA + fallback iOS
 *
 * - Captura el evento `beforeinstallprompt` que Chrome/Edge/Desktop disparan
 *   cuando la PWA califica como instalable. Muestra un botón propio
 *   "Instalar app" en la UI para disparar el prompt nativo.
 * - En iOS Safari no hay `beforeinstallprompt`, así que detectamos el user
 *   agent y mostramos un modal con pasos manuales (Share → Add to Home Screen).
 * - Detecta instalación previa con `display-mode: standalone` (moderno) y
 *   `navigator.standalone` (iOS legacy).
 *
 * @typedef {Object} InstallState
 * @property {any}    deferredPrompt  - Evento nativo capturado (o null)
 * @property {boolean} installed       - Ya está instalada (standalone mode)
 * @property {boolean} canShowNative   - Hay un prompt nativo disponible
 * @property {boolean} isIos           - User agent es iOS (Safari/PWA)
 * @property {boolean} iosDismissed    - El usuario cerró el modal iOS
 */

/** @type {InstallState} */
const state = $state({
    deferredPrompt: null,
    installed: false,
    canShowNative: false,
    isIos: false,
    iosDismissed: false
});

/** Detectar iOS (incluye iPadOS 13+ que se reporta como Mac con touch). */
function detectIos() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return /Mac/.test(ua) && navigator.maxTouchPoints > 1;
}

/** Detectar si la app ya corre como PWA instalada (standalone). */
function detectInstalled() {
    if (typeof window === 'undefined') return false;
    try {
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
        // @ts-ignore - navigator.standalone existe en iOS Safari
        if (window.navigator.standalone === true) return true;
    } catch {
        // matchMedia puede fallar en navegadores viejos
    }
    return false;
}

/**
 * Inicializa los listeners. Llamar UNA VEZ en onMount de un componente
 * de tope (ej. App.svelte o PwaLanding.svelte).
 */
export function initInstallPrompt() {
    if (typeof window === 'undefined') return;
    state.isIos = detectIos();
    state.installed = detectInstalled();

    window.addEventListener('beforeinstallprompt', (/** @type {any} */ e) => {
        // Prevenir el mini-infobar de Chrome; usamos nuestro botón propio.
        e.preventDefault();
        state.deferredPrompt = e;
        state.canShowNative = true;
    });

    window.addEventListener('appinstalled', () => {
        state.installed = true;
        state.canShowNative = false;
        state.deferredPrompt = null;
    });
}

/**
 * Dispara el prompt nativo de instalación (Chrome/Edge/Desktop).
 * Devuelve `true` si el usuario aceptó.
 * @returns {Promise<boolean>}
 */
export async function promptInstall() {
    if (!state.deferredPrompt) return false;
    state.deferredPrompt.prompt();
    /** @type {{ outcome: 'accepted' | 'dismissed' }} */
    const { outcome } = await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    state.canShowNative = false;
    return outcome === 'accepted';
}

/** Cierra el modal iOS (el usuario ya vio las instrucciones). */
export function dismissIosHint() {
    state.iosDismissed = true;
}

/** @returns {InstallState} */
export function getInstallState() {
    return state;
}
