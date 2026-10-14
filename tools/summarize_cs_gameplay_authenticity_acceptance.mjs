#!/usr/bin/env node
// Pure offline review: each existing compact report is read once. No engine or full fixture reads.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyFpsCameraAliasFile } from './lib/fpsCameraSourceAlias.mjs';
import { fpsSimulationJSONChunks } from './lib/fpsSimulationGzip.mjs';
import { fpsFakeArrivalEvidence } from './lib/fpsFakeArrivalEvidence.mjs';

const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const run = arg('run'), output = arg('output'), expected = Number(arg('expected') || 55);
assert.ok(run && output && Number.isInteger(expected) && expected > 0, 'require --run, --output; optional --expected');
for (const ext of ['.json', '.md']) assert.ok(!fs.existsSync(output + ext), `refuse overwrite ${output + ext}`);
const checkpointPath = path.join(run, 'checkpoint.json');
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const sourceRecords = checkpoint.records.filter(record => record.report);
const reports = []; // Metadata only: never retain all parsed raw reports.
const types = ['flash', 'smoke', 'he', 'molly'];
const ui = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f8'];
const errors = [], executionIssues = [], provenanceIssues = [], concentrationEpisodes = [], firstContacts = [], rotations = [], routes = [], unused = [], perRoundUnused = [], utilityThrows = [], roundRows = [], noPlantTElimination = [], fakeEvents = [];
const maps = {}, phaseRows = [], retakeSaveRows = [], familyRows = Object.fromEntries([...ui, 'role-lurk', 'intel-rotate'].map(id => [id, []]));
const sourceProofCache = new Map();
const increment = (target, key, amount = 1) => target[key] = (target[key] || 0) + amount;
const addCounts = (target, values) => { if (values && typeof values === 'object') for (const [key, value] of Object.entries(values)) if (Number.isFinite(value)) increment(target, key, value); };
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
// Buy-phase separation is not route execution. Older reports lack the new distance
// field; only entirely post-buy episodes or actual cursor advancement can prove motion.
function motion(episode) {
  if (Number.isFinite(episode.postBuyNavigatingDistance)) return { observed: episode.postBuyNavigatingDistance > .05, method: 'post-buy-walk/run-distance', value: episode.postBuyNavigatingDistance };
  if (episode.startSec >= 12) return { observed: episode.traveledDistance > .05, method: 'entire-episode-after-buy-position-distance', value: episode.traveledDistance };
  if (episode.routeIdxLast > episode.routeIdxStart) return { observed: true, method: 'actual-route-cursor-advanced', value: episode.routeIdxLast - episode.routeIdxStart };
  return { observed: false, method: 'UNKNOWN: no post-buy motion field and no cursor advance', value: null };
}
for (const record of sourceRecords) {
  const bytes = fs.readFileSync(record.report);
  const audit = JSON.parse(bytes.toString('utf8'));
  const reportSHA256 = createHash('sha256').update(bytes).digest('hex');
  reports.push({ record, audit: { execution: audit.execution, utilityNoUseCounterMethod: audit.utilityNoUseCounterMethod }, reportSHA256 });
  const id = record.id;
  const context = { matchId: id, mapKey: audit.mapKey };
  if (record.result !== 'MATCH_EXECUTION_PASS' || !record.shapeOK || (record.execution === 'REUSED_PASS' ? record.originNativeExitCode !== 0 : record.nativeExitCode !== 0)) executionIssues.push({ ...context, kind: 'native-execution', record, classification: 'HARNESS_FAIL_OR_INCOMPLETE：原生／保存失敗不可當產品回歸或完整PASS' });
  if (audit.execution?.sourceDomain?.sha256 !== checkpoint.baselineSourceDomain?.sha256) {
    try {
      const equivalence = record.sourceEquivalence;
      assert.ok(record.execution === 'REUSED_PASS' && equivalence, 'no verified renderer-only equivalence for original source');
      let verified = sourceProofCache.get(equivalence.proofPath);
      if (!verified) { verified = verifyFpsCameraAliasFile(equivalence.proofPath); sourceProofCache.set(equivalence.proofPath, verified); }
      assert.equal(verified.sha256, equivalence.proofSHA256);
      assert.deepEqual(verified.proof.currentSourceDomain, checkpoint.baselineSourceDomain);
      assert.deepEqual(verified.proof.originSourceDomain, audit.execution.sourceDomain);
      assert.deepEqual(record.sourceDomain, audit.execution.sourceDomain);
      assert.equal(record.sourceSHA256, audit.execution.sourceSHA256);
      assert.deepEqual(verified.proof.allowedInputs[id].configuration, audit.configuration);
      assert.equal(verified.proof.allowedInputs[id].reportSHA256, reportSHA256);
      assert.deepEqual(record.validatedForSourceDomain, checkpoint.baselineSourceDomain);
    } catch (error) { provenanceIssues.push({ ...context, kind: 'mixed-source-domain-or-invalid-renderer-proof', reason: error.message }); }
  }
  for (const check of audit.execution?.checks || []) if (check.result !== 'PASS') errors.push({ ...context, kind: 'canonical-case-check', check });
  for (const key of ['utilityInventoryConservationErrors', 'utilityPurchaseConservationErrors']) {
    if (!Array.isArray(audit.summary[key])) errors.push({ ...context, kind: `missing-${key}` });
    else for (const error of audit.summary[key]) errors.push({ ...context, kind: key, ...error });
  }
  const map = maps[audit.mapKey] ??= { matches: 0, rounds: 0, frames: 0, plants: 0, carrierReachedRounds: 0, sites: {}, roundTargets: {}, noPlantReasons: {}, regionSamples: {}, utilityPurchased: {}, utilityCarried: {}, thrown: {}, utilityCost: 0, purchaseToUse: Object.fromEntries(types.map(type => [type, { purchased: 0, carried: 0, minPurchasedUsed: 0, maxPurchasedUsed: 0 }])), purposes: {}, utilityPositions: {}, concentration: {}, formalTactics: {}, formalCTTactics: {}, sourceReports: [] };
  map.matches++; map.rounds += audit.roundCount; map.frames += audit.frameCount; map.plants += audit.summary.plants; map.carrierReachedRounds += audit.summary.carrierReachedRounds;
  map.utilityCost += audit.summary.utilityCost || 0;
  for (const [target, key] of [['sites', 'plantSites'], ['roundTargets', 'roundTargets'], ['regionSamples', 'regionSamples'], ['utilityPurchased', 'utilityPurchased'], ['utilityCarried', 'utilityCarried'], ['thrown', 'thrown'], ['purposes', 'purposeCounts'], ['utilityPositions', 'positionCounts'], ['concentration', 'concentration']]) addCounts(map[target], audit.summary[key]);
  for (const type of types) for (const key of ['purchased', 'carried', 'minPurchasedUsed', 'maxPurchasedUsed']) increment(map.purchaseToUse[type], key, audit.summary.purchaseToUse?.[type]?.[key] || 0);
  const originRun = record.originCheckpoint ? path.dirname(record.originCheckpoint) : path.dirname(record.report);
  const resourcePath = originRun + '.resource.json';
  const resourcePreflight = fs.existsSync(resourcePath) ? { path: resourcePath, sha256: createHash('sha256').update(fs.readFileSync(resourcePath)).digest('hex'), data: JSON.parse(fs.readFileSync(resourcePath, 'utf8').replace(/^\uFEFF/, '')) } : null;
  map.sourceReports.push({ matchId: id, path: record.report, sha256: reportSHA256, sourceDomainSHA256: audit.execution.sourceDomain.sha256, sourceEquivalence: record.sourceEquivalence ?? null, validatedForSourceDomain: record.validatedForSourceDomain ?? null, execution: record.execution || 'NEW_SIMULATION', resourcePreflight, reusedOriginal: record.execution === 'REUSED_PASS' ? record.origin : null });
  const physical = [];
  for (const row of audit.spatial.rounds) {
    for (const episode of row.routeEpisodes) {
      const measured = motion(episode);
      const actualSelection = (audit.actualPhaseSelections || []).filter(selection => selection.round === row.round && selection.playerId === episode.playerId && selection.side === episode.side && selection.phase === episode.phase && selection.roundSec <= episode.endSec).at(-1);
      if (measured.observed) physical.push({ ...context, round: row.round, playerId: episode.playerId, side: episode.side, role: episode.role, deploymentSite: Object.hasOwn(episode, 'deploymentSite') ? episode.deploymentSite : 'UNKNOWN：舊compact未保存', informationRotator: Object.hasOwn(episode, 'informationRotator') ? episode.informationRotator : 'UNKNOWN：舊compact未保存', phase: episode.phase, actualSelectionId: actualSelection?.selectionId ?? null, actualTacticId: actualSelection?.currentSideTacticId ?? actualSelection?.tacticId ?? null, actualTacticType: actualSelection?.currentSideTacticType ?? actualSelection?.tacticType ?? null, kind: episode.kind, routeId: episode.routeId, routeSignature: episode.routeSignature, navigablePathSHA256: createHash('sha256').update(JSON.stringify(episode.waypoints)).digest('hex'), navigablePointCount: episode.waypoints.length, cursorStart: episode.routeIdxStart, cursorLast: episode.routeIdxLast, identity: episode.identity, startSec: episode.startSec, endSec: episode.endSec, startPos: episode.startPos, endPos: episode.lastPos, hasBomb: episode.hasBomb, intentKind: episode.intentKind, informationSource: episode.informationSource, motion: measured });
      if (['retake', 'save'].includes(episode.kind) || episode.intentKind === 'save') {
        const final = row.routeEpisodes.filter(candidate => candidate.playerId === episode.playerId).at(-1);
        const round = audit.rounds.find(candidate => candidate.round === row.round);
        const terminalKnown = final?.endSec === round.endSec && typeof final.terminalDead === 'boolean';
        retakeSaveRows.push({ ...context, round: row.round, playerId: episode.playerId, side: episode.side, role: episode.role, kind: episode.intentKind === 'save' ? 'save' : episode.kind, routeId: episode.routeId, routeSignature: episode.routeSignature, intentSource: episode.informationSource, startSec: episode.startSec, endSec: episode.endSec, from: episode.startPos, to: episode.lastPos, motion: measured, plant: round.plant, terminal: round.terminal, survived: terminalKnown ? !final.terminalDead : 'UNKNOWN：沒有保存到終局的角色snapshot', retainedWeapon: terminalKnown && !final.terminalDead ? final.terminalGun : null, terminalHP: terminalKnown ? final.terminalHP : null, retainedUtility: terminalKnown && !final.terminalDead ? round.players[episode.playerId].unused : null, equipmentValue: 'UNKNOWN：compact沒有真終局裝備價值ledger，不能自行重算獎勵或經濟' });
      }
    }
    for (const field of ['sameNodeRegion', 'compactRadius20', 'allTenCompactRadius20']) for (const segment of row[field].segments) concentrationEpisodes.push({ ...context, round: row.round, metric: field, ...segment });
    if (row.firstShot) {
      const shot = { ...context, round: row.round, ...row.firstShot };
      firstContacts.push(shot);
      if (shot.lineOfSightRecorded !== true) errors.push({ ...context, round: row.round, kind: 'first-contact-LOS', shot });
      if (shot.engagementPermissionRecorded !== true) errors.push({ ...context, round: row.round, kind: 'first-contact-engagement-permission', shot });
    }
    for (const rotation of row.prePlantRotations) {
      const rotationRow = { ...context, round: row.round, ...rotation, physical: rotation.physicalDistance > .05 };
      rotations.push(rotationRow);
      if (rotation.nearSiteObservedTargetIds.length < 2) errors.push({ ...context, round: row.round, kind: 'preplant-rotate-insufficient-real-intel', rotation });
    }
  }
  routes.push(...physical);
  const selections = audit.actualPhaseSelections || [];
  for (const phase of ['opening', 'mid-round', 'late-round', 'post-plant']) {
    const selected = selections.filter(selection => selection.phase === phase);
    const navigation = physical.filter(route => route.phase === phase);
    phaseRows.push({ ...context, phase, status: selected.length ? 'OBSERVED' : 'NOT_TRIGGERED', actualSelectionRows: selected.length, rounds: [...new Set(selected.map(selection => selection.round))], selectionIds: [...new Set(selected.map(selection => selection.selectionId))], actualSideTactics: [...new Set(selected.map(selection => `${selection.side}/${selection.currentSideTacticId || selection.tacticId}`))], physicallyNavigatedEpisodes: navigation.length, routeSignatureKeys: [...new Set(navigation.map(route => `${route.side}/${route.role}/${route.kind}/${route.routeSignature}`))], times: selected.map(selection => ({ round: selection.round, playerId: selection.playerId, side: selection.side, roundSec: selection.roundSec, selectionId: selection.selectionId })) });
  }
  for (const selection of selections) {
    if (selection.side === 't') increment(map.formalTactics, selection.currentSideTacticId || selection.tacticId);
    if (selection.side === 'ct') increment(map.formalCTTactics, selection.currentSideTacticId || selection.tacticId);
    if (ui.includes(selection.selectionId)) {
      const matching = physical.filter(route => route.round === selection.round && route.playerId === selection.playerId && route.phase === selection.phase && route.endSec >= selection.roundSec);
      for (const episode of matching) familyRows[selection.selectionId].push({ ...episode, selectionId: selection.selectionId, selectionAtSec: selection.roundSec, actualTacticId: selection.currentSideTacticId || selection.tacticId });
    }
  }
  for (const route of physical.filter(route => route.side === 't' && route.role === 'lurker' && route.kind === 'lurk')) familyRows['role-lurk'].push(route);
  for (const rotation of rotations.filter(rotation => rotation.matchId === id && rotation.physical)) familyRows['intel-rotate'].push(rotation);
  for (const row of audit.rounds) {
    const spatial = audit.spatial.rounds.find(spatial => spatial.round === row.round);
    const noPlantReason = row.plant ? null : row.terminal.how === 'elim' ? row.terminal.aliveT === 0 ? 'T全滅，未安包' : row.terminal.aliveCT === 0 ? 'CT全滅，未安包' : 'UNKNOWN：elim但未見一方全滅' : `未安包，真終局=${row.terminal.how}`;
    if (noPlantReason) increment(map.noPlantReasons, noPlantReason);
    let unplantedTDeathFacts = null;
    if (!row.plant && row.terminal.aliveT === 0) {
      const carrierVictimDeaths = spatial.deaths.filter(death => row.carrierIds.includes(death.victimId)).map(death => ({ ...death, wasCarryingEvidence: row.carrierDeaths.some(known => known.victimId === death.victimId && known.roundSec === death.roundSec) ? 'OBSERVED：死亡前一個snapshot持有炸彈' : 'UNKNOWN：此id曾持包，但未保存此死亡tick持包確認' }));
      const carrierKnown = row.carrierIds.length > 0;
      unplantedTDeathFacts = { ...context, round: row.round, factualCategory: !carrierKnown ? 'UNKNOWN：未保存carrier身份' : row.carrierReachedIds.length ? 'carrier曾抵點，但未plant且T全滅' : 'carrier從未抵點，未plant且T全滅', carrierIds: row.carrierIds, carrierReachedIds: row.carrierReachedIds, carrierEverReachedSite: carrierKnown ? row.carrierReachedIds.length > 0 : 'UNKNOWN', allObservedCarriersKilled: carrierKnown ? row.carrierIds.every(id => carrierVictimDeaths.some(death => death.victimId === id)) : 'UNKNOWN', carrierMinimumSiteDistance: row.carrierMinSiteDistance, carrierVictimDeaths, confirmedCarryingPreviousSnapshotDeaths: row.carrierDeaths, allTDeaths: spatial.deaths.filter(death => death.victimSide === 't').sort((a, b) => a.roundSec - b.roundSec), firstContact: spatial.firstShot, firstIntel: row.firstIntel, terminal: row.terminal, targetSite: row.target, strategicReason: 'UNKNOWN：未保存放棄安包／未plant決策動機；死亡、位置與接觸只作真終局因果事實，不能倒推策略動機' };
      noPlantTElimination.push(unplantedTDeathFacts);
      map.noPlantTEliminationCategories ??= {};
      increment(map.noPlantTEliminationCategories, unplantedTDeathFacts.factualCategory);
    }
    if (row.plant && row.carrierReachedIds.length === 0) errors.push({ ...context, round: row.round, kind: 'plant-without-carrier-arrival', plant: row.plant });
    roundRows.push({ ...context, round: row.round, target: row.target, terminal: row.terminal, startSec: row.startSec, endSec: row.endSec, plant: row.plant, carrierIds: row.carrierIds, carrierReachedIds: row.carrierReachedIds, carrierMinSiteDistance: row.carrierMinSiteDistance, carrierDeaths: row.carrierDeaths, noPlantReason, unplantedTDeathFacts, strategicNoPlantReason: row.noPlantElimination?.strategicReason ?? (noPlantReason ? 'UNKNOWN：未保存策略不安包原因，不能由終局倒推' : null), regionFraction: row.regionFraction, grid: row.grid, deaths: spatial.deaths, firstContact: spatial.firstShot, firstIntel: row.firstIntel, postPlantRotations: Object.values(row.ctRotations), prePlantRotations: spatial.prePlantRotations });
  }
  for (const event of audit.tacticalEvents || []) if (event.event.type === 'fake-reached') {
    const actor = event.players.find(player => player.id === event.event.playerId);
    const arrival = fpsFakeArrivalEvidence(event.event);
    fakeEvents.push({ ...context, round: event.round, frameSec: event.frameSec, event: event.event, playerId: event.event.playerId, ...arrival, subsequentFramePos: actor?.pos });
    if (!arrival.arrived) errors.push({ ...context, round: event.round, kind: 'fake-reached-without-physical-arrival', event: event.event, ...arrival, subsequentFramePos: actor?.pos });
  }
  utilityThrows.push(...audit.utilityThrows.map(row => ({ ...context, ...row })));
  const unusedContext = (round, playerId, type) => {
    const spatial = audit.spatial.rounds.find(row => row.round === round.round);
    const episodes = spatial.routeEpisodes.filter(row => row.playerId === playerId);
    const player = round.players[playerId];
    return { round: round.round, actualSide: player.side, target: round.target, reachedTargetSite: round.reachedIds.includes(playerId), purchased: player.utilityPurchased[type], carried: player.utilityCarried[type], initial: player.initialInventory[type], thrown: player.used[type], terminalUnused: player.unused[type], terminal: round.terminal, plant: round.plant, deaths: spatial.deaths.filter(row => row.victimId === playerId), lastRecordedPos: episodes.at(-1)?.lastPos ?? null, routeSignatures: [...new Set(episodes.map(row => row.routeSignature))], trueLiveNoUseReasons: player.utilityNoUseReasons?.[type] ?? null, plannedPurpose: 'UNKNOWN：purchase ledger未保存每次購入purpose；不能將另一玩家投擲目的當此玩家未用目的' };
  };
  perRoundUnused.push(...audit.unusedPurchasedByPlayerRound.map(row => ({ ...context, ...row, context: unusedContext(audit.rounds.find(round => round.round === row.round), row.playerId, row.type) })));
  unused.push(...audit.utilityNeverUsedPurchases.map(row => ({ ...context, ...row, roundContexts: audit.rounds.filter(round => round.players[row.playerId].initialInventory[row.type] > 0).map(round => unusedContext(round, row.playerId, row.type)), reviewStatus: row.purchasedRounds > 1 ? 'OPEN_REVIEW：反覆買入而整場未用，需檢視購買與真用途窗口是否相符' : 'OBSERVED_UNUSED：單回合未用，保留真死亡／窗口理由，不直接判為缺陷' })));
}
for (const map of Object.values(maps)) {
  const samples = Object.values(map.regionSamples).reduce((sum, value) => sum + value, 0);
  map.regionFraction = Object.fromEntries(Object.entries(map.regionSamples).map(([key, value]) => [key, samples ? value / samples : null]));
  map.carrierReachedRoundRate = map.rounds ? map.carrierReachedRounds / map.rounds : null;
  for (const type of types) { const value = map.purchaseToUse[type]; value.attribution = value.minPurchasedUsed === value.maxPurchasedUsed ? 'EXACT' : 'UNKNOWN：同類carry與new沒有instance標識'; value.minRate = value.purchased ? value.minPurchasedUsed / value.purchased : null; value.maxRate = value.purchased ? value.maxPurchasedUsed / value.purchased : null; }
}
const observe = rows => ({ status: rows.length ? 'OBSERVED' : 'NOT_TRIGGERED', physicalEpisodes: rows.length, matches: [...new Set(rows.map(row => row.matchId))], episodeKeys: [...new Set(rows.map(row => row.identity || `${row.matchId}/R${row.round}/${row.playerId}/${row.routeId}`))], phases: [...new Set(rows.map(row => row.phase).filter(Boolean))], actualRouteSignatures: [...new Set(rows.map(row => row.routeSignature).filter(Boolean))] });
const uiSelectorObservation = Object.fromEntries(ui.map(id => [id, observe(familyRows[id])]));
const tacticalFamilies = {
  Default: observe(routes.filter(row => row.side === 't' && !['f4', 'f8'].includes(row.actualSelectionId) && (row.actualSelectionId === 'f1' || row.actualTacticType === 'default') && ['route-control', 'default'].includes(row.kind))),
  Rush: observe(routes.filter(row => row.side === 't' && row.kind === 'rush-entry')),
  Split: observe(routes.filter(row => row.side === 't' && row.kind === 'split-mid')),
  Fake: observe(routes.filter(row => row.side === 't' && row.kind === 'fake-approach')),
  Execute: observe(routes.filter(row => row.side === 't' && row.kind === 'execute')),
  Lurk: observe(familyRows['role-lurk']),
  Rotate: observe(familyRows['intel-rotate']),
  Retake: observe(retakeSaveRows.filter(row => row.kind === 'retake' && row.motion.observed)),
  Save: observe(retakeSaveRows.filter(row => row.kind === 'save' && row.motion.observed)),
};
const additionalSelections = { Pick: uiSelectorObservation.f4, Eco: uiSelectorObservation.f8 };
const fakeRealRoutes = fakeEvents.flatMap(event => routes.filter(route => route.matchId === event.matchId && route.round === event.round && route.playerId === event.playerId && route.startSec >= event.event.roundSec && route.kind === 'execute').map(route => ({ fakeReachedEventId: event.event.id, ...route })));
tacticalFamilies.Fake.fakeReachedStatus = fakeEvents.length ? 'OBSERVED' : 'NOT_TRIGGERED';
tacticalFamilies.Fake.fakeReachedEvents = fakeEvents.length;
tacticalFamilies.Fake.subsequentRealExecuteStatus = fakeRealRoutes.length ? 'OBSERVED' : 'NOT_TRIGGERED';
tacticalFamilies.Fake.subsequentRealExecuteEpisodes = fakeRealRoutes.length;
const routeDifferences = Object.fromEntries(Object.keys(maps).map(mapKey => {
  const matching = routes.filter(row => row.mapKey === mapKey && row.side === 't');
  const byMatch = Object.fromEntries([...new Set(matching.map(row => row.matchId))].map(id => [id, [...new Set(matching.filter(row => row.matchId === id).map(row => `${row.role}/${row.phase}/${row.kind}/${row.routeSignature}`))].sort()]));
  const observedDistinctRouteSets = new Set(Object.values(byMatch).map(keys => JSON.stringify(keys))).size;
  const geometricByMatch = Object.fromEntries([...new Set(matching.map(row => row.matchId))].map(id => [id, [...new Set(matching.filter(row => row.matchId === id).map(row => `${row.role}/${row.phase}/${row.navigablePathSHA256}`))].sort()]));
  const observedDistinctNavigablePathSets = new Set(Object.values(geometricByMatch).map(keys => JSON.stringify(keys))).size;
  return [mapKey, { status: observedDistinctNavigablePathSets > 1 ? 'OBSERVED_DIFFERENCE' : 'NOT_TRIGGERED', observedDistinctRouteSets, observedDistinctNavigablePathSets, byMatch, geometricByMatch, method: 'Only physically navigated episodes; actual saved navigation waypoint geometry hashes compared separately from kind/intent labels. Start/end positions, distance, times and observed cursor advancement are preserved in physicalRouteEpisodes; a static changed kind alone is not geometric route evidence.' }];
}));
const complete = checkpoint.records.length === expected && reports.length === expected && checkpoint.records.every(record => record.result === 'MATCH_EXECUTION_PASS');
const coverageMissing = Object.entries(tacticalFamilies).filter(([, value]) => value.status !== 'OBSERVED').map(([id]) => id);
for (const id of ui) if (uiSelectorObservation[id].status !== 'OBSERVED') coverageMissing.push(`UI-${id}`);
if (!fakeEvents.length) coverageMissing.push('Fake-physical-arrival');
if (!fakeRealRoutes.length) coverageMissing.push('Fake-subsequent-real-execute');
const repeatedUnused = unused.filter(row => row.purchasedRounds > 1);
const objectivesMissing = Object.entries(maps).filter(([, map]) => !map.plants || !map.carrierReachedRounds).map(([id]) => id);
const concentrationReview = concentrationEpisodes.filter(row => row.metric === 'allTenCompactRadius20');
const retakeSave = Object.fromEntries(Object.keys(maps).map(mapKey => [mapKey, Object.fromEntries(['retake', 'save'].map(kind => {
  const rows = retakeSaveRows.filter(row => row.mapKey === mapKey && row.kind === kind);
  const physical = rows.filter(row => row.motion.observed);
  const uniqueActors = [...new Map(physical.map(row => [`${row.matchId}/${row.round}/${row.playerId}`, row])).values()];
  return [kind, { status: physical.length ? 'OBSERVED' : 'NOT_TRIGGERED', assignedEpisodes: rows.length, physicallyNavigatedEpisodes: physical.length, uniqueMatchRoundActors: uniqueActors.length, survivedActors: uniqueActors.filter(row => row.survived === true).length, diedActors: uniqueActors.filter(row => row.survived === false).length, unknownTerminalActors: uniqueActors.filter(row => typeof row.survived !== 'boolean').length, survivingEquipment: uniqueActors.filter(row => row.survived === true).map(row => ({ matchId: row.matchId, round: row.round, playerId: row.playerId, weapon: row.retainedWeapon, utility: row.retainedUtility, hp: row.terminalHP })) }];
}))]));
const assessment = {
  fullMatchExecution: complete ? 'PASS' : 'NOT_RUN：尚未完成要求的全矩陣',
  canonicalCausalSafety: errors.length ? 'PRODUCT_FAIL' : executionIssues.length || provenanceIssues.length ? 'INCOMPLETE：原生／來源守門未完成' : reports.length ? 'PASS' : 'NOT_RUN',
  objectiveObservation: objectivesMissing.length ? 'NOT_TRIGGERED' : reports.length ? 'OBSERVED' : 'NOT_RUN',
  tacticalPhysicalCoverage: coverageMissing.length ? 'NOT_TRIGGERED' : 'OBSERVED',
  concentration: concentrationReview.length ? 'OPEN_REVIEW：有真十人小半徑episode，需由開始位置與時間判讀' : '未觀察到十人半徑20集中',
  utilityPurchaseUse: repeatedUnused.length ? 'OPEN_REVIEW：具名反覆買入而全場未用' : reports.length ? 'PASS_RECORDED_PURCHASE_USE' : 'NOT_RUN',
  acceptance: errors.length ? 'PRODUCT_FAIL' : executionIssues.length ? 'HARNESS_FAIL' : provenanceIssues.length ? 'SOURCE_PROVENANCE_FAIL' : !complete ? 'NOT_RUN' : coverageMissing.length || objectivesMissing.length || repeatedUnused.length || concentrationReview.length ? 'OWNER_REVIEW_WITH_OPEN_ITEMS' : 'PASS',
};
if (checkpoint.syntheticOnly === true) { assessment.fullMatchExecution = 'SYNTHETIC_TOOL_GUARD_ONLY'; assessment.acceptance = 'SYNTHETIC_TOOL_GUARD_ONLY'; }
const validNative = ({ record }) => record.result === 'MATCH_EXECUTION_PASS' && record.shapeOK && (record.execution === 'REUSED_PASS' ? record.originNativeExitCode === 0 : record.nativeExitCode === 0);
const currentMatches = reports.filter(row => validNative(row) && row.audit.execution.sourceDomain.sha256 === checkpoint.baselineSourceDomain.sha256);
const equivalentMatches = reports.filter(row => validNative(row) && row.audit.execution.sourceDomain.sha256 !== checkpoint.baselineSourceDomain.sha256 && row.record.sourceEquivalence);
const executionAccounting = { newlyCompletedNativeThisRunner: currentMatches.filter(row => row.record.execution !== 'REUSED_PASS').length, previouslyCompletedCurrentSourceNative: currentMatches.filter(row => row.record.execution === 'REUSED_PASS').length, originalV9RendererEquivalentNative: equivalentMatches.length, aggregateCurrentSourceNative: currentMatches.length, aggregateValidatedOriginalSourceNative: equivalentMatches.length, preservedFailedAttempts: checkpoint.preservedFailedRecords?.length || 0, method: 'Counts unique successful scenario records by their actual original report source domain and original native exit; resumed current-source records are not called v9 aliases, renderer-equivalent original records retain old source/native.' };
const report = {
  schema: 'cs-gameplay-authenticity-acceptance.v1', checkpointPath, expectedFullMatches: expected, capturedFullMatches: reports.length, executionAccounting, sourceDomain: checkpoint.baselineSourceDomain,
  assessment, criteria: { outcomes: '安包數／到點率僅為真觀測，不寫死勝負、擊殺或安包率門檻；各圖至少非空安包與carrier到點才可宣稱已觀察該因果場景。', utility: '庫存守恆與合法purpose由每場native checks；購入後整場未投的反覆購入具名待審，死亡／無安全窗口不自動免除購買決策問題。', tactical: 'Owner九類為Default/Rush/Split/Fake/Execute/Lurk/Rotate/Retake/Save；七個UI selector另列，Pick/Eco不當Lurk/Rotate；需真phase selection與買後物理導航，配置與called不構成證據。', concentration: 'buy後且雙方至少3存活；正式node Voronoi同一key、最大pair距<=20、全10人與first-contact分開。合併Spawn等broadRegion不是物理集中。', limitations: '完整shot LOS全量、blind damage等不在本compact來源；此處first-contact採真shotCadenceTelemetry permission，未重新計算LOS，既有其他專項驗證由Owner交叉引用。手機FPS/觸控未經真機實測。' },
  maps, tacticalFamilies, uiSelectorObservation, additionalSelections, routeDifferences, phaseObservation: phaseRows, retakeSave, retakeSaveEpisodes: retakeSaveRows, noPlantTElimination, coverageMissing, objectivesMissing, causalErrors: errors, executionIssues, provenanceIssues, originalFailedAttempts: checkpoint.preservedFailedRecords ?? [], concentrationEpisodes, firstContacts, prePlantRotations: rotations, physicalRouteEpisodes: routes, fakeReachedEvents: fakeEvents, fakeSubsequentRealExecuteEpisodes: fakeRealRoutes,
  utility: { throwsByPurposeAndPosition: utilityThrows, neverUsedPurchasedByPlayerType: unused, repeatedPurchaseZeroUse: repeatedUnused, perRoundPurchaseZeroUse: perRoundUnused, noUseCounterMethod: reports[0]?.audit.utilityNoUseCounterMethod ?? 'UNKNOWN：未保存live counter' }, rounds: roundRows,
};
const percentage = value => value == null ? 'UNKNOWN' : `${(100 * value).toFixed(1)}%`;
const cell = value => String(value ?? 'UNKNOWN').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const lines = ['# CS Gameplay Authenticity 真對局驗收摘要', '', `判定：**${assessment.acceptance}**。完整對局 ${reports.length}/${expected}。本次續跑新完成 native ${executionAccounting.newlyCompletedNativeThisRunner}；既有當前來源 native ${executionAccounting.previouslyCompletedCurrentSourceNative}；v9 renderer等價原 native ${executionAccounting.originalV9RendererEquivalentNative}。合計當前來源真 native ${executionAccounting.aggregateCurrentSourceNative}＋等價原來源 ${executionAccounting.aggregateValidatedOriginalSourceNative}，歷史原失敗 ${executionAccounting.preservedFailedAttempts} 件完整保留。`, '', `來源 domain SHA256：\`${checkpoint.baselineSourceDomain?.sha256 ?? 'UNKNOWN'}\`。完整 case stdout/stderr/native/checkpoint 及原 report 路徑均由 JSON 索引；本工具沒有重跑模擬或讀取巨型 fixture。`, '', '| 地圖 | 對局／回合 | plant A/B | carrier到點回合 | A/B/Mid/Spawn 採樣比 |', '|---|---:|---:|---:|---|'];
for (const [id, map] of Object.entries(maps)) lines.push(`| ${id} | ${map.matches}/${map.rounds} | ${map.sites.a || 0}/${map.sites.b || 0} | ${map.carrierReachedRounds} (${percentage(map.carrierReachedRoundRate)}) | ${['A', 'B', 'Mid', 'Spawn'].map(key => `${key} ${percentage(map.regionFraction[key])}`).join('；')} |`);
lines.push('', '| 地圖 | 未plant且T全滅：carrier從未抵點 | 曾抵點但未plant | carrier身份未知 |', '|---|---:|---:|---:|');
for (const [id, map] of Object.entries(maps)) { const rows = noPlantTElimination.filter(row => row.mapKey === id); lines.push(`| ${id} | ${rows.filter(row => row.carrierEverReachedSite === false).length} | ${rows.filter(row => row.carrierEverReachedSite === true).length} | ${rows.filter(row => row.carrierEverReachedSite === 'UNKNOWN').length} |`); }
lines.push('', '以上分類附逐回合carrier身份、最低site距離、可觀測持包死亡鏈、全部T死亡時間／位置、首接觸與原source report索引於JSON；策略動機仍UNKNOWN，不把「T全滅」當成已完整證明策略不安包原因。');
lines.push('', '區域由正式 map.nodes 最近節點 Voronoi 派生；邊界為兩節點等距線，同距按 key 排序，A/B/Mid 分組明載原 compact。每回合 grid、真 first-contact 双方座標／距離／LOS、死亡、carrier、no-plant 終局事實與 CT rotate 秒數完整保留在摘要 JSON；策略動機不足時仍標 UNKNOWN。安包率是觀測，不是通過門檻。', '', '| 九類戰術 | 真物理觀測 | episodes | phases |', '|---|---|---:|---|');
for (const [id, value] of Object.entries(tacticalFamilies)) lines.push(`| ${id} | ${value.status} | ${value.physicalEpisodes} | ${cell(value.phases.join(', '))} |`);
lines.push('', 'Pick／Eco 另列為 UI 選擇；Lurk 依真角色路線，Rotate 依真情報轉點。', '', '| 額外選擇 | 真物理觀測 | episodes |', '|---|---|---:|');
for (const [id, value] of Object.entries(additionalSelections)) lines.push(`| ${id} | ${value.status} | ${value.physicalEpisodes} |`);
lines.push('', '| 真 UI selector | 真物理觀測 | episodes |', '|---|---|---:|');
for (const [id, value] of Object.entries(uiSelectorObservation)) lines.push(`| ${id} | ${value.status} | ${value.physicalEpisodes} |`);
lines.push('', '| 地圖 | retake/save | 真導航episode | 玩家回合 | 真存活／死亡／未知 |', '|---|---|---:|---:|---:|');
for (const [map, kinds] of Object.entries(retakeSave)) for (const [kind, value] of Object.entries(kinds)) lines.push(`| ${map} | ${kind} ${value.status} | ${value.physicallyNavigatedEpisodes} | ${value.uniqueMatchRoundActors} | ${value.survivedActors}/${value.diedActors}/${value.unknownTerminalActors} |`);
lines.push('', `因果錯誤 ${errors.length}；真十人半徑20集中 episodes ${concentrationReview.length}；fake 真抵達事件 ${fakeEvents.length}；真安包前 rotate episodes ${rotations.filter(row => row.physical).length}。Route 差異以實際 episode identity/signature、phase、角色與游標／買後位移保存；未觸發不造 outcome。`, '', '| 地圖 | 道具 | 真購入 | 真投擲 | 新購入使用歸因 |', '|---|---|---:|---:|---|');
for (const [id, map] of Object.entries(maps)) for (const type of types) { const value = map.purchaseToUse[type]; lines.push(`| ${id} | ${type} | ${map.utilityPurchased[type] || 0} | ${map.thrown[type] || 0} | ${value.attribution}: ${value.minPurchasedUsed}..${value.maxPurchasedUsed} (${percentage(value.minRate)}..${percentage(value.maxRate)}) |`); }
lines.push('', `全場購入但未用共 ${unused.length} 列，其中反覆購入 ${repeatedUnused.length} 列；保留每個 match/player/role/type/真購入次數及 live 原因，不以 dead 等理由自動宣稱正常。`, '', '| match | player／role | type | buy／rounds | 真 live 原因次數 | 判讀 |', '|---|---|---|---:|---|---|');
for (const row of unused) lines.push(`| ${cell(row.matchId)} | ${cell(`${row.playerId} ${row.name}/${row.role}`)} | ${row.type} | ${row.purchasedAcrossMatch}/${row.purchasedRounds} | ${cell(JSON.stringify(row.liveNoUseReasons))} | ${row.purchasedRounds > 1 ? 'OPEN_REVIEW' : '單回合未用，保留原因'} |`);
lines.push('', 'Live counter 是真 canonical onSkip 呼叫對各持有道具的累計觀測；不是秒數、唯一購入物件數或特定購入 instance 的使用歸因。Across-round unused inventory 是重複庫存採樣，不能當新買入數。Purpose 與實際投擲起訖位置、逐回合未用／死亡事實及所有具名開放項目見 JSON。', '', `驗收完整性：${assessment.fullMatchExecution}；因果：${assessment.canonicalCausalSafety}；戰術：${assessment.tacticalPhysicalCoverage}；Utility：${assessment.utilityPurchaseUse}。`, '', '手機實際 FPS、觸控手感與真機視覺體驗未實測。');
fs.mkdirSync(path.dirname(output), { recursive: true });
const jsonFd = fs.openSync(output + '.json', 'wx');
const summaryHash = createHash('sha256'); let summaryBytes = 0;
try { for (const json of fpsSimulationJSONChunks(report)) { const chunk = Buffer.from(json, 'utf8'); fs.writeSync(jsonFd, chunk); summaryHash.update(chunk); summaryBytes += chunk.length; } }
finally { fs.closeSync(jsonFd); }
fs.writeFileSync(output + '.manifest.json', JSON.stringify({ path: output + '.json', bytes: summaryBytes, sha256: summaryHash.digest('hex'), rawReportsRead: reports.length, rawReportsRetained: 0, newSimulationInvoked: false, serialization: 'top-level arrays streamed; report JSON byte-equivalent' }, null, 2), { flag: 'wx' });
fs.writeFileSync(output + '.md', lines.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ report: output + '.json', markdown: output + '.md', matches: reports.length, expected, assessment, causalErrors: errors.length, repeatedPurchaseZeroUse: repeatedUnused.length, tacticalCoverageMissing: coverageMissing }, null, 2));
