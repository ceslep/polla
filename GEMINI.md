# GEMINI.md - Polla Web (Copa del Mundo 2026)

Este archivo proporciona instrucciones y contexto para trabajar en el proyecto `pollaweb`, una aplicación web diseñada para gestionar una "polla" (porra/quiniela) de la Copa del Mundo 2026 basada en exportaciones de chat de WhatsApp.

## Resumen del Proyecto

`pollaweb` es una Single-Page Application (SPA) desarrollada con **Svelte 5** que permite:
1.  **Parsear** mensajes de texto libre de WhatsApp para extraer apuestas estructuradas (campeón, subcampeón, goleador y marcadores de partidos).
2.  **Sincronizar** con resultados reales de partidos desde GitHub (openfootball) o APIs externas.
3.  **Calificar** automáticamente cada apuesta basándose en los resultados reales.
4.  **Gestionar** un ranking de participantes y visualizar estadísticas.
5.  **Persistir** datos en `localStorage` y opcionalmente en Google Sheets a través de un backend ligero en PHP.

## Stack Tecnológico

-   **Framework:** Svelte 5 (usando Runes: `$state`, `$derived`, `$effect`).
-   **Build Tool:** Vite.
-   **Estilos:** Tailwind CSS (plugin de Vite).
-   **Tipado:** JSDoc sobre JavaScript puro (sin archivos `.ts` en `src/`).
-   **Router:** `svelte-spa-router`.
-   **Backend (Assets):** PHP para integración con Google Sheets (ubicado en `src/assets/`).

## Comandos Clave

```bash
# Desarrollo
npm run dev       # Inicia el servidor de desarrollo de Vite

# Construcción y Despliegue
npm run build     # Genera el build de producción en dist/
npm run preview   # Previsualiza el build de producción
npm run deploy    # Construye y despliega en GitHub Pages (/polla2026/)

# Calidad de Código
npm run check     # Ejecuta svelte-check y tsc (vía JSDoc) para validar tipos

# Pruebas Manuales (Node.js)
node test_parse.js   # Valida el motor de parsing de mensajes
node test_match.js   # Valida la lógica de emparejamiento de partidos
```

## Arquitectura y Flujo de Datos

### 1. Parsing (`src/lib/parser.js`)
Es el núcleo de la aplicación. Extrae apuestas de cadenas de texto.
-   **Normalización:** Usa `TEAM_ALIASES` y `FLAG_MAP` para convertir variantes de nombres de equipos y emojis en nombres canónicos.
-   **IMPORTANTE:** Si un equipo no se reconoce, agrégalo a `TEAM_ALIASES`. La normalización debe ser idempotente (`normalizeTeamName(canonical) === canonical`).

### 2. Estado Global (`src/lib/stores.svelte.js`)
Usa Runes de Svelte 5 para el estado global (`appState`).
-   Contiene las apuestas cargadas, partidos, estado de carga y alias de participantes.
-   Los datos derivados son funciones exportadas (ej: `stats()`, `participants()`).

### 3. API y Calificación (`src/lib/api.js`)
-   **Fuentes de Partidos:** GitHub (openfootball) por defecto, o API de football-data.org.
-   **Scoring:** 
    -   Resultado exacto: **5 puntos**.
    -   Ganador/Empate correcto (pero no marcador exacto): **3 puntos**.
    -   Incorrecto: **0 puntos**.

### 4. Persistencia
-   **Principal:** `localStorage` bajo la clave `polla_bets`.
-   **Remota:** Integración con Google Sheets vía `api.js` (endpoints en `app.iedeoccidente.com/gs/`).

## Convenciones de Desarrollo

-   **Svelte 5 Runes:** Usa `$state` para reactividad. Evita `createEventDispatcher`, usa props de callback (ej: `onClose`).
-   **Tipos:** Define tipos en `src/lib/types.js` usando JSDoc y úsalos mediante `@type {import('./types.js').Bet}`.
-   **Componentes:** Pequeños, reutilizables y con una sola responsabilidad.
-   **Debug:** Hay abundantes `console.log` en `parser.js` y `api.js` para depurar el emparejamiento de partidos; mantenlos si son útiles para el desarrollo.

## Notas y Advertencias

-   `src/lib/parser2.js` es código muerto/descartado. **No lo uses.**
-   `src/assets/*.php` son scripts de backend que se despliegan manualmente y no forman parte del build de Vite.
-   El `base` en `vite.config.ts` está configurado para GitHub Pages.
-   Existen divergencias históricas en mapas de banderas; `flags.js` es la fuente principal para visualización, pero `parser.js` tiene su propio mapeo de emojis para el parsing inicial.
