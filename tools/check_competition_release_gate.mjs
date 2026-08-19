#!/usr/bin/env node
// ============================================================================
//  Competition Release Gate
//
//  Competition / Season / Event / Ranking / Honors / Season Recap 相關改動在
//  **merge / deploy 前的正式入口**。Claude、Codex、任何人都用同一支。
//
//  它**不取代**各 verifier，只是把「這一塊改了就必須全綠」的集合固定下來，
//  免得每次靠記憶挑要跑哪幾支——2026-08-18 的事故就是這樣漏掉的：
//  `tools/verify.mjs` 不含任何 browser gate，賽事頁整頁失效仍會全綠。
//
//  ⚠ **不會在第一個 FAIL 就中止。** 全部跑完才回報，讓一次執行看到完整故障面。
//  ⚠ 子行程一律有逾時；`finally` 會回收，並在結束前檢查殘留 port。
//
//  用法：
//    node tools/check_competition_release_gate.mjs
//    node tools/check_competition_release_gate.mjs --only=v2_runtime,q6
//    node tools/check_competition_release_gate.mjs --list
// ============================================================================
import { spawnSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ⚠ `shape` 刻意寫死通過數：exit code 0 不足以證明 gate 真的跑完
//   （腳本可能提早 return、或印錯東西仍然 exit 0）。
//   新增斷言時**必須**一併更新這裡——那是刻意的摩擦，不是麻煩。
const GATES = [
  {
    id: "v2_runtime", script: "tools/check_seasonstate_v2_runtime.mjs",
    shape: /\[legacy\]\s+9\/9 通過[\s\S]*\[v2\]\s+27\/27 通過/,
    note: "SeasonState v2 runtime compatibility（legacy / v2 分組計數）",
    timeout: 300_000,
  },
  {
    //  ⚠ 與 v2_runtime 分開的理由：v2_runtime 每一條都從**乾淨載入**開始，
    //    證明不了「載入之後又發生了什麼」。這一支守的正是那兩件事——
    //    玩家切換聚焦 Event（v2 `active` 必須跟著 legacy `activeEventId` 走，
    //    存檔重載後仍然一致），以及 legacy 事後追加 fixture／outcome 之後的
    //    index refresh 必須 **Event-scoped**（更新該 Event、鄰居零污染）。
    //    兩者都在 2026-08-19 的交叉驗證中被實測為紅。
    id: "v2_active_focus", script: "tools/check_seasonstate_v2_active_focus.mjs",
    shape: /SeasonState v2 active focus: 31\/31 PASS/,
    note: "v2 聚焦指標一致性 ＋ Event-scoped index refresh",
    timeout: 300_000,
  },
  {
    id: "v2_sealing_m2", script: "tools/check_season_state_v2_sealing_m2.mjs",
    shape: /SeasonState v2 M2 sealing: 24\/24 PASS/,
    note: "3b-M2 Event/Season sealing boundary（legacy sealing regression）",
    timeout: 300_000,
  },
  {
    id: "circuit_points", script: "tools/browser_check_circuit_points_ui.mjs",
    shape: /21\/21 通過/, note: "巡迴積分 UI", timeout: 900_000, ports: [5319, 9341],
  },
  {
    id: "multi_event", script: "tools/browser_check_multi_event_ui.mjs",
    shape: /8\/8 通過/, note: "多 Event UI 與 focus 切換", timeout: 900_000, ports: [5316, 9338],
  },
  {
    id: "career_final", script: "tools/browser_check_career_final_ui.mjs",
    shape: /12\/12 通過/, note: "生涯主要賽事最終名次", timeout: 900_000, ports: [5325, 9347],
  },
  {
    id: "asia_finals", script: "tools/browser_check_asia_finals_ui.mjs",
    shape: /15\/15 通過/, note: "亞洲年度總決賽 UI", timeout: 900_000, ports: [5337, 9357],
  },
  {
    id: "team_honors", script: "tools/browser_check_team_honors_ui.mjs",
    shape: /15\/15 通過/, note: "戰隊榮譽 UI", timeout: 900_000, ports: [5347, 9367],
  },
  {
    id: "q6", script: "tools/browser_check_q6.mjs",
    shape: /20\/20 通過/, note: "季後賽／封存／換季 生命週期", timeout: 900_000, ports: [5311, 9333],
  },
  {
    id: "build", cmd: "npm", args: ["run", "build"],
    shape: /built in/, note: "production build", timeout: 600_000,
  },
];

// ── 尚未納入 ───────────────────────────────────────────────────────────────
//
//  `browser_check_season_recap_ui`（Q7f 賽季總結，19/19）
//    Q7f 分支 `q7a/3b-multi-event` 尚未整合進 main ⇒ 本分支沒有這支腳本。
//    整合時只需在上面的 GATES 加一列，並把它的 fixture 路徑從 `../../`
//    改成 `review/fixtures/competition/`（見該目錄 README）。
//
//  `check_season_state_v2_migration_q7b`（verify.mjs 期望 35/35）
//    ⚠ **已知 verifier debt，刻意不納入。**
//    它自己讀 `made.state.competition.id`——那個屬性自 Q7a-3b 起就不存在，
//    所以它在**乾淨 main 上就會崩潰**，與它本來要防守的缺陷同源。
//    在修好該 verifier 自身之前納入它，只會讓這支 Release Gate 永遠是紅的。
//    修它是獨立工作項，不在本 gate 的範圍。

const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").replace("--only=", "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (argv.includes("--list")) {
  console.log("Competition Release Gate — 區段清單");
  for (const g of GATES) console.log(`  ${g.id.padEnd(16)} ${g.note}`);
  process.exit(0);
}

const selected = only.length ? GATES.filter((g) => only.includes(g.id)) : GATES;
if (!selected.length) {
  console.error(`--only 沒有匹配任何區段。可用：${GATES.map((g) => g.id).join(", ")}`);
  process.exit(2);
}

// 這些 port 是各 browser gate **目前實際使用的** dev server / CDP。
const WATCHED_PORTS = [...new Set(GATES.flatMap((gate) => gate.ports ?? []))];
const listenersByPort = (ports = WATCHED_PORTS) => {
  const wanted = new Set(ports);
  const found = new Map();
  try {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8", timeout: 20_000 });
    for (const line of out.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/);
      if (fields[0]?.toUpperCase() !== "TCP" || fields[3]?.toUpperCase() !== "LISTENING") continue;
      const port = Number(fields[1]?.match(/:(\d+)$/)?.[1]);
      const pid = Number(fields[4]);
      if (!wanted.has(port) || !Number.isInteger(pid)) continue;
      if (!found.has(port)) found.set(port, new Set());
      found.get(port).add(pid);
    }
  } catch {}
  return found;
};
const portsInUse = (ports = WATCHED_PORTS) => [...listenersByPort(ports).keys()].sort((a, b) => a - b);
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** 只回收「本 gate 開始前不存在、結束後卻監聽指定 port」的 PID。 */
const cleanupNewListeners = (ports, beforeOwners) => {
  const killed = [];
  for (const [port, pids] of listenersByPort(ports)) {
    const existed = beforeOwners.get(port) ?? new Set();
    for (const pid of pids) {
      if (existed.has(pid)) continue;
      const killedRun = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
      killed.push({ port, pid, ok: killedRun.status === 0 });
    }
  }
  if (killed.length) sleepSync(500);
  const residual = [];
  for (const [port, pids] of listenersByPort(ports)) {
    const existed = beforeOwners.get(port) ?? new Set();
    for (const pid of pids) if (!existed.has(pid)) residual.push({ port, pid });
  }
  return { killed, residual };
};

const before = portsInUse();
const results = [];
const logDir = mkdtempSync(join(tmpdir(), "esmo-competition-gate-"));

console.log("══ Competition Release Gate ══");
console.log(`區段 ${selected.length} 個。任一 FAIL 都會讓整體 exit 非 0，但**不會提前中止**。\n`);
console.log(`完整 stdout/stderr：${logDir}\n`);

try {
  for (const gate of selected) {
    const label = `${gate.id.padEnd(16)} ${gate.note}`;
    process.stdout.write(`▶ ${label} … `);
    const started = Date.now();
    const gateBefore = listenersByPort(gate.ports ?? []);
    const collisions = [...gateBefore.keys()];
    const run = gate.cmd
      ? process.platform === "win32" && gate.cmd === "npm"
        // Node 24 在 Windows 直接 spawnSync("npm.cmd") 會回 EINVAL；用靜態 cmd
        // 入口執行既有 npm script，不開 `shell:true`，也不拼接外部輸入。
        ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run build"],
          { cwd: ROOT, encoding: "utf8", timeout: gate.timeout, shell: false })
        : spawnSync(gate.cmd, gate.args, { cwd: ROOT, encoding: "utf8", timeout: gate.timeout, shell: false })
      : spawnSync(process.execPath, [gate.script], { cwd: ROOT, encoding: "utf8", timeout: gate.timeout });
    const elapsedMs = Date.now() - started;
    const secs = (elapsedMs / 1000).toFixed(1);
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    writeFileSync(join(logDir, `${gate.id}.log`), out, "utf8");
    const timedOut = run.error?.code === "ETIMEDOUT";
    const signaled = run.signal != null;
    const exitOk = run.status === 0;
    const shapeOk = gate.shape.test(out);
    const cleanup = cleanupNewListeners(gate.ports ?? [], gateBefore);
    const cleanupOk = cleanup.killed.length === 0 && cleanup.residual.length === 0;
    const ok = exitOk && shapeOk && !timedOut && !signaled && cleanupOk;
    let reason = null;

    console.log(`${ok ? "✅ PASS" : "❌ FAIL"}　${secs}s`);
    if (!ok) {
      const status = Number.isInteger(run.status) ? `${run.status} (0x${(run.status >>> 0).toString(16).toUpperCase()})` : String(run.status);
      reason = collisions.length ? `啟動前 port collision：${collisions.join(", ")}`
        : timedOut ? `逾時（${gate.timeout / 1000}s）`
        : signaled ? `signal=${run.signal}`
        : !exitOk ? `exit=${status}${run.error ? `；${run.error.message}` : ""}`
        : cleanup.killed.length ? `gate 未自行 cleanup；runner 回收 ${cleanup.killed.map((x) => `${x.port}/PID ${x.pid}`).join(", ")}`
        : cleanup.residual.length ? `cleanup 後仍殘留 ${cleanup.residual.map((x) => `${x.port}/PID ${x.pid}`).join(", ")}`
        : "輸出形狀不符（exit 0 但沒印出預期的通過行）";
      console.log(`      原因：${reason}`);
      const red = out.split("\n").filter((l) => l.startsWith("❌")).slice(0, 4);
      for (const l of red) console.log(`      ${l.slice(0, 120)}`);
      if (!red.length) {
        for (const l of out.trim().split("\n").slice(-4)) console.log(`      | ${l.slice(0, 120)}`);
      }
    }
    results.push({ id: gate.id, ok, elapsedMs, reason });
  }
} finally {
  const leaked = portsInUse().filter((p) => !before.includes(p));
  console.log("");
  if (leaked.length) {
    console.log(`⚠ 殘留 LISTENING port：${leaked.join(", ")}　（子行程沒收乾淨，請檢查）`);
  } else {
    console.log("port 清理：✅ 無殘留");
  }
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
writeFileSync(join(logDir, "summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");
console.log("");
console.log("════════════════════════════════════════");
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id}`);
console.log("");
console.log(`passed ${passed}/${results.length}`);
console.log(`failed ${failed}/${results.length}`);
process.exit(failed === 0 ? 0 : 1);
