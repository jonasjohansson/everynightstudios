// src/render.js — draws a cap image plus text (or later, a logo) onto a canvas.
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

// Stub — implemented in Task 8.
async function drawLogo(ctx, logoImage, cx, cy, boxW, color) {
  // no-op for now
}
