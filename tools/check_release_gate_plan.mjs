#!/usr/bin/env node
// ============================================================================
//  tools/check_release_gate_plan.mjs — 收據效期現況／執行順序規劃（tools/release_gate_plan.mjs）的測試
//
//    node tools/check_release_gate_plan.mjs
//
//  合成收據（系統暫存區），注入固定的「現在時間」。不碰真實收據目錄。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAN = await import(pathToFileURL(path.join(HERE, "release_gate_plan.mjs")).href);
const LIB = await import(pathToFileURL(path.join(HERE, "lib", "releaseGate.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 400) : ""}`); } };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-rgp-"));
process.on("exit", () => { if (path.basename(DIR).startsWith("esmo-rgp-")) { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const SHA = "a".repeat(40); const NOW = Date.parse("2026-11-26T12:00:00Z"); const H = 3600000;
let n = 0;
function put(gate, { hoursAgo, status = "PASS", durationMin = 10, category, chrome, tamper = false, sha = SHA } = {}) {
  const fin = new Date(NOW - hoursAgo * H).toISOString();
  const r = { schema: LIB.RECEIPT_SCHEMA, gateVersion: LIB.RELEASE_GATE_VERSION, gate, status, targetSha: sha, actualSha: sha, actualShaAfter: sha, finishedAt: fin, startedAt: fin, durationMs: durationMin * 60000, env: chrome ? { browser: { chrome } } : {}, category };
  r.digest = LIB.digestOf(r); if (tamper) r.status = "PASS";
  fs.writeFileSync(path.join(DIR, `${fin.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}_${++n}__${sha.slice(0, 12)}__${gate}__${status}.json`), JSON.stringify(r));
}
put("moba", { hoursAgo: 20 }); put("det", { hoursAgo: 5 }); put("old", { hoursAgo: 30 }); put("bad", { hoursAgo: 2, status: "FAIL" });
put("browser-a", { hoursAgo: 1, chrome: "157.0.1" }); put("tampered", { hoursAgo: 1, status: "FAIL", tamper: true });
put("perf-x", { hoursAgo: 3, category: "logic" });
{ const fin = new Date(NOW - 4 * H).toISOString(); const c = { schema: "esmo.release-gate.docs-carry/1", gate: "docs-carry", status: "PASS", targetSha: SHA, carriedGates: ["carried"], expiresAt: new Date(NOW + 2 * H).toISOString(), finishedAt: fin }; c.digest = LIB.digestOf(c); fs.writeFileSync(path.join(DIR, `x__${SHA.slice(0, 12)}__docs-carry__PASS.json`), JSON.stringify(c)); }

const st = PLAN.receiptStatus({ receiptsDir: DIR, targetSha: SHA, gates: ["moba", "det", "old", "bad", "browser-a", "tampered", "perf-x", "missing", "carried"], now: NOW, currentBrowser: "158.0.2" });
const row = (g) => st.rows.find((r) => r.gate === g);
ck("有效收據：PASS，剩餘時數正確（20 小時前 ⇒ 剩 4h）", row("moba").state === "PASS" && row("moba").remainingHours === 4);
ck("超過 24 小時 ⇒ EXPIRED（不會標成 PASS）", row("old").state === "EXPIRED");
ck("FAIL 收據 ⇒ FAIL", row("bad").state === "FAIL");
ck("沒有收據 ⇒ NOT_RUN", row("missing").state === "NOT_RUN");
ck("被改過的收據（digest 不符）⇒ INVALID", row("tampered").state === "INVALID");
ck("docs-carry 沿用：標示 via docs-carry，到期取沿用收據的 expiresAt", row("carried").state === "PASS" && row("carried").via === "docs-carry" && row("carried").remainingHours === 2);
ck("瀏覽器版本已更新 ⇒ browserChanged 預警", row("browser-a").browserChanged === true && row("browser-a").browserThen === "157.0.1");
ck("發布窗口＝有效 PASS 中最早到期的那張（carried，2h）", st.windowGate === "carried" && Date.parse(st.windowEndsAt) === NOW + 2 * H);
ck("只要有任何一張不是 PASS，allPass=false", st.allPass === false);
ck("收據自帶 category 時以收據為準", row("perf-x").category === "logic");
ck("名稱推斷分類：perf／browser／golden／prod-smoke／build／logic", PLAN.categoryOf("c1c2-closure-perf-p2v2") === "perf" && PLAN.categoryOf("c1c2-closure-fourengine-resume") === "browser" && PLAN.categoryOf("c1c2-v21a") === "golden" && PLAN.categoryOf("prod-smoke-93655403") === "prod-smoke" && PLAN.categoryOf("c1c2-production") === "build" && PLAN.categoryOf("c1c2-moba") === "logic");
const p = PLAN.planOrder({ a: 30, b: 120, c: 10 }, { order: ["c", "a", "b"] });
ck("規劃：最長的先跑（b → a → c）", p.best.order.join(",") === "b,a,c");
ck("規劃：跨度＝總時長 − 第一個（160 − 120 = 40 分），剩餘窗口 24 − 0.67h", p.best.spanMin === 40 && p.best.windowAfterCompletionHours === 23.33);
ck("規劃：照給定順序（最短先跑）跨度較大", p.given.spanMin === 150 && p.given.windowAfterCompletionHours < p.best.windowAfterCompletionHours);
const big = PLAN.planOrder({ a: 1000, b: 1000, c: 600 });
ck("規劃：總時長扣掉最長仍超過 24h ⇒ feasible=false（不可能讓全部同時有效）", big.best.feasible === false);
ck("分類表：效能與瀏覽器建議效期仍 24h；正式站 Smoke 不可沿用（0）", PLAN.CATEGORIES.perf.proposedHours === 24 && PLAN.CATEGORIES.browser.proposedHours === 24 && PLAN.CATEGORIES["prod-smoke"].proposedHours === 0);
ck("正式效期常數仍是 24 小時（本輪沒有改政策）", LIB.DEFAULT_MAX_AGE_HOURS === 24);
const cli = spawnSync(process.execPath, [path.join(HERE, "release_gate_plan.mjs"), "plan", "--repo", path.resolve(HERE, ".."), "--receipts-dir", DIR, "--require-gate", "never-run-gate"], { encoding: "utf8" });
ck("CLI plan：沒有歷史耗時又沒給 --est ⇒ exit 2 並說明", cli.status === 2 && /--est/.test(cli.stdout), cli.stdout + cli.stderr);
const cli2 = spawnSync(process.execPath, [path.join(HERE, "release_gate_plan.mjs"), "plan", "--repo", path.resolve(HERE, ".."), "--receipts-dir", DIR, "--require-gate", "x", "--require-gate", "y", "--est", "x=5", "--est", "y=50", "--json"], { encoding: "utf8" });
ck("CLI plan --est：輸出 JSON 建議順序 y → x", cli2.status === 0 && JSON.parse(cli2.stdout).best.order.join(",") === "y,x", cli2.stdout.slice(0, 300));

console.log(`\nRelease Gate plan（效期規劃）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
