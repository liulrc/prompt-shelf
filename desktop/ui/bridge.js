(() => {
  'use strict';
  const mac = window.webkit?.messageHandlers?.desktop;
  const win = window.chrome?.webview;
  const active = window.top === window && Boolean(mac?.postMessage || win?.postMessage);
  const pending = new Map();
  const listeners = new Map();
  const early = new Map();
  let nextId = 0;

  function request(command, payload = {}) {
    if (!active) return Promise.reject(new Error('此操作需要在词匣桌面版中打开。'));
    const id = String(++nextId);
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      try {
        const message = {id, command, payload};
        if (mac) mac.postMessage(message);
        else win.postMessage(message);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }
  function receive(message) {
    if (typeof message === 'string') {
      try { message = JSON.parse(message); } catch { return; }
    }
    if (!message || typeof message !== 'object') return;
    if (message.event) {
      const handlers = listeners.get(message.event);
      if (handlers?.size) handlers.forEach(handler => handler(message.data));
      else if (['route','capture.ready','native.status'].includes(message.event)) early.set(message.event, message.data);
      return;
    }
    const item = pending.get(String(message.id));
    if (!item) return;
    pending.delete(String(message.id));
    if (message.error) item.reject(new Error(message.error.message || String(message.error)));
    else item.resolve(message.result);
  }
  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    if (early.has(event)) {
      const value = early.get(event);
      early.delete(event);
      queueMicrotask(() => handler(value));
    }
    return () => listeners.get(event)?.delete(handler);
  }
  function encode(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('无法读取这份文件。'));
      reader.readAsDataURL(blob);
    });
  }
  function mediaURL(record) {
    if (record?.data && /^(image|video)\/[\w.+-]+$/i.test(record.mime)) {
      return 'data:' + record.mime + ';base64,' + record.data;
    }
    return record?.url || '';
  }
  function archive() {
    return {
      list: () => request('history.list'),
      async detail(entry) {
        if (entry.type === 'text' || entry.url) return entry;
        const result = await request('history.detail', {id:entry.id});
        return {...entry, ...result, url:mediaURL(result)};
      },
      async add({type, title, text, source, filename, blob}) {
        const payload = {type, title, text, source, filename};
        if (blob) {
          if (blob.size > 64 * 1024 * 1024) {
            throw new Error('这份文件超过 64 MiB。可在 Finder 或文件资源管理器中复制原文件，再点击「读取剪贴板」收录文件引用。');
          }
          payload.mime = blob.type;
          payload.data = await encode(blob);
        }
        return request('history.add', payload);
      },
      copy: entry => request('history.copy', {id:entry.id}),
      remove: id => request('history.remove', {id}),
      subscribe: handler => on('history.changed', handler),
      persistent: true
    };
  }
  if (win?.addEventListener) win.addEventListener('message', event => receive(event.data));
  window.PromptDesktop = {active, request, receive, on, encode, mediaURL, archive};
})();
