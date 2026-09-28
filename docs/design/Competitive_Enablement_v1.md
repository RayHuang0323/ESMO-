# Competitive Enablement v1 — 系統層

> 日期：2026-09-22　基線：`origin/main` = `dc520f1`（MOBA Fairness Production Release）
> 分支：`feature/competitive-enablement`（獨立 worktree `.sprints/competitive-enablement`）
> 性質：**系統層 contract ＋ 純函式實作**。沒有伺服器、沒有配對、沒有即時連線、沒有 UI。
> 驗證器：`tools/check_competitive_enablement_v1.mjs`（**130/130 PASS**，含 4 個 sentinel 實測）
> 前置文件：`Season_vNext_生涯與線上競技公平架構.md`（I1–I16）、
> `Online_Competitive_Power_Contract_v1.md`（§4 責任、§11 guardrail）、
> `Player_Challenge_Async_PvP_Architecture_v1.md`（§7.4 Ranked 介面位置）

---

## 0. 一頁摘要

| # | 問題 | 結論 | 狀態 |
|---|---|---|---|
| 1 | 正式入口與 mode contract | `platform/competitive/index.js` 唯一入口；`CompetitiveMode.v1`；`competitiveAvailability()` | ✅ 實作（入口恆關） |
| 2 | 不污染 Season standings / Circuit Points / honors | ranked 來源**結構上**沒有賽事欄位；結算入口拒收；結果契約拒收賽季鍵 | ✅ 實作 |
| 3 | 不靠大量對戰刷永久能力 | **兩層**：結算入口硬拒 ranked（第一層）＋ 成長 0 / XP 0 / 獎金粉絲 0（第二層） | ✅ 實作 |
| 4 | CareerTime ↔ ServerTime 分離 | `time/serverClock.js`（ServerTime.v1），與 `worldClock.js` 互不 import；**不退回裝置時間** | ✅ 實作（無權威來源 ⇒ unavailable） |
| 5 | 既有每日容量規則 | 3 場／世界日、跨日歸零、不跨日累積、只有一般對戰吃容量 —— **實測正確**，ranked 不吃 | ✅ 驗證 |
| 6 | Competitive result / rating / record 資料責任 | `CompetitiveResult.v1` ＋ `CompetitiveRecord.v1`：ranked authority 擁有，**不進生涯存檔**，MOBA/CS 分帳 | ✅ 實作（純 reducer，無持久化） |
| 7 | 生涯 roster 安全帶入 | `rosterBridge.buildCompetitiveEntry()`：走 Challenge 既有權威層，`powerHash` 不含生涯時間 | ✅ 實作（MOBA；CS 明確拒絕） |
| 8 | CBR 接口 Cap → Bracket → Rating | `CbrPipeline.v1`：順序與每階段可見輸入**結構性**固定；預設政策**零數值** | 📄 接口（政策 LATER） |

```text
COMPETITIVE_ENABLEMENT_COMPLETE = YES（系統層）
COMPETITIVE_ENABLED              = NO （開關 false，且無權威伺服器時間 ⇒ 入口恆關）
SERVER_TIME_REQUIRED             = YES（Rated 配額與評分週期；本輪只立契約與推導）
READY_FOR_ONLINE_FOUNDATION      = YES
```

---

## 1. Audit（以程式為準）

| 項目 | 發現 |
|---|---|
| 名詞衝突 | `MATCH_SOURCE.competitive` 是 V0C 取的名字，玩家看到的是「**一般對戰**」（生涯內排隊，有成長）。本輪的 Competitive 是**線上競技排位** ⇒ 新增獨立一格 **`ranked`**，玩家看到「**競技排位**」。⚠ **不 rename** 既有 `competitive`（已進存檔、交易單、十幾支 gate） |
| 「Competitive flag disabled」 | Fairness 系列文件的 `COMPETITIVE_ENABLED = NO` 在程式裡**沒有對應開關**，只是狀態字串。本輪立了唯一開關 `COMPETITIVE_ENABLED`（`competitiveMode.js`） |
| 每日容量 | `worldClock.COMPETITIVE_BLOCK.matchesPerDay = 3`、`competitiveBlockOf()` 推導、`enqueueMatch` 擋 `competitive_block_full`、`applyProgressToState` 只對 `competitive` 扣格 —— 全部正確，本輪未改 |
| ServerTime | 全庫不存在。`Retention_v1` 明文「永久排除 ServerTime」—— 那是**Retention 的**決定（日常目標綁世界時間），與 Ranked 不衝突 |
| 生涯 roster → 線上 | `SquadSnapshot.v1` ＋ `snapshotAuthority.publishDefensiveSnapshot()` 已由 Player Challenge 建好（MOBA）。本輪**重用**，不另寫取值 |
| CBR | `main` 上沒有任何 Cap / Bracket / LadderRating 程式碼 |
| 🟡 發現（未修，另案） | `playerXpFor` 對 `challenge` 來源**沒有**歸零（只有 practice）。Challenge 的第一層（不呼叫結算）仍成立，但第二層只擋了成長倍率與獎金，XP／升級／天賦點沒擋。本輪只替 `ranked` 補齊，不順手改 Challenge 契約。登記為待辦 |

---

## 2. Mode Contract（`CompetitiveMode.v1`）

`src/platform/competitive/competitiveMode.js`

| 欄位 | 值 | 對應不變式 |
|---|---|---|
| `matchSource` | `ranked` | 獨立一格（TD-36：不得用 competitive＋旗標） |
| `clock` | `server` | I1 / I5 |
| `modes` / `crossModeShared` | `["moba","cs"]` / `false` | I9 |
| `careerWriteback` | `none` | I2 / I3 / I14 |
| `careerGrowth` / `careerRewards` | `0` / `0` | I2 / I3 |
| `careerEnergy` | `untouched` | I14 |
| `worldDays` | `0` | I1 |
| `careerCapacity` | `not_consumed` | — |
| `seasonLedgers` | `none` | §3 |
| `ratedQuota` | `RatedQuota.v1` | I16 |
| `ratingName` | `LadderRating` | 不與 BattleResult 單場 `rating` 混用 |
| `recordOwner` | `ranked-authority` | §6 |

**正式入口** `competitiveAvailability({ mode, serverClock, quotaState })` 回傳**全部**不可用理由，順序固定：
`competitive_disabled` → `mode` → `server_time_unavailable` → `rated_quota_exhausted`。
今天呼叫一定得到前兩條以上 ⇒ 入口恆關，這是正確狀態。

⚠ 開關**不放** `featureFlags.js`：那裡的語意是「dev 工具還在不在」，而且
Codex 的 VFX 分支正在改那個檔。Competitive 開關是產品契約的一部分，
而且打開它需要真伺服器時間，不是改一個布林就能上線。

---

## 3. 與 Career / Season 的隔離

```
競技排位結果 ──▶ CompetitiveRecord（ranked authority）
                     ✗ applyMatchProgress   ← 第一層：拒收 ranked_not_career，連冪等帳都不記
                     ✗ 賽季名次／巡迴積分／冠軍 ← 來源不帶 competitionId/stageId/fixtureId（validateOrigin 擋）
                     ✗ players[].stats / xp / energy
                     ✗ finance / fans / formLog / retention / clubMastery / clubXp
                     ✗ meta.days / meta.competitiveBlock
```

| 防護 | 位置 | 性質 |
|---|---|---|
| 結算入口拒收 ranked | `applyMatchProgress.js` 1b | **第一層（設計）** |
| `sourceBase.ranked = 0` | `careerGrowth.js` | 第二層（防呆） |
| `teamRewardsFor` / `playerXpFor` 早退 | `rewardFormulas.js` | 第二層（防呆） |
| `WORLD_TIME_COST.ranked = 0` | `worldClock.js` | 宣告（I1） |
| 結果契約拒收賽季鍵／生涯鍵／生涯時間 | `competitiveRecord.validateCompetitiveResult` | 邊界 |
| 賽季模組不 import competitive；competitive 不 import Store／賽季／結算 | verifier §B13/B14 | 結構 |

⚠ `matchSourceFromOrigin` 必須**認得** ranked：掉進 `unknown` 的話成長倍率是 **1.0**，
「漏接線」就直接變成刷能力的管道。

---

## 4. CareerTime ↔ ServerTime

`src/platform/time/serverClock.js`（`ServerTime.v1`）

- `serverDayOf(epochMs)`：全世界同一刻換日（`SERVER_DAY.resetUtcHour = 0`），不跟玩家時區。
- `createServerClock(provider)`：**沒有權威 provider ⇒ unavailable**。
  ⚠ **刻意不退回 `Date.now()`**：裝置時間可以改，退回它等於讓「改手機日期」重置 Rated 配額。
- 與 `worldClock.js` **互不 import**（verifier D7/D8；`check_world_time_v1` N2 也同步收緊）。
- `findCareerTimeKeys()`：`days / careerDay / careerYear / worldDay / lastPublishedCareerDay`
  出現在任何線上資料 ⇒ 違反 I4/I5。

**是否還需要 ServerTime？——需要。** Rated 配額（I16）與未來的評分週期都必須綁一條
玩家快轉不了的時鐘。本輪只立契約與推導；**權威時間來源必須由 Online Foundation 的後端提供**。

---

## 5. 每日容量

| | 一般對戰容量（既有） | Rated 配額（本輪） |
|---|---|---|
| 常數 | `COMPETITIVE_BLOCK.matchesPerDay = 3` | `RATED_QUOTA.ratedPerServerDay = 3` |
| 時鐘 | CareerTime | **ServerTime** |
| 節流什麼 | 生涯成長 | 線上評分場次 |
| 分模式 | 不分（俱樂部一份） | **分**（I9） |
| 存哪 | `meta.competitiveBlock` | ranked authority |
| 可購買 | — | **永不**（`purchasable:false`，額外參數一律忽略） |

既有規則實測（verifier §E）：同日累計、跨日歸零、**不跨日累積**（I7）、超用夾住、
一般對戰扣格／練習與正式賽不扣、排隊入口擋 `competitive_block_full`、ranked 進不了結算。
兩個常數在兩個檔案、互不引用（§E11）。

---

## 6. 資料責任：Result / Rating / Record

`src/platform/competitive/competitiveRecord.js`

- `CompetitiveResult.v1`：`resultId, mode, serverDay, outcome, rated, entryPowerHash, opponent{teamId, powerHash}, bracketId`。
  **只收線上自己的東西**；夾帶賽季鍵（`season_leak`）、生涯鍵（`career_leak`）、生涯時間（`career_time_leak`）一律拒收（遞迴）。
- `CompetitiveRecord.v1`：`byMode.{moba,cs}.{ladderRating, ratingPolicy, played, wins, losses, draws, history[≤50], processed}`。
  - 冪等鍵 `resultId`，**每模式一本帳**；歷史裁切不影響冪等帳。
  - `ladderRating` 預設 **null**（未評分；不是 0，也不是 1500）。
  - unrated 場只進歷史，不進戰績。
- `COMPETITIVE_RECORD_OWNER = { owner: "ranked-authority", persistedInCareerSave: false, trusted: false }`。
  ⚠ **不進生涯存檔**：存在玩家的 localStorage 等於讓玩家直接改自己的評分。
  `profileStore.js` 沒有任何 competitive 欄位（verifier §F15）⇒ **不需要動 saveBundle 分類**。

---

## 7. 生涯 roster 帶入（`CompetitiveEntry.v1`）

`src/platform/competitive/rosterBridge.js`

```
careerState ─▶ publishDefensiveSnapshot(intent: "entry")   ← Player Challenge 既有權威層（同一支取值、同一套正規化）
            ─▶ SquadSnapshot.v1（簽發者 esmo.local-authority.v1, trusted:false）
            ─▶ powerInputsOf(snapshot)  ─▶ powerHash
            ─▶ CompetitiveEntry.v1（deep-frozen，I10）
```

- **兩個雜湊**：`snapshotHash`（含簽發時刻、生涯日 ⇒ 查帳）／`powerHash`（只含影響模擬的輸入 ⇒ 公平）。
  實測：生涯日 10 → 400、陣容不變 ⇒ `powerHash` 逐字元相同（I4）；能力 +1 ⇒ `powerHash` 改變。
- 生涯狀態**只讀**（verifier G2：JSON 前後逐字元相同）。
- 請求夾帶數值 ⇒ 拒絕（client trust boundary 不放寬）。
- provenance 依 Online Power Contract §5/§11：`guardrail: { applied:false, policy:"none" }` ⇒ effective = raw。
- **CS**：回 `mode_not_supported_yet`。SquadSnapshot 只有 MOBA 的取值路徑（Challenge：MOBA first）。

---

## 8. CBR 接口（`CbrPipeline.v1`）

`src/platform/competitive/cbrPipeline.js`

| 階段 | 收得到 | 收不到 | 預設政策 |
|---|---|---|---|
| **Cap** | `powerInputs`（凍結副本）、注入的 `pricer` | — | `cap.unset`：eligible、`priced:false`、`price:null` |
| **Bracket** | `price` | 原始能力、陣容 | `bracket.open`：單一開放級 |
| **Rating** | `ladderRating`、`bracketId` | 陣容、價格 | `rating.unrated`：範圍 `null`、結果不改評分 |

- Cap 拒絕 ⇒ 停在 cap，不進後兩階段。
- 政策想改 `powerInputs` ⇒ 丟例外（凍結副本）。
- **不自建戰力公式**：定價由呼叫端注入（未來委派 `teamStrength.v1` 或其後繼）。
- **零數值**：verifier H14 去掉註解與字串後，管線程式碼裡一個數字常值都沒有。
- 評分政策可插拔：`applyCompetitiveResult(record, result, { ratingPolicy })`；注入之前 LadderRating 恆為 null。

⚠ Online Power Contract §11.6 的前置條件**仍然有效**：在 `teamStrength` 與模擬對齊（I12/I13）之前，
不得把任何 Cap 定價寫成 FINAL。本輪的 Cap 只是「位置」，不是「價格」。

---

## 9. 已實作 vs 只是 contract

| 已實作（純函式，有 verifier） | 只是 contract／接口 |
|---|---|
| `ranked` 來源／origin／層級名稱 | Cap / Bracket / Rating 的**政策與數值** |
| 結算入口拒收 ＋ 第二層歸零 | 權威伺服器時間來源（provider） |
| `ServerTime.v1` 推導、無 provider ⇒ unavailable | Rated 配額與戰績的**持久化**（屬後端） |
| `RatedQuota.v1`（per mode、只由伺服器日重置、不可購買） | 配對、房間、即時連線、排行榜 |
| `CompetitiveResult.v1` / `CompetitiveRecord.v1` reducer | CS 的權威取值路徑 |
| `CompetitiveEntry.v1`（MOBA roster 帶入） | 任何 UI 入口（本輪刻意不做） |
| `competitiveAvailability()` 正式入口 | 結果的簽章／防竄改（目前 FNV-1a，非密碼學） |

---

## 10. 為了不撞 Codex VFX Release 做的取捨

Codex 的 `feature/moba-hero-skills-phase1` 動了：`featureFlags.js`、`useLocalServer.js`、`LogicEngine.js`、
`src/battle/moba/**`、`tools/verify.mjs`、handoff `00/04/05/06/08/09`。本輪：

- **沒碰** battle runtime、VFX、`LogicEngine`、`useLocalServer`、`featureFlags.js`、`verify.mjs`。
- 開關住 `competitiveMode.js`（而不是 `featureFlags.js`）。
- 新 gate 秒級、不 fan-out ⇒ 不需要登記進 `verify.mjs`。
- handoff 只依協議追加 `05_Sprint紀錄.md` 一節（**合併時該檔尾端預期會有 append 衝突，兩邊都保留即可**）；
  其餘內容寫在本檔，沒有改 `00/04/06/08`。

---

## 11. Online Foundation 的前置清單（下一輪）

1. 後端提供**權威時間** ⇒ 接 `createServerClock(provider)`。
2. 後端持有 `CompetitiveRecord` 與 Rated 配額狀態（本輪的 reducer 可直接搬過去當 server-side 純函式）。
3. 快照簽發改由後端做（`SNAPSHOT_AUTHORITY.trusted` 才能變 true）。
4. CS 的權威取值路徑（`SquadSnapshot` 的 CS 版本）。
5. `teamStrength` ↔ 模擬對齊（I12/I13）之後，才能注入真正的 Cap 定價政策。
6. 以上完成前，`COMPETITIVE_ENABLED` 維持 `false`。
