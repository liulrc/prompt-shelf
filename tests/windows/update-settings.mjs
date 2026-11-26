import assert from 'node:assert/strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(path) {
  let info;
  for (let i = 0; i < 100 && !info; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9246/json/list')).json();
      info = list.find(item => item.type === 'page' && item.url.startsWith('https://app.cixia.local/' + path));
    } catch {}
    if (!info) await sleep(300);
  }
  assert.ok(info, 'Missing installed page ' + path);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let next = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const message = JSON.parse(e.data), handle = waiting.get(message.id);
    if (!handle) return;
    waiting.delete(message.id);
    clearTimeout(handle.timeout);
    if (message.error || message.result?.exceptionDetails) handle.fail(new Error(JSON.stringify(message)));
    else handle.ok(message.result.result.value);
  };
  const evaluate = expression => new Promise((ok, fail) => {
    const id = ++next;
    const timeout = setTimeout(() => { waiting.delete(id); fail(new Error('Bridge evaluation timed out')); }, 30000);
    waiting.set(id, {ok, fail, timeout});
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, awaitPromise:true, returnByValue:true}}));
  });
  for (let i = 0; i < 30 && !await evaluate('Boolean(window.PromptDesktop?.active)'); i++) await sleep(200);
  assert.ok(await evaluate('Boolean(window.PromptDesktop?.active)'));
  return {evaluate, close:() => ws.close(), request:(cmd, data = {}) =>
    evaluate('window.PromptDesktop.request(' + JSON.stringify(cmd) + ',' + JSON.stringify(data) + ')')};
}
const main = await page('index.html');
await assert.rejects(main.request('update.get'), /设置/);
await main.request('window.open', {area:'settings', pane:'models'});
const settings = await page('desktop/ui/settings.html');
try {
  const before = await settings.request('update.get');
  assert.equal(before.current, '1.4.0');
  assert.equal(before.automatic, false);
  await settings.request('update.check');
  let state;
  for (let i = 0; i < 160; i++) {
    state = await settings.request('update.get');
    if (!['idle','checking'].includes(state.phase)) break;
    await sleep(500);
  }
  assert.ok(['current','available'].includes(state.phase), JSON.stringify(state));
  assert.ok(Date.parse(state.lastChecked));
  const enabled = await settings.request('update.preferences', {automatic:true});
  assert.equal(enabled.automatic, true);
  const disabled = await settings.request('update.preferences', {automatic:false});
  assert.equal(disabled.automatic, false);
  console.log('WebView2 native bridge verified, latest release', state.latest, 'phase', state.phase, 'last checked', state.lastChecked);
} finally { settings.close(); main.close(); }
