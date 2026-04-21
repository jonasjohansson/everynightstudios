import caps from './data/caps.json' with { type: 'json' };
import threads from './data/threads.json' with { type: 'json' };
import { createCard, cards, redrawAll } from './cards.js';
import { readLogoFile } from './lib/logo.js';
import { exportZip } from './export.js';

const CAP_ASPECT = 688 / 885;

const master = {
  text: 'every night',
  logoImage: null,
  logoFilename: null,
  logoFile: null,
  fontScale: 1.0,
};
const getMaster = () => master;

const grid = document.getElementById('card-grid');
const bar = document.getElementById('master-bar');

bar.innerHTML = `
  <input class="text-input" type="text" maxlength="14" placeholder="type anything" value="${master.text}">
  <label class="file-label">
    upload logo
    <input class="logo-input" type="file" accept=".svg,.png,.jpg,.jpeg" hidden>
  </label>
  <button class="logo-clear" hidden>clear logo</button>
  <label class="num-label">
    cards
    <input class="count" type="number" min="1" max="40" value="4">
  </label>
  <label class="range-label">
    size
    <input class="font-scale" type="range" min="0.3" max="2" step="0.05" value="1">
  </label>
  <button class="randomize">randomize</button>
  <button class="export">export zip</button>
`;

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

bar.querySelector('.font-scale').addEventListener('input', (e) => {
  master.fontScale = parseFloat(e.target.value);
  redrawAll();
});

bar.querySelector('.randomize').addEventListener('click', () => {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  for (const c of cards.values()) {
    c.setCap(pick(caps));
    c.setThread(pick(threads).hex);
  }
});

bar.querySelector('.export').addEventListener('click', () => {
  exportZip(threads, master);
});

function setCardCount(target) {
  const current = cards.size;
  if (target > current) {
    for (let i = current; i < target; i++) {
      const cap = caps[i % caps.length];
      const cardEl = createCard(caps, threads, getMaster);
      const sel = cardEl.querySelector('.cap-select');
      sel.value = cap.id;
      sel.dispatchEvent(new Event('change'));
      grid.appendChild(cardEl);
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

setCardCount(4);
fitGrid();
