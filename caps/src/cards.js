// src/cards.js — per-card state + DOM.
import { renderCard } from './render.js';

let nextId = 1;
export const cards = new Map();

export function createCard(caps, threads, getMaster, onExport) {
  const state = {
    id: nextId++,
    cap: caps[0],
    threadHex: threads[0].hex,
    locked: false,
  };

  const el = document.createElement('article');
  el.className = 'cap';
  el.innerHTML = `
    <canvas></canvas>
    <button class="lock" title="keep during randomize">🔓</button>
    <div class="controls">
      <div class="swatches cap-swatches"></div>
      <div class="swatches thread-swatches"></div>
      <div class="actions">
        <button class="save" title="save PNG">⬇</button>
        <button class="remove" title="remove">×</button>
      </div>
    </div>
  `;

  const canvas = el.querySelector('canvas');
  const capRow = el.querySelector('.cap-swatches');
  const threadRow = el.querySelector('.thread-swatches');
  const removeBtn = el.querySelector('.remove');
  const saveBtn = el.querySelector('.save');
  const lockBtn = el.querySelector('.lock');

  const capBtns = caps.map(c => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c.hex || '#fff';
    b.title = c.name;
    b.dataset.id = c.id;
    b.addEventListener('click', () => setCap(c));
    capRow.appendChild(b);
    return b;
  });
  const threadBtns = threads.map(t => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = t.hex;
    b.title = t.name;
    b.dataset.hex = t.hex;
    b.addEventListener('click', () => setThread(t.hex));
    threadRow.appendChild(b);
    return b;
  });

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

  function paintSwatches() {
    for (const b of capBtns) b.classList.toggle('active', b.dataset.id === state.cap.id);
    for (const b of threadBtns) b.classList.toggle('active', b.dataset.hex === state.threadHex);
  }

  function setCap(cap) {
    state.cap = cap;
    paintSwatches();
    redraw();
  }
  function setThread(hex) {
    state.threadHex = hex;
    paintSwatches();
    redraw();
  }
  function toggleLock() {
    state.locked = !state.locked;
    el.classList.toggle('locked', state.locked);
    lockBtn.textContent = state.locked ? '🔒' : '🔓';
  }

  lockBtn.addEventListener('click', toggleLock);
  removeBtn.addEventListener('click', () => {
    el.remove();
    cards.delete(state.id);
  });
  saveBtn.addEventListener('click', () => {
    if (onExport) onExport(entry);
  });

  const entry = { state, redraw, el, setCap, setThread, toggleLock };
  cards.set(state.id, entry);
  paintSwatches();
  redraw();

  return el;
}

export function redrawAll() {
  for (const c of cards.values()) c.redraw();
}
