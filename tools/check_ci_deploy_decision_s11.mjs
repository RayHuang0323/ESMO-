// ============================================================================
//  tools/check_ci_deploy_decision_s11.mjs — TD-65（Release Engineering S1.1）CI 部署判斷的補充情境
//  由 tools/check_ci_deploy_decision.mjs 呼叫（共用同一個 fixture repo）；單獨執行沒有意義。
//
//  · 多個文件 commit 一次推送、文件＋產品混合、只有工具、空差異、改了又改回
//  · 部署前 bundle 比對的期待（expect_identical_bundle）只在「沒有產品／建置輸入變更」時成立
//    （Final Integration 起 .github 變更不再取消期待；ci-dryrun 必須真的要求相同；Actions 裡的 annotation）
//  · GitHub API：失敗（500）、權限不足（403）、回應讀不懂、最近沒有成功部署、最新一筆還在進行中 ⇒ 用較舊的成功部署
//    （用 GITHUB_API_URL 指向本機假伺服器；假伺服器跑在子行程）
//  · 判斷工具本身出錯（--repo 不存在）⇒ 仍輸出 deploy=true、exit 0
//  · compare_dist_with_site：相同、內容不同、正式站沒有、網路失敗（--expect-identical true／false）
//  · workflow：比對步驟位置與條件、ci-dryrun.yml 沒有部署能力、兩份 workflow 的 build 指令沒有分歧
// ============================================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function run({ ck, R, BASE, git, write, DEPLOYED, at, decide, HERE }) {
  const commit = (file, text) => { write(path.join(R, file), text ?? `v${Math.random()}\n`); git(R, "add", "-A"); git(R, "commit", "-q", "-m", file); return git(R, "rev-parse", "HEAD").stdout.trim(); };
  const d = (head, extra = {}) => decide({ repo: R, head, event: "push", lastDeployed: DEPLOYED, ...extra });

  // ── 推送的組合 ───────────────────────────────────────────────────────────
  at(DEPLOYED); commit("docs/readme.md", "m1\n"); commit("review/r.md", "m2\n"); const multi = commit("AGENTS.md", "m3\n");
  let r = await d(multi);
  ck("多個文件 commit 一次推送（3 個）⇒ 不部署，expect_identical_bundle=true", r.deploy === false && r.expectIdenticalBundle === true, JSON.stringify(r));
  at(DEPLOYED); commit("docs/readme.md", "x1\n"); const mixed = commit("src/main.js", "export const x = 9;\n");
  r = await d(mixed);
  ck("文件與產品變更一起推送 ⇒ 部署，不期待 bundle 相同", r.deploy === true && r.expectIdenticalBundle === false && r.productInputChanges.includes("src/main.js"), JSON.stringify(r));
  at(DEPLOYED); const toolsOnly = commit("tools/check_a.mjs", 'const f = "x";\n');
  r = await d(toolsOnly);
  ck("只有測試工具變更 ⇒ 部署（不是文件），但產品輸入沒變 ⇒ 期待 bundle 與正式站相同", r.deploy === true && r.expectIdenticalBundle === true, JSON.stringify(r));
  at(DEPLOYED); const gh = commit(".github/workflows/deploy.yml", "on: [push]\n");
  r = await d(gh);
  ck("FI：CI 設定變更 ⇒ 部署，而且仍期待 bundle 相同（改 CI 的推送也要在部署前證明 bundle 沒變；刻意改 bundle 用 workflow_dispatch）", r.deploy === true && r.expectIdenticalBundle === true && r.ciChanges.includes(".github/workflows/deploy.yml"), JSON.stringify(r));
  at(DEPLOYED); commit("tools/check_a.mjs", 'const f = "gh";\n'); const ghReader = commit(".github/workflows/deploy.yml", "on: [push]\njobs: { b: { steps: [ { run: node tools/check_a.mjs } ] } }\n");
  r = await d(ghReader);
  ck("FI：workflow 提到變更的工具檔（.github 是讀者）⇒ 仍期待相同（.github 不進 bundle）", r.deploy === true && r.expectIdenticalBundle === true, JSON.stringify(r));
  at(DEPLOYED); commit(".github/workflows/deploy.yml", "on: [push]\n"); const ghSrc = commit("src/main.js", "export const x = 7;\n");
  r = await d(ghSrc);
  ck("FI：CI 設定＋src 一起變更 ⇒ 部署，不期待相同（產品本來就變了）", r.deploy === true && r.expectIdenticalBundle === false && r.productInputChanges.includes("src/main.js"), JSON.stringify(r));
  at(DEPLOYED); for (const p of ["package-lock.json", "vite.config.js", "index.html", "public/logo.txt"]) { at(DEPLOYED); const h = commit(p); const x = await d(h); if (!(x.deploy && !x.expectIdenticalBundle)) { ck(`${p} 變更 ⇒ 不期待 bundle 相同`, false, JSON.stringify(x)); } }
  ck("lock／vite.config／index.html／public 任一變更 ⇒ 部署且不期待 bundle 相同", true);
  // 審查修正（C1）：已部署版本的 src 以 ?raw 匯入一份文件；之後推送「那份文件＋工具」⇒ bundle 本來就會不同 ⇒ 不得期待相同
  at(DEPLOYED); const rawBase = commit("src/main.js", 'import notes from "../docs/readme.md?raw";\nexport { notes };\n');
  commit("docs/readme.md", "changed doc that is bundled\n"); const rawPush = commit("tools/check_a.mjs", 'const f = "y";\n');
  r = await decide({ repo: R, head: rawPush, event: "push", lastDeployed: rawBase });
  ck("C1：被 src ?raw 匯入的文件＋工具一起變更 ⇒ 部署，且不期待 bundle 相同（不會在部署前誤擋）", r.deploy === true && r.expectIdenticalBundle === false && r.productInputChanges.some((p) => p.startsWith("src/main.js")), JSON.stringify(r));
  at(rawBase); const rawDocOnly = commit("docs/readme.md", "only the bundled doc\n");
  r = await decide({ repo: R, head: rawDocOnly, event: "push", lastDeployed: rawBase });
  ck("C1：只改被 ?raw 匯入的文件 ⇒ 部署、不期待相同", r.deploy === true && r.expectIdenticalBundle === false, JSON.stringify(r));
  const yv = fs.readFileSync(path.resolve(HERE, "..", ".github", "workflows", "deploy.yml"), "utf8");
  ck("C1：repo Variables（VITE_SUPABASE_*）任一有值 ⇒ workflow 不設期待（改 Variables 的 build 本來就不同）", /expect_identical_bundle == 'true' && vars\.VITE_SUPABASE_URL == '' && vars\.VITE_SUPABASE_ANON_KEY == '' && vars\.VITE_SUPABASE_REDIRECT_URL == ''/.test(yv));
  at(DEPLOYED); git(R, "commit", "-q", "--allow-empty", "-m", "empty"); const empty = git(R, "rev-parse", "HEAD").stdout.trim();
  r = await d(empty);
  ck("空 commit（tree 與已部署相同）⇒ 不部署（bundle 必然相同）", r.deploy === false, JSON.stringify(r));
  at(DEPLOYED); commit("src/main.js", "export const x = 2;\n"); const back = commit("src/main.js", "export const x = 1;\n");
  r = await d(back);
  ck("改了 src 又改回（淨差異為 0）⇒ 不部署（比對的是 tree，不是 commit 訊息）", r.deploy === false, JSON.stringify(r));
  r = await d(back, { event: "workflow_dispatch" });
  ck("workflow_dispatch ⇒ 一律部署，且不設 bundle 期待（Owner 手動部署可能是為了改 Variables）", r.deploy === true && r.expectIdenticalBundle === false);
  r = await d(multi, { lastDeployed: null });
  ck("找不到最後成功部署 ⇒ 部署，不設 bundle 期待（不確定時不擋也不跳過）", r.deploy === true && r.expectIdenticalBundle === false);

  // ── GitHub API（假伺服器子行程）───────────────────────────────────────────
  const srvJs = path.join(BASE, "fake_api.mjs");
  fs.writeFileSync(srvJs, `import http from "node:http";
const mode = process.argv[2], dep = process.argv[3], other = process.argv[4];
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
http.createServer((req, res) => {
  if (!/^Bearer /.test(req.headers.authorization || "")) return send(res, 401, { message: "no auth" });
  const u = new URL(req.url, "http://x");
  if (mode === "500") return send(res, 500, { message: "boom" });
  if (mode === "403") return send(res, 403, { message: "Resource not accessible by integration" });
  if (mode === "garbage") return send(res, 200, "<html>not json");
  if (u.pathname.endsWith("/deployments")) {
    if (mode === "none") return send(res, 200, [{ id: 1, sha: dep }]);
    if (mode === "pending-then-ok") return send(res, 200, [{ id: 2, sha: other }, { id: 1, sha: dep }]);
    return send(res, 200, [{ id: 1, sha: dep }]);
  }
  const m = /deployments\\/(\\d+)\\/statuses/.exec(u.pathname);
  if (m) { if (mode === "none") return send(res, 200, [{ state: "failure" }]); if (mode === "pending-then-ok" && m[1] === "2") return send(res, 200, [{ state: "in_progress" }]); return send(res, 200, [{ state: "success" }]); }
  send(res, 404, {});
}).listen(0, "127.0.0.1", function () { console.log(this.address().port); });
`);
  const apiCase = async (mode, head, { other = DEPLOYED } = {}) => {
    const srv = spawn(process.execPath, [srvJs, mode, DEPLOYED, other], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    try {
      const port = await new Promise((res) => { srv.stdout.once("data", (b) => res(Number(String(b).trim()))); setTimeout(() => res(null), 8000); });
      const out = path.join(BASE, `gho_${mode}`);
      const env = { ...process.env, GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_API_URL: `http://127.0.0.1:${port}` };
      const x = await new Promise((res) => { const c = spawn(process.execPath, [path.join(HERE, "ci", "deploy_decision.mjs"), "--repo", R, "--head", head, "--event", "push", "--last-deployed-from-api", "--github-output", out], { env, stdio: ["ignore", "pipe", "pipe"] }); let so = ""; c.stdout.on("data", (b) => { so += b; }); c.on("close", (code) => res({ code, so })); });
      return { ...x, output: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "" };
    } finally { try { srv.kill(); } catch { /* 已結束 */ } }
  };
  let a = await apiCase("ok", multi);
  ck("API 正常、最後成功部署＝DEPLOYED、之後只有文件 ⇒ deploy=false", a.code === 0 && /deploy=false/.test(a.output), a.so);
  a = await apiCase("500", multi);
  ck("API 失敗（HTTP 500）⇒ deploy=true（保守），exit 0", a.code === 0 && /deploy=true/.test(a.output) && /API 失敗/.test(a.so), a.so);
  a = await apiCase("403", multi);
  ck("權限不足（HTTP 403）⇒ deploy=true", a.code === 0 && /deploy=true/.test(a.output), a.so);
  a = await apiCase("garbage", multi);
  ck("API 回應讀不懂 ⇒ deploy=true", a.code === 0 && /deploy=true/.test(a.output), a.so);
  a = await apiCase("none", multi);
  ck("最近的部署都不是 success ⇒ deploy=true", a.code === 0 && /deploy=true/.test(a.output), JSON.stringify({ code: a.code, output: a.output, so: a.so }));
  //  FI：連續多次 API 呼叫後正常結束（不再因 process.exit 與 keep-alive 連線競態而崩潰）
  { const codes = []; for (let i = 0; i < 4; i++) codes.push((await apiCase("none", multi)).code);
    ck("FI：API 呼叫後結束 4/4 次 exit 0（不在 keep-alive 連線關閉中途 process.exit）", codes.every((c) => c === 0), codes.join(",")); }
  a = await apiCase("pending-then-ok", multi, { other: mixed });
  ck("最新一筆部署還在進行中（產品版）⇒ 以較舊的成功部署為基準；之後只有文件 ⇒ deploy=false", a.code === 0 && /deploy=false/.test(a.output), a.so);
  const crash = spawnSync(process.execPath, [path.join(HERE, "ci", "deploy_decision.mjs"), "--repo", path.join(BASE, "no-such-repo"), "--head", "abc", "--event", "push", "--last-deployed", DEPLOYED, "--github-output", path.join(BASE, "gho_crash")], { encoding: "utf8" });
  ck("判斷工具本身出錯（repo 不存在）⇒ 仍輸出 deploy=true、exit 0", crash.status === 0 && /deploy=true/.test(fs.readFileSync(path.join(BASE, "gho_crash"), "utf8")), crash.stdout + crash.stderr);

  // ── compare_dist_with_site（本機假正式站）─────────────────────────────────
  const site = path.join(BASE, "site"), dist = path.join(BASE, "dist");
  for (const [p, s] of [["index.html", "<html>1</html>"], ["assets/a.js", "a"], ["assets/中文 檔.txt", "z"]]) { write(path.join(site, p), s); write(path.join(dist, p), s); }
  const siteJs = path.join(BASE, "fake_site.mjs");
  fs.writeFileSync(siteJs, `import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = process.argv[2];
http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname.replace(/^\\/ESMO-\\//, ""))); if (fs.existsSync(p) && fs.statSync(p).isFile()) { res.writeHead(200); res.end(fs.readFileSync(p)); } else { res.writeHead(404); res.end(); } }).listen(0, "127.0.0.1", function () { console.log(this.address().port); });
`);
  const srv = spawn(process.execPath, [siteJs, site], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const port = await new Promise((res) => { srv.stdout.once("data", (b) => res(Number(String(b).trim()))); setTimeout(() => res(null), 8000); });
  const cmp = (expect, siteUrl = `http://127.0.0.1:${port}/ESMO-/`) => new Promise((res) => { const c = spawn(process.execPath, [path.join(HERE, "ci", "compare_dist_with_site.mjs"), "--dist", dist, "--site", siteUrl, "--expect-identical", String(expect)], { stdio: ["ignore", "pipe", "pipe"] }); let so = ""; c.stdout.on("data", (b) => { so += b; }); c.on("close", (code) => res({ code, so })); });
  try {
    let c = await cmp(true);
    ck("compare：dist 與正式站相同（含中文檔名）⇒ IDENTICAL、exit 0", c.code === 0 && /COMPARE_DIST RESULT=IDENTICAL/.test(c.so) && /相同 3/.test(c.so), c.so);
    write(path.join(dist, "assets/a.js"), "b");
    c = await cmp(true);
    ck("compare：內容不同 + expect-identical ⇒ DIFFERENT、exit 1（部署前失敗）", c.code === 1 && /DIFFERENT/.test(c.so) && /不同：assets\/a\.js/.test(c.so), c.so);
    c = await cmp(false);
    ck("compare：內容不同但不期待相同（產品有變）⇒ 只回報、exit 0", c.code === 0 && /DIFFERENT/.test(c.so));
    write(path.join(dist, "assets/a.js"), "a"); write(path.join(dist, "assets/new.js"), "n");
    c = await cmp(true);
    ck("compare：dist 多出正式站沒有的檔 + expect ⇒ exit 1", c.code === 1 && /正式站沒有：assets\/new\.js/.test(c.so), c.so);
    fs.rmSync(path.join(dist, "assets/new.js"));
    c = await cmp(true, "http://127.0.0.1:1/ESMO-/");
    ck("compare：抓不到正式站 + expect ⇒ BLOCKED、exit 2（無法證明就不部署）", c.code === 2 && /BLOCKED/.test(c.so), c.so);
    c = await cmp(false, "http://127.0.0.1:1/ESMO-/");
    ck("compare：抓不到正式站但不期待相同 ⇒ exit 0（只回報）", c.code === 0);
    // Final Integration：Actions 裡寫 annotation（沒有權杖也能匿名查證）
    const cmpGh = (expect) => new Promise((res) => { const cc = spawn(process.execPath, [path.join(HERE, "ci", "compare_dist_with_site.mjs"), "--dist", dist, "--site", `http://127.0.0.1:${port}/ESMO-/`, "--expect-identical", String(expect)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GITHUB_ACTIONS: "true" } }); let so = ""; cc.stdout.on("data", (b) => { so += b; }); cc.on("close", (code) => res({ code, so })); });
    c = await cmpGh(true);
    ck("FI：compare 在 Actions 裡印 ::notice title=COMPARE_DIST::（RESULT、expect、identical 數、DIST_HASH）", c.code === 0 && /^::notice title=COMPARE_DIST::RESULT=IDENTICAL expect_identical=true dist=3 identical=3 .*DIST_HASH files=3 aggregateSha256=[0-9a-f]{64}/m.test(c.so), c.so);
    write(path.join(dist, "assets/a.js"), "b");
    c = await cmpGh(true);
    ck("FI：期待相同卻不同 ⇒ ::error title=COMPARE_DIST FAIL::，exit 1", c.code === 1 && /^::error title=COMPARE_DIST FAIL::RESULT=DIFFERENT/m.test(c.so) && /first_different=assets\/a\.js/.test(c.so), c.so);
    write(path.join(dist, "assets/a.js"), "a");
    c = await cmp(true);
    ck("FI：本機（沒有 GITHUB_ACTIONS）不印 annotation", c.code === 0 && !/^::/m.test(c.so));
  } finally { try { srv.kill(); } catch { /* 已結束 */ } }

  // ── workflow：比對步驟與 dry run ────────────────────────────────────────────
  const strip = (y) => y.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const y = strip(fs.readFileSync(path.resolve(HERE, "..", ".github", "workflows", "deploy.yml"), "utf8"));
  const dr = strip(fs.readFileSync(path.resolve(HERE, "..", ".github", "workflows", "ci-dryrun.yml"), "utf8"));
  ck("deploy.yml：decide 輸出 expect_identical_bundle", /expect_identical_bundle:\s*\$\{\{\s*steps\.decide\.outputs\.expect_identical_bundle\s*\}\}/.test(y));
  const iBuild = y.indexOf("run: npm run build"), iCmp = y.indexOf("compare_dist_with_site.mjs"), iUp = y.indexOf("upload-pages-artifact");
  ck("deploy.yml：比對步驟在 build 之後、upload／deploy 之前", iBuild > 0 && iCmp > iBuild && iUp > iCmp);
  ck("deploy.yml：只有 push、decide 判定 expect_identical_bundle=='true'、而且 VITE Variables 都是空的，才要求相同", /EXPECT_IDENTICAL:\s*\$\{\{\s*github\.event_name\s*==\s*'push'\s*&&\s*needs\.decide\.outputs\.expect_identical_bundle\s*==\s*'true'\s*&&\s*vars\.VITE_SUPABASE_URL\s*==\s*''\s*&&\s*vars\.VITE_SUPABASE_ANON_KEY\s*==\s*''\s*&&\s*vars\.VITE_SUPABASE_REDIRECT_URL\s*==\s*''\s*\}\}/.test(y));
  ck("ci-dryrun.yml：只在 ci-dryrun/** 分支觸發（沒有 main、沒有 workflow_dispatch）", /branches:\s*\n\s*-\s*"ci-dryrun\/\*\*"/.test(dr) && !/workflow_dispatch/.test(dr) && !/-\s*main\b/.test(dr));
  ck("ci-dryrun.yml：沒有部署能力（沒有 deploy-pages、upload-pages-artifact、pages: write、id-token: write、environment）", !/deploy-pages|upload-pages-artifact|pages:\s*write|id-token:\s*write|environment:/.test(dr));
  const runs = (txt) => { const s = txt.indexOf("\n  build:"); return [...txt.slice(s).matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim()).filter((c) => !/compare_dist_with_site|require_expectation/.test(c)); };
  // Final Integration：dry run 必須真的要求相同（不能只有比對報告）
  ck("FI：ci-dryrun.yml 在比對之後有「期待必須成立」步驟，條件與比對步驟相同", /compare_dist_with_site[\s\S]*Require identical-bundle expectation[\s\S]*EXPECT_IDENTICAL:\s*\$\{\{\s*needs\.decide\.outputs\.expect_identical_bundle\s*==\s*'true'\s*&&\s*vars\.VITE_SUPABASE_URL\s*==\s*''\s*&&\s*vars\.VITE_SUPABASE_ANON_KEY\s*==\s*''\s*&&\s*vars\.VITE_SUPABASE_REDIRECT_URL\s*==\s*''\s*\}\}\s*\n\s*run:\s*node tools\/ci\/require_expectation\.mjs "\$EXPECT_IDENTICAL"/.test(dr));
  ck("FI：deploy.yml 沒有 require_expectation（正式部署照 decide 的規則，產品變更的發布不應被擋）", !/require_expectation/.test(y));
  const req = (v) => spawnSync(process.execPath, [path.join(HERE, "ci", "require_expectation.mjs"), ...(v === undefined ? [] : [v])], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
  const rq = [req("true"), req("false"), req(""), req("TRUE"), req(undefined)];
  ck("FI：require_expectation 只有 \"true\" 通過；false／空字串／大小寫不同／沒給 ⇒ exit 1＋::error", rq[0].status === 0 && /::notice title=DRYRUN_EXPECTATION::RESULT=PASS/.test(rq[0].stdout) && rq.slice(1).every((x) => x.status === 1 && /::error title=DRYRUN_EXPECTATION FAIL::/.test(x.stdout)), rq.map((x) => x.status).join(","));
  { const out = path.join(BASE, "gho_ann"); const x = spawnSync(process.execPath, [path.join(HERE, "ci", "deploy_decision.mjs"), "--repo", R, "--head", multi, "--event", "push", "--last-deployed", DEPLOYED, "--github-output", out], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
    ck("FI：deploy_decision 在 Actions 裡印 ::notice title=DEPLOY_DECISION::（deploy、expect、lastDeployed）", x.status === 0 && new RegExp(`^::notice title=DEPLOY_DECISION::deploy=false expect_identical_bundle=true head=${multi} lastDeployed=${DEPLOYED}`, "m").test(x.stdout), x.stdout.slice(-300)); }
  ck("ci-dryrun.yml 與 deploy.yml 的 build 指令完全相同（安裝、依賴樹、Supabase 檢查、build、DIST_HASH）", JSON.stringify(runs(y)) === JSON.stringify(runs(dr)) && runs(y).length === 5, JSON.stringify({ y: runs(y), dr: runs(dr) }));
}
