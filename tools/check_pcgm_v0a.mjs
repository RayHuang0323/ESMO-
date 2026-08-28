#!/usr/bin/env node
// ============================================================================
//  tools/check_pcgm_v0a.mjs — Season vNext V0A：Player Career Growth Model
//
//  執行：repo 根目錄 `node tools/check_pcgm_v0a.mjs`；**失敗時 exit 1**。
//
//  ── V0A 要證明什麼 ───────────────────────────────────────────────────────
//  主幹有**兩條**永久能力成長路徑，但只有一條認年齡：
//    · Training v1.1 → `calculateTrainingResult`，有 age / learning / condition
//    · 比賽升級     → `applyLevelGrowth`，**完全沒有年齡因子**
//  ⇒ 一名 34 歲老將靠打比賽的成長，與 18 歲新人**一模一樣**。
//  V0A 把兩條路接到同一組 PCGM 係數上，讓 match growth 真正受年齡與學習能力約束。
//
//  ── 同時要擋住的反向風險 ─────────────────────────────────────────────────
//  **Training v1.1 是 protected behavior。** 共用係數的做法是
//  `careerGrowth.js` **原樣 re-export** `trainingCalculator.js` 的函式
//  （同一個 function reference），而不是搬家或重寫
//  ⇒ `trainingCalculator.js` 零 diff，無回歸由「檔案沒被改」直接成立。
//  §G 用 **reference identity** 與 **單向依賴** 把這件事釘死。
//
//  ⚠ V0A **不做** V0B（新秀成長空間）、Career Clock、aging、lifecycle。
//  ⚠ 所有 balance 常數為 **provisional / calibration parameter**，不得標 FINAL。
//
//  §A 年齡  §B 潛力空間  §C learning  §D 上限保護  §E 冪等
//  §F Training v1.1 無回歸  §G 共用而非重寫  §H 無新產品功能
//  §S mutation sentinel
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

//  profileStore 需要 localStorage 才能走 save/load 邊界（§E 用）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const P_CAREER = "src/platform/progress/careerGrowth.js";
const P_LEVEL = "src/platform/progress/levelGrowth.js";
const P_TRAINING = "src/data/trainingCalculator.js";
const P_SETTLE = "src/platform/progress/applyMatchProgress.js";

const training = await imp(P_TRAINING);
const playerModel = await imp("src/data/playerModel.js");
const levelGrowth = await imp(P_LEVEL);
let career = null;
try { career = await imp(P_CAREER); } catch { /* Task 2 之前不存在 ⇒ 下面照實報紅 */ }

const STAT_KEYS = playerModel.STAT_DEF.map((s) => s.key);
const statsAll = (v, over = {}) => ({ ...Object.fromEntries(STAT_KEYS.map((k) => [k, v])), ...over });
/** 基準選手。刻意逐項指定，避免任何預設值悄悄影響結論。 */
const mk = (over = {}) => ({
  id: "p", name: "P", role: "中路", lv: 5, xp: 0, potential: 90,
  energy: 95, condition: "精神飽滿", rosterTier: "active",
  stats: statsAll(60), ...over,
});
const totalOf = (mod, p, levels = 1) => mod.applyLevelGrowth(p, levels).total;

// ── §A 年齡 ────────────────────────────────────────────────────────────────
console.log("\n§A 年齡真的會約束比賽成長");

/** 「比賽成長認年齡」的判準——sentinel 會拿同一個判準去測變異版。 */
function matchGrowthRespectsAge(mod) {
  const young = totalOf(mod, mk({ age: 20 }));
  const old = totalOf(mod, mk({ age: 34 }));
  return young > old;
}
{
  ck("A1) 同條件下，年輕成長期選手的比賽成長 > 老將",
    career ? matchGrowthRespectsAge(levelGrowth) : false,
    career ? `20歲 +${totalOf(levelGrowth, mk({ age: 20 }))}｜34歲 +${totalOf(levelGrowth, mk({ age: 34 }))}` : "careerGrowth.js 不存在");

  ck("A2) 年齡曲線單調（20 ≥ 24 ≥ 28 ≥ 32）",
    career ? (() => {
      const t = [20, 24, 28, 32].map((age) => totalOf(levelGrowth, mk({ age })));
      return t.every((v, i) => i === 0 || v <= t[i - 1]);
    })() : false,
    career ? [20, 24, 28, 32].map((age) => `${age}歲 +${totalOf(levelGrowth, mk({ age }))}`).join("｜") : "");

  //  舊存檔沒有 age ⇒ 係數必須是 1.0（既有 fixture 逐位元不變）
  ck("A3) 沒有 age 的選手係數為 1.0（舊存檔與既有 fixture 不受影響）",
    career ? career.ageFactor(undefined) === 1 && career.ageFactor(null) === 1 && career.ageFactor(0) === 1 : false);
}

// ── §B 潛力空間 ────────────────────────────────────────────────────────────
console.log("\n§B 潛力剩餘空間");
{
  const far = career ? totalOf(levelGrowth, mk({ age: 22, potential: 95, stats: statsAll(50) })) : 0;
  const near = career ? totalOf(levelGrowth, mk({ age: 22, potential: 95, stats: statsAll(92) })) : 0;
  ck("B1) 潛力剩餘空間越小，永久成長越低", career ? far > near : false, `距上限 45 → +${far}｜距上限 3 → +${near}`);
  ck("B2) 已達潛力上限 → 完全不成長",
    career ? totalOf(levelGrowth, mk({ age: 22, potential: 60, stats: statsAll(60) }), 10) === 0 : false);
}

// ── §C learning ────────────────────────────────────────────────────────────
console.log("\n§C 學習能力");

function matchGrowthRespectsLearning(mod) {
  const hi = totalOf(mod, mk({ age: 22, stats: statsAll(60, { learning: 90 }) }));
  const lo = totalOf(mod, mk({ age: 22, stats: statsAll(60, { learning: 40 }) }));
  return hi > lo;
}
{
  ck("C1) 其他條件相同時，learning 較高者成長較高",
    career ? matchGrowthRespectsLearning(levelGrowth) : false,
    career ? `learning 90 → +${totalOf(levelGrowth, mk({ age: 22, stats: statsAll(60, { learning: 90 }) }))}｜`
      + `40 → +${totalOf(levelGrowth, mk({ age: 22, stats: statsAll(60, { learning: 40 }) }))}` : "");
  ck("C2) 缺 learning 時退回中性值（不當掉、不歸零）",
    career ? totalOf(levelGrowth, mk({ age: 22, stats: Object.fromEntries(STAT_KEYS.filter((k) => k !== "learning").map((k) => [k, 60])) })) > 0 : false);
}

// ── §D 上限保護仍在 ────────────────────────────────────────────────────────
console.log("\n§D 上限保護");
{
  const genius = career ? levelGrowth.applyLevelGrowth(mk({ age: 18, potential: 99, stats: statsAll(20) }), 1) : { gains: {} };
  ck("D1) 單項每級成長仍受 perStatCap 約束",
    career ? Math.max(...Object.values(genius.gains)) <= levelGrowth.LEVEL_GROWTH.perStatCap : false,
    career ? `最大單項 +${Math.max(...Object.values(genius.gains))}（上限 ${levelGrowth.LEVEL_GROWTH.perStatCap}）` : "");
  ck("D2) 不會超過 99 硬上限",
    career ? Object.values(levelGrowth.applyLevelGrowth(mk({ age: 18, potential: 99, stats: statsAll(99) }), 5).stats)
      .every((v) => v <= levelGrowth.LEVEL_GROWTH.hardCap) : false);
  ck("D3) 成長不得超過潛力上限",
    career ? Object.values(levelGrowth.applyLevelGrowth(mk({ age: 18, potential: 62, stats: statsAll(60) }), 5).stats)
      .every((v) => v <= 62) : false);
  ck("D4) LEVEL_GROWTH 的四個既有常數逐字未動",
    /pointsPerLevel:\s*3\.0/.test(read(P_LEVEL)) && /roomFull:\s*25/.test(read(P_LEVEL))
      && /perStatCap:\s*1\.5/.test(read(P_LEVEL)) && /hardCap:\s*99/.test(read(P_LEVEL)));
}

// ── §E 冪等 ────────────────────────────────────────────────────────────────
console.log("\n§E 同一 MatchResult 重複結算不重複成長");
{
  let ok = false, detail = "";
  try {
    const { applyProgressToState } = await imp(P_SETTLE);
    const { createMatchProgressTransaction } = await imp("src/platform/contracts/matchProgressTransaction.js");
    const players = [mk({ id: "s1", age: 22 })];
    const state = {
      players, meta: { days: 8 }, finance: { funds: 0, transactions: [] },
      processedMatchTransactions: {}, team: { id: "t", name: "T" },
    };
    const tx = createMatchProgressTransaction({
      mode: "moba", matchId: "m-1", sourceResultVersion: "BattleResult.v2",
      teamRewards: { money: 0, fans: 0, reputation: 0 },
      playerProgress: [{ playerId: "s1", xpGained: 400, previousXp: 0, newXp: 400, previousLevel: 1, newLevel: 5, levelsGained: 4, talentPointsGained: 4, reasons: [] }],
      metadata: { winner: "us" },
    });
    const first = applyProgressToState(state, tx);
    const after = { ...state, ...first.nextState };
    const second = applyProgressToState(after, tx);
    const s1 = first.nextState.players.find((p) => p.id === "s1");
    ok = second.nextState === null && second.receipt.alreadyApplied === true
      && Object.values(s1.stats).some((v) => v > 60);
    detail = `第一次有成長、第二次 nextState=${second.nextState}`;
  } catch (e) { detail = String(e.message).slice(0, 100); }
  ck("E1) 同一 transactionId 再結算 → 完全不寫入（不重複成長）", ok, detail);
}

// ── §F Training v1.1 無回歸 ────────────────────────────────────────────────
console.log("\n§F Training v1.1 完全保留");

/**
 * golden fixture：逐項比對訓練結果。
 *
 * ⚠ 2026-08-25 Foundation Calibration 更新過這組期望值（v1.1 → v1.2）。
 *   **這是刻意的期望變更**，不是把紅燈調綠——V0A 檔頭本來就寫明
 *   「不加 floorRate，那屬 Foundation calibration，見 TD-33」，
 *   那一輪就是被指定來改這些曲線的。變更內容見 `trainingCalculator.js` 檔頭。
 *   V0A 真正要守的東西（PCGM 與 Training **共用同一個 function reference**、
 *   依賴單向）由 §G 保證，與這裡的數值無關。
 */
function trainingUnchanged(mod) {
  const g = mod.calculateTrainingResult(
    { id: "golden", name: "Golden", age: 27, potential: 90, energy: 66, learning: 70,
      stats: { focus: 60, mechanics: 60, learning: 70 } },
    playerModel.courseById("aim"));
  return mod.TRAINING_FORMULA_VERSION === "training-growth.v1.2"
    && g.gains.accuracy === 1.9 && g.gains.reflex === 1.9 && g.totalGain === 3.8
    && g.efficiency === 0.962 && g.modifiers.age === 0.995
    && g.modifiers.learning === 1.03 && g.modifiers.condition === 0.939 && g.energyAfter === 51;
}
{
  ck("F1) Training golden fixture 逐項相符", trainingUnchanged(training));

  //  ⚠ F2 原本是「`trainingCalculator.js` 對 origin/main 零 diff」。
  //    那條在 V0A 是對的（V0A 刻意不碰這個檔，所以「沒動過」就是最強的無回歸證明），
  //    但它是一條**跨 sprint 凍結**——Foundation Calibration 依 TD-33 的規劃
  //    必須改這個檔，凍結就必然失效。**退休它、不是放寬它**，
  //    改成守 V0A 真正在乎的那件事：Training 的合成方式沒有被改成別的形狀。
  ck("F2) Training 的合成方式未變：efficiency 仍恰好是 age × learning × condition",
    (() => {
      const g = training.calculateTrainingResult(
        { id: "shape", age: 24, potential: 90, energy: 80, stats: { accuracy: 50, reflex: 50, learning: 55 } },
        playerModel.courseById("aim"));
      const { age, learning, condition } = g.modifiers;
      return Math.abs(g.efficiency - Math.round(age * learning * condition * 1000) / 1000) < 1e-9;
    })(),
    "V0A 要保護的是形狀與共用關係（§G），不是某一組數值");
}

// ── §G 共用而非重寫（結構上不可能分岔）──────────────────────────────────
console.log("\n§G PCGM 與 Training 共用同一組曲線");

/** 「係數是同一個 function，不是複製一份」的判準。 */
const sharesSameCurves = (c, t) =>
  !!c && c.ageFactor === t.ageEfficiency
  && c.learningFactor === t.learningEfficiency
  && c.conditionFactor === t.conditionEfficiency;
{
  ck("G1) PCGM 的三個係數 === trainingCalculator 的同一個 function reference",
    sharesSameCurves(career, training),
    career ? "同一個 reference ⇒ 不可能各自漂移" : "careerGrowth.js 不存在");
  //  ⚠ 只看 **import 敘述**。`trainingCalculator.js` 的檔頭註解裡就寫著
  //    「本檔不得 import careerGrowth」，用裸關鍵字掃會掃到那句說明本身
  //    ⇒ 變成「把理由寫下來就變紅」的假紅，正好與目的相反。
  ck("G2) 依賴是單向的：trainingCalculator 不得 import careerGrowth",
    !/^\s*import[^;]*from\s+["'][^"']*careerGrowth[^"']*["']/m.test(read(P_TRAINING)),
    "反向依賴會讓 PCGM 的改動悄悄改到 Training");
  ck("G3) levelGrowth 向 careerGrowth 要係數（而不是自己複製一份曲線）",
    /from "\.\/careerGrowth\.js"/.test(read(P_LEVEL))
      && !/1\.08|0\.0035|0\.0018/.test(read(P_LEVEL)),
    "levelGrowth 內不得出現任何曲線常數");
}

// ── §H 沒有新產品功能 ──────────────────────────────────────────────────────
console.log("\n§H 沒有 Ranked / Live Event 新產品功能");
{
  //  ⚠ 名稱在 V0C 對齊過：`formal`/`ranked` → `official`/`competitive`。
  //    V0A 是在三層定位敲定**之前**取的名字，V0C 把比賽層級定案後改成現在這組。
  //    這是**對齊**，不是新增概念，所以斷言跟著改而不是放寬。
  ck("H1) source 契約存在且涵蓋四層（與 matchSource.js 同一組詞彙）",
    career ? ["training", "practice", "competitive", "official"].every((k) => k in (career.GROWTH_SOURCES ?? {})) : false,
    career ? Object.keys(career.GROWTH_SOURCES ?? {}).join(",") : "");
  ck("H2) 沒有任何 write path 直接指定 practice（快速練習入口尚未實作）",
    (() => {
      const hits = [];
      const walk = (dir) => {
        for (const e of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) { walk(rel); continue; }
          if (!/\.(js|jsx)$/.test(e.name)) continue;
          if (rel.endsWith("careerGrowth.js")) continue;      // 契約定義處本來就會提到
          if (/GROWTH_SOURCES\.practice/.test(read(rel))) hits.push(rel);
        }
      };
      walk("src");
      return hits.length === 0;
    })());
  ck("H3) 沒有新增 Ranked / Live Event 的 UI",
    !fs.existsSync(resolve(ROOT, "src/screens/manage/RankedScreen.jsx"))
      && !fs.existsSync(resolve(ROOT, "src/screens/common/LiveEventPanel.jsx")));
  ck("H4) 沒有為 V0A 新增玩家可見的 Practice 永久成長",
    (() => {
      const walk = (dir, out = []) => {
        for (const e of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(rel, out);
          else if (/\.(js|jsx)$/.test(e.name)) out.push(rel);
        }
        return out;
      };
      return !walk("src/screens").some((f) => /practiceGrowth|練習成長/.test(read(f)));
    })());
}

// ── §S mutation sentinel ───────────────────────────────────────────────────
console.log("\n§S mutation sentinel（把改動還原 ⇒ 對應檢查必須變紅）");
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
  if (!career) throw new Error("careerGrowth.js 不存在，sentinel 無法執行");
  //  ⚠ 變異＝**把 V0A 的改動還原**（拿掉 PCGM 乘法），不是替換成未定義的東西——
  //    後者會拋錯而不是回中性值，測到的就變成「會不會當掉」而不是「有沒有效果」。
  const A = await mutated(P_LEVEL, (s) => s.replace("* room * pcgm,", "* room,"), "A-noage");
  ck("S-A) 把 PCGM 係數從 levelGrowth 拿掉 ⇒ §A 與 §C 變紅",
    matchGrowthRespectsAge(A) === false && matchGrowthRespectsLearning(A) === false);

  //  ⚠ 錨點必須打在 golden fixture **真的會走到**的那一段：golden 是 27 歲，
  //    走的是 `a <= 28` 那條曲線，改 `a <= 20` 的回傳值對它毫無影響。
  //  ⚠ 2026-08-25：Foundation Calibration 把該段係數從 0.01 改成 0.015，錨點跟著更新。
  const T = await mutated(P_TRAINING,
    (s) => s.replace("return round3(1.10 - (a - 20) * 0.015);", "return round3(1.10 - (a - 20) * 0.03);"), "T-curve");
  ck("S-B) 動到共用曲線 ⇒ §F Training golden fixture 變紅", trainingUnchanged(T) === false);

  const C = await mutated(P_CAREER, (s) => s.replace("export const ageFactor = ageEfficiency;",
    "export const ageFactor = (a) => ageEfficiency(a);"), "C-copy");
  ck("S-C) 把 re-export 換成包一層（不再是同一個 reference）⇒ §G1 變紅",
    sharesSameCurves(C, training) === false);
} catch (e) {
  ck("S-*) sentinel 可執行", false, String(e.message).slice(0, 160));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_pcgm_v0a：${pass}/${pass + fail} 通過`);
console.log("   V0A = PCGM foundation。**FOUNDATION_COMPLETE = NO**（Foundation Calibration Gate 尚未執行）。");
console.log("   所有 balance 常數為 provisional / calibration parameter，未鎖定。");
process.exit(fail === 0 ? 0 : 1);
