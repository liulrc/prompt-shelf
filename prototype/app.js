(() => {
  'use strict';

  const paths = {
    library:'<path d="M3 5.5h4v14H3zM10 4h4v15.5h-4zM16 6l3.7-1 3.1 13.6-3.7.9z"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.4 7M3 5v6h6m3-4v5l3 2"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.7 4.7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>', back:'<path d="M20 12H5m6-6-6 6 6 6"/>',
    brackets:'<path d="M8 4H4v16h4m8-16h4v16h-4"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    save:'<path d="M4 3h13l4 4v14H3V3zm3 0v6h9V3M7 21v-7h10v7"/>',
    edit:'<path d="m4 16 12-12 4 4L8 20l-5 1zm10-10 4 4"/>',check:'<path d="m4 12 5 5L20 6"/>',
    spark:'<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z"/>',
    code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
    video:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 5l-2 5m8-5-2 5m8-5-2 5"/>',
    pen:'<path d="m4 20 1.5-6L16 3.5a1.8 1.8 0 0 1 2.5 0l2 2a1.8 1.8 0 0 1 0 2.5L10 18.5zM14 6l4 4M4 20l6-1.5"/>',
    research:'<path d="M3 5c3.5-.9 6.5-.2 9 1.5 2.5-1.7 5.5-2.4 9-1.5v14c-3.5-.9-6.5-.2-9 1.5-2.5-1.7-5.5-2.4-9-1.5zM12 7v13"/>',
    briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12c6 3 12 3 18 0m-9 0v3"/>',
    link:'<path d="M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5M14 3h7v7m0-7-11 11"/>',
    box:'<path d="M3 5h18v12H3zm4 16h10m-5-4v4"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m3 0h1m3 0h1m3 0h1M7 15h10"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    text:'<path d="M4 5h16M4 10h12M4 15h16M4 20h8"/>',
    eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>',
    clipboard:'<rect x="4" y="5" width="16" height="16" rx="2"/><rect x="8" y="3" width="8" height="4" rx="1.4"/><path d="M8 12h8m-8 4h6"/>',
    capture:'<path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4"/><rect x="7" y="8" width="10" height="8" rx="1.4"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    pin:'<path d="m8 3 10 4-2 2-1 4 2 3-1 1-7-3-5-2 1-1 3-1 2-4zM10 14l-4 7"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  function icon(name, size = 18) {
    return '<svg class="icon" aria-hidden="true" width="' + size + '" height="' + size + '" style="--icon-size:' + size + 'px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const catalog = window.PROMPT_LIBRARY;
  const model = window.PromptModel;
  const store = model.createStore();
  const desktop = window.PromptDesktop?.active ? window.PromptDesktop : null;
  let desktopSettings = {hotkeys:{shelf:'Alt+Q'}, monitoring:true};
  const categories = {
    '研究':['research','research'], '视频':['video','video'], '文案':['pen','copy'],
    '开发':['code','dev'], '办公':['briefcase','office']
  };
  const areaNames = { builtin:'附加库', personal:'我的模板', history:'使用历史', clipboard:'剪贴板', capture:'截图工具' };
  const order = ['全部','视频','文案','研究','开发','办公'];
  const root = document.querySelector('#app');
  const state = {area:'builtin', category:'全部', query:'', editing:false};
  let lastFocus = '', noticeTimer;
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  const shelfKeys = () => desktop ? desktopSettings.hotkeys.shelf : /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥⇧V' : 'Alt+Shift+V';
  const isTool = area => area === 'clipboard' || area === 'capture';
  const assets = new Map();
  let archive, disposeTool, closeShelf, openingShelf = false;

  // Classic scripts also work when the user opens index.html directly from disk.
  function loadAsset(file, folder = 'prototype') {
    const url = folder + '/' + file;
    if (!assets.has(url)) {
      const style = file.endsWith('.css');
      const node = document.createElement(style ? 'link' : 'script');
      if (style) { node.rel = 'stylesheet'; node.href = url; }
      else node.src = url;
      assets.set(url, new Promise((resolve,reject) => {
        node.onload = resolve;
        node.onerror = () => {
          assets.delete(url); node.remove();
          reject(new Error('工具文件加载失败，请检查 prototype 文件夹是否完整。'));
        };
        document.head.append(node);
      }));
    }
    return assets.get(url);
  }
  async function getArchive() {
    if (desktop) return archive ??= desktop.archive();
    if (!archive) {
      await Promise.all([loadAsset('media.js'), loadAsset('assets/palette.js')]);
      archive ??= window.createClipboardArchive(copy);
    }
    return archive;
  }
  async function openShelf() {
    if (desktop) {
      try { await desktop.request('window.open', {area:'shelf'}); } catch (error) { notify(error.message); }
      return;
    }
    if (openingShelf || closeShelf || document.querySelector('dialog[open]')) return;
    openingShelf = true;
    try {
      const [media] = await Promise.all([getArchive(), loadAsset('clipboard.css'), loadAsset('clipboard.js')]);
      closeShelf = window.openClipboardShelf({icon,escape,notify,media,onClose() { closeShelf = null; }});
    } catch (error) { notify(error.message); }
    finally { openingShelf = false; }
  }
  async function trackPromptCopy(text) {
    await copy(text);
    if (desktop) return;
    try { await (await getArchive()).add({type:'text',text,source:'词匣 · 提示词'}); }
    catch (error) { setTimeout(() => notify('提示词已复制。' + error.message), 300); }
  }
  async function mountTool(area, host) {
    host.setAttribute('aria-busy','true');
    try {
      if (desktop && area === 'capture') {
        await Promise.all([loadAsset('capture-home.js','desktop/ui'),loadAsset('capture-home.css','desktop/ui')]);
        if (host.isConnected) disposeTool = window.mountCaptureHome({host,desktop,icon,notify});
        return;
      }
      const [media] = await Promise.all([getArchive(), loadAsset(area+'.css'), loadAsset(area+'.js'), area === 'capture' && loadAsset('screens-zip.js')]);
      if (!host.isConnected) return;
      const options = {host,icon,escape,notify,media,openShelf,desktop,shelfShortcut:shelfKeys(), monitoring:desktopSettings.monitoring,
        onHistory:() => navigate('clipboard'),
        saveToClipboardHistory:({blob,title}) => media.add({type:'image',blob,title,filename:title.replace(/\.png$/i,'')+'.png',source:'截图工具'})};
      const cleanup = await (area === 'clipboard' ? window.openClipboardTool(options) : window.openCaptureTool(options));
      if (host.isConnected) disposeTool = cleanup;
      else if (typeof cleanup === 'function') cleanup();
    } catch (error) {
      if (host.isConnected) host.textContent = error.message;
    } finally { host.removeAttribute('aria-busy'); }
  }

  function notify(message) {
    clearTimeout(noticeTimer);
    const outlet = document.querySelector('#notices');
    outlet.innerHTML = '<div class="toast">' + escape(message) + '</div>';
    noticeTimer = setTimeout(() => outlet.replaceChildren(), 3400);
  }
  async function copy(text) {
    if (!text.trim()) throw new Error('提示词为空，请先输入正文。');
    if (desktop) { await desktop.request('clipboard.write',{type:'text',text,source:'词匣 · 提示词'}); return; }
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    } catch { /* Older desktop browsers can still copy a selected text field. */ }
    const field = document.createElement('textarea');
    const active = document.activeElement;
    field.value = text;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    (document.querySelector('dialog[open]') || document.body).append(field);
    try {
      field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
      if (!document.execCommand('copy')) throw new Error('剪贴板写入失败，请允许浏览器复制后重试。');
    } finally {
      field.remove();
      active?.focus?.({preventScroll:true});
    }
  }
  function navButton(area, symbol, count) {
    const active = state.area === area;
    return '<button class="nav-item' + (active ? ' active':'') + '" data-nav="' + area + '"' + (active ? ' aria-current="page"':'') + '>' + icon(symbol,17) + '<span>' + areaNames[area] + '</span>' + (count == null ? '' : '<span class="nav-count">' + count + '</span>') + '</button>';
  }
  function layout() {
    if (typeof disposeTool === 'function') disposeTool();
    disposeTool = null;
    root.innerHTML = `<div class="app-shell"><aside class="sidebar">
      <div class="brand"><img src="prototype/mark.svg" alt=""><div><div class="brand-name">词匣</div><small>PROMPT SHELF</small></div></div>
      <nav aria-label="工作台导航"><p class="nav-group">模板空间</p>
        ${navButton('builtin','library',catalog.length)}${navButton('personal','folder',store.listPersonal().length)}
        <p class="nav-group next">活动记录</p>${navButton('history','history',null)}
        <p class="nav-group next">桌面工具</p>${navButton('clipboard','clipboard',null)}${navButton('capture','capture',null)}
      ${desktop ? '<button class="nav-item" data-act="settings">'+icon('keyboard',17)+'<span>设置</span></button>' : ''}</nav><button class="side-shelf" data-act="open-shelf" title="打开快捷历史栏">${icon('keyboard',16)} 历史栏 <kbd>${escape(shelfKeys())}</kbd></button><div class="side-foot"><span class="device">${icon('box',19)}</span><div><strong>本地工作区</strong><small>${store.persistent ? '离线可用' : '仅在本次会话中保留'}</small></div></div>
      </aside><div class="workspace"><header class="topbar">
        <div class="crumbs"><span class="crumb-home">工作台</span>${icon('chevron',11)}<b>${areaNames[state.area]}</b>${state.editing ? icon('chevron',11)+'<b>编辑器</b>':''}</div>
         ${state.editing || isTool(state.area) ? '' : `<div class="top-actions"><label class="searchbox">${icon('search',15)}<input type="search" id="search" aria-label="搜索当前${state.area === 'history' ? '历史':'模板库'}" placeholder="${state.area === 'history' ? '搜索使用历史':'搜索当前模板库'}" value="${escape(state.query)}"><kbd>${shortcut}</kbd></label><button class="btn primary" data-act="new">${icon('plus',15)}新建模板</button></div>`}
      </header><main id="content" class="content"></main></div></div>`;
  }
  function categoryIcon(category) {
    const [symbol, style] = Object.hasOwn(categories, category) ? categories[category] : ['brackets','other'];
    return '<span class="cat-icon cat-' + style + '">' + icon(symbol,16) + '</span>';
  }
  function card(record) {
    const count = model.parse(record.body).filter(segment => segment.type === 'slot').length;
    return `<button class="card" data-open="${escape(record.id)}"><span class="card-top"><span class="category-tag">${categoryIcon(record.category)}${escape(record.category)}</span><span class="card-open">${icon('arrow',15)}</span></span>
      <h3>${escape(record.title)}</h3><p>${escape(record.description || model.render(record.body))}</p><span class="card-meta">${icon(count ? 'brackets':'text',13)}${count ? count + ' 个变量':'固定短语'}</span></button>`;
  }
  function empty(symbol,title,desc,action,label) {
    return `<div class="empty"><span class="empty-icon">${icon(symbol,22)}</span><strong>${title}</strong><p>${desc}</p>${action ? '<button class="btn" data-act="'+action+'">'+label+'</button>':''}</div>`;
  }
  function intro(title,description,quantity='') {
    return '<div class="page-intro"><div><h1 tabindex="-1">'+title+'</h1><p>'+description+'</p></div>'+quantity+'</div>';
  }
  function feature() {
    const pick = catalog.find(t => t.id === 'project-reader');
    return `<section class="feature" aria-label="精选模板"><div class="feature-copy"><div class="feature-tag">${icon('spark',14)} 精选模板</div><h2>${escape(pick.title)}</h2>
      <p class="feature-example">详细阅读并<span>【学习/部署】</span><span>【GitHub】</span>上的<span>【项目地址】</span>项目。</p><button class="hero-button" data-open="project-reader">打开模板 ${icon('arrow',14)}</button></div><img class="feature-art" src="prototype/feature.svg" alt=""></section>`;
  }
  const normalize = text => String(text).toLocaleLowerCase().trim();
  function matches(record, keys) {
    return keys.some(k => normalize(record[k] || '').includes(normalize(state.query)));
  }
  function listTemplates(host) {
    const builtin = state.area === 'builtin';
    const records = builtin ? catalog : store.listPersonal();
    const userCategories = Array.from(new Set(records.map(t=>t.category)));
    const choices = builtin ? order : ['全部',...userCategories.filter(c=>c !== '全部')];
    const list = records.filter(t=>(state.category === '全部' || t.category === state.category) && matches(t,['title','body','category','description']));
    const showFeature = builtin && state.category === '全部' && !state.query.trim();
    const shown = showFeature ? [...list.filter(t=>t.id !== 'project-reader'), ...list.filter(t=>t.id === 'project-reader')] : list;
    const title = builtin ? '附加库' : '我的模板';
    const desc = builtin ? '按用途挑选提示词，直接改写原文后即可使用。' : '保存自己的固定短语，以及从附加库改写的模板。';
    host.innerHTML = intro(title,desc,'<span class="intro-quantity"><b>'+records.length+'</b> 个模板 · <b>'+userCategories.length+'</b> 种用途</span>') + (showFeature ? feature():'') +
      `<div class="library-head"><div class="section-title"><h2>${state.query.trim() ? '搜索结果' : '浏览模板'}</h2><span class="count-pill">${shown.length}</span></div>
      <div class="filters" role="group" aria-label="按用途筛选">${choices.map(c=>'<button class="filter-btn'+(state.category === c ? ' active':'')+'" data-filter="'+escape(c)+'" aria-pressed="'+(state.category===c)+'">'+(c==='全部'?icon('grid',12):'')+escape(c)+'</button>').join('')}</div></div>` +
      (shown.length ? '<div class="card-grid">'+shown.map(card).join('')+'</div>' : (records.length ? empty('search','没有找到匹配的模板','可换一个关键词，或查看全部用途。','reset','清除筛选') : empty('folder','还没有个人模板','从空白开始，也可以在附加库打开一条模板，然后点「保存」。','new','新建模板')));
  }
  function listHistory(host) {
    const history = store.listHistory();
    const result = history.filter(t=>matches(t,['title','category','text']));
    const date = new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    host.innerHTML = intro('使用历史','这里保留最近 100 次成功复制的全文。展开一条记录，可以再次复制。') +
      (result.length ? '<div class="history-list">'+result.map((h,i)=>`<details class="history-item" ${i===0 ? 'open':''}><summary>${categoryIcon(h.category)}<strong>${escape(h.title)}</strong><time>${date.format(new Date(h.usedAt))}</time>${icon('chevron',13)}</summary><div class="history-details"><p class="history-text">${escape(h.text)}</p><button class="btn" data-recopy="${escape(h.id)}">${icon('copy',15)}再次复制</button></div></details>`).join('')+'</div>' :
        history.length ? empty('search','没有找到匹配的记录','可按模板名或当时复制的文字搜索。','reset','清除搜索') : empty('history','还没有使用记录','在编辑器中点「使用」后，实际复制的文字会出现在这里。','browse','浏览附加库'));
  }
  function drawContent() {
    const host = document.querySelector('#content');
    if (isTool(state.area)) { mountTool(state.area, host); return; }
    if (state.area === 'history') listHistory(host); else listTemplates(host);
  }
  function navigate(area, reset=true) {
    Object.assign(state,{area,editing:false});
    if (reset) Object.assign(state,{query:'',category:'全部'});
    try { history.replaceState(null, '', '#' + area); } catch { /* Some local WebViews restrict history writes. */ }
    layout(); drawContent(); window.scrollTo(0,0); document.title=areaNames[area]+' · 词匣';
  }
  let previousScroll=0;
  function openEditor(record,origin,trigger) {
    previousScroll=window.scrollY;
    lastFocus=trigger?.dataset.open || '';
    state.editing=true;
    layout();
    window.scrollTo(0,0);
    document.title='编辑器 · 词匣';
    const returnToList = () => {
      navigate(state.area,false); window.scrollTo(0,previousScroll);
      const buttons = Array.from(document.querySelectorAll('[data-open]'));
      (buttons.find(el=>el.dataset.open === lastFocus) || document.querySelector('[data-act="new"]'))?.focus({preventScroll:true});
    };
    window.openPromptEditor({host:document.querySelector('#content'),record,origin,store,notify,copy:trackPromptCopy,icon,escape,
      onCancel:returnToList,
      onFinish(action) {
        if (action === 'save') { navigate('personal'); notify(store.persistent ? '已保存到「我的模板」' : '已暂存到本次会话，关闭页面后可能丢失'); }
        else { returnToList(); notify(store.persistent ? '已复制到剪贴板，可在使用历史中查看' : '已复制，历史仅在本次会话中保留'); }
      }
    });
  }
  root.addEventListener('input',event=>{
    if (event.target.id === 'search') { state.query=event.target.value; drawContent(); }
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if (!button || button.disabled) return;
    const {nav,filter,open,act,recopy}=button.dataset;
    if (nav) return navigate(nav);
    if (act === 'settings' && desktop) {
      try { await desktop.request('window.open', {area:'settings'}); } catch (error) { notify(error.message); }
      return;
    }
    if (act === 'open-shelf') return openShelf();
    if (filter !== undefined) { state.category=filter; drawContent(); Array.from(root.querySelectorAll('[data-filter]')).find(el=>el.dataset.filter===filter)?.focus({preventScroll:true}); return; }
    if (open) {
      const origin=state.area;
      const record=(origin === 'builtin'?catalog:store.listPersonal()).find(t=>t.id===open);
      if (record) openEditor(record,origin,button);
      return;
    }
    if (act === 'new') return openEditor({title:'',body:'',category:'未分类'},'new',button);
    if (act === 'reset') return navigate(state.area);
    if (act === 'browse') return navigate('builtin');
    if (recopy) {
      const item=store.listHistory().find(x=>x.id===recopy);
      if (!item) return;
      button.disabled=true;
      try {
        await trackPromptCopy(item.text);
      } catch (error) { notify(error.message); button.disabled=false; return; }
      try { store.recordUse(item); drawContent(); notify('已再次复制到剪贴板'); }
      catch { button.disabled=false; notify('已复制到剪贴板，历史记录写入失败'); }
    }
  });
  window.addEventListener('keydown',event=>{
    if (!desktop && event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey && (event.code === 'KeyV' || event.key.toLowerCase() === 'v')) {
      event.preventDefault();
      if (!event.repeat) openShelf();
      return;
    }
    if (!state.editing && !isTool(state.area) && !document.querySelector('dialog[open]') && (event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k') {
      event.preventDefault(); const field=document.querySelector('#search'); field.focus(); field.select();
    }
  });
  window.addEventListener('storage',()=>{ if (!state.editing && !isTool(state.area) && !closeShelf) { layout(); drawContent(); } });
  function openLocation() {
    const area = location.hash.slice(1);
    navigate(Object.hasOwn(areaNames, area) ? area : 'builtin');
  }
  window.addEventListener('hashchange', openLocation);
  openLocation();
  if (desktop) {
    function refreshSettings(value) {
      if (!value?.hotkeys) return;
      desktopSettings = value;
      const key = root.querySelector('[data-act="open-shelf"] kbd');
      if (key) key.textContent = shelfKeys();
    }
    desktop.request('settings.get').then(refreshSettings).catch(error => notify(error.message));
    desktop.on('settings.changed', refreshSettings);
    desktop.on('native.status', data => {
      const message = typeof data === 'string' ? data : data?.message;
      if (message) notify(message);
    });
    desktop.on('route', data => {
      if (Object.hasOwn(areaNames, data?.area) && (state.area !== data.area || state.editing)) navigate(data.area);
    });

  }
})();
