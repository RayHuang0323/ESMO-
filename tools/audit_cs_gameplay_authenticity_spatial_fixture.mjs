// Read exactly one existing canonical gzip once; no simulation/roundtrip.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditFpsSpatialAuthenticity} from './lib/fpsAuthenticitySpatialAudit.mjs';
const argument=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const fixture=argument('fixture'),report=argument('report'),output=argument('output');
assert.ok(fixture&&report&&output&&!fs.existsSync(output));
const manifest=JSON.parse(fs.readFileSync(fixture+'.manifest.json','utf8'));
const gz=fs.readFileSync(fixture),json=gunzipSync(gz);
assert.equal(createHash('sha256').update(gz).digest('hex'),manifest.gzipSHA256);
assert.equal(createHash('sha256').update(json).digest('hex'),manifest.jsonSHA256);
const sim=JSON.parse(json.toString()),audit=JSON.parse(fs.readFileSync(report,'utf8'));
const spatial=auditFpsSpatialAuthenticity(sim,audit.measurement.anchors);
spatial.provenance={fixture,jsonSHA256:manifest.jsonSHA256,sourceSHA256:manifest.sourceSHA256,simulationInvoked:false,geometricLOSRecalculation:'UNKNOWN: old source map was subsequently changed; use recorded same-source LOS permission'};
fs.writeFileSync(output,JSON.stringify(spatial,null,2),{flag:'wx'});
console.log(JSON.stringify({output,summary:spatial.summary,firstShots:spatial.rounds.map(r=>({round:r.round,...r.firstShot,positions:undefined}))},null,2));
