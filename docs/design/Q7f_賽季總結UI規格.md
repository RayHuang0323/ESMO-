# Q7f：賽季總結 SEASON RECAP — 產品／UI 規格

> 本輪**只做規格**，不寫 production code。實作交 Codex，Claude 獨立驗收。
>
> 產品目標：Season 正式結束時，玩家應該看到一份完整的「這一季發生了什麼」，
> 而不是從最後一場比賽直接跳進下一季。
>
> **流程**：Season 完成 → Season Recap → 玩家閱讀 → **主動**按下「開始第 N+1 賽季」。

---

## A. 現有資料 audit

### A.0 audit 方法（重要：這不是讀程式碼推論出來的）

用**真實 production 路徑**把遊戲跑到「賽季已封存、尚未換季」那一刻
（`startNewGame` → `ensureCompetitionSeason` → 打完巡迴三站 → 打完年度總決賽 →
推進到 `competitionView().final` 出現），再逐一 dump 每個候選來源的實際形狀。
**玩家全勝**與**玩家全敗**兩種情境各跑一次，因為「沒晉級」那條路徑才是容易寫錯的那條。

⇒ 下表每一格都是**實測值**，不是規格願望。

### A.1 可靠、可直接用的來源

| 來源 | Recap 當下可得 | 實測形狀（重點欄位） |
|---|---|---|
| `competitionView().final` | ✅ | `SeasonSeal.v1`：`{schema, season, sealedAtDay, eventIds[5]}`　**沒有 rows** |
| `competitionView().careerFinal` | ✅ | `FinalStandings.v1` ＋ **已推導好的**：`playerRank`、`playerRegularRank`、`rankSource`（`"playoff"`／`"regular"`）、`championTeamId`、`playoffStageId`、`sourceMix{total,engine,simulated,forfeited}`、`rows[]`（含 `rank/teamId/name/tag/isAi/played/wins/losses/points/scoreDiff/regularRank`） |
| `competitionView().careerEventId` | ✅ | 指向官方聯賽 Event |
| `competitionView().circuitPoints.standings` | ✅ | `{circuitId → CircuitPoints.v1{rows[{rank,teamId,name,points,events,championships,podiums,latestEventId,latestRank}]}}` |
| `competitionView().circuitPoints.playerEntries` | ✅ | **各站逐筆**`CircuitPointsEntry.v1`：`{circuitId,eventId,rank,tier,basePoints,tierMultiplier,points,sealedAtDay}` ⇒ **各站名次與得分都現成，不必重算** |
| `competitionView().circuitPoints.slots` | ✅ | `4` |
| `competitionView().asiaFinals` | ✅ | `{exists,eventId,name,qualified[{seed,teamId,name,points,championships,podiums}],bracket[],days,done,championTeamId,final(FinalStandings 含 rows),playerTeamId}` |
| `competitionView().honorsView` | ✅ | `{all,annualChampions,latestAnnualChampion,myTeamId,myAnnualChampionCount}` |
| `competitionView().playoff` | ✅ | `{stageId,qualified[],bracket[],done,ok,order,championTeamId}` |
| `competitionView().award` | ✅ | `{ok,settled,awardId,competitionId,season,teamId,rank,amount,fundsBefore,fundsAfter,sealedAtDay}` |
| `competitionView().canRoll` | ✅ | `{ok:true, reason:null, nextSeason:2}` |
| `competitionView().events` | ✅ | 各站 `name`／`tier`（Recap 顯示站名要用） |

### A.2 ⚠ 四個會害人寫錯規格的實測發現

**① `circuitHistory` 與 `competitionHistory` 在 Recap 當下是空的。**

實測：賽季已封存、`canRoll.ok === true`，但
`circuitHistory === []`、`competitionHistory.length === 0`。
**它們只在換季（`rollToNextCompetitionSeason`）時才寫入。**
而 Recap 依定義出現在**換季之前**。

⇒ **Recap 絕對不能讀 `circuitHistory` / `competitionHistory` / `view.history`。**
巡迴結果一律讀**當季活著的** `circuitPoints`。
（原始需求寫「只讀既有 Circuit truth / history」——`history` 那半在這個時間點不存在。）

**② 沒有「賽季起始資金」這個 truth。**

`finance` 的頂層是
`funds, weeklyIncome, weeklyCost, weekly9, monthly, incomeBd, expenseBd, transactions, budget`。
沒有 `seasonStartSnapshot`，`transactions` 單筆長這樣：
`{id:"w13-base", date:"第13週", type:"income", ..., week:13}`——**只有週次，沒有 season**。

⇒ **「Season 開始／結束資金差」算不出來。**
依原始指示：**不用 transaction ledger 猜總收益**。本輪不做。

**③ 只有官方聯賽會發獎金；巡迴站與年度總決賽都不發。**

實測 `prizePolicy`：官方聯賽 `{kind:"rank_table",table:"default"}`；
巡迴春／夏／秋三站與年度總決賽**全部 `null`**。
`processedCompetitionAwards` 也確實只有一把鑰匙（官方聯賽的 final id）。

⇒ 「本季賽事獎金」= **官方聯賽名次獎金這一筆**，就是 `view.award`。
誠實寫法：`amount > 0` 顯示金額，`amount === 0` 顯示「無（前四名才有）」——
**沿用 `CompetitionScreen` 既有的誠實措辭，不要寫 `$0` 假裝有發**。
年度總決賽獎金**本輪不新增**（原始指示）。

**④ `growthLog` 是空的。**

實測 5 名球員，`players[0].growthLog.length === 0`。
球員身上有 `xp / lv / talentPoints / stats`，但**沒有任何 season-scope 的成長快照**。

⇒ **成長成果 MVP 不做。** 不為了 recap 新建一套成長 ledger（原始指示）。

### A.3 既有「開始第 N+1 賽季」入口

`src/screens/manage/CompetitionScreen.jsx:446`：

```jsx
{canRoll?.ok && (
  <button onClick={rollSeason}>▶ 開始第 {canRoll.nextSeason} 賽季</button>
)}
```

在「本季成績」Panel 的**最底部**，`rollSeason` 呼叫
`useProfileStore.getState().rollToNextCompetitionSeason()`（`:92`）。
**換季由玩家主動按、`canRoll` 由 Store 判定、畫面不自己判**——這條 Q5 規則本輪不動。

---

## B. MVP：哪些能可靠顯示、哪些暫不做

| # | 區塊 | MVP | 理由 |
|---|---|---|---|
| 1 | 賽季總覽 | ✅ 做 | `final.season` / `careerFinal.rows` 取隊名 / `sealedAtDay` |
| 2 | 官方聯賽 | ✅ 做 | `careerFinal` 已把 `playerRank`／`championTeamId`／`rankSource` 推導好 |
| 3 | 亞洲巡迴 | ✅ 做 | `standings` 給總排名與總積分，`playerEntries` 給各站名次與得分 |
| 4 | 年度總決賽 | ✅ 做 | `asiaFinals.qualified` 判資格、`asiaFinals.final.rows` 判名次 |
| 5 | 本季榮耀 | ✅ 做 | `honorsView.annualChampions` 篩本季＋本隊 |
| 6 | 經濟成果 | **⚠ 只做「已領取賽事獎金」** | 沒有賽季起始資金 truth（A.2 ②③） |
| 7 | 成長成果 | **❌ 不做** | `growthLog` 是空的（A.2 ④） |
| 8 | 下一季入口 | ✅ 做 | 沿用既有 `canRoll` ＋ `rollToNextCompetitionSeason` |

### B.1 ⚠ 本規格**不需要任何資料層改動**

上述全部欄位都已在 `competitionView()` 裡（`myTeamId` 由 Q7e 加在 `honorsView`）。

⇒ **Codex 不得修改 `profileStore.js`。** 若實作到一半覺得「少一個欄位」，
**停下回報**，不要自己加投影、也不要在 UI 算。

---

## C. 資訊架構

由重到輕，**不是一堆同權重卡片**：

```
① 年度榮耀        ← 最高層級。玩家本季奪冠時才是主角
② 年度總決賽      ← 資格 / 名次 / 世界冠軍
③ 亞洲巡迴        ← 總排名 / 總積分 / 三站
④ 官方聯賽        ← 最終名次 / 冠軍 / 季後賽
⑤ 賽事獎金        ← 一行
⑥ 開始第 N+1 賽季 ← CTA，永遠在最後
```

**賽季總覽**（第 N 賽季／玩家戰隊／已完成／一句摘要）置頂，是標頭不是卡片。

### C.1 「一句整季結果摘要」的產生規則

**必須是決定性的**，只由既有 truth 推出，**不得有任何隨機或編造**。
優先序由上而下，命中即停：

| 條件 | 摘要 |
|---|---|
| 本季 `honorsView` 有我方 `asia_annual_champion` | **「奪下亞洲年度冠軍」** |
| 我方在 `asiaFinals.final.rows` 且 `rank <= 4` | 「打進亞洲年度總決賽，最終第 N 名」 |
| 我方在 `asiaFinals.qualified` 但不在 `final.rows` | 「取得年度總決賽資格」 |
| 我方不在 `qualified`，但 `careerFinal.playerRank <= 4` | 「官方聯賽第 N 名」 |
| 其他 | 「第 N 賽季完賽」 |

⚠ 這五句是**全部**。不要加形容詞、不要依表現變語氣、不要出現「可惜」「差一點」這種評價。

---

## D. 入口 / Flow 決策

### 三個方案的取捨

| 方案 | Router | Flow state | 手機 | 能否阻止錯過 |
|---|---|---|---|---|
| 1. CompetitionScreen 結束狀態加 Recap | 不動 | 不新增 | 好 | 中 |
| 2. 獨立 SeasonRecap overlay | 不動（但要新 overlay 狀態） | **要新增** | 中 | 高 |
| 3. 「開始下一季」前插入 recap step | 不動 | **要新增** step 狀態 | 中 | 高 |

### ✅ 結論：採方案 1 的位置，方案 3 的效果

**在 `CompetitionScreen` 的賽季完成狀態下，把 Recap 展開成完整區塊，
並把既有的「開始第 N+1 賽季」按鈕移到 Recap 的最底部。**

- **不新增 Router / page**（與 Q7e 同一條紀律）
- **不新增任何 flow state**——閘門就是既有的 `canRoll.ok`，沒有第二套狀態機
- 玩家要按到下一季，**必須捲過整份 Recap**，自然達成「不會錯過」
- 手機上是單欄長頁 ＋ 底部 CTA，最好操作

⚠ **既有按鈕不得同時存在兩顆。** Recap 出現時，原本 Panel 底部那顆
「▶ 開始第 N 賽季」要**移進 Recap 底部**，不是再複製一顆。
`onClick` 仍呼叫既有 `rollSeason`，**不改 rollover 規則、不自動 rollover**。

---

## E. Desktop layout（≥ 768px）

「賽季成績單」感：一張直式成績單，不是儀表板。

```
┌──────────────────────────────────────────────────────┐
│  SEASON RECAP                          第 1 賽季 · 已完成 │
│  德國海豹                                                │
│  奪下亞洲年度冠軍                        ← 一句摘要（大字）│
├──────────────────────────────────────────────────────┤
│  🏆 年度榮耀                                            │
│     亞洲年度冠軍 · 德國海豹              ← 只有我方奪冠才出現│
├──────────────────────────────────────────────────────┤
│  亞洲年度總決賽                                          │
│     資格 取得（第 1 種子）  最終 第 1 名                   │
│     世界冠軍 德國海豹                                     │
├──────────────────────────────────────────────────────┤
│  亞洲巡迴                                               │
│     總排名 第 1 名 / 8 隊        總積分 450               │
│     ┌───────────┬──────┬──────┐                        │
│     │ 春季站      │ 第1名 │ 100  │   ← 三站一列一站        │
│     │ 夏季站      │ 第1名 │ 150  │                        │
│     │ 秋季總站    │ 第1名 │ 200  │                        │
│     └───────────┴──────┴──────┘                        │
│     年度總決賽資格 ✔ 取得（前 4 名）                       │
├──────────────────────────────────────────────────────┤
│  官方聯賽                                               │
│     最終名次 第 8 名 / 8 隊       冠軍 暗影狼群            │
│     季後賽 未進入            常規賽名次 第 8 名            │
├──────────────────────────────────────────────────────┤
│  賽事獎金  無（前四名才有）                                │
├──────────────────────────────────────────────────────┤
│              ▶ 開始第 2 賽季                             │
└──────────────────────────────────────────────────────┘
```

- 單欄縱向，**最大寬度收斂**（別把成績單拉滿 1400px）
- 區塊之間用 `1px` `GC.line` 分隔，不要每塊都做成獨立浮起卡片
- 只有 ①年度榮耀 允許明顯強調；②③④ 一律安靜
- 本輪**不做 signature visual**（第二輪再交 Codex）

---

## F. Mobile layout（390px）

- **單欄**，順序與 Desktop 完全相同（最重要在最上面）
- 巡迴三站表格改為**每站一列**的 `grid`：站名 / 名次 / 得分，
  站名可換行（`overflow-wrap: anywhere`），**不用 ellipsis 吃掉**
- 「最終名次 / 冠軍」這種左右對照在手機上維持**左標籤右值**，不要堆成兩行
- **下一季 CTA 固定清楚**：`width: 100%`、位於最底、字級不縮
- **不得水平溢出**（量 app 滾動容器，不是 `document.body`）

---

## G. Component 拆分

```
SeasonRecap.jsx              ← 容器；訂閱 store，決定顯不顯示
├─ RecapHeader.jsx           ← 第 N 賽季 / 戰隊 / 已完成 / 一句摘要
├─ RecapHonor.jsx            ← 年度榮耀（我方奪冠才 render）
├─ RecapAsiaFinals.jsx       ← 資格 / 名次 / 世界冠軍
├─ RecapCircuit.jsx          ← 總排名 / 總積分 / 三站 / 資格
│  └─ RecapCircuitStop.jsx   ← 單站一列
├─ RecapLeague.jsx           ← 官方聯賽名次 / 冠軍 / 季後賽
├─ RecapPrize.jsx            ← 賽事獎金一行
└─ RecapNextSeason.jsx       ← 開始第 N+1 賽季 CTA
```

⚠ **訂閱寫在容器 `SeasonRecap` 一處**，子元件全部走 props。
⚠ 訂閱必須訂到**真正的來源 slice**——Q7e 的教訓：訂錯 slice 時
所有導頁式 gate 都會綠。Recap 讀 `competition`（`competitionView()` 的來源）
與 `honors`（`honorsView` 的來源），**兩個都要訂**。
selector 內不得 `filter`/`map`/`sort`、不得回傳新物件。

---

## H. 每個 Component 的資料來源

全部來自 `useProfileStore.getState().competitionView()`。令 `me = honorsView.myTeamId`。

| Component | 讀什麼 |
|---|---|
| `SeasonRecap` | `final`（判斷賽季是否封存）、`canRoll` |
| `RecapHeader` | `final.season`、`careerFinal.rows.find(r => r.teamId === me).name`、C.1 摘要規則 |
| `RecapHonor` | `honorsView.annualChampions.filter(h => h.season === final.season && h.championTeamId === me)` |
| `RecapAsiaFinals` | `asiaFinals.qualified`（判資格＋種子）、`asiaFinals.final.rows.find(teamId === me).rank`（判名次）、`asiaFinals.championTeamId` ＋ `final.rows[0].name`（世界冠軍） |
| `RecapCircuit` | `circuitPoints.playerEntries`（取 `circuitId`、各站 `eventId/rank/points`）、`circuitPoints.standings[circuitId].rows`（總排名／總積分／隊數）、`circuitPoints.slots`、`events[eventId].name`（站名） |
| `RecapLeague` | `careerFinal.playerRank`、`careerFinal.rows.length`、`careerFinal.championTeamId`、`careerFinal.rankSource`、`careerFinal.playerRegularRank`、`playoff.qualified`、`playoff.stageId` |
| `RecapPrize` | `award.amount`、`award.settled` |
| `RecapNextSeason` | `canRoll.ok`、`canRoll.nextSeason`；`onClick` → 既有 `rollToNextCompetitionSeason()` |

### H.1 三條紅線（UI 不得自行做的事）

**① 不得重算。** 不重算 standings、不重算 Circuit Points、不重算 qualification、
不從 bracket 推冠軍、不從 `finance.transactions` 猜賽季收益。
`playerEntries` 已經給了各站 `points`，**不准拿 `basePoints × tierMultiplier` 自己乘**。

**② 五個 truth 不得混用。**

| truth | 意義 | Recap 用它回答 |
|---|---|---|
| `SeasonSeal.v1`（`final`） | 整季封存狀態 | 賽季是否完成、第幾季 |
| `careerFinal` | **官方聯賽**結果 | 官方聯賽名次／冠軍 |
| `circuitPoints` | **巡迴**結果 | 巡迴排名／積分／各站 |
| `asiaFinals.final` | **年度總決賽**結果 | 總決賽名次／世界冠軍 |
| `honors` | 長期榮耀真相 | 本季是否奪年度冠軍 |

⚠ **`SeasonSeal` 沒有 `rows`**（實測），任何 `final.rows` 的存取都是錯的。
⚠ **不得用 `careerFinal` 回答巡迴或總決賽的問題**，反之亦然。

**③ 不得讀 `circuitHistory` / `competitionHistory` / `view.history`**——
Recap 當下它們是空的（A.2 ①）。

**④ 不得修改任何 Season truth。** Recap 是唯讀畫面：
不呼叫 `applySealSeason`、`settleAllPendingPoints`、`_recordHonors`、
`_sealSeasonIfFinished`，唯一允許的寫入動作是玩家按下 CTA 觸發的
`rollToNextCompetitionSeason()`。

---

## I. 狀態表

| 狀態 | 條件 | 畫面 |
|---|---|---|
| **A. 賽季未完成** | `final == null` | **Recap 完全不 render**。不顯示骨架、不顯示假資料、不顯示「尚未完成」的空 Recap |
| **B. 賽季完成** | `final != null` ＋ `canRoll.ok` | Recap 可讀，底部有「開始第 N+1 賽季」 |
| **C. 未取得總決賽資格** | `me ∉ asiaFinals.qualified` | Recap **照樣完整可讀**；總決賽區塊寫「**未取得年度總決賽資格**」，並**仍然顯示世界冠軍是誰**。⚠ 缺席不是錯誤，不得顯示紅字／警告／`—` |
| **D. 玩家奪年度冠軍** | 本季 `honors` 有我方 | `RecapHonor` 出現且為**最高視覺層級**；其餘規則完全不變 |
| **E. 賽季完成但沒有巡迴** | `playerEntries` 為空 | 巡迴區塊寫「本季未參與巡迴賽」，**不顯示 0 分假榜** |
| **F. 賽季完成但沒有年度總決賽** | `asiaFinals.exists === false` | 總決賽區塊整塊不出現（legacy 舊存檔會走到這裡） |

⚠ **C 與 D 是這一輪最容易寫錯的兩格。**
C 的錯法是把「沒晉級」畫成錯誤狀態；D 的錯法是為了視覺去改資料規則。

---

## J. Browser gate 驗收清單

新增 `tools/browser_check_season_recap_ui.mjs`。沿用既有 harness
（`startDevServer` ＋ `launchChrome` ＋ `RESOLVE_APP_MODULES`），
網址**明確帶 `?asiaCircuit=1`**，不吃預設值。

需要的存檔（用 `make_save7e.mjs` 那套手法在 Node 造）：
**① 賽季進行中**（未封存）/ **② 玩家奪年度冠軍且賽季封存** /
**③ 玩家全敗、未取得資格、賽季封存**（AI 奪冠）。

| # | 檢查 |
|---|---|
| 1 | 賽季**未完成** ⇒ Recap **不存在**（`[data-testid="season-recap"]` 找不到），且畫面沒有任何賽季總結字樣 |
| 2 | 賽季**完成** ⇒ Recap 出現，且「開始第 N+1 賽季」在 Recap **內部**（不是外面另一顆） |
| 3 | 官方聯賽名次**逐值等於** `careerFinal.playerRank`，隊數等於 `careerFinal.rows.length` |
| 4 | 官方聯賽冠軍**逐值等於** `careerFinal.championTeamId` 對應的隊名 |
| 5 | 季後賽狀態與 `playoff.qualified.some(q => q.teamId === me)` 一致，且 `playoff.stageId === careerFinal.playoffStageId` |
| 6 | 巡迴總排名／總積分**逐值等於** `circuitPoints.standings[circuitId].rows` 裡我方那列的 `rank` / `points` |
| 7 | **三站名次與得分逐筆等於** `circuitPoints.playerEntries`（站數、順序、`rank`、`points` 全部比對） |
| 8 | Qualification 狀態與 `asiaFinals.qualified.some(q => q.teamId === me)` 一致 |
| 9 | 玩家參賽時，總決賽名次**逐值等於** `asiaFinals.final.rows` 裡我方那列的 `rank` |
| 10 | 玩家**未參賽**時：明確顯示「未取得年度總決賽資格」，**且仍顯示世界冠軍**，且**沒有**顯示我方名次 |
| 11 | 玩家奪冠時，榮耀區塊的賽季與隊名**逐值等於** `honorsView.annualChampions` 中本季那筆 |
| 12 | **AI 奪冠**時世界冠軍照樣顯示，且**未被標成我方** |
| 13 | **reload 後 Recap 不漂移**（同一份存檔重載，各區塊逐值相同） |
| 14 | **Recap 不修改任何 Season truth**：進入 Recap 前後，`final`／`careerFinal`／`circuitPoints.logSize`／`asiaFinals.final`／`honors`／`processedCompetitionAwards` **逐字相同** |
| 15 | 按下「開始第 N+1 賽季」⇒ 走**既有** `rollToNextCompetitionSeason`：`season` 加一、`canRoll` 變 false、**Recap 消失** |
| 16 | rollover 後新賽季正常：有賽程、`final == null`、畫面無例外 |
| 17 | **Mobile 390px 無水平溢出**（量 app 滾動容器，不是 `document.body`） |
| 18 | Mobile 下六個區塊與 CTA 都仍看得到 |
| 19 | 全程**無 uncaught exception**，Recap 內無 `undefined` / `NaN` |

### J.1 測試紀律（硬性要求，延續 Q7c–Q7e）

**每條新斷言寫完後必須做 mutation test**，至少涵蓋：

1. 把 `careerFinal.playerRank` 顯示值 `+1` ⇒ **#3 必須紅**
2. 把三站清單反向排序 ⇒ **#7 必須紅**
3. 把「是否取得資格」判斷改成永遠 `true` ⇒ **#8／#10 必須紅**
4. 把巡迴總積分改成自己用 `basePoints × tierMultiplier` 重算 ⇒ **#6 必須紅**
5. 塞一個 900px 固定寬元素 ⇒ **#17 必須紅**
6. 把容器訂閱從 `honors` 拿掉 ⇒ **需要一條「不導頁即時更新」斷言會紅**（見下）

⚠ **#14 與「訂閱」這兩類斷言，導頁式檢查沒有檢定力。**
Q7e 的教訓：訂錯 slice 時 8 條 gate 全綠，因為它們每次都重新導頁。
⇒ 至少要有一條在 **Recap 已掛載**的狀態下改 store，再要求畫面反應。

⚠ **變異必須先確認真的生效**（grep 改動後的特徵字串再跑 gate）。
Q7e 曾因錨點字串不存在，`String.replace` 靜默 no-op，差點誤判成「gate 漏檢」。
**變異沒讓 gate 變紅，先懷疑變異無效。**

⚠ **欄位斷言一律結構化讀取**（`data-*` 或指定節點文字），
不要全頁搜尋 `undefined`——React 把 `undefined` 渲染成**空白**。

⚠ **DOM 可能同時存在桌機與手機兩套佈局**。任何「數量等於 N」的斷言
都要先依 identity 去重或過濾可見性（Q7c 的正式站 smoke 曾讀到 8 張卡而非 4 張）。

---

## K. 給 Codex 的實作提示詞

```
# STEP 0 — 工作樹護欄（先做，其他都不要動）

1. cd 到指定的 Q7f worktree
2. git rev-parse HEAD 的 log 必須包含本規格的 commit
3. git status --short 必須乾淨
4. 若 cwd 落在 D:/OneDrive/文件/GitHub/ESMO 主 repo，立即停止，不得修改
5. 任一護欄不符就回報，不要自行修

# 任務：Q7f 賽季總結 SEASON RECAP（第一輪：資訊架構，不做 signature visual）

讀 docs/design/Q7f_賽季總結UI規格.md 全文。

實作 §G 的元件樹，掛在 CompetitionScreen 的賽季完成狀態（§D），
並把既有的「開始第 N+1 賽季」按鈕**移進** Recap 底部（不是複製一顆）。

## 絕對不可以做的事

- 不得修改 src/platform/profileStore.js（本規格不需要任何資料層改動，§B.1）
- 不得修改 competitionView() 的任何投影
- 不得新增 Router / page / flow state（§D）
- 不得改 rollover 規則、不得自動 rollover
- 不得重算 standings / Circuit Points / qualification，不得從 bracket 推冠軍，
  不得從 finance.transactions 猜賽季收益（§H.1 ①）
- 不得讀 circuitHistory / competitionHistory / view.history（Recap 當下是空的，§A.2 ①）
- 不得存取 final.rows（SeasonSeal 沒有 rows，實測，§H.1 ②）
- 不得做經濟總結與成長總結（資料不足，§A.2 ②④）
- 不得新增獎金、新 Honor 類型、Achievement、新賽事、Shop / MMR / Battle Engine
- 若覺得「少一個欄位」：停下回報，不要自己加投影也不要在 UI 算

## 必做

- §I 狀態表六格全部處理，特別是 C（未取得資格照樣完整可讀、缺席不是錯誤）
  與 E/F（沒有巡迴／沒有總決賽）
- §C.1 的五句摘要規則，一字不多
- 容器同時訂閱 competition 與 honors 兩個 slice，selector 不得回傳新物件（§G）
- 新增 tools/browser_check_season_recap_ui.mjs，涵蓋 §J 的 19 條
- §J.1 六個 mutation test 全做，每個都先 grep 確認變異落地，再跑 gate，事後還原

## 驗證（宣稱完成前必跑）

node tools/browser_check_season_recap_ui.mjs      # 19/19
node tools/browser_check_team_honors_ui.mjs       # 15/15
node tools/browser_check_asia_finals_ui.mjs       # 15/15
node tools/browser_check_circuit_points_ui.mjs    # 21/21
node tools/browser_check_career_final_ui.mjs      # 12/12
node tools/check_competition_q5.mjs               # 69/69
node tools/check_competition_q6.mjs               # 57/57
node tools/check_q7b_asia_finals.mjs              # 72/72
node tools/check_q7d_honors.mjs                   # 59/59
node tools/regress.mjs / regress2.mjs / npm run build

⚠ check_moba_milestone_b2 是既有紅燈（斷言 1.1 vs 2.2），與本輪無關，不要修它。

完成後 commit，不 push、不 deploy。回報：
① 護欄輸出　② git diff --stat　③ 每個區塊的資料來源與紅線如何遵守
④ 19 條逐條結果　⑤ mutation 證據（改壞什麼、證明落地、是否變紅、是否還原）
⑥ 既有驗證器前後數字　⑦ 規格中做不到的部分與原因
```

---

## L. 第二輪（本輪不做）

視覺 signature 留到第二輪再交 Codex。方向候選（**先不定案**）：
「賽季成績單」的紙本感／印章感、年度榮耀的燙金處理。
**本輪先把資訊架構與資料正確性做對**，不 over-polish。
