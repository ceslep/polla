<script>
  import { loadAllPwaBets } from "../../api.js";
  import { fade, fly } from "svelte/transition";

  /**
   * PwaMissingBetsButton.svelte
   *
   * Botón flotante "📋 N" + modal con la lista de participantes que NO
   * han enviado apuesta de tipo `score` con `matchDate === todayDate`.
   * Desde el modal se puede copiar un texto pre-armado al portapapeles
   * para notificar al grupo de WhatsApp.
   *
   * Al abrir el modal (o al pulsar "Refrescar" dentro) se llama a
   * `loadAllPwaBets()` para traer la lista actualizada de Sheets. Si
   * la petición falla, se sigue mostrando el prop `bets` (que es
   * `pwaScoredBets` cargado al montar PwaApp) y se muestra un aviso
   * rojo discreto.
   *
   * Limitación: la lista de "todos los participantes" se deriva de los
   * nombres únicos en `bets` (que viene de `pwaScoredBets` →
   * `loadAllPwaBets`). NO incluye a quien se registró en la hoja
   * `participantes` y nunca apostó. Para incluir a esos habría que
   * crear un endpoint PHP nuevo (ver AGENTS.md).
   *
   * Props:
   *   - bets: any[]                — apuestas scored (puede estar vacío durante el load)
   *   - todayDate: string          — 'YYYY-MM-DD' en COT
   *   - firstMatchHHMM: string|null — 'HH:MM' del primer partido del día (opcional)
   *
   * FIXES:
   *   1. Acción `portal` — mueve el nodo del modal al <body> en runtime.
   *      El wrapper padre en PwaApp tiene `glass` (backdrop-filter: blur)
   *      que rompe `position: fixed` en sus descendientes: el modal quedaba
   *      posicionado contra el div de ~40px en la esquina en vez del
   *      viewport. El portal escapa ese containing block.
   *   2. Transiciones nativas de Svelte (`fade` + `fly`) reemplazan las
   *      clases `animate-fade-in` / `animate-slide-up`, que son custom de
   *      Tailwind y no están definidas en el config base (dejaban el modal
   *      invisible o en estado inicial indefinido).
   *   3. z-index subido a `z-[9999]` para evitar quedar tapado por el
   *      propio wrapper `z-50` del padre u otros layers.
   *   4. Body scroll lock con `$effect` mientras el modal está abierto.
   */

  /**
   * @type {{
   *   bets?: any[],
   *   todayDate?: string,
   *   firstMatchHHMM?: string | null
   * }}
   */
  let { bets = [], todayDate = "", firstMatchHHMM = null } = $props();

  let showModal = $state(false);
  /** Bets traídos al abrir/refrescar el modal. Vacío hasta el primer fetch. */
  let freshBets = $state(/** @type {any[]} */ ([]));
  let loading = $state(false);
  /** @type {string | null} */
  let fetchError = $state(null);
  /** Texto editable del textarea. Se sincroniza con `baseMessage` cuando
   *  cambia el conjunto de faltantes, pero NO en cada keystroke del
   *  ticker (así no pisamos lo que el admin está escribiendo). */
  let textareaValue = $state("");
  let copyState = $state(/** @type {'idle' | 'copied' | 'error'} */ ("idle"));

  // ─── FIX 1: acción portal ────────────────────────────────────────────────
  /**
   * Mueve el nodo al <body> para que `position: fixed` sea siempre
   * relativo al viewport, sin importar si algún ancestro tiene
   * `backdrop-filter`, `transform`, `filter`, `perspective` o `will-change`
   * (todos crean un nuevo containing block para fixed).
   * @param {HTMLElement} node
   */
  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.isConnected) node.remove();
      },
    };
  }

  // ─── FIX 4: body scroll lock ─────────────────────────────────────────────
  /**
   * Bloquea el scroll del body mientras el modal está visible.
   * El cleanup (return) se ejecuta cuando showModal pasa a false o el
   * componente se destruye.
   */
  $effect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  });

  /**
   * Bets a mostrar: prioriza los frescos (traídos al abrir/refrescar el
   * modal). Si todavía no hay frescos, usa el prop. Si el fetch falló,
   * `freshBets` queda en su valor anterior (o vacío) y se usa el prop
   * como fallback implícito.
   */
  const displayBets = $derived(freshBets.length > 0 ? freshBets : bets);

  /**
   * Set de todos los participantes que han apostado al menos una vez
   * (a través de todos los partidos, no solo hoy). No incluye gente
   * registrada en `participantes` que nunca apostó.
   * @type {Set<string>}
   */
  const allParticipants = $derived.by(() => {
    const set = new Set();
    for (const b of displayBets) {
      if (b.participant) set.add(b.participant);
    }
    return set;
  });

  /**
   * Set de participantes que YA apostaron HOY.
   *
   * La hoja `apuestas` solo guarda predicciones de score (no hay
   * champion/runnerup/topscorer), así que no filtramos por `b.type`:
   * el campo no existe en la respuesta de `get_all_pwa_bets.php`
   * y siempre sería `undefined` en los datos frescos. Filtrar por
   * `b.type === 'score'` en `freshBets` hacía que `todayBettors`
   * quedara SIEMPRE vacío → `missing` = todos los participantes
   * históricos (bug que daba "51 Pendientes" cuando la realidad
   * eran menos).
   * @type {Set<string>}
   */
  const todayBettors = $derived.by(() => {
    const set = new Set();
    for (const b of displayBets) {
      if (b.participant && b.matchDate === todayDate) {
        set.add(b.participant);
      }
    }
    return set;
  });

  /** Lista de faltantes, ordenada alfabéticamente. */
  const missing = $derived(
    [...allParticipants]
      .filter((p) => !todayBettors.has(p))
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
  );

  /** URL canónica del form (igual que el start_url del manifest). */
  const FORM_URL = "https://app.iedeoccidente.com/polla/#/apostar";

  /**
   * Texto base pre-armado. NO se usa directamente para el copy — va al
   * `textareaValue` (editable) y eso es lo que se copia.
   */
  const baseMessage = $derived.by(() => {
    if (missing.length === 0) return "";
    const lines = [];
    lines.push("🔔 Recordatorio polla 2026");
    lines.push(`Apuestas pendientes de hoy (${todayDate}):`);
    lines.push("");
    for (const name of missing) {
      lines.push(`• ${name}`);
    }
    if (firstMatchHHMM) {
      lines.push("");
      lines.push(
        `Los partidos inician a las ${firstMatchHHMM} (hora Colombia).`,
      );
      lines.push("La ventana cierra 1 minuto antes.");
    }
    lines.push("");
    lines.push(`👉 ${FORM_URL}`);
    return lines.join("\n");
  });

  /**
   * Sincroniza el textarea con el mensaje base SOLO cuando cambia el
   * conjunto de faltantes (no en cada tick del reloj). Para detectar el
   * cambio usamos un "signature" estable: el join de los nombres
   * faltantes. Si el admin ya editó el textarea y luego se une un
   * nuevo faltante, sobrescribimos (no hay forma de preservar sus
   * ediciones sin un sistema más complejo).
   */
  let lastMissingSig = "";
  $effect(() => {
    const sig = missing.join("|");
    if (sig !== lastMissingSig) {
      lastMissingSig = sig;
      textareaValue = baseMessage;
    }
  });

  /**
   * Trae la lista actualizada de bets desde Sheets. Guarda el resultado
   * en `freshBets`. No hace nada si ya hay un fetch en curso (anti-
   * spam al abrir/cerrar el modal rápido). Si falla, deja `freshBets`
   * intacto y guarda el error en `fetchError` para mostrarlo en el modal.
   *
   * Inyecta `type: 'score'` defensivamente: la hoja `apuestas` solo
   * guarda predicciones de score, pero el endpoint `get_all_pwa_bets`
   * NO devuelve el campo `type` (no existe en la hoja). Hacerlo acá
   * permite que cualquier derivación que filtre por `b.type === 'score'`
   * siga funcionando si alguien la agrega en el futuro, sin tener que
   * recordar el gotcha de la respuesta cruda del backend.
   */
  async function refresh() {
    if (loading) return;
    loading = true;
    fetchError = null;
    try {
      const result = await loadAllPwaBets();
      freshBets = (result.bets || []).map((b) => ({ ...b, type: "score" }));
      console.log("[PwaMissingBets] refreshed:", freshBets.length, "bets");
    } catch (e) {
      console.warn("[PwaMissingBets] refresh failed:", e);
      fetchError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  /**
   * Abre el modal y dispara un fetch en background. El modal abre
   * inmediato con los datos del prop; cuando el fetch termina, la lista
   * se actualiza sola. Si el fetch falla, el prop sirve de fallback y
   * se muestra un aviso.
   */
  function openModal() {
    showModal = true;
    refresh();
  }

  async function handleCopy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textareaValue);
      } else {
        // Fallback para http://localhost en browsers que no soportan
        // navigator.clipboard, o Safari viejo.
        const ta = document.createElement("textarea");
        ta.value = textareaValue;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyState = "copied";
      setTimeout(() => {
        copyState = "idle";
      }, 2000);
    } catch (e) {
      console.error("Clipboard write failed:", e);
      copyState = "error";
      setTimeout(() => {
        copyState = "idle";
      }, 2000);
    }
  }

  /** @param {Event} e */
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) showModal = false;
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === "Escape") showModal = false;
  }

  /** Color del badge: amber para "pendientes", verde para "todos al día". */
  const badgeClass = $derived(
    missing.length === 0
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : "bg-amber-500/20 text-amber-300 border-amber-500/40",
  );
</script>

<!-- Botón flotante (vive dentro del wrapper flex del PwaApp). -->
<button
  type="button"
  onclick={openModal}
  class="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full text-gray-300 hover:text-white text-xs font-medium transition-all backdrop-blur-md shadow-lg shadow-black/20 min-h-9"
  aria-label="Ver apuestas pendientes de hoy"
  title="Participantes que aún no han enviado sus apuestas de hoy"
>
  <span class="text-sm">📋</span>
  <span
    class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold border {badgeClass}"
  >
    {#if loading}
      <span
        class="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin"
      ></span>
    {:else}
      {missing.length}
    {/if}
  </span>
  <span class="hidden sm:inline">Pendientes</span>
</button>

<!-- ─── FIXES 1+2+3: portal + transiciones nativas + z-[9999] ──────────────
     use:portal    → mueve el nodo al <body>, escapa el backdrop-filter del
                     wrapper padre que rompía position: fixed.
     transition:fade → reemplaza animate-fade-in (clase custom no definida).
     in/out:fly    → reemplaza animate-slide-up (clase custom no definida).
     z-[9999]      → evita quedar bajo el propio wrapper z-50 del padre.
-->
{#if showModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    transition:fade={{ duration: 150 }}
    class="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      in:fly={{ y: 60, duration: 280, opacity: 1 }}
      out:fly={{ y: 60, duration: 200, opacity: 1 }}
      class="w-full md:max-w-2xl max-h-[92vh] flex flex-col bg-gray-900 text-white border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden"
    >
      <div
        class="p-5 md:p-6 border-b border-white/10 flex items-center justify-between gap-2 flex-shrink-0"
      >
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div
            class="w-10 h-10 rounded-full bg-amber-500/20 ring-1 ring-amber-500/40 flex items-center justify-center text-amber-300 text-xl shrink-0"
          >
            📋
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-lg md:text-xl font-black text-amber-300 truncate">
              Apuestas pendientes
            </h2>
            <p class="text-xs text-gray-400 truncate">
              {todayDate} · {missing.length} de {allParticipants.size} participante{allParticipants.size !==
              1
                ? "s"
                : ""} no han enviado
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={refresh}
          disabled={loading}
          class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 disabled:opacity-50 disabled:cursor-wait rounded-xl text-white text-base transition-all shrink-0"
          aria-label="Refrescar desde Sheets"
          title="Volver a consultar la hoja apuestas"
        >
          {#if loading}
            <span
              class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></span>
          {:else}
            🔄
          {/if}
        </button>
        <button
          type="button"
          class="w-9 h-9 flex items-center justify-center glass hover:bg-white/10 rounded-xl text-white text-xl transition-all shrink-0"
          onclick={() => (showModal = false)}
          aria-label="Cerrar">×</button
        >
      </div>

      {#if fetchError}
        <div
          class="mx-4 md:mx-6 mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-300 flex items-start gap-2"
        >
          <span aria-hidden="true">⚠️</span>
          <span
            >No pude actualizar desde Sheets (mostrando datos cacheados): {fetchError}</span
          >
        </div>
      {/if}

      <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {#if displayBets.length === 0}
          <div class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">⏳</div>
            <p class="text-sm">
              Cargando datos de apuestas desde la hoja <code
                class="text-cyan-400 font-mono">apuestas</code
              >…
            </p>
          </div>
        {:else if missing.length === 0}
          <div
            class="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center"
          >
            <div class="text-5xl mb-3">🎉</div>
            <h3 class="text-lg font-bold text-emerald-300 mb-1">
              ¡Todos han enviado sus apuestas!
            </h3>
            <p class="text-sm text-gray-400">
              Los {allParticipants.size} participantes registrados ya apostaron para
              el {todayDate}.
            </p>
          </div>
        {:else}
          <!-- Lista de faltantes -->
          <div>
            <h3 class="text-sm font-semibold text-gray-300 mb-2">
              Faltan {missing.length} participante{missing.length !== 1
                ? "s"
                : ""}:
            </h3>
            <ul
              class="bg-black/30 border border-white/10 rounded-2xl p-3 md:p-4 space-y-1 max-h-[30vh] overflow-y-auto"
            >
              {#each missing as name (name)}
                <li class="flex items-center gap-2 text-sm">
                  <span class="text-amber-300 shrink-0">•</span>
                  <span class="truncate">{name}</span>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Textarea editable + texto pre-armado -->
          <div>
            <label
              for="missing-bets-message"
              class="text-sm font-semibold text-gray-300 mb-2 block"
            >
              Mensaje para el grupo de WhatsApp
              <span class="text-xs text-gray-500 font-normal">(editable)</span>
            </label>
            <textarea
              id="missing-bets-message"
              bind:value={textareaValue}
              rows="10"
              class="w-full bg-black/40 border border-white/10 focus:border-cyan-500/60 rounded-2xl p-3 md:p-4 text-sm font-sans leading-relaxed text-white resize-y outline-none transition-all"
            ></textarea>
          </div>
        {/if}
      </div>

      <div
        class="p-4 md:p-5 border-t border-white/10 flex-shrink-0 bg-black/20 flex gap-2"
      >
        <button
          type="button"
          class="flex-1 py-3 glass hover:bg-white/10 rounded-2xl text-white font-bold transition-all min-h-12"
          onclick={() => (showModal = false)}>Cerrar</button
        >
        {#if missing.length > 0}
          <button
            type="button"
            class="flex-1 py-3 rounded-2xl text-white font-bold transition-all min-h-12
                            {copyState === 'copied'
              ? 'bg-emerald-500'
              : copyState === 'error'
                ? 'bg-red-500'
                : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/30'}"
            onclick={handleCopy}
          >
            {#if copyState === "copied"}
              ✓ Copiado
            {:else if copyState === "error"}
              ✗ No se pudo copiar
            {:else}
              📋 Copiar al portapapeles
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
