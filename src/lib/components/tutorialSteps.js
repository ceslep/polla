// tutorialSteps.js — Textos en español para el tutorial de la PWA.
//
// Dos consumos:
//   1. In-app tour (Driver.js): pasos cortos que se disparan tras el
//      primer login exitoso y resaltan partes del PwaForm con
//      selectores [data-pwa-tutorial="..."].
//   2. Standalone /tutorial (Embla carousel): 5 slides linkables
//      desde el botón "Tutorial" del PwaLanding, sin requerir login.
//
// El campo `selector` puede ser `null` cuando el paso no apunta a un
// elemento concreto (e.g. mensaje de bienvenida) — Driver.js lo
// centra en pantalla.

/**
 * @typedef {Object} TourStep
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string|null} selector  CSS selector del elemento a resaltar
 * @property {'top'|'bottom'|'left'|'right'} [side]  Lado preferido del popover
 */

/** Pasos del tour in-app (Driver.js). Se disparan tras login. */
/** @type {TourStep[]} */
export const tourSteps = [
    {
        id: 'welcome-pwa',
        selector: null,
        title: '¡Listo, ya estás adentro! 🎉',
        description: 'Tu login funcionó. Ahora vamos a mandarte al formulario para que pongas tus apuestas del día.',
        side: 'bottom',
    },
    {
        id: 'pwa-matches',
        selector: '[data-pwa-tutorial="matches"]',
        title: 'Acá están los partidos del día',
        description: 'Cada fila es un partido que se juega hoy. Solo los que tengan ventana abierta aparecen.',
        side: 'top',
    },
    {
        id: 'pwa-inputs',
        selector: '[data-pwa-tutorial="inputs"]',
        title: 'Poné tu marcador',
        description: 'Tocá el casillero del equipo local y del visitante. Tenés que poner los dos.',
        side: 'top',
    },
    {
        id: 'pwa-submit',
        selector: '[data-pwa-tutorial="submit"]',
        title: 'Cuando termines, dale "Enviar"',
        description: 'Solo podés mandar UNA vez por día. Después de enviar no se puede cambiar.',
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

/** Slides del /tutorial standalone (Embla carousel). Accesible desde PwaLanding. */
export const tutorialSlides = [
    {
        id: 'intro',
        title: '¿Qué es la polla?',
        description: 'Cada jornada elegís un marcador para cada partido del día. El que más puntos suma al final del Mundial gana.',
        image: '/tutorial/step-1.svg',
        tips: [
            'Apostás el marcador exacto de cada partido',
            'Gana quien tenga más puntos al terminar el torneo',
        ],
    },
    {
        id: 'login',
        title: 'Cómo iniciar sesión',
        description: 'Necesitás un usuario y una contraseña. Si no los tenés, pedíselos al admin del grupo.',
        image: '/tutorial/step-2.svg',
        tips: [
            'Tu usuario = últimos 10 dígitos de tu cel',
            'Tu contraseña = últimos 4 dígitos',
            'Apretá "Apostar" para entrar',
        ],
    },
    {
        id: 'form',
        title: 'Cómo enviar tus apuestas',
        description: 'Una vez logueado, vas a ver la lista de partidos del día. Poné el marcador de cada uno y dale "Enviar".',
        image: '/tutorial/step-3.svg',
        tips: [
            'Tocá cada casillero y poné el número',
            'Tenés que completar todos los partidos',
            'Solo podés mandar UNA vez por día',
        ],
    },
    {
        id: 'ranking',
        title: 'Cómo se ve el ranking',
        description: 'Después de cada partido se actualiza la tabla. Podés ver dónde quedás y cuántos puntos sacaste.',
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
