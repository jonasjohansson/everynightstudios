// src/export.js — zip + PNG export.
import { buildSpecs, CAP_FRONT_CM } from './lib/specs.js';
import { cards } from './cards.js';

const PREFIX = 'everynightstudios';

function slugify(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function splitFilename(filename) {
  const idx = (filename || '').lastIndexOf('.');
  if (idx > 0) {
    return { name: filename.slice(0, idx), ext: filename.slice(idx + 1).toLowerCase() };
  }
  return { name: filename || 'logo', ext: 'png' };
}

export function buildFilename(index, cap, threadName, text, widthCm) {
  const parts = [
    PREFIX,
    'caps',
    String(index).padStart(2, '0'),
    cap.id,
    threadName ? `thread-${slugify(threadName)}` : '',
    text ? `text-${slugify(text)}` : '',
    widthCm ? slugify(`${widthCm}cm`) : '',
  ].filter(Boolean);
  return parts.join('-') + '.png';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCard(cardEntry, index, threads, master) {
  const threadLookup = Object.fromEntries(threads.map(t => [t.hex, t.name]));
  const threadName = threadLookup[cardEntry.state.threadHex] ?? null;
  const widthCm = Math.round(CAP_FRONT_CM * (master.fontScale ?? 1) * 10) / 10;
  const canvas = cardEntry.el.querySelector('canvas');
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  downloadBlob(blob, buildFilename(index, cardEntry.state.cap, threadName, master.text, widthCm));
}

export async function exportZip(threads, master) {
  const zip = new JSZip();
  const threadLookup = Object.fromEntries(threads.map(t => [t.hex, t.name]));
  const cardList = Array.from(cards.values());

  const specs = buildSpecs(cardList, master, threadLookup);
  const widthCm = specs[0]?.embroideryWidthCm;

  for (let i = 0; i < cardList.length; i++) {
    const canvas = cardList[i].el.querySelector('canvas');
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const threadName = threadLookup[cardList[i].state.threadHex] ?? null;
    const name = buildFilename(i + 1, cardList[i].state.cap, threadName, master.text, widthCm);
    zip.file(name, blob);
  }

  zip.file(`${PREFIX}-caps-specs.json`, JSON.stringify(specs, null, 2));

  if (master.logoFile) {
    const { name, ext } = splitFilename(master.logoFilename);
    zip.file(`${PREFIX}-caps-logo-${slugify(name)}.${ext}`, master.logoFile);
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(out, `${PREFIX}-caps-${date}.zip`);
}
