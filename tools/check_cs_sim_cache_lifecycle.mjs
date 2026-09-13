#!/usr/bin/env node
// ============================================================================
//  CS Mobile Stability Pass：返回沿用快取（simulateFpsForMount）生命週期
//
//  執行：node tools/check_cs_sim_cache_lifecycle.mjs
//
//  驗「同一場中途離開 → 保留、返回 → 沿用、比賽完成 → 釋放、換一場 → 舊的不留」，
//  以及「任何時刻最多只留一份」。瀏覽器裡走不到「比賽中途直接開新場」（CS 沒有放棄鈕），
//  所以替換路徑在這裡直接呼叫 runtime 的同一支函式驗。
//  用 vite SSR 在記憶體裡把 EsportsFPS3D 的內部函式暴露出來（不改原始檔）；
//  狀態讀 csLoadTiming.readCsSimCacheStatus()（與 runtime 同一個 module 實例）。
// ============================================================================
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const replacer = (_k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v);
const sha = (value) => createHash("sha256").update(JSON.stringify(value, replacer)).digest("hex");

const vite = await createServer({
  root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
  cacheDir: join(mkdtempSync(join(tmpdir(), "cs-sim-cache-")), "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "cs-sim-cache-lifecycle", enforce: "pre",
    transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      if (!code.includes(RETURN_MARKER) || !code.includes(EXPORT_MARKER)) throw new Error("EsportsFPS3D export markers missing");
      return code
        .replace(RETURN_MARKER, "return { EsportsFPS3D, buildMatchResult, simulateFpsForMount, releaseMountSimulation, TACTICS_DB };")
        .replace(EXPORT_MARKER, "const __CS_SIM_CACHE_TEST__={simulateFpsForMount:__FPS3D_MODULE.simulateFpsForMount,releaseMountSimulation:__FPS3D_MODULE.releaseMountSimulation,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB};\nexport { EsportsFPS3D, buildMatchResult, __CS_SIM_CACHE_TEST__ };");
    },
  }],
});

try {
  const api = (await vite.ssrLoadModule("/src/battle/fps/EsportsFPS3D.jsx")).__CS_SIM_CACHE_TEST__;
  const { readCsSimCacheStatus } = await vite.ssrLoadModule("/src/battle/fps/csLoadTiming.js");
  ck("runtime 函式與快取狀態都載得起來", Boolean(api?.simulateFpsForMount && api?.releaseMountSimulation && readCsSimCacheStatus));

  const lib = api.TACTICS_DB.mirage;
  const A = ["mirage", lib.t[0], lib.ct[0], 11521, undefined, null];
  const B = ["mirage", lib.t[0], lib.ct[0], 42, undefined, null];
  const st = () => readCsSimCacheStatus();

  const a1 = api.simulateFpsForMount(...A);
  let s = st();
  ck("① 首次進場：模擬一次並保留一份", s.held && s.stores === 1 && s.seed === 11521 && s.frames === a1.frames.length, JSON.stringify(s));

  const a2 = api.simulateFpsForMount(...A);
  s = st();
  ck("② 中途離開後返回同一場：沿用同一份（不重算）", a2 === a1 && s.reuses === 1 && s.stores === 1 && s.held, `reuses ${s.reuses}／stores ${s.stores}`);

  api.releaseMountSimulation(a1);
  s = st();
  ck("③ 比賽完成交出結果：快取釋放", !s.held && s.releasedOnComplete === 1 && s.frames === 0, JSON.stringify(s));
  api.releaseMountSimulation(a1);
  ck("③ 重複釋放不會多算", st().releasedOnComplete === 1);

  const a3 = api.simulateFpsForMount(...A);
  s = st();
  ck("④ 釋放後同一組輸入：重新模擬、結果逐位元組相同", a3 !== a1 && sha(a3) === sha(a1) && s.stores === 2 && s.held, `stores ${s.stores}`);

  const b1 = api.simulateFpsForMount(...B);
  s = st();
  ck("⑤ 中途換成另一場：舊快取被替換、只留新的一份", s.replaced === 1 && s.stores === 3 && s.held && s.seed === 42 && s.frames === b1.frames.length, JSON.stringify(s));

  api.releaseMountSimulation(a3);
  s = st();
  ck("⑥ 已被替換的舊場次交出結果：不會誤放新場的快取", s.held && s.seed === 42 && s.releasedOnComplete === 1, JSON.stringify(s));

  const a4 = api.simulateFpsForMount(...A);
  s = st();
  ck("⑦ 任何時刻最多一份：回到 A 會重算並替換 B（不是兩份並存）", a4 !== a3 && s.replaced === 2 && s.stores === 4 && s.seed === 11521, `replaced ${s.replaced}／stores ${s.stores}`);

  api.releaseMountSimulation(a4);
  ck("⑧ 最後一場完成後不持有任何快取", !st().held, JSON.stringify(st()));
} finally {
  await vite.close();
}

console.log(`\nCS sim cache lifecycle：${pass}/${pass + fail}　RESULT=${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
