import threads from './data/threads.json' with { type: 'json' };
console.log('threads loaded:', threads.length);
document.getElementById('master-bar').textContent = 'master bar';
document.getElementById('card-grid').textContent = 'card grid';
