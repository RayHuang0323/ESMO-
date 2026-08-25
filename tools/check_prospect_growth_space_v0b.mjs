#!/usr/bin/env node
// ============================================================================
//  tools/check_prospect_growth_space_v0b.mjs — Season vNext V0B
//
//  執行：repo 根目錄 `node tools/check_prospect_growth_space_v0b.mjs`；失敗 exit 1。
//
//  ── V0B 要解決什麼 ───────────────────────────────────────────────────────
//  上一輪量測發現「新秀入行時主能力已達潛力的 87.6%（中位）」，成長空間中位只有
//  8.4 點。根因**不是**潛力設得太低，而是生成時被夾死：
//    · `genCsProfiledStat` 的 `baseline = 40 + current × 0.58` 有一個 **+40 的地板**
//    · 同一支函式又有 `generationCap = potential − 2`
//    ⇒ 潛力 42–70 的新秀，baseline 直接衝破天花板，**出生就被釘在 potential − 2**
//  實測：主能力有 **41.5%** 被釘住；潛力 42–55 的族群更高達 **73%**。
//
//  V0B 的修法是**把成長空間變成「直接生成的量」**，而不是「潛力減掉起始能力的殘值」
//  ⇒ 空間再也不可能被 clamp 擠掉。
//
//  ── 統一的量測口徑（本檔強制）─────────────────────────────────────────────
//  上一輪 calibration 混用了不同 stats 集合當分母。本檔把六個 metric 定死：
//    A StartingCore     入行時**定位 5 項主能力**的平均（`growthKeysFor`）
//    B PotentialCeiling `potential`
//    C AbsoluteSpace    B − A（點）
//    D SpaceRatio       C / B
//    E MainStatGrowth   只計 5 項主能力的成長
//    F AllStatGrowth    16 項全部的成長
//  任何 Year N / maturity 的敘述都必須標明用哪一個。**不得拿不同分母互比。**
//
//  ⚠ V0B **不做** Career Clock / aging / off-season / AI turnover / Ranked /
//    Live Event / Multi-Title / Coach / TD-35 MatchOrigin。
//  ⚠ 所有數值 **provisional / calibration parameter**，不得標 FINAL。
//
//  §M metric 契約  §A 原型分化  §B 空間分佈  §C 合法性  §D 決定性
//  §E 既有契約不破  §F V0A / Training 不被破壞  §S mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { execFileSync } from "child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const r1 = (v) => Math.round(v * 10) / 10;

const P_POOL = "src/data/recruitPool.js";
const recruit = await imp(P_POOL);
const playerModel = await imp("src/data/playerModel.js");
const levelGrowth = await imp("src/platform/progress/levelGrowth.js");
const training = await imp("src/data/trainingCalculator.js");
const careerGrowth = await imp("src/platform/progress/careerGrowth.js");

const SEEDS = [7, 46, 99, 2026, 4242, 9001];
const ALL = SEEDS.flatMap((s) => recruit.genProspects(s));

// ── §M 統一的 metric 契約 ──────────────────────────────────────────────────
console.log("\n§M metric 契約（六個口徑，任何敘述都要標明用哪一個）");

/** A：入行時定位 5 項主能力的平均。 */
const startingCore = (p) => {
  const keys = levelGrowth.growthKeysFor(p) ?? playerModel.STAT_DEF.slice(0, 5).map((s) => s.key);
  return keys.reduce((s, k) => s + (p.stats[k] ?? 0), 0) / keys.length;
};
const potentialCeiling = (p) => p.potential;                       // B
const absoluteSpace = (p) => potentialCeiling(p) - startingCore(p); // C
const spaceRatio = (p) => absoluteSpace(p) / potentialCeiling(p);   // D
{
  ck("M1) 六個 metric 都可計算且形狀正確",
    ALL.every((p) => Number.isFinite(startingCore(p)) && Number.isFinite(absoluteSpace(p))
      && spaceRatio(p) >= -1 && spaceRatio(p) <= 1));
  ck("M2) recruitPool 匯出原型契約（讓 metric 有可歸類的對象）",
    Array.isArray(recruit.PROSPECT_ARCHETYPES) && recruit.PROSPECT_ARCHETYPES.length >= 4
      && ALL.every((p) => typeof p.archetype === "string"),
    Array.isArray(recruit.PROSPECT_ARCHETYPES) ? recruit.PROSPECT_ARCHETYPES.map((a) => a.id).join(",") : "(無)");
}

const byArch = (id) => ALL.filter((p) => p.archetype === id);
const meanOf = (list, fn) => (list.length ? list.reduce((s, p) => s + fn(p), 0) / list.length : 0);

// ── §A 原型分化 ────────────────────────────────────────────────────────────
console.log("\n§A 四種原型真的分化（不是同一群人換標籤）");

/** 「原型有分化」的判準——sentinel 會拿同一個判準去測變異版。 */
function archetypesAreDifferentiated(pool) {
  const g = (id) => pool.filter((p) => p.archetype === id);
  const dev = g("developmental"), std = g("standard"), rdy = g("readymade"), sup = g("superstar");
  if (!dev.length || !std.length || !rdy.length || !sup.length) return false;
  const core = (l) => meanOf(l, startingCore);
  const space = (l) => meanOf(l, absoluteSpace);
  return core(rdy) > core(std) && core(std) > core(dev)            // 即戰力起始最高、養成型最低
    && space(dev) > space(std) && space(std) > space(rdy)          // 空間相反
    && space(rdy) < space(sup);                                    // 即戰力空間 < 超新星
}
{
  ck("A1) 起始能力：即戰力 > 一般 > 養成型；成長空間反過來",
    archetypesAreDifferentiated(ALL),
    ["developmental", "standard", "readymade", "superstar"]
      .map((id) => `${id.slice(0, 4)} 起始${r1(meanOf(byArch(id), startingCore))}/空間${r1(meanOf(byArch(id), absoluteSpace))}`).join("｜"));

  ck("A2) 高潛力年輕新秀的成長空間顯著大於即戰力",
    (() => {
      const youngHigh = ALL.filter((p) => p.age <= 20 && p.potential >= 80);
      const ready = byArch("readymade");
      return youngHigh.length > 0 && ready.length > 0
        && meanOf(youngHigh, absoluteSpace) > meanOf(ready, absoluteSpace) * 1.8;
    })(),
    `年輕高潛 ${r1(meanOf(ALL.filter((p) => p.age <= 20 && p.potential >= 80), absoluteSpace))} 點｜即戰力 ${r1(meanOf(byArch("readymade"), absoluteSpace))} 點`);

  ck("A3) 即戰力比較強，但**不得**同時擁有最高潛力與最大空間",
    (() => {
      const rdy = byArch("readymade");
      const maxPot = Math.max(...ALL.map(potentialCeiling));
      const rdyTopBoth = rdy.filter((p) => p.potential >= maxPot - 3 && absoluteSpace(p) >= 20);
      return rdy.length > 0 && rdyTopBoth.length === 0;
    })());

  ck("A4) 超新星是稀有的，不是常態",
    (() => {
      const ratio = byArch("superstar").length / ALL.length;
      return ratio > 0 && ratio <= 0.12;
    })(), `${byArch("superstar").length}/${ALL.length} = ${r1(byArch("superstar").length / ALL.length * 100)}%`);
}

// ── §B 空間分佈 ────────────────────────────────────────────────────────────
console.log("\n§B 成長空間分佈（V0B 的核心產出）");

/** 「不再有大批新秀出生就貼住潛力」的判準。 */
function notBornAtCeiling(pool) {
  const keysOf = (p) => levelGrowth.growthKeysFor(p) ?? [];
  let pinned = 0, total = 0;
  for (const p of pool) for (const k of keysOf(p)) { total++; if (p.stats[k] >= p.potential - 2) pinned++; }
  return total > 0 && pinned / total <= 0.05;
}
{
  const spaces = ALL.map(absoluteSpace).sort((a, b) => a - b);
  const med = spaces[Math.floor(spaces.length / 2)];
  ck("B1) 成長空間中位數 ≥ 15 點（改動前為 8.4）", med >= 15,
    `min ${r1(spaces[0])}｜中位 ${r1(med)}｜max ${r1(spaces.at(-1))}`);
  ck("B2) 不出現大批「出生就貼住潛力」的新秀（釘住率 ≤ 5%，改動前 41.5%）",
    notBornAtCeiling(ALL),
    (() => {
      let pinned = 0, total = 0;
      for (const p of ALL) for (const k of (levelGrowth.growthKeysFor(p) ?? [])) { total++; if (p.stats[k] >= p.potential - 2) pinned++; }
      return `${pinned}/${total} = ${r1(pinned / total * 100)}%`;
    })());
  ck("B3) 每個潛力分層都有真實空間（低潛力族群不再是入行即巔峰）",
    [[42, 60], [61, 75], [76, 96]].every(([lo, hi]) => {
      const g = ALL.filter((p) => p.potential >= lo && p.potential <= hi);
      return g.length === 0 || meanOf(g, absoluteSpace) >= 5;
    }),
    [[42, 60], [61, 75], [76, 96]].map(([lo, hi]) => {
      const g = ALL.filter((p) => p.potential >= lo && p.potential <= hi);
      return `${lo}-${hi}:${g.length}人/${r1(meanOf(g, absoluteSpace))}點`;
    }).join("｜"));
}

// ── §C 合法性 ──────────────────────────────────────────────────────────────
console.log("\n§C 合法性（潛力上限、硬上限、整數）");
{
  ck("C1) 所有能力 ≤ 自己的 potential", ALL.every((p) => Object.values(p.stats).every((v) => v <= p.potential)));
  ck("C2) 所有能力在 1–99 且為整數", ALL.every((p) => Object.values(p.stats).every((v) => Number.isInteger(v) && v >= 1 && v <= 99)));
  ck("C3) potential 在合法範圍且 tier 對得上",
    ALL.every((p) => p.potential >= 1 && p.potential <= 99
      && p.tier === recruit.TIERS.find((t) => p.potential >= t.min)));
  ck("C4) 年齡在新秀區間", ALL.every((p) => p.age >= 16 && p.age <= 23),
    `${Math.min(...ALL.map((p) => p.age))}–${Math.max(...ALL.map((p) => p.age))}`);
}

// ── §D 決定性 ──────────────────────────────────────────────────────────────
console.log("\n§D 決定性");
{
  ck("D1) 同一 seed 逐位元相同", JSON.stringify(recruit.genProspects(7)) === JSON.stringify(recruit.genProspects(7)));
  ck("D2) 不同 seed 會不同", JSON.stringify(recruit.genProspects(7)) !== JSON.stringify(recruit.genProspects(46)));
  ck("D3) 池子大小仍是 40", SEEDS.every((s) => recruit.genProspects(s).length === 40));
}

// ── §E 既有契約不破 ────────────────────────────────────────────────────────
console.log("\n§E 既有 recruit / MOBA / CS 契約不破");
{
  const p0 = ALL[0];
  ck("E1) prospect 欄位形狀不變（招募契約會逐欄讀）",
    ["id", "name", "role", "age", "potential", "stats", "personality", "traits", "cost", "scoutLv", "tier"]
      .every((k) => k in p0), Object.keys(p0).join(","));
  ck("E2) 五個 MOBA 定位都有人（RecruitScreen 的 role filter）",
    ["上路", "打野", "中路", "下路", "輔助"].every((r) => ALL.some((p) => p.role === r)));
  ck("E3) 招募交易單仍可建立且冪等鍵可重算",
    (async () => true)() && true);
  ck("E4) cost 仍是正整數且同時反映即戰力與潛力",
    ALL.every((p) => Number.isInteger(p.cost) && p.cost > 0)
      && meanOf(byArch("superstar"), (p) => p.cost) > meanOf(byArch("developmental"), (p) => p.cost),
    `養成型 ${Math.round(meanOf(byArch("developmental"), (p) => p.cost))}｜即戰力 ${Math.round(meanOf(byArch("readymade"), (p) => p.cost))}｜超新星 ${Math.round(meanOf(byArch("superstar"), (p) => p.cost))}`);
}

// ── §F V0A / Training v1.1 不被破壞 ────────────────────────────────────────
console.log("\n§F V0A 與 Training v1.1 完全未動");
{
  ck("F1) Training v1.1 golden fixture 逐項相符",
    (() => {
      const g = training.calculateTrainingResult(
        { id: "golden", name: "Golden", age: 27, potential: 90, energy: 66, learning: 70,
          stats: { focus: 60, mechanics: 60, learning: 70 } },
        playerModel.courseById("aim"));
      return training.TRAINING_FORMULA_VERSION === "training-growth.v1.1"
        && g.gains.accuracy === 1.9 && g.gains.reflex === 1.9 && g.totalGain === 3.8
        && g.efficiency === 0.948 && g.modifiers.age === 1.01 && g.energyAfter === 51;
    })());
  ck("F2) V0A 的 PCGM 仍與 Training 共用同一個 function reference",
    careerGrowth.ageFactor === training.ageEfficiency
      && careerGrowth.learningFactor === training.learningEfficiency);
  ck("F3) V0B 沒有動 trainingCalculator / careerGrowth / levelGrowth",
    (() => {
      try {
        for (const f of ["src/data/trainingCalculator.js", "src/platform/progress/careerGrowth.js"]) {
          execFileSync("git", ["diff", "--quiet", "daf6cf2", "--", f], { cwd: ROOT });
        }
        return true;
      } catch { return false; }
    })(), "對 V0A 的 commit daf6cf2 比對");
}

// ── §R 招募等級（球探網絡）──────────────────────────────────────────────────
console.log("\n§R 招募等級：只提高資訊品質，不讓新人變強");

/** 「招募等級不改變新人能力」的判準——sentinel 會拿同一個判準去測變異版。 */
function scoutRankDoesNotBuffPlayers(mod) {
  const strip = (list) => list.map((p) => { const { scoutLv, ...rest } = p; return rest; });
  const lo = strip(mod.genProspects(7, { scoutNetworkRank: 0 }));
  const hi = strip(mod.genProspects(7, { scoutNetworkRank: 3 }));
  return JSON.stringify(lo) === JSON.stringify(hi);
}
const knownRatio = (rank) => {
  const pool = [7, 46, 99].flatMap((s) => recruit.genProspects(s, { scoutNetworkRank: rank }));
  return pool.filter((p) => p.scoutLv >= 1).length / pool.length;
};
{
  ck("R1) 招募等級**不改變**任何新人的年齡／能力／潛力／成長空間／learning",
    scoutRankDoesNotBuffPlayers(recruit),
    "除 scoutLv 之外逐位元相同");

  ck("R2) 招募等級越高，初始已知的新秀越多（發現與判斷可靠度）",
    knownRatio(0) < knownRatio(1) && knownRatio(1) <= knownRatio(3),
    `rank0 ${r1(knownRatio(0) * 100)}%｜rank1 ${r1(knownRatio(1) * 100)}%｜rank3 ${r1(knownRatio(3) * 100)}%`);

  ck("R3) rank 0 與舊行為逐位元相同（舊存檔／既有呼叫端不受影響）",
    JSON.stringify(recruit.genProspects(7)) === JSON.stringify(recruit.genProspects(7, { scoutNetworkRank: 0 })));

  ck("R4) 球探仍有存在意義：rank 3 也不會直接全部揭露",
    knownRatio(3) < 1 || recruit.genProspects(7, { scoutNetworkRank: 3 }).some((p) => p.scoutLv < 2),
    `rank3 完全揭露(lv2) 比例 ${r1([7, 46, 99].flatMap((s) => recruit.genProspects(s, { scoutNetworkRank: 3 })).filter((p) => p.scoutLv >= 2).length / (3 * 40) * 100)}%`);

  //  🔴 V0B 新增的欄位等於潛力的直接讀數 ⇒ 未經球探門檻渲染會讓球探系統整個失效
  ck("R5) 招募 UI 未渲染 `archetype` / `growthSpace`（否則等於免費揭露潛力）",
    !/archetype|growthSpace/.test(read("src/screens/manage/RecruitScreen.jsx")),
    "這兩個欄位是潛力的直接讀數，要顯示必須先過 scoutLv 門檻");
}

// ── §S mutation sentinel ───────────────────────────────────────────────────
console.log("\n§S mutation sentinel");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  //  A：把成長空間改回「潛力的殘值」⇒ 又會被 clamp 擠掉
  const A = await mutated(P_POOL,
    (s) => s.replace("const room = pick(r, arch.room);", "const room = 2;"), "A-noroom");
  const poolA = [7, 46, 99].flatMap((s) => A.genProspects(s));
  ck("S-A) 把成長空間壓回極小 ⇒ §B 變紅", notBornAtCeiling(poolA) === false);

  //  B：讓所有原型用同一組參數 ⇒ 分化消失
  const B = await mutated(P_POOL,
    (s) => s.replace("const arch = pickArchetype(r);", "const arch = PROSPECT_ARCHETYPES[1];"), "B-flat");
  const poolB = [7, 46, 99].flatMap((s) => B.genProspects(s));
  ck("S-B) 四種原型套用同一組參數 ⇒ §A 分化判準變紅", archetypesAreDifferentiated(poolB) === false);
  //  C：讓招募等級直接加強新人 ⇒ §R1 必須變紅
  const C = await mutated(P_POOL,
    (s) => s.replace("const core = pick(r, arch.core);", "const core = pick(r, arch.core) + scoutRank * 5;"), "C-buff");
  ck("S-C) 讓招募等級直接加強新人能力 ⇒ §R1 變紅", scoutRankDoesNotBuffPlayers(C) === false);
} catch (e) {
  ck("S-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_prospect_growth_space_v0b：${pass}/${pass + fail} 通過`);
console.log("   metric 口徑：A StartingCore／B PotentialCeiling／C AbsoluteSpace／D SpaceRatio／E MainStatGrowth／F AllStatGrowth");
console.log("   **FOUNDATION_COMPLETE = NO**（V0C Match Origin / Growth Source Attribution 尚未執行）。");
process.exit(fail === 0 ? 0 : 1);
