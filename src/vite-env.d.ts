/**
 * vite-env.d.ts — Tipos para variables globales inyectadas por Vite.
 *
 * `__APP_VERSION__` se inyecta en build time vía `define: { __APP_VERSION__: ... }`
 * en vite.config.ts (lee de package.json). Vite reemplaza la cadena literal
 * "__APP_VERSION__" en el código fuente, pero `svelte-check` corre contra el
 * source sin esa sustitución, así que necesitamos declararla para que el type
 * checker no se queje.
 *
 * IMPORTANTE: el identificador debe estar suelto en el código (no como
 * propiedad de objeto: `obj.__APP_VERSION__` no se reemplaza).
 */
declare const __APP_VERSION__: string;
