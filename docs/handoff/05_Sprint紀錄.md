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

## Sprint 21 — Management Modules Recovery

目標：恢復八個 Legacy 經營模組（Recruit / Finance / Inbox / Sponsor / Training /
Player Detail / Team / Roster），依規範順序 **Legacy UI → Component 化 → Adapter → New Store**。

### 本 Sprint 真正的缺口：主幹沒有「選手」這個領域

`data/roster.js` 只有「選手名 + heroId」。八個模組裡有五個（Roster / Team / Training /
Recruit / PlayerDetail）整個建立在 **16 項能力值 × 個性 × 士氣 × 體力 × 潛力** 之上。
缺這層，這五個模組只能造假資料 —— 所以 Sprint21 先補領域模型，再接 UI。

### 新增檔案

規則層（純函數 / 常數，不持有狀態、不寫 localStorage）：

- `src/data/playerModel.js` — Legacy「能力值 × 個性 × 士氣」系統逐字抽取：
  `STAT_DEF`(16 項四分類)、`PERSONALITY`(10 種 boost+8/nerf−5)、`MORALE_EFFECT`、
  `CONDITION_EFFECT`、`MOBA_WEIGHTS`/`FPS_WEIGHTS`、`calcPower`、`POSITION_PROFILE`、
  `posFit`、`bestPositions`、`TRAINING_COURSES`、`applyCourse`(訓練成長結算)、
  `SPONSORS`、`ROSTER_CAP`。
- `src/data/players.js` — 我方 5 名初始選手。**身分（名字 / heroId）仍讀 `ROSTER`**，
  本檔只補 roster.js 沒有的經營欄位；Legacy `INITIAL_ROSTER` 的能力值依「路線」對位掛上
  （Legacy 上路→b1、打野→b2、中路→b3、下路→b4、輔助→b5，恰好一一對應）。
- `src/data/recruitPool.js` — Legacy `genProspects` 逐字：固定 seed 的決定性 40 人新秀池
  （`TIERS` / `TRAITS` / 定位加成 / 球探等級 / 競爭標記）。

UI 層：

- `src/ui/PlayerFace.jsx` — Legacy 程序化 SVG 選手頭像（+ `PlayerAvatar` 疊英雄小角標，
  英雄圖仍走 `HeroPortrait` 唯一入口；新秀未綁英雄 → 不亂塞）。
- `src/screens/manage/ManageFrame.jsx` — 經營模組共用外框（返回列 + 捲動容器）。
- `src/screens/manage/` 八個模組：`InboxScreen` `FinanceScreen` `SponsorScreen`
  `TeamScreen` `RosterScreen` `TrainingScreen` `RecruitScreen` `PlayerDetailScreen`。

### 修改檔案

- `src/platform/profileStore.js`（**擴充，不新建第二套 Store**）：
  新增 `players[]` / `activeSponsor` / `scouted{}` / `meta.week` /
  `finance.{monthly,incomeBd,expenseBd,transactions,budget}`；
  收件匣正規化為 `{id,type,from,subject,text,time,unread}`。
  新增行為：`renamePlayer` `setPlayerRole` `setPlayerStatus` `assignTraining`
  `advanceTrainingDay` `cancelTraining` `signSponsor` `endSponsor` `signProspect`
  `pushInbox` `markRead` `markAllRead`。全部欄位皆向下相容 localStorage（缺欄位回退 DEFAULT）。
- `src/screens/DashboardScreen.jsx` — 八個經營磚不再開假 Modal，改導向真模組頁；
  贊助卡改讀 `activeSponsor`。Modal 只留給仍未恢復的 Legacy 模組（天賦/商店/儀表板/CS）。
- `src/AppShell.jsx` — 接上八個經營畫面 + `Roster → PlayerDetail`；
  收件匣 CTA 可跨頁跳轉。MOBA 主流程未動。

### Legacy Diff Checklist

**已與 Legacy 一致**

| 模組 | 已恢復的 Legacy 版面 |
|---|---|
| Inbox | 全部已讀鈕、類型篩選膠囊、左側彩色邊條、未讀圓點、類型 badge、「前往 XX」CTA、空狀態 📭 |
| Finance | 紫色餘額大卡、總覽/分析/預算三分頁、7 月折線圖（收入面積漸層＋支出虛線）、四宮格、交易篩選、雙 Donut、預算條 >85% 警示 |
| Sponsor | 合作中大卡＋特殊加成條、六家贊助商清單（達標亮起/未達標降透明）、詳情 Modal（簽約金/週收入/合約期/總收益/加成）、條件未達標紅字 |
| Team | 戰隊識別列、MOBA/CS 分部切換、分部戰力大卡（先發 5 人平均）、先發陣容列、替補席膠囊 |
| Roster | 人數上限徽章（滿額轉紅）、五種篩選、四項聚合能力、M/F 雙戰力、狀態徽章、詳情 Modal（改名、五定位適配、16 項能力四分類、個性 ↑↓ 標色） |
| Training | 週次徽章、推進訓練日大鈕、訓練中進度條＋取消、選手體力膠囊、課程 2×N 格（體力不足變灰）、訓練日誌 |
| Recruit | 預算徽章、球探出勤橫幅、搜尋、路線＋等級篩選、換一批、潛力依偵查等級遮蔽（??? → 區間 → 精確值）、競爭中標記、詳情 Modal（淺層/深度偵查、最適位置、16 項能力、簽約） |
| PlayerDetail | AvatarRing 環形進度動畫＋Lv 徽章＋在線點、標籤膠囊、個性/士氣/狀態三欄、能力↔潛力下拉、雙欄 StatRow 條狀動畫、底部進度區（百分比＋五星＋漸層條） |

**仍不一致（誠實）**

| 項目 | 原因 | 下一步 |
|---|---|---|
| Recruit 的「轉會市場 / 我的報價」分頁 | 屬 `NegotiationModule` 領域（母隊報價・還價・合約談判），不在 Sprint21 八模組清單 | 併入未來 Negotiation Sprint |
| PlayerDetail 的「逐項潛力」 | Legacy 每項能力各有一個潛力值，但那是 demo 假資料；主幹模型只有**單一潛力天花板** | 現況顯示成長上限與成長空間，不編造逐項潛力；若要逐項需擴 Contract（待 Ray 核准） |
| PlayerDetail 國旗 / 性別 / ID #4621 | Legacy demo 假資料，資料層無此欄位 | 改顯示隊伍徽記 + 真實選手 id |
| Team 的 CS 分部 | 主幹尚無 CS 名單，目前用同一批選手的 FPS 權重呈現 | Sprint22 CS/FPS Audit |
| Finance 的金流 | 四張表（月度/結構/交易/預算）已移進 Store 成單一來源，但賽後獎金尚未回寫 | 需 `matchRecorder` 增加財務回寫 |
| 天賦 / 商店 / 經營儀表板 | 不在 Sprint21 清單 | 仍為誠實佔位 Modal |

### 驗證

- `npm run build` 通過（2500 modules，bundle 1,770KB / gzip 665KB）。
- **禁改清單 git diff 零改變**：`LogicEngine`(×2)、`battleResult`、`battleStore`、
  `platform/contracts/BattleResult`、`roster`、`heroDatabase`、`heroProgress`、
  `seasonStore`、`gameData`。→ 本 Sprint 未觸碰任何引擎輸入。
- 20 seed 回歸：結束率 15/15、平均 18.3 分、平均擊殺 55.8、平均破塔 17.4/12
  —— 與 Sprint20 基準一致（引擎檔逐位元相同，結果依建構即為零差異）。
- SSR 行為測試（九項全過）：
  1. 八模組 + Dashboard 全數 render 成功。
  2. Store 初始態正確（5 名選手、無贊助商、2/3 未讀）。
  3. `calcPower` 對五名選手輸出 Legacy 公式結果（Frost MOBA 91 最高、最適中路）。
  4. 訓練流程：指派 aim → 推進 2 日 → `accuracy 72→72.9`、`reflex 78→78.6`、
     體力 85→70、狀態轉「精神飽滿」、training 歸 null、週次遞增。
  5. 贊助門檻：mamimoth（需 15 勝）0 勝 → 擋下；local（門檻 0）→ 簽約成功、
     入帳 +10 萬、發收件匣；已有贊助時再簽 → 擋下。
  6. 招募：同 seed 決定性一致；簽下 Zeus（$77 萬）→ 名單 5→6、資金 130→53 萬（扣款正確）。
  7. 名單操作：改名 / 換定位 / 主力↔預備隊 皆寫回 Store。
  8. 收件匣 `markAllRead` → 未讀歸 0。
  9. 帶入變更狀態（新秀、已簽贊助、訓練後）後八模組重新 render 全數成功。

### 已知限制

- 經營端的能力值/戰力**不影響 Battle 勝負**（引擎 loadout 仍用預設 `HERO_ASSIGN`，
  Balance 凍結）。訓練提升的是經營端數值。
- 新秀簽進來 `heroId = null`（未綁定英雄），UI 顯示「未綁定英雄」，不亂塞英雄。
- `meta.fans` 種子值 128,000 遠高於 Legacy 贊助門檻（最高 3,000 粉絲），
  因此粉絲條件實際上恆真，門檻主要由**勝場**把關。

## Sprint 22：CS / FPS Recovery Audit + Minimal Integration

### A. FPS 主幹 Audit（結論：孤立的 Legacy Presentation，本 Sprint 前不可達）

- `EsportsFPS3D.jsx` 實際位置 `src/battle/fps/`（1,769 行，145KB）；任務單寫的
  `src/EsportsFPS3D.jsx` 不存在（Phase 4 已搬移）。
- 唯一 import 它的是 Legacy `EsportsGame.jsx`（`main.jsx` 明言不掛載）→
  **主幹 bundle 原本不含 FPS 引擎**。無重複 FPS 元件。
- Dashboard CS 入口原本落到「Legacy 尚未恢復」誠實佔位 Modal，FPS 不可進入。
- 引擎零依賴（只 import React + THREE），介面 = props in（BattleConfig 形狀）→
  `onComplete(MatchResult)` out，且已被 `platform/contracts/BattleConfig.js` 契約化。

### B. FPS Data Flow Audit（接線前 → 接線後）

| 資料域 | 接線前 | 接線後（S22） |
|---|---|---|
| profileStore.players | 完全未接（內建靜態示範陣容） | **已接**（經 fpsRoster Adapter） |
| playerModel 16 項能力 | 完全未接 | **已接**（長鍵→引擎短鍵逐字對照） |
| personality / morale / condition | 完全未接 | **已接**（引擎 persStat / formMul 原生消費） |
| roster / team（隊名） | Legacy 靜態字串 | **已接**（profileStore.team.name） |
| BattleResult | 完全未接 | **未接（刻意）**：MatchResult 是 CS 自有格式，非 BattleResult.v2；不偽造、不套 MOBA 契約 |
| SeasonStore / Match History | 完全未接 | **未接（刻意）**：同上，待 CS 結果契約（Sprint 23 提案） |
| Dashboard | 不可達 | **已接**（CS 磚 → CsMatchScreen） |
| 對手隊 Compulsary | 引擎內建 | 沿用引擎內建（不複製第二份資料，props 不傳 opponent） |

### C. 16 項能力對 FPS 的使用

- 對照表 = Legacy `EsportsGame.jsx:147` `STAT_L2S` 逐字：reflex→rxn、accuracy→acc、
  apm→apm、positioning→pos、mapAware→vis、tacticalIQ→tac、decision→dec、
  adaptability→adp、courage→cou、clutch→str、focus→foc、resilience→res、
  comms→com、leadership→led、synergy→coo、learning→lrn。
- 路線對位 = Legacy `MOBA2FPS`：上路→突破手、打野→游走手、中路→步槍手、
  下路→狙擊手、輔助→指揮。
- **Balance 未動**：Adapter 只做鍵名轉換與 FPS 綜合戰力展示值（fpsOvr），
  引擎 simulateFps 與權重原封不動。

### D/E. 最小安全接線（新增 2 檔、修改 2 檔）

- 新增 `src/battle/fps/fpsRoster.js`：純函數 Adapter（Legacy 轉接層 line145-167 逐字
  抽取）。不是第二套資料：輸入 profileStore.players、輸出引擎原生格式、不落地、
  不 import heroDatabase、不帶 heroId（MOBA/CS 分離）。主力優先湊 5 人，不足則
  回 null → 引擎用內建陣容且 UI 誠實標示。
- 新增 `src/screens/fps/CsMatchScreen.jsx`：薄殼畫面。3D Presentation / HUD /
  記分板全部是引擎內建（不重畫 FPS UI）；終局戰報讀 onComplete 的真實
  MatchResult（勝敗 / 比分 / 隊內 MVP / 逐人 KDA+Rating），標示「訓練賽，
  未寫入賽季紀錄」。seed 掛載時決定一次（同 seed ⇒ 同賽果）。
- `AppShell.jsx`：+2 行接 `screen === "cs"`；信標更新 S22。
- `DashboardScreen.jsx`：CS 磚從佔位 Modal 改導真頁（NAV + modes badge「訓練賽」）。
- 修復 `tools/regress.mjs` / `regress2.mjs` import 路徑（`./src/` → `../src/`），
  從此可直接 `node tools/regress.mjs` 執行，不再需要「複製到根目錄」的舊流程。
  零邏輯變更。

### 驗證

- `npm run build` 通過（2,503 modules，bundle 1,878KB / gzip 704KB；
  比 S21 +108KB = FPS 引擎首次進主 bundle，屬預期）。
- 回歸：`regress.mjs` **15 seed / 15 成功**（平均 18.3 分、擊殺 55.8、破塔 17.4/12，
  與 S21 基準逐字一致）；`regress2.mjs` **20 seed / 20 成功**（藍 9 紅 11、
  平衡度 0.05、ACE 17/20、逆轉 18/20，與基準一致）。
- 禁改清單 git diff 零改變：`LogicEngine`、Battle Balance、`battleResult`、
  `HeroProgress`、`heroDatabase`、MOBA Draft/Tactic 流程、Sprint20 圖片資料流、
  Sprint21 Store 行為全部未觸碰（diff 僅 AppShell +7 / DashboardScreen +10-4 /
  regress×2 路徑修復）。
- 不存在第二套 Player Database / 能力模型；CS 路徑零 heroId。
- **未經瀏覽器實測項（誠實）**：CS 磚點擊→進場→播放→終局戰報→回 Dashboard 的
  實際渲染；MOBA / 經營模組的迴歸僅有結構性證據（相關檔零改動）。

### Legacy Diff Checklist（CS/FPS）

| 項目 | 狀態 |
|---|---|
| 3D 對戰畫面 / 轉播運鏡 / 擊殺列 / 無線電 / 比分列 | ✅ 引擎原封（逐位元組未改） |
| 我方名單 = 真實選手（16 項能力 × 個性 × 士氣 × 體力） | ✅ 已接（Legacy 轉接層規格逐字） |
| 賽前選圖 / 選戰術面板 | ⚠ embedded 模式隱藏（Legacy fpsRouter 的賽前流程未恢復）→ 未來 CS 賽前流程 Sprint |
| CS 賽後戰報（Legacy 完整版） | ⚠ 目前為終局摘要卡（真實 MatchResult）；完整戰報屬 Legacy PostMatch 模組領域 |
| 結果入史（recordMatch / 獎金 / 粉絲 / XP） | ❌ 刻意未接：無 CS BattleResult 契約，不偽造（Sprint 23 提案） |
| CS 專屬選手池 | ❌ 主幹只有一批選手（Team 頁 CS 分部同批人 FPS 權重），CS 分部名單屬未來領域 |

### 已知限制 / Sprint 23 建議

- CS 結果流缺正式契約：建議 Sprint 23 於 `platform/contracts/` 提
  「CsMatchResult → 統一結果流程」提案（獎金/粉絲/XP 回寫需 Ray 核准）。
- CS 賽前流程（選圖/選戰術/BO 賽制）未恢復；目前進場即開打（訓練賽定位）。
- bundle 已 1.88MB：FPS 引擎 + 英雄圖 base64 都內嵌，建議未來以動態 import
  切分 CS 路徑（`import()` CsMatchScreen）＋英雄圖改 public/ 靜態檔。

## Sprint 23：CS Full Match Loop Recovery

目標：CS 從「可進入的訓練賽」→ 完整可回寫的比賽循環：
Dashboard → CS Prep → 選圖 → 戰術 → Loading → 3D FPS Match → CS Result →
Match History / 經營回寫 → Dashboard。不重寫 FPS 3D。

### A. 賽前流程 Audit（修改前）

- Dashboard CS 磚直接進 CsMatchScreen（掛載即開打，seed/map 隨機）。
- 無選圖（Legacy 也沒有選圖 UI——fpsRouter 於戰術確認時隨機挑圖）、
  無戰術畫面（Legacy 有 TacticSelect fps 模式）、無 Loading（Legacy FPS 流程亦無）、
  無獨立 Result（Legacy 有 CSMatchReport）、無 CS 歷史（S22 刻意不入史）。
- 關鍵發現：主幹 `platform/data/matchRecorder.js` 已含 Legacy 逐字 CS 獎勵公式
  （deriveMatchContext isCS 分支 + updateEconomy）→ 回寫直接重用，不發明第二套。

### 新增檔案

- `src/platform/contracts/CsMatchResult.js` — **CsMatchResult.v1** 契約：
  mode:"cs" / matchId / seed / mapId·mapName / tacticId·tacticName·tacticType /
  engineTactic（引擎實際執行的地圖戰術）/ winner / ourScore·enemyScore /
  duration(**null**，引擎未提供，不編造) / roundCount / players[]（playerId 經
  fpsRoster `_gid` 對回真實選手、K/D/A/rating/adr/hsPct/kast/clutches…）/
  opponents[] / mvp / summaryEvents（逐回合勝方+結束方式）/ rewards / recordedAt。
  含 `toCsMatchResult`（引擎 MatchResult→契約）與 `validateCsMatchResult`。
- `src/battle/fps/csPrepData.js` — 賽前資料：`CS_TEAM_TACTICS`（Legacy
  TACTICS_LIB.fps f1–f8 逐字）+ `FPS_TACTIC_TYPE`（Legacy line153 逐字，引擎吃法
  = Legacy fpsRouter：tactic id + type → 引擎在該圖 TACTICS_DB 挑同 type 執行）+
  `CS_MAPS`（⚠ 最小 flavor 常數：key/name 來自引擎 MAPS，類型/風格/難度/對手風險
  為新增展示資料，Legacy 無選圖資料，不進引擎）+ `mapFit`（我方適性，真實 16 項
  能力計算，純展示）。
- `src/screens/fps/CsPrepScreen.jsx` — Legacy MatchPrep(fps) 版面：出戰/歷史分頁、
  主力 5 人卡（頭像+狀態邊框+個性+FPS 定位+適配+CS 戰力）、隊伍戰力、配對大鈕。
- `src/screens/fps/CsMapSelectScreen.jsx` — 選圖：三圖卡（名稱/類型/風格/難度/
  我方適性/對手風險/選中狀態）→ 確認進戰術。
- `src/screens/fps/CsTacticScreen.jsx` — Legacy TacticSelect(fps)「① 團隊戰術」
  8 卡逐字（emoji/風險/desc/核心/能力吃重/detail）→ 確認進 Loading。
- `src/screens/fps/CsLoadingScreen.jsx` — 我方 5 人（PlayerFace+FPS 定位+關鍵能力）
  / VS / Compulsary（引擎內建陣容，誠實標示）/ 地圖 / 戰術 / Loading Bar+進場文案。
- `src/screens/fps/CsResultScreen.jsx` — Legacy CSMatchReport 版面逐節：比分頭欄
  （含部署戰術 vs 引擎執行戰術）、獎勵三格（粉絲/獎金/XP=真實入帳值）、MVP 卡、
  本隊數據表（K/D/A·ADR·爆頭·KAST·評分）、回合走勢、寫入狀態標示、返回 Dashboard。
- `tools/check_cs23.mjs` — 27 項驗證（結構 8 + 契約/回寫行為 19）。

### 修改檔案

- `src/platform/profileStore.js` — 擴充（非第二套 Store）：`csHistory[]`（上限 30，
  向下相容 localStorage）+ `recordCsMatch()`（**冪等唯一入史口**：同 matchId 不重複
  入帳）。回寫：funds+獎金(元)、transactions、meta.fans、收件匣通知；公式 =
  `matchRecorder.updateEconomy`（Legacy 逐字；CS 連勝 streak 取自 csHistory，
  不讀 MOBA 戰績）。**XP 只記錄不回寫 team.lv/xp**（「萬 XP」展示刻度與 xpGain
  50/20 不符——不做假回寫，待刻度統一）。
- `src/screens/fps/CsMatchScreen.jsx` — 接 config（map/tactic/seed）→ 引擎既有
  tactic/tacticType props（引擎零修改）；Match Header 顯示地圖+戰術；終局改
  「查看賽後戰報」→ toCsMatchResult → AppShell 導 CsResultScreen。無 config 時
  退回 S22 行為（相容）。
- `src/AppShell.jsx` — 六段 CS 流程接線 + csConfig/csResult 狀態；seed 於戰術確認
  時決定（Legacy 同款）；信標 S23。MOBA 主流程零改動。
- `src/screens/DashboardScreen.jsx` — CS 磚 → csPrep（2 行）。
- `.gitignore` — 忽略 `docs/handoff/_archive/` 與 `_backup_*`（制度備份不進版本庫）。

### SeasonStore 判定（I 節）

不接入。`seasonStore.recordResult` 只收 `BattleResult.v2`（有 schema 檢查），
Dashboard/Season 頁把 history 全視為 MOBA 戰績——寫入 CS 會污染 MOBA 勝場與
贊助門檻計算。**CS 訓練賽紀錄 = profileStore.csHistory；CS 聯賽/SeasonStore
多模式賽季留待未來 Sprint。**

### 驗證

- `npm run build` 通過（2,511 modules，bundle 1,906KB / gzip 712KB；
  比 S22 +28KB = 六段 CS 畫面+契約，屬預期）。
- `node tools/regress.mjs`：**15 seed / 15 成功**（平均 18.3 分、擊殺 55.8、
  破塔 17.4/12）——與 S22 基準一致。
- `node tools/regress2.mjs`：**20 seed / 20 成功**（藍 9 紅 11、平衡度 0.05、
  ACE 17/20、Baron 20/20、逆轉 18/20）——與基準一致。
- `node tools/check_cs23.mjs`：**27/27 通過**——流程接線、MOBA/CS import 隔離、
  契約轉換（playerId 對回、缺值 null、summaryEvents）、回寫（獎勵=Legacy 公式、
  財務/粉絲/交易/收件匣、冪等、csHistory streak、敗場公式、拒收非 CS 結果）。
- 禁改清單 git diff 零改變：LogicEngine、battle/moba、battleResult、battleStore、
  useBattleFeed、contracts/BattleResult、seasonStore、matchRecorder、roster、
  heroDatabase、heroImages、playerModel、players、recruitPool、EsportsFPS3D、
  fpsRoster、screens/moba、screens/manage、GameView 全部未觸碰。
- **未經瀏覽器實測項（誠實）**：六段流程的實際點擊走通、3D 開打與 onComplete
  真實回傳（引擎含 JSX 無法在 node 直跑，行為測試用 buildMatchResult 形狀的
  代表性 fixture）、Result 畫面實際渲染。結構與資料流有 27 項腳本證據。

### Legacy Diff Checklist（S23）

| 項目 | 狀態 |
|---|---|
| CS 賽前準備（出戰陣容/戰力/適配/狀態） | ✅ Legacy MatchPrep(fps) 版面對位 |
| 賽前「📅 賽程」分頁 | ❌ 需 AI_TEAMS 對手聯賽領域（主幹無）→ Sprint 24 候選 |
| 賽前「📜 歷史」分頁 | ✅ 改讀 csHistory 真實紀錄（Legacy 為 matchHistory 假 demo 項） |
| 選圖畫面 | ⚠ Legacy 無選圖 UI（隨機圖）→ 本 Sprint 新建，資料為標明來源的最小常數 |
| 戰術部署「① 團隊戰術」8 卡 | ✅ TACTICS_LIB.fps 逐字 + 引擎吃法同 Legacy fpsRouter |
| 戰術部署「② 隊員分工 / ③ 局數節奏」 | ❌ 引擎無對應輸入（Legacy 亦純展示）→ 不做假部署 |
| Loading | ⚠ Legacy FPS 流程無 Loading → 依任務單新建（沿主幹 MOBA Loading 骨架） |
| 3D 對戰 / HUD / 擊殺列 / 無線電 / 記分板 | ✅ 引擎原封（逐位元組未改） |
| CS 賽後戰報 | ✅ Legacy CSMatchReport 版面逐節（比分/獎勵/MVP/數據表/回合走勢） |
| 「🔁 再戰一場」 | ❌ rematch 需重置流程 seed → 未做（可回 Prep 重打） |
| 結果入史 + 獎金/粉絲/XP 回寫 | ✅ csHistory/finance/fans/inbox；XP 記錄不回寫等級（刻度不符，誠實） |
| matchHistory 統一（MOBA+CS 同表） | ⚠ 主幹刻意分離：MOBA=seasonStore、CS=csHistory（不建互相衝突的第二套） |

### 已知限制

- 對手固定引擎內建 Compulsary；BO1 訓練賽定位（BO3/聯賽 → Sprint 24 候選）。
- 戰術影響勝負的部分 = 引擎原生 tacticEdge（Legacy 既有行為），本 Sprint 未調 Balance。
- duration 無來源（引擎 MatchResult 不含時長）→ 契約欄位保留 null。
- 舊的 `tools/check_flow09 / check_dash10` import 路徑仍是搬移前的 `./src/`
  （S22 只修了 regress×2）、`check_mount09` 檢查 Sprint09 時代畫面——三支在本
  Sprint 前即失效，屬非現役腳本，建議下次清理或修復（未動，避免超出範圍）。

## Sprint 24 — MOBA 戰術系統（戰術真正進引擎）

目標：把 Sprint19 以來一直是 Presentation 級的 MOBA 戰術，正式接進 LogicEngine，
並留下可查核的執行證據——**但不得動 Battle Balance**。

### 紅線

> 戰術只改「行為權重 / 傾向 / 時機 / 路線 / 風險」，
> 不加傷害、不加勝率、不加金錢係數、不寫死勝負。

勝負仍由陣容 loadout、比分、經濟、地圖事件與 seed 決定。

### 新增

- `src/platform/contracts/MobaTacticConfig.js` — **MOBA 戰術正式契約 v1**。
  八張卡 m1–m8 的 UI 欄位（emoji/risk/focus/desc/detail/boost）= Legacy
  `TACTICS_LIB.moba` 逐字；新增數值欄位（lanePlan / macro / objectives /
  economy / vision）+ `validateMobaTacticConfig()` + `toEngineTactic()`。
- `docs/design/MOBA戰術系統.md` — 完整映射表與誠實邊界（契約註解指向本檔）。
- `tools/check_moba_tactic24.mjs` — 27 項驗證（契約 / 接線 / 引擎行為 / CS 隔離）。

### 修改

- `src/LogicEngine.js`（**禁改清單檔案，本 Sprint 任務明確允許**）——嚴格附加：
  `configureMatch({blue,red,meta})` 啟用戰術層；不呼叫 ⇒ `tacticOn=false` ⇒
  全部新分支短路，走與 S23 完全相同的路徑與**同一條 rng 序列**。
  戰術層用獨立 `rng2`（`seed ^ 0x9e3779b9` 派生）**不污染主 rng**——
  這是「未啟用時位元一致」的關鍵。
  行為點：團戰/龍/巴龍參與率、撤退門檻、推線深度、打野 Gank 節奏與挑路、
  開局野區入侵、輔助遊走、帶線分推。
- `src/useLocalServer.js` — `start({tactic})` → `toEngineTactic` → `configureMatch`；
  對手固定 `STANDARD_OPP_TACTIC`（中性，不虛構對手 AI）。
- `src/GameView.jsx` — `start({tactic})`（autoStart 與手動 START 兩處）。
- `src/battle/battleResult.js` — 附加 `tactic` / `tacticExecution`（無戰術 = null，
  BattleResult.v2 結構未變）。
- `src/battle/ui/BattleEndScreen.jsx` — 「戰術執行」面板：每張卡的 evidence 指標
  對引擎真實計數，顯示**執行度（明確標示非勝負）**。
- `src/screens/moba/TacticScreen.jsx` — 三件事：
  ① **跑版根因修復**：舊版根節點固定 `width:560` + 固定 200px 詳解欄
  → 360px 手機溢出、桌機永遠窄條。改 `width:100%` + maxWidth + grid auto-fill。
  ② 資料源改契約（不再散落 component）。
  ③ 適性改用真實資料（`fit` 對 profileStore.players 的 16 項能力取平均，
  無硬編碼百分比）；引擎效果由 knobs 與中性值自動比較生成，不會與引擎漂移。

### Legacy Diff Checklist

| 項目 | 狀態 |
|---|---|
| Legacy m1–m8 八張卡名稱 / 文案 / emoji / risk / focus | ✅ 逐字保留（腳本檢查） |
| 戰術影響比賽 | ✅ 本 Sprint 首次成立（Legacy 原型亦僅展示，這是產品升級） |
| 戰術執行證據 | ✅ 引擎真實計數 → BattleResult → 賽後面板（Legacy 無此層） |
| TacticScreen 響應式 | ✅ 修好固定寬度跑版（Legacy 為固定寬 demo） |
| 對手戰術 | ❌ 無來源 → 固定中性 standard，不虛構 AI |
| heraldPriority / carryPriority / vision.* | ❌ 引擎無對應系統 → 契約保留但**未映射**，不假裝有效果 |

### 驗證

- `node tools/check_moba_tactic24.mjs` → **27/27 通過**。
  含關鍵反例：m3 / m8 跨 16 seeds 勝負皆有出現（**證明沒寫死 winner**）；
  knobs 欄位白名單（證明沒偷渡傷害/勝率係數）。
- **Balance 凍結實測**：20 seeds，每 20 tick 抓「全體選手座標/HP/KDA + 全部塔血
  + 雙方金錢」指紋，與 S23 基準**逐位元一致** → 未呼叫 configureMatch 時
  引擎行為完全沒變。
- `npm run build` 通過。

### 已知限制

- 對手戰術固定中性；對手戰術系統尚未存在。
- `heraldPriority` / `economy.carryPriority` / `jungleResourceShare` / `vision.*`
  在引擎中無對應系統 → 只用於適性與展示，未進 knobs。
- 戰術「執行度」與勝負無關（刻意）：執行成功 ≠ 贏。
- 舊腳本 `check_flow09` / `check_dash10` / `check_mount09` 仍失效（S23 已記錄，
  非現役，本 Sprint 未動）。

## Sprint 25 — Unified Match Rewards & Player Progress

目標：統一 MOBA / CS 的賽後獎勵、選手 XP、等級與天賦點回寫流程。
**不合併** BattleResult.v2 與 CsMatchResult.v1，**不合併** MOBA history 與 csHistory。
新增的是共用的「回寫交易層」。

### Audit（修改前的真實現況）

| 面向 | MOBA | CS |
|---|---|---|
| 結果契約 | BattleResult.v2（**無 matchId、無時間戳**） | CsMatchResult.v1（有 matchId） |
| 入史 | seasonStore（dedupe by `winner\|duration\|score` 內容雜湊） | csHistory（dedupe by matchId） |
| 結算觸發點 | useBattleFeed（引擎終局）✅ | **CsResultScreen 掛載時 useEffect** ⚠ |
| 獎金 | ❌ **完全沒有** | ✅ updateEconomy |
| 粉絲 | ❌ **完全沒有** | ✅ updateEconomy |
| 戰隊 XP/等級 | ❌ 沒有 | ⚠ 只記在 rewards.xp，不回寫（刻度不符） |
| 天賦點 | ❌ 沒有（updateEconomy 算了 talentPointsAdd，**無人消費**） | ❌ 沒有 |
| 選手 XP/等級 | ❌ **根本不存在**（players[] 有 lv 但**無 xp 欄位**，lv 是 Legacy 靜態種子，比賽永不改變） | ❌ 同左 |

也就是說：**MOBA 打一百場，錢、粉絲、選手 XP 全部不動**；CS 只有錢和粉絲會動。
天賦點閉環從來不存在。

另外抓到兩個既有缺陷：
1. CS 結算掛在 Result Screen 掛載 → 玩家沒進 Result 就**永久漏發獎**。
2. seasonStore 用內容雜湊當去重鍵 → 兩場「完全相同」的比賽第二場會被靜默丟棄。

### 新增檔案

- `src/platform/contracts/matchProgressTransaction.js` — 回寫交易契約 v1 + validate
  （所有數值必須有限；不適用欄位一律 0；playerId 必須是字串 id，禁用 index / 名字）。
- `src/platform/progress/playerLevel.js` — 平台唯一等級刻度（純函式）。
- `src/platform/progress/rewardFormulas.js` — 唯一的獎勵公式所在地 + 版本常數。
- `src/platform/progress/applyMatchProgress.js` — 單一結算服務（純 reducer + receipt）。
- `src/platform/progress/adapters/mobaProgressAdapter.js`
- `src/platform/progress/adapters/csProgressAdapter.js`
- `src/platform/progress/settleCsMatch.js` — CS 比賽完成邊界。
- `src/ui/RewardReceiptPanel.jsx` — MOBA / CS 共用的 receipt 顯示元件。
- `tools/check_progress25.mjs` — 34 項驗證。
- `docs/design/賽後結算與選手成長系統.md` — 完整設計文件。

### 修改

- `profileStore` — 新增 `players[].xp`（累積總 XP）/ `players[].talentPoints` /
  `processedMatchTransactions`（冪等帳本）/ `schemaVersion: 2` + `migratePlayer()`。
  新增 `applyMatchProgress(tx)`（**MOBA / CS 唯一發獎點**）。
  **`recordCsMatch` 降級為只入史**——S23 時它同時發錢，若不拆會與新流程雙倍入帳。
- `useBattleFeed` — MOBA 在引擎終局結算（不靠 Result Screen）。
- `AppShell` — CS 在 `onFinish`（比賽完成邊界）結算。
- `BattleEndScreen` / `CsResultScreen` — **不再結算**，只讀 receipt 顯示。
- `DashboardScreen` — 天賦徽章改為全隊未花費天賦點總和（閉環可見）。
- `tools/check_cs23.mjs` — 改驅動新入口 `settleCsMatch`；**原 27 項保證全數保留**
  （獎金/粉絲/冪等/連勝/敗場公式）+ 新增 1 項選手 XP 保證 → 28/28。
- `tools/check_flow09.mjs` / `check_dash10.mjs` — 修好 `./src/` → `../src/` 的
  失效 import 路徑（S23 記錄的技術債，順手清掉）→ 兩支復活且全綠。

### 本 Sprint 抓到並修正的真實缺陷

**MOBA 輔助永遠吃虧。** 第一版 XP 公式讓 `playerRating` 佔一半權重。但 MOBA 的
`playerRating` 是未正規化原始分（重金錢與擊殺），實測 carry 62 分 vs 輔助 10 分。
結果輔助被壓在係數下限，XP 只有隊均 **70%** —— 正是 §9 明文禁止的情形。
改為以 **participation**（助攻同權）為主、rating 只當 ±15% 修正後 → 輔助達隊均 **91%**。

### 驗證（全部檢查 exit code，杜絕假通過）

| 腳本 | 結果 |
|---|---|
| `check_progress25` | ✅ 34/34（exit 0） |
| `check_cs23` | ✅ 28/28（exit 0） |
| `check_moba_tactic24` | ✅ 27/27（exit 0） |
| `check_flow09` / `check_dash10` | ✅ exit 0（本 Sprint 修復後復活） |
| `regress` / `regress2` | ✅ exit 0（15/15、19/20 達標） |
| `npm run build` | ✅ |

禁改清單 git diff 零改變：LogicEngine、battleResult、BattleResult 契約、
CsMatchResult 契約、EsportsFPS3D、MobaTacticConfig、seasonStore、roster。

### 獎勵比較（固定 fixture）

| 情境 | team$（元） | 粉絲 | 均 XP |
|---|---|---|---|
| MOBA 勝利 | 330,000 | 173 | 55.2 |
| MOBA 失敗 | 80,000 | 45 | 23.2 |
| CS 勝利 | 430,000 | 243 | 55.0 |
| CS 失敗 | 80,000 | 19 | 23.4 |

MOBA carry 71 / support 50（隊均 55.2）；CS AWP 71 / IGL 45（隊均 55.0）。
輸一定比贏少；MVP 不異常高；比賽拖長不放大獎勵。

### 已知限制 / 技術債

- **MOBA matchId 是內容雜湊**（BattleResult.v2 無 matchId 且契約凍結）。
  兩場「完全相同」的比賽會被視為同一場 → 第二場不發獎。機率極低，
  且比 seasonStore 現有的 4 欄位 resultKey **更安全**。真正的解法是讓
  BattleResult 帶 matchId（需 Ray 核准改契約）。
- **CS 團隊獎金略高於 MOBA**（43 萬 vs 33 萬，1.3×）：因 CS 的 marginF 用回合差、
  MOBA 固定 3/8。在容忍範圍內，Legacy 公式凍結，**未重新平衡**，列為觀察項。
- **聲望永遠 0**（無經驗證公式，不編造）。
- **天賦點只進不出**（Legacy TalentModule 尚未恢復）。
- **team.lv/xp 刻度仍未統一**（「萬 XP」展示刻度）：S25 刻意不碰，
  等級閉環做在「選手」層（契約的 teamRewards 本來就只有 money/fans/reputation）。
- `check_mount09` 仍失效（檢查 Sprint09 時代畫面，非現役）。

## Sprint 26 — MOBA Match Experience Recovery

修復四個線上實際發現的問題（既有核心流程修復，非新功能）。

### Audit 根因（先追資料流，後動 UI）

**① Result 升級但 Dashboard 選手卡不動**
- 真因不是 selector 不刷新，是**兩條成長軸共用同一個「Lv」標籤**：
  LineupScreen（MOBA 選手卡）的「Lv/等級」讀的是 heroProgress 的
  **英雄熟練等級**，且選手名字讀**靜態 ROSTER**（改名也不同步）——
  S25 的選手等級（profileStore.players[].lv）在該畫面根本沒被顯示。
- RosterScreen 列完全沒顯示選手 Lv（只有 modal 有）；PlayerDetail 沒顯示 XP 數字。
- 沒有第二份 player 資料：profileStore 是唯一持久層 ✅；
  fpsRoster / mobaRosterAdapter 讀法正確 ✅。

**② 手機戰術頁跑版**（S24 只修了 Tactic 內容層，外層漏掉）
- 共用 `Frame`（Lineup/Codex/Tactic 三頁共用）**無寬度防護**
  （無 width:100% / boxSizing / 水平 padding）。
- footer 按鈕排在內容後面**不吸底**——手機上 8 張卡＋詳解後，
  確認鈕沉出可視範圍，看起來像壞掉。
- LineupScreen / CodexScreen **固定 width:380** → ≤380px 手機水平溢出。
- Tactic grid `minmax(190px,1fr)` 無 `min()` 防護。

**③ Dashboard 選手頭像錯綁英雄徽章**
- `players[].heroId` 是 Legacy 種子的**靜態綁定**（不是最近一場、不是 Draft），
  PlayerAvatar 把它疊在 Roster/Team/Training 六處跨遊戲畫面 →
  MOBA 英雄被誤讀成選手身分（CS 選手也被貼 MOBA 英雄）。
  另有 Roster modal / PlayerDetail 副標把 hero.zh 當身分顯示。

**④ MOBA 無重播**
- 快照被 pushFrame 消費即丟（useGameStore 只留前後兩幀），零可重播資料。
  CS 的「接近對象」= EsportsFPS3D 的 frame playback（play/pause/speed/seek）。

### 修復

**A. Progress 單一真實來源**
- LineupScreen：選手名字＋選手 Lv 改讀 profileStore（訂閱 → 升級/改名即時刷新）；
  英雄等級保留但明確標「英雄熟練」，footnote 說明兩條成長軸。
- RosterScreen：列加選手 Lv 徽章；modal 加 XP 進度條（`calculateLevelProgress` 唯一刻度）。
- PlayerDetailScreen：Lv 徽章與 XP 數字皆由持久化 xp 推導。

**B. 手機戰術頁**
- `Frame`：width:100% + boxSizing + 水平 padding；footer 改
  `position:sticky bottom:0` + flexWrap + 漸層底 → **確認鈕永遠可點**。
- Lineup / Codex：固定 380 → `width:100%, maxWidth:420, padding 0 12`。
- Tactic grid：`minmax(min(190px,100%),1fr)`。
- 不縮字級、不 transform scale、不藏內容。
- ⚠ 未經真機瀏覽器實測（本環境無瀏覽器）；已做靜態防線驗證，
  320–1920 各檔位需人工點一輪（清單見交付報告）。

**C. Player / Hero 語意分離**
- PlayerAvatar 移除英雄小角標（六處呼叫點同步清理）；
  Roster modal / PlayerDetail 副標移除靜態 hero.zh。
- 英雄仍完整顯示於 MOBA 情境：Draft / Loading / Battle / Result（資料來自當場 Draft）。
- 「最近使用英雄」未保留——profileStore 沒有真實的 lastHero 資料來源，不造假。

**D. MOBA Replay MVP**
- 新增 `platform/contracts/mobaReplay.js`（MobaReplay.v1 + validate + 容量常數）、
  `battle/moba/replay/replayBuffer.js`（session 記憶體擷取緩衝，只留最近一場）、
  `screens/moba/MobaReplayScreen.jsx`（2D 戰場播放器：選手/塔/龍/巴龍/比分/
  經濟/勝率/事件 ticker；播放/暫停/±10s/事件跳轉/0.5–4×/slider/時間/返回）。
- 接線：useLocalServer.start → begin（seed/戰術）；useBattleFeed → 每幀取樣＋終局定稿
  （matchId 與結算同源）；BattleEndScreen →「觀看重播」（overlay 開啟——
  走 AppShell 路由會使 GameView 重掛載 autoStart 開新的一場，刻意避開）。
- 容量實測：503 frames / 345KB / 場（每 frame ≈ 703B）；MAX_FRAMES=1200 到頂停錄；
  **不寫 localStorage**（配額不適合），只留 session 最近一場，文件已標明。

### 驗證

- `tools/check_moba_experience26.mjs`：**35/35**（含子行程 exit code＋輸出形狀檢查：
  tactic24 27/27、progress25 34/34、cs23 28/28、regress 15/15、regress2、flow09）。
- 關鍵實測：同 seed 擷取前後 BattleResult **位元一致**（balance 不受擷取影響）；
  重播播放前後結算 state 位元一致（不重複發獎）；
  receipt level == store level == round-trip 後 level。
- SSR 抓到一個 build 抓不到的真 bug：無重播時 frameAt 在空 frames 崩潰
  （正是「無 replay 不白畫面」要防的）→ 已修＋降級文案驗證。
- `npm run build` ✅；禁改清單（LogicEngine / battleResult / 三契約 /
  EsportsFPS3D / rewardFormulas / playerLevel / seasonStore）git diff 零改變。

### 已知限制

- 重播僅存 session 記憶體最近一場；重整即失（Result 顯示「無法重播」）。
- 2D 俯視重播（3D 重播需播放管線與 live 管線隔離，列未來項）。
- 手機各檔位未經真機實測（無瀏覽器環境），需人工驗收。

## Sprint 27 — Player Talent System（選手天賦與能力成長）

補上 S25 留下的最直接缺口：天賦點「只進不出」。S25 已把 talentPoints 發到
每位選手身上，但無處消費（Legacy TalentModule 仍是佔位）。
完整設計文件：`docs/design/選手天賦與能力成長系統.md`。

### Audit：與 Legacy TalentModule 的刻意差異（不是照搬）

| | Legacy TalentModule | Sprint27 |
|---|---|---|
| 作用範圍 | **全隊**（allocateTalent 對整個 roster 加值） | **每位選手獨立** |
| 寫入方式 | **直接改 base stats**（不可逆、與訓練/potential 互相污染） | **derived 層**（base 永不被寫） |
| 點數 | 單一團隊池（React state，不持久） | S25 的 `players[].talentPoints`（每人獨立、持久化） |
| 規模 | 3 類 × 6 節點 | 4 類 × 3 節點 = 12（MVP 紅線） |

### 新增檔案

- `src/platform/talents/talentDefinitions.js` — 12 節點定義（操作/戰術/心理/團隊
  各 3 節；maxRank 3、costPerRank 1；每 rank 效果合計 ≤2 點；只加既有 16 項能力，
  無傷害/勝率/金錢/XP 倍率）。
- `src/platform/contracts/playerTalentState.js` — PlayerTalentState.v1 契約 +
  `sanitizeTalents` migration（spentPoints 一律由 definitions 重算，不信任持久層）。
- `src/platform/talents/playerDerivedStats.js` — 純函式分層：base + talent bonus
  = derived（clamp 1–99）；`withDerivedStats` 讓既有吃 `player.stats` 的函式零改動。
- `src/platform/talents/purchasePlayerTalent.js` — 購買純 reducer + receipt
  （失敗完全不寫入；`__debugResetTalents` 僅供測試，禁入 UI）。
- `src/screens/manage/PlayerTalentScreen.jsx` — 天賦畫面（防誤點確認區、
  不可重置警語、響應式 grid、UI 只顯示 receipt 不自行重算）。
- `src/screens/moba/tacticFit.js` — 戰術適性自 TacticScreen 抽出（Node 可測），
  改讀 derived stats。
- `tools/check_talent27.mjs` — 44 項驗證。
- `docs/design/選手天賦與能力成長系統.md` — 設計文件。

### 修改

- `profileStore` — `PROFILE_SCHEMA_VERSION 2 → 3`；`migratePlayer` 追加
  `talents: sanitizeTalents(...)`（缺→空狀態、幽靈 id 忽略、rank clamp、
  不動 xp/lv/points）；新增 `purchasePlayerTalent`（唯一寫入口，單一 set()）。
- `fpsRoster.toFpsRoster` — CS 引擎輸入改 `getPlayerDerivedStats`
  （**天賦真的進 CS 對戰**：sim 的 persStat 直讀 stats）。
- `mobaRosterAdapter.buildEngineSlots` — 入口 `withDerivedStats`（adapter-ready；
  ⚠ LogicEngine 注入口未開 → 現行 MOBA 對戰輸出不受天賦影響，見已知限制）。
- `TacticScreen` — 適性改用 `tacticFit.js`（含天賦）。
- `PlayerDetailScreen` — 能力顯示 derived + 加成標 `+N`；新增天賦入口按鈕。
- `RosterScreen` / `TeamScreen` / `TrainingScreen` — calcPower / posFit /
  bestPositions 改吃 derived（各頁與天賦畫面同一份數字）。
- `DashboardScreen` — 「天賦」磚由誠實佔位 Modal 改導向選手名單。
- `AppShell` — 新增 `playerTalent` 路由（PlayerDetail → 天賦）。

### 驗證（全部檢查 exit code）

| 腳本 | 結果 |
|---|---|
| `check_talent27` | ✅ **44/44**（exit 0） |
| 內含子行程：experience26 35/35、progress25 34/34、tactic24 27/27、cs23 28/28、flow09 | ✅ 全 exit 0 |
| `regress` / `regress2` | ✅ 15/15、20/20 藍紅 9:11、15–25 分達標 19/20 |
| `npm run build` | ✅ built in 9.76s |

- 無天賦 baseline：derived === base（逐鍵）→ MOBA slots / CS roster 與 S26
  **位元一致**（第 24/25 項）。
- 固定比較（b3 中路，base 全 70）：操作天賦 3 級 → CS rxn/acc 70→73；
  戰術天賦 3 級 → m1 適性 70→71、CS vis/tac 70→73。
- 禁改清單 git diff 零改變：LogicEngine、battleResult、CsMatchResult、
  matchProgressTransaction、EsportsFPS3D。
- 收尾時抓到並修正一個真 bug：`sanitizeTalents` 對 `rank = Infinity` 用
  `Number.isFinite` 直接歸零，與設計文件「超上限 → clamp maxRank」不符
  （第 23 項損壞存檔測試抓到）→ 改為 NaN→0、其餘 clamp。

### 已知限制 / 技術債

- **MOBA 對戰輸出暫不受天賦影響**——LogicEngine 尚未開放 roster 注入口
  （`applyRosterToEngine` 能力偵測 applied:false）。天賦在 CS 有用、MOBA 只影響
  戰術適性的**暫時不對稱**已列技術債；引擎層生效需 Ray 核准開注入口。
- **無重置系統**（刻意）：正式 UI 無重置鈕；未來以「洗點道具/收費重置」恢復
  （設計文件已留方案，基礎 = `__debugResetTalents` 正式化 + 防濫用）。
- **平衡觀察項**：滿配 36 點短中期拿不滿；單項上限 +6。多名滿配選手疊加時
  需在 Season 引入對手成長對衡（未來 Sprint）。
- **天賦畫面未經真機瀏覽器實測**（本環境無瀏覽器）：僅靜態防線驗證
  （無固定寬、grid min() 防護、確認區不被 footer 遮擋），需人工點一輪。

---

## Sprint 28 — MOBA Player Stats Injection & Talent Closure

**一句話**：關掉 S27 技術債 #1——選手 16 項能力（含天賦）現在**真的**進 MOBA
LogicEngine，透過行為層生效；**沒有**任何傷害／勝率／金錢係數。

### Audit（改動前的實況）

- **MOBA 引擎完全沒讀 16 項能力**。它用 constructor 兩個寫死陣列：
  `power = [30,34,36,42,18]`、`tough = [1.6,1.15,0.9,0.8,1.25]`（依 ROLES 索引），
  外加 Hero Progress `loadout` 倍率。與「選手是誰」無關。
- **S27 的 `mobaRosterAdapter` 在主幹是死碼**：只被 `src/App.jsx`（Legacy 沙盒，
  `main.jsx` 明確不掛載）import；`applyRosterToEngine` 永遠回 `applied:false`。
  ⇒ S27 的 MOBA 天賦只影響 UI 與戰術適性，對戰輸出零影響（S27 自己已列為技術債）。
- **roster 從未進引擎**：`useLocalServer.start()` 只傳 `loadout` 與 `tactic`。
- 好消息：`profileStore.players` 的 id 就是 `b1`–`b5` ＝ 引擎 `player.id` ＝
  `mobaProgressAdapter` 發 XP 的 id ⇒ **可用 playerId 對位，不需名字/索引**。

### 做了什麼

- **新增 `src/battle/moba/mobaPlayerStats.js`**（純函式）：16 能力 → 10 個行為偏移量。
  依 S24 先例「knobs 形狀由呼叫端準備」——LogicEngine 不 import 它、不認得能力鍵名。
- **`LogicEngine.configurePlayers({blue,red,meta})`**（嚴格附加，與 `configureMatch` 同構）：
  平移 9 個既有作用點——撤退門檻、重返門檻、團戰參與率、龍/巴龍集結率、推線深度、
  打野 Gank 週期與停留窗、輔助遊走率、分推承諾度、開局入侵率。
- **`mobaRosterAdapter.buildPlayerStatSlots`**：依 playerId 對位、依席位順序輸出。
- **`useLocalServer`**：唯一計算點，`configurePlayers` 在 `configureMatch` **之前**呼叫。
- **`snapshot.playerStatsExec`**：每位選手的真實行為計數（撤退次數/進入團戰次數/貼目標 tick），
  與 `tacticExec` 同樣 gated ⇒ 舊快照形狀不變。

### Baseline 保證（三重）

1. feature off ⇒ 新分支全短路，snapshot 不含 S28 欄位。
2. 中性能力（全 70）⇒ mods 全 0/倍率 1 ⇒ **逐位元**回到 baseline（6 seed × 含/不含戰術驗證）。
3. **不新增任何 rng 抽樣**，只平移既有抽樣的門檻 ⇒ `rng`/`rng2` 序列完全不變。

### 驗證

`tools/check_moba_stats28.mjs` **28/28**（含 S27 44/44、S26 35/35、S25 34/34、
S24 27/27、S23 28/28、regress 15/15、regress2 19/20、build）。

- power/tough/maxHp 在「無天賦」與「全隊滿天賦」下**逐值相同**（不是傷害加成）。
- 引擎只有 2 處決定 winner（主堡血量歸零），能力層完全不碰。
- 多 seed 行為統計改變：操作/戰術/團隊天賦各 12/12 seed 行為不同；
  Support 11/12、Jungle 12/12（五路皆有作用點）。

### 已知限制 / 技術債

- **accuracy 與 learning 未映射**（誠實揭露）：引擎唯一「精準」的表面是傷害，
  注入即違反紅線；learning 無跨場迴圈可掛。兩者在 CS 與戰術適性仍完整生效。
- **平衡風險（實測 160 seeds）**：開啟能力層不送勝率（OFF 48% → 無天賦 49%），
  天賦投資有回報（b3 全滿 59%、全隊全滿 54%），但**團隊天賦單投 b3 = 44%（−5pp，
  兩次取樣皆負）**——團戰打得多在本引擎不必然轉化為勝利（勝負來自主堡/兵線/推塔）。
  **刻意不調權重去救勝率**（那是對著勝率調參）；正解見 Sprint 29 建議 1。
- **紅方永遠中性**（無 profileStore 選手）⇒ 藍方能力高於 70 分時取得行為面優勢。
  要對稱需 AI 對手也有選手能力（＝ AI Teams，本 Sprint 明令禁止開始）。
- **引擎席位固定 b1–b5**：招募新秀（id = `r`+timestamp）無法上場注入。
- **未經瀏覽器實測**：S27 的天賦 UI 人工驗收（PlayerDetail → 天賦 → 購買 → receipt →
  reload → Dashboard 入口 → 320/360/390/430/768/1366/1920 響應式）本環境無瀏覽器，
  **仍未完成**，需 Ray 或 verifier 人工點一輪。

---

## Sprint 29A — MOBA Battle Runtime（A 效能 / B 模擬正確性 / C 時間校準 / F 播報）

**範圍**：Ray 核准把 S29 拆成 29A / 29B。本次只做 **A + B + C + F**（全部可在 Node 驗證）；
**D（HUD 版面重構）與 E（場景美術升級）留給 29B** —— 本環境無瀏覽器，一份從未執行過的
HUD/3D 重寫風險過高（`build` 只擋語法錯，擋不了 runtime 白畫面）。

### Audit（Node 實測，非推測）

- **LAG 不在邏輯層**：logic tick 平均 **0.043 ms**（預算 130ms）⇒ 佔用 **0.03%**。
- **本場英雄等級系統根本不存在**：`lv` 來自 Hero Progress loadout，開場設定後永不改變 ⇒ **全場 Lv1**。
- **小兵拆塔 = `26 × 全路小兵數`（不看距離）** ⇒ 416 dmg/秒 vs 塔 2100 HP ⇒ **5 秒拆一塔、首塔 1:44**。
- **英雄移速 13 單位/模擬秒 = 小兵的 7.3×**（真實 MOBA ≈1.3×），再 ×3.85 倍速 ⇒ **50 單位/真實秒**。
- 三個抱怨（塔狂倒 / KDA 不動 / 全員 Lv1）是**同一組數值失衡**的三個面向。

### ⚠ 校準時挖出五個既有引擎公平性 bug（最重要的發現）

實測：**把 `players` 陣列反轉，勝負完全翻轉**（藍 20/20 → 0/20，擊殺數精確鏡像）——
**先被迭代的一方 100% 獲勝**。舊版被「塔瞬間融化」的粗暴節奏掩蓋。逐一修正（v2 規則集）：

1. **先手扣血**：傷害立即套用 ⇒ 藍方先出手、被打死的紅方連還手機會都沒有 → `simultaneousCombat`
2. **移動/交戰同迴圈**：藍方用紅方的「舊位置」判定接戰 → `twoPhaseTick`（全員先移動再全員交戰）
3. **熱點取陣列第一人** ⇒ 熱點永遠繞著藍方隊形長 → `symmetricHot`（取最密集鄰域）
4. **索引集火**（`alive.find` 打索引最小的敵人）→ `nearestTarget`（打最近的）
5. **小兵對戰只迭代藍方** ⇒ 紅兵傷害集中、死得快 → `symmetricMinionCombat`

外加兩個**地圖幾何 bug**：
6. `posOnLane` 用線段索引而非**弧長** ⇒ 中路中心落在 t=0.444 而非 0.5、塔距不對稱 → 改弧長參數化
7. `BASE.red {87,16}` 不是 `BASE.blue {12,90}` 的 180° 鏡像（應為 `{88,10}`）⇒ 紅方到雙目標各近 6 單位 → 改精確鏡像

> **舊 regress 的「藍勝 9/20」是假平衡**——是「藍方先手優勢」與「紅方地形優勢」互相抵銷。
> 修完後藍勝 13/20，且反轉陣列不再翻轉勝負。

### 做了什麼

- **新增 `battle/moba/matchProgression.js`**：本場 XP 曲線（Lv1–18）、XP 來源、模擬規則集
  `SIM_RULES.v1`（舊節奏，供 baseline 對照）/ `v2`（校準後，預設）。
- **LogicEngine**：本場等級（`mlv`/`mxp`，與 `lv` 並存且不同名 ⇒ 不可能混用）、
  XP 由**真實事件**發放（小兵/擊殺/助攻/推塔/龍/巴龍）、上述 5 個公平性修正、節奏常數化。
- **`useLocalServer`**：simTime / presentationTime / **playbackRate** 分離。
  dt **恆為** `DT_SIM=0.5` ⇒ **1×/2×/4× 不可能改變模擬結果**；rate 只改 tick 的真實間隔。
- **新增 `battle/quality.js`**：low/medium/high preset + 裝置自動判斷 + 手動切換（localStorage）。
- **MobaView3D 效能根因**：PointLight **22 → 2 盞**；FX 改**物件池**（原本每幀 dispose 全部再
  `new`，60fps × 60 個 ⇒ **每秒最多 3600 次配置**，這是 LAG 最大元凶）；小兵/草叢改共享材質 +
  物件池；英雄名牌改重用同一張 canvas；dpr 與後製分級。**Bloom 三檔都保留**（不砍光特效）。
- **HUD**：`BattleHUD` 移除無 selector 的 `useBattleStore()`；`battleReducer` 的 `derived`
  內容沒變就不換參照；Minimap 的無節流 rAF 節流到 12fps。
- **新增 `battle/moba/tacticalComms.js`**：規則式戰術播報（**不接生成式 API**、無 `Math.random`、
  決定性）。14 條規則、各自 cooldown + 全域 6 秒最小間隔、同 tick 只播最高優先級。
  每則訊息都帶 `evidence`（觸發它的引擎事實）⇒ 不可能編造事件。Timeline 以 💬 樣式區分，
  Replay 原封保存（不重新生成對話）。

### 節奏（20 seeds、戰術 M1、實測）

| | v1（舊） | v2（S29A） |
|---|---|---|
| 結束率 | 20/20 | **20/20** |
| 平均時長 | 18.3 分 | **20.1 分**（13.9–27.6） |
| 首塔 | **1.7 分** ⚠ | **4.5 分**（最早 2.8） |
| 5 分：擊殺 / 塔倒 / 均等級 | 1.6 / **8.6 座** / **Lv 1.0** | **5.6 / 0.7 座 / Lv 5.6** |
| 終局：擊殺 / 均等級 | 56 / **Lv 1.0** | 82 / **Lv 16.1** |
| 藍勝（40 seeds、無戰術） | 45% | **53%** |

### 【P0】players 陣列順序決定勝負（正確性缺陷，已修 + 已釘住）

實測（40 seeds，v1 規則集）：反轉 `players` 陣列 ⇒ **藍方勝率 55% → 6.7%**。
五個根因（先手扣血 / 移動交戰同迴圈 / 索引集火 / 熱點取陣列第一人 / 小兵只迭代藍方）
＋ 一個地圖幾何缺陷（`PITS.baron` 不在兩基地中垂線上，紅方近 **2.45** 單位）。
修法與長期防線見 `08_目前待辦與風險.md` §P0 與 `docs/design/MOBA對戰執行與時間系統.md` §4。

`check_moba_runtime29` §24–29 新增**正序／反序 invariant**，每條都跑 v1 對照
（v1 的系統性翻轉**必須**被測出來，否則測試沒有檢定力）。

### 驗證

`tools/check_moba_runtime29.mjs` **44/44 通過、exit 0**（含 S23–S28 verifier、regress、regress2、build 的子行程驗證，全部驗 exit code + 輸出形狀）。

⚠ **本次改動了四支既有 verifier 的斷言。四支都是「斷言本身壞掉」，不是「它擋住了 S29」**
（逐條理由與實測證據見 `08_目前待辦與風險.md`）：

| verifier | 舊斷言 | 為什麼它壞掉 | 新斷言 |
|---|---|---|---|
| `regress2` | 「15–25 分達標 **19/20**」 | **對病灶零檢定力**：v1（5 分倒 8.6 座塔、全場 Lv1 的壞引擎）時長 15.0–21.5 分 ⇒ 該斷言 **20/20 全中** | **8 條節奏門檻**（取自 60 seeds 分布，失敗 exit 1）。其中「5 分塔數 ≤3」「5 分均等級 ≥3」可直接判掉 v1 |
| `check_moba_stats28` §13 | 終局 `power`/`maxHp` 逐值相同 | S29 加入本場等級後，天賦改行為 → 升級速度不同 ⇒ 終局 `power` 本來就會不同。續用等於**禁止等級系統存在** | **Lv1 錨點**（`basePower`/`tough`/`baseMaxHp` 不被天賦寫入）＋ 新增 §13b **同等級錨點**（同席位同 `mlv` ⇒ `power`/`maxHp` 逐值相同；實測 2370 取樣、Lv1–18、衝突 0） |
| `check_moba_tactic24` C4 | `sum(m4,dragonContests) >= sum(m1,...)`（4 seeds） | `dragonContests` **飽和**（打野/輔助無條件去熱點 ⇒ 幾乎每條龍都算有爭奪）：m1 4.95 vs m4 5.08，**Cohen d = 0.09**。4 seeds 過關純屬運氣 | 未飽和的 **objRate**（坑邊平均人數）：m1 0.435 vs m4 0.548（**×1.26**、d = 0.83）＋ 逐 seed 勝出 ≥60% ＋ 8 套戰術 knob→行為 **Spearman ρ ≥ 0.4**（40 seeds） |
| `check_talent27` §29 | `git diff --quiet HEAD -- LogicEngine.js` | 真實語意是「LogicEngine 沒有**未 commit** 的改動」：commit 後自動變綠（就算該 commit 重寫引擎），合法擴充引擎的 sprint 進行中必然變紅 ⇒ 讓「commit 前全綠」在數學上不可能 | **天賦/引擎零耦合**（commit 無關）：LogicEngine 不認得天賦、天賦模組不 import 引擎 |

### 已知限制 / 技術債

- **D（HUD 版面）與 E（場景美術）未做** —— 留 29B。規格已寫進
  `docs/design/MOBA對戰HUD與手機版.md` 與 `MOBA場景視覺規範.md`（含 Legacy Diff 待查表）。
- **效能修復未經瀏覽器驗證**：FPS / draw calls / triangles / heap / DPR **全部無法在 Node 量測**。
  改動是根因層的（光源數、物件池、共享材質、dpr、後製分級），但**沒有實測 FPS 數字**。
- **終局擊殺數偏高**（約 74）：英雄一旦接觸就持續互毆，缺「脫離戰鬥」機制。
- **`撤退鎖死` 指標升到 13/15**：大團戰後常有 ≥8 人同時撤退（是狀態不是死鎖）。
- 打野無野區營地（引擎無此機制），靠中路兵線吃 XP —— 既有簡化。

---

## Sprint 29B1 — MOBA Combat Pacing, Objectives and Summoner Spells

**範圍**：29A 部署後手機實測修復——擊殺頻率失衡 / 地圖無龍巴龍野怪 / F/D 空框 /
MVP undefined，並為 29B2 手機 HUD 建立可靠資料源。**29B2（HUD 大改、場景美術）未開始。**

### Audit（儀器化實測，非推測）

- 基準（120 seeds、v2+M1）：15 分擊殺 **p50=44**（規格 7–18）、10 分 p50=20、
  109/120 場 15 分超過 35 殺——與手機實測（15 分 ~70 殺）一致。
- 根因（30 seeds）：**80.1%** 的 tick 存在團戰熱點（龍/巴龍活著 ⇒ hot 永久掛坑上；
  任意 3 人+1 敵即成 hot）；**88.5%** 擊殺發生在熱點；**99.0%** 受害者死時已在撤退
  （同速無放手 ⇒ 死亡行軍）；打野/輔助無條件進團；對線目標 2 分鐘後收斂到同一點。
- F/D 空框：SpellSquare 自 S18 起就是純佔位，引擎從無技能資料。
- MVP undefined：S29A 效能修改只訂閱 `mvp.id` 卻重建 `{id}` 物件讀 `.k/.d/.a`。

### 做了什麼（全部收在 SIM_RULES.v3；v1/v2 逐位元不變）

1. **交戰狀態機**（LANE/ROAM/SETUP/ENGAGE/CHASE/DISENGAGE/RETREAT/RECALL/RESPAWN/
   RETURN/OBJECTIVE/FARM）：參團黏性決策（6s）+ 距離圈 30 + 人數判斷；熱點成立收緊
   （每側 ≥2、實際接觸 <6）；撤退基礎餘裕 +0.06、被包 +0.12、連死 +0.08 且不參團、
   劣勢隊 +0.05/參團 −0.2；撤退移速 ×1.15 + 貼身圈 3.8 外放手；追擊限殘血 <18%、
   4 秒、leash 16；復活鎖 10s；團戰解散 DISENGAGE 13s。S24 knobs / S28 mods 作用點
   全部保留（tactic24 objRate ×1.20、Spearman ρ=0.64 實測仍過）。
2. **塔攻防與收尾**：塔反擊英雄（兵線坦傷；塔傷不執行擊殺，保 Σk==bK+rK==Σd）；
   無兵線拆塔 ×0.30；塔邊人數優勢才可強攻（修「一名守方站主堡旁 ⇒ 圍攻永遠零進度」
   的終局鎖死——實測主堡要磨 18 分鐘）；死亡計時器 8+min(t/40,32)；
   巴龍 buff 兵線（拆塔 ×2.2、兵對兵 ×1.7，70s）。
3. **中立目標實體化**：`this.neutrals`（id/type/pos/alive/hp/maxHp/spawnAt/respawnAt/
   killerTeam/participants/dmgBy）；龍 240s/1400HP、巴龍 480s/3000HP、6 座鏡像營地
   （gameData.CAMPS，腳本掃格選點）；團隊目標窗取代「坑=永久熱點」；打野 FARM 營地
   （關掉「打野吃中路線」技術債）；legacy this.dragon/baron 鏡射欄位保留（舊消費者零改動）。
4. **召喚師技能 MVP**：Flash 全員（escape 移動前評估/chase/engage、210s CD、位移真實）；
   Smite 只給打野（目標 HP≤550 才放、兩側同時結算 ⇒ 不保證搶到、75s CD）；
   `players[].sp` + `spellEvents` + SPELL_USED Timeline 事件 + Replay 原封保存；
   其他四路 D = 明確 reserved。
5. **killContext**：7 類（objective/towerDive/teamfight/gank/ambush/pick/chase）+
   participants + startedAt/duration；`feed[].ctx` → Timeline `data.ctx` → Replay events。
   BattleResult.v2 契約不變（timeline.data 欄位既有）。
6. **呈現接線**：MobaView3D 營地低模+龍巴龍 HP 條、Minimap 營地點、Replay
   objectivesMeta+frame.ob、Timeline 擊殺 ctx 標籤（【Gank】等）+ ✨/🌀 圖示；
   BattleHeroStrip F/D 真資料（冷卻遮罩/秒數/reserved）；BattleHUD MVP 改原始值
   selector + 「計算中」。

### 節奏（同組門檻同 seeds，v2 → v3）

| p50 | v2 | v3 | 規格 |
|---|---|---|---|
| 5/10/15/20 分擊殺 | 6/20/47/71 | **0/4/10/15** | 0–4 / 3–10 / 7–18 / 12–26 |
| 終局擊殺 | 71 | **16** | 16–35 |
| 15 分 >35 殺 | 109/120 | **0/120** | 極端少數 |
| 首殺 | 108s | ~320s | 合理 |
| 時長 | 18.4 分 | 17.8 分（15–24） | 15–25 分 |
| 40 seeds 正反序位移 | — | **3pp** | P0 防線 ≤15pp |

調參過程中四次結構性修正（非調 dmgK）：
① 初版交戰紀律化後「6 分鐘推穿主堡」（守方缺席窗被無兵線英雄拆塔放大）→ 塔攻防規則；
② 「收不掉（中位 41 分）」（守方泉水 10 單位外近乎永生）→ 死亡計時器成長 +
巴龍 buff + 人數優勢強攻；
③ 「無戰術長尾 39 分」讓用 cap=1800 的既有 verifier（experience26 等）拿不到終局
snapshot 而連鎖 exit 1 → **後期加速 sudden death**（20 分起 lateFactor +（t−1200)/240，
max 24.6 分）；
④ 追擊取得/閃現初版放在循序移動迴圈內 ⇒ 先迭代方用敵方舊位置搶先，被 lateAccel
放大成 **~17pp 系統性順序優勢**（120 場合併 2.7σ）→ 改兩相（凍結位置、先收集後套用，
`_postCombatV3` + 逃生閃現前置階段），80 seeds 位移 3.8pp。
另：目標窗「開打就打完」抹平 dragonJoin knob 差異（tactic24 C4c ρ 0.64→0.28）→
窗長與承諾上限改由 knob 決定（ρ=0.84）。

### 驗證

`tools/check_moba_pacing29b1.mjs` **31/31 通過、exit 0**（含 runtime29 44/44 巢狀
= S23–S28 全部 verifier + regress + regress2 + build；flow09/dash10；節奏門檻
percentile 化且以 v2 對照證明檢定力；v3 正反序 invariant）。

### 已知限制 / 技術債（詳見 08）

- 營地不反擊、無野區入侵；其他四路 D 技能 reserved；巴龍 buff 只作用兵線。
- 塔傷不執行擊殺（刻意，保 KDA 不變量）。
- **未經瀏覽器/手機實測**：3D 低模外觀、HUD 版面、實機 FPS、節奏體感。
  需 Ray 真機打一場：確認 15 分擊殺體感、F/D 顯示、龍/巴龍/營地模型與 HP 條、
  MVP 列不再 undefined。

---

## Sprint 29B2 — MOBA Map Scale, Combat Visibility and Mobile HUD

**範圍**：29B1 部署後實機觀察——地圖太小、野怪/龍/巴龍「像直接消失」、小兵互打
無畫面、HUD 遮地圖。**紅線遵守**：不改 29B1 節奏參數/XP/Progress/Reward/
MatchProgressTransaction；不重寫 LogicEngine；Replay 不重新模擬；不用 CSS scale
假裝放大；不導入未授權素材。

### Audit 結論（資料可得性，動工前）

- objective/camp hp/maxHp/alive：✅ `snapshot.objectives`（29B1 已有，且 3D HP 條已存在
  ——「看起來直接消失」的實際原因是**條太小 + 相機太遠 + 無受擊/死亡轉場**）。
- 小兵 hp：❌ 引擎有 `m.hp` 但 `_snapLane` 未輸出；小兵死亡：❌ 無事件（id 消失可靠推導）。
- hit/damage 事件：❌ 無結構化事件；✅ 可由 prev/snapshot **hp 差分**導出（真資料非假動畫）。
- 英雄攻擊彈道：✅ 英雄互打有 fx；❌ 打野清怪/打龍**完全沒有** fx。
- Replay：❌ `ob` 只有存活位元，無 hp。
- mobile breakpoints：**整個 battle UI 一個都沒有**；HeroDetailPanel 關閉鈕在長內容最下方。

### 做了什麼

1. **資料補源（引擎，零行為改動）**：`_snapLane` 輸出小兵 `hp`（0–1）；
   `_updateNeutralsV3` 對打龍/巴龍（每秒最多 2 條）與打野清怪（每秒 1 條）推
   **零 rng** 節流彈道 fx + 營地死亡爆點；Replay `frame.ob` 升級為 hp 值。
   rng 序列與 29B1 逐位元相同 ⇒ 節奏不可能改變（pacing29b1 引擎層 25 項全綠佐證）。
2. **Combat Visibility**（MobaView3D，全部 prev/snapshot 差分）：英雄/塔/龍/巴龍/營地
   受擊 emissive 脈衝 0.25s；小兵 per-mesh scale 脈衝＋高度隨 hp（共享材質不可改色）；
   死亡：viewFx 擴散圈（**固定 14 格池**，滿了搶最舊）＋目標 0.5s 縮小下沉淡出＋
   小兵消失點爆點（fog 內紅方不噴）；小兵前鋒接觸火花（380ms/路節流）；
   HP 條 shownHp 插值（0.5s tick 階梯 → 連續下降）。
3. **Map Scale / Camera**：`fitZoomFor(w,h,mobile)` 視窗感知取景（真 ortho zoom）；
   跟隨 base/fight = fit×1 / ×1.5（手機 ×1.8）；焦點死區 6 單位（防抖）；
   非跟隨 `CameraRig` 預設取景；英雄 ×1.3（HK）、小兵 ×1.25、龍巴龍 3.3、營地 1.45/1.9；
   塔 crystal emissive 1.9/1.3→1.1/0.8、主堡燈 9→5（過曝修正）。
4. **Mobile HUD**（`src/ui/useViewport.js` 唯一分歧來源）：Timeline 手機預設收合＋
   收合列顯示最新事件；BattleHeroStrip 手機收合成**焦點對位列**（computeFocus 最近
   藍方英雄的 lane）＋bottom sheet 展開（46vh 捲動＋背幕關閉）；HeroDetailPanel 手機
   全螢幕 sheet＋**頂部固定 ✕**（桌機限高 84% 捲動）；Minimap 手機 106px＋safe area；
   控制鈕手機 ⚙ 收納；桌機底列可收合。
5. **Presentation MVP**：makeRiftTexture 重繪（河道帶狀水域＋波光、亮沙路面＋路緣、
   pit 坑面＋紫/金色環、營地菱形標記＋色暈、草叢亮綠＋虛線邊界、營地→路的野徑）。

### 驗證

`tools/check_moba_presentation29b2.mjs`：引擎層 12 項（objective/camp/minion hp 逐步
下降、序列化、replay 資料、FX 上限、真 hp、HUD 源碼斷言、無 undefined/NaN）＋
巢狀 13–19（pacing29b1 引擎層、runtime29 44/44＝S23–S28+regress+regress2+build、
flow09、dash10）。

### 已知限制 / 技術債

- **全部視覺未經瀏覽器/真機實測**（FPS/draw calls/外觀/互動）——需 Ray 依人工驗收
  清單實測（桌機 1366/1920、手機 320/360/390/430）。
- z-index 常數表、BattleHeroStrip per-player selector、手機 Scoreboard 入口、
  倍率/畫質併入設定面板 → 未做（列 29B3+）。
- Replay 不含小兵（frame 預算取捨，既有）⇒ Replay 的小兵互打畫面不存在；
  目標掉血/英雄 hp/事件已一致。
- viewFx 池 14 格：大團戰死亡爆點可能被搶格（刻意上限）。

---

## Sprint 29B3 — MOBA Match Controls, Camera UX and Map Readability

**範圍**：29B2 部署後實機觀察——結束按鈕語意錯誤、隊伍面板不夠 CS、地圖結構仍難懂、
黃/粉框無語意、缺點英雄 zoom、雙鏡頭按鈕不直覺、塔過亮、回血像亂走。
**紅線遵守**：不改 29B1 節奏參數/XP/Progress/Reward/MatchProgressTransaction；
不重播模擬；不寫死勝負；不加 PointLight；不刪 29B1/29B2 verifier。

### Audit 結論

- 「結束」= `stop()` 中斷（不進 Result）——與「跑到終局看戰報」的測試需求相反。
- 引擎**沒有回城**：只有走路回家＋泉水秒補 ⇒「走一下就回血」觀感的根因。
- 相機：雙大按鈕切換 follow on/off；無點擊互動、無英雄聚焦。
- 黃框=pit 色環、粉框=buff 營地菱形（29B2）——有位置無語意。

### 做了什麼

1. **Debug complete match**：`ui/debugMode.js`（DEV/?debug=1/localStorage 閘門）＋
   `useLocalServer.fastForward()`（同引擎分塊推進、每 2 模擬秒 push ⇒ Replay 取樣
   完整覆蓋、終局走既有 useBattleFeed 結算路——冪等發獎、Replay 定稿、EndScreen）。
   正式版無任何結束控制。verifier §2 實測「分塊+途中 snapshot 與自然跑完逐位元同結果」。
2. **相機模式**：`battle/cameraStore.js`（zustand：director/free/heroFocus/objectiveFocus）；
   MobaView3D pointer 互動（tap 英雄 raycast ⇒ heroFocus 4s、tap 空白/拖曳>8px/滾輪 ⇒
   free、雙擊 ⇒ 回導播）；BattleCameraController 分模式驅動（heroFocus 快跟+近 zoom、
   objectiveFocus=焦點鎖坑自動標記、free 完全不介入）；GameView 移除雙大按鈕、
   free 時單一「回到導播」。開局重置 director。
3. **回城 channel（v3 新機制）**：`recallChannel`（引導 6s/安全 12/遠 35/中斷冷卻 4s、
   啟動 1.4× 淨空遲滯）；recallLog→snapshot.recallEvents＋players[].rc；
   死亡/復活清空。**pacing29b1 引擎層 25/25 全綠、40-seed 正反序 0pp**（節奏未破壞）。
   連帶修 pacing29b1 §13 的斷言競態（終局 killerTeam 會被營地重生 reset 清掉 ⇒
   改為過程中累計 alive→dead 轉場——40 場合計 1809 次）。
4. **地圖可讀性**：makeRiftTexture 地面字（魔龍 DRAGON/凱撒 BARON/泉水/野怪/BUFF）＋
   泉水圓平台白十字＋基地方界；常駐 billboard 標籤 ×7（makeLabelSprite 重用）；
   Minimap 恆顯坑環＋泉水標記。**未改任何 gameData 座標**。
5. **塔光效**：常態 0.55/0.75（受擊 +1.6 峰值 0.25s、摧毀爆點）；主堡燈 3.5；
   Bloom 依畫質 0.7/0.9/1.05（quality.js bloomIntensity）。
6. **回城/泉水視覺**：藍圈快轉（引導，接 state「回城中」+rc）/綠圈慢轉（泉水治療，
   hp 上升差分+距泉水<12）/傳送起點爆點（recallEvents done）/「🌀 回城中」「⛲ 泉水」badge。
7. **隊伍面板手勢**：把手上滑展開/下滑收合（閾值 24px、touchAction none、拖曳杆、
   手機 padding 8px）；重用 29B2 bottom sheet，未建第二套。

### 驗證

`tools/check_moba_controls29b3.mjs` 26 項（引擎層 18 ＋巢狀 8：29B2 引擎層 12/12、
29B1 引擎層 25/25、runtime29 44/44＝S23–S28+regress+regress2+build、flow09、dash10）。

### 已知限制 / 技術債

- **全部互動/視覺未經真機實測**（觸控手勢、?debug=1 流程、標籤可讀性、FPS）。
- timeline 進度條拖曳/快轉到指定時間點：未做（需引擎快照回放緩衝設計，列候選）。
- 回城完成率 ~50%（實戰被追擊自然中斷）——是機制不是 bug；體感待 Ray 驗收。
- billboard 標籤恆顯（未做距離淡出）；若視覺過載列 29B4 調整。

### ⚠ 本次改動的既有 verifier 斷言（2 條，均為斷言跟不上合法重構/機制，非「擋住了 29B3」）

| verifier | 舊斷言 | 為什麼改 | 新斷言 |
|---|---|---|---|
| `check_moba_tactic24`（B 接線） | GameView 內 `start({ tactic })` 字面出現 ≥2 次 | 29B3 把兩個觸發點（START 鈕/autoStart）統一走 `begin()`（先重置相機再 start）——意圖（開局帶 tactic 進引擎）不變，字面計數失效 | 唯一入口含 `start({ tactic })` ＋ `begin` 出現 ≥3（定義+兩個引用） |
| `check_moba_pacing29b1` §13 | 終局時至少一座營地帶 `killerTeam` | **斷言本身有競態**：營地重生 reset 會清 killerTeam ⇒ 取決於終局落在誰的生命週期；29B1/29B2 通過是運氣（回城 channel 改變時序後曝露） | 模擬過程中累計「alive→dead 轉場」≥1/場（40 場合計 1809 次；真觀測、無競態） |

---

## Sprint 29B4 — MOBA Debug Recovery, Replay Fix and Clickability

**範圍**：29B3 部署後實測四修。**紅線遵守**：不改 29B1 節奏/XP/Progress/Reward/
MatchProgressTransaction；不動 gameData 世界座標；不重寫 LogicEngine；Replay 不重新模擬；
不新增 PointLight；不刪弱化舊 verifier；不開始 29B5。

### Audit → 根因

- **A 快速完成比賽（?debug=1 看不到）**：兩個疊加根因——(1) 按鈕巢狀在手機 ⚙ 收合面板
  `{(!isMobile||showCtl) && ...}` 內，手機預設收合 ⇒ 看不到；(2) `isDebugMode` 只讀
  `window.location.search`，Pages 上帶 hash 的網址（`.../#/x?debug=1`）search 為空 ⇒ 讀不到。
- **B 10 英雄部分可點**：`HeroDetailPanel` `if (!hero) return null`——`progress[heroId]`
  對「無 HeroProgress 紀錄」的英雄（對手方；或 heroId 不在既存 progress 集合，例如舊
  localStorage 建於英雄擴充前）為 undefined ⇒ 面板回傳 null ⇒ 點了沒反應。
- **C Replay 無法觀看**：以 Node 實測 buffer→finalize 路徑（自然每 tick / 快速完成每 2s
  兩種取樣）**本就健康**（461/660 frames、validateMobaReplay ok、matchId 同源、
  current===rep）。真正缺的是 `MobaReplayScreen` 對缺欄位無防護 ⇒ 潛在白畫面。
- **D 塔常駐光**：crystal idle emissive 0.55/0.75（29B3）＋主堡 PointLight 3.5 = 常駐光暈。

### 做了什麼

1. **debugMode.js**：`parseDebug` 同時解析 search 與 hash（Pages hash route）；URL 認定
   debug=1 後寫入 `localStorage.esmo_debug` 持久化（in-memory 換畫面不掉）；debug=0 可清除。
   導出 `parseDebug` 供 verifier 單元測試。
2. **GameView.jsx**：「⏩ 快速完成比賽」移出 ⚙ 收合區塊 ⇒ 測試模式**常駐可見**（zIndex 12）。
3. **HeroDetailPanel.jsx**：`const hero = storeHero ?? emptyHero()`（不再 return null）＋
   「尚無成長紀錄」註記 ⇒ 10/10 一致可開、可讀、可關（頂部 ✕ 沿用 29B2）。
4. **MobaReplayScreen.jsx**：白畫面防護——`towersMeta/playersMeta/s/g/tw/p/wp` 全套安全
   預設，`frame.p` 缺列跳過不崩（滿足「舊 Replay 缺新欄位不得白畫面」）。
5. **MobaView3D.jsx**：crystal idle emissive → 主堡 0.14 / 塔 0.06（低於 Bloom 門檻）；
   受擊 +1.6 脈衝、摧毀 viewFx 爆點保留；主堡 PointLight 3.5→2.0；**未新增 PointLight**。

### 驗證

`tools/check_moba_recovery29b4.mjs` 27 項（引擎層 21 ＋巢狀 6：controls29b3/
presentation29b2/pacing29b1 引擎層、runtime29 44/44＝S23–S28+regress+regress2+build、
flow09/dash10）。quick complete 分塊推進與自然跑完**逐位元同結果**；replay 自然+快速
兩路皆 canReplay=true。

### 已知限制 / 技術債

- **全部視覺/互動未經真機實測**（?debug=1 UI、觸控、塔光體感、Replay 播放外觀）。
- Replay 不含小兵（frame 預算既有取捨）。
- C 的根因偏「防護性」：Node 證不出白畫面的確切觸發（replay 資料本身健康），
  硬化 ReplayScreen 是對「舊格式/部分擷取」的防禦——若真機仍有 Replay 問題，
  下一步查 BattlePresentationLayer 的 over→EndScreen 掛載時序與 zIndex 60 疊層。
- 29B5 世界地圖放大（真實座標 + travel time）留待下一 Sprint（見 08）。

### ⚠ 本次同步的既有 verifier 斷言（2 條，均為「值/字串隨合法改動更新」，非弱化）

| verifier | 舊斷言 | 為什麼改 | 新斷言 |
|---|---|---|---|
| `controls29b3` §14 | 塔 crystal 常態 emissive `isNexus ? 0.75 : 0.55` | 29B4 移除常駐 idle glow ⇒ 常態值降到 `IDLE_EMISS 0.14/0.06`。檢查語意（常態 < 受擊/摧毀）不變 | 改比對 `o.idleEmiss + flashT*1.6` 與 `IDLE_EMISS = isNexus ? 0.14 : 0.06` |
| `presentation29b2` §8 | ReplayScreen `a.ob?.[i]` | 29B4 白畫面防護把存取加一層 optional chaining `a?.ob?.[i]`。仍是「讀 frame.ob 真實 hp」 | 放寬為 `a\??\.ob\?\.\[i\]` |

兩條都是**值/字串隨合法改動更新**，非刪除或弱化；底層行為（塔常態 < 受擊光、Replay 讀真實 hp）保持不變並經 verifier 重新驗證通過。

---

## Sprint 29B5 — MOBA World Scale and Objective Visual Pass

### Reference Audit

- `docs/reference/moba-map/`：2 張圖片、1 個影片。圖片用於大型角落基地、外圈三路、
  對角河道、分艙野區、獨立 pits/camps 的結構參考；未複製任何素材。
- 影片 metadata 可讀（25 秒、576×1280、約 30fps），本機無法擷取畫面，列人工驗收。

### 做了什麼

1. `gameData.js` 建立 220×220 `WORLD_BOUNDS` / `MAP_BOUNDS` 與新 LANES/RIVER/WALLS/
   BUSHES/PITS/CAMPS；基地、泉水、目標均維持鏡像／等距公平。
2. 小兵改用 1.8 世界單位／秒；英雄對線前沿改用 0.25 世界單位／秒，移除長路線下
   `t/600` 造成的隱性倍速。英雄一般移速仍 4.5。
3. Minimap、Camera、Replay `mapMeta`、Objectives / Camps 全部讀同一資料源；舊 Replay
   保留 100×100 fallback。
4. Dragon / Baron / Blue Buff / Red Buff / Jungle Camp 建立 distinct presentation metadata、
   程序化 silhouette 與簡化 icon；Dragon/Baron 不再有 PointLight 或以光圈作主模型。
5. HUD、Timeline、tactical comms、Replay、Minimap、3D labels 統一通用英文主名稱，內部
   `dragon` / `baron` id 與事件保持相容。
6. 塔／主堡維持低 idle emissive，受擊才 pulse、摧毀才 FX；PointLight 原始碼位置由 2 減至 1。

### 修改前後證據

- 世界：100×100 → 220×220；路線 133.98/99.74/129.79 → 312.14/226.27/306.79。
- 小兵首次受傷：82.5s → 111.5s；英雄接觸 p50：83.5s → 110s；最早：15.5s → 110s。
- 12-seed：首殺 303s、首塔 305s、5/10/15/20 分 0/3/7/15、時長約 24–25 分。
- 40-seed pacing：5/10/15/20 分 0/2/7/13、終局 21、時長 p50 24.1 分；25/25 通過。

### Verifier 與既有斷言

- 新增 `tools/check_moba_worldscale29b5.mjs`：開發層 20/20；完整模式再檢查 29B1–29B4
  exit/shape 與 runtime29 44/44。
- `pacing29b1` camp 鏡像由固定 `100-x` 改為 `WORLD_BOUNDS`；撤退微場景移到 bounds 中心。
- `runtime29` 地圖鏡像同樣改由 bounds 推導；v1 整場勝率位移在新幾何失去檢定力，改用
  同檔既有的「立即傷害互殺」與 `alive.find` 選敵兩個決定性微場景，active v2 ≤15pp
  公平門檻不變。
- `runtime29` §3 的「5 分鐘不再全員 Lv1」改以整隊平均等級與真實擊殺判定，不再要求
  大地圖每一條慢線都在 5 分前升級；§12 首塔門檻改驗現役 v3，v2 數字保留作參考、
  v1 病灶對照仍必須 <2.5 分。
- `controls29b3` 更新為 Dragon/Baron 與 presentation metadata 語意；`recovery29b4`
  PointLight 上限由「恰好 2」收緊為「≤1 且受畫質 gate」。

### 未經真機實測

地圖 2–3 倍視覺體感、手機 FPS/draw calls、觸控與鏡頭、objective 模型美術品質、
以及是否接近 reference 影片。完成 29B5 後停止，未開始 Season / BO3 / AI Teams / 多人連線。

## Sprint 29B6 — MOBA Camera Control, Real Replay and Battle UI Fix

依 Ray 於 29B5 部署後的手機實測修四項，並正式定義 2.5D 視角方向。
**不重做世界尺度、不改 gameData 座標、不改擊殺節奏、不碰 Progress / Reward /
MatchProgressTransaction。**

### A) 地圖不能移動 — 根因與修法

**根因（一行）**：`MobaView3D` 的
`<OrbitControls ... enablePan={debug} ...>` —— `debug` 是 prop，預設 `false`，
而 **`GameView` 從來沒有傳過它** ⇒ 正式版 `enablePan` 恆為 false。
OrbitControls 預設「單指/左鍵 = 旋轉、雙指 = dolly+pan」，於是手機上唯一能做的事
是把 2.5D 正交戰場**轉歪**（沒人要的操作），而真正要的 pan 根本沒有實作。
29B3 的 pointer handler 也只「切 camera mode」，位移一直是 OrbitControls 的職責。

**修法**：移除 OrbitControls 與 `CameraRig`，整理成**單一控制來源**：

- `battle/cameraStore.js` = 唯一狀態源：`mode` ＋ `pan`（**邏輯世界座標**）＋ `zoom`。
  `userPanTo` / `userZoomTo` 一律先切 `free`；`setAutoTarget` 只寫值不改 mode。
  `clampPan` 夾在 `WORLD_BOUNDS`、`clampZoom` 夾在 `ZOOM_MIN..ZOOM_MAX`（1.6/9，
  沿用 OrbitControls 舊值）。
- `MobaView3D` 手勢層：單指拖曳 → pan（**地面 y=0 raycast**，抓住的點跟著手指）；
  雙指 → pinch zoom ＋ 中點 pan；滾輪 → 中心 zoom；tap 英雄 → `focusHero`；
  tap 空白 → free；雙擊 → 回導播。`touchAction="none"`（原由 OrbitControls 設）。
- `BattleCameraController` = 唯一把 pan/zoom 套到相機的地方；固定俯角 `CAM_OFFSET`
  （沿用舊 `[55,78,78]×WORLD_SCALE` ⇒ **畫面角度逐值不變**），零旋轉。
  自動模式先平滑再把**螢幕上實際看到的**視野寫回 store ⇒ 切 free 無縫接續。
- 滾輪以畫面中心為錨（單次離散事件無法逐幀收斂到指標錨點，硬做會漂移）。
- HUD 不擋地圖：`BattleHUD` 已是 `pointerEvents:none`；`BattleTimeline` 根層改
  `pointerEvents:none`（只有標題列 `auto`）；十人面板背幕只在展開時存在。

### B) 2.5D 視角政策

新增 `docs/design/MOBA_2.5D視角與資產策略.md`（已入 `docs/README.md` 索引）：
2.5D 正交戰術視角、不追求自由旋轉 3D、預設斜上方正交、可 pan/zoom 不旋轉、
英雄/塔/野怪 3D 低模、地板草叢河道牆體可讀性優先、手機以觀戰可讀性與效能優先、
未來正式資產走 glTF/自有低模/可商用素材、**不使用 LoL / 傳說官方素材**。

### C) Real Battle Replay

**問題**：重播只是自己畫的一張 SVG 俯視圖，與現場 `MobaView3D` 是兩套獨立呈現。

**修法**（不複製第二套地圖，抽唯讀 adapter）：

- 新增 `battle/moba/replay/replayPresentationSource.js`：
  `replay.frames → { prev, snapshot, subTRef }`。關鍵對應 = 把「t 落在 frame a、b 之間、
  係數 f」對應成 `prev=a / snapshot=b / subT=f` ⇒ 重播走**與現場逐行相同**的插值、
  受擊閃光、死亡淡出程式碼路徑。
- `MobaView3D` 新增 `source` prop（`const src = source ?? useGameStore`）⇒
  **現場行為零改變**；`MobaReplayScreen` 改用同一個 `MobaView3D`，SVG 降為桌機 inset。
- **不掛 `BattlePresentationLayer`**（`useBattleFeed` 只在那裡）⇒ 不可能觸發終局結算。
- 播放時鐘 100ms `setInterval` → **rAF**（10Hz seek 會讓 3D 插值有階梯感）。
- **Fallback**：3D 場景由現行 220×220 `gameData` 建，舊 replay 是 100×100 ⇒
  `canUse3DPresentation` 要求 `mapMeta.bounds` 與現行 `WORLD_BOUNDS` 相符；
  不符/無 mapMeta/空 frames ⇒ 退回原 2D SVG 全螢幕（`legacyBounds`），明講「舊格式」。
- **誠實缺口**：`MobaReplay.v1` frame **不含小兵**（每幀 96 隻會讓 ~345KB 翻倍），
  重播不畫小兵並在畫面明示；`state`/`respawn`/`contested`/fx/feed/recallEvents 未擷取
  ⇒ adapter 給 null/空陣列。連帶 `MobaView3D` 死亡文案改
  `Number.isFinite(np.respawn) ? "☠ Ns" : "☠ 陣亡"`（不顯示假的 0s 倒數）。
  任務單 §C-5 的顯示清單不含小兵 ⇒ 未擴充契約。

### D) Objective death / fade — 根因與修法

Ray：「打完後疑似延遲或突然消失，英雄走兩步後才不見」。**兩個缺陷疊加**：

1. **相位差**：英雄/小兵畫在 `lerp(prev → snapshot, ease(subT))` ⇒ 視覺上落後
   `snapshot` 最多**一整個 tick**（1× 500ms、2× 250ms）；但中立目標舊碼**直接讀
   `snapshot` 且不插值** ⇒ 目標死亡比「英雄視覺上打完最後一下」早一個 tick。
2. **血條追值殘留**：`shownHp = lerp(shownHp, hpNow, dt*6)` 是追值（永遠落後 ~0.2s），
   死亡瞬間又強制歸零 ⇒ 血條還剩兩三成、模型就沒了。
3. fade 只有 0.5s（規格 0.8–1.5s）；死後坑位空無一物、重生直接彈出。

**修法**（全部是既有真實資料的插值/差分）：

- 目標 hp/存活改由 `prev.objectives → snapshot.objectives` 插值，用**和英雄同一個 `a`**：
  `alive = nAlive || (pAlive && a < 1)` ⇒ next 已死時撐到 `a=1` 才轉死；
  hp 走 `lerp(pv.hp, 0, a)` ⇒ **血條歸零與模型死亡同幀**（重生則直接滿血）。
- `OBJ_FADE_S = 1.1`（規格 0.8–1.5s）；淡出期間**不顯示 HP 條**。
- **absent 環**：死後坑位留低亮度脈動環，重生即隱藏（加在 `world` 而非目標 group，
  因為 group 死後會被隱藏）；共享 geometry、**未新增任何 PointLight**（維持 ≤2 上限）。
  Dragon/Baron 的 respawn 倒數本就在 `BattleHUD`（真實引擎資料）。
- **引擎層未改**：`hp<=0` 的同一 tick 就 `alive=false` / `hp=0` / 帶 `respawn`
  （verifier §12 實測）——本 Sprint 只修呈現層相位。live 與 replay 走**同一段
  `updNeutral`** ⇒ 不可能再各畫各的。

### E) Battle feed safe area — 根因與修法

**根因**：沒有人定義過 score header 的安全區，各元件各憑記憶挑數字：
`BattleHUD` `top:6` 高約 106–122px（含**藍紅勝率條**與 MVP 列）、`zIndex 8`；
`BattleTimeline` **`top:96`**、`zIndex 8` 且 DOM 較晚 ⇒ 壓在勝率條上；
`GameView` 的 ⏩/⚙/倍率/畫質 **`top:92/128/160`**、`zIndex 10–12` ⇒ 同樣壓在 HUD 上。

**修法**：新增 `battle/ui/battleLayout.js`（純常數，Node verifier 可直接讀）：

- `HUD_TOP=6`、`HUD_H=126`（逐列上界推導；`BattleHUD` 加 `maxHeight: HUD_H` 讓
  「實際高度 ≤ 常數」在執行期也成立）、**`SAFE_TOP=138`**（任何頂部浮層的下限）。
- `FEED_LEFT=10`、`FEED_MAX_W=226`、`FEED_RIGHT_RESERVE=132`；戰報
  `maxWidth: calc(100% - (FEED_LEFT+FEED_RIGHT_RESERVE))` ⇒ 320/360/390/430 右緣
  188/228/236/236，皆 ≤ 視寬 − 保留區（右上控制鈕欄同樣從 SAFE_TOP 起）。
- **`Z` 表落地**（29B2 起的待辦）：canvas 0 / hud 8 / feed 8 / minimap 9 / controls 10 /
  strip 11 / overlay 12 / end 20 / replay 60 —— 沿用既有值，**未改變疊放次序**。
- `GameView` 的 ⏩/⚙/倍率/畫質改成**單一 flex 直欄**（`top: SAFE_TOP` + `gap`），
  不再每顆鈕各寫死 top；手機 ⏩ 文案縮為「快速完成」以留出 320px 寬度。
- 手機戰報預設仍是**單行 toast**，完整戰報靠 drawer 展開，展開起點仍在 SAFE_TOP 之下。

### Verifier 與既有斷言

新增 `tools/check_moba_camera_replay29b6.mjs`：開發層 **16/16 exit 0**；完整模式再檢查
29B5/29B4/29B3/29B2/29B1 的 exit code 與輸出形狀、runtime29 44/44
（內含 S23–S28 + regress + regress2 + build）、以及獨立的 `npm run build`。

⚠ **完整單行程模式在本機跑不完（記憶體不足，非回歸）——實測證據如下**：

| 執行方式 | 結果 |
|---|---|
| `SKIP_NESTED=1` 29b6 開發層（16 項） | **16/16 exit 0** ✅ |
| 29b6 完整模式的 17–21（29B5/29B4/29B3/29B2/29B1，含 exit+shape） | **5/5 全綠** ✅ |
| `node tools/check_moba_runtime29.mjs` **單跑** | **44/44 exit 0** ✅（含 30) stats28 29/29、36) regress、37) regress2、38) build） |
| `node tools/check_moba_stats28.mjs` **單跑**（無 SKIP_NESTED 閘門 ⇒ 完整） | **29/29 exit 0** ✅ |
| `npm run build` 單跑 | **exit 0**（`built in 9.36s`）✅ |
| 29b6 **完整單行程**（29b6 → runtime29 → stats28 → vite → esbuild） | ❌ runtime29 42–43/44：`30) stats28 exit=1`、**`38) npm run build exit=134`** |

**exit 134 = SIGABRT/OOM**；本 session 亦獨立重現 esbuild `fatal error: out of memory`。
本機 13.84GB 總量但**僅 ~1.7–2.1GB 可用**，而該鏈最深處同時有約 5 個 Node heap
＋ esbuild 的 Go runtime（需 ~1GB）。**同一支 stats28 在巢狀深度 2 過、深度 3 不過**
⇒ 資源競爭，非程式缺陷。此限制**不是 29B6 引入的**：`check_moba_worldscale29b5`
也是同樣的 `→ runtime29 → stats28` 深度，只是當時記憶體較寬鬆。

⇒ **記憶體吃緊時請分兩段跑**（合起來覆蓋完全相同的檢查）：
`SKIP_NESTED=1 node tools/check_moba_camera_replay29b6.mjs` ＋
`node tools/check_moba_runtime29.mjs`。判讀方式見 `08_目前待辦與風險.md`。

⚠ **改動了兩支既有 verifier 的斷言**（皆為「斷言綁定舊架構」，非功能壞掉；
檢查**數量未變** ⇒ 其他 verifier 硬編碼的輸出形狀不受影響）：

1. **`check_moba_controls29b3` §10**：舊斷言 `/if \(cam\.mode === "free"\) return/`，
   語意是「free 時控制器**完全不介入**」——那是舊架構的事實（free 鏡頭由
   OrbitControls 自己持有，控制器只需讓開）。29B6 依任務單「整理成單一控制來源」
   移除 OrbitControls，free 的 pan/zoom 改由 cameraStore 持有、**由控制器套用**
   ⇒「不介入」已不成立。新斷言保留這條真正要守的規則：**free 時控制器不跑導播、
   不與玩家搶鏡頭**（不呼叫 `computeSpectatorFocus`，直接套用玩家 pan/zoom 後結束該幀），
   並新增「拖曳走 `userPanTo`」。
2. **`check_moba_presentation29b2` §8**：舊斷言綁 `/clamp\(ob\.hp/`，對應舊寫法
   `shownHp = lerp(shownHp, hpNow, dt*6)`（**追值**）。29B6 D 項查出那正是「血條還剩
   兩三成、模型卻突然消失」的成因之一。新斷言改綁真值插值式
   （`lerp(pv.hp, nx.hp, a)` / `lerp(pv.hp, 0, a)` / `clamp(hpNow, 0, 1)` / `prev.objectives`）
   —— 兩者都守「只吃 `snapshot.objectives` 真實 hp、不造假血條」這條紅線，
   語意不變且**更嚴**（不再容許追值殘留）。

其餘既有 verifier 未改：`recovery29b4` 的白畫面防護斷言
（`towersMeta`/`playersMeta`/`a?.s`/`a?.p?.[i]`/`if (!pa) return null`）仍全數命中——
它們被保留在重構後的 `ReplayMap2D`；`experience26` / `runtime29` / `stats28` /
`pacing29b1` 的「replay 零引擎 / 零 `.tick(` / 零結算」斷言同樣仍成立。

### 未經真機實測

觸控手勢（單指 pan / 雙指 pinch / tap 英雄 / 雙擊回導播）、實機 FPS
（移除 OrbitControls、新增 absent 環與手勢層後）、3D 重播視覺與舊格式 fallback 畫面、
320/360/390/430 的 safe area 實際位置。完成 29B6 後停止，未開始 29B7 /
Season / BO3 / AI Teams / 多人連線。

---

## Milestone G.15-final ＋ H.1（2026-07-27）

### G.15-final — Base Exit / Wall / Highground Visual Acceptance

**根因**：G.15-fix4 之後牆體已是「唯一模組 × 三次旋轉」，但三座高地塔看起來仍歪斜。
量測發現病灶不在塔的座標，而在**門與塔各自為政**：三座塔偏離自己那個門的軸線
+11.8 / +7.3 / −8.3，距離也各不相同（35.4 / 30.5 / 28.3）。

**作法**：新增 `src/battle/moba/map/mapBaseFrame.js`，把「基地骨架」抽成單一來源
（BASE_GEO ＋ 唯一牆體模組 ＋ 三個門的等角方位 ＋ 高地塔站位），並且

1. 門扇中軸 φ0 改用「門方位 vs 塔原方位」的角度 minimax（**idempotent**，
   誰先算誰後算都不會漂移），實測最大角差 8.14°。
2. `alignHighgroundTowers()` 把三座高地塔的**呈現座標**貼到自己那個門的軸線上，
   距平台中心一律 `towerR = 32.2` ⇒ 三路的「出口 → 塔」相對位置完全相同。
   ⚠ 只動呈現座標，`sim{t,x,y}`（gameData 模擬座標）一個字未改。
3. `mapLaneStyle` 的道路近基地段改走「主堡 → 內庭轉折 → 城門 → 高地塔」，
   再接回原本的 lane 控制點 ⇒ 道路真的從城門長出來，塔也真的站在路面上
   （verifier 的「塔應落在路面上」仍全綠）。
4. 高地走廊改成沿出口軸線的直帶，成為模組的一部分。

**驗證**：`check:mobamap` 3553 通過 / 0 失敗；build、regress、regress2 全過。
真實 three.js 固定截圖 12 張於 `review/moba-map/g15-final/`（headless Chrome + CDP）。

**未完成**：Codex 視覺驗收在工具 10 分鐘上限被中斷，**未取得判定**，
`review/moba-map/CODEX_BASE_VISUAL_HANDOFF_G15_FINAL.md` 不存在。
依使用者指示不再阻塞，主堡牆體本輪停止微調。

### H.1 — MOBA Runtime Map Integration

把正式戰鬥畫面接上新地圖，**引擎與戰鬥數值一律未動**。

- **座標契約**：擴充 `src/battle/moba/map/coordinateMapping.js`（未另建新檔），
  集中 sim↔world、鏡射、地圖中心／半幅、lane/tower/base/camp/river 具名存取。
- **Runtime Adapter**：新增 `mobaRuntimeMapAdapter.js`，snapshot → heroes / structures /
  objectives，保證無 NaN，補值一律標記 fallback。
- **Runtime Renderer**：`MobaRuntimeMap.jsx`（地形，`towers:false`）＋
  `MobaRuntimeHeroes.jsx`（Prototype 英雄）＋ `MobaRuntimeStructures.jsx`（塔／主堡，
  位置取地圖呈現座標、狀態取 snapshot，以 id 對應）＋ `MobaRuntimeView3D.jsx`
  （Canvas ＋ MOBA 斜俯視相機、拖曳／滾輪／雙指縮放／邊界／回到中心／鎖定英雄）。
- **Feature flag**：`mobaMapPresentation.js`（`legacy` | `runtime-v2`），
  URL > localStorage > `VITE_MOBA_RUNTIME_MAP_V2` > 預設 legacy。
- **新 verifier**：`tools/check_moba_runtime_map_h1.mjs`（66 通過 / 0 失敗）。
- **文件**：`docs/architecture/MOBA_RUNTIME_MAP_COORDINATE_CONTRACT.md`。

**未完成**：Replay 畫面（`MobaReplayScreen`）仍走 legacy 呈現路徑；
Codex 視覺驗收見本輪回報。未 git add / commit / push。

> ⚠ **本段的「Replay 仍走 legacy」已於 H.1-close（2026-07-27）失效**，見本檔最後一節
> 〈Milestone H.1-close〉。原文保留以維持歷史紀錄，不得再當成目前狀態引用。

---

## Milestone H.1-close — Runtime Map Acceptance Closure（2026-07-27）

**不是新 Milestone**：只補齊 H.1 沒做完的驗收項目。未開始 H.2。
未 git add / commit / push（依使用者指示）。

### 一、「藍方英雄疑似扁平色塊」的真正原因

以真實 Chrome 的 three.js **場景圖**（不是看程式碼推論）逐一驗證 10 名英雄後確認：
**英雄沒有被壓扁**——10 名全部是 `CapsuleGeometry`、`rootScale`／`bodyScale` 皆為 1、
材質 `MeshStandardMaterial`。畫面上那塊扁平色塊是**防禦塔**：

`MobaRuntimeMap` 以 `towers:false` 掛地圖（正確，塔的狀態必須來自 snapshot），
但 `MobaRuntimeStructures` 當時**只畫了浮空的八面體塔冠 + 一圈地環**，塔身從未補上
⇒ 一座塔在畫面上就是「半空中一塊藍色／紅色的扁平色塊」。

### 二、實際修掉的六個渲染缺陷（全部由真實畫面複驗）

| # | 缺陷 | 根因 | 修在哪 |
|---|---|---|---|
| ① | 塔＝浮空扁平色塊 | 只有塔冠，沒有塔身 | `MobaRuntimeStructures`：補八角塔身，摧毀後塌成殘骸樁（主堡**不**補，避免與 base 圖層重疊） |
| ② | 選取環／塔環／目標環全部看不見 | 環掛在 y≈0.2–0.43，但地面鋪層在 `LAYER_Y.lane_surface 0.64`／`tower_pad 0.94`／`pit_ring 0.86` ⇒ 整圈埋在地形底下 | 依 `LAYER_Y` 抬到各自地形層之上 |
| ③ | 滿血血條看起來是一條全黑空槽 | `bar.scale.x = hpRatio` 把 JSX 設好的世界寬度 `HERO.barW` 整個蓋掉（滿血只有 1 單位寬，背板 5.8） | 改成 `HERO.barW × hpRatio` |
| ④ | 血條在英雄背對鏡頭時整條消失 | 血條是固定朝 +Z 的平面，卻掛在會隨 `facing` 轉動的 root 底下，單面材質轉到背面 | 血條群組每幀反轉回世界朝向；材質補 `DoubleSide` |
| ⑤ | 血條填色被自己的背板蓋掉 | three.js **先畫完所有不透明物件再畫透明物件**，`renderOrder` 只在同佇列內有效。背板 transparent、填色不透明 ⇒ 填色先畫、背板後畫蓋上去 | 三個血條材質全部改 transparent |
| ⑥ | 屍體變成一塊不透明深色方塊 | 死亡只處理本體（沉下 + 28% 透明），**肩塊沒處理**，維持全不透明且停在原高度 | 肩塊跟著本體沉下並淡出 |

另外修：英雄整體抬到走道表面（原本站在 y=0，腳陷進路面）；
`quality` 等級 id 是 `low|medium|high`，但 runtime 只比對 `"mid"` ⇒ medium 等於沒生效；
Adapter 補收 replay 的 `lv`（現場是 `mlv`），否則重播全部顯示 Lv1。

⚠ **踩過一次的坑（已寫進註解）**：地面層高度在 `LAYER_Y`，不是 `HEIGHT`，
兩張表都有 `lane_surface` 這個 key。取錯 → `undefined` → `position.y = NaN` →
整個 `matrixWorld` 變 NaN → **10 名英雄同時從畫面上消失**（`visible` 旗標仍是 true）。
診斷探針因此改為回報「投影後是否真的落在畫面內」，不再只信 `object.visible`。

### 三、Replay 最小接線（H.1 原本未完成，本輪補上）

`MobaReplayScreen` 依 `loadMapPresentation()` 選呈現模式：`runtime-v2` 時掛
`MobaRuntimeView3D` 並把既有的 `createReplaySource(replay)` 從新增的 `source` prop 傳進去；
`RuntimeFrameFeeder` 的資料源預設 `useGameStore`，有 `source` 就改讀它
⇒ **現場與重播同一個 Renderer、同一支 Adapter、同一份座標契約**，沒有第二套座標轉換。
`legacy` 維持原本的 `MobaView3D` 一行未改；`replayBuffer` schema 一個欄位未動。

實測（真實 Chrome，`09_runtime_replay.png`）：10 名英雄位置還原、暫停後畫面穩定、
時間軸跳轉後位置更新、legacy 可回退。

### 四、驗收工具改為「真實 GPU」

`tools/shot_moba_runtime.mjs` 整支重寫。舊版用 `--headless` + SwiftShader（CPU 軟體 WebGL），
那種 FPS 不能當效能依據。新版用**有視窗的真實 Chrome**，效能直接讀 three.js `renderer.info`。

實測 GPU：`ANGLE (AMD Radeon(TM) Graphics, Direct3D11)`。
桌機 1920×1200 60 FPS / 220 draw calls / 86,887 triangles；
手機尺寸 430×900 60 FPS / 87 draw calls；mobile-low 同為 60 FPS。
（⚠ 手機數字是**桌機 GPU 上的手機尺寸繪圖緩衝**，不是實機。）

### 五、驗證（全綠，輸出已貼在回報）

`check_moba_runtime_map_h1` 66/0｜`check:mobamap` 3553/0｜`build` 通過｜
`regress` 15/15｜`regress2` 8/8｜`check_moba_runtime29` **44/44（exit 0）**。

### 六、Codex 視覺驗收：**FAIL（H.1 未宣告完成）**

`gpt-5.6-sol`／reasoning effort high／sandbox read-only，讀 9 張真實截圖。
輸出：`review/moba-runtime/CODEX_RUNTIME_MAP_REVIEW_H1.md`。

- **第一輪 FAIL**（3 blocking）：全場圖數不出 10 人、手機小地圖被十人面板蓋住、文件與實作矛盾。
- 依規則只做**一輪**修正：全場截圖改為「等到十人彼此分開且中央擊殺快報播完」才按快門
  （實測分離度 4.71%）；手機小地圖由 `bottom:50px` 抬到 `96px`（實測重疊 0px）；
  座標契約 §6 改寫；06 對照圖改為**同一場**按畫面上的「地圖 新版／舊版」切過去拍。
- **第二輪仍 FAIL**：12 項中 11 項 PASS，第 12 項不通過。剩餘 blocking：
  1. 本檔舊 H.1 段落仍寫「Replay 仍走 legacy」← **本節已修正並加註失效標記**。
  2. `03_runtime_midgame.png` 的**陣亡英雄在畫面上看不出來**：屍體是沉下、28% 透明、
     無名牌無環，在全場視角幾乎與地形融為一體。JSON 有 `deadHeroCount:1` 但
     驗收要求的是**視覺**證據，數字不能替代。

### 七、補完陣亡英雄視覺（Codex 最後一項 blocking，已修）

Codex 第二輪唯一剩下的畫面問題是「03 中期截圖看不出陣亡英雄」。原因是舊的死亡狀態
（沉入地面 + 28% 透明 + 藏名牌）在資料上正確、在畫面上等於消失。改法：

| 面向 | 修改後 |
|---|---|
| 姿態 | **倒地**：本體 `rotation.x = -π/2` 橫躺，高度 `radius × 0.95`（躺在地上，不是陷進地裡） |
| 顏色 | **去飽和**：隊色混 60% 灰（藍 `0x718fb3`／紅 `0xaf726e`），仍讀得出陣營 |
| 透明 | 0.28 → **0.55**（夠淡但不消失） |
| 位置標記 | 新增**菱形（4 邊 Ring）地面標記**，比選取環大一圈 ⇒ 與活人的 20 邊圓環剪影不同 |
| 血條／選取環／肩塊 | 一律隱藏（肩塊留著只會又變成色塊） |
| 名牌 | 不再全隱藏，改 0.5 透明 + `grayscale(0.65)` ⇒ 全圖視角仍認得出是誰陣亡 |

截圖工具同步調整：有陣亡英雄時把 `03` 的鏡頭移到該屍體、距離 165
⇒ 陣亡狀態成為**可見證據**而不只是 JSON 數字。診斷探針新增
`deathMarkVisible` / `bodyLyingDown`（實測 `true` / `true`，`materialOpacity 0.55`）。

### 八、H.1 狀態：**完成**

- 正式 GameView 走 runtime-v2；10 名英雄皆來自 snapshot，藍 5 紅 5
- 全地圖截圖十人可辨識（實測分離度 4.08%，無中央快報遮擋）
- 無扁平色塊英雄；陣亡英雄畫面上清楚可辨
- 塔與主堡無重複；Debug UI 未混入；Legacy 可回退
- Replay 已接 runtime-v2（暫停穩定、跳轉更新、可回退 legacy）
- 桌機／手機截圖齊備（手機小地圖與十人面板實測重疊 0px）
- `shot_stats.json` 逐張對齊 9 張截圖；效能為**真實 GPU**（AMD Radeon / D3D11）數字
- 驗證：H.1 verifier 66/0、`check:mobamap` 3553/0、build 通過、regress 15/15、
  regress2 8/8、runtime29 44/44

⚠ Codex 的 PASS 判定停在第二輪的 11/12（當時陣亡視覺尚未修）。
依使用者指示本輪**不再呼叫 Codex**，最後一項改以真實截圖自證
（`03_runtime_midgame.png`：橫躺去飽和本體＋菱形標記＋淡化名牌，
旁邊即為站立的紅方英雄可直接對照）。

### 八、已知限制（列入 H.2，本輪未修）

- 沒有地形高度查詢：英雄一律吸附在 `LAYER_Y.lane_surface`，站在高地平台
  （`HEIGHT.base_platform = 3.6`）上仍會陷進去約 3 個世界單位。
- 重播是**疊在**仍掛載的 `GameView` 上開的 ⇒ 底層 3D Canvas 仍在運作
  （實測 `canvasCount: 3`），多耗一份 GPU，底層英雄名牌可能從邊緣露出。
- 手機只驗過 430×900，未驗 320/360/390，也未在實機上驗觸控與續航。
- 英雄仍是 Prototype 膠囊，不是正式模型。


---

## Milestone H.2 — 英雄碰撞與尋路改以地圖幾何為唯一真實來源（2026-07-28）

完整技術報告：`review/moba-runtime/h2/H2_COLLISION_NAV_REPORT.md`

### 一、做了什麼

1. **碰撞唯一來源** = `src/battle/moba/nav/mobaNavigation.js`
   （地圖 `wallItems` 的 1.0 格點距離場 + 18 塔 2 主堡的動態圓）。
   `gameData.WALLS`（28 個手寫圓）退役為 legacy 畫面專用，引擎不再引用。
2. **塔位唯一來源** = `src/battle/moba/map/mobaTowerPlacement.js`（地圖呈現座標）。
   舊的模擬座標與畫面平均差 15.4 單位 ⇒ 18 座塔有 12 座「看得到卻推不到」。
3. 閃現／回城／重生落點一律投影到可走區；移動改為
   目標推回通道中心 → 子步進（沿牆切線滑動）→ 近場預判觸發 A*。
4. `LANES.top` / `LANES.bot` 改為**精確 180° 鏡像**（最大位移 2.83 單位）。
   原本互差 5.66，碰撞上線後直接變成藍紅不公平。
5. 新增 verifier `tools/check_moba_nav_h2.mjs`（14 條）與
   基準工具 `tools/bench_moba_baseline.mjs`（勝率／時長／擊殺／破塔／順序偏差）。

### 二、過程中抓到並修掉的 10 個問題

摘要見技術報告 §3；其中影響最大的四個：
lane 上下路不對稱（順序偏差 15pp、藍方勝率 15%）、
A* 的鏡像映射把 `blue_top_0` 對到 `red_top_0`（正確是 `red_bot_0`）、
終點格被結構遮罩蓋住導致「泉水走不到門牙塔、比賽拆不完」、
沿牆滑動只走單軸造成有效移動只剩 0.743。

### 三、驗收（全部實跑，輸出貼在技術報告）

- `tools/check_moba_nav_h2.mjs` **14 PASS / 0 FAIL**
  （距離場鏡像 0 格不一致、塔位鏡像誤差 0、藍紅目標全可達、鏡像航段路徑長差 0.00）
- `npm run check:mobamap` **3553 通過 / 0 失敗**（lane 資料改動後重跑）
- `node tools/regress.mjs` **15/15**、平均 25.3 分、0 殺場 0、撤退鎖死 0
- `node tools/regress2.mjs` **節奏門檻 8/8**（中位 24.9 分、最長 28.1 分、5 分均等級 4.55）
- `npm run build` ✅
- `tools/bench_moba_baseline.mjs --seeds 240`：
  藍 48.8 / 紅 47.5、**順序偏差 2.1pp**（H.1 基準 3.8pp）、結束率 231/240、中位 24.85 分
- `node tools/check_moba_runtime29.mjs` — 見本節「六、runtime29」

### 四、節奏重校（碰撞的連帶後果）

碰撞讓撤退變難 ⇒ 擊殺數 21.6 → 32.2（+49%）、時長變長，regress2 一度掉到 4/8。
依 v3 既有原則（**提高推進效率、不加塔血**）調整：
`moveSpeed 4.5 → 5.90`、`fightSpeed 5.4 → 7.07`、`heroTowerDmg 88 → 104`、
`lateAccelDiv 82 → 74`。係數的判準是**對標 regress2 節奏門檻**，理由寫在
`matchProgression.js` 的 v3 註解裡。
⚠ regress2 只有 20 seeds、場間變異大；調參請先看 240 seeds 的 bench。

### 五、已知限制（未做）

- **塔目前 100% 擋人**：基地出口淨寬只有 9.66–10，幾何上容不下「繞過站在中線的塔」
  （需 ≥ 13.2）。要讓英雄真的能繞塔，得由 G 系列拓寬塔前廣場。
- 英雄之間沒有互相碰撞；沒有地形高度查詢（H.1 遺留）。
- **模擬成本 0.100 → 0.556 ms/tick（5.6×）**，來源是尋路本身（約 900 次/場 × 1.3ms）。
  遊戲端可接受，但**全套 verifier 明顯變慢**。
- **未經瀏覽器實測**：本輪全是 Node 端模擬與幾何驗收，沒有跑 Chrome 截圖。
  「正式戰鬥畫面上英雄不再穿牆」仍需人工或 verifier 在瀏覽器複驗。

### 六、runtime29（**未收斂，這是接手時要做的第一件事**）

第一次完整重跑：**39/44**。五項紅的根因是同一個——碰撞被套用到 **v1/v2 規則集**，
但那兩組的存在意義正是 runtime29 用來「重現修改前病灶」的歷史基準：

| 編號 | 內容 | 判定 |
|---|---|---|
| 12 | 塔拆除節奏（斷言 `avgV1 < 150` 秒，v1 舊病灶要能重現） | v1 吃到碰撞 ⇒ 不再重現 |
| 23 | `rules:v1` 重現舊節奏（全場 Lv1 + 首塔 <2.5 分） | 同上 |
| 29 | v2 陣列順序不決定勝負（位移 18pp > 15pp 門檻） | v2 吃到碰撞 ⇒ 基準位移 |
| 30 | `check_moba_stats28`（exit=-1，stdout 空） | 疑似**子行程 15 分鐘逾時**，非斷言失敗 |
| 31 | `check_talent27`（exit=-1，stdout 空） | 同上 |

**已做的修正**：新增 `SIM_RULES.v3.navCollision = true`，把真實碰撞／尋路／新塔位
全部收斂到 v3；v1/v2 走回舊的「直線位移 + `gameData.WALLS` 圓形推開 + 直接瞬移」。
改完後已重跑 `check_moba_nav_h2` 14/0 與 `regress2` 8/8（皆通過）。

**逾時假說已證實**（單跑，計時）：
- `node tools/check_talent27.mjs` → **44/44 通過**，耗時 **94 分 34 秒**
- `node tools/check_moba_stats28.mjs` → 25/29，耗時 **87 分 42 秒**；
  它自己的 4 項紅也全是巢狀子驗證器 `exit=-1`（同樣是逾時）
⇒ 30/31 是**子行程被逾時砍掉**，不是斷言失敗。

**已做的兩件補救**：
1. `CHILD_TIMEOUT = 5400000`（90 分）取代 runtime29 900s / stats28 300s /
   camera_replay29b6 600s 三處硬編碼逾時。
2. 壓模擬成本（不改行為）：結構遮罩 bitmask 快取、A* 三張表改世代戳記重用、
   折線簡化回掃限制 24 格視窗 ⇒ **0.683 → 0.321 ms/tick**（單場 2.05s → 0.93s）。
   單次 A* 從 25–56ms 降到 0.44ms。

**runtime29 完整巢狀驗證：未完成（依使用者指示中止，非程式失敗）**

修正後的重跑於 2026-07-28 啟動，因為它會巢狀跑 stats28 + talent27 + 其餘六支
（單是那兩支就各要 88 / 94 分鐘），預估 2–3 小時，**依使用者指示提前中止，未取得結果**。

⇒ 這一項目前的狀態是「**完整重跑未完成**」。
   它**不是**「runtime29 失敗」，也**不能**寫成程式有問題：
   · 第一次跑的 39/44，五項紅的成因都已查明（三項 v1/v2 基準污染、兩項子行程逾時），
     且兩者都已修（`navCollision` 旗標、`CHILD_TIMEOUT`）。
   · 修正後 `check_moba_nav_h2` 14/0、`regress` 15/15、`regress2` 8/8 皆重跑通過。
   · 被誤判的兩支單跑實測分別是 44/44（talent27）與 25/29（stats28，其 4 項紅同樣是
     它自己的巢狀子行程逾時）。

**接手時要做的兩件事（依序）**：
1. **真實 Chrome 戰鬥畫面驗收**——H.2 全程只有 Node 端幾何與模擬驗收，
   「畫面上英雄不再穿牆、不再穿塔、不再穿基地牆」從未在瀏覽器上看過。
   這是 H.2 的核心宣稱，必須用真實畫面複驗（可沿用 H.1 的 `tools/shot_moba_runtime.mjs` 流程）。
2. 補跑 `node tools/check_moba_runtime29.mjs`（預留 2–3 小時），確認 44/44。

⚠ 上面兩項都完成之前，**H.2 不算完成**。

---

## Milestone H.2-close — 碰撞與尋路的真實 Chrome 驗收（2026-07-28）

完整技術報告：`review/moba-runtime/h2/H2_COLLISION_NAV_REPORT.md` §4.6–4.8
驗收產物：`review/moba-runtime/h2-close/`（5 張截圖 + `h2close_chrome_acceptance.json`）

### 一、結論：**通過（15 PASS / 0 FAIL）**

`node tools/check_moba_nav_chrome_h2close.mjs --url http://localhost:5173/ESMO-`
有視窗的真實 Chrome、真實 AMD GPU（非 headless、非 SwiftShader），
在**正式 GameView 的對戰**裡跑完整一場（1,363 筆取樣 ≈ 13,600 個英雄-幀）。

不靠目視：整場每 0.6 秒讀 `window.__ESMO_RUNTIME_DIAG()` 取 10 名英雄座標，
回 Node 用 `mobaNavigation` 對每個取樣點實際判定穿牆／穿結構／卡死／抖動／閃爍。

- 不穿牆（引擎座標 **與** 畫面座標兩本帳分開驗）、不穿塔與主堡、不穿龍坑巴龍坑
- 不卡死、不原地抖動；10 人都走得出基地、走得到三路中段、進得了野區
- 沒有英雄無故從畫面消失（閃爍已消失）
- 效能：60 FPS｜197 draw calls

引擎端另有 Node 佐證：10 個 seed 逐 tick 全檢 **271,824 個英雄-tick，穿牆 0、穿結構 0**。

### 二、抓到並修掉的 5 個真問題

| # | 問題 | 修法 |
|---|---|---|
| 1 | 開局 10 人裡有 2 人直接生成在泉水牆裡（淨距 1.00 < 半徑 2.4） | 生成點投影到可走區（僅 v3） |
| 2 | 結構遮罩以格心蓋章（H.2 效能優化引入）⇒ 英雄啃進塔基 0.48 單位 | 遮罩加邊界帶，帶內改用精確圓判定 |
| 3 | 畫面內插 prev→snapshot 拉直線會**切過牆角** | 內插點不可走時退回引擎驗證過的座標 |
| 4 | 截圖在取樣結束後才拍，全被終局結算畫面蓋住 | 截圖排進取樣迴圈，於比賽進行中拍 |
| 5 | 驗收探針 `toFixed(2)` 讓 87.4999 進位成 87.50 ⇒ 查到隔壁牆邊格 | 驗收欄位改全精度 |

另有兩項是**驗收腳本自己的判定缺陷**（非程式問題）：把已摧毀的塔仍當障礙（誤報穿塔
135 次）、把「對線站樁」當成卡死（誤報 23 次）。兩者都已收斂。

### 三、順帶修掉的手機版問題標記（`review/bug/`）

- **黃色圈圈孤立無怪**：`mapCampLayout` 把 Buff 營地的呈現座標位移 17.1 單位，
  但存活狀態環讀的是模擬座標 ⇒ 圈與怪差 17 個單位。改用呈現座標。
- **畫面偶發閃爍**：Runtime 英雄／結構的 mesh 每幀用 ref 改 transform，卻沒關
  frustum culling（`docs/09_技術債務清單.md` 早有此教訓，地圖量體已照做、H.1 新增的漏了）。
  全部補上 `frustumCulled={false}`，本輪 Chrome 驗收「閃爍」項全綠。

### 四、節奏重新對標

生成點修正讓開局座標位移 ⇒ 軌跡改變、長尾冒出來。用既有收尾機制調整
（`lateAccelDiv` 74 → 58，雙方對稱、不加塔血、不改擊殺與移速）
⇒ **regress 15/15（平均 24.0 分）、regress2 8/8**，時長回到 H.1 基準的 24.0 分。

### 五、驗證（全部實跑）

- `npm run build` ✅
- `npm run check:mobamap` **3553 通過 / 0 失敗**
- `node tools/check_moba_nav_h2.mjs` **14 PASS / 0 FAIL**
- `node tools/regress.mjs` **15/15**
- `node tools/regress2.mjs` **節奏門檻 8/8**
- `node tools/check_moba_nav_chrome_h2close.mjs` **15 PASS / 0 FAIL**
- ⚠ 依使用者指示**未執行** `check_moba_runtime29` 完整巢狀驗證（見 H.2 §六，仍是待辦）

### 六、H.2 狀態：**碰撞與尋路已在真實戰鬥畫面驗收通過**

唯一未補齊的是 `check_moba_runtime29` 完整重跑（預留 2–3 小時）。
本輪未開始小兵、技能特效、正式英雄模型（H.3+）。

---

## Milestone H.2-flicker — 手機 Runtime 閃爍的根因與修正（2026-07-29）

完整分析：`review/moba-runtime/h2-flicker/H2_FLICKER_ROOT_CAUSE.md`
狀態：**已找到根因並修正，但尚未取得真實 Android 裝置的肉眼確認**
⇒ 依指示不宣稱已修復、**未 push、未部署**。

### 零、先更正 H.2-close 的錯誤結論

H.2-close 回報「閃爍已修」**不成立**。當時的判準是每 600ms 取樣一次 `visible`，
而閃爍是單幀／數幀的消失重現——取樣頻率比事件本身慢一個數量級，抓不到。
本輪一律改成**逐幀**統計（頁面自己在每個 rAF 累計，工具只讀彙總）。

### 一、根因：深度緩衝精度不足 ⇒ 共面貼花 z-fighting

`Δz ≈ z²(far−near)/(far·near·2^bits)`。舊值 near=1 / far=4000：
- 桌機 **24-bit** ⇒ Δz 0.0018（分得開）
- Android 常見的 **16-bit** ⇒ Δz **0.467**，比場景裡**所有**高度差都大
  （地面鋪層間距 0.02–0.04、選取環 0.35、塔環 0.11、目標環 0.09）

⇒ 地面鋪層、岩塊投影、選取環全部塌進同一個深度桶，逐幀互相搶贏 ⇒ 一閃一閃。
這解釋了「桌機正常、真機在閃」，也解釋為何 visible / key / mount 全正常仍會閃：
**它是每像素的深度比較在跳，不是邏輯狀態在跳。**

**可控重現**：把 near 暫時降到 0.01（在 24-bit 桌機上模擬精度崩潰）⇒
scene graph 仍全 0，但畫面像素振盪從 0.036% 跳到 **4.59%**（128×）。

### 二、修正

1. 相機 `near 1→35`、`far 4000→1000` ⇒ 16-bit 下 Δz 0.467 → **0.0129**（< 最小層距 0.02）
2. **移除 `RuntimeCamera` 每幀硬寫 `camera.near=1/far=4000` 的覆蓋**
   （不修這行，改 CAM 完全不會生效——探針讀回來仍是 1/4000）
3. 地面貼花（選取環／陣亡標記／塔環／目標環）改用 **polygonOffset**（與位元深度無關），
   ⚠ 刻意不關 depthTest
4. 內插退路改為「維持上一幀已驗證位置」，不再跳到 snapshot ——
   **這是 H.2-close 自己引入的抖動**（跳到內插終點又退回，肉眼就是英雄在抖）

### 三、新增診斷：`tools/check_moba_runtime_flicker_h2.mjs`

逐幀統計（消失／重現、數量跳動、NaN、mount/unmount、context lost、
geometry/texture/program 軌跡）＋ 連續影格錄製 ＋ 深度精度門檻 ＋ 近遠裁切檢查
＋ 相機靜止驗證。手機與桌面各 60 秒：**23 PASS / 0 FAIL**。

⚠ 像素級指標**只當診斷、不當通過門檻**：它無法乾淨區分缺陷與「塔冠旋轉浮動、
英雄移動、HUD 更新、JPEG 量化」。理由與嘗試過的手段都寫在報告 §5。

### 四、驗證

- `npm run build` ✅｜`check:mobamap` **3553/0**｜`check_moba_nav_h2` **14/0**
- `regress` **15/15**（平均 24.0 分）｜`regress2` **節奏門檻 8/8**
- flicker verifier：手機 **23/0**、桌面 **23/0**
- 依指示未執行 `check_moba_runtime29`

### 五、尚未完成

**真實 Android 連續觀看 ≥60 秒**。本輪全部是桌機 Chrome 以 Android 尺寸模擬，
GPU 仍是桌機的 24-bit 深度，無法在本機重現 16-bit 行為。
若真機仍閃，下一步要量該裝置的 `gl.getParameter(gl.DEPTH_BITS)` 與
`getContextAttributes()`（報告 JSON 的 `depthProbe` 已有對應欄位可直接比對）。
在此之前不宣稱修復、不 push、不部署，也不開始小兵 / 技能特效 / 英雄模型。

---

## H.2-flicker 交接紀錄（2026-07-29）— **未驗收通過**

精簡交接：`review/moba-runtime/h2-flicker/H2_FLICKER_HANDOFF.md`
完整分析：`review/moba-runtime/h2-flicker/H2_FLICKER_ROOT_CAUSE.md`

### 一、現況

**桌面版閃爍幾乎排除，但 Android 真機仍可見閃爍 ⇒ H.2-flicker 尚未驗收通過。**
不得宣稱修復、不得 push、不得部署。

| 環境 | 結果 |
|---|---|
| 桌面 Chrome 1600×1000 | 逐幀診斷 23/0；肉眼幾乎無閃爍 |
| 桌面 Chrome 模擬 Android 412×915 @2.625x | 逐幀診斷 23/0 |
| **真實 Android 裝置** | **仍可見閃爍** ⇒ 本輪根因假設不足以解釋全部現象 |

### 二、根因假設與已完成修正

假設：深度緩衝精度不足 ⇒ 共面貼花 z-fighting。
`Δz ≈ z²(far−near)/(far·near·2^bits)`；舊值 near=1/far=4000 在 24-bit 是 0.0018（分得開），
在 Android 常見的 16-bit 是 **0.467**，比場景所有高度差都大（層距 0.02–0.04、環 0.09–0.35）。
可控重現：near 暫降 0.01 ⇒ scene graph 仍全 0，像素振盪 0.036%→4.59%（128×）。
⚠ **但真機修正後仍在閃**，所以這只是其中一個成因，或真機另有主因。

已完成 4 項修正：
1. 相機 `near 1→35`、`far 4000→1000`（16-bit Δz 0.467→0.0129）
2. 移除 `RuntimeCamera` 每幀硬寫 `camera.near=1/far=4000` 的覆蓋（不修這行改 CAM 不生效）
3. 地面貼花（選取環/陣亡標記/塔環/目標環）改用 polygonOffset，**未關 depthTest**
4. 內插退路改為維持上一幀已驗證位置（修掉 H.2-close 自己引入的英雄抖動）

修改檔案：`MobaRuntimeView3D.jsx`、`MobaRuntimeHeroes.jsx`、`MobaRuntimeStructures.jsx`、
`runtimeDiagnostics.js`、新增 `tools/check_moba_runtime_flicker_h2.mjs`。
**commit：`dfa900f`（WIP，本機，未 push）**

### 三、已執行的驗證與限制

已跑：flicker verifier 手機 23/0、桌面 23/0（各 60 秒、3,600+ 幀逐幀）；
`build` ✅｜`check:mobamap` 3553/0｜`check_moba_nav_h2` 14/0｜`regress` 15/15｜`regress2` 8/8。
依指示未執行 `check_moba_runtime29`。

⚠ **限制（最重要）**：桌面 Chrome 的「手機尺寸模擬」**不等於真實手機**。
`setDeviceMetricsOverride` 只改尺寸與 DPR，GPU／驅動／depth buffer 位元數完全沒變
（本機實測 `DEPTH_BITS = 24`，假設中的問題發生在 16-bit）。
⇒ 逐幀 23/0 只證明「邏輯層與桌機渲染沒問題」，**不能證明真機不閃**。
像素級指標只當診斷、未列入通過條件（無法區分缺陷與塔冠動畫/英雄移動/HUD/JPEG 量化）。

### 四、交給 Codex

優先序：① 先在真機讀 `DEPTH_BITS` / `getContextAttributes()` / renderer 字串，不要再從桌機推論；
② 試 `antialias: false` 對照；③ 查 DPR 2.625 的填色與記憶體壓力；
④ **地圖 `MobaMapBlockout` 的合併地面層**（層距 0.02–0.04，本輪未動）；
⑤ drei `Html` 名牌（DOM 疊層，不在 scene graph 統計內）。

**禁止**：只加 `frustumCulled={false}` 當解法（已加過、真機照樣閃）；用固定間隔取樣 visible 當驗收
（H.2-close 的假結論來源）；關 `depthTest` 或把物件改常駐來遮蓋；回復 `camera.near=1/far=4000` 硬寫；
改 `LAYER_Y` 絕對值（`GROUND_Y`/`RING_Y`/塔基由它推導）；重寫 flicker verifier 的逐幀統計。
⚠ 第 4 項（內插退路）是真缺陷修正，與深度無關，請保留。

### 五、真機證據

**`10976.mp4`**（使用者提供的 Android 螢幕錄影）。撰寫時尚未放入 repo，
建議路徑 `review/bug/10976.mp4`。另見 `review/bug/` 既有的手機版問題標記與 triage。

### 六、git 狀態與回退點

- 分支 `main`｜HEAD `dfa900f`｜**尚未 push 的 commit：`dfa900f` 一個**（`origin/main` 停在 `9faa319`）
- `src/`、`tools/`、`docs/` 乾淨；工作區只剩本次工作前就存在的舊未追蹤產物
- 回退點：`9faa319`（H.2-close，**線上正式站就是這版**，不含本輪修正）／
  `1950b00`（碰撞收斂 v3）／`15b5abb`（H.1）

### 七、本次交接未做的動作

未 `git add`、未 commit、未 push、未部署；未開始小兵 / 技能特效 / 英雄模型。

---

## H.2-flicker Codex 續修 — Android 坑壁批次單幀消失（2026-07-29）

狀態：**根因修正與桌面自動驗證完成；待正式站 Android 真機驗收**。
本輪以單一 commit 推送 `main` 並觸發 GitHub Pages；未開始小兵、技能特效或英雄模型。
完整證據與真機驗收入口見
`review/moba-runtime/h2-flicker/H2_FLICKER_HANDOFF.md` §8。

### 一、影片逐幀定位

分析 `review/bug/20260729_022915地圖閃爍bug.mp4`
（27.460 秒、720×1600、約 59.60 fps），以瀏覽器原生 decoder +
`requestVideoFrameCallback` 取得 1,611 次 presented-frame callback 並做相鄰幀比對。

反覆消失的是**左上主要物件坑的整圈立體坑壁**，不是英雄、塔、selection ring 或
shadow decal。代表事件出現在 14.383、14.886、15.641、16.129、16.883、
19.384、19.636、19.887、20.139、21.397、21.884、22.136、26.868 秒；
每次單幀消失、約 16.7ms 後整批恢復，影響縮小分析影格約 1.57–1.64%。
6.162 秒的全 viewport／Android UI 重排則另判為 browser compositor／錄影事件。

影片播放的是 GitHub Pages 正式站（當時為 `origin/main@9faa319`），不含本機 `dfa900f`，
所以可用來定位舊版病灶，但不能當作 `dfa900f` 已在真機失敗的證據。

### 二、根因與修正

`MobaMapBlockout.jsx` 的 `BpWrap` 原本定義在 component render 內。英雄等級／生死等
動態簽章使上層 `setFrame` 時，React 每次都看到新的 component type，因而卸載／重掛
整個靜態地圖 subtree。坑壁 face/cap 是 `InstancedMesh`，matrix 又在 paint 後的
`useEffect` 才填入；Android 因此顯示一幀空批次，下一幀才恢復。

修正：

1. wrapper 移至 module scope，固定 React type identity。
2. `MobaRuntimeMap` 加 `React.memo`，隔開靜態地圖與動態 snapshot 的 render 邊界。
3. 坑壁 instance matrices 改由 `useLayoutEffect` 在 paint 前完成。
4. 診斷／verifier 新增 `mapWall` render-ready 與 UUID 逐幀檢查。
5. 新增只在 `?diag=1`／`?shot` 出現的真機面板，可記錄／下載 `DEPTH_BITS`、
   WebGL renderer/vendor、context attributes、camera near/far、DPR、buffer 尺寸與
   context lost。

修正前 35 秒直接探針：坑壁消失／恢復各 **148** 次、四批坑壁 UUID 共更換
**596** 次；其他物件消失 0、NaN 0、context lost 0。修正後 60 秒：
坑壁消失／恢復 **0/0**、UUID 更換 **0**。

沒有關閉 `depthTest`、隱藏物件、拉高幾何，也沒有改碰撞、尋路、正式地圖資料、
snapshot、Replay、Store 或發獎契約。前輪 near/far、polygonOffset 與內插退路修正
保留，但深度精度不是影片中「整批不透明坑壁 on/off」的主因。

### 三、修改檔案

- `src/battle/moba/map/MobaMapBlockout.jsx`
- `src/battle/moba/map/MobaRuntimeMap.jsx`
- `src/battle/moba/render/MobaRuntimeView3D.jsx`
- `src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx`（新增）
- `src/battle/moba/render/runtimeDiagnostics.js`
- `tools/check_moba_runtime_flicker_h2.mjs`
- `review/moba-runtime/h2-flicker/H2_FLICKER_HANDOFF.md`
- `docs/handoff/05_Sprint紀錄.md`

### 四、驗證

- flicker verifier：手機尺寸 60 秒 **31/31**（3,624 幀）；桌面 60 秒 **31/31**
  （2,881 幀）。兩者坑壁 4→4、所有 disappear/reappear 0、UUID 更換 0、
  NaN/context lost 0。
- `npm run build` exit 0；`check:mobamap` **3553/3553**；
  `check_moba_nav_h2` **14/14**。
- `regress` **15/15**；`regress2` 節奏門檻 **8/8**。
- `presentation29b2`（`SKIP_NESTED=1`）**12/12**；
  `controls29b3`（`SKIP_NESTED=1`）**18/18**；
  `camera/replay29b6`（`SKIP_NESTED=1`）**16/16**。
- `git diff --check` exit 0。
- 完整 `check_moba_runtime29` 有實際啟動，但外層 20 分鐘 timeout（exit 124）、
  無最終輸出形狀，**未列為通過**。現行腳本 child timeout 為 5,400 秒，並註明
  單一 `stats28` 可達約 87 分鐘；timeout 後沒有殘留 verifier 子行程。

### 五、正式站 Android 真機待驗收與回退

正式站驗收入口：

`https://rayhuang0323.github.io/ESMO-/?debug=moba-runtime-battle&diag=1&waitTs=1&mapPresentation=runtime-v2`

須在 Android 連續觀看／錄影至少 60 秒，覆蓋英雄升級、死亡與結構摧毀前後，
並下載診斷 JSON；另確認 hero、tower、structure、ground overlay、selection ring、
shadow decal、FPS、觸控與桌面外觀。未完成前不得宣稱真機通過。

前一個未推送的 H.2 基準是 `dfa900f`，本次修正與既有 H.2 變更合併成單一 commit
推送 `main`；只回退本次工作時的安全基準是 `dfa900f`，回退整個 H.2-flicker 則是
`9faa319`。正式站部署完成後，
仍須完成 Android 真機確認。

---

## H.3 Runtime 對戰呈現（2026-07-29）

狀態：**本機實作與分段驗證完成；待 Android 真機／完整 Replay 人工驗收，未 push、未部署**。
完整架構、參數、檔案、證據與限制見
`review/moba-runtime/h3-runtime-presentation/H3_RUNTIME_PRESENTATION_REPORT.md`。

### 一、起點與範圍

- 起點 `09ce36c`（H.2-flicker 已在 main）；開始前工作區已有大量地圖／terrain／影片
  舊產物，本輪全部排除 staging。
- 正式路徑確認為
  `GameView → MobaRuntimeView3D → adaptRuntimeMapFrame`；
  live 只讀 `useGameStore`，Replay 用唯讀 presentation source 走同一 renderer。
- 沿用 `LogicEngine.lanes`、snapshot、H.2 navigation/map geometry、Replay buffer；
  沒有 legacy fallback、第二套兵線或第二套戰鬥判定。

### 二、兵線與開局節奏

- v3 首波 `60s → 25s`，週期維持 30s；每路每方四隻為三近戰＋一遠程，
  snapshot 附加 `wave/slot/kind`。
- 小兵以同 tick 位置同時計算雙方 next：接敵停止、存活塔／主堡前停止，
  塔前距離 `0.046` 保證仍在既有 `<0.05` 反擊帶內；v1/v2 歷史行為不變。
- runtime 隊形位置先用 lane tangent/lateral 展開，再通過 H.2
  `isWalkable/projectToWalkable` 與存活結構集合。
- 英雄 v3 一般／交戰移速 `5.90/7.07 → 5.60/6.71`（約慢 5%）。
- 240-seed：226/240 結束、藍 47.9%／紅 46.3%、順序偏差 1.7pp、
  平均／中位 24.67／24.60 分。H.2 為 231/240、48.8%／47.5%、2.1pp、
  25.05／24.85 分；本輪不對勝率追加調參。

### 三、技能事件、英雄原型與效能

- 既有英雄交戰傷害 tick 只附加 `sourceId/targetId/role:basic|power` FX metadata；
  傷害、CD 與 RNG 次數不變。`DT_SIM=0.5` 下 FX 最短生命期改 0.65s，
  避免 snapshot 前被清掉。
- runtime-v2 固定三池：32 line、16 ring、16 orb instances；小兵固定四個
  48-cap unit batches 與兩個 96-cap 血條 batches，useFrame 不建立 geometry/material。
- 五個 role 映射四種可重用低面數原型：
  guardian/skirmisher/arcanist/marksman；沒有受保護名稱或外部角色資產。
- Android 診斷面板新增 FPS/frame time/draw calls/triangles 與
  heroes/minions/active FX/累積 FX 計數；診斷 install/remove 改在 Canvas 內成對管理。

### 四、Replay

- `MobaReplay.v1` 版本不變，新增 optional `mn`（小兵）與 `fx`（技能事件）。
- Replay buffer 在 2 秒主 frame 間累積短命 FX，播放端依事件 `at` 顯示；
  舊 Replay 無欄位時顯示空兵線／空特效，不重跑引擎。
- seed 42 完整 26.3 分鐘：791 frames、1,687,797 bytes、平均 2,127 bytes/frame、
  3,317 FX events，`validateMobaReplay` 通過。

### 五、驗證與正式 GameView

- 新功能 verifier `check_moba_minions_h3` **22/22**。
- `check_moba_nav_h2` **14/0**；presentation **12/12**；controls **18/18**；
  camera/replay **16/16**（後三支 `SKIP_NESTED=1`）。
- `regress` **15/15**；`regress2` **8/8**；240-seed bench exit 0；
  production build 與 `git diff --check` exit 0。
- 正式 GameView 截圖：桌機 1440×900、手機 390×844、診斷 430×844。
  320/360/390/430px 均無水平溢出。
- WebGL2、DEPTH_BITS 24、camera 35/1000；約 210–228 calls、59k–77k tris；
  診斷曾同時看到 10 heroes、64 minions、4 active FX／累積 21 FX。
- 自動化分頁 rAF 被背景節流到 1–4 FPS，**不列產品 FPS 通過**；Android 真機 FPS、
  觸控、safe area、技能辨識與完整 Replay 視覺仍待人工驗收。

### 六、`runtime29` 完整執行的既有紅燈

完整執行 51 分 8 秒後為 **42/44**。S23–S27、regress、regress2、build 全部 exit 0；
唯一根因是 Sprint28 §29 的 v2 40-seed 全場順序抽樣：正序藍勝 55%、反序 35%，
位移 20pp > 15pp，§30 因巢狀同一失敗連帶紅燈。

這不是 H.3 v3 回歸：把 `pushFx` 動態還原成 `09ce36c` 舊實作後，同組正反序
160 場逐 seed winner **0 場改變**，仍是 55%／35%。H.2 已把 v2 per-player RNG
取樣跟 players 迭代順序走列為 P1，且當時完整 runtime29 未完成。本輪不改歷史 v2、
不放寬 verifier；另開專項處理。

### 七、本機 commits／回退

- `759bae7` — 小兵、節奏、runtime-v2 與 Replay `mn`
- `a87e379` — 職業原型、池化技能與 Replay `fx`
- 文件／診斷 commit：見本輪最終回報

整階段回退由新到舊逐一 `git revert`，禁止 `reset --hard`。本輪依使用者指示停在
本機 commit，未 push、未部署，也未自動開始下一階段。

### H.3 人工視覺驗收（2026-07-29）

狀態：**桌機與手機 viewport 驗收通過；待正式站 Android 真機 FPS／觸控／熱降頻與完整 Replay 視覺確認；未 push、未部署**。

- 驗收基準為 `HEAD f1f811b`，正式 GameView 路徑與測試網址記錄於
  `review/moba-runtime/h3-runtime-presentation/H3_RUNTIME_PRESENTATION_REPORT.md` §11。
- 桌機 1440×900 觀察到小兵由 48 降至 40（交戰／死亡），診斷同時有 2 active FX、累積 115 FX；手機 390×844 由 64 降至 46，2 active FX、累積 76 FX。三路兵線的接線與塔前停止可見，未發現穿牆或長時間卡住。
- guardian／skirmisher／arcanist／marksman 四種輪廓可辨；技能事件有進入 FX 池且未見 HUD 遮蔽。`DEPTH_BITS=24`、WebGL2、depth=true、near/far=35/1000，瀏覽器觀察未見 H.2 閃爍。
- Replay 的 `mn`／`fx` frame 資料由 verifier 確認；完整終局 Replay 尚未人工播放，Android 真機 FPS、熱降頻、觸控與特效辨識仍不可由 Node／桌面瀏覽器宣稱完成。
- 本次沒有發現需修正的 H.3 呈現問題，未修改公平性、經濟、天賦或地圖結構；未開始下一階段。

### H.3 正式部署紀錄（2026-07-29）

- H.3 驗收 commit `9e754fe` 已推送 `main`；未加入既有未追蹤舊產物。
- GitHub Actions run `30414201468` 的 build／deploy 均成功，Pages deployment `5650235527` 回報 `success`。
- 正式網址：<https://rayhuang0323.github.io/ESMO-/>。
- Android 真機 FPS、熱降頻、觸控、閃爍與完整 Replay 視覺仍需人工確認；不開始下一階段。

---

## H.4 英雄視覺與技能表現整合（2026-07-29）

狀態：**待人工驗收；已建立本機 commit，未 push、未部署。**

### 本階段完成

- `hero-visual.v1` 純呈現資料契約：10 名現役英雄（`ironclad`、`cinderfist`、`duskblade`、`chichuan`、`bingshuang`、`lieyan`、`leiting`、`yanfeng`、`dadi`、`stoneguard`）各有獨立 silhouette、accent、trim、badge recipe。
- `heroVisualFor()` 以 stable hero id + deterministic hash 提供可擴充至 100 名以上的 fallback；沒有新增完整模型或外部資產。
- Runtime adapter 從既有 roster 取 `heroId`，輸出 `visual`；未改 LogicEngine、snapshot/replay contract、碰撞、尋路、經濟、天賦或地圖結構。
- 技能 FX 仍走固定 InstancedMesh 三池，依既有 ability/target/time 推導 cast、travel、impact，補足施法、飛行、命中回饋。

### 驗證與畫面

- build、H.4 verifier、H.3 minion/replay、H.2 navigation、presentation、controls、camera/replay、regress、regress2 全部通過；細節見 `review/moba-runtime/h4-hero-visual/H4_HERO_VISUAL_PRESENTATION_REPORT.md`。
- 已做桌機 `1440×900` 與手機 `390×844` viewport 截圖：`review/moba-runtime/h4-hero-visual/H4_DESKTOP_1440x900.png`、`H4_MOBILE_390x844.png`、`H4_MOBILE_390x844_SCENE.png`。
- 診斷觀測 WebGL2、`DEPTH_BITS=24`、`depth=true`、camera `near=35/far=1000`；桌面／手機 viewport 無水平溢出。Chrome extension 的 1–2 FPS 觀測不代表 Android 真機效能，仍須真機確認。

### 待人工確認與回退

- 正式 GameView 需人工確認 10 名英雄近景辨識、技能 cast→travel→命中回饋、手機 320/360/390/430px 跑版、真機閃爍／掉幀／過熱，以及 Replay 長時間播放。
- H.4 回退基線：`082371b`。不得把既有未追蹤舊產物納入 commit。

---

## Milestone B：MOBA 戰鬥呈現與基礎戰鬥單位整合（2026-07-29）

起點：`dfdc826`。狀態：**進行中；各段只建立本機 commit，未 push、未部署。**

### B.1 英雄辨識

- 人工回報 H.4 在正式戰鬥看不出十名英雄差異。根因不是 recipe 缺少，而是
  `GameView` 的 runtime-v2 分支沒有把 `liveRoster` 傳給 `MobaRuntimeView3D`；
  adapter 因此只收到空的 store roster，十名英雄全部退回 role fallback。
- 正式資料流已改為
  `GameView.liveRoster → MobaRuntimeView3D → RuntimeFrameFeeder → adaptHeroes`，
  draft／預設 roster 的 stable hero id 會真正進入 runtime renderer。
- 十名現役英雄各加入不同的結構剪影，包含方／圓頭盔、巨盾、雙拳、雙刃、法杖、
  晶核、火焰冠、長型發射器、雙翼、重甲與戰鎚；差異不只換色。
- 保留 `hero-visual.v1` 與 deterministic fallback；幾何／材質仍為固定共用資源，
  不在 `useFrame` 建立物件，並保留 H.2 `frustumCulled=false` 與地面層修正。
- `check_moba_milestone_b1` 通過：10 roster、10 stable hero id、10 structural silhouettes。
  H.4 verifier 通過，production build 通過。首次 build 因主機僅約 1.3 GB 可用記憶體失敗；
  停止本輪既有 dev server 並以 3 GB Node heap 重跑後成功，並非程式編譯錯誤。

### B.2 技能與攻擊回饋

- 根因是 H.3 的事件雖已存在，但呈現生命期只有 `0.65 sim-s`；正式 GameView 加速播放後
  cast／impact 各只剩極短瞬間，且 renderer 每個 phase 只畫單一圖形，因此人工幾乎看不到。
- 沿用 `LogicEngine` 既有攻擊 tick 與同一次 RNG，只附加 `attack`／`skill` 呈現語意；
  普攻事件保留 2.2 sim-s、技能保留 3.2 sim-s。沒有修改傷害、攻速、目標選擇或 CD。
- 固定 InstancedMesh 池強化為 cast 預備圈＋核心、travel 軌跡＋移動彈體、
  impact 受擊核心＋擴散圈；技能與普攻尺寸分級，遠距與手機仍有明確輪廓。
- `MobaReplay.v1` 版本不變，`fx` 列尾端向後相容地附加
  `feedback/sourceId/targetId`；舊 Replay 仍可讀，Replay 不重算命中或傷害。
- `check_moba_milestone_b2` 驗證事件生命期、三段 phase、固定池容量，以及
  live snapshot → compact frame → Replay presentation 的語意一致性。
- H.3 verifier 第 19 條原本把 32/16 容量硬編碼；B.2 仍維持相同三個固定池，
  但容量有意調為 48/32，故同步更新該形狀斷言，沒有刪除或放寬固定池要求。

### B.3 英雄速度一致性

- 稽核確認 v3 的十名英雄都只讀同一組 `moveSpeed=5.60`、`fightSpeed=6.71`；
  role、英雄 visual、snapshot 與 adapter 都沒有個別移速倍率。撤退 1.15× 與 Flash
  是全體共享且有明確狀態／事件的正式機制，不是英雄暗藏差異。
- 人工所見「部分英雄異常偏快」的呈現根因是 renderer 對任何 prev→snapshot 都線性插值：
  復活、回城與 Flash 的離散座標也會在數幀內掃過地圖，看起來像高速跑動。
- 新增純呈現 `runtimeMovementPolicy`：例行步行依相同速度上限繼續平滑內插；
  生死轉場、Flash uses 增加或超過合理 tick 位移的離散事件直接切到權威 snapshot，
  不讓畫面虛構跨圖暴衝。沒有回寫引擎、改 A*、碰撞或速度參數。
- `check_moba_milestone_b3` 以同一起點與同一目標比較五個 role 的上／中／下路及野區
  A* 到達時間，並掃描正式 v3 逐 tick 位移、Flash／回城例外與 renderer interpolation。

### B.4 小兵戰鬥

- 稽核確認正式 Runtime 原本已有三路雙方各四隻首波與 Replay `mn`，但 v3 小兵戰鬥仍把
  `130 HP`、`70 DPS` 寫死在 engine，且四隻兵會共同挑陣列第一目標；這會造成血量瞬降、
  普遍集火快死。血條則固定在 world XY 平面且 fill 未進 transparent queue，是遠景看似
  全空／斜躺的直接原因。
- 僅 v3 將小兵參數明文化為 `240 HP`、`30 damage`、`1.0s attack interval`、
  lane progress 射程 `0.035`；單兵需 8 次命中才死亡。首輪以距離＋slot 對位，
  傷害仍在同一張表同時結算，藍紅完全對稱且不普遍一擊死亡。
- 影響說明：小兵對打存活時間有意拉長，但波次、數量、世界移速、塔傷、擊殺金錢、
  XP、英雄數值與地圖不變；v1/v2 歷史 baseline 維持 130 HP／70 DPS 舊路徑。
- 血條背景／填充值都明確使用 transparent、`depthTest=false/depthWrite=false` 與固定
  renderOrder；每幀複製 camera quaternion，填值左對齊沿 camera-local right 計算。
- `check_moba_milestone_b4` 驗證 24 隻首波、首輪全員存活、8 hits-to-kill、1 APS、
  partial HP、死亡移除、Replay 還原與 camera-facing 血條。
- 最終 pacing verifier 第 5 條原本只接受低血英雄立即步行回泉水；目前正式 S29B3
  會優先進入可被打斷的 `recallT>0` 回城 channel，因此舊斷言誤報原地卡住。
  已改為只接受「確實向泉水移動」或「`state=回城中` 且 `recallT>0`」兩種可靠狀態，
  沒有把任意靜止放寬成通過。

### Milestone B 最終驗證與交付

狀態：**四段本機 commit 完成，待人工與 Android 真機驗收；未 push、未部署。**

- commits：B.1 `592a355`、B.2 `fe747f2`、B.3 `adde1aa`、B.4 `7b5c2f8`；
  整段回退基線 `dfdc826`。
- B.1–B.4、H.4、H.3 22/22、pacing 25/25、presentation 12/12、
  controls 18/18、camera/replay 16/16、mobamap 3553/0、navigation/collision 14/0、
  regress、regress2 8/8、production build 與 `git diff --check` 通過。
- 正式 `GameView → runtime-v2` 已做 1440×900 與 390×844 viewport；兩者均無水平溢出。
  手機診斷曾觀測 10 heroes、64 minions、2 active FX／61 FX seen、WebGL2、
  `DEPTH_BITS=24`、camera 35/1000、`depth=true`。
- 圖片與完整修改／參數／限制記錄在
  `review/moba-runtime/milestone-b/MILESTONE_B_REPORT.md`。
- H.2 flicker CDP probe 連續停在專用 Chrome `Page.enable` 逾時，未改 verifier 掩蓋；
  Android 真機 FPS、觸控、過熱、閃爍、十名英雄逐一近景、動態技能與完整 Replay
  仍列人工驗收，不以桌面 Chrome 手機 viewport 宣稱通過。

---

## Milestone B-fix：MOBA 戰鬥視覺可讀性修正（2026-07-29）

狀態：**實作完成，待人工／Android 真機驗收；未 push、未部署。**

### 修正摘要

- `hero-visual.v2` 讓十名出戰英雄各有獨立主色、次色、比例、輪廓、`combatStyle`
  與 `headFeature`。十種頭部 motif 與主色依專案既有選角頭像重新對齊，轉成 ESMO
  自有低模角盔／火冠／兜帽／冰晶／雷環／鳳翼／樹甲／石角 recipe，不直接貼圖或複製
  外部模型；stable hero id deterministic fallback 保留，可擴充至 100+ 英雄。
- 藍／紅陣營識別由腰帶、腳下環、血條旁菱形隊標與「藍方／紅方」名牌共同保留，
  英雄本體不再整批只用隊伍色；關閉 DOM 名牌時仍有幾何隊標。
- cast／travel／impact、普攻、小兵攻擊與命中改用 line／ring／orb／slash／lock
  五個固定 instance pool；實際 HP drop 只在 adapter 衍生呈現事件，不回寫傷害，
  live 與 Replay 使用同一來源。
- 小兵與所有可攻擊建築改用 camera-facing 黑底槽＋連續 HP fill，明確處理透明排序、
  camera-local 左對齊與前後分離；小兵 renderOrder 46／47、建築 48／49。
- 塔具有鎖定、攻擊、命中、扣血與 1.4 秒拆除回饋。人工指出原塔攻擊像音波後，
  最終改為「塔冠蓄能 → 單一弧線追蹤彈體＋短尾跡 → 小型命中爆點」；塔分支不再產生
  全長光束或大面積同心圓。
- 未修改 `LogicEngine`、地圖、導航／碰撞、公平性、經濟、天賦、snapshot 或
  Replay contract。

### 驗證與證據

- `check_moba_milestone_b_fix`、H.4、B.1／B.2／B.3／B.4 全部通過。
- H.3 minion／Replay **22/22**；presentation **12/12**、controls **18/18**、
  camera/replay **16/16**（後三支 `SKIP_NESTED=1`，本體完整）。
- `check:mobamap` **3553/0**；H.2 navigation／collision **14/0**。
- `regress` exit 0（14/15 於 30 分鐘內結束，符合現役 script 門檻）；
  `regress2` 20/20 結束、節奏門檻 **8/8**；production build 通過。
- 完整 `runtime29` 曾啟動，但在 `stats28` 長模擬期間收到選角／陣營追加要求；為避免用
  舊 source state 結果混充而停止。該 verifier 原始碼明記 `stats28` 單跑可能需 87 分鐘，
  H.3 亦有 51 分鐘及既存 v2 順序抽樣紅燈紀錄；本輪未放寬門檻，改逐支跑完直接受影響
  verifier、regress、regress2 與 build。
- 正式 GameView 已截取桌機 1280×720 與手機 Chrome 390×844 八張證據，位於
  `review/moba-runtime/milestone-b-fix/evidence/`；可見跨鏡頭英雄差異、技能、小兵
  局部 HP、塔血條、拆除狀態與藍／紅隊標，390×844 未見水平溢出。
- 當次診斷：WebGL2、`DEPTH_BITS=24`、camera `near=35/far=1000`、desktop DPR 1.5。

### 人工驗收與回退

- 最後的塔追蹤彈體修正晚於六張截圖，程式／verifier 已防止回到音波分支，但仍需人工
  觀看 1× 動態正式 GameView 與 Replay 確認手感。
- 390×844 是桌面 Chrome viewport，不是 Android 真機；Android FPS、熱降頻、觸控、
  safe area、WebGL driver、H.2 閃爍仍未實測，不宣稱真機通過。
- 獨立報告：`review/moba-runtime/milestone-b-fix/MILESTONE_B_FIX_REPORT.md`。
- rollback baseline：`51d97e2`。本輪 commit 見最終回報；若需回退使用
  `git revert <commit>`，不可使用 `git reset --hard`。
- 未開始下一階段，未納入工作區既有 terrain／bug／backup 舊產物。

---

## Milestone C：MOBA Runtime 戰鬥可讀性與單位行為（2026-07-29）

狀態：**本機實作與桌機／手機 viewport 驗收完成；待人工／Android 真機確認；未 push、未部署。**

### 英雄、技能與敵我辨識

- 移除英雄頭頂大型「藍方／紅方」文字，改用隊伍色腳下環、腰帶、血條旁菱形與
  小型名牌色邊；手機不再被大標籤遮住。
- 保留 `hero-visual.v2` 十名英雄的主色、比例、頭部／背部／武器差異與 100+
  deterministic fallback；cast/release 驅動武器／肩部動作，hit 驅動短暫抖動與亮光。
- 技能、普攻、小兵、塔與野怪仍共用 live／Replay FX event；未另造命中結果。

### 塔、小兵與野怪

- v3 塔由連續扣血改成同 DPS 的離散單體射擊：每 0.5 秒對小兵 60 damage，
  240 HP 依 `180→120→60→0` 四次下降；傷害與 `tower:basic` 弧線追蹤彈同源。
- 塔固定鎖定有效目標，預設優先小兵；敵方英雄在塔區攻擊守方英雄時加入 3 秒 threat。
  對英雄 1 HP clamp、KDA、勝負與 v1／v2 舊規則不變。
- 小兵塔邊隊形以 `1/.65/.35/0` 逐級縮回並投影至可走區，不再失敗後直接跳回 lane
  center；沿用 camera-facing 黑底連續 HP bar。
- 六個正式 camp 統一權威座標；新增營區巡遊、索敵、追擊、離散攻擊、受擊回饋、
  7.5 leash、回營補滿與低模動態 renderer。藍／紅 Buff 座標修正為鏡射的
  `(76,171)`／`(144,49)`，移除約 17.1 單位 renderer-only offset。

### 正式 GameView 與驗證

- 正式 `GameView` 固定使用 `MobaRuntimeView3D`，移除「地圖 新版／舊版」按鈕、
  legacy renderer 分支與會和 Timeline 重疊的常駐回中心鈕；底層 legacy 檔未刪。
- 新增 `check_moba_milestone_c`：塔四段血量／同源彈體、camp
  idle→aggro→attack→leash reset、小兵塔邊相鄰幀、隊標與 runtime-v2-only 全部 PASS。
- build、mobamap 3553/0、navigation/collision 14/0、B.1–B.4、B-fix、
  regress 15/15、regress2 8/8、pacing 25/25、presentation 12/12、
  controls 18/18、camera/replay 16/16 均通過。
- 完整 runtime29 自然結束為 **43/44、exit 1**；唯一紅燈是 H.3 已記錄的既有 v2
  正／反序抽樣仍為 55%／35%（位移 20pp > 15pp）。Sprint23–28、regress、
  regress2、build 全部 exit 0；本輪只改 v3 行為，未改 v2 或放寬門檻。
- 正式 Draft → Tactic → GameView 已截取桌機 1440×900 與手機 390×844；
  手機無水平溢出、Timeline／隊伍面板維持收合，畫面沒有舊地圖入口。
- 報告與畫面：
  `review/moba-runtime/milestone-c/MILESTONE_C_REPORT.md`、
  `gameview-desktop-1440x900.png`、`gameview-mobile-390x844.png`。

### Commit／回退／人工項目

- rollback baseline：`f66cfb0db5a3feed118c18df51ec4f51b28c1491`。
- 主要實作 commit：`df3e053`；正式 GameView 清理與文件 commit 見最終回報。
- 仍需人工觀看 1× 的塔彈體完整弧線、野怪巡遊／攻擊／回營、十名英雄逐一近景、
  Replay 動態，以及 Android 真機閃爍、FPS、熱降頻、觸控與 safe area。
- 未納入既有 bug 影片、terrain／map preview、backup、blend／glb 或 logs。

---

## Milestone C-fix：MOBA Runtime 人工驗收修正（2026-07-29）

狀態：**本機實作、直接驗證、回歸、build 與 viewport 檢查完成；待人工／Android
真機驗收；未 push、未部署，未開始下一個 Milestone。**

### 本輪修正

- 塔 FX 改為每幀依 `sourceId/targetId` 解析目前座標的單一追蹤彈：
  塔冠蓄能 → 球形彈體＋短尾跡 → 緊湊命中爆點；保留小兵優先、固定鎖定、
  3 秒塔下反打 threat 與離散射擊／傷害同源。
- runtime 野怪直接重用 G.3 `mapMonsterShapes` 的正式 sentinel／brambleback／
  wolves／krug recipe，不再用過度簡化替代物；六 camp 各三名成員有獨立 HP、
  alive、targetId、攻擊 CD、受擊、死亡、仇恨與回營。英雄攻擊與 Smite 都只打單體，
  全員死亡才清營並發收益。
- 十名英雄明確對應 tank／fighter／assassin／mage／marksman／support，
  加入六套武器、施法輪廓與 cast/release 動作；cast/travel/impact/hit reaction
  強化，近戰、遠程、rail、法術與輔助語彙可直接區分。
- 英雄名牌縮為 9px、`L{level}` 與小型 padding／隊標，仍保留腳環、腰帶、
  血條菱形與名牌色邊的藍紅辨識。
- v3 小兵 XP 128→96、普通 camp 130→96、buff camp 195→144；
  單吃首波由 512 降為 384 XP，只升到 Lv2。同一 engine tick 最多升一級，
  超額 XP 留在 `mxpBank` 後續兌現，不吞收益；v1／v2 歷史基準不變。
- 小兵塔前停位由 lane progress band 改為實際 tower／nexus 世界距離二分搜尋，
  v3 停位半徑 4.6；保留 H.2 可走區投影與碰撞真實來源。
- `BattleResult.v2`、progress/reward、profile persistence、公平性基線、
  Replay contract 與 legacy 資產均未修改。

### Verifier 與驗證

- 新增 `check_moba_milestone_c_fix`：XP、camp 三成員個體化、小兵／英雄逐單位戰鬥、
  塔前五次穩定停位、正式野怪 recipe、六職業、9px 名牌與追蹤塔彈全部 PASS。
  取樣為首波 Lv2、最大單 tick 升級 1、5 分鐘平均 Lv3.20、10 分鐘 Lv5.63、
  塔前停位 4.719 模擬單位。
- `check_moba_milestone_c`、B-fix、B.1–B.4、H.4 均 exit 0；
  H.3 22/22、H.2 navigation/collision 14/0。
- pacing 25/25、presentation 12/12、controls 18/18、camera/replay 16/16；
  四支以 `SKIP_NESTED=1` 執行直接本體，均檢查 exit code 與輸出形狀。
- `regress` 15/15、平均 24.2 分；`regress2` 20/20、8/8，
  5 分鐘英雄均等級 3.18、最低 2.6；mobamap 3553/0；production build 通過。
- B.2 舊字串斷言硬編碼靜態 `fx.targetWorld`，已改驗每幀 `trackedTarget`
  與短尾跡來源；安全網沒有刪除。
- `regress2` 舊 XP 下限會強迫回到人工確認過快的 v2 曲線，故確實改為逐場均等級
  ≥2.5、20-seed 平均 `[3,7]`；仍能攔下全場 Lv1 與異常封頂，其餘門檻未改。
- 未重跑完整 `runtime29` 長鏈；依本輪「只跑直接相關」要求，改跑直接 verifier、
  現役 runtime 安全網本體、兩支 regress、mobamap 與 build。Milestone C 已記錄
  完整 runtime29 唯一既有紅燈為未碰觸的 v2 正／反序抽樣。

### Viewport、回退與待驗收

- 正式 `GameView → runtime-v2` 本機檢查 1440×900 與
  320／360／390／430×844；各寬度 canvas 等於 viewport、
  `scrollWidth == clientWidth`，console 0 error。
- rollback baseline：
  `073b42c10a6aa81ae27fbb72b094db4383f29978`；本輪 commit hash 見最終回報。
  回退使用 `git revert <commit>`，不可 `git reset --hard`。
- 完整技術／數值／檔案／驗證報告：
  `review/moba-runtime/milestone-c-fix/MILESTONE_C_FIX_REPORT.md`。
- 仍需人工以 1× 觀看塔彈、野怪逐體、十名英雄六職業、長局 XP／死亡時序、
  三路塔前站位與 Replay；Android 真機 FPS、熱降頻、觸控、safe area、
  WebGL driver 與 H.2 閃爍未實測，不宣稱真機通過。
- 未納入工作區既有 bug 影片、terrain／map preview、backup、blend／glb 或 logs。

---

## Milestone D：Combat Presentation & Runtime Data Integration（2026-07-29）

狀態：**本機分階段實作、正式 GameView 桌機／手機 viewport／Replay 驗收及直接安全網完成；
完整 `runtime29` 為 43/44，唯一失敗已證明 rollback baseline 同樣重現；未 push、未部署，
未開始下一個 Milestone。**

### 根因與正式資料鏈修正

- 正式 runtime 的短命 FX 事件曾被顯式 `life` 繞過最低可讀時間，塔攻擊雖有事件卻只剩
  舊白圈容易被看見；現統一延長 tower／skill／attack 可讀窗口，塔改為
  蓄能 → 單一追蹤彈體＋尾跡 → 緊湊命中爆點，舊範圍圈降級，不另造傷害。
- `LogicEngine`、snapshot、adapter、runtime renderer 與 Replay 使用同一批
  cast／travel／impact／damage／hit state；六職業保留不同武器、輪廓與施法語彙，
  世界名牌、隊伍面板及 Replay 等級統一讀 `mlv ?? lv`，不再由初始 roster 另算。
- runtime-v2 原先沒有掛上正式 `BattleCameraController`，camera store 與實際 R3F camera
  斷線；現改為單一 camera writer。觀戰自動導播可平滑追蹤團戰、Boss、推塔與擊殺，
  手動關閉立即恢復原自由視角，再次點擊可重啟，且不寫入戰鬥邏輯。
- 導播按鈕原先與隊伍列 z-index／區域重疊而看得到、點不到，已調整桌機／手機底部安全
  位置；`BattleHUD` 兩段誤用的 `//` JSX 文字也已修正。

### Boss、Buff 與呈現

- Dragon／Baron 改為正式 runtime 動態物件，不再和靜態地圖模型重複；各自具有獨立
  HP、目標、攻擊／受擊、死亡與重生狀態，上方 Boss HUD 與地圖物件讀同一 snapshot。
- 紅／藍 Buff 維持不同模型、色彩與圖示；實際擊殺者取得有限時間狀態。紅 Buff 提供
  攻擊附加效果／減速，藍 Buff 提供技能冷卻、移動與資源型戰鬥增益；世界名牌、面板、
  snapshot 與 Replay 共用剩餘時間。
- Replay 僅 append optional `bf` 欄位，沒有升版或破壞既有 frame；舊 Replay 仍可讀。
  Boss 攻擊最後採 1 HP 呈現型傷害，因較高傷害會改變 v3 節奏；模組注入二分驗證後，
  本輪沒有修改公平性基線、地圖幾何、核心碰撞來源或勝負契約。
- 頭頂資訊整理為「名稱／等級 → 血條 → Buff／狀態」，手機遠景縮小次要文字；
  `?diag=1` 僅在正式 GameView 額外顯示短暫 FX 資料列，供驗收追溯，不改模擬。

### 驗證與證據

- 專屬 `check_moba_milestone_d` PASS：
  tower life 3.4、skill life 4.2、match level 5、boss damage 1、
  buff Replay 75 秒、導播自由視角 restore `(42,77)`、formal GameView 與 Replay
  read-only 全部通過。
- `check_moba_milestone_c_fix` PASS；production build 通過（2595 modules，只有既有
  chunk size warning）；`git diff --check` 無 whitespace error。
- `SKIP_NESTED=1 check_moba_pacing29b1` 為 25/25，v3 正／反序同為 20/40、位移 0pp。
- 完整 `check_moba_runtime29` 自然結束為 **43/44、exit 1**；Sprint23–28、
  regress、regress2 與 build 全部通過，唯一失敗為既有 v2 正／反序
  22/40（55%）對 14/40（35%），位移 20pp > 15pp。以完全相同 40 seeds 分別跑
  Milestone D source 與 `milestone-d-baseline`，兩者結果及變動 seeds 完全相同；
  因此未改公平性基線或放寬 verifier。
- 正式 Dashboard → MOBA → lineup → matchmaking → Ban/Pick → Tactic →
  GameView 流程完成 1440×900 與 390×844 viewport；手機 `scrollWidth ==
  clientWidth`。另完成正式 Result → Watch Replay。
- 十張證據位於 `review/moba-runtime/milestone-d/evidence/`，涵蓋桌機、手機、塔彈
  cast/travel/impact、技能 cast/travel/impact/hit、等級一致、Boss HUD／攻擊、
  Buff、導播 ON/OFF 與 Replay；索引見同資料夾 `README.md`。

### Commit、回退與人工驗收

- rollback tag：`milestone-d-baseline`，指向
  `cb0dad27233dfed053c3e58434090d96f84d23d5`。
- 分階段 commits：
  `7b84cbf`（戰鬥呈現資料鏈）、
  `448cf6d`（Boss／Buff）、
  `1afae71`（自動導播／專屬 verifier）、
  `eb6f17c`（正式 GameView 驗收缺口）。
- 完整報告：`review/moba-runtime/milestone-d/MILESTONE_D_REPORT.md`。
- 仍需人工以正常 1× 長時間判斷塔彈與六職業特效手感、多人混戰遮擋、Boss／Buff
  節奏及 Replay 動態；390×844 是桌面瀏覽器 viewport，不是 Android 真機。
  Android FPS、熱降頻、觸控、safe area、WebGL driver 與 H.2 閃爍未實測。
- 正式人工入口為 `http://127.0.0.1:5187/ESMO-/`；需要事件文字佐證時可用
  `?diag=1&debug=1`，但仍須走正式 Draft／Tactic／GameView，不以
  `?debug=moba-runtime-battle` debug harness 作驗收。
- 未納入工作區既有 terrain、bug、影片、backup、blend／glb、map review 或 logs。

---

## Milestone D-fix2：Combat Visibility & Explainable Decisions（2026-07-30）

狀態：**兩階段本機實作、正式 GameView 桌面證據、完整戰鬥觀察、直接安全網、
regress／公平性與 build 完成；未 push、未部署，未開始下一 Milestone。**

### 階段 1：正式 runtime-v2 視覺

- 正式資料鏈確認為 `LogicEngine.pushFx → snapshot.fx → adapter →
  MobaRuntimeEffects → live/Replay`；source／target／phase 沒有遺失。真正根因是
  Milestone D 把 Replay 保留時間 `exp` 與實際播放 `life` 同設 3.4／4.2 秒，
  0.5 秒攻擊週期堆出大量 additive 白圈，且固定 pool 舊事件先佔位，最新 travel
  反而會被截掉。
- 保留 Replay 取樣窗，但把 tower／skill／attack 畫面 life 分離為
  1.45／1.6／1.1 秒；pool 改 tower／skill／travel／新事件優先。塔彈加入亮色核心、
  外層色球與短尾跡，ring 降權；沒有改傷害、CD 或 Replay contract。
- 名稱縮為 7px 並移到完整血條上方，Buff icon 在血條下方；紅藍持有者加入低干擾
  環繞效果。紅藍 Buff 野怪改用不被白 emissive 洗色的模型色，並加入
  `BLUE BUFF · 藍` 菱形／`RED BUFF · 紅` 三角地面符號。
- 階段 1 commit：`3beb2c0`（`Milestone D-fix2 phase 1: repair combat visibility`）。

### 階段 2：戰鬥路線與決策

- v3 在任何英雄移動前，以全員凍結位置建立 `decisionPlan`；使用 HP、14 單位敵我
  人數、9 單位接觸、塔區／兵線、role 理想距離、`atkCd`、目標價值、隊伍劣勢及
  低血量隊友，輸出 `ENGAGE／KITE／PURSUE／RETREAT／SUPPORT／FALLBACK／LANE`。
- 每 2.5 秒重評；接戰維持 melee 2.2–2.6、後排 5.0–5.8 的職業距離，拉扯／支援
  只作短促微調後交還既有 FSM。避塔只處理無兵線單人闖有人守的塔、人數劣勢或
  塔區低血量，停在敵塔射程外，不再退回自家塔造成長距離來回。
- 鏡像同職業「同時接戰、同時撤退、同時回滿」的僵局以 seed＋席位固定 hash 的
  commitment 平手裁決；藍紅同席位等幅反號、0.15–0.19、不抽 rng、不改傷害，
  snapshot 只在 v3 附加 `decision { action,targetId,score,reasons }`。
- 60 seeds：60/60 收尾、藍 51.7%／紅 48.3%、反序藍 53.3%，順序偏差 1.7pp；
  40-seed pacing 正／反序皆藍 22/40、位移 0pp。沒有加入陣營係數或硬改勝負分布。
- 階段 2 commit：本節與 `MILESTONE_D_FIX2_REPORT.md` 所在 commit。

### 驗證、證據與回退

- 新增 `check_moba_milestone_d_fix2`：FX 資料鏈、Buff Replay、頭頂 UI／紅藍模型
  靜態安全網、六種決策微場景、陣列順序、鏡像 commitment 與完整比賽全部 PASS。
  seed 6310 於 20:53.5 收尾，實際出現九種 action／狀態。
- navigation 14/0、H.3 22/22、presentation 12/12、camera/replay 16/16、
  pacing 25/25、C-fix／D verifier PASS；regress 15/15、regress2 20/20 且 8/8；
  production build 2595 modules 通過，只有既有 chunk warning。
- 正式 GameView 桌面流程與完整 Result 證據位於
  `review/moba-runtime/milestone-d-fix2/evidence/`；報告為
  `review/moba-runtime/milestone-d-fix2/MILESTONE_D_FIX2_REPORT.md`。
- rollback tag `milestone-d-fix2-baseline` →
  `f688776b4a3b92246a5167afef5a4218a0432e4b`；依序 revert 階段 2、階段 1，
  不可 `git reset --hard`。
- 正式入口 `http://127.0.0.1:5187/ESMO-/`；需要事件文字可加
  `?diag=1&debug=1`，但仍須走正式 Draft／Tactic／GameView。
- 仍需人工 1× 長時間觀看六職業、塔彈、多人遮擋、決策切換與 Replay；Android
  真機 FPS、熱降頻、觸控、safe area、WebGL driver／H.2 閃爍未實測。
- 未納入既有 terrain、bug 影片、backup、logs、舊截圖、blend／glb 或 map review。

---

## Milestone D-fix3：Runtime 戰鬥視覺、野區資源與基地結構收尾（2026-07-30）

狀態：**兩階段本機 commits、正式 GameView 桌面流程、390×844 正式元件證據、
Replay、直接安全網、公平性與 production build 完成；依 Ray 最新指示準備 push／Pages
部署，未開始下一個 Milestone。**

### 階段 1：中立資源、基地守衛與戰略效果

- rollback tag `milestone-d-fix3-baseline` → `279829f`。階段 1 commit `8c576ff`
  （`Milestone D-fix3: integrate runtime objectives and base guards`）。
- 六座營地由整組狀態改為成員個體狀態：每隻獨立 HP、受擊、死亡、仇恨、攻擊 CD、
  killer／participants 與 90 秒重生；主怪死亡才授予紅／藍 Buff，側怪不再同步扣血。
- Dragon 150 秒、Baron 210 秒重生。Dragon `巨龍脈動` 每層輸出 +1.2%、
  防護 +0.8%，最多四層、本場永久且死亡保留；Baron `虛空攻勢` 70 秒，英雄攻城
  ×1.22、兵線拆塔 ×2.2、兵對兵 ×1.7，到期移除、死亡不提前移除。
- 增益由 LogicEngine 實際作用並經 snapshot、adapter、Replay、世界環與隊伍面板共用；
  舊 Replay optional 欄位缺失時仍可讀。
- 藍紅各兩座 `nexus_guard` 來自正式鏡射 placement；兩座守衛未倒前 nexus 不可選取，
  renderer 沒有複製假塔。

### 階段 2：塔彈／六職業 FX、頭頂 UI 與小兵繞塔

- 階段 2 commit `76dcca4`
  （`Milestone D-fix3: close combat visuals and tower routing`）。
- 正式 live 根因是 `RuntimeFrameFeeder` 在兩張 0.5 秒 snapshot 間固定使用
  `snapshot.ts`：cast 凍結半秒，下一張直接跳 travel／impact，肉眼只剩地環。
  現以 `extrapolateLiveEffectTime(prev.ts,snapshot.ts,subT)` 逐幀外推呈現時間；
  Replay 仍使用已保存 frame 的時間，不改契約。
- 「黑點」根因是 additive／instance color 在正式 WebGL、遠景與 Bloom 下失去實心輪廓。
  塔改藍／紅 normal-blended 炮彈外殼＋白熱核心＋尾跡；六職業固定色為坦克琥珀、
  戰士紅橘、刺客紫、法師青、射手金、輔助薄荷，並保留不同 cast／travel／impact
  幾何與動作。大型 ring 透明度降至 0.14，只作短提示。
- 姓名遮血條的真正根因是 DOM `<Html>` 永遠疊在 WebGL canvas 上，
  `renderOrder` 無法跨層解決；改為 CanvasTexture WebGL Plane，名稱群組獨立 billboard，
  名牌 order 69、血條 70–72，手機使用較窄 compact plane。
- Ray 確認 Buff 文字礙眼後，英雄頭上不再顯示 `D×1` 等圖示／秒數；紅／藍／龍／
  Baron 保留低透明環繞效果，隊伍面板改顯示 `龍×N／巴 Ns／紅Ns／藍Ns`。
- 小兵穿友軍塔的根因不是敵塔停位，而是 lane progress `t` 的中心線穿過友軍塔心；
  舊 adapter 每幀投影最近可走點，越過塔心時投影側會瞬間翻面。現以既有 Navigation
  field 求塔前到塔後的快取折線並沿同一 `t` 取樣；不改兵線時間、攻擊距離、傷害、
  地圖幾何、公平性或碰撞來源，live／Replay 共用。

### 驗證與證據

- `check_moba_milestone_d_fix3` PASS：塔 travel 進度
  `0.156→0.500→0.844`，live phase `cast→travel→travel→impact`；
  四門牙塔、營地個體死亡／重生、Dragon／Baron 增益、Replay 與小兵繞塔均通過。
  小兵對塔最小端點 clearance 1.049、線段 clearance 1.049、最大 0.001 t 步進 0.337。
- `check_moba_milestone_d_fix2`、`check_moba_milestone_d`、
  `check_moba_milestone_c_fix` 全部 PASS；navigation 14/0、小兵 H.3 22/22、
  presentation 12/12、camera/replay 16/16。
- `regress` 15/15：平均 24.5 分、31.9 kills、無撤退鎖死；`regress2` 20/20、
  節奏 8/8：藍 13／紅 7、平均 24.8 分、5 分鐘平均 Lv3.45。
  本階段未改 LogicEngine／決策／公平門檻，分布變動屬既有 seed 樣本波動，沒有為綠燈
  硬調結果。
- production build：2595 modules，exit 0；只有既有 >500 kB chunk warning。
  `git diff --check` 無 whitespace error。
- 完整 `presentation29b2` 曾啟動，但其巢狀 runtime29 長鏈在 300 秒無輸出後停止；
  改跑直接 presentation 12/12、navigation、regress、regress2 與 build，沒有無限等待。
- 桌面完整正式流程、1× 技能連續影格、無頭頂 Buff 文字、Replay 與 390×844 證據位於
  `review/moba-runtime/milestone-d-fix3/evidence/`。390×844 的 `shot_stats.json`
  確認 viewport 390×844、formal GameView=true、10 heroes、debug map UI=0、
  小地圖與隊伍面板 overlap=false。

### Claude Code 交接／回退／人工項目

- 完整報告：
  `review/moba-runtime/milestone-d-fix3/MILESTONE_D_FIX3_REPORT.md`。
- 回退優先用 `git revert`：只退視覺／繞塔可 revert `76dcca4`；連同個體中立資源／
  門牙塔一起退則再 revert `8c576ff`。`milestone-d-fix3-baseline` 只供比對，
  不可 `git reset --hard`。
- Claude Code 接手先讀 `AGENTS.md`、`docs/ai/跨模型交接流程.md`、本節與完整報告，
  再執行 `git status --short`；不要把既有 terrain、bug 影片、backup、logs、
  blend／glb、舊截圖混入後續 commit。
- Android 真機仍需確認塔彈／六職業華麗度與遮擋、姓名／血條、多名重疊、小兵繞塔、
  Buff 環、Boss 倒數、Replay、觸控、safe area、FPS／熱降頻及 WebGL driver。
  390×844 桌面 viewport 不代表真機通過。

---

## Milestone E：對戰身分連動與資料一致性（2026-07-30）

狀態：**本機實作與 Node 驗證完成；未 push、未部署，等待 Ray 確認範圍後才進下一步。
戰鬥節奏／團戰／目標決策依 Ray 指示另開 Milestone F，本階段完全沒有碰
LogicEngine、公平性、地圖、碰撞與 SIM_RULES。**

rollback tag：`milestone-e-baseline` → `91904c3`。完整報告：
`review/moba-runtime/milestone-e/MILESTONE_E_REPORT.md`。

### E1：對戰名單只剩一份

- 根因：`AppShell` 從未把 `roster` 傳給 `GameView`，於是 3D 名牌／隊伍面板／
  記分板／賽後戰報全部退回 `data/roster.js` 靜態名單，而 `useLocalServer`
  注入引擎的卻是 `profileStore` 的真選手能力 ⇒ 上場的人與畫面上的人不是同一批。
- 新增純函式 `buildBattleRoster()`（`mobaRosterAdapter.js`）：draft × lineup ×
  profileStore 合成**唯一一份**對戰名單，由 `AppShell` 傳給 `LoadingScreen` 與
  `GameView`。輸出形狀與既有 `draftRoster()` 相同 ⇒ 下游 UI 零改動即生效。
- 英雄身分優先序：本場 Ban/Pick → 選手綁定英雄 → 席位預設英雄。
  紅方無 profileStore 選手 ⇒ 仍走靜態名單（AI 對手，不虛構）。

### E1b：先發指派（新秀終於能上場）

- 根因（S28 技術債 4）：引擎席位寫死 b1–b5，招募新秀 id 是 `"r"+timestamp`
  ⇒ 永遠對不上席位、永遠不可能出賽。
- 新增契約 `platform/contracts/matchLineup.js`（`MatchLineup.v1`）分離
  「引擎席位」與「選手身分」；持久化於 `profileStore.lineup`（schema v4）。
  舊存檔缺欄 ⇒ `normalizeLineup` 回退 identity ⇒ 與 E 之前逐鍵相同。
- 去重（一人不佔兩席）＋互換語意（指派已在別席的人 ⇒ 兩席對調）。
  `buildPlayerStatSlots` 改吃 lineup：新秀坐 b3 時注入 key 仍是 `b3`
  ⇒ **引擎零改動**。入口在 `LineupScreen` 的 🔁 換人面板，唯一寫入點是
  `profileStore.setLineupSeat`。
- 連帶修掉會發錯獎的缺陷：`BattleResult.players[].id` 是席位不是選手 id，
  `mobaResultToTransaction` 現在以 lineup 換回真正上場的人（**BattleResult
  契約沒有改**），否則 XP 會發給板凳上的原 b3。

### E2：天賦與戰術效果可見化

- `snapshot.playerStatsExec`（S28 起就存在）從來沒有任何 UI 顯示過。
  戰中在 `HeroDetailPanel` 新增「本場行為（天賦生效證據）」；賽後在
  `BattleEndScreen` 新增「能力／天賦執行」面板（逐人＋全隊合計）。
- 兩處都只讀既有欄位，不重新統計、不呼叫引擎、不寫 Store；未注入能力 ⇒
  整段不顯示，不編造 0。戰術仍讀 `BattleResult.tacticExecution`，不另算一份。

### E3：Replay 與 Live 顯示同一組狀態

- 根因：`state`／`respawn`／`decision`／`teamBuffs` 從未被擷取，
  `replayPresentationSource` 只能填 null ⇒ 重播沒有狀態徽章、沒有復活倒數、
  HUD 的 `龍×N`／`巴 Ns` 永遠空白；`replay.comms` 早就保存卻沒有畫面顯示。
- `MobaReplay.v1` **只附加 optional 欄位**（未升版）：
  `ps = [stateCode, respawn?, actionCode?]`（字典索引＋變長列，未知字串原樣保存）、
  `tb =` 團隊 Dragon 層數／Baron 剩餘秒（只在真的有增益時才寫入）。
  舊 Replay 缺欄 ⇒ 維持既有 null 行為並可完整播放（verifier 有專門的舊檔測試）。
- `MobaReplayScreen` 顯示團隊 Buff 與已保存的播報（不重新生成對話）；
  順手修掉「未擷取小兵」的誤述（H.3 起已保存 `mn`，只有舊 Replay 才沒有）。

### 驗證與證據

- 新增 `check_moba_milestone_e`：**49/49 PASS**（契約向後相容／席位注入／
  對戰名單／XP 歸屬／Replay 附加欄與舊檔相容／接線與紅線／手機靜態安全網）。
- `check_moba_milestone_d_fix3`／`d_fix2`／`d`／`c_fix` 全部 PASS；
  `check_progress25` 34/34；`check_moba_stats28` 27/29、`check_talent27` 43/44、
  `check_moba_experience26` 34/35 —— 這三支的紅燈**全部是同一條既有的 replay 容量
  紅燈往上串**（詳見下節與 `08_目前待辦與風險.md`），三支自身的斷言都是全過。
- `check_moba_runtime29` **未跑完**：它巢狀 `stats28`（單跑約 87 分鐘），而鏈上的
  容量紅燈在 baseline 就存在 ⇒ 跑完也不可能 44/44。改為直接單跑它巢狀的每一支
  並逐項記錄。這是誠實揭露，不是宣稱通過。
- **`regress` 15/15、平均 24.5 分、31.9 kills；`regress2` 20/20、節奏 8/8、
  平均 24.8 分、5 分均 Lv3.45 —— 與 D-fix3 逐值相同**，即模擬確實沒有被動到。
  這是本階段最重要的回歸訊號：一旦位移就代表引擎被改了。
- production build 2596 modules、exit 0，只有既有 >500 kB chunk warning。

### ⚠ 既有紅燈（非本階段造成）

`check_moba_experience26` §17「replay size 有上限」在 `91904c3` 就已經是紅的。
以 `git worktree` 在未改動 baseline 實跑同一支 verifier：**baseline 2063 KB → 紅**、
Milestone E 2162 KB → 紅，門檻 1953 KB。主因是 H.3 的小兵欄位 `mn` 單場佔 844 KB；
Milestone E 自身的 `ps`+`tb` 已從 163 KB 壓到 85 KB（在該 fixture 上 +99 KB）。
這條紅燈會沿 `experience26 → talent27 §31 → stats28 §20/§21 → runtime29 §30`
往上串，是**同一個根因**不是四個問題。
**沒有調鬆 verifier 門檻**（那等於為了綠燈拆警報）。
**Ray 已裁決：採 (a)** —— 列為既有已知問題，本階段不改 `mn`／IndexedDB／門檻；
已在 `08_目前待辦與風險.md` 建立「Replay 單場容量治理」的後續獨立待辦。

### 正式流程瀏覽器驗收（同日補做，`tools/shot_milestone_e.mjs`）

真實 Chrome + CDP，入口是**正式流程**而非 debug harness：
`Dashboard →（➕ 招募）→ Lineup（🔁 換人）→ Matchmaking → Ban/Pick → Tactic →
Loading → GameView → Result → Replay`。本輪走真實招募簽下新秀 **Zywuu**
（中路、未綁定英雄、Lv.1）並指派到 MID（席位 b3）。

- 桌機 1600×1000：**28/28 斷言通過**、8 張截圖；390×844：**21/21 通過**、7 張截圖。
- 換人後 Lineup／Loading／隊伍面板／賽後戰報**四處都是 Zywuu**，Frost 已離開先發；
  新秀未綁定英雄 ⇒ 沿用席位預設「冰霜術士」，沒有出現空英雄。
- 戰中 HeroDetailPanel 出現「本場行為（天賦生效證據）」；賽後同時可見
  「能力／天賦執行」與「戰術執行」。
- Replay：播報列（`replay.comms`）首次被顯示；時間軸拉到 21:34 後標頭出現
  `龍×1`／`龍×3`（本階段新增的 `tb` 欄）。
- 證據與索引：`review/moba-runtime/milestone-e/evidence/`。

**這次驗收沒有證明的事（不宣稱通過）**：3D 名牌是 WebGL CanvasTexture，DOM 與
診斷探針都讀不到，兩張 GameView 截圖又在比賽鐘 0:15／1:03（英雄還在泉水附近）
⇒「新秀姓名出現在 3D 名牌」仍需目視確認；Android 真機 FPS／熱降頻／觸控／
safe area／WebGL driver 亦未測。

順帶記錄到的既有現象（非本階段造成，未修，已列入候選待辦）：Replay 戰場預設仍走
`loadMapPresentation()` 的 legacy 呈現（正式 GameView 自 H.1 起固定 runtime-v2）；
世界標籤會蓋在英雄詳情面板上。

---

## Milestone F：MOBA 戰鬥節奏與團戰收益轉化（2026-07-30）

狀態：**本機實作與 Node 驗證完成；未 push、未部署，等待 Ray 驗收。
完全沒有瀏覽器實測。** rollback tag `milestone-f-baseline` → `2500ae2`。
完整報告：`review/moba-runtime/milestone-f/MILESTONE_F_REPORT.md`。

### 先量再改

新增儀器 `tools/measure_moba_pacing.mjs`（只讀引擎狀態、不改行為，任意 commit 可跑）。
40 seeds 正／反序量到的 E baseline 問題：團戰窗 20.8／場、**零碎碰撞率 0.49**
（半數「團戰」短於 3 秒且零陣亡）、團戰中位長度 **2.0 秒**、打贏一波後的
**無目的遊走率 0.38**、團戰後硬收益轉化 0.23。

關鍵觀察：**42 個擊殺裡有 31 個發生在引擎沒有認定團戰的時候** ——
`hot` 抓到的多是「兩邊各兩人對峙但沒人死」，真正的收益機會是抓單與以多打少。

### 修法

1. **團戰窗遲滯**：成立條件完全不放寬，但成立後給 3 秒遲滯（接觸暫斷不算結束）、
   20 秒上限（不許僵持整場）、且**對線期（240 秒前）不套遲滯**
   ——不加這個閘門會把 5 分鐘均等級壓到 2.4，低於 regress2 門檻。
2. **主動權窗**：打贏一波後開 22 秒窗，導向巴龍／龍／最近的敵方建築；
   殘血者不跟進（走既有回城路徑）。觸發點同時掛在團戰結算**與擊殺事件**上
   ——只綁團戰窗時轉化率量不動（0.23 → 0.24）。
   龍／巴龍直接打開既有目標窗（不另寫一套集結），只有攻城新增移動分支。
3. **群體拆塔分級**：`heroTowerSoloK 0.30` 的原意是「孤軍拆不動」，
   新增 `heroTowerGroupMin 3 / heroTowerGroupK 0.62`，成群集火給較高效率
   （仍低於有兵線的 1.0）。**沒有改塔血、沒有改 heroTowerDmg。**
4. **PURSUE 不再追進敵塔射程**（除非我方在該塔區有人數優勢）。

### 結果（40 seeds，正／反序）

| 指標 | baseline | F |
|---|---|---|
| 團戰窗／場 | 20.78／23.40 | 13.53／14.35 |
| 零碎碰撞率 | 0.49／0.51 | **0／0** |
| 團戰中位長度 | 2.0 秒 | **7.25／6.38 秒** |
| 無目的遊走率 | 0.38／0.37 | **0.20／0.18** |
| 團戰後硬收益轉化 | 0.23／0.28 | 0.30／0.30 |
| 機會事件硬收益率 | 0.36／0.35 | **0.37／0.34（持平）** |
| 平均時長 | 25.26／26.23 分 | 25.12／25.04 分 |

**⚠ 誠實揭露：機會事件硬收益率沒有改善。** 改善的是「有沒有在做事」與團戰型轉化，
不是每一次優勢都變成硬收益。分母裡有相當比例本來就換不到（目標冷卻、塔太遠、
或勝方選擇回城補給）。沒有為了讓數字好看而放寬定義或調參。

### 驗證與重新校準

- `check_moba_pacing29b1`（官方公平性）**25/25**；§25：40 seeds 正序藍 21/40、
  反序 26/40、**位移 13pp ≤ 15**，兩側皆在 30–70%。
- `regress2` 節奏門檻 **8/8**（平均 24.6 分、最長 30.3 ≤ 32、5 分均等級最低 2.6）。
- `check_moba_milestone_f`（新增）**30/30**；`milestone_e` 49/49；
  `d_fix3`／`d_fix2`／`d`／`c_fix` 全 PASS；build 2596 modules exit 0。
- **兩項分布變化要知道**：`regress` 結束率 15/15 → **14/15**（一場超過它的 30 分鐘
  取樣上限；regress 本身 exit 0，硬門檻 regress2 的「最長 ≤32 分」是 30.3 分通過）；
  正／反序位移由 0pp 變 **13pp**，仍在門檻內但餘裕比 D-fix2 小。
  這是混沌放大而非系統性偏袒——F 的機制經行為對稱測試（verifier §25：
  雙方互換戰況 ⇒ 結果完全鏡射）。

### 未驗證

**完全沒有瀏覽器實測**：新的攻城集結、團戰持續時間與主動權窗在畫面上的觀感、
視覺擁擠與效能都需要實際看畫面。Android 真機亦未測。
`check_moba_runtime29` 未跑（既有 Replay 容量紅燈使它不可能 44/44）。

### Milestone F 正式 GameView 驗收（同日補做，`tools/shot_milestone_f.mjs`）

真實 Chrome + CDP，走正式流程進 GameView，4× 看完整場、每秒取樣一次。

**桌機 1600×1000（完整一場跑到 over，313 個取樣點）**

- FPS 中位 **61**、p10 58、最低 46（只有 7 秒 <50）
- 群聚度：最大 8、**平均 2.59**、≥6 人只有 **4 秒** ⇒ **沒有過度群聚**
- 抖動：354 次方向反轉／約 2800 hero-秒（≈0.13）
- 卡位：103／1491 hero-秒（6.9%），狀態是 **回防 47／對線 31／打野 18／避塔 6／團戰 1**
  ⇒ **不是卡位**，全是「站著才對」的狀態（第一版啟發式沒排除這些狀態，
  誤報成 102/313，已修正判讀）
- 行為分布：對線 40.9%、團戰! 16.7%、打野 7.8%、回防 6.7%、**圍攻 5.4%**、
  回城中 4.2%、避塔 4.0%、撤退 3.8%、抓人 2.7%、回城 1.7%、追擊 0.9%、圍攻主堡 0.6%
  ⇒ 團戰之後確實轉向推塔／回城／追擊，不是原地遊走

**手機 390×844**：FPS 中位 61／最低 60；無水平溢出；小地圖不與十人面板重疊；
群聚最大 7；隊伍面板展開五列可讀。

**兩個既有視覺問題（非 F 造成，只記錄不修）**：
1. 巴龍模型在坑區呈現為一大片淺色平面；F 讓雙方更常在巴龍坑集結 ⇒ 更常被看到。
2. 手機擊殺橫幅（`Double Kill!`／`Dragon 被擊殺`）會蓋到倍率與畫質按鈕；
   F 讓決勝團戰變多 ⇒ 出現頻率上升。

證據：`review/moba-runtime/milestone-f/evidence/`（10 張取樣截圖 ＋ 5 張乾淨截圖
＋ `shot_stats_f.json`／`shot_stats_f_clean.json`）。

### Milestone F 收尾校準（只處理 regress §36 那一場）

唯一沒收尾的是 **seed 42：30.3 分**（regress 取樣上限 30.0），只超過 18 秒。

診斷：雙方在 25–30 分同時卡在**門牙塔**階段（藍方門牙塔已破、紅方剩 20 HP、
兩座主堡都還滿血），而收尾階段**平均只有 1.4 人在打門牙塔**。

根因是一個**結構性不可能達成的前提**：`heroTowerSoloK 0.30` 的條件是
「沒有己方兵線抵達該建築」，但**小兵路線根本沒有延伸進基地廣場**
（見 LogicEngine 建構子 `nexus_guard` 的 `t` 註解）⇒ 門牙塔永遠不可能有兵線，
於是全程吃 0.30。那個懲罰是為「帶兵推塔」的路上塔設計的。

修法：新增 `nexusGuardNoWaveK: 0.62`，**只有門牙塔**解除「無兵線」懲罰。
沒有動塔血、沒有動 `heroTowerDmg`、沒有加速任何一座路上塔、沒有改團戰成立條件／
長度／公平性參數，也**沒有放寬任何 verifier、取樣上限或斷言**。

| 驗證 | 校準前 | 校準後 |
|---|---|---|
| `regress` 結束率 | 14/15（seed 42 = 30.3 分） | **15/15**（seed 42 = 24.4 分） |
| `regress2` | 8/8 | **8/8**（平均 23.9、最長 29.1 ≤ 32、5 分均等級 2.6） |
| `pacing29b1` | 25/25、位移 13pp | **25/25、位移 10pp**（餘裕變大） |
| `check_moba_milestone_f` | 30/30 | **30/30** |
| `milestone_e`／`d_fix3`／`d_fix2`／`d`／`c_fix` | PASS | **全部 PASS** |

節奏指標沒有退步（40 seeds 正／反序）：零碎碰撞率 **0／0**、團戰中位
**7.13／6.38 秒**、無目的遊走率 **0.20／0.18**、團戰後硬收益轉化 **0.32／0.31**。

**要知道的一點**：平均時長比 E baseline 短約 1.5 分（25.3 → 24.7）。仍在
`regress2` 的 [14, 26] 內且離下界很遠，但這是門牙塔修正的連帶效果——
所有比賽都會經過門牙塔階段，不只 seed 42。

---

## Milestone G：戰鬥隊伍面板與手機地圖操作（2026-07-31）

狀態：**本機實作與驗證完成；未 push、未部署，等待 Ray 驗收。**
rollback tag `milestone-g-baseline` → `e6325f0`。
完整報告：`review/moba-runtime/milestone-g/MILESTONE_G_REPORT.md`。

性質：**純呈現層**。`regress` 15/15、平均 23.5 分、擊殺 29.8 與 Milestone F
**逐值相同**，`regress2` 8/8 ⇒ 這一輪確實沒有動到模擬。

### 1. 隊伍面板

- 「沒有血條」的真相：面板其實有，是 Legacy `StatBars` 的 **3px 垂直細條**，
  在 390px 手機上看不出來。改成**水平血條**（三段顏色＋百分比；陣亡直接顯示復活倒數）。
- 新增狀態晶片，全部取自 snapshot 既有欄位：`dead`/`respawn`（☠ 倒數）、
  `rc`（回城 Ns）、`state`（團戰／撤退／追擊／推塔／回防／打野…）、
  `statusEffects`（緩 Ns）；沒有資料就不顯示。
- 點英雄改開新的 `BattleHeroSheet`：血量與狀態 → **召喚師技能即時冷卻** →
  英雄技能（明示引擎不模擬個別技能 CD，不顯示假 CD）→ 本場數據（含 D-fix2 的
  目前意圖）；生涯／熟練收到底部按鈕才開。
- 順手修掉既有疊層問題：drei `<Html>` 的世界標籤（`BLUE BUFF`、`首次刷新`）
  會壓在面板文字上（Milestone E 就記錄過）。新增 `Z.sheet = 18`（低於終局 20／重播 60）。

### 2. 手機地圖操作

- **⚠ 往上滑弄丟整場比賽**的根因是 canvas 沒宣告 `touch-action` ⇒ 瀏覽器把拖曳
  當頁面過捲、觸發下拉重新整理。修法：canvas `touch-action:none`，並在**戰鬥畫面
  掛載期間**關閉 `html`/`body` 的 `overscroll-behavior-y`（卸載還原）。
- **拖曳鈍**還有第二個原因：兩軸共用同一位移係數，但地面被 52° 俯角壓縮
  ⇒ 直向比橫向鈍。現在垂直分量除以 `sin(pitch)`。
- **手勢中斷**：舊碼進入捏合時把拖曳狀態清成 null 且不重建 ⇒ 放開一指手勢就斷。
  現在由剩下那根手指接續（pointer 由第一個進來的事件認領——`touch.identifier`
  與 `pointerId` 不同組）。雙指也改成**同時可縮放與平移**（`userViewTo` 一次 set）。
- **縮放**：`ZOOM_MIN` 1.6 → **1.06**，最遠距離 372 → **561**，
  剛好對到相機本來就設計好的 `distMax 560`（`far:1000` 也是照這個算的）
  ⇒ 放寬的是 zoom 下限，不是相機設計包絡；`ZOOM_MAX`／近距離不變。

**⚠ 誠實揭露**：390×844 直式要**橫向**看完整張地圖需要距離 977，相機上限是 560
⇒ 縱向已可全覽、橫向仍只有約 57%。要橫向全覽必須把 `distMax` 拉到約 1040 並放大
`far`，實算 16-bit 深度量化會從 `Δz 0.132` 惡化到 **0.460（約 3.5 倍）**——那正是
H.2-flicker 修的「Android 單位整批閃爍」成因，**刻意不做**。全圖總覽仍看小地圖。

### 驗證

- `check_moba_milestone_g`（新增）**30/30**；`tools/shot_milestone_g`
  真瀏覽器 **20/20 斷言、5 張截圖**（桌機 1600×1000 ＋ 390×844）。
- 以 CDP 送**真的觸控事件**單指下拖：pan `z 60.3 → −65.6`、`window.scrollY` 不變
  ⇒ 不會再觸發下拉重新整理。縮放實測可達 `dist 561`、近距離 `dist 66`。
- `camera_replay29b6` 16/16、`controls29b3` 18/18、`milestone_f` 30/30、
  `milestone_e` 49/49、`regress` 15/15、`regress2` 8/8、build 2597 modules。

### 未驗證

**Android 真機手感**（跟手細緻度、慣性、低 FPS 表現）與**真實 Android Chrome 的
pull-to-refresh**：桌面 Chrome 的觸控模擬只能證明「有平移、頁面不捲動」，
真機仍需 Ray 確認。長時間人眼觀感（面板是否過密）亦未測。

---

## Milestone H：英雄選擇進對戰 ＋ 三個呈現修正（2026-07-31）

狀態：**本機實作與驗證完成；未 push、未部署。**
rollback tag `milestone-h-baseline` → `0813594`。
完整報告：`review/moba-runtime/milestone-h/MILESTONE_H_REPORT.md`。

### 1. Ban/Pick 第一次真的影響對戰

到 G 為止選角是**純外觀**（`draftRoster.js` 自己寫著引擎 loadout 走 `HERO_ASSIGN`）。
一直沒接的原因是 `calcMobaPower` 會直接乘進 `dmgAmt = p.power * dt * 0.92`
⇒ 等於 damage multiplier，違反 S28 §2。

修法是沿用已驗證的行為層管線，新增第三層：
`S24 戰術 → configureMatch`／`S28 選手能力 → configurePlayers`／
**`H 英雄定位 → configureHeroes`**。新增純函式
`src/battle/moba/mobaHeroProfile.js`，六定位各有得失：

- `engageDistK` 站位（坦克 0.72 貼前排／射手 1.20 站後排）
- `engageAdj`／`retreatAdj` 進退門檻
- `focusLowHp` 目標選擇（刺客 +0.22 最看殘血）
- `joinAdj`／`objAdj` 團戰職責、`protectAdj` 保護隊友（輔助 +0.20）
- `skillWeight` 技能就緒權重（法師 1.18／坦克 0.85）

**不輸出 power／tough**，`_heroMod` 不出現在任何傷害／金錢式子（verifier §4 斷言）。

**中性由結構保證**：實作中一度無條件包了一層 `clamp(c + 0, …)`，那在英雄層關閉時
也會改變邊界值行為；已改成「有偏移才夾」。並以 `git worktree` 對 baseline
實跑 5 顆 seed **逐欄相同 5/5**。

### 2. 三個呈現修正

- **巴龍一大片淺色平面**：根因是命中閃光把**整個模型**換成 `#fff1b8`
  （`toneMapped:false`），而打巴龍時多人持續命中 ⇒ `hit > 0` 幾乎全程成立。
  巨型目標改成**只閃重點色**，本體保留皮膚材質；小野怪維持原行為。
- **手機擊殺文字遮住倍率／畫質按鈕**：浮動大字 `top 26%/width 80%` 會壓到
  `SAFE_TOP` 起算的右上控制欄（約到 31%）。手機改 `top 38%/width 70%`，桌機不動。
- **Replay 固定 runtime-v2**：原本跟著 `loadMapPresentation()`（預設 legacy），
  與固定 runtime-v2 的正式 GameView 不一致。現在只要 replay 支援 3D 就一律
  runtime-v2，舊 replay 仍有 legacy 退路。
  （過程中一度把 `runtimeMap` 寫在 `use3D` 之前 ⇒ TDZ、build 抓不到、執行才炸；
  已修並加 verifier §25 防止再犯。）

### 驗證

- `check_moba_milestone_h`（新增）**31/31**；真瀏覽器 **13/13、5 張截圖**。
- 英雄層關閉 vs baseline：**5/5 seed 逐欄相同**。
- `milestone_g` 30/30、`milestone_f` 30/30、`milestone_e` 49/49、
  `camera_replay29b6` 16/16、`controls29b3` 18/18。
- `pacing29b1` **25/25**（位移 10pp ≤ 15）；`regress` 15/15、23.5 分、擊殺 29.8
  （與 G 逐值相同）；`regress2` 8/8；build 2598 modules。
- **英雄層開啟後**（40 seeds）：正序藍勝 0.50、反序 0.50 ⇒ **位移 0pp**；
  團戰中位 7.25／7.0 秒、無目的遊走率 0.20、零碎碰撞率 0.01 —— 節奏全部維持。
  測試用定位分布刻意不對稱（預設名單藍 坦/刺/法/射/輔 vs 紅 戰/戰/法/射/坦）仍 50/50。

### 過程中修掉的兩個假斷言（記錄以免重犯）

1. H §19 原本斷言「rng 抽樣次數不變」——**前提錯誤**。行為改變會改變「哪些分支
   走到抽樣點」，同 seed 次數本來就不同（596 → 657）。改成驗真正的不變量：
   同 seed + 同定位 ⇒ 完全決定性。
2. G §24「未改 LogicEngine」是掃字串「Milestone G」——後續 milestone 只要在註解
   提到 G 就誤判。已改為內容導向。（H §28 也踩過：`mobaNavigation.js` 檔頭寫著
   舊的「Milestone H.2」。）**結論：禁改邊界不要用 milestone 名稱字串當標記。**

### 未驗證

英雄定位的「手感」需人眼長時間觀看；**巴龍修正的實際觀感沒拍到多人打巴龍那一刻**
（本輪截圖在開局階段），建議實際打一場看巴龍團確認。Android 真機沿用 G 的清單。

---

## Milestone I：英雄池、選角與賽前配置整合（2026-07-31）

狀態：**部分完成**——三項完成、兩項部分、一項未動工。未 push、未部署。
rollback tag `milestone-i-baseline` → `c2cc699`。
完整報告：`review/moba-runtime/milestone-i/MILESTONE_I_REPORT.md`。

### 1. 圖鑑「法師只有 10 名」的真相（✅ 完成）

**過濾沒有壞**。`CHAMPIONS_100` 100 名全部有 arch/lane，是資料分布問題：
坦15／戰20／刺20／**法10**／射20／輔15，中路 20 名裡法師刺客各半。

逐一檢視後只有兩處**明確標錯**：`hundun` 混沌術士（名為術士、五技能全法術）
與 `hunpo` 魂魄使者（靈魂系法術），已修正主定位。其餘如「冰霜守衛」
（護甲／壁壘／嘲諷）、「雷霆神射」（穿甲／射）雖帶元素語彙但定位動詞正確，**沒有動**。

新增 `src/data/heroClassification.js`：主定位（`arch`，Milestone H 行為層讀它 ⇒
公平性不受影響）＋ 從既有技能文字推導的**次要標籤**，圖鑑改用「任一標籤符合」過濾。
門檻是量出來的：命中 ≥4 ⇒ 8 名有次要標籤、≥3 ⇒ 11、**≥2（採用）⇒ 12**、
≥1 ⇒ 退化成「法師 41、坦克 40」不可用。
**結果：圖鑑可見 坦15／戰21／刺21／法20／射20／輔15**，主定位仍合計 100。

Ray 後續問「能不能讓更多英雄有第二標籤」：實測即使最寬門檻也只撐得出 12 名，
再放寬就是編造證據；要更多需要**更多資料**（英雄數值或第二擅長位置欄位）。
Ray 已裁決維持 100 名英雄、接受目前分布。

### 2. 選手／英雄／五路自動分配（✅ 完成）

新增 `mobaDraftAssignment.js` 取代「`picks[i]` → 席位 `b(i+1)`」的順序硬對位。
英雄位置適性（本位 1.0／次要標籤 0.55／不擅長 0.15）＋ 選手位置熟練
（本位 1.0／依關鍵能力 0.1–0.9／無資料 0.5），**窮舉 5! = 120 種排列取最高分**、
平手以字典序決勝 ⇒ 完全決定性、不抽 rng、與選取順序無關。
Ban/Pick 新增「出戰配置」面板：每一路顯示操作選手／英雄／適性%／召喚師技能，
並列出所有衝突（英雄非本位、選手非本位、尚未選角）。

### 3. 召喚師技能（⚠ 部分）

新增 `mobaHeroLoadout.js`（`MobaHeroLoadout.v1`）：每人固定 2 個技能，
第一格閃現；第二格依位置（上路傳送／**打野懲戒（硬性規則）**／中路點燃／
下路治療／輔助虛弱）。技能表標明 `engine: true/false`——引擎只實作閃現與懲戒，
其餘明確標示為配置資料且不顯示假 CD。
**已完成**：資料模型 + Ban/Pick 顯示 + 隨 onNext 往下傳。
**未完成**：Loading／GameView／Replay／Result 尚未消費這份 loadout。

### 4. 名單資料流（⚠ 部分）

`draftRoster` 與 `buildBattleRoster` 改為優先採用 `draft.assignment[side][seat]`，
無分配時完全走原路徑 ⇒ 舊 draft 行為不變。Loading／正式對戰／Result 已共用同一份
roster；**loadout 尚未併入**。

### 驗證

`check_moba_milestone_i`（新增）**31/31**；`milestone_h`／`g`／`f`／`e` 全 PASS；
`regress` 15/15、23.5 分、擊殺 29.8（與 H 逐值相同）；`regress2` 8/8；build 2601 modules。
引擎完全沒被動到（本階段是資料與賽前流程層）。

### ⚠ 未完成（誠實揭露）

- **目標 5（賽前配置的英雄來源標示）完全未動工**：LineupScreen 尚未標示
  「推薦／熟練最高／最近使用／尚未選角／已鎖定」。
- 目標 4 的下游（Loading／GameView／Replay／Result 消費 loadout）未做。
- **沒有瀏覽器實測**：Ban/Pick 新面板、圖鑑法師分頁、自動分配在真實流程的表現
  都還沒實際點過。

### 又一次踩到同一個坑（第三次）

verifier §14「不抽 rng」的關鍵字掃描掃到模組註解裡的「不抽 rng」字樣而誤判。
F 的 §19、G 的 §24、H 的 §28 也都是同類問題。
**結論已定案：禁改／禁用類的斷言一律驗行為，不要用關鍵字掃描。**

---

## Milestone I-close（2026-07-31）— 收尾目標 4／5／6 ＋ 全流程瀏覽器驗收

Milestone I 留下的三件事全部收完，並第一次對這條流程做了真瀏覽器驗收。
報告：`review/moba-runtime/milestone-i-close/MILESTONE_I_CLOSE_REPORT.md`
rollback tag：`milestone-i-close-baseline` → `bfd4557`

### 目標 4／6：loadout 貫穿全流程

關鍵決定：**不是把 loadout「傳給」四個畫面，而是讓它只有一份。**
召喚師技能改成長在對戰名單上——`buildBattleRoster` 決定席位英雄的下一行就決定
該席位的技能，`draftRoster` 走同一個 `spellsFor`。四個畫面本來就讀同一份 roster
⇒ 結構上不可能不一致，不是靠「記得同步」。

順手修掉兩處**真的會顯示錯人**的對位（都還在用選取順序，而 I 起 Ban/Pick 另有
席位分配，兩者不同序時就分岔）：

- `LoadingScreen`：`picks[side][idx]` → 改走 `draftRoster`（與 GameView 同一 adapter）
- `BattleHeroStrip`：先看 picks → 改為**名單優先**，無名單才退回 picks

引擎只實作閃現與懲戒（本輪沒動引擎）。面板改成分辨兩種技能：引擎技能顯示即時
CD，配置技能顯示「配置」並淡化——**寧可少說，不能給假 CD**。副作用是非打野的
第二格不再是「未配置」。

Replay：`playersMeta` 追加 optional 欄（heroId/playerName/lane/spells），
**版本仍是 `MobaReplay.v1`**，舊 replay 無此欄照舊播放。順帶把名單接給
`MobaRuntimeView3D`，重播 3D 名牌終於與現場同一批人。容量數字一位都沒變。

### 目標 5：英雄來源徽章

新增 `src/battle/moba/mobaHeroSource.js`，五種來源都對應到真實資料。
**最重要的一條判定**：「已鎖定」必須「選手綁定英雄 **且與席位預設不同**」。
初始名單五人的 `player.heroId` 就等於席位預設，照字面判成已鎖定等於用徽章
去坐實玩家「英雄和選手綁死」的誤解——verifier §26 專門釘住這件事。
畫面下方另加說明，明講賽前只是參考、正式出戰在 Ban/Pick 才定案。

為此在 `heroProgress` 加了 `lastMatchSeq`。用**單調遞增序號不用 Date.now()**：
`applyMatchResult` 是純函數，塞時鐘會讓它不可重現。

### 驗證

`check_moba_milestone_i_close`（新增）**44/44**；
`shot_milestone_i`（新增）桌機 1600×1000 **22/22** ＋ 手機 390×844 **22/22**；
`milestone_i`／`h`／`g`／`f`／`e` 全 PASS；`regress` 15/15、23.5 分、擊殺 29.8
（**與 H／I 逐值相同**＝沒碰公平性的證明）；`regress2` 8/8；build 2601 modules。

瀏覽器驗收驗的是「同一份資料」不是「畫面沒炸」：每一站用 `data-*` 抓配置，
最後**逐席比對** Ban/Pick ↔ Loading ↔ 戰鬥面板 ↔ Replay。

### 手機首跑紅燈是腳本錯，不是產品錯（值得記）

`mobile 20)` 首次紅燈：面板顯示 `flash,ignite`，腳本拿 b1 的 `flash,teleport` 去比。
查證後是**手機版十人面板預設收合、只渲染目前那一路**，索引 0 不是 b1；
證據 JSON 顯示 `clickedSeat=b3`，而 b3 的配置正是 `flash,ignite`——產品是對的。
修法是給 `hero-cell` 加 `data-seat`，比對「實際點到的席位」，**不是放寬斷言**。

### 關鍵字掃描：第五次（兩支是既有假紅燈）

開工前已在 `bfd4557` worktree 重現，確認非本輪造成：

- `check_moba_tactic24` §B 掃字面 `start({ tactic })`，但 **Milestone H** 起是
  `start({ tactic, roster })` ⇒ **從 H 就一直假紅**。改成 `/start\(\{\s*tactic\b/`。
- `check_progress25` §16 是上一條的連鎖，隨之轉綠（34/34）。
- `check_moba_milestone_g` §7 掃完整標題「召喚師技能（即時冷卻）」，而本輪標題
  正當改動（第二格可能沒有 CD，原標題已不實）。改成驗四個區塊都在。

三處都改成驗行為／驗結構，沒有降低強度。**規則再強調一次：
禁改／禁用類斷言一律驗行為；連 UI 區塊也不要綁死單一字串。**

### 沒有修的既有紅燈

- `check_dash10`：`snapshotToBattleResult: snapshot 尚未終局` 直接拋錯，
  已在 `bfd4557` worktree 重現 ⇒ 既有紅燈，診斷屬另一件事，沒有順手重構。
- `check_moba_experience26 §17`：replay ≈2492KB > 2MB，Ray 已裁決為既有已知問題。
  改動前後**同為 836 frames ≈ 2492KB**，本輪沒讓它變差。

---

## Milestone J（2026-07-31）— 召喚師技能真的進引擎

報告：`review/moba-runtime/milestone-j/MILESTONE_J_REPORT.md`
rollback tag：`milestone-j-baseline` → `5060c02`

### 範圍：六個功能目標裡，四項在 I／I-close 已完成

J 真正的主體是**目標 3**：I-close 交付時，八個召喚師技能只有閃現與懲戒有引擎
效果，其餘六個是「畫面有圖示、引擎不認得」。Ray 的驗收條件就是這一句
「不可只顯示圖示卻沒有引擎效果」。目標 1／2／5 沿用 I／I-close，只加驗證。

### `configureSpells`：第四個 opt-in 行為層

沿用 `configureMatch` / `configurePlayers` / `configureHeroes` 的同一套邊界：
**不呼叫 ⇒ 整段不存在**。五個 seed 的完整比賽摘要（時間／勝方／擊殺／金幣／
血量）改動前後**逐位元相同** ⇒ regress、runtime29 的歷史基準完全不受影響。
這是量出來的，verifier 每次執行都重驗一次。

八個技能全部有可觀測效果（傳送／治療／護盾／點燃／幽魂／淨化為本輪新增）。
`exhaust` 從技能表**移除**——它沒有引擎作用點，留著就是繼續做這個 Milestone
要消滅的事。

三個設計判斷：
1. **點燃是獨立傷害源，不是乘數**（S28 §2 紅線：不得有東西乘進 `dmgAmt`）。
2. **護盾走單一傷害出口 `_damageHero()`**，未啟用時就等於原本那一行 `hp -= amt`。
3. **懲戒歸屬由引擎裁決**：餵壞資料進去（中路帶懲戒、打野沒懲戒）引擎會改回來。
   「非打野不得自動取得 Smite」的最後一道防線放在引擎，不是 UI。

### 修掉三處「只認得兩個技能」的潛伏錯誤

`battleEvents` 的 `spell === "flash" ? "閃現" : "懲戒"` 最嚴重——第二格能放
八種之後，治療／點燃／傳送**全部會被播報成「懲戒」**，而 Replay 原封保存
那串字 ⇒ 整場戰報說謊。另外兩處是十人面板的 `SPELL_META`（其餘六個畫成「?」）
與英雄面板的狀態列（只認 slow）。都改成讀技能表這個唯一命名來源。

### 節奏：regress 沒涵蓋玩家實際走的那條路徑

`regress` 跑的是**沒有技能層**的基準，正式對戰**會**開。所以 verifier §5 用
同一組 15 seed 另跑一次：結束率 15/15、時長 23.5→24.3 分、擊殺 29.8→34.5
（點燃帶來的，符合預期）、**藍紅勝場 10/5 → 10/5 完全沒位移** ⇒ 對稱性未破壞。

### ⚠ 我改了一條斷言的定義，理由寫在這裡

verifier §30 原本照抄 regress 的「瞬間 ≥8 人撤退」當死鎖判準，技能層開啟後
2 個 seed 命中。實測：**峰值 8 人（非 10）、最長連續 2.5 秒、整場合計 4 秒**
——那是大團戰結束時的正常後撤。「鎖死」的語意是回不來，判準應該是持續時間，
所以改成「連續 30 秒」，並新增 §30b 釘住「不得十人同時撤退」。兩條都把實測值
印在標籤上。**這是我的判斷（修正而非放寬），數據在報告裡，可以推翻。**

### 目標 4 誠實揭露：沿用 H，沒有擴充

英雄定位影響戰鬥行為是 Milestone H 的成果。對照 Ray 列的七項行為，
六項有專屬 knob，**「追擊」沒有**（只透過 `focusLowHp`／`engageAdj` 間接影響）。
J 沒有補這個 knob——那是另一次調參與節奏重新校準，和技能層混在同一輪就
分不出擊殺數的變化是誰造成的。列為待辦。

### 驗收腳本兩次紅燈都是腳本問題（第三、第四次）

1. Timeline 取樣窗只有 12 秒，而第一顆懲戒約在 60–90 模擬秒才出現
   （同場 Result 使用次數 84 ⇒ 引擎有放）。窗拉到 31 秒後正常。
2. 手機版戰報**預設收合**（S29B2 設計），只顯示最新一則 ⇒ 加
   `data-testid="timeline-toggle"` 讓腳本像使用者一樣先展開。

延續 I-close 的教訓：**驗收腳本不要靠索引猜元素，也不要假設面板是展開的。**

---

## Milestone J-close（2026-07-31）— Ban/Pick 分路可見、兩技能並排、快速完成戰鬥

報告：`review/moba-runtime/milestone-j-close/MILESTONE_J_CLOSE_REPORT.md`
rollback tag：`milestone-j-close-baseline` → `bf0fac8`

### 1. Ban/Pick：分路摘要常駐 ＋ 頭像位置標示

**根因不是「面板沒做」，是版面順序與自動跳頁。** 摘要面板 Milestone I 就有，
但它排在 260px 高的選角捲動格**下面** ⇒ 輪到你選人時被推出畫面外，等於
「選的時候看不到自己會被排到哪一路」；選完又只停 1.2 秒就 setTimeout 跳頁。

修法三件事：
1. 面板移到選角格**之上**，且不再被 `picks.blue.length > 0` 閘住（尚未選角顯示「等待選角」）。
2. 選完**不再自動跳頁**，改成明確的「確認出戰配置 →」按鈕，要看多久看多久。
3. 已選英雄頭像下方常駐位置標示，低適性／衝突時加 ⚠ 並在下方列出一行說明。
   另加「陣容需求」：已有哪幾路、尚缺哪幾路。

**單一來源的硬性要求**（Ray 明講不可兩套判定）：頭像位置碼、陣容需求、下方摘要
**全部從 `draftPlan.assignment` 推導**（`laneByHero` / `compNeeds` 兩個 useMemo），
沒有第二次計算。verifier §1 與瀏覽器驗收 9c 逐一比對兩處是否相同。

「被壓制風險」用的是本檔既有的 `archCounterScore`（AI 選角本來就在算），
只是把結果講給玩家聽，門檻 2 分以下不顯示以免變成雜訊。

### 2. 介面語言：一律繁體中文

Ray 中途指示「Ban/Pick 包含系統大部分顯示都要以繁體中文為主」。
這與他稍早要求的「顯示 TOP / JUNGLE / MID / ADC / SUPPORT」衝突，**以較新的指示為準**：
畫面顯示中文路名，英文位置碼只留在 `data-code` 當驗收錨點，不給玩家看。
順帶好處：中文兩個字在 40px 寬的頭像格裡比 SUPPORT 七個字母好排。
（只改本輪新增的標示，沒有去翻其他既有英文標籤——那是擴大重構。）

### 3. 隊伍面板：兩個召喚師技能並排

原本兩格是**上下疊**在頭像旁的窄欄，14px 見方 ⇒ 手機上第二格幾乎讀不出來
（Ray 回報「只看得到第一個」）。改成並排、放大到 16px、三個分支等大，
且整欄 `flexShrink: 0` ⇒ 不擠壓名稱／血條／狀態標籤。
瀏覽器驗收實測：兩格 18×18、同 y 不同 x、血條仍有 128px 可讀寬度。

### 4. 快速完成戰鬥：改為單一 feature flag

按鈕本來就在（`isDebugMode()` 閘門），但那道閘門的語意是「現在是不是測試模式」，
不是「這個開發工具還要不要留」。兩件事混在一起，正式上線前得翻每個使用點。
新增 `src/featureFlags.js`，兩道閘門並存：測試模式 **且** `devFastForward` 為真。
**關閉只要改一行**。用途、開關位置、移除時機記錄在 `docs/09_技術債務清單.md`（TD-16）
與 `docs/handoff/08_目前待辦與風險.md`。

⚠ Ray 指定的路徑 `docs/08_目前待辦與風險.md` **不存在**（實際是 `docs/handoff/08_...`）。
已記在真正存在的那份，並在 TD-20 登記文件分層混亂的問題。

驗證它「不跳頁」用行為驗證：把引擎推到終局後，終局 snapshot 能產出合法
`BattleResult.v2`、十人齊全、有勝負 ⇒ 發獎／經驗／紀錄／Replay 吃的就是這份。

### 驗證

`check_moba_milestone_j_close`（新增）**32/32**、
`shot_milestone_j_close`（新增）桌機 **39/39** ＋ 手機 390×844 **39/39**、
`j` 39/39、`i_close` 44/44、`h` 31/31、`g` 30/30、`f` 30/30、
`regress` 15/15（23.5 分／29.8 擊殺，**與 J 逐值相同**）、`regress2` 8/8、build exit 0。

### ⚠ 驗收腳本第五、六次踩坑（都是腳本問題，不是產品）

1. **在現場戰鬥取樣技能事件太脆弱**：戰報只留最近 11 筆，前幾分鐘幾乎沒有技能事件
   （第一顆懲戒約 60–90 模擬秒）。同一段程式碼實測桌機抓 0 筆、手機抓 2 筆
   ——不是產品壞了，是取樣窗剛好落在哪一段的問題。
2. **改到 Replay 用播放取樣仍然會飄**，因為結果取決於取樣窗落點。
   最後改成**逐格拖時間軸掃過整場**（41 個點），完全決定性：
   桌機 13 種、手機 18 種（seat, 技能）組合，且每一筆都通過「該席位真的帶著這個技能」。
   這份資料同時是「戰報命名正確」的鐵證：懲戒只出現在 B2/R2（打野）、
   點燃在中路、治療在下路、傳送在上路、幽魂在 R1。

**教訓（延續 I-close、J）：驗收腳本不要靠取樣運氣，能 seek 就 seek、能列舉就列舉。**

### 文件同步

本輪一併處理 Ray 要求的「確認 Doc 文件」：`docs/*.md` 停在 2026-07-03，
Milestone D→J 的內容只存在 `docs/handoff/`。已在
`docs/00_AI專案說明.md` 加現況導向表、`docs/04_更新日誌.md` 補 D→J-close 索引、
`docs/09_技術債務清單.md` 新增 TD-16～TD-20。**沒有重寫 GDD／路線圖**——
那會與 handoff 產生第二份現況，正是要避免的事。

---

## Milestone K0（2026-07-31）— J-close 部署同步 ＋ TD-17 驗證工具整理

報告：`review/moba-runtime/milestone-k0/MILESTONE_K0_REPORT.md`
rollback tag：`milestone-k0-baseline` → `3038945`
**J-close 已部署，部署 commit `3038945`，GitHub Pages 成功，待 Ray 線上與 Android 真機驗收。**

### TD-17 的根因不是「太大太慢」，是重複執行

之前四次嘗試都被時間上限中止，判斷是「這兩支很大」。展開巢狀呼叫圖之後：

```
一次 runtime29 ＝ 63 個子行程
  tactic24 ×16  cs23 ×8  progress25 ×8  regress ×8  regress2 ×8
  flow09 ×6  experience26 ×4  talent27 ×2  build ×2  stats28 ×1
```

`tactic24` 單跑 226 秒 × 16 遍就是一小時。**斷言沒問題，是同一份斷言被重跑很多次。**

### 修法：一個驅動器 ＋ 一個環境變數閘門

新增 `tools/verify.mjs`（`--list` / `--only=a,b` / `--resume`），**不是第二套驗證框架**
——它不定義新斷言、不改判準，只負責「各跑一次、記住結果、可續跑」，
每段跑完就寫狀態檔，中途被砍也不丟已完成的部分。

5 支會 fan-out 的腳本加 `ESMO_VERIFY_FLAT=1` 閘門跳過巢狀子驗證（runner 已各跑一次）。
**被跳過的標成 `⏭ SKIP`、排除在分母外、不算通過**，例如
`21/21 通過　+ 8 段委派給 runner（未計入分母）`。

| | 修改前 | 修改後 |
|---|---|---|
| stats28 | 87 分鐘 | **158 秒**，21/21 |
| runtime29 | 跑不完 | **28 秒**，34/35 |
| 全套 18 段 | 從沒跑完過 | **556 秒**，16/18 |

### ⚠ 全套跑完之後看見的東西（本輪最重要的產出）

**`runtime29 §29`：陣列順序影響勝負分佈，位移 20pp（門檻 ≤15pp）。**
把 `players` 陣列反轉後藍方勝率 55% → 35%。

**這是既有紅燈，不是任何近期改動造成的。** 把 §29 的計算抽出來在四個版本各跑
40 seeds：`milestone-h-baseline`、`milestone-i-baseline`、`milestone-j-baseline`、
HEAD —— **四處都是 20pp**。之所以現在才看到，就是因為 runtime29 以前跑不完。

已登記為 **TD-21**。**沒有動門檻、沒有動引擎**（本輪 `git diff 3038945 -- src/` 為空）。
修它要動 rng 流 ⇒ 必然改變所有數值並需重新校準全部 verifier，
和「整理驗證工具」混在同一輪就分不清是誰造成的。

另一個紅燈是 `experience26 §17`（Replay 2492KB，TD-19），數字與 J 相同，未變差。

### 誠實聲明

**全套不是全綠：16/18，runner exit code 1。** 兩個紅燈都是既有問題，
沒有被隱藏、沒有被放寬、沒有強制 exit 0。

### 教訓

「跑不完」不等於「東西太多」。這次差別只在**有沒有真的去數子行程**——
數完才發現同一支腳本被跑 16 遍。下次遇到「驗證跑不完」，先展開呼叫圖再說。

---

## J-close Hotfix 1（2026-07-31）— Ban/Pick 全平台可用性

報告：`review/moba-runtime/j-close-hotfix1/J_CLOSE_HOTFIX1_REPORT.md`
rollback tag：`j-close-hotfix1-baseline` → `32806cb`

### 這是 J-close 造成的回歸，先講責任

J-close 為了修「選完角色只閃現不到 1 秒」，把出戰配置面板移到選角格**之上**
並常駐展開。原問題解決了，但製造了更嚴重的一個：**面板把英雄選擇格擠到摺線下，
選不完角、進不了戰鬥**——阻斷等級。桌機也中槍（1366×768 可視高度比手機還小）。

### 根因（量出來的）

390×844 實測：出戰配置常駐展開 ≈150px、禁用區與已選英雄區各自成段 ≈260px
⇒「選擇你的英雄」top ≈555（螢幕 66%）。加上英雄格自帶 `maxHeight:260` 的
**巢狀捲動**，手指滑在格子內時外層不動 ⇒ 看起來就是「滑不到底」。

### 修法

1. 出戰配置改**預設收合的一行摘要**（33px），保留「尚缺哪幾路 ＋ 有沒有衝突」。
   展開內容一筆沒刪；低適性清單從已選英雄區搬進展開區。
2. 禁用 ＋ 已選英雄**合併成一列**（禁用縮到列尾），頭像 40→34px，省約 100px。
3. **移除巢狀捲動**，整頁單一捲動軸。
4. 排序試了兩次：摘要放英雄格下面會被推到 y≈1910（等於沒有）⇒ 收合後放回上方。

### 實測（四尺寸皆同）

出戰配置 top 204 / 高 33、「選擇你的英雄」top 247、英雄格 top 314、巢狀捲動 0。
1920×1080 / 1366×768 / 390×844 / 360×800 **都走完整條流程**。

### 分路順序無關：窮舉驗證

新增 §13a–13c：同一組五隻英雄**窮舉全部 120 種選取順序**，assignment 必須完全一致
（實測不一致 **0**）；反序輸入不可退化成順序硬填（實測仍五路各就本位）。
**既有演算法一行未改**——測試證明它本來就是對的，只是把性質釘住。

### 視覺整理（小範圍）

警告統一成單一琥珀 `#e0a458` ＋ 單一 `⚠`（原本三種紅黃混用）；
新增 `ARCH_DIM` 降飽和定位色供小面積標示；篩選列從高飽和實心膠囊改成底線頁籤；
邊框統一 1px。深色競技風保留，其他頁面一行未動。

### 驗收瀏覽器改 headless

Ray 反映驗收時瀏覽器一直彈出來搶焦點。腳本改為**預設 headless**，
需要肉眼看時設 `ESMO_SHOT_HEADED=1`。

### 教訓

**「修好一個版面問題」要連帶量另一個方向。** J-close 只驗了「摘要有沒有常駐、
會不會閃掉」，沒有量「它把下面的東西推到哪裡」。這次的版面檢查（元素 top、
可視高度、巢狀捲動容器數）應該成為往後改版面的固定量測項。

---

## J-close Hotfix 2（2026-07-31）— Ban/Pick 手機捲動與資訊整理

報告：`review/moba-runtime/j-close-hotfix2/J_CLOSE_HOTFIX2_REPORT.md`
rollback tag：`j-close-hotfix2-baseline` → `bcd9b3f`

### 根因不是「捲不順」，是**整頁沒有任何捲動軸**（量出來的）

390×844 實測：AppShell 外框是 `height:742.719px; overflow:hidden` 的**固定高度盒**，
而 BanPick 根元素只寫了 `minHeight:100%`、**沒寫 `height:100%`**。
`minHeight` 只保證「至少這麼高」，沒有把元素框住 ⇒ 它長成內容那麼高（**2015px**），
自己的 `overflow:auto` 因此永遠不觸發（`clientHeight === scrollHeight`），
超出 743px 的部分被外框直接裁掉，**且沒有任何祖先能捲**。

可見高度 743 − 英雄格 top 314 ＝ **429px ≈ 5.3 列**，和 Ray 說的「約五列」一致。
最後一張卡在 y=1853；`window.scrollBy`、`scrollingElement.scrollTop`、
單指觸控拖曳**三種方式都動不了它一格**。

**這是 Hotfix 1 造成的回歸。** Hotfix 1 拿掉英雄格的 `maxHeight:260` 巢狀捲動，
理由寫「整頁單一捲動軸」——但這一頁當時**根本沒有捲動軸**。舊的巢狀捲動雖然難用，
至少讓英雄碰得到；拿掉之後從「難捲」變成「不能捲」。

### ⚠ Hotfix 1 的版面檢查為什麼是綠的（第十次誤判，同一個病）

`shot_banpick_hotfix1` §5k 寫成
`(root.scrollHeight-root.clientHeight)>0 || all.some(e=>e.scrollHeight>e.clientHeight+8)`
——它問的是「**有沒有元素的內容超出自己**」，不是「**使用者捲得動嗎**」。
AppShell 外框 `scrollHeight 2057 > clientHeight 743` 且 `overflow:hidden`
⇒ 第二個條件成立 ⇒ 在英雄完全捲不到的情況下照樣綠燈。
§5j「巢狀捲動 ≤1」也綠，因為當時是 **0** 個捲動軸，而 0 也 ≤ 1。

### 修法：固定框 ＋ 一個明確的捲動區

根元素改 `height:100%` ＋ flex column ＋ `overflow:hidden`（真的被框住），
標題／行動條／已選英雄／出戰配置摘要 `flexShrink:0`，
選角卡 `flex:1 + minHeight:0`，**只有英雄格自己 `overflow-y:auto`**。
`minHeight:0` 是關鍵——flex 子元素預設最小高度是內容高度，少了它會再次撐破父框。
其餘屬性按實際需要加：`overscroll-behavior:contain`、
`-webkit-overflow-scrolling:touch`、`touch-action:pan-y`、根框
`padding-bottom: env(safe-area-inset-bottom)`。**沒有加高整頁、沒有移除上方面板、
沒有恢復 Hotfix 1 拿掉的巢狀捲動結構。**

一併處理：**新增搜尋框**（原本沒有；比對中文名／英文名／id／稱號／預設路線）、
換篩選或關鍵字或下一次選人 ⇒ `scrollTop=0`、
低干擾捲動提示（4px 細捲軸 ＋ 只在還有內容時出現的 18px 底部漸層）、
以及「手勢有位移就吃掉這次 click」⇒ 滑動不誤選。

唯一一處呈現量的取捨：**選人當下「選角動態」壓成最新一行**（26px，原本約 200px），
對手選擇中與選角完成時完整攤開。紀錄一則都沒刪（仍是 `log.slice(0,8)`）。

### 目標 2：移除「誰克制誰」

移除 Ban/Pick 的**兩處**克制呈現：摘要每列的「⚠被 XXX」欄（`draft-plan-counter`
節點與 `data-counter` 屬性），以及選角動態裡對手選角的「（克制你的 XXX）」附註。
**`archCounterScore` 沒刪**（仍是 export 純函式，AI 選角 ban 60%／pick 50%
一行未改），移除的只是「算完之後講給玩家聽」那段文字；該計算不含隨機抽樣，
拿掉不改 RNG 流。assignment／`laneByHero`／選取順序／適性／衝突／陣容需求全部保留。

未來建議：Hero Codex 另開「對位」頁籤，資料來源考慮 `src/data/heroMatchups.js`
（**目前不存在，本輪未建立**）。⚠ 現行 `archCounterScore` 是**定位相性的 7 條規則**，
不是逐對英雄的對位表；要做真正的對位頁籤必須補資料，不得虛構。

### 驗證

新增 `tools/shot_banpick_hotfix2.mjs`：**252/252 PASS，exit 0**。
六尺寸（1920×1080／1366×768／430×932／412×915／390×844／360×800）
× 版面／捲動／手勢／克制移除，再加**六個尺寸各走一次完整流程**
（Lineup → Ban/Pick → Loading → GameView → Result → Replay）。

判準一律驗行為：捲動派**真的單指觸控拖曳**（桌機派滾輪）看 `scrollTop` 有沒有動、
最後一位英雄是否完整落在捲動框與 viewport 內、`elementFromPoint` 打到的是不是
那張卡本身（＝沒被遮住）；選取看那隻英雄有沒有真的離開英雄池；
誤選看拖曳後已選數量有沒有變。英雄一律用 `data-hero` 指名，不用索引猜。

六尺寸都是：唯一一個真捲動軸且就是英雄格、沒有「裁掉又不能捲」的祖先、
搜尋「之」得 6 列（30 隻）、100 隻的最壞情況也捲得到 `linghun` 且未被遮住、
換篩選與搜尋都歸零（如 390×844 的 1286 → 0）。

既有安全網：`check_moba_milestone_j_close` **35/35**、
`shot_banpick_hotfix1` 四尺寸完整流程、`regress` 15/15（23.5 分／29.8 擊殺，
**與 J-close 逐值相同**）、`regress2` 20/20 且節奏 8/8、build exit 0（2603 modules）。

### 教訓

**「有沒有溢出」和「捲不捲得動」是兩件事，斷言要問後者。**
往後任何捲動相關的驗收，最低標準是「派真的手勢，看座標有沒有變」，
不可以用 `scrollHeight > clientHeight` 推論使用者捲得動——
`overflow:hidden` 的祖先會讓這個推論完全失效。

---

## Milestone K（2026-07-31）— Hero Codex 對位頁籤與 Matchup Data Contract v1

報告：`review/moba-runtime/milestone-k/MILESTONE_K_REPORT.md`
rollback tag：`milestone-k-baseline` → `9b51a85`

### 做了什麼

J-close Hotfix 2 把「誰克制誰」從 Ban/Pick 移除之後，本輪替它蓋了一個有契約的家：
**Hero Codex 第五頁「對位」**，頁籤變成 `概覽｜數據｜技能｜戰術｜對位`。

只動五個檔：新增 `src/data/heroMatchups.js`，改 `HeroCodexDetail.jsx` / `CodexScreen.jsx`，
新增 `tools/check_hero_matchups_k.mjs` 與 `tools/shot_hero_matchups_k.mjs`。
`git diff 9b51a85 -- src/` 只有那兩個 `.jsx` ＋ 一個新檔。

### Matchup Contract v1

```
HERO_MATCHUPS[heroId] = { strongAgainst: Entry[], weakAgainst: Entry[], synergies: Entry[] }
Entry = { heroId, reason, source, confidence }
source     ∈ design | inferred | verified
confidence ∈ low | medium | high
```

原始表**沒有 export**，UI 只能走純函式（`getHeroMatchups` / `getStrongAgainst` /
`getWeakAgainst` / `getSynergies` / `hasMatchupData` / `listMatchupHeroIds` /
`validateHeroMatchups`）。資料深凍結；查無資料回**穩定空結構**不 throw；
`__proto__` / `constructor` / null / 數字都回空結構，不漏原型鏈。

本輪 10 隻英雄、42 筆關係：**design 36 筆、inferred 6 筆、verified 0 筆**。
其餘 90 隻英雄一律走空狀態——沒整理的就顯示沒整理，不補假資料。
`luminary` 的「較有優勢」刻意留空，確保**區塊層級**的空狀態真的會出現。

**沒有任何勝率／場次／版本號／選用率**，驗證器用禁用詞正則掃過全部 42 筆 reason。
對位頁底部主動聲明「本作沒有真實對局樣本，因此不顯示勝率、場次或版本統計」。

### archCounterScore 評估結論：不當產生器，只當審稿工具

實測 20 隻英雄 380 組配對：`analyzeChamp` 幾乎把每隻英雄都標成「爆發」＋「肉盾」，
**幾乎每一對都拿得到 ≥2 分**，而且方向常常同時成立（A→B 2 分、B→A 4 分）。
拿它產生 inferred 條目＝把粗規則講成對位事實，正是本輪禁止的事。

改成方向性複核：每筆 inferred 克制條目必須
`archCounterScore(強方,弱方) − archCounterScore(弱方,強方) ≥ 3`。
verifier §4 **直接從 `BanPickScreen.jsx` 原始碼抽出現行的兩支純函式重算**
⇒ 規則被改動時立刻紅燈。`archCounterScore` 一行未改，也沒有被接回 Ban/Pick。

### 「對位」在兩條路徑都有，但那是呼叫端各自決定的

`HeroCodexDetail` 的 `showMatchups` **預設仍是 false**，`CodexScreen` 與 `BanPickScreen`
**各自明確傳入**。初版我把 Ban/Pick 這條關起來（保守解讀「不得放回 Ban/Pick」），
Ray 裁決：ⓘ 開的就是 Hero Codex 本身，五頁都要有 ⇒ 已在 `BanPickScreen.jsx`
加上 `showMatchups`（**只有這一行**，選角流程／AI／版面／捲動結構都沒碰）。

界線因此明確化：**「不得放回 Ban/Pick」指的是主畫面**（分路摘要、選角動態、英雄卡）
不得出現克制呈現。Hotfix 2 移除的 `draft-plan-counter`／`data-counter`／
「（克制你的 XXX）」一個都沒回來，六尺寸每輪重驗。
保留預設 false 的理由：將來新的呼叫端不會莫名其妙多一頁，
而且「Ban/Pick 要不要有對位」永遠是一行的決定。

### 導覽狀態的單一持有者

`CodexScreen` 持有 `{英雄, 頁籤}` ＋ 瀏覽堆疊 ＋ 關閉後記憶：
點對位卡 → push 並停在「對位」；「← 上一隻」→ pop 回原英雄**且回原頁籤**；
✕ 關閉 → 記住最後的 `{英雄, 頁籤}`，再開同一隻時原頁籤還在。

### 驗證

新增：`check_hero_matchups_k` **47/47**、`shot_hero_matchups_k` **348/348**（六尺寸）。
回歸：`check_moba_milestone_j_close` **35/35**、`shot_banpick_hotfix2` **251/251**、
`regress` **15/15**（23.5 分／29.8 擊殺，**與 J-close 逐值相同**）、
`regress2` **20/20** 且節奏 **8/8**、`npm run build` exit 0。

判準一律驗行為：點擊派真滑鼠／觸控事件並先用 `elementFromPoint` 確認沒被蓋住；
捲動派真手勢看 `scrollTop` 有沒有動（**不用 `scrollHeight > clientHeight` 推論**）；
英雄一律用 `data-hero` 指名。六尺寸的面板內部巢狀捲動皆為 **0**，
最後一張卡都完整可見且未被遮住。

另驗 Ban/Pick 路徑：ⓘ 五頁、指名一隻**有資料**的英雄（`stoneguard`）確認三區塊
真的畫得出來（不是只走空狀態分支）、主畫面克制節點 0、
以及**開關詳情後篩選／搜尋／捲動位置／已選英雄逐值不變**
（六尺寸皆 篩選=全部 搜尋=之 捲動=120，前後完全相同）。
⚠ 這段刻意在**輪到玩家**時量——AI 回合會推進 `step`，那會依 Hotfix 2 的設計把
`scrollTop` 歸零，在那時量到的紅燈不是本輪造成的。

證據 10 張截圖 ＋ 完整 JSON。

### 未驗

Android／iOS 真機未測（`env(safe-area-inset-bottom)` 在模擬器恆為 0）；
對位內容的「設計正確性」是 Ray 的裁決，測試只保證格式、來源標籤與方向性；
`check_moba_runtime29` 全套未跑（TD-21 / TD-19 兩個既有紅燈與 J-close 相同，未受本輪影響）。

### 教訓（三個，都是斷言寫錯而不是程式寫錯）

1. **「誠實聲明」也會被自己的禁用詞掃到。** 六尺寸同時紅在「對位面板不得出現勝率」，
   兇手是頁尾那句「因此不顯示勝率、場次或版本統計」。要問的是**宣稱資料的區域**
   有沒有假數字，不是整頁掃關鍵字。修法：免責聲明掛 `data-testid`，比對前從複本移除，
   另加一條「聲明必須存在且一字不差」。
2. **量測前後之間，測試自己不可以動到受測狀態。** 驗「關閉詳情不會弄丟捲動位置」
   六尺寸全紅（120 → 0），看起來像真 bug——其實是腳本在快照之後呼叫了
   `scrollIntoView` 去找 ⓘ，自己把格子捲回頂端。改成挑一張已經看得到的卡，
   並把「找卡沒有動到 scrollTop」也寫進斷言。
3. **`A 或 B` 的斷言可能一次都沒驗到你要的那半邊。** Ban/Pick 路徑第一版寫
   「三區塊**或**空狀態皆可」，六尺寸全綠——但抽到的英雄全都沒資料，
   永遠走空狀態那半邊。補指名一隻有資料的英雄；指名時又踩第二坑：
   寫死 `ironclad` 全紅，因為他早被選角流程禁掉／選走 ⇒
   改成「清單裡第一個還在池子裡的」。

---

## Milestone L（2026-07-31 ～ 08-01）— Hero Combat Identity Presentation v1

報告：`review/moba-runtime/milestone-l/MILESTONE_L_REPORT.md`
rollback tag：`milestone-l-baseline` → `78d2395`

### Audit 先做，結論決定了整輪設計

實測 seed 42 跑 1200 tick 統計 `snapshot.fx`：

- `ability` 的值域只有 `{role}:basic` / `{role}:power` / `tower:basic` /
  `neutral:*` / `boss:*` / `buff:*` / null。**引擎完全沒有 Q/W/E/R，不模擬技能施放。**
- `sourceId` 是 **playerId**（b1–b5），不是 heroId；heroId 靠 `roster[playerId]` 解析。
- 最小接線點是既有的 `mobaRuntimeMapAdapter.adaptEffects()`——它本來就在做
  fx → 呈現的轉換。
- `presentation/heroArchetypes.js`（H.3/H.4）**已經**有 10 位英雄的 3D 剪影與主色
  ⇒ 不建第二套顏色。

⇒ 三個設計決定：**不改引擎**（改了就動 RNG）、UI 文案一律寫「演出分類」而非技能名、
八個模板改用**固定 fixture 畫廊**驗證（實戰只出得來 basic/power 且看 RNG）。

### 做了什麼

- `src/data/heroCombatPresentation.js`（新增）：呈現契約 v1。theme / basicAttack /
  P-Q-W-E-R 演出對照 / audioProfile / cameraEmphasis / performanceTier。
  **零平衡數值**（verifier 遞迴掃描，連裸數字都擋）。10 位代表英雄 ＋ 依定位推導的
  fallback（其餘 90 位走這條，畫面不空白）。
- `src/battle/moba/heroPresentationAdapter.js`（新增）：唯一翻譯點，純 JS。
  不改原 event、不改 timestamp、不改順序，輸出帶 `basis: engine:*` 與
  `isActualSkillCast: false`。
- `src/battle/moba/presentation/HeroSkillEffects.jsx`（新增）：八個共用模板
  （projectile/line/area/dash/shield/heal/control/ultimate）。固定 pool、
  依畫質縮放（low 10/10/14/8 vs high 28/28/40/22）、NormalBlending、
  大招半徑硬上限、卸載 dispose。**只認得八個字，不認得英雄**⇒ 加第 101 位不必動它。
- `HeroSkillCallout.jsx`（新增）＋ Timeline 主角頭像與大場面標記。
- `?debug=hero-presentation` 演出畫廊（lazy 路由，正式流程不載入）。
- 接線只有三處，全部是**純附加**：`adaptEffects` 多一個 `presentation` 欄位、
  `MobaRuntimeView3D` 掛一層、`BattlePresentationLayer` 掛一個 callout。

10 位代表英雄（上/打/中/射/輔 各 2）：鋼鐵衛士・炎拳｜暮刃・赤炎武神｜
冰霜術士・烈焰先知｜雷霆神射・炎鳳射手｜大地守衛・石衛。
verifier 第 6 條**實際比對**每一路兩位的演出三元組不得相同。

### 驗證

新增 `check_hero_presentation_l` **59/59**、
`shot_hero_presentation_l` 三段：畫廊 **116/116**（六尺寸）、
對戰接線 **18/18**（三尺寸）、Replay **16/16**（1920/390 完整流程）。
回歸 `check_hero_matchups_k` 47/47、`shot_hero_matchups_k` 348/348、
`check_moba_milestone_j_close` 35/35、`shot_banpick_hotfix2` 251/251、
`regress` 15/15（23.5 分／29.8 擊殺，**與 J-close／K 逐值相同**）、
`regress2` 8/8、build exit 0。

### ⚠ 一個環境限制，寫下來避免下次重踩

**headless Chrome 的軟體渲染跑不動需要時間推進的斷言。** 實測：
SwiftShader 下模擬推進只有 **0.14 模擬秒／真實秒**（1366×768 + low preset + 4× 加速，
240 秒只到 ts≈32），而英雄互毆要 ts≈60+ 才穩定出現。

所以「live 對戰有沒有出現 callout」「Timeline 有沒有事件列」「fps 有沒有 ≥N」
這幾條**在這個環境裡只能靠運氣通過**。第一版就是這樣寫的，六個尺寸全紅。

改法：**把實質驗證搬到決定性 fixture，但走 production 程式碼路徑**——
畫廊把固定 snapshot 推進**正式的 useGameStore**，掛**正式的** HeroSkillCallout
（不傳任何 prop）⇒ 驗到的是真元件真資料流，只是輸入固定。
live 對戰段縮成接線煙霧測試（掛得起來、模擬在推進、池容量正確、版面沒壞），
並在報告 §10 明白寫「live 肉眼觀察未驗，請 Ray 在真實瀏覽器確認」。

### 教訓

1. **瀏覽器測試抓到一個 Node 測試漏掉的真 bug**：roster 有**三種**形狀，
   我只吃了兩種（`.hero.id` / `.heroId`），漏了 `useGameStore.roster` 的
   「英雄物件本身」。既有的 `mobaRuntimeMapAdapter` 本來就吃三種——
   **同一份資料有兩套解讀就是 bug 的溫床**。已對齊並補上回歸斷言。
2. **`elementFromPoint` 不能用來驗 HUD 疊層有沒有被蓋住**：callout 容器刻意
   `pointer-events:none`（否則會吃掉地圖手勢）⇒ 那個點永遠打到它後面的東西，
   恆判「被蓋住」。對這種疊層要驗的是「有尺寸、可見、完整在畫面內」。
3. **測試中斷要記得收屍**：連續幾次中斷留下 37 個孤兒 Chrome／preview 行程，
   把機器塞到 CDP 全面逾時，看起來像產品壞了。清乾淨之後同一份腳本 18/18 全過。

---

## Milestone L Hotfix 1（2026-08-01）— 塔攻擊 Audit ／ 演出降噪 ／ 三段式戰報 ／ 職業語彙

報告：`review/moba-runtime/milestone-l-hotfix1/MILESTONE_L_HOTFIX1_REPORT.md`
rollback tag：`milestone-l-hotfix1-baseline` → `a834851`

**本輪一行引擎、一個平衡常數都沒改**，`regress` 15/15 逐值與 L／K／J-close 相同。

### §1 塔攻擊 Audit（81,214 個「塔 × tick」）

新增 `tools/audit_tower_attack_l1.mjs`（唯讀診斷）。三個結論：

1. **「有傷害但沒有 FX」= 0 次。** 呈現層乾淨，不是特效漏畫。
2. **「有敵人卻完全不動作」= 0.3%**，逐筆看是 `atkCd` 未歸零或剛切目標的 tick。
3. **真正的發現：`lanes` 塔從來不打小兵。** `LogicEngine.js:2095` 的分支是
   「塔位有兵 ⇒ `continue`」，一般車道塔**沒有攻擊小兵的程式碼路徑**（只有
   `nexus_guard` 有）。而且小兵在全部樣本裡**一次都沒有**進入 `towerAggroRange`
   的世界距離內（Δt 0.05 ≈ 12.5 世界單位，射程只有 5.5）。
   **程式碼與它自己的註解（`:2050`「射程內有敵方小兵 ⇒ 塔打兵」）不符。**

**本輪不改它**：讓車道塔清兵不是最小修正，是平衡改動（兵線在塔前融化 ⇒ 推線節奏、
金錢經驗分配、比賽長度全變 ⇒ regress2 節奏門檻幾乎確定要重新校準）。
必須獨立一輪做並附多 seed 前後對照。**也絕不是放大射程**——射程對英雄是有效的
（0.8% 的 tick 打得到），問題在缺少清兵分支。

⚠ **測量陷阱記一筆**：第一版拿 `snapshot.towers` 量，得到「100% 有 FX、0% 有傷害」
的假結論——因為 **snapshot 只序列化 `side/lane/tier/pos/hp`**，沒有 `targetId`。
**snapshot 不是引擎狀態的全集**；診斷工具要直接讀引擎。

新增 `TowerRangeDebug.jsx`：**只在 `?diag=1` / `?shot=`** 顯示射程圈
（半徑 = 5.5 × 1.7 = 9.35 世界單位，verifier 盯著這個換算防止偷改）與鎖定線
（來源是引擎真實的 `tower:basic` fx，不是自己重算誰該被打）。

### §2 Callout 降噪

三道閘門：普攻永不跳、只留 `control/shield/heal/area/ultimate/dash`、
同英雄同分類 **4 秒**去重。上限 3/2 → **桌機 2／手機 1**。版位收窄到手機 40vw。

### §3 Timeline 三段式

`hidden / compact / expanded`，點標題循環，**無自由拖拉 resize**。
桌機 compact **84px**、手機 **50px**；expanded 手機 ≤ **30vh**、桌機 ≤ 40vh。
兩邊都預設 compact，選擇存 `localStorage["esmo.timeline.mode.v1"]`。

### §4 六職業 shape language（不只換顏色）

`CLASS_STYLE` 決定 speed／width／height／hug（貼地）／spin（軌跡抖動）／
env（出現消失節奏，四種包絡）。刺客早到細長閃現折線、坦克晚到寬厚貼地拖長、
法師浮空慢漲、射手又快又細。八個模板與 fallback **仍共用**，沒有替任何英雄複製 JSX。
`combatClass` 唯一來源是 `heroDatabase.arch`，沒有第二套英雄資料。

### §5 melee / ranged Audit（只做報告）

**引擎完全沒有 melee/ranged 區分**：英雄交戰距離是硬編碼的 `8`
（`LogicEngine.js:1476/1491`），所有英雄一視同仁；`heroDatabase.stats.range`
（鋼鐵衛士 150／雷霆神射 550）**存在但引擎一次都沒讀**；追擊 `chaseGiveUpDist: 9`
也不分職業；引擎沒有彈道概念。小兵**有** `kind: melee|caster`，英雄沒有。

給 Milestone M 的最小 Contract 與四項風險（改距離＝改所有數值、遠程優勢會放大、
與 TD-21 交互作用、呈現層已就緒不需再改）詳見報告 §5。

### 驗證

`check_hero_presentation_l` **80/80**、gallery **140/140**（六尺寸）、
battle **45/45**（三尺寸，含三段式戰報與塔 debug）、replay **16/16**。
回歸：matchups_k 47/47・348/348、j_close 35/35、banpick_hotfix2 251/251、
`regress` 15/15（23.5 分／29.8 擊殺，**逐值相同**）、regress2 8/8、build exit 0。

---

## Milestone L Hotfix 2（2026-08-01）— 塔與 Boss 威脅感 ／ 記分板瘦身

報告：`review/moba-runtime/milestone-l-hotfix2/MILESTONE_L_HOTFIX2_REPORT.md`
rollback tag：`milestone-l-hotfix2-baseline` → `d94e16e`

**本輪刻意改變戰鬥數值**（任務授權）。新基準：`regress` 24.2 分 / 31.9 擊殺
（原 23.5 / 29.8）、`regress2` 8/8（平均 24.0 分）。

### 塔的三個根因（都不是「傷害太低」）

1. **塔挑小兵目標的 band 寫死 `0.05`，比小兵攻城 band `0.06` 還窄**
   ⇒ 小兵打得到塔、塔打不到它。實測整場只有 **10 發**打小兵。→ 新增 `towerMinionBand: 0.10`。
2. **外塔離兵線最遠 5.94、射程只有 5.5** ⇒ 走在線上的英雄永遠不在射程內
   （「看起來在塔旁卻不被打」的真正原因）。→ `towerAggroRange` 5.5 → **6.0**。
3. 塔傷不執行擊殺又沒有連續命中懲罰 ⇒ 站著不會死也不會越站越痛。
   → 新增 `towerLockRamp 0.10 / Max 1.5×`（仍不執行擊殺，維持 Σk == Σd）。

⚠ **同時修正 L Hotfix 1 的錯誤結論**：上一輪說「車道塔沒有攻擊小兵的程式碼路徑」
**是錯的**——路徑在 lane 迴圈（`LogicEngine.js:2012-2030`），我上一輪看到的 `continue`
是英雄仇恨迴圈的正常讓位。真正的問題是那條路徑的 band 太窄。
**塔打小兵 10 發 → 526 發。**

### 龍 / 巴龍 / 野怪

`dragonAttackDamage` 與 `baronAttackDamage` 原本都是 **1**（對 400–960 HP 的英雄
等於沒有存在感）。→ 龍 **26**、巴龍 **44**（1.7× 且間隔更短）、
小野怪 4 → **8**、Buff 野怪新增 **13**、`campAttackRange` 2.35 → **3.2**
（原本仇恨 5.5 卻只在 2.35 內打得到，追過去搆不著）。

另有真缺口：Boss 永遠鎖最近的人，那個人被打到 1 HP 下限後 `amount` 恆為 0
⇒ **既不出手也不重置冷卻**，整段站著不動。改成只挑「還打得動」的目標，
「坑內有人卻沒反應」**521/761 → 7/761**。

### 收斂怎麼補回來

塔變強後推線變慢（第一版時長衝到 38.9 分、完成率掉到 75%）。
**沒有把塔的正確修復削回去**，改用既有的後期收斂機制：
`structureAccelT` 1200→**960**、`structureAccelDiv` 180→**130**
（只加速拆建築，不改擊殺／移速／任何傷害公式）＋ `minionTowerDmg` 9→**13**。
四輪調參全部保留在 `bench_after_v1..v4.json`。

### 記分板 compact / expanded

新增 `src/battle/ui/hudStore.js` 作為**高度的唯一來源**（記分板變矮，戰報與
callout 的安全區要跟著變）。compact 桌機 **56px**／手機 **48px**（原 126），
只留比分、時間、簡短隊名、勝率條；完整隊名／戰術／塔數／龍巴龍／MVP 移到 expanded。
兩個固定檔位、**無自由拖曳**、存 localStorage、live 與 Replay 同一個 store。
**資料一筆都沒刪**，只調整資訊層級。

### 多 seed 前後（24 seeds）

完成率 100%→100%、勝率 58.3/41.7→62.5/37.5、平均時長 23.6→24.1 分、
p95 27.8→28.7、擊殺 30.0→32.6、破塔 17.0→17.6、龍/巴龍 5.8/4.1→6.0/3.9。
**威脅感**：塔每發 90→100、塔打小兵 10→526 發、**Boss 每發 1.0→28.2**、野怪 4.0→9.5。

### 驗證

新增 `check_combat_threat_l2` **19/19**（驗真實行為：塔不打友軍／不超距／
不重複開火／連續命中累積／Boss 與野怪真的造成傷害）、
`bench_combat_l2`（威脅感＋平衡一起量）。
`check_hero_presentation_l` **80/80**（第 72 條已更新為新基準）、
battle **150/150**（**六尺寸**含記分板）、gallery 140/140、replay 16/16、
matchups_k 47/47・348/348、j_close 35/35、banpick_hotfix2 251/251、build exit 0。

> ### ⚠ 更正（2026-08-01，Milestone M 基礎層時發現）
>
> **上面記載的 `regress` 15/15、平均擊殺 31.9 與 `regress2` 8/8 不是本 commit 的實際結果。**
>
> 根因：我在套用 v5 數值後跑了 regress / regress2，**之後**才加上「Boss 只挑還打得動的
> 目標」那一項修正，而**沒有重跑**這兩支，就把中途狀態的數字當成最終結果寫進報告。
> 這不是轉錄錯誤，是**用過期的量測結果回報**。
>
> 實測證據（Milestone M 基礎層期間，把該修正暫時還原再裝回去對照）：
>
> | 狀態 | regress | regress2 |
> |---|---|---|
> | 還原 Boss 目標修正（＝我當時量到的狀態） | 15/15、平均擊殺 31.9 | 8/8 |
> | **`a70cf7c` 實際 commit 的狀態** | **14/15、平均擊殺 32.3** | **7/8（最長 33.3 分 > 門檻 32）** |
>
> ⇒ **`a70cf7c` 的真實基準是 regress 14/15 / 32.3、regress2 7/8。**
> 其中 regress2「無極端過長」這一條**目前在 main 上是紅的**，是本 commit 引入、
> 當時沒被發現的回歸，已列入待辦（見 `08_目前待辦與風險.md`）。
>
> 上面的原始內容**保留不改**，只補這段更正。



### 教訓

**「引擎狀態不在你以為的地方」本輪踩第二次。** `e.dragon` / `e.baron` 是 v1/v2
的舊物件（沒有 `pos`、`targetId` 永遠 null），v3 的 Boss 在 **`e.neutrals`**。
第一版驗證讀錯物件，量出「433 個存活 tick 一次都沒有目標」的假結論。
加上 Hotfix 1 的 `snapshot.towers` 事件 —— **診斷前先確認狀態在哪個物件**。

---

## Milestone M 基礎層（2026-08-01）— Hero Combat Archetypes（opt-in，未接線）

報告：`review/moba-runtime/milestone-m-foundation/MILESTONE_M_FOUNDATION_REPORT.md`

**這是 Milestone M 的安全切片**：只交付資料契約與第五個 opt-in 行為層，
**沒有接進正式對戰流程、沒有改變任何現行戰鬥結果**。

### Audit 結論

- 交戰距離 `let bd = 8` **對所有英雄一視同仁**——近戰與遠程完全沒有區別。
- 傷害是**連續 DPS**（`p.power * dt * dmgK * lateFactor` 每 tick 施加）；
  `atkCd` 與 `pushFx` **只是呈現**，不是一次真正的攻擊。
- `heroDatabase.stats.range` 乾淨分群（坦克/刺客 150、戰士 175、輔助 500、
  法師 525、射手 550），**引擎一次都沒讀**。
- 移動只有一個決策點 → `_navMove`（碰撞、A*、決定性都已具備，可直接沿用）。
- `combatClassOf` 可從 Milestone L 直接重用 ⇒ **不必再建第二套映射**。

### 交付

`src/data/heroCombatArchetypes.js`（Contract v1）：100 位英雄全部解析得出合法契約。
`attackType` 由 `stats.range ≥ 300` 推導（**不是看定位**——輔助路的坦克就該是近戰）。
唯一換算式 `engineRange = 4.0 + (display − 150) × 0.011`，夾在 [4.0, 8.6]
⇒ 近戰 **4.00–4.28**、遠程 **7.85–8.40**，兩群不重疊，且近戰 > 野怪攻擊距離 3.2。
其餘欄位是 `baseAttackRange × 職業倍率` ⇒ 射程一改站位自動跟著走。

LogicEngine 第五個 opt-in 行為層：`configureArchetypes` / `_engageRange` /
`_archPosition`（front / back / flank / support ＋ 決定性 slot 偏移，
**沒有新尋路、沒有群體 AI**）。引擎**不 import** 任何英雄資料。

### 逐位元對照

把 `LogicEngine.js` stash 回 `a70cf7c` 跑同一份摘要（15 seeds × 2400 ticks，
涵蓋時間／勝負／每人 k/d/a/hp/gold/座標 1e-6／全部塔 HP／fx 數）：
**SHA-256 完全相同**（`0415400483…65d7a`）⇒ 未呼叫時逐位元一致。

### 驗證

`check_combat_archetypes_m` **28/28**（新增）、`check_combat_threat_l2` 19/19、
`check_hero_presentation_l` 80/80、`check_hero_matchups_k` 47/47、
`check_moba_milestone_j_close` 35/35、build exit 0。
`regress` **14/15 / 32.3**、`regress2` **7/8** ⇒ 見下面的更正。

### ⚠ 更正 Hotfix 2 的回歸數字（附實測證據）

Hotfix 2 報告的 `regress` 15/15 / 31.9 與 `regress2` 8/8 **不是該 commit 的結果**。
我在套用 v5 數值後跑完那兩支，**之後**才加上「Boss 只挑還打得動的目標」修正，
**沒有重跑**就把中途數字寫進報告。實測對照證實：還原該修正 ⇒ 15/15 / 8/8；
裝回去（＝ commit 狀態）⇒ **14/15 / 32.3、regress2 7/8（最長 33.3 分 > 門檻 32）**。

⇒ **main 目前 regress2 有一條紅燈**，是 Hotfix 2 引入、當時未發現的回歸。
那個 Boss 修正本身是對的，建議併進 M1 校正，不要為了讓門檻變綠而撤銷它。

### 教訓

**改完程式碼要重跑回歸，不能沿用改動前的量測。**
任何「最後一刻的修正」都必須重跑整組回歸才能寫進報告。

---

## Milestone M1（2026-08-01）— 契約接線、交戰距離、職業站位、長局校正

報告：`review/moba-runtime/milestone-m1/MILESTONE_M1_REPORT.md`
rollback tag：`milestone-m1-baseline` → `147139f`

**M2（projectile lifecycle）尚未開始。**

### 長局紅燈的根因：推進閘門，不是塔也不是 Boss

seed 777（33.3 分）逐 2 分鐘取樣：22 分時還有 5 座車道塔散在三路、門牙 4/4 完好。
根因是 `frontStructure()` 規定**必須某一路三座全倒**才輪得到門牙塔；
兩隊對稱互拆 ⇒ 沒有任何一路被清空 ⇒ 沒人打得到門牙 ⇒ 高原期。
這是既有結構性質，被 Hotfix 2 的 Boss 修正推過 32 分線。

修法：`structureAccelT/Div` **960/130 → 900/115**（只加速拆建築，不改擊殺／移速／
任何傷害公式）。**沒有提高門檻、沒有刪 seed、沒有削弱塔或 Boss。**
seed 777 **33.3 → 23.4 分**；`regress2` **7/8 → 8/8**（最長 27.4）；
`regress` **14/15 → 15/15**（23.1 分 / 30.9 擊殺）；`check_combat_threat_l2` 19/19 不變。

### 接線

唯一計算點在 `useLocalServer.start()`（緊接 `configureHeroes` 之後）：
`opts.roster → toEngineArchetypes → 依席位拆 blue/red → configureArchetypes`。
UI 不拼資料（verifier 掃描所有 `.jsx` 確認沒有元件 import Adapter）；
缺資料走**決定性 fallback**，無亂數；無 roster ⇒ 不呼叫 ⇒ 逐位元回到硬編碼 8。
Presentation 只**補兩個欄位**（`attackType` / `positionRole`），
Milestone L 的演出分類一字未動。

### 實測差異（5 seeds，只採計最近敵人 < 15 的交戰窗）

近戰有效交戰距離 **3.89**、遠程 **6.53**。
線位平均最近敵距：**front 4.53 / flank 4.76 / back 7.08 / support 6.98**
⇒ 前排真的在前排、後排不貼進近戰核心（7.08 > 4.28）、flank 與兩者都不同。
重疊佔比全部 < 25%、無卡死、同 seed 兩次逐值相同（無新增 RNG）。

⚠ 量測教訓：整場平均會被**對線地理**主導（上路／打野天生離敵人遠），
第一版因此把 front/back 判反。要量站位就必須限制在交戰窗內。

### 多 seed（未接線 24 seeds vs 接線 20 seeds）

完成率 100% → 100%、勝率 58/42 → 60/40、平均時長 23.2 → 25.7 分、
p95 27.1 → 31.8、擊殺 **31.4 → 65.5**、破塔 17.3 → 16.0。

擊殺上升是**預期**（近戰必須貼到 3.9 才打得到 ⇒ 團戰變近距離互毆）。
第一版近戰 `preferK` 設在射程邊緣（0.92/0.80）會在邊界擺盪、有場次收不掉，
收到 **0.78/0.70** 後回到 100%。p95 31.8 與擊殺 65.5 **仍是技術債**，
正解是 M2 的 projectile lifecycle（遠程改成命中才結算後輸出會回落）。

⚠ `regress`/`regress2` 測的是**未接線的裸引擎**（直接 `new LogicEngine`），
所以它們反映長局修正，不是接線後的平衡。

### 驗證

`check_combat_positioning_m1` **17/17**（新增）、`check_combat_archetypes_m` **30/30**、
`check_combat_threat_l2` 19/19、`check_hero_presentation_l` 80/80、
`check_hero_matchups_k` 47/47、`check_moba_milestone_j_close` 35/35、
`regress` 15/15、`regress2` 8/8、build exit 0。

---

## Milestone M1.5：兵線推進與基地兵線閘門（2026-08-01）

### 目標

讓「兵線」在收尾階段真的有意義：一路高地塔被推掉之後，該路小兵要能繼續走進
基地廣場、抵達門牙塔 13 單位判定範圍；門牙塔與主堡改成**沒有兵線就打不動**。

### 根因（30 seeds 實測，推翻了原本的假設）

原假設是「`posOnLane()` 的基地段路徑沒有延伸進基地廣場」。**實測不成立**：
`posOnLane(ln, 1.0)` 就在基地廣場口——top (192,28) 距紅門牙塔 5.7、bot (194,28) 距 3.8、
mid (190,30) 距 7.5，全部 < 13；blocker 是門牙塔時 `stopT` 也解到 0.98，不擋人。

真正的根因有三層，全部由實測定位：

1. **兵線是點狀質量**（`LogicEngine.advance()`）。小兵只被敵人與建築擋、**友軍互相穿透**
   ⇒ 同一波 4 隻的 `t` 一路完全相同（實測 `B[0.441×4 | 0.267×4 | 0.092×4]`），
   波與波固定相隔 `wavePeriod × 速度` = 0.174。兩波接觸時 `strike()` 的
   `|slot 差|` tie-break 把 4v4 配成**完美 1:1 對決**（領頭兵每秒固定只掉 30 = 一個攻擊者），
   雙方同 tick 同歸於盡；後續波次距離 0.17，8 秒的對決期只推進 0.046 ⇒ 永遠來不及參戰。
   兵線位置因此是**週期 30 秒的極限環**（逐值重複），全場最深只到 t≈0.72。
2. **交戰點固定在中線**。加上縱隊後最深仍只到 t=0.84：交戰落在 t≈0.5，離雙方任何一座塔
   都很遠 ⇒「推掉塔」根本沒有進到兵線交換裡 ⇒ 對稱系統只有對稱平衡點。
3. **基地建築有兩套互相矛盾的判定**。門牙塔／主堡不在任何 lane 上，其 `t`（0.02/0.98）
   只是佔位值；兵線存在判定用**世界距離 13**，小兵攻城卻用 `|m.t − tw.t| ≤ 0.06` 比佔位 t
   ⇒ 小兵在 t≈0.92（離門牙塔 20 單位以上、還在基地外）就能把門牙塔拆掉。
   結果：即使兵線走到 13 單位內（6/30 seeds），門牙塔早就沒了 ⇒ 進基地率恆為 0。

### 修正（4 處，全部雙方對稱、只看建築狀態，無 seed 特判）

| 檔案 | 內容 |
|---|---|
| `src/LogicEngine.js` `advance()` | 友軍排隊：後方小兵貼到前方友軍後 `queueGap` 排隊（只慢不退、以 next 排序 + 索引破平手 ⇒ 決定性不變） |
| `src/LogicEngine.js` 出兵 / `bkOf()` | 高地塔（tier 0）倒 ⇒ 該路**強化兵**：生命 ×`laneBreachHpK`、兵對兵傷害 ×`laneBreachFightK` |
| `src/LogicEngine.js` `_combatStep()` | 門牙塔／主堡改**硬閘門**：`_hasWaveAtStructure` 為假 ⇒ `soloK = 0`、不扣血也不計推塔波次（路上三座塔維持 Milestone F 的分級懲罰） |
| `src/LogicEngine.js` `_minionAtBase()` | 新增基地建築的**單一判定**，`_hasWaveAtStructure` 與小兵攻城共用（消除上面第 3 點的矛盾） |
| `src/battle/moba/matchProgression.js` v3 | 新增 `minionQueueGapWorld: 1.6`、`laneBreachFightK: 1.7`、`laneBreachHpK: 1.8`、`nexusWaveGate: true` |

v1/v2 沒有這四個 key ⇒ 全部退回原分支 ⇒ 歷史基準逐位元不變。
**沒有動** `frontStructure`、target lock、`structureAccel`、`waveFrontBias`、回血參數、
建築血量，也沒有放寬任何測試標準。

### 實測（`tools/sweep_wave_bias_m15.mjs`，30 seeds）

| 指標 | 修正前 | 修正後 |
|---|---|---|
| **高地倒後兵線進基地** | **0%** | **96.7%** |
| 無兵線攻擊建築 | 131（baseline） | **9** |
| 終局 waveT（上/中/下） | 0.50/0.50/0.50（鎖死） | 0.48/0.48/0.55 |
| 兵線最深 t（藍/紅） | 0.741 / 0.151 | **0.980 / 0.020** |
| 完成率 | 100% | 100% |
| 平均／中位／p95／最長 | 25.6 / 24.8 / 31.0 / 44.7 | 24.3 / 24.2 / 29.3 / 29.4 |
| 15–32 分佔比 | 96.7% | **100%** |
| 藍勝 / 擊殺 / 破塔 | 43.3% / 35.9 / 18.1 | 53.3% / 32.2 / 16.7 |
| 決定性 | 100% | 100% |

`waveFrontBias` 五個候選值輸出完全相同 ⇒ 該旋鈕在目前程式路徑上無作用（本次未動它）。

### 未驗證項（交給瀏覽器實測）

- 強化兵（`m.super`）目前**沒有任何視覺呈現**；渲染層仍照普通小兵畫。
- 門牙塔硬閘門在畫面上的體感（英雄站在門牙塔前完全不掉血條）未經瀏覽器確認。
- 「無兵線攻擊 9」殘留來源未逐筆歸因（推測是兵線在同一 tick 內死亡的邊界）。

### 一併帶入的前一段 M1.5 工作（上個 session 留在工作區、本次未再改動）

`LogicEngine._combatStep()` 的三段式生命回復 + `SIM_RULES.v3.regen` 契約
（交戰中 0.10%/秒、脫戰 0.75%/秒且需脫戰 7 秒、泉水 10%/秒），
以及 tick 首尾血量快照推導的 `lastDamagedAt` 單一寫入點。
本次驗證（build / regress / regress2 / runtime29）都是在**含這段**的程式碼上跑的。

### 既有紅燈（不是本次造成，勿當回歸訊號）

`check_moba_runtime29` **43/44**，唯一紅燈是
§29「v2 陣列順序不決定勝負」（藍勝 正序 43% / 反序 63%，位移 20pp，門檻 ≤15）。
已用獨立 worktree 在 **HEAD `3adf8f7`（本次改動之前）** 重跑同一組 40 seeds，
得到**逐值相同的 43%/63%、20pp** ⇒ 這是 Milestone L/M 期間就存在的紅燈。
另量 80 seeds 為 50%/66%、16pp（門檻 15 對 n=40 而言很緊，1σ≈8pp）。
§29 測的是 `SIM_RULES.v2`，本次四個新 key 只在 v3 ⇒ 與本次改動無關。
**未修**：修它要動 per-player rng 流（見該檔 413–422 行的誠實標記），不在 M1.5 範圍。

---

## Milestone M1.6：塔射程同源與英雄接戰穩定化（2026-08-02）

實機回報兩個 P0：①中路塔攻擊跨越過大區域、甚至打到河道附近小兵；
②兩三名英雄靠近後持續繞圈、長時間不攻擊。兩個都是**判定層**的錯，不是比例或美術。

### P0-1 根因：同一套塔有三種互相矛盾的射程模型

| 用途 | 模型 | 實際涵蓋 |
|---|---|---|
| 路上塔挑**小兵** | `towerMinionBand: 0.10`（**lane progress**，不是距離） | 上/下路 ±30.9、中路 ±22.6 世界單位 |
| 路上塔挑**英雄** | `dist < towerAggroRange` | 6.0 |
| 門牙塔挑小兵 | 世界距離 13 **或** `m.t ≥ 0.95`（那是 M1.5 的攻城／閘門述詞） | 可達 26+ |
| debug 射程圈 | `towerAggroRange × WORLD_SCALE` | 一律 6.0 |

實測（5 seeds，塔的每一發、以 fx id 去重）：

| | M1.6 前 | M1.6 後 |
|---|---|---|
| 全部塔攻擊距離 | 平均 14.90 / 中位 17.82 / p95 25.91 / **最大 30.68** | 平均 5.17 / 中位 5.08 / p95 5.89 / **最大 6.00** |
| 打小兵 | 平均 19.81、最大 30.68（＝畫到河道的那條線） | 平均 5.02、最大 5.85 |
| **超出該塔射程的發數** | **66.4%**（3493/5257） | **0.0%**（0/1849） |
| 鎖定失效（目標已離場／出射程）的 tick | 74.4% | 33.5%（其餘是英雄在塔判定後才移動，開火前會重新驗證） |

修正：`towerRangeWorld: true` ⇒ 塔挑小兵改用世界距離、選目標的「最近」也改用同一度量；
門牙塔**射擊**只看 `nexusGuardRange`（M1.5 的 `_minionAtBase` 閘門述詞照舊，兩件事分開）；
新增 `LogicEngine.towerRange(tw)` 作為射程的單一真實來源，debug 射程圈改**逐座**取半徑；
鎖定只在真的開火時更新，並在每 tick 清掉失效鎖定。

### P0-2 根因：站位的側向偏移是線性外加，且參考框會自轉

`_archPosition()` 舊寫法 `foe − u*want + perp*lateral`，其中 `u` 是「**我**→敵人」的當下向量：

1. **必然繞圈**：側移會轉動 `u`，目標點跟著轉 ⇒ 英雄追著一個一直轉的點跑。
2. **永遠打不到**：實際距離變成 `√(want² + lateral²)`。坦克 `want 3.12`、`lateral 2.64`
   ⇒ **4.09**，而近戰 `engageRange` 只有 **4.00** ⇒ 站位點恆在攻擊距離之外。
   1v1 微場景實測：距離**凍結在 4.09**、60 秒 0 次攻擊、雙方血量一點都沒掉。

⚠ 這兩點在 `regress` / `regress2` / `runtime29` **量不到**——那些跑的是裸引擎，
`_engageRange` 恆為 8、`_arch()` 回 null。實機走的是 `configureArchetypes` 的路徑。
本輪的 verifier 因此**一律接上原型層**。

修正（全部在 `stableFormation: true` 之後才生效）：

- slot 改成沿**同一半徑的圓弧**分佈（角度偏移），任何 slot 的實際距離都等於 `want`
- 站位參考框改用「我方基地 → 敵人」這條**不隨自身移動而轉**的軸
- 錨點**黏著**：目標活著且沒明顯脫離（`chaseDistance+6` 的 1.25 倍）就不換人
- 進入／離開攻擊距離的**遲滯**：`engageRange×0.85` 進入即站定輸出，
  離開 `engageRange×1.05` 才重新移動（追擊與撤退不套用，保留追擊／撤退／側翼差異）
- `KITE` 分支原本每 tick 固定轉 0.18 rad（35 tick ＝一整圈）⇒ 已進入自己的攻擊距離時不再側移

實測（5 seeds、**接原型層**的真實對局）：

| | M1.6 前 | M1.6 後 |
|---|---|---|
| 繞圈事件（15 秒同向繞 ≥0.5 圈且攻擊率 <25%） | **1971** | **13** |
| 最長連續繞圈 | **1230 秒** | **15 秒** |
| 每個接戰視窗平均繞行圈數 | 0.436（最大 7.76） | 0.038（最大 1.82） |
| 在攻擊距離內確實有攻擊目標 | **8.6%** | **26.9%** |
| 1v1 站定距離 / 攻擊佔比 | 凍結 4.09 / **0%** | 穩定 3.12 / **99%** |
| 2v2 / 3v3 攻擊佔比 | — | 97% / 43% |

殘留的「在攻擊距離內沒攻擊」以**撤退規則**為主（自己撤退 13,178 tick、敵人撤退 10,147 tick）。
那是 S29B1 刻意的「不追殺已脫離的目標」設計；另量到 M1.5 的 `regen` 讓撤退佔比
21.3% → 28.3%、攻擊率 19.3% → 8.6%。**兩者本輪都未動**（會改到核心戰鬥規則）。

### 新增 Debug（預設關閉，只在 `?diag=1` / `?shot=`）

`LogicEngine.enableCombatDebug()` ⇒ snapshot 多一個 `debug` 區塊（不呼叫則**完全沒有這個 key**，
契約形狀逐位元不變）。內容全部是引擎當下的真實狀態，疊層不重算：

- 塔：射程、鎖定狀態、目標 ID/種類、目標實際距離（超出射程會標紅）、連續命中數
- 英雄：狀態（追擊／接戰／拉扯／撤退／回城）、fsm、目標 ID、目標距離、攻擊距離、
  停止距離（進入/離開遲滯門檻）、是否站定輸出、避碰修正量（想走 − 真的走）
- 射程圈改逐座建築取半徑（門牙塔 13 vs 路上塔 6.0），與引擎 `towerRange()` 同源

新檔：`src/battle/moba/render/CombatDebugPanel.jsx`、`src/battle/moba/presentation/towerRangeGeometry.js`
（射程→畫面半徑的換算抽成純資料模組，verifier 才讀得到同一份換算）。

### 驗證

`tools/check_combat_range_m16.mjs`（新增）**19/19**：射程單一來源、塔內外目標判定
（200 點掃描，圈內漏打 0／圈外誤打 0）、目標離開射程立刻停火且清鎖定、整場 735 發 0 例外、
不同職業射程、1v1/2v2/3v3 不繞圈且穩定輸出、圍攻不疊位、真實對局繞圈指標、
同 seed 逐值可重現、開 Debug 不改模擬、未開 Debug 無 `debug` 欄位。

`regress` **15/15**（撤退鎖死 **3 → 0**）、`regress2` **8/8**、
`sweep_wave_bias_m15` 兵線進基地 **100%**、`npm run build` 通過。

### 未經瀏覽器實測

- Debug 疊層（HTML 面板與逐座射程圈）只在 node 端驗證資料正確，畫面未實際開啟確認。
- 塔不再打遠處小兵之後的「清兵手感」變化未在瀏覽器確認。

## Hero Proxy 上場測試（2026-08-02）

- 本輪只接入一隻 `chichuan`，使用 `ESMO-hero-models` 的 `chichuan_cli_five_pass_v003.blend` 匯出 GLB，未使用 Human Base Mesh。
- 新增 `ChichuanHeroProxy.jsx` 與 `heroProxyChichuan` feature flag；既有 placeholder 可用 `?heroProxy=0` 比較，其他英雄不受影響。
- `npm.cmd run build` 通過；GLB 24 Mesh、2928 vertices、5760 polygons，HTTP asset 回應 200。
- `check_moba_runtime29.mjs` 本輪執行 184 秒 timeout，未取得 verifier pass；不得將本輪記為完整 runtime 回歸通過。
- Browser control backend 無法啟動，因此 MOBA 畫面、console、FPS、地面接觸與遠距可讀性列為待人工驗收。
- 未 commit、未 push。

### Hero Proxy 黑屏修正（2026-08-02）

- 根因是 proxy 接線的 `proxyReady` 作用域與 `frameRef` props 傳遞錯誤，已修正。
- Chrome/CDP 重測兩種開關均無例外；聚焦 `r2` 後可直接比較 proxy 與原 placeholder。
- 新增 debug-only `focusHero` query，不影響正式 GameView 或戰鬥邏輯。

### Hero Proxy A/B 對照（2026-08-02）

- Desktop v002 已以同一 Blender GLB 匯出與 Runtime loader 規格建立獨立資產；CLI v003 未覆蓋。
- `heroProxyVariant=cli-v003|desktop-v002` 已接入，預設仍為 CLI。
- Chrome/CDP 兩版本均 Canvas 2、uncaught exception 0；A/B 截圖與 JSON：`review/hero-proxy/ab-v001/`。
- 初步畫面觀察 Desktop v002 的紅／橙與火焰輪廓較清楚；SwiftShader 效能數字不作真實 GPU 結論。
- 未 commit、未 push。

## Milestone M1.7：英雄決策與撤退（2026-08-03，**未 commit、驗證未過，暫停中**）

> 這一節是在原本的 M1.7 session 崩潰（WT 異常跳回 PowerShell）之後，
> 從 working tree 的實際 diff 重建範圍、當場重跑驗證所寫。
> 崩潰前的對話與驗證輸出**沒有留下任何檔案**，不引用、不複述。

### 改動範圍（HEAD 仍是 e883fe2 = M1.6；以下皆為未 commit）

只有三個檔屬於 M1.7（`git status` 其餘項目是 hero-proxy 等更早的未 commit 工作）：

- `src/battle/moba/matchProgression.js`：`SIM_RULES.v3` 新增總開關 `decisionV17` 與 14 個參數
  （`idleCooldownSec` / `waitWaveRange` / `waitWaveMaxSec`、`diveMinHp` / `diveMaxShots` /
  `diveKillHp` / `towerSafePad`、`tradeWindowSec` / `burstRetreatAt` / `burstRetreatBonus` /
  `towerZoneRetreatBonus` / `supportRadius` / `supportRetreatRelief` / `escapeRetreatRelief`）。
- `src/LogicEngine.js`（+233 行）：
  ① 撤退／回城的目標不再被 `_archPosition` 站位層覆寫；後排貼進 `retreatDistance` 內解除站定遲滯。
  ② `_towerZoneV17`：塔區四項判準（有兵線／血量／連續吃塔發數／有擊殺機會）不同時成立就退出塔射程；
     塔傷本身未改，只新增 `towerHits` 計數。
  ③ `_nextCampV3` 改為 Buff 營優先、以 id 破平手（決定性）。
  ④ `_idleReasonV17` / `_nextTaskV17`：站著不動要有合法理由（回城／泉水／防守／短暫冷卻／集合／
     等兵線／埋伏），否則取得下一個任務（打野路線 → 推進前線建築 → 跟兵線 → 集合），
     其中推進會避開被兵線閘門擋住的門牙塔／主堡。
  ⑤ 撤退門檻四項情境平移（短期換血、塔區、支援、閃現就緒），皆為門檻調整，不用計時器、不強制位移。
  ⑥ debug snapshot 新增 8 個診斷欄位：`actionState` / `intent` / `idleReason` / `retreatReason` /
     `retreatAt` / `burst4s` / `towerHits` / `towerZone`。
- `tools/check_combat_range_m16.mjs`：繞圈與同隊疊位判定排除 `retreating`
  （撤退時從敵人旁邊繞開本來就會掃過角度，M1.6 因為撤退被站位層壓住才看不到）。

### 驗證結果（2026-08-03 實跑）

- ✅ `npm run build` — `built in 10.25s`。
- ✅ `node tools/check_combat_range_m16.mjs` — **19/19 通過**。
- ⚠️ `node tools/regress.mjs` — 結束率 **14/15**、**撤退鎖死 1**、平均擊殺 18.8。
- ❌ `node tools/regress2.mjs` — **節奏門檻 6/8**（需 8/8）：
  「收得掉 19/20」與「最長 45.0 分（需 ≤32）」兩項紅。
- 🔄 `node tools/check_moba_runtime29.mjs` — **未取得結論**。
  第一次以預設 heap 執行 6 秒即 `FATAL ERROR: Zone Allocation failed`（exit 134）；
  改 `--max-old-space-size` 重跑時尚未產生輸出即結束本輪工作。
  ⚠️ 另注意：8GB heap 的 runtime29 與 `npm run build` **同時**執行會把 esbuild 擠死
  （`The service was stopped`）——那次 build 失敗是資源競爭，不是程式碼問題，單獨重跑即通過。

### A/B 歸屬（已確認：回歸由 M1.7 造成）

把 `decisionV17` 暫時切為 `false` 再跑同一組驗證，跑完已改回 `true`：

| 指標 | decisionV17 關（≈M1.6） | decisionV17 開（M1.7） |
|---|---|---|
| regress2 節奏門檻 | **8/8** | **6/8** |
| ‧ 收得掉 | 20/20 | 19/20 |
| ‧ 最長時長 | 28.1 分 | **45.0 分** |
| ‧ 平均時長 | 22.8 分 | 24.8 分 |
| regress 結束率 | **15/15** | 14/15 |
| regress 撤退鎖死 | **0** | **1** |
| 平均擊殺 | 25.7 / 27.3 | 18.8 / 22.6 |

症狀一致：撤退門檻拉高＋發呆再任務之後，出現撤退鎖死的場次，對局收不掉、拖到 45 分。
方向合理（英雄更保命），但保命過頭變成不打架、不收線。

### 未完成 / 未驗證

- **runtime29 44/44 未取得**（regress2 已知 6/8，預期它也不會全綠）。
- **完全沒有瀏覽器實測**：塔下撤退、後排拉開、打野先吃 Buff 的手感，
  以及新增 8 個 debug 欄位在疊層上的顯示，一項都沒在瀏覽器看過。
- 程式碼註解引用的舊行為 audit 數據（37.0% 發呆 tick、塔下 ≥5 秒平均掉血 52.9pp、
  第一個營地是 Buff 的比例 0%、撤退開始平均剩 26.6% 血）**來源腳本已不存在，本輪未複驗**。

### 下一步（未執行，等使用者決定）

1. 先收斂撤退門檻（`burstRetreatAt` 0.22 / `burstRetreatBonus` 0.16 / `towerZoneRetreatBonus` 0.12
   疊太厚），目標：regress2 回到 8/8、regress 撤退鎖死回到 0。
2. 再跑 runtime29 求 44/44（單獨跑，不要與 build 併行）。
3. 最後才進瀏覽器驗收。
4. 在上述 1 未達成前**不要 commit** M1.7。

- 未 commit、未 push。

### M1.7 Fix 1：圍攻不是越塔（2026-08-04）

上面那節的建議（先收斂撤退門檻）**只猜對了一半**。實測診斷後，45 分卡死的主因
不是門檻，是塔區規則把**圍攻基地**也一起禁掉了。

#### 診斷（20 seeds，逐 seed 觀測 + 單場 trace）

- 撤退 tick 只從 15.8% 升到 19.1%，撤退加成**不是**主因。
- seed 256（45 分未結束）：主堡滿血 7200、擊殺 91、最後一座塔 29 分才倒。
- 把塔區條件放寬一次之後，同樣的 45 分卡死**跑到 seed 7 去了**（換 seed 不換病）：
  - 25 分時所有路上塔倒光，只剩 4 座門牙塔，各自滿血 300；
  - **整場沒有任何敵方英雄進入過攻擊距離**（逐 5 分鐘取樣皆為 0）；
  - 20 分後 state 最大宗是 `攻門牙塔` 8582 tick——站在那裡，但打不到。
- 原因：**門牙塔射程 13，英雄攻擊距離只有 4–8**。`_towerZoneV17` 不允許時會把人
  推到 `towerRange + 2.5 = 15.5`，於是英雄永遠靠不進攻擊距離，無限彈開。
- 附帶澄清：`nexusGuardNoWaveK = 0.62` 是**乘數不是歸零**，引擎本來就允許無兵線
  攻城；是決策層自己把它擋死的。

#### 修正

`_towerZoneV17` 的允許條件重寫為：

```
allow = hpOk && shotsOk && (sieging || hasWave || kill)
```

- `sieging`：這座塔**就是我這一路的前線建築**（`frontStructure`）⇒ 圍攻，本來就得站進去打。
- `hasWave`：有己方兵線扛塔 ⇒ 正常推線。
- `kill`：沒兵線但射程內有殘血敵人 ⇒ 有計畫的越塔。
- `hpOk` / `shotsOk` 維持不變——「不准站到殘血」由這兩項負責，不是靠禁止靠近。

同時移除 `towerZoneRetreatBonus`（原 0.12）：塔區風險已由上面的退出規則處理，
再平移一次撤退門檻是同一件事算兩遍，而撤退在 M1.7 又贏過站位層，結果是
「一走進敵塔射程就往家裡跑」。`inTowerZone` 保留為**理由字串**，不再改門檻。

另修一個較小的問題：再任務的「抵達」判定原本只看 `dist ≤ 0.9`，但打建築是站在
攻擊距離上輸出，永遠不算抵達 ⇒ 站在被閘門壓住的建築前不會再任務。已改為
建築情境下用 `engageRange + 1`。

#### 驗證（2026-08-04 實跑，修正後）

| 驗證 | 修正前 | 修正後 |
|---|---|---|
| `regress2.mjs` 節奏門檻 | 6/8 ❌ | **8/8 ✅** |
| ‧ 收得掉 | 19/20 | **20/20** |
| ‧ 時長 平均／中位／最長 | 24.8／23.9／**45.0** | 22.8／23.1／**26.1** |
| `regress.mjs` 結束率 | 14/15 | **15/15 ✅** |
| ‧ 撤退鎖死 | 1 | **0 ✅** |
| `check_combat_range_m16.mjs` | 19/19 ✅ | **19/19 ✅** |
| `npm run build` | ✅ | ✅ `built in 12.22s` |

參數候選 `d_soft`（放寬換血觸發 0.28／加成 0.08）實測反而讓撤退鎖死變 2，已捨棄；
最終只動了「移除 towerZoneRetreatBonus」這一顆，`burstRetreatAt` 0.22 /
`burstRetreatBonus` 0.16 維持原值。

#### 仍未完成

- 瀏覽器實測仍然一項都沒做（塔下撤退／後排拉開／打野先吃 Buff 的手感、
  新增 debug 欄位在疊層上的顯示）。
- 程式碼註解引用的舊行為 audit 數據仍未複驗（來源腳本已不存在）。

### M1.7 封存為 RC1（2026-08-04）

**狀態：程式與自動驗證完成，待瀏覽器實機驗收。**
⚠ 這**不是**正式驗收完成。RC1 只代表「自動化能驗的都驗過了」，
凡是需要人眼與真機的項目一律仍未驗，見下方清單。

- Tag：`milestone-m1.7-rc1`
- 自動驗證（2026-08-04，全部實跑）：
  - `verify.mjs` 18 區段 → **16/18 通過**，時戳皆為 2026-08-04。
  - 2 個 FAIL 都已證實為**既有紅燈**，非 M1.7 造成：
    - `runtime29` §29 陣列順序公平性（runner 自標 TD-21）。
    - `milestone_j` §26/§31（用 `git worktree` 開 HEAD e883fe2 的唯讀副本比對，
      **HEAD 跑出完全相同的兩條紅燈、同樣 14/15**）。
  - `regress` 15/15、撤退鎖死 0；`regress2` 節奏門檻 8/8；
    `check_combat_range_m16` 19/19；`npm run build` 通過。
- ⚠ 巢狀跑法（直接 `node tools/check_moba_runtime29.mjs`）為 **37/44**，耗時 1h42m，
  其中 6 個紅燈是 OOM 崩潰（exit=134 / 3221226505），單獨重跑全綠。
  **正式入口是 `tools/verify.mjs`**（flat 模式，各腳本只跑一次），runtime29 檔頭
  自己就寫明巢狀會產生 63 個子行程、跑不完。日後回報請以 verify.mjs 為準。
- **待瀏覽器實機驗收（RC1 未涵蓋）**：
  1. 塔下撤退：血量不足／連吃三發時退出，但**推塔與推門牙塔時要能站進去打**。
  2. 撤退回血後的重新接戰，不卡泉水或半路。
  3. 發呆：站著不動要有合法理由，不得長時間無理由站樁。
  4. 新增 8 個 debug 欄位（`actionState` / `intent` / `idleReason` / `retreatReason` /
     `retreatAt` / `burst4s` / `towerHits` / `towerZone`）在疊層 UI 上**是否有畫出來**
     ——資料層已有，呈現層未驗證。
  5. 手機真機（Android / iOS）完全未測。

## Milestone N（2026-08-04）— 經營時間軸與財務閉環

分支 `milestone-n-finance`（從 `milestone-m1.7-rc1` 開出）。**未 merge 回 main。**

### 問題

主幹**沒有時鐘**。`advanceTrainingDay()` 會把 `meta.days` +1 並推導 `meta.week`，
但那是訓練功能的副作用：`activeSponsor.weeksLeft` 簽約後永遠不遞減、
`finance.weeklyIncome` / `weeklyCost` 從未入帳。錢只會因為比賽獎金增加，
不會因為經營而變動 ⇒ 贊助簽了等於永久生效、經營沒有壓力。

### 交付

**新增三個純邏輯模組**（不 import React / zustand / localStorage ⇒ 可直接 Node 測）：

- `src/platform/economy/units.js` — `WAN` 換算常數。從 profileStore 搬出來，
  避免純模組反向 import Store 造成循環；profileStore 改為 re-export，呼叫端不受影響。
- `src/platform/economy/timeline.js` — 時間的**唯一換算來源**。
  `deriveTime(days)` → `{day, week, season, dayOfWeek, weekOfSeason}`；
  `DAYS_PER_WEEK = 7`、`WEEKS_PER_SEASON = 12`。
  week / season 一律由 `meta.days` 導出，**不另存第二份計數**
  （避免 team.lv/xp 那種兩邊不同步的坑）。週次跨賽季不重置 ⇒ 可當全域唯一的冪等鍵。
- `src/platform/economy/weeklySettlement.js` — 週結算純 reducer。
  `buildWeekLines(state)`（唯讀預覽）、`settleWeekInState(state, week)`、
  `advanceDaysInState(state, n, onDay)`。

**profileStore**（`schemaVersion` 4 → 5）：

- 新增 `economy: { settledWeeks, lastSettledWeek }` 帳本切片。
- 新增 `advanceDay(n)` = **唯一的時鐘**：每天結算訓練，跨週結尾則結算該週。
  `advanceTrainingDay()` 保留為 `advanceDay(1)` 的別名（訓練頁與 Legacy 呼叫端不必改）。
- 新增 `currentWeekPreview()` 給畫面用（唯讀）。
- migration：舊存檔沒有 `economy` ⇒ 空帳本，且**刻意不補算過去的週**
  （那會在載入當下憑空扣一大筆薪資）。載入時強制由 `days` 重新導出 week / season。
- 種子 `meta` 原本 `days: 8` 配 `week: 1`（互相矛盾），改為由 days 導出 ⇒ week 2。

**收支組成**（金額一律以元存放，Legacy 表以「萬」計價）：

| 項目 | 來源 | 種子值 |
|---|---|---|
| 基礎營收 | `finance.weeklyIncome` | 8.5 萬/週 |
| 贊助收入 | `activeSponsor` → SPONSORS.weekly | 6–35 萬/週 |
| 選手薪資 | `players[].salary`（**週薪・萬**，依 Legacy `EsportsGame.jsx:559` / `:5822`） | 五人合計 42 萬/週 |
| 營運成本 | `finance.weeklyCost` | 6.2 萬/週 |

⚠ `weeklyCost` 明確定義為**不含薪資**的固定營運支出。種子 `expenseBd` 另有一筆
「選手薪資」，那是 Legacy 寫死的展示分解；薪資的唯一來源是 `players[].salary`，
兩者不相加，避免重複計算。

**合約**：先入帳、再遞減 ⇒ 合約 N 週就領滿 N 週；遞減到 0 當週清空
`activeSponsor` 並發收件匣通知（剩 ≤2 週也會預告）。到期後不再有任何贊助收入。

**Dashboard / FinanceScreen**：新增「本週財務」卡（收入／支出／淨額／合約剩餘週數、
S/週/天座標）；FinanceScreen 的「本週收入・本週支出」改讀 `currentWeekPreview()`——
原本直接顯示 `weeklyIncome` / `weeklyCost`，那會少算薪資與贊助。

### 驗證（2026-08-04 實跑）

- `node tools/check_finance_n.mjs` → **32/32 通過**。涵蓋：
  時間換算與跨賽季、一次推進多天不漏週、金額正確、
  **帳本相平**（本週交易加總 = 淨額 = 資金實際變化）、
  **冪等**（同週再結算完全不寫入、資金不被扣第二次）、
  **合約恰好領滿不多不少**、**到期後仍結算也沒有贊助收入**、
  資金允許為負（不夾成 0，否則帳目對不起來）、JSON 往返後續推進不重算。
- `verify.mjs --only=progress25,talent27,experience26,cs23,build` → **5/5 通過**。
- `npm run build` 通過。

### ⚠ 平衡問題（機制正確，數字關係要決策）

依 Legacy 規格，五人週薪合計 **42 萬**，而種子資金 120 萬、基礎營收 8.5 萬/週。
以最高階贊助（35 萬/週）計算，每週淨額仍是 **−24.7 萬**⇒ 數週內見底。

這是**種子資料的數字關係**問題，不是機制 bug。費率全部集中在
`weeklySettlement.buildWeekLines` 一處可調，但調整費率屬 Balance 決策
（CLAUDE.md：Balance 變更需 Ray 核准），本 Milestone **不自行調整**。

### 未做（刻意，超出本 Milestone 範圍）

- 轉會市場、合約談判、商店 —— 使用者明確指定不做。
- 沒有碰任何 MOBA 戰鬥邏輯（LogicEngine / BattleResult / Replay 一行未改）。
- **瀏覽器實機驗收未做**：本週財務卡的版面、合約到期通知、
  推進日的實際手感，都還沒在畫面上看過。

## Milestone N2（2026-08-04）— 經濟平衡

同分支 `milestone-n-finance`，接在 N1（commit `8c3c8e2`）之後。**未 merge 回 main。**

### 問題

N1 的機制是對的，數值卻散在三處：種子 `finance.weeklyIncome` / `weeklyCost`、
Legacy 選手表寫死的 `salary`、SPONSORS 的 `weekly`。結果沒人說得出「這隊每週
該賺多少」——實測就算簽下最高階贊助，每週淨額仍是 **−24.7 萬**。

### 交付

**費率集中**：`src/platform/economy/economyConfig.js` 是唯一設定來源
（薪資公式、贊助拆分比例、戰績取樣、三種情境、警告門檻）。
週結算**不再讀** `finance.weeklyIncome` / `weeklyCost` / `players[].salary`，
驗證器有專門斷言擋住（把種子值改成荒謬數字，結果不得改變）。

**薪資由能力決定**（`economy/salary.js`）：

```
週薪 = 底薪 0.8
     + (綜合能力 − 60) × 0.06     ← 16 項能力平均
     + (等級 − 30)     × 0.08
     + max(0, 潛力 − 85) × 0.04   ← 只有高潛力才加價
     夾在 [1.0, 8.0] 萬／週
```

種子五人：2.5 / 2.0 / 3.2 / 2.2 / 2.3 萬 ⇒ 合計 **12.2 萬／週**
（N1 是選手表寫死的 42 萬）。舊欄位 `players[].salary` 保留給轉會報價與身價顯示，
但週結算不再讀它。

**贊助拆成兩條入帳 + 一條不入帳**：

| 成分 | 比例 | 行為 |
|---|---|---|
| 固定收入 | 50% | 合約保證，不看成績 ⇒ 經營地板 |
| 績效獎金 | 50% | 依近期戰績（`csHistory` 最近 6 場勝率）縮放，全敗歸零 |
| 賽事獎金 | — | **不在週結算發放**，由 S25 `applyMatchProgress` 賽後入帳；週結算再算一次就是雙重入帳 |

⚠ 戰績目前只反映 **CS 訓練賽**——MOBA 戰績在 seasonStore，不在本 Store。
沒有比賽紀錄時取中性值 0.5（不獎不罰）。跨 Store 讀 MOBA 戰績列為後續項。

**三種情境**（`SCENARIOS`，差在營收規模與營運成本，不在薪資公式）：

| 情境 | 基礎營收 | 營運成本 | 起始資金 | 實測淨額 |
|---|---|---|---|---|
| 新手 | 6 萬/週 | 3 + 0.5×人 | 60 萬 | **0.0 萬**（勉強打平） |
| 一般 | 12 萬/週 | 5 + 0.5×人 | 120 萬 | **+3.5 萬** |
| 頂級 | 22 萬/週 | 8 + 0.5×人 | 300 萬 | **+17.3 萬** |

**現金預測**（`economy/forecast.js`）：未來 4 週，逐週遞減合約 ⇒
贊助到期造成的收入斷崖在預測上直接看得到。賽事獎金只認帳本裡 `cat === "prize"`
的真實紀錄去估，沒有紀錄就估 0（寧可保守）。預測是唯讀的。

**Dashboard**：新增「未來 4 週現金預測」卡——逐週資金／淨額、合約到期標記、
資金見底週次警告（紅／黃／無）。本週財務卡加上近期戰績與情境名稱。

### 平衡前後對照（一般情境・種子五人・戰績 50%）

| 贊助 | N1 淨額 | N2 淨額 | N2 收入 | N2 支出 |
|---|---|---|---|---|
| 無 | −39.7 萬 | **−7.7 萬** | 12.0 萬 | 19.7 萬 |
| 在地網咖（6 萬） | −33.7 萬 | **−3.2 萬** | 16.5 萬 | 19.7 萬 |
| HyperX（15 萬） | −24.7 萬 | **+3.5 萬** | 23.3 萬 | 19.7 萬 |
| 加密貨幣交易所（35 萬） | −4.7 萬 | **+18.6 萬** | 38.3 萬 | 19.7 萬 |

薪資：42 萬/週 → **12.2 萬/週**。

### 風險確實成立（驗證器逐項斷言）

- 贊助到期：+3.5 萬 → **−7.7 萬**（由盈轉虧）
- 戰績低落（全敗）：+3.5 萬 → **−0.2 萬**（績效獎金歸零）
- 高薪陣容（全明星，薪資 25.5 萬）撐在一般隊營收上：**−9.8 萬**

### 驗證（2026-08-04 實跑）

- `node tools/check_finance_n2.mjs` → **35/35 通過**。含費率集中、薪資單調與上下限、
  贊助拆分、三情境體質、三種風險、現金預測，其中最關鍵的一條是
  **「預測與實際結算一致」**（預測 130.7 萬 vs 實際跑三週 130.7 萬）。
- `node tools/check_finance_n.mjs` → **32/32 通過**。
  ⚠ 本檔的期望值已改為**從設定推導**，不再寫死 N1 費率——否則每次調平衡都要改
  驗證器，驗證器會變成平衡的絆腳石。它驗的仍是機制（不重複結算／帳目相平／
  到期不入帳／存檔往返）。
- `verify.mjs --only=progress25,talent27,experience26,cs23` → 4/4 通過。
- `npm run build` 通過。

### 未做（刻意）

- 商店、完整轉會與合約談判 —— 使用者明確指定不做。
- 沒有碰任何 MOBA 戰鬥邏輯，沒有碰 `ESMO-hero-models` worktree。
- **瀏覽器實機驗收未做**：現金預測卡版面、警告配色、320–1920 響應式。

### ⚠ 三項必須記錄在案的缺口（2026-08-04 確認）

1. **三種情境有設定，但沒有正式的開新局入口。**
   `SCENARIOS`（新手／一般／頂級）與 `profileStore.setScenario(id)` 都已就緒，
   `startingFunds`（60／120／300 萬）也已定義，但**畫面上沒有選擇情境的地方**，
   起始資金仍走既有種子（`finance.funds` 120 萬）。要讓三種情境真的有不同起點，
   需要一個「開新局／難度選擇」流程——**本輪未做**，預設一律 `standard`。

2. **MOBA 賽績尚未接入統一的績效贊助紀錄。**
   贊助績效獎金由 `recentForm()` 決定，而它只讀 `csHistory`（CS 訓練賽）。
   MOBA 戰績存在 **seasonStore**，不在 profileStore ⇒ 目前打再多 MOBA 也不會
   影響績效獎金。沒有任何比賽紀錄時取中性值 0.5，不假裝有資料。
   要接起來需要跨 Store 的統一賽績來源——**本輪未做**。

3. **目前的薪資與贊助數值是第一版平衡基準，不是定案。**
   薪資公式係數（底薪 0.8／能力 0.06／等級 0.08／潛力 0.04，上下限 1.0–8.0 萬）
   與贊助拆分（固定 50%／績效 50%）都是 N2 為了「讓正常經營活得下去」訂的**起點**。
   等轉會市場與合約談判完成之後，選手身價、簽約金、違約金會進入同一個經濟迴圈，
   屆時**必須重新校正**這組數字。費率全部集中在
   `src/platform/economy/economyConfig.js`，校正時只改那一支。

### N2 UI 調整：現金預測移至財務頁（2026-08-04）

小型呈現層調整，**沒有動任何經濟數值、計算或狀態**。

- Dashboard 首頁移除「未來 4 週現金預測」整張卡，只保留「本週財務」摘要
  （收入／支出／淨額、S-週-天、情境、近期戰績、合約狀態）＋ 進入財務頁的入口。
  資金警告仍在首頁露一個小標籤（見底週次／本週淨額為負），詳細預測到財務頁看。
- `FinanceScreen` 在餘額大卡之後、分頁之前新增一段集中呈現：
  本週收入／支出／淨額、**本週收支逐項明細**（與結算逐筆入帳的項目相同）、
  合約狀態（剩餘週數，≤2 週轉琥珀色並標「即將到期」）、
  未來 4 週現金預測（逐週資金與淨額、合約到期標記、資金見底警告）。
- 資料來源仍是 `currentWeekPreview()` 與 `cashForecast()`——即週結算會用的
  同一份 `buildWeekLines`。**沒有重算、沒有第二套狀態、沒有新增 Store 欄位。**
- 手機：預測卡改為**直向排列**（`useIsMobile()`，響應式唯一來源
  `src/ui/useViewport.js`）；金額一律 `whiteSpace: nowrap` ＋ 容器 `minWidth: 0`，
  長標籤以 ellipsis 截斷 ⇒ 不水平溢出。
- 驗證：`npm run build` 通過；`check_finance_n.mjs` 32/32、
  `check_finance_n2.mjs` 35/35（呈現層改動不影響經濟邏輯，數字未變）。
- **未經瀏覽器實測**：財務頁新版面、手機直向排列、320/360/390/430 響應式、
  警告配色。需人工驗收。

## Milestone N3（2026-08-04）— 開新局情境 ＋ 統一賽績

同分支 `milestone-n-finance`。**未 merge 回 main。**
範圍就是補完 N2 明確記錄在案的兩個缺口，不含商店與轉會。

### 缺口①：三種情境沒有入口 → 已補

- `profileStore.startNewGame(scenarioId)`：以指定情境開新局。
  資金 = 該情境 `startingFunds`（60／120／300 萬）、時間從第 1 天重新起算、
  交易帳本／贊助／賽績／冪等帳本全部清空。
  ⚠ 破壞性動作，UI 有兩段式確認。
- `src/screens/manage/NewGameScreen.jsx`：三張情境卡，各自顯示起始資金、
  基礎營收、營運成本與**起手週淨額**（已扣種子五人週薪）。
  選定後跳出紅框確認卡，明列會清掉哪些資料。
- Dashboard「更多」列新增「開新局」入口；AppShell 新增 `newGame` 路由。
- 新局刻意清空 `finance.transactions`：種子交易是 Legacy 展示樣本，
  留著會讓「近四週賽事獎金估計」憑空多出收入。

### 缺口②：MOBA 賽績沒進績效 → 已補

- `src/platform/economy/formLog.js`：統一賽績紀錄。
  勝負直接取自契約既有的 `MatchProgressTransaction.metadata.winner`
  （"us" | "enemy"，**兩種模式統一語意**），寫入點是 S25 唯一發獎點
  `applyMatchProgress` ⇒ MOBA 與 CS 一視同仁。
- **不是第二套統計**：不重新計算任何戰績，戰績來源仍是 BattleResult / seasonStore。
  本紀錄只服務經濟層的「近期狀態」，Result / Season / Dashboard 不得讀它算勝率。
- `recentForm()` 改讀 `economy.formLog`，回退順序：formLog → csHistory（舊存檔）→ 中性值。
- migration：舊存檔以 csHistory 種一次 formLog，避免升級後績效獎金莫名歸零。
- 冪等由 `applyMatchProgress` 的 transactionId 保證，`appendFormEntry` 另擋一次同 id。
  紀錄上限 20 筆，取樣視窗 `FORM.window`（6 場）。

### 驗證（2026-08-04 實跑）

- `node tools/check_finance_n3.mjs` → **40/40 通過**。含：
  三情境開新局的資金／時間／帳本／贊助狀態、薪資與營運成本、
  **四週預測與實際結算一致**（三種情境各驗一次）、
  簽贊助後預測看得到合約斷崖、
  **MOBA 勝場提高績效獎金／敗場歸零／CS 同樣有效／兩者一視同仁**、
  **週結算實際入帳金額確實隨賽績改變**（全勝淨 7.3 萬 vs 全敗淨 −0.2 萬）、
  賽績冪等與上限、舊存檔 migration、開新局後四週帳目相平。
- `check_finance_n.mjs` 32/32、`check_finance_n2.mjs` 35/35。
- `verify.mjs --only=progress25,talent27,experience26,cs23,regress,regress2,build` → 7/7。
- `npm run build` 通過。

⚠ 過程中 `progress25` §11 曾紅一次：該驗證器以**字串比對**確保 MOBA 路徑不碰
CS 的歷史清單，而我在 `applyMatchProgress.js` 的**註解**裡寫了那個識別字。
已改寫措辭（邏輯未動），並在該處留下提醒。

### ⚠ 新局起手是負現金流（數字正確，是否為預期需決策）

三種情境在**尚未簽贊助**時的起手週淨額：

| 情境 | 起始資金 | 週收入 | 週支出 | 週淨額 | 四週後 | 警告 |
|---|---|---|---|---|---|---|
| 新手 | 60 萬 | 6.0 萬 | 17.7 萬 | **−11.7 萬** | 13.2 萬 | warn |
| 一般 | 120 萬 | 12.0 萬 | 19.7 萬 | **−7.7 萬** | 89.2 萬 | warn |
| 頂級 | 300 萬 | 22.0 萬 | 22.7 萬 | **−0.7 萬** | 297.2 萬 | warn |

新手約 5 週見底 ⇒ 必須盡快簽贊助。這**可以**是刻意的開局壓力，
但也可能太緊（入門贊助「在地網咖」只有 6 萬/週，簽了新手仍是 −7.2 萬）。
**本輪未調整任何經濟數值**（使用者指定不改），列為平衡決策。

### 未做（刻意）

- 商店、轉會市場、合約談判 —— 使用者明確指定不做。
- 沒有碰 MOBA 戰鬥邏輯，沒有碰 `ESMO-hero-models` worktree。
- **瀏覽器實機驗收未做**：開新局畫面版面與確認流程、情境卡在 320–430 的排版、
  開新局後 Dashboard／財務頁的數字是否如預期。

## Milestone N3.1（2026-08-04）— 新手開局經濟平衡

同分支 `milestone-n-finance`。**只調新手情境**，一般與頂級數值一律不動。

### 問題

N3 交付後量到：新手情境無贊助時每週淨額 **−11.7 萬**，起始資金 60 萬
⇒ 約 5 週見底。開局壓力來得太早，玩家還沒站穩就先被財務追著跑。

### 作法：開局附帶「新創扶持計畫」

- `src/platform/economy/sponsors.js`（新增）——開局扶持方案的定義與
  **統一贊助解析入口** `resolveSponsor(id)`（市集目錄 → 扶持方案）。
  扶持方案**刻意不放進** `data/playerModel.js` 的 SPONSORS：那是 Legacy 的
  贊助市集目錄，任何人都能簽；扶持是開局贈與，不該出現在市集裡被重複簽。
- 內容：**14 萬/週 × 8 週**，一半固定、一半依戰績（沿用既有 `SPONSOR_SPLIT`），
  無簽約金，到期不續約。
- `SCENARIOS.rookie.starterSponsor = "rookie_grant"`；一般／頂級沒有這個欄位。
- 週結算、現金預測與**所有畫面**（Dashboard／財務頁／贊助頁）都改用
  `resolveSponsor` ⇒ 不會出現「經濟層有收入、但畫面說沒有贊助商」的不一致。

### 順手修掉一個會讓驗證器失真的問題

N3 時「開新局長什麼樣」寫在 `profileStore.startNewGame` 裡，驗證器只好自己再組
一份（它不能 import profileStore）。N3.1 加了扶持之後兩邊就不一致——
驗證器會綠燈，但驗的是**現實中不存在的狀態**。

⇒ 抽出 `src/platform/economy/newGame.js`：`newGameFinancials(scenarioId)` 是
新局財務起點的唯一定義，store 與 N3／N3.1 兩支驗證器共用同一份。

### 平衡結果（種子五人・戰績中性）

| 情境 | 開局贊助 | 起始資金 | 週收入 | 週支出 | 週淨額 | 四週後 |
|---|---|---|---|---|---|---|
| 新手 | 新創扶持 14萬×8週 | 60 萬 | 16.5 萬 | 17.7 萬 | **−1.2 萬** | 55.2 萬 |
| 一般 | 無 | 120 萬 | 12.0 萬 | 19.7 萬 | −7.7 萬 | 89.2 萬 |
| 頂級 | 無 | 300 萬 | 22.0 萬 | 22.7 萬 | −0.7 萬 | 297.2 萬 |

新手：**−11.7 萬 → −1.2 萬**（接近平衡的小幅虧損）。
成績仍然有意義：全勝 **+2.3 萬**、全敗 **−4.7 萬**。
扶持期末（第 8 週）資金 50.4 萬，不會在期限內見底；
到期後回到 −11.7 萬/週 ⇒ 扶持是**緩衝期**，不是永久補貼。

### 驗證（2026-08-04 實跑）

- `node tools/check_finance_n31.mjs` → **31/31 通過**。含：
  扶持只給新手、**一般／頂級週收支逐項數字不變**（回歸保護）、薪資公式未動、
  合約長度落在 6～8 週、開局淨額落在 −3～+1 萬、成績仍有意義、
  扶持期內不見底、**扶持不在贊助市集**、
  到期效果（領滿 8 週 → 清空 → 之後零入帳 → 回到 −11.7 萬）、
  四週預測含扶持且看得到到期斷崖、**預測與實際結算一致（含跨越到期點）**、
  不重複結算、帳目相平、存檔往返。
- `check_finance_n` 32/32、`check_finance_n2` 35/35、`check_finance_n3` 40/40。
  （N3 §2b 的前提「新局無贊助」對新手已不成立，期望值改為從設定推導。）
- `verify.mjs --only=progress25,talent27,experience26,cs23` 4/4；`npm run build` 通過。

### 未動 / 未驗

- **沒有改薪資公式、週結算架構，也沒有新增第二套資料來源**
  （扶持方案是 `resolveSponsor` 的第二個來源，但市集目錄仍然只有 SPONSORS 一份）。
- 沒有碰 MOBA 戰鬥邏輯、沒有碰 `ESMO-hero-models`，沒有開始商店或轉會。
- **瀏覽器實機驗收未做**：新局畫面的扶持說明卡、財務頁與贊助頁顯示扶持合約、
  四週預測在扶持到期前後的變化。

## Milestone O（2026-08-04）— 選手招募與隊伍養成基礎閉環

同分支 `milestone-n-finance`。**未 merge 回 main。**
背景：ESMO 未來以**線上連線對戰**為核心，新開局與單機財務不再深入擴充，
所以本輪的重點是「閉環可用」＋「資料契約要能被伺服器接管」。

### 動工前的現況分析（三個實際缺口）

`signProspect` 原本已經檢查名額與餘額並扣款，但：

1. **沒有呼叫 `save()`** —— 招募成功後不寫 localStorage，**重整就消失**。
2. **沒有重複招募保護** —— 同一位新秀可以無限簽、無限扣款、無限複製成多名選手
   （畫面雖有「已簽約」提示，但那是比對**名字**，不同批新秀撞名就誤判）。
3. **用 `Math.random()` 產士氣、`Date.now()` 產 id** —— 同一次招募無法重現，
   未來由伺服器發放／重播時對不起來。

### 交付

**契約**（`src/platform/contracts/recruitment.js`）— `RecruitmentTransaction.v1`：

- 冪等鍵 `recruit:<poolSeed>:<prospectId>:v1`，由「新秀池識別 + 池內編號」
  **決定性推導** ⇒ 同一位新秀不可能被簽兩次。
  日後 poolSeed 換成伺服器的池 id 即可，形狀不變。
- 交易單自帶**簽約當下的選手快照**（stats/potential/age/traits…）⇒
  伺服器日後即使改了新秀池演算法，既有合約仍能原樣重播。
- `validateRecruitmentTransaction`：不合法一律拒絕，不得部分套用。

**純 reducer**（`src/platform/recruit/applyRecruitment.js`）— 招募的唯一寫入點：

- 三道保護：**名額**（ROSTER_CAP 15）／**餘額**／**重複**（帳本冪等）。
- 一次寫完：名單、資金、交易帳本、招募帳本同一個 nextState
  ⇒ 不會出現「扣了錢沒進人」或「進了人沒扣錢」。
- **完全決定性**：選手 id 由冪等鍵推導（`r<seed>-<id>`），
  士氣由 potential 推導（72–92），沒有任何亂數與時鐘。
- receipt 帶 `reason`（`roster_full` / `insufficient_funds` / `invalid`）
  與 `alreadySigned`，畫面直接顯示，不必自己再判一次規則。

**Store**（schemaVersion 5 → 6）：新增 `recruitment: { signed: {} }` 帳本；
`signProspect(prospect, poolSeed)` 降為薄包裝（建單 → 套用 → **save()** → 收件匣）；
migration 對舊存檔給空帳本，**刻意不回填**既有選手的招募來源（那是編造歷史）。

**UI**（`RecruitScreen`）：新增圖形化狀態列——**名額量表**（15 格席次，滿了轉紅）、
可用資金、簽約結果回饋條；「已簽約」判定改讀招募帳本而非名字比對。

### 沒有建立第二套資料

- 選手唯一存放處仍是 `profileStore.players[]`；交易單只是入隊憑證。
- 資金唯一來源仍是 `finance.funds`；招募扣款走既有欄位並進既有交易帳本
  （`cat: "recruit"`，財務頁看得到）。
- 薪資仍由 N2 的 `economy/salary.js` 依能力推導；`players[].salary`
  是身價／轉會用欄位，週結算不讀它。

### 驗證（2026-08-04 實跑）

- `node tools/check_recruit_o.mjs` → **40/40 通過**。含契約與竄改防護、
  三道保護與邊界（剩最後一個名額仍可簽）、扣款與交易帳本、入隊欄位、
  **決定性重播逐欄相同**、連續招募 5 人、既有訓練系統對招募選手有效、
  存檔往返後重複招募仍被擋。
- `check_finance_n` 32/32、`n2` 35/35、`n3` 40/40、`n31` 31/31。
- `verify.mjs --only=progress25,talent27,experience26,cs23,build` 5/5。

### ⚠ 驗證過程發現的一件事（不是 bug，但要知道）

低潛力新秀**練到潛力上限，週薪仍停在下限 1.0 萬**。
原因是 N2 薪資公式的加項門檻是「綜合能力 60 / 等級 30」，
潛力 42 的新秀練滿也只有綜合 36.8，跨不過門檻。

高潛力新秀則會動：潛力 96 的新秀綜合 42.6 → 62.1、週薪 1.2 → 1.4 萬。

這是刻意的（便宜的人本來就便宜），但意味著**養成低潛力選手在經濟上沒有回饋**。
兩條都已寫成驗證器斷言，避免日後被誤當成 bug 修掉。

### 未做（刻意）

- 完整轉會市場、拍賣、市場即時交易、PvP 配對 —— 使用者明確指定不做。
- 沒有碰 MOBA 戰鬥邏輯、沒有碰 `ESMO-hero-models` worktree。
- **瀏覽器實機驗收未做**：招募狀態列、名額量表、簽約回饋條、
  320–430 響應式、實際簽約後 Roster／財務頁的變化。

### Milestone O Hotfix 1：招募詳情視窗白畫面（2026-08-04）

**症狀**：在招募頁點開任何一位新秀的詳情視窗 → 整頁白／黑畫面。

**根因**：`RecruitScreen` 的詳情視窗（第 203 行）仍引用 `signedNames`，
但那個變數在本輪已被移除（「已簽約」改讀招募帳本）。列表那一處有換掉，
**詳情視窗那一處漏了** ⇒ 一開啟詳情就 `ReferenceError: signedNames is not defined`，
React 整棵樹卸載 ⇒ 白畫面。

**修正**：`const isSigned = isSignedOf(sel);`（與列表同一個判定函式）。

#### ⚠ 這次暴露的驗證缺口（比 bug 本身重要）

- `npm run build` **抓不到**這種錯：它是 runtime ReferenceError，
  esbuild/rollup 不做未定義變數的作用域分析。
- `check_recruit_o.mjs` 只測**純邏輯**（contract / reducer / store），
  完全沒有涵蓋畫面 ⇒ 40/40 全綠但畫面是壞的。
- 專案目前**沒有 linter**（no-undef 這類規則正好會抓到這個）。

⇒ 結論：**UI 改動不能只靠 build 綠燈就宣稱完成**（03_開發規範 早有此條，
本輪違反了）。已在回報中列為「未經瀏覽器實測」，但仍應在交付前自行點過一次。
是否導入 ESLint（至少 `no-undef`）列為待決策項。

## Milestone O1（2026-08-04）— 隊伍名單與出賽陣容閉環

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 動工前的現況分析

| 面向 | 現況 |
|---|---|
| MOBA 陣容 | ✅ Milestone E 已有 `lineup`（席位→playerId）＋ `LineupScreen` 指派＋回寫 `playerId` |
| CS 陣容 | ❌ **完全沒有**——`CsPrepScreen` 拿 `status === "主力"` 的前五個，`toFpsRoster` 再用非主力遞補。誰上場看陣列順序，位置不符照上 |
| 名單分層 | ❌ 只有 `status`（"主力"/"預備隊"）兩種字串，沒有「未登錄」概念 |
| 出賽阻擋 | ❌ 不檢查。CS 只擋「不足 5 人」，MOBA 完全不擋 |
| 伺服器可驗證性 | ❌ 沒有提交契約 |

### 交付

**契約**（`src/platform/contracts/matchSquad.js`）— `MatchSquad.v1`：

- **名單分層** `ROSTER_TIERS`：`active`（一隊）／`bench`（替補）可出賽，
  `unlisted`（未登錄）不可。舊存檔由 `status` 推導，**不把任何人踢出名單**。
- `validateSquad()` 產生**可直接顯示的中文理由**，不是布林值：
  `empty_seat` / `unknown_player` / `duplicate_player` / `ineligible` / `role_mismatch`。
  位置不符預設是**警告**（允許刻意換位），`strictRole` 時升級為阻擋。
- `createSquadSubmission()` — **只含 playerId 與席位，刻意不帶任何數值**。
  這是「不信任前端提交的數值」的落實：伺服器拿 playerId 自己查真實資料。
  `validateSquadSubmission()` 會明確拒絕夾帶 `stats/power/tough/lv/rating` 的提交單。
- `autoFillSquad()` — 一隊優先、定位相符優先；未登錄永遠不填。

**CS 陣容**：新增 `csLineup`（f1–f5，對齊 `MOBA2FPS` 的定位對位），
`toFpsRoster(players, csLineup)` **依陣容取人**，缺人回 `null`（不虛構陣容）。
沒有陣容時退回舊行為，舊存檔與既有 fixture 不受影響。

**Store**（schemaVersion 6 → 7）：`csLineup` ＋ `players[].rosterTier`；
新增 `setRosterTier` / `setCsSeat` / `autoFillLineup` / `squadCheck` / `squadSubmission`。
把人設為未登錄時，會**一併把他從兩份陣容移除**——否則會留下「不能上場卻還坐在
席位上」的矛盾，等到出賽才報錯太晚。

**UI**：
- `RosterScreen` 的「主力／預備隊」改為三層分層鈕（一隊／替補／未登錄）＋說明。
- `LineupScreen`（MOBA）與 `CsPrepScreen`（CS）加上**出賽閘門**：
  不合法就停用出賽鈕，並逐條列出理由，附「⚡ 自動填入」一鍵修復。
  位置不符另以琥珀色警告呈現（仍可出賽）。

### 驗證（2026-08-04 實跑）

- `node tools/check_squad_o1.mjs` → **40/40 通過**。含五個要害：
  分層與舊存檔推導、五種阻擋理由（訊息是中文不是錯誤碼）、
  MOBA/CS 陣容獨立且都指回 `players[]`、
  **CS 引擎名單依陣容取人而非陣列順序**、
  **賽後 XP 寫到實際出賽的 playerId**（席位換成替補 p6 ⇒ 寫給 p6，不是 p1 也不是席位 id）、
  提交單無數值且夾帶數值一律拒絕、自動填入不碰未登錄且零位置警告。
- `check_recruit_o` 40/40、`check_finance_n/n2/n3/n31` 32/35/40/31、
  `verify.mjs --only=progress25,talent27,experience26,cs23,build` 5/5。

### 未做（刻意）

- 轉會市場、拍賣、即時 PvP 配對、後端連線 —— 使用者明確指定不做。
- CS 陣容目前**沒有專屬的指派畫面**：可用「自動填入」或先在 MOBA 側調整；
  獨立的 CS 指派 UI 列為後續。
- **瀏覽器實機驗收未做**：三層分層鈕、兩個出賽閘門、自動填入、320–430 響應式。

## Milestone O2（2026-08-04）— 選手出賽與養成回饋閉環

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 動工前的分析

| 面向 | 現況 |
|---|---|
| 只有出賽者拿經驗 | ✅ 結構上已成立（`applyProgressToState` 只迭代 `tx.playerProgress`，而那是 adapter 依實際陣容產生的名單）——但**沒有任何驗證在守它** |
| MOBA / CS 回寫 | ✅ MOBA 走 `seatPlayers`、CS 走 `_gid`（O1 已確認） |
| 疲勞 | ❌ **比賽完全不消耗體力**，只有訓練會扣 ⇒ 連續出賽零代價，替補與輪換沒有意義 |
| 近期狀態 | ❌ 只有由體力導出的 `condition` 文字，沒有出賽紀錄 |
| 受傷 | ❌ 不存在 |
| 名單頁顯示 | ❌ 只有等級數字，沒有經驗進度／體力／可否出賽 |

### 交付

**`src/platform/condition/playerCondition.js`**（純函式）：

- **出賽損耗**：單場 −12 體力，**連續出賽每多一場再多扣 3**（第 4 場扣 21）
  ⇒ 輪換有實際意義。
- **受傷風險**：基礎 2%；體力 < 30 時改用 12% 基準；連續出賽每場 +2%，上限 35%。
  傷停 2–6 天。**刻意不做**複雜醫療系統（沒有部位、療程、復健）。
- **恢復**：每日自然 +8 體力（有排訓練的人由 `applyCourse` 處理，不重複計算）；
  傷停每日 −1 天；隔天沒出賽就把連續出賽計數歸零。
- **不可出賽**：體力 < 15 或傷停中，理由是可直接顯示的中文句子。

**決定性（伺服器要能重算）**：受傷判定用 `transactionId + playerId` 的 FNV-1a 雜湊，
**沒有 `Math.random()`、沒有時鐘**。同一場比賽重播逐欄相同 ⇒ 伺服器可獨立驗算，
不必信任前端提交的狀態。與 S25 發獎、Milestone O 招募是同一套手法。

**接線**：損耗掛在 `applyProgressToState`——**S25 既有的單一結算入口**。
好處是三件事一次到位：只有出賽者會被套用（替補／未登錄根本不在名單裡）、
沿用既有的 transactionId 冪等（不會重複扣體力）、receipt 逐人回報狀態變化可稽核。

**閘門**：`matchSquad.validateSquad` 新增 `injured` / `exhausted` 兩種阻擋，
`autoFillSquad` 不會選到不可出賽的人。

**UI（名單頁）**：
- 列表卡：可出賽／傷停 N 天標籤（**顏色配文字**）＋ EXP 與體力兩條細軸。
- 詳情：出賽狀態區塊——等級與經驗進度、體力與狀態文字、連續出賽場數、
  傷停天數、近期出賽場數，不可出賽時顯示理由。

### 驗證（2026-08-04 實跑）

`node tools/check_condition_o2.mjs` → **30/30 通過**。要害逐項：

- **替補與未登錄零經驗、零損耗**（體力、連續出賽計數都沒動）；receipt 只含 5 人。
- **換上替補 ⇒ 經驗與損耗都落在替補**，原先發完全沒動（MOBA 與 CS 各驗一次）。
- CS 的 `playerId === null`（引擎示範陣容）不發經驗，不虛構選手。
- 連續出賽消耗遞增 **12 → 15 → 18 → 21**；受傷機率 0.020 → 0.120 且有上限。
- 休息一天回體力並把連續出賽歸零；有排訓練不重複回體力；傷停每天 −1。
- 體力剛好在門檻上仍可出賽（邊界不誤擋）。
- **重播逐欄相同**；同一場再結算完全不寫入。
- **前端灌水的 `previousXp` / `newLevel` 一律無效**——交易單宣稱 Lv99，
  實際仍以 Store 現值重算為 Lv3。

其餘回歸：`check_squad_o1` 40/40、`check_recruit_o` 40/40、
`check_finance_n/n2/n3/n31` 32/35/40/31、
`verify.mjs --only=progress25,talent27,experience26,cs23` 4/4、build 通過。

### 未做（刻意）

- 轉會市場、拍賣、即時配對、正式後端 —— 使用者明確指定不做。
- 複雜醫療系統（部位／療程／復健／二次傷害）—— 明確排除。
- **瀏覽器實機驗收未做**：名單頁的兩條細軸與出賽狀態區塊、閘門在傷停時的顯示、
  320–430 響應式。

## Milestone O3（2026-08-04）— 線上出賽提交與驗證契約

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 定位

O1 的 `MatchSquad.v1` 回答的是「這份陣容合法嗎、要提交什麼」，那是**陣容的描述**。
O3 補的是**一次出賽申請**：我是誰、用哪一份名單、誰坐哪個席位、這次申請的識別碼，
以及伺服器要怎麼獨立驗證、偵測名單漂移、日後重播。

**目前沒有真正的後端**；本機模擬入口照舊，這一輪只是把資料形狀先定下來，
讓連線那天不必重做。

### 交付：`MatchEntryRequest.v1`（`src/platform/contracts/matchEntry.js`）

**只送身分，不送數值**（延續 O1 紅線並擴大檢查）：

| 送 | 不送 |
|---|---|
| playerId、seat、位置（role / seatRole）、名單分層 | 能力值、體力、士氣、傷害、戰力、等級、經驗、評分 |
| 隊伍版本、隊伍識別、提交時間 | 任何前端自算的結果 |

`validateMatchEntryRequest` 會**遞迴掃描整張申請單**（含 `squad` 每一列），
發現 `FORBIDDEN_VALUE_KEYS` 裡任何欄位就拒絕。

**隊伍版本 `rosterVersion`**：由「名單成員 id ＋ 名單分層 ＋ 陣容指派」推導的雜湊，
**不含任何能力數值** ⇒ 練功、升級、受傷都不會讓版本失效；
只有換人、改分層、改陣容才會。伺服器用它偵測「客戶端拿舊名單送單」。

**決定性 transactionId ＋ 陣容快照**：
`entry:<mode>:<rosterVersion>:<seatsHash>:s<賽季>w<週>d<天>`。
同一份陣容同一天送兩次 ⇒ 同一個 id ⇒ 伺服器天然可去重；
換人或換天就是不同場次。快照讓伺服器日後能原樣重播這次申請，
不需要保存整個客戶端狀態。

**UI**：新增共用元件 `src/screens/common/MatchEntryPanel.jsx`，
MOBA 與 CS 兩個賽前頁共用（不各寫一份判斷與版面）：
通過時顯示綠標、隊伍版本、申請識別與可展開的「提交內容」明細
（並註明能力數值不會提交）；未通過時逐條列出理由並提供「⚡ 自動填入」。
位置不符以琥珀色警告呈現，仍可提交。

### 驗證（2026-08-04 實跑）

`node tools/check_match_entry_o3.mjs` → **35/35 通過**。要害逐項：

- 序列化後**不含**任何 `stats/power/energy/rating/lv/xp/dmg`；
  頂層與**巢狀**夾帶數值都會被遞迴掃出來並拒絕。
- 六種阻擋各驗一次：缺人／不存在／重複／未登錄／**傷停**／**體力不足**
  （後兩者來自 O2 的 `matchFitness`，規則沒有第二份）。
- 失敗時 `request` 為 `null`——**不送半套申請**；理由是中文句子不是錯誤碼。
- 同陣容同日 ⇒ 同一個 id；換人或換天 ⇒ id 改變。
- **練功／升級／受傷不會改變隊伍版本**；改分層或改陣容才會。
- 伺服器端模擬驗證：竄改 transactionId、換掉陣容沿用舊 id、
  schema/mode 竄改、席位數不符，全部拒絕；
  且**以伺服器自己的名單重驗資格**——客戶端送單時還健康、伺服器端已受傷，一樣擋得下。

其餘回歸：`check_condition_o2` 30/30、`check_squad_o1` 40/40、`check_recruit_o` 40/40、
`check_finance_n/n2/n3/n31` 32/35/40/31、`verify.mjs` 5 區段全過、build 通過。

### 未做（刻意）

- 真正的後端、即時配對、排行榜、轉會市場 —— 使用者明確指定不做。
- 申請單**不持久化**：`matchEntry(mode)` 是唯讀、隨用隨產。
  要保留送單歷史等有後端再說（現在存了也只是本機資料）。
- **瀏覽器實機驗收未做**：申請面板在兩個賽前頁的版面、展開明細、
  320–430 響應式。

## Milestone O4（2026-08-04）— 線上配對票券與等待狀態

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 定位

O3 產生了出賽申請單，但「按下配對之後發生什麼事」沒有形狀：沒有排隊狀態、
沒有等待、沒有取消、沒有拒絕理由，也沒有「對手由誰決定」的界線。O4 補的就是這一段。

### 交付

**`MatchmakingTicket.v1`**（`src/platform/contracts/matchmaking.js`）

六種狀態：`idle` / `validating` / `queued` / `matched` / `cancelled` / `rejected`。
**轉移規則寫在契約裡**，畫面與 Store 都不得自己判斷——
`transitionTicket` 是唯一入口，非法轉移一律拒絕並附中文理由
（例：「無法從『驗證中』變更為『已配對』」）。
`ticketId` 由 O3 申請單的 transactionId 決定性推導 ⇒ 重複建票同一個 id。

**`MatchAssignment.v1`** —— 配對結果**只能由 gateway 簽發**。契約明確擋掉：

- 夾帶比賽結果（`winner` / `result` / `score` / `rewards` / `mvp` / `kills` / `outcome`）
- 對手夾帶戰力數值（`power` / `stats` / `rating` / `lv`）
- 指派單與票券不符、缺對手、缺種子、未標明簽發者

**`src/platform/matchmaking/mockGateway.js`** —— 本機**決定性**模擬，不是後端。
等待秒數（3–9s）、對手、對戰種子全部由 ticketId 雜湊推導 ⇒ 驗證器驗得動。
**每次輪詢都用當下的名單重新驗證資格**：排隊中受傷、被改成未登錄、離隊，
一律 `rejected` 並附中文原因。日後換成真伺服器只要換掉這一支。

**Store**（schemaVersion 7 → 8）：`matchmaking.ticket` 單一票券；
`enqueueMatch` / `pollMatchmaking` / `cancelMatchmaking` / `resetMatchmaking` /
`matchmakingView`。**同一隊伍同時只能有一張有效票券**——重複按不會產生第二張。
migration：載入時把殘留的 `validating` / `queued` 作廢成 `cancelled`
（沒有伺服器會回應一張跨 session 的票，讓玩家看到永遠不會有結果的排隊更糟）。

**UI**：新增共用元件 `src/screens/common/MatchQueuePanel.jsx`，
MOBA 與 CS 兩個賽前頁共用同一套流程與版面（不新增第二套資料來源）：
排隊中顯示等待計時、模式、隊伍版本、票券碼與三點等待動畫＋取消鈕；
配對成功顯示對手、種子、簽發者與「進入對戰」；被拒絕顯示中文原因並可重新配對。

### 驗證（2026-08-04 實跑）

`node tools/check_matchmaking_o4.mjs` → **47/47 通過**。要害逐項：

- 六種狀態齊全；非法轉移（終局狀態再變更、跳過中間狀態）全部拒絕。
- **取消後不可進場**、**被拒絕後不可進場**、已配對但指派單被抽掉也不可進場。
- 五種夾帶比賽結果的指派單逐一拒絕；對手夾帶戰力數值拒絕。
- mock gateway 決定性：同票券重複輪詢逐欄相同。
- **排隊期間資格改變 → 拒絕**：受傷／未登錄／離隊各驗一次，
  且不必等到時間到就會被擋。
- MOBA 與 CS 走同一套契約與狀態，票券彼此獨立。

⚠ 驗證器抓到契約的一個真漏洞：`Number(null)` 是 `0`，
所以原本的 `Number.isFinite(Number(a.seed))` 會讓 `seed: null` 矇混過關。
已改為檢查型別（`typeof a.seed !== "number"`）。

其餘回歸：`check_match_entry_o3` 35/35、`check_condition_o2` 30/30、
`check_squad_o1` 40/40、`check_recruit_o` 40/40、
`check_finance_n/n2/n3/n31` 32/35/40/31、`verify.mjs` 5 區段全過、build 通過。

### 未做（刻意）

- 真正的後端、WebSocket、排行榜 —— 使用者明確指定不做。
- 輪詢目前由畫面的 1 秒計時器驅動；接上真伺服器改成訂閱推播即可，
  狀態流程與版面都不必改。
- **瀏覽器實機驗收未做**：排隊面板在兩個賽前頁的版面、等待動畫、
  取消與重新配對、320–430 響應式。

## Milestone O5（2026-08-04）— 比賽房間與雙方確認

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 定位

O4 配對成功後拿到 `MatchAssignment`，但「進對戰之前雙方要不要確認」沒有形狀：
沒有房間、沒有確認、沒有倒數、沒有逾時，也沒有「舊票券能不能進新房間」的界線。

### 交付：`MatchRoom.v1`（`src/platform/contracts/matchRoom.js`）

五種狀態：`waiting` / `ready_check` / `confirmed` / `cancelled` / `expired`。
轉移表寫在契約裡，`transitionRoom` 是唯一入口，非法轉移附中文理由
（例：「房間無法從『等待就緒』變更為『雙方已確認』」）。

**三條紅線**：

1. **房間由 gateway 開**：`roomId` 由 assignmentId 決定性推導、帶 `issuedBy`。
   客戶端自造的房間（無簽發者）**拒絕進場**。
2. **雙方都確認才可進場**：只有一方確認不行；未雙方確認時硬轉 `confirmed` 也擋。
3. **房間與票券＋指派單綁定**：拿別張票券、票券換新、指派單被抽換，一律拒絕
   ——**舊票券進不了新房間**。

**確認倒數** 20 秒。逾時後不可再確認、不得進場，理由是中文句子。
**防重複**：重複確認拒絕（`already_confirmed`）；同一張指派單重複開房得到同一個
roomId，不會產生第二間。

**mock gateway 擴充**（仍是純函式決定性模擬，不是後端）：
`openRoom` 簽發房間；`pollRoom` 驅動 `waiting → ready_check`、對手確認（2–8 秒，
一定小於倒數）、逾時。

**Store**（schemaVersion 8 沿用）：`matchmaking.room`；
`openMatchRoom` / `pollMatchRoom` / `confirmMatchReady` / `cancelMatchRoom` / `matchRoomView`。
⚠ `pollMatchRoom` 會先檢查票券——票券被取消／被拒絕／換了新票，房間直接關閉，
不讓人靠舊票券進場。migration：載入時把殘留的 `waiting` / `ready_check` 作廢。

**UI**：沿用 O4 的共用面板 `MatchQueuePanel`（不另開頁面、不大幅重構）。
配對成功後顯示房間狀態、**我方／對手兩格確認指示**、倒數（剩 5 秒轉紅）、
「我方確認」與「取消對戰」；雙方到齊才出現「進入對戰」。

### 驗證（2026-08-04 實跑）

`node tools/check_match_room_o5.mjs` → **45/45 通過**。要害逐項：

- 五種狀態齊全；跳過確認直接進 `confirmed`、終局狀態再變更，全部拒絕。
- 我方確認後**仍不可進場**；只有對手確認也不行；雙方到齊才自動進 `confirmed`。
- 逾時後不可再確認、**不得進場**；取消後不得進場，皆附中文原因。
- 重複確認（我方與對手各驗一次）拒絕；非確認階段不能確認。
- 同一張指派單重複開房 → 同一個 roomId。
- **拿別張票券進房間 → 拒絕**；票券換新、指派單被抽換、票券沒有指派單，全部拒絕。
- **自造房間（無簽發者）→ 拒絕進場**。
- mock gateway 決定性：同房間重複輪詢逐欄相同。
- MOBA 與 CS 共用同一套契約，房間彼此獨立。

其餘回歸：`check_matchmaking_o4` 47/47、`check_match_entry_o3` 35/35、
`check_condition_o2` 30/30、`check_squad_o1` 40/40、`check_recruit_o` 40/40、
`check_finance_n/n2/n3/n31` 32/35/40/31、`verify.mjs` 5 區段全過、build 通過。

### 未做（刻意）

- 真正的後端、WebSocket、聊天、排行榜 —— 使用者明確指定不做。
- 對手在 mock 裡**一定會確認**（2–8 秒）；契約支援對手拒絕，但 mock 不模擬，
  以免本機流程變得不可預測。拒絕路徑由驗證器直接測。
- **瀏覽器實機驗收未做**：房間面板、雙方確認指示、倒數、逾時與取消、
  320–430 響應式。

## Milestone O6（2026-08-04）— 正式對戰場次與進場

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 定位

O5 結束於「雙方都確認了」。但確認完到真的開打之間還有一個缺口：
**誰有資格啟動這場比賽、可以啟動幾次、用什麼參數啟動。**
沒有這一層的話，畫面只要呼叫一次進場函式就能開打，而且可以呼叫很多次
（重整、連點、回上一頁再進來），每次都是一場新比賽。

### 交付：`MatchSession.v1`（`src/platform/contracts/matchSession.js`）

四種狀態：`created`（待啟動）/ `launched`（已啟動）/ `cancelled` / `expired`。

**綁定**：roomId、assignmentId、ticketId、模式、**雙方隊伍版本**、比賽 seed、
`issuedBy`。任何一項對不上就拒絕啟動。

**一次性 launchToken**：`consumeLaunchToken` 是唯一入口。拒絕的情況全部附中文原因：

| 情況 | 訊息 |
|---|---|
| 令牌已用過 | 本場比賽已經啟動過，無法重複進入 |
| 令牌不符 | 啟動憑證無效 |
| 場次逾期（300 秒） | 場次已逾期，請重新配對 |
| 場次取消 | 已取消本場比賽 |
| 舊票券 | 場次與目前票券不符（舊票券不可啟動比賽） |
| seed 被竄改 | 場次的對戰種子與配對結果不符 |
| 自造場次 | 場次未標明簽發者，拒絕啟動 |

**啟動參數**由場次提供：`{sessionId, mode, seed, opponentId, opponentName, issuedBy}`
——**沒有陣容、沒有能力數值、沒有比賽結果**。seed 沿用 gateway 在配對時決定的那一個，
前端無從指定。

**不重複建立比賽**：`sessionId` 由 roomId 決定性推導，同一房間重複簽發回同一場次、
同一個令牌。

**重整恢復**：`created` 狀態的場次**刻意在 migration 中保留**（這是需求明確要求的）；
把關不靠「載入時清掉」，而靠 `consumeLaunchToken` ——
已啟動的場次重整後仍然不可再啟動（`tokenUsed` 會被存下來）。

**Store**：`matchmaking.session` / `matchmaking.launch`；
`createMatchSession` / `launchMatchSession` / `cancelMatchSession` / `matchSessionView`。

**UI**：沿用 O4/O5 的共用面板（不另開頁面、不大幅重構）。
雙方確認完成後自動簽發場次並顯示場次識別與狀態；
「進入對戰」改為**先消耗一次性令牌，成功才真的進場**，失敗顯示中文原因。

### 驗證（2026-08-04 實跑）

`node tools/check_match_session_o6.mjs` → **36/36 通過**。要害逐項：

- 房間尚未雙方確認 → 不得簽發；房間與票券不符 → 不得簽發。
- **首次使用令牌成功、第二次拒絕**（重複進場）。
- 逾期／取消／房間不符／舊票券／指派單被抽換／seed 被竄改／自造場次，全部拒絕。
- 啟動參數欄位固定為六個識別欄，序列化後不含 stats/power/roster/winner/score。
- 同一房間重複簽發 → 同一個 sessionId 與同一個令牌。
- **重整後未啟動的場次仍可啟動；已啟動的場次重整後仍不可再啟動。**
- MOBA 與 CS 共用同一套契約，CS 同樣是一次性令牌。

其餘回歸：`check_match_room_o5` 45/45、`check_matchmaking_o4` 47/47、
`check_match_entry_o3` 35/35、`check_condition_o2` 30/30、`check_squad_o1` 40/40、
`check_recruit_o` 40/40、`check_finance_n/n2/n3/n31` 32/35/40/31、
`verify.mjs` 5 區段全過、build 通過。

### ⚠ 誠實揭露：seed 尚未driven 引擎

`launch.seed` 目前**存進 `matchmaking.launch` 供對戰入口讀取，但還沒有接到
LogicEngine 的實際亂數種子**。要接需要改 GameView / LoadingScreen 的參數傳遞，
那超出「不大幅重構、不修改既有戰鬥演算」的範圍，因此列為後續項。
現階段的保證是：**沒有有效場次與未使用的令牌就進不了對戰入口**。

### 未做（刻意）

- 真正的後端、WebSocket、聊天、排行榜、觀戰 —— 使用者明確指定不做。
- 沒有修改任何既有戰鬥演算。
- **瀏覽器實機驗收未做**：場次識別顯示、進入對戰、重複進場被擋、
  320–430 響應式。

## Milestone O7（2026-08-04）— 權威場次、恢復與單次結算

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 1. 權威戰鬥啟動（補上 O6 明確欠下的那一條）

`src/useLocalServer.js:108` 原本是 `const seed = (Date.now() & 0xffff) | 1;`
——引擎自己用時鐘產生 seed。現在改為：

```js
const authoritative = Number.isFinite(opts.seed);
const seed = authoritative ? ((opts.seed >>> 0) | 1) : ((Date.now() & 0xffff) | 1);
```

- `GameView` 從 **Store** 讀 `matchmaking.launch`（由 O6 一次性令牌寫入），
  **刻意不接受 props 傳入 seed** ⇒ 前端無法覆寫 seed、對手或場次資料。
- 引擎要求奇數 seed，因此做一次**決定性**正規化 `| 1`——同一個 session seed
  永遠映射到同一個引擎 seed。
- 沒有場次時（debug harness / 舊路徑）才退回時鐘，並在 replay capture 標記
  `seedSource: "local"`，讓追蹤看得出這一場不是權威場次。

**實測**：同一 seed 兩個引擎的初始快照**逐位元相同**；跑 200 tick 後結果也相同；
不同 seed 則不同（測試有檢定力）。

### 2. 場次恢復

`MatchSession` 擴充生命週期：
`created → launched → completed / abandoned`（＋ `cancelled` / `expired`），
另有正交的 `connection: connected / disconnected`。

⚠ **`launched` 不再是終局**——比賽開打後還要能恢復。終局改為
`completed / abandoned / cancelled / expired`。

`resumeSession()` **不開新場、不再消耗令牌**，回傳的 launch 與首次啟動**逐欄相同**
（同 seed ⇒ 同初始狀態）。拒絕恢復的情況全部附中文原因：
尚未啟動／已取消／已放棄／已完成／已逾期／票券不符／seed 被竄改／無簽發者。

### 3. `MatchResult.v1`

綁定 sessionId、matchId、雙方隊伍版本、seed、winner、score、durationSec、resultSource。

- `resultId` 由**內容雜湊**推導 ⇒ 同一份結果重送得到同一個 id；
  **同一場送不同結果 ⇒ 雜湊不同 ⇒ 立即偵測衝突並拒絕**。
- `resultSource` 只接受 `engine` / `server`。客戶端自稱的 `client` / `manual` 拒絕。
- 竄改勝負、比分或時長 ⇒ resultId 對不上 ⇒ 被抓出來。
- 內容雜湊刻意只取會影響結算的欄位（時長四捨五入），避免時間戳造成假衝突。

### 4. 單次結算

`src/platform/progress/settleMatchResult.js` **不建立第二套結算流程**：
驗證通過後一律委派 **S25 的 `applyMatchProgress`**（唯一發獎入口）。它只負責
「該不該讓那一步發生」與「記錄」。

- 同一份結果重送 ⇒ 回既有 receipt，**完全不寫入**。
- 驗證失敗 ⇒ 不入帳，但**保存失敗原因**（`lastSettlementError`）。
- **中斷後重試安全**：失敗時沒有任何寫入（不會只完成一半），重試成功且只入帳一次。
- 實測：資金 100 萬 → 112 萬（一次）、經驗 +60（一次）、體力 95 → 83（一次）；
  重送後三者都沒有再變動。

### 5. 完整追蹤鏈

`ticketId → assignmentId → roomId → sessionId → matchId → resultId → settlementId`
（另附 transactionId）。`matchTrace()` 供 debug 查看，
**刻意不回傳 launchToken**；面板的追蹤區塊只在 `isDebugMode()` 時顯示。

### 驗證（2026-08-04 實跑）

- `node tools/check_authoritative_o7.mjs` → **48/48 通過**。涵蓋需求列出的每一項：
  正常啟動、重複啟動、seed 篡改、重整恢復、斷線恢復、取消、逾時、
  結果重送、衝突結果、結算中斷重試，以及
  **相同 seed ＋ 相同陣容可重現相同初始狀態與結果**、
  **同一場重送不會重複加錢／經驗／戰績或重複扣體力**。
- O0–O6 全數重跑：`check_match_session_o6` 36/36、`check_match_room_o5` 45/45、
  `check_matchmaking_o4` 47/47、`check_match_entry_o3` 35/35、
  `check_condition_o2` 30/30、`check_squad_o1` 40/40、`check_recruit_o` 40/40。
- 財務：`check_finance_n/n2/n3/n31` 32/35/40/31。
- `verify.mjs --only=progress25,talent27,experience26,cs23,regress,regress2,build` → **7/7**。

#### ⚠ 既有驗證變紅 → 已修正（未放寬門檻）

`check_match_session_o6` 的兩條因為 O7 合理改變語意而變紅：

1. `1f` 原本斷言 `SESSION_TERMINAL.length === 3`。
2. `6d` 原本斷言 `isSessionTerminal(launched) === true`。

O7 之後 `launched` 不再是終局（要能恢復）。修法是**改成逐項比對整組終局狀態**
（`abandoned,cancelled,completed,expired`）並額外斷言 `launched` 不在其中——
比原本只比長度**更嚴格**，不是放寬。

### 已知限制（誠實揭露）

1. **沒有真正的後端**：場次、房間、結果裁決全部由本機 mock gateway 決定性模擬。
   「權威」目前指的是**客戶端內部的單一權威來源**（場次 → 引擎），
   不是「伺服器裁決」。
2. **結果仍由本機引擎產生**：`resultSource: "engine"` 是誠實標記，
   契約已預留 `server`。真正的伺服器裁決要等後端。
3. **對手隊伍版本是推導值**：`rosterVersions.opponent` 由對手 id 雜湊而來
   （本機沒有對手的真實名單）。
4. **`reportMatchResult` 尚未接進賽後流程**：目前由驗證器直接呼叫。
   要讓實際打完的比賽走這條路，需要在 `useBattleFeed` / Result 畫面接線，
   那會動到既有賽後流程，超出「不大幅重構」的範圍。
5. 追蹤鏈只存最近一場（`lastResult` ＋ `settlements`），沒有歷史查詢介面。

### 人工驗收清單（未經瀏覽器實測）

1. MOBA 賽前配置 → 開始配對 → 雙方確認 → 進入對戰，確認能正常開打。
2. 用 `?debug=1` 開啟，面板底部應出現 DEBUG 追蹤鏈，且**看不到 launchToken**。
3. 進對戰後重整頁面，確認場次仍在（不會變成新的一場）。
4. 重複按「進入對戰」應被擋（O6 已驗，這輪未改動該路徑）。
5. 手機 320 / 360 / 390 / 430 寬度下面板不水平溢出。

### 未做（刻意，依本輪限制）

- 真正的後端、WebSocket、帳號登入、聊天、排行榜、觀戰、正式反作弊。
- 未修改 MOBA／CS 戰鬥平衡與英雄 AI（`regress` / `regress2` 皆綠可佐證）。
- 未碰 `ESMO-hero-models` worktree。

## Milestone O7.1（2026-08-04）— 真實賽後流程接入 O7

同分支 `milestone-n-finance`。**未 merge 回 main。**
補完 O7 明確記錄的那個缺口：`reportMatchResult` 原本只有 verifier 在走。

### 動工前的現況

| 模式 | 賽後結算點 | 問題 |
|---|---|---|
| MOBA | `useBattleFeed.js` 終局分支 → `profile.applyMatchProgress(tx)` | 直接呼叫 S25，繞過 O7 |
| CS | `settleCsMatch()` → `applyMatchProgress(tx)` | 同上 |

兩條路都沒有場次綁定與衝突偵測。

### 交付：唯一結算邊界

新增 `src/platform/progress/settleMatchBoundary.js`，兩條真實流程都改走它：

```
比賽結束 → settleMatchThroughSession()
             ├─ 有場次 → reportMatchResult()（O7：綁定／防重送／防衝突／追蹤鏈）
             └─ 無場次 → applyMatchProgress()（S25，並標記 viaSession: false）
                    ↑ 兩條最後都由 S25 實際入帳——**沒有第二套結算**
```

另附兩個純轉換函式 `outcomeFromBattleResult` / `outcomeFromCsResult`——
**不重新統計**，winner / score / duration 全部照抄既有結果契約。

### ⚠ 實作時抓到的自己的漏洞

第一版把「可用場次」判定為 `state === launched`。但**首次結算會把場次標成
`completed`**，於是第二次回報（Result 畫面重整、重送）就退回 S25 路徑——
S25 本身冪等所以不會重複入帳，**但拿不到 O7 的 receipt，也不會偵測衝突**，
等於「同一場送不同勝負」會被默默忽略而不是拒絕。

驗證器的 3c / 4 / 4b / 5 / 5b / 5d / 6c / 6d 一次抓出這個問題。
修法是把 `completed` 也納入可用場次。

### 沒有場次時的取捨（誠實揭露）

debug harness（`?debug=moba-runtime-battle`）或舊流程可能在沒有 MatchSession 的
狀態下打完一場。這時**仍走 S25 入帳**（否則獎勵會憑空消失），但回傳
`viaSession: false` 明確標記那一場未經權威驗證。
寧可標記清楚，也不要讓玩家的獎勵默默不見。

### 驗證（2026-08-04 實跑）

`node tools/check_result_flow_o71.mjs` → **27/27 通過**。這支**實際操作
profileStore**，走的就是真實流程用的那些函式，不是純契約測試。涵蓋：

1. **正常打完一場只結算一次**：資金 100 萬 → 109 萬、經驗 +50、體力 85 → 73，各一次。
2. **Result 畫面重整不重複結算**：資金／粉絲／經驗／體力都沒有再變動。
3. **重送相同結果 → 同一個 settlementId**，第二次標記 `alreadySettled`。
4. **重送不同勝負 → 拒絕**，原因為中文（「本場已回報過不同的結果…」），且完全沒有入帳。
5. **MOBA 與 CS 共用同一條流程**（CS 的重送與衝突各驗一次）。
6. **全庫掃描**：除了 store 自身、邊界與 O7 結算層，**沒有任何呼叫點直接呼叫
   `applyMatchProgress`**。

回歸全綠：`check_authoritative_o7` 48/48、`check_match_session_o6` 36/36、
`check_match_room_o5` 45/45、`check_matchmaking_o4` 47/47、
`check_match_entry_o3` 35/35、`check_condition_o2` 30/30、`check_squad_o1` 40/40、
`check_recruit_o` 40/40、`check_finance_n/n2/n3/n31` 32/35/40/31、
`verify.mjs --only=progress25,talent27,experience26,cs23,regress,regress2,build` **7/7**。

### 仍然沒做（本輪限制）

- 未修改戰鬥演算、平衡、AI（`regress` / `regress2` 綠可佐證）。
- 未改 UI 主架構——只換了兩個結算呼叫點，畫面完全沒動。
- 未碰 `ESMO-hero-models`。
- 仍然沒有真正的後端：`resultSource` 仍是 `engine`（本機引擎產生），
  契約已預留 `server`。

### 人工驗收清單（未經瀏覽器實測）

1. 完整打完一場 MOBA，確認 Result 畫面的獎勵數字正常。
2. 在 Result 畫面重整，確認資金／經驗**沒有再增加**。
3. 打完一場 CS，重複上述兩步。
4. 用 `?debug=1` 看追蹤鏈，`settlement` 一環應該有值。

## Milestone P0（2026-08-05）— 選手等級與能力成長規則

同分支 `milestone-n-finance`。**未 merge 回 main。**
O0–O7.1 已封存為 tag `milestone-o7.1-archive`。

### 為什麼做這個

閉環分析發現：**升級對實力零影響**。`lv` 由 xp 導出（S25），但升級只發
`talentPoints`；玩家不去天賦樹手動花掉，等級就完全不影響任何數值。
`lv` 的消費者只有三個——戰報存檔、名牌顯示、薪資公式——沒有一個影響戰鬥。

### 規則（`src/platform/progress/levelGrowth.js`）

每升一級給 **3.0 點**成長，依**定位主能力**分配：

```
分配依據 = playerModel.POSITION_PROFILE[`MOBA${role}`].key   ← 沿用既有定位規則
權重     = 5 / 4 / 3 / 2 / 1（與 posFit 同一組，總和 15）
單項成長 = 3.0 × (權重/15) × 潛力空間係數
潛力空間係數 = clamp((潛力上限 − 目前值) / 25, 0, 1)   ← 越接近上限成長越慢
上限     = 潛力上限、99 硬上限、單項每級 +1.5
```

**四個設計原則**：

1. **不另立第二套定位規則**——分配沿用 `POSITION_PROFILE` 與 `posFit` 的同一組
   能力與權重。「這個定位重視什麼」在專案裡只有一份定義。
2. **不建立第二套能力資料**——成長寫回 `players[].stats`（基礎值），
   天賦加成仍由 `getPlayerDerivedStats` 疊在上面，兩者不重複計算。
3. **完全決定性**——沒有亂數、沒有時鐘，成長只是 (選手, 升幾級) 的函式
   ⇒ 伺服器可獨立重算（與 O 系列同一立場）。
4. **天賦點照發**——本檔不取代天賦系統，只是讓等級本身也有基礎回饋。

### 接線

掛在 **S25 唯一結算入口** `applyProgressToState` 的升級分支裡，
與 XP／等級／天賦點／出賽損耗同一個迴圈、同一個 `nextState`。
⇒ 冪等由既有 `transactionId` 保證，同一場重送不會二次成長。
receipt 新增 `growth: { gains, total }`，可直接顯示「成長前後差異」。

### 實際數字

中路選手 Lv5→6（能力 60／潛力 90）：
**精準度 +1、操作速度 +0.8、決策力 +0.6、應變力 +0.4、反應速度 +0.2（共 +3）**

收斂行為：距潛力上限 45 點時每級 +3；距上限 3 點時每級 +0.3；到頂則完全不成長。

### 驗證（2026-08-05 實跑）

`node tools/check_growth_loop_p0.mjs` → **25/25 通過**。涵蓋：

- 依定位分配、權重遞減、不同定位成長項不同、其他能力不動。
- 決定性（重算逐欄相同）、純函式（不修改輸入）。
- 潛力上限／99 硬上限／單項每級上限／越接近上限越慢／到頂不再成長。
- 走 S25 唯一入口；**同一場重送不會二次成長**；沒升級的比賽零成長。
- **天賦點照發**（兩套成長不互相取代）。
- 成長真的傳到對戰輸入：derived stats ↑、**CS 引擎綜合 60 → 61**、
  MOBA 行為 mods 改變。

回歸全綠：O7.1 27/27、O7 48/48、O6 36/36、O5 45/45、O4 47/47、O3 35/35、
O2 30/30、O1 40/40、O 40/40、財務 32/35/40/31、
`verify.mjs --only=progress25,talent27,experience26,cs23,regress,regress2,build` **7/7**
（regress／regress2 綠 ⇒ 未動戰鬥平衡）。

### ⚠ 仍未解的另一半（P0 的第二項，本輪未做）

**MOBA 能力仍不影響戰力。** 現役路徑（`useLocalServer.js:142-143`）只注入
行為 mods（撤退門檻／gank 視窗／roam／分推／推線深度／參團意願），
**沒有任何一項影響傷害或戰力**。`calcMobaPower` / `calcMobaTough` 存在，
但唯一呼叫點是 `src/App.jsx:389`（Legacy 原型）⇒ **現役路徑死碼**。

⇒ 目前狀態：**練功會讓 CS 變強、讓 MOBA 的行為更聰明，但不會讓 MOBA 打得更痛。**
這一項需要一個不違反 S28 紅線（不得乘進傷害式）的設計決策，
驗證器 5d 已把「MOBA 只有行為層」寫成斷言，避免日後誤以為已完成。

### 未做（刻意）

- 未動戰鬥平衡、英雄 AI、UI 主架構（本輪沒有改任何畫面）。
- 未碰後端／WebSocket／商城／轉會市場／新模式。
- 未碰 `ESMO-hero-models`。
- **瀏覽器實機驗收未做**：賽後 receipt 的成長明細目前只在資料層，畫面尚未顯示
  （屬 P1 成長可見性）。

## Milestone P0-2（2026-08-05）— 能力影響 MOBA 戰鬥品質

同分支 `milestone-n-finance`。**未 merge 回 main。**

### 問題與紅線

P0 之後練功會讓 CS 變強、讓 MOBA 行為更聰明，但**不會讓 MOBA 打得更痛**：
現役路徑只注入行為 mods（撤退／gank／roam／分推／推線深度／參團），沒有一項影響戰力。

而 S28 的紅線是：`dmgAmt = p.power * dt * ...` ——
**把選手能力注入 `power` 就是把能力乘進傷害式，不可以。**

### 解法：走引擎既有的成長通道

關鍵觀察在 `LogicEngine.js:628`：

```js
p.power = p.basePower * powerMultFor(p.mlv);
```

**戰力本來就由「本場等級」導出。** 所以讓能力小幅影響**本場經驗獲取速率**，
其餘完全交給引擎既有的等級→戰力／HP 曲線 ⇒
**沒有任何一項係數乘進傷害式**，紅線沒有被碰。

### 實作

- `mobaPlayerStats.js` 新增 `xpRateScale`（沿用既有 mods 的映射與限幅慣例）：

  | 能力 | 權重 | 理由 |
  |---|---|---|
  | accuracy | +0.022 | 補刀精準 |
  | apm | +0.016 | 出手速度 |
  | focus | +0.014 | 專注度（不漏兵） |
  | mapAware | +0.008 | 路線效率 |

  硬限幅 `[0.94, 1.06]`：全 100 分 ×1.06、全 70 分 ×1、全 40 分 ×0.94。

- `LogicEngine._addXp` 是**所有經驗來源的單一入口**（小兵／野怪／擊殺／助攻／推塔），
  係數只套在這一處。
- **只縮放正向獲得**：`drain`（等級落後補正的扣除）維持原樣——
  否則能力高的人連被扣都比較少，那是雙重優勢。
- 未 `configurePlayers` ⇒ `_mod` 回 null ⇒ 係數不存在 ⇒ 本改動完全不生效。

### 實測差異（可驗證、可重現、不誇張）

15 seeds、跑到 800 秒：

- 強能力隊（全 95）平均本場等級 **6.99**，弱能力隊（全 45）**5.88**
- **逐場同向 13/15**（不是噪音）
- 平均等級差 **1.11 級** ——看得出來，但不會壓過戰術與操作
- 同 seed ＋ 同能力 ⇒ 逐位元可重現

### 驗證（2026-08-05 實跑）

`node tools/check_moba_ability_p02.mjs` → **20/20 通過**。含：

- 未注入能力時本改動完全不生效（`playerStatsOn === false` 且 `_mod` 回 null）。
- 中性能力時 `xpRateScale` 有無此欄位**逐位元相同**。
- 強弱差異可重現、多數 seed 同向、確實改變模擬結果。
- 限幅、取樣能力項、等級差落在 0.1–2.5 級的「不誇張」區間。
- 只縮放正向獲得（原始碼層級斷言）。
- 雙方同能力 → 藍勝 6/15，**沒有系統性偏袒**。
- **傷害式一行未動**（原始碼斷言 `dmgAmt = p.power * dt * ...` 沒有夾帶能力係數）。

#### ⚠ 驗證器自身修正（不是放寬）

第一版斷言「中性能力 ⇒ 與未注入逐位元相同」**紅了**。查證後確認
**這是 S28 既有性質、不是 P0-2 造成的**——把 `xpRateScale` 整個移除後仍然不同，
因為 `configurePlayers` 本身就會切換 S28 的程式路徑。
斷言前提寫錯了，已改為驗「**本改動**在中性時不生效」（有無該欄位逐位元相同），
並補一條 `1d` 直接斷言未注入時引擎沒有任何能力係數——那才是保護 regress 的真正機制。

另外 `5)` 對稱性原本用 2400 tick，多數場次未分勝負 ⇒ **空過（0/0）**。
已拉長到 4000 tick，實際分出 15 場才做比例判定。

回歸全綠：**`regress` 15/15、`regress2` 8/8**（這是本輪最關鍵的門檻——
證明未注入能力的既有對局逐值不變）、`check_combat_range_m16` 19/19、
P0 25/25、O 系列九支、財務四支、build 通過。

### 已知限制

1. **只影響經驗速率，不影響操作品質本身**：能力高不會讓補刀命中率、技能命中率
   改變（引擎沒有這些機制）。這是在「不新增戰鬥機制」前提下最小的可行注入點。
2. **幅度是第一版**：±6% 是保守起點。若體感太弱／太強，改
   `SCALE_CLAMP.xpRateScale` 與 `STAT_MAP.xpRateScale` 一處即可，屬 Balance 決策。
3. **對手（紅方）沒有真實選手**，仍是中性能力 ⇒ 目前等於「我方能力對上中性對手」。
   要對稱需要 AI Teams（既有待辦）。

### 未做（刻意）

- 未新增任何戰鬥機制（沒有命中/失誤模型、沒有技能 CD 調整）。
- 未修改傷害式、平衡參數、英雄 AI。
- 未碰後端／WebSocket／商城／轉會市場／新模式／`ESMO-hero-models`。
- **瀏覽器實機驗收未做**。

---

## Milestone P0-3：MOBA 選手能力 → 實際戰鬥品質（2026-08-05）

P0-2 只做到「能力影響本場經驗速率」。P0-3 補上原目標真正要的東西：
**能力影響操作品質本身**——補刀、空揮、技能有效施放、目標選擇、撤退時機。

### 五個掛點（全部只改行為，不碰傷害式）

| 係數 | 取樣能力 | 方向 | 限幅 | 引擎掛點 |
|---|---|---|---|---|
| `lastHitLoss` | accuracy / apm / focus | 低能力受罰 | 10% | `_awardMinionXp`：漏兵 ⇒ 該隻兵的經驗不給 |
| `attackWaste` | accuracy / reflex / positioning | 低能力受罰 | 8% | 傷害段前：該 tick 空揮，不造成傷害 |
| `castMiss` | tacticalIQ / decision / clutch | 低能力受罰 | 10% | `_summonerSpellsV2` 套用迴圈：冷卻照算、效果沒了 |
| `focusRate` | decision / mapAware / adaptability | 高能力得利 | 35% | `_combatStep` 選敵：改打射程內**血量最低**者 |
| `retreatLate` | decision / adaptability / mapAware | 低能力受罰 | 6% | 撤退門檻**決定性下修**（不擲骰）⇒ 該撤時撤太晚 |

### 設計不變量

1. **中性（全 70）＝ 現行行為**。五項全為 0 ⇒ 不擲骰、不改任何分支。
   驗證器 §3a 直接證明：中性注入 vs 未注入，戰局狀態逐位元相同 8/8。
2. **單向映射**。penalty 只罰低能力（`clamp(−Σw·u, 0, hi)`），bonus 只給高能力。
   高能力不會拿到「攻擊必中加成」——他只是不犯低能力會犯的錯。
3. **獨立亂數流 `rng3`**（`configurePlayers` 時建立）。不能借 `rng2`：那是戰術層的流，
   多抽一次 Gank／遊走時機就整個平移＝能力層默默改動戰術層。
4. **S28 紅線未越界**：`dmgAmt = p.power * dt * R.dmgK * ...` 原封不動。
   驗證器 §2 在原始碼層級斷言 maxHp / basePower / igniteDps 都沒被能力係數碰過。

### A/B 驗證：`tools/check_moba_quality_p03.mjs` — **53/53**

**兩組都同時給雙方真實能力資料**（不用中性對手代替）：
A 對照＝藍 70／紅 70；B 實驗＝藍 88／紅 55。20 seeds、4000 ticks。

| 指標 | A（70 vs 70） | B（88 vs 55） |
|---|---|---|
| 補刀成功率 | 100% / 100% | **100% / 95.1%**（差 4.9pp） |
| 無效攻擊比例 | 0% / 0% | **0% / 4.2%** |
| 有效技能施放率 | 100% / 100% | **100% / 94.5%**（差 5.5pp） |
| 集火改目標次數 | 0 / 0 | **8.1 / 0** |
| 平均死亡數 | 13.2 / 11.6 | **9.8 / 14.9** |
| 平均經濟 | 對稱 | **1026 / 764** |
| 平均本場等級 | 9.13 / 9.27 | **10.44 / 7.98**（差 2.46 級） |
| 勝率 | — | **高能力方 73.7%（14/19）**，低能力方仍贏 5 場 |

勝率門檻設在 **≤ 85%**：高能力隊要明顯較強，但**不得固定獲勝**。

### ⚠ 驗證器自身的三處前提修正（不是放寬門檻）

1. **「中性 ⇒ snapshot 逐位元相同」的前提是錯的**。`configurePlayers` 一定會寫入
   `playerStatsMeta` 與 `pexec`（儀器化欄位）。已改為比對**戰局狀態指紋**
   （位置／血量／經濟／等級／KD），並補 §3a' 明確釘住「差異僅限 meta」。
2. **死亡數讀錯欄位**：引擎用 `p.d`，不是 `p.deaths`。原本 0 ≥ 0 空過，已修正。
3. **對照組藍方勝率 31.6%**——查證後確認是**技能層既有的陣營偏斜**：
   完全不注入能力、只開 `configureSpells` 跑同一組 seeds，baseline 就是藍勝 6/20。
   因此**不**斷言「對照組接近五成」（那等於拿既有問題擋 P0-3），改為斷言
   「中性對照組與 baseline **每一場勝負都相同**」＝沒有新增任何偏斜，
   並用 §4-6f 把既有偏斜記為技術債。

### ⚠ 順手抓到的既有紅燈：`check_moba_stats28` §13

§13 是 mods 鍵名的**精確比對 allowlist**（紅線的執行機制：想偷渡 `damageMult`
就得先在清單裡寫下來）。**P0-2 加了 `xpRateScale` 卻沒登記，這條自 P0-2 起就是紅的**——
只是巢狀模式跑不完（多次逾時／被中止），所以 P0-2 當時回報「全綠」其實沒真的跑到。

已補登 `xpRateScale` 與 P0-3 的五個係數（共 16 鍵）。**維持精確比對，沒有放寬**：
`!ALLOWED.some(k => /power|hp|dmg|damage/i.test(k))` 仍然守著鍵名紅線。
修正後 flat 模式 **21/21 通過**。

教訓：**巢狀 verifier 跑不完 ≠ 通過**。stats28 / runtime29 一律用
`node tools/verify.mjs --only=<id>`（flat 模式，228 秒）跑，不要直接跑巢狀版。

### 已知限制

1. **「補刀」是本層新造的語意**。引擎原本沒有補刀概念（兵死了範圍內共享經驗），
   `lastHitLoss` 是掛在經驗分配上的漏兵模型，不是真的最後一擊判定。
2. **`attackWaste` 期望值上等同少量 DPS 損失**——任何「無效攻擊」機制都必然如此。
   差別在於它是**離散事件**，不是把能力乘進傷害式。這是自覺取捨，不是漏洞。
3. **幅度是第一版**。要調手感只改 `STAT_MAP` 的五組權重與 `ONESIDED_CLAMP`，
   引擎端不需要動。
4. **技能層陣營偏斜（藍 6/20）是既有技術債**，本輪未處理。
5. **瀏覽器實機驗收未做**——本輪全部是純邏輯驗證。

### 未做（刻意）

- 未建立第二套選手能力資料（仍是 `mobaPlayerStats` 單一來源）。
- 未大改 LogicEngine 架構（五個掛點都是就地插入，中性時全部短路）。
- 未碰技能傷害數值、平衡參數、英雄 AI。
- 未碰後端／WebSocket／商城／轉會市場／新模式／`ESMO-hero-models`。
- **未開始 P1。**

---

## Milestone P1：選手成長可視化（2026-08-05）

P0／P0-2／P0-3 讓「練了會變強」成立，但玩家**看不見**。P1 補上那一段。
**沒有動任何成長公式、戰鬥係數或平衡參數**（驗證器 §8 用原始碼指紋釘住）。

### 開工時發現的兩個真問題

1. **訓練成長完全沒有憑證**。`applyCourse` 在 `advanceDay` 的 map 裡直接換掉選手物件，
   差值當場丟棄。訓練頁的日誌是**照課程定義猜的**（`c.stats.map(statZh)` →
   「專注、抗壓 提升」）——選手若已頂到潛力上限，一項都沒漲，畫面照樣喊「提升」。
   而且它存在 React state，重整就消失。
2. **賽後 receipt 早就有 `growth.gains`，但 `RewardReceiptPanel` 只顯示 XP 與等級**。
   資料一直在，只是沒有畫出來。

### 做法：一本帳簿，三處共用

新增 `src/platform/progress/growthLog.js`（純函式）。

**它是帳簿，不是帳戶**——只存「已經套用完成的差值」，不存能力現值／XP 總量／等級。
把 `growthLog` 整個刪光，選手一點都不會變弱。這是「不建立第二套選手資料」的具體判準，
驗證器 §1j 直接斷言帳簿裡沒有 `stats` / `xp` / `totalXp`。

| 項目 | 決定性 id | 冪等來源 |
|---|---|---|
| 比賽 | `${transactionId}:${playerId}` | S25 `processedMatchTransactions` ＋ `appendGrowth` 去重（兩層） |
| 訓練 | `train:${playerId}:${day}:${courseId}` | `advanceDay` 是唯一時鐘，`daysLeft` 歸零只會發生一次 ＋ 去重 |

上限 12 筆／人（任務單要求 ≥10）。存在 `player.growthLog`，隨既有存檔持久化，
載入時清洗形狀（不信任持久層，但**不重建**任何成長）。

### 「成長前 → 成長後」為什麼要釘住當下值

不能拿選手**現值**減差值回推——再成長一次之後那樣算就錯了。
所以 `makeGrowthEntry` 收 `statsAfter`，把當下的成長後值一起存下來，
`beforeAfter()` 才能精確還原。舊紀錄沒有這個欄位 ⇒ 回 `null`，只顯示增加值，**不編造前後值**。

### 四處 UI

| 位置 | 內容 |
|---|---|
| 賽後結算（**MOBA / CS 同一個元件**） | 每人的能力增幅膠囊（前→後 +差值）、升級徽章、全隊能力總點數 |
| 訓練中心 | 日誌改讀 `advanceDay().trained` 的**實際差值**，附能力增幅膠囊 |
| 選手詳情 | 「近期成長」完整清單：來源／週次／經驗／等級／能力差值 ＋ 經驗進度條 |
| 名單卡 ＋ 名單詳情 | 最近一次成長提示（一行）／最近三筆 |

MOBA 與 CS 的顯示規格一致不是靠兩邊各自對齊，而是**同一個 `RewardReceiptPanel`**。

P0-3 的戰鬥品質數字（補刀率／空揮率／技能成功率／集火次數）**只在 debug 模式**
出現在 BattleEndScreen。正式玩家畫面刻意不放——玩家要看的是「我的選手變強了」。
資料走既有的 `playerStatsExec`，沒有新增第二條管道。

### 驗證：`tools/check_growth_ui_p1.mjs` — **62/62**

涵蓋任務單的每一條驗收：訓練一次只加一次（§3c/§3i/§3j）、MOBA 結算正確顯示
（§2b–§2f）、CS 對等（§2m）、無升級但有成長（§4f）、有升級但能力已達上限不得虛假增加
（§4c/§4d/§4e）、重整後仍在（§5a/§5b）、重送同一 receipt 不重複（§2g/§2h/§2i）。

**新增一種驗證能力：§6 UI 未定義識別字掃描。**
用 `@babel/parser` + `traverse` 做真正的作用域分析。動機是 O 系列那次事故——
RecruitScreen 留了一個已刪除變數的參照，`npm run build` 全綠，一點進選手詳情整頁白掉。
build 只做打包，**不做作用域分析**。這段補上那個缺口。

### ⚠ 驗證器自身的兩處誤判（我寫錯的，已修正）

1. **§7a 原本用 `src.includes("applyLevelGrowth")`** 判斷「畫面層有沒有重算成長」——
   結果抓到我自己寫的註解「= applyLevelGrowth 實際套用值」。那是在說明資料來源，
   不是在重算。已改用 AST 檢查真正的 import 與識別字（註解不是 AST 節點，天然排除）。
2. **§2 原本手工拼交易單物件**，被契約驗證擋掉（缺 `sourceResultVersion`、
   `transactionId` 必須可決定性推導等 12 項）。已改用官方工廠
   `createMatchProgressTransaction` ⇒ 驗的是真實流程，不是湊出來的假物件。

### ⚠ 一次無法歸因的紅燈（誠實記錄，不假裝修好了）

收尾回歸時 `check_moba_experience26` 出現一次 **34/35**（基準是 35/35）。
當下沒有捕捉到是哪一條斷言失敗——只 grep 了結尾計數，輸出就沒了。

我第一時間歸因為「P1 把 P0-3 的計數塞進每格 snapshot ⇒ 撐破 §17 重播容量門檻
（一場 < 2MB，基準已是 1792KB ＝ 92%）」，並據此加了「只在終局帶計數」的閘門。

**這個歸因是錯的**，已用兩件事證偽：
1. `snapshotToFrame`（`src/platform/contracts/mobaReplay.js`）**根本不收
   `playerStatsExec`** ⇒ 該欄位無論多大都不會進 Replay。
2. A/B 實測：把閘門停用（回到每格都帶）重跑，仍是 **35/35**，
   重播容量三次跑一模一樣（632 frames · 1792KB · 2903B/格）。

⇒ 那次 34/35 **不是 P1 造成的**，且連續三次完整跑（兩次有閘門、一次無閘門）
都沒有重現。列為**未歸因的偶發紅燈**，不是已修復。

「只在終局帶計數」的閘門**保留**——它不是修復，只是純粹省記憶體
（中途 600+ 格帶了也沒有人讀）。程式碼註解已寫明這一點，避免後人誤以為它在守什麼。

**教訓**：跑長驗證時要 `> file 2>&1` 保存完整輸出，不要只 grep 結尾計數。
紅燈當下沒留下證據，後面就只能猜。

### 已知限制

1. **`§9 窄螢幕檢查不是真的排版測試`**。證明 320/360/390/430px 不水平溢出需要
   瀏覽器排版引擎，本專案沒有。§9 只能檢查「必然造成溢出的寫法」有沒有被引入
   （≥320px 寫死寬度、缺 flexWrap／minWidth:0／ellipsis）。**實機仍須人工確認。**
2. **訓練不發經驗**（經驗只來自出賽）——這是既有設計，P1 沒有改，只是把它顯示清楚。
3. **舊存檔的選手沒有歷史紀錄**。帳簿從 P1 之後才開始記，不回頭補算
   （回頭補算就會變成「編造」，違反本輪的核心原則）。

### 未做（刻意）

- 未修改 P0／P0-2／P0-3 的任何演算、係數或平衡參數。
- 未調整勝率、傷害、AI、撤退與技能參數。
- 未建立第二套 receipt／歷史／能力／經驗資料。
- 未碰後端／WebSocket／商店／轉會市場／`ESMO-hero-models`。
- **瀏覽器實機驗收未做。**

---

## Milestone P1 結案：最終驗證紀錄（2026-08-06）

P1 的程式、驗證器與文件已於 `e608e07` 提交。本節記錄**結案前的最後一次獨立確認**。

### 實跑的三項（完整 stdout/stderr 已保存後檢視，未只看結尾計數）

| 命令 | 結果 | Exit |
|---|---|---|
| `node tools/check_moba_experience26.mjs` | **35/35 通過**，全檔 `❌` / `FAIL` 零命中，`✅` 計數 35 | 0 |
| `node tools/check_growth_ui_p1.mjs` | **62/62 通過**，零個 `❌` | 0 |
| `npm run build` | `✓ built in 32.79s`，無 error | 0 |

`experience26` 重播容量：`632 frames · 1792KB/場 · 每 frame ≈ 2903B`
——與 P0-3 當時及先前三次重跑**逐字相同**。

⚠ 原始 log 刻意**不入版控**（`review/p1/*.log`，untracked）。上表即為結論；
需要重驗時重跑命令即可，log 是過程產物不是規格。

### `experience26` 34/35 的最終結論：偶發且無法重現

- **失敗的 assertion：未知**。那次只 grep 了結尾計數，輸出當場丟失
  ⇒ **實際值／期望值拿不出來**——不是沒查，是證據當時就沒留下。
- **可重現性：0/4**。連續四次完整跑（兩次含終局閘門、一次停用閘門、本次結案跑）
  全部 35/35。
- **我最初的歸因已被證偽並收回**：曾判定為「P1 把 P0-3 計數塞進每格 snapshot
  ⇒ 撐破 §17 重播容量門檻」。兩項反證——(1) `snapshotToFrame`
  （`src/platform/contracts/mobaReplay.js`）**根本不收 `playerStatsExec`**；
  (2) A/B 實測停用閘門後仍 35/35 且重播容量位元相同。
- ⇒ **記錄為偶發且無法重現，停止追查。** 不是「已修復」。

「只在終局帶計數」的閘門保留，但它**不是修復**，純粹是省記憶體
（中途 600+ 格帶了沒有人讀）。程式碼註解已寫明，避免後人誤以為它在守什麼。

### 本次結案未做任何規避

**沒有**放寬 assertion、**沒有**刪測試、**沒有**加 timeout、**沒有**改產品邏輯。
工作區的 `src/` 與 `tools/` 與 `e608e07` 完全一致。

### 立下的規則（已寫入 `AGENTS.md` 的排程見待辦）

跑長驗證一律 `> file 2>&1` 保存完整輸出，不得只 grep 結尾計數。
紅燈當下沒留下證據，事後就只能猜——這次就是。

**P1 自動驗證全數通過，正式結案。瀏覽器實機驗收仍未進行（見待辦）。**

---

## 集中驗收修正包 `acceptance-fix/p1-ui`（2026-08-06）

`milestone-n-finance` 的**第一次真實環境驗收**（N/O/P 全部成果）找出五項
UI／流程問題。本包只修這五項，**不開新功能、不改戰鬥平衡**。

在獨立 worktree `ESMO-acceptance-fix` 進行，主工作區與對照用的 `ESMO-acceptance`
全程未被更動。

### 五項修正

| # | 根因 | 修法 |
|---|---|---|
| 一 | `MatchQueuePanel` 有「開始配對」、`Frame` 底部又有「確認陣容 → 配對」，**兩顆主要按鈕都推進流程** | 底部改為**唯一**主按鈕並隨流程改身分；狀態卡加 `statusOnly` ⇒ 只顯示狀態 |
| 二 | 主畫面直接曝露 `rosterVersion` / `transactionId` / `submittedAt` / `ticketId` | 主畫面只留狀態／陣容 n/5／模式；其餘進展開區與 `?debug=1`。**契約欄位一個沒刪** |
| 三 | 驗收缺資金，且沒有安全的補充方式 | `profileStore.grantTestFunds()`：資金與帳本在**同一個 `set()`**，決定性 id 防重複；入口 debug-only |
| 四 | CS 用 `.filter(Boolean)`，**缺人的席位整列消失** | 新增共用 `MatchPrepFrame` + `SquadSeatRow`，MOBA／CS 同一套結構；CS 五席恆在 |
| 五 | `NAV.talent = "roster"`，天賦流程斷在普通名單 | 新增 `talentPick`（`RosterScreen` 的 `purpose="talent"`）→ 直達既有 `PlayerTalentScreen` |

### 「唯一主按鈕」的設計

底部那顆的身分由 `primaryActionFor()` 決定，涵蓋九種狀態：
未通過驗證／開始配對／配對中（含等待秒數）／已配對／我方確認／等待對手／
進入對戰／重新配對（取消・拒絕・逾期）。

⚠ **沒有第二條配對邏輯**——每個分支都只是呼叫 O4–O7 既有的 store action
（`enqueueMatch` / `confirmMatchReady` / `launchMatchSession` / `resetMatchmaking`）。
收斂的是**入口**，不是流程。

### 驗證：`tools/check_acceptance_fix_p1.mjs` — **81/81**

§1 單一入口與九種狀態｜§2 工程資訊不外洩｜§3 測試資金三方一致｜
§4 兩模式共用元件｜§5 CS 缺員席位｜§6 天賦入口｜
§7 UI 未定義識別字掃描（AST 作用域分析）｜§8 契約與戰鬥平衡未被動過。

既有回歸全綠：`growth_ui_p1` 62/62、`experience26` 35/35、O 系列七支、
財務四支、`talent27` 44/44、`regress` 15/15、`regress2` 8/8、build EXIT=0。

### ⚠ 驗證器抓到我兩個真缺失（已修，不是放寬門檻）

1. **項目二只做一半**：配對狀態卡排隊時仍在顯示隊伍版本與票券。
2. **主按鈕邏輯寫在 `.jsx`，Node 匯入不了 ⇒ 等於沒驗到**。已抽成純函式
   `matchPrepAction.js`，九種狀態才真的逐條驗過。
   **教訓：值得驗的邏輯不要留在 `.jsx` 裡。**

另有一處是我的檢查誤判：`§2f` 直接對原始碼比對「隊伍版本」，抓到自己寫的註解
（與 P1 `§7a` 同一種錯），已改為去註解後比對。**註解不是畫面。**

### 人工瀏覽器實機驗收：**五項全部通過**

桌面與 320 / 360 / 390 / 430px 皆確認**無水平溢出**。
這是 N/O/P 系列累積的驗收債第一次真正清掉——先前每一輪回報結尾的
「未經瀏覽器實測」，到這裡才有了實機結論。

詳細結果：`review/acceptance-fix/ACCEPTANCE_RESULT.md`。
完整驗證 log 保留在同目錄 `*.log`，**刻意不入版控**（見 `.gitignore`）。

### 未做（刻意）

未 merge `main`、未部署 Pages、未開始 P2、未碰商店／轉會市場。
未改戰鬥平衡、契約欄位、驗證邏輯與 Store 資料形狀。

---

## 併入 `main` 與正式部署（2026-08-06）

### PR #1 — `milestone-n-finance` → `main`

| 項目 | 值 |
|---|---|
| PR | **#1** https://github.com/RayHuang0323/ESMO-/pull/1 |
| 合併前 head | `cf9bfae`（ahead 0 / behind 0） |
| mergeable_state | `clean`（無衝突） |
| 規模 | 22 commits、**79 檔**、+13,536 / −290 |
| 合併方式 | merge commit（**未**用 squash／rebase，歷史完整保留） |
| **`main` 的 merge commit** | **`4d64e0c`** |

⚠ **本 repo 沒有 PR 層級的 CI**：`deploy.yml` 只在 push 到 `main` 時觸發。
所以合併前的 build 證據是本機在 `cf9bfae` 上跑的（EXIT=0），
真正的 CI 訊號要等合併後的部署 workflow。

PR 檔案清單已逐一比對，**確認未納入**主工作區原有的 7 個未提交檔案
（`MobaRuntimeHeroes.jsx`、`MobaRuntimeBattleHarness.jsx`、`featureFlags.js`、
`00_目前專案狀態.md`、3 個 terrain PNG）、任何 `.log`、以及 `ESMO-hero-models`。

### GitHub Actions

**build job：成功。** Checkout → Setup Node → Install → Build → Setup Pages →
Upload artifact 全綠。CI 用的是 `npm install --legacy-peer-deps`（`deploy.yml:33`），
與本地驗收環境同法。

**deploy job：失敗 ×2。**

| 嘗試 | 結果 |
|---|---|
| attempt 1（run#64） | `deployment_queued` 持續 10 分鐘 → `Timeout reached, aborting!` |
| attempt 2（rerun failed jobs） | 同上，12:07:58 逾時 |

### ⚠ 這**不是**本次合併造成的——根因是 deployment ID ＝ commit SHA

deploy log 的關鍵一行：

```
Created deployment for 4d64e0c…, ID: 4d64e0c78970fad5aea5ae20df5a40cbfd10a5a5
```

**Pages 的 deployment ID 就是 commit SHA**（來自 `pages_build_version`）。
只要還在同一個 commit 上重跑，送出的永遠是**同一個 deployment ID**。
第一次把 `4d64e0c` 卡住之後，後續同 commit 的部署一送出就被判為重複而取消。

| Run | 結果 | 耗時 |
|---|---|---|
| #64 attempt 1 | `deployment_queued` → `Timeout reached, aborting!` | 10 分 |
| #64 attempt 2（rerun failed jobs） | 同上 | 10 分 |
| #65 | **`Deployment cancelled.`** | 8 秒 |
| #66（清理殘留後） | **`Deployment cancelled.`** | 9 秒 |

⚠ **我最初判定為「Pages 佇列停滯」，那是錯的，已收回。**
清理 environment 裡的殘留 deployment（`5779094527` / `5778903038` / `5778736335`，
各自標 `inactive` 後刪除）**沒有解決**——因為 ID 由 commit 決定，不由那些紀錄決定。

已排除的其他可能：
1. **不是 artifact 過大**：1.6 MB，與歷次成功部署完全相同。
2. **不是環境審核卡關**：`github-pages` 只有 `branch_policy`，無 required reviewer。
3. **不是 GitHub 全域故障**：githubstatus 顯示 Actions 與 Pages 皆 `operational`。
4. **不是 build 問題**：三次 build job 全部成功。

⇒ **解法：在 `main` 上產生新的 commit SHA**，自然得到新的 `pages_build_version`。

⚠ 刻意保留 `5740205057`（`3a69dd2`，`success`）＝目前線上實際服務的那一份，
刪掉會讓站台下線。

### 正式站台現況（部署成功前）

`https://rayhuang0323.github.io/ESMO-/` 回 HTTP 200，bundle 仍是 `index-BBjRmZoH.js`。
以新程式碼獨有字串驗證線上 bundle：

| 字串 | 命中 |
|---|---|
| 選擇要培養的選手 / 補充測試資金 / 確認陣容 → 開始配對 / 未指派 / 近期成長 | 全部 **0** |

⇒ 對外仍是 `3a69dd2`（M1.7 RC1）。正式環境驗收因此**無法執行**。

---

## 正式部署成功（2026-08-06）

### 解法奏效：新的 commit SHA

把 Sprint 紀錄單獨 commit（`774fc85`）→ PR #2 → `main` 得到新 SHA **`72242b7`**
→ 自動觸發 run#67 → **內容真的上線了**。

驗證了先前的根因判定：deployment ID ＝ commit SHA，同一個 commit 重跑必然被判重複。

### ⚠ run#67 仍被標記 failure，但**內容確實已發佈**

| 項目 | 值 |
|---|---|
| build job | success |
| deploy job | **failure**（`deployment_queued` → `Timeout reached, aborting!`） |
| deployment `5780162339`（`72242b7`） | 狀態歷程 `waiting → queued → in_progress → failure` |
| **線上實際內容** | **已是新版** |

Pages 後端**已經把內容發佈出去**，只是沒在 `actions/deploy-pages` 的 10 分鐘視窗內
回報成功，所以 action 判定逾時。⇒ **workflow 的紅燈與站台實況不一致**，
以站台實況為準。這一點值得記著：往後看到 deploy 紅燈，先查線上 bundle 再下結論。

### 正式站台驗證

**網址**：https://rayhuang0323.github.io/ESMO-/

| 檢查 | 結果 |
|---|---|
| `index.html` | HTTP 200 |
| entry bundle | `index-NvL8YtPy.js`，HTTP 200，2,544,283 B（舊版是 `index-BBjRmZoH.js`） |
| lazy chunks（5 支） | `EnvironmentRuntime` / `HeroPresentationGallery` / `MobaMapPreview` / `MobaRuntimeBattleHarness` / `TerrainSandbox` 全部 **200** |
| viewport meta | `width=device-width, initial-scale=1.0` ✅ |

### 九項驗收領域：程式碼已上線（字串比對）

以各功能獨有字串直接查線上 bundle：

| 領域 | 佐證字串（命中） |
|---|---|
| ① 首頁與主要導覽 | 球探招募 1｜訓練中心 2｜財務儀表板 1｜選手名單 1｜賽前配置 2 |
| ② 招募／名單／編隊／訓練 | 選擇要培養的選手 1｜可用天賦點 1｜還可招募 1｜推進訓練日 1｜已達潛力上限 2 |
| ③ MOBA 與 CS 賽前配置 | MOBA 賽前配置 1｜CS 賽前準備 1｜未指派 1｜沒有指派選手 1 |
| ④ 出賽申請／配對／房間確認 | 出賽申請 1｜確認陣容 → 開始配對 1｜我方確認 1｜進入對戰 2｜尋找對手中 1｜重新配對 1｜查看提交內容 1 |
| ⑤ 天賦樹入口 | 查看天賦 1｜天賦樹 1｜天賦點 3 |
| ⑥ 財務週結算與四週預測 | 本週收入 1｜週現金預測 1｜補充測試資金 1｜驗收工具 1 |
| ⑦ 賽後結算與成長顯示 | 賽後結算 3｜近期成長 1｜本場已結算 1｜能力 + 1 |
| ⑧⑨ 版面 | flexWrap 7｜minWidth 8｜textOverflow 7 |

### ⚠ 這是「程式碼已部署」，**不等於「流程實測通過」**

上表證明的是：**正式站台載入的就是新版程式，九個領域的程式碼都在線上、資源都取得到**。

它**沒有**證明點擊流程正確——我無法在正式站台實際操作 SPA（招募→簽約、
推進訓練日、走完配對→房間確認→進場、打完一場看結算、在真實裝置量測是否溢出）。
**互動流程與版面的正式環境驗收仍須人工完成。**

本機 dev server 上這九項已經人工驗過（見上方「集中驗收修正包」一節），
但那是修正 worktree 的 dev build，不等於正式環境。

---

## 正式環境驗收修正：配對流程 ＋ 英雄資產接線（2026-08-07）

分支 `fix/matchmaking-flow`。詳細結果：`review/matchmaking-flow-fix/ACCEPTANCE_RESULT.md`。

### 配對流程：五個驗收問題，同一個根因（**我上一輪造成的**）

```js
const view = useProfileStore((s) => s.matchmakingView)();   // ← 訂閱的是函式本身
```

函式身分永不改變 ⇒ zustand 從不通知 ⇒ **底部主按鈕凍結**。上一輪把「我方確認」
「進入對戰」「重新配對」全搬到那顆凍結的按鈕上，流程整條斷掉。

修法：新增 `useMatchFlow`＝**單一狀態來源**（只訂閱原始值、獨佔輪詢、
負責開房／簽發場次／自動進場）；`matchPrepAction.js` 成為主按鈕的唯一純函式判定；
新增 `requeueMatch`（作廢舊房間與票券 ＋ 重新排隊，連按不重複）。

⚠ 契約加入 `attempt`：`ticketId` 由 `transactionId` 決定性推導，而後者由陣容與週次
決定 ⇒ **同一套陣容重新配對必然得到同一個 id**。加入 attempt 後才是可分辨的新票券，
仍完全決定性，且 `attempt = 0` 與加入前逐位元相同。

### 追加：進了 Ban/Pick 又離開會永久卡死

場次停在 `launched`，回賽前頁命中停用的「進入 Ban/Pick…」，而一次性令牌已消耗。
**與線上連線無關**。O6 早就備好 `resumeSession`／`abandonSession`，UI 沒接。
已接上「返回進行中的對戰」「放棄本場」，並補「場次終局 ⇒ 可重新配對」——
驗證器抓到放棄後 room 仍是 `confirmed` 會造成**第二層卡死**。

### 英雄資產：大地守衛回退成旗子

**根因：那些檔案從來沒有進版控**，只存在主工作區的未提交狀態，
任何乾淨 worktree 都沒有 ⇒ fallback。已帶入 `DadiHeroProxy` / `ChichuanHeroProxy` /
`MobaRuntimeHeroes` / `featureFlags` 與三個 GLB（未帶 terrain、截圖、debug harness）。

`dadi` ＝大地守衛（無旗標保護）、`chichuan` 受旗標控制、**`ironclad` 本來就沒有 GLB**。
Fallback 保留：載入失敗仍顯示占位物。

順手修掉附帶回歸：`body.visible = placeholderVisible` 讓**所有英雄的屍體消失**
（上一行才剛指定屍體材質），已改為 `h.alive ? !proxyReady : true`。

### 驗證

`check_matchmaking_flow_acceptance` **97/97**（新增）、`acceptance_fix_p1` 81/81、
`o4` 47/47、`o5` 45/45、`o6` 36/36、`o7` 48/48、`o71` 27/27、`experience26` 35/35、
`growth_ui_p1` 62/62、`regress` 15/15、`regress2` 8/8、build EXIT=0。

兩支既有驗證改了斷言，**都不是放寬**：`o4` 補登 `attempt`（維持精確比對）；
`acceptance_fix_p1` 的 19 條在描述已被取代的舊實作，改寫後**更嚴格**。

### ⚠ 待決

`dadi_final_texture.glb` **32 MB**（Pages artifact 原本 1.6 MB）。尚未壓縮，
會永久留在 git 歷史並可能讓本就容易逾時的 Pages 部署更難完成。

---

## MOBA Combat AI Closure（2026-08-10）

**分支**：`release/moba-combat-closure`（自 `origin/main` 拆出，只 cherry-pick 本輪 closure commit）

### 完成項

1. **16 項素質影響盤點封版**。分類 A 0／B 5／C 6／D 2／E 1／F 2。
2. **`towerPushes` 指標誤讀更正**：它是隊伍層級、每 10 秒最多 +1 的責任週期計數器，
   不是推進強度。真實 KPI 改用 `p.twrDmg`。責任週期計數器 8/8 素質顯著，
   真實推塔傷害只有 2/8，decision 甚至方向相反。
3. **TD-21 解決**：根因是檢定力不足（40 seeds 噪音底線 ±20pp > 門檻 15pp），
   非引擎偏差（位移依 1/√n 收斂，n=200 時 1.5pp、McNemar p=0.830）。
   `ORDER_SEEDS` 40→160，門檻未動。`runtime29` 首次 35/35。
4. **撤退僵硬根因證明**：進場動態門檻／離場固定門檻／無重評，僵硬段佔 54.1%。
5. 新增量測與驗證工具 10 支；兩條工程規則寫入 AGENTS.md／CLAUDE.md。

### 未完成／未出貨

- **`retreatReevalV1` 預設關閉**：可運作但撞破 `quality_p03` 能力放大護欄
  （等級差 3.79 vs ≤2.5）。未放寬門檻。列後續低優先。
- `retreatHoldV1` 為上一輪失敗實驗，保留 `false` 作可重現記錄。
- Release Gate 只涵蓋 22 區段中的 8 個；其餘 14 個本輪未跑。

### 已知風險

- TD-19（`experience26` §17 replay 容量）貼近上限，比賽變長就會觸發。
- F 類兩項（comms `roamInfoAdj` 不通電、synergy 分布飽和）未修。
- 逐場 raw sample（約 15 MB）已排除入庫，需要時以固定 seed 重跑產生。

### 刻意排除

本 release **不含** hero-models／GLB／Chichuan・Dadi proxy／terrain／matchmaking／UI screens。
那些留在 `fix/moba-combat-credibility`（已推上 origin，成果未刪除），
其中含 32 MB 的 `dadi_final_texture.glb`，不應與 Combat closure 混在同一次發布。


### 封版識別（2026-08-10 補記）

| 項目 | 值 |
|---|---|
| Branch | `release/moba-combat-closure` |
| Commits | `6efac04`（closure）／`22daf6b`（handoff・Roadmap・Sprint） |
| **Tag** | **`moba-combat-closure`**（已推上 origin） |
| Merge to main | ⏳ 待人工執行——`git push origin release/moba-combat-closure:main` 被安全機制阻擋，未繞過 |
| Pages 部署 | ⏳ 未觸發（只在 push 到 main 時執行） |
| 本機 build smoke test | ✅ `index.html` 200／main bundle 200（2.55 MB）。**僅證明建置產物可服務，非功能驗收** |

**四項已知未完成不阻擋封版**：撤退僵硬（低）、`comms` `roamInfoAdj` 不通電（中）、
`synergy` 分布飽和（中）、TD-19 replay 容量（中）。四者皆不造成 build 失敗、
資料損壞或重大回歸。明細見 `08_目前待辦與風險.md` 封版紀錄節。

**下一位（Codex）**：CS 16 項素質盤點。第一步見 `04_Roadmap.md`「下一階段交接」。

---

## CS Measurement Pilot R1（2026-08-10）

### 目標與判定

本 Sprint 只證明真實 CS 引擎可在 Node 中穩定量測，並鎖定 fixed-seed gameplay baseline。
採 `accuracy × t2 T rifler × Inferno` 單一 pilot；不擴成 16 素質／多角色／多地圖，
不做 p-value、權重調整或 calibration。最終判定：**R1 PASS；Calibration No-Go**。

### 實作

- 新增 `tools/check_cs_measurement_r1.mjs`。
- `tools/verify.mjs` 只新增 `cs_measure_r1` segment。
- 使用 Vite test-only memory transform，fail-closed 注入 `simulateFps`／`ROSTER`／
  `TACTICS_DB` 測試 export；不寫回 `EsportsFPS3D.jsx`、不複製模擬器、不加 dependency。
- 建立版本化 `CsGameplayDigest.v1` 正式 regression gate；`strictSimDigest` 只作診斷。
- 固定 `CsMeasurementSeedSet.v1` 的 16 paired seeds，A-B-A-B 共 64 simulations。
- hard gate 證明 treatment 只有 `roster.t2.stats.acc 88 → 68`、兩組各自 deterministic、
  collector 為純後處理、輸入未被 mutate；A/B digest 相同不是失敗條件。
- expected baseline suite：
  `546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,build --timeout=600000
```

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS。
- `build`：PASS。
- runner 本次 3/3，exit 0；其餘 segment 未跑，不宣稱全套通過。
- `git diff --check`：PASS。
- `EsportsFPS3D.jsx` SHA-256 保持
  `5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

### Pilot 觀察（非 calibration 結論）

16 paired seeds 中 A/B gameplay digest 相同 0/16。目標選手 baseline→treatment：
平均 K 10.813→5.625、D 8.813→9.25、ADR 150.188→90.625、HS% 84.5→69.813、
KAST 65.875→50.563、rating 1.554→0.888；兩組 T wins 都是 0/16。
這只證明 paired measurement 可重現，不以方向／顯著性作 gate，也不換 seed。

### 刻意未做與下一步

未修改 CS gameplay／contract／Store／UI／CS23 verifier；未自動 rebaseline、未 push。
既有未追蹤 `review/moba-combat/cs23-baseline-20260810.log` 保持未納管。
下一步先做 16 項素質 Audit 與最小 opportunity→trigger→conversion instrumentation；
learning／synergy 接線、公式、角色定位與 calibration 均只做證據，不直接修改。

完整方法與 schema：`review/cs-gameplay/CS_MEASUREMENT_PILOT_R1.md`。

---

## CS Combat Instrumentation R2（2026-08-10）

### 目標與邊界

建立第一條真實 action-point KPI：
combat opportunity→fire trigger→duel／damage conversion→headshot result。
採 Vite test-only exact memory hooks，不修改正式 `EsportsFPS3D.jsx`、
gameplay／contract／Store／UI，也不調 RNG、公式、權重或平衡值。

### 實作與 hard gates

- 新增 `tools/check_cs_instrumentation_r2.mjs`。
- `tools/verify.mjs` 新增 `cs_instrument_r2` segment。
- 六個 transform marker 各精確命中一次，逆轉後逐字等於正式來源。
- 原始 21 個 `rand()` call tokens 的數量與順序完全不變。
- 固定 R1 的 16 seeds；每 seed 跑 collector off／on-1／on-2，共 48 simulations。
- off／on 完整 sim JSON 逐 seed 相同；兩次 collector event digest 相同。
- opportunity ≥ trigger，trigger＝conversion，probability／clamp／damage／kill invariants 全通過。

### 固定情境結果（非 calibration）

eventSuiteDigest：
`5720e45fd72e5e5428ff6e8e800068012a7f6b2b04c4886ce8e9f0cfb1a50089`。

- opportunities 4,385；triggers／conversions 2,133（48.643%）。
- kills 1,079（50.586% conversion）；headshots 971（45.523%）。
- Pt lower／upper clamp 5／1。
- `t2` opportunities／conversions 1,257／606。
- overkill 1,069 events／53,309 damage。

ADR 目前把 rolled damage 全額計入，即使超過 defender 剩餘 HP；R2 將此確認為
**A 類 measurement bug**。本輪不改 result／rating／contract／digest，只留證據。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,build --timeout=600000
```

- `cs23` 28/28 PASS。
- `cs_measure_r1` PASS；`CsGameplayDigest.v1` expected baseline 未變。
- `cs_instrument_r2` PASS。
- build PASS。
- runner 本次 4/4、exit 0；其他 13 segments 未跑。
- 正式 FPS source SHA 仍為
  `5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

完整報告：`review/cs-gameplay/CS_INSTRUMENTATION_R2_REPORT.md`。
下一步進入 16 項素質 Audit／wiring probe；Calibration 仍為 No-Go。

---

## CS 16 Stat Audit + Wiring Measurement R3（2026-08-10）

### 目標與邊界

完成 16 項玩家素質逐項矩陣：真實讀取位置、gameplay 作用點、作用層級、是否改變
`simulateFps`、KPI 缺口、文件差異、A–E 問題分類、風險與 calibration readiness。
本輪只做 Audit + Measurement；不調權重、公式、角色定位，不新增 gameplay branch。

### 規格審查與量測設計

- 規格：`review/cs-gameplay/CS_STAT_WIRING_R3_SPEC.md`。
- 發現完整 sim JSON 會展開 input stats，R1 digest 也含 `inputSha256`；兩者都不能直接
  比較 treatment effect。另建 `CsStatWiringDigest.v1`，只投影 output gameplay state。
- 固定 Inferno、`t_aexec`、`c_std`、既有 ROSTER 與 R1 16 seeds。
- 16 cases 各只改一名代表 T player 的一個 short stat，固定 −20；accuracy 沿用 88→68。
- baseline 與每個 treatment 逐 seed 各跑兩次，共 **544 simulations**。
- memory transform 只注入 test export、可逐字逆轉；21 個 `rand()` call sites 數量/順序不變。
- treatment deep diff 必須只有指定 stat 一條；不接受 CLI flag、換 seed 或自動 rebaseline。

### 結果

`CsStatWiringDigest.v1` suite：
`fe6b16dc81c356828e45181b186356b222e7b8de2311c8cadb689fdef3f1343e`。

- 13/16 項在固定情境觀察到 output-only gameplay 差異。
- `resilience` 0/16：靜態 read 只在 lastAlive，缺真 1vN opportunity，不能判定未接線。
- player-side `synergy` 0/16：唯一 support profile 對玩家角色映射不可達。
- `learning` 0/16：只有 roster/OVR/personality 資料，`simulateFps` 無 gameplay read。
- ADR overkill 仍是 A measurement bug；legacy `clutches` 也不是可證明的 1vN KPI。
- 文件原稱 16 項完整生效、以 fpsOvr 推論 rating，已依實作證據更正。

完整矩陣與分類：`review/cs-gameplay/CS_16_STAT_AUDIT_R3.md`。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,build --timeout=600000
```

- `cs23` 28/28 PASS。
- `cs_measure_r1` PASS；`CsGameplayDigest.v1` expected suite 未變。
- `cs_instrument_r2` PASS。
- `cs_stat_wiring_r3` PASS（544 simulations）。
- build PASS。
- runner 本次 5/5、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- 正式 FPS source SHA 仍為
  `5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。
- `git diff --check`：PASS。

### 下一步

Calibration 維持 No-Go。下一個最小安全 Sprint 是 true clutch / lastAlive
opportunity→combat→round conversion instrumentation；不夾帶 retreat、defuse、result contract
修正或 learning/synergy 接線。既有未追蹤 baseline log 仍排除，未 push。

---

## CS True Clutch / LastAlive Instrumentation R4（2026-08-10）

### 目標與邊界

R3 的 `resilience` fixed probe 為 0/16，但靜態作用點只在 `lastAlive`；現行
`clutches` 又只有勝方單一 survivor + round kill 條件。本 Sprint 只建立真實
lastAlive opportunity→combat→round result 量測，不修改公式、result 或 contract。

### 實作與 hard gates

- 規格：`review/cs-gameplay/CS_TRUE_CLUTCH_R4_SPEC.md`。
- 新增 `tools/check_cs_clutch_instrumentation_r4.mjs` 與 runner `cs_clutch_r4` segment。
- state hook 放在每 tick fresh `aliveT/aliveCT` 後、combat 前；避免死亡後 stale array length。
- 記錄 state opportunity、combat opportunity、fire trigger、damage conversion、round result
  與每回合 legacy summary；1v1 與 1v2+ 分開。
- 固定 R1 16 seeds，每 seed collector off/on-1/on-2，共 48 simulations。
- off/on 完整 sim JSON、on-1/on-2 events 逐 seed一致；21 RNG call sites 不變。
- 每個 opportunity/result、combat chain、round summary 與 sim `players[].clutches` 全部交叉驗證。

### 固定結果（非 calibration）

eventSuiteDigest：
`1a0e78c1073dea522dffa52e87aab4f094f4116a778d4cfe7a9fe9127aedc6d3`。

- 16 場／171 rounds：158 player opportunities；1v1 18、1v2+ 140。
- 1v2/1v3/1v4/1v5 = 24/50/40/26。
- opportunity wins 32（20.253%）；1v2+ wins 22（15.714%）。
- combat opportunities 444；triggers/conversions 266/266；kills 159。
- legacy clutches 27，legacy-without-opportunity 0；另有 5 次 opportunity win 未被計入
  （bomb 1、time 4）。因此 legacy 是 kill-involved subset，不是全部 true clutch wins。
- `t2` 只有 1 state opportunity、2 combat opportunities、1 win；resilience 樣本極窄，
  不能由 R3 0/16 推論未接線或權重過輕。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,build --timeout=600000
```

- CS23 28/28、R1、R2、R3、R4、build 全 PASS。
- runner 本次 6/6、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- `CsGameplayDigest.v1` expected suite、正式 source SHA、RNG、result shape 均未變。
- `git diff --check`：PASS。

### 下一步

Calibration 維持 No-Go。下一個最小安全 Sprint 是 retreat opportunity→gate→displacement→
re-engage/result instrumentation，只服務 `apm/positioning/courage/clutch`，不夾帶 defuse、
threshold/公式修改、legacy result 修正或 learning/synergy 接線。未 push。

---

## CS Retreat Instrumentation R5（2026-08-10）

### 目標與邊界

R3 已確認 `apm/positioning/courage/clutch` 會進 `aggr()`，但現行 retreat 只有
`aggr(p) < 0.82` branch，沒有 opportunity、真實位移或後續結果量測。本 Sprint 只建立
opportunity→trigger→displacement→episode→recontact/re-engage→round result，不修改 threshold、
公式、AI、result 或 contract。

### 實作與 hard gates

- 規格：`review/cs-gameplay/CS_RETREAT_R5_SPEC.md`。
- 新增 `tools/check_cs_retreat_instrumentation_r5.mjs` 與 runner `cs_retreat_r5` segment。
- `retreat_opportunity` 是 player-tick exposure；round-player episode 是 measurement grouping，
  兩者都不當成 gameplay outcome。
- trigger 後讀 `safeMove` 真實 from/to；零位移保留。recontact 與真正通過 fire roll 的
  re-engage 分開。
- 固定 R1 16 seeds，每 seed collector off/on-1/on-2，共 48 simulations。
- off/on 完整 sim、on-1/on-2 events 逐 seed一致；transform 可逆、21 RNG call sites 不變；
  input、event identities、episode 累計與 round summary 全部閉合。

### 固定結果（非 calibration）

eventSuiteDigest：
`4e94fc5c2e95633f7972d19b8864e846b793a893dbdb9a8610e84f01c87c6f20`。

- 16 場／171 rounds：1,492 opportunities，895 threshold triggers／actual displacements。
- 261 round-player episodes；94 recontacts、74 fire re-engages。
- 真實位移總計 2,440.276、平均 2.727；6 次 branch trigger 後位移為 0，如實保留。
- survived episodes 60；won episodes 124。兩者只作 chain 終點，不是 retreat 因果效果。
- 固定 roster 沒有 `aggr` 介於 0.82–0.87 的近門檻 exposure；t1／t2／ct4 全部 blocked，
  其餘五名低於門檻玩家全部通過。證明 branch 生效，但 sample 不適合 threshold calibration。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,cs_retreat_r5,build --timeout=600000
```

- CS23 28/28、R1、R2、R3、R4、R5、build 全 PASS。
- runner 本次 7/7、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- `CsGameplayDigest.v1` expected suite、正式 source SHA、RNG、result shape 均未變。
- `git diff --check`：PASS。

完整報告：`review/cs-gameplay/CS_RETREAT_R5_REPORT.md`。
Calibration 維持 No-Go。下一個最小安全 Sprint 是 CT defuse opportunity→progress→
interrupt/complete→round result instrumentation；不夾帶 utility、economy、規則或 contract 修改。
未 push。

---

## CS Defuse Instrumentation R6（2026-08-10）

### 目標與邊界

R3 確認 CT `focus/decision` 直接進 defuse progress，但正式 result 只留 `how`。本 Sprint
只建立 plant→bomb tick→proximity→contest→progress→complete→round result，並比較 production
tick-start alive arrays 與 fresh post-combat view；不改 defuse 規則、result、contract 或 UI。

### 實作與 hard gates

- 規格：`review/cs-gameplay/CS_DEFUSE_R6_SPEC.md`。
- 新增 `tools/check_cs_defuse_instrumentation_r6.mjs` 與 runner `cs_defuse_r6` segment。
- 正式 tick 是 2 秒；progress delta=`0.45+foc/250+dec/300`、threshold 3.5、跨 pause/換人不 reset。
- 固定 R1 16 seeds，每 seed collector off/on-1/on-2，共 48 simulations。
- off/on 完整 sim、on-1/on-2 events 逐 seed一致；transform 可逆、21 RNG call sites 不變；
  frame/tick/progress/complete/result identities 全部閉合。
- fixed suite 無 progress-start 後 pause。依 systematic debugging 確認是 sample 零值，不換 seed；
  pause/owner-switch 推導函式另以 synthetic chain 自我驗證。

### 固定結果（非 calibration）

eventSuiteDigest：
`9c33c3c2b10ff48bf0acdc59067184a48f5408f6b32b88324137fdd9fa0d7368`。

- 171 rounds 中 20 planted；140 bomb ticks、27 production proximity、16 progress ticks。
- 4 個 progress-started rounds 全部完成；pause/owner-switch 0，只有 ct2/ct3 增加進度。
- 三個 stale selected-defuser ticks，但沒有 dead-defuser progress/complete。
- seed 3820910912、R5、62s：已死亡 t1 仍在 stale `aliveT`，讓 live ct3 的 production gate
  false、fresh gate true。真 branch bug 已證明，回合結果影響未證明，本輪不修。
- 16 個 `how:bomb` 只有 1 個 c4t=0；15 個仍有時間、14 個 final fresh CT=0。
  `how:bomb` 不是可靠 explosion KPI，UI 一律顯示「炸彈引爆」屬 result/UI semantic bug。

### 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,cs_retreat_r5,cs_defuse_r6,build --timeout=600000
```

- CS23 28/28、R1–R6、build 全 PASS。
- runner 本次 8/8、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- `CsGameplayDigest.v1` expected suite、正式 source SHA、RNG、result shape 均未變。
- `git diff --check`：PASS。

完整報告：`review/cs-gameplay/CS_DEFUSE_R6_REPORT.md`。
Calibration 維持 No-Go。下一個安全任務是 CS Utility Damage Audit R7，只做 read-chain、
分類與最小量測規格，不新增假 damage、平衡值或 gameplay branch。未 push。

---

## CS Utility Damage Audit R7（2026-08-10）

### 目標與邊界

唯讀追查 `utilDmg:0` 是漏收既有 damage，還是正式 simulator 根本沒有 utility damage。
本輪不新增 verifier、不改 source/contract/UI/RNG/數值，也不以視覺事件假裝 gameplay outcome。

### Read-chain 結論

- `roundDmg`、`dmgDealt`、HP damage 都只有 firearm duel 一個寫入點。
- HE：購買／throw／cast／render 有，detonation damage 無。
- molly：player throw 與 tactic fire render 有，damage/zone/path gameplay 無。
- player smoke：購買／throw 有，但不寫入 `smokes`，不阻 LOS；tactic smoke 才會進
  `smokeBlocks`，但沒有 player attribution。
- flash：throw 與 AoE 會寫 `p.flash`、`flashPen` 改 Pt；但每次 firearm duel 也把雙方
  `flash=3`，state source 混用，無法把 conversion 歸因給 utility。
- engine 硬寫 `utilDmg:0`；`CsMatchResult.v1` 不轉出、現行 Result UI 不顯示。

### 分類與判定

- `utilDmg:0`：**C gameplay/design placeholder**，不是 A 類漏收。
- HE/molly/player smoke：**C gameplay/design 缺口**。
- tactic smoke：**E 窄但真實生效**。
- flash attribution：**B instrumentation 缺口**；gun-hit/flash 共用 state 為 **A/C 語意混用**。
- 新增 utilDmg instrumentation：**No-Go**；沒有 damage conversion 可量。

完整證據：`review/cs-gameplay/CS_UTILITY_DAMAGE_R7_AUDIT.md`。
16 項最終風險／P0–P3 優先級已追加到 `CS_16_STAT_AUDIT_R3.md`。
Calibration 維持 No-Go；下一步若修 ADR overkill、stale defuse、`how:bomb`、learning/synergy
或 utility gameplay，都會觸及正式 gameplay/result/contract/digest，需另開授權 Sprint。未 push。

---

## MOBA Combat 16 項素質 closure — Codex 整合部署（2026-08-10）

### 整合策略與範圍

- 從乾淨 `main@8ad658f` 建立 `integrate/moba-combat-closure`，以 squash 方式承接
  `release/moba-combat-closure` 的 15 commits；唯一衝突是本檔追加章節，雙方內容完整保留。
- 原 release 歷史誤追蹤 201 個 `.log/.json/.csv` fixed-seed probe 產物，未直接推入 main；
  部署版排除全部生成輸出並加入 ignore 規則。原分支／未追蹤 baseline log 均未改動。
- 正式 `src` 僅 5 檔：`LogicEngine.js`、`matchProgression.js`、`mobaPlayerStats.js`、
  `playerModel.js`、`mobaReplay.js`。正式 FPS source、RNG、result、Store、UI 均未修改。

### 玩家行為改動

- `teamfightSyncV1`、`roamQualityV1`、`riskAssess`、`diveAssess` 為現役 v3 行為；
  synergy 改為共同投入品質，Support 遊走增加候選評分／travel commitment／6 秒重評，
  並拒絕明顯不安全追擊與越塔。
- learning 進入本場 `xpRateScale`，新增 `meta`「版本研究」課程；replay 取樣 2.0→2.5 秒。
- `retreatReevalV1=false`、`retreatHoldV1=false`，修法未出貨；未修改傷害、winner、gold、
  post-match reward 或 replay frame contract 版本。
- CS R1–R7 仍是 deterministic instrumentation／read-chain audit；Calibration No-Go。

### Fresh 驗證與 baseline 判定

```text
乾淨 main：milestone_j 37/39 EXIT=1；milestone_e 47/49 EXIT=1
integration tools/verify.mjs：26/28；唯一兩紅仍為 J 37/39、E 47/49
runtime29 PASS（190s）；production build PASS（28s）
combat credibility 45/45 PASS
roam quality 18/18 PASS
teamfight commitment 15/15 PASS
retreat chain：retreatHoldV1=false，只完成基準診斷，未做斷言
git diff --check／未解衝突／禁止產物：全部 0
```

E 在 runner 顯示 0 秒是 208ms 完整執行，不是啟動 crash。舊 acceptance worktree 中屬於
已不存在合併樹的 ignored `.verify-state.json` 已精確移除；未停止任何既有 Node 行程。

### Commit／push／Pages

- 整合 commit：`ce22b9b`（`MOBA Combat: integrate 16-stat closure and CS audit`）。
- 遠端 `main` 經 SHA 核對後由 `8ad658f` fast-forward 到 `ce22b9b`，未 force push。
- GitHub Actions run `31362830501`：build、deploy jobs 均 `success`。
- 正式站 HTML 與 bundle 均 HTTP 200；現役 `assets/index-CUf50IjS.js`（2,600,619 bytes）
  已驗到「版本研究」與 `predicted_ttk_too_long`，不是只確認 workflow 狀態。

### 未實測

Node 與 HTTP 無法證明 Android 真機 FPS、觸控、熱降頻或視覺體感；以上仍待 Ray 人工驗收。
本輪完成後停止，未自動開始下一 Sprint。

---

## Milestone M1.5 小兵選敵回歸修正收尾（2026-08-11）

### 決策與實際修改

- **小兵集中攻擊前排回歸已修正。** M1.5 的 `queueGap` 會讓前排只有極小距離差，
  舊的 `gap × 1000 + slotGap × 1` 仍會使四隻兵重複鎖定同一前排；本輪只把現役 v3
  選敵的 slot tie-break 權重調為 2，讓首輪四對四維持可達的一人一目標。
- **保留 M1.5 兵線前進機制。** `queueGap`、高地倒後強化兵、基地兵線閘門與兵線進基地
  路徑都沒有移除或繞過；B.4 微場景另斷言雙方位置仍有 queue gap。
- 不改小兵移動、射程、傷害、攻速、同時結算，也不改英雄、勝負、獎勵、Replay contract
  或已 PASS 的 M1.5／M1.6 核心修法。本輪到此停止調參與核心邏輯修改。

### B.4 正式安全網

- `tools/check_moba_milestone_b4.mjs` 補強四對四首輪逐隻 HP、M1.5 queue gap、同 seed
  Replay frame 決定性與塔離散清兵斷言。
- `tools/verify.mjs` 已正式登記 `milestone_b4` segment；不是只留一支游離腳本。
- 2026-08-11 聚焦重跑：直接執行 B.4 與 `verify --only=milestone_b4` 均為
  **exit 0／PASS**，runner 本次 **1/1**。

### 30-seed M1.5 sweep 與記憶體事件

- `waveFrontBias` 五組候選（baseline、0.018、0.022、0.026、0.030）均改以獨立行程完成
  各自完整 **30 seeds**；五組結果逐值相同：完成率 100%、15–32 分鐘 100%、
  平均／中位／p95／最長 23.0／23.1／26.9／28.8 分、藍勝率 50%。
- **30-seed sweep 全部完成，determinism 100%、進基地 100%。** 另量到終局 waveT
  上／中／下 0.51／0.51／0.48，無兵線攻擊建築 1；沒有降低任何驗收標準。
- 較早一次合併 sweep 中途曾出現 `memory allocation of 4191520 bytes failed` 並退出回
  PowerShell。該腳本沒有 Rust／subprocess 路徑；判定為 Node 原生配置在主機記憶體壓力下
  失敗，不是 Codex 本身。**中斷那次不計入結果**；後續以獨立、完整的五組 30-seed
  驗證取代，因此不影響上述結論。

### 正式 gates 與既有紅燈

- `check_combat_range_m16.mjs`：**19/19 PASS**。
- `regress.mjs`：**15/15 PASS**；`regress2.mjs`：**8/8 PASS**（20/20 完成）。
- production build：**PASS**（只有既有 chunk-size warning）。
- `runtime29`：**34/35**；紅燈是既有 **TD-21**。`tools/verify.mjs` 的紅燈為既有
  **TD-21／milestone_j**，不是本輪小兵選敵修正新增；未放寬門檻或刪除斷言。

本輪已完成 commit／push／deploy；未開始英雄清兵、補刀或其他下一功能。
---

## Milestone Q1（2026-08-10）— 隊伍身分 / 賽季種子 / 比賽來源

Competition MVP 的第一個 Milestone。規格：`docs/design/賽季與賽事系統架構.md`。
**已於 2026-08-11 收尾 commit（`339411f`），見本檔最後一節。**

### 做了什麼

| # | 項目 | 檔案 |
|---|---|---|
| 1 | **不可變 `team.id`** | `platform/identity/teamIdentity.js`（新）＋ `profileStore` |
| 2 | **不可變 `meta.seasonSeed`** | 同上 |
| 3 | **`MatchOrigin.v1`** | `platform/contracts/matchOrigin.js`（新） |
| 4 | assignment / room / session 支援兩種來源 | `matchmaking.js`／`matchRoom.js`／`matchSession.js` |

### 為什麼要有 team.id

Q1 之前，全專案唯一被當隊伍識別碼用的是 `profileStore.team.tag`（值 `"GSEAL"`）
——那是**顯示用的縮寫**。單機看不出問題，賽季系統一接上就會壞：玩家改隊名或
改 tag，積分榜、Circuit Points、歷史賽果全部斷開。

`identity/teamIdentity.js` 是**唯一**的補齊規則（比照 `economy/newGame.js` 的教訓：
store 與驗證器共用同一份，不讓驗證器自己再組一套而驗到現實中不存在的狀態）。
`ensureTeamIdentity()` **冪等**——已有合法值就原樣回傳，這就是「不可變」的實作：
改隊名不會換 id。

⚠ `withIdentity()` 必須在合併完 `saved.team` **之後**呼叫，否則會拿 DEFAULT 的隊名
去推導，讓不同存檔算出同一個 id。

### 為什麼要有 seasonSeed

賽程產生器需要「同一賽季重排逐場相同」。那個種子若來自 `Date.now()`，
O 系列一路守住的決定性鏈當場就斷。

`seedForSeason(seasonSeed, seasonNumber)` 是**逐賽季派生**——Q2a 的賽程產生器必須
用這一支，不得直接用 `meta.seasonSeed`，否則每個賽季會排出完全一樣的賽程。

### MatchOrigin.v1：換名 + 放寬，不是語意變更

```
票券來源：{ kind: "ticket",  originId: ticket.ticketId, ... }
賽程來源：{ kind: "fixture", originId: fixture.fixtureId, competitionId, stageId, ... }
```

因為票券來源的 `originId` **就是** `ticketId`：

```
assignmentId = hash8(`${originId}:${seed}`) ≡ hash8(`${ticketId}:${seed}`)
```

⇒ 既有排隊路徑產生的每一個 id 逐字元不變，**六支既有 verifier 的斷言一條都沒改**。

`assignment.ticketId` / `room.ticketId` / `session.ticketId` 自 Q1 起降級為
**origin 的衍生相容欄位**（ticket 來源 = originId，fixture 來源 = null），
推導點只有 `compatTicketIdOf()` 一處，不是第二份真相。
完全移除它們留到 fixture 路徑真正上線之後，本輪刻意不動。

### 兩個 verifier 抓到的真 bug（不是放寬斷言）

**（一）`check_match_session_o6 §1h` 紅燈**：我原本讓 `src` 優先取 `room.origin`，
導致「房間與票券不符」的檢查變成**自己比自己**，永遠成立。
根因是取值優先序——房間是被檢查的對象，不是憑證。修法：
`src = origin ?? originFromTicket(ticket).origin`，**不得回退到 `room.origin`**。
這條已寫成 `check_competition_q1 §7c` 的原始碼斷言釘住。

**（二）第十次踩到「verifier 掃關鍵字」**：`check_competition_q1 §6` 第一版斷言
「新模組沒有 `Math.random()`」，結果掃到**自己檔頭註解裡**的那行說明而假紅。
修法：① 先剝掉註解再掃原始碼；② 純度改用**行為**證明（`deriveTeamId` 連跑 200 次
結果全同）。08 文件的「制度教訓（一）」計數 +1。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q1`（新增） | **93/93** exit 0 |
| 六支既有 match verifier | **238/238** 全 exit 0，**斷言零修改** |
| 排隊路徑識別碼逐字一致 | moba／cs 各 9 項全部與 Q1 前基線相同（釘死在 §5） |
| `check_finance_n` / `n2` / `n3` | 32/32、35/35、40/40 |
| `check_recruit_o` / `check_progress25` | 40/40、34/34 |
| `check_talent27`（`ESMO_VERIFY_FLAT=1`） | 37/37 |
| `npm run build` | exit 0，`built in 12.63s` |

引擎零改動：`LogicEngine.js`、`src/battle/`、`mobaReplay.js`、`BattleResult.js`
全不在本輪 diff 內。

### 未做（刻意）

- **Q2a 以後全部沒開始**：沒有 AI 隊伍、沒有 Competition／Stage／Fixture、
  沒有賽程產生器、沒有 `competitionGateway`。
- **`canEnterRoom` 的賽程分支只比對來源，沒比對指派單**——賽程路徑的指派單由
  `competitionGateway` 持有，Q1 沒有那個東西。已在原始碼註明，Q3 補上。
- **`launchConfigOf` 沒有加 `origin`**：`check_match_session_o6 §154` 斷言了它的
  完整欄位集合。要加是 Q3 的決定，本輪維持既有斷言不動。
- 票券物件也沒有加任何欄位（`check_matchmaking_o4 §63` 斷言了完整欄位集合）。
- **未經瀏覽器實測**：`team.id` / `seasonSeed` 的 migration 只有 Node 驗證，
  真實舊存檔載入未在瀏覽器跑過。

---

## Milestone Q2a（2026-08-10）— AI 隊伍 / 賽事契約 / 賽程產生器

Competition MVP 第二個 Milestone。規格：`docs/design/賽季與賽事系統架構.md`。
全部是新檔，既有原始碼零修改。
**已於 2026-08-11 收尾 commit（`57d1c6f`），見本檔最後一節。**

### 做了什麼

| # | 項目 | 檔案（皆為新增） |
|---|---|---|
| 1 | 7 支唯讀 AI 隊伍 + 8 隊參賽者組裝 | `platform/competition/aiTeams.js` |
| 2 | Competition / Stage / Fixture 契約 | `platform/contracts/competition.js` |
| 3 | `round_robin` 雙循環賽程產生器 | `platform/competition/scheduleGenerator.js` |
| 4 | 常規賽組裝入口 | `platform/competition/regularSeason.js` |
| 5 | 驗證器 112 條 | `tools/check_competition_q2a.mjs` |

### AI 隊伍為什麼不進 profileStore.players[]

規格 D9。`players[]` 的定義是**「會被經營系統寫入的人」**——薪資、訓練、疲勞、
招募、天賦全掛在上面。35 名 AI 選手若進那張表，週結算會付他們薪水、
`advanceDay` 會幫他們回體力、RosterScreen 會列出他們。

分成兩件事處理：**資料模型**共用 `data/playerModel.js` 的 16 項能力與個性
（不是第二套模型，verifier §1h 逐鍵比對證明）；**儲存位置**在 competition domain，
唯讀靜態。AI 選手日後真被買走時才走既有招募路徑進 `players[]`。

唯讀的可驗證判準（§1m/§1n）：AI 選手**不帶任何經營欄位**
（`rosterTier`／`salary`／`xp`／`talentPoints`／`talents`／`training`），且都標 `readOnly: true`。

AI 隊伍 id 用 Q1 的 `deriveTeamId` 產生 ⇒ **與玩家在同一個命名空間**（`isTeamId` 驗得過）。
隊名沿用 Legacy `AI_TEAMS` 的 ESMO 自有名稱（取 7 支），未使用任何真實戰隊名稱。

### 賽程演算法

環形演算法（circle method）：固定第一支、其餘輪轉。8 隊 ⇒ 每循環 7 輪 × 4 場。
奇數輪把第一組主客互換，避免固定隊伍每輪都是主場。
第二循環把第一循環每一場主客互換。

**主客場對稱的數學保證**：每隊第一循環打 7 場（主客分布任意），第二循環全部互換
⇒ 總主場 = 第一循環主場數 + 第一循環客場數 = **恰好 7**。與洗牌結果無關。

日程：14 輪平均分配到 84 天 ⇒ 每 6 天一輪，第 1 輪第 6 天、第 14 輪第 84 天。
同一輪的 4 場在同一天（比賽日）。**玩家每輪恰好一場**——這是 Q3 行事曆驅動的前提。

### 種子鏈

```
meta.seasonSeed（Q1，不可變）
  → seedForSeason(seasonSeed, season)   ← regularSeason.js 派生
    → 決定性洗牌 8 名參賽者
      → 環形演算法 → 56 場 Fixture
```

⚠ **不得直接用 `meta.seasonSeed`**——那會讓每個賽季排出完全一樣的賽程。
§5c 用「第 1 賽季與第 2 賽季賽程必須不同」把這條釘住。

`fixtureId = fx:<gameMode>:<hash8(stageId|r<round>|sideA|sideB)>`，**有序**
⇒ 主客互換是不同 id（§7d）、不同輪次的同一對也是不同 id（§7e）。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q2a`（新增） | **112/112** exit 0 |
| 8 隊雙循環場數 | **56 場**（14 輪 × 4 場） |
| 玩家 / AI vs AI | **14 / 42**，相加 = 56 |
| 同 seed 重跑 | 連跑 20 次賽程逐場完全一致（含順序） |
| 主客場對稱 | 8 隊全部 7 主 7 客；每對互為主客各一次；第二循環 = 第一循環互換 |
| fixtureId | 56 個全部唯一、格式一致、重跑逐字相同、跨賽季不相撞 |
| `check_competition_q1` | 93/93 |
| 六支既有 match verifier | 238/238 |
| `finance_n/n2/n3`・`recruit_o`・`progress25`・`talent27`(FLAT) | 32/35/40・40・34・37 |
| `npm run build` | exit 0，`built in 9.68s` |

**獨立抽查**（不透過 verifier，直接印賽程）：
第 1 輪 `FP主vIG／TB主vOB／SW主vSE／ED主vME`，
第 8 輪 `IG主vFP／ME主vED／OB主vTB／SE主vSW` ⇒ 確為主客互換。
玩家對手分布 `{ED:2, OB:2, TB:2, FP:2, SW:2, SE:2, IG:2}`、主 7 客 7、
比賽日 `6,12,…,84`。

### 未做（刻意，且由 §8 的斷言擋住）

- **不產生 `FixtureOutcome`**、**不做 `simulateFixture`**、**不做 Standings** —— Q2b。
- **不碰 Battle Engine / Shop / Ranking** —— §8f/§8g 原始碼斷言。
- **不做 CS 賽事** —— 契約層允許 `cs`，但組裝入口只建 MOBA（§8h/§8i）。
- **Stage Graph 只有一個節點、零條邊** —— 型別在、圖是空的（§8j）。
  第二階段加季後賽是「加節點加邊」，不是改模型。
- **沒有接 `advanceDay`、沒有 `competitionGateway`、沒有畫面** —— Q3。
- **賽程尚未持久化** —— 目前是純函式產生，沒有存進 profileStore。Q3 要決定
  「存整份賽程」還是「存 seed 重算」。⚠ 這與 D11（賽果不可變）不同層次：
  賽程可重算，賽果不可。

---

## Milestone Q2b（2026-08-10）— 賽果 / 隊伍實力 / 決定性模擬 / 積分榜

Competition MVP 第三個 Milestone。規格：`docs/design/賽季與賽事系統架構.md`。
全部是新檔，既有原始碼零修改。
**已於 2026-08-11 收尾 commit（`b41d550`），見本檔最後一節。**

### 做了什麼

| # | 項目 | 檔案（皆為新增） |
|---|---|---|
| 1 | `FixtureOutcome.v1` ＋ 兩類 Analytics 出口 | `platform/contracts/fixtureOutcome.js` |
| 2 | `teamStrength(roster)` | `platform/competition/teamStrength.js` |
| 3 | 決定性 `simulateFixture` / `simulateFixtures` | `platform/competition/simulateFixture.js` |
| 4 | Standings 純推導 ＋ 五級 tiebreaker | `platform/competition/standings.js` |
| 5 | 驗證器 92 條 | `tools/check_competition_q2b.mjs` |

### teamStrength 為什麼要建在 calcPower 之上

規格 D16 的重點是「模擬器**必須真的吃 16 項能力**」。若模擬只用
`AI_TEAMS[].strength`（那是 Q2a 用來**產生 roster 的錨點**），35 名 AI 選手的
16 項能力就一項都沒被用到，D9「共用 playerModel」只是好看。

`calcPower(player, mode)`（Legacy 逐字）已經處理了 16 項能力 × 模式權重 ×
個性 boost/nerf × 士氣 × 狀態。`teamStrength` 只負責「五個人怎麼合成一隊」：
`0.8 × 全隊平均 + 0.2 × 最強一人`。刻意只有兩項——沒有校準資料之前，
更複雜的模型只是假精確。

**行為證明**（不是掃關鍵字）：
- §2e 改隊伍的 `strength` 欄位 ⇒ 實力值不變
- §2f 改任一名選手能力 ⇒ 實力值改變
- §2g **16 項能力逐項驗**：每一項各加 12 分，實力值都必須改變（沒有任何一項被忽略）
- §3f/§3g 模擬層同樣的兩條
- §6g 模擬器**根本沒有 import aiTeams** ⇒ 拿不到 `strength`

### FixtureOutcome 的兩個設計決定

**（一）自帶對戰雙方。** `sideA`/`sideB` 從 fixture 複製過來。理由：賽果不可變、
但**賽程可由 seed 重算**——若賽程產生器日後改版，舊賽果仍必須說得出「當時是誰打誰」。
自帶雙方 id 才是可稽核的紀錄，這不是重複的真相。

**（二）不可變是實作出來的，不是寫在文件裡。** `Object.freeze` 賽果與其 `score`，
且契約**刻意不提供任何** update／patch／transition 函式（§1f/§1g 斷言）。

`simulatorVersion` 與來源必須相符：simulated 必填、**engine 必須為 null**（§1i）。

### 兩類 Analytics 是結構上的分界，不是自律

```
competitionOutcomes()  → 勝敗／Standings／晉級／積分／獎金／賽季歷史（engine + simulated）
combatOutcomes()       → KDA／場均擊殺／龍／巴龍／引擎平衡校準（**只吃 engine**）
```

§5g 有一條原始碼斷言：**Standings 不得呼叫 `combatOutcomes`**——否則 42 場 AI 賽果
會被吃掉，積分榜只剩玩家自己的 14 場。

### Standings 的五級 tiebreaker 必須是全序

```
積分 → 對戰成績 → 淨勝分 → 總得分 → teamId 字典序
```

最後一級不是裝飾。沒有它的話，同分同差同得分的兩隊排序會取決於**陣列順序**
——那正是本專案 P0 級缺陷「players 陣列順序決定勝負」的同一種病。
§4l/§4m 用「打亂賽果順序」「打亂參賽者順序」證明結果完全相同。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q2b`（新增） | **92/92** exit 0 |
| 決定性 | 同 fixture + 同 seed + 同版本連跑 50 次逐值一致；整批 42 場重跑一致 |
| 場次獨立性 | 每場種子由 fixtureId 派生 ⇒ 抽掉前 5 場，其餘 37 場結果逐值不變 |
| 積分榜 | 56 場全計入、總勝場 = 總敗場 = 56、淨勝分總和 0、名次連續 1–8 |
| 既有回歸 | `q2a` 112、`q1` 93、六支 match 238、`finance_n/n2/n3` 32/35/40、`recruit_o` 40、`progress25` 34、`talent27`(FLAT) 37 |
| `npm run build` | exit 0，`built in 12.22s` |

**獨立抽查**（不透過 verifier）：跑完整季 56 場，積分榜
`SW 11-3(33)／TB 9-5(27)／FP 8-6(24)／IG 8-6(24)／ME 7-7(21)／ED 6-8(18)／SE 4-10(12)／OB 3-11(9)`。
勝敗各 56、淨勝分總和 0。

FP 與 IG 同積分 24，但 FP 淨勝分較低（17 vs 23）卻排在前面——**查證確認**
FP 對 IG 直接對戰 2–0（`26:20` 與作客 `19:23`），對戰成績 tiebreaker 確實生效，
不是巧合。

### ⚠ 制度教訓（第十一次，且是同一 session 內重犯）

Q1 剛把「verifier 掃關鍵字會掃到自己的註解」寫成第十次教訓，本輪 §5g 第一版
又踩：`standings.js` 的**註解裡**提到 `combatOutcomes()`，被自己的正則抓到而假紅。
§6 明明已經有 `stripComments`，但 §5g 自己寫了一份沒剝註解的掃描。

**修法不是再補一次，而是移除重複**：`stripComments` / `readCode` 提到模組層級，
全檔共用，各節不得自己寫掃描。往後新 verifier 一律照這個結構。

### 未做（刻意，且由 §6 的斷言擋住）

- **不接 profileStore**（§6d）、**不做 advanceDay**（§6e）、
  **不做玩家出賽／competitionGateway**（§6f）—— Q3。
- **不碰 Battle Engine**（§6c，連 `BattleResult` 字樣都不得出現）。
- **棄權（forfeited）尚未產生賽果** —— Fixture 有 `forfeited` 狀態，但 Q2b 沒有
  對應的 FixtureOutcome。**Q3 要決定**：棄權是產生一筆賽果，還是由 Standings
  另讀 `fixture.status`？⚠ 若選後者，就等於引入第二份勝敗真相，要很小心。
- **模擬勝率未與 LogicEngine 校準** —— 規格 D16／R10 的自覺取捨，列第二階段。

---

## Competition MVP 收尾：Q1／Q2a／Q2b 上分支並部署（2026-08-11）

分支 **`milestone-q-competition`**，基準 **`origin/main` = `9b40df2`**，
已 fast-forward 併入 main（`f21d18a`）並部署。Q3 未開始。
部署與整合細節見本節最後的「正式整合與部署」。

### 為什麼不是直接在原工作區 commit

Q1–Q2b 是在 `milestone-n-finance`（`7bd858c`）上做的，而 **main 早已前進 8 個
commit**（MOBA 戰鬥收斂、M1.5 小兵選敵、配對流程修正）。`main..HEAD` 為空
⇒ 該分支的內容已全在 main 裡，繼續在上面疊等於在過期基準上長分支。

同時工作區還躺著 **hero-proxy 的 WIP**（`featureFlags.js`、`ChichuanHeroProxy.jsx`、
`DadiHeroProxy.jsx`、`public/assets/`），而 main 也動過同一批檔案
⇒ 直接 merge 會被擋，硬解會壓到那份未完成的工作。

**做法**：另開 worktree、從 `origin/main` 開新分支，把 Q 系列以 patch／複製落上去。
原工作區**一個檔都沒動**，hero-proxy WIP 原封不動留在 `milestone-n-finance`。

### 落地方式與衝突

| 對象 | 方式 | 結果 |
|---|---|---|
| Q 系列新檔（14 個） | 直接複製 | 無衝突 |
| Q1 對既有契約的修改（`matchRoom`／`matchSession`／`matchmaking`／`profileStore`） | `git apply -3` | **四檔全部乾淨套用** |
| `00_目前專案狀態`／`04_Roadmap` | `git apply -3` | 乾淨 |
| `05_Sprint紀錄`／`08_目前待辦與風險` | `git apply -3` | **衝突**——main 也在同位置追加。手動保留雙方，依時序排列 |

**風險點已查證**：main 動過 `src/data/playerModel.js`，而 `teamStrength` 相依
`calcPower()`。實查 diff 為**只新增 `TRAINING_COURSES` 條目**，`calcPower` 未動
⇒ 實力推導基準不變，Q2b 的模擬數值不受影響（驗證器逐值比對亦全綠）。

### Commit 切分

| SHA | 內容 |
|---|---|
| `8b20f6d` | 規格文件 `docs/design/賽季與賽事系統架構.md` |
| `339411f` | Milestone Q1：`team.id`／`meta.seasonSeed`／`matchOrigin` |
| `57d1c6f` | Milestone Q2a：Competition 契約／AI 隊伍／賽程產生器 |
| `b41d550` | Milestone Q2b：`FixtureOutcome`／`teamStrength`／模擬／Standings |
| （本節） | handoff 文件同步 |

### 在**整合後的樹**上重跑的驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q1` | **93/93** exit 0 |
| `check_competition_q2a` | **112/112** exit 0 |
| `check_competition_q2b` | **92/92** exit 0 |
| `check_match_entry_o3` | 35/35 |
| `check_match_room_o5` | 45/45 |
| `check_match_session_o6` | 36/36 |
| `check_matchmaking_o4` | 47/47 |
| `check_matchmaking_flow_acceptance` | 97/97 |
| `check_acceptance_fix_p1` | 81/81 |
| `regress.mjs` | 結束率 15/15、平均時長 22.5 分、0 殺場 0、撤退鎖死 0 |
| `regress2.mjs` | 節奏門檻 **8/8** |
| `npm run build` | exit 0，`built in 11.84s` |

O 系列六支 match verifier 全綠是本輪的重點——Q1 改的是**共用契約**，換基準後必須
重驗，不能沿用舊基準的結果。

### 未驗證（誠實標示）

- **完全沒有瀏覽器實測。** Q1–Q2b 沒有任何 UI，但 `profileStore.load()` 的
  `withIdentity()` 會在**每次載入既有存檔**時跑 ⇒ 舊存檔的實際載入行為只有
  Node 層斷言，沒有真的在瀏覽器開過。Q3 接上畫面前應補一次。
- **分支未合併回 main、未部署。** 只 push 分支。

### 未做

- **Q3 未開始**（`advanceDay`／`competitionGateway`／玩家出賽／resume／forfeit）。
- 棄權賽果模型仍未決定——見 `08_目前待辦與風險.md`，這是唯一可能回頭推翻 Q2b
  設計的問題。

### 正式整合與部署（2026-08-11）

**fast-forward，無 merge commit**：`main` `9b40df2` → **`f21d18a`**
（超前 5、落後 0，`git merge-base --is-ancestor` 確認後才動）。

整合當下 main 正被第三個 worktree `ESMO-acceptance` 佔用（dirty 0）。
`git branch -f main` 會被 git 擋下（分支已被 worktree 檢出），因此改為
`git push origin milestone-q-competition:main` 先推遠端，再由該 worktree
`merge --ff-only origin/main` 補齊本地。**主工作區 `ESMO` 全程未動**——
仍停在 `7bd858c`／`milestone-n-finance`，124 項 dirty（hero-proxy WIP）原封不動。

| 驗證項 | 結果 |
|---|---|
| `check_competition_q1` | **93/93** exit 0 |
| `check_competition_q2a` | **112/112** exit 0 |
| `check_competition_q2b` | **92/92** exit 0 |
| `npm run build` | exit 0，`built in 10.07s` |
| Actions run 31453814360（`f21d18a`） | **success** |
| <https://rayhuang0323.github.io/ESMO-/> | **HTTP 200** |
| 線上 bundle `assets/index-C3BhJ1mz.js` | HTTP 200；**與本地 `f21d18a` 建置 hash 逐字相同** |

比對 bundle hash 是刻意的：本專案有過「workflow 綠燈但站上不是那份程式」與
「deploy 成功但 workflow 顯示 failed」的前例，**只看 Actions 結論不足以宣稱已部署**。

⚠ 第一次在 `ESMO-acceptance` 跑 build 時失敗，訊息是
`memory allocation of 919100 bytes failed`——**主機記憶體不足，不是程式錯誤**。
同一個 commit 換一個 worktree 重跑即通過。與 M1.5 那次 Codex 中斷是同一類現象。

**仍未驗證**：完全沒有瀏覽器實測。已部署不等於已驗收——`profileStore.load()`
的 `withIdentity()` 會在每次載入既有存檔時執行，正式站上舊存檔的實際載入行為
**沒有任何人用瀏覽器看過**。這是目前最該補的一項。

**（後續補記，2026-08-11）** 上面這一項已用**正式站真實瀏覽器**驗過：
以 Q1 前的程式（`9b40df2`）產生一份真實舊存檔灌進正式站，reload 後隊名／tag／
資金／天數／週次／賽季／5 名選手全部保留、console 零錯誤；指派訓練觸發存檔後
`team.id` = `team:31180251`、`seasonSeed` = `1848900820` 落盤，與 Node 層預期值
逐字相同。用的是專案自製的零相依 CDP（獨立 profile 的 headless Chrome），
沒有碰到任何人的真實存檔。

---

## Milestone Q3（2026-08-11）— 出賽 / 日曆 / 棄權

Competition MVP 第四個 Milestone。規格：`docs/design/賽季與賽事系統架構.md` §9。
分支 `milestone-q3-competition`（基準 `origin/main` = `99eb3ec`）。Q4 未開始。

### 做了什麼

| # | 項目 | 檔案 |
|---|---|---|
| 1 | 棄權賽果（第三種來源 `forfeited`） | `contracts/fixtureOutcome.js`（改） |
| 2 | 來源分計把棄權與模擬分開 | `competition/standings.js`（改） |
| 3 | 賽程出賽閘道 | `competition/competitionGateway.js`（新） |
| 4 | 賽季日曆純 reducer | `competition/seasonState.js`（新） |
| 5 | Store 整合（賽季 slice、`advanceDay` 停止、出賽／收尾／棄權） | `platform/profileStore.js`（改） |
| 6 | 驗證器 | `tools/check_competition_q3.mjs`（新，90 條） |

### 棄權定案（本輪由 Ray 拍板）

棄權**產生正式 `FixtureOutcome`**，`resultSource: "forfeited"`，有勝方有敗方。
另一個選項是讓 Standings 自己去讀 `fixture.status`——**那等於第二份勝敗真相**，
積分榜要同時看賽果陣列與賽程狀態，不一致時沒人說得出聽誰的。

不偽造任何 Combat 資料，而且是**建立面與驗證面雙向擋**：

```
score 必須 0:0 · duration 必須 0 · seed 必須 0 · 不得有 highlights · 不得有 simulatorVersion
```

`seed: 0` 是刻意的：棄權沒有任何亂數過程，非零種子會暗示一個不存在的隨機決定。
副作用是棄權對淨勝分零貢獻——勝方拿 3 分但不拿分差，這是正確的。

Analytics 分界照 Q2b 的結構延伸：`competitionOutcomes()` 收棄權（正式敗場），
`combatOutcomes()` **排除**棄權（一場沒發生過的比賽會直接汙染場均擊殺的分母）。

⚠ `standings.js` 原本是 `if (engine) ... else simulated`，棄權加進來會被那個
`else` **謊報成模擬**。已改成三路分計並加 `forfeitedGames`，§1o 用行為釘住。

### ⚠ 與規格的一處刻意偏離：停在哪一天

規格 §9 的算術舉例是「第 3 天有比賽 ⇒ `advanceDay(7)` 只推 2 天」，也就是停在
比賽日的**前一天**。照那樣做，玩家永遠走不到比賽日，比賽也就永遠打不了。

改採：**走得進比賽日，但比賽沒收尾就走不出去**。

```
advanceDay(30) 從第 1 天 → 實際推 5 天，停在第 6 天（比賽日）
比賽沒收尾時再 advanceDay(5) → 推進 0 天，時鐘完全不動
出賽收尾（或棄權）後 → 推得動，停在下一個玩家賽事日
```

規格 D15 否決過「照推並自動判棄權」（玩家會因手滑丟掉整季），所以
**棄權不會自動發生**，要玩家自己按 `forfeitFixture()`。唯一的自動棄權是
`sweepOverdue()`——把「日期已過卻還沒收尾」的場次補判掉，用途是讓
「過去不存在未完成場次」這個不變式成立（舊存檔、日後的賽季快進）。

### 沒有建立第二條比賽流程

`competitionGateway` 與 `matchmaking/mockGateway` 的關係是**兩個伺服器實作對同
一份契約**，不是兩條管線：

```
issueFor()            → contracts/matchmaking.js  createAssignment
openRoomForFixture()  → contracts/matchRoom.js    createRoom
openSessionForFixture() → contracts/matchSession.js createSession
之後 poll / 確認 / launch / 結算 / resume 完全共用既有 action
```

§6d 有原始碼斷言：閘道不得自己出現 `roomId:` / `sessionId:` / `launchToken`，
§6e 斷言不得自己組 `assignmentId`。中離重連沿用 O6 既有的 `resumeSession`，
**Q3 沒有為賽事新增任何重連機制**。

Store 端只改了兩處既有行為，都是為了讓賽程房間走得通：

1. `pollMatchRoom` 對 `origin.kind === "fixture"` 的房間**跳過票券檢查**——
   賽程房間依契約 `ticketId` 為 null，那道檢查會一開房就把它關掉。
2. `openMatchRoom` 認得賽程房間並沿用，不重開（重開會產生第二張進場令牌，
   正好是 O6 要擋的事）。

### 一個 Q1／Q2a 之間的接縫

`originFromFixture()`（Q1）寫在 `Fixture.v1`（Q2a）定型之前，欄位名對不上：
契約用 `id` / `gameMode`，來源函式讀 `fixtureId` / `mode`。轉接收在
`competitionGateway.fixtureOriginInput()` **一處**，沒有散到呼叫端。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q3`（新增） | **90/90** exit 0 |
| `check_competition_q1` / `q2a` / `q2b` | 93／112／92，全 exit 0 |
| `finance_n` / `n2` / `n3` | 32／35／40 |
| O 系列六支 match verifier | 35／47／45／36／48／27 |
| `recruit_o` / `progress25` | 40／34 |
| 兩支驗收包 | `acceptance_fix_p1` 81、`matchmaking_flow` 97 |
| `regress` / `regress2` | 結束率 15/15、節奏門檻 **8/8** |
| `npm run build` | exit 0，`built in 22.00s` |

**驗證器自身做過突變測試**（避免「一次就全綠」其實是斷言沒作用）：
把 `combatOutcomes` 改成也吃棄權 ⇒ §1n 變紅；把「停在比賽日」的判斷關掉 ⇒
§3a/§3b/§3c/§3g 四條變紅；還原後回到 90/90。

### ⚠ 修改到既有 verifier 斷言的地方（規格要求單獨列出）

規格 §9 預告「`advanceDay` 是全案唯一會修改既有 verifier 斷言的地方」。
**實際結果與預告不同，兩個方向都要講清楚**：

- **`finance_n` 系列一條都沒改，而且全綠。** 因為停止只在「存檔已有賽季」時
  才生效，而那些驗證器建立的存檔 `competition` 是 null ⇒ 走的是與 Q3 之前
  **逐值相同**的路徑。§5a 用行為把這件事釘住。
- **真正被改的是 `check_competition_q2b` 的兩條**：
  §1k「只有兩種來源」→ 三種（新增 `forfeited`）；
  §4t 來源分佈 → 三種相加才等於出賽數。兩條都是棄權定案的直接後果。

### 未做（刻意）

- **完全沒有 UI。** Q3 做的是管線與 Store 動作（`ensureCompetitionSeason`／
  `startFixtureMatch`／`completeFixtureMatch`／`forfeitFixture`／`competitionView`），
  **沒有任何畫面**。⇒ **玩家目前在瀏覽器裡到不了賽事流程**，只有 Node 呼叫得到。
  賽事畫面要接在哪一頁、長什麼樣，是還沒決定的產品問題。
- **跨賽季換季沒做**（`meta.season` 前進時重建賽季並封存上一季）——那需要
  `FinalStandings`，是 Q4。目前 `ensureCompetitionSeason()` 只建當前賽季。
- **`completeFixtureMatch` 需要呼叫端把 `BattleResult.v2` 換算成 winner/score/
  duration**。換算函式**還沒寫**，因為賽後結算的接點在 UI 層，而 UI 沒做。
  ⇒ 玩家實打的賽果目前只能由測試手動餵。這是 Q3 最大的缺口。
- 不做 Q4／Shop／MMR／CS 賽事；沒碰 Battle Engine gameplay（§6c/§6g/§6h 釘住）。

### 未驗證

- **沒有瀏覽器實測**（沒有 UI 可測）。所有 Q3 行為都只有 Node 層斷言。
- 賽季跑完整 84 天的長流程沒有端到端跑過（驗證器只跑到前 20 天左右）。

### 整合與部署（2026-08-11）

**fast-forward，無 merge commit**：main `99eb3ec` → **`98a439f`**（超前 2、落後 0）。
與上一輪同樣的處理：main 被 `ESMO-acceptance` worktree 佔用 ⇒ 先
`git push origin milestone-q3-competition:main` 推遠端，再由該 worktree
`merge --ff-only origin/main` 補齊本地。**主工作區 `ESMO` 全程未動**——
仍是 `7bd858c`／`milestone-n-finance`／124 dirty，hero-proxy WIP 原封不動。

| 驗證項（在整合後的 main 上） | 結果 |
|---|---|
| `check_competition_q1` / `q2a` / `q2b` / `q3` | **93 / 112 / 92 / 90**，全 exit 0 |
| `npm run build` | exit 0，`built in 21.98s` |
| Actions run 31469969268（`98a439f`） | **success** |
| <https://rayhuang0323.github.io/ESMO-/> | **HTTP 200** |
| 線上 bundle `assets/index-DkgAU4pq.js` | 200；**與本地 `98a439f` 建置 hash 逐字相同** |

### ⚠ 一個方法論教訓（本輪自己踩的）

`check_talent27` 第一次跑出 **43/44**。事後在乾淨樹上重跑，Q3 分支與 main
baseline **都是 44/44 且逐條相同**。原因是那次執行期間**我正在編輯
`profileStore.js`**，而 talent27 的 fan-out 子程序會在執行中 import 它。

**規則：verifier 執行期間不得改動它會讀到的原始碼。** 否則拿到的紅燈既不能
當回歸訊號、也不能當通過證據。⚠ 那次的失敗條目名稱沒有保留下來，所以
「成因是邊跑邊改檔」是**推論**；能證明的只有「乾淨樹下無回歸」。

### 下一輪：Q3.5（已排定，未開始）

最小 Competition UI ＋ `BattleResult.v2 → FixtureOutcome` 接線，
讓玩家真的能從賽程進場、完成比賽、回寫賽果與 Standings。
**Q4 等 Q3.5 的瀏覽器流程通過後才開始。**

---

## Milestone Q3.5（2026-08-11）— 賽事 UI ＋ 賽果回寫

Q3 的管線做完但沒有畫面，玩家到不了。本輪把那條路接通，並在**真實瀏覽器裡
從頭打完一場正式聯賽比賽**。分支 `milestone-q35-competition-ui`（基準 `98a439f`）。

### 做了什麼

| # | 項目 | 檔案 |
|---|---|---|
| 1 | `MatchResult.v1` → `FixtureOutcome` 換座標 | `competition/fixtureResultBridge.js`（新） |
| 2 | 回寫掛進既有唯一結算邊界 | `platform/profileStore.js`（改） |
| 3 | 最小聯賽畫面（賽程／積分榜／出賽／棄權） | `screens/manage/CompetitionScreen.jsx`（新） |
| 4 | 「🏆 賽事」改指向聯賽 | `src/AppShell.jsx`（改） |
| 5 | 賽季錨定 ＋ 逾時重新進場 | `competition/seasonState.js`、`competitionGateway.js`（改） |
| 6 | 驗證器 | `tools/check_competition_q35.mjs`（新，65 條） |

### 資料來源：為什麼是 MatchResult 而不是 BattleResult

```
BattleResult.v2（winner: blue/red）
  → outcomeFromBattleResult()      既有，照抄不統計
  → createMatchResult()            → **MatchResult.v1 正式成立**（winner: us/opponent）
  → fixtureResultBridge            → FixtureOutcome（winner: teamId）
```

`BattleResult` 的勝負是**戰場陣營**，要換成隊伍還得知道「玩家在哪一側」——
而那個知識 `outcomeFromBattleResult()` 已經處理過一次了。若 bridge 再讀一次
BattleResult，勝負歸屬就會有**兩個決定點**。所以 bridge 的簽名根本拿不到
BattleResult，§1k 用原始碼斷言把這件事鎖住。

取的正式欄位只有四個：`winner`（us/opponent）、`score.us` / `score.opponent`、
`durationSec`、`seed`。**一個數字都不重算。** 唯一的判斷是「玩家是主隊還是客隊」，
決定 `score.a/b` 要不要對調（§1b 用客場案例證明）。

### 掛在哪個結算點

`profileStore.reportMatchResult()` 內，**`MatchResult.v1` 正式成立且 S25 入完帳之後**：

```js
if (receipt?.ok && isFixtureSession(session)) get()._writeFixtureResultFromMatch(made.result, session);
```

選這裡的理由：再早一步賽果還沒通過來源／場次／衝突驗證；再晚一步就得另外找
呼叫點，等於第二條路。回寫失敗**不影響**上面的結算——獎勵已經發了，賽程沒更新
只是賽程沒更新，不會連獎勵一起消失。

### ⚠ 瀏覽器實測抓到三個問題（Node 驗證器全綠時都看不出來）

1. **賽季沒有錨定在建立當天。** `DEFAULT.meta.days` 是 8（沒按過「開新局」的存檔
   都是），但賽程從第 1 天排起 ⇒ 第 1–7 天的場次一建立就過期，下次推進會被
   `sweepOverdue` 直接判負，玩家連看都沒看到。修法：`startDay` 錨點 ＋
   `absoluteDayOf()`，所有跟時鐘的比對都走它。§3j–§3p 釘住。
2. **出賽導錯頁。** 原本導到 `matchmaking`——那是 Sprint11 的**純過場動畫**
   （寫死對手、假計時），完全沒有 `useMatchFlow` ⇒ 場次永遠不會簽發，賽果寫不回。
   正解是 `lineup`（`MatchPrepFrame` ＋ `useMatchFlow`）。§4c 釘住。
3. **房間確認逾時就只剩棄權。** ready check 只有 20 秒，逾時後房間 expired、
   賽程停在 `launched`，再按出賽會被 gateway 擋掉。20 秒逾時是很常見的事，
   讓它等於丟一場正是 D15 要避免的。修法：`issueFor({allowRelaunch})`——
   **只有在「那一場沒有仍然存活的場次」時**才允許重簽，賽程狀態不倒退回
   `scheduled`。§3q–§3w 釘住，包含「場次還活著時不得重簽」。

### 瀏覽器端到端驗收（本機 preview，非正式站）

從全新 Chrome profile、全程真實點擊：

| 驗收項 | 結果 |
|---|---|
| 從「🏆 賽事」進入 | ✅ 賽季自動建立（56 場），`startDay=8` |
| 看到當前賽程／對手 | ✅「第 13 天 德國海豹 主場 VS 翡翠龍騎 客場」 |
| 推進停在比賽日 | ✅ 第 8 → 13 天，自動棄權 0 場 |
| 玩家完成一場正式比賽 | ✅ 出賽 → 確認 → Ban/Pick → 戰術 → 對戰 → 戰報（DEFEAT 3:9，20:24） |
| 賽果回寫 | ✅ `completed` / `engine` / `3:9` / `dur 1225` / `seed 61797`（＝ session seed） |
| Standings 更新 | ✅ ED 1-0 +6、GSEAL 0-1 −6 |
| 棄權計入 | ✅ `0:0` / `seed 0` / `dur 0`，GSEAL 0-2 |
| AI 模擬計入 | ✅ 同一份存檔 engine 1 / simulated 6 / forfeited 1 |
| console 錯誤 | ✅ **0 個 JS 錯誤**（唯一 4xx 是 `/favicon.ico` 404，既有、與本輪無關） |

⚠ 比賽用專案自帶的 `dev-fast-forward`（`?debug=1`）推到終局——那顆按鈕本來就
「走既有 Result／發獎／Replay 流程」，不是繞過結算。截圖在 `scratchpad/q35-e2e/`。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q35`（新增） | **65/65** exit 0 |
| `q1` / `q2a` / `q2b` / `q3` | 93 / 112 / 92 / 90 |
| `finance_n/n2/n3`、O 系列六支、`recruit_o`、`progress25` | 全綠 |
| 兩支驗收包 | 81 / 97 |
| `regress` / `regress2` | 15/15、**8/8** |
| `npm run build` | exit 0 |

**突變測試**：把客場比分對調拿掉 ⇒ §1b／§2e 變紅；把「只在賽程來源回寫」的判斷
拿掉 ⇒ §5d 變紅（但行為測試 §2j 仍綠——因為還有第二道防線，票券 session 的
`fixtureIdOfSession()` 回 null。**這是縱深防禦，不是斷言失效**，如實記錄）。

### ⚠ 已知缺口（未修，留給下一輪）

- **對戰畫面顯示的對手名字是寫死的「赤焰軍團」**，不是賽程對手「翡翠龍騎」。
  賽果資料完全正確（比分／勝負／回寫都對），錯的只有戰鬥中與戰報上的**顯示名稱**。
  來源是 `platformToMobaConfig.js` 的 `oppName: input.oppName ?? "赤焰軍團"`，
  沒有人把 `assignment.opponent.name` 串進去。玩家一定看得到，優先修。
- 賽事畫面只有「下一場 ＋ 積分榜 ＋ 進度」，**沒有完整賽程表、沒有歷史賽果**（刻意）。
- 沒有在正式站驗過（本輪只在本機 preview）。

---

## Milestone Q3.5-fix（2026-08-11）— 對手名稱收斂 ＋ 兩個 UI 修正

上一節列的「已知缺口」第一項修掉了：對戰畫面不再寫死「赤焰軍團」。

### ⚠ 先更正上一節的根因判斷（重要）

上一節寫「來源是 `platformToMobaConfig.js` 的 `oppName ?? "赤焰軍團"`」——**那個判斷是錯的**。
`platformToMobaConfig` 只被 `src/EsportsGame.jsx`（Legacy）呼叫，而 `main.jsx` 掛的是
`AppShell`，`EsportsGame.jsx` 沒有任何人 import ⇒ **它根本不在玩家走的那條路上**。

真正的來源是：`GameView` 從來沒把隊名傳給呈現層，於是
`BattleHUD` / `BattleScoreboard` / `BattleEndScreen` 三個元件各自的**預設參數**
（`redName = "赤焰軍團"`）生效了。同理，`LoadingScreen` 與 `MatchmakingScreen`
直接讀 `data/roster.js` 的 `TEAMS.red.name`。
**教訓：改 UI 前先確認那個檔在不在 `main.jsx` → `AppShell` 的可達路徑上**——
這個 repo 有一整套同名的 Legacy 畫面，改錯邊會「改完沒反應」。

### 做了什麼

對手隊名**早就有正式來源**，只是沒接上，這一輪沒有新增任何資料：

```
competitionGateway.issueFor() → assignment.opponent.name
  → createSession()           → session.opponent.name
  → consumeLaunchToken()      → launch.opponentName      ← 進場時的權威值
```

新增 `src/platform/matchTeamNames.js`（唯一讀取點，兩個 selector，不含 fallback 以外的邏輯）：
`selectOpponentName` 依 `launch → session → ticket.assignment` 取值，查不到回 `null`
（**不編造名字**，由元件既有預設接手 ⇒ debug harness／單獨掛 GameView 行為不變）。
`selectTeamName` 讀 `team.name`（開新局可改名），不是 `roster.js` 的預設值。

接上的畫面（全部吃同一支 selector，**沒有第二份對應規則**）：

| 畫面 | 改法 |
|---|---|
| 正式對戰 | `GameView` 讀值 → `BattlePresentationLayer` → HUD／記分板／終局畫面 |
| Ban/Pick | 標題下加「vs 對手名」（全程可見）＋ 行動列與選角播報指名道姓 |
| Loading | 雙方隊徽下的隊名 |
| Matchmaking 過場 | 同上 |

⚠ `BattlePresentationLayer` 內把 `null → undefined` 是**必要**的：子元件用預設參數，
只有 `undefined` 會觸發預設，傳 `null` 會讓隊名變空白。

⚠ Ban/Pick 的 AI 播報在 `deps: [step]` 的 effect 裡，**不能用外層閉包的 `oppName`**
（會是舊值）⇒ 改成當場 `selectOpponentName(useProfileStore.getState())`。

### 兩個 UI 修正（輕量 usability pass，非視覺重做）

1. **棄權的二次確認會誤觸**（安全性，最重要）。舊版就地把「棄權」換成「確定棄權？」
   ——**同一個座標**，手機連點兩下就丟掉一場，而 `forfeited` 是**終局、不可逆**。
   現在確認態換成一整列：警告文字寫明後果，「取消」放回原本棄權鈕的位置
   （誤觸的第二下打在取消上），「確定棄權」移到左邊。
2. **主畫面「賽事」磚的標籤是「🌙」**，既不是狀態也不是提示。改成由既有
   `competitionView()` 導出的「🔴 今日有賽事／下一場 第 N 天／本季已完賽／進入聯賽」。
   畫面不自己判賽程規則，與 CompetitionScreen 同一個出口。

⚠ 踩到的坑：`q35 §4b` 用「`DashboardScreen.jsx` 原始檔裡的獎盃 emoji 只能出現一次」
來擋「多開一個賽事入口」。我在**註解**裡寫了一顆獎盃就被判紅。
斷言的用意是對的，改註解即可——但這類「數原始字元」的斷言會被註解誤觸，記在這裡。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q35` | **65/65** exit 0 |
| `q1` / `q2a` / `q2b` / `q3` | 93/93、112/112、92/92、90/90 |
| `regress` / `regress2` | 15/15、**8/8** |
| `npm run build` | exit 0（`built in 9.59s`） |
| 殘留寫死掃描 | live path 乾淨；剩下的都是元件預設參數、`roster.js` AI 名單、`mockGateway` 的合法對手名 |

### ⚠ 未經瀏覽器實測（本輪 session 沒有瀏覽器工具，如實記錄）

上面全部是 Node 斷言 ＋ build。**沒有任何一項在瀏覽器裡看過**。
而 Q3.5 這一輪自己的教訓就是「Node 全綠證明不了 UI 可用」，所以以下必須人工走一遍：

1. 賽事頁記下對手隊名 → Ban/Pick 標題「vs ○○」是同一個名字
2. → Loading 紅方隊名同上 → 對戰中 HUD／TAB 記分板／終局畫面同上
3. 長隊名（≥6 字）在手機寬度下不擠爆 Ban/Pick 標題列與 HUD
4. 棄權：點「棄權」→ 出現警告列 →「取消」回得去；再點一次 →「確定棄權」才真的棄權
5. 主畫面「賽事」磚的標籤文字與賽事頁的「今日／下一場」一致
6. 沒有場次時單獨進對戰（`?debug=moba-runtime-battle`）仍顯示預設隊名、不空白

### 沒做（刻意留下）

- `useBattleFeed.js:46` 呼叫 `snapshotToBattleResult` 時**沒有傳 `meta.teamName/oppName`**
  ⇒ `BattleResult.ctName` 仍是預設的「赤焰軍團」。那是**結算邊界**上的資料欄位，
  本輪守住「不改 Battle gameplay／不碰結算」的界線沒動。玩家在 AppShell 流程裡
  看不到它（MOBA 戰報頁 `MobaMatchReport` 只有 Legacy 用），但它會進賽季統計與
  `analytics`。要修就是在那一行補 meta，**下一輪一併處理**。
- 賽事頁仍然只有「下一場 ＋ 積分榜 ＋ 進度」：沒有完整賽程表、沒有歷史賽果、
  沒有對手戰績。刻意留給後續。
- 「不是比賽日」時畫面只寫「推進天數到第 N 天」，**沒有給按鈕**，玩家得自己退回主畫面。
- 主畫面三顆模式磚的「👁 2041 / 0 / 0」是 Sprint 早期的假資料，賽事磚顯示 `👁 0`
  看起來像「沒東西」。要處理就是整排一起處理，不單改一顆。

## Milestone Q3.5-close（2026-08-12）— 瀏覽器實測驗收 ＋ 三個接線修正

上一節（Q3.5-fix）留下的「六項全部未經瀏覽器實測」補完了。
**六項全部通過**，過程中抓到 **兩個 Node 斷言證明不了的真 bug**，都已修並重測。

### 怎麼測的（環境，供下次重現）

- 本機 `npm run dev`（`http://localhost:5173/ESMO-/`），Claude in Chrome 驅動。
- 用既有的 localhost 存檔（德國海豹 Lv.93）走完整流程：
  訓練中心推進天數 → 賽事頁 → 出賽 → 房間確認 → Ban/Pick → 戰術 → Loading →
  對戰 → 快速完成 → 終局 → 賽後結算 → 回主畫面 → 積分榜回寫。
  **實際打完三場**（vs 烈焰鳳凰 / 暗影狼群 / 翡翠龍騎）＋ **真的棄權一場**（vs 白銀之鷹）。
- 第 6 項需要「完全沒有場次」的乾淨狀態。**不清 localStorage**（那是破壞性動作），
  改成 `npx vite --port 5199` 另開一個 **port ＝另一個 origin ＝ 全新存檔**，
  在該 origin 上跑 `?debug=moba-runtime-battle`。這招之後要測「新玩家第一次進場」都能用。

### 六項驗收結果

| # | 項目 | 結果與證據 |
|---|---|---|
| 1 | 賽事頁對手名 = Ban/Pick 對手名 | ✅ 三場皆同名；Ban/Pick 標題「vs ○○」、AI 播報「🔴 ○○ 禁用 炎拳」都指名道姓 |
| 2 | Loading／HUD／TAB 記分板／終局一致 | ⚠️→✅ **終局橫幅原本寫「赤焰軍團 獲勝」**（見下方根因）。修後重測為「暗影狼群 獲勝」「翡翠龍騎 獲勝」，全頁掃不到「赤焰軍團」 |
| 3 | 長隊名在手機寬度不擠爆 | ✅ 390px 下量測：Ban/Pick 標題與 HUD 隊名皆 `white-space:nowrap` ＋ `text-overflow:ellipsis`；塞 8–11 字名稱後 `scrollWidth == clientWidth`、容器 `scrollWidth == 390`（不外溢）、兩隊名區間不重疊 |
| 4 | 棄權 / 取消 / 真棄權 | ✅ 確認態「取消」落在原棄權鈕座標（誤觸的第二下打在取消上）；取消後戰績不變；確定棄權後 我方 0-2→0-3、對手 0-2→1-2、場次 2/14→3/14、畫面切回「下一場賽事」 |
| 5 | 主畫面標籤 = 賽事頁 | ✅ 三種狀態都對上：`進入聯賽`（尚無賽季）／`下一場 第 N 天`／`🔴 今日有賽事` |
| 6 | debug battle 單獨進場 | ✅ 全新 origin、`localStorage` 0 筆 ⇒ HUD 顯示「德國海豹／赤焰軍團」，終局橫幅同樣退回預設，**不空白** |

### Bug 1：終局橫幅寫死「赤焰軍團」（第 2 項）

`BattleEndScreen.jsx:148` 顯示的是 **`result.teams[win].name`**——不是 HUD 那組
`blueName/redName` props。所以 Q3.5-fix 只接了 props，同一個畫面就會
HUD 寫「烈焰鳳凰」、正中央橫幅寫「赤焰軍團」。

**根因就是上一節「沒做（刻意留下）」的第一條**：`useBattleFeed` 呼叫
`snapshotToBattleResult` 時沒給隊名。上一節判斷「玩家在 AppShell 流程裡看不到」——
**那個判斷是錯的，玩家每一場結束都會看到**。

修法（`src/battle/useBattleFeed.js`）：終局那一次呼叫補 `teams`，值取自
`platform/matchTeamNames.js` 的同一組 selector。

- ⚠ **只覆蓋 `name`**：`id`／`tag` 等識別欄位仍是 `roster.js` 的，結算與統計規則完全不動。
- ⚠ 查不到（debug harness、單獨掛 GameView）⇒ **不覆蓋** ⇒ 退回既有預設（第 6 項就是在驗這條）。
- `SeasonScreen` / `platform/DashboardScreen` 也是讀 `r.teams[winner].name`，
  **理論上一併修對**（同一份資料），但**這兩處沒有在瀏覽器裡驗過**——
  `platform/DashboardScreen` 不在 live path（主畫面走 `src/screens/DashboardScreen.jsx`，
  儀表板目前仍是 Legacy 佔位頁），`SeasonScreen` 本輪沒走到。如實記錄。

### Bug 2：賽前房間的「對手」欄整段確認階段都是「—」（第 1 項的同一條鏈）

一般配對顯示得出對手名，**賽事出賽卻是「—」**。根因不是顯示層：

```
profileStore.launchFixtureMatch()  →  ticket: null      ← 賽程路徑沒有票券
                                      fixtureAssignment: issued.assignment   ← 指派單在這
```

而 Q3.5-fix 的「唯一讀取點」只列到 `ticket.assignment`，
`useMatchFlow.js` 又**自己再讀一次** `view.ticket?.assignment?.opponent?.name`
（第二份對應規則）。兩邊都拿不到 ⇒「—」。

修法：
1. `platform/matchTeamNames.js`：`selectOpponentName` 補上第 ④ 順位
   `fixtureAssignment.opponent.name`。③④ 是**同一階段的兩種簽發者**
   （mockGateway／competitionGateway），不是兩份真相。
2. `screens/common/useMatchFlow.js`：刪掉自己那份規則，改吃同一個 selector
   （回傳仍是原始值 字串／null，符合本檔「只訂閱原始值」的紀律）。

實測：「—」→「翡翠龍騎」，從房間確認階段就有名字。

### 驗證

| 項目 | 結果 |
|---|---|
| `q1` / `q2a` / `q2b` / `q3` / `q35` | 93/93、112/112、92/92、90/90、**65/65** |
| `check_matchmaking_o4` / `check_matchmaking_flow_acceptance` | 47/47、**97/97** |
| `check_flow09` / `check_dash10` | exit 0 |
| `regress` / `regress2` | 15/15、**8/8** |
| `verify.mjs --only=runtime29,progress25` | **2/2 PASS**（runtime29 89s） |
| `npm run build` | exit 0（`built in 9.91s`） |
| 瀏覽器 console | 0 個新錯誤 |

### 沒做（本輪刻意不碰，全部登記在 `08_目前待辦與風險.md`）

- **房間確認逾時後按「重新配對」會離開原 fixture**：實測逾時後重新配對，
  配到的是隨機對手（「翠光學院」），而聯賽那一場仍掛著沒打。
  這是**流程設計問題**（重新配對該不該重簽同一場賽程），不是名字問題，不在本輪 6 項內。
- **進行中的聯賽對戰沒有直接返回入口**：賽事頁只寫「你有一場進行中的對戰，請直接返回那一場」，
  但那一頁**沒有按鈕**，玩家得自己走主畫面 → MOBA 磚 → 賽前配置 →「返回進行中的對戰」。
- **終局畫面在低視窗高度版面破**：視窗內高 495px 時，終局覆蓋層 `justify-content:center`
  把橫幅推到畫面上方外面，且捲不回去。**既有版面問題，非本輪改動造成**，本輪沒動。
- `BattleEndScreen` 既有的 React `unique "key" prop` 警告（dev-only，非本輪造成）。
- 上一節列的其餘待辦（非比賽日沒有推進按鈕、👁 假資料、賽事頁美術）原樣保留。

### ⚠ 這一輪學到的：「刻意留下」要先確認玩家真的看不到

上一節把 `useBattleFeed` 沒傳隊名這件事判成「玩家在 AppShell 流程裡看不到」，
所以延後。**一進瀏覽器，它就是每一場結束時畫面正中央最大的那行字。**
延後一個缺口之前，先把玩家會走到的畫面實際點過一遍再說「看不到」。

## Milestone Q3.6（2026-08-12）— 賽事流程安全性 hotfix（兩件事）

Q3.5-close 登記的兩個**流程**風險，這一輪修掉。範圍刻意壓到最小：
不碰 Battle gameplay、不碰結算、不新增第二條賽事流程。

### 修正 1：房間逾時後，不得從「重新配對」離開原賽程

實測踩到的路徑：聯賽出賽 → 房間確認倒數走完 → 主按鈕變「重新配對」→ 按下去
**走的是一般配對**，配到隨機對手（實測「翠光學院」），而那一場聯賽仍掛著沒打。

根因是「重新配對」對賽程一無所知：`requeueMatch()` 直接把整個 `matchmaking`
換掉——**連 `fixtureAssignment` 一起丟掉** ⇒ 賽程身分就此消失。

修法（**優先「重新建立同一 fixture 的進場流程」**，不是把入口拿掉）：

| 位置 | 改動 |
|---|---|
| `profileStore.matchFixtureContext()`（新增） | 「這條流程綁在哪一場賽程」的**唯一判定點**。只認 `fixtureAssignment.origin.fixtureId` |
| `profileStore.requeueMatch()` | 賽程區間內**直接拒絕**（回中文原因），一般配對進不來 |
| `matchPrepAction.primaryActionFor()` | 賽程區間內，兩個「終局 → 退路」分支改給 `refixture`＝「重新進入本場賽事」 |
| `matchPrepAction.flowStatusText()` | 逾時訊息改寫成「這是聯賽賽程，可以重新進入本場，**對手不會換**」 |
| `useMatchFlow` | `refixture` → 呼叫**出賽用的同一支** `startFixtureMatch(fixtureId)` |
| `MatchQueuePanel` | 失敗原因與狀態色改吃 `RETRY_ACTION_KEYS`，不再各自列舉字串 |

⚠ **為什麼 `matchFixtureContext` 只看 `fixtureAssignment`、不看 `room.origin.kind`**：
房間在賽程打完之後仍然是 fixture 來源，拿它判定會讓**已完賽**的場次也被當成
「還能重新進入」。`fixtureAssignment` 則正好在 `completeFixtureMatch()` /
`forfeitFixture()` 被清掉 ⇒ 它活著＝這場賽程還沒走到終局，正是要保護的區間。

⚠ 沒有新流程：`startFixtureMatch()` 本來就有 `allowRelaunch`
（Q3.5 為「逾時後重新進場」加的），對手與 seed 都由同一場賽程決定
⇒ **不可能換到隨機對手**。

### 修正 2：賽事頁給得出「返回比賽」

舊行為：賽事頁只寫「你有一場進行中的對戰，請直接返回那一場」，**卻沒有按鈕**，
玩家得繞 主畫面 → MOBA 磚 → 賽前配置 →「返回進行中的對戰」。

修法：
- `competitionView()` 新增 `live`：有沒有一場**還沒終局的賽程場次**（`{fixtureId, state}`）。
  ⚠ 只回報**事實**，不判斷「能不能 resume」——那是 `resumeMatchSession()` 的職責。
- `CompetitionScreen`：`live` 存在時，原本那顆「⚔️ 出賽」就地變成「⚔️ 返回比賽」
  （**同一顆按鈕、同一個位置**，玩家的主要動作永遠在同一格），呼叫既有的
  `resumeMatchSession()`。
- `AppShell`：新增 `onResume={go("matchmaking")}`——與賽前頁那顆「返回進行中的對戰」
  **同一個目的地**。⚠ `onPlay` 仍必須是 `lineup`，兩者不可對調（q35 §4c 在守這條）。

### 瀏覽器實測（本機 dev server，第 32／38 天兩場賽程）

| 驗收項 | 結果 |
|---|---|
| 逾時後不會配到隨機對手 | ✅ 主按鈕變「重新進入本場賽事」，狀態文字寫明對手不會換 |
| 原 fixture 身分與對手不變 | ✅ 重進後仍是「黑曜劍士」，場次計數維持 4/14（打完才變 5/14） |
| 進行中的 fixture 從賽事頁直接返回 | ✅「⚔️ 返回比賽」→ 直達過場（對手已確認）→ Ban/Pick |
| resume 不回歸 | ✅ 賽前頁「返回進行中的對戰」仍在 |
| completed 不回歸 | ✅ 打完寫回 5/14、實際對戰 4；賽前頁**退回一般「重新配對」**且按得動 |
| forfeited 不回歸 | ✅ 棄權後 6/14、棄權 2；賽前頁同樣退回一般「重新配對」 |
| 瀏覽器 console | 0 錯誤 |

⚠ 實測中途視窗被最小化，Chrome 暫停 rAF ⇒ 對戰時鐘卡住。**這不是 bug**，
但下次跑對戰實測要記得：讀 DOM 可以在背景，**跑模擬一定要視窗在前景**。

### 驗證

| 項目 | 結果 |
|---|---|
| `q1` / `q2a` / `q2b` / `q3` / `q35` | 93/93、112/112、92/92、90/90、**65/65** |
| `check_matchmaking_o4` / `check_matchmaking_flow_acceptance` | 47/47、**97/97** |
| `check_flow09` / `check_dash10` | exit 0 |
| `regress` / `regress2` | 15/15、**8/8** |
| `npm run build` | exit 0（`built in 17.21s`） |

### 沒做（刻意）

- 賽程場次逾時後**要不要乾脆不給退路**（直接判棄權或只能等下一天）——那是規則決策，
  不是 hotfix 該定的。目前給的是最保守的一種：重進同一場，什麼都不變。
- `requeueMatch()` 會連 `lastResult` / `settlements` 一起丟掉（它整個換掉 `matchmaking`）。
  本輪沒動——那是既有行為，且已被上面的守門擋在賽程區間外。列入風險。
- 賽事頁的 `live` 若對應到**不是今天焦點**的那一場，畫面仍然只顯示焦點場次的資訊
  （按鈕會把玩家帶回真正進行中的那一場）。實務上兩者一致（推進會停在比賽日），
  沒有做額外提示。

## Q3.5 ＋ Q3.6 部署紀錄（2026-08-12）

### 整合

`origin/main` 在整段開發期間**沒有前進**（`0 behind / 5 ahead`）
⇒ 整合是純 fast-forward，**沒有 merge commit、沒有衝突**：

```
078707e  (舊 main)
  → e4c194d Milestone Q3.5
  → a6dd33a Handoff: record Q3.5
  → 1443dbc Q3.5-fix
  → 824b47a Q3.5 closure
  → 8bcdf46 Q3.6 flow safety      ← main 現在在這
```

快轉是在 **`ESMO-acceptance` 工作區**（main，乾淨）做的。
主工作區 `D:\OneDrive\文件\GitHub\ESMO`（`milestone-n-finance`，帶 hero-proxy WIP
與一堆未追蹤檔）**全程沒有碰**。

### 整合後重跑（全綠）

`q1 93/93`、`q2a 112/112`、`q2b 92/92`、`q3 90/90`、`q35 65/65`、
`matchmaking_o4 47/47`、`matchmaking_flow_acceptance 97/97`、
`regress 15/15`、`regress2 8/8`、`npm run build` exit 0（`built in 12.85s`）。

### 部署與線上版本驗證

Actions run **31526750948**（`8bcdf46`）：build ✅ 28s／deploy ✅ 10s。

線上版本怎麼確認「真的是最新」——**不要只看 Actions 綠燈**：

1. `curl` 正式站 → HTTP **200**
2. 從線上 `index.html` 取 entry bundle 名稱 → `assets/index-B-7q98CP.js`
   （**與本機 build 的檔名雜湊相同**）
3. 下載線上 bundle 與本機 `dist/` 的同一支做 `cmp` → **byte-identical**
4. 在線上 bundle 內搜 Q3.6 的字串（`重新進入本場賽事`／`返回比賽`／逾時提示）→ 全部命中
   （`selectOpponentName` 這種**函式名搜不到是正常的**，minify 會改名；
   要驗就搜**使用者看得到的字串**）

### 正式站 smoke test ＋ 存檔保護

在正式站實測：出賽 → 對手名一路一致到終局（「DEFEAT · 翡翠龍騎 獲勝」）、
故意逾時只給「重新進入本場賽事」且對手不變、進行中場次「返回比賽」可直達、
賽果回寫 1/14。細節見 `08_目前待辦與風險.md` 最上方那一節。

⚠ 這是**跑在 Ray 的真實存檔上**。做法（以後照抄）：
測前把 `localStorage` 全部 key 複製到 `__prodbak.*`（並逐一比對），
測後寫回、刪備份鍵、清 `esmo_debug`，重載確認回到測試前的狀態。
**不要用「清掉 localStorage」來製造乾淨環境**——要乾淨環境就換一個 port／origin。

### 兩個實測環境教訓

- **Chrome 視窗最小化 ⇒ rAF 暫停 ⇒ 對戰時鐘不動**。讀 DOM／點按鈕在背景沒問題，
  跑對戰一定要前景。背景時仍以約 5 倍速前進（setInterval 節流），但等不完。
- **正式站沒有「⏩ 快速完成比賽」不是缺陷**：閘門是
  `isDebugMode() && featureEnabled("devFastForward")`，加 `?debug=1` 就會出現
  （已在正式站實測）。**不需要為了測試另外加按鈕**；真正的待辦是對外上線前
  把 `featureFlags.devFastForward` 改成 `false`。

## Milestone Q4（2026-08-12）— 最終名次 ＋ 名次獎金 ＋ 賽季封存

依 `docs/design/賽季與賽事系統架構.md` §10 的 Q4 定義實作。
判準：**賽季結束產生不可變最終名次；名次獎金入帳且冪等（重複結算不重複發錢）。**

### 範圍（先講不做什麼）

**不含跨賽季換季。** 設計文件 §10 的 Q4 只列 FinalStandings ＋ settleCompetitionAward
＋ 賽季封存；換季會動到 `meta.season`、選手老化、贊助合約等其他系統，
與 Ray 確認後**另開一輪**。本輪封存完就停在那裡，不會自動開下一季。

### 新增三個檔

| 檔案 | 職責 |
|---|---|
| `contracts/finalStandings.js` | `FinalStandings.v1`：把推導出來的名次凍結成不可變快照 |
| `economy/competitionAward.js` | 名次獎金（錢的**第三個**入口，`cat: "award"`） |
| `tools/check_competition_q4.mjs` | 驗證器 **68 條** |

### 為什麼快照要自帶 tiebreaker 順序

只存名次不存判定依據，等於把「為什麼是這個名次」丟掉。日後 `standings.js` 的
`TIEBREAKERS` 改版，舊賽季仍要能說明自己當時是怎麼排的（§7／D11）。
⚠ 這**不是第二份排序規則**——契約本身不排序（驗證器 §5c 用行為驗：
輸入什麼順序、輸出就是什麼順序），排序永遠只有 `standings.js` 一套。

### 封存條件是「每場都收尾」，不是「第 84 天到了」

賽程日與 `meta.days` 之間隔著 `startDay` 錨點（Q3.5 修的那件事）。
拿天數判會在舊存檔上判錯；而「場次全部收尾」才是賽季結束的定義，與時鐘怎麼走無關。
實測就看得到差別：封存發生在**第 86 天**（賽季錨在第 8 天開始）。

### 封存與發獎**分開**

`seasonState.applySealSeason()` 只產生名次，**完全不碰錢**（驗證器 §4c 掃原始碼守這條）。
錢在 `economy/competitionAward.js`。理由：設計文件 §3 紅線 3 說錢只有三個入口，
賽季狀態要是自己加錢，那就是第四個。

### 冪等怎麼做的

- 冪等鍵 = `FinalStandings.id`（由 `competition.id` 推導）⇒ **同一個賽事只發一次**。
- 帳本 `processedCompetitionAwards` 放 **profileStore 頂層**，
  **刻意不放進 `matchmaking`**——2026-08-12 的 audit 已經查證過
  `requeueMatch()` 會把那一包整個換掉。這是那次查證直接影響到的設計決定。
- 觸發點有三個（推進天數／玩家打完／棄權），因為「最後一場」可能由這三者任一造成。
  重複呼叫由封存與獎金各自的帳本擋住。

### ⚠ 本輪修改了兩條**既有** verifier 斷言（少見，單獨講）

Q3 `6h`「**沒有** FinalStandings／獎金（那是 Q4）」與 Q3.5 `5f`「**沒有** Q4 的東西」
是當時的防越界守衛。Q4 一實作它們必然紅。**沒有刪掉**，改成守真正的邊界：

| 斷言 | 原本 | 現在 |
|---|---|---|
| `q3 6h` | seasonState/gateway 不得出現 FinalStandings/award | 賽季狀態可封存名次但**不碰錢**；gateway 兩者都不碰 |
| `q35 5f` | bridge/screen/store 不得出現 | 回寫與畫面不碰名次獎金；Store **只委派**、不自己算金額 |

兩處都在原地留了「原本是什麼、為什麼改」的註解。

### 最小 UI

`CompetitionScreen` 在賽季封存後多一塊「最終名次 FINAL STANDINGS」：
你的最終名次／冠軍／名次獎金／來源分佈與封存日；積分榜標題同時變成「最終積分榜」。
畫面**不判斷賽季結不結束、不算名次也不算獎金**——`final` 與 `award` 都是 Store 給的。
沒有獎金的名次顯示「無（前四名才有）」，**不寫 $0 假裝有發**。

### 獎金表（保守，理由要記著）

`economyConfig.COMPETITION_PRIZE`：冠 80 / 亞 45 / 季 25 / 四 12（萬），第五名以後無。
冠軍約等於**兩週**的六人薪資。R8 記錄了「費率仍是第一版基準」，
這時候放一筆會翻盤的獎金，等於在還沒校正的天平上再加砝碼。
要讓名次獎金變成主要收入，應該是**校正費率之後**的產品決策。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q4` | **68/68** exit 0 |
| `q1` / `q2a` / `q2b` / `q3` / `q35` | 93/93、112/112、92/92、90/90、65/65 |
| `matchmaking_o4` / `matchmaking_flow_acceptance` | 47/47、97/97 |
| `progress25` / `flow09` / `dash10` | exit 0 |
| `regress` / `regress2` | 15/15、8/8 |
| `npm run build` | exit 0（`built in 18.30s`） |

真的驗到錢的是 §7（冠軍情境）：`1200000 → 1200080`，重複結算五次資金不動、
交易帳本仍只有一筆；第 4 名 +12、第 5 名 0 且**不記帳**。
§4a 驗了 award **不被四週現金預測外推**——因為 `forecast` 嚴格比對 `cat === "prize"`，
用 `cat: "award"` 就天然被排除，**不必在 forecast 那邊加排除邏輯**（少一個會忘記維護的地方）。

### 瀏覽器實測（本機 dev server，走完整季）

用真實 UI 從第 38 天把整季跑完（賽事頁棄權 ＋ 訓練中心推進，約 50 次互動）：

- 最後一場收尾的當下**自動封存**，賽事頁出現「最終名次 FINAL STANDINGS」
- 顯示：你的最終名次 **8 / 8 隊**、冠軍 **烈焰鳳凰**、名次獎金「無（前四名才有）」、
  「本季 56 場：實際對戰 4 · 模擬 42 · 棄權 10 · 第 86 天封存」
- 離開再進、**重新整理**後名次與資金都不變（冪等）
- console 0 錯誤

⚠ **瀏覽器只驗到「沒有獎金」那一半**（這個存檔一路棄權，拿第 8 名）。
**錢真的入帳那條路徑只有 Node 驗證器 §7 驗過**，如實記錄。

### 沒做（刻意）

- 跨賽季換季（見上方「範圍」）。
- 名次獎金只發**玩家隊**：AI 隊沒有 `funds`，也沒有任何系統會消費它們的錢。
  要發給 AI 得先有 AI 的經營狀態，那不在 MVP（設計文件 §9）。
- 賽季歷史封存清單（多個賽季的 FinalStandings 一起看）——換季做完才有意義。

## Q4 部署紀錄（2026-08-12）

### 整合

`origin/main` 全程沒有前進（`0 behind / 2 ahead`）⇒ 純 fast-forward、無 merge commit：

```
9b2147d  (舊 main)
  → 52b5b10 Handoff: requeue 結算查證
  → 28e5005 Milestone Q4       ← main 現在在這
```

在 `ESMO-acceptance` 工作區（main，乾淨）快轉。主工作區
`D:\OneDrive\文件\GitHub\ESMO`（`milestone-n-finance` ＋ hero-proxy WIP）與其他
六個工作區**全程沒有碰**。

### 整合後重跑（全綠）

`q1 93/93`、`q2a 112/112`、`q2b 92/92`、`q3 90/90`、`q35 65/65`、**`q4 68/68`**、
`matchmaking_o4 47/47`、`matchmaking_flow_acceptance 97/97`、
`regress 15/15`、`regress2 8/8`、`npm run build` exit 0（`built in 11.62s`）。

### 部署與線上版本驗證

Actions run **31535506168**（`28e5005`）：build ✅ / deploy ✅。

線上版本確認（沿用 Q3.5/Q3.6 那套四層，不只看 Actions 綠燈）：
HTTP 200 → 線上 entry bundle `assets/index-B8RqIleJ.js` 與本機 build 同名 →
下載後 `cmp` **byte-identical** → 線上 bundle 內含 Q4 的畫面字串
（`最終名次 FINAL STANDINGS`／`已封存`／`名次獎金`／`無（前四名才有）`／`最終積分榜`）。

### 正式站 smoke test

**在正式站實際跑完一整季**（賽事頁棄權 ＋ 訓練中心推進，第 12 天 → 第 95 天）：
最後一場收尾當下自動封存，Final Standings 區塊出現（最終名次 8/8、冠軍 暗影狼群、
名次獎金「無（前四名才有）」、本季 56 場：實際對戰 0 · 模擬 42 · 棄權 14 · 第 95 天封存），
重新整理後一字不差，console 0 錯誤。測後把 Ray 的存檔從 `__q4bak.*` 完整還原。

⚠ **兩次瀏覽器實測（本機、正式站）都是一路棄權拿第 8 名**
⇒ 只驗到「沒有獎金」那一半；錢真的入帳仍然只有 Node 驗證器 §7 驗過。

### 這次學到的：背景分頁會讓「跑完整季」慢到不可行

Chrome 把背景分頁的計時器節流到約 1 秒，整季 50 次互動的腳本因此每次呼叫都撞到
CDP 的 45 秒上限。分頁點到前景後同一段腳本速度差了三倍以上。
**要在瀏覽器跑長流程（整季、長對戰），先確認分頁在前景。**

## Q4 補驗（2026-08-12）— 前四名獎金實際入帳，瀏覽器實測

Q4 部署後唯一還掛著的缺口：**兩次瀏覽器實測都是一路棄權拿第 8 名**，
所以「有獎金」那條路徑只有 Node 驗證器 §7 驗過。這一輪把它補完。
**只做驗證，沒有改任何程式。**

### 怎麼造出「前四名」而不動到任何既有存檔

三件事讓這次不必碰 Ray 的存檔，也不必真的打 14 場：

1. **獨立 origin**：`npx vite --port 5199` ⇒ 另一個 origin ⇒ 全新 profile。
   `localhost:5173` 與正式站的存檔**完全沒有被讀寫**（不是備份還原，是根本沒碰）。
2. **拿到 store 實例不必改程式**：dev server 直接供應原始模組，
   頁面裡 `await import('/ESMO-/src/platform/profileStore.js')` 拿到的
   **就是 UI 正在用的同一個 store 單例**。不需要 `window` 曝露、不需要 debug hook。
3. **控制名次**：對每一場玩家賽程呼叫既有的
   `startFixtureMatch()` → `completeFixtureMatch({winner: 我方})`，14 場全勝。
   ⚠ 這是**測試夾具**，不是產品路徑——它跳過的是「比賽怎麼打」，
   而本輪要驗的是「名次獎金怎麼結算」，兩者不重疊。

### 八項驗收結果

| # | 項目 | 結果 |
|---|---|---|
| 1 | 獨立存檔完成一季、控制取得前四名 | ✅ 14 勝 0 敗、42 分、淨勝 +98 ⇒ **第 1 名** |
| 2 | FinalStandings 名次正確 | ✅ `rank 1`；榜首三名 德國海豹 14-0 42 ／ 暗影狼群 11-3 33 ／ 烈焰鳳凰 9-5 27 |
| 3 | 畫面顯示對應獎金 | ✅ 賽事頁「💰 名次獎金 **+$80萬**」（`prizeForRank(1) = 80`） |
| 4 | `finance.funds` 實際增加正確金額 | ✅ 收據 `fundsBefore 433000 → fundsAfter 433080`，且 `funds === receipt.fundsAfter` |
| 5 | 帳本有一筆 `cat: "award"` | ✅ `id: award-final:comp:moba:s1:official:regular`、`type: income`、`amount: 80`、`label: 第 1 賽季 常規賽 第 1 名 名次獎金` |
| 6 | reload 後三者不變 | ✅ 資金、FinalStandings、award 收據、award 交易筆數全部一字不差 |
| 7 | 重複觸發不得再發 | ✅ 連呼叫 `_sealSeasonIfFinished()` **10 次**，資金 `279080 → 279080`、award 交易仍 1 筆、帳本仍 1 筆；純函式層再打一次回 `nextState: null` + `alreadySettled: true` |
| 8 | 還原原本存檔 | ✅ 測試 origin 的存檔測完清空；`5173` 與正式站**全程未觸碰** |

console 0 錯誤。

### ⚠ 一個差點誤判的地方（記下來）

第 7 項第一次測時，我在重複觸發之間順手呼叫了 `advanceDay(7)` 兩次，
資金從 `433080` 掉到 `279080` ——那是**週結算扣薪資**，不是獎金重發。
隔離重測（完全不推進天數）才得到乾淨的 `279080 → 279080`。
**驗冪等時不要在中間夾任何會動到同一個欄位的既有機制**，否則證據會自己打架。

### 結論

Q4 的「名次獎金入帳且冪等」**現在是完整的瀏覽器實測**，不再只有 Node 斷言。
無獎金分支（第 5–8 名）先前已在本機與正式站各驗過一次，兩半都齊了。

## Milestone Q5（2026-08-12）— 跨賽季換季

讓已封存的 S1 安全進入 S2，並能持續 S2 → S3 → S4。
**只換容器**：舊季封存保留、新季全新賽程、standings/outcomes 歸零，
選手／資金／成長／贊助**完全不動**。

### 動手前的 audit（六項事實，直接改變了這一輪的範圍）

1. **`meta.season` 是由 `meta.days` 導出的**（`deriveTime`：12 週 × 7 天）。
   **它不是可以 +1 的欄位**——第 85 天自動變 S2。
   ⇒ 規格需求「meta.season 正確 +1」現況**本來就成立**，Q5 是**驗證**它，不是實作它。
2. **`seedForSeason(seasonSeed, 季號)` 已經存在**且 `buildRegularSeason` 已在用
   ⇒「決定性派生新賽季 seed」幾乎免費。
3. **`agePlayerOneSeason` 主幹沒有**（只有 `aiTeams.js` 一句「Legacy 有可參考」的註解）。
   選手老化＝全新系統 ⇒ 與 Ray 確認後**排除在 Q5 之外**。
4. **贊助合約是「週」制**（`weeksLeft` 由週結算倒數），**沒有賽季概念** ⇒ 換季不必碰。
5. **真正的缺口在 `ensureCompetitionSeason()`**：它只在 `competition` 為 null 時建立，
   封存後永遠回傳那個已封存的賽季 ⇒ **今天沒有任何路徑會建立 S2**。
6. **`state.final` 住在 `competition` 裡**：S2 若直接取代它，S1 的最終名次就沒了
   ⇒ 需要頂層的歷史封存區。

### 兩個邊界決策（與 Ray 確認）

| 決策 | 選擇 | 理由 |
|---|---|---|
| 賽季編號與時間軸的關係 | **只留一個賽季概念** | 賽事賽季成為全案唯一顯示的「賽季」；`meta.season` 降級為經濟層內部週期、畫面不再顯示 |
| 換季副作用（老化／續約） | **都不做，只換容器** | 主幹沒有老化系統，硬做會在 Q5 裡新建一個養成系統 |

⚠ 「只留一個賽季概念」落成**顯示層單一化**：`meta.season` 的**儲存與導出邏輯完全沒動**
（既有 `check_finance_n / n3 / q1 / q2a / q3` 對它的斷言因此全部不受影響），
只是 Dashboard 與 Finance 的週期標籤拿掉了 `S{n}`。

### 做了什麼

| 檔案 | 改動 |
|---|---|
| `competition/seasonState.js` | 新增 `canRollSeason()` / `rollToNextSeason()` / `seasonDayOf()` |
| `profileStore.js` | 新增頂層 `competitionHistory[]`（＋migration／新局重置）、`rollToNextCompetitionSeason()`、`competitionView()` 增 `seasonDay`／`seasonDays`／`history`／`canRoll` |
| `CompetitionScreen.jsx` | 副標改用賽季相對天數、「▶ 開始第 N 賽季」按鈕、「歷屆成績 HISTORY」面板 |
| `DashboardScreen.jsx`／`FinanceScreen.jsx` | 週期標籤拿掉 `S{n}` |

### 「第 95 / 84 天」的根因與修法（規格需求 8）

賽事錨在**建立當天**（`startDay`，Q3.5 為了避免第 1–7 天場次一建立就被判負而加的），
所以 S1 在第 8–12 天建立、第 91–95 天才打完，而畫面拿**絕對遊戲日**去對 84。
修法：`seasonDayOf()` 回傳**賽季第幾天**（夾在 84），畫面只顯示它。
⚠ 封存日仍顯示**絕對遊戲日**（「第 91 天封存」）——那是事實，不該被夾。

### 換季為什麼**不自動**

封存與發獎是自動的（漏發獎勵是災難），換季**刻意要玩家自己按**：
換季會把「最終名次」那一頁換成新賽季的空賽程，自動換等於玩家還沒看到成績就被收走。
與 Q3「棄權必須玩家自己按」同一個判斷：**不可逆且會改變畫面的事，讓玩家決定時機。**

### 冪等怎麼做的（規格需求 9）

三道，任何一道成立就不會有第二個新賽季：
① 沒有 `final` ⇒ 直接拒絕（換季後新賽季沒有 `final`，**連按的第二下必然落在這道**）；
② 歷史已有同一個 `final.id` ⇒ 不重複封存進歷史；
③ 新賽季 id 由季號與 `seasonSeed` 決定性推導 ⇒ 真跑兩次也是同一份賽程。

### ⚠ 又改了一條既有斷言

Q4 `5f`「**沒有換季**（Q4 不含跨賽季）」掃描範圍含 `seasonState.js`，Q5 實作後必然紅。
沒有刪除，改成守真正的邊界：**名次獎金與最終名次契約不碰換季**
（換季不發錢、發錢不換季），並在原地註明原本是什麼。
這是連續第三次動到既有斷言（Q4 動了兩條、Q5 動了一條），模式很清楚：
**「下一個 Milestone 還不該存在」這種防護斷言，在那個 Milestone 實作時一定要改寫成真正的邊界。**

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q5` | **66/66** exit 0 |
| `q1`／`q2a`／`q2b`／`q3`／`q35`／`q4` | 93／112／92／90／65／68 全通過 |
| `check_finance_n`／`n2`／`n3` | 32/32、35/35、40/40（`meta.season` 斷言未受影響） |
| `matchmaking_o4`／`matchmaking_flow_acceptance` | 47/47、97/97 |
| `regress`／`regress2` | 15/15、8/8 |
| `npm run build` | exit 0（`built in 14.53s`） |

決定性：§2R 用同一顆 `seasonSeed` 與 `team.id` 重跑一次，
**S1／S2／S3 的種子與 56 場賽程逐場相同**。

### 瀏覽器實測（獨立 origin `localhost:5199`，全新 profile）

- S1 打完封存 → 副標顯示 **「S1 · 第 84 / 84 天」**（修好了，原本會是第 91/84）
- 「▶ 開始第 2 賽季」→ **S2 · 第 1 / 84 天**、積分榜全 0-0、歷屆成績出現 S1
- 再打完 S2 → 換到 **S3**，歷屆成績累積到兩季
- 冪等：S3 未打完時連按 5 次全部被拒，季號停在 3
- reload：季號／歷史／賽程／資金全部一字不差，**沒有憑空多一季**
- console 0 錯誤；測完清空該 origin 的存檔

⚠ 本輪瀏覽器實測**沒有碰 `5173` 與正式站的存檔**（不是備份還原，是根本沒讀寫）。

## Q5 部署紀錄（2026-08-12）

### 整合

`origin/main` 全程沒有前進（`0 behind / 1 ahead`）⇒ **純 fast-forward**：
`05d434f → e34d8a9`。`git log --merges 05d434f..e34d8a9` 為空，
**沒有 merge commit、沒有用 force**。在 `ESMO-acceptance` 工作區（main，乾淨）快轉；
主工作區與其他六個工作區全程沒碰。

⚠ 提示詞寫的分支名是 `milestone-q5-season-transition`，實際分支是
**`milestone-q5-season-rollover`**（Q5 開工時建的）。用實際名稱操作，已回報。

### 整合後重跑（全綠）

`q1 93/93`、`q2a 112/112`、`q2b 92/92`、`q3 90/90`、`q35 65/65`、`q4 68/68`、
**`q5 66/66`**、`regress 15/15`、`regress2 8/8`、`npm run build` exit 0（`built in 19.11s`）。

### 部署與線上版本驗證

Actions run **31566276535**（`e34d8a9`）：build ✅ / deploy ✅。
四層確認：HTTP 200 → 線上 entry bundle `assets/index-CBU6FsAl.js` 與本機 build 同名
→ `cmp` **byte-identical** → 線上 bundle 內含 `歷屆成績 HISTORY`／`開始第`。

### 正式站 smoke test（七項全過）

在正式站**實際跑完一整季**（第 12 → 95 天，UI 棄權＋推進；正式站是 build 產物，
`import()` 拿不到原始模組，只能走 UI）：

- S1 封存，副標顯示 **「第 84 / 84 天」**（部署前會顯示「第 95 / 84 天」）
- 「▶ 開始第 2 賽季」→ **S2 · 第 1 / 84 天**、積分榜全 0-0、歷屆成績出現 S1
- 逐欄位比對 `localStorage` 的存檔快照：選手（xp／等級／天賦點／年齡）、資金、粉絲、
  贊助合約、`team.id`、`seasonSeed`、名次獎金帳本**全部不變**
- reload 後季號／賽程／歷史／資金一字不差，**沒有重複建立 S2**
- console 0 錯誤

⚠ 測試在 Ray 的真實正式站存檔上跑：測前備份 21 個 `localStorage` key 到 `__q5bak.*`，
測後逐一寫回、刪備份鍵、清 `esmo_debug`，重載確認回到測試前
（第 2 週第 5/7 天、在地網咖剩 6 週、近期戰績 100%、賽事磚「進入聯賽」、21 keys）。

### 這次確認的一件事

Q5 的顯示修正在正式站是**看得出差別**的：同一個存檔、同一條路徑，
部署前封存會顯示「第 95 / 84 天」，部署後是「第 84 / 84 天」。
這種「只有跑到賽季末才看得到」的修正，Node 斷言驗得到數字但驗不到玩家的觀感——
**還是得真的跑到那一天**。

## Milestone Q6（2026-08-12）— 季後賽與晉級資格

常規賽結束後依 Standings 取 **Top 4 晉級**，建第二個 Stage（**4 隊單淘汰＋季軍戰**），
冠軍與最終名次進 FinalStandings／History。**不做 CS／MMR／Shop／老化／轉會，
Battle Engine 一行沒動。**

### Audit：既有架構已經支援到什麼程度

| 事實 | 影響 |
|---|---|
| **`Fixture.v1` 本來就帶 `stageId`**（Q2a） | 季後賽場次**直接放進同一個 `state.fixtures`**：出賽閘道、房間、場次、日曆推進、AI 模擬、棄權、賽果回寫**一行都不用改** |
| `STAGE_FORMATS` 已含 `single_elim`；`Stage.qualifications[]`、`Competition.stageIds[]` 都在 | 契約是填空，不是新增 |
| ⚠ **`FixtureOutcome` 沒有 `stageId`** | `computeStandings` 只看「參賽者在不在名單裡」，而季後賽四隊都在 ⇒ **季後賽賽果會被算進常規賽積分榜**。這是 Q6 的第一個破口，先補這一欄才談得上分流 |
| ⚠ `canSealSeason` = 「每一場都收尾」 | 季後賽場次進同一個陣列後，封存會自動等到季後賽打完（這是要的），但同時連動 Q4 發獎與 Q5 換季 |

### 兩個產品決策（與 Ray 確認後才動手）

1. **最終名次前四名由季後賽決定**（冠／亞／季／殿），5–8 名維持常規賽順序。
   ⇒ **名次獎金因此跟著季後賽走**（獎金是按 `final.playerRank` 發的）。
2. **要打季軍戰** ⇒ 季後賽 4 場（兩準決＋季軍戰＋決賽）。

### 常規賽資料怎麼保證不被覆蓋

- `FixtureOutcome` 新增 `stageId`；`computeStandings({ stageId })` 只算指定賽段。
  舊存檔的賽果沒有這一欄 ⇒ **視為常規賽**，行為不變。
- `FinalStandings` 每一列新增 **`regularRank`**，並新增 `rankSource`（`"playoff"`／`"regular"`）。
  季後賽只重排 `rank`，**勝敗／積分／淨勝分原樣保留在同一列**。
- 舊賽季（Q6 之前封存的）`rankSource` 是 `"regular"`，不會被誤讀成季後賽結果。

### 對戰表為什麼分兩輪產生

決賽與季軍戰的對手要等準決賽打完才知道。契約 `createFixture` 要求 `sideA`／`sideB`
是**真的隊伍識別碼**——這是對的：對手未定的 Fixture 沒辦法被出賽閘道簽發，
硬塞佔位只會讓下游多一套「這是不是假隊伍」的判斷。
所以 `ensurePlayoffFixtures` 是**冪等**的：每次呼叫只補出「資料夠、且還沒排過」的場次。

### ⚠ 修掉一個自己引入的真 bug（封存日）

`_advanceCompetition` 是在 `advanceDay` 更新 `meta.days` **之前**跑的，
在那裡封存會把封存日記成推進前的舊日子。Q6 之前很少踩到（最後一場通常是玩家自己
打完／棄權觸發），但**季後賽最後一場常常是 AI vs AI 在推進中被模擬掉** ⇒ 變成常態。
封存呼叫已移到 `advanceDay` 時鐘更新之後。`check_competition_q4 2b5` 抓到的。

### ⚠ 又改了兩條既有斷言（第四、五次）

| 斷言 | 原本 | 現在 |
|---|---|---|
| `q4 2b2` | 封存的列順序 == 常規賽推導順序 | **封存快照裡的常規賽資料**與推導值逐列一致（季後賽只重排名次，不改成績） |
| `q5 7d` | seasonState 不得出現 `playoff` | 換季本身不碰季後賽規則；CS 巡迴／MMR／Shop 仍一律不得出現 |

模式已經很清楚且重複五次了：**「下一個 Milestone 還不該存在」這種防護斷言，
在那個 Milestone 實作時一定要改寫成真正的邊界**——已寫進 08 當成通則。

### 新增：全自動瀏覽器驗證（`tools/browser_check_q6.mjs`）

前幾輪的瀏覽器驗收都在驅動 Ray 的日常 Chrome：要備份他的存檔、
還要請他把分頁點到前景（背景分頁被節流時跑一整季要三十分鐘）。這一輪改成：

- **自己起 vite（port 5311）＋ 自己開一個獨立 Chrome**（獨立 `user-data-dir`、
  獨立 CDP port 9333、`--headless=new`）
- 用 **CDP** 驅動，只用 Node 內建的 `fetch` 與 `WebSocket`——**沒有裝 puppeteer／playwright**
- `--disable-background-timer-throttling` 等三個旗標關掉節流
  ⇒ **跑一整季不再需要人把視窗點到前景**

⇒ 不碰日常 Chrome、不碰正式站存檔、不需要人工操作。20/20 通過。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_competition_q6` | **57/57** exit 0 |
| `q1`／`q2a`／`q2b`／`q3`／`q35`／`q4`／`q5` | 93／112／92／90／65／68／66 全通過 |
| `finance_n`／`finance_n3`／`matchmaking_o4`／`flow_acceptance` | 32／40／47／97 |
| `regress`／`regress2` | 15/15、8/8 |
| `npm run build` | exit 0（`built in 14.47s`） |
| `tools/browser_check_q6.mjs`（獨立 Chrome） | **20/20** |

瀏覽器實測實跑一整季（玩家全勝）：晉級名單＝常規賽前四、對戰表
`sf1 德國海豹>寒冰守衛／sf2 烈焰鳳凰>暗影狼群／季軍戰 寒冰守衛／決賽 德國海豹奪冠`、
最終名次來源 `playoff`、名次獎金 **第 1 名 $80萬**、賽事頁看得到季後賽區塊與
「📋 常規賽名次」、Q5 換季後 S1 連季後賽結果一起進歷史、reload 不變、0 JS 例外。

### 沒做（刻意）

- 季後賽**沒有獨立獎金**：名次獎金仍是同一張表、依最終名次發（Ray 選的方案）。
- 賽制固定 4 隊單淘汰（`PLAYOFF_SLOTS`）。要改名額就要一起改賽制，不做半套參數化。
- 季後賽場次目前**沒有 BO3**（`matchFormat` 欄位空著，契約支援但本輪不用）。

## Q6 部署紀錄（2026-08-12）

### 整合

`origin/main` 全程沒有前進（`0 behind / 1 ahead`）⇒ **純 fast-forward**：
`0231b93 → 4e5b37b → c3a5ba4`。`git log --merges 0231b93..HEAD` 為空，
**無 merge commit、未 force**。在 `ESMO-acceptance` 工作區（main，乾淨）快轉；
Q6 本身開在**獨立 worktree**（`scratchpad/q6-playoffs`），其他工作區全程沒碰。

### 整合後重跑（全綠）

`q1 93`／`q2a 112`／`q2b 92`／`q3 90`／`q35 65`／`q4 68`／`q5 66`／**`q6 57`**、
`finance_n 32`／`n2 35`／`n3 40`、`matchmaking_o4 47`／`flow_acceptance 97`、
`regress 15/15`／`regress2 8/8`、`npm run build` exit 0（`built in 17.53s`）、
**`browser_check_q6` 20/20**。

### 部署與線上版本驗證

Actions run **31603291866**（`c3a5ba4`）：build ✅ / deploy ✅。
四層確認：HTTP 200 → 線上 entry bundle `assets/index-D8fgZrD9.js` 與本機 build 同名
→ `cmp` **byte-identical** → 線上 bundle 內含
`季後賽 PLAYOFFS`／`準決賽`／`季軍戰`／`常規賽名次`／`常規賽前四名晉級`。

### 正式站 smoke test：**14/14，全自動**

`tools/browser_check_q6_prod.mjs` 起一個獨立 Chrome（headless、獨立 user-data-dir、
獨立 CDP port、關閉背景節流），**走 UI** 跑完整季：

| 項目 | 結果 |
|---|---|
| 常規賽能產生 Top 4 | ✅ 暗影狼群／烈焰鳳凰／寒冰守衛／雷霆戰熊 |
| 季後賽區塊正常顯示 | ✅ 準決賽 ①②／季軍戰／決賽都在畫面上 |
| 4 場季後賽完整產生 | ✅ `sf1, sf2, bronze, final` 且全部收尾 |
| FinalStandings 前四由季後賽決定 | ✅ `rankSource: "playoff"`，冠軍 烈焰鳳凰 |
| `regularRank` 仍保留 | ✅ 每一列都在（我方最終第 8 名／常規賽第 8 名） |
| Q5 換季後歷史保留季後賽結果 | ✅ S1 進歷史後 `rankSource` 與冠軍都還在，`regularRank` 也在 |

### 這一輪最大的流程改變：正式站測試不再需要動 Ray 的存檔

前面每一輪（Q3.5／Q4／Q5）的正式站驗收都是驅動 Ray 的日常 Chrome，
所以要「備份 21 個 localStorage key → 測 → 逐一寫回 → 清 `esmo_debug`」，
而且跑一整季得請他把分頁點到前景（背景節流三倍慢）。

Q6 之後：獨立 Chrome 有**自己的 user-data-dir** ⇒ 正式站那個 origin 在裡面是
**全新 profile**（實測 `localStorage 0 筆`）。
⇒ **不需要備份、不需要還原、不需要人**。這套流程之後每一輪都該直接沿用。

---

## 賽果完整性 hotfix（2026-08-13）— 跨場次防串 ＋ 瀏覽器 gate 重做

稽核指出：**已結算過的舊 BattleResult，若在另一個 active 場次存在時被重送，
可能錯誤完成另一個 fixture。** 本輪只做這件事，未動 reward／match flow／
Battle Engine，未開 Q7。

### 成因不是「結果沒綁場次」，是綁定方向反了

`createMatchResult({ session, outcome })` 是把**當下場次的身分**
（sessionId / seed / rosterVersions）**蓋到**呼叫端遞來的 outcome 上。於是舊
payload 重送時會被重新蓋章成一份**形式上完全合法**的本場結果：contentHash
重算得過、與 session 逐欄相符（欄位本來就是抄來的）、與 `lastResult` 的
sessionId 不同所以衝突偵測也不觸發。

錢因為 S25 以 `transactionId` 冪等不會重複發，這也是它一直沒被發現的原因。
真正的損害是**場次被舊結果佔用並標成 `completed`**，而這一場真正的賽果從此
再也結算不進去（`completeSession` 只收 `launched`，且正牌結果會與被寫入的舊
`lastResult` 撞成 `conflict`）。

### 在最新 main 上，這條路是真的會走到底的

`profileStore.js` 的賽程回寫邊界是：

```js
if (receipt?.ok && isFixtureSession(session)) {
  get()._writeFixtureResultFromMatch(made.result, session);   // → completeFixtureMatch()
}
```

**只看 `receipt.ok`，沒有看 `alreadySettled`。** 所以在 Q3.5 之後的主幹上，
被錯誤受理的舊結果會一路寫進賽程並完成該場 —— 而 FixtureOutcome 依 D11
不可變，寫錯改不回來。擋住它的唯一一道關卡就是結算本身。

### 修法（`settleMatchResult.js`，+43 −1，大半是註解）

新不變量：**這筆對戰的進度先前已入帳，但本場次沒有任何對應它的結算紀錄
⇒ 結果來自別場，拒絕且完全不寫入**（`code: "foreign_result"`）。一條規則同時
蓋住兩種變體（已有 O7 結算紀錄／只經 S25 入帳），因為兩者共同的事實都是
「錢已經發過，但不是這一場發的」。不新增 state 形狀、舊存檔不必遷移。

順帶修掉冪等捷徑沒檢查場次的問題：原本拿舊結果去別的場次重送會拿到一張
`ok: true` 的 receipt，下游看 `receipt.ok` 就會被騙；現在改由既有的
`session_mismatch` 拒絕。

cherry-pick 到 main 零衝突（`settleMatchResult.js` 在 main 與 base 逐字元相同）。

### 瀏覽器 gate 的根因與重做（本輪真正花時間的地方）

第一版 gate 跑出 24/24，之後**穩定 19/24**。用乾淨 worktree 檢出那個 commit
本身也是 19/24 ⇒ **那次綠是偶然，不是程式的性質**。

根因：gate 假設「同一頁 import `profileStore` 與 import `settleMatchBoundary`
會拿到同一個 store」。這個假設不成立，而且**失敗是靜默的**——gate 驅動一個
store，`settleMatchThroughSession` 讀另一個，於是走無場次分支、從未呼叫
`reportMatchResult`，後面每一條斷言都在量空氣。

定位證據（在 gate 自己的 closure、同一個 evaluate 內）：

| 觀測 | 值 |
|---|---|
| 我的 store：session launched / moba / schema 正確 | `usableMine = true` |
| 同一刻呼叫 boundary | `viaSession = false` |
| 事後再 import 一次 profileStore 與 INSTALL 捕獲的比對 | `freshEqualsInstall = true` |

第三列排除了「我這一側有兩份」⇒ 第二份是從 boundary 的 `../profileStore.js`
這條邊進來的。對照組是決定性的：**最小腳本跑完全相同的流程得到
`viaSession: true`／`receiptOk: true`**。

已用單一變因實測排除：合成時鐘 vs 真實時鐘（改真實反而更糟 24→19）、
`Promise.all` 併發 import（改循序無效）、reload 造成實例分裂（navigate／reload／
再 reload 三次身分一致）、app 計時器競爭（清光 timer 無效）、共用 `node_modules`
與 Vite 快取（自裝 + `--force` 皆無效）、工作區被改髒（乾淨 worktree 同分）。

**修法是移除假設，不是繞過**：頁面前導程式抓 dev server 供應的 **boundary
轉譯後原始碼**，讀出它實際 import 的 profileStore URL，再 import 那一個。
被測 store 與 production 路徑用的 store 從此在定義上同一個。

**前提改成強制**：第一次真實結算必須 `viaSession === true`，否則立刻 abort 並
印出解析到的 store URL。接線問題不能再偽裝成綠或紅。前提由**真實場次**擔任，
不用獨立假 session probe 當證據（那只在診斷階段用過）。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_fixture_result_integrity`（新增） | 20/20；**修正前先跑過 10/20**（重現，非事後補測） |
| `check_fixture_result_browser`（票券來源，重做） | 24/24，連跑 3 次一致 |
| `browser_check_fixture_integrity`（賽程來源，新增） | 26/26，連跑 3 次一致 |
| `check_authoritative_o7` | 48/48 |
| `check_competition_q1 / q2a / q2b / q3 / q35 / q4 / q5 / q6` | 93 / 112 / 92 / 90 / 65 / 68 / 66 / 57 |
| `check_progress25` / `check_cs23` | exit 0 / 28/28 |
| `regress` / `regress2` | exit 0 / 8/8 |
| `npm run build` | `built in 13.61s` |

賽程來源那支驗到底：賽程 A 完成並產生 engine 賽果 → 啟動賽程 B → 重送 A 的舊
BattleResult **被拒** → B 仍 `launched`、**沒有賽果**、賽果總數 7→7 不變、
reward/XP 不重複、A 的賽果未被動到（D11）→ B 的正牌結果之後仍能正常完成（7→8）。

### 這一輪的教訓

**驗證器最危險的失敗不是紅，是靜默地量錯對象。** 這支 gate 曾經「綠過一次」，
而那次綠與被測行為完全無關。往後任何跨 realm／跨模組邊界的驗證，都必須把
「我量到的是不是同一個東西」寫成**開場就會 abort 的前提**，而不是註解裡的假設。

### 已部署（2026-08-13）

| 項目 | 值 |
|---|---|
| 分支 | `hotfix/fixture-result-integrity` → `ddd4c04` |
| `main` | `1fe85d3` → **`ddd4c04`**（fast-forward，無 merge commit、無 force） |
| Actions | `Deploy Vite site to GitHub Pages` run [31634938771](https://github.com/RayHuang0323/ESMO-/actions/runs/31634938771) — success |
| 正式站 | https://rayhuang0323.github.io/ESMO-/ |

上線前最後一次驗證：`integrity` 20/20、`o7` 48/48、`q35` 65/65、
`check_fixture_result_browser` 24/24、`browser_check_fixture_integrity` 26/26、
`build` `built in 15.67s`。

**正式站最小 smoke（4/4）** —— 獨立 Chrome profile／獨立 CDP／headless，
不碰日常瀏覽器、不碰正式存檔：

1. 站台載入且 app 真的掛載（`esmo · MOBA 3D`，畫面 342 字，Dashboard 正常）
2. 該 origin 的 `localStorage` **0 筆** ⇒ 確認是全新 profile，沒有動到正式存檔
3. **部署出去的 bundle 確實含本次守衛** —— 在 `index-DFIyHT-O.js` 找到
   fail-closed 的中文原因字串「這份對戰結果屬於另一場比賽」
4. 無未捕捉的頁面例外

⚠ smoke 刻意只做到這裡：正式站是 minified bundle，無法用 dev server 那套
`RESOLVE_APP_MODULES` 入口驅動真實模組，所以**跨場次防串的行為本身不是在正式站
驗的**，而是在 dev build 的兩支 gate（24/24、26/26）。正式站只證明
「這份程式碼確實上線了、站台沒壞」。

---

## Q7a 安全前提（2026-08-13）＋ 上一節根因的更正

### ⚠ 更正：上一節寫的 gate 根因是錯的

上一節把「gate 一下 24/24 一下 19/24」歸因於**模組實例分裂**（自己 import 的
profileStore 不是 `settleMatchBoundary` 閉包裡那一個），並據此把前導程式改成
從 boundary 原始碼推導 store URL。

**那個結論沒有成立。** 真正的問題是 `startDevServer` 漏行程：

- `spawn(..., { shell: true })` 之下 `proc.kill()` 只殺得到 shell，**vite 活下來
  繼續佔 port**。跑幾輪之後實測有 **7 個**殘留的 dev server 還在監聽
  （5311/5312/5313/5317/5318/5319/5321）。
- 於是 `--strictPort` 從保護變成陷阱：新的 vite 因為 port 被佔直接結束，但
  「等 server 起來」那個 `fetch` **會對舊的那一個成功** ⇒ gate 靜默地連上
  **別的 worktree 的 dev server**，測到的根本不是它以為的原始碼。

把殘留行程清掉、port 確認是空的之後重跑：**當初被判定「不可能通過」的天真版
前導（自己直接 import profileStore）同樣 24/24 通過**。所以模組分裂那套說法
不成立——支持它的證據，全部來自 dev server 來源未經確認的那些跑。

**修法**（`tools/browser/cdp.mjs`）：起 server 前先確認 port 是空的，被佔就
**直接 throw**（不重試、不換 port）；收工用 `taskkill /T /F` 殺整棵行程樹。
`RESOLVE_APP_MODULES` 保留——把 store 身分寫明確本身有價值——但它是**加固，
不是修正**，敘述已改。

**教訓（延續上一節那條，而且更難堪）**：上一節說「驗證器最危險的失敗是靜默地
量錯對象」，然後我對「量錯的是什麼」下了錯誤結論，因為我沒有先確認**驗證器連
到的是不是自己起的 server**。前提要驗到底：不只是「我拿到的 store 對不對」，
還有「這個頁面是誰供應的」。

### Q7a 產品方向（已定案）

```
賽季 Season → 遊戲項目 Game Mode → 巡迴賽體系 Circuit → 單一賽事 Event
  → 賽事階段 Competition / Stage → 晉級資格 Qualification → 具體對戰 Fixture
```

Season 仍是 ESMO 第一級的時間／生涯週期，**不降級成 Circuit 的屬性**。
Circuit 是該 Season 內某個遊戲項目的一條競賽路線，Event 是 Circuit 裡的一站。
MOBA 與 CS 共用 Season 但 Circuit 結構不同（MOBA 以聯賽／季後賽為生涯主線，
CS 偏多站巡迴＋Circuit Points＋年度大賽）。Circuit 是**一級實體**，積分跨 Event
累積並決定晉級；賽區（Region）只是名稱，不限制報名資格。

### 本輪只做兩個安全前提（audit 的第 1、2 項）

兩者都與 Circuit / Event 的資料形狀無關，所以先做，不必等 Q7a 定案。

**① 一次只能有一場進行中的對戰。** `startFixtureMatch` 以前只擋「同一個 fixture
且已 launched」；另一場還是 `scheduled` 的賽程可以直接開下去，而它會把
`matchmaking.session` 設成 null ⇒ **前一場進行中的場次無聲消失**，賽果之後只走
S25 路徑、不寫進賽程，那場 fixture 永遠停在 `launched`。一季一賽事時很難踩到，
多賽事並存之後是常態。現在**任何 live session 都擋**，訊息帶對手名字。
逾期分狀態判定：`launched` 一律擋（打久了不該能繞過去），`created` 逾期不擋
（作廢的入場券不該卡人）。

**② 同一天的第二場不再隱形。** 資料模型本來就放得下一天多場，但
`pendingPlayerFixtureOn` 只回第一場 ⇒ 第二場看不見卻仍擋著日曆，玩家卡在
「走不出今天、也不知道還要打什麼」。新增 `pendingPlayerFixturesOn` 回傳清單，
單數版改成取清單第一個（既有呼叫端零影響），`competitionView().todayPending`
把整份給畫面。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_q7a_safety`（新增） | **18/18** |
| Q1 / Q2a / Q2b / Q3 / Q3.5 / Q4 / Q5 / Q6 | 93 / 112 / 92 / 90 / 65 / 68 / 66 / 57 |
| `o7` / `integrity` / `cs23` / `progress25` | 48/48 / 20/20 / 28/28 / exit 0 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 10.07s` |
| 三支瀏覽器 gate | 票券 24/24、fixture 26/26、q6 20/20 |

⚠ 瀏覽器 gate 的數字是在**清掉殘留 dev server、port 確認乾淨**之後跑的。
往後任何一支 gate 紅了，第一件事是確認 port，不是懷疑被測程式。

### 未做（刻意）

audit 的第 3～6 項（Circuit/Event 契約與 `competition.id` 換根、seasonState 多賽事、
季後賽收編成 Stage 賽制、time-slot 排程）**都沒有動**。第 3 項開始前要先提出
最小 migration 方案與 seasonState 的資料形狀。

### 已部署（2026-08-13）

| 項目 | 值 |
|---|---|
| 分支 | `q7a/safety-preconditions` → `6ba820e` |
| `main` | `9534ed0` → **`6ba820e`**（fast-forward，無 merge commit、無 force） |
| Actions | [31641064119](https://github.com/RayHuang0323/ESMO-/actions/runs/31641064119) — success |

上線前重跑全綠：Q1 93／Q2a 112／Q2b 92／Q3 90／Q3.5 65／Q4 68／Q5 66／Q6 57、
`q7a_safety` 18/18、`o7` 48/48、`integrity` 20/20、`cs23` 28/28、`progress25` exit 0、
`regress` exit 0、`regress2` 8/8、`build` `built in 10.92s`；
三支瀏覽器 gate：票券 24/24、fixture 26/26、q6 20/20。

**正式站 smoke 7/7**（獨立 Chrome profile／CDP／headless，注入自造存檔，不碰正式存檔）：
bundle 含新的拒絕訊息與 `todayPending` 欄位；帶著「進行中場次」的存檔正常開得起來；
賽事頁給的是「⚔️ 返回比賽 ／ 棄權」而**不是**重新出賽 ⇒ 進行中場次在正式站被正確尊重；
全程無未捕捉例外。

### ⚠ 第 ② 項只做了資料層，**UI 沒有做**

`competitionView().todayPending` 已經把當天全部場次給出去了，但**沒有任何元件用它**。
`CompetitionScreen.jsx:97` 仍是 `const focus = today ?? next`——一次只渲染一場。

正式站 smoke 用「同一天兩場」的存檔實測，賽事頁確實只列出一場
（`今日賽事｜今天｜德國海豹 客場 VS 雷霆戰熊 主場`）。

⇒ **「同一天多場都可被 UI 看見」目前不成立**。資料層已經正確、日曆阻擋也正確
（當天全部終局才走得出去），缺的是把清單畫出來。列入 08 待辦。
本輪刻意不動 UI：安全前提與畫面改動分開上線，出事時好切。

---

## 同日多場補完 ＋ q6 行程外洩（2026-08-13，已部署）

補上一節留下的兩個缺口。**沒有動 Q7a 第 3 項。**

### ① 同日多場的畫面（補完上一節的另一半）

`CompetitionScreen` 的「今日賽事」改成渲染整份 `todayPending`，每場各自有對手與
出賽／棄權；棄權確認本來就以 fixture id 為 key，天然落在正確那一場。
進行中那一場顯示「返回比賽」，其他場**刻意仍可按「出賽」**——

> 規則由 Store 判，拒絕理由畫面已經會顯示。在 UI 再加一份 disabled 判斷等於把
> 規則寫兩遍，而且 disabled 按鈕什麼都沒解釋。

舊存檔／舊 Store 沒有 `todayPending` 時退回單筆，畫面不會壞。

新增 `tools/browser_check_same_day_fixtures.mjs`（**Node 驗不到畫面**）：
兩場都列出、live 那場顯示返回、按另一場的出賽被擋且理由顯示在畫面上。**7/7**。

### ② `browser_check_q6.mjs` 的 dev server 外洩

沿用已驗證的兩件事：port preflight（被佔就 throw）＋ `taskkill /T /F`。
只動這兩處，不碰它的 CDP client 與斷言。
**實測佐證**：修之前 q6 跑完 5311 仍被佔（另兩支已釋放），修之後四支全部釋放。

### ③ 同日多場的體力規則：查了數字，**現有機制不必改**

上一節把「一天多場在體力上幾乎不可行」列為待決。實際去查：

| 機制 | 數值 | 對同日第二場的影響 |
|---|---|---|
| 每場扣體力 | 12 | ~95 → ~83 |
| 同日第二場加扣 | +3（共 15） | ~68 |
| `unfitBelow`（不可出賽） | **15** | ~68 遠高於門檻 ⇒ **擋不到** |

要打到 `exhausted` 得同日約六場。唯一會擋下第二場的是**傷停**，而那正是產品規則
要的。⇒ Q7a 不新增也不重做疲勞系統，這條成立。

⚠ 剩下的是**流程缺口不是規則缺口**：先發受傷後 `matchEntry` 會以 `injured` 擋掉
整張申請單，玩家必須換人上場，但畫面沒有引導。已列 08。

### 已部署

| 項目 | 值 |
|---|---|
| 分支 | `q7a/same-day-ui` → `a1f5e8b` |
| `main` | `7958bd5` → **`a1f5e8b`**（fast-forward） |
| Actions | [31663631499](https://github.com/RayHuang0323/ESMO-/actions/runs/31663631499) — success |

上線前全綠：Q1 93／Q2a 112／Q2b 92／Q3 90／Q3.5 65／Q4 68／Q5 66／Q6 57、
`q7a_safety` 18/18、`o7` 48/48、`integrity` 20/20、`cs23` 28/28、`progress25` exit 0、
`regress` exit 0、`regress2` 8/8、`build` 9.13s；
四支 browser gate：票券 24/24、fixture 26/26、same-day 7/7、q6 20/20，
**跑完 5311/5312/5313/5315 全部釋放**。

**正式站 smoke 10/10**（獨立 Chrome profile／CDP／headless，注入自造存檔）——
這次是**行為驗證**，不只是部署驗證：

1. 同一天兩場**都看得見**（`今天 · 2 場`，兩組 VS）
2. 進行中那場顯示「⚔️ 返回比賽」，另一場顯示「⚔️ 出賽」
3. 按另一場的出賽 → 被 Store 拒絕，理由顯示在畫面上
   （`你有一場進行中的對戰（對手：雷霆戰熊），請先打完或放棄那一場`），且**停在原畫面**
4. 第一場完成後 → 今日賽事只剩第二場、只有「出賽」，按下去**正常進入**
   （到達 `MOBA 賽前配置`）

---

## Q7a-3a：Circuit / Event 契約與 legacy 升級（2026-08-13，已部署）

範圍**刻意很小**：只做契約、`idScheme`、legacy 升級。**沒有做**多賽事並存（3b）、
Circuit Points（3c），也**沒有任何賽事用新推導產生**。

### 為什麼要加這一層

`competition.id = comp:{mode}:s{season}:{organizerId}:{tier}` 只有四個鑑別欄位，
**沒有賽事身分**。同季只要辦兩個 mode/organizer/tier 相同的賽事就是同一個 id
⇒ 同一個 stageId ⇒ 同輪次同對戰即同一個 fixtureId ⇒ 同 seed ⇒ 同 sessionId。
整條鏈都是它的函數。

```
circuit.id = circuit:{gameMode}:s{season}:{circuitKey}
event.id   = event:{circuit.id}:{eventKey}
competitionIdForEvent(event, tier) = comp:{event.id}:{tier}   ← 3a 尚無呼叫端
```

**只加最上面一層，下游四層（stage/fixture/seed/session）的推導公式一個字都不改。**

### legacy 升級：只增不改

舊存檔的 `comp:moba:s1:official:regular` **原字串保留**，只補
`circuitId` / `eventId` / `idScheme: "legacy-v1"` 三個欄位，並合成一條
legacy circuit + event 當容器。**重寫 competition.id 會讓所有既有 fixture 與
已封存賽果全部對不上，這是本 milestone 唯一不能做的事。**

新建賽季走**同一條路徑**，新舊存檔形狀一致。

升級**冪等且回傳同一個物件參考**——不是只有值相同。若每次載入都產生新物件，
畫面會白重繪，而且 Q5/Q6 那些「重載後逐字未變」的 JSON 比對會失準。

### Q5 的紅線守衛：收窄，不是拿掉

`check_competition_q5.mjs` §7d 原本擋 `double_elim|circuit|mmr|tokens|entitlement`。
Circuit 現在是核准的一級實體、`seasonState` 必須 import 它的升級 ⇒ 原字面必然紅。

改成擋 `circuitPoints`：**身分可以進來，積分玩法仍擋在門外**（3c 之前不得出現）。
照 Q6 修訂同一條斷言的前例，在旁邊註明原因。
**驗過它還有檢定力**：故意注入 `circuitPoints` 到 `seasonState.js`，斷言確實變紅。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_q7a_3a_identity`（新增） | **29/29** |
| Q1 / Q2a / Q2b / Q3 / Q3.5 / Q4 / Q5 / Q6 | 93 / 112 / 92 / 90 / 65 / 68 / **66** / 57 |
| `q7a_safety` / `o7` / `integrity` / `cs23` / `progress25` | 18/18 / 48/48 / 20/20 / 28/28 / exit 0 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 9.09s` |
| 四支 browser gate | 票券 24/24、fixture 26/26、same-day 7/7、q6 20/20；**port 全部釋放** |

紅線斷言（`check_q7a_3a_identity`）驗到的：`competition.id` 逐字元不變、
既有 **11 個欄位全部不變**、新增的**正好**是那三個、原物件沒有被就地改動、
**56 場 fixture id 全部不變**、`fixtures` 陣列連參考都沒換、存檔→重載後 id 不變。

### 已部署

| 項目 | 值 |
|---|---|
| 分支 | `q7a/3a-circuit-event` → `324d374` |
| `main` | `150860e` → **`324d374`**（fast-forward） |
| Actions | [31666995097](https://github.com/RayHuang0323/ESMO-/actions/runs/31666995097) — success |

**正式站 smoke 8/8**：bundle 含升級碼；**舊存檔（拔掉身分欄位）正常載入**；
`competition.id` / `stage.id` / **56 場 fixture id 逐字元沒變**；
**升級前後畫面逐字相同**（積分榜／今日賽事／天數全部一致）；再次 reload 無漂移。

⚠ 有一項正式站**看不到**，如實記錄：身分欄位是在**載入時的記憶體**補上的，
`localStorage` 要等下一次 `save()` 才改寫，所以 prod 讀不到那三個欄位。
這是預期行為（載入不主動寫檔），欄位本身的斷言由 `check_q7a_3a_identity` 涵蓋。

### 一個自己造成、push 前抓到的問題

第一次 commit 顯示「2650 增／2246 刪」——編輯把 `seasonState.js` 與
`profileStore.js` 寫成 CRLF，而 repo 存 LF，整檔被重寫。實質改動只有
31／200／4／171 行。已轉回 LF 並 amend。回頭查過先前六個已 push 的 commit
（+66、+23、+167、+247、+131、+276），**都沒有這個問題**。

⇒ 往後 commit 前值得看一眼 `git show --numstat`：行數與改動量對不上就是換行雜訊。

---

## Q7a-3b：同季多賽事並存（2026-08-13，已部署）

3a 建好了 Circuit / Event 的身分，3b 把賽季狀態從「一季一個賽事」改成
**同季多個賽事並存**，並把 Event 封存與 Season 封存拆開。

### 形狀：`competitions{}` 是唯一真相

```js
competitions: { [competitionId]: { competition, stage, playoff, expectsPlayoff } }
events:       { [eventId]: { …, competitionIds, rankingCompetitionId, prizePolicy, final } }
circuits:     { [circuitId]: { …, eventIds } }
fixtures / outcomes            ← **維持頂層單一陣列，不拆**
activeEventId                  ← 只給畫面聚焦，不參與任何規則
```

**頂層刻意不留 `stage` / `playoff` 鏡像** —— 鏡像就是兩個地方存同一份東西，
遲早漂移。讀取一律走 `activeEntryOf` / `activeStageOf` / `activePlayoffOf`。

`fixtures` / `outcomes` 不拆的理由是硬的：`fixturesOn(day)` 必須跨賽事掃
（同日多場的前提）、`fixture.stageId` 已能回推賽制、拆了就會每個賽制一份副本。
反向索引一律推導，不落盤。

### `expectsPlayoff` 不是裝飾，是必要的

封存判定原本無條件要求季後賽打完。多賽事之後這條就死了：

- 無條件要求 ⇒ **沒有季後賽的盃賽永遠封不了**
- 放寬成「有季後賽才擋」 ⇒ **聯賽會在季後賽排出來之前就封存**（Q6 明確禁止）

兩個都不能接受，所以改成**賽制自己宣告**是否預期有季後賽。

### 獎金：有政策才發，收據不進 final

`prizePolicy` 只存**抽象政策**（`{ kind:"rank_table", table:"default" }`），
不指名獎金表——第一版寫了 `COMPETITION_PRIZE`，Q4 §4c／Q5 §7b 的
「賽季層不碰錢」守衛立刻紅，**那是守衛做對了**。實際結算仍是
`economy/competitionAward.js` 那一支唯一入口。

沒有 `prizePolicy` 的 Event **完全沒有 award key**，不是 0 元的假收據。

收據掛在 **Event 上，不寫進 `final`** —— `final` 是不可變快照，往裡面塞東西會讓
Q4／Q5／Q6 對它的逐字比對失準，而那些比對正是「封存後不會再變」的證明。

### legacy 等價

單一 Event 時 `state.final` **就是那個 Event 的封存快照（同一個物件）**，
所以 Q4／Q5／Q6 比對到的位元組與 v1 相同。賽季封存的判定改成
「每一個 Event 都封存了」，legacy 只有一個 ⇒ 時機不變。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_q7a_3b_multi_event`（新增） | **25/25** |
| Q1 / Q2a / Q2b / Q3 / Q3.5 / Q4 / Q5 / Q6 | 93 / 112 / 92 / 90 / 65 / 68 / 66 / 57 |
| `q7a_safety` / `q7a_3a_identity` | 18/18 / 29/29 |
| `o7` / `integrity` / `cs23` / `progress25` | 48/48 / 20/20 / 28/28 / exit 0 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 9.34s` |
| 四支 browser gate | 24/24、26/26、7/7、20/20；port 全部釋放 |

⚠ **Q1–Q6 全綠只證明 legacy 沒壞**——legacy 永遠只有一個 Event，所有分流程式碼
在它身上都退化成「就是那一個」。所以新驗證器**自己合成第二個 Event**，
去驗真正的分流、獨立封存與獎金閘門。

### 已部署

| 項目 | 值 |
|---|---|
| 分支 | `q7a/3b-multi-event` → `eb396a5` |
| `main` | `a49a92c` → **`eb396a5`**（fast-forward） |
| Actions | [31696851892](https://github.com/RayHuang0323/ESMO-/actions/runs/31696851892) — success |

**正式站 smoke 15/15**：兩個 Event 並存載入正常、參賽者互不污染（8 vs 2）、
盃賽可先封存而聯賽不受影響、Season 在全部 Event 封存前不得封存、
有 prizePolicy ⇒ $80 萬／無政策 ⇒ **完全沒有 award key**、
legacy 單 Event reload 行為不變、無未捕捉例外。

⚠ 正式站是 minified bundle，無法驅動 store 動作 ⇒ 上面驗的是
**載入／渲染／持久化這些形狀是正確的**；封存與獎金的**行為**由
`check_q7a_3b_multi_event` 25/25 證明。

### 兩個驗證器 bug（都是被既有契約擋下來才發現）

1. `forfeitFixture` 只棄得掉**玩家自己的**場次（AI vs AI 由 `advanceDay` 模擬）。
   第一版對每一場 forfeit，第二場就被「棄權方必須是對戰雙方之一」擋下——
   **契約對，驗證器錯**。
2. 合成的盃賽必須包含玩家隊伍，否則獎金那條永遠驗不到（獎金依玩家名次發）。

⇒ 新驗證器第一次就全綠反而可疑；被既有契約擋下來才是它在做事。

### Q4 §5h 的假陽性：改的是我的變數名，不是斷言

守衛禁止 `unseal|clearFinal|resetFinal`，我的區域變數叫 `unsealed`。
守衛的意圖（不得提供解除封存）完全成立 ⇒ 改名 `pendingEvents`，**守衛一字未動**。

---

## Q7a-3b.5 ＋ 3c 前置（2026-08-13，已部署）

### ① 多 Event UI 的資訊一致性

先前切換聚焦後，**積分榜換了、頁首還寫「聯賽」、下一場還顯示另一個賽事的比賽**
——同一畫面說兩個故事。已修：頁首標題與「下一場賽事」都跟著聚焦的 Event。

⚠ 兩者都**只在多 Event 時啟用**；單一 Event（所有既有存檔）沿用「聯賽」與全季
`nextPlayerFixture`，legacy 畫面逐格不變。

### ② 查詢層 fail-closed（3c 的前置條件）

**問題（實測）**：`standingsOf(state, "comp:不存在")` **靜默回 0 列**，與「這個賽制
真的一場都沒打」長得一模一樣；而且 `validateSeasonState` 根本不存在。

3c 的 Circuit Points 會沿著 circuit → event → competition 撈名次，
**撈錯會被算成 0 分並寫進不可變的積分帳本**。所以這件事必須在 3c 之前處理。

- 規則／結算用 accessor（`standingsOf` / `eventStandingsOf` / `competitionsOfEvent`）
  對不存在或未指定的 id **明確 throw**，訊息寫明「這是呼叫端傳錯 id，不是沒有資料」
- 畫面的 optional 查詢用 `tryStandingsOf` / `tryEventStandingsOf` /
  `tryCompetitionsOfEvent` ⇒ 回 `null`
- **`null`（找不到）與 `rows: []`（真的 0 筆）不再混用**
- 新增 `validateSeasonScope`：賽制→Event、Event→Circuit、`rankingCompetitionId`
  歸屬、**duplicate binding**、`competitionIds` 與實際綁定一致（五種各一條斷言）

### ③ Codex 賽事工作稽核（唯讀，結論見 08 第 13 項）

`seasonStateV2.js` 是**唯讀投影模型**（legacy 為真相、存檔另存 `seasonStateV2`），
與主線「`competitions{}` 是唯一真相、不留鏡像」衝突，且**沒有封存／獎金／積分行為**。
**不 cherry-pick、不 merge**。只吸收 fail-closed 思路（重寫，非移植程式碼）。

### 驗證

| 項目 | 結果 |
|---|---|
| `check_q7a_3b_multi_event` | **51/51**（+18：fail-closed、scope 驗證、UI 聚焦） |
| Q1–Q6 | 93 / 112 / 92 / 90 / 65 / 68 / 66 / 57 |
| `q7a_safety` / `q7a_3a_identity` | 18/18 / 29/29 |
| `o7` / `integrity` / `cs23` / `progress25` | 48/48 / 20/20 / 28/28 / exit 0 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 11.18s` |
| 五支 browser gate | 24/24、26/26、7/7、8/8、20/20；port 全部釋放 |

**正式站 smoke 8/8**：切換後標題正確（`第 1 賽季 常規賽 → 亞洲盃 春季站`）、
下一場賽事跟著聚焦、積分榜 **8 隊 → 2 隊**、legacy 單 Event 標題仍是「聯賽」且無
切換列、**全程無未捕捉例外**（fail-closed 上線後最大的新風險就是 UI 誤用會 throw
的版本，這條專門驗它）。

### 已部署

| 項目 | 值 |
|---|---|
| 分支 | `q7a/3b-multi-event` → `4b9ebc1` |
| `main` | `b29a833` → **`4b9ebc1`**（fast-forward） |
| Actions | [31707062813](https://github.com/RayHuang0323/ESMO-/actions/runs/31707062813) — success |

### 過程中驗證器自己抓到的兩個 bug（都是驗證器的錯）

1. multi-event gate 用 `/聯賽/` 判斷「到站了沒」，而標題現在會跟著聚焦改變
   ⇒ 改用不會移動的「積分榜 STANDINGS」。**硬編碼標題當偵測條件的代價。**
2. 正式站 smoke 數列數時，`/\n\s*\d+\s/` 把一列數成兩筆（名次與勝敗都有數字），
   且抓到頁尾的 `ESMO`／`AI` ⇒ 改成「夾住區塊上下界 ＋ 隊伍 tag 唯一數」。

---

## B2 / B3 覆蓋補強（2026-08-13，已部署）

Codex 稽核指出的兩個**覆蓋缺口**。兩項都是**純新增驗證器**，
production 一行未改，也**都沒有發現 production 缺陷**。

### B2：進行中的比賽跨存檔升級（`check_q7a_live_session_migration` **20/20**）

形狀升級發生在**載入時**，而那一刻玩家可能正在打一場賽程比賽。
先前我只能說「從程式碼看應該沒事」——現在是實測。

驗證器走真實入口到「fixture 已 launched、對戰尚未完成」，存檔 →
**把存檔改回 v1 形狀** → 重載（真正的 legacy→v2 路徑）：

- sessionId／fixtureId／assignmentId／roomId／**seed／一次性令牌**全部不漂移
- 賽程場次仍是 `launched`（沒有被判成別的狀態）
- 畫面仍拿得到「返回比賽」需要的事實（`competitionView().live`）
- `resumeMatchSession()` 恢復成功，**啟動參數逐欄相同**（同 seed ⇒ 同初始戰鬥狀態）
- 恢復後打完可正常結算，**賽果寫進賽程**
- **重送 3 次不重複發錢／XP、不重複寫 FixtureOutcome**

### B3：推導索引的決定性摘要（`check_q7a_index_digest` **13/13**）

v2 刻意**不落盤反向索引**（避免第二份真相），代價是「推導悄悄指歪了」沒有東西擋。
本檔把七段索引壓成一個摘要：competitions／events／circuits／
fixture→competition／competition→event／event→circuit／standings scope。

**相同性**：重算、**鍵插入順序不同**、JSON 往返、存檔→重載、legacy v1→升級
⇒ 摘要皆逐字元相同。

**檢定力**（摘要不會變就等於廢的）：改綁 Event、改指 Circuit、多一場 fixture、
參賽者變動 **都會讓摘要改變**；只改顯示名稱 **不變**。

⚠ 摘要**算在驗證器裡，沒有加進 production**——加進去比較好寫，
但那就是為了測試方便去改被測對象。

### 驗證與部署

| 項目 | 結果 |
|---|---|
| `check_q7a_live_session_migration` | **20/20** |
| `check_q7a_index_digest` | **13/13** |
| `q7a_safety` / `q7a_3a_identity` / `q7a_3b_multi_event` | 18/18 / 29/29 / 51/51 |
| Q4 / Q5 / Q6 / `o7` / `integrity` | 68 / 66 / 57 / 48 / 20 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 11.96s` |

| 項目 | 值 |
|---|---|
| `main` | `9812146` → **`e7e8a4c`**（fast-forward） |
| Actions | [31711886832](https://github.com/RayHuang0323/ESMO-/actions/runs/31711886832) — success |

---

## Q7a-3c 巡迴積分與晉級資格（2026-08-13，已 commit 未部署）

賽季 → 巡迴賽體系 → 單一賽事 → **最終名次 → 巡迴積分 → 晉級資格**。
本輪把後面三段接起來。

### 一個決定：積分不住在 seasonState

Q5 §7d 有一條斷言明文擋住賽季層出現 `circuitPoints`（3a 收窄那條守衛時寫得很白：
身分可以進來，**積分玩法擋在門外**）。3c **沒有去改它**——它要擋的事現在依然對：
賽季層管賽程與名次，積分是另一個生命週期。

新檔 `src/platform/competition/circuitPoints.js` 是純函式，由 Store 編排。
這不是為了閃守衛：**積分結算與獎金結算是同一層的事**，而獎金一直住在 Store
（`settleCompetitionAwardInState`），現在兩者在 `_sealSeasonIfFinished` 並排。

⇒ **本輪沒有修改任何 Q1～Q6 既有斷言。**

### 三條不能破的線

| 線 | 怎麼實作的 |
|---|---|
| 積分**只能**從封存後的 `final` 產生 | 每筆帶 `finalId`；原始碼守衛禁止 `circuitPoints.js` 出現 `outcomes`／`computeStandings` |
| 沒有政策 ⇒ **擋住，不是 0 分** | 三態 `not_started` / `policy_required` / `settled`；被拒時**不寫紀錄、不寫收據** |
| `pointsLog` 是唯一帳本 | 只 append；`points` 一律推導；Event 只留收據，**收據裡一個分數都沒有** |

### 政策（數字集中在一處）

1 = 100、2 = 70、3 = 50、4 = 35、5–8 = 15、其餘 0；
regular 1.0 / major 1.5 / championship 2.0。`Math.round` 是政策的一部分
（35 × 1.5 = 52.5 → 53）。**層級查不到倍率不是 1.0，是 `policy_required`**。

### 驗證（`check_q7a_3c_circuit_points` **69/69**）

12 項驗收全數涵蓋，其中值得一提的：

- **§11 Store 端到端**：上面 60 條純函式全綠，也證明不了 production 有沒有接線。
  §11 補的就是那一段——實際跑 `_sealSeasonIfFinished`，看積分自動入帳、資格自動核發、
  再跑 3 次與重載後**逐字不變**、資金逐元不動。
- **檢定力實測**（守衛不會紅就等於廢的）：拔掉 Store 那行接線 ⇒ 69→65；
  在規則碼寫死 100 分 ⇒ §1b 紅；讓積分去讀 `outcomes` ⇒ §10c 紅。
- **§9 對照組**：改 Event／Circuit **名稱**積分逐字不變；改 **final／政策／層級**才會變。

⚠ 途中修掉自己的兩條假綠：§1b 原本 `split(...)[2] ?? ""`（索引不存在 ⇒ 在空字串上
跑正則，永遠綠）；§11i 原本拿「現在的資金」跟「現在的資金」比。另有一條 §8h 是
**測試自己寫錯**（兩站名次相反，取 rank ≤ 2 反而湊出 4 支隊伍），程式碼是對的。

### 全套回歸（無一條斷言被改）

| 項目 | 結果 |
|---|---|
| Q1 / Q2a / Q2b / Q3 / Q3.5 | 93 / 112 / 92 / 90 / 65 |
| Q4 / Q5 / Q6 | 68 / 66 / 57 |
| Q7a safety / 3a / 3b / **3c** | 18 / 29 / 51 / **69** |
| Q7a B2 / B3 / fixture integrity | 20 / 13 / 20 |
| o7 / o7.1 | 48 / 27 |
| 瀏覽器 gate ×4 | 26 / 7 / 8 / 20 |
| `regress` / `regress2` / `build` | exit 0 / 8/8 / `built in 17.09s` |

### 尚未做（見 08 §15）

正式站**沒有任何 Circuit 帶政策** ⇒ 機制上線但休眠，舊存檔行為完全不變；
**沒有畫面**（`competitionView().circuitPoints` 已備妥，無元件在讀）；
資格核發後**還沒有東西消費它**；換季會丟掉 `pointsLog`。

### Q7a-3c 收尾上線（2026-08-13）

| 項目 | 值 |
|---|---|
| `main` | `9436cc8` → **`ce594bb`**（fast-forward，無 merge commit、無 force） |
| Actions | [31715373711](https://github.com/RayHuang0323/ESMO-/actions/runs/31715373711) — success |
| 合併後全套 | Q1–Q6 全綠、Q7a 4 支全綠、B2/B3、fixture integrity、o7/o7.1、瀏覽器 gate ×4、`regress` exit 0、`regress2` 8/8、`build` `built in 11.36s` |

**正式站最小 smoke 17/17**（獨立 Chrome profile／獨立 port／headless，
沒有碰日常 Chrome 與正式存檔）：

- bundle 含 fail-closed 訊息與 `CircuitPointsEntry.v1` / `CircuitQualification.v1`
  ⇒ 3c 真的上線了
- **legacy 單 Event 畫面完全不變**：標題仍是「聯賽」、沒有切換列、
  沒有冒出任何積分字樣
- 注入「已封存的盃賽 ＋ 沒有任何積分政策」的存檔 → **推進一天**
  （第 1 天 → 第 2 天，確實經過 `_sealSeasonIfFinished`）⇒
  帳本仍是 0 筆、Event 上沒有收據、沒有發資格、沒有人偷補政策
- 獎金冪等帳本 0 → 0 筆，資金逐元不動
- 全程無未捕捉例外

⚠ 這一輪的 smoke 一開始是**空包彈**：導覽鈕用 `/訓練/` 比對，先命中儀表板上的
「CS · **訓練**賽」磚，點進 CS 頁就再也找不到推進鈕；而且存檔裡沒有人在訓練時，
「推進訓練日」會在 `training.length === 0` 直接 return。兩件都修掉之後才是真的
有觸發結算——**沒有觸發就宣稱「沒有產生假積分」是沒有意義的**。

---

## Q7a-3d 第一條可運作的亞洲巡迴賽（2026-08-13，已 commit 未部署）

3c 把積分機制做完了但**沒有人用**（正式站沒有任何 Circuit 帶政策）。
3d 造出第一條真的會跑的巡迴賽，讓「Event 封存 → 給分 → 跨站累積 → Top 4 晉級」
第一次在真實賽季裡走完。

### 旗標**預設關閉** —— 這是本輪最重要的決定

打開之後新賽季會從 56 場變成 **140 場**（56 + 3×28），玩家每季多打 21 場。
那是產品層級的改變。而且 audit 時就看到 Q3 §5c/§5s 與 Q5 §2b 明文寫著
「新賽季 56 場」——**那些斷言描述的正是預設行為**。

所以我沒有去改它們，而是把旗標預設成 `false`，並**實測**了打開的後果：

| 把 `asiaCircuit` 預設改成 `true` | 結果 |
|---|---|
| `check_competition_q3` | 90 → **87**（掉 3 條） |
| `check_competition_q5` | 66 → **58**（掉 8 條） |

⚠ 實際損害**比 audit 預估的大**：Q5 不只 §2b，連歷史累積那幾條都跟著紅
（多三站之後，以棄權跑完整季的路徑會走不一樣）。這正是「先量再說」的理由。

⇒ **要不要讓新賽季預設有巡迴賽，是產品決定，不是技術上線順手做的事。**
決定要開的話，那 11 條斷言要一起重新定義，得單獨一輪。

開啟方式：旗標改 `true`，或網址 `?asiaCircuit=1` 單次試玩。

### 形狀

一條 `circuit:moba:s{N}:asia`，三站各 8 隊單循環（28 場）：

| 站 | 層級 | 倍率 | 賽季日 |
|---|---|---|---|
| 春季站 | regular | 1.0 | 4–26 |
| 夏季站 | major | 1.5 | 32–54 |
| 秋季總站 | championship | 2.0 | 60–82 |

三站都**沒有獎金**（`prizePolicy: null`）、**沒有季後賽**（`expectsPlayoff: false`
——宣告成 true 會讓封存永遠等一個不存在的季後賽）。積分政策直接用 3c 的
`DEFAULT_POINTS_POLICY`，**沒有新增任何數字**。

### 不刻意安排同日多場

同日多場的能力保留著（3b 之後本來就支援），但產生器會主動把**玩家自己**撞到
已有比賽那天的**整個輪次**搬到最近的空日（搬整輪而不是單場，否則賽程會碎成
一天一場、輪次與日期也失去對應）。

實測有效：拿掉這段迴避，玩家立刻出現 4 天同日兩場（第 6/54/66/72 天）。

⚠ AI 對 AI 不搬——它們推進天數時自動模擬，撞在一起沒有代價。

### 架構位置

產生器 `competition/asiaCircuit.js` 是純函式，**由 Store 編排**，
`seasonState.js` 完全不知道它的存在（§11f 有守衛）。理由與 3c 相同：
賽季層管賽程與名次，巡迴賽是掛在上面的另一個生命週期。

### 換季：巡迴成果不會消失

`pointsLog` 跟著舊賽季歸零（積分本來就每季重來，Circuit id 綁賽季），
但換季前會先把摘要寫進新的 Store 切片 `circuitHistory`：
各站最終名次與該站得分、最終總分、最終巡迴排名、晉級名單、玩家自己的名次。
只留結論，不留中間計算。冪等，重載後仍在。

### 驗證（`check_q7a_3d_asia_circuit` **65/65**）

端到端實跑：三站打完 → 積分自動結算 24 筆 → 巡迴排名 1..8 全序
（273/233/195/190/153/150/128/98）→ Top 4 資格自動核發 → 資金與獎金帳本
逐元不動 → 換季後摘要進歷史、新賽季積分歸零。

**檢定力實測**：拿掉衝突迴避 ⇒ §4e 紅；旗標預設改 true ⇒ §1a/§6a 紅。

### 全套回歸（無一條斷言被改）

Q1 93／Q2a 112／Q2b 92／Q3 90／Q3.5 65／Q4 68／Q5 66／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／**3d 65**；B2 20／B3 13；
integrity 20；o7 48／o7.1 27；瀏覽器 gate 26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 11.19s`。

---

## Q7a-3e 巡迴積分畫面（2026-08-14，已 commit 未部署）

3c/3d 之後積分、巡迴排名、晉級名單全都算得出來也存得下來，
但玩家在瀏覽器裡**一個字都看不到**。這一輪把它變成看得見的東西。

### 只讀既有資料

`competitionView().circuitPoints`（3c 就有）＋ Store 切片 `circuitHistory`（3d 就有）。
**沒有改任何計算**：積分、名次、晉級名單一個數字都不是畫面算的。

唯一的兩個新欄位都是**傳遞**，不是計算：
`slots`（晉級名額——畫面要畫晉級線就得知道線在第幾名，不讓畫面寫死 4）、
`playerEntries`（玩家自己的積分紀錄，**只是 filter，沒有加總**——
否則只看得到總分，看不出各站表現）。

### 畫面內容

一張 `巡迴積分 CIRCUIT POINTS` 面板：我的名次大數字（在晉級區時整塊轉金色）、
總分與冠軍／前三次數、晉級狀態徽章、三站橫向卡片（狀態色條、倍率徽章、
該站得分與名次）、巡迴榜（前 4 名金色 ＋ 第 4 名下方一條虛線晉級線、
我方那列高亮）、已核發的晉級名單。另一張 `歷屆巡迴 CIRCUIT HISTORY`
顯示換季封存的摘要。

**沒有政策的巡迴賽整塊不出現** ⇒ legacy 存檔畫面與先前逐格相同。

⚠ 誠實界線：資格還沒核發時只寫「暫居晉級區」，**不寫成已晉級**；
`policy_required` 會把**原因**寫出來（「層級 X 沒有對應的積分倍率」），
不用含糊的「未結算」帶過——那會讓人以為只是還沒打完。

### 驗證（`browser_check_circuit_points_ui` **21/21**）

legacy 看不到區塊 → 掛上巡迴賽後三站都「未結算」→ 三站封存後巡迴榜 8 隊、
我的名次與總分與資料層逐值相同、晉級名單、各站得分、×2 倍率徽章 →
歷屆摘要 → `policy_required` 寫出原因 → 手機 390px 不溢出、無未捕捉例外。

⚠ **第 16 條（手機不溢出）連續兩版都是假綠**，值得記下來：
① `document.body.scrollWidth` —— 這個 app 的內容被祖先 `overflow:hidden`
裁掉，body 永遠回報等於視窗寬；
② 「超出視窗且不在可捲動容器裡」—— app 的滾動容器用 `overflow: auto`
（兩軸都是），於是**everything** 都算「在可捲動容器裡」。
兩版塞 1400px 方塊進去都不紅。實測後才找到真正會動的量法：
**滾動容器自己**（基準 390/390，塞了之後 1426/390）。

**其他檢定力實測**：拿掉「只顯示有政策的巡迴賽」過濾 ⇒ 第 1 條紅。

### 全套回歸（無一條斷言被改）

Q1 93／Q2a 112／Q2b 92／Q3 90／Q3.5 65／Q4 68／Q5 66／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／3d 65；B2 20／B3 13；integrity 20；
o7 48／o7.1 27；瀏覽器 gate 26／7／8／20／**21**；
`regress` exit 0、`regress2` 8/8、`build` `built in 10.95s`。

⚠ `asiaCircuit` 旗標**維持預設關閉**（本輪未動）。要看到這個畫面，
用 `?asiaCircuit=1` 開新局。

### Q7a-3d ＋ 3e 收尾上線（2026-08-14）

| 項目 | 值 |
|---|---|
| `main` | `0961f16` → **`1515e56`**（fast-forward，無 merge commit、無 force） |
| Actions | [31721566357](https://github.com/RayHuang0323/ESMO-/actions/runs/31721566357) — success |
| `asiaCircuit` 旗標 | **維持 `false`**（本輪未動） |
| 合併後全套 | Q1–Q6 全綠、Q7a 5 支全綠、B2/B3、integrity、o7/o7.1、瀏覽器 gate ×5、`regress` exit 0、`regress2` 8/8、`build` `built in 10.01s` |

**正式站 smoke 19/19**（獨立 Chrome profile／port／headless，沒碰日常 Chrome 與正式存檔）：

- bundle 同時含 3d 的「亞洲巡迴賽」與 3e 的畫面字串 ⇒ 兩輪都上線
- **legacy 存檔完全看不到巡迴賽 UI**（56 場、1 賽事、無面板）⇒ 現況不變
- **`?asiaCircuit=1` 開新局真的長出三站**：140 場、4 個賽事，畫面顯示
  「0/3 站結算」、三站都標未結算、且不寫成已晉級
- 注入三站已結算的存檔 ⇒ 巡迴榜前四名、玩家第 6 名 / 150 分、各站得分
  （+15 / +105 / +30）、晉級名單、×2 倍率徽章、歷屆巡迴摘要全部顯示正常
- **積分沒有造成金流**：資金仍是 $1,200,000
- **手機 390px 無水平溢出**（量滾動容器 390/390），巡迴榜與晉級名單仍看得到
- 全程無未捕捉例外

⚠ 下一步是 **3f 賽季基線重新定義**（08 §18），本輪**沒有開始**，
旗標也**沒有打開**。

---

## Q7a-3f 賽季基線重新定義（2026-08-14，已 commit 未部署）

**結論先講：`asiaCircuit` 沒有改成預設 true，因為前置條件沒有全部滿足。**
效能沒問題、legacy 政策沒問題、基線斷言改好了，但有**一個產品層的阻擋**
（見下方「§3 阻擋」），那需要一個我不該替使用者做的決定。

### §1 那 11 條斷言：分類與改寫

先實測列出旗標打開時到底哪些紅——**不是憑上一輪的預估**。

| # | 斷言 | 分類 | 處置 |
|---|---|---|---|
| Q3 §5c | 建得出賽季，56 場 | **B** 被多 Event 架構取代 | 改成聯賽 56 場 ＋ 新增組成不變式 |
| Q3 §5s | 存檔裡 56 場 | **B** | 同上 |
| Q3 §5t | 積分榜計入 engine／forfeited | **B**（範圍） | §5q 改成指名**聯賽**的場次 |
| Q5 §2-1b/2-2b/2-3b | 新賽季 56 場 ×3 | **B** | 改成聯賽 56 場 ＋ 組成不變式 |
| Q5 §2g | 三季賽事識別碼各不相同 | **C** 需重新表達 | **擋住**，見 §3 |
| Q5 §3a/3b/3c/3f | 歷史是完整 FinalStandings | **C** | **擋住**，見 §3 |

**A 類（真正該保留的不變式）就是那個 56 本身**——只是它守的是
「MOBA 官方聯賽 8 隊雙循環」，卻被寫成**全域總數**。改寫後：

```js
fixturesOfCompetition(state, 官方聯賽 id).length === 56   // 真正的不變式
state.fixtures.length === Σ 各賽制的場次                    // 新增：組成不變式
```

第二條**比原本的魔術數字更強**：它抓得到 `stageId` 指不到任何賽制的孤兒場次，
而且賽事增減都不必回來改。⇒ **覆蓋是增加的**：Q3 90 → **91**、Q5 66 → **69**。

改寫後**兩種旗標組態都綠**：旗標關著 91/91、69/69；旗標開著 Q3 **91/91**、
Q5 64/69（剩下 5 條就是 C 類）。

⚠ **實測發現損害比上一輪回報的大**。上一輪只量了 Q3/Q5（因為我只預測到那兩支），
這次全掃：另外還有 **Q3.5 2 條、Q4 crash、Q6 2 條 ＋ crash、3b 5 條、3d 5 條**。
其中 3d 那 5 條是**刻意在驗「旗標預設關閉」**（合理，翻預設時要改成明確驅動旗標）；
3b 那幾條多半是測試自己用 store 建 baseline 被巡迴賽污染；
Q4／Q6／Q5-C 則全部指向同一個根因。

### §2 56 vs 140 場效能：**不是問題**

Node（中位數，3 次）：

| 項目 | 56 場 | 140 場 | 倍率 |
|---|---|---|---|
| 建立賽季 | 0.47 ms | 0.92 ms | 1.96× |
| 整季跑完 | 47.4 ms | 130.4 ms | 2.75× |
| 每日推進 平均 | 0.41 ms | 0.89 ms | 2.17× |
| 每日推進 **P95** | 0.84 ms | **1.75 ms** | 2.08× |
| 每日推進 最大 | 2.71 ms | 4.31 ms | 1.59× |
| 換季 | 1.22 ms | 1.87 ms | 1.53× |
| 存檔大小 | 63 KB | **146 KB** | 2.32× |
| heap 峰值 | 12.8 MB | 22.4 MB | 1.75× |

瀏覽器（Chrome 151，真實 `advanceDay`）：換日 P95 **2.2 ms**、整季 165 ms、無例外。

⇒ 玩家會等的那個互動（換日）**P95 2.2 ms**，離「有感」的 100 ms 還有 45 倍餘裕。
**效能不構成阻擋，本輪不做任何最佳化。**
唯一值得記的是存檔 146 KB（localStorage 上限約 5 MB，還很寬鬆）。

### §3 ⚠ 阻擋：多 Event 賽季的 `state.final` 會退化

`applySealSeason` 在 3b 時就決定了：**多 Event ⇒ 賽季本身不再產生總名次**，
於是 `state.final` 變成 `SeasonSeal.v1`。實測：

| 旗標 | `state.final.schema` | `rows` | `playerRank` | `championTeamId` |
|---|---|---|---|---|
| OFF | `FinalStandings.v1` | 8 列 | 8 | 有 |
| ON | **`SeasonSeal.v1`** | **undefined** | **undefined** | **undefined** |

而 `CompetitionScreen` 直接讀 `final.playerRank`、`final.rows.length`、
`final.championTeamId`，歷屆成績讀 `h.rows[0].name`、`h.playerRank`。
⇒ **旗標一開，賽季結算頁與歷屆成績會顯示「第 undefined 名」。**

這不是斷言措辭問題，是產品行為問題。金流**不受影響**（獎金按 Event 結算，
兩種組態都是 1 筆、$199,000 相同）。

**建議（需要使用者決定，本輪沒有實作）**：`state.final` 改成
**官方聯賽那個 Event 的封存快照**。理由：
① 與本輪核心原則一致——官方聯賽仍是賽季骨幹；
② 不是跨 Event 加總，所以**不觸碰「不做 Season Award」紅線**；
③ 畫面一行都不用改（**不觸碰「不做新的 UI」紅線**）；
④ 3b §5b 本來就要求「`state.final` 就是某個 Event 的快照，沒有兩份真相」——
   這個做法正是它的推廣。

決定之後，C 類 5 條 ＋ Q4／Q6／Q3.5／3b／3d 的紅才有辦法一次收乾淨。

### §4 legacy 政策：**驗過了，沒有被注入**

`check_q7a_3f_baseline` §4／§5（旗標**打開**的情況下）：
舊存檔重載後場次數、賽事數、巡迴賽數、**每一個 fixture id 逐字未變**、
已打過的賽果沒被動到；再呼叫 `ensureCompetitionSeason()` 也不會補上；
舊賽季整季維持舊制（常規賽 56 ＋ 季後賽 4），**換季之後的新賽季才進新制**（140 場）。

⚠ §5a 第一版是**我的測試寫錯**：拿總場次比，量到 60 就以為被注入，
其實是 Q6 的 4 場季後賽。改用常規賽場次表達才對。

### §5 新驗證器 `check_q7a_3f_baseline` **43/43**

把「官方聯賽 56 場才是不變式」釘成可執行斷言，而且**兩種組態都要成立**——
只在一種組態下成立的基線不叫基線。另含三站身分／層級／政策、legacy 政策、
換季進新制、新制整季端到端（積分 24 筆、排名全序、Top 4 資格、不碰錢、
換季摘要），以及 §7 把上面那個阻擋**釘成斷言**（釘住現況，不是宣稱現況是對的）。

### §6 全套回歸（旗標維持 false）

Q1 93／Q2a 112／Q2b 92／**Q3 91**／Q3.5 65／Q4 68／**Q5 69**／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／3d 65／**3f 43**；B2 20／B3 13；
integrity 20；o7 48／o7.1 27；瀏覽器 gate 21／26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 9.77s`。

---

## Q7a-3f.1 生涯主要賽事成績相容層（2026-08-14，已 commit 未部署）

架構決策（使用者定案）：**Season-level 的 `state.final` 與 Event-level 的
FinalStandings 不得再混在一起。** 單 Event 維持 `FinalStandings.v1`、
多 Event 維持 `SeasonSeal.v1` —— 這一輪**一個字都沒改**。

於是「我這一季在官方聯賽第幾名」需要一條明確的路。

### Schema：`careerEventId`

賽季狀態新增一個欄位（**只是一個 id 指標，不是鏡像**）：

```js
careerEventId: string | null   // 這一季的生涯主要 Event
```

- **建立時直接寫入**（`createSeasonState`）——建立者當下就知道是哪一個
- **不從 organizer／tier／idScheme／expectsPlayoff／prizePolicy／名稱／陣列順序推斷**
  （audit 過：那些沒有一個真的表示「角色」，`tier` 甚至當場二義——
  亞洲巡迴春季站也是 `regular`）
- 與 `activeEventId` 是**兩件事**：那是畫面聚焦、玩家可切換；這是生涯主線
- 換季時新賽季照樣寫入（走同一條建立路徑）

### Migration：無歧義才回填

- 只有一個 Event ⇒ 回填那一個
- **多個 Event 卻沒有這個欄位 ⇒ 留 `null`，不猜**
- v1 → v2 形狀升級同時回填；**冪等且保參考**（欄位已存在就原樣回傳同一個物件）

### Accessor：fail-closed

`careerFinalStandingsOf(state)`（strict，取不到 **throw**）／
`tryCareerFinalStandingsOf(state)`（optional，回 `null`）。
**指標缺失或壞掉時都不退而求其次挑別的 Event。**

`validateSeasonScope` 增加 `career_event`：指到不存在的 Event 才算錯，
**`null` 不算錯**（那是舊存檔的曖昧情形，由 accessor fail-closed 接住）。

### 畫面改走 accessor

`CompetitionScreen` 的最終名次面板與歷屆成績不再直讀
`final.rows` / `final.playerRank` / `final.championTeamId`。
取不到生涯成績時顯示「—」與「（生涯主要賽事尚無資料）」，不 crash。

歷屆成績也改存**生涯成績**：`rollToNextSeason` 的 `archived` 從
`state.final` 改成生涯 final。⚠ 單 Event 時兩者是**同一個物件**
（`applySealSeason` 本來就拿它當賽季 final）⇒ **legacy 逐位元不變**。

### 驗證

`check_q7a_3f1_career_final` **42/42** ＋ `browser_check_career_final_ui` **12/12**。

畫面 gate 證明的是 3f 量到的那個阻擋真的消失了：多 Event 時
`state.final` 仍是 `SeasonSeal.v1`，但名次欄位顯示的是**官方聯賽**的名次。

⚠ 又抓到一次假綠，而且是同一個家族：原本用「整頁不含 undefined」當證據——
**React 把 `undefined` 渲染成空白，不是字串**。實測把畫面改回直讀
`final.playerRank`，全頁掃描照樣綠（名次那格只是變空的），連「包含 —」
也照樣綠（獎金那列本來就有一個）。改成**結構化讀出名次欄位那一行**
才有檢定力：變異時讀到「／ 8 隊」⇒ 紅。

另有一條 §4e 是**測試自己造了一份現實不存在的 v1 存檔**（刪了容器卻留著
`idScheme`／`eventId`，於是身分升級判成「已升級」而不重建容器）。

### 旗標開著時的剩餘清單（**逐條重驗過**，旗標仍為 false）

| 驗證器 | 3f 之後 | **3f.1 之後** | 性質 |
|---|---|---|---|
| Q3 | 3 紅 | **0** | 已收 |
| Q5 | 5 紅 | **1**（§2g） | `sealedIds` 收 `final.id`，SeasonSeal 沒有 id ⇒ 改讀生涯 final 的 id |
| Q4 | crash | crash | 讀 `state.final.rows` ⇒ 改讀生涯 final |
| Q6 | 2 紅＋crash | 2 紅＋crash | 同上（`rankSource`／`championTeamId`／`rows`） |
| Q3.5 | 2 紅 | 2 紅 | 測試拿 `today`（可能是巡迴賽場次）⇒ 要指名聯賽場次 |
| 3b | 5 紅 | 7 紅 | 測試用 store 建 baseline 被巡迴賽污染 |
| 3d | 5 紅 | 5 紅 | **刻意**在驗「旗標預設關閉」，翻預設時改成明確驅動旗標 |

⇒ 生涯成績這條路已經通了；剩下的都是**測試表達**問題，不是產品行為問題。

### 全套回歸（旗標維持 false）

Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／3d 65／3f 43／**3f.1 42**；
B2 20／B3 13；integrity 20；o7 48／o7.1 27；
瀏覽器 gate **12**／21／26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 14.19s`。

---

## Q7a-3f.2 asiaCircuit 正式預設開啟（2026-08-14，已 commit 未部署）

**`src/featureFlags.js` 的 `asiaCircuit` 已改為 `true`。**
新賽季正式包含亞洲巡迴賽三站；`?asiaCircuit=0` 是逃生口，不需改程式也不需重新部署。

### 逐條記錄：原本守什麼 → 為何不再精確 → 現在守什麼

| 斷言 | 原本守什麼 | 為何在多 Event 世界不再精確 | 現在守什麼 |
|---|---|---|---|
| **Q5 §2c/§2g** | 三季的 `final.id` 各不相同 | `state.final` 多 Event 時是 `SeasonSeal.v1`，**沒有 id** ⇒ 三個都 undefined | 三季的**生涯主賽事** FinalStandings id 各不相同，且都存在 |
| **Q4 §2b** | `!!final` ＋ `final.playerRank` | 前者是賽季封存、後者是名次，多 Event 時是**兩個物件** | 賽季有封存（`view.final`）**且**生涯名次取得到（`view.careerFinal`） |
| **Q4 §2b2–2b5、§2e、§3a–§3e** | 把 `view.final` 當 FinalStandings 用 | 同上 | 一律改讀 `view.careerFinal` |
| **Q4 §2c** | 重複封存不覆寫，比對名次 JSON | 比對對象搞混了：這條驗的是**賽季封存**不被覆寫 | 與**賽季封存物件**比對；名次那份交給 §2c2／§2e |
| **Q6 §4h–§4m** | 季後賽決定的最終名次（讀 `v.final`） | 季後賽決定的是**官方聯賽這個 Event** 的名次 | 改讀 `v.careerFinal`，斷言內容一字未減 |
| **Q6 §5b/§5c** | 歷史第一筆 == `s1Final` | 3f.1 之後歷史存的是生涯成績 | `s1Final` 改成 `v.careerFinal` |
| **Q6 §5f** | 賽季層理由字串含「季後賽」 | 多賽事時賽季層只會說「還有 N 個賽事沒有封存」——那是對的，只是不再是這條要守的東西 | **官方聯賽這個 Event** 封不了，且理由是季後賽（賽季自然也封不了） |
| **Q3.5 §3b/§3c** | 三種賽果都進積分榜（拿 `today` 任一場） | `today` 是**當日清單第一場**，可能是巡迴賽的比賽 ⇒ 聯賽榜上什麼都沒有 | 明確 scope 到官方聯賽的場次（`advanceToLeagueFixture`） |
| **3b 全檔** | 同季多賽事並存的**形狀**（用它自己合成的盃賽） | 亞洲巡迴賽是另一個變數，一開就變成 5 個 Event，legacy 情境全毀 | 檔頭明確 `?asiaCircuit=0`——不是為了讓燈變綠，是為了讓這支測的還是原本那件事 |
| **3d §1a/§1b/§1c** | 旗標**預設關閉** | 基線（3f）與生涯成績相容層（3f.1）完成後，前提已翻面 | **預設開啟**；`?asiaCircuit=1` 明確打開；**`?asiaCircuit=0` 是逃生口** |
| **3d §6** | 旗標關著 ⇒ 現況逐場不變 | 「現況」已經是新制 | ① 預設新局就是 140 場／4 賽事，**官方聯賽仍 56 場**　② `?asiaCircuit=0` 建得出完整舊制新局（＋ 舊制也有 careerEventId） |
| **3d §7** | 用「當時預設剛好是關的」建舊存檔 | 預設值已翻面 | 用**明確關閉**建舊存檔，再打開旗標重載 |
| **3f §1a** | 「本輪未啟用」 | 前置條件已全部完成 | 預設為 `true` |
| **5 支 browser gate** | 用頁面預設值建情境 | 預設翻面後，各自的情境被巡迴賽污染 | **旗標狀態寫進網址**（`?asiaCircuit=0`），情境明確 |

⇒ **沒有刪除或弱化任何一條斷言**；總檢查數反而增加
（3d 65 → **67**，另新增 `browser_check_default_scheme` **15**）。

### ⚠ 一個 production 讀取點（不是測試問題）

`competitionView().award` 用 `state.final.id` 查獎金收據。獎金是按 **Event**
結算的，收據的冪等鍵是**那個 Event 的 FinalStandings id**；多 Event 時
`state.final` 是 SeasonSeal（沒有 id）⇒ **錢明明發了，畫面卻顯示「—」**。

這是 3f.1 漏掉的同一族讀取點（`final.rows`／`playerRank`／`championTeamId`
那一批有改，收據那一條沒有）。已改成用生涯 final 的 id 查。
⚠ **金額與帳本完全沒動**——錯的只有「查不查得到收據」。
單 Event 時兩者是同一個物件 ⇒ legacy 逐值不變。

### 新增：預設路徑的畫面 gate

其他 gate 為了守住各自情境全部改成 `?asiaCircuit=0`，結果**沒有任何 gate
在走玩家真正會走的那條路**。新增 `browser_check_default_scheme` **15/15**：
不帶參數開新局 ⇒ 140 場／4 賽事／聯賽 56 場、巡迴區塊出現、無 undefined；
整季封存 ⇒ `state.final` 是 SeasonSeal 但生涯名次取得到（第 8 名）；
換季後仍是新制；`?asiaCircuit=0` 建得出舊制；
**舊制存檔在預設下重載逐 id 不變**；全程無例外。

### 全套回歸（**預設 `true`**）

Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／**3d 67**／3f 43／3f.1 42；
B2 20／B3 13；integrity 20；o7 48／o7.1 27；
瀏覽器 gate **15**／12／21／26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 11.77s`。

### Q7a-3f / 3f.1 / 3f.2 收尾上線（2026-08-14）

| 項目 | 值 |
|---|---|
| `main` | `051ecb6` → **`11a4ac1`**（fast-forward，三個 commit，無 merge commit、無 force） |
| Actions | [31730891948](https://github.com/RayHuang0323/ESMO-/actions/runs/31730891948) — success |
| `asiaCircuit` | **`true`**（正式預設開啟；`?asiaCircuit=0` 為逃生口） |
| 合併後全套 | Q1–Q6 全綠、Q7a 7 支全綠、B2/B3、integrity、o7/o7.1、瀏覽器 gate ×7、`regress` exit 0、`regress2` 8/8、`build` `built in 11.29s` |

**正式站 smoke 22/22**（獨立 Chrome profile／port／headless）：

- 不帶參數開新局 ⇒ **140 場 / 4 賽事 / 官方聯賽 56 場**，有 careerEventId
- **巡迴積分 UI 正常出現**，全頁無 undefined
- 注入已封存的新制存檔 ⇒ `state.final` 是 **`SeasonSeal.v1`**，
  而畫面名次欄位顯示「8」、冠軍「暗影狼群」、「／ 8 隊」
- **獎金收據查得到**（顯示「無（前四名才有）」而不是「—」）
  ⇒ 3f.2 修的那個讀取點在正式站也對
- 在畫面上按「▶ 開始第 2 賽季」⇒ **換季後仍是新制**（第 2 季 / 140 場 / 聯賽 56 場）
- `?asiaCircuit=0` 建得出舊制新局（56 場 / 1 賽事），畫面看不到巡迴區塊
- **舊制存檔在預設（新制）下重載：逐 fixture id 不變**
- 手機 390px 無水平溢出（容器 390/390）、全程無未捕捉例外

⚠ smoke 第一版 §8/§10 紅是**讀取順序寫錯**：賽季是進賽事頁時才建立的
（`ensureCompetitionSeason`），我卻先讀存檔 ⇒ 每個欄位都是 undefined。
§1 的順序本來就是對的，§2 寫反了。

### 玩家端的實際變化

正式站**新開的局就是 140 場**（每季多打 21 場）。既有存檔當季不受影響，
換季之後才進新制。要回退：網址加 `?asiaCircuit=0`，不必改程式也不必重新部署。

---

## Q7b 亞洲年度總決賽（2026-08-15，已 commit 未部署）

三站巡迴賽 → Circuit Points → Top 4 資格 → **亞洲年度總決賽** → 年度冠軍。
資格終於有了消費端。

### ⚠ 開工前先講一件事：工作樹被系統清掉過一次

做到一半發現 `tools/*.mjs` 全失蹤、`src/platform/contracts/` 全空、`.git` 不見。
`git worktree list` 顯示 **8 個 scratchpad worktree 全部 `prunable`** ——
整個 `AppData\Local\Temp\claude\...` 被系統清理了，不是操作造成的。

**已 commit 的工作一行都沒丟**（`origin/main` 在 `ac50790`）。
從 `origin/q7a/3b-multi-event` 重建工作樹後繼續。
⚠ 緩解措施：worktree 的 commit 物件會寫進 **D: 主 repo 的 `.git`**，不在 temp ⇒
**盡早 local commit** 就能保住工作。本輪照做了。

### 三個 audit 的結論（都有實測）

| 問題 | 結論 |
|---|---|
| `pointsPolicy = null` 會不會阻塞封存？ | **不會。** `canSealSeason` 只看「每個 Event 有沒有 final」，與積分無關。實測 `canSealSeason` 的 reason 是「還有 N 個賽事沒有封存」，不是缺政策。 |
| Q6 的季後賽能不能重用？ | **能，而且是完全參數化的。** `createPlayoffStage` 直接吃得下 `CircuitQualification.v1`（它的 `seed` 就是巡迴名次），`ensurePlayoffFixtures` 產出 sf1=1v4、sf2=2v3、季軍戰、決賽。**本輪沒有寫任何對戰表邏輯。** |
| 獎金政策能不能沿用既有表？ | **沿用＝替年度總決賽訂一份金額，那是產品決定** ⇒ 本輪 `prizePolicy: null`（與三站一致），不新增任何數字。要發獎金請另外決定。 |

### 資料流

```
巡迴賽三站封存 → settleAllPendingPoints → grantAllReadyQualifications
   → state.qualifications["qual:circuit:…:asia:championship:top4"]
   → ensureAsiaFinals（只讀這一份）→ createPlayoffStage(qualification)
   → sf1 / sf2 →（打完）→ bronze / final → Event.final → 年度冠軍
```

**資格是唯一門檻**：`asiaFinals.js` 沒有 import `circuitStandings`／`pointsLogOf`，
也沒有讀它們（§12b 有守衛）。實測：把 `pointsLog` 清空、巡迴榜歸零，
參賽名單一個字都不變；把資格拿掉、積分榜完好，**建不出來**。

### 賽制與容器

4 隊單淘汰、1v4／2v3、**有季軍戰**（不是額外做的——共用程式碼本來就會排，
而 `isPlayoffDoneOf` 要求四場都收尾才算結束；刻意拿掉反而要改共用程式碼）。

**年度總決賽有自己的 circuit（`asia-finals`），不是巡迴賽第四站。** 兩個理由都量過：
① `canGrantCircuitQualification` 要求 circuit 底下每一站都已結算，
而年終賽封存後是 `policy_required` ⇒ 放同一條就會產生「靠呼叫順序才安全」的耦合；
② `summarizeCircuitSeason` 會把每個 Event 列進歷史，放同一條會多出一站空紀錄。

⚠ `stage` 與 `playoff.stage` **刻意是同一個賽段**：`standingsOf` 讀前者（封存需要
rows），`playoffOrder` 讀後者（冠軍由決賽勝方決定，不是由勝場數推）。指同一個
賽段 ⇒ 沒有第二份真相。

### 排程

排在**所有既有場次之後 +6 天**。聯賽季後賽在「最後一場常規賽 +2／+4」，
用 +6 不論它排了沒有都不會撞，也不必回頭查它排在哪。

### 驗證（`check_q7b_asia_finals` **72/72**）

18 項驗收全數涵蓋。**檢定力實測**：
- 改成從積分榜取前四（而不是資格）⇒ §1e／§7c／§12b 紅
- `expectsPlayoff` 改成 false ⇒ §8d2 紅

⚠ 中途發現自己的兩條保護**互為冗餘**：拿掉「封存前補場次」或拿掉
`expectsPlayoff`，另一個都還接得住，所以兩個變異都不紅。
我在程式碼註解裡寫的「這個呼叫點是必要的，不是保險」**是錯的**，已改成
誠實說明哪一個才是單獨可失效的，並補上 §8d2 直接驗 `expectsPlayoff`
（只剩兩場準決賽、都收尾——最危險的那一刻）。

### 改到的既有斷言（1 條）

`browser_check_career_final_ui` §2 原本寫死 `events === 4`（聯賽＋三站）。
Q7b 之後打完的賽季是 **5 個**賽事。真正要守的是「多 Event 時 `state.final`
仍是 `SeasonSeal.v1`」，賽事幾個不是重點 ⇒ 改成「多於一個」並把組成寫進說明，
日後再加賽事也不必回來改。**沒有減少覆蓋。**

### 全套回歸

Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／3d 67／3f 43／3f.1 42／**Q7b 72**；
B2 20／B3 13；integrity 20；o7 48／o7.1 27；
瀏覽器 gate 15／12／21／26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 16.16s`。

### Q7b 收尾上線（2026-08-15）

| 項目 | 值 |
|---|---|
| `main` | `ac50790` → **`3555314`**（fast-forward，無 merge commit、無 force） |
| Actions | [31843274082](https://github.com/RayHuang0323/ESMO-/actions/runs/31843274082) — success |
| 合併後全套 | Q1–Q6 全綠、Q7a 7 支全綠、**Q7b 72/72**、B2/B3、integrity、o7/o7.1、瀏覽器 gate ×7、`regress` exit 0、`regress2` 8/8、`build` `built in 12.95s` |

**正式站 smoke 32/32**（獨立 Chrome profile／port／headless）。
存檔由**真實的 production 路徑**在 Node 造好再注入 ⇒ 畫面與存檔拿到的是真資料。

- 新局仍是**預設亞洲巡迴新制**（140 場 / 4 賽事）
- **三站未完成 ⇒ 沒有資格、也沒有年度總決賽**（fail-closed，不先開一個空的）
- 三站封存 ⇒ 資格核發（seed 1–4）、**年度總決賽自動建立**且自己一條 circuit
- **participants 與 qualification 逐 teamId 相同（含順序）**；**第 5 名進不來**
- **sf1 = 1v4、sf2 = 2v3**，一開始只有兩場準決賽
- 準決賽收尾 ⇒ 補出季軍戰與決賽；**四場沒打完 `Event.final` 不存在**
- 四場打完 ⇒ `Event.final` 是 `FinalStandings.v1`、`rankSource: playoff`、
  **年度冠軍＝決賽勝方（寒冰守衛）且必為四支晉級隊伍之一**
- **`state.final` 仍是 `SeasonSeal.v1`**、**`careerEventId` 仍指官方聯賽**
- **年終賽不產生 Circuit Points**（帳本仍 24 筆）、**不發獎金**
  （獎金帳本只有官方聯賽那一筆）
- 官方聯賽常規賽仍 56 場；**舊制存檔在預設下重載沒有被插入年終賽**
- 無 undefined、全程無未捕捉例外

⚠ 第一版 smoke 漏了兩項你列的（打完的 `Event.final`、`state.final` 維持
SeasonSeal），已補第三份存檔（四場打完＋整季封存）驗到 ⇒ 25 → 32 條。

---

## Q7c 年度總決賽 UI（2026-08-16，已部署）

資格終於有了畫面。三站巡迴賽 → 積分 → Top 4 資格 → 年度總決賽 → 年度冠軍，
整條鏈玩家在瀏覽器裡看得到了。

**分工**：Claude 主控（規格、review、驗證），**UI 實作交給 Codex**
（`gpt-5.6-luna` / `xhigh`），Claude 不自己重寫 UI。

| 項目 | 值 |
|---|---|
| `main` | `03f9575` → **`5ba2333`**（fast-forward，五筆，無 merge commit、無 force） |
| Actions | [31894225623](https://github.com/RayHuang0323/ESMO-/actions/runs/31894225623) — success |
| 合併後全套 | Q1–Q6 全綠、Q7a 7 支、Q7b 72、B2/B3、integrity、o7/o7.1、瀏覽器 gate ×8、`regress` exit 0、`regress2` 8/8、`build` `built in 13.31s` |

### 五個 commit

| SHA | 內容 |
|---|---|
| `94b7ac3` | Q7c 規格（先寫規格再實作） |
| `8cbf794` | 第一輪：結構實作 ＋ `browser_check_asia_finals_ui` 15 條 |
| `d4cf10d` | 註解錯字修正（見下） |
| `4d39747` | 視覺 Polish 附錄 |
| `5ba2333` | 第二輪：視覺 Polish |

### 資料層只多一個唯讀投影

`competitionView().asiaFinals` 由**既有函式**組成
（`asiaFinalsEventOf` / `canOpenAsiaFinals` / `isAsiaFinalsDone` / `playoffBracket` /
`playoffOrder` / `eventFinalOf` / `absoluteDayOf`）。
UI 目錄 grep 不到任何計算函式——積分、晉級、勝方、名次都不是畫面算的。

### 三條語意紅線（都有 gate 守著）

1. **`Event.final` 是年度冠軍唯一真相**：`AnnualChampionBanner` 第一行
   `if (!final) return null`，冠軍由 `championTeamId` 找。**打完決賽但 Event 未封存
   不會提前出現冠軍**。
2. **`view.final` 是 `SeasonSeal.v1`**，年度榮耀區塊完全不讀它。
3. **`careerEventId` / `careerFinal` 是官方聯賽生涯成績**，與年度冠軍分開呈現。

### 視覺：金色是稀缺資源

`.af-panel` 的外框由金色改為中性；金色只留給晉級區、冠軍、**冠軍之路**。

**Signature 冠軍之路**：`championId = asiaFinals.final?.championTeamId ?? null`，
`onPath = !!championId && match.winner === championId`。
`final` 為 null ⇒ 整條路徑不存在。用**新的** `.af-match-onpath`，
`.af-match-champion`（語意是「這是決賽」）未被覆寫。

**種子 ①②③④** 以 `teamId` 對 `qualified` 查表取得（純顯示層 join，
`playoffBracket` 與 `asiaFinals` 資料形狀一行未動），一致出現在晉級卡、
對戰卡雙方、冠軍名次列。

**文案**改成明確資訊：「決賽對手將在兩場準決賽結束後排定」取代「等準決賽結果」。

**Desktop** 兩欄對戰樹（季軍戰獨立一列）；**Mobile 390px** 垂直四場列表，
不把桌機樹硬塞進去。

### gate 的改動全是加強，沒有弱化

| 條目 | 變更 |
|---|---|
| #3 | 加驗種子標記，並擴及對戰卡雙方 |
| #6 | 待定文案換成新字串，**仍保留**「待定」與「無假對戰組合」 |
| #8 | **新增** `pathMatches === 0`——冠軍未產生時不得有任何冠軍路徑 |
| #10 | 加驗名次列的種子 |

### 驗證（Claude 獨立重跑，不採信 Codex 回報）

`browser_check_asia_finals_ui` **15/15**；全套回歸零下降。

**變異測試（Claude 自己做）**：
- `final=null` 時用已完成的準決賽勝方造路徑 ⇒ **#8 紅**
- 塞 900px 固定寬元素 ⇒ **#13 紅**（`925/390`，量滾動容器）
- 把第 1 種子對成 3 ⇒ **#3 與 #10 同時紅**

⚠ 我第一次寫變異①時拿**決賽**勝方當替代來源，但那份存檔裡決賽還沒打
（winner 為 null）⇒ 沒造出路徑、自然不紅。**變異本身無效**，改用已完成的
準決賽才測得到。

### 正式站 smoke **25/25**

資格未核發整塊不出現／種子 ①②③④ 正確／sf1 1v4、sf2 2v3／未完成時無冠軍橫幅
且 **onPath 為 0**／`Event.final` 出現後冠軍正確（寒冰守衛）／**冠軍之路恰好兩場
（sf1 ＋ final）且都是冠軍贏的**／非冠軍已完成比賽 opacity 0.62 仍可讀／
Desktop 樹可見手機列表隱藏／Mobile 390px 反之且容器 390/390 無溢出／
`state.final` 仍 SeasonSeal、`careerEventId` 仍指官方聯賽／無未捕捉例外。

⚠ smoke 第一版 #13/#22 紅是**斷言寫錯**：DOM 裡同時有桌機與手機兩套佈局
（一套 CSS 隱藏），卡片是 8 張不是 4 張，`length === 2` 當然不成立。
以 match key 去重才對——**不是 UI 有問題**。

### 順手修掉的既有錯字（`d4cf10d`）

`profileStore.js` 的 Q7b 註解有三個錯字：冇等→冪等、晶級→晉級、唱一→唯一。
成因是我在 `3555314` 用 Python heredoc **手寫 unicode escape 打錯**
（`\u5187` 應為 `\u51AA` 等），已隨那次部署上線。純註解、無功能影響。
同一輪用 Edit 工具寫的註解都正確——**不要用 escape 拼中文**。

### 尚未做

年度總決賽仍**沒有獎金**（金額是產品決定）；年度冠軍**還沒有下游消費端**
（沒有 Season Award、沒有生涯成就）。

---

## Q7d 生涯榮耀（2026-08-16，已 commit 未部署）

`Event.final` → 年度冠軍 → **Career Honors** → 歷屆紀錄。
年度冠軍終於有了長期下游消費端。**資料層由 Claude 做，本輪不做 UI。**

### Audit：既有三層都承載不了

| 候選 | 為什麼不行 |
|---|---|
| `competitionHistory` | 存 `FinalStandings`（官方聯賽名次），Q5／Q6 對它的形狀有斷言。塞別種東西會讓「歷屆成績」變成兩種型別 |
| `circuitHistory` | 存巡迴積分摘要。年度總決賽**刻意不在巡迴賽那條 circuit**（Q7b：自己一條、無積分政策），`summarizeCircuitSeason` 對它回 null |
| `processedCompetitionAwards` | 是**錢**的冪等帳本 |

而且**前兩者都只在換季時寫入、上限 20 季** —— 年度冠軍是在
`_sealSeasonIfFinished` 就產生的，等換季才記＝玩家不換季就沒有榮耀。

⇒ **榮耀自己一層**：新的 Store 頂層切片 `honors: []`，**不設上限**
（一季一筆小物件，與那兩個存整張名次表的 history 不同；榮耀被裁掉＝歷史被改寫）。

### 資料流

```
年度總決賽四場打完 → applySealEvent → Event.final（含 championTeamId）
  → _recordHonors（冪等 sweep）→ honors[] ← 唯一真相
  → annualChampionsOf / teamHonorCount / latestAnnualChampion（全部推導）
```

**唯一來源是 `Event.final`**：`honors.js` 沒有 import 也沒有讀
`playoffBracket` / `playoffOrder` / `circuitStandings` / `pointsLogOf` /
`standingsOf` / SeasonSeal（§11b 有守衛）。每筆帶 `sourceFinalId`。

### 冪等靠 id 而不是內容比對

`honor:{honorType}:{gameMode}:s{season}` —— **一季一個項目就只有一個年度冠軍**，
這件事編碼進 id，重複寫入在 id 這一層就被擋。

### 兩個寫入時機，缺一不可

1. **`_sealSeasonIfFinished`** —— 年度總決賽封存的當下就記，玩家不必換季。
   放在賽季封存判定**之前**（那一行可能因「還有賽事沒結束」提早 return）。
2. **`rollToNextCompetitionSeason`** —— 補住「賽季早就封存、之後沒再推進天數
   就直接按換季」的存檔。**換季之後來源就消失了，補不回來。**

### legacy / migration：只補看得見來源的

載入時**不回填**（回填需要當季的 `Event.final`，換季後就不存在）。
真正的補寫由上面兩個 sweep 負責。舊制存檔（沒有年度總決賽）
**永遠不會產生榮耀**，不猜、不補假的。

### accessor（全部推導，不落盤索引）

`annualChampionsOf` / `latestAnnualChampion` / `teamHonorCount` /
`honorsOfSeason` / `hasAnnualChampionHonor` / `validateHonors`，
外加 `competitionView().honorsView`（歷屆冠軍、最近一季、我拿過幾次）。

⚠ **玩家拿過幾次是算出來的，不另存計數** —— 存了就會與清單漂移。

### 世界歷史，不是玩家的獎盃櫃

冠軍是 AI 隊伍照樣寫（§6 實測 S1 寒冰守衛、S2 烈焰鳳凰都是 AI）。

### 驗證（`check_q7d_honors` **59/59**）

**檢定力實測**：
- Event 未封存也發榮耀（改用準決賽勝方）⇒ **§1c／1d／2d／2e 紅**
- id 不含賽季 ⇒ **§2g／2h／3a／3b 紅**（一季一筆的保證消失）
- `teamHonorCount` 多算一次 ⇒ **§5c／5d／6c 紅**

### 全套回歸

Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57；
Q7a safety 18／3a 29／3b 51／3c 69／3d 67／3f 43／3f.1 42／Q7b 72／**Q7d 59**；
B2 20／B3 13；integrity 20；o7 48／o7.1 27；
瀏覽器 gate 15／15／12／21／26／7／8／20；
`regress` exit 0、`regress2` 8/8、`build` `built in 12.13s`。零下降。

### 尚未做

**沒有榮譽櫃 UI**（資料層已備妥 `honorsView`，下一輪可交 Codex）。
年度總決賽仍**沒有獎金**（榮耀與獎金分離，金額是產品決定）。

### Q7d 收尾上線（2026-08-16）

| 項目 | 值 |
|---|---|
| `main` | `ccf80c6` → **`375b0e7`**（fast-forward，單筆，無 merge commit、無 force） |
| Actions | [31896620848](https://github.com/RayHuang0323/ESMO-/actions/runs/31896620848) — success |
| 合併後全套 | Q1–Q6 全綠、Q7a 7 支、Q7b 72、**Q7d 59**、B2/B3、integrity、o7/o7.1、瀏覽器 gate ×8、`regress` exit 0、`regress2` 8/8、`build` `built in 11.87s` |

**正式站 smoke 27/27**（獨立 Chrome profile／port／headless）。
存檔由真實 production 路徑造好再注入；本輪沒有 UI，驗的是資料層在正式 bundle 上的行為。

- 年度總決賽**未完成 ⇒ honors 不新增**（`Event.final` 為 null、honors 0 筆）
- `Event.final` 出現後**自動 1 筆** `asia_annual_champion`，
  `championTeamId` 與 `Event.final` **完全一致**，`sourceFinalId` 逐字等於 `Event.final.id`
- **AI 冠軍照樣寫**（兩季冠軍都是 AI，玩家 0 次）
- **重載 3 次 ＋ 重跑結算路徑，honors 逐字不變**
- 換季後第 1 季 honor 仍在；第 2 季**累積為 2 筆**、新的在前、兩筆 id 與來源各自綁自己那一季
- `teamHonorCount` 兩支 AI 各 1、玩家 0；`latestAnnualChampion` 是第 2 季
- `careerEventId` 仍指官方聯賽、`competitionHistory` 仍只有 `FinalStandings.v1`、
  `circuitHistory` 仍只有 `CircuitSeasonSummary.v1`、獎金帳本沒有 `honor:` 開頭的鍵、
  巡迴積分仍 24 筆、`state.final` 仍 `SeasonSeal.v1`
- 無 undefined、全程無未捕捉例外

**⚠ 正式站驗到了「舊存檔補寫」那條路徑**：注入 Q7d **之前**造的已封存存檔
⇒ 載入後 honors 是 0 筆（**設計如此，載入不回填**）⇒ 在畫面上按「開始第 2 賽季」
⇒ 換季前的 sweep **把榮耀補寫了**（寒冰守衛），`sourceFinalId` 對得上。
這比任何文件宣稱都有力。

### smoke 途中我自己的三個錯

1. **#21 第一版是空包彈**：拿「兩季累積」那份存檔驗 `state.final` 是 SeasonSeal，
   但它正處於第 2 季進行中、`state.final` 本來就不存在，而斷言又允許 `null` 通過。
   改用已封存的存檔才真的驗得到。
2. **#21b 第一版斷言錯了方向**：以為載入就該回填。**載入本來就不回填**——
   那是刻意的（回填需要當季的 `Event.final`，換季後就沒了）。改成分別驗
   「載入不回填」與「換季 sweep 會補寫」，兩件事都成為事實。
3. **正則被 template literal 吃掉**：`/開始第 \d+ 賽季/` 寫在 template literal 裡，
   反斜線 d 被吃成 `d`，永遠找不到按鈕。改用 `[0-9]+`。
   ⚠ 同一段註解裡用反引號又提前關掉 template literal——**這輪踩了兩次**。

---

## Q7e 戰隊榮譽 UI（2026-08-16，已部署 main `b56c3ef`）

Q7d 把年度冠軍寫成了世界歷史，但**沒有畫面**。本輪把它做出來：
戰隊詳情頁的 **TEAM HONORS 獎盃銘板牆**。

### 分工

規格與驗收由 Claude 定，UI 實作交 Codex（`gpt-5.6-luna`／`xhigh`），
Claude 獨立 review diff、重跑全套、**自己重做 mutation test**（不採信 Codex 的宣稱）。

| commit | 內容 |
|---|---|
| `a01426e` | Q7e UI 規格（334 行） |
| `a339bd8` | 第一輪結構實作（Codex）：8 檔 +526，純新增 |
| `74c7448` | 視覺 Polish 附錄 |
| `7f24ba7` | 第二輪視覺 polish（Codex）：2 檔 +16/−10 |
| `b56c3ef` | honors subscription 修正 ＋ browser gate #15 |

### 做了什麼

`TeamScreen` 內新增面板（**不新增 Router／page**），五個元件：
`TeamHonorsPanel` / `HonorSummary` / `LatestChampionCard` /
`ChampionHistoryList` / `ChampionHistoryItem`。

**資料層只動一行**：`honorsView` 投影加 `myTeamId`。
UI 只讀 `competitionView().honorsView`——不碰 `s.team.id`、不排序、不算次數、
不顯示 `earnedAtDay`。

**Signature：獎盃銘板牆**。歷屆冠軍不是 card list，是刻在獎盃底座上的一排金屬銘板：
`gap: 1px` ＋ `background: GC.line` 讓縫隙露出底色當**刻線**，
row 去掉各自的 border 與圓角，改用 `inset 0 1px 0 GC.bg, inset 0 -1px 0 GC.line` 做**壓印**
（不是外擴陰影）。Season 用既有 `MONO`，隊名 11px→15px 升為主視覺。
**AI 冠軍鋼灰但完整可讀**（這是世界歷史，不是玩家的獎盃櫃），
**玩家自己的用 `GC.gold` 刻痕 ＋ 左側金軸 ＋ `z-index` 抬一階**。

⚠ **金色的紀律**：`data-has-honors` 由 **`hasMine`** 驅動，
**不是** `annualChampions.length > 0`。「世界已有冠軍」≠「玩家有冠軍」。
21 處 `GC.gold` 全部掛在 `-mine` 或 `data-has-honors="true"` 之下——**任何金色都追溯得到玩家**。

### ⚠ 本輪最重要的一件事：8 條 gate 全綠，卻藏著一個真缺陷

第二輪 Codex 依規格 §O 把 `getState()` 改成訂閱，寫的是：

```js
useProfileStore((s) => s.competition);
```

但 `honorsView` 讀的是 `get().honors`（`profileStore.js:1174`），
而 **`honors` 是與 `competition` 平行的頂層 slice**（`:245`），
`_recordHonors` 做的是 `set({ honors })`（`:698`）——**完全不碰 `competition`**。

寫探針實測（不是只讀程式碼推論）：

```
set({honors}) 之後：
  訂閱 s.competition 觸發重繪次數 = 0
  訂閱 s.honors      觸發重繪次數 = 1
```

**Codex 回報「§K–P 均已完成」，與事實不符。**

**為什麼 8 條 gate 抓不到**：它們每次都重新導頁，讀到的資料本來就是新的。
⇒ 新增 **gate #15**：面板**已掛載**時直接 `setState({ honors })`，
不導頁、不 reload，要求 DOM 追上。
變異回 `s.competition` ⇒ `列數 1→1（view 2）`，store 兩筆、畫面一列——正是缺陷的形狀。

**沒有加 `s.team?.id` 訂閱**：`team` 在執行期沒有任何寫入點
（只有 DEFAULT `:155`／序列化 `:327`／`_hydrate` `:343`／reset `:1844`），
唯一會改它的 `_hydrate` 同時也寫 `honors` ⇒ 已被涵蓋。多訂一條是沒有依據的冗餘。

### Mutation test（Claude 自己做，每次先 grep 確認變異落地）

| 變異 | 結果 |
|---|---|
| 玩家銘板判斷恆 `true` | 🔴 #4 |
| `myAnnualChampionCount` +1 | 🔴 #5／#6／#7 |
| 歷屆清單反排 | 🔴 #3／#9 |
| 900px 固定寬元素 | 🔴 #11（`925/390`） |
| 訂閱改回 `s.competition` | 🔴 **#15**（`列數 1→1（view 2）`） |
| 完全移除訂閱 | 🔴 #15（同上） |

⚠ **第一輪的 900px 變異第一次沒紅**——錨點字串 `<div className="th-overview` 不存在
（實際是 template literal），`String.replace` **靜默 no-op**，差點被誤判成「gate 漏檢」。
**變異沒讓 gate 變紅，通常代表變異無效，不是 gate 太弱。**

### 全套回歸（Claude 獨立重跑，零下降）

Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57；
3a 29／3b 51／3c 69／3d 67／3f 43／3f.1 42／index_digest 13／live_session 20／safety 18；
**Q7b 72／Q7d 59**；integrity 20／o7 48／o7.1 27；
瀏覽器 gate：**team_honors 15**／asia_finals 15／circuit_points 21／career_final 12／default_scheme 15；
`regress` 15/15、`regress2` 8/8、`build` `built in 11.01s`。

⚠ **`check_moba_milestone_b2` 是既有紅燈**（斷言 `1.1` vs `2.2`），
在沒有本 milestone 的主幹上就是紅的，**不是本輪回歸訊號**。

### Q7e 收尾上線（2026-08-16）

| 項目 | 值 |
|---|---|
| `main` | `8cc44e7` → **`b56c3ef`**（fast-forward，五筆，無 merge commit、無 force） |
| 部署判準 | 正式站 asset 由 `index-C7ZfmrM6.js` 換成本次 build 的 **`index-BbJWig2A.js`** |

⚠ `gh` CLI 不在 PATH，**無法讀 Actions 狀態**。
改以 asset hash 比對判定部署生效——這比 workflow 狀態更可靠
（本 repo 有過 workflow 顯示 failed 但實際部署成功的紀錄）。

**正式站 smoke 12/12**（`prod_smoke_7e.mjs`，獨立 Chrome profile／port 9407／headless）。
期望值一律從**注入的存檔 JSON** 在 Node 這側算出，再與正式站 DOM 逐值比對——不從畫面推畫面。

- 世界無榮耀 ⇒ 空狀態正確，**沒有任何假 Season／假隊名**
- 有 AI 冠軍但玩家 0 冠 ⇒ `data-count=0`、文字「0次」（不是空白也不是「—」）
- AI 兩塊銘板完整可讀、皆非我方、隊名**不是金色**
- 玩家奪冠 ⇒ `data-mine=true`，隊名與 Season 都是 `rgb(251, 191, 36)`（GC.gold）
- Season 字體 `ui-monospace, Menlo, monospace`（MONO 刻印感）
- 多季順序 **S2 → S1**，賽季／隊伍 id／隊名逐值等於存檔推導值
- 最近冠軍卡逐值等於推導出的最新一筆；玩家多冠次數 2 = 期望 2
- Mobile 390px **390/390 無水平溢出**，銘板仍完整可掃讀
- 入口：更多功能 → 戰隊詳情可達，面板在該頁
- 無 undefined／NaN，全程無未捕捉例外

### ⚠ 正式站**沒驗到**的一項（照實記）

使用者的 smoke 清單有一條「頁面保持開啟時直接更新 honors，UI 即時更新，不需 reload／導頁」。
**正式站驗不了**：minified bundle 沒有任何 store handle
（全專案只有 `window.__ESMO_RUNTIME_*` 等 battle runtime debug 掛勾，
沒有 profile store 的入口），無法在頁內呼叫 `setState({ honors })`。
React fiber 也取不到 zustand 的 `setState`（`useSyncExternalStore` 只拿得到 `subscribe`／`getSnapshot`，
JS 無法反射進閉包）。

⇒ 這條由 **gate #15 在 dev bundle 上驗**，並有兩個變異證明它有檢定力。
**正式站本身未再驗一次**，交使用者實機確認。

### 尚未做

年度總決賽仍**沒有獎金**（榮耀與獎金分離，金額是產品決定）。
榮耀只有一種類型（`asia_annual_champion`），**沒有泛化成 Award 系統**——那是另一個產品決定。

## R57 部署整合（2026-08-16）

- R57 release commit `83dc14917c93bac1956a8ffd1869fb10de4a82d5` 已透過既有 `main` → GitHub Pages workflow 合併部署；R57 matchup acceptance verifier 與報告見 `review/cs-gameplay/CS_AI_TEAM_MATCHUP_ACCEPTANCE_R57_{SPEC,REPORT}.md`。
- 本次部署沒有修改 CS 16 項能力、roster、scenario、seed 或部署架構；僅為 release/main 的必要文件與 `profileStore` 合併衝突做保守整合。

---

## P0 Competition Runtime Recovery 部署（2026-08-18，已部署正式站）

`main` = `08df8ec`，正式站 bundle `assets/index-DxuOAjHL.js`，
GitHub Actions `Deploy Vite site to GitHub Pages`（push `main` 觸發）。

### 為什麼需要這個 hotfix

R58.2（`03a2fbc`）上**整條賽事生命週期是死的**——不是畫面空白，是功能全失：
無法推進天數、開始比賽、完成比賽、棄權、封存賽季、換季。
純 main worktree 實測：全新遊戲建立賽季後，賽事頁顯示「尚未建立賽季。」。

根因是一個過期的存取路徑：`wrapLegacySeasonState()` 守衛讀
`legacyState.competition.id`，那是單一賽制時代的屬性；Q7a-3b 之後改成
`competitions{}` map（正式取法 `activeCompetitionOf()`）⇒ 守衛必定觸發、
v2 sidecar 永遠是空骨架、adapter 依設計 `legacyState: null`，
8 個 runtime call sites 同時失去資料源。

**Q7f 不是來源**：以 `origin/main` 建立的獨立 worktree（零 Q7f 程式碼）
跑 Q7f 從未改過的 `browser_check_circuit_points_ui`，失敗形狀完全相同。

### 改動

僅 `src/platform/profileStore.js`（＋診斷文件）：

- 8 個 runtime call sites：`get().activeCompetitionEvent().legacyState` → `get().competition`
- `_sealSeasonIfFinished()` 的 3b-M2 boundary 區塊：以
  `const P0_V2_SEALING_BOUNDARY = false;` 門控，**區塊內容一行未改**，
  改回 `true` 即完全復原；下方 Q4/Q5/Q6 legacy 封存實作重新成為執行路徑。

`seasonStateV2.js`／`seasonSealingV2.js`／`seasonState.js` 零改動，
未新增 fallback、未改 UI、未清理 dead code、未動 v2 migration。

### ⚠ 已知代價

> P0 Hotfix 暫時撤回 SeasonState v2 的 runtime scope safety 與 sealing boundary，
> legacy competition 恢復為 gameplay truth 的直接 runtime 路徑。
> 這是刻意的 production recovery，不是 v2 的最終架構。
> 完整 v2 migration / scope safety / sealing semantics 必須在後續獨立修復。

Codex 交接文件 §9 警告不要移除 fail-closed scope safety，本次確實移除了。
差別在於：那道閘門在 `03a2fbc` 上擋掉的是**全部**而非錯誤 scope
⇒ 這是暫時打開一道卡死的門，不是拆掉運作中的鎖。

### 驗證

本地 gate：`circuit_points 21/21`、`career_final 12/12`、`asia_finals 15/15`、
`team_honors 15/15`、`multi_event 8/8`、`q6 20/20`、build 通過。
（`career_final` 與 `q6` 在啟用 legacy sealing 前是 6/12 與 10/20。）

完整生命週期實測：新遊戲 → 推進 → 開賽／完賽／棄權 → 封存成功
（`final` 產生、`careerFinalRank` 有值）→ rollover `S1 → S2`、S1 進歷史。

**存檔零遺失**：`s7e_player_one`（fixtures 144／outcomes 88／competitions 5／
events 5／players 5／funds 1,200,000／honors 1）與 `s7b_season_sealed`
（fixtures 148／outcomes 148／awards 1）全部保留；進出賽事頁前後
localStorage 逐位元組相同。

**Mutation（證明 gate 有鑑別力）**：旗標翻回 `true` ⇒ `q6` 20/20→10/20、
`career_final` 12/12→6/12；`competitionView` 改回 `adapter.legacyState` ⇒
`circuit_points` 21/21→7/21、`multi_event` 8/8→3/8。兩者皆還原，檔案逐位元組相同。

### 正式站 smoke（10/10）

A 不再顯示「尚未建立賽季」／B 全新賽季可進入 CompetitionScreen／
C 巡迴積分可見／D Career Final／E Asia Finals／F Team Honors／
G 賽季封存／H canRoll（CTA「▶ 開始第 2 賽季」出現）／
I rollover S1→S2（CTA 消失、畫面更新）／J 無新的 Competition runtime error。

### 尚未做（刻意）

- **SeasonState v2 正式修復**：migration 讀取路徑、sealed Event 的 final
  reference（`sealed_without_final`）、scope safety 與 sealing boundary 復原，
  全部列為獨立後續工作，見
  `review/mainline-defects/SEASONSTATE_V2_LEGACY_CUTOFF_DIAGNOSIS.md` §9.7／§10.4。
- **`tools/verify.mjs` 不含任何 browser gate**：賽事頁全空仍會全綠，
  這是本案能潛伏 60+ 個 sprint 的原因。補上 browser gate 是後續必做。
- **Q7f 尚未整合**（`origin/q7a/3b-multi-event` = `ed8cc84`，已驗證但未部署）。

---

## Competition Release Gate（2026-08-19）

`tools/check_competition_release_gate.mjs` —— Competition / Season / Event /
Ranking / Honors / Season Recap 相關改動在 **merge / deploy 前的正式入口**。
Claude、Codex、任何人都用同一支。9 個區段：`v2_runtime`、`v2_sealing_m2`、
`circuit_points`、`multi_event`、`career_final`、`asia_finals`、`team_honors`、
`q6`、`build`。使用時機與行為見 `docs/ai/跨模型交接流程.md` §10。

### 它補的是什麼洞

**`tools/verify.mjs` 不含任何 browser gate。** 賽事頁可以整頁失效，
29 個區段仍會全綠——2026-08-18 的 P0 事故（整條賽事生命週期死亡）
能潛伏 60+ 個 sprint，這就是原因。

⇒ 本輪**不把 browser gate 粗暴塞進 `verify.mjs`**（那會讓每次全跑都多出十幾分鐘
的瀏覽器測試），而是另立獨立入口，由「改到 Competition 就必跑」的規則銜接。

### 設計上的兩個刻意選擇

1. **不在第一個 FAIL 就中止**——全部跑完，一次看到完整故障面。
   排查時最耗時的是「修一個、再跑一次、又發現一個」。
2. **除了 exit code 還驗輸出形狀**（寫死通過數）。
   `exit 0` 但沒印出預期通過行一樣算 FAIL ⇒ 腳本提早 return 會被抓到。
   代價是新增斷言必須同步更新——那是刻意的摩擦。

### ⚠ 兩件不得誤讀的事

1. **Release Gate 全綠 ≠ Competition 已完成。**
   **Multi-Event SeasonState v2 sealing 仍未完成**，封存目前走 legacy path，
   `P0_V2_SEALING_BOUNDARY = false` 必須保留。Release Gate 覆蓋的是
   「現況不得退化」。缺口見
   `review/mainline-defects/MULTI_EVENT_SEALING_COMPLETION_TODO.md`。
2. **`check_season_state_v2_migration_q7b` 刻意未納入。**
   它自己讀 `made.state.competition.id`（Q7a-3b 起不存在），
   **在乾淨 main 上就崩潰**，與它要防守的缺陷同源。
   修好該 verifier 自身是獨立工作項，**本輪未修**。

---

## SeasonState v2 —— 聚焦指標與 Event-scoped index（2026-08-19，Codex 交叉驗證 FAIL 後的修正）

Codex 對 `4d13f24` 做獨立交叉驗證，判定 **FAIL**，提出兩個 contract blocker。
Claude 先**不照描述修**，自己寫探針重現，兩條都證實為真。

### 重現（`s7e_player_one.json`，5 Event 存檔，實測輸出）

```
── setActiveEvent A → B ──
after : legacy.activeEventId = event:circuit:moba:s1:asia:spring
after : v2.active.eventId    = event:circuit:moba:s1:legacy:regular   ← 沒跟上
after : adapter.event.id     = event:circuit:moba:s1:legacy:regular   ← 沒跟上
reload: v2.active.eventId    = event:circuit:moba:s1:legacy:regular   ← 存檔重載仍錯

── legacy 追加一場 fixture 之後 ──
legacy fixture appended, exists = true
v2 Event A fixtureIds 56 → 56       ← index 完全凍結
legacyState.competition is undefined (multi-event shape)
```

### Root cause（兩個，互相獨立）

1. **`refreshLegacyIndexes` 拿一個不存在的屬性當 scope。**
   它以 `event.competitionRef?.id !== legacyState?.competition?.id` 決定要不要更新，
   但 `legacyState.competition` **自 Q7a-3b 起在多 Event 形狀下根本不存在**
   （Competition 改成 `competitions{}` map，Event 各自用 `rankingCompetitionId` 找）。
   ⇒ 比對永遠不成立、每個 Event 的 index 永遠凍結。
   而且它取的是 `idsOf(legacyState.fixtures)`——**全季**場次；
   假如比對反而成立，結果是把別的 Event 的場次灌進同一個 Event。
   **兩種失敗都源於同一個假設：「active Event 擁有全季的 fixtures」。**

2. **v2 `active` 沒有任何地方會跟著 legacy 焦點重新對位。**
   `migrateSeasonStateV2` 只有兩個會改 `active` 的出口：整份重建（觸發條件是
   **Event 集合或 final id 的 signature 變了**）與封存。`setActiveEvent` 只動
   `activeEventId`，signature 逐字不變 ⇒ 走不到重建，`active` 就留在舊 Event。
   `setActiveEvent` 又是裸 `set({ competition })`，連 sidecar 都沒重算。
   ⇒ 畫面上積分榜／下一場（讀 legacy `activeEventId`）已經換了，
   `activeEvent`／adapter（讀 v2 `active`）還停在舊的，存檔重載後依然分裂。

### 修改位置

| 檔案 | 改動 |
|---|---|
| `src/platform/competition/seasonStateV2.js` | 新增 `legacyIndexesFor(legacyState, eventId)`：**逐 Event** 解析 scope，走 `rankingCompetitionId → competitions[id] → stage → fixtures → outcomes`，與 `buildEvent` 同一條鏈（refresh 與 wrap 不會分岔）。舊形狀（無 Event map、有頂層 `competition`）保留原語意逐字不變。 |
| 同上 | `refreshLegacyIndexes` 改為對**每個** Event 各自比對／更新；scope 只比對不改寫，不符即 `null`（fail closed）。多 Event 時不再只更新「畫面正在看的那個」——index 新鮮度不得綁畫面焦點。 |
| 同上 | 新增 `realignActivePointer`：`active` 是 legacy `activeEventId` 的投影，legacy 權威 ⇒ 焦點移動是**索引過期**而非 scope 衝突，重新對位。已封存賽季維持「沒有 active Event」的契約，不復活。 |
| 同上 | `migrateSeasonStateV2` 在 scope 檢查**之前**先對位（`aligned`），後續 `activeEventOf` / `refreshLegacyIndexes` 都吃對位後的值。 |
| `src/platform/profileStore.js` | `setActiveEvent` 改走 `_setCompetitionState`（legacy competition 的唯一寫入點）⇒ v2 sidecar 與 legacy 指標同一次寫入一起動，不必等 `save()`。 |

**沒有動**：R59–R65、Team Development、R63 ActiveMatch、Q7f、Multi-Event sealing、
Season／Competition 規則。封存語意一行未改（`v2_sealing_m2` 24/24 未變）。

### 新 verifier：`tools/check_seasonstate_v2_active_focus.mjs`（30/30）

為什麼另立一支而不是加進 `v2_runtime`：`v2_runtime` 每一條都從**乾淨載入**開始，
只要 wrap 對就會綠——它證明不了「載入之後又發生了什麼」。這支專門守那個區間：
多 Event 賽季 → 切 A→B → v2 active／adapter／`competitionView` 三方一致 →
save → reload → 仍一致 → 對 B 追加 fixture＋outcome → 只有 B 的 index 動、A 逐值不變 →
反向對非聚焦的 A 追加、A 也會更新（證明 refresh 不綁畫面焦點）→
切回去、非法 Event 被擋 → 真實 5 Event 存檔重跑同一組性質。

### Mutation（Claude 自己做，每次先 grep 確認變異落地）

| 變異 | 結果 |
|---|---|
| `realignActivePointer` 的 focus 查找恆 `null`（破壞 active pointer sync） | 🔴 **30/30 → 19/30**（#5/#6/#8/#9/#11/#13/#14/#16/#24/#28/#29） |
| index lookup 改回 `legacyState.competition` ＋ 全季 fixtures | 🔴 **30/30 → 15/30**（再加 #18/#19/#21/#22） |

兩次都先 `grep` 確認變異字串真的在檔案裡（**變異沒讓 gate 變紅，通常代表變異無效**），
跑完由備份還原，還原後 30/30。

### Release Gate

`tools/check_competition_release_gate.mjs` 新增區段 **`v2_active_focus`**
（`shape: /SeasonState v2 active focus: 30\/30 PASS/`），9 段 → **10 段**。
上面兩個 case 因此正式納入 merge/deploy 前的必跑集合。

### 仍然存在的 `legacyState.competition` 路徑（照實記）

- `seasonSealingV2.js:196`（`sealEventV2` 的 scope gate）與 `:200`
  （`sameIds(event.fixtureIds, ids(legacyState.fixtures))` 比全季集合）
  —— **仍是舊形狀假設**。屬 Multi-Event sealing 範圍，本輪刻意未動
  （`P0_V2_SEALING_BOUNDARY = false`，封存走 legacy path，所以尚未爆）。
  見 `review/mainline-defects/MULTI_EVENT_SEALING_COMPLETION_TODO.md`。
- `seasonStateV2.js` 的 `wrapLegacySingleCompetition`／`hasLegacyScope`／
  `activeLegacyCompetitionId` fallback —— 都**明確以「沒有 Event map」為前提**，
  是 pre-Q7a-3b 存檔的遷移路徑，正確。
- `activeEventAdapter` 回傳值裡的 `competition` 欄位在多 Event 形狀恆為 `null`，
  **全 repo 無任何消費者**（消費的只有 `.legacyState` 與 `.event`）⇒ 死欄位，非 runtime path。

### 驗證輸出（照實貼，含未通過項）

```
Competition Release Gate（10 段）
  PASS  v2_runtime          [legacy] 9/9   [v2] 27/27
  PASS  v2_active_focus     30/30
  PASS  v2_sealing_m2       24/24
  PASS  circuit_points      21/21
  FAIL  multi_event         ← 見下（環境）
  PASS  career_final        12/12
  PASS  asia_finals         15/15
  PASS  team_honors         15/15
  PASS  q6                  20/20
  FAIL  build               ← 見下（環境）
  passed 8/10

其他 node verifier（單獨重跑，全綠）
  3a 29/29　3b 51/51　3c 69/69　3d 67/67　3f 43/43　3f.1 42/42
  index_digest 13/13　live_session 20/20　safety 18/18
  Q7b 72/72　Q7d 59/59
```

### ⚠ 兩項**未完成驗證**（環境阻塞，非本次改動所致）

`npm run build` 與 `browser_check_multi_event_ui` 在本機**跑不完**：

```
runtime: VirtualAlloc of 5152768 bytes failed with errno=1455
fatal error: out of memory
```

`errno=1455` = `ERROR_COMMITMENT_LIMIT`。實測系統 commit **44.5 GB / 上限 45.9 GB**
（Chrome 7.8 GB、ChatGPT 4.6 GB、Evernote 2.0 GB、codex 1.1 GB…），
另有其他 worktree 遺留的 vite dev server orphan（8/16–8/17，約 1 GB）。
`--minify=false`、`ESBUILD_MAX_THREADS=1` 都一樣死在同一處；
`transforming... ✓ 2682 modules transformed` 已通過，死在 `rendering chunks` 的 esbuild 子行程。
`multi_event` 同因：Chrome ＋ dev server 起不來，連第 1 條「進得了賽事頁」都紅
（gate 內 18s 就 FAIL；單獨重跑 10 分鐘無任何輸出，卡在 `startDevServer`／`launchChrome`）。

⇒ **這兩項在記憶體釋放後必須重跑，未跑過之前不得宣稱本輪完成。**

---

## Crash Recovery ——「環境阻塞」兩項紅燈的結案（2026-08-19，同一輪的後續）

**接續上一節，不取代它。** 上一節結尾留下的兩項未完成驗證（`build`、`multi_event`），
在環境當機、記憶體釋放後**重新執行完畢**。上一節的紅燈紀錄與失敗證據**逐字保留**，
這一節只記錄它們後來變成什麼。

### 事件順序（照實記）

1. 上一節的修正做完、mutation 做完並還原、`v2_active_focus` 30/30。
2. 重跑 Release Gate 時系統 commit 記憶體耗盡 ⇒ `build` 與 `multi_event` 紅，gate 8/10。
3. **環境／視窗當機**，session 中斷。上一節的最後一段就是在這個時點寫下的。
4. 復原後先做 Crash Recovery Audit（不 reset、不 checkout、不 clean、不重寫已存在成果），
   再重跑完整 10 段 Release Gate。

### Crash Recovery Audit 結果

| 項目 | 結果 |
|---|---|
| worktree / branch | `ESMO-worktrees/seasonstate-v2-runtime`／`fix/seasonstate-v2-runtime-completion` |
| HEAD | `4d13f24`（第六階段 Release Gate 那一筆，當機**前**就已 commit） |
| git 中斷狀態 | 無 MERGE_HEAD／rebase／cherry-pick 殘留；stash 只有 2026-08-10 別 branch 的舊項目 |
| 未提交成果 | 上一節的 5 個檔案完好，`node --check` 三支全過（**未被當機截斷**） |

### Release Gate 重跑（10 段全綠，實測輸出）

```
══ Competition Release Gate ══
▶ v2_runtime       SeasonState v2 runtime compatibility … ✅ PASS　1s
▶ v2_active_focus  v2 聚焦指標一致性 ＋ Event-scoped index refresh … ✅ PASS　0s
▶ v2_sealing_m2    3b-M2 Event/Season sealing boundary … ✅ PASS　0s
▶ circuit_points   巡迴積分 UI … ✅ PASS　70s
▶ multi_event      多 Event UI 與 focus 切換 … ✅ PASS　24s
▶ career_final     生涯主要賽事最終名次 … ✅ PASS　41s
▶ asia_finals      亞洲年度總決賽 UI … ✅ PASS　63s
▶ team_honors      戰隊榮譽 UI … ✅ PASS　57s
▶ q6               季後賽／封存／換季 生命週期 … ✅ PASS　34s
▶ build            production build … ✅ PASS　23s

port 清理：✅ 無殘留
passed 10/10
failed 0/10          （exit 0）
```

**`multi_event` PASS、`build` PASS** ⇒ 上一節那兩項紅燈**結案**。

### 兩項紅燈的定性：環境，不是產品 regression

判定依據不是「重跑就綠了」，而是三件事同時成立：

- **失敗訊號本身就是環境層的**：`VirtualAlloc … errno=1455` =
  `ERROR_COMMITMENT_LIMIT`，是 Windows **commit 記憶體上限**，
  不是斷言失敗、不是 exit code 非 0 的邏輯錯誤。
  `build` 死在 `rendering chunks` 的 esbuild 子行程，而 `transforming ✓ 2682 modules`
  已經走完 ⇒ 程式碼本身編得過。
- **`multi_event` 當時連第 1 條斷言都沒跑到**（卡在 `startDevServer`／`launchChrome`），
  失敗發生在受測程式碼**執行之前**。
- **產品碼在兩次執行之間一行未改**：重跑前後 `git diff --stat` 逐字相同
  （4 檔 +275/-22），沒有「為了讓它變綠而動過什麼」。

記憶體實測對照（同一台機器）：

| | commit 使用／上限 | 結果 |
|---|---|---|
| 當機前 | 44.5 GB / 45.9 GB | `build`、`multi_event` OOM |
| 復原後 | 約 13 GB 已用（limit 39.69 GB，free virtual 26.6 GB） | 10/10 PASS |

> ⚠ 留給後人的判讀規則：`errno=1455` 與「browser gate 在第 1 條斷言前就紅」
> **不得當成回歸訊號**。先看記憶體，再看 diff 有沒有動過產品碼。

### mutation 殘留：無（四項獨立證據）

1. 第六階段 commit `4d13f24` 的檔案清單中 **`src/` 檔案數 = 0**
   （mutation 全部發生在產品碼上 ⇒ 版本層面即證明已還原）。
2. 上一節記載的兩個變異字串實測皆不存在：`legacyState?.competition?.id` 零命中；
   `realignActivePointer` 的 focus 查找（`seasonStateV2.js:825`）完整未被改成恆 `null`。
3. 全 repo（含 ignored）無 `*.bak`／`*.orig`／`*.rej`／`*mutation*` 殘檔。
4. 未提交 diff **逐行審過**，全部是帶註解的有意修正，
   無早退／反轉條件／恆 null 型變異；三個改動檔 `node --check` 全過。

### 執行環境殘留：無

- `node`／`esbuild`／`chromedriver` 行程：**0 個**（gate 跑完後再驗一次，仍 0）。
- 監看 port（5173、5391–5451）：gate 自己的 `finally` 回報「✅ 無殘留」；
  另以 `Get-NetTCPConnection` 獨立複驗 5000–5999，只剩 `svchost:5040`
  （Windows 系統服務，gate 執行**前**就在，非本次產生）。
- 沒有遺留 dev server / browser session。

### 本節**沒有**做的事

未 push、未 deploy、未整合 Q7f、未 reset／checkout／clean、未修改上一節任何既有文字。
`seasonSealingV2.js` 的 `legacyState.competition` 舊形狀假設**仍在**（上一節已列，屬
Multi-Event sealing 範圍）⇒ 本輪一樣沒動。**gate 全綠代表現有行為沒有回歸，不代表 v2 完成。**

---

## SeasonState v2 最終驗證閉環：mutation 4 ＋ browser harness（2026-08-19）

本節接續 Codex 對 HEAD `5e7e0c6` 的最後交叉驗證。**沒有修改 production code**；
只補 verifier／browser runner，並把所有暫時 production mutation 還原。

### Mutation 4 原本為何抓不到

`setActiveEvent` 若從 `_setCompetitionState(...)` 退化成裸 `set({ competition })`，但仍緊接
`save()`，舊 gate 仍會綠。原因是 `save()` 自己會重新計算 SeasonState v2 sidecar；舊 gate
只在 `setActiveEvent` 返回後與 reload 後取樣，看到的已是被 `save()` 補平的狀態，無法證明
legacy 與 sidecar 是不是在同一次正式寫入裡完成。

`check_seasonstate_v2_active_focus.mjs` 新增 runtime 斷言：暫時包住 store 的同一個 `save`
action，並在 original save **尚未執行前**取樣 legacy `activeEventId`、v2
`active.eventId`、`activeCompetitionEvent().event.id`。三者此時就必須全為 Event B。
這不是 source 字串掃描，也沒有阻止真正的 save；總數由 30 增為 **31**。

Mutation 先以 `rg` 證明裸 `set({ competition }) + save()` 已落地：

```
正式 `_setCompetitionState`：31/31 PASS
裸 `set({ competition })`：  30/31 FAIL
  save 入口：legacy=B、v2=A、adapter=A
  save 返回：原本的 post-save／reload 斷言仍全綠
還原後：                    31/31 PASS
```

這個結果同時證明新斷言抓的是正式寫入時序，而不是讓後續投影／reload 無法工作。

### Browser harness root cause 與修正

先獨立重現 `multi_event`：Vite 5316 正常回 HTTP 200，但 Chrome/CDP 9338 已消失；
Chrome target 退出後，共用 CDP `pending` Promise 沒有 close/error reject，也沒有 command
timeout，因此在第 1 條業務斷言前永久等待，最後只能由 900 秒外層 timeout 殺掉。

fail-fast 診斷取得 Chrome 151 stderr：Windows sandbox／GPU 子行程以
`0xC0000022`（Access Denied）退出；不是 Playwright（本 repo 使用零依賴 raw CDP），
也沒有本次 `errno=1455`／commit-limit 訊號。修正如下：

- Vite 改成目前 Node 直接啟動本地 Vite CLI，不再走 `npx + shell:true` 的四層行程樹。
- CDP pending command 加 timeout，WebSocket close/error 立即 reject；Chrome 啟動失敗會保留
  stderr 末段、回收 Chrome 與獨立 profile。
- Chrome 151 的 testing-only sandbox／Graphite cache 旗標只套在 gate 自己的 headless
  profile，且只造訪本機 Vite；不影響日常 Chrome，也不改 business assertion。
- `q6` 移除內嵌的第二份無 timeout CDP client，改走同一個共用 harness；
  `multi_event` 明確 `await server.stop()`。
- Release Gate 改監看六支腳本真正使用的 12 個 Vite／CDP port；逐段保存完整 log、耗時與
  失敗原因。若 runner 必須代收新 listener，該段仍判 FAIL；第一段失敗也不會中止後續。
- Windows build 改由靜態 `cmd.exe /d /s /c "npm run build"` 啟動；Node 24 直接
  `spawnSync("npm.cmd")` 會回 `EINVAL`，那次 build 根本未開始，不能誤判 production。

### 六支 browser gate 獨立結果

| gate | 結果 | 實際耗時 |
|---|---:|---:|
| `circuit_points` | 21/21 PASS | 46.4s |
| `multi_event` | 8/8 PASS | 16.7s |
| `career_final` | 12/12 PASS | 30.0s |
| `asia_finals` | 15/15 PASS | 48.5s |
| `team_honors` | 15/15 PASS | 30.0s |
| `q6` | 20/20 PASS | 27.3s |

每支都進入業務斷言；不是只看 Chrome 能不能開。

### 完整 Competition Release Gate（最終 run）

```
v2_runtime        PASS   0.4s
v2_active_focus   PASS   0.4s   31/31
v2_sealing_m2     PASS   0.2s   24/24
circuit_points    PASS  50.8s   21/21
multi_event       PASS  17.6s    8/8
career_final      PASS  31.7s   12/12
asia_finals       PASS  52.2s   15/15
team_honors       PASS  45.2s   15/15
q6                PASS  27.5s   20/20
build             PASS  11.4s
passed 10/10，failed 0/10，exit 0
port 清理：無殘留
```

完整 stdout/stderr 與 `summary.json` 位於該次 runner 印出的系統 temp log directory；
逐檔已核對非空，且都有預期 assertion shape。最終 `src/platform/profileStore.js` 與
`src/platform/competition/seasonStateV2.js` diff 均為 0。Multi-Event sealing、Q7f、
q7b migration verifier debt 均未碰。

---

## Team Development / 天賦系統 Recovery Audit（2026-08-20，只稽核，未 merge／未部署）

起因：正式站部署較舊 main 之後，首頁又出現舊的「天賦」入口與舊 0/3 天賦樹。
本輪**只做稽核與保護**，沒有 cherry-pick、沒有 merge、沒有部署，
也沒有動 profileStore／SeasonState v2／Competition runtime／Q7f。

### 先釐清基準（實際 git，不依文件描述）

| ref | commit | 說明 |
|---|---|---|
| `origin/main` | `690c485` | **正式站基準**（deploy 來源） |
| 本地 `main` | `044b98e` | ⚠ **落後 `origin/main` 92 個 commit**，是過期 ref，不可當基準 |
| P0.6A staging | `65e3506` | branch `recovery/team-development-ui-stage`；**parent 是 `f9026d1`**（本 SeasonState v2 分支上的 commit） |
| 完整版 | `84b6058` | `release/moba-combat-closure` |

> ⚠ 兩點容易被誤讀：**本地 `main` 不是 current main**；
> 而 `65e3506` 並非 cherry-pick R59–R62，而是在 v2 分支的 `f9026d1` 上**重新 staging**。
> R59–R63 六顆 commit（`f7faf61`／`7060bbb`／`5419eac`／`616404c`／`a274f49`／`86ec645`／`84b6058`）
> **沒有一顆是 `origin/main` 或 `65e3506` 的祖先**。

### 功能對照（實測檔案／內容，非文件描述）

| 功能 | 來源 commit | 在 `65e3506` | 在 `origin/main` | 已部署 |
|---|---|---|---|---|
| `TeamDevelopmentScreen` | R59 `f7faf61` | ✅ | ❌ 檔案不存在 | ❌ |
| 首頁「戰隊發展」入口 | R59／R59.1 | ✅ `<Tile label="戰隊發展">`＋`development: "teamDevelopment"` | ❌ 是 `<Tile label="天賦">`＋`talent: "talentPick"` | ❌ |
| 舊「天賦」入口 | S27 `e5bb645` | 僅 legacy（`talentPick` 保留、非主要磚） | ⚠ **仍是首頁主要磚** | ⚠ 是 |
| 4 分類 / 20 節點 | R59 | ✅ 4×5＝20（與 release **blob 完全相同**） | ❌ | ❌ |
| Lv.0/3 | R59 | ✅ `maxRank ?? 3` | ❌ | ❌ |
| prerequisite／下一級效果 | R59 | ✅ `prerequisites`＋`levelEffects` | ❌ | ❌ |
| planned（規劃中）狀態 | R59 | ✅ `future`＋`activeLevelCap` | ❌ | ❌ |
| GSAP／reduced-motion | R59.1 | ✅ `useGSAP`＋三處 `prefers-reduced-motion` | ❌ | ❌ |
| R61 responsive/touch target | R61 `a274f49` | ✅ ManageFrame `minWidth: 40`＋`aria-label="返回"` | ❌ | ❌ |
| R62 Player Profile 四分頁 | R62 `86ec645` | ✅ overview/abilities/growth/career | ❌ | ❌ |
| Roster／Recruit mobile fixture | R61 | ✅ UI 部分 | ❌ | ❌ |
| **R60 效果接線** | R60 `616404c` | ❌ **刻意移除** | ❌ | ❌ |
| **teamDevelopment persistence** | R59 | ❌ | ❌ | ❌ |

### 邊界：P0.6A UI Recovery ≠ 完整 R59–R62

四項獨立證據：

1. `PROFILE_SCHEMA_VERSION`：`origin/main` = **9**、`65e3506` = **9**、release `84b6058` = **10**。
2. `profileStore.js` 內 `teamDevelopment` 出現次數：`origin/main` **0**、`65e3506` **0**、release **9**。
3. `65e3506` 的 `TeamDevelopmentScreen` 比 release 版**多了防護**
   （`typeof purchase !== "function"` ／ `canPurchase` 前置判斷）——因為
   `s.purchaseTeamDevelopment` 在那棵樹上根本不存在，整個畫面是唯讀外殼。
4. `65e3506` 的 `RosterScreen` / `RecruitScreen` 相對 release **刪掉了 R60 效果**
   （合約摘要解鎖、球探天數縮減、青訓支援）。

再加一項自證：`65e3506` 自帶的 `check_team_development_v1.mjs` 在該樹上實跑，
前 16 條 PASS，第 17 條 `profileStore migration 與 write hook` **FAIL**
（要求 `PROFILE_SCHEMA_VERSION = 10` ＋ `teamDevelopment: sanitizeTeamDevelopment`
＋ `purchaseTeamDevelopment(nodeId)`）。同樹 `check_r61_ui_fixture` 與
`check_r62_player_ui_fixture` 皆 PASS。

**R60 consumer 實測**（`teamDevelopmentEffects` / `hasTeamDevelopment` 的使用者）：

| 樹 | consumer |
|---|---|
| release `84b6058` | BanPickScreen、TacticScreen（MOBA 備戰）、CsTacticScreen（CS 備戰）、RosterScreen、RecruitScreen、profileStore |
| `65e3506` | **無任何 gameplay consumer**（只有領域模組＋自己的畫面＋兩支 verifier） |
| `origin/main` | 完全沒有 |

### 「天賦」回歸可由 git history 直接證明

`origin/main:src/screens/DashboardScreen.jsx`：

```
108:  <Tile emoji="🌿" label="天賦" badge={T.talentPending} … onClick={() => sel("talent")} />
 79:  const NAV = { … talent: "talentPick", … }      ← 沒有 development 鍵
```

`65e3506` / `84b6058` 同一檔：

```
103/108:  <Tile emoji="🌱" label="戰隊發展" badge={T.developmentPoints} … onClick={() => sel("development")} />
 74/78:   const NAV = { … development: "teamDevelopment", talent: "talentPick", … }
```

⇒ 截圖中的「天賦」回歸**不是幻覺、也不是快取**，而是 `origin/main` 的原始碼本來就長這樣。

### 新增 focused verifier

`tools/check_team_development_recovery.mjs`——只驗版本契約，不做 E2E，
**刻意不 import** `teamDevelopment.js`（必須能在該模組不存在的樹上跑完並如實回報，
而不是自己 crash）。支援 `--root=<worktree>` 做跨樹稽核。三段輸出分離，
`Persistence Integration` 與 `Gameplay Consumers` **永遠不會被印成 PASS**。

實測三方判別：

```
origin/main 這棵樹   UI Recovery: NOT PRESENT   Persistence: NOT YET   Consumers: NOT YET   exit 1
65e3506              UI Recovery: PASS 14/14    Persistence: NOT YET   Consumers: NOT YET   exit 0
release 84b6058      UI Recovery: PASS 14/14    Persistence: INTEGRATED  Consumers: INTEGRATED  exit 0
```

契約條文寫在 `docs/ai/跨模型交接流程.md` §11。

### 本輪未做（刻意）

未 cherry-pick `65e3506`、未 merge、未 deploy、未改 `profileStore`、
未動 SeasonState v2 / Competition runtime / Q7f。
下一步選項（**等使用者決定**）：A 只恢復 `65e3506`（UI-only）／
B 建立完整 Recovery Release（含 R59 persistence＋R60 consumer）／
C 現況已足夠。稽核結論傾向 **B**，理由見回報。

## P0.6B Full Product Recovery（2026-08-20，Codex implementation-owned）

### Recovery strategy

- 以目前 SeasonState v2 branch 為唯一 production 基線，先稽核 `5e7e0c6`、`3a81108`、`65e3506`、`84b6058` 與 `ba5644b`／`d42190e` 的差異，再做 selective integration。
- 未 cherry-pick 整顆歷史 release、未整檔覆蓋 `profileStore.js`；保留 Competition／SeasonState v2 既有 contract，R64／R65／Q7f 不在本輪。

### 恢復內容

- R59／R59.1：Team Development 4 類 × 5 節點的 v1.5 product layer、schema v10、migration、save／reload persistence；訓練天數、每日回復與招募 scout 天數由同一份 teamDevelopment state 驅動。
- R60：MOBA Ban/Pick opponent research、MOBA Tactic data analysis、CS Tactic demo analysis、Roster contract summary、Recruit scout reduction 五個真實 consumer；沒有以 UI 假資料代替 gameplay source。
- R61：Team Development route／homepage primary、升級流程與既有 PlayerTalent legacy compatibility 同時保留。
- R62：Player Profile foundation；Roster 摘要 modal 可進入完整檔案，完整檔案保留 mode-specific tabs 與既有 player identity。
- R63：ActiveMatch.v1 queue／launch／pause／resume／snapshot 與競賽入口整合；Competition fixture resume、settlement idempotence 與 legacy competition gameplay truth 均保留。

### Verifier 與 Gate 結果

| Gate | 結果 |
|---|---|
| Team Development recovery contract | PASS；persistence 與五個 consumers 均為 INTEGRATED |
| Team Development v1.5 | PASS `29/29` |
| R61 UI fixture／R62 Player fixture | PASS |
| R63 focused | PASS `13/13` |
| R63 × Competition combined | PASS `19/19` |
| SeasonState active-focus | PASS `31/31` |
| Competition Release Gate | PASS `10/10`，exit `0`；watched ports／harness cleanup 通過 |
| P0.6B browser product-presence | PASS `12/12`；Team Development 升級 reload、Player Profile、Competition、ActiveMatch resume、390／360 overflow 均通過 |
| production build／syntax／`git diff --check` | PASS |

`tools/verify.mjs` 已加入上述 recovery gate 的可重跑入口；本輪 selected recovery runner 為 `7/7`。Release Gate 完整 logs 保留於 `C:\Users\ifikn\AppData\Local\Temp\esmo-competition-gate-vORuhp`。

### Contract review、衝突與邊界

- Team Development 保持首頁主要入口；`PlayerTalentScreen`／`talentPick` 僅作 legacy compatibility／detail，不移除既有 `purchasePlayerTalent`。
- `check_team_development_v1.mjs` 原有一條 assertion 錯把「不得讓個人天賦取代 Team Development」寫成「不得存在 `purchasePlayerTalent`」。已改為同時檢查 legacy action／screen 保留、Team Development primary 與 route marker；這是依共同 contract 修正工具檢查，不是降低 assertion 或 rebaseline。
- Competition 的 legacy competition 仍是 gameplay truth；SeasonState v2 是 metadata／reference projection。未新增第二套 gameplay truth、fail-open scope fallback、`activeEventId`／`careerEventId` 混用或 `SeasonSeal`／`FinalStandings` 混用；wrong scope fail closed、missing／stale sidecar deterministic rebuild、active focus 即時同步、multi-event index 仍為 Event-scoped。
- 已知邊界不列為本輪 blocker：`P0_V2_SEALING_BOUNDARY = false` 的 multi-event sealing、`check_season_state_v2_migration_q7b` 既有 debt、Q7f 尚未整合，以及 R64／R65。browser gate 也不等同真機觸控／FPS／視覺體感實測。

## P0.6B ActiveMatch TTL／UI boundary repair（2026-08-20）

- Deterministic matrix：`created` 超過 300 秒拒絕；`launched + ActiveMatch.v1` 超過 300 秒仍以相同 `matchId`／`sessionId`／`seed`／`lineup` resume；completed／abandoned／cancelled／invalid 仍拒絕。
- Causal bug 是 UI action gate，不是 `resumeSession()` 已存在的 ActiveMatch TTL exception：任何 `launched` session 都曾被提供 resume，包括沒有有效 ActiveMatch snapshot 的 legacy session。
- 新增 store-owned `restoreable` view，`primaryActionFor()` 只對有效 ActiveMatch 顯示 resume；invalid launched data 沿用既有 requeue／same-fixture refixture。沒有降低 assertion 或 rebaseline。
- Focused evidence：TTL regression `9/9`、R63 `13/13`、Competition × ActiveMatch `19/19`、matchmaking flow `97/97`、Competition Release Gate `10/10`、browser product-presence `12/12`、build PASS。

## Q7f Season Recap 整合進 main 線（2026-08-20，`integration/q7f-season-recap`）

Q7f 在 `q7a/3b-multi-event` 上做完後被凍結（commit `ed8cc84`），期間 main 前進了
70+ 個 commit（SeasonState v2、Competition Release Gate、Team Development R59–R62、
R63 ActiveMatch）。本輪把 Q7f 的**產品行為**移植到現行 main 架構上，
**不整顆 cherry-pick**、不用 Q7f 舊檔覆蓋主幹。

### 基線

- 從 `origin/main` 開新 worktree／branch。⚠ 使用者指定的 `7c8d7b9`（P0.6B）
  當時已不是 main HEAD——main 已前進到 `4256ab3`（Sprint 63 ActiveMatch TTL repair），
  且 `7c8d7b9` 是它的祖先。基線取 `4256ab3`（嚴格超集），
  以免把 profileStore / matchPrepAction 的最新 contract 退回去。
- 基線證據：在乾淨的 `ESMO-acceptance`（HEAD `4256ab3`、working tree clean）
  實跑 Competition Release Gate **10/10 PASS**，exit 0。

### Q7f 舊 diff 的取捨（17 檔中只有 15 檔仍需要）

| Q7f 舊 diff | 處置 | 理由 |
|---|---|---|
| `seasonRecap/*`（10 個新檔） | 全數採用 | 純新增，無衝突 |
| `CompetitionScreen.jsx` | 全數採用 | main 自 merge-base 起**沒動過**這一檔 |
| `browser_check_career_final_ui.mjs` | 全數採用 | 同上，main 沒動過 |
| `browser_check_asia_finals_ui.mjs` | **三方合併** | 兩側都改：Q7f 改 selector（結構遷移）、main 改 fixture 路徑。兩者不重疊，都保留 |
| `browser_check_season_recap_ui.mjs` | 採用＋改路徑 | fixture 由 repo 外 `../../` 改讀 `review/fixtures/competition/` |
| `tools/browser/cdp.mjs` | **整段丟棄** | Q7f 當時修的問題（npx shell 起 vite、殺不掉行程樹）main 已用更完整的做法解決：Vite CLI 直起、`stopProcess`／`removeProfile`、CDP timeout 與 pending reject、Chrome 151 sandbox 旗標。Q7f 版是舊解法，套上去等於退回 |
| `docs/handoff/05_Sprint紀錄.md` | 不移植舊文 | 舊分支的 sprint 文字與現行主幹脈絡已脫節，改寫本節 |

### 唯一的跨工作線回歸：`browser_check_q6` 2c／2d

整合後 Release Gate 抓到 `q6` 紅一條。**不是 main 的既有紅燈**——基線 10/10 全綠，
是 Q7f 造成的：`2c` 斷言 `最終名次 FINAL STANDINGS` 與 `🏆 冠軍` 兩段字串，
那個 Panel 正是 Q7f 用 `RecapLeague` 取代掉的。Q7f 當時已為 `career_final`／
`asia_finals` 做過同樣的 selector 遷移，**漏掉 q6**——因為 Release Gate 是 Q7f
凍結之後才建立的，那條分支上沒有任何東西會去跑 q6。

修法沿用同一套紀律：改讀 `recap-league-*` 的 `data-*` 與指定節點文字，
並與本檔已算好的 truth（`r.playerRank`／`r.champion`／`r.top4[0]`／
`r.playerRegularRank`）**逐值比對**。原版連冠軍是誰都沒驗，遷移後驗得到 ⇒
這是收緊，不是放寬。

### 一次判斷失誤與撤回

先前把 `RecapLeague` 的區塊標題 `國內聯賽` 改成 `官方聯賽`（理由：全 repo 只有
這一處用「國內」）。查規格 §S 後**撤回**：那四個標題（`洲際冠軍賽`／`洲際巡迴`／
`國內聯賽`／`結算`）是刻意設計的**層級階梯眉標**，編碼的是賽事層級由「世界」
收束到「你的帳戶」，不是賽事本名。現行檔案與 `ed8cc84` 逐字相同。
教訓：動一個看起來像筆誤的字串前，先查它有沒有規格。

### 驗證（全部實跑，輸出見下）

| 項目 | 結果 |
|---|---|
| Competition Release Gate（基線 `4256ab3`，10 區段） | **10/10 PASS** |
| Competition Release Gate（整合後，11 區段，新增 `season_recap`） | **11/11 PASS** |
| `browser_check_season_recap_ui` | **19/19 通過** |
| `browser_check_q6`（遷移後） | **20/20 通過** |
| `check_team_development_v1` / `_recovery` | PASS / PASS |
| `check_r63_active_match` | 13/13 |
| `check_r63_active_match_ttl` | 9/9 |
| `check_r63_competition_integration` | 19/19 |
| `check_r61_ui_fixture` / `check_r62_player_ui_fixture` | PASS / PASS |
| `npm run build` | ✓ built in 21s |
| 瀏覽器 desktop 1280 / mobile 390 | 兩份存檔各截圖，`review/q7f-season-recap/`，pageErrors 0 |

Team Development／schema v10／R60 consumers／R63 ActiveMatch／SeasonState v2／
profileStore 一律**未改動**（`git diff --name-only origin/main` 不含這些檔）。
本輪沒有為了 Q7f 動任何 ActiveMatch production code；ActiveMatch valid resume
仍是 Codex 記錄的 UNVERIFIED（正式站 session 逾期＋browser tool 接不了
Chrome 原生 confirmation dialog），**不因本輪改變**。

### 已收口

`review/fixtures/competition/README.md` 的「已知未收口」清空：
Q7f gate 是最後一支讀 repo 外存檔的 gate，改路徑後 `tools/` 底下已無此類依賴。

## Q7f Season Recap 部署（2026-08-20，main `5608588`）

上一節（`integration/q7f-season-recap`）完成整合後，本節是**正式部署**的紀錄。

### 兩次 remote 前進與處置

Push 前 `origin/main` 兩度前進（都是 Ray 自己的 Sprint 63 MOBA result layout 線）：
`4256ab3` → `98bea05`（21:58）→ `76564a0`（22:08）。ff-only push 被 remote 正確拒絕。

**沒有 force、沒有 rebase main。** 處置是把 `integration/q7f-season-recap`
rebase 到 `76564a0` 上（`01d9e03` → `5608588`），main 仍保持線性、仍走 ff-only：

- 新舊兩顆 main commit 與 Q7f 的檔案清單**零重疊**（`comm -12` 空）。
- rebase 前後 Q7f 自己的 diffstat 逐檔相同（`diff` 兩份 `--stat` 無輸出）。
- integration branch 用 `--force-with-lease` 更新，**只動那條 branch**。
- 本地 main 用 `git reset --keep`（非 `--hard`）對齊 remote 後再 ff-only merge。

### 部署前驗證（在 `5608588` 的樹上實跑）

| 項目 | 結果 |
|---|---|
| Competition Release Gate（11 區段） | **11/11 PASS**，exit 0 |
| `check_moba_result_layout`（main 新併入的 verifier） | **49/49 PASS** |
| `check_team_development_v1` / `_recovery` | PASS / PASS（含「首頁主要入口磚為戰隊發展」「不再以天賦為主磚」） |
| R60 五個 consumers | BanPick／MOBA Tactic／CS Tactic／Roster／Recruit 全部「已接線」，INTEGRATED |
| `check_r63_active_match` / `_ttl` / `_competition_integration` | 13/13 · 9/9 · 19/19 |
| `check_r61_ui_fixture` / `check_r62_player_ui_fixture` | PASS / PASS |
| production build | ✓ built in 14.8s |

### 部署

- Pages run `32380723889`（`5608588`）→ **completed / success**。
- 正式站 `index.html` 指向 `assets/index-DNslv2Fh.js`，與本地 build 的 bundle
  檔名逐字相同；`Content-Length: 2935300`，`Last-Modified: 2026-08-20 14:33:27 GMT`。

### Production smoke（`https://rayhuang0323.github.io/ESMO-/`，21/21 通過）

存檔由 repo fixture 整包注入 `localStorage`（正式站是 minified bundle，叫不到模組——
沿用既有做法）。截圖在 `review/q7f-production-smoke/`。

- **Q7f**：Recap 出現（S1 · 德國海豹 · 奪下亞洲年度冠軍）；年度榮耀逐值；
  亞洲年度總決賽 qualified/rank 1/冠軍德國海豹（我方）；亞洲巡迴 第 1 名 450 分 3 站；
  國內聯賽 第 8 名 / 8 隊 · 暗影狼群；獎金欄位有值；CTA 全 DOM 恰好一顆且在 Recap
  之後、可見；Recap 內無 undefined／NaN。
- **playoff row**：canonical `s7b_season_sealed` 上逐值帶出
  `stage:comp:moba:s1:official:regular:playoffs`——Q7f 第二輪撤回「恆為 null」那個
  結論在正式站得到印證。
- **rollover**：按 CTA 後 Recap 與 CTA 一起消失，賽季 S1 → S2 且已落盤。
- **跨工作線**：首頁主磚是「戰隊發展」、無舊「天賦」主磚、戰隊發展進得去、
  賽事頁正常、MOBA 賽前配置入口正常、**全程 0 個新 app error**。
- **390 mobile**：Recap 出現、`scrollWidth === clientWidth === 390`（無水平溢出）、CTA 可見。

### ActiveMatch valid resume：UNVERIFIED → **VERIFIED**

原本記為 acceptance debt，成因是「browser tool 接不了 Chrome 原生 confirmation
dialog」。CDP harness 可以自己接 `Page.javascriptDialogOpening`，因此本輪順帶驗了：

- 正式站建立新的 MOBA session 至 `state: launched` 且帶有效 ActiveMatch snapshot。
- reload 後畫面提供「返回進行中的比賽」，**按下去真的回到同一場**（vs 赤焰軍團 選角階段）。
- `sessionId: session:moba:7d23aac8`、`seed: 48648` 在 reload 與 resume 前後逐值一致。
- **原生 dialog 出現 0 次** ⇒ 當初記錄的阻塞條件在現行版本上已不成立。

⚠ 誠實範圍：這一份樣本是 **Ban/Pick 階段**的 launched session（`matchId` 尚為 null）。
「戰鬥進行到一半再 resume」沒有被這一輪走到，仍屬未實測。
本輪**沒有修改任何 ActiveMatch production code**。

⚠ 過程中我第一次把這條判成 UNVERIFIED，是**我的斷言寫錯**（regex 找
「返回比賽」，實際按鈕文字是「返回進行中的比賽」），不是產品缺陷。

## Q7 Season / Competition MVP — Manual Save Acceptance：**CLOSED**（2026-08-20）

先前所有「賽季結束」的證據都建立在合成 fixture 上。這一輪補的正是唯一沒被覆蓋的
路徑：**Ray 的真實舊存檔，用真實 gameplay action，從賽季中段一路走到封存與換季。**

### 方法（重要：不是注入 sealed fixture）

- 存檔來源：Ray 自己在正式站匯出的 `esmo.profile.v1`（130,509 codepoints）。
  他在 Console 只跑 `getItem` → Blob → 下載，**沒有任何寫入**。
- 執行環境：獨立 `--user-data-dir` 的測試 Chrome，打**正式站**
  `https://rayhuang0323.github.io/ESMO-/`。Ray 的瀏覽器與存檔全程未被改動。
- 存檔**只在最開頭注入一次**（起始狀態，非結果狀態）。之後每一次狀態變化都由
  畫面上的正式操作產生：
  - **訓練中心 → 指派「休息調整」→ ⏭️ 推進訓練日**（未指派訓練時該鍵是 no-op）
  - **賽事頁 → 棄權 → 確定棄權**（二次確認）
  - AI 之間的場次由推進天數時自動模擬——這是既有產品行為，不是測試捷徑。

### 走完的 lifecycle

| | 起始 | 結束 |
|---|---|---|
| 遊戲日 | 第 12 天 | 第 109 天 |
| 賽季 | S1 進行中 | S2（S1 已封存於第 103 天） |
| 場次 | 0 / 140 | **148 / 148** |
| Event | 4 | **5**（亞洲年度總決賽於賽季中依規則自動產生） |
| 已封存 Event | 0 | 5 |
| 我方場次 | — | 35 場全部以 `棄權` 結算 |
| competitionHistory | 0 筆 | 1 筆 |

亞洲年度總決賽跑出真實對戰表：準決賽第 101 天、決賽第 103 天，寒冰守衛奪冠，
比分 27:17 / 23:17——全部由 lifecycle 產生，沒有任何一格是注入的。

### 結果：22/22 PASS

- **① 舊存檔載入**：隊名／天數／賽季／schema 逐值等於檔案，`final` 為 null。
- **② 賽事頁**正常；**③ standings 8 隊、巡迴 0/3 站**起始狀態正確。
- **④ 自然封存**：`final.season = 1`、`sealedAtDay = 103`。
- **⑤ Recap 由真實 lifecycle 產生**：`S1 · 德國海豹 · 第 1 賽季完賽`。
- **⑥ 資料逐值對得上封存物件**：
  - 國內聯賽 第 8 名 / 8 隊 · 冠軍烈焰鳳凰（＝ `careerFinal` 的 rows／playerRank／championTeamId）
  - 年度榮耀：存檔 honors 有 1 筆但**冠軍是 AI**，⇒ RecapHonor 不 render、
    摘要 `data-champion="false"`。這正是規格要的（金色只代表我方奪冠）。
  - 亞洲年度總決賽：`qualified=false`、無我方名次、世界冠軍寒冰守衛。
  - 巡迴：3 站與存檔 `pointsLog` 我方筆數一致，第 8 名 68 分。
  - 獎金：「無（前四名才有）」與收據一致（有收據、金額 0）。
- **⑦ 無 undefined／NaN**（Recap 內與整頁）。
- **⑧ CTA 全 DOM 恰好一顆**且在 Recap 之後；390 mobile 無水平溢出、CTA 可見。
- **⑨ rollover**：S1 → S2、`final` 清空、Recap 與 CTA 一起消失、S1 進入 history。
- **⑩ reload 後仍 S2**，history 仍在，schema 仍為 10。
- **⑪ Team Development**：`TeamDevelopmentState.v1` 的 version／點數／ranks
  在整季推進前後**逐值不變**，主入口仍進得去。ActiveMatch session 停在 `completed`，
  未被賽季流程污染。
- **⑫ 全程 0 個 runtime error。**

截圖：`review/q7-manual-save-acceptance/`。

### 一個過程中的自我修正

第一版的棄權迴圈只數點擊次數，`outcomes` 其實沒有變——因為棄權有二次確認
（「確定棄權」）。當時 log 顯示「已棄權 67」卻 `outcomes` 卡在 3，是假的進度。
改成以 `outcomes` 實際增加為準才是真的。教訓：**驗收計數要數狀態變化，不要數操作次數。**

### 結論

**Q7 Season / Competition MVP：CLOSED。**
舊存檔相容性是先前唯一未覆蓋的一層，現在有真實 lifecycle 的實跑證據。

## P0.6B Home Command Center / Team Overview contract（2026-08-20，docs + tools only）

### Scope

- 本輪只補共同產品契約與 static verifier，不開始 R64／R65，不修改 `src`，不 cherry-pick、
  merge、push 或 deploy。
- 基準固定為 production stable `76564a052075e9fe35ee592e2172f9fa0a3a8570`。既有
  `2b1c43d`（R64）與 `de27f0a`（R65）只作 reference。

### Contract

- Home Command Center（`dashboard`）負責「現在最需要處理什麼」：ActiveMatch、Competition、
  Team Development、近期事件／提醒的摘要與入口；只讀既有 store／selectors，不新增 gameplay truth。
- Team Overview（`team`／現行 `TeamScreen.jsx`）負責「整支戰隊現在是什麼狀態」：戰隊身份、
  整體狀態、分部／近期表現、精簡陣容與 Team Development 摘要。完整名單留 Roster，個人
  深入資料留 Player Profile，本場出賽／陣容決策留 Match Prep。
- 不可倒退 Team Development primary、schema v10、R60 consumers、ActiveMatch.v1、Competition／
  SeasonState v2、Player Profile 四分頁與 Roster／Match Prep 資訊責任。R64／R65 不得整檔覆蓋
  高衝突檔案，後續一律從 current baseline selective integration。

### Verifier／ownership

- `node tools/check_home_team_contract.mjs` 檢查五個 route／責任 marker、兩個關鍵入口與上述
  runtime contract marker；內建 memory-only mutation sentinel，Team Development primary 被舊版
  `talentPick`／「天賦」降級時必須 RED。
- 下一階段 R64 由 Codex implementation-owned；R65 在 R64 stable／deployed 前 frozen。其他 AI
  先更新交接／handoff，不得平行覆蓋同一責任區。

---

## CS 終局完成邊界修復（2026-08-21）

### Audit 結論

CS 引擎原本的產品規則是 first-to-8，不是 first-to-7：`37c07ef` 起的模擬迴圈以最高分 `<8` 為繼續條件，`matchOver` 也以最高分 `>=8` 為完成條件；既有 `check_cs23` fixture 使用 8:3／5:8，CS reward margin 也以 8 為滿分基準。`ROUNDS=13` 是上限遺漏，無法覆蓋 6:6 之後最多三局的 first-to-8 決勝空間。

### 實作與防回歸

- `src/battle/fps/EsportsFPS3D.jsx`：只將 simulation 上限改為 15；不動任何回合內程式、RNG call site、傷害、經濟、AI、槍械、地圖、戰術或結果契約。
- `tools/check_cs_match_completion.mjs`：以固定 6:6 fixture 重現舊 R13 最後 frame 7:6 不完成，並驗證修復後 8:7、natural／Quick Finish 共用 `matchOver`、`onComplete` exactly once、CsMatchResult／settlement chain。
- `tools/verify.mjs` 新增 `cs_match_completion` segment；未降低既有 assertion、未 rebaseline。

### Browser smoke closure（2026-08-21）

- `tools/browser_check_cs_completion.mjs` 以隔離 Chrome／本機 Vite 走正式 Dashboard → CS 賽前 → 選圖 → 戰術 → 對戰 → CsMatchResult 流程：1920×1080 自然 4×播放 PASS、1366×768 Quick Finish PASS、390×844 Quick Finish PASS。
- 三個 scenario 均由 `407/407` 最後 frame 進入正式賽後報告；桌面與 390px 均無水平溢位，console/page error 均為 0。Vite／Chrome 已由 harness finally 清理；390px 為 CDP device emulation，仍不等同真機觸控／FPS。

## CS MR12 單張地圖正式化 v1（2026-08-21）

### Scope

- 只修改 FPS 單張 map runtime、FPS-only completion／matchup verifier 與 browser verifier timeout；沒有改一般傷害、AI、武器、地圖、戰術數值或一般經濟公式。
- `EsportsFPS3D.jsx` 以 stable team identity 作 score、tactic ownership、economy 與 winner truth；`currentSide` 只代表該回合 T／CT。
- `tools/check_cs_match_completion.mjs` 覆蓋 MR12、halftime、OT MR3、economy reset、final-frame completion、Quick Finish、exactly-once callback、MatchResult mapping 與 same-seed determinism。

### Result

- completion `31/31 PASS`；CS23 `28/28`；R54、R56、R57 PASS（R57：10 pairs × 2 orientations × 6 seeds = 120 matches，deterministic repeat=1）。
- `npm.cmd run build` PASS（Vite 2702 modules transformed）。browser `3/3 PASS`：1920×1080 natural、1366×768 Quick Finish、390×844 Quick Finish；三者 `1002/1002`，DOM 無水平溢位，console/page error `0`。
- R10 仍停在既有 `R48_LEGACY_R47_SHA` mismatch，沒有改 legacy source gate 或 rebaseline。

### Contract / ownership

- `CsMatchResult`、`settleCsMatch` 與 Competition／FixtureOutcome contract 未修改；沒有觸碰 SeasonState、Competition、Event、Fixture、Ranking、亞洲賽季、BO1／BO3、Claude branch 或 MOBA。

## CS MR12 OT 經濟規則更正（2026-08-21）

### Root cause / minimal fix

- 追查後確認上一版 `resetEconomy(reason)` 對所有帶有 reset reason 的回合都寫入 `$800`，`pistolRound` 也以「是否有 reset reason」判定；所以 OT 原本是 `$800 + pistol`。
- 本次只在 `src/battle/fps/EsportsFPS3D.jsx` 增加 regulation／OT 起始資金常數與 reason classifier：`match-start`／`halftime` 為 `$800 + pistol`，`ot-group-*` 為 `$12,500 + non-pistol`。
- OT period 的 6 局、3 局換邊、3:3 下一組、stable team identity／score／winner 及原本 loss-streak／一般經濟公式均保留；沒有改傷害、AI、武器或賽事 contract。

### Verification

- `check_cs_match_completion.mjs` 由 `31/31` 擴充為 `34/34 PASS`，新增 regulation opening `$800`，並以 rule fixture 與 live simulator 確認 halftime `$800` pistol、第一組 OT／換邊後／下一組 OT 均 `$12,500` non-pistol。
- CS23 `28/28`、R54 PASS、R56 PASS、R57 PASS（120 matches，deterministic repeat=1）、`verify.mjs --only=cs_match_completion` `1/1`、Vite build（2702 modules）均 PASS。
- browser `3/3 PASS`：desktop 1920×1080 natural、desktop 1366×768 Quick Finish、390×844 mobile Quick Finish；均到 `1002/1002`、無水平溢位、console/page error `0`。390px 仍是 CDP emulation，非真機觸控／FPS 驗收。

## CS Season M0 — schema v11 / competitionByMode multi-mode foundation（2026-08-21）

分支 `feat/m0-schema-v11`（自 `plan/cs-season-architecture` `97de229`）。
本節在一次電腦當機後接續：當機發生在 `7e84fea`（只記錄 CS round-system ownership lock 的
文件 commit）之後、M0 實作開始之前，**沒有任何未提交的 M0 程式碼遺失**（audit 見下）。

### Crash recovery audit（動工前）

- `feat/m0-schema-v11` HEAD = `7e84fea`，working tree 除了 6 個 **0 bytes** 的殘留檔
  （`Claude`、`Codex`、`所有`、`交接細節見`、`前置：雙方都先讀`、`跨模型硬規則見`，
  時間戳 01:24–01:26）之外乾淨；那是一條 shell 指令被中文句子拆成多個重導向目標的產物，
  **不含任何內容**。依指示未刪除，留給使用者處置。
- 無 `index.lock`、無 `MERGE_HEAD` / `rebase-merge` / `CHERRY_PICK_HEAD`，無中斷的 git 操作。
- reflog 只有三筆（branch 建立 → commit → amend），沒有遺失的 commit。
- 當機前殘留 process：**無**。現存 node 皆為 Codex CLI 與其 MCP server，
  chrome / node 啟動時間全部晚於重開機，沒有卡住的 vite / verifier。

### 完成項

- `PROFILE_SCHEMA_VERSION` 10 → **11**；`competitionByMode = { moba, cs }` 與
  `competitionHistoryByMode = { moba, cs }` 成為唯一 canonical runtime structure。
- `competition` / `competitionHistory` 降為**唯讀別名**（永遠是 canonical 的同一個參考）。
  別名的寫入由 `routeCompetitionWrite()` 導回 canonical，**既有 20 幾個
  `set({ competition })` 呼叫端一行都沒改**；`useProfileStore.setState` 也一起包
  （6 支 browser gate 走的正是那條繞道）。
- v10（及更舊）存檔遷移為**純新增**：`competition` 搬進 `.moba`，`.cs` 為 `null`。
  **M0 結束時 CS 仍然沒有任何賽季。**
- 四支 API 加 mode 參數、預設 `"moba"`：`competitionView`、`ensureCompetitionSeason`、
  `activeCompetitionEvent`、`_syncSeasonStateV2`。未知 mode **丟例外**，不靜默回退。
- `ensureCompetitionSeason("cs")` 明確回 `ok:false`（未實作，屬 M1），
  刻意不掉進 MOBA 建立路徑生一季假的 CS 聯賽。
- 新增 `tools/check_cs_schema_v11.mjs`（40 條，含 mutation sentinel）。

### 未完成／不在本輪範圍

- M1（CS 聯賽 lifecycle）、M2（玩家實際出戰）一律未開始，依指示不碰 R64 / R65。
- CS battle runtime（round / half / overtime、`simulateFps` 回合語義、CS scoreboard）
  由 Codex 持有，本輪**一個檔案都沒動**（已逐檔核對）。

### 已知風險／代價（誠實揭露）

- **持久化 payload 變大約 46%**：別名必須留在存檔裡，因為既有至少 5 支 verifier /
  browser gate 直接讀 `JSON.parse(localStorage…).competition`。實測一份 S1 冠軍存檔
  總量 235,212 bytes、其中別名重複 108,457 bytes。要拿掉必須先改那些讀取端，屬獨立工作項。
- **兩個 verifier marker 隨升版更新，兩者都變嚴**：`check_home_team_contract.mjs` 的
  `PROFILE_SCHEMA_VERSION = 10` 字串比它要守的契約（§12「至少 v10」）更嚴，改為數值 ≥ 10
  並補上實質斷言 `sanitizeTeamDevelopment` 仍在載入路徑上；兩支 contract 的
  `competitionView()` marker 改為釘住 `competitionView(mode = DEFAULT_GAME_MODE)`
  ＋ `DEFAULT_GAME_MODE = "moba"`。理由記在 `docs/ai/跨模型交接流程.md` §13。
- **未經瀏覽器實測的項目**：本輪沒有手動在瀏覽器裡開舊存檔走一遍賽事頁。
  自動化的覆蓋來自 Competition Release Gate 的 7 支 browser gate（皆綠），
  但「玩家拿自己的真實存檔載入」這件事仍建議由使用者實測一次。

### 驗證（全部實跑，輸出貼在下方）

```
node tools/check_cs_schema_v11.mjs        CS schema v11 migration: 40/40 PASS
node tools/check_cs_season_contract.mjs   CS Season / Competition contract: 48/48 PASS
node tools/check_home_team_contract.mjs   Home / Team responsibility contract: 40/40 PASS
npm run build                             ✓ built in 13.69s

node tools/check_competition_release_gate.mjs
  PASS v2_runtime / v2_active_focus / v2_sealing_m2 / circuit_points / multi_event
  PASS career_final / asia_finals / team_honors / q6 / season_recap / build
  passed 11/11   failed 0/11   port 清理：✅ 無殘留
```

`check_cs_season_contract` 由 43 → 48 條（新增 §⑧ schema v11 五條結構錨點），
`check_cs_schema_v11` 為本輪新增。**刻意不把它加進 Competition Release Gate**：
規格 §3.4 把「Release Gate 的 11 個區段與其硬編碼通過數」列為不得倒退，
加成 12 區段會動到那個數字。它改由 `docs/ai/跨模型交接流程.md` §13 登記為 M0 的守門 verifier。

### M0 closure：真實存檔的瀏覽器 smoke（2026-08-21）

隔離 Chrome（`launchChrome` 每次開全新 temp user-data-dir）＋ 本機 Vite，
種入 Ray 匯出的**真實 v10 存檔**（`schemaVersion=10`、德國海豹 `team:97987358`、
第 12 天、5 名選手、$1,970,000、140 場賽程、`teamDevelopment.ranks.general_training_flow=1`），
真 reload 走完整 document 生命週期，讓 App 自己跑 v10 → v11 遷移。

```
M0 real-save smoke: 20/20 PASS
  真實 v10 存檔在瀏覽器正常載入            rootChildren=1 buttons=16
  schema 升到 11                            schemaVersion=11
  competitionByMode.moba 正常               fixtures=140 digest=49,598 bytes
  competitionByMode.cs 為 null
  competition 別名與 canonical 同一參考
  玩家資料逐值保留                          team/players/funds/days 全同
  Team Development 資料逐值保留             availablePoints=0 spent=1 ranks={general_training_flow:1}
  competitionView() 積分榜 8 列、進度存在
  賽事頁在真實 UI 開得起來（渲染出積分榜）
  戰隊發展頁在真實 UI 開得起來              development-route-summary 出現
  ensureCompetitionSeason("cs") 不建立賽季、cs 仍 null
  competitionView("cs") 為空且不回 MOBA 歷史
  碰 cs 之後 moba 與 seasonStateV2 逐值不變
  未知 mode 在真實 runtime 丟例外
  save 後 payload 帶 canonical、cs=null、別名仍在   180,203 bytes
  save → reload 後 13 個比對欄位全部相同
  reload 後 cs 仍 null、別名仍指向 canonical
  reload 後賽事頁仍然開得起來
  console error = 0（總 12 行，warning 0）
  page uncaught exception = 0
```

- 依指示**未跑完整賽季**（Q7 lifecycle 已由 Release Gate 的 `q6` / `season_recap` 驗過）。
- smoke 腳本是一次性的，放在 scratchpad **不進 repo**：它依賴 worktree 外的
  `C:\Users\ifikn\Downloads\esmo-save.json`，而 repo 慣例明文禁止 verifier 往 worktree 外找 fixture。
- 過程中修掉一條**腳本自己的**錯誤斷言（`raw.competitionByMode?.cs ?? "missing"` 把合法的
  `null` 也吃成 "missing"）。產品行為從頭到尾正確：同一輪的 reload 檢查直接讀取，量到的就是 `null`。
- 當機殘留的 6 個 0-byte 檔案已刪除（刪除前逐一確認 size=0 且 untracked）。
- payload duplication 已記為相容性技術債，見 `08_目前待辦與風險.md`，M0 不重構。

---

## CS Season M1 — CS 聯賽 lifecycle（2026-08-21）

分支 `feat/m0-schema-v11`，基線是 M0 stable `563b27a` ＋ closure `5d7cafb`。
**M1 只做 lifecycle：建立 → AI 模擬／玩家棄權 → 封存。玩家實際下場打 CS 屬 M2，本輪沒有接。**

### 開工前的 checkpoint 核對（不是照單全收）

Codex 提供的 CS battle stable checkpoint `codex/cs-mr12` @ `bc2ea5a`
（Sprint CS-MR12：MR12 / first-to-13 / halftime / OT MR3）逐項核對過：

- SHA 存在，且是該分支的 tip。
- 相對 merge-base `7c43a45` 只動了 `src/battle/fps/EsportsFPS3D.jsx`、
  `tools/check_cs_match_completion.mjs`、`tools/browser_check_cs_completion.mjs`、
  `tools/check_cs_matchup_acceptance_r57.mjs`、`tools/verify.mjs` 與四份文件。
- 使用者宣稱未被修改的六個檔案逐一核對為 **unchanged**：`CsMatchResult.js`、
  `settleCsMatch.js`、`competition.js`、`seasonState.js`、`regularSeason.js`、`profileStore.js`。
  ⇒ 與 M1 的變更面**零重疊**。

**M1 沒有 cherry-pick `bc2ea5a`，也不依賴它的程式碼**——只把它記為外部參考。

### 完成項

- `ensureCompetitionSeason("cs")` 建得出 CS 官方聯賽：8 隊雙循環、56 場、玩家 14 場，
  id 帶 `comp:cs:` / `fx:cs:` 命名空間，決定性（同存檔重載逐場相同）。
- `advanceDay` 同時結算兩個項目；共用 `meta.days`，採「先試算、取兩者交集、再落地」。
  **只有一個賽季時完全走舊路徑，一次都不多算。**
- CS 的 AI vs AI 由既有 `simulateFixture` 模擬；玩家賽程可 `forfeitFixture`，
  **fixture 自己認得出屬於哪個項目**，呼叫端不必傳 mode。
- CS 整季走得到封存，產出 8 列 FinalStandings 與 `playerRank`。
- 新增 `tools/check_cs_season_lifecycle.mjs`（47 條，含兩個 mutation sentinel）。

### ⛔ Ownership lock 遵守情況

Codex 的 CS battle runtime（round / half / overtime / `simulateFps` / scoreboard）
**本輪一個檔案都沒動**。Season 層對 CS 比分只寫**地圖數**（BO1 ⇒ `1:0`），
不寫回合數、不貼從擊殺差推導的局勢標籤，並另立模擬器版本
`fixtureSim.cs1+teamStrength.v1`。這三條由 `check_cs_season_contract.mjs` §⑩ 守住。

### 需要使用者裁示的一項內容決定

**CS 聯賽排除了 Neon Comets。** `csAiTeams.js` 有 8 支 AI，8 ＋ 玩家 ＝ 9 是奇數，
雙循環排不出來，規格 D3 又寫死 8 隊。實作採語意規則「排除 `strengthBand === "developing"`」
（目前唯一符合的就是 Neon Comets，資料上標為「高潛力新秀」）；
排掉唯一的 elite（Iron Vanguard）會讓聯賽沒有頭號強隊，更糟。
內容池分布一變 `csLeagueParticipants()` 會直接丟例外，不會靜默排出奇數隊。
**正解是把 CS 聯賽擴到 10 隊或讓新秀隊經 Major／升降級進來（M3 之後）。**

### 未完成／不在本輪範圍

- M2（玩家實際出戰 CS）、M3（年度 Major）、M4（Recap／換季）一律未開始。
- CS **沒有獎金政策**、**沒有季後賽**、**沒有寫進 honors**、**沒有換季**。
  這四項都是刻意留白，理由與 M3 該補什麼寫在規格 §3.3c 第 2、6 點與程式碼註解裡。
- 未碰 R64／R65。

### 兩個 era-scoped 舊斷言隨 M1 更新（兩者都變嚴）

- `check_competition_q2a.mjs` `8h)`：原本 grep `regularSeason.js` 有沒有字串 `"cs"`
  ——Q2a 時代的範圍標記。改成行為斷言「不傳 gameMode 時，賽事／賽段／每一場賽程與 id
  都不得出現 cs」。
- `check_competition_q4.mjs` §6：造「沒有賽季的舊存檔」時只 `delete saved.competition`，
  而 v11 起那只是別名 ⇒ 賽季仍會從 canonical 讀回來，6b/6c 誤紅。改成連
  `competitionByMode` 一起刪。**斷言一字未改，修的是 fixture 的構造。**
  這正是 M0 記下的 payload duplication 技術債第一次真的咬人。

### 未經瀏覽器實測

CS 賽事目前**沒有任何 UI**（M4 才做），所以本輪沒有瀏覽器 smoke。
自動化覆蓋來自 Competition Release Gate 的 7 支 browser gate（守的是 MOBA 沒被弄壞）。

### 驗證（全部實跑）

```
node tools/check_cs_season_lifecycle.mjs   CS Season M1 lifecycle: 49/49 PASS   ← 本輪新增
node tools/check_cs_schema_v11.mjs         CS schema v11 migration: 41/41 PASS
node tools/check_cs_season_contract.mjs    CS Season / Competition contract: 59/59 PASS
node tools/check_home_team_contract.mjs    Home / Team responsibility contract: 40/40 PASS
npm run build                              ✓ built in 23.11s

MOBA regression（賽事線）
  check_competition_q1    93/93     check_competition_q2a   112/112
  check_competition_q2b   92/92     check_competition_q3     91/91
  check_competition_q35   65/65     check_competition_q4     68/68
  check_competition_q5    69/69     check_competition_q6     57/57
MOBA regression（戰鬥線）
  tools/regress.mjs   結束率 15/15、平均時長 22.5 分、0 殺場 0、撤退鎖死 0
  tools/regress2.mjs  節奏門檻 8/8 通過

node tools/check_competition_release_gate.mjs
  PASS v2_runtime / v2_active_focus / v2_sealing_m2 / circuit_points / multi_event
  PASS career_final / asia_finals / team_honors / q6 / season_recap / build
  passed 11/11   failed 0/11   port 清理：✅ 無殘留
```

`check_cs_season_contract` 由 48 → 59 條（新增 §⑨ M1 結構錨點 7 條、
§⑩ ownership lock 4 條）。`check_cs_season_lifecycle` 為本輪新增。
兩支都**不加進 Competition Release Gate**：規格 §3.4 把「Release Gate 的 11 個區段
與其硬編碼通過數」列為不得倒退，加區段會動到那個數字。改由
`docs/ai/跨模型交接流程.md` §13 登記為 M0／M1 的守門 verifier。

---

## CS Season M1 修正 — 參賽資格改為明文設定（2026-08-21，使用者退回後）

M1 的 lifecycle 本身被接受，但參賽名單的**兩個契約觀念寫錯了**，使用者退回重做。

### 錯在哪（照實記，不要再犯）

1. **把 scheduler 的限制寫成產品規則。** 第一版的註解寫「8 支 AI ＋ 玩家 ＝ 9 隊是奇數，
   雙循環排不出來」。**這是錯的**：奇數隊在賽制上可以用輪空（bye）排循環賽，
   目前排不出來只是 `scheduleGenerator.js` 還沒實作——那支檔案自己的錯誤訊息就寫得很清楚
   （「循環賽**目前**不支援奇數隊（需要輪空機制）」）。隊數是**產品決策**，不是賽制的性質。
2. **拿 `strengthBand` 當參賽資格。** 第一版寫成
   `CS_AI_TEAMS.filter((t) => t.strengthBand !== "developing")`。`strengthBand` 是
   **實力描述**、是內容平衡的產物；用它當資格條件，日後有人把某隊調強或調弱，
   本季的聯賽名單就會**默默改變**。參賽資格不該被實力數值決定。

### 產品決策（使用者裁示）

- CS MVP 頂級聯賽維持 **8 隊總數**：玩家 ＋ 7 支 AI。
- **Neon Comets 定位為 development / challenger**：本季不參加頂級聯賽，也不直接進 Major。
- 未來 Qualifier／升降級／擴充到 10 隊時再納入。

### 改法

新增 `src/platform/competition/csSeasonConfig.js`——**明文的 participant eligibility**：

- `CS_LEAGUE_SEASONS[season].aiTeamKeys`：逐季列出參賽 AI 的 key，**不從任何欄位推導**。
- `CS_TEAM_STATUS`：`league` / `development`。定位與實力無關——
  一支 development 隊可以很強，一支 league 隊也可以很弱。
- **玩家席位不在設定裡**：CS 賽季是玩家的賽季，「玩家在不在名單裡」不該有第二種可能。
- 席次不符 ⇒ `csLeagueAiTeamsFor()` 直接丟例外，不靜默排出錯誤隊數。
- `CS_MAJOR_QUALIFICATION = { source: "league_standings", topN: 4 }` ＋ 純函式
  `csMajorQualifiers(standings)`：只從該季**聯賽積分榜**取前四，不做外卡、不補位、
  不接受額外隊伍清單 ⇒ 不在聯賽裡的隊伍**結構上**進不了 Major。
  （Major 的賽制與對戰表仍是 M3，這裡只定義資格從哪裡來。）

`regularSeason.js` 退回成純組裝：不再做任何條件篩選，參賽者向設定要。

⚠ **未修改 Codex 的 CS battle runtime**（本輪連 `src/battle/` 都沒有進去）。

### 新增 focused verifier

`tools/check_cs_league_eligibility.mjs`（31/31），五組對應使用者指定的驗收點：

```
§1 CS League 總數固定 8              6 條（含席次守衛的 mutation）
§2 玩家一定存在                       4 條（換玩家隊仍佔第一席）
§3 Major 只從聯賽 standings 前四晉級   7 條（空榜 ⇒ 0 席；兩隊 ⇒ 2 席，不補位）
§4 Neon Comets 本季不在 League/Major   8 條（含整季 56 場都沒有它的場次）
§5 strengthBand 不得決定 eligibility   6 條
```

§5 的 mutation sentinel 是這一支的重點：memory-only 把 Neon Comets 翻成 `elite`、
把 Shadow Wolves 翻成 `developing`，然後比較兩種規則——
**設定規則的答案不變，舊的 band 規則會換掉整份聯賽名單**。
`check_cs_season_contract.mjs` 另加反向斷言：資格相關的兩個檔案**都不得**出現
`strengthBand`，且「奇數隊」的限制必須留在 `scheduleGenerator.js` 自己身上。

### 驗證（全部實跑）

```
node tools/check_cs_league_eligibility.mjs  CS league eligibility: 31/31 PASS   ← 本輪新增
node tools/check_cs_season_lifecycle.mjs    CS Season M1 lifecycle: 50/50 PASS
node tools/check_cs_season_contract.mjs     CS Season / Competition contract: 62/62 PASS
node tools/check_cs_schema_v11.mjs          CS schema v11 migration: 41/41 PASS
node tools/check_home_team_contract.mjs     Home / Team responsibility contract: 40/40 PASS
npm run build                               ✓ built in 31.80s

MOBA regression（賽事線）q1 93/93、q2a 112/112、q2b 92/92、q3 91/91、
                          q35 65/65、q4 68/68、q5 69/69、q6 57/57

node tools/check_competition_release_gate.mjs
  11 區段全 PASS   passed 11/11   failed 0/11   port 清理：✅ 無殘留
```

`check_cs_season_contract` 由 59 → 62 條（§⑨ 改寫為設定導向，新增
「資格不得讀 strengthBand」與「奇數隊限制必須留在 scheduleGenerator」兩條反向斷言）。
`check_cs_season_lifecycle` 由 49 → 50 條（資格細節移交新的 focused verifier）。

**本輪未進入 `src/battle/`**，Codex 的 CS battle runtime 一個檔案都沒動。
未開始 M2。

---

## CS Cross-AI integration base（2026-08-21）

Codex 的 CS battle runtime 與 Claude 的 CS Season 平台第一次匯流。
分支 `integration/cs-cross-ai`，**只建 local commit，未 push、未 deploy**。

### Integration strategy

以 `origin/main` `651fedd`（Codex CS MR12 / halftime / OT economy）為 production base
開新分支，再把 Claude 的 `6def26f`（M0 ＋ M1）**merge** 進來。

**選 merge 而不是 cherry-pick 的理由**：兩側從共同祖先 `7c43a45` 分岔之後
**各自只動自己的責任區**——Codex 動 `src/battle/fps/`＋兩支 CS completion verifier，
Claude 動 `src/platform/competition/`＋`profileStore.js`＋CS Season verifier。
`git merge` 因此是零程式碼衝突的，而且保留兩條真實歷史；
cherry-pick 會把 7 顆 commit 重寫成新 SHA，之後誰也對不回原本的那條線。

### Conflict files（全部語意合併，沒有任何一份選邊）

| 檔案 | 衝突性質 | 解法 |
|---|---|---|
| `docs/handoff/00_目前專案狀態.md` | 雙方各自追加章節 | 保留雙方，P0.6B(08-20) → Codex CS(08-21) |
| `docs/handoff/05_Sprint紀錄.md` | 同上 | 保留雙方，P0.6B → Codex CS → Claude CS Season |
| `docs/handoff/06_目前主幹架構.md` | 同上 | 保留雙方，P0.6B → Codex CS runtime contract |
| `docs/handoff/08_目前待辦與風險.md` | 同上 | 保留雙方，P0.6B → Codex closure → schema v11 技術債 |

四份都是「兩邊在檔尾追加不同章節」，**內容零重疊**。
`05` 與 `08` 另外把我方區塊**拆開**，讓 Codex 的 08-21 章節插在
P0.6B(08-20) 與 Claude 的 CS Season(08-21) 之間 ⇒ 讀起來是真正的時間序。

⚠ **`tools/verify.mjs` 沒有衝突**（Codex 在裡面註冊了 `check_cs_match_completion`，
Claude 從未動過它），因此原樣保留 main 的版本。Claude 的 CS Season verifier
**刻意不加進去**：那是 CS gameplay R 系列的 runner，屬 Codex 的責任區。
要不要合併成單一 runner 是獨立工作項，需要雙方同意，本輪不擅自決定。

### 保留驗證

- **Codex battle runtime 完整保留**：`EsportsFPS3D.jsx`、`check_cs_match_completion.mjs`、
  `browser_check_cs_completion.mjs`、`check_cs_matchup_acceptance_r57.mjs`、`verify.mjs`
  逐檔比對 `git diff 651fedd -- <file>` **全部為空**。
- **Claude M0/M1 完整保留**：`PROFILE_SCHEMA_VERSION = 11`、`competitionByMode`、
  `csSeasonConfig.js`、四支 CS Season verifier 全部到位且全綠。

### 未做

- 未碰 R64／R65。
- **未開始 M2**（玩家實際出戰 CS）。
- 未 push、未 deploy。

---

## CS Season M2 — 玩家實際出戰 CS League Fixture（2026-08-21）

分支 `integration/cs-cross-ai`，基線是 Cross-AI stable `28c3583`。
**只建 local commit，未 push、未 deploy。M3 未開始。**

### 接線方式：沒有新增任何一條流程

整條鏈是既有零件依 `fixture.gameMode` 分流。Audit 時發現閘道層本來就是
mode-aware 的（`issueFor` 驗 `fixture.gameMode === entryRequest.mode`、
`matchEntry("cs")` 用 `csLineup`、`CsPrepScreen` 早就用共用的 `MatchPrepFrame`、
`settleCsMatch` 早就走 `settleMatchThroughSession` 這條唯一結算邊界），
真正的缺口只有三個 store action 寫死 `get().competition`，以及比分投影。

實際改動四處：

1. `startFixtureMatch` / `completeFixtureMatch` / `_writeFixtureResultFromMatch`
   → 由 `_modeOfFixture(fixtureId)` 解析項目。
2. `fixtureResultBridge` → CS 的 `FixtureOutcome.score` 投影成**地圖數**。
3. `AppShell` → `onPlay` 依指派單的項目導向（MOBA `lineup` / CS `csPrep`）。
4. `CsPrepScreen` → 加一個**暫用**的聯賽進場區塊（M4 應取代）。

### ⛔ Codex protected runtime

**沒有碰。** 本輪連 `src/battle/` 都沒有進去。對 Codex 責任區的唯一互動是
「讀 `CsMatchResult.winner`」——那是他已經判好的單圖勝負。
`MatchResult.v1` 對 CS 帶的回合比分（13:7）**一個數字都沒有被搬進賽程**。
契約 §⑪ 加了反向斷言：`fixtureResultBridge.js` 的程式碼不得出現
`ourScore` / `enemyScore` / `scoreT` / `scoreCT` / `roundCount`。

### 兩件實測後修正的認知（第一版斷言寫錯，照實記）

1. **「同一場不可重複 launch」≠「同一場不准再按」。** 既有規則（Q3.6）是
   重新進入同一場**允許**（`refixture`），但不得換 seed／對手、不得產生第二場；
   有**進行中的場次**時，別的賽程才會被擋。第一版把正常的重新進場當成缺陷。
2. **中離規避不了敗場，機制是「日曆被擋住」不是「逾期補判」。**
   有未收尾的玩家賽程時 `advanceDay` 一天都推不動
   （`stoppedBy.code = "player_fixture"`，訊息「請先出賽或棄權」）。
   唯二出路是打完或明確棄權。這比我原本假設的機制**更強**。

### 發現並記錄的既有缺口（非本輪造成，未修）

`startFixtureMatch` 的併發守衛判的是「有沒有進行中的**場次**」。在
「房間已開、場次未簽出」的空窗期切去另一場賽程不會被擋，前一場留在 `launched`。
**不構成規避敗場的漏洞**（日曆仍會被擋住），但兩場同時 `launched` 是不乾淨的狀態。
MOBA 同樣成立且早於本輪。詳見 `08_目前待辦與風險.md`；修它會改到共用的進場守衛，
屬獨立工作項。

### 未做

- M3（年度 Major / BO3）未開始；CS 仍只有 BO1 聯賽。
- 未碰 R64／R65。
- **未經瀏覽器實測**：本輪沒有跑 CS 的 browser gate。自動化覆蓋來自
  55 條 store 層斷言 ＋ Release Gate 的 7 支 MOBA browser gate。
  真正在瀏覽器裡打一場 CS 聯賽賽程，建議由使用者或 M4 的 UI 驗收一併做。

### 驗證（全部實跑）

```
node tools/check_cs_season_m2.mjs           CS Season M2 player fixture: 55/55 PASS  ← 本輪新增
node tools/check_cs_season_lifecycle.mjs    CS Season M1 lifecycle: 50/50 PASS
node tools/check_cs_league_eligibility.mjs  CS league eligibility: 31/31 PASS
node tools/check_cs_schema_v11.mjs          CS schema v11 migration: 41/41 PASS
node tools/check_cs_season_contract.mjs     CS Season / Competition contract: 68/68 PASS
node tools/check_home_team_contract.mjs     Home / Team responsibility contract: 40/40 PASS

Codex 側   check_cs_match_completion 34/34 · check_cs23 28/28

ActiveMatch / 重複結算（既有 R63 gate，直接覆蓋 M2 的要求）
  check_r63_active_match          13/13
  check_r63_active_match_ttl       9/9
  check_r63_competition_integration 19/19（含 duplicate result 不產生第二筆 outcome／settlement）

MOBA regression  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
                 q4 68/68 · q5 69/69 · q6 57/57
                 regress 15/15 · regress2 8/8

node tools/check_competition_release_gate.mjs   passed 11/11  failed 0/11  無殘留 port
npm run build                                   ✓ built in 9.40s
```

`check_cs_season_contract` 由 62 → 68 條（新增 §⑪ M2 六條，含
「橋接不得讀 Codex 回合欄位」的反向斷言）。`check_cs_season_m2` 為本輪新增。

⚠ **又一個 era-scoped marker 隨 M2 更新**：`check_competition_q35.mjs` 的 `4c)`
原本 grep 字面 `onPlay={go("lineup")}`。M2 起導向要依項目決定，那個字面不再成立。
改成**更嚴**的版本：導向函式必須存在、兩個目的地必須是 `lineup` 與 `csPrep`、
且 `matchmaking`（純過場動畫）依然不得是 onPlay 的目的地；另加 `4c1)`
確認 CS 賽前頁同樣跑真正的賽前流程框架。q35 因此由 65 → 66 條。

---

## CS Season M3-1 — 年度 Major（single_elim lifecycle）　2026-08-21

**分支**：`integration/cs-cross-ai`（起點：cross-AI checkpoint `06a7e89`）
**規格**：`docs/design/CS_賽事系統架構規格.md` D3 / D4 / §5
**計畫**：`docs/superpowers/plans/2026-08-21-cs-season-competition.md` M3-1

### 做了什麼

CS 官方聯賽打完之後，**年度 Major 會自己長出來**：積分榜前四晉級、排成四隊單淘汰
（sf1 / sf2 / bronze / final）、AI 可完整打完、冠軍決定 Major 自己的 FinalStandings，
之後 CS 賽季才封得起來。CS 一季因此從一個 Event 變成**兩個 Event**（聯賽 ＋ Major）。

| 檔案 | 動作 |
|---|---|
| `src/platform/competition/csMajor.js` | 新增。Major 的 Event / Competition / Stage / 晉級名單組裝 |
| `src/platform/competition/seasonState.js` | 新增 `ensureCsMajor` / `csMajorEntryOf` / `csMajorFixturesOf` / `isCsMajorDone` |
| `src/platform/competition/playoffs.js` | `createPlayoffStage` 加選用 `key` 參數（預設值不變 ⇒ MOBA stage.id 逐字不變） |
| `src/platform/profileStore.js` | `_sealCsSeasonIfFinished` 在封存前先 `ensureCsMajor`；聯賽／Major 兩種收件匣文案 |
| `tools/check_cs_major.mjs` | 新增，70/70 |
| `tools/check_cs_season_lifecycle.mjs` | 兩條斷言隨「CS 變成兩個 Event」更新（見下） |

### 三個關鍵設計決策

1. **不重寫對戰表產生器，共用 `playoffs.js`。** Major 與 MOBA 季後賽在賽制上是
   同一件事（4 隊單淘汰），配對規則、分兩輪產生、冠亞季殿順序全部沿用 Q6 驗過的
   那一套。`csMajor.js` 只負責 `playoffs.js` 不該知道的三件事：席位從哪張榜來、
   它是獨立的 Event、排在聯賽之後的哪幾天。
   ⚠ **計畫原本寫的 `buildSingleElim()` ＋ `IMPLEMENTED_FORMATS` 加 `single_elim`
   兩項都沒有做**，理由見下方「與計畫的偏差」。

2. **Major 賽制條目的 `stage` 與 `playoff` 指向同一個賽段。** 聯賽是「循環賽 ＋
   季後賽」⇒ 兩個賽段；**Major 整個賽制就是一張對戰表** ⇒ 同一個。這不是把資料
   存兩份，而是照實宣告「這個賽制從頭到尾都是淘汰賽」，並且**免費拿到正確的封存
   行為**：`canSealEvent` 對宣告 `expectsPlayoff` 的賽制要求 `isPlayoffDoneOf`
   （四場都在、都收尾）。少了它，只排出兩場準決賽、兩場都打完的當下 `remaining`
   就是 0 ⇒ Major 會**用半張對戰表封存**，季軍戰與決賽還沒打就先發冠軍。
   verifier 有一條專門守這個窗口。

3. **晉級規則只有一份，而且用交叉比對釘死。** 席位由
   `csMajorQualifiers()`（`csSeasonConfig.js`，M1 就寫好的純函式）決定；
   `createQualification()` 只提供 `Qualification.v1` 的**形狀**。兩者逐值比對，
   **不一致就整個失敗**，不挑一個信 —— 否則日後改了設定卻沒生效會完全無聲。

### ⛔ Codex ownership lock：完全沒有碰

`EsportsFPS3D.jsx`、`check_cs_match_completion.mjs`、`verify.mjs` **一個字都沒改**。
Major 的比分走既有的 CS 投影（`fixtureSim.cs1`，地圖數），verifier §3 逐筆驗
「兩側都 ≤ 2」「沒有地圖識別碼」「沒有 round / half / overtime 語義欄位」。
`check_cs_match_completion` 仍 34/34。

### 與計畫的偏差（兩項，都是刻意的）

1. **沒有新增 `buildSingleElim()` 到 `scheduleGenerator.js`。** 那會變成第二套
   單淘汰產生器，與 `playoffs.js` 重複 —— 違反「不建第二套」。
2. **沒有把 `single_elim` 加進 `IMPLEMENTED_FORMATS`。** 那個常數的語意是
   「`generateSchedule()` 排得出來的賽制」，而 `generateSchedule()` 仍然只會排
   循環賽（Major 根本不經過它）。加進去等於讓常數說謊。

### M1 verifier 的兩條斷言隨行為更新（不是放寬）

CS 現在有兩個 Event ⇒ 賽季層封存物是 `SeasonSeal.v1`，它**依設計沒有 `id`**
（多 Event 的賽季不再產生單一總名次）。原本的
「CS 的 final 沒有出現在名次獎金帳本裡」讀 `csFinal.id` ⇒ `undefined` ⇒ 轉紅。
改成檢查**每一個 Event 的 FinalStandings id**（那才是獎金結算真正的冪等鍵），
並新增一條「兩個 Event 的賽季用 SeasonSeal.v1 封存」。M1 由 50 → 51 條。

### 驗證（全部實跑）

```
node tools/check_cs_major.mjs                    70/70   ← 本輪新增
node tools/check_cs_season_contract.mjs          68/68
node tools/check_cs_schema_v11.mjs               41/41   (M0)
node tools/check_cs_season_lifecycle.mjs         51/51   (M1，50 → 51)
node tools/check_cs_season_m2.mjs                55/55   (M2)
node tools/check_cs_league_eligibility.mjs       31/31
node tools/check_home_team_contract.mjs          40/40
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_r63_active_match_ttl.mjs         9/9
node tools/check_competition_release_gate.mjs   11/11
MOBA regression  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
                 q4 68/68 · q5 69/69 · q6 57/57（季後賽路徑未動）
SeasonState v2   runtime 36/36 · active_focus 31/31 · sealing_m2 24/24
regress 15/15 · regress2 8/8
npm run build    ✓ built in 9.51s
```

⚠ **已知紅、非本輪造成**：`check_season_state_v2_migration_q7b.mjs` 以
`TypeError: Cannot read properties of undefined (reading 'id')` 失敗，因為它讀
Q7a-3b 就已移除的頂層 `state.competition`。已在 checkpoint `06a7e89` 開臨時
worktree 實跑確認**錯誤逐字相同** ⇒ 既有技術債，不是 M3-1 的回歸訊號。

⚠ **未經瀏覽器實測**：Major 目前**沒有任何 UI 入口**。玩家看得到的只有兩封
收件匣信（對戰表公布、Major 冠軍）。CS 賽事頁屬 M4。若玩家自己打進四強，
出戰入口沿用既有 fixture 流程（M2 已接），但**沒有在瀏覽器實測過**。

### 下一步

M3-2（BO3 series）**本輪刻意未動**：Major fixture 目前沒有 `matchFormat`，
比分是 BO1 語義的地圖數（`1:0`）。M3-2 要做的是掛上
`{ series: "bo3", mapPool: CS_MAPS, veto: null }` 並讓比分變成 `2:0` / `2:1`。
結構上已經備好 —— 一個 Fixture ＝ 一個 series ＝ 一筆 FixtureOutcome 的不變式
在本輪就成立，M3-2 只需要改比分的產生，不必動賽事結構。

---

## CS Season M3-2 — BO3 series 語義　2026-08-22

**分支**：`integration/cs-cross-ai`（起點：M3-1 checkpoint `b3a8d9b`）
**規格**：`docs/design/CS_賽事系統架構規格.md` D4
**計畫**：`docs/superpowers/plans/2026-08-21-cs-season-competition.md` M3-2

### 做了什麼

年度 Major 的每一場正式成為一個 **BO3 series**：fixture 帶
`matchFormat = { series: "bo3", mapPool: <引擎現役三張圖>, veto: null }`，
賽果的 `score` 是**地圖數**（2:0 / 2:1），先拿兩張者勝。
賽季層看到的仍然只有「誰贏了這個 series、拿下幾張圖」。

| 檔案 | 動作 |
|---|---|
| `csMajor.js` | 新增 `CS_MAJOR_SERIES` / `CS_MAJOR_MAPS_TO_WIN` / `CS_MAJOR_MATCH_FORMAT` |
| `playoffs.js` | `ensurePlayoffFixtures` 加選用 `matchFormat`（預設 null ⇒ MOBA 季後賽逐值不變）|
| `seasonState.js` | `ensureCsMajor` 把 `CS_MAJOR_MATCH_FORMAT` 掛到 Major 的每一場 |
| `simulateFixture.js` | 新增 series 分支與 `CS_SERIES_SIMULATOR_VERSION`；`simulatorVersionFor` 加 `matchFormat` 參數 |
| `fixtureResultBridge.js` | BO3 fail-closed（`series_incomplete`）|
| `profileStore.js` | `startFixtureMatch` 對 BO3 fail-closed（`series_not_playable`）|
| `tools/check_cs_series.mjs` | 新增，46/46 |
| `tools/check_cs_major.mjs` | 三條斷言隨 BO3 更新，70 → 72 |

### BO3 比分怎麼產生

**逐張地圖擲，擲到有人先拿滿兩張。** 每張地圖用同一個 `pA`（由 roster 的 16 項
能力推出的隊伍實力差），沒有第二套模型、**沒有任何回合概念**。

⚠ **勝方由地圖決定，不另外擲一次「誰贏這個 series」。** 分開擲的話，series 比分
與勝方會各有各的來源，可能互相矛盾（2:1 卻標成另一隊贏）。

⚠ **`fixtureSim.cs1.bo3` 是新版本，不是就地升版 `cs1`。** 投影公式不同就必須分版：
BO1 的 `1:0` 是「一場定勝負」，BO3 的 `2:1` 是「打了三張、拿下兩張」，
同一個版本字串說不了這兩件事。而且版本字串會進亂數流的 hash ——
就地升版會讓既有的 CS 聯賽賽果**全部平移**。

**已用基線實證**：在 `b3a8d9b` 開臨時 worktree 跑完整個 CS 聯賽，把 56 場的
`[fixtureId, winner, score, resultSource, simulatorVersion, duration]` 落成 JSON，
與本輪逐位元比對 ⇒ **IDENTICAL**。單場路徑的亂數消耗順序（roll → loserKills →
margin → duration）刻意保持不變，就是為了這個。

### 玩家出戰 BO3：兩道 fail-closed

一場 `MatchResult.v1` 只代表**一張地圖**，拿它結算一個 series 只有兩種寫法，
兩種都是錯的：記成 `1:0`（宣稱 BO3 打完了卻只打一張）、或記成 `2:0`
（憑空發明一張沒打的地圖）。所以**明確拒絕，不猜**：

1. `startFixtureMatch` 擋在**進場**（`series_not_playable`）
2. `fixtureOutcomeInputFrom` 擋在**結算**（`series_incomplete`）

⚠ 擋在進場是關鍵。若放玩家打完再由橋接拒絕，那一場會卡在 `launched`：
日曆被擋住（`advanceDay` 回 `player_fixture`），玩家既結算不了也不能重來 ——
**soft-lock**，比擋在門口糟得多。擋在進場則賽程維持 `scheduled`，
玩家仍可棄權或讓它逾期補判。

### 兩條刻意沒動的既有契約

1. **棄權仍記 `0:0`**（`FORFEIT_SCORE`，MOBA / CS 共用）。一張地圖都沒打，
   兩邊都是 0 才是誠實的；編一個 `2:0` 出來等於宣稱有人贏了兩張圖。
2. **CS 聯賽仍是 BO1**（`matchFormat` 為 null）。規格 D4 明文「MVP 做 BO1（聯賽）
   ＋ BO3（Major）」。

### mapPool 為什麼不違反 ownership lock

`matchFormat.mapPool` 會列出 `dust2 / mirage / inferno`。那是**賽制設定**，
不是賽果：它宣告「這個 series 可以用哪幾張圖」，不是「哪張圖裡發生了什麼」。
lock 擋的是後者。`check_cs_major.mjs` 因此把地圖識別碼的檢查對象縮到**賽果**，
並另加一條「地圖 key 只准出現在 mapPool，不得從別的欄位滲進賽季狀態」。

### 驗證（全部實跑）

```
node tools/check_cs_series.mjs                   46/46   ← 本輪新增
node tools/check_cs_major.mjs                    72/72   (M3-1，70 → 72)
node tools/check_cs_season_contract.mjs          68/68
node tools/check_cs_schema_v11.mjs               41/41   (M0)
node tools/check_cs_season_lifecycle.mjs         51/51   (M1)
node tools/check_cs_season_m2.mjs                55/55   (M2)
node tools/check_cs_league_eligibility.mjs       31/31
node tools/check_home_team_contract.mjs          40/40
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_r63_active_match_ttl.mjs         9/9
node tools/check_competition_release_gate.mjs   11/11
MOBA regression  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
                 q4 68/68 · q5 69/69 · q6 57/57
SeasonState v2   runtime 36/36 · active_focus 31/31 · sealing_m2 24/24
regress 15/15 · regress2 8/8
npm run build    ✓ built in 11.91s
基線比對         CS 聯賽 56 場賽果 vs b3a8d9b ⇒ IDENTICAL
```

⚠ **已知紅、非本輪造成**：`check_season_state_v2_migration_q7b.mjs`（讀 Q7a-3b
已移除的頂層 `state.competition`）。M3-1 已在 `06a7e89` 實證為既有技術債。

⚠ **未經瀏覽器實測**：Major 仍然沒有 UI。本輪新增的兩道 fail-closed 訊息
也沒有在畫面上看過。

### 下一步

M4：CS 賽事頁與 **series 流程**。玩家出戰 BO3 需要跨三張地圖的流程，
地圖結果累計住在 MatchSession / ActiveMatch（**不進 SeasonState**，規格 D4）。
做出來之後，上面那兩道 fail-closed 要一起拿掉。
M3-3（Major → honors ＋ CS 獎金）仍未做。

---

## CS Season M4-A — Playable BO3 Series　2026-08-22

**分支**：`integration/cs-cross-ai`（起點：M3-2 checkpoint `62d425b`）
**規格**：`docs/design/CS_賽事系統架構規格.md` D4

### 做了什麼

玩家現在**真的打得完**年度 Major 的 BO3。三張地圖各自走完既有的
CS MatchSession / ActiveMatch / MatchResult / S25 入帳，整個 series 只產生
**一筆** FixtureOutcome（2:0 / 2:1）。M3-2 的 `series_not_playable` /
`series_incomplete` 兩道 fail-closed 在完整流程成立之後才移除。

| 檔案 | 動作 |
|---|---|
| `contracts/matchSeries.js` | 新增。`MatchSeries.v1`：已完成地圖／每張 winner／地圖勝場／下一張 |
| `contracts/matchResult.js` | 衝突偵測對 series 改以**單張地圖**為範圍 |
| `progress/settleMatchResult.js` | 記地圖、series 未決勝就不收場次 |
| `competition/fixtureResultBridge.js` | series 比分由 `seriesScore()` 產生 |
| `profileStore.js` | 開場建 series、`activeSeriesView()`、解除進場擋門 |
| `AppShell.jsx` | csResult 之後若 series 未決勝 ⇒ 回選圖打下一張 |
| `tools/check_cs_playable_series.mjs` | 新增，75/75 |

### series state 放哪：`MatchSession.series`

規格 D4 說得很直接：賽季層只認 series 的最終結果。「第一張圖誰贏、下一張打哪張」
是**對戰流程的狀態**，不是賽季的事實。放進 SeasonState 會讓賽季狀態開始長出
地圖層級欄位 —— 正是 ownership lock 要擋的方向。

它累積的**只有四樣**：已完成的地圖（第幾張／哪張圖／誰贏／matchId／resultId）、
雙方地圖勝場、下一張是第幾張、下一張是哪張圖。
**沒有**回合、半場、加時、單圖比分。每張地圖的 `winner` 是**直接抄** Codex
判好的單圖勝負，不從任何比分推導。

### 兩個非做不可的契約調整

1. **衝突偵測改成 map-scoped（只對 series）。** 原本的規則是「同一個 sessionId
   出現兩份不同內容的結果 ⇒ conflict」。一個 BO3 會**正當地**回報三份不同結果，
   所以對 series 而言正確的定義是「**同一張地圖**被回報了兩種結果」。
   ⚠ **非 series 的場次一個字都沒放寬**（`check_authoritative_o7` 仍 48/48）。
   判斷依據是 `session.series`——「這是不是 series」是**場次**的性質；
   讓送進來的結果自己宣稱的話，偽造一個欄位就能繞過衝突偵測。

2. **`completeSession` 不在第一張圖就收場次。** series 未決勝時場次維持
   `launched`，ActiveMatch 標成 `paused` 且 `phase` 退回 `map`。
   ⚠ 不能留在 `active`：那會讓首頁的「返回比賽」把玩家丟回一場已經打完的圖。

### 三張地圖怎麼串

`csPrep → csMap → csTactic → csLoading → cs → csResult` 打完一張之後，
`CsResultScreen.onDone` 問 store 的 `activeSeriesView()`：未決勝就呼叫
`resumeActiveMatch()`，恢復出來的 `phase` 是 `map` ⇒ 直接落回選圖畫面打下一張。
決勝了才回首頁。

⚠ 判斷來源是 **store 的 series 狀態**，不是畫面自己數打了幾張——畫面狀態重整
就沒了，series 跟著場次一起存檔。

### resume 怎麼處理

**沒有新機制**：跨地圖與重整走的是**同一條** `resumeMatchSession()`。
場次從來沒有結束、令牌早就用掉，所以恢復不會消耗第二張令牌，
`sessionId` 與 `origin.fixtureId` 都不變。verifier §7 逐條驗過：重載後
series 進度逐值不變、sessionId 相同、fixture 相同、`phase` 是 `map`、
`nextMapIndex` 是 1，然後**跨重載把 series 打完**仍然只寫一筆賽果。

### 冪等

`recordSeriesMap` 以 `matchId` 冪等。這不是附帶性質：重整或重送時
`settleMatchResultInState` 對「已入帳」的結果仍會走完整條路徑，
少了那道冪等，重整一次 Result 畫面就會把 2:0 變成 3:0。
另有一道獨立的守門：**已決勝的 series 拒收第三張地圖**——否則一個已經用
2:0 寫進賽季的 series 會被續寫成 2:1。

### 中途離開不能規避敗場

機制與 M2 對 CS 聯賽中離**完全相同**，series 沒有在上面開洞：未收尾的玩家
賽程會把日曆擋死（`pendingPlayerFixtureOn`）⇒ 玩家繞不過去，只能回去打完或
明確棄權，兩條路都留下結果。verifier §8 實測：中離後推進日曆會被
`stoppedBy.code = "player_fixture"` 擋在這一場，期間不生任何賽果；
棄權之後日曆才走得動，而結果是敗場。

### ⛔ Codex ownership：完全沒有碰

`EsportsFPS3D.jsx`、`check_cs_match_completion.mjs`、`verify.mjs` 一個字都沒改。
verifier 刻意讓每張地圖帶著 `13:7` / `7:13` 的**單圖回合比分**走完全程，
再斷言賽季層拿到的是 `2:0` / `2:1`，SeasonState 裡找不到任何回合量級的數字。

### 兩支既有 verifier 的 era-scoped marker 隨行為更新（換更嚴，不是放寬）

- `check_cs_series.mjs` §8：`series_incomplete` → `series_missing`
  （沒帶 series 就算不出地圖數，一律不猜。拒絕的性質沒放寬。）
- `check_cs_season_contract.mjs`：「橋接只記地圖數」那條原本 grep 一段被改寫的
  註解字面。改成同時要求 **BO1 的 `1:0`** 與 **series 的 `seriesScore(series)`**，
  另加三條新的：series 勝方不得抄最後一張地圖、未決勝／缺 series 要 fail-closed、
  **series 狀態不得出現在 seasonState.js**。該支由 68 → 71 條。

### 驗證（全部實跑）

```
node tools/check_cs_playable_series.mjs          75/75   ← 本輪新增
node tools/check_cs_series.mjs (M3-2)            46/46
node tools/check_cs_major.mjs (M3-1)             72/72
node tools/check_cs_season_m2.mjs (M2)           55/55
node tools/check_cs_season_lifecycle.mjs (M1)    51/51
node tools/check_cs_schema_v11.mjs (M0)          41/41
node tools/check_cs_season_contract.mjs          71/71   (68 → 71)
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_cs_league_eligibility.mjs       31/31
node tools/check_home_team_contract.mjs          40/40
node tools/check_competition_release_gate.mjs   11/11
── 共用契約（本輪動到 matchResult / matchSession 結算路徑，特別加驗）──
check_authoritative_o7        48/48    check_result_flow_o71    27/27
check_match_session_o6        36/36    check_match_room_o5      45/45
check_match_entry_o3          35/35    check_matchmaking_flow_acceptance 97/97
check_progress25              PASS     check_fixture_result_integrity 20/20
check_cs23                    28/28    check_r63_active_match_ttl 9/9
MOBA regression  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
                 q4 68/68 · q5 69/69 · q6 57/57
SeasonState v2   runtime 36/36 · active_focus 31/31 · sealing_m2 24/24
regress 15/15 · regress2 8/8
npm run build    ✓ built in 11.09s
```

⚠ **已知紅、非本輪造成**：`check_season_state_v2_migration_q7b.mjs`
（讀 Q7a-3b 已移除的頂層 `state.competition`），M3-1 已實證為既有技術債。

⚠ **未經瀏覽器實測**：verifier 沒有跑 CS 引擎本身（要 WebGL），走的是
`CsMatchResult.v1 → settleCsMatch → reportMatchResult` 這條正式路徑。
「打完一張圖之後畫面真的回到選圖」這一步**只在程式碼層驗過，沒有在瀏覽器看過**。

---

## CS Season M4-A.1 — series 跨 session 存活（gameplay integrity fix）　2026-08-22

**分支**：`integration/cs-cross-ai`（起點：M4-A checkpoint `b98dd44`）

### 兩個缺陷，都是**瀏覽器實測**抓到的

M4-A 的 verifier 全綠（75/75），但實際在瀏覽器把 Major BO3 打一遍之後，
抓到兩個 Node verifier 看不到的問題。這一輪是 focused fix。

#### ① 中離重進會把 series 洗回 0:0（本輪的主目標，M4-A 交接時已列為風險 ①）

`startFixtureMatch` 對還沒收尾的賽程允許重新進場（Q3.5 的房間逾時路徑），
而重新進場會**重簽一個新場次**。M4-A 把 series 掛在 `MatchSession.series` 上
⇒ 新場次＝新 series ⇒ **輸掉第一張圖之後中離再進場，就能把那張圖擦掉重打。**

#### ② 打完一張圖之後，玩家被丟回**已經打完的那張地圖**重打

`CsMatchScreen` 有一個卸載 effect：

```js
useEffect(() => () => { saveProgress(progressRef.current, { paused: true, force: true }); }, [saveProgress]);
```

而 `saveProgress` **永遠寫死 `phase: "battle"`**。它在結算之後才跑
（onFinish → settleCsMatch → setScreen("csResult") → 舊畫面卸載），
所以那一筆永遠比結算晚，把結算設好的 `phase: "map"` 與「已清空的快照」一起蓋回去。
結果：按「返回」時 `resumeActiveMatch()` 讀到 `phase: "battle"`，把玩家送回 Dust II
重打一次——**而重打會產生新的 matchId，有機會被記成 series 的第二張圖。**

⚠ 這一條 M4-A 的 verifier 抓不到，因為它是**畫面卸載時序**造成的，
Node 測試沒有 React 卸載這一拍。

### 修法

| 檔案 | 動作 |
|---|---|
| `profileStore.js` | 新增 `matchmaking.seriesByFixture`：series 進度以 **fixtureId** 為鍵 |
| `profileStore.js` | `seriesLedgerCarryingOver()`：清掉場次**之前**先把進度轉進帳本 |
| `profileStore.js` | `_clearSeriesForFixture()`：賽程收尾（完賽／棄權）就清掉 |
| `profileStore.js` | `saveActiveMatchSnapshot` 擋掉 series 翻頁後遲到的 `phase:"battle"` 回寫 |
| `settleMatchResult.js` | 結算時把 series 同步寫進 fixture 帳本 |
| `check_cs_playable_series.mjs` | 新增 §7b（跨 session）與 §7c（遲到快照），75 → 99 |

**series 進度放哪：`matchmaking.seriesByFixture[fixtureId]`。**

選它的理由是**生命週期對得上**：它比場次活得久（場次會被重簽），
又比賽季狀態早死（賽程一收尾就清掉）。這正是使用者指定的
「fixture-scoped runtime context」。

⚠ **仍然不在 SeasonState**（規格 D4）。`matchmaking` 是 match runtime，
不是賽季事實。verifier 有一條專門斷言 `seriesByFixture` 不出現在賽季狀態裡。

⚠ **帳本是權威，場次是投影**：`_withSeriesForFixture` 先查帳本，查到就沿用，
查不到才開新的並立刻寫進帳本（「開場 → 中離 → 重進」中間那段也必須有帳本，
否則重進一樣會開新的）。

### Browser smoke（實測，非程式碼推論）

環境註記：MCP 開的分頁在背景時 `document.visibilityState === "hidden"`，
Chrome 會把 `requestAnimationFrame` 與 `setTimeout` 一起節流 ⇒ CS 引擎跑不動。
**必須由人把該分頁切到前景**才跑得起來（本輪由使用者操作）。這一點寫下來，
下一個要做 CS browser gate 的人不必再查一次。

實測走到的：

1. 注入起始存檔 → Major fixture 在 localStorage 裡帶 `matchFormat.series = "bo3"`
2. CS 賽前頁出現「今日有你的聯賽賽程 · 出戰今日聯賽賽程」
   ⇒ M3-2 的 `series_not_playable` 擋門確實已解除
3. 出戰 → 房間確認 → 選 Dust II → 戰術 → **Codex 引擎真的打完一張圖**（13:10 勝）
4. 打完之後：`series.wins = 1:0`、`maps = ["dust2:us"]`、`nextMapKey = "mirage"`、
   `nextMapIndex = 1`、賽程仍 `launched`、**0 筆 FixtureOutcome**（中間地圖不寫賽程）
   ⇒ M4-A 的核心行為在真實瀏覽器成立
5. **抓到缺陷 ②**：按「返回」被送回 Dust II 重打（`1/1025 格`、R1、0:0）
6. 修好之後重測 **缺陷 ①**：中離 → 重新進場 ⇒ series 仍是 **0:1**、
   `maps = ["dust2:opponent"]`、`next=mirage`、同一場 `fx:cs:90b3ba4a`
   （截圖：`review/cs-m4a/browser_reentry_series_preserved.jpg`）

⚠ **缺陷 ② 的修正只有 Node verifier 驗過（§7c 6 條），沒有在瀏覽器複測**——
複測需要再完整跑一張圖，而那需要人一直把視窗留在前景。

### 驗證（全部實跑）

```
node tools/check_cs_playable_series.mjs          99/99   (M4-A 75 → 99)
node tools/check_cs_series.mjs (M3-2)            46/46
node tools/check_cs_major.mjs (M3-1)             72/72
node tools/check_cs_season_m2.mjs (M2)           55/55
node tools/check_cs_season_lifecycle.mjs (M1)    51/51
node tools/check_cs_schema_v11.mjs (M0)          41/41
node tools/check_cs_season_contract.mjs          71/71
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_competition_release_gate.mjs   11/11
共用契約  authoritative_o7 48/48 · result_flow_o71 27/27 · match_session_o6 36/36
         matchmaking_flow 97/97 · progress25 PASS · fixture_result_integrity 20/20
         cs23 28/28 · r63_active_match_ttl 9/9
MOBA     q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
         q4 68/68 · q5 69/69 · q6 57/57 · seasonstate_v2_runtime 36/36
npm run build    ✓ built in 11.88s
```

⚠ **已知紅、非本輪造成**：`check_season_state_v2_migration_q7b.mjs`（M3-1 已實證）。

---

## CS Season M4-A.1 — Browser Closure ＋ 選圖過濾　2026-08-22

**分支**：`integration/cs-cross-ai`（起點 `a3efdcf`）
**完整紀錄**：`review/cs-m4a/browser_closure_2026-08-22.md`

### Browser closure：7 / 7 PASS

三張地圖**都是 Codex 的 CS 引擎真的跑完的**（Dust II 勝 → Mirage 敗 → Inferno 勝），
注入起始存檔之後全程走正式 gameplay action。

1. Map 1 結束後回 **csMap**（`phase = map/active`）
2. series 1:0 → 1:1 → **2:1**（`dust2:us` / `mirage:opponent` / `inferno:us`）
3. next map 正確（1:0→mirage、1:1→inferno）
4. reload 保留 1:0、phase 仍 `map`、同一 fixture
5. **中離重進仍 1:0**（M4-A.1 的主修正，`fx:cs:90b3ba4a` 未變）
6. 最終 `status=decided winner=us`，fixture `completed`
7. **FixtureOutcome 只有一筆**：`winner=玩家 score=2:1 src=engine`

附帶在同一輪確認：中間地圖不寫賽程（打完兩張仍 `launched` + 0 筆賽果）、
賽程收尾後 series 帳本清空、bracket 推進到 bronze/final、
⛔ 賽季層最大比分 = 2、無 round/half/overtime 欄位、
`matchFormat.mapPool` 之外無地圖識別碼、賽季狀態內無 `MatchSeries`／`seriesByFixture`。

### 一併做掉的最小修正：已完成地圖不可再選

`CsMapSelectScreen` 先前三張圖全開放選，玩家可以在同一個 BO3 裡重挑打過的圖。
資料層本來就守得住（`recordSeriesMap` 以 matchId 冪等、仍是 first-to-2），
所以這是**呈現層**修正：打過的卡片 `disabled` ＋ 標「已打 · 我方勝／對手勝」，
另加一條 series banner（`BO3 1:1 · 第 3/3 張 · 先拿 2 張者勝`）。

⚠ 名單來源是 **store 的 series 狀態**，不是畫面自己記——重整之後畫面狀態就沒了。
⚠ banner **只顯示地圖數**，一個回合數字都不顯示（那是 Codex 的責任區）。

### ⚠ 一個失敗的嘗試，記下來免得有人重走

為了不必請人切前景，本輪試過用 `MessageChannel` 取代 `requestAnimationFrame`
（背景分頁的 rAF/`setTimeout` 被 Chrome 節流，MessageChannel 不會）。

**可行但有害**：短地圖（Mirage 956 格）跑得完，但決勝圖（Inferno 1375 格）
會變成**不讓出的忙迴圈**，把事件迴圈餓死 —— 連讀 localStorage 都做不到，
navigate 也搶不回控制權，最後只能關掉分頁重開。存檔沒壞，但等於白花時間。

⇒ **CS browser gate 目前必須由人把分頁切到前景。** 不要再嘗試替代 frame pump。

另一個容易誤判的點：CS 對戰**打完不會自動跳賽後頁**，要按
「📊 查看賽後戰報 · 領取獎勵」才會結算。第一次遇到會誤以為是計時器被節流。

### 驗證

```
node tools/check_cs_playable_series.mjs   99/99
node tools/check_competition_q35.mjs      66/66   （動到 CS 畫面，特別複跑）
npm run build                             ✓ built in 10.36s
browser closure                           7/7 PASS（見上）
```

---

## CS Season M3-3 — CS 年度冠軍榮耀 ＋ CS 獎金政策　2026-08-22

**分支**：`integration/cs-cross-ai`（起點 `bdd0ab2`）

補上 M1 就寫在 `_sealCsSeasonIfFinished` 註解裡、一路欠到現在的兩件事。

| 檔案 | 動作 |
|---|---|
| `economy/economyConfig.js` | 新增 `CS_MAJOR_PRIZE`、`PRIZE_TABLES`、`prizeTableFor()` |
| `competition/csMajor.js` | 新增 `CS_MAJOR_PRIZE_POLICY`；Major Event 掛上它 |
| `competition/honors.js` | 新增 `cs_annual_champion` 類型與 `csAnnualChampionHonorOf()` |
| `profileStore.js` | CS 封存路徑接上獎金結算與 `_recordHonors` |
| `tools/check_cs_major_honors_award.mjs` | 新增，45/45 |

### ① CS 年度冠軍寫進生涯榮耀

新增 `HONOR_TYPES.csAnnualChampion`，來源是**年度 Major 的 `Event.final`**。

⚠ **刻意是另一個 honorType，不是把亞洲年度冠軍參數化。** 兩者的來源賽事不同
（亞洲總決賽 vs 年度 Major）；合成一個類型之後，「這筆榮耀怎麼來的」就只剩
`gameMode` 可以猜。

⚠ **規則只有一份**：兩種榮耀共用新抽出的 `honorFromEvent()`，
所以 honors.js 檔頭那三條界線（唯一來源是 Event.final、一季一項一筆、
世界歷史不是玩家獎盃櫃）對 CS 一字不差地成立。`recordPendingHonors` 改成
逐個產生器跑一遍，各自以 id 判重 —— 不靠「MOBA 沒有 Major」這種巧合。

實測：玩家整季棄權 ⇒ 冠軍是 AI，榮耀照樣寫（世界歷史），
`teamHonorCount(玩家) === 0`。

### ② CS 獎金政策：只有 Major 發，而且用自己的表

**產品決定（2026-08-22）**，寫在 `CS_MAJOR_PRIZE` 的註解裡：

1. **只有年度 Major 發，CS 聯賽不發。** 聯賽是通往 Major 的資格賽；玩家同一條
   日曆上還跑著 MOBA 賽季，兩個項目都按聯賽發等於把一季的名次收入直接翻倍
   —— 那是經濟平衡的變更，不該由這一輪順手決定。
2. **級距約為 MOBA 年度賽事的六成**（80/45/25/12 → **50/28/15/8**）。
   Major 只有四隊、一年一次，位階與 MOBA 年度賽事相當；打六折是因為它是玩家的
   **第二**個項目，兩份年度獎金不該單純相加。
3. 只列前四名 —— Major 就四隊。

⚠ **這是第一版基準，不是校正過的數字**（與 `COMPETITION_PRIZE` 同樣的保留）。
分成獨立常數的意義就在這裡：日後調 CS 不必動到 MOBA。

**順手修好一個既有的空洞**：`Event.prizePolicy.table` 在 M3-3 之前是**裝飾用的**
—— 結算端永遠拿預設表，legacy 政策寫 `table: "default"` 也沒人讀。
新增 `prizeTableFor()` 讓它真的選表，MOBA 走 `default` 逐值不變。
⚠ fail-closed 的方向是**回預設表**而不是不發：認不得的政策代表有人加了新賽事
卻忘了註冊表，發既有級距的錢是可回溯的錯，漏發是玩家看不見也追不回來的錯。

### 兩支既有 verifier 的 era-scoped marker 隨行為更新（換更嚴，不是放寬）

- `check_cs_major.mjs`：「Major Event 沒有獎金政策」→ 政策要在、要指向
  `cs_major`、**且不得是 MOBA 的 legacy**，另加一條「CS 聯賽仍然沒有政策」。72 → 74。
- `check_cs_season_lifecycle.mjs`：「CS 封存沒有發名次獎金」→
  「只為 Major 建立一筆帳本鍵」＋「⛔ 聯賽的 final 不在帳本裡」；
  「財務沒有獎金交易」改寫成「**玩家沒進 Major** ⇒ 沒有獎金交易」
  （後者才是這個情境真正在驗的事）。51 → 53。

### 驗證（全部實跑）

```
node tools/check_cs_major_honors_award.mjs       45/45   ← 本輪新增
node tools/check_cs_major.mjs (M3-1)             74/74   (72 → 74)
node tools/check_cs_season_lifecycle.mjs (M1)    53/53   (51 → 53)
node tools/check_cs_playable_series.mjs (M4-A)   99/99
node tools/check_cs_series.mjs (M3-2)            46/46
node tools/check_cs_season_m2.mjs (M2)           55/55
node tools/check_cs_schema_v11.mjs (M0)          41/41
node tools/check_cs_season_contract.mjs          71/71
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_competition_release_gate.mjs   11/11
榮耀／賽事  q7d_honors 59/59 · q7b_asia_finals 72/72 · q7a_3c 69/69
           q7a_3b 51/51 · q7a_3d 67/67 · q7a_safety 18/18
經濟        finance_n 32/32 · n2 35/35 · n3 40/40 · progress25 PASS
MOBA        q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
            q4 68/68 · q5 69/69 · q6 57/57
共用契約    authoritative_o7 48/48
npm run build   ✓ built in 12.69s
```

⚠ **兩支既有紅燈，皆非本輪造成**（已用 `bdd0ab2` 的臨時 worktree 逐條比對確認）：
- `check_season_state_v2_migration_q7b.mjs`（M3-1 已實證）
- `check_q7a_3f1_career_final.mjs` **40/42**，紅的是 `4b)` careerEventId 推導與
  `7a)` 畫面直讀封存物件 —— 基線同樣 40/42、同樣那兩條。

⚠ **未經瀏覽器實測**：M3-3 沒有任何 UI。玩家看得到的只有收件匣的冠軍信與
資金變動；「CS 年度冠軍」在生涯榮耀頁怎麼顯示屬 Recap UI（未做）。

---

## CS Season M4-B — Recap ／ rollover ／ real-save lifecycle　2026-08-22

**分支**：`integration/cs-cross-ai`（起點 `25f09df`）

### M4-B1 — Recap read model（唯讀，不建第二套真相）

擴充**既有的** `competitionView(mode)`，不另開一支 recap store：

| 新增 | 內容 |
|---|---|
| `view.csMajor` | Major 的唯讀投影：晉級四強／對戰表／matchFormat／日期／完賽／冠軍／`final`／`award` |
| `view.honorsView.csAnnualChampions` 等三項 | CS 年度冠軍（同一份 `honors[]` 即時推導）|
| `rollToNextCsSeason()` | CS 換季（短路徑，見下）|

⚠ `csMajor` 的形狀刻意與既有的 `asiaFinals` **對齊**——兩者在產品上是同一個位階
（某個項目的年度冠軍賽），畫面因此可以共用同一套讀法。

⚠ **沒有任何計算發生在投影裡**：`bracket` 來自 `playoffBracket`、`championTeamId`
來自 `playoffOrder`、`final` 來自 `eventFinalOf`、`award` 是 Event 上那張收據 ——
全部是封存當下用的同一批函式。

⚠ **CS 換季是短路徑**，與 `_sealCsSeasonIfFinished` 同一條紀律：MOBA 的換季掛著
巡迴摘要封存與亞洲巡迴重建，CS 兩者都沒有。共用的是純函式
（`canRollSeason` / `rollToNextSeason`），不是編排。

### M4-B2 — UI

新增 `CsSeasonRecap`（成績單）＋ `CsSeasonRecapScreen`（外框與換季 CTA），
入口在 CS 賽前頁：賽季封存後該區塊改成「查看賽季成績單」。

**資訊架構與 MOBA Recap 刻意相同**：標頭 → 最高榮耀 → 本季賽事 → 聯賽名次 → 結算。
玩家在兩個項目之間切換時不必重新學怎麼讀這一頁。

| 沿用 MOBA | CS 專屬 |
|---|---|
| `recapStyles`（全部版面 token）| `csRecapStyles`（只有對戰表）|
| `RecapHeader`、`RecapLeague`、`RecapPrize` 原封不動 | `CsRecapBracket`（signature）|
| `RecapHonor` —— 加一個 `champions` prop 就共用 | 「我的 Major 成績」一列 |
| `recapCssText`（同一份樣式表，加上 CS scope）| 對戰表的窄螢幕單欄斷點 |

**為什麼只有對戰表是新版面**：其他每一段在 MOBA Recap 都有對應呈現，
只有淘汰賽對戰表沒有 —— MOBA 那邊的季後賽在 Recap 裡只是一行「已進入／未進入」。
而對戰表正是 CS 賽事真正的樣子（誰在哪一輪淘汰了誰、幾比幾），
所以版面的力氣全部花在那裡，其餘保持安靜。

⚠ **對戰表只顯示地圖數**。`2 : 1` 是拿下幾張圖；單圖的回合／半場／加時是 Codex
的責任區，本頁不讀、不算、不顯示（規格 D4 ／ ownership lock）。
賽制標籤讀 fixture 的 `matchFormat`，**不寫死 "BO3"**。

### M4-B3 — real-save acceptance

`tools/check_cs_season_recap_lifecycle.mjs`（新增，**64/64**）走完整條：
S1 → 聯賽 → 前四晉級 → Major(BO3) → Major FinalStandings → honor／award
→ SeasonSeal → Recap read model → 換季 → S2 → reload。

守到的八組：Recap 來自 canonical、Major 投影正確、換季（歷史對／榮耀不重複／
獎金不重複）、S2 乾淨、⛔ `seriesByFixture` 不跨季、不污染 MOBA、
ActiveMatch/MatchSession 無殘留、reload 一致。

⚠ **`seriesByFixture` 不跨季是真的風險，不是形式檢查**：fixture id 是決定性推導的，
新賽季可能出現同一個 id ⇒ 上一季殘留的地圖進度會被新賽季的同名場次撿去用。
`rollToNextCsSeason` 因此把帳本清空（賽程收尾時本來就會清，這是最後一道）。

### Browser acceptance（實測）

注入「S1 已封存」的存檔後全部走正式操作：
CS 賽前頁 →「查看賽季成績單」→ 成績單 →「開始 CS 第 2 賽季」→ reload。

- 成績單完整渲染：`S1 · 第 88 天封存`、聯賽第 8 名、
  **Major 對戰表四場**（準決賽 1/2、決賽、季軍戰，比分 2:1 / 2:0 / 0:2）、
  `🏆 Shadow Wolves 奪下年度 Major`、`比分為拿下的地圖數 · BO3 先拿 2 張者勝`、
  聯賽名次與場次組成、`賽事獎金 無（前四名才有）`（玩家第 8 名，誠實顯示）
- 換季：S1 → S2、歷史 1 筆、**榮耀 1 → 1**、**獎金帳本 1 → 1**、
  series 帳本清空、MOBA 仍 `null`、S2 有 0 筆賽果與 1 個 Event
- reload：以上全部逐值一致；成績單按鈕正確消失（S2 未封存）

截圖：`review/cs-m4a/browser_cs_season_recap.jpg`

### 驗證（全部實跑）

```
node tools/check_cs_season_recap_lifecycle.mjs   64/64   ← 本輪新增
node tools/check_cs_major_honors_award.mjs       45/45   (M3-3)
node tools/check_cs_playable_series.mjs          99/99   (M4-A)
node tools/check_cs_series.mjs                   46/46   (M3-2)
node tools/check_cs_major.mjs                    74/74   (M3-1)
node tools/check_cs_season_m2.mjs                55/55   (M2)
node tools/check_cs_season_lifecycle.mjs         53/53   (M1)
node tools/check_cs_schema_v11.mjs               41/41   (M0)
node tools/check_cs_season_contract.mjs          71/71
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_competition_release_gate.mjs   11/11
MOBA  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
      q4 68/68 · q5 69/69 · q6 57/57
榮耀  q7d_honors 59/59 · q7b_asia_finals 72/72 · q7a_3b 51/51
npm run build   ✓ built in 12.20s
browser acceptance   通過（見上）
```

⚠ **兩支既有紅燈，皆非本輪造成**（M3-3 已用基線 worktree 逐條確認）：
`check_season_state_v2_migration_q7b.mjs`、`check_q7a_3f1_career_final.mjs` 40/42。

---

## CS Season M4-C — CS 賽事中心（Competition Hub）　2026-08-22

**分支**：`integration/cs-cross-ai`（起點 `f603c9c`）
**性質**：**全唯讀 UI**。沒有動任何 Competition / Season / Fixture / BO3 / Battle 規則。

### 補的是哪一段空白

M4-B 的成績單只在**賽季封存後**出現。賽季**進行中**玩家看不到自己第幾名、
在不在晉級線內、下一場打誰、Major 產生了沒、對戰表打到哪。這一頁補那段。

### 讀模型（唯讀衍生，不新建計算）

擴充既有的 `competitionView("cs")`，新增兩個欄位與一個投影子欄位：

| 欄位 | 來源 |
|---|---|
| `view.csStage` | 由 `isRegularSeasonDone` / `csMajorEntryOf` / `isCsMajorDone` / `state.final` 推導出 `league` → `major_pending` → `major` → `major_done` → `sealed` |
| `view.csMajorLine` | `CS_MAJOR_QUALIFICATION.topN` ＋ `csMajorQualifiers(聯賽積分榜)` —— **與 Major 真正產生時同一支** |
| `view.csMajor.playerPath` | 對既有 `bracket` 的**過濾**：我的下一場／已遭淘汰。沒有新的勝負判斷 |

⚠ `csStage` **刻意不給進度百分比** —— 那會變成第二套「賽季走多遠」的算法
（既有的 `seasonProgress` 才是那個出口）。

### UI

新增 `CsCompetitionHubScreen`，入口在 CS 賽前頁的「📊 賽事中心」（賽季一存在就進得去）。

| 沿用（約 70%） | CS 特色（約 30%） |
|---|---|
| `recapStyles` 全部 token（section / row / label / value / quiet / kicker / cta）| **階段條** League → Major → 賽季結算 |
| **`CsRecapBracket` 整個重用**（M4-B 做的那個對戰表）| **積分榜上的晉級線分隔** |
| `recapCssText`（含對戰表的窄版斷點）| 我的那一列橘底highlight |

⚠ **沒有第二個 bracket**：Major 的對戰表直接把 M4-B 的元件搬過來用，
連 `data-testid` 都一樣，所以 M4-B 的斷言在這一頁同樣適用。

⚠ **晉級線是規則不是版面**：分隔線畫在第 `csMajorLine.topN` 名之後，
畫面不寫死 4。設定改了分隔線就跟著移動。

⚠ **全頁沒有任何 action**：不出賽、不棄權、不換季、不建賽季。
出賽仍走 CS 賽前頁，成績單仍走 `csRecap`。多一個入口就多一條會漂移的路徑。

### 手機版怎麼處理

**沒有硬縮桌面 bracket。** 三件事：

1. 對戰表在 `max-width: 520px` **改單欄堆疊**（M4-B 就寫好的斷點）。
   兩欄的意義是讀出「準決賽 → 決賽」的流向；欄寬不夠時流向讀不出來，
   堆疊反而清楚 —— 所以是換版面，不是縮字。
2. 積分榜本來就是**縱向列表**（`18px / 1fr / 52px / 30px` 四欄 grid），
   隊名 `ellipsis`，在 390px 下不溢位。
3. 階段條 `flex-wrap`，窄螢幕自動折行。

**實測**：把 app 外框壓到 390px，`documentElement` 與 hub 內**所有子元素**
的 `scrollWidth` 都沒有超過 `clientWidth` ⇒ **零水平溢位**。

⚠ **誠實揭露**：MCP 擴充的 render viewport 固定在 1280，改視窗大小不會傳導進去，
所以「媒體查詢在真手機上觸發」這件事**沒有在真實 390px viewport 下驗過**，
驗的是「內容塞得進 390px」＋「斷點規則存在於樣式表」。

### Browser smoke（實測兩個階段）

- **聯賽進行中**（第 36/84 天）：階段條 `● 聯賽`、我的排名第 8/8、戰績 0-5、
  下一場「第 36 天 · Iron Vanguard（主場）」、積分榜 8 列、
  `MAJOR 晉級線 · 前 4` 分隔線畫在第 4 名之後、Major 顯示「尚未產生」＋前四預覽
- **Major 進行中**（第 84/84 天）：階段條 `✓ 聯賽 ● 年度 Major`、
  對戰表四場（未完賽的比分顯示「—」，不補 0）、我的處境「未取得參賽資格」

截圖：`review/cs-m4a/browser_hub_league_stage.jpg`、`browser_hub_major_stage.jpg`

### 驗證（全部實跑）

```
node tools/check_cs_competition_hub.mjs          31/31   ← 本輪新增
node tools/check_cs_season_recap_lifecycle.mjs   64/64   (M4-B)
node tools/check_cs_major_honors_award.mjs       45/45   (M3-3)
node tools/check_cs_playable_series.mjs          99/99   (M4-A)
node tools/check_cs_series.mjs                   46/46   (M3-2)
node tools/check_cs_major.mjs                    74/74   (M3-1)
node tools/check_cs_season_m2.mjs                55/55   (M2)
node tools/check_cs_season_lifecycle.mjs         53/53   (M1)
node tools/check_cs_schema_v11.mjs               41/41   (M0)
node tools/check_cs_season_contract.mjs          71/71
node tools/check_cs_league_eligibility.mjs       31/31
node tools/check_home_team_contract.mjs          40/40
node tools/check_cs_match_completion.mjs         34/34   (Codex CS-MR12)
node tools/check_competition_release_gate.mjs   11/11
MOBA  q1 93/93 · q2a 112/112 · q2b 92/92 · q3 91/91 · q35 66/66
      q4 68/68 · q5 69/69 · q6 57/57
其他  q7d_honors 59/59 · q7b_asia_finals 72/72 · authoritative_o7 48/48
      r63_active_match_ttl 9/9
npm run build   ✓ built in 11.14s
```

⚠ **兩支既有紅燈，皆非本輪造成**（M3-3 已用基線 worktree 逐條確認）：
`check_season_state_v2_migration_q7b.mjs`、`check_q7a_3f1_career_final.mjs` 40/42。

---

<!-- merge 接縫：以上為 integration/cs-cross-ai 的 CS Season M0→M4-C；
     以下為 origin/main 的 Codex CS-MR12 段落。兩側都是各自新增，無互相改寫。 -->

## CS MR12 Quick Finish targeted debugging（2026-08-22）

### Root cause

- Production symptom was a synchronous UI stall rather than a thrown error：Quick Finish 的舊流程 `setPlaying(false)` 後直接 `setFIdx(total - 1)`，使 final frame、replay／animation／R3F 更新及 progress snapshot effect 在同一個 terminal transition 中處理；MR12 frame 數增加後，main thread 可能被長時間佔滿，`matchOver`／`onComplete` 因而無法及時完成。
- 舊 verifier 主要檢查 simulator、source shape 與 deterministic result，且原本把 `setFIdx(total - 1)` 當成 Quick Finish 必要行為；它沒有對 UI terminal transition 設定 bounded completion timing，也沒有覆蓋 midgame／OT Quick Finish 的 browser path。

### Minimal fix

- `src/battle/fps/EsportsFPS3D.jsx` 的 Quick Finish 現在直接使用同一次 `simulateFps()` 產生的 `matchResult`，由 `completeOnce()` 呼叫既有 `onComplete(matchResult)`；不重算 winner／score，不跳過 `MatchResult`，且 Natural completion 也共用同一個 exactly-once gate。
- Quick Finish 不再自動 seek final frame；完成後提供明確 terminal seek 控制，讓 Replay final frame 仍可查看。MR12、halftime、OT、economy、damage、AI、weapon balance 與其他模式均未修改。

### Verification

- `tools/check_cs_match_completion.mjs`：`36/36 PASS`，包含 regulation、halftime、接近 `12:12`、OT seed `7`（`31:28`）、same-seed Natural／Quick Finish winner／score／player stats fingerprint 與 exactly-once。
- `tools/browser_check_cs_completion.mjs`：新增 production preview、midgame、timing 與 terminal-seek coverage；production build browser regression 的 desktop natural、desktop opening Quick Finish、desktop midgame Quick Finish、390px Quick Finish 均 PASS，無 console/page error，無水平溢位。Quick Finish 確認至 Result 約 `60–115ms`（依 scenario／viewport）。
- 390px 僅為 browser emulation，未宣稱真機觸控、FPS 或視覺體感完成。

### Git boundary

- 本次只建立 local commit，依使用者要求不 push、不 deploy；是否重新部署留待 review 後另行決定。

## CS MR12／Quick Finish docs-only closure（2026-08-22）

### Closure result

- CS 6:6 卡死已修復；MR12／halftime／OT 已完成；Quick Finish freeze 已修復。
- Production Natural playback PASS；production opening Quick Finish PASS。
- OT 1,000 deterministic seeds distribution 正常，沒有證據顯示結構性長 OT。
- gameplay deployment SHA：`d9832478c8aaccc1d2f23eb3fb5a2245672547fe`。

### Non-blocking production acceptance residual

- midgame Quick Finish production smoke：尚未補，標記為 non-blocking residual，不是 gameplay bug。
- 390px Quick Finish production smoke：尚未補，標記為 non-blocking residual，不是 gameplay bug。

### Git boundary

- 本節是 docs-only closure；沒有新增或修改 gameplay、verifier、config、MR12、OT、經濟、AI、傷害、武器或 Competition／Season。
- push 後的 `origin/main` SHA 為本輪 closure SHA；gameplay deployment lineage 仍以 `d9832478c8aaccc1d2f23eb3fb5a2245672547fe` 為準。

## CS Season Product MVP Production Release（2026-08-22）

### Release 事實

| 項目 | 值 |
|---|---|
| branch / HEAD | `main` `6e07439`（＝ `origin/main`，working tree clean） |
| 來源 | `integration/cs-cross-ai` `f91509c` **fast-forward** 進 main，之後補 roster unlisted 修復 `6e07439` |
| Actions run | `32576935125` — `Deploy Vite site to GitHub Pages`，**completed / success**，2026-08-22T13:50:29Z |
| 正式站 | <https://rayhuang0323.github.io/ESMO-/>，HTTP 200 |

### 部署前 gate（全部實跑）

- `node tools/check_competition_release_gate.mjs` → **passed 11/11、failed 0/11**
  （v2_runtime／v2_active_focus／v2_sealing_m2／circuit_points／multi_event／career_final／
  asia_finals／team_honors／q6／season_recap／build）
- `node tools/check_cs_match_completion.mjs` → **36/36 PASS**
- `node tools/check_home_team_contract.mjs` → **40/40 PASS**
- `node tools/check_roster_unlisted_lineup.mjs` → **25/25 PASS**
- `npm run build` → `✓ built in 15.74s`，exit 0

### 正式站 smoke（8/8 PASS）

Home、CS 賽前入口、CS 賽事中心、聯賽 standings、Major bracket、Season Recap、
Roster unlisted 操作、MOBA 入口全部正常；console 無 runtime error。
逐項證據見 `08_目前待辦與風險.md` 首節的表。

其中 Roster unlisted 是這次 release 最後一個 blocker 的正式站複驗：
把先發 `Kaiser` 設成「未登錄」後 —— 不 crash、`lineup.b1` 變成 `null`、
`rosterTier` 為 `unlisted`，**reload 後仍然離開先發**，MOBA 賽前配置頁該席位顯示「未指派」。
`normalizeLineup` 的 pass-2 遷移回填對舊存檔仍然照舊（`check_roster_unlisted_lineup` §5 守著）。

### 本輪邊界

- 依使用者要求：**不修任何 smoke 過程中新發現的小問題**；本輪沒有發現 P0／P1，因此也沒有 hotfix。
- CS 單場 round／half／OT／scoreboard／`simulateFps`（MR12）屬 Codex ownership，未修改。
- 本節之後只做 docs 更新（00／04／05／08）＋ commit／push，沒有再動任何 gameplay 或 contract。

### 結論

**CS Season Product MVP 正式 CLOSED、正式上線。** production SHA `6e07439`。

---

## UI-1 — CompetitionScreen mode-awareness（2026-08-22）

依已核准的 UI architecture reference《ESMO Command Deck 藍圖》執行。產品決策：
MOBA／CS = Practice「打一場」，賽事 = Career／Season「打一季」，Competition Hub
最上層依 `gameMode` 分 MOBA／CS。本輪**只做 UI-0 + UI-1**，不做 Hub 殼（UI-2）。

### 基線（UI-0）

- worktree `ESMO-worktrees/ui1-competition-mode`，branch `ui/competition-mode-awareness`
- 從 `origin/main` @ `fb0c70f`（"Sprint 01: integrate roster and player profile UI
  after CS release"）建立。**不以落後 225 個 commit 的 `milestone-n-finance` 為基線。**
- Codex Roster／Player Profile lane 狀態：`codex/ui-migration-roster-profile` 的內容
  （`RosterScreen` / `PlayerDetailScreen` / `ui/PlayerUi.jsx` / `ui/playerUi.css` /
  `usePlayerUiMotion.js`，+1130 −90）**已於 `fb0c70f` 落地 main**（走 rebase，
  所以該分支本身不是 main 的 ancestor）。本輪未碰這五個檔。
- 基線 gate：release gate 第一次跑是 10/11，`q6` 因 **port 5311 被上一輪殘留的
  `srv.mjs` 佔用**而失敗（環境，非程式）。收掉該 process 後單跑 `check_competition_q6`
  = **57/57、exit 0** ⇒ 真實基線為全綠。

### 原本的 MOBA hardcode（都在畫面層，Store 早就是 by-mode）

| 位置 | 原本 | 為什麼是 hardcode |
|---|---|---|
| `competitionView()` | 不帶參數 | `DEFAULT_GAME_MODE = "moba"` |
| `useProfileStore((s) => s.competition)` | 讀別名 | 別名＝`competitionByMode.moba` 的投影 |
| `getState().competition?.playerTeamId` | 讀別名 | 同上 |
| `ensureCompetitionSeason()` | 不帶參數 | 同樣預設 moba |
| `rollToNextCompetitionSeason()` | 只有 MOBA | CS 的對應是 `rollToNextCsSeason()` |

### 修改範圍

**只有 `src/screens/manage/CompetitionScreen.jsx`（+59 −12）。**
接受 `mode` / `gameMode`，預設 `"moba"`；所有讀取帶著 `gm` 走。

三個區塊在非 moba 模式刻意不渲染，並在原地註明原因與解除條件：
`AsiaFinalsPanel`、`SeasonRecap`（兩者內部自己呼叫 moba 預設的 `competitionView()`）、
賽事切換列（`setActiveEvent()` 在 Store 讀 `get().competition` 別名）、
歷屆巡迴（`circuitHistory` 是全域 MOBA 切片）。

### ⚠ 一個差點踩到的產品契約

`ensureCompetitionSeason("cs")` **會真的建出一整季 CS 聯賽**（CS Season M1 已實作）。
若照原樣把 `useEffect` 改成帶 `gm`，開啟 CS 賽事頁就會**替玩家偷開一季**，
直接違反「CS 賽季不自動建立」（`check_cs_season_contract` 有守）。
⇒ 自動建季只留給 MOBA；非 moba 沒有賽季時顯示既有空狀態，開季仍在 CS 賽前頁。

### 驗證（全部實跑）

- **UI-1 等價性檢查（暫時腳本，未入庫）**：12/12 PASS。含 populated 情境
  （140 場賽程、8 列積分榜）下 `competitionView()` 與 `competitionView("moba")`
  **deepStrictEqual**、`s.competition` 與 `competitionByMode.moba` **同一個參考**、
  建立 MOBA 賽季不污染 cs 切片、未知 gameMode 會 throw 而非默默退回 moba。
- `node tools/check_competition_release_gate.mjs` → **passed 11/11、failed 0/11**
  （含 circuit_points／multi_event／career_final／asia_finals／team_honors／
  season_recap／q6 七項**瀏覽器實跑**，它們真的渲染本檔）
- `node tools/check_cs_season_contract.mjs` → exit 0（含 "CS season is never
  created behind the player's back"）
- `node tools/check_home_team_contract.mjs` → exit 0（含 "profileStore keeps
  Competition view (moba-defaulted)"）
- `npm run build` → `✓ built in 11.04s`，exit 0

### 未完成 / 已知限制

- CS 分頁目前只有 standings／賽程／下一場／進度／季後賽／歷屆會正確跟著 mode 走；
  上述三個 MOBA-only 區塊要跨項目共用，得先把 `setActiveEvent` / `AsiaFinalsPanel` /
  `SeasonRecap` / `circuitHistory` by-mode 化 —— 屬 UI-2。
- **尚無呼叫端傳 `mode="cs"`**：AppShell 仍只掛 `<CompetitionScreen>`（moba 預設）。
  本輪刻意不接線，接線是 UI-2 的殼。
- 未經瀏覽器手動實測 `mode="cs"` 的畫面（沒有入口可以到達）；
  自動 gate 只覆蓋 MOBA 路徑。

---

## UI-2 — Competition Hub navigation shell（2026-08-23）

本輪縮小為 **navigation shell / composition checkpoint**：只做接線與殼，
不做共用元件重構、不搬 `CsLeagueFixtureEntry`、不碰 profileStore 與 Season semantics。

### 前置稽核

- `origin/main` 仍是 `fb0c70f`（`git ls-remote` 核對），本 branch 1 ahead / 0 behind。
- **AppShell 無新衝突**：最近 5 個動到 `AppShell` 的 commit 都是已併入 main 的 CS Season
  工作；兩個 dirty worktree 都不是活躍 lane ——
  主 worktree 的 `AppShell` 髒污是**純 CRLF**（`--ignore-all-space` 後為空），
  `.sprints/codex-ui-migration-roster-profile-post-cs` 是**已併入 `fb0c70f`** 的
  Roster lane 舊暫存，且沒碰 `AppShell`。

### 修改範圍

| 檔案 | 動作 |
|---|---|
| `src/screens/manage/CompetitionHubScreen.jsx` | **新增**，約 100 行，純殼 |
| `src/AppShell.jsx` | 最小接線（+21 −5） |
| `tools/browser_check_competition_hub_shell.mjs` | **新增** 畫面 gate |

殼只做一件事：決定現在看哪一個項目的賽事。
`[MOBA]` → `CompetitionScreen mode="moba"`（UI-1 已接受 mode）、
`[CS]` → **既有的** `CsCompetitionHubScreen`（一行都沒改）。

- **不複製 CS Hub**：CS 分頁掛的就是那個元件本身。
- **不重算**：殼連 Store 都不碰，積分榜／對戰表／晉級線各自從 `competitionView(mode)` 讀。
- **不建立賽季**：殼沒有任何 action；`CsCompetitionHubScreen` 本身全唯讀且自帶
  `cs-hub-no-season` 空狀態 ⇒ 點進 CS 分頁不會替玩家開季。
- 兩個子畫面各自保留自己的頁首與返回鍵，殼**不加第三層頁首**，只放分頁列。
- 分頁列做成可橫捲的 rail ＋ 資料驅動的 `TABS`：加第三款遊戲是「陣列多一筆」，
  不必重排版面（呼應藍圖的擴充規則）。
- 分頁狀態是**畫面狀態**：不寫 Store、不存檔，reload 回到預設 MOBA。

`AppShell` 另外加了一個 `csRecapFrom`（純畫面狀態）：CS 成績單現在有兩個入口
（CS 賽前頁的 `csHub`、賽事中心的 CS 分頁），記住來源，返回才不會把玩家丟到另一邊。

### 驗證（全部實跑）

- `node tools/browser_check_competition_hub_shell.mjs` → **18/18 通過**，涵蓋要求的七項：
  首頁「賽事」→ Hub、預設 MOBA、切 CS、切回 MOBA、
  **查看 CS 不會自動建立賽季**（Store 斷言 `competitionByMode.cs` 前後皆為 null，
  且 MOBA fixtures 56 → 56 未動）、已有 CS 賽季時階段條與 8 列積分榜真的畫出來、
  reload 後回到預設分頁且 Store 逐值相同、全程無未捕捉例外。
- `node tools/check_competition_release_gate.mjs` → **11/11、exit 0**。
  ⚠ 其中七項是瀏覽器實跑，且它們都是**從首頁「賽事」磚進場**——現在會先經過殼再落到
  MOBA 分頁。它們全綠本身就是「MOBA 路徑沒被殼改變」的證據。
- `node tools/check_cs_competition_hub.mjs` → **31/31 PASS**
- `node tools/check_cs_season_contract.mjs` → exit 0（含 "CS season is never created
  behind the player's back"）
- `node tools/check_home_team_contract.mjs` → exit 0
- `npm run build` → `✓ built in 12.77s`，exit 0

### 未完成 / 已知限制

- 四個 MOBA-only 區塊（`AsiaFinalsPanel`／`SeasonRecap`／賽事切換列／`circuitHistory`）
  仍只在 MOBA 分頁出現，維持 UI-1 的處置，本輪刻意不強行 by-mode 化。
- **共用元件尚未抽出**：MOBA 與 CS 兩個分頁仍是兩套版面語彙
  （`ManageFrame` + `Panel` vs `recapStyles`）。`StandingsTable` / `StageBar` /
  `FixtureList` 的共用化是 UI-4。
- CS 出賽入口仍在 CS 賽前頁（`CsLeagueFixtureEntry` 未搬，屬 UI-3）；
  賽事中心的 CS 分頁目前是唯讀的「我在哪裡」，不是出賽點。
- 手機寬度未逐一實測；分頁列已用可橫捲 rail ＋ 32px 觸控高度，但 Hub 的
  響應式規則屬 UI-10。

---

## UI-3 — Competition Hub 成為 CS Season 主入口（2026-08-23）

決策：選 (b)。開季與出戰**一起**搬到賽事中心，CS 賽前頁回歸單場責任。

### 前置稽核

- `origin/main` 前進到 `e9996a7`「Docs: record ESMO UI migration pause and backlog」，
  **純 docs、未動 src/tools**，已 merge 進本分支（`263ebbd`），無衝突。
- 該 commit 由 Ray 撰寫，明確記載：Codex UI Migration 暫停開新 Sprint，
  **Claude Code 這條線（Command Deck／Competition Hub／CS Season 賽事入口／IA 重整）繼續**，
  且 Codex 暫停期間不碰 `AppShell`／`GameRouter`／Store／contracts／CS／Season／Competition。
  ⇒ 本區域的 ownership 現在是文件化的，衝突面歸零。

### 修改範圍

| 檔案 | 動作 |
|---|---|
| `src/screens/fps/CsCompetitionHubScreen.jsx` | 加開季／出戰／返回三個 action（+66 −6） |
| `src/screens/fps/CsPrepScreen.jsx` | **移除 90 行** `CsLeagueFixtureEntry`，回歸單場賽前 |
| `src/AppShell.jsx` | 移除 `csHub` 孤兒路由與 `csRecapFrom`；csPrep 收斂為 `{onNext,onBack}` |
| `src/screens/manage/CompetitionHubScreen.jsx` | 把 `onPlay`／`onResume` 傳給 CS 分頁 |
| `tools/check_cs_season_contract.mjs` | 兩條斷言跟著責任搬家，並**加強** |
| `tools/check_competition_q35.mjs` | 修正 UI-1 造成的字面失效（見下） |
| `tools/browser_check_competition_hub_shell.mjs` | 擴充到 27 條 |

賽事中心現在**只有三個 action**，全部掛 onClick：`ensureCompetitionSeason("cs")`、
`startFixtureMatch(fixtureId)`、`resumeMatchSession()`。
出戰只簽指派單，接著交還 `csPrep → csMap → csTactic → battle`——
選圖／戰術／陣容仍在賽前流程，**沒有第二條 MatchSession／Battle pipeline**。

M2 當初就把 `CsLeagueFixtureEntry` 標成「暫用入口……完整的 CS 賽事頁上線之後
應該被它取代，而不是兩個入口並存」。UI-3 執行的就是那句話。

### ⚠ 兩支 verifier 把責任釘在舊檔案上，斷言跟著責任走

1. `check_cs_season_contract`：`has("csPrepScreen", 'ensureCompetitionSeason("cs")')`
   —— 搬家後必然轉紅。改成驗賽事中心，並**加兩條更強的**：
   賽前頁不得再有 `startFixtureMatch`／`ensureCompetitionSeason`；
   賽事中心**不得有任何 `useEffect`**（開季只能掛 onClick，掛載不得建季）。
2. `check_competition_q35` §4d：寫死字面 `competitionView()`，而 **UI-1** 已改成
   `competitionView(gm)`。**這是 UI-1 造成的紅燈，當時的 gate 清單沒有這一支，
   我沒跑到。** 意圖（畫面只透過 Store 出口取資料）仍成立 ⇒ 放寬為 `competitionView(`；
   「畫面不自己算」那一半仍由 §4e–4g 守著。66/66。

### ⚠ verifier 抓到一個 build 抓不到的真 bug

移除 `csRecapFrom` state 時漏了 `AppShell.jsx:181` 還在呼叫 `setCsRecapFrom`。
`npm run build` 過、瀏覽器 gate 27/27 也過——因為那條路只有**賽季封存後點成績單**
才會走到。`check_acceptance_fix_p1` §7a（未定義識別字掃描）把它抓出來（80/81）。
修正後 81/81。

### testid 去向

- **功能標記跟著搬**：`cs-league-open-season`、`cs-league-play` 現在在賽事中心。
- **新增**：`cs-hub-today`（帶 `data-state=live|today|none`）、`cs-league-resume`、`cs-hub-error`。
- **隨區塊退場**：`cs-league-entry` / `cs-league-hub` / `cs-league-sealed` / `cs-league-recap`
  —— 已確認 `tools/` 與 `src/` 沒有任何一處引用它們；賽事中心的成績單入口是既有的
  `cs-hub-recap-btn`。

### 驗證（全部實跑）

- `browser_check_competition_hub_shell` → **27/27**。含：未開季顯示「開始 CS 賽季」CTA、
  **按前 `cs=null` → 按後 `cs=present`（56 場賽程）**、只是查看仍然不建季、
  賽前頁不再有開季／導航（`entry=false open=false hub=false`）、
  今日有賽程時 `data-state=today` 並給出「出戰」、
  按下出戰簽出 `origin.kind=fixture / mode=cs` 且**落在既有 CS 賽前流程**、
  reload 後回預設 MOBA 分頁且 Store 逐值相同、全程無未捕捉例外。
- release gate **11/11**、`check_cs_competition_hub` **31/31**、
  `check_cs_season_m2` **55/55**、`check_cs23` **28/28**、
  `check_matchmaking_flow_acceptance` **97/97**、`check_r61_ui_fixture` PASS、
  `check_acceptance_fix_p1` **81/81**、`check_competition_q35` **66/66**、
  `check_cs_season_contract` exit 0、`check_home_team_contract` exit 0、
  `npm run build` `✓ built in 10.94s`。

### 未完成 / 已知限制

- **BO3 續戰、ActiveMatch 恢復、賽季封存後的成績單** 未在瀏覽器逐項實測；
  這三條走的都是既有程式碼路徑（未修改），但賽事中心是新的進入點。
- Hub 的 CS 分頁與 MOBA 分頁仍是兩套版面語彙，共用元件抽取是 UI-4。
- 手機寬度未實測。

---

## UI-3.5 — Competition Hub 成為入口後的 CS Season lifecycle 驗收（2026-08-23）

驗收輪，**`src` 零改動**。新增一支畫面 gate：`tools/browser_check_ui35_cs_lifecycle.mjs`。

### 結果：22/23

| 條 | 結果 |
|---|---|
| §2 ActiveMatch 恢復 | **9/9 全過** |
| §3 賽季封存 → 成績單 | **7/7 全過** |
| §1 BO3 續戰 | **6/7**；最後一步 BLOCKED（見下） |

- **§2**：從賽事中心出戰 → 進 battle → 重整（等同離開）→ 賽事中心改顯示
  `cs-league-resume`（`data-state=live`，且不再給第二顆出戰）→ 恢復回**同一個
  session 與同一個 fixture**，`launched` 狀態的賽程始終只有一場。
- **§3**：整季封存（`SeasonSeal.v1`）→ Hub 的 CS 分頁出現成績單入口且不再顯示
  今日賽程 → 成績單的 Major 對戰表四場 BO3 比分正確（`2:1 / 0:2 / 2:0 / 2:0`，
  勝方皆 2 張）→ 換季 CTA「開始 CS 第 2 賽季」在 → **無未捕捉例外**
  （UI-3 那個 `setCsRecapFrom` 的 undefined identifier 確認已消失）→
  返回回到賽事中心，沒有孤兒 route。
- **§1**：已驗證的部分全綠 —— Hub 出戰 Major → 簽出指派單與房間 → 落在既有 CS
  賽前頁 → 選圖頁認得「BO3 0:0 第 1/3 張」→ series 掛在 MatchSession
  （`mapsToWin: 2`）→ 進得了對戰畫面。**只有「完成第一張地圖」被擋住。**

### ⚠ 發現一個既有 bug（不在本輪修復範圍）

**現象**：從賽事中心出戰**正式 fixture** 的 CS 比賽，按下 Quick Finish 之後
頁面主執行緒被鎖死 ≥843 秒（測到 CDP 逾時為止，未觀察到結束）。

**鑑別（三組實測）**：

| 情境 | Quick Finish |
|---|---|
| 練習賽（`browser_check_cs_completion`） | **88ms**，1/1 PASS |
| 聯賽 BO1 fixture（`matchFormat: null`、無 series） | **鎖死 843s** |
| 年度 Major BO3 fixture | **鎖死 840s** |

派發點擊本身 26ms 就返回；卡住的是**之後每一個唯讀輪詢** ⇒ 是頁面主執行緒被鎖死，
不是測試工具的問題。**與 BO3 無關**，兩種 fixture 都會。

**不是 UI-1/2/3 造成的**：`git diff fb0c70f..HEAD` 對
`src/platform/progress/`、`src/platform/competition/`、`src/battle/fps/`、
`src/battle/ui/`、`CsMatchScreen`、`CsResultScreen`、`useLocalServer.js`
的改動是**零**，AppShell 的 `settleCsMatch` / `onFinish` 接線也沒變。

**為什麼一直沒被發現**：`browser_check_cs_completion` 只跑**練習賽**；
`check_cs_season_m2`（55/55）在 **Node** 裡跑 fixture，不進瀏覽器也不跑引擎。
**「在瀏覽器裡完成一場正式 fixture」從來沒有被任何 gate 覆蓋過。**

**未修復的理由**：根因未定位；範圍在 CS 對戰／賽果收尾（依 `05` 既有紀錄屬
Codex ownership），而本輪的指示是「以驗收為主，不改架構、不重構、不改 Store contract」。
列為待處理，建議在 UI-4 之前由負責 CS 的工作線處理。

### 本 gate 的兩個刻意設計

1. **順序是 §2 → §3 → §1。** 主執行緒一旦被 Quick Finish 鎖死，同一個 Chrome 裡
   後面所有檢查都跑不了。把會卡的那條放最後，前兩條才拿得到結果
   （第一版把 §1 放最前面，結果 §2／§3 從來沒執行過）。
2. **§1 的最後一步有 150s 上限**（`withDeadline`），逾時回報 BLOCKED 而不是拖垮整支。

### 過程中修正的三個測試自身錯誤（非產品問題）

- 在 `startFixtureMatch` 之後立刻讀 `matchmaking.session` —— 場次是賽前流程**確認後**
  才建立的，當下必為 null。
- 用 `N : M` 的同一行正則驗 BO3 比分 —— 對戰表每一列的地圖數是獨立元素；
  正確做法是讀該列的 `data-score="a:b"` 與 `data-done`。
- 用 `/下一賽季/` 找換季 CTA —— 實際文字是「開始 CS 第 N 賽季」（`cs-recap-roll`）。

### Gates（本輪 `src` 零改動，全部重跑確認）

- `browser_check_ui35_cs_lifecycle` → **22/23**（唯一紅燈是上述 BLOCKED）
- `check_competition_release_gate` → **11/11、exit 0**
- `check_cs_season_contract` / `check_home_team_contract` /
  `check_cs_competition_hub` / `check_cs_season_m2` → 全部 exit 0
- `npm run build` → `✓ built in 12.23s`

---

## UI-3.5 後續 — 正式 CS 賽程「自然完賽」驗收工具（2026-08-23）

UI-3.5 留下一個未驗證的缺口：Quick Finish 在瀏覽器裡完成正式賽程時會鎖死主執行緒，
於是「玩家實際打完一場正式 CS 賽程」從來沒有被走過。本節把那條路**用玩家真正會走的
方式**走完，並把它固化成一支工具。**`src` 零改動。**

### `tools/browser_check_cs_fixture_natural_finish.mjs`

**慢速／手動驗收工具，單次約 6–10 分鐘，不納入每次都跑的 default Release Gate。**

對戰是用 4 倍速**真的播完**的（不快轉、不模擬），所以慢是本質，不是可以優化掉的。
建議在動到以下任何一項之後手動跑一次：

> CS Battle ／ Result ／ ActiveMatch ／ MatchSession ／ BO3 ／ Competition fixture lifecycle

兩條流程：

| 指令 | 覆蓋 |
|---|---|
| `--only=bo1` | CS 聯賽 BO1：自然完賽 → 結算 → FixtureOutcome 寫入 → 場次收尾 |
| `--only=bo3` | 年度 Major BO3 第一張：自然完賽 → 結算 → 回選圖頁且 **series ledger 正常續接** |

### 實測結果（兩條皆通過）

**BO1**（`fx:cs:cd668e2b`，第 6 天）

```
natural-end：自然結束（357s，687/687 格）
click-report → result-screen：結算完成（3s）
結算前：fixtureStatus=launched  outcomeCount=0  assignment=true   activePhase=battle
結算後：fixtureStatus=completed outcomeCount=1  assignment=false  activePhase=null
        resultSource=engine  score=0:1  activeRestoreable=false
        settlements 0→1  processedTx 0→1  csHistory 0→1
console error：無　page error：無
```

**BO3 第一張**（`fx:cs:d031c11d`，第 86 天，前置 14 勝打進 Major）

```
natural-end：自然結束（632s，1221/1221 格）
result-screen：結算完成（3s）　back-to-map：回到選圖頁（2s）
series 橫幅：BO3 1 : 0 第 2 / 3 張 · 先拿 2 張者勝
fixtureStatus=launched  outcomeCount=0  assignment=true  activePhase=map
seriesByFixture=1  settlements 0→1  processedTx 0→1  csHistory 0→1
console error：無　page error：無
```

BO3 中場的每個值都是**該有的樣子**：series 未決 ⇒ 賽程仍 `launched`、賽程賽果尚未
寫入（要等整個 series 決出）、指派單還在、phase 轉 `map`。第一張地圖各只記一次，
**無重複 settle、無重複 FixtureOutcome**。

### 結論：玩家路徑正常

`settleCsMatch` 只花 3 秒。結算、fixture 收尾、series ledger、ActiveMatch 收尾
**全部不在問題範圍內**——這一點由「自然完賽走的是同一個 `matchResult`、同一支
`completeOnce()`、同一條 `settleCsMatch`」直接證實。

### ⚠ 驗收工具層未解問題（**不是玩家 blocker**，本輪不處理）

Quick Finish 在這支新工具的驅動方式下會鎖死頁面主執行緒；但既有的
`browser_check_cs_completion` 跑同一顆按鈕是 **~90ms 通過**（重跑兩次皆
`quickFinishMs=88 / 98`，1/1 PASS）。兩邊都可穩定重現。

已排除的假設：

1. **不是 fixture 特有** —— 練習賽在新工具下也一樣鎖死。
   （UI-3.5 當時「Quick Finish 在正式 fixture 上鎖死」的定調**是錯的歸因**：
   拿「新工具跑 fixture」對比「舊工具跑練習賽」，同時換了兩個變數。此處更正。）
2. **不是視窗大小** —— 補上 `Emulation.setDeviceMetricsOverride` 後仍鎖死。
3. **不是探測方式** —— 純選擇器的輕探測（無 `innerText`）也回不來
   ⇒ 頁面是真的卡住，不是探測造成的假象。
4. **不是賽前頁連點** —— 改成每個 action 只按一次（`enqueue → confirm`）仍鎖死。

差異點尚未找到。定性為**驗收工具層的未解問題**：Quick Finish 有
`devFastForward` ＋ `isDebugMode()` 雙重閘門，玩家碰不到；玩家路徑（自然完賽）
已由本工具證實完全正常。新工具因此**刻意完全不碰 Quick Finish**。

### 驗證

- `node --check` 通過；未知 `--only` 值被擋下（exit 2）
- 改名後啟動實跑：伺服器起得來、Chrome 起得來、建季 → 賽事中心出戰 → 賽前頁
  → 選圖 → 對戰 → 進入自然播放，全部正常
- `src` 零改動（`git status` 只有本工具與本文件）

---

## UI-4A — Competition 共用呈現元件（2026-08-23）

把 MOBA 與 CS 賽事頁裡**真正相同**的資訊裝置抽成純呈現元件。不做完整 UI-4 重構。

### 前置稽核

- `origin/main` 仍是 `e9996a7`，本分支 0 behind / 6 ahead。
- 主 worktree（`milestone-n-finance`）有實質未提交改動於 `profileStore` /
  `matchmaking` / `matchSession` / `matchRoom` / `featureFlags`——**本 session 開始前就存在**，
  且在落後兩百多 commit 的 stale 基底上，不是 UI-4A 要碰的檔案。
  `AppShell.jsx` 與 `CompetitionScreen.jsx` 在那裡是純 CRLF 假 diff。
- ⚠ **既存衝突**：`milestone-n-finance` 上的 `78f7479`（今日，未推）也改了
  `CsPrepScreen.jsx`，與 UI-3 移除 `CsLeagueFixtureEntry` 必定衝突。已記入
  `09_Competition_UI_安全區契約.md`，**未自行解**。

### 新增三個共用元件（`src/screens/competition/`）

| 元件 | 界線 |
|---|---|
| `StageBar.jsx` | **不認得任何 phase 字串**。呼叫端傳 `steps` / `activeIndex` / `label` |
| `StandingsTable.jsx` | 不排序、不累加、不判晉級。晉級線位置由 `qualify.afterRank` 指定 |
| `FixtureList.jsx` | 匯出 `FixtureRow`（`versus` / `row` 兩種版面）＋ `readFixture()` |

三者都不 import Store、不呼叫 `competitionView`。

### 改用共用元件的地方

**CS 賽事中心**：階段條（原本是本檔內的 `StageBar`）、積分榜列（原本是本檔內的
`StandingRow` ＋ 手寫晉級線）、下一場（改用 `FixtureRow` row 版面）。
本檔內的兩個元件複本已刪除（−54 行）。

**MOBA 聯賽頁**：積分榜（含表頭、淨勝分欄、隊伍 tag、來源分佈註腳）、
今日／下一場的對戰卡（改用 `FixtureRow` versus 版面）。

### 刻意沒有共用的部分（以及原因）

- **phase → 第幾格的對照**留在 CS 這一側（`STEP_INDEX`）：那是 CS 的賽制知識。
  共用元件一旦認得它，第三款遊戲進來就得改共用元件。
- **出賽／棄權按鈕**留在 MOBA 頁：那是該頁的動作，不是共用呈現。
- **兩種 fixture 版面都保留**（`versus` / `row`）：硬統一等於用「共用」的名義把
  各自的資訊密度抹平。共用的是「怎麼讀一場 fixture」，不是「長什麼樣子」。
- **MOBA 季後賽晉級線不畫**：季後賽名額是常規賽結束後由 `playoff.qualified`
  產生的事實，不是積分榜上的即時規則；要畫得先有 canonical 來源，不在本輪。
- **Major 對戰表**仍是既有的 `CsRecapBracket`，**巡迴積分／歷屆巡迴／亞洲總決賽**
  仍是 MOBA 專屬區塊——沒有為了共用而動它們。

### ⚠ 一個差點造成數字不一致的地方

`view.nextDay` 是 `absoluteDayOf(state, next)`（絕對遊戲日），**不等於**
`fixture.day`（賽季相對天）。若讓 `FixtureRow` 自己讀 `fixture.day`，CS 的
「下一場 第 N 天」就會顯示成另一個數字。⇒ `FixtureRow` 加了 `day` prop，
由呼叫端傳入 Store 已推導好的天數。

### 驗收

**新增兩支 gate**

- `check_competition_shared_ui`（靜態，28/28）：守純呈現界線——不 import Store、
  不排序、不算規則、不認得賽制字串；既有 `data-testid` 沒弄丟；項目特色沒被抹平。
  含 mutation sentinel（把 `activeIndex` 換成自己讀 phase ⇒ §2 轉紅）。
- `browser_check_competition_shared_ui`（畫面，15/15）：**積分榜逐列與
  `competitionView(mode).standings.rows` 對答案**——隊伍、名次、勝敗、積分、
  淨勝分全部逐值比對；CS 晉級線畫在 `csMajorLine.topN` 指定的名次；
  1280 與 390 兩個寬度都驗，且**無 body 橫向捲動**。

**全部 gate**

| Gate | 結果 |
|---|---|
| `check_competition_release_gate` | **11/11**、exit 0 |
| `browser_check_competition_hub_shell` | **27/27**（UI-2／UI-3 行為零變化） |
| `browser_check_competition_shared_ui` | **15/15**（新增） |
| `check_competition_shared_ui` | **28/28**（新增） |
| `check_cs_competition_hub` | 31/31 |
| `check_cs_season_contract` | 73/73 |
| `check_home_team_contract` | 40/40 |
| `check_competition_q35` | 66/66 |
| `npm run build` | ✓ built in 9.78s |

### 未完成 / 已知限制

- **手機版表格仍不理想**：390px 下 MOBA 五欄仍偏擠。本輪的底線是「不比改造前更差」
  （已驗證無橫向捲動），真正的響應式處理（欄位取捨／橫捲容器）屬 UI-10。
- **兩頁的外框語彙仍不同**：MOBA 是 `ManageFrame` + `Panel`，CS 是 `recapStyles`。
  本輪只抽資訊裝置，沒動外框。
- 未新增任何全域 designSystem token（依指示）。共用元件用的是既有 `theme.js` 的 GC。

### 另外產出：`docs/handoff/09_Competition_UI_安全區契約.md`

給其他工作線的檔案級邊界：紅區（本線持有，勿動）／黃區（可改但 additive）／
綠區（本線完全沒碰，`git diff` 驗證過），加上不得弄丟的 `data-testid` 清單、
五條架構紅線、動這區之前要跑的 gate 清單，以及契約失效條件（本線併入 `main` 後解除）。

---

## UI-4B — Competition Hub 共用視覺外框（2026-08-23）

讓 MOBA 與 CS 兩個賽事分頁**看起來屬於同一套 ESMO Competition UI**。
不是功能重構——優先 composition ＋ CSS migration，沒有大幅重寫兩個畫面。

### 前置稽核

- `origin/main` 仍是 `e9996a7`，本分支 0 behind / 7 ahead、tree clean。
- 紅區四個檔案近兩天只有本線自己的 commit；無其他 worktree 有未提交改動。
- `78f7479`（`CsPrepScreen`）仍**只在** `milestone-n-finance`。
  依指示：**本輪完全不碰 CsPrep、不 merge、不解那條舊分支的衝突。**

### 新增（`src/screens/competition/`）

| 檔案 | 內容 |
|---|---|
| `competition.css` | 全部收在 `.esmo-comp` 底下的共用視覺語言 |
| `CompetitionFrame.jsx` | 捲動容器＋寬度上限＋頁首（返回／eyebrow／標題／賽季副標／右側資訊） |
| `CompetitionPanel.jsx` | 共用卡片（含 accent 左緣條版本） |

### 兩頁現在共用什麼

背景與卡片層級、border／radius、間距節奏（`--comp-gap` / `--comp-pad`）、
字級階層（eyebrow 9px/0.2em、標題 17px、quiet 10px）、空狀態樣式、
**賽季標頭**（`S{n} · 第 x / y 天`）、responsive 容器（`--comp-max: 560px`）。

⚠ **賽季標頭本來是兩份**：MOBA 在 `ManageFrame` 的 subtitle，CS 在內文自己排一組
kicker + 大字 + 印章。同一個事實兩種長相、兩處會各自漂移。現在收成頁首一個 slot，
玩家在兩個分頁看到的是同一個東西。CS 內文那一組已移除，`cs-hub-day` 標記跟著搬到頁首。

### 項目差異怎麼表達

**只靠一個 CSS 變數 `--comp-accent`**，由 `CompetitionFrame` 在最外層 inline 設定
（MOBA `GC.purp` 紫／CS `#fb923c` 橘）。底下所有需要強調色的地方都讀它
⇒ 換一個項目＝換一個變數，不是換一套 CSS。

### 刻意保持不同（沒有為了統一而抹平）

- **MOBA**：紫 accent、巡迴積分／歷屆巡迴、亞洲總決賽、季後賽對戰表、
  五欄積分榜（含淨勝分）、出賽／棄權的二次確認流程、賽季進度。
- **CS**：橘 accent、League → Major 階段條、Major 晉級線、`CsRecapBracket`
  對戰表（仍靠 `recapCssText`，本輪不動）、BO1／BO3 標記、開季／出戰 CTA。
- **兩頁的資訊順序沒有強制一致**：MOBA 先事件切換再巡迴積分，CS 先階段條再今日賽程。
  順序反映各自的賽制敘事，統一它等於把兩個項目的節奏抹掉。
- **Circuit 與 Major 沒有做成同一種 widget**（依指示）。

### 遷移方式（刻意最小）

- MOBA：`const Panel = CompetitionPanel;` 一行——底下十幾個 `<Panel title right>`
  呼叫點**一行都沒動**。外框 `ManageFrame` → `CompetitionFrame`，兩個呼叫點。
- CS：`frame()` 的內容換成 `<CompetitionFrame>`，其餘 render 不動。

### 驗收

**新增 `check_competition_visual_shell`（22/22）** —— 刻意**不做像素級斷言**
（改一個 padding 就紅，卻擋不住「兩頁又各自長出一套外框」）。驗的是結構契約：
共用外框由 CSS 檔驅動而非又一份 inline style；兩頁都真的用了它且各傳自己的 accent；
兩頁不再各自持有外框／卡片定義；樣式沒有汙染全域或 Home 的 `dashboard.css`；
項目特色仍在。含 mutation sentinel（外框不再吐 `--comp-accent` ⇒ §2 轉紅）。

**全部 gate**

| Gate | 結果 |
|---|---|
| `check_competition_release_gate` | **11/11** |
| `browser_check_competition_shared_ui` | **15/15**（1280 / 390） |
| `browser_check_competition_hub_shell` | **27/27** |
| `check_competition_visual_shell` | **22/22**（新增） |
| `check_competition_shared_ui` | 28/28 |
| `check_cs_competition_hub` | 31/31 |
| `check_cs_season_contract` | 73/73 |
| `check_home_team_contract` | 40/40 |
| `check_competition_q35` | 66/66 |
| `npm run build` | ✓ built in 10.84s |

**功能與資料變化：0。** 兩個寬度下 MOBA 與 CS 積分榜逐列與
`competitionView(mode).standings.rows` 對答案（隊伍／名次／勝敗／積分／淨勝分），
CS 晉級線仍畫在 `csMajorLine.topN`，兩邊皆無 body 橫向捲動。

### 未完成 / 已知限制

- **MOBA 內容寬度由 460 → 560**（與 CS 對齊）。五欄積分榜在 390 下仍偏擠；
  底線「不比改造前更差」已驗證（無橫向捲動），真正的手機深度優化仍留 UI-10。
- **CS 內文仍大量使用 `recapStyles`**：那些是 Recap 與 Major 對戰表共用的樣式，
  本輪只換外框，沒有把內文 token 一起遷移。
- 未新增任何全域 `designSystem` token（依指示）。

### 安全區契約同步更新

`09_Competition_UI_安全區契約.md`：`cs-hub-day` 加入不可弄丟的標記清單；
新增第 6 條架構紅線（樣式收在 `.esmo-comp`、不動全域、差異只靠 `--comp-accent`）；
新 verifier 加入「動這區之前要跑」清單；綠區宣稱以 `git diff` 重新驗證仍為空。

## CS-A2 FPS Renderer Identity / Lifecycle Mainline Fix（2026-08-23）

- 基於最新 `origin/main@29eb712` 重新確認：舊的 `ACTIVE_ROSTER` + `[mapKey]` renderer pool lifecycle 仍會讓 frame identity 與 3D entity 脫鉤。
- 修法限於 `src/battle/fps`：`effectiveRoster` 同時餵給 `simulateFps` 與 `FpsScene3D`，pool 依 map / roster identity 重建；identity miss 與 authoritative death 分開處理。
- 新增 `tools/check_cs_a2_renderer_identity.mjs`，涵蓋 substitution、rematch、map transition、BO3 Map 1→2→3 與 death / identity miss contract。
- 舊 `78f7479` 未直接 cherry-pick；未搬回舊 `CsPrepScreen.jsx` 或 Competition / Season 接線。
---

## Home IA — 首頁重複入口與資訊架構去重（2026-08-23）

只動首頁的**入口與呈現**。未改路由、未刪功能本體、未碰 Competition Hub／Training
邏輯／Store contract／Player progression。基底：`main` @ `29eb712`。

### 根因

「接下來做什麼」以前是**固定五張常用捷徑取四張**，所以永遠是滿的——不管有沒有事。
結果它與「戰隊狀態」在講同一件事（選手／財務／贊助），而「現在要處理什麼」這個
責任反而沒有人扛。手機更嚴重：`roster` 同時出現在快捷行動、戰隊快照、戰隊 sheet
**三個地方**；競技 rail 與競技 sheet 的內容一字不差。

### 移除的重複入口（功能與路由都保留）

| 入口 | 桌機 | 手機 | 保留在哪 |
|---|---|---|---|
| 天賦 | Utility 移除 | 戰隊 sheet 移除 | 選手詳情頁的天賦入口；`talentPick`／`playerTalent` 路由不動 |
| 贊助商 | Utility 移除 | 更多 sheet 移除 | 戰隊狀態／戰隊快照的贊助摘要卡（本來就能直接進贊助頁） |
| 儀表板 | Utility 移除 | 更多 sheet 移除 | — （指向未接線的舊版密集儀表板，首頁本身就是儀表板） |
| 選手狀態 | Next Actions 移除固定卡 | 快捷行動移除固定卡 | 戰隊狀態／戰隊快照的摘要 |
| 訓練中心／球探招募 | Next Actions 移除固定卡 | 快捷行動移除固定卡 | Utility／戰隊 sheet |
| 競技 sheet | — | 底部 nav「競技」改為**捲到競技 rail** | 競技 rail（三個模式入口） |

`NAV.talent` 一併移除（首頁不再有指向它的入口）。**商店佔位保留**——Shop Domain
在設計文件是第二階段的正式規劃，誠實佔位是專案既有慣例。

### Next Actions 的最終條件

只放**有訊號才成立**的待辦，訊號全部來自既有資料，這裡不新增任何規則：

| 待辦 | 訊號來源 |
|---|---|
| 處理資金提醒 | `cashForecast().level !== "ok"` |
| 處理收件匣 | `inbox[].unread` |
| 戰隊發展 | `teamDevelopment.availablePoints > 0` |
| 選手傷停／體力過低 | `isInjured` / `isExhausted`（`platform/condition` 既有判定） |

沒有待辦時顯示「目前沒有急需處理的事項。」，不硬塞捷徑。

**桌機與手機吃同一份 `todos`**：桌機 `todos.slice(0,4)`，手機第一張當主要行動、
其餘進「其他待辦」（空就整段不渲染）。兩邊不會再各自長出一套「該顯示什麼」的規則。

### 驗收

**新增 `tools/browser_check_home_ia.mjs`（21/21，1280 與 390 各一輪）**

驗的是「同一件事出現幾次」與「沒事時會不會硬塞」，不驗像素也不驗文案細節。
核心是一條不變式：**待辦卡片數 === 成立的訊號數**（＝沒有填充物），
兩個寬度都在「零待辦」與「有傷停」兩種狀態下各驗一次。

⚠ 為了湊出「零待辦」必須把週淨額弄成正的——那是測試佈置的難處，不是產品缺陷：
每個情境第一週的淨額本來就是負的，資金待辦**正確地**會觸發。最後是用
elite 情境 ＋ 撥款 ＋ 簽贊助 ＋ 清空名單才讓四個訊號一起歸零。

| Gate | 結果 |
|---|---|
| `browser_check_home_ia`（新增） | **21/21** |
| `check_home_team_contract` | **40/40** |
| `check_competition_shared_ui` | 28/28 |
| `check_competition_visual_shell` | 22/22 |
| `check_cs_competition_hub` | 31/31 |
| `check_cs_season_contract` | 73/73 |
| `npm run build` | ✓ |

Competition Hub 未受影響（四支 Competition gate 全綠）。

### 其他 legacy 殘留（本輪未處理，記錄備查）

- `src/platform/DashboardScreen.jsx`：舊版密集儀表板，**沒有任何地方 render**。
  這次移除的「儀表板」入口本來就只會開佔位 modal。檔案留著，未刪。
- `src/screens/MenuScreen.jsx`：同樣無引用點（早在 Competition 線的 audit 就記過）。
- 兩者都不是首頁的入口問題，屬「未接線的舊畫面」，建議另一輪一起裁決。
## Training v1.1 Integration Pass（2026-08-23）

以正式主幹 `29eb712` 建立獨立 integration worktree，selective integrate
Training v1.1 checkpoint `1257176`。保留 Competition Hub／Season IA、CS／MOBA
賽季資料流與既有 Match 邊界；未以舊 branch 整檔覆蓋最新主幹。

- 新增 `trainingCalculator` 純規則層；訓練頁預估與 `applyCourse` 共用同一份 `TrainingResult`。
- 成長公式為課程基礎成長 × 潛力空間 × 年齡 × learning × condition；開發版快速推進與
  `meta.days` 遊戲世界日曆定義保留。
- Training / Growth UI verifier 擴充至 80/80，Recruit salary contract 直接使用 canonical
  salary API 驗證 threshold crossing；未修改 production salary formula。
- 正式線上 server-authoritative schedule 與真實時間 timer 留待第二階段，不在本輪實作。

---

## Fan System F0 — fans sanitize ＋ reputation deprecated（2026-08-23）

branch `feature/fan-f0-sanitize`，基準 `origin/main @ ae9295e`。規格：`docs/design/粉絲系統架構.md`。

### 做了什麼

**1. `meta.fans` 載入清洗**

`profileStore.js` 新增 `sanitizeFans(v, fallback)`，接在唯一的存檔水合點
（`load()` 裡的 `meta:` IIFE）。規則刻意分成兩種壞法：

| 輸入 | 結果 | 為什麼 |
|---|---|---|
| 有限非負數（含 `0`） | **原樣保留** | 裁決 2：舊存檔不做尺度 migration |
| 數字字串 `"128000"` | 取其數值 | 型別錯但意圖明確，與既有 `num()` 一致 |
| 有限負數 | 夾到 `0` | 有數字代表原本有意圖，只是溢位；夾到最近的合法值是最小介入 |
| `undefined` / `null` / `NaN` / `±Infinity` / 非數字字串 / 物件 / 布林 | 回退 `DEFAULT.meta.fans` | 這種值**無法還原**；回退 0 會讓玩家只簽得起最低階贊助 ⇒ 等於把壞存檔判死刑 |
| 小數 | `Math.floor` | 清洗不得讓粉絲變多 |

⚠ 只清洗，**不換算尺度**。128,000 量級未動。
⚠ `null` 在 `Number()` 之前擋掉——`Number(null) === 0` 會把「沒有值」悄悄變成「零粉絲」。
⚠ 顯式 `undefined` 必須處理：`{ ...{fans:1}, ...{fans:undefined} }` 得到 `{fans: undefined}`，spread 擋不住。

**2. `reputation` deprecated（非刪除）**

- `applyMatchProgress`：不再累加、不再寫回 `meta`、**收據不再帶 `team.reputation`**。
  `{ ...meta, fans: fansAfter }` 的 spread 會原樣帶過既有 `meta.reputation`
  ⇒ 對真實存檔**狀態逐值相同**（兩個 adapter 本來就一律送 0）。
- `RewardReceiptPanel`：移除「聲望」格，網格 3 欄 → 2 欄。它永遠顯示「聲望 —」，
  一個永遠不會動的欄位比沒有這個欄位更誤導。
- `MobaFlowScreens`：那一格的值一直是 `r.fanGain`，標籤卻寫「聲望」——**顯示的是粉絲，
  掛的是聲望的名字**。標籤改成「粉絲」，值不變（改名不是改數）。
- 欄位、種子值 47、契約 schema **全部不動**；舊存檔仍讀得到 `meta.reputation`。

### 驗證（全部實跑）

| 項目 | 結果 |
|---|---|
| `node tools/check_fan_f0.mjs`（新增） | **33/33** |
| `verify.mjs --only=progress25,experience26,talent27,stats28,cs23,tactic24` | **6/6 PASS**（talent27 見下方「被 gate 擋下來的改動」） |
| `check_progress25` | 34/34 |
| `check_authoritative_o7` | 48/48 |
| `check_fixture_result_integrity` | 20/20 |
| `check_result_flow_o71` | 27/27 |
| `check_growth_loop_p0` | 25/25 |
| `check_finance_n3` | 40/40 |
| `check_condition_o2` | 30/30 |
| `node tools/regress.mjs` | 結束率 15/15、0 殺場 0、撤退鎖死 0 |
| `node tools/regress2.mjs` | 節奏門檻 **8/8** |
| `npm run build` | ✓ built in 17.20s |

**Mutation sentinel（證明 gate 有鑑別力）**

- 把 `sanitizeFans` 改成 identity ⇒ **33 → 24**（9 條紅）
- 把 `reputation` 寫回 settlement ⇒ **33 → 32**（§4a 紅）
- 兩者還原後都回到 33/33

### 過程中發現的兩件事（非本次改動造成）

**(a) Edit/Write 工具在 Windows 上把檔案寫成 CRLF，而 repo 是 LF。**
12 行的改動一度顯示成 230 行的 diff（`applyMatchProgress.js` 230 個 CR、
`MobaFlowScreens.jsx` 240 個、`RewardReceiptPanel.jsx` 120 個）。
已全部 `sed -i 's/\r$//'` 正規化回 LF，`git diff` 與 `--ignore-cr-at-eol` 現在數字相同。
**任何在 Windows 上用工具改這個 repo 的人都要注意這件事**，否則 review 會看到假的大 diff。

**(b) `useBattleFeed.js` 讀 `profile.meta.fans` 是合法的。**
它在**賽後**把 `fansNow` 餵給 `teamRewardsFor()`（獎勵公式），
沒有進模擬、沒有進 stats、沒有進勝率。`check_fan_f0` §6b 把這個例外明確寫成斷言，
避免日後有人「順手清乾淨」而拆掉獎勵。


### 一個被 gate 擋下來的改動（保留紀錄）

原本想在 `contracts/matchProgressTransaction.js` 的 `reputation` 欄位旁加一行 deprecated 註解，
被 **`check_talent27` §28「不修改 MatchProgressTransaction.v1（git diff 零改變）」** 擋下（36/37 紅）。

那道 gate 是**對的**：契約檔用 `git diff --quiet` 守成逐位元凍結，
連註解都不讓改——這正是裁決 5「不物理刪除欄位、schema 不動」在程式碼層的保險。

**處置**：還原該檔（現在相對 HEAD 零改變），deprecated 說明改放在
`applyMatchProgress.js`、兩個 adapter、TD-22 與 `docs/design/粉絲系統架構.md` §4.4。
還原後 `talent27` **37/37**。

⚠ **給 F1 / F5 的提醒**：`BattleResult.v2`、`CsMatchResult.v1`、`MatchProgressTransaction.v1`
三支契約檔都在 `check_talent27` §26–28 的逐位元凍結下。任何需要動它們的想法，
**先確認是不是真的要改契約**，不要順手改註解。
### 沒有做

- 未改 `SPONSORS[].reqFans`、未改 `fanGain`、未做 Practice/League/Major 權重
- 未改 Sponsor pricing、Training v1.1、Competition / Season、`economyConfig`
- 未物理刪除 `reputation` 欄位、未做任何 save schema migration
- 未建 `check_fan_system.mjs`（F5 從 F1 才開始；`check_fan_f0` 的斷言屆時併進去）
- **未開始 F1**

## CS-P0 Renderer Visibility Integration（2026-08-23）

- Identity bug：CS-A2 已關閉；`effectiveRoster`、authoritative frame 與 renderer entity identity 維持一致，identity miss 不再當作死亡。
- Camera viewport bug：P0 runtime 證明自動導播的 duel／hotspot framing 會讓整隊存活玩家落在 viewport 外；已加入 DEV visibility snapshot、alive-offscreen 診斷與 overview recovery。
- 本次以最新 `origin/main` 的 primitive FPS renderer 做最小 forward-port，未帶入尚未整合的 C2A rigged pipeline；不修改 Simulation、MR12、Competition、Training 或 Fan F0。

## CS-P0 Visibility Final Integration / Deploy（2026-08-23）

- `origin/main@ab627ec` 與 candidate `68125dd` 無新的 FPS semantic conflict；以最小整合方式正式推送至 `origin/main@68125dd`。
- 本次 P0 的 production root cause 是 auto-camera duel／hotspot framing 將存活玩家置於 viewport 外；不是 identity、death lifecycle 或 renderer entity missing。
- Local 與 production Practice → Mirage → Battle smoke 均確認 BLUE／RED 各 5 人可見，auto-camera recovery 正常，console uncaught error 為 0；alive-off-camera local runtime snapshot 為空。
- CS-C2A rigged presentation gate 在目前正式 main 不適用（N/A）；本輪未帶入 C2A／C2B、人物資產或其他視覺工作。
- P0 已達成 **CLOSED ON PRODUCTION**。既有 R63 ActiveMatch 12/13 fast-finish assertion 仍為獨立既有紅燈，本輪未修改。

---

## Fan System F1 — Sponsor eligibility ＋ fan source weighting（2026-08-23）

branch `feature/fan-f1-eligibility`，基準 `origin/main @ ab627ec`。
規格：`docs/design/粉絲系統架構.md`（§〇之二 裁決 B、§〇之三 Addendum、§4.1、§4.2）。

### 做了什麼

**1. Sponsor eligibility 收斂成一份規則**

F1 之前同一條規則寫在兩個地方——`profileStore.signSponsor()` 與
`SponsorScreen.jsx` 的 `const qualifies = (sp) => fans >= sp.reqFans && wins >= sp.reqWins`。
`reqFans` 全部達標時看不出來；粉絲**真的**開始擋人之後，這就是玩家會踩到的 bug
（畫面說「條件達標」而 Store 拒簽）。

新增 `economy/sponsors.js → sponsorEligibility(sponsor, { fans, wins })`，
Store 判定與畫面顯示都用它，**畫面不自己算**。回傳 `{ ok, fansOk, winsOk, fansShort, winsShort }`
——只回報「夠不夠」，**不回報「值多少」**（價碼分級是 Fan v1.1）。

**2. `reqFans` 重新校準（從可達性反推，不是照抄 baseline）**

| 贊助商 | tier | 週收 | 舊 | **新** |
|---|---|---|---|---|
| 在地網咖 | 入門 | 6 萬 | 0 | **0** |
| 紅牛運動 | 中級 | 12 萬 | 500 | **100,000** |
| HyperX 外設 | 中級 | 15 萬 | 800 | **150,000** |
| Vortex 電競椅 | 頂級 | 20 萬 | 1,500 | **170,000** |
| MAMIMOTH 能量飲 | 頂級 | 25 萬 | 2,000 | **185,000** |
| 加密貨幣交易所 | 頂級 | 35 萬 | 3,000 | **200,000** |

`reqWins`（0/3/5/10/15/20）**未動**——它是另一道獨立閘門。

**3. Fan source weighting（練習 < 聯賽 < Major）**

新增純模組 `platform/progress/fanSourceWeight.js`：

- `FAN_SOURCE_WEIGHT` = 練習 **1.0** ／ 聯賽 **5.0** ／ Major **8.5**
- `fanSourceFromOrigin(origin)`：`kind: "ticket"` ⇒ 練習；`kind: "fixture"` ⇒ 依
  `competitionId` 最後一段的 tier 決定聯賽或 Major
- `tier` 對應：`regular`/`qualifier` → 聯賽；`major`/`championship` → Major
  （**championship 併進 major 桶，F1 不發明第四級**）
- 拿不到 origin ⇒ 練習賽倍率（**保守方向**，避免「查不到就當大賽算」的反向漏洞）

接線方式：
- `teamRewardsFor({ ..., fanSourceWeight = 1 })` ——**只乘粉絲，不乘獎金**
  （Addendum §5：獎金由競技成績決定）。預設 1 ⇒ 既有呼叫端逐值不變。
- 兩個 adapter 收 `ctx.origin`，共用同一支 `fanWeightForOrigin`（沒有第二套公式）
- 兩個呼叫端（`useBattleFeed` / `settleCsMatch`）從 `store.matchmaking.session.origin` 取

🔒 **契約零改動**：`BattleResult.v2` / `CsMatchResult.v1` / `MatchProgressTransaction.v1`
一個位元都沒動（`check_talent27` §26–28 仍全綠）。來源資訊本來就在 `MatchOrigin.v1` 裡。

### 校準證據（`node tools/fan_calibration.mjs` 可重跑）

**關鍵事實：玩家一季只打 14 場正式聯賽**（8 隊雙循環）。
全聯盟 56 場**不是**玩家的場數——這兩個數字差 4 倍，用錯會讓整條階梯算錯。

單場 fanGain（勝場，marginF=0.4）：

| 來源 | 連勝 0 | 連勝 3 | 體感目標 | |
|---|---|---|---|---|
| 練習 | 176 | 251 | 數百 | ✅ |
| 聯賽 | 880 | 1,255 | 800–1500 | ✅ |
| Major | 1,496 | 2,134 | 1500–2500 | ✅ |

每季粉絲收入：**保守 6,433 ／ 一般 9,723 ／ 良好 20,494**

各階可達季數：

| 贊助商 | reqFans | 保守 | 一般 | 良好 |
|---|---|---|---|---|
| 在地網咖 | 0 | 開局 | 開局 | 開局 |
| 紅牛運動 | 100,000 | 開局 | 開局 | 開局 |
| HyperX | 150,000 | 3.4 | 2.3 | **1.1** |
| Vortex | 170,000 | 6.5 | 4.3 | 2.0 |
| MAMIMOTH | 185,000 | 8.9 | 5.9 | 2.8 |
| 加密貨幣 | 200,000 | 11.2 | **7.4** | **3.5** |

驗收標準（裁決 B）六條全過：
① 開局即有可維持財務的正式贊助（紅牛 100k ≤ 起始 128k、週收 12 萬 > 支出 17.7 萬 − 基礎營收 6 萬）
② 第一個 Fan-gated 升級第一季走完 44%（一般情境）
③ 中階 1.1 個良好賽季
④ 頂階 3.5 個良好賽季（落在 3–5）
⑤ 一般情境 7.4 季碰頂階（< 8，不落在被否決的 8–15 區間）
🔒 hard constraint：第二階 100,000 ≤ 起始 128,000

> 保守情境（40% 勝率）需要 11.2 季才到頂階——**刻意不設門檻**：
> 打不贏的隊伍拿不到頂級贊助是正確的產品行為，不是校準失敗。

### 驗證（全部實跑）

| 項目 | 結果 |
|---|---|
| `check_fan_system`（新增） | **21/21** |
| `check_fan_f0` | 33/33 |
| `check_progress25` | 33/33 |
| `check_finance_n3` / `check_finance_n` | 40/40 ／ 32/32 |
| `check_home_team_contract` | PASS |
| `check_authoritative_o7` | 48/48 |
| `check_competition_q1` / `q3` / `q4` | 93/93 ／ 91/91 ／ 68/68 |
| `check_cs_season_contract` | PASS |
| `check_result_flow_o71` | 27/27 |
| `check_growth_loop_p0` / `check_growth_ui_p1` | 25/25 ／ 80/80 |
| `regress` / `regress2` | 15/15 ／ 8/8 |
| `browser_check_fan_f1`（新增） | **17/17**（1280 ＋ 390） |
| `npm run build` | ✓ built in 12.47s |

**Mutation sentinel（三個都有鑑別力）**

| 注入的錯誤 | 結果 |
|---|---|
| 權重順序反轉（practice 9.9 / major 0.5） | 21 → **19**（§3a、§3b 紅） |
| `reqFans` 第二階調到 900,000 | 21 → **20**（§4 紅） |
| 把 `perk` 接進 `trainingCalculator` | 21 → **20**（§5 紅） |

三者還原後皆回到 21/21。

### 過程中修正的兩個我方錯誤（不是產品缺陷）

**(a) browser smoke 第一版斷言錯了。** 我假設「粉絲拉到 900 萬 ⇒ 贊助全解鎖」，
實際仍有 5 個鎖住——因為 **`reqWins` 是獨立閘門**，0 勝的新局本來就簽不了。
產品行為正確，是我的期待錯了。改成驗「粉絲那一維真的翻轉」
（HyperX 需 150,000：128k ⇒ 差 22,000 不合格；900 萬 ⇒ 合格），並加一條
明確斷言 reqWins 仍在擋人。

**(b) 靜態掃描一律先剝註解。** 這個 repo 的註解裡大量出現 fans / perk / reputation，
不剝註解的 grep 會把「我們刻意不做這件事」的說明判成「做了這件事」。
`check_fan_system` 內建 `codeOnly()`，同時剝掉註解與字串字面值。

### 沒有做（F1 邊界）

- 未碰 `economyConfig`（**不需要**，見下）
- 未做 Season Performance（B 層）、Form / Hype（C 層）
- 未做 Sponsor pricing（v1.1）、未碰 Sponsor perk（另案）
- 未新增任何永久 reputation / hype 欄位
- 未讓粉絲影響獎金、選手數值、勝率、battle engine
- 未做 fans decay、未建 Fan Center
- 未改三支凍結契約檔
- **未開始 F2 / F3 / F4**

### economyConfig：不需要動

裁決 B 的目標①要求「開局 8 週內有可維持基本財務的正式 Sponsor 路徑」。
把第二階訂在 100,000（≤ 起始 128,000）之後，開局即可簽紅牛（週收 12 萬），
`6 + 12 = 18 萬 > 支出 17.7 萬` ⇒ 週淨額轉正，**不需要調整任何經濟參數**。
風險 R9（F1 可能牽動 economyConfig）**未觸發**。

---

## Fan System F2 — Season / Major / Champion fan awards（2026-08-23）

branch `feature/fan-f2-season-awards`，基準 `origin/main @ 14766f1`。**未 push。**
規格：`docs/design/粉絲系統架構.md`。

### 做了什麼

**1. 賽季名次粉絲獎勵（新純模組 `platform/economy/seasonFanAward.js`）**

`seasonFanAwardOf(final)` 只吃 `FinalStandings.v1`，回傳名次粉絲 ＋ 冠軍粉絲。

| 層級 | 名次表（第 1 名起） | 冠軍加碼 |
|---|---|---|
| `regular` 聯賽 | 6000 / 4000 / 2800 / 2000 / 1200 / 900 / 600 / 400 | +6000 |
| `major` | 10000 / 6000 / 4000 / 3000 | +10000 |
| `championship` 年度總決賽 | 12000 / 7500 / 5000 / 3500 | +12000 |
| `qualifier`（尚無生產者） | 1500 / 900 / 600 / 400 | +800 |

- 聯賽奪冠 = 6000 ＋ 6000 = **12,000**（約 10k 級別的跳升）
- Major 奪冠 = 10000 ＋ 10000 = **20,000**
- 雙冠 32,000 vs 全程 72,000 ⇒ **一冠不跳完整階梯**（44%）
- 冠軍以 `championTeamId` 判定，不是 `rank === 1`（季後賽重排後契約另有一欄）
- **MOBA / CS 共用同一支**——兩者的賽季結果都是 `FinalStandings.v1`
- 不碰 CS 的 map / series internals（verifier §10b 守著）

**2. 唯一結算點，不新增帳本**

粉絲掛在既有的 `settleCompetitionAwardInState()` 上，沿用同一把冪等鍵
（`FinalStandings.id`）與同一本帳本（`processedCompetitionAwards`）。
Fan v1 的兩個 write path 維持不變：`applyMatchProgress` 與 `settleCompetitionAward`。

**3. `fansAtSeasonStart` 快照**

接在 **`createSeasonState()`**——它是唯一的建季原語，`rollToNextSeason()` 內部也呼叫它
⇒ 建季與換季四條路徑自動都拿得到，不會漏。
舊存檔沒有這個欄位 ⇒ `null`，**刻意不回填**（回填等於編一個當時不存在的數字）。

### ⚠ 一個被 SeasonState.v2 契約擋下來的改動（重要）

`settleCompetitionAwardInState()` 只在 Event **有 `prizePolicy`** 時才被呼叫。
但 CS 聯賽刻意 `prizePolicy: null`（獎金級距未定義）⇒ **CS 賽季名次拿不到粉絲**。

我嘗試「只解開粉絲那一側」（無政策時傳空獎金表，錢的行為逐值不變），
結果 `check_competition_q4` 從 68/68 掉到中途拋錯。根因是
`seasonStateV2.js` 有明文不變式：

```
award_without_policy — "award receipt requires a prize policy reference"
```

**沒有獎金政策的 Event 不得存在 award receipt**，這是 SeasonState.v2 的契約，
不只是 `events[eid].award` 那一欄。依規則**停止擴 scope、完整還原**，q4 回到 68/68。

**實際覆蓋範圍**：

| 賽事 | 賽季粉絲 |
|---|---|
| MOBA 聯賽（`LEGACY_PRIZE_POLICY`） | ✅ 會發 |
| CS Major（`CS_MAJOR_PRIZE_POLICY`） | ✅ 會發 |
| CS 聯賽（`prizePolicy: null`） | ❌ **拿不到** |
| MOBA 亞洲巡迴站／年度總決賽（`null`） | ❌ **拿不到** |

**這是待決策的缺口，不是已完成的設計。** 要補上需要在 V2 契約層把
「粉絲獎勵」與「獎金收據」拆成兩個概念——那是獨立一輪的工作。

### 校準結果：⚠ 頂階變太快，未自行調整

`node tools/fan_calibration.mjs`（直接 import 產品模組）：

| 情境 | 比賽 | ＋ 賽季獎勵 | ＝ 每季 |
|---|---|---|---|
| 保守 | 6,433 | 600 | 7,033 |
| 一般 | 9,723 | 2,000 | 11,723 |
| 良好 | 20,494 | 10,000 | 30,494 |

| 贊助商 | reqFans | 保守 | 一般 | 良好 |
|---|---|---|---|---|
| HyperX | 150,000 | 3.1 | 1.9 | **0.7** |
| Vortex | 170,000 | 6.0 | 3.6 | 1.4 |
| MAMIMOTH | 185,000 | 8.1 | 4.9 | 1.9 |
| 加密貨幣 | 200,000 | 10.2 | 6.1 | **2.4** |

| 驗收標準 | 結果 |
|---|---|
| ② 第一季看得到明顯進度 | ✅ 一般情境走完 53% |
| ③ 中階 1–2 個成功賽季 | ✅ 0.7 季（偏快但在範圍下緣） |
| ④ **頂階 3–5 個良好賽季** | ❌ **2.4 季，低於 3 季下限** |
| ⑤ 正常玩法不需 8–15 季 | ✅ 一般 6.1 季 |
| ⑥ 一冠不跳完整階梯 | ✅ 雙冠 32,000 / 全程 72,000 |

**依指示未自行調整 `reqFans`，也未動 `economyConfig`。**

原因是結構性的：F1 的階梯是**只有比賽粉絲**時校準出來的（頂階 3.5 季）。
F2 加了第二條收入來源，任何有感的賽季獎勵都會把它壓到 3 季以下。

**建議（未套用）**：把階梯依新的每季收入重算，維持相同的季數目標——
頂階 ≈ 128,000 + 3.5 × 30,494 ≈ **235,000**；中階 ≈ 128,000 + 1.5 × 30,494 ≈ **175,000**。

### 驗證（全部實跑）

| 項目 | 結果 |
|---|---|
| `check_fan_system`（擴充至 48 條） | **48/48** |
| `check_fan_f0` | 33/33 |
| `check_competition_q1/q3/q4/q5/q6` | 93 / 91 / 68 / 69 / 57 |
| `check_cs_season_contract` / `cs_season_lifecycle` / `cs_major` | PASS / 53/53 / 74/74 |
| `check_competition_shared_ui` | 28/28 |
| `check_q7a_3b_multi_event` / `q7b_asia_finals` / `season_state_v2_sealing_m2` | 51/51 / 72/72 / 24/24 |
| `check_progress25` / `finance_n3` / `result_flow_o71` / `growth_loop_p0` | 33 / 40 / 27 / 25 |
| `check_talent27` | 37/37 |
| `regress` / `regress2` | 15/15 ／ 8/8 |
| `npm run build` | ✓ built in 13.98s |

**Mutation sentinel（三個都有鑑別力）**

| 注入的錯誤 | 結果 |
|---|---|
| 拿掉重複結算保護 | 48 → **46**（§11b、§11c 紅） |
| 冠軍 / Major 權重反轉 | 48 → **46**（§9b、§9d 紅） |
| 加入第三個 fan write path | 48 → **46**（§12b-2、§12b-3 紅） |

### 修正的一個我方誤判

第一版 §12a 斷言「`meta.fans` 只有兩個寫入點」把 `profileStore` 判成違規。
實查後那兩處是 **DEFAULT 種子**與 **F0 的 `sanitizeFans()` 載入清洗**——都不是發放。
斷言改成守「沒有第三處會讓粉絲**增加**」（用 `fansAfter` / `fansBefore +` 偵測加法），
這才是「不得有第三個 fan write path」的真正語意。

### 沒有做

未碰 `economyConfig`、未調 `reqFans`、未改 F1 的來源權重、未做 UI（所以沒有 browser smoke）、
未動三支凍結契約、未做 Season Performance / Form-Hype / pricing / perk / decay / Fan Center。
**未開始 F3 / F4。**

---

## Fan System F2 closure — reqFans 微調 ＋ CS 聯賽 award blocker audit（2026-08-23）

branch `feature/fan-f2-season-awards`，接在 F2（`c772bb2`）之後。**未 push。**

### A. Sponsor reqFans 微調

| 贊助商 | 舊（F1） | **新** |
|---|---|---|
| 在地網咖 入門 | 0 | 0 |
| 紅牛運動 中級 | 100,000 | 100,000 |
| HyperX 中級 | 150,000 | 150,000 |
| Vortex 頂級 | 170,000 | **180,000** |
| MAMIMOTH 頂級 | 185,000 | **205,000** |
| 加密貨幣 頂級 | 200,000 | **235,000** |

`reqWins` 未動、`economyConfig` 未動。

**重跑 `node tools/fan_calibration.mjs`：**

| 贊助商 | reqFans | 保守 | 一般 | 良好 |
|---|---|---|---|---|
| 紅牛運動 | 100,000 | 開局 | 開局 | 開局 |
| HyperX | 150,000 | 3.1 | 1.9 | **0.7** |
| Vortex | 180,000 | 7.4 | 4.4 | 1.7 |
| MAMIMOTH | 205,000 | 10.9 | 6.6 | 2.5 |
| 加密貨幣 | 235,000 | 15.2 | **9.1** | **3.5** |

| 驗收標準 | 結果 |
|---|---|
| 🔒 開局財務生存（第二階 ≤ 起始 fans、週收 12 萬 > 支出 17.7 − 基礎營收 6） | ✅ 紅牛 100,000 ≤ 128,000 |
| ② 第一個 Fan-gated upgrade 第一季明顯接近 | ✅ 一般情境走完 **53%** |
| ③ 中階 1–2 successful seasons | ✅ HyperX 良好 **0.7 季** |
| ④ 頂階 3–5 good seasons | ✅ 加密貨幣 良好 **3.5 季**（正中目標） |
| ⑤ 不接受 8–15 seasons | ⚠ **看用哪個情境衡量**（見下） |

**⑤ 的判定取決於「哪一種玩法」**

- 以 **good play（良好）** 衡量：**3.5 季** ✅
- 以 **normal play（一般）** 衡量：**9.1 季**，落在被否決的 8–15 區間 ❌

F1 當時這條寫的是「**正常玩法**不需要 8–15 季」，校準器因此把 ⑤ 綁在「一般」情境上；
本輪的指示寫的是「不接受 **good play** 8–15 seasons」。兩種讀法結論相反。

**依指示未再自行大改階梯**——這一條需要你裁定要用哪個情境當標準。
若要讓一般情境也 < 8 季，頂階大約要壓到 **≤ 220,000**（`128,000 + 8 × 11,723 ≈ 221,784`），
但那會讓良好情境掉到 3.0 季（仍在 3–5 的下緣）。

### B. CS League competition award blocker — **Audit only，未實作**

**問題**：`settleCompetitionAwardInState()` 只在 Event 有 `prizePolicy` 時被呼叫
⇒ CS 聯賽（刻意 `prizePolicy: null`）與 MOBA 巡迴站／年度總決賽拿不到賽季粉絲。

**Audit 結果：現有契約下沒有最小、向後相容的做法。** 三條證據：

**① `awardReceiptRef` 是從帳本推導的，躲不掉**

`seasonStateV2.js → awardEnvelopeOf(final, awardLedger)`：

```
const receipt = objectOf(awardLedger?.[final.id]);
const awardReceiptRef = receipt ? { …, path: "processedCompetitionAwards", … } : null;
```

只要 `processedCompetitionAwards` 有這場的 entry，envelope 就會生出 `awardReceiptRef`。
所以「粉絲寫進帳本但不寫 ref」做不到——**ref 不是另外寫的，是推導的**。

**② 這個不變式是刻意的，原始碼寫得很明白**

`seasonStateV2.js:428-437` 的註解：

> An older M1 v2 save may already contain the legacy award receipt but not the
> explicit policy reference. That one compatibility case can be recovered because
> the event is still bound to SeasonState.v1.
> **Arbitrary v2 events never infer a policy from a receipt.**

驗證器 `seasonStateV2.js:734`：

```
if (!event.prizePolicyRef && event.final?.awardReceiptRef)
  errors.push({ code: "award_without_policy", … });
```

**③ 「給 CS 聯賽一份空獎金政策」會撞掉四支 gate**

| gate | 斷言 |
|---|---|
| `check_cs_major.mjs:148` | CS 非 Major 的 Event `prizePolicy === null` |
| `check_cs_major_honors_award.mjs:121` | `leagueEvent.prizePolicy === null` |
| `check_cs_season_lifecycle.mjs:107` | CS 第一個 Event `prizePolicy === null` |
| `check_q7b_asia_finals.mjs:159` | 年度總決賽「**沒有獎金政策**（本輪不訂金額）」 |

而且它直接違反已記錄的產品決策：**「CS 獎金級距、贊助連動與經濟平衡都還沒定義，
給它政策等於憑空發明經濟規則」**（`seasonState.js:214` 的原註記）。

**結論：任何做法都要擴充 award policy 模型本身**——
`Event.v2` / `SeasonState.v2` 是版本化契約（`EVENT_V2_SCHEMA` / `SEASON_STATE_V2_SCHEMA`），
新增一種「非現金獎勵政策」屬於改 Competition architecture。
**依指示 STOP，未實作。**

#### 兩個候選方案（供裁定，皆未動工）

| | 方案 | 代價 |
|---|---|---|
| **B-1** | 在 Event 上新增 **`fanPolicyRef`**，與 `prizePolicyRef` 平行；`awardEnvelopeOf` 依政策種類決定要不要生 `awardReceiptRef`；驗證器改成「有任一種政策即合法」 | `Event` / `SeasonState.v2` schema 變更 ＋ 驗證器與 envelope 推導同步改。**乾淨但是契約層工作** |
| **B-2** | 把 `prizePolicyRef` 廣義化成 **award policy**，新增一種 `cash: false` 的政策 | 四支 gate 要改，且「CS 有政策」與既有產品決策衝突。**不建議** |

**建議 B-1，獨立一輪處理**，不要塞進 F4。

在此之前的覆蓋現況維持不變：MOBA 聯賽 ✅／CS Major ✅／CS 聯賽 ❌／MOBA 巡迴站與總決賽 ❌。

### 驗證（全部實跑）

`check_fan_system` **48/48**、`fan_f0` 33/33、
`competition_q1/q3/q4/q5/q6` 93/91/68/69/57、
`cs_season_contract` PASS、`cs_season_lifecycle` 53/53、`cs_major` 74/74、
`competition_shared_ui` 28/28、`season_state_v2_sealing_m2` 24/24、
`finance_n3` 40/40、`progress25` 33/33、
`regress` 15/15、`regress2` 8/8、
`browser_check_fan_f1` **17/17**（新門檻在 Sponsor UI 上顯示正常）、
build ✓ built in 10.78s。

### 沒有做

未改 `reqWins`、`economyConfig`、三支凍結契約、Competition architecture、
`Event` / `SeasonState.v2` schema。**未開始 F4，未 push。**

---

## Fan System F2 最終 closure — Crypto 門檻 235k → 220k（2026-08-23）

branch `feature/fan-f2-season-awards`，接在 `ca29db1` 之後。**未 push。**

只改一個數字：`crypto` 的 `reqFans` **235,000 → 220,000**。
其餘 `0 / 100,000 / 150,000 / 180,000 / 205,000` 不動；
`reqWins`、`economyConfig`、fan award 表、Competition contract 全部不動。

### 校準結果：六條驗收標準**全過**

| 贊助商 | reqFans | 保守 | 一般 | 良好 |
|---|---|---|---|---|
| 紅牛運動 | 100,000 | 開局 | 開局 | 開局 |
| HyperX | 150,000 | 3.1 | 1.9 | **0.7** |
| Vortex | 180,000 | 7.4 | 4.4 | 1.7 |
| MAMIMOTH | 205,000 | 10.9 | 6.6 | 2.5 |
| 加密貨幣 | **220,000** | 13.1 | **7.8** | **3.0** |

| 標準 | 結果 |
|---|---|
| 🔒 開局財務生存 | ✅ 紅牛 100,000 ≤ 128,000 |
| ② 第一季 Fan-gated upgrade 有明顯進度 | ✅ 一般走完 **53%** |
| ③ 中階 1–2 successful seasons | ✅ **0.7 季** |
| ④ 頂階 good play 3–5 seasons | ✅ **3.0 季** |
| ⑤ 一般玩法頂階 < 8 seasons | ✅ **7.8 季** |
| ⑥ 一冠不跳完整階梯 | ✅ 雙冠 32,000 / 全程 92,000 |

⚠ **④ 與 ⑤ 都貼著邊界**（3.0 對下限 3、7.8 對上限 8）。
之後任何動到 `fanGain`、來源權重或賽季獎勵的改動，都會立刻把其中一條推出範圍
⇒ **改那些東西時必須重跑 `node tools/fan_calibration.mjs`**。

其他 Sponsor 節奏未被破壞：中階與兩個中間頂階的季數與上一輪相同，只有頂端往下移。

### 順手修掉一個會誤導人的輸出

`fan_calibration.mjs` 現在有兩組驗收檢查。上面那組是 F1 時代的（**只算比賽粉絲、
不含賽季獎勵**），⑤ 在那裡永遠會紅。已把標題改成
「**F1 基準：僅比賽粉絲（歷史對照，不是現行驗收）**」並加註
「現行驗收以下方『F2 後』那一組為準」——否則下一個人會照著紅燈去調階梯。

### 驗證（全部實跑）

`check_fan_system` 48/48、`check_fan_f0` 33/33、`finance_n3` 40/40、`progress25` 33/33、
`competition_q1/q3/q4/q5/q6` 93/91/68/69/57、`cs_season_contract` PASS、
`cs_major` 74/74、`season_state_v2_sealing_m2` 24/24、
`regress` 15/15、`regress2` 8/8、`browser_check_fan_f1` **17/17**、build ✓ 11.86s。

### 未做

`reqWins`、`economyConfig`、fan award 表、Competition contract、三支凍結契約全部零改動。
**TD-28（CS 聯賽 fan-only award blocker）維持未解，本輪不修。**
**未開始 F4，未 push。**

---

## Fan System F2.1 — Competition Fan Award Policy（2026-08-23）

branch `feature/fan-f2-1-award-policy`，基準 `origin/main @ 5804849`。**未 push。**
**TD-28 已解決。**

### Audit 先講：真正的限制在哪

TD-28 的表面症狀是「CS 聯賽拿不到賽季粉絲」，根因有三層：

1. **runtime 是 v1，不是 v2。** `seasonSealingV2` 的**寫入側刻意停用**（2026-08-19 裁決，
   多 Event sealing ownership 未定義）。實際結算走 `profileStore._sealSeasonIfFinished` /
   `_sealCsSeasonIfFinished`，閘門是 v1 的 `ev.prizePolicy`。
   ⇒ **兩層都要動**，只改 v2 不會有任何效果。
2. **`awardReceiptRef` 是推導的，不是寫的。** `seasonStateV2.js → awardEnvelopeOf()`
   直接看 `processedCompetitionAwards[final.id]` 有沒有 entry 來生 ref
   ⇒ 「粉絲寫進帳本但不寫 ref」在架構上做不到。
3. **不變式是刻意的。** `seasonStateV2.js` 明文寫著
   「Arbitrary v2 events never infer a policy from a receipt」，只有一個 M1 舊存檔的相容特例。

**結論：不是要繞過契約，是契約少了一種政策。** F2.1 補上它。

### 做了什麼

**新增純模組 `platform/competition/awardPolicy.js`（零 import）**

| 匯出 | 用途 |
|---|---|
| `FAN_AWARD_POLICY` | `{ kind: "fan_award", table: "none" }` — 只有粉絲、沒有現金 |
| `NO_PRIZE_TABLE` | 空獎金表 ⇒ 任何名次都是 0 |
| `hasAwardPolicy(event)` | 任一政策即需結算（**唯一判定出口**） |
| `isFanAwardPolicy(policy)` | 型別判定 |
| `fanPolicyRefFor(competitionId)` | v2 的 fan policy reference |

零 import 是刻意的：v1（`seasonState` / `asiaCircuit` / `asiaFinals`）與 v2
（`seasonStateV2`）兩層都要用它，放在任何一邊都會製造迴圈。

**v1（runtime）層**

- CS 聯賽：`fanPolicy: FAN_AWARD_POLICY`（`prizePolicy` **維持 null**）
- MOBA 亞洲巡迴站、年度總決賽：`fanPolicy: FAN_AWARD_POLICY`
- `profileStore` 兩條封存路徑：閘門從 `ev.prizePolicy` 改為 `hasAwardPolicy(ev)`；
  fan-only 時傳 `NO_PRIZE_TABLE` ⇒ 金額恆 0、不寫交易
- ⚠ `events[eid].award` **仍只在有 `prizePolicy` 時才寫**——那一欄是**獎金**收據，
  q7a_3b 明文禁止「0 元假收據」。粉絲收據住在帳本裡。

**v2（投影／驗證）層**

- `syncSeasonStateV2`：`fanPolicyRef: legacyEvent?.fanPolicy ? fanPolicyRefFor(...) : null`
- `normalizeEvent`：新增 `fanPolicyRef`，**刻意沒有任何 inference 分支**
- 單一 Event 相容 adapter：舊存檔不可能有 `fanPolicy` ⇒ 一律 null
- 驗證器：`!prizePolicyRef && !fanPolicyRef && awardReceiptRef` → `award_without_policy`
  ⇒ **放寬的是「哪一種政策算數」，不是「可以沒有政策」**

### 更新了五條既有斷言（原意保留，量測改對）

F2.1 讓帳本同時裝 fan-only 收據，五條用「帳本筆數／成員」當代理的斷言因此量錯了。
它們的**標籤講的都是「不發獎金」**，所以改成量金額：

| gate | 原斷言 | 改成 |
|---|---|---|
| `q4 3b` | 帳本筆數 `=== 1` | 帳本**位置**（原意就是位置，筆數是順手寫的） |
| `q4 3d3` | 帳本筆數 `=== 1` | **重複封存五次筆數不增加**（真正的冪等） |
| `q7b 9f` | 帳本筆數 `<= 1` | 年終賽收據 **amount === 0**（真正的「沒發獎金」） |
| `cs_lifecycle` | 只建立一筆帳本鍵 | 兩個 Event 各一筆（聯賽 fan-only ＋ Major 獎金） |
| `cs_lifecycle` | CS 聯賽**不在**帳本裡 | CS 聯賽 **amount === 0** ＋ **fans > 0**（新增一條） |

覆蓋率沒有下降：`cs_season_lifecycle` 從 53 → **54**。

### 驗證（全部實跑）

| 項目 | 結果 |
|---|---|
| `check_fan_system`（48 → **66**） | **66/66** |
| `check_fan_f0` | 33/33 |
| `competition_q1/q3/q4/q5/q6` | 93 / 91 / 68 / 69 / 57 |
| `cs_season_contract` | PASS |
| `cs_season_lifecycle` | **54/54** |
| `cs_major` | 74/74 |
| `competition_shared_ui` | 28/28 |
| `season_state_v2_sealing_m2` | 24/24 |
| `q7a_3b_multi_event` / `q7b_asia_finals` / `q7a_3c_circuit_points` / `q7d_honors` | 51 / 72 / 69 / 59 |
| `cs_schema_v11` | **41/41**（舊存檔 migration 未破壞） |
| `finance_n3` / `progress25` / `talent27` | 40 / 33 / 37 |
| `regress` / `regress2` | 15/15 ／ 8/8 |
| `npm run build` | ✓ built in 10.74s |

**Mutation sentinel（三個都有鑑別力）**

| 注入的錯誤 | 結果 |
|---|---|
| 拿掉 `fanPolicyRef` 正規化 | 66 → **65** |
| 把 policy-less Event 放行 | 66 → **64**（§14i、§14j 紅） |
| fan-only 偷發現金 | 66 → **64**（§14b、§14l 紅） |

### 修正的一個我方誤判

`14d` 第一版用 `/gameMode === "cs"/` 比對原始碼，紅了——因為 `codeOnly()`
會把字串字面值清空，`gameMode === "cs"` 變成 `gameMode === ""`。
改成比對三元判斷式的**結構**（`? FAN_AWARD_POLICY : null`）。

### Schema 與相容性

- **沒有 schema version bump。** `SeasonState.v2` / `Event` 只多一個可選欄位，
  預設 `null`，驗證器不拒絕未知欄位。
- **舊存檔**：沒有 `fanPolicy` ⇒ `fanPolicyRef: null` ⇒ 行為與 F2.1 之前**逐值相同**。
- **不自動補**：`fanPolicyRef` 沒有任何 inference 分支，不會從收據反推。
- **M1 migration 未動**：獎金那條 legacy inference 分支一個字都沒改（`cs_schema_v11` 41/41）。

### 沒有做

未改 fan 數值、`reqFans`、`economyConfig`、三支凍結契約、battle / map contract。
未新增第三條 fan write path、未新增第二本帳本、未建第二套 CS award path。
**未開始 F4。**

---

## Fan System F4 — UI / Player Feedback Integration（2026-08-23）

branch `feature/fan-f4-ui`，基準 `origin/main @ c9beb10`。**未 push。**
**只做呈現，零 balance 改動。**

### UI Audit（改動前的現況）

| 位置 | 原本顯示 | 資料來源 | 真實？ | F4 處置 |
|---|---|---|---|---|
| Home hero | `12.8萬 支持者` | `meta.fans` | ✅ | **保留**＋加本季成長 |
| Home 手機頁首 | `12.8萬 支持者` | `meta.fans` | ✅ | 保留（只加 testid） |
| Home mode card | `👁 2,041`／`訓練`／`賽季` | **寫死** | ❌ | **移除** |
| SponsorScreen 頁首 | `目前粉絲 128,000` | `meta.fans` | ✅ | 保留、加粗數字 |
| SponsorScreen 卡片 | `需 185,000 粉絲 / 15勝` | `sponsorEligibility` | ✅ | **拆成粉絲／勝場兩條，寫出還差多少** |
| SponsorScreen 現役卡 | `特殊加成：訓練效果 +15%` | `SPONSORS[].perk` | ❌ **無實作** | **移除**，換成合約狀態 |
| SponsorScreen 詳情 | `特殊加成 <perk>` | 同上 | ❌ | **換成粉絲／勝場門檻** |
| RewardReceiptPanel | `粉絲 +N` | 結算收據 | ✅ | 保留（F0 已做） |
| MobaFlowScreens | `粉絲 +fanGain` | 結算值 | ✅ | 保留（F0 已做） |
| TeamScreen | `粉絲 128,000` | `meta.fans` | ✅ | 保留 |
| Season Recap | **沒有粉絲資訊** | — | — | **新增本季成長** |
| RecapPrize | 只有獎金 | 收據 | ✅ | **加賽季粉絲獎勵（讀收據）** |
| `platform/DashboardScreen.jsx` | `粉絲 128k` | `meta.fans` | ✅ | **未路由**（AppShell 用 `screens/`），不動 |

### 做了什麼

**新增 `platform/fans/fanPresentation.js`（純函式 read-model）**

`formatFans()`／`seasonFanGrowth()`／`sponsorRequirementView()`。
**不算任何粉絲數值**，只做相減與格式化；資格判定仍完全交給 `sponsorEligibility()`。

**Home**
- hero 的支持者旁加「本季 +N」（只在拿得到基準時）
- **移除三張 mode card 的假 `audience`**——**刻意不改接 `meta.fans`**（Fans ≠ 觀眾）
- 手機頁首**只顯示總數**：那是三欄緊湊列，塞第四個數字會擠壞

**Sponsor**
- 卡片拆成粉絲／勝場兩條，各自標「✓ 達標」或「還差 N」，並標 `data-blocked-by`
- **移除所有假 perk 文案**（現役卡換成合約狀態，詳情換成門檻資訊）

**Season Recap（新元件 `RecapFans.jsx`）**
- 有快照 ⇒ 起點／目前／本季成長
- `null` ⇒ **只顯示總數** ＋「本季成長統計將從下一賽季開始」
- MOBA 與 CS 各用**自己的** `competitionView(mode).fansAtSeasonStart`
- `RecapPrize` 加「賽季支持者獎勵」，**讀收據的 `fans`**，不查 `seasonFanAward` 表

### 抓到並修好的一個真 bug

`seasonFanGrowth()` 第一版用 `Number.isFinite(Number(v))` 判斷基準，
而 **`Number(null) === 0`** ⇒ 舊存檔會被當成「起點 0」，賽季總結顯示假的
**「本季 +143,000」**。這正是 F0 `sanitizeFans()` 踩過的同一個坑。
已改成在 `Number()` **之前**擋掉 `null` / `undefined` / 布林 / 空字串。
`check_fan_ui_f4` §12 就是為這條而寫。

### 更新了兩條既有斷言的量測方式（原意保留）

| gate | 原本 | 改成 | 為什麼 |
|---|---|---|---|
| `check_fan_system` §13e | 掃到 `fansAtSeasonStart` 就算違規 | 只抓**賦值** | F4 起畫面**合法地讀**它；標籤講的是「不**修改**快照」 |
| `browser_check_fan_f1` ×3 | 比對卡片文案 | 改讀 `data-fans-ok` / `data-wins-ok` | F4 改了文案；測試不該綁在任何一版措辭上 |

`browser_check_fan_f1` 一度 17→11，改用 data 屬性後回到 **17/17**，
而且從此不會再因為文案調整而假紅。

### 驗證（全部實跑）

| 項目 | 結果 |
|---|---|
| `check_fan_ui_f4`（新增） | **35/35** |
| `browser_check_fan_ui_f4`（新增，1280＋390） | **29/29** |
| `check_fan_system` | 66/66 |
| `check_fan_f0` | 33/33 |
| `browser_check_fan_f1` | 17/17 |
| `home_team_contract` / `competition_shared_ui` | PASS ／ 28/28 |
| `result_flow_o71` / `growth_ui_p1` | 27/27 ／ 80/80 |
| `progress25` / `finance_n3` / `talent27` | 33 ／ 40 ／ 37 |
| `competition_q1/q3/q4/q5/q6` | 93/91/68/69/57 |
| `cs_season_contract` / `cs_season_lifecycle` / `cs_major` | PASS ／ 54/54 ／ 74/74 |
| `regress` / `regress2` | 15/15 ／ 8/8 |
| `npm run build` | ✓ built in 10.12s |

**Mutation sentinel（四個都有鑑別力）**

| 注入 | 結果 |
|---|---|
| Sponsor UI 自己算 eligibility | 35 → 34 |
| fake audience 接回 Home | 35 → 33 |
| old-save null 顯示 +0 | 35 → 34 |
| perk text 接回 SponsorScreen | 35 → 34 |

### Browser smoke 的一個取捨（誠實揭露）

原本想在 smoke 裡真的把一季打完再看 Recap，但 `advanceDay()` 會停在
玩家自己的比賽日（`stoppedBy`）——那是先前證實過的兔子洞。
改成**用 app 自己的 React 把 `RecapFans` 掛到獨立 root**，用真實 props 驗真實 DOM，
另外用 Store 直接驗「讀 view 五次不回填快照」。
⇒ 「畫面長怎樣」與「會不會偷改存檔」都有證據，但**沒有**打過一整季的端到端證明。

### 產品用語 review

- Home / 戰隊詳情：**支持者**；Result：**粉絲**；Sponsor：**目前粉絲／還差 N**
- 「聲望」已完全從玩家可見文字消失（`reputation` schema 欄位保留）
- Home 沒有新增卡片；粉絲資訊是既有元素上的小字

### 沒有做

未動 `fanGain` / `fanSourceWeight` / `seasonFanAward` / `reqFans` / `economyConfig`
（`git diff` 五份全部零改動，verifier §19/20 守著）。
未動 `SeasonState` / `seasonStateV2` / `seasonSealingV2` / `awardPolicy`。
未建 Fan Center。未刪 `SPONSORS[].perk` schema。
**未開始 F3 / Fan v1.1。**


## 移除選手受傷系統（2026-08-25）

分支 `feature/remove-player-injury`，基底 `origin/main` **a886e39**（Fan F4 closure）。
獨立 worktree `D:\OneDrive\文件\GitHub\ESMO-injury`，未 merge、未 push。

> ⚠ **開工時的 audit 意外**：主 worktree 當時在 `milestone-n-finance`，該分支
> **落後 origin/main 258 個 commit**（只領先 2 個），而且工作區有別人未提交的
> `matchmaking` / `profileStore` WIP。本輪需要的 Fan F0/F2/F4、CS Season、
> SeasonState v2 全都只在 main 上。**因此基底選 `origin/main` 而不是當前 HEAD**，
> 並另開 worktree，完全不碰那份 WIP。

### 產品決策

**ESMO 不採用選手隨機受傷／傷停機制。** Milestone O2 的整套受傷 gameplay 移除。
**年齡與選手生命週期完整保留**——這不是「順手一起刪」的一輪。

### Audit：原本的 injury 責任鏈（先查再動，沒有只刪畫面）

```
賽後結算 applyMatchProgress
   → applyMatchWear()  ← 決定性抽籤產生 injured / injuryDays（唯一產生點）
   → profileStore.players[].injuryDays（唯一保存點）
   → advanceDay → applyDailyRecovery()  ← 每日 −1（唯一倒數點）
   → matchFitness() code:"injured"      ← 唯一阻擋點
        ├→ matchSquad.validateSquad()   （陣容驗證 / 出賽申請 / 排隊重驗都走這裡）
        └→ matchSquad.autoFillSquad()   （auto lineup 用同一個 isMatchFit）
   → UI：Dashboard 待辦卡／Roster 徽章與詳情／statusPresentationOf()／StatusPanel
```

**關鍵發現**：`matchFitness` 是不可出賽判定的唯一來源，`validateSquad` 與
`autoFillSquad` 都引用它。因此拿掉 `injured` 分支之後，**陣容驗證、出賽申請、
排隊重驗、auto lineup 四條路徑同時停止因傷阻擋，`matchSquad.js` 一行邏輯都不用改**。
這正是 O2 當初「規則只有一份」設計的回報。

### 改了什麼

| 檔案 | 改動 |
|---|---|
| `platform/condition/playerCondition.js` | 移除 `CONDITION.injury`、`deterministicRoll`、`injuryDaysOf`、`isInjured`；`applyMatchWear` 回傳縮成 `{player, drained}`；`matchFitness` 只剩 `exhausted`；`applyDailyRecovery` 不再倒數；`conditionSummary` 不再帶傷病欄位 |
| `platform/progress/applyMatchProgress.js` | 收據 `condition` 不再帶 `injured` / `injuryDays` |
| `platform/contracts/matchSquad.js` / `matchEntry.js` / `matchmaking/mockGateway.js` / `profileStore.js` | **只有註解**（邏輯自動跟著 helper 走） |
| `screens/DashboardScreen.jsx` | 待辦卡只剩體力訊號；不再 import `isInjured` |
| `screens/manage/RosterScreen.jsx` | 移除「傷停 N 天」徽章與詳情列；說明文字改成「連續出賽會加重體力消耗」 |
| `ui/playerProfileFoundation.js` | `statusPresentationOf` 移除 `injured` 分支；`unavailable` 的 detail 改成「體力不足，需要休息」 |
| `ui/PlayerProfileFoundation.jsx` | `status.injured` → `!status.canPlay` |

`src/screens` + `src/ui` + `src/platform` 三區的 injury 識別字與玩家可見傷病字面
**現在是 0**（註解裡的「為什麼不做」是刻意保留的，見下）。

### 新 verifier

`tools/check_no_player_injury.mjs` — **29/29**，含 4 個 mutation sentinel（MOBA / CS 名單各驗一套）：

- **S-A** 重新把 `injuryDays > 0` 當成不可出賽 ⇒ 紅
- **S-B** 重新加入 injury roll ⇒ 紅
- **S-C** 把 Training age factor 拿掉 ⇒ 紅
- **S-D** UI 重新顯示「傷停」 ⇒ 紅

A/B/C 的做法是**把變異後的原始碼寫成臨時模組再 import**，拿同一個判準函式去測變異版
（而不是另寫一套斷言）⇒ sentinel 與正式檢查不可能各自漂移。

`tools/browser_check_no_injury_ui.mjs` — **46/46**（Desktop 1366 / Mobile 390）。

**掃描器刻意忽略註解**（用 `@babel/parser` 把註解塗白再掃）。理由寫在檔內：
要擋的是「還在用的識別字」與「會被渲染的字面」，把註解一起擋掉只會逼人刪掉
「為什麼不做受傷」的說明——那正好是最該留給下一個人的東西。S-D 因此注入的是
**會被渲染的字串**，不是註解。

### 既有 verifier 的處置（只改真正的舊產品契約）

| gate | 處置 | 結果 |
|---|---|---|
| `check_condition_o2` | 受傷機率／傷勢倒數／傷停閘門三組斷言改成**反向斷言**（舊存檔資料不擋出賽、不倒數）；疲勞側一條都沒放寬 | 30/30 → **29/29** |
| `check_match_entry_o3` | 「傷停中」阻擋案例移除，`hurt1` fixture 改名 `legacyhurt1` 並保留（反向驗證）；6e 情境改用體力，加 6e2 反向斷言 | **35/35** |
| `check_matchmaking_o4` | 排隊中「受傷」改「體力過低」，加 6a 反向斷言 | 47/47 → **48/48** |
| `check_r62_player_ui_fixture` | `STATUS_INJURY_MAPPING` → `STATUS_UNAVAILABLE_MAPPING` + `STATUS_LEGACY_INJURY_IGNORED` | **PASS** |
| `browser_check_home_ia` | `MAKE_INJURED` → `MAKE_EXHAUSTED`（該選手仍帶舊 `injuryDays`），加一條「不出現傷停字樣」 | 21/21 → **23/23** |
| `check_fixture_result_browser` / `browser_check_fixture_integrity` | `healRoster` 腳手架不再清 `injuryDays`，改用 `isMatchFit` 計數 | **24/24** / **26/26** |

⚠ 這些**都是 A 類**（已取消的產品契約）。疲勞 / roster 契約一條都沒動，
而且每一處都補上了反向斷言 ⇒ 鑑別力不減反增。

### 舊存檔

`migratePlayer` 以 `{...p}` 展開，不認得也不刪除未知欄位 ⇒ 舊存檔的
`injuryDays` / `injured` / `injuryUntil` / `injuryRisk` **原樣保留、完全不讀**。
**沒有做 migration，也刻意不做**（登記為 TD-29，留給未來一次正式的 schema cleanup）。

deterministic fixture（node 與瀏覽器各驗一次）：`age 27 / energy 66 / injuryDays 6 /
injured true` → 載入後 age 仍 27、體力仍 66、**可出賽**、不顯示傷停、不倒數、
save/reload 不 crash。

### 驗證（全部實跑，輸出見上）

- `check_no_player_injury` **29/29**、`browser_check_no_injury_ui` **46/46**
- `verify.mjs --only=progress25,talent27,growth_p0,growth_ui_p1,regress,regress2,build`
  → **7/7 PASS**（與改動前 baseline 相同）
- 23 支 node gate 中 **21 PASS**；2 支紅的（`check_team_development_recovery`、
  `check_acceptance_fix_p1` §6b）**改動前就是同樣的紅、同樣的訊息**，與受傷無關
- `npm run build` ✅

### 沒有做

未開始 Season vNext。未實作退休、年齡增長、巔峰／衰退、新人生成、AI 換血、off-season。
未重新設計 fatigue。未動 Fan balance / Sponsor / `economyConfig` / Competition award policy /
`SeasonState v2` / Training v1.1 成長公式 / age formula。未物理刪除任何 schema 欄位。
未 push、未 deploy。


## DEV Quick Recovery（2026-08-25，延伸 `feature/remove-player-injury`）

同一條分支收尾，不另開 Sprint。**未 merge、未 push。**

> **DEV Quick Recovery 是開發測試便利功能，不是正式遊戲設計。**
> 正式商業上線前必須關閉或移除（release checklist 見 `08_目前待辦與風險.md`）。

### Audit：既有的 day progression / recovery / dev diagnostics

| 面向 | 既有實作 |
|---|---|
| 唯一時鐘 | `profileStore.advanceDay(n)`：先問 `_advanceCompetition`（賽季日曆能推幾天），再 `advanceDaysInState`（每日恢復＋跨週結算）。`advanceTrainingDay()` = `advanceDay(1)` 薄包裝 |
| 生產 UI 唯一入口 | `TrainingScreen` 的「⏭️ 推進訓練日」，且 `advance()` 要求 `training.length > 0` |
| 每日恢復 | `applyDailyRecovery()` 沒排訓練者 +`restPerDay`(8)；休息課完成 +30 |
| 不可出賽門檻 | `CONDITION.unfitBelow` = 15 |
| DEV 基礎設施 | `ui/debugMode.js → isDebugMode()` ＋ `featureFlags.js → featureEnabled()` 的**兩層閘門慣例**；既有先例 `devFastForward`（GameView）與 `test-funds-panel`（FinanceScreen） |

⇒ 本輪**沿用兩層閘門慣例**，不發明第三種 dev gate。

### 正式玩法 soft-lock audit：**沒有 soft-lock**（實跑證明）

用真的 Store 跑最壞情境（全隊體力 0、資金 0、沒人在訓練）：

1. 「休息調整」`energyCost: 0`、1 天，**UI 與 Store 都明確豁免體力檢查**
   （`c.id !== "rest" && ...`）⇒ 0 體力照樣指派得動，免費。
2. 推進日期不收費、不被資金擋（實測 funds 0 仍可推進）。
3. 第 1 天：休息者 0 → **30**（可出賽）；其餘每日自然恢復 0 → 8。
4. 第 2 天：其餘 8 → **16** > 門檻 15 ⇒ **全隊可出賽**。
5. 被比賽日擋住時 `CompetitionScreen` 有正式棄權按鈕（二次確認，只記敗場）。

⇒ **玩家 2 天就能免費脫困，DEV 工具沒有在掩蓋任何死局。**
由 `check_dev_quick_recovery` §6 每次重跑，不靠文字宣稱。

### 做了什麼

| 檔案 | 改動 |
|---|---|
| `src/debug/DevQuickRecovery/logic.js` | **新增**。純規則：兩層閘門 `devQuickRecoveryEnabled()`、恢復目標 `energyToMatchFit()`。拆成 .js（不是 .jsx）**是為了讓 verifier 能直接 import 實跑**——JSX 在 Node 裡 import 不了，閘門若寫在 .jsx 就只能字串比對，那擋不住「行為改了但字面沒改」 |
| `src/debug/DevQuickRecovery/index.jsx` | **新增**。面板本體：推進 1／3 天、全隊恢復至可出賽 |
| `src/featureFlags.js` | **新增旗標** `devQuickRecovery`（＋移除步驟寫在註解裡） |
| `src/screens/manage/TrainingScreen.jsx` | **1 個 import ＋ 1 行 JSX**，沒有其他改動 |

三個原則寫死在檔頭並由 gate 守住：
① 不另寫第二套日期／恢復邏輯 ② 不寫死體力數字 ③ 不放寬正式玩法。

**推進**走既有 `advanceDay()`；賽程未收尾一樣被擋，**照實顯示原因不強推**
（DEV 工具是快轉鍵，不是規則豁免權）。
**恢復目標**從現值起反覆疊加 `CONDITION.restPerDay`，以 `isMatchFit()` 判定何時停 ⇒
0 體力的目標是 **16**（剛好跨過門檻 15），**不是一鍵滿血**。門檻日後調整會自動跟著調整。

### 驗證

- `tools/check_dev_quick_recovery.mjs` **29/29**，含 4 個 mutation sentinel：
  **S-A** 拿掉 `isDebugMode()` 那層 ⇒ 紅｜**S-B** 恢復目標寫死 ⇒ 紅｜
  **S-C** 面板自己算日期 ⇒ 紅｜**S-D** 改掉 Training 年齡係數 ⇒ 紅
- `tools/browser_check_dev_quick_recovery.mjs` **32/32**，跑**兩種 server**：
  - **Part A** `vite preview`（build 產物，`import.meta.env.DEV = false`）⇒
    正式／預設模式**面板與所有 DEV 字樣完全不存在**
  - **Part B** `vite dev` ⇒ Desktop 1366 ＋ Mobile 390 各驗一輪：
    恢復後 5/5 可出賽（體力 16）、推進 1 天 +1、推進 3 天 +3、
    體力照既有 +8/天回復、Match Prep 五席填滿、無橫向捲動、console error 0

### 一個查出來的既有機制（不是本輪造成，也沒有動它）

`autoFillSquad` 會先跑 `normalizeLineup` 的 **identity 回填**：種子選手的 id 剛好
叫 `b1`–`b5`，與 MOBA 席位同名 ⇒ 即使全員 exhausted 也會被原樣回填進席位，
**不經過 `isMatchFit` 候選池**。但 `validateSquad` 仍逐席回報 `exhausted`，
所以**打不開比賽**，產品行為是對的。gate 因此分兩條驗：閘門一條、候選池一條
（候選池那條刻意用不與席位同名的 id，否則測不到）。

### 沒有做

未實作「低體力硬上但能力下降」（未來正式玩法可考慮，本輪明確不做）。
未改 recovery balance、condition threshold、Training v1.1、age、Fan、economy、SeasonState。
未清舊存檔 `injuryDays`；injury removal 既有行為完全不變。
未開始 Season vNext。未 push、未 deploy。


## 上線紀錄：Injury Removal ＋ DEV Quick Recovery（2026-08-25）

### 整合方式

**Fast-forward，沒有 merge、沒有 squash。** `origin/main` 從 push 前到 push 後都沒有被
其他人推進（`git ls-remote` 伺服器真值兩次都是 `a886e39`），`merge-base` 就等於
`origin/main`，`HEAD..origin/main` 為 0 ⇒ 純 fast-forward：

```
a886e39..b80e13c  HEAD -> main
  1631418  Retire player injury as a gameplay state, and keep age intact
  3a6d4e9  Cover the CS roster path in the injury gate, not just MOBA
  10302ba  Correct the injury gate count in the docs after adding CS coverage
  b80e13c  Add a DEV-only quick recovery panel, and prove the real game never needs it
```

### Push 前的「零改動」硬證

不只跑 gate，另外用 `git diff --name-only origin/main..HEAD -- <path>` 逐區確認**檔案數為 0**：
`platform/economy`、`platform/competition`、`platform/fans`、`data/playerModel.js`、
`data/trainingCalculator.js`、`data/players.js`、`SponsorScreen`、`CompetitionScreen`、
`rewardFormulas`、`levelGrowth`、`hero/` —— **全部零改動**。
本輪真正碰到的 `src/` 檔只有 14 個，全在 injury removal ＋ DEV 工具的範圍內。

### Deploy

GitHub Actions run **#162 → success**（`https://github.com/RayHuang0323/ESMO-/actions/runs/32770751063`）。

⚠ 依既有教訓（「紅的 deploy job 不等於站上是舊的」），**不論 job 顏色一律驗 bundle**：

| 項目 | 部署前 | 部署後 |
|---|---|---|
| entry bundle | `assets/index-B20kZ-y6.js` | **`assets/index-Dmu1wOFE.js`** |
| 「傷停」出現次數 | 3 | **0** |
| 「受傷」出現次數 | — | 4（**全部是英雄技能描述的戰鬥掉血**，逐條看過，不在範圍內） |
| index.html / entry / 5 個 lazy chunk | — | 全部 HTTP 200 |

### 正式站 smoke：`tools/browser_check_prod_injury_dev.mjs` **52/52**

打的是 build 產物 ⇒ 全程只能走 UI 與 localStorage（不能 import Store）；
用獨立 Chrome profile，**沒有碰到既有的正式站存檔**。

- **Phase 1（正式／預設造訪，無參數）**，Desktop 1366 ＋ Mobile 390：
  Home 無傷停 UI／Roster 舊 injury player（injuryDays 6）顯示「可出賽」／
  低體力 player 仍「不可出賽」／Profile 年齡 27 歲＋可出賽＋體力 66／
  Training v1.1 課程格與預估成長正常／Match Prep injury 不再擋出賽（5 席填滿）／
  **DEV Quick Recovery 完全不可見**／無橫向捲動
- **Phase 2（`?debug=1`）**：DEV 工具可用／推進 1 天 9→10／推進 3 天 10→13／
  「恢復至可出賽」0,0,0,0,0 → **16,16,16,16,16**（>= authoritative 門檻 15，且沒有滿血）
- console page error = 0、uncaught error = 0

### 過程中查到的既有瑕疵（記錄，未修）

正式站 smoke 第一次跑 47/52，五個紅燈同一個根因，而且是**測試腳本的佈置汙染**：
佈置階段用 `?debug=1` 觸發存檔，之後用 `?debug=0` 想關掉，但**旗標沒有被清掉**。

根因是 `ui/debugMode.js` 的既有行為：清除 `esmo_debug` 是 **render 時的副作用**，
只有真的呼叫 `isDebugMode()` 的元件才會執行；**首頁沒有任何元件會呼叫它**
⇒ 首頁的 `?debug=0` 形同無效。已登記為 **TD-31**。

⚠ 對上線的實際意義：**關閉 dev 工具不可以依賴 `?debug=0`**，要改 `featureFlags` 的旗標。
Release checklist 寫的就是旗標，不是網址參數。

腳本已改成直接把旗標從 localStorage 拿掉來模擬「從未開過 debug 的瀏覽器」——
那才是「正式／預設造訪」真正的定義。改完 **52/52**。

### 結案狀態

- **Player Injury Removal = CLOSED**
- **DEV Quick Recovery = CLOSED / DEVELOPMENT-ONLY**（TD-30 清理債務保留）
- **Season vNext Design = READY**（可以開始**設計**，本輪不實作）

未開始：Season vNext 實作、「低體力硬上但能力下降」、fatigue 重新設計。


## Season vNext Design Sprint（2026-08-25）— 設計已裁決

分支 `feature/remove-player-injury`。**docs-only，`src/` 零改動，未開始 implementation。**
完整設計：`docs/design/Season_vNext_長期生涯與競賽框架.md`（16 節）
量測腳本：`tools/season_vnext_calibration.mjs`（設計工具，非 verifier、不進 CI）

### 這一輪最重要的事：題目被模擬改掉了

原本的題目是「加上年齡與世代交替」。用主幹真正在跑的函式（`calculateTrainingResult`、
`applyLevelGrowth`、`dayForRound`、XP 曲線、`genProspects`）實跑量測之後，
**那樣做會失敗**：

1. **新秀沒有成長空間**——`genProspects` 的新秀入行時主能力已達潛力的 **87.6%（中位）**，
   成長空間 min 1.6 / **中位 8.4** / max 34.2 點。一半的新秀一輩子只能長 8 點以內。
2. **成長是漸近線**——12 個 Career Year 後典型新人只關閉 **64.6%** 潛力空間，
   高潛天才更只有 **50.3%**。玩家會看到「潛力 92，一輩子停在 70」。
3. **正式賽事只貢獻 10.6% 的成長**（訓練 89.4%）⇒
   「League/Tournament = 正式生涯成果」在數字上是假的。

⇒ **「19–21 歲新人幾年變成熟主力」的答案是：現行模型下永遠不會。**
⇒ **Season vNext 的第一優先不是 aging，是 Growth Model 重建。**

已登記為 **TD-32**（新秀空間）、**TD-33**（漸近線）、**TD-34**（凍齡洞：世界時間只靠訓練推進，
打比賽完全不推進日曆——**現在就已經存在的 exploit**）。

### Grilling：17 條（brief 的 14 條 + 模擬翻出的 3 條）

三條翻轉了原本的判斷：

- **G1**：擔心的是 Practice 無限刷，但 **Practice 現在根本沒有永久成長路徑，那個 exploit 不存在**。
  真正的洞是**無限訓練**——不需要任何比賽，貢獻 89% 的成長。防刷範圍要比原設想大。
- **G2**：「不打 Season 凍齡」**現況 100% 成立**，不是未來風險。
- **G4**：Live Event 消耗 Career Time 等於**懲罰參與**（真人 Event 是 real-time 排定的，
  玩家控制不了頻率）。⇒ **已裁決採納**：Career Calendar 預留 **Event Window**，
  窗口內不額外消耗 Career Time。

### 裁決（FINAL）

| 項目 | 裁決 |
|---|---|
| **Q2 Multi-Title Club** | **Opt-in / Later。** 玩家不被迫同時經營 MOBA + CS；第二分部**必須同時帶成本與收益**，不得成為「不開就吃虧」的 mandatory bonus |
| **Q3 Online** | **Contract only。** 不做 server / real matchmaking，**也不做本地 fake Ranked**；但 Career / Growth contract **必須允許未來 AI 與真人 Match 共用**（成長路徑**不得知道對手是誰**） |
| **Career Year** | **12 週 / 84 天 = MVP baseline，不是永久 balance freeze** |
| **Live Event** | 不因玩家參與而額外懲罰 Career Time；Career Calendar 預留 Event Window |

### Implementation Roadmap（已裁決）

**Foundation**：**V0A** Player Career Growth Model ＋ **V0B** Prospect Growth Space

🔒 **Foundation Gate**：兩者**不得各自宣告完成**，要跑**共同 calibration**。
理由：成長速度是「公式 × 成長空間」的乘積——只修公式會讓 8.4 點的空間更快被關閉、
只修空間會讓漸近線的尾巴更長，**分開驗收兩邊都會得到錯誤結論**。

**成長產品驗收目標**（19–21 歲、正常高潛力新人）：
Year 1 明顯進步可進輪換｜Year 2 左右有機會成為穩定主力｜Year 3–4 好選手接近成熟／巔峰。
**不鎖公式數值**；**年度來源比例 target** Training 40 / Formal 35 / Ranked 15 / Practice 10
是**年度佔比，不是公式常數**。

**Foundation 之後**：V1 Career Clock → V2 Time Block → V3 大顆時間操作 →
V4 Lifecycle → V5 Off-season → V6 AI turnover → V7 Online Event contract

### 沒有做

未修改任何 `src/` 產品碼。未開始任何 implementation。
未鎖定任何 balance 常數（全部留給 Foundation calibration）。
未實作 Ranked（含本地假對手）、Live Event 本體、Multi-Title 第二分部、
Club DNA、Personality 影響戰術執行、Coach / Staff / Legacy。


## Season vNext V0A — Player Career Growth Model（2026-08-25）

分支 `feature/remove-player-injury`。**未 push。**
Plan：`docs/superpowers/plans/2026-08-25-v0a-player-career-growth-model.md`

> ⚠ **FOUNDATION_COMPLETE = NO。** V0A 只是 Foundation 的一半，
> **V0B Prospect Growth Space 尚未執行**，兩者要跑共同 calibration 才算 Foundation 完成。

### 解決的結構性不一致

主幹有**兩條**永久成長路徑，但只有一條認年齡：

| 路徑 | age？ |
|---|---|
| Training v1.1 `calculateTrainingResult` | ✅ |
| 比賽升級 `applyLevelGrowth` | ❌ **完全沒有** |

⇒ 34 歲老將靠打比賽的成長，與 18 歲新人**一模一樣**。V0A 把兩條接到同一組係數上。

### 做法：re-export，不是搬家

`platform/progress/careerGrowth.js` 是 PCGM 的**單一入口**，
**原樣 re-export** `trainingCalculator.js` 的三個 efficiency 函式（**同一個 function reference**）。

**為什麼不搬過來**：把曲線搬進 PCGM 會讓 `trainingCalculator.js` 出現 diff，
於是「Training v1.1 有沒有回歸」變成要靠比對才能回答的問題。
改成 re-export ⇒ **`trainingCalculator.js` 零 diff，無回歸由「檔案沒被改」直接成立**。

gate §G 用兩條把它釘死：
① **reference identity**（`careerGrowth.ageFactor === trainingCalculator.ageEfficiency`）
② **單向依賴**（`trainingCalculator` 不得 import `careerGrowth`）

### 修改的 authoritative path

| 檔案 | 改動 |
|---|---|
| `platform/progress/careerGrowth.js` | **新增**。PCGM 單一入口：`GROWTH_SOURCES`、`PCGM_PARAMS`、`careerGrowthFactor()` |
| `platform/progress/levelGrowth.js` | `applyLevelGrowth(player, levels, { source })` — **第三參數選配**，係數乘在 `perStatCap` clamp **之前** |
| `platform/progress/applyMatchProgress.js` | 明示 `source: GROWTH_SOURCES.formal` |

`data/trainingCalculator.js` **零 diff**（gate §F2 用 `git diff origin/main` 驗）。

### 🔴 V0A 實作時發現的前置條件（TD-35）

`MatchProgressTransaction` **不帶 `MatchOrigin`** ⇒ 結算層**分不出聯賽與自由對戰**。

⇒ 設計文件 §5.1 的「Formal base 高於 Training」**做不到**：
現在調高 `formal` 等於**自由對戰一起調高**，直接製造「刷自由對戰＝刷正式賽成長」的 exploit
（正是 §11-G1 要擋的東西）。

**因此 V0A 的 `sourceBase` 四個來源一律 1.0——刻意的，不是還沒填。**
差異化 base 的前置條件是把 `MatchOrigin` 接進結算契約，屬**契約變更、獨立一輪**。

### Calibration

**只看公式本身**（與新秀池無關）

| age | 年齡係數 | learning | 學習係數 | 合成 |
|---|---|---|---|---|
| 18 | 1.08 | 90 | 1.07 | **1.156** |
| 24 | 1.04 | 70 | 1.00 | 1.040 |
| 28 | 1.00 | 60 | 0.965 | 0.965 |
| 36 | 0.88 | 40 | 0.90 | **0.792** |

年齡相對差距 **1.23×**（18 vs 36）｜learning 相對差距 **1.19×**（90 vs 40）｜
最好與最差合計 **1.46×**

**用真實 prospect pool 跑一個 Career Year（12 週）**

| 選手 | 成長空間 | 年成長 | 其中訓練 | 其中比賽 |
|---|---|---|---|---|
| 典型新人 19–21歲 | 25 點 | 50.8 | 44.2 | 6.6 |
| 高潛天才 ≤21歲 | 34.2 點 | 61.9 | 53.5 | 8.4 |
| 即戰力 21+歲 低潛 | 8 點 | 20.4 | 18.7 | 1.7 |
| 超新星 ≤17歲 | 16 點 | 40.0 | 35.1 | 4.9 |

### 哪些失真是 V0A 的問題、哪些必須等 V0B

| 現象 | 歸屬 |
|---|---|
| 比賽成長不認年齡 | ✅ **V0A 已解決** |
| 比賽成長不認 learning | ✅ **V0A 已解決** |
| 新秀成長空間中位只有 8.4 點 | ⏳ **Expected pending V0B**（TD-32） |
| 潛力是漸近線，永遠到不了 | ⏳ **Foundation calibration**（TD-33，`floorRate` 會改 Training 輸出值） |
| 比賽只貢獻 ~13% 成長 | ⏳ **等 TD-35**（MatchOrigin 未接進契約，不能差異化 sourceBase） |

⚠ **沒有為了讓 gate 變綠而扭曲 V0A 公式。** 上面三個「未解決」是照實標記的。

### Gate

- **新增 `tools/check_pcgm_v0a.mjs` — 24/24**，含 3 個 mutation sentinel：
  S-A 拿掉 PCGM 乘法 ⇒ §A/§C 紅｜S-B 動到共用曲線 ⇒ §F Training golden 紅｜
  S-C 把 re-export 換成包一層 ⇒ §G1 紅
- 既有回歸：`growth_loop_p0` 25/25、`growth_ui_p1` 80/80、`progress25` 34/34、
  `talent27`、`condition_o2` 29/29、`no_player_injury` 29/29、`dev_quick_recovery` 29/29、
  `squad_o1` 40/40、`match_entry_o3` 35/35、`matchmaking_o4` 48/48、`fan_system` 66/66、
  `fan_ui_f4` 35/35、`cs_season_lifecycle` 54/54、`competition_q4` 68/68、`competition_q6` 57/57、
  `finance_n3` 40/40、`cs23` 28/28、`r62_player_ui_fixture` — **全綠**
- `verify.mjs --only=progress25,talent27,growth_p0,growth_ui_p1,regress,regress2,build` — **7/7**

### 沒有做

未做 V0B（`recruitPool` 零改動）、Career Clock、age +1、lifecycle、decline、retirement。
未建 fake Ranked / server / 新 UI。未新增玩家可見的 Practice 永久成長。
未鎖任何 balance 常數（`PCGM_PARAMS` 全部標為 provisional）。未 push、未 deploy。


## Season vNext V0B — Prospect Growth Space（2026-08-25）

分支 `feature/remove-player-injury`。**未 push。**

> ⚠ **FOUNDATION_COMPLETE = NO。** Foundation 已改為
> **V0A ✅ → V0B ✅ → V0C（Match Origin / Growth Source Attribution）→ Foundation Calibration Gate**。

### 根因（先查清楚才改，沒有先改數字）

「新秀入行時主能力已達潛力 87.6%、空間中位只有 8.4 點」的原因**不是潛力設太低**，
而是**生成時被兩個東西夾死**：

```js
// genCsProfiledStat（改動前）
const baseline = 40 + current * 0.58;          // ← +40 的地板
const generationCap = Math.max(1, potential - 2);  // ← 天花板
```

`potential` 的範圍是 **42–96**，而 baseline 有 **+40 的地板**
⇒ 潛力 42–70 的新秀 baseline 直接衝破天花板，**出生就被釘在 `potential − 2`**。

實測（40 人 × 6 seed）：

| 潛力分層 | 人數 | 主能力被釘住 | 平均剩餘空間 |
|---|---|---|---|
| 42–55 | 9 | **73%** | 3.9 點 |
| 56–70 | 16 | 54% | 7.4 點 |
| 71–85 | 10 | 14% | 17.6 點 |
| 86–96 | 5 | **0%** | 20.5 點 |

⇒ 整體主能力 **41.5% 被釘住**，30/40 名新秀至少有一項貼住天花板。
那個 `+40` 是 R46 為了讓 CS gameplay 素質落在可玩區間設的地板，
與「potential 最低只有 42」直接衝突。

### 修法：成長空間變成**直接生成的量**

```
archetype → core（起始能力）+ room（成長空間）
potential = min(96, core + room)
```

空間不再是「潛力 − 起始」的**殘值**，因此**不可能再被 clamp 擠掉**。

| 原型 | 權重 | 年齡 | 起始 core | 空間 room |
|---|---|---|---|---|
| 養成型 developmental | 30% | 16–19 | 34–50 | 22–38 |
| 一般 standard | 40% | 17–21 | 42–58 | 12–24 |
| 即戰力 readymade | 25% | 20–23 | 52–68 | 7–15 |
| 超新星 superstar | 5% | 16–18 | 54–64 | 26–36 |

另外新增 `spreadScale = clamp(room/24, 0.3, 1)`：**空間小的人能力集中（像成品）、
空間大的人參差（像半成品）**。這同時解決一個技術問題——若振幅不隨 room 縮小，
小 room 的新秀又會被 `generationCap` 夾住。

### 結果

| 指標 | 改動前 | 改動後 |
|---|---|---|
| 成長空間中位（metric C） | 8.4 點 | **15.8 點** |
| 主能力釘住率 | 41.5% | **0.4%** |
| 潛力範圍／中位 | 42–96 / ~69 | 54–96 / **71** |
| 超新星比例 | — | **3.8%**（稀有） |

原型分化（6 seed 共 240 人）：
養成型 起始 44.4/空間 27.6｜一般 50.9/17.1｜即戰力 60.3/10.7｜超新星 59.7/29.4

> ⚠ **A 級以上比例由約 31% 降到 12%**。這是**刻意的**：改動前高潛力很便宜，
> 因為起始能力本來就貼著潛力；現在高潛力代表真正要投資。
> 這屬 legitimate expectation change，不是回歸。

### 招募等級（本輪追加 Audit）

**現況**：唯一真效果是 `management_scout_network` → `scoutDaysReduction`（球探報告 −1 天/階）。
它**完全不影響**新人池的品質、數量、潛力或 learning。
`general_scout_support` 是 FUTURE 節點（無 effect）。
`scoutLv` 遮蔽的是：潛力（0=「???」／1=十位數區間／2=精確值）、tier、個性、特質、能力值。

**🔴 V0B 帶來的風險**：新增的 `archetype` / `growthSpace` 欄位**等於潛力的直接讀數**。
目前 UI 沒渲染它們，但只要有人渲染，球探系統就整個失效。
⇒ gate §R5 明文守住「招募 UI 不得渲染這兩個欄位」。

**依設計原則實作**（招募等級不讓新人變強，只提高發現與判斷）：
`genProspects(seed, { scoutNetworkRank })` 只把**初始已知程度** `scoutLv` 往上抬。

⚠ 第一版用「rank 3 ⇒ +2」，結果 rank 3 時**每一位新秀都完全揭露**，
**球探系統整個失去意義**。改成**依名次的部分揭露**（rank N ⇒ N/4 的新秀 +1）：

| rank | 已知(lv≥1) | 完全揭露(lv2) | 平均起始 | 平均空間 | 平均潛力 |
|---|---|---|---|---|---|
| 0 | 66.7% | 33.3% | 52.4 | 18.0 | 70.4 |
| 1 | 76.7% | 40.8% | 52.4 | 18.0 | 70.4 |
| 3 | 94.2% | 58.3% | 52.4 | 18.0 | 70.4 |

**起始／空間／潛力三欄完全相同** ⇒ 招募等級只改資訊，不改能力。
rank 0 與改動前**逐位元相同**（舊存檔與既有呼叫端不受影響）。

### V0A + V0B joint calibration（Year 0–4）

> metric 口徑：Year 0 = **StartingCore（A）**；Year 1–4 = **MainStat 空間關閉率（E/C）**

| 原型 | 起始 | 空間 | Y1 | Y2 | Y3 | Y4 |
|---|---|---|---|---|---|---|
| 一般新人 19–21歲 | 51.6 | 12.4 | 23.7% | 35.5% | 45.5% | 51.6% |
| 養成型 | 49.0 | 32.0 | 24.3% | 36.8% | 47.6% | 55.0% |
| 即戰力 | 67.8 | 12.2 | 13.3% | 18.0% | 24.1% | 27.9% |
| 超新星 | 63.2 | 27.8 | 11.2% | 15.7% | 21.1% | 24.4% |

**⚠ 距離產品目標（Y3–4 接近成熟）還有明顯落差，且我沒有為了讓數字好看而扭曲 V0B。**

### 哪些已解決、哪些仍在等

| 項目 | 狀態 |
|---|---|
| 新秀沒有成長空間（TD-32） | ✅ **V0B 已解決**（8.4 → 15.8 點） |
| 出生就貼住潛力 | ✅ **V0B 已解決**（41.5% → 0.4%） |
| 四種原型無分化 | ✅ **V0B 已解決** |
| 招募等級對新人池毫無影響 | ✅ **V0B 已補**（只補資訊，不補能力） |
| **成長曲線關不掉空間（Y4 僅 24–55%）** | ⏳ **Expected pending Foundation Calibration**（TD-33 漸近線 / `floorRate`——會改變 Training v1.1 輸出值，不在 V0A/V0B 範圍） |
| **來源比例 40/35/15/10** | ⏳ **Expected pending V0C / TD-35**（`MatchProgressTransaction` 不帶 `MatchOrigin`，分不出聯賽與自由對戰） |
| **課程 → 主能力覆蓋率隨定位而異** | ⚠ **新發現**：下路／輔助的主能力被訓練課程覆蓋得比中路少，MainStat 關閉率因此偏低。屬課程表設計，記錄待評估 |

### Gate

- **`check_prospect_growth_space_v0b` 31/31**（新增），含 3 個 sentinel：
  壓回小空間 ⇒ §B 紅｜原型套同一組參數 ⇒ §A 紅｜招募等級直接加強新人 ⇒ §R1 紅
- `check_cs_distribution_r46` **PASS**（R46 的 role identity／spread／HIGH_90／AGGR 全數維持）
- `check_recruit_o` 41/41、`check_pcgm_v0a` 24/24、`growth_loop_p0` 25/25、
  `growth_ui_p1` 80/80、`progress25` 34/34、`condition_o2` 29/29、`no_player_injury` 29/29、
  `dev_quick_recovery` 29/29、`cs_roster_v1_r56`、`cs23` 28/28、`finance_n3` 40/40、
  `squad_o1` 40/40、`roster_ui_r58/581/582`、`cs_matchup_acceptance_r57`、`r62_player_ui_fixture` — 全綠
- `verify.mjs --only=progress25,talent27,growth_p0,growth_ui_p1,regress,regress2,build` — **7/7**

⚠ **第三支 pre-existing red**：`check_team_development_v1` → `FAIL profileStore migration 與 write hook`。
在 **V0A 的 commit（daf6cf2）** 與 **乾淨 main 基準（`ESMO-acceptance` @ a886e39）** 上都紅同一句
⇒ 與本輪無關，未處理。

### 沒有做

未做 V0C / Career Clock / aging / off-season / AI turnover / Ranked / Live Event /
Multi-Title / Coach / TD-35。未動 `trainingCalculator.js` 與 `careerGrowth.js`。
未鎖任何 balance 常數。未 push、未 deploy。


## Season vNext V0B.1 — 新人模型補強與校準（2026-08-25）

分支 `feature/remove-player-injury`。**未 push、未開始 V0C。**

> ⚠ **FOUNDATION_COMPLETE = NO。** V0A ✅ → V0B ✅ → **V0C** → Foundation Calibration Gate。

### Audit：V0B 之後仍存在的四個問題（先量測才動手）

320 名新秀（8 seed）實測：

| 問題 | 證據 |
|---|---|
| **Learning 是起始能力的複製品** | 相關係數 **0.87**；且 Learning ↔ 成長空間 **−0.49**——**空間最大的人學得最慢** |
| **Learning 值域太窄** | 29–71（中位 50）⇒ `learningEfficiency` 的作用帶（0.90–1.10）幾乎只用到下半，等於沒有差別 |
| **沒有特殊個體** | 晚熟型 **0 人**、高潛高成長 **0 人**、高潛慢成長 1 人 |
| **越年輕越好** | 年齡 ↔ 成長空間 **−0.63**，且年齡下緣只到 16 |

根因：`learning` 走的是 `genProspectStat`（＝ `core + 雜訊`），與其餘素質同一個產生器；
四個原型是**互不重疊的硬區間**，沒有任何離群機制。

### 改了什麼

**① Learning 獨立生成**（`genLearning`）
與 potential **弱**正相關（每點潛力 +0.25），主要來自獨立亂數，**與起始能力無關**。
值域 25–95，刻意涵蓋 `learningEfficiency` 的整個作用帶。

**② 特殊個體 twist**（`PROSPECT_TWISTS`，機率權重不是規格表）

| twist | 權重 | 偏移（**有代價**，不是免費加值） |
|---|---|---|
| 早熟 prodigy | 5 | core +10 / room −6 / age −2 |
| 晚熟 lateBloom | 5 | core −8 / room +12 / age +2 |
| 領悟力強 quickLearn | 6 | learning +22 |
| 大器晚成 slowBurn | 6 | learning −22 / room +6 |
| 璞玉 hiddenGem | 4 | core −10 / room +14 |

合計約 26%，其餘七成多是普通新秀。

**③ 年齡下緣延伸到 15**（各原型 −1，twist 可再偏移，clamp 15–24）

**④ 招募等級改為「適度」影響人才市場**（依本輪產品指示修正 V0B 的原設計）
`superstarBias = rank × 1.2`、`twistScale = 1 + rank × 0.12`——**只動機率，不動能力**。

### 結果

| 指標 | 改前 | 改後 |
|---|---|---|
| Learning ↔ 起始能力 | **0.87** | **−0.03** |
| Learning ↔ 成長空間 | −0.49 | −0.006 |
| Learning 值域 | 29–71 | **25–95** |
| 年齡 ↔ 成長空間 | −0.63 | **−0.39** |
| 年齡範圍 | 16–23 | **15–23** |
| 晚熟型 | 0 | 5 |
| 高潛高成長 | 0 | 2 |
| 高潛慢成長 | 1 | 3 |
| 年輕即戰力 | 8 | 9 |
| 帶 twist 比例 | — | **25%** |

**年紀大的新秀有補償優勢**（≥21 歲起始 57.3 vs ≤17 歲 50.7）⇒ 不是「越年輕越好」。

### 招募等級現在的價值

| rank | 已知(lv≥1) | 完全揭露 | 超新星率 | 平均起始 | 平均空間 | 平均潛力 |
|---|---|---|---|---|---|---|
| 0 | 61.7% | 34.2% | 4.0% | 52.6 | 18.4 | 71.0 |
| 1 | 68.3% | 44.2% | 5.8% | 52.6 | 19.0 | 71.6 |
| 3 | 90.8% | 56.7% | 8.0% | 52.8 | 19.2 | 72.0 |

- **主要價值＝資訊**：已知比例 61.7% → 90.8%
- **次要價值＝機率**：超新星 4% → 8%、特殊個體 26% → 32%
- **不是全面膨脹**：平均起始 +0.2、潛力 +1.0，**位移 < 0.15 個標準差**
- **兩端都在**：rank 0 仍挖得到潛力 ≥90 的天才；rank 3 仍有 65% 是普通原型，且**不會全部揭露**（完全揭露僅 56.7%）

### V0A + V0B joint calibration（Year 0–4）

> metric：Year 0 = **StartingCore (A)**；Year 1–4 = **MainStat 空間關閉率 (E/C)**

| 原型 | 起始 | 空間 | Y1 | Y2 | Y3 | Y4 |
|---|---|---|---|---|---|---|
| 一般新人 19–21歲 | 50.0 | 15.0 | 20.4% | 29.6% | 37.5% | 42.4% |
| 養成型 | 52.6 | 30.4 | 27.8% | 41.6% | 53.4% | **60.9%** |
| 即戰力 | 68.2 | 10.8 | 10.9% | 15.6% | 20.7% | 23.7% |
| 超新星 | 55.4 | 28.6 | 20.1% | 29.3% | 37.1% | 41.5% |

**仍未達「Y3–4 接近成熟」。沒有為了湊結果而改新人生成。**

### 留給後續

| 項目 | 歸屬 |
|---|---|
| 成長曲線關不掉空間 | **TD-33 漸近線 / `floorRate`** — Foundation Calibration Gate（會改 Training v1.1 輸出值） |
| 來源比例 40/35/15/10 | **TD-35 / V0C** — `MatchProgressTransaction` 不帶 `MatchOrigin` |
| 訓練課程對主能力的覆蓋率隨定位而異 | 課程表設計，待評估 |
| `learning` 可超過 `potential` | **刻意允許**（低潛快成長是產品要的組合）；gate C1 已排除 learning |

### Gate

- **`check_prospect_growth_space_v0b` 43/43**，含 4 個 sentinel
  （壓縮空間 / 原型扁平化 / 招募等級加強能力 / **把 learning 綁回起始能力**）
- `check_cs_distribution_r46` PASS、`check_recruit_o` 41/41、`check_pcgm_v0a` 24/24、
  `growth_loop_p0` 25/25、`growth_ui_p1` 80/80、`progress25` 34/34、
  `cs_learning_lifecycle_r55`、`cs_roster_v1_r56`、`cs_matchup_acceptance_r57`、
  `cs23` 28/28、`condition_o2` 29/29、`no_player_injury` 29/29、`finance_n3` 40/40、
  `squad_o1` 40/40、`roster_ui_r58`、`r62_player_ui_fixture` — 全綠
- `verify.mjs`（progress25/talent27/growth_p0/growth_ui_p1/regress/regress2/**build**）— **7/7**

⚠ **pre-existing red 增加到 5 支**（全部在乾淨 main `a886e39` 就紅，與本輪無關）：
`check_team_development_recovery`、`check_acceptance_fix_p1` §6b、`check_team_development_v1`、
**`check_cs_learning_measurement_r37`**、**`check_cs_learning_lifecycle_r16b`**
（後兩支加上 `check_cs_gameplay_measurement_r49`、`check_cs_team_identity_consumers_r48`
同屬 `R48_LEGACY_R47_SHA` 家族——`tools/cs_r15_legacy_source.mjs` 的歷史原始碼雜湊已過期）。

### 沒有做

未開始 V0C。未做世界時間／老化／退休／線上 Ranked。未新增青訓中心。
UI 只有 V0B 既有的一行接線，**沒有新增畫面**。
未動 `trainingCalculator.js` / `careerGrowth.js` / `levelGrowth.js`。未 push、未 deploy。


## Season vNext V0C — Match Source 契約（2026-08-25）

分支 `feature/remove-player-injury`。**未 push、未開始 Foundation Calibration。**

> ⚠ **FOUNDATION_COMPLETE = NO。** V0A ✅ → V0B ✅ → V0C ✅ → **Foundation Calibration Gate**。

### Audit：來源其實一路都在，只是被丟掉了

| 事實 | 位置 |
|---|---|
| `MatchOrigin.v1` 有 `kind: ticket / fixture` | `contracts/matchOrigin.js` |
| **MOBA 與 CS 都已經把 origin 傳進 adapter** | `useBattleFeed.js` / `settleCsMatch.js` 的 `origin: store.matchmaking?.session?.origin` |
| adapter 只把它換算成一個 **Fan 倍率**就丟掉 | `mobaProgressAdapter.js:71 fanWeightForOrigin(ctx.origin)` |
| `MatchProgressTransaction.metadata` 是**白名單**，沒有來源欄位 | `matchProgressTransaction.js` |

⇒ **「粉絲分得出來、成長分不出來」**。這就是 TD-35 的實際形狀——
不是資訊不存在，是它沒有被帶進權威紀錄。

**另一個分類落差**：`fanSourceWeight.js` 的三桶是 practice / league / major，
其中 **`ticket`（一般比賽）被歸進 practice**。對粉絲曲線是對的，
但對產品定位是錯的——**快速練習**與**競技比賽**是兩層不同的東西。

### 做了什麼（最小必要，四個檔）

| 檔案 | 改動 |
|---|---|
| `platform/progress/matchSource.js` | **新增**（17 行實碼）。`MATCH_SOURCE = practice / competitive / official` ＋ `matchSourceFromOrigin()`。純函式，不讀 UI / route / stage / Store |
| `contracts/matchProgressTransaction.js` | metadata 白名單**附加一欄** `matchSource`（`?? null`，舊交易單仍合法） |
| 兩個 adapter | 用**同一支**分類把來源寫進交易單（MOBA / CS 共用，不是兩套） |
| `applyMatchProgress.js` | 讀 `tx.metadata.matchSource` 交給 `applyLevelGrowth` |
| `careerGrowth.js` | `GROWTH_SOURCES` 對齊三層（`formal`/`ranked` → `official`/`competitive`） |

**`fanSourceWeight.js` 一個位元都沒動**（對 `origin/main` 零 diff）⇒ 粉絲行為逐值不變。
兩支分類器分桶可以不同（Fan 需要 league/major），但 gate §X1 釘住
**「這場是不是正式季賽」永遠一致**，不得分歧。

### 三種模式的定位與完成度

| 層 | 定位 | 現況 |
|---|---|---|
| **快速練習 practice** | 試新人／陣容／戰術，不應成為永久成長來源 | **只有契約**。入口未實作；目前只有「拿不到 origin」會落到這裡（保守預設） |
| **競技比賽 competitive** | **今天的「一般比賽」就是這一層**。未來長出評分／牌位／排行榜 | **已可辨識**（`kind: ticket`） |
| **正式季賽 official** | 正式排名／獎金／Fans／榮譽／生涯成果 | **已可辨識**（`kind: fixture`，含 Major 與年度總決賽） |

### 成長倍率

四個來源的 `sourceBase` **一律 1.0** ⇒ 本輪**行為逐值不變**，
只是從「分不出來」變成「**分得出來且可獨立控制**」。
數值（含 40/35/15/10 年度佔比）留給 **Foundation Calibration**。

> V0A 時 base 必須是 1.0 是因為**分不出來**（調高正式賽等於自由對戰一起調高）。
> **那個阻礙現在解除了**；本輪不動數值是產品要求，不是技術限制。

### 快速練習的實作評估

`MATCH_FLOWS` 已是 keyed by gameType，MOBA / CS 各有完整
`prep → matching → (draft) → tactic → battle → result`。
**快速練習不需要新流程**，只需要：
① 一個進入方式 ② 一個 `MatchOrigin` 的新 kind（或 ticket 的子型別）
③ 結算時 `matchSource = practice`。

⇒ **值得一個獨立小 Sprint**（建議 V0D）。但要先想清楚
「不給永久成長的話，玩家為什麼要打」——否則會做出一個沒人用的模式。

### Gate

- **`check_match_source_v0c` 21/21**（新增），含 2 個 sentinel
  （把一般比賽併回練習 ⇒ §S2 紅｜結算不再讀來源 ⇒ §W1 紅）
- `check_pcgm_v0a` 24/24、`check_prospect_growth_space_v0b` 43/43
- `fan_system` 66/66、`fan_ui_f4` 35/35、`fan_f0` 33/33（**粉絲零影響**）
- `authoritative_o7` 48/48、`result_flow_o71` 27/27（結算邊界未被破壞）
- `competition_q4` 68/68、`competition_q6` 57/57、`cs_season_lifecycle` 54/54（季賽未被污染）
- `progress25` 34/34、`growth_loop_p0` 25/25、`growth_ui_p1` 80/80、`condition_o2` 29/29、
  `no_player_injury` 29/29、`cs23` 28/28、`recruit_o` 41/41、`cs_distribution_r46`、
  `finance_n3` 40/40、`squad_o1` 40/40、`match_entry_o3` 35/35、`matchmaking_o4` 48/48 — 全綠
- `verify.mjs`（含 **build**）— 7/7

### 兩處 gate 斷言被刻意改寫（不是為了變綠）

1. **`check_pcgm_v0a` H1**：來源名稱 `formal`/`ranked` → `official`/`competitive`。
   V0A 是在三層定位敲定**之前**取的名字，V0C 定案後對齊。**是對齊，不是放寬。**
2. **`check_prospect_growth_space_v0b` F3**：原本鎖 `careerGrowth.js` 對 V0A commit 零 diff。
   那是**跨 sprint 的凍結**，撐不過下一輪的正當改動。改成鎖真正該保護的
   `trainingCalculator.js` 對 `origin/main` 零 diff（行為面另有 F1 golden fixture）。

> ⚠ `check_talent27` §28（`git diff --quiet HEAD -- matchProgressTransaction.js`）
> 在**未提交**時必然紅——它偵測的是「你還沒 commit」，不是「契約被破壞」。
> 這正是 talent27 自己註解裡承認的缺陷（它為此移除過 LogicEngine 那一條）。
> commit 後即恢復綠燈。

### 沒有做

未實作快速練習入口、完整 Ranked、真人連線、Live Event、server / matchmaking。
未做 Career Clock / 年齡增加 / 老化 / 退休。
未動 `BattleResult.v2`、`CsMatchResult.v1`、`fanSourceWeight.js`、`trainingCalculator.js`。
未鎖任何 balance 數值。未 push、未 deploy。

---

## Season vNext Foundation Calibration（2026-08-25）

**分支** `feature/remove-player-injury`｜**起點** `bb8e8b3`（V0C 完成）
**本輪不是加功能，是把既有成長系統調到合理的生命週期。**

### 為什麼要有這一輪

V0A（成長認年齡）／V0B（新秀有成長空間）／V0C（分得出比賽來源）都做完之後，
實測仍然是**一般新人 Year 4 只關閉 42.4% 潛力空間**，而且成長 **85.1% 來自訓練**。
先 Audit + 大樣本模擬找真因，才動參數——沒有先猜倍率。

### Audit 找到五個彼此獨立的根因

| # | 根因 | 實測 |
|---|---|---|
| RC1 | **除數與真實空間不匹配** | training 把剩餘空間除以 40、levelGrowth 除以 25，但 V0B 之後新秀主能力空間中位數只有 **17.4 點** ⇒ 節流閥入行即只開 **43.5%**，且只會再往下掉。那個 40 是 V0B **之前**的世界留下來的 |
| RC2 | **線性收斂 = 指數逼近** | 每多關 10% 潛力所需努力持續放大（10%→3 步、90%→57 步）⇒ 尾巴是漸近線，永遠走不完。**這就是 TD-33** |
| RC3 | **升級頻率隨等級衰減** | 比賽成長掛在升級上，`xpRequiredForLevel` 隨等級線性增加 ⇒ Y1 升 3 級、Y6 升不到 1 級。比賽這條路**自己會枯掉** |
| RC4 | **三項能力完全練不到** | `courage` / `resilience` / `leadership` 不在任何課程裡。上路有 **46.7%（w4+w3）** 的定位權重落在練不到的能力上；中路／下路是 0% |
| RC5 | **收斂系統會抹平速率差** | 年齡與 learning 只乘在**速率**上。當所有人終究逼近自己的上限，速率差在 4 年尺度被壓成 6pp（age 17 vs 36）與 4pp（learning 25 vs 95）⇒ 形同不存在 |

### 改了什麼（每一項對應一個 RC）

1. **`src/platform/progress/potentialSpace.js`（新，leaf，零 import）** — RC1 + RC2
   把「剩餘空間 → 係數」抽成 `trainingCalculator` 與 `levelGrowth` **共用的一份定義**
   （改動前兩邊各寫一份線性除法，除數還不同），形狀改為 `(room/ref)^gamma`，**gamma = 0.6**。
   **為什麼不是 TD-33 原本規劃的 `floorRate`**：平坦下限會讓已頂到上限的人還在長，
   等於蓋掉問題並抹平潛力差異。gamma < 1 在 room = 0 時仍**恰好是 0**（上限仍是硬的），
   但 `dr/dt ∝ r^0.6` 是**有限時間收斂** ⇒ TD-33 是被**曲線形狀**解掉的，不是被下限蓋掉的。
2. **`sourceBase.official` 1.0 → 3.0** — RC3
   正式季賽一年 14 場、由賽程決定，**結構上刷不了**，所以可以放心加重。
   `competitive` 維持 **1.0**（玩家自己排隊，能刷）。
3. **年齡曲線陡峭化** — RC5
   `≤20 → 1.10`；`21–28 → 1.10 − (a−20)×0.015`；`≥29 → max(0.20, 0.98 − (a−28)×0.11)`。
   **20–28 歲幾乎不動**（age 24 前後都是 1.04）⇒ 既有陣容與 AI 隊（多在 21–26 歲）不受影響。
   34 歲的成長效率降到 20 歲的 **29%**。⚠ 這**不是衰退**：能力不會下降，只是還能進步多少收斂。
4. **learning 幅度加寬** — RC5：`0.90–1.10` → `0.80–1.22`，中性點 70 → 65（新秀 learning 中位約 59.5）。
5. **新增「心志鍛鍊」課程** — RC4：`["resilience","courage","leadership"]`，`gain: 1.3`。
   每小時產出 1.95，**略低於**一般 2 項課程（2.0）——廣度換效率，不會變成「排它就對了」。
   10 個定位現在全是 **5/5 覆蓋**。
6. **`TRAINING_FORMULA_VERSION` v1.1 → v1.2**（曲線改了就不能還叫 v1.1）。

### 產品結果（大樣本 280+ 新秀 × 10 seed）

| 原型 | 起始 | 空間 | Y1 | Y2 | Y3 | Y4 |
|---|---|---|---|---|---|---|
| 養成型 | 45.8 | 27.6 | 36.9% | 50.8% | 63.4% | **69.2%** |
| 一般新人 | 52.3 | 16.8 | 46.0% | 59.7% | 71.6% | **76.5%** |
| 即戰力 | 61.6 | 9.7 | 56.2% | 69.9% | 80.2% | **83.7%** |
| 超新星 | 63.7 | 26.9 | 38.3% | 52.6% | 65.5% | **71.3%** |

改動前一般新人是 20.4 / 29.6 / 37.5 / **42.4%**。
四種原型 Year 4 相差 14.5pp ⇒ **沒有被校準成同一條曲線**。

**來源分帳**：訓練 78.1%／正式季賽 21.9%（改動前 85.1% / 14.9%）。

### 防刷與公平驗證

- **純刷競技 Year 4 = 48%**，認真訓練 = 76.5% ⇒ 刷比賽**不是**最佳養成法。
  實測 `competitive` base 1.5 時純刷會反超（81% vs 75%）⇒ **1.0 是分界線，不是隨手填的中性值**。
- **正式季賽刷不了**：場次由賽程決定，與玩家意圖無關。
- **職業公平**：四年絕對主能力成長 下路 11.5 ／ 打野 12 ／ 輔助 13.8 ／ 中路 14.4 ／ 上路 15.2，最差是最佳的 75.7%。
  ⚠ 關閉率的排序與成長點數不同，那是**指標**造成的（空間小的定位天生容易關閉），不是不公平。
- **年齡**：Year 4 關閉率 20 歲 85.0% vs 34 歲 34.7%（改動前只差 6pp）。
- **learning**：Year 4 87.2% vs 78.4%（改動前只差 4pp）。
- **高潛力不會過快滿能力**：潛力 96 的 Year 4 關閉率（64.7%）**低於**潛力 60（89.6%），
  但 Year 8 主能力 86.9 vs 59.6 ⇒ 潛力決定**能長多少**，年齡與 learning 決定**多快長完**。

### Match Source fallback audit（本輪要求的前置檢查）

**正常路徑不會掉 origin。** `createSession` 是唯一的場次工廠，兩個生產者
（`mockGateway.openSession` 票券／`competitionGateway.openSessionForFixture` 賽程）都經過它，
而它在拿不到來源時**硬性拒絕發出場次**（`code: "ticket"`）⇒ 只要 session 存在就一定有 origin。
殘餘的無 origin 路徑只有 **debug harness**（根本沒有 session）。

⇒ 因此 `sourceBase.practice` **維持 1.0**：目前 practice 是「拿不到來源」的退路，
調低它等於把**資料遺失**變成看不見的成長懲罰。建議未來讓真正的快速練習用
**explicit practice origin**，並把 fallback 與 practice 分開 —— 見 **TD-36**（V0D 的前置條件）。

### 四處 gate 斷言被刻意改寫（是期望變更，不是把紅燈調綠）

1. **四支 gate 的 Training golden fixture**（`check_pcgm_v0a` F1、`check_prospect_growth_space_v0b` F1、
   `check_no_player_injury` §14、`check_dev_quick_recovery` §5）：v1.1 → v1.2。
   ⚠ **成長量逐值未動**（accuracy/reflex 各 +1.9、totalGain 3.8）；變的只有係數本身
   （age 1.01 → 0.995、learning 1 → 1.03）與由它們導出的 efficiency。
   每一處都在檔內標明理由與「這是刻意的期望變更」。
2. **`check_pcgm_v0a` F2**（`trainingCalculator.js` 對 origin/main 零 diff）→ **退休**。
   那是跨 sprint 凍結，而 V0A 檔頭本來就寫明「floorRate 屬 Foundation calibration，見 TD-33」
   ⇒ 這一輪就是被指定來改它的。改成守 V0A 真正在乎的：
   **efficiency 仍恰好是 age × learning × condition**（合成形狀沒被換掉）。
3. **`check_prospect_growth_space_v0b` F3**（同一條凍結，V0C 時已經從 `careerGrowth.js` 搬到
   `trainingCalculator.js`）→ **第二次因同一個理由失效，退休**。
   改成守分層關係：`recruitPool` 與 `trainingCalculator` 互不 import。
4. **`check_match_source_v0c` W4**（「本輪倍率一律 1.0」）→ 那是 **V0C 自己的 scope 宣告**，
   Foundation Calibration 執行後必然失效。改成驗證 V0C 真正的交付：
   **倍率確實分開生效**（official ≠ competitive 時成長係數真的不同）。

另外修掉兩個**假紅**：`check_pcgm_v0a` G2 與新 gate 的 F4 原本用裸關鍵字 `careerGrowth` 掃
`trainingCalculator.js`，會掃到檔內「本檔不得 import careerGrowth」那句**註解本身**
⇒ 變成「把理由寫下來就變紅」。改成只掃 import 敘述。
`check_no_player_injury` 的 sentinel 也修了：臨時模組必須寫在**原檔旁邊**，
否則 `trainingCalculator.js` 的相對 import 會解析失敗，sentinel 測到的是「會不會當掉」。

### Gate / build

- **`check_foundation_calibration` 57/57**（新增，含 4 個 mutation sentinel）
- `pcgm_v0a` 24/24、`prospect_growth_space_v0b` 43/43、`match_source_v0c` 21/21
- `no_player_injury` 29/29、`dev_quick_recovery` 29/29、`recruit_o` PASS
- 粉絲零影響：`fan_system` 66/66、`fan_ui_f4` 35/35、`fan_f0` 33/33
- 結算邊界未破：`authoritative_o7` 48/48、`result_flow_o71` 27/27
- 季賽未污染：`competition_q4` 68/68、`competition_q6` 57/57、`cs_season_lifecycle` PASS、`cs_season_contract` PASS
- `verify.mjs --only=progress25,talent27,growth_p0,growth_ui_p1,regress,regress2,build` — **7/7**

**先前就紅、與本輪無關**（逐一確認失敗原因不是成長曲線）：
`team_development_recovery`（首頁磚／talentPick 路由）、`team_development_v1`（profileStore migration）、
`acceptance_fix_p1` §6b（首頁天賦導向）、`cs_learning_measurement_r37` 與 `cs_learning_lifecycle_r16b`
（`R48_LEGACY_R47_SHA` 陳舊雜湊）。
⚠ 後兩支另外硬鎖 `playerModel.js` 的 SHA，而該檔在 **HEAD（本輪之前）就已經對不上**
（`b02237b6…` vs 期望 `9d6f07f8…`）⇒ 那組鎖已永久失效，登記為 **TD-37**。

### 簡短 grilling（自我壓力測試）

- **Q：gamma 只是把成長調快，跟加 floor 有什麼實質差別？**
  A：floor 讓 room = 0 時仍有成長（上限變軟）；gamma 在 room = 0 時**恰好是 0**，上限仍是硬的。
  差別在 room → 0 的**趨近方式**：線性是指數逼近（走不完），`r^0.6` 是有限時間收斂（會走完）。
  §C7 用真的 `calculateTrainingResult` 反覆上課驗證它真的到頂。
- **Q：official = 3.0 會不會讓正式賽變成雪球？**
  A：不會，因為場次是**賽程給的**（14 場），贏球不會多打，輸球不會少打。
  XP 的勝負差只有 50 vs 20，且 `perStatCap` 在 PCGM 之後仍夾住單項每級上限（§F2 驗證）。
- **Q：陡峭 age 曲線算不算偷做衰退系統？**
  A：不算。能力**不會下降**，只有「還能再進步多少」隨年齡收斂，而那個係數本來就存在。
  真正的 aging / decline / retirement 仍未實作（V1）。
- **Q：老將問題解決了嗎？**
  A：**沒有根本解決。** 只把 34 歲壓到 20 歲的 29%；玩家仍可長期持有老將慢慢練到上限。
  根本解法是 aging / decline，不是把年齡係數再調更陡。已寫進報告 §⑦。
- **Q：加課程會不會破壞既有訓練平衡？**
  A：新課程每小時產出 1.95，低於一般課程的 2.0（§P3 釘住「最高不得超過第二名 1.15 倍」）。
  它補的是**原本一門都沒有**的三項能力，不是在已覆蓋的能力上加碼。

### 沒有做

未實作快速練習入口／UI、完整 Ranked、真人連線、Live Event、server / matchmaking。
未做 Career Clock / 年齡 +1 / 老化 / 衰退 / 退休。
未動 `BattleResult.v2`、`CsMatchResult.v1`、`fanSourceWeight.js`、`matchSource.js`、
`LEVEL_GROWTH` 的四個費率常數（`pointsPerLevel 3.0` / `roomFull 25` / `perStatCap 1.5` / `hardCap 99`）。
未動體力經濟（`CONDITION`）——TD-38 記錄了為什麼那是下一輪的事。
未 push、未 deploy。
