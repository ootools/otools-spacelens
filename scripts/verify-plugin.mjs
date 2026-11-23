/**
 * 校验 .oplg 发布包（otools-aigv/scripts/verify-plugin.py 的 node 版）。
 * ------------------------------------------------------------------
 * 检查：摘要清单、包内 plugin.json 合法性、ZIP 结构与 CRC、
 * entry 与 logo.svg 是否在包里、以及「正式包不能启用开发模式」。
 *
 * 用法：node scripts/verify-plugin.mjs [dist-pack]
 */
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(root, process.argv[2] || 'dist-pack');

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const ok = (message) => console.log(`✓ ${message}`);

/** 最小 ZIP 读取器：走中央目录，逐个条目解压并核对 CRC32 */
function readZip(buffer) {
  // EOCD：从尾部往前找 0x06054b50
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65535; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是合法的 ZIP：找不到 EOCD');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`中央目录项 #${i} 签名异常`);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`本地头签名异常：${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = compressedSize === uncompressedSize && crc === 0 && uncompressedSize === 0
      ? Buffer.alloc(0)
      : (() => {
          try {
            return inflateRawSync(raw);
          } catch {
            // method 0（存储）时无需解压
            return Buffer.from(raw);
          }
        })();
    entries.push({ name, crc, data, compressedSize, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const crc32 = (buffer) => {
  // 与 node:zlib 的 crc32 一致（pack-plugin.mjs 打包时用的就是它）
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
};

/**
 * 扫描 JSON 文本里的重复对象键（同一层级、同一拼写出现两次及以上）。
 * JSON.parse 会静默丢弃重复键（后值覆盖前值），而宿主 serde 遇到已知字段
 * 的重复直接报「duplicate field」拒收，所以打包前必须按 serde 的口径自查。
 * 返回重复键的层级路径（按首次出现顺序，如 a[1].b）。
 */
export function duplicateJsonKeys(text) {
  const duplicates = [];
  // 栈里每个容器：isObject、已见键、路径前缀、对象层的最近键、数组层的元素下标（=已见逗号数）
  const stack = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        // 刚结束的字符串是不是键：当前容器是对象，且其后（跳过空白）紧跟 ':'
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        const top = stack[stack.length - 1];
        if (top?.isObject && text[j] === ':') {
          // 键名按 JSON 转义还原后再比较（"\u0061" 与 "a" 是同一个键）
          const key = JSON.parse(text.slice(stringStart, i + 1));
          const where = top.prefix ? `${top.prefix}.${key}` : key;
          if (top.keys.has(key)) {
            if (!duplicates.includes(where)) duplicates.push(where);
          } else {
            top.keys.add(key);
            top.lastKey = key;
          }
        }
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      escaped = false;
      stringStart = i;
      continue;
    }
    if (ch === '{' || ch === '[') {
      const parent = stack[stack.length - 1];
      const prefix = !parent ? ''
        : parent.isObject && parent.lastKey
          ? (parent.prefix ? `${parent.prefix}.${parent.lastKey}` : parent.lastKey)
          : parent.isObject ? parent.prefix
            : `${parent.prefix}[${parent.commas}]`;
      stack.push({ isObject: ch === '{', keys: new Set(), prefix, lastKey: null, commas: 0 });
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      continue;
    }
    if (ch === ',') {
      const top = stack[stack.length - 1];
      top.commas += 1;
      if (top.isObject) top.lastKey = null;
    }
  }
  return duplicates;
}

/**
 * 顶层键里仅大小写不同的碰撞。宿主 serde 的字段别名常是大小写变体
 * （minOToolsVersion/minOtoolsVersion、displayNameCN/displayNameZh 等），
 * 两种拼写并存会被当成同一字段的重复而拒收——v0.1.3 实证。返回 "A/B" 描述。
 */
export function caseVariantKeyCollisions(keys) {
  const byLower = new Map();
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, new Set());
    byLower.get(lower).add(key);
  }
  const collisions = [];
  for (const spellings of byLower.values()) {
    if (spellings.size > 1) collisions.push([...spellings].sort().join('/'));
  }
  return collisions.sort();
}

function main() {
  if (!fs.existsSync(directory)) fail(`目录不存在：${directory}`);

  const manifestPath = path.join(directory, 'plugin.json');
  if (!fs.existsSync(manifestPath)) fail('缺少 plugin.json');
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  // JSON.parse 会静默丢弃重复键（后值覆盖前值），宿主 serde 则直接拒收；
  // v0.1.3 实证 minOtoolsVersion/minOToolsVersion 并存导致装包失败而 CI 全绿。
  const dups = duplicateJsonKeys(manifestText);
  if (dups.length) fail(`plugin.json 有重复键：${dups.join('、')}（宿主 serde 报 duplicate field 拒收）`);
  const manifest = JSON.parse(manifestText);
  const collisions = caseVariantKeyCollisions(Object.keys(manifest));
  if (collisions.length) {
    fail(`plugin.json 顶层键仅大小写不同：${collisions.join('、')}（serde 把大小写别名当同一字段，装包必挂 duplicate field）`);
  }

  const { packid, version } = manifest;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packid || '')) fail(`packid 非法：${packid}`);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version || '')) fail(`version 非法：${version}`);
  ok(`plugin.json 合法：${packid}@${version}`);

  // 摘要清单必须刚好覆盖这三个文件
  const sumsPath = path.join(directory, 'SHA256SUMS');
  if (!fs.existsSync(sumsPath)) fail('缺少 SHA256SUMS');
  // 包文件名：主包 <packid>-<version>.oplg；分平台/分架构包从 meta.json 的
  // output 取真实文件名（如 <packid>-<version>-macos.oplg），与 otools-fileshare 一致。
  let filename = `${packid}-${version}.oplg`;
  const metaPath = path.join(directory, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const outputName = path.basename(String(meta.output || ''));
      if (outputName.endsWith('.oplg')) filename = outputName;
    } catch {
      // meta.json 损坏时回退主包名，后面的 SHA256SUMS/CRC 校验会兜住
    }
  }
  const expected = new Set([filename, 'plugin.json', 'logo.svg']);
  const checksums = new Map();
  for (const line of fs.readFileSync(sumsPath, 'utf8').split('\n').filter(Boolean)) {
    const [digest, name] = line.split('  ');
    if (!/^[0-9a-f]{64}$/.test(digest) || !expected.has(name) || checksums.has(name)) fail(`摘要清单无效：${line}`);
    checksums.set(name, digest);
  }
  if (checksums.size !== expected.size) fail('摘要清单不完整或混入其他版本');
  for (const [name, digest] of checksums) {
    const actual = createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
    if (actual !== digest) fail(`摘要不匹配：${name}`);
  }
  ok(`SHA256SUMS 覆盖 ${checksums.size} 个文件且全部匹配`);

  // 正式包不能启用开发模式
  if (manifest.devUrl) fail('正式包不能启用开发模式（devUrl）');
  if (manifest.quickDev) fail('正式包不能启用开发模式（quickDev）');
  ok('已去除 devUrl / quickDev');

  // ZIP 结构与 CRC
  const oplg = path.join(directory, filename);
  const entries = readZip(fs.readFileSync(oplg));
  const names = entries.map((e) => e.name);
  if (names.length !== new Set(names).size) fail('ZIP 含重复文件');
  for (const name of names) {
    if (name.includes('\\')) fail(`ZIP 路径含反斜杠：${name}`);
    const pure = path.posix.normalize(name);
    if (pure.startsWith('/') || pure.split('/').includes('..')) fail(`ZIP 路径非法：${name}`);
  }
  for (const entry of entries) {
    const actual = crc32(entry.data);
    if (actual !== entry.crc) fail(`CRC 校验失败：${entry.name}`);
    if (entry.data.length !== entry.uncompressedSize) fail(`解压后大小不符：${entry.name}`);
  }
  ok(`ZIP ${entries.length} 个条目，CRC 全部通过`);

  // 包内 plugin.json 必须与目录里这份一致（防陈旧打包或手工改动只改了一处）
  const embeddedManifest = entries.find((e) => e.name === 'plugin.json');
  if (!embeddedManifest) fail('ZIP 缺少 plugin.json');
  if (embeddedManifest.data.toString('utf8') !== manifestText) fail('包内 plugin.json 与 dist-pack 目录的不一致（陈旧打包或手工改动）');
  ok('包内 plugin.json 与目录一致');

  if (!names.includes(String(manifest.entry))) fail(`ZIP 缺少入口：${manifest.entry}`);
  if (!names.includes('logo.svg')) fail('ZIP 缺少 logo.svg');
  ok(`入口 ${manifest.entry} 与 logo.svg 都在包内`);

  // sidecar 二进制：meta.json 声明了打包的平台，包内必须有
  // 对应后缀的 bin/<bin>-<suffix>[.exe]。
  let meta = null;
  try {
    meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  } catch {
    // meta.json 损坏时跳过支持标志核对，文件存在性检查仍然兜底
  }
  const packedPlatforms = Array.isArray(meta?.platforms) ? meta.platforms : [];
  if (Array.isArray(manifest.sidecars) && manifest.sidecars.length) {
    const missing = [];
    for (const suffix of packedPlatforms) {
      const os = suffix.startsWith('windows') ? 'win32' : suffix.startsWith('linux') ? 'linux' : 'darwin';
      const ext = os === 'win32' ? '.exe' : '';
      for (const sidecar of manifest.sidecars) {
        const bin = `bin/${sidecar.bin}-${suffix}${ext}`;
        if (!names.includes(bin)) missing.push(bin);
      }
    }
    if (missing.length) fail(`包内缺少 sidecar 文件：${missing.join('、')}`);
    ok(`sidecar 齐全（平台：${packedPlatforms.join(', ') || '（meta.json 缺失，跳过）'}）`);
    // 元数据里的平台支持标志必须如实（uniplayer 先例：仅打包 macOS 就不能报全平台支持）
    if (meta?.support) {
      const expect = {
        supportMacos: packedPlatforms.some((p) => p.startsWith('macos')),
        supportWindows: packedPlatforms.some((p) => p.startsWith('windows')),
        supportLinux: packedPlatforms.some((p) => p.startsWith('linux')),
      };
      for (const [key, value] of Object.entries(expect)) {
        if (Boolean(meta.support[key]) !== value) fail(`meta.json 的 ${key} 与实际打包平台不符（应如实上报）`);
      }
      ok('平台支持标志与实际打包平台一致');
    }
  }

  // 入口 HTML 必须是 dist/ 下那份（防止打包到陈旧产物）
  const entryData = entries.find((e) => e.name === manifest.entry).data.toString('utf8');
  if (!/otools/i.test(entryData)) fail('入口 HTML 里没有 OTools 宿主桥（应包含 window.otools 或 window.otoolsPlugin）');
  ok('入口 HTML 含 OTools 宿主桥');

  const wasm = entries.filter((e) => e.name.endsWith('.wasm'));
  // 纯前端插件（web 模式）没有 wasm 是正常的；wasm 插件请在 plugin.json 设 "wasm": true 来强制校验。
  if (manifest.wasm === true) {
    if (wasm.length === 0) fail('manifest.wasm=true 但包内没有 .wasm');
    ok(`wasm 产物：${wasm.map((e) => `${e.name} ${(e.data.length / 1048576).toFixed(1)}MB`).join(', ')}`);
  } else if (wasm.length === 0) {
    console.log('⚠ 包内没有 .wasm（纯前端插件可忽略；wasm 插件请在 plugin.json 设 "wasm": true）');
  } else {
    ok(`wasm 产物：${wasm.map((e) => `${e.name} ${(e.data.length / 1048576).toFixed(1)}MB`).join(', ')}`);
  }

  console.log(`\n${filename} 校验通过（${entries.length} 个条目）。`);
}

// 被 node --test 导入时不执行（与 publish-market.mjs 的入口守卫一致）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
