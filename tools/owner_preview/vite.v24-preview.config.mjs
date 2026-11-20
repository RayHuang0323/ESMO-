// ============================================================================
//  tools/owner_preview/vite.v24-preview.config.mjs — moba-sim.v24 候選（Sprint 1；2026-11-18 起 Sprint 1.1，同日起 Sprint 1.2）的本機 Owner Preview（2026-11-17）
//
//  【狀態】v24 未核准發布。這個檔只給 Owner 在自己的電腦上看 v24 的對戰行為；正式 build（npm run build）與 deploy.yml 都不會讀它。
//  【做法】與 vite.v21-preview.config.mjs 相同：不改 src；送出 src/featureFlags.js 時把四個旗標換成 true
//          （mobaTacticalDirectorV21、mobaJungleV22、mobaSafeRouteV23、mobaTacticExecV24；每一個都必須恰好一處，否則拒絕啟動）。
//  【隔離】
//   · 只綁 127.0.0.1、port 5644（strictPort：被占用就失敗，不自動換 port）⇒ 存檔 origin 與 5643（v23 預覽）、正式站完全分開。
//     **不覆蓋 5643**：輸出資料夾、port、橫幅都不同。
//   · envDir 指向空資料夾、VITE_SUPABASE_* 強制空字串 ⇒ 雲端存檔維持「未設定」。cacheDir 在 repo 外。
//  建置： node node_modules/vite/bin/vite.js build --config tools/owner_preview/vite.v24-preview.config.mjs --outDir <repo 外>/dist-v24-s1
//  預覽： node node_modules/vite/bin/vite.js preview --config tools/owner_preview/vite.v24-preview.config.mjs --outDir <同上>
//  網址： http://127.0.0.1:5644/ESMO-/
// ============================================================================
import { mergeConfig } from "vite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import base from "../../vite.config.js";

const FLAG_FILE = /\/src\/featureFlags\.js(\?.*)?$/;
//  Sprint 1.3：只在這個預覽接上僵局 Seed 的測試掛鉤（網址帶 ?stalemateSeed=120159 才生效，見 preview_force_match_v24.js）。src 不改。
const LIVE_FILE = /\/src\/useLocalServer\.js(\?.*)?$/;
const LIVE_CALL = "const prepared = prepareLiveMatch(liveInputs);";
const FORCE_MODULE = join(dirname(fileURLToPath(import.meta.url)), "preview_force_match_v24.js").replace(/\\/g, "/");
const FLIPS = ["mobaTacticalDirectorV21", "mobaJungleV22", "mobaSafeRouteV23", "mobaTacticExecV24"];
const PORT = 5644;
const OUTSIDE = join(tmpdir(), "esmo-v21-owner-preview");
const EMPTY_ENV_DIR = join(OUTSIDE, "empty-env");
mkdirSync(EMPTY_ENV_DIR, { recursive: true });

const BANNER = `<div data-owner-preview="v24" style="position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:700 10px/1.3 system-ui,sans-serif;color:#111;background:#7dd3fc;border-radius:4px;padding:2px 6px;opacity:.85">OWNER PREVIEW · moba-sim.v24 Sprint 1.3（終局護線）候選 未核准發布 · 本機隔離 5644</div>`;

const v24FlagPreview = {
  name: "esmo-owner-preview-v24-flag",
  enforce: "pre",
  transform(code, id) {
    if (LIVE_FILE.test(id.replace(/\\/g, "/"))) {
      const hits = code.split(LIVE_CALL).length - 1;
      if (hits !== 1) throw new Error(`[owner-preview-v24] expected exactly one "${LIVE_CALL}" in useLocalServer.js, found ${hits}; preview refuses to start`);
      return { code: `import { forceMatch as __esmoForceMatch } from ${JSON.stringify(FORCE_MODULE)};\n` + code.replace(LIVE_CALL, "const prepared = __esmoForceMatch(prepareLiveMatch(liveInputs));"), map: null };
    }
    if (!FLAG_FILE.test(id.replace(/\\/g, "/"))) return null;
    let out = code;
    for (const f of FLIPS) {
      const off = `${f}: false,`, hits = out.split(off).length - 1;
      if (hits !== 1) throw new Error(`[owner-preview-v24] expected exactly one "${off}" in featureFlags.js, found ${hits}; preview refuses to start`);
      out = out.replace(off, `${f}: true,`);
    }
    return { code: out, map: null };
  },
  transformIndexHtml(html) { return html.replace("</body>", `${BANNER}</body>`); },
};

export default mergeConfig(base, {
  plugins: [v24FlagPreview],
  envDir: EMPTY_ENV_DIR,
  cacheDir: join(OUTSIDE, "vite-cache-v24"),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  server: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
  preview: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
});
