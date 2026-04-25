import caps from './data/caps.json' with { type: 'json' };
import threads from './data/threads.json' with { type: 'json' };
import { createCard, cards, redrawAll } from './cards.js';
import { readLogoFile } from './lib/logo.js';
import { exportZip, exportCard } from './export.js';
import { CAP_FRONT_CM } from './lib/specs.js';

const CAP_ASPECT = 688 / 885;
const DEFAULT_COUNT = 6;

const master = {
  text: 'every night',
  logoImage: null,
  logoFilename: null,
  logoFile: null,
  fontScale: 1.0,
  yOffset: 0,
};
const getMaster = () => master;

const grid = document.getElementById('cap-grid');
const bar = document.getElementById('master-bar');

bar.innerHTML = `
  <input class="text-input" type="text" maxlength="14" placeholder="type anything" value="${master.text}">
  <label class="file-label">
    upload logo
    <input class="logo-input" type="file" accept=".svg,.png,.jpg,.jpeg" hidden>
  </label>
  <button class="logo-clear" hidden>clear logo</button>
  <span class="sep"></span>
  <label class="num-label">
    caps
    <input class="count" type="number" min="1" max="40" value="${DEFAULT_COUNT}">
  </label>
  <label class="range-label">
    size
    <input class="font-scale" type="range" min="0.3" max="2" step="0.05" value="1">
    <span class="size-readout"></span>
  </label>
  <label class="range-label">
    y
    <input class="y-offset" type="range" min="-0.3" max="0.3" step="0.005" value="0">
  </label>
`;

function handleCardExport(entry) {
  const index = Array.from(cards.values()).indexOf(entry) + 1;
  exportCard(entry, index, threads, master);
}

bar.querySelector('.text-input').addEventListener('input', (e) => {
  master.text = e.target.value;
  redrawAll();
});

const logoInput = bar.querySelector('.logo-input');
const logoClear = bar.querySelector('.logo-clear');

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

const countInput = bar.querySelector('.count');
countInput.addEventListener('input', () => {
  const target = Math.max(1, Math.min(40, parseInt(countInput.value) || 1));
  setCardCount(target);
  fitGrid();
});

const sizeReadout = bar.querySelector('.size-readout');
function updateSizeReadout() {
  sizeReadout.textContent = `${(master.fontScale * CAP_FRONT_CM).toFixed(1)} cm`;
}
bar.querySelector('.font-scale').addEventListener('input', (e) => {
  master.fontScale = parseFloat(e.target.value);
  updateSizeReadout();
  redrawAll();
});
updateSizeReadout();

bar.querySelector('.y-offset').addEventListener('input', (e) => {
  master.yOffset = parseFloat(e.target.value);
  redrawAll();
});

// Floating buttons — randomize + export, always reachable below the cog.
const SHUFFLE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;
const DOWNLOAD_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

const randomizeBtn = document.createElement('button');
randomizeBtn.className = 'randomize-btn';
randomizeBtn.type = 'button';
randomizeBtn.title = 'randomize';
randomizeBtn.setAttribute('aria-label', 'randomize');
randomizeBtn.innerHTML = SHUFFLE_SVG;
randomizeBtn.addEventListener('click', () => {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  for (const c of cards.values()) {
    if (c.state.locked) continue;
    c.setCap(pick(caps));
    c.setThread(pick(threads).hex);
  }
});
document.body.appendChild(randomizeBtn);

const exportBtn = document.createElement('button');
exportBtn.className = 'export-btn';
exportBtn.type = 'button';
exportBtn.title = 'export zip';
exportBtn.setAttribute('aria-label', 'export zip');
exportBtn.innerHTML = DOWNLOAD_SVG;
exportBtn.addEventListener('click', () => exportZip(threads, master));
document.body.appendChild(exportBtn);

function setCardCount(target) {
  const current = cards.size;
  if (target > current) {
    for (let i = current; i < target; i++) {
      const cap = caps[i % caps.length];
      const cardEl = createCard(caps, threads, getMaster, handleCardExport);
      grid.appendChild(cardEl);
      const entry = Array.from(cards.values()).pop();
      entry.setCap(cap);
    }
  } else if (target < current) {
    const toRemove = Array.from(cards.entries()).slice(target);
    for (const [id, entry] of toRemove) {
      entry.el.remove();
      cards.delete(id);
    }
  }
}

function fitGrid() {
  const n = cards.size;
  if (n === 0) return;
  const W = grid.clientWidth;
  const H = grid.clientHeight;
  if (!W || !H) return;
  let bestCols = 1, bestArea = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = W / cols;
    const cellH = H / rows;
    const capW = Math.min(cellW, cellH * CAP_ASPECT);
    const capH = capW / CAP_ASPECT;
    const area = capW * capH;
    if (area > bestArea) { bestArea = area; bestCols = cols; }
  }
  const rows = Math.ceil(n / bestCols);
  grid.style.gridTemplateColumns = `repeat(${bestCols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
}

window.addEventListener('resize', fitGrid);

setCardCount(DEFAULT_COUNT);
fitGrid();

// Load the default logo.
(async () => {
  try {
    const res = await fetch('../shared/default-logo.svg');
    if (!res.ok) return;
    const text = await res.text();
    const blob = new Blob([text], { type: 'image/svg+xml' });
    const file = new File([blob], 'default-logo.svg', { type: 'image/svg+xml' });
    master.logoImage = await readLogoFile(file);
    master.logoFilename = file.name;
    master.logoFile = file;
    logoClear.hidden = false;
    redrawAll();
  } catch (e) {
    console.warn('default logo load failed:', e);
  }
})();
