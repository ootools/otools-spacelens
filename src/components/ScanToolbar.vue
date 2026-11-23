<script setup lang="ts">
defineProps<{
  path: string;
  scanning: boolean;
  canScan: boolean;
  elapsed: string;
  viewMode: 'treemap' | 'list';
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  pick: [];
  scan: [];
  cancel: [];
  open: [];
  up: [];
  setView: [mode: 'treemap' | 'list'];
}>();
</script>

<template>
  <div class="toolbar">
    <button class="btn" @click="emit('pick')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9V7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2M2 9h20l-2 9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2L2 9Z" /></svg>
      {{ t('selectFolder') }}
    </button>
    <div class="path" :title="path">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
      <span>{{ path || t('noDataHint') }}</span>
    </div>
    <button v-if="scanning" class="btn" @click="emit('cancel')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      {{ t('cancel') }}
    </button>
    <button v-else class="btn btn-primary" :disabled="!canScan" @click="emit('scan')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>
      {{ t('rescan') }}
    </button>
    <button class="btn btn-icon" :disabled="!canScan" :title="t('up')" @click="emit('up')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
    <button class="btn" :disabled="!canScan" @click="emit('open')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      {{ t('openFolder') }}
    </button>
    <div class="spacer"></div>
    <span class="elapsed">{{ elapsed }}</span>
    <div class="views">
      <button
        :class="{ active: viewMode === 'treemap' }"
        :title="t('viewTreemap')"
        @click="emit('setView', 'treemap')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></svg>
      </button>
      <button
        :class="{ active: viewMode === 'list' }"
        :title="t('viewList')"
        @click="emit('setView', 'list')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--sl-border);
  background: linear-gradient(180deg, var(--sl-bg), var(--sl-panel));
  flex-shrink: 0;
}
.path {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  padding: 0 11px;
  height: 32px;
  border: 1px solid var(--sl-border);
  border-radius: 8px;
  background: var(--sl-panel);
  color: var(--sl-text-2);
}
.path svg { width: 15px; height: 15px; flex-shrink: 0; opacity: 0.7; }
.path span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.elapsed {
  color: var(--sl-text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--sl-panel);
}
.views {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--sl-border);
  border-radius: 9px;
  background: var(--sl-panel);
}
.views button {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sl-text-3);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.views button.active { background: var(--sl-bg); color: var(--sl-accent); box-shadow: 0 1px 3px rgba(16, 24, 40, .12); }
.views button:not(.active):hover { color: var(--sl-text); background: var(--sl-hover); }
.views svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
