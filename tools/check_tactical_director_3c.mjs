#!/usr/bin/env node
// ============================================================================
//  tools/check_tactical_director_3c.mjs — Phase 3a-C2 Task 10：Tactical Director（static）＋引擎讀取點遷移（gate G-AC2）
//
//  執行：node tools/check_tactical_director_3c.mjs（秒級）
//
//   S  原始碼（src/LogicEngine.js，**先剝註解**）：
//      S1 不得直接讀 this.tk／this.tid（含 [ . ?. 、this["tk"]、解構 { tk } = this）——唯一例外是明列的允許清單，
//         而且允許清單是「恰好等於」：多一個讀取點、少一個允許項都紅。
//      S2 Director 只在 configureMatch 建一次；建構子設 null；_tidOf／_tidPhase 是一行委派。
//      S3 戰術階段界線 480／960 只住在 Director（引擎剝註解後沒有這兩個數字）。
//      S4 引擎 import Director；Director 在 SIMULATION_SEMANTICS_FILES。
//      N  掃描器負向自檢（植入讀取點 ⇒ 抓到；只在註解裡 ⇒ 不抓）。
//   B  行為（Director 本身）：knobs 回傳同一個參照、identityOfKnobs 對應、identity 關閉 ⇒ null、phase 邊界、
//      directive 通過 validateTacticalDirective 且深凍結、不與 knobs 共用參照、不改輸入；不擲骰、不碰全域（建兩次答案相同）。
//   E  引擎接線：未 configureMatch ⇒ director 為 null；configureMatch 後 Director 的回答＝舊式在觀測欄位（e.tk／e.tid）上的值；
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
//  允許清單（逐筆列舉；每筆附理由）。這兩行是「寫」，不是讀：引擎外部的觀測者還在讀這兩個欄位。
const ALLOW = [
  { text: "this.tk = { blue: kBlue, red: kRed };", why: "configureMatch 的觀測欄位指派：tools/lib/tacticTruthSim.mjs 讀 e.tk?.[side].splitLane（真實性量測）" },
  { text: "this.tid = tid;", why: "configureMatch 的觀測欄位指派：tools/check_tactical_identity_v17.mjs B1 讀 !e.tid（規則關閉 ⇒ 不接線）" },
];
/** 剝過註解的原始碼裡每一個 this.tk／this.tid 的出現處（所在行去頭尾空白）。 */
function directHits(code) {
  const lines = code.split("\n");
  const hits = [];
  const res = [/\bthis\s*(?:\?\.|\.)\s*(?:tk|tid)\b/g, /\bthis\s*(?:\?\.)?\[\s*["'`](?:tk|tid)["'`]\s*\]/g, /\{[^{}]*\b(?:tk|tid)\b[^{}]*\}\s*=\s*this\b/g];
  lines.forEach((ln, i) => { for (const re of res) for (const _ of ln.matchAll(re)) hits.push({ line: i + 1, text: ln.trim() }); });
  return hits;
}
const hits = directHits(ENGINE_CODE);
const hitTexts = hits.map((h) => h.text).sort();
ck(`S1 剝註解後的引擎沒有直接讀 this.tk／this.tid：出現處恰好＝允許清單（${ALLOW.length} 筆：${ALLOW.map((a) => a.text).join("｜")}）`,
  J(hitTexts) === J(ALLOW.map((a) => a.text).sort()), hits.map((h) => `${h.line}: ${h.text}`).join(" | "));
const BRIEF_PATTERNS = ["this.tk[", "this.tk.", "this.tk?.", "this.tid[", "this.tid.", "this.tid?."];
ck(`S1b 逐字樣式 ${BRIEF_PATTERNS.join(" ")} 在剝註解後的引擎裡一次都沒有`, BRIEF_PATTERNS.every((p) => !ENGINE_CODE.includes(p)),
  BRIEF_PATTERNS.filter((p) => ENGINE_CODE.includes(p)).join(" "));
ck("S1c 允許清單每一筆都是指派（`=` 不是 `==`），而且各只出現一次（不留死例外）",
  ALLOW.every((a) => /^this\.(tk|tid) = [^=]/.test(a.text) && hits.filter((h) => h.text === a.text).length === 1));
ck("S2 Director 只建立一次（configureMatch 內）；this.director 只在建構子（null）與 configureMatch 被指派",
  (ENGINE_CODE.match(/createTacticalDirector\(/g) ?? []).length === 1
  && J((ENGINE_CODE.match(/this\.director = [^;]+;/g) ?? [])) === J(["this.director = null;", "this.director = createTacticalDirector({ blue: kBlue, red: kRed, identity: tid });"])
  && /configureMatch\(\{[^)]*\} = \{\}\) \{[\s\S]*?this\.director = createTacticalDirector\(/.test(ENGINE_CODE.slice(ENGINE_CODE.indexOf("configureMatch({"), ENGINE_CODE.indexOf("_joinChance(K, hot"))));
ck("S2b _tidOf／_tidPhase 是一行委派給 Director",
  ENGINE_CODE.includes("_tidOf(side) { return this.director ? this.director.identity(side) : null; }")
  && ENGINE_CODE.includes("_tidPhase() { return this.director.phase(this.t); }"));
ck("S2c 每一個 knobs 讀取點在未啟用戰術時仍回 null（`this.tacticOn ? this.director.knobs(…) : null`；configureMatch 內那一處除外）",
  (ENGINE_CODE.match(/this\.director\.knobs\(/g) ?? []).length === (ENGINE_CODE.match(/this\.tacticOn \? this\.director\.knobs\((?:side|p\.side)\) : null/g) ?? []).length + 1);
const num = (code, n) => (code.match(new RegExp(`(?<![\\w.])${n}(?![\\w.])`, "g")) ?? []).length;
ck("S3 戰術階段界線 480／960 只住在 Director：剝註解後引擎 0 次、Director 各 1 次", num(ENGINE_CODE, 480) === 0 && num(ENGINE_CODE, 960) === 0 && num(DIRECTOR_CODE, 480) === 1 && num(DIRECTOR_CODE, 960) === 1,
  `引擎 ${num(ENGINE_CODE, 480)}/${num(ENGINE_CODE, 960)}、Director ${num(DIRECTOR_CODE, 480)}/${num(DIRECTOR_CODE, 960)}`);
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
  ck("N7 階段界線植回引擎 ⇒ S3 抓到", num(stripComments(read(ENGINE).replace("_tidPhase() {", "_x() { return this.t < 480; }\n  _tidPhase() {")), 480) === 1);
}

// ════ B：Director 行為 ════════════════════════════════════════════════════════
const Dir = await imp(DIRECTOR);
const TD = await imp("src/platform/contracts/tacticalDirective.js");
const TC = await imp("src/platform/contracts/MobaTacticConfig.js");
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
  ck("B1 mode＝static；TACTICAL_DIRECTOR_MODES＝[static]；Director 物件凍結", d.mode === "static" && J(Dir.TACTICAL_DIRECTOR_MODES) === J(["static"]) && Object.isFrozen(d) && Object.isFrozen(Dir.TACTICAL_DIRECTOR_MODES));
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
  ck("B10 Director 從建立到所有回答都沒有呼叫 Math.random", randomCalls === 0, `${randomCalls} 次`);
} finally { Math.random = realRandom; }

// ════ E：引擎接線 ════════════════════════════════════════════════════════════
const { LogicEngine } = await imp(ENGINE);
{
  const e0 = new LogicEngine(5);
  ck("E1 未 configureMatch ⇒ director＝null、tacticOn＝false；_tidOf 回 null", e0.director === null && e0.tacticOn === false && e0._tidOf("blue") === null && e0._tidOf("red") === null);
  e0.configureMatch({});
  ck("E1b configureMatch 沒有 blue／red（提前 return）⇒ director 仍是 null", e0.director === null && e0.tacticOn === false);

  //  舊式（C2 之前）在觀測欄位上的值：拿來對照 Director 的回答。
  const legacyIdOfKnobs = (e, K) => (e.tid && K ? (K === e.tk.blue ? e.tid.blue : K === e.tk.red ? e.tid.red : null) : null);
  const legacyTidOf = (e, side) => e.tid?.[side] ?? null;
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
    const Ks = [D.knobs("blue"), D.knobs("red"), { ...D.knobs("blue") }, null];
    ck(`E2 ${label}：knobs("blue") 是傳入的同一個物件；紅方＝${opts.redNull ? "中性 knobs（與 _neutralKnobs() 同值）" : "傳入的同一個物件"}；觀測欄位 e.tk 與 Director 同參照`,
      D.knobs("blue") === inp.blue && (opts.redNull ? J(D.knobs("red")) === J(e._neutralKnobs()) : D.knobs("red") === inp.red)
      && e.tk.blue === D.knobs("blue") && e.tk.red === D.knobs("red"));
    ck(`E3 ${label}：identityOfKnobs／_tidOf／hasIdentity＝舊式在 e.tk／e.tid 上的值（4 種 K × 2 側）`,
      Ks.every((K) => D.identityOfKnobs(K) === legacyIdOfKnobs(e, K)) && ["blue", "red"].every((s) => e._tidOf(s) === legacyTidOf(e, s))
      && D.hasIdentity() === !!e.tid && (idRule && opts.identity !== false ? !!e.tid : e.tid === null));
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
