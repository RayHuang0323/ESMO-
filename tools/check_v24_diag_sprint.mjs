#!/usr/bin/env node
// ============================================================================
//  tools/check_v24_diag_sprint.mjs — v24 診斷 Sprint 的守門（2026-11-15；約 1～2 分鐘，單線，不 fan-out 到長 verifier）
//
//   ① 影子＋仲裁觀測器被動：shadow_tactic_exec_v24_diag.mjs --selfcheck（有／無掛的整場雜湊相同，而且等於 Sprint 0 的 c314a2613fccd44a）
//   ② 診斷版影子的評估欄位與 Sprint 0.5 登記的影子工具逐值相同（Seed 98401，路徑 inv；只排除診斷版新增的欄位）
//   ③ taskCommitPush 覆寫機制中性：plain＝off（值不變的覆寫）＝off＋觀測器；on 與 plain 不同（覆寫真的生效）
//   ④ tools/lib/shadowDecideV24.mjs（partyOrder="role"）重算 Sprint 0.5 驗證資料，與登記的 validation_analysis.json 逐值相同
//      （原始批次在 repo 外；不存在 ⇒ SKIP，不算進分母，也不算通過）
//   ⑤ 決策規則與邊無關：decide() 系列的原始碼不讀 side／targetId／pos／blue／red；
//      而且把紀錄的 side 與 targetId 紅藍對調之後，200 場 × 四種傾向的決策逐筆相同（④ 的資料存在時才跑行為部分）
//   ⑥ v23 凍結完好（tools/check_v23_freeze.mjs）而且 src 沒有未提交的改動
//  用法：node tools/check_v24_diag_sprint.mjs
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide, loadRows, summ } from "./lib/shadowDecideV24.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "..");
const VAL_DIR = "C:/Users/ifikn/esmo-measure/v24-sprint05-val-98401/batches";
const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: ok === null ? null : !!ok }); console.log(`${ok === null ? "⏭️ " : ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const t0 = Date.now();
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v24diag-"));

// ①
{
  const r = node(["tools/owner_preview/shadow_tactic_exec_v24_diag.mjs", "--selfcheck"]);
  let j = null; try { j = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { /* 下面判紅 */ }
  ck("① 影子＋仲裁觀測器被動（整場雜湊相同且＝Sprint 0 值）", r.status === 0 && j?.ok && j?.matchesSprint0, J(j ?? r.stderr.slice(0, 300)));
}
// ②
{
  const a = path.join(tmp, "s05.json"), b = path.join(tmp, "diag.json");
  const ra = node(["tools/owner_preview/shadow_tactic_exec_v24_s05.mjs", "--path=inv", "--seeds=98401", `--out=${a}`]);
  const rb = node(["tools/owner_preview/shadow_tactic_exec_v24_diag.mjs", "--path=inv", "--seeds=98401", `--out=${b}`]);
  let ok = false, detail = `exit ${ra.status}/${rb.status}`;
  if (ra.status === 0 && rb.status === 0) {
    const A = JSON.parse(fs.readFileSync(a, "utf8")).rows[0], B = JSON.parse(fs.readFileSync(b, "utf8")).rows[0];
    const NEW = ["arb", "objGo", "ownCamps", "dragon", "baron"];
    const clean = (ev) => { const o = { ...ev }; for (const k of NEW) delete o[k]; return o; };
    let diff = 0, first = null;
    if (A.evals.length !== B.evals.length) diff = -1;
    else A.evals.forEach((ev, i) => { if (J(ev) !== J(clean(B.evals[i]))) { diff++; first ??= i; } });
    const sameIE = J(A.invasionStarts) === J(B.invasionStarts) && J(A.invasionEnds) === J(B.invasionEnds) && A.winner === B.winner && A.duration === B.duration;
    const newFields = B.evals.filter((ev) => !ev.noTarget).every((ev) => ev.arb && "objGo" in ev);
    ok = diff === 0 && sameIE && newFields && Array.isArray(B.jTimeline?.blue) && B.arb?.errors === 0;
    detail = `evals=${A.evals.length} diff=${diff}${first != null ? ` first=${first}` : ""} invasionsSame=${sameIE} newFields=${newFields} arbErrors=${B.arb?.errors}`;
  }
  ck("② 診斷版的評估欄位與 Sprint 0.5 影子逐值相同（Seed 98401 inv）", ok, detail);
}
// ③
{
  const r = node(["tools/owner_preview/diag_task_commit_push_v24.mjs", "--selfcheck", "--seed=93001", "--path=career"]);
  let j = null; try { j = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { /* 下面判紅 */ }
  ck("③ taskCommitPush 覆寫機制中性（plain＝off＝off＋觀測器；on 不同）", r.status === 0 && j?.ok, J(j ?? r.stderr.slice(0, 300)));
}
// ④ ⑤
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v24_sprint05/propensity_config.json"), "utf8"));
let rows = null;
if (fs.existsSync(VAL_DIR)) rows = await loadRows(VAL_DIR);
if (!rows) ck("④ 共用決策重算 Sprint 0.5 驗證結果（逐值）", null, `SKIP：${VAL_DIR} 不存在`);
else {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v24_sprint05/validation_analysis.json"), "utf8")).analysis;
  const bad = [];
  for (const k of cfg.order) {
    const P = cfg.propensities[k];
    const per = rows.map((r) => r.evals.reduce((s, ev) => s + (decide(ev, P, "known").d === "go" ? 1 : 0), 0));
    const got = summ(per), want = reg.metrics[k].overall.goEvalsPerMatch;
    if (J(got) !== J(want)) bad.push({ k, got, want });
    const inv = rows.filter((r) => r.group === "inv");
    const rate = (r, S) => { const e = r.evals.filter((ev) => ev.side === S); return e.length ? e.filter((ev) => decide(ev, P, "known").d === "go").length / e.length : null; };
    const sym = summ(inv.map((r) => { const b = rate(r, "blue"), d = rate(r, "red"); return b == null || d == null ? null : b - d; }));
    if (J(sym) !== J(reg.symmetry[k])) bad.push({ k, sym, want: reg.symmetry[k] });
  }
  ck("④ 共用決策重算 Sprint 0.5 驗證結果（每場出發評估數、紅藍對稱，四種傾向逐值）", bad.length === 0, bad.length ? J(bad).slice(0, 400) : `matches=${rows.length}`);
}
{
  const src = fs.readFileSync(path.join(HERE, "lib", "shadowDecideV24.mjs"), "utf8");
  const bodyOf = (name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return ""; let d = 0, j = src.indexOf("{", i); const s = j; for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(s, j + 1); };
  const strip = (s) => s.replace(/\/\/.*$/gm, "").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  const bodies = ["ejPrior", "membersOf", "threatCount", "decide"].map((n) => strip(bodyOf(n))).join("\n");
  const hits = [...bodies.matchAll(/\b(side|targetId|pos|blue|red)\b/g)].map((m) => m[1]);
  let mirrorBad = 0, mirrorN = 0;
  if (rows) {
    const flip = (ev) => ({ ...ev, side: ev.side === "blue" ? "red" : "blue", targetId: ev.targetId ? ev.targetId.replace(/_(blue|red)_/, (_, s) => (s === "blue" ? "_red_" : "_blue_")) : ev.targetId });
    for (const k of cfg.order) for (const r of rows) for (const ev of r.evals) { mirrorN++; if (J(decide(ev, cfg.propensities[k])) !== J(decide(flip(ev), cfg.propensities[k]))) mirrorBad++; }
  }
  ck("⑤ 決策規則與邊無關（原始碼不讀邊與座標；紅藍對調後決策逐筆相同）", hits.length === 0 && bodies.length > 200 && mirrorBad === 0,
    `identifierHits=${J(hits)} mirrorChecked=${mirrorN}${rows ? "" : "（行為部分 SKIP：資料不存在）"} mirrorDiff=${mirrorBad}`);
}
// ⑥
{
  const r = node(["tools/check_v23_freeze.mjs"]);
  let srcClean = false; try { execFileSync("git", ["diff", "--quiet", "HEAD", "--", "src"], { cwd: ROOT, stdio: "pipe" }); srcClean = true; } catch { /* 紅 */ }
  const last = (r.stdout || "").trim().split("\n").pop();
  ck("⑥ v23 凍結完好而且 src 沒有未提交的改動", r.status === 0 && srcClean, `check_v23_freeze: ${last}  srcClean=${srcClean}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
const counted = results.filter((r) => r.ok !== null), pass = counted.filter((r) => r.ok).length, skip = results.length - counted.length;
console.log(`\ncheck_v24_diag_sprint：${pass}/${counted.length} ${pass === counted.length ? "PASS" : "FAIL"}${skip ? `（SKIP ${skip}，不在分母）` : ""}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(pass === counted.length ? 0 : 1);
