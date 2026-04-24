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
function slugifyForFilename(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
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

  const defaultPlacement = () => ({
    x: 0.5, y: 0.36, scale: 1, rotation: 0,
    colorize: 'original', blendMode: 'source-over', cropMode: 'none',
  });
  const defaultImageSlot = () => ({
    kind: 'image',
    image: null, dataUrl: null, filename: null,
    ...defaultPlacement(),
  });
  const defaultTextSlot = () => ({
    kind: 'text',
    image: null, dataUrl: null, filename: null,
    text: DEFAULT_TEXT, fontId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE, textColor: '#000000',
    ...defaultPlacement(),
  });

  let slots = { image: defaultImageSlot(), text: defaultTextSlot() };
  let activeKind = null; // 'image' | 'text' | null
  let savedActiveKind = null;
  let lastCustomHex = '#ff3366';
  let currentItemId = getItem().id;

  const has = (s) => !!s && !!s.image;
  const activeSlot = () => activeKind ? slots[activeKind] : null;
  const anyContent = () => has(slots.image) || has(slots.text);

  function currentDesignArea() {
    return getItem().design[viewKey];
  }

  async function redraw() {
    const item = getItem();
    const color = getColor();
    const photoSrc = color[viewKey] || null;
    const tintLayers = !photoSrc && item.tintBase ? item.tintBase[viewKey] : null;
    const designs = [];
    if (has(slots.image)) designs.push(slots.image);
    if (has(slots.text)) designs.push(slots.text);
    await renderView(canvas, {
      photoSrc,
      tintLayers,
      tintHex: color.hex,
      designs,
      designArea: currentDesignArea(),
      activeDesign: activeSlot(),
    });
  }

  function applyDesignAreaTo(slot) {
    const area = currentDesignArea();
    slot.x = area.x;
    slot.y = area.y;
  }
  function applyPlacement(slot, saved) {
    slot.x = saved.x ?? slot.x;
    slot.y = saved.y ?? slot.y;
    slot.scale = saved.scale ?? 1;
    slot.rotation = saved.rotation ?? 0;
    slot.colorize = saved.colorize ?? 'original';
    slot.blendMode = saved.blendMode ?? 'source-over';
    slot.cropMode = saved.cropMode ?? 'none';
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
        const a = activeSlot();
        if (!a) return;
        a.colorize = m.id;
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
      const a = activeSlot();
      if (!a) return;
      lastCustomHex = e.target.value;
      a.colorize = lastCustomHex;
      syncColorize();
      schedulePersist();
      redraw();
    });
    colorizeEl.appendChild(picker);

    syncColorize = () => {
      const a = activeSlot();
      if (!a) return;
      for (const b of btns) b.classList.toggle('active', a.colorize === b.dataset.id);
      const isHex = /^#[0-9a-f]{6}$/i.test(a.colorize);
      picker.classList.toggle('active', isHex);
      picker.style.background = isHex ? a.colorize : '';
      if (isHex) picker.value = a.colorize;
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
        const a = activeSlot();
        if (!a) return;
        a.blendMode = m.id;
        syncBlend();
        schedulePersist();
        redraw();
      });
      blendEl.appendChild(b);
      btns.push(b);
    }
    syncBlend = () => {
      const a = activeSlot();
      if (!a) return;
      for (const b of btns) b.classList.toggle('active', a.blendMode === b.dataset.id);
    };
    syncBlend();
  }

  function syncCrop() {
    const a = activeSlot();
    cropBtn.classList.toggle('active', a?.cropMode === 'circle');
  }
  cropBtn.addEventListener('click', () => {
    const a = activeSlot();
    if (!a) return;
    a.cropMode = a.cropMode === 'circle' ? 'none' : 'circle';
    syncCrop();
    schedulePersist();
    redraw();
  });

  function updateControls() {
    const text = has(slots.text);
    const a = activeSlot();
    typeBtn.classList.toggle('active', text);
    textInput.hidden = !text;
    fontSelect.hidden = !text;
    sizeSlider.hidden = !text;
    textColorInput.hidden = !text;
    clearBtn.hidden = !anyContent();
    resetBtn.hidden = !a;
    cropBtn.hidden = !a;
    colorizeEl.hidden = !a;
    blendEl.hidden = !a;
    if (a) {
      buildColorize();
      buildBlend();
      syncCrop();
    }
  }

  function persist(forItemId = currentItemId) {
    if (!anyContent()) {
      setLast(viewKey, forItemId, null);
      return;
    }
    setLast(viewKey, forItemId, {
      image: has(slots.image) ? serializeImage(slots.image) : null,
      text:  has(slots.text)  ? serializeText(slots.text)   : null,
      active: activeKind,
    });
  }
  function serializeImage(s) {
    return {
      dataUrl: s.dataUrl, filename: s.filename,
      x: s.x, y: s.y, scale: s.scale, rotation: s.rotation,
      colorize: s.colorize, blendMode: s.blendMode, cropMode: s.cropMode,
    };
  }
  function serializeText(s) {
    return {
      text: s.text, fontId: s.fontId, fontSize: s.fontSize, textColor: s.textColor,
      x: s.x, y: s.y, scale: s.scale, rotation: s.rotation,
      colorize: s.colorize, blendMode: s.blendMode, cropMode: s.cropMode,
    };
  }
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist(), 200);
  }

  async function loadImageSlot(image, dataUrl, filename, placement = null) {
    const s = slots.image;
    s.image = image;
    s.dataUrl = dataUrl;
    s.filename = filename;
    if (placement) {
      applyPlacement(s, placement);
    } else {
      applyDesignAreaTo(s);
      s.scale = 1;
      s.rotation = 0;
      s.colorize = 'original';
      s.blendMode = 'source-over';
      s.cropMode = 'none';
    }
    activeKind = 'image';
    pushRecent({ dataUrl, filename, ts: Date.now() });
    persist();
    notifyRecent();
    updateControls();
    redraw();
  }

  function clearImageSlot() {
    slots.image = defaultImageSlot();
    fileInput.value = '';
    if (activeKind === 'image') activeKind = has(slots.text) ? 'text' : null;
    persist();
    updateControls();
    renderRecent();
    redraw();
  }

  async function renderTextSlot(slot) {
    const fontDef = FONTS.find(f => f.id === slot.fontId) || FONTS[0];
    const text = slot.text || ' ';
    const fontSize = slot.fontSize || DEFAULT_FONT_SIZE;
    const textColor = slot.textColor || '#000000';
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
    slot.image = img;
    slot.dataUrl = dataUrl;
    slot.filename = `text-${slugifyForFilename(text) || 'design'}.png`;
  }

  async function enterTextMode(initial = null) {
    const slot = slots.text;
    slot.text = initial?.text ?? slot.text ?? DEFAULT_TEXT;
    slot.fontId = initial?.fontId ?? slot.fontId ?? DEFAULT_FONT_ID;
    slot.fontSize = initial?.fontSize ?? slot.fontSize ?? DEFAULT_FONT_SIZE;
    slot.textColor = initial?.textColor ?? slot.textColor ?? '#000000';
    if (initial) {
      applyPlacement(slot, initial);
    } else {
      applyDesignAreaTo(slot);
      slot.scale = 1;
      slot.rotation = 0;
      slot.colorize = 'original';
      slot.blendMode = 'source-over';
      slot.cropMode = 'none';
    }
    textInput.value = slot.text;
    fontSelect.value = slot.fontId;
    sizeSlider.value = String(slot.fontSize);
    textColorInput.value = slot.textColor;
    await renderTextSlot(slot);
    activeKind = 'text';
    persist();
    updateControls();
    redraw();
  }

  function clearTextSlot() {
    slots.text = defaultTextSlot();
    if (activeKind === 'text') activeKind = has(slots.image) ? 'image' : null;
    persist();
    updateControls();
    redraw();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const { image, dataUrl } = await loadImageFromFile(file);
    loadImageSlot(image, dataUrl, file.name);
  });

  typeBtn.addEventListener('click', () => {
    if (has(slots.text)) {
      if (activeKind === 'text') clearTextSlot();
      else { activeKind = 'text'; updateControls(); redraw(); }
      return;
    }
    enterTextMode();
  });
  textInput.addEventListener('input', async () => {
    const slot = slots.text;
    slot.text = textInput.value;
    await renderTextSlot(slot);
    schedulePersist();
    redraw();
  });
  fontSelect.addEventListener('change', async () => {
    const slot = slots.text;
    slot.fontId = fontSelect.value;
    await renderTextSlot(slot);
    schedulePersist();
    redraw();
  });
  sizeSlider.addEventListener('input', async () => {
    const slot = slots.text;
    slot.fontSize = parseInt(sizeSlider.value, 10) || DEFAULT_FONT_SIZE;
    await renderTextSlot(slot);
    schedulePersist();
    redraw();
  });
  textColorInput.addEventListener('input', async () => {
    const slot = slots.text;
    slot.textColor = textColorInput.value;
    await renderTextSlot(slot);
    schedulePersist();
    redraw();
  });

  clearBtn.addEventListener('click', () => {
    if (activeKind === 'text') clearTextSlot();
    else if (activeKind === 'image') clearImageSlot();
    else {
      slots = { image: defaultImageSlot(), text: defaultTextSlot() };
      activeKind = null;
      fileInput.value = '';
      persist();
      updateControls();
      renderRecent();
      redraw();
    }
  });

  resetBtn.addEventListener('click', () => {
    const a = activeSlot();
    if (!a) return;
    applyDesignAreaTo(a);
    a.scale = 1;
    a.rotation = 0;
    schedulePersist();
    redraw();
  });

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
      b.classList.toggle('active', slots.image.dataUrl === entry.dataUrl);
      b.addEventListener('click', async () => {
        try {
          const img = await loadImageFromDataUrl(entry.dataUrl);
          await loadImageSlot(img, entry.dataUrl, entry.filename);
        } catch (e) {
          console.warn('failed to load recent design:', e);
        }
      });
      recentEl.appendChild(b);
    }
  }
  subscribeRecent(renderRecent);
  renderRecent();

  // Hit testing — checks active slot's handles, then both slots' bodies (text on top).
  function modeAtPoint(x, y) {
    const a = activeSlot();
    if (a) {
      const h = getDesignHandles(a, currentDesignArea(), CANVAS_W, CANVAS_H);
      const near = (p) => Math.hypot(x - p.x, y - p.y) < HANDLE_HIT;
      if (near(h.rot)) return { kind: activeKind, mode: 'rotate' };
      if (near(h.tl)) return { kind: activeKind, mode: 'scale-tl' };
      if (near(h.tr)) return { kind: activeKind, mode: 'scale-tr' };
      if (near(h.br)) return { kind: activeKind, mode: 'scale-br' };
      if (near(h.bl)) return { kind: activeKind, mode: 'scale-bl' };
    }
    if (has(slots.text) && pointInDesign(x, y, slots.text, currentDesignArea(), CANVAS_W, CANVAS_H)) {
      return { kind: 'text', mode: 'translate' };
    }
    if (has(slots.image) && pointInDesign(x, y, slots.image, currentDesignArea(), CANVAS_W, CANVAS_H)) {
      return { kind: 'image', mode: 'translate' };
    }
    return null;
  }

  function cursorForMode(result, dragging) {
    if (!result) return '';
    const mode = result.mode;
    if (mode === 'translate') return dragging ? 'grabbing' : 'move';
    if (mode === 'rotate') return dragging ? 'grabbing' : 'grab';
    if (mode === 'scale-tl' || mode === 'scale-br') return 'nwse-resize';
    if (mode === 'scale-tr' || mode === 'scale-bl') return 'nesw-resize';
    return '';
  }

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

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = toCanvasCoords(e);
    const result = modeAtPoint(x, y);

    if (!result) {
      if (activeKind) {
        activeKind = null;
        updateControls();
        redraw();
      }
      return;
    }

    if (activeKind !== result.kind) {
      activeKind = result.kind;
      updateControls();
      redraw();
    }

    const slot = slots[result.kind];
    const h = getDesignHandles(slot, currentDesignArea(), CANVAS_W, CANVAS_H);
    drag = {
      kind: result.kind,
      mode: result.mode,
      centerX: h.center.x, centerY: h.center.y,
      startX: x, startY: y,
      startScale: slot.scale,
      startRotation: slot.rotation || 0,
      startAngle: Math.atan2(y - h.center.y, x - h.center.x),
      cornerDist: 0, cornerDirX: 0, cornerDirY: 0,
      clickOffsetX: 0, clickOffsetY: 0,
    };
    if (result.mode.startsWith('scale-')) {
      const c = h[result.mode.slice('scale-'.length)];
      const dx = c.x - h.center.x;
      const dy = c.y - h.center.y;
      drag.cornerDist = Math.max(1, Math.hypot(dx, dy));
      drag.cornerDirX = dx / drag.cornerDist;
      drag.cornerDirY = dy / drag.cornerDist;
      drag.clickOffsetX = x - c.x;
      drag.clickOffsetY = y - c.y;
    }
    canvas.style.cursor = cursorForMode(result, true);
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = toCanvasCoords(e);
    if (!drag) {
      canvas.style.cursor = cursorForMode(modeAtPoint(x, y), false);
      return;
    }
    const slot = slots[drag.kind];
    if (drag.mode === 'translate') {
      slot.x = (drag.centerX + (x - drag.startX)) / CANVAS_W;
      slot.y = (drag.centerY + (y - drag.startY)) / CANVAS_H;
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(y - drag.centerY, x - drag.centerX);
      slot.rotation = drag.startRotation + (angle - drag.startAngle);
    } else if (drag.mode.startsWith('scale-')) {
      const vx = x - drag.clickOffsetX - drag.centerX;
      const vy = y - drag.clickOffsetY - drag.centerY;
      const proj = vx * drag.cornerDirX + vy * drag.cornerDirY;
      const s = drag.startScale * (proj / drag.cornerDist);
      slot.scale = Math.max(0.05, Math.min(5, s));
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

  // Restore from persisted state. Handles legacy single-slot format too.
  async function restoreFromSaved(saved) {
    if (!saved) return;
    const isLegacy = saved.kind === 'image' || saved.kind === 'text' || (saved.dataUrl && !saved.image && !saved.text);
    if (isLegacy) {
      if (saved.kind === 'text') return enterTextMode(saved);
      try {
        const img = await loadImageFromDataUrl(saved.dataUrl);
        await loadImageSlot(img, saved.dataUrl, saved.filename, saved);
      } catch {}
      return;
    }
    if (saved.image && saved.image.dataUrl) {
      try {
        const img = await loadImageFromDataUrl(saved.image.dataUrl);
        const s = slots.image;
        s.image = img;
        s.dataUrl = saved.image.dataUrl;
        s.filename = saved.image.filename;
        applyPlacement(s, saved.image);
      } catch (e) {
        console.warn('image restore failed:', e);
      }
    }
    if (saved.text) {
      const t = slots.text;
      t.text = saved.text.text ?? DEFAULT_TEXT;
      t.fontId = saved.text.fontId ?? DEFAULT_FONT_ID;
      t.fontSize = saved.text.fontSize ?? DEFAULT_FONT_SIZE;
      t.textColor = saved.text.textColor ?? '#000000';
      applyPlacement(t, saved.text);
      textInput.value = t.text;
      fontSelect.value = t.fontId;
      sizeSlider.value = String(t.fontSize);
      textColorInput.value = t.textColor;
      await renderTextSlot(t);
    }
    if (saved.active && has(slots[saved.active])) activeKind = saved.active;
    else if (has(slots.image)) activeKind = 'image';
    else if (has(slots.text)) activeKind = 'text';
    updateControls();
    redraw();
  }

  redraw();

  const last = getLast(viewKey, currentItemId);
  if (last) {
    restoreFromSaved(last).catch(() => setLast(viewKey, currentItemId, null));
  }

  async function loadForCurrentItem() {
    const newItemId = getItem().id;
    if (newItemId === currentItemId) {
      redraw();
      return;
    }
    if (anyContent()) persist(currentItemId);
    currentItemId = newItemId;

    slots = { image: defaultImageSlot(), text: defaultTextSlot() };
    activeKind = null;
    const saved = getLast(viewKey, newItemId);
    if (saved) {
      await restoreFromSaved(saved);
    } else {
      updateControls();
      redraw();
    }
  }

  async function setGlobalColor(hex) {
    let touched = false;
    for (const k of ['image', 'text']) {
      const s = slots[k];
      if (!s.image) continue;
      s.colorize = hex;
      if (s.kind === 'text') {
        s.textColor = hex;
        if (k === 'text') textColorInput.value = hex;
        await renderTextSlot(s);
      }
      touched = true;
    }
    if (!touched) return;
    if (activeSlot()) buildColorize();
    schedulePersist();
    redraw();
  }
  async function clearGlobalColor() {
    let touched = false;
    for (const k of ['image', 'text']) {
      const s = slots[k];
      if (!s.image) continue;
      s.colorize = 'original';
      if (s.kind === 'text') {
        s.textColor = '#000000';
        if (k === 'text') textColorInput.value = '#000000';
        await renderTextSlot(s);
      }
      touched = true;
    }
    if (!touched) return;
    if (activeSlot()) buildColorize();
    schedulePersist();
    redraw();
  }

  return {
    el,
    redraw,
    loadForCurrentItem,
    setGlobalColor,
    clearGlobalColor,
    getDesigns: () => ({
      image: has(slots.image) ? slots.image : null,
      text:  has(slots.text)  ? slots.text  : null,
    }),
    getHandlesVisible: () => activeKind != null,
    setHandlesVisible: (v) => {
      if (!v) { savedActiveKind = activeKind; activeKind = null; }
      else if (savedActiveKind) { activeKind = savedActiveKind; savedActiveKind = null; }
    },
  };
}
