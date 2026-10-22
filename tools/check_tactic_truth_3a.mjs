// ============================================================================
//  tools/check_tactic_truth_3a.mjs — G-A7：每一個 live 選項在真實模擬裡都有「量得到」的效果（Phase 3a T10）
//
//  兩種模式：
//    node tools/check_tactic_truth_3a.mjs                快速（秒級）：驗證已提交的結果表 tools/fixtures/tactic_truth_3a.json
//    node tools/check_tactic_truth_3a.mjs --measure      長（約 1.5–2 小時，workers ≤ 3，可續跑）：從模擬重新產生結果表
//        --pilot                 先跑小樣本（2 個選擇 × 5 seeds）量每場耗時並估算全程，不寫結果表
//        --dir=<資料夾>          批次結果（每批一個 .jsonl，逐場追加）；預設在系統暫存區，**不要放進 repo**（OneDrive 會殺行程）
//        --workers=<1–3>         上限 3（6 會被作業系統的記憶體保護砍掉，整批結果全失）
//        --plan                  只印量測計畫（批次數、每批比較什麼）
//        --finish                批次都齊了就寫結果表（--measure 跑完會自動做；中斷後可單獨執行）
//        --report                把結果表印成表格（報告用）
//      停止：在 --dir 裡建一個叫 STOP 的檔案，目前批次跑完就收工；再執行 --measure 會從沒做完的批次續跑。
//      ⚠ 重新量測前先把 capabilityRegistry.js 的 MEASURED_EXCLUSIONS 清空（被排除的選擇 createTacticPlan 會拒絕，無法模擬）；
//        量完用結果表印出的 exclusionsDerived 重新填回，再跑一次快速模式。
//
//  ── 量測設計（事前登記在 capabilityRegistry.js 的 gate；指標定義在 tools/lib/tacticTruthSim.mjs；計畫在 tacticTruthPlan.mjs）──
//   · 固定 seeds 1–40、鏡像名單、balance runner（skills on、items standard）；配對＝同 seed，只有「那一個選擇」在一側不同，另一側永遠是 std。
//   · 每個選擇都在 std 上量（主要），再在「旋鈕差距最小的非 std 模板」上量（弱點）；藍方為主，紅方量一個事前固定的子集。
//   · 通過＝方向與宣稱一致且配對 z ≥ 2；2 ≤ z < 3 標為邊緣（marginal）。不重跑、不換 seeds、不丟 seed、不看結果換指標。
//   · 兩側指標都有值的 seed 才進配對（例如後期階段不足 60 秒的場次沒有「後期參團率」）——規則事前固定，n 如實列在表上。
//   · 沒通過的不放大係數：std 上量不到 ⇒ 該選擇對所有模板不提供（MEASURED_EXCLUSIONS 的 template "*"，等於退回 design）；
//     只在弱點模板量不到 ⇒ 只對那個模板不提供。紅方量不到只列為「不對稱」（不排除）。
//
//  快速模式的檢查：結果表沒有過期（模擬版本、對照表、Registry 的 live 列、量測程式的雜湊相同；量測 worker 載入過的每個檔案都在且內容相同；探針場次沒載入新檔案）、
//  計畫要求的每一批都有列、事前登記的指標與方向沒被改過、z 由原始配對值重算、每個選擇通過或已被排除、排除表與結果表一致、
//  排除表與 offeredChoices 一致、帶線者留在線上的實測比例有數字；另有負向對照（竄改一個數字、改對照表雜湊、少一列、改方向都必須被抓到）。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as Prov from "./lib/tacticMeasureProvenance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const FIXTURE = path.join(ROOT, "tools/fixtures/tactic_truth_3a.json");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const MAX_WORKERS = 3;

// ════════════════════════════════════════════════════════════════════════════
//   worker：單場模擬（--measure 的子行程）
// ════════════════════════════════════════════════════════════════════════════
//  量測程式（tacticTruthSim）必須在 hook 註冊之後才載入，worker 才記得到它依賴的每一個檔案。
const stopRecording = flag("truth-worker") ? Prov.installLoadRecorder() : null;
const { isKnownMetric, metricValue, pairStats, runTruthMatch, TRUTH_SIM_VERSION } = await import("./lib/tacticTruthSim.mjs");
if (stopRecording) {
  const loaded = stopRecording;
  process.on("message", async (t) => {
    if (t?.type !== "run") return;
    try {
      const rec = await runTruthMatch(t.seed, { blue: t.blue, red: t.red, items: "standard" });
      process.send({ type: "done", id: t.id, rec, files: loaded() });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
} else {
  await main();
}

async function main() {
  const Registry = await import("../src/platform/tactics/capabilityRegistry.js");
  const Mapping = await import("../src/platform/tactics/tacticChoiceMapping.js");
  const Plan = await import("./lib/tacticTruthPlan.mjs");
  const { TRUTH_GATE } = Registry;
  const SEEDS = Array.from({ length: TRUTH_GATE.seedTo - TRUTH_GATE.seedFrom + 1 }, (_, i) => TRUTH_GATE.seedFrom + i);

  // ── 雜湊（過期偵測）：實作在 tools/lib/tacticMeasureProvenance.mjs（與 measure_tactic_followup_3a 共用）──────
  //  過期判定是依賴式：結果表記下量測 worker 實際載入的每個 repo 檔案（meta.loadedFiles）；沒載入的語意檔改了不會讓它過期。
  //  Registry／tacticChoiceMapping／tacticResolver 的文字改動由 registryHash／mappingHash／resolvedHash（行為雜湊）管。
  const currentHashes = Prov.currentHashes;
  const WORKER_ENTRY = SELF;
  const PROBE_SEED = TRUTH_GATE.seedFrom;

  // ── 統計與判定（快速模式與 --measure 共用）─────────────────────────────────
  const r6 = (v) => (v === null || v === undefined ? null : Number(Number(v).toFixed(6)));
  const verdictOf = (st, direction) => {
    if (st.z === null || st.n < 20) return "unmeasurable";
    const zd = st.z * (direction === "up" ? 1 : -1);
    return zd >= TRUTH_GATE.marginalBelowZ ? "pass" : zd >= TRUTH_GATE.minZ ? "marginal" : zd <= -TRUTH_GATE.minZ ? "reversed" : "fail";
  };
  const isOk = (v) => v === "pass" || v === "marginal";
  const SUPERSEDING = ["tools/fixtures/phase_stance_result_c3_2_rev1.json"];
  const supersededKeys = new Set(SUPERSEDING.flatMap((rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")).rows.map((r) => `${r.dimension}=${r.choice}`)));
  //  只有 std 的主要列會被取代（複驗量的是 std＋那一個時期選擇）。
  const superseded = (r) => r.role === "primary" && r.template === "std" && supersededKeys.has(`${r.dimension}=${r.choice}`);
  const SUPERSEDING_SHAPE = SUPERSEDING.map((rel) => { const f = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    return `${rel}: complete=${f.complete} halted=${f.halted} stale=${JSON.stringify(f.stale)} errored=${f.erroredMatches} instrument=${f.instrumentMismatch} rows=${f.rows?.length}`; });
  const supersedingOk = SUPERSEDING.every((rel) => { const f = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    return f.complete === true && f.halted === false && Array.isArray(f.stale) && f.stale.length === 0 && f.erroredMatches === 0 && f.instrumentMismatch === 0 && Array.isArray(f.rows) && f.rows.length > 0; });
  const statsOfPairs = (pairs) => { const s = pairStats(pairs); return { n: s.n, meanA: r6(s.meanA), meanB: r6(s.meanB), diff: r6(s.diff), sd: r6(s.sd), z: s.z === null ? null : r6(s.z), dz: r6(s.dz), rel: r6(s.rel) }; };
  const rowKey = (b) => b.key;
  /** 結果表 → 應有的排除表（template, dimension, choice, reason）。規則見檔頭。 */
  function deriveExclusions(rows) {
    const out = [];
    //  Phase 3a-C3-2 收尾：n=400 新 seeds 紅藍複驗涵蓋的選擇，**std 上**排除與否由複驗決定（Registry.REPLICATION_CONFIRMED／REPLICATION_WITHHELD）：
    //  n=40 的主要列照常量測、照常記錄，但不推出 "*" 排除。複驗只量了 std ⇒ 弱點模板的列照舊推出該模板的排除（審查 2026-10-22 #1）。
    //  涵蓋清單直接讀複驗結果檔，不讀 Registry（Registry 不能自己宣告被取代）。
    const reasonOf = (v) => (v === "reversed" ? "reversed_effect" : v === "unmeasurable" ? "unmeasurable" : "no_measured_effect");
    const prim = rows.filter((r) => r.role === "primary");
    for (const p of prim) {
      if (!isOk(p.verdict) && !superseded(p)) out.push({ template: "*", dimension: p.dimension, choice: p.choice, reason: reasonOf(p.verdict), metric: p.metric, n: p.n, z: p.z === null ? null : Number(p.z.toFixed(2)) });
      else {
        const w = rows.find((r) => r.role === "weak" && r.dimension === p.dimension && r.choice === p.choice);
        if (w && !isOk(w.verdict)) out.push({ template: w.template, dimension: w.dimension, choice: w.choice, reason: reasonOf(w.verdict), metric: w.metric, n: w.n, z: w.z === null ? null : Number(w.z.toFixed(2)) });
      }
    }
    return out;
  }
  const deriveAsymmetries = (rows) => rows.filter((r) => r.role === "red").map((r) => {
    const p = rows.find((x) => x.role === "primary" && x.dimension === r.dimension && x.choice === r.choice);
    return p && isOk(p.verdict) !== isOk(r.verdict) ? { dimension: r.dimension, choice: r.choice, blue: p.verdict, red: r.verdict, zBlue: p.z, zRed: r.z } : null;
  }).filter(Boolean);
  const exKey = (x) => `${x.template}|${x.dimension}|${x.choice}|${x.reason}`;

  // ════════════════════════════════════════════════════════════════════════
  //   --measure 路線
  // ════════════════════════════════════════════════════════════════════════
  // ── 批次檔 ──────────────────────────────────────────────────────────────
  function dirOf() { return path.resolve(val("dir", path.join(os.tmpdir(), "esmo-tactic-truth-3a"))); }
  const fileOf = (dir, key) => path.join(dir, `${key.replace(/[^A-Za-z0-9._-]+/g, "_")}.jsonl`);
  function readBatch(dir, key) {
    const m = new Map();
    const f = fileOf(dir, key);
    if (!fs.existsSync(f)) return m;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); m.set(o.seed, o.rec); } catch { /* 被中斷寫了一半的最後一行：當作沒做 */ }
    }
    return m;
  }

  async function measureMode() {
    const dir = dirOf(), pilot = flag("pilot");
    const wdir = pilot ? path.join(dir, "pilot") : dir;
    fs.mkdirSync(wdir, { recursive: true });
    const plan = Plan.buildPlan();
    const seeds = pilot ? SEEDS.slice(0, 5) : SEEDS;
    let batches = plan.batches;
    if (pilot) {
      //  小樣本：std 對照組＋兩個選擇（各一批）；量每場耗時，估算全程
      const pick = ["primary|std|phases.early.stance|aggressive|blue", "primary|std|jungle.tempo|fast|blue"];
      batches = plan.batches.filter((b) => b.key === "control|std|-|-|both" || pick.includes(b.key));
    }
    const only = val("only");
    if (only) batches = batches.filter((b) => b.key.includes(only) || (b.role === "control" && plan.batches.some((x) => x.control === b.key && x.key.includes(only))));
    const total = batches.length;
    const tasks = [];
    let doneBatches = 0;
    for (const b of batches) {
      const have = readBatch(wdir, b.key);
      if (seeds.every((s) => have.has(s))) { doneBatches++; continue; }
      for (const s of seeds) if (!have.has(s)) tasks.push({ id: `${b.key}#${s}`, key: b.key, seed: s, blue: b.blue, red: b.red });
    }
    const sidecar = Prov.loadedFilesSidecar(wdir);
    console.log(`量測：${total} 批（已完成 ${doneBatches}），待跑 ${tasks.length} 場，workers=${Math.min(MAX_WORKERS, Number(val("workers", MAX_WORKERS)))}，資料夾 ${wdir}`);
    if (tasks.length) {
      const workers = Math.max(1, Math.min(MAX_WORKERS, Number(val("workers", MAX_WORKERS))));
      const t0 = Date.now();
      let next = 0, finished = 0, failed = 0, stopped = false;
      const remaining = new Map(batches.map((b) => [b.key, seeds.filter((s) => !readBatch(wdir, b.key).has(s)).length]));
      const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
      await new Promise((resolveAll) => {
        let alive = 0;
        const spawnWorker = () => {
          const child = fork(SELF, ["--truth-worker"], { env: { ...process.env, ESMO_BALANCE_SKILLS: "on" }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
          alive++;
          const feed = () => {
            if (fs.existsSync(path.join(wdir, "STOP"))) stopped = true;
            if (stopped || next >= tasks.length) { child.kill(); return; }
            child.send({ type: "run", ...tasks[next++] });
          };
          child.on("message", (m) => {
            if (m.type === "ready") return feed();
            const t = tasks.find((x) => x.id === m.id);
            if (m.type === "done") {
              sidecar.add(m.files);
              fs.appendFileSync(fileOf(wdir, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
              remaining.set(t.key, remaining.get(t.key) - 1);
              finished++;
              if (remaining.get(t.key) === 0) {
                doneBatches++;
                const el = (Date.now() - t0) / 1000, perMatch = el / finished, left = (tasks.length - finished) * perMatch;
                console.log(`${bar(doneBatches, total)} ${String(Math.round((doneBatches / total) * 100)).padStart(3)}%  批 ${doneBatches}/${total}  場 ${finished}/${tasks.length}  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(left / 60).toFixed(1)} 分（${perMatch.toFixed(1)} 秒/場，${workers} workers）　${t.key}`);
              }
            } else if (m.type === "error") { failed++; console.log(`✗ ${m.id}: ${String(m.error).slice(0, 300)}`); }
            feed();
          });
          child.on("exit", () => { alive--; if (alive === 0) resolveAll(); });
        };
        for (let i = 0; i < Math.min(workers, tasks.length); i++) spawnWorker();
      });
      const el = (Date.now() - t0) / 1000;
      console.log(`本輪跑了 ${finished} 場、失敗 ${failed}，${(el / 60).toFixed(1)} 分（${(el / Math.max(1, finished)).toFixed(2)} 秒/場，含 ${Math.min(MAX_WORKERS, Number(val("workers", MAX_WORKERS)))} workers 平行）`);
      if (pilot) {
        const per = el / Math.max(1, finished), fullMatches = plan.batches.length * SEEDS.length;
        console.log(`試跑估算：全程 ${plan.batches.length} 批 × ${SEEDS.length} seeds ＝ ${fullMatches} 場，每場約 ${per.toFixed(1)} 秒（含平行）⇒ 約 ${((fullMatches * per) / 3600).toFixed(1)} 小時`);
        process.exit(failed ? 1 : 0);
      }
      if (failed || stopped) { console.log(stopped ? "已依 STOP 停止；再執行 --measure 會續跑。" : "有失敗的場次；再執行 --measure 會續跑。"); process.exit(stopped ? 3 : 1); }
    }
    if (pilot) return;
    await writeFixture(dir, plan);
  }

  function analyse(dir, plan) {
    const rows = [], splitStayOut = [];
    for (const b of plan.batches.filter((x) => x.role !== "control")) {
      const trt = readBatch(dir, b.key), ctl = readBatch(dir, b.control);
      if (!SEEDS.every((s) => trt.has(s) && ctl.has(s))) throw new Error(`批次不完整：${b.key}（或對照組 ${b.control}）`);
      const side = b.armSide;
      const pairs = SEEDS.map((s) => [r6(metricValue(ctl.get(s), side, b.metric)), r6(metricValue(trt.get(s), side, b.metric))]);
      const st = statsOfPairs(pairs);
      const row = { key: b.key, role: b.role, template: b.template, dimension: b.dimension, choice: b.choice, own: b.own, side, metric: b.metric, direction: b.direction, ...st, verdict: verdictOf(st, b.direction), pairs };
      //  同一維度的其他階段（只描述，不判定）：階段姿態「不應在別的階段有宣稱」
      const m = /^fightEntriesPerMin\.(early|mid|late)$/.exec(b.metric);
      if (m) {
        row.otherPhases = ["early", "mid", "late"].filter((p) => p !== m[1]).map((p) => {
          const id = `fightEntriesPerMin.${p}`;
          return { metric: id, ...statsOfPairs(SEEDS.map((s) => [r6(metricValue(ctl.get(s), side, id)), r6(metricValue(trt.get(s), side, id))])) };
        });
      }
      rows.push(row);
      if (b.choice === "split") {
        const sum = (f) => SEEDS.reduce((a, s) => a + trt.get(s)[side][f], 0), sumC = (f) => SEEDS.reduce((a, s) => a + ctl.get(s)[side][f], 0);
        const rolls = sum("splitRolls"), go = sum("splitRollsGo");
        splitStayOut.push({
          key: b.key, role: b.role, template: b.template, dimension: b.dimension, side, rolls, rollsGo: go, stayRate: rolls ? r6(go / rolls) : null,
          stayTicksShare: r6(sum("splitTicks") / Math.max(1, sum("splitLaneAliveTicks"))),
          splitPushActionsPerMatch: r6(SEEDS.reduce((a, s) => a + trt.get(s)[side].exec.splitPushActions, 0) / SEEDS.length),
          seatFightEntriesPerMin: { control: row.meanA, split: row.meanB },
          controlSplitRolls: sumC("splitRolls"),
        });
      }
    }
    return { rows, splitStayOut };
  }

  async function writeFixture(dir, plan) {
    const { rows, splitStayOut } = analyse(dir, plan);
    const loaded = Prov.loadedFilesSidecar(dir).all();
    if (!loaded.length) throw new Error(`${dir} 沒有 loadedFiles.json（這個資料夾的場次不是用記錄載入檔的 worker 跑的；重新 --measure）`);
    const fx = {
      schema: "TacticTruth.v1", meta: { ...(await currentHashes()), loadedFiles: Prov.hashLoadedFiles(loaded), seeds: [TRUTH_GATE.seedFrom, TRUTH_GATE.seedTo], minZ: TRUTH_GATE.minZ, marginalBelowZ: TRUTH_GATE.marginalBelowZ, items: "standard", skills: "on" },
      rows, splitStayOut, exclusionsDerived: deriveExclusions(rows), asymmetries: deriveAsymmetries(rows),
    };
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, `${JSON.stringify(fx)}\n`, "utf8");
    const c = {}; for (const r of rows.filter((x) => x.role === "primary")) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
    console.log(`結果表已寫入 ${path.relative(ROOT, FIXTURE)}：${rows.length} 列；std 主要列判定 ${JSON.stringify(c)}`);
    console.log(`應填入 MEASURED_EXCLUSIONS：${JSON.stringify(fx.exclusionsDerived)}`);
    console.log(`紅藍不對稱：${JSON.stringify(fx.asymmetries)}`);
  }

  function reportMode() {
    const fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const f = (v, d = 3) => (v === null || v === undefined ? "-" : Number(v).toFixed(d));
    console.log("| role | template | dimension | choice | side | metric | dir | meanA(ctl) | meanB(trt) | diff | rel% | sd | z | n | verdict |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of fx.rows) console.log(`| ${r.role} | ${r.template} | ${r.dimension} | ${r.choice} | ${r.side} | ${r.metric} | ${r.direction} | ${f(r.meanA)} | ${f(r.meanB)} | ${f(r.diff)} | ${r.rel === null ? "-" : f(r.rel * 100, 1)} | ${f(r.sd)} | ${f(r.z, 2)} | ${r.n} | ${r.verdict} |`);
    console.log("\n階段姿態在其他階段（描述）：");
    for (const r of fx.rows.filter((x) => x.otherPhases)) console.log(`${r.role} ${r.template} ${r.dimension}=${r.choice}: ${r.otherPhases.map((o) => `${o.metric} diff=${f(o.diff)} z=${f(o.z, 2)} n=${o.n}`).join(" ; ")}`);
    console.log("\n帶線者實測：");
    for (const s of fx.splitStayOut) console.log(JSON.stringify(s));
    console.log("\n排除表（應填入）：", JSON.stringify(fx.exclusionsDerived));
    console.log("不對稱：", JSON.stringify(fx.asymmetries));
  }

  // ════════════════════════════════════════════════════════════════════════
  //   快速模式
  // ════════════════════════════════════════════════════════════════════════
  async function fastMode() {
    let pass = 0, fail = 0;
    const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
    const J = JSON.stringify;
    const plan = Plan.buildPlan();
    const planRows = plan.batches.filter((b) => b.role !== "control");

    /** 驗證一份結果表；回傳問題清單（空＝通過）。ctx 可以被負向對照竄改。 */
    function verifyFixture(fx, ctx) {
      const problems = [];
      const P = (code, msg) => problems.push(`${code}: ${msg}`);
      if (!fx || fx.schema !== "TacticTruth.v1" || !Array.isArray(fx.rows)) { P("schema", "結果表格式不對"); return problems; }
      for (const reason of Prov.stalenessReasons(fx.meta, ctx)) P("stale", reason);
      const byKey = new Map(fx.rows.map((r) => [r.key, r]));
      if (byKey.size !== fx.rows.length) P("dup", "結果表有重複的列");
      for (const b of ctx.planRows) if (!byKey.has(b.key)) P("missing", `計畫要求的 ${b.key} 沒有列`);
      const want = new Set(ctx.planRows.map((b) => b.key));
      for (const r of fx.rows) if (!want.has(r.key)) P("extra", `${r.key} 不在計畫裡`);
      for (const r of fx.rows) {
        const b = ctx.planRows.find((x) => x.key === r.key);
        if (!b) continue;
        if (r.metric !== b.metric || r.direction !== b.direction || r.own !== b.own || r.template !== b.template) P("prereg", `${r.key}：指標／方向與事前登記不符（${r.metric}/${r.direction} vs ${b.metric}/${b.direction}）`);
        if (!isKnownMetric(r.metric)) P("metric", `${r.key}：未知指標 ${r.metric}`);
        if (!Array.isArray(r.pairs) || r.pairs.length !== SEEDS.length) { P("pairs", `${r.key}：配對數不是 ${SEEDS.length}`); continue; }
        const st = statsOfPairs(r.pairs);
        for (const k of ["n", "meanA", "meanB", "diff", "sd", "z"]) if (st[k] !== r[k]) P("recompute", `${r.key}：${k} 與原始配對值重算不符（${r[k]} vs ${st[k]}）`);
        if (verdictOf(st, r.direction) !== r.verdict) P("verdict", `${r.key}：判定與重算不符`);
        //  有效配對不足的列只有在「該選擇已被排除」時才可接受（例如後期階段不足 60 秒的場次太多，而 std 上這個選擇本來就已排除）
        if (r.verdict === "unmeasurable" && !superseded(r) && !ctx.exclusions.some((x) => x.dimension === r.dimension && x.choice === r.choice && (x.template === "*" || x.template === r.template))) P("unmeasurable", `${r.key}：有效配對 ${r.n} 不足，且該選擇沒有被排除`);
      }
      //  每個選擇通過，或已被排除
      const exInTable = new Set(ctx.exclusions.map(exKey));
      const derived = deriveExclusions(fx.rows);
      for (const x of derived) if (!exInTable.has(exKey(x))) P("exclusion", `${x.dimension}=${x.choice} 在 ${x.template} 量測失敗（${x.reason}, z=${x.z}），但 MEASURED_EXCLUSIONS 沒有它`);
      const derivedKeys = new Set(derived.map(exKey));
      for (const x of ctx.exclusions) if (!derivedKeys.has(exKey(x))) P("exclusion", `MEASURED_EXCLUSIONS 有 ${x.template}/${x.dimension}=${x.choice}，但結果表沒有支持它的量測`);
      return problems;
    }

    //  探針：跑一場最小的對局（對照組、固定 seed），看它載入了哪些 repo 檔案；不在 meta.loadedFiles 裡的就是新依賴。
    let probeFiles = null, probeErr = "";
    const tProbe = Date.now();
    try { probeFiles = await Prov.probeLoadedFiles({ workerEntry: WORKER_ENTRY, seed: PROBE_SEED }); } catch (e) { probeErr = String(e?.message ?? e); }
    const ctx = { hashes: await currentHashes(), probeFiles, planRows, exclusions: Registry.MEASURED_EXCLUSIONS };
    let fx = null;
    try { fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8")); } catch { /* 下面的檢查會報 */ }
    ck("T1 結果表存在、格式 TacticTruth.v1", !!fx && fx.schema === "TacticTruth.v1" && Array.isArray(fx.rows), fx ? `${fx.rows?.length} 列` : "tools/fixtures/tactic_truth_3a.json 不存在或讀不出來（執行 --measure）");
    if (!fx) { console.log(`\nTactic Truth 3a：${pass}/${pass + fail} FAIL`); process.exit(1); }

    ck("T1b 探針場次跑得起來（一場對照組，看它載入了哪些 repo 檔案）", !!probeFiles && probeFiles.length > 0, probeFiles ? `${probeFiles.length} 個檔案，${((Date.now() - tProbe) / 1000).toFixed(1)} 秒` : probeErr);
    const stale = Prov.stalenessReasons(fx.meta, ctx);
    ck("T2 結果表沒有過期：模擬版本、Registry live 列、對照表、解析結果、模板版本、量測程式的雜湊相同；記錄的載入檔都在且內容相同；探針沒載入新檔案",
      stale.length === 0, stale.length ? `過期：${stale.slice(0, 6).join("；")}${stale.length > 6 ? `…（共 ${stale.length} 條）` : ""}` : `${ctx.hashes.simVersion} 載入檔 ${Object.keys(fx.meta.loadedFiles).length} mapping ${ctx.hashes.mappingHash}`);
    const rowsKeys = new Set(fx.rows.map((r) => r.key));
    ck("T3 計畫要求的每一批都有列，沒有多的", planRows.every((b) => rowsKeys.has(b.key)) && fx.rows.every((r) => planRows.some((b) => b.key === r.key)), `${planRows.length} 批 vs ${fx.rows.length} 列`);
    const liveStd = Registry.liveRows().flatMap((r) => { const o = Plan.offeredOf("std", r.dimension); return o ? o.offered.filter((c) => c !== o.own).map((c) => `${r.dimension}=${c}`) : []; });
    const primKeys = new Set(fx.rows.filter((r) => r.role === "primary").map((r) => `${r.dimension}=${r.choice}`));
    ck("T3b std 上每個「提供且不等於本來」的 live 選擇都有主要列（同時涵蓋已被排除的）", liveStd.every((k) => primKeys.has(k)) && primKeys.size === liveStd.length, `${liveStd.length} 個選擇`);
    ck("T4 事前登記：每一列的指標／方向／本來選擇／模板與 Registry 現在的 gate 相同，指標都是已知指標",
      fx.rows.every((r) => { const b = planRows.find((x) => x.key === r.key); return b && r.metric === b.metric && r.direction === b.direction && r.own === b.own && r.template === b.template && isKnownMetric(r.metric); }));
    const coveredByEx = (r) => ctx.exclusions.some((x) => x.dimension === r.dimension && x.choice === r.choice && (x.template === "*" || x.template === r.template));
    ck("T5 每一列都有 40 個配對；有效配對 ≥ 20（不足的列必須是已被排除或被 n=400 複驗取代的選擇）", fx.rows.every((r) => r.pairs?.length === SEEDS.length && (r.n >= 20 || coveredByEx(r) || superseded(r))), fx.rows.filter((r) => r.n < 20).map((r) => `${r.key}:n=${r.n}${coveredByEx(r) ? "(已排除)" : ""}`).join(" "));
    ck("T6 z、均值、差、sd、判定都能由原始配對值重算出來（表上的數字不是手填的）",
      fx.rows.every((r) => { const st = statsOfPairs(r.pairs); return ["n", "meanA", "meanB", "diff", "sd", "z"].every((k) => st[k] === r[k]) && verdictOf(st, r.direction) === r.verdict; }));
    const prim = fx.rows.filter((r) => r.role === "primary");
    const exStd = new Set(ctx.exclusions.filter((x) => x.template === "*").map((x) => `${x.dimension}=${x.choice}`));
    ck("T7 std 上每個 live 選擇：方向與宣稱一致且配對 z ≥ 2，否則已被排除（template \"*\"），或由 n=400 複驗取代（見 T13）",
      prim.every((r) => isOk(r.verdict) || exStd.has(`${r.dimension}=${r.choice}`) || superseded(r)), prim.filter((r) => !isOk(r.verdict) && !exStd.has(`${r.dimension}=${r.choice}`) && !superseded(r)).map((r) => `${r.dimension}=${r.choice}(z=${r.z})`).join(" "));
    const weak = fx.rows.filter((r) => r.role === "weak");
    const exTpl = (r) => ctx.exclusions.some((x) => x.dimension === r.dimension && x.choice === r.choice && (x.template === "*" || x.template === r.template));
    ck("T8 弱點模板（旋鈕差距最小）上每個選擇：通過，或已對該模板排除（n=400 複驗只涵蓋 std，不豁免弱點模板）", weak.every((r) => isOk(r.verdict) || exTpl(r)), weak.filter((r) => !isOk(r.verdict) && !exTpl(r)).map((r) => `${r.template}/${r.dimension}=${r.choice}(z=${r.z})`).join(" "));
    const derived = deriveExclusions(fx.rows);
    const sameSet = (a, b) => J([...a].sort()) === J([...b].sort());
    ck("T9 MEASURED_EXCLUSIONS ＝ 結果表推出來的排除（逐筆相同，不多不少）", sameSet(derived.map(exKey), ctx.exclusions.map(exKey)), `${derived.length} 筆`);
    ck("T9b 結果表自己記的 exclusionsDerived 與重算相同", sameSet((fx.exclusionsDerived ?? []).map(exKey), derived.map(exKey)));
    //  排除表 ↔ offeredChoices
    const withheldOk = ctx.exclusions.every((x) => Plan.TEMPLATE_IDS.filter((t) => x.template === "*" || x.template === t).every((t) => {
      const d = Mapping.offeredChoiceDetail(t, x.dimension);
      if (!d || d.own === x.choice) return true;     // 模板本來就選了它：排除表管不到「本來的選擇」
      return !d.offered.includes(x.choice) && d.withheld.some((w) => w.choice === x.choice && w.reason === "no_measured_effect");
    }));
    ck("T10 排除表的每一筆，offeredChoices 都不提供（原因 no_measured_effect）", withheldOk, `${ctx.exclusions.length} 筆`);
    const survivors = Registry.liveRows().every((r) => {
      const d1 = Mapping.offeredChoiceDetail("std", r.dimension), d0 = Mapping.offeredChoiceDetail("std", r.dimension, [], {}, { withMeasured: false });
      const gone = (c) => [...ctx.exclusions, ...Registry.REPLICATION_WITHHELD].some((x) => x.dimension === r.dimension && x.choice === c && (x.template === "*" || x.template === "std"));
      return d1 && d0 && J(d1.offered) === J(d0.offered.filter((c) => c === d0.own || !gone(c)));
    });
    ck("T10b 在 std 上，提供清單恰好＝不套用排除表時的提供清單扣掉被排除的（量測排除表與複驗撤下清單；兩張表都不影響其他選擇）", survivors);
    ck("T11 紅方子集：每個不對稱都已記錄（藍方通過而紅方沒通過，或反過來）；結果表記的與重算相同", sameSet((fx.asymmetries ?? []).map((a) => `${a.dimension}=${a.choice}`), deriveAsymmetries(fx.rows).map((a) => `${a.dimension}=${a.choice}`)), `${deriveAsymmetries(fx.rows).length} 個不對稱`);
    const sp = (fx.splitStayOut ?? []).filter((s) => s.role === "primary" && s.side === "blue");
    ck("T12 帶線者實測：上、中路各有一筆，擲骰次數 ≥ 20，留在線上的比例是數字", ["lanes.top.stance", "lanes.mid.stance"].every((d) => sp.some((s) => s.dimension === d && s.rolls >= 20 && typeof s.stayRate === "number" && typeof s.stayTicksShare === "number")), sp.map((s) => `${s.dimension}: ${s.rollsGo}/${s.rolls}=${s.stayRate}`).join(" "));
    {
      //  T13：被複驗取代的每個選擇，在 Registry 恰好落在一張表：REPLICATION_CONFIRMED（提供）或 REPLICATION_WITHHELD（不提供）；
      //  逐筆數字由 check_tactic_replication_3a.mjs 對結果檔驗。這裡只驗「沒有漏網、沒有兩邊都在」，以及它們不在 MEASURED_EXCLUSIONS。
      const inC = (k) => Registry.REPLICATION_CONFIRMED.some((x) => `${x.dimension}=${x.choice}` === k), inW = (k) => Registry.REPLICATION_WITHHELD.some((x) => `${x.dimension}=${x.choice}` === k);
      const bad = [...supersededKeys].filter((k) => inC(k) === inW(k) || ctx.exclusions.some((x) => x.template === "*" && `${x.dimension}=${x.choice}` === k));
      if (!supersedingOk) bad.push(`複驗結果檔形狀不對：${SUPERSEDING_SHAPE.join("；")}`);
      const n40 = prim.filter(superseded).map((r) => `${r.dimension}=${r.choice}:${r.verdict}(z=${r.z})`);
      ck("T13 被 n=400 複驗取代的選擇：複驗結果檔完整、沒停、沒過期、0 失敗；每個恰好在 REPLICATION_CONFIRMED 或 REPLICATION_WITHHELD 其中一張，且沒有 \"*\" 排除（弱點模板的排除照舊）", supersededKeys.size > 0 && bad.length === 0, bad.length ? bad.join(" ") : `${supersededKeys.size} 個；n=40 列照記：${n40.join("、")}`);
    }
    const marg = fx.rows.filter((r) => r.verdict === "marginal");
    console.log(`　（資訊）邊際（2 ≤ z < 3）：${marg.length} 列${marg.length ? "：" + marg.map((r) => `${r.role}/${r.template}/${r.dimension}=${r.choice}(z=${r.z})`).join("、") : ""}`);

    // ── 負向對照：驗證器抓得到壞的結果表 ──────────────────────────────────
    const clone = (o) => structuredClone(o);
    const base = verifyFixture(fx, ctx).filter((p) => !p.startsWith("stale"));
    ck("N0 基線：驗證器對真實結果表沒有（過期以外的）問題；過期另由 T2 判定", base.length === 0, base.slice(0, 3).join(" | "));
    //  「新鮮」的結果表：meta 的雜湊與載入檔都取自現在，其餘照真實結果表。過期類的負向對照一律從它出發，
    //  否則真實結果表本身已過期時，每一條「⇒ 過期」的對照都會假綠。
    const fresh = clone(fx);
    fresh.meta = { ...fresh.meta, ...ctx.hashes, loadedFiles: Prov.hashLoadedFiles(probeFiles ?? []) };
    delete fresh.meta.engineHash;
    const freshProblems = verifyFixture(fresh, ctx);
    ck("N0b 基線：新鮮的 meta（雜湊與載入檔取自現在）⇒ 驗證器不報過期，其餘問題也沒有", freshProblems.length === 0, freshProblems.slice(0, 3).join(" | "));
    const t1 = clone(fx); t1.rows[0].pairs[0][1] = (t1.rows[0].pairs[0][1] ?? 0) + 5;
    ck("N1 竄改一個原始配對值 ⇒ 重算不符被抓到", verifyFixture(t1, ctx).some((p) => p.startsWith("recompute")));
    const t2 = clone(fx); t2.rows[0].z = 99;
    ck("N2 竄改表上的 z ⇒ 被抓到", verifyFixture(t2, ctx).some((p) => p.startsWith("recompute")));
    ck("N3 對照表雜湊改了（沒重新量測）⇒ 結果表過期", verifyFixture(fresh, { ...ctx, hashes: { ...ctx.hashes, mappingHash: "0".repeat(16) } }).some((p) => p.startsWith("stale")));
    ck("N3b 模擬版本改了 ⇒ 過期", verifyFixture(fresh, { ...ctx, hashes: { ...ctx.hashes, simVersion: "moba-sim.v99" } }).some((p) => p.startsWith("stale")));
    ck("N3c 選擇解析出的旋鈕變了（resolvedHash 不同，例如改了 applyChoice）⇒ 過期", verifyFixture(fresh, { ...ctx, hashes: { ...ctx.hashes, resolvedHash: "f".repeat(16) } }).some((p) => p.startsWith("stale")));
    //  依賴式過期（Phase 3a-C0）
    const loadedKeys = Object.keys(fresh.meta.loadedFiles);
    if (!loadedKeys.length) ck("N3d-N3i 依賴式過期的負向對照（需要探針載入檔清單）", false, "probe failed, cannot evaluate");
    else {
    const tChanged = clone(fresh); tChanged.meta.loadedFiles[loadedKeys[0]] = "0".repeat(16);
    ck("N3d 記錄的載入檔雜湊變了（檔案內容改了）⇒ 過期", verifyFixture(tChanged, ctx).some((p) => p.startsWith("stale") && p.includes("loaded file changed")));
    const tMissing = clone(fresh); tMissing.meta.loadedFiles["tools/lib/__no_such_file__.mjs"] = "0".repeat(16);
    ck("N3e 記錄的載入檔不見了 ⇒ 過期", verifyFixture(tMissing, ctx).some((p) => p.startsWith("stale") && p.includes("loaded file missing")));
    ck("N3f 探針載入了沒記錄的檔案（新依賴）⇒ 過期", verifyFixture(fresh, { ...ctx, probeFiles: [...(probeFiles ?? []), "src/__new_dependency__.js"] }).some((p) => p.startsWith("stale") && p.includes("new dependency src/__new_dependency__.js")));
    //  省下重量的那一邊：不在 loadedFiles 的語意檔改了 ⇒ 不過期（明確釘住，避免日後悄悄漂移）；同一手法用在記錄內的檔案則必須過期
    const SimVersionMod = await import("../src/platform/contracts/simulationVersion.js");
    const outside = SimVersionMod.SIMULATION_SEMANTICS_FILES.find((f) => !(f in fresh.meta.loadedFiles));
    const inside = loadedKeys.find((f) => SimVersionMod.SIMULATION_SEMANTICS_FILES.includes(f));
    const edit = (target) => (rel) => (rel === target ? `${fs.readFileSync(path.join(ROOT, rel), "utf8")}
export const __edited_by_test__ = 1;` : fs.readFileSync(path.join(ROOT, rel), "utf8"));
    ck("N3g 不在 loadedFiles 的語意檔（worker 沒載入）改了 ⇒ 不過期；同樣的改動用在記錄內的語意檔 ⇒ 過期",
      !!outside && !!inside && Prov.stalenessReasons(fresh.meta, { hashes: ctx.hashes, probeFiles, readFn: edit(outside) }).length === 0 && Prov.stalenessReasons(fresh.meta, { hashes: ctx.hashes, probeFiles, readFn: edit(inside) }).some((r) => r.includes(inside)), `未載入：${outside} / 載入：${inside}`);
    //  循環防護：這三支（Registry／對照表／解析器）改由行為雜湊保護，不進 loadedFiles；改了它們（例如填 MEASURED_EXCLUSIONS）不得讓新鮮結果表過期
    const exempt = Prov.TEXT_HASH_EXEMPT[0];
    const editExempt = (rel) => (rel === exempt ? `${fs.readFileSync(path.join(ROOT, rel), "utf8")}
export const __edited_by_test__ = 1;` : fs.readFileSync(path.join(ROOT, rel), "utf8"));
    const withExempt = clone(fresh); withExempt.meta.loadedFiles[exempt] = "0".repeat(16);
    ck("N3i 免文字雜湊的三支檔案（Registry／對照表／解析器）：不進 loadedFiles；改動或探針載入它們都不過期；非豁免的載入檔改動仍過期",
      Prov.TEXT_HASH_EXEMPT.length === 3 && Prov.TEXT_HASH_EXEMPT.every((f) => !(f in fresh.meta.loadedFiles))
      && Prov.stalenessReasons(fresh.meta, { hashes: ctx.hashes, probeFiles: [...(probeFiles ?? []), ...Prov.TEXT_HASH_EXEMPT], readFn: editExempt }).length === 0
      && Prov.stalenessReasons(withExempt.meta, { hashes: ctx.hashes, probeFiles, readFn: editExempt }).length === 0
      && Prov.stalenessReasons(fresh.meta, { hashes: ctx.hashes, probeFiles, readFn: edit(loadedKeys[0]) }).some((r) => r.includes(loadedKeys[0])));
    }
    const legacy = clone(fx); legacy.meta = { ...legacy.meta, engineHash: "0".repeat(16) }; delete legacy.meta.loadedFiles;
    ck("N3h 舊格式結果表（有 engineHash、沒有 loadedFiles）⇒ 過期，原因是 \"fixture predates dependency-based staleness; re-run --measure\"（沒有讓舊表通過的相容路徑）",
      J(Prov.stalenessReasons(legacy.meta, { ...ctx })) === J([Prov.LEGACY_REASON]) && Prov.LEGACY_REASON === "fixture predates dependency-based staleness; re-run --measure");
    const t3 = clone(fx); t3.rows.pop();
    ck("N4 少一列 ⇒ 被抓到", verifyFixture(t3, ctx).some((p) => p.startsWith("missing")));
    const t4 = clone(fx); t4.rows[0].direction = t4.rows[0].direction === "up" ? "down" : "up";
    ck("N5 改掉事前登記的方向 ⇒ 被抓到", verifyFixture(t4, ctx).some((p) => p.startsWith("prereg")));
    //  被 n=400 複驗取代的 std 列（時期姿態）依設計不推出 "*" 排除 ⇒ 負向對照要挑沒被取代的列（2026-10-22 重測後第一個通過列變成時期姿態）。
    const t5 = clone(fx), pr = t5.rows.find((r) => r.role === "primary" && isOk(r.verdict) && !superseded(r)); pr.pairs = pr.pairs.map(([a]) => [a, a]);
    const stub = statsOfPairs(pr.pairs); Object.assign(pr, stub, { verdict: verdictOf(stub, pr.direction) });
    ck("N6 一個選擇完全沒效果（配對全相等）但沒進排除表 ⇒ 被抓到", verifyFixture(t5, ctx).some((p) => p.startsWith("exclusion")));
    const okRow = prim.find((r) => isOk(r.verdict));
    ck("N7 排除表多一筆沒有量測支持的（拿一個通過的選擇冒充被排除）⇒ 被抓到", !!okRow && verifyFixture(fx, { ...ctx, exclusions: [...ctx.exclusions, { template: "*", dimension: okRow.dimension, choice: okRow.choice, reason: "no_measured_effect" }] }).some((p) => p.startsWith("exclusion")));

    console.log(`\nTactic Truth 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
    process.exit(fail ? 1 : 0);
  }

  // ── 入口分派（放在最後：上面的 const 都已初始化）──────────────────────────
  if (flag("plan")) {
    const plan = Plan.buildPlan();
    const c = {}; for (const b of plan.batches) c[b.role] = (c[b.role] ?? 0) + 1;
    console.log(`量測計畫：${plan.batches.length} 批（${JSON.stringify(c)}）× ${SEEDS.length} seeds ＝ ${plan.batches.length * SEEDS.length} 場`);
    for (const b of plan.batches) console.log(`${b.role.padEnd(8)} ${b.template.padEnd(22)} ${(b.dimension ?? "-").padEnd(20)} ${(b.choice ?? "-").padEnd(10)} ${b.armSide.padEnd(5)} ${b.metric ?? ""} ${b.direction ?? ""}`);
    return;
  }
  if (flag("report")) return reportMode();
  if (flag("measure") || flag("finish") || flag("pilot")) return measureMode();
  return fastMode();
}
