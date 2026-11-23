// ============================================================================
//  tools/c2/vite.c2-preview.config.mjs — local Owner Preview of the moba-sim.v26 candidate (C2 Cross-Engine Determinism, 2026-11-23)
//  （由 tools/c1/vite.c1-preview.config.mjs 複製；差別只有：旗標換成 v26、port 5648、獨立 cache／標語。量測 API 沿用 tools/c1/c1_preview_hook.js。）
//
//  【狀態】moba-sim.v26 未核准發布。這個檔只給 Owner 在自己的電腦上看；正式 build（npm run build）與 deploy.yml 都不會讀它。
//  【做法】與 tools/owner_preview/vite.v24-preview.config.mjs 相同：不改 src；送出 src/featureFlags.js 時把五個旗標換成 true
//          （mobaTacticalDirectorV21、mobaJungleV22、mobaSafeRouteV23、mobaTacticExecV24、mobaDetMathV26；每一個都必須恰好一處，否則拒絕啟動）
//          ⇒ 生涯對局解析成 career.v26（mathKernel "det.v2"）。
//          另外把 tools/c1/c1_preview_hook.js 接進 src/main.jsx（載入就掛 window.__esmoC1 量測 API）與 useLocalServer.js
//          （只記錄本場 MatchSetup，原樣回傳，不改對局）。
//  【隔離】只綁 127.0.0.1、port 5648（strictPort）⇒ 存檔 origin 與 5644／5646／5647、正式站完全分開；envDir 指向空資料夾、VITE_SUPABASE_* 強制空字串；cacheDir 在 repo 外。
//  建置： node node_modules/vite/bin/vite.js build --config tools/c2/vite.c2-preview.config.mjs --outDir <repo 外>/dist-c2
//  預覽： node node_modules/vite/bin/vite.js preview --config tools/c2/vite.c2-preview.config.mjs --outDir <同上>
//  網址： http://127.0.0.1:5648/ESMO-/
// ============================================================================
import { mergeConfig } from "vite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../vite.config.js";

const FLAG_FILE = /\/src\/featureFlags\.js(\?.*)?$/;
const LIVE_FILE = /\/src\/useLocalServer\.js(\?.*)?$/;
const MAIN_FILE = /\/src\/main\.jsx(\?.*)?$/;
const LIVE_CALL = "const prepared = prepareLiveMatch(liveInputs);";
const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../c1/c1_preview_hook.js").replace(/\\/g, "/");
const FLIPS = ["mobaTacticalDirectorV21", "mobaJungleV22", "mobaSafeRouteV23", "mobaTacticExecV24", "mobaDetMathV26"];
const PORT = 5648;
const OUTSIDE = join(tmpdir(), "esmo-c2-owner-preview");
const EMPTY_ENV_DIR = join(OUTSIDE, "empty-env");
mkdirSync(EMPTY_ENV_DIR, { recursive: true });

const BANNER = `<div data-owner-preview="c2" style="position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:700 10px/1.3 system-ui,sans-serif;color:#111;background:#86efac;border-radius:4px;padding:2px 6px;opacity:.8">C2 預覽 · moba-sim.v26 · mathKernel det.v2（未發布）</div>`;

const c2Preview = {
  name: "esmo-owner-preview-c2",
  enforce: "pre",
  transform(code, id) {
    const f = id.replace(/\\/g, "/");
    if (MAIN_FILE.test(f)) return { code: `import ${JSON.stringify(HOOK)};\n` + code, map: null };
    if (LIVE_FILE.test(f)) {
      const hits = code.split(LIVE_CALL).length - 1;
      if (hits !== 1) throw new Error(`[owner-preview-c2] expected exactly one "${LIVE_CALL}" in useLocalServer.js, found ${hits}; preview refuses to start`);
      return { code: `import { forceMatch as __esmoC1Force } from ${JSON.stringify(HOOK)};\n` + code.replace(LIVE_CALL, "const prepared = __esmoC1Force(prepareLiveMatch(liveInputs));"), map: null };
    }
    if (!FLAG_FILE.test(f)) return null;
    let out = code;
    for (const flag of FLIPS) {
      const off = `${flag}: false,`, hits = out.split(off).length - 1;
      if (hits !== 1) throw new Error(`[owner-preview-c2] expected exactly one "${off}" in featureFlags.js, found ${hits}; preview refuses to start`);
      out = out.replace(off, `${flag}: true,`);
    }
    return { code: out, map: null };
  },
  transformIndexHtml(html) { return html.replace("</body>", `${BANNER}</body>`); },
};

export default mergeConfig(base, {
  plugins: [c2Preview],
  envDir: EMPTY_ENV_DIR,
  cacheDir: join(OUTSIDE, "vite-cache-c2"),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  server: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
  preview: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
});
