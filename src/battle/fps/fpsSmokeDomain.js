import {FPS_DUNE_TERMINAL} from './fpsDuneTerminal.js';
import {FPS_CONFLUENCE_STATION} from './fpsConfluenceStation.js';
import {FPS_FOUNDRY_CIRCUIT} from './fpsFoundryCircuit.js';
import {fpsSolidObstacles} from './fpsSolidObstacles.js';
import {fpsMajorElevation} from './fpsMajorTerrain.js';

// 靜態可達區域，不是流體模擬。原牆面座標成為格線，薄牆不會被格子吞掉；
// 只讓相通的空氣格連通。相同分片線性場同時服務AI、POV及可見等值面。
export const FPS_SMOKE_DOMAIN_VERSION='solid.v1';
export const FPS_SMOKE_DOMAIN_RADIUS=6;
const STEP=.8,SKIN=.02,FAR=1e4,cache=new Map(),worlds=new Map();
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export function fpsSmokeEnvelope(radius){return{center:Math.min(1.56,.2+radius*.23),height:Math.min(3.3,.55+radius*.46)};}
export function fpsSmokeSpace(sceneVersion){return sceneVersion==='major.v5'?'foundry':sceneVersion==='major.v4'?'dune':sceneVersion==='major.v3'?'confluence':null;}

export function smokeBoxHit(a,b,box,padding=0){
 let enter=0,exit=1,axis=-1,sign=0;
 for(let k=0;k<3;k++){
  const delta=b[k]-a[k],lo=box.min[k]-padding,hi=box.max[k]+padding;
  if(Math.abs(delta)<1e-10){if(a[k]<=lo||a[k]>=hi)return null;continue;}
  const p=(lo-a[k])/delta,q=(hi-a[k])/delta,t=Math.min(p,q);
  if(t>enter){enter=t;axis=k;sign=delta>0?-1:1;}exit=Math.min(exit,Math.max(p,q));
 }
 if(enter>exit-1e-10||exit<=1e-8||enter>=1-1e-8)return null;
 const normal=[0,0,0];if(axis>=0)normal[axis]=sign;
 return{t:Math.max(0,enter),normal,box};
}
export function fpsSmokeWorld(space){
 if(worlds.has(space))return worlds.get(space);
 const map=space==='foundry'?FPS_FOUNDRY_CIRCUIT:space==='dune'?FPS_DUNE_TERMINAL:space==='confluence'?FPS_CONFLUENCE_STATION:null;if(!map)return null;
 const mapKey=space==='foundry'?'inferno':space==='dune'?'dust2':'mirage',sceneVersion=space==='foundry'?'major.v5':space==='dune'?'major.v4':'major.v3';
 const ground=p=>fpsMajorElevation(mapKey,p,sceneVersion),walls=fpsSolidObstacles(map);
 const boxes=walls.map((w,index)=>({id:index,min:[w.x-SKIN,-8,w.y-SKIN],max:[w.x+w.w+SKIN,ground({x:w.x+w.w/2,y:w.y+w.h/2})+(w.hgt??7)+SKIN,w.y+w.h+SKIN]}));
 // 低檢修廊的弧頂也阻隔氣體；高工房不在煙團高度內。Dune兩翼採光口不封死。
 const roofs=(map.rooms||[]).filter(r=>space==='foundry'?r.smokeRoof!==false:space!=='dune'||r.id==='dune-customs').map(r=>({room:r,height(x,z){
  const u=Math.max(0,Math.min(1,(x-r.x)/r.w));let rise=0;
  if(r.roof==='vault')rise=2.6*Math.sin(u*Math.PI);
  else if(r.roof==='shed')rise=2.2*(1-u);
  else if(r.roof==='clerestory')rise=1.4*(1-Math.abs(u*2-1));
  return r.height*(space==='confluence'?.92:1)+ground({x,y:z})+rise;
 }}));
 const world={space,mapKey,sceneVersion,map,walls,boxes,roofs,ground};worlds.set(space,world);return world;
}

function roofContains(world,p,pad=.08){return world.roofs.some(({room:r,height})=>p[0]>r.x&&p[0]<r.x+r.w&&p[2]>r.y&&p[2]<r.y+r.h&&p[1]>=height(p[0],p[2])-pad&&p[1]<=height(p[0],p[2])+.35+pad);}
export function smokeWorldHit(world,a,b,radius=.04){
 let first=null;
 for(const box of world.boxes){const h=smokeBoxHit(a,b,box,radius);if(h&&(!first||h.t<first.t))first=h;}
 const distance=Math.hypot(...b.map((v,k)=>v-a[k])),steps=Math.max(1,Math.ceil(distance/.08));
 for(let i=1;i<=steps;i++){
  const t=i/steps;if(first&&t>first.t)break;const p=a.map((v,k)=>v+(b[k]-v)*t);
  if(roofContains(world,p,radius)||p[1]<world.ground({x:p[0],y:p[2]})+radius){
   let lo=(i-1)/steps,hi=t;for(let n=0;n<12;n++){const m=(lo+hi)/2,q=a.map((v,k)=>v+(b[k]-v)*m);if(roofContains(world,q,radius)||q[1]<world.ground({x:q[0],y:q[2]})+radius)hi=m;else lo=m;}
   const q=a.map((v,k)=>v+(b[k]-v)*lo);first={t:lo,normal:[0,b[1]>a[1]?-1:1,0],surfaceY:q[1]-radius};break;
  }
 }
 return first;
}

const axis=(lo,hi,extra=[])=>{const a=[lo,hi,...extra.filter(v=>v>lo+1e-5&&v<hi-1e-5)];for(let v=lo+STEP;v<hi;v+=STEP)a.push(v);a.sort((a,b)=>a-b);return a.filter((v,i)=>!i||v-a[i-1]>1e-5);};
function locate(a,v){if(v<a[0]||v>a.at(-1))return-1;let lo=0,hi=a.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(v<a[m])hi=m;else lo=m;}return Math.min(lo,a.length-2);}
function arrival(p,origin,base){
 const horizontal=Math.hypot(p[0]-origin.x,p[2]-origin.y);if(horizontal>9)return FAR;
 // R>6僅延伸標量場供邊界內插，正式煙團半徑仍嚴格封頂6。
 const inside=r=>{const s=r<=6?fpsSmokeEnvelope(r):{center:1.56+(r-6)*.23,height:3.3+(r-6)*.46};return horizontal*horizontal/(r*r||1e-15)+(p[1]-base-s.center)**2/(s.height*s.height)<=1;};
 if(!inside(9))return FAR;let lo=0,hi=9;for(let i=0;i<16;i++){const m=(lo+hi)/2;if(inside(m))hi=m;else lo=m;}return hi;
}
function push(heap,item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<item[0]||heap[p][0]===item[0]&&heap[p][1]<=item[1])break;heap[i]=heap[p];i=p;}heap[i]=item;}
function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let n=i*2+1;if(n+1<heap.length&&(heap[n+1][0]<heap[n][0]||heap[n+1][0]===heap[n][0]&&heap[n+1][1]<heap[n][1]))n++;if(heap[n][0]>last[0]||heap[n][0]===last[0]&&heap[n][1]>=last[1])break;heap[i]=heap[n];i=n;}heap[i]=last;}return first;}

export function createSmokeField({world,origin,baseHeight=world.ground(origin)}){
 const started=typeof performance!=='undefined'?performance.now():0,local=world.boxes.filter(b=>b.min[0]<origin.x+6.1&&b.max[0]>origin.x-6.1&&b.min[2]<origin.y+6.1&&b.max[2]>origin.y-6.1);
 const x=axis(origin.x-6.1,origin.x+6.1,[origin.x,...local.flatMap(b=>[b.min[0],b.max[0]])]),z=axis(origin.y-6.1,origin.y+6.1,[origin.y,...local.flatMap(b=>[b.min[2],b.max[2]])]);
 const floors=x.flatMap(a=>z.map(b=>world.ground({x:a,y:b}))),minFloor=Math.min(...floors,baseHeight),y=axis(minFloor-.1,baseHeight+5.05,[baseHeight,baseHeight+.2,...local.flatMap(b=>[b.min[1],b.max[1]])]);
 const nx=x.length-1,ny=y.length-1,nz=z.length-1,n=nx*ny*nz;if(n>45000)throw Error('煙霧區域格超過固定預算');
 const cells=new Uint8Array(n),distance=new Float64Array(n).fill(FAR),required=new Float64Array(n),centers=new Float64Array(n*3),heap=[];
 const index=(i,j,k)=>(j*nz+k)*nx+i,unpack=v=>[v%nx,Math.floor(v/(nx*nz)),Math.floor(v/nx)%nz],point=v=>[centers[v*3],centers[v*3+1],centers[v*3+2]],emitter=[origin.x,baseHeight+.2,origin.y];
 const maxFloor=Math.max(...floors),roofs=world.roofs.filter(({room:r})=>r.x<origin.x+6.1&&r.x+r.w>origin.x-6.1&&r.y<origin.y+6.1&&r.y+r.h>origin.y-6.1&&r.height*(world.space==='confluence'?.92:1)+minFloor-.12<y.at(-1));
 const clear=(a,b)=>{
  if(local.some(box=>smokeBoxHit(a,b,box)))return false;
  if(!roofs.length&&Math.min(a[1],b[1])>=maxFloor)return true;
  const steps=Math.ceil(Math.hypot(...b.map((v,k)=>v-a[k]))/.3);
  for(let i=1;i<steps;i++){const t=i/steps,p=a.map((v,k)=>v+(b[k]-v)*t);if(p[1]<maxFloor&&p[1]<world.ground({x:p[0],y:p[2]})||roofs.length&&roofContains({roofs},p,.1))return false;}
  return true;
 };
 for(let k=0;k<nz;k++)for(let i=0;i<nx;i++){
  const cx=(x[i]+x[i+1])/2,cz=(z[k]+z[k+1])/2,floor=Math.max(floors[i*z.length+k],floors[(i+1)*z.length+k],floors[i*z.length+k+1],floors[(i+1)*z.length+k+1]);
  const vertical=local.filter(b=>cx>b.min[0]&&cx<b.max[0]&&cz>b.min[2]&&cz<b.max[2]).map(b=>[b.min[1],b.max[1]]);
  for(const roof of roofs){const r=roof.room;if(x[i+1]<=r.x||x[i]>=r.x+r.w||z[k+1]<=r.y||z[k]>=r.y+r.h)continue;const values=[roof.height(x[i],z[k]),roof.height(x[i+1],z[k]),roof.height(x[i],z[k+1]),roof.height(x[i+1],z[k+1]),roof.height(cx,cz)];vertical.push([Math.min(...values)-.12,Math.max(...values)+.4]);}
  for(let j=0;j<ny;j++){
   const v=index(i,j,k),cy=(y[j]+y[j+1])/2,p=[cx,cy,cz];centers.set(p,v*3);cells[v]=Number(y[j]<floor-1e-5||vertical.some(([lo,hi])=>y[j]<hi-1e-7&&y[j+1]>lo+1e-7));required[v]=arrival(p,origin,baseHeight);
   if(!cells[v]&&required[v]<FAR&&clear(emitter,p)){distance[v]=required[v];push(heap,[distance[v],v]);}
  }
 }
 const offsets=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1]];
 while(heap.length){const[d,v]=pop(heap);if(d!==distance[v])continue;const[i,j,k]=unpack(v),a=point(v);
  for(const[di,dj,dk]of offsets){const u=i+di,w=j+dj,t=k+dk;if(u<0||u>=nx||w<0||w>=ny||t<0||t>=nz)continue;const q=index(u,w,t);if(cells[q]||required[q]>=FAR)continue;const b=point(q),next=Math.max(required[q],d+Math.hypot(b[0]-a[0],b[2]-a[2]));if(next<distance[q]&&next<=7.5&&clear(a,b)){distance[q]=next;push(heap,[next,q]);}}
 }
 const vx=x.length,vy=y.length,vz=z.length,vertices=new Float64Array(vx*vy*vz*3),values=new Float64Array(vx*vy*vz).fill(FAR),vi=(i,j,k)=>(j*vz+k)*vx+i;
 for(let j=0;j<vy;j++)for(let k=0;k<vz;k++)for(let i=0;i<vx;i++){
  const v=vi(i,j,k),p=[x[i],y[j],z[k]];vertices.set(p,v*3);let d=FAR;
  for(const a of [i-1,i])for(const b of [j-1,j])for(const c of [k-1,k]){if(a<0||a>=nx||b<0||b>=ny||c<0||c>=nz)continue;const u=index(a,b,c);if(cells[u]||distance[u]>=FAR)continue;d=Math.min(d,distance[u]+Math.hypot(p[0]-centers[u*3],p[2]-centers[u*3+2]));}
  if(d<FAR){if(clear(emitter,p))d=Math.min(d,arrival(p,origin,baseHeight));values[v]=Math.max(d,arrival(p,origin,baseHeight));}
 }
 const field={world,origin:{...origin},baseHeight,x,y,z,nx,ny,nz,cells,distance,vertices,values,index,vertexIndex:vi,cellCount:n,buildMs:(typeof performance!=='undefined'?performance.now():0)-started};
 field.sample=p=>sampleField(field,p);return field;
}

export function getSmokeField(smoke){
 if(smoke?.occlusion!==FPS_SMOKE_DOMAIN_VERSION||!finite(smoke.pos))return null;const world=fpsSmokeWorld(smoke.space);if(!world)return null;
 const baseHeight=Number.isFinite(smoke.baseHeight)?smoke.baseHeight:world.ground(smoke.pos),key=smoke.space+':'+smoke.pos.x+':'+smoke.pos.y+':'+baseHeight;
 let field=cache.get(key);if(field){cache.delete(key);cache.set(key,field);return field;}field=createSmokeField({world,origin:smoke.pos,baseHeight});cache.set(key,field);while(cache.size>16)cache.delete(cache.keys().next().value);return field;
}
export function smokeFieldCell(field,p){const i=locate(field.x,p[0]),j=locate(field.y,p[1]),k=locate(field.z,p[2]);return i<0||j<0||k<0?null:[i,j,k];}
function sampleField(field,p){
 const c=smokeFieldCell(field,p);if(!c)return FAR;const[i,j,k]=c,v=field.index(i,j,k);if(field.cells[v]||field.distance[v]>=FAR)return FAR;
 const axes=[field.x,field.y,field.z],coords=[i,j,k],fractions=p.map((a,q)=>(a-axes[q][coords[q]])/(axes[q][coords[q]+1]-axes[q][coords[q]])),order=[0,1,2].sort((a,b)=>fractions[b]-fractions[a]);
 let at=[i,j,k],sum=field.values[field.vertexIndex(...at)]*(1-fractions[order[0]]);
 for(let a=0;a<3;a++){at[order[a]]++;sum+=field.values[field.vertexIndex(...at)]*(fractions[order[a]]-(a<2?fractions[order[a+1]]:0));}return sum;
}
export function smokeFieldContains(field,point,radius){const height=Number.isFinite(point.height)?point.height:field.world.ground(point)+1.45;return radius>0&&field.sample([point.x,height,point.y])<radius-1e-7;}
export function smokeFieldBlocks(field,a,b,radius){
 if(!(radius>0))return false;const ah=Number.isFinite(a.height)?a.height:field.world.ground(a)+1.45,bh=Number.isFinite(b.height)?b.height:field.world.ground(b)+1.45,from=[a.x,ah,a.y],to=[b.x,bh,b.y],delta=to.map((v,i)=>v-from[i]);
 const cuts=[0,1];for(const[q,axis]of [field.x,field.y,field.z].entries())if(Math.abs(delta[q])>1e-12)for(const p of axis){const t=(p-from[q])/delta[q];if(t>0&&t<1)cuts.push(t);}cuts.sort((a,b)=>a-b);
 const p=t=>from.map((v,q)=>v+delta[q]*t);for(let n=1;n<cuts.length;n++){
  const lo=cuts[n-1],hi=cuts[n];if(hi-lo<1e-10)continue;const c=smokeFieldCell(field,p((lo+hi)/2));if(!c||field.cells[field.index(...c)]||field.distance[field.index(...c)]>=FAR)continue;
  const local=[lo+1e-9,hi-1e-9],axes=[field.x,field.y,field.z],fraction=q=>[(from[q]-axes[q][c[q]])/(axes[q][c[q]+1]-axes[q][c[q]]),delta[q]/(axes[q][c[q]+1]-axes[q][c[q]])];
  for(const [a,b]of [[0,1],[0,2],[1,2]]){const u=fraction(a),v=fraction(b),den=u[1]-v[1];if(Math.abs(den)<1e-12)continue;const t=(v[0]-u[0])/den;if(t>lo&&t<hi)local.push(t);}
  if(local.some(t=>field.sample(p(t))<radius-1e-7))return true;
 }return false;
}
