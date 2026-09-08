import assert from 'node:assert/strict';
import {CAMPS,FOUNTAIN,WORLD_SIZE,dist} from '../src/gameData.js';
import {findPath,projectToWalkable,HERO_RADIUS} from '../src/battle/moba/nav/mobaNavigation.js';
const length=pts=>pts.slice(1).reduce((s,p,i)=>s+dist(p,pts[i]),0);
const routes=[];
for(const camp of CAMPS) {
 const home=FOUNTAIN[camp.side];
 const start=projectToWalkable(home.x,home.y,HERO_RADIUS);
 const end=projectToWalkable(camp.x,camp.y,HERO_RADIUS);
 const path=findPath(start,end,HERO_RADIUS);
 assert(path,`unreachable ${camp.id}`);
 assert(dist(end,camp)<1,`camp blocked ${camp.id}: projection ${dist(end,camp)}`);
 const back=findPath(end,start,HERO_RADIUS);assert(back,`return unreachable ${camp.id}`);
 routes.push({id:camp.id,side:camp.side,position:{x:camp.x,y:camp.y},length:length(path),returnLength:length(back)});
}
for(const blue of routes.filter(r=>r.side==='blue')) {
 const red=routes.find(r=>r.id===blue.id.replace('blue','red'));
 assert.equal(red.position.x,WORLD_SIZE-blue.position.x);
 assert.equal(red.position.y,WORLD_SIZE-blue.position.y);
 assert(Math.abs(red.length-blue.length)<1e-5,`asymmetric outward ${blue.id}`);
 assert(Math.abs(red.returnLength-blue.returnLength)<1e-5,`asymmetric return ${blue.id}`);
}
console.log(JSON.stringify(routes,null,2));
console.log('CAMP_ROUTES: 6 outward + 6 return reachable / 3 mirror pairs PASS');
