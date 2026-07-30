#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_g.mjs — Milestone G 安全網
//
//  G 修兩件事：
//    1. 戰鬥隊伍面板看不到血條／狀態／秒數；點英雄開的是生涯面板而不是戰鬥資訊
//    2. 手機地圖：拖曳被瀏覽器攔截（甚至下拉重新整理弄丟整場）、縮放縮不到全圖
//
//  ⚠ G 是**呈現層**改動：引擎、公平性、地圖幾何、碰撞、Replay contract
//    一行都不能動（§4 有專門的靜態斷言）。
//  版面與手勢的實際行為由 `tools/shot_milestone_g.mjs` 在真瀏覽器驗證，
//  本檔負責「不會回歸」的結構性斷言與可計算的數值邊界。
// ============================================================================
import fs from "node:fs";
import { ZOOM_MIN, ZOOM_MAX, clampZoom, useCameraStore } from "../src/battle/cameraStore.js";
import { MAP_HALF_WORLD } from "../src/battle/moba/map/coordinateMapping.js";

let pass = 0, fail = 0;
const ck = (label, cond, extra = null) => {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`); }
};
const src = (p) => fs.readFileSync(p, "utf8");

const strip = src("src/battle/ui/BattleHeroStrip.jsx");
const sheet = src("src/battle/ui/BattleHeroSheet.jsx");
const detail = src("src/battle/ui/HeroDetailPanel.jsx");
const view = src("src/battle/moba/render/MobaRuntimeView3D.jsx");
const store = src("src/battle/cameraStore.js");
const gameView = src("src/GameView.jsx");
const layout = src("src/battle/ui/battleLayout.js");

console.log("── §1 隊伍面板：血條與戰鬥狀態 ──");
ck("1) 有可讀的水平血條元件（取代 3px 直條）",
  strip.includes("function HpBar(") && !strip.includes("function StatBars("));
ck("2) 血條讀 snapshot 的 hp，並顯示百分比與陣亡倒數",
  /hp \?\? 0\) \* 100/.test(strip) && strip.includes("respawn") && strip.includes("%"));
ck("3) 有戰鬥狀態晶片（陣亡／回城／減速／行為狀態）",
  strip.includes("function StatusChips(") &&
  strip.includes("回城") && strip.includes("statusEffects") && strip.includes("STATE_CHIP"));
ck("4) 狀態與秒數只讀既有 snapshot 欄位（不新增統計、不編造）",
  /p\.dead/.test(strip) && /p\.respawn/.test(strip) && /p\.rc/.test(strip) &&
  !/Math\.random/.test(strip));
ck("5) 英雄格有穩定測試錨點（data-testid=hero-cell）",
  strip.includes('data-testid="hero-cell"'));

console.log("\n── §2 點英雄：戰鬥資訊優先、生涯移到獨立入口 ──");
ck("6) 隊伍面板改開 BattleHeroSheet（不是生涯面板）",
  strip.includes("BattleHeroSheet") && !strip.includes("import HeroDetailPanel"));
ck("7) 戰鬥資訊面板以技能與當前戰況為主",
  sheet.includes("召喚師技能（即時冷卻）") && sheet.includes("英雄技能") &&
  sheet.includes("本場數據") && sheet.includes("血量"));
ck("8) 召喚師技能顯示引擎的即時冷卻（不是靜態圖示）",
  /s\.ready/.test(sheet) && /Math\.ceil\(s\.cd\)/.test(sheet));
ck("9) 生涯／完整能力收在獨立入口，需要才開",
  sheet.includes("英雄生涯") && sheet.includes("HeroDetailPanel") && sheet.includes("setCareer"));
ck("10) 戰鬥資訊面板不重新統計、不寫 Store",
  !/useState\(\s*\{/.test(sheet) && !sheet.includes("setResult") &&
  !sheet.includes("recordBattleResult") && !/Math\.random/.test(sheet));
ck("11) 英雄技能明示為靜態資料，不顯示假 CD",
  sheet.includes("不模擬個別技能冷卻") || sheet.includes("不顯示假 CD"));

console.log("\n── §3 手機地圖操作 ──");
ck("12) canvas 宣告 touch-action:none（瀏覽器不再攔截拖曳／下拉重新整理）",
  view.includes('touchAction = "none"'));
ck("13) 戰鬥期間關閉頁面下拉重新整理，且卸載時還原",
  gameView.includes("overscrollBehaviorY") && /prev\.root/.test(gameView));
ck("14) 直向拖曳補償俯角壓縮（兩軸不再共用同一係數）",
  view.includes("PITCH_SIN") && /k \/ PITCH_SIN/.test(view));
ck("15) 雙指同時可縮放與平移（不必縮放完再重拖一次）",
  view.includes("beginPinch") && view.includes("userViewTo") && view.includes("centroid"));
ck("16) 兩指放開一指時由剩下的手指接續拖曳（手勢不中斷）",
  /touches\.size === 1/.test(view) && /id: null/.test(view));
ck("17) 續拖的 pointer 由第一個進來的事件認領（touch id 與 pointerId 不同組）",
  /st\.drag\.id == null/.test(view));
{
  //  縮放範圍：必須能拉到「看得見整張地圖」的距離，也要保留近距離視角
  const distDefault = 175, zoomDefault = 3.4, distMax = 560, distMin = 90;
  const distAt = (zoom) => (distDefault * zoomDefault) / zoom;
  const farthest = distAt(ZOOM_MIN), closest = distAt(ZOOM_MAX);
  //  390×844 直式手機把整張地圖收進畫面所需的距離（與 view 的 fitDistance 同式）
  const halfTan = Math.tan((45 * Math.PI) / 180 / 2);
  const needH = MAP_HALF_WORLD.x / (halfTan * (390 / 844));
  const needFit = Math.min(distMax, Math.max(distMin, needH * 1.06));
  ck(`18) 縮放下限可達成「綜觀全圖」（最遠 ${farthest.toFixed(0)} ≥ 需要 ${needFit.toFixed(0)}）`,
    farthest >= needFit - 1, { farthest, needFit, ZOOM_MIN });
  ck(`19) 近距離視角保留（最近 ${closest.toFixed(0)} ≤ 120）`, closest <= 120, { closest, ZOOM_MAX });
  ck("20) 放寬的是 zoom 下限，不是相機設計包絡（最遠不超過 distMax 太多）",
    farthest <= distMax * 1.02, { farthest, distMax });
}
ck("21) clampZoom 仍以 ZOOM_MIN/ZOOM_MAX 為界（沒有繞過既有夾限）",
  clampZoom(-99) === ZOOM_MIN && clampZoom(999) === ZOOM_MAX);
{
  //  仍是同一個 cameraStore：userViewTo 與 userPanTo/userZoomTo 同語意（一律進 free）
  const s = useCameraStore.getState();
  s.backToDirector();
  s.userViewTo(50, 60, 2);
  const a = useCameraStore.getState();
  ck("22) userViewTo 沿用既有語意（進 free、pan/zoom 都被夾住）",
    a.mode === "free" && a.zoom === clampZoom(2) && Number.isFinite(a.pan.x));
  useCameraStore.getState().backToDirector();
}
ck("23) 沒有第二套相機系統（仍只有 cameraStore 一份狀態）",
  store.includes("userViewTo") && !view.includes("new OrbitControls") &&
  !view.includes("createCameraStore"));

console.log("\n── §4 禁改邊界 ──");
ck("24) 未改 LogicEngine",
  !src("src/LogicEngine.js").includes("Milestone G"));
ck("25) 未改公平性／節奏常數表",
  !src("src/battle/moba/matchProgression.js").includes("Milestone G"));
ck("26) 未改地圖幾何與碰撞來源",
  !src("src/gameData.js").includes("Milestone G") &&
  !src("src/battle/moba/nav/mobaNavigation.js").includes("Milestone G"));
ck("27) 未改 Replay contract",
  src("src/platform/contracts/mobaReplay.js").includes('MOBA_REPLAY_VERSION = "MobaReplay.v1"') &&
  !src("src/platform/contracts/mobaReplay.js").includes("Milestone G"));
ck("28) 未改 BattleResult.v2 與 Milestone E 名單資料流",
  src("src/battle/battleResult.js").includes('schema: "BattleResult.v2"') &&
  src("src/battle/moba/mobaRosterAdapter.js").includes("buildBattleRoster"));
ck("29) 面板疊層收斂在 battleLayout 的 Z 表（不散落魔術數字）",
  layout.includes("sheet:") && sheet.includes("Z.sheet") && detail.includes("Z.sheet"));
ck("30) 英雄面板疊在世界標籤之上、仍低於終局與重播",
  /sheet:\s*18/.test(layout) && /end:\s*20/.test(layout) && /replay:\s*60/.test(layout));

console.log(`\n${pass}/${pass + fail} 通過`);
console.log(JSON.stringify({
  milestone: "G",
  zoom: { ZOOM_MIN, ZOOM_MAX, farthestDist: +((175 * 3.4) / ZOOM_MIN).toFixed(1), closestDist: +((175 * 3.4) / ZOOM_MAX).toFixed(1) },
  presentationOnly: true,
  browserVerified: "tools/shot_milestone_g.mjs",
}));
process.exit(fail ? 1 : 0);
