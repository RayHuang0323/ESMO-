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
| `competitionView().playoff` | ✅ **（A.2 ⑤ 曾誤判為不可用，已於 A.2 ⑥ 撤回）** | `{stageId,qualified[],bracket[],done,ok,order,championTeamId}` |
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

**⑤ ⚠ AUDIT CORRECTION（2026-08-16，驗收時實測發現）：`playoff` 在 Recap 當下是 `null`。**

A.1 原本把 `competitionView().playoff` 列為「✅ Recap 當下可得」，**那一格是錯的**，
與 ① 是同一族錯誤（在賽季**進行中**量到的形狀，被誤當成 Recap 當下的形狀）。

實證：`src/platform/competition/seasonState.js:1078`

```js
export function playoffView(state) {
  if (!activePlayoffOf(state)) return null;   // ← 沒有「進行中」季後賽就回 null
```

瀏覽器實測（存檔 `s7e_player_one` ＋ 封存後）：
`view.playoff === null`，但同一時刻 `careerFinal.playoffStageId ===
"stage:comp:moba:s1:official:regular:playoffs"`（有值）。

⇒ **Recap 不得依賴 `playoff.qualified` / `playoff.stageId`。**
連帶失效的規格條文：

- §E 版面圖中「季後賽 未進入」那一列 —— **本輪移除**，不顯示勝過顯示推測值。
- §H `RecapLeague` 資料來源裡的 `playoff.qualified`、`playoff.stageId` —— **刪除**。
- §J 驗收 #5 原文「季後賽狀態與 `playoff.qualified...` 一致」—— **改寫**為驗
  `careerFinal` 真的給得出的欄位（常規賽名次／排名來源／`sourceMix`），
  並鎖住「季後賽列不得再出現」。

**明確排除的兩條替代路**（2026-08-16 由使用者裁決）：
不用 `careerFinal.rankSource` 反推（語意是「名次從哪來」，不是「有沒有晉級」）；
不為這一列新增 `competitionView()` 投影或修改 `profileStore.js`（§B.1）。

**⑥ ⛔ CORRECTION：⑤ 的結論已撤回（2026-08-16，第二輪驗收時）。**

> ⚠ **⑤ 保留不刪**，因為它記錄了一個真實發生過的判斷錯誤與它的成因。
> 以下是更正，不是覆寫。

**⑤ 說「`playoff` 在 Recap 當下恆為 `null`」——那是錯的。**

錯誤來源：⑤ 的量測用的是 browser gate 的 `PLAYER_SEALED_SAVE`（下稱 **HYBRID**），
那是把 `s7e_player_one` 的 `competition` 接上 `s7b_season_sealed` 的 `final`
拼出來的合成存檔。那份 competition 的季後賽**從來沒打過**，
所以 `activePlayoffOf(state)` 為 falsy、`playoffView()` 回 `null`。
⑤ 從**這一個樣本**的 null 推論成「Recap 時點恆為 null」——**以偏概全**。

以 canonical 的 `s7b_season_sealed`（真的跑完並封存）實測：

| 欄位 | `s7b_season_sealed`（canonical） | HYBRID（合成） |
|---|---|---|
| `final` 已封存 | ✅ | ✅ |
| `canRoll.ok` | ✅ | ✅ |
| `playoff` | **非 null** | null |
| `playoff.stageId` | `stage:comp:moba:s1:official:regular:playoffs` | null |
| `playoff.done` | `true` | — |
| `playoff.qualified` | 四隊齊全 | — |
| `careerFinal.playoffStageId` | 同上 | 同上 |
| **`playoff.stageId === careerFinal.playoffStageId`** | **✅ true** | ❌ false |

⇒ **§J 原本的驗收 #5（`playoff.stageId === careerFinal.playoffStageId`）本來就成立**，
它當初會紅，根因是 HYBRID fixture 內部不一致，不是產品拿不到資料。

**因此（2026-08-16 使用者裁決）：**

- `RecapLeague` **加回季後賽列**，直接讀既有 `playoff.qualified` / `playoff.stageId`
- **不用** `careerFinal.rankSource` 反推（語意是「名次從哪來」，不是「有沒有晉級」）
- **不改** `profileStore.js`、不新增投影
- 未晉級用**中性語氣**：與其他列相同字色，不上紅、不加警示、不降透明度
- `playoff` 為 `null` 時（季後賽從未產生）**整列不出現**，不顯示推測值

⚠ **教訓（比結論本身更重要）**：⑤ 的推理鏈是「函式在 X 條件下回 null」＋
「一個樣本是 null」⇒「恆為 null」。前兩步都對，第三步是**過度概括**。
**驗證「某欄位不可用」時，樣本必須是 canonical 的生命週期狀態**，
不能用測試用的合成存檔——合成存檔的缺失反映的是 fixture，不是產品。

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

### D.1 ⚠ 結構決策（2026-08-16 由使用者裁決）：舊 Panel 由 Recap **正式取代**

本節原文只寫「把按鈕移進 Recap」，未交代舊的「最終名次 FINAL STANDINGS」Panel
去留。實作把整個 Panel 移除了，**裁決結果是維持移除**：賽季結束畫面不應該
把同一份官方聯賽結果顯示兩次（Recap 的官方聯賽區塊已完整涵蓋）。

⇒ **`RecapLeague` 必須完整承接舊 Panel 的產品語意**（缺一不可）：

| 舊 Panel 的事實 | Recap 承接位置 |
|---|---|
| 玩家官方聯賽最終名次 | `recap-league-rank` 的 `data-rank` 與可見文字 |
| 總隊數 | `recap-league-rank` 的 `data-team-count` |
| 聯賽冠軍 | `recap-league-champion` 的 `data-team-id` 與隊名 |
| 名次獎金 | `recap-prize`（格式 `+$N萬`／「無（前四名才有）」／「—」） |
| `sourceMix`：本季場次／實際對戰／模擬／棄權 | `recap-league-source-mix` 的四個 `data-*` 與文字 |
| `careerFinal` 缺失時顯示「—」與說明 | `recap-league-rank` 顯示「—」＋ `recap-league-empty` 說明 |
| 封存日 | `recap-sealed-day`（讀 **SeasonSeal** 的 `sealedAtDay`） |

### D.2 ⚠ CTA 位置修訂（2026-08-16 第二輪，使用者裁決）

§D 原本要求「CTA 移進 Recap 最底部」。第二輪人眼 review 發現：
CTA 之後畫面還有**四個面板**（季後賽對戰表／下一場賽事／最終積分榜／賽季進度），
所以「Season Report 的句點」只在 **Recap 元件內部**成立，**在整個畫面上不成立**。

⇒ **修訂：CTA 移到整頁最後，成為已封存 `CompetitionScreen` 真正最後一個主要操作。**

| 規則 | 內容 |
|---|---|
| 順序 | Season Recap 在上 → 本季補充資訊（季後賽對戰表／最終積分榜／賽季進度）→ **CTA 最後** |
| 「下一場賽事」面板 | 封存狀態下**只剩「本季你的比賽都打完了」時隱藏**；仍有待打場次時照常顯示（不替 Store 假設封存後一定沒場次） |
| 元件責任 | **不把舊面板塞進 `SeasonRecap`**。`SeasonRecap` 只做成績單；`RecapNextSeason` 元件不變，改由 `CompetitionScreen` 在檔尾渲染 |
| 唯一性 | CTA 的渲染條件與 `SeasonRecap` 內部完全一致（`final` ＋ `canRoll.ok`）⇒ **DOM 只會有一顆** |
| rollover | `rollSeason` handler 與 Q5 的「換季由 Store 判、畫面不自己判」**完全不變** |

⚠ **§J #2 的 `ctaInside` 語意隨之遷移**：從「CTA 在 Recap 內」改為驗**文件順序**——
CTA 必須排在成績單、季後賽對戰表、最終積分榜、賽季進度**全部之後**，
且全 DOM 恰好一顆，另加「封存時不得殘留只寫『本季比賽都打完了』的空話面板」。
用 `compareDocumentPosition` 判定。**這是加強不是放寬**：
把 CTA 移回中間任何位置、或複製第二顆，都會讓 #2 紅（已用 mutation 驗證）。

⚠ **§V 契約補充**：`recap-next-season` / `recap-next-season-cta` 已**不在** `season-recap` 內。
任何以「在 Recap 內查找」為前提的斷言都要改用整份文件查找（`browser_check_season_recap_ui`
的 #18 已同步修正）。

⇒ **既有 verifier 的 selector / DOM contract 隨產品結構遷移**，
受影響的是 `browser_check_career_final_ui` 的 #1／#3／#6 與
`browser_check_asia_finals_ui` 的 #11。四條斷言**一條都沒刪、守的事實一件都沒少**，
只是不再以「舊 Panel 標題是否存在」為成功條件，改在 Recap 上驗**相同產品事實**，
並把原本的字串比對升級為 `data-*` 逐值比對（例如原版用 `includes(String(rank))`
比數字，第 8 名時「8」可能被別處文字誤中；遷移後不會）。
**這是結構遷移，不是弱化斷言** —— 已用三項 mutation 證明：
拿掉名次欄位 ⇒ #1／#3 紅；拿掉「—」與說明 ⇒ #6 紅；
把 `careerFinal` 換成 SeasonSeal `final` ⇒ #3／#6 紅。

---

## E. Desktop layout（≥ 768px）

「賽季成績單」感：一張直式成績單，不是儀表板。

```
┌──────────────────────────────────────────────────────┐
│  SEASON RECAP              第 1 賽季 · 已完成 · 第 98 天封存 │
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
│     常規賽名次 第 8 名                                    │
│     本季 14 場：實際對戰 2 · 模擬 12   ← Q4 既有註腳，保留   │
│     ⚠「季後賽」那一列已移除（A.2 ⑤：playoff 當下為 null）  │
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
| `RecapHeader` | `final.season`、`final.sealedAtDay`（**SeasonSeal 那一份**，不是 `careerFinal.sealedAtDay`）、`careerFinal.rows.find(r => r.teamId === me).name`、C.1 摘要規則 |
| `RecapHonor` | `honorsView.annualChampions.filter(h => h.season === final.season && h.championTeamId === me)` |
| `RecapAsiaFinals` | `asiaFinals.qualified`（判資格＋種子）、`asiaFinals.final.rows.find(teamId === me).rank`（判名次）、`asiaFinals.championTeamId` ＋ `final.rows[0].name`（世界冠軍） |
| `RecapCircuit` | `circuitPoints.playerEntries`（取 `circuitId`、各站 `eventId/rank/points`）、`circuitPoints.standings[circuitId].rows`（總排名／總積分／隊數）、`circuitPoints.slots`、`events[eventId].name`（站名） |
| `RecapLeague` | `careerFinal.playerRank`、`careerFinal.rows.length`、`careerFinal.championTeamId`、`careerFinal.rankSource`、`careerFinal.playerRegularRank`、`careerFinal.sourceMix`、**`playoff.qualified`／`playoff.stageId`**（A.2 ⑥ 撤回 ⑤ 之後恢復；`playoff` 為 null 時整列不出現） |
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
| 5 | ⚠ **2026-08-16 兩次修訂**（先依 ⑤ 移除 `playoff.*`，再依 ⑥ 撤回並恢復）：**季後賽**——`playoff` 存在時 `data-qualified` 逐值等於 `playoff.qualified.some(q => q.teamId === me)`、`data-stage-id` 逐值等於 `playoff.stageId` 且等於 `careerFinal.playoffStageId`；`playoff` 為 null 時整列不得出現。**常規賽名次**逐值等於 `careerFinal.playerRegularRank`（為 null 時改驗排名來源等於 `careerFinal.rankSource`）。**場次組成**四個數逐值等於 `careerFinal.sourceMix`。**賽事獎金**文字符合既有格式（`+$N萬`／「無（前四名才有）」／「—」）。⚠ 季後賽兩側都要驗——**有 `playoff` 的樣本必須是 canonical sealed 存檔**，HYBRID 驗不到（A.2 ⑥） |
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

### J.2 ⚠ AUDIT CORRECTION（2026-08-16，驗收實跑後）

上面六項變異裡，**有兩項本身的假設是錯的**，照原文做會得到綠燈並被誤讀成「gate 漏檢」。

**① 第 4 項（`basePoints × tierMultiplier` 重算）永遠不會紅——這是正確的。**

實測兩份存檔（`s7e_player_one`／`s7b_season_sealed`）：
`playerEntries` **逐筆** `points === basePoints × tierMultiplier`，
玩家三站加總分別是 450／150，與重算結果**逐值相同**。
⇒ 這個變異不產生任何可觀察差異，#6 不紅是對的，**不是漏檢**。
要證明 #6 真的讀 `standings`，改用**必然發散**的對照組：
只加總 `basePoints`（450 → 300）⇒ #6 紅。**已實測**。

**② 第 5 項（塞 900px 元素）要塞對位置，否則被自己裁掉。**

`recapStyles.shell` 有 `overflow: "hidden"` ⇒ 塞在 Recap **內部**的 900px 子元素
會被裁切，撐不開 app 捲動容器，#17 不紅。
正確做法是讓 **Recap 外框自身**變成 900px（`shell.minWidth: 0 → 900`）——
它是相對於捲動容器的溢出來源，裁不到自己。**已實測 #17 紅**。

**③ 第 3 項需要反向樣本，否則 #8 沒有鑑別力。**

`s7e_player_one` 裡玩家**本來就已取得資格** ⇒「資格判斷永遠 `true`」不產生差異，
#8 全綠。這是 **gate 的真缺口**，不是變異無效。
已補強 #8：同時驗 AI 存檔（玩家**未**取得資格）那一側 ⇒ 雙向都有鑑別力，
「永遠 true」與「永遠 false」現在都抓得到。**補強後 19/19 仍成立，且變異確實變紅。**

⇒ 通則：**變異落地了但 gate 沒紅，有三種可能**——(a) gate 漏檢、
(b) 變異在該情境下不產生可觀察差異（無鑑別力）、(c) 變異被其他機制中和。
**先分辨是哪一種再下結論**，不可預設是 (a)。

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

## L. 第二輪（第一輪不做）

視覺 signature 留到第二輪。第一輪先把資訊架構與資料正確性做對，不 over-polish。
⇒ **第二輪規格見下方附錄**（2026-08-16 定案，signature 為「賽季成績單 SEASON REPORT」）。

---
---

# 附錄：第二輪視覺 Polish 規格

> 定案於 2026-08-16。**第一輪的資訊架構與資料正確性不得更動**——
> 本附錄只談 typography、spacing、hierarchy、色彩層級。
>
> ⚠ 本輪**不改**：資料來源、`SeasonSeal`／`careerFinal`／Circuit Points／Honors 語意、
> `profileStore.js`、rollover handler、以及 §V 列出的 browser contract。

## Q. 設計限制（先讀，這決定了 signature 只能長什麼樣）

`src/ui/theme.js` 是唯一色票來源，**全部家當只有這些**：

```
bg #0a0b0f   card #13151c   card2 #1a1d26   line rgba(255,255,255,0.08)
gold #fbbf24   purp #a78bfa   blue #3b82f6   green #34d399   red #ef4444   gray #71717a
FONT = system-ui   MONO = ui-monospace
```

⇒ **沒有 display face、沒有新色**。personality 不能靠字體或色彩取得，
只能靠**字級對比、字距、留白節奏、線條權重、以及 MONO／FONT 的角色紀律**。

⚠ **Q7e 已經用掉「刻線／壓印金屬質感」**（獎盃銘板牆）。
第二輪**不得重複那套語彙**，否則兩個畫面會長得一樣，Q7e 的 signature 也被稀釋。

## R. Signature：**封存線（The Seal Rule）**

整份 Recap 只有**一個**要被記住的東西：頁首那條**封存線**。

理由來自資料本身——賽季封存的真相物件就叫 `SeasonSeal`，欄位就叫 `sealedAtDay`。
「這一季已經闔上了」不是形容詞，是 Store 裡的事實。⇒ 用**一條線**把它畫出來。

| 元素 | 規則 |
|---|---|
| 眉標 | `SEASON REPORT`，9px，`letterSpacing: 0.28em`，`GC.gray`，900 |
| 賽季標記 | `S{season}`，**`MONO`**，30px（手機 26），900，`letterSpacing: -0.02em`，近白 |
| 封存戳記 | 與賽季標記**同一基線**：`已完成` ＋ `第 {sealedAtDay} 天封存`，10.5px `MONO`，`GC.gray` |
| 戰隊名 | 23px（手機 20），900，`FONT`，純白，`overflowWrap: anywhere` |
| **封存線** | **全頁唯一一條 2px 橫線**（其餘一律 1px `GC.line`），色 `rgba(255,255,255,0.14)`，橫跨標頭全寬 |
| 一句摘要 | 封存線**之下**，15px（手機 14），800 |

⚠ **封存線是全頁唯一的 2px 線。** 任何其他地方出現 2px 以上的線就破壞了這個 signature——
那條線的意義是「這一季到此為止」，重複使用就變成裝飾。

### R.1 允許的唯一一段動態

封存線在掛載時 `transform: scaleX(0) → scaleX(1)`，`transformOrigin: left`，
240ms `ease-out`。**只有這一段**。

- 必須包在 `@media (prefers-reduced-motion: reduce)` 的保護下（該情境直接顯示完成狀態）
- **不得**有進場動畫、數字滾動、卡片淡入、hover 位移
- 動畫**不得**改變版面尺寸（`scaleX` 不觸發 reflow ⇒ 不會影響 gate #17）

## S. 結構裝置：**層級階梯（Scope Ladder）**

六個區塊**不是同權重**。它們有一條真實存在的遞降軸——**賽事層級**：

```
年度榮耀        年度最高榮耀      ← 一年只有一個
亞洲年度總決賽   洲際冠軍賽
亞洲巡迴        洲際巡迴（三站）
官方聯賽        國內聯賽
賽事獎金        結算
```

從「世界」收束到「你的帳戶」。⇒ 用**左緣線條權重**把它編碼：

| 區塊 | 眉標（靜態文字，非推導資料） | 左緣線 | 標題字級 | 上方留白 |
|---|---|---|---|---|
| 年度榮耀 | `年度最高榮耀` | **3px `GC.gold`** | 15 | 26 |
| 亞洲年度總決賽 | `洲際冠軍賽` | 2px `rgba(255,255,255,0.14)` | 13 | 22 |
| 亞洲巡迴 | `洲際巡迴` | 1px `GC.line` | 13 | 20 |
| 官方聯賽 | `國內聯賽` | 1px `GC.line` | 13 | 20 |
| 賽事獎金 | `結算` | 無左緣線 | 11.5 | 16 |

⚠ **這不是 01 / 02 / 03 編號。** 這些區塊不是流程步驟，順序編碼的是**重要性**不是次序，
所以用**層級名稱**當眉標，不用序號。

⚠ 玩家沒奪冠時 `RecapHonor` 不 render，階梯**從洲際冠軍賽開始**。
各區塊的權重是**絕對值**（照上表），不隨是否奪冠重新分配 ⇒ 報告的形狀恆定，
奪冠只是**多長出最上面那一階**。這樣才不會讓「沒奪冠」看起來像缺了東西。

## T. 色彩紀律：**尺寸屬於標頭，顏色屬於榮耀**

這是本輪最重要的一條，它同時滿足「頁首要有收束感」與「年度榮耀是唯一最高層級」：

- **標頭拿走尺寸**：`S{season}` 是全頁最大的字。
- **榮耀拿走顏色**：`GC.gold` 是全頁最強的訊號。

⇒ 兩者在**不同軸**上競爭，不互相削弱。年度榮耀不需要比標頭大就已經是視覺焦點。

### T.1 金色的使用上限

`GC.gold` 在整個 `seasonRecap/` 只允許出現在**兩個地方**：

1. `RecapHonor` 區塊內（左緣線、眉標、榮耀標題、隊名、極低透明度底色）
2. `RecapHeader` 的一句摘要——**且僅當該句是「奪下亞洲年度冠軍」時**

⚠ 沿用 Q7e 的紀律：**任何金色都必須追溯得到「這是玩家的」**。
「世界已有冠軍」≠「玩家有冠軍」。
⇒ `RecapHeader` 的摘要要新增 `data-champion="true|false"`（**唯一允許的新增屬性**），
金色與它同步。gate 會驗這件事（§W）。

**其餘顏色維持既有語意**，不得擴張：
`GC.green` 只用於正向數值（積分、已取得資格、有獎金）；
`GC.purp` 只用於 CTA；未取得資格用 `GC.gray` **不用 `GC.red`**（缺席不是錯誤，§I 狀態 C）。

## U. 版面

### U.1 Desktop（≥768px）

```
┌────────────────────────────────────────────────┐
│  SEASON REPORT                                 │  ← 9px / 0.28em
│                                                │
│  S1        已完成 · 第 98 天封存                 │  ← 30px MONO ＋ 10.5px MONO
│  德國海豹                                       │  ← 23px
│  ══════════════════════════════════════════    │  ← 封存線（全頁唯一 2px）
│  奪下亞洲年度冠軍                                │  ← 15px，奪冠時金色
│                                                │
│ ┃年度最高榮耀                                    │  ← 3px 金左緣
│ ┃🏆 亞洲年度冠軍                                 │
│ ┃  德國海豹                                     │
│                                                │
│ ┃洲際冠軍賽                                      │  ← 2px 左緣
│ ┃ 資格            取得（第 1 種子）               │
│ ┃ 最終名次        第 1 名                        │
│ ┃ 世界冠軍        德國海豹（我方）                 │
│                                                │
│ │洲際巡迴                                        │  ← 1px 左緣
│ │ 總排名          第 1 名 / 8 隊                  │
│ │ 總積分          450 分                         │
│ │  春季站 ······· 第 1 名 ······· 100 分          │
│ │  夏季站 ······· 第 1 名 ······· 150 分          │
│ │  秋季總站 ····· 第 1 名 ······· 200 分          │
│ │ 年度總決賽資格   取得（前 4 名）                  │
│                                                │
│ │國內聯賽                                        │
│ │ 最終名次        第 8 名 / 8 隊                  │
│ │ 冠軍            暗影狼群                       │
│ │ 常規賽名次       第 8 名                        │
│ │ 本季 14 場：實際對戰 2 · 模擬 12                 │
│                                                │
│  結算                                           │  ← 無左緣線
│  賽事獎金         無（前四名才有）                 │
│  ────────────────────────────────────────      │
│         ▶ 開始第 2 賽季                          │  ← 句點
└────────────────────────────────────────────────┘
```

- **單欄、最大寬度收斂至 `maxWidth: 560px` 並置中**。成績單不是儀表板，
  不要拉滿容器寬（第一輪漏了這條，`shell` 目前只有 `width:100%`）。
- **區塊之間只用留白與左緣線分隔，不做浮起卡片**：不新增 `borderRadius`、
  不新增 `box-shadow`、不給各區塊自己的 `background`
  （唯一例外：`RecapHonor` 的極低透明度金色底）。
- 三站那三列可用**點狀 leader**（`border-bottom: 1px dotted`）連接站名與數值——
  這是成績單的語彙，不是裝飾。⚠ 手機下若造成擁擠則移除，不得為了 leader 犧牲可讀性。

### U.2 Mobile（390px）

| 項目 | 規則 |
|---|---|
| 欄數 | 單欄，順序與 Desktop **完全相同** |
| 閱讀順序 | 先看到本季最重要成果（標頭摘要 → 年度榮耀），再向下讀完整成績，CTA 最後 |
| 字級 | `S{season}` 30→26、戰隊名 23→20、摘要 15→14；**其餘不縮** |
| 左緣線 | 權重不變（3/2/1px 不影響寬度） |
| 標題列 | 眉標與標題**允許換行**，不得 ellipsis 吃掉 |
| 三站 | 維持第一輪已驗過的三欄 `grid`（`minmax(0,1fr) minmax(60px,auto) minmax(52px,auto)`） |
| CTA | `width: 100%`、位於最底、**字級不縮** |
| 溢出 | **不得水平溢出**（量 app 捲動容器，不是 `document.body`） |

⚠ `recapStyles.shell` 的 `minWidth` **必須維持 0**。
mutation 5b 已證明改成 900 會讓 gate #17 紅——那條線是活的，別碰。

⚠ `shell` 的 `overflow: hidden` 維持，但**不得拿它來遮蓋做壞的版面**：
gate #18 會驗六個區塊都看得見。

## V. ⚠ Browser contract：**這些絕對不能動**

視覺調整最容易踩的地雷。以下 `data-testid` 與 `data-*` 是 **19 + 12 + 15 條斷言的錨點**，
改名、刪除、或改變巢狀關係都會讓 gate 紅：

| 元素 | 必須保留的屬性 |
|---|---|
| `season-recap` | `data-season` |
| `recap-header` | `data-season`、`data-sealed-day` |
| `recap-sealed-day` | `data-day` |
| `recap-team-name` / `recap-summary` | （文字內容即斷言值）＋摘要新增 `data-champion` |
| `recap-honor` | `data-season`、`data-team-id`、`data-honor-type` |
| `recap-finals-qualification` | `data-qualified`、`data-seed` |
| `recap-finals-player-rank` | `data-rank` |
| `recap-finals-champion` | `data-team-id`、`data-player-champion` |
| `recap-circuit` | `data-has-circuit`、`data-circuit-id` |
| `recap-circuit-summary` | `data-rank`、`data-points`、`data-team-count` |
| `recap-circuit-stops` / `recap-circuit-stop` | `data-stop-count` ／ `data-event-id`、`data-circuit-id`、`data-rank`、`data-points` |
| `recap-circuit-qualification` | `data-qualified`、`data-slots` |
| `recap-circuit-empty` / `recap-league-empty` | （存在性即斷言） |
| `recap-league-rank` | `data-rank`、`data-team-count` |
| `recap-league-champion` | `data-team-id` |
| `recap-league-regular-rank` / `recap-league-rank-source` | `data-rank` ／ `data-rank-source` |
| `recap-league-source-mix` | `data-total`、`data-engine`、`data-simulated`、`data-forfeited` |
| `recap-prize` / `recap-prize-value` | `data-amount`、`data-settled` |
| `recap-next-season` / `recap-next-season-cta` | （CTA 必須**在** `season-recap` 內且全 DOM 恰好一顆） |

### V.1 ⚠ 最容易被視覺改動踩爛的一條

`browser_check_career_final_ui` 與 `browser_check_asia_finals_ui` 用
**`querySelector("span:last-child")`** 讀 `recap-league-rank`／`recap-league-champion`／
`recap-finals-champion` 的**值**。

⇒ **值必須維持是該節點的最後一個 `span` 子元素。**
在值後面加圖示、加單位 `<span>`、或把值包進新的 wrapper，都會讓四條遷移過的斷言紅。
要加裝飾就加在**值 span 內部**，不要加在它後面。

## W. 第二輪 gate 與 mutation test

**不新增 gate 條目**（維持 19 / 12 / 15），只在既有條目內補視覺紀律的斷言：

- **#2** 追加：`recap-summary` 的 `data-champion` 與「本季 honors 有我方」一致。

### W.1 必做 mutation（每個都先 grep 確認落地再相信紅燈）

| # | 變異 | 必須紅 |
|---|---|---|
| 1 | 把任一 `data-testid` 改名 | 對應 gate 紅（證明 contract 是活的） |
| 2 | 在 `recap-league-champion` 的值 span **後面**再加一個 span | `career_final` #1／#3 紅（§V.1） |
| 3 | `shell.minWidth` 0 → 900 | `season_recap` #17 紅（回歸保護） |
| 4 | 讓摘要**無條件**上金色（`data-champion` 恆 true） | `season_recap` #2 紅（金色紀律） |
| 5 | 拿掉 `RecapHonor` 的左緣金線與底色 | **不要求紅**——純視覺，gate 本來就不該管；列在這裡是提醒**人眼**要看 |

⚠ 第 5 項點出一件事：**視覺品質本身沒有自動化防護。**
⇒ 第二輪交付**必須**附 Desktop 與 Mobile 390px 的 headed 截圖，人眼 review。

### W.2 完整驗證（宣稱完成前必跑）

```
node tools/browser_check_season_recap_ui.mjs   # 19/19
node tools/browser_check_career_final_ui.mjs   # 12/12
node tools/browser_check_asia_finals_ui.mjs    # 15/15
node tools/browser_check_team_honors_ui.mjs    # 15/15
node tools/browser_check_circuit_points_ui.mjs # 21/21
node tools/verify.mjs                          # 21/29（8 個既有紅燈見 05_Sprint紀錄）
```

## X. 明確不做

- ❌ **不做紙本感／米色紙／襯線體／印章圖樣**。那是把亮色印刷品硬套進深色 UI，
  而且會撞上目前 AI 設計最常見的那套預設（米色紙＋高對比襯線＋陶土色）。
- ❌ **不做六張浮起卡片**（§1 明文禁止，且主幹已經到處都是 Panel）。
- ❌ **不做大數字＋漸層 hero**。Recap 沒有單一英雄數字，硬造一個就是為了視覺而選資料。
- ❌ **不做 01/02/03 章節編號**（§S：順序編碼的是重要性不是次序）。
- ❌ **不重複 Q7e 的刻線／壓印金屬質感**（§Q）。
- ❌ **不做失敗畫面**。沒奪冠不是失敗，不得有紅字、灰掉、降透明度、或「可惜」類文案。
- ❌ **不新增資料、不自己推導結果**。摘要仍是 §C.1 那五句，一字不多。
- ❌ **不新增色票**。`GC` 以外只允許既有色的 alpha 變體，且要在檔頭註明理由。

## Y. 給 Codex 的實作提示詞

```
# STEP 0 — 工作樹護欄

1. cd 到 Q7f worktree（q7b2）
2. git log 必須包含 completion commit 104881e
3. git status --short 必須乾淨
4. 若 cwd 落在 D:/OneDrive/文件/GitHub/ESMO 主 repo，立即停止
5. 任一護欄不符就回報，不要自行修

# 任務：Q7f 第二輪視覺 Polish（signature：賽季成績單 SEASON REPORT）

讀 docs/design/Q7f_賽季總結UI規格.md 的**附錄全文**（§Q–§X）。

只改 src/screens/manage/seasonRecap/ 底下的檔案（含 recapStyles.js）。

## 絕對不可以做的事

- 不得改 src/platform/profileStore.js（一行都不行）
- 不得改任何資料來源、truth 語意、rollover handler
- 不得改 §V 列出的任何 data-testid / data-* 屬性
- 不得破壞 §V.1 的 span:last-child 結構
- 不得新增 Router / page / flow state
- 不得新增色票（GC 以外只允許既有色的 alpha 變體，且檔頭註明理由）
- 不得為了視覺去改摘要文案、名次、積分、資格判斷
- 不得動 tools/ 底下任何 verifier

## 必做

- §R 的封存線（全頁唯一 2px）與 R.1 的唯一一段動態（含 reduced-motion 保護）
- §S 的層級階梯（眉標＋左緣線權重，照表逐項）
- §T 的色彩紀律：金色只出現在兩個地方，摘要新增 data-champion
- §U 的 maxWidth 560 收斂、不做浮起卡片
- §U.2 的手機字級與不溢出
- §W.1 的四個 mutation（第 5 項是人眼項，不用自動化）

## 驗證（宣稱完成前必跑，見 §W.2）

完成後 commit，不 push、不 deploy。回報：
① 護欄輸出　② git diff --stat　③ §V 的 contract 逐項確認未動
④ 五支 browser gate 的數字　⑤ mutation 證據（改壞什麼、證明落地、是否紅、是否還原）
⑥ Desktop 與 Mobile 390px 的 headed 截圖　⑦ 做不到的部分與原因
```

## Z. 設計自我批判（為什麼是這個方案，不是別的）

方法論要求先產生方案再對照「這會不會是任何類似題目都會產出的預設答案」。
以下是被否決的方向與理由：

| 被否決的方向 | 為什麼否決 |
|---|---|
| 米色紙＋襯線體＋印章 | 目前 AI 設計三大預設之一；且與深色 UI／`GC` 正面衝突 |
| 六張各自 elevation 的卡片 | 使用者 §1 明文禁止；主幹已經 Panel 過載 |
| 大數字＋漸層 accent | 方法論點名的「模板答案」；Recap 沒有單一英雄數字 |
| 01/02/03 章節編號 | 這些區塊不是流程；序號會謊稱有次序關係 |
| 重複 Q7e 的壓印金屬感 | signature 已經花在那裡，重複會讓兩個畫面難以分辨 |
| 整頁鍍金慶祝奪冠 | 使用者 §3 明文禁止；且會讓沒奪冠的版本看起來像壞掉 |

**保留的一個風險**：把 `S{season}` 設成全頁最大的字（30px MONO），
比戰隊名、比年度榮耀都大。直覺上會覺得該讓冠軍最大。
理由是 §T——**這是一份記錄，記錄的身分是賽季**；榮耀靠**顏色**取得最高層級，
標頭靠**尺寸**取得收束感，兩者在不同軸上，不互相削弱。
若實作後人眼 review 覺得標頭壓過了榮耀，**先調標頭尺寸，不要往榮耀加金色**。
