// Source-bound schema capsule, not synthetic gameplay or a simulation outcome.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fpsAuthenticitySourceDomain} from './lib/fpsAuthenticitySourceDomain.mjs';
const output=process.env.ESMO_CS_METADATA_DELTA_REPORT;assert.ok(output&&!fs.existsSync(output));
const hash=value=>createHash('sha256').update(value).digest('hex');
const mainPath='src/battle/fps/EsportsFPS3D.jsx',after=fs.readFileSync(mainPath,'utf8');
const manifest=JSON.parse(fs.readFileSync('tools/.cs-major-verifier-recovery/authenticity-p0-v4-mirage-20261012.json.gz.manifest.json','utf8'));
const newFragment='...(sceneVersion!=="legacy"?{carrierPosition:{...carrier.pos}}:{})',oldFragment='carrierPosition:{...carrier.pos}';
let pass=0;const checks=[];const check=(name,fn)=>{try{fn();pass++;checks.push({name,result:'PASS'});console.log(`PASS ${name}`);}catch(error){checks.push({name,result:'FAIL',reason:error.message});console.error(`FAIL ${name}: ${error.stack}`);}};
const before=after.replace(newFragment,oldFragment),domain=fpsAuthenticitySourceDomain();
check('sole exact source delta restores complete v4 main SHA',()=>{assert.equal(after.split(newFragment).length,2);assert.equal(hash(before),manifest.sourceSHA256);});
check('all three imported simulation module hashes unchanged',()=>{for(const[file,sha]of Object.entries(manifest.sourceDomain.hashes))if(file!==mainPath)assert.equal(domain.hashes[file],sha,file);});
const archive='review/cs-major-upgrade/evidence/retention-policy-20261011/e-final-source-recovery.json.gz',gz=fs.readFileSync(archive),recovery=JSON.parse(gunzipSync(gz).toString()),entry=recovery.files.find(row=>row.path===mainPath),archivedMain=Buffer.from(entry.base64,'base64');
check('archived Legacy schema source SHA provenance',()=>{assert.equal(hash(gz),'adf060de48c15a988fcf5e9626d1ce92120982d1513211ef25d387a3d2971fe9');assert.equal(hash(archivedMain),entry.sha256);});
const literal=source=>{const marker='bombAudit.plantEvents.push(';assert.equal(source.split(marker).length,2);return source.split(marker)[1].split(');')[0];};
const expressions={before:literal(before),after:literal(after),archive:literal(archivedMain.toString())};
const compact=JSON.parse(fs.readFileSync('tools/.cs-major-verifier-recovery/authenticity-p0-v4-diagnostic-20261012/mirage-t_apalace-c_std.report.json','utf8'));
const realPlant=compact.rounds.find(round=>round.plant)?.plant;assert.ok(realPlant?.carrierPos);
// Real saved position/actor; score/alive fields are neutral schema fixtures and
// are explicitly NOT a manufactured simulation result.
const values={rnd:0,sec:realPlant.roundSec,target:realPlant.site,c4pos:realPlant.pos,carrier:{id:realPlant.carrierId,name:'schema-fixture',pos:realPlant.carrierPos},tScore:0,ctScore:0,aliveT:[],aliveCT:[]};
const evaluate=(expression,sceneVersion)=>new Function(...Object.keys(values),'sceneVersion',`return (${expression});`)(...Object.values(values),sceneVersion);
const majorBefore=evaluate(expressions.before,'major.v1'),majorAfter=evaluate(expressions.after,'major.v1'),legacyArchive=evaluate(expressions.archive,'legacy'),legacyAfter=evaluate(expressions.after,'legacy');
check('Major exact metadata JSON bytes unchanged',()=>assert.equal(JSON.stringify(majorAfter),JSON.stringify(majorBefore)));
check('Legacy exact schema bytes restored to archived source',()=>assert.equal(JSON.stringify(legacyAfter),JSON.stringify(legacyArchive)));
check('scene-specific carrier position contract is present only in Major',()=>{assert.deepEqual(majorAfter.carrierPosition,realPlant.carrierPos);assert.equal(Object.hasOwn(legacyAfter,'carrierPosition'),false);});
const report={schema:'cs-gameplay-metadata-only-delta.v1',scope:'source-bound schema capsule only; no new simulation invoked; whole other main bytes hash-exact unchanged',inputs:'real saved v4 plant position and actor, neutral synthetic schema counters; not a synthetic winner/plant outcome',checks,exactOnlyMetadataDelta:pass===6,beforeMainSHA256:hash(before),afterMainSHA256:hash(after),beforeSourceDomain:manifest.sourceDomain,afterSourceDomain:domain,archiveSourceHash:recovery.sourceHash,expressions,metadata:{majorBeforeSHA256:hash(JSON.stringify(majorBefore)),majorAfterSHA256:hash(JSON.stringify(majorAfter)),legacyArchiveSHA256:hash(JSON.stringify(legacyArchive)),legacyAfterSHA256:hash(JSON.stringify(legacyAfter))},reuseBoundary:'Major v4 full runtime evidence may be referenced only with this exact source delta proof; this is not a blanket new whole-source runtime PASS',legacyRuntimeBoundary:'original full Legacy simulation SHA equivalence passed for a 0-plant match; plant schema exercised by explicit source capsule instead of inventing gameplay'};
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(`CS Gameplay Metadata Delta: ${pass}/6 PASS`);if(pass!==6)process.exitCode=1;
