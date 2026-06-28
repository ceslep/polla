/**
 * Lógica compartida de "Borrar cache". La usa tanto el botón flotante
 * (CacheClearButton.svelte) como el auto-borrado al abrir la URL (main.js).
 *
 * Limpia:
 *   - Todas las Cache Storage entries (incluyendo el SW cache viejo)
 *   - localStorage y sessionStorage
 *   - Unregistra todos los Service Workers registrados
 */

/** Clave del guard en sessionStorage para el auto-borrado (una vez por pestaña). */
const AUTO_CLEAR_GUARD_KEY = 'pwaAutoCacheCleared';

/**
 * @param {string} msg
 * @returns {void}
 */
function log(msg) {
    console.log('[PWA:clear-cache]', msg);
}

/**
 * Borra caches, storages y SWs. NO recarga (eso lo decide el caller).
 * @returns {Promise<void>}
 */
export async function clearAllCaches() {
    // 1. Cache Storage
    if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        log(`Cache Storage keys: ${keys.join(', ') || '(vacío)'}`);
        await Promise.all(keys.map((k) => caches.delete(k)));
        log(`✓ ${keys.length} cache(s) eliminada(s)`);
    }

    // 2. localStorage / sessionStorage
    try {
        const lsKeys = Object.keys(localStorage);
        log(`localStorage keys: ${lsKeys.join(', ') || '(vacío)'}`);
        localStorage.clear();
        log('✓ localStorage limpiado');
    } catch (err) {
        log(`localStorage no accesible: ${err instanceof Error ? err.message : err}`);
    }
    try {
        const ssKeys = Object.keys(sessionStorage);
        log(`sessionStorage keys: ${ssKeys.join(', ') || '(vacío)'}`);
        sessionStorage.clear();
        log('✓ sessionStorage limpiado');
    } catch (err) {
        log(`sessionStorage no accesible: ${err instanceof Error ? err.message : err}`);
    }

    // 3. Service Workers
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        log(`SW registrations: ${regs.length}`);
        await Promise.all(regs.map((r) => r.unregister()));
        log(`✓ ${regs.length} SW unregistrado(s)`);
    }
}

/**
 * Borra todo y recarga (full reload). Usado por el botón flotante.
 * @returns {Promise<void>}
 */
export async function clearCachesAndReload() {
    try {
        await clearAllCaches();
    } catch (err) {
        console.error('[PWA:clear-cache] error:', err);
    } finally {
        log('Recargando…');
        window.location.reload();
    }
}

/**
 * Auto-borrado al abrir la URL: ejecuta la misma limpieza que el botón
 * "Borrar cache" UNA vez por apertura de pestaña, y luego recarga.
 *
 * Anti-loop: tras limpiar (que incluye `sessionStorage.clear()`) seteamos un
 * guard en sessionStorage ANTES de recargar. El reload que dispara este
 * borrado conserva ese guard (misma pestaña), así que la segunda pasada lo
 * detecta y NO vuelve a limpiar → sin bucle infinito. El guard muere al
 * cerrar la pestaña, así que la próxima apertura vuelve a limpiar.
 *
 * Llamar lo antes posible en el arranque, ANTES de montar la app.
 * @returns {Promise<boolean>} true si disparó la recarga (el caller debe
 *   omitir el montaje); false si no había que limpiar (montar normal).
 */
export async function autoClearCacheOnOpen() {
    try {
        if (sessionStorage.getItem(AUTO_CLEAR_GUARD_KEY) === '1') {
            // Ya se limpió en esta apertura de pestaña (este es el reload).
            return false;
        }
    } catch {
        // sessionStorage no accesible (modo privado raro): mejor no entrar en
        // un bucle — abortar el auto-borrado.
        return false;
    }

    try {
        await clearAllCaches();
    } catch (err) {
        console.error('[PWA:clear-cache] auto error:', err);
    }

    // Set del guard DESPUÉS de clearAllCaches (que hizo sessionStorage.clear()).
    try {
        sessionStorage.setItem(AUTO_CLEAR_GUARD_KEY, '1');
    } catch {
        // Si no se puede setear el guard, abortamos el reload para evitar loop.
        log('No se pudo setear el guard; se omite la recarga para evitar bucle.');
        return false;
    }

    log('Auto-borrado completo. Recargando…');
    window.location.reload();
    return true;
}
