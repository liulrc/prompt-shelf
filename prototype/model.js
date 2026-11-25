(function (root) {
  'use strict';

  // A slash between short Chinese labels denotes alternatives. Slashes in URLs
  // and file paths generally stay literal; an escaped slash is always literal.
  function readExample(raw) {
    const parts = [''];
    let example = '';
    for (let i = 0; i < raw.length; i += 1) {
      let char = raw[i];
      if (char === '\\' && i + 1 < raw.length && /[\\【】/／]/u.test(raw[i + 1])) {
        char = raw[++i];
      } else if (char === '/' || char === '／') {
        example += char;
        parts.push('');
        continue;
      }
      parts[parts.length - 1] += char;
      example += char;
    }
    const labels = parts.map(part => part.trim());
    const isShortLabel = label => /^[\p{Script=Han}a-zA-Z0-9]{1,16}$/u.test(label)
      && /\p{Script=Han}/u.test(label);
    const options = labels.length > 1 && labels.every(isShortLabel) ? labels : [];
    return {example, options, defaultValue: options.length ? options[0] : example};
  }

  function parse(body) {
    const source = String(body ?? '');
    const tokens = /\\[【】]|【((?:\\[\s\S]|[^\\【】])*)】/gu;
    const segments = [];
    let cursor = 0;
    let slotIndex = 0;
    let rawText = '';
    let displayText = '';
    function appendText(raw, display = raw) {
      rawText += raw;
      displayText += display;
    }
    function flushText() {
      if (rawText) segments.push({type: 'text', text: displayText, raw: rawText});
      rawText = '';
      displayText = '';
    }
    for (const match of source.matchAll(tokens)) {
      appendText(source.slice(cursor, match.index));
      if (match[1] === undefined) {
        appendText(match[0], match[0].slice(1));
      } else {
        flushText();
        const raw = match[1].replace(/^[ \t]*例[ \t]*[:：]/u, '');
        segments.push({type: 'slot', index: slotIndex++, raw: match[0], ...readExample(raw)});
      }
      cursor = match.index + match[0].length;
    }
    appendText(source.slice(cursor));
    flushText();
    return segments;
  }

  function slotValue(segment, values) {
    const value = values?.[segment.index];
    return value == null ? segment.defaultValue : String(value);
  }

  function render(body, values = []) {
    return parse(body).map(segment =>
      segment.type === 'text' ? segment.text : slotValue(segment, values)
    ).join('');
  }

  function encodeValue(value) {
    const escaped = value.replace(/[\\【】]/gu, '\\$&');
    return readExample(escaped).options.length ? escaped.replace(/[/／]/gu, '\\$&') : escaped;
  }

  function templateFromValues(body, values = []) {
    return parse(body).map(segment => {
      if (segment.type === 'text') return segment.raw;
      const value = slotValue(segment, values);
      if (value === segment.defaultValue) return segment.raw;
      if (segment.options.includes(value)) {
        const reordered = [value, ...segment.options.filter(label => label !== value)];
        return '【例：' + reordered.join('/') + '】';
      }
      return '【例：' + encodeValue(value) + '】';
    }).join('');
  }

  const PREFIX = 'prompt-desk:v1:';
  const HISTORY_LIMIT = 100;
  const copy = record => JSON.parse(JSON.stringify(record));

  function uniqueId() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
      + Math.random().toString(36).slice(2);
  }

  function defaultStorage() {
    try { return root.localStorage || null; } catch { return null; }
  }

  function createStore(storage = defaultStorage()) {
    let cache = new Map();

    // Separate keys keep a save in one window from overwriting another
    // window's library or history. The map also supports private/file contexts.
    function refresh() {
      if (!storage) return;
      try {
        const latest = new Map();
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key?.startsWith(PREFIX)) continue;
          let record;
          try { record = JSON.parse(storage.getItem(key)); } catch { continue; }
          if (record && typeof record.id === 'string' && typeof record.title === 'string') {
            latest.set(key, record);
          }
        }
        cache = latest;
      } catch {
        storage = null;
      }
    }

    function records(kind) {
      const prefix = PREFIX + kind + ':';
      const items = [];
      for (const [key, record] of cache) {
        if (key.startsWith(prefix)) items.push(record);
      }
      return items.sort((a, b) => b.order - a.order || b.id.localeCompare(a.id));
    }

    function write(kind, record) {
      const key = PREFIX + kind + ':' + record.id;
      try { storage?.setItem(key, JSON.stringify(record)); } catch { storage = null; }
      cache.set(key, record);
      return copy(record);
    }

    function remove(kind, id) {
      const key = PREFIX + kind + ':' + id;
      try { storage?.removeItem(key); } catch { storage = null; }
      cache.delete(key);
    }

    function listPersonal() {
      refresh();
      return records('personal').map(copy);
    }

    function listHistory() {
      refresh();
      return records('history').slice(0, HISTORY_LIMIT).map(copy);
    }

    function savePersonal(input) {
      if (typeof input?.title !== 'string' || !input.title.trim()) throw new Error('请填写模板名称。');
      if (typeof input.body !== 'string' || !input.body.trim()) throw new Error('请填写模板正文。');
      refresh();
      const items = records('personal');
      const previous = input.id == null ? null : items.find(item => item.id === input.id);
      if (input.id != null && !previous) throw new Error('找不到可替换的个人模板。');
      const source = input.source === undefined ? previous?.source : input.source;
      const now = new Date().toISOString();
      return write('personal', {
        id: previous?.id || 'personal-' + uniqueId(),
        title: input.title.trim(),
        category: String(input.category ?? previous?.category ?? '').trim() || '未分类',
        description: String(input.description ?? previous?.description ?? ''),
        source: source ? {name: String(source.name ?? ''), url: String(source.url ?? '')} : null,
        body: input.body,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        order: (items[0]?.order || 0) + 1,
      });
    }

    function recordUse(input) {
      if (typeof input?.text !== 'string' || !input.text.trim()) throw new Error('没有可使用的提示词。');
      refresh();
      const items = records('history');
      const saved = write('history', {
        id: 'use-' + uniqueId(),
        title: String(input.title ?? '').trim() || '未命名提示词',
        category: String(input.category ?? ''),
        text: input.text,
        templateId: input.templateId ?? null,
        origin: String(input.origin ?? ''),
        usedAt: new Date().toISOString(),
        order: (items[0]?.order || 0) + 1,
      });
      for (const expired of items.slice(HISTORY_LIMIT - 1)) remove('history', expired.id);
      return saved;
    }

    refresh();
    return {listPersonal, listHistory, savePersonal, recordUse, get persistent() { return !!storage; }};
  }

  const api = {parse, render, templateFromValues, createStore, HISTORY_LIMIT};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PromptModel = api;
})(globalThis);
