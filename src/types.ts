export type CategoryId =
  | 'images'
  | 'video'
  | 'audio'
  | 'docs'
  | 'archives'
  | 'code'
  | 'other'
  | 'folders';

/** 扫描服务推送的原始节点（snake_case 与 Rust serde 对齐）。 */
export interface RawScanNode {
  id: number;
  parent_id: number | null;
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime?: number | null;
}

export interface ScanTotals {
  files: number;
  dirs: number;
  bytes: number;
  scanned: number;
}

export interface ScanNode {
  id: number;
  parentId: number | null;
  name: string;
  path: string;
  isDir: boolean;
  ownSize: number;
  totalSize: number;
  mtime: number | null;
  category: CategoryId;
  parent: ScanNode | null;
  children: ScanNode[];
}

export interface TreeStore {
  root: ScanNode | null;
  nodes: Map<number, ScanNode>;
  totals: ScanTotals;
  /** 已创建但父节点尚未到达、大小还未冒泡的文件 id。 */
  pending: Set<number>;
  /** 父节点晚到、尚未挂到树上的节点 id。 */
  orphans: Set<number>;
}

export interface FilterState {
  enabled: Set<CategoryId>;
  minSizeBytes: number;
  nameQuery: string;
  isolateMatches: boolean;
}

export interface WarningEvent {
  path: string | null;
  kind: 'permission' | 'io' | string;
  message: string;
}
