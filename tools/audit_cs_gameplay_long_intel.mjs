#!/usr/bin/env node
// Existing compact reports only; no new simulation, no full-fixture duplication.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const run = arg('run'), output = arg('output');
assert.ok(run && output && !fs.existsSync(output), 'require unique --run and --output');
const checkpoint = JSON.parse(fs.readFileSync(run + '/checkpoint.json', 'utf8'));
const matches = checkpoint.records.map(record => {
  const bytes = fs.readFileSync(record.report);
  const audit = JSON.parse(bytes);
  const longContacts = audit.spatial.rounds.filter(row => row.firstShot?.distance >= 48).map(row => {
    const shot = row.firstShot, round = audit.rounds.find(round => round.round === row.round);
    const player = round.players[shot.attackerId];
    const dx = shot.targetPos.x - shot.attackerPos.x, dy = shot.targetPos.y - shot.attackerPos.y, d = Math.hypot(dx, dy);
    return { round: row.round, shot, firstIntel: round.firstIntel, actorInventory: { initial: player.initialInventory.smoke, purchased: player.utilityPurchased.smoke, carried: player.utilityCarried.smoke, thrown: player.used.smoke, terminalUnused: player.unused.smoke, noUseReasons: player.utilityNoUseReasons?.smoke ?? null }, projected14mCandidate: { x: shot.attackerPos.x + dx * 14 / d, y: shot.attackerPos.y + dy * 14 / d }, candidateStatus: 'GEOMETRIC_DIAGNOSTIC_ONLY：位於真射線上，不表示當時已選煙或煙已生成；無該tick所有煙／teamIntel明細，不能證明無覆蓋與同tick TTL前置成立' };
  });
  const pinata = audit.rounds.flatMap(round => {
    const shot = audit.spatial.rounds.find(row => row.round === round.round)?.firstShot;
    const position = shot?.positions.find(player => player.id === 't3');
    const player = round.players.t3;
    if (!shot || !position || !round.firstIntel || !player.utilityPurchased.smoke || player.used.smoke) return [];
    return [{ round: round.round, shotFrameSec: shot.frameSec, pinataAtContactPos: position.pos, pinataSide: position.side, firstIntel: round.firstIntel, distanceAcrossRecordedSamples: Math.hypot(position.pos.x - round.firstIntel.pos.x, position.pos.y - round.firstIntel.pos.y), purchased: player.utilityPurchased.smoke, thrown: player.used.smoke, liveNoUseReasons: player.utilityNoUseReasons?.smoke ?? null, deaths: round.kills.filter(kill => kill.victimId === 't3'), status: 'TEMPORAL_LIMIT：first-contact位置與firstIntel時間不一定同tick；距離只作跨採樣診斷，不直接宣稱當時helper輸入或該顆未用原因' }];
  });
  return { matchId: record.id, report: record.report, reportSHA256: createHash('sha256').update(bytes).digest('hex'), sourceDomain: audit.execution.sourceDomain, longContacts, pinataUnusedSmokeContext: pinata };
});
const source = fs.readFileSync('src/battle/fps/fpsBombObjectivePlanning.js', 'utf8');
const report = { schema: 'cs-long-intel-cutoff-diagnostic.v1', sourceDomainOfMatches: checkpoint.baselineSourceDomain, inspectedCurrentPlannerSHA256: createHash('sha256').update(source).digest('hex'), currentKnownFilter: source.split(/\r?\n/).filter(line => /const known =|distance\(player.pos,i.pos\)/.test(line)), findings: ['真first-shot LOS/permission與敵距>=48是可靠長線可見證據。當回合smoke庫存、購入／投擲與live counter是可靠對局事实。', '14m候選位於真敵射線內，只證明幾何遮線方向可由已觀察位置派生，不證明實際投擲／無已有覆蓋。', 'no-intel-outside-site-window是known在距離過濾後為null的分支名，不能反推原teamIntel為空。', 'Pinata所有逐shot與同tickteamIntel未保存在compact；不能把7次smoke全場未用全部斷言為48 cutoff，跨時間位置嚴格標診斷限制。'], matches };
fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, longContactCounts: matches.map(match => ({ match: match.matchId, count: match.longContacts.length, smokeStockNoThrow: match.longContacts.filter(row => row.actorInventory.initial > 0 && row.actorInventory.thrown === 0).length })) }, null, 2));
