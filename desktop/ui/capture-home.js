(() => {
  'use strict';
  window.mountCaptureHome = function ({host, desktop, icon, notify}) {
    host.innerHTML = `<section class="capture-home">
      <header><h1>截图工具</h1><p>框选屏幕区域后可直接编辑，也可切换到滚动长截图。</p></header>
      <div class="capture-actions">
        <button class="btn primary" data-action="start">${icon('capture')} 开始截图</button>
        <button class="btn" data-action="gallery">${icon('pin')} 近期截图库</button>
        <button class="btn" data-action="import">${icon('image')} 导入图片</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      </div>
      <section class="capture-recents"><h2>最近截图</h2><div class="capture-grid"></div></section>
    </section>`;
    const grid = host.querySelector('.capture-grid');
    const picker = host.querySelector('input');
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
        if (!cards.length) grid.textContent = '还没有截图。';
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
      serial++; unsubscribe();
      host.removeEventListener('click', act);
      picker.removeEventListener('change', openFile);
    };
  };
})();
