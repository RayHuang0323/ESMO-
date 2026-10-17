// 真DOM布局與原生展開操作；不注入comms、frame、勝負或選手資料。
export async function verifyFpsMajorHudLayout({chrome,sleep,ck,map}) {
  const measure=()=>chrome.evaluate(`
    const canvas=document.querySelector('canvas'),tools=document.querySelector('[data-testid="cs-major-viewport-tools"]'),radio=document.querySelector('[data-testid="cs-major-radio"]'),panel=document.querySelector('[data-testid="cs-pov-player-panel"],[data-testid="cs-major-player-panel"]');
    if(!canvas||!tools||!radio)return null;
    const rect=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const c=rect(canvas),t=rect(tools),p=panel?rect(panel):null,intersects=r=>r.top<c.bottom&&r.bottom>c.top&&r.left<c.right&&r.right>c.left;
    return{canvas:c,tools:t,panel:p,toolsIntersects:intersects(t),panelIntersects:p?intersects(p):false,open:radio.open,messages:radio.querySelectorAll('li').length,controls:[...tools.querySelectorAll('button,summary')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
  `);
  const initial=await measure();
  ck(`${map} Major通訊及鏡頭工具在戰場外、44px且不溢出`,initial&&!initial.toolsIntersects&&!initial.panelIntersects&&!initial.overflow&&initial.controls.every(r=>r.width>=44&&r.height>=44),JSON.stringify(initial));
  const {root}=await chrome.send('DOM.getDocument',{});
  const {nodeId}=await chrome.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-testid="cs-major-radio"] summary'});
  if(!nodeId)throw Error('缺實際通訊展開控制');
  const click=async()=>{
    await chrome.send('DOM.scrollIntoViewIfNeeded',{nodeId});
    const p=await chrome.evaluate(`const r=document.querySelector('[data-testid="cs-major-radio"] summary').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};`);
    await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await sleep(100);
  };
  if(!initial?.open)await click();
  const expanded=await measure();
  ck(`${map} 通訊原生展開仍在戰場外、不擋準星`,expanded?.open===true&&!expanded.toolsIntersects&&!expanded.panelIntersects&&!expanded.overflow,JSON.stringify(expanded));
  if(!initial?.open)await click();
  return{initial,expanded};
}
