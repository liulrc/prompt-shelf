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
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  function icon(name, size = 18) {
    return '<svg class="icon" aria-hidden="true" width="' + size + '" height="' + size + '" style="--icon-size:' + size + 'px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const catalog = window.PROMPT_LIBRARY;
  const model = window.PromptModel;
  const store = model.createStore();
  const categories = {
    '研究':['research','research'], '视频':['video','video'], '文案':['pen','copy'],
    '开发':['code','dev'], '办公':['briefcase','office']
  };
  const areaNames = { builtin:'附加库', personal:'我的模板', history:'使用历史' };
  const order = ['全部','视频','文案','研究','开发','办公'];
  const root = document.querySelector('#app');
  const state = {area:'builtin', category:'全部', query:'', editing:false};
  let lastFocus = '', noticeTimer;
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  function notify(message) {
    clearTimeout(noticeTimer);
    const outlet = document.querySelector('#notices');
    outlet.innerHTML = '<div class="toast">' + escape(message) + '</div>';
    noticeTimer = setTimeout(() => outlet.replaceChildren(), 3400);
  }
  async function copy(text) {
    if (!text.trim()) throw new Error('提示词为空，请先输入正文。');
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    } catch { /* Older desktop browsers can still copy a selected text field. */ }
    const field = document.createElement('textarea');
    const active = document.activeElement;
    field.value = text;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    document.body.append(field);
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
    root.innerHTML = `<div class="app-shell"><aside class="sidebar">
      <div class="brand"><img src="prototype/mark.svg" alt=""><div><div class="brand-name">词匣</div><small>PROMPT SHELF</small></div></div>
      <nav aria-label="工作台导航"><p class="nav-group">模板空间</p>
        ${navButton('builtin','library',catalog.length)}${navButton('personal','folder',store.listPersonal().length)}
        <p class="nav-group next">活动记录</p>${navButton('history','history',null)}
      </nav><div class="side-foot"><span class="device">${icon('box',19)}</span><div><strong>本地工作区</strong><small>${store.persistent ? '离线可用' : '仅在本次会话中保留'}</small></div></div>
      </aside><div class="workspace"><header class="topbar">
        <div class="crumbs"><span class="crumb-home">工作台</span>${icon('chevron',11)}<b>${areaNames[state.area]}</b>${state.editing ? icon('chevron',11)+'<b>编辑器</b>':''}</div>
        ${state.editing ? '' : `<div class="top-actions"><label class="searchbox">${icon('search',15)}<input type="search" id="search" aria-label="搜索当前${state.area === 'history' ? '历史':'模板库'}" placeholder="${state.area === 'history' ? '搜索使用历史':'搜索当前模板库'}" value="${escape(state.query)}"><kbd>${shortcut}</kbd></label><button class="btn primary" data-act="new">${icon('plus',15)}新建模板</button></div>`}
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
    const desc = builtin ? '按用途挑选提示词，填入自己的内容即可使用。' : '保存自己的固定短语，以及从附加库改写的模板。';
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
    if (state.area === 'history') listHistory(host); else listTemplates(host);
  }
  function navigate(area, reset=true) {
    Object.assign(state,{area,editing:false});
    if (reset) Object.assign(state,{query:'',category:'全部'});
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
    window.openPromptEditor({host:document.querySelector('#content'),record,origin,store,notify,copy,icon,escape,
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
        await copy(item.text);
      } catch (error) { notify(error.message); button.disabled=false; return; }
      try { store.recordUse(item); drawContent(); notify('已再次复制到剪贴板'); }
      catch { button.disabled=false; notify('已复制到剪贴板，历史记录写入失败'); }
    }
  });
  window.addEventListener('keydown',event=>{
    if (!state.editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k') {
      event.preventDefault(); const field=document.querySelector('#search'); field.focus(); field.select();
    }
  });
  window.addEventListener('storage',()=>{ if (!state.editing) { layout(); drawContent(); } });
  navigate('builtin');
})();
