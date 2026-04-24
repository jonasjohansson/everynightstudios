# Every Night Studios — Tools

Browser-based tools for Every Night Studios. Vanilla JS, no build step.

    python3 -m http.server 8000

Then open http://localhost:8000 for the landing page.

## Layout

    /                   landing page (Are.na-style index)
    /shared/            shared assets — tokens.css, default-logo.svg
    /caps/              cap mockup prototyper
    /apparel/           apparel design builder (t-shirts + longsleeves)

## Caps

Grid of cap mockups. Master text + logo apply to every card; each card has its own
cap color and thread color. Export a zip of per-card PNGs + `specs.json` to send to
the print shop.

**Catalog workflow** (run from `caps/`):

1. Drop cap photos into `caps/public/caps/` (filename becomes the cap id).
2. `node scripts/scrape.mjs` — regenerate `src/data/caps.json`.
3. `npm install && node scripts/sample-hex.mjs` — sample each cap's hex from its image.
4. `open calibrate.html` — drag a rectangle to set the text anchor per cap.

## Apparel

T-shirt and longsleeve design builder. Upload a design for front, a design for back,
drag to position, slider to scale. Garment color + type are selectable.

The garment shapes are SVG path silhouettes drawn to canvas — swap `apparel/src/garments.js`
to add styles or refine the shapes, or replace with real product photos later.

## Tests

    cd caps && node --test

Runs the pure-function tests in `caps/src/lib/*.test.mjs`.
