// D 可重用唯讀DOM／原生互動probe；呼叫端負責真Battle前提與harness分類。
// 不建立sim、不patch frame、不清localStorage、不寫玩家資料。
import { HarnessError } from './harness.mjs';
import { seekFpsNativeTimeline } from './fpsNativeTimeline.mjs';

export function instrumentFpsDCallbacks(source) {
  // 僅隔離production probe transform使用；計數器放在真正callback呼叫前。
  // 不動guard、不改参数、不保留sim參照；marker非唯一就拒絕build。
  if(source.includes('__ESMO_CS_D_CALLBACK_PROBE__'))throw new Error('D callback probe不可重複instrument');
  const markers=[['completionCalls','onComplete(matchResult)'],['progressCalls','onProgress({']];
  let code=source;
  for(const [field,marker] of markers){
    if(code.split(marker).length!==2)throw new Error('D callback probe marker不是唯一：'+marker);
    const count=`if(typeof window!=="undefined"){const d=window.__ESMO_CS_D_CALLBACK_PROBE__||(window.__ESMO_CS_D_CALLBACK_PROBE__={completionCalls:0,progressCalls:0});d.${field}++;}`;
    code=code.replace(marker,count+marker);
  }
  return code;
}

export async function readFpsDLayout(chrome) {
  return chrome.evaluate(`
    const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(node).visibility!=='hidden';};
    const selectors=['[data-testid="cs-playback-controls"] button','[data-testid="cs-camera-presets"] button','[data-testid="cs-major-viewport-tools"] button','[data-testid="cs-major-viewport-tools"] summary','[data-testid="cs-exit-pov"]','[aria-label="關閉選手視角"]','[data-testid="leave-active-match"]','[data-testid="cs-replay-export"]','[data-testid="cs-replay-exit"]','.fps-major-replay-file','.fps-major-replay > summary'];
    const controls=[...new Set(selectors.flatMap(s=>[...document.querySelectorAll(s)]))].filter(visible).map(node=>({label:node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent.trim(),disabled:node.disabled===true,...rect(node)}));
    const canvas=document.querySelector('canvas'),radio=document.querySelector('[data-testid="cs-major-radio"]'),timeline=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]');
    const panels=[...document.querySelectorAll('[data-testid="cs-major-viewport-tools"],[data-testid="cs-pov-player-panel"],[data-testid="cs-major-player-panel"]')].filter(visible).map(rect);
    const canvasRect=canvas?rect(canvas):null;
    const intersects=r=>canvasRect&&r.top<canvasRect.bottom&&r.bottom>canvasRect.top&&r.left<canvasRect.right&&r.right>canvasRect.left;
    const clipped=[...document.querySelectorAll('[data-testid="cs-playback-controls"],[data-testid="cs-camera-presets"],[data-esmo-fps-team-roster]')].filter(visible).map(node=>({testId:node.dataset.testid||'team-roster',...rect(node),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth})).filter(r=>r.left < -1||r.right>innerWidth+1||r.scrollWidth>r.clientWidth+1);
    return{width:innerWidth,height:innerHeight,precondition:{canvas:!!canvasRect&&canvasRect.width>0&&canvasRect.height>0,timeline:!!timeline,radio:!!radio},documentOverflow:document.documentElement.scrollWidth>innerWidth+1,bodyOverflow:document.body.scrollWidth>innerWidth+1,clipped,controls,canvas:canvasRect,panels,panelsIntersectCanvas:panels.some(intersects),timeline:timeline?{value:Number(timeline.value),max:Number(timeline.max),ariaLabel:timeline.getAttribute('aria-label')}:null,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
  `);
}

export async function verifyFpsDLayout({chrome,ck,label='CS D'}) {
  const measured=await readFpsDLayout(chrome);
  const ready=Object.values(measured.precondition).every(Boolean);
  ck(`${label} 真Battle／range／radio前提`,ready,JSON.stringify(measured.precondition));
  if(!ready)return {status:'PRODUCT_PRECONDITION_FAIL',measured};
  ck(`${label} 文件與主要HUD無水平overflow`,!measured.documentOverflow&&!measured.bodyOverflow&&measured.clipped.length===0,JSON.stringify({width:measured.width,clipped:measured.clipped}));
  ck(`${label} 主要播放／鏡頭／離開觸控至少44px`,measured.controls.length>0&&measured.controls.every(control=>control.width>=44&&control.height>=44),JSON.stringify(measured.controls));
  ck(`${label} 通訊／選手panel在canvas外`,!measured.panelsIntersectCanvas,JSON.stringify({canvas:measured.canvas,panels:measured.panels}));
  ck(`${label} 真range有可讀標籤`,Boolean(measured.timeline.ariaLabel),JSON.stringify(measured.timeline));
  return {status:'MEASURED',measured};
}

export async function clickFpsDNative({chrome,sleep,selector}) {
  const {root}=await chrome.send('DOM.getDocument',{});
  const {nodeId}=await chrome.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  if(!nodeId)throw new HarnessError('原生UI互動找不到已驗前提的selector：'+selector);
  await chrome.send('DOM.scrollIntoViewIfNeeded',{nodeId});await sleep(100);
  let target;
  for(let attempt=0;attempt<30;attempt++){
    target=await chrome.evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,hit:Boolean(hit&&(hit===e||e.contains(hit))),hitLabel:hit?.textContent?.slice(0,80)||null};`);
    if(target?.hit)break;
    await sleep(100);
  }
  if(!target||target.width<=0||target.height<=0)throw new HarnessError('原生UI互動目標未可見：'+selector);
  if(!target.hit)throw new HarnessError('原生UI互動被遮擋或捲動未就緒：'+selector+' '+JSON.stringify(target));
  await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:1});
  await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:1});await sleep(150);
  return target;
}

export async function clickFpsFormalButtonByText({chrome,sleep,text,exact=true}) {
  // pristine formal flow可重用；只點既有可見button，不種玩家state。
  const candidates=await chrome.evaluate(`return [...document.querySelectorAll('button')].map((node,index)=>({index,text:node.textContent.replace(/\\s+/g,' ').trim(),disabled:node.disabled,visible:node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0}));`);
  const matching=candidates.filter(button=>button.visible&&!button.disabled&&(exact?button.text===text:button.text.includes(text)));
  if(matching.length!==1)throw new HarnessError('正式流程button文字匹配非唯一：'+text+'／'+matching.length);
  const {root}=await chrome.send('DOM.getDocument',{}),{nodeIds}=await chrome.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'button'});
  const nodeId=nodeIds[matching[0].index];if(!nodeId)throw new HarnessError('正式流程button DOM前提已變');
  await chrome.send('DOM.scrollIntoViewIfNeeded',{nodeId});await sleep(100);
  const point=await chrome.evaluate(`const e=document.querySelectorAll('button')[${matching[0].index}],r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent.replace(/\\s+/g,' ').trim()};`);
  if(point.text!==matching[0].text)throw new HarnessError('正式流程button文字在原生點擊前已變');
  for(const type of ['mousePressed','mouseReleased'])await chrome.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  await sleep(150);return matching[0].text;
}

export async function uploadFpsDNativeFile({chrome,selector,filePath}) {
  // DOM.setFileInputFiles使用原生file input；不偽造.files或dispatch假change。
  const {root}=await chrome.send('DOM.getDocument',{});
  const {nodeId}=await chrome.send('DOM.querySelector',{nodeId:root.nodeId,selector});
  if(!nodeId)throw new HarnessError('匯入前提缺少真file input：'+selector);
  const type=await chrome.evaluate(`return document.querySelector(${JSON.stringify(selector)})?.type;`);
  if(type!=='file')throw new HarnessError('指定selector不是原生file input');
  await chrome.send('DOM.setFileInputFiles',{nodeId,files:[filePath]});
}

export async function seekFpsDAndRead({chrome,sleep,index}) {
  const native=await seekFpsNativeTimeline({chrome,sleep,index});
  const ui=await chrome.evaluate(`
    const timeline=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]'),radio=document.querySelector('[data-testid="cs-major-radio"]');
    return {index:Number(timeline?.value),frameText:document.body.innerText.match(/\\d+\\/\\d+ 格/)?.[0]||null,timer:document.querySelector('[data-testid="cs-match-timer"]')?.textContent||null,radioLatest:radio?.querySelector('summary')?.textContent||null,radioRows:[...(radio?.querySelectorAll('li')||[])].map(node=>node.textContent),teams:[...(document.querySelector('[data-esmo-fps-team-roster]')?.children||[])].map(node=>({text:node.textContent,playerIds:[...node.querySelectorAll('[data-esmo-fps-player-card]')].map(card=>card.dataset.esmoFpsPlayerCard)}))};
  `);
  return {native,ui};
}

export async function readFpsDReplayCounters(chrome) {
  // 真production csLoadTiming保留純量紀錄；不可拿cache命中代替沒叫simulator。
  // Callback counters只在呼叫端production readonly transform明確植入後可測。
  return chrome.evaluate(`
    const entries=window.__ESMO_CS_LOAD_TIMING__?.entries;
    return {timingAvailable:Array.isArray(entries),simulationCalls:(entries||[]).filter(entry=>entry.name==='sim:simulateFps'||entry.name==='sim:worker-start'||entry.name==='sim:worker-fallback'||entry.name==='sim:reuse').length,completionCalls:window.__ESMO_CS_D_CALLBACK_PROBE__?.completionCalls??null,progressCalls:window.__ESMO_CS_D_CALLBACK_PROBE__?.progressCalls??null};
  `);
}
