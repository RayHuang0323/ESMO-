#!/usr/bin/env node
// ============================================================================
//  tools/balance/moba_item_power_probe.mjs — M4c：裝備戰力的**離線**量測（不跑對局）
//
//  用法：node tools/balance/moba_item_power_probe.mjs [--out=reports/moba-items-m4c/power.json]
//
//  為什麼要離線量：對局量到的是「AI 打得好不好」，這裡要量的是**裝備本身給了多少**。
//  走的是引擎同一條路徑：computeCombatStats → outgoingDamage → mitigate（itemEffects.js），
//  係數與 D0 的定義一個都不改，只是把 D0 固定成 1 來看倍率。
//
//  量四件事（每個流派各一組）：
//    · outputMult      滿裝輸出 ÷ 零裝輸出（對同一個防守方）
//    · ehpMult         有效生存 ＝ (maxHp+裝備 hp) × 減傷倍率，滿裝 ÷ 零裝
//    · ttk             打死對手要幾秒（OFF vs ON：雙方同時滿裝／同時零裝）
//    · perItem         第 1／2／3 件核心裝完成時的輸出倍率（戰力跳升）
//  參考血量用 LV_SCALE/hpMultFor 推出的 18 級英雄基準（與引擎同一份曲線）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const [cs, fx, policy, catalog, prog] = await Promise.all([
  load("src/battle/moba/items/combatStatsV1.js"),
  load("src/battle/moba/items/itemEffects.js"),
  load("src/battle/moba/items/buildPolicy.js"),
  load("src/battle/moba/items/itemCatalog.js"),
  load("src/battle/moba/matchProgression.js"),
]);
const { computeCombatStats, DAMAGE_PROFILE_BY_ARCH, ARCHETYPES, COMBAT_CONSTANTS } = cs;
const { outgoingDamage, mitigate, antiCritOf } = fx;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
//  參考英雄：引擎的基準血量 × 18 級成長（與 LogicEngine 同一條曲線）
const BASE_HP = 560;
const LV = 18;
//  參考 power（TTK 用）：audit 實測 20 分英雄平均 power ≈ 56（moba-siege-tempo-m4b6/audit）
const REF_POWER = 56;
const refMaxHp = BASE_HP * prog.hpMultFor(LV);
const SEAT_BY_ARCH = { 坦克: "top", 戰士: "top", 刺客: "jungle", 法師: "mid", 射手: "adc", 輔助: "sup" };

/** 這個流派的標準出裝目標（六格滿裝）。 */
function fullBuild(arch) {
  const { targets } = policy.buildTargets({ arch, seatRole: SEAT_BY_ARCH[arch] ?? "top", strategy: "standard", enemies: [] });
  return targets.slice(0, 6);
}
/** 核心裝完成到第 n 件時的背包（起始裝＋鞋＋前 n 件核心，照出裝順序取前幾格）。 */
const partial = (ids, n) => ids.slice(0, Math.min(ids.length, n));

/** 一次攻擊的輸出（D0 = 1 ⇒ 直接得到倍率），含防守方減傷。 */
function outputOnce({ attackerIds, defenderIds, arch }) {
  const a = computeCombatStats(attackerIds, {});
  const d = computeCombatStats(defenderIds, {});
  const profile = DAMAGE_PROFILE_BY_ARCH[arch];
  const out = outgoingDamage({ D0: 1, cs: a, profile, foe: { antiCrit: antiCritOf(d), hp: refMaxHp + d.hp, maxHp: refMaxHp + d.hp }, lateFactor: 1 });
  const m = mitigate({ phys: out.phys, magic: out.magic, attackerCs: a, defenderCs: d });
  return { total: m.physTaken + m.magicTaken, raw: out.phys + out.magic, cs: a, defCs: d };
}
/** 有效生存：(基準血量＋裝備血量) ÷ 承受倍率（對同一個攻擊方）。 */
function ehp({ defenderIds, attackerIds, attackerArch }) {
  const taken = outputOnce({ attackerIds, defenderIds, arch: attackerArch }).total;
  const d = computeCombatStats(defenderIds, {});
  return (refMaxHp + d.hp) / Math.max(1e-9, taken);
}

const out = { tool: "moba-item-power.v1", refMaxHp: r2(refMaxHp), constants: COMBAT_CONSTANTS, byArch: {} };
//  代表性攻擊方（量坦克生存時用）：滿裝射手
const adcFull = fullBuild("射手");

for (const arch of ARCHETYPES) {
  const ids = fullBuild(arch);
  const zero = [];
  const vsZero = (attackerIds) => outputOnce({ attackerIds, defenderIds: zero, arch }).total;
  const outputMult = vsZero(ids) / vsZero(zero);
  //  同時滿裝 vs 同時零裝：對稱局的輸出倍率（TTK 用這個）
  const mirrorOn = outputOnce({ attackerIds: ids, defenderIds: ids, arch }).total;
  const mirrorOff = outputOnce({ attackerIds: zero, defenderIds: zero, arch }).total;
  const dOn = computeCombatStats(ids, {});
  //  ⚠ TTK 要用**每秒**傷害，不是 D0=1 的單位傷害（第一版算出「2987 秒」就是這個錯）。
  //  每秒 D0 ＝ 參考 power × dmgK（引擎傷害式的同一組係數）；參考 power 取 audit 實測的
  //  20 分英雄平均（`reports/moba-siege-tempo-m4b6/audit` heroPowerMean ≈ 56）。
  const D0_PER_SEC = REF_POWER * (prog.SIM_RULES.v3.dmgK ?? 0.65);
  const ttkOn = (refMaxHp + dOn.hp) / Math.max(1e-9, mirrorOn * D0_PER_SEC);
  const ttkOff = refMaxHp / Math.max(1e-9, mirrorOff * D0_PER_SEC);
  const spikes = [1, 2, 3, 4, 5, 6].map((n) => r3(vsZero(partial(ids, n)) / vsZero(zero)));
  out.byArch[arch] = {
    build: ids,
    outputMult: r3(outputMult),
    outputMultMirror: r3(mirrorOn / mirrorOff),
    //  ⚠ EHP 倍率必須用**同一個攻擊方**比較（分子分母都固定同一個攻擊者），
    //    否則量到的是「攻擊方也變強了」，第一版就是這個錯，全部算出 < 1。
    ehpMultVsFullAdc: r3(ehp({ defenderIds: ids, attackerIds: adcFull, attackerArch: "射手" })
      / ehp({ defenderIds: zero, attackerIds: adcFull, attackerArch: "射手" })),
    ehpMultVsZeroAdc: r3(ehp({ defenderIds: ids, attackerIds: zero, attackerArch: "射手" })
      / ehp({ defenderIds: zero, attackerIds: zero, attackerArch: "射手" })),
    hpBonus: r2(dOn.hp), armor: r2(dOn.armor), mr: r2(dOn.mr), ad: r2(dOn.ad), ap: r2(dOn.ap),
    ttkMirrorOn: r2(ttkOn), ttkMirrorOff: r2(ttkOff), ttkRatio: r3(ttkOn / ttkOff),
    spikeByItemCount: spikes,
  };
}

const OUT = path.resolve(ROOT, arg("out", "reports/moba-items-m4c/power.json"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
console.log(`refMaxHp(18級) ${out.refMaxHp}`);
for (const [arch, v] of Object.entries(out.byArch)) {
  console.log(arch.padEnd(3), "outputMult", String(v.outputMult).padStart(6), "mirror", String(v.outputMultMirror).padStart(6),
    "ehpVsFullAdc", String(v.ehpMultVsFullAdc).padStart(6), "ehpVsZeroAdc", String(v.ehpMultVsZeroAdc).padStart(6),
    "ttk(on/off)", `${v.ttkMirrorOn}/${v.ttkMirrorOff}`, "spikes", v.spikeByItemCount.join(">"));
}
console.log("→", path.relative(ROOT, OUT));
