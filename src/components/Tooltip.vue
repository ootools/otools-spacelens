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
</script>

<template>
  <div class="tip" :style="{ left: `${x + 14}px`, top: `${y + 14}px` }">
    <div class="title">
      <span class="swatch" :style="{ background: color }"></span>
      <span class="name">{{ node.name }}</span>
    </div>
    <div class="line"><span>{{ t('tooltipSize') }}</span><b>{{ formatBytes(node.totalSize) }}</b></div>
    <div class="line"><span>{{ t('tooltipShare') }}</span><b>{{ formatPercent(node.totalSize, total) }}</b></div>
    <div class="path" :title="node.path">{{ node.path }}</div>
    <button class="open" @click.stop="emit('open', node)">{{ t('openFolder') }}</button>
  </div>
</template>

<style scoped>
.tip {
  position: fixed;
  z-index: 50;
  pointer-events: auto;
  width: 290px;
  max-width: 70vw;
  padding: 10px 12px;
  border: 1px solid var(--sl-border);
  border-radius: 8px;
  background: var(--sl-bg);
  box-shadow: var(--sl-shadow);
  font-size: 12px;
}
.title { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; justify-content: space-between; color: var(--sl-text-2); margin: 3px 0; }
.line b { color: var(--sl-text); }
.path { margin: 8px 0; word-break: break-all; color: var(--sl-text-3); }
.open { width: 100%; height: 26px; border: 1px solid var(--sl-border); border-radius: 5px; background: var(--sl-panel); cursor: pointer; }
.open:hover { background: var(--sl-hover); }
</style>
