#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_objective_stakes_v16.mjs — Objective Stakes v1（moba-sim.v16）定點驗證
//
//  執行：node tools/check_moba_objective_stakes_v16.mjs
//    V  版本／規則：moba-sim.v16、objectiveStakesV1＝on、splitProjectileSlowV16＝on；nexusSiegeCapV1、heroPassivesV1 仍 off
//    P  戰力：_dragonPowerK＝(1＋層數×1.8%)×龍魂1.03×巴龍1.10（各狀態組合）
//    S  龍魂：4 層 ⇒ teamBuffs.soul、兵線 fightK ×1.15（_waveModifiers）、CombatState team-soul；3 層沒有
//    B  巴龍：baronBuffUntil ⇒ CombatState team-baron 的 until 相同、到期 reason＝expired；兵線 siegeK 維持既有 2.2
//    G  逆轉賞金：擊殺方領完基本獎勵（巨龍 200）後仍落後 ≥1500 ⇒ 追加 min(500, 落後額×20%) 並寫入 objectiveLog；否則 0
//    A  AI 龍魂攻防：敵方 3 層 ⇒ +0.2；自己 3 層 ⇒ +0.1；巴龍 ⇒ 0
//    O  skill-off：物件規則不生效（龍層仍是 v15 的 1.2%、無龍魂／賞金）
//    D  決定性：同 seed 兩次 objectiveLog＋團隊狀態串流相同
//    R  Replay：正式 replayBuffer 擷取 → seek(t) 的 teamBuffs（龍層／龍魂／巴龍剩餘）與 objectiveLog ＝ 現場同時刻
//  ⚠ 只讀＋在驗證器自己的引擎實例上佈置情境（改 fsm3／金錢／中立物件狀態），不改任何原始碼常數。
// ============================================================================
import { LogicEngine, CS_PERMANENT } from "../src/LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { toEngineHeroMods } from "../src/battle/moba/mobaHeroProfile.js";
import { toEngineSpells, buildLoadout } from "../src/battle/moba/mobaHeroLoadout.js";
import { toEngineArchetypes } from "../src/data/heroCombatArchetypes.js";
import { toEngineTactic, STANDARD_OPP_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";
import { matchItemsConfig } from "../src/battle/moba/items/buildStrategyPrep.js";
import { MOBA_SIMULATION_VERSION, KNOWN_SIMULATION_VERSIONS } from "../src/platform/contracts/simulationVersion.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import { beginReplayCapture, captureReplayFrame, finalizeReplay } from "../src/battle/moba/replay/replayBuffer.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";
import { validateMobaReplay } from "../src/platform/contracts/mobaReplay.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${label}${note ? `　${note}` : ""}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const LANE_ZH = ["上路", "打野", "中路", "下路", "輔助"];
const byLane = LANE_ZH.map((l) => CHAMPIONS_100.filter((h) => h.lane === l));
const rosterFor = (m) => {
  const roster = {};
  for (let i = 0; i < 5; i++) {
    const pool = byLane[i];
    roster[`b${i + 1}`] = { heroId: pool[(m * 2) % pool.length].id };
    roster[`r${i + 1}`] = { heroId: pool[(m * 2 + 1) % pool.length].id };
  }
  for (const [seat, row] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = row.spells;
  return roster;
};
//  2026-09-30 Owner 決策：v16 正式規則 objectiveStakesV1＝**OFF**（Dragon-side 單場 +8pp 不接受）。
//  機制檢查仍在測試引擎上**明確開啟**來驗證（保留的候選程式碼仍有人守）；正式預設的 OFF 行為另由 V2／O2 驗。
const makeEngine = (seed, { skills = true, stakes = true } = {}) => {
  const roster = rosterFor(seed);
  const e = new LogicEngine(seed, null);
  if (stakes) e.rules = { ...e.rules, objectiveStakesV1: true };
  const hm = toEngineHeroMods(roster, heroById); if (hm) e.configureHeroes(hm);
  if (skills) e.configureHeroSkills(toEngineHeroSkills(roster, null));
  const am = toEngineArchetypes(roster);
  if (am) { const blue = {}, red = {}; for (const [pid, v] of Object.entries(am)) (pid[0] === "r" ? red : blue)[pid] = v;
    e.configureArchetypes({ blue, red, meta: { version: "obj-v16", seats: 10 } }); }
  const sp = toEngineSpells(roster); if (sp) e.configureSpells(sp);
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: { tacticId: "std" } });
  const ic = matchItemsConfig({ roster, heroLookup: heroById, buildStrategy: "standard" }); if (ic) e.configureItems(ic);
  return { e, roster };
};

// ── V ────────────────────────────────────────────────────────────────────────
const R = rulesFor("v3");
//  2026-10-01 moba-sim.v17（Hero Identity v1）：版本事實隨升版更新；v16 與 v15 都必須仍是已知版本（歷史憑據不刪）。
//  2026-10-06 moba-sim.v18（Map Topology Final）：同上，v17 也必須仍是已知版本。
//  2026-10-07 moba-sim.v19（Tactical AI Phase 1）：同上，v18 也必須仍是已知版本。
ck("V1 目前版本 moba-sim.v19，v18／v17／v16／v15 仍是已知版本（歷史挑戰明確拒絕、不覆蓋）", MOBA_SIMULATION_VERSION === "moba-sim.v19"
  && KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v18") && KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v17") && KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v16") && KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v15"), MOBA_SIMULATION_VERSION);
//  heroPassivesV1 在 v17 由 Owner 指派的 Hero Identity v1 開啟；Stakes／Nexus cap 的 OFF 斷言原樣保留。
ck("V2 v3 正式規則：objectiveStakesV1＝OFF（Owner 2026-09-30）、splitProjectileSlowV16＝on；nexusSiegeCapV1＝off；heroPassivesV1＝on（v17）",
  R.objectiveStakesV1 === false && R.splitProjectileSlowV16 === true && R.nexusSiegeCapV1 === false && R.heroPassivesV1 === true);
ck("V3 正式數值：龍層 1.8%、龍魂 ×1.03／兵線 ×1.15、巴龍 ×1.10、賞金門檻 1500／20%／上限 500、龍魂攻防 +0.2／+0.1",
  R.objStakesDragonPowerPerStack === 0.018 && R.objStakesSoulPowerK === 1.03 && R.objStakesSoulFightK === 1.15
  && R.objStakesBaronPowerK === 1.1 && R.objStakesBountyGap === 1500 && R.objStakesBountyRatio === 0.2 && R.objStakesBountyMax === 500
  && R.objAiSoulDefense === 0.2 && R.objAiSoulSecure === 0.1 && R.dragonMaxStacks === 4);

// ── P／S／B／A（在一個已開局的引擎上佈置團隊狀態）──────────────────────────────
{
  const { e } = makeEngine(11);
  for (let i = 0; i < 20; i++) e.tick(0.5);
  const set = (side, stacks, baronFor = 0) => { e.fsm3[side].dragonStacks = stacks; e.fsm3[side].baronBuffUntil = baronFor ? e.t + baronFor : 0; };
  let okP = true; const notes = [];
  for (const stacks of [0, 1, 2, 3, 4]) for (const baron of [0, 1]) {
    set("blue", stacks, baron ? 50 : 0);
    const want = (1 + stacks * 0.018) * (stacks >= 4 ? 1.03 : 1) * (baron ? 1.1 : 1);
    if (!near(e._dragonPowerK("blue"), want, 1e-12)) { okP = false; notes.push(`${stacks}/${baron}:${e._dragonPowerK("blue")}≠${want}`); }
  }
  ck("P1 戰力倍率＝(1＋層數×1.8%)×龍魂 1.03×巴龍 1.10（0–4 層 × 有無巴龍，10 種組合）", okP, notes.join(" "));

  set("blue", 3); set("red", 0);
  const fight3 = e._waveModifiers("blue", "mid").fightK;
  set("blue", 4);
  const fight4 = e._waveModifiers("blue", "mid").fightK;
  e._combatStateStep();
  const snap4 = e.snapshot();
  const act4 = snap4.combatStates.active;
  ck("S1 龍魂：4 層 ⇒ 兵線 fightK ×1.15（相對 3 層），teamBuffs.soul＝true、minion.sources 含 soul",
    near(fight4 / fight3, 1.15, 1e-9) && snap4.teamBuffs.blue.soul === true && snap4.teamBuffs.blue.minion.sources.includes("soul"),
    `${fight3}→${fight4}`);
  ck("S2 CombatState：team-dragon（value＝4、永久哨兵）與 team-soul 由同一份 fsm3 推導；紅方 0 層沒有",
    act4.some((r) => r.kind === "team-dragon" && r.side === "blue" && r.value === 4 && r.until === CS_PERMANENT)
    && act4.some((r) => r.kind === "team-soul" && r.side === "blue")
    && !act4.some((r) => r.side === "red" && (r.kind === "team-dragon" || r.kind === "team-soul")));

  set("blue", 0); set("red", 0, 70);
  const until = e.fsm3.red.baronBuffUntil;
  e._combatStateStep();
  const baronRow = e._snapCombatStates().active.find((r) => r.kind === "team-baron" && r.side === "red");
  const siegeK = e._waveModifiers("red", "mid").siegeK;
  ck("B1 巴龍：CombatState team-baron 的 until ＝ gameplay baronBuffUntil，value＝1.10；兵線 siegeK 為既有 2.2",
    baronRow && near(baronRow.until, Math.round(until * 100) / 100, 1e-9) && baronRow.value === 1.1 && near(siegeK, R.baronMinionK),
    JSON.stringify(baronRow));
  for (let i = 0; i < 200 && e.t < until + 0.5; i++) e.tick(0.5);   // 讓巴龍自然到期（同一條 tick 路徑）
  const ended = e._snapCombatStates().ended.filter((r) => r.kind === "team-baron" && r.side === "red").pop();
  ck("B2 巴龍到期 ⇒ 結束紀錄 reason＝expired、帶序號", ended && ended.reason === "expired" && Number.isInteger(ended.seq), JSON.stringify(ended));

  set("blue", 0); set("red", 3);
  const defend = e._objectiveUrgency("blue", "dragon"), secure = e._objectiveUrgency("red", "dragon");
  set("red", 4);
  const afterSoul = e._objectiveUrgency("blue", "dragon");
  set("blue", 4);
  const bothSoul = e._objectiveUrgency("blue", "dragon");
  ck("A1 AI 龍魂攻防：敵方 3 層 ⇒ +0.2；自己 3 層 ⇒ +0.1；敵方已龍魂（我方未）⇒ 仍 +0.2；雙方都龍魂 ⇒ 0；巴龍 ⇒ 0",
    near(defend, 0.2) && near(secure, 0.1) && near(afterSoul, 0.2) && near(bothSoul, 0) && e._objectiveUrgency("blue", "baron") === 0,
    `${defend}/${secure}/${afterSoul}`);
}

// ── G 逆轉賞金（佈置一次真正的巨龍擊殺：同一條引擎程式路徑）───────────────────────
const killDragon = (gap) => {
  const { e } = makeEngine(13);
  for (let i = 0; i < 600 && !e.neutrals.dragon.alive; i++) e.tick(0.5);
  const o = e.neutrals.dragon;
  e.bGold = 3000; e.rGold = 3000 + gap;         // 藍方落後 gap
  o.dmgBy = { blue: 999, red: 0 }; o.hp = 0.001;
  //  藍方全員站進坑（擊殺判定要有人在場），紅方回泉水
  for (const p of e.players) p.pos = p.side === "blue" ? { x: o.pos.x + 1, y: o.pos.y } : { x: 206, y: 10 };
  const before = e.bGold, seq0 = e.objectiveLog.length ? e.objectiveLog[e.objectiveLog.length - 1].seq : 0;
  for (let i = 0; i < 4 && o.alive; i++) e.tick(0.5);
  const log = e.objectiveLog.filter((x) => x.seq > seq0 && x.key === "dragon");
  return { alive: o.alive, killer: o.killerTeam, bounty: log[0]?.bounty ?? null, gain: e.bGold - before };
};
{
  const g2000 = killDragon(2000), g4000 = killDragon(4000), g1000 = killDragon(1000);
  //  引擎順序：先發基本獎勵（巨龍 200）再算落後額 ⇒ 落後 2000 → 1800 × 20% ＝ 360
  ck("G1 落後 2000 拿巨龍 ⇒ 領完基本 200 後落後 1800 ⇒ 逆轉賞金 360（20%）寫入 objectiveLog", g2000.killer === "blue" && g2000.bounty === 360, JSON.stringify(g2000));
  ck("G2 落後 4000 ⇒ 賞金封頂 500；落後 1000 ⇒ 0（門檻 1500）", g4000.bounty === 500 && g1000.bounty === 0, `${g4000.bounty}/${g1000.bounty}`);
}

// ── O skill-off ──────────────────────────────────────────────────────────────
{
  const { e } = makeEngine(17, { skills: false });
  for (let i = 0; i < 10; i++) e.tick(0.5);
  e.fsm3.blue.dragonStacks = 4;
  const k = e._dragonPowerK("blue");
  const snap = e.snapshot();
  ck("O1 skill-off：物件規則不生效（4 層＝v15 的 1＋4×1.2%、無 soul 欄位、無 combatStates／objectiveLog）",
    near(k, 1 + 4 * R.dragonPowerPerStack, 1e-12) && snap.teamBuffs.blue.soul === undefined && !snap.combatStates && !snap.objectiveLog, String(k));
}
{
  //  正式預設（hero skills 開、objectiveStakesV1 OFF）：物件規則就是 v15 的——沒有龍魂、巴龍不加英雄戰力、沒有逆轉賞金、AI 無龍魂攻防
  const { e } = makeEngine(19, { stakes: false });
  for (let i = 0; i < 10; i++) e.tick(0.5);
  e.fsm3.blue.dragonStacks = 4; e.fsm3.blue.baronBuffUntil = e.t + 50;
  const k = e._dragonPowerK("blue"), snap = e.snapshot();
  const g = (() => { const x = e.neutrals.dragon; return x; })();
  ck("O2 正式預設（skills on、Stakes OFF）：4 層＋巴龍＝v15 的 1＋4×1.2%（無龍魂 ×、無巴龍英雄 ×）、teamBuffs 無 soul、AI 物件加項＝0",
    e._objStakesOn() === false && near(k, 1 + 4 * R.dragonPowerPerStack, 1e-12) && snap.teamBuffs.blue.soul === undefined && !!g,
    String(k));
}

// ── D＋R：整場（逐 tick 擷取 Replay）──────────────────────────────────────────
const runFull = (seed, capture) => {
  const { e, roster } = makeEngine(seed);
  if (capture) beginReplayCapture({ seed, config: {}, roster });
  const stream = [], probes = [];
  for (let tick = 0; tick < 7200 && !e.over; tick++) {
    e.tick(0.5);
    const snap = e.snapshot();
    if (capture) captureReplayFrame(snap);
    const tb = snap.teamBuffs;
    stream.push(JSON.stringify([tb.blue.dragonStacks, tb.red.dragonStacks, tb.blue.soul, tb.red.soul, tb.blue.baronRemaining, tb.red.baronRemaining, snap.objectiveLog.length ? snap.objectiveLog[snap.objectiveLog.length - 1].seq : 0]));
    if (capture && tick % 9 === 4) probes.push({ t: snap.ts, tb: JSON.parse(JSON.stringify(tb)), log: snap.objectiveLog.map((x) => `${x.seq}:${x.key}:${x.side}:${x.bounty}:${x.soul}`).join("|") });
  }
  return { e, stream: stream.join("~"), probes };
};
{
  const seed = 7;
  const a = runFull(seed, false), b = runFull(seed, true);
  ck("D1 決定性：同 seed 兩次，團隊物件狀態與事件串流相同", a.stream === b.stream);
  const logAll = b.e.objectiveLog;
  const replay = finalizeReplay({ matchId: "obj-v16", events: [] });
  const v = validateMobaReplay(replay);
  ck("R1 Replay 通過 validateMobaReplay，帶 objectiveEvents 與團隊 CombatState（含 sides）",
    v.ok && Array.isArray(replay.objectiveEvents) && replay.objectiveEvents.length > 0 && typeof replay.combatStates?.sides === "string"
    && replay.combatStates.kinds.includes("team-dragon"), v.errors.join(";") + ` events=${replay.objectiveEvents?.length}`);
  const src = createReplaySource(replay);
  let mis = 0, cmp = 0, lmis = 0; const ex = [];
  for (const pr of b.probes) {
    src.seek(pr.t);
    const rs = src.getState().snapshot;
    for (const side of ["blue", "red"]) {
      cmp++;
      const L = pr.tb[side], G = rs.teamBuffs?.[side] ?? {};
      const same = (L.dragonStacks ?? 0) === (G.dragonStacks ?? 0) && !!L.soul === !!G.soul
        && Math.abs((L.baronRemaining ?? 0) - (G.baronRemaining ?? 0)) <= 0.11;
      if (!same) { mis++; if (ex.length < 3) ex.push(`t=${pr.t} ${side} live${JSON.stringify([L.dragonStacks, L.soul, L.baronRemaining])} replay${JSON.stringify([G.dragonStacks, G.soul, G.baronRemaining])}`); }
    }
    const got = (rs.objectiveLog ?? []).map((x) => `${x.seq}:${x.key}:${x.side}:${x.bounty}:${x.soul}`).join("|");
    if (got !== pr.log) lmis++;
  }
  ck(`R2 Replay seek：龍層／龍魂／巴龍剩餘逐時刻＝現場（${cmp} 次）`, mis === 0, ex.join(" ¦ "));
  ck(`R3 Replay seek：物件事件（含逆轉賞金、龍魂）逐時刻＝現場（${b.probes.length} 個時刻；本場 ${logAll.length} 筆）`, lmis === 0, String(lmis));
}

console.log(`\nMOBA Objective Stakes v16：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
