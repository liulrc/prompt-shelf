(() => {
  'use strict';
  window.mountCaptureHome = function ({host, desktop, icon, notify, hotkeys = {}, displayKey}) {
    host.innerHTML = `<section class="capture-home">
      <div class="page-intro"><header><h1>截图工具</h1><p>框选后可直接复制、保存、置顶，或进入独立编辑窗口。</p></header></div>
      <div class="capture-launchers">
        <section class="capture-launch"><span class="capture-symbol">${icon('capture',25)}</span><h2>截取屏幕区域</h2><p>框选后可切换为滚动长截图。</p>
          <button class="btn primary" data-action="start">${icon('capture',16)}开始截图 <kbd data-key="capture"></kbd></button></section>
        <section class="capture-launch"><span class="capture-symbol">${icon('pin',24)}</span><h2>置顶参考图</h2><p>从近期截图中选一张或多张，悬浮在其他窗口上方。</p>
          <button class="btn" data-action="gallery">近期截图库 <kbd data-key="pin"></kbd></button></section>
      </div>
      <section class="capture-recents"><header><h2>最近截图</h2><button class="btn" data-action="import">${icon('image',15)}导入图片</button></header><div class="capture-grid" aria-live="polite"></div></section>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    </section>`;
    const grid = host.querySelector('.capture-grid');
    const picker = host.querySelector('input');
    function showKeys(keys) {
      for (const label of host.querySelectorAll('[data-key]')) {
        const key = keys[label.dataset.key]; label.textContent = displayKey(key); label.hidden = !key;
      }
    }
    showKeys(hotkeys);
    const stopKeys = desktop.on('settings.changed', value => showKeys(value?.hotkeys || hotkeys));
    let serial = 0;
    async function refresh() {
      const revision = ++serial;
      try {
        const items = await desktop.request('capture.list');
        if (revision !== serial || !host.isConnected) return;
        const cards = items.slice(0,6).map(item => {
          const button = document.createElement('button');
          button.className = 'capture-card';
          button.dataset.id = item.id;
          const preview = document.createElement('div');
          if (item.thumbUrl) {
            const img = document.createElement('img');
            img.src = item.thumbUrl;
            img.alt = '';
            preview.append(img);
          } else preview.innerHTML = icon('image',24);
          const title = document.createElement('strong');
          title.textContent = item.title || '截图';
          const time = document.createElement('small');
          const date = new Date(item.createdAt);
          time.textContent = Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
          button.title = '在独立窗口编辑';
          button.append(preview,title,time);
          return button;
        });
        grid.replaceChildren(...cards);
        if (!cards.length) {
          const empty = document.createElement('p');
          empty.className = 'capture-empty'; empty.textContent = '还没有截图。完成截图或导入图片后，可在这里重新打开编辑。'; grid.append(empty);
        }
      } catch (error) { if (revision === serial && host.isConnected) notify(error.message); }
    }
    async function act(event) {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      button.disabled = true;
      try {
        if (button.dataset.id) await desktop.request('window.open',{area:'editor',id:button.dataset.id});
        else if (button.dataset.action === 'gallery') await desktop.request('window.open',{area:'gallery'});
        else if (button.dataset.action === 'start') await desktop.request('capture.start',{long:false,automatic:false});
        else picker.click();
      } catch (error) { notify(error.message); }
      finally { button.disabled = false; }
    }
    async function openFile() {
      const file = picker.files[0];
      picker.value = '';
      if (!file) return;
      try {
        if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
        const row = await desktop.archive().add({type:'image', title:file.name, filename:file.name, source:'截图工具', blob:file});
        await desktop.request('window.open',{area:'editor',id:row.id});
      } catch (error) { notify(error.message); }
    }
    host.addEventListener('click', act);
    picker.addEventListener('change', openFile);
    const unsubscribe = desktop.on('history.changed', refresh);
    refresh();
    return () => {
      serial++; unsubscribe(); stopKeys();
      host.removeEventListener('click', act);
      picker.removeEventListener('change', openFile);
    };
  };
})();
