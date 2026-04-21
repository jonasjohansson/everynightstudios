// src/cards.js — per-card state + DOM.
import { renderCard } from './render.js';

let nextId = 1;
export const cards = new Map();

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
      <label>cap
        <select class="cap-select"></select>
      </label>
      <label>thread
        <select class="thread-select"></select>
      </label>
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
    capSel.appendChild(opt);
  }
  for (const t of threads) {
    const opt = document.createElement('option');
    opt.value = t.hex;
    opt.textContent = t.name;
    threadSel.appendChild(opt);
  }

  async function redraw() {
    const master = getMaster();
    await renderCard(canvas, {
      cap: state.cap,
      threadHex: state.threadHex,
      text: master.text,
      logoImage: master.logoImage,
    });
  }

  capSel.addEventListener('change', () => {
    state.cap = caps.find(c => c.id === capSel.value);
    redraw();
  });
  threadSel.addEventListener('change', () => {
    state.threadHex = threadSel.value;
    redraw();
  });
  removeBtn.addEventListener('click', () => {
    el.remove();
    cards.delete(state.id);
  });

  cards.set(state.id, { state, redraw, el });
  redraw();

  return el;
}

export function redrawAll() {
  for (const c of cards.values()) c.redraw();
}
