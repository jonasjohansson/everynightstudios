import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recolorSvg } from './logo.js';

test('recolorSvg overrides fill on all elements', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="red"/><circle cx="1" cy="1" r="1"/></svg>';
  const out = recolorSvg(input, '#00ff00');
  assert.match(out, /fill="#00ff00"/);
  assert.doesNotMatch(out, /fill="red"/);
});

test('recolorSvg injects fill when no fill attributes present', () => {
  const input = '<svg><path d="M0 0"/></svg>';
  const out = recolorSvg(input, '#ff0000');
  assert.match(out, /fill="#ff0000"/);
});
