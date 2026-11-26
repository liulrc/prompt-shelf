// Real Chromium text drops and a local stand-in for the native AI/clipboard bridge.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

function mockService() {
  const memory = new Map();
  Object.defineProperty(window,'localStorage',{value:{
    get length(){return memory.size;}, key:i=>[...memory.keys()][i],
    getItem:key=>memory.get(key) ?? null, setItem:(key,value)=>memory.set(key,String(value)), removeItem:key=>memory.delete(key)
  }});
  const seed = {id:'seed', title:'测试拼接段', category:'办公', body:'保留【例：中文】', order:1};
  memory.set('prompt-desk:v1:personal:seed',JSON.stringify(seed));
  let config = {baseURL:'https://example.test/v1',models:['good','fails'],hasKey:true};
  window.calls = [];
  window.webkit = {messageHandlers:{desktop:{postMessage({command,payload,id}) {
    window.calls.push({command,payload});
    const reply = result=>queueMicrotask(()=>window.PromptDesktop.receive({id,result}));
    if (command === 'ai.settings.get') reply(config);
    else if (command === 'ai.settings.set') {
      config = {baseURL:payload.baseURL,models:payload.models,hasKey:payload.apiKey === undefined ? config.hasKey : !!payload.apiKey};
      reply(config);
    } else if (command === 'ai.models.list') {
      const models = payload.baseURL.includes('second') ? ['second-a','second-b'] : ['good','fails','other'];
      reply({models});
    } else if (command === 'ai.optimize') {
      setTimeout(()=>window.PromptDesktop.receive(payload.model === 'fails' ? {id,error:'测试服务暂时不可用'} :
        {id,result:{model:payload.model,text:'请用英语写一封邮件，列出会议结论和下一步行动。'}}),110);
    } else if (command === 'settings.get') reply({hotkeys:{shelf:'Alt+Q'},monitoring:true,showTrayIcon:true});
    else reply(true);
  }}}};
}
export async function exerciseWorkspace(page) {
  const main = new URL('../index.html',import.meta.url).href;
  const settings = new URL('../desktop/ui/settings.html',import.meta.url).href;
  const hook = await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:
    'if ('+JSON.stringify([main,settings])+'.includes(location.href.split("#")[0])) ('+mockService.toString()+')()'});
  try {
    await page.goto('about:blank'); await page.goto(main+'#builtin'); await page.waitForSelector('[data-nav="optimize"]');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('[data-nav]')].slice(0,3).map(x=>x.dataset.nav)),['optimize','personal','builtin']);
    await page.focus('[data-select="project-reader"]');
    await page.press('[data-select="project-reader"]','ArrowDown');
    assert.equal(await page.evaluate(()=>document.querySelector('.template-select[aria-pressed=true]').dataset.select),'deepen-question');
    await page.fill('#search','具体方法、工具');
    assert.equal(await page.evaluate(()=>document.querySelector('.catalog-inspector h2').textContent),'把问题问得更深');
    await page.click('[data-copy-template="deepen-question"]');
    assert.ok(await page.evaluate(()=>window.calls.some(v=>v.command==='clipboard.write' && v.payload.text.includes('图书馆') && !v.payload.text.includes('【例：'))));
    await page.click('[data-nav=history]');
    assert.ok(await page.evaluate(()=>document.querySelector('.history-text').textContent.includes('图书馆')));
    await page.click('[data-nav=builtin]');
    await page.click('.card[data-open="project-reader"]');
    await page.fill('#pe-raw','前段\n\n尾段');
    await page.fill('.pe-reuse-search input','测试拼接段');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.pe-snippet').length),1);
    const geometry = await page.evaluate(()=>{
      const field=document.querySelector('#pe-raw'), b=field.getBoundingClientRect(), panel=document.querySelector('.pe-reuse').getBoundingClientRect();
      const s=getComputedStyle(field);
      return {right:panel.x>b.right,offset:{x:parseInt(s.paddingLeft)+1,y:parseInt(s.paddingTop)+1.45*parseFloat(s.lineHeight)}};
    });
    assert.ok(geometry.right);
    await page.dragAndDrop('.pe-snippet','#pe-raw',{targetPosition:geometry.offset});
    const dropped = await page.evaluate(()=>document.querySelector('#pe-raw').value);
    assert.equal(dropped,'前段\n保留【例：中文】\n尾段');
    assert.ok(await page.evaluate(()=>document.querySelector('.pe-mirror .pe-added') && document.querySelector('#pe-output').textContent.includes('保留中文')));
    await page.evaluate(()=>document.querySelector('#pe-raw').setSelectionRange(0,2));
    await page.focus('.pe-snippet'); await page.press('.pe-snippet','Enter');
    assert.match(await page.evaluate(()=>document.querySelector('#pe-raw').value),/^保留【例：中文】\n保留/);

    await page.click('[data-nav=optimize]');
    await page.waitForSelector('.ai-choices input[value=good]');
    assert.match(await page.evaluate(()=>document.querySelector('.page-intro p').textContent),/默认使用中文.*任务输出语言/);
    const englishInput = 'Summarize the meeting in an English email.';
    const chineseResult = '请用英语写一封邮件，列出会议结论和下一步行动。';
    await page.fill('#ai-input',englishInput);
    await page.click('#ai-submit');
    await page.click('[data-nav=personal]');
    await page.click('[data-nav=optimize]');
    await page.waitForSelector('[data-ai-copy]');
    assert.ok(await page.evaluate(()=>document.querySelector('.ai-result-list').textContent.includes('测试服务暂时不可用')));
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.ai-result').length),2);
    await page.click('[data-ai-copy]');
    assert.equal(await page.evaluate(()=>window.calls.findLast(v=>v.command==='clipboard.write').payload.text),chineseResult);
    await page.click('[data-ai-edit]');
    assert.equal(await page.evaluate(()=>document.querySelector('#pe-raw').value),chineseResult);
    await page.click('[data-ed=cancel]');
    assert.equal(await page.evaluate(()=>document.querySelector('#ai-input').value),englishInput);
    await page.click('.ai-choices input[value=fails]'); await page.click('#ai-submit');
    await page.waitForFunction(()=>document.querySelectorAll('.ai-result').length===1 && !!document.querySelector('[data-ai-edit]'));
    const runs = await page.evaluate(()=>window.calls.filter(v=>v.command==='ai.optimize').map(v=>v.payload));
    assert.deepEqual(runs.map(v=>v.model),['good','fails','good']);
    assert.ok(runs.every(v=>v.text===englishInput));

    await page.click('[data-pane=models]');
    assert.deepEqual(await page.evaluate(()=>window.calls.findLast(v=>v.command==='window.open').payload),{area:'settings',pane:'models'});
    await page.click('#ai-clear-draft');
    assert.equal(await page.evaluate(()=>document.querySelector('#ai-input').value),'');
    assert.ok(await page.evaluate(()=>document.querySelector('.ai-results').hidden));
    await page.goto(settings); await page.click('#tab-models'); await page.waitForSelector('#ai-model-list input[value=good]');
    assert.equal(await page.evaluate(()=>document.querySelector('#ai-key').value),'');
    assert.deepEqual(await page.evaluate(()=>window.calls.find(v=>v.command==='ai.models.list').payload),{baseURL:'https://example.test/v1'});
    await page.fill('#ai-base','https://second.example.test/v1');
    await page.fill('#ai-key','FAKE-IN-MEMORY');
    await page.focus('#ai-model-query');
    await page.waitForSelector('#ai-model-list input[value=second-b]');
    await page.click('#ai-model-list input[value=second-b]');
    await page.fill('#ai-model-query','custom-model'); await page.press('#ai-model-query','Enter');
    await page.click('#ai-save');
    await page.waitForFunction(()=>document.querySelector('#ai-feedback').textContent.includes('已保存'));
    const payload = () => page.evaluate(()=>window.calls.findLast(c=>c.command==='ai.settings.set').payload);
    assert.deepEqual(await payload(),{baseURL:'https://second.example.test/v1',models:['second-b','custom-model'],apiKey:'FAKE-IN-MEMORY'});
    assert.equal(await page.evaluate(()=>document.querySelector('#ai-key').value),'');
    await page.click('#ai-save'); assert.equal('apiKey' in await payload(),false);
    await page.click('#ai-clear'); await page.click('#ai-save'); assert.equal((await payload()).apiKey,'');
    console.log('PASS actual text drop/selection insertion, template highlighting and order, multi/single model runs, partial failures, draft recovery, copy/edit, settings discovery/manual names and secret omission/clearing');
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier});
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  function runner(code) {
    const child = spawnSync('ego-browser',['nodejs'],{input:code,encoding:'utf8',timeout:90000});
    if (child.error) throw child.error;
    if (child.status!==0) throw Error(child.stderr || child.stdout);
    return child.stdout + child.stderr;
  }
  const created=runner('const t=await taskSpace("词匣模板工作台回归 '+Date.now()+'");console.log("SPACE="+t.spaceId)');
  const id=Number(created.match(/SPACE=(\d+)/)?.[1]);assert.ok(id>0);
  try { console.log(runner('const m=await import('+JSON.stringify(import.meta.url)+');await m.exerciseWorkspace((await taskSpace('+id+')).page("p1"));')); }
  finally {runner('await (await taskSpace('+id+')).finish({keep:[]})');}
}
