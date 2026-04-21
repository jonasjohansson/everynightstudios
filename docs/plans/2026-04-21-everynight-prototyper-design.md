# Every Night Studios Print Factory — Cap Prototyper

## Purpose

A local, vanilla-JS prototyping tool for designing embroidered caps before sending specs to Every Night Studios for print. The existing customizer on their site supports one cap, one text line, one thread color at a time. This tool supports a grid of N cards, each with its own cap + thread color, sharing a single text + logo from a master bar. Output is a zip of PNG mockups + a JSON spec sheet.

## Stack

- `index.html` + `style.css` + ES-module JS. No framework, no build step.
- `jszip` via CDN for export zip.
- Native `<canvas>` for compositing + PNG export.
- One-off Node script (`scripts/scrape.mjs`) to populate `src/data/caps.json` and `public/caps/*.jpg` from everynightstudios.com. Re-runnable.
- One-off `calibrate.html` page for setting the per-cap text anchor box by drag.

## Layout

```
┌──────────────────────────────────────────────────────┐
│ MASTER BAR                                           │
│ [text input (max 14)] [upload logo] [+ add card]     │
│ [export zip]                                         │
├───────────────────┬──────────────────────────────────┤
│ Card 1            │ Card 2                           │
│ [canvas preview]  │ [canvas preview]                 │
│ cap [▼]  color[▼] │ cap [▼]  color[▼]   [x remove]   │
├───────────────────┼──────────────────────────────────┤
│ Card 3            │ Card 4                           │
└───────────────────┴──────────────────────────────────┘
```

- CSS grid auto-reflow: 1/2/3/4 columns by viewport.
- `+ add card` appends a new card initialized with the first cap + first thread color.
- Remove button on each card.
- Master state (text, logo image) lives in one place and every card redraws on change.

## Data

**`src/data/caps.json`** — array of:
```json
{
  "id": "vintage-cornflower",
  "name": "Vintage Cornflower",
  "hex": "#6b87c4",
  "image": "public/caps/vintage-cornflower.jpg",
  "anchor": { "x": 0.5, "y": 0.55, "width": 0.35 }
}
```
`anchor` is normalized (0–1) relative to the image. `x,y` = center of the embroidery, `width` = width of the text/logo box as a fraction of the image width.

**`src/data/threads.json`** — array of:
```json
{ "name": "Bright White", "hex": "#f4f4f0" }
```
14 yarn colors from the site.

## Rendering (per card)

1. Draw cap image to `<canvas>` at its natural size, scaled down via CSS for display.
2. Compute anchor pixel coords: `cx = anchor.x * imgW`, `cy = anchor.y * imgH`, `boxW = anchor.width * imgW`.
3. If **text** mode: draw master text centered at `(cx, cy)` in the card's thread color. Font size derived so text fits within `boxW`. Font: a single bundled web font (start with a generic block sans; easy to swap later).
4. If **logo** mode (logo uploaded): draw the uploaded image tinted to the thread color.
   - SVG: parse, override `fill` on all paths, rasterize via `Image` + `drawImage`.
   - PNG: draw to offscreen canvas, use alpha channel as mask, fill with thread color.
   Fit within `boxW`, preserve aspect ratio.
5. Master bar has a toggle or just: if logo uploaded, render logo; else render text. (Single-source display, no overlap.)

## Export

- Click `export zip` → for each card:
  - Redraw canvas at full resolution (no CSS downscale).
  - `canvas.toBlob('image/png')` → `card-{index}-{cap-id}.png`.
- Build `specs.json` array: `{ index, capId, capName, threadName, threadHex, text, logoFilename | null }`.
- If logo uploaded: include original file as `logo.{ext}`.
- Zip everything via JSZip, trigger download as `everynight-prototype-{timestamp}.zip`.

## Scraping

`scripts/scrape.mjs`:
1. Fetch the print factory / caps collection page from everynightstudios.com.
2. For each product: fetch product page, extract name, hero image URL, color variants.
3. Download images to `public/caps/` (skip if exists).
4. Write `src/data/caps.json` with `anchor` defaulted to `{0.5, 0.55, 0.35}` (manually tuned later via calibrate.html).
5. Write `src/data/threads.json` from the yarn color palette (may need to be hand-entered if it's behind JS — fallback: hardcode from screenshot).

Uses `node:fs`, `fetch` (Node 20+), `cheerio` for HTML parsing. Single file, no deps beyond cheerio.

## Calibration tool

Standalone `calibrate.html`:
- Loads `caps.json`, shows each cap one at a time.
- User drags a rectangle on the cap front → stored as normalized `anchor`.
- Download updated `caps.json` when done.
- Not part of the main app; run once after scrape.

## Project layout

```
everynight-prototyper/
  index.html
  style.css
  src/
    main.js            entry — wires master bar + card list
    cards.js           card model, add/remove, per-card state
    master.js          master bar state (text, logo)
    render.js          canvas compositing (cap + text/logo + color)
    export.js          zip + png render
    data/
      caps.json
      threads.json
  public/
    caps/*.jpg
  scripts/
    scrape.mjs
  calibrate.html
  README.md
```

## Out of scope (for v1)

- Faux-embroidery shading / stitch textures — flat fill only.
- Multi-line text, curved text, letter spacing controls.
- Back-of-cap or side embroidery.
- Saving/loading session state (all state is in-memory; refresh = reset).
- Hosting / sharing links.
