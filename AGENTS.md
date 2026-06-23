# pollaweb — Copa del Mundo 2026 betting pool

Svelte 5 SPA: users log in (PWA), pick daily score bets for World Cup 2026
matches, and the app scores them against `openfootball/worldcup.json` and
ranks participants. Backend is PHP on `https://app.iedeoccidente.com/gs/`
that reads/writes Google Sheets. UI strings are Spanish.

> The PWA is the **only** active product. The original WhatsApp-upload flow
> is preserved as `_archived_*` files in `src/lib/components/` and is **not
> built, not deployed, and not developed**. See "What's active vs archived"
> below before touching code.

## Stack

- **Svelte 5 (runes) + Vite + Tailwind 4** — `src/`
- **PHP backend** in `src/assets/` — deployed by hand to
  `https://app.iedeoccidente.com/gs/`. Not part of the Vite build. Needs
  `vendor/` (Google API PHP client) and `assets/serviceaccount.json`
  (service account key, **not** in repo) on the server.
- **JSDoc types** — no `.ts` source files. `tsconfig.app.json` sets
  `allowJs: true, checkJs: true` so `npm run check` validates JSDoc.
- **PWA** via `vite-plugin-pwa` (`src/main.js`, configured in
  `vite.config.ts`). Auto-update on `visibilitychange` + every 60 min.

## Commands

```bash
npm run dev        # Vite dev (default :5173). PWA SW enabled in dev.
npm run build      # production build → dist/
npm run preview    # serve dist/
npm run check      # svelte-check + tsc (validates JSDoc) — run before commit
npm run deploy     # build + publish to gh-pages

node test_*.{js,mjs}   # 20 smoke tests; sample fixture: polla.json
```

There is no automated test suite — `node test_*` are sanity checks. The
`.mjs` ones that import `stores.svelte.js` or `session.svelte.js` shim
`globalThis.$state = (o) => o` because they need to import Svelte 5 runes
modules outside the Svelte runtime.

## What's active vs archived

- **Active (PWA)** — `src/lib/components/pwa/`, `src/lib/pwa/`,
  `src/lib/api.js` PWA functions (`loginPwa`, `savePwaBet`, `getPwaBets`,
  `loadAllPwaBets`, `changePwaPassword`, `savePwaEmail`), the matching
  PHP endpoints (`*_pwa*.php`, `seed_apuestas_from_json.php`).
  `src/App.svelte` is a **pure redirector**: registers the SW and forces
  every hash to `/#/apostar`. `PwaApp.svelte` is the real orchestrator
  (router, data loading, scoring).
- **Archived (legacy WhatsApp flow)** — `src/lib/components/_archived_*`,
  the rest of `src/lib/api.js` (`loadBetsFromSheets`, `saveBetsToSheets`,
  `clearBetsFromSheets`, `getAliasesFromSheets`, `saveAliasesToSheets`),
  and the `datos` sheet on Sheets. The `_archived_*` files are excluded
  from `tsconfig.app.json` (`exclude: ["src/**/_archived_*"]`) and nothing
  imports them in the active code path.
  `appState.bets` (in `src/lib/stores.svelte.js`) is **only mutated by
  archived components** — the PWA does not load it.

## PWA data flow (active)

1. **Routing** — hash-based. `App.svelte` redirects any non-`apostar` hash
   to `/#/apostar`. Real routing is `pwaSession.step` (Svelte 5 runes
   `$state` in `src/lib/pwa/session.svelte.js`, persisted in
   `sessionStorage` under `pwaSession`).
2. **Steps** —
   `'landing' | 'login' | 'ranking' | 'change-password' | 'email-prompt'
    | 'form' | 'done' | 'history' | 'results' | 'movement' | 'today-bets'
    | 'tutorial'`.
   The chain `login → change-password → email-prompt → form` is forced
   on first login if `loginPwa` returns `mustChangePassword: true` or
   `mustProvideEmail: true`. Email prompt (`PwaEmailPromptModal`) is
   skipped on `Omitir` / X / Escape and writes an empty column E.
3. **Load** — `PwaApp.svelte load()` calls
   `loadWorldCupMatches()` (openfootball, `NetworkOnly` in the SW +
   `cache: 'no-store'` in the fetch) and `loadAllPwaBets()` (public,
   reads `apuestas` sheet for the ranking/movement). Match lookup uses
   `findMatchForBet` (exact teams + same date) and `compareBetWithMatch`
   for scoring. Bet IDs in `apuestas` are deterministic:
   `pwa_<phone>_<date>_<matchId>` (see `save_pwa_bet.php:258`).
4. **Submit** — `savePwaBet(payload)` from `PwaForm.svelte`. The PHP is
   **INSERT-only / immutable**: it refuses if `mustChangePassword` or
   `mustProvideEmail` is still true, and returns `saved: N, alreadyExists: M`
   when a duplicate id is sent.
5. **Confirmation email** — `save_pwa_bet.php → sendBetConfirmationEmail()`
   fires on every successful save (inserts and all-duplicate submits
   alike). Recipient is the email in `participantes` column E
   (already read by `authenticate()`); CC to `ceslep@gmail.com` for
   monitoring. Uses PHPMailer via el mismo `vendor/autoload.php` as the
   cron. SMTP failure is fire-and-confirm: the bet stays in Sheets,
   the error is logged, the JSON response is still 200. Skipped when
   `dev: true` or when column E is empty.
6. **Scoring** — `src/lib/api.js → compareBetWithMatch()` (lines 141–175).
   Only `status: 'pending' | 'exact' | 'correct' | 'incorrect'` is valid
   (`src/lib/types.js:23`). 5/3/0 points. The function inverts
   home/away if `findMatchForBet` matched with the bet's teams swapped
   (case: "Morocco 3 Scotland 1" matched against a Scotland-home game).
7. **Re-entry guard ("ya enviaste hoy")** — `PwaApp.svelte` corre un
   `$effect` post-autenticación que se dispara cuando `step === 'form'`
   con `authUsername + authPassword + pwaSession.date` listos. Llama
   `getPwaBets({ matchDate: pwaSession.date })` y, si hay bets, redirige
   a `PwaDone` con `mode='already-submitted'` (sin confeti, tono info
   tipo "Ya enviaste tus apuestas / son inmutables"). El check también
   se aplica en `PwaApp.load()` (step='form' incluido en la lista de
   steps que redirigen) y en el `PwaForm.svelte:27-31` (defensa en
   profundidad: si `submitted=true`, va a `done`). El `save_pwa_bet.php`
   sigue siendo idempotente como red de seguridad. **Dev mode salta el
   check** (queremos iterar marcadores libremente). Cubierto por
   `test_pwa_already_bet.mjs`.

## Persistence

- **Active source of truth** — Google Sheets spreadsheet
  `1PIo_oV…` (hardcoded `SHEETS_SPREADSHEET_ID` in `src/lib/api.js:30`),
  worksheets:
    - `apuestas` (PWA bets, immutable) — written by `save_pwa_bet.php`,
      read by `get_pwa_bets.php` (auth) and `get_all_pwa_bets.php`
      (public, used for ranking/movement).
    - `participantes` (columns A:E — name, phone, password last-4,
      `mustChangePassword` flag, optional `email`) — read by `login_pwa.php`,
      `change_pwa_password.php`, `save_pwa_email.php`. All use range
      `A2:E1000`.
    - `mail_log` — written by `cron_ranking_report.php` to keep the
      ranking-report email idempotent (one email per participant per
      matchday; dedup by `body_hash` md5).
  - `datos` (legacy WhatsApp bets) — kept on the sheet for history. Not
    written by active code.
  - `alias` (legacy real name → display alias) — kept for history.
- **No `localStorage` for state** — only `sessionStorage` keys:
  `pwaSession` (the auth + step), `pwaSeenTour` (Driver.js tour,
  per-device), `pwaSeenIntro` (Three.js intro, per-tab).
- **Refresh is manual** — `PwaApp.svelte load()` runs once on mount.
  Re-fetches are: the header 🔄 button, the mobile-menu "Recargar desde
  Sheets", or the `🔄 Reintentar` button on the no-matches error screen.
  There is no auto-reload on `focus` / `visibilitychange` (closing modals
  used to fire focus and re-fetch Sheets unintentionally).
- **Service-worker cache policy** (`vite.config.ts` workbox rules):
    - `app.iedeoccidente.com/gs/*` → `NetworkOnly` (no cache; bets and
      results must come fresh).
    - `raw.githubusercontent.com/openfootball/*` → `NetworkOnly`. Was
      `StaleWhileRevalidate` originally, but a 24h-stale openfootball
      cache made users see "Pendiente" after matches finished.
    - `app.iedeoccidente.com/pollaweb/*` → `StaleWhileRevalidate` (FIFA
      rankings + config).
  The user-facing `CacheClearButton.svelte` (top-right in the PWA)
  forces a full SW + Cache API reset for stale-state recovery.

## Scoring reference

| Status     | Points | Notes                            |
|------------|--------|----------------------------------|
| `exact`    | 5      | same score                       |
| `correct`  | 3      | winner correct (sign of diff)    |
| `incorrect`| 0      |                                  |
| `pending`  | 0      | match not finished / not found   |

There is **no 2-point tier**. The `ResultsModal.svelte` has a dead
"Empates (2pt)" filter (`b.points === 2`) that never matches; do not
add one. Archived component — only relevant as historical reference.

## Conventions

- Svelte 5 runes throughout: `$state`, `$derived`, `$derived.by`,
  callback props (`onClose`, `onSelectBet`) instead of
  `createEventDispatcher`, `onclick={...}` attributes.
- Types via JSDoc `@typedef` in `src/lib/types.js`; reference as
  `/** @type {import('./types.js').Bet} */`. `parser2.js` is a
  `// @ts-nocheck` dead-code draft — never edit it for behavior changes.
- Heavy `console.log` is intentionally left in `parser.js`, `api.js`,
  and `PwaApp.svelte` for live match debugging. Don't strip without
  a reason.
- `polla.json` is the sample WhatsApp export used by ~all smoke tests.
- **Pre-match password gate** in `PwaTodayBets` and `PwaShareBets`:
  from 00:00 COT of a day with matches until **1 minute before the
  first COT match of the day**, both views ask for the hardcoded
  password `PREMATCH_PASSWORD` in `src/lib/pwa/prematchGuard.js`
  (currently `"polla2026"`). The cutoff (`PREMATCH_BUFFER_MS = 60_000`)
  coincides with `computeWindowState`'s `closeAt` in `window.js:127` —
  the betting window and the password gate close at the same instant.
  The flag is **computed centrally in `PwaApp.svelte`** (which holds
  the only reference to `rawMatches` — the full openfootball list) and
  passed down as `preMatchInfo = { required, firstMatchHHMM }`. Do
  **not** recompute it in the components and do **not** pass
  `pwaNormalizedMatches` for this purpose — that array is filtered to
  only finished matches, so on a day with no completed games yet it
  has zero entries for `today` and the gate would never activate.
  The unlock is **not persisted** — every mount of the page / modal
  starts locked. The gate is UX-only (avoid leaking bets before
  kickoff); anyone with the URL can read Sheets directly.
- **Botón "Pendientes"** (`PwaMissingBetsButton.svelte`): flotante a la
  izquierda del de "Borrar cache" (ambos viven en un wrapper flex
  `fixed top-3 right-3 z-50` en `PwaApp.svelte`). Muestra los
  participantes que NO tienen apuesta de tipo `score` con
  `matchDate === todayDate`. La lista de "todos los participantes" se
  deriva de los nombres únicos en `pwaScoredBets` — **NO incluye** a
  quien se registró en la hoja `participantes` y nunca apostó. El
  modal trae un `<textarea>` editable con el texto pre-armado para
  notificar por WhatsApp + botón copiar (mismo patrón que
  `PwaShareBets`). El botón muestra un badge con el conteo: amber
  para "faltan N", verde para "todos al día".
- The `parser.js` champion/runner-up flag regex (lines 413, 441) only
  lists the original 28 flags. Adding a new country requires updating
  `FLAG_MAP` (parser.js), `TEAM_ALIASES`, the regex, `TEAM_TO_ISO` in
  `src/lib/flags.js`, and `public/countries.json` (URL, emoji, Spanish
  name). `parser2.js` also has its own `FLAG_MAP` — keep it in sync
  (or just delete it) if you touch flags.
- `dev-dist/`, `dist/`, `consola.log`, `dev-stdout.log`, `dev-stderr.log`
  are debug outputs (the `dev-*` come from `vite dev`); `node_modules/`
  is in `.gitignore` (standard Vite template). The root also has
  committed dev artifacts: `aexpt.json`, `apolla.json`, `at.json`,
  `nuevot.json`, `polla.json`, `pollat.json`, `polla_clean.json`,
  `yohn_alcaraz.json`, `apuestas_seed.csv`, `apuestas_pending.csv`,
  `ew.txt`, `cruces-no-calificables.md`, plus the build/merge scripts
  `build_apuestas_csv.mjs`, `build_nuevot.mjs`, `export_clean_*.mjs`.
  Treat them as project data; don't `git rm` without asking.

## Setup

- Node 20+. `npm install` is enough to get a working dev environment.
- Dev: `npm run dev` → `http://localhost:5173`. The PWA detects
  `localhost` / `127.0.0.1` via `isDev` in `PwaApp.svelte` and runs
  `buildDevState()`: it **fabricates an "open" window using the closest
  COT day with matches** (past or future) and sets `pwaSession.date` to
  that day, ignoring the real clock. This means you can develop against
  any matchday in `worldcup.json` without waiting for it. `getPwaBets` /
  `savePwaBet` skip auth in dev via the `dev: true` flag in the payload.
- `football-data.org` key is fetched at runtime from
  `https://app.iedeoccidente.com/pollaweb/config.php` and cached in
  memory (`getConfig()` in `api.js`). Only `loadMatches()` uses it, and
  the PWA uses `loadWorldCupMatches` from openfootball instead — this
  key is only relevant for the archived path.
- Refrescar ranking FIFA (mensual): abrir
  `https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php`, pegar la
  tabla de `https://www.fifa.com/es/world-rankings` y guardar. Cacheado
  en el host (`gs/fifa_cache.json`); `loadFifaRankings()` en
  `src/lib/fifa.js` lo consume. `public/fifa_rankings.json` queda como
  fallback offline.

## Gotchas (PWA-active ones)

- **Vite base path is `'/polla/'`** (`vite.config.ts:13`). It was
  `/pollawebsv/` until commit `ac11324`; `npm run deploy` publishes to
  the gh-pages branch of the current repo, so the base must match the
  GitHub Pages URL (`<user>.github.io/<repo>/`). `CLAUDE.md` and
  `GEMINI.md` are stale (still claim the old base) — trust this file.
- **Single canonical team-alias map** lives in `parser.js`
  (`TEAM_ALIASES`, `normalizeTeamName`). `api.js`, `flags.js`, and
  `stores.svelte.js` import `normalizeTeamName` from there. Add new
  teams there only. `normalizeTeamName(canonical) === canonical` for
  every openfootball name (`Czech Republic`, `USA`, `Bosnia &
  Herzegovina`, `Curaçao`, …) — verify after editing.
- **Three flag/alias maps diverge**: `parser.js` `FLAG_MAP` (parser-time
  emoji lookup), `parser2.js` `FLAG_MAP` (dead but has the 🇨🇱 = Chile
  fix), and `flags.js` `TEAM_TO_ISO` (display). Keep in sync.
- **`computeWindowState` siempre toma el partido MÁS TEMPRANO en COT de
  cada día**, no el primero del array de openfootball. El JSON viene
  ordenado por estadio/grupo, NO por hora COT — el 2026-06-22 listaba
  France (17:00 UTC-4 = 16:00 COT) antes que Argentina (12:00 UTC-5 =
  12:00 COT). El entry del Map en `src/lib/pwa/window.js` incluye
  `firstMatchUtcMs` para comparar al iterar. Cubierto por
  `test_window.mjs` caso 6 (regresión).
- **PHP files in `src/assets/`** are not part of the Vite build. They
  are deployed manually. The `*_horas_extras.php` files in
  `src/assets/` belong to an unrelated app sharing the same host — leave
  them alone.
- **`useRegisterSW` is registered at `App.svelte`, not `PwaApp.svelte`**
  — that's intentional. `PwaApp.svelte` consumes the store via props
  (`needRefresh`, `offlineReady`, `updateServiceWorker`) so `ReloadPrompt`
  sees them without re-registering. Don't move the registration.

## Other instruction files (deprioritize)

- `CLAUDE.md` and `GEMINI.md` are stale copies from a prior state; the
  Vite base path in them is wrong. Prefer this file.
- `cruces-no-calificables.md` is a one-off parser smoke-test report
  (manually checked on `polla.json`); not part of the app.
