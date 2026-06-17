# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`pollaweb` — single-page Svelte 5 app for a 2026 World Cup betting pool ("polla"). Users upload a WhatsApp chat export (JSON), the app parses free-text Spanish bets into structured predictions, fetches real match results, scores each bet, and ranks participants. UI strings are Spanish. The Svelte app is frontend-only; match data comes from external URLs and a small PHP+Google Sheets backend (source in `src/assets/`, deployed separately to `app.iedeoccidente.com/gs/`).

## Commands

```bash
npm run dev       # vite dev server
npm run build     # production build to dist/
npm run preview   # serve built dist/
npm run check     # svelte-check + tsc — run before committing; no test suite exists
npm run deploy    # build + gh-pages publish to /polla2026/ (see vite base)
```

No test runner configured. `vite.config.ts` sets `base: '/polla2026/'` for GitHub Pages — affects asset paths in production builds.

Type checking is JSDoc-on-JS (no `.ts` source files). `check` validates types via `// @ts-check`-style JSDoc against `tsconfig.app.json`.

## Architecture

Data flow is a one-way pipeline; understanding it requires reading `parser.js`, `stores.svelte.js`, and `api.js` together.

**1. Parse (`src/lib/parser.js`)** — The hard part of the app. `parseWhatsAppExport(json)` → `parseMessage(msg)` extracts up to four bet types from one free-text WhatsApp message: `champion`, `runnerup`, `topscorer`, `score`. Score parsing (`parseAllScoreBets`) is heuristic token-matching: it replaces flag emojis with country names, normalizes team names through `TEAM_ALIASES`/`FLAG_MAP`, then pairs teams with adjacent numbers across one or two lines. Spanish team-name variants and misspellings are handled by the large `TEAM_ALIASES` map — extend it there when a team fails to match. `normalizeTeamName` (strip accents/punctuation/lowercase → alias lookup) is the single canonical normalizer used both here and in match-matching.

**2. State (`src/lib/stores.svelte.js`)** — Svelte 5 runes (`$state`). `appState` is the single global store (bets, matches, isLoading, filters, `participantAliases`), exported as a mutable rune object and imported directly by components. Derived data are plain exported **functions** (`stats()`, `filteredBets()`, `participants()`, `uniqueDates()`), not `$derived` — call them in markup. `findMatchForBet` re-normalizes both bet and match team names (including inverted home/away order) to pair a bet with its match. `participantAliases` (real name → display alias) is editable via `AliasModal` and synced to a Sheets "alias" worksheet.

**3. Fetch + score (`src/lib/api.js`)** — Match sources:
- `loadMatchesFromGitHub()` — openfootball `worldcup.json` (raw GitHub). Default source.
- `loadMatches()` — football-data.org API; `api_key`/`base_url` fetched at runtime from `CONFIG_URL` (`app.iedeoccidente.com/pollaweb/config.php`), cached in-module. Key is never in source.

`api.js` also wraps the Sheets backend: `SAVE_BETS_URL`/`GET_BETS_URL` (`app.iedeoccidente.com/gs/`) plus a hardcoded `SHEETS_SPREADSHEET_ID`. POST `{spreadsheetId, worksheetTitle, bets}` to save, `{spreadsheetId, worksheetTitle, filterParticipant}` to read. `getAliasesFromSheets`/`saveAliasesToSheets` reuse these endpoints with `worksheetTitle: 'alias'`.

Both match sources normalize to the `Match` shape (`types.js`). `api.js` imports `normalizeTeamName` from `parser.js` — there is a **single canonical team-name normalizer/alias map** (`TEAM_ALIASES` in `parser.js`); add new teams there only. The canonical forms match openfootball's names (`Czech Republic`, `USA`, `Bosnia & Herzegovina`, `Curaçao`, …), and `TEAM_ALIASES` must stay idempotent — `normalizeTeamName(canonical) === canonical` for every openfootball team, so match-side names map to themselves. `compareBetWithMatch` is the scoring rule: exact score = **5 pts**, correct winner/direction = **3 pts**, else 0.

**Flags (`src/lib/flags.js` + `Flag.svelte`)** — `getFlagData(teamName)` maps a parser-canonical English team name → ISO code (`TEAM_TO_ISO`) → `public/countries.json` (flag URL, emoji, Spanish name). `Flag.svelte` renders it. Add new teams to `TEAM_TO_ISO` here.

**4. Orchestration (`src/App.svelte`)** — `analyzeBets(useGitHub)` loads matches, maps each pending/unverified bet through `findMatchForBet` + `compareBetWithMatch`, persists to `localStorage`, then computes winner ranking. On mount, restores bets from `localStorage` key `polla_bets` and auto-analyzes.

**Persistence:** primary store is browser `localStorage`, key `polla_bets`; "Resetear" clears it. Bets and aliases can additionally be pushed to / pulled from Google Sheets via the `api.js` Sheets helpers (the `bets`/`alias` worksheets).

## Conventions

- Svelte 5 runes mode throughout: `$state`, callback props (`onClose`, `onSelectBet`) instead of `createEventDispatcher`, `onclick={...}` attributes. Match this in new components.
- Types are JSDoc `@typedef` in `src/lib/types.js` (`Bet`, `Match`, `Prediction`), imported via `import('./types.js').Bet`. No runtime type code.
- `src/lib/parser2.js` is **unused dead code** (`// @ts-nocheck`, not imported anywhere) — an alternate parser draft. Edit `parser.js` for real changes.

## Gotchas

- Single team-alias map (`TEAM_ALIASES` in `parser.js`); `api.js` imports its `normalizeTeamName`. Add new teams there, keeping it idempotent against openfootball names.
- `parser.js` and `api.js` contain heavy `console.log` debug output left in for match-debugging.
- `src/assets/*.php` is **PHP backend source**, not part of the Vite build — it's deployed by hand to `app.iedeoccidente.com/gs/` and needs `vendor/` (Google Sheets PHP SDK) + `assets/serviceaccount.json` (service-account key, not in repo) there. The `*_horas_extras.php` files belong to an unrelated app sharing the same host.
- Three flag/alias maps now diverge: `flags.js`'s `TEAM_TO_ISO`, plus `parser.js` and `parser2.js` `FLAG_MAP`s — `parser2`'s fixes flag bugs (🇨🇱=Chile not Colombia) that may still exist in `parser.js`.
