#!/usr/bin/env node
// ============================================================================
//  tools/check_gate_policy.mjs — TD-64 收據效期分級（tools/lib/gatePolicy.mjs ＋ releaseGate.verifyReceipt）的測試
//
//    node tools/check_gate_policy.mjs
//
//  §1–§8 用合成收據＋合成環境直接呼叫 verifyReceipt（注入「現在時間」、瀏覽器版本、部署探針）：
//    24／72 小時邊界、舊收據、竄改效期、偽造分類、指令不同、完整 Node／依賴樹、OS、build 的 bundle 與 .env*、
//    --max-age-hours 只能縮短、瀏覽器更新、四引擎的 Playwright、P1／P2v2、正式站部署綁定。
//  §9 端到端（fixture repo，系統暫存區）：CLI run 記錄 policy、--category 自行指定 ⇒ FAIL、
//    docs-carry 連續文件沿用的到期時間＝來源到期時間（不延長）、沿用不能連鎖、smoke 不沿用。
//  不碰真實收據目錄。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "release_gate.mjs");
const LIB = await import(pathToFileURL(path.join(HERE, "lib", "releaseGate.mjs")).href);
const POL = await import(pathToFileURL(path.join(HERE, "lib", "gatePolicy.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 500) : ""}`); } };
const H = 3600000; const NOW = Date.parse("2026-11-26T12:00:00Z");
const SHA = "b".repeat(40), TREE = "c".repeat(40);
const ENV = { node: "24.18.0", nodeMajor: 24, platform: "win32", arch: "x64", osRelease: "10.0.22000", git: "git version 2.47.0", depsDigest: "D", lockfileBlob: "L",
  installedTree: { schema: "esmo.installed-tree/1", status: "PASS", digest: "T1", portableDigest: "P1" }, npm: { bundled: "11.16.0" }, esmoEnv: {} };
const CTX = { targetFull: SHA, treeSha: TREE, env: ENV };
const clone = (o) => JSON.parse(JSON.stringify(o));
/** 合成一張收據。cmds＝指令；policy:true ⇒ 依分類表寫 policy（模擬 run 寫的）。 */
function rc({ gate, cmds, hoursAgo, env = ENV, policy = true, browser = null, bundle, deployment, mutate } = {}) {
  const fin = new Date(NOW - hoursAgo * H).toISOString();
  const cls = POL.classifyGate(gate, cmds);
  const r = { schema: LIB.RECEIPT_SCHEMA, gateVersion: policy ? LIB.RELEASE_GATE_VERSION : "1.0.0", gate, status: "PASS", targetSha: SHA, actualSha: SHA, actualShaAfter: SHA, treeSha: TREE,
    startedAt: fin, finishedAt: fin, env: { ...clone(env), ...(browser ? { browser } : {}) }, checks: [{ id: "x", status: "PASS" }], commands: cmds.map((c) => ({ cmd: c, exitCode: 0, status: "PASS" })),
    bundle, deployment, category: cls.class, policy: policy ? POL.policyRecord(cls) : undefined };
  if (mutate) mutate(r);
  r.digest = LIB.digestOf(r);
  return r;
}
const V = (r, opts = {}) => LIB.verifyReceipt(r, opts.ctx || CTX, { now: NOW, currentBrowser: opts.browser || (() => null), deploymentProbe: opts.probe || (() => ({ ok: false, error: "未注入" })), maxAgeHours: opts.max ?? null });
const st = (v, id) => v.checks.find((c) => c.id === id)?.status;
const LOGIC = { gate: "regress", cmds: ["node tools/regress.mjs"] };

// ═══ §1 72 小時（登記＋指令逐字相同＋環境完全一致）與邊界 ═══════════════════════
{
  let v = V(rc({ ...LOGIC, hoursAgo: 71.9 }));
  ck("登記的 logic gate、環境完全一致：71.9 小時 ⇒ PASS（72h）", v.status === "PASS" && v.policy.tier === "72h" && v.policy.hours === 72, JSON.stringify(v.checks.filter((c) => c.status !== "PASS")));
  v = V(rc({ ...LOGIC, hoursAgo: 72.1 }));
  ck("72.1 小時 ⇒ FAIL receipt_age", v.status === "FAIL" && st(v, "receipt_age") === "FAIL");
  v = V(rc({ ...LOGIC, hoursAgo: 24.5 }));
  ck("24.5 小時（超過舊制、在 72h 內）⇒ PASS", v.status === "PASS");
  ck("到期時間＝完成時間＋72h", v.policy.expiresAt === new Date(NOW - 24.5 * H + 72 * H).toISOString());
  v = V(rc({ gate: "golden-v21a", cmds: ["node tools/check_match_golden_v21a.mjs"], hoursAgo: 48 }));
  ck("golden（版本隔離／Golden）48 小時 ⇒ PASS（72h）", v.status === "PASS" && v.policy.class === "golden");
}
// ═══ §2 舊收據、分類表版本 ═══════════════════════════════════════════════
{
  let v = V(rc({ ...LOGIC, hoursAgo: 24.1, policy: false }));
  ck("舊收據（沒有 policy）＝舊制 24h：24.1 小時 ⇒ FAIL（不會因分級上線而重新生效）", v.status === "FAIL" && st(v, "receipt_age") === "FAIL" && v.policy.tier === "legacy-24h");
  v = V(rc({ ...LOGIC, hoursAgo: 23.9, policy: false }));
  ck("舊收據 23.9 小時 ⇒ PASS（相容）", v.status === "PASS");
  v = V(rc({ ...LOGIC, hoursAgo: 23.9, policy: false, env: { ...ENV, installedTree: undefined, node: undefined, npm: undefined } }));
  ck("舊收據沒有完整依賴樹欄位 ⇒ 只比舊欄位（相容）", v.status === "PASS");
  v = V(rc({ ...LOGIC, hoursAgo: 30, mutate: (r) => { r.policy.tableDigest = "0".repeat(64); } }));
  ck("分類表摘要與現行不同 ⇒ 退回 24h（30 小時 ⇒ FAIL）", v.status === "FAIL" && v.policy.tier === "legacy-24h");
  v = V(rc({ ...LOGIC, hoursAgo: 30, mutate: (r) => { r.policy.version = "esmo.gate-policy/0"; } }));
  ck("分類表版本不同 ⇒ 退回 24h", v.status === "FAIL" && v.policy.tier === "legacy-24h");
}
// ═══ §3 竄改與偽造 ═══════════════════════════════════════════════════════
{
  const r = rc({ ...LOGIC, hoursAgo: 10 }); r.finishedAt = new Date(NOW).toISOString();
  let v = V(r);
  ck("改了 finishedAt（沒重算摘要）⇒ FAIL receipt_digest", st(v, "receipt_digest") === "FAIL" && v.status === "FAIL");
  v = V(rc({ ...LOGIC, hoursAgo: 100, mutate: (x) => { x.policy.hours = 1000; } }));
  ck("把收據裡的 policy.hours 改成 1000（重算摘要）⇒ 時數仍由分類表決定，100 小時 ⇒ FAIL", v.status === "FAIL" && st(v, "receipt_age") === "FAIL" && v.policy.hours === 72);
  v = V(rc({ gate: "browser_check_my_flow", cmds: ["node tools/browser_check_my_flow.mjs"], hoursAgo: 30, browser: { chrome: "158" }, mutate: (x) => { x.policy.class = "logic"; x.category = "logic"; } }), { browser: () => "158" });
  ck("瀏覽器 gate 的收據自稱 logic（重算摘要）⇒ FAIL receipt_policy（分類不能自己寫）", st(v, "receipt_policy") === "FAIL" && v.status === "FAIL");
  v = V(rc({ gate: "regress", cmds: ["node tools/regress.mjs --quick"], hoursAgo: 30 }));
  ck("登記名稱但指令不同 ⇒ 不是登記分類（unknown 24h）：30 小時 ⇒ FAIL", v.status === "FAIL" && v.policy.class === "unknown");
  v = V(rc({ gate: "regress", cmds: ["node tools/regress.mjs --quick"], hoursAgo: 30, mutate: (x) => { x.policy = POL.policyRecord(POL.classifyGate("regress", ["node tools/regress.mjs"])); } }));
  ck("指令不同卻把 policy 寫成登記的 logic ⇒ FAIL receipt_policy", st(v, "receipt_policy") === "FAIL");
  v = V(rc({ gate: "my-logic", cmds: ["node tools/regress.mjs"], hoursAgo: 30 }));
  ck("登記的指令換一個沒登記的名稱 ⇒ unknown 24h（名稱＋指令都要對）", v.policy.class === "unknown" && v.status === "FAIL");
}
// ═══ §4 72h 的環境條件：任何一項不同 ⇒ 不給 72h ═════════════════════════════
{
  const cases = [["完整 Node 版本不同（同主版本）", { node: "24.17.0" }], ["OS 版本不同", { osRelease: "10.0.22631" }], ["git 版本不同", { git: "git version 2.40.0" }], ["npm 版本不同", { npm: { bundled: "10.9.0" } }]];
  for (const [label, d] of cases) {
    const v30 = V(rc({ ...LOGIC, hoursAgo: 30, env: { ...ENV, ...d } }));
    const v10 = V(rc({ ...LOGIC, hoursAgo: 10, env: { ...ENV, ...d } }));
    ck(`${label} ⇒ 不給 72h：30 小時 FAIL、10 小時 PASS（舊制仍可用）`, v30.status === "FAIL" && st(v30, "receipt_age") === "FAIL" && v10.status === "PASS", JSON.stringify(v10.checks.filter((c) => c.status !== "PASS")));
  }
  let v = V(rc({ ...LOGIC, hoursAgo: 1, env: { ...ENV, installedTree: { ...ENV.installedTree, digest: "T2" } } }));
  ck("整棵依賴樹摘要不同 ⇒ 1 小時也 FAIL receipt_env（深層依賴變了）", v.status === "FAIL" && st(v, "receipt_env") === "FAIL");
  v = V(rc({ ...LOGIC, hoursAgo: 1 }), { ctx: { ...CTX, env: { ...ENV, installedTree: null } } });
  ck("收據有記錄依賴樹、現在卻查不到 ⇒ FAIL receipt_env", v.status === "FAIL" && st(v, "receipt_env") === "FAIL");
  v = V(rc({ ...LOGIC, hoursAgo: 30, env: { ...ENV, installedTree: { ...ENV.installedTree, status: "FAIL" } } }), { ctx: { ...CTX, env: { ...ENV, installedTree: { ...ENV.installedTree, status: "FAIL" } } } });
  ck("收據當時依賴樹不是 PASS ⇒ 不給 72h", v.status === "FAIL" && v.policy.tier === "legacy-24h");
}
// ═══ §5 Production Build ═════════════════════════════════════════════════
{
  const B = { gate: "build", cmds: ["npm run build"] };
  const bundle = { dir: "dist", files: 581, aggregateSha256: "a".repeat(64), buildEnv: {}, envFiles: [] };
  ck("build＋bundle 雜湊＋沒有 .env* ⇒ 30 小時 PASS（72h）", V(rc({ ...B, hoursAgo: 30, bundle })).status === "PASS");
  ck("build 沒有 --record-bundle ⇒ 不給 72h（30 小時 FAIL）", V(rc({ ...B, hoursAgo: 30 })).status === "FAIL");
  ck("build 時有 .env.local ⇒ 不給 72h（內容不在 tree 裡）", V(rc({ ...B, hoursAgo: 30, bundle: { ...bundle, envFiles: [{ name: ".env.local", sha256: "x" }] } })).status === "FAIL");
  ck("舊格式 bundle（沒有 envFiles 紀錄）⇒ 不給 72h", V(rc({ ...B, hoursAgo: 30, bundle: { ...bundle, envFiles: undefined } })).status === "FAIL");
  ck("收據不記錄 VITE_* 的值，只記雜湊（不洩漏秘密）", Object.values(LIB.viteEnvFingerprint({ VITE_X: "secret-value" })).every((h) => /^[0-9a-f]{64}$/.test(h) && h !== "secret-value"));
}
// ═══ §6 --max-age-hours 只能縮短 ═══════════════════════════════════════════
{
  ck("--max-age-hours 24 讓 72h 收據在 30 小時 FAIL（縮短有效）", V(rc({ ...LOGIC, hoursAgo: 30 }), { max: 24 }).status === "FAIL");
  ck("--max-age-hours 1000 不能延長舊收據（30 小時仍 FAIL）", V(rc({ ...LOGIC, hoursAgo: 30, policy: false }), { max: 1000 }).status === "FAIL");
  ck("--max-age-hours 1000 不能把 72h 延長（80 小時 FAIL）", V(rc({ ...LOGIC, hoursAgo: 80 }), { max: 1000 }).status === "FAIL");
}
// ═══ §7 瀏覽器、四引擎、效能 ═══════════════════════════════════════════════
{
  const BR = { gate: "browser_check_cs_formal", cmds: ["node tools/browser/run-gate.mjs tools/browser_check_cs_formal.mjs"] };
  ck("瀏覽器 gate：24h 內、Chrome 版本相同 ⇒ PASS", V(rc({ ...BR, hoursAgo: 10, browser: { chrome: "158.0.1" } }), { browser: () => "158.0.1" }).status === "PASS");
  let v = V(rc({ ...BR, hoursAgo: 10, browser: { chrome: "158.0.1" } }), { browser: () => "159.0.0" });
  ck("Chrome 自動更新 ⇒ FAIL receipt_browser:chrome", v.status === "FAIL" && st(v, "receipt_browser:chrome") === "FAIL");
  v = V(rc({ ...BR, hoursAgo: 10, browser: { chrome: "158.0.1" } }), { browser: () => null });
  ck("現在查不到 Chrome 版本 ⇒ BLOCKED（不能確認沒更新）", v.status === "BLOCKED" && st(v, "receipt_browser:chrome") === "BLOCKED");
  v = V(rc({ ...BR, hoursAgo: 10 }), { browser: () => "158.0.1" });
  ck("新格式瀏覽器收據沒記錄 Chrome 版本 ⇒ FAIL", v.status === "FAIL");
  ck("瀏覽器 gate 25 小時 ⇒ FAIL（最多 24h）", V(rc({ ...BR, hoursAgo: 25, browser: { chrome: "158.0.1" } }), { browser: () => "158.0.1" }).status === "FAIL");
  // 2026-11-26 審查修正（I2）：舊版工具的瀏覽器／smoke 收據沒有版本與部署紀錄，若照舊接受，舊 checkout 就能永久繞過加嚴檢查
  ck("舊版工具（v1.0.0、沒有 policy）的瀏覽器收據 ⇒ FAIL receipt_policy：要用新版重跑", V(rc({ ...BR, hoursAgo: 10, policy: false }), { browser: () => "159" }).status === "FAIL");
  ck("舊版工具的 logic 收據仍以舊制 24h 接受（相容）", V(rc({ ...LOGIC, hoursAgo: 10, policy: false })).status === "PASS");
  ck("新版（v1.1.0）收據卻沒有 policy ⇒ FAIL（不完整或被改過）", V(rc({ ...LOGIC, hoursAgo: 1, policy: false, mutate: (x) => { x.gateVersion = LIB.RELEASE_GATE_VERSION; } })).status === "FAIL");
  ck("未知的舊版本（0.9.0）⇒ FAIL receipt_gate_version", st(V(rc({ ...LOGIC, hoursAgo: 1, mutate: (x) => { x.gateVersion = "0.9.0"; } })), "receipt_gate_version") === "FAIL");
  const XE = { gate: "c2-crossengine-formal", cmds: ["node tools/c1/run_c1_crossengine.mjs --plan=p.json --out=o"] };
  const both = { chrome: "158.0.1", playwright: "playwright 1.63.0 firefox=155.0@r1543 webkit=26.6@r2359" };
  const cur = (k) => ({ chrome: "158.0.1", playwright: both.playwright }[k]);
  ck("四引擎：Chrome 與 Playwright 版本都相同 ⇒ PASS", V(rc({ ...XE, hoursAgo: 5, browser: both }), { browser: cur }).status === "PASS");
  v = V(rc({ ...XE, hoursAgo: 5, browser: both }), { browser: (k) => (k === "playwright" ? "playwright 1.64.0 firefox=156.0@r1550 webkit=26.6@r2359" : "158.0.1") });
  ck("四引擎：Playwright（Firefox／WebKit build）更新 ⇒ FAIL receipt_browser:playwright", v.status === "FAIL" && st(v, "receipt_browser:playwright") === "FAIL");
  v = V(rc({ ...XE, hoursAgo: 5, browser: { chrome: "158.0.1" } }), { browser: cur });
  ck("四引擎收據只記錄了 Chrome ⇒ FAIL（每個引擎都要記錄實際版本）", v.status === "FAIL");
  const PF = { gate: "c1c2-closure-perf-p2v2", cmds: ["node tools/c2/perf_c2_kernel.mjs --out=o"] };
  ck("P2v2 效能：24h、記錄 Chrome；25 小時 ⇒ FAIL", V(rc({ ...PF, hoursAgo: 25, browser: { chrome: "158.0.1" } }), { browser: () => "158.0.1" }).status === "FAIL" && V(rc({ ...PF, hoursAgo: 23, browser: { chrome: "158.0.1" } }), { browser: () => "158.0.1" }).status === "PASS");
  ck("效能類標記 contractBound（完整實驗單位仍以事前登記契約為準）", POL.classifyGate(PF.gate, PF.cmds).contractBound === true);
}
// ═══ §8 正式站 smoke 綁定部署 ═══════════════════════════════════════════════
{
  const SM = { gate: "prod-smoke-cs", cmds: ["node tools/browser_check_prod_release_3aB.mjs --url=https://example.invalid/ESMO-/"] };
  const dep = { url: "https://example.invalid/ESMO-/", indexSha256: "e".repeat(64), stable: true };
  const same = () => ({ ok: true, indexSha256: "e".repeat(64) }), changed = () => ({ ok: true, indexSha256: "f".repeat(64) }), down = () => ({ ok: false, error: "ENOTFOUND" });
  const b = { chrome: "158" }, cb = () => "158";
  ck("smoke：部署沒變 ⇒ PASS", V(rc({ ...SM, hoursAgo: 2, browser: b, deployment: dep }), { browser: cb, probe: same }).status === "PASS");
  let v = V(rc({ ...SM, hoursAgo: 2, browser: b, deployment: dep }), { browser: cb, probe: changed });
  ck("smoke：正式站已重新部署 ⇒ FAIL receipt_deployment（不能跨部署沿用）", v.status === "FAIL" && st(v, "receipt_deployment") === "FAIL");
  v = V(rc({ ...SM, hoursAgo: 2, browser: b, deployment: dep }), { browser: cb, probe: down });
  ck("smoke：抓不到正式站 ⇒ BLOCKED", v.status === "BLOCKED" && st(v, "receipt_deployment") === "BLOCKED");
  ck("smoke：沒記錄部署身分 ⇒ FAIL", V(rc({ ...SM, hoursAgo: 2, browser: b }), { browser: cb, probe: same }).status === "FAIL");
  ck("smoke：執行期間被重新部署（stable=false）⇒ FAIL", V(rc({ ...SM, hoursAgo: 2, browser: b, deployment: { ...dep, stable: false } }), { browser: cb, probe: same }).status === "FAIL");
  ck("smoke 分類：neverCarry（docs-carry 一律不沿用）", POL.classifyGate(SM.gate, SM.cmds).neverCarry === true);
}

// ═══ §9 端到端：CLI run＋docs-carry（fixture repo）═══════════════════════════
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-gpol-"));
process.on("exit", () => { if (path.resolve(BASE).startsWith(path.resolve(os.tmpdir())) && path.basename(BASE).startsWith("esmo-gpol-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const git = (cwd, ...args) => spawnSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const head = (d) => git(d, "rev-parse", "HEAD").stdout.trim();
const FAKE_VITE = `import fs from "node:fs"; import path from "node:path";
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("vite/5.4.0"); process.exit(0); }
if (a[0] === "build") { const i = a.indexOf("--outDir"); const out = path.resolve(i >= 0 ? a[i + 1] : "dist"); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), fs.readFileSync("index.html")); fs.writeFileSync(path.join(out, "main.js"), fs.readFileSync("src/main.js")); process.exit(0); }
process.exit(3);`;
const dir = path.join(BASE, "fx"); const rdir = path.join(BASE, "receipts");
git(BASE, "init", "-q", "-b", "main", dir); git(dir, "config", "core.autocrlf", "false");
write(path.join(dir, ".gitignore"), "node_modules/\ndist/\n");
write(path.join(dir, "package.json"), JSON.stringify({ name: "fx", private: true, type: "module", scripts: { build: "node node_modules/vite/bin/vite.js build" }, devDependencies: { vite: "^5.0.0" } }, null, 1));
write(path.join(dir, "package-lock.json"), JSON.stringify({ name: "fx", lockfileVersion: 3, packages: { "": { name: "fx" }, "node_modules/vite": { version: "5.4.0" } } }, null, 1));
write(path.join(dir, "index.html"), "<!doctype html><title>fx</title>\n"); write(path.join(dir, "vite.config.js"), "export default {};\n");
write(path.join(dir, "src", "main.js"), "export const x = 1;\n"); write(path.join(dir, "docs", "readme.md"), "v0\n");
write(path.join(dir, "tools", "regress.mjs"), "process.exit(0);\n");
git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "base");
write(path.join(dir, "node_modules", "vite", "package.json"), JSON.stringify({ name: "vite", version: "5.4.0" })); write(path.join(dir, "node_modules", "vite", "bin", "vite.js"), FAKE_VITE);
const cli = (argv) => { const r = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", timeout: 300000 }); let j = null; try { j = JSON.parse(r.stdout); } catch { /* 非 JSON */ } return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), j }; };
const B = head(dir);
const run = (sha, gate, cmd, extra = []) => cli(["run", "--repo", dir, "--target-sha", sha, "--receipts-dir", rdir, "--gate", gate, "--cmd", cmd, "--json", ...extra]);
const r1 = run(B, "regress", "node tools/regress.mjs");
const rec1 = r1.j?.receipt ? JSON.parse(fs.readFileSync(r1.j.receipt, "utf8")) : null;
ck("CLI run（登記 gate、逐字指令）⇒ PASS，收據 policy＝logic／registered／72", r1.code === 0 && rec1?.policy?.class === "logic" && rec1.policy.registered === true && rec1.policy.hours === 72 && rec1.policy.version === POL.GATE_POLICY_VERSION, r1.out.slice(-300));
ck("CLI run：收據記錄完整依賴樹摘要、完整 Node 版本、npm", !!rec1?.env?.installedTree?.digest && rec1.env.node === process.versions.node && "npm" in (rec1.env || {}));
const r2 = run(B, "mycheck", "node tools/regress.mjs", ["--category", "logic"]);
ck("CLI run：--category logic 給未登記的 gate ⇒ FAIL category_matches_policy（不能自己指定分類）", r2.code === 1 && /category_matches_policy/.test(r2.out), r2.out.slice(-300));
const r3 = run(B, "prod-smoke-x", "node tools/regress.mjs");
ck("CLI run：smoke 類沒給 --deployment-url ⇒ BLOCKED，指令不執行", r3.code === 2 && /deployment_identity/.test(r3.out) && !(r3.j?.commands || []).length, r3.out.slice(-300));
const r4 = run(B, "build", "npm run build", ["--record-bundle", "dist"]);
const rec4 = r4.j?.receipt ? JSON.parse(fs.readFileSync(r4.j.receipt, "utf8")) : null;
ck("CLI run build＋--record-bundle ⇒ 收據有 bundle 雜湊與 envFiles（空陣列）", r4.code === 0 && rec4?.policy?.class === "build" && !!rec4.bundle?.aggregateSha256 && Array.isArray(rec4.bundle.envFiles) && rec4.bundle.envFiles.length === 0, r4.out.slice(-300));

// 連續文件 commit：B → D1 → D2
const edit = (t) => { write(path.join(dir, "docs", "readme.md"), t); git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", t.trim()); return head(dir); };
const D1 = edit("v1\n"); const D2 = edit("v2\n");
const carry = (base, target) => { git(dir, "checkout", "-q", "--detach", target); return cli(["carry", "--repo", dir, "--target-sha", target, "--base-sha", base, "--receipts-dir", rdir, "--require-gate", "regress", "--require-gate", "build", "--json"]); };
const c1 = carry(B, D1);
const carry1 = c1.j?.receipt ? JSON.parse(fs.readFileSync(c1.j.receipt, "utf8")) : null;
const baseExp = new Date(Date.parse(rec1.finishedAt) + 72 * H).toISOString(), buildExp = new Date(Date.parse(rec4.finishedAt) + 72 * H).toISOString();
const firstExp = [baseExp, buildExp].sort()[0];
ck("carry B→D1：PASS，到期＝來源收據依分類表算的最早到期（72h，不延長）", c1.code === 0 && carry1?.expiresAt === firstExp, c1.out.slice(-400));
const A = (target, now) => LIB.assertReceipts({ repo: dir, target, gates: ["regress"], receiptsDir: rdir, now, currentBrowser: () => null, deploymentProbe: () => ({ ok: false }) });
git(dir, "checkout", "-q", "--detach", D1);
const fin1 = Date.parse(rec1.finishedAt);
ck("assert D1 在來源完成後 30 小時 ⇒ PASS（沿用 72h 來源）", A(D1, fin1 + 30 * H).status === "PASS");
ck("assert D1 在來源完成後 73 小時 ⇒ FAIL（沿用不延長來源效期）", A(D1, fin1 + 73 * H).status === "FAIL");
const c2 = carry(D1, D2);
ck("carry D1→D2（D1 只有沿用收據）⇒ BLOCKED：不能連鎖沿用", c2.code === 2 && /carry_base:regress/.test(c2.out), c2.out.slice(-300));
const c3 = carry(B, D2);
const carry3 = c3.j?.receipt ? JSON.parse(fs.readFileSync(c3.j.receipt, "utf8")) : null;
ck("carry B→D2（直接從已驗證的 B）⇒ PASS，到期時間與 B→D1 相同（連續文件 commit 不會延長）", c3.code === 0 && carry3?.expiresAt === carry1?.expiresAt, c3.out.slice(-300));
git(dir, "checkout", "-q", "--detach", D2);
ck("assert D2 在 73 小時 ⇒ FAIL", A(D2, fin1 + 73 * H).status === "FAIL");

// ═══ §10 獨立審查（2026-11-26）修正的回歸 ═══════════════════════════════════
{
  ck("I2：Release Gate 升到 1.1.0（舊版 1.0.0 收據只在不需加嚴的分類接受）", LIB.RELEASE_GATE_VERSION === "1.1.0" && LIB.LEGACY_GATE_VERSIONS.includes("1.0.0"));
  ck("ESMO_* 環境變數（例如 ESMO_VERIFY_FLAT）有值 ⇒ 不給 72h（30 小時 FAIL）", V(rc({ ...LOGIC, hoursAgo: 30, env: { ...ENV, esmoEnv: { ESMO_VERIFY_FLAT: "x" } } })).status === "FAIL");
  ck("沒有記錄 ESMO_* 的收據 ⇒ 不給 72h", V(rc({ ...LOGIC, hoursAgo: 30, env: { ...ENV, esmoEnv: undefined } })).status === "FAIL");
  // I1：--deployment-url 必須是實際被測的正式站
  const sm = run(B, "prod-smoke-y", "node tools/regress.mjs", ["--deployment-url", "https://example.com/"]);
  ck("I1：smoke 的 --deployment-url 不是 origin 的 Pages 根網址、也不在指令 --url ⇒ FAIL deployment_url_bound（指令不執行）", sm.code === 1 && /deployment_url_bound/.test(sm.out) && !(sm.j?.commands || []).length, sm.out.slice(-300));
  ck("I1：deploymentUrlBound 接受指令裡的 --url（本機 preview）", LIB.deploymentUrlBound("http://127.0.0.1:4173/ESMO-/", ["node tools/x.mjs --url=http://127.0.0.1:4173/ESMO-/"], dir).ok === true);
  // I5：沒登記、名稱也不像瀏覽器，但實際 import 了 tools/browser/harness.mjs ⇒ 加嚴成 browser
  write(path.join(dir, "tools", "browser", "harness.mjs"), "export const launch = () => 1;\n");
  write(path.join(dir, "tools", "quiet_check.mjs"), 'import { launch } from "./browser/harness.mjs";\nprocess.exit(launch() === 1 ? 0 : 1);\n');
  git(dir, "checkout", "-q", "-B", "i5"); git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "i5"); const S5 = head(dir);
  const q = run(S5, "quiet-check", "node tools/quiet_check.mjs");
  const qr = q.j?.receipt ? JSON.parse(fs.readFileSync(q.j.receipt, "utf8")) : null;
  ck("I5：名稱不像瀏覽器、但實際 import 瀏覽器模組的 gate ⇒ 收據 policy＝browser，記錄 Chrome 版本", qr?.policy?.class === "browser" && ("chrome" in (qr?.env?.browser || {})), JSON.stringify({ p: qr?.policy, b: qr?.env?.browser }));
  const qa = LIB.assertReceipts({ repo: dir, target: S5, gates: ["quiet-check"], receiptsDir: rdir, currentBrowser: () => "999.0.0.0", deploymentProbe: () => ({ ok: false }) });
  ck("I5：之後 Chrome 版本不同 ⇒ assert FAIL receipt_browser:chrome", qa.status === "FAIL" && JSON.stringify(qa.detail["quiet-check"].checks).includes("receipt_browser:chrome"), JSON.stringify(qa.checks.slice(-1)));
  const forged = JSON.parse(fs.readFileSync(q.j.receipt, "utf8")); forged.policy.class = "unknown"; forged.category = "unknown"; delete forged.env.browser; forged.digest = LIB.digestOf(forged);
  const vf = LIB.verifyReceipt(forged, { targetFull: S5, treeSha: forged.treeSha, env: forged.env, repoTop: dir }, { currentBrowser: () => null, deploymentProbe: () => ({ ok: false }) });
  ck("I5：把偵測到的 browser 改寫成 unknown（重算摘要）⇒ assert 在 SHA 上重新偵測 ⇒ FAIL", vf.status === "FAIL" && vf.checks.some((c) => c.id === "receipt_policy" && c.status === "FAIL"), JSON.stringify(vf.checks.filter((c) => c.status !== "PASS")));
  ck("I5：讀取 harness 原始碼做靜態檢查（不 import）的工具不會被誤判為瀏覽器", (await import(pathToFileURL(path.join(HERE, "lib", "docsCarry.mjs")).href)).detectTightening(path.resolve(HERE, ".."), "HEAD", ["node tools/check_safe_process.mjs"]).class === null);
  // I4：沿用的實際到期＝沿用收據與「來源現在重驗」取早
  git(dir, "checkout", "-q", "--detach", D1);
  const pre = LIB.preflight({ repo: dir, target: D1, receiptsDir: rdir });
  const DC = await import(pathToFileURL(path.join(HERE, "lib", "docsCarry.mjs")).href);
  const crc = LIB.loadReceipts(rdir, { targetSha: D1, gate: DC.CARRY_GATE })[0].receipt;
  const v24 = DC.verifyCarry(crc, { ...pre.ctx, env: { ...pre.ctx.env, node: "0.0.1-patch" } }, "regress", { receiptsDir: rdir, currentBrowser: () => null, deploymentProbe: () => ({ ok: false }) });
  ck("I4：Node 修補版改變 ⇒ 來源退回 24h，verifyCarry 回報的到期也跟著變早（readiness 不會顯示過長的窗口）", Date.parse(v24.policy?.expiresAt) === Date.parse(rec1.finishedAt) + 24 * H && Date.parse(v24.policy.expiresAt) < Date.parse(crc.expiresAt), JSON.stringify({ p: v24.policy?.expiresAt, c: crc.expiresAt }));
}

console.log(`\nGate policy（TD-64 效期分級）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
