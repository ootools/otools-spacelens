/**
 * spacelensd 端到端冒烟（无需宿主）：spawn → stdio 握手 → 建 fixture 目录 →
 * POST scan → SSE 收集 batch/done → 校验总大小 → cancel 校验取消事件。
 *
 * 用法：node scripts/smoke-spacelensd.mjs [--bin bin/spacelensd-macos]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const suffix = process.platform === 'darwin'
  ? (process.arch === 'arm64' ? 'macos' : 'macos-intel')
  : process.platform === 'win32' ? 'windows' : 'linux';
const bin = arg('bin', path.join(root, 'bin', `spacelensd-${suffix}`));

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };
const ok = (message) => console.log(`✓ ${message}`);

if (!fs.existsSync(bin)) fail(`spacelensd 不存在：${bin}（先 cargo build --release 并放入 bin/）`);

function connect() {
  const token = [...new Uint8Array(32)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const child = spawn(bin, ['--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const port = new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('handshake timeout')), 15000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const line = buffer.split('\n').find((value) => value.trim());
      if (!line) return;
      try {
        const message = JSON.parse(line);
        if (message.event === 'ready' && message.protocol === 1) {
          clearTimeout(timer);
          resolve(message.port);
        }
      } catch { /* 继续等 */ }
    });
    child.on('exit', (code) => reject(new Error(`spacelensd exited early (${code})`)));
  });
  const initOrigin = 'http://127.0.0.1:9';
  child.stdin.write(`${JSON.stringify({ type: 'init', token, origin: initOrigin })}\n`);
  return { child, token, port, initOrigin };
}

/** 极简 SSE 读取器：按 event/data 块解析，命中 until 就停止。 */
async function readEvents(origin, scanId, token, initOrigin, onEvent, until) {
  const url = `${origin}/api/scan/${scanId}/events?access_token=${token}`;
  const response = await fetch(url, { headers: { Origin: initOrigin } });
  if (!response.ok) throw new Error(`SSE 打开失败：HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        let name = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).replace(/^ /, '');
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        onEvent(name, payload);
        if (until(name, payload)) return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacelens-smoke-'));
  const sizes = { 'a.bin': 1024, 'b.bin': 2048, 'note.txt': 512 };
  for (const [name, size] of Object.entries(sizes)) {
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(size, 7));
  }
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'c.bin'), Buffer.alloc(4096, 3));
  const total = Object.values(sizes).reduce((a, b) => a + b, 0) + 4096;
  return { dir, total, expectedFiles: 4, expectedDirs: 2 };
}

/** 足够大的 fixture，保证 POST scan 后仍有时间窗口执行 cancel。 */
function makeBigFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacelens-cancel-'));
  for (let d = 0; d < 40; d += 1) {
    const sub = path.join(dir, `d${String(d).padStart(2, '0')}`);
    fs.mkdirSync(sub);
    for (let f = 0; f < 100; f += 1) {
      fs.writeFileSync(path.join(sub, `f${String(f).padStart(3, '0')}.bin`), Buffer.alloc(64, 1));
    }
  }
  return dir;
}

async function main() {
  ok(`spacelensd: ${bin}`);
  const fixture = makeFixture();
  ok(`fixture: ${fixture.dir} (${fixture.total} bytes)`);

  const { child, token, port: portPromise, initOrigin } = connect();
  const port = await portPromise;
  const origin = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: initOrigin };
  const call = async (route, body, method) => {
    const response = await fetch(`${origin}${route}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} → HTTP ${response.status}: ${payload.error ?? ''}`);
    return payload;
  };
  ok(`握手成功：${origin}`);

  const { scanId } = await call('/api/scan', { path: fixture.dir });
  if (!scanId) fail('POST /api/scan 未返回 scanId');
  ok(`scanId: ${scanId}`);

  let fileBytes = 0;
  let seenFiles = 0;
  let done = null;
  await readEvents(
    origin, scanId, token, initOrigin,
    (name, payload) => {
      if (name === 'batch') {
        for (const node of payload.nodes) {
          if (!node.is_dir) { fileBytes += node.size; seenFiles += 1; }
        }
      } else if (name === 'done') done = payload;
    },
    (name) => name === 'done' || name === 'error',
  );
  if (!done) fail('未收到 done 事件');
  if (fileBytes !== fixture.total) fail(`batch 文件总大小 ${fileBytes} != ${fixture.total}`);
  if (seenFiles !== fixture.expectedFiles) fail(`文件数 ${seenFiles} != ${fixture.expectedFiles}`);
  if (done.totals.bytes !== fixture.total || done.totals.files !== fixture.expectedFiles) {
    fail(`done.totals 不符：${JSON.stringify(done.totals)}`);
  }
  ok(`扫描完成：${seenFiles} 文件 / ${done.totals.dirs} 目录 / ${fileBytes} 字节`);

  const snapshot = await call(`/api/scan/${scanId}/snapshot`);
  if (snapshot.status !== 'done') fail(`snapshot 状态应为 done，实际 ${snapshot.status}`);
  ok('snapshot 状态正确');

  // 取消：大 fixture 保证扫描尚未结束时就有时间窗口取消。
  const bigDir = makeBigFixture();
  const second = await call('/api/scan', { path: bigDir });
  const cancelResult = await call(`/api/scan/${second.scanId}/cancel`, {}, 'POST');
  if (cancelResult.ok !== true) fail('cancel 端点未返回 ok');
  let sawCancelled = false;
  await readEvents(
    origin, second.scanId, token, initOrigin,
    (name) => { if (name === 'cancelled') sawCancelled = true; },
    (name) => name === 'cancelled',
  ).catch(() => {});
  const snapshot2 = await call(`/api/scan/${second.scanId}/snapshot`);
  if (snapshot2.status !== 'cancelled') fail(`取消后状态应为 cancelled，实际 ${snapshot2.status}`);
  if (!sawCancelled) fail('未读到 cancelled 事件');
  ok('取消流程正确');

  child.kill('SIGTERM');
  fs.rmSync(fixture.dir, { recursive: true, force: true });
  fs.rmSync(bigDir, { recursive: true, force: true });
  console.log('\n✓ spacelensd 冒烟通过');
}

main().catch((error) => {
  console.error(`✗ ${error.stack ?? error.message}`);
  process.exit(1);
});
