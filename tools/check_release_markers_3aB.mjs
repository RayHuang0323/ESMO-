#!/usr/bin/env node
// ============================================================================
//  tools/check_release_markers_3aB.mjs — 3a-B 整合最後一輪：版本標記、Bundle 大小、敏感資訊
//
//  執行：在整合樹根目錄
//    node tools/check_release_markers_3aB.mjs --main=<乾淨 main 樹> [--out=<json>]
//  兩棵樹都要先 build 好 dist。不建置、不改任何檔案；有紅燈 exit 1。
//
//  ── 這一支在守什麼（Owner 2026-11-04 決策 2、3）──────────────────────────
//  · 暫時保留內部常數 `moba-sim.v21`，所以「正式路徑仍是 v20」要逐項釘住，
//    不能只看常數的名字。
//  · 接受 v21 程式留在公開 Bundle，但旗標要關著、不得多出敏感資訊，大小要量出來。
//
//  ⚠ 敏感字樣比對的是**打包後的產物**，不是原始碼註解。
//    `service_role` 在 main 就會出現（supabaseClient 的偵測器），所以判準是
//    「合併樹不得比 main 多」，不是「不得出現」。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ROOT = process.cwd();
const MAIN = arg("main");
if (!MAIN || !fs.existsSync(path.join(MAIN, "dist/index.html"))) { console.error("需要 --main=<已 build 的乾淨 main 樹>"); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const out = { schema: "release-markers-3aB.v1", versions: {}, bundle: {}, sensitive: {}, v21Text: {} };
const load = (tree, rel) => import(pathToFileURL(path.join(tree, rel)).href);

// ── V 版本標記 ──────────────────────────────────────────────────────────────
const read = (tree, rel) => fs.readFileSync(path.join(tree, rel), "utf8");
const constOf = (src, name) => src.match(new RegExp(`export const ${name}\\s*=\\s*["'\`]([^"'\`]+)`))?.[1] ?? null;
const VERSION_FILES = [
  ["MOBA_REPLAY_VERSION", "src/platform/contracts/mobaReplay.js"],
  ["COMBAT_STATE_REPLAY_VERSION", "src/platform/contracts/mobaReplay.js"],
];
for (const [name, rel] of VERSION_FILES) {
  const a = constOf(read(ROOT, rel), name), b = constOf(read(MAIN, rel), name);
  out.versions[name] = { merged: a, main: b };
  ck(`V1 ${name} 兩棵樹相同`, a !== null ? a === b : b === null, `${a} / ${b}`);
}
const brv = (t) => read(t, "src/platform/contracts/battleResultVersion.js");
ck("V2 battleResultVersion.js 兩棵樹逐位元相同（BattleResult 版本未變）", brv(ROOT) === brv(MAIN));
const mobaReplaySame = read(ROOT, "src/platform/contracts/mobaReplay.js") === read(MAIN, "src/platform/contracts/mobaReplay.js");
ck("V3 mobaReplay.js 兩棵樹逐位元相同（Replay 契約未變）", mobaReplaySame);

const sim = await load(ROOT, "src/platform/contracts/simulationVersion.js");
const simMain = await load(MAIN, "src/platform/contracts/simulationVersion.js");
const flags = await load(ROOT, "src/featureFlags.js");
const cv = await load(ROOT, "src/platform/challenge/challengeVersion.js");
const ruleset = await load(ROOT, "src/platform/contracts/matchRuleset.js");
out.versions.MOBA_SIMULATION_VERSION = { merged: sim.MOBA_SIMULATION_VERSION, main: simMain.MOBA_SIMULATION_VERSION, note: "內部候選標籤；Owner 決策 2 暫時保留，技術債 TD-3aB-3" };
out.versions.CHALLENGE_SIMULATION_VERSION = cv.CHALLENGE_SIMULATION_VERSION;
ck("V4 內部常數如 Owner 決策暫留 moba-sim.v21；main 是 moba-sim.v20（差異看得見，不是誤判）", sim.MOBA_SIMULATION_VERSION === "moba-sim.v21" && simMain.MOBA_SIMULATION_VERSION === "moba-sim.v20");
ck("V5 Challenge 新場次與重播用的版本是 moba-sim.v20", cv.CHALLENGE_SIMULATION_VERSION === "moba-sim.v20", cv.CHALLENGE_SIMULATION_VERSION);
const replayFromV20 = sim.canReplay("moba-sim.v20", cv.CHALLENGE_SIMULATION_VERSION);
ck("V6 既有 v20 場次在合併樹可重播", replayFromV20.ok === true, JSON.stringify(replayFromV20));
const replayFromV21 = sim.canReplay("moba-sim.v21", cv.CHALLENGE_SIMULATION_VERSION);
ck("V7 v21 場次在旗標關閉時不可當成 v20 重播", replayFromV21.ok === false);
const runnerSrc = read(ROOT, "src/platform/challenge/challengeRunner.js");
ck("V8 重播路徑的預設版本是 CHALLENGE_SIMULATION_VERSION，不是內部常數", /currentSimulationVersion = CHALLENGE_SIMULATION_VERSION/.test(runnerSrc));
const R = ruleset.MATCH_RULESETS ?? ruleset.RULESETS ?? null;
if (R) {
  ck("V9 career.v20／challenge.v20 規則集都標 moba-sim.v20", R["career.v20"]?.simVersion === "moba-sim.v20" && R["challenge.v20"]?.simVersion === "moba-sim.v20");
} else {
  const t = read(ROOT, "src/platform/contracts/matchRuleset.js");
  ck("V9 career.v20／challenge.v20 規則集都標 moba-sim.v20（原始碼）", /"career\.v20":\s*R\(\{[^}]*simVersion:\s*"moba-sim\.v20"/.test(t) && /"challenge\.v20":\s*R\(\{[^}]*simVersion:\s*"moba-sim\.v20"/.test(t));
}

// ── F 旗標 ──────────────────────────────────────────────────────────────────
const F = flags.FEATURE_FLAGS ?? flags.default ?? flags;
ck("F1 原始碼兩個發布旗標都是 false", F.mobaTacticalDirectorV21 === false && F.mobaChallengeV21 === false, `${F.mobaTacticalDirectorV21} / ${F.mobaChallengeV21}`);

// ── B Bundle 大小 ───────────────────────────────────────────────────────────
function scan(tree) {
  const dir = path.join(tree, "dist");
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } };
  walk(dir);
  const rows = files.filter((f) => /\.(js|css|html)$/.test(f)).map((f) => {
    const b = fs.readFileSync(f);
    return { file: path.relative(dir, f).replace(/\\/g, "/"), bytes: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length, sha256: createHash("sha256").update(b).digest("hex") };
  });
  const allFiles = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const js = rows.filter((r) => r.file.endsWith(".js"));
  const entry = js.filter((r) => /^assets\/index-/.test(r.file)).sort((a, b) => b.bytes - a.bytes)[0];
  return { rows, allFiles, codeBytes: rows.reduce((n, r) => n + r.bytes, 0), codeGzip: rows.reduce((n, r) => n + r.gzip, 0), jsCount: js.length, entry };
}
const a = scan(ROOT), b = scan(MAIN);
const delta = (x, y) => `${(x / 1048576).toFixed(3)} MB vs ${(y / 1048576).toFixed(3)} MB（${x >= y ? "+" : ""}${((x - y) / 1024).toFixed(1)} KB，${(((x - y) / y) * 100).toFixed(2)}%）`;
out.bundle = {
  merged: { all: a.allFiles, code: a.codeBytes, gzip: a.codeGzip, js: a.jsCount, entry: a.entry },
  main: { all: b.allFiles, code: b.codeBytes, gzip: b.codeGzip, js: b.jsCount, entry: b.entry },
  mergedRows: a.rows, mainRows: b.rows,
};
console.log(`ℹ 主 bundle：${a.entry.file} ／ ${b.entry.file}　${delta(a.entry.bytes, b.entry.bytes)}`);
console.log(`ℹ 主 bundle gzip：${delta(a.entry.gzip, b.entry.gzip)}`);
console.log(`ℹ 全部 JS／CSS／HTML：${delta(a.codeBytes, b.codeBytes)}`);
console.log(`ℹ 全部 JS／CSS／HTML gzip：${delta(a.codeGzip, b.codeGzip)}`);
console.log(`ℹ dist 全部檔案：${delta(a.allFiles, b.allFiles)}`);
const fpsOf = (s) => s.rows.find((r) => /fpsSim\.worker-/.test(r.file));
ck("B1 CS 模擬 worker 與 main 逐位元相同（v21 沒有進 CS）", fpsOf(a)?.sha256 === fpsOf(b)?.sha256, `${fpsOf(a)?.file} / ${fpsOf(b)?.file}`);

// ── S 敏感資訊（打包產物，合併樹不得比 main 多）──────────────────────────
const PATTERNS = {
  "service_role": /service_role/g,
  "JWT": /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/g,
  "sb_secret": /sb_secret_[A-Za-z0-9_-]+/g,
  "OpenAI key": /\bsk-[A-Za-z0-9_-]{20,}/g,
  "GitHub token": /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  "AWS key": /\bAKIA[0-9A-Z]{12,}/g,
  "private key": /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  "supabase project url": /https:\/\/[a-z0-9]{10,}\.supabase\.co/g,
  "password literal": /\bpassword["']?\s*[:=]\s*["'][^"']{4,}["']/gi,
  "api key literal": /\bapi[_-]?key["']?\s*[:=]\s*["'][^"']{8,}["']/gi,
  "windows user path": /[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9_.-]+/g,
  "local repo path": /OneDrive[\\/]+文件|\.sprints[\\/]|worktrees[\\/]cs-fps/g,
  "owner mail or machine user": /hsirung|ifikn|RayHuang/g,
  "email": /[A-Za-z0-9._+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g,
  "review path": /review\/(tactic-book|cs-major|moba)/g,
  "Owner note": /Owner Review|ownerReview/g,
  "reserved seeds label": /reservedSeeds|RESERVED_SEEDS|保留 Seeds/g,
};
const textOf = (tree) => {
  const dir = path.join(tree, "dist");
  const t = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|css|html|json|map|txt)$/.test(e.name)) t[path.relative(dir, p)] = fs.readFileSync(p, "utf8"); } };
  walk(dir);
  return t;
};
const ta = textOf(ROOT), tb = textOf(MAIN);
const count = (t, re) => Object.values(t).reduce((n, s) => n + (s.match(re)?.length ?? 0), 0);
ck("S0 dist 沒有 source map", !Object.keys(ta).some((f) => f.endsWith(".map")));
for (const [label, re] of Object.entries(PATTERNS)) {
  const x = count(ta, re), y = count(tb, re);
  out.sensitive[label] = { merged: x, main: y };
  //  內容**不印**：這裡只留數字，避免把可能的敏感字串寫進 log 或報告。
  ck(`S1 ${label}：合併樹沒有比 main 多`, x <= y, `${x} / ${y}`);
}

// ── T v21 文字（已接受進 bundle；只量出來，不當紅燈）──────────────────────
for (const needle of ["戰術書", "moba-sim.v21", "career.v21", "challenge.v21", "balanceTool.v21", "v21.b2", "classic.m5", "G-A8"]) {
  out.v21Text[needle] = { merged: Object.values(ta).reduce((n, s) => n + (s.split(needle).length - 1), 0), main: Object.values(tb).reduce((n, s) => n + (s.split(needle).length - 1), 0) };
}
console.log("ℹ v21 文字 合併樹／main：" + JSON.stringify(out.v21Text));

out.pass = pass; out.fail = fail;
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
console.log(`\n${pass}/${pass + fail} 通過${fail ? "（有紅燈）" : ""}`);
process.exit(fail ? 1 : 0);
