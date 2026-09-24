#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_resume_worker.mjs — hotfix/cs-resume-worker node 驗收
//
//  E  等價：Worker 路徑＝structured clone 送輸入、structured clone 收輸出。
//     ① 輸入 clone 後再算 ⇒ 輸出逐位元相同（simulateFps 不依賴物件身分）
//     ② 輸出 clone 後 ⇒ 逐位元相同（沒有函式／不可 clone 的欄位遺失）
//     ③ simulateFps 原始碼與 --ref（預設 8bf51df）一字不差（沒有第二套、沒改模擬）
//  A  非同步掛載路徑：沒命中快取 ⇒ Suspense（丟 promise）；await 後命中快取、與同步版逐位元相同；
//     沒有 runner ⇒ 退回同步；runner 失敗 ⇒ 退回主執行緒同步計算，結果不變
//  S  原始碼：gate marker 兩行未動；Worker 不 import client（避免 Worker 內再建 Worker）；
//     CsMatchScreen 有 Suspense＋進度；Legacy 入口（EsportsGame）沒有開 asyncSimulation
// ============================================================================
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = (() => { const i = process.argv.indexOf("--ref"); return i >= 0 ? process.argv[i + 1] : "8bf51df"; })();
const FPS_REL = "src/battle/fps/EsportsFPS3D.jsx";
const FPS_FILE = resolve(ROOT, FPS_REL);
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const replacer = (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v);
const sha = (value) => createHash("sha256").update(JSON.stringify(value, replacer)).digest("hex");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };

const source = readFileSync(FPS_FILE, "utf8");
const baseline = execFileSync("git", ["show", `${REF}:${FPS_REL}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
const fnText = (code) => { const i = code.indexOf("function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,tacticalLayoutInput=null){"); const j = code.indexOf("\nfunction ", i + 10); return i >= 0 && j > i ? code.slice(i, j) : null; };

// ── S ──
ck("S1 gate marker 兩行（IIFE return／export）一字未動", source.includes(RETURN_MARKER) && source.includes(EXPORT_MARKER));
ck(`S2 simulateFps 原始碼與 ${REF} 一字不差（沒改模擬、沒有第二套）`, !!fnText(source) && fnText(source) === fnText(baseline), `${fnText(source)?.length} chars`);
const worker = readFileSync(resolve(ROOT, "src/battle/fps/fpsSim.worker.js"), "utf8").replace(/\/\/.*$/gm, "");
ck("S3 Worker 只 import EsportsFPS3D（不 import fpsSimClient ⇒ 不會在 Worker 內再建 Worker）", /from "\.\/EsportsFPS3D\.jsx"/.test(worker) && !/fpsSimClient/.test(worker) && /__FPS3D_SIM_PORT\.simulateFps\(/.test(worker));
const screen = readFileSync(resolve(ROOT, "src/screens/fps/CsMatchScreen.jsx"), "utf8");
ck("S4 CsMatchScreen：Suspense 包住 EsportsFPS3D、fallback 是回到比賽進度、asyncSimulation 由 Worker 可用與否決定",
  /<Suspense fallback=\{<CsSimulationProgress/.test(screen) && /asyncSimulation=\{workerReady\}/.test(screen) && /data-testid="cs-resume-progress"/.test(screen) && /installFpsSimWorker\(\)/.test(screen));
const legacy = readFileSync(resolve(ROOT, "src/EsportsGame.jsx"), "utf8");
ck("S5 Legacy 入口沒有開 asyncSimulation（沒有 Suspense 邊界的地方維持同步）", !/asyncSimulation/.test(legacy));

// ── E／A ──
const vite = await createServer({
  root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
  cacheDir: join(mkdtempSync(join(tmpdir(), "cs-resume-worker-")), "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "cs-resume-worker", enforce: "pre",
    transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      return code
        .replace(RETURN_MARKER, "return { EsportsFPS3D, buildMatchResult, simulateFps, simulateFpsForMount, simulateFpsForMountAsync, releaseMountSimulation, TACTICS_DB };")
        .replace(EXPORT_MARKER, "const __CS_RESUME_WORKER_TEST__={simulateFps:__FPS3D_MODULE.simulateFps,simulateFpsForMount:__FPS3D_MODULE.simulateFpsForMount,simulateFpsForMountAsync:__FPS3D_MODULE.simulateFpsForMountAsync,releaseMountSimulation:__FPS3D_MODULE.releaseMountSimulation,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB};\nexport { EsportsFPS3D, buildMatchResult, __CS_RESUME_WORKER_TEST__ };");
    },
  }],
});
try {
  const mod = await vite.ssrLoadModule(`/${FPS_REL}`);
  const api = mod.__CS_RESUME_WORKER_TEST__, port = mod.__FPS3D_SIM_PORT;
  ck("E0 Worker 用的 port.simulateFps 就是模組內 canonical simulateFps（同一個函式物件）", !!port && port.simulateFps === api.simulateFps);
  const cases = [["inferno", 0, 11521], ["mirage", 1, 11521], ["dust2", 1, 20260925]];
  for (const [mapKey, combo, seed] of cases) {
    const lib = api.TACTICS_DB[mapKey];
    const args = [mapKey, lib.t[combo], lib.ct[combo], seed, undefined, null];
    const direct = api.simulateFps(...args);
    const viaClone = api.simulateFps(...structuredClone(args));
    const back = structuredClone(direct);
    ck(`E1 ${mapKey}/${combo} seed ${seed}：輸入 structured clone 後輸出逐位元相同`, sha(direct) === sha(viaClone), `${direct.rounds} 回合 ${direct.tScore}:${direct.ctScore}`);
    ck(`E2 ${mapKey}/${combo} seed ${seed}：輸出 structured clone 回主執行緒後逐位元相同`, sha(direct) === sha(back));
  }

  // A：非同步掛載路徑
  const lib = api.TACTICS_DB.inferno;
  const args = ["inferno", lib.t[1], lib.ct[1], 777, undefined, null];
  const expected = sha(api.simulateFps(...args));
  api.releaseMountSimulation?.({});                 // 不影響：只放掉相同參照
  port.runner = null;
  let r0 = api.simulateFpsForMountAsync(...args);
  ck("A1 沒有 runner ⇒ 同步計算（不 Suspense）", r0 && sha(r0) === expected);
  api.releaseMountSimulation(r0);
  let calls = 0;
  port.runner = (a) => { calls++; return Promise.resolve(structuredClone(api.simulateFps(...structuredClone(a)))); };
  let thrown = null;
  try { api.simulateFpsForMountAsync(...args); } catch (p) { thrown = p; }
  ck("A2 有 runner、快取沒命中 ⇒ 丟出 promise（Suspense）", thrown && typeof thrown.then === "function");
  let thrown2 = null;
  try { api.simulateFpsForMountAsync(...args); } catch (p) { thrown2 = p; }
  ck("A3 同一組輸入重複 render 只排一次 Worker 工作", thrown2 === thrown && calls <= 1);
  await thrown;
  const r1 = api.simulateFpsForMountAsync(...args);
  ck("A4 Worker 完成後 ⇒ 命中快取、與同步版逐位元相同", sha(r1) === expected && calls === 1);
  api.releaseMountSimulation(r1);
  port.runner = () => Promise.reject(new Error("boom"));
  let thrown3 = null;
  try { api.simulateFpsForMountAsync(...args); } catch (p) { thrown3 = p; }
  await thrown3;
  const r2 = api.simulateFpsForMountAsync(...args);
  ck("A5 Worker 失敗 ⇒ 退回主執行緒同步計算，結果不變", sha(r2) === expected);
  port.runner = null;
} finally {
  await vite.close();
}
console.log(`\nCS resume worker：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
