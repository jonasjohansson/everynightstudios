// src/cards.js — per-card state + DOM.
import { renderCard } from './render.js';

let nextId = 1;
export const cards = new Map();

function contrastOn(hex) {
  if (!hex) return '#000';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? '#000' : '#fff';
}

export function createCard(caps, threads, getMaster) {
  const state = {
    id: nextId++,
    cap: caps[0],
    threadHex: threads[0].hex,
  };

  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <canvas></canvas>
    <div class="controls">
      <select class="cap-select" title="cap"></select>
      <select class="thread-select" title="thread"></select>
      <button class="remove" title="remove">×</button>
    </div>
  `;

  const canvas = el.querySelector('canvas');
  const capSel = el.querySelector('.cap-select');
  const threadSel = el.querySelector('.thread-select');
  const removeBtn = el.querySelector('.remove');

  for (const c of caps) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    opt.style.backgroundColor = c.hex || '#fff';
    opt.style.color = contrastOn(c.hex);
    capSel.appendChild(opt);
  }
  for (const t of threads) {
    const opt = document.createElement('option');
    opt.value = t.hex;
    opt.textContent = t.name;
    opt.style.backgroundColor = t.hex;
    opt.style.color = contrastOn(t.hex);
    threadSel.appendChild(opt);
  }

  async function redraw() {
    const master = getMaster();
    await renderCard(canvas, {
      cap: state.cap,
      threadHex: state.threadHex,
      text: master.text,
      logoImage: master.logoImage,
      fontScale: master.fontScale ?? 1,
      yOffset: master.yOffset ?? 0,
    });
  }

  function setCap(cap) {
    state.cap = cap;
    capSel.value = cap.id;
    paintSelects();
    redraw();
  }
  function setThread(hex) {
    state.threadHex = hex;
    threadSel.value = hex;
    paintSelects();
    redraw();
  }

  function paintSelects() {
    const c = state.cap;
    capSel.style.backgroundColor = c.hex || '#fff';
    capSel.style.color = contrastOn(c.hex);
    threadSel.style.backgroundColor = state.threadHex;
    threadSel.style.color = contrastOn(state.threadHex);
  }

  capSel.addEventListener('change', () => {
    state.cap = caps.find(c => c.id === capSel.value);
    paintSelects();
    redraw();
  });
  threadSel.addEventListener('change', () => {
    state.threadHex = threadSel.value;
    paintSelects();
    redraw();
  });
  removeBtn.addEventListener('click', () => {
    el.remove();
    cards.delete(state.id);
  });

  cards.set(state.id, { state, redraw, el, setCap, setThread });
  paintSelects();
  redraw();

  return el;
}

export function redrawAll() {
  for (const c of cards.values()) c.redraw();
}
