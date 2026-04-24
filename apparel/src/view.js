import { CANVAS_W, CANVAS_H } from './garments.js';
import { renderView, getDesignHandles, pointInDesign, loadImageFromFile } from './render.js';

const HANDLE_HIT = 18;
const COLORIZE_MODES = [
  { id: 'original', label: 'Orig' },
  { id: 'invert',   label: 'Inv' },
  { id: 'white',    label: 'White' },
  { id: 'black',    label: 'Black' },
];
const BLEND_MODES = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply',    label: 'Mult' },
  { id: 'screen',      label: 'Scrn' },
];
const FONTS = [
  { id: 'offbit',        label: 'OffBit',         family: 'OffBit',         weight: 400 },
  { id: 'offbit-bold',   label: 'OffBit Bold',    family: 'OffBit',         weight: 700 },
  { id: 'past-perfect',  label: 'Past Perfect',   family: 'OPSPastPerfect', weight: 400 },
];
const DEFAULT_TEXT = 'design';
const DEFAULT_FONT_ID = 'offbit';
const DEFAULT_FONT_SIZE = 160;

const RECENT_KEY = 'apparel:recent-designs';
const LAST_KEY = (viewKey, itemId) => `apparel:last-design:${viewKey}:${itemId}`;
const MAX_RECENT = 6;

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function writeRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); }
  catch { /* quota exceeded — silently skip */ }
}
function pushRecent(entry) {
  const list = readRecent().filter(r => r.dataUrl !== entry.dataUrl);
  list.unshift(entry);
  writeRecent(list);
}
function setLast(viewKey, itemId, entry) {
  try {
    const key = LAST_KEY(viewKey, itemId);
    if (entry) localStorage.setItem(key, JSON.stringify(entry));
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}
function getLast(viewKey, itemId) {
  try {
    const raw = localStorage.getItem(LAST_KEY(viewKey, itemId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function loadImageFromDataUrl(dataUrl) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
}

const recentSubscribers = new Set();
function subscribeRecent(fn) { recentSubscribers.add(fn); return () => recentSubscribers.delete(fn); }
function notifyRecent() { for (const fn of recentSubscribers) fn(); }

export function createView({ label, getItem, getColor, viewKey }) {
  const el = document.createElement('section');
  el.className = 'view';
  el.innerHTML = `
    <div class="label">${label}</div>
    <canvas></canvas>
    <div class="controls">
      <label class="file-label">
        upload ${label.toLowerCase()} design
        <input type="file" accept="image/*" hidden>
      </label>
      <button class="type-text">type</button>
      <input class="text-input" type="text" placeholder="text" hidden>
      <select class="font-select" hidden></select>
      <input class="size-slider" type="range" min="40" max="400" step="2" hidden>
      <input class="text-color" type="color" hidden>
      <button class="clear" hidden>clear</button>
      <button class="reset" hidden>reset</button>
      <button class="crop" hidden>circle</button>
      <div class="recent" hidden></div>
      <div class="colorize" hidden></div>
      <div class="blend" hidden></div>
    </div>
  `;

  const canvas = el.querySelector('canvas');
  const fileInput = el.querySelector('input[type=file]');
  const typeBtn = el.querySelector('.type-text');
  const textInput = el.querySelector('.text-input');
  const fontSelect = el.querySelector('.font-select');
  const sizeSlider = el.querySelector('.size-slider');
  const textColorInput = el.querySelector('.text-color');
  const clearBtn = el.querySelector('.clear');
  const resetBtn = el.querySelector('.reset');
  const cropBtn = el.querySelector('.crop');
  const recentEl = el.querySelector('.recent');
  const colorizeEl = el.querySelector('.colorize');
  const blendEl = el.querySelector('.blend');

  for (const f of FONTS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    fontSelect.appendChild(opt);
  }

  const defaultDesign = () => ({
    kind: 'image',
    image: null, dataUrl: null, filename: null,
    text: DEFAULT_TEXT, fontId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE, textColor: '#000000',
    x: 0.5, y: 0.36, scale: 1, rotation: 0,
    colorize: 'original', blendMode: 'source-over', cropMode: 'none',
  });
  let design = defaultDesign();
  let selected = false;
  let lastCustomHex = '#ff3366';

  function currentDesignArea() {
    return getItem().design[viewKey];
  }

  async function redraw() {
    const item = getItem();
    const color = getColor();
    const photoSrc = color[viewKey] || null;
    const tintLayers = !photoSrc && item.tintBase ? item.tintBase[viewKey] : null;
    await renderView(canvas, {
      photoSrc,
      tintLayers,
      tintHex: color.hex,
      design,
      designArea: item.design[viewKey],
      showHandles: !!design.image && selected,
    });
  }

  function applyDesignArea() {
    const area = currentDesignArea();
    design.x = area.x;
    design.y = area.y;
  }

  let syncColorize = () => {};
  let syncBlend = () => {};

  function buildColorize() {
    colorizeEl.innerHTML = '';
    const btns = [];
    for (const m of COLORIZE_MODES) {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.className = 'colorize-btn';
      b.dataset.id = m.id;
      b.addEventListener('click', () => {
        design.colorize = m.id;
        syncColorize();
        schedulePersist();
        redraw();
      });
      colorizeEl.appendChild(b);
      btns.push(b);
    }
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'colorize-picker';
    picker.title = 'custom color';
    picker.value = lastCustomHex;
    picker.addEventListener('input', (e) => {
      lastCustomHex = e.target.value;
      design.colorize = lastCustomHex;
      syncColorize();
      schedulePersist();
      redraw();
    });
    colorizeEl.appendChild(picker);

    syncColorize = () => {
      for (const b of btns) b.classList.toggle('active', design.colorize === b.dataset.id);
      const isHex = /^#[0-9a-f]{6}$/i.test(design.colorize);
      picker.classList.toggle('active', isHex);
      picker.style.background = isHex ? design.colorize : '';
      if (isHex) picker.value = design.colorize;
    };
    syncColorize();
  }

  function buildBlend() {
    blendEl.innerHTML = '';
    const btns = [];
    for (const m of BLEND_MODES) {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.className = 'colorize-btn';
      b.dataset.id = m.id;
      b.addEventListener('click', () => {
        design.blendMode = m.id;
        syncBlend();
        schedulePersist();
        redraw();
      });
      blendEl.appendChild(b);
      btns.push(b);
    }
    syncBlend = () => {
      for (const b of btns) b.classList.toggle('active', design.blendMode === b.dataset.id);
    };
    syncBlend();
  }

  function syncCrop() {
    cropBtn.classList.toggle('active', design.cropMode === 'circle');
  }
  cropBtn.addEventListener('click', () => {
    design.cropMode = design.cropMode === 'circle' ? 'none' : 'circle';
    syncCrop();
    schedulePersist();
    redraw();
  });

  let currentItemId = getItem().id;

  function persist(forItemId = currentItemId) {
    if (!design.image) {
      setLast(viewKey, forItemId, null);
      return;
    }
    const placement = {
      x: design.x, y: design.y,
      scale: design.scale, rotation: design.rotation,
      colorize: design.colorize, blendMode: design.blendMode, cropMode: design.cropMode,
    };
    if (design.kind === 'text') {
      setLast(viewKey, forItemId, {
        kind: 'text',
        text: design.text, fontId: design.fontId, fontSize: design.fontSize, textColor: design.textColor,
        ...placement,
      });
    } else {
      setLast(viewKey, forItemId, {
        kind: 'image',
        dataUrl: design.dataUrl, filename: design.filename,
        ...placement,
      });
    }
  }
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist(), 200);
  }

  function applyPlacement(saved) {
    design.x = saved.x ?? 0.5;
    design.y = saved.y ?? 0.36;
    design.scale = saved.scale ?? 1;
    design.rotation = saved.rotation ?? 0;
    design.colorize = saved.colorize ?? 'original';
    design.blendMode = saved.blendMode ?? 'source-over';
    design.cropMode = saved.cropMode ?? 'none';
  }

  async function loadForCurrentItem() {
    const newItemId = getItem().id;
    if (newItemId === currentItemId) {
      redraw();
      return;
    }
    // Save current placement under the previous item before switching.
    if (design.dataUrl) persist(currentItemId);
    currentItemId = newItemId;

    const saved = getLast(viewKey, newItemId);
    if (saved && (saved.dataUrl || saved.kind === 'text')) {
      if (saved.kind === 'text') {
        await enterTextMode(saved);
      } else if (design.dataUrl === saved.dataUrl && design.image && design.kind === 'image') {
        applyPlacement(saved);
        buildColorize();
        buildBlend();
        syncCrop();
        redraw();
      } else {
        try {
          const img = await loadImageFromDataUrl(saved.dataUrl);
          setDesign(img, saved.dataUrl, saved.filename, saved);
        } catch {
          redraw();
        }
      }
    } else if (design.image) {
      // No saved state for the new item — keep the design but reset placement
      // to defaults relative to the new item's design area.
      applyDesignArea();
      design.scale = 1;
      design.rotation = 0;
      persist();
      redraw();
    } else {
      redraw();
    }
  }

  function showImageControls() {
    typeBtn.classList.remove('active');
    textInput.hidden = true;
    fontSelect.hidden = true;
    sizeSlider.hidden = true;
    textColorInput.hidden = true;
  }
  function showTextControls() {
    typeBtn.classList.add('active');
    textInput.hidden = false;
    fontSelect.hidden = false;
    sizeSlider.hidden = false;
    textColorInput.hidden = false;
  }

  async function renderTextDesign() {
    const fontDef = FONTS.find(f => f.id === design.fontId) || FONTS[0];
    const text = design.text || ' ';
    const fontSize = design.fontSize || DEFAULT_FONT_SIZE;
    const textColor = design.textColor || '#000000';
    const fontSpec = `${fontDef.weight} ${fontSize}px "${fontDef.family}"`;

    if (document.fonts && document.fonts.load) {
      try { await document.fonts.load(fontSpec, text); } catch {}
    }

    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontSpec;
    const m = measure.measureText(text);
    const padX = Math.max(20, fontSize * 0.2);
    const padY = Math.max(10, fontSize * 0.25);
    const w = Math.max(1, Math.ceil(m.width) + padX * 2);
    const h = Math.max(1, Math.ceil(fontSize * 1.4) + padY * 2);

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = fontSpec;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, padX, h / 2);

    const dataUrl = c.toDataURL('image/png');
    const img = await loadImageFromDataUrl(dataUrl);
    design.image = img;
    design.dataUrl = dataUrl;
    design.filename = `text-${slugifyForFilename(text) || 'design'}.png`;
  }

  function slugifyForFilename(s) {
    return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  async function enterTextMode(initial = null) {
    design.kind = 'text';
    design.text = initial?.text ?? (design.text || DEFAULT_TEXT);
    design.fontId = initial?.fontId ?? (design.fontId || DEFAULT_FONT_ID);
    design.fontSize = initial?.fontSize ?? (design.fontSize || DEFAULT_FONT_SIZE);
    design.textColor = initial?.textColor ?? (design.textColor || '#000000');
    if (initial) {
      applyPlacement(initial);
    } else {
      applyDesignArea();
      design.scale = 1;
      design.rotation = 0;
      design.colorize = 'original';
      design.blendMode = 'source-over';
      design.cropMode = 'none';
    }
    textInput.value = design.text;
    fontSelect.value = design.fontId;
    sizeSlider.value = String(design.fontSize);
    textColorInput.value = design.textColor;
    await renderTextDesign();
    selected = true;
    clearBtn.hidden = false;
    resetBtn.hidden = false;
    cropBtn.hidden = false;
    colorizeEl.hidden = false;
    blendEl.hidden = false;
    showTextControls();
    buildColorize();
    buildBlend();
    syncCrop();
    schedulePersist();
    redraw();
  }

  typeBtn.addEventListener('click', () => {
    if (design.kind === 'text') {
      // toggling off ends text mode by clearing the design entirely.
      clearBtn.click();
      return;
    }
    enterTextMode();
  });
  textInput.addEventListener('input', async () => {
    design.text = textInput.value;
    await renderTextDesign();
    schedulePersist();
    redraw();
  });
  fontSelect.addEventListener('change', async () => {
    design.fontId = fontSelect.value;
    await renderTextDesign();
    schedulePersist();
    redraw();
  });
  sizeSlider.addEventListener('input', async () => {
    design.fontSize = parseInt(sizeSlider.value, 10) || DEFAULT_FONT_SIZE;
    await renderTextDesign();
    schedulePersist();
    redraw();
  });
  textColorInput.addEventListener('input', async () => {
    design.textColor = textColorInput.value;
    await renderTextDesign();
    schedulePersist();
    redraw();
  });

  function setDesign(image, dataUrl, filename, placement = null) {
    design.kind = 'image';
    design.image = image;
    design.dataUrl = dataUrl;
    design.filename = filename;
    if (placement) {
      applyPlacement(placement);
    } else {
      applyDesignArea();
      design.scale = 1;
      design.rotation = 0;
      design.colorize = 'original';
      design.blendMode = 'source-over';
      design.cropMode = 'none';
    }
    selected = true;
    clearBtn.hidden = false;
    resetBtn.hidden = false;
    cropBtn.hidden = false;
    colorizeEl.hidden = false;
    blendEl.hidden = false;
    showImageControls();
    buildColorize();
    buildBlend();
    syncCrop();
    pushRecent({ dataUrl, filename, ts: Date.now() });
    persist();
    notifyRecent();
    redraw();
  }

  function renderRecent() {
    recentEl.innerHTML = '';
    const list = readRecent();
    if (list.length === 0) {
      recentEl.hidden = true;
      return;
    }
    recentEl.hidden = false;
    for (const entry of list) {
      const b = document.createElement('button');
      b.className = 'recent-item';
      b.style.backgroundImage = `url("${entry.dataUrl}")`;
      b.title = entry.filename;
      b.classList.toggle('active', design.dataUrl === entry.dataUrl);
      b.addEventListener('click', async () => {
        try {
          const img = await loadImageFromDataUrl(entry.dataUrl);
          setDesign(img, entry.dataUrl, entry.filename);
        } catch (e) {
          console.warn('failed to load recent design:', e);
        }
      });
      recentEl.appendChild(b);
    }
  }
  subscribeRecent(renderRecent);
  renderRecent();

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const { image, dataUrl } = await loadImageFromFile(file);
    setDesign(image, dataUrl, file.name);
  });

  clearBtn.addEventListener('click', () => {
    design = defaultDesign();
    fileInput.value = '';
    clearBtn.hidden = true;
    resetBtn.hidden = true;
    cropBtn.hidden = true;
    colorizeEl.hidden = true;
    blendEl.hidden = true;
    showImageControls();
    selected = false;
    setLast(viewKey, currentItemId, null);
    renderRecent();
    redraw();
  });

  resetBtn.addEventListener('click', () => {
    applyDesignArea();
    design.scale = 1;
    design.rotation = 0;
    selected = true;
    schedulePersist();
    redraw();
  });

  let drag = null;
  function toCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * sx,
      y: (evt.clientY - rect.top) * sy,
    };
  }

  function modeAtPoint(x, y) {
    if (!design.image) return null;
    const h = getDesignHandles(design, currentDesignArea(), CANVAS_W, CANVAS_H);
    const near = (p) => Math.hypot(x - p.x, y - p.y) < HANDLE_HIT;
    if (selected && near(h.rot)) return 'rotate';
    if (selected && near(h.tl)) return 'scale-tl';
    if (selected && near(h.tr)) return 'scale-tr';
    if (selected && near(h.br)) return 'scale-br';
    if (selected && near(h.bl)) return 'scale-bl';
    if (pointInDesign(x, y, design, currentDesignArea(), CANVAS_W, CANVAS_H)) return 'translate';
    return null;
  }

  function cursorForMode(mode, dragging) {
    if (!mode) return '';
    if (mode === 'translate') return dragging ? 'grabbing' : 'move';
    if (mode === 'rotate') return dragging ? 'grabbing' : 'grab';
    if (mode === 'scale-tl' || mode === 'scale-br') return 'nwse-resize';
    if (mode === 'scale-tr' || mode === 'scale-bl') return 'nesw-resize';
    return '';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!design.image) return;
    const { x, y } = toCanvasCoords(e);
    const h = getDesignHandles(design, currentDesignArea(), CANVAS_W, CANVAS_H);
    const mode = modeAtPoint(x, y);

    if (!mode) {
      if (selected) {
        selected = false;
        redraw();
      }
      return;
    }

    if (!selected) {
      selected = true;
      redraw();
    }

    drag = {
      mode,
      centerX: h.center.x, centerY: h.center.y,
      startX: x, startY: y,
      startScale: design.scale,
      startRotation: design.rotation || 0,
      startAngle: Math.atan2(y - h.center.y, x - h.center.x),
      cornerDist: 0,
      cornerDirX: 0,
      cornerDirY: 0,
      clickOffsetX: 0,
      clickOffsetY: 0,
    };
    if (mode.startsWith('scale-')) {
      const c = h[mode.slice('scale-'.length)];
      const dx = c.x - h.center.x;
      const dy = c.y - h.center.y;
      drag.cornerDist = Math.max(1, Math.hypot(dx, dy));
      drag.cornerDirX = dx / drag.cornerDist;
      drag.cornerDirY = dy / drag.cornerDist;
      drag.clickOffsetX = x - c.x;
      drag.clickOffsetY = y - c.y;
    }
    canvas.style.cursor = cursorForMode(mode, true);
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toCanvasCoords(e);
    if (!drag) {
      canvas.style.cursor = cursorForMode(modeAtPoint(x, y), false);
      return;
    }
    if (drag.mode === 'translate') {
      design.x = (drag.centerX + (x - drag.startX)) / CANVAS_W;
      design.y = (drag.centerY + (y - drag.startY)) / CANVAS_H;
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(y - drag.centerY, x - drag.centerX);
      design.rotation = drag.startRotation + (angle - drag.startAngle);
    } else if (drag.mode.startsWith('scale-')) {
      const vx = x - drag.clickOffsetX - drag.centerX;
      const vy = y - drag.clickOffsetY - drag.centerY;
      const proj = vx * drag.cornerDirX + vy * drag.cornerDirY;
      const s = drag.startScale * (proj / drag.cornerDist);
      design.scale = Math.max(0.05, Math.min(5, s));
    }
    redraw();
  });

  canvas.addEventListener('pointerleave', () => {
    if (!drag) canvas.style.cursor = '';
  });

  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    const { x, y } = toCanvasCoords(e);
    canvas.style.cursor = cursorForMode(modeAtPoint(x, y), false);
    schedulePersist();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  redraw();

  // Restore last-used design for this (view, item), if any.
  const last = getLast(viewKey, currentItemId);
  if (last) {
    if (last.kind === 'text') {
      enterTextMode(last).catch(() => setLast(viewKey, currentItemId, null));
    } else if (last.dataUrl) {
      loadImageFromDataUrl(last.dataUrl)
        .then((img) => setDesign(img, last.dataUrl, last.filename, last))
        .catch(() => setLast(viewKey, currentItemId, null));
    }
  }

  async function setGlobalColor(hex) {
    if (!design.image) return;
    design.colorize = hex;
    if (design.kind === 'text') {
      design.textColor = hex;
      textColorInput.value = hex;
      await renderTextDesign();
    }
    if (!colorizeEl.hidden) buildColorize();
    schedulePersist();
    redraw();
  }
  async function clearGlobalColor() {
    if (!design.image) return;
    design.colorize = 'original';
    if (design.kind === 'text') {
      design.textColor = '#000000';
      textColorInput.value = '#000000';
      await renderTextDesign();
    }
    if (!colorizeEl.hidden) buildColorize();
    schedulePersist();
    redraw();
  }

  return {
    el,
    redraw,
    loadForCurrentItem,
    setGlobalColor,
    clearGlobalColor,
    getDesign: () => design,
    getHandlesVisible: () => selected,
    setHandlesVisible: (v) => { selected = !!v; },
  };
}
