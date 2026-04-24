function slugify(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function snapshotView(view) {
  const prev = view.getHandlesVisible();
  view.setHandlesVisible(false);
  await view.redraw();
  const canvas = view.el.querySelector('canvas');
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  view.setHandlesVisible(prev);
  await view.redraw();
  return blob;
}

async function combineViews(frontCanvas, backCanvas) {
  const gap = 24;
  const w = frontCanvas.width + gap + backCanvas.width;
  const h = Math.max(frontCanvas.height, backCanvas.height);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fafaf7';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(frontCanvas, 0, 0);
  ctx.drawImage(backCanvas, frontCanvas.width + gap, 0);
  return await new Promise(res => c.toBlob(res, 'image/png'));
}

export async function exportZip({ item, color, front, back }) {
  const zip = new JSZip();
  const base = [item.id, color.id].filter(Boolean).map(slugify).join('--');

  const [frontBlob, backBlob] = await Promise.all([
    snapshotView(front),
    snapshotView(back),
  ]);
  const combinedBlob = await combineViews(front.el.querySelector('canvas'), back.el.querySelector('canvas'));
  zip.file(`${base}--mockup.png`, combinedBlob);
  zip.file(`${base}--front.png`, frontBlob);
  zip.file(`${base}--back.png`, backBlob);

  const fd = front.getDesign();
  const bd = back.getDesign();

  if (fd?.dataUrl) {
    zip.file(`design--front--${fd.filename}`, dataUrlToBlob(fd.dataUrl));
  }
  if (bd?.dataUrl) {
    zip.file(`design--back--${bd.filename}`, dataUrlToBlob(bd.dataUrl));
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(out, `apparel--${base}--${ts}.zip`);
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
