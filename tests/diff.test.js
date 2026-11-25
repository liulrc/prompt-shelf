'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {compare} = require('../prototype/diff');

test('preserves bracket context between independent edits', () => {
  const parts = compare('请阅读【例：甲】并核实。', '请阅读【例：乙】并验证。');
  assert.deepEqual(parts.filter(p => p.type === 'equal').map(p => p.text), ['请阅读【例：', '】并', '。']);
  assert.equal(parts.filter(p => p.type === 'insert').map(p => p.text).join(''), '乙验证');
  assert.equal(parts.filter(p => p.type === 'delete').map(p => p.text).join(''), '甲核实');
});

test('keeps the original sentence ending when appending another line', () => {
  const parts = compare('请先学习。', '请先整理。\n请列出步骤。');
  assert.deepEqual(parts.at(-1), {type:'insert', text:'\n请列出步骤。'});
});

test('does not split complex glyphs when replacing an emoji', () => {
  const parts = compare('作者👩‍💻。', '作者👩‍🎨。');
  assert.deepEqual(parts.filter(p => p.type !== 'equal').map(p => p.text), ['👩‍💻', '👩‍🎨']);
});

test('can reconstruct both versions after deletions and large rewrites', () => {
  for (const [original, current] of [
    ['第一行\n第二行', '第一行'],
    ['旧'.repeat(500) + '【例：可复用的长模板段落保持一致】' + '甲'.repeat(500),
     '新'.repeat(500) + '【例：可复用的长模板段落保持一致】' + '乙'.repeat(500)],
    ['', ''], ['从草稿中移除全部文字。', '']
  ]) {
    const parts = compare(original, current);
    assert.equal(parts.filter(p => p.type !== 'insert').map(p => p.text).join(''), original);
    assert.equal(parts.filter(p => p.type !== 'delete').map(p => p.text).join(''), current);
  }
});
