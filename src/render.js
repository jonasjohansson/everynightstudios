// src/render.js — draws a cap image plus text (or later, a logo) onto a canvas.
import { resolveAnchor } from './lib/anchor.js';
import { fitFontSize } from './lib/fontfit.js';
import { tintRaster, svgToImage } from './lib/logo.js';

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

function getBgRgb() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const m = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  } catch {}
  return [199, 199, 199];
}

// Replace near-white pixels (the cap photo's outer margin) with the page
// bg color so exported PNGs blend with the page and tile seamlessly.
function flattenWhite(ctx, w, h, [r, g, b]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function renderCard(canvas, { cap, threadHex, text, logoImage, fontScale = 1, yOffset = 0 }) {
  const capImg = await loadImage(cap.image);
  canvas.width = capImg.naturalWidth;
  canvas.height = capImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(capImg, 0, 0);
  flattenWhite(ctx, canvas.width, canvas.height, getBgRgb());

  const { cx, cy, boxW } = resolveAnchor(cap.anchor, canvas.width, canvas.height);
  const y = cy + Math.round(yOffset * canvas.height);

  if (logoImage) {
    await drawLogo(ctx, logoImage, cx, y, boxW * fontScale, threadHex);
  } else if (text) {
    drawText(ctx, text, cx, y, boxW, threadHex, fontScale);
  }
}

function drawText(ctx, text, cx, cy, boxW, color, scale) {
  const family = '"Georgia", serif';
  const fit = fitFontSize(ctx, text, family, 200, boxW, { max: 220 });
  const size = Math.max(6, Math.round(fit * scale));
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

async function drawLogo(ctx, logo, cx, cy, boxW, color) {
  let srcCanvas;
  if (logo.kind === 'svg') {
    srcCanvas = await svgToImage(logo.text, color);
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
