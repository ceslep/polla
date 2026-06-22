<script>
    import { onDestroy } from 'svelte';
    import { driver } from 'driver.js';
    import 'driver.js/dist/driver.css';
    import './OnboardingTour.css';

    /**
     * @typedef {import('./tutorialSteps.js').TourStep} TourStep
     */

    /**
     * @typedef {Object} Props
     * @property {TourStep[]} steps
     * @property {boolean} trigger            Cuando pasa a true, arranca el tour
     * @property {() => void} [onDone]        Llamado al terminar o saltar el tour
     * @property {() => void} [onSkip]        Llamado solo cuando se salta (botón X o close)
     */

    /** @type {Props} */
    let { steps, trigger, onDone, onSkip } = $props();

    /** @type {any} */
    let driverInstance = null;
    let lastTrigger = false;

    /**
     * Convierte TourStep[] a DriveStep[] de driver.js.
     * Si el selector no existe en el DOM al momento de highlight, driver.js
     * lo centra en pantalla (fallback nativo).
     * @param {TourStep[]} src
     */
    function toDriveSteps(src) {
        return src.map((s) => ({
            element: s.selector ?? undefined,
            popover: {
                title: s.title,
                description: s.description,
                side: /** @type {any} */ (s.side ?? 'bottom'),
                showButtons: ['next', 'previous', 'close'],
                showProgress: true,
                progressText: '{{current}} de {{total}}',
                nextBtnText: 'Siguiente →',
                prevBtnText: '← Anterior',
                doneBtnText: '¡Entendido!',
            },
        }));
    }

    $effect(() => {
        // Detecta el flanco de subida: trigger pasa de false→true → arranca tour.
        if (trigger && !lastTrigger) {
            startTour();
        }
        lastTrigger = trigger;
    });

    function startTour() {
        if (driverInstance) {
            driverInstance.destroy();
        }
        const driveSteps = toDriveSteps(steps);
        driverInstance = driver({
            animate: true,
            overlayColor: '#000000',
            overlayOpacity: 0.7,
            smoothScroll: true,
            allowClose: true,
            showProgress: true,
            disableActiveInteraction: false,
            onDestroyed: () => {
                // Se llama tanto al terminar como al saltar.
                // Llamamos onSkip siempre (en este contexto, "ya vio el tour
                // o lo salteó" es lo mismo para persistir).
                if (onSkip) onSkip();
                if (onDone) onDone();
            },
        });
        driverInstance.setSteps(driveSteps);
        driverInstance.drive();
    }

    onDestroy(() => {
        if (driverInstance) {
            driverInstance.destroy();
            driverInstance = null;
        }
    });
</script>

<!-- Sin markup — el tour se renderiza en un portal fijo sobre la app. -->
