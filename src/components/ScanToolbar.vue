<script setup lang="ts">
defineProps<{
  path: string;
  scanning: boolean;
  canScan: boolean;
  elapsed: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{
  pick: [];
  scan: [];
  cancel: [];
  open: [];
  up: [];
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
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sl-border);
  background: var(--sl-bg);
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
</style>
