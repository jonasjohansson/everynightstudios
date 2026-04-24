import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFontSize } from './fontfit.js';

function fakeCtx(perCharAt100) {
  return {
    font: '',
    measureText(s) {
      const m = parseFloat(this.font) || 100;
      return { width: s.length * perCharAt100 * (m / 100) };
    },
  };
}

test('fitFontSize scales down to fit box', () => {
  const ctx = fakeCtx(10); // 5-char "HELLO" at 100px font = 50px wide
  const size = fitFontSize(ctx, 'HELLO', 'serif', 100, 25);
  // need width <= 25; scale factor = 25/50 = 0.5; size = 100 * 0.5 = 50
  assert.equal(size, 50);
});

test('fitFontSize respects max size cap', () => {
  const ctx = fakeCtx(1);
  const size = fitFontSize(ctx, 'A', 'serif', 200, 1000, { max: 120 });
  assert.equal(size, 120);
});
