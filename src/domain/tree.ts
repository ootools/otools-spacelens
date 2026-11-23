import { categorize } from './categories.ts';
import type { FilterState, RawScanNode, ScanNode, TreeStore } from '../types.ts';

export function createTree(): TreeStore {
  return {
    root: null,
    nodes: new Map(),
    totals: { files: 0, dirs: 0, bytes: 0, scanned: 0 },
    pending: new Set(),
    orphans: new Set(),
  };
}

function toNode(raw: RawScanNode): ScanNode {
  return {
    id: raw.id,
    parentId: raw.parent_id,
    name: raw.name,
    path: raw.path,
    isDir: raw.is_dir,
    ownSize: raw.is_dir ? 0 : raw.size,
    totalSize: raw.is_dir ? 0 : raw.size,
    mtime: raw.mtime ?? null,
    category: categorize(raw.name, raw.is_dir),
    parent: null,
    children: [],
  };
}

/** 文件是否已接入到根，只有接入后才把大小冒泡给祖先。 */
function connected(node: ScanNode, root: ScanNode | null): boolean {
  if (node === root) return true;
  let current: ScanNode | null = node;
  while (current?.parent) {
    current = current.parent;
    if (current === root) return true;
  }
  return false;
}

/** 把一批 delta 接入树；文件的大小沿祖先链累加，目录自身不计重复。 */
export function applyNodes(store: TreeStore, rawNodes: RawScanNode[]): ScanNode[] {
  const added: ScanNode[] = [];
  for (const raw of rawNodes) {
    if (store.nodes.has(raw.id)) continue;
    const node = toNode(raw);
    store.nodes.set(node.id, node);
    const parent = raw.parent_id === null ? null : store.nodes.get(raw.parent_id) ?? null;
    node.parent = parent;
    if (parent) parent.children.push(node);
    else if (raw.parent_id === null && store.root === null) store.root = node;
    else store.orphans.add(node.id);
    added.push(node);
    if (node.isDir) store.totals.dirs += 1;
    else {
      store.totals.files += 1;
      store.totals.bytes += node.ownSize;
      store.pending.add(node.id);
    }
    store.totals.scanned += 1;
  }

  // 父节点晚到时把早到的节点重新挂回树上。
  for (const id of [...store.orphans]) {
    const node = store.nodes.get(id);
    if (!node || node.parent) {
      store.orphans.delete(id);
      continue;
    }
    const parent = node.parentId === null ? null : store.nodes.get(node.parentId) ?? null;
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
      store.orphans.delete(id);
    }
  }

  // 延迟到达的父节点会让早到的文件重新接入；这里统一补冒泡。
  for (const id of [...store.pending]) {
    const node = store.nodes.get(id);
    if (!node || !connected(node, store.root)) continue;
    let ancestor = node.parent;
    while (ancestor) {
      ancestor.totalSize += node.ownSize;
      ancestor = ancestor.parent;
    }
    store.pending.delete(id);
  }
  return added;
}

export function matchesFilter(node: ScanNode, filters: FilterState): boolean {
  if (!node.isDir && !filters.enabled.has(node.category)) return false;
  if (!node.isDir && node.totalSize < filters.minSizeBytes) return false;
  const query = filters.nameQuery.trim().toLowerCase();
  if (!query) return true;
  return node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
}

/** 当前 focus 节点下参与布局的子节点（按 totalSize 降序）。 */
export function visibleChildren(node: ScanNode, filters: FilterState): ScanNode[] {
  const query = filters.nameQuery.trim().toLowerCase();
  const children = node.children.filter((child) => {
    if (child.isDir && !filters.enabled.has('folders')) return false;
    if (!query) {
      if (!child.isDir && !filters.enabled.has(child.category)) return false;
      if (!child.isDir && child.totalSize < filters.minSizeBytes) return false;
      return child.totalSize > 0;
    }
    if (!filters.isolateMatches) {
      // 不隔离：只按分类/大小过滤，命中项由 UI 高亮。
      return child.isDir || (filters.enabled.has(child.category) && child.totalSize >= filters.minSizeBytes);
    }
    // 隔离：保留命中节点及其祖先目录链，便于定位。
    if (child.isDir) return subtreeMatches(child, filters);
    if (!filters.enabled.has(child.category)) return false;
    if (child.totalSize < filters.minSizeBytes) return false;
    return child.name.toLowerCase().includes(query) || child.path.toLowerCase().includes(query);
  });
  return children.sort((a, b) => b.totalSize - a.totalSize);
}

function subtreeMatches(node: ScanNode, filters: FilterState): boolean {
  const query = filters.nameQuery.trim().toLowerCase();
  if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) return true;
  return node.children.some((child) => subtreeMatches(child, filters));
}

export function breadcrumb(node: ScanNode): ScanNode[] {
  const trail: ScanNode[] = [];
  let current: ScanNode | null = node;
  while (current) {
    trail.unshift(current);
    current = current.parent;
  }
  return trail;
}

/** 筛选后当前视图的合计，用于状态栏与占比计算。 */
export function viewTotals(node: ScanNode, filters: FilterState): { bytes: number; files: number; dirs: number } {
  let bytes = 0;
  let files = 0;
  let dirs = 0;
  const walk = (current: ScanNode) => {
    for (const child of current.children) {
      if (child.isDir) {
        dirs += 1;
        walk(child);
      } else if (filters.enabled.has(child.category) && child.totalSize >= filters.minSizeBytes) {
        files += 1;
        bytes += child.totalSize;
      }
    }
  };
  walk(node);
  return { bytes, files, dirs };
}
