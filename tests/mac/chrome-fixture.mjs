// Node 22+, local Chrome App Mode, single disposable profile and debugging port.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';

const [, , scratch, fixture] = process.argv;
const profile = path.join(scratch, 'chrome-profile');
const stateFile = path.join(scratch, 'page');
const page = pathToFileURL(path.join(scratch, 'capture-page.html'));
if (process.env.PS_CAPTURE_TEST_STICKY === '1') page.hash = 'sticky';
await fs.copyFile(fixture, path.join(scratch, 'capture-page.html'));
await fs.mkdir(profile);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--user-data-dir=' + profile, '--app=' + page.href, '--remote-debugging-port=0',
  '--remote-debugging-address=127.0.0.1','--disable-default-apps', '--disable-sync',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--window-size=630,370', '--window-position=220,170',
], {stdio:'ignore'});
let socket, probe, poll;
try {
  let port;
  for (let i=0; i<120 && !port; i++) {
    try { port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); }
    catch { await pause(100); }
  }
  if (!port) throw Error('The temporary Chrome profile did not start.');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const ownPage = targets.find(t => t.url.split('#')[0] === page.href.split('#')[0]);
  if (!ownPage) throw Error('Isolated fixture tab missing.');
  socket = new WebSocket(ownPage.webSocketDebuggerUrl);
  await new Promise((ok,fail) => {socket.onopen=ok; socket.onerror=fail;});
  let next=0;
  const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const [ok,fail]=pending.get(message.id);
    pending.delete(message.id);
    if (message.error) fail(Error(message.error.message)); else ok(message.result);
  };
  function command(method,params={}) {
    const id=++next;
    const reply=new Promise((ok,fail)=>pending.set(id,[ok,fail]));
    socket.send(JSON.stringify({id,method,params}));
    return reply;
  }
  async function evaluate(expression) {
    return (await command('Runtime.evaluate',{expression,returnByValue:true})).result.value;
  }
  await command('Page.bringToFront'); await pause(400);
  const [x,y,ow,oh,w,h]=await evaluate('[screenX,screenY,outerWidth,outerHeight,innerWidth,innerHeight]');
  const viewport=[x+(ow-w)/2,y+oh-h,w,h].join(',');
  let updating=false;
  async function sync() {
    if (updating) return;
    updating=true;
    try {
      let requested;
      try { requested=Number(await fs.readFile(stateFile+'.scroll','utf8')); await fs.unlink(stateFile+'.scroll'); }
      catch (e) {if (e.code !== 'ENOENT') throw e;}
      if (Number.isInteger(requested)) await evaluate('window.scrollTo(0,'+requested+')');
      const state=await evaluate('[Math.round(scrollY),document.documentElement.scrollHeight-innerHeight]');
      await fs.writeFile(stateFile+'.new',[chrome.pid,...state].join(','));
      await fs.rename(stateFile+'.new',stateFile);
    } finally {updating=false;}
  }
  await sync();
  poll=setInterval(()=>sync().catch(e=>console.error(e.message)),50);
  probe=spawn(path.join(scratch,'probe'),[stateFile],{
    stdio:'inherit',env:{...process.env,PS_TEST_CHROME_VIEWPORT:viewport},
  });
  const [code]=await once(probe,'exit');
  process.exitCode=code ?? 1;
} finally {
  clearInterval(poll);
  socket?.close();
  if (probe && probe.exitCode==null && !probe.signalCode) probe.kill();
  if (chrome.exitCode==null && !chrome.signalCode) {
    const stopped=once(chrome,'exit');
    chrome.kill();
    await Promise.race([stopped, pause(2000)]);
    if (chrome.exitCode==null && !chrome.signalCode) {chrome.kill('SIGKILL');await stopped;}
  }
}
