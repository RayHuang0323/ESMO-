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
