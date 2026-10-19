#!/usr/bin/env node
// ============================================================================
//  tools/check_laneframe_c3.mjs — C3-1 laneFrame（TD-3A-23，Owner D-1 = A）：靜態對稱 gate＋回歸釘
//
//  執行：node tools/check_laneframe_c3.mjs              全部（C3 重跑 v21-A golden 的 live＋runner 案，約 5–7 分鐘）
//        node tools/check_laneframe_c3.mjs --static-only 只跑秒級部分（C3 標 SKIP 並讓整支判 FAIL：不得當通過）
//        一律走 tools/verify.mjs 的 laneframe_c3 段。
//
//  門檻全部讀自事前登記檔 tools/fixtures/laneframe_registration_c3.json（commit 166ade7；不得改）：
//   A1  teamRelative：21 模板 × Registry 上每個 lanes.* 提供選擇（186 組輸入；數量不符即紅）× 兩隊，
//       邊路三席（top／mid／adc）用該選手的**世界路名**讀 laneOffset／gankWeights／是否＝splitLane：紅藍逐席相同（0 筆不符）；
//       knobs("blue") 與設定物件同參照（0 例外）；上下路相同的紅方設定轉換後數值不變（0）；藍方物件不被改（0）。static 與 core.v1 各算一次。
//   A2  LANE_KEYED_KNOBS 登記完整：① 186 組已解析 knobs 裡「鍵恰好是 top／mid／bot 的物件」或「值曾是 "top"／"bot"」的欄位都已登記（型別相符）；
//       ② 每個 knob 欄位都在 LANE_KEYED_KNOBS 或 LANE_NEUTRAL_KNOBS 宣告過。負向自檢：植入未登記的路名欄位 ⇒ 抓到。
//   A3  單一轉換點（剝註解後掃 import 識別字）：worldLaneForSide／sideRelativeLane 只在 gameData.js 定義；Director 只從 gameData.js 取得；
//       轉換函式與登記表只住在 Director；引擎的 knobs 讀取全經 Director、laneFrame 只原樣轉交。
//   A4  負對照：同一組輸入在 legacyMirror 下必須恰好 120 筆不符；8 個上下路不對稱的模板＝登記清單。
//   A5  teamRelative：knobs("red") 每次同一參照且凍結；紅方 identity 不變成 null；blue===red 的邊界（legacy 釘住藍方優先）。
//   C1  沒有 laneFrame 層（v20、或 Director 未收到 laneFrame）：knobs(side) 與設定物件同參照（0 例外）；組裝器不傳 laneFrame 鍵。
//   R   規則集層與組裝器：v21 兩份帶 teamRelative、v20 沒有這個鍵；驗證只收兩個值；正式規則集鎖定；能力檢查（deps_missing）。
//   C3  v21 規則集下重跑 v21-A fixture 的 live＋runner 案：digest／streamHash／resultHash 改變的集合**恰好**＝登記的 9 個 id，其餘逐位元相同。
//       （C2：check_match_setup_3a 153／153、check_match_golden_v21a 131／131 另跑；這裡只驗 v20 規則集下 configureMatch 不帶 laneFrame 鍵。）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./lib/stripComments.mjs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const progress = (s) => process.stderr.write(`  ${s}\n`);
const J = (x) => JSON.stringify(x);
const STATIC_ONLY = process.argv.includes("--static-only");

//  golden 共用庫要先載入（它檢查 ESMO_BALANCE_* 沒被外部設定，並設好 runner 的技能／天賦開關）。
const L = await import("./lib/matchGoldenV21a.mjs");
const LF = await import("./lib/laneFrameC3.mjs");
const REG = LF.REGISTRATION;
const ROOT = LF.ROOT;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const { LogicEngine } = await import("../src/LogicEngine.js");
const Dir = await import("../src/battle/moba/tactics/tacticalDirector.js");
const G = await import("../src/gameData.js");
const RS = await import("../src/platform/contracts/matchRuleset.js");
const { createMatchSetup } = await import("../src/platform/contracts/matchSetup.js");
const { TACTIC_TEMPLATES } = await import("../src/platform/tactics/tacticTemplates.js");
const REGISTRY = await import("../src/platform/tactics/capabilityRegistry.js");
const MAP = await import("../src/platform/tactics/tacticChoiceMapping.js");
const { resolveTactic } = await import("../src/battle/moba/tactics/tacticResolver.js");
const { assembleMatch } = await import("../src/battle/moba/matchAssembler.js");
const { sharedMatchAssemblerDeps } = await import("../src/battle/moba/matchAssemblerDeps.js");
const { buildLiveMatchSetup } = await import("../src/battle/moba/liveMatchSetup.js");
const { goldenLiveInputs } = await import("./lib/liveGolden.mjs");
const { tacticInputOf } = await import("./lib/tacticTruthSim.mjs");
const runner = await import("./balance/moba_items_balance_runner.mjs");
const M_ON = await runner.modules();

const STATIC = REG.gates.static;
console.log(`ℹ 事前登記：${REG.schema}（${REG.registeredAt}，${REG.debt}）；門檻全部讀自 tools/fixtures/laneframe_registration_c3.json`);

// ════ 輸入列舉（登記檔 clarifications.enumerationSources：執行當下由 Registry＋tacticTemplates 列舉）══════════════
const inputs = [];
for (const t of Object.keys(TACTIC_TEMPLATES)) {
  inputs.push({ key: `${t}|-|-`, template: t, choices: {} });
  for (const row of REGISTRY.liveRows().filter((r) => r.dimension.startsWith("lanes."))) {
    const d = MAP.offeredChoiceDetail(t, row.dimension, [], {}, { withMeasured: false });
    for (const c of d.offered.filter((x) => x !== d.own)) inputs.push({ key: `${t}|${row.dimension}|${c}`, template: t, choices: MAP.nestedOf([[row.dimension, c]]) });
  }
}
const resolved = inputs.map((x) => {
  const r = resolveTactic(tacticInputOf({ templateId: x.template, choices: x.choices }), {}, { identity: true });
  return { ...x, ok: r?.ok === true, knobs: r?.knobs ?? null, identity: r?.identity ?? null };
});
const templatesN = Object.keys(TACTIC_TEMPLATES).length;
ck(`IN 列舉：${templatesN} 個模板（登記 ${STATIC.inputs.templates}）、${resolved.length} 組輸入（登記 ${STATIC.inputs.lanesChoicesTotalInputs}；不符即 STOP），全部解析成功`,
  templatesN === STATIC.inputs.templates && resolved.length === STATIC.inputs.lanesChoicesTotalInputs && resolved.every((x) => x.ok && x.knobs),
  `${resolved.filter((x) => !x.ok).map((x) => x.key).join(" ")}`);

//  邊路三席的世界路名：取自引擎本身（選手建立時的 lane；紅方由 worldLaneForSide 產生）。先證明前提成立（紅方上路在世界下路）。
const probe = new LogicEngine(1);
const seats = (side) => ["top", "mid", "adc"].map((role) => probe.players.find((p) => p.side === side && p.role === role));
const SEATS = { blue: seats("blue"), red: seats("red") };
ck("IN 前提：引擎選手的世界路名＝己方路名經 worldLaneForSide（藍 top/mid/bot；紅方上路＝世界 bot、射手＝世界 top）",
  J(SEATS.blue.map((p) => p.lane)) === J(["top", "mid", "bot"]) && J(SEATS.red.map((p) => p.lane)) === J(["bot", "mid", "top"])
  && SEATS.red.every((p) => p.lane === G.worldLaneForSide("red", G.ROLE_LANE[p.role])));
const readsOf = (side, K) => SEATS[side].map((p) => ({ role: p.role, off: K.laneOffset?.[p.lane], gw: K.gankWeights?.[p.lane], split: K.splitLane === p.lane }));

// ════ A1／A4／C1：對每組輸入建 Director（static 與 core.v1；兩側是同一份計畫的兩個獨立副本，與組裝器相同）══════════════
const clone = (o) => structuredClone(o);
function buildDirector(x, { laneFrame, core }) {
  const blue = clone(x.knobs), red = clone(x.knobs);
  const identity = { blue: clone(x.identity), red: clone(x.identity) };
  const args = { blue, red, identity };
  let t = 0;
  if (core) { args.phases = { blue: [0, 1, 2].map(() => ({ knobs: blue, identity: identity.blue })), red: [0, 1, 2].map(() => ({ knobs: red, identity: identity.red })) }; args.clock = () => t; }
  if (laneFrame !== undefined) args.laneFrame = laneFrame;
  const snap = J({ blue, red });
  return { D: Dir.createTacticalDirector(args), blue, red, identity, snap, setT: (v) => { t = v; } };
}
const isSym = (k) => k.laneOffset.top === k.laneOffset.bot && k.gankWeights.top === k.gankWeights.bot && !["top", "bot"].includes(k.splitLane);
const tally = (laneFrame, core) => {
  const out = { redNotEqualBlue: 0, list: [], blueRefExceptions: 0, symDiffers: 0, blueChanged: 0, redRefExceptions: 0 };
  for (const x of resolved) {
    const b = buildDirector(x, { laneFrame, core });
    const T = core ? [0, 500, 1000] : [0];
    let bad = false;
    for (const t of T) {
      b.setT(t);
      if (J(readsOf("blue", b.D.knobs("blue"))) !== J(readsOf("red", b.D.knobs("red")))) bad = true;
      if (b.D.knobs("blue") !== b.blue) out.blueRefExceptions++;
      if (b.D.knobs("red") !== b.red) out.redRefExceptions++;
    }
    if (bad) { out.redNotEqualBlue++; out.list.push(x.key); }
    if (isSym(x.knobs) && J(b.D.knobs("red")) !== J(b.red)) out.symDiffers++;
    if (J({ blue: b.blue, red: b.red }) !== b.snap) out.blueChanged++;
  }
  return out;
};
const TR = { static: tally("teamRelative", false), core: tally("teamRelative", true) };
const LG = { static: tally("legacyMirror", false), core: tally("legacyMirror", true), absent: tally(undefined, false), absentCore: tally(undefined, true) };
const A1P = STATIC.A1.pass;
for (const m of ["static", "core"]) {
  const r = TR[m];
  ck(`A1 teamRelative（${m === "static" ? "static" : "core.v1"}）：紅藍逐席讀值不符 ${r.redNotEqualBlue}（登記 ${A1P.redNotEqualBluePerSeatReads}）、藍方同參照例外 ${r.blueRefExceptions}（${A1P.blueKnobsSameReferenceAsConfigExceptions}）、上下路相同的紅方轉換後不同 ${r.symDiffers}（${A1P.symmetricRedConfigDiffersAfterRemap}）、藍方物件被改 ${r.blueChanged}（${A1P.blueObjectChanged}）`,
    r.redNotEqualBlue === A1P.redNotEqualBluePerSeatReads && r.blueRefExceptions === A1P.blueKnobsSameReferenceAsConfigExceptions
    && r.symDiffers === A1P.symmetricRedConfigDiffersAfterRemap && r.blueChanged === A1P.blueObjectChanged, r.list.slice(0, 5).join(" "));
}
const A4 = STATIC.A4;
for (const [label, r] of [["legacyMirror（static）", LG.static], ["legacyMirror（core.v1）", LG.core], ["未傳 laneFrame（static）", LG.absent], ["未傳 laneFrame（core.v1）", LG.absentCore]]) {
  ck(`A4 負對照 ${label}：紅藍逐席不符恰好 ${r.redNotEqualBlue}（登記 ${A4.legacyExpectedRedNotEqualBluePerSeatCount}）、藍方物件未被改（${r.blueChanged}）`,
    r.redNotEqualBlue === A4.legacyExpectedRedNotEqualBluePerSeatCount && r.blueChanged === 0);
}
ck("A4b legacy 四種寫法（static／core.v1 × 明寫 legacyMirror／不傳）列出的 120 筆是同一份清單；teamRelative 下 0 筆",
  [LG.core, LG.absent, LG.absentCore].every((r) => J(r.list) === J(LG.static.list)) && TR.static.list.length === 0 && TR.core.list.length === 0);
{
  const asym = Object.keys(TACTIC_TEMPLATES).filter((t) => { const x = resolved.find((r) => r.key === `${t}|-|-`); return !isSym(x.knobs); });
  ck(`A4c 上下路不對稱的模板＝登記的 ${STATIC.asymmetricTemplates.ids.length} 個（${asym.join("、")}）`, J(asym.slice().sort()) === J(STATIC.asymmetricTemplates.ids.slice().sort()));
}
ck(`C1 沒有 laneFrame（legacyMirror 或不傳；static 與 core.v1）：${resolved.length} 組 × 兩隊 knobs(side) 與設定物件同參照（例外 ${LG.static.blueRefExceptions + LG.static.redRefExceptions + LG.core.blueRefExceptions + LG.core.redRefExceptions + LG.absent.blueRefExceptions + LG.absent.redRefExceptions + LG.absentCore.blueRefExceptions + LG.absentCore.redRefExceptions}；登記 0）`,
  [LG.static, LG.core, LG.absent, LG.absentCore].every((r) => r.blueRefExceptions === 0 && r.redRefExceptions === 0));
ck("C1b Director 的 laneFrame：不傳 ⇒ legacyMirror；未知值 ⇒ 建立時丟 TypeError", (() => {
  const x = resolved[0];
  const d = Dir.createTacticalDirector({ blue: clone(x.knobs), red: clone(x.knobs), identity: null });
  let threw = false;
  try { Dir.createTacticalDirector({ blue: clone(x.knobs), red: clone(x.knobs), identity: null, laneFrame: "mirror" }); } catch (e) { threw = e instanceof TypeError; }
  return d.laneFrame === "legacyMirror" && threw && Dir.LANE_FRAMES === RS.LANE_FRAMES;
})());

// ════ A2：LANE_KEYED_KNOBS 登記完整 ══════════════════════════════════════════════════
const KEYED = Dir.LANE_KEYED_KNOBS, NEUTRAL = Dir.LANE_NEUTRAL_KNOBS;
const LANESET = J(["bot", "mid", "top"]);
/** 依 clarifications.enumerationSources 的定義偵測「按路分」欄位：鍵恰好是 {top,mid,bot} 的物件 ⇒ keys；任一輸入取值為 "top"／"bot" ⇒ value。 */
function detectLaneKeyed(knobsList) {
  const out = new Map();
  for (const k of knobsList) for (const [f, v] of Object.entries(k)) {
    if (v && typeof v === "object" && !Array.isArray(v) && J(Object.keys(v).sort()) === LANESET) out.set(f, "keys");
    else if (v === "top" || v === "bot") out.set(f, "value");
  }
  return out;
}
const regIssues = (knobsList) => {
  const det = detectLaneKeyed(knobsList);
  const missing = [...det].filter(([f, type]) => KEYED[f] !== type).map(([f, type]) => `${f}:${type}`);
  const fields = new Set(knobsList.flatMap((k) => Object.keys(k)));
  const undeclared = [...fields].filter((f) => !(f in KEYED) && !NEUTRAL.includes(f));
  return { det, missing, undeclared };
};
{
  const all = resolved.map((x) => x.knobs);
  const r = regIssues(all);
  const A2P = STATIC.A2.pass;
  ck(`A2 ① 偵測到的按路分欄位（${[...r.det].map(([f, t]) => `${f}:${t}`).join("、")}）全部登記且型別相符：漏登 ${r.missing.length}（登記 ${A2P.missingRegistrations}）`, r.missing.length === A2P.missingRegistrations, r.missing.join(" "));
  ck(`A2 ② 每個 knob 欄位都已宣告（分路 ${Object.keys(KEYED).length}＋不分路 ${NEUTRAL.length}）：未宣告 ${r.undeclared.length}（登記 ${A2P.undeclaredFields}）；登記表＝登記檔的 laneKeyedKnobs（名稱、欄位、型別）`,
    r.undeclared.length === A2P.undeclaredFields && Object.isFrozen(KEYED) && Object.isFrozen(NEUTRAL)
    && J(Object.keys(KEYED).sort()) === J(Object.keys(REG.laneKeyedKnobs.fields).sort())
    && Object.entries(REG.laneKeyedKnobs.fields).every(([f, d]) => KEYED[f] === d.keyType)
    && REG.laneKeyedKnobs.registryName === "LANE_KEYED_KNOBS", r.undeclared.join(" "));
  ck("A2 ③ 宣告的欄位實際存在於已解析 knobs、兩張表不重疊（沒有死登記）",
    [...Object.keys(KEYED), ...NEUTRAL].every((f) => all.some((k) => f in k)) && NEUTRAL.every((f) => !(f in KEYED)));
  //  負向自檢：植入未登記的路名欄位 ⇒ 必須抓到（值型與鍵型各一），植入不分路的新欄位 ⇒ 未宣告。
  const plantV = regIssues([...all.slice(0, 3), { ...all[0], focusLane: "top" }]);
  const plantK = regIssues([{ ...all[0], laneTempo: { top: 1, mid: 1, bot: 1 } }]);
  const plantN = regIssues([{ ...all[0], newNumber: 0.5 }]);
  ck("A2 N 負向自檢：植入 focusLane:\"top\" ⇒ 漏登（value）；植入 laneTempo:{top,mid,bot} ⇒ 漏登（keys）；植入 newNumber ⇒ 未宣告",
    plantV.missing.includes("focusLane:value") && plantK.missing.includes("laneTempo:keys") && plantN.undeclared.includes("newNumber") && plantV.undeclared.includes("focusLane"));
}

// ════ A3：單一轉換點（剝註解）══════════════════════════════════════════════════════
const DIRECTOR = "src/battle/moba/tactics/tacticalDirector.js", ENGINE = "src/LogicEngine.js", GAMEDATA = "src/gameData.js";
const srcFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel); else if (/\.(js|jsx|mjs)$/.test(e.name)) srcFiles.push(rel);
  }
})("src");
const CODE = new Map(srcFiles.map((f) => [f, stripComments(read(f))]));
const MAPFN = ["worldLaneForSide", "sideRelativeLane"];
const defines = (code, name) => new RegExp(`(?:export\\s+)?(?:const|let|var|function)\\s+${name}\\b`).test(code);
/** import 敘述：[{ names:[...], from }]（只看識別字，不看註解）。 */
const importsOf = (code) => [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)].map((m) => ({ names: m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean), from: m[2] }));
const MIRROR_TABLE_MODULES = ["mapTowerLayoutStyle", "mobaTowerPlacement", "mobaNavigation", "mapBaseFrame"];
const directorImportOk = (code) => {
  const imps = importsOf(code);
  const mapImps = imps.filter((i) => i.names.some((n) => MAPFN.includes(n)));
  return mapImps.length === 1 && /(^|\/)gameData\.js$/.test(mapImps[0].from) && MAPFN.every((n) => mapImps[0].names.includes(n))
    && !imps.some((i) => MIRROR_TABLE_MODULES.some((m) => i.from.includes(m))) && !/\bMIRROR_LANE\b/.test(code);
};
{
  const definers = srcFiles.filter((f) => MAPFN.some((n) => defines(CODE.get(f), n)));
  ck(`A3 ① worldLaneForSide／sideRelativeLane 只在 ${REG.laneKeyedKnobs.onlySourceModule} 定義（定義處：${definers.join("、")}）`, J(definers) === J([GAMEDATA]));
  ck("A3 ② Director 只從 gameData.js import 兩個轉換函式；不 import 地圖模組的鏡像表、不引用 MIRROR_LANE", directorImportOk(CODE.get(DIRECTOR)));
  const holders = srcFiles.filter((f) => /\bLANE_KEYED_KNOBS\b|\btoWorldKnobs\b/.test(CODE.get(f)));
  ck(`A3 ③ 轉換（toWorldKnobs）與登記表（LANE_KEYED_KNOBS）只住在 Director（出現處：${holders.join("、")}）`, J(holders) === J([DIRECTOR]));
  const E = CODE.get(ENGINE);
  const knobReads = (E.match(/this\.director\.knobs\(/g) ?? []).length;
  const guarded = (E.match(/this\.tacticOn \? this\.director\.knobs\((?:side|p\.side)\) : null/g) ?? []).length;
  const lfLines = E.split("\n").filter((l) => /\blaneFrame\b/.test(l)).map((l) => l.trim());
  ck("A3 ④ 引擎的 knobs 讀取全經 Director（每個讀取點是 this.director.knobs(…)；configureMatch 內 1 處＋其餘都有 tacticOn 護欄）；沒有 .tk／.tid",
    knobReads === guarded + 1 && knobReads > 1 && !/\.\s*(?:tk|tid)\b/.test(E), `${knobReads} / ${guarded}`);
  ck("A3 ⑤ 引擎（剝註解）出現 laneFrame 的恰好 2 行：configureMatch 參數、「有才轉交 Director」；不得有其他用法；引擎不自己轉換路名欄位",
    J(lfLines) === J([
      "configureMatch({ blue = null, red = null, meta = null, identity = null, phases = null, laneFrame = null } = {}) {",
      "if (laneFrame !== null) directorArgs.laneFrame = laneFrame;",
    ]) && !/\b(?:worldLaneForSide|sideRelativeLane)\s*\([^)]*(?:laneOffset|gankWeights|splitLane)/.test(E), lfLines.join(" | "));
  //  負向自檢（記憶體內植入，真檔不動）
  const D0 = read(DIRECTOR);
  ck("A3 N 負向自檢：Director 改從 mapBaseFrame import ⇒ 紅；多一條 import MIRROR_LANE ⇒ 紅；只在註解裡提到 mobaNavigation／MIRROR_LANE ⇒ 不紅",
    !directorImportOk(stripComments(D0.replace('from "../../../gameData.js"', 'from "../map/mapBaseFrame.js"')))
    && !directorImportOk(stripComments(D0.replace('import { worldLaneForSide, sideRelativeLane } from "../../../gameData.js";', 'import { worldLaneForSide, sideRelativeLane, MIRROR_LANE } from "../../../gameData.js";')))
    && directorImportOk(stripComments(`${D0}\n// import { x } from "../nav/mobaNavigation.js"; MIRROR_LANE\n`)));
}

// ════ A5：參照／identity 釘 ══════════════════════════════════════════════════════
{
  const x = resolved.find((r) => r.key === "v2.top_solo_split|-|-");
  for (const core of [false, true]) {
    const b = buildDirector(x, { laneFrame: "teamRelative", core });
    const tag = core ? "core.v1" : "static";
    const ts = core ? [0, 479.9, 480, 959.9, 960, 3000] : [0];
    let same = true, ident = true;
    const first = b.D.knobs("red");
    for (const t of ts) for (let i = 0; i < 3; i++) {
      b.setT(t);
      if (b.D.knobs("red") !== first) same = false;
      if (b.D.identity("red") !== b.identity.red || b.D.identityOfKnobs(b.D.knobs("red")) !== b.identity.red || b.D.identityOfKnobs(b.D.knobs("blue")) !== b.identity.blue) ident = false;
    }
    const frozen = Object.isFrozen(first) && Object.isFrozen(first.laneOffset) && Object.isFrozen(first.gankWeights);
    ck(`A5 ${tag}：knobs("red") 每次同一參照（${ts.length} 個 t × 3 次）且凍結（含 laneOffset／gankWeights）；不是設定物件；設定物件未被凍結或改動`,
      same && frozen && first !== b.red && !Object.isFrozen(b.red) && J({ blue: b.blue, red: b.red }) === b.snap);
    ck(`A5 ${tag}：紅方 identity 不變成 null（identity／identityOfKnobs(knobs("red")) 都是紅方那一份）；藍方照舊`, ident && b.identity.red !== null);
    ck(`A5 ${tag}：轉換＝鍵 top↔bot、值不變、splitLane top→bot；鍵順序 top,mid,bot；directive 仍是己方視角（設定的那一份）`,
      first.laneOffset.top === b.red.laneOffset.bot && first.laneOffset.bot === b.red.laneOffset.top && first.laneOffset.mid === b.red.laneOffset.mid
      && first.gankWeights.top === b.red.gankWeights.bot && b.red.splitLane === "top" && first.splitLane === "bot"
      && J(Object.keys(first.laneOffset)) === J(["top", "mid", "bot"]) && J(b.D.directive("red", 0).knobs) === J(b.red));
  }
  //  blue===red（同一個物件）：legacy 釘住「紅方拿藍方 identity」（藍方優先）；teamRelative 下紅方是轉換後的新物件 ⇒ 拿自己的。
  const same = clone(x.knobs);
  const I = { blue: { tag: "b" }, red: { tag: "r" } };
  const lg = Dir.createTacticalDirector({ blue: same, red: same, identity: I, laneFrame: "legacyMirror" });
  const tr = Dir.createTacticalDirector({ blue: same, red: same, identity: I, laneFrame: "teamRelative" });
  ck("A5 blue===red 邊界：legacyMirror ⇒ identityOfKnobs(knobs(\"red\")) 是藍方的（舊行為釘住）；teamRelative ⇒ 紅方的（行為不同，已列名）",
    lg.identityOfKnobs(lg.knobs("red"))?.tag === "b" && tr.identityOfKnobs(tr.knobs("red"))?.tag === "r" && tr.identityOfKnobs(same)?.tag === "b");
}

// ════ R：規則集層、組裝器、能力檢查 ══════════════════════════════════════════════════
{
  const c20 = RS.MATCH_RULESETS["career.v20"], b20 = RS.MATCH_RULESETS["balanceTool.v20"], ch20 = RS.MATCH_RULESETS["challenge.v20"];
  const c21 = RS.MATCH_RULESETS["career.v21"], b21 = RS.MATCH_RULESETS["balanceTool.v21"];
  ck(`R1 laneFrame 層：值＝登記的 ${J(REG.layer.values)}、缺少 ≡ ${REG.layer.absent}；${REG.layer.rulesets.join("／")} 帶 teamRelative；v20 三份沒有這個鍵`,
    J(RS.LANE_FRAMES) === J(REG.layer.values) && RS.DEFAULT_LANE_FRAME === REG.layer.absent && RS.laneFrameOf(c20) === "legacyMirror"
    && REG.layer.rulesets.every((id) => RS.MATCH_RULESETS[id].layers.laneFrame === "teamRelative")
    && [c20, b20, ch20].every((r) => !("laneFrame" in r.layers)));
  const v = (r) => RS.validateRuleset(r);
  ck("R2 validateRuleset：兩個值通過、其他值（\"\"、\"mirror\"、null、true）拒絕（laneFrame）",
    ["legacyMirror", "teamRelative"].every((x) => v({ ...b21, layers: { ...b21.layers, laneFrame: x } }).ok)
    && ["", "mirror", null, true].every((x) => { const r = v({ ...b21, layers: { ...b21.layers, laneFrame: x } }); return !r.ok && r.errors.includes("laneFrame"); }));
  const codes = (r) => { const x = createMatchSetup({ ruleset: r, seed: 1, meta: { seedSource: "local" } }); return x.ok ? [] : x.errors.map((e) => `${e.code}@${e.field}`); };
  ck("R3 正式規則集鎖定：career.v21 改 legacyMirror ⇒ production_layer_mismatch；缺鍵 ⇒ 拒絕；balanceTool.v21 可覆寫成 legacyMirror（工具）",
    J(codes({ ...c21, layers: { ...c21.layers, laneFrame: "legacyMirror" } })) === J(["production_layer_mismatch@ruleset.layers.laneFrame"])
    && codes({ ...c21, layers: (({ laneFrame: _x, ...rest }) => rest)(c21.layers) }).includes("production_layer_mismatch@ruleset.layers.laneFrame")
    && codes({ ...b21, layers: { ...b21.layers, laneFrame: "legacyMirror" } }).length === 0 && codes(c21).length === 0 && codes(b21).length === 0);
  ck("R4 v20 規則集拒絕 laneFrame 鍵（兩個值都拒絕）：career.v20 ⇒ production_layer_mismatch、balanceTool.v20 ⇒ ruleset_invalid",
    ["legacyMirror", "teamRelative"].every((x) => J(codes({ ...c20, layers: { ...c20.layers, laneFrame: x } })) === J(["production_layer_mismatch@ruleset.layers.laneFrame"])
      && J(codes({ ...b20, layers: { ...b20.layers, laneFrame: x } })) === J(["ruleset_invalid@ruleset.layers.laneFrame"])));
  ck("R5 resolveRulesetForMode：旗標開 ⇒ career.v21 帶 teamRelative；旗標關 ⇒ career.v20 沒有這個鍵；challenge 沒有這個鍵",
    RS.resolveRulesetForMode({ mode: "career", flags: { mobaTacticalDirectorV21: true } }).layers.laneFrame === "teamRelative"
    && !("laneFrame" in RS.resolveRulesetForMode({ mode: "career", flags: {} }).layers)
    && !("laneFrame" in RS.resolveRulesetForMode({ mode: "challenge", flags: { mobaTacticalDirectorV21: true } }).layers));

  //  組裝器：configureMatch 引數的 laneFrame 鍵只在 ruleset 有這一層時出現；Director 收到同一個值。
  const CM = { log: null };
  const orig = LogicEngine.prototype.configureMatch;
  LogicEngine.prototype.configureMatch = function observed(...args) {
    const r = orig.apply(this, args);
    if (CM.log) CM.log.push({ arg: args[0] ?? {}, D: this.director });
    return r;
  };
  const withLog = (fn) => { CM.log = []; try { const out = fn(); return { out, log: CM.log }; } finally { CM.log = null; } };
  const seed = 7, roster = runner.mirroredRoster(seed, M_ON), deps = sharedMatchAssemblerDeps();
  const tactic = { blue: tacticInputOf({ templateId: "std", choices: {} }), red: tacticInputOf({ templateId: "v2.top_solo_split", choices: {} }) };
  const setupOf = (rid) => runner.buildBalanceMatchSetup(seed, "standard", M_ON, 1, roster, tactic, rid).setup;
  const has = (a) => Object.prototype.hasOwnProperty.call(a, "laneFrame");
  const r20 = withLog(() => assembleMatch(setupOf("balanceTool.v20"), deps));
  const r21 = withLog(() => assembleMatch(setupOf("balanceTool.v21"), deps));
  process.env.ESMO_BALANCE_LANEFRAME = "legacyMirror";
  let r21L, thrownV20 = null;
  try { r21L = withLog(() => assembleMatch(setupOf("balanceTool.v21"), deps)); try { setupOf("balanceTool.v20"); } catch (e) { thrownV20 = String(e.message); } }
  finally { delete process.env.ESMO_BALANCE_LANEFRAME; }
  ck("R6 組裝器（runner）：balanceTool.v20 ⇒ configureMatch 引數**沒有** laneFrame 鍵、Director legacyMirror、紅方 knobs＝引數同參照",
    r20.out.ok && r20.log.length === 1 && !has(r20.log[0].arg) && r20.log[0].D.laneFrame === "legacyMirror" && r20.log[0].D.knobs("red") === r20.log[0].arg.red);
  ck("R7 組裝器（runner）：balanceTool.v21 ⇒ 引數帶 laneFrame:\"teamRelative\"、Director 同值；藍方同參照、紅方是轉換後的凍結物件；兩側引數是不同物件（blue===red 邊界經組裝器不可達）",
    r21.out.ok && r21.log.length === 1 && r21.log[0].arg.laneFrame === "teamRelative" && r21.log[0].D.laneFrame === "teamRelative"
    && r21.log[0].D.knobs("blue") === r21.log[0].arg.blue && r21.log[0].D.knobs("red") !== r21.log[0].arg.red && Object.isFrozen(r21.log[0].D.knobs("red"))
    && r21.log[0].arg.blue !== r21.log[0].arg.red && r21.log[0].D.knobs("red").splitLane === "bot" && r21.log[0].arg.red.splitLane === "top");
  ck("R8 runner 的 ESMO_BALANCE_LANEFRAME=legacyMirror（負對照）⇒ 引數 laneFrame:\"legacyMirror\"、紅方同參照；v20 上設這個變數 ⇒ 丟錯（不默默略過）",
    r21L.out.ok && r21L.log[0].arg.laneFrame === "legacyMirror" && r21L.log[0].D.knobs("red") === r21L.log[0].arg.red && /balance_laneframe_unsupported/.test(thrownV20 ?? ""));
  //  Live：v20 fixture 的 live-m8-23（紅方 m4）在旗標關／開下各組一次。
  const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
  const c823 = v20.cases.find((c) => c.id === "live-m8-23");
  const liveOf = (flagOn) => {
    const G2 = flagOn ? { ...v20, featureFlags: { ...v20.featureFlags, mobaTacticalDirectorV21: true } } : v20;
    const built = buildLiveMatchSetup(goldenLiveInputs(c823, G2));
    return withLog(() => assembleMatch(built.setup, deps));
  };
  const l20 = liveOf(false), l21 = liveOf(true);
  ck("R9 組裝器（Live，紅方 m4）：career.v20 ⇒ 沒有 laneFrame 鍵、紅方同參照；career.v21 ⇒ teamRelative、紅方轉換（gankWeights 鍵對調）",
    l20.out.ok && !has(l20.log[0].arg) && l20.log[0].D.knobs("red") === l20.log[0].arg.red
    && l21.out.ok && l21.log[0].arg.laneFrame === "teamRelative" && l21.log[0].D.knobs("red") !== l21.log[0].arg.red
    && l21.log[0].D.knobs("red").gankWeights.top === l21.log[0].arg.red.gankWeights.bot && l21.log[0].D.knobs("red").gankWeights.bot === l21.log[0].arg.red.gankWeights.top);
  LogicEngine.prototype.configureMatch = orig;
  //  能力檢查：引擎沒有宣告 SUPPORTS_LANE_FRAME（＝舊樹）⇒ teamRelative 開局前 deps_missing、零 configure；legacyMirror／v20 照常。
  class OldTreeEngine extends LogicEngine { static SUPPORTS_LANE_FRAME = undefined; }
  const oldDeps = { ...deps, LogicEngine: OldTreeEngine };
  const bad = assembleMatch(setupOf("balanceTool.v21"), oldDeps);
  process.env.ESMO_BALANCE_LANEFRAME = "legacyMirror";
  let okLegacy;
  try { okLegacy = assembleMatch(setupOf("balanceTool.v21"), oldDeps); } finally { delete process.env.ESMO_BALANCE_LANEFRAME; }
  const ok20 = assembleMatch(setupOf("balanceTool.v20"), oldDeps);
  ck("R10 能力檢查：引擎未宣告 laneFrame 支援 ⇒ balanceTool.v21（teamRelative）開局前 deps_missing@deps.LogicEngine.SUPPORTS_LANE_FRAME、不建引擎；同一引擎跑 legacyMirror 與 v20 照常",
    !bad.ok && bad.engine == null && bad.errors.some((e) => e.code === "deps_missing" && e.field === "deps.LogicEngine.SUPPORTS_LANE_FRAME") && okLegacy.ok && ok20.ok,
    J(bad.errors?.map((e) => `${e.code}@${e.field}`)));
  ck("R11 本樹引擎宣告支援（LogicEngine.SUPPORTS_LANE_FRAME === true）", LogicEngine.SUPPORTS_LANE_FRAME === true);
}

// ════ C3：v21 規則集下的改變集合＝登記的 9 個 ══════════════════════════════════════════
if (STATIC_ONLY) {
  ck("C3 v21 規則集下的改變集合（--static-only：未跑；整支不得當通過）", false, "SKIP");
} else {
  ck("C3 G0 runner 載入的引擎類別＝src/LogicEngine.js 的同一個類別", L.PROBE_SHARES_RUNNER_ENGINE);
  const fixture = JSON.parse(fs.readFileSync(L.FIXTURE_V21A, "utf8"));
  const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
  const v20On = { ...v20, featureFlags: { ...v20.featureFlags, mobaTacticalDirectorV21: true } };
  const scope = fixture.cases.filter((c) => c.path === "live" || c.path === "runner");
  const specs = L.specsFromFixture({ cases: scope });
  ck(`C3 範圍＝v21-A fixture 的 live＋runner 案（${scope.length}；challenge ${fixture.cases.length - scope.length} 案不重跑：沒有 challenge.v21）；登記清單 ${LF.C3_EXPECTED_CHANGED.length} 個 id 全部在範圍內（登記總數 ${LF.C3_TOTAL_EXPECTED}）`,
    LF.C3_EXPECTED_CHANGED.length === LF.C3_TOTAL_EXPECTED && LF.C3_EXPECTED_CHANGED.every((id) => scope.some((c) => c.id === id)));
  process.env.ESMO_BALANCE_RULESET = "balanceTool.v21";
  const observed = [], failed = [];
  const t0 = Date.now();
  try {
    for (const [n, spec] of specs.entries()) {
      try { observed.push(L.recordOf(spec, v20On)); } catch (e) { failed.push(`${spec.id}: ${String(e?.message ?? e).slice(0, 160)}`); }
      progress(`${n + 1}/${specs.length} ${spec.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally { delete process.env.ESMO_BALANCE_RULESET; }
  ck(`C3 全部重跑成功（${observed.length}/${specs.length}）`, failed.length === 0, failed.join(" | "));
  const cmp = LF.compareChangedSet(scope, observed);
  console.log(`ℹ C3 改變的案例（${cmp.changed.length}）：${cmp.changed.join("、")}`);
  for (const id of LF.C3_EXPECTED_CHANGED) ck(`C3 登記案 ${id} 在 v21 規則集下改變（digest／streamHash／resultHash 至少一欄）`, cmp.changed.includes(id), cmp.diffsOf(id).join("; "));
  ck(`C3 改變集合**恰好**＝登記的 ${LF.C3_EXPECTED_CHANGED.length} 個（多出 ${cmp.unexpected.length}、缺少 ${cmp.missing.length}）；其餘 ${cmp.identical} 案三欄逐位元相同`,
    cmp.ok && cmp.identical === scope.length - LF.C3_EXPECTED_CHANGED.length, `多出 [${cmp.unexpected.join(", ")}] 缺少 [${cmp.missing.join(", ")}]`);
  //  notChanging 的明列 id（前綴＋:s<seed>；clarifications.enumerationSources）必須在「相同」那一邊。
  const notChangingIds = REG.gates.regression.C3.notChanging.filter((s) => s.startsWith("bind-red:"));
  const hits = notChangingIds.map((p) => scope.filter((c) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:s\\d+$`).test(c.id)).map((c) => c.id));
  ck(`C3 notChanging 明列的 ${notChangingIds.join("、")} 各有案例且全部未改變（${hits.flat().join("、")}）`, hits.every((h) => h.length > 0) && hits.flat().every((id) => !cmp.changed.includes(id)));
  const callsDiff = observed.filter((g) => L.stableStringify(fixture.cases.find((c) => c.id === g.id).calls) !== L.stableStringify(g.calls)).length;
  const withMatch = scope.filter((c) => c.calls.some((x) => x.m === "configureMatch")).length;
  console.log(`ℹ C3 不計入改變集合（登記檔 notCounted）：configure 序列雜湊不同 ${callsDiff}/${scope.length}（有 configureMatch 的 ${withMatch} 案：多了 phases／laneFrame 鍵）`);
  console.log(`ℹ C3 耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\nLaneFrame C3：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
