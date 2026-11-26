// Browser contract test. Native installer tests exercise the corresponding system operations.
import assert from 'node:assert/strict';

export async function exerciseUpdateSettings(page, capturePath) {
  const url = new URL('../desktop/ui/settings.html',import.meta.url).href;
  function fixture() {
    const state = {phase:'idle', current:'1.4.0', latest:'', notes:'', lastChecked:'', automatic:false, error:''};
    window.calls = [];
    window.publish = patch => {
      Object.assign(state, patch);
      window.PromptDesktop.receive({event:'update.changed',data:{...state}});
    };
    window.chrome = window.chrome || {};
    window.chrome.webview = {postMessage({id,command,payload}) {
      window.calls.push({command,payload});
      let result;
      switch (command) {
      case 'settings.get': case 'settings.set':
        result = {hotkeys:{},monitoring:true,showTrayIcon:true}; break;
      case 'ai.settings.get': result = {baseURL:'',hasKey:false,models:[]}; break;
      case 'update.check': window.publish({phase:'checking',error:''}); break;
      case 'update.preferences': window.publish({automatic:payload.automatic}); break;
      case 'update.apply': window.publish({phase:'downloading',progress:30}); break;
      }
      queueMicrotask(()=>window.PromptDesktop.receive({id,result:result || {...state}}));
    }};
  }
  const hook = await page.cdp('Page.addScriptToEvaluateOnNewDocument',{
    source:'if (location.href === '+JSON.stringify(url)+') ('+fixture.toString()+')()'
  });
  const read = selector => page.evaluate(q=>document.querySelector(q).textContent,selector);
  try {
    await page.goto('about:blank'); await page.goto(url);
    await page.waitForSelector('#tab-general');
    await page.waitForFunction(()=>document.querySelector('#monitoring').checked);
    assert.equal(await page.evaluate(()=>window.calls.some(c=>c.command==='ai.settings.get')),false);
    await page.click('#monitoring');
    assert.equal(await page.evaluate(()=>window.promptShelfCanRestartForUpdate()),false);
    await page.click('#save');
    await page.waitForFunction(()=>window.promptShelfCanRestartForUpdate());
    await page.press('#tab-general','End');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-updates');
    await page.click('#update-action');
    assert.equal(await read('#update-title'),'正在检查更新…');
    await page.evaluate(()=>window.publish({phase:'error',error:'网络已断开'}));
    assert.match(await read('#update-status'),/网络/);
    await page.click('#update-action');
    await page.evaluate(()=>window.publish({phase:'current',latest:'1.4.0',lastChecked:new Date().toISOString()}));
    await page.waitForFunction(()=>document.querySelector('#update-title').textContent==='已是最新版本');
    if (capturePath) await page.screenshot({path:capturePath});
    await page.click('#update-auto');
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.command==='update.preferences').at(-1).payload.automatic),true);
    await page.evaluate(()=>window.publish({phase:'available',latest:'1.5.0',notes:'<img src=x onerror="bad()">更新说明'}));
    assert.equal(await page.evaluate(()=>document.querySelector('#update-notes pre').children.length),0);
    await page.click('#update-action');
    assert.equal(await page.evaluate(()=>document.querySelector('#update-progress').value),30);
    for(const phase of ['verifying','ready','installing']) {
      await page.evaluate(value=>window.publish({phase:value}),phase);
      assert.equal(await page.evaluate(()=>document.querySelector('#update-action').disabled),phase!=='ready');
    }
    await page.evaluate(()=>window.publish({phase:'error',hasInstaller:true,error:'请确认系统提示。'}));
    await page.click('#update-installer');
    assert.equal(await page.evaluate(()=>window.calls.at(-1).command),'update.openInstaller');
    await page.evaluate(()=>window.PromptDesktop.receive({event:'route',data:{pane:'models'}}));
    await page.waitForFunction(()=>!document.querySelector('#pane-models').hidden && !document.querySelector('#ai-key').disabled);
    await page.fill('#ai-key','test-value');
    assert.equal(await page.evaluate(()=>window.promptShelfCanRestartForUpdate()),false);
    await page.fill('#ai-key','');
    assert.equal(await page.evaluate(()=>window.promptShelfCanRestartForUpdate()),true);
    console.log('PASS updater actions, events, latest version, progress, safe notes, failure/retry, preference, dirty drafts and keyboard navigation');
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier});
  }
}
