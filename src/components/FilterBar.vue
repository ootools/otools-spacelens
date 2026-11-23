<script setup lang="ts">
import { CATEGORIES } from '../domain/categories.ts';
import type { CategoryId } from '../types.ts';

const props = defineProps<{
  enabled: Set<CategoryId>;
  minSizeBytes: number;
  nameQuery: string;
  isolateMatches: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  'update:enabled': [value: Set<CategoryId>];
  'update:minSizeBytes': [value: number];
  'update:nameQuery': [value: string];
  'update:isolateMatches': [value: boolean];
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
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--sl-border);
  border-radius: 12px;
  background: var(--sl-bg);
  cursor: pointer;
  font-size: 12px;
}
.chip.off { opacity: 0.4; text-decoration: line-through; }
.dot { width: 8px; height: 8px; border-radius: 2px; background: var(--chip); }
</style>
