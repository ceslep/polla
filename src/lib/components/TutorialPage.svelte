<script>
    import emblaCarouselSvelte from 'embla-carousel-svelte';
    import { tutorialSlides } from './tutorialSteps.js';

    /**
     * @typedef {import('./tutorialSteps.js').TutorialSlide} TutorialSlide
     */

    /**
     * @typedef {Object} Props
     * @property {() => void} [onClose]   Llamado al click en "Volver"
     */

    /** @type {Props} */
    let { onClose } = $props();

    /** @type {any} */
    let emblaApi = $state(null);
    let selectedIndex = $state(0);
    const slides = tutorialSlides;
    const slideCount = slides.length;

    function onInit(/** @type {CustomEvent} */ evt) {
        emblaApi = evt.detail;
        emblaApi.on('select', () => {
            if (emblaApi) selectedIndex = emblaApi.selectedScrollSnap();
        });
    }

    function scrollPrev() {
        emblaApi?.scrollPrev();
    }

    function scrollNext() {
        emblaApi?.scrollNext();
    }

    function scrollTo(/** @type {number} */ i) {
        emblaApi?.scrollTo(i);
    }

    function close() {
        if (onClose) onClose();
    }
</script>

<div class="tutorial-page" role="dialog" aria-label="Tutorial de la polla">
    <div class="tutorial-bg" aria-hidden="true"></div>
    <header class="tutorial-header">
        <button type="button" class="close-btn" onclick={close} aria-label="Volver">
            ← Volver
        </button>
        <h1 class="tutorial-title">Tutorial</h1>
        <div class="header-spacer"></div>
    </header>

    <div
        class="embla"
        use:emblaCarouselSvelte={{ options: { loop: false, align: 'center' }, plugins: [] }}
        onemblaInit={onInit}
    >
        <div class="embla__container">
            {#each slides as slide, i (slide.id)}
                <div class="embla__slide" class:is-active={i === selectedIndex}>
                    <div class="slide-card">
                        <div class="slide-image-wrap">
                            <img src={slide.image} alt={slide.title} class="slide-image" />
                        </div>
                        <div class="slide-body">
                            <h2 class="slide-title">{slide.title}</h2>
                            <p class="slide-description">{slide.description}</p>
                            {#if slide.tips && slide.tips.length > 0}
                                <ul class="slide-tips">
                                    {#each slide.tips as tip}
                                        <li>{tip}</li>
                                    {/each}
                                </ul>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <footer class="tutorial-footer">
        <button
            type="button"
            class="nav-btn"
            onclick={scrollPrev}
            disabled={selectedIndex === 0}
            aria-label="Anterior"
        >
            ←
        </button>

        <div class="dots" role="tablist" aria-label="Pasos del tutorial">
            {#each slides as _, i}
                <button
                    type="button"
                    class="dot"
                    class:is-active={i === selectedIndex}
                    onclick={() => scrollTo(i)}
                    aria-label={`Ir al paso ${i + 1}`}
                    aria-selected={i === selectedIndex}
                    role="tab"
                ></button>
            {/each}
        </div>

        {#if selectedIndex < slideCount - 1}
            <button type="button" class="nav-btn primary" onclick={scrollNext} aria-label="Siguiente">
                →
            </button>
        {:else}
            <button type="button" class="nav-btn primary" onclick={close} aria-label="Cerrar tutorial">
                ✓
            </button>
        {/if}
    </footer>
</div>

<style>
    .tutorial-page {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: #0a0a0a;
        color: #e2e8f0;
        position: relative;
    }

    .tutorial-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background:
            radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.18), transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(6, 182, 212, 0.14), transparent 50%);
        pointer-events: none;
    }

    .tutorial-header,
    .embla,
    .tutorial-footer {
        position: relative;
        z-index: 1;
    }

    .tutorial-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: #064e3b;
        color: white;
        position: sticky;
        top: 0;
        z-index: 10;
    }

    .tutorial-title {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 6px;
        transition: background 0.15s;
    }

    .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .header-spacer {
        width: 64px;
    }

    .embla {
        flex: 1;
        overflow: hidden;
        padding: 24px 0;
    }

    .embla__container {
        display: flex;
        gap: 16px;
        padding: 0 20px;
        touch-action: pan-y pinch-zoom;
    }

    .embla__slide {
        flex: 0 0 100%;
        min-width: 0;
    }

    .slide-card {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        max-width: 600px;
        margin: 0 auto;
    }

    .slide-image-wrap {
        background: #f1f5f9;
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .slide-image {
        width: 100%;
        max-width: 480px;
        height: auto;
        display: block;
    }

    .slide-body {
        padding: 24px;
    }

    .slide-title {
        font-size: 22px;
        font-weight: 700;
        color: #34d399;
        margin: 0 0 12px;
    }

    .slide-description {
        font-size: 15px;
        line-height: 1.55;
        color: #cbd5e1;
        margin: 0 0 16px;
    }

    .slide-tips {
        margin: 0;
        padding-left: 20px;
        color: #cbd5e1;
    }

    .slide-tips li {
        font-size: 14px;
        line-height: 1.6;
        margin-bottom: 4px;
    }

    .tutorial-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 24px;
        background: #111827;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        position: sticky;
        bottom: 0;
    }

    .nav-btn {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 50%;
        width: 44px;
        height: 44px;
        font-size: 18px;
        font-weight: 700;
        color: #cbd5e1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
    }

    .nav-btn:hover:not(:disabled) {
        background: #334155;
        color: #f1f5f9;
    }

    .nav-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .nav-btn.primary {
        background: #10b981;
        color: white;
        border-color: #10b981;
    }

    .nav-btn.primary:hover {
        background: #059669;
        border-color: #059669;
    }

    .dots {
        display: flex;
        gap: 8px;
    }

    .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: none;
        background: #475569;
        cursor: pointer;
        padding: 0;
        transition: all 0.15s;
    }

    .dot.is-active {
        background: #10b981;
        transform: scale(1.25);
    }

    @media (max-width: 640px) {
        .slide-body {
            padding: 18px;
        }
        .slide-title {
            font-size: 20px;
        }
        .tutorial-header {
            padding: 12px 14px;
        }
        .tutorial-footer {
            padding: 12px 14px 20px;
        }
    }
</style>
