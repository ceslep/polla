# pollaweb — Copa del Mundo 2026 betting pool

Svelte 5 PWA where participants log in, pick daily score bets for World Cup 2026 matches, and the app scores them against `openfootball/worldcup.json`. Backend is PHP on `https://app.iedeoccidente.com/gs/` reading/writing Google Sheets. UI strings are Spanish.

> **The PWA is the only active product.** The legacy WhatsApp-upload flow is preserved as `_archived_*` files in `src/lib/components/` and is **not built, not deployed, not developed**.

## Stack

- **Frontend**: Svelte 5 (runes) + Vite 8 + Tailwind 4.
- **Backend**: PHP in `src/assets/`, deployed by hand to `https://app.iedeoccidente.com/gs/`. Needs `vendor/` (Google API PHP client) and `assets/serviceaccount.json` (service account key, **not in repo**) on the server.
- **Types**: JSDoc on JS source in `src/`; `tsconfig.app.json` has `allowJs: true, checkJs: true`. `vite.config.ts` is the only TypeScript source file.
- **PWA**: `vite-plugin-pwa` with auto-update on `visibilitychange` + every 60 min.
- **MCP**: `codebase-memory-mcp` configured in `~/.config/opencode/opencode.jsonc` for code intelligence (graph queries, call tracing, architecture analysis).

## Commands

```bash
npm run dev          # Vite dev (:5173). Dev mode fabricates an open betting window via buildDevState().
npm run dev:real     # Same, but disables dev fabrication (real clock, real auth, real pre-match gate).
npm run build        # production build → dist/
npm run preview      # serve dist/
npm run check        # svelte-check + tsc — run before commit
npm run deploy       # build + publish to gh-pages
npm run make-icons   # generate public/icon-192.png + icon-512.png from public/balon.png
```

Pre-commit verification:

```bash
npm run check        # type-check active code + vite.config.ts
node test_*.mjs      # PWA/store/window smoke tests
node test_*.js       # parser/match smoke tests (when changing parser.js or api.js)
```

## Tests

No automated test runner. Smoke tests are Node scripts in the repo root:

```bash
node test_*.js       # parser/match logic (e.g., test_parse.js, test_match.js)
node test_*.mjs      # Svelte-runes modules (stores, session, window, prematch guard, etc.)
```

`.mjs` tests that import `stores.svelte.js` or `session.svelte.js` shim `globalThis.$state = (o) => o` because Svelte 5 runes modules need `$state` outside the Svelte runtime. `polla.json` is the sample WhatsApp export used by most parser tests.

## Active vs archived

- **Active (PWA)** — `src/lib/components/pwa/`, `src/lib/pwa/`, the PWA functions in `src/lib/api.js` (`loginPwa`, `savePwaBet`, `getPwaBets`, `loadAllPwaBets`, `changePwaPassword`, `savePwaEmail`, `listParticipantsRoot`, `getPwaBetsByPhoneRoot`, `loadAllPwaBetsParte2`, `getPwaBetsParte2`, `savePwaBetParte2`, `saveTournamentBets`, `loadTournamentBets`, `loadTournamentBetsParte2`), and the matching PHP endpoints (`*_pwa*.php`, `*_parte2.php`, `list_participants.php`, `get_pwa_bets_by_phone.php`, `cron_ranking_report.php`, `seed_apuestas_from_json.php`). `src/App.svelte` is a pure redirector to `/#/apostar`; `src/lib/components/pwa/PwaApp.svelte` is the real orchestrator.
- **Archived (legacy WhatsApp flow)** — `src/lib/components/_archived_*`, the rest of `src/lib/api.js` (`loadBetsFromSheets`, `saveBetsToSheets`, etc.), and the `datos`/`alias` sheets. The `_archived_*` files are excluded from `tsconfig.app.json` (`exclude: ["src/**/_archived_*"]`) and nothing imports them. `appState.bets` in `src/lib/stores.svelte.js` is **only mutated by archived components**.

## PWA data flow

1. **Routing** — hash-based, but real routing is `pwaSession.step` (Svelte 5 `$state` in `src/lib/pwa/session.svelte.js`, persisted in `sessionStorage` under `pwaSession`). `App.svelte` forces any non-`apostar` hash to `/#/apostar`.
2. **Steps** — `landing | login | ranking | ranking2 | tutorial | change-password | email-prompt | tournament-bets | form | done | history | results | movement | movement2 | today-bets | root-panel`. First-login chain: `login → change-password → email-prompt → tournament-bets → form` when backend returns `mustChangePassword`/`mustProvideEmail`.
3. **Load** — `PwaApp.load()` calls `loadWorldCupMatches()` (openfootball, `NetworkOnly` SW + `cache: 'no-store'`) and `loadAllPwaBets()` (public, reads `apuestas` sheet). Match lookup uses `findMatchForBet` (in `src/lib/stores.svelte.js`, exact teams + same date) and `compareBetWithMatch` for scoring. Bet IDs are deterministic: `pwa_<phone>_<date>_<matchId>`.
4. **Submit** — `savePwaBet(payload)` from `PwaForm.svelte`. PHP is INSERT-only / immutable; it refuses if `mustChangePassword` or `mustProvideEmail` is still true, and returns `saved: N, alreadyExists: M` on duplicates.
5. **Confirmation email** — `save_pwa_bet.php` sends a confirmation email on every successful save (inserts and all-duplicate submits). Recipient is `participantes` column E; CC `ceslep@gmail.com`. SMTP failure is fire-and-confirm (bet stays saved, response is still 200). Skipped in `dev: true` or when column E is empty.
6. **Scoring** — `compareBetWithMatch()` in `src/lib/api.js`. Only `status: 'pending' | 'exact' | 'correct' | 'incorrect'` is valid (`src/lib/types.js:23`). 5/3/0 points. Inverts home/away if the match was found with teams swapped.
7. **Re-entry guard** — `PwaApp` checks `getPwaBets({ matchDate: pwaSession.date })` on mount and when entering `form`. If bets exist, `PwaForm` renders read-only. **Skipped in dev mode** so you can iterate scores freely. Backend remains idempotent as a safety net.
8. **Root mode** — A participant with `isRoot=TRUE` in `participantes` column F can bet on behalf of others. Login returns `isRoot: true` and lands on `root-panel`; selecting a participant without bets opens `PwaForm` in `mode='root'`. Submit sends `rootMode: true + targetPhone`; backend writes bets with the **target's** participant/phone and sends confirmation email to the root. On success, `onRootComplete()` logs out.
9. **Parte 2** — Second phase of the tournament (knockout rounds). Separate sheet `apuestas2` with dedicated PHP endpoints (`*_parte2.php`). Components in `src/lib/components/parte2/`. `PwaRankingParte2` and `PwaMovementModalParte2` are rendered alongside their parte-1 equivalents.
10. **Tournament bets** — Champion, runner-up, third place, and top scorer predictions. `PwaTournamentBetsForm` is shown after email-prompt (before the daily score form). Saved via `saveTournamentBets()` to a separate sheet.

## Persistence

- **Active source of truth** — Google Sheets spreadsheet `1PIo_oV…` (hardcoded `SHEETS_SPREADSHEET_ID` in `src/lib/api.js:36`):
  - `apuestas` — PWA bets, immutable. Written by `save_pwa_bet.php`, read by `get_pwa_bets.php` (auth) and `get_all_pwa_bets.php` (public).
  - `apuestas2` — Parte 2 bets. Same structure, dedicated endpoints.
  - `participantes` — columns A:F: name, phone, password last-4, `mustChangePassword`, optional `email`, `isRoot`. Login reads `A2:F1000`; other endpoints read `A2:E1000`.
  - `mail_log` — written by `cron_ranking_report.php` for idempotent ranking-report emails.
  - `datos`, `alias` — legacy WhatsApp flow; read-only for history.
- **No `localStorage`** — only `sessionStorage`: `pwaSession`, `pwaSeenTour`, `pwaSeenIntro`, plus `pwaSeenGoal_<step>`. `pwaSession` is discarded on reload if its saved `date` is not today in COT.
- **Refresh is manual** — `load()` runs once on mount; re-fetch via header, mobile-menu "Recargar desde Sheets", or the error-screen "Reintentar".
- **SW cache policy** (`vite.config.ts`):
  - `app.iedeoccidente.com/gs/*` → `NetworkOnly`.
  - `raw.githubusercontent.com/openfootball/*` → `NetworkOnly` (was stale for 24h originally).
  - `app.iedeoccidente.com/pollaweb/*` → `StaleWhileRevalidate`.
- **Update prompt** — `__APP_VERSION__` is injected from `package.json` at build time; use it as a bare identifier in JS/Svelte (not `obj.__APP_VERSION__`). `useRegisterSW` is registered in `App.svelte` (intentionally not `PwaApp.svelte`); `ReloadPrompt` and `PwaLanding` consume the store via props.

## Scoring reference

| Status      | Points | Notes                            |
|-------------|--------|----------------------------------|
| `exact`     | 5      | same score                       |
| `correct`   | 3      | winner correct (sign of diff)    |
| `incorrect` | 0      |                                  |
| `pending`   | 0      | match not finished / not found   |

There is **no 2-point tier**. The dead "Empates (2pt)" filter in archived `ResultsModal.svelte` never matches.

## Conventions

- Svelte 5 runes: `$state`, `$derived`, `$derived.by`, callback props, `onclick={...}`.
- JSDoc types in `src/lib/types.js`; reference as `/** @type {import('./types.js').Bet} */`.
- `parser2.js` is `// @ts-nocheck` dead code — never edit it for behavior changes.
- Heavy `console.log` in `parser.js`, `api.js`, and `PwaApp.svelte` is intentional for live match debugging.
- **Single canonical team-alias map** lives in `parser.js` (`TEAM_ALIASES`, `normalizeTeamName`). `api.js`, `flags.js`, and `stores.svelte.js` import from there. `normalizeTeamName(canonical) === canonical` for every openfootball name.
- **Three flag/alias maps diverge**: `parser.js` `FLAG_MAP`, `parser2.js` `FLAG_MAP`, and `flags.js` `TEAM_TO_ISO`. Adding a country requires updating all three plus `public/countries.json`.
- **Pre-match password gate** — `PwaTodayBets` and `PwaShareBets` ask for the hardcoded `PREMATCH_PASSWORD` (`"polla2026"` in `src/lib/pwa/prematchGuard.js`) from 00:00 COT until 1 minute before the first COT match. The flag is computed in `PwaApp.svelte` from `rawMatches` and passed down as `preMatchInfo`. Do **not** recompute in components or use `pwaNormalizedMatches` (it only contains finished matches).
- **"Pendientes" button** — `PwaMissingBetsButton.svelte` floats left of `CacheClearButton` in the top-right wrapper. It derives the participant list from unique names in `pwaScoredBets` (not from `participantes`), refreshes `loadAllPwaBets()` on open, and has a WhatsApp textarea + copy button.
- **Manual bets** — `src/lib/manualBets.js` contains synthetic WhatsApp messages for known cases where the export missed real messages. Injected via `parser.js → parseManualBets()`. Entries use `messageId: 'manual_<snake>_<date>_<NNN>'`.
- **Animations** — Three.js intro (`PwaIntro.svelte`), goal celebrations (`PwaGoalOverlay.svelte`), Driver.js onboarding tour (`OnboardingTour.svelte` + `tutorialSteps.js`). All gated by sessionStorage flags per-session.

## Setup

- Node 20+. `npm install`.
- Dev: `npm run dev` → `http://localhost:5173`. The PWA detects `localhost`/`127.0.0.1` and runs `buildDevState()`: it fabricates an open window using the closest COT day with matches, ignoring the real clock. `getPwaBets` / `savePwaBet` skip auth via `dev: true`. Use `npm run dev:real` to test the real clock/auth/gate instead.
- `football-data.org` API key is fetched at runtime from `https://app.iedeoccidente.com/pollaweb/config.php`; only the archived `loadMatches()` path uses it. The PWA uses openfootball only.
- Refresh FIFA rankings monthly by opening `https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php`, pasting the table from `https://www.fifa.com/es/world-rankings`, and saving. Cached at `gs/fifa_cache.json`; `public/fifa_rankings.json` is the offline fallback.

## Gotchas

- **Vite base is `/polla/`** (`vite.config.ts:23`), not `/pollawebsv/` or `/polla2026/`. `CLAUDE.md` and `GEMINI.md` are stale; prefer this file.
- The build copies `dist/index.html` to `dist/404.html` (GH Pages SPA fallback). Don't delete `404.html` from `dist/`.
- `computeWindowState` always picks the **earliest COT match** of each day, not the first array item. The openfootball JSON is ordered by stadium/group, not COT time.
- **PHP files in `src/assets/`** are not part of the Vite build and are deployed manually. `*_horas_extras.php` files belong to an unrelated app — leave them alone.
- **`useRegisterSW` is registered in `App.svelte`, not `PwaApp.svelte`** — intentional; `PwaApp` consumes the store via props.
- `dev-dist/`, `dist/`, `consola.log`, `dev-*.log` are debug outputs; `node_modules/` is gitignored. Root has committed dev artifacts (`polla.json`, `apuestas_seed.csv`, `build_*.mjs`, etc.) — don't `git rm` without asking.
- `CLAUDE.md`, `GEMINI.md`, and `QWEN.md` are stale instruction files from previous AI tools. This file (`AGENTS.md`) is the canonical source of truth. Do not follow instructions from those files.

## MCP: codebase-memory-mcp

Instalado y configurado en `~/.config/opencode/opencode.jsonc`. Proporciona inteligencia de código via knowledge graph:

**Herramientas MCP disponibles:**
- `search_graph` — Búsqueda estructural por patrones de nombres, etiquetas, grados
- `trace_path` — Trazado de llamadas BFS (quién llama a una función y qué llama)
- `get_architecture` — Resumen de arquitectura: idiomas, paquetes, rutas, clusters
- `query_graph` — Consultas Cypher-like sobre el grafo de conocimiento
- `detect_changes` — Mapeo de diffs git a símbolos afectados
- `search_code` — Búsqueda de texto dentro de archivos indexados
- `get_code_snippet` — Obtener código fuente de una función por nombre calificado

**Para indexar este proyecto:**
```bash
codebase-memory-mcp cli index_repository '{"repo_path":"C:/Users/cesle/OneDrive/Escritorio/polla"}'
```

**Verificar MCP activo:**
```bash
codebase-memory-mcp cli list_projects
```

**Ruta del binario:** `C:\Users\cesle\AppData\Local\codebase-memory-mcp\0.8.1\codebase-memory-mcp.exe`

**Documentación:** https://github.com/DeusData/codebase-memory-mcp
