// 只依呈現中的角色與已安裝炸彈計算取景；不改模擬或保存的frame。
// 手動滾輪／雙指可近看腕部；預設14/18m觀戰與2.7m全身取景保持。
export function fpsChaseMinimumRadius(sceneVersion){return sceneVersion==="legacy"?4.5:1.2;}
export function fpsChaseForwardOffset({sceneVersion,manualRadius=null,close=false}){
  const base=close?2.5:3;
  if(sceneVersion==="legacy"||!Number.isFinite(manualRadius))return base;
  // Near manual orbit is a character shot, not a camera looking metres ahead
  // of the operator. Default spectator distance retains its tactical context.
  return base*Math.max(0,Math.min(1,(manualRadius-2.7)/(14-2.7)));
}
export function fitFpsCombatCamera({points,focus,objective=null,targetY=3,aspect=1,theta=-.76,phi=.86,fov=42}){
  const actors=(points||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  const anchors=objective&&Number.isFinite(objective.x)&&Number.isFinite(objective.z)?[...actors,objective]:actors;
  if(!anchors.length)return {target:{x:focus?.x||0,y:targetY,z:focus?.z||0},radius:82,actorCount:0};
  const xs=anchors.map(p=>p.x),zs=anchors.map(p=>p.z);
  const centerX=(Math.min(...xs)+Math.max(...xs))/2,centerZ=(Math.min(...zs)+Math.max(...zs))/2;
  // 真實交戰群的中心佔主要權重，避免一個邊界事件把半幅畫面推到海上。
  const target={x:centerX*.8+(Number.isFinite(focus?.x)?focus.x:centerX)*.2,y:targetY,z:centerZ*.8+(Number.isFinite(focus?.z)?focus.z:centerZ)*.2};
  const sinT=Math.sin(theta),cosT=Math.cos(theta),sinP=Math.sin(phi),cosP=Math.cos(phi);
  const tanV=Math.tan(fov*Math.PI/360),tanH=tanV*Math.max(.25,aspect);
  let radius=34;
  // 納入角色腳／頭及四周4m戰術空間；依真實透視深度解距離，不套固定大半徑。
  for(const p of anchors)for(const dx of [-4,4])for(const dz of [-4,4])for(const height of [0,2.5]){
    const x=p.x+dx-target.x,y=(p.elevation||0)+height-target.y,z=p.z+dz-target.z;
    const right=x*cosT-z*sinT,up=-x*cosP*sinT+y*sinP-z*cosP*cosT;
    const depth=x*sinP*sinT+y*cosP+z*sinP*cosT;
    radius=Math.max(radius,depth+Math.abs(right)/(tanH*.82),depth+Math.abs(up)/(tanV*.78));
  }
  return {target,radius:radius+2,actorCount:actors.length};
}
