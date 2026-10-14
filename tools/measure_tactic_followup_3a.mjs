// ============================================================================
//  tools/measure_tactic_followup_3a.mjs — Phase 3a 中期 Owner 決策的兩個追加量測（不是 gate；背景執行、可續跑）
//
//  執行：
//    node tools/measure_tactic_followup_3a.mjs --study=replication --dir=<repo 外的資料夾> [--workers=3]
//    node tools/measure_tactic_followup_3a.mjs --study=templates   --dir=<repo 外的資料夾> [--workers=3]
//    node tools/measure_tactic_followup_3a.mjs --study=quickmode   --dir=<與 replication 同一個資料夾> [--workers=3]
//    加 --report 只重算統計（不模擬）；加 --plan 只印批次數。資料夾裡放一個名為 STOP 的檔案會停下來，再執行一次會續跑。
//
//  量測程式與 G-A7 完全相同：同一個 worker（check_tactic_truth_3a.mjs --truth-worker → tacticTruthSim.runTruthMatch）、
//  同一批指標（都是「瞬間事件」的計數：狀態轉換、新決策；不是責任週期）、同一個配對統計。本檔只定義「跑哪些組合、怎麼判讀」。
//  結果寫到 tools/fixtures/tactic_followup_3a_<study>.json（附量測當下的模擬版本與 git HEAD）。
//
//  ══ 事前登記（這個檔案在任何結果產生之前 commit；下面的 seeds、指標、門檻之後不依結果修改）══════════════
//
//  ── study=replication：std 模板上目前提供的 12 個選擇，用獨立新 seeds、紅藍雙方複驗 ───────────────────
//   · 指標與方向＝G-A7 結果表裡該選擇的那一列（Registry gate 的事前登記），這裡不另選指標。
//   · seeds：1001–1400（n=400；G-A7 用的是 1–40，兩者不重疊）。7 個邊際選擇跑滿 400；
//     5 個原本就 z ≥ 3 的選擇跑 1001–1200（n=200）作為確認。
//   · 藍方：藍方用該選擇、紅方 std，讀藍方的指標。紅方：紅方用該選擇、藍方 std，讀紅方的指標。
//     對照組＝雙方 std 的同一批 seeds（藍、紅各讀自己那一側）。
//   · 判定（每個選擇）：
//       confirmed     兩側都「方向相符、配對 z ≥ 3、相對效果 |Δ| ≥ 5%」
//       one_sided     只有一側達到上面三項（另一側沒有）⇒ 不能標為 live（紅藍不對稱，登記為引擎後續）
//       insufficient  兩側都沒達到 ⇒ 不能標為 live
//       reversed      任一側方向相反且 z ≤ −3 ⇒ 不能標為 live
//     5% 是「玩家看得出差別」的下限；z ≥ 3 在 n=400 下對應的最小可偵測效果約 0.15 個標準差。
//   · 不放大任何係數、不改引擎、不改門檻；這份結果只決定排除表要不要增列，以及 Owner Review 的證據。
//   · 增補（2026-10-13，獨立審查之後、任何複驗結果產生之前；當時 replication 一場都還沒跑）：
//     審查指出 engageDecisionsPerMin／supportProtectsPerMin／coreProtectsPerMin 數的是「每次重評決策的結果」，接戰或保護持續越久
//     數到越多，帶有責任週期的成分。量測程式 v3 另外記了「只數開始」的計數（engageStarts／protectStarts／coreProtectStarts）。
//     用到上述三個指標的四個選擇，**兩個指標都要達標**才算 confirmed；原指標達標但「只數開始」的指標沒達標 ⇒ duty_cycle_only，
//     不能標為 live。原本的指標與門檻照舊量、照舊列出。
//
//  ── study=templates：21 個模板的實際行為是否不同 ───────────────────────────────────────────────
//   · 每個模板當藍方（不加任何選擇），紅方 std；seeds 2001–2060（n=60），每個模板用同一批 seeds。
//   · 行為向量＝下面 TEMPLATE_METRICS 的 16 個指標（藍方）。
//   · 兩個模板「行為上可區分」＝至少一個指標的配對 |z| ≥ 4（210 對 × 16 指標＝3360 個檢定，|z| ≥ 4 的偶然次數期望值約 0.2）。
//     達不到 ⇒ 列為「量不出差別」的一對；彼此量不出差別的模板連成一群。
//   · 另外記錄每個模板對 std 的勝率（只供參考，不是判定依據）。
//
//  ── study=quickmode：快速模式的「物件優先」「強邊」在現有引擎裡有沒有可驗證的行為 ─────────────────────
//   · 來由：G-A7 的批次（seeds 1–40）事後探索時看到——巨龍／巴龍重心調高，「到坑邊爭奪」的次數約 +14%（z 2.1–3.2）；
//     某一路改成進攻，打野去那一路抓人的比例上升 17–84%（z 1.2–2.0）。那是看了資料才想到的指標，不能當證據；
//     這裡用**沒看過的 seeds** 確認或否定它。
//   · seeds 1001–1400（與 replication 共用同一個對照組），藍方與紅方各量一次。
//   · 指標（由每場紀錄裡引擎自己的計數算出，都是瞬間事件）：
//       contestsPerMin.<dragon|baron>  該物件每次重生後，己方第一次有人走到坑邊 9 以內的次數（每次重生最多一次）÷ 分鐘
//       gankShare.<top|mid|bot>        打野出發抓人的次數裡，去這一路的比例（整場沒有抓人 ⇒ 不計入）
//   · 判定與 replication 相同（兩側都方向相符、z ≥ 3、|Δ| ≥ 5% ⇒ verified）。
//   · ⚠ 這個 study **不改變任何選擇的 live 狀態**：Registry 為這些選擇事前登記的是別的指標。verified 只代表
//     「引擎有這個行為，可以作為重新登記指標的候選」，要不要據此重新登記並重測，由 Owner 決定。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { metricValue, pairStats, isKnownMetric } from "./lib/tacticTruthSim.mjs";
import { TACTIC_TEMPLATES } from "../src/platform/tactics/tacticTemplates.js";
import * as Prov from "./lib/tacticMeasureProvenance.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const WORKER = path.join(ROOT, "tools/check_tactic_truth_3a.mjs");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const MAX_WORKERS = 3;
const MAX_REQUEUES = 2;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const nest = (dim, v) => { const o = {}; dim.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? v : {}, n[k]), o); return o; };
const r6 = (v) => (v === null || v === undefined ? null : Number(Number(v).toFixed(6)));

// ── 事前登記的常數 ────────────────────────────────────────────────────────
export const REPLICATION = Object.freeze({
  seedsFull: [1001, 1400], seedsConfirm: [1001, 1200], minZ: 3, minRel: 0.05,
  //  [維度, 選擇, 指標, 方向, 類別]；指標與方向抄自 tools/fixtures/tactic_truth_3a.json 的 primary 列（執行時逐筆核對）。
  choices: [
    ["jungle.focus", "farm", "ganksPerMin", "down", "marginal"],
    ["lanes.top.stance", "split", "seatFightEntriesPerMin.b1", "down", "marginal"],
    ["lanes.mid.stance", "split", "seatFightEntriesPerMin.b3", "down", "marginal"],
    ["lanes.bot.stance", "aggressive", "laneForward.bot", "up", "marginal"],
    ["seats.b1.priority", "core", "coreProtectsPerMin.top", "up", "marginal", "coreProtectStartsPerMin.top"],
    ["risk.tolerance", "cautious", "retreatStartsPerMin", "up", "marginal"],
    ["teamfight.posture", "aggressive", "engageDecisionsPerMin", "up", "marginal", "engageStartsPerMin"],
    ["jungle.focus", "invade", "invasionsActed", "up", "pass"],
    ["seats.b5.mission", "roam", "supportRoamsPerMin", "up", "pass"],
    ["seats.b5.mission", "protect", "supportProtectsPerMin", "up", "pass", "supportProtectStartsPerMin"],
    ["teamfight.posture", "passive", "engageDecisionsPerMin", "down", "pass", "engageStartsPerMin"],
    ["objectives.tower", "high", "siegeWindowsPerMin", "up", "pass"],
  ],
});
export const TEMPLATES_STUDY = Object.freeze({
  seeds: [2001, 2060], minAbsZ: 4,
  metrics: ["ganksPerMin", "invasionsActed", "supportRoamsPerMin", "supportProtectsPerMin", "retreatStartsPerMin", "fightEntriesPerMinAll",
    "engageDecisionsPerMin", "siegeWindowsPerMin", "laneForward.top", "laneForward.mid", "laneForward.bot", "seatFightEntriesPerMin.b1",
    "seatFightEntriesPerMin.b3", "objectiveFightEntriesPerMin.dragon", "objectiveFightEntriesPerMin.baron", "coreProtectsPerMin.adc"],
});

export const QUICKMODE = Object.freeze({
  seeds: [1001, 1400], minZ: 3, minRel: 0.05,
  //  [維度, 選擇, 指標, 方向]
  choices: [
    ["objectives.dragon", "high", "contestsPerMin.dragon", "up"],
    ["objectives.dragon", "low", "contestsPerMin.dragon", "down"],
    ["objectives.baron", "high", "contestsPerMin.baron", "up"],
    ["objectives.baron", "low", "contestsPerMin.baron", "down"],
    ["lanes.top.stance", "aggressive", "gankShare.top", "up"],
    ["lanes.mid.stance", "aggressive", "gankShare.mid", "up"],
    ["lanes.bot.stance", "aggressive", "gankShare.bot", "up"],
  ],
});
/** quickmode 專用指標：由紀錄裡引擎自己的 exec 計數算出（不經量測程式的指標表）。 */
function quickMetric(rec, side, id) {
  const [name, param] = id.split("."), e = rec[side].exec;
  if (name === "contestsPerMin") return rec.duration >= 60 ? e[`${param}Contests`] / (rec.duration / 60) : null;
  if (name === "gankShare") { const tot = e.topGanks + e.midGanks + e.botGanks; return tot > 0 ? e[`${param}Ganks`] / tot : null; }
  throw new Error(`unknown quickmode metric ${id}`);
}

// ── 批次 ──────────────────────────────────────────────────────────────────
function replicationBatches() {
  const R = REPLICATION, full = range(...R.seedsFull), confirm = range(...R.seedsConfirm);
  const out = [{ key: "rep|control", seeds: full, blue: null, red: null }];
  for (const [dim, choice, , , cls] of R.choices) {
    const arm = { templateId: "std", choices: nest(dim, choice) }, seeds = cls === "marginal" ? full : confirm;
    out.push({ key: `rep|blue|${dim}|${choice}`, seeds, blue: arm, red: null });
    out.push({ key: `rep|red|${dim}|${choice}`, seeds, blue: null, red: arm });
  }
  return out;
}
function quickmodeBatches() {
  const seeds = range(...QUICKMODE.seeds);
  const out = [{ key: "rep|control", seeds, blue: null, red: null }];
  for (const [dim, choice] of QUICKMODE.choices) {
    const arm = { templateId: "std", choices: nest(dim, choice) };
    out.push({ key: `qm|blue|${dim}|${choice}`, seeds, blue: arm, red: null });
    out.push({ key: `qm|red|${dim}|${choice}`, seeds, blue: null, red: arm });
  }
  return out;
}
function templateBatches() {
  const seeds = range(...TEMPLATES_STUDY.seeds);
  return Object.keys(TACTIC_TEMPLATES).map((id) => ({ key: `tpl|${id}`, seeds, blue: { templateId: id, choices: {} }, red: null }));
}

// ── 批次檔 ────────────────────────────────────────────────────────────────
const fileOf = (dir, key) => path.join(dir, `${key.replace(/[^A-Za-z0-9._-]+/g, "_")}.jsonl`);
function readBatch(dir, key) {
  const m = new Map(), f = fileOf(dir, key);
  if (!fs.existsSync(f)) return m;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); m.set(o.seed, o.rec); } catch { /* 寫到一半的最後一行：當作沒做 */ }
  }
  return m;
}

async function runBatches(dir, batches) {
  fs.mkdirSync(dir, { recursive: true });
  const tasks = [];
  const remaining = new Map();
  for (const b of batches) {
    const have = readBatch(dir, b.key), todo = b.seeds.filter((s) => !have.has(s));
    remaining.set(b.key, todo.length);
    for (const s of todo) tasks.push({ id: `${b.key}#${s}`, key: b.key, seed: s, blue: b.blue, red: b.red });
  }
  const sidecar = Prov.loadedFilesSidecar(dir);
  const total = batches.length;
  let doneBatches = batches.filter((b) => remaining.get(b.key) === 0).length;
  const workers = Math.max(1, Math.min(MAX_WORKERS, Number(val("workers", MAX_WORKERS))));
  console.log(`量測：${total} 批（已完成 ${doneBatches}），待跑 ${tasks.length} 場，workers=${workers}，資料夾 ${dir}`);
  if (!tasks.length) return true;
  const t0 = Date.now();
  let next = 0, finished = 0, failed = 0, stopped = false;
  const retry = [], attempts = new Map();     // 工作行程中途死掉時，它手上那場放回佇列（每場最多再試 MAX_REQUEUES 次）
  const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  await new Promise((resolveAll) => {
    let alive = 0;
    const spawnWorker = () => {
      const child = fork(WORKER, ["--truth-worker"], { env: { ...process.env, ESMO_BALANCE_SKILLS: "on" }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let inflight = null, killedByUs = false;
      const feed = () => {
        inflight = null;
        if (fs.existsSync(path.join(dir, "STOP"))) stopped = true;
        if (stopped || (next >= tasks.length && !retry.length)) { killedByUs = true; child.kill(); return; }
        inflight = retry.length ? retry.shift() : tasks[next++];
        child.send({ type: "run", ...inflight });
      };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = byId.get(m.id);
        if (m.type === "done") {
          sidecar.add(m.files);
          fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
          remaining.set(t.key, remaining.get(t.key) - 1);
          finished++;
          if (remaining.get(t.key) === 0) {
            doneBatches++;
            const el = (Date.now() - t0) / 1000, per = el / finished, left = (tasks.length - finished) * per;
            console.log(`${bar(doneBatches, total)} ${String(Math.round((doneBatches / total) * 100)).padStart(3)}%  批 ${doneBatches}/${total}  場 ${finished}/${tasks.length}  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(left / 60).toFixed(1)} 分（${per.toFixed(1)} 秒/場）　${t.key}`);
          }
        } else if (m.type === "error") { failed++; console.log(`✗ ${m.id}: ${String(m.error).slice(0, 300)}`); }
        feed();
      });
      child.on("exit", () => {
        alive--;
        if (inflight && !killedByUs) {
          //  行程自己死掉（崩潰、被記憶體保護砍）時手上還有一場沒有結果：放回佇列，並補一個新的 worker
          const t = inflight, n = (attempts.get(t.id) ?? 0) + 1;
          inflight = null;
          attempts.set(t.id, n);
          if (n > MAX_REQUEUES) { failed++; console.log(`✗ ${t.id}: worker 中途結束，已重試 ${MAX_REQUEUES} 次，放棄`); }
          else { retry.push(t); console.log(`↻ ${t.id}: worker 中途結束，放回佇列（第 ${n}/${MAX_REQUEUES} 次）`); }
          if (!stopped && (retry.length || next < tasks.length)) spawnWorker();
        }
        if (alive === 0) resolveAll();
      });
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) spawnWorker();
  });
  console.log(`本輪跑了 ${finished} 場、失敗 ${failed}，${((Date.now() - t0) / 60000).toFixed(1)} 分`);
  if (failed || stopped) { console.log(stopped ? "已依 STOP 停止；再執行一次會續跑。" : "有失敗的場次；再執行一次會續跑。"); return false; }
  return true;
}

//  量測出處：與真實性結果表同一組雜湊 ＋ 量測 worker 載入過的 repo 檔案（聯集）；gitHead 保留當參考。main 在寫檔前設定 provenance。
let provenance = null;
const metaOf = () => {
  let gitHead = null;
  try { gitHead = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { /* 沒有 git 也照寫 */ }
  return { ...provenance.hashes, loadedFiles: provenance.loadedFiles, gitHead, items: "standard", skills: "on" };
};
const statsOf = (pairs) => { const s = pairStats(pairs); const se = s.sd === null || !s.n ? null : s.sd / Math.sqrt(s.n); return { n: s.n, meanA: r6(s.meanA), meanB: r6(s.meanB), diff: r6(s.diff), sd: r6(s.sd), z: r6(s.z), rel: r6(s.rel), ci95: se === null ? null : [r6(s.diff - 1.96 * se), r6(s.diff + 1.96 * se)] }; };

// ── 統計：replication ─────────────────────────────────────────────────────
function replicationReport(dir) {
  const R = REPLICATION;
  const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/tactic_truth_3a.json"), "utf8"));
  const control = readBatch(dir, "rep|control");
  const rows = [], problems = [];
  for (const [dim, choice, metric, direction, cls, strictMetric = null] of R.choices) {
    const prim = truth.rows.find((r) => r.role === "primary" && r.template === "std" && r.dimension === dim && r.choice === choice);
    if (!prim || prim.metric !== metric || prim.direction !== direction) problems.push(`${dim}=${choice}：事前登記的指標／方向與 G-A7 結果表不同`);
    const seeds = range(...(cls === "marginal" ? R.seedsFull : R.seedsConfirm));
    const sides = {}, strict = {};
    const sideStat = (trt, side, m) => {
      const st = statsOf(seeds.filter((s) => control.has(s) && trt.has(s)).map((s) => [metricValue(control.get(s), side, m), metricValue(trt.get(s), side, m)]));
      const zd = st.z === null ? null : st.z * (direction === "up" ? 1 : -1);
      const relD = st.rel === null ? null : st.rel * (direction === "up" ? 1 : -1);
      return { ...st, zDirected: r6(zd), meets: zd !== null && zd >= R.minZ && relD !== null && relD >= R.minRel, reversed: zd !== null && zd <= -R.minZ };
    };
    for (const side of ["blue", "red"]) {
      const trt = readBatch(dir, `rep|${side}|${dim}|${choice}`);
      const missing = seeds.filter((s) => !control.has(s) || !trt.has(s)).length;
      if (missing) problems.push(`${dim}=${choice} ${side}：缺 ${missing} 場`);
      sides[side] = sideStat(trt, side, metric);
      if (strictMetric) strict[side] = sideStat(trt, side, strictMetric);
    }
    let verdict = sides.blue.reversed || sides.red.reversed ? "reversed" : sides.blue.meets && sides.red.meets ? "confirmed" : sides.blue.meets || sides.red.meets ? "one_sided" : "insufficient";
    if (verdict === "confirmed" && strictMetric && !(strict.blue.meets && strict.red.meets)) verdict = "duty_cycle_only";
    rows.push({ dimension: dim, choice, metric, direction, originalClass: cls, originalZ: prim ? r6(prim.z) : null, blue: sides.blue, red: sides.red, strictMetric, strict: strictMetric ? strict : null, verdict });
  }
  return { schema: "TacticFollowup.replication.v1", meta: metaOf(), rule: { seedsFull: R.seedsFull, seedsConfirm: R.seedsConfirm, minZ: R.minZ, minRel: R.minRel }, rows, problems };
}

// ── 統計：quickmode ───────────────────────────────────────────────────────
function quickmodeReport(dir) {
  const Q = QUICKMODE, seeds = range(...Q.seeds), control = readBatch(dir, "rep|control");
  const rows = [], problems = [];
  for (const [dim, choice, metric, direction] of Q.choices) {
    const sides = {};
    for (const side of ["blue", "red"]) {
      const trt = readBatch(dir, `qm|${side}|${dim}|${choice}`);
      const missing = seeds.filter((s) => !control.has(s) || !trt.has(s)).length;
      if (missing) problems.push(`${dim}=${choice} ${side}：缺 ${missing} 場`);
      const st = statsOf(seeds.filter((s) => control.has(s) && trt.has(s)).map((s) => [quickMetric(control.get(s), side, metric), quickMetric(trt.get(s), side, metric)]));
      const zd = st.z === null ? null : st.z * (direction === "up" ? 1 : -1);
      const relD = st.rel === null ? null : st.rel * (direction === "up" ? 1 : -1);
      sides[side] = { ...st, zDirected: r6(zd), meets: zd !== null && zd >= Q.minZ && relD !== null && relD >= Q.minRel, reversed: zd !== null && zd <= -Q.minZ };
    }
    const verdict = sides.blue.reversed || sides.red.reversed ? "reversed" : sides.blue.meets && sides.red.meets ? "verified" : sides.blue.meets || sides.red.meets ? "one_sided" : "insufficient";
    rows.push({ dimension: dim, choice, metric, direction, blue: sides.blue, red: sides.red, verdict });
  }
  return { schema: "TacticFollowup.quickmode.v1", meta: metaOf(), rule: { seeds: Q.seeds, minZ: Q.minZ, minRel: Q.minRel }, note: "does not change any live status; verified = candidate for re-registering the metric (Owner decision)", rows, problems };
}

// ── 統計：templates ───────────────────────────────────────────────────────
function templatesReport(dir) {
  const T = TEMPLATES_STUDY, ids = Object.keys(TACTIC_TEMPLATES), seeds = range(...T.seeds);
  const recs = Object.fromEntries(ids.map((id) => [id, readBatch(dir, `tpl|${id}`)]));
  const problems = ids.filter((id) => seeds.some((s) => !recs[id].has(s))).map((id) => `${id}：缺場次`);
  const summary = ids.map((id) => {
    const list = seeds.filter((s) => recs[id].has(s)).map((s) => recs[id].get(s));
    const means = Object.fromEntries(T.metrics.map((m) => { const v = list.map((r) => metricValue(r, "blue", m)).filter((x) => x !== null); return [m, v.length ? r6(v.reduce((a, b) => a + b, 0) / v.length) : null]; }));
    return { template: id, n: list.length, blueWinRate: list.length ? r6(list.filter((r) => r.winner === "blue").length / list.length) : null, avgDurationMin: list.length ? r6(list.reduce((a, r) => a + r.duration, 0) / list.length / 60) : null, means };
  });
  const pairs = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    let best = null; const over = [];
    for (const m of T.metrics) {
      const st = pairStats(seeds.filter((s) => recs[ids[a]].has(s) && recs[ids[b]].has(s)).map((s) => [metricValue(recs[ids[a]].get(s), "blue", m), metricValue(recs[ids[b]].get(s), "blue", m)]));
      if (st.z === null) continue;
      if (!best || Math.abs(st.z) > Math.abs(best.z)) best = { metric: m, z: r6(st.z), rel: r6(st.rel) };
      if (Math.abs(st.z) >= T.minAbsZ) over.push(m);
    }
    pairs.push({ a: ids[a], b: ids[b], distinct: over.length > 0, distinctMetrics: over, strongest: best });
  }
  //  量不出差別的模板連成一群（union-find）
  const parent = Object.fromEntries(ids.map((id) => [id, id]));
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const p of pairs) if (!p.distinct) parent[find(p.a)] = find(p.b);
  const groups = Object.values(ids.reduce((g, id) => { (g[find(id)] ??= []).push(id); return g; }, {}));
  return {
    schema: "TacticFollowup.templates.v1", meta: metaOf(), rule: { seeds: T.seeds, minAbsZ: T.minAbsZ, metrics: T.metrics },
    counts: { templates: ids.length, pairs: pairs.length, distinctPairs: pairs.filter((p) => p.distinct).length, behaviourGroups: groups.length },
    groups: groups.filter((g) => g.length > 1), indistinguishable: pairs.filter((p) => !p.distinct),
    vsStd: pairs.filter((p) => p.a === "std" || p.b === "std").map((p) => ({ template: p.a === "std" ? p.b : p.a, distinct: p.distinct, metrics: p.distinctMetrics.length, strongest: p.strongest })),
    summary, pairs, problems,
  };
}

// ── main ──────────────────────────────────────────────────────────────────
const study = val("study");
if (!["replication", "templates", "quickmode"].includes(study)) { console.error("需要 --study=replication、--study=templates 或 --study=quickmode"); process.exit(2); }
const bad = [...REPLICATION.choices.flatMap((c) => [c[2], c[5]].filter(Boolean)), ...TEMPLATES_STUDY.metrics].filter((m) => !isKnownMetric(m));
if (bad.length) { console.error(`未知的指標：${bad.join(",")}`); process.exit(2); }
const dir = path.resolve(val("dir", path.join(os.tmpdir(), `esmo-tactic-followup-3a-${study}`)));
const batches = study === "replication" ? replicationBatches() : study === "quickmode" ? quickmodeBatches() : templateBatches();
if (flag("plan")) { console.log(`${study}：${batches.length} 批、${batches.reduce((s, b) => s + b.seeds.length, 0)} 場`); process.exit(0); }
if (!flag("report")) { const ok = await runBatches(dir, batches); if (!ok) process.exit(3); }
{
  const loaded = Prov.loadedFilesSidecar(dir).all();
  if (!loaded.length) { console.log(`${dir} 沒有 loadedFiles.json（這些場次不是用記錄載入檔的 worker 跑的）；不寫結果檔，請重新量測`); process.exit(1); }
  provenance = { hashes: await Prov.currentHashes(), loadedFiles: Prov.hashLoadedFiles(loaded) };
}
const report = study === "replication" ? replicationReport(dir) : study === "quickmode" ? quickmodeReport(dir) : templatesReport(dir);
const out = path.join(ROOT, `tools/fixtures/tactic_followup_3a_${study}.json`);
if (report.problems.length) { console.log(`資料不完整，不寫結果檔：${report.problems.slice(0, 5).join("；")}`); process.exit(1); }
fs.writeFileSync(out, `${JSON.stringify(report)}\n`);
console.log(`已寫入 ${path.relative(ROOT, out)}`);
if (study === "quickmode") {
  console.log("| 選擇 | 指標 | 藍 Δ% | 藍 z | 紅 Δ% | 紅 z | 判定 |\n|---|---|---|---|---|---|---|");
  for (const r of report.rows) console.log(`| ${r.dimension}=${r.choice} | ${r.metric} ${r.direction} | ${((r.blue.rel ?? 0) * 100).toFixed(1)} | ${r.blue.z?.toFixed(2)} | ${((r.red.rel ?? 0) * 100).toFixed(1)} | ${r.red.z?.toFixed(2)} | ${r.verdict} |`);
} else if (study === "replication") {
  console.log("| 選擇 | 指標 | 原 z | 藍 Δ% | 藍 z | 紅 Δ% | 紅 z | 判定 |\n|---|---|---|---|---|---|---|---|");
  for (const r of report.rows) if (r.strict) console.log(`  （只數開始）${r.dimension}=${r.choice} ${r.strictMetric}：藍 ${((r.strict.blue.rel ?? 0) * 100).toFixed(1)}% z=${r.strict.blue.z?.toFixed(2)}　紅 ${((r.strict.red.rel ?? 0) * 100).toFixed(1)}% z=${r.strict.red.z?.toFixed(2)}`);
  for (const r of report.rows) console.log(`| ${r.dimension}=${r.choice} | ${r.metric} ${r.direction} | ${r.originalZ?.toFixed(2)} | ${((r.blue.rel ?? 0) * 100).toFixed(1)} | ${r.blue.z?.toFixed(2)} | ${((r.red.rel ?? 0) * 100).toFixed(1)} | ${r.red.z?.toFixed(2)} | ${r.verdict} |`);
} else {
  console.log(J(report.counts));
  console.log("量不出差別的群：", J(report.groups));
  for (const v of report.vsStd) console.log(`${v.template.padEnd(26)} vs std：${v.distinct ? `${v.metrics} 個指標可區分` : "量不出差別"}　最強 ${v.strongest?.metric} z=${v.strongest?.z}`);
}
function J(x) { return JSON.stringify(x); }
