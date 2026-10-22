// ============================================================================
//  tools/measure_phase_options_3c.mjs — Phase 3a-C3-3／C4／C5 的事前登記研究（不是 gate；背景單線、可續跑）
//
//  一支工具、多份登記：--reg=<repo 內登記檔>。登記檔決定 seeds、臂（整場選擇＋每時期選擇）、宣稱（指標、方向、合併後備）、守門指標、
//  門檻與結果檔名；本檔只照登記執行與判讀。儀器：tools/lib/phaseStudySim.mjs。
//  用法：
//    node tools/measure_phase_options_3c.mjs --run --reg=<file> --dir=<repo 外> [--workers=2]   0／3 STOP／4 斷路器／5 儀器不符／6 未完整
//    node tools/measure_phase_options_3c.mjs --report --reg=<file> --dir=<同一資料夾> [--out=<repo 外>]
//    node tools/measure_phase_options_3c.mjs --selftest [--reg=<file>] ／ --plan --reg=<file>
//
//  ── 判定（登記檔 rules；這裡是實作）────────────────────────────────────────────
//   每個宣稱、每一側：同 seed 配對（對照組同側），兩側都要有效配對 ≥ minValidPairs；不足 ⇒ 改用登記的 fallbackMetric（合併桶）；
//   仍不足 ⇒ 該選項 unmeasurable。OK＝方向相符、依方向 z ≥ minZ、|rel| ≥ minRel。
//   守門（guards）：依方向反向且 z ≤ −minZ 而且 |rel| ≥ minRel（任一側）⇒ guard_failed（例：強邊的比例上升不得來自抓人總數下降）；
//   守門有效配對不足 minValidPairs ⇒ 該選項 unmeasurable（不默默放行）。controlSymmetry（選用）：對照組藍紅平均差超過容許值 ⇒ 標記。
//   優先序：unmeasurable ＞ reversed（任一宣稱任一側依方向 z ≤ −minZ）＞ guard_failed ＞ confirmed（每個宣稱兩側都 OK）
//          ＞ one_sided（恰好一側的每個宣稱都 OK）＞ insufficient。
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
const insideRepo = (p) => { const a = path.resolve(p).toLowerCase(), r = ROOT.toLowerCase(); return a === r || a.startsWith(r + path.sep); };
const LAYERS_OK = (L) => !!L && L.heroSkills === true && L.heroPassives === true && L.heroPowerCurve === true && L.battleTalents === false;
const RULESET = "balanceTool.v21";

// ── 判定（純函式）──
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
export function cellOk(st, direction, rules) {
  const sgn = direction === "up" ? 1 : -1, zDir = st.z === null ? null : st.z * sgn;
  const ok = st.diff !== null && Math.sign(st.diff) === sgn && zDir >= rules.minZ && st.rel !== null && Math.abs(st.rel) >= rules.minRel;
  const reversed = zDir !== null && zDir <= -rules.minZ;
  const harmful = reversed && st.rel !== null && Math.abs(st.rel) >= rules.minRel;
  return { zDir, ok, reversed, harmful };
}
/**
 * claims：[{ blue: stats, red: stats, direction }]（已選定主指標或合併後備）；guards 同形。measurable＝每個宣稱兩側都有足夠配對。
 */
export function verdictOf({ measurable, claims, guards }, rules) {
  if (!measurable) return "unmeasurable";
  const c = claims.map((x) => ({ blue: cellOk(x.blue, x.direction, rules), red: cellOk(x.red, x.direction, rules) }));
  if (c.some((x) => x.blue.reversed || x.red.reversed)) return "reversed";
  const g = guards.map((x) => ({ blue: cellOk(x.blue, x.direction, rules), red: cellOk(x.red, x.direction, rules) }));
  if (g.some((x) => x.blue.harmful || x.red.harmful)) return "guard_failed";
  const sidePass = (s) => c.every((x) => x[s].ok);
  if (sidePass("blue") && sidePass("red")) return "confirmed";
  if (sidePass("blue") || sidePass("red")) return "one_sided";
  return "insufficient";
}

// ── 登記 ──
const REG_REL = val("reg") ? val("reg").replaceAll("\\", "/") : null;
const REG = REG_REL ? JSON.parse(fs.readFileSync(path.join(ROOT, REG_REL), "utf8")) : null;

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const R = { minZ: 3, minRel: 0.05 };
  const st = (z, rel) => ({ n: 400, z, rel, diff: z });
  const cl = (b, r, d = "up") => ({ blue: b, red: r, direction: d });
  ck("V1 兩側都過 ⇒ confirmed", verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(5, 0.2))], guards: [] }, R) === "confirmed");
  ck("V2 量不到 ⇒ unmeasurable（優先）", verdictOf({ measurable: false, claims: [cl(st(-9, -0.5), st(-9, -0.5))], guards: [] }, R) === "unmeasurable");
  ck("V3 任一側反向 z ≤ −3 ⇒ reversed", verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(-3, -0.1))], guards: [] }, R) === "reversed");
  ck("V4 守門：抓人總數下降 ≥ 5 % 且 z ≤ −3 ⇒ guard_failed；下降 4 % ⇒ 不算", verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(4, 0.1))], guards: [cl(st(-3.5, -0.06), st(0, 0))] }, R) === "guard_failed"
    && verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(4, 0.1))], guards: [cl(st(-3.5, -0.04), st(0, 0))] }, R) === "confirmed");
  ck("V5 一側 ⇒ one_sided；都沒過 ⇒ insufficient；down 方向", verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(2, 0.1))], guards: [] }, R) === "one_sided"
    && verdictOf({ measurable: true, claims: [cl(st(1, 0.1), st(2, 0.1))], guards: [] }, R) === "insufficient" && verdictOf({ measurable: true, claims: [cl(st(-4, -0.1), st(-4, -0.1), "down")], guards: [] }, R) === "confirmed");
  ck("V6 兩個宣稱：藍側兩個都過、紅側只過一個 ⇒ one_sided；兩側各只過一個 ⇒ insufficient（一側要所有宣稱都過）", verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(4, 0.1)), cl(st(4, 0.1), st(1, 0))], guards: [] }, R) === "one_sided"
    && verdictOf({ measurable: true, claims: [cl(st(4, 0.1), st(1, 0)), cl(st(1, 0), st(4, 0.1))], guards: [] }, R) === "insufficient");
  if (REG) ck(`V7 登記檔 ${REG_REL}：每個選項至少一個宣稱，指標都是儀器認得的，seeds ${REG.seeds.range}`, (await (async () => {
    process.env.ESMO_BALANCE_SKILLS = "on";
    const PS = await import(pathToFileURL(path.join(ROOT, "tools", "lib", "phaseStudySim.mjs")).href);
    const fake = { phaseSecs: [480, 480, 480], blue: { objApps: { dragon: [1, 1, 1], baron: [1, 1, 1] }, objContested: { dragon: [0, 0, 0], baron: [0, 0, 0] }, objCaptured: { dragon: [0, 0, 0], baron: [0, 0, 0] },
      siegeOpens: [0, 0, 0], joinGoStarts: [0, 0, 0], joinGoGeneralStarts: [0, 0, 0], laneGeneralEntries: [0, 0, 0], engages: [0, 0, 0], engageStarts: [0, 0, 0], ganksOwn: { top: [1, 1, 1], mid: [1, 1, 1], bot: [1, 1, 1] } } };
    try { for (const o of REG.options) { if (!o.claims?.length) return false; for (const c of [...o.claims, ...(o.guards ?? [])]) { PS.studyMetricValue(fake, "blue", c.metric); if (c.fallbackMetric) PS.studyMetricValue(fake, "blue", c.fallbackMetric); } } return true; } catch { return false; }
  })()));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}
if (!REG) { console.error("需要 --reg=<登記檔>"); process.exit(2); }

const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const RULES = REG.rules;
const RESULT_FIXTURE = path.join(ROOT, REG.resultFixture);
const OPTIONS = REG.options;
const keysAll = () => ["ctrl", ...OPTIONS.flatMap((o) => ["blue", "red"].map((s) => `${o.id}@${s}`))];

// ── worker ──
if (flag("po-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const PS = await import(pathToFileURL(path.join(ROOT, "tools", "lib", "phaseStudySim.mjs")).href);
  const metricIds = [...new Set(OPTIONS.flatMap((o) => [...o.claims, ...(o.guards ?? [])].flatMap((c) => [c.metric, c.fallbackMetric].filter(Boolean))).concat(REG.reportedMetrics ?? [], REG.controlSymmetry?.metrics ?? []))];
  process.on("message", async (t) => {
    try {
      const ctrl = await PS.studyInput();
      const o = t.key === "ctrl" ? null : OPTIONS.find((x) => x.id === t.key.split("@")[0]), side = t.key.split("@")[1] ?? null;
      const arm = o ? await PS.studyInput(o.input?.choices ?? {}, o.input?.phaseChoices ?? null) : ctrl;
      const r = await PS.runPhaseStudyMatch(t.seed, { blue: side === "blue" ? arm : ctrl, red: side === "red" ? arm : ctrl, ruleset: RULESET });
      const vals = Object.fromEntries(["blue", "red"].map((s) => [s, Object.fromEntries(metricIds.map((id) => [id, PS.studyMetricValue(r, s, id)]))]));
      process.send({ type: "done", id: t.id, rec: { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, laneFrame: r.laneFrame, layers: r.layers, duration: r.duration, winner: r.winner, selfCheck: PS.selfCheck(r), vals } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

const fileOf = (dir, key) => path.join(dir, `${key.replace(/[|.@+]/g, "_")}.jsonl`);
const readJsonl = (f) => { const m = new Map(); if (!fs.existsSync(f)) return m; for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(o.seed, o.rec ?? o.error); } catch { /* 半行 */ } } return m; };
const readRecs = (dir, key) => readJsonl(fileOf(dir, key));
const readErrors = (dir, key) => readJsonl(fileOf(dir, `${key}.errors`));
const SV = await import(pathToFileURL(path.join(ROOT, "src", "platform", "contracts", "simulationVersion.js")).href);
const gitHead = () => { try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { return "unknown"; } };
const gitDirty = () => { try { return execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };
const provenance = () => ({ gitHead: gitHead(), dirtyFilesUnderSrcTools: gitDirty(), simulationVersion: SV.MOBA_SIMULATION_VERSION, fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] });
const recOk = (r) => r.ruleset === RULESET && r.directorMode === "core.v1" && r.laneFrame === "teamRelative" && LAYERS_OK(r.layers) && (r.selfCheck?.length ?? 1) === 0;
function opsState(dir) {
  let instrument = 0, finished = 0, errored = 0;
  for (const k of keysAll()) { for (const r of readRecs(dir, k).values()) { finished++; if (!recOk(r)) instrument++; } errored += readErrors(dir, k).size; }
  const attempted = finished + errored;
  return { instrument, finished, errored, breaker: errored > 20 || (attempted >= 1000 && errored > 0.005 * attempted) };
}
if (flag("plan")) { console.log(`${keysAll().length} 臂 × ${SEEDS.length} seeds = ${keysAll().length * SEEDS.length} 場`); process.exit(0); }

if (flag("run")) {
  const dir = val("dir");
  if (!dir || insideRepo(dir)) { console.error("--dir 必須是 repo 外的資料夾"); process.exit(2); }
  if (fs.existsSync(RESULT_FIXTURE)) { console.error("結果檔已存在：這份登記的 seeds 已觀察過，不得再跑。"); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools !== 0) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools} 個未提交變更：必須在已 commit 的程式上跑。`); process.exit(2); }
  const metaFile = path.join(dir, "meta.json");
  if (fs.existsSync(metaFile)) {
    const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (m.study !== REG.studyId || m.registration !== REG_REL || m.fingerprint !== prov.fingerprint || m.gitHead !== prov.gitHead) { console.error(`⚠ 這個資料夾在 ${m.study}／${m.gitHead}／${m.fingerprint} 下開始：不得混跑。`); process.exit(2); }
  } else fs.writeFileSync(metaFile, JSON.stringify({ study: REG.studyId, registration: REG_REL, startedAt: new Date().toISOString(), ...prov }, null, 2));
  const pre = opsState(dir);
  if (pre.instrument) { console.error(`⛔ 儀器不符 ${pre.instrument} 筆。`); process.exit(5); }
  if (pre.breaker) { console.error("⛔ 斷路器。"); process.exit(4); }
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
      const child = fork(SELF, ["--po-worker", `--reg=${REG_REL}`], { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let busy = null;
      const feed = () => { busy = null; if (fs.existsSync(path.join(dir, "STOP"))) stopped = true; if (stopped || halt || next >= tasks.length) { child.kill(); return; } busy = tasks[next++]; child.send(busy); };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = tasks.find((x) => x.id === m.id);
        if (m.type === "done") {
          fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
          finished++;
          if (!recOk(m.rec)) { halt = "instrument"; console.error(`⛔ 儀器不符 ${t.id}: ${JSON.stringify(m.rec.layers)} ${m.rec.laneFrame} ${(m.rec.selfCheck ?? []).join(" ｜ ")}`); }
          const pct = Math.floor((finished / tasks.length) * 20);
          if (pct !== lastPct) { lastPct = pct; const el = (Date.now() - t0) / 1000, per = el / finished; console.log(`${bar(finished, tasks.length)} ${String(Math.round((finished / tasks.length) * 100)).padStart(3)}%  ${finished}/${tasks.length} 場  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(((tasks.length - finished) * per) / 60).toFixed(1)} 分（${per.toFixed(2)} 秒/場，${workers} workers）`); }
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
  if (meta && (meta.study !== REG.studyId || meta.registration !== REG_REL)) { console.error("資料夾不是這份登記的批次（--reg 給錯了）。"); process.exit(2); }
  const ops = opsState(dir);
  const recs = new Map(keysAll().map((k) => [k, readRecs(dir, k)]));
  const errSeeds = new Set(keysAll().flatMap((k) => [...readErrors(dir, k).keys()]));
  const complete = keysAll().every((k) => SEEDS.every((s) => recs.get(k).has(s) || errSeeds.has(s)));
  const STUDY_PATHS = `src tools/lib/phaseStudySim.mjs tools/lib/tacticTruthSim.mjs tools/measure_phase_options_3c.mjs ${REG_REL} tools/balance`;
  const changed = meta && meta.gitHead !== prov.gitHead ? execSync(`git diff --name-only ${meta.gitHead} HEAD -- ${STUDY_PATHS}`, { cwd: ROOT }).toString().trim().split("\n").filter(Boolean) : [];
  const stale = !meta ? ["meta.json missing"] : meta.fingerprint !== prov.fingerprint || changed.length ? [`batch@${meta.gitHead}/${meta.fingerprint} (changed: ${changed.join(",")})`] : [];
  const ctrl = recs.get("ctrl");
  const statsFor = (key, side, metric) => pairStatsOf(SEEDS.filter((s) => !errSeeds.has(s) && ctrl.has(s) && recs.get(key).has(s)).map((s) => [ctrl.get(s).vals[side][metric], recs.get(key).get(s).vals[side][metric]]));
  const judgeable = complete && !ops.instrument && !ops.breaker && !stale.length;
  const rows = OPTIONS.map((o) => {
    let measurable = true;
    const claims = o.claims.map((c) => {
      const pick = (metric) => ({ metric, blue: statsFor(`${o.id}@blue`, "blue", metric), red: statsFor(`${o.id}@red`, "red", metric) });
      let x = pick(c.metric), usedFallback = false;
      if ((x.blue.n < RULES.minValidPairs || x.red.n < RULES.minValidPairs) && c.fallbackMetric) { x = pick(c.fallbackMetric); usedFallback = true; }
      if (x.blue.n < RULES.minValidPairs || x.red.n < RULES.minValidPairs) measurable = false;
      return { ...x, direction: c.direction, registeredMetric: c.metric, usedFallback, ok: { blue: cellOk(x.blue, c.direction, RULES), red: cellOk(x.red, c.direction, RULES) } };
    });
    const guards = (o.guards ?? []).map((c) => { const x = { metric: c.metric, blue: statsFor(`${o.id}@blue`, "blue", c.metric), red: statsFor(`${o.id}@red`, "red", c.metric) }; return { ...x, direction: c.direction, ok: { blue: cellOk(x.blue, c.direction, RULES), red: cellOk(x.red, c.direction, RULES) } }; });
    //  守門也要有足夠配對：量不到的守門不能默默放行（審查 2026-10-22 #5）。
    if (guards.some((g) => g.blue.n < RULES.minValidPairs || g.red.n < RULES.minValidPairs)) measurable = false;
    const reported = (REG.reportedMetrics ?? []).filter((m) => (o.report ?? []).includes(m)).map((m) => ({ metric: m, blue: statsFor(`${o.id}@blue`, "blue", m), red: statsFor(`${o.id}@red`, "red", m) }));
    return { id: o.id, dimension: o.dimension, choice: o.choice, phase: o.phase ?? null, verdict: judgeable ? verdictOf({ measurable, claims, guards }, RULES) : null, claims, guards, reported };
  });
  const flags = [];
  if (ops.instrument) flags.push(`STOP(INSTRUMENT): ${ops.instrument}`);
  if (ops.breaker) flags.push(`STOP(CIRCUIT_BREAKER): ${ops.errored}`);
  if (stale.length) flags.push(`STALE: ${stale.join(", ")}`);
  //  對照組兩側對稱（登記檔 controlSymmetry，選用）：己方視角的計數，對照組藍紅平均差超過容許值 ⇒ 計數可能有錯，標記；判定照算，登記檔寫明晉升前要先查儀器。
  const controlSymmetry = (REG.controlSymmetry?.metrics ?? []).map((m) => {
    const v = (s) => SEEDS.filter((x) => !errSeeds.has(x) && ctrl.has(x)).map((x) => ctrl.get(x).vals[s][m]).filter((x) => x !== null);
    const mean = (a) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : null), b = mean(v("blue")), r = mean(v("red"));
    const diff = b === null || r === null ? null : r - b;
    return { metric: m, blue: b, red: r, diff, ok: diff !== null && Math.abs(diff) <= REG.controlSymmetry.maxAbsDiff };
  });
  const asym = controlSymmetry.filter((x) => !x.ok);
  if (asym.length) flags.push(`CONTROL_ASYMMETRY (> ${REG.controlSymmetry.maxAbsDiff}): ${asym.map((x) => `${x.metric} ${x.blue?.toFixed(3)}/${x.red?.toFixed(3)}`).join(", ")} — instrument check required before any promotion`);
  const conf = rows.filter((r) => r.verdict === "confirmed").map((r) => r.id);
  if (conf.length) flags.push(`OWNER_DECISION: confirmed ${conf.join(", ")} — promotion to live follows the Registry/truth-table rules, Owner decides`);
  const result = { schema: "esmo.phase-options-result.v1", registration: REG_REL, studyId: REG.studyId, reportedAt: new Date().toISOString(), ...prov, batchStartedUnder: meta, stale, complete,
    finishedMatches: ops.finished, erroredMatches: ops.errored, erroredSeeds: [...errSeeds], instrumentMismatch: ops.instrument, rules: RULES, rows, controlSymmetry, flags,
    summary: Object.fromEntries(rows.map((r) => [r.id, r.verdict])) };
  const f = (x, d = 3) => (x == null ? "—" : Number(x).toFixed(d));
  console.log(`${REG.studyId}：完整 ${complete}、完成 ${ops.finished}、失敗 ${ops.errored}、儀器不符 ${ops.instrument}${stale.length ? "、STALE" : ""}`);
  for (const r of rows) {
    console.log(`  ${r.id} ⇒ ${r.verdict ?? "（未判定）"}`);
    for (const c of [...r.claims, ...r.guards.map((g) => ({ ...g, guard: true }))]) for (const s of ["blue", "red"]) { const st = c[s]; console.log(`     ${c.guard ? "守門 " : ""}${s.padEnd(4)} ${c.metric.padEnd(30)} n ${st.n} ctrl ${f(st.meanA)} → ${f(st.meanB)} rel ${st.rel == null ? "—" : (st.rel * 100).toFixed(1)}% z ${f(st.z, 2)}${c.usedFallback ? "（合併後備）" : ""}`); }
  }
  for (const x of flags) console.log(`  ⚑ ${x}`);
  const out = val("out");
  if (out) { if (insideRepo(out)) { console.error("--out 必須在 repo 外"); process.exit(2); } fs.writeFileSync(out, JSON.stringify(result, null, 2)); process.exit(0); }
  if (!judgeable && !(complete && (ops.instrument || ops.breaker))) { console.error("未完整或過期：不寫結果檔（中途用 --out）。"); process.exit(2); }
  const dirtyStudy = execSync(`git status --porcelain -- ${STUDY_PATHS}`, { cwd: ROOT }).toString().trim();
  if (dirtyStudy) { console.error(`量測相關檔案有未提交變更，不寫結果檔：\n${dirtyStudy}`); process.exit(2); }
  if (fs.existsSync(RESULT_FIXTURE)) { console.error("結果檔已存在，永不覆寫。"); process.exit(2); }
  fs.writeFileSync(RESULT_FIXTURE, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`寫入 ${path.relative(ROOT, RESULT_FIXTURE)}`);
  process.exit(0);
}
if (!flag("po-worker")) { console.error("用法見檔頭"); process.exit(2); }
