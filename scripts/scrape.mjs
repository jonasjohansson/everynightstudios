import { writeFileSync, mkdirSync, existsSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

const BASE = 'https://everynightstudios.com';
const CAPS_DIR = 'public/caps';
const DATA_PATH = 'src/data/caps.json';

mkdirSync(CAPS_DIR, { recursive: true });

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchProducts() {
  const urls = [
    `${BASE}/collections/print-factory/products.json?limit=250`,
    `${BASE}/products.json?limit=250`,
  ];
  for (const u of urls) {
    const res = await fetch(u);
    if (!res.ok) continue;
    const { products } = await res.json();
    if (products?.length) return { products, source: u };
  }
  throw new Error('no products found');
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`img fetch failed: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

function isCapProduct(p) {
  const hay = `${p.product_type} ${p.tags} ${p.title}`.toLowerCase();
  return /(cap|hat|dad hat|baseball)/.test(hay);
}

const { products, source } = await fetchProducts();
console.log(`fetched ${products.length} products from ${source}`);

const caps = [];
for (const p of products) {
  if (!isCapProduct(p)) continue;
  const variants = p.variants || [];
  const images = p.images || [];

  const seen = new Set();
  for (const v of variants) {
    const colorName = v.option1 || p.title;
    const key = slugify(`${p.handle}-${colorName}`);
    if (seen.has(key)) continue;
    seen.add(key);

    const img = images.find(i => i.variant_ids?.includes(v.id)) || images[0];
    if (!img) continue;

    const filename = `${key}.jpg`;
    const destPath = path.join(CAPS_DIR, filename);
    try {
      await downloadImage(img.src, destPath);
    } catch (e) {
      console.warn(`skip ${key}: ${e.message}`);
      continue;
    }

    caps.push({
      id: key,
      name: colorName,
      product: p.title,
      hex: null,
      image: `public/caps/${filename}`,
      anchor: { x: 0.5, y: 0.55, width: 0.35 },
    });
    console.log(`+ ${key}`);
  }
}

writeFileSync(DATA_PATH, JSON.stringify(caps, null, 2));
console.log(`wrote ${caps.length} caps to ${DATA_PATH}`);
