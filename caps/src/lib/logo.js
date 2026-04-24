// src/lib/logo.js

// Strip all existing fill attributes and inject a root-level fill on <svg>
// so all descendants inherit the new color.
export function recolorSvg(svgText, hex) {
  let s = svgText.replace(/\sfill="[^"]*"/g, '');
  if (/<svg\b[^>]*>/.test(s)) {
    s = s.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs} fill="${hex}">`);
  } else {
    s = s.replace('<svg', `<svg fill="${hex}"`);
  }
  return s;
}

// Browser-only from here down.

// Read a File into either {kind:'svg', text} or {kind:'raster', img}.
export async function readLogoFile(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const text = await file.text();
    return { kind: 'svg', text };
  }
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  return { kind: 'raster', img };
}

// Tint a raster Image by its alpha using an offscreen canvas. Returns a canvas.
export function tintRaster(img, hex) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// Recolor an SVG string and rasterize it to an Image.
export async function svgToImage(svgText, hex) {
  const colored = recolorSvg(svgText, hex);
  const blob = new Blob([colored], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
