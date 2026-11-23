import { SpacelensdError, type SidecarConnection } from '../host/service.ts';
import type { RawScanNode, ScanTotals, WarningEvent } from '../types.ts';

export interface ScanStarted {
  scanId: string;
  root: string;
  startedAt: number;
}

export interface ScanDone {
  durationMs: number;
  totals: ScanTotals;

}

export interface ScanHandlers {
  start?: (payload: ScanStarted) => void;
  batch?: (payload: { seq: number; nodes: RawScanNode[] }) => void;
  progress?: (payload: ScanTotals) => void;
  warning?: (payload: WarningEvent) => void;
  limit?: (payload: { maxNodes: number }) => void;
  done?: (payload: ScanDone) => void;
  cancelled?: (payload: ScanDone) => void;
  error?: (payload: { message: string }) => void;
  onConnectionError?: () => void;
}

export interface ScanClient {
  startScan(path: string): Promise<{ scanId: string }>;
  cancelScan(scanId: string): Promise<void>;
  snapshot(scanId: string): Promise<{ status: string; totals: ScanTotals }>;
  subscribe(scanId: string, handlers: ScanHandlers): () => void;
  eventsUrl(scanId: string): string;
}

export function createScanClient(connection: SidecarConnection): ScanClient {
  const request = async <T>(path: string, body?: unknown): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${connection.origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${connection.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new SpacelensdError('network', payload.error ?? `扫描服务请求失败（${response.status}）`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SpacelensdError) throw error;
      throw new SpacelensdError('network', '本地扫描服务不可用。');
    } finally {
      clearTimeout(timer);
    }
  };

  const eventsUrl = (scanId: string): string => {
    const url = new URL(`/api/scan/${encodeURIComponent(scanId)}/events`, connection.origin);
    url.searchParams.set('access_token', connection.token);
    return url.href;
  };

  return {
    startScan(path) {
      return request('/api/scan', { path });
    },
    async cancelScan(scanId) {
      await request(`/api/scan/${encodeURIComponent(scanId)}/cancel`, {});
    },
    snapshot(scanId) {
      return request(`/api/scan/${encodeURIComponent(scanId)}/snapshot`);
    },
    eventsUrl,
    subscribe(scanId, handlers) {
      const source = new EventSource(eventsUrl(scanId));
      const named: Array<[keyof ScanHandlers, string]> = [
        ['start', 'start'],
        ['batch', 'batch'],
        ['progress', 'progress'],
        ['warning', 'warning'],
        ['limit', 'limit'],
        ['done', 'done'],
        ['cancelled', 'cancelled'],
        ['error', 'error'],
      ];
      const listeners: Array<() => void> = [];
      for (const [key, eventName] of named) {
        const listener = (event: MessageEvent<string>) => {
          const handler = handlers[key];
          if (typeof handler !== 'function') return;
          try {
            (handler as (payload: unknown) => void)(JSON.parse(event.data));
          } catch {
            /* 坏事件直接丢弃 */
          }
        };
        source.addEventListener(eventName, listener as EventListener);
        listeners.push(() => source.removeEventListener(eventName, listener as EventListener));
      }
      source.onerror = () => handlers.onConnectionError?.();
      return () => {
        listeners.forEach((remove) => remove());
        source.close();
      };
    },
  };
}
