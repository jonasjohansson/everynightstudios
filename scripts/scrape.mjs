// Build src/data/caps.json from the images already in public/caps/.
// The cap images come from Every Night Studios' Zakeke customizer and
// can't be pulled via Shopify's public API — drop PNGs into public/caps/
// by hand, then run this to regenerate the catalog.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';

const CAPS_DIR = 'public/caps';
const DATA_PATH = 'src/data/caps.json';

if (!existsSync(CAPS_DIR)) {
  console.error(`missing ${CAPS_DIR} — drop cap PNG/JPGs there first`);
  process.exit(1);
}

const files = readdirSync(CAPS_DIR)
  .filter(f => /\.(png|jpe?g)$/i.test(f))
  .sort();

if (files.length === 0) {
  console.error(`no images in ${CAPS_DIR}`);
  process.exit(1);
}

function titleCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const caps = files.map(f => {
  const id = f.replace(/\.[^.]+$/, '');
  return {
    id,
    name: titleCase(id),
    hex: null,
    image: `${CAPS_DIR}/${f}`,
    anchor: { x: 0.5, y: 0.55, width: 0.35 },
  };
});

writeFileSync(DATA_PATH, JSON.stringify(caps, null, 2));
console.log(`wrote ${caps.length} caps to ${DATA_PATH}`);
for (const c of caps) console.log(`  ${c.id} → ${c.name}`);
