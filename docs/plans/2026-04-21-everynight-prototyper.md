# Every Night Cap Prototyper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a vanilla-JS, no-build web tool for designing a grid of embroidered-cap mockups with shared text/logo and per-card cap+thread color, exportable as a zip of PNGs + specs.json.

**Architecture:** Single-page `index.html` loading ES modules from `src/`. Master bar owns shared state (text, logo). Each card owns its own cap + thread color. State changes trigger `<canvas>` redraws per card. Export uses `canvas.toBlob` + JSZip. One-off Node script scrapes cap catalog. Standalone `calibrate.html` sets per-cap text anchor rectangles.

**Tech Stack:** Vanilla JS (ES modules), HTML, CSS, native `<canvas>`, `jszip` (CDN), Node 22 one-off script for scraping with `cheerio`, `node:test` for pure-function unit tests.

Design: `docs/plans/2026-04-21-everynight-prototyper-design.md`

---

## Conventions

- **Tests**: Pure functions (anchor math, logo recolor, specs building, font-fit) use `node:test` with `.test.mjs` suffix, run via `node --test`. UI/canvas behavior verified manually by loading `index.html` via `python3 -m http.server 8000`.
- **Commits**: One per task. Message format: `<verb>: <what>` (e.g. `add: thread palette`, `fix: anchor clamping`).
- **No secrets**: nothing to commit. No `.env`.
- **Files**: All paths in tasks are relative to repo root `everynight-prototyper/`.

---

## Task 1: Scaffold empty project

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `src/main.js`
- Create: `src/data/threads.json`
- Create: `README.md`
- Create: `.gitignore`

**Step 1: Write `.gitignore`**

```
node_modules/
.DS_Store
*.log
dist/
```

**Step 2: Write `src/data/threads.json`** (hand-entered from the yarn color screenshot — 14 colors)

```json
[
  { "name": "Bright White", "hex": "#f4f4ee" },
  { "name": "Black", "hex": "#1a1a1a" },
  { "name": "Red", "hex": "#c8241e" },
  { "name": "Royal Blue", "hex": "#1f3fa8" },
  { "name": "Yellow", "hex": "#e8c81c" },
  { "name": "Forest Green", "hex": "#1f4a22" },
  { "name": "Pink", "hex": "#f2b9c4" },
  { "name": "Orange", "hex": "#e87c2a" },
  { "name": "Brown", "hex": "#6b4a2e" },
  { "name": "Neon Yellow", "hex": "#d9f24a" },
  { "name": "Lavender", "hex": "#c1c4e6" },
  { "name": "Taupe", "hex": "#a89a8e" }
]
```

**Step 3: Write minimal `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Every Night Cap Prototyper</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header id="master-bar"></header>
  <main id="card-grid"></main>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

**Step 4: Write minimal `style.css`**

```css
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font: 14px/1.4 system-ui, sans-serif; background: #f7f7f5; color: #222; }
#master-bar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e4e4df; padding: 12px 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; z-index: 10; }
#card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; padding: 16px; }
```

**Step 5: Write stub `src/main.js`**

```js
import threads from './data/threads.json' with { type: 'json' };
console.log('threads loaded:', threads.length);
document.getElementById('master-bar').textContent = 'master bar';
document.getElementById('card-grid').textContent = 'card grid';
```

**Step 6: Write `README.md`**

```markdown
# Every Night Cap Prototyper

Vanilla-JS tool for prototyping embroidered cap mockups from Every Night Studios.

## Run

    python3 -m http.server 8000

Open http://localhost:8000

## Scrape caps (one-off)

    node scripts/scrape.mjs

## Calibrate text anchors (one-off, after scrape)

    open calibrate.html

## Tests

    node --test
```

**Step 7: Verify it loads**

Run: `python3 -m http.server 8000 &` then `curl -s http://localhost:8000/ | grep -c card-grid`
Expected: `1`

Kill server: `kill %1`

**Step 8: Commit**

```bash
git add .
git commit -m "add: scaffold html/css/js entry points and thread palette"
```

---

## Task 2: Cap scraper — fetch + parse product listing

**Files:**
- Create: `scripts/scrape.mjs`
- Create: `package.json`
- Create: `src/data/caps.json` (generated)
- Create: `public/caps/` (directory)

**Step 1: Init package.json**

```bash
cat > package.json <<'EOF'
{
  "name": "everynight-prototyper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "scrape": "node scripts/scrape.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "cheerio": "^1.0.0"
  }
}
EOF
npm install --silent
```

**Step 2: Write `scripts/scrape.mjs`**

Everynight Studios runs on Shopify. The `/collections/print-factory/products.json` or `/products.json` endpoint returns product JSON. Strategy:

1. Try `https://everynightstudios.com/collections/print-factory/products.json?limit=250`.
2. Fall back to `/products.json?limit=250` and filter by tag/type containing "cap" or "hat".
3. For each product, extract variants (color name + image).
4. Download each variant image to `public/caps/<slug>.jpg`.
5. Write `src/data/caps.json` with `{id, name, hex: null, image, anchor: {x:0.5, y:0.55, width:0.35}}`.
6. `hex` left null — sampled later from the downloaded image at task 3.

```js
import { writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const BASE = 'https://everynightstudios.com';
const CAPS_DIR = 'public/caps';
const DATA_PATH = 'src/data/caps.json';

mkdirSync(CAPS_DIR, { recursive: true });

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchProducts() {
  const urls = [
    `${BASE}/collections/print-factory/products.json?limit=250`,
    `${BASE}/products.json?limit=250`,
  ];
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) continue;
    const { products } = await res.json();
    if (products?.length) return { products, source: u };
  }
  throw new Error('no products found');
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`img fetch failed: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

function isCapProduct(p) {
  const hay = `${p.product_type} ${p.tags} ${p.title}`.toLowerCase();
  return /(cap|hat|dad hat|baseball)/.test(hay);
}

const { products, source } = await fetchProducts();
console.log(`fetched ${products.length} products from ${source}`);

const caps = [];
for (const p of products) {
  if (!isCapProduct(p)) continue;
  const variants = p.variants || [];
  const images = p.images || [];

  // one cap entry per option1 (color) variant; use featured image if available
  const seen = new Set();
  for (const v of variants) {
    const colorName = v.option1 || p.title;
    const key = slugify(`${p.handle}-${colorName}`);
    if (seen.has(key)) continue;
    seen.add(key);

    const img = images.find(i => i.variant_ids?.includes(v.id)) || images[0];
    if (!img) continue;

    const filename = `${key}.jpg`;
    const destPath = path.join(CAPS_DIR, filename);
    try {
      await downloadImage(img.src, destPath);
    } catch (e) {
      console.warn(`skip ${key}: ${e.message}`);
      continue;
    }

    caps.push({
      id: key,
      name: colorName,
      product: p.title,
      hex: null,
      image: `public/caps/${filename}`,
      anchor: { x: 0.5, y: 0.55, width: 0.35 },
    });
    console.log(`+ ${key}`);
  }
}

writeFileSync(DATA_PATH, JSON.stringify(caps, null, 2));
console.log(`wrote ${caps.length} caps to ${DATA_PATH}`);
```

**Step 3: Run the scraper**

Run: `node scripts/scrape.mjs`
Expected: logs `fetched N products from ...`, lists each downloaded `+ slug`, writes `src/data/caps.json`.

If the `print-factory` collection returns 0 caps, inspect the response manually:
```bash
curl -s "https://everynightstudios.com/collections/print-factory/products.json?limit=250" | head -c 500
```
and adjust `isCapProduct` if needed.

**Step 4: Verify caps.json**

Run: `node -e "const c=require('./src/data/caps.json'); console.log(c.length, 'caps'); console.log(c[0])"`
Expected: non-zero count, sample cap with id/name/image/anchor fields.

**Step 5: Verify images downloaded**

Run: `ls public/caps/ | wc -l`
Expected: matches caps count (possibly slightly less if dupes were skipped).

**Step 6: Commit**

```bash
git add package.json package-lock.json scripts/ src/data/caps.json public/caps/
git commit -m "add: cap scraper and initial catalog"
```

*Note:* if the live site is blocked by scraping or returns no caps, STOP and tell the user — don't fabricate data. Fallback: user can paste the product JSON manually.

---

## Task 3: Sample cap hex color from image

**Why:** `hex` is null after scrape. We want a swatch color for the cap dropdown. Sample the average color from a central patch of each image.

**Files:**
- Create: `scripts/sample-hex.mjs`
- Modify: `src/data/caps.json` (in place, adding hex)

**Step 1: Write `scripts/sample-hex.mjs`**

Use Node's built-in image decoding via `sharp`? That adds a dep. Simpler: use `canvas` (node-canvas) — also a dep. Simplest: use pure-JS JPEG decode via `jpeg-js` (small, no native build).

```bash
npm install --silent jpeg-js
```

```js
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const caps = JSON.parse(readFileSync('src/data/caps.json', 'utf8'));

function sampleHex(imgPath) {
  const buf = readFileSync(imgPath);
  const { data, width, height } = jpeg.decode(buf, { useTArray: true });
  // Sample a 20% box centered on the image (avoids white bg edges).
  const x0 = Math.floor(width * 0.4);
  const x1 = Math.floor(width * 0.6);
  const y0 = Math.floor(height * 0.3);
  const y1 = Math.floor(height * 0.5);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

for (const c of caps) {
  try {
    c.hex = sampleHex(c.image);
    console.log(c.id, c.hex);
  } catch (e) {
    console.warn(`skip hex for ${c.id}: ${e.message}`);
  }
}

writeFileSync('src/data/caps.json', JSON.stringify(caps, null, 2));
```

**Step 2: Run it**

Run: `node scripts/sample-hex.mjs`
Expected: one line per cap with its sampled hex.

**Step 3: Spot-check**

Run: `node -e "const c=require('./src/data/caps.json'); console.log(c.slice(0,3))"`
Expected: each cap now has a hex like `#6b87c4`.

**Step 4: Commit**

```bash
git add package.json package-lock.json scripts/sample-hex.mjs src/data/caps.json
git commit -m "add: sample cap hex from image center"
```

---

## Task 4: Anchor math — pure function + tests

**Why:** We need to convert normalized `{x,y,width}` + image dimensions into pixel coords for rendering. This is the one bit of math that's easy to unit-test.

**Files:**
- Create: `src/lib/anchor.js`
- Create: `src/lib/anchor.test.mjs`

**Step 1: Write the failing test**

```js
// src/lib/anchor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnchor } from './anchor.js';

test('resolveAnchor centers at normalized coords', () => {
  const a = resolveAnchor({ x: 0.5, y: 0.5, width: 0.4 }, 1000, 800);
  assert.equal(a.cx, 500);
  assert.equal(a.cy, 400);
  assert.equal(a.boxW, 400);
});

test('resolveAnchor clamps out-of-range values', () => {
  const a = resolveAnchor({ x: 1.5, y: -0.1, width: 2 }, 100, 100);
  assert.equal(a.cx, 100);
  assert.equal(a.cy, 0);
  assert.equal(a.boxW, 100);
});
```

**Step 2: Run test, verify it fails**

Run: `node --test src/lib/anchor.test.mjs`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```js
// src/lib/anchor.js
export function resolveAnchor(anchor, imgW, imgH) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const x = clamp(anchor.x, 0, 1);
  const y = clamp(anchor.y, 0, 1);
  const w = clamp(anchor.width, 0, 1);
  return {
    cx: Math.round(x * imgW),
    cy: Math.round(y * imgH),
    boxW: Math.round(w * imgW),
  };
}
```

**Step 4: Run test, verify it passes**

Run: `node --test src/lib/anchor.test.mjs`
Expected: 2/2 PASS.

**Step 5: Commit**

```bash
git add src/lib/
git commit -m "add: resolveAnchor pure function with tests"
```

---

## Task 5: Font-fit math — pick a size that fits the text into box width

**Files:**
- Create: `src/lib/fontfit.js`
- Create: `src/lib/fontfit.test.mjs`

**Step 1: Write the failing test**

```js
// src/lib/fontfit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFontSize } from './fontfit.js';

// Fake ctx that treats each char as 10px wide at size 100.
function fakeCtx(perCharAt100) {
  return {
    font: '',
    measureText(s) {
      const m = parseFloat(this.font) || 100;
      return { width: s.length * perCharAt100 * (m / 100) };
    },
  };
}

test('fitFontSize scales down to fit box', () => {
  const ctx = fakeCtx(10); // "HELLO" at 100px = 50px wide
  const size = fitFontSize(ctx, 'HELLO', 'serif', 100, 25);
  // target 25px wide → scale to 50% of 100px → 50
  assert.equal(size, 50);
});

test('fitFontSize respects max size cap', () => {
  const ctx = fakeCtx(1);
  const size = fitFontSize(ctx, 'A', 'serif', 200, 1000, { max: 120 });
  assert.equal(size, 120);
});
```

**Step 2: Run test, verify it fails**

Run: `node --test src/lib/fontfit.test.mjs`
Expected: FAIL — module not found.

**Step 3: Write implementation**

```js
// src/lib/fontfit.js
export function fitFontSize(ctx, text, family, startSize, maxWidth, opts = {}) {
  const max = opts.max ?? 500;
  const min = opts.min ?? 6;
  ctx.font = `${startSize}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w === 0) return startSize;
  let size = (maxWidth / w) * startSize;
  size = Math.max(min, Math.min(max, size));
  return Math.floor(size);
}
```

**Step 4: Run test**

Run: `node --test src/lib/fontfit.test.mjs`
Expected: 2/2 PASS.

**Step 5: Commit**

```bash
git add src/lib/fontfit.js src/lib/fontfit.test.mjs
git commit -m "add: fitFontSize pure function with tests"
```

---

## Task 6: Canvas render — cap + text (no logo yet)

**Files:**
- Create: `src/render.js`

**Step 1: Write `src/render.js`**

```js
// src/render.js — draws cap + text (or later, logo) onto a canvas.
import { resolveAnchor } from './lib/anchor.js';
import { fitFontSize } from './lib/fontfit.js';

const imgCache = new Map();
export function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

export async function renderCard(canvas, { cap, threadHex, text, logoImage }) {
  const capImg = await loadImage(cap.image);
  canvas.width = capImg.naturalWidth;
  canvas.height = capImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(capImg, 0, 0);

  const { cx, cy, boxW } = resolveAnchor(cap.anchor, canvas.width, canvas.height);

  if (logoImage) {
    // implemented in task 8
    await drawLogo(ctx, logoImage, cx, cy, boxW, threadHex);
  } else if (text) {
    drawText(ctx, text, cx, cy, boxW, threadHex);
  }
}

function drawText(ctx, text, cx, cy, boxW, color) {
  const family = '"Georgia", serif';
  const size = fitFontSize(ctx, text, family, 200, boxW, { max: 220 });
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

async function drawLogo() {
  // placeholder — implemented in task 8
}
```

**Step 2: Verify it imports cleanly**

Run: `node -e "import('./src/render.js').then(m => console.log(Object.keys(m)))"`

This will fail because `Image` is a DOM global. That's expected — the module only loads in the browser. Instead:

Run: `node -e "const fs=require('fs'); console.log(fs.readFileSync('src/render.js','utf8').length > 500)"`
Expected: `true`

**Step 3: Commit**

```bash
git add src/render.js
git commit -m "add: canvas renderer for cap + text"
```

---

## Task 7: Cards UI — create, add, remove, wire to renderer

**Files:**
- Create: `src/cards.js`
- Modify: `src/main.js`
- Modify: `style.css`

**Step 1: Write `src/cards.js`**

```js
// src/cards.js — per-card state + DOM.
import { renderCard } from './render.js';

let nextId = 1;

export function createCard(caps, threads, getMaster) {
  const state = {
    id: nextId++,
    cap: caps[0],
    threadHex: threads[0].hex,
  };

  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <canvas></canvas>
    <div class="controls">
      <label>cap
        <select class="cap-select"></select>
      </label>
      <label>thread
        <select class="thread-select"></select>
      </label>
      <button class="remove" title="remove">×</button>
    </div>
  `;

  const canvas = el.querySelector('canvas');
  const capSel = el.querySelector('.cap-select');
  const threadSel = el.querySelector('.thread-select');
  const removeBtn = el.querySelector('.remove');

  for (const c of caps) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.product ?? ''} — ${c.name}`.replace(/^ — /, '');
    capSel.appendChild(opt);
  }
  for (const t of threads) {
    const opt = document.createElement('option');
    opt.value = t.hex;
    opt.textContent = t.name;
    threadSel.appendChild(opt);
  }

  async function redraw() {
    const master = getMaster();
    await renderCard(canvas, {
      cap: state.cap,
      threadHex: state.threadHex,
      text: master.text,
      logoImage: master.logoImage,
    });
  }

  capSel.addEventListener('change', () => {
    state.cap = caps.find(c => c.id === capSel.value);
    redraw();
  });
  threadSel.addEventListener('change', () => {
    state.threadHex = threadSel.value;
    redraw();
  });
  removeBtn.addEventListener('click', () => {
    el.remove();
    cards.delete(state.id);
  });

  cards.set(state.id, { state, redraw, el });
  redraw();

  return el;
}

export const cards = new Map();

export function redrawAll() {
  for (const c of cards.values()) c.redraw();
}
```

**Step 2: Modify `src/main.js`**

```js
import caps from './data/caps.json' with { type: 'json' };
import threads from './data/threads.json' with { type: 'json' };
import { createCard, redrawAll } from './cards.js';

const master = { text: 'every night', logoImage: null };
const getMaster = () => master;

const grid = document.getElementById('card-grid');
const bar = document.getElementById('master-bar');

bar.innerHTML = `
  <input class="text-input" type="text" maxlength="14" placeholder="type anything" value="${master.text}">
  <button class="add">+ card</button>
`;

bar.querySelector('.text-input').addEventListener('input', (e) => {
  master.text = e.target.value;
  redrawAll();
});
bar.querySelector('.add').addEventListener('click', () => {
  grid.appendChild(createCard(caps, threads, getMaster));
});

// seed with 4 cards
for (let i = 0; i < 4; i++) {
  const cap = caps[i % caps.length];
  const card = createCard(caps, threads, getMaster);
  // preselect a different cap for each seed card
  const sel = card.querySelector('.cap-select');
  sel.value = cap.id;
  sel.dispatchEvent(new Event('change'));
  grid.appendChild(card);
}
```

**Step 3: Add card styles to `style.css`**

```css
.card { background: #fff; border: 1px solid #e4e4df; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.card canvas { width: 100%; height: auto; display: block; background: #f0f0eb; border-radius: 4px; }
.card .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.card select { flex: 1; min-width: 0; padding: 4px; }
.card .remove { background: none; border: 1px solid #ddd; cursor: pointer; border-radius: 4px; width: 28px; height: 28px; }
#master-bar input.text-input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; min-width: 200px; }
#master-bar button { padding: 6px 12px; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px; }
```

**Step 4: Manual verify**

Run: `python3 -m http.server 8000 &`, open http://localhost:8000/

Check:
- [ ] 4 cards render with cap images
- [ ] Default text "every night" appears on each
- [ ] Changing master text live-updates all cards
- [ ] Changing cap dropdown updates that card only
- [ ] Changing thread dropdown recolors text on that card only
- [ ] `+ card` adds a new card
- [ ] `×` removes a card

Kill server when done: `kill %1`

**Step 5: Commit**

```bash
git add src/cards.js src/main.js style.css
git commit -m "add: card grid with cap/thread selectors and master text"
```

---

## Task 8: Logo upload — PNG and SVG, recolored

**Files:**
- Create: `src/lib/logo.js`
- Create: `src/lib/logo.test.mjs`
- Modify: `src/render.js` (implement `drawLogo`)
- Modify: `src/main.js` (add file input)

**Step 1: Write test for SVG recolor**

```js
// src/lib/logo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recolorSvg } from './logo.js';

test('recolorSvg overrides fill on all elements', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="red"/><circle cx="1" cy="1" r="1"/></svg>';
  const out = recolorSvg(input, '#00ff00');
  assert.match(out, /fill="#00ff00"/);
  // should strip or override existing fill
  assert.doesNotMatch(out, /fill="red"/);
});

test('recolorSvg strips stroke fills too', () => {
  const input = '<svg><path stroke="blue" fill="black"/></svg>';
  const out = recolorSvg(input, '#ff0000');
  assert.match(out, /fill="#ff0000"/);
});
```

**Step 2: Run test, verify it fails**

Run: `node --test src/lib/logo.test.mjs`
Expected: FAIL — module not found.

**Step 3: Write `src/lib/logo.js`**

```js
// src/lib/logo.js
// Replace all fill="..." attributes with a single color, and inject a
// default fill on the root <svg> so unstyled shapes inherit it.
export function recolorSvg(svgText, hex) {
  let s = svgText.replace(/\sfill="[^"]*"/g, '');
  s = s.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs} fill="${hex}">`);
  // ensure there's a fill="hex" somewhere even if svg tag handling fails
  if (!s.includes(`fill="${hex}"`)) {
    s = s.replace('<svg', `<svg fill="${hex}"`);
  }
  return s;
}

// Browser-only: takes an uploaded file (Blob) and returns {kind, data}
// where data is either an Image (png/jpg) or a string (svg text).
export async function readLogoFile(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = await file.text();
    return { kind: 'svg', text };
  }
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  return { kind: 'raster', img };
}

// Tint a raster image by its alpha, using an offscreen canvas.
export function tintRaster(img, hex) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// Recolor + rasterize svg to an Image.
export async function svgToImage(svgText, hex) {
  const colored = recolorSvg(svgText, hex);
  const blob = new Blob([colored], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
  } finally {
    // revoke after image has loaded
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
```

**Step 4: Run test**

Run: `node --test src/lib/logo.test.mjs`
Expected: 2/2 PASS.

**Step 5: Implement `drawLogo` in `src/render.js`**

Replace the placeholder `drawLogo` with:

```js
import { tintRaster, svgToImage } from './lib/logo.js';

async function drawLogo(ctx, logo, cx, cy, boxW, color) {
  let srcCanvas;
  if (logo.kind === 'svg') {
    const img = await svgToImage(logo.text, color);
    srcCanvas = img;
  } else {
    srcCanvas = tintRaster(logo.img, color);
  }
  const w = srcCanvas.width || srcCanvas.naturalWidth;
  const h = srcCanvas.height || srcCanvas.naturalHeight;
  const scale = boxW / w;
  const drawW = boxW;
  const drawH = h * scale;
  ctx.drawImage(srcCanvas, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}
```

Also remove the stub `async function drawLogo() {}` at the bottom.

**Step 6: Add logo upload to master bar in `src/main.js`**

Add to the innerHTML in master bar:

```html
<label class="file-label">
  upload logo
  <input class="logo-input" type="file" accept=".svg,.png,.jpg,.jpeg" hidden>
</label>
<button class="logo-clear" hidden>clear logo</button>
```

Wire up (add after the text input listener):

```js
import { readLogoFile } from './lib/logo.js';

const logoInput = bar.querySelector('.logo-input');
const logoClear = bar.querySelector('.logo-clear');
logoInput.addEventListener('change', async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  master.logoImage = await readLogoFile(file);
  master.logoFilename = file.name;
  logoClear.hidden = false;
  redrawAll();
});
logoClear.addEventListener('click', () => {
  master.logoImage = null;
  master.logoFilename = null;
  logoInput.value = '';
  logoClear.hidden = true;
  redrawAll();
});
```

Also update the `master` init:

```js
const master = { text: 'every night', logoImage: null, logoFilename: null };
```

**Step 7: Manual verify**

Run: `python3 -m http.server 8000 &`, open http://localhost:8000/

- [ ] Upload a simple SVG — appears on every card tinted to each card's thread color
- [ ] Upload a PNG — same
- [ ] Clear logo — text comes back
- [ ] Changing thread color on one card recolors just that card's logo

Kill server: `kill %1`

**Step 8: Commit**

```bash
git add src/lib/logo.js src/lib/logo.test.mjs src/render.js src/main.js
git commit -m "add: logo upload with per-card thread-color recoloring"
```

---

## Task 9: Specs builder — pure function + tests

**Files:**
- Create: `src/lib/specs.js`
- Create: `src/lib/specs.test.mjs`

**Step 1: Write the failing test**

```js
// src/lib/specs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpecs } from './specs.js';

test('buildSpecs emits one entry per card', () => {
  const cards = [
    { state: { cap: { id: 'a', name: 'A', product: 'Cap' }, threadHex: '#fff' } },
    { state: { cap: { id: 'b', name: 'B', product: 'Cap' }, threadHex: '#000' } },
  ];
  const master = { text: 'hi', logoFilename: 'logo.svg' };
  const threadLookup = { '#fff': 'Bright White', '#000': 'Black' };
  const specs = buildSpecs(cards, master, threadLookup);
  assert.equal(specs.length, 2);
  assert.equal(specs[0].index, 1);
  assert.equal(specs[0].capId, 'a');
  assert.equal(specs[0].threadName, 'Bright White');
  assert.equal(specs[0].text, 'hi');
  assert.equal(specs[0].logoFilename, 'logo.svg');
  assert.equal(specs[1].index, 2);
});

test('buildSpecs handles unknown thread hex', () => {
  const cards = [{ state: { cap: { id: 'a', name: 'A' }, threadHex: '#abcdef' } }];
  const specs = buildSpecs(cards, { text: '', logoFilename: null }, {});
  assert.equal(specs[0].threadName, null);
  assert.equal(specs[0].threadHex, '#abcdef');
  assert.equal(specs[0].logoFilename, null);
});
```

**Step 2: Run test, verify it fails**

Run: `node --test src/lib/specs.test.mjs`
Expected: FAIL.

**Step 3: Write `src/lib/specs.js`**

```js
// src/lib/specs.js
export function buildSpecs(cards, master, threadLookup) {
  return cards.map((c, i) => {
    const { cap, threadHex } = c.state;
    return {
      index: i + 1,
      capId: cap.id,
      capName: cap.name,
      capProduct: cap.product ?? null,
      threadHex,
      threadName: threadLookup[threadHex] ?? null,
      text: master.text,
      logoFilename: master.logoFilename ?? null,
    };
  });
}
```

**Step 4: Run test**

Run: `node --test src/lib/specs.test.mjs`
Expected: 2/2 PASS.

**Step 5: Commit**

```bash
git add src/lib/specs.js src/lib/specs.test.mjs
git commit -m "add: buildSpecs pure function with tests"
```

---

## Task 10: Export zip — canvas PNGs + specs.json + logo

**Files:**
- Create: `src/export.js`
- Modify: `src/main.js` (add export button)
- Modify: `index.html` (add JSZip CDN script)

**Step 1: Add JSZip CDN to `index.html`**

In `<head>`, before the stylesheet:

```html
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
```

**Step 2: Write `src/export.js`**

```js
// src/export.js
import { buildSpecs } from './lib/specs.js';
import { cards } from './cards.js';

export async function exportZip(threads, master) {
  const zip = new JSZip();
  const threadLookup = Object.fromEntries(threads.map(t => [t.hex, t.name]));
  const cardList = Array.from(cards.values());

  const specs = buildSpecs(cardList, master, threadLookup);

  for (let i = 0; i < cardList.length; i++) {
    const canvas = cardList[i].el.querySelector('canvas');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const name = `card-${String(i + 1).padStart(2, '0')}-${cardList[i].state.cap.id}.png`;
    zip.file(name, blob);
  }

  zip.file('specs.json', JSON.stringify(specs, null, 2));

  if (master.logoFile) {
    zip.file(`logo-${master.logoFilename}`, master.logoFile);
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `everynight-prototype-${ts}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
```

**Step 3: Modify `src/main.js`**

Add export button to master bar innerHTML:

```html
<button class="export">export zip</button>
```

Store the logo File too (for inclusion in the zip):

```js
logoInput.addEventListener('change', async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  master.logoImage = await readLogoFile(file);
  master.logoFilename = file.name;
  master.logoFile = file;
  logoClear.hidden = false;
  redrawAll();
});
logoClear.addEventListener('click', () => {
  master.logoImage = null;
  master.logoFilename = null;
  master.logoFile = null;
  logoInput.value = '';
  logoClear.hidden = true;
  redrawAll();
});
```

Wire the export button:

```js
import { exportZip } from './export.js';

bar.querySelector('.export').addEventListener('click', async () => {
  await exportZip(threads, master);
});
```

**Step 4: Manual verify**

Run: `python3 -m http.server 8000 &`, open http://localhost:8000/

- [ ] Type text, pick some caps/colors, click `export zip`
- [ ] Unzip the downloaded file
- [ ] `card-01-*.png` through `card-N-*.png` present and show correct mockups
- [ ] `specs.json` has correct cap/thread/text per card
- [ ] Upload a logo, re-export — `logo-<name>` file is in the zip

Kill server: `kill %1`

**Step 5: Commit**

```bash
git add index.html src/export.js src/main.js
git commit -m "add: zip export with per-card png, specs.json, logo"
```

---

## Task 11: Cap color swatches in dropdown (nice-to-have polish)

**Files:**
- Modify: `src/cards.js`
- Modify: `style.css`

**Step 1: Replace cap select with a color-swatch dropdown**

Change the `cap-select` population in `cards.js` to show a colored dot next to each option. Native `<option>` elements can't render arbitrary HTML, but we can put a colored bullet char prefix and a data attribute:

```js
for (const c of caps) {
  const opt = document.createElement('option');
  opt.value = c.id;
  opt.textContent = `${c.product ?? 'Cap'} — ${c.name}`;
  opt.style.backgroundColor = c.hex || '#fff';
  opt.style.color = contrastOn(c.hex);
  capSel.appendChild(opt);
}

function contrastOn(hex) {
  if (!hex) return '#000';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return (r*0.299 + g*0.587 + b*0.114) > 150 ? '#000' : '#fff';
}
```

Same treatment for thread select (swatch background per option).

**Step 2: Manual verify**

Open the app — cap dropdown shows options with cap-colored backgrounds, thread dropdown shows options with thread-colored backgrounds.

**Step 3: Commit**

```bash
git add src/cards.js
git commit -m "add: colored backgrounds in cap and thread dropdowns"
```

---

## Task 12: Calibration tool — per-cap text anchor box

**Files:**
- Create: `calibrate.html`
- Create: `calibrate.js`

**Step 1: Write `calibrate.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Calibrate — cap text anchors</title>
  <style>
    body { font: 14px/1.4 system-ui; margin: 0; padding: 16px; }
    header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    #stage { position: relative; display: inline-block; border: 1px solid #ccc; user-select: none; }
    #stage img { display: block; max-width: 700px; height: auto; }
    #box { position: absolute; border: 2px solid #e84b2a; background: rgba(232,75,42,0.15); pointer-events: none; }
    progress { vertical-align: middle; }
  </style>
</head>
<body>
  <header>
    <span id="label"></span>
    <progress id="prog" value="0" max="1"></progress>
    <button id="prev">◀ prev</button>
    <button id="next">next ▶</button>
    <button id="download">download caps.json</button>
  </header>
  <div id="stage">
    <img id="cap-img" alt="">
    <div id="box" hidden></div>
  </div>
  <p>Click-drag on the cap front to set the text anchor. Arrow keys to nudge. Enter = next.</p>
  <script type="module" src="calibrate.js"></script>
</body>
</html>
```

**Step 2: Write `calibrate.js`**

```js
import caps from './src/data/caps.json' with { type: 'json' };

let i = 0;
const stage = document.getElementById('stage');
const img = document.getElementById('cap-img');
const box = document.getElementById('box');
const label = document.getElementById('label');
const prog = document.getElementById('prog');

function show() {
  const c = caps[i];
  label.textContent = `${i + 1}/${caps.length} · ${c.product ?? ''} — ${c.name}`;
  prog.value = (i + 1) / caps.length;
  img.src = c.image;
  img.onload = drawBox;
}

function drawBox() {
  const c = caps[i];
  const { x, y, width } = c.anchor;
  const w = img.clientWidth, h = img.clientHeight;
  const bw = width * w;
  const bh = bw * 0.4; // arbitrary display height, anchor stores width only
  box.hidden = false;
  box.style.left = `${x * w - bw / 2}px`;
  box.style.top = `${y * h - bh / 2}px`;
  box.style.width = `${bw}px`;
  box.style.height = `${bh}px`;
}

let drag = null;
stage.addEventListener('mousedown', (e) => {
  const r = img.getBoundingClientRect();
  drag = { x0: e.clientX - r.left, y0: e.clientY - r.top };
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = img.getBoundingClientRect();
  drag.x1 = e.clientX - r.left;
  drag.y1 = e.clientY - r.top;
  const cx = (drag.x0 + drag.x1) / 2;
  const cy = (drag.y0 + drag.y1) / 2;
  const bw = Math.abs(drag.x1 - drag.x0);
  caps[i].anchor = {
    x: cx / img.clientWidth,
    y: cy / img.clientHeight,
    width: bw / img.clientWidth,
  };
  drawBox();
});
window.addEventListener('mouseup', () => { drag = null; });

document.getElementById('prev').addEventListener('click', () => { i = Math.max(0, i - 1); show(); });
document.getElementById('next').addEventListener('click', () => { i = Math.min(caps.length - 1, i + 1); show(); });
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(caps, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'caps.json';
  a.click();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { document.getElementById('next').click(); }
  const step = e.shiftKey ? 0.02 : 0.005;
  const a = caps[i].anchor;
  if (e.key === 'ArrowLeft') a.x -= step;
  else if (e.key === 'ArrowRight') a.x += step;
  else if (e.key === 'ArrowUp') a.y -= step;
  else if (e.key === 'ArrowDown') a.y += step;
  else return;
  drawBox();
});

show();
```

**Step 3: Manual verify**

Run: `python3 -m http.server 8000 &`, open http://localhost:8000/calibrate.html

- [ ] Cap shown with default box
- [ ] Drag to reposition/resize box
- [ ] Arrow keys nudge
- [ ] Next/prev cycle through caps
- [ ] Download produces updated `caps.json`

Replace `src/data/caps.json` with downloaded file, reload app, confirm text lands on cap fronts.

Kill server: `kill %1`

**Step 4: Commit**

```bash
git add calibrate.html calibrate.js src/data/caps.json
git commit -m "add: calibration tool for per-cap text anchors"
```

---

## Task 13: README polish

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README with sections**

```markdown
# Every Night Cap Prototyper

Vanilla-JS tool for prototyping embroidered cap mockups from Every Night Studios Print Factory.

## What it does

- Grid of cards, each one a cap mockup with its own cap color + thread (yarn) color
- Master text input + logo upload apply to every card
- Logo recolored per-card to match that card's thread color
- Export as zip: per-card PNGs + `specs.json` + uploaded logo file

## Quick start

    python3 -m http.server 8000
    open http://localhost:8000

## First-time setup (scrape catalog)

The repo is committed with a catalog already scraped. To refresh:

    npm install
    node scripts/scrape.mjs
    node scripts/sample-hex.mjs
    open http://localhost:8000/calibrate.html   # drag to set text anchors

## Tests

    node --test

## Layout

- `index.html` — app entry
- `src/main.js` — wires master bar + grid
- `src/cards.js` — per-card state + DOM
- `src/render.js` — canvas compositing (cap + text / logo)
- `src/export.js` — zip + png export
- `src/lib/` — pure helpers (anchor math, font fit, logo recolor, specs)
- `src/data/caps.json`, `src/data/threads.json` — catalog
- `public/caps/*.jpg` — cap images
- `scripts/scrape.mjs` — one-off catalog scraper
- `scripts/sample-hex.mjs` — one-off hex sampler
- `calibrate.html` — one-off text-anchor calibrator
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: expand README with layout and workflows"
```

---

## Final verification checklist

Before calling it done, run through the whole happy path:

1. `node --test` — all test files pass
2. `python3 -m http.server 8000` — app loads
3. 4 seed cards render with cap images + default text
4. Change master text — all cards update
5. Upload a PNG logo — all cards render the logo in each card's thread color
6. Upload an SVG logo — same
7. Clear logo — text comes back
8. Change cap on one card — only that card updates
9. Change thread on one card — only that card updates
10. Add a card — appears
11. Remove a card — disappears
12. Export zip — contains N PNGs + specs.json + logo file
13. Specs.json cap names, thread names, text all correct
