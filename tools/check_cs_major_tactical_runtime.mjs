#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, createGunzip } from "node:zlib";
import { loadFpsMajorTestApi } from "./lib/fpsMajorTestApi.mjs";
import {planFpsBombRoute, fpsAssignTacticalDuties} from '../src/battle/fps/fpsBombObjectivePlanning.js';
import {hashFpsSimulationJson,writeFpsSimulationGzip} from './lib/fpsSimulationJsonStream.mjs';
import {inspectFpsMicroAwareness} from './lib/fpsMicroAwarenessAudit.mjs';
import {inspectFpsFrontWallDwell} from './lib/fpsFrontWallDwellAudit.mjs';

// C2–C4: canonical 真frame因果。固定三圖各一normal及一mirage fake；
// 不重跑 legacy/same-seed，不改結果。D只保存一份完整mirage原始sim。
let pass = 0, fail = 0;
const checks = [], reports = [];
const assertNoErrors = errors => assert.equal(errors.length, 0, errors.length ? `詳見report；首例=${JSON.stringify(errors[0])}` : "");
const ck = (name, fn) => { try { fn(); pass++; checks.push({ name, result: "PASS" }); console.log(`PASS ${name}`); } catch (error) { fail++; checks.push({ name, result: "FAIL", reason: error.message }); console.log(`FAIL ${name}: ${error.message}`); } };
const finite = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const key = (round, id) => `${round}:${id}`;
const source = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const sourceHash = createHash("sha256").update(source).update(fs.readFileSync("src/battle/fps/fpsTacticalCoordinator.js")).update(fs.readFileSync("src/battle/fps/fpsMajorUtilityRules.js")).update(fs.readFileSync('src/battle/fps/fpsBombObjectivePlanning.js')).digest("hex");
const api = await loadFpsMajorTestApi(source);
const fixturePath = process.env.ESMO_CS_RUNTIME_FIXTURE || "review/cs-major-upgrade/evidence/retention-policy-20261011/c-runtime-simulation-new-source.json.gz";
assert.ok(!fs.existsSync(fixturePath), `fixture已存在，不得覆寫：${fixturePath}`);
let fixtureMeta;

ck("canonical role選路依真target取正式庫，保留entry/lurk角色lane", () => {
  for (const mapKey of ["mirage", "dust2", "inferno"]) for (const target of ["a", "b"]) {
    const library = api.TACTICS_DB[mapKey].t;
    const expected = library.find(t => t.site === target), opposite = library.find(t => t.site !== target && ["a", "b"].includes(t.site));
    assert.ok(expected && opposite);
    for (const role of ["entry", "lurker"]) {
      const actor={...api.ROSTER.find(p=>p.side==='t'&&p.role===role),role,hasBomb:false,tacticalStage:'entry'};
      const planned=planFpsBombRoute({player:actor,players:api.ROSTER,tactic:opposite,library,target,phase:'opening',nodes:api.MAPS[mapKey].nodes});
      assert.deepEqual(planned.keys.slice(0,expected.routes[role].length),expected.routes[role]);
      assert.equal(planned.canAdvance,true);assert.equal(planned.keys.at(-1),target+'Site');
      assert.notEqual(planned.keys,expected.routes[role]);
    }
  }
});
ck("canonical相同角色lane切phase只換metadata，異線或中斷才真重建", () => {
  const match = source.match(/const keepRoleRoute=[^\n]+\n\s*if\(keepRoleRoute\)[^\n]+\n\s*else assignRoute[^\n]+/);
  assert.ok(match, "缺canonical游標保留接點，需重新精確擷取");
  const applyTransition = Function("p", "plan", "signature", "sceneVersion", "currentPhase", "sec", "assignRoute", match[0]);
  const signature = "tSpawn>apps>bSite";
  for (const kind of ["entry", "lurk"]) {
    const original = { _routePlan: { routeId: "already-moving", kind, routeSignature: signature, phase: "opening", objective: kind }, routeIdx: 2, routeT: .8, route: [{ x: 50, y: 90 }, { x: 20, y: 60 }, { x: 26, y: 26 }] };
    const plan = { kind, objective: kind, points: original.route };
    const retained = structuredClone(original); let calls = 0;
    applyTransition(retained, plan, signature, "major.v1", "mid-round", 26, () => calls++);
    assert.equal(calls, 0); assert.equal(retained.routeIdx, 2); assert.equal(retained.routeT, .8);
    assert.equal(retained._routePlan.routeId, "already-moving"); assert.equal(retained._routePlan.phase, "mid-round");
    assert.deepEqual(retained.route, original.route);
    for (const change of [{ version: "legacy" }, { actor: { _coordinatorKind: "trade" } }, { signature: "tSpawn>ramp>aSite" }, { kind: "site-execute" }]) {
      const actor = { ...structuredClone(original), ...change.actor }; let assignment;
      applyTransition(actor, { ...plan, kind: change.kind || kind }, change.signature || signature, change.version || "major.v1", "mid-round", 26, (_actor, points, meta) => { assignment = { points, meta }; });
      assert.ok(assignment); assert.deepEqual(assignment.points, plan.points);
      assert.equal(assignment.meta.routeRebuildReason, "phase-transition"); assert.equal(assignment.meta.roundSec, 26);
    }
  }
});

function inspect(result, mapKey, scenario) {
  const map = api.MAPS[mapKey], walls = api.c5a2SolidObstacles(map);
  const errors = { intel: [], intent: [], route: [], role: [], crossfire: [], metrics: [], economy: [], fake: [] };
  const samples = { closestFakeApproach: null, save: [] };
  const stats = { intel: 0, freshIntel: 0, memoryIntel: 0, knownIntents: 0, teamIntents: 0, blindIntents: 0, retreatRoutes: 0, retreatMoves: 0, tradeIntents: 0, tradeRoutes: 0, tradeMoves: 0, saveRoutes: 0, saveMoves: 0, saveSurvivors: 0, entryMoves: 0, lurkMoves: 0, missingLurkerRounds: 0, crossfireGroups: 0, crossfireArrivals: 0, trades: 0, clutchStarts: 0, clutchesWon: 0, fakeApproaches: 0, fakeReached: 0, fakeRealRoutes: 0, fakeRealMoves: 0, halftimeBuyRounds: 0 };
  const note = (field, detail) => { if (errors[field].length < 12) errors[field].push(detail); };
  const rounds = new Map(), cumulativeDamage = new Map(), kastRounds = new Map(), saved = new Set(), arrivedCrossfire = new Set(), checkedCrossfireRoutes = new Set();
  let previous = null;
  for (const frame of result.frames) {
    let record = rounds.get(frame.rnd);
    if (!record) { record = { first: frame, last: frame, kills: [], trades: [], clutchStarts: [] }; rounds.set(frame.rnd, record); }
    record.last = frame;
    const sameRound = previous?.rnd === frame.rnd;
    const prevPlayers = new Map((sameRound ? previous.players : []).map(p => [p.id, p]));
    const players = new Map(frame.players.map(p => [p.id, p]));
    const intel = frame.teamIntel || [];
    for (const item of intel) {
      stats.intel++;
      const observer = players.get(item.observerId), target = players.get(item.targetId), age = frame.roundSec - item.observedAtSec;
      if (!finite(item.pos) || !finite(item.observerPos) || !observer || !target || observer.side !== item.side || target.side === item.side || age < 0 || age > 3) note("intel", { fi: frame.fi, issue: "情報身份/TTL/座標", item });
      if (age === 0) {
        stats.freshIntel++;
        if (api.lineBlocked(item.observerPos, item.pos, walls) || (prevPlayers.get(item.observerId)?.blindSec || 0) > 0) note("intel", { fi: frame.fi, issue: "新情報穿牆或致盲者觀測", item });
      } else {
        stats.memoryIntel++;
        const prior = sameRound && previous.teamIntel.find(i => i.side === item.side && i.targetId === item.targetId && i.observedAtSec === item.observedAtSec);
        if (!prior || prior.observerId !== item.observerId || distance(prior.pos, item.pos) > 1e-9) note("intel", { fi: frame.fi, issue: "memory沒有歷史觀測来源", item });
      }
    }
    const aliveIds = new Set((sameRound ? previous.players : frame.players).filter(p => !p.dead).map(p => p.id));
    for (const event of frame.events || []) {
      if (event.type === "kill") {
        record.kills.push(event); aliveIds.delete(event.victimId);
        if (!players.has(event.victimId) || !players.has(event.killerId) || !Number.isFinite(event.roundSec) || event.killerSide === event.victimSide) note("metrics", { fi: frame.fi, issue: "kill權威身份/時間", event });
      }
      if (event.type === "trade") {
        stats.trades++; record.trades.push(event);
        const loss = record.kills.find(k => k.victimId === event.tradedPlayerId && k.roundSec === event.deathAtSec);
        const revenge = record.kills.find(k => k.killerId === event.playerId && k.victimId === event.victimId && k.roundSec === event.roundSec);
        if (!loss || !revenge || loss.killerId !== revenge.victimId || revenge.killerSide !== loss.victimSide || event.roundSec <= event.deathAtSec || event.roundSec - event.deathAtSec > 5) note("metrics", { fi: frame.fi, issue: "trade沒有合法五秒報仇鏈", event });
      }
      if (event.type === "clutch-start") {
        stats.clutchStarts++; record.clutchStarts.push(event);
        const actor = players.get(event.playerId), survivors = frame.players.filter(p => aliveIds.has(p.id) && p.side === actor?.side), opponents = frame.players.filter(p => aliveIds.has(p.id) && p.side !== actor?.side);
        if (!actor || survivors.length !== 1 || survivors[0].id !== event.playerId || opponents.length !== event.opponentCount || !opponents.length || event.startedAtSec !== event.roundSec) note("metrics", { fi: frame.fi, issue: "clutch並非真1vN", event, alive: [...aliveIds] });
      }
      if (event.type === "clutch") stats.clutchesWon++;
      if (event.type === "fake-reached") {
        stats.fakeReached++;
        const actor = players.get(event.playerId);
        const oppositeSite = event.target === "a" ? "b" : "a", oppositeRoute = api.TACTICS_DB[mapKey].t.find(t => t.site === oppositeSite)?.routes.entry, expectedKey = oppositeRoute?.at(-2), expectedGoal = map.nodes[expectedKey];
        if (!actor || !finite(event.pos) || !finite(event.fakeGoal) || !expectedGoal || distance(event.pos, event.fakeGoal) >= 6 || actor.fakeStage !== "complete" || actor.fakeReachedAtSec !== event.roundSec || event.fakeNodeKey !== expectedKey || actor.fakeNodeKey !== expectedKey || event.fakeSite !== oppositeSite || distance(event.fakeGoal, expectedGoal) > 1e-9) note("fake", { fi: frame.fi, issue: "fake沒有先到真相反入口施壓節點", event, expectedKey, expectedGoal });
      }
    }
    for (const actor of frame.players) {
      const before = prevPlayers.get(actor.id), intent = actor.tacticalIntent, plan = actor._routePlan;
      if (!actor.dead && !frame.buyP) {
        if (!intent || intent.roundSec !== frame.roundSec) note("intent", { fi: frame.fi, playerId: actor.id, issue: "活人缺本tick決策" });
        if (intent?.targetId) {
          stats.knownIntents++; if (intent.source === "team-intel") stats.teamIntents++;
          const item = intel.find(i => i.side === actor.side && i.targetId === intent.targetId && i.observedAtSec === intent.observedAtSec);
          if (!item || !finite(intent.aim) || distance(intent.aim, item.pos) > 1e-9 || (intent.source === "visible" && (item.observerId !== actor.id || item.observedAtSec !== frame.roundSec))) note("intent", { fi: frame.fi, playerId: actor.id, issue: "決策使用無來源或未觀測對手", intent });
          if ((before?.blindSec || 0) > 0) { stats.blindIntents++; if (intent.source === "visible") note("intent", { fi: frame.fi, playerId: actor.id, issue: "致盲者讀取新自有視線" }); }
        } else if (intent?.aim || intent?.source !== "none") note("intent", { fi: frame.fi, playerId: actor.id, issue: "無情報仍有瞄準", intent });
        if (intent?.kind === "trade") {
          stats.tradeIntents++;
          const loss = record.kills.find(k => k.victimSide === actor.side && k.victimId !== actor.id && k.killerId === intent.targetId && frame.roundSec >= k.roundSec && frame.roundSec - k.roundSec <= 5);
          if (!loss || !finite(intent.routeTarget) || distance(intent.routeTarget, intent.aim) > 1e-9) note("intent", { fi: frame.fi, playerId: actor.id, issue: "trade決策無真隊友死亡/有限情報鏈", intent });
        }
      }
      if (!actor.routePoints?.length || !actor.routePoints.every(finite)) note("route", { fi: frame.fi, playerId: actor.id, issue: "路線缺失或非有限" });
      const moved = before && !before.dead && !actor.dead && before._routePlan?.routeId === plan?.routeId && distance(before.pos, actor.pos) > .05;
      if (moved) {
        if (actor.tacticalDuty?.attackDuty === "entry"&&actor.side==='t') stats.entryMoves++;
        if (actor.tacticalDuty?.attackDuty === "flank"&&actor.side==='t') stats.lurkMoves++;
        if (plan.kind === "retreat") stats.retreatMoves++;
        if (plan.kind === "trade") stats.tradeMoves++;
        if (plan.kind === "save") stats.saveMoves++;
      }
      if (["retreat", "trade", "save"].includes(plan?.kind) && plan.roundSec === frame.roundSec) {
        if (plan.kind === "retreat") stats.retreatRoutes++;
        if (plan.kind === "trade") stats.tradeRoutes++;
        if (plan.kind === "save") stats.saveRoutes++;
        if (plan.kind === "save") saved.add(key(frame.rnd, actor.id));
        if (plan.kind === "save" && samples.save.length < 12) samples.save.push({ fi: frame.fi, rnd: frame.rnd, playerId: actor.id, pos: actor.pos, bombPos: frame.c4pos, bombTimeRemainingSec: frame.bombTimeRemainingSec, focus: actor.stats?.foc, decision: actor.stats?.dec, gun: actor.gun, routePoints: actor.routePoints, intent });
        const end = actor.routePoints.at(-1);
        const expectedEnd = finite(intent?.routeTarget) ? api.buildNavigableRoute([actor.routePoints[0], intent.routeTarget], walls, api.PLAYER_R, new Map()).at(-1) : null;
        if (!expectedEnd || intent.kind !== plan.kind || Math.abs(end.x - expectedEnd.x) > .001 || Math.abs(end.y - expectedEnd.y) > .001 || plan.informationSource !== intent.source || plan.targetId !== intent.targetId || plan.observedAtSec !== intent.observedAtSec) note("route", { fi: frame.fi, playerId: actor.id, issue: "決策→canonical導航終點接點不一致", rawTarget: intent?.routeTarget, end, expectedEnd, intent, plan });
        if (plan.kind === "save" && distance(end, map.spawns.ct) > .01) note("route", { fi: frame.fi, playerId: actor.id, issue: "save不是向出生點真導航" });
      }
      if (plan?.kind === "post-plant-cover") {
        const end = actor.routePoints.at(-1), matchedEntry = Object.entries(map.nodes).find(([, n]) => distance(n, end) < .01);
        const site = map.nodes[`${frame.target}Site`];
        // The corrected product design allocates existing nearby lanes within
        // 32 units. Verify exact authored-node eligibility, not rounded frames.
        const eligible = matchedEntry && site && !matchedEntry[0].endsWith("Spawn") && distance(matchedEntry[1], site) > 4 && distance(matchedEntry[1], site) <= 32;
        if (!checkedCrossfireRoutes.has(plan.routeId)) {
          checkedCrossfireRoutes.add(plan.routeId);
          if (!eligible || api.blocked(end, walls, api.PLAYER_R - .005) || !api.buildNavigableRoute([actor.pos, end], walls, api.PLAYER_R, new Map()).length) note("crossfire", { fi: frame.fi, playerId: actor.id, issue: "crossfire不是4<距包點<=32的正式合法可達節點", nodeKey: matchedEntry?.[0], site, end });
        }
        if (!actor.dead && distance(actor.pos, end) < 3 && !arrivedCrossfire.has(key(frame.rnd, actor.id))) { arrivedCrossfire.add(key(frame.rnd, actor.id)); stats.crossfireArrivals++; }
      }
      if (actor.fakeStage === "approach") {
        stats.fakeApproaches++;
        if (finite(actor.fakeGoal)) {
          const distanceToGoal = distance(actor.pos, actor.fakeGoal);
          if (!samples.closestFakeApproach || distanceToGoal < samples.closestFakeApproach.distanceToGoal) samples.closestFakeApproach = { fi: frame.fi, rnd: frame.rnd, playerId: actor.id, distanceToGoal, pos: actor.pos, fakeGoal: actor.fakeGoal, fakeNodeKey: actor.fakeNodeKey, routeKind: plan?.kind, routeEnd: actor.routePoints.at(-1), dead: actor.dead };
        }
        if (frame.planted && actor.hasBomb) note("fake", { fi: frame.fi, playerId: actor.id, issue: "尚未到假攻點已plant" });
        if (plan?.kind === "site-execute" || actor.fakeReachedAtSec != null) note("fake", { fi: frame.fi, playerId: actor.id, issue: "未到假攻點先轉真攻" });
      }
      if (actor.fakeStage === "complete" && plan?.kind !== "fake-approach" && actor.fakeReachedAtSec <= frame.roundSec && distance(actor.routePoints.at(-1), map.nodes[`${frame.target}Site`]) < .01) {
        stats.fakeRealRoutes++; if (moved) stats.fakeRealMoves++;
      }
    }
    if (frame.roundSec === 0) {
      const entry = frame.players.find(p => p.side === "t" && p.tacticalDuty?.attackDuty === "entry"), lurker = frame.players.find(p => p.side === "t" && p.tacticalDuty?.attackDuty === "flank");
      if (!lurker) stats.missingLurkerRounds++;
      if (scenario === "normal" && ((!entry||!lurker)||(entry&&lurker&&entry._routePlan.routeSignature===lurker._routePlan.routeSignature))) note("role", {fi:frame.fi,issue:"真突破／側翼責任或不同路線缺失"});
      if (scenario === "normal") for (const actor of [entry, lurker].filter(Boolean)) {
        const library = api.TACTICS_DB[mapKey].t, selected = library.find(t => t.id === actor._activeTacticId);
        const actualTargetTactic = selected?.site === frame.target ? selected : library.find(t => t.site === frame.target) || selected;
        const keys=actor._routePlan?.routeSignature?.split('>')||[];
        const duty=fpsAssignTacticalDuties({players:frame.players})[actor.id];
        if(!selected||!actualTargetTactic||!keys.length||keys.some(key=>!api.MAPS[mapKey].nodes[key])||duty?.attackDuty!==actor.tacticalDuty?.attackDuty)note('role',{fi:frame.fi,playerId:actor.id,issue:'真責任／正式戰術／合法node來源缺失',keys,actualPlan:actor._routePlan});
      }
    }
    const cover = frame.players.filter(p => !p.dead && p.side === "t" && p._routePlan?.kind === "post-plant-cover");
    if (cover.length >= 2) {
      stats.crossfireGroups++;
      const ends = cover.map(p => p.routePoints.at(-1));
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) if (distance(ends[i], ends[j]) < 1) note("crossfire", { fi: frame.fi, issue: "兩名crossfire共用anchor", actors: [cover[i].id, cover[j].id], ends: [ends[i], ends[j]] });
    }
    previous = frame;
  }
  for (const [roundIndex, record] of rounds) {
    const history = result.roundHist[roundIndex], rows = history.roundStats;
    if (!rows || rows.length !== 10) { note("metrics", { roundIndex, issue: "roundStats不完整" }); continue; }
    for (const row of rows) {
      const expectedTraded = record.kills.some(loss => loss.victimId === row.id && record.kills.some(revenge => revenge.victimId === loss.killerId && revenge.killerSide === loss.victimSide && revenge.roundSec > loss.roundSec && revenge.roundSec - loss.roundSec <= 5));
      const actor = record.last.players.find(p => p.id === row.id), total = (cumulativeDamage.get(row.id) || 0) + row.dmg;
      cumulativeDamage.set(row.id, total); kastRounds.set(row.id, (kastRounds.get(row.id) || 0) + Number(row.k > 0 || row.a > 0 || row.survived || expectedTraded));
      if (!actor || row.traded !== expectedTraded || row.survived !== !actor.dead || row.adr !== Math.round(total / (roundIndex + 1)) || row.utilDmg < 0 || row.utilDmg > row.dmg) note("metrics", { roundIndex, playerId: row.id, issue: "trade/survival/累計ADR/utilDmg", row });
      if (row.clutch && (!row.survived || actor.teamId !== history.winnerTeam || !record.clutchStarts.some(e => e.playerId === row.id))) note("metrics", { roundIndex, playerId: row.id, issue: "clutch勝者無真1vN開始" });
      if (saved.has(key(roundIndex, row.id)) && row.survived) { stats.saveSurvivors++; if (!actor.gun || !(actor.ammo >= 0)) note("metrics", { roundIndex, playerId: row.id, issue: "save存活沒有真裝備" }); }
    }
    const buy = result.buyAudit.rounds[roundIndex], meta = record.first.roundStart;
    for (const side of ["t", "ct"]) {
      const roster = buy.players.filter(p => p.side === side), avg = roster.reduce((sum, p) => sum + p.startMoney, 0) / roster.length, teamId = roster[0].teamId;
      const ownScore = teamId === "us" ? buy.score.t : buy.score.ct, enemyScore = teamId === "us" ? buy.score.ct : buy.score.t;
      const expected = meta.pistolRound ? "pistol" : avg >= 4200 ? "full" : avg < 2200 ? "eco" : enemyScore - ownScore >= 2 && avg >= 2700 ? "force" : avg >= 3700 ? "full" : "eco";
      if (roster.length !== 5 || roster.some(p => p.teamId !== teamId || p.buyType !== expected) || buy.buyTypeByTeam[teamId] !== expected) note("economy", { roundIndex, side, teamId, ownScore, enemyScore, avg, expected, actual: buy.buyTypeByTeam[teamId] });
      if (meta.half === "second") stats.halftimeBuyRounds++;
    }
  }
  for (const actor of result.players) if (actor.adr !== Math.round((cumulativeDamage.get(actor.id) || 0) / result.rounds) || actor.kast !== Math.round((kastRounds.get(actor.id) || 0) / result.rounds * 100)) note("metrics", { playerId: actor.id, issue: "賽後ADR/KAST不由真回合彙總", actor });
  return { mapKey, scenario, seed: 505001, completed: result.completed, frames: result.frames.length, stats, errors, samples, microAwareness:inspectFpsMicroAwareness(result,api,mapKey),frontWallDwell:inspectFpsFrontWallDwell(result,api,mapKey) };
}

for (const mapKey of Object.keys(api.MAPS)) {
  console.log(`RUN ${mapKey} C2–C4 normal canonical`);
  const result = api.simulateFps(mapKey, api.TACTICS_DB[mapKey].t[0], api.TACTICS_DB[mapKey].ct[0], 505001, api.ROSTER, { postPlantMode: "crossfire" }, "major.v1");
  if (mapKey === "mirage") {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    const {jsonBytes,jsonSHA,fields} = await writeFpsSimulationGzip(result,fixturePath);
    const hash = createHash("sha256"); for await (const chunk of fs.createReadStream(fixturePath).pipe(createGunzip())) hash.update(chunk);
    const decompressedSHA = hash.digest("hex");
    fixtureMeta = { path: fixturePath, sourceHash, jsonBytes, jsonSHA, fields, gzipBytes: fs.statSync(fixturePath).size, gzipSHA: createHash("sha256").update(fs.readFileSync(fixturePath)).digest("hex"), decompressedSHA, verified: jsonSHA === decompressedSHA };
    console.log(`FIXTURE ${JSON.stringify(fixtureMeta)}`);
  }
  const report = inspect(result, mapKey, "normal"); reports.push(report);
  ck(`${mapKey} 真完成且無穿牆/瞬移/非有限位置`, () => { assert.equal(result.completed, true); assert.ok(result.frames.length > 0); for (const field of ["blockedPositions", "wallSegmentCrossings", "nonFinitePositions", "teleportViolations"]) assert.equal(result.movementAudit[field], 0); });
  ck(`${mapKey} 非空teamIntel真LOS來源與TTL`, () => { assert.ok(report.stats.freshIntel > 0); assertNoErrors(report.errors.intel); });
  ck(`${mapKey} 非空決策只讀真intel，致盲不生新視線`, () => { assert.ok(report.stats.knownIntents > 0); assertNoErrors(report.errors.intent); });
  ck(`${mapKey} 真路線/位置與coordinator意圖接點`, () => { assertNoErrors(report.errors.route); assert.ok(report.stats.entryMoves + report.stats.lurkMoves > 0); });
  ck(`${mapKey} 既存entry/lurk分路且真移動非空`, () => { assertNoErrors(report.errors.role); assert.ok(report.stats.entryMoves > 0 && report.stats.lurkMoves > 0); });
  ck(`${mapKey} 既有crossfire端點合法可達且不共anchor`, () => assertNoErrors(report.errors.crossfire));
  ck(`${mapKey} 真kill/trade/clutch與累計ADR/KAST/utilDmg`, () => { assert.ok(result.roundHist.length > 0); assertNoErrors(report.errors.metrics); });
  ck(`${mapKey} 真購買讀自己stable team比分與金額`, () => { assert.ok(result.buyAudit.rounds.length > 0); assertNoErrors(report.errors.economy); });
  if (report.stats.missingLurkerRounds) console.log(`SKIP ${mapKey} ${report.stats.missingLurkerRounds}回合實際roster無lurker，未列為該回合lurk覆蓋`);
  for (const [name, count] of Object.entries(report.stats)) if (count === 0) console.log(`SKIP ${mapKey} ${name}情境未觸發，未列該情境PASS`);
  console.log(`DIAGNOSTIC ${mapKey} ${JSON.stringify(report.stats)}`);
  console.log(`MICRO_COVERAGE ${mapKey} ${JSON.stringify({counts:report.microAwareness.counts,peekStatuses:report.microAwareness.peekStatuses,issues:report.microAwareness.issues.length,assessment:report.microAwareness.assessment})}`);
  console.log(`FRONT_WALL_DWELL ${mapKey} ${JSON.stringify({blockedIdleSamples:report.frontWallDwell.blockedIdleSamples,longUnexplainedCount:report.frontWallDwell.longUnexplainedCount,maxUnexplainedSec:report.frontWallDwell.maxUnexplainedSec,coverage:report.frontWallDwell.coverage,assessment:report.frontWallDwell.assessment})}`);
}
console.log("RUN mirage C3 fake canonical（必要新增情境一份）");
const fake = api.simulateFps("mirage", api.TACTICS_DB.mirage.t[0], api.TACTICS_DB.mirage.ct[0], 505001, api.ROSTER, { postPlantMode: "crossfire", phases: { opening: "f6" } }, "major.v1");
const fakeReport = inspect(fake, "mirage", "fake"); reports.push(fakeReport);
ck("fake真到相反入口施壓節點前不先轉真攻", () => { assert.equal(fake.completed, true); assert.ok(fakeReport.stats.fakeApproaches > 0 && fakeReport.stats.fakeReached > 0); assertNoErrors(fakeReport.errors.fake); });
ck("fake到點事件後有通往真包點路線與實際轉場", () => { assert.ok(fakeReport.stats.fakeRealRoutes > 0 && fakeReport.stats.fakeRealMoves > 0); assert.equal(fake.movementAudit.wallSegmentCrossings, 0); assert.equal(fake.movementAudit.teleportViolations, 0); });
if (!reports.some(r => r.stats.saveRoutes > 0 && r.stats.saveMoves > 0 && r.stats.saveSurvivors > 0)) {
  console.log("RUN mirage save合法對照：同seed/A攻方/CT B堆點/注入敵隊foc=1 dec=1，不指定結果");
  const roster = api.ROSTER.map(p => p.side === "ct" ? { ...p, stats: { ...p.stats, foc: 1, dec: 1 } } : { ...p });
  const ctBStack = api.TACTICS_DB.mirage.ct.find(t => t.id === "c_bstack"); assert.ok(ctBStack);
  const contrast = api.simulateFps("mirage", api.TACTICS_DB.mirage.t[0], ctBStack, 505001, roster, { postPlantMode: "crossfire" }, "major.v1");
  const report = inspect(contrast, "mirage", "save-contrast-low-focus-ct-b-stack");
  report.config = { seed: 505001, tacticT: api.TACTICS_DB.mirage.t[0].id, tacticCT: ctBStack.id, injectedEnemyStats: { foc: 1, dec: 1 }, outcomeAuthority: "canonical" }; reports.push(report);
  console.log(`DIAGNOSTIC save-contrast ${JSON.stringify(report.stats)}`);
}
ck("三圖合計intel→撤退路線→實際位移非空", () => { assert.ok(reports.some(r => r.stats.teamIntents > 0)); assert.ok(reports.some(r => r.stats.retreatRoutes > 0 && r.stats.retreatMoves > 0)); });
ck("三圖合計crossfire不同anchor且有人真到點", () => { assert.ok(reports.some(r => r.stats.crossfireGroups > 0 && r.stats.crossfireArrivals > 0)); });
ck("正常三圖或具名對照save真導航且有真存活保槍", () => { assert.ok(reports.some(r => r.stats.saveRoutes > 0 && r.stats.saveMoves > 0 && r.stats.saveSurvivors > 0)); for (const report of reports) { assert.equal(report.completed, true); assertNoErrors(report.errors.route); assertNoErrors(report.errors.metrics); } });
ck("三圖合計真trade決策/導航/報仇與clutch/換邊非空", () => { assert.ok(reports.some(r => r.stats.tradeIntents > 0 && r.stats.tradeRoutes > 0 && r.stats.tradeMoves > 0 && r.stats.trades > 0)); assert.ok(reports.some(r => r.stats.clutchStarts > 0)); assert.ok(reports.some(r => r.stats.halftimeBuyRounds > 0)); });
ck("D唯一完整保存幀fixture gzip解壓SHA相同", () => { assert.ok(fixtureMeta?.verified); assert.ok(fixtureMeta.gzipBytes > 0); assert.equal(fixtureMeta.sourceHash, sourceHash); });
ck("最新mirage同seed完整simulation SHA決定性", () => {
  const repeat = api.simulateFps("mirage", api.TACTICS_DB.mirage.t[0], api.TACTICS_DB.mirage.ct[0], 505001, api.ROSTER, { postPlantMode: "crossfire" }, "major.v1");
  assert.equal(hashFpsSimulationJson(repeat), fixtureMeta.jsonSHA);
});
const reportPath = process.env.ESMO_CS_TACTICAL_REPORT;
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify({ schema: "cs-major-tactical-runtime.v1", sourceHash, pass, fail, checks, fixturePath, fixtureMeta, reports }, null, 2));
console.log(`CS Major Tactical Runtime C2-C4: ${pass}/${pass + fail} PASS`);
if (fail) process.exitCode = 1;
