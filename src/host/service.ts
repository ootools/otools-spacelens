/**
 * spacelensd sidecar 客户端：spawn → stdio 握手 → loopback HTTP。
 * 与 concat 的 sidecar 同一协议；仅替换领域调用。
 */
import type { SidecarApi, SidecarEvent } from 'otools-plugin-sdk';

export class SpacelensdError extends Error {
  constructor(
    public readonly code: 'quota' | 'startup' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'SpacelensdError';
  }
}

interface ReadyMessage {
  event: 'ready';
  port: number;
  protocol: 1;
}

export class JsonLineBuffer {
  private carry = '';
  constructor(private readonly maxLineBytes = 64 * 1024) {}

  push(chunk: string): unknown[] {
    this.carry += chunk;
    const lines = this.carry.split('\n');
    if (lines.some((line) => new TextEncoder().encode(line).byteLength > this.maxLineBytes)) {
      this.carry = '';
      throw new Error('sidecar stdout line exceeded limit');
    }
    this.carry = lines.pop() ?? '';
    return lines.flatMap((line) => {
      const text = line.trim();
      if (!text) return [];
      try {
        return [JSON.parse(text) as unknown];
      } catch {
        return [];
      }
    });
  }

  reset(): void {
    this.carry = '';
  }
}

export function parseReady(value: unknown): ReadyMessage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    record.event !== 'ready' ||
    record.protocol !== 1 ||
    typeof record.port !== 'number' ||
    !Number.isInteger(record.port) ||
    record.port < 1 ||
    record.port > 65535
  ) {
    return null;
  }
  return { event: 'ready', port: record.port, protocol: 1 };
}

export function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random tokens are unavailable');
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loopbackOrigin(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SpacelensdError('startup', 'invalid sidecar port');
  }
  return `http://127.0.0.1:${port}`;
}

export interface SidecarConnection {
  origin: string;
  token: string;
  dispose(): Promise<void>;
}

export async function connectSpacelensd(api: SidecarApi, timeoutMs = 15_000): Promise<SidecarConnection> {
  const token = createSessionToken();
  const lines = new JsonLineBuffer();
  let handle = '';
  let stop: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const early: SidecarEvent[] = [];
  let resolveReady!: (port: number) => void;
  let rejectReady!: (reason: Error) => void;
  const ready = new Promise<number>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    stop?.();
    lines.reset();
    if (handle) {
      try {
        await api.kill(handle);
      } catch {
        /* 宿主视图生命周期是最终清理权威 */
      }
    }
  };
  const receive = (event: SidecarEvent) => {
    if (disposed) return;
    if (!handle) {
      if (early.length < 32) early.push(event);
      return;
    }
    if (event.handle !== handle) return;
    if (event.event === 'exit' || event.event === 'overflow') {
      rejectReady(new SpacelensdError('startup', 'The scan service stopped before it was ready.'));
      return;
    }
    if (event.event !== 'output' || event.stream !== 'stdout') return;
    try {
      for (const line of lines.push(event.data)) {
        const value = parseReady(line);
        if (value) resolveReady(value.port);
      }
    } catch {
      rejectReady(new SpacelensdError('startup', 'The scan service sent an invalid handshake.'));
    }
  };
  try {
    stop = await api.onEvent(receive);
    const spawned = await api.spawn('spacelensd', ['--stdio'], { lifetime: 'view' });
    handle = spawned.handle;
    for (const event of early) receive(event);
    timer = setTimeout(
      () => rejectReady(new SpacelensdError('startup', 'The scan service did not become ready.')),
      timeoutMs,
    );
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1';
    await api.writeStdin(handle, `${JSON.stringify({ type: 'init', token, origin })}\n`);
    const port = await ready;
    clearTimeout(timer);
    return { origin: loopbackOrigin(port), token, dispose };
  } catch (error) {
    await dispose();
    const message = error instanceof Error ? error.message : String(error);
    if (/quota|limit|最多|上限|8.*(?:slot|进程|服务)|too many/i.test(message)) {
      throw new SpacelensdError('quota', 'All sidecar slots are in use');
    }
    if (error instanceof SpacelensdError) throw error;
    throw new SpacelensdError('startup', 'Unable to start the scan service.');
  }
}
