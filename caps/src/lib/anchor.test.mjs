import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnchor } from './anchor.js';

test('resolveAnchor centers at normalized coords', () => {
  const a = resolveAnchor({ x: 0.5, y: 0.5, width: 0.4 }, 1000, 800);
  assert.equal(a.cx, 500);
  assert.equal(a.cy, 400);
  assert.equal(a.boxW, 400);
});

test('resolveAnchor clamps out-of-range values', () => {
  const a = resolveAnchor({ x: 1.5, y: -0.1, width: 2 }, 100, 100);
  assert.equal(a.cx, 100);
  assert.equal(a.cy, 0);
  assert.equal(a.boxW, 100);
});
