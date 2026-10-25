// ============================================================================
//  tools/lib/studyRunner.mjs — Phase 3a-B P2 研究共用的批次執行器（可續跑、單線、可 STOP）
//
//  每一場一個 task：{ id, key, seed, ...spec }。結果逐場追加到 <dir>/<key>.jsonl（{ id, seed, rec }），錯誤到 <key>.errors.jsonl。
//  續跑：已經有紀錄（或已記錯誤）的 id 不再跑（決定性引擎：同一場重跑結果相同；錯誤保留，不選擇性重試）。
//  停止：<dir>/STOP 存在 ⇒ 每個 worker 跑完手上那一場就收工。worker 中途死掉（記憶體保護等）⇒ 那一場記為遺失，續跑會補。
//  資料夾第一次使用時寫 meta.json（研究 id、gitHead、指紋、登記檔雜湊）；之後必須一致，否則拒絕混跑。
//  workers ≤ 3（記憶體保護）；長量測一律單線、一次一支。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fork, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const safe = (k) => k.replace(/[^A-Za-z0-9._@-]+/g, "_");
export const fileOf = (dir, key) => path.join(dir, `${safe(key)}.jsonl`);
export const insideRepo = (p) => { const a = path.resolve(p).toLowerCase(), r = ROOT.toLowerCase(); return a === r || a.startsWith(r + path.sep); };
export const sha16 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** <dir>/<key>.jsonl → Map(id → rec)（壞掉的最後半行略過）。 */
export function readKey(dir, key, suffix = "") {
  const m = new Map(), f = suffix ? fileOf(dir, `${key}${suffix}`) : fileOf(dir, key);
  if (!fs.existsSync(f)) return m;
  for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(o.id, o.rec ?? o.error); } catch { /* 半行 */ } }
  return m;
}

export function provenance() {
  const SVp = path.join(ROOT, "src/platform/contracts/simulationVersion.js");
  const git = (c) => { try { return execSync(c, { cwd: ROOT }).toString().trim(); } catch { return null; } };
  return { gitHead: git("git rev-parse HEAD"), dirtyFilesUnderSrcTools: (git("git status --porcelain -- src tools") ?? "x").split("\n").filter(Boolean).length, simulationVersionFile: sha16(fs.readFileSync(SVp, "utf8")) };
}

/**
 * @param {object} a
 * @param {string} a.dir            repo 外的資料夾
 * @param {Array<object>} a.tasks   { id, key, seed, ... }（整份計畫；已完成的會跳過）
 * @param {string} a.workerFile     fork 的腳本（帶 a.workerArgs；worker 回 { type:"ready" }／{ type:"done", id, rec }／{ type:"error", id, error }）
 * @param {object} a.meta           寫進／比對 meta.json 的內容（研究 id、登記檔雜湊、指紋…）
 * @param {number} [a.workers=3]
 * @param {(rec, task) => string[]} [a.check]  每一場的即時檢查（回傳問題 ⇒ 記錄並停跑，交給呼叫端判 STOP）
 */
export async function runStudy({ dir, tasks, workerFile, workerArgs = [], meta, workers = 3, check = null, label = "study" }) {
  if (insideRepo(dir)) throw new Error("--dir 必須在 repo 之外");
  fs.mkdirSync(dir, { recursive: true });
  const metaF = path.join(dir, "meta.json");
  if (fs.existsSync(metaF)) {
    const m = JSON.parse(fs.readFileSync(metaF, "utf8"));
    const want = JSON.stringify(meta), got = JSON.stringify(m.meta);
    if (want !== got) throw new Error(`資料夾 ${dir} 是在不同的登記／程式下開始的，不得混跑：${got} vs ${want}`);
  } else fs.writeFileSync(metaF, JSON.stringify({ startedAt: new Date().toISOString(), meta }, null, 2));
  const done = new Map(), errs = new Map();
  const keys = [...new Set(tasks.map((t) => t.key))];
  for (const k of keys) { done.set(k, readKey(dir, k)); errs.set(k, readKey(dir, k, ".errors")); }
  const todo = tasks.filter((t) => !done.get(t.key).has(t.id) && !errs.get(t.key).has(t.id));
  const W = Math.max(1, Math.min(3, workers));
  console.log(`${label}：待跑 ${todo.length}／${tasks.length} 場，workers=${W}，資料夾 ${dir}`);
  const t0 = Date.now();
  let next = 0, finished = 0, failed = 0, lost = 0, stopped = false, halted = null;
  const bar = (x, n) => { const k = Math.round((x / Math.max(1, n)) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
  await new Promise((resolveAll) => {
    let alive = 0;
    const spawn = () => {
      const child = fork(workerFile, workerArgs, { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let busy = null;
      const feed = () => { busy = null; if (fs.existsSync(path.join(dir, "STOP"))) stopped = true; if (stopped || halted || next >= todo.length) { child.kill(); return; } busy = todo[next++]; child.send(busy); };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = busy;
        if (m.type === "done") {
          fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ id: t.id, seed: t.seed, rec: m.rec })}\n`);
          const p = check ? check(m.rec, t) : [];
          if (p.length) { halted = `${t.id}: ${p.join(" ｜ ")}`; console.error(`⛔ ${halted}`); }
          finished++;
          if (finished % 100 === 0 || finished === todo.length) {
            const el = (Date.now() - t0) / 1000, per = el / finished;
            console.log(`${bar(finished, todo.length)} ${String(Math.round((finished / todo.length) * 100)).padStart(3)}%  ${finished}/${todo.length} 場  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(((todo.length - finished) * per) / 60).toFixed(1)} 分（${per.toFixed(2)} 秒/場）`);
          }
        } else {
          failed++;
          fs.appendFileSync(fileOf(dir, `${t.key}.errors`), `${JSON.stringify({ id: t.id, seed: t.seed, error: String(m.error).slice(0, 2000) })}\n`);
          console.error(`✗ ${t.id}: ${String(m.error).slice(0, 300)}`);
        }
        feed();
      });
      child.on("exit", () => { if (busy) { lost++; console.error(`⚠ worker 中途結束，遺失 ${busy.id}（續跑會補）`); busy = null; } alive--; if (alive === 0) resolveAll(); });
    };
    for (let i = 0; i < Math.min(W, todo.length); i++) spawn();
    if (!todo.length) resolveAll();
  });
  console.log(`${label}：本輪 ${finished} 場、錯誤 ${failed}、遺失 ${lost}，${((Date.now() - t0) / 60000).toFixed(1)} 分${stopped ? "；依 STOP 停止" : ""}${halted ? "；即時檢查停跑" : ""}`);
  return { finished, failed, lost, stopped, halted };
}

// ── 統計（純函式）────────────────────────────────────────────────────────────
export function meanSd(xs) {
  const n = xs.length; if (!n) return { n: 0, mean: null, sd: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}
/** 配對差 d 的統計：mean、se、z、雙側 CI（zCrit 預設 1.96）。 */
export function pairedStats(ds, zCrit = 1.96) {
  const { n, mean, sd } = meanSd(ds);
  const se = n > 1 ? sd / Math.sqrt(n) : null;
  return { n, mean, sd, se, z: se ? mean / se : (mean === 0 ? 0 : null), lo: se != null ? mean - zCrit * se : null, hi: se != null ? mean + zCrit * se : null };
}
