import type { CategoryId } from '../types.ts';

export interface CategoryMeta {
  id: CategoryId;
  labelKey: string;
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'images', labelKey: 'categoryImages', color: '#4ea1ff' },
  { id: 'video', labelKey: 'categoryVideo', color: '#f2a93b' },
  { id: 'audio', labelKey: 'categoryAudio', color: '#7bd88f' },
  { id: 'docs', labelKey: 'categoryDocs', color: '#c77dff' },
  { id: 'archives', labelKey: 'categoryArchives', color: '#ff8f6b' },
  { id: 'code', labelKey: 'categoryCode', color: '#4dd0e1' },
  { id: 'other', labelKey: 'categoryOther', color: '#9aa5b1' },
  { id: 'folders', labelKey: 'categoryFolders', color: '#6b7c93' },
];

const EXT_MAP: Record<string, CategoryId> = {};
const assign = (category: CategoryId, extensions: string[]) => {
  for (const extension of extensions) EXT_MAP[extension] = category;
};
assign('images', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'avif']);
assign('video', ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', 'ts']);
assign('audio', ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'ape']);
assign('docs', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'epub', 'rtf', 'csv']);
assign('archives', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'zst']);
assign('code', ['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'php', 'rb', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml', 'yml', 'toml', 'xml', 'sh', 'bash', 'sql', 'vue', 'svelte', 'lock']);

export function categorize(name: string, isDir = false): CategoryId {
  if (isDir) return 'folders';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'other';
  const extension = name.slice(dot + 1).toLowerCase();
  return EXT_MAP[extension] ?? 'other';
}

export function categoryColor(id: CategoryId): string {
  return CATEGORIES.find((category) => category.id === id)?.color ?? '#9aa5b1';
}

export function allCategoryIds(): Set<CategoryId> {
  return new Set(CATEGORIES.map((category) => category.id));
}
