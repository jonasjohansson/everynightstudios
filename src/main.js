import caps from './data/caps.json' with { type: 'json' };
import threads from './data/threads.json' with { type: 'json' };
import { createCard, redrawAll } from './cards.js';

const master = { text: 'every night', logoImage: null };
const getMaster = () => master;

const grid = document.getElementById('card-grid');
const bar = document.getElementById('master-bar');

bar.innerHTML = `
  <input class="text-input" type="text" maxlength="14" placeholder="type anything" value="${master.text}">
  <button class="add">+ card</button>
`;

bar.querySelector('.text-input').addEventListener('input', (e) => {
  master.text = e.target.value;
  redrawAll();
});
bar.querySelector('.add').addEventListener('click', () => {
  grid.appendChild(createCard(caps, threads, getMaster));
});

// Seed with 4 cards, each preselecting a different cap.
for (let i = 0; i < 4; i++) {
  const cap = caps[i % caps.length];
  const cardEl = createCard(caps, threads, getMaster);
  const sel = cardEl.querySelector('.cap-select');
  sel.value = cap.id;
  sel.dispatchEvent(new Event('change'));
  grid.appendChild(cardEl);
}
