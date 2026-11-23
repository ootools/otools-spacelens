import test from 'node:test';
import assert from 'node:assert/strict';
import { squarify, type Rect } from './squarify.ts';

const area: Rect = { x: 0, y: 0, w: 400, h: 200 };

test('covers the full area without gaps or overlaps', () => {
  const items = [8, 6, 4, 2, 1].map((weight, index) => ({ id: index, weight }));
  const placed = squarify(items, area);
  assert.equal(placed.length, items.length);
  const totalArea = placed.reduce((sum, entry) => sum + entry.rect.w * entry.rect.h, 0);
  assert.ok(Math.abs(totalArea - area.w * area.h) < 1e-6, `area ${totalArea}`);
  for (const entry of placed) {
    assert.ok(entry.rect.x >= -1e-6 && entry.rect.y >= -1e-6);
    assert.ok(entry.rect.x + entry.rect.w <= area.w + 1e-6);
    assert.ok(entry.rect.y + entry.rect.h <= area.h + 1e-6);
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i].rect;
      const b = placed[j].rect;
      const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.ok(overlap < 1e-6, `overlap ${i}/${j}`);
    }
  }
});

test('ignores non-positive weights and degenerate rectangles', () => {
  const items = [
    { id: 1, weight: 0 },
    { id: 2, weight: -5 },
    { id: 3, weight: 10 },
  ];
  assert.equal(squarify(items, area).length, 1);
  assert.equal(squarify(items, { ...area, w: 0 }).length, 0);
  assert.equal(squarify([], area).length, 0);
});

test('single item fills the whole rectangle', () => {
  const placed = squarify([{ id: 1, weight: 7 }], area);
  assert.deepEqual(placed[0].rect, area);
});

test('larger weight gets larger rectangle', () => {
  const placed = squarify([{ id: 'small', weight: 1 }, { id: 'large', weight: 9 }], area);
  const rectOf = (id: string) => placed.find((entry) => entry.item.id === id)!.rect;
  assert.ok(rectOf('large').w * rectOf('large').h > rectOf('small').w * rectOf('small').h * 5);
});
