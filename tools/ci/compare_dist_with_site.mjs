#!/usr/bin/env node
// ============================================================================
//  tools/ci/compare_dist_with_site.mjs — 部署「之前」把剛 build 的 dist 與目前正式站逐檔比對（TD-65，2026-11-26 S1.1）
//
//    node tools/ci/compare_dist_with_site.mjs --dist dist --site <正式站根網址，例如 https://rayhuang0323.github.io/ESMO-/>
//         [--expect-identical true|false] [--concurrency 8] [--json] [--out <報告檔>]
//
//  為什麼：過去要等新版上線後才逐檔下載比對（581/581）。產品輸入沒變的推送（只有工具、文件）若 bundle 意外改變，
//  發現時已經部署出去了。這支在 upload／deploy 之前就比對：dist 每個檔案 ⇔ 正式站同路徑的檔案（sha256）。
//
//  結果：identical（相同）、different（內容不同）、missingOnSite（正式站沒有，HTTP 404）、errors（網路／其他 HTTP 錯誤）。
//    · --expect-identical true（deploy_decision 判定「自最後成功部署以來沒有產品／建置輸入或 CI 變更」）：
//        有任何 different／missingOnSite ⇒ exit 1（部署前失敗：產品沒變卻 build 出不同的 bundle）。
//        網路錯誤（抓不到正式站）⇒ exit 2（無法證明；workflow 端決定是否擋）。
//    · 其他（預設）：只回報，exit 0。
//  正式站可能比 dist 多出舊檔：GitHub Pages 每次部署是整份替換，這支只比 dist 有的檔案（不列舉正式站）。
//  只用 Node 內建模組；唯讀，不寫 dist、不呼叫任何部署 API。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
export function listFiles(dir) {
  const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.isFile()) out.push(p); } };
  walk(dir); return out.map((p) => path.relative(dir, p).split(path.sep).join("/")).sort();
}
/** 逐檔比對。fetchImpl 可注入（測試）。回傳 { files, identical, different[], missingOnSite[], errors[], status } */
export async function compareDistWithSite({ dist, site, concurrency = 8, fetchImpl = fetch, retries = 2 }) {
  const base = site.endsWith("/") ? site : site + "/";
  const files = listFiles(dist);
  const res = { site: base, files: files.length, identical: 0, different: [], missingOnSite: [], errors: [] };
  let i = 0;
  const one = async (rel) => {
    const local = sha(fs.readFileSync(path.join(dist, rel)));
    const url = base + rel.split("/").map(encodeURIComponent).join("/");
    for (let a = 0; a <= retries; a++) {
      try {
        const r = await fetchImpl(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
        if (r.status === 404) { res.missingOnSite.push(rel); return; }
        if (!r.ok) { if (a === retries) res.errors.push(`${rel}：HTTP ${r.status}`); continue; }
        const remote = sha(Buffer.from(await r.arrayBuffer()));
        if (remote === local) res.identical++; else res.different.push(rel);
        return;
      } catch (e) { if (a === retries) res.errors.push(`${rel}：${String(e.message || e).slice(0, 80)}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => { while (i < files.length) { const rel = files[i++]; await one(rel); } }));
  res.status = res.errors.length ? "BLOCKED" : res.different.length || res.missingOnSite.length ? "DIFFERENT" : "IDENTICAL";
  return res;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2); const a = {};
  for (let k = 0; k < argv.length; k++) { const t = argv[k]; if (!t.startsWith("--")) continue; const key = t.slice(2); if (key === "json") { a.json = true; continue; } a[key] = argv[++k]; }
  //  ⚠ 不用 process.exit()：Windows 上 stdout 接到 pipe 時是非同步寫入，exit 會吃掉最後幾行（RESULT 行）。一律設 exitCode 後自然結束。
  const finish = (code) => { process.exitCode = code; };
  if (!a.dist || !a.site) { console.error("用法：node tools/ci/compare_dist_with_site.mjs --dist dist --site <網址> [--expect-identical true|false]"); finish(64); }
  else await main();
}
async function main() {
  const argv = process.argv.slice(2); const a = {};
  for (let k = 0; k < argv.length; k++) { const t = argv[k]; if (!t.startsWith("--")) continue; const key = t.slice(2); if (key === "json") { a.json = true; continue; } a[key] = argv[++k]; }
  const finish = (code) => { process.exitCode = code; };
  const expect = String(a["expect-identical"] ?? "false") === "true";
  let r;
  try { r = await compareDistWithSite({ dist: path.resolve(a.dist), site: a.site, concurrency: Number(a.concurrency ?? 8) }); }
  catch (e) { console.log(`COMPARE_DIST RESULT=BLOCKED（${e.message}）`); return finish(expect ? 2 : 0); }
  if (a.out) fs.writeFileSync(a.out, JSON.stringify(r, null, 1));
  if (a.json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`dist ${r.files} 檔 vs ${r.site}：相同 ${r.identical}、不同 ${r.different.length}、正式站沒有 ${r.missingOnSite.length}、抓取失敗 ${r.errors.length}`);
    for (const x of [...r.different.slice(0, 15).map((p) => `不同：${p}`), ...r.missingOnSite.slice(0, 15).map((p) => `正式站沒有：${p}`), ...r.errors.slice(0, 10)]) console.log("  " + x);
    console.log(`expect_identical=${expect}`);
    console.log(`COMPARE_DIST RESULT=${r.status}`);
  }
  if (!expect) return finish(0);
  return finish(r.status === "IDENTICAL" ? 0 : r.status === "BLOCKED" ? 2 : 1);
}
