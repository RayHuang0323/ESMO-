# 俱樂部進度與經濟：CURRENT STATE ＋ Club Progression Contract v1

- 對象分支：`feature/club-identity-v1`（HEAD 為 Club Identity v2 之後）
- 稽核日期：2026-09-03
- 稽核方式：靜態追碼，每一條結論都附 `檔案:行號`。**本輪不改任何 progression 行為**，只把重複的權威找出來。

---

## 一、為什麼要做這份稽核

首頁同時出現 `LEVEL Lv.93`、`XP 7.27萬`、`BADGE #48`，而系統另外還有 Club Level、`clubPointsLifetime`、Club Points、Club Mastery、Career Funds。玩家看到六個數字，卻沒有任何一處說明它們的關係——因為**它們之間本來就沒有關係**。這份文件先把現況說清楚。

---

## 二、CURRENT STATE 資料圖

| 欄位 | 權威來源 | 怎麼增加 | 怎麼消耗 | 有真實 reward／unlock？ | 哪些畫面用 | 只是 legacy／展示？ | 與誰重複 |
|---|---|---|---|---|---|---|---|
| `team.xp` / `team.lv` / `xpMax`（首頁 LEVEL） | `profileStore.js:308` 的 `DEFAULT.team` | **沒有任何寫入點**。`profileStore.js:33`、`:3867` 都明文寫「不動 team.lv/xp」 | 不可消耗 | ❌ 無 | `DashboardScreen.jsx:90-93`、`:443-446` | ✅ 死值 | 與 Club Level 是兩套等級敘事 |
| `meta.achievement`（首頁 BADGE） | `profileStore.js:363`（種子值 48） | **沒有任何寫入點** | 不可消耗 | ❌ 無 | `DashboardScreen.jsx:90`、`:443` | ✅ 死值、孤兒欄位 | 無 |
| `retention.clubPoints`（可花餘額） | `retentionState.js:44,60-70` | `claimObjective()` 領取日／週／季目標（`retentionState.js:281-300`） | `spendClubPoints()`（`:82-90`），唯一呼叫點是 `profileStore.buyClubAsset()`（`profileStore.js:3792`） | ✅ 買教練與外觀 | 俱樂部資產頁 | ❌ 活的 | 與 lifetime 是刻意分離的兩個角色 |
| `retention.clubPointsLifetime`（累計） | 同上（`retentionState.js:45,61-67`） | 與餘額同步累加，**只增不減**（`:294-296`） | 不可消耗 | ✅ 驅動 Club Level ＋ 資產解鎖門檻 | Club Mastery 頁 `ClubMasteryScreen.jsx:337` | ❌ 活的 | — |
| Club Level／tier | `clubTierOf()`（`retentionState.js:316-330`），門檻表 `:307-313` | 隨 `clubPointsLifetime` 自動晉級（0／500／2000／6000／15000） | 不消耗（推導值） | ⚠ 檔內明寫「純展示，不影響任何數值」（`:305`） | `ClubMasteryScreen.jsx:244-245,337-347` | 半展示（活資料、無回饋） | **與首頁 LEVEL 名字撞、意義不同** |
| Club Mastery／Doctrine | `mastery/clubMasteryState.js` | `recordTacticUsage()`（`clubMasteryState.js:203`），由 `applyMatchProgress.js:259-264` 在正式結算呼叫 | 進度換戰術變體 | ✅ 解鎖賽前可選變體 | `ClubMasteryScreen.jsx` | ❌ 活的 | 無 |
| Prestige | **不存在獨立系統**。全庫只有 `retentionState.js:312` 一個 tier id 叫 `prestige` | — | — | — | — | — | 名字容易誤導 |
| `finance.funds`（Career Funds） | `economy/newGame.js:22-34` 給初值；`applyMatchProgress.js:69-71,268` 寫入 | 比賽獎金、贊助、週結算 | 營運支出 | ✅ 真錢 | 首頁 OPERATING FUNDS（`DashboardScreen.jsx:997,799` 以 `team.gold` 注入） | ❌ 活的 | `team.gold` 只是別名，非第二份 |
| HeroProgress | `hero/heroProgressStore.js:18`，獨立 store、獨立 key `esmo.heroProgress.v2` | `recordBattleResult(br)`（`:20-28`） | 下場 `getLoadout()` | ✅ 影響英雄強度 | 戰鬥層元件 | ❌ 活的 | **與 profileStore 的 `players[].xp` 平行**，兩本帳互不通訊 |

### Owner 的六個問題

**Q1. 首頁 Lv.93 / XP 7.27萬 怎麼來的？**
寫死的模板種子值，不是計算結果：

```js
// profileStore.js:308
team: { name: …, tag: "GSEAL", lv: 93, xp: 7.27, xpMax: 12.1 },
```

`startNewGame()` 原樣複製（`profileStore.js:3521`）。`DashboardScreen.jsx:171` 的 `compactWan(7.27)` 把它印成「7.27萬」。打幾百場都不會變——`profileStore.js:33` 與 `:3867` 明文說「XP 只記在 rewards.xp／csHistory，不動 team.lv/xp」。

**Q2. BADGE #48 是什麼？**
`meta.achievement`，唯一來源是 `profileStore.js:363` 的種子值 `48`。全庫沒有任何寫入點（賽後結算 `applyMatchProgress.js:266-297` 的 `nextState` 不含這個欄位）。**它不代表任何成就**。

**Q3. Club Mastery 的 Club Level 和首頁 LEVEL 重複嗎？**
是兩套獨立權威，而且資料模型不同：首頁是靜態數字 `team.lv`（`DashboardScreen.jsx:91`）；Club Mastery 是五階命名 tier（`ClubMasteryScreen.jsx:244-245` → `retentionState.js:265`）。沒有任何程式碼把兩者關聯。**名字撞、意義不同，這是玩家困惑的主因。**

**Q4. `clubPointsLifetime` 真的該驅動 Club Level 嗎？**
目前它是唯一驅動因子（`clubTierOf`，`retentionState.js:316-330`），而且同一個值也當資產解鎖門檻（`clubAssetsState.js:116-120`）。**問題不在「該不該」，在於它同時扮演兩個角色**：長期進度（只增不減，適合當等級）與購買資格（門檻）。這是可接受的，但首頁那個假 LEVEL 必須讓位——見下方 Contract。

**Q5. 一場正式 MOBA／CS 比賽會寫哪些永久值？**
唯一入口 `applyMatchProgress()`（`profileStore.js:3577` → `progress/applyMatchProgress.js:43-300`），一次 `set()` 寫入：

1. `players[]`：`xp`／`lv`／`talentPoints`／`stats`／`restDays`／`growthLog`（`:84-146`）
2. `finance.funds` ＋ `finance.transactions`（`:69-71,180-190,268`）
3. `meta.fans`、`meta.competitiveBlock`（`:72,217-228,272`）
4. `retention.counters` / `sets`（供目標判定，`:246-251`）——**注意：Club Points 不在這裡加**
5. `clubMastery` 戰術專精（`:259-264`）
6. `economy.formLog`（非練習賽，`:289-296`）
7. `processedMatchTransactions[txId]` 冪等憑證（`:273`）

`reputation` 自 F0 起 deprecated，不再寫入（`:63-68`）。`team.lv/xp/achievement` **不在清單內**。

**Q6. 快速練習有產永久進度嗎？**
沒有，而且是三層一起歸零：

- 分類：`progress/matchSource.js:63-69`，`kind:"practice"` → `MATCH_SOURCE.practice`
- 選手進度：`adapters/mobaProgressAdapter.js:93-94`，practice ⇒ `playerProgress` 直接是空陣列
- 團隊獎勵：`rewardFormulas.js:47-53`，practice ⇒ `{ prizeWan: 0, money: 0, fans: 0 }` 早退
- Retention：`retentionState.js:176-180`，practice 只累加 `match` / `practiceMatch` 計數就 return

唯一痕跡是日目標 `tryout` 可以用它達成。

---

## 三、Club Points 經濟現況

### 來源（唯一入口）

Club Points 只從 `claimObjective()` 進帳（`retentionState.js:281-300`），金額由 `retentionObjectives.js:40-44` 的 `CLUB_POINTS` 決定：

| 尺度 | 每項 | 同時呈現 | 出處 |
|---|---|---|---|
| 每日 | 10 | 3（五選三） | `retentionObjectives.js:41,48,90-116` |
| 每週 | 40 | 3（五選三） | `:42,49,124-150` |
| 賽季／年度 | 300 | 4（固定） | `:43,51,160-186` |

領取是手動動作（`retentionObjectives.js:20-22`）。1 賽季 = 12 週 = 84 天（`economy/timeline.js:17-19`、`time/worldClock.js:32-40`）。

**層級門檻**：快速練習只算「打了一場」（`retentionState.js:176-180` 提早 return），不計勝場／輪替／青訓／對戰收入。所以 `win`、`rotate`、`youth`、`variety`、`streak` 與全部賽季目標都只認正式對戰。

正式配對每日容量 3 場（`worldClock.js:109-111`）；MOBA 常規賽每隊每季 14 場（`aiTeams.js:31` 8 隊 × `regularSeason.js:88` 雙循環），平均約 1.17 場／週。

### 產量估算

| | 每週 | 每季（12 週） |
|---|---|---|
| 一般玩家（週登入 4 天，只打賽程排定的正式賽） | ≈ 80 點（日目標的非戰鬥項；週目標門檻遠高於 1.17 場／週的實際量，基本領不到） | ≈ 960 點 |
| 高活躍玩家（每天登入、打滿每日 3 場容量） | 210（日）＋ 120（週）= **330 點** | ≈ 3,960 點（賽季目標全拿再 +1,200 ⇒ 上限約 5,160） |

⚠ 賽季目標 `finance`（年度對戰收入 800 萬元）所需的單場收入常數不在本次追碼範圍，**故意留白不臆測**。

### 去向與可負擔性

| 型錄 | 件數 | 合計 |
|---|---|---|
| 教練（`coachCatalog.js`：700／1,100／1,700） | 3 | 3,500 |
| 識別 v2 可購買品（主題 1,900 ＋ 稱號 1,000 ＋ 隊徽框 1,600 ＋ 橫幅 2,900） | 11 | 7,400 |
| 實績稱號（買不到） | 2 | — |
| **全部買得到的** | 14 | **10,900** |

- 一般玩家（≈80／週）：約 136 週 ≈ 11 個賽季
- 高活躍玩家（≈330／週）：約 33 週 ≈ 2.8 個賽季

⚠ **這是本輪找到的最大經濟問題**：一般玩家與高活躍玩家的產量差 4 倍以上，而型錄總價對一般玩家等於「不可能買齊」。原因不是價格，是**週目標的門檻是照每日 3 場容量算的**（`retentionObjectives.js:118-122` 自己就這樣寫），但實際賽程只給每週 1.17 場正式賽。建議下一輪處理，本輪不改。

### 現金路徑

沒有。全庫掃 `iap` / `premium` / `payment` / `real money` 沒有任何命中；唯一入口仍是 `claimObjective()`。

### 教練確實影響 career

`clubCapabilities.js:38-44`：`trainingDaysReduction`（上限 2）、`dailyRecoveryBonus`（上限 8）、`scoutDaysReduction`（上限 2）、`unlocks`（對手選角摘要／資料分析）。三位教練各給其中一組（`coachCatalog.js:80,99,116-120`），全部標 `careerOnly`。
對照：識別型錄全部 `capability: {}` ＋ `cosmeticNeutral`，由 `validateIdentityCatalog()` 硬斷言。

---

## 四、Club Progression Contract v1（提案，尚未實作）

**一個軸只能有一個權威，而且每個軸要說得出「它給玩家什麼」。**

| 軸 | 定義 | 權威 | 可消耗？ | 玩家看到什麼 |
|---|---|---|---|---|
| **Club XP / Level** | 長期遊玩進度 | `clubPointsLifetime` → `clubTierOf()` | ❌ 永不下降 | 首頁與 Club Mastery **共用同一個等級**，名稱統一 |
| **Club Points** | gameplay 賺來的可花軟貨幣 | `retention.clubPoints` | ✅ | 餘額 ＋ 買得起什麼 |
| **Honors / Titles / Badge** | 成就與社交展示 | `competition/honors.js` 的 `honors[]` | ❌ | 稱號、對手俱樂部卡上的榮耀列 |
| **Career Funds** | 球隊營運經濟 | `finance.funds` | ✅ | 營運資金 |
| **Player / Hero 成長** | 選手個體成長 | `players[]`（生涯）與 `heroProgressStore`（戰鬥） | — | 選手頁與英雄頁 |

### 由此得出的四項待辦（本輪不做）

1. **移除首頁的假 LEVEL 與 BADGE**，或把它們改接 `clubTierOf(clubPointsLifetime)` 與 `honors.length`。目前它們是死值，直接違反「每個軸要說得出它給玩家什麼」。
2. **統一「Club Level」這個詞**。現在首頁與 Club Mastery 各自叫它 Level，這是玩家困惑的直接來源。
3. **`clubPointsLifetime` 保持雙角色但要講清楚**：它同時是等級來源與購買門檻，UI 要說「花點數不會讓等級下降」（俱樂部資產頁已經有這句，`ClubAssetsScreen.jsx` 的 `club-assets-note`）。
4. **週目標門檻要對齊實際賽程供給量**（見上節）。

### Monetization boundary（現在就先立，避免以後被既成事實推著走）

- **真錢不得直接換 Career power。** Club Points 現在可以買教練，而教練有 career capability ⇒ 因此 **Club Points 不得接現金購買**。
- 未來若商業化，優先順序：
  1. **直接購買外觀**（跳過 Club Points，現金 → 外觀，外觀永遠 `capability: {}`）
  2. **cosmetic-only premium 路線**（賽季外觀通行證之類）
- 不做：現金換 Club Points、gacha、任何會把 career capability 放進付費路徑的設計。
- 本輪**沒有**實作任何付款或商城。
