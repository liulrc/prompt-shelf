'use strict';

function createPromptOptimizer({desktop, icon, escape, copy, notify, edit}) {
  let view;
  let draft = '';
  let sourceText = '';
  let results = [];
  let running = false;
  let settings = {baseURL:'', models:[]};
  let chosen = new Set();
  let revision = 0;
  let configError = '';
  let loading = false;

  function renderControls() {
    if (!view?.isConnected) return;
    const picker = view.querySelector('.ai-choices');
    picker.replaceChildren();
    for (const model of settings.models) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = chosen.has(model);
      check.value = model;
      check.disabled = running;
      label.append(check,document.createTextNode(model));
      picker.append(label);
    }
    view.querySelector('#ai-target').textContent = !desktop ? '请在桌面版设置中配置模型接口后使用。'
      : configError || (loading ? '正在读取模型设置…' : settings.models.length ? settings.baseURL : '请先在设置中添加模型接口，并选择可用模型。');
    updateSubmit();
  }
  function updateSubmit() {
    if (!view?.isConnected) return;
    const button = view.querySelector('#ai-submit');
    button.disabled = !desktop || running || loading || !!configError || !settings.baseURL || !chosen.size || !draft.trim();
    button.textContent = running ? '优化中…' : '一键优化';
    view.querySelector('#ai-input').readOnly = running;
  }
  function setConfig(value) {
    const models = [...new Set((value?.models || []).filter(id => typeof id === 'string' && id))];
    const baseURL = value?.baseURL || '';
    if (baseURL !== settings.baseURL || JSON.stringify(models) !== JSON.stringify(settings.models)) {
      chosen = new Set(models);
      revision++;
    }
    settings = {baseURL,models};
    configError = '';
    loading = false;
    renderControls();
  }
  let requestNumber = 0;
  if (desktop) desktop.on('ai.settings.changed', value => {
    requestNumber++;
    revision++;
    setConfig(value);
  });
  async function load() {
    if (!desktop) return;
    const request = ++requestNumber;
    loading = true; renderControls();
    try {
      const value = await desktop.request('ai.settings.get');
      if (request === requestNumber) setConfig(value);
    } catch (error) {
      if (request !== requestNumber) return;
      configError = error.message || '读取模型设置失败。';
      loading = false; renderControls();
    }
  }
  function renderResults() {
    if (!view?.isConnected) return;
    const section = view.querySelector('.ai-results');
    section.hidden = !results.length;
    view.querySelector('#ai-results-title').textContent = sourceText === draft ? '优化结果' : '上一次优化结果';
    const list = view.querySelector('.ai-result-list');
    list.innerHTML = results.map((item,index) => {
      const actions = item.text ? '<div class="ai-result-actions"><button type="button" class="btn" data-ai-copy="'+index+'">复制</button><button type="button" class="btn" data-ai-edit="'+index+'">在编辑器中打开</button></div>' : '';
      return '<article class="ai-result"><header><h3>'+escape(item.model)+'</h3>'+actions+'</header>' +
        (item.text ? '<pre>'+escape(item.text)+'</pre>' : '<p class="ai-model-status">'+escape(item.error || item.status)+'</p>') + '</article>';
    }).join('');
  }
  async function optimize() {
    if (!desktop || running || loading || configError || !draft.trim() || !chosen.size || !settings.baseURL) return;
    running = true;
    sourceText = draft;
    const batchRevision = revision;
    results = Array.from(chosen,model=>({model,status:'等待发送…'}));
    const queue = results.values();
    async function work() {
      for (const item of queue) {
        if (batchRevision !== revision) { item.error = '设置已更改，本条请求已取消。'; continue; }
        item.status = '正在优化…';
        renderResults();
        try {
          const value = await desktop.request('ai.optimize',{model:item.model,text:sourceText});
          if (typeof value?.text !== 'string' || !value.text.trim()) throw Error('模型返回了空内容。');
          item.text = value.text;
        } catch (error) { item.error = error.message || '优化失败，请重试。'; }
        renderResults();
      }
    }
    renderControls();
    try { await Promise.all(Array.from({length:Math.min(3,results.length)},work)); }
    finally { running = false; renderControls(); renderResults(); }
  }

  return function mount(host) {
    view = host;
    host.innerHTML = '<div class="page-intro"><div><h1>AI 优化提示词</h1><p>可输入任意语言的原文。优化后的提示词默认使用中文，并保留原文对任务输出语言的要求。</p></div></div>' +
      '<section class="ai-compose"><label for="ai-input">原始提示词</label><textarea id="ai-input" placeholder="例如：帮我把这份项目周报整理成发给客户的进度邮件。"></textarea>' +
      '<div class="ai-options"><div class="ai-options-head"><h2>优化模型</h2>' +
      (desktop ? '<button type="button" class="ai-config" data-act="settings">'+icon('keyboard',15)+'模型设置</button>' : '') +
      '</div><div class="ai-choices"></div><p id="ai-target"></p></div><div class="ai-submit-row"><button type="button" id="ai-submit" class="btn gold">一键优化</button></div></section>' +
      '<section class="ai-results" hidden><h2 id="ai-results-title">优化结果</h2><div class="ai-result-list" aria-live="polite"></div></section>';
    const input = host.querySelector('#ai-input');
    input.value = draft;
    input.oninput = () => {
      draft = input.value; updateSubmit();
      host.querySelector('#ai-results-title').textContent = sourceText === draft ? '优化结果' : '上一次优化结果';
    };
    host.querySelector('.ai-choices').onchange = event => {
      const check = event.target;
      if (check.checked) chosen.add(check.value); else chosen.delete(check.value);
      updateSubmit();
    };
    host.querySelector('#ai-submit').onclick = optimize;
    host.querySelector('.ai-result-list').onclick = async event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.aiCopy !== undefined) {
        try { await copy(results[Number(button.dataset.aiCopy)].text); notify('优化结果已复制'); }
        catch (error) { notify(error.message); }
      } else if (button.dataset.aiEdit !== undefined) {
        edit(results[Number(button.dataset.aiEdit)].text);
      }
    };
    renderResults(); renderControls(); load();
  };
}
