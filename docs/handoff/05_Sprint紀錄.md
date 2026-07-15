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
