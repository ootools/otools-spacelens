import { visibleChildren } from '../domain/tree.ts';
import { squarify, type Rect } from './squarify.ts';
import type { FilterState, ScanNode } from '../types.ts';

export interface LayoutItem {
  node: ScanNode;
  rect: Rect;
  depth: number;
  isParent: boolean;
}

const HEADER = 20;
const MIN_NEST_W = 150;
const MIN_NEST_H = 96;
const MAX_NESTED = 24;
const MAX_VISIBLE = 2000;

/**
 * 只布局 focus 的直接子节点；空间足够的目录再内嵌一层孙辈，
 * 使同屏矩形数量有界，避免大目录动画卡顿。
 */
export function layoutFocus(
  focus: ScanNode,
  filters: FilterState,
  width: number,
  height: number,
): LayoutItem[] {
  if (width <= 0 || height <= 0) return [];
  const children = visibleChildren(focus, filters).slice(0, MAX_VISIBLE);
  if (!children.length) return [];
  const area: Rect = { x: 0, y: 0, w: width, h: height };
  const placed = squarify(
    children.map((node) => ({ node, weight: node.totalSize })),
    area,
  );

  const result: LayoutItem[] = [];
  for (const { item, rect } of placed) {
    const node = item.node;
    result.push({ node, rect, depth: 0, isParent: false });
    if (
      !node.isDir ||
      rect.w < MIN_NEST_W ||
      rect.h < MIN_NEST_H ||
      result.length >= MAX_VISIBLE
    ) {
      continue;
    }
    const inner: Rect = {
      x: rect.x + 2,
      y: rect.y + HEADER + 2,
      w: Math.max(0, rect.w - 4),
      h: Math.max(0, rect.h - HEADER - 4),
    };
    const grandchildren = squarify(
      visibleChildren(node, filters)
        .slice(0, MAX_NESTED)
        .map((child) => ({ child, weight: child.totalSize })),
      inner,
    );
    for (const nested of grandchildren) {
      result.push({
        node: nested.item.child,
        rect: nested.rect,
        depth: 1,
        isParent: false,
      });
    }
  }
  return result;
}
