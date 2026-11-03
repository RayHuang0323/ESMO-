// ============================================================================
//  tools/measure_phase_stance_c3.mjs — Phase 3a-C3-2：時期姿態的事前登記研究（不是 gate；背景單線、可續跑）
//
//  事前登記：tools/fixtures/phase_stance_registration_c3_2.json（＋ review/tactic-book-3a/C3-2_時期姿態事前登記.md）。
//  本檔只照那份登記執行與判讀；seeds、指標、門檻都從登記檔讀，不在這裡另寫一份。
//
//  用法（長任務一律單線；workers ≤ 3；批次寫在 repo 之外；建立 <dir>/STOP 檔即在下一場前停下，同一指令續跑）：
//    node tools/measure_phase_stance_c3.mjs --run --dir=<repo 外的資料夾> [--workers=3]
//        結束碼：0 完成／3 依 STOP 暫停／4 斷路器／5 儀器不符（STOP 交 Owner）／6 未完整（worker 中途結束等；同一指令續跑）
//    node tools/measure_phase_stance_c3.mjs --report --dir=<同一資料夾> [--out=<repo 外的路徑>]
//        批次完整（或被 STOP(INSTRUMENT／斷路器) 停下）才寫 tools/fixtures/phase_stance_result_c3_2.json；只寫一次、永不覆寫。
//        中途報告一律 --out 寫到 repo 外。
//    node tools/measure_phase_stance_c3.mjs --selftest      判定函式的單元自檢（不跑模擬）
//    node tools/measure_phase_stance_c3.mjs --plan          印出批次數
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
//  --reg＝登記檔（repo 內相對路徑）；預設是第一次的登記。修正複驗（rev1）另有登記檔，結果檔名由登記檔的 resultFixture 指定。
const REG_FILE = path.join(ROOT, val("reg", "tools/fixtures/phase_stance_registration_c3_2.json"));
const REG = JSON.parse(fs.readFileSync(REG_FILE, "utf8"));
const RESULT_FIXTURE = path.join(ROOT, REG.resultFixture ?? "tools/fixtures/phase_stance_result_c3_2.json");
const STUDY_ID = REG.studyId ?? "phase-stance-c3-2";
//  儀器的層（G-A7／複驗慣例：英雄技能開、戰鬥天賦關）。每筆紀錄必須相符，否則 STOP(INSTRUMENT)。
//  ⚠ 第一次研究（phase_stance_result_c3_2.json）沒有這一條、而且 worker 沒設 ESMO_BALANCE_SKILLS ⇒ 在技能關閉下跑完（rev1 登記揭露）。
const LAYERS_OK = (L) => !!L && L.heroSkills === true && L.heroPassives === true && L.heroPowerCurve === true && L.battleTalents === false;
const REG_REL = path.relative(ROOT, REG_FILE).replaceAll("\\", "/");
const RULESET = "balanceTool.v21";
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const MIN_N = REG.rules.minValidPairs;
const Z_MIN = 3, REL_MIN = 0.05;
const OPTIONS = REG.options;
const optKey = (side, o) => `${side}|${o.dimension}|${o.choice}`;
const METRICS_OF = (o) => [`engageDecisionsPerMin.${o.phase}`, `engageStartsPerMin.${o.phase}`];

// ── worker ──────────────────────────────────────────────────────────────────
if (flag("ps-worker")) {
  //  runner 在第一次 modules() 讀這兩個變數 ⇒ 必須在 import 儀器之前設好（G-A7 慣例：skills on、talents off）。
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const PB = await import(pathToFileURL(path.join(ROOT, "tools", "lib", "phaseBucketSim.mjs")).href);
  process.on("message", async (t) => {
    try {
      //  兩側一律走同一條 legacy 路徑：對手（以及對照組的兩側）＝std 模板不加選擇（內容＝STANDARD_OPP_TACTIC）。
      const ctrlArm = await PB.phaseStanceArm(null, null);
      const arm = t.dim ? await PB.phaseStanceArm(t.dim, t.choice) : ctrlArm;
      const spec = t.armSide === "red" ? { red: arm, blue: ctrlArm } : t.armSide === "blue" ? { blue: arm, red: ctrlArm } : { blue: ctrlArm, red: ctrlArm };
      const r = await PB.runPhaseMatch(t.seed, { ...spec, ruleset: RULESET });
      const problems = PB.selfCheck(r);
      const slim = (s) => ({ engages: s.engages, engageStarts: s.engageStarts });
      process.send({ type: "done", id: t.id, rec: { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, layers: r.layers, duration: r.duration, winner: r.winner,
        phaseSecs: r.phaseSecs, blue: slim(r.blue), red: slim(r.red), selfCheck: problems } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 判定（純函式；--selftest 測它）────────────────────────────────────────────
/** 配對統計（同 tacticTruthSim.pairStats 的定義；這裡只取需要的欄位）。pairs＝[control, treatment]，只計兩邊都有值的。 */
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
/** 一側一指標：依方向的 z（zDir）與是否達標。 */
export function metricOk(st, direction) {
  const sgn = direction === "up" ? 1 : -1;
  const zDir = st.z === null ? null : st.z * sgn;
  const ok = st.n >= MIN_N && st.diff !== null && Math.sign(st.diff) === sgn && zDir >= Z_MIN && st.rel !== null && Math.abs(st.rel) >= REL_MIN;
  return { zDir, ok };
}
/** 一個選項的判定。cells＝{ blue: [primary, startOnly], red: [...] }，每格 { n, diff, z, rel }。 */
export function verdictOf(cells, direction) {
  const all = ["blue", "red"].flatMap((s) => cells[s]);
  if (all.some((c) => c.n < MIN_N)) return "n_insufficient";
  const m = { blue: cells.blue.map((c) => metricOk(c, direction)), red: cells.red.map((c) => metricOk(c, direction)) };
  if (["blue", "red"].some((s) => m[s].some((x) => x.zDir !== null && x.zDir <= -Z_MIN))) return "reversed";
  const sidePass = (s) => m[s][0].ok && m[s][1].ok;
  if (sidePass("blue") && sidePass("red")) return "confirmed";
  if (m.blue[0].ok && m.red[0].ok) return "duty_cycle_only";
  if (sidePass("blue") || sidePass("red")) return "one_sided";
  return "insufficient";
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const c = (n, diff, z, rel) => ({ n, diff, z, rel });
  const good = c(400, 0.2, 5, 0.1), goodDown = c(400, -0.2, -5, -0.1);
  ck("V1 兩側兩指標都達標（up）⇒ confirmed", verdictOf({ blue: [good, good], red: [good, good] }, "up") === "confirmed");
  ck("V2 down 方向：負的差異才算達標", verdictOf({ blue: [goodDown, goodDown], red: [goodDown, goodDown] }, "down") === "confirmed" && verdictOf({ blue: [good, good], red: [good, good] }, "down") === "reversed");
  ck("V3 只數開始的指標在一側不過 ⇒ duty_cycle_only", verdictOf({ blue: [good, c(400, 0.2, 2.5, 0.1)], red: [good, good] }, "up") === "duty_cycle_only");
  ck("V4 一側兩指標都過、另一側主指標不過 ⇒ one_sided", verdictOf({ blue: [good, good], red: [c(400, 0.1, 2, 0.04), good] }, "up") === "one_sided");
  ck("V5 |Δ| < 5 % ⇒ 不達標（z 再大也一樣）", verdictOf({ blue: [c(400, 0.01, 9, 0.04), good], red: [good, good] }, "up") === "one_sided");
  ck("V6 任一格依方向 z ≤ −3 ⇒ reversed（蓋過其他）", verdictOf({ blue: [good, good], red: [good, c(400, -0.2, -3.1, -0.1)] }, "up") === "reversed");
  ck("V7 任一格 n < 200 ⇒ n_insufficient（不給統計判定）", verdictOf({ blue: [good, good], red: [c(199, 0.2, 5, 0.1), good] }, "up") === "n_insufficient");
  ck("V8 兩側都沒達標、沒有反向 ⇒ insufficient", verdictOf({ blue: [c(400, 0.1, 1, 0.01), c(400, 0.1, 1, 0.01)], red: [c(400, -0.1, -2.9, -0.01), c(400, 0, 0, 0)] }, "up") === "insufficient");
  ck("V9 z 剛好 3、|Δ| 剛好 5 % ⇒ 達標（門檻是 ≥）", metricOk(c(400, 0.05, 3, 0.05), "up").ok && !metricOk(c(400, 0.05, 2.999, 0.05), "up").ok);
  const st = pairStatsOf([[1, 2], [2, 3], [null, 5], [3, 5]]);
  ck("V10 配對統計只計兩邊都有值的 seed；rel＝diff／對照組平均", st.n === 3 && Math.abs(st.diff - 4 / 3) < 1e-12 && Math.abs(st.rel - (4 / 3) / 2) < 1e-12);
  ck(`V11 登記檔（${path.relative(ROOT, REG_FILE)}）：8 個選項、seeds ${REG.seeds.range}（n ${REG.seeds.n}）、最少有效配對 200、規則集 balanceTool.v21`,
    OPTIONS.length === 8 && SEEDS.length === REG.seeds.n && SEEDS[0] === S0 && MIN_N === 200 && /^balanceTool\.v21/.test(REG.design.ruleset));
  ck("V12 儀器層檢查：技能／被動／成長曲線開、天賦關才算相符；缺欄位（第一次研究的紀錄）＝不符",
    LAYERS_OK({ heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: false }) && !LAYERS_OK({ heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false }) && !LAYERS_OK({ heroSkills: true, heroPassives: true, heroPowerCurve: true, battleTalents: true }) && !LAYERS_OK({ heroSkills: true, heroPassives: false, heroPowerCurve: true, battleTalents: false }) && !LAYERS_OK(undefined));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 批次 ────────────────────────────────────────────────────────────────────
const keysAll = () => ["ctrl", ...OPTIONS.flatMap((o) => ["blue", "red"].map((s) => optKey(s, o)))];
const taskOf = (key, seed) => {
  if (key === "ctrl") return { id: `${key}#${seed}`, key, seed, armSide: "both", dim: null, choice: null };
  const [side, dim, choice] = key.split("|");
  return { id: `${key}#${seed}`, key, seed, armSide: side, dim, choice };
};
const fileOf = (dir, key) => path.join(dir, `${key.replace(/[|.]/g, "_")}.jsonl`);
const readRecs = (dir, key) => {
  const f = fileOf(dir, key), m = new Map();
  if (!fs.existsSync(f)) return m;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) { if (!line.trim()) continue; try { const o = JSON.parse(line); m.set(o.seed, o.rec); } catch { /* 中斷時寫了一半的最後一行：當作沒做 */ } }
  return m;
};
const readErrors = (dir, key) => {
  const f = fileOf(dir, `${key}.errors`), m = new Map();
  if (!fs.existsSync(f)) return m;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) { if (!line.trim()) continue; try { const o = JSON.parse(line); m.set(o.seed, o.error); } catch { /* 半行 */ } }
  return m;
};
const SV = await import(pathToFileURL(path.join(ROOT, "src", "platform", "contracts", "simulationVersion.js")).href);
const gitHead = () => { try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) { return `unknown (${String(e?.message ?? e).slice(0, 60)})`; } };
const gitDirty = () => { try { return execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };
const provenance = () => ({ gitHead: gitHead(), dirtyFilesUnderSrcTools: gitDirty(), simulationVersion: SV.MOBA_SIMULATION_VERSION,
  fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] });

/** 營運狀態：儀器不符筆數、失敗場數、已完成場數。 */
function opsState(dir) {
  let instrument = 0, finished = 0, errored = 0;
  for (const k of keysAll()) {
    for (const r of readRecs(dir, k).values()) { finished++; if (r.ruleset !== RULESET || r.directorMode !== "core.v1" || !LAYERS_OK(r.layers) || (r.selfCheck?.length ?? 1) > 0) instrument++; }
    errored += readErrors(dir, k).size;
  }
  const P = REG.stopLoss;
  //  登記 stopLoss：失敗 > 20 場；或已嘗試 ≥ 1000 場之後失敗率 > 0.5 %（只在樣本夠大時看比率，避免開頭一場暫時性錯誤就永久跳開）。
  const attempted = finished + errored;
  const breaker = errored > 20 || (attempted >= 1000 && errored > 0.005 * attempted);
  return { instrument, finished, errored, breaker, why: P.operationalStops };
}

//  Windows 路徑不分大小寫 ⇒ 比較前一律小寫、加結尾分隔符。
const insideRepo = (p) => { const a = path.resolve(p).toLowerCase(), r = ROOT.toLowerCase(); return a === r || a.startsWith(r + path.sep); };

if (flag("plan")) { console.log(`${keysAll().length} 臂 × ${SEEDS.length} seeds = ${keysAll().length * SEEDS.length} 場`); process.exit(0); }

if (flag("run")) {
  const dir = val("dir");
  if (!dir || insideRepo(dir)) { console.error("--dir 必須是 repo 外的資料夾"); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools !== 0) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools ?? "?"} 個未提交變更：正式研究必須在已 commit 的程式上跑。`); process.exit(2); }
  //  這份登記已經有結果檔 ⇒ 它的 seeds 已被觀察，不得再跑（換新 seeds 要另立登記）。
  if (fs.existsSync(RESULT_FIXTURE)) { console.error(`${path.relative(ROOT, RESULT_FIXTURE)} 已存在：${REG_REL} 的 seeds 已觀察過，不得再跑。`); process.exit(2); }
  const metaFile = path.join(dir, "meta.json");
  if (fs.existsSync(metaFile)) {
    const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (m.study !== STUDY_ID || String(m.registration ?? "").replaceAll("\\", "/") !== REG_REL) { console.error(`⚠ 這個資料夾是 ${m.study}／${m.registration} 的批次，不是 ${STUDY_ID}／${REG_REL}：不得混跑。`); process.exit(2); }
    if (m.fingerprint !== prov.fingerprint || m.gitHead !== prov.gitHead) { console.error(`⚠ 這個資料夾的批次在 ${m.gitHead}／${m.fingerprint} 下開始，目前是 ${prov.gitHead}／${prov.fingerprint}：不得混跑。`); process.exit(2); }
  } else fs.writeFileSync(metaFile, JSON.stringify({ study: STUDY_ID, startedAt: new Date().toISOString(), ...prov, registration: REG_REL }, null, 2));
  const pre = opsState(dir);
  if (pre.instrument) { console.error(`⛔ 儀器不符：已有 ${pre.instrument} 筆紀錄的規則集／Director／自檢不符 ⇒ STOP 交 Owner。`); process.exit(5); }
  if (pre.breaker) { console.error(`⛔ 斷路器：失敗 ${pre.errored} 場 ⇒ STOP 交 Owner。`); process.exit(4); }
  //  依 seed 遞增排隊（同一 seed 的 17 場排在一起）；已完成或已記為失敗的跳過。
  const done = new Map(keysAll().map((k) => [k, readRecs(dir, k)])), errs = new Map(keysAll().map((k) => [k, readErrors(dir, k)]));
  const tasks = [];
  for (const seed of SEEDS) for (const k of keysAll()) if (!done.get(k).has(seed) && !errs.get(k).has(seed)) tasks.push(taskOf(k, seed));
  const workers = Math.max(1, Math.min(3, Number(val("workers", 3))));
  const t0 = Date.now();
  let next = 0, finished = 0, failed = 0, stopped = false, halt = null, lastPct = -1, instrumentBad = 0, lost = 0;
  const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
  const total = keysAll().length * SEEDS.length;
  console.log(`待跑 ${tasks.length}／${total} 場（${keysAll().length} 臂），workers=${workers}，資料夾 ${dir}`);
  if (tasks.length) await new Promise((resolveAll) => {
    let alive = 0;
    const spawn = () => {
      const child = fork(SELF, ["--ps-worker"], { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let busy = null;
      const feed = () => {
        busy = null;
        if (fs.existsSync(path.join(dir, "STOP"))) stopped = true;
        if (stopped || halt || next >= tasks.length) { child.kill(); return; }
        busy = tasks[next++];
        child.send(busy);
      };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = tasks.find((x) => x.id === m.id);
        if (m.type === "done") {
          fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
          finished++;
          if (m.rec.ruleset !== RULESET || m.rec.directorMode !== "core.v1" || !LAYERS_OK(m.rec.layers) || m.rec.selfCheck.length) { instrumentBad++; halt = "instrument"; console.error(`⛔ 儀器不符 ${t.id}: ${m.rec.ruleset}/${m.rec.directorMode} layers ${JSON.stringify(m.rec.layers)} ${m.rec.selfCheck.join(" ｜ ")}`); }
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
      //  worker 在場次進行中死掉（記憶體保護、OOM）⇒ 那一場沒有紀錄也沒有錯誤：記成「遺失」，結束時回報未完整（續跑會補）。
      child.on("exit", () => { if (busy) { lost++; console.error(`⚠ worker 中途結束，遺失 ${busy.id}（續跑會補）`); busy = null; } alive--; if (alive === 0) resolveAll(); });
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) spawn();
  });
  const el = (Date.now() - t0) / 1000;
  console.log(`本輪 ${finished} 場、失敗 ${failed}，${(el / 60).toFixed(1)} 分${stopped ? "；依 STOP 停止（再執行同一指令會續跑）" : ""}`);
  if (halt === "instrument" || instrumentBad) { console.error("⛔ STOP(INSTRUMENT) 交 Owner。"); process.exit(5); }
  if (halt === "breaker") { console.error("⛔ STOP(CIRCUIT_BREAKER) 交 Owner。"); process.exit(4); }
  if (stopped) process.exit(3);
  //  完成與否以磁碟上的紀錄重算（不信任本輪計數）：還有沒跑的場次 ⇒ 結束碼 6（未完整，同一指令續跑）。
  const left = SEEDS.length * keysAll().length - keysAll().reduce((n, k) => n + readRecs(dir, k).size + readErrors(dir, k).size, 0);
  if (left > 0 || lost > 0) { console.error(`⚠ 批次未完整：還有 ${left} 場沒有紀錄（遺失 ${lost}）⇒ 結束碼 6，同一指令續跑。`); process.exit(6); }
  process.exit(0);
}

if (flag("report")) {
  const dir = val("dir");
  if (!dir) { console.error("--report 需要 --dir"); process.exit(2); }
  const PB = await import(pathToFileURL(path.join(ROOT, "tools", "lib", "phaseBucketSim.mjs")).href);
  const prov = provenance();
  const metaF = path.join(dir, "meta.json"), meta = fs.existsSync(metaF) ? JSON.parse(fs.readFileSync(metaF, "utf8")) : null;
  if (meta && (meta.study !== STUDY_ID || String(meta.registration ?? "").replaceAll("\\", "/") !== REG_REL)) { console.error(`⚠ 這個資料夾是 ${meta.study}／${meta.registration} 的批次，不是 ${STUDY_ID}／${REG_REL}：--reg 給錯了。`); process.exit(2); }
  const ops = opsState(dir);
  const recs = new Map(keysAll().map((k) => [k, readRecs(dir, k)]));
  const errSeeds = new Set(keysAll().flatMap((k) => [...readErrors(dir, k).keys()]));
  const complete = keysAll().every((k) => SEEDS.every((s) => recs.get(k).has(s) || errSeeds.has(s)));
  const halted = ops.instrument > 0 || ops.breaker;
  const ctrl = recs.get("ctrl");
  //  過期：批次開跑時的 gitHead 與目前之間 src 有差異、或指紋不同；meta 遺失也算（來源不可追溯）⇒ 不給判定、不寫結果檔。
  //  被量測的程式＝src（模擬語意）＋這個研究自己的儀器、工具與登記檔（結果檔本身除外）。
  const STUDY_PATHS = `src tools/lib/phaseBucketSim.mjs tools/lib/tacticTruthSim.mjs tools/measure_phase_stance_c3.mjs ${path.relative(ROOT, REG_FILE).replaceAll("\\", "/")} tools/balance/moba_items_balance_runner.mjs`;
  const srcChanged = meta && meta.gitHead !== prov.gitHead ? execSync(`git diff --name-only ${meta.gitHead} HEAD -- ${STUDY_PATHS}`, { cwd: ROOT }).toString().trim().split("\n").filter(Boolean) : [];
  const stale = !meta ? ["meta.json missing (provenance unknown)"] : meta.fingerprint !== prov.fingerprint || srcChanged.length ? [`batch@${meta.gitHead}/${meta.fingerprint} (src changed: ${srcChanged.length})`] : [];
  const judgeable = complete && !halted && stale.length === 0;
  const rows = OPTIONS.map((o) => {
    const cells = {};
    for (const side of ["blue", "red"]) {
      const tr = recs.get(optKey(side, o));
      cells[side] = METRICS_OF(o).map((id) => {
        const pairs = SEEDS.filter((s) => !errSeeds.has(s) && ctrl.has(s) && tr.has(s)).map((s) => [PB.phaseMetricValue(ctrl.get(s), side, id), PB.phaseMetricValue(tr.get(s), side, id)]);
        const st = pairStatsOf(pairs);
        const { zDir, ok } = metricOk(st, o.direction);
        return { metric: id, side, ...st, nNA: pairs.length - st.n, zDir, ok };
      });
    }
    return { dimension: o.dimension, choice: o.choice, phase: o.phase, direction: o.direction, verdict: judgeable ? verdictOf(cells, o.direction) : null, cells };
  });
  const flags = [];
  if (ops.instrument) flags.push(`STOP(INSTRUMENT): ${ops.instrument} records`);
  if (ops.breaker) flags.push(`STOP(CIRCUIT_BREAKER): ${ops.errored} errored matches`);
  if (stale.length) flags.push(`STALE: ${stale.join(", ")}`);
  const nIns = rows.filter((r) => r.verdict === "n_insufficient");
  const conf = rows.filter((r) => r.verdict === "confirmed");
  if (conf.length) flags.push(`OWNER_DECISION: ${conf.map((r) => `${r.dimension}=${r.choice}`).join(", ")} confirmed — whether to offer them to players (MEASURED_EXCLUSIONS must equal the G-A7 truth table) is the Owner's decision; not changed in this round`);
  if (nIns.length) flags.push(`N_INSUFFICIENT: ${nIns.map((r) => `${r.dimension}=${r.choice}`).join(", ")} — keep the checkpoint, Owner decides on a new seed range`);
  const result = {
    schema: "esmo.phase-stance-result.v1", registration: path.relative(ROOT, REG_FILE).replaceAll("\\", "/"), reportedAt: new Date().toISOString(),
    ...prov, batchStartedUnder: meta, stale, seeds: REG.seeds.range, complete, halted, finishedMatches: ops.finished, erroredMatches: ops.errored, erroredSeeds: [...errSeeds],
    instrumentMismatch: ops.instrument, rules: REG.rules, rows, flags,
    summary: Object.fromEntries(rows.map((r) => [`${r.dimension}=${r.choice}`, r.verdict])),
  };
  const fmt = (x, d = 3) => (x === null || x === undefined ? "—" : Number(x).toFixed(d));
  console.log(`phase stance C3-2：完整 ${complete}、停下 ${halted}、完成 ${ops.finished} 場、失敗 ${ops.errored}、儀器不符 ${ops.instrument}`);
  for (const r of rows) {
    console.log(`  ${r.dimension}=${r.choice} (${r.direction}) ⇒ ${r.verdict ?? "（未判定）"}`);
    for (const c of [...r.cells.blue, ...r.cells.red]) console.log(`     ${c.side.padEnd(4)} ${c.metric.padEnd(30)} n ${c.n}（N/A ${c.nNA}）ctrl ${fmt(c.meanA)} → ${fmt(c.meanB)}  Δ ${fmt(c.diff)}  rel ${fmt(c.rel === null ? null : c.rel * 100, 1)}%  z ${fmt(c.z, 2)} ${c.ok ? "✓" : "✗"}`);
  }
  for (const f of flags) console.log(`  ⚑ ${f}`);
  const out = val("out");
  if (out) { if (insideRepo(out)) { console.error("--out 必須在 repo 外"); process.exit(2); } fs.writeFileSync(out, JSON.stringify(result, null, 2)); console.log(`寫入 ${out}`); process.exit(0); }
  if (stale.length) { console.error(`批次過期或來源不明（${stale.join(", ")}）：不給判定、不寫結果檔；只能用 --out 寫到 repo 外。`); process.exit(2); }
  if (!complete && !halted) { console.error("批次未完整也沒有 STOP：不寫結果檔。中途報告請用 --out=<repo 外的路徑>。"); process.exit(2); }
  if (fs.existsSync(RESULT_FIXTURE)) { console.error(`${path.relative(ROOT, RESULT_FIXTURE)} 已存在：結果檔只寫一次、永不覆寫。`); process.exit(2); }
  fs.writeFileSync(RESULT_FIXTURE, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`寫入 ${path.relative(ROOT, RESULT_FIXTURE)}（gitHead ${prov.gitHead}、指紋 ${prov.fingerprint}${stale.length ? "、STALE" : ""}）`);
  process.exit(0);
}

if (!flag("ps-worker")) { console.error("用法見檔頭：--run／--report／--selftest／--plan"); process.exit(2); }
