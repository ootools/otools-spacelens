<script setup lang="ts">
import { computed } from 'vue';
import { layoutFocus, type LayoutItem } from '../layout/layout-tree.ts';
import { categoryColor } from '../domain/categories.ts';
import { formatBytes } from '../domain/format.ts';
import type { FilterState, ScanNode } from '../types.ts';

const props = defineProps<{
  focus: ScanNode | null;
  filters: FilterState;
  width: number;
  height: number;
  total: number;
  query: string;
  tick: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  drill: [node: ScanNode];
  select: [node: ScanNode];
  open: [node: ScanNode];
  hover: [payload: { node: ScanNode; x: number; y: number } | null];
}>();

const items = computed<LayoutItem[]>(() => {
  void props.tick;
  return props.focus ? layoutFocus(props.focus, props.filters, props.width, props.height) : [];
});

function alpha(hex: string, value: number): string {
  let a = 0.35 + Math.min(0.6, Math.log10(Math.max(1, value) + 1) / 12);
  a = Math.min(0.95, a);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function tileStyle(item: LayoutItem) {
  const color = item.node.isDir ? '#6b7c93' : categoryColor(item.node.category);
  return {
    left: `${item.rect.x}px`,
    top: `${item.rect.y}px`,
    width: `${Math.max(0, item.rect.w)}px`,
    height: `${Math.max(0, item.rect.h)}px`,
    background: alpha(color, item.node.totalSize),
    borderColor: color,
  };
}

function onClick(item: LayoutItem) {
  if (item.node.isDir) emit('drill', item.node);
  else emit('select', item.node);
}
function onDblClick(item: LayoutItem) {
  emit('open', item.node);
}
function onHover(item: LayoutItem, event: MouseEvent) {
  emit('hover', { node: item.node, x: event.clientX, y: event.clientY });
}
</script>

<template>
  <div class="treemap" @mouseleave="emit('hover', null)">
    <div
      v-for="item in items"
      :key="`${item.depth}-${item.node.id}`"
      class="tile"
      :class="{
        nested: item.depth === 1,
        dir: item.node.isDir,
        match: Boolean(query) && item.node.name.toLowerCase().includes(query.toLowerCase()),
        dim: Boolean(query) && !item.node.name.toLowerCase().includes(query.toLowerCase()),
      }"
      :style="tileStyle(item)"
      @click="onClick(item)"
      @dblclick="onDblClick(item)"
      @mousemove="onHover(item, $event)"
    >
      <span v-if="item.depth === 0" class="label">
        <b>{{ item.node.name }}</b>
        <small>{{ formatBytes(item.node.totalSize) }}</small>
      </span>
      <span v-else-if="item.rect.w > 70 && item.rect.h > 34" class="nested-label">
        {{ item.node.name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.treemap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--sl-panel);
}
.tile {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid;
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  transition: left 240ms cubic-bezier(.2, .7, .2, 1),
              top 240ms cubic-bezier(.2, .7, .2, 1),
              width 240ms cubic-bezier(.2, .7, .2, 1),
              height 240ms cubic-bezier(.2, .7, .2, 1),
              background 240ms ease;
  will-change: left, top, width, height;
  animation: pop-in 220ms ease both;
}
.tile:hover { filter: brightness(1.15); z-index: 2; }
.tile.match { outline: 2px solid #fff; outline-offset: -2px; z-index: 3; }
.tile.dim { opacity: 0.35; }
.tile.nested { border-width: 1px; opacity: 0.9; }
.label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 3px 5px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  font-size: 11px;
  line-height: 1.25;
  max-width: 100%;
}
.label b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label small { opacity: 0.85; font-size: 10px; }
.nested-label {
  display: block;
  padding: 2px 4px;
  color: #fff;
  font-size: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(.86); }
  to { opacity: 1; transform: scale(1); }
}
</style>
