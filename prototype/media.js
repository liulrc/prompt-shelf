'use strict';

window.createClipboardArchive = function createClipboardArchive(copyText) {
  const MAX_ITEMS = 100;
  const MAX_BYTES = 64 * 1024 * 1024;
  const storeName = 'items';
  const memory = new Map();
  const urls = new Map();
  const listeners = new Set();
  let connection;
  let bus;
  let persistent = true;

  // Samples never occupy the user's history quota or overwrite the system clipboard.
  const samples = [
    {id:'demo-note', type:'text', title:'分镜修改意见', text:'镜头从山脊向右缓移，保留四分之一画面给天空。', source:'示例文本', filename:'', mime:'text/plain', createdAt:'2026-11-25T09:45:00+08:00'},
    {id:'demo-palette', type:'image', title:'山野配色参考', source:'示例图片', filename:'山野配色.png', mime:'image/png', url:window.PALETTE_SAMPLE, thumbUrl:window.PALETTE_SAMPLE, createdAt:'2026-11-25T09:42:00+08:00'},
    {id:'demo-motion', type:'video', title:'山脊横移分镜', source:'示例视频', filename:'山脊横移.mp4', mime:'video/mp4', url:'prototype/assets/ridge-motion.mp4', thumbUrl:'prototype/assets/ridge-poster.jpg', size:13929, createdAt:'2026-11-25T09:40:00+08:00'}
  ].map(item => ({text:'', size:0, url:'', thumbUrl:'', ...item, isDemo:true}));

  function database() {
    if (!connection) {
      connection = new Promise(resolve => {
        let request;
        try { request = indexedDB.open('prompt-shelf-clipboard', 1); }
        catch { persistent = false; resolve(null); return; }
        request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath:'id'});
        request.onerror = () => { persistent = false; resolve(null); };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); connection = undefined; };
          resolve(db);
        };
      });
    }
    return connection;
  }
  function plainEntry(record) {
    const {blob, thumbnail, ...metadata} = record;
    const objectURL = (key, file) => {
      if (!file) return '';
      if (!urls.has(key)) urls.set(key, URL.createObjectURL(file));
      return urls.get(key);
    };
    return {...metadata, isDemo:false,
      get url() { return objectURL(record.id, blob); },
      get thumbUrl() { return objectURL(record.id + '-thumb', thumbnail); }
    };
  }
  function pruneRecords(records) {
    let bytes = 0;
    let count = 0;
    const expired = [];
    for (const row of records.sort((a,b) => b.order - a.order)) {
      bytes += row.size + (row.thumbnail?.size || 0);
      if (++count > MAX_ITEMS || bytes > MAX_BYTES) expired.push(row.id);
    }
    return expired;
  }
  function freeUrls(id) {
    for (const key of [id, id+'-thumb']) {
      if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
      urls.delete(key);
    }
  }
  function signal() { for (const fn of listeners) fn(); }
  function connectBus() {
    if (bus || typeof BroadcastChannel !== 'function') return;
    try {
      bus = new BroadcastChannel('prompt-shelf-clipboard-updates');
      bus.onmessage = e => { for (const id of e.data?.expired || []) freeUrls(id); signal(); };
    } catch { /* Some file origins disallow communication across pages. */ }
  }
  async function persist(record) {
    const db = await database();
    let expired;
    if (!db) {
      record.order = Math.max(0, ...Array.from(memory.values(), row => row.order)) + 1;
      memory.set(record.id, record);
      expired = pruneRecords([...memory.values()]);
      for (const id of expired) memory.delete(id);
    } else {
      expired = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const current = store.getAll();
        let obsolete = [];
        current.onsuccess = () => {
          record.order = Math.max(0, ...current.result.map(row => row.order)) + 1;
          obsolete = pruneRecords([...current.result, record]);
          for (const id of obsolete) store.delete(id);
          store.put(record);
        };
        tx.oncomplete = () => resolve(obsolete);
        tx.onabort = () => reject(new Error('浏览器存储空间不足或写入被拒绝，本条未归档。'));
      });
    }
    for (const id of expired) freeUrls(id);
    connectBus();
    bus?.postMessage({expired});
    signal();
  }
  async function remove(id) {
    if (samples.some(row => row.id === id)) throw new Error('示例记录随原型提供。');
    const db = await database();
    if (db) {
      await new Promise((resolve,reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(new Error('移除记录失败，请重试。'));
      });
    } else memory.delete(id);
    freeUrls(id);
    connectBus();
    bus?.postMessage({expired:[id]});
    signal();
  }
  async function list() {
    const db = await database();
    const records = !db ? [...memory.values()] : await new Promise((resolve,reject) => {
      const req = db.transaction(storeName).objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('读取剪贴板历史失败，请重新打开。'));
    });
    records.sort((a,b) => b.order - a.order);
    return [...records.map(plainEntry), ...samples];
  }

  async function withDecodedMedia(blob, callback) {
    const video = blob.type.startsWith('video/');
    const el = document.createElement(video ? 'video' : 'img');
    const url = URL.createObjectURL(blob);
    try {
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => finish(false), 5000);
        function finish(ok) {
          clearTimeout(timer);
          el.onload = el.onloadeddata = el.onseeked = el.onerror = null;
          if (ok) resolve(); else reject(new Error('浏览器无法解码这个媒体文件。'));
        }
        el.onerror = () => finish(false);
        if (video) {
          el.preload = 'auto';
          el.muted = true;
          el.playsInline = true;
          el.onloadeddata = () => {
            if (el.duration > 0.15 && Number.isFinite(el.duration)) {
              el.onseeked = () => finish(true);
              el.currentTime = Math.min(1, el.duration * .2);
            } else finish(true);
          };
        } else el.onload = () => finish(true);
        el.src = url;
      });
      return await callback(el, video ? el.videoWidth : el.naturalWidth, video ? el.videoHeight : el.naturalHeight);
    } finally {
      el.removeAttribute('src');
      if (video) el.load();
      URL.revokeObjectURL(url);
    }
  }
  function raster(blob, thumbnail) {
    return withDecodedMedia(blob, (el,width,height) => {
      const scale = thumbnail ? Math.min(1, 320 / Math.max(width,height)) : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (thumbnail) { ctx.fillStyle = '#f6f6ef'; ctx.fillRect(0,0,canvas.width,canvas.height); }
      ctx.drawImage(el,0,0,canvas.width,canvas.height);
      return new Promise((resolve,reject) => canvas.toBlob(result => {
        if (result) resolve(result); else reject(new Error('生成图片失败。'));
      }, thumbnail ? 'image/jpeg' : 'image/png', .8));
    });
  }
  async function add({type, title, text = '', blob, source = '手动加入', filename = ''}) {
    if (!['text','image','video'].includes(type)) throw new Error('请选择文字、图片或视频。');
    if (type === 'text' && !text.trim()) throw new Error('请输入要保存的文字。');
    if (type !== 'text' && !(blob instanceof Blob)) throw new Error('没有可归档的媒体文件。');
    const size = blob?.size ?? new Blob([text]).size;
    if (size > MAX_BYTES) throw new Error('该条目超过网页原型的 64 MiB 容量。');
    let thumbnail;
    if (type !== 'text') {
      try { thumbnail = await raster(blob, true); }
      catch { /* Keep an unsupported file available for downloading and opening externally. */ }
    }
    if (size + (thumbnail?.size || 0) > MAX_BYTES) throw new Error('文件和缩略图合计超过 64 MiB。');
    const now = new Date();
    const id = globalThis.crypto?.randomUUID?.() || now.getTime().toString(36) + Math.random().toString(36).slice(2);
    const record = {id, type, title:title || filename || text.trim().split(/\r?\n/)[0].slice(0,60) || '未命名记录',
      text, source, filename, size, mime:blob?.type || 'text/plain', blob, thumbnail, createdAt:now.toISOString()};
    await persist(record);
    return plainEntry(record);
  }

  async function copy(entry) {
    if (entry.type === 'text') return copyText(entry.text);
    const video = entry.type === 'video';
    if (video && !(globalThis.ClipboardItem?.supports?.(entry.mime) && entry.mime.startsWith('video/'))) {
      throw new Error('当前浏览器不能将视频恢复为可粘贴的文件。可下载视频，文件粘贴由桌面版提供。');
    }
    if (!navigator.clipboard?.write || !globalThis.ClipboardItem) throw new Error('当前浏览器无法写入媒体剪贴板，可先下载文件。');
    const mime = video ? entry.mime : 'image/png';
    const data = fetch(entry.url).then(async response => {
      if (!response.ok) throw new Error('读取媒体失败。');
      const blob = await response.blob();
      return video || blob.type === mime ? blob : raster(blob, false);
    });
    // Pass a promise immediately so writing stays tied to the initiating click (including WebKit).
    try { await navigator.clipboard.write([new ClipboardItem({[mime]:data})]); }
    catch { throw new Error('写入系统剪贴板失败，请检查浏览器权限或下载文件。'); }
  }
  return {add,list,copy,remove, get persistent() { return persistent; },
    subscribe(fn) { listeners.add(fn); connectBus(); return () => listeners.delete(fn); }
  };
};
