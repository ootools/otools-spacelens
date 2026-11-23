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

function mix(hex: string, target: [number, number, number], weight: number): string {
  const channel = (index: number): string => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(value + (target[index] - value) * weight)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * 同一区间内保持色系一致，颜色深度随大小对数增长（越大越深），
 * 避免同色系块糊成一片。最浅端混白 52%，最深端混黑 28%。
 */
export function sizeShade(bytes: number): string {
  const value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const found = SIZE_TIERS.findIndex((tier) => value < tier.max);
  const index = found < 0 ? SIZE_TIERS.length - 1 : found;
  const tier = SIZE_TIERS[index];
  const min = index === 0 ? 1 : SIZE_TIERS[index - 1].max;
  const max = Number.isFinite(tier.max) ? tier.max : 16 * 1024 ** 3;
  const low = Math.log10(Math.max(1, min));
  const high = Math.log10(Math.max(low + 1, max));
  const ratio = (Math.log10(Math.max(1, value)) - low) / (high - low);
  const t = Math.max(0, Math.min(1, ratio));
  const lightened = mix(tier.color, [255, 255, 255], (1 - t) * 0.52);
  return mix(lightened, [0, 0, 0], t * 0.28);
}

/** 用同色系加深的描边分隔相邻矩形。 */
export function shadeBorder(hex: string): string {
  return mix(hex, [0, 0, 0], 0.3);
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
