//  check_moba_skill_levels_v1.mjs — Hero Skill Level contract gate.
//  2026-10-07 moba-sim.v19（Tactical AI Phase 1）：契約由 HeroSkillLevel.v1（四招開場全開、R Lv9 升 2 級）
//  改為 HeroSkillLevel.v2：Lv1／2／3 依序解鎖基本技能、R 於 Lv6 解鎖並在 Lv11／Lv16 升級（上限 3）。
//  斷言比 v1 更嚴：逐級驗 1–18、100 名英雄（含天賦改變升級順序）R 在 Lv6 前恆為 0、metadata 覆寫、
//  引擎不放未解鎖技能、snapshot／Replay 標示 locked、v18 以前的 Replay（rank 恆 ≥ 1）照舊可播。
import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { compileGameplaySkill, toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { battleTalentOptions, selectBattleTalents } from '../src/battle/moba/talents/heroBattleTalents.js';
import { BattleEventTracker } from '../src/battle/battleEvents.js';
import { snapshotToBattleResult } from '../src/battle/battleResult.js';
import { beginReplayCapture, captureReplayFrame, finalizeReplay } from '../src/battle/moba/replay/replayBuffer.js';
import { createReplaySource } from '../src/battle/moba/replay/replayPresentationSource.js';
import { validateMobaReplay } from '../src/platform/contracts/mobaReplay.js';
import {
  HERO_SKILL_LEVEL_CONTRACT, skillLevelsAtMatchLevel, applySkillLevelToRule,
  skillLevelChanges, SKILL_LEVEL_CAPS, ULTIMATE_LEVELS, skillUpgradePriority, nextSkillUnlock,
} from '../src/battle/moba/skills/heroSkillLevels.js';

assert.equal(HERO_SKILL_LEVEL_CONTRACT, 'HeroSkillLevel.v2');
assert.deepEqual(SKILL_LEVEL_CAPS, { Q: 3, W: 3, E: 3, R: 3 });
assert.deepEqual([...ULTIMATE_LEVELS], [6, 11, 16]);

// ① 每條規則：rank 1 ＝ 原始規則、最終 rank 有成長、資料庫不被改動（400 條）
let covered = 0;
for (const hero of CHAMPIONS_100) for (const slot of ['Q', 'W', 'E', 'R']) {
  const base = compileGameplaySkill(hero.id, slot);
  const first = applySkillLevelToRule(base, 1);
  const last = applySkillLevelToRule(base, SKILL_LEVEL_CAPS[slot]);
  assert.deepEqual(first, base, `${hero.id}:${slot} rank 1 must preserve the authored rule`);
  assert.notDeepEqual(last, first, `${hero.id}:${slot} must grow at its final rank`);
  assert(skillLevelChanges(first, last).length > 0);
  assert.equal(base.cooldown, compileGameplaySkill(hero.id, slot).cooldown, 'canonical DB must stay unchanged');
  covered++;
}
assert.equal(covered, 400);

// ② 逐級等級表（中性升級順序 Q>W>E）
const expect = {
  1: { Q: 1, W: 0, E: 0, R: 0 }, 2: { Q: 1, W: 1, E: 0, R: 0 }, 3: { Q: 1, W: 1, E: 1, R: 0 },
  4: { Q: 2, W: 1, E: 1, R: 0 }, 5: { Q: 2, W: 2, E: 1, R: 0 }, 6: { Q: 2, W: 2, E: 1, R: 1 },
  7: { Q: 3, W: 2, E: 1, R: 1 }, 8: { Q: 3, W: 3, E: 1, R: 1 }, 9: { Q: 3, W: 3, E: 2, R: 1 },
  10: { Q: 3, W: 3, E: 3, R: 1 }, 11: { Q: 3, W: 3, E: 3, R: 2 }, 15: { Q: 3, W: 3, E: 3, R: 2 },
  16: { Q: 3, W: 3, E: 3, R: 3 }, 18: { Q: 3, W: 3, E: 3, R: 3 },
};
for (const [lv, ranks] of Object.entries(expect)) assert.deepEqual(skillLevelsAtMatchLevel(Number(lv), {}, null), ranks, `Lv${lv}`);

// ③ 100 名英雄 × 每個天賦（會改變升級順序）：Lv1 恰好一招、Lv3 三招、R 在 Lv6 前恆為 0、Lv6／11／16 為 1／2／3
let profiles = 0;
for (const hero of CHAMPIONS_100) {
  const rules = Object.fromEntries(['Q', 'W', 'E', 'R'].map((s) => [s, compileGameplaySkill(hero.id, s)]));
  for (const talentSlot of [null, 'Q', 'W', 'E']) {
    const at = (lv) => skillLevelsAtMatchLevel(lv, rules, talentSlot);
    const basics = (r) => ['Q', 'W', 'E'].filter((s) => r[s] >= 1).length;
    assert.equal(basics(at(1)), 1, `${hero.id} Lv1 exactly one basic`);
    assert.equal(at(1)[skillUpgradePriority(rules, talentSlot)[0]], 1, `${hero.id} Lv1 = top-priority skill`);
    assert.equal(basics(at(3)), 3, `${hero.id} Lv3 all basics`);
    for (let lv = 1; lv <= 5; lv++) assert.equal(at(lv).R, 0, `${hero.id} R locked at Lv${lv}`);
    assert.equal(at(6).R, 1); assert.equal(at(10).R, 1); assert.equal(at(11).R, 2); assert.equal(at(15).R, 2); assert.equal(at(16).R, 3);
    assert.equal(nextSkillUnlock(1, rules, talentSlot, 'R'), 6, `${hero.id} R unlock shown at Lv6`);
    profiles++;
  }
}
assert.equal(profiles, 400);

// ④ 特殊英雄 metadata 覆寫（保留給未來 R 一開始就能用的英雄）
const special = { R: { ...compileGameplaySkill('bingshuang', 'R'), unlockLevels: [1, 6, 11] } };
assert.equal(skillLevelsAtMatchLevel(1, special, null).R, 1);
assert.equal(skillLevelsAtMatchLevel(11, special, null).R, 3);

// ⑤ 引擎：同 seed 逐級升級可重現、事件數正確、BattleResult／Replay
const heroId = 'bingshuang';
const roster = { b1: { heroId }, r1: { heroId } };
const selected = selectBattleTalents(roster, { b1: battleTalentOptions(heroId)[1].id });
const config = toEngineHeroSkills(roster, selected);
const left = new LogicEngine(777), right = new LogicEngine(777);
left.configureHeroSkills(config); right.configureHeroSkills(config);
const tracker = new BattleEventTracker();
tracker.update(left.snapshot());
beginReplayCapture({ seed: 777, roster, config: { battleTalentIds: { b1: selected.players.b1.id } } });
captureReplayFrame(left.snapshot());
const lv1 = left.snapshot().players.find((p) => p.id === 'b1').heroSkills;
const locked1 = ['Q', 'W', 'E', 'R'].filter((s) => lv1[s].locked);
assert.equal(locked1.length, 3, 'Lv1: three of four skills locked in the snapshot');
assert(locked1.includes('R'));
for (const s of locked1) { assert.equal(lv1[s].ready, false); assert.equal(lv1[s].level.current, 0); }
assert.equal(lv1.R.level.nextAt, 6);
// 未解鎖的技能不能放：把 b1 放在敵人身邊、四招都冷卻完畢，只有已解鎖的那一招會進冷卻
{
  const e = new LogicEngine(5); e.configureHeroSkills(config);
  const b1 = e.players.find((p) => p.id === 'b1'), r1 = e.players.find((p) => p.id === 'r1');
  b1.pos = { x: 160, y: 160 }; r1.pos = { x: 162, y: 160 };
  e._heroSkillStep();
  const cast = ['Q', 'W', 'E', 'R'].filter((s) => (b1.heroSkillReadyAt[s] ?? 0) > e.t);
  assert(cast.every((s) => b1.heroSkillLevels[s] >= 1), `locked skill was cast: ${cast}`);
  assert(!cast.includes('R'), 'R must not be cast at Lv1');
}
for (const engine of [left, right]) {
  const player = engine.players.find((p) => p.id === 'b1');
  for (let matchLevel = 2; matchLevel <= 18; matchLevel++) { player.mlv = matchLevel; engine._updateHeroSkillLevels(player); }
}
assert.deepEqual(left.snapshot(), right.snapshot(), 'same-seed leveled snapshot must match');
const live = left.snapshot().players.find((p) => p.id === 'b1');
for (const s of ['Q', 'W', 'E', 'R']) { assert.equal(live.heroSkills[s].level.current, 3); assert.equal(live.heroSkills[s].locked, undefined); }
assert.equal(live.heroSkills.Q.level.next, null);
assert.deepEqual(left.heroSkills.b1, right.heroSkills.b1);
const rHist = left.players.find((p) => p.id === 'b1').heroSkillLevelHistory.filter((h) => h.slot === 'R');
assert.deepEqual(rHist.map((h) => [h.level, h.matchLevel]), [[1, 6], [2, 11], [3, 16]]);
const events = tracker.update(left.snapshot());
//  Lv2–Lv10 的 8 次基本技能（解鎖或升級）＋ R 的 3 次 ＝ 11
assert.equal(events.filter((event) => event.type === 'SKILL_LEVEL_UP').length, 11);
assert(events.every((event) => Number.isFinite(event.t)));
const result = snapshotToBattleResult({ ...left.snapshot(), over: true, winner: 'blue' }, events);
assert.deepEqual(result.players.find((p) => p.id === 'b1').heroSkillLevels, { Q: 3, W: 3, E: 3, R: 3 });
for (let i = 0; i < 5; i++) left.tick(0.5);
captureReplayFrame(left.snapshot());
const replay = finalizeReplay({ matchId: 'skill-level-v2', events });
assert.equal(validateMobaReplay(replay).ok, true);
assert.equal(replay.frames[0].sl[0].filter((row) => row[0] === 0).length, 3, 'Lv1 frame stores three rank-0 rows');
assert.equal(replay.frames.at(-1).sl[0][0][0], 3);
const source = createReplaySource(replay);
const atStart = source.getState().snapshot.players.find((p) => p.id === 'b1');
assert.equal(atStart.heroSkills.R.locked, true, 'replay shows R locked at Lv1');
assert.equal(atStart.heroSkills.R.ready, false);
source.seek(replay.duration);
const replayed = source.getState().snapshot.players.find((p) => p.id === 'b1');
assert.equal(replayed.heroSkills.Q.level.current, 3);
assert.deepEqual(replayed.heroSkills.Q.rule, left.snapshot().players.find((p) => p.id === 'b1').heroSkills.Q.rule);
const legacy = { ...replay, config: {}, frames: replay.frames.map(({ sl, ...frame }) => frame) };
const oldSource = createReplaySource(legacy);
assert.equal(oldSource.getState().snapshot.players.find((p) => p.id === 'b1').heroSkills, undefined);
console.log('Hero Skill Level v2: 400/400 rules / 400 schedules / locks / AI / same-seed snapshot / Replay PASS');
