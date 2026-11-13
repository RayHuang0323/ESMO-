// ============================================================================
//  tools/owner_preview/vite.v21-preview.config.mjs — MOBA v21 戰術書：本機 Owner Preview（2026-11-10）
//
//  【狀態】v21 發布 BLOCKED / NOT APPROVED（review/tactic-book-3a/v21_Sprint0_Owner裁定與後續.md）。
//  這個檔只給 Owner 在自己的電腦上看 v21 戰術書與對戰行為；不是發布工具，正式 build（npm run build）與 deploy.yml 都不會讀它。
//
//  【做法】與 tools/browser_check_tactic_book_v21.mjs 相同的手法，搬到 dev server 端：
//   · 不改 src。dev server 送出 src/featureFlags.js 時，把 `mobaTacticalDirectorV21: false,` 換成 true（必須恰好一處，否則啟動失敗）。
//   · mobaChallengeV21 不動 ⇒ Challenge 仍是 challenge.v20。
//  【隔離】
//   · 只綁 127.0.0.1、固定 port 5621（被占用就失敗，不自動換 port）⇒ 瀏覽器存檔的 origin 是 http://127.0.0.1:5621，
//     與正式站（github.io）及其他本機預覽的 localStorage 完全分開。
//   · envDir 指向一個空資料夾 ⇒ 不會載入任何 .env；VITE_SUPABASE_* 另外強制成空字串 ⇒ 雲端存檔維持「未設定」（LocalSaveProvider）。
//   · cacheDir 放在 repo 外 ⇒ 不寫進共用的 node_modules（那是別的工作區的 junction）。
//
//  執行（在 worktree 根目錄）：
//    node node_modules/vite/bin/vite.js --config tools/owner_preview/vite.v21-preview.config.mjs
//  網址： http://127.0.0.1:5621/ESMO-/
// ============================================================================
import { mergeConfig } from "vite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import base from "../../vite.config.js";

const FLAG_FILE = /\/src\/featureFlags\.js(\?.*)?$/;
const FLAG_OFF = "mobaTacticalDirectorV21: false,";
const FLAG_ON = "mobaTacticalDirectorV21: true,";
const JUNGLE_OFF = "mobaJungleV22: false,";
const JUNGLE_ON = "mobaJungleV22: true,";
const ROUTE_OFF = "mobaSafeRouteV23: false,";
const ROUTE_ON = "mobaSafeRouteV23: true,";
const PORT = 5621;
const OUTSIDE = join(tmpdir(), "esmo-v21-owner-preview");
const EMPTY_ENV_DIR = join(OUTSIDE, "empty-env");
mkdirSync(EMPTY_ENV_DIR, { recursive: true });

const BANNER = `<div data-owner-preview="v21" style="position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;font:700 10px/1.3 system-ui,sans-serif;color:#111;background:#ffd54a;border-radius:4px;padding:2px 6px;opacity:.85">OWNER PREVIEW · v21＋v22＋v23（路線安全＋塔邊決策＋塔邊等待 v3＋導航安全 v4）候選 未核准發布 · 本機隔離</div>`;

const v21FlagPreview = {
  name: "esmo-owner-preview-v21-flag",
  enforce: "pre",
  transform(code, id) {
    if (!FLAG_FILE.test(id.replace(/\\/g, "/"))) return null;
    const hits = code.split(FLAG_OFF).length - 1;
    if (hits !== 1) throw new Error(`[owner-preview] expected exactly one "${FLAG_OFF}" in featureFlags.js, found ${hits}; preview refuses to start`);
    //  moba-sim.v22 候選（Buff 營站位＋野區入侵 v2）：預覽也打開 mobaJungleV22（同樣必須恰好一處）。ESMO_PREVIEW_V22=0 ⇒ 只開 v21（對照用）。
    let out = code.replace(FLAG_OFF, FLAG_ON);
    if (process.env.ESMO_PREVIEW_V22 !== "0") {
      const h2 = out.split(JUNGLE_OFF).length - 1;
      if (h2 !== 1) throw new Error(`[owner-preview] expected exactly one "${JUNGLE_OFF}" in featureFlags.js, found ${h2}; preview refuses to start`);
      out = out.replace(JUNGLE_OFF, JUNGLE_ON);
      //  moba-sim.v23 候選（路線安全）：同樣只在送出時替換、必須恰好一處。ESMO_PREVIEW_V23=0 ⇒ 停在 v22（對照用）。
      if (process.env.ESMO_PREVIEW_V23 !== "0") {
        const h3 = out.split(ROUTE_OFF).length - 1;
        if (h3 !== 1) throw new Error(`[owner-preview] expected exactly one "${ROUTE_OFF}" in featureFlags.js, found ${h3}; preview refuses to start`);
        out = out.replace(ROUTE_OFF, ROUTE_ON);
      }
    }
    return { code: out, map: null };
  },
  transformIndexHtml(html) {
    return html.replace("</body>", `${BANNER}</body>`);
  },
};

export default mergeConfig(base, {
  plugins: [v21FlagPreview],
  envDir: EMPTY_ENV_DIR,
  cacheDir: join(OUTSIDE, "vite-cache"),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  server: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
});
