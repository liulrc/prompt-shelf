'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {createStore, parse} = require('../prototype/model');

const scope = {window: {}};
vm.runInNewContext(readFileSync(require.resolve('../prototype/library.js'), 'utf8'), scope);
const catalog = scope.window.PROMPT_LIBRARY;

test('each built-in category has at least twenty distinct, directly editable templates', () => {
  const categories = ['视频', '文案', '研究', '开发', '办公'];
  assert.deepEqual(new Set(catalog.map(item => item.category)), new Set(categories));
  for (const category of categories) {
    const records = catalog.filter(item => item.category === category);
    assert.ok(records.length >= 20, category);
  }
  for (const field of ['id', 'title', 'body']) {
    assert.equal(new Set(catalog.map(item => item[field])).size, catalog.length, field);
  }
  for (const item of catalog) {
    assert.ok(item.description.trim(), item.id);
    const slots = parse(item.body).filter(part => part.type === 'slot');
    assert.ok(slots.length > 0, item.id);
    for (const slot of slots) {
      assert.ok(slot.raw.startsWith('【例：') && slot.example.trim(), item.id);
    }
    assert.equal(slots.length, [...item.body.matchAll(/【|】/gu)].length / 2, item.id);
  }
});

test('publisher and community sources retain HTTPS links and user examples retain their credit', () => {
  const userIds = new Set(['project-reader', 'deepen-question']);
  for (const item of catalog) {
    assert.ok(item.source.name.trim(), item.id);
    if (userIds.has(item.id)) {
      assert.match(item.source.name, /用户/);
      assert.equal(item.source.url, '');
    } else {
      assert.equal(new URL(item.source.url).protocol, 'https:', item.id);
    }
  }
  assert.ok(catalog.some(item => item.source.url.includes('design.minimax.cn/#creative-showcase')));
  assert.ok(catalog.some(item => item.source.url.includes('prompts.chat/prompts/')));
});

test('saving an edited catalog item creates a separate personal template', () => {
  const store = createStore(null);
  const selected = catalog.find(item => item.id === 'try-on-street');
  const original = selected.body;
  assert.deepEqual(store.listPersonal(), []);
  const copy = store.savePersonal({title: selected.title, body: original + '请给一个雨天备选。', category: selected.category, source: selected.source});
  assert.notEqual(copy.id, selected.id);
  assert.equal(store.listPersonal().length, 1);
  assert.equal(selected.body, original);
  assert.equal(catalog.find(item => item.id === copy.id), undefined);
});
