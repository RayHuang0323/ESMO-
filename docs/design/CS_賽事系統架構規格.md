# CS Season / Competition 架構規格

> **狀態**：規劃定稿，**尚未實作**。本檔是 CS 賽季／賽事的產品與架構單一事實來源。
> **Architecture owner**：Claude Code。
> **基線**：`main` production lineage ＋ Home/Team 共同責任契約（本分支 `plan/cs-season-architecture`）。
> **日期**：2026-08-21。

---

## 0. 這份規格要回答的問題

MOBA 的 Season / Competition MVP 已完成、部署並以真實存檔驗收（22/22，`review/q7-manual-save-acceptance/`）。
現在要決定 CS 的賽季／賽事怎麼做。

**結論先講：CS 不需要自己的賽季系統。** 需要的是把 CS 接上既有的 Competition Platform，
再補一段 CS 目前完全沒有的 match lifecycle。理由見 §1。

---

## 1. 先確認地基：哪些東西已經是現成的

在寫任何新東西之前，先量測既有資產。以下每一條都在 `7c43a45` 的樹上實際查證過。

### 1.1 Competition 契約本來就是多遊戲的

`src/platform/contracts/competition.js`：

| 事實 | 位置 | 意義 |
|---|---|---|
| `createCompetition({ gameMode })` 驗 `moba \| cs` | `competition.js:105-110` | CS 賽事是**合法輸入**，不是新型別 |
| id 命名 `comp:${gameMode}:s${season}:${organizerId}:${tier}` | `competition.js:113` | 兩個項目的賽事**不可能撞 id** |
| `seasonId: season:${gameMode}:s${season}` | `competition.js:119` | 賽季本來就以 gameMode 分名 |
| Fixture id `fx:${stage.gameMode}:...` | `competition.js:253` | 賽程場次同上 |
| `STAGE_FORMATS` 已宣告 `swiss / single_elim / double_elim` | `competition.js:31-38` | 淘汰賽是**已宣告未實作**，不是缺漏 |
| `createFixture({ matchFormat })`，註解「項目專屬設定原樣攜帶，**共用層不解讀**」 | `competition.js:234, 261-263` | BO 系列與地圖池的掛載點早就留好 |
| `stageIds` / `qualifications`（Stage Graph） | `competition.js:132-133` | 多階段賽事的骨架已在 |

⇒ **Competition 契約一行都不用改。** CS 只是第二個消費者。

### 1.2 賽果橋已經是項目中立的

```
BattleResult.v2 → outcomeFromBattleResult() → createMatchResult() → MatchResult.v1
                                                                      ↓
                                              fixtureOutcomeInputFrom() → FixtureOutcome
```

- `fixtureOutcomeInputFrom()` 的簽名**只收 `MatchResult.v1`**，`fixtureResultBridge.js:24-26`
  明寫「本檔**不接受 BattleResult**，簽名上就拿不到——這是刻意的」。
- `createMatchResult({ session, outcome })` 以 `session.mode` 參數化：
  `resultId: result:${session.mode}:${hash}`（`matchResult.js:87`）。

⇒ CS 缺的**不是橋，是橋頭那一小段**：`CsMatchResult.v1 → { winner: "us"|"opponent", score:{us,opponent} }`，
也就是 MOBA `outcomeFromBattleResult()` 的 CS 對應物。這是整個 MVP 裡最小的一塊。

### 1.3 已經可用的 CS 資產

| 資產 | 位置 | 狀態 |
|---|---|---|
| `matchEntry("cs")`（讀 `csLineup`） | `profileStore.js:1573-1585` | 可用 |
| `enqueueMatch("cs")` | `profileStore.js:1600` | 可用 |
| `teamStrength(roster, "cs")` | `teamStrength.js:43` | 可用 |
| `simulateFixture()` 讀 `fixture.gameMode` | `simulateFixture.js:98-99` | **AI vs AI 自動模擬對 CS 免費** |
| 8 支 `CsAiTeam.v1`（含 tier / strengthBand / 5 roles） | `src/data/csAiTeams.js` | **現成的聯賽參賽隊伍池** |
| `CsMatchResult.v1` 契約 | `contracts/CsMatchResult.js` | 可用 |
| `csProgressAdapter` / `settleCsMatch` | `platform/progress/` | 可用（選手成長） |
| 賽前流程 `csPrep → csMap → csTactic → csLoading → cs → csResult` | `AppShell.jsx:187-193` | **含地圖選擇畫面** |
| `setActiveMatchContext({ phase })` CS 已在呼叫 | `AppShell.jsx:188-190` | CS **已有 ActiveMatch context** |

### 1.4 真正的缺口：CS 沒有 match lifecycle

`CsPrepScreen.jsx` **完全沒有** matchmaking / fixture / origin 的引用。CS 今天的路徑是：

```
CsMatchScreen.onFinish → settleCsMatch(r) → csHistory[]
```

`profileStore.js:232` 的註解寫得很清楚：`csHistory` 是「CS **訓練賽**紀錄」。

CS 沒有 `matchmaking.session`、沒有 `matchRoom`、沒有 fixture origin、沒有 `launched` 狀態
（⇒ 沒有「快輸中離規避敗場」的保護）、沒有 `FixtureOutcome` 入口。

**這才是 MVP 的主要工作量，不是賽季系統本身。**

---

## 2. 決策紀錄

以下八項是 2026-08-21 grilling 的產出。每一項都記錄「決定」與「為什麼不選另一邊」。

### D1 — Season truth 的形狀：**keyed by gameMode**

```
profileStore.competitionByMode = {
  moba: SeasonState,   // 現有
  cs:   SeasonState,   // 新增
}
```

**同一套 canonical engine，各自持有 instance。** schema、lifecycle、Event、Fixture、
FinalStandings、SeasonSeal、verifier 全部共用。

- ❌ **不建立** `csSeasonStore`。
- ❌ **不複製** CS 專屬的 Season truth。
- ❌ **不採用**「兩個項目塞進同一個 SeasonState instance」。

**為什麼不塞同一個 instance**：`state.final`（SeasonSeal）、`careerEventId`、`season`、
`startDay`、`canRollSeason` 全部是 **season-global**。硬塞兩個項目會讓 MOBA 的封存與換季
綁死 CS 的封存與換季——那不是「平台共用」，是「強迫共用同一個 lifecycle」。

**這個選擇幾乎不用改 engine**：`startDay` 是 per-state（`seasonState.js:189`）、
`rollToNextSeason({ state, startDay })` 吃 state（`seasonState.js:902`）、
`seasonDayOf(state, currentDay)` 吃 state（`seasonState.js:937`）。
engine 本來就沒有「全域只有一個賽季」的假設——**只有 store slice 有**。

### D2 — CS 必須接 MatchSession / ActiveMatch

不接的話 CS 賽事只能模擬結算，玩家永遠不能親自打自己的聯賽場次，而且拿不到
`launched` 狀態的中離保護。

可以分兩步降風險，但 **M1 只是技術 milestone；真正的 CS Season MVP 至少要完成 M2**。

### D3 — 賽事結構：MVP 兩層

| 層 | 賽制 | 參賽 | 來源 |
|---|---|---|---|
| CS 官方聯賽 | `round_robin` | 8 隊（`csAiTeams.js` ＋ 玩家） | 已實作的賽制 |
| 年度 Major | `single_elim` | 聯賽 standings 前 4 | 需實作 `single_elim` 產生器 |

**Qualifier / Regional / 更複雜的巡迴資格延後。** 真實 CS 的 Major 需要 Qualifier，
是因為有幾百支隊伍要篩到 24 支；這裡只有 8 支固定隊伍。
先做 Qualifier 等於為一個還不存在的問題寫規則。

### D4 — BO 系列與地圖 Ban/Pick

**一個 Fixture = 一個 series = 一個 FixtureOutcome。**

- `matchFormat = { series: "bo1" | "bo3", mapPool: string[], veto: null }`，共用層原樣攜帶不解讀。
- `FixtureOutcome.score` 記**地圖數**（例如 `2:1`），**不是回合數**。
- **Season 層永遠不知道地圖是什麼。** 地圖 veto 屬 Match Prep（沿用既有 `csMap` 畫面），
  每張地圖的個別結果存在 MatchSession / ActiveMatch snapshot，不進 SeasonState。

**MVP 做 BO1（聯賽）＋ BO3（Major）。BO5 延後。**

⚠ **誠實揭露**：`csPrepData.js` 的 `CS_MAPS` 只有**三張現役地圖**（key 對齊引擎
`EsportsFPS3D.jsx` 的 `MAPS`）。三張池下：
- BO5 **蓋不出來**。
- BO3 的 veto 近乎裝飾（ban 一張、剩兩張選一張）。
⇒ MVP 的 BO3 就是「**打滿三張、先拿兩張者勝**」，文件要照實這樣寫，不假裝有 veto 博弈。
要做真正的 veto，前置是把引擎地圖池擴到 7 張——**那是另一條工作線，不綁在 CS Season MVP 裡**。

### D5 — 共用 calendar、分離 lifecycle

- `meta.days` **共用**（全域遊戲日）。
- 推進一天時**兩個 instance 都結算**（`todayPending` 已支援同日多場）。
- 各自 `startDay` 錨定、各自 `canRollSeason`、各自 rollover。
- **接受兩個項目賽季編號不同步**（MOBA 可能已 S3、CS 還在 S1）。
  那正是 D1 換來的東西；若又要求同步，等於把耦合偷渡回來。

### D6 — Ranking 的責任切分

現有三個模組是三種不同的東西，**不要合併**：

| 模組 | 責任 | CS MVP |
|---|---|---|
| `standings.js` | 單一 Competition 內的積分榜 | ✅ 使用 |
| `circuitPoints.js` | 跨 Event 的積分帳本 → 晉級資格 | ⏸ 延後 |
| `honors.js` | 生涯榮耀 | ✅ 使用（Major 冠軍寫一筆） |

Major 四強席次**直接取聯賽 standings 前四**，不建積分帳本——`circuitPoints` 的價值在
「跨多站累積」，CS MVP 只有一個聯賽，用它等於為單一資料點做帳本。
**跨賽季全球 Ranking 不進 MVP**（目前沒有任何消費者）。

### D7 — 第三款遊戲：先文件化，不抽介面

**現在只寫契約文件，不抽程式介面**（rule of three：MOBA 已有、CS 進行中、第三款不存在）。
現在抽會抽出一個只有兩個實作者、其中一個還沒寫完的假抽象。見 §4。

### D8 — schema v11：雙讀相容，低風險加法

見 §3。核心原則：**不為了 CS Season 改寫剛封版的 MOBA Q7f lifecycle / Recap / Release Gate。**

---

## 3. schema v11 遷移契約

### 3.1 結構變更

| v10（現行） | v11（新） | 相容策略 |
|---|---|---|
| `competition: SeasonState \| null` | `competitionByMode: { moba, cs }` | `competition` 降為 **read alias** → `competitionByMode.moba` |
| `competitionHistory: FinalStandings[]` | `competitionHistoryByMode: { moba, cs }` | `competitionHistory` 降為 **read alias** → `.moba` |

### 3.2 硬性規則

1. **`competitionByMode` 是唯一 canonical runtime structure。**
2. **`competition` 只讀不寫。** 不得雙寫，不得形成第二份 truth。
   寫入路徑一律走 `competitionByMode[mode]`。
3. `competitionHistory` 同上。
4. **舊 API 保留 `mode = "moba"` 預設**，讓 Q7f / gate fixtures / Release Gate 11 區段
   **一行都不用改就仍然綠**。
5. **所有新 CS code 必須 explicit 傳 `mode: "cs"`**，不得依賴 default。
   （verifier 會檢查這一條，見 §6。）
6. 升版是**純新增**：v10 存檔載入時把 `competition` 搬進 `competitionByMode.moba`，
   `competitionByMode.cs` 為 `null`（尚無 CS 賽季 ⇒ `ensureCompetitionSeason("cs")` 時才建）。

### 3.3 受影響的既有 API（全部加 mode 參數、預設 moba）

| API | 位置 | 變更 |
|---|---|---|
| `competitionView()` | `profileStore.js:1290` | → `competitionView(mode = "moba")` |
| `ensureCompetitionSeason()` | `profileStore.js:787` | → `ensureCompetitionSeason(mode = "moba")` |
| `activeCompetitionEvent()` | `profileStore.js` | → 加 mode 參數 |
| `_syncSeasonStateV2()` | `profileStore.js` | → per-mode 同步 |

### 3.4 不得倒退

CS Season 的任何工作**不得**修改下列既有語義。要改必須先更新本規格與共同契約：

- `SeasonState` 的 Event / Fixture / Outcome 生命週期
- `FinalStandings` 的 rows / playerRank / championTeamId / rankSource / sourceMix
- `SeasonSeal` 的封存語義與 `sealedAtDay`
- `careerEventId` 指向「該項目的生涯主賽事」這件事
- `canRollSeason` / `rollToNextSeason` 的換季規則
- Q7f Season Recap 的六個區塊與 CTA 位置
- Competition Release Gate 的 11 個區段與其硬編碼通過數

---

## 3.5 ⛔ Temporary ownership lock：CS 單場對戰內部規則

**Codex 正在處理 CS 單場對戰內部的局數／回合／比分規則。**
在 Codex 提供 **CS round-system stable checkpoint SHA** 之前，本規格的實作
**不得修改或重新定義**：CS 單張地圖勝負局數、round / half / overtime 規則、
`simulateFps` 的回合與比分語義、`CsMatchResult` 的既有單場比分產生邏輯、
CS battle scoreboard 與 round lifecycle。

⇒ 本規格的責任範圍收斂為 **Competition / Season / Fixture / BO series orchestration**。
BO3 的 Season contract **只消費「每張地圖的最終勝負」**，不重算、不覆蓋、不推導
Codex 的 map-level result。變異點 #1 `outcomeFromCsResult()` 只做座標轉換。

⚠ **M0 不得碰任何 CS battle runtime**；M0 的變更面只有 `profileStore.js` 與 schema verifier。
完整條文見 `docs/ai/跨模型交接流程.md` §13。

---

## 4. Discipline Variation Points（給第三款遊戲）

**這一節是文件，不是介面。** 第三款遊戲要接上 Competition Platform，需要提供這六件事。
現在把它們逐一命名並指出檔案位置；等第三款真的來了再考慮抽成介面。

| # | 變異點 | MOBA 的實作 | CS 待建 | 第三款要提供 |
|---|---|---|---|---|
| 1 | **結果 → 賽程賽果** | `outcomeFromBattleResult()`（`BattleResult.v2`） | `outcomeFromCsResult()`（`CsMatchResult.v1`） | `outcomeFrom<X>Result()` → `{winner:"us"\|"opponent", score:{us,opponent}, durationSec, seed}` |
| 2 | **出賽席位** | `ENGINE_SEATS` / `lineup` | `CS_SEATS` / `csLineup` | 席位常數 ＋ store 欄位 |
| 3 | **戰力權重** | `teamStrength(roster,"moba")` | `teamStrength(roster,"cs")` | `teamStrength.js` 加一組權重 |
| 4 | **matchFormat schema** | `null`（BO1 隱含） | `{series, mapPool, veto}` | 自訂，共用層不解讀 |
| 5 | **AI 隊伍池** | `aiTeams.js` | `csAiTeams.js`（`CsAiTeam.v1`，8 隊） | `<x>AiTeams.js` |
| 6 | **賽前流程** | `lineup → BanPick → Tactic` | `csPrep → csMap → csTactic` | 自訂畫面序列 ＋ `setActiveMatchContext` |

平台側**不需要**為第三款改動的東西：Competition / Stage / Fixture 契約、
`MatchResult.v1`、`fixtureOutcomeInputFrom()`、`simulateFixture()`、`standings.js`、
`circuitPoints.js`、`honors.js`、SeasonState engine、SeasonState v2 投影。

---

## 5. CS 賽事模型（MVP）

```
CS Season S1（competitionByMode.cs，錨在建立當天）
│
├─ Event: CS 官方聯賽（careerEventId for cs）
│    Competition: comp:cs:s1:official:regular
│    Stage: round_robin, 8 隊（玩家 ＋ 7 支 CsAiTeam）
│    Fixture: matchFormat = { series: "bo1", mapPool: CS_MAPS }
│    → FinalStandings（玩家名次、冠軍、sourceMix）
│
└─ Event: CS 年度 Major
     Competition: comp:cs:s1:official:major
     Stage: single_elim, 4 隊（聯賽 standings 前四）
     Fixture: matchFormat = { series: "bo3", mapPool: CS_MAPS, veto: null }
     → FinalStandings ＋ honors（冠軍寫一筆 CS 年度冠軍）
     → SeasonSeal（CS S1 封存）→ canRollSeason("cs") → S2
```

**非目標（MVP 明確不做）**：Qualifier、Regional、跨區、BO5、真正的地圖 veto 博弈、
跨賽季全球 Ranking、CS 巡迴積分帳本、CS 轉會市場連動。

---

## 6. Shared Contract Verifier 計畫

新增 `tools/check_cs_season_contract.mjs`（靜態、唯讀，不 import React / Vite / zustand），
守下列不變式。**不得為了讓它變綠而修改契約**——見共同契約 §13。

| 檢查 | 為什麼 |
|---|---|
| 共同契約宣告 CS architecture owner ＝ Claude Code | ownership 不能只存在於對話 |
| 共同契約宣告 Competition / Season 核心為 protected contract | 防 Codex 在別的 session 誤改 |
| **不存在** `csSeasonStore` / `csCompetition` slice | 第二套 truth 的結構性封鎖 |
| `competition.js` 仍驗 `moba \| cs` 且 id 仍含 gameMode | 多遊戲命名不得退化 |
| `fixtureResultBridge` 仍只收 `MatchResult.v1` | 不得從戰鬥資料重算第二份真相 |
| `MatchResult.v1` 仍以 `session.mode` 參數化 | 項目中立性 |
| SeasonSeal / FinalStandings / careerEventId 語義錨點仍在 | 不得倒退 |
| 高衝突檔案標記 implementation owner | 跨 session 協作 |
| mutation sentinel：把 `competitionByMode` 改回單一 `competition` 必須被抓到 | 證明 verifier 真的有鑑別力 |

整合前必須跑：

```
node tools/check_cs_season_contract.mjs
node tools/check_home_team_contract.mjs
node tools/check_competition_release_gate.mjs     # 11/11，不得退化
```

---

## 7. Implementation Ownership（roadmap 預留）

| 階段 | Owner | 說明 |
|---|---|---|
| CS Season / Competition **architecture** | **Claude Code** | 本規格、schema v11 契約、verifier、milestone 拆分 |
| CS Season **core implementation** | Claude Code | store / engine / bridge，屬 protected contract |
| CS Season **UI 階段** | Claude Code 統籌，**Codex 執行前端實作** | UI 階段開始前**另建** UI contract 與 implementation prompt |
| UI 技法 | 可用 `frontend-design`、GSAP 等 skills | 呈現層可以華麗，不得影響功能邏輯 |

**Codex 在 UI 階段的邊界**：只能讀取既有 selectors / adapters / store API；
不得自行新增第二套 `csSeasonStore` / `csCompetition` truth；
不得修改 SeasonState / Event / FinalStandings / SeasonSeal 的既有語義，除非先更新共同契約。
詳見 `docs/ai/跨模型交接流程.md` §13。
