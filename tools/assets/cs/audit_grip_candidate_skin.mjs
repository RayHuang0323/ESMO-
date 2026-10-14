import fs from 'node:fs';
import {saveAuthorReport} from './authorReport.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
const [modulePath,out,geometryModulePath]=process.argv.slice(2);assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const geometryModule=geometryModulePath?await import(pathToFileURL(path.resolve(geometryModulePath))):null;
const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(modulePath))),assets=await readFpsRigTestAssets(),results=[];
const source=fs.readFileSync('tools/check_cs_major_support_grip.mjs','utf8'),start=source.indexOf(" check('真狙擊五指手皮"),end=source.indexOf(" check('受擊",start);assert(start>=0&&end>start);
const geometryReports=[];
function fixture(options,fn){const f=assets.make({continuousClothing:true,importedWeapons:true,...options}),mesh=f.c.c2c.tailored.mesh,original=mesh.geometry;let privateGeometry=null;try{if(geometryModule){privateGeometry=original.clone();geometryReports.push(geometryModule.applyFpsGloveSurface(privateGeometry,mesh));mesh.geometry=privateGeometry;}f.update({dt:0});f.c.gripPose.restore();f.c.gripPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});return fn(f);}finally{mesh.geometry=original;privateGeometry?.dispose();f.dispose();}}
function check(name,fn){try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,message:e.message});}}
try{
 // 共用現役的真手皮／骨端／局部反側門檻，不能為新候選放寬。
 eval(source.slice(start,end));assert(assets.unchanged());const passed=results.every(r=>r.passed),report={status:passed?'AUTHOR_EXISTING_SKIN_GUARD_PASS_NOT_ART_GATE':'REJECTED_AUTHOR_SKIN_NOT_PRODUCT_REGRESSION',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),guardSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),geometryModuleSha256:geometryModulePath?crypto.createHash('sha256').update(fs.readFileSync(geometryModulePath)).digest('hex'):null,geometryReports,scope:'Existing verifier visible skin section only, unchanged thresholds; private candidate owner',sourceAssetsUnchanged:true,results};
 saveAuthorReport(out,report);process.exitCode=passed?0:1;
}finally{assets.dispose();}
