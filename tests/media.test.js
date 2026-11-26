'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sessionArchive(copy = async () => {}) {
  const context = {window:{}, Blob, URL, crypto:globalThis.crypto};
  vm.runInNewContext(fs.readFileSync(require.resolve('../prototype/media.js'), 'utf8'), context);
  return context.window.createClipboardArchive(copy);
}

test('keeps the latest 100 captures in insertion order, apart from examples', async () => {
  const archive = sessionArchive();
  for (let i=0; i<105; i++) await archive.add({type:'text', text:'记录' + i});
  const entries = await archive.list();
  assert.equal(entries.length, 103);
  assert.equal(entries[0].text, '记录104');
  assert.equal(entries[99].text, '记录5');
  assert.equal(entries.filter(entry => entry.isDemo).length, 3);
  assert.equal(archive.persistent, false);
});

test('restoring text uses the exact contents and does not duplicate a history entry', async () => {
  let copied;
  const archive = sessionArchive(text => { copied = text; });
  const item = await archive.add({type:'text', text:' 复核\n原输出 \n'});
  await archive.copy(item);
  assert.equal(copied, ' 复核\n原输出 \n');
  assert.equal((await archive.list()).filter(entry => !entry.isDemo).length, 1);
  await archive.remove(item.id);
  assert.ok((await archive.list()).every(entry => entry.isDemo));
});
