#!/usr/bin/env node
// ============================================================================
//  tools/audit_tower_attack_l1.mjs — L Hotfix 1 §1：防禦塔攻擊 Audit
//
//  ⚠ 這支是**診斷**，不是修正。目的只有一個：把「塔到底有沒有在打」拆成
//  可以分辨的三種狀態，而不是憑感覺說「塔好像不會攻擊」：
//
//    A. 沒有目標         —— 射程內真的沒有敵人 ⇒ 不該打，正常
//    B. 有目標、沒有傷害 —— 射程內有敵人卻一點傷害都沒進 ⇒ **邏輯問題**
//    C. 有傷害、沒有 FX  —— 傷害有進但沒推 fx ⇒ **呈現問題**
//
//  量測方式：每個 tick 對每座塔記錄
//    · 最近敵方英雄／小兵的實際距離 vs towerAggroRange
//    · targetId / targetKind / atkCd
//    · 這個 tick 有沒有 `tower:basic` fx（用 sourceId 比對塔 key）
//    · 被鎖定目標的 HP 前後差
//  ⚠ 讀的是**引擎內部狀態**（e.towers / e.lanes / e.players），不是 snapshot。
//     原因：`snapshot.towers` 只序列化 `side/lane/tier/pos/hp`——沒有
//     targetId / targetKind / atkCd / t（lane progress）。第一版拿 snapshot 量，
//     `tw.targetId` 恆為 undefined ⇒ 傷害偵測整段失效，量出「100% 有 FX 沒傷害」
//     的假結論。診斷工具就該直接看真實狀態。
//  完全唯讀：不呼叫任何 setter、不改 rng、不改規則。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { dist, posOnLane } from "../src/gameData.js";
import { SIM_RULES } from "../src/battle/moba/matchProgression.js";

const arg = (k, d) => {
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  if (eq) return eq.slice(k.length + 1);
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEEDS = String(arg("--seeds", "42,7,99")).split(",").map(Number);
const TICKS = Number(arg("--ticks", "2400"));
const R = SIM_RULES.v3 ?? SIM_RULES;

/** 敵方小兵（引擎內部狀態，含世界座標）。tower.side 的敵方陣營。 */
const laneMinionWorld = (eng, side) => {
  const key = side === "blue" ? "rm" : "bm";
  const out = [];
  for (const ln of ["top", "mid", "bot"]) {
    for (const m of eng.lanes?.[ln]?.[key] ?? []) {
      out.push({ id: m.id, hp: m.hp, pos: posOnLane(ln, m.t), t: m.t, lane: ln });
    }
  }
  return out;
};
/** 快照一份「誰現在幾滴血」，用來算 tick 前後的實際傷害。 */
const hpMap = (eng) => {
  const m = new Map();
  for (const p of eng.players) m.set(p.id, p.hp);
  for (const ln of ["top", "mid", "bot"]) {
    for (const key of ["bm", "rm"]) {
      for (const x of eng.lanes?.[ln]?.[key] ?? []) m.set(x.id, x.hp);
    }
  }
  return m;
};

console.log("── 防禦塔攻擊 Audit（唯讀）──");
console.log(`規則：towerAggroRange=${R.towerAggroRange}　towerAttackInterval=${R.towerAttackInterval}`);
console.log(`      towerAggroDmg=${R.towerAggroDmg}　towerMinionDamage=${R.towerMinionDamage}\n`);

const totals = {
  ticksObserved: 0,
  //  以「塔 × tick」為單位
  noTarget: 0,            // A：射程內沒有敵人
  heroInRange: 0,         // 射程內有英雄
  minionAtTower: 0,       // 塔位附近有敵方小兵（lane progress 判定）
  firedFx: 0,             // 這個 tick 有推 tower fx
  damageDealt: 0,         // 這個 tick 有實際扣血
  idleWithEnemy: 0,       // B：有敵人但既沒傷害也沒 FX
  damageNoFx: 0,          // C：有傷害但沒有 FX
  fxNoDamage: 0,          // 有 FX 但沒扣血（純視覺）
};
const byLane = {};        // 分「一般車道塔」與「nexus_guard」看

for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  let beforeHp = hpMap(e);
  for (let i = 0; i < TICKS && !e.over; i++) {
    const fxBefore = e.fx.length ? e.fx[e.fx.length - 1].id : null;
    e.tick(0.5);
    const afterHp = hpMap(e);
    //  這個 tick 新推的 tower fx（靠 fx 陣列尾端的新 id 判斷）
    const newFx = [];
    for (let j = e.fx.length - 1; j >= 0; j--) {
      if (e.fx[j].id === fxBefore) break;
      if (e.fx[j].ability === "tower:basic") newFx.push(e.fx[j]);
    }

    for (const [k, tw] of Object.entries(e.towers)) {
      if (tw.hp <= 0) continue;
      const enemySide = tw.side === "blue" ? "red" : "blue";
      const heroes = e.players.filter((p) => !p.dead && p.side === enemySide);
      const nearestHero = heroes
        .map((p) => ({ id: p.id, d: dist(p.pos, tw.pos) }))
        .sort((a, b) => a.d - b.d)[0] ?? null;
      const minions = laneMinionWorld(e, tw.side);
      //  引擎判「塔位有兵」用 lane progress 差（不是世界距離）——照抄它的判準
      const laneArr = tw.lane !== "nexus" && e.lanes?.[tw.lane]
        ? e.lanes[tw.lane][tw.side === "blue" ? "rm" : "bm"] : [];
      const minionAtTower = laneArr.some((m) => Math.abs(m.t - tw.t) < 0.05);
      const minionInRange = minions.some((m) => dist(m.pos, tw.pos) < R.towerAggroRange);

      const heroInRange = !!nearestHero && nearestHero.d < R.towerAggroRange;
      const fx = newFx.filter((f) => f.sourceId === k);
      const firedFx = fx.length > 0;

      //  實際傷害：這個 tick 塔的鎖定目標有沒有掉血（或被打死）
      let damaged = false;
      if (tw.targetId) {
        const b = beforeHp.get(tw.targetId), a = afterHp.get(tw.targetId);
        if (b != null && a != null && a < b) damaged = true;
        if (b != null && a == null) damaged = true;
      }

      const bucket = (byLane[tw.lane] ??= {
        ticks: 0, heroInRange: 0, minionAtTower: 0, minionInRange: 0,
        fired: 0, damaged: 0, idleWithEnemy: 0, hasTarget: 0,
      });
      bucket.ticks++;
      totals.ticksObserved++;
      if (tw.targetId) bucket.hasTarget++;
      if (heroInRange) { totals.heroInRange++; bucket.heroInRange++; }
      if (minionAtTower) { totals.minionAtTower++; bucket.minionAtTower++; }
      if (minionInRange) { totals.minionInRange = (totals.minionInRange ?? 0) + 1; bucket.minionInRange++; }
      if (firedFx) { totals.firedFx++; bucket.fired++; }
      if (damaged) { totals.damageDealt++; bucket.damaged++; }
      if (!heroInRange && !minionInRange) totals.noTarget++;
      if ((heroInRange || minionInRange) && !firedFx && !damaged) {
        totals.idleWithEnemy++; bucket.idleWithEnemy++;
      }
      if (damaged && !firedFx) totals.damageNoFx++;
      if (firedFx && !damaged) totals.fxNoDamage++;
    }
    beforeHp = afterHp;
  }
}

const pct = (n) => `${((n / Math.max(1, totals.ticksObserved)) * 100).toFixed(1)}%`;
console.log("── 總計（塔 × tick）──");
console.log(`觀測樣本            ${totals.ticksObserved}`);
console.log(`A 射程內沒有敵人    ${totals.noTarget}（${pct(totals.noTarget)}）`);
console.log(`  射程內有英雄      ${totals.heroInRange}（${pct(totals.heroInRange)}）`);
console.log(`  塔位有敵方小兵    ${totals.minionAtTower}（${pct(totals.minionAtTower)}）  ← 引擎的 lane-progress 判準`);
console.log(`  射程內有敵方小兵  ${totals.minionInRange ?? 0}（${pct(totals.minionInRange ?? 0)}）  ← 世界距離判準`);
console.log(`  有推 tower FX     ${totals.firedFx}（${pct(totals.firedFx)}）`);
console.log(`  有實際扣血        ${totals.damageDealt}（${pct(totals.damageDealt)}）`);
console.log(`B 有敵人卻完全沒動作 ${totals.idleWithEnemy}（${pct(totals.idleWithEnemy)}）  ← 邏輯問題`);
console.log(`C 有傷害但沒有 FX    ${totals.damageNoFx}（${pct(totals.damageNoFx)}）  ← 呈現問題`);
console.log(`  有 FX 但沒扣血     ${totals.fxNoDamage}（${pct(totals.fxNoDamage)}）`);

console.log("\n── 依塔種類拆開 ──");
console.log("lane           ticks  英雄在射程  兵在射程  塔位有兵  有目標   有FX  有傷害  有敵人沒動作");
for (const [lane, b] of Object.entries(byLane).sort()) {
  const p = (n) => `${((n / Math.max(1, b.ticks)) * 100).toFixed(1)}%`;
  console.log(`${lane.padEnd(13)} ${String(b.ticks).padStart(6)} ${p(b.heroInRange).padStart(10)} ${p(b.minionInRange).padStart(9)} ${p(b.minionAtTower).padStart(9)} ${p(b.hasTarget).padStart(7)} ${p(b.fired).padStart(6)} ${p(b.damaged).padStart(7)} ${p(b.idleWithEnemy).padStart(12)}`);
}

console.log("\n── 判讀 ──");
if (totals.idleWithEnemy / Math.max(1, totals.ticksObserved) > 0.05) {
  console.log("❌ 有「射程內有敵人卻既不扣血也不放 FX」的比例偏高 ⇒ 邏輯層問題，需要看分支。");
} else {
  console.log("✅ 沒有明顯的「有敵人卻完全不動作」。");
}
if (totals.damageNoFx > 0) {
  console.log(`❌ 有 ${totals.damageNoFx} 次扣血沒有伴隨 FX ⇒ 呈現層漏了。`);
} else {
  console.log("✅ 每一次塔傷都有對應 FX（沒有「有傷害沒特效」）。");
}
