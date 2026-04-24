import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpecs, CAP_FRONT_CM } from './specs.js';

test('buildSpecs emits one entry per card with looked-up thread name', () => {
  const cards = [
    { state: { cap: { id: 'vintage-cornflower', name: 'Vintage Cornflower' }, threadHex: '#f4f4ee' } },
    { state: { cap: { id: 'vintage-black', name: 'Vintage Black' }, threadHex: '#1a1a1a' } },
  ];
  const master = { text: 'every night', logoFilename: 'logo.svg' };
  const threadLookup = { '#f4f4ee': 'Bright White', '#1a1a1a': 'Black' };
  const specs = buildSpecs(cards, master, threadLookup);

  assert.equal(specs.length, 2);
  assert.deepEqual(specs[0], {
    index: 1,
    capId: 'vintage-cornflower',
    capName: 'Vintage Cornflower',
    threadHex: '#f4f4ee',
    threadName: 'Bright White',
    text: 'every night',
    logoFilename: 'logo.svg',
    embroideryWidthCm: Math.round(CAP_FRONT_CM * 10) / 10,
  });
  assert.equal(specs[1].index, 2);
  assert.equal(specs[1].capId, 'vintage-black');
  assert.equal(specs[1].embroideryWidthCm, Math.round(CAP_FRONT_CM * 10) / 10);
});

test('buildSpecs falls back to null threadName for unknown hex and null logo when absent', () => {
  const cards = [{ state: { cap: { id: 'a', name: 'A' }, threadHex: '#abcdef' } }];
  const specs = buildSpecs(cards, { text: '', logoFilename: null }, {});
  assert.equal(specs[0].threadName, null);
  assert.equal(specs[0].threadHex, '#abcdef');
  assert.equal(specs[0].logoFilename, null);
  assert.equal(specs[0].embroideryWidthCm, Math.round(CAP_FRONT_CM * 10) / 10);
});

test('buildSpecs scales embroideryWidthCm by master.fontScale', () => {
  const cards = [{ state: { cap: { id: 'a', name: 'A' }, threadHex: '#000' } }];
  const specs = buildSpecs(cards, { text: 'x', logoFilename: null, fontScale: 0.5 }, {});
  assert.equal(specs[0].embroideryWidthCm, Math.round(CAP_FRONT_CM * 0.5 * 10) / 10);
});
