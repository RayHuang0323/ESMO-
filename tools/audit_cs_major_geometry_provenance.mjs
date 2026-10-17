#!/usr/bin/env node
// Read-only geometry provenance alias. No geometry rerun, simulation, browser or build.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseExpression} from '@babel/parser';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--(beforeArchive|baselineAlias|out)=(.+)$/.exec(arg);if(!m)throw Error('Use exactly one --beforeArchive / --baselineAlias and --out');return[m[1],m[2]];}));
if(Boolean(args.beforeArchive)===Boolean(args.baselineAlias)||!args.out)throw Error('Explicit archive or existing alias baseline required');
const out=path.resolve(args.out),base=path.resolve('review/cs-major-upgrade/evidence'),rel=path.relative(base,out);
if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||fs.existsSync(out))throw Error('New CS evidence file required');
const beforePath='review/cs-major-upgrade/evidence/authenticity-closure-20261012/owner7-v4-final-cpu-summary.json',beforeBytes=fs.readFileSync(beforePath),before=JSON.parse(beforeBytes);
const current=before.sourceFiles.map(row=>({...row,currentSha256:sha(fs.readFileSync(row.path)),unchanged:sha(fs.readFileSync(row.path))===row.sha256}));
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
function objectAt(code,start){
 if(code[start]!=='{')throw Error('Object marker mismatch');let level=0,quote=null,line=false,block=false,escaped=false;
 for(let i=start;i<code.length;i++){const c=code[i],next=code[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}if(c==='/'&&next==='/'){line=true;i++;continue;}if(c==='/'&&next==='*'){block=true;i++;continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')level++;else if(c==='}'&&!--level)return code.slice(start,i+1);}
 throw Error('Object closing brace absent');
}
function normalize(ast){
 const ids=new Map(),drop=new Set(['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments']);
 function visit(node,preserve=false){if(Array.isArray(node))return node.map(n=>visit(n));if(!node||typeof node!=='object')return node;if(node.type==='Identifier'){const name=preserve?node.name:(ids.get(node.name)||(()=>{const id='ref'+ids.size;ids.set(node.name,id);return id;})());return{type:node.type,name};}const out={};for(const [key,value] of Object.entries(node)){if(drop.has(key))continue;const keyIdentifier=key==='key'&&(node.type==='ObjectProperty'||node.type==='ObjectMethod')&&!node.computed,propertyIdentifier=key==='property'&&node.type==='MemberExpression'&&!node.computed;out[key]=visit(value,keyIdentifier||propertyIdentifier);}return out;}
 return visit(ast);
}
const marker='const MAPS=';if(source.split(marker).length!==2)throw Error('MAPS marker not unique');
const currentObject=objectAt(source,source.indexOf(marker)+marker.length),normalizedCurrent=normalize(parseExpression(currentObject)),geometryHash=sha(JSON.stringify(normalizedCurrent));
let archive,manifestBytes,manifest,actualBundle,aliasBaseline;
const bundle=createHash('sha256'),matches=[];
if(args.beforeArchive){
 archive=path.resolve(args.beforeArchive);manifestBytes=fs.readFileSync(path.join(archive,'build-manifest.json'));manifest=JSON.parse(manifestBytes);
for(const name of fs.readdirSync(path.join(archive,'assets')).filter(n=>n.endsWith('.js')).sort()){
 const bytes=fs.readFileSync(path.join(archive,'assets',name));bundle.update(name+'\0');bundle.update(bytes);const code=bytes.toString('utf8');
 for(const match of code.matchAll(/\b[\w$]+=\{mirage:\{name:/g)){const expression=objectAt(code,match.index+match[0].indexOf('{')),ast=normalize(parseExpression(expression));matches.push({file:name,offset:match.index,bytes:Buffer.byteLength(expression),mapIds:ast.properties?.map(p=>p.key.name||p.key.value),normalizedGeometrySha256:sha(JSON.stringify(ast))});}
}
 actualBundle=bundle.digest('hex');if(actualBundle!==manifest.bundleSha256)throw Error('Historical archive actual bundle SHA mismatch');
}else{
 const aliasFile=path.resolve(args.baselineAlias),aliasRel=path.relative(base,aliasFile);if(!aliasRel||aliasRel.startsWith('..')||path.isAbsolute(aliasRel))throw Error('Existing alias must be CS evidence child');
 const bytes=fs.readFileSync(aliasFile),baseline=JSON.parse(bytes);
 if(baseline.verdict!=='STATIC_GEOMETRY_PROVENANCE_ALIAS'||!Object.values(baseline.checks).every(Boolean))throw Error('Baseline alias did not pass');
 if(baseline.historicalCpu.sha256!==sha(beforeBytes))throw Error('CPU baseline provenance drift');
 aliasBaseline={path:aliasFile,sha256:sha(bytes),sourceFiles:baseline.sourceFiles,currentGeometry:baseline.currentGeometry};
 matches.push({source:args.baselineAlias,normalizedGeometrySha256:baseline.currentGeometry.normalizedAstSha256});
}
const staticUnchanged=current.filter(row=>row.path!=='src/battle/fps/EsportsFPS3D.jsx').every(row=>row.unchanged),layoutUnchanged=matches.length>0&&matches.every(m=>m.normalizedGeometrySha256===geometryHash);
const drift=current.filter(row=>sha(fs.readFileSync(row.path))!==row.currentSha256);if(drift.length)throw Error('TOOL_SOURCE_DRIFT: '+drift.map(row=>row.path));
const checks={historicalCpuNativeZero:before.reports.every(r=>r.nativeExit===0),sixStaticGeometrySourcesUnchanged:staticUnchanged,actualHistoricalBundleVerified:true,normalizedFullThreeMapLayoutUnchanged:layoutUnchanged};
const report={schema:'cs-major-geometry-provenance-alias.v1',checkedAt:new Date().toISOString(),checks,sourceFiles:current,historicalCpu:{path:beforePath,sha256:sha(beforeBytes),reports:before.reports},historicalArchive:archive?{path:archive,manifestSha256:sha(manifestBytes),bundleSha256:actualBundle,sourceFingerprint:manifest.sourceFingerprint,mapObjects:matches}:undefined,aliasBaseline,currentGeometry:{normalizedAstSha256:geometryHash,bytes:Buffer.byteLength(currentObject),method:'Parse full three-map object literal with Babel; preserve property names/literal values/order, normalize only referenced identifier names; static referenced geometry modules SHA checked separately'},scope:'Alias existing CPU static MAPS/environment/terrain geometry evidence only. Whole main source changed; no claim of current gameplay/runtime PASS or fresh geometry execution.',geometryRerun:false,simulationRun:false,browserRun:false,buildRun:false,verdict:Object.values(checks).every(Boolean)?'STATIC_GEOMETRY_PROVENANCE_ALIAS':'PROVENANCE_FINDING'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:args.out,bytes:fs.statSync(out).size,sha256:sha(fs.readFileSync(out)),checks,matches,mainSha256:current[0].currentSha256,verdict:report.verdict}));process.exitCode=Object.values(checks).every(Boolean)?0:1;
