import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const caps = JSON.parse(readFileSync('src/data/caps.json', 'utf8'));

function sampleHex(imgPath) {
  const buf = readFileSync(imgPath);
  const { data, width, height } = PNG.sync.read(buf);
  // Sample a 20% box centered horizontally, upper third vertically
  // (cap crown, not brim). Avoids the gray studio background.
  const x0 = Math.floor(width * 0.4);
  const x1 = Math.floor(width * 0.6);
  const y0 = Math.floor(height * 0.3);
  const y1 = Math.floor(height * 0.5);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      // pngjs decodes as RGBA regardless of source; skip fully-transparent pixels
      if (data[i + 3] === 0) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (n === 0) throw new Error('no opaque pixels in sample region');
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

for (const c of caps) {
  try {
    c.hex = sampleHex(c.image);
    console.log(c.id, c.hex);
  } catch (e) {
    console.warn(`skip hex for ${c.id}: ${e.message}`);
  }
}

writeFileSync('src/data/caps.json', JSON.stringify(caps, null, 2));
