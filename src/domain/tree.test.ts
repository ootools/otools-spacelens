import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodes, breadcrumb, createTree, viewTotals, visibleChildren } from './tree.ts';
import { allCategoryIds } from './categories.ts';
import type { FilterState, RawScanNode } from '../types.ts';

const node = (id: number, parent: number | null, name: string, size: number, isDir = false): RawScanNode => ({
  id,
  parent_id: parent,
  name,
  path: `/root/${name}`,
  is_dir: isDir,
  size,
});

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({
  enabled: allCategoryIds(),
  minSizeBytes: 0,
  nameQuery: '',
  isolateMatches: false,
  ...overrides,
});

test('applyNodes aggregates file sizes up the ancestor chain', () => {
  const tree = createTree();
  applyNodes(tree, [
    node(0, null, 'root', 0, true),
    node(1, 0, 'sub', 0, true),
    node(2, 1, 'a.bin', 100),
    node(3, 1, 'b.bin', 200),
  ]);
  assert.ok(tree.root);
  const sub = tree.nodes.get(1)!;
  assert.equal(sub.totalSize, 300);
  assert.equal(tree.root.totalSize, 300);
  assert.equal(tree.totals.bytes, 300);
  assert.equal(tree.totals.files, 2);
  assert.equal(tree.totals.dirs, 2);
});

test('out-of-order deltas still aggregate each file exactly once', () => {
  const tree = createTree();
  applyNodes(tree, [node(2, 1, 'a.bin', 50)]);
  applyNodes(tree, [node(0, null, 'root', 0, true), node(1, 0, 'sub', 0, true)]);
  assert.equal(tree.nodes.get(1)!.totalSize, 50);
  assert.equal(tree.root!.totalSize, 50);
  // 重复推送同一个 id 不重复计数
  applyNodes(tree, [node(2, 1, 'a.bin', 50)]);
  assert.equal(tree.root!.totalSize, 50);
});

test('visibleChildren filters by category, size and name', () => {
  const tree = createTree();
  applyNodes(tree, [
    node(0, null, 'root', 0, true),
    node(1, 0, 'big.jpg', 5000),
    node(2, 0, 'tiny.png', 10),
    node(3, 0, 'code.ts', 2000),
    node(4, 0, 'sub', 0, true),
    node(5, 4, 'inside.mp4', 3000),
  ]);
  const root = tree.root!;
  assert.equal(visibleChildren(root, filters()).length, 4);
  assert.equal(visibleChildren(root, filters({ enabled: new Set(['images']) })).length, 2);
  assert.equal(visibleChildren(root, filters({ minSizeBytes: 1000 })).length, 3);
  assert.deepEqual(
    visibleChildren(root, filters({ nameQuery: 'BIG', isolateMatches: true })).map((n) => n.name),
    ['big.jpg'],
  );
  assert.equal(visibleChildren(root, filters({ nameQuery: 'BIG' })).length, 4);
});

test('breadcrumb and viewTotals follow filtered tree', () => {
  const tree = createTree();
  applyNodes(tree, [
    node(0, null, 'root', 0, true),
    node(1, 0, 'sub', 0, true),
    node(2, 1, 'a.jpg', 100),
    node(3, 1, 'b.ts', 200),
  ]);
  const leaf = tree.nodes.get(2)!;
  assert.deepEqual(breadcrumb(leaf).map((n) => n.name), ['root', 'sub', 'a.jpg']);
  const totals = viewTotals(tree.root!, filters({ enabled: new Set(['images']) }));
  assert.equal(totals.bytes, 100);
  assert.equal(totals.files, 1);
  assert.equal(totals.dirs, 1);
});
