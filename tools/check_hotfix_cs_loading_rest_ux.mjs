#!/usr/bin/env node
// ============================================================================
//  tools/check_hotfix_cs_loading_rest_ux.mjs — hotfix/cs-loading-rest-ux 契約守門
//
//  執行：node tools/check_hotfix_cs_loading_rest_ux.mjs；失敗 exit 1。
//  瀏覽器實測另見 browser_check_hotfix_cs_loading_rest_ux（桌機＋390）。
//
//    R  restBookingOf：free／rest／training 三分類、文案明確、不寫狀態
//    D  Dashboard 提醒只算可安排的人；面板用同一份判讀、全選只選可安排、已安排的有「調整」
//    P  Player Detail：同一份判讀＋同一個 assignTraining，已安排時顯示內容＋調整
//    L  CS 首次進場：preload 提早開始、Loading 等 rigged 就緒才放行、有上限、不加假人 fallback
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

console.log("══ hotfix/cs-loading-rest-ux ══\n");

// ── R ─────────────────────────────────────────────────────────────────────
const rb = await import(pathToFileURL(path.join(ROOT, "src/platform/condition/restBooking.js")).href);
const free = rb.restBookingOf({ id: "a", training: null });
const rest = rb.restBookingOf({ id: "b", training: { courseId: "rest", daysLeft: 1, totalDays: 1 } });
const aim = rb.restBookingOf({ id: "c", training: { courseId: "aim", daysLeft: 2, totalDays: 3 } });
ck("R1 沒課 ⇒ free、可安排", free.kind === "free" && rb.canBookRest({ training: null }));
ck("R2 休息 ⇒「已安排休息（剩 N 天）」", rest.kind === "rest" && rest.label === "已安排休息（剩 1 天）", rest.label);
ck("R3 訓練 ⇒「訓練中：課名（剩 N 天）」", aim.kind === "training" && aim.label === "訓練中：精準射擊訓練（剩 2 天）", aim.label);
ck("R4 已安排的人不可再安排（不能 double-book）", !rb.canBookRest({ training: { courseId: "rest", daysLeft: 1 } }) && !rb.canBookRest({ training: { courseId: "aim", daysLeft: 2 } }));
const rbSrc = code(read("src/platform/condition/restBooking.js"));
ck("R5 判讀模組不寫任何狀態（沒有 store／set／patch／energy 寫入）",
  !/useProfileStore|set\(|_patchPlayer|assignTraining\(|\.energy\s*=/.test(rbSrc));

// ── D ─────────────────────────────────────────────────────────────────────
const dash = code(read("src/screens/DashboardScreen.jsx"));
const panel = code(read("src/screens/dashboard/RestPlannerPanel.jsx"));
ck("D1 首頁提醒只算可安排的人（needsAttention.filter(canBookRest)）",
  /needsAttention\.filter\(canBookRest\)/.test(dash) && /badge: restable\.length/.test(dash));
ck("D2 面板用 restBookingOf，不再用 `!!p.training` 一刀切成「已安排」",
  panel.includes("restBookingOf(p)") && !/resting:\s*!!p\.training/.test(panel));
ck("D3 全選只選可安排（selectable = kind === \"free\"）",
  /selectable = candidates\.filter\(\(c\) => c\.booking\.kind === "free"\)/.test(panel) && /new Set\(selectable\.map/.test(panel));
ck("D4 已安排的列顯示具體狀態＋「調整」入口",
  panel.includes("rest-player-status") && panel.includes("booking.label") && panel.includes("rest-player-adjust"));
ck("D5 仍只走 onAssignRest（Dashboard 端是 assignTraining(id,\"rest\")），不直接改 energy",
  dash.includes('assignTraining?.(id, "rest")') && !/energy\s*[:=]/.test(panel) && !/patchPlayer|setState/.test(panel));

// ── P ─────────────────────────────────────────────────────────────────────
const pd = code(read("src/screens/manage/PlayerDetailScreen.jsx"));
ck("P1 Player Detail 用同一份判讀與同一個動作",
  pd.includes("restBookingOf(p)") && pd.includes('assignTraining?.(p.id, "rest")') && !/_patchPlayer|\.energy\s*=/.test(pd));
ck("P2 已安排 ⇒ 顯示內容＋調整（player-rest-status／player-rest-adjust）",
  pd.includes("player-rest-status") && pd.includes("player-rest-adjust") && pd.includes("onOpenTraining"));
ck("P3 AppShell 把 Player Detail 的「調整」接到訓練中心",
  /<PlayerDetailScreen[^>]*onOpenTraining=\{go\("training"\)\}/.test(read("src/AppShell.jsx")));

// ── L ─────────────────────────────────────────────────────────────────────
const rend = read("src/battle/fps/presentation/FpsCharacterRenderer.js");
const load = code(read("src/screens/fps/CsLoadingScreen.jsx"));
ck("L1 renderer 提供 preload 與就緒狀態，preload 走同一個 assetPromise",
  /export function preloadFpsCharacterAssets\(\)\s*\{\s*return loadFpsCharacterAssets\(\)/.test(rend) && /export const fpsCharacterAssetState/.test(rend));
ck("L2 CS 賽前與 Battle 首次 render 都提早 preload",
  code(read("src/screens/fps/CsPrepScreen.jsx")).includes("preloadFpsCharacterAssets()")
    && code(read("src/screens/fps/CsMatchScreen.jsx")).includes("preloadFpsCharacterAssets()"));
ck("L3 Loading 等 rigged ready／failed 才放行，且有上限（不會卡死）",
  load.includes('rig === "ready"') && load.includes('rig === "failed"') && /RIG_WAIT_CAP_MS = \d+/.test(load)
    && Number(/RIG_WAIT_CAP_MS = (\d+)/.exec(load)?.[1]) <= 60000);
ck("L4 等待時誠實顯示「正在載入選手模型」", load.includes("正在載入選手模型"));
ck("L5 沒有恢復 primitive 假人 fallback（Loading／preload 不碰 primitive）",
  !/primitive/i.test(load) && !/primitive/i.test(code(read("src/screens/fps/CsPrepScreen.jsx"))));

console.log(`\nhotfix/cs-loading-rest-ux：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
