/** Squarified treemap（Bruls, Huizing & van Wijk），零依赖纯函数。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Weighted {
  weight: number;
}

export interface LaidOut<T> {
  item: T;
  rect: Rect;
}

function worstRatio(row: number[], side: number): number {
  const sum = row.reduce((total, value) => total + value, 0);
  if (sum <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
  const max = Math.max(...row);
  const min = Math.min(...row);
  const squared = side * side;
  return Math.max((squared * max) / (sum * sum), (sum * sum) / (squared * min));
}

interface Scaled<T> {
  item: T;
  weight: number;
}

/**
 * 把带权重的项目铺进矩形。权重非正的项目被忽略；结果按权重降序铺排。
 * 权重先按矩形面积归一化，因此单项会铺满整个矩形、多项互不重叠。
 */
export function squarify<T extends Weighted>(items: T[], rect: Rect): Array<LaidOut<T>> {
  const result: Array<LaidOut<T>> = [];
  const positive = items
    .filter((item) => Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  if (!positive.length || rect.w <= 0 || rect.h <= 0) return result;

  const totalWeight = positive.reduce((sum, item) => sum + item.weight, 0);
  const scale = (rect.w * rect.h) / totalWeight;
  const list: Array<Scaled<T>> = positive.map((item) => ({
    item,
    weight: item.weight * scale,
  }));

  const layout = (remaining: Array<Scaled<T>>, area: Rect): void => {
    if (!remaining.length || area.w <= 0 || area.h <= 0) return;
    const side = Math.min(area.w, area.h);
    const row: number[] = [remaining[0].weight];
    let consumed = 1;
    while (
      consumed < remaining.length &&
      worstRatio([...row, remaining[consumed].weight], side) <= worstRatio(row, side)
    ) {
      row.push(remaining[consumed].weight);
      consumed += 1;
    }
    const total = row.reduce((sum, value) => sum + value, 0);
    const thickness = Math.min(total / side, Math.max(area.w, area.h));
    const picked = remaining.splice(0, consumed);

    if (area.w >= area.h) {
      let cursor = area.y;
      for (let index = 0; index < picked.length; index += 1) {
        const height = (row[index] / total) * area.h;
        result.push({
          item: picked[index].item,
          rect: { x: area.x, y: cursor, w: thickness, h: height },
        });
        cursor += height;
      }
      layout(remaining, { x: area.x + thickness, y: area.y, w: area.w - thickness, h: area.h });
    } else {
      let cursor = area.x;
      for (let index = 0; index < picked.length; index += 1) {
        const width = (row[index] / total) * area.w;
        result.push({
          item: picked[index].item,
          rect: { x: cursor, y: area.y, w: width, h: thickness },
        });
        cursor += width;
      }
      layout(remaining, { x: area.x, y: area.y + thickness, w: area.w, h: area.h - thickness });
    }
  };

  layout(list, rect);
  return result;
}
