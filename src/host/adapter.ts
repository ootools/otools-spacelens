/** 宿主能力适配：选目录 / 打开文件夹 / sidecar spawn；浏览器模式优雅降级。 */
import { pickDirectory } from 'otools-plugin-sdk/dialog';
import { getOtoolsApi } from 'otools-plugin-sdk/runtime';
import type { SidecarApi } from 'otools-plugin-sdk';
import { connectSpacelensd, type SidecarConnection } from './service.ts';

type HostApi = Record<string, unknown> & {
  sidecar?: SidecarApi;
  pickFiles?: (options: unknown) => Promise<string[] | string | null>;
  shellOpenPath?: (path: string) => void | Promise<void>;
};

function sidecar(api: HostApi | undefined): SidecarApi | undefined {
  return api?.sidecar;
}

export interface HostAdapter {
  kind: 'otools' | 'browser';
  hasSidecar: boolean;
  pickFolder(): Promise<string | null>;
  openFolder(path: string): Promise<boolean>;
  connect(): Promise<SidecarConnection>;
}

export function createHostAdapter(): HostAdapter {
  const api = getOtoolsApi() as HostApi | undefined;
  const isOtools = Boolean(
    api && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
  return {
    kind: isOtools ? 'otools' : 'browser',
    hasSidecar: Boolean(isOtools && sidecar(api)?.spawn),
    async pickFolder() {
      if (!isOtools || !api) return null;
      try {
        const pick = api.pickFiles as ((options: unknown) => Promise<string[] | string | null>) | undefined;
        const result = typeof pick === 'function'
          ? await pick({ directory: true, multiple: false, title: '选择要分析的文件夹' })
          : await pickDirectory({ title: '选择要分析的文件夹' });
        if (Array.isArray(result)) return result[0] ?? null;
        return typeof result === 'string' ? result : null;
      } catch {
        return null;
      }
    },
    async openFolder(path: string) {
      if (!isOtools || !api) return false;
      const opener = api.shellOpenPath
        ?? (window as unknown as { otools?: { shellOpenPath?: (p: string) => void } }).otools?.shellOpenPath;
      if (typeof opener !== 'function') return false;
      try {
        await opener(path);
        return true;
      } catch {
        return false;
      }
    },
    async connect() {
      const apiSidecar = sidecar(api);
      if (!apiSidecar?.spawn) {
        throw new Error('当前宿主不支持 sidecar，需要 OTools 0.9.8+。');
      }
      return await connectSpacelensd(apiSidecar);
    },
  };
}
