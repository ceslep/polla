# WhatsApp Bet Scraper - Copa do Mundo 2026

## Stack

- **Python**: Main orchestrator, WhatsApp scraping (Playwright), World Cup API
- **PHP**: Google Sheets writes only (`composer install` required)
- **Svelte 5 + Vite**: Dashboard frontend (Node.js)

## Key Commands

```bash
# Main menu / orchestrator
python main.py

# WhatsApp scraping (Playwright)
python whatsapp_scraper.py

# World Cup results
python worldcup_api.py [fecha_inicio] [fecha_fin]

# Google Sheets upload (requires composer install)
php upload_sheets.php

# Dashboard dev server
npm run dev

# Dashboard production build
npm run build

# Serve production build
npm run preview

# Deploy to GitHub Pages (build + publish)
npm run deploy

# Type-check Svelte (run before committing)
npm run check
```

Dashboard: http://localhost:5173 (dev) or `php -S localhost:8000` for PHP endpoints

Vite base is `/pollawebsv/` for GitHub Pages deployment (`vite.config.ts:7`)

## Scoring System

| Status | Points |
|--------|--------|
| exact | 5 |
| correct | 3 |
| draw | 2 |
| incorrect | 0 |

## Architecture

- `bets.json` - Central data file (scraped bets, updated by multiple scripts)
- `worldcup_matches.json` - Cached World Cup API results
- `config.json` - Shared config (Google Sheets ID, football-api key, Selenium host)
- `credentials/service-account.json` - Google Cloud service account (gitignored)
- `api/bets.php`, `api/analyze.php` - PHP endpoints for dashboard
- `src/lib/parser.js` - WhatsApp message → structured bet parser (Svelte app)
- `src/lib/api.js` - Match fetching + scoring (separate `TEAM_ALIASES_API`)

## WhatsApp Scraping Methods

1. **Playwright** (`whatsapp_scraper.py`) - Primary, uses `.whatsapp_profile` for session persistence
2. **Selenium** (`src/WhatsAppScraper.php`) - PHP alternative, requires `chromedriver --port=4444`
3. **Baileys** (`scrape_baileys.js`) - Node.js, separate implementation

## Important Gotchas

- **Two divergent team-alias maps**: `parser.js` and `api.js` each have their own `TEAM_ALIASES` / `normalizeTeamName`. Keep both in sync when adding teams.
- **Two divergent flag maps**: `parser.js` has 🇇�🇱=Chile but may still have 🇨🇱=Colombia bugs that `parser2.js` fixed. If flag parsing fails, compare both.
- `src/lib/parser2.js` is dead code (`// @ts-nocheck`, not imported anywhere)
- WhatsApp DOM selectors break frequently - `whatsapp_scraper.py` has multiple fallback selectors
- Session expires - re-scan QR code when blocked
- football-data.org free tier: 10 req/min
- Dashboard uses `localStorage` for persistence, exports via `api/export.php`

## Google Sheets Format

Columns: `Timestamp | Participant | Bet | Original Message | Status | Real Result | Points`
