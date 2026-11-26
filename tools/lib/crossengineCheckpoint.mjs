// ============================================================================
//  tools/lib/crossengineCheckpoint.mjs — 四引擎一致性驗證的 Checkpoint 續跑（TD-66，Release Engineering S1.1）
//
//  ⚠ 這是「獨立版本化的候選」：不修改、不取代歷史工具 tools/c1/run_c1_crossengine.mjs（C1／C2 正式結果的出處），
//    也不修改判定工具 tools/c2/judge_c2_crossengine.mjs。跑完後 exportFormal() 匯出成 judge 讀得懂的
//    <dir>/node/<id>.json、<dir>/<engine>/<id>.json，再用「原封不動」的 judge 判定 ⇒ 驗收條件完全不變。
//
//  與舊 runner 的差別（舊 runner 只是「檔案存在就跳過」）：
//    · 事前登記：計畫檔（contract）、本 runner／引擎介面／digest／assemble 的雜湊、候選 SHA＋tree、指紋、kernel、程序參數
//      全部釘進 manifest；續跑時任何一項不同 ⇒ BLOCKED（不同候選或工具版本不得混用）。
//    · 每一筆原始資料記錄 sha256（journal hash chain）；被改動或刪除 ⇒ FAIL，不會被拿來判定。
//    · 每個引擎「實際使用」的瀏覽器版本（Playwright 的 browser.version()、Chrome 的 UA）寫進每一筆 raw；
//      續跑時新開的引擎版本與該引擎已完成的資料不同 ⇒ 中斷（environment-changed）、BLOCKED，不混用。
//    · 每個案例只能完成一次（重複 ⇒ 拒絕）；全部完成才能 finalize；舊的 FAIL、中斷、續跑歷史全部保留在 journal。
//    · 原始資料永不覆寫：第 n 次嘗試寫 raw/<engine>__<id>.<n>.json。匯出目錄必須是新的空資料夾。
//  案例彼此獨立且決定性（同 setup、同 seed、逐 tick digest）⇒ per-case 續跑合法；不涉及 ABBA 類實驗單位。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createCheckpoint, openCheckpoint, fileSha } from "./checkpoint.mjs";

export const CROSSENGINE_CP_VERSION = "crossengine-checkpoint/2";
export const caseId = (engine, id) => `${engine}/${id}`;
const rawName = (engine, id, attempt) => `raw/${engine}__${id}.${attempt}.json`;
const writeOnce = (p, obj) => { fs.writeFileSync(p, JSON.stringify(obj), { flag: "wx" }); };

/**
 * 建立或開啟 checkpoint。
 * o: { dir, resume, plan(物件), planPath, engines[], candidateSha, treeSha, srcDirty, tools[絕對路徑], env{…}, procedure{…} }
 */
export function openRun(o) {
  if (o.srcDirty) throw Object.assign(new Error("src 有未提交的變更：結果不能代表候選 SHA"), { code: "src_dirty" });
  const cases = [...o.plan.items.map((it) => caseId("node", it.id)), ...o.engines.flatMap((e) => o.plan.items.map((it) => caseId(e, it.id)))];
  const cp = o.resume ? openCheckpoint(o.dir) : createCheckpoint(o.dir, {
    task: `crossengine:${o.plan.planId}`, candidateSha: o.candidateSha, treeSha: o.treeSha, tools: o.tools, contract: o.planPath,
    env: { ...o.env, runner: CROSSENGINE_CP_VERSION }, cases, policy: "per-case", procedure: o.procedure,
  });
  if (o.resume && JSON.stringify(cp.manifest.cases) !== JSON.stringify(cases)) throw Object.assign(new Error("續跑的計畫／引擎清單與事前登記不同"), { code: "cases_changed" });
  const v = cp.validate({ candidateSha: o.candidateSha, treeSha: o.treeSha, env: { ...o.env, runner: CROSSENGINE_CP_VERSION }, procedure: o.procedure }, { reason: o.resume ? "resume" : "start" });
  return { cp, validation: v };
}

/** 已完成的 raw（經 journal 的 digest 確認）。 */
function doneRaw(cp, id) {
  const e = cp.status().done.get(id); if (!e) return null;
  const p = path.join(cp.dir, e.raw);
  if (fileSha(p) !== e.sha256) throw Object.assign(new Error(`原始資料被改過：${e.raw}`), { code: "raw_tampered" });
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
const attemptOf = (cp, engine, id) => fs.readdirSync(path.join(cp.dir, "raw")).filter((f) => f.startsWith(`${engine}__${id}.`)).length + 1;

/**
 * 執行（或續跑）。deps: { nodeRun(item) → { setupJson, setupHash, ticks, over, winner, endT, kills, gold, final, perTick }, openEngine(name) → engine,
 *   runOnEngine(engine, nodeRec) → result, recordEnv{head, sim, fingerprint, …}, log(s), stopAfter, onCase }
 * engine: { name, ua, browserVersion?, close() }
 * 回傳 { status: "COMPLETE"|"INTERRUPTED"|"BLOCKED", detail, ran }
 */
export async function runAll(cp, plan, engines, deps) {
  const log = deps.log || (() => {}); let ran = 0; const stopAfter = deps.stopAfter ?? Infinity;
  cp.begin({ runner: CROSSENGINE_CP_VERSION });
  const pend = () => new Set(cp.status().pending);
  const stop = (reason, detail) => { cp.interrupt(reason, detail); cp.end(); return { status: reason === "environment-changed" || reason === "candidate-changed" ? "BLOCKED" : "INTERRUPTED", detail, ran }; };
  // Node 參考結果
  for (const it of plan.items) {
    const id = caseId("node", it.id); if (!pend().has(id)) continue;
    if (ran >= stopAfter) return stop("manual-stop", `已完成 ${ran} 個案例後人工安全停止`);
    let rec; try { rec = await deps.nodeRun(it); } catch (e) { cp.fail(id, "process-crash", { error: String(e.message || e).slice(0, 300) }); return stop("process-crash", `node ${it.id}: ${e.message}`); }
    const p = path.join(cp.dir, rawName("node", it.id, attemptOf(cp, "node", it.id)));
    writeOnce(p, { id: it.id, item: it, ...rec, env: deps.recordEnv, writtenAt: new Date().toISOString() });
    cp.record(id, p, { kind: "node" }); ran++; log(`node ${it.id} ticks=${rec.ticks}`);
  }
  for (const name of engines) {
    const todo = plan.items.filter((it) => pend().has(caseId(name, it.id)));
    if (!todo.length) continue;
    // 這個引擎已完成的資料用的是哪個實際版本 ⇒ 新開的引擎必須一樣
    const prev = plan.items.map((it) => cp.status().done.get(caseId(name, it.id))).filter(Boolean).map((e) => e.actual);
    let E = null; let cur = null;
    try {
      E = await deps.openEngine(name);
      const actual = `${E.browserVersion ?? ""}|${E.ua ?? ""}`;
      const mixed = prev.find((x) => x && x !== actual);
      if (mixed) return stop("environment-changed", `${name} 的實際版本變了：已完成的資料是「${mixed}」，現在是「${actual}」——不同瀏覽器版本的結果不得混用，該引擎要用新的 checkpoint 整個重跑`);
      for (const it of todo) {
        if (ran >= stopAfter) return stop("manual-stop", `已完成 ${ran} 個案例後人工安全停止`);
        cur = it;
        const N = doneRaw(cp, caseId("node", it.id));
        let B; const t0 = Date.now(); try { B = await deps.runOnEngine(E, N); } catch (e) { cp.fail(caseId(name, it.id), "browser-crash", { error: String(e.message || e).slice(0, 300) }); return stop("browser-crash", `${name} ${it.id}: ${e.message}`); }
        let first = -1; const n = Math.max(N.perTick.length, B.perTick.length);
        for (let k = 0; k < n; k++) if (N.perTick[k] !== B.perTick[k]) { first = k; break; }
        const identical = first === -1 && N.ticks === B.ticks && N.final === B.final && N.winner === B.winner && N.endT === B.endT;
        const p = path.join(cp.dir, rawName(name, it.id, attemptOf(cp, name, it.id)));
        writeOnce(p, { id: it.id, engine: name, ua: E.ua, browserVersion: E.browserVersion ?? null, env: deps.recordEnv, setupHash: N.setupHash, identical, firstDifferentTick: first, engineMs: Date.now() - t0,
          node: { ticks: N.ticks, winner: N.winner, endT: N.endT, final: N.final }, result: B, writtenAt: new Date().toISOString() });
        cp.record(caseId(name, it.id), p, { kind: "engine", actual }); ran++;
        log(`${name} ${it.id} ${identical ? "IDENTICAL" : "DIFF@" + first}`);
        if (deps.onCase) await deps.onCase(name, it.id);
      }
    } catch (e) {
      if (e?.code === "raw_tampered") { cp.end(); return { status: "FAIL", detail: e.message, ran }; }
      cp.fail(caseId(name, (cur || todo[0]).id), "browser-crash", { error: String(e.message || e).slice(0, 300) }); return stop("browser-crash", `${name}: ${e.message}`);
    } finally { try { await E?.close(); } catch { /* 盡力 */ } }
  }
  const digest = cp.finalize(); cp.end();
  return { status: "COMPLETE", detail: `全部 ${cp.manifest.cases.length} 個案例完成，原始資料合計 ${digest}`, ran };
}

/**
 * 匯出成 judge（tools/c2/judge_c2_crossengine.mjs，未修改）讀的格式：<out>/node/<id>.json、<out>/<engine>/<id>.json。
 * 先 verifyIntegrity（全部完成、digest、journal 鏈、候選 SHA）；out 必須不存在或是空的（不覆寫既有證據）。
 */
/** 每個引擎實際使用的瀏覽器版本（由 journal 的 case-done 紀錄）。 */
export function engineActuals(cp) {
  const out = {}; for (const [id, e] of cp.status().done) { const [engine] = id.split("/"); if (engine === "node") continue; (out[engine] ||= new Set()).add(e.actual); }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s]]));
}
export function exportFormal(cp, out, expectedSha, { pairWith = null } = {}) {
  const v = cp.verifyIntegrity(expectedSha);
  if (v.status !== "PASS") return { status: v.status, checks: v.checks.filter((c) => c.status !== "PASS") };
  // 2026-11-26 審查修正（I3）：judge 不比對正式與重複兩份資料的瀏覽器版本 ⇒ 匯出時檢查：同一份內每個引擎只有一個版本，與配對的 checkpoint 也相同
  const mine = engineActuals(cp);
  const multi = Object.entries(mine).filter(([, l]) => l.length !== 1);
  if (multi.length) return { status: "BLOCKED", checks: [{ id: "engine_versions_single", status: "BLOCKED", detail: `同一份 checkpoint 內引擎版本不只一個：${JSON.stringify(Object.fromEntries(multi))}` }] };
  if (pairWith) {
    const other = engineActuals(pairWith);
    const diff = Object.keys({ ...mine, ...other }).filter((k) => mine[k] && other[k] && mine[k][0] !== other[k][0]);
    if (diff.length) return { status: "BLOCKED", checks: [{ id: "engine_versions_paired", status: "BLOCKED", detail: `正式與配對（重複）兩份的引擎版本不同：${diff.map((k) => `${k} ${mine[k][0]} ≠ ${other[k][0]}`).join("；")}` }] };
  }
  if (fs.existsSync(out) && fs.readdirSync(out).length) return { status: "BLOCKED", checks: [{ id: "export_dir_empty", status: "BLOCKED", detail: `匯出目錄已有內容，不覆寫：${out}` }] };
  let n = 0;
  for (const [id, e] of cp.status().done) {
    const [engine, item] = id.split("/");
    const src = path.join(cp.dir, e.raw);
    if (fileSha(src) !== e.sha256) return { status: "FAIL", checks: [{ id: `raw:${id}`, status: "FAIL", detail: "原始資料被改過" }] };
    fs.mkdirSync(path.join(out, engine), { recursive: true });
    fs.copyFileSync(src, path.join(out, engine, `${item}.json`), fs.constants.COPYFILE_EXCL); n++;
  }
  fs.writeFileSync(path.join(out, "EXPORTED_FROM_CHECKPOINT.json"), JSON.stringify({ checkpoint: cp.dir, manifestDigest: cp.manifest.digest, rawAggregateSha256: v.rawAggregateSha256, interrupts: v.interrupts.length, resumes: v.resumes, files: n, engineVersions: mine, pairedWith: pairWith ? pairWith.dir : null, at: new Date().toISOString() }, null, 1), { flag: "wx" });
  return { status: "PASS", files: n, rawAggregateSha256: v.rawAggregateSha256 };
}
