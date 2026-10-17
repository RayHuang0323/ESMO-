// Offline derivative of the existing original cloth bake; no runtime simplifier.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {FPS_DRAPED_SLEEVE_DATA as source} from '../src/battle/fps/presentation/fpsDrapedSleeveData.js';
// This installed addon references THREE.Color without importing Color.
// Supply its namespace only in this offline tool, never in the product.
globalThis.THREE=THREE;
const positions=[],normals=[],colors=[];
for(const i of source.triangles){positions.push(...source.positions.slice(i*3,i*3+3));normals.push(...source.normals.slice(i*3,i*3+3));const color=new THREE.Color(source.positions[i*3+1]>.157?0x59675d:0xe2e4de).multiplyScalar(.25+.75*source.ao[i]);colors.push(color.r,color.g,color.b);}
const raw=new THREE.BufferGeometry();
for(const [key,array,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',source.uvs,2]])raw.setAttribute(key,new THREE.Float32BufferAttribute(array,size));
const merged=mergeVertices(raw),lod=new SimplifyModifier().modify(raw,merged.attributes.position.count-145);
assert.equal(lod.index.count/3,202);
raw.computeBoundingBox();lod.computeBoundingBox();assert.ok(raw.boundingBox.min.distanceTo(lod.boundingBox.min)<1e-7&&raw.boundingBox.max.distanceTo(lod.boundingBox.max)<1e-7);
const p=lod.attributes.position,triangles=[];for(let i=0;i<lod.index.count;i+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,lod.index.getX(i+j)))));
const point=new THREE.Vector3(),nearest=new THREE.Vector3();let maxDeviation=0;
for(let i=0;i<source.positions.length;i+=3){point.fromArray(source.positions,i);let d=Infinity;for(const triangle of triangles)d=Math.min(d,triangle.closestPointToPoint(point,nearest).distanceTo(point));maxDeviation=Math.max(maxDeviation,d);}
assert.ok(maxDeviation<.025,'Do not remove the sleeve silhouette or introduce a large gap');
const data={positions:Array.from(p.array),normals:Array.from(lod.attributes.normal.array),uvs:Array.from(lod.attributes.uv.array),colors:Array.from(lod.attributes.color.array),indices:Array.from(lod.index.array)};
const file='src/battle/fps/presentation/fpsDrapedSleeveLodData.js';assert.ok(!fs.existsSync(file));
fs.writeFileSync(file,'// Offline LOD of ESMO original cloth; same bounds/UV/material frame, 202 triangles.\nexport const FPS_DRAPED_SLEEVE_LOD_DATA = '+JSON.stringify(data)+';\n',{flag:'wx'});
const report={originalTriangles:780,lodTriangles:202,vertices:p.count,boundsUnchanged:true,maxOriginalVertexToLodSurfaceDeviationMetres:maxDeviation,shaderUVAndColorRetained:true,sourceSha256:createHash('sha256').update(fs.readFileSync('src/battle/fps/presentation/fpsDrapedSleeveData.js')).digest('hex'),outputSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
fs.writeFileSync('review/cs-major-upgrade/evidence/owner4-review-20261013/sleeve-lod-build.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
