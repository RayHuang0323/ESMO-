# SeasonState v2 Runtime Contract（修復前的契約確認）

> 建立：2026-08-19　分支：`fix/seasonstate-v2-runtime-completion`（基底 `690c485`）
> 目的：**在改任何 production code 之前**，用現有程式碼、git 歷史、Codex 交接與
> 實測資料，把 v2 的正式契約釘死。本文件只做確認，不含修正。
>
> 證據等級標記：**【碼】**＝現行原始碼；**【史】**＝git／Codex 交接；
> **【測】**＝本輪實際量測（`s7b_season_sealed` / `s7e_player_one`）。

---

## Q1. legacy competition 是否仍是 gameplay truth

**是。**

**【碼】** `seasonStateV2.js` 檔頭第 1–6 行：

> SeasonState.v2 is a compatibility index around the existing SeasonState.v1.
> The legacy state remains **the single source of truth** for fixtures, outcomes,
> stages, finals and the Competition object. This module only adds stable
> Season -> Circuit -> Event references; it **never copies or reorders gameplay
> data** and it never creates a CS event.

**【史】** Codex 交接 §1.1、§10：「legacy `competition` 是唯一 gameplay truth」。

⇒ 修復不得把 v2 變成第二套 truth，也不得讓 v2 擁有 rows／fixtures／outcomes。

## Q2. v2 是否只保存 metadata / references

**是，且有明文禁止複製 rows。**

**【碼】** `wrapLegacySeasonState()` 內 Event 註解：
`// Final is reference-only: never embed FinalStandings.rows here.`
Event 只存 `competitionRef`、`stageIds`、`playoffRef`、`fixtureIds`、`outcomeIds`、
`finalId`、`status`、`sealedAtDay`、`prizePolicyRef`、`pointsStatus`、`final`（envelope）。

**【碼】** `legacyPrizePolicyRefFor()` 註解：Compatibility reference only；
指向既有 Q4 獎金演算法與政策，不把 prize table 複製進 v2。

**【史】** Codex §2.2：「v2 只作 representation/reference」。

## Q3. `wrapLegacySeasonState()` 應如何取得 active Competition / Event

**現行寫法讀 `legacyState.competition` —— 那個屬性不存在。**

**【碼】** `createSeasonState()`（`seasonState.js:180-212`）產生的形狀：

```js
competitions: { [competitionId]: { competition, stage, playoff, expectsPlayoff } },
circuits:     { [circuitId]: circuit },
events:       { [eventId]: { ...event, competitionIds, rankingCompetitionId, prizePolicy } },
activeEventId: <eventId>,
careerEventId: <eventId>,
```

**【碼】** 正式 accessor：`activeEntryOf(state)`（`seasonState.js:88`）＝
`competitionEntries(state)[0]`；`activeCompetitionOf(state) = activeEntryOf(state)?.competition`。

⚠ **【碼】** `activeEntryOf` 的註解明文：「**刻意不讀 `activeEventId`**。那是畫面聚焦用的，
讀了就會變成規則跟著畫面跑，那是災難。」

**【測】** 兩份存檔皆 `competitions` 5 個、`events` 5 個、**無 `competition` 屬性**。

⇒ **正解**：v2 migration 必須走 `events{}` 與 `competitions{}`，
每個 legacy Event 用它自己的 `rankingCompetitionId` 當 `competitionRef`。
**不得**再讀 `legacyState.competition`。

## Q4. multi-event season 應建立多少 v2 Event

**與 legacy `events{}` 數量一致——實測是 5 個，不是 1 個。**

**【測】** 兩份存檔的 `events{}`：

| legacy Event | rankingCompetitionId |
|---|---|
| `event:circuit:moba:s1:legacy:regular` | `comp:moba:s1:official:regular` |
| `event:circuit:moba:s1:asia:spring` | `comp:event:circuit:moba:s1:asia:spring:regular` |
| `event:circuit:moba:s1:asia:summer` | `comp:event:circuit:moba:s1:asia:summer:major` |
| `event:circuit:moba:s1:asia:autumn` | `comp:event:circuit:moba:s1:asia:autumn:championship` |
| `event:circuit:moba:s1:asia-finals:annual` | `comp:event:circuit:moba:s1:asia-finals:annual:championship` |

**【史】** Codex §8-2.3 把「v2 index 要代表整個 Event collection、還是只代表 active
compatibility Event」列為**尚未收口的契約**。⇒ 本次由使用者裁決為**忠實映射全部**。

⚠ **【測】** Event 狀態**可以混合**：`s7e_player_one` 的聯賽 Event `final` 為 null（進行中），
三個巡迴站與年度總決賽卻已有 final。
⇒ v2 Event 的 `status` 必須**逐 Event** 由 `events[eid].final` 決定，
不能用 Season 層的 `state.final` 一概而論。

## Q5. v2 active pointer 應指向哪個 Event

**指向 legacy 的 `activeEventId`。**

理由（三方一致）：

- **【碼】** `competitionView()` 的積分榜就是用 `tryEventStandingsOf(state, state.activeEventId)`。
- **【史】** Codex §4.2：「`activeEventId` 是 UI focus，不是規則 truth」；
  adapter 的職責是給舊 caller 一個**有 scope 的** active Event。
- **【碼】** `activeEntryOf` 刻意不讀 `activeEventId`，代表**規則層**不看它——
  但 v2 的 `active` 服務的正是 compatibility／畫面聚焦這一側。

⇒ deterministic／idempotent：同一份 legacy state 必得同一個 `active`，
且 `active.eventId` 必須存在於 `events{}` 中，否則不得產生（fail closed）。

## Q6. `careerEventId` 與 `activeEventId` 是否必須分離

**必須分離。**

**【碼】** `seasonState.js:208-212` 原文註解：

> `careerEventId`：**生涯主要賽事**。建立者當下就知道是哪一個，直接寫下來。
> ⚠ 這與 `activeEventId` 是**兩件事**：那是畫面聚焦、可被玩家切換；
> 這是生涯主線，寫定之後不隨畫面改變。

**【測】** 目前兩份存檔中兩者**恰好相同**（都是 legacy 聯賽 Event）——
但那是巧合，不是契約。v2 不得假設兩者相等。

⇒ v2 `active` 用 `activeEventId`；`careerEventId` 若要表達，應是 Event 上的獨立標記，
**不得**拿來當 `active`。

## Q7 / Q8. sealed Event 的 final reference 應該引用什麼

**引用該 Event 自己的 `events[eventId].final`（`FinalStandings.v1`，有 id），
不是 Season 層的 `SeasonSeal.v1`。**

**【碼】** 現行錯誤：`wrapLegacySeasonState()` 用
`awardEnvelopeOf(legacyState.final, awardLedger)`——那是 **Season 層**的 final。

**【碼】** `applySealSeason()`（`seasonState.js:845-857`）：

```js
const final = ids.length === 1
  ? eventFinalOf(state, ids[0])            // 單 Event：與 Event final 同一物件
  : { schema: "SeasonSeal.v1", season, sealedAtDay, eventIds };   // 多 Event：無 id
```

**【測】** `s7b_season_sealed`：

- Season 層 `final` = `SeasonSeal.v1`，**`id` 不存在**
- 五個 Event 的 `final` **全部是 `FinalStandings.v1` 且都有 id**
  （`final:comp:moba:s1:official:regular` 等），rows 8／8／8／8／4

**【碼】** `awardEnvelopeOf()` 開頭先取 `sourceRefOf(final, "final")`，取不到就回 `null`
⇒ 傳 SeasonSeal 進去必得 `null` ⇒ event 被標 `sealed` 卻 `final` 為 null
⇒ 驗證條件 `event.status === sealed && !event.final` 觸發 **`sealed_without_final`**。

⇒ **正解**：v2 Event 的 final envelope 一律由 **`eventFinalOf(state, eventId)`** 取得。
**不得替 SeasonSeal 造 id**（那會憑空發明識別碼，違反 reference-only 契約）。
Season 層的封存狀態由 `state.final != null` 表達成 `SEASON_STATUS.sealed` 即可，
**Season 不需要 final reference**——`SeasonSeal` 本身就只是封存標記。

## Q9. rollover 後 S1 history / S2 active / Event references 是否一致

**契約如下（三者互相獨立，不得混用）。**

**【碼】** `rollToNextSeason()`（`seasonState.js:902-928`）：

- 回傳全新的 `made.state`（`createSeasonState`），並斷言新賽季必須乾淨
  （`outcomes.length === 0 && !final`），否則 `not_clean` 直接失敗。
- `archived = tryCareerFinalStandingsOf(state) ?? state.final`
  ⚠ 註解明文：歷屆成績存的是**生涯主要賽事的最終名次**，不是賽季封存物件；
  多 Event 時 `state.final` 是 SeasonSeal（沒有 rows），存進歷史等於讓歷屆成績頁失去內容。

⇒ 對 v2：

- **S1 → history**：`migrateSeasonStateV2` 遇到**新的 season id** 是明確允許的
  rollover 邊界（Codex §2.2），應重建 wrapper 並把上一季存進 v2 `history`（reference-only）。
- **S2 active**：新賽季只有一個 Event（`createSeasonState` 產生單一 Event ＋
  `activeEventId`），`active` 指它；之後掛上巡迴賽才變成多 Event。
- **Event references**：新賽季的 legacy id 一律**不得**被 v2 改寫（Codex §2.2）。

---

## 契約總表（修復必須同時滿足）

| # | 契約 | 依據 |
|---|---|---|
| C1 | legacy 是唯一 gameplay truth，v2 不得持有 rows／fixtures／outcomes | 【碼】檔頭、【史】Codex §1.1 |
| C2 | v2 只存 reference／identity／status | 【碼】Event 註解 |
| C3 | migration 讀 `events{}`／`competitions{}`，**不得**讀 `legacyState.competition` | 【碼】`createSeasonState`、【測】無此屬性 |
| C4 | 每個 legacy Event ⇒ 一個 v2 Event（實測 5 個） | 【測】、使用者裁決 |
| C5 | Event `status` 逐 Event 由 `events[eid].final` 決定（可混合） | 【測】`s7e_player_one` 混合狀態 |
| C6 | `active` = legacy `activeEventId`，且必須存在於 `events{}`，否則 fail closed | 【碼】`competitionView`、【史】Codex §4.2 |
| C7 | `careerEventId` ≠ `activeEventId`，不得互相代用 | 【碼】`seasonState.js:208-212` |
| C8 | Event final envelope 取自 `eventFinalOf(state, eid)`（有 id） | 【測】五個 Event final 皆有 id |
| C9 | **不得**替 `SeasonSeal` 造 id；Season 封存只用 status 表達 | 【碼】`applySealSeason`、C2 |
| C10 | adapter scope 不符時仍 fail closed，**不得** fallback 到 `get().competition` | 【史】Codex §9、使用者指示 |
| C11 | migration deterministic／idempotent；load/save 重新推導，不需破壞式遷移 | 【史】Codex §4.1、§2.2 |
| C12 | 不得改動 legacy fixture／outcome／final／session／reward 的任何 id | 【史】Codex §9 |

## 現行實作違反的項目

| 契約 | 違反處 | 後果 |
|---|---|---|
| C3 | `wrapLegacySeasonState` 讀 `legacyState.competition` | 守衛必定觸發 ⇒ 空 v2 |
| C4 | 只建 1 個 league Event | 多 Event 賽季無法忠實表達 |
| C5 | `status` 由 Season 層 `legacyState.final` 決定 | 混合狀態無法表達 |
| C8 | final envelope 取自 Season 層 `legacyState.final` | 多 Event 時必得 null |
| C9 | （未違反，但因 C8 錯誤而觸發）`sealed_without_final` | 驗證失敗 ⇒ `activeEventOf` 回 null |
| C6 | adapter 用 `legacyState?.competition?.id` 比對 | 恆為 null ⇒ `compatible` 恆 false |

⇒ **這些是同一個 root cause 的不同表現：v2 migration 寫的是 Q7a-3b 之前的 legacy 形狀。**
