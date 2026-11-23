/**
 * 打包插件为 .oplg（与 otools/scripts/plugin_pack.py 的产物格式一致）。
 * ------------------------------------------------------------------
 * `.oplg` 是一个 ZIP，内含 plugin.json、logo.svg 与 dist/。宿主用
 * `park_install_offline_plugin`（插件仓库里的「本地安装」）装它。
 * 扁平结构（plugin.json 在 ZIP 根）与「单一顶层目录」两种布局宿主都认，
 * 这里用扁平。
 *
 * 本插件带 **native sidecar**（spacelensd 扫描服务），所以：
 *   - bin/ 里按平台后缀收集二进制（spacelensd-macos / spacelensd-windows.exe …），
 *     宿主安装时按当前平台挑选；meta.json 如实记录打包了哪些平台；
 *   - 生产清单去掉开发期配置（devUrl / quickDev），否则 OTools 的正式包
 *     校验会以「正式包不能启用开发模式」拒收。
 *
 * 用法：node scripts/pack-plugin.mjs [--platforms macos,macos-intel] [--dev]
 *       [--out dist-pack] [--version 0.1.0]
 *   --platforms  要打包的平台后缀列表（默认当前平台）
 *   --dev        开发模式：跳过二进制架构校验，输出文件名带 -dev-<suffix>
 * ------------------------------------------------------------------
 */
import { deflateRawSync, crc32 } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { currentPlatform, binaryName, verifyExecutable, collectFiles } from './package-common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

/** 平台后缀 → 市场支持标志组 */
export const SUPPORT_FIELDS = {
  macos: 'supportMacos',
  'macos-intel': 'supportMacos',
  windows: 'supportWindows',
  'windows-arm': 'supportWindows',
  linux: 'supportLinux',
  'linux-arm': 'supportLinux',
};

export function supportFlags(platforms) {
  const flags = { supportMacos: false, supportWindows: false, supportLinux: false };
  for (const platform of platforms) {
    const field = SUPPORT_FIELDS[platform];
    if (!field) throw new Error(`未知平台后缀：${platform}`);
    flags[field] = true;
  }
  return flags;
}

/** 生产清单：去掉开发期配置（正式包不能启用开发模式）。 */
export function productionManifest(manifest, version = '') {
  const next = version || String(manifest.version || '').trim();
  const entry = manifest.entry;
  if (typeof entry !== 'string' || !entry || entry.startsWith('/') || entry.includes('\\') || entry.includes(':')) {
    throw new Error('插件 entry 必须是包内相对路径');
  }
  if (entry.split('/').some((part) => !part || part === '..' || part === '.')) {
    throw new Error(`插件 entry 含非法路径段：${entry}`);
  }
  if (!Array.isArray(manifest.sidecars) || !manifest.sidecars.length) {
    throw new Error('本插件必须声明 sidecars（spacelensd 扫描服务）');
  }
  for (const sidecar of manifest.sidecars) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(sidecar.bin ?? '') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(sidecar.id ?? '')) {
      throw new Error('sidecar 声明非法（id/bin 只允许字母数字与 _-）');
    }
  }
  const result = { ...manifest, version: next };
  delete result.devUrl;
  delete result.quickDev;
  if (result.native && typeof result.native === 'object') {
    result.native = { ...result.native, autoReload: false };
  }
  return result;
}

function main() {
  const dev = flag('dev');
  const platformsArg = arg('platforms', '');
  const platforms = platformsArg
    ? platformsArg.split(',').map((value) => value.trim()).filter(Boolean)
    : [currentPlatform().suffix];
  const unknown = platforms.filter((value) => !(value in SUPPORT_FIELDS));
  if (unknown.length) throw new Error(`未知平台后缀：${unknown.join(', ')}`);

  const source = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const manifest = productionManifest(source, arg('version', source.version));
  const { version, packid } = manifest;

  const outDir = path.join(root, arg('out', 'dist-pack'));
  // 单平台 → 合包命名（<packid>-<version>.oplg，平铺）；多平台 → 每平台一个
  // <packid>-<version>-<suffix>.oplg，放 dist-pack/<suffix>/ 子目录。
  const perPlatform = platforms.length > 1;
  const artifactDir = perPlatform ? path.join(outDir, platforms[0]) : outDir;
  fs.mkdirSync(artifactDir, { recursive: true });

  // 1) 包内 plugin.json（生产清单，版本号与文件名一致）
  const entries = [{ name: 'plugin.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') }];

  // 2) 图标与随包许可
  for (const file of ['logo.svg', 'logo.png', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'UPSTREAM.md']) {
    const full = path.join(root, file);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) entries.push({ name: file, data: fs.readFileSync(full) });
  }

  // 3) 前端产物
  const distDir = path.join(root, 'dist');
  if (!fs.existsSync(distDir)) throw new Error('缺少 dist/（请先执行 npm run build）');
  for (const relative of collectFiles(distDir)) {
    entries.push({ name: `dist/${relative}`, data: fs.readFileSync(path.join(distDir, relative)) });
  }

  // 4) sidecar 二进制：bin/<bin>-<suffix>[.exe]，宿主安装时按平台挑选
  const PLATFORM_TARGETS = {
    macos: { suffix: 'macos', os: 'darwin', arch: 'arm64' },
    'macos-intel': { suffix: 'macos-intel', os: 'darwin', arch: 'x64' },
    windows: { suffix: 'windows', os: 'win32', arch: 'x64' },
    'windows-arm': { suffix: 'windows-arm', os: 'win32', arch: 'arm64' },
    linux: { suffix: 'linux', os: 'linux', arch: 'x64' },
    'linux-arm': { suffix: 'linux-arm', os: 'linux', arch: 'arm64' },
  };
  const sidecarBins = [];
  for (const suffix of platforms) {
    const target = PLATFORM_TARGETS[suffix];
    for (const sidecar of manifest.sidecars) {
      const name = binaryName(sidecar.bin, target);
      const full = path.join(root, 'bin', name);
      if (!fs.existsSync(full)) throw new Error(`缺少平台二进制：bin/${name}（先 cargo build --release 并按后缀放入 bin/）`);
      const bytes = fs.readFileSync(full);
      if (!dev) verifyExecutable(bytes, target);
      entries.push({ name: `bin/${name}`, data: bytes });
      sidecarBins.push(name);
    }
  }

  // 5) 自检：entry 指向的文件必须真的在包里
  const entryFile = String(manifest.entry || '').replace(/^\.?\//, '');
  if (!entries.some((item) => item.name === entryFile)) {
    throw new Error(`manifest.entry 指向的文件不在包内：${entryFile}`);
  }
  if (!entries.some((item) => item.name === 'logo.svg')) {
    throw new Error('插件根目录必须提供 logo.svg');
  }

  const devSuffix = dev ? `-dev-${platforms[0]}` : '';
  const outputName = perPlatform ? `${packid}-${version}-${platforms[0]}${devSuffix}.oplg` : `${packid}-${version}${devSuffix}.oplg`;
  const output = path.join(artifactDir, outputName);

  // 手写 ZIP（不引第三方库，CI 只要有 node 就能打包）
  fs.writeFileSync(output, zipEntries(entries));

  // 发布目录统一扁平结构：oplg + plugin.json + logo.svg + 摘要 + 元信息
  fs.writeFileSync(path.join(artifactDir, 'plugin.json'), entries[0].data);
  fs.copyFileSync(path.join(root, 'logo.svg'), path.join(artifactDir, 'logo.svg'));
  const releaseFiles = [outputName, 'plugin.json', 'logo.svg'];
  const sums = releaseFiles
    .map((name) => `${createHash('sha256').update(fs.readFileSync(path.join(artifactDir, name))).digest('hex')}  ${name}`);
  fs.writeFileSync(path.join(artifactDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  const meta = {
    packid,
    uuid: manifest.uuid,
    version,
    output,
    entries: entries.length,
    totalBytes: entries.reduce((sum, item) => sum + item.data.length, 0),
    mode: dev ? 'development' : 'formal',
    platforms,
    sidecarBins,
    support: supportFlags(platforms),
  };
  fs.writeFileSync(path.join(artifactDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(meta)}\n`);
}

/** DOS 时间戳（ZIP 规范要求） */
function dosTime(date) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() / 2)) & 0xffff;
  const day = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  return { time, day };
}

function zipEntries(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = dosTime(new Date());
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const deflated = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = deflated.length < entry.data.length;
    const payload = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 名称标志
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(now.time, 12);
    dir.writeUInt16LE(now.day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

// 被 node --test 导入时不执行（与 publish-market.mjs 的入口守卫一致）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
