(() => {
  'use strict';

  const MAX_PIXELS = window.PromptDesktop?.active
    ? (/mac/i.test(navigator.platform) ? 32000000 : 64000000)
    : 24000000;
  const MAX_SIDE = 32767;
  const colors = ['#cc492f', '#326ca8', '#d6a519'];
  const icons = {
    capture:'<path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4"/><circle cx="12" cy="12" r="4"/>',
    long:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 7h6m-6 4h6m-6 4h4"/>',
    screen:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
    image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.2"/><path d="m5 18 5-5 3 2 3-4 4 5"/>',
    pin:'<path d="m8 3 9 0-1 5 3 4v2H5v-2l4-4-1-5Zm4 11v7"/>',
    rect:'<rect x="4" y="5" width="16" height="14" rx="1"/>',
    line:'<path d="m4 19 16-14"/>',
    hand:'<path d="M7 12V7a1.5 1.5 0 0 1 3 0v4-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v7c0 5-2.5 7-6 7h-1c-2 0-3-1-4-3l-4-6c-1-2 1-3 2-2l2 2"/>',
    undo:'<path d="m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12h-1"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    history:'<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l3 2"/>',
    folder:'<path d="M3 6h7l2 2h9v11H3z"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>',
    grip:'<path d="M8 8h.1m3.9 0h.1m3.9 0h.1M8 13h.1m3.9 0h.1m3.9 0h.1" stroke-width="2.5"/>'
  };
  const glyph = (key, n=16) => '<svg aria-hidden="true" width="'+n+'" height="'+n+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg>';
  const stamp = () => new Date().toISOString().replace(/[:.]/g,'-');
  const validSize = (w,h) => w>0 && h>0 && w<=MAX_SIDE && h<=MAX_SIDE && w*h<=MAX_PIXELS;

  function surface(w,h) {
    if (!validSize(w,h)) throw new Error('图片过大，请将宽高控制在 32767 像素内、总面积控制在 '+(MAX_PIXELS/10000)+' 万像素内。');
    const el=document.createElement('canvas'); el.width=w; el.height=h;
    return el;
  }
  function png(el) {
    return new Promise((resolve,reject)=>el.toBlob(blob=>blob ? resolve(blob) : reject(new Error('浏览器无法生成这张 PNG，请缩短图片后再试。')), 'image/png'));
  }
  function drawSample() {
    const w=960, h=2140, page=surface(w,h), c=page.getContext('2d');
    const sans='"PingFang SC","Microsoft YaHei",sans-serif', mono='ui-monospace,Menlo,Consolas,monospace';
    function fill(x,y,w,h,color) { c.fillStyle=color; c.fillRect(x,y,w,h); }
    function text(str,x,y,size,color='#2d3c32',font=sans,weight='400') { c.fillStyle=color;c.font=weight+' '+size+'px '+font;c.fillText(str,x,y); }
    function path(points,color,thick,dashed=false) {
      c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=thick;c.lineCap='round';c.lineJoin='round';c.setLineDash(dashed?[6,9]:[]);c.stroke();c.setLineDash([]);
    }
    function disc(x,y,r,color){ c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill(); }
    function map(x,y,width,height,night=false) {
      c.save();c.translate(x,y);c.scale(width/800,height/260);c.beginPath();c.rect(0,0,800,260);c.clip();
      fill(0,0,800,260,night?'#dce4d8':'#e2e6cd');
      const blocks=[[20,18,130,57],[183,10,65,65],[270,22,120,44],[395,15,80,65],[505,5,111,49],[640,8,130,66],[24,98,115,46],[172,98,70,43],[273,101,91,48],[408,98,95,55],[544,96,90,52],[650,102,125,45],[9,180,143,61],[192,173,57,57],[276,179,126,72],[443,187,61,46],[535,172,101,69],[672,177,110,62]];
      blocks.forEach(([a,b,w,h],i)=>fill(a,b,w,h,i%3===0?'#bacba6':'#c9d4bc'));
      for (const pts of [[[0,86],[800,80]],[[0,160],[800,161]],[[158,0],[160,260]],[[258,0],[254,260]],[[524,0],[520,260]],[[642,0],[649,260]]]) path(pts,'#f8f5e9',10);
      const river=[[-30,224],[100,208],[206,183],[288,132],[348,114],[429,128],[515,149],[592,144],[657,112],[716,57],[838,18]];
      path(river,'#a1bdb7',56);path(river,'#b6cdc4',40);
      const walk=night?[[48,158],[148,158],[228,129],[298,88],[395,85],[469,103],[536,108],[633,77],[722,27]]:[[83,167],[154,160],[203,147],[277,106],[344,82],[422,85],[501,108],[577,109],[645,84],[716,41]];
      path(walk,'#fbf6e8',10);path(walk,'#925738',4,true);
      for(const index of [0,4,9]) {const node=walk[Math.min(index,walk.length-1)];disc(...node,9,'#f7edcf');disc(...node,5,'#865337');}
      c.restore();
    }
    function section(y,num,title,lines) {
      fill(66,y,828,1,'#c5c6b1');text(num,66,y+59,16,'#737c68',mono,'600');text(title,134,y+65,40,'#354236',sans,'650');
      lines.forEach((line,i)=>text(line,134,y+120+i*42,25,'#4d584b'));
    }
    fill(0,0,w,h,'#f7f3e6');fill(0,0,w,10,'#51644f');text('河 岸 手 记',65,48,20,'#40533f',sans,'650');
    text('FIELD NOTES  /  VOL. 03',602,48,17,'#60705b',mono);fill(65,65,830,2,'#aeb59c');
    text('沿河散步指南',62,137,62,'#354939',sans,'680');text('一段从旧桥通往湿地的步行记录',66,180,26,'#5c6856');
    map(66,211,828,200);
    text('01  旧桥桥头',66,448,20,'#52614f');text('02  河堤转角',372,448,20,'#52614f');text('03  芦苇湿地',686,448,20,'#52614f');
    section(526,'01','从旧桥出发',['顺着桥东侧的石阶向下，就是沿河步道。','记下桥拱投落的阴影，再沿水面向东走。']);
    fill(134,754,710,122,'#e6e7d3');text('观察提示',158,794,22,'#495c46',sans,'650');text('用一张照片，记录桥面与水面的距离。',158,842,25,'#445540');
    path([[135,950],[270,950],[335,921],[419,921],[510,955],[567,955],[661,911],[755,911],[845,878]],'#8eaa94',5);
    text('旧桥至河堤的步道走势',135,1009,20,'#697864');
    section(1110,'02','在河堤转角停留',['转弯处长着几棵柳树，从树荫能看到对岸。','留意步道的走向，也看看脚下材料的变化。']);
    map(134,1339,710,208,true);
    section(1636,'03','沿芦苇走到湿地',['河岸逐渐变缓。绕过最后一个转角，','便能看到木栈道和一片开阔的芦苇荡。']);
    fill(134,1870,710,122,'#e6e7d3');text('步行记录',158,1910,22,'#495c46',sans,'650');text('起点  旧桥东侧          终点  湿地木栈道',158,1955,24,'#445540');
    fill(65,2059,830,1,'#b8bdab');text('河岸手记  ／  第三期',66,2100,19,'#687362');text('END OF WALK',717,2099,18,'#687362',mono);
    return page;
  }

  // Each ZIP entry is an already compressed PNG. Store the bytes unchanged.
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
  async function splitArchive(page,pageHeight) {
    const local=[],central=[]; let offset=0,centralSize=0,count=0;
    const encode=new TextEncoder();
    for (let top=0;top<page.height;top+=pageHeight) {
      const height=Math.min(pageHeight,page.height-top), part=surface(page.width,height);
      part.getContext('2d').drawImage(page,0,top,page.width,height,0,0,page.width,height);
      const bytes=new Uint8Array(await (await png(part)).arrayBuffer());part.width=1;part.height=1;
      let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];crc=(crc^0xffffffff)>>>0;
      const name=encode.encode('screen-'+String(++count).padStart(3,'0')+'.png');
      const l=new Uint8Array(30+name.length),lv=new DataView(l.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(12,0x21,true);lv.setUint32(14,crc,true);lv.setUint32(18,bytes.length,true);lv.setUint32(22,bytes.length,true);lv.setUint16(26,name.length,true);l.set(name,30);
      local.push(l,bytes);
      const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);
      central.push(c);centralSize+=c.length;offset+=l.length+bytes.length;
    }
    const end=new Uint8Array(22),v=new DataView(end.buffer);
    v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }

  let pinned=null;
  function pinImage(blob,title) {
    pinned?.close();
    const box=document.createElement('aside');box.className='cap-pin';box.setAttribute('aria-label','页内置顶截图');
    box.innerHTML='<header tabindex="0" aria-label="拖动标题栏或用方向键移动">'+glyph('grip')+'<strong></strong><button type="button" aria-label="关闭置顶截图">'+glyph('close')+'</button></header><div><img alt="置顶截图"></div><small>页内置顶 · 跨应用置顶需桌面版</small>';
    box.querySelector('strong').textContent=title;const url=URL.createObjectURL(blob);box.querySelector('img').src=url;
    document.body.append(box);
    function close(){box.remove();URL.revokeObjectURL(url);pinned=null;}
    pinned={close};box.querySelector('button').onclick=close;
    const header=box.querySelector('header');let drag=null;
    function move(x,y){box.style.right='auto';box.style.bottom='auto';box.style.left=Math.max(0,Math.min(x,innerWidth-box.offsetWidth))+'px';box.style.top=Math.max(0,Math.min(y,innerHeight-header.offsetHeight))+'px';}
    header.onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;const r=box.getBoundingClientRect();drag=[e.clientX-r.left,e.clientY-r.top];header.setPointerCapture(e.pointerId);};
    header.onpointermove=e=>{if(drag)move(e.clientX-drag[0],e.clientY-drag[1]);};
    header.onlostpointercapture=()=>{drag=null;};
    header.onkeydown=e=>{const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[e.key];if(delta){e.preventDefault();const r=box.getBoundingClientRect();move(r.left+delta[0],r.top+delta[1]);}};
  }

  window.openCaptureTool=function({host,notify,onHistory,saveToClipboardHistory,desktop,onCaptureReady}) {
    let alive=true, busy=false, mode='normal', tool='hand', color=colors[0], image=null, frameHeight=0;
    let title='', savedMarkKey='', rawStored=false, stream=null, video=null, frames=[], outline=null, draft=null, sample=desktop?null:drawSample();
    let captureVersion=0;
    let rawArchiveId='', markedArchiveId='';
    const marks=[];
    const supported=!!desktop||!!navigator.mediaDevices?.getDisplayMedia;
    const $=s=>host.querySelector(s);
    host.innerHTML=`<section class="cap-work">
      <header class="cap-intro"><div><h1>截图工具</h1><p>截取画面，直接标注，并在剪贴板历史中找回。</p></div><button type="button" class="btn" data-cap="history">${glyph('history')}剪贴板历史</button></header>
      <div class="cap-sourcebar"><div class="cap-modes" role="group" aria-label="截图模式"><button type="button" data-cap-mode="normal" aria-pressed="true">${glyph('capture')}普通截图</button><button type="button" data-cap-mode="long" aria-pressed="false">${glyph('long')}长截图</button></div>
      <div class="cap-actions">${desktop?'<select aria-label="长截图滚动方式" class="cap-scroll-mode" hidden><option value="manual">手动滚动</option><option value="automatic">自动滚动</option></select>':''}<button type="button" class="btn" data-cap="import">${glyph('image')}导入图片</button><button type="button" class="btn primary" data-cap="screen">${glyph('screen')}<span>截取屏幕</span></button></div></div>
      <div class="cap-studio"><div class="cap-framehead"><div><span class="cap-led"></span><strong class="cap-title">滚动示例</strong><small class="cap-dim"></small></div><button type="button" class="cap-quiet" data-cap="sample">截取示例</button></div>
      <div class="cap-stage"><div class="cap-scroller" tabindex="0" aria-label="可滚动的截图画布"><div class="cap-canvasbox"></div></div></div>
      <div class="cap-footer"><span class="cap-status" role="status">滚动查看示例页面，截取当前可见范围。</span><button type="button" class="cap-quiet" data-cap="example" hidden>返回示例页面</button></div></div>
      <div class="cap-edit" hidden><div class="cap-tools"><strong>标注</strong><div class="cap-mode-tools" role="group" aria-label="标注工具">
      <button type="button" data-cap-tool="hand" aria-pressed="true" title="浏览画布">${glyph('hand')}浏览</button><button type="button" data-cap-tool="rect" aria-pressed="false">${glyph('rect')}矩形</button><button type="button" data-cap-tool="line" aria-pressed="false">${glyph('line')}直线</button></div>
      <div class="cap-colors" role="group" aria-label="标注颜色">${colors.map((c,i)=>'<button type="button" data-cap-color="'+c+'" style="--swatch:'+c+'" aria-label="'+['朱红色','蓝色','金黄色'][i]+'" aria-pressed="'+(i===0)+'"></button>').join('')}</div>
      <button type="button" class="cap-quiet" data-cap="undo" disabled>${glyph('undo')}撤销</button></div>
      <div class="cap-tools cap-results"><button type="button" class="btn" data-cap="save" disabled>${glyph('history')}保存标注到历史</button><button type="button" class="btn" data-cap="pin">${glyph('pin')}页内置顶</button>
      <div class="cap-export"><select aria-label="导出格式" class="cap-format"><option value="png">整张 PNG</option><option value="zip">分屏 PNG · ZIP</option></select><button type="button" class="btn primary" data-cap="download">${glyph('download')}下载</button><button type="button" class="btn" data-cap="directory" title="选择保存目录">${glyph('folder')}选目录</button></div></div></div>
      <p class="cap-note"></p><input type="file" class="cap-import" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <dialog class="cap-session"><form method="dialog"><div class="cap-dialoghead"><h2>分段截屏</h2><button type="button" aria-label="关闭分段截屏" data-cap="cancel-session">${glyph('close')}</button></div><p>在共享的窗口中向下滚动，每次停稳后加入一屏。可裁去后续画面顶部的重复区域。</p>
      <video class="cap-live" autoplay muted playsinline></video><div class="cap-session-settings"><label>顶部重叠 <input type="number" class="cap-overlap" value="0" min="0" step="1"> px</label><output class="cap-count" aria-live="polite">已加入 0 屏</output></div>
      <div class="cap-session-actions"><button type="button" class="btn" data-cap="drop-frame" disabled>撤销上一屏</button><button type="button" class="btn" data-cap="add-frame">加入这一屏</button><button type="button" class="btn gold" data-cap="finish-session" disabled>生成长截图</button></div></form></dialog>
    </section>`;
    const pane=$('.cap-work'), scroller=$('.cap-scroller'), box=$('.cap-canvasbox'), dialog=$('.cap-session'), fileInput=$('.cap-import');
    function message(text){if(alive)notify?.(text);}
    function refresh() {
      if(!alive)return;
      const long=mode==='long', has=!!image;
      host.querySelectorAll('[data-cap-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.capMode===mode)));
      $('[data-cap="screen"] span').textContent=long?(desktop?'截取长图':'分段截屏'):'截取屏幕';
      $('[data-cap="screen"]').disabled=!supported||busy;
      $('[data-cap="screen"]').title=supported?'授权选择要共享的窗口或屏幕':'此浏览器未提供屏幕共享，可使用示例或导入图片';
      const demoButton=$('[data-cap="sample"]');demoButton.textContent=long?'截取示例长图':'截取示例';demoButton.hidden=has||!!desktop;
      $('[data-cap="example"]').hidden=!has||!!desktop;$('.cap-edit').hidden=!has;
      $('.cap-title').textContent=title||(desktop?'截图画布':'滚动示例');
      const shown=image||sample;
      $('.cap-dim').textContent=shown?shown.width+' × '+shown.height+' px':'';
      $('[data-cap="undo"]').disabled=!marks.length||busy;
      const saveButton=$('[data-cap="save"]');
      saveButton.disabled=busy||(marks.length?JSON.stringify(marks)===savedMarkKey:rawStored);
      saveButton.innerHTML=glyph('history')+(!marks.length&&!rawStored?'重试加入历史':'保存标注到历史');
      const directoryButton=$('[data-cap="directory"]');
      const canChooseDirectory=typeof window.showDirectoryPicker==='function';
      directoryButton.disabled=!canChooseDirectory||busy;
      directoryButton.title=canChooseDirectory?'选择保存目录':'此浏览器请用下载，在下载设置选择保存位置';
      host.querySelectorAll('[data-cap-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.capTool===tool)));
      host.querySelectorAll('[data-cap-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.capColor===color)));
      box.classList.toggle('cap-drawing',has&&tool!=='hand');pane.classList.toggle('cap-busy',busy);pane.setAttribute('aria-busy',String(busy));
      $('.cap-note').textContent=long?'长图可截取完整示例页面，或手动滚动共享窗口后逐屏拼接。':'截取屏幕时，由你选择共享的窗口或屏幕。';
      if(!supported)$('.cap-note').textContent+=' 当前浏览器可使用示例或导入图片。';
      if(has) $('.cap-note').textContent+=' 页内置顶可跨工作台页面查看，跨应用置顶需要桌面版。';
      if(has&&!canChooseDirectory)$('.cap-note').textContent+=' 此浏览器请用下载，在下载设置选择保存位置。';
      if(desktop){
        $('.cap-scroll-mode').hidden=!long;
        $('[data-cap="screen"]').title='隐藏词匣窗口，在屏幕上选择截取范围。';
        $('[data-cap="pin"]').innerHTML=glyph('pin')+'屏幕置顶';
        $('[data-cap="download"]').innerHTML=glyph('download')+'另存为';
        directoryButton.hidden=true;
        $('.cap-note').textContent=long?'选择滚动方式后截取长图。':'';
      }
    }
    function updateStatus(s){if(alive)$('.cap-status').textContent=s;}
    function mount(page,editing) {
      box.replaceChildren();box.style.width='min(100%, '+page.width+'px)';box.classList.toggle('cap-paper',!editing||title.startsWith('示例'));box.append(page);
      page.className='cap-page';page.setAttribute('role','img');page.setAttribute('aria-label',editing?title:'河岸手记，沿河散步指南，可向下滚动');
      outline=null;draft=null;
      if(editing){outline=surface(page.width,page.height);outline.className='cap-outline';outline.setAttribute('aria-hidden','true');box.append(outline);}
      scroller.scrollTop=0;refresh();
    }
    function destroySession() {
      if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
      if(video){video.pause();video.srcObject=null;video=null;}
      frames.forEach(f=>{f.width=1;f.height=1;});frames=[];
      if(dialog.open)dialog.close();
    }
    function showSample() {
      if(desktop){
        box.replaceChildren();refresh();
        updateStatus('点「截取屏幕」框选范围，或导入需要标注的图片。');return;
      }
      image=null;title='';marks.length=0;savedMarkKey='';rawStored=false;mount(sample,false);
      updateStatus(mode==='long'?'滚动查看整页。截取长图将包含示例页面的全部内容。':'滚动查看示例页面，截取当前可见范围。');
    }
    function viewportPixels(page) {
      return Math.max(1,Math.min(page.height,Math.round(scroller.clientHeight*page.width/(box.clientWidth||page.width))));
    }
    async function receive(page,name,splitHeight,archiveId='') {
      if(!alive)return;
      image=page;title=name;marks.length=0;savedMarkKey='';rawStored=false;tool='hand';
      rawArchiveId=archiveId;markedArchiveId='';
      mount(page,true);frameHeight=Math.min(page.height,Math.max(1,splitHeight||viewportPixels(page)));
      if(archiveId){rawStored=true;refresh();updateStatus('原图已加入剪贴板历史 · 可标注或导出');return;}
      updateStatus('正在写入剪贴板历史…');
      try {
        const blob=await png(page);
        if(typeof saveToClipboardHistory!=='function')throw new Error('历史存储不可用');
        const saved=await saveToClipboardHistory({blob,title:name});
        rawArchiveId=saved?.id||'';
        rawStored=true;
        if(alive){updateStatus('原图已加入剪贴板历史 · 可标注或导出');message('已加入剪贴板历史');}
      } catch(error){updateStatus('历史写入失败，原图仍可导出。');throw error;}
    }
    async function captureSample(){
      const visible=viewportPixels(sample);
      const top=Math.min(sample.height-visible,Math.max(0,Math.round(scroller.scrollTop*sample.width/(box.clientWidth||sample.width))));
      const whole=mode==='long';
      const cap=surface(sample.width,whole?sample.height:visible);
      cap.getContext('2d').drawImage(sample,0,whole?0:top,cap.width,cap.height,0,0,cap.width,cap.height);
      await receive(cap,whole?'示例长截图 · 沿河散步指南':'示例截图 · 沿河散步指南',visible);
    }
    function stroke(ctx,mark){
      ctx.strokeStyle=mark.color;ctx.lineWidth=mark.width;ctx.lineCap='round';ctx.lineJoin='round';
      if(mark.tool==='rect')ctx.strokeRect(mark.x,mark.y,mark.ex-mark.x,mark.ey-mark.y);
      else {ctx.beginPath();ctx.moveTo(mark.x,mark.y);ctx.lineTo(mark.ex,mark.ey);ctx.stroke();}
    }
    function paint(){if(!outline)return;const c=outline.getContext('2d');c.clearRect(0,0,outline.width,outline.height);marks.forEach(m=>stroke(c,m));if(draft)stroke(c,draft);}
    function composited(){if(!marks.length)return image;const page=surface(image.width,image.height),ctx=page.getContext('2d');ctx.drawImage(image,0,0);marks.forEach(m=>stroke(ctx,m));return page;}
    function pointer(e){
      const r=outline.getBoundingClientRect();
      return [Math.max(0,Math.min(image.width,(e.clientX-r.left)*image.width/r.width)),Math.max(0,Math.min(image.height,(e.clientY-r.top)*image.height/r.height))];
    }
    function startMark(e){
      if(!alive||busy||!image||!outline||tool==='hand'||e.button!==0||draft||e.target!==outline)return;
      const [x,y]=pointer(e);
      draft={tool,color,width:Math.max(2,3*image.width/outline.getBoundingClientRect().width),x,y,ex:x,ey:y,id:e.pointerId};
      outline.setPointerCapture(e.pointerId);e.preventDefault();
    }
    function moveMark(e){if(!draft||draft.id!==e.pointerId)return;[draft.ex,draft.ey]=pointer(e);paint();}
    function finishMark(e){
      if(!draft||draft.id!==e.pointerId)return;
      if(e.type==='pointerup'){
        [draft.ex,draft.ey]=pointer(e);
        if(Math.hypot(draft.ex-draft.x,draft.ey-draft.y)>=1){const {id,...mark}=draft;marks.push(mark);}
      }
      draft=null;paint();refresh();
    }
    box.addEventListener('pointerdown',startMark);box.addEventListener('pointermove',moveMark);box.addEventListener('pointerup',finishMark);
    box.addEventListener('pointercancel',finishMark);box.addEventListener('lostpointercapture',finishMark);

    async function importFile(file){
      const url=URL.createObjectURL(file);
      try{
        const img=new Image();img.src=url;await img.decode();if(!alive)return;
        const cap=surface(img.naturalWidth,img.naturalHeight);cap.getContext('2d').drawImage(img,0,0);
        await receive(cap,'导入 · '+file.name,0);
      }finally{URL.revokeObjectURL(url);}
    }
    async function openStream(){
      if(desktop){
        await desktop.request('capture.start',{long:mode==='long',automatic:mode==='long'&&$('.cap-scroll-mode').value==='automatic'});
        return;
      }
      destroySession();
      const sharing=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if(!alive){sharing.getTracks().forEach(t=>t.stop());return;}
      stream=sharing;video=mode==='long'?$('.cap-live'):document.createElement('video');
      video.muted=true;video.playsInline=true;video.srcObject=sharing;await video.play();
      const started=performance.now();
      while(alive&&stream===sharing&&(!video.videoWidth||video.readyState<2)){
        if(performance.now()-started>8000)throw new Error('共享画面尚未就绪，请重新截取。');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      if(!alive||stream!==sharing)return;
      if(mode==='long'){
        updateFrames();dialog.showModal();
        sharing.getVideoTracks()[0]?.addEventListener('ended',()=>{if(alive&&stream===sharing){message('屏幕共享已结束，可以生成已加入的画面。');$('[data-cap="add-frame"]').disabled=true;}},{once:true});
      }else{
        const page=screenFrame();destroySession();await receive(page,'屏幕截图',page.height);
      }
    }
    function screenFrame(){if(!video?.videoWidth)throw new Error('共享画面尚未就绪。');const page=surface(video.videoWidth,video.videoHeight);page.getContext('2d').drawImage(video,0,0);return page;}
    function updateFrames(){
      $('.cap-count').textContent='已加入 '+frames.length+' 屏';
      $('[data-cap="drop-frame"]').disabled=!frames.length;
      $('[data-cap="finish-session"]').disabled=!frames.length;
      $('[data-cap="add-frame"]').disabled=!stream?.active;
    }
    function addFrame(){
      if(!stream?.active)throw new Error('共享已结束。');
      const w=video.videoWidth,h=video.videoHeight,field=$('.cap-overlap'),overlap=frames.length?Number(field.value):0;
      if(!Number.isInteger(overlap)||overlap<0||overlap>=h)throw new Error('重叠高度应在 0 到 '+(h-1)+' 像素之间。');
      if(frames.length&&w!==frames[0].width)throw new Error('共享画面宽度发生变化，请恢复原尺寸后再加入。');
      const height=frames.reduce((sum,f)=>sum+f.height,0)+h-overlap;
      if(!validSize(w,height))throw new Error('已达到长图尺寸上限，请先生成当前长图。');
      const page=surface(w,h-overlap);page.getContext('2d').drawImage(video,0,overlap,w,h-overlap,0,0,w,h-overlap);frames.push(page);updateFrames();
    }
    async function finishSession(){
      if(!frames.length)return;
      const segmentHeight=frames[0].height,page=surface(frames[0].width,frames.reduce((s,f)=>s+f.height,0)),ctx=page.getContext('2d');
      let y=0;frames.forEach(f=>{ctx.drawImage(f,0,y);y+=f.height;});destroySession();await receive(page,'分段长截图',segmentHeight);
    }

    async function exportImage(toDirectory) {
      const format=$('.cap-format').value;
      let directory=null;
      if(toDirectory){if(!window.showDirectoryPicker)throw new Error('此浏览器可使用下载保存。');directory=await window.showDirectoryPicker({mode:'readwrite'});}
      const merged=composited(),fileName='capture-'+stamp()+(format==='zip'?'-screens.zip':'.png');
      const blob=format==='zip'?await splitArchive(merged,Math.max(1,frameHeight)):await png(merged);
      if(!alive)return;
      if(desktop){
        await desktop.request('file.save',{filename:fileName,mime:blob.type,data:await desktop.encode(blob)});
        return;
      }
      if(directory){
        const file=await directory.getFileHandle(fileName,{create:true});
        const writer=await file.createWritable();try{await writer.write(blob);await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}
        message('已保存到所选目录');
      }else{
        const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);message(format==='zip'?'已开始下载分屏 PNG 压缩包':'已开始下载整张 PNG');
      }
    }
    async function run(act,fn){
      if(busy)return;busy=true;refresh();
      try{await fn();}
      catch(error){
        if(act==='screen')destroySession();
        if(error.name==='AbortError')return;
        message(error.name==='NotAllowedError'?'未获得授权，可重试或使用示例和导入。':error.message||'操作未完成，请重试。');
      }finally{busy=false;refresh();}
    }
    async function click(e){
      const b=e.target.closest('button');
      if(!b||!pane.contains(b)||b.disabled||busy)return;
      if(b.dataset.capMode){mode=b.dataset.capMode;refresh();if(!image)updateStatus(desktop?'请选择截取范围。':mode==='long'?'滚动查看整页。截取长图将包含示例页面的全部内容。':'滚动查看示例页面，截取当前可见范围。');return;}
      if(b.dataset.capTool){tool=b.dataset.capTool;refresh();return;}
      if(b.dataset.capColor){color=b.dataset.capColor;refresh();return;}
      const act=b.dataset.cap;
      switch(act){
        case 'history':onHistory?.();break;
        case 'sample':await run(act,captureSample);break;
        case 'example':showSample();break;
        case 'import':fileInput.click();break;
        case 'screen':await run(act,openStream);break;
        case 'undo':marks.pop();paint();refresh();break;
        case 'save':await run(act,async()=>{
          const signature=JSON.stringify(marks), blob=await png(composited());
          const saved=await saveToClipboardHistory({blob,title:marks.length?title+' · 已标注':title});
          if(!marks.length){rawStored=true;rawArchiveId=saved?.id||'';}
          else markedArchiveId=saved?.id||'';
          savedMarkKey=signature;updateStatus(marks.length?'标注副本已加入历史':'原图已加入剪贴板历史');message('已存入剪贴板历史');
        });break;
        case 'pin':await run(act,async()=>{
          const id=marks.length?(JSON.stringify(marks)===savedMarkKey?markedArchiveId:''):rawArchiveId;
          if(desktop&&id){await desktop.request('capture.pin',{id,title});return;}
          const blob=await png(composited());
          if(!alive)return;
          if(desktop)await desktop.request('capture.pin',{title,mime:blob.type,data:await desktop.encode(blob)});
          else pinImage(blob,title);
        });break;
        case 'download':case 'directory':await run(act,()=>exportImage(act==='directory'));break;
        case 'add-frame':await run(act,addFrame);break;
        case 'drop-frame':{const last=frames.pop();if(last){last.width=1;last.height=1;}updateFrames();break;}
        case 'finish-session':await run(act,finishSession);break;
        case 'cancel-session':destroySession();break;
      }
    }
    pane.addEventListener('click',click);
    fileInput.addEventListener('change',()=>{const file=fileInput.files[0];fileInput.value='';if(file)run('import',()=>importFile(file));});
    dialog.addEventListener('close',()=>{if(!dialog.open&&stream)destroySession();});
    scroller.addEventListener('keydown',e=>{if(image&&!busy&&marks.length&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();marks.pop();paint();refresh();}});
    showSample();
    const unsubscribeCapture=desktop && onCaptureReady(async record=>{
      const version=++captureVersion;
      try{
        if(!record.data&&!record.url)record=await desktop.request('history.detail',{id:record.id});
        const pic=new Image();pic.src=desktop.mediaURL({...record,mime:record.mime||'image/png'});await pic.decode();
        if(!alive||version!==captureVersion)return;
        const page=surface(pic.naturalWidth,pic.naturalHeight);
        page.getContext('2d').drawImage(pic,0,0);
        await receive(page,record.title||'屏幕截图',record.frameHeight,record.id);
      }catch(error){if(alive&&version===captureVersion)message('无法在画布打开系统截图。可在剪贴板历史另存原图。');}
    });
    return ()=>{alive=false;if(unsubscribeCapture)unsubscribeCapture();destroySession();pane.removeEventListener('click',click);sample=null;image=null;outline=null;draft=null;marks.length=0;};
  };
})();
