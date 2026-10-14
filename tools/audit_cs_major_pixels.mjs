#!/usr/bin/env node
// 唯讀 screenshot 像素 fallback：不是官方 inspector 或 premium 品質證明。
// 唯一執行輸出是 evidence/pixel-metrics.json；不修改或另存 PNG。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const EDGE_THRESHOLD = 16;
const round = n => Number(n.toFixed(6));
function assert(ok, message) { if (!ok) throw new Error(message); }
function argumentsOf(argv) {
  const args = {phase:'phase-a9',width:'1366'};
  for (const arg of argv) {
    const m = /^--(phase|width)=([^=]+)$/.exec(arg);
    assert(m, '參數只能使用 --phase=名稱 --width=寬度'); args[m[1]]=m[2];
  }
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(args.phase), 'phase 必須是單一安全目錄名稱');
  assert(/^[1-9]\d{1,4}$/.test(args.width), 'width 必須是正整數');
  args.width=Number(args.width); assert(args.width>=100&&args.width<=16384,'width 必須介於 100–16384');
  return args;
}
const crcTable = Uint32Array.from({length:256},(_,i)=>{
  for(let bit=0;bit<8;bit++)i=(i&1)?0xedb88320^(i>>>1):i>>>1; return i>>>0;
});
function crc32(buffer) { let c=0xffffffff; for(const byte of buffer)c=crcTable[(c^byte)&255]^(c>>>8); return(c^0xffffffff)>>>0; }
function paeth(a,b,c) { const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
function decodePng(bytes) {
  assert(bytes.length>=45&&bytes.subarray(0,8).equals(PNG_SIGNATURE),'PNG signature／最小長度不正確');
  let offset=8,header=null,ended=false,idatEnded=false;const chunks=[];
  while(offset<bytes.length){
    assert(offset+12<=bytes.length,'PNG chunk header／CRC 越界');
    const size=bytes.readUInt32BE(offset);assert(size<=bytes.length-offset-12,'PNG chunk data 越界');
    const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+size);
    assert(/^[A-Za-z]{4}$/.test(type),'PNG chunk type 非有效 ASCII');
    assert(crc32(bytes.subarray(offset+4,offset+8+size))===bytes.readUInt32BE(offset+8+size),`${type} CRC 不正確`);
    if(!header)assert(type==='IHDR'&&offset===8,'IHDR 不是第一個 chunk');
    if(type==='IHDR'){
      assert(!header&&size===13,'IHDR 重複或長度不正確');
      const width=data.readUInt32BE(0),height=data.readUInt32BE(4);
      assert(width>0&&height>0&&width*height<=64000000,'PNG 尺寸為 0 或超過安全解碼上限');
      assert(data[8]===8&&[2,6].includes(data[9]),'僅支援 8-bit RGB／RGBA PNG');
      assert(data[10]===0&&data[11]===0&&data[12]===0,'僅支援標準 compression／filter 與 non-interlaced PNG');
      header={width,height,colorType:data[9],channels:data[9]===6?4:3};
    }else if(type==='IDAT'){assert(!idatEnded,'IDAT chunks 不連續');chunks.push(data);
    }else if(type==='IEND'){
      assert(size===0&&chunks.length>0,'IEND 長度不正確或缺 IDAT');assert(offset+12===bytes.length,'IEND 後仍有資料');ended=true;
    }else{
      if(chunks.length)idatEnded=true;
      assert(!['acTL','fcTL','fdAT','tRNS'].includes(type),`${type} 不在此 screenshot decoder 支援範圍`);
      if(type==='PLTE')assert(!chunks.length&&size>0&&size<=768&&size%3===0,'PLTE 位置／形狀不正確');
      else assert(type[0]===type[0].toLowerCase(),`未知 critical chunk：${type}`);
    }
    offset+=size+12;if(ended)break;
  }
  assert(header&&ended,'缺少 IHDR／IEND');
  const stride=header.width*header.channels,expected=(stride+1)*header.height;
  const input=zlib.inflateSync(Buffer.concat(chunks),{maxOutputLength:expected+1});
  assert(input.length===expected,`inflate shape 不正確：${input.length}，預期 ${expected}`);
  const pixels=Buffer.alloc(stride*header.height);
  for(let y=0;y<header.height;y++){
    const src=y*(stride+1),dst=y*stride,filter=input[src];assert(filter<=4,`不支援 filter ${filter}`);
    for(let x=0;x<stride;x++){
      const a=x>=header.channels?pixels[dst+x-header.channels]:0,b=y>0?pixels[dst+x-stride]:0,c=y>0&&x>=header.channels?pixels[dst+x-stride-header.channels]:0;
      const predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
      pixels[dst+x]=(input[src+x+1]+predict)&255;
    }
  }
  return{...header,pixels};
}
function pngFiles(directory){
  const result=[];
  for(const item of fs.readdirSync(directory,{withFileTypes:true})){
    const filename=path.join(directory,item.name);
    if(item.isDirectory())result.push(...pngFiles(filename));
    else if(item.isFile()&&/\.png$/i.test(item.name))result.push(filename);
  }
  return result.sort();
}
function findCapture(filename,rows){
  const stem=path.basename(filename,path.extname(filename));
  const matches=rows.filter(row=>typeof row.map==='string'&&stem.startsWith(`${row.map}-`));
  if(matches.length!==1)return{reason:'無法唯一匹配 screenshot map；不猜 metadata'};
  const row=matches[0],state=stem.slice(row.map.length+1);
  const gallery=[...(row.weaponGallery||[]),...(row.weaponReloadGallery||[]),...(row.operatorGallery||[])].find(entry=>entry.captureRect&&filename.replaceAll('\\','/').endsWith('/'+entry.file));
  if(gallery)return{row,state,rect:gallery.captureRect};
  return row.captureRects?.[state]?{row,state,rect:row.captureRects[state]}:{row,state,reason:`缺少 captureRects.${state}，不猜 canvas 位置`};
}
function canvasCrop(png,viewport,rect){
  assert(viewport&&Number.isFinite(viewport.width)&&Number.isFinite(viewport.height)&&viewport.width>0&&viewport.height>0,'缺少有效 CSS viewport');
  const x=rect.left??rect.x,y=rect.top??rect.y;
  assert([x,y,rect.width,rect.height].every(Number.isFinite)&&rect.width>0&&rect.height>0,'captureRects 不是有效 DOMRect');
  if(rect.right!=null)assert(Number.isFinite(rect.right)&&Math.abs(rect.right-x-rect.width)<0.01,'DOMRect right 不一致');
  if(rect.bottom!=null)assert(Number.isFinite(rect.bottom)&&Math.abs(rect.bottom-y-rect.height)<0.01,'DOMRect bottom 不一致');
  const scale=png.width/viewport.width;
  assert(Math.abs(png.height-viewport.height*scale)<=1.1,'PNG 不是完整 viewport screenshot，不能可靠對應 CSS DOMRect');
  const visible={left:Math.max(0,x),top:Math.max(0,y),right:Math.min(viewport.width,x+rect.width),bottom:Math.min(viewport.height,y+rect.height)};
  // 只納入完整落在 canvas 內的像素，不把 fractional DOMRect 邊界外 UI 混入。
  const crop={left:Math.max(0,Math.ceil(visible.left*scale)),top:Math.max(0,Math.ceil(visible.top*scale)),right:Math.min(png.width,Math.floor(visible.right*scale)),bottom:Math.min(png.height,Math.floor(visible.bottom*scale))};
  assert(crop.right>crop.left&&crop.bottom>crop.top,'canvas 不在實際可見 viewport 範圍');
  return{...crop,width:crop.right-crop.left,height:crop.bottom-crop.top,screenshotScale:scale,visibleCssRect:visible};
}
function analyzePixels(png,crop){
  const colors=new Float64Array(512),luminance=new Float64Array(256),aboveRow=new Float64Array(crop.width);aboveRow.fill(NaN);
  let sampledPixels=0,excludedTransparentPixels=0,sum=0,dark=0,bright=0,edges=0,pairs=0;
  for(let y=crop.top;y<crop.bottom;y++){
    let left=NaN;
    for(let x=crop.left;x<crop.right;x++){
      const i=(y*png.width+x)*png.channels,column=x-crop.left;
      if(png.channels===4&&png.pixels[i+3]!==255){excludedTransparentPixels++;left=NaN;aboveRow[column]=NaN;continue;}
      const r=png.pixels[i],g=png.pixels[i+1],b=png.pixels[i+2],luma=0.2126*r+0.7152*g+0.0722*b;
      colors[((r>>>5)<<6)|((g>>>5)<<3)|(b>>>5)]++;luminance[Math.max(0,Math.min(255,Math.round(luma)))]++;
      sampledPixels++;sum+=luma;if(luma<8)dark++;if(luma>247)bright++;
      if(Number.isFinite(left)){pairs++;if(Math.abs(luma-left)>EDGE_THRESHOLD)edges++;}
      if(Number.isFinite(aboveRow[column])){pairs++;if(Math.abs(luma-aboveRow[column])>EDGE_THRESHOLD)edges++;}
      left=luma;aboveRow[column]=luma;
    }
  }
  assert(sampledPixels>0,'crop 沒有完全不透明的有效 RGB 像素');
  let entropy=0,dominant=0;
  for(const count of colors)if(count){const p=count/sampledPixels;entropy-=p*Math.log2(p);dominant=Math.max(dominant,count);}
  const percentile=q=>{const target=Math.floor((sampledPixels-1)*q)+1;let count=0;for(let bin=0;bin<256;bin++){count+=luminance[bin];if(count>=target)return bin;}throw new Error('luminance histogram shape 不正確');};
  const p05=percentile(0.05),p95=percentile(0.95);
  return{colorEntropyBits:round(entropy),dominantColorShare:round(dominant/sampledPixels),edgeDensity:pairs?round(edges/pairs):null,luminance:{mean:round(sum/sampledPixels),p05,p95,contrast:p95-p05},darkClipShare:round(dark/sampledPixels),brightClipShare:round(bright/sampledPixels),sampledPixels,excludedTransparentPixels,cropPixels:crop.width*crop.height,edgePairs:pairs,edgeCount:edges};
}
function renderBudget(row,width){
  const tier=width<600?'mobile':'desktop',target=tier==='mobile'?150:300;
  const calls=Number.isFinite(row.render?.callsP95)?row.render.callsP95:null;
  return{map:row.map,tier,calls,triangles:Number.isFinite(row.render?.trianglesP95)?row.render.trianglesP95:null,textureEstimateMB:Number.isFinite(row.textureMemoryEstimateMB)?row.textureMemoryEstimateMB:null,heapMB:Number.isFinite(row.jsHeapMB)?row.jsHeapMB:null,advisoryCallsTarget:target,callsAdvice:calls==null?'NOT_MEASURED':calls>target?'OVER_ADVISORY_TARGET':'WITHIN_ADVISORY_TARGET',measuredState:row.state??null,
    fps:row.fps??null,frameMs:row.frameMs??null,gpu:row.gpu??null,renderer:row.render??null,players:row.players??null,rigged:row.rigged??null,quality:row.quality??null,canvas:row.canvas??null,coldReadyMs:row.coldReadyMs??null,playback:row.playback??null,sourceSha:row.sourceSha??null,sourceFingerprint:row.sourceFingerprint??null,captureCamera:row.captureCamera??null,errors:row.errors??null,
    note:'取 metrics 的 active 量測，不代表每個 screenshot state；門檻僅 advisory，不是 PASS。desktop/mobile是同一桌機GPU的不同viewport／品質層，非手機真機；coldReadyMs包含模擬與資產，非純地圖載入。'};
}

try{
  const args=argumentsOf(process.argv.slice(2));
  const directory=path.join(ROOT,'review/cs-major-upgrade/evidence',args.phase,String(args.width));
  const metrics=JSON.parse(fs.readFileSync(path.join(directory,'metrics.json'),'utf8'));
  const rows=Array.isArray(metrics)?metrics:metrics.results;
  assert(Array.isArray(rows)&&rows.every(row=>row&&typeof row==='object'),'metrics.json 必須是 map rows array 或 results array');
  const files=pngFiles(directory);assert(files.length>0,'evidence 目錄沒有 PNG；不能產生完成結論');
  const results=[];
  for(const filename of files){
    const record={screenshot:path.relative(directory,filename).replaceAll('\\','/')};
    try{
      const png=decodePng(fs.readFileSync(filename));
      record.png={width:png.width,height:png.height,colorType:png.colorType,crcValidated:true};
      const capture=findCapture(filename,rows);
      record.map=capture.row?.map??null;record.state=capture.state??null;
      if(capture.reason){results.push({...record,status:'NOT_MEASURED',reason:capture.reason});continue;}
      let crop;
      try{crop=canvasCrop(png,capture.row.viewport,capture.rect);}
      catch(error){results.push({...record,status:'NOT_MEASURED',reason:error.message});continue;}
      results.push({...record,status:'MEASURED',viewport:capture.row.viewport,captureRect:capture.rect,crop,...analyzePixels(png,crop)});
    }catch(error){results.push({...record,status:'ERROR',reason:error.message});}
  }
  const summary={totalPng:results.length,measured:results.filter(row=>row.status==='MEASURED').length,notMeasured:results.filter(row=>row.status==='NOT_MEASURED').length,errors:results.filter(row=>row.status==='ERROR').length};
  const report={
    version:'cs-major-pixel-audit.v1',phase:args.phase,width:args.width,advisoryOnly:true,
    caveat:'此工具是自製 fallback 像素分析，非官方 inspector。entropy／edge／clip 與 renderBudget 都不能證明 premium 品質或 gameplay 可讀性；仍需所有狀態視覺審核與 GPU／真機驗證。',
    algorithms:{
      colorEntropyBits:'每個 RGB channel 取高 3 bits，8×8×8＝512 bins；Shannon −Σp log2 p，範圍 0–9 bits',
      dominantColorShare:'512 bins 中最大 bin count／sampledPixels；不是逐一 RGB 色碼的占比',
      luminance:'8-bit screenshot RGB 以 0.2126R+0.7152G+0.0722B 算 luma（未做 sRGB 線性化），mean 用原值；p05/p95 用四捨五入至 0–255 histogram 取 sorted index floor((N−1)×q)；contrast=p95−p05',
      edgeDensity:`只比較 crop 內相鄰水平／垂直完全不透明像素；abs(lumaA−lumaB)>${EDGE_THRESHOLD} 算 edge，edgeCount/edgePairs。自製 fallback，不是 Sobel 或官方 inspector`,
      clipping:'darkClipShare 為原始 luma<8、brightClipShare 為 luma>247 的比例',
      sampling:'分析 canvas viewport 交集內全部完全不透明像素；RGBA alpha<255 明確排除，不猜背景混色；不縮圖或挑選最佳 screenshot',
      crop:'PNG.width/viewport.width 作 CSS→pixel 比例；先與 viewport 相交，再 ceil 左上／floor 右下，只納入 canvas 範圍內像素',
    },summary,renderBudget:rows.map(row=>renderBudget(row,args.width)),screenshots:results,
  };
  const output=path.join(directory,'pixel-metrics.json');
  fs.writeFileSync(output,`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report));
  console.log(`CS 像素 advisory：${summary.totalPng} 張全部列入；MEASURED=${summary.measured}，NOT_MEASURED=${summary.notMeasured}，ERROR=${summary.errors}。不作 premium／PASS 結論。`);
  console.log(`JSON：${path.relative(ROOT,output).replaceAll('\\','/')}`);
  if(summary.errors>0)process.exitCode=1;
}catch(error){console.error(`CS 像素 audit 無法執行：${error.message}`);process.exitCode=1;}
