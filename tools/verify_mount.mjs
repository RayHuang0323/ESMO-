// ============================================================================
//  tools/verify_mount.mjs — 在「你的 repo 根目錄」執行：node tools/verify_mount.mjs
//  逐層驗證掛載鏈：index.html → src/main.jsx → GameView → 3D/呈現層 → HUD
//  任何 ❌ 就是畫面沒變的斷點。
// ============================================================================
import { readFileSync, existsSync } from "fs";

let fail = 0;
const chk = (name, ok, hint = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${!ok && hint ? "\n   ↳ 修法：" + hint : ""}`); if (!ok) fail++; };
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// ① index.html → /src/main.jsx
const html = read("index.html");
chk("index.html 載入 /src/main.jsx", html && /src="\/src\/main\.jsx"/.test(html), "index.html 的 <script type=module src> 必須指向 /src/main.jsx");

// ② main.jsx 存在且 render 主幹 GameView（不是 Legacy App）
const main = read("src/main.jsx");
chk("src/main.jsx 存在", !!main, "把交付的 src/main.jsx 放入 repo 的 src/");
if (main) {
  chk("main.jsx render <GameView/>", /from\s+["']\.\/GameView\.jsx["']/.test(main) && /<GameView/.test(main), "main.jsx 必須 import ./GameView.jsx 並渲染 <GameView/>");
  chk("main.jsx 沒有渲染 Legacy App.jsx", !(/from\s+["']\.\/App(\.jsx)?["']/.test(main) && /<App/.test(main)), "移除 <App/>：App.jsx 是自帶內聯舊引擎的沙盒殼，會繞過 Sprint04–06 全部");
}

// ③ 主幹檔案就位（src/ 之下）
for (const f of ["src/GameView.jsx", "src/MobaView3D.jsx", "src/LogicEngine.js", "src/gameData.js", "src/useGameStore.js", "src/useLocalServer.js",
  "src/battle/useBattleFeed.js", "src/battle/battleStore.js", "src/battle/battleEvents.js", "src/battle/battleReducer.js", "src/battle/battleFocus.js",
  "src/battle/ui/BattlePresentationLayer.jsx", "src/battle/ui/BattleHUD.jsx", "src/battle/ui/BattleTimeline.jsx", "src/battle/ui/BattleFloatingText.jsx",
  "src/battle/ui/BattleScoreboard.jsx", "src/battle/ui/BattleEndScreen.jsx", "src/battle/ui/BattleCameraController.jsx"])
  chk(`檔案就位 ${f}`, existsSync(f), "從 Sprint 交付複製到此路徑");

// ④ 版本指紋：確認是 Sprint05/06 版（不是舊檔覆蓋失敗）
const le = read("src/LogicEngine.js") || "";
chk("LogicEngine 是 Sprint05+ 版（撤退遲滯）", /retreating/.test(le), "src/LogicEngine.js 仍是舊版，用 Sprint06 交付覆蓋");
chk("LogicEngine 是 Sprint06 版（助攻儀器化）", /hitBy/.test(le), "用 Sprint06 交付覆蓋");
const gd = read("src/gameData.js") || "";
chk("gameData 是 Sprint05 版（TOWER_HP 2100）", /TOWER_HP = 2100/.test(gd), "src/gameData.js 仍是舊數值，用 Sprint05 交付覆蓋");
const gv = read("src/GameView.jsx") || "";
chk("GameView 是 Sprint06 版（掛 BattlePresentationLayer）", /BattlePresentationLayer/.test(gv), "用 Sprint06 交付覆蓋 src/GameView.jsx");
chk("GameView 含掛載信標（畫面右下 ESMO 主幹 · S06）", /ESMO 主幹/.test(gv), "覆蓋為含信標版；重整後畫面右下應看到 tag");
const mv = read("src/MobaView3D.jsx") || "";
chk("MobaView3D 是 Sprint06 版（Overlay+相機）", /BattleCameraController/.test(mv) && /makeOverlaySprite/.test(mv), "用 Sprint06 交付覆蓋 src/MobaView3D.jsx");

console.log(fail === 0
  ? "\n✅ 掛載鏈全通。npm run dev 後畫面右下應出現「ESMO 主幹 · S06」信標；沒出現 = 瀏覽器快取，硬重整（Ctrl+Shift+R）。"
  : `\n❌ 共 ${fail} 處斷點——由上往下修，第一個 ❌ 通常就是根因。`);
process.exit(fail ? 1 : 0);
