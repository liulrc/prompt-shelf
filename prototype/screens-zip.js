(() => {
  'use strict';
  // Each ZIP entry is an already compressed PNG. Store the bytes unchanged.
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
  window.splitCapturePNG = async function({width,height:totalHeight,pageHeight,draw}) {
    const local=[],central=[]; let offset=0,centralSize=0,count=0;
    const encode=new TextEncoder();
    for (let top=0;top<totalHeight;top+=pageHeight) {
      const height = Math.min(pageHeight, totalHeight - top);
      const part = document.createElement('canvas'); part.width = width; part.height = height;
      let bytes;
      try {
        draw(part.getContext('2d'),top,height);
        const blob = await new Promise((resolve,reject) => part.toBlob(value => value ? resolve(value) : reject(new Error('分屏 PNG 导出失败。')), 'image/png'));
        bytes = new Uint8Array(await blob.arrayBuffer());
      } finally { part.width = part.height = 1; }
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

})();
