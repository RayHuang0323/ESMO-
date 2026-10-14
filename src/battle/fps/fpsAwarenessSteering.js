// Major-only public awareness. Public map + canonical LOS; no enemy collection,
// outcome, movement, Store or RNG. Deliberate intel/corner preaim stays intact.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
const delta=(a,b)=>(((b-a)%360+540)%360)-180;
const normalize=a=>((a%360)+360)%360;
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const idOffset=id=>[...String(id)].reduce((n,c)=>n+c.charCodeAt(0),0)%7;
export function fpsAwarenessLook({player,nodes,intel=[],roundSec,dtSec=.5,walls=[],lineBlocked}){
  const own=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3)
    .sort((a,b)=>(a.observerId===player.id?0:1)-(b.observerId===player.id?0:1)||distance(player.pos,a.pos)-distance(player.pos,b.pos));
  const next=player.route?.[player.routeIdx+1],following=player.route?.[player.routeIdx+2];
  let target=own[0]?.pos,source=own.length?'team-intel':'route',scan=0,corner=false,targetKey=null,publicFallback=false,reason=null;
  if(!target&&next){target=next;if(following&&distance(player.pos,next)<5&&Math.abs(delta(angle(player.pos,next),angle(next,following)))>30){target=following;corner=true;source='corner-preaim';}}
  const probeDistance=4,probeAt=bearing=>({x:player.pos.x+Math.cos(bearing*Math.PI/180)*probeDistance,y:player.pos.y+Math.sin(bearing*Math.PI/180)*probeDistance});
  const rayClear=bearing=>{const probe=probeAt(bearing);return typeof lineBlocked==='function'&&probe.x>=2&&probe.x<=98&&probe.y>=2&&probe.y<=98&&!lineBlocked(player.pos,probe,walls);};
  if(!target){
    publicFallback=true;
    if(typeof lineBlocked!=='function')return{va:normalize(Number(player.va)||0),desiredVa:Number(player.va)||0,source:'geometry-unavailable-hold',reason:'canonical-LOS-not-provided',corner:false,scanDegrees:0,turnDegrees:0,pace:1,targetKey:null};
    const site=nodes[`${player.deploymentSite}Site`],enemySpawn=nodes[player.side==='ct'?'tSpawn':'ctSpawn'];
    const preferred=finite(enemySpawn)?angle(player.pos,enemySpawn):Number(player.va)||0;
    const approach=Object.entries(nodes).filter(([key,p])=>finite(p)&&!key.endsWith('Spawn')&&distance(player.pos,p)>8&&distance(player.pos,p)<35&&(!site||distance(site,p)>5)&&!lineBlocked(player.pos,p,walls)&&rayClear(angle(player.pos,p)))
      .sort((a,b)=>(finite(enemySpawn)?distance(a[1],enemySpawn)-distance(b[1],enemySpawn):Math.abs(delta(player.va,angle(player.pos,a[1])))-Math.abs(delta(player.va,angle(player.pos,b[1]))))||a[0].localeCompare(b[0]))[0];
    if(approach){[targetKey,target]=approach;source='own-map-approach';reason='public-node-LOS-clear';}
    else{
      const local=[0,-45,45,-90,90,-135,135,180].map(offset=>({bearing:preferred+offset,offset})).filter(item=>rayClear(item.bearing));
      local.sort((a,b)=>Math.abs(delta(Number(player.va)||0,a.bearing))-Math.abs(delta(Number(player.va)||0,b.bearing))||Math.abs(a.offset)-Math.abs(b.offset)||a.offset-b.offset);
      if(local.length){target=probeAt(local[0].bearing);source='public-local-clear-ray';reason='no-visible-node-local-LOS-clear';}
      else return{va:normalize(Number(player.va)||0),desiredVa:Number(player.va)||0,source:'closed-space-hold',reason:'no-clear-public-node-or-local-ray',corner:false,scanDegrees:0,turnDegrees:0,pace:1,targetKey:null};
    }
  }
  if(!own.length&&!player.buyP){const duty=player.tacticalDuty;scan=Math.sin((roundSec+idOffset(player.id))*.9)*(duty?.defenseDuty==='information'||['control','pick'].includes(player.tacticalStage)?28:12);}
  const base=target?angle(player.pos,target):Number(player.va)||0;
  if(publicFallback&&!rayClear(base+scan)){scan=0;reason+=';scan-clipped-by-near-wall';}
  const desired=base+scan,maxTurn=(180+Math.max(0,Math.min(100,player.stats?.apm??70))*1.4)*Math.max(0,dtSec);
  const turn=Math.max(-maxTurn,Math.min(maxTurn,delta(Number(player.va)||0,desired)));
  return{va:normalize((Number(player.va)||0)+turn),desiredVa:desired,source,reason,targetKey,corner,scanDegrees:scan,turnDegrees:turn,pace:corner ? .58 : 1};
}

export function planFpsCoverPeek({player,nodes,walls,roundSec,blocked,navLineBlocked,lineBlocked,radius}){
  if(player.dead||player.blindSec>0||player.tacticalIntent?.aim||['save','retreat','trade'].includes(player.tacticalIntent?.kind)||player.hasBomb||roundSec<14||player.routeIdx<player.route.length-1)return null;
  if(player.side==='t'&&!['control','pick'].includes(player.tacticalStage))return null;
  if(roundSec-(player.lastPeekAtSec??-Infinity)<7+idOffset(player.id))return null;
  const cover={...player.pos};
  const nearby=walls.some(w=>distance(cover,{x:Math.max(w.x,Math.min(w.x+w.w,cover.x)),y:Math.max(w.y,Math.min(w.y+w.h,cover.y))})<2.5);
  if(!nearby)return null;
  const spawn=nodes[player.side==='ct'?'tSpawn':'ctSpawn'];
  const approaches=Object.entries(nodes).filter(([key,p])=>!key.endsWith('Spawn')&&distance(cover,p)>8&&distance(cover,p)<40&&lineBlocked(cover,p,walls))
    .sort((a,b)=>distance(a[1],spawn)-distance(b[1],spawn)||a[0].localeCompare(b[0]));
  const candidates=[];for(const [key,approach]of approaches.slice(0,4))for(const [dx,dy]of [[1.2,0],[-1.2,0],[0,1.2],[0,-1.2],[2.4,0],[-2.4,0],[0,2.4],[0,-2.4]]){
    const out={x:cover.x+dx,y:cover.y+dy};if(out.x<2||out.x>98||out.y<2||out.y>98||blocked(out,walls,radius)||navLineBlocked(cover,out,walls)||lineBlocked(out,approach,walls))continue;
    candidates.push({out,approach,key,distance:distance(cover,out)});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));const best=candidates[0];
  return best?{points:[cover,best.out,cover],lookAt:best.approach,source:'own-cover-and-public-map-approach',maxDistance:best.distance,approachKey:best.key}:null;
}
