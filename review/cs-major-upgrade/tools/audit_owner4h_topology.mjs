import fs from 'node:fs';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
import {majorRoomPassage} from '../../../src/battle/fps/fpsMajorArchitecture.js';
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const rows=[];
for(const map of ['mirage','dust2','inferno']){
 const walls=api.c5a2SolidObstacles(api.MAPS[map]);
 for(const room of api.MAPS[map].rooms.filter(r=>r.authored)){
  // Exterior probe must itself be walkable: an arbitrary 3.25m extension can
  // land inside an adjacent solid boundary/building, invalidating the setup.
  const choices=[.9,1.5,2.2,3.25].flatMap(pad=>[0,-.38,.38].map(offset=>majorRoomPassage(room,pad).map((p,i)=>i===1?p:room.entryAxis==='y'?{x:p.x+offset,y:p.y}:{x:p.x,y:p.y+offset})));
  const points=[choices.find(p=>!api.blocked(p[0],walls,api.PLAYER_R+.65))?.[0],choices[0][1],choices.find(p=>!api.blocked(p[2],walls,api.PLAYER_R+.65))?.[2]];
  if(points.some(p=>!p))throw Error('No valid exterior scenario: '+map+'/'+room.id);
  const route=api.buildNavigableRoute(points,walls,api.PLAYER_R,new Map());
  const inside=p=>p.x>room.x+.8&&p.x<room.x+room.w-.8&&p.y>room.y+.8&&p.y<room.y+room.h-.8;
  const samples=[];for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.2);for(let j=0;j<=n;j++)samples.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});}
  const blocked=samples.filter(p=>api.blocked(p,walls,api.PLAYER_R));
  const connections=[];for(const side of ['t','ct'])for(const portal of [points[0],points[2]]){const path=api.buildNavigableRoute([api.MAPS[map].spawns[side],portal],walls,api.PLAYER_R,new Map());connections.push({side,portal,path,endpointDelta:Math.hypot(path.at(-1).x-portal.x,path.at(-1).y-portal.y)});}
  rows.push({map,room:room.id,doorWidth:room.doorWidth,points,route,connections,insideSamples:samples.filter(inside).length,blockedSamples:blocked.length,endpointDelta:Math.hypot(route.at(-1).x-points.at(-1).x,route.at(-1).y-points.at(-1).y),pass:blocked.length===0&&samples.some(inside)&&Math.hypot(route.at(-1).x-points.at(-1).x,route.at(-1).y-points.at(-1).y)<.25&&connections.every(c=>c.endpointDelta<.25)});
 }
 for(const room of api.MAPS[map].rooms.filter(r=>!r.authored)){
  const center={x:room.x+room.w/2,y:room.y+room.h/2},connections=[];
  for(const side of ['t','ct']){const route=api.buildNavigableRoute([api.MAPS[map].spawns[side],center],walls,api.PLAYER_R,new Map());let blockedSamples=0;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.2);for(let j=0;j<=n;j++)if(api.blocked({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n},walls,api.PLAYER_R))blockedSamples++;}connections.push({side,route,blockedSamples,endpointDelta:Math.hypot(route.at(-1).x-center.x,route.at(-1).y-center.y)});}
  rows.push({map,room:room.label,authored:false,center,connections,pass:!api.blocked(center,walls,api.PLAYER_R)&&connections.every(c=>c.endpointDelta<.25&&c.blockedSamples===0)});
 }
}
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Unique report required');fs.writeFileSync(out,JSON.stringify({rows,pass:rows.filter(r=>r.pass).length,fail:rows.filter(r=>!r.pass).length},null,2),{flag:'wx'});for(const r of rows)console.log(JSON.stringify(r));process.exitCode=rows.some(r=>!r.pass)?1:0;
