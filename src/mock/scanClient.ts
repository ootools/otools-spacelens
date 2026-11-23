import { generateMockNodes } from './tree.ts';
import type { RawScanNode, ScanTotals } from '../types.ts';
import type { ScanClient, ScanHandlers } from '../scan/client.ts';

/** 浏览器预览用的 ScanClient：同样的接口，定时推送合成节点。 */
export function createMockScanClient(blocked = false): ScanClient {
  let handlers: ScanHandlers | null = null;
  let nodes: RawScanNode[] = [];
  let cursor = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const totals: ScanTotals = { files: 0, dirs: 0, bytes: 0, scanned: 0 };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const tick = () => {
    if (!handlers) return;
    const batch = nodes.slice(cursor, cursor + 24);
    cursor += batch.length;
    if (batch.length) {
      handlers.batch?.({ seq: cursor, nodes: batch });
      for (const node of batch) {
        totals.scanned += 1;
        if (node.is_dir) totals.dirs += 1;
        else {
          totals.files += 1;
          totals.bytes += node.size;
        }
      }
      handlers.progress?.({ ...totals });
    }
    if (blocked && cursor === 1) {
      handlers.warning?.({
        path: '/Users/demo/Projects/restricted',
        kind: 'permission',
        message: 'permission denied',
      });
    }
    if (cursor >= nodes.length) {
      stop();
      handlers.done?.({ durationMs: cursor * 3, totals: { ...totals } });
    }
  };

  return {
    startScan() {
      stop();
      nodes = generateMockNodes();
      cursor = 0;
      totals.files = 0;
      totals.dirs = 0;
      totals.bytes = 0;
      totals.scanned = 0;
      return Promise.resolve({ scanId: 'mock-scan' });
    },
    async cancelScan() {
      stop();
      handlers?.cancelled?.({ durationMs: 0, totals: { ...totals } });
    },
    async snapshot() {
      return { status: timer ? 'running' : 'done', totals: { ...totals } };
    },
    subscribe(_scanId, nextHandlers) {
      handlers = nextHandlers;
      handlers.start?.({ scanId: 'mock-scan', root: '/Users/demo/Projects', startedAt: Date.now() });
      if (!timer) timer = setInterval(tick, 80);
      return () => {
        stop();
        if (handlers === nextHandlers) handlers = null;
      };
    },
    eventsUrl() {
      return '';
    },
  };
}
