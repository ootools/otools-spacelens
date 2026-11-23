import type { RawScanNode } from '../types.ts';

/** 固定种子的 LCG，保证每次预览的树一致。 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const NAMES: Record<string, string[]> = {
  images: ['photo.jpg', 'scan.png', 'banner.webp', 'cover.jpeg', 'icon.svg'],
  video: ['clip.mp4', 'talk.mov', 'trailer.mkv', 'screen.webm'],
  audio: ['theme.mp3', 'voice.wav', 'book.flac', 'podcast.m4a'],
  docs: ['notes.md', 'report.pdf', 'readme.txt', 'sheet.xlsx', 'slides.pptx'],
  archives: ['bundle.zip', 'backup.7z', 'src.tar.gz', 'image.iso'],
  code: ['index.ts', 'main.rs', 'app.vue', 'util.py', 'style.css', 'build.json'],
  other: ['misc.dat', 'cache.bin', 'data.sqlite', 'unknown.tmp'],
};
const CATEGORY_KEYS = Object.keys(NAMES);
const DIR_NAMES = ['Assets', 'Sources', 'Media', 'Docs', 'Build', 'Archive', 'Notes', 'Library'];

/** 生成 ~400 个节点的确定性合成树，覆盖全部分类与数量级。 */
export function generateMockNodes(seed = 20261123): RawScanNode[] {
  const rand = random(seed);
  const nodes: RawScanNode[] = [];
  let nextId = 0;
  const push = (parent: number | null, name: string, isDir: boolean, size: number) => {
    const id = nextId++;
    nodes.push({
      id,
      parent_id: parent,
      name,
      path: `/Users/demo/Projects/${name}`,
      is_dir: isDir,
      size,
      mtime: Date.now() - Math.floor(rand() * 90) * 86_400_000,
    });
    return id;
  };

  const root = push(null, 'Projects', true, 0);
  for (const dirName of DIR_NAMES) {
    const top = push(root, dirName, true, 0);
    const subCount = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < subCount; s += 1) {
      const sub = push(top, `${dirName}-${s + 1}`, true, 0);
      const fileCount = 5 + Math.floor(rand() * 10);
      for (let f = 0; f < fileCount; f += 1) {
        const category = CATEGORY_KEYS[Math.floor(rand() * CATEGORY_KEYS.length)];
        const names = NAMES[category];
        const name = `${names[Math.floor(rand() * names.length)]}`;
        const base = Math.floor(rand() * 900) + 100;
        const roll = rand();
        const multiplier = roll > 0.97 ? 24_000 : roll > 0.82 ? 1_800 : roll > 0.4 ? 60 : 1;
        push(sub, `${f}-${name}`, false, base * multiplier);
      }
    }
  }
  return nodes;
}
