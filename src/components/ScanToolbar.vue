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
    <button class="btn" @click="emit('pick')">{{ t('selectFolder') }}</button>
    <div class="path" :title="path">{{ path || t('noDataHint') }}</div>
    <button v-if="scanning" class="btn" @click="emit('cancel')">{{ t('cancel') }}</button>
    <button v-else class="btn btn-primary" :disabled="!canScan" @click="emit('scan')">{{ t('rescan') }}</button>
    <button class="btn" :disabled="!canScan" @click="emit('up')">{{ t('up') }}</button>
    <button class="btn" :disabled="!canScan" @click="emit('open')">{{ t('openFolder') }}</button>
    <div class="spacer"></div>
    <span class="muted">{{ elapsed }}</span>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sl-border);
  flex-shrink: 0;
}
.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 10px;
  border: 1px solid var(--sl-border);
  border-radius: 6px;
  background: var(--sl-panel);
  color: var(--sl-text-2);
}
</style>
