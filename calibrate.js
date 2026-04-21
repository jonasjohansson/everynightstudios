import caps from './src/data/caps.json' with { type: 'json' };

let i = 0;
const stage = document.getElementById('stage');
const img = document.getElementById('cap-img');
const box = document.getElementById('box');
const label = document.getElementById('label');
const prog = document.getElementById('prog');

function show() {
  const c = caps[i];
  label.textContent = `${i + 1}/${caps.length} · ${c.name}`;
  prog.value = (i + 1) / caps.length;
  img.src = c.image;
  img.onload = drawBox;
}

function drawBox() {
  const c = caps[i];
  const { x, y, width } = c.anchor;
  const w = img.clientWidth, h = img.clientHeight;
  const bw = width * w;
  const bh = bw * 0.4; // display-only height; anchor stores width only
  box.hidden = false;
  box.style.left = `${x * w - bw / 2}px`;
  box.style.top = `${y * h - bh / 2}px`;
  box.style.width = `${bw}px`;
  box.style.height = `${bh}px`;
}

let drag = null;
stage.addEventListener('mousedown', (e) => {
  const r = img.getBoundingClientRect();
  drag = { x0: e.clientX - r.left, y0: e.clientY - r.top };
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const r = img.getBoundingClientRect();
  drag.x1 = e.clientX - r.left;
  drag.y1 = e.clientY - r.top;
  const cx = (drag.x0 + drag.x1) / 2;
  const cy = (drag.y0 + drag.y1) / 2;
  const bw = Math.abs(drag.x1 - drag.x0);
  caps[i].anchor = {
    x: cx / img.clientWidth,
    y: cy / img.clientHeight,
    width: bw / img.clientWidth,
  };
  drawBox();
});
window.addEventListener('mouseup', () => { drag = null; });

document.getElementById('prev').addEventListener('click', () => { i = Math.max(0, i - 1); show(); });
document.getElementById('next').addEventListener('click', () => { i = Math.min(caps.length - 1, i + 1); show(); });
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(caps, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'caps.json';
  a.click();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { document.getElementById('next').click(); return; }
  const step = e.shiftKey ? 0.02 : 0.005;
  const a = caps[i].anchor;
  if (e.key === 'ArrowLeft') a.x -= step;
  else if (e.key === 'ArrowRight') a.x += step;
  else if (e.key === 'ArrowUp') a.y -= step;
  else if (e.key === 'ArrowDown') a.y += step;
  else return;
  e.preventDefault();
  drawBox();
});

show();
