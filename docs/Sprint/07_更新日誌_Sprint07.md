# 更新日誌 — Sprint 07：Battle UX（Professional Spectator UI）

## 盤點結論（真資料已存在但 UI 未用 → 本 Sprint 全數上畫面）
`p.state`（撤退/團戰/圍攻）、`dragon/baron.respawn`（重生倒數）、`feed.assists`（結構化戰報）、事件 `pos`（導播聚焦）。缺口：Tower Damage（附加儀器化補齊）、Lv（佔位，不造假）。

## 修改檔案（完整路徑）
- `src/LogicEngine.js`：**唯一引擎觸碰**——`twrDmg` 個人推塔傷害（3 處純附加；5 seed 逐幀等價 ✅）
- `src/battle/battleEvents.js`：事件結構化 `data`（killer/victim/assists/lane/tier/streak/isNexus）
- `src/battle/battleReducer.js`：`series` 金錢/推塔時間序取樣（15s 間隔+終局補點；呈現層衍生，非第二套 state）
- `src/battle/battleFocus.js`：`computeSpectatorFocus`（VICTORY鎖主堡 > ACE/連殺 > 塔/龍/巴龍事件 > 交戰聚類 > 重心）
- `src/battle/ui/BattleHUD.jsx`：轉播級 v3——隊伍膠囊（大比分/推塔/龍/巴龍/金）、中央計時+金差、**資源重生倒數**、勝率條、MVP chip、進場動畫
- `src/battle/ui/BattleTimeline.jsx`：圖形化 v2——事件 Icon、陣營色邊條、擊殺者⚔被擊殺者、助攻數、路徽章（上/中/下/堡）、可收合
- `src/battle/ui/BattleScoreboard.jsx`：v3——**點欄位排序**（KDA/Gold/DMG/HEAL/拆塔/參與/RTG）、拆塔欄、MVP highlight
- `src/battle/ui/BattleEndScreen.jsx`：v2——Banner 掃光、MVP 翻轉動畫、六榜（擊殺/傷害/治療/**參團**/**推塔**/金）、**金錢差曲線圖**、**推塔進度圖**（series 真取樣）、龍巴龍統計、戰報摘要
- `src/battle/ui/BattleCameraController.jsx`：改用 computeSpectatorFocus（事件驅動導播）
- `src/MobaView3D.jsx`：Overlay v2——三行制（英雄名/玩家名·Lv佔位/KDA或☠倒數）+ **狀態徽章**（⛊撤退/⚔團戰/⚑圍攻，讀 `p.state` 真資料）

## Battle UX 前後比較
| 面向 | Sprint06 | Sprint07 |
|---|---|---|
| HUD | 單行比分+勝率 | 轉播級雙膠囊+資源倒數+金差+MVP |
| Overlay | 名字+KDA | 英雄/玩家/Lv佔位/狀態徽章/☠倒數 |
| Timeline | 純文字 | Icon+陣營色+結構化擊殺列+路徽章 |
| Scoreboard | 固定排序 | 7 欄可排序+拆塔欄 |
| 導播 | 交戰聚類 | 事件驅動（Victory鎖主堡/ACE/推塔/龍巴龍）|
| 終局 | MVP+四榜 | 掃光Banner+六榜+金錢圖+推塔圖+龍巴龍 |

## Node 驗證
twrDmg 等價 5 seed ✅｜20 seed 回歸與 Sprint05/06 逐字一致 ✅｜結構化事件 ✅｜series 81 點單調+終局補點 ✅｜VICTORY 聚焦被毀主堡 ✅｜事件過期回退 ✅｜單向流動 ✅｜snapshot 契約 ✅｜掛載鏈 26 斷言 ✅

## 本機需驗證
`node tools/verify_mount.mjs` → `npm run dev`：信標「ESMO 主幹 · S06」仍在；HUD 資源倒數跳動；Overlay 徽章隨狀態切換；TAB 點欄位排序；導播在推塔/團戰/終局的鏡頭手感（`EVENT_HOLD` 秒數可調）；終局兩張圖渲染。

## 技術債
Lv/Mana 仍佔位（待英雄成長系統）；Rating 公式仍為呈現層暫定；Overlay canvas 重繪在狀態頻繁切換時的效能需本機實測（已做字串 diff 節流）；小兵推塔傷害無個人歸屬（僅英雄 twrDmg）。

## Sprint 08 最佳建議
**英雄成長系統（Lv/經驗/per-level 成長）+ Sprint02 heroes.js roster 回同步**：一次填掉 Lv 佔位與真實選手/英雄名兩個缺口，讓 Overlay/記分板/終局畫面的最後假位補上真資料。
