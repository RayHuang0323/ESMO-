import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [sourcePath,fitPath,out]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
let code=fs.readFileSync(sourcePath,'utf8');const fit=JSON.parse(fs.readFileSync(fitPath));
assert.equal(sha(code),fit.sourceSha256);assert.equal(fit.final.samples,1030);assert(fit.final.negativeOver2mm<=40);assert(fit.sourceAssetsUnchanged);
if(fit.method==='NATURAL_FINGER_FLEX_AUTHOR_SEARCH'){
 assert.equal(fit.fingerFlexSumBoundRadians,Math.PI);assert.equal(fit.maximumAngleOffsetRadians,null);
 assert(fit.fingers.every(f=>f.best.angles.reduce((n,v)=>n+v,0)<=Math.PI&&f.best.skin.minimumDistanceMetres<.002&&f.best.tip.distance<.01));
}else assert.equal(fit.maximumAngleOffsetRadians,.1);
const flex=['index','middle','ring','pinky'].map(d=>fit.fingers.find(r=>r.digit===d).best.angles);
assert(flex.flat().every(Number.isFinite));
code=code.replace(/const SNIPER_SUPPORT_FLEX=Object.freeze\(\[.*\]\);/,`const SNIPER_SUPPORT_FLEX=Object.freeze(${JSON.stringify(flex)});`);
const thumbBlock=/if\(family==='sniper'\)\{\s*thumbs\[3\]\.quaternion\.set\([^;]+\)\.normalize\(\);\s*thumbs\[4\]\.quaternion\.setFromAxisAngle\(X_AXIS,[^;]+\);thumbs\[5\]\.quaternion\.setFromAxisAngle\(X_AXIS,[^;]+\);/;
assert(thumbBlock.test(code),'來源拇指分支已變，拒絕猜替換');
const thumb=fit.thumb.best;assert(thumb.tip.distance<.01&&thumb.rotation.length===4&&thumb.flex.length===2);
code=code.replace(thumbBlock,`if(family==='sniper'){\n        thumbs[3].quaternion.set(...${JSON.stringify(thumb.rotation)}).normalize();\n        thumbs[4].quaternion.setFromAxisAngle(X_AXIS,${thumb.flex[0]});thumbs[5].quaternion.setFromAxisAngle(X_AXIS,${thumb.flex[1]});`);
fs.writeFileSync(out,code,{flag:'wx'});console.log(JSON.stringify({status:'VISIBLE_GRIP_CANDIDATE_NOT_PRODUCT_PASS',sourceSha256:fit.sourceSha256,fitSha256:sha(fs.readFileSync(fitPath)),candidateSha256:sha(code),out}));
