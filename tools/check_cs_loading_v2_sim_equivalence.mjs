#!/usr/bin/env node
// ============================================================================
//  CS Loading Performance Pass v2：simulateFps 輸出等價檢查
//
//  執行：node tools/check_cs_loading_v2_sim_equivalence.mjs [--ref origin/main] [--seeds 11521] [--cells mirage/0,inferno/0]
//
//  這支不是效能 gate，是「進場變快但比賽一格都沒變」的證據：
//  拿 <ref> 版本的 EsportsFPS3D.jsx（git show，只在記憶體裡載入）與工作樹版本並排，
//  同一組 map／戰術配對／seed 各跑一次 simulateFps，比對
//    ① 整份回傳值的 sha256（frames、rounds、比分、經濟、炸彈事件、所有 audit／telemetry）
//    ② buildMatchResult 的完整內容 sha256 與 id
//  並記錄兩邊耗時（CS 進場時整場比賽是在 main thread 上一次模擬完的）。
//
//  ⚠ 只跑 TD-54 探測過「會結束」的配對。dust2 的 t_long/c_std 與 t_midctrl/c_bstack
//    在舊版 planner 下 240 秒內跑不完（無界加時），同步函式在同一個 process 裡無法中止，
//    所以配對標籤對不上探測清單時一律跳過，不賭。
// ============================================================================
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const argValue = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = argValue("--ref", "origin/main");
const SEEDS = argValue("--seeds", "11521").split(",").map(Number);
//  artifacts/td54/bounds.json（commit 51aebee）探測為 bounded 的配對；combo i = t[i] 對 ct[i]。
const BOUNDED = Object.freeze({
  "mirage/0": "mirage/t_apalace/c_std",
  "mirage/1": "mirage/t_bapps/c_window",
  "mirage/2": "mirage/t_midsplit/c_bstack",
  "inferno/0": "inferno/t_banana/c_std",
  "inferno/1": "inferno/t_aexec/c_astack",
  "inferno/2": "inferno/t_midctrl/c_btop",
  "dust2/1": "dust2/t_bsplit/c_astack",
});
const CELLS = argValue("--cells", Object.keys(BOUNDED).join(",")).split(",");
const FPS_REL = "src/battle/fps/EsportsFPS3D.jsx";
const FPS_FILE = resolve(ROOT, FPS_REL);
const OUT = resolve(ROOT, "review/cs-loading/sim-equivalence.json");

const baselineSource = execFileSync("git", ["show", `${REF}:${FPS_REL}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
const baselineCommit = execFileSync("git", ["rev-parse", "--short", REF], { cwd: ROOT, encoding: "utf8" }).trim();

const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
function exposeSimulation(code) {
  if (!code.includes(RETURN_MARKER) || !code.includes(EXPORT_MARKER)) throw new Error("EsportsFPS3D export markers missing");
  return code
    .replace(RETURN_MARKER, "return { EsportsFPS3D, buildMatchResult, simulateFps, TACTICS_DB };")
    .replace(EXPORT_MARKER, "const __CS_LOADING_V2_SIM__={simulateFps:__FPS3D_MODULE.simulateFps,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB,buildMatchResult:__FPS3D_MODULE.buildMatchResult};\nexport { EsportsFPS3D, buildMatchResult, __CS_LOADING_V2_SIM__ };");
}

const replacer = (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v);
const sha = (value) => createHash("sha256").update(JSON.stringify(value, replacer)).digest("hex");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };

const vite = await createServer({
  root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
  cacheDir: join(mkdtempSync(join(tmpdir(), "cs-loading-v2-sim-")), "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "cs-loading-v2-sim-equivalence", enforce: "pre",
    transform(code, id) {
      const [file, query = ""] = id.split("?");
      if (resolve(file).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      return exposeSimulation(query.includes("variant=baseline") ? baselineSource : code);
    },
  }],
});

const rows = [];
try {
  const current = (await vite.ssrLoadModule(`/${FPS_REL}?variant=current`)).__CS_LOADING_V2_SIM__;
  const baseline = (await vite.ssrLoadModule(`/${FPS_REL}?variant=baseline`)).__CS_LOADING_V2_SIM__;
  ck("兩個版本都載得起來", Boolean(current?.simulateFps && baseline?.simulateFps), `baseline=${REF}(${baselineCommit})`);

  const run = (api, mapKey, combo, seed) => {
    const lib = api.TACTICS_DB[mapKey];
    const t = lib.t[combo], ct = lib.ct[combo];
    const t0 = performance.now();
    const sim = api.simulateFps(mapKey, t, ct, seed, undefined, null);
    const ms = performance.now() - t0;
    const result = api.buildMatchResult(sim, { tacticT: t, tacticCT: ct, seed });
    return { ms, simSha: sha(sim), resultSha: sha(result), resultId: result.id, rounds: sim.rounds, frames: sim.frames.length, score: `${sim.tScore}:${sim.ctScore}` };
  };

  for (const cell of CELLS) {
    const [mapKey, comboText] = cell.split("/");
    const combo = Number(comboText);
    const lib = current.TACTICS_DB[mapKey];
    const label = `${mapKey}/${lib?.t?.[combo]?.id}/${lib?.ct?.[combo]?.id}`;
    if (BOUNDED[cell] !== label) {
      console.log(`⏭  ${cell}（${label}）不在 TD-54 bounded 探測清單內，跳過`);
      continue;
    }
    for (const seed of SEEDS) {
      const cur = run(current, mapKey, combo, seed);
      const base = run(baseline, mapKey, combo, seed);
      const same = cur.simSha === base.simSha && cur.resultSha === base.resultSha && cur.resultId === base.resultId;
      rows.push({ cell: label, seed, rounds: cur.rounds, frames: cur.frames, score: cur.score, baselineMs: Math.round(base.ms), currentMs: Math.round(cur.ms), speedup: Number((base.ms / cur.ms).toFixed(2)), simSha: cur.simSha, baselineSimSha: base.simSha, resultId: cur.resultId, identical: same });
      ck(`${label} seed ${seed} 輸出逐位元組相同`, same,
        `${cur.rounds} 回合 ${cur.score}｜${REF} ${(base.ms / 1000).toFixed(1)}s → 工作樹 ${(cur.ms / 1000).toFixed(1)}s（×${(base.ms / cur.ms).toFixed(2)}）`);
    }
  }
  ck("至少比對一場", rows.length > 0, `${rows.length} 場`);

  //  返回同一場時 runtime 會沿用上一次的模擬結果，前提是「同一個 module 實例裡、同一組輸入
  //  再跑一次也得到同一份輸出」（沒有跨場累積的模組層狀態）。上面比的是兩個不同實例，這裡補同一實例。
  const repeatCell = rows[0];
  if (repeatCell) {
    const [mapKey, tId] = repeatCell.cell.split("/");
    const combo = current.TACTICS_DB[mapKey].t.findIndex((t) => t.id === tId);
    const again = run(current, mapKey, combo, repeatCell.seed);
    ck(`同一實例重跑 ${repeatCell.cell} seed ${repeatCell.seed} 輸出相同`, again.simSha === repeatCell.simSha, again.simSha.slice(0, 12));
  }
} finally {
  await vite.close();
}

const totalBase = rows.reduce((s, r) => s + r.baselineMs, 0), totalCur = rows.reduce((s, r) => s + r.currentMs, 0);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ ref: REF, baselineCommit, seeds: SEEDS, matches: rows.length, baselineMsTotal: totalBase, currentMsTotal: totalCur, rows }, null, 2));
console.log(`\n合計 ${REF} ${(totalBase / 1000).toFixed(1)}s → 工作樹 ${(totalCur / 1000).toFixed(1)}s（×${totalCur ? (totalBase / totalCur).toFixed(2) : "-"}）`);
console.log(`數據：review/cs-loading/sim-equivalence.json`);
console.log(`\nCS Loading v2 sim equivalence：${pass}/${pass + fail}　RESULT=${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
