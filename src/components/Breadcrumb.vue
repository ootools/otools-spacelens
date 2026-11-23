<script setup lang="ts">
import type { ScanNode } from '../types.ts';

defineProps<{ trail: ScanNode[]; rootLabel: string }>();
const emit = defineEmits<{ navigate: [node: ScanNode] }>();
</script>

<template>
  <div class="crumbs">
    <button class="crumb" @click="emit('navigate', trail[0])">{{ rootLabel }}</button>
    <template v-for="node in trail.slice(1)" :key="node.id">
      <span class="sep">/</span>
      <button class="crumb" @click="emit('navigate', node)">{{ node.name }}</button>
    </template>
  </div>
</template>

<style scoped>
.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--sl-border-soft);
  overflow-x: auto;
  white-space: nowrap;
  flex-shrink: 0;
}
.crumb {
  border: 0;
  background: none;
  color: var(--sl-text-2);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.crumb:hover { color: var(--sl-accent); background: var(--sl-hover); }
.sep { color: var(--sl-text-3); }
</style>
