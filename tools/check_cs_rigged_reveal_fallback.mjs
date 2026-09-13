#!/usr/bin/env node
// ============================================================================
//  CS rigged reveal fallback（60 秒）：deterministic 單元測試
//
//  執行：node tools/check_cs_rigged_reveal_fallback.mjs
//
//  直接呼叫 runtime 同一支 `primitiveBodyAllowed(st, P)`（vite SSR 在記憶體裡暴露，原始檔不動），
//  不等真實時間，只給 deadline：
//    NORMAL_PATH ：rigged 載入中、期限未到 ⇒ 不畫舊 primitive
//    TIMEOUT_PATH：載入中、期限已到／已過 ⇒ 畫 primitive（不會永久 invisible）
//    fallback safety：failed／fallback／沒有 controller ⇒ 一律畫 primitive；rigged ⇒ 不畫
//  另以原始碼確認：期限常數 60000、map build 設定 deadline、四處 primitive 可見性都走這支函式。
//  真的等 60 秒的瀏覽器驗證見 browser_check_cs_rigged_reveal_timeout.mjs。
// ============================================================================
import { createServer } from "vite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };

const source = readFileSync(FPS_FILE, "utf8");
//  ⚠ 只看會執行的程式行：根因註解裡本來就寫著舊規則的原文，不能算「舊規則還在」。
const codeOnly = source.split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n");
ck("期限常數是 60000ms", /const RIGGED_REVEAL_TIMEOUT_MS=60000;/.test(codeOnly));
ck("map build 設定 deadline = now + 期限", codeOnly.includes('st.riggedRevealDeadline=(typeof performance!=="undefined"?performance.now():0)+RIGGED_REVEAL_TIMEOUT_MS;'));
const viaHelper = codeOnly.split("P.body.visible=primitiveBodyAllowed(st,P)").length - 1;
const oldRule1 = codeOnly.split("P.body.visible=!riggedActive").length - 1;
const oldRule2 = codeOnly.split('P.body.visible=P.rigged?.mode!=="rigged"').length - 1;
ck("四處 primitive 可見性都走 primitiveBodyAllowed，程式碼中舊規則已不存在",
  viaHelper === 4 && oldRule1 === 0 && oldRule2 === 0, `helper ${viaHelper} 處｜舊規則 ${oldRule1 + oldRule2} 處`);

const vite = await createServer({
  root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
  cacheDir: join(mkdtempSync(join(tmpdir(), "cs-rigged-reveal-")), "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  plugins: [{
    name: "cs-rigged-reveal-fallback", enforce: "pre",
    transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      if (!code.includes(RETURN_MARKER) || !code.includes(EXPORT_MARKER)) throw new Error("EsportsFPS3D export markers missing");
      return code
        .replace(RETURN_MARKER, "return { EsportsFPS3D, buildMatchResult, primitiveBodyAllowed, RIGGED_REVEAL_TIMEOUT_MS };")
        .replace(EXPORT_MARKER, "const __CS_RIGGED_REVEAL_TEST__={primitiveBodyAllowed:__FPS3D_MODULE.primitiveBodyAllowed,RIGGED_REVEAL_TIMEOUT_MS:__FPS3D_MODULE.RIGGED_REVEAL_TIMEOUT_MS};\nexport { EsportsFPS3D, buildMatchResult, __CS_RIGGED_REVEAL_TEST__ };");
    },
  }],
});

try {
  const { primitiveBodyAllowed: allowed, RIGGED_REVEAL_TIMEOUT_MS: TIMEOUT } = (await vite.ssrLoadModule("/src/battle/fps/EsportsFPS3D.jsx")).__CS_RIGGED_REVEAL_TEST__;
  ck("runtime 的 primitiveBodyAllowed 載得起來，常數 = 60000", typeof allowed === "function" && TIMEOUT === 60000, String(TIMEOUT));

  const now = performance.now();
  const st = (deadline) => ({ riggedRevealDeadline: deadline });
  const P = (mode) => ({ rigged: mode == null ? null : { mode } });

  // NORMAL_PATH
  ck("NORMAL_PATH：loading、剛開始（期限還有 60 秒）⇒ 不畫舊 primitive", allowed(st(now + TIMEOUT), P("loading")) === false);
  ck("NORMAL_PATH：loading、59.9 秒時仍未到期 ⇒ 不畫舊 primitive", allowed(st(now + 100), P("loading")) === false);
  ck("NORMAL_PATH：rigged 就位 ⇒ 不畫 primitive（正式角色）", allowed(st(now + TIMEOUT), P("rigged")) === false);
  // TIMEOUT_PATH
  ck("TIMEOUT_PATH：loading、剛好到期 ⇒ 畫 primitive fallback", allowed(st(performance.now()), P("loading")) === true);
  ck("TIMEOUT_PATH：loading、超過 60 秒 ⇒ 畫 primitive fallback（不會永久 invisible）", allowed(st(now - 1), P("loading")) === true);
  ck("TIMEOUT_PATH：過期後 rigged 才就位 ⇒ 切回正式角色、不再畫 primitive", allowed(st(now - 5000), P("rigged")) === false);
  // fallback safety
  ck("fallback safety：載入失敗 failed ⇒ 立刻畫 primitive（不等期限）", allowed(st(now + TIMEOUT), P("failed")) === true);
  ck("fallback safety：關閉 rigged（fallback）⇒ 畫 primitive", allowed(st(now + TIMEOUT), P("fallback")) === true);
  ck("fallback safety：沒有 rigged controller ⇒ 畫 primitive", allowed(st(now + TIMEOUT), P(null)) === true);
} finally {
  await vite.close();
}

console.log(`\nCS rigged reveal fallback：${pass}/${pass + fail}　RESULT=${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
