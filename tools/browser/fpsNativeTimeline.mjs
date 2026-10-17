import { HarnessError } from './harness.mjs';

export async function seekFpsNativeTimeline({chrome,sleep,index}) {
  await chrome.evaluate(`const e=document.querySelector('input[type="range"]');if(!e)throw new Error('缺少真時間軸');e.scrollIntoView({block:'center',behavior:'instant'});return true;`);
  // 先讓scroll完成，再量DOMRect；原先同一evaluate內scroll＋量測會使用舊位置。
  await sleep(250);
  const slider=await chrome.evaluate(`const e=document.querySelector('input[type="range"]'),r=e.getBoundingClientRect(),max=Number(e.max);return{x:r.x+7+(r.width-14)*${index}/max,y:r.y+r.height/2,max};`);
  if(!slider||index<0||index>slider.max)throw new HarnessError('真時間軸目標越界');
  await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:slider.x,y:slider.y,button:'left',buttons:1,clickCount:1});
  await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:slider.x,y:slider.y,button:'left',buttons:0,clickCount:1});await sleep(150);
  let cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]').value);`);
  const nativeDragCursor=cursor;
  if(!Number.isFinite(cursor))throw new HarnessError('真時間軸值不合法');
  await chrome.evaluate(`document.querySelector('input[type="range"]').focus();return true;`);
  const keyEvent=async(key,code)=>{for(const type of ['keyDown','keyUp'])await chrome.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code});};
  // 真PageUp／PageDown縮短大跨度鍵盤修正，不改input.value、不派假change。
  for(let n=0;n<12&&Math.abs(cursor-index)>slider.max*.1;n++){
    const prior=cursor,key=cursor<index?'PageUp':'PageDown';await keyEvent(key,key==='PageUp'?33:34);
    cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]').value);`);
    if(cursor===prior)break;
  }
  for(let n=0;n<2500&&cursor!==index;n++){
    const prior=cursor,key=cursor<index?'ArrowRight':'ArrowLeft';await keyEvent(key,key==='ArrowRight'?39:37);
    cursor=await chrome.evaluate(`return Number(document.querySelector('input[type="range"]').value);`);
    if(cursor===prior)throw new HarnessError('真時間軸原生鍵盤沒有前進');
  }
  if(cursor!==index)throw new HarnessError('真時間軸未到精確保存frame：'+JSON.stringify({index,cursor,nativeDragCursor}));
  return {cursor,nativeDragCursor,nativeInteraction:'settled-track-click-and-native-keys'};
}
