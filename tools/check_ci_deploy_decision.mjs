#!/usr/bin/env node
// ============================================================================
//  tools/check_ci_deploy_decision.mjs — 部署判斷（tools/ci/deploy_decision.mjs）與候選 deploy.yml 的測試
//
//    node tools/check_ci_deploy_decision.mjs
//
//  拋棄式 git repo 模擬各種 push；另外用真實 ESMO 歷史驗兩個已知案例。
//  ⚠ 這裡驗的是「判斷邏輯」與「workflow 檔的寫法」，不是 GitHub 真實執行結果（那要等真的 push 之後才有證據）。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { decide } = await import(pathToFileURL(path.join(HERE, "ci", "deploy_decision.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 400) : ""}`); } };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-cdd-"));
process.on("exit", () => { if (path.basename(BASE).startsWith("esmo-cdd-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const R = path.join(BASE, "r"); fs.mkdirSync(R);
git(R, "init", "-q", "-b", "main"); git(R, "config", "core.filemode", "false");
for (const [f, t] of Object.entries({ "src/main.js": "export const x = 1;\n", "public/logo.txt": "logo\n", "public/SOURCES.md": "cc0\n", "index.html": "<html></html>\n", "vite.config.js": "export default {};\n", "package.json": "{}\n", "package-lock.json": "{}\n", ".github/workflows/deploy.yml": "on: push\n", "tools/ci/deploy_decision.mjs": "// x\n", "tools/check_a.mjs": 'const f = "docs/contract.md";\n', "docs/readme.md": "a\n", "docs/contract.md": "c\n", "review/r.md": "r\n", "review/data.json": "{}\n", "AGENTS.md": "rules\n" })) write(path.join(R, f), t);
git(R, "add", "-A"); git(R, "commit", "-q", "-m", "deployed");
const DEPLOYED = git(R, "rev-parse", "HEAD").stdout.trim();
const at = (sha) => git(R, "checkout", "-q", "--detach", sha);
const change = (file, text) => { at(DEPLOYED); write(path.join(R, file), text ?? `v${Math.random()}\n`); git(R, "add", "-A"); git(R, "commit", "-q", "-m", file); return git(R, "rev-parse", "HEAD").stdout.trim(); };
const d = (head, extra = {}) => decide({ repo: R, head, event: "push", lastDeployed: DEPLOYED, ...extra });

const mustDeploy = [["src 變更", "src/main.js"], ["public 變更", "public/logo.txt"], ["public 內的 .md", "public/SOURCES.md"], ["依賴變更（package-lock）", "package-lock.json"], ["package.json 變更", "package.json"], ["建置設定（vite.config）", "vite.config.js"], ["index.html", "index.html"], ["CI 設定（.github）", ".github/workflows/deploy.yml"], ["部署判斷工具本身", "tools/ci/deploy_decision.mjs"], ["測試工具（tools）", "tools/check_a.mjs"], ["review 內的非 md 資料", "review/data.json"], ["docs 內的非 md 檔", "docs/img.png"]];
for (const [label, file] of mustDeploy) { const h = change(file); const r = await d(h); ck(`${label} ⇒ 部署`, r.deploy === true, JSON.stringify(r.reasons)); }
{ const h = change("docs/readme.md", "b\n"); const r = await d(h); ck("純文件（docs/*.md）、上一次成功部署就是父 commit ⇒ 不部署", r.deploy === false, JSON.stringify(r.reasons)); }
{ const h = change("AGENTS.md", "rules2\n"); ck("AGENTS.md 文件 ⇒ 不部署", (await d(h)).deploy === false); }
{ const h = change("docs/contract.md", "c2\n"); const r = await d(h); ck("被測試工具讀取的文件：不影響 bundle ⇒ 不部署（Gate 證據另由 docs-carry 處理）", r.deploy === false, JSON.stringify(r.reasons)); }
{ at(DEPLOYED); write(path.join(R, "src/main.js"), 'import n from "../docs/readme.md?raw";\nexport { n };\n'); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "import md"); const imp = git(R, "rev-parse", "HEAD").stdout.trim();
  const r0 = await decide({ repo: R, head: imp, event: "push", lastDeployed: imp });
  write(path.join(R, "docs/readme.md"), "z\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "doc"); const h = git(R, "rev-parse", "HEAD").stdout.trim();
  const r = await decide({ repo: R, head: h, event: "push", lastDeployed: imp });
  ck("文件被 src 以 ?raw 匯入（會進 bundle）⇒ 部署", r0.deploy === false && r.deploy === true, JSON.stringify(r.reasons)); }
// 審查補充：Vite 根目錄絕對路徑 glob、帶 query 的 glob、樣板字串 import
for (const [label, code] of [["import.meta.glob('/docs/**/*.md')（根目錄絕對路徑）", 'export const a = import.meta.glob("/docs/**/*.md", { query: "?raw", eager: true });\n'], ["帶 ?raw 的相對 glob", 'export const a = import.meta.glob("../docs/*.md?raw");\n'], ["樣板字串動態 import", "export const f = (n) => import(`../docs/${n}.md?raw`);\n"]]) {
  at(DEPLOYED); write(path.join(R, "src/main.js"), code); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "glob"); const g = git(R, "rev-parse", "HEAD").stdout.trim();
  write(path.join(R, "docs/readme.md"), `g${Math.random()}\n`); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "doc"); const h = git(R, "rev-parse", "HEAD").stdout.trim();
  const r = await decide({ repo: R, head: h, event: "push", lastDeployed: g });
  ck(`文件被 ${label} 涵蓋 ⇒ 部署`, r.deploy === true, JSON.stringify(r.reasons));
}
{ at(DEPLOYED); write(path.join(R, "src/main.js"), "export const f = (id) => import(`./heroes/${id}.js`);\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "dyn js"); const g = git(R, "rev-parse", "HEAD").stdout.trim();
  write(path.join(R, "docs/readme.md"), "dyn\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "doc"); const h = git(R, "rev-parse", "HEAD").stdout.trim();
  ck("src 只有指向 .js 的動態 import（不會碰到文件）⇒ 純文件仍可不部署", (await decide({ repo: R, head: h, event: "push", lastDeployed: g })).deploy === false); }
{ // 上一次部署失敗：產品 commit P 沒有成功部署，接著推純文件 commit D
  const P = change("src/main.js", "export const x = 2;\n"); write(path.join(R, "docs/readme.md"), "after\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "docs"); const D = git(R, "rev-parse", "HEAD").stdout.trim();
  const r = await d(D);
  ck("前一次產品部署失敗、後面只推文件 ⇒ 仍部署（比對最後『成功』部署，不是上一個 commit）", r.deploy === true && /非文件變更/.test(r.reasons.join("")), JSON.stringify(r.reasons));
  const r2 = await decide({ repo: R, head: D, event: "push", lastDeployed: P });
  ck("同一案例若產品版已成功部署 ⇒ 不部署", r2.deploy === false); }
{ const h = change("docs/readme.md", "c\n");
  ck("workflow_dispatch（手動部署）⇒ 一律部署", (await d(h, { event: "workflow_dispatch" })).deploy === true);
  ck("找不到最後成功部署（API 失敗、權杖缺）⇒ 部署", (await d(h, { lastDeployed: null })).deploy === true);
  ck("最後成功部署的 SHA 不在歷史裡（淺層 checkout）⇒ 部署", (await d(h, { lastDeployed: "f".repeat(40) })).deploy === true);
  at(DEPLOYED); git(R, "checkout", "-q", "-B", "side"); write(path.join(R, "docs/readme.md"), "side\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "side"); const side = git(R, "rev-parse", "HEAD").stdout.trim();
  ck("最後成功部署不是 HEAD 的祖先（歷史被改寫）⇒ 部署", (await d(h, { lastDeployed: side })).deploy === true);
  at(DEPLOYED); git(R, "update-index", "--chmod=+x", "docs/readme.md"); git(R, "commit", "-q", "-m", "chmod"); const m = git(R, "rev-parse", "HEAD").stdout.trim();
  ck("文件權限位元變更 ⇒ 部署（保守）", (await d(m)).deploy === true); }

// ── CLI：寫 $GITHUB_OUTPUT、沒有權杖時保守部署 ─────────────────────────────
{ const out = path.join(BASE, "gh_output"); const h = change("docs/readme.md", "cli\n");
  const env = { ...process.env }; delete env.GITHUB_TOKEN; delete env.GITHUB_REPOSITORY;
  const r = spawnSync(process.execPath, [path.join(HERE, "ci", "deploy_decision.mjs"), "--repo", R, "--head", h, "--event", "push", "--last-deployed-from-api", "--github-output", out], { encoding: "utf8", env });
  ck("CLI：沒有 GITHUB_TOKEN 時無法查最後部署 ⇒ deploy=true 寫入 GITHUB_OUTPUT，exit 0", r.status === 0 && fs.readFileSync(out, "utf8").trim() === "deploy=true", r.stdout + r.stderr);
  const r2 = spawnSync(process.execPath, [path.join(HERE, "ci", "deploy_decision.mjs"), "--repo", R, "--head", h, "--event", "push", "--last-deployed", DEPLOYED, "--github-output", out], { encoding: "utf8" });
  ck("CLI：純文件 ⇒ deploy=false", r2.status === 0 && fs.readFileSync(out, "utf8").trim().split("\n").pop() === "deploy=false", r2.stdout); }

// ── 真實 ESMO 歷史 ─────────────────────────────────────────────────────────
{ const REPO = path.resolve(HERE, "..");
  const has = (s) => git(REPO, "cat-file", "-e", `${s}^{commit}`).status === 0;
  if (has("43d2b757baaf33117d82012990bd6956e5acd84e") && has("93655403806340bbc1456623fb7834b92f331ce3") && has("053fd5823522aad2cb07a4c91609020475e31a26")) {
    const r1 = await decide({ repo: REPO, head: "43d2b757baaf33117d82012990bd6956e5acd84e", event: "push", lastDeployed: "93655403806340bbc1456623fb7834b92f331ce3" });
    ck("真實：43d2b757（12 個 .md）相對已部署的 93655403 ⇒ 不部署（2026-11-26 那次重新部署其實可以省掉）", r1.deploy === false, JSON.stringify(r1.reasons));
    const r2 = await decide({ repo: REPO, head: "93655403806340bbc1456623fb7834b92f331ce3", event: "push", lastDeployed: "053fd5823522aad2cb07a4c91609020475e31a26" });
    ck("真實：93655403（C1＋C2 產品）相對 053fd582 ⇒ 部署", r2.deploy === true, JSON.stringify(r2.reasons));
  } else ck("真實歷史案例（這個 checkout 沒有那些 commit，略過即失敗以免假綠）", false);
}

// ── 候選 deploy.yml 的寫法 ────────────────────────────────────────────────
{ const y = fs.readFileSync(path.resolve(HERE, "..", ".github", "workflows", "deploy.yml"), "utf8");
  ck("workflow：安裝改用 npm ci --legacy-peer-deps，不再有 npm install", /run:\s*npm ci --legacy-peer-deps/.test(y) && !/run:\s*npm install/.test(y));
  ck("workflow：安裝後驗整棵依賴樹與 lockfile 相同", /check_installed_tree\.mjs/.test(y));
  ck("workflow：build 只有 decide 明確輸出 false 才跳過、取消時不跑（!cancelled）", /needs:\s*decide/.test(y) && /if:\s*\$\{\{\s*!cancelled\(\)\s*&&\s*needs\.decide\.outputs\.deploy\s*!=\s*'false'\s*\}\}/.test(y));
  ck("workflow：deploy needs build，且條件是 build 成功（不受 decide 失敗連帶跳過）", /deploy:\s*\n\s*needs:\s*build/.test(y) && /if:\s*\$\{\{\s*!cancelled\(\)\s*&&\s*needs\.build\.result\s*==\s*'success'\s*\}\}/.test(y));
  ck("workflow：decide 有完整歷史（fetch-depth: 0）與 deployments: read", /fetch-depth:\s*0/.test(y) && /deployments:\s*read/.test(y));
  ck("workflow：保留 workflow_dispatch 手動部署與 Supabase 環境檢查", /workflow_dispatch:/.test(y) && /check_supabase_env\.mjs/.test(y));
  const code = y.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // 註解裡說明「為什麼不用」不算（CLAUDE.md：先剝註解再比對）
  ck("workflow：沒有 paths-ignore 設定（避免看不到上次部署失敗）", !/paths-ignore/.test(code) && /paths-ignore/.test(y));
  ck("workflow：build 後印出 dist 雜湊", /DIST_HASH/.test(y)); }

console.log(`\nCI deploy decision：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
