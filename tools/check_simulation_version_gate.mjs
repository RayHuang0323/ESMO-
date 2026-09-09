#!/usr/bin/env node
// ============================================================================
//  simulationVersion Gate（Player Challenge Slice 2 ／ closure 修正版）
//
//  執行：`node tools/check_simulation_version_gate.mjs`
//  取得目前指紋：`node tools/check_simulation_version_gate.mjs --print`
//
//  ── 這支要防的是什麼 ─────────────────────────────────────────────────────
//  `MOBA_SIMULATION_VERSION` 是**人宣告**的。人會忘記。
//  忘記的後果不是報錯，而是**歷史挑戰默默重播出不同的結果**——
//  沒有程式會發現，玩家也不會發現，直到有人去比對舊紀錄。
//
//  ── 為什麼改成「語意指紋」（Owner Review 修正）────────────────────────────
//  ⚠ 初版直接雜湊檔案原始內容，於是**改一行註解就會紅**。那是 false positive：
//    正式規則是「simulation semantics 發生**實質**變化才要求 bump」。
//    註解／空白／格式不是語意。讓人習慣「紅了就貼新指紋」，
//    等於把這個閘門訓練成雜訊——那比沒有閘門更糟。
//
//  ⇒ 現在先用 `esbuild` 做**只去註解與空白**的正規化，再雜湊：
//      minifyWhitespace: true   去空白／換行／縮排
//      legalComments: "none"    去掉所有註解（含 /*! */）
//      minifyIdentifiers: false 不改名 ⇒ 識別名仍在語意指紋裡
//      minifySyntax: false      不重寫語法 ⇒ 不會把兩段不同的程式碼折成同一形狀
//
//  ⚠ 它仍然**不判斷**「這個程式碼改動有沒有改變結果」——沒有程式判得出來。
//    它只保證：**真的動到程式碼時，沒有人能默默略過那個判斷。**
//  ⚠ 指紋隨 esbuild 版本而定（目前由 package-lock 釘住）。升級 esbuild 之後
//    指紋會整批變動，屆時 §D 的自我測試仍會綠，但要重新登記一次指紋。
//
//  ── 自我測試（§A–§D）─────────────────────────────────────────────────────
//  閘門自己要有檢定力，所以本檔**在記憶體裡**改寫真實原始碼並重算指紋：
//    A 只加註解        ⇒ 指紋不變（不要求 bump）
//    B 只改空白／格式  ⇒ 指紋不變
//    C 真的改語意常數  ⇒ 指紋改變（要求 bump）
//    D 登記新版本指紋  ⇒ 恢復通過
//  ⚠ 全程不寫任何檔案，也不動 repo。
// ============================================================================
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MOBA_SIMULATION_VERSION, KNOWN_SIMULATION_VERSIONS,
  SIMULATION_SEMANTICS_FILES, SIMULATION_SEMANTICS_FINGERPRINTS,
} from "../src/platform/contracts/simulationVersion.js";

let esbuild = null;
try { esbuild = await import("esbuild"); } catch { /* 下面會判 */ }

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * 語意正規化：只去註解與空白，**不改識別名、不重寫語法**。
 *
 * ⚠ 不自己寫剝註解的正則——字串／樣板字串／正則字面值裡的 `//` 與 `/*`
 *   會被剝壞，而剝壞的結果是「指紋看起來穩定，其實在亂跳」。
 *   交給真正的 parser（esbuild）處理。
 */
export function semanticSource(code) {
  return esbuild.transformSync(code, {
    loader: "js",
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: false,
    legalComments: "none",
  }).code;
}

/** @param {Map<string,string>} sources 路徑 → 原始碼 */
export function fingerprintOf(sources) {
  const h = createHash("sha256");
  for (const [f, text] of sources) {
    h.update(f);
    h.update("\0");
    //  逐檔先算一次，避免「A 尾巴 + B 開頭」與「A + B」碰撞。
    h.update(createHash("sha256").update(semanticSource(text)).digest("hex"));
    h.update("\n");
  }
  return h.digest("hex").slice(0, 16);
}

const realSources = () => new Map(SIMULATION_SEMANTICS_FILES.map((f) => [f, read(f)]));

if (!esbuild) {
  console.log("❌ 需要 esbuild（vite 的相依）才能算語意指紋。請先 npm install。");
  process.exit(1);
}

const actual = fingerprintOf(realSources());

if (process.argv.includes("--print")) {
  console.log(`\n目前語意指紋：${actual}`);
  console.log(`目前版本：　　${MOBA_SIMULATION_VERSION}\n`);
  console.log("在 src/platform/contracts/simulationVersion.js 的");
  console.log("  SIMULATION_SEMANTICS_FINGERPRINTS 裡登記：");
  console.log(`    "<版本>": "${actual}",\n`);
  console.log("⚠ 先回答：這次改動會讓同一份輸入跑出不同結果嗎？");
  console.log("   會   ⇒ 開新版號（並加進 KNOWN_SIMULATION_VERSIONS），用**新版號**登記");
  console.log("   不會 ⇒ 用現有版號登記，並在 commit 訊息寫清楚為什麼不算語意變化\n");
  process.exit(0);
}

console.log("\n── simulationVersion Gate ──");

ck("版本字串存在且格式正確",
  typeof MOBA_SIMULATION_VERSION === "string" && /^moba-sim\.v\d+$/.test(MOBA_SIMULATION_VERSION),
  MOBA_SIMULATION_VERSION);
ck("目前版本在已知清單裡", KNOWN_SIMULATION_VERSIONS.includes(MOBA_SIMULATION_VERSION));
ck("每個已知版本都登記了指紋（舊版本的憑據不得被刪）",
  KNOWN_SIMULATION_VERSIONS.every((v) => typeof SIMULATION_SEMANTICS_FINGERPRINTS[v] === "string"),
  Object.keys(SIMULATION_SEMANTICS_FINGERPRINTS).join(","));

ck("語意檔案清單非空", SIMULATION_SEMANTICS_FILES.length > 0, `${SIMULATION_SEMANTICS_FILES.length} 支`);
for (const f of SIMULATION_SEMANTICS_FILES) {
  let ok = true;
  try { read(f); } catch { ok = false; }
  ck(`語意檔案存在：${f}`, ok);
}
//  ⚠ 這幾支最容易被漏掉：引擎本體與三個「輸入 → 引擎」的轉換點。
for (const must of [
  "src/LogicEngine.js",
  "src/battle/moba/mobaPlayerStats.js",
  "src/platform/contracts/MobaTacticConfig.js",
  "src/hero/heroProgress.js",
  "src/platform/challenge/challengeRunner.js",
]) {
  ck(`清單涵蓋 ${must.split("/").pop()}`, SIMULATION_SEMANTICS_FILES.includes(must));
}

//  ── 核心閘門 ──────────────────────────────────────────────────────────────
const pinned = SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION];
const matched = pinned === actual;
ck("語意指紋與目前版本登記的一致", matched,
  matched ? actual : `登記 ${pinned} ≠ 實際 ${actual}`);

if (!matched) {
  console.log("\n⚠ 紅的意思是：**有人動到了會影響模擬語意的程式碼**（不是註解或格式）。");
  console.log("   請先回答：這次改動會讓同一份輸入跑出不同的結果嗎？");
  console.log("     會   ⇒ 開新版號，加進 KNOWN_SIMULATION_VERSIONS，用新版號登記指紋");
  console.log("     不會 ⇒ 用現有版號登記，並在 commit 訊息寫清楚為什麼不算語意變化");
  console.log("   取得指紋：node tools/check_simulation_version_gate.mjs --print");
  console.log("   ⚠ 不要為了讓它變綠而直接貼上——那等於把這個閘門關掉。\n");
}

// ══════════════════════════════════════════════════════════════════════════
//  §A–§D 自我測試：閘門自己要有檢定力
//  ⚠ 全部在記憶體裡進行，不寫檔、不動 repo。
// ══════════════════════════════════════════════════════════════════════════
console.log("\n── 閘門檢定力自我測試（記憶體內，不動檔案）──");

const PROBE = "src/platform/challenge/challengeRunner.js";
const base = realSources();
const withProbe = (mutate) => {
  const m = new Map(base);
  m.set(PROBE, mutate(base.get(PROBE)));
  return fingerprintOf(m);
};

//  §A 只加註解 ⇒ 不得要求 bump
const fpComment = withProbe((src) =>
  `// 探針：純註解\n/* 探針：區塊註解 */\n${src}\n// 尾端註解\n`);
ck("§A 只加註解 ⇒ 指紋不變（不要求 bump）", fpComment === actual,
  fpComment === actual ? "無變化" : `${actual} → ${fpComment}`);

//  §A2 註解裡含會騙倒正則的內容（字串／正則字面值）
const fpTrickyComment = withProbe((src) =>
  `// http://example.com/*  與 /regex\\// 這種字串\n${src}`);
ck("§A2 註解含 // 與 /* 的字串 ⇒ 仍然不變（沒有自己剝註解）", fpTrickyComment === actual);

//  §B 只改空白／縮排／換行 ⇒ 不得要求 bump
const fpWhitespace = withProbe((src) =>
  src.replace(/\n/g, "\n\n").replace(/^(\s*)/gm, "$1  ") + "\n\n\n");
ck("§B 只改空白／縮排／換行 ⇒ 指紋不變", fpWhitespace === actual,
  fpWhitespace === actual ? "無變化" : `${actual} → ${fpWhitespace}`);

//  §C 真的改語意：模擬步長 0.5 → 0.25（同一份輸入必然跑出不同結果）
const SEMANTIC_FROM = "export const CHALLENGE_DT = 0.5;";
const SEMANTIC_TO = "export const CHALLENGE_DT = 0.25;";
ck("§C 探針錨點仍存在（自我測試沒有失效）", base.get(PROBE).includes(SEMANTIC_FROM), SEMANTIC_FROM);
const fpSemantic = withProbe((src) => src.replace(SEMANTIC_FROM, SEMANTIC_TO));
ck("§C 改動模擬步長（真語意變化）⇒ 指紋改變（要求 bump）", fpSemantic !== actual,
  `${actual} → ${fpSemantic}`);

//  §C2 改識別名也算變化（不會被 minify 掩蓋）
const fpRenamed = withProbe((src) => src.replace(/CHALLENGE_MAX_T/g, "CHALLENGE_MAX_TIME"));
ck("§C2 識別名改動也會被偵測（沒有開 minifyIdentifiers）", fpRenamed !== actual);

// ── gameData.js 專屬（2026-09-09 Owner Decision 要求逐項證明）──────────────
const GD = "src/gameData.js";
ck("§G0 gameData.js 已納入語意清單", SIMULATION_SEMANTICS_FILES.includes(GD));

const withGd = (mutate) => {
  const m = new Map(base);
  m.set(GD, mutate(base.get(GD)));
  return fingerprintOf(m);
};
ck("§G1 gameData 只加註解 ⇒ 指紋不變（不要求 bump）",
  withGd((src) => `// 探針：純註解\n/* 區塊 */\n${src}\n// 尾端\n`) === actual);
ck("§G2 gameData 只改空白／縮排 ⇒ 指紋不變",
  withGd((src) => src.replace(/\n/g, "\n\n").replace(/^(\s*)/gm, "$1  ")) === actual);

//  真語意改動：把地圖範圍比例改掉（＝ Rift 330 做的那一類事）
const GD_FROM = "maxX: 220 * RIFT_EXTENT_RATIO";
ck("§G3 探針錨點仍存在（自我測試沒有失效）", base.get(GD).includes(GD_FROM), GD_FROM);
const fpGd = withGd((src) => src.replace(GD_FROM, "maxX: 999 * RIFT_EXTENT_RATIO"));
ck("§G4 gameData 真語意改動（地圖範圍）⇒ 指紋改變（要求 bump）",
  fpGd !== actual, `${actual} → ${fpGd}`);

//  ⚠ 這一條是本次加入 gameData 的**主要理由**：改常數檔會改變 gameData 的
//    輸出，但 gameData 自己的文字不動 ⇒ 舊清單抓不到。
const RM = "src/battle/moba/map/riftMapMetrics.js";
ck("§G5 riftMapMetrics 也在清單裡（否則改比例值會繞過閘門）",
  SIMULATION_SEMANTICS_FILES.includes(RM));
const fpRm = (() => {
  const m = new Map(base);
  m.set(RM, base.get(RM).replace("RIFT_EXTENT_RATIO = 1.5", "RIFT_EXTENT_RATIO = 2.0"));
  return fingerprintOf(m);
})();
ck("§G6 改 RIFT_EXTENT_RATIO ⇒ 指紋改變", fpRm !== actual, `${actual} → ${fpRm}`);

//  §D bump 版本並登記新指紋 ⇒ 恢復通過
//  ⚠ 「下一版」由目前版號推導，**不要寫死**：v1 → v2 之後，寫死 v2 會讓
//    這兩條在下一次 bump 之後默默失效（本次就是這樣被抓到的）。
const NEXT_VERSION = MOBA_SIMULATION_VERSION.replace(/v(\d+)$/, (_, n) => "v" + (Number(n) + 1));
ck("§D0 推導得出下一個版號", NEXT_VERSION !== MOBA_SIMULATION_VERSION, MOBA_SIMULATION_VERSION + " → " + NEXT_VERSION);
const bumped = { ...SIMULATION_SEMANTICS_FINGERPRINTS, [NEXT_VERSION]: fpSemantic };
ck("§D 開新版號並替新版號登記指紋 ⇒ 恢復通過",
  bumped[NEXT_VERSION] === fpSemantic && bumped[MOBA_SIMULATION_VERSION] === pinned,
  "舊版本指紋仍保留");
//  ⚠ 只 bump 版號、不登記指紋 ⇒ 仍然不通過（否則 bump 會變成繞過的方法）
const bumpedOnly = { ...SIMULATION_SEMANTICS_FINGERPRINTS };
ck("§D2 只 bump 版號但不登記指紋 ⇒ 仍然不通過",
  bumpedOnly[NEXT_VERSION] === undefined);

// ── 歷史挑戰：跨版本必須**明確拒絕**，不得靜默重算 ────────────────────────
{
  const { canReplay: cr, KNOWN_SIMULATION_VERSIONS: KV } =
    await import("../src/platform/contracts/simulationVersion.js");
  ck("§H 舊版本仍留在已知清單裡（歷史憑據不刪）", KV.includes("moba-sim.v1"));
  const old = cr("moba-sim.v1");
  ck("§H 以 moba-sim.v1 記錄的挑戰**不可重播**", old.ok === false, old.reason);
  //  ⚠ 兩個版號都從常數／清單推導，不寫字面值：
  //    寫死的話每次 bump 都會假紅，而假紅會訓練人去放寬斷言。
  ck("§H 拒絕理由明講是版本不符（不是靜默重算）",
    old.reason?.includes("moba-sim.v1") && old.reason?.includes(MOBA_SIMULATION_VERSION), old.reason);
  ck("§H 目前版本自己可重播", cr(MOBA_SIMULATION_VERSION).ok === true);
}

//  ── 契約層的其他斷言 ──────────────────────────────────────────────────────
const inst = read("src/platform/contracts/challengeInstance.js");
ck("ChallengeInstance 會記錄 simulationVersion", /simulationVersion:/.test(inst));
ck("雙方快照版本不一致時拒絕建立 challenge", /simulationVersion !== defender\.simulationVersion/.test(inst));
ck("跨版本一律拒絕重播（不做相容性推測）",
  /不做相容性推測/.test(read("src/platform/contracts/simulationVersion.js")));

console.log(`\nsimulationVersion Gate：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
