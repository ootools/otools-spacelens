import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, categoryColor, allCategoryIds } from './categories.ts';

test('categorize maps common extensions and falls back to other', () => {
  assert.equal(categorize('photo.JPG'), 'images');
  assert.equal(categorize('clip.mp4'), 'video');
  assert.equal(categorize('song.flac'), 'audio');
  assert.equal(categorize('notes.docx'), 'docs');
  assert.equal(categorize('bundle.tar.gz'), 'archives');
  assert.equal(categorize('main.ts'), 'code');
  assert.equal(categorize('README'), 'other');
  assert.equal(categorize('weird.xyz'), 'other');
});

test('directories are their own category', () => {
  assert.equal(categorize('anything', true), 'folders');
  assert.equal(categorize('no-extension.mp4', true), 'folders');
});

test('every category has a color', () => {
  for (const id of allCategoryIds()) {
    assert.match(categoryColor(id), /^#[0-9a-f]{6}$/);
  }
});
