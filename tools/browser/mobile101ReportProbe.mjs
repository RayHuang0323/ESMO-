import {clickFpsDNative} from './fpsReplayUiProbe.mjs';
// Real formal Result first. DOM-only stress labels/numeric token are applied
// afterwards and explicitly recorded; they never enter Simulation or history.
export async function probeMobile101Report({chrome,check,sleep,capture}){
 const native=selector=>clickFpsDNative({chrome,sleep,selector}),rows=[];
 for(const stress of [false,true])for(const [width,height] of [[320,740],[360,800],[390,844],[430,932],[384,854],[412,915],[740,320],[800,360],[844,390],[932,430]]){
  await chrome.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await chrome.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await sleep(100);
  for(const tab of ['overview','team','player','round']){
   await native(`[data-testid="cs-report-tab-${tab}"]`);await sleep(100);
   await chrome.evaluate(`for(const m of document.querySelectorAll('.cs-report-metric'))if(!m.dataset.metricKind){const label=m.querySelector('small')?.textContent;m.dataset.metricKind=label==='本隊 MVP'?'name':label==='K / D / A'?'kda':'number';}return true;`);
   if(stress)await chrome.evaluate(`const r=document.querySelector('.cs-pro-report'),long='超長電競選手名稱_LongProfessionalPlayerName_0123456789';
    for(const e of r.querySelectorAll('.cs-report-score strong,.cs-report-legend span,.cs-report-panel h2,.cs-report-panel h3,.cs-report-filters button,td:first-child button,.cs-report-metric[data-metric-kind=name] strong')){
     const n=[...e.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(n)n.textContent=long;}
    for(const e of r.querySelectorAll('select option'))e.textContent=long;
    const k=r.querySelector('[data-metric-kind=kda] strong');if(k)k.textContent='10 / 11 / 4';return true;`);
   const layout=await chrome.evaluate(`const r=document.querySelector('.cs-pro-report'),atomic=[...r.querySelectorAll('.cs-report-metric:not([data-metric-kind=name]) strong')].map(e=>{const t=document.createRange();t.selectNodeContents(e);return{text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,lines:[...t.getClientRects()].filter(x=>x.width>0).map(x=>({top:x.top,height:x.height})),font:getComputedStyle(e).fontSize};}),badAtomic=atomic.filter(e=>e.scroll>e.width+1||new Set(e.lines.map(x=>Math.round(x.top))).size>1),badBoxes=[...r.querySelectorAll('.cs-report-panel,.cs-report-kpis,.cs-report-metric,svg,.cs-report-legend,select')].filter(e=>{const b=e.getBoundingClientRect();return b.width>innerWidth+1||b.left< -1||b.right>innerWidth+1;}).map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className}));return{width:innerWidth,height:innerHeight,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,atomic,badAtomic,badBoxes,kda:r.querySelector('[data-metric-kind=kda] strong')?.textContent,tabButtons:[...r.querySelectorAll('nav button')].map(e=>({h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width})),badSvg:[...r.querySelectorAll('svg')].some(e=>/NaN|Infinity/.test(e.outerHTML))};`);
   rows.push({stress,tab,...layout});check(`Mobile101 ${width}x${height}/${tab}/${stress?'layout-stress':'actual-result'} atomic values and contained layout`,!layout.bodyOverflow&&!layout.badAtomic.length&&!layout.badBoxes.length&&!layout.badSvg&&layout.tabButtons.every(b=>b.h>=44),layout);
   if(stress&&tab==='player')check(`${width}x${height} Owner Android KDA token stays single line`,layout.kda==='10 / 11 / 4'&&!layout.badAtomic.length,{kda:layout.kda,atomic:layout.atomic});
   if([320,390,430].includes(width)&&height>width)await capture(`mobile101-${width}-${tab}-${stress?'stress':'actual'}`);
  }
 }
 // Exercise the actual horizontally scrollable table with native touch input.
 await chrome.send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});await native('[data-testid="cs-report-tab-overview"]');
 const touch=await chrome.evaluate(`const e=document.querySelector('.cs-report-table-scroll');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return{x:b.left+b.width*.8,y:Math.min(innerHeight-25,Math.max(25,b.top+35)),before:e.scrollLeft,range:e.scrollWidth-e.clientWidth};`);
 await chrome.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});
 for(let i=1;i<=8;i++){await chrome.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x-i*20,y:touch.y}]});await sleep(25);}
 await chrome.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(300);
 const after=await chrome.evaluate("return document.querySelector('.cs-report-table-scroll').scrollLeft;");check('Mobile101 table can reveal rightmost statistics with native horizontal touch',touch.range>0&&after>touch.before+30,{...touch,after});
 return{schema:'mobile101-report-layout.v1',realAndroid:'NOT_RUN',ownerAndroidIssue:'KDA 10 / 11 / 4 wrap',stress:'DOM-only labels and Owner numeric token; actual data checked by formal report probe first',rows};
}
