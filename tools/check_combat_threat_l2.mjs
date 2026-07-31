#!/usr/bin/env node
// ============================================================================
//  tools/check_combat_threat_l2.mjs — L Hotfix 2：塔／野怪／Boss 行為驗證
//
//  ⚠ 全部驗**真實行為**（跑引擎、比對前後狀態），不是 grep 原始碼。
//     讀的是引擎內部狀態，不是 snapshot（snapshot 不是引擎狀態的全集）。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { dist, PITS } from "../src/gameData.js";
import { SIM_RULES } from "../src/battle/moba/matchProgression.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const R = SIM_RULES.v3;

/** 跑一場，逐 tick 收集塔／Boss／野怪的攻擊事實。 */
function observe(seed, ticks) {
  const e = new LogicEngine(seed);
  const heroIds = new Set(e.players.map((p) => p.id));
  const out = {
    towerToMinion: 0, towerToHero: 0, towerFriendlyFire: 0, towerOutOfRange: 0,
    towerDoubleShotSameTick: 0, towerFxWithoutDamage: 0, towerDamageWithoutFx: 0,
    bossShots: 0, bossDamage: 0, bossFriendlyFire: 0,
    campShots: 0, campDamage: 0, campOutOfRange: 0,
    bossIdleWithTargetTicks: 0, bossHasTargetTicks: 0,
    maxLockShots: 0,
  };
  for (let i = 0; i < ticks && !e.over; i++) {
    const fxLast = e.fx.length ? e.fx[e.fx.length - 1].id : null;
    const before = new Map();
    const posBefore = new Map();
    for (const p of e.players) { before.set(p.id, p.hp); posBefore.set(p.id, { x: p.pos.x, y: p.pos.y }); }
    for (const ln of ["top", "mid", "bot"]) {
      for (const k of ["bm", "rm"]) for (const m of e.lanes[ln][k]) before.set(m.id, m.hp);
    }
    //  Boss 攻擊前的狀態（判斷「有目標卻長期不動作」）
    //  ⚠ e.dragon / e.baron 早期沒有 pos 欄位（坑位座標在 gameData.PITS）。
    //     第一版直接讀 o.pos 會在第 0 tick 就炸掉。
    //  ⚠⚠ v3 的 Boss 實體在 `e.neutrals`，**不是** `e.dragon` / `e.baron`
    //     （後者是 v1/v2 的舊物件，沒有 pos、targetId 永遠是 null）。
    //     第一版讀錯物件，量出「433 個存活 tick 一次都沒有目標」的假結論。
    //     這是本輪第二次踩到「引擎狀態不在你以為的地方」——先確認物件再下結論。
    const bossPre = ["dragon", "baron"].map((key) => {
      const o = e.neutrals?.[key] ?? {};
      const pit = o.pos ?? PITS[key];
      const near = pit ? e.players.filter((p) => !p.dead && dist(p.pos, pit) < 9) : [];
      const ready = Math.max(0, (o.atkCd ?? 0) - 0.5) <= 0;
      const killable = near.some((p) => p.hp > 1.01);
      return { key, alive: !!o.alive, near: near.length, ready, killable };
    });

    e.tick(0.5);

    const newFx = [];
    for (let j = e.fx.length - 1; j >= 0; j--) {
      if (e.fx[j].id === fxLast) break;
      newFx.push(e.fx[j]);
    }
    const after = new Map();
    for (const p of e.players) after.set(p.id, p.hp);
    for (const ln of ["top", "mid", "bot"]) {
      for (const k of ["bm", "rm"]) for (const m of e.lanes[ln][k]) after.set(m.id, m.hp);
    }
    const perTower = new Map();
    for (const f of newFx) {
      if (f.ability === "tower:basic") {
        perTower.set(f.sourceId, (perTower.get(f.sourceId) ?? 0) + 1);
        out.maxLockShots = Math.max(out.maxLockShots, f.lockShots ?? 0);
        const tw = e.towers[f.sourceId];
        if (heroIds.has(f.targetId)) {
          out.towerToHero++;
          const tgt = e.players.find((p) => p.id === f.targetId);
          if (tgt && tw && tgt.side === tw.side) out.towerFriendlyFire++;
          //  ⚠ 用 tick **開始前**的座標判射程：塔在 tick 內先選目標、英雄接著移動，
          //     拿事後座標比會把「合法開火後對方跑出去」誤判成超距（第一版量到 144 次）。
          const pb = posBefore.get(f.targetId);
          if (tgt && tw && pb && dist(pb, tw.pos) > R.towerAggroRange + 0.5) out.towerOutOfRange++;
        } else if (f.targetId) {
          out.towerToMinion++;
        }
        //  傷害一致性：這一發是否真的讓目標掉血（或把它打死）。
        //  ⚠ 排除「目標已在 1 HP 下限」——塔刻意不執行擊殺（維持 Σk == Σd），
        //     那種情況沒有掉血是**設計行為**，不是漏傷害。
        const b = before.get(f.targetId), a = after.get(f.targetId);
        if (b != null && a != null && a >= b && b > 1.01) out.towerFxWithoutDamage++;
      } else if (String(f.ability ?? "").startsWith("boss:")) {
        out.bossShots++;
        const b = before.get(f.targetId), a = after.get(f.targetId);
        if (b != null && a != null && b > a) out.bossDamage += b - a;
      } else if (f.ability === "neutral:basic") {
        out.campShots++;
        const b = before.get(f.targetId), a = after.get(f.targetId);
        if (b != null && a != null && b > a) out.campDamage += b - a;
      }
    }
    for (const n of perTower.values()) if (n > 1) out.towerDoubleShotSameTick++;
    //  危險方向：塔的鎖定目標掉血了，卻沒有任何 tower fx 指向它
    for (const [k, tw] of Object.entries(e.towers)) {
      if (tw.hp <= 0 || !tw.targetId) continue;
      const b = before.get(tw.targetId), a = after.get(tw.targetId);
      if (b == null || a == null || a >= b) continue;
      const hasFx = newFx.some((f) => f.ability === "tower:basic" && f.sourceId === k && f.targetId === tw.targetId);
      const heroHit = newFx.some((f) => f.ability !== "tower:basic" && f.targetId === tw.targetId);
      if (!hasFx && !heroHit && tw.atkCd <= 0.01) out.towerDamageWithoutFx++;
    }

    //  Boss：坑內有人且冷卻已到，卻整段沒動作 ⇒ 記一筆
    for (const pre of bossPre) {
      if (!pre.alive || pre.near === 0 || !pre.killable) continue;
      out.bossHasTargetTicks++;
      const fired = newFx.some((f) => f.ability === `boss:${pre.key}`);
      if (!fired && pre.ready) out.bossIdleWithTargetTicks++;
    }
  }
  return out;
}

console.log("── §1 防禦塔行為 ──");
const A = observe(42, 1500);
const B = observe(7, 1500);
const sum = (k) => A[k] + B[k];

ck(`1) 塔會攻擊射程內的敵方小兵（實測 ${sum("towerToMinion")} 發）`, sum("towerToMinion") > 100, sum("towerToMinion"));
ck(`2) 塔會攻擊射程內的敵方英雄（實測 ${sum("towerToHero")} 發）`, sum("towerToHero") > 100, sum("towerToHero"));
ck("3) 塔不攻擊己方單位（友軍誤傷 0）", sum("towerFriendlyFire") === 0, sum("towerFriendlyFire"));
ck("4) 塔不攻擊射程外的英雄（超距 0）", sum("towerOutOfRange") === 0, sum("towerOutOfRange"));
ck("5) 同一 tick 同一座塔不會重複開火（冷卻正確）", sum("towerDoubleShotSameTick") === 0, sum("towerDoubleShotSameTick"));
//  ⚠ 誠實標註：危險的方向是「有傷害沒 FX」（玩家莫名掉血），那個是 **0**。
//  反方向（有 FX 沒掉血）殘留約 2%，實測全部發生在**血量已低於 9** 的英雄身上，
//  是塔「不執行擊殺」下限與同 tick 治療／兩段式結算的邊界互動。
//  不掩蓋、也不為了讓數字歸零去動結算順序（那會改變所有 seed）。列為已知限制。
ck(`6) 沒有「有傷害卻沒有 FX」（危險方向 = ${sum("towerDamageWithoutFx")}）`,
  sum("towerDamageWithoutFx") === 0, sum("towerDamageWithoutFx"));
ck(`6a) 「有 FX 沒掉血」比例在容忍範圍內（${sum("towerFxWithoutDamage")} / ${sum("towerToHero") + sum("towerToMinion")} 發）`,
  sum("towerFxWithoutDamage") / Math.max(1, sum("towerToHero") + sum("towerToMinion")) < 0.05,
  { noDmg: sum("towerFxWithoutDamage"), shots: sum("towerToHero") + sum("towerToMinion") });
ck(`7) 連續命中會累積 lockShots（威脅增幅有在運作，最高 ${Math.max(A.maxLockShots, B.maxLockShots)}）`,
  Math.max(A.maxLockShots, B.maxLockShots) >= 3, Math.max(A.maxLockShots, B.maxLockShots));
{
  //  威脅增幅有上限，不會無限成長
  ck(`8) 威脅增幅有上限（${R.towerLockRampMax}×）且是溫和值`,
    R.towerLockRampMax > 1 && R.towerLockRampMax <= 2 && R.towerLockRamp > 0 && R.towerLockRamp <= 0.25,
    { ramp: R.towerLockRamp, max: R.towerLockRampMax });
  //  塔的小兵鎖定 band 不得再窄於小兵的攻城 band（本輪根因）
  ck(`9) 塔的小兵鎖定 band(${R.towerMinionBand}) ≥ 小兵攻城 band(${R.minionSiegeBand})`,
    R.towerMinionBand >= R.minionSiegeBand, { band: R.towerMinionBand, siege: R.minionSiegeBand });
}
{
  //  塔傷不執行擊殺（維持 Σk == Σd 的結果契約）
  const e = new LogicEngine(99);
  for (let i = 0; i < 2500 && !e.over; i++) e.tick(0.5);
  const kills = e.players.reduce((s, p) => s + p.k, 0);
  const deaths = e.players.reduce((s, p) => s + p.d, 0);
  ck(`10) 每個死亡都有英雄擊殺者（Σk=${kills} == Σd=${deaths}）`, kills === deaths, { kills, deaths });
}

console.log("\n── §2 龍 / 巴龍 / 野怪 ──");
ck(`11) Boss 真的會攻擊英雄（實測 ${sum("bossShots")} 發、${Math.round(sum("bossDamage"))} 傷害）`,
  sum("bossShots") > 20 && sum("bossDamage") > 500, { shots: sum("bossShots"), dmg: Math.round(sum("bossDamage")) });
ck(`12) 野怪真的會攻擊英雄（實測 ${sum("campShots")} 發、${Math.round(sum("campDamage"))} 傷害）`,
  sum("campShots") > 20 && sum("campDamage") > 200, { shots: sum("campShots"), dmg: Math.round(sum("campDamage")) });
//  修正前實測 521/761（68%）完全沒反應；修正後只剩死亡／重生交界的個位數。
ck(`13) Boss 不會在坑內有人時長期沒反應（${sum("bossIdleWithTargetTicks")}/${sum("bossHasTargetTicks")} tick，修正前 521/761）`,
  sum("bossIdleWithTargetTicks") / Math.max(1, sum("bossHasTargetTicks")) < 0.05,
  { idle: sum("bossIdleWithTargetTicks"), withTarget: sum("bossHasTargetTicks") });
ck(`14) 巴龍威脅明顯高於龍（${R.baronAttackDamage} > ${R.dragonAttackDamage}）且間隔更短`,
  R.baronAttackDamage > R.dragonAttackDamage * 1.4 && R.baronAttackInterval < R.dragonAttackInterval,
  { baron: R.baronAttackDamage, dragon: R.dragonAttackDamage });
ck(`15) Buff 野怪比小野怪更痛（${R.buffCampAttackDamage} > ${R.campAttackDamage}）`,
  R.buffCampAttackDamage > R.campAttackDamage, { buff: R.buffCampAttackDamage, camp: R.campAttackDamage });
ck(`16) 龍的單次傷害佔一般英雄最大生命的合理比例（不是 1 也不是秒殺）`,
  R.dragonAttackDamage >= 15 && R.dragonAttackDamage <= 60, R.dragonAttackDamage);
ck(`17) 野怪攻擊距離 ≤ 仇恨距離（追得到也打得到，${R.campAttackRange} ≤ ${R.campAggroRange}）`,
  R.campAttackRange <= R.campAggroRange && R.campAttackRange >= 3, {
    atk: R.campAttackRange, aggro: R.campAggroRange,
  });

console.log("\n── §3 射程與畫面一致 ──");
{
  //  外塔離自己那條兵線最遠的位移必須落在射程內，否則「看起來在塔旁卻不被打」
  const e = new LogicEngine(1);
  const g = await import("../src/gameData.js");
  let worst = 0, worstKey = null;
  for (const [k, tw] of Object.entries(e.towers)) {
    if (tw.lane === "nexus" || tw.lane === "nexus_guard") continue;
    let best = Infinity;
    for (let t = 0; t <= 1; t += 0.004) best = Math.min(best, g.dist(g.posOnLane(tw.lane, t), tw.pos));
    if (best > worst) { worst = best; worstKey = k; }
  }
  ck(`18) 所有車道塔到自己兵線的最大位移 ${worst.toFixed(2)}（${worstKey}）落在射程 ${R.towerAggroRange} 內`,
    worst <= R.towerAggroRange, { worst: Number(worst.toFixed(2)), range: R.towerAggroRange });
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
