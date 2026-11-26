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
  // Indices stay stable while editing. Each undo entry retains one prior immutable mark.
  const marks = [], history = [], samples = new Map();
  const selection = $('selection');
  const block = 12;
  let selected = -1, editingText = -1, colorGesture = null;

  function status(text, error = false) {
    $('status').textContent = text;
    $('status').classList.toggle('error', error);
  }
  function hint() {
    if (currentTool === 'mosaic') status('按住鼠标涂抹马赛克，每笔可以单独撤销。');
    else if (selected >= 0) status('拖动标注可移动，拖动手柄可缩放。' + (marks[selected].tool === 'text' ? ' 双击文字可修改内容。' : ''));
    else if (currentTool === 'select') status('点选框、线或文字后可移动、缩放和改色。');
    else if (currentTool === 'text') status('点选图片上的位置，输入文字。');
    else status('拖动鼠标标注。长图可切换「适应宽度」查看细节。');
  }
  function controls() {
    const unavailable = busy || !record;
    for (const button of [...tools, $('color'), $('size'), $('brush'), $('edit-text'), $('zoom'), $('format'), $('copy'), $('save'), $('pin')]) button.disabled = unavailable;
    $('undo').disabled = unavailable || history.length === 0;
    $('cancel').disabled = busy;
    for (const button of tools) button.setAttribute('aria-pressed', String(button.dataset.tool === currentTool));
    const mark = marks[selected];
    if (mark) {
      $('color').value = mark.color;
      if (mark.tool === 'text') $('size').value = mark.size;
    }
    $('size-label').hidden = currentTool !== 'text' && mark?.tool !== 'text';
    $('edit-text').hidden = mark?.tool !== 'text';
    $('brush-label').hidden = currentTool !== 'mosaic';
    $('color').parentElement.hidden = currentTool === 'mosaic';
    canvas.classList.toggle('text-tool', currentTool === 'text');
    canvas.classList.toggle('select-tool', currentTool === 'select');
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
    placeTextForm(); drawSelection();
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
  function arrowWings(mark) {
    const {a,b} = mark, dx = b.x-a.x, dy = b.y-a.y;
    const length = Math.max(.001,Math.hypot(dx,dy));
    const head = Math.min(mark.weight*5,length*.45), hx = dx/length*head, hy = dy/length*head;
    return [{x:b.x-hx+hy*.48,y:b.y-hy-hx*.48},{x:b.x-hx-hy*.48,y:b.y-hy+hx*.48}];
  }
  function vectorPath(mark) {
    const {a, b} = mark;
    if (mark.tool === 'rect') return 'M ' + a.x + ' ' + a.y + ' H ' + b.x + ' V ' + b.y + ' H ' + a.x + ' Z';
    let path = 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
    if (mark.tool === 'arrow') {
      const [left,right] = arrowWings(mark);
      path += ' M ' + left.x + ' ' + left.y + ' L ' + b.x + ' ' + b.y + ' L ' + right.x + ' ' + right.y;
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
  function mosaicSquare(cell) {
    return svg('rect', {x:cell.x, y:cell.y, width:block, height:block, fill:cell.color});
  }
  function preview(mark) {
    if (mark.tool === 'mosaic') {
      const group = svg('g', {'data-mark':'mosaic', 'shape-rendering':'crispEdges'});
      for (const cell of mark.cells) group.append(mosaicSquare(cell));
      return group;
    }
    if (mark.tool !== 'text') return svg('path', {
      'data-mark':mark.tool, d:vectorPath(mark), fill:'none', stroke:mark.color,
      'stroke-width':mark.weight, 'stroke-linejoin':'round', 'stroke-linecap':'round'
    });
    const group = svg('g', {'data-mark':'text', fill:mark.color, 'font-size':mark.size, 'font-family':font, 'font-weight':600});
    eachTextLine(mark, (line, x, y) => {
      const t = svg('text', {x,y});
      t.style.whiteSpace = 'pre'; t.textContent = line; group.append(t);
    });
    return group;
  }
  function bounds(mark) {
    if (mark.tool === 'text') return {x:mark.x, y:mark.y, w:mark.width, h:mark.height};
    return {x:Math.min(mark.a.x,mark.b.x), y:Math.min(mark.a.y,mark.b.y),
      w:Math.abs(mark.b.x-mark.a.x), h:Math.abs(mark.b.y-mark.a.y)};
  }
  function handles(mark) {
    if (mark.tool === 'line' || mark.tool === 'arrow') return {a:mark.a, b:mark.b};
    const {x,y,w,h} = bounds(mark);
    return {nw:{x,y}, ne:{x:x+w,y}, sw:{x,y:y+h}, se:{x:x+w,y:y+h}};
  }
  function drawSelection() {
    selection.replaceChildren();
    const mark = marks[selected];
    if (!mark || !record) return;
    const grip = 8 / scale, {x,y,w,h} = bounds(mark);
    if (mark.tool === 'text' || mark.tool === 'rect') {
      selection.append(svg('rect', {x,y,width:w,height:h,fill:'none',stroke:'#2f72b9',
        'stroke-width':1/scale, 'stroke-dasharray':(4/scale)+' '+(3/scale)}));
    }
    for (const [key, p] of Object.entries(handles(mark))) {
      selection.append(svg('rect', {'data-handle':key, x:p.x-grip/2, y:p.y-grip/2,
        width:grip,height:grip,rx:1.2/scale,fill:'white',stroke:'#225e95','stroke-width':1.4/scale}));
    }
  }
  function select(index) {
    selected = index; colorGesture = null; drawSelection(); controls(); hint();
  }
  function remember(index, before) {
    history.push({index,before});
    if (history.length > 100) history.shift();
  }
  function replace(index, mark) {
    marks[index] = mark; overlay.children[index].replaceWith(preview(mark)); drawSelection();
  }
  function applyEdit(index, mark) {
    remember(index, marks[index]); replace(index,mark); select(index);
  }
  function undo() {
    if (busy || drag || !history.length) return;
    closeText();
    const {index,before} = history.pop();
    if (before) { replace(index,before); select(index); }
    else { marks.splice(index,1); overlay.children[index].remove(); select(-1); }
  }
  $('undo').onclick = undo;

  function closeText() {
    anchor = null; editingText = -1; input.value = ''; form.hidden = true;
  }
  function placeTextForm() {
    if (!anchor || form.hidden) return;
    const r = canvas.getBoundingClientRect();
    form.style.left = bound(r.left + anchor.x * scale + 8, 8, window.innerWidth - form.offsetWidth - 8) + 'px';
    form.style.top = bound(r.top + anchor.y * scale + 8, 8, window.innerHeight - form.offsetHeight - 8) + 'px';
  }
  stage.addEventListener('scroll', placeTextForm, {passive:true});
  function openText(p, index = -1) {
    editingText = index; anchor = p;
    input.value = marks[index]?.content || '';
    $('text-apply').textContent = index < 0 ? '添加文字' : '应用更改';
    form.hidden = false; placeTextForm(); input.focus();
  }
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
  function layoutText(mark, size) {
    measure.font = '600 ' + size + 'px ' + font;
    const lines = [];
    for (const paragraph of mark.content.split('\n')) {
      if (measure.measureText(paragraph).width <= photo.naturalWidth) { lines.push(paragraph); continue; }
      let line = '', advance = 0;
      for (const part of segmenter ? segmenter.segment(paragraph) : paragraph) {
        const glyph = part.segment ?? part, width = measure.measureText(glyph).width;
        if (line && advance + width > photo.naturalWidth) { lines.push(line); line = ''; advance = 0; }
        line += glyph; advance += width;
      }
      lines.push(line);
    }
    const width = lines.reduce((widest,line) => Math.max(widest,measure.measureText(line).width),1);
    const height = lines.length * size * 1.28;
    return {...mark,lines,size,width,height,x:bound(mark.x,0,photo.naturalWidth-width),y:bound(mark.y,0,photo.naturalHeight-height)};
  }
  function acceptText() {
    if (!anchor) return;
    const content = input.value.replace(/\r\n?/g, '\n'), index = editingText, p = anchor;
    closeText();
    if (!content.trim() || content === marks[index]?.content) return;
    const base = marks[index] || {tool:'text', x:p.x,y:p.y,color:$('color').value};
    const mark = layoutText({...base,content}, base.size || validSize());
    if (index >= 0) applyEdit(index,mark);
    else { remember(marks.length,null); marks.push(mark); overlay.append(preview(mark)); select(marks.length-1); }
  }
  function validSize() { return bound(Math.round(Number($('size').value) || 32),8,512); }
  form.onsubmit = event => { event.preventDefault(); acceptText(); stage.focus(); };
  $('text-cancel').onclick = () => { closeText(); stage.focus(); };
  $('edit-text').onclick = () => { if (marks[selected]?.tool === 'text') openText(marks[selected],selected); };
  function changeColor() {
    const mark = marks[selected], color = $('color').value;
    if (!mark || busy || drag || mark.color === color) return;
    // Some native color panels stay open while the user edits or exports. Commit
    // each live color to the model, grouping the gesture into one undo step.
    if (colorGesture !== mark) remember(selected,mark);
    colorGesture = {...mark,color};
    replace(selected,colorGesture); controls();
  }
  $('color').oninput = changeColor;
  $('color').onchange = () => { changeColor(); colorGesture = null; };
  $('size').onchange = () => {
    const size = validSize(); $('size').value = size;
    if (marks[selected]?.tool === 'text' && size !== marks[selected].size) applyEdit(selected,layoutText(marks[selected],size));
  };
  for (const button of tools) button.onclick = () => {
    if (drag) return;
    acceptText(); currentTool = button.dataset.tool; select(currentTool === 'select' ? selected : -1);
  };

  // Cache small tiles of the downsampled image. Even on a long screenshot, memory
  // usage for sampling stays bounded and painting touches only the actual stroke.
  const tileCells = 16;
  function blockColor(col,row) {
    const tx = Math.floor(col/tileCells), ty = Math.floor(row/tileCells), key = tx + ',' + ty;
    let pixels = samples.get(key);
    if (!pixels) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = tileCells;
      const ctx = tile.getContext('2d',{willReadFrequently:true});
      ctx.fillStyle = 'white'; ctx.fillRect(0,0,tileCells,tileCells);
      ctx.imageSmoothingQuality = 'high';
      const source = tileCells * block;
      ctx.drawImage(photo, tx*source,ty*source,source,source,0,0,tileCells,tileCells);
      pixels = ctx.getImageData(0,0,tileCells,tileCells).data; tile.width = tile.height = 1;
      if (samples.size >= 48) samples.delete(samples.keys().next().value);
      samples.set(key,pixels);
    }
    const i = ((row%tileCells)*tileCells + col%tileCells)*4;
    return 'rgb('+pixels[i]+','+pixels[i+1]+','+pixels[i+2]+')';
  }
  function brushTo(d,p) {
    const radius = d.radius, previous = d.last || p, distance = Math.hypot(p.x-previous.x,p.y-previous.y);
    const steps = Math.max(1, Math.ceil(distance/(radius/2)));
    const cols = Math.ceil(photo.naturalWidth/block), rows = Math.ceil(photo.naturalHeight/block);
    const added = document.createDocumentFragment();
    for (let i=1; i<=steps; i++) {
      const x = previous.x+(p.x-previous.x)*i/steps, y = previous.y+(p.y-previous.y)*i/steps;
      for (let row=Math.max(0,Math.floor((y-radius)/block)); row<rows && row*block<=y+radius; row++) {
        for (let col=Math.max(0,Math.floor((x-radius)/block)); col<cols && col*block<=x+radius; col++) {
          const cx = col*block, cy = row*block, key = row*cols+col;
          if (d.seen.has(key)) continue;
          const dx = x-bound(x,cx,cx+block), dy = y-bound(y,cy,cy+block);
          if (dx*dx+dy*dy > radius*radius) continue;
          const cell = {x:cx,y:cy,color:blockColor(col,row)};
          d.seen.add(key); d.mark.cells.push(cell); added.append(mosaicSquare(cell));
        }
      }
    }
    d.node.append(added); d.last = p;
  }
  function distanceToLine(p,a,b) {
    const dx = b.x-a.x, dy = b.y-a.y;
    const t = bound(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function hitIndex(p) {
    for (let i=marks.length-1; i>=0; i--) {
      const mark = marks[i];
      if (mark.tool === 'mosaic') continue;
      const tolerance = 5/scale + (mark.weight || 0)/2, {x,y,w,h} = bounds(mark);
      if (mark.tool === 'line' || mark.tool === 'arrow') {
        if (distanceToLine(p,mark.a,mark.b) <= tolerance) return i;
        if (mark.tool === 'arrow' && arrowWings(mark).some(wing => distanceToLine(p,wing,mark.b) <= tolerance)) return i;
      } else if (p.x>=x-tolerance && p.x<=x+w+tolerance && p.y>=y-tolerance && p.y<=y+h+tolerance) {
        if (mark.tool === 'text' || currentTool === 'select' ||
          Math.min(Math.abs(p.x-x),Math.abs(p.x-x-w),Math.abs(p.y-y),Math.abs(p.y-y-h)) <= tolerance) return i;
      }
    }
    return -1;
  }
  function moved(mark,start,p) {
    const {x,y,w,h} = bounds(mark);
    const dx = bound(p.x-start.x,-x,photo.naturalWidth-x-w), dy = bound(p.y-start.y,-y,photo.naturalHeight-y-h);
    if (mark.tool === 'text') return {...mark,x:x+dx,y:y+dy};
    return {...mark,a:{x:mark.a.x+dx,y:mark.a.y+dy},b:{x:mark.b.x+dx,y:mark.b.y+dy}};
  }
  function resized(mark,handle,p) {
    if (handle === 'a' || handle === 'b') return {...mark,[handle]:p};
    const fixed = handles(mark)[{nw:'se',se:'nw',ne:'sw',sw:'ne'}[handle]];
    if (mark.tool === 'rect') return {...mark,a:fixed,b:p};
    const left = handle.endsWith('w'), top = handle.startsWith('n');
    const dx = (p.x-fixed.x)*(left ? -1 : 1), dy = (p.y-fixed.y)*(top ? -1 : 1);
    const ratio = (dx*mark.width+dy*mark.height)/(mark.width**2+mark.height**2);
    const next = layoutText(mark,bound(Math.round(mark.size*ratio),8,512));
    next.x = bound(left ? fixed.x-next.width : fixed.x,0,photo.naturalWidth-next.width);
    next.y = bound(top ? fixed.y-next.height : fixed.y,0,photo.naturalHeight-next.height);
    return next;
  }
  canvas.onpointerdown = event => {
    if (!record || busy || drag || event.button !== 0 || !event.isPrimary) return;
    acceptText();
    const p = point(event), handle = event.target.dataset?.handle;
    const hit = handle ? selected : currentTool === 'mosaic' ? -1 : hitIndex(p);
    if (hit >= 0) {
      select(hit); drag = {kind:handle?'resize':'move', handle, index:hit, before:marks[hit], start:p};
    } else {
      select(-1);
      if (currentTool === 'select') return;
      if (currentTool === 'text') { openText(p); event.preventDefault(); return; }
      const mark = currentTool === 'mosaic' ? {tool:'mosaic',cells:[]} :
        {tool:currentTool,a:p,b:p,color:$('color').value,weight:Math.max(2,Math.round(3/scale))};
      const node = preview(mark); overlay.append(node);
      drag = {kind:'draw',mark,node,start:p};
      if (mark.tool === 'mosaic') {
        Object.assign(drag,{seen:new Set(),radius:Number($('brush').value)/2});
        brushTo(drag,p);
      }
    }
    drag.id = event.pointerId; canvas.setPointerCapture(event.pointerId); event.preventDefault();
  };
  function updateDrag(p) {
    if (drag.kind === 'draw') {
      if (drag.mark.tool === 'mosaic') brushTo(drag,p);
      else { drag.mark.b = p; drag.node.setAttribute('d',vectorPath(drag.mark)); }
      return;
    }
    if (!drag.changed && Math.hypot(p.x-drag.start.x,p.y-drag.start.y)*scale<1) return;
    drag.changed = true;
    const mark = drag.kind === 'resize' ? resized(drag.before,drag.handle,p) : moved(drag.before,drag.start,p);
    replace(drag.index,mark);
    if (mark.tool === 'text') $('size').value = mark.size;
  }
  canvas.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    if (drag.mark?.tool === 'mosaic') {
      for (const sample of event.getCoalescedEvents?.() || []) brushTo(drag,point(sample));
    }
    updateDrag(point(event));
  };
  function finishDrag(event, keep) {
    if (drag?.id !== event.pointerId) return;
    if (keep) updateDrag(point(event));
    const d = drag; drag = null;
    if (canvas.hasPointerCapture(d.id)) canvas.releasePointerCapture(d.id);
    if (d.kind === 'draw') {
      if (keep && (d.mark.tool === 'mosaic' || Math.hypot(d.mark.b.x-d.start.x,d.mark.b.y-d.start.y)*scale>=2)) {
        remember(marks.length,null); marks.push(d.mark); select(d.mark.tool === 'mosaic' ? -1 : marks.length-1);
      } else d.node.remove();
    } else if (d.changed) {
      if (keep) remember(d.index,d.before); else replace(d.index,d.before);
      select(d.index);
    }
  }
  canvas.onpointerup = event => finishDrag(event, true);
  canvas.onpointercancel = canvas.onlostpointercapture = event => finishDrag(event, false);
  canvas.ondblclick = event => {
    if (!record || busy || currentTool === 'mosaic') return;
    const index = hitIndex(point(event));
    if (marks[index]?.tool === 'text') { select(index); openText(marks[index],index); }
  };

  function renderMark(context, mark, top, bottom) {
    if (mark.tool === 'mosaic') {
      for (const cell of mark.cells) {
        if (cell.y + block <= top || cell.y >= bottom) continue;
        context.fillStyle = cell.color; context.fillRect(cell.x,cell.y,block,block);
      }
    } else if (mark.tool === 'text') {
      context.font = '600 ' + mark.size + 'px ' + font; context.fillStyle = mark.color;
      eachTextLine(mark, (line,x,y) => context.fillText(line,x,y));
    } else {
      context.lineCap = context.lineJoin = 'round'; context.lineWidth = mark.weight; context.strokeStyle = mark.color;
      context.stroke(new Path2D(vectorPath(mark)));
    }
  }
  function renderStrip(ctx, top, rows) {
    const width = photo.naturalWidth;
    ctx.drawImage(photo,0,top,width,rows,0,0,width,rows);
    ctx.save(); ctx.translate(0,-top);
    marks.forEach(mark => renderMark(ctx,mark,top,top+rows));
    ctx.restore();
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
        renderStrip(ctx,0,h);
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
        renderStrip(ctx,y,rows);
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
        const blob = await window.splitCapturePNG({width,height,pageHeight:record.frameHeight,draw:renderStrip});
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
      marks.length = history.length = 0; samples.clear(); drag = null; selected = -1; colorGesture = null; overlay.replaceChildren();
      for (const layer of [overlay,selection]) layer.setAttribute('viewBox', '0 0 ' + photo.naturalWidth + ' ' + photo.naturalHeight);
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
