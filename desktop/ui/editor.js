(() => {
  'use strict';
  const desktop = window.PromptDesktop;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), canvas = $('canvas'), overlay = $('marks');
  const input = $('text-entry'), form = $('text-form');
  const tools = [...document.querySelectorAll('[data-tool]')];
  const svgNS = 'http://www.w3.org/2000/svg';
  const font = '"PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  let photo = $('photo'), record = null, currentTool = 'rect', scale = 1;
  let loading = 0, busy = false, drag = null, anchor = null;
  const marks = [];

  function status(text, error = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', error);
  }
  function hint() {
    status(currentTool === 'text' ? '点选图片上的位置，输入文字。' : '拖动鼠标标注。长图可切换「适应宽度」查看细节。');
  }
  function controls() {
    const unavailable = busy || !record;
    for (const button of [...tools, $('color'), $('size'), $('zoom'), $('format'), $('copy'), $('save'), $('pin')]) button.disabled = unavailable;
    $('undo').disabled = unavailable || marks.length === 0;
    $('cancel').disabled = busy;
    for (const button of tools) button.setAttribute('aria-pressed', String(button.dataset.tool === currentTool));
    $('size').hidden = currentTool !== 'text';
    canvas.classList.toggle('text-tool', currentTool === 'text');
  }
  const bound = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function resize() {
    if (!record) return;
    const width = Math.max(1, stage.clientWidth - 24);
    const height = Math.max(1, stage.clientHeight - 24);
    const mode = $('zoom').value;
    scale = mode === 'fit' ? Math.min(1, width / photo.naturalWidth, height / photo.naturalHeight)
      : mode === 'width' ? width / photo.naturalWidth : Number(mode);
    canvas.style.width = photo.naturalWidth * scale + 'px';
    canvas.style.height = photo.naturalHeight * scale + 'px';
    $('percent').textContent = Number((100 * scale).toFixed(scale < .1 ? 1 : 0)) + '%';
    placeTextForm();
  }
  new ResizeObserver(resize).observe(stage);
  $('zoom').onchange = () => {
    resize(); stage.scrollLeft = 0; stage.scrollTop = 0;
  };
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: bound((event.clientX - r.left) * photo.naturalWidth / r.width, 0, photo.naturalWidth),
      y: bound((event.clientY - r.top) * photo.naturalHeight / r.height, 0, photo.naturalHeight)
    };
  }
  function vectorPath(mark) {
    const {a, b} = mark;
    if (mark.tool === 'rect') return 'M ' + a.x + ' ' + a.y + ' H ' + b.x + ' V ' + b.y + ' H ' + a.x + ' Z';
    let path = 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
    if (mark.tool === 'arrow') {
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.max(.001, Math.hypot(dx, dy));
      const head = Math.min(mark.weight * 5, length * .45);
      const hx = dx / length * head, hy = dy / length * head;
      path += ' M ' + (b.x - hx + hy * .48) + ' ' + (b.y - hy - hx * .48)
        + ' L ' + b.x + ' ' + b.y + ' L ' + (b.x - hx - hy * .48) + ' ' + (b.y - hy + hx * .48);
    }
    return path;
  }
  function eachTextLine(mark, callback) {
    mark.lines.forEach((line, index) => callback(line, mark.x, mark.y + mark.size * (.90 + index * 1.28)));
  }
  function svg(name, attributes) {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function preview(mark) {
    if (mark.tool !== 'text') return svg('path', {
      d: vectorPath(mark), fill: 'none', stroke: mark.color, 'stroke-width': mark.weight,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    });
    const group = svg('g', {fill:mark.color, 'font-size':mark.size, 'font-family':font, 'font-weight':600});
    eachTextLine(mark, (line, x, y) => {
      const t = svg('text', {x,y});
      t.style.whiteSpace = 'pre';
      t.textContent = line;
      group.append(t);
    });
    return group;
  }
  function add(mark) {
    marks.push(mark); overlay.append(preview(mark)); controls();
  }
  function undo() {
    if (busy || !marks.length) return;
    marks.pop(); overlay.lastElementChild?.remove(); controls(); hint();
  }
  $('undo').onclick = undo;

  function closeText() {
    anchor = null; input.value = ''; form.hidden = true;
  }
  function placeTextForm() {
    if (!anchor || form.hidden) return;
    const r = canvas.getBoundingClientRect();
    form.style.left = bound(r.left + anchor.x * scale + 8, 8, window.innerWidth - form.offsetWidth - 8) + 'px';
    form.style.top = bound(r.top + anchor.y * scale + 8, 8, window.innerHeight - form.offsetHeight - 8) + 'px';
  }
  stage.addEventListener('scroll', placeTextForm, {passive:true});
  function acceptText() {
    if (!anchor) return;
    const content = input.value.replace(/\r\n?/g, '\n');
    if (content.trim()) {
      const size = Number($('size').value);
      measure.font = '600 ' + size + 'px ' + font;
      const lines = [];
      // Break long lines at image edges, preserving explicit line breaks and grapheme clusters.
      const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
      for (const paragraph of content.split('\n')) {
        if (measure.measureText(paragraph).width <= photo.naturalWidth) { lines.push(paragraph); continue; }
        let line = '', width = 0;
        const glyphs = segmenter ? segmenter.segment(paragraph) : paragraph;
        for (const part of glyphs) {
          const glyph = part.segment ?? part, advance = measure.measureText(glyph).width;
          if (line && width + advance > photo.naturalWidth) { lines.push(line); line = ''; width = 0; }
          line += glyph; width += advance;
        }
        lines.push(line);
      }
      const w = lines.reduce((result, line) => Math.max(result, measure.measureText(line).width), 0);
      add({tool:'text', lines, color:$('color').value, size,
        x:bound(anchor.x, 0, photo.naturalWidth - w), y:bound(anchor.y, 0, photo.naturalHeight - lines.length * size * 1.28)});
    }
    closeText();
  }
  form.onsubmit = event => { event.preventDefault(); acceptText(); stage.focus(); };
  $('text-cancel').onclick = () => { closeText(); stage.focus(); };
  for (const button of tools) button.onclick = () => {
    acceptText(); currentTool = button.dataset.tool; controls(); hint();
  };
  canvas.onpointerdown = event => {
    if (!record || busy || drag || event.button !== 0 || !event.isPrimary) return;
    acceptText();
    const a = point(event);
    if (currentTool === 'text') {
      anchor = a; form.hidden = false; placeTextForm(); input.focus(); event.preventDefault(); return;
    }
    const weight = Math.max(2, Math.round(3 / scale));
    const mark = {tool:currentTool, a, b:a, color:$('color').value, weight};
    const node = preview(mark); overlay.append(node);
    drag = {id:event.pointerId, mark, node};
    canvas.setPointerCapture(event.pointerId); event.preventDefault();
  };
  canvas.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    drag.mark.b = point(event);
    drag.node.setAttribute('d', vectorPath(drag.mark));
  };
  function finishDrag(event, keep) {
    if (drag?.id !== event.pointerId) return;
    const {id, mark, node} = drag;
    drag = null; node.remove();
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    if (keep) {
      mark.b = point(event);
      if (Math.hypot(mark.b.x - mark.a.x, mark.b.y - mark.a.y) * scale >= 2) add(mark);
    }
  }
  canvas.onpointerup = event => finishDrag(event, true);
  canvas.onpointercancel = canvas.onlostpointercapture = event => finishDrag(event, false);

  function renderMark(context, mark) {
    if (mark.tool === 'text') {
      context.font = '600 ' + mark.size + 'px ' + font; context.fillStyle = mark.color;
      eachTextLine(mark, (line,x,y) => context.fillText(line,x,y));
    } else {
      context.lineCap = context.lineJoin = 'round'; context.lineWidth = mark.weight; context.strokeStyle = mark.color;
      context.stroke(new Path2D(vectorPath(mark)));
    }
  }
  async function bitmap() {
    // A file imported as JPEG/WebP may have been decoded with a PNG display MIME by a host.
    // Only bypass rasterization when the encoded bytes also have the PNG signature.
    if (!marks.length && photo.src.startsWith('data:image/png;base64,iVBORw0KGgo')) return photo.src.split(',', 2)[1];
    const w = photo.naturalWidth, h = photo.naturalHeight;
    let blob;
    if (w * h > 12000000 || Math.max(w,h) > 16000) {
      blob = await tiledPNG(w, h);
    } else {
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      try {
        const ctx = out.getContext('2d');
        ctx.drawImage(photo, 0, 0);
        marks.forEach(mark => renderMark(ctx,mark));
        blob = await new Promise((resolve, reject) => out.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败。')), 'image/png'));
      } finally { out.width = out.height = 1; }
    }
    return desktop.encode(blob);
  }

  // Avoid allocating a full-resolution drawing canvas for tall pages. Deflate a strip
  // at a time and frame the compressed data as one or more standard PNG IDAT chunks.
  async function tiledPNG(w,h) {
    const heights = Math.max(1, Math.min(512, Math.floor(256000 / w)));
    const strip = document.createElement('canvas'); strip.width = w; strip.height = heights;
    const ctx = strip.getContext('2d', {willReadFrequently:true});
    const crcTable = Uint32Array.from({length:256}, (_, n) => {
      for (let bit=0; bit<8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
      return n >>> 0;
    });
    const chunks = [new Uint8Array([137,80,78,71,13,10,26,10])];
    function append(name, bytes) {
      const head = new Uint8Array(8), tail = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, bytes.length);
      let crc = 0xffffffff;
      for (let i=0; i<4; i++) {
        head[4+i] = name.charCodeAt(i);
        crc = crcTable[(crc ^ head[4+i]) & 255] ^ (crc >>> 8);
      }
      for (const v of bytes) crc = crcTable[(crc ^ v) & 255] ^ (crc >>> 8);
      new DataView(tail.buffer).setUint32(0, (crc ^ 0xffffffff) >>> 0);
      chunks.push(head,bytes,tail);
    }
    const header = new Uint8Array(13), dv = new DataView(header.buffer);
    dv.setUint32(0,w); dv.setUint32(4,h); header[8] = 8; header[9] = 6;
    append('IHDR',header);
    const compression = new CompressionStream('deflate'), writer = compression.writable.getWriter();
    const drain = compression.readable.pipeTo(new WritableStream({write(bytes) { append('IDAT',bytes); }}));
    try {
      for (let y=0; y<h; y+=heights) {
        const rows = Math.min(heights,h-y);
        ctx.clearRect(0,0,w,heights);
        ctx.drawImage(photo,0,y,w,rows,0,0,w,rows);
        ctx.save();
        ctx.translate(0,-y); marks.forEach(mark => renderMark(ctx,mark)); ctx.restore();
        const pixels = ctx.getImageData(0,0,w,rows).data, stride = w * 4;
        const scan = new Uint8Array(rows*(stride+1));
        for (let line=0; line<rows; line++) {
          const from=line*stride, to=line*(stride+1);
          scan[to]=1; // PNG Sub filter
          for (let j=0; j<stride; j++) scan[to+1+j] = pixels[from+j] - (j<4 ? 0 : pixels[from+j-4]);
        }
        await writer.write(scan);
      }
      await writer.close(); await drain; append('IEND',new Uint8Array());
      return new Blob(chunks,{type:'image/png'});
    } catch (error) {
      await writer.abort(error).catch(()=>{}); await drain.catch(()=>{}); throw error;
    } finally { strip.width = strip.height = 1; }
  }
  function fileDetails() {
    const title = (record.title || '截图') + (marks.length ? ' · 标注' : '');
    return {title,width:photo.naturalWidth,height:photo.naturalHeight,frameHeight:record.frameHeight,filename:(title.replace(/[\\/:*?"<>|]/g, '-') + '.png'),mime:'image/png'};
  }
  async function sendImage(command) {
    const info = fileDetails();
    // A saved filename ends in .png. An archive ID can point to original JPEG/WebP
    // bytes even when its display preview was transcoded to PNG.
    if (record.id && !marks.length && command !== 'file.save') {
      try { return await desktop.request(command, {...info,id:record.id}); }
      catch (error) {
        if (!/(?:记录|截图|文件).*(?:移除|删除|不存在|丢失|无法读取)|(?:找不到|未找到).*(?:记录|文件)|记录已失效/.test(error.message)) throw error;
      }
    }
    return desktop.request(command, {...info,data:await bitmap()});
  }
  async function action(key) {
    if (!record || busy || drag) return;
    acceptText(); busy = true; controls();
    try {
      status(key === 'save' ? '正在准备保存…' : key === 'copy' ? '正在复制…' : '正在置顶…');
      const command = {save:'file.save',pin:'capture.pin',copy:'capture.copy'}[key];
      let response;
      if (key === 'save' && $('format').value === 'zip') {
        const width = photo.naturalWidth, height = photo.naturalHeight;
        const blob = await window.splitCapturePNG({width,height,pageHeight:record.frameHeight,draw(ctx,top,rows) {
          ctx.drawImage(photo,0,top,width,rows,0,0,width,rows);
          ctx.translate(0,-top); marks.forEach(mark => renderMark(ctx,mark));
        }});
        await desktop.request(command,{filename:fileDetails().filename.replace(/\.png$/, '-分屏.zip'),mime:blob.type,data:await desktop.encode(blob)});
      } else { response = await sendImage(command); }
      if (key === 'copy' && response?.warning) {
        status('已复制到剪贴板。' + response.warning + ' 可另存为本地图片。', true);
      } else if (key === 'copy') {
        status('已复制到剪贴板。'); await desktop.request('window.close');
      } else { status(key === 'save' ? '图片已保存。' : '图片已置顶。'); }
    } catch (error) { status(error.message || '操作未完成，请重试。', !/取消/.test(error.message)); }
    finally { busy = false; controls(); }
  }
  for (const key of ['copy','save','pin']) $(key).onclick = () => action(key);
  function close() { if (!busy) desktop.request('window.close').catch(error => status(error.message,true)); }
  $('cancel').onclick = close;
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (anchor) { closeText(); stage.focus(); } else close();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (anchor) { acceptText(); stage.focus(); } else action('copy');
    } else if (!anchor && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); undo();
    }
  });
  desktop.on('capture.ready', async item => {
    const version = ++loading;
    try {
      let source = item;
      if (!source.data && !source.url && source.id) source = {...source,...await desktop.request('history.detail',{id:source.id})};
      const next = new Image();
      next.alt = '当前截图'; next.id = 'photo'; next.draggable = false;
      const uri = desktop.mediaURL(source);
      if (!uri) throw new Error('缺少截图图像。');
      if (/^https?:/.test(uri)) next.crossOrigin = 'anonymous';
      next.src = uri; await next.decode();
      if (version !== loading) return;
      closeText(); photo.replaceWith(next); photo = next;
      const frameHeight = Math.max(1, Math.round(Number(source.frameHeight) || photo.naturalHeight));
      record = {id:source.id,title:source.title,frameHeight};
      $('format').value = 'png'; $('format').hidden = frameHeight >= photo.naturalHeight;
      marks.length = 0; drag = null; overlay.replaceChildren();
      overlay.setAttribute('viewBox', '0 0 ' + photo.naturalWidth + ' ' + photo.naturalHeight);
      $('zoom').value = 'fit'; currentTool = 'rect'; canvas.hidden = false;
      $('dimensions').textContent = photo.naturalWidth + ' × ' + photo.naturalHeight;
      resize(); stage.scrollTop = stage.scrollLeft = 0; controls();
      if (source.archiveError) status('原图未能加入历史。' + source.archiveError + ' 可继续编辑或另存为本地图片。',true);
      else hint();
    } catch (error) { if (version === loading) status('无法打开截图。' + (error.message || ''),true); }
  });
  desktop.on('native.status', info => status(info?.message || '',true));
  controls();
})();
