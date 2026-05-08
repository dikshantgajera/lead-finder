# Repository Guidelines

## Project Overview

Lead Finder is a local Node/Express app for scraping Targetron business leads, enriching them, checking Meta ad activity, and managing saved lead/CRM/final-list JSON files. The frontend is plain HTML/CSS/JavaScript served from `public/`.

## Main Entry Points

- `server.js`: Express server, static frontend hosting, REST/SSE API routes, local JSON file management.
- `public/index.html`: Single-page UI markup for search, leads library, CRM, and final-list views.
- `public/app.js`: Browser-side state, fetch/SSE calls, rendering, filtering, bulk actions, CSV export.
- `public/style.css`: App styling.
- `public/leaddata.js`: Category/country data used by the frontend dropdowns.
- `agent/scraper.js`: Playwright Targetron scraping and page discovery.
- `agent/enricher.js`: Lead enrichment and CRM output generation.
- `agent/ai_generator.js`: Outreach/email generation.
- `agent/final_list.js`: Find-ads workflow and final-list persistence.
- `tests/*.test.mts`: Node test suite.

## Commands

- `npm start` or `npm run dev`: Start the Express app on `PORT` or `3000`.
- `npm run check`: Syntax-check `server.js` and `public/app.js`.
- `npm test`: Run the Node test suite in `tests/*.test.mts`.

## Data Layout

Runtime data is stored locally under `data/`:

- `data/leads/`: Saved scrape results.
- `data/crm/`: Enriched lead files.
- `data/emails/`: Generated email batches.
- `data/final-list/`: Per-source final-list files.
- `data/final-list.json`: Legacy final-list file still supported by the server.

Treat JSON data as local user data. Do not delete or rewrite it unless the task explicitly requires it.

## Development Notes

- This repo currently has many uncommitted tracked and untracked files. Preserve user changes and avoid broad cleanup.
- Prefer `rg`/`rg --files` for search.
- Use `apply_patch` for manual edits.
- Keep server API behavior compatible with the existing frontend unless the task includes matching frontend changes.
- SSE endpoints send `data: { type, ...payload }` messages; keep that shape stable for existing UI handlers.
- `agent/scraper.js` uses Playwright against a live external site, so scraper behavior may depend on network access and Targetron DOM changes.
- Tests use Node’s built-in test runner and `.mts` modules. Add focused tests for domain or workflow changes where possible.

## Verification

For small server/frontend edits, run:

```bash
npm run check
```

For workflow changes, run:

```bash
npm test
```
