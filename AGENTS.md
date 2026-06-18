# pollaweb — Copa del Mundo 2026 betting pool

Single-page Svelte 5 app. Users upload a WhatsApp chat export (JSON); the app
parses free-text Spanish bets into structured predictions, fetches real match
results, scores each bet, and ranks participants. UI strings are Spanish.

## Stack

- **Svelte 5 + Vite + Tailwind 4** (frontend-only SPA; no Python here)
- **PHP** backend in `src/assets/` (Google Sheets read/write; deployed by
  hand to `https://app.iedeoccidente.com/gs/`)
- **JSDoc** for typing — there are no `.ts` source files in `src/`

## Commands

```bash
npm run dev       # Vite dev server (default http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # serve dist/
npm run check     # svelte-check + tsc (validates JSDoc types) — run before commit
npm run deploy    # build + publish to gh-pages

node test_parse.js   # smoke test for src/lib/parser.js
node test_match.js   # smoke test for match loading + findMatchForBet
```

No automated test suite — `node test_*.js` are manual sanity checks. Sample
WhatsApp export lives at `polla.json` in repo root.

## Scoring (src/lib/api.js:108 `compareBetWithMatch`)

| Status     | Points |
|------------|--------|
| `exact`    | 5      |
| `correct`  | 3      |
| `incorrect`| 0      |

The only valid `status` values are `'pending' | 'exact' | 'correct' | 'incorrect'`
(`src/lib/types.js:23`). `ResultsModal.svelte` has a "Empates" section
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
   `$derived` — call them in markup.
3. **Fetch + score** — `src/lib/api.js`. Match sources: `loadMatchesFromGitHub()`
   (openfootball `worldcup.json`, default) and `loadMatches()`
   (football-data.org; api key fetched at runtime from
   `https://app.iedeoccidente.com/pollaweb/config.php`, never in source).
4. **Persistence** — `localStorage` key `polla_bets`. Optional Google
   Sheets push/pull via `https://app.iedeoccidente.com/gs/{save,get}_bets.php`
   (`SHEETS_SPREADSHEET_ID` hardcoded at `api.js:8`).
5. **Orchestration** — `src/App.svelte`. `analyzeBets(useGitHub)` loads
   matches, maps each bet through `findMatchForBet` + `compareBetWithMatch`,
   persists, and computes the winner ranking.

## Conventions

- Svelte 5 runes throughout: `$state`, `$derived`, callback props
  (`onClose`, `onSelectBet`) instead of `createEventDispatcher`,
  `onclick={...}` attributes.
- Types via JSDoc `@typedef` in `src/lib/types.js`; reference as
  `/** @type {import('./types.js').Bet} */`.
- Router: `svelte-spa-router` (hash-based).
- Heavy `console.log` debug output is left in `parser.js` and `api.js` for
  match-debugging — do not strip without a reason.

## Gotchas

- **Single canonical team-alias map** lives in `parser.js`
  (`TEAM_ALIASES`, `normalizeTeamName`). Both `api.js` and `flags.js`
  import it. Add new teams there only, and keep it idempotent:
  `normalizeTeamName(canonical) === canonical` for every openfootball name
  (`Czech Republic`, `USA`, `Bosnia & Herzegovina`, `Curaçao`, …).
- **`src/lib/parser2.js` is dead code** (`// @ts-nocheck`, not imported
  anywhere). It is an alternate parser draft — edit `parser.js` for real
  changes. CLAUDE.md / GEMINI.md are mirrored instruction files; they
  may contain overlapping or stale facts.
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
