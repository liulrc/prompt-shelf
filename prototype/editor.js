'use strict';

function openPromptEditor({host, record, origin, store, onCancel, onFinish, notify, copy, icon, escape}) {
  const model = window.PromptModel;
  let body = record.body || '';
  let values = [];
  let mode = origin === 'new' ? 'source' : 'fields';
  let copying = false;
  let useProjectLabels = record.id === 'project-reader';
  const libraryName = origin === 'builtin' ? '附加库' : '我的模板';
  const title = record.title || '新建模板';
  const labelFor = (index) => useProjectLabels
    ? ['任务动作', '托管平台', '项目地址'][index] || `变量 ${index + 1}`
    : `变量 ${index + 1}`;
  const slots = () => model.parse(body).filter(part => part.type === 'slot');
  const collectBody = () => model.templateFromValues(body, values);
  const actualText = () => model.render(body, values);
  const safe = value => escape(String(value ?? ''));
  const source = record.source;
  const sourceLabel = source?.name ? `<div class="pe-source-credit">${icon('link', 14)}${source.url && /^https?:\/\//i.test(source.url)
    ? `方法参考 <a href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">${safe(source.name)}</a>`
    : safe(source.name)}</div>` : '';
  host.innerHTML = `
    <article class="pe">
      <button class="pe-back" type="button" data-ed="back">${icon('back', 16)}返回列表</button>
      <header class="pe-head">
        <div>
          <span class="pe-location">${origin === 'new' ? '我的模板' : `${libraryName} / ${safe(record.category || '未分类')}`}</span>
          <h1>${safe(title)}</h1>
          <p>${safe(record.description || (origin === 'new' ? '写下固定句式，用【例：示例】标出下次想替换的内容。' : '填写本次要用的内容，也可以直接修改模板正文。'))}</p>
        </div>
      </header>
      <div class="pe-columns">
        <section class="pe-input-card" aria-label="编辑提示词">
          <div class="pe-tabs" role="tablist" aria-label="编辑方式">
            <button type="button" id="pe-fields-tab" role="tab" aria-controls="pe-panel" data-ed="fields">${icon('brackets',17)}填写变量</button>
            <button type="button" id="pe-source-tab" role="tab" aria-controls="pe-panel" data-ed="source">${icon('edit',16)}编辑原文</button>
          </div>
          <div id="pe-panel" role="tabpanel"></div>
        </section>
        <section class="pe-preview" aria-labelledby="pe-output-title">
          <div class="pe-preview-head">
            <h2 id="pe-output-title">${icon('eye',18)}使用预览</h2>
            <span id="pe-count"></span>
          </div>
          <div class="pe-preview-body" id="pe-output"></div>
          <div class="pe-preview-foot">${icon('brackets',15)}变量以紫色显示，复制为纯文本。</div>
          ${sourceLabel}
        </section>
      </div>
      <footer class="pe-footer">
        <button class="btn" type="button" data-ed="cancel">取消</button>
        <div>
          <button class="btn" type="button" data-ed="save">${icon('save',16)}保存</button>
          <button class="btn gold" type="button" data-ed="use">${icon('copy',16)}使用</button>
        </div>
      </footer>
    </article>`;
  const editor = host.querySelector('.pe');
  const panel = editor.querySelector('#pe-panel');
  const output = editor.querySelector('#pe-output');
  const count = editor.querySelector('#pe-count');
  const use = editor.querySelector('[data-ed="use"]');
  const save = editor.querySelector('[data-ed="save"]');
  const tabs = [...editor.querySelectorAll('[role="tab"]')];

  function preview() {
    const text = actualText();
    output.classList.toggle('pe-placeholder', !text);
    output.innerHTML = text
      ? model.parse(body).map(part => part.type === 'text'
          ? safe(part.text)
          : `<mark>${safe(values[part.index] ?? part.defaultValue)}</mark>`).join('')
      : '填写后，可在这里核对将要复制的提示词。';
    count.textContent = `${Array.from(text).length} 字符`;
    use.disabled = !text.trim() || copying;
    save.disabled = !body.trim() || copying;
  }

  function drawSource() {
    panel.innerHTML = `
      <div class="pe-panel-head"><h2>模板正文</h2><p>固定文字可以直接改写。用【例：示例】添加可替换的变量。</p></div>
      <div class="pe-source-wrap">
        <pre class="pe-mirror" aria-hidden="true"></pre>
        <textarea id="pe-raw" class="pe-source-input" aria-label="模板正文" spellcheck="false" placeholder="例如：请为【例：产品经理】总结以下材料，并给出三条行动建议。"></textarea>
      </div>`;
    const input = panel.querySelector('textarea');
    const mirror = panel.querySelector('.pe-mirror');
    input.value = body;
    const highlight = () => {
      mirror.innerHTML = model.parse(body).map(part => part.type === 'slot'
        ? `<mark>${safe(part.raw)}</mark>`
        : safe(part.raw)).join('') + '\n';
      mirror.scrollTop = input.scrollTop;
      mirror.scrollLeft = input.scrollLeft;
    };
    input.addEventListener('input', () => {
      body = input.value;
      useProjectLabels = false;
      values = [];
      highlight();
      preview();
    });
    input.addEventListener('scroll', () => {
      mirror.scrollTop = input.scrollTop;
      mirror.scrollLeft = input.scrollLeft;
    });
    highlight();
  }

  function drawFields() {
    const fields = slots();
    panel.innerHTML = `
      <div class="pe-panel-head"><h2>本次填写</h2><span class="pe-field-total">${fields.length} 个变量</span></div>
      ${fields.length ? `<div class="pe-field-list">${fields.map(part => `
        <div class="pe-field">
          <label for="pe-slot-${part.index}">${useProjectLabels ? `<span class="pe-index">${String(part.index + 1).padStart(2, '0')}</span>` : ''}${safe(labelFor(part.index))}</label>
          <textarea rows="${part.defaultValue.length > 32 || part.defaultValue.includes('\n') ? '2' : '1'}" spellcheck="false" id="pe-slot-${part.index}" data-slot="${part.index}" placeholder="${safe(part.defaultValue)}"></textarea>
          ${part.options.length > 1 ? `<div class="pe-choices">${part.options.map((choice, i) => `<button type="button" data-choice="${i}" data-for="${part.index}">${safe(choice)}</button>`).join('')}</div>` : ''}
        </div>`).join('')}</div>`
      : `<div class="pe-empty">${icon('brackets',24)}<p>这条模板目前只有固定文字。</p><button type="button" class="pe-text-btn" data-open-source>编辑原文，添加变量 ${icon('arrow',14)}</button></div>`}`;
    for (const field of panel.querySelectorAll('[data-slot]')) {
      const index = Number(field.dataset.slot);
      field.value = values[index] ?? fields[index].defaultValue;
      field.addEventListener('input', () => {
        values[index] = field.value;
        syncChoices();
        preview();
      });
    }
    function syncChoices() {
      for (const choice of panel.querySelectorAll('[data-choice]')) {
        const part = fields[Number(choice.dataset.for)];
        const value = values[part.index] ?? part.defaultValue;
        choice.setAttribute('aria-pressed', String(value === part.options[Number(choice.dataset.choice)]));
      }
    }
    for (const choice of panel.querySelectorAll('[data-choice]')) {
      choice.addEventListener('click', () => {
        const index = Number(choice.dataset.for);
        const field = panel.querySelector(`[data-slot="${index}"]`);
        field.value = fields[index].options[Number(choice.dataset.choice)];
        field.dispatchEvent(new Event('input'));
        field.focus();
      });
    }
    syncChoices();
    panel.querySelector('[data-open-source]')?.addEventListener('click', () => switchMode('source'));
  }

  function switchMode(nextMode, focusTab = false) {
    if (nextMode === 'source' && mode === 'fields') {
      body = collectBody();
      values = [];
    }
    mode = nextMode;
    for (const tab of tabs) {
      const active = tab.dataset.ed === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        panel.setAttribute('aria-labelledby', tab.id);
        if (focusTab) tab.focus();
      }
    }
    if (mode === 'source') drawSource();
    else drawFields();
    preview();
  }

  function openSave() {
    const dialog = document.querySelector('#save-dialog');
    const existing = origin === 'personal';
    const category = record.category || '未分类';
    const categories = [...new Set([category, '未分类', ...window.PROMPT_LIBRARY.map(item => item.category)])];
    dialog.className = 'pe-dialog';
    dialog.innerHTML = `
      <form class="pe-save-form">
        <header><div><span class="pe-location">我的模板</span><h2 id="dialog-title">保存模板</h2></div><button type="button" class="pe-close" aria-label="关闭">${icon('close',18)}</button></header>
        <label for="pe-name">模板名称</label><input id="pe-name" required placeholder="为模板取一个名字" value="${safe(record.title)}">
        <label for="pe-category">用途分类</label><select id="pe-category">${categories.map(c => `<option${c === category ? ' selected' : ''}>${safe(c)}</option>`).join('')}</select>
        ${existing ? `<fieldset class="pe-save-mode"><legend>保存方式</legend><label><input type="radio" name="mode" value="replace" checked>替换当前模板</label><label><input type="radio" name="mode" value="new">另存为新模板</label></fieldset>` : `<p class="pe-dialog-note">${origin === 'builtin' ? '副本将存入「我的模板」，可在个人库继续编辑。' : '正文和变量示例将一并存入「我的模板」。'}</p>`}
        <div class="pe-dialog-actions"><button type="button" class="btn pe-abort">取消</button><button class="btn primary" type="submit">确认保存</button></div>
      </form>`;
    const form = dialog.querySelector('form');
    const input = form.querySelector('#pe-name');
    const close = () => dialog.close();
    dialog.querySelector('.pe-close').onclick = close;
    dialog.querySelector('.pe-abort').onclick = close;
    input.oninput = () => input.setCustomValidity('');
    form.onsubmit = event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        input.setCustomValidity('请输入模板名称');
        input.reportValidity();
        return;
      }
      try {
        const data = {
          title: name, category: form.querySelector('#pe-category').value,
          body: collectBody(), description: '', source: record.source
        };
        if (existing && form.elements.mode.value === 'replace') data.id = record.id;
        store.savePersonal(data);
      } catch (error) {
        notify(error.message || '保存失败，请重试。');
        return;
      }
      close();
      onFinish('save');
    };
    dialog.showModal();
    input.focus();
    input.select();
  }

  async function usePrompt() {
    const text = actualText();
    if (copying || !text.trim()) return;
    copying = true;
    preview();
    try {
      await copy(text);
    } catch {
      copying = false;
      preview();
      notify('复制失败，请允许写入剪贴板后重试。');
      return;
    }
    try {
      store.recordUse({title: record.title || '未命名模板', category: record.category, text, templateId: record.id || '', origin});
    } catch {
      onCancel();
      notify('已复制。历史记录写入失败，请检查本地存储。');
      return;
    }
    onFinish('use');
  }

  for (const tab of tabs) {
    tab.onclick = () => switchMode(tab.dataset.ed);
    tab.onkeydown = event => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 'fields' : event.key === 'End' ? 'source' : mode === 'source' ? 'fields' : 'source';
        switchMode(next, true);
      }
    };
  }
  editor.querySelector('[data-ed="back"]').onclick = onCancel;
  editor.querySelector('[data-ed="cancel"]').onclick = onCancel;
  save.onclick = openSave;
  use.onclick = usePrompt;
  switchMode(mode);
}

window.openPromptEditor = openPromptEditor;
