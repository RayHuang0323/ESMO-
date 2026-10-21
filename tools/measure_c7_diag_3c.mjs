// ============================================================================
//  tools/measure_c7_diag_3c.mjs — Phase 3a-C：C7 §4-A／§4-B／§4-D 診斷（不是 gate、不是上線判定；背景單線、可續跑）
//
//  登記：tools/fixtures/c7_diag_registration_3c.json（臂、指標、判讀規則在開跑前寫死）。儀器：tools/lib/c7DiagSim.mjs。
//  用法：
//    node tools/measure_c7_diag_3c.mjs --run --dir=<repo 外> [--workers=2]   結束碼 0／3 STOP／4 斷路器／5 儀器不符／6 未完整
//    node tools/measure_c7_diag_3c.mjs --report --dir=<同一資料夾> [--out=<repo 外>]   完整才寫 tools/fixtures/c7_diag_result_3c.json（只寫一次）
//    node tools/measure_c7_diag_3c.mjs --selftest | --plan
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fork, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/c7_diag_registration_3c.json";
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, REG_REL), "utf8"));
const RESULT_FIXTURE = path.join(ROOT, "tools", "fixtures", "c7_diag_result_3c.json");
const RULESET = "balanceTool.v21";
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const Z = 3, REL = 0.05;
const LAYERS_OK = (L) => !!L && L.heroSkills === true && L.heroPassives === true && L.heroPowerCurve === true && L.battleTalents === false;
const ARMS = REG.design.arms;
const keysAll = () => ["ctrl", ...ARMS.filter((a) => a.key !== "ctrl").flatMap((a) => a.sides.map((s) => `${a.key}@${s}`))];
const armOf = (key) => ARMS.find((a) => a.key === key.split("@")[0]);
const insideRepo = (p) => { const a = path.resolve(p).toLowerCase(), r = ROOT.toLowerCase(); return a === r || a.startsWith(r + path.sep); };

// ── worker ──
if (flag("diag-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const D = await import(pathToFileURL(path.join(ROOT, "tools", "lib", "c7DiagSim.mjs")).href);
  process.on("message", async (t) => {
    try {
      const ctrl = await D.diagArm(null, null);
      const a = t.key === "ctrl" ? null : armOf(t.key), side = t.key.split("@")[1] ?? null;
      const arm = a ? await D.diagArm(a.dimension, a.choice) : ctrl;
      const spec = { blue: side === "blue" ? arm : ctrl, red: side === "red" ? arm : ctrl, ruleset: RULESET, neutralGankSide: a?.neutralGank ? side : null };
      const r = await D.runDiagMatch(t.seed, spec);
      const vals = {};
      for (const s of ["blue", "red"]) vals[s] = Object.fromEntries(Object.keys(D.DIAG_METRICS).map((id) => [id, D.diagMetricValue(r, s, id)]));
      process.send({ type: "done", id: t.id, rec: { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, layers: r.layers, duration: r.duration, winner: r.winner, vals } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 統計與判讀（純函式）──
export function pairStatsOf(pairs) {
  const ok = pairs.filter(([a, b]) => a !== null && b !== null);
  const n = ok.length;
  if (n < 2) return { n, meanA: null, meanB: null, diff: null, sd: null, z: null, rel: null };
  const meanA = ok.reduce((s, [a]) => s + a, 0) / n, meanB = ok.reduce((s, [, b]) => s + b, 0) / n;
  const d = ok.map(([a, b]) => b - a), diff = d.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - diff) ** 2, 0) / (n - 1));
  const z = sd === 0 ? (diff === 0 ? 0 : Math.sign(diff) * 99) : diff / (sd / Math.sqrt(n));
  return { n, meanA, meanB, diff, sd, z, rel: meanA === 0 ? null : diff / meanA };
}
const zDir = (st, dir) => (st?.z == null ? null : st.z * (dir === "up" ? 1 : -1));
export const moves = (st, dir) => zDir(st, dir) !== null && zDir(st, dir) >= Z && st.rel !== null && Math.abs(st.rel) >= REL;
export const reversed = (st, dir) => zDir(st, dir) !== null && zDir(st, dir) <= -Z;
/** 只看 z（登記：relWave 是帶正負號的位移、對照平均可能接近 0 ⇒ 相對差不穩定；4-D 的兩個量登記為「zDir ≥ 3」）。 */
export const movesZ = (st, dir) => zDir(st, dir) !== null && zDir(st, dir) >= Z;

/** cell(arm@side, metric) → stats；回傳 C7 §4 的判讀（登記 readingRules）。 */
export function readings(cell) {
  const out = {};
  //  4-A：每個選項、每一側
  for (const [key, lane, dir] of [["topDef", "top", "down"], ["midAggr", "mid", "up"]]) for (const s of ["blue", "red"]) {
    const lf = cell(`${key}@${s}`, `laneForward.${lane}`), rw = cell(`${key}@${s}`, `relWave.${lane}`);
    let v = "unresolved";
    if (reversed(rw, dir)) v = "behavioural_reversal (C5)";
    else if (movesZ(rw, dir) && reversed(lf, dir)) v = "category4_state_composition";
    else if (!reversed(lf, dir)) v = "no_reversal_at_n400";
    out[`4-A ${key}@${s}`] = v;
  }
  {
    const base = cell("midAggr@blue", "laneForward.mid"), ng = cell("midAggrNoGank@blue", "laneForward.mid");
    out["4-A gankWeights main cause (blue)"] = reversed(base, "up") ? (!reversed(ng, "up") ? "yes" : "no") : "n/a (midAggr blue not reversed)";
  }
  //  4-B
  {
    const roll = ["blue", "red"].map((s) => moves(cell(`tight@${s}`, "joinGoStartsPerMin.general"), "up"));
    const fe = ["blue", "red"].map((s) => moves(cell(`tight@${s}`, "laneFightEntriesPerMin.general"), "up"));
    out["4-B tight"] = roll.every(Boolean) && fe.every(Boolean) ? "original_family_works"
      : roll.every(Boolean) ? "category4_roll_metric" : roll.some(Boolean) ? "one_sided" : "category2_not_registrable";
  }
  //  4-D
  {
    const sides = ["blue", "red"].map((s) => {
      const o = cell(`baronHigh@${s}`, "objectiveFightEntriesPerMin.baron");
      if (!reversed(o, "up")) return "not_reversed";
      return movesZ(cell(`baronHigh@${s}`, "entryBaronDistMedian"), "up") && movesZ(cell(`baronHigh@${s}`, "baronPitFightSecsPerMin"), "up") ? "category4" : "unresolved";
    });
    out["4-D baronHigh"] = sides.every((x) => x === "not_reversed") ? "noise_original_reversal" : sides.includes("category4") && !sides.includes("unresolved") ? "category4_metric_moment" : `unresolved (${sides.join("/")})`;
  }
  return out;
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const st = (z, rel) => ({ n: 400, z, rel, diff: z });
  const mk = (table) => (k, m) => table[`${k}|${m}`] ?? st(0, 0);
  ck("D1 moves：zDir ≥ 3 且 |rel| ≥ 5 %；reversed：zDir ≤ −3", moves(st(3, 0.05), "up") && !moves(st(3, 0.04), "up") && moves(st(-3.2, -0.1), "down") && reversed(st(-3, -0.1), "up") && !reversed(st(-2.9, -0.1), "up"));
  const r1 = readings(mk({ "topDef@blue|relWave.top": st(-4, -0.01), "topDef@blue|laneForward.top": st(4, 0.05) }));
  ck("D2 4-A：relWave 照設計方向（只看 z，相對差 1 % 也算）、laneForward 反向 ⇒ category4", r1["4-A topDef@blue"] === "category4_state_composition");
  const r2 = readings(mk({ "midAggr@red|relWave.mid": st(-5, -0.1) }));
  ck("D3 4-A：relWave 本身反向 ⇒ C5 行為反向", r2["4-A midAggr@red"] === "behavioural_reversal (C5)");
  const r3 = readings(mk({ "midAggr@blue|laneForward.mid": st(-4, -0.05), "midAggrNoGank@blue|laneForward.mid": st(0, 0) }));
  ck("D4 4-A 第 4 臂：拿掉抓人權重後不再反向 ⇒ 抓人權重是主因", r3["4-A gankWeights main cause (blue)"] === "yes");
  const r4 = readings(mk({ "tight@blue|joinGoStartsPerMin.general": st(4, 0.1), "tight@red|joinGoStartsPerMin.general": st(4, 0.1), "tight@blue|laneFightEntriesPerMin.general": st(4, 0.1) }));
  ck("D5 4-B：擲骰兩側動、進入團戰只有一側動 ⇒ category4", r4["4-B tight"] === "category4_roll_metric");
  ck("D6 4-B：擲骰都不動 ⇒ category2", readings(mk({}))["4-B tight"] === "category2_not_registrable");
  ck("D7 4-D：兩側都不再反向 ⇒ 原結果是雜訊", readings(mk({}))["4-D baronHigh"] === "noise_original_reversal");
  const r5 = readings(mk({ "baronHigh@blue|objectiveFightEntriesPerMin.baron": st(-4, -0.1), "baronHigh@blue|entryBaronDistMedian": st(4, 0.01), "baronHigh@blue|baronPitFightSecsPerMin": st(4, 0.01) }));
  ck("D8 4-D：一側仍反向且距離中位數與坑邊秒數上升、另一側不反向 ⇒ category4", r5["4-D baronHigh"] === "category4_metric_moment");
  ck("D9 登記：10 臂、seeds 1401–1800", keysAll().length === 10 && SEEDS.length === 400 && SEEDS[0] === 1401);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 批次 ──
const fileOf = (dir, key) => path.join(dir, `${key.replace(/[|.@]/g, "_")}.jsonl`);
const readJsonl = (f) => { const m = new Map(); if (!fs.existsSync(f)) return m; for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(o.seed, o.rec ?? o.error); } catch { /* 半行 */ } } return m; };
const readRecs = (dir, key) => readJsonl(fileOf(dir, key));
const readErrors = (dir, key) => readJsonl(fileOf(dir, `${key}.errors`));
const SV = await import(pathToFileURL(path.join(ROOT, "src", "platform", "contracts", "simulationVersion.js")).href);
const gitHead = () => { try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { return "unknown"; } };
const gitDirty = () => { try { return execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };
const provenance = () => ({ gitHead: gitHead(), dirtyFilesUnderSrcTools: gitDirty(), simulationVersion: SV.MOBA_SIMULATION_VERSION, fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] });
function opsState(dir) {
  let instrument = 0, finished = 0, errored = 0;
  for (const k of keysAll()) {
    for (const r of readRecs(dir, k).values()) { finished++; if (r.ruleset !== RULESET || r.directorMode !== "core.v1" || !LAYERS_OK(r.layers)) instrument++; }
    errored += readErrors(dir, k).size;
  }
  const attempted = finished + errored;
  return { instrument, finished, errored, breaker: errored > 20 || (attempted >= 1000 && errored > 0.005 * attempted) };
}
if (flag("plan")) { console.log(`${keysAll().length} 臂 × ${SEEDS.length} seeds = ${keysAll().length * SEEDS.length} 場`); process.exit(0); }

if (flag("run")) {
  const dir = val("dir");
  if (!dir || insideRepo(dir)) { console.error("--dir 必須是 repo 外的資料夾"); process.exit(2); }
  if (fs.existsSync(RESULT_FIXTURE)) { console.error("結果檔已存在：seeds 已觀察過，不得再跑。"); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools !== 0) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools} 個未提交變更：必須在已 commit 的程式上跑。`); process.exit(2); }
  const metaFile = path.join(dir, "meta.json");
  if (fs.existsSync(metaFile)) {
    const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (m.study !== REG.studyId || m.fingerprint !== prov.fingerprint || m.gitHead !== prov.gitHead) { console.error(`⚠ 這個資料夾在 ${m.study}／${m.gitHead}／${m.fingerprint} 下開始，目前 ${REG.studyId}／${prov.gitHead}／${prov.fingerprint}：不得混跑。`); process.exit(2); }
  } else fs.writeFileSync(metaFile, JSON.stringify({ study: REG.studyId, startedAt: new Date().toISOString(), ...prov, registration: REG_REL }, null, 2));
  const pre = opsState(dir);
  if (pre.instrument) { console.error(`⛔ 儀器不符 ${pre.instrument} 筆 ⇒ STOP。`); process.exit(5); }
  if (pre.breaker) { console.error("⛔ 斷路器 ⇒ STOP。"); process.exit(4); }
  const done = new Map(keysAll().map((k) => [k, readRecs(dir, k)])), errs = new Map(keysAll().map((k) => [k, readErrors(dir, k)]));
  const tasks = [];
  for (const seed of SEEDS) for (const k of keysAll()) if (!done.get(k).has(seed) && !errs.get(k).has(seed)) tasks.push({ id: `${k}#${seed}`, key: k, seed });
  const workers = Math.max(1, Math.min(3, Number(val("workers", 2))));
  const t0 = Date.now();
  let next = 0, finished = 0, failed = 0, stopped = false, halt = null, lastPct = -1, lost = 0;
  const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
  console.log(`待跑 ${tasks.length}／${keysAll().length * SEEDS.length} 場（${keysAll().length} 臂），workers=${workers}，資料夾 ${dir}`);
  if (tasks.length) await new Promise((resolveAll) => {
    let alive = 0;
    const spawn = () => {
      const child = fork(SELF, ["--diag-worker"], { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let busy = null;
      const feed = () => {
        busy = null;
        if (fs.existsSync(path.join(dir, "STOP"))) stopped = true;
        if (stopped || halt || next >= tasks.length) { child.kill(); return; }
        busy = tasks[next++]; child.send(busy);
      };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = tasks.find((x) => x.id === m.id);
        if (m.type === "done") {
          fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
          finished++;
          if (m.rec.ruleset !== RULESET || m.rec.directorMode !== "core.v1" || !LAYERS_OK(m.rec.layers)) { halt = "instrument"; console.error(`⛔ 儀器不符 ${t.id}: ${JSON.stringify(m.rec.layers)}`); }
          const pct = Math.floor((finished / tasks.length) * 20);
          if (pct !== lastPct) {
            lastPct = pct;
            const el = (Date.now() - t0) / 1000, per = el / finished, left = (tasks.length - finished) * per;
            console.log(`${bar(finished, tasks.length)} ${String(Math.round((finished / tasks.length) * 100)).padStart(3)}%  ${finished}/${tasks.length} 場  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(left / 60).toFixed(1)} 分（${per.toFixed(2)} 秒/場，${workers} workers）`);
          }
        } else if (m.type === "error") {
          failed++; console.log(`✗ ${m.id}: ${String(m.error).slice(0, 300)}`);
          fs.appendFileSync(fileOf(dir, `${t.key}.errors`), `${JSON.stringify({ seed: t.seed, error: String(m.error).slice(0, 2000) })}\n`);
          if (opsState(dir).breaker) halt = "breaker";
        }
        feed();
      });
      child.on("exit", () => { if (busy) { lost++; console.error(`⚠ worker 中途結束，遺失 ${busy.id}（續跑會補）`); busy = null; } alive--; if (alive === 0) resolveAll(); });
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) spawn();
  });
  console.log(`本輪 ${finished} 場、失敗 ${failed}，${((Date.now() - t0) / 60000).toFixed(1)} 分${stopped ? "；依 STOP 停止（同一指令續跑）" : ""}`);
  if (halt === "instrument") process.exit(5);
  if (halt === "breaker") process.exit(4);
  if (stopped) process.exit(3);
  const left = SEEDS.length * keysAll().length - keysAll().reduce((n, k) => n + readRecs(dir, k).size + readErrors(dir, k).size, 0);
  if (left > 0 || lost > 0) { console.error(`⚠ 未完整：還有 ${left} 場 ⇒ 結束碼 6，同一指令續跑。`); process.exit(6); }
  process.exit(0);
}

if (flag("report")) {
  const dir = val("dir");
  if (!dir) { console.error("--report 需要 --dir"); process.exit(2); }
  const prov = provenance();
  const metaF = path.join(dir, "meta.json"), meta = fs.existsSync(metaF) ? JSON.parse(fs.readFileSync(metaF, "utf8")) : null;
  if (meta && meta.study !== REG.studyId) { console.error("資料夾不是這個研究的批次。"); process.exit(2); }
  const ops = opsState(dir);
  const recs = new Map(keysAll().map((k) => [k, readRecs(dir, k)]));
  const errSeeds = new Set(keysAll().flatMap((k) => [...readErrors(dir, k).keys()]));
  const complete = keysAll().every((k) => SEEDS.every((s) => recs.get(k).has(s) || errSeeds.has(s)));
  const STUDY_PATHS = `src tools/lib/c7DiagSim.mjs tools/lib/tacticTruthSim.mjs tools/measure_c7_diag_3c.mjs ${REG_REL} tools/balance/moba_items_balance_runner.mjs`;
  const changed = meta && meta.gitHead !== prov.gitHead ? execSync(`git diff --name-only ${meta.gitHead} HEAD -- ${STUDY_PATHS}`, { cwd: ROOT }).toString().trim().split("\n").filter(Boolean) : [];
  const stale = !meta ? ["meta.json missing"] : meta.fingerprint !== prov.fingerprint || changed.length ? [`batch@${meta.gitHead}/${meta.fingerprint} (changed: ${changed.join(",")})`] : [];
  const ctrl = recs.get("ctrl");
  const metricsAll = Object.keys(recs.get("ctrl").values().next().value?.vals?.blue ?? {});
  const cells = {};
  for (const k of keysAll().filter((x) => x !== "ctrl")) {
    const side = k.split("@")[1], tr = recs.get(k);
    cells[k] = Object.fromEntries(metricsAll.map((id) => [id, pairStatsOf(SEEDS.filter((s) => !errSeeds.has(s) && ctrl.has(s) && tr.has(s)).map((s) => [ctrl.get(s).vals[side][id], tr.get(s).vals[side][id]]))]));
  }
  const judgeable = complete && !ops.instrument && !ops.breaker && !stale.length;
  const read = judgeable ? readings((k, m) => cells[k]?.[m] ?? null) : null;
  const result = { schema: "esmo.c7-diag-result.v1", registration: REG_REL, reportedAt: new Date().toISOString(), ...prov, batchStartedUnder: meta, stale, complete,
    finishedMatches: ops.finished, erroredMatches: ops.errored, erroredSeeds: [...errSeeds], instrumentMismatch: ops.instrument, readings: read, cells };
  const f = (x, d = 3) => (x == null ? "—" : Number(x).toFixed(d));
  console.log(`C7 diag：完整 ${complete}、完成 ${ops.finished}、失敗 ${ops.errored}、儀器不符 ${ops.instrument}${stale.length ? "、STALE" : ""}`);
  for (const [k, ms] of Object.entries(cells)) for (const [id, st] of Object.entries(ms)) console.log(`  ${k.padEnd(20)} ${id.padEnd(36)} n ${st.n} ctrl ${f(st.meanA)} → ${f(st.meanB)} rel ${st.rel == null ? "—" : (st.rel * 100).toFixed(1)}% z ${f(st.z, 2)}`);
  if (read) for (const [k, v] of Object.entries(read)) console.log(`  ⇒ ${k}: ${v}`);
  const out = val("out");
  if (out) { if (insideRepo(out)) { console.error("--out 必須在 repo 外"); process.exit(2); } fs.writeFileSync(out, JSON.stringify(result, null, 2)); process.exit(0); }
  if (!judgeable) { console.error("未完整／停下／過期：不寫結果檔（中途用 --out）。"); process.exit(2); }
  //  判讀程式（readings）就在本檔：寫結果檔前，量測相關的路徑不得有未提交變更（否則判讀可能不是登記的那一版）。
  const dirtyStudy = execSync(`git status --porcelain -- ${STUDY_PATHS} tools/balance`, { cwd: ROOT }).toString().trim();
  if (dirtyStudy) { console.error(`量測相關檔案有未提交變更，不寫結果檔：
${dirtyStudy}`); process.exit(2); }
  if (fs.existsSync(RESULT_FIXTURE)) { console.error("結果檔已存在，永不覆寫。"); process.exit(2); }
  fs.writeFileSync(RESULT_FIXTURE, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`寫入 ${path.relative(ROOT, RESULT_FIXTURE)}`);
  process.exit(0);
}
if (!flag("diag-worker")) { console.error("用法見檔頭"); process.exit(2); }
