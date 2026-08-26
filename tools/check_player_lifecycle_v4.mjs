#!/usr/bin/env node
// ============================================================================
//  tools/check_player_lifecycle_v4.mjs — Season vNext V4：生涯階段與市場價值
//
//  執行：repo 根目錄 `node tools/check_player_lifecycle_v4.mjs`；失敗 exit 1。
//
//  ── 這一輪解什麼 ─────────────────────────────────────────────────────────
//  V4 之前，年齡在整個主幹上的足跡**只有一個函式**（`ageEfficiency`），
//  而且它只作用在「未來還能進步多少」。結果是：
//    35 歲綜合 85 與 22 歲綜合 85 在遊戲觀察得到的每個面向上**完全相同**
//    ——同樣的比賽輸出、同樣的週薪、同樣的身價、名單列上同樣的一行。
//  ⇒ 沒有任何機制讓老將變得不值得留。**換血沒有驅動力。**
//
//  V4 的裁決是**改變價值，不改變能力**：
//    ① 生涯階段變成真的（推導），讓年齡變得**看得見**
//    ② 市場價值開始吃年齡，讓年齡**有代價**
//
//  ── 本輪明確不做（由 §N 反向釘住）─────────────────────────────────────────
//  能力衰退、退休、Off-season、AI 老化、選手離隊。
//  **週薪一個位元都不動**——Audit 已證明不需要同步調整：
//  `weeklySettlement.js` 明寫「薪資唯一來源 = economy/salary.js，不再讀
//  players[].salary」⇒ 動市場價值結構上碰不到週薪。
//
//  §S 階段判定　§R 節奏（早熟／晚熟）　§J 不跳階　§V 市場價值
//  §A 不變式　§U 畫面　§N 本輪邊界　§M sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const soft = async (p) => { try { return await imp(p); } catch { return null; } };

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_STAGE = "src/platform/progress/careerStage.js";
const P_MARKET = "src/platform/economy/marketValue.js";
const P_UI = "src/ui/playerProfileFoundation.js";
const P_UIX = "src/ui/PlayerProfileFoundation.jsx";
const P_TRAIN = "src/data/trainingCalculator.js";
const P_SALARY = "src/platform/economy/salary.js";
const P_STORE = "src/platform/profileStore.js";

const stage = await soft(P_STAGE);
const market = await soft(P_MARKET);
const model = await imp("src/data/playerModel.js");
const train = await imp(P_TRAIN);
const salaryMod = await imp(P_SALARY);
const recruit = await imp("src/data/recruitPool.js");
const levelGrowth = await imp("src/platform/progress/levelGrowth.js");

/** 造一個測試選手：16 項能力全設同值，再指定潛力與年齡。 */
const mk = ({ age = 22, potential = 80, at = 60, role = "中路", learning = 65 } = {}) => {
  const stats = Object.fromEntries(model.STAT_DEF.map((s) => [s.key, at]));
  stats.learning = learning;
  return { id: "t", role, age, potential, lv: 30, energy: 100, stats };
};
/** 把主能力設到「距離潛力還剩 room 點」。 */
const mkRoom = ({ age, potential = 80, room = 10, role = "中路" }) => {
  const p = mk({ age, potential, at: potential - room, role });
  return p;
};

// ════════════════════════════════════════════════════════════════════════════
//  §S 階段判定
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 階段判定】");

ck("S1) 有獨立的生涯階段純模組 `progress/careerStage.js`", !!stage, stage ? "" : "模組不存在");

ck("S2) 它是**純模組**（不 import Store / React / zustand / localStorage）",
  !!stage && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_STAGE))));

ck("S3) 五個階段是**白名單**，且**不含退役**（退役留給後續的退休事件）",
  !!stage && !!stage.CAREER_STAGES && Object.isFrozen(stage.CAREER_STAGES)
  && Object.keys(stage.CAREER_STAGES).length === 5
  && !("retired" in stage.CAREER_STAGES),
  stage?.CAREER_STAGES ? Object.keys(stage.CAREER_STAGES).join("/") : "");

ck("S4) 五個 id 就是 UI 標籤表已有的那五個（不得自創新名字）",
  !!stage && ["rookie", "growth", "peak", "mature", "veteran"]
    .every((k) => k in stage.CAREER_STAGES));

ck("S5) `careerStageOf()` 是純函式，同一個選手永遠得到同一個階段",
  !!stage && typeof stage.careerStageOf === "function"
  && (() => { const p = mk({ age: 25 }); return stage.careerStageOf(p) === stage.careerStageOf(p); })());

ck("S6) **缺年齡的舊存檔回 `null`**（不編造年齡，也不炸）",
  !!stage && stage.careerStageOf({ stats: {}, potential: 80 }) === null
  && stage.careerStageOf({ age: null, stats: {}, potential: 80 }) === null
  && stage.careerStageOf(null) === null);

ck("S7) 階段隨年齡**單調不倒退**（同一份能力，年齡越大階段越後面）",
  !!stage && (() => {
    const order = Object.keys(stage.CAREER_STAGES);
    let last = -1;
    for (let a = 16; a <= 40; a++) {
      const s = stage.careerStageOf(mkRoom({ age: a, room: 4 }));
      const i = order.indexOf(s);
      if (i < last) return false;
      last = i;
    }
    return true;
  })());

ck("S8) 每個階段在**某個年齡真的出現得到**（沒有永遠取不到的死階段）",
  !!stage && (() => {
    const seen = new Set();
    for (let a = 15; a <= 45; a++) {
      for (const room of [0, 6, 14, 22]) seen.add(stage.careerStageOf(mkRoom({ age: a, room })));
    }
    return Object.keys(stage.CAREER_STAGES).every((k) => seen.has(k));
  })(),
  !!stage ? [...new Set([15, 20, 25, 30, 35, 40].map((a) => stage.careerStageOf(mkRoom({ age: a, room: 4 }))))].join("/") : "");

ck("S9) 巔峰期在 `ageEfficiency` 轉折點（29 歲）**之前**結束——兩條曲線說同一個故事",
  !!stage && (() => {
    const at28 = stage.careerStageOf(mkRoom({ age: 28, room: 3 }));
    const at30 = stage.careerStageOf(mkRoom({ age: 30, room: 3 }));
    return at28 === "peak" && at30 !== "peak";
  })(),
  !!stage ? `28 歲 ${stage.careerStageOf(mkRoom({ age: 28, room: 3 }))}｜30 歲 ${stage.careerStageOf(mkRoom({ age: 30, room: 3 }))}` : "");

ck("S10) 主能力取自**既有**的 `levelGrowth.growthKeysFor`（不另寫一套定位規則）",
  !!stage && /growthKeysFor/.test(codeOnly(read(P_STAGE))));

// ════════════════════════════════════════════════════════════════════════════
//  §R 節奏：早熟 / 晚熟 要有不同的生涯步調
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 早熟／晚熟的節奏差異】");

ck("R1) `maturityOf()` 只吃選手現況（能力 + 潛力），**不需要歷史快照**",
  !!stage && typeof stage.maturityOf === "function"
  && Math.abs(stage.maturityOf(mkRoom({ age: 20, potential: 80, room: 0 })) - 1) < 1e-6);

ck("R2) **同齡不同節奏**：同樣 19 歲，空間快用完的比空間還很大的階段更後面",
  !!stage && (() => {
    const order = Object.keys(stage.CAREER_STAGES);
    const early = stage.careerStageOf(mkRoom({ age: 19, potential: 80, room: 1 }));   // 早熟型
    const late = stage.careerStageOf(mkRoom({ age: 19, potential: 80, room: 20 }));   // 晚熟型
    return order.indexOf(early) > order.indexOf(late);
  })(),
  !!stage ? `早熟 ${stage.careerStageOf(mkRoom({ age: 19, potential: 80, room: 1 }))}`
    + `｜晚熟 ${stage.careerStageOf(mkRoom({ age: 19, potential: 80, room: 20 }))}` : "");

ck("R3) **不是硬切年齡模板**：同一個年齡拿得到至少兩種不同階段",
  !!stage && (() => {
    for (let a = 16; a <= 30; a++) {
      const s = new Set([0, 8, 16, 24].map((room) => stage.careerStageOf(mkRoom({ age: a, room }))));
      if (s.size >= 2) return true;
    }
    return false;
  })());

//  ⚠ 上限咬得住的是**負向**那一側：年紀大但潛力空間仍很大的人，殘差可以到 −0.35，
//    ×18 就是 −6.3 年 ⇒ 沒有上限的話，33 歲會被算成巔峰期。
//    （正向那側因為 maturity 夾在 1，殘差最多 +0.13 ⇒ 本來就跨不了兩階。）
ck("R4) 偏移**有界**：33 歲、潛力空間仍很大的選手不得被算成巔峰期",
  !!stage && stage.careerStageOf(mkRoom({ age: 33, potential: 80, room: 30 })) !== "peak",
  !!stage ? `33 歲 / 空間 30 ⇒ ${stage.careerStageOf(mkRoom({ age: 33, potential: 80, room: 30 }))}`
    + `（effectiveAge ${stage.effectiveCareerAgeOf(mkRoom({ age: 33, potential: 80, room: 30 })).toFixed(2)}）` : "");

ck("R4b) 極端資料也不得把 20 歲變成老將",
  !!stage && stage.careerStageOf({ ...mk({ age: 20, potential: 1 }), stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, 99])) }) !== "veteran");

ck("R5) 偏移**隨年齡自然淡出**（30 歲的兩端差距 < 20 歲的兩端差距）",
  !!stage && (() => {
    const spread = (a) => Math.abs(
      stage.effectiveCareerAgeOf(mkRoom({ age: a, room: 0 }))
      - stage.effectiveCareerAgeOf(mkRoom({ age: a, room: 20 })));
    return spread(30) <= spread(20);
  })(),
  !!stage ? `20 歲跨度 ${Math.abs(stage.effectiveCareerAgeOf(mkRoom({ age: 20, room: 0 })) - stage.effectiveCareerAgeOf(mkRoom({ age: 20, room: 20 }))).toFixed(2)}`
    + `｜30 歲跨度 ${Math.abs(stage.effectiveCareerAgeOf(mkRoom({ age: 30, room: 0 })) - stage.effectiveCareerAgeOf(mkRoom({ age: 30, room: 20 }))).toFixed(2)}` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §J 一次訓練不得跳階（使用者指定的驗收條件）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§J 一次訓練不得跳階】");

ck("J1) 單次課程造成的 `effectiveCareerAge` 變化 < 最窄階段區間",
  !!stage && (() => {
    const courses = model.TRAINING_COURSES.filter((c) => c.id !== "rest");
    let worst = 0;
    for (const p0 of recruit.genProspects(7).slice(0, 20)) {
      const p = { ...p0, lv: 1, energy: 100, stats: { ...p0.stats } };
      const before = stage.effectiveCareerAgeOf(p);
      for (const c of courses) {
        const after = stage.effectiveCareerAgeOf(model.applyCourse(p, c.id));
        worst = Math.max(worst, Math.abs(after - before));
      }
    }
    return worst < stage.NARROWEST_BAND_YEARS;
  })());

ck("J2) **實跑整池新秀：任何單次課程都不得跳超過 1 階**",
  !!stage && (() => {
    const order = Object.keys(stage.CAREER_STAGES);
    const courses = model.TRAINING_COURSES.filter((c) => c.id !== "rest");
    for (const p0 of recruit.genProspects(46).slice(0, 30)) {
      const p = { ...p0, lv: 1, energy: 100, stats: { ...p0.stats } };
      const before = order.indexOf(stage.careerStageOf(p));
      for (const c of courses) {
        const after = order.indexOf(stage.careerStageOf(model.applyCourse(p, c.id)));
        if (Math.abs(after - before) > 1) return false;
      }
    }
    return true;
  })());

ck("J3) 年齡 +1（跨生涯年度）也不得跳超過 1 階",
  !!stage && (() => {
    const order = Object.keys(stage.CAREER_STAGES);
    for (let a = 15; a <= 44; a++) {
      for (const room of [0, 5, 12, 20]) {
        const before = order.indexOf(stage.careerStageOf(mkRoom({ age: a, room })));
        const after = order.indexOf(stage.careerStageOf(mkRoom({ age: a + 1, room })));
        if (Math.abs(after - before) > 1) return false;
      }
    }
    return true;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §V 市場價值
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§V 市場價值】");

ck("V1) 有獨立的市場價值純模組 `economy/marketValue.js`", !!market, market ? "" : "模組不存在");

ck("V2) 它是**純模組**", !!market && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_MARKET))));

ck("V3) 綜合能力沿用**既有**的 `salary.overallOf`（不另寫一套能力聚合）",
  !!market && /overallOf/.test(codeOnly(read(P_MARKET))));

ck("V4) **同能力下，老將的市場價值低於巔峰期**",
  !!market && (() => {
    const peak = market.marketValueOf(mkRoom({ age: 26, potential: 80, room: 2 }));
    const vet = market.marketValueOf(mkRoom({ age: 34, potential: 80, room: 2 }));
    return vet < peak;
  })(),
  !!market ? `26 歲 ${market.marketValueOf(mkRoom({ age: 26, potential: 80, room: 2 }))}`
    + ` → 34 歲 ${market.marketValueOf(mkRoom({ age: 34, potential: 80, room: 2 }))}` : "");

ck("V5) **同能力下，年輕高潛的市場價值高於同齡低潛**（未實現潛力就是資產）",
  !!market && (() => {
    const hi = market.marketValueOf({ ...mk({ age: 20, potential: 92, at: 62 }) });
    const lo = market.marketValueOf({ ...mk({ age: 20, potential: 66, at: 62 }) });
    return hi > lo;
  })(),
  !!market ? `潛力 92 ⇒ ${market.marketValueOf(mk({ age: 20, potential: 92, at: 62 }))}`
    + `｜潛力 66 ⇒ ${market.marketValueOf(mk({ age: 20, potential: 66, at: 62 }))}` : "");

ck("V6) 折舊**逐步**而非斷崖（相鄰年齡的落差不超過一成）",
  !!market && (() => {
    for (let a = 20; a <= 44; a++) {
      const x = market.ageMultiplier(a), y = market.ageMultiplier(a + 1);
      if (x > 0 && (x - y) / x > 0.10) return false;
    }
    return true;
  })());

ck("V7) 折舊**單調不回升**，且有下限（不歸零）",
  !!market && (() => {
    let last = Infinity, min = Infinity;
    for (let a = 15; a <= 50; a++) { const m = market.ageMultiplier(a); if (m > last) return false; last = m; min = Math.min(min, m); }
    return min > 0;
  })(),
  !!market ? `50 歲倍率 ${market.ageMultiplier(50)}` : "");

ck("V8) 折舊起點錨在 `ageEfficiency` 的轉折點（28 歲前不折舊）",
  !!market && market.ageMultiplier(28) === 1 && market.ageMultiplier(29) < 1,
  !!market ? `28 ⇒ ${market.ageMultiplier(28)}｜29 ⇒ ${market.ageMultiplier(29)}` : "");

ck("V9) 缺年齡的舊存檔**不折舊、不炸**（中性 1.0）",
  !!market && market.ageMultiplier(null) === 1 && market.ageMultiplier(undefined) === 1
  && Number.isFinite(market.marketValueOf({ stats: {}, potential: 80 })));

// ════════════════════════════════════════════════════════════════════════════
//  §A 不變式
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 不變式】");

ck("A1) **V4 不改變任何能力值**——兩支新模組都沒有寫 `stats` 的痕跡",
  !!stage && !!market
  && !/stats\s*\[|stats\s*:/.test(codeOnly(read(P_STAGE)).replace(/p\?\.stats|player\?\.stats|\.stats\s*\?\?/g, ""))
  && !/stats\s*\[[^\]]+\]\s*=/.test(codeOnly(read(P_MARKET))));

ck("A2) **年齡仍不影響比賽結果**——`LogicEngine` 讀 `.age` 次數仍為 0",
  (read("src/LogicEngine.js").match(/\.age\b/g) ?? []).length === 0,
  `${(read("src/LogicEngine.js").match(/\.age\b/g) ?? []).length} 次`);

ck("A3) **週薪公式逐值不變**（本輪明確不動週薪）",
  (() => {
    const p1 = mk({ age: 22, potential: 80, at: 70 });
    const p2 = { ...p1, age: 38 };
    return salaryMod.weeklySalaryOf(p1) === salaryMod.weeklySalaryOf(p2);
  })(),
  `22 歲與 38 歲同能力 ⇒ 週薪皆 ${salaryMod.weeklySalaryOf(mk({ age: 22, potential: 80, at: 70 }))}`);

ck("A4) 週結算仍**不讀** `players[].salary`（動市場價值碰不到週薪）",
  /不再讀\s*`?players\[\]\.salary/.test(read("src/platform/economy/weeklySettlement.js"))
  && !/players\[\]\.salary|p\.salary/.test(codeOnly(read("src/platform/economy/weeklySettlement.js"))));

ck("A5) **階段不落盤**——Store 不得寫入 `careerStage` / `marketValue` 欄位",
  !/careerStage\s*:/.test(codeOnly(read(P_STORE)))
  && !/marketValue\s*:/.test(codeOnly(read(P_STORE))));

ck("A6) `ageEfficiency` 曲線**逐值不變**（成長是 V0A/V0B 校準過的）",
  [18, 20, 24, 28, 29, 32, 34, 36].map((a) => train.ageEfficiency(a)).join(",")
  === "1.1,1.1,1.04,0.98,0.87,0.54,0.32,0.2",
  [18, 20, 24, 28, 29, 32, 34, 36].map((a) => train.ageEfficiency(a)).join(","));

// ════════════════════════════════════════════════════════════════════════════
//  §U 畫面
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U 畫面】");
const uiSrc = read(P_UI);

ck("U1) `ui/playerProfileFoundation.careerStageOf` 改讀新模組（不再等一個沒人寫的欄位）",
  /careerStage\.js|from "\.\.\/platform\/progress\/careerStage/.test(uiSrc));

ck("U2) 既有簽章不變（`{available, label, source}`）⇒ 兩個既有畫面一行都不用改",
  /available:\s*true/.test(uiSrc) && /source:/.test(uiSrc));

ck("U3) 生涯分頁看得到市場價值",
  /marketValue/i.test(read(P_UIX)) && /marketValue/i.test(uiSrc));

ck("U4) 真的選手拿得到階段標籤（不再是「未啟用」）",
  await (async () => {
    const ui = await imp(P_UI);
    const r = ui.careerStageOf(mkRoom({ age: 26, room: 3 }));
    return r?.available === true && typeof r.label === "string" && r.label !== "未啟用";
  })(),
  await (async () => { const ui = await imp(P_UI); return JSON.stringify(ui.careerStageOf(mkRoom({ age: 26, room: 3 }))); })());

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有做能力衰退 / 退休 / Off-season / AI 老化 / 離隊",
  !!stage && !!market
  && !/decline|retire|offSeason|leaveTeam|衰退|退休|離隊/i.test(read(P_STAGE) + read(P_MARKET)));

ck("N2) 兩支模組都很小（不得長成第二個養成系統）",
  !!stage && !!market
  && codeOnly(read(P_STAGE)).split("\n").length <= 70
  && codeOnly(read(P_MARKET)).split("\n").length <= 55,
  !!stage ? `stage ${codeOnly(read(P_STAGE)).split("\n").length} 行｜market ${codeOnly(read(P_MARKET)).split("\n").length} 行` : "");

ck("N3) 常數集中在各自的 frozen 物件（calibration 之後只改一處）",
  !!stage && !!market && Object.isFrozen(stage.MATURITY) && Object.isFrozen(market.MARKET));

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v4-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (stage) {
    //  A：拿掉偏移上限 ⇒ §R4 變紅（33 歲的人會被算成巔峰期）
    const A = await mutated(P_STAGE, (s) => s.replace(/maxOffsetYears:\s*[\d.]+/, "maxOffsetYears: 99"), "A-nocap");
    ck("M-A) 拿掉偏移上限 ⇒ §R4 變紅",
      A.careerStageOf(mkRoom({ age: 33, potential: 80, room: 30 })) === "peak",
      `無上限時 33 歲 ⇒ ${A.careerStageOf(mkRoom({ age: 33, potential: 80, room: 30 }))}`);

    //  B：**同時**放大權重並拿掉上限 ⇒ §J1 變紅（一次訓練就會跳階）。
    //  ⚠ 這裡刻意變異兩處，因為單獨放大 `perMaturity` **破不了 §J1**——
    //    偏移會在上限飽和，前後兩邊都貼在 ±maxOffsetYears，差值反而是 0。
    //    也就是說上限同時保護了 §R4 與 §J1，這一條 sentinel 要證明的是
    //    「兩個常數一起放掉才會出事」，而不是假裝單一常數就守得住。
    const B = await mutated(P_STAGE,
      (s) => s.replace(/perMaturity:\s*[\d.]+/, "perMaturity: 900")
        .replace(/maxOffsetYears:\s*[\d.]+/, "maxOffsetYears: 99"), "B-jumpy");
    ck("M-B) 同時放大偏移權重並拿掉上限 ⇒ §J1 變紅",
      (() => {
        const courses = model.TRAINING_COURSES.filter((c) => c.id !== "rest");
        let worst = 0;
        for (const p0 of recruit.genProspects(7).slice(0, 20)) {
          const p = { ...p0, lv: 1, energy: 100, stats: { ...p0.stats } };
          const before = B.effectiveCareerAgeOf(p);
          for (const c of courses) worst = Math.max(worst, Math.abs(B.effectiveCareerAgeOf(model.applyCourse(p, c.id)) - before));
        }
        return worst >= B.NARROWEST_BAND_YEARS;
      })());
  } else {
    ck("M-A) 拿掉偏移上限 ⇒ §R4 變紅", false, "模組不存在");
    ck("M-B) 把偏移權重放大 ⇒ §J1 變紅", false, "模組不存在");
  }

  if (market) {
    //  C：讓折舊反向 ⇒ §V4 變紅（老將反而更值錢）
    const C = await mutated(P_MARKET, (s) => s.replace(/perYearDrop:\s*[\d.]+/, "perYearDrop: -0.05"), "C-inverted");
    ck("M-C) 讓折舊反向 ⇒ §V4 變紅",
      !(C.marketValueOf(mkRoom({ age: 34, potential: 80, room: 2 })) < C.marketValueOf(mkRoom({ age: 26, potential: 80, room: 2 }))));
  } else {
    ck("M-C) 讓折舊反向 ⇒ §V4 變紅", false, "模組不存在");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_player_lifecycle_v4：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   生涯階段＝推導（age 為主軸，成熟度造成有界偏移，隨年齡自然淡出）；不落盤、不含退役。");
  console.log("   年齡只改變**市場價值**：能力、比賽結果、週薪一個位元都沒動。");
  console.log("   ⚠ 本輪不做：能力衰退／退休／Off-season／AI 老化／選手離隊。");
}
process.exit(fail === 0 ? 0 : 1);
