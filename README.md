# Every Night Cap Prototyper

Vanilla-JS tool for prototyping embroidered cap mockups from Every Night Studios Print Factory.

## What it does

- Grid of cards, each a cap mockup with its own cap color + thread color
- Master text + logo upload apply to every card
- Logo recolored per-card to match that card's thread color
- Export as zip: per-card PNGs + `specs.json` + uploaded logo — ready to send to the print shop

## Run

    python3 -m http.server 8000

Then open http://localhost:8000

## Catalog workflow

Cap images live in `public/caps/` (committed). The catalog JSON at `src/data/caps.json` is generated from whatever PNG/JPG files are in that directory.

**Add or refresh caps:**

1. Drop cap photos into `public/caps/` (filename becomes the cap id).
2. Generate `caps.json`:

        node scripts/scrape.mjs

3. Sample each cap's hex from the image (used for the dropdown swatches):

        npm install
        node scripts/sample-hex.mjs

4. Calibrate the text anchor for each cap by drag-to-set-box:

        open calibrate.html

   Drag a rectangle on the cap front. Arrow keys nudge (Shift = bigger step), Enter advances. Hit `download caps.json` when done, replace `src/data/caps.json` with the downloaded file.

## Tests

    node --test

Runs the pure-function tests in `src/lib/*.test.mjs`.

## Layout

- `index.html` — app entry
- `style.css` — all styles
- `src/main.js` — wires master bar + grid
- `src/cards.js` — per-card state + DOM
- `src/render.js` — canvas compositing (cap + text / logo)
- `src/export.js` — zip + PNG export
- `src/lib/` — pure helpers: `anchor.js`, `fontfit.js`, `logo.js`, `specs.js`
- `src/data/caps.json`, `src/data/threads.json` — catalog
- `public/caps/*.png` — cap images
- `scripts/scrape.mjs` — catalog builder (reads `public/caps/`)
- `scripts/sample-hex.mjs` — fills in cap hex values from image pixels
- `calibrate.html` + `calibrate.js` — one-off text-anchor calibrator
- `docs/plans/` — design + implementation plan
