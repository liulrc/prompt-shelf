(() => {
  'use strict';
  const desktop = window.PromptDesktop;
  const form = document.querySelector('#settings');
  const monitoring = document.querySelector('#monitoring');
  const trayIcon = document.querySelector('#show-tray-icon');
  const message = document.querySelector('#message');
  const save = document.querySelector('#save');
  const hotkeys = document.querySelector('#hotkeys');
  const actions = [
    ['capture', '截取屏幕', 'Alt+A'], ['shelf', '剪贴板历史栏', 'Alt+Q'],
    ['pin', '近期截图库', 'Alt+Z'], ['templates', '我的提示词', 'Alt+X']
  ];
  const modifiers = ['Alt','Ctrl','Shift','Ctrl+Alt','Ctrl+Shift','Alt+Shift','Ctrl+Alt+Shift'];
  const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ...Array.from({length:12}, (_,i) => 'F' + (i + 1))];
  let loaded = false;
  let saving = false;
  const controls = new Map();
  const isMac = /mac/i.test(navigator.platform);
  if (!isMac) document.querySelector('#tray-label').textContent = '显示系统托盘图标';
  document.querySelector('#quit').onclick = () => desktop.request('app.quit').catch(error => { message.textContent = error.message; });
  function select(label, values, format) {
    const node = document.createElement('select');
    node.setAttribute('aria-label', label);
    for (const value of values) node.add(new Option(format ? format(value) : value, value));
    return node;
  }
  function pretty(value) {
    return value.split('+').map(key => isMac ? {Ctrl:'⌃ Control', Alt:'⌥ Option', Shift:'⇧ Shift'}[key] : key).join(' + ');
  }
  for (const [action, label] of actions) {
    const row = document.createElement('div'); row.className = 'ds-key';
    const name = document.createElement('strong'); name.textContent = label;
    const mod = select(label + '修饰键', modifiers, pretty), key = select(label + '主键', keys);
    row.append(name, mod, document.createTextNode('＋'), key); hotkeys.append(row);
    controls.set(action, {mod,key});
  }
  function applyHotkeys(map) {
    for (const [action,,fallback] of actions) {
      const parts = String(map[action] || fallback).split('+');
      const {mod,key} = controls.get(action);
      key.value = parts.pop().toUpperCase();
      const bits = parts.map(v => ({CONTROL:'Ctrl',OPTION:'Alt',CTRL:'Ctrl',ALT:'Alt',SHIFT:'Shift'})[v.toUpperCase()] || v);
      mod.value = ['Ctrl','Alt','Shift'].filter(k => bits.includes(k)).join('+');
      if (!key.value || !mod.value) {
        mod.add(new Option(bits.join(' + '), bits.join('+'))); mod.value = bits.join('+');
        if (!key.value) {
          const previous = String(map[action]).split('+').pop();
          key.add(new Option(previous, previous)); key.value = previous;
        }
      }
    }
  }
  function setEnabled(value) {
    for (const control of form.elements) control.disabled = !value;
  }
  document.querySelector('#defaults').onclick = () => { applyHotkeys({}); message.textContent = '已填入默认快捷键，保存后生效。'; };
  form.onchange = () => { message.textContent = ''; };
  desktop.on('settings.changed', value => {
    if (typeof value?.monitoring === 'boolean') monitoring.checked = value.monitoring;
  });
  form.onsubmit = async event => {
    event.preventDefault();
    if (!loaded || saving) return;
    const hotkeys = Object.fromEntries([...controls].map(([action, {mod,key}]) => [action, mod.value + '+' + key.value]));
    if (new Set(Object.values(hotkeys)).size !== actions.length) {
      message.textContent = '有两项使用同一快捷键，请选择不同组合。'; return;
    }
    saving = true; setEnabled(false); message.textContent = '正在应用…';
    try {
      const value = await desktop.request('settings.set', {hotkeys, monitoring:monitoring.checked, showTrayIcon:trayIcon.checked});
      message.textContent = '设置已保存。' + (value?.hotkeyIssue || '');
    } catch (error) { message.textContent = error.message || '设置未保存，请重试。'; }
    finally { saving = false; setEnabled(true); save.focus(); }
  };
  async function load() {
    setEnabled(false); applyHotkeys({});
    try {
      const value = await desktop.request('settings.get');
      applyHotkeys(value.hotkeys || {}); monitoring.checked = !!value.monitoring;
      trayIcon.checked = value.showTrayIcon !== false;
      if (value.hotkeyIssue) message.textContent = String(value.hotkeyIssue);
      loaded = true; setEnabled(true);
    } catch (error) { message.textContent = error.message; }
  }
  load();
})();
