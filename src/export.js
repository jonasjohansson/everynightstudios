// src/export.js — zip + PNG export.
import { buildSpecs } from './lib/specs.js';
import { cards } from './cards.js';

export async function exportZip(threads, master) {
  const zip = new JSZip();
  const threadLookup = Object.fromEntries(threads.map(t => [t.hex, t.name]));
  const cardList = Array.from(cards.values());

  const specs = buildSpecs(cardList, master, threadLookup);

  for (let i = 0; i < cardList.length; i++) {
    const canvas = cardList[i].el.querySelector('canvas');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const name = `card-${String(i + 1).padStart(2, '0')}-${cardList[i].state.cap.id}.png`;
    zip.file(name, blob);
  }

  zip.file('specs.json', JSON.stringify(specs, null, 2));

  if (master.logoFile) {
    zip.file(`logo-${master.logoFilename}`, master.logoFile);
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out);
  a.download = `everynight-prototype-${ts}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
