# 🏆 PollaWeb — Copa del Mundo 2026

Single-page web app para gestionar una **polla (porra/quiniela) del Mundial 2026**. Los participantes suben una exportación de chat de WhatsApp con sus apuestas en texto libre; la app parsea, normaliza y califica automáticamente contra los resultados reales del torneo.

> 🔗 Demo en producción: <https://ceslep.github.io/polla/>

---

## ✨ Características

- 📥 **Parser de WhatsApp** — Interpreta texto libre en español con emojis de banderas, alias de equipos y emparejamiento heurístico de marcadores.
- ⚽ **Resultados en vivo** — Descarga partidos del Mundial desde [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) y califica cada apuesta en tiempo real.
- 📊 **Scoring transparente** — 5 pts (exacto) · 3 pts (acierto de ganador) · 0 pts (errado).
- 🏅 **Ranking, estadísticas y movimientos** — Tabla de posiciones, accuracy por participante, heatmap de selecciones más apostadas.
- 🛠️ **Edición manual** — Cualquier apuesta se puede re-parsear, aplicar sugerencias fuzzy (Levenshtein ≤ 2) y descartar matchs dudosos.
- ☁️ **Persistencia en Google Sheets** — Sheets es la única fuente de verdad. No hay `localStorage`. Auto-guardado en cada mutación.
- 📱 **Responsive** — UI pensada para móvil y escritorio con menú adaptado.

---

## 🚀 Quick start

```bash
# Requisitos: Node 20+
npm install
npm run dev
```

Abre <http://localhost:5173>, sube el JSON exportado de WhatsApp y haz clic en **🔗 Analizar** para calificar las apuestas contra los resultados reales.

### Comandos

| Comando            | Descripción                                                        |
|--------------------|--------------------------------------------------------------------|
| `npm run dev`      | Servidor de desarrollo (Vite, default `:5173`)                     |
| `npm run build`    | Build de producción → `dist/`                                      |
| `npm run preview`  | Sirve `dist/` localmente para verificar                            |
| `npm run check`    | `svelte-check` + `tsc` (valida tipos JSDoc)                        |
| `npm run deploy`   | Build + publish a `gh-pages`                                       |

### Tests manuales

No hay test runner automatizado. Hay smoke tests en Node que validan piezas puras de lógica:

```bash
node test_parse.js         # parser de mensajes WhatsApp
node test_match.js         # carga de partidos + findMatchForBet
node test_sort.mjs         # sortByTimestampDesc en stores
node test_unique_bets.mjs  # dedup de uniqueBets
node test_fuzzy.mjs        # findMatchSuggestion (Levenshtein ≤ 2)
node test_accuracy.mjs     # globalAccuracy / participantAccuracy
node test_team_stats.mjs   # teamStandingsFromTeams
```

`polla.json` (en la raíz) es un chat de WhatsApp de muestra que usan casi todos.

---

## 🧱 Stack

- **Frontend** — Svelte 5 (runes) + Vite 8 + Tailwind 4
- **Tipado** — JSDoc sobre JS puro (sin `.ts`). `tsconfig.app.json` activa `checkJs: true`.
- **Router** — `svelte-spa-router` (hash-based)
- **Backend** — PHP en `src/assets/` que lee/escribe Google Sheets vía [google/apiclient](https://github.com/googleapis/google-api-php-client). Desplegado a mano en `https://app.iedeoccidente.com/gs/`.
- **Datos de partidos** — `openfootball/worldcup.json` (GitHub raw) o `football-data.org` (API key fetched at runtime, nunca en el repo).

---

## 🏛️ Arquitectura

```
┌──────────────┐    upload     ┌─────────────────┐
│  WhatsApp    │ ───────────►  │   DropZone /    │
│  export JSON │               │ AdminUploadModal│
└──────────────┘               └────────┬────────┘
                                        │ parseWhatsAppExport
                                        ▼
┌──────────────────────────────────────────────────┐
│  src/lib/parser.js                              │
│  • FLAG_MAP  →  país                            │
│  • TEAM_ALIASES  →  forma canónica en inglés    │
│  • heurística de emparejamiento (marcadores)    │
└────────────────────┬─────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────┐
│  src/lib/stores.svelte.js                       │
│  • appState (rune $state) con bets, matches,    │
│    saving, sheetsUnavailable, filters, aliases  │
│  • funciones derivadas: stats(), filteredBets(),│
│    uniqueBets(), participants(), matchDates()   │
│  • apply/dismissMatchSuggestion (async)         │
└────────────────────┬─────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────┐
│  src/lib/api.js                                 │
│  • loadMatchesFromGitHub() / loadMatches()      │
│  • compareBetWithMatch() — scoring (5/3/0)      │
│  • saveBetsToSheets() / loadBetsFromSheets()    │
│  • clearBetsFromSheets()                        │
│  • saveAliasesToSheets() / getAliasesFromSheets │
└────────────────────┬─────────────────────────────┘
                     ▼
        ┌────────────────────────────┐
        │  Google Sheets (datos)     │  ← fuente de verdad
        │  + Google Sheets (alias)   │
        └────────────────────────────┘
                     ▲
                     │  save_bets.php / get_bets.php / clear_bets.php
                     │
        ┌────────────┴───────────┐
        │  app.iedeoccidente.com │
        │  /gs/                  │
        └────────────────────────┘
```

### Scoring (`src/lib/api.js:123/130/133`)

| Status      | Puntos |
|-------------|--------|
| `exact`     | 5      |
| `correct`   | 3      |
| `incorrect` | 0      |

El único enum válido para `status` es `'pending' | 'exact' | 'correct' | 'incorrect'` (`src/lib/types.js:23`).

### Persistencia

**Google Sheets es la única fuente de verdad.** El frontend **no usa `localStorage`**. Cada mutación (`applyMatchSuggestion`, `dismissMatchSuggestion`, `BetModal.saveChanges`, `DropZone`, `AdminUploadModal`, fin de `analyzeBets`) llama a `saveBetsToSheets(appState.bets)`. El PHP en `src/assets/save_bets.php` hace UPSERT de las 20 columnas A:T para que las columnas calculadas (`status`, `points`, `real_result`, `verified`, `manuallyEdited`) se persistan junto con los datos crudos.

Al montar, `App.svelte` carga una sola vez desde Sheets vía `refreshFromSheets()`. Recargas adicionales son siempre manuales (botón 🔄 en el header o "Reintentar" en el banner de solo-lectura cuando Sheets falla).

### Refresh del ranking FIFA (mensual)

Abrir en el navegador `https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php`, pegar la tabla de <https://www.fifa.com/es/world-rankings> y guardar. El JSON se cachea en el host (`gs/fifa_cache.json`) y `loadFifaRankings()` en `src/lib/fifa.js` lo consume en runtime. `public/fifa_rankings.json` queda como fallback offline.

---

## 📁 Estructura

```
polla/
├── src/
│   ├── App.svelte                  # orquestación + router + banner
│   ├── main.js                     # entry point
│   ├── app.css                     # estilos globales (Tailwind 4)
│   ├── assets/                     # PHP + imágenes (no parte del build)
│   │   ├── save_bets.php
│   │   ├── get_bets.php
│   │   ├── clear_bets.php
│   │   └── fetch_fifa_rankings.php
│   └── lib/
│       ├── parser.js               # WhatsApp → bets
│       ├── stores.svelte.js        # appState + derivados
│       ├── api.js                  # Sheets + scoring + partidos
│       ├── types.js                # JSDoc @typedef
│       ├── flags.js                # equipo → ISO → SVG
│       ├── fifa.js                 # ranking FIFA
│       ├── accuracy.js             # globalAccuracy / participantAccuracy
│       ├── teamStats.js            # teamStandingsFromMatches
│       ├── parser2.js              # DEAD CODE — alternativa descartada
│       └── components/             # modales y widgets
├── public/                         # assets estáticos (favicon, países)
├── polla.json                      # WhatsApp export de muestra
├── test_*.js / test_*.mjs          # smoke tests
├── vite.config.ts                  # base: '/polla/'
├── svelte.config.js
├── tsconfig.{,app,node}.json
└── package.json
```

---

## 🛠️ Deployment

### Frontend (`gh-pages`)

```bash
npm run deploy
```

Publica `dist/` a la rama `gh-pages` de este repo. El `vite.config.ts:7` define `base: '/polla/'`, que debe coincidir con la URL de GitHub Pages (`<user>.github.io/<repo>/`).

### Backend PHP

Los archivos de `src/assets/` se despliegan **a mano** al host (`app.iedeoccidente.com/gs/`). Necesitan:

- `vendor/` (Google Sheets PHP SDK)
- `assets/serviceaccount.json` (clave de service account, **no** en el repo)

Endpoints:

- `https://app.iedeoccidente.com/gs/save_bets.php`
- `https://app.iedeoccidente.com/gs/get_bets.php`
- `https://app.iedeoccidente.com/gs/clear_bets.php`
- `https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php`
- `https://app.iedeoccidente.com/pollaweb/config.php` (devuelve la API key de football-data.org al frontend)

> ⚠️ Los `*_horas_extras.php` en `src/assets/` pertenecen a otra app en el mismo host. Déjalos en paz.

---

## 🤝 Contribuir

1. Fork + branch feature.
2. `npm run check` debe pasar antes de commit.
3. `node test_*.mjs` debe pasar antes de PR.
4. Para añadir un país/equipo nuevo:
   - `src/lib/parser.js` — `TEAM_ALIASES` y/o `FLAG_MAP`
   - `src/lib/flags.js` — `TEAM_TO_ISO`
   - `public/countries.json` — `flag`, `emoji`, `country` (español)
5. Misma forma canónica en inglés que usa openfootball (`Czech Republic`, `USA`, `Bosnia & Herzegovina`, `Curaçao`, …). `normalizeTeamName(canonical) === canonical` debe cumplirse.

Lee `AGENTS.md` para contexto detallado (gotchas, flags que divergen, base path, etc.).

---

## 📜 Licencia

Privado. No hay licencia explícita; consulta al autor antes de redistribuir.
