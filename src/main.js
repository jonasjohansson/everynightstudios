import caps from './data/caps.json' with { type: 'json' };
import threads from './data/threads.json' with { type: 'json' };
import { createCard, redrawAll } from './cards.js';
import { readLogoFile } from './lib/logo.js';
import { exportZip } from './export.js';

const master = { text: 'every night', logoImage: null, logoFilename: null, logoFile: null };
const getMaster = () => master;

const grid = document.getElementById('card-grid');
const bar = document.getElementById('master-bar');

bar.innerHTML = `
  <input class="text-input" type="text" maxlength="14" placeholder="type anything" value="${master.text}">
  <label class="file-label">
    upload logo
    <input class="logo-input" type="file" accept=".svg,.png,.jpg,.jpeg" hidden>
  </label>
  <button class="logo-clear" hidden>clear logo</button>
  <button class="add">+ card</button>
  <button class="export">export zip</button>
`;

bar.querySelector('.text-input').addEventListener('input', (e) => {
  master.text = e.target.value;
  redrawAll();
});

const logoInput = bar.querySelector('.logo-input');
const logoClear = bar.querySelector('.logo-clear');

logoInput.addEventListener('change', async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  master.logoImage = await readLogoFile(file);
  master.logoFilename = file.name;
  master.logoFile = file;
  logoClear.hidden = false;
  redrawAll();
});

logoClear.addEventListener('click', () => {
  master.logoImage = null;
  master.logoFilename = null;
  master.logoFile = null;
  logoInput.value = '';
  logoClear.hidden = true;
  redrawAll();
});

bar.querySelector('.add').addEventListener('click', () => {
  grid.appendChild(createCard(caps, threads, getMaster));
});

bar.querySelector('.export').addEventListener('click', () => {
  exportZip(threads, master);
});

for (let i = 0; i < 4; i++) {
  const cap = caps[i % caps.length];
  const cardEl = createCard(caps, threads, getMaster);
  const sel = cardEl.querySelector('.cap-select');
  sel.value = cap.id;
  sel.dispatchEvent(new Event('change'));
  grid.appendChild(cardEl);
}
