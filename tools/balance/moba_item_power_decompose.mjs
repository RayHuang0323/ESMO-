#!/usr/bin/env node
// ============================================================================
//  tools/balance/moba_item_power_decompose.mjs — M4c：把滿裝戰力拆到**屬性層級**
//
//  用法：node tools/balance/moba_item_power_decompose.mjs [--out=reports/moba-items-m4c/decompose.json]
//
//  為什麼需要：`outgoingDamage` 的攻擊通道是**相乘鏈**
//      atkK = (1 + ad/K_AD) × (1 + attackSpeed) × (1 + critChance × (critDamage − 1))
//  所以「射手滿裝 4.0×」不能只看單一數字，要知道是哪一段乘出來的，才能一次只調一類參數。
//
//  做法：對每個流派的標準滿裝，逐一「歸零一個屬性家族」再重算輸出／生存，
//  差額 ÷ 全滿裝＝該家族的貢獻（乘法鏈下用「移除後掉多少」表示）。
//  走引擎同一條路徑（computeCombatStats → outgoingDamage → mitigate），不改任何係數。
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

const [cs, fx, policy, prog] = await Promise.all([
  load("src/battle/moba/items/combatStatsV1.js"),
  load("src/battle/moba/items/itemEffects.js"),
  load("src/battle/moba/items/buildPolicy.js"),
  load("src/battle/moba/matchProgression.js"),
]);
const { computeCombatStats, DAMAGE_PROFILE_BY_ARCH, ARCHETYPES } = cs;
const { outgoingDamage, mitigate, antiCritOf } = fx;

const r3 = (v) => Math.round(v * 1000) / 1000;
const BASE_HP = 560;
const refMaxHp = BASE_HP * prog.hpMultFor(18);
const SEAT_BY_ARCH = { 坦克: "top", 戰士: "top", 刺客: "jungle", 法師: "mid", 射手: "adc", 輔助: "sup" };

const fullBuild = (arch) => policy.buildTargets({ arch, seatRole: SEAT_BY_ARCH[arch] ?? "top", strategy: "standard", enemies: [] }).targets.slice(0, 6);

/** 攻擊面屬性家族（歸零後看輸出掉多少）。 */
const OFFENSE = {
  ad: (s) => { s.ad = 0; },
  attackSpeed: (s) => { s.attackSpeed = 0; },
  crit: (s) => { s.critChance = 0; },
  critDamage: (s) => { s.critDamage = 1.75; },   // 回到 COMBAT_CONSTANTS.CRIT_BASE
  ap: (s) => { s.ap = 0; },
  apAmp: (s) => { s.ap = s.ap / (1 + (s.apAmpRaw ?? 0)); },
  abilityHaste: (s) => { s.abilityHaste = 0; },
};
/** 防守面屬性家族（歸零後看有效生存掉多少）。 */
const DEFENSE = { hp: (s) => { s.hp = 0; }, armor: (s) => { s.armor = 0; }, mr: (s) => { s.mr = 0; } };

const clone = (o) => ({ ...o, effects: [...(o.effects ?? [])] });
const outputOf = (attackerCs, defenderCs, arch) => {
  const out = outgoingDamage({ D0: 1, cs: attackerCs, profile: DAMAGE_PROFILE_BY_ARCH[arch], foe: { antiCrit: antiCritOf(defenderCs), hp: refMaxHp, maxHp: refMaxHp }, lateFactor: 1 });
  const m = mitigate({ phys: out.phys, magic: out.magic, attackerCs, defenderCs });
  return m.physTaken + m.magicTaken;
};
const ehpOf = (defenderCs, attackerCs, attackerArch) => (refMaxHp + (defenderCs.hp ?? 0)) / Math.max(1e-9, outputOf(attackerCs, defenderCs, attackerArch));

const zeroCs = computeCombatStats([], {});
const adcFullCs = computeCombatStats(fullBuild("射手"), {});
const out = { tool: "moba-item-power-decompose.v1", refMaxHp: Math.round(refMaxHp * 100) / 100, byArch: {} };

for (const arch of ARCHETYPES) {
  const ids = fullBuild(arch);
  const full = computeCombatStats(ids, {});
  const baseOut = outputOf(zeroCs, zeroCs, arch);
  const fullOut = outputOf(full, zeroCs, arch);
  const offense = {};
  for (const [name, zero] of Object.entries(OFFENSE)) {
    const s = clone(full);
    zero(s);
    const without = outputOf(s, zeroCs, arch);
    offense[name] = { multWithout: r3(without / baseOut), dropPct: r3(((fullOut - without) / Math.max(1e-9, fullOut)) * 100) };
  }
  const baseEhp = ehpOf(zeroCs, adcFullCs, "射手");
  const fullEhp = ehpOf(full, adcFullCs, "射手");
  const defense = {};
  for (const [name, zero] of Object.entries(DEFENSE)) {
    const s = clone(full);
    zero(s);
    const without = ehpOf(s, adcFullCs, "射手");
    defense[name] = { multWithout: r3(without / baseEhp), dropPct: r3(((fullEhp - without) / Math.max(1e-9, fullEhp)) * 100) };
  }
  out.byArch[arch] = {
    build: ids,
    stats: { ad: full.ad, ap: full.ap, attackSpeed: full.attackSpeed, critChance: full.critChance, critDamage: full.critDamage, abilityHaste: full.abilityHaste, hp: full.hp, armor: full.armor, mr: full.mr },
    outputMult: r3(fullOut / baseOut), ehpMult: r3(fullEhp / baseEhp), offense, defense,
  };
}

const OUT = path.resolve(ROOT, arg("out", "reports/moba-items-m4c/decompose.json"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
for (const [arch, v] of Object.entries(out.byArch)) {
  const off = Object.entries(v.offense).sort((a, b) => b[1].dropPct - a[1].dropPct).slice(0, 4).map(([k, x]) => `${k} −${x.dropPct}%`).join("  ");
  const def = Object.entries(v.defense).sort((a, b) => b[1].dropPct - a[1].dropPct).map(([k, x]) => `${k} −${x.dropPct}%`).join("  ");
  console.log(arch.padEnd(3), "out", String(v.outputMult).padStart(6), "ehp", String(v.ehpMult).padStart(6), "| 輸出主因:", off, "| 生存主因:", def);
}
console.log("→", path.relative(ROOT, OUT));
