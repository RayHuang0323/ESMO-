#!/usr/bin/env node
// ============================================================================
//  tools/check_tactical_director_3c.mjs — Phase 3a-C2 Task 10：Tactical Director（static）＋引擎讀取點遷移（gate G-AC2）
//
//  執行：node tools/check_tactical_director_3c.mjs（秒級）
//
//   S  原始碼（src/LogicEngine.js，**先剝註解**）：
//      S1 引擎不得有任何 this.tk／this.tid 的讀或寫（含 [ . ?. 、(this).tk、this["tk"]、點前換行、多行解構）——整份原始碼一次掃（可跨行）；
//         C3-1 E-1 起允許清單為 0 筆（舊的觀測欄位已移除，沒有任何讀者）：出現任何一處都紅。
//      S1d 屬性記號計數（.tk／.tid／"tk"／"tid"，不論前面是誰）恰好＝0 ⇒ 自我別名、Reflect.get、this[k] 也抓得到。
//         不涵蓋：執行期組出來的鍵（"t" + "k"）、Object.entries(this) 之類的整體反射。
//      S2 Director 只在 configureMatch 建一次；建構子設 null；_tidOf／_tidPhase 是一行委派。
//      S3 戰術階段界線 480／960（含 480.0、8 * 60、16 * 60、4.8e2、0x1e0 等等價寫法）只住在 Director。
//      S4 引擎 import Director；Director 在 SIMULATION_SEMANTICS_FILES。
//      S6 引擎不呼叫 directive()——check_tactical_directive_3c B2（契約不在語意清單）的前提，兩者必須一起改。
//      N  掃描器負向自檢（記憶體內植入 ⇒ 對應檢查轉紅；只在註解裡 ⇒ 不紅）。
//   B  行為（Director 本身）：knobs 回傳同一個參照、identityOfKnobs 對應、identity 關閉 ⇒ null、phase 邊界、
//      directive 通過 validateTacticalDirective 且深凍結、不與 knobs 共用參照、不改輸入；不擲骰、不碰全域（建兩次答案相同）。
//      B11–B15（C3-1 laneFrame 的 R-4 更新，TD-3A-23 §1.4-7）：legacyMirror／不傳 ⇒ 同參照；teamRelative ⇒ 藍方同參照、紅方轉換後
//      每次同一參照且凍結、identity 不變成 null、directive 仍是己方視角；未知值丟錯。
//      S2d（同批）：configureMatch 只在收到 laneFrame 時原樣轉交 Director（`if (laneFrame !== null) directorArgs.laneFrame = laneFrame;`）。
//   E  引擎接線：未 configureMatch ⇒ director 為 null；configureMatch 後 Director 的回答＝舊式在「傳給 configureMatch 的那幾個物件」上的值（C3-1 E-1 起引擎不再有 e.tk／e.tid）；
//      Director 呼叫不消耗 rng／rng2。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/stripComments.mjs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const J = (x) => JSON.stringify(x);

const ENGINE = "src/LogicEngine.js";
const DIRECTOR = "src/battle/moba/tactics/tacticalDirector.js";
const ENGINE_CODE = stripComments(read(ENGINE));
const DIRECTOR_CODE = stripComments(read(DIRECTOR));

// ════ S：原始碼 ════════════════════════════════════════════════════════════════
//  允許清單：C3-1 E-1 起為空。舊的觀測欄位 this.tk／this.tid 已從 configureMatch 移除（aa38625 之後引擎內外都沒有讀者；
//  tools/ 與 src/ 皆已 grep 確認）。要再加例外，必須同時說明誰在讀它。
const ALLOW = [];
/**
 * 剝過註解的原始碼裡每一個 this.tk／this.tid 的出現處（回報所在行去頭尾空白）。
 * 整份原始碼一次掃（不是逐行）⇒ `\s` 與 `[^{}]*` 可以跨行：`this\n  .tk`、多行解構 `const {\n tk,\n} = this` 都抓得到。
 * `(this).tk` 也算（this 可被括號包住）。
 */
const DIRECT_RES = [
  /\(?\s*\bthis\s*\)?\s*(?:\?\.|\.)\s*(?:tk|tid)\b/g,                 // this.tk／this?.tk／(this).tk／this\n.tk
  /\(?\s*\bthis\s*\)?\s*(?:\?\.)?\[\s*["'`](?:tk|tid)["'`]\s*\]/g,     // this["tk"]／this?.["tid"]
  /\{[^{}]*\b(?:tk|tid)\b[^{}]*\}\s*=(?!=)/g,                         // 解構（右邊是什麼都算：= this、= self、多行）
];
function directHits(code) {
  const lineOf = (i) => code.slice(0, i).split("\n").length;
  const lines = code.split("\n");
  const hits = [];
  for (const re of DIRECT_RES) for (const m of code.matchAll(re)) {
    const at = m.index + (m[0].length - m[0].trimStart().length);
    hits.push({ line: lineOf(at), text: lines[lineOf(at) - 1].trim() });
  }
  return hits;
}
/**
 * 屬性記號計數：剝註解後整份引擎裡 `.tk`／`.tid`（含 `?.`、點後換行）與字串 `"tk"`／`'tid'` 出現幾次。
 * 不看前面是不是 this ⇒ 自我別名（`const self = this; self.tk`）、`Reflect.get(this, "tk")`、`this[k]`（k＝"tid"）都會讓計數變多。
 * 必須恰好＝0（允許清單為空）。
 */
const tokenCount = (code) => (code.match(/\.\s*(?:tk|tid)\b|["'`](?:tk|tid)["'`]/g) ?? []).length;
const singleSourceOk = (code) => J(directHits(code).map((h) => h.text).sort()) === J(ALLOW.map((a) => a.text).sort()) && tokenCount(code) === ALLOW.length;
const hits = directHits(ENGINE_CODE);
const hitTexts = hits.map((h) => h.text).sort();
ck(`S1 剝註解後的引擎沒有直接讀 this.tk／this.tid（整份掃、可跨行、含 (this)／解構）：出現處恰好＝允許清單（${ALLOW.length} 筆，即完全沒有）`,
  J(hitTexts) === J(ALLOW.map((a) => a.text).sort()), hits.map((h) => `${h.line}: ${h.text}`).join(" | "));
ck(`S1d 屬性記號計數（.tk／.tid／"tk"／"tid"，不論前面是誰）恰好＝0（允許清單 ${ALLOW.length} 筆）：抓自我別名與 Reflect.get`,
  tokenCount(ENGINE_CODE) === ALLOW.length, `${tokenCount(ENGINE_CODE)}`);
const BRIEF_PATTERNS = ["this.tk[", "this.tk.", "this.tk?.", "this.tid[", "this.tid.", "this.tid?."];
ck(`S1b 逐字樣式 ${BRIEF_PATTERNS.join(" ")} 在剝註解後的引擎裡一次都沒有`, BRIEF_PATTERNS.every((p) => !ENGINE_CODE.includes(p)),
  BRIEF_PATTERNS.filter((p) => ENGINE_CODE.includes(p)).join(" "));
ck("S1c 允許清單為空（不留死例外），而且 configureMatch 沒有 this.tk／this.tid 的指派",
  ALLOW.length === 0 && hits.length === 0 && !/this\.(?:tk|tid)\s*=[^=]/.test(ENGINE_CODE));
ck("S2 Director 只建立一次（configureMatch 內）；this.director 只在建構子（null）與 configureMatch 被指派",
  (ENGINE_CODE.match(/createTacticalDirector\(/g) ?? []).length === 1
  && J((ENGINE_CODE.match(/this\.director = [^;]+;/g) ?? [])) === J(["this.director = null;", "this.director = createTacticalDirector(directorArgs);"])
  //  C3-1：引數物件固定是 { blue: kBlue, red: kRed, identity: tid }，只在有 phases 時多掛 phases＋clock（讀 this.t）。
  && ENGINE_CODE.includes("const directorArgs = { blue: kBlue, red: kRed, identity: tid };")
  && ENGINE_CODE.includes("if (phases) { directorArgs.phases = phases; directorArgs.clock = () => this.t; }")
  && /configureMatch\(\{[^)]*\} = \{\}\) \{[\s\S]*?this\.director = createTacticalDirector\(/.test(ENGINE_CODE.slice(ENGINE_CODE.indexOf("configureMatch({"), ENGINE_CODE.indexOf("_joinChance(K, hot"))));
ck("S2d C3-1 laneFrame：configureMatch 收 laneFrame（預設 null）且只在收到時原樣轉交 Director（轉換只在 Director 做）",
  ENGINE_CODE.includes("phases = null, laneFrame = null } = {}) {") && ENGINE_CODE.includes("if (laneFrame !== null) directorArgs.laneFrame = laneFrame;")
  && (ENGINE_CODE.match(/\blaneFrame\b/g) ?? []).length === 4);
ck("S2b _tidOf／_tidPhase 是一行委派給 Director",
  ENGINE_CODE.includes("_tidOf(side) { return this.director ? this.director.identity(side) : null; }")
  && ENGINE_CODE.includes("_tidPhase() { return this.director.phase(this.t); }"));
ck("S2c 每一個 knobs 讀取點在未啟用戰術時仍回 null（`this.tacticOn ? this.director.knobs(…) : null`；configureMatch 內那一處除外）",
  (ENGINE_CODE.match(/this\.director\.knobs\(/g) ?? []).length === (ENGINE_CODE.match(/this\.tacticOn \? this\.director\.knobs\((?:side|p\.side)\) : null/g) ?? []).length + 1);
//  階段界線的數字寫法（便宜抓得到的那幾種）：
//   涵蓋：480／960 本身與小數尾（480.0、960.00）、指數（4.8e2、48e1、9.6e2、96e1）、十六進位（0x1e0、0x3c0）、
//         分×60 的乘式（8 * 60、16 * 60、60 * 8、60 * 16，空白任意）。
//   不涵蓋：其他算式（240 * 2、500 - 20）、具名常數（const EARLY = 8; EARLY * 60）、執行期組出來的值。
const PHASE_FORMS = [
  /(?<![\w.])(?:480|960)(?:\.0*)?(?![\w.])/g, /(?<![\w.])(?:4\.8e2|48e1|9\.6e2|96e1)(?![\w.])/gi, /(?<![\w.])0x0*(?:1e0|3c0)(?![\w.])/gi,
  /(?<![\w.])(?:8|16)(?:\.0*)?\s*\*\s*60(?:\.0*)?(?![\w.])/g, /(?<![\w.])60(?:\.0*)?\s*\*\s*(?:8|16)(?:\.0*)?(?![\w.])/g,
];
const phaseHits = (code) => PHASE_FORMS.flatMap((re) => code.match(re) ?? []);
const phaseOk = (code) => phaseHits(code).length === 0;
const dirPhase = phaseHits(DIRECTOR_CODE);
ck("S3 戰術階段界線（480／960 及其等價寫法：480.0、8 * 60、16 * 60、4.8e2、0x1e0…）只住在 Director：剝註解後引擎 0 次、Director 恰好 480 與 960 各 1 次",
  phaseOk(ENGINE_CODE) && J(dirPhase.slice().sort()) === J(["480", "960"]), `引擎 [${phaseHits(ENGINE_CODE).join(",")}]、Director [${dirPhase.join(",")}]`);
//  directive() 不在引擎熱路徑上——這正是 check_tactical_directive_3c B2「tacticalDirective.js 不在 SIMULATION_SEMANTICS_FILES」的前提。
//  兩者必須一起改：引擎一旦呼叫 directive()，契約檔的內容就會影響結果，必須進語意清單（並改 B2 與 v21 指紋）。
const directiveCalls = (code) => (code.match(/\.\s*directive\s*\(|\[\s*["'`]directive["'`]\s*\]/g) ?? []).length;
const directiveOk = (code) => directiveCalls(code) === 0;
const CONTRACT = "src/platform/contracts/tacticalDirective.js";
ck("S6 引擎（剝註解）不呼叫 Director 的 directive()——check_tactical_directive_3c B2（契約不在語意清單）的前提",
  directiveOk(ENGINE_CODE),
  directiveOk(ENGINE_CODE) ? "" : `引擎呼叫了 directive() ${directiveCalls(ENGINE_CODE)} 次：要在引擎呼叫它，必須同時把 ${CONTRACT} 加進 SIMULATION_SEMANTICS_FILES（並改 check_tactical_directive_3c B2、重新登記 v21 指紋）`);
//  S7（C3-1 G-AC2 增補）：每時期方針的挑選邏輯只住在 Director。剝註解後的引擎：
//   · 不得對 phases 做任何索引（`phases[`、`phases?.[`、`.phases[`、`.at(` 於 phases 上）；
//   · `phases` 這個識別字只出現在 configureMatch 的「收下、原樣轉交 Director」那幾處（恰好 4 次）；
//   · 呼叫 `.phase(` 的地方＝允許清單（只有 _tidPhase 的一行委派）。
const PHASE_CALL_ALLOW = ["_tidPhase() { return this.director.phase(this.t); }"];
const phasesIndexHits = (code) => (code.match(/\bphases\s*(?:\?\.)?\s*\[|\bphases\s*(?:\?\.|\.)\s*at\s*\(/g) ?? []).length;
const phasesTokenCount = (code) => (code.match(/\bphases\b/g) ?? []).length;
const phaseCallLines = (code) => code.split("\n").filter((l) => /\.\s*phase\s*\(/.test(l)).map((l) => l.trim());
const phaseSelectOk = (code) => phasesIndexHits(code) === 0 && phasesTokenCount(code) === 4 && J(phaseCallLines(code)) === J(PHASE_CALL_ALLOW);
ck("S7 每時期方針的挑選只住在 Director：剝註解後的引擎沒有 phases 索引、phases 只在 configureMatch 原樣轉交（4 次）、.phase( 呼叫點＝允許清單（_tidPhase 1 處）",
  phaseSelectOk(ENGINE_CODE), `索引 ${phasesIndexHits(ENGINE_CODE)}、phases 記號 ${phasesTokenCount(ENGINE_CODE)}、.phase( [${phaseCallLines(ENGINE_CODE).join(" | ")}]`);
ck("S7b Director 自己確實做每時期挑選（core.v1 以 phase(t) 查表；static 不看 phases）",
  /table\[side\]\[phase\(t\)\]/.test(DIRECTOR_CODE) && /if \(phases\) return coreDirector\(/.test(DIRECTOR_CODE));
const SV = await imp("src/platform/contracts/simulationVersion.js");
ck("S4 引擎 import Director；Director 在 SIMULATION_SEMANTICS_FILES",
  /import\s*\{\s*createTacticalDirector\s*\}\s*from\s*["']\.\/battle\/moba\/tactics\/tacticalDirector\.js["']/.test(ENGINE_CODE) && SV.SIMULATION_SEMANTICS_FILES.includes(DIRECTOR));
ck("S5 Director 本身不讀 ruleset（C2 只有 static）、不 import 引擎、不用 Math.random／Date",
  !/ruleset|rules\b|LogicEngine|Math\.random|Date\b/.test(DIRECTOR_CODE));

// ── N：掃描器負向自檢 ──
{
  const plant = (line) => directHits(stripComments(read(ENGINE).replace("_tidPhase() {", `${line}\n  _tidPhase() {`))).length - hits.length;
  ck("N1 植入 `const x = this.tk[side];` ⇒ 抓到", plant("const x = this.tk[side];") === 1);
  ck("N2 植入 `const y = this.tid?.blue;` ⇒ 抓到", plant("const y = this.tid?.blue;") === 1);
  ck("N3 植入 `const { tk } = this;` ⇒ 抓到", plant("const { tk } = this;") === 1);
  ck("N4 植入 `const z = this[\"tid\"];` ⇒ 抓到", plant('const z = this["tid"];') === 1);
  ck("N5 只在註解裡（`// this.tk[side]`、`/* this.tid.blue */`）⇒ 不抓", plant("// this.tk[side]\n  /* this.tid.blue */") === 0);
  ck("N6 `this.tidObs` 不是 this.tid（字界）⇒ 不抓", plant("const o = this.tidObs.blue;") === 0);
  //  以下：在記憶體內的引擎複本植入一段程式碼，對應的檢查必須轉紅（真檔不動）。
  const mutated = (snippet) => stripComments(read(ENGINE).replace("_tidPhase() {", `_planted() {\n    ${snippet}\n  }\n  _tidPhase() {`));
  ck("N0 對照：未植入時三個檢查都綠（singleSourceOk／phaseOk／directiveOk）", singleSourceOk(ENGINE_CODE) && phaseOk(ENGINE_CODE) && directiveOk(ENGINE_CODE));
  const reds = [
    ["N8 多行解構 `const {\\n tk,\\n} = this`", "const {\n      tk,\n    } = this;"],
    ["N9 自我別名 `const self = this; self.tk`", "const self = this; return self.tk;"],
    ["N10 括號 `(this).tk`", "return (this).tk.blue;"],
    ["N11 `Reflect.get(this, 'tk')`", "return Reflect.get(this, 'tk');"],
    ["N12 點前換行 `this\\n  .tk`", "return this\n      .tk;"],
    ["N13 `this[k]`（k = \"tid\"）", "const k = \"tid\"; return this[k];"],
    ["N14 多行解構右邊不是 this（`= self`）", "const self = this;\n    const {\n      tid: I,\n    } = self;"],
  ];
  for (const [label, snippet] of reds) ck(`${label} ⇒ 單一讀取來源檢查轉紅`, !singleSourceOk(mutated(snippet)));
  for (const [label, snippet] of [["N15 `480.0`", "return this.t < 480.0;"], ["N16 `8 * 60`", "return this.t < 8 * 60;"], ["N17 `16*60`", "return this.t < 16*60;"],
    ["N18 `60 * 16`", "return this.t < 60 * 16;"], ["N19 `4.8e2`", "return this.t < 4.8e2;"], ["N20 `0x3c0`", "return this.t < 0x3c0;"], ["N7 `480`", "return this.t < 480;"]])
    ck(`${label} 植回引擎 ⇒ 階段界線檢查（S3）轉紅`, !phaseOk(mutated(snippet)));
  ck("N21 引擎呼叫 `this.director.directive(\"blue\", this.t)` ⇒ S6 轉紅", !directiveOk(mutated('return this.director.directive("blue", this.t);')));
  ck("N22 引擎呼叫 `this.director[\"directive\"](…)` ⇒ S6 轉紅", !directiveOk(mutated('return this.director["directive"]("red", 0);')));
  ck("N24 引擎植入 `const K = this._ph.blue[this.director.phase(this.t)].knobs;`（引擎自己依時期挑） ⇒ S7 轉紅", !phaseSelectOk(mutated("return this._ph.blue[this.director.phase(this.t)].knobs;")));
  ck("N25 引擎植入 `return phases[1];` ⇒ S7 轉紅", !phaseSelectOk(mutated("const phases = this._p; return phases[1];")));
  ck("N26 引擎植入 `return this._p.phases?.[2];` ⇒ S7 轉紅", !phaseSelectOk(mutated("return this._p.phases?.[2];")));
  ck("N27 對照：只在註解裡的 `phases[1]`、`this.director.phase(t)` ⇒ S7 不紅", phaseSelectOk(mutated("// phases[1] this.director.phase(t)\n    /* phases?.[0] */ return 1;")));
  ck("N23 對照：只在註解裡的 `.directive(`、`480`、`self.tk` ⇒ 三個檢查都不紅", (() => { const c = mutated("// this.director.directive(\"blue\", 480); self.tk\n    /* Reflect.get(this, 'tk') */ return 1;"); return singleSourceOk(c) && phaseOk(c) && directiveOk(c); })());
}

// ════ B：Director 行為 ════════════════════════════════════════════════════════
const Dir = await imp(DIRECTOR);
const TD = await imp("src/platform/contracts/tacticalDirective.js");
const TC = await imp("src/platform/contracts/MobaTacticConfig.js");
const RULESET = await imp("src/platform/contracts/matchRuleset.js");
const tA = TC.mobaTacticById("m2"), tB = TC.STANDARD_OPP_TACTIC;
const deepFrozen = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
const mk = (withId = true) => {
  const blue = TC.toEngineTactic(tA), red = TC.toEngineTactic(tB);
  const identity = withId ? { blue: TC.toEngineTacticIdentity(tA), red: TC.toEngineTacticIdentity(tB) } : null;
  return { blue, red, identity };
};
const realRandom = Math.random;
let randomCalls = 0;
Math.random = () => { randomCalls++; return realRandom(); };
try {
  const inp = mk(true);
  const snapIn = J(inp);
  const d = Dir.createTacticalDirector(inp);
  ck("B1 沒有 phases ⇒ mode＝static；TACTICAL_DIRECTOR_MODES＝[static, core.v1]（Director 轉出的就是契約 matchRuleset.js 的同一個物件，不是第二份定義）；Director 物件凍結", d.mode === "static" && J(Dir.TACTICAL_DIRECTOR_MODES) === J(["static", "core.v1"]) && Object.isFrozen(d) && Object.isFrozen(Dir.TACTICAL_DIRECTOR_MODES) && Dir.TACTICAL_DIRECTOR_MODES === RULESET.TACTICAL_DIRECTOR_MODES);
  ck("B2 knobs(side) 回傳傳入的**同一個參照**（藍／紅分開，不互串）", d.knobs("blue") === inp.blue && d.knobs("red") === inp.red && d.knobs("blue") !== d.knobs("red"));
  ck("B2b knobs 物件不被凍結、不被改（static 不複製也不碰）", !Object.isFrozen(inp.blue) && !Object.isFrozen(inp.blue.laneOffset) && J(inp) === snapIn);
  ck("B3 identity(side) 回傳傳入的同一個參照", d.identity("blue") === inp.identity.blue && d.identity("red") === inp.identity.red && d.hasIdentity() === true);
  ck("B4 identityOfKnobs：藍 knobs ⇒ 藍 identity、紅 ⇒ 紅、別的物件／null ⇒ null（以參照比對：內容相同的複本也是 null）",
    d.identityOfKnobs(inp.blue) === inp.identity.blue && d.identityOfKnobs(inp.red) === inp.identity.red
    && d.identityOfKnobs({ ...inp.blue }) === null && d.identityOfKnobs(null) === null && d.identityOfKnobs(undefined) === null);
  const off = Dir.createTacticalDirector(mk(false));
  ck("B5 identity 關閉（null）⇒ identity(side)、identityOfKnobs 一律 null；hasIdentity＝false；knobs 照常",
    off.identity("blue") === null && off.identity("red") === null && off.identityOfKnobs(off.knobs("blue")) === null && off.identityOfKnobs(off.knobs("red")) === null && off.hasIdentity() === false && !!off.knobs("blue"));
  const half = Dir.createTacticalDirector({ ...mk(false), identity: { blue: TC.toEngineTacticIdentity(tA), red: null } });
  ck("B5b 只有一側有 identity ⇒ 另一側 null（＝舊式 `identity.red ?? null`）", half.identity("red") === null && half.identityOfKnobs(half.knobs("red")) === null && half.identity("blue") !== null);
  const same = TC.toEngineTactic(tA);
  const sameD = Dir.createTacticalDirector({ blue: same, red: same, identity: { blue: { tag: "b" }, red: { tag: "r" } } });
  ck("B5c 兩側傳同一個 knobs 物件 ⇒ identityOfKnobs 回藍方（與舊式 `K === tk.blue ? … : K === tk.red ? …` 同序；C3 改成顯式 side 前不得改）", sameD.identityOfKnobs(same)?.tag === "b");
  const P = [[0, 0], [479.9, 0], [480, 1], [959.9, 1], [960, 2], [3000, 2]];
  ck(`B6 phase 邊界：${P.map(([t, p]) => `${t}→${p}`).join("、")}`, P.every(([t, p]) => d.phase(t) === p), P.map(([t]) => d.phase(t)).join(","));
  const dirB = d.directive("blue", 500);
  ck("B7 directive 通過 validateTacticalDirective、schema＝TacticalDirective.v1、side／phase 正確", TD.validateTacticalDirective(dirB).ok && dirB.schema === TD.TACTICAL_DIRECTIVE_VERSION && dirB.side === "blue" && dirB.phase === 1);
  ck("B8 directive 深凍結、不與 knobs／identity 共用參照、值相同", deepFrozen(dirB) && dirB.knobs !== inp.blue && dirB.knobs.laneOffset !== inp.blue.laneOffset && dirB.identity !== inp.identity.blue
    && J(dirB.knobs) === J(inp.blue) && J(dirB.identity) === J(inp.identity.blue));
  ck("B8b directive 之後輸入仍未被凍結或改動", !Object.isFrozen(inp.blue) && J(inp) === snapIn);
  ck("B8c identity 關閉 ⇒ directive.identity＝null 且仍有效；紅方 phase 2", (() => { const x = off.directive("red", 960); return x.identity === null && x.phase === 2 && x.side === "red" && TD.validateTacticalDirective(x).ok; })());
  const answers = (D) => J([D.knobs("blue"), D.knobs("red"), D.identity("blue"), D.identity("red"), D.hasIdentity(), P.map(([t]) => D.phase(t)), D.directive("blue", 10), D.directive("red", 1000)]);
  const in2 = mk(true);
  ck("B9 同樣的輸入建兩次 ⇒ 回答完全相同（沒有模組層級狀態）", answers(Dir.createTacticalDirector(in2)) === answers(Dir.createTacticalDirector(in2)) && answers(d) === answers(Dir.createTacticalDirector(mk(true))));
  //  ── R-4 更新（C3-1 laneFrame，TD-3A-23 §1.4-7；登記檔 supportGates「check_tactical_director_3c (after its R-4 update)」）──
  //  「knobs(side) 與設定物件同參照」改成：legacyMirror（含不傳）⇒ 同參照（上面 B2 照舊）；teamRelative ⇒ 藍方同參照、
  //  紅方等於轉換結果且每次呼叫同一參照（凍結），identity 反查不變成 null；directive 仍是設定的己方視角。
  {
    const tr = mk(true);
    const snapTr = J(tr);
    const dt = Dir.createTacticalDirector({ ...tr, laneFrame: "teamRelative" });
    const lgIn = mk(true);
    const dl = Dir.createTacticalDirector({ ...lgIn, laneFrame: "legacyMirror" });
    const r1 = dt.knobs("red");
    ck("B11 R-4（legacyMirror）：明寫 legacyMirror 與不傳相同——兩側都是傳入的同一個參照、不凍結；Director 的 laneFrame 欄位＝legacyMirror",
      dl.laneFrame === "legacyMirror" && d.laneFrame === "legacyMirror" && dl.knobs("red") === lgIn.red && dl.knobs("blue") === lgIn.blue
      && dl.identityOfKnobs(lgIn.red) === lgIn.identity.red && !Object.isFrozen(lgIn.red));
    ck("B12 R-4（teamRelative）：藍方是傳入的同一個參照；紅方是另一個物件、每次呼叫同一參照、凍結；輸入不被凍結或改動",
      dt.knobs("blue") === tr.blue && r1 !== tr.red && [0, 1, 2, 3].every(() => dt.knobs("red") === r1) && Object.isFrozen(r1) && !Object.isFrozen(tr.red) && J(tr) === snapTr);
    ck("B13 R-4（teamRelative）：identity 照舊（identity(side)、identityOfKnobs(交給引擎的 knobs)）；複本 ⇒ null",
      dt.identity("red") === tr.identity.red && dt.identityOfKnobs(r1) === tr.identity.red && dt.identityOfKnobs(tr.blue) === tr.identity.blue && dt.identityOfKnobs({ ...r1 }) === null);
    ck("B14 R-4（teamRelative）：directive 仍是設定的己方視角（knobs 內容＝傳入的紅方設定，不是轉換後的世界路名）",
      J(dt.directive("red", 0).knobs) === J(tr.red) && J(dt.directive("blue", 0).knobs) === J(tr.blue));
    let threw = false;
    try { Dir.createTacticalDirector({ ...mk(true), laneFrame: "worldFrame" }); } catch (e) { threw = e instanceof TypeError; }
    ck("B15 未知的 laneFrame ⇒ 建立時丟 TypeError；laneFrame 值清單＝契約 matchRuleset.js 的同一個物件", threw && Dir.LANE_FRAMES === RULESET.LANE_FRAMES);
  }
  ck("B10 Director 從建立到所有回答都沒有呼叫 Math.random", randomCalls === 0, `${randomCalls} 次`);
} finally { Math.random = realRandom; }

// ════ E：引擎接線 ════════════════════════════════════════════════════════════
const { LogicEngine } = await imp(ENGINE);
{
  const e0 = new LogicEngine(5);
  ck("E1 未 configureMatch ⇒ director＝null、tacticOn＝false；_tidOf 回 null", e0.director === null && e0.tacticOn === false && e0._tidOf("blue") === null && e0._tidOf("red") === null);
  e0.configureMatch({});
  ck("E1b configureMatch 沒有 blue／red（提前 return）⇒ director 仍是 null", e0.director === null && e0.tacticOn === false);

  //  舊式（C2 之前）在觀測欄位上的值：拿來對照 Director 的回答。C3-1 E-1 起觀測欄位不存在，
  //  改用「傳給 configureMatch 的物件」重建同樣的 tk／tid（tk＝兩側 knobs，紅方 null 補中性；tid＝規則開且有傳 identity 時的 { blue, red }）。
  const legacyIdOfKnobs = (tk, tid, K) => (tid && K ? (K === tk.blue ? tid.blue : K === tk.red ? tid.red : null) : null);
  const legacyTidOf = (tid, side) => tid?.[side] ?? null;
  const legacyPhase = (t) => (t < 480 ? 0 : t < 960 ? 1 : 2);
  const build = (idRule, { redNull = false, identity = true } = {}) => {
    const e = new LogicEngine(7);
    e.rules = { ...e.rules, tacticIdentityV1: idRule };
    const inp = mk(identity);
    e.configureMatch({ blue: inp.blue, red: redNull ? null : inp.red, meta: null, identity: inp.identity });
    return { e, inp };
  };
  for (const [label, idRule, opts] of [["規則開＋identity", true, {}], ["規則關", false, {}], ["規則開、沒傳 identity", true, { identity: false }], ["紅方 null（補中性）", true, { redNull: true }]]) {
    const { e, inp } = build(idRule, opts);
    const D = e.director;
    const tk = { blue: inp.blue, red: opts.redNull ? D.knobs("red") : inp.red };
    const tid = idRule && inp.identity ? { blue: inp.identity.blue ?? null, red: inp.identity.red ?? null } : null;
    const Ks = [D.knobs("blue"), D.knobs("red"), { ...D.knobs("blue") }, null];
    ck(`E2 ${label}：knobs("blue") 是傳入的同一個物件；紅方＝${opts.redNull ? "中性 knobs（與 _neutralKnobs() 同值）" : "傳入的同一個物件"}；Director 的 knobs 與傳入的 tk 物件同參照（紅方 null 時為 Director 補的中性 knobs）`,
      D.knobs("blue") === inp.blue && (opts.redNull ? J(D.knobs("red")) === J(e._neutralKnobs()) : D.knobs("red") === inp.red)
      && tk.blue === D.knobs("blue") && tk.red === D.knobs("red"));
    ck(`E3 ${label}：identityOfKnobs／_tidOf／hasIdentity＝舊式在傳入物件（tk／tid）上的值（4 種 K × 2 側）`,
      Ks.every((K) => D.identityOfKnobs(K) === legacyIdOfKnobs(tk, tid, K)) && ["blue", "red"].every((s) => e._tidOf(s) === legacyTidOf(tid, s))
      && D.hasIdentity() === !!tid && (idRule && opts.identity !== false ? !!tid : tid === null));
    ck(`E3b ${label}：引擎實例上沒有舊的觀測欄位（e.tk／e.tid 皆 undefined）`, !("tk" in e) && !("tid" in e));
    if (D.hasIdentity()) {
      const ts = [0, 479.9, 480, 959.9, 960, 2000];
      ck(`E4 ${label}：_tidPhase()＝舊式（${ts.join("/")}）`, ts.every((t) => { e.t = t; return e._tidPhase() === legacyPhase(t); }));
      e.t = 0;
    }
  }
  //  Director 呼叫不消耗任何亂數：兩台同 seed 同設定的引擎，一台狂問 Director，之後 rng／rng2 序列仍相同。
  const a = build(true).e, b = build(true).e;
  for (let i = 0; i < 200; i++) for (const s of ["blue", "red"]) { b.director.knobs(s); b.director.identity(s); b.director.identityOfKnobs(b.director.knobs(s)); b.director.phase(i * 7); b._tidOf(s); }
  b.director.directive("blue", 100); b.director.directive("red", 1500);
  const seq = (e) => J([...Array(8)].map(() => [e.rng(), e.rng2()]));
  ck("E5 Director 的任何呼叫都不消耗 rng／rng2（同 seed 兩台引擎之後的序列相同）", seq(a) === seq(b));
  ck("E6 tidObs 在 identity 接線時建立（＝舊的 `if (this.tid)`）", !!a.tidObs && a.tidObs.blue.protectCarry === 0 && a.tidObs.red.siegePreferred === 0);
}

console.log(`\nTactical Director 3c：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
