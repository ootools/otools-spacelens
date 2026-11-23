<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import ScanToolbar from './components/ScanToolbar.vue';
import FilterBar from './components/FilterBar.vue';
import Breadcrumb from './components/Breadcrumb.vue';
import Treemap from './components/Treemap.vue';
import Tooltip from './components/Tooltip.vue';
import { createHostAdapter } from './host/adapter.ts';
import type { SidecarConnection } from './host/service.ts';
import { createScanClient, type ScanClient, type ScanHandlers } from './scan/client.ts';
import { createMockScanClient } from './mock/scanClient.ts';
import { allCategoryIds } from './domain/categories.ts';
import { formatBytes, formatCount, formatDuration } from './domain/format.ts';
import { applyNodes, breadcrumb, createTree, viewTotals } from './domain/tree.ts';
import { SIZE_TIERS } from './domain/sizeColors.ts';
import { useSpaceLensI18n } from './i18n.ts';
import type { FilterState, ScanNode, ScanTotals, WarningEvent } from './types.ts';

const { t, direction } = useSpaceLensI18n();
const params = new URLSearchParams(window.location.search);
const isMock = params.get('mock') === '1';
const adapter = createHostAdapter();

let client: ScanClient | null = null;
let connection: SidecarConnection | null = null;
let unsubscribe: (() => void) | null = null;

const store = createTree();
const version = ref(0);
const path = ref('');
const scanning = ref(false);
const status = ref<'idle' | 'scanning' | 'done' | 'cancelled' | 'error'>('idle');
const message = ref('');
const focusId = ref<number | null>(null);
const selectedId = ref<number | null>(null);
const hover = ref<{ node: ScanNode; x: number; y: number } | null>(null);
const warnings = ref<WarningEvent[]>([]);
const totals = ref<ScanTotals>({ files: 0, dirs: 0, bytes: 0, scanned: 0 });
const duration = ref(0);
const width = ref(900);
const height = ref(520);
const container = ref<HTMLElement | null>(null);
const filters = reactive<FilterState>({
  enabled: allCategoryIds(),
  minSizeBytes: 0,
  nameQuery: '',
  isolateMatches: false,
});
const colorMode = ref<'category' | 'size'>('size');

const focus = computed<ScanNode | null>(() => {
  void version.value;
  if (!store.root) return null;
  if (focusId.value === null) return store.root;
  return store.nodes.get(focusId.value) ?? store.root;
});
const trail = computed(() => (focus.value ? breadcrumb(focus.value) : []));
const stats = computed(() => (focus.value ? viewTotals(focus.value, filters) : { bytes: 0, files: 0, dirs: 0 }));
const elapsed = computed(() => (duration.value ? formatDuration(duration.value) : ''));
const canScan = computed(() => Boolean(path.value || isMock));
const selected = computed(() => {
  void version.value;
  return selectedId.value === null ? null : store.nodes.get(selectedId.value) ?? null;
});

function makeHandlers(): ScanHandlers {
  return {
    batch: ({ nodes }) => {
      applyNodes(store, nodes);
      version.value += 1;
    },
    progress: (payload) => {
      totals.value = { ...payload };
    },
    warning: (payload) => {
      warnings.value = [...warnings.value, payload].slice(-12);
    },
    done: (payload) => {
      scanning.value = false;
      status.value = 'done';
      duration.value = payload.durationMs;
      totals.value = { ...payload.totals };
      if (payload.partial) message.value = t('partialResult');
    },
    cancelled: (payload) => {
      scanning.value = false;
      status.value = 'cancelled';
      duration.value = payload.durationMs;
      message.value = t('scanCancelled');
    },
    error: (payload) => {
      scanning.value = false;
      status.value = 'error';
      message.value = payload.message || t('scanFailed');
    },
    onConnectionError: () => {
      // EventSource 短暂断开通常由宿主重连；不打断已有树。
    },
  };
}

async function startScan(target?: string) {
  const root = target ?? path.value;
  if (!root || !client) return;
  path.value = root;
  unsubscribe?.();
  unsubscribe = null;
  store.root = null;
  store.nodes.clear();
  store.totals = { files: 0, dirs: 0, bytes: 0, scanned: 0 };
  store.pending.clear();
  store.orphans.clear();
  focusId.value = null;
  selectedId.value = null;
  hover.value = null;
  warnings.value = [];
  duration.value = 0;
  message.value = '';
  totals.value = { files: 0, dirs: 0, bytes: 0, scanned: 0 };
  version.value += 1;
  try {
    const { scanId } = await client.startScan(root);
    activeScanId = scanId;
    scanning.value = true;
    status.value = 'scanning';
    unsubscribe = client.subscribe(scanId, makeHandlers());
  } catch (error) {
    scanning.value = false;
    status.value = 'error';
    message.value = error instanceof Error ? error.message : t('scanFailed');
  }
}

async function pickFolder() {
  if (isMock) {
    message.value = t('mockPickHint');
    return;
  }
  const picked = await adapter.pickFolder();
  if (picked) await startScan(picked);
}

async function cancelScan() {
  if (!client || !scanning.value || !activeScanId) return;
  try {
    await client.cancelScan(activeScanId);
  } catch {
    /* 扫描可能已结束 */
  }
}
let activeScanId = '';

function drill(node: ScanNode) {
  focusId.value = node.id;
  selectedId.value = null;
  hover.value = null;
}
function navigate(node: ScanNode) {
  focusId.value = node.id === store.root?.id ? null : node.id;
}
function up() {
  if (!focus.value?.parent) return;
  navigate(focus.value.parent);
}
function select(node: ScanNode) {
  selectedId.value = node.id;
}
async function openNode(node?: ScanNode) {
  const target = node
    ? (node.isDir ? node.path : node.parent?.path ?? path.value)
    : focus.value?.path ?? path.value;
  if (!target) return;
  const opened = await adapter.openFolder(target);
  if (!opened) {
    try {
      await navigator.clipboard.writeText(target);
      message.value = t('copiedToClipboard');
    } catch {
      message.value = target;
    }
  }
}

let observer: ResizeObserver | null = null;
onMounted(async () => {
  if (container.value) {
    observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        width.value = Math.max(1, rect.width);
        height.value = Math.max(1, rect.height);
      }
    });
    observer.observe(container.value);
  }
  if (isMock) {
    client = createMockScanClient(params.get('blocked') === '1');
    message.value = t('mockHint');
    await startScan('/Users/demo/Projects');
    return;
  }
  if (!adapter.hasSidecar) {
    message.value = t('hostMissingHint');
    status.value = 'error';
    return;
  }
  try {
    connection = await adapter.connect();
    client = createScanClient(connection);
    message.value = t('ready');
  } catch (error) {
    status.value = 'error';
    message.value = error instanceof Error ? error.message : t('hostMissingHint');
  }
});

onUnmounted(() => {
  unsubscribe?.();
  observer?.disconnect();
  void connection?.dispose();
});
</script>

<template>
  <div class="app" :dir="direction">
    <ScanToolbar
      :path="path"
      :scanning="scanning"
      :can-scan="canScan"
      :elapsed="elapsed"
      :t="t"
      @pick="pickFolder"
      @scan="startScan()"
      @cancel="cancelScan"
      @open="openNode()"
      @up="up"
    />
    <FilterBar
      v-model:enabled="filters.enabled"
      v-model:min-size-bytes="filters.minSizeBytes"
      v-model:name-query="filters.nameQuery"
      v-model:isolate-matches="filters.isolateMatches"
      v-model:color-mode="colorMode"
      :t="t"
    />
    <Breadcrumb v-if="focus" :trail="trail" :root-label="t('root')" @navigate="navigate" />
    <div v-if="colorMode === 'size'" class="legend">
      <span class="legend-title">{{ t('sizeLegend') }}</span>
      <span v-for="tier in SIZE_TIERS" :key="tier.label" class="legend-item">
        <i :style="{ background: tier.color }"></i>{{ tier.label }}
      </span>
    </div>
    <div ref="container" class="canvas">
      <Treemap
        v-if="focus"
        :focus="focus"
        :filters="filters"
        :width="width"
        :height="height"
        :total="stats.bytes"
        :query="filters.nameQuery"
        :tick="version"
        :color-mode="colorMode"
        :t="t"
        @drill="drill"
        @select="select"
        @open="openNode"
        @hover="hover = $event"
      />
      <div v-else class="empty">
        <b>{{ t('noData') }}</b>
        <span class="muted">{{ message || t('noDataHint') }}</span>
      </div>
    </div>
    <div class="statusbar">
      <span>{{ t('totalSize') }}: <b>{{ formatBytes(stats.bytes) }}</b></span>
      <span>{{ t('filesCount') }}: {{ formatCount(stats.files) }}</span>
      <span>{{ t('foldersCount') }}: {{ formatCount(stats.dirs) }}</span>
      <span>{{ t('scannedCount') }}: {{ formatCount(totals.scanned) }}</span>
      <span v-if="selected" class="muted">{{ selected.path }}</span>
      <span class="spacer"></span>
      <span v-if="warnings.length" class="warn" :title="warnings.map((w) => w.path ?? '').join('\n')">
        {{ t('warning') }} × {{ warnings.length }}
      </span>
      <span v-if="message" class="muted">{{ message }}</span>
    </div>
    <Tooltip
      v-if="hover"
      :node="hover.node"
      :x="hover.x"
      :y="hover.y"
      :total="stats.bytes"
      :t="t"
      @open="openNode"
    />
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--sl-border-soft);
  background: var(--sl-panel);
  font-size: 11px;
  flex-shrink: 0;
}
.legend-title { color: var(--sl-text-3); }
.legend-item { display: inline-flex; align-items: center; gap: 4px; color: var(--sl-text-2); white-space: nowrap; }
.legend-item i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.canvas { position: relative; flex: 1; min-height: 0; }
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--sl-text-2);
}
.statusbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 7px 12px;
  border-top: 1px solid var(--sl-border);
  background: var(--sl-panel);
  font-size: 12px;
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
}
.warn { color: var(--sl-danger); }
</style>
