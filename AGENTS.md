# pollaweb — Copa del Mundo 2026 betting pool

Single-page Svelte 5 app. Users upload a WhatsApp chat export (JSON); the app
parses free-text Spanish bets into structured predictions, fetches real match
results, scores each bet, and ranks participants. UI strings are Spanish.

## Stack

- **Svelte 5 + Vite + Tailwind 4** (frontend-only SPA)
- **PHP** backend in `src/assets/` (Google Sheets read/write; deployed by
  hand to `https://app.iedeoccidente.com/gs/`)
- **JSDoc** for typing — there are no `.ts` source files in `src/`;
  `tsconfig.app.json` sets `allowJs: true, checkJs: true` so `npm run check`
  validates JSDoc types against `src/`.

## Commands

```bash
npm run dev       # Vite dev server (default http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # serve dist/
npm run check     # svelte-check + tsc (validates JSDoc types) — run before commit
npm run deploy    # build + publish to gh-pages

node test_parse.js        # smoke test for src/lib/parser.js
node test_match.js        # smoke test for match loading + findMatchForBet
node test_sort.mjs        # smoke test for sortByTimestampDesc in stores.svelte.js
node test_unique_bets.mjs # smoke test for uniqueBets dedup logic
node test_fuzzy.mjs       # smoke test for findMatchSuggestion (Levenshtein fallback)
node test_accuracy.mjs    # smoke test for globalAccuracy/participantAccuracy in accuracy.js
node test_team_stats.mjs  # smoke test for teamStandingsFromTeams in teamStats.js
node test_compare_bet.mjs # smoke test for compareBetWithMatch (home/away inversion)
node test_manual_bets.mjs # smoke test for parseManualBets (MANUAL_BETS injection)
node test_save_email.mjs  # smoke test for savePwaEmail + email regex + 'email-prompt' step wiring
```

Run from the repo root. `polla.json` is the sample WhatsApp export
used by most of them.

Refrescar ranking FIFA (mensual): abrir en navegador
`https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php`, pegar la tabla
de `https://www.fifa.com/es/world-rankings` y guardar. El JSON se cachea en
el host (`gs/fifa_cache.json`) y `loadFifaRankings()` en `src/lib/fifa.js`
lo consume en runtime. `public/fifa_rankings.json` queda como fallback
offline. El PHP vive en `src/assets/fetch_fifa_rankings.php`.

No automated test suite — `node test_*` are manual sanity checks. The
`test_*.mjs` ones shim `globalThis.$state = (o) => o` because they import
`stores.svelte.js`, which uses Svelte 5 runes unavailable outside the
Svelte runtime.

## Scoring (src/lib/api.js `compareBetWithMatch`, lines 123/130/133)

| Status     | Points |
|------------|--------|
| `exact`    | 5      |
| `correct`  | 3      |
| `incorrect`| 0      |

The only valid `status` values are `'pending' | 'exact' | 'correct' | 'incorrect'`
(`src/lib/types.js:23`). `ResultsModal.svelte` has an "Empates (2pt)" section
filtered on `b.points === 2`, but the scorer never assigns 2 — that branch
is dead UI, do not add a 2-pt tier.

## Architecture / data flow

1. **Parse** — `src/lib/parser.js`. `parseWhatsAppExport(json)` →
   `parseMessage(msg)` extracts up to four bet types per WhatsApp message:
   `champion`, `runnerup`, `topscorer`, `score`. Score parsing
   (`parseAllScoreBets`) is heuristic: flag emoji → country (`FLAG_MAP`),
   then team-name normalization via `TEAM_ALIASES`, then pairs teams with
   adjacent numbers across one or two lines.
2. **State** — `src/lib/stores.svelte.js`. Svelte 5 runes; `appState` is
   one `$state` object. Derived data are plain exported **functions**
   (`stats()`, `filteredBets()`, `participants()`, `uniqueDates()`), not
   `$derived` — call them in markup. `uniqueBets()` runs `betKey` +
   `shouldReplace` to dedup overlapping score bets per (participant, match)
   key, preferring `manuallyEdited` > higher `points` > newer. Also
   `participantAliases` (real name → display alias) lives on `appState`
   and is editable via `AliasModal`.
3. **Fetch + score** — `src/lib/api.js`. Match sources: `loadMatchesFromGitHub()`
   (openfootball `worldcup.json`, default) and `loadMatches()`
   (football-data.org; api key fetched at runtime from
   `https://app.iedeoccidente.com/pollaweb/config.php`, never in source).
   Match lookup is `findMatchForBet` in `stores.svelte.js` (exact teams
   + same date). When that returns null, `findMatchSuggestion` does a
   Levenshtein ≤ 2 fallback (e.g. `austria`→`australia`); the suggestion
   is attached to the bet as `suggestedMatch` and surfaced in the UI
   with "Aplicar / Descartar" buttons. `applyMatchSuggestion` /
   `dismissMatchSuggestion` in `stores.svelte.js` mutate the bet.
4. **Derived stats** — `src/lib/accuracy.js` (`globalAccuracy`, `participantAccuracy`, `specialBetTallies`) and `src/lib/teamStats.js` (`teamStandingsFromMatches`) compute stats consumed by UI modals. `src/lib/fifa.js` loads FIFA rankings from a PHP endpoint with a `public/fifa_rankings.json` offline fallback.
5. **Persistence** — Google Sheets es la única fuente de verdad. El
   frontend **no usa `localStorage`**: cada mutación (`applyMatchSuggestion`,
   `dismissMatchSuggestion`, `BetModal.saveChanges`, `DropZone`,
   `AdminUploadModal`, fin de `analyzeBets`) llama a
   `saveBetsToSheets(appState.bets)` (`src/lib/api.js`). El `php` en
   `src/assets/save_bets.php` hace UPSERT de las 20 columnas A:T para
   que las columnas calculadas (`status`, `points`, `real_result`,
   `verified`, `manuallyEdited`) se persistan junto con los datos crudos.
   Endpoints: `https://app.iedeoccidente.com/gs/{save,get,clear}_bets.php`
   (`SHEETS_SPREADSHEET_ID` hardcoded en `api.js:9`). Aliases usan los
   mismos endpoints con `worksheetTitle: 'alias'`.
6. **Orchestration** — `src/App.svelte analyzeBets(useGitHub = false)`
   (line 118). Loads matches, maps each bet through `findMatchForBet` +
   `compareBetWithMatch`, persists via `saveBetsToSheets`, and computes
   the winner ranking. Note: the parameter defaults to `false` but every
   call site in `App.svelte` passes `true` — do not "fix" that to
    `useGitHub = true` without auditing callers.
 7. **Refresh** — `App.svelte` lee desde Sheets **una sola vez** al montar
    vía `refreshFromSheets()`. Recargas adicionales son siempre manuales:
    botón 🔄 en el header, opción "Recargar desde Sheets" en el menú
    móvil, o "Reintentar" del banner rojo de solo-lectura. **No** se
    recarga en `focus`/`visibilitychange` (cerrar modales disparaba
    `focus` y provocaba cargas extra no deseadas). Si Sheets falla al
    montar, se setea `appState.sheetsUnavailable` y aparece el banner
    rojo de solo-lectura.
 8. **Manual bets** — `src/lib/manualBets.js` exporta `MANUAL_BETS`, una
    lista de mensajes sintéticos con la misma forma que produce un export
    real de WhatsApp (más `synthetic: true` y `source: <nota>` para
    trazabilidad). Cubre el caso en que el export omitió un mensaje que
    el participante sí envió (bug conocido de WhatsApp: mensajes no
    sincronizados al momento de exportar no salen en el JSON, pero sí
    son visibles en la app). `parser.js → parseManualBets()` los
    convierte en `Bet[]` con la misma pipeline que el resto. Se
    inyectan en `App.svelte refreshFromSheets` y en
    `DropZone.svelte handleFile` antes de asignar a `appState.bets` y
    antes de `saveBetsToSheets`, para que siempre viajen en el payload
    y sobrevivan re-uploads. Convención de `Message Id`:
    `manual_<participant-snake>_<YYYY-MM-DD>_<NNN>`. Una vez persistidas
    en Sheets (UPSERT por `id`), las apuestas manuales sobreviven aunque
    se borre la entrada del array — el array funciona como backfill si
    Sheets se reinicia.
 9. **PWA email prompt** — `src/lib/components/pwa/PwaEmailPromptModal.svelte`
    se muestra tras un cambio de contraseña exitoso (sólo aparece en el
    primer login, cuando `mustChangePassword === true`). El step
    `email-prompt` (en `src/lib/pwa/session.svelte.js`) se inserta
    entre `change-password` y `form`: `completePasswordChange()` ahora
    salta a `email-prompt` en vez de `form`; sólo cuando el modal se
    cierra (`completeEmailPrompt()`) se avanza a `form`. El modal
    ofrece dos botones iniciales: **"Sí, quiero notificaciones"** y
    **"No, gracias"**. Si elige sí, aparece un input con validación en
    vivo (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) y se llama a
    `savePwaEmail()` (`src/lib/api.js`) que hace POST a
    `https://app.iedeoccidente.com/gs/save_pwa_email.php`. El email se
    guarda en la **columna E** de la hoja `participantes` (mismo
    spreadsheet, header `email`); un string vacío lo borra. La columna
    E es opcional — el resto de los endpoints que leen la hoja
    (`login_pwa.php`, `change_pwa_password.php`, `save_pwa_bet.php`,
    `get_pwa_bets.php`) ya usan el rango `A2:E1000` de forma
    retrocompatible. El modal se descarta con la X, con Escape o con
    "Omitir" — el email queda simplemente en blanco.

## Conventions

- Svelte 5 runes throughout: `$state`, `$derived`, callback props
  (`onClose`, `onSelectBet`) instead of `createEventDispatcher`,
  `onclick={...}` attributes.
- Types via JSDoc `@typedef` in `src/lib/types.js`; reference as
  `/** @type {import('./types.js').Bet} */`.
- Router: `svelte-spa-router` (hash-based).
- Heavy `console.log` debug output is left in `parser.js`, `api.js`, and
  `App.svelte` for match-debugging — do not strip without a reason.

## Gotchas

- **Single canonical team-alias map** lives in `parser.js`
  (`TEAM_ALIASES`, `normalizeTeamName`). `api.js`, `flags.js`, and
  `stores.svelte.js` all import `normalizeTeamName` from there. Add new
  teams there only, and keep it idempotent:
  `normalizeTeamName(canonical) === canonical` for every openfootball name
  (`Czech Republic`, `USA`, `Bosnia & Herzegovina`, `Curaçao`, …).
- **`src/lib/parser2.js` is dead code** (`// @ts-nocheck`, not imported
  anywhere in `src/`). It is an alternate parser draft — edit `parser.js`
  for real changes.
- **CLAUDE.md and GEMINI.md are stale** (they were copied from an older
  state and still claim the Vite base is `/polla2026/`; it is actually
  `/polla/`). Prefer this file.
- **Three flag/alias maps diverge** and must be kept in sync when adding
  a country: `parser.js` `FLAG_MAP` (parser-time emoji lookup),
  `parser2.js` `FLAG_MAP` (dead, but has the `🇨🇱 = Chile` fix), and
  `flags.js` `TEAM_TO_ISO` (display). Display data (URL, emoji, Spanish
  name) comes from `public/countries.json`.
- **Vite base path is `'/polla/'`** (`vite.config.ts:7`). It was
  `/pollawebsv/` until commit `ac11324`; `npm run deploy` publishes to
  the gh-pages branch of the current repo, so the base must match the
  GitHub Pages URL (`<user>.github.io/<repo>/`). The `.claude/settings.local.json`
  history references `pollawebsv` — confirm the deploy target before
  publishing.
- **PHP files in `src/assets/`** are not part of the Vite build. They are
  deployed manually and need `vendor/` (Google Sheets PHP SDK) plus
  `assets/serviceaccount.json` (service-account key, not in repo) on the
  server. The `*_horas_extras.php` files belong to an unrelated app
  sharing the same host — leave them alone.
- **`cruces-no-calificables.md`** in the repo root is a one-off parser
  smoke-test report (manually checked on `polla.json`); not part of the
  app. **`consola.log`** is untracked debug stdout; do not commit.
