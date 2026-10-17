import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {measureHandExposure} from './measure_hand_exposure.mjs';

const [out,...inputs]=process.argv.slice(2);
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out)&&inputs.length===2);
const cases=[];
for(const file of inputs){
 const raw=fs.readFileSync(file),p=JSON.parse(raw),o=p.observed;
 assert.equal(p.status,'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS');
 assert(!o.playing&&!o.dead&&!o.reloading&&o.bodyVisible&&o.family==='sniper'&&o.variation==='support'&&o.cardText);
 assert.equal(Object.keys(p.sourceHashes).length,p.sourceFingerprint.files);
 for(const [source,sha] of Object.entries(p.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sha,'真保存幀來源已變');
 const right=measureHandExposure(p,'r'),left=measureHandExposure(p,'l');
 assert(left.bestVisible>0,'支撐手正控制失敗，工具不能判產品');
 cases.push({file,packetSha256:crypto.createHash('sha256').update(raw).digest('hex'),observed:o,right,left,clearancePassed:right.bestVisible>0});
}
assert.deepEqual(cases.map(c=>c.observed.id.slice(0,-1)).sort(),['ct','t']);
const pass=cases.filter(c=>c.clearancePassed).length,report={status:pass===cases.length?'PASS':'PRODUCT_FAIL',scope:'TRUE_SAVED_FRAME_MINIMUM_HAND_EXPOSURE_NOT_ART_GATE',criterion:'106 左右手皮取樣；120方向中扳機手至少一點可見，避免整手埋入不透明幾何。支撐手為工具正控制；不評掌面接觸、shader或像素。',pass,fail:cases.length-pass,cases};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));console.log(`RESULT=${report.status}`);process.exitCode=report.fail?1:0;
