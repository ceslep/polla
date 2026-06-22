// tutorialSteps.js — Textos en español para el tutorial de pollaweb.
//
// Dos consumos:
//   1. In-app tour (Driver.js): pasos cortos que apuntan a elementos del DOM
//      con `selector` y resumen las acciones principales.
//   2. Standalone /tutorial (Embla carousel): slides con título, descripción
//      e imagen SVG de mayor detalle, linkable desde fuera de la app.
//
// El campo `selector` puede ser `null` cuando el paso no apunta a un elemento
// concreto (e.g. el primer paso de bienvenida) — Driver.js lo centra en pantalla.

/**
 * @typedef {Object} TourStep
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string|null} selector  CSS selector del elemento a resaltar
 * @property {'top'|'bottom'|'left'|'right'} [side]  Lado preferido del popover
 */

/** @type {TourStep[]} */
export const tourSteps = [
    {
        id: 'welcome',
        selector: null,
        title: '¡Bienvenido a la polla! 🏆',
        description: 'Acá vas a ver el ranking de todos los participantes y los marcadores del Mundial 2026.',
        side: 'bottom',
    },
    {
        id: 'upload',
        selector: '[data-tutorial="dropzone"]',
        title: 'Subí tu chat de WhatsApp',
        description: 'Si todavía no lo hiciste, exportá el chat del grupo y arrastrá el .json acá.',
        side: 'bottom',
    },
    {
        id: 'ranking',
        selector: '[data-tutorial="ranking"]',
        title: 'Tu ranking en vivo',
        description: 'Acá ves los puntos. Se actualiza cada vez que se juega un partido.',
        side: 'top',
    },
    {
        id: 'bets',
        selector: '[data-tutorial="bets"]',
        title: 'Tus apuestas',
        description: 'Hacé click en una fila para ver el detalle: resultado real, puntos ganados, etc.',
        side: 'top',
    },
];

/**
 * @typedef {Object} TutorialSlide
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} image     Ruta al SVG en /public/tutorial/
 * @property {string[]=} tips   Bullets opcionales
 */

/** @type {TutorialSlide[]} */
export const tutorialSlides = [
    {
        id: 'intro',
        title: '¿Qué es la polla?',
        description: 'Una competencia entre todos los participantes del grupo. Cada uno manda sus apuestas por WhatsApp y el que más puntos suma al final del Mundial gana.',
        image: '/tutorial/step-1.svg',
        tips: [
            'Apostás marcador por partido, campeón, subcampeón y goleador',
            'Gana quien tenga más puntos al terminar el torneo',
        ],
    },
    {
        id: 'export',
        title: 'Cómo exportar el chat de WhatsApp',
        description: 'Desde el chat del grupo, seguí estos pasos para bajar el archivo con tus apuestas.',
        image: '/tutorial/step-2.svg',
        tips: [
            'Andá al chat del grupo de la polla',
            'Tocá los 3 puntos ⋮ arriba a la derecha',
            'Elegí "Más" → "Exportar chat"',
            'Sin multimedia, formato .zip',
        ],
    },
    {
        id: 'upload',
        title: 'Cómo subir tu archivo',
        description: 'Descomprimí el .zip (te queda un .json) y subilo a la app.',
        image: '/tutorial/step-3.svg',
        tips: [
            'Andá a ceslep.github.io/polla',
            'Arrastrá el .json al recuadro azul',
            'O hacé click y elegilo desde tu compu',
        ],
    },
    {
        id: 'ranking',
        title: 'Cómo se ve el ranking',
        description: 'La tabla muestra posición, puntos totales y cuántos aciertos exactos / parciales / fallos tuviste.',
        image: '/tutorial/step-4.svg',
        tips: [
            'Hacé click en una fila para ver el detalle',
            'El ranking se actualiza con cada partido',
        ],
    },
    {
        id: 'scoring',
        title: '¿Cómo se calcula el puntaje?',
        description: 'Por cada partido, tu apuesta se compara con el resultado real. Depende de cuán cerca estuviste:',
        image: '/tutorial/step-5.svg',
        tips: [
            'Exacto (marcador y resultado): 5 puntos',
            'Acierto (ganó el mismo, mal marcador): 3 puntos',
            'Fallo (ni ganador ni empate): 0 puntos',
        ],
    },
];
