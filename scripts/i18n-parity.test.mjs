/**
 * i18n 全语种一致性校验（node --test scripts/i18n-parity.test.mjs）。
 * ------------------------------------------------------------------
 * 8 个 locale 文件必须满足：
 *   1. key 集合完全一致（en-US 为基准，缺 key / 多 key 都算失败）；
 *   2. key 顺序一致（差异只允许出现在值上，方便 diff 审阅翻译）；
 *   3. 每个值的 {placeholder} 变量名与基准一致（插值错位会显示原始占位符）；
 *   4. 值非空字符串。
 * 新增 key 时必须同步 8 个文件；本测试是打包前最后一道保险。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const i18nDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'i18n');
const LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'ru-RU', 'es-ES', 'ar-SA'];

const PLACEHOLDER = /\{(\w+)\}/g;

function load(locale) {
  const file = path.join(i18nDir, `${locale}.json`);
  assert.ok(fs.existsSync(file), `缺少 locale 文件：${locale}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function placeholders(value) {
  return [...String(value).matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

const base = load('en-US');
const baseKeys = Object.keys(base);

test('宿主标准 8 语种文件齐全', () => {
  for (const locale of LOCALES) {
    assert.ok(fs.existsSync(path.join(i18nDir, `${locale}.json`)), `缺 ${locale}`);
  }
});

test('所有语种 key 集合与顺序和 en-US 一致', () => {
  for (const locale of LOCALES) {
    const messages = load(locale);
    const keys = Object.keys(messages);
    assert.deepEqual(keys, baseKeys, `${locale} 的 key 集合/顺序与 en-US 不一致`);
  }
});

test('所有语种值非空且占位符变量一致', () => {
  for (const locale of LOCALES) {
    const messages = load(locale);
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, 'string', `${locale}.${key} 必须是字符串`);
      assert.ok(value.trim().length > 0, `${locale}.${key} 是空字符串`);
      assert.deepEqual(
        placeholders(value),
        placeholders(base[key]),
        `${locale}.${key} 的 {placeholder} 与 en-US 不一致`,
      );
    }
  }
});

test('key 使用 lowerCamelCase', () => {
  for (const key of baseKeys) {
    assert.match(key, /^[a-z][a-zA-Z0-9]*$/, `key 不符合 lowerCamelCase：${key}`);
  }
});

test('RTL 语种（ar-SA）存在且文案方向由运行时决定（键集合无例外）', () => {
  const arabic = load('ar-SA');
  assert.equal(Object.keys(arabic).length, baseKeys.length);
});
