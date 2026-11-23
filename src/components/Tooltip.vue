<script setup lang="ts">
import { computed } from 'vue';
import { categoryColor } from '../domain/categories.ts';
import { formatBytes, formatPercent } from '../domain/format.ts';
import type { ScanNode } from '../types.ts';

const props = defineProps<{
  node: ScanNode;
  x: number;
  y: number;
  total: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{ open: [node: ScanNode] }>();
const color = computed(() => categoryColor(props.node.category));
const size = computed(() => formatBytes(props.node.totalSize));
const share = computed(() => formatPercent(props.node.totalSize, props.total));

/** 跟随鼠标但避免溢出视口；宽高为浮窗的近似值。 */
const position = computed(() => {
  const width = 300;
  const height = 196;
  const left = Math.max(12, Math.min(props.x + 18, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(props.y + 18, window.innerHeight - height - 12));
  return { left: `${left}px`, top: `${top}px` };
});
</script>

<template>
  <div class="tip" :style="position">
    <div class="title">
      <span class="swatch" :style="{ background: color, '--chip': color }"></span>
      <span class="name">{{ node.name }}</span>
    </div>
    <div class="stats">
      <div class="stat">
        <span class="stat-label">{{ t('tooltipSize') }}</span>
        <span class="stat-value">{{ size }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">{{ t('tooltipShare') }}</span>
        <span class="stat-value">{{ share }}</span>
      </div>
    </div>
    <div class="path" :title="node.path">{{ node.path }}</div>
    <button class="open" @click.stop="emit('open', node)">{{ t('openFolder') }}</button>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  z-index: 50;
  pointer-events: auto;
  width: 300px;
  max-width: calc(100vw - 24px);
  padding: 14px 16px 15px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 16px;
  background: color-mix(in srgb, var(--sl-bg) 78%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 14px 40px rgba(16, 24, 40, 0.18),
    0 2px 8px rgba(16, 24, 40, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  font-size: 12px;
  animation: tip-in 200ms cubic-bezier(.2, .8, .25, 1) both;
  transform-origin: top left;
}
:global(html.dark) .tip {
  border-color: rgba(255, 255, 255, 0.13);
  background: color-mix(in srgb, var(--sl-bg) 80%, transparent);
  box-shadow:
    0 16px 44px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.title { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--chip, currentColor) 18%, transparent);
}
.name {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  display: flex;
  gap: 8px;
  margin-bottom: 11px;
}
.stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--sl-border) 70%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--sl-bg) 55%, transparent);
}
.stat-label { color: var(--sl-text-3); font-size: 10.5px; }
.stat-value {
  color: var(--sl-text);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.path {
  margin-bottom: 12px;
  padding: 7px 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--sl-text-3) 10%, transparent);
  color: var(--sl-text-2);
  font-size: 10.5px;
  line-height: 1.45;
  word-break: break-all;
  max-height: 44px;
  overflow: hidden;
}

.open {
  width: 100%;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--sl-accent) 35%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--sl-accent) 12%, transparent);
  color: var(--sl-accent);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 140ms ease;
}
.open:hover {
  background: var(--sl-accent);
  border-color: var(--sl-accent);
  color: #fff;
  transform: translateY(-1px);
}
.open:active { transform: translateY(0); }

@keyframes tip-in {
  from { opacity: 0; transform: scale(.94) translateY(4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
