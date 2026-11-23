/** 按大小区间配色：冷色（小）→ 暖色（大），与分类配色可切换。 */
export interface SizeTier {
  max: number;
  label: string;
  color: string;
}

export const SIZE_TIERS: SizeTier[] = [
  { max: 1024, label: '< 1 KB', color: '#5b8def' },
  { max: 1024 ** 2, label: '1 KB–1 MB', color: '#35b6c8' },
  { max: 10 * 1024 ** 2, label: '1–10 MB', color: '#3fb98a' },
  { max: 100 * 1024 ** 2, label: '10–100 MB', color: '#b6c14a' },
  { max: 1024 ** 3, label: '100 MB–1 GB', color: '#e8a33d' },
  { max: Number.POSITIVE_INFINITY, label: '≥ 1 GB', color: '#e2605e' },
];

export function sizeTier(bytes: number): SizeTier {
  const value = Number.isFinite(bytes) ? Math.max(0, bytes) : Number.POSITIVE_INFINITY;
  return SIZE_TIERS.find((tier) => value < tier.max) ?? SIZE_TIERS[SIZE_TIERS.length - 1];
}

export function sizeColor(bytes: number): string {
  return sizeTier(bytes).color;
}

/** 依据 WCAG 相对亮度选深/浅文字，保证浅色块上文字也清晰。 */
export function contrastTextColor(hex: string): string {
  const channel = (index: number): number => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return luminance > 0.45 ? '#16202b' : '#ffffff';
}
