/** 宿主能力适配：选目录 / 打开文件夹 / sidecar spawn；浏览器模式优雅降级。 */
import { pickDirectory } from 'otools-plugin-sdk/dialog';
import { getOtoolsApi } from 'otools-plugin-sdk/runtime';
import type { SidecarApi } from 'otools-plugin-sdk';
import { connectSpacelensd, type SidecarConnection } from './service.ts';

type HostApi = Record<string, unknown> & {
  sidecar?: SidecarApi;
  pickFiles?: (options: unknown) => Promise<unknown>;
  shellOpenPath?: (path: string) => void | Promise<void>;
};

interface DirectoryHandleLike {
  path?: string;
  _otools_path?: string;
  name?: string;
}

/** 宿主 handle 的目录路径在 _otools_path（FileSystemHandle 内部字段），标准环境可能在 path。 */
function extractPath(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const handle = value as DirectoryHandleLike;
  for (const key of ['path', '_otools_path'] as const) {
    const candidate = handle[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function isAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /abort|cancel/i.test(error.message);
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
  const hostWindow = window as unknown as {
    showDirectoryPicker?: (options?: { title?: string }) => Promise<unknown>;
    chooseFileSystemEntries?: (options?: {
      type?: string;
      title?: string;
    }) => Promise<unknown>;
  };

  return {
    kind: isOtools ? 'otools' : 'browser',
    hasSidecar: Boolean(isOtools && api?.sidecar?.spawn),
    async pickFolder() {
      // 1) 宿主 preload 注入的原生目录选择器（唯一能正确弹出「选文件夹」的入口）。
      if (typeof hostWindow.showDirectoryPicker === 'function') {
        try {
          return extractPath(
            await hostWindow.showDirectoryPicker({ title: '选择要分析的文件夹' }),
          );
        } catch (error) {
          if (isAbort(error)) return null; // 用户主动取消
        }
      }
      // 2) chooseFileSystemEntries 是同一能力的旧名，部分宿主版本只暴露它。
      if (typeof hostWindow.chooseFileSystemEntries === 'function') {
        try {
          return extractPath(
            await hostWindow.chooseFileSystemEntries({ type: 'open-directory', title: '选择要分析的文件夹' }),
          );
        } catch (error) {
          if (isAbort(error)) return null;
        }
      }
      // 3) SDK / Tauri 文件对话框兜底；注意 otools.pickFiles 不支持 directory 选项，
      //    因此这里只走 SDK 的 pickDirectory（其 shim 会调系统的目录选择框）。
      try {
        return await pickDirectory({ title: '选择要分析的文件夹' });
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
      const apiSidecar = api?.sidecar;
      if (!apiSidecar?.spawn) {
        throw new Error('当前宿主不支持 sidecar，需要 OTools 0.9.8+。');
      }
      return await connectSpacelensd(apiSidecar);
    },
  };
}
