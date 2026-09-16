// ============================================================================
//  tools/audit/moba_counter_thresholds.mjs — M4d counter 偵測門檻的證據
//
//  用途：量「v1 實際打得出來的 capability 分布」，用它決定 counter 偵測門檻。
//  背景：舊的 sustain 門檻 0.08 永遠達不到（v1 可達上限 0.07）⇒ heal 訊號是死碼。
//        為避免重蹈覆轍，每個門檻都必須落在本工具量到的實際分布之內。
//
//  作法：對每個定位 × 每個策略，走 buildTargets 的真實目標序列，
//        逐件累積 computeCombatStats，記錄第 1～5 件最終物品時的 capability。
//        敵方設為中性（無威脅、無裝備）⇒ 量的是「這個定位自己會長成什麼樣」。
//
//  用法：node tools/audit/moba_counter_thresholds.mjs
//  決定性：無亂數、無時間來源。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_CATALOG, getItem } from "../../src/battle/moba/items/itemCatalog.js";
import { BUILD_STRATEGIES, buildTargets } from "../../src/battle/moba/items/buildPolicy.js";
import { ARCHETYPES, computeCombatStats } from "../../src/battle/moba/items/combatStatsV1.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = "reports/moba-items-m4d/capability-distribution.json";

const SEAT_OF = { 坦克: "top", 戰士: "top", 刺客: "jungle", 法師: "mid", 射手: "adc", 輔助: "sup" };
const NEUTRAL = ["戰士", "刺客", "法師", "射手", "坦克"].map((arch) => ({ arch, healer: false, items: [] }));

const capOf = (ids) => {
  const cs = computeCombatStats(ids, {});
  return {
    armor: cs.armor, mr: cs.mr, hp: cs.hp,
    //  ap 供 burst 訊號用：現行 burstCount 以「E 族件數」判定，屬 item family 猜測，要改讀真實 AP。
    ap: Math.round(cs.ap * 10) / 10,
    critChance: Math.round(cs.critChance * 1000) / 1000,
    sustain: Math.round((cs.lifesteal + cs.omnivamp) * 1000) / 1000,
    healShieldPower: Math.round(cs.healShieldPower * 1000) / 1000,
    lowHpShield: cs.effects.some((e) => e.type === "LOW_HP_SHIELD"),
  };
};

const rows = [];
for (const arch of ARCHETYPES) {
  for (const strategy of BUILD_STRATEGIES) {
    const { targets, earlyComponent } = buildTargets({ arch, seatRole: SEAT_OF[arch], strategy, enemies: NEUTRAL });
    //  只累積「最終物品」（T2／T3，排除會被吃掉的前期組件）與靴子 —— 與出裝實際持有一致。
    const held = [];
    let finals = 0;
    for (const id of targets) {
      const it = getItem(id, ITEM_CATALOG);
      if (it.tier === "STARTER") continue;
      if (id === earlyComponent) continue;
      held.push(id);
      if (it.tier === "T2" || it.tier === "T3") {
        finals++;
        rows.push({ arch, strategy, finals, itemId: id, name: it.name, ...capOf(held) });
      }
    }
  }
}

//  ── 分布摘要：每個 capability 在「第 3 件」（v1 對局實際常見終點）與「滿裝」的值
const at = (n) => rows.filter((r) => r.finals === n && r.strategy === "standard");
const summarize = (n) => {
  const list = at(n);
  const pick = (f) => list.map((r) => [r.arch, f(r)]);
  return Object.fromEntries(["armor", "mr", "hp", "ap", "critChance", "sustain", "healShieldPower"]
    .map((k) => [k, Object.fromEntries(pick((r) => r[k]))]));
};

console.log("v1 capability 分布（standard 策略、中性敵方）\n");
for (const n of [3, 5]) {
  console.log(`── 第 ${n} 件最終物品時`);
  const s = summarize(n);
  for (const k of Object.keys(s)) {
    const vals = Object.entries(s[k]).filter(([, v]) => v > 0).map(([a, v]) => `${a} ${v}`);
    const max = Math.max(...Object.values(s[k]));
    console.log(`   ${k.padEnd(16)} 最高 ${String(max).padStart(5)}   ${vals.join("、") || "(全為 0)"}`);
  }
  console.log("");
}

//  低血護盾持有人數（滿裝、standard）
const shieldArchs = at(5).filter((r) => r.lowHpShield).map((r) => r.arch);
console.log(`低血護盾持有定位（滿裝 standard）：${shieldArchs.join("、") || "(無)"}\n`);

//  全體極值（跨定位×策略×件數）—— 門檻不得超出這個上限，否則又是死碼
const globalMax = Object.fromEntries(["armor", "mr", "hp", "ap", "critChance", "sustain", "healShieldPower"]
  .map((k) => [k, Math.max(...rows.map((r) => r[k]))]));
console.log("全體可達上限（跨定位×策略×件數）：", JSON.stringify(globalMax));

const outPath = path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ tool: "moba_counter_thresholds.v1", globalMax, rows }, null, 2), "utf8");
console.log(`\n寫入 ${OUT}`);
