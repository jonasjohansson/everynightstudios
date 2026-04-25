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
const DEFAULT_CM_PER_W = 50;

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}
function writeRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); }
  catch { /* quota — silently skip */ }
}
function pushRecent(entry) {
  const list = readRecent().filter(r => r.dataUrl !== entry.dataUrl);
  list.unshift(entry);
  writeRecent(list);
}
function removeRecent(dataUrl) {
  writeRecent(readRecent().filter(r => r.dataUrl !== dataUrl));
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
    <div class="canvas-wrap"><canvas></canvas></div>
    <div class="size-popover" hidden>
      <input class="width-cm" type="number" step="0.5" min="1" max="120">
      <span>cm</span>
    </div>
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
  const canvasWrap = el.querySelector('.canvas-wrap');
  const popover = el.querySelector('.size-popover');
  const widthCmInput = popover.querySelector('.width-cm');
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
  const newImageLayer = () => ({
    kind: 'image', image: null, dataUrl: null, filename: null, ...defaultPlacement(),
  });
  const newTextLayer = () => ({
    kind: 'text', image: null, dataUrl: null, filename: null,
    text: DEFAULT_TEXT, fontId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE, textColor: '#000000',
    fontFamily: 'OffBit', fontWeight: 400,
    ...defaultPlacement(),
  });

  let layers = [];
  let activeIndex = -1;
  let savedActiveIndex = -1;
  let lastCustomHex = '#ff3366';
  let currentItemId = getItem().id;
  let globalColor = null; // most recently picked design-color, applied to new layers

  const active = () => activeIndex >= 0 ? layers[activeIndex] : null;

  function currentDesignArea() {
    return getItem().design[viewKey];
  }

  function syncCanvasSize() {
    const w = Math.max(1, Math.round(canvasWrap.clientWidth));
    const h = Math.max(1, Math.round(canvasWrap.clientHeight));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  async function redraw() {
    syncCanvasSize();
    const item = getItem();
    const color = getColor();
    const photoSrc = color[viewKey] || null;
    const tintLayers = !photoSrc && item.tintBase ? item.tintBase[viewKey] : null;
    await renderView(canvas, {
      photoSrc,
      tintLayers,
      tintHex: color.hex,
      designs: layers.filter(l => l.image),
      designArea: currentDesignArea(),
      activeDesign: active(),
    });
    updatePopover();
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { redraw(); }).observe(canvasWrap);
  } else {
    window.addEventListener('resize', redraw);
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

  // ---------- size popover (cm width) -----------------------------------------
  function cmPerW() { return getItem().cmPerW || DEFAULT_CM_PER_W; }
  function designWidthCm(slot) {
    return currentDesignArea().w * cmPerW() * slot.scale;
  }
  function updatePopover() {
    const a = active();
    if (!a) { popover.hidden = true; return; }
    const h = getDesignHandles(a, currentDesignArea(), canvas.width, canvas.height, canvas.__garmentRect);
    const cRect = canvas.getBoundingClientRect();
    const vRect = el.getBoundingClientRect();
    const sx = cRect.width / canvas.width;
    const sy = cRect.height / canvas.height;
    let x = (cRect.left - vRect.left) + h.tr.x * sx + 10;
    let y = (cRect.top - vRect.top) + h.tr.y * sy - 12;
    // Clamp into the view bounds so the popover never falls off-screen.
    popover.hidden = false;
    const pw = popover.offsetWidth || 90;
    const ph = popover.offsetHeight || 26;
    x = Math.max(8, Math.min(vRect.width - pw - 8, x));
    y = Math.max(8, Math.min(vRect.height - ph - 8, y));
    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
    if (document.activeElement !== widthCmInput) {
      widthCmInput.value = designWidthCm(a).toFixed(1);
    }
  }
  widthCmInput.addEventListener('input', () => {
    const a = active();
    if (!a) return;
    const v = parseFloat(widthCmInput.value);
    if (!v || !isFinite(v)) return;
    a.scale = v / (currentDesignArea().w * cmPerW());
    schedulePersist();
    redraw();
  });
  popover.addEventListener('pointerdown', (e) => e.stopPropagation());
  popover.addEventListener('wheel', (e) => e.stopPropagation());

  // ---------- per-layer controls (build once, sync per active) ----------------
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
        const a = active();
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
      const a = active();
      if (!a) return;
      lastCustomHex = e.target.value;
      a.colorize = lastCustomHex;
      syncColorize();
      schedulePersist();
      redraw();
    });
    colorizeEl.appendChild(picker);

    syncColorize = () => {
      const a = active();
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
        const a = active();
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
      const a = active();
      if (!a) return;
      for (const b of btns) b.classList.toggle('active', a.blendMode === b.dataset.id);
    };
    syncBlend();
  }

  function syncCrop() {
    const a = active();
    cropBtn.classList.toggle('active', a?.cropMode === 'circle');
  }
  cropBtn.addEventListener('click', () => {
    const a = active();
    if (!a) return;
    a.cropMode = a.cropMode === 'circle' ? 'none' : 'circle';
    syncCrop();
    schedulePersist();
    redraw();
  });

  function updateControls() {
    const a = active();
    const isText = a?.kind === 'text';
    typeBtn.classList.toggle('active', isText);
    textInput.hidden = !isText;
    fontSelect.hidden = !isText;
    sizeSlider.hidden = !isText;
    textColorInput.hidden = !isText;
    clearBtn.hidden = !a;
    resetBtn.hidden = !a;
    cropBtn.hidden = !a;
    colorizeEl.hidden = !a;
    blendEl.hidden = !a;
    if (a) {
      buildColorize();
      buildBlend();
      syncCrop();
      if (isText) {
        textInput.value = a.text;
        fontSelect.value = a.fontId;
        sizeSlider.value = String(a.fontSize);
        textColorInput.value = a.textColor;
      }
    }
  }

  // ---------- persistence -----------------------------------------------------
  function serializeLayer(l) {
    if (l.kind === 'text') {
      return {
        kind: 'text',
        text: l.text, fontId: l.fontId, fontSize: l.fontSize, textColor: l.textColor,
        x: l.x, y: l.y, scale: l.scale, rotation: l.rotation,
        colorize: l.colorize, blendMode: l.blendMode, cropMode: l.cropMode,
      };
    }
    return {
      kind: 'image',
      dataUrl: l.dataUrl, filename: l.filename,
      x: l.x, y: l.y, scale: l.scale, rotation: l.rotation,
      colorize: l.colorize, blendMode: l.blendMode, cropMode: l.cropMode,
    };
  }
  function persist(forItemId = currentItemId) {
    const filled = layers.filter(l => l.image);
    if (filled.length === 0) {
      setLast(viewKey, forItemId, null);
      return;
    }
    setLast(viewKey, forItemId, {
      layers: filled.map(serializeLayer),
      active: activeIndex,
    });
  }
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persist(), 200);
  }

  // ---------- text rendering for a layer (used by export + recent thumbnail) --
  async function renderTextLayer(l) {
    const fontDef = FONTS.find(f => f.id === l.fontId) || FONTS[0];
    const text = l.text || ' ';
    const fontSize = l.fontSize || DEFAULT_FONT_SIZE;
    const textColor = l.textColor || '#000000';
    l.fontFamily = fontDef.family;
    l.fontWeight = fontDef.weight;
    const fontSpec = `${fontDef.weight} ${fontSize}px "${fontDef.family}"`;

    if (document.fonts && document.fonts.load) {
      try { await document.fonts.load(fontSpec, text); } catch {}
    }

    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontSpec;
    const m = measure.measureText(text);
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = m.actualBoundingBoxDescent || fontSize * 0.2;
    const w = Math.max(1, Math.ceil(m.width));
    const h = Math.max(1, Math.ceil(ascent + descent));

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = fontSpec;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, 0, h / 2);

    const dataUrl = c.toDataURL('image/png');
    const img = await loadImageFromDataUrl(dataUrl);
    l.image = img;
    l.dataUrl = dataUrl;
    l.filename = `text-${slugifyForFilename(text) || 'design'}.png`;
  }

  // ---------- adders / mutators ----------------------------------------------
  async function addImageLayer(image, dataUrl, filename, placement = null) {
    const l = newImageLayer();
    l.image = image;
    l.dataUrl = dataUrl;
    l.filename = filename;
    if (placement) applyPlacement(l, placement);
    else applyDesignAreaTo(l);
    if (!placement && globalColor) l.colorize = globalColor;
    layers.push(l);
    activeIndex = layers.length - 1;
    pushRecent({ dataUrl, filename, ts: Date.now() });
    persist();
    notifyRecent();
    updateControls();
    redraw();
  }

  async function addTextLayer(initial = null) {
    const l = newTextLayer();
    if (initial) {
      l.text = initial.text ?? l.text;
      l.fontId = initial.fontId ?? l.fontId;
      l.fontSize = initial.fontSize ?? l.fontSize;
      l.textColor = initial.textColor ?? l.textColor;
      applyPlacement(l, initial);
    } else {
      applyDesignAreaTo(l);
      if (globalColor) {
        l.colorize = globalColor;
        l.textColor = globalColor;
      }
    }
    await renderTextLayer(l);
    layers.push(l);
    activeIndex = layers.length - 1;
    persist();
    updateControls();
    redraw();
  }

  function clearActiveLayer() {
    if (activeIndex < 0) return;
    layers.splice(activeIndex, 1);
    activeIndex = layers.length > 0 ? Math.min(activeIndex, layers.length - 1) : -1;
    persist();
    updateControls();
    renderRecent();
    redraw();
  }

  function clearAllLayers() {
    layers = [];
    activeIndex = -1;
    fileInput.value = '';
    persist();
    updateControls();
    renderRecent();
    redraw();
  }

  // ---------- event wiring ----------------------------------------------------
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const { image, dataUrl } = await loadImageFromFile(file);
    await addImageLayer(image, dataUrl, file.name);
    fileInput.value = '';
  });

  typeBtn.addEventListener('click', async () => {
    await addTextLayer();
  });

  textInput.addEventListener('input', async () => {
    const a = active();
    if (!a || a.kind !== 'text') return;
    a.text = textInput.value;
    await renderTextLayer(a);
    schedulePersist();
    redraw();
  });
  fontSelect.addEventListener('change', async () => {
    const a = active();
    if (!a || a.kind !== 'text') return;
    a.fontId = fontSelect.value;
    await renderTextLayer(a);
    schedulePersist();
    redraw();
  });
  sizeSlider.addEventListener('input', async () => {
    const a = active();
    if (!a || a.kind !== 'text') return;
    a.fontSize = parseInt(sizeSlider.value, 10) || DEFAULT_FONT_SIZE;
    await renderTextLayer(a);
    schedulePersist();
    redraw();
  });
  textColorInput.addEventListener('input', async () => {
    const a = active();
    if (!a || a.kind !== 'text') return;
    a.textColor = textColorInput.value;
    await renderTextLayer(a);
    schedulePersist();
    redraw();
  });

  clearBtn.addEventListener('click', () => clearActiveLayer());

  resetBtn.addEventListener('click', () => {
    const a = active();
    if (!a) return;
    applyDesignAreaTo(a);
    a.scale = 1;
    a.rotation = 0;
    schedulePersist();
    redraw();
  });

  // ---------- recent strip ----------------------------------------------------
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
      const a = active();
      b.classList.toggle('active', a?.kind === 'image' && a.dataUrl === entry.dataUrl);
      b.addEventListener('click', async () => {
        try {
          const img = await loadImageFromDataUrl(entry.dataUrl);
          await addImageLayer(img, entry.dataUrl, entry.filename);
        } catch (e) {
          console.warn('failed to load recent design:', e);
        }
      });
      const rm = document.createElement('span');
      rm.className = 'recent-remove';
      rm.textContent = '×';
      rm.title = 'remove from history';
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeRecent(entry.dataUrl);
        notifyRecent();
      });
      b.appendChild(rm);
      recentEl.appendChild(b);
    }
  }
  subscribeRecent(renderRecent);
  renderRecent();

  // Drag-and-drop file upload onto the canvas → adds an image layer.
  canvasWrap.addEventListener('dragover', (e) => { e.preventDefault(); });
  canvasWrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      await addImageLayer(image, dataUrl, file.name);
    } catch (err) {
      console.warn('drop upload failed:', err);
    }
  });

  // ---------- zoom + pan ------------------------------------------------------
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 8;
  let zoom = 1;
  let panX = 0, panY = 0;
  function applyTransform() {
    if (zoom === 1 && panX === 0 && panY === 0) {
      canvas.style.transform = '';
      el.classList.remove('zoomed');
    } else {
      canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
      el.classList.toggle('zoomed', zoom > 1);
    }
  }
  function resetZoom() { zoom = 1; panX = 0; panY = 0; applyTransform(); }
  canvasWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const oldZoom = zoom;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
    if (next === oldZoom) return;
    panX = cx - (cx - panX) * (next / oldZoom);
    panY = cy - (cy - panY) * (next / oldZoom);
    zoom = next;
    if (zoom <= 1.001) { zoom = 1; panX = 0; panY = 0; }
    applyTransform();
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    if (zoom !== 1 || panX !== 0 || panY !== 0) {
      e.preventDefault();
      resetZoom();
    }
  });

  // ---------- pointer / drag --------------------------------------------------
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
    const a = active();
    const g = canvas.__garmentRect;
    if (a) {
      const h = getDesignHandles(a, currentDesignArea(), canvas.width, canvas.height, g);
      const near = (p) => Math.hypot(x - p.x, y - p.y) < HANDLE_HIT;
      if (near(h.rot)) return { index: activeIndex, mode: 'rotate' };
      if (near(h.tl)) return { index: activeIndex, mode: 'scale-tl' };
      if (near(h.tr)) return { index: activeIndex, mode: 'scale-tr' };
      if (near(h.br)) return { index: activeIndex, mode: 'scale-br' };
      if (near(h.bl)) return { index: activeIndex, mode: 'scale-bl' };
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      if (!layers[i].image) continue;
      if (pointInDesign(x, y, layers[i], currentDesignArea(), canvas.width, canvas.height, g)) {
        return { index: i, mode: 'translate' };
      }
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

  function startPan(e) {
    drag = {
      index: -1, mode: 'pan',
      startClientX: e.clientX, startClientY: e.clientY,
      startPanX: panX, startPanY: panY,
    };
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1) { startPan(e); return; }
    const { x, y } = toCanvasCoords(e);
    const result = modeAtPoint(x, y);

    if (!result) {
      if (zoom > 1 && e.button === 0) { startPan(e); return; }
      if (activeIndex >= 0) {
        activeIndex = -1;
        updateControls();
        redraw();
      }
      return;
    }

    if (activeIndex !== result.index) {
      activeIndex = result.index;
      updateControls();
      redraw();
    }

    const slot = layers[result.index];
    const h = getDesignHandles(slot, currentDesignArea(), canvas.width, canvas.height, canvas.__garmentRect);
    drag = {
      index: result.index,
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
    if (drag?.mode === 'pan') {
      panX = drag.startPanX + (e.clientX - drag.startClientX);
      panY = drag.startPanY + (e.clientY - drag.startClientY);
      applyTransform();
      return;
    }
    const { x, y } = toCanvasCoords(e);
    if (!drag) {
      const hover = modeAtPoint(x, y);
      const fallback = (zoom > 1 && !hover) ? 'grab' : '';
      canvas.style.cursor = cursorForMode(hover, false) || fallback;
      return;
    }
    const slot = layers[drag.index];
    if (!slot) return;
    if (drag.mode === 'translate') {
      const g = canvas.__garmentRect;
      const baseX = g?.dx ?? 0;
      const baseY = g?.dy ?? 0;
      const baseW = g?.drawW ?? canvas.width;
      const baseH = g?.drawH ?? canvas.height;
      slot.x = (drag.centerX + (x - drag.startX) - baseX) / baseW;
      slot.y = (drag.centerY + (y - drag.startY) - baseY) / baseH;
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
    const wasPan = drag.mode === 'pan';
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    const { x, y } = toCanvasCoords(e);
    const hover = modeAtPoint(x, y);
    const fallback = (zoom > 1 && !hover) ? 'grab' : '';
    canvas.style.cursor = cursorForMode(hover, false) || fallback;
    if (!wasPan) schedulePersist();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- restore ---------------------------------------------------------
  async function restoreFromSaved(saved) {
    if (!saved) return;
    layers = [];
    activeIndex = -1;
    let serial = [];
    if (Array.isArray(saved.layers)) serial = saved.layers;
    else if (saved.image || saved.text) {
      // legacy: single { image, text, active }
      if (saved.image) serial.push({ kind: 'image', ...saved.image });
      if (saved.text) serial.push({ kind: 'text', ...saved.text });
    } else if (saved.kind && (saved.dataUrl || saved.text)) {
      // very legacy: single slot
      serial.push(saved);
    }
    for (const s of serial) {
      if (s.kind === 'text') {
        const l = newTextLayer();
        l.text = s.text ?? l.text;
        l.fontId = s.fontId ?? l.fontId;
        l.fontSize = s.fontSize ?? l.fontSize;
        l.textColor = s.textColor ?? l.textColor;
        applyPlacement(l, s);
        await renderTextLayer(l);
        layers.push(l);
      } else {
        if (!s.dataUrl) continue;
        try {
          const img = await loadImageFromDataUrl(s.dataUrl);
          const l = newImageLayer();
          l.image = img;
          l.dataUrl = s.dataUrl;
          l.filename = s.filename;
          applyPlacement(l, s);
          layers.push(l);
        } catch (e) {
          console.warn('image restore failed:', e);
        }
      }
    }
    if (typeof saved.active === 'number' && saved.active >= 0 && saved.active < layers.length) {
      activeIndex = saved.active;
    } else if (layers.length > 0) {
      activeIndex = layers.length - 1;
    }
    updateControls();
    redraw();
  }

  redraw();
  const last = getLast(viewKey, currentItemId);
  if (last) restoreFromSaved(last).catch(() => setLast(viewKey, currentItemId, null));

  async function loadForCurrentItem() {
    const newItemId = getItem().id;
    if (newItemId === currentItemId) {
      redraw();
      return;
    }
    if (layers.some(l => l.image)) persist(currentItemId);

    const carryLayers = layers;
    const carryActive = activeIndex;

    currentItemId = newItemId;
    layers = [];
    activeIndex = -1;

    const saved = getLast(viewKey, newItemId);
    if (saved) {
      await restoreFromSaved(saved);
    } else if (carryLayers.length > 0) {
      // No saved state for the new item — carry the current layers over.
      // Their x/y are garment-relative so they stay in roughly the same place
      // on the new shirt. Persist under the new item id.
      layers = carryLayers;
      activeIndex = carryActive;
      persist();
      updateControls();
      redraw();
    } else {
      updateControls();
      redraw();
    }
  }

  async function setGlobalColor(hex) {
    globalColor = hex;
    for (const l of layers) {
      if (!l.image) continue;
      l.colorize = hex;
      if (l.kind === 'text') {
        l.textColor = hex;
        await renderTextLayer(l);
      }
    }
    if (active()?.kind === 'text') textColorInput.value = hex;
    if (active()) buildColorize();
    schedulePersist();
    redraw();
  }
  async function clearGlobalColor() {
    globalColor = null;
    for (const l of layers) {
      if (!l.image) continue;
      l.colorize = 'original';
      if (l.kind === 'text') {
        l.textColor = '#000000';
        await renderTextLayer(l);
      }
    }
    if (active()?.kind === 'text') textColorInput.value = '#000000';
    if (active()) buildColorize();
    schedulePersist();
    redraw();
  }

  return {
    el,
    redraw,
    loadForCurrentItem,
    setGlobalColor,
    clearGlobalColor,
    getDesigns: () => layers.filter(l => l.image),
    getHandlesVisible: () => activeIndex >= 0,
    setHandlesVisible: (v) => {
      if (!v) { savedActiveIndex = activeIndex; activeIndex = -1; }
      else if (savedActiveIndex >= 0) { activeIndex = savedActiveIndex; savedActiveIndex = -1; }
    },
  };
}
