// Real pointer input with a mock desktop bridge. Run with Node 22+ and ego-browser:
// node tests/editor-browser.mjs
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

function mockNative() {
  window.outputs = {};
  window.webkit = {messageHandlers:{desktop:{postMessage({command,payload,id}) {
    window.outputs[command] = payload;
    queueMicrotask(() => window.PromptDesktop.receive({id,result:{}}));
  }}}};
}
function makeCapture({width,height,frameHeight}) {
  const source = document.createElement('canvas');
  source.width = width; source.height = height;
  const ctx = source.getContext('2d');
  const pattern = document.createElement('canvas'); pattern.width = pattern.height = 4;
  const p = pattern.getContext('2d');
  p.fillStyle = '#fff'; p.fillRect(0,0,4,4);
  p.fillStyle = '#111'; p.fillRect(0,0,2,2); p.fillRect(2,2,2,2);
  ctx.fillStyle = ctx.createPattern(pattern,'repeat'); ctx.fillRect(0,0,width,height);
  window.outputs = {};
  window.PromptDesktop.receive({event:'capture.ready',data:{id:'fixture',mime:'image/png',title:'测试图',
    data:source.toDataURL().split(',')[1],frameHeight}});
}
async function inspectOutput({command,zip,pageIndex,x,y}) {
  const payload = window.outputs[command];
  let bytes = Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));
  if (zip) {
    const view = new DataView(bytes.buffer);
    let offset = 0, index = 0;
    while (view.getUint32(offset,true) === 0x04034b50) {
      const length = view.getUint32(offset+18,true);
      const start = offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
      if (index++ === pageIndex) { bytes = bytes.subarray(start,start+length); break; }
      offset = start+length;
    }
  }
  const img = await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  const probe = document.createElement('canvas'); probe.width = 6; probe.height = 2;
  const ctx = probe.getContext('2d');
  ctx.drawImage(img,x,y,6,2,0,0,6,2);
  const data = ctx.getImageData(0,0,6,2).data;
  const colors = Array.from({length:12},(_,i)=>Array.from(data.slice(i*4,i*4+4)).join(','));
  const value = {colors:[...new Set(colors)],width:img.width,height:img.height};
  img.close(); return value;
}

export async function exerciseEditor(page) {
  const url = new URL('../desktop/ui/editor.html',import.meta.url).href;
  const script = await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:
    'if (location.href === '+JSON.stringify(url)+') ('+mockNative.toString()+')()'});
  try { await page.goto(url); }
  finally { await page.cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier}); }
  const tool = name => page.click('[data-tool="'+name+'"]');
  async function capture(width,height,frameHeight) {
    await page.evaluate(makeCapture,{width,height,frameHeight});
    await page.waitForFunction(h=>document.querySelector('#photo').naturalHeight===h && !document.querySelector('#copy').disabled,height);
  }
  async function client(x,y) {
    return page.evaluate(([x,y]) => {
      const box = document.querySelector('#canvas').getBoundingClientRect(), img = document.querySelector('#photo');
      return [box.x+x*box.width/img.naturalWidth,box.y+y*box.height/img.naturalHeight];
    },[x,y]);
  }
  async function stroke(from,to) {
    await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to); await page.mouse.up();
  }
  async function draw(a,b) { await stroke(await client(...a),await client(...b)); }
  const attr = (selector,key) => page.evaluate(([selector,key])=>document.querySelector(selector)?.getAttribute(key),[selector,key]);
  const setColor = color => page.evaluate(value=>{
    const picker = document.querySelector('#color'); picker.value = value;
    picker.dispatchEvent(new Event('input')); picker.dispatchEvent(new Event('change'));
  },color);
  async function dragHandle(handle,x,y) {
    const start = await page.evaluate(h=>{
      const r=document.querySelector('[data-handle="'+h+'"]').getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2];
    },handle);
    await stroke(start,await client(x,y));
  }
  async function output(button,command) {
    await page.evaluate(c=>{delete window.outputs[c];},command);
    await page.click('#'+button);
    await page.waitForFunction(c=>Boolean(window.outputs[c]?.data) && !document.querySelector('#copy').disabled,command);
  }
  const checkPixels = async (command,x,y,extra={})=>page.evaluate(inspectOutput,{command,x,y,...extra});
  const flat = value => {
    assert.equal(value.colors.length,1,'every pixel in a covered block must be the same');
    const [r,g,b,a] = value.colors[0].split(',').map(Number);
    assert.ok(r>30 && r<225 && r===g && g===b && a===255,'checkerboard should export as opaque averaged gray');
  };

  await capture(512,320,160);
  await page.selectOption('#zoom','0.5');
  await draw([24,24],[140,100]);
  await tool('select');
  await draw([80,60],[104,72]); // move by its interior
  await dragHandle('se',184,144);
  await setColor('#127c41');
  const rect = '[data-mark=rect]';
  assert.equal(await attr(rect,'stroke'),'#127c41');
  const d = await attr(rect,'d');
  const numbers = d.match(/-?[\d.]+/g).map(Number);
  for (const [i,expected] of [48,36,184,144].entries()) assert.ok(Math.abs(numbers[i]-expected)<=2);
  await page.click('#undo');
  assert.equal(await attr(rect,'stroke'),'#e34a36');
  await setColor('#127c41');

  for (const [kind,y] of [['line',184],['arrow',244]]) {
    await tool(kind); await draw([36,y],[140,y+12]); await tool('select');
    await draw([88,y+6],[100,y+14]); await dragHandle('b',180,y+24);
    await setColor('#1363bf');
    const path = '[data-mark='+kind+']';
    assert.ok((await attr(path,'d')).startsWith('M 48 '));
    assert.equal(await attr(path,'stroke'),'#1363bf');
    const geometry = (await attr(path,'d')).match(/-?[\d.]+/g).map(Number);
    for (const [i,expected] of [48,y+8,180,y+24].entries()) assert.ok(Math.abs(geometry[i]-expected)<=2);
  }
  await tool('text'); await page.mouse.click(...await client(210,46));
  await page.fill('#text-entry','初稿'); await page.click('#text-apply');
  await tool('select'); await draw([225,52],[245,62]);
  await page.fill('#size','24'); await page.press('#size','Enter');
  await setColor('#8d2352');
  await page.click('#edit-text'); await page.fill('#text-entry','终稿\n第二行'); await page.click('#text-apply');
  const text = '[data-mark=text]';
  const textX = Number(await attr(text+' text','x'));
  assert.ok(Math.abs(textX-230)<=2,'text dragged in original image coordinates');
  assert.equal(await attr(text,'font-size'),'24'); assert.equal(await attr(text,'fill'),'#8d2352');
  assert.equal(await page.evaluate(()=>document.querySelector('[data-mark=text]').textContent),'终稿第二行');
  await dragHandle('se',330,170);
  assert.ok(Number(await attr(text,'font-size'))>24);
  await page.click('#undo'); assert.equal(await attr(text,'font-size'),'24');

  await tool('mosaic'); await page.selectOption('#brush','24'); await draw([300,148],[424,172]);
  assert.ok(Number(await page.evaluate(()=>document.querySelector('[data-mark=mosaic]').childElementCount))>10);
  await page.click('#undo');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('[data-mark=mosaic]').length),0);
  await draw([300,148],[424,172]);

  for (const [button,command] of [['pin','capture.pin'],['copy','capture.copy'],['save','file.save']]) {
    await output(button,command);
    const pixels = await checkPixels(command,361,157);
    flat(pixels); assert.equal(pixels.width,512); assert.equal(pixels.height,320);
    assert.ok((await checkPixels(command,411,225)).colors.length>1,'untouched checkerboard must retain detail');
    const rectPixels = (await checkPixels(command,78,36)).colors;
    assert.deepEqual(rectPixels,['18,124,65,255'],'selected rectangle exports in its edited location and color');
  }
  await page.selectOption('#format','zip'); await output('save','file.save');
  for (const [pageIndex,y] of [[0,157],[1,0]]) {
    const pixels = await checkPixels('file.save',361,y,{zip:true,pageIndex});
    flat(pixels); assert.equal(pixels.height,160);
  }
  await capture(192,16200,512); // force streamed PNG; paint over the 512-row strip boundary
  await page.selectOption('#zoom','1');
  await page.evaluate(()=>{document.querySelector('#stage').scrollTop=350;});
  await tool('mosaic'); await draw([48,500],[132,524]); await output('save','file.save');
  for (const y of [508,513]) {
    const result = await checkPixels('file.save',85,y);
    flat(result); assert.equal(result.height,16200); assert.equal(result.width,192);
  }
  console.log('Editor passed: shape move/resize/color, multiline text edits, font controls, undo, mosaic across PNG/ZIP seams, copy and pin payloads.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const run = js => {
    const result = spawnSync('ego-browser',['nodejs'],{input:js,encoding:'utf8',timeout:120000});
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(result.stderr || result.stdout);
    return result.stdout + result.stderr;
  };
  const chosen = run('const task=await taskSpace("词匣截图编辑回归 '+Date.now()+'"); console.log("EDITOR_SPACE="+task.spaceId);');
  const space = Number(chosen.match(/EDITOR_SPACE=(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(space) && space>0);
  try {
    console.log(run('const {exerciseEditor}=await import('+JSON.stringify(import.meta.url)+'); await exerciseEditor((await taskSpace('+space+')).page("p1"));'));
  } finally {
    run('await (await taskSpace('+space+')).finish({keep:[]});');
  }
}
