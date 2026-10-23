// ============================================================================
//  tools/lib/tacticMeasureProvenance.mjs — 戰術量測的「出處」：雜湊、載入檔記錄、依賴式過期判定（Phase 3a-C0）
//
//  誰用：check_tactic_truth_3a（真實性結果表）、measure_tactic_followup_3a（三份追加量測檔）、check_tactic_replication_3a。
//
//  【為什麼不再用 engineHash】先前用「SIMULATION_SEMANTICS_FILES 全部檔案的文字雜湊」判過期：worker 根本沒載入的語意檔
//  （例如 liveMatchSetup.js）改了也要重量 1.7 小時，而 worker 真正載入、卻不在語意清單裡的 src 檔改了反而沒人知道。
//  現在改成「依賴式」：每個量測 worker 用 module.registerHooks 記下它實際載入的 repo 內模組，結果表存
//  meta.loadedFiles = { <repo 相對路徑（斜線）>: <正規化內容的 sha16> }（所有場次的聯集）。
//  過期 ＝ 記錄的檔案不見了／雜湊變了／探針場次載入了沒記錄的檔案（新依賴）／其他雜湊欄位不同。
//
//  【記錄範圍】hook 註冊之後才載入的模組才看得到：入口檔、本檔、stripComments 在註冊之前就載入了，不在記錄裡
//  （入口檔的 worker 區段很薄；量測邏輯在 tacticTruthSim.mjs，由 harnessHash 與 loadedFiles 雙重保護）。
//  node_modules 與 repo 外的檔案不記。
//  另外 TEXT_HASH_EXEMPT 的三支（Registry／對照表／解析器）也不記、不比對：它們由行為雜湊保護（見該常數說明）。
//
//  本檔**不得**靜態 import 任何 src/ 或 tacticTruthSim：那樣它們會在 hook 註冊之前載入，worker 就漏記。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import nodeModule from "node:module";
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripComments } from "./stripComments.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const LEGACY_REASON = "fixture predates dependency-based staleness; re-run --measure";
/** 結果表 meta 裡由「現在的程式」推導出來、要逐欄比對的雜湊欄位（engineHash 已移除）。 */
export const HASH_KEYS = Object.freeze(["simVersion", "registryHash", "resolvedHash", "mappingHash", "templatesVersion", "harnessHash", "harnessVersion"]);

// ── 雜湊（演算法與先前 check_tactic_truth_3a.mjs 內嵌的版本完全相同）──────────────
export const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const norm = (text) => stripComments(text).replace(/\s+/g, " ");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/**
 *  不進 loadedFiles 的檔案（沿用先前 TEXT_HASH_EXEMPT）：capabilityRegistry.js 的 MEASURED_EXCLUSIONS 是結果表的「產物」
 *  （填排除表就讓結果表過期＝循環）；tacticChoiceMapping.js／tacticResolver.js 同時承載「提供哪些選擇」的 UI 清單與「怎麼解析」，
 *  文字雜湊會讓只改 UI 清單也過期。這三支改由 registryHash／mappingHash／resolvedHash（行為雜湊）保護。
 */
export const TEXT_HASH_EXEMPT = Object.freeze(["src/platform/tactics/capabilityRegistry.js", "src/platform/tactics/tacticChoiceMapping.js", "src/battle/moba/tactics/tacticResolver.js"]);
const tracked = (rel) => !TEXT_HASH_EXEMPT.includes(rel);
/** 一個 repo 內檔案的正規化內容雜湊（loadedFiles 的值）。 */
export const hashFile = (rel, readFn = read) => sha(norm(readFn(rel)));

export async function resolvedHash() {
  const Registry = await import("../../src/platform/tactics/capabilityRegistry.js");
  const Mapping = await import("../../src/platform/tactics/tacticChoiceMapping.js");
  const Snap = await import("../../src/platform/contracts/squadSnapshot.js");
  const Plan = await import("./tacticTruthPlan.mjs");
  const { tacticInputOf } = await import("./tacticTruthSim.mjs");
  const { resolveTactic } = await import("../../src/battle/moba/tactics/tacticResolver.js");
  const out = [];
  for (const t of Plan.TEMPLATE_IDS) {
    const base = resolveTactic(tacticInputOf({ templateId: t, choices: {} }));
    out.push([t, "-", "-", base.knobs, base.identity]);
    for (const row of Registry.liveRows()) {
      const d = Mapping.offeredChoiceDetail(t, row.dimension, [], {}, { withMeasured: false });
      //  需要 Director core.v1 的列（每時期型，Phase 3a-C）：以每時期方針解析，雜湊進三個時期的方針（沒要求時會被拒絕＝常數，等於沒保護）。
      const phased = Plan.rulesetOfRow(row) !== null;
      for (const c of d.offered.filter((x) => x !== d.own)) {
        const r = resolveTactic(tacticInputOf({ templateId: t, choices: Mapping.nestedOf([[row.dimension, c]]) }), {}, phased ? { phases: true } : {});
        out.push(phased ? [t, row.dimension, c, r.ok ? r.phases.map((ph) => [ph.knobs, ph.identity]) : r.errors] : [t, row.dimension, c, r.knobs, r.identity]);
      }
    }
  }
  return Snap.stableHash(Snap.stableStringify(out));
}
export async function registryHash() {
  const Registry = await import("../../src/platform/tactics/capabilityRegistry.js");
  const Snap = await import("../../src/platform/contracts/squadSnapshot.js");
  return sha(Snap.stableStringify(Registry.liveRows().map((r) => ({ dimension: r.dimension, choices: r.choices, basis: r.basis, touches: r.touches, resolverFields: r.resolverFields, engineReads: r.engineReads, gate: r.gate }))));
}
export async function mappingHash() {
  const Mapping = await import("../../src/platform/tactics/tacticChoiceMapping.js");
  const Snap = await import("../../src/platform/contracts/squadSnapshot.js");
  //  Phase 3a-C：每時期對照（PHASE_CHOICE_MAPPING）也是量測輸入的一部分（集結 0.9、巨龍 0.95…）。
  return Snap.stableHash(Snap.stableStringify([Mapping.CHOICE_MAPPING, Mapping.PHASE_CHOICE_MAPPING]));
}
export async function templatesVersion() {
  return (await import("../../src/platform/tactics/tacticTemplates.js")).TACTIC_TEMPLATES_VERSION;
}
export async function simVersion() {
  return (await import("../../src/platform/contracts/simulationVersion.js")).MOBA_SIMULATION_VERSION;
}
export const harnessHash = () => sha(norm(read("tools/lib/tacticTruthSim.mjs")));
export async function harnessVersion() {
  return (await import("./tacticTruthSim.mjs")).TRUTH_SIM_VERSION;
}
export async function currentHashes() {
  return {
    simVersion: await simVersion(), registryHash: await registryHash(), resolvedHash: await resolvedHash(),
    mappingHash: await mappingHash(), templatesVersion: await templatesVersion(),
    harnessHash: harnessHash(), harnessVersion: await harnessVersion(),
  };
}

// ── 載入檔記錄（worker 用）────────────────────────────────────────────────
/** 把檔案路徑轉成 repo 相對路徑（斜線）；repo 外或 node_modules 回傳 null。 */
export function repoRelative(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || /(^|\/)node_modules\//.test(rel)) return null;
  return rel;
}
/**
 * 註冊同步 module hook，之後載入的每個 repo 內模組都記下來。回傳 () => 排序後的相對路徑陣列。
 * 這個 Node 沒有 module.registerHooks 就直接丟錯——不退回較弱的機制。
 */
export function installLoadRecorder() {
  if (typeof nodeModule.registerHooks !== "function") throw new Error("module.registerHooks 不存在（需要 Node ≥ 22.15）；不退回較弱的記錄方式");
  const files = new Set();
  nodeModule.registerHooks({
    load(url, context, nextLoad) {
      if (typeof url === "string" && url.startsWith("file:")) { const rel = repoRelative(fileURLToPath(url)); if (rel) files.add(rel); }
      return nextLoad(url, context);
    },
  });
  return () => [...files].sort();
}
/** 把一批相對路徑現在的內容雜湊成 loadedFiles 形狀。 */
export function hashLoadedFiles(rels, readFn = read) {
  return Object.fromEntries([...rels].filter(tracked).sort().map((r) => [r, hashFile(r, readFn)]));
}

// ── 探針：用一個 worker 跑一場最小的對局，回傳它載入的 repo 檔案 ─────────────────
/** workerEntry＝有 --truth-worker 模式的入口（check_tactic_truth_3a.mjs）。對照組（雙方 std）、固定 seed，訊息格式與 --measure 送的相同。 */
//  ruleset（可省略）：探針場次的規則集；預設＝balance runner 的預設（balanceTool.v20）。真實性表有 v21 批次 ⇒ 呼叫端兩個都探。
export function probeLoadedFiles({ workerEntry, seed, timeoutMs = 180000, ruleset = null }) {
  return new Promise((resolve, reject) => {
    const child = fork(workerEntry, ["--truth-worker"], { env: { ...process.env, ESMO_BALANCE_SKILLS: "on" }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`探針逾時（${timeoutMs} ms）`)); }, timeoutMs);
    const finish = (fn, v) => { clearTimeout(timer); child.kill(); fn(v); };
    child.on("message", (m) => {
      if (m.type === "ready") child.send({ type: "run", id: "probe", seed, blue: null, red: null, ...(ruleset ? { ruleset } : {}) });
      else if (m.type === "done") finish(resolve, m.files ?? []);
      else if (m.type === "error") finish(reject, new Error(`探針場次失敗：${String(m.error).slice(0, 300)}`));
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`探針 worker 提前結束 exit=${code}`)); });
  });
}

// ── 依賴式過期判定 ────────────────────────────────────────────────────────
/**
 * 回傳過期原因陣列（空＝沒有過期）。
 *  hashes     currentHashes() 的結果
 *  probeFiles 探針載入的相對路徑（null＝沒跑探針；不檢查新依賴）
 *  readFn     讀檔函式（測試用；預設讀 repo）
 */
export function stalenessReasons(meta, { hashes, probeFiles = null, readFn = read, exists = (rel) => fs.existsSync(path.join(ROOT, rel)) }) {
  const reasons = [];
  if (!meta?.loadedFiles || typeof meta.loadedFiles !== "object") { reasons.push(LEGACY_REASON); return reasons; }
  for (const k of HASH_KEYS) if (meta[k] !== hashes[k]) reasons.push(`${k} 與現在不同（結果是在別的版本量的；重新執行 --measure）`);
  for (const [rel, h] of Object.entries(meta.loadedFiles)) {
    if (!tracked(rel)) continue;
    if (!exists(rel)) reasons.push(`loaded file missing ${rel}`);
    else if (hashFile(rel, readFn) !== h) reasons.push(`loaded file changed ${rel}`);
  }
  if (probeFiles) for (const rel of probeFiles) if (tracked(rel) && !(rel in meta.loadedFiles)) reasons.push(`new dependency ${rel}`);
  return reasons;
}

/** 多個 worker 回報的載入檔聯集，存在批次資料夾的 loadedFiles.json（可續跑）。 */
export function loadedFilesSidecar(dir) {
  const f = path.join(dir, "loadedFiles.json");
  let set = new Set();
  try { set = new Set(JSON.parse(fs.readFileSync(f, "utf8"))); } catch { /* 第一次：還沒有 */ }
  return {
    add(list) { const before = set.size; for (const r of list ?? []) set.add(r); if (set.size !== before) fs.writeFileSync(f, `${JSON.stringify([...set].sort())}\n`, "utf8"); },
    all: () => [...set].sort(),
  };
}
