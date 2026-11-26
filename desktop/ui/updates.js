(() => {
  'use strict';
  const desktop = window.PromptDesktop;
  const node = id => document.getElementById('update-' + id);
  const action = node('action'), automatic = node('auto');
  const stages = {
    idle: ['检查词匣版本', '检查更新'],
    checking: ['正在检查更新…', '正在检查…'],
    current: ['已是最新版本', '重新检查'],
    available: ['发现新版本', '更新并重启'],
    downloading: ['正在下载安装包…', '正在下载…'],
    verifying: ['正在校验安装包…', '正在校验…'],
    ready: ['更新已就绪', '安装并重启'],
    installing: ['正在安装更新…', '正在安装…'],
    error: ['更新遇到问题', '重新检查']
  };
  let state, loading = false, saving = false, events = 0, feedback = '';
  function render() {
    const phase = state?.phase || 'idle';
    const [title, label] = stages[phase] || stages.idle;
    const working = ['checking','downloading','verifying','installing'].includes(phase);
    const ahead = phase === 'current' && state.latest && state.current !== state.latest;
    node('title').textContent = !state ? '读取更新设置' : ahead ? '已安装更高版本' : title;
    node('versions').textContent = state?.current ? '已安装 ' + state.current +
      (state.latest && state.latest !== state.current ? '　·　发布版本 ' + state.latest : '') : '';
    action.textContent = state ? label : '重试';
    action.disabled = loading || working;
    automatic.checked = state?.automatic === true;
    automatic.disabled = !state || saving || phase === 'installing';
    node('status').textContent = feedback || state?.error || (phase === 'ready' ?
      '请完成并保存正在编辑的内容，再安装更新。' : '');
    const date = state?.lastChecked ? new Date(state.lastChecked) : null;
    node('installer').hidden = state?.hasInstaller !== true || working;
    node('installer').disabled = loading;
    node('time').textContent = date && Number.isFinite(date.getTime()) ?
      '上次检查　' + date.toLocaleString('zh-CN',{hour12:false}) : '';
    const notes = typeof state?.notes === 'string' ? state.notes.trim() : '';
    node('notes').hidden = !notes;
    node('notes').querySelector('pre').textContent = notes;
    node('progress-wrap').hidden = !['downloading','verifying','installing'].includes(phase);
    if (phase === 'downloading' && typeof state.progress === 'number' && state.progress >= 0)
      node('progress').value = Math.min(100, state.progress);
    else node('progress').removeAttribute('value');
  }
  function accept(value) {
    if (!value || !Object.hasOwn(stages, value.phase)) throw Error('无法读取更新状态，请重新打开设置后重试。');
    state = value;
  }
  async function run(command, payload = {}) {
    const prefs = command === 'update.preferences';
    if (prefs ? saving : loading) return;
    if (prefs) saving = true; else loading = true;
    feedback = ''; render();
    const sequence = events;
    try {
      const value = await desktop.request(command, payload);
      if (events === sequence) accept(value);
    } catch (error) {
      feedback = error.message || '无法检查更新，请稍后重试。';
    } finally {
      if (prefs) saving = false; else loading = false;
      render();
    }
  }
  desktop.on('update.changed', value => {
    try { accept(value); events++; feedback = ''; } catch (error) { feedback = error.message; }
    render();
  });
  action.onclick = () => run(!state ? 'update.get' :
    ['available','ready'].includes(state.phase) ? 'update.apply' : 'update.check');
  node('installer').onclick = () => run('update.openInstaller');
  automatic.onchange = () => run('update.preferences',{automatic:automatic.checked});
  run('update.get');
})();
