#!/usr/bin/env node
// Read selected top-level fields from a saved acceptance artifact; never simulate.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fpsFakeArrivalEvidence } from './lib/fpsFakeArrivalEvidence.mjs';
const input = process.argv[2], output = process.argv[3];
assert.ok(input && output && !fs.existsSync(output));
const wanted = new Set(['assessment','executionAccounting','maps','tacticalFamilies','routeDifferences','retakeSave','causalErrors','executionIssues','provenanceIssues','coverageMissing','utility','fakeReachedEvents']);
const fields = {}, hash = createHash('sha256');
let state = 'root', keyText = '', key, value = '', depth = 0, quoted = false, escaped = false, retain = false, bytes = 0;
for await (const chunk of fs.createReadStream(input, { encoding: 'utf8', highWaterMark: 65536 })) {
  hash.update(chunk); bytes += Buffer.byteLength(chunk);
  for (const c of chunk) {
    if (state === 'root') { if (c === '{') state = 'key'; else assert.ok(/\s/.test(c)); continue; }
    if (state === 'key') { if (c === '}') { state = 'done'; continue; } if (/\s|,/.test(c)) continue; assert.equal(c, '"'); keyText = c; state = 'key-text'; quoted = true; escaped = false; continue; }
    if (state === 'key-text') { keyText += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') { key = JSON.parse(keyText); retain = wanted.has(key); state = 'colon'; } continue; }
    if (state === 'colon') { if (/\s/.test(c)) continue; assert.equal(c, ':'); state = 'value'; value = ''; depth = 0; quoted = false; escaped = false; continue; }
    if (state === 'value') {
      if (!quoted && depth === 0 && (c === ',' || c === '}')) { if (retain) fields[key] = JSON.parse(value); state = c === '}' ? 'done' : 'key'; continue; }
      if (retain) value += c;
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      continue;
    }
    assert.ok(/\s/.test(c));
  }
}
assert.equal(state, 'done');
const correction = process.argv.includes('--correct-fake-event');
let fakeCorrection;
if (correction) {
  assert.equal(fpsFakeArrivalEvidence({pos:{x:5,y:0},fakeGoal:{x:0,y:0}}).arrived,true);
  assert.equal(fpsFakeArrivalEvidence({pos:{x:6,y:0},fakeGoal:{x:0,y:0}}).arrived,false);
  assert.equal(fpsFakeArrivalEvidence({fakeGoal:{x:0,y:0}}).arrived,false);
  const events = fields.fakeReachedEvents.map(row => ({matchId:row.matchId,round:row.round,eventId:row.event.id,playerId:row.event.playerId,roundSec:row.event.roundSec,...fpsFakeArrivalEvidence(row.event),subsequentFramePos:row.pos,previousSnapshotDistance:row.distanceToGoal}));
  assert.equal(events.length,fields.tacticalFamilies.Fake.fakeReachedEvents);
  assert.ok(events.length > 0 && fields.tacticalFamilies.Fake.subsequentRealExecuteEpisodes > 0);
  const oldErrors = fields.causalErrors.filter(row => row.kind === 'fake-reached-without-physical-arrival');
  const newErrors = events.filter(row => !row.arrived).map(row => ({...row,kind:'fake-reached-without-physical-arrival'}));
  fields.causalErrors = [...fields.causalErrors.filter(row => row.kind !== 'fake-reached-without-physical-arrival'),...newErrors];
  fakeCorrection = {reason:'原摘要誤用同tick轉真攻並移動後的frame位置；改驗保存於fake-reached當下的event.pos。產品門檻仍<6，缺事件位置即失敗，後續真execute非空守門保留。',syntheticCounterexampleChecks:3,originalErrors:oldErrors,eventsChecked:events.length,eventArrivalErrors:newErrors.length,events};
  fields.assessment = {...fields.assessment,canonicalCausalSafety:fields.causalErrors.length ? 'PRODUCT_FAIL' : fields.executionIssues.length || fields.provenanceIssues.length ? 'INCOMPLETE' : 'PASS'};
  assert.equal(fields.assessment.fullMatchExecution,'PASS');
  assert.equal(fields.assessment.tacticalPhysicalCoverage,'OBSERVED');
  fields.assessment.acceptance = fields.causalErrors.length ? 'PRODUCT_FAIL' : fields.executionIssues.length ? 'HARNESS_FAIL' : fields.provenanceIssues.length ? 'SOURCE_PROVENANCE_FAIL' : fields.utility.repeatedPurchaseZeroUse.length ? 'OWNER_REVIEW_WITH_OPEN_ITEMS' : 'PASS';
}
const counts = rows => rows.reduce((result, row) => { const kind = row.kind ?? 'UNKNOWN'; result[kind] = (result[kind] ?? 0) + 1; return result; }, {});
const compact = {
  source: { path: input, bytes, sha256: hash.digest('hex'), newSimulationInvoked: false },
  assessment: fields.assessment, executionAccounting: fields.executionAccounting,
  fakeCorrection,
  causalErrorKinds: counts(fields.causalErrors), causalErrors: fields.causalErrors,
  executionIssues: fields.executionIssues, provenanceIssues: fields.provenanceIssues, coverageMissing: fields.coverageMissing,
  maps: Object.fromEntries(Object.entries(fields.maps).map(([key, row]) => [key, Object.fromEntries(['matches','rounds','frames','plants','carrierReachedRounds','sites','noPlantReasons','noPlantTEliminationCategories','regionFraction','purchaseToUse','utilityPurchased','thrown','purposes','concentration'].map(name => [name,row[name]]))])),
  tacticalFamilies: Object.fromEntries(Object.entries(fields.tacticalFamilies).map(([key,row]) => [key,{status:row.status,physicalEpisodes:row.physicalEpisodes,matches:row.matches.length,phases:row.phases,routeSignatures:row.actualRouteSignatures.length,fakeReachedEvents:row.fakeReachedEvents,subsequentRealExecuteEpisodes:row.subsequentRealExecuteEpisodes}])),
  routeDifferences: Object.fromEntries(Object.entries(fields.routeDifferences).map(([key,row]) => [key,{status:row.status,observedDistinctRouteSets:row.observedDistinctRouteSets,observedDistinctNavigablePathSets:row.observedDistinctNavigablePathSets}])),
  retakeSave: Object.fromEntries(Object.entries(fields.retakeSave).map(([key,rows]) => [key,Object.fromEntries(Object.entries(rows).map(([kind,row]) => [kind,{...row,survivingEquipmentCount:row.survivingEquipment.length,survivingEquipment:undefined}]))])),
  unused: fields.utility.neverUsedPurchasedByPlayerType,
  repeatedPurchaseZeroUse: fields.utility.repeatedPurchaseZeroUse.length,
  noUseCounterMethod: fields.utility.noUseCounterMethod,
};
fs.writeFileSync(output,JSON.stringify(compact,null,2),{flag:'wx'});
console.log(JSON.stringify({output,causalErrorKinds:compact.causalErrorKinds,repeatedPurchaseZeroUse:compact.repeatedPurchaseZeroUse,source:compact.source},null,2));
