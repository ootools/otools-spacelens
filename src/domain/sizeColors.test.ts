import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE_TIERS, sizeColor, sizeShade, sizeTier, shadeBorder, contrastTextColor } from './sizeColors.ts';

function brightness(hex: string): number {
  const channel = (index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return channel(0) + channel(1) + channel(2);
}

test('each size falls into the expected tier', () => {
  assert.equal(sizeTier(0).label, '< 1 KB');
  assert.equal(sizeTier(1023).label, '< 1 KB');
  assert.equal(sizeTier(1024).label, '1 KB–1 MB');
  assert.equal(sizeTier(1024 ** 2).label, '1–10 MB');
  assert.equal(sizeTier(10 * 1024 ** 2).label, '10–100 MB');
  assert.equal(sizeTier(100 * 1024 ** 2).label, '100 MB–1 GB');
  assert.equal(sizeTier(1024 ** 3).label, '≥ 1 GB');
  assert.equal(sizeTier(Number.POSITIVE_INFINITY).label, '≥ 1 GB');
});

test('adjacent tiers use distinct colors', () => {
  const colors = new Set(SIZE_TIERS.map((tier) => tier.color));
  assert.equal(colors.size, SIZE_TIERS.length);
  assert.equal(sizeColor(512), SIZE_TIERS[0].color);
  assert.equal(sizeColor(50 * 1024 ** 2), SIZE_TIERS[3].color);
  assert.equal(sizeColor(500 * 1024 ** 2), SIZE_TIERS[4].color);
});

test('sizeShade darkens progressively inside one size tier', () => {
  const small = sizeShade(2 * 1024 * 1024);
  const middle = sizeShade(5 * 1024 * 1024);
  const large = sizeShade(9 * 1024 * 1024);
  assert.equal(sizeTier(2 * 1024 * 1024), sizeTier(9 * 1024 * 1024));
  assert.ok(brightness(small) > brightness(middle));
  assert.ok(brightness(middle) > brightness(large));
  assert.notEqual(small, SIZE_TIERS[2].color);
});

test('shadeBorder is darker than the tile color', () => {
  const color = sizeShade(5 * 1024 * 1024);
  assert.ok(brightness(color) > brightness(shadeBorder(color)));
});

test('contrast text is dark on light colors and white on dark ones', () => {
  assert.equal(contrastTextColor('#b6c14a'), '#16202b');
  assert.equal(contrastTextColor('#e2605e'), '#ffffff');
  assert.equal(contrastTextColor('#5b8def'), '#ffffff');
});
