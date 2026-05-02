import catalog from './data/catalog.json' with { type: 'json' };
import { createView } from './view.js';
import { exportZip } from './export.js';

const brands = [...new Set(catalog.map(x => x.brand))];

const state = {
  brand: catalog[0].brand,
  itemId: catalog[0].id,
  colorId: catalog[0].colors[0].id,
};

// Read item + color from the URL hash (e.g. #item=sttu199&color=c727) so
// pasted links open on a specific configuration. Falls back to defaults.
(function applyHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashItem = params.get('item');
  const hashColor = params.get('color');
  if (hashItem && catalog.some(x => x.id === hashItem)) {
    state.itemId = hashItem;
    state.brand = catalog.find(x => x.id === hashItem).brand;
  }
  const item = catalog.find(x => x.id === state.itemId);
  if (hashColor && item.colors.some(c => c.id === hashColor)) {
    state.colorId = hashColor;
  }
})();

function syncHash() {
  const next = `item=${state.itemId}&color=${state.colorId}`;
  if (location.hash.replace(/^#/, '') === next) return;
  history.replaceState(null, '', `#${next}`);
}

const stylesFor = (brand) => catalog.filter(x => x.brand === brand);
const getItem = () => catalog.find(x => x.id === state.itemId);
const getColor = () => {
  const item = getItem();
  return item.colors.find(c => c.id === state.colorId) || item.colors[0];
};

const bar = document.getElementById('bar');
const views = document.getElementById('views');

bar.innerHTML = `
  <label>
    brand
    <select class="brand"></select>
  </label>
  <label>
    style
    <select class="style"></select>
  </label>
`;

// Floating left rail — garment color swatches + design color tint, always
// reachable while the cog hides the rest of the chrome.
const rail = document.createElement('aside');
rail.id = 'color-rail';
rail.innerHTML = `
  <div class="swatches rail-swatches"></div>
  <div class="rail-sep"></div>
  <input class="design-color" type="color" value="#ff3366" title="design tint">
  <button class="design-color-clear" type="button" title="reset design tint">×</button>
`;
document.body.appendChild(rail);

const brandSelect = bar.querySelector('select.brand');
const styleSelect = bar.querySelector('select.style');

// Floating source link — sits beneath the export chip; href updates per item.
const EXTERNAL_LINK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const sourceLink = document.createElement('a');
sourceLink.className = 'source-btn';
sourceLink.target = '_blank';
sourceLink.rel = 'noopener';
sourceLink.title = 'product source';
sourceLink.setAttribute('aria-label', 'product source');
sourceLink.innerHTML = EXTERNAL_LINK_SVG;
document.body.appendChild(sourceLink);
const swatchRow = rail.querySelector('.rail-swatches');
const designColor = rail.querySelector('input.design-color');
const designColorClear = rail.querySelector('button.design-color-clear');

function updateSourceLink() {
  const item = getItem();
  if (item && item.source) {
    sourceLink.href = item.source;
    sourceLink.hidden = false;
  } else {
    sourceLink.removeAttribute('href');
    sourceLink.hidden = true;
  }
}

for (const b of brands) {
  const opt = document.createElement('option');
  opt.value = b;
  opt.textContent = b;
  brandSelect.appendChild(opt);
}

function renderStyles() {
  styleSelect.innerHTML = '';
  for (const item of stylesFor(state.brand)) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.style ? `${item.style} — ${item.name}` : item.name;
    styleSelect.appendChild(opt);
  }
  if (!stylesFor(state.brand).some(i => i.id === state.itemId)) {
    state.itemId = stylesFor(state.brand)[0].id;
  }
  styleSelect.value = state.itemId;
}

function renderSwatches() {
  swatchRow.innerHTML = '';
  const item = getItem();
  if (!item.colors.some(c => c.id === state.colorId)) {
    state.colorId = item.colors[0].id;
  }
  for (const c of item.colors) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c.hex;
    b.title = c.name;
    b.dataset.id = c.id;
    b.classList.toggle('active', c.id === state.colorId);
    b.addEventListener('click', () => {
      state.colorId = c.id;
      renderSwatches();
      syncHash();
      front.redraw();
      back.redraw();
    });
    swatchRow.appendChild(b);
  }
}

brandSelect.addEventListener('change', () => {
  state.brand = brandSelect.value;
  renderStyles();
  updateSourceLink();
  renderSwatches();
  syncHash();
  front.loadForCurrentItem();
  back.loadForCurrentItem();
});

styleSelect.addEventListener('change', () => {
  state.itemId = styleSelect.value;
  updateSourceLink();
  renderSwatches();
  syncHash();
  front.loadForCurrentItem();
  back.loadForCurrentItem();
});

const front = createView({ label: 'Front', getItem, getColor, viewKey: 'front' });
const back  = createView({ label: 'Back',  getItem, getColor, viewKey: 'back'  });
views.appendChild(front.el);
views.appendChild(back.el);

// Draggable splitter between front/back so the user can show more of one side.
const splitter = document.createElement('div');
splitter.className = 'view-splitter';
splitter.setAttribute('role', 'separator');
splitter.setAttribute('aria-orientation', 'vertical');
views.appendChild(splitter);

const SPLIT_KEY = 'apparel:split';
const MIN_PANEL = 80;
const savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
if (Number.isFinite(savedSplit)) {
  views.style.setProperty('--split', savedSplit + '%');
}

splitter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('dragging');
  const onMove = (ev) => {
    const rect = views.getBoundingClientRect();
    const x = Math.max(MIN_PANEL, Math.min(rect.width - MIN_PANEL, ev.clientX - rect.left));
    const pct = (x / rect.width) * 100;
    views.style.setProperty('--split', pct + '%');
  };
  const onUp = () => {
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
    const cur = views.style.getPropertyValue('--split');
    if (cur) localStorage.setItem(SPLIT_KEY, parseFloat(cur).toString());
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
});

splitter.addEventListener('dblclick', () => {
  views.style.removeProperty('--split');
  localStorage.removeItem(SPLIT_KEY);
});

// Track which view was last clicked so keyboard shortcuts apply there.
let focusedView = front;
document.addEventListener('pointerdown', (e) => {
  if (front.el.contains(e.target)) focusedView = front;
  else if (back.el.contains(e.target)) focusedView = back;
}, true);

document.addEventListener('keydown', (e) => {
  // Don't intercept when typing into a field.
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod) {
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) focusedView.redo();
      else focusedView.undo();
    } else if (k === 'y') {
      e.preventDefault();
      focusedView.redo();
    } else if (k === 'backspace' || k === 'delete') {
      e.preventDefault();
      focusedView.clear();
    } else if (k === 'd') {
      e.preventDefault();
      focusedView.duplicate();
    }
  } else {
    if (k === 'r') {
      e.preventDefault();
      focusedView.reset();
    }
  }
});

designColor.addEventListener('input', () => {
  front.setGlobalColor(designColor.value);
  back.setGlobalColor(designColor.value);
});
designColorClear.addEventListener('click', () => {
  front.clearGlobalColor();
  back.clearGlobalColor();
});

// Floating export button — sits under the cog, always visible.
const exportBtn = document.createElement('button');
exportBtn.className = 'export-btn';
exportBtn.type = 'button';
exportBtn.title = 'export zip';
exportBtn.setAttribute('aria-label', 'export zip');
exportBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
exportBtn.addEventListener('click', async () => {
  try {
    await exportZip({ item: getItem(), color: getColor(), front, back });
  } catch (e) {
    console.error('export failed:', e);
    alert('export failed — check console');
  }
});
document.body.appendChild(exportBtn);

brandSelect.value = state.brand;
renderStyles();
updateSourceLink();
renderSwatches();
syncHash();
