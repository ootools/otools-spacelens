import { visibleChildren } from './tree.ts';
import type { FilterState, ScanNode } from '../types.ts';

export type ListSortKey = 'name' | 'size' | 'type' | 'mtime';

export interface ListSort {
  key: ListSortKey;
  desc: boolean;
}

/** 列表模式当前展示的节点：复用树图同一套筛选口径，再按列排序。 */
export function listRows(
  focus: ScanNode,
  filters: FilterState,
  sort: ListSort,
  tick: number,
): ScanNode[] {
  void tick;
  const rows = [...visibleChildren(focus, filters)];
  const factor = sort.desc ? -1 : 1;
  rows.sort((a, b) => {
    switch (sort.key) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * factor;
      case 'size':
        return (a.totalSize - b.totalSize) * factor;
      case 'type':
        return (a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) * factor;
      case 'mtime':
        return ((a.mtime ?? 0) - (b.mtime ?? 0)) * factor;
      default:
        return 0;
    }
  });
  return rows;
}

export function toggleSort(current: ListSort, key: ListSortKey): ListSort {
  if (current.key === key) return { key, desc: !current.desc };
  return { key, desc: key === 'size' || key === 'mtime' };
}
