#!/usr/bin/env node
// ============================================================================
//  tools/ci/deploy_decision.mjs — 這次 push 需不需要重新部署 GitHub Pages？
//
//    node tools/ci/deploy_decision.mjs --repo . --head <sha> --event <push|workflow_dispatch|…> \
//         (--last-deployed <sha> | --last-deployed-from-api) [--github-output <檔案>] [--json]
//
//  為什麼不用 paths-ignore：
//    · paths-ignore 只看「這次 push 帶了哪些檔」，看不到「上一次部署其實失敗了」。上一個產品 push 的部署
//      失敗（例如 Pages 500）之後，接著推一個純文件 commit 會被跳過 ⇒ 產品永遠不會上線，卻沒人發現。
//    · 只看副檔名：public/**/*.md 會被複製進 dist；src 用 ?raw／import.meta.glob 匯入的 .md 會進 bundle。
//
//  判斷（任何不確定 ⇒ 部署）：
//    1. 不是 push（例如 workflow_dispatch 手動部署）⇒ 部署
//    2. 找不到「最後一次成功部署」的 SHA、或它不是 HEAD 的祖先（歷史被改寫）⇒ 部署
//    3. 最後成功部署..HEAD 的每一列都是白名單文件（docs/**/*.md、review/**/*.md、AGENTS.md…，一般檔 100644），
//       而且產品原始碼／建置設定沒有用 bundler 語法引用它們、.github 與 package.json 也沒提到它們 ⇒ 不部署
//    4. 其他 ⇒ 部署
//  輸出：deploy=true|false（寫進 $GITHUB_OUTPUT）＋原因。exit 永遠是 0（判斷失敗也是「部署」，不讓 CI 因此紅）。
//  另外輸出 expect_identical_bundle=true|false（S1.1，TD-65）：只有在「push、找得到最後成功部署、而且自那之後沒有任何
//  產品／建置輸入（src、public、index.html、vite.config.*、package*.json）或 .github 變更」時才是 true ⇒
//  build 出來的 dist 必須與正式站逐檔相同（tools/ci/compare_dist_with_site.mjs），不同就在部署前失敗。其他情況一律 false（不設期待）。
//  API 位址用 GitHub Actions 的標準變數 GITHUB_API_URL（預設 https://api.github.com；測試可指向本機假伺服器）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { git, BUILD_INPUT_PREFIXES } from "../lib/releaseGate.mjs";
import { rawDiff, classifyDiff, lsTree, findReaders } from "../lib/docsCarry.mjs";

const argv = process.argv.slice(2); const a = {};
for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (!t.startsWith("--")) continue; const k = t.slice(2); if (["json", "last-deployed-from-api"].includes(k)) a[k] = true; else a[k] = argv[++i]; }
const repo = path.resolve(a.repo || ".");
const PRODUCT_READER = /^(src\/|vite\.config\.|index\.html$|public\/|package(-lock)?\.json$|\.github\/)/;

async function lastSuccessfulDeployment() {
  // GitHub 的 deployments API：environment=github-pages，最新在前；取「最新狀態是 success」的第一筆
  const repoName = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!repoName || !token) return { sha: null, why: "沒有 GITHUB_REPOSITORY／GITHUB_TOKEN" };
  const base = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const api = (p) => fetch(`${base}/repos/${repoName}${p}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } }).then((r) => { if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`); return r.json(); });
  const deps = await api("/deployments?environment=github-pages&per_page=30");
  for (const d of deps) {
    const st = await api(`/deployments/${d.id}/statuses?per_page=1`);
    if (st[0]?.state === "success") return { sha: d.sha, why: `deployment ${d.id}` };
  }
  return { sha: null, why: "最近 30 筆部署沒有成功的" };
}

export async function decide({ repo, head, event, lastDeployed }) {
  const r = { deploy: true, expectIdenticalBundle: false, reasons: [], head, lastDeployed: lastDeployed || null, event };
  const yes = (why) => { r.deploy = true; r.reasons.push(why); return r; };
  if (event !== "push") return yes(`事件是 ${event || "(未知)"}，不是 push：手動或其他觸發一律部署`);
  const H = git(repo, ["rev-parse", "--verify", "--quiet", `${head}^{commit}`]).out;
  if (!/^[0-9a-f]{40}$/.test(H)) return yes(`HEAD「${head}」解析不到`);
  if (!lastDeployed) return yes("找不到最後一次成功部署的 SHA");
  const L = git(repo, ["rev-parse", "--verify", "--quiet", `${lastDeployed}^{commit}`]).out;
  if (!/^[0-9a-f]{40}$/.test(L)) return yes(`最後成功部署的 ${lastDeployed} 不在這份歷史裡（checkout 要 fetch-depth: 0）`);
  if (git(repo, ["merge-base", "--is-ancestor", L, H]).status !== 0) return yes(`最後成功部署的 ${L.slice(0, 12)} 不是 HEAD 的祖先（歷史被改寫）`);
  if (L === H) { r.deploy = false; r.reasons.push("HEAD 就是最後成功部署的版本"); return r; }
  const rows = rawDiff(repo, L, H);
  if (!rows) return yes("git diff 讀不懂");
  // 自最後成功部署以來沒有任何產品／建置輸入或 CI 設定變更 ⇒ 這次 build 必須與正式站相同（部署前比對）
  const affects = rows.filter((x) => x.path.startsWith(".github/") || BUILD_INPUT_PREFIXES.some((p) => x.path === p || x.path.startsWith(p)));
  r.expectIdenticalBundle = affects.length === 0;
  r.productInputChanges = affects.map((x) => x.path).slice(0, 20);
  const bad = classifyDiff(rows);
  if (bad.length) return yes(`自最後成功部署以來有非文件變更：${bad.slice(0, 5).join("；")}`);
  const readers = findReaders(repo, H, rows.map((x) => x.path), lsTree(repo, H)).filter((x) => PRODUCT_READER.test(x.path));
  if (readers.length) return yes(`變更的文件被建置輸入引用：${readers.map((x) => x.path).slice(0, 5).join("、")}`);
  r.deploy = false; r.reasons.push(`自最後成功部署 ${L.slice(0, 12)} 以來只有 ${rows.length} 個不進 bundle 的文件變更`);
  return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let last = a["last-deployed"] || null, lastWhy = "參數";
  if (a["last-deployed-from-api"]) { try { const x = await lastSuccessfulDeployment(); last = x.sha; lastWhy = x.why; } catch (e) { last = null; lastWhy = `API 失敗：${e.message}`; } }
  let res;
  try { res = await decide({ repo, head: a.head || git(repo, ["rev-parse", "HEAD"]).out, event: a.event || process.env.GITHUB_EVENT_NAME, lastDeployed: last }); }
  catch (e) { res = { deploy: true, reasons: [`判斷時發生錯誤，保守部署：${e.message}`] }; }
  res.lastDeployedSource = lastWhy;
  if (a["github-output"]) fs.appendFileSync(a["github-output"], `deploy=${res.deploy}\nexpect_identical_bundle=${res.expectIdenticalBundle === true}\n`);
  if (a.json) console.log(JSON.stringify(res, null, 1));
  else { console.log(`deploy=${res.deploy}`); console.log(`expect_identical_bundle=${res.expectIdenticalBundle === true}`); for (const x of res.reasons) console.log(`  · ${x}`); console.log(`  （最後成功部署來源：${lastWhy}）`); }
  process.exit(0);
}
