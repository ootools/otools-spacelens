import test from 'node:test';
import assert from 'node:assert/strict';
import { listRows, toggleSort } from './list.ts';
import { allCategoryIds } from './categories.ts';
import { applyNodes, createTree } from './tree.ts';
import type { FilterState, RawScanNode } from '../types.ts';

const node = (id: number, name: string, size: number, isDir = false, mtime = 0): RawScanNode => ({
  id,
  parent_id: 0,
  name,
  path: `/root/${name}`,
  is_dir: isDir,
  size,
  mtime,
});

const filters: FilterState = {
  enabled: allCategoryIds(),
  minSizeBytes: 0,
  nameQuery: '',
  isolateMatches: false,
};

function tree() {
  const store = createTree();
  const child = node(4, 'inside.bin', 500, false, 3000);
  child.parent_id = 3;
  applyNodes(store, [
    { ...node(0, 'root', 0, true), parent_id: null },
    node(1, 'beta.txt', 200, false, 2000),
    node(2, 'alpha.jpg', 800, false, 1000),
    node(3, 'folder', 0, true, 3000),
    child,
  ]);
  return store.root!;
}

test('listRows sorts by size descending by default', () => {
  const rows = listRows(tree(), filters, { key: 'size', desc: true }, 0);
  assert.deepEqual(rows.map((row) => row.name), ['alpha.jpg', 'folder', 'beta.txt']);
});

test('listRows sorts by name, type and mtime', () => {
  const root = tree();
  assert.deepEqual(
    listRows(root, filters, { key: 'name', desc: false }, 0).map((row) => row.name),
    ['alpha.jpg', 'beta.txt', 'folder'],
  );
  assert.deepEqual(
    listRows(root, filters, { key: 'mtime', desc: true }, 0).map((row) => row.name),
    ['folder', 'beta.txt', 'alpha.jpg'],
  );
  const types = listRows(root, filters, { key: 'type', desc: false }, 0).map((row) => row.category);
  assert.deepEqual(types, [...types].sort());
});

test('listRows respects the same filters as the treemap', () => {
  const rows = listRows(tree(), { ...filters, minSizeBytes: 400 }, { key: 'size', desc: true }, 0);
  assert.deepEqual(rows.map((row) => row.name), ['alpha.jpg', 'folder']);
});

test('toggleSort flips direction on the same key and resets on a new key', () => {
  assert.deepEqual(toggleSort({ key: 'size', desc: true }, 'size'), { key: 'size', desc: false });
  assert.deepEqual(toggleSort({ key: 'size', desc: false }, 'name'), { key: 'name', desc: false });
  assert.deepEqual(toggleSort({ key: 'name', desc: false }, 'size'), { key: 'size', desc: true });
});
