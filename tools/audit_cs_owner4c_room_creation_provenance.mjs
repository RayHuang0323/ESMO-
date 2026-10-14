import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {createMajorMapEnvironment,FPS_MAJOR_MAP_ART} from '../src/battle/fps/presentation/fpsMajorMapEnvironment.js';
import {FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls} from '../src/battle/fps/fpsMajorArchitecture.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),args={};
for(const arg of process.argv.slice(2)){const m=/^--(baseline|out)=(.+)$/.exec(arg);if(!m)throw Error('Explicit --baseline=<CPU report> --out=<new CS evidence file>');args[m[1]]=m[2];}
const evidenceRoot=path.resolve('review/cs-major-upgrade/evidence'),out=path.resolve(args.out||''),relative=path.relative(evidenceRoot,out);
if(!args.baseline||!args.out||!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(out))throw Error('Baseline and new evidence file required');
const baseline=JSON.parse(fs.readFileSync(args.baseline)),mapReport=baseline.rows.find(r=>r.mapKey==='mirage'&&r.variant==='combined-room-proposal')||baseline.rows.find(r=>r.mapKey==='mirage'),file='src/battle/fps/presentation/fpsMajorMapEnvironment.js',mainFile='src/battle/fps/EsportsFPS3D.jsx',original=fs.readFileSync(file,'utf8'),main=fs.readFileSync(mainFile,'utf8');
const baselineGuards=baseline.sources.map(row=>({file:row.file,baseline:row.sha256,current:hash(fs.readFileSync(row.file))}));for(const guard of baselineGuards)assert.equal(guard.current,guard.baseline,'Baseline source drift '+guard.file);
const start=main.indexOf('const MAPS={'),end=main.indexOf('// 選手 16 項素質',start),solidStart=main.indexOf('function centeredSolidObstacle('),solidEnd=main.indexOf('function simulateFps(',solidStart),maps=vm.runInNewContext(main.slice(start,end)+';MAPS',{FPS_MAJOR_MAP_ART,FPS_MAJOR_AUTHORED_ROOMS,majorRoomWalls}),solid=vm.runInNewContext(main.slice(solidStart,solidEnd)+';c5a2SolidObstacles'),map=maps.mirage,W={vx:x=>x-50,vz:y=>y-50,vy:h=>h*.92};
// Diagnostic module copy stamps geometry USER DATA ONLY, preserving every actual
// vertex/index/UV/color/material/collider. No product file or GPU is touched.
// BufferGeometry.clone() can share userData: assign a private object so stamping
// one Box clone cannot overwrite previously recorded Box creation provenance.
const stamp="geo.computeBoundingBox();geo.userData={...geo.userData,__owner4bOrigin:{type:geo.type,bounds:{min:geo.boundingBox.min.toArray(),max:geo.boundingBox.max.toArray()},stack:new Error().stack.split('\\n').filter(s=>s.includes('esmo_owner4b_geometry_trace.js')).map(s=>{const m=/esmo_owner4b_geometry_trace\\.js:(\\d+):(\\d+)/.exec(s);return{call:s.trim(),line:Number(m?.[1]),column:Number(m?.[2])};})}};";
let instrumented=original.replace(/list\.push\(geo\);/g,stamp+'list.push(geo);');
assert.ok(instrumented!==original,'Geometry push stamp marker missing');
const marker='const mixed=list.some(g=>g.index)&&list.some(g=>!g.index);',record="let __cursor=0;const __parts=list.map(g=>{const count=(g.index?.count??g.attributes.position.count)/3,start=__cursor;__cursor+=count;return{triangleStart:start,triangleEnd:__cursor,origin:g.userData.__owner4bOrigin??null};});";
assert.equal(instrumented.split(marker).length,2,'Unique flush marker required');instrumented=instrumented.replace(marker,record+marker);
const merged='const geo = mergeGeometries(compatible, false);';assert.equal(instrumented.split(merged).length,2);instrumented=instrumented.replace(merged,merged+'geo.userData.__owner4bParts=__parts;');
const base=path.dirname(path.resolve(file)),relocated=instrumented.replace(/from\s+["']([^"']+)["']/g,(_,s)=>'from '+JSON.stringify(s.startsWith('.')?pathToFileURL(path.resolve(base,s)).href:import.meta.resolve(s)));
const traced=await import('data:text/javascript;base64,'+Buffer.from(relocated+'\n//# sourceURL=esmo_owner4b_geometry_trace.js').toString('base64'));
const walls=solid(map),mapBefore=JSON.stringify(map),wallsBefore=JSON.stringify(walls),atlas=new THREE.Texture(),normalEnv=createMajorMapEnvironment({group:new THREE.Group(),mapKey:'mirage',map,obstacles:walls,W,atlasTexture:atlas,streets:[],terrain:true}),tracedEnv=traced.createMajorMapEnvironment({group:new THREE.Group(),mapKey:'mirage',map,obstacles:walls,W,atlasTexture:atlas,streets:[],terrain:true});
function geometryHash(geometry){const h=createHash('sha256');for(const name of Object.keys(geometry.attributes).sort()){h.update(name);h.update(Buffer.from(geometry.attributes[name].array.buffer));}if(geometry.index)h.update(Buffer.from(geometry.index.array.buffer));return h.digest('hex');}
const sourceLines=original.split(/\r?\n/),targets=[...new Set(mapReport.groups.flatMap(g=>g.samples.flatMap(s=>[s.a.mesh,s.b.mesh])).filter(name=>/^Room_/.test(name)))],rows=[];
try{
 for(const name of targets){const current=normalEnv.group.getObjectByName(name),object=tracedEnv.group.getObjectByName(name);assert.ok(current&&object,name+' absent');assert.equal(geometryHash(current.geometry),geometryHash(object.geometry),'Diagnostic stamping must preserve actual geometry '+name);const wanted=mapReport.groups.filter(g=>g.type.startsWith('COMPETING')&&g.samples.some(s=>s.a.mesh===name||s.b.mesh===name)),triangles=[...new Set(wanted.flatMap(g=>g.samples.flatMap(s=>[s.a,s.b].filter(t=>t.mesh===name).map(t=>t.triangle))))].sort((a,b)=>a-b);
  for(const triangle of triangles){const g=object.geometry,p=g.attributes.position,uv=g.attributes.uv,color=g.attributes.color,ids=[0,1,2].map(i=>g.index?g.index.getX(triangle*3+i):triangle*3+i),vertices=ids.map(i=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld).toArray()),ab=new THREE.Vector3(...vertices[1]).sub(new THREE.Vector3(...vertices[0])),ac=new THREE.Vector3(...vertices[2]).sub(new THREE.Vector3(...vertices[0])),normal=ab.cross(ac).normalize().toArray(),part=g.userData.__owner4bParts.find(t=>triangle>=t.triangleStart&&triangle<t.triangleEnd);
   rows.push({mesh:name,triangle,normal,vertices,uv:ids.map(i=>[uv.getX(i),uv.getY(i)]),paint:ids.map(i=>[color.getX(i),color.getY(i),color.getZ(i)]),part:{...part,origin:part?.origin?{...part.origin,stack:part.origin.stack.map(s=>({...s,source:sourceLines[s.line-1]?.trim()}))}:null},geometryAttributesIdentical:true,geometryHash:geometryHash(current.geometry),geometryAttributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,{itemSize:a.itemSize,count:a.count,type:a.array.constructor.name,normalized:a.normalized,sha256:hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))}]))});
  }
 }
 const sourceStable=hash(fs.readFileSync(file))===hash(Buffer.from(original));assert.ok(sourceStable,'Environment source changed during diagnostic');
 const report={schema:'cs-owner4c-room-window-creation-provenance.v1',baselineGuards,targets,source:{file,sha256:hash(Buffer.from(original))},baseline:{file:args.baseline,sha256:hash(fs.readFileSync(args.baseline))},mapWall6:map.walls[6],canonicalMapUnchanged:JSON.stringify(map)===mapBefore,canonicalObstaclesUnchanged:JSON.stringify(walls)===wallsBefore,rows,verdict:'CPU_CREATION_PROVENANCE_ONLY',browserRun:false,simulationRun:false,productChanged:false,limitation:'Source-userData tracing proves which geometry statements supplied exact triangles; it does not prove visible flicker or occlusion. Normal module and traced module geometry attributes are hash-identical.'};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:args.out,triangles:rows.length,geometryAttributesIdentical:rows.every(r=>r.geometryAttributesIdentical),canonicalMapUnchanged:report.canonicalMapUnchanged,canonicalObstaclesUnchanged:report.canonicalObstaclesUnchanged,verdict:report.verdict}));
}finally{normalEnv.dispose();tracedEnv.dispose();atlas.dispose();}
