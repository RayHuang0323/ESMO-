// ============================================================================
//  tools/lib/checkpoint.mjs — 長時間測試的 Checkpoint 與安全續跑
//
//  為什麼：Claude Code Session 中斷、電腦休眠、瀏覽器崩潰、記憶體不足、人工停止，都會讓長測試跑一半。
//  過去要嘛整組重跑，要嘛手動拼結果（容易漏案例、重複計算、或把不同候選版本混在一起）。
//
//  資料夾結構（全部在 repo 外的證據資料夾）：
//    manifest.json   任務、候選 SHA／tree、工具與契約的雜湊、環境、案例清單、續跑策略（建立後不得修改；digest 釘住）
//    journal.jsonl   只能追加的事件紀錄，每列帶前一列的雜湊（hash chain）：改動或刪除任何一列都會被發現
//    raw/            每個案例的原始資料（record 時算 sha256 記進 journal）
//
//  續跑前必須全部成立，否則 BLOCKED（環境／版本不符）或 FAIL（資料被動過）：
//    候選 SHA 與 tree 相同、工具與契約雜湊相同、必要環境相同、journal 鏈完整、
//    每個已完成案例的原始資料仍在且 digest 相同。
//  策略：
//    per-case  逐案例續跑（決定性、彼此獨立的案例）
//    per-unit  事前登記的「實驗單位」（ABBA、同場對照、順序效應、完整樣本）：單位內只要沒全部完成，
//              整個單位作廢重跑（舊資料保留、標記 superseded，不刪除）
//  舊的 FAIL、中斷紀錄一律保留在 journal，不會因為續跑而消失。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const CHECKPOINT_SCHEMA = "esmo.checkpoint/1";
export const INTERRUPT_REASONS = ["session-interrupted", "hibernate", "process-crash", "browser-crash", "out-of-memory", "manual-stop", "unclean-stop", "timeout", "candidate-changed", "environment-changed"];
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const canonical = (v) => Array.isArray(v) ? "[" + v.map(canonical).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}" : JSON.stringify(v) ?? "null";
const mk = (id, status, detail = "") => ({ id, status, detail });
const agg = (cs) => (cs.some((c) => c.status === "FAIL") ? "FAIL" : cs.some((c) => c.status === "BLOCKED") ? "BLOCKED" : "PASS");
export const fileSha = (p) => sha256(fs.readFileSync(p));

export class CheckpointError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/**
 * 建立新的 checkpoint。dir 必須不存在或是空的（不覆寫既有證據）。
 * m: { task, candidateSha, treeSha, tools: [absPath], contract: absPath | { inline }, env: {…}, cases: [id], units?: { unitId: [caseId] }, policy: "per-case"|"per-unit" }
 */
export function createCheckpoint(dir, m) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new CheckpointError("dir_not_empty", `checkpoint 資料夾已有內容，不覆寫既有證據：${dir}`);
  if (!/^[0-9a-f]{40}$/.test(String(m.candidateSha))) throw new CheckpointError("bad_sha", "candidateSha 必須是 40 位完整 SHA");
  const cases = [...m.cases]; if (!cases.length || new Set(cases).size !== cases.length) throw new CheckpointError("bad_cases", "案例清單不得為空或重複");
  const policy = m.policy || "per-case"; if (!["per-case", "per-unit"].includes(policy)) throw new CheckpointError("bad_policy", `未知策略 ${policy}`);
  let units = null;
  if (policy === "per-unit") {
    units = m.units || {}; const flat = Object.values(units).flat();
    if (flat.length !== cases.length || new Set(flat).size !== flat.length || !flat.every((c) => cases.includes(c))) throw new CheckpointError("bad_units", "per-unit 策略要求每個案例恰好屬於一個單位");
  }
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  const manifest = {
    schema: CHECKPOINT_SCHEMA, task: m.task, candidateSha: m.candidateSha, treeSha: m.treeSha ?? null,
    tools: (m.tools || []).map((t) => ({ path: t, sha256: fileSha(t) })),
    contract: m.contract ? (typeof m.contract === "string" ? { path: m.contract, sha256: fileSha(m.contract) } : { inline: m.contract.inline, sha256: sha256(canonical(m.contract.inline)) }) : null,
    env: m.env || {}, cases, units, policy, createdAt: new Date().toISOString(),
    // 執行程序（指令樣板、逾時等）：續跑時必須完全相同，否則兩種程序的結果會被拼成一份（2026-11-26 審查修正）
    procedure: m.procedure ?? undefined,
  };
  manifest.digest = sha256(canonical(manifest));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1), { flag: "wx" });
  const cp = openCheckpoint(dir); cp._append({ event: "created", cases: cases.length, policy });
  return cp;
}

export function openCheckpoint(dir) {
  const mf = path.join(dir, "manifest.json"), jf = path.join(dir, "journal.jsonl");
  if (!fs.existsSync(mf)) throw new CheckpointError("no_manifest", `不是 checkpoint 資料夾：${dir}`);
  const manifest = JSON.parse(fs.readFileSync(mf, "utf8"));
  let validated = false;

  const readJournal = () => {
    const lines = fs.existsSync(jf) ? fs.readFileSync(jf, "utf8").split("\n").filter(Boolean) : [];
    let prev = "genesis:" + manifest.digest; const events = []; let broken = null;
    lines.forEach((l, i) => {
      let e; try { e = JSON.parse(l); } catch { broken = broken || `第 ${i + 1} 列不是 JSON`; return; }
      const { hash, ...rest } = e;
      if (rest.prev !== prev) broken = broken || `第 ${i + 1} 列的 prev 不接前一列（被插入、刪除或改動）`;
      if (hash !== sha256(canonical(rest))) broken = broken || `第 ${i + 1} 列內容與雜湊不符（被改動）`;
      prev = hash; events.push(e);
    });
    return { events, broken, last: prev };
  };
  const append = (ev) => {
    const { last, broken } = readJournal();
    if (broken) throw new CheckpointError("journal_broken", `journal 鏈已損壞，拒絕再寫：${broken}`);
    const rest = { at: new Date().toISOString(), ...ev, prev: last };
    fs.appendFileSync(jf, JSON.stringify({ ...rest, hash: sha256(canonical(rest)) }) + "\n");
  };
  /** 由 journal 推導狀態：每個案例最新一次有效的完成紀錄（unit-reset 之後的才算）。 */
  const derive = (events = readJournal().events) => {
    const done = new Map(); const failed = new Map(); const interrupts = []; let open = null; const history = [];
    for (const e of events) {
      if (e.event === "case-done") { done.set(e.caseId, e); failed.delete(e.caseId); }
      if (e.event === "case-failed") failed.set(e.caseId, e);
      if (e.event === "unit-reset") for (const c of e.cases) done.delete(c);
      if (e.event === "interrupted") interrupts.push(e);
      if (e.event === "session-start") open = e;
      if (e.event === "session-end" || e.event === "interrupted") open = null;
      if (["created", "session-start", "resume", "unit-reset", "interrupted", "complete"].includes(e.event)) history.push({ at: e.at, event: e.event, reason: e.reason, detail: e.detail });
    }
    const pending = manifest.cases.filter((c) => !done.has(c));
    return { done, failed, pending, interrupts, openSession: open, history, complete: events.some((e) => e.event === "complete") };
  };

  /**
   * 續跑前驗證。ctx: { candidateSha, treeSha, env: {…} }（由呼叫端從目前的工作目錄與環境取得）
   * 回傳 { status, checks, pending, resetUnits }；PASS 之後才允許 record。
   */
  function validate(ctx, { reason = "resume" } = {}) {
    const checks = [];
    const { digest, ...rest } = manifest;
    checks.push(digest === sha256(canonical(rest)) ? mk("manifest_digest", "PASS") : mk("manifest_digest", "FAIL", "manifest 被改過"));
    checks.push(ctx.candidateSha === manifest.candidateSha ? mk("candidate_sha", "PASS") : mk("candidate_sha", "BLOCKED", `checkpoint 屬於 ${manifest.candidateSha}，現在是 ${ctx.candidateSha}：不同候選版本的結果不能混在一起`));
    if (manifest.treeSha) checks.push(ctx.treeSha === manifest.treeSha ? mk("candidate_tree", "PASS") : mk("candidate_tree", "BLOCKED", "tree 不同"));
    for (const t of manifest.tools) { let h = null; try { h = fileSha(t.path); } catch { /* 下面 */ } checks.push(h === t.sha256 ? mk(`tool:${path.basename(t.path)}`, "PASS") : mk(`tool:${path.basename(t.path)}`, "BLOCKED", h ? "測試工具內容變了" : "測試工具不見了")); }
    if (manifest.contract) {
      const h = manifest.contract.path ? (fs.existsSync(manifest.contract.path) ? fileSha(manifest.contract.path) : null) : sha256(canonical(manifest.contract.inline));
      checks.push(h === manifest.contract.sha256 ? mk("contract", "PASS") : mk("contract", "BLOCKED", "事前登記契約變了"));
    }
    if (manifest.procedure !== undefined) checks.push(canonical(ctx.procedure) === canonical(manifest.procedure) ? mk("procedure", "PASS") : mk("procedure", "BLOCKED", `執行程序與事前登記不同：checkpoint ${JSON.stringify(manifest.procedure)} ≠ 現在 ${JSON.stringify(ctx.procedure)}`));
    for (const [k, v] of Object.entries(manifest.env)) checks.push(canonical(ctx.env?.[k]) === canonical(v) ? mk(`env:${k}`, "PASS") : mk(`env:${k}`, "BLOCKED", `環境 ${k}：checkpoint ${JSON.stringify(v)} ≠ 現在 ${JSON.stringify(ctx.env?.[k])}`));
    const j = readJournal();
    checks.push(j.broken ? mk("journal_chain", "FAIL", j.broken) : mk("journal_chain", "PASS", `${j.events.length} 列`));
    const st = derive(j.events);
    for (const [c, e] of st.done) {
      const p = path.join(dir, e.raw);
      if (!fs.existsSync(p)) checks.push(mk(`raw:${c}`, "FAIL", `原始資料不見了：${e.raw}`));
      else if (fileSha(p) !== e.sha256) checks.push(mk(`raw:${c}`, "FAIL", `原始資料被改過：${e.raw}`));
    }
    if (!checks.some((c) => c.id.startsWith("raw:"))) checks.push(mk("raw_data", "PASS", `${st.done.size} 個已完成案例的原始資料都在且未被改動`));
    const status = agg(checks);
    let resetUnits = [];
    if (status === "PASS") {
      if (st.openSession) append({ event: "interrupted", reason: "unclean-stop", detail: `上一個 session（pid ${st.openSession.pid}）沒有正常結束（Session 中斷、休眠、崩潰或被終止）` });
      if (manifest.policy === "per-unit") {
        for (const [u, cs] of Object.entries(manifest.units)) {
          const doneIn = cs.filter((c) => st.done.has(c));
          if (doneIn.length && doneIn.length < cs.length) { resetUnits.push(u); append({ event: "unit-reset", unit: u, cases: doneIn, reason: "實驗單位不完整：依事前登記契約整個單位重跑（舊資料保留、標記 superseded）" }); }
        }
      }
      append({ event: "resume", reason, candidateSha: ctx.candidateSha, resetUnits });
      validated = true;
    }
    return { status, checks, pending: derive().pending, resetUnits };
  }

  /**
   * 唯讀的完整性檢查（不寫 journal）：給 Release Gate 收據與 Readiness 報告引用 checkpoint 時用。
   * 檢查 manifest digest、journal 鏈、候選 SHA、全部完成、每個已完成案例的原始資料 digest、complete 事件的合計雜湊。
   */
  function verifyIntegrity(expectedSha) {
    const checks = [];
    const { digest, ...rest } = manifest;
    checks.push(digest === sha256(canonical(rest)) ? mk("manifest_digest", "PASS") : mk("manifest_digest", "FAIL", "manifest 被改過"));
    checks.push(manifest.candidateSha === expectedSha ? mk("candidate_sha", "PASS") : mk("candidate_sha", "BLOCKED", `checkpoint 屬於 ${manifest.candidateSha}，不是 ${expectedSha}`));
    const j = readJournal(); checks.push(j.broken ? mk("journal_chain", "FAIL", j.broken) : mk("journal_chain", "PASS"));
    const st = derive(j.events);
    checks.push(st.pending.length ? mk("all_cases_done", "BLOCKED", `還有 ${st.pending.length} 個案例未完成`) : mk("all_cases_done", "PASS"));
    let bad = 0;
    for (const [c, e] of st.done) { const p = path.join(dir, e.raw); if (!fs.existsSync(p) || fileSha(p) !== e.sha256) { bad++; checks.push(mk(`raw:${c}`, "FAIL", `原始資料不見了或被改過：${e.raw}`)); } }
    const complete = j.events.filter((e) => e.event === "complete").pop();
    if (!complete) checks.push(mk("complete_event", "BLOCKED", "沒有 complete 事件"));
    else if (!st.pending.length) { const agg2 = sha256(manifest.cases.map((c) => `${c}\0${st.done.get(c).sha256}`).join("\n")); checks.push(agg2 === complete.rawAggregateSha256 ? mk("raw_aggregate", "PASS") : mk("raw_aggregate", "FAIL", "原始資料合計雜湊與 complete 時不同")); }
    if (!bad) checks.push(mk("raw_data", "PASS"));
    return { status: agg(checks), checks, complete: !!complete, rawAggregateSha256: complete?.rawAggregateSha256 ?? null, interrupts: st.interrupts, resumes: j.events.filter((e) => e.event === "resume").length, unitResets: j.events.filter((e) => e.event === "unit-reset").length };
  }

  function requireValidated() { if (!validated) throw new CheckpointError("not_validated", "寫入結果前必須先通過 validate()（確認候選 SHA、工具、契約、環境、原始資料）"); }
  return {
    dir, manifest, validate, verifyIntegrity,
    _append: append,
    status: () => derive(),
    journal: () => readJournal(),
    begin(info = {}) { requireValidated(); append({ event: "session-start", pid: process.pid, ...info }); },
    /** 記錄一個案例完成。raw 必須在 dir/raw 底下。 */
    record(caseId, rawPath, extra = {}) {
      requireValidated();
      if (!manifest.cases.includes(caseId)) throw new CheckpointError("unknown_case", `案例「${caseId}」不在事前登記的清單裡`);
      if (derive().done.has(caseId)) throw new CheckpointError("duplicate_case", `案例「${caseId}」已經完成過，拒絕重複計算`);
      const rel = path.relative(dir, path.resolve(rawPath)).split(path.sep).join("/");
      if (!rel.startsWith("raw/")) throw new CheckpointError("raw_outside", "原始資料必須放在 checkpoint 的 raw/ 底下");
      append({ event: "case-done", caseId, raw: rel, sha256: fileSha(rawPath), ...extra });
    },
    fail(caseId, reason, extra = {}) { requireValidated(); append({ event: "case-failed", caseId, reason, ...extra }); },
    interrupt(reason, detail = "") { if (!INTERRUPT_REASONS.includes(reason)) throw new CheckpointError("bad_reason", `中斷原因必須是 ${INTERRUPT_REASONS.join("、")}`); append({ event: "interrupted", reason, detail }); },
    end() { append({ event: "session-end" }); },
    finalize() {
      requireValidated(); const st = derive();
      if (st.pending.length) throw new CheckpointError("incomplete", `還有 ${st.pending.length} 個案例未完成`);
      const digest = sha256(manifest.cases.map((c) => `${c}\0${st.done.get(c).sha256}`).join("\n"));
      append({ event: "complete", rawAggregateSha256: digest });
      return digest;
    },
  };
}
