(() => {
  'use strict';

  const typeNames = {text: '文本', image: '图片', video: '视频'};
  const types = ['all', 'text', 'image', 'video'];
  const clock = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const mimeByExtension = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
    mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
    ogv: 'video/ogg', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv'
  };

  function formattedTime(value) {
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? '' : clock.format(time);
  }

  function sizeLabel(bytes) {
    if (!(bytes > 0)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function matches(entry, query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return true;
    const haystack = [entry.title, entry.text, entry.source, sourceName(entry), entry.filename, typeNames[entry.type]]
      .join(' ').toLocaleLowerCase();
    return normalized.split(/\s+/).every(word => haystack.includes(word));
  }

  function entryName(entry) {
    return entry.title || entry.filename || entry.text?.split('\n')[0] || typeNames[entry.type] || '剪贴记录';
  }

  function sample(entry) {
    return entry.isDemo ? '<span class="cb-sample">示例</span>' : '';
  }
  function sourceName(entry) {
    return entry.isDemo && /^示例(文本|图片|视频)$/.test(entry.source) ? '词匣内置' : entry.source;
  }

  // Sources come from the media store. Limit clickable download URLs to local
  // assets, object URLs, or embedded media, including when restoring old data.
  function localMediaURL(value) {
    if (!value) return '';
    if (/^blob:|^data:(image|video)\//i.test(value)) return value;
    try {
      const url = new URL(value, document.baseURI);
      if (window.PromptDesktop?.active && url.protocol === 'promptmedia:' && url.hostname === 'asset') return url.href;
      if (window.PromptDesktop?.active && url.origin === 'https://media.cixia.local') return url.href;
      return (url.protocol === location.protocol && url.host === location.host &&
        ['http:', 'https:', 'file:'].includes(url.protocol)) ? url.href : '';
    } catch {
      return '';
    }
  }

  function thumbnail(entry, {icon, escape}) {
    const url = localMediaURL(entry.thumbUrl || entry.url);
    let media = '';
    if (entry.type === 'image' && url) media = '<img src="' + escape(url) + '" loading="lazy" alt="">';
    if (entry.type === 'video' && url) {
      media = entry.thumbUrl
        ? '<img src="' + escape(url) + '" loading="lazy" alt="">'
        : '<video src="' + escape(url) + '" muted preload="metadata" playsinline aria-hidden="true"></video>';
    }
    return '<span class="cb-thumb cb-thumb-' + escape(entry.type) + '">' +
      (media || icon(entry.type === 'video' ? 'video' : entry.type === 'image' ? 'eye' : 'text', 18)) + '</span>';
  }

  function entryRow(entry, selected, options, index) {
    const {escape} = options;
    const meta = [typeNames[entry.type], sourceName(entry), formattedTime(entry.createdAt)].filter(Boolean).join(' · ');
    const attr = index === undefined
      ? 'aria-pressed="' + selected + '"'
      : 'role="option" id="cb-option-' + index + '" aria-selected="' + selected + '" tabindex="-1"';
    return '<button type="button" class="cb-row' + (selected ? ' is-selected' : '') + '" ' + attr +
      ' data-cb-id="' + escape(entry.id) + '">' + thumbnail(entry, options) +
      '<span class="cb-row-copy"><strong class="cb-row-title">' + escape(entryName(entry)) +
      '</strong><span class="cb-row-meta">' + escape(meta) + sample(entry) + '</span></span></button>';
  }

  function detailContent(entry, {escape, icon, desktop}) {
    if (!entry) return '<p class="cb-empty">选中一条记录后，可在这里检查完整内容。</p>';
    const url = localMediaURL(entry.url);
    const poster = localMediaURL(entry.thumbUrl);
    let preview = '<p>此记录没有可打开的预览。</p>';
    const text = entry.text || '';
    const previewLimit = 16000;
    if (entry.type === 'text') {
      preview = '<pre>' + escape(text.slice(0, previewLimit)) + '</pre>';
      if (text.length > previewLimit) preview += '<p>长文本只预览开头，复制时保留全文。</p>';
    }
    if (entry.type === 'image' && url) preview = '<img src="' + escape(url) + '" alt="' + escape(entryName(entry)) + '的图片预览">';
    if (entry.type === 'video' && url) preview = '<video src="' + escape(url) + '"' +
      (poster ? ' poster="' + escape(poster) + '"' : '') + ' controls playsinline preload="metadata" aria-label="视频预览"></video>';
    const meta = [typeNames[entry.type], sourceName(entry), formattedTime(entry.createdAt),
      entry.type === 'text' && text.length <= previewLimit ? Array.from(text).length + ' 字符' : sizeLabel(entry.size)].filter(Boolean);
    const download = entry.type === 'text' ? '' : desktop
      ? '<button type="button" class="cb-download" data-cb="export">另存原文件</button>'
      : url ? '<a class="cb-download" download="' + escape(entry.filename || entryName(entry)) + '" href="' + escape(url) + '">下载原文件</a>' : '';
    const removal = entry.isDemo ? '' : '<button type="button" class="cb-remove" data-cb="remove">移除记录</button>';
    return '<div class="cb-detail-inner"><h3>' + escape(entryName(entry)) + '</h3><div class="cb-details-meta">' +
      escape(meta.join(' · ')) + sample(entry) + '</div><div class="cb-preview">' + preview + '</div>' +
      '<div class="cb-details-actions"><button type="button" class="btn gold" data-cb="copy">' + icon('copy', 15) +
      '设为当前剪贴板</button>' + download + removal + '</div></div>';
  }

  function blobType(blob) {
    const ext = String(blob.name || '').split('.').pop().toLowerCase();
    return (blob.type || mimeByExtension[ext] || '').toLowerCase();
  }

  function recordFromBlob(blob, source) {
    const mime = blobType(blob);
    if (!/^(image|video|text)\//.test(mime)) throw new Error('支持文本、图片和视频文件。');
    const type = mime.split('/')[0];
    if (type === 'text') {
      return blob.text().then(text => {
        if (!text) throw new Error('文件中的文字为空。');
        return {type, text, title: blob.name, source};
      });
    }
    const data = mime === blob.type ? blob : blob.slice(0, blob.size, mime);
    return {type, blob: data, filename: blob.name || '', title: blob.name || '导入的' + typeNames[type], source};
  }

  function openClipboardTool({host, icon, escape, notify, media, openShelf, desktop, shelfShortcut, displayKey = value => value, monitoring}) {
    const options = {icon, escape, desktop};
    const shortcut = shelfShortcut || (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌥ ⇧ V' : 'Alt + Shift + V');
    const pasteKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ V' : 'Ctrl + V';
    host.innerHTML = `
      <section class="cb-manager">
        <div class="page-intro"><div><h1>剪贴板管理</h1><p>收集要复用的文字、截图与视频，选中后即可复制。</p></div>
          <button class="btn primary" type="button" data-cb="shelf">${icon('keyboard',16)}快速历史栏 <kbd>${escape(shortcut)}</kbd></button></div>
        <section class="cb-capture" aria-label="收录剪贴内容">
          <div><strong>收录内容</strong><p>在页面空白处按 <kbd>${pasteKey}</kbd> 粘贴，也可将文件拖到这里。</p></div>
          <div class="cb-buttons"><button class="btn" type="button" data-cb="files">${icon('folder',15)}导入文件</button>
            <button class="btn" type="button" data-cb="read">${icon('plus',15)}读取剪贴板</button></div>
          <input type="file" accept="image/*,video/*,text/*,.txt,.md,.csv" multiple hidden data-cb="file-input">
          <div class="cb-native"><span class="cb-recording" data-on="${Boolean(desktop && monitoring)}">${desktop ? (monitoring ? '自动记录已开启' : '自动记录已暂停') : '跨应用自动记录需桌面版'}</span>${desktop ? '<button type="button" class="cb-download" data-cb="settings">管理记录设置</button>' : ''}</div>
        </section>
        <div class="cb-status" role="status" aria-live="polite"></div>
        <div class="cb-toolbar"><div class="filters" role="group" aria-label="按内容类型筛选">
          ${types.map(type => '<button type="button" class="filter-btn' + (type === 'all' ? ' active' : '') +
            '" data-cb-type="' + type + '" aria-pressed="' + (type === 'all') + '">' +
            (type === 'all' ? icon('grid',12) + '全部' : typeNames[type]) + '</button>').join('')}
          </div><label class="cb-search">${icon('search',15)}<input type="search" placeholder="搜索文字、文件名或来源" aria-label="搜索剪贴板记录"></label></div>
        <div class="cb-workbench"><section class="cb-listpane" aria-label="剪贴板记录"><header class="cb-panelhead">
          <span>最近收录</span><span class="count-pill">0</span></header><div class="cb-items"></div></section>
          <section class="cb-detail" aria-label="选中记录的预览"><header class="cb-panelhead">内容预览</header><div class="cb-detail-body"></div></section></div>
        <p class="cb-footnote"></p>
      </section>`;
    const page = host.querySelector('.cb-manager');
    const search = page.querySelector('input[type=search]');
    const files = page.querySelector('input[type=file]');
    const status = page.querySelector('.cb-status');
    const capture = page.querySelector('.cb-capture');
    const detail = page.querySelector('.cb-detail-body');
    let alive = true, version = 0, entries = [], selected = '', filter = 'all', busy = false;
    let detailVersion = 0;
    const current = () => alive && page.isConnected;
    function message(text) { if (current()) status.textContent = text; }

    function render() {
      if (!current()) return;
      const filtered = entries.filter(entry => (filter === 'all' || entry.type === filter) && matches(entry, search.value));
      const active = filtered.find(entry => entry.id === selected) || filtered[0];
      selected = active?.id || '';
      page.querySelector('.count-pill').textContent = filtered.length;
      page.querySelector('.cb-items').innerHTML = filtered.length
        ? filtered.map(entry => entryRow(entry, entry.id === selected, options)).join('')
        : '<p class="cb-empty">' + (entries.length ? '没有匹配的记录，试试其他关键词或类型。' : '粘贴一段文字或导入文件，开始收录。') + '</p>';
      const detailRequest = ++detailVersion;
      function showDetail(entry) {
        if (!current() || detailRequest !== detailVersion) return;
        detail.innerHTML = detailContent(entry, options);
        detail.querySelector('.cb-preview img, .cb-preview video')?.addEventListener('error', event => {
          const note = document.createElement('p');
          note.textContent = desktop ? '此格式无法预览，可另存原文件。' : '此浏览器无法预览该格式，可下载原文件。';
          event.target.replaceWith(note);
        }, {once:true});
      }
      showDetail(active);
      if (active && active.type !== 'text' && !active.url && media.detail) {
        media.detail(active).then(showDetail).catch(error => {
          if (current() && detailRequest === detailVersion) message(error.message);
        });
      }
      page.querySelector('.cb-footnote').textContent =
        (desktop ? '剪贴板历史保存在本机。' : '网页原型仅在当前页面接收粘贴，快捷键仅在词匣窗口内生效。') +
        (media.persistent === false ? '当前浏览器仅在本次会话中保留记录。' : '');
    }

    async function reload() {
      const sequence = ++version;
      try {
        const result = await media.list();
        if (current() && sequence === version) { entries = result; render(); }
      } catch (error) { message(error.message || '读取本地历史失败，请重试。'); }
    }

    async function collect(records) {
      let added = 0, latest = '', errorText = '';
      for (const record of records) {
        try {
          const item = record.blob ? await recordFromBlob(record.blob, record.source) : record;
          const saved = await media.add(item);
          added += 1; latest = saved.id;
        } catch (error) { errorText = error.message || '无法保存此项。'; }
      }
      if (!current()) return;
      if (added) {
        filter = 'all'; search.value = ''; selected = latest;
        updateFilters(); await reload();
      }
      const summary = added ? '已收录 ' + added + ' 条。' : '';
      const issue = errorText ? (records.length > 1 ? '部分内容未导入。' : '') + errorText : '';
      message(summary + issue);
    }

    async function readSystem() {
      if (desktop) {
        busy = true;
        try {
          await desktop.request('clipboard.read'); await reload(); message('已读取当前剪贴板。');
        } catch (error) { message(error.message); }
        finally { busy = false; }
        return;
      }
      const access = navigator.clipboard;
      if (!access?.read && !access?.readText) {
        message('当前浏览器未提供直接读取。请点击页面空白处并按 ' + pasteKey + '，或使用「导入文件」。'); return;
      }
      busy = true;
      const button = page.querySelector('[data-cb="read"]'); button.disabled = true;
      try {
        const records = [];
        if (access.read) {
          for (const item of await access.read()) {
            const mime = item.types.find(type => /^(image|video)\//.test(type)) || item.types.find(type => type === 'text/plain');
            if (!mime) continue;
            const blob = await item.getType(mime);
            if (mime === 'text/plain') {
              const text = await blob.text();
              if (text) records.push({type: 'text', text, source: '系统剪贴板'});
            } else records.push({blob, source: '系统剪贴板'});
          }
        } else {
          const text = await access.readText();
          if (text) records.push({type:'text', text, source:'系统剪贴板'});
        }
        if (!current()) return;
        if (records.length) await collect(records);
        else message('没有读到支持的内容。可直接粘贴文字或图片，也可导入原文件。');
      } catch (error) {
        message(error.name === 'NotAllowedError'
          ? '浏览器未允许读取剪贴板。请点击页面空白处并按 ' + pasteKey + '，或导入文件。'
          : '读取失败。可直接粘贴或导入原文件。');
      } finally { busy = false; button.disabled = false; }
    }

    function updateFilters() {
      page.querySelectorAll('[data-cb-type]').forEach(button => {
        const active = button.dataset.cbType === filter;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
      });
    }

    function importFiles(list, source) {
      if (list.length) void collect(Array.from(list, blob => ({blob, source})));
    }
    function paste(event) {
      if (!current() || document.querySelector('dialog[open]') || event.defaultPrevented ||
          event.target.closest?.('input,textarea,[contenteditable="true"]')) return;
      const data = event.clipboardData;
      if (!data) return;
      const fileList = Array.from(data.files);
      const text = data.getData('text/plain');
      if (!fileList.length && !text) return;
      event.preventDefault();
      if (fileList.length) importFiles(fileList, '页面粘贴');
      else void collect([{type:'text', text, source:'页面粘贴'}]);
    }

    page.addEventListener('click', async event => {
      const row = event.target.closest('[data-cb-id]');
      if (row) {
        selected = row.dataset.cbId; message(''); render();
        Array.from(page.querySelectorAll('[data-cb-id]')).find(button => button.dataset.cbId === selected)?.focus({preventScroll:true});
        return;
      }
      const choice = event.target.closest('[data-cb-type]');
      if (choice) { filter = choice.dataset.cbType; message(''); updateFilters(); render(); return; }
      const button = event.target.closest('button[data-cb]');
      if (!button || button.disabled) return;
      switch (button.dataset.cb) {
        case 'shelf': openShelf(); break;
        case 'settings':
          try { await desktop.request('window.open', {area:'settings'}); } catch (error) { message(error.message); }
          break;
        case 'export': {
          const entry = entries.find(item => item.id === selected);
          if (!entry) break;
          try { await desktop.request('file.save',{id:entry.id,filename:entry.filename || entryName(entry)}); }
          catch (error) { message(error.message); }
          break;
        }
        case 'files': files.click(); break;
        case 'read': if (!busy) await readSystem(); break;
        case 'remove': {
          const entry = entries.find(item => item.id === selected);
          if (!entry || entry.isDemo) break;
          const confirmation = document.createElement('div');
          confirmation.className = 'cb-remove-confirm';
          confirmation.setAttribute('role','group');
          confirmation.setAttribute('aria-label','确认移除记录');
          confirmation.innerHTML = '<p>从历史中移除“' + escape(entryName(entry)) + '”？</p>' +
            '<div class="cb-buttons"><button type="button" class="btn" data-cb="cancel-remove">取消</button>' +
            '<button type="button" class="btn" data-cb="confirm-remove" data-cb-remove-id="' + escape(entry.id) + '">确认移除</button></div>';
          detail.querySelector('.cb-details-actions').replaceWith(confirmation);
          confirmation.querySelector('button').focus();
          break;
        }
        case 'cancel-remove':
          render(); detail.querySelector('[data-cb="remove"]')?.focus(); break;
        case 'confirm-remove': {
          const id = button.dataset.cbRemoveId;
          if (id !== selected || !entries.some(entry => entry.id === id && !entry.isDemo)) break;
          button.disabled = true;
          try {
            await media.remove(id);
            await reload();
            if (current()) { message('已移除这条历史记录。'); search.focus({preventScroll:true}); }
          } catch (error) { button.disabled = false; message(error.message || '移除失败，请重试。'); }
          break;
        }
        case 'copy': {
          const entry = entries.find(item => item.id === selected);
          if (!entry) break;
          button.disabled = true;
          try {
            await media.copy(entry);
            if (current()) { message(''); notify('已复制，可切到目标窗口粘贴。'); }
          } catch (error) { message(error.message || '写入剪贴板失败，请允许浏览器复制后重试。'); }
          finally { button.disabled = false; }
          break;
        }
      }
    });
    search.addEventListener('input', () => { message(''); render(); });
    files.addEventListener('change', () => { importFiles(files.files, '文件导入'); files.value = ''; });
    capture.addEventListener('dragover', event => {
      if (!Array.from(event.dataTransfer.types).includes('Files')) return;
      event.preventDefault(); capture.classList.add('is-dragging');
    });
    capture.addEventListener('dragleave', event => {
      if (!capture.contains(event.relatedTarget)) capture.classList.remove('is-dragging');
    });
    capture.addEventListener('drop', event => {
      event.preventDefault(); capture.classList.remove('is-dragging'); importFiles(event.dataTransfer.files, '拖放导入');
    });
    document.addEventListener('paste', paste);
    const unsubscribe = media.subscribe(reload);
    function applySettings(settings) {
      if (!current() || !settings?.hotkeys) return;
      const status = page.querySelector('.cb-recording');
      status.textContent = settings.monitoring ? '自动记录已开启' : '自动记录已暂停';
      status.dataset.on = String(!!settings.monitoring);
      page.querySelector('[data-cb="shelf"] kbd').textContent = displayKey(settings.hotkeys.shelf);
    }
    const unsubscribeSettings = desktop?.on('settings.changed', applySettings);
    if (desktop) desktop.request('settings.get').then(applySettings).catch(error => message(error.message));
    void reload();
    return () => {
      alive = false; unsubscribe(); unsubscribeSettings?.(); document.removeEventListener('paste', paste);
    };
  }

  function openClipboardShelf({icon, escape, notify, media, onClose}) {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'cb-shelf';
    dialog.setAttribute('aria-labelledby','cb-shelf-title');
    dialog.innerHTML = `<header class="cb-shelf-header"><h2 id="cb-shelf-title">快速历史栏</h2>
      <button type="button" class="cb-shelf-close" aria-label="关闭快速历史栏">${icon('close',16)}</button></header>
      <label class="cb-search">${icon('search',16)}<input type="search" role="combobox" aria-expanded="true" aria-controls="cb-options"
        aria-autocomplete="list" aria-label="搜索剪贴板历史" placeholder="搜索剪贴内容、文件名或来源…" autofocus></label>
      <p class="cb-status" role="status" aria-live="polite"></p>
      <div class="cb-shelf-list" id="cb-options" role="listbox" aria-label="可复制的历史记录"></div>
      <footer class="cb-shelf-footer"><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>Enter</kbd>复制</span><span><kbd>Esc</kbd>关闭</span></footer>`;
    document.body.append(dialog);
    const search = dialog.querySelector('input');
    const list = dialog.querySelector('.cb-shelf-list');
    const status = dialog.querySelector('.cb-status');
    let entries = [], results = [], activeId = '', version = 0, copying = false, closed = false;
    let loaded = false, pendingQuery = null;

    function render(reset = false) {
      results = entries.filter(entry => matches(entry, search.value));
      const index = reset ? 0 : Math.max(0, results.findIndex(entry => entry.id === activeId));
      activeId = results[index]?.id || '';
      list.innerHTML = results.length
        ? results.map((entry, i) => entryRow(entry, i === index, {icon, escape}, i)).join('')
        : '<p class="cb-empty">' + (!loaded ? '正在读取本地历史…' : search.value ? '没有找到匹配的内容。' : '还没有剪贴记录。') + '</p>';
      if (activeId) search.setAttribute('aria-activedescendant', 'cb-option-' + index);
      else search.removeAttribute('aria-activedescendant');
      if (reset) list.scrollTop = 0;
    }

    async function reload() {
      const request = ++version;
      try {
        const records = await media.list();
        if (!closed && request === version) {
          entries = records; loaded = true; render();
          if (pendingQuery === search.value) void choose(activeId);
          pendingQuery = null;
        }
      } catch (error) { if (!closed) status.textContent = error.message || '读取本地历史失败。'; }
    }

    function select(index) {
      if (!results.length) return;
      const rows = list.querySelectorAll('[role="option"]');
      const next = Math.max(0, Math.min(results.length - 1, index));
      activeId = results[next].id;
      rows.forEach((row,i) => {
        row.setAttribute('aria-selected', i === next); row.classList.toggle('is-selected', i === next);
      });
      const row = rows[next]; search.setAttribute('aria-activedescendant', row.id);
      const rect = row.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top;
      else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom;
    }

    function close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previous?.isConnected) previous.focus?.({preventScroll:true});
      onClose?.();
    }
    async function choose(id) {
      if (copying || closed) return;
      const entry = results.find(item => item.id === id);
      if (!entry) return;
      copying = true; status.textContent = '正在复制…';
      try {
        await media.copy(entry);
        if (!closed) { close(); notify('已复制，可切到目标窗口粘贴。'); }
      } catch (error) {
        if (!closed) {
          status.textContent = error.message || '无法写入剪贴板。请检查浏览器权限。';
          const url = entry.type !== 'text' && localMediaURL(entry.url);
          if (url) {
            const download = document.createElement('a');
            download.className = 'cb-download'; download.href = url;
            download.download = entry.filename || entryName(entry);
            download.textContent = '下载原文件';
            status.append(' ', download);
          }
        }
      } finally { copying = false; }
    }
    search.addEventListener('input', () => { pendingQuery = null; status.textContent = ''; render(true); });
    dialog.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close();
      } else if (event.target === search) {
        const currentIndex = results.findIndex(entry => entry.id === activeId);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); select(currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (loaded) void choose(activeId); else pendingQuery = search.value;
        }
      }
    });
    dialog.querySelector('.cb-shelf-close').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', close);
    list.addEventListener('click', event => {
      const row = event.target.closest('[data-cb-id]');
      if (row) {
        select(results.findIndex(entry => entry.id === row.dataset.cbId)); search.focus();
        void choose(row.dataset.cbId);
      }
    });
    const unsubscribe = media.subscribe(reload);
    dialog.showModal(); search.focus(); render(); void reload();
    return close;
  }

  Object.assign(window, {openClipboardTool, openClipboardShelf});
})();
