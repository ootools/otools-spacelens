<script setup lang="ts">
import { computed, ref } from 'vue';
import { CATEGORIES, categoryColor } from '../domain/categories.ts';
import { formatBytes, formatPercent } from '../domain/format.ts';
import { listRows, toggleSort, type ListSort, type ListSortKey } from '../domain/list.ts';
import type { FilterState, ScanNode } from '../types.ts';

const props = defineProps<{
  focus: ScanNode | null;
  filters: FilterState;
  tick: number;
  total: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  drill: [node: ScanNode];
  select: [node: ScanNode];
  open: [node: ScanNode];
}>();

const sort = ref<ListSort>({ key: 'size', desc: true });
const MAX_ROWS = 2000;
const rows = computed<ScanNode[]>(() => {
  if (!props.focus) return [];
  return listRows(props.focus, props.filters, sort.value, props.tick).slice(0, MAX_ROWS);
});
const truncated = computed(() => {
  if (!props.focus) return false;
  return listRows(props.focus, props.filters, sort.value, props.tick).length > MAX_ROWS;
});

const columns: Array<{ key: ListSortKey; label: string }> = [
  { key: 'name', label: 'columnName' },
  { key: 'type', label: 'columnType' },
  { key: 'size', label: 'columnSize' },
  { key: 'mtime', label: 'columnModified' },
];

function headerClick(key: ListSortKey) {
  sort.value = toggleSort(sort.value, key);
}
function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.labelKey ?? id;
}
function formatTime(ms: number | null): string {
  if (!ms) return '–';
  return new Date(ms).toLocaleDateString();
}
function onClick(node: ScanNode) {
  if (node.isDir) emit('drill', node);
  else emit('select', node);
}
</script>

<template>
  <div class="list">
    <div class="head">
      <button
        v-for="column in columns"
        :key="column.key"
        class="th"
        :class="[`col-${column.key}`, { active: sort.key === column.key }]"
        @click="headerClick(column.key)"
      >
        {{ t(column.label) }}
        <span v-if="sort.key === column.key" class="arrow">{{ sort.desc ? '↓' : '↑' }}</span>
      </button>
      <div class="th col-share">{{ t('columnShare') }}</div>
      <div class="th col-action"></div>
    </div>

    <div class="body">
      <div
        v-for="node in rows"
        :key="node.id"
        class="row"
        @click="onClick(node)"
        @dblclick="emit('open', node)"
      >
        <div class="cell col-name" :title="node.path">
          <span class="marker" :style="{ background: node.isDir ? '#6b7c93' : categoryColor(node.category) }"></span>
          <svg v-if="node.isDir" class="folder" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
          <span class="name">{{ node.name }}</span>
        </div>
        <div class="cell col-type">{{ t(categoryLabel(node.category)) }}</div>
        <div class="cell col-size">{{ formatBytes(node.totalSize) }}</div>
        <div class="cell col-mtime">{{ formatTime(node.mtime) }}</div>
        <div class="cell col-share">
          <div class="bar"><i :style="{ width: `${total > 0 ? Math.min(100, node.totalSize / total * 100) : 0}%` }"></i></div>
          <span>{{ formatPercent(node.totalSize, total) }}</span>
        </div>
        <div class="cell col-action">
          <button class="open" :title="t('openLocation')" @click.stop="emit('open', node)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
          </button>
        </div>
      </div>
      <div v-if="!rows.length" class="empty">{{ t('noDataHint') }}</div>
      <div v-if="truncated" class="truncated">{{ t('listTruncated', { count: MAX_ROWS }) }}</div>
    </div>
  </div>
</template>

<style scoped>
.list { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--sl-bg); }
.head, .row { display: grid; grid-template-columns: minmax(120px, 1fr) 74px 80px 86px 104px 30px; align-items: center; }
.head {
  flex-shrink: 0;
  border-bottom: 1px solid var(--sl-border);
  background: var(--sl-panel);
  position: sticky;
  top: 0;
  z-index: 1;
}
.th {
  border: 0;
  background: transparent;
  padding: 9px 8px;
  color: var(--sl-text-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.th.active { color: var(--sl-accent); }
.th:not(.active):hover { color: var(--sl-text-2); }
.arrow { margin-left: 3px; font-size: 11px; }
.body { flex: 1; overflow-y: auto; }
.row {
  min-height: 34px;
  border-bottom: 1px solid var(--sl-border-soft);
  cursor: pointer;
  font-size: 12px;
  transition: background 120ms ease;
}
.row:hover { background: var(--sl-hover); }
.cell { padding: 6px 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sl-text-2); }
.col-name { display: flex; align-items: center; gap: 8px; color: var(--sl-text); }
.marker { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
.folder { width: 14px; height: 14px; flex-shrink: 0; fill: none; stroke: var(--sl-text-3); stroke-width: 1.8; stroke-linejoin: round; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-size { font-variant-numeric: tabular-nums; }
.col-share { display: flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums; }
.bar { flex: 1; height: 5px; border-radius: 3px; background: var(--sl-panel); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; background: var(--sl-accent); opacity: .8; }
.open {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 7px; background: transparent; color: var(--sl-text-3); cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.open:hover { background: var(--sl-accent); color: #fff; }
.open svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.empty, .truncated { padding: 20px; text-align: center; color: var(--sl-text-3); font-size: 12px; }
</style>
