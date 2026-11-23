<script setup lang="ts">
import { CATEGORIES } from '../domain/categories.ts';
import { SIZE_TIERS } from '../domain/sizeColors.ts';
import type { CategoryId } from '../types.ts';

const props = defineProps<{
  open: boolean;
  active: boolean;
  enabled: Set<CategoryId>;
  minSizeBytes: number;
  nameQuery: string;
  isolateMatches: boolean;
  colorMode: 'category' | 'size';
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  toggle: [];
  'update:enabled': [value: Set<CategoryId>];
  'update:minSizeBytes': [value: number];
  'update:nameQuery': [value: string];
  'update:isolateMatches': [value: boolean];
  'update:colorMode': [value: 'category' | 'size'];
}>();

function toggleCategory(id: CategoryId) {
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
  <aside class="sidebar" :class="{ collapsed: !open }">
    <!-- 收缩态：桌面 APP 常见的窄边栏，点任意图标展开 -->
    <div v-if="!open" class="rail">
      <button class="rail-btn" :class="{ active }" :title="t('toggleSidebar')" @click="emit('toggle')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 8v6l-4 2v-8L4 5Z" /></svg>
        <i v-if="active" class="rail-dot"></i>
      </button>
      <button class="rail-btn" :title="t('categories')" @click="emit('toggle')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
      </button>
      <button class="rail-btn" :title="t('colorBy')" @click="emit('toggle')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9M12 12 5.5 18.5" /></svg>
      </button>
      <div class="rail-spacer"></div>
      <button class="rail-btn" :title="t('toggleSidebar')" @click="emit('toggle')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </div>

    <!-- 展开态 -->
    <template v-else>
      <div class="side-head">
        <span class="section-title">{{ t('filterTitle') }}</span>
        <button class="collapse" :title="t('collapseSidebar')" @click="emit('toggle')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
      </div>

      <div class="section">
        <div class="search-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <input
            class="search"
            :value="nameQuery"
            :placeholder="t('searchPlaceholder')"
            @input="emit('update:nameQuery', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <label class="check">
          <input
            type="checkbox"
            :checked="isolateMatches"
            @change="emit('update:isolateMatches', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('isolateMatches') }}</span>
        </label>
      </div>

      <div class="section">
        <div class="section-title">{{ t('colorBy') }}</div>
        <div class="modes">
          <button :class="{ active: colorMode === 'size' }" @click="emit('update:colorMode', 'size')">{{ t('colorSize') }}</button>
          <button :class="{ active: colorMode === 'category' }" @click="emit('update:colorMode', 'category')">{{ t('colorCategory') }}</button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">{{ t('categories') }}</div>
        <div class="cat-list">
          <button
            v-for="category in CATEGORIES"
            :key="category.id"
            class="cat-row"
            :class="{ off: !enabled.has(category.id) }"
            :style="{ '--chip': category.color }"
            @click="toggleCategory(category.id)"
          >
            <span class="dot"></span>
            <span class="cat-name">{{ t(category.labelKey) }}</span>
            <svg v-if="enabled.has(category.id)" class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L19 7" /></svg>
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">{{ t('minSize') }}</div>
        <select
          class="select"
          :value="minSizeBytes"
          @change="emit('update:minSizeBytes', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="option in sizeOptions" :key="option.value" :value="option.value">
            {{ option.key ? t(option.key) : option.label }}
          </option>
        </select>
      </div>

      <div v-if="colorMode === 'size'" class="section">
        <div class="section-title">{{ t('sizeLegend') }}</div>
        <div class="legend-list">
          <div v-for="tier in SIZE_TIERS" :key="tier.label" class="legend-row">
            <i :style="{ background: tier.color }"></i><span>{{ tier.label }}</span>
          </div>
        </div>
      </div>

      <div class="side-foot">{{ t('filterHint') }}</div>
    </template>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-right: 1px solid var(--sl-border);
  background: var(--sl-panel);
  padding: 14px 12px 10px;
  gap: 18px;
  transition: width 220ms cubic-bezier(.2, .8, .25, 1), padding 220ms ease;
}
.sidebar.collapsed { width: 46px; padding: 10px 7px; gap: 10px; overflow: hidden; }

.side-head { display: flex; align-items: center; justify-content: space-between; }
.collapse, .rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--sl-text-2);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 140ms ease;
}
.collapse { width: 26px; height: 26px; }
.collapse:hover, .rail-btn:hover { background: var(--sl-hover); color: var(--sl-accent); }
.collapse:active, .rail-btn:active { transform: scale(.94); }
.collapse svg, .rail-btn svg {
  width: 16px; height: 16px; fill: none; stroke: currentColor;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}

.rail { display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; }
.rail-btn { position: relative; width: 32px; height: 32px; }
.rail-btn.active { background: color-mix(in srgb, var(--sl-accent) 14%, transparent); color: var(--sl-accent); }
.rail-dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--sl-accent); }
.rail-spacer { flex: 1; }

.section { display: flex; flex-direction: column; gap: 8px; }
.section-title {
  color: var(--sl-text-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  padding: 0 3px;
}
.search-wrap { position: relative; }
.search-wrap svg {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--sl-text-3);
  stroke-width: 1.8;
  stroke-linecap: round;
}
.search {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 29px;
  border: 1px solid var(--sl-border);
  border-radius: 8px;
  background: var(--sl-bg);
  outline: none;
  font-size: 12px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.search:focus { border-color: var(--sl-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sl-accent) 16%, transparent); }
.check { display: inline-flex; align-items: center; gap: 7px; color: var(--sl-text-2); cursor: pointer; font-size: 12px; padding: 2px 3px; }
.check input { accent-color: var(--sl-accent); }
.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--sl-border);
  border-radius: 9px;
  background: var(--sl-bg);
}
.modes button {
  border: 0;
  background: transparent;
  padding: 6px 0;
  border-radius: 7px;
  cursor: pointer;
  color: var(--sl-text-2);
  font-size: 12px;
  font-weight: 500;
  transition: background 140ms ease, color 140ms ease;
}
.modes button.active { background: var(--sl-accent); color: #fff; }
.modes button:not(.active):hover { background: var(--sl-hover); }
.cat-list { display: flex; flex-direction: column; gap: 2px; }
.cat-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--sl-text);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  transition: background 140ms ease, opacity 140ms ease;
}
.cat-row:hover { background: var(--sl-hover); }
.cat-row.off { opacity: 0.4; }
.dot { width: 10px; height: 10px; border-radius: 3px; background: var(--chip); box-shadow: 0 0 0 2px color-mix(in srgb, var(--chip) 20%, transparent); flex-shrink: 0; }
.cat-name { flex: 1; }
.tick { width: 14px; height: 14px; fill: none; stroke: var(--sl-accent); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.select { width: 100%; height: 32px; padding: 0 10px; border: 1px solid var(--sl-border); border-radius: 8px; background: var(--sl-bg); outline: none; font-size: 12px; }
.legend-list { display: flex; flex-direction: column; gap: 5px; }
.legend-row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; color: var(--sl-text-2); font-size: 11.5px; }
.legend-row i { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
.side-foot { margin-top: auto; padding: 8px 3px 0; border-top: 1px solid var(--sl-border-soft); color: var(--sl-text-3); font-size: 10.5px; line-height: 1.5; }
</style>
