import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { caseVariantKeyCollisions, duplicateJsonKeys } from './verify-plugin.mjs';

test('重复键：顶层、嵌套对象、数组元素都能抓到', () => {
  assert.deepEqual(duplicateJsonKeys('{"a":1,"a":2}'), ['a']);
  assert.deepEqual(duplicateJsonKeys('{"a":{"b":1,"b":2}}'), ['a.b']);
  assert.deepEqual(duplicateJsonKeys('{"a":[{"b":1},{"b":2,"b":3}]}'), ['a[1].b']);
});

test('重复键：键名按 JSON 转义还原后比较，字符串内容不参与扫描', () => {
  assert.deepEqual(duplicateJsonKeys('{"a":1,"\\u0061":2}'), ['a']);
  assert.deepEqual(duplicateJsonKeys('{"a":"{\\"a\\":1}","b":"x\\\\","c":"}"}'), []);
  assert.deepEqual(duplicateJsonKeys('{"a":"}{\\"','b":1}'), []);
});

test('无重复时不误报', () => {
  assert.deepEqual(duplicateJsonKeys('{"a":[1,{"b":2}],"c":{"d":3,"e":4}}'), []);
});

test('大小写变体碰撞：minOtoolsVersion/minOToolsVersion 命中（v0.1.3 实证）', () => {
  assert.deepEqual(
    caseVariantKeyCollisions(['minOtoolsVersion', 'minOToolsVersion', 'version']),
    ['minOToolsVersion/minOtoolsVersion'],
  );
  assert.deepEqual(caseVariantKeyCollisions(['displayNameCN', 'displayNameZh', 'version']), []);
});

test('端到端：verify-plugin.mjs 对 v0.1.3 式 manifest 直接拒收', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dup-'));
  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    '{"packid":"x","version":"0.1.0","minOtoolsVersion":"0.9.0","minOToolsVersion":"0.9.9"}',
  );
  const proc = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./verify-plugin.mjs', import.meta.url)), dir],
    { encoding: 'utf8' },
  );
  assert.equal(proc.status, 1);
  assert.match(proc.stderr, /仅大小写不同/);
});
