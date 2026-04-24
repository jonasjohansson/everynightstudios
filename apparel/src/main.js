import catalog from './data/catalog.json' with { type: 'json' };
import { createView } from './view.js';
import { exportZip } from './export.js';

const brands = [...new Set(catalog.map(x => x.brand))];

const state = {
  brand: catalog[0].brand,
  itemId: catalog[0].id,
  colorId: catalog[0].colors[0].id,
};

const stylesFor = (brand) => catalog.filter(x => x.brand === brand);
const getItem = () => catalog.find(x => x.id === state.itemId);
const getColor = () => {
  const item = getItem();
  return item.colors.find(c => c.id === state.colorId) || item.colors[0];
};

const bar = document.getElementById('bar');
const views = document.getElementById('views');

bar.innerHTML = `
  <a class="back" href="../">← tools</a>
  <span class="sep"></span>
  <label>
    brand
    <select class="brand"></select>
  </label>
  <label>
    style
    <select class="style"></select>
  </label>
  <a class="source" target="_blank" rel="noopener" hidden>source ↗</a>
  <span class="sep"></span>
  <label>
    color
    <div class="swatches"></div>
  </label>
  <span class="color-name"></span>
  <span class="spacer"></span>
  <button class="export">export zip</button>
`;

const brandSelect = bar.querySelector('select.brand');
const styleSelect = bar.querySelector('select.style');
const sourceLink = bar.querySelector('a.source');
const swatchRow = bar.querySelector('.swatches');
const colorName = bar.querySelector('.color-name');

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
      front.redraw();
      back.redraw();
    });
    swatchRow.appendChild(b);
  }
  const active = item.colors.find(c => c.id === state.colorId);
  colorName.textContent = active ? active.name : '';
}

brandSelect.addEventListener('change', () => {
  state.brand = brandSelect.value;
  renderStyles();
  updateSourceLink();
  renderSwatches();
  front.loadForCurrentItem();
  back.loadForCurrentItem();
});

styleSelect.addEventListener('change', () => {
  state.itemId = styleSelect.value;
  updateSourceLink();
  renderSwatches();
  front.loadForCurrentItem();
  back.loadForCurrentItem();
});

const front = createView({ label: 'Front', getItem, getColor, viewKey: 'front' });
const back  = createView({ label: 'Back',  getItem, getColor, viewKey: 'back'  });
views.appendChild(front.el);
views.appendChild(back.el);

bar.querySelector('button.export').addEventListener('click', async () => {
  try {
    await exportZip({ item: getItem(), color: getColor(), front, back });
  } catch (e) {
    console.error('export failed:', e);
    alert('export failed — check console');
  }
});

brandSelect.value = state.brand;
renderStyles();
updateSourceLink();
renderSwatches();
