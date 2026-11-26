(() => {
  'use strict';

  const desktop = window.PromptDesktop;
  const form = document.querySelector('#ai-settings');
  const field = id => form.querySelector('#ai-'+id);
  const base = field('base'), key = field('key'), clear = field('clear'), query = field('model-query');
  const list = field('model-list'), fetchButton = field('fetch'), add = field('add-model'), save = field('save');
  const feedback = field('feedback');
  const address = raw => raw.trim().replace(/\/+$/,'');
  let saved = {baseURL:'',models:[],hasKey:false};
  let available = [];
  let selected = new Set();
  let lastAddress = '';
  let keyAddress = '';
  let request = 0;
  let loading = true;
  let fetching = false;
  let saving = false;

  function secret() {
    if (key.value || clear.checked) return {apiKey:key.value};
    return {};
  }
  function updateControls() {
    const disabled = saving || loading;
    base.disabled = key.disabled = clear.disabled = query.disabled = disabled;
    fetchButton.disabled = disabled || fetching || !base.value.trim();
    fetchButton.textContent = fetching ? '正在拉取…' : '拉取模型列表';
    add.disabled = disabled || !query.value.trim();
    save.disabled = disabled;
    field('clear-row').hidden = !(saved.hasKey && address(saved.baseURL) === address(base.value));
    key.placeholder = saved.hasKey && !field('clear-row').hidden && !clear.checked ? '已保存，留空可沿用' : '需要认证时填写';
    field('model-count').textContent = selected.size ? '已选 '+selected.size+' 个模型，可在工作台切换或同时使用。' : '勾选一个或多个模型，或输入模型名称后添加。';
  }
  function draw() {
    const needle = query.value.trim().toLocaleLowerCase();
    const ids = [...new Set([...selected,...available])].filter(id=>id.toLocaleLowerCase().includes(needle));
    const nodes = document.createDocumentFragment();
    for (const id of ids) {
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox'; check.value = id; check.checked = selected.has(id);
      check.disabled = loading || saving;
      label.append(check,document.createTextNode(id)); nodes.append(label);
    }
    list.replaceChildren(nodes);
    list.hidden = !ids.length;
    updateControls();
  }
  function invalidateFetch() {
    request++;
    fetching = false;
    feedback.textContent = '';
  }
  async function fetchModels() {
    if (fetching || saving || loading || !base.value.trim() || !base.reportValidity()) return;
    const turn = ++request;
    fetching = true; feedback.textContent = '正在读取服务提供的模型…'; updateControls();
    try {
      const value = await desktop.request('ai.models.list',{baseURL:base.value.trim(),...secret()});
      if (turn !== request) return;
      available = [...new Set((value.models || []).filter(id=>typeof id==='string' && id))];
      feedback.textContent = available.length ? '已读取 '+available.length+' 个模型。' : '服务返回了空列表，可以手动填写模型名。';
      if (!selected.size && available.length === 1) selected.add(available[0]);
    } catch (error) {
      if (turn === request) feedback.textContent = error.message || '拉取失败，可手动输入模型名。';
    } finally {
      if (turn === request) { fetching = false; draw(); }
    }
  }
  base.oninput = () => {
    invalidateFetch();
    const next = address(base.value);
    if (next !== lastAddress) {
      if (keyAddress && keyAddress !== next) { key.value = ''; keyAddress = ''; }
      clear.checked = false;
      available = [];
      selected = new Set(next === address(saved.baseURL) ? saved.models : []);
      lastAddress = next;
      draw();
    } else updateControls();
  };
  base.onchange = () => { if (base.value.trim() && base.validity.valid) fetchModels(); };
  key.oninput = () => {
    invalidateFetch(); keyAddress = address(base.value);
    if (key.value) clear.checked = false;
    updateControls();
  };
  key.onchange = () => { if (key.value && base.value.trim() && base.validity.valid) fetchModels(); };
  clear.onchange = () => {
    invalidateFetch();
    if (clear.checked) key.value = '';
    updateControls();
  };
  query.oninput = draw;
  function addModel() {
    const id = query.value.trim();
    if (!id || saving || loading) return;
    selected.add(id); query.value = '';
    feedback.textContent = ''; draw(); query.focus();
  }
  query.onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); addModel(); }
  };
  add.onclick = addModel;
  list.onchange = event => {
    const check = event.target;
    if (check.checked) selected.add(check.value); else selected.delete(check.value);
    feedback.textContent = ''; updateControls();
  };
  fetchButton.onclick = fetchModels;
  function useSaved(value) {
    saved = value;
    base.value = value.baseURL || '';
    lastAddress = address(base.value);
    key.value = ''; keyAddress = ''; clear.checked = false;
    selected = new Set(value.models || []);
    draw();
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (loading || saving) return;
    if (!base.value.trim() && (selected.size || key.value)) {
      feedback.textContent = '请先填写接口地址。'; base.focus(); return;
    }
    invalidateFetch(); saving = true; draw();
    try {
      const value = await desktop.request('ai.settings.set',{baseURL:base.value.trim(),models:[...selected],...secret()});
      useSaved(value);
      feedback.textContent = '模型配置已保存。';
    } catch (error) { feedback.textContent = error.message || '模型配置未保存。'; }
    finally { saving = false; draw(); }
  };
  draw();
  desktop.request('ai.settings.get').then(value=>{
    loading = false; useSaved(value);
    if (base.value) fetchModels();
  }).catch(error=>{ feedback.textContent = error.message || '读取模型配置失败。'; });
})();
