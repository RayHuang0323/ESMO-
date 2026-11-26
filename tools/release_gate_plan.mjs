#!/usr/bin/env node
// ============================================================================
//  tools/release_gate_plan.mjs — Release Gate 收據效期：現況、預警、執行順序規劃（唯讀，不改任何收據或政策）
//
//    node tools/release_gate_plan.mjs status --repo <worktree> --target-sha <sha> --require-gate a --require-gate b [--warn-hours 6] [--json]
//    node tools/release_gate_plan.mjs plan   --repo <worktree> --require-gate a ... [--est a=45 --est b=120]（分鐘） [--json]
//
//  status：每個 gate 最新一張收據（直接收據優先，其次 docs-carry）、分類、完成時間、到期時間、剩餘時數、
//          收據記錄的瀏覽器版本是否與現在相同；整體「發布窗口」＝最早到期的那張。
//  plan  ：估計每個 gate 的耗時（過去收據 durationMs 的中位數，或 --est），算出建議順序。
//          依序執行時，所有收據的共同有效窗口取決於「第一個完成的」收據 ⇒ 最長的 gate 排第一，
//          跨度＝總時長 − 第一個 gate 時長，最小。總時長已超過效期就直接說做不到（要分批或重跑）。
//
//  ⚠ 效期（TD-64，2026-11-26 S1.1）：一律由 tools/lib/gatePolicy.mjs 的固定分類表決定（收據自己寫的 category 不採信）。
//    status 顯示的到期時間：沒有提供目前環境時，72 小時類一律以 24 小時估（保守）；正式判定以 assert 為準。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { git, loadReceipts, digestOf, defaultReceiptsDir, chromeVersion, preflight } from "./lib/releaseGate.mjs";
import { CARRY_GATE } from "./lib/docsCarry.mjs";
import { CLASSES, classifyGate, eligibility72, GATE_POLICY_VERSION, POLICY_TABLE_DIGEST, LEGACY_HOURS } from "./lib/gatePolicy.mjs";

/** 分類表（唯讀轉出；來源是 tools/lib/gatePolicy.mjs）。 */
export const CATEGORIES = CLASSES;
/** gate 的分類：只看 gate 名稱＋收據裡的實際指令。收據自帶的 category 一律不採信（不能自己指定分類拿更長效期）。 */
export function categoryOf(gate, receipt) { return classifyGate(gate, (receipt?.commands || []).map((c) => c.cmd)).class; }
/** 一張直接收據的效期時數與等級（env＝目前環境；沒有就保守按 24h）。 */
export function hoursOf(gate, rc, env = null) {
  const cls = classifyGate(gate, (rc.commands || []).map((c) => c.cmd));
  const p = rc.policy;
  if (!p) return { cls, hours: LEGACY_HOURS, tier: "legacy-24h" };
  if (p.version !== GATE_POLICY_VERSION || p.tableDigest !== POLICY_TABLE_DIGEST || p.class !== cls.class) return { cls, hours: LEGACY_HOURS, tier: "legacy-24h", policyMismatch: p.class !== cls.class };
  if (cls.hours > LEGACY_HOURS) return env && eligibility72(cls, rc, env).ok ? { cls, hours: cls.hours, tier: `${cls.hours}h` } : { cls, hours: LEGACY_HOURS, tier: env ? "24h（環境不一致，不給 72h）" : "24h（未提供環境：保守估計）" };
  return { cls, hours: Math.min(cls.hours, LEGACY_HOURS), tier: `${Math.min(cls.hours, LEGACY_HOURS)}h` };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** 每個 gate 的最新收據與效期狀態。now 可注入（測試用；不影響任何收據）。currentBrowser：目前 Chrome 版本字串。 */
export function receiptStatus({ receiptsDir, targetSha, gates, maxAgeHours = null, now = Date.now(), currentBrowser = null, env = null }) {
  const rows = []; const cap = maxAgeHours === null || maxAgeHours === undefined ? Infinity : Number(maxAgeHours);
  for (const g of gates) {
    let found = loadReceipts(receiptsDir, { targetSha, gate: g }); let via = "direct";
    if (!found.length) { const c = loadReceipts(receiptsDir, { targetSha, gate: CARRY_GATE }).filter((x) => (x.receipt.carriedGates || []).includes(g)); if (c.length) { found = c; via = "docs-carry"; } }
    if (!found.length) { rows.push({ gate: g, state: "NOT_RUN", category: categoryOf(g) }); continue; }
    const rc = found[0].receipt; const fin = Date.parse(rc.finishedAt);
    const intact = rc.digest === digestOf(rc);
    const h = via === "docs-carry" ? { cls: classifyGate(g, []), hours: null, tier: "沿用（不延長來源效期）" } : hoursOf(g, rc, env);
    const expiresAt = via === "docs-carry" ? Date.parse(rc.expiresAt) : fin + Math.min(h.hours, cap) * 3600000;
    const remainingHours = (expiresAt - now) / 3600000;
    const cat = via === "docs-carry" ? categoryOf(g) : h.cls.class;
    const browserThen = rc.env?.browser?.chrome ?? null;
    let state = !intact ? "INVALID" : h.policyMismatch ? "INVALID" : rc.status !== "PASS" ? rc.status : remainingHours <= 0 ? "EXPIRED" : "PASS";
    rows.push({ gate: g, state, via, category: cat, tier: h.tier, file: path.basename(found[0].file), finishedAt: rc.finishedAt, expiresAt: new Date(expiresAt).toISOString(), remainingHours: +remainingHours.toFixed(2), durationMin: rc.durationMs ? +(rc.durationMs / 60000).toFixed(1) : null, browserThen, browserChanged: !!(browserThen && currentBrowser && browserThen !== currentBrowser), olderReceipts: found.length - 1 });
  }
  const live = rows.filter((r) => r.state === "PASS");
  const windowEnds = live.length ? live.reduce((m, r) => (Date.parse(r.expiresAt) < Date.parse(m.expiresAt) ? r : m)) : null;
  return { rows, windowEndsAt: windowEnds?.expiresAt ?? null, windowGate: windowEnds?.gate ?? null, allPass: rows.length > 0 && rows.every((r) => r.state === "PASS") };
}

/** 依序執行的最佳順序：最長的排第一。回傳順序、跨度、完成後剩餘窗口。 */
export function planOrder(est, { maxAgeHours = LEGACY_HOURS, order = null } = {}) {
  const total = Object.values(est).reduce((a, b) => a + b, 0);
  const evalOrder = (ord) => { const first = est[ord[0]] ?? 0; const spanMin = total - first; return { order: ord, totalMin: total, spanMin, windowAfterCompletionHours: +(maxAgeHours - spanMin / 60).toFixed(2), feasible: spanMin / 60 < maxAgeHours }; };
  const best = evalOrder(Object.keys(est).sort((a, b) => est[b] - est[a] || (a < b ? -1 : 1)));
  return { best, given: order ? evalOrder(order) : null };
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2); const a = { gates: [], est: [] }; const sub = argv[0];
  for (let i = 1; i < argv.length; i++) { const t = argv[i]; if (!t.startsWith("--")) continue; const k = t.slice(2); if (k === "json") { a.json = true; continue; } const v = argv[++i]; if (k === "require-gate") a.gates.push(v); else if (k === "est") a.est.push(v); else a[k] = v; }
  if (!["status", "plan"].includes(sub) || !a.repo || !a.gates.length) { console.error("用法：node tools/release_gate_plan.mjs status|plan --repo <worktree> [--target-sha <sha>] --require-gate <名稱> ..."); process.exit(64); }
  const repo = path.resolve(a.repo); const common = git(repo, ["rev-parse", "--git-common-dir"]);
  const receiptsDir = a["receipts-dir"] ? path.resolve(a["receipts-dir"]) : defaultReceiptsDir(path.resolve(repo, common.out));
  if (sub === "status") {
    if (!a["target-sha"]) { console.error("status 需要 --target-sha"); process.exit(64); }
    const full = git(repo, ["rev-parse", "--verify", "--quiet", `${a["target-sha"]}^{commit}`]).out || a["target-sha"];
    const cur = chromeVersion();
    const pre = preflight({ repo, target: full, receiptsDir });
    const st = receiptStatus({ receiptsDir, targetSha: full, gates: a.gates, currentBrowser: cur, env: pre.ctx.env });
    const warn = Number(a["warn-hours"] ?? 6);
    if (a.json) console.log(JSON.stringify({ target: full, currentBrowser: cur, ...st }, null, 1));
    else {
      console.log(`目標 ${full}　現在 Chrome ${cur ?? "(未知)"}　（效期分類表 ${GATE_POLICY_VERSION}；舊收據 ${LEGACY_HOURS}h）`);
      for (const r of st.rows) console.log(`  ${r.state.padEnd(8)} ${r.gate.padEnd(28)} ${CATEGORIES[r.category].label.padEnd(12)} ${r.tier ?? ""} ${r.via ?? ""} ${r.expiresAt ? `到期 ${r.expiresAt}（剩 ${r.remainingHours}h）` : ""}${r.remainingHours !== undefined && r.remainingHours > 0 && r.remainingHours < warn ? "  ⚠ 即將到期" : ""}${r.browserChanged ? `  ⚠ 瀏覽器已從 ${r.browserThen} 更新` : ""}`);
      console.log(st.windowEndsAt ? `發布窗口到 ${st.windowEndsAt}（由 ${st.windowGate} 決定）` : "沒有有效的 PASS 收據");
    }
    process.exit(0);
  }
  const est = {};
  for (const g of a.gates) {
    const given = a.est.find((x) => x.startsWith(`${g}=`));
    if (given) { est[g] = Number(given.split("=")[1]); continue; }
    let durs = []; try { durs = fs.readdirSync(receiptsDir).filter((f) => f.includes(`__${g.replace(/[^A-Za-z0-9._-]/g, "_")}__`)).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(receiptsDir, f), "utf8")).durationMs; } catch { return null; } }).filter((x) => Number.isFinite(x) && x > 0); } catch { /* 沒有歷史 */ }
    est[g] = durs.length ? +(median(durs) / 60000).toFixed(1) : null;
  }
  const missing = Object.entries(est).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) { console.log(`這些 gate 沒有歷史耗時，請用 --est <gate>=<分鐘> 補：${missing.join("、")}`); process.exit(2); }
  const p = planOrder(est, { order: a.gates });
  if (a.json) console.log(JSON.stringify({ estimatesMin: est, ...p }, null, 1));
  else {
    console.log(`估計耗時（分鐘）：${Object.entries(est).map(([k, v]) => `${k}=${v}`).join("、")}　合計 ${p.best.totalMin.toFixed(0)}`);
    console.log(`建議順序（最長的先跑）：${p.best.order.join(" → ")}`);
    console.log(`  跨度 ${(p.best.spanMin / 60).toFixed(1)}h，全部跑完時剩餘窗口 ${p.best.windowAfterCompletionHours}h${p.best.feasible ? "" : "  ✘ 超過效期：不可能一次讓全部收據同時有效"}`);
    if (p.given) console.log(`照你給的順序：跨度 ${(p.given.spanMin / 60).toFixed(1)}h，剩餘窗口 ${p.given.windowAfterCompletionHours}h`);
  }
}
