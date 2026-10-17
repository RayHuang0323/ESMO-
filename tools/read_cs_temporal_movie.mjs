#!/usr/bin/env node
// Exact saved RGB sample inspection; emits in-memory PNG contact sheet, writes no PNG files.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
const [file,indexArg]=process.argv.slice(2);if(!file||!indexArg)throw Error('Use <saved temporal HTML> <comma separated sample indices>');
const text=fs.readFileSync(file,'utf8'),match=/,payload=("[A-Za-z0-9+/=]+");/.exec(text);if(!match)throw Error('Movie payload marker absent');
const rgb=zlib.gunzipSync(Buffer.from(JSON.parse(match[1]),'base64')),stride=96*64*3,count=rgb.length/stride,indices=indexArg.split(',').map(Number);
if(!Number.isInteger(count)||indices.some(n=>!Number.isInteger(n)||n<0||n>=count))throw Error('Exact sample index out of bounds');
const scale=3,cols=3,rows=Math.ceil(indices.length/cols),width=96*cols*scale,height=64*rows*scale,scan=Buffer.alloc((width*3+1)*height);
for(let n=0;n<indices.length;n++)for(let y=0;y<64;y++)for(let x=0;x<96;x++)for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const dst=((Math.floor(n/cols)*64+y)*scale+dy)*(width*3+1)+1+((n%cols)*96+x)*scale*3+dx*3,src=indices[n]*stride+(y*96+x)*3;rgb.copy(scan,dst,src,src+3);}
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(zlib.crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);}
const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
console.log(JSON.stringify({file,indices,count,width,height,displayScale:scale,displayMethod:'Exact RGB nearest-neighbor replication; no enhancement or changed colors',rawRgbSha256:createHash('sha256').update(rgb).digest('hex'),storage:'In-memory PNG contact sheet only; 0 disk PNG',image:'data:image/png;base64,'+png.toString('base64')}));
