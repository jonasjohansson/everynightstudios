import { CANVAS_W, CANVAS_H } from './garments.js';

const imgCache = new Map();
function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

const COLORIZE_FALLBACK = 1024;
function intrinsicSize(img) {
  const w = img.naturalWidth || img.width || COLORIZE_FALLBACK;
  const h = img.naturalHeight || img.height || COLORIZE_FALLBACK;
  return { w, h };
}
function cacheKey(img) {
  // Images expose .src (data URL or path); HTMLCanvasElement does not, so
  // fall back to a unique id stored on the canvas.
  if (img.src) return img.src;
  if (!img.__cacheKey) img.__cacheKey = `canvas-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  return img.__cacheKey;
}

const colorCache = new Map();
function colorizedImage(img, mode) {
  if (!mode || mode === 'original') return img;
  const key = `${cacheKey(img)}:${mode}`;
  if (colorCache.has(key)) return colorCache.get(key);
  // SVGs without width/height attrs can report naturalWidth/Height as 0 or a
  // 300x150 browser default. Use an explicit size and draw with dw/dh so SVG
  // and raster paths both fill the buffer.
  const { w: nw, h: nh } = intrinsicSize(img);
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  const ctx = c.getContext('2d');
  if (mode === 'invert') {
    ctx.filter = 'invert(1)';
    ctx.drawImage(img, 0, 0, nw, nh);
  } else if (mode === 'white' || mode === 'black') {
    ctx.drawImage(img, 0, 0, nw, nh);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = mode === 'white' ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, nw, nh);
  } else if (/^#[0-9a-f]{6}$/i.test(mode)) {
    // Custom hex: paint the design as a solid color, masked by its alpha.
    // (Non-normal blends instead use the post-tint path in drawDesign so the
    // blend keeps the design's luminance and the tint is applied on top.)
    ctx.drawImage(img, 0, 0, nw, nh);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = mode;
    ctx.fillRect(0, 0, nw, nh);
  } else {
    return img;
  }
  colorCache.set(key, c);
  return c;
}

export async function renderView(canvas, { photoSrc, tintLayers, tintHex, designs, design, designArea, activeDesign, showHandles }) {
  // Back-compat: single `design` arg becomes a one-element list.
  if (!designs && design) designs = [design];
  if (!designs) designs = [];
  if (!activeDesign && design && showHandles) activeDesign = design;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  const bg = getCssVar('--bg') || '#fafaf7';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (photoSrc) {
    try {
      await drawFitted(ctx, await loadImage(photoSrc));
    } catch (e) {
      console.warn('garment photo failed:', e);
      drawMissing(ctx);
    }
  } else if (tintLayers && tintLayers.overlay && tintHex) {
    try {
      const rect = fitRect(CANVAS_W, CANVAS_H, await loadImage(tintLayers.overlay));
      if (tintLayers.base) {
        const baseImg = await loadImage(tintLayers.base);
        ctx.drawImage(baseImg, rect.dx, rect.dy, rect.drawW, rect.drawH);
      }
      const tinted = await tintedImage(tintLayers.overlay, tintHex);
      ctx.drawImage(tinted, rect.dx, rect.dy, rect.drawW, rect.drawH);
    } catch (e) {
      console.warn('tint layers failed:', e);
      drawMissing(ctx);
    }
  } else {
    drawMissing(ctx);
  }

  for (const d of designs) {
    if (d && d.image) drawDesign(ctx, d, designArea, canvas.width, canvas.height);
  }
  if (activeDesign && activeDesign.image) {
    drawHandles(ctx, activeDesign, designArea, canvas.width, canvas.height);
  }
}

const tintCache = new Map();
async function tintedImage(src, hex) {
  const key = `${src}:${hex}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  tintCache.set(key, c);
  return c;
}

function fitRect(canvasW, canvasH, img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(canvasW / w, canvasH / h);
  const drawW = w * s;
  const drawH = h * s;
  return { dx: (canvasW - drawW) / 2, dy: (canvasH - drawH) / 2, drawW, drawH };
}

async function drawFitted(ctx, img) {
  const { dx, dy, drawW, drawH } = fitRect(CANVAS_W, CANVAS_H, img);
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawMissing(ctx) {
  const pad = 80;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, CANVAS_W - pad * 2, CANVAS_H - pad * 2);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = '22px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('no photo yet', CANVAS_W / 2, CANVAS_H / 2);
  ctx.restore();
}

function designMetrics(design, area, W, H) {
  const img = design.image;
  const { w: iw, h: ih } = intrinsicSize(img);
  const drawW = area.w * W * design.scale;
  const drawH = drawW * (ih / iw);
  return {
    drawW, drawH,
    cx: design.x * W,
    cy: design.y * H,
    rotation: design.rotation || 0,
  };
}

function drawDesign(ctx, design, area, W, H) {
  const { drawW, drawH, cx, cy, rotation } = designMetrics(design, area, W, H);
  const blend = design.blendMode || 'source-over';
  const isHex = /^#[0-9a-f]{6}$/i.test(design.colorize);

  // Custom hex + non-normal blend: weight alpha by luminance so dark pixels
  // become transparent (the blend then naturally lets the shirt show through),
  // and fill the bright pixels with the tint color.
  const src = (isHex && blend !== 'source-over')
    ? luminanceTint(design.image, design.colorize)
    : colorizedImage(design.image, design.colorize);

  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  if (design.cropMode === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(drawW, drawH) / 2, 0, Math.PI * 2);
    ctx.clip();
  }
  if (blend !== 'source-over') ctx.globalCompositeOperation = blend;
  ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

const lumTintCache = new Map();
function luminanceTint(img, hex) {
  const key = `${cacheKey(img)}:lum:${hex}`;
  if (lumTintCache.has(key)) return lumTintCache.get(key);
  const { w: nw, h: nh } = intrinsicSize(img);
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, nw, nh);
  const data = ctx.getImageData(0, 0, nw, nh);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
    px[i + 3] = (px[i + 3] * lum) / 255;
  }
  ctx.putImageData(data, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, nw, nh);
  lumTintCache.set(key, c);
  return c;
}

const HANDLE_SIZE = 10;
const ROTATION_OFFSET = 42;

function drawHandles(ctx, design, area, W, H) {
  const { drawW, drawH, cx, cy, rotation } = designMetrics(design, area, W, H);
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);

  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-drawW / 2, -drawH / 2, drawW, drawH);
  ctx.setLineDash([]);

  // rotation arm
  ctx.beginPath();
  ctx.moveTo(0, -drawH / 2);
  ctx.lineTo(0, -drawH / 2 - ROTATION_OFFSET);
  ctx.stroke();

  drawSquareHandle(ctx, -drawW / 2, -drawH / 2);
  drawSquareHandle(ctx,  drawW / 2, -drawH / 2);
  drawSquareHandle(ctx,  drawW / 2,  drawH / 2);
  drawSquareHandle(ctx, -drawW / 2,  drawH / 2);
  drawCircleHandle(ctx, 0, -drawH / 2 - ROTATION_OFFSET);

  ctx.restore();
}

function drawSquareHandle(ctx, x, y) {
  const s = HANDLE_SIZE;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x - s / 2, y - s / 2, s, s);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
}

function drawCircleHandle(ctx, x, y) {
  const r = HANDLE_SIZE / 2 + 1;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function getDesignHandles(design, area, W, H) {
  const { drawW, drawH, cx, cy, rotation } = designMetrics(design, area, W, H);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const toWorld = (lx, ly) => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  return {
    center: { x: cx, y: cy },
    halfW: drawW / 2,
    halfH: drawH / 2,
    rotation,
    tl: toWorld(-drawW / 2, -drawH / 2),
    tr: toWorld( drawW / 2, -drawH / 2),
    br: toWorld( drawW / 2,  drawH / 2),
    bl: toWorld(-drawW / 2,  drawH / 2),
    rot: toWorld(0, -drawH / 2 - ROTATION_OFFSET),
  };
}

export function pointInDesign(px, py, design, area, W, H) {
  const h = getDesignHandles(design, area, W, H);
  const cos = Math.cos(-h.rotation);
  const sin = Math.sin(-h.rotation);
  const dx = px - h.center.x;
  const dy = py - h.center.y;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= h.halfW && Math.abs(ly) <= h.halfH;
}

function getCssVar(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ image: img, dataUrl: reader.result });
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
