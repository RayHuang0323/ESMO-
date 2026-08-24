# ESMO Season vNext — 長期生涯與競賽框架（設計提案）

> **狀態：設計已裁決（2026-08-25）— READY FOR IMPLEMENTATION。**
>
> · **Q2 / Q3 已 FINAL**（見 §13）
> · **Career Year = 12 週 / 84 天 = MVP baseline，不是永久 balance freeze**
> · 其餘 balance 數值仍為 **PROPOSED / NOT FROZEN**，由 V0A+V0B 的 calibration 決定
> · **公式常數一律不在本文件鎖定**——本文件只鎖**產品驗收目標**
>
> 本輪只做設計，**沒有修改任何 `src/` 產品碼**，也未開始 implementation。
>
> 日期：2026-08-25　基準 commit：`c7fa423`（＝ `origin/main`）
> 量測腳本：`tools/season_vnext_calibration.mjs`（設計工具，非 verifier、不進 CI）

---

## 0. 一句話

Season vNext 不是「每季 +1 歲」，而是**把世界時間變成一種會被消耗的資源**，
讓成長、年齡、巔峰、衰退、世代交替共用同一個時鐘。

---

## 1. 現況 Audit

### 1.1 世界時鐘

| 事實 | 位置 |
|---|---|
| `meta.days` 是唯一時間來源；week / season 全由它導出 | `economy/timeline.js → deriveTime()`，`DAYS_PER_WEEK=7`、`WEEKS_PER_SEASON=12` |
| 唯一的時鐘推進者是 `profileStore.advanceDay(n)` | `profileStore.js → advanceDay` |
| **正式 UI 只有一個入口能推進時間**：訓練中心「推進訓練日」，且要求「至少一人在訓練」 | `screens/manage/TrainingScreen.jsx → advance()` |
| **打比賽完全不推進日曆**——結算只「讀」`meta.days` | `progress/applyMatchProgress.js` |

> 🔴 **這是「凍齡刷素質」的結構性缺口，而且現在就已經存在**：
> 玩家可以完全不推進日曆，無限打自由對戰累積 XP → 升級 → `applyLevelGrowth` 永久成長。
> 世界時間一天都不會走。

### 1.2 已經有兩套「賽季」，而且是刻意的

```
meta.season          ← 由 meta.days 導出的「經濟週期」，12 週一輪
competition.season   ← 賽事賽季，自己 +1，錨在建立當天 (startDay)
```

`seasonState.js` 明文：「**賽季編號自己 +1，不讀 `meta.season`**……兩者本來就會逐季偏移」。

`rollToNextSeason()` 是**玩家手動按**（`RecapNextSeason` CTA，不自動），
且註解明寫「**選手、資金、成長、贊助合約完全不碰**」——它只換容器。

> ⇒ **Career Clock 絕對不能掛在 rollover 上**，否則玩家不按就永遠不老。
> 這一條要做成 verifier sentinel。

### 1.3 永久成長：兩套公式，只有一套認年齡

| 來源 | 公式 | age？ |
|---|---|---|
| Training v1.1 | `課程gain × potentialSpace × ageEfficiency × learning × condition` | ✅ |
| 升級成長（P0） | `pointsPerLevel 3.0 × 潛力空間(roomFull 25) × 定位權重 5/4/3/2/1`，`perStatCap 1.5`、`hardCap 99` | ❌ **完全沒有** |
| CS Learning（R55） | `learningMultiplierFor()` 只乘 **XP**，不碰 stats | n/a |

### 1.4 生命週期：全部是 placeholder

- `careerStageOf()` 讀 `careerStage / lifecycleStage / career.stage`，
  **種子選手三個欄位都沒有** ⇒ 永遠回「未啟用」。純呈現層，**零邏輯**。
- Legacy `EsportsGame.jsx → agePlayerOneSeason()` 有**可參考的既有做法**：
  age+1；體能項（reflex/apm/accuracy/positioning）26 歲起 −1/−2/−3（地板 38）、≤23 歲 +1；
  心智項（tacticalIQ/leadership/decision/comms/mapAware/clutch）≤31 歲 +1（上限 97）。
  **體能／心智分離是現成的好骨架。**

### 1.5 AI 與新人：存在但靜態

- `aiTeams.js` 明文「**賽季內 roster 靜態**」「賽季交替的年齡曲線留待後續」。
  AI 選手**刻意不進 `players[]`**（否則週結算會付他們薪水）。
- `genProspects(seed)` 已能決定性生成 40 名新秀（age 16–23、potential 42–96），
  但 **seed 是 `RecruitScreen` 的 `useState(7)`——UI 本地狀態、不持久、不隨世界時間變**。

### 1.6 共用 vs 分離

- **共用**：`players[]`、`finance`、`meta.days`、`meta.seasonSeed`、`team`
- **分離**：`competitionByMode.{moba,cs}` 各自賽季、各自季號

> ⇒ 世界時鐘天生就是共用的。**Multi-Title 的地基已經在了。**

### 1.7 經濟耦合

週結算冪等鍵 = 累計週次（`deriveTime().week`，跨賽季不重置）；
贊助 `weeksLeft` 每週 −1；`fansAtStart` 每季快照；`seasonFanAwardOf(final)` 封存時發。

---

## 2. 模擬結果（實跑，非估算）

腳本用主幹真正在跑的 `calculateTrainingResult` / `applyLevelGrowth` / `dayForRound` /
XP 曲線 / `genProspects` 分佈。

**基準**：`SEASON_DAYS = 84`（12 週）、56 場總賽程、**玩家 14 場**、每 6 天一場。

### 2.1 🔴 發現一：新秀根本沒有成長空間

從真實新秀池（`genProspects(7)`，40 人）實測：

```
入行時「主能力 / 潛力」中位數 = 87.6%
成長空間（潛力 − 入行主能力）：min 1.6 / 中位 8.4 / max 34.2 點
```

**一半的新秀一輩子只能長 8 點以內。** 潛力 46 的新秀剩 1.8 點，等於入行即巔峰。

> ⇒ **「成長期 → 巔峰期」的前提在現行資料模型下不成立。**
> 沒有旅程可走，生命週期分段就只是換標籤。

### 2.2 🔴 發現二：成長是漸近線，潛力永遠到不了

`potentialSpace = min(1, room/40)`（training）與 `roomFull = 25`（levelGrowth）
讓成長正比於**剩餘空間** ⇒ 尾巴無限長。

12 個 Career Year 後的潛力空間關閉率（12 週）：

| 選手（自新秀池實抽） | 成長空間 | 12 年後關閉 |
|---|---|---|
| 典型新人 21歲 潛79 | 25 點 | 64.6% |
| 高潛天才 21歲 潛92 | 34.2 點 | **50.3%** |
| 即戰力 23歲 潛58 | 8 點 | 80.5% |
| 超新星 17歲 潛87 | 16 點 | 76.9% |

**沒有任何一個原型在 12 年內達到 80%**（除了成長空間本來就只有 8 點的低潛力選手）。
玩家會永遠看到「潛力 92，但一輩子停在 70」。

### 2.3 🔴 發現三：正式賽事對成長只貢獻 10.6%

12 週 Career Year、典型新人、前 5 年累計：

| 來源 | 點數 | 佔比 |
|---|---|---|
| Training（訓練課程） | 132.8 | **89.4%** |
| Formal Competition（聯賽 14 場） | 15.8 | **10.6%** |
| Practice | 0 | 0%（**目前無永久成長路徑**） |
| Ranked | 0 | 0%（**目前不存在**） |

> ⇒ 「League / Tournament = 正式生涯成果」在數字上是假的。
> 現況真正在養選手的是**訓練**，而訓練不需要任何比賽。
> ⚠ 量測註記：`fromTraining` 計入全部 16 項能力的成長，
> 而關閉率只看定位 5 項主能力 ⇒ 8:1 這個比例**偏高**，
> 但方向（訓練遠大於比賽）不受影響。

### 2.4 發現四：生涯操作量撐不住

| Career Year | 17 年 = 天 | 推進 3 天 | 推進 1 週 | 推進到下一場（6 天） |
|---|---|---|---|---|
| 10 週 | 1190 | 397 次 | 170 次 | 199 次 |
| 12 週 | 1428 | **476 次** | 204 次 | 238 次 |
| 14 週 | 1666 | 556 次 | 238 次 | 278 次 |

> ⇒ 只靠「推進 N 天」按鈕，世代交替在**體感上不可能到達**。
> Career Clock 必須配大顆時間操作。

### 2.5 核心問題的答案

> **「一個 19–21 歲新人，在正常玩法下，大約幾個 Career Year 能從新人變成成熟主力？」**
>
> **現行模型下：永遠不會。** 不是「幾年」的問題——曲線根本到不了。
> 12 個 Career Year（＝ 21 歲打到 33 歲退休）後，典型新人只關閉 64.6% 的潛力空間。
>
> **設計目標（提案）**：修正成長曲線與新秀空間後，讓
> **19–21 歲新人在 3–5 個 Career Year 內達到 80% 開發度**（＝ 24–26 歲成為成熟主力），
> 才撐得起 24–28 巔峰、29+ 衰退、32–34 退休的生命週期。

---

## 3. Career Clock

### 3.1 決策

**Career Clock = `meta.days`，已經存在，不新建。**

- **Career Year = 12 週 = 84 天 — MVP baseline（已裁決）**
  ⚠ **不是永久 balance freeze**：baseline 是為了對齊既有常數先動起來，
  實際長度可在 V0A+V0B calibration 之後重新檢討。
- `meta.careerYear` 由 `meta.days` 導出，與 `meta.season` 同源，**不另存計數**
- **age 只在 Career Year 邊界 +1**，由 `advanceDay` 跨過邊界時觸發
- **MOBA / CS 共用同一個 clock** ⇒ 結構上不可能重複老化

### 3.2 為什麼是 12 週

**不是因為模擬分數，而是因為對齊既有常數**：`WEEKS_PER_SEASON = 12`、`SEASON_DAYS = 84`。
Career Year 可以直接吃現成的賽程間距（6 天）與週結算冪等鍵。

- **10 週**：場間縮到 5 天，**3 天的訓練課程塞不進去**（模擬中完成課程數掉到 21）
- **14 週**：17 年生涯多按 80 次推進，且沒有換到更好的成長曲線

⚠ **這個選擇的前提是成長曲線會被重新設計。** 若 §2.1–2.3 不修，選哪個長度都救不了生命週期。

### 3.3 Time Block

| Block | 消耗 Career Day | 說明 |
|---|---|---|
| Training Block | 課程天數（1–3） | 現況 |
| Rest Block | 1 | 現況 |
| Practice Block | 1 | 可打 N 場，成長有 budget |
| Competitive Block（Ranked） | 1 | 可打 N 場，Rating 無限、成長有 budget |
| Event Block（Live / Tournament） | **1 或 2（待定）** | 整個 Swiss → Playoff → Final |
| Formal Fixture | **0** | 它是日曆上的一個點，不是消耗 |

**核心不變式**：`careerDaysConsumed` 與 `matchesPlayed` **無關**。

---

## 4. Real Time vs Career Time

```
ServerTime（真實）              CareerTime（每個存檔）
  matchmaking                     age
  Ranked season                   growth
  Live Event 開賽時刻              fatigue recovery
  全球排行榜                       off-season / retirement
        └────── EventTimeBlock ──────┘
  一場 Live Event（現實 2–5 小時）
      = 1 個 EventTimeBlock
      = N Career Days（N = 1 或 2，待定）
```

**提案 contract（尚未實作）**

```
EventTimeBlock.v1 {
  blockId, mode,
  realStartedAt, realEndedAt,     // ServerTime
  careerDaysConsumed,             // 1 or 2 — 與 matchesPlayed 無關
  matchesPlayed,
  growthBudgetSpent,
}
```

不變式：
1. `careerDaysConsumed` 不是 `matchesPlayed` 的函式
2. ServerTime 永遠不寫進 `players[]`
3. CareerTime 永遠不影響 matchmaking / 排行榜

---

## 5. Player Career Growth Model（PCGM）

### 5.1 一個公式，四個來源

```
gain = base(source)
     × potentialSpace(current, potential)     ← 需重新設計（見 5.3）
     × ageFactor(age)                          ← 現在只有 Training 有
     × learningFactor(learning)
     × conditionFactor(energy)
     × participationFactor(source)
     × blockBudgetFactor(該 Block 已用額度)     ← 新增，防刷
```

`base(source)` 才是四層模式的差異：

| Source | base（提案） | Block growth budget | 定位 |
|---|---|---|---|
| Training | 中 | 課程本身即限制 | 穩定培養 |
| Practice | **低** | 上限 3 場份 | 試新人／位置／陣容 |
| Ranked | 中 | 上限 3 場份 | 驗證實力 / Rating |
| Formal（League / Major） | **最高** | 不設限 | 正式生涯成果 |

> **為什麼 Major 不會變成「最高效率刷能力」**：
> 不是靠降低它的 base，而是**它的場次本來就被日曆鎖死**（14 場/年）。刷不了。
>
> **年度來源比例 target（已裁決）**：Training 40% / Formal 35% / Ranked 15% / Practice 10%
>
> ⚠ **這是「一個 Career Year 結算下來的來源佔比」，不是公式常數。**
> `base(source)` 要調成多少才能達到這個佔比，由 V0A+V0B 的 calibration 決定，
> **不在本文件鎖定**。驗收看的是年度佔比落在 target 附近，不是某個係數等於某個值。
> 現況是 89% : 11%，這個 target 的用意是把它拉回來。

### 5.2 統一 age factor

`levelGrowth.applyLevelGrowth()` 目前**完全沒有年齡因子**。
PCGM 要求所有永久成長路徑共用同一個 `ageFactor()`（沿用 `trainingCalculator.ageEfficiency` 的語意）。

⚠ 這會改變 Training v1.1 的呼叫方式但**不改它的公式**——`ageEfficiency` 提升為共用模組。

### 5.3 潛力空間必須可到達

- 現況：`potentialSpace = min(1, room / 40)` ⇒ 漸近線
- 提案：`potentialSpace = clamp(room / roomFull, floorRate, 1)`，`floorRate ≈ 0.15`
  ⇒ 保證最低成長率，潛力**可以真的到達**

### 5.4 新秀成長空間必須加大

- 現況：中位數 8.4 點（§2.1）
- 提案：調整 `genProspects` 的 `current` 生成，把中位成長空間拉到 **20–30 點**
- ⚠ 這會改變既有招募平衡與 `check_cs_*` 的一批 fixture ⇒ **獨立一輪 balance 工作**

---

## 6. Practice 防刷

三道防線，**不禁止玩家繼續玩**：

1. **Practice Block 消耗 1 Career Day** — 打再多場也是 1 天，但天數會走 ⇒ **會老**
2. **Block growth budget（上限 3 場份）** — 第 4 場起 Rating／手感／資訊照給，**永久成長 0**
3. **正式賽事窗口不因玩家不參加而停止** — 現況 `sweepOverdue` 已如此（逾期判負）

### 曲線選擇（實測）

| 一 Block 內 N 場 | 等比例 | √N | 1/(1+ln N) | **budget 制** |
|---|---|---|---|---|
| 3 | 3 | 1.7 | 1.4 | 3 |
| 10 | 10 | 3.2 | 3.0 | **3** |
| 50 | 50 | 7.1 | **10.2** | **3** |

> ⚠ `1/(1+ln N)` 在 N 大時**反而超過 √N**（50 場時 10.2 > 7.1）⇒ 不是防刷曲線。
> 選 **budget 制**：上限明確、玩家一看就懂、不會出現「打越多越虧」的反直覺。

---

## 7. Player Lifecycle

### 7.1 不用固定年齡硬切

```
lifecycleStage = f(age, closedRatio, potential, learning, current)
```

| Stage | 條件（提案） |
|---|---|
| 新人 rookie | `closedRatio < 25%` |
| 成長期 growth | `closedRatio 25–70%` 且 `age < peakStart` |
| 巔峰期 peak | `closedRatio ≥ 70%` 且 age 在 peak window |
| 成熟期 mature | `age > peakEnd` 且尚未進入 decline |
| 老將 veteran | 已開始 decline |
| 退休 retired | — |

`peakStart / peakEnd` **由 potential 與 learning 微調**——高潛力晚熟、高 learning 巔峰長。
**不是全隊同一個數字。**

### 7.2 衰退只在 Off-season

**不在每打一場就扣 stats。** 沿用 Legacy `agePlayerOneSeason` 的**體能／心智分離**：

- **體能項**（reflex, apm, accuracy, positioning）：從 `peakEnd` 起逐年遞減
- **心智項**（tacticalIQ, decision, mapAware, comms, leadership, clutch）：繼續小幅成長到更晚

### 7.3 退休要有預告

`retirementIntention` 在退休前 **1–2 個 Career Year** 就出現在選手頁。
**明星不會突然消失**，玩家有時間找接班人。

---

## 8. Off-season / 新世代

Off-season 是 Career Year 邊界的一個**明確階段**（不是瞬間）：

```
1. age +1（全世界，含 AI）
2. aging / decline evaluation（體能／心智分離）
3. retirement intention → retirement
4. rookie generation（seed = f(seasonSeed, careerYear) ⇒ 每年一批新的）
5. recruitment refresh
6. AI roster turnover
7. contract / finance rollover
8. next Career Year init
```

### 8.1 Soft-lock 防護（產品規則，需 verifier）

- 退休只在 Off-season 發生，且**同一年不得讓玩家先發低於 5 人**（超過就延後一名退休）
- Off-season **必須**產生足夠的**可負擔**新秀（至少 N 名 `cost ≤ 現金`）
- 這兩條要像本輪 injury removal 的 soft-lock 證明一樣，**用真的 Store 實跑**

### 8.2 AI 也要換血

`aiTeams` 目前 static。提案：AI roster 由 `seedForCareerYear(seasonSeed, year)` **決定性重生成**，
年齡曲線與玩家同步。**維持現有邊界**：AI 選手仍不進 `players[]`。

---

## 9. 四層競賽的責任劃分

| 層 | 玩家為什麼打 | 消耗 | 永久成長 | 產出 |
|---|---|---|---|---|
| **Quick / Scrim** | 試陣容、試位置、試新人 | Practice Block（1 天） | 極低，budget 3 | 手感、陣容資訊 |
| **Ranked** | 驗證實力、Rating、排行榜 | Competitive Block（1 天） | 中，budget 3 | Rating、排名、少量 Fans |
| **Live Event** | 定時報名、獎金、積分 | Event Block（1–2 天） | 中高 | 獎金、Fans、積分、榮譽 |
| **Career / Major** | 長期俱樂部成果 | **0**（日曆點） | **最高** | 冠軍、Fans、獎金、生涯紀錄 |

**四個不同的稀缺資源**（這才是差別，不是四個名字）：
Quick 花時間不花信譽｜Ranked 花 Rating 風險｜Event 花**現實**時間｜Career 花整年。

---

## 10. 差異化四支柱評估

| 支柱 | 建議 | 理由 |
|---|---|---|
| **A. Multi-Title Club** | **Opt-in / Later（Q2 FINAL）** | 地基已在（`players`/`finance`/`meta` 共用、`competitionByMode` 分離）；玩家不被迫同時經營兩個項目。**第二分部必須同時帶成本與收益，不得成為「不開就吃虧」的 mandatory bonus** |
| **B. Club DNA** | **Later，且必須可見** | 隱藏 buff 是設計陷阱（見 §11-12） |
| **C. Personality / Style** | **Later，且必須可預測** | 隨機懲罰是設計陷阱（見 §11-13） |
| **D. Legacy（轉教練）** | **Not Now，只留欄位** | 需要 Coach/Staff 系統，本輪明確不做 |

---

## 11. Grilling：漏洞與修正

格式：**風險 → exploit → 解法 → 是否值得 vNext 做**

### G1. Practice 無限刷能力
- **風險**：不打 Season，只 Practice，刷滿素質
- **exploit**：⚠ **這個 exploit 目前不存在**（Practice 沒有永久成長路徑）。
  **真正的洞是「無限訓練」**——訓練不需要任何比賽，只要有體力就能一直練，
  而且它貢獻 89% 的成長。使用者擔心的是 Practice，實際的漏洞在 Training。
- **解法**：growth budget **不分來源共用一個 Career Day 總額度**，訓練也吃這個額度
- **值得**：✅ **MVP 必做**（且範圍要比原本設想的大）

### G2. 不打 Season 凍齡
- **風險**：世界時間不前進
- **exploit**：✅ **現況 100% 成立**。`advanceDay` 只有訓練中心一個入口，
  且比賽完全不推進日曆 ⇒ 無限打自由對戰累積 XP → 升級 → 永久成長，**一天都不會走**
- **解法**：任何 match 都必須落在某個 Time Block 內，Block 消耗 Career Day
- **值得**：✅ **MVP 必做**

### G3. MOBA + CS 重複老化
- **風險**：兩個 mode 各自 +1 歲
- **exploit**：若 age 掛在 `rollToNextSeason`，玩家在 MOBA 與 CS 各 roll 一次 = **老 2 歲**
- **解法**：age 只由 `meta.days` 導出的 Career Year 邊界觸發；rollover **完全不碰 age**
- **值得**：✅ **MVP 必做，且要 mutation sentinel**（「把 age 掛回 rollover ⇒ gate 紅」）

### G4. Live Event 狂打導致老化過快
- **風險**：真人 Event 是 real-time 排定的，玩家不能控制頻率 ⇒ **勤奮參與 = 老得快 = 懲罰參與**
- **exploit**：一個週末打 5 個 Event = 5–10 Career Days
- **解法（已裁決採納）**：**Career Calendar 為 Event 預留 Event Window**。
  打排定窗口內的 Event = 用掉那個窗口，**不額外消耗 Career Time**；
  超出窗口的 Event 只給 Rating / 獎金，**不給永久成長也不消耗時間**。
  ⇒ **Live Event 不因玩家參與而額外懲罰 Career Time。** 勤奮參與不會老得比較快。
- **值得**：✅ 契約 MVP 必做；真人 Event 本體 Not Now

### G5. 強者雪球
- **風險**：贏 → 獎金/Fans → 更好選手 → 更容易贏
- **解法**：**不加人為 rubber-band**。兩個天然阻尼已經存在或即將存在：
  ① 年齡（巔峰選手會衰退）② 薪資隨能力上升（`salary` 由能力導出，`check_finance_n3` 已驗）
- **值得**：⚠ 不需要新機制，但**要驗證「強隊薪資壓力」真的存在**（目前未驗）

### G6. 老將突然退休造成挫折
- **風險**：明星一夜消失
- **解法**：`retirementIntention` 提前 1–2 個 Career Year；且只在 Off-season 發生
- **值得**：✅ **MVP 必做**

### G7. 新人不足造成 roster soft-lock
- **風險**：退休後沒錢沒人 = 卡死
- **exploit**：連續兩年多人退休 + 現金見底
- **解法**：§8.1 兩條規則（先發不低於 5 人；保證可負擔新秀）
- **值得**：✅ **MVP 必做，且要實跑 verifier**（本輪 injury sprint 的 soft-lock 證明是範本）

### G8. AI 隊伍不換血
- **風險**：只有玩家世界會老
- **exploit**：玩家撐 3 年，AI 還是原班人馬 ⇒ 玩家必然變強、世界靜止、聯賽失去意義
- **解法**：§8.2 決定性重生成
- **值得**：✅ **MVP 必做**——否則生命週期只有一半

### G9. Career Year 太短（一晚老 5 歲）
- **風險**：10 週太短
- **解法**：真正的防線**不是年長度**，而是「時間只能被 Block 推進，而 Block 有內容」。
  選 12 週。
- **值得**：✅ 已納入

### G10. Career Year 太長（看不到世代變化）
- **風險**：14 週 × 17 年 = 556 次推進
- **解法**：12 週 **＋ 大顆時間操作**（推進到下一場 / 推進一週 / 跳到 Off-season）
- **值得**：✅ **MVP 必做**——這是 §2.4 量出來的硬傷

### G11. Quick / Ranked / Tournament 體感沒差別
- **風險**：四個名字一樣的「找比賽」
- **解法**：§9 的四個**不同稀缺資源** + 四個不同產出
- **值得**：⚠ 這是設計品質問題不是機制問題。**MVP 至少要讓 Quick 與 Formal 有明顯差別**，
  Ranked / Event 可以 Later

### G12. Club DNA 變成隱藏 buff
- **風險**：玩家不知道為什麼贏／輸，把設計讀成隨機
- **exploit**：無法反制、無法學習 ⇒ 玩家放棄理解
- **解法**：DNA 必須**可見、可解釋、可改變**——顯示「本隊近 20 場的打法傾向」
  與它對戰術執行的**具體修正值**
- **值得**：⚠ **Later**。做不到可見就不要做

### G13. Personality 變成難以理解的隨機懲罰
- **風險**：玩家覺得選手隨機不聽話
- **解法**：personality 只影響**已宣告的傾向**（例如 aggressive 在劣勢時更容易開戰），
  且賽後 replay 要能指出「這一手是因為個性」
- **值得**：⚠ **Later**。做不到可歸因就不要做

### G14. Multi-title Club 逼玩家玩不喜歡的模式
- **風險**：MOBA 玩家被迫管 CS
- **解法**：**opt-in 分部**；且第二分部可「託管」（AI 代管，玩家只看財報與成績）
- **值得**：⚠ **Later**（見 §13 Q2）

### G15.（新增，模擬翻出來的）新秀沒有成長空間
- **風險**：中位成長空間只有 8.4 點 ⇒ 生命週期分段只是換標籤
- **解法**：§5.4
- **值得**：✅ **MVP 必做**——不修，整個 Season vNext 沒有意義

### G16.（新增）成長是漸近線，潛力永遠到不了
- **風險**：玩家看到「潛力 92，一輩子停在 70」
- **解法**：§5.3 `floorRate`
- **值得**：✅ **MVP 必做**

### G17.（新增）正式賽事只貢獻 10.6% 的成長
- **風險**：「League/Tournament = 正式生涯成果」在數字上是假的
- **解法**：§5.1 目標比例
- **值得**：✅ **MVP 必做**

---

## 12. MVP / Later / Not Now

### MVP（Season vNext v1）

0. **Foundation（V0A + V0B，共同 calibration）**：PCGM ＋ 新秀成長空間。
   驗收看**產品目標**（Year1 可輪換 / Year2 穩定主力 / Year3–4 接近巔峰）與
   **年度來源佔比 40/35/15/10**，**不鎖公式常數**
1. **Career Clock**：`meta.careerYear` 由 `meta.days` 導出；age 只在年邊界 +1
2. **Time Block**：Practice / Competitive / Event Block 消耗 Career Day
3. **PCGM v1**：統一公式 + 統一 `ageFactor` + Block growth budget
4. **潛力空間可到達**（`floorRate`）
5. **新秀成長空間加大**
6. **Lifecycle stage**：derived，接上既有的 `careerStageOf` placeholder
7. **Off-season**：age / decline / retirement intention / rookie / AI turnover
8. **Soft-lock 防護** + 實跑 verifier
9. **大顆時間操作**（推進到下一場 / 一週 / Off-season）
10. **EventTimeBlock contract**（只定契約，不實作連線）

### Later

- Multi-Title Club（opt-in 第二分部；**必須同時帶成本與收益**）
- Club DNA（**可見版**——做不到可見就不要做）
- Personality 影響戰術執行（**可歸因版**——做不到可歸因就不要做）

> ⚠ **Ranked 與 Live Event 已從 Later 移除**（Q3 FINAL）：
> 本輪連**本地 fake Ranked** 都不做。它們在契約上是一層，但**沒有實作排期**。

### Not Now

- 真人連線 / 伺服器 / matchmaking / 反作弊
- **本地 fake Ranked implementation**（Q3 FINAL 明確排除）
- **Live Event 本體**（Swiss / Playoff / Final 的實作；只保留 Event Window 契約）
- Coach / Staff / Legacy 轉職
- 轉會市場 / 合約談判
- 跨俱樂部世界模擬

---

## 13. Q2 / Q3 — **已裁決（FINAL）**

### Q2 FINAL：Multi-Title Club = **Opt-in / Later**

**裁決**
- 玩家**不被迫**同時經營 MOBA + CS
- 第二分部**未來必須同時帶來成本與收益**
- **不能成為「不開就吃虧」的 mandatory bonus**

**為什麼這條裁決直接回應了 grilling**

G14 的反對意見是：「即使是 opt-in，只要第二分部有明顯收益，玩家就會覺得不開是懲罰
——那就是變相強制。」裁決把它變成**設計約束**而不是善意期待：
第二分部**必須帶成本**（薪資、設施、注意力），所以它是一個**權衡**，不是一個 bonus。

⇒ 這條約束要能被驗證。實作時的判準（提案）：
**開了第二分部的存檔，在同等操作品質下，第一分部的競技成績不得系統性優於沒開的存檔。**
若做不到這條，就不要開放第二分部。

**MVP 邊界**：MVP **不做** Multi-Title，但**不得擋住它**——
Career Clock 共用、Off-season 對兩個 mode 一致、`competitionByMode` 維持 keyed by mode。

### Q3 FINAL：Online = **Contract only**

**裁決**
- 本輪**不做** server / real matchmaking / **也不做 fake Ranked implementation**
- 但 **Career / Growth contract 必須允許未來 AI 與真人 Match 共用**

> ⚠ 這比我原本的提案更嚴格：我原本建議「本地假對手先行的 Ranked」列為 Later，
> **裁決是連 fake Ranked 都不做**。設計文件其餘各節提到 Ranked 之處，
> 一律理解為「契約上的一層，本輪不實作」。

**「AI 與真人共用」對契約的具體要求**

成長與生涯路徑**不得知道對手是誰**。也就是：

1. `PCGM` 的輸入只有 `source`（Training / Practice / Ranked / Formal）、選手狀態與 Block 額度，
   **不含「對手是 AI 還是真人」**
2. `EventTimeBlock` 的 `careerDaysConsumed` 只由 Event Window 決定，
   **不因對手類型而不同**
3. 未來接上真人時，只換 **match 來源 gateway**，
   **生涯層一行都不用改**——這是本輪唯一要買的保險

**MVP 邊界**：只定契約與不變式。**不實作任何連線，也不實作本地 Ranked。**

---

> **Q2 / Q3 已 FINAL，不再是待裁決項。**

## 14. 需要新增或修改的 contract / docs

### 新增 contract（提案）

| Contract | 責任 |
|---|---|
| `CareerClock.v1` | `meta.careerYear` 導出規則；age 推進的唯一觸發點 |
| `TimeBlock.v1` | Block 種類、消耗天數、growth budget |
| `EventTimeBlock.v1` | ServerTime ↔ CareerTime 的換算與不變式 |
| `PlayerLifecycle.v1` | stage 判定、decline、retirementIntention |
| `OffSeason.v1` | 八步序列、soft-lock 防護 |

### 需要修改

| 既有 | 修改 |
|---|---|
| `progress/levelGrowth.js` | 加入共用 `ageFactor` |
| `data/trainingCalculator.js` | `ageEfficiency` 提升為共用模組（公式不變） |
| `data/recruitPool.js` | 新秀成長空間加大；seed 改由 careerYear 派生 |
| `competition/aiTeams.js` | 加入逐年決定性重生成 |
| `ui/playerProfileFoundation.js` | `careerStageOf` 接上真實 stage（目前永遠「未啟用」） |
| `profileStore.advanceDay` | 跨 Career Year 邊界時觸發 Off-season |

### 需要新增 verifier

- `check_career_clock`：age 只由 Career Year 邊界驅動；rollover 不碰 age（**sentinel**）
- `check_growth_model`：四來源共用一個公式；budget 上限有效（**sentinel**）
- `check_offseason_no_softlock`：實跑證明退休後不會卡死
- `check_ai_turnover`：AI 逐年換血且決定性

### 需要更新 docs

- `docs/handoff/04_Roadmap.md`（Season vNext 章節）
- `docs/handoff/08_目前待辦與風險.md`（風險登記）
- `docs/09_技術債務清單.md`（新秀空間、漸近線列為待修）

---

## 15. Implementation Roadmap（已裁決）

> ⚠ 這是 Sprint 層級的拆法。**完整的逐步驟 plan（含測試碼）在每個 Sprint 開工前才寫**——
> 一次寫完九個 Sprint 的細節，前面幾個 calibration 出來就會全部作廢。
>
> 每個 Sprint 的收尾條件比照本專案既有慣例：**gate 全綠 ＋ 瀏覽器實測 ＋ 文件更新**。

### Foundation（**兩者都完成並共同 calibration 後**才能往下）

| # | Sprint | 交付 |
|---|---|---|
| **V0A** | **Player Career Growth Model** | 統一 PCGM 公式；`levelGrowth` 接上共用 `ageFactor`；`potentialSpace` 加 `floorRate`；Block growth budget |
| **V0B** | **Prospect Growth Space** | `genProspects` 的成長空間重建（現況中位 8.4 點） |

> 🔒 **Foundation Gate（硬性）**
> V0A 與 V0B **不得各自宣告完成**。兩者都落地之後要跑一次**共同 calibration**，
> 通過下面的「成長產品驗收目標」才算 Foundation 完成。
>
> **為什麼必須綁在一起**：成長速度是「公式 × 成長空間」的乘積。
> 只修公式（V0A）會讓 8.4 點的空間更快被關閉 ⇒ 看起來更糟；
> 只修空間（V0B）會讓漸近線的尾巴更長 ⇒ 也更糟。
> **分開驗收，兩邊都會得到錯誤結論。**

### 成長產品驗收目標（已裁決）

以**19–21 歲、正常高潛力**新人為基準，在**正常玩法**下：

| Career Year | 目標 |
|---|---|
| **Year 1** | **明顯進步，可以進輪換** |
| **Year 2 左右** | **有機會成為穩定主力** |
| **Year 3–4** | **好選手接近成熟／巔峰** |

規則：
- **不鎖具體公式數值**——`base`、`floorRate`、`roomFull`、新秀空間分佈全部由 calibration 決定
- **年度來源比例 target**：Training 40% / Formal 35% / Ranked 15% / Practice 10%
  ——這是**年度結算的來源佔比**，不是公式常數
- 驗收看的是**上面三行產品目標**與**年度佔比**，不是某個係數等於某個值
- Career Year 12 週 / 84 天是 **MVP baseline**，calibration 之後可重新檢討

### Foundation 之後

| # | Sprint | 交付 | 為什麼排這個位置 |
|---|---|---|---|
| **V1** | **Career Clock** | `meta.careerYear` 導出；age 只在年邊界 +1；rollover 不碰 age | 成長修好之後，年齡才有東西可以作用 |
| **V2** | **Time Block** | Practice / Competitive / Event Block 消耗 Career Day；Block growth budget 上線 | 補 TD-34 的凍齡洞 |
| **V3** | **大顆時間操作** | 推進到下一場 / 推進一週 / 跳到 Off-season | §2.4 的硬傷；沒有它，V1/V2 體感上到不了 |
| **V4** | **Lifecycle** | derived stage 接上既有 `careerStageOf` placeholder；體能／心智分離的 decline | 需要 V0A/V0B 的 `closedRatio` 與 V1 的 age |
| **V5** | **Off-season** | 八步序列；退休預告；soft-lock 防護 | 需要 V1 的年邊界與 V4 的 stage |
| **V6** | **AI turnover** | AI roster 逐年決定性重生成 | 需要 V5 的 Off-season 掛載點 |
| **V7** | **Online Event contract** | `EventTimeBlock.v1` ＋ Event Window；**只定契約，不實作連線、不實作本地 Ranked** | 可與 V1–V3 並行 |

### 每個 Sprint 的 gate（提案）

| Sprint | 新增 gate | 必跑既有 gate |
|---|---|---|
| V0A | `check_growth_model`（四來源共用一個公式；sentinel：拆成兩套 ⇒ 紅） | `growth_ui_p1`、`growth_p0`、`progress25`、`talent27` |
| V0B | `check_rookie_headroom`（中位成長空間下限） | `check_recruit_o`、`check_cs_roster_v1_r56` |
| **Foundation Gate** | `check_growth_acceptance`（**三行產品目標 ＋ 年度來源佔比**） | 上面兩組全跑 |
| V1 | `check_career_clock`（**sentinel：age 掛回 rollover ⇒ 紅**） | `check_competition_q3/q4/q5/q6`、`cs_season_lifecycle` |
| V2 | `check_time_block`（sentinel：Block 不消耗天數 ⇒ 紅） | `check_condition_o2`、`check_no_player_injury` |
| V3 | `browser_check_time_controls` | `browser_check_home_ia` |
| V4 | `check_player_lifecycle` | `check_r62_player_ui_fixture` |
| V5 | `check_offseason_no_softlock`（**實跑**） | `check_finance_n3`、`check_fan_system` |
| V6 | `check_ai_turnover`（決定性） | `check_competition_release_gate` |
| V7 | `check_event_time_block`（不變式：**天數 ≠ 場次的函式**、**成長不知道對手是 AI 還是真人**） | — |

### 不在任何 Sprint 內（明確不做）

- 真人連線 / server / matchmaking / 反作弊
- **本地 fake Ranked implementation**（Q3 FINAL 明確排除）
- Multi-Title 第二分部（Q2 FINAL：Later；MVP 只要不擋住）
- Club DNA / Personality 影響戰術執行
- Coach / Staff / Legacy 轉職、轉會市場、跨俱樂部世界模擬

---

## 16. GO / NO-GO

**GO —— 但範圍要比原本設想的大。**

原本的題目是「加上年齡與世代交替」。模擬顯示**那樣做會失敗**：
新秀沒有成長空間（中位 8.4 點）、成長是漸近線（12 年只關 65%）、
正式賽事只貢獻 10.6%。在這三件事修好之前，
加上 age +1 只會得到「一群永遠長不大、然後開始變老的選手」。

**因此 Season vNext v1 的第一優先不是 aging，是 Growth Model 重建。**

### 裁決後的狀態（2026-08-25）

- **Q2 / Q3 已 FINAL**
- **Career Year 12 週 / 84 天 = MVP baseline**（不是永久 balance freeze）
- **Live Event 不因玩家參與而額外懲罰 Career Time**（Event Window，已採納 grilling G4）
- **成長產品驗收目標已鎖定**；**公式常數未鎖**，由 V0A+V0B calibration 決定
- Roadmap 已改為 **V0A / V0B Foundation → Foundation Gate → V1–V7**

**READY FOR IMPLEMENTATION：是。** 第一個 Sprint 是 **V0A（Player Career Growth Model）**。

⚠ 仍未鎖定的：所有 balance 常數。它們**不得**在 calibration 之前被寫死或標為 FINAL。
