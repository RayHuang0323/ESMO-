// Validate bounded experiment receipts against the unchanged current engine.
// PASS means evidence is coherent, never that map balance is certified.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.argv[2];if(!root)throw Error('Evidence directory required');
const rows=fs.readFileSync(path.join(root,'fairness.ndjson'),'utf8').trim().split('\n').map(JSON.parse),summary=JSON.parse(fs.readFileSync(path.join(root,'fairness-summary.json'))),engineHash=createHash('sha256').update(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx')).digest('hex');
assert.equal(rows.length,36);assert.equal(summary.sourceHash,engineHash);assert.equal(new Set(rows.map(r=>[r.map,r.seed,r.policy,r.start,r.route].join('/'))).size,36);
for(const row of rows){assert.equal(row.sourceHash,engineHash);assert.equal(row.tWins+row.ctWins,row.rounds);assert.ok(row.roundsDetail.every(r=>['t','ct'].includes(r.winner)));if(row.policy==='shared-p250')assert.deepEqual(Object.keys(row.gunShots),['p250']);}
for(const group of summary.groups){const rs=rows.filter(r=>r.map===group.map&&r.policy===group.policy&&r.route===group.route);assert.equal(rs.length,group.matches);assert.equal(rs.reduce((s,r)=>s+r.tWins,0),group.totalT);assert.equal(rs.reduce((s,r)=>s+r.ctWins,0),group.totalCT);for(const pair of group.pairs){const p=rs.filter(r=>r.seed===pair.seed);assert.equal(p.length,2);assert.equal(p[0].inputHash,p[1].inputHash);assert.deepEqual(p.map(r=>r.start).sort(),['ct','t']);}}
console.log('CS_FAIRNESS_EVIDENCE RESULT=PASS runs=36 engineHash='+engineHash+' balanceCertified=false');
