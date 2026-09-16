// ============================================================================
//  tools/audit/moba_counter_audit.mjs — M4d Counter Ecosystem & Build Reachability
//
//  用途：量「counter 裝有沒有理由買、買不買得到、什麼時候買」。
//
//  【為什麼用離線推演而不是引擎對局】
//   · 出裝決策完全由 buildPolicy 純函式決定（arch／strategy／敵方 items）⇒ 不需要跑戰鬥。
//   · simulatePurchaseTimeline 無引擎、無 fork worker ⇒ 記憶體安全，可在重型 gate 停跑時執行。
//   · 收入在工具端乘 income 1.9（凍結基線），使 T3 完成時點與 M4c 的配對 200-seed 可比。
//
//  用法：
//    node tools/audit/moba_counter_audit.mjs --out=reports/moba-items-m4d/counter-audit-before.json
//
//  【讀輸出前必看：origin 指標的適用範圍】
//   origin（signal:new／signal:promoted／baseline）是拿「**同一個策略**的中性對照」比出來的，
//   所以它只能在同一策略內比較，不能跨策略比。
//   例：counter 策略的中性對照自己也會把 situational 提前到核心 2 ⇒ 位置相同 ⇒ 被判成 baseline，
//   於是「高護甲 / counter」顯示 0/5，但它的絕對時點（第 2 件 @13 分）其實優於 standard（第 4 件 @20.5 分）。
//   ⇒ 跨策略比較一律看「第幾件 / 第幾分鐘」的絕對值，origin 只作同策略內的成因分類。
//
//  決定性：無亂數、無時間來源；同輸入必得同輸出。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_CATALOG, getItem } from "../../src/battle/moba/items/itemCatalog.js";
import { buildTargets, enemyProfile, BUILD_PATHS } from "../../src/battle/moba/items/buildPolicy.js";
import { buildStandardScenario, simulatePurchaseTimeline } from "../../src/battle/moba/items/offlinePurchaseSim.js";
import { computeCombatStats } from "../../src/battle/moba/items/combatStatsV1.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", "reports/moba-items-m4d/counter-audit-before.json");
const INCOME_K = Number(arg("incomeK", "1.9"));

const SEATS = ["top", "jungle", "mid", "adc", "sup"];
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const STRATEGIES = ["standard", "early", "scaling", "counter", "survival"];

//  counter 裝 → 它宣稱反制什麼（依 effects／stats 的真實 capability，不依名稱）
const COUNTER_ROLE = {
  t3_soulrend: "heal", t3_rendspear: "heal", t3_thornmail: "heal",   // GRIEVOUS_WOUNDS
  t3_pierce: "armor", t3_finalstring: "armor", t3_shadowblade: "armor", t3_nightscythe: "armor",
  t3_voidstaff: "mr",
  t3_bulwark: "crit",                                                // ANTI_CRIT
  t3_shieldbreaker: "maxHp",                                         // ⚠ ON_HIT pctMax = 反高血量，不是反護盾
  t3_calmveil: "burst", t3_psyward: "burst",
};

//  五種對位 ＋ 無威脅對照。藍方固定標準五定位，只換紅方（被反制的一方）。
const BLUE_COMP = ["戰士", "刺客", "法師", "射手", "輔助"];
//  中性對照陣容：五定位均衡、無治療旗標、無屬性堆疊傾向。
//  用途是分辨「因為偵測到威脅才買」與「本來就會買」——沒有它，核心裝會被誤計為 counter 生效。
const NEUTRAL_COMP = ["戰士", "刺客", "法師", "射手", "坦克"];
const MATCHUPS = [
  { key: "highHeal", label: "高回復 → 重傷", red: ["坦克", "戰士", "法師", "射手", "輔助"], healers: { r3: true, r5: true }, want: "heal" },
  { key: "highArmor", label: "高護甲 → 穿甲", red: ["坦克", "坦克", "坦克", "戰士", "輔助"], healers: {}, want: "armor" },
  { key: "highMr", label: "高 MR → 法穿", red: ["坦克", "坦克", "輔助", "輔助", "戰士"], healers: {}, want: "mr" },
  { key: "highCrit", label: "高暴擊 → 反暴擊", red: ["射手", "射手", "射手", "戰士", "輔助"], healers: {}, want: "crit" },
  { key: "highShield", label: "高護盾 → 破盾", red: ["坦克", "輔助", "戰士", "法師", "射手"], healers: {}, want: "shield" },
  { key: "noThreat", label: "無威脅（不可亂買）", red: ["戰士", "刺客", "法師", "射手", "坦克"], healers: {}, want: null },
];

/** 把固定情境的收入整體乘上 income 倍率（只動工具端資料，不動引擎）。 */
function scaleIncome(scenario, k) {
  if (k === 1) return scenario;
  return { ...scenario, incomes: scenario.incomes.map((e) => ({ ...e, milli: Math.round(e.milli * k) })) };
}

/** 敵方最終戰力（用真實 CombatStats，不看名稱）。 */
function enemyCapability(sim, redIds) {
  const per = redIds.map((id) => computeCombatStats(sim.players[id].inventory, {}));
  const avg = (f) => Math.round((per.reduce((s, cs) => s + f(cs), 0) / per.length) * 1000) / 1000;
  const max = (f) => Math.round(Math.max(...per.map(f)) * 1000) / 1000;
  const shields = per.filter((cs) => cs.effects.some((e) => e.type === "LOW_HP_SHIELD")).length;
  return {
    armorAvg: avg((cs) => cs.armor), armorMax: max((cs) => cs.armor),
    mrAvg: avg((cs) => cs.mr), mrMax: max((cs) => cs.mr),
    hpAvg: avg((cs) => cs.hp),
    critMax: max((cs) => cs.critChance),
    sustainMax: max((cs) => cs.lifesteal + cs.omnivamp),
    healShieldPowerMax: max((cs) => cs.healShieldPower),
    lowHpShieldCount: shields,
  };
}

function runMatchup(m, strategy) {
  const strategies = Object.fromEntries([...BLUE, "r1", "r2", "r3", "r4", "r5"].map((id) => [id, id[0] === "b" ? strategy : "standard"]));
  const scenario = scaleIncome(
    buildStandardScenario({ comps: { blue: BLUE_COMP, red: m.red }, strategies, healers: m.healers }),
    INCOME_K,
  );
  const sim = simulatePurchaseTimeline(scenario);
  const redIds = ["r1", "r2", "r3", "r4", "r5"];
  const cap = enemyCapability(sim, redIds);

  //  訊號面：用「敵方最終裝備」重算 profile／reasons（直接證明偵測到什麼）
  const enemies = redIds.map((id) => ({
    arch: sim.players[id].arch,
    healer: !!m.healers[id],
    items: sim.players[id].inventory.filter(Boolean),
  }));
  const prof = enemyProfile(enemies);

  //  ⚠ 中性對照：同定位／同策略，但敵方「無威脅、無裝備」。
  //  只有相對於它「新出現」或「位置提前」的裝備，才算是威脅偵測驅動的（signal-driven）；
  //  否則就是本來就會買的核心裝或 fallback 填充 —— 不可當成 counter 生效的證據。
  const neutralEnemies = NEUTRAL_COMP.map((arch) => ({ arch, healer: false, items: [] }));

  const players = {};
  const signalByArch = {};
  for (const id of BLUE) {
    const arch = sim.players[id].arch, seatRole = sim.players[id].seatRole;
    const actual = buildTargets({ arch, seatRole, strategy, enemies });
    const base = buildTargets({ arch, seatRole, strategy, enemies: neutralEnemies });
    signalByArch[arch] = actual.reasons.filter((r) => /^enemy|^counter|^adShare/.test(r));

    const buys = sim.events.filter((e) => e.playerId === id && e.itemId?.startsWith("t3_"));
    const t3 = buys.map((e, i) => {
      const posActual = actual.targets.indexOf(e.itemId);
      const posBase = base.targets.indexOf(e.itemId);
      return {
        itemId: e.itemId, name: getItem(e.itemId)?.name ?? e.itemId,
        tMin: Math.round((e.t / 60) * 100) / 100, nth: i + 1,
        counters: COUNTER_ROLE[e.itemId] ?? null,
        posActual, posBase,
        //  新出現 ⇒ 純粹因威脅而加入；位置提前 ⇒ 因威脅而提前。兩者都算 signal-driven。
        origin: posBase < 0 ? "signal:new" : posActual < posBase ? "signal:promoted" : "baseline",
      };
    });
    const wanted = m.want ? t3.filter((x) => x.counters === m.want && x.origin.startsWith("signal")) : [];
    players[id] = {
      arch, seatRole, t3Count: t3.length, t3,
      //  只計 signal-driven 的 counter；核心裝剛好帶穿透不算數。
      counterBought: t3.filter((x) => x.counters && x.origin.startsWith("signal")).map((x) => x.itemId),
      baselineCounters: t3.filter((x) => x.counters && x.origin === "baseline").map((x) => x.itemId),
      wantedCounter: wanted.length ? wanted[0] : null,
    };
  }

  return { strategy, capability: cap, profile: prof, signals: signalByArch, players, violations: sim.violations };
}

const results = {};
for (const m of MATCHUPS) {
  results[m.key] = { label: m.label, want: m.want, red: m.red, healers: m.healers, byStrategy: {} };
  for (const s of STRATEGIES) results[m.key].byStrategy[s] = runMatchup(m, s);
}

// ── 主控台摘要 ──────────────────────────────────────────────────────────────
console.log(`MOBA Counter Audit（income ×${INCOME_K}，離線決定性推演）\n`);
for (const [key, r] of Object.entries(results)) {
  const std = r.byStrategy.standard;
  console.log(`── ${r.label}`);
  const c = std.capability;
  console.log(`   敵方實際戰力：護甲均 ${c.armorAvg}／最高 ${c.armorMax}、魔抗均 ${c.mrAvg}／最高 ${c.mrMax}、暴擊最高 ${c.critMax}、續航最高 ${c.sustainMax}、低血護盾 ${c.lowHpShieldCount} 人`);
  console.log(`   偵測到的訊號：tank ${std.profile.tankCount}／heal ${std.profile.healCount}／burst ${std.profile.burstCount}／刺客 ${std.profile.assassinCount}／adShare ${std.profile.adShare}`);
  for (const s of STRATEGIES) {
    const v = r.byStrategy[s];
    const ps = Object.values(v.players);
    const hit = ps.filter((p) => p.wantedCounter).length;
    const when = ps.filter((p) => p.wantedCounter)
      .map((p) => `${p.arch}:${p.wantedCounter.name}@${p.wantedCounter.tMin}分(第${p.wantedCounter.nth}件,${p.wantedCounter.origin === "signal:new" ? "新增" : "提前"})`);
    //  signal-driven ＝ 因威脅而新增或提前；baseline ＝ 本來就會買（不是誤判，不算 false positive）
    const driven = [...new Set(ps.flatMap((p) => p.counterBought))];
    const baseline = [...new Set(ps.flatMap((p) => p.baselineCounters))];
    const tail = r.want === null
      ? (driven.length ? `  ⚠ 無威脅卻因訊號買了 ${driven.join("、")}` : `  ✅ 無訊號驅動購買（baseline ${baseline.length} 件不計）`)
      : (when.length ? "  " + when.join("、") : "");
    console.log(`   ${s.padEnd(9)} 對應 counter ${r.want ? `${hit}/5` : "—"}${tail}`);
  }
  console.log("");
}

const violations = Object.values(results).flatMap((r) => Object.values(r.byStrategy).flatMap((v) => v.violations));
console.log(violations.length ? `⚠ 帳務／背包違規 ${violations.length} 筆` : "帳務／背包違規：0");

const outPath = path.join(ROOT, OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ tool: "moba_counter_audit.v1", incomeK: INCOME_K, results }, null, 2), "utf8");
console.log(`\n寫入 ${OUT}`);
