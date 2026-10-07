#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_tactical_ai_p1.mjs — Tactical AI Phase 1（moba-sim.v19）gate
//
//  P0-1 塔邊決策震盪：塔區血量遲滯（enter／exit）、退塔最短承諾、選手差異、整場決策目標乒乓下降
//  P0-2 大招：R 不在 Lv6 前施放、AI 大招保留（滿血單目標不放／收頭放／多目標放／野怪不放）
//  P0-3 勝利條件：敵方高地已破且人數不劣 ⇒ 收尾窗、不開新的物件窗；人數劣勢 ⇒ 不觸發
//  決定性：同 seed 兩次逐位元相同（無新亂數）
//  對照組：同一棵樹把 v19 開關全部關掉（≈ v18 行為）——判準是「明顯下降」，不是絕對值。
//  執行：ESMO_BALANCE_SKILLS=on ESMO_BALANCE_TALENTS=on node tools/check_moba_tactical_ai_p1.mjs
// ============================================================================
import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
process.env.ESMO_BALANCE_SKILLS ??= "on";
process.env.ESMO_BALANCE_TALENTS ??= "on";
const { LogicEngine } = await imp("src/LogicEngine.js");
const { rulesFor } = await imp("src/battle/moba/matchProgression.js");
const { compileGameplaySkill } = await imp("src/battle/moba/skills/heroSkillGameplay.js");
const Runner = await imp("tools/balance/moba_items_balance_runner.mjs");
const M = await Runner.modules();

const A = [];
const ck = (name, ok, detail = "") => A.push([name, !!ok, detail]);
const V19_FLAGS = ["towerHysteresisV19", "laneAnchorDeadbandV19", "laneWaitV19", "taskCommitV19", "ultHoldV19", "winConditionV19"];
const R3 = rulesFor("v3");
ck("R0 v3 正式規則集開啟全部 Phase 1 旗標", V19_FLAGS.every((k) => R3[k] === true), V19_FLAGS.filter((k) => R3[k] !== true).join(","));

// ── P0-1 塔邊遲滯（微型情境；英雄定位未配置 ⇒ 風險傾向 0）────────────────────────
{
  const e = new LogicEngine(3);
  const b = e.players.find((p) => p.id === "b1");
  const tw = e.towers.red_top_2 ?? Object.values(e.towers).find((t) => t.side === "red" && t.lane === "top");
  const r1 = e.players.find((p) => p.id === "r1");
  b.pos = { x: tw.pos.x + 2, y: tw.pos.y + 2 }; r1.pos = { x: tw.pos.x - 1, y: tw.pos.y };   // 有守軍 ⇒ 不走無守軍圍攻的血量豁免
  const alive = e.players.filter((p) => !p.dead);
  b.hp = b.maxHp * 0.50;
  const outside = e._towerZoneV17(b, alive, null, { x: b.pos.x, y: b.pos.y });   // 以「目標點」評估（不改 _towerIn）
  b._towerIn = null; b._towerDeny = null;
  const zNew = e._towerZoneV17(b, alive, null, b.pos);
  ck("T1 50% 血、尚未在塔下 ⇒ 不符進塔門檻（enter 0.55）", zNew.inZone && zNew.hpOk === false, JSON.stringify({ hpOk: zNew.hpOk }));
  b._towerIn = `${tw.side}:${tw.pos.x}:${tw.pos.y}`; b._towerDeny = null;
  const zIn = e._towerZoneV17(b, alive, null, b.pos);
  ck("T2 50% 血、已在塔下且被允許 ⇒ 仍符合（exit 0.45）——45–55% 不再是死區", zIn.hpOk === true, JSON.stringify({ hpOk: zIn.hpOk }));
  b.hp = b.maxHp * 0.40; b._towerIn = `${tw.side}:${tw.pos.x}:${tw.pos.y}`;
  const zLow = e._towerZoneV17(b, alive, null, b.pos);
  ck("T3 40% 血 ⇒ 低於 exit 門檻被逼出", zLow.hpOk === false);
  b.hp = b.maxHp; b._towerIn = null; b._towerDeny = null; b._towerDenyUntil = 0;
  const z0 = e._towerZoneV17(b, alive, null, b.pos);   // 無兵線、無擊殺、非圍攻 ⇒ 不允許 ⇒ 開始承諾
  const commit = (b._towerDenyUntil ?? 0) - e.t;
  ck("T4 被拒進塔 ⇒ 承諾退出 1.5–3.5 秒（中性 2.5）", !z0.allow && commit >= 1.5 && commit <= 3.5, `commit=${commit}`);
  void outside;
}
//  選手差異：英雄定位＋選手素質 ⇒ 不同風險傾向 ⇒ 不同門檻（決定性）
{
  const { e } = Runner.configure(11, "standard", M, 1);
  const risks = e.players.map((p) => +e._riskV19(p).toFixed(3));
  ck("T5 不同英雄的風險傾向不完全相同（門檻有個人差異）", new Set(risks).size >= 3, JSON.stringify(risks));
  ck("T6 風險傾向有界（|risk| ≤ 0.25）", risks.every((r) => Math.abs(r) <= 0.25));
}

// ── P0-2 大招保留（微型情境）─────────────────────────────────────────────────
{
  const mk = (heroId, foeHp = 1, extraFoes = 0) => {
    const e = new LogicEngine(7);
    e.configureHeroSkills({ players: { b1: { R: compileGameplaySkill(heroId, "R") } } });
    const b = e.players.find((p) => p.id === "b1");
    const foes = e.players.filter((p) => p.side === "red");
    b.pos = { x: 160, y: 160 };
    foes.forEach((f, i) => { f.pos = i === 0 ? { x: 163, y: 160 } : i <= extraFoes ? { x: 163.5, y: 160.5 + i * 0.4 } : { x: 300, y: 300 }; });
    foes[0].hp = foes[0].maxHp * foeHp;
    e._heroSkillStep();
    return (b.heroSkillReadyAt.R ?? 0) > e.t;
  };
  ck("U1 單一滿血敵人、沒有團戰 ⇒ R 不放（保留）", mk("maestro", 1, 0) === false);
  ck("U2 目標殘血（30%）⇒ R 收頭", mk("maestro", 0.30, 0) === true);
  ck("U3 目標身邊 ≥ 2 名敵方英雄 ⇒ R 多目標", mk("maestro", 1, 1) === true);
  const off = new LogicEngine(7);
  off.rules = { ...off.rules, ultHoldV19: false };
  off.configureHeroSkills({ players: { b1: { R: compileGameplaySkill("maestro", "R") } } });
  const ob = off.players.find((p) => p.id === "b1"), orf = off.players.find((p) => p.id === "r1");
  ob.pos = { x: 160, y: 160 }; orf.pos = { x: 163, y: 160 };
  off._heroSkillStep();
  ck("U4 對照：關掉保留時同情境會直接放（證明 U1 是保留造成的）", (ob.heroSkillReadyAt.R ?? 0) > off.t);
  const e = new LogicEngine(7);
  const held = e._ultHoldV19({ p: e.players[0], foe: null, objective: { pos: { x: 0, y: 0 } }, rule: compileGameplaySkill("maestro", "R") });
  ck("U5 野怪／龍／巴龍／小兵 ⇒ R 一律不放", held === true);
}

// ── P0-3 勝利條件（微型情境）─────────────────────────────────────────────────
{
  const e = new LogicEngine(5);
  for (const t of [0, 1, 2]) e.towers[`red_mid_${t}`].hp = 0;   // 藍方打開中路高地
  ck("W0 高地已破但 5v5、目標旁沒有己方兵線 ⇒ 不成立（推不動，照常走物件決策）", e._winConditionV19("blue") === null);
  e.players.find((p) => p.id === "r1").dead = true;
  const wc = e._winConditionV19("blue");
  ck("W1 敵方中路高地已破、5v4 人數優勢 ⇒ 勝利條件成立（目標＝中路前線建築）", wc && wc.lane === "mid" && !!e.towers[wc.targetKey], JSON.stringify(wc));
  ck("W2 對方高地未破 ⇒ 不成立", e._winConditionV19("red") === null);
  for (const id of ["b1", "b2", "b3"]) e.players.find((p) => p.id === id).dead = true;
  ck("W3 我方只剩 2 人（少於門檻且少於對方）⇒ 不成立", e._winConditionV19("blue") === null);
}

// ── 整場：決定性、R 等級、決策乒乓對照 ───────────────────────────────────────
function runGame(seed, off = false) {
  const { e } = Runner.configure(seed, "standard", M, 1);
  if (off) for (const k of V19_FLAGS) e.rules = { ...e.rules, [k]: false };
  const st = new Map(e.players.map((p) => [p.id, { goals: [], readyR: 0 }]));
  let flips = 0, aliveMin = 0, rEarly = 0, rCasts = 0;
  for (let t = 0.5; t <= 3600 && !e.over; t += 0.5) {
    e.tick(0.5);
    for (const p of e.players) {
      const s = st.get(p.id);
      if (p.dead) { s.goals = []; continue; }
      aliveMin += 0.5 / 60;
      const rr = p.heroSkillReadyAt?.R ?? 0;
      if (rr > s.readyR + 1) { rCasts++; if (p.mlv < 6) rEarly++; }
      s.readyR = rr;
      const g = p._nav?.goal;
      if (!g) continue;
      s.goals.push({ x: g.x, y: g.y, t: e.t }); while (s.goals.length && e.t - s.goals[0].t > 3) s.goals.shift();
      if (e.t - (p.lastDamagedAt ?? -99) > 3 && s.goals.length >= 3) {
        const a0 = s.goals[0];
        if (Math.hypot(a0.x - g.x, a0.y - g.y) <= 1.5 && s.goals.some((q) => Math.hypot(q.x - a0.x, q.y - a0.y) > 6)) { flips++; s.goals = [s.goals.at(-1)]; }
      }
    }
  }
  return { e, flipsPerMin: flips / aliveMin, rEarly, rCasts, min: e.t / 60 };
}
{
  const a = Runner.configure(21, "standard", M, 1).e, b = Runner.configure(21, "standard", M, 1).e;
  for (let i = 0; i < 1200; i++) { a.tick(0.5); b.tick(0.5); }
  ck("D1 同 seed 兩次 600 秒逐位元相同（無新亂數）", JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()));
}
const SEEDS = [1, 2, 3, 4];
const on = SEEDS.map((s) => runGame(s)), offRuns = SEEDS.map((s) => runGame(s, true));
const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
const rEarly = on.reduce((x, r) => x + r.rEarly, 0), rCasts = on.reduce((x, r) => x + r.rCasts, 0);
ck(`S1 整場 R 在 Lv6 前施放 0 次（${SEEDS.length} 場、R 共 ${rCasts} 次）`, rEarly === 0 && rCasts > 0, `early=${rEarly}`);
const fOn = mean(on.map((r) => r.flipsPerMin)), fOff = mean(offRuns.map((r) => r.flipsPerMin));
ck(`S2 決策目標乒乓明顯下降：v19 ${fOn.toFixed(2)} vs 關閉 v19 開關 ${fOff.toFixed(2)} 次／英雄分鐘（需 ≤ 0.6×）`, fOn <= fOff * 0.6);
ck(`S3 對局全部正常結束（v19：${on.map((r) => r.min.toFixed(1)).join("／")} 分）`, on.every((r) => r.e.over && r.min <= 45));

let pass = 0;
for (const [n, ok, d] of A) { console.log(`${ok ? "✅" : "❌"} ${n}${ok || !d ? "" : `　${d}`}`); if (ok) pass++; }
console.log(`\nMOBA Tactical AI Phase 1：${pass}/${A.length} ${pass === A.length ? "PASS" : "FAIL"}`);
process.exit(pass === A.length ? 0 : 1);
