(() => {
  'use strict';
  const desktop = window.PromptDesktop;
  const $ = id => document.getElementById(id);
  const list = $('list'), selected = new Set(), cards = new Map();
  const date = new Intl.DateTimeFormat('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  let loading = 0, pinning = false;
  function controls() {
    $('pin').disabled = !selected.size || pinning; $('cancel').disabled = pinning;
    $('count').textContent = '已选 ' + selected.size + ' 张';
    for (const [id,card] of cards) {
      card.disabled = pinning; card.setAttribute('aria-pressed', String(selected.has(id)));
    }
  }
  function makeCard(id) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'gallery-card'; card.dataset.id = id;
    card.innerHTML = '<span class="preview"><span class="placeholder">截图</span><img loading="lazy" decoding="async" alt=""></span><span class="check" aria-hidden="true"></span><span class="caption"><strong></strong><small></small></span>';
    card.onclick = () => {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      $('message').textContent = ''; controls();
    };
    const image = card.querySelector('img'),placeholder = card.querySelector('.placeholder');
    image.onload = () => { image.classList.add('ready'); placeholder.hidden = true; };
    image.onerror = () => { image.classList.remove('ready'); placeholder.hidden = false; };
    return card;
  }
  function update(card,row) {
    const title = row.title || row.filename || '截图';
    const when = row.createdAt && new Date(row.createdAt);
    const time = when && !isNaN(when.getTime()) ? date.format(when) : '';
    card.querySelector('strong').textContent = title;
    card.querySelector('small').textContent = time;
    card.setAttribute('aria-label', [title,time].filter(Boolean).join('，'));
    const img = card.querySelector('img');
    const src = row.thumbUrl || '';
    if (src && img.getAttribute('src') !== src) img.src = src;
  }
  async function refresh() {
    const version = ++loading;
    try {
      const rows = await desktop.request('capture.list');
      if (version !== loading) return;
      const ids = new Set(rows.map(row => row.id));
      for (const [id,card] of cards) if (!ids.has(id)) { card.remove(); cards.delete(id); selected.delete(id); }
      let pos = list.firstElementChild;
      for (const row of rows) {
        if (!cards.has(row.id)) cards.set(row.id, makeCard(row.id));
        const card = cards.get(row.id); update(card,row);
        if (card !== pos) list.insertBefore(card,pos);
        pos = card.nextElementSibling;
      }
      $('empty').hidden = rows.length > 0;
      $('empty').textContent = '还没有截图。完成一次截图后，就可以在这里选择并置顶。';
      controls();
    } catch (error) {
      if (version !== loading) return;
      $('empty').hidden = cards.size > 0;
      $('empty').textContent = '暂时无法读取截图。';
      $('message').textContent = error.message;
    }
  }
  $('pin').onclick = async () => {
    if (!selected.size || pinning) return;
    pinning = true; controls();
    try {
      await desktop.request('capture.pinMany', {ids:[...selected]});
      await desktop.request('window.close');
    } catch (error) { $('message').textContent = error.message; }
    finally { pinning = false; controls(); }
  };
  $('cancel').onclick = () => { if (!pinning) desktop.request('window.close').catch(error => { $('message').textContent = error.message; }); };
  document.addEventListener('keydown',e => { if (e.key === 'Escape') { e.preventDefault(); $('cancel').click(); } });
  desktop.on('history.changed',refresh);
  refresh();
})();
