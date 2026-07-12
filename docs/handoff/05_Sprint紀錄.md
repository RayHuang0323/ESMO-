# 05 Sprint 紀錄

## Sprint 01～15 摘要

早期 Sprint 建立了新架構與 3D Battle，但曾一度偏離 Legacy UI / UX。

後續已修正方向為：

**Legacy Experience + Modern Architecture**

## Sprint 16

Legacy MainMenu / Dashboard Recovery。

完成：

- 隊伍資訊
- Lv / XP
- 收件匣
- 天賦
- 商店
- 財務 9 週收支圖
- 贊助
- 選手
- 招募
- MOBA / CS / 賽事
- 更多功能

注意：

Sprint 16 恢復的是 MainMenu 首頁，不是 DashModule 經營儀表板功能頁。

## Sprint 17

MOBA Hero System Recovery。

完成：

- Hero Database Audit
- 發現 Legacy 三份英雄資料：
  - CHAMPIONS_100
  - SKILL_DB
  - CHAMP_DATA
- 合併進 `src/data/heroDatabase.js`
- Hero Detail 四分頁：
  - 概覽
  - 數據
  - 技能
  - 戰術
- Codex 100 英雄
- Ban/Pick 共用 HeroCodexDetail

保留：

- `HeroCodexDetail` = 英雄靜態資料
- `HeroDetailPanel` = 戰中 / 選手 / 進度資料

## Sprint 18

MOBA Pre-Match & Battle UI Legacy Recovery。

完成：

- Legacy DraftModule 輪選 UI
- 14 步 Ban/Pick
- Ban 區 / Pick 區
- 定位分類 tab
- 英雄資訊按鈕
- Loading 5v5 英雄卡
- Battle Hero Strip
- Battle HUD / Timeline 部分 Legacy Overlay
- RoleSelect 部分再對齊 Legacy

已知限制：

- mana / CS / 召喚師技能 / 技能 CD 尚未接資料。
- chat / caster 事件尚未有引擎事件流。
- 英雄真實圖片尚未完整抽回。
- Battle 仍保持 3D。
- Draft 選角結果還需要完整串到 Battle Presentation。

## Sprint 19 目標

MOBA 主流程修復 + Draft Presentation 串接。

目前實測問題：

首頁點 MOBA 後，不應直接進入單一選手詳細頁。

正確應為：

Dashboard  
→ 5 人賽前配置  
→ 配對  
→ Ban/Pick  
→ 戰術  
→ Loading  
→ Battle  
→ Result

Sprint 19 要修正這條流程。

Sprint 19：
MOBA 主流程修復 + Draft Presentation 串接。

完成：
- 修正 MOBA 入口，不再進單一選手 Profile。
- LineupScreen 成為 5 人賽前配置主頁。
- RoleSelectScreen 從 AppShell 主流程移除。
- Ban/Pick draft 傳至 Loading、GameView、BattlePresentationLayer、BattleHeroStrip。
- Tactic 選擇傳至 Loading 與 BattleHUD。
- BattleHeroStrip 顯示 draft 英雄。
- 20 seed 回歸不變。

待辦：
- HERO_IMG 抽取。
- PostMatchDashboard 移除 genMatch 假資料。

## Sprint 20

Hero Images + PostMatch Result Recovery。

完成：

- HERO_IMG Audit：Legacy `EsportsGame.jsx` line 21，100 張 JPEG base64
  （raw 393KB / decoded 293KB / gzip 約 280KB），key 與 heroDatabase 100 位英雄 1:1
  完全對應（0 缺圖、0 孤兒）。
- 新增 `src/data/heroImages.js`（純資源表，非第二套 Hero Database）。
- `heroDatabase.js` 新增 `heroImage(id)` / `heroPortrait(id)` / `hasHeroImage(id)`，
  UI 只能經此取圖；已用 grep 驗證無任何 UI 直接 import 資源表。
- 新增 `src/ui/HeroPortrait.jsx`：共用接圖元件，缺圖或 onError → 呼叫端原程序化色塊 fallback。
- 已接圖 UI：CodexScreen、HeroCodexDetail、BanPickScreen（ChampFace：Ban 區/Pick 區/選擇器）、
  LoadingScreen 5v5、BattleHeroStrip、BattleEndScreen（MVP 卡 + 成長欄）。
- Result 查核結論：主幹沒有 `genMatch`，也沒有 `PostMatchDashboard`（兩者只存在 Legacy 檔）；
  `BattleEndScreen` 自 Sprint09 起就只讀 `battleStore.result`。
- Draft → Result 一致性（本 Sprint 真正的缺口）：
  新增 `src/battle/moba/draftRoster.js`（`draftRoster` / `draftHeroAssign`，純函數 Adapter）。
  `useBattleFeed(draft)` 把 draft 餵給 `snapshotToBattleResult` 既有的 `heroAssign` 選項 →
  `BattleResult.players[].heroId` = Ban/Pick 選角；`GameView` 用生效名單餵 3D 名牌 /
  HUD / 記分板 / 終局畫面。無 draft → 全數退回 ROSTER 預設（Sprint19 行為不變）。

驗證：

- `npm run build` 通過（bundle 1,641KB / gzip 641KB，其中英雄圖佔 393KB）。
- Contract / Engine 檔（LogicEngine、battleResult、battleStore、heroProgress、seasonStore、
  platform/contracts、roster、gameData）git diff 零改變。
- 20 seed 回歸與基準逐行零差異（結束率 15/15、平均 18.3 分、平均擊殺 55.8）。
- Node 契約測試：draft 對位、缺 picks 退回、BattleResult 結構未變、
  勝負/KDA/rating/MVP 不受 draft 影響。
- SSR 渲染測試：Codex 100 張、HeroDetail 1 張、ChampFace 20/20、Loading 10 張、
  HeroStrip 10 張、MVP 卡英雄圖與名稱 = draft 選角。

已知限制：

- 引擎 loadout 仍以預設 HERO_ASSIGN 產生（Battle Balance 凍結），
  英雄數值不影響勝負；Draft 目前是 Presentation + Result 身分層。
- BattleScoreboard / HeroDetailPanel 尚未加英雄圖（不在本 Sprint 接線清單）。
- 英雄圖以 base64 內嵌，bundle +393KB；若日後要瘦身，可改為 public/ 靜態檔 + 懶載入。
