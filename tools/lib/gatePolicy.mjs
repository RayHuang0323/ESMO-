// ============================================================================
//  tools/lib/gatePolicy.mjs — Release Gate 收據效期分級（TD-64，Owner 2026-11-26 核准方向；S1.1 實作）
//
//  ── 規則（全部由這份固定、版本化的分類表決定；呼叫端無法自己指定分類來拿到更長效期）────────────
//    · 72 小時只給「登記在 REGISTERED 裡、而且收據裡的指令與登記的指令逐字相同」的 gate：
//        logic（純邏輯與決定性）、golden（Golden 與版本隔離）、build（Production Build）。
//      還要再通過 eligibility72()：完整 Node 版本、完整依賴樹摘要、平台／架構／OS 版本、git、npm 與收據當時相同；
//      build 另外要有 --record-bundle 的 bundle 雜湊，而且建置時沒有 .env* 檔（Vite 會讀它們，內容不在 tree 裡）。
//      任何一項不成立 ⇒ 不給 72 小時，退回舊制 24 小時（舊制的其他檢查照常）。
//    · 其他一律 ≤ 24 小時。沒登記的 gate＝unknown（24 小時）；名稱或指令「看起來」是瀏覽器／四引擎／效能／正式站時，
//      只會「加嚴」：要求記錄並比對瀏覽器版本、或綁定正式站部署。啟發式永遠不會延長效期。
//    · 舊收據（沒有 policy 欄位）＝舊制 24 小時，不會因為分類表上線而重新生效或延長。
//    · 分類表任何改動都要升 GATE_POLICY_VERSION；收據記錄的分類表摘要與現在不同 ⇒ 退回舊制 24 小時。
//    · Production Smoke：只代表「當下那一版正式站」。run 時記錄 --deployment-url 的 index.html 雜湊（前後各一次，必須相同），
//      assert 時重抓：不同＝正式站已重新部署 ⇒ FAIL；抓不到 ⇒ BLOCKED。docs-carry 一律不沿用。
//    · P1／P2v2 等效能實驗：24 小時；完整實驗單位與樣本仍以各自的事前登記契約為準（本表不放寬任何契約）。
//  ⚠ --max-age-hours 只能「縮短」：有效時數 = min(分類時數, --max-age-hours)。
// ============================================================================
import crypto from "node:crypto";

export const GATE_POLICY_VERSION = "esmo.gate-policy/1";
export const LEGACY_HOURS = 24;

export const CLASSES = Object.freeze({
  logic: { label: "純邏輯與決定性", hours: 72 },
  golden: { label: "Golden 與版本隔離", hours: 72 },
  build: { label: "Production Build", hours: 72, needsBundle: true },
  browser: { label: "瀏覽器功能", hours: 24, browsers: ["chrome"] },
  "cross-engine": { label: "四引擎一致性", hours: 24, browsers: ["chrome", "playwright"] },
  perf: { label: "效能與記憶體（P1／P2v2 等）", hours: 24, browsers: ["chrome"], contractBound: true },
  "prod-smoke": { label: "正式站 Production Smoke", hours: 24, browsers: ["chrome"], deploymentBound: true, neverCarry: true },
  unknown: { label: "未登記（保守：舊制 24 小時）", hours: LEGACY_HOURS },
});

/** 登記的 gate：名稱 → { class, commands（逐字） }。只有這裡的條目能拿到 72 小時。 */
export const REGISTERED = Object.freeze({
  "release-gate-guard": { class: "logic", commands: ["node tools/check_release_gate_guard.mjs"] },
  "release-docs-carry": { class: "logic", commands: ["node tools/check_release_docs_carry.mjs"] },
  "safe-process": { class: "logic", commands: ["node tools/check_safe_process.mjs"] },
  "checkpoint": { class: "logic", commands: ["node tools/check_checkpoint.mjs"] },
  "ci-deploy-decision": { class: "logic", commands: ["node tools/check_ci_deploy_decision.mjs"] },
  "release-gate-plan": { class: "logic", commands: ["node tools/check_release_gate_plan.mjs"] },
  "release-readiness": { class: "logic", commands: ["node tools/check_release_readiness.mjs"] },
  "installed-tree": { class: "logic", commands: ["node tools/check_installed_tree_lib.mjs"] },
  "gate-policy": { class: "logic", commands: ["node tools/check_gate_policy.mjs"] },
  "crossengine-checkpoint": { class: "logic", commands: ["node tools/check_crossengine_checkpoint.mjs"] },
  "regress": { class: "logic", commands: ["node tools/regress.mjs"] },
  "regress2": { class: "logic", commands: ["node tools/regress2.mjs"] },
  "det-math-c1": { class: "logic", commands: ["node tools/check_det_math_c1.mjs"] },
  "det-hypot-c2": { class: "logic", commands: ["node tools/check_det_hypot_c2.mjs"] },
  "det-math-accuracy-v2": { class: "logic", commands: ["node tools/check_det_math_accuracy_v2.mjs"] },
  "golden-v21a": { class: "golden", commands: ["node tools/check_match_golden_v21a.mjs"] },
  "c1-legacy-golden": { class: "golden", commands: ["node tools/check_c1_legacy_golden.mjs"] },
  "c2-v25-golden": { class: "golden", commands: ["node tools/check_c2_v25_golden.mjs"] },
  "c1-isolation": { class: "golden", commands: ["node tools/check_c1_isolation.mjs"] },
  "c2-isolation": { class: "golden", commands: ["node tools/check_c2_isolation.mjs"] },
  "build": { class: "build", commands: ["npm run build"] },
});

/** 只會加嚴的啟發式（未登記 gate 用）。順序＝嚴格度高的先。 */
const TIGHTEN = [
  { class: "prod-smoke", re: /browser_check_prod_|prod[-_]?smoke|production[-_]smoke|--url[= ]+["']?https?:\/\/(?!127\.0\.0\.1|localhost)/i },
  { class: "cross-engine", re: /crossengine|cross-engine|four-?engine|c1_engines|playwright|firefox|webkit/i },
  { class: "perf", re: /\bperf_|perf[-_]|p2v2|\bp1a?\b|bench|heap|memory/i },
  { class: "browser", re: /browser_check_|tools[\\/]browser[\\/]|run-gate|\bcdp\b|chrome|browser/i },
];

const canonical = (v) => Array.isArray(v) ? "[" + v.map(canonical).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}" : JSON.stringify(v) ?? "null";
export const POLICY_TABLE_DIGEST = crypto.createHash("sha256").update(canonical({ v: GATE_POLICY_VERSION, CLASSES, REGISTERED, TIGHTEN: TIGHTEN.map((t) => [t.class, String(t.re)]) })).digest("hex");
const normCmd = (s) => String(s).trim().replace(/\s+/g, " ");

/**
 * 由 gate 名稱與實際指令決定分類（收據裡寫的分類一律不採信，assert 時用這裡重算）。
 * 回傳 { class, label, hours, registered, exact, browsers[], deploymentBound, neverCarry, contractBound, needsBundle, why }
 */
/** 嚴格度：數字越大檢查越多、效期越短。只允許往上（加嚴）。 */
export const RANK = Object.freeze({ logic: 0, golden: 0, build: 0, unknown: 0, browser: 1, perf: 2, "cross-engine": 3, "prod-smoke": 4 });
export function classifyGate(gate, commands = [], { detected = null } = {}) {
  const base = classifyBase(gate, commands);
  // 審查修正（I5）：指令實際會 import 到瀏覽器／四引擎模組或寫死正式站網址（tools/lib/docsCarry.mjs detectTightening）⇒ 加嚴
  if (detected && CLASSES[detected] && RANK[detected] > RANK[base.class]) {
    const c = CLASSES[detected];
    return { ...base, class: detected, label: c.label, hours: Math.min(c.hours, LEGACY_HOURS), browsers: c.browsers || [], deploymentBound: !!c.deploymentBound, neverCarry: !!c.neverCarry, contractBound: !!c.contractBound, needsBundle: !!c.needsBundle,
      registered: false, exact: false, why: `${base.why}；指令實際會跑到「${c.label}」的模組 ⇒ 加嚴` };
  }
  return base;
}
function classifyBase(gate, commands) {
  const cmds = commands.map(normCmd);
  const reg = REGISTERED[gate];
  const pack = (cls, extra) => ({ class: cls, label: CLASSES[cls].label, hours: CLASSES[cls].hours, browsers: CLASSES[cls].browsers || [], deploymentBound: !!CLASSES[cls].deploymentBound,
    neverCarry: !!CLASSES[cls].neverCarry, contractBound: !!CLASSES[cls].contractBound, needsBundle: !!CLASSES[cls].needsBundle, ...extra });
  if (reg && cmds.length === reg.commands.length && reg.commands.every((c, i) => normCmd(c) === cmds[i])) return pack(reg.class, { registered: true, exact: true, why: `登記的 gate「${gate}」，指令逐字相同` });
  const hay = `${gate}\n${cmds.join("\n")}`;
  const t = TIGHTEN.find((x) => x.re.test(hay));
  const why = reg ? `「${gate}」有登記，但指令與登記的不同 ⇒ 視為未登記` : `「${gate}」沒有登記`;
  if (t) { const p = pack(t.class, { registered: false, exact: false, why: `${why}；名稱／指令看起來是 ${CLASSES[t.class].label} ⇒ 套用該類的加嚴檢查` }); p.hours = Math.min(p.hours, LEGACY_HOURS); return p; }
  return pack("unknown", { registered: false, exact: false, why });
}

/** run 時寫進收據的 policy 欄位（僅供報告；assert 會重算並比對）。 */
export function policyRecord(cls) {
  return { version: GATE_POLICY_VERSION, tableDigest: POLICY_TABLE_DIGEST, class: cls.class, registered: cls.registered, hours: cls.hours, browsers: cls.browsers, deploymentBound: cls.deploymentBound };
}

/**
 * 72 小時資格：收據當時的環境與現在「完全一致」。回傳 { ok, missing[] }（missing 是不成立的條件，報告用）。
 * rc：收據；cur：現在的 ctx.env。
 */
export function eligibility72(cls, rc, cur) {
  const e = rc.env || {}, c = cur || {}; const miss = [];
  if (!cls.registered || !cls.exact) miss.push("不是登記的 gate／指令不同");
  if (!(cls.hours > LEGACY_HOURS)) miss.push("分類本身不是 72 小時類");
  const eq = (name, a, b) => { if (a === undefined || a === null || a !== b) miss.push(`${name}（收據 ${a ?? "未記錄"} ≠ 現在 ${b ?? "未知"}）`); };
  eq("完整 Node 版本", e.node, c.node);
  eq("完整依賴樹摘要", e.installedTree?.digest, c.installedTree?.digest);
  eq("平台", e.platform, c.platform); eq("架構", e.arch, c.arch); eq("OS 版本", e.osRelease, c.osRelease);
  eq("git", e.git, c.git); eq("npm", e.npm?.bundled, c.npm?.bundled);
  if (e.installedTree && e.installedTree.status !== "PASS") miss.push("收據當時依賴樹不是 PASS");
  if (!e.esmoEnv) miss.push("收據沒有記錄 ESMO_* 環境變數（舊格式）");
  else if (Object.keys(e.esmoEnv).length) miss.push(`執行時設了會改變 gate 行為的環境變數：${Object.keys(e.esmoEnv).join("、")}`);
  if (cls.needsBundle) {
    if (!rc.bundle?.aggregateSha256) miss.push("build 收據沒有 --record-bundle 的 bundle 雜湊");
    else if (!Array.isArray(rc.bundle.envFiles)) miss.push("build 收據沒有記錄 .env* 檔案狀態（舊格式）");
    else if (rc.bundle.envFiles.length) miss.push(`build 時有 .env* 檔（${rc.bundle.envFiles.map((f) => f.name).join("、")}）：內容不在 tree 裡，無法保證可重現`);
  }
  return { ok: miss.length === 0, missing: miss };
}
