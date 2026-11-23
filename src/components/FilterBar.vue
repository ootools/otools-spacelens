<script setup lang="ts">
import { CATEGORIES } from '../domain/categories.ts';
import type { CategoryId } from '../types.ts';

const props = defineProps<{
  enabled: Set<CategoryId>;
  minSizeBytes: number;
  nameQuery: string;
  isolateMatches: boolean;
  colorMode: 'category' | 'size';
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  'update:enabled': [value: Set<CategoryId>];
  'update:minSizeBytes': [value: number];
  'update:nameQuery': [value: string];
  'update:isolateMatches': [value: boolean];
  'update:colorMode': [value: 'category' | 'size'];
}>();

function toggle(id: CategoryId) {
  const next = new Set(props.enabled);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  emit('update:enabled', next);
}
const sizeOptions = [
  { value: 0, key: 'minSizeNone' },
  { value: 1024, label: '1 KB' },
  { value: 1024 * 1024, label: '1 MB' },
  { value: 10 * 1024 * 1024, label: '10 MB' },
  { value: 100 * 1024 * 1024, label: '100 MB' },
  { value: 1024 ** 3, label: '1 GB' },
];
</script>

<template>
  <div class="filterbar">
    <input
      class="input search"
      :value="nameQuery"
      :placeholder="t('searchPlaceholder')"
      @input="emit('update:nameQuery', ($event.target as HTMLInputElement).value)"
    />
    <label class="check" :title="t('filterHint')">
      <input
        type="checkbox"
        :checked="isolateMatches"
        @change="emit('update:isolateMatches', ($event.target as HTMLInputElement).checked)"
      />
      {{ t('isolateMatches') }}
    </label>
    <select
      class="input"
      :value="minSizeBytes"
      @change="emit('update:minSizeBytes', Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="option in sizeOptions" :key="option.value" :value="option.value">
        {{ option.key ? t(option.key) : option.label }}
      </option>
    </select>
    <div class="modes" :title="t('colorBy')">
      <button
        :class="{ active: colorMode === 'size' }"
        @click="emit('update:colorMode', 'size')"
      >{{ t('colorSize') }}</button>
      <button
        :class="{ active: colorMode === 'category' }"
        @click="emit('update:colorMode', 'category')"
      >{{ t('colorCategory') }}</button>
    </div>
    <div class="divider"></div>
    <div class="chips">
      <button
        v-for="category in CATEGORIES"
        :key="category.id"
        class="chip"
        :class="{ off: !enabled.has(category.id) }"
        :style="{ '--chip': category.color }"
        :title="t(category.labelKey)"
        @click="toggle(category.id)"
      >
        <span class="dot"></span>{{ t(category.labelKey) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.filterbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid var(--sl-border-soft);
  flex-shrink: 0;
}
.search { width: 190px; }
.check { display: inline-flex; align-items: center; gap: 4px; color: var(--sl-text-2); cursor: pointer; }
.divider { width: 1px; height: 20px; background: var(--sl-border); }
.modes {
  display: inline-flex;
  gap: 2px;
  height: 32px;
  padding: 3px;
  border: 1px solid var(--sl-border);
  border-radius: 8px;
  background: var(--sl-panel);
}
.modes button {
  border: 0;
  background: transparent;
  padding: 0 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--sl-text-2);
  font-size: 12px;
  font-weight: 500;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.modes button.active {
  background: var(--sl-bg);
  color: var(--sl-accent);
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.12);
}
.modes button:not(.active):hover { color: var(--sl-text); background: var(--sl-hover); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--sl-border);
  border-radius: 13px;
  background: var(--sl-bg);
  cursor: pointer;
  font-size: 11.5px;
  color: var(--sl-text-2);
  transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease, border-color 140ms ease;
}
.chip:hover { transform: translateY(-1px); border-color: var(--chip); box-shadow: 0 2px 6px rgba(16, 24, 40, 0.1); }
.chip.off { opacity: 0.38; background: var(--sl-panel); }
.chip.off:hover { opacity: 0.7; }
.dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: var(--chip);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--chip) 22%, transparent);
}
</style>
