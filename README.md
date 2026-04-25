# Every Night Studios — Tools

Browser-based tools for Every Night Studios. Vanilla JS + ES modules, no build step, fully offline-capable (fonts and JSZip vendored under `shared/`).

    python3 -m http.server 8000

Then open http://localhost:8000 — root has links to the two tools.

## Layout

    /                   plain-link landing page
    /shared/            tokens.css, components.css, fonts.css, fonts/, lib/jszip.min.js, default-logo.svg, settings-toggle.js
    /caps/              cap mockup grid prototyper
    /apparel/           apparel design builder (t-shirts + longsleeves)

Both tool pages share `shared/tokens.css` (design tokens), `shared/components.css` (topbar / floating chips / swatches), `shared/fonts.css` (OffBit + OPSPastPerfect, both vendored), and `shared/settings-toggle.js` (the floating cog).

## Caps

Grid of N cap mockups. Master text + logo apply to every card; each card has its own
cap color and thread color. Floating chips: cog (settings), export (zip), randomize.
Export produces per-card PNGs + `everynightstudios-caps-specs.json`.

**Catalog workflow** (run from repo root):

1. Drop cap photos into `caps/public/caps/` (filename becomes the cap id).
2. `npm run caps:scrape` — regenerate `caps/src/data/caps.json`.
3. `npm install && npm run caps:sample-hex` — sample each cap's hex from its image.
4. Open `caps/calibrate.html` and drag a rectangle to set the text anchor per cap.

## Apparel

T-shirt and longsleeve design builder. Per view (front/back) you can stack any
number of layers — image uploads (drag-drop or file picker) and text layers
(typed with selectable OffBit / OffBit Bold / Past Perfect). Each layer carries
its own placement, colorize, blend, crop, and (for text) font/size/color.

Floating chips: cog (settings), export, source link, plus a left color rail with
garment swatches and a global design-tint picker. Layers panel shows all layers
when there are 2+; click to switch active, hover × to remove. Per-layer cm-width
popover lets you type a size directly.

Catalog (`apparel/src/data/catalog.json`) drives brand/style/color options and
the per-view default design area. Each color references a real photo file under
`apparel/public/garments/<item>/`.

Keyboard: `Cmd/Ctrl + Z` undo, `Cmd/Ctrl + Shift + Z` redo, scroll to zoom,
middle-drag to pan, double-click to reset zoom. URL hash carries the active item
+ color (`#item=sttu199&color=c727`).

## Tests

    npm test

Runs the pure-function tests in `caps/src/lib/*.test.mjs`.
