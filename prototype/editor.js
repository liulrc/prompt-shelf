'use strict';

// The overlay has exactly the same characters as the textarea. Styling a range
// never inserts deleted text into the draft or shifts the native caret.
function highlightDraft(runs, diff, escape, locateDeletions = false) {
  let index = 0;
  let offset = 0;
  const html = [];
  for (const [step, part] of diff.entries()) {
    if (part.type === 'delete') {
      if (locateDeletions && diff[step - 1]?.type !== 'insert' && diff[step + 1]?.type !== 'insert') {
        html.push('<span class="pe-delete-site"></span>');
      }
      continue;
    }
    let remaining = part.text.length;
    while (remaining > 0 && index < runs.length) {
      const run = runs[index];
      const length = Math.min(remaining, run.text.length - offset);
      const text = escape(run.text.slice(offset, offset + length));
      if (length) {
        if (part.type === 'insert') {
          const visible = text.replaceAll('\n', '<span class="pe-newline"></span>\n');
          html.push('<mark class="pe-added">' + visible + '</mark>');
        }
        else if (run.slot) html.push('<mark class="pe-variable">' + text + '</mark>');
        else html.push(text);
      }
      offset += length;
      remaining -= length;
      if (offset === run.text.length) { index += 1; offset = 0; }
    }
  }
  return html.join('');
}

function openPromptEditor({host, record, origin, store, onCancel, onFinish, notify, copy, icon, escape}) {
  const model = window.PromptModel;
  const original = (record.body || '').replace(/\r\n?/g, '\n');
  const originalOutput = model.render(original);
  const existing = origin !== 'new';
  let copying = false;
  const libraryName = origin === 'builtin' ? '附加库' : '我的模板';
  const title = record.title || '新建模板';
  const safe = value => escape(String(value ?? ''));
  const source = record.source;
  const sourceLabel = source?.name ? `<div class="pe-source-credit">${icon('link', 14)}${source.url && /^https?:\/\//i.test(source.url)
    ? `方法参考 <a href="${safe(source.url)}" target="_blank" rel="noopener noreferrer">${safe(source.name)}</a>`
    : safe(source.name)}</div>` : '';
  host.innerHTML = `
    <article class="pe">
      <button class="pe-back" type="button" data-ed="back">${icon('back', 16)}返回列表</button>
      <header class="pe-head">
        <span class="pe-location">${origin === 'new' ? '我的模板' : `${libraryName} / ${safe(record.category || '未分类')}`}</span>
        <h1>${safe(title)}</h1>
        <p>${safe(record.description || '直接改写正文，用【例：示例】标出可替换的内容。')}</p>
      </header>
      <div class="pe-columns">
        <section class="pe-input-card" aria-labelledby="pe-source-title">
          <div class="pe-card-head">
            <h2 id="pe-source-title"><label for="pe-raw">${icon('edit',17)}编辑原文</label></h2>
            <div class="pe-legend" id="pe-key"><span class="pe-variable">【变量】</span>${existing ? '<span class="pe-added">本次改动</span>' : ''}</div>
          </div>
          <div class="pe-source-wrap">
            <pre class="pe-mirror" aria-hidden="true"></pre>
            <textarea id="pe-raw" class="pe-source-input" aria-describedby="pe-key" spellcheck="false" placeholder="例如：请为【例：产品经理】总结以下材料，并给出三条行动建议。"></textarea>
          </div>
          <details class="pe-changes" hidden>
            <summary><span>查看原文对照</span><small></small></summary>
            <div class="pe-change-text" aria-label="与打开时的原文对照"></div>
          </details>
        </section>
        <section class="pe-preview" aria-labelledby="pe-output-title">
          <div class="pe-card-head">
            <h2 id="pe-output-title">${icon('eye',18)}使用预览</h2><span id="pe-count"></span>
          </div>
          <div class="pe-preview-body" id="pe-output"></div>
          <div class="pe-preview-foot">${icon('copy',14)}使用时复制此处的纯文本。</div>
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
  const sourceInput = editor.querySelector('#pe-raw');
  const mirror = editor.querySelector('.pe-mirror');
  const output = editor.querySelector('#pe-output');
  const count = editor.querySelector('#pe-count');
  const changes = editor.querySelector('.pe-changes');
  const changesBody = changes.querySelector('.pe-change-text');
  const use = editor.querySelector('[data-ed="use"]');
  const save = editor.querySelector('[data-ed="save"]');
  let rawDiff = [];

  function compare(base, current) {
    return existing ? window.PromptDiff.compare(base, current) : [{type:'equal', text:current}];
  }
  function syncScroll() {
    mirror.scrollTop = sourceInput.scrollTop;
    mirror.scrollLeft = sourceInput.scrollLeft;
  }
  function renderComparison() {
    if (!changes.open || changes.hidden) return;
    changesBody.innerHTML = rawDiff.map(part => {
      const text = safe(part.text);
      if (part.type === 'insert') return '<ins class="pe-added">' + text + '</ins>';
      if (part.type === 'delete') return '<del class="pe-deleted">' + text + '</del>';
      return text;
    }).join('');
  }
  function updateActions(text = model.render(sourceInput.value)) {
    use.disabled = copying || !text.trim();
    save.disabled = copying || !sourceInput.value.trim();
  }
  function refreshDraft() {
    const body = sourceInput.value;
    const parts = model.parse(body);
    const rawRuns = parts.map(part => ({text:part.raw, slot:part.type === 'slot'}));
    const outputRuns = parts.map(part => ({text:part.type === 'slot' ? part.defaultValue : part.text, slot:part.type === 'slot'}));
    const text = outputRuns.map(run => run.text).join('');
    rawDiff = compare(original, body);
    mirror.innerHTML = highlightDraft(rawRuns, rawDiff, safe, true) + '\n';
    syncScroll();

    // Bracket syntax and default alternatives change the copied offsets.
    // Compare on the expanded strings as well so the preview matches the clipboard.
    const outputDiff = original === originalOutput && body === text ? rawDiff : compare(originalOutput, text);
    output.classList.toggle('pe-placeholder', !text);
    output.innerHTML = text ? highlightDraft(outputRuns, outputDiff, safe) : '编辑后可在这里核对复制内容。';
    count.textContent = Array.from(text).length + ' 字符';
    let groups = 0;
    rawDiff.forEach((part, i) => {
      if (part.type !== 'equal' && (!i || rawDiff[i - 1].type === 'equal')) groups += 1;
    });
    changes.hidden = !groups;
    if (groups) {
      changes.querySelector('small').textContent = groups + ' 处改动';
      renderComparison();
    } else {
      changes.open = false;
      changesBody.replaceChildren();
    }
    updateActions(text);
  }
  sourceInput.value = original;
  sourceInput.addEventListener('input', refreshDraft);
  sourceInput.addEventListener('scroll', syncScroll);
  changes.addEventListener('toggle', renderComparison);

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
          body: sourceInput.value, description: '', source: record.source
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
    const text = model.render(sourceInput.value);
    if (copying || !text.trim()) return;
    copying = true;
    updateActions();
    try {
      await copy(text);
    } catch {
      copying = false;
      updateActions();
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

  editor.querySelector('[data-ed="back"]').onclick = onCancel;
  editor.querySelector('[data-ed="cancel"]').onclick = onCancel;
  save.onclick = openSave;
  use.onclick = usePrompt;
  refreshDraft();
  sourceInput.focus({preventScroll:true});
}

window.openPromptEditor = openPromptEditor;
