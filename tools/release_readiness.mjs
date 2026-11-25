#!/usr/bin/env node
// ============================================================================
//  tools/release_readiness.mjs — Release Readiness 統一報告（唯讀：不跑 Gate、不寫收據、不改任何檔案）
//
//    node tools/release_readiness.mjs --repo <候選 worktree> --target-sha <40 位 SHA> --require-gate a --require-gate b ... \
//         --out <repo 外的新資料夾> [--checkpoint <gate>=<checkpoint 資料夾> ...] [--expect-flag-false <旗標> ...] [--pages]
//
//  輸出 <out>/readiness.json、readiness.md、readiness.html（單檔、無外部資源、桌機與手機都能看）。
//  每個 gate 的「目前是否有效」一律以 Release Gate assert（重新預檢＋逐張驗收據：SHA、tree、環境、digest、效期）為準；
//  另外標示 EXPIRED／NOT_RUN／INVALID／RUNNING／INTERRUPTED，以及歷史 FAIL 與其後續結果。
//  GO 的條件（缺一不可）：
//    工作目錄 HEAD＝候選且乾淨｜候選包含遠端 main（查 ls-remote，查不到＝NO-GO）｜每個 gate assert PASS｜
//    沒有 RUNNING／INTERRUPTED 的 checkpoint｜預期為 false 的正式旗標都是 false｜模擬版本指紋等於登記值
//  --pages：只打一次匿名 GitHub API（遠端 main 的 workflow 結論）＋讀一次正式站 index.html（入口檔名）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { git, assertReceipts, loadReceipts, remoteHead, DEFAULT_MAX_AGE_HOURS, defaultReceiptsDir } from "./lib/releaseGate.mjs";
import { receiptStatus, categoryOf, CATEGORIES } from "./release_gate_plan.mjs";
import { openCheckpoint } from "./lib/checkpoint.mjs";
import { osProbe } from "./lib/safeProcess.mjs";

export const DEFAULT_FORMAL_FLAGS = ["mobaTacticalDirectorV21", "mobaChallengeV21", "mobaJungleV22", "mobaSafeRouteV23", "mobaTacticExecV24", "mobaDetMathV25", "mobaDetMathV26"];

export async function collect(o) {
  const repo = path.resolve(o.repo); const now = o.now ?? Date.now();
  const target = git(repo, ["rev-parse", "--verify", "--quiet", `${o.target}^{commit}`]).out || null;
  const out = { generatedAt: new Date(now).toISOString(), repo, target, requested: o.target, blockers: [], notes: [] };
  const block = (s) => out.blockers.push(s);
  if (!target) { block(`候選「${o.target}」在這個 repo 找不到`); return finalize(out); }
  out.tree = git(repo, ["rev-parse", `${target}^{tree}`]).out;
  // 工作樹
  const head = git(repo, ["rev-parse", "HEAD"]).out; const dirty = git(repo, ["status", "--porcelain", "--untracked-files=no"]).out;
  out.worktree = { head, headIsTarget: head === target, trackedChanges: dirty ? dirty.split("\n").length : 0, branch: git(repo, ["symbolic-ref", "--short", "-q", "HEAD"]).out || "(detached)" };
  if (!out.worktree.headIsTarget) block(`工作目錄 HEAD ${head.slice(0, 12)} 不是候選 ${target.slice(0, 12)}`);
  if (out.worktree.trackedChanges) block(`工作目錄有 ${out.worktree.trackedChanges} 個未提交的追蹤檔變更`);
  // 遠端 main
  const rm = o.remoteMain !== undefined ? { ok: !!o.remoteMain, sha: o.remoteMain, error: "（測試注入）" } : remoteHead(repo, o.remote || "origin", o.branch || "main");
  out.remoteMain = rm.ok ? { sha: rm.sha } : { sha: null, error: rm.error };
  if (!rm.ok) block(`查不到遠端 main：${rm.error}`);
  else {
    const known = git(repo, ["cat-file", "-e", `${rm.sha}^{commit}`]).status === 0;
    const anc = known && git(repo, ["merge-base", "--is-ancestor", rm.sha, target]).status === 0;
    const cnt = known ? git(repo, ["rev-list", "--left-right", "--count", `${rm.sha}...${target}`]).out.split(/\s+/).map(Number) : [null, null];
    Object.assign(out.remoteMain, { known, candidateContainsMain: anc, behind: cnt[0], ahead: cnt[1] });
    if (!known) block(`本機沒有遠端 main ${rm.sha.slice(0, 12)}（先 git fetch）`);
    else if (!anc) block(`候選不包含遠端 main ${rm.sha.slice(0, 12)}（落後 ${cnt[0]} 個 commit，要先 rebase／merge）`);
  }
  // Gate：assert 為準＋效期／歷史
  const commonDir = path.resolve(repo, git(repo, ["rev-parse", "--git-common-dir"]).out);
  const receiptsDir = o.receiptsDir ? path.resolve(o.receiptsDir) : defaultReceiptsDir(commonDir);
  const gates = o.gates || [];
  const asr = assertReceipts({ repo, target, gates, receiptsDir, maxAgeHours: DEFAULT_MAX_AGE_HOURS, now });
  const st = receiptStatus({ receiptsDir, targetSha: target, gates, now, currentBrowser: o.currentBrowser ?? null });
  const cps = Object.fromEntries((o.checkpoints || []).map((x) => { const i = x.indexOf("="); return [x.slice(0, i), path.resolve(x.slice(i + 1))]; }));
  out.gates = gates.map((g) => {
    const a = asr.checks.find((c) => c.id === `gate:${g}`); const s = st.rows.find((r) => r.gate === g);
    let state = a ? a.status : "BLOCKED"; // assert 沒跑到（預檢沒過）就不可能是 PASS
    if (state !== "PASS" && ["EXPIRED", "NOT_RUN", "INVALID", "FAIL"].includes(s?.state)) state = s.state;
    const row = { gate: g, state, category: s?.category ?? categoryOf(g), categoryLabel: CATEGORIES[s?.category ?? categoryOf(g)].label, via: s?.via ?? null, file: s?.file ?? null, finishedAt: s?.finishedAt ?? null, expiresAt: s?.expiresAt ?? null, remainingHours: s?.remainingHours ?? null, detail: a?.detail ?? "預檢未通過，沒有驗收據", history: [] , checkpoint: null };
    // 歷史：同 SHA 同 gate 的所有收據（含 FAIL），舊到新
    row.history = loadReceipts(receiptsDir, { targetSha: target, gate: g }).map((f) => ({ file: path.basename(f.file), status: f.receipt.status, finishedAt: f.receipt.finishedAt })).reverse();
    // checkpoint：進行中／中斷
    if (cps[g]) {
      try {
        const cp = openCheckpoint(cps[g]); const cs = cp.status(); const j = cp.journal();
        const running = cs.openSession && osProbe.alive(cs.openSession.pid);
        row.checkpoint = { dir: cps[g], candidateSha: cp.manifest.candidateSha, done: cs.done.size, total: cp.manifest.cases.length, complete: cs.complete, interrupts: cs.interrupts.map((e) => ({ at: e.at, reason: e.reason })), resumes: j.events.filter((e) => e.event === "resume").length, journalOk: !j.broken };
        if (cp.manifest.candidateSha !== target) row.checkpoint.note = "checkpoint 屬於別的候選 SHA";
        else if (!cs.complete) { row.state = running ? "RUNNING" : "INTERRUPTED"; }
      } catch (e) { row.checkpoint = { dir: cps[g], error: String(e.message || e) }; }
    }
    if (row.state !== "PASS") block(`gate「${g}」是 ${row.state}${row.detail && row.state !== "NOT_RUN" ? `：${String(row.detail).slice(0, 160)}` : ""}`);
    return row;
  });
  out.window = { endsAt: st.windowEndsAt, decidedBy: st.windowGate, policyHours: DEFAULT_MAX_AGE_HOURS };
  // 旗標
  const ffText = git(repo, ["show", `${target}:src/featureFlags.js`]);
  const expectFalse = o.expectFlagFalse ?? DEFAULT_FORMAL_FLAGS;
  if (!ffText.ok) { out.flags = { error: "讀不到 src/featureFlags.js" }; if (expectFalse.length) block("讀不到正式旗標檔，無法確認旗標"); }
  else {
    const all = {}; for (const m of ffText.out.matchAll(/^\s*(\w+):\s*(true|false)\s*,/gm)) if (!(m[1] in all)) all[m[1]] = m[2] === "true";
    out.flags = { values: all, expectFalse: Object.fromEntries(expectFalse.map((f) => [f, f in all ? all[f] : null])) };
    for (const f of expectFalse) { if (!(f in all)) block(`正式旗標 ${f} 在旗標檔裡找不到`); else if (all[f] !== false) block(`正式旗標 ${f} 是 ${all[f]}（預期 false）`); }
  }
  // 版本指紋
  try {
    const sv = git(repo, ["cat-file", "-e", `${target}:src/platform/contracts/simulationVersion.js`]);
    if (sv.status !== 0) out.fingerprint = { state: "N/A", note: "這個 repo 沒有 simulationVersion.js" };
    else {
      const { commitFingerprint } = await import(pathToFileURL(path.join(repo, "tools", "lib", "mobaVersionedScope.mjs")).href);
      const fp = await commitFingerprint(repo, target);
      out.fingerprint = { state: fp.fingerprint === fp.registered ? "MATCH" : "MISMATCH", version: fp.version, fingerprint: fp.fingerprint, registered: fp.registered, files: fp.files };
      if (fp.fingerprint !== fp.registered) block(`模擬版本 ${fp.version} 指紋 ${fp.fingerprint} ≠ 登記值 ${fp.registered}`);
    }
  } catch (e) { out.fingerprint = { state: "UNKNOWN", error: String(e.message || e).slice(0, 200) }; block(`無法計算版本指紋：${String(e.message || e).slice(0, 120)}`); }
  // Build（來自收據的 bundle 雜湊）
  const withBundle = (out.gates || []).map((g) => g.file && path.join(receiptsDir, g.file)).filter(Boolean).map((f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }).filter((r) => r?.bundle);
  out.build = withBundle.length ? { gate: withBundle[0].gate, files: withBundle[0].bundle.files, aggregateSha256: withBundle[0].bundle.aggregateSha256, buildEnv: Object.keys(withBundle[0].bundle.buildEnv || {}) } : { note: "沒有任何 gate 收據記錄 bundle 雜湊（production gate 加 --record-bundle 才有）" };
  // Pages（選用）
  if (o.pages) out.pages = await pagesStatus(out.remoteMain?.sha);
  return finalize(out);
}
async function pagesStatus(mainSha) {
  const res = { source: "匿名 GitHub API（1 次）＋正式站 index.html（1 次）" };
  try { const r = await fetch(`https://api.github.com/repos/RayHuang0323/ESMO-/actions/runs?head_sha=${mainSha}&per_page=1`, { headers: { accept: "application/vnd.github+json" } }); const j = await r.json(); const run = j.workflow_runs?.[0]; res.workflow = run ? { id: run.id, status: run.status, conclusion: run.conclusion, attempt: run.run_attempt, headSha: run.head_sha } : { note: "這個 SHA 沒有 workflow run（可能是被判定不需部署，或還沒觸發）" }; } catch (e) { res.workflow = { error: String(e.message || e) }; }
  try { const h = await (await fetch(`https://rayhuang0323.github.io/ESMO-/?t=${Date.now()}`, { cache: "no-store" })).text(); res.entry = (h.match(/assets\/index-[\w-]+\.js/) || [null])[0]; } catch (e) { res.entry = null; res.entryError = String(e.message || e); }
  return res;
}
function finalize(out) { out.decision = out.blockers.length ? "NO-GO" : "GO"; return out; }

// ── 輸出 ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function toMarkdown(r) {
  const L = [`# Release Readiness：${r.decision}`, "", `- 候選：\`${r.target}\``, `- 遠端 main：\`${r.remoteMain?.sha ?? "未知"}\`${r.remoteMain?.candidateContainsMain ? `（候選包含它，領先 ${r.remoteMain.ahead}）` : ""}`, `- 工作目錄：HEAD ${r.worktree?.headIsTarget ? "＝候選" : "≠ 候選"}，未提交追蹤檔 ${r.worktree?.trackedChanges ?? "?"}`, `- 產生時間：${r.generatedAt}`, "", "## Gate", "", "| Gate | 狀態 | 分類 | 來源 | 到期 | 剩餘 | 歷史 |", "|---|---|---|---|---|---|---|"];
  for (const g of r.gates || []) L.push(`| ${g.gate} | **${g.state}** | ${g.categoryLabel} | ${g.via ?? "—"} | ${g.expiresAt ?? "—"} | ${g.remainingHours ?? "—"}h | ${g.history.map((h) => h.status).join("→") || "—"}${g.checkpoint ? `；checkpoint ${g.checkpoint.done}/${g.checkpoint.total}，中斷 ${g.checkpoint.interrupts?.length ?? 0}` : ""} |`);
  L.push("", `發布窗口：${r.window?.endsAt ?? "—"}（${r.window?.decidedBy ?? "—"}；正式效期 ${r.window?.policyHours}h）`, "", "## 版本與旗標", "", `- 指紋：${r.fingerprint?.state} ${r.fingerprint?.version ?? ""} ${r.fingerprint?.fingerprint ?? ""}`);
  for (const [f, v] of Object.entries(r.flags?.expectFalse || {})) L.push(`- ${f}：${v}`);
  L.push("", `## Build`, "", r.build?.aggregateSha256 ? `- ${r.build.gate}：${r.build.files} 檔，\`${r.build.aggregateSha256}\`` : `- ${r.build?.note}`);
  if (r.pages) L.push("", "## GitHub Pages", "", `- workflow：${JSON.stringify(r.pages.workflow)}`, `- 正式站入口：${r.pages.entry ?? "未知"}`);
  L.push("", "## 阻擋項目", "", ...(r.blockers.length ? r.blockers.map((b) => `- ${b}`) : ["- 無"]));
  return L.join("\n") + "\n";
}
export function toHtml(r) {
  const chip = (s) => `<span class="chip s-${esc(String(s).toLowerCase().replace(/[^a-z_-]/g, ""))}">${esc(s)}</span>`;
  const rows = (r.gates || []).map((g) => `<tr><td data-l="Gate"><b>${esc(g.gate)}</b></td><td data-l="狀態">${chip(g.state)}</td><td data-l="分類">${esc(g.categoryLabel)}</td><td data-l="來源">${esc(g.via ?? "—")}</td><td data-l="到期">${esc(g.expiresAt ?? "—")}</td><td data-l="剩餘">${g.remainingHours ?? "—"} h</td><td data-l="歷史">${g.history.map((h) => chip(h.status)).join(" ") || "—"}${g.checkpoint ? `<div class="sub">checkpoint ${g.checkpoint.done}/${g.checkpoint.total}・中斷 ${g.checkpoint.interrupts?.length ?? 0}・續跑 ${g.checkpoint.resumes ?? 0}</div>` : ""}</td></tr>`).join("");
  const flags = Object.entries(r.flags?.expectFalse || {}).map(([f, v]) => `<li>${esc(f)}：${chip(v === false ? "false" : String(v))}</li>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Release Readiness ${esc(r.decision)} · ${esc(String(r.target).slice(0, 12))}</title>
<style>
:root{--bg:#f7f7f5;--fg:#1d1d1b;--mut:#6b6b66;--card:#fff;--line:#e3e2dd;--ok:#1f7a4d;--bad:#b3261e;--warn:#9a6700;--info:#3456a3}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--mut:#a3a29c;--card:#201f1d;--line:#34332f;--ok:#5cc28e;--bad:#ff8a80;--warn:#e8b14a;--info:#8fa8ff}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,"Noto Sans TC","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1100px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}
.hero{display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.big{font-size:28px;font-weight:700;padding:6px 14px;border-radius:10px;color:#fff;background:${r.decision === "GO" ? "var(--ok)" : "var(--bad)"}}
.meta{color:var(--mut);font-size:13px;word-break:break-all}code{font:12.5px ui-monospace,Consolas,monospace}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13.5px}th{color:var(--mut);font-weight:600}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid currentColor}
.s-pass,.s-false{color:var(--ok)}.s-fail,.s-invalid,.s-true{color:var(--bad)}.s-blocked,.s-expired,.s-interrupted,.s-not_run{color:var(--warn)}.s-running{color:var(--info)}
.sub{color:var(--mut);font-size:12px;margin-top:2px}ul{margin:6px 0;padding-left:20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
@media (max-width:640px){table,thead,tbody,tr,td{display:block}thead{display:none}tr{border-bottom:1px solid var(--line);padding:6px 0}td{border:0;padding:3px 12px}td::before{content:attr(data-l);display:inline-block;min-width:56px;color:var(--mut);font-size:12px}}
</style></head><body><main>
<div class="hero"><div class="big">${esc(r.decision)}</div><div><h1>Release Readiness</h1><div class="meta">候選 <code>${esc(r.target)}</code><br>遠端 main <code>${esc(r.remoteMain?.sha ?? "未知")}</code>${r.remoteMain?.candidateContainsMain ? `（候選包含它，領先 ${r.remoteMain.ahead}）` : ""}<br>工作目錄 HEAD ${r.worktree?.headIsTarget ? "＝候選" : "≠ 候選"}・未提交追蹤檔 ${r.worktree?.trackedChanges ?? "?"}・產生於 ${esc(r.generatedAt)}</div></div></div>
<h2>阻擋項目</h2><div class="card">${r.blockers.length ? `<ul>${r.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "無"}</div>
<h2>Gate（以 assert 為準）</h2><table><thead><tr><th>Gate</th><th>狀態</th><th>分類</th><th>來源</th><th>到期</th><th>剩餘</th><th>歷史／Checkpoint</th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">發布窗口到 ${esc(r.window?.endsAt ?? "—")}（由 ${esc(r.window?.decidedBy ?? "—")} 決定；正式效期 ${r.window?.policyHours} 小時）</p>
<h2>版本與旗標</h2><div class="card">指紋 ${chip(r.fingerprint?.state ?? "UNKNOWN")} <code>${esc(r.fingerprint?.version ?? "")} ${esc(r.fingerprint?.fingerprint ?? "")}</code><ul>${flags}</ul></div>
<h2>Build</h2><div class="card">${r.build?.aggregateSha256 ? `${esc(r.build.gate)}：${r.build.files} 檔 <code>${esc(r.build.aggregateSha256)}</code>` : esc(r.build?.note)}</div>
${r.pages ? `<h2>GitHub Pages</h2><div class="card">workflow <code>${esc(JSON.stringify(r.pages.workflow))}</code><br>正式站入口 <code>${esc(r.pages.entry ?? "未知")}</code></div>` : ""}
</main></body></html>`;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2); const a = { gates: [], checkpoints: [], flags: [] };
  for (let i = 0; i < argv.length; i++) { const t = argv[i]; if (!t.startsWith("--")) continue; const k = t.slice(2); if (k === "pages" || k === "json") { a[k] = true; continue; } const v = argv[++i]; if (k === "require-gate") a.gates.push(v); else if (k === "checkpoint") a.checkpoints.push(v); else if (k === "expect-flag-false") a.flags.push(v); else a[k] = v; }
  if (!a.repo || !a["target-sha"] || !a.out || !a.gates.length) { console.error("用法：node tools/release_readiness.mjs --repo <worktree> --target-sha <sha> --require-gate <名稱> ... --out <新資料夾>"); process.exit(64); }
  const outDir = path.resolve(a.out);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) { console.error(`輸出資料夾已有內容，不覆寫：${outDir}`); process.exit(64); }
  const { chromeVersion } = await import("./lib/releaseGate.mjs");
  const r = await collect({ repo: a.repo, target: a["target-sha"], gates: a.gates, checkpoints: a.checkpoints, expectFlagFalse: a.flags.length ? a.flags : undefined, pages: !!a.pages, receiptsDir: a["receipts-dir"], currentBrowser: chromeVersion() });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "readiness.json"), JSON.stringify(r, null, 1));
  fs.writeFileSync(path.join(outDir, "readiness.md"), toMarkdown(r));
  fs.writeFileSync(path.join(outDir, "readiness.html"), toHtml(r));
  console.log(`Release Readiness：${r.decision}（阻擋 ${r.blockers.length} 項）`);
  for (const b of r.blockers.slice(0, 12)) console.log(`  · ${b}`);
  console.log(`報告：${path.join(outDir, "readiness.html")}`);
  process.exit(0);
}
