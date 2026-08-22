# CS Season / Competition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 CS 擁有完整的賽季／賽事生命週期（聯賽 → Major → 封存 → 換季），共用既有 Competition Platform，不建立第二套 Season truth。

**Architecture:** `profileStore.competitionByMode = { moba, cs }`——同一套 canonical engine，依 gameMode 各持一個 SeasonState instance。`competition` 降為 `competitionByMode.moba` 的唯讀別名，舊 API 保留 `mode = "moba"` 預設，讓 Q7f / Release Gate 11 區段一行都不用改。CS 的比賽接上既有 MatchSession / ActiveMatch / MatchResult.v1 → FixtureOutcome 鏈路。

**Tech Stack:** React 18 + Vite 5 + zustand。無測試框架 ⇒ 驗證＝`node tools/check_*.mjs` ＋ `npm run build` ＋ browser gate（CDP）。

**Spec:** `docs/design/CS_賽事系統架構規格.md`

## Global Constraints

- `competitionByMode` 是唯一 canonical runtime structure；`competition` **只讀不寫**，不得雙寫。
- 所有新 CS code **必須 explicit 傳 `mode: "cs"`**，不得依賴 `mode = "moba"` 預設。
- **不得**修改 `SeasonState` / `Event` / `FinalStandings` / `SeasonSeal` / `careerEventId` / `canRollSeason` 的既有語義。要改先更新 `docs/design/CS_賽事系統架構規格.md` 與 `docs/ai/跨模型交接流程.md` §13。
- **不得**為了讓 verifier 變綠而降低 assertion 或 rebaseline。
- 每個 milestone 結束都要跑：`node tools/check_cs_season_contract.mjs`、`node tools/check_home_team_contract.mjs`、`node tools/check_competition_release_gate.mjs`（**必須 11/11**）、`npm run build`。
- 一個 Fixture = 一個 series = 一個 FixtureOutcome；`score` 記地圖數，Season 層不認識地圖。
- 回覆使用繁體中文；程式碼、commit message、檔名用英文。

---

## Milestone 對照表

| Milestone | 交付 | 可驗收？ |
|---|---|---|
| **M0** | schema v11 雙讀相容遷移（無 CS 內容） | ✅ 既有 11 區段仍 11/11 |
| **M1** | CS 聯賽 lifecycle，僅模擬／棄權 | ✅ CS S1 可自然走到封存 |
| **M2** | 玩家實際出戰 CS 賽程（MatchSession / ActiveMatch / resume） | ✅ **CS Season MVP 的最低完成線** |
| **M3** | 年度 Major（`single_elim` ＋ BO3） | ✅ CS 封存需經 Major |
| **M4** | CS Season Recap ＋ 換季（UI 階段，Codex 執行） | ✅ 真實存檔驗收 |

⚠ **M1 只是技術 milestone。真正的 CS Season MVP 至少要完成 M2。**

---

## M0 — schema v11 雙讀相容遷移

**目標**：把 store 從「單一 competition」改成「keyed by gameMode」，且**既有行為逐值不變**。
這個 milestone 結束時 CS 仍然沒有任何賽季——它證明的是「遷移沒有弄壞 MOBA」。

### Task M0-1: v11 遷移 ＋ 唯讀別名

**Files:**
- Modify: `src/platform/profileStore.js`（`PROFILE_SCHEMA_VERSION`、initial state、`load()`、`save()`）
- Test: `tools/check_cs_schema_v11.mjs`（新建）

**Interfaces:**
- Consumes: 既有 `upgradeSeasonShape()`、`arr()`
- Produces:
  - `PROFILE_SCHEMA_VERSION = 11`
  - `competitionByMode: { moba: SeasonState|null, cs: SeasonState|null }`
  - `competitionHistoryByMode: { moba: FinalStandings[], cs: FinalStandings[] }`
  - `competition`（getter）→ `competitionByMode.moba`
  - `competitionHistory`（getter）→ `competitionHistoryByMode.moba`

- [x] **Step 1: 寫失敗測試** — 建 `tools/check_cs_schema_v11.mjs`，斷言：v10 存檔載入後 `competitionByMode.moba` 逐值等於原 `competition`；`competitionByMode.cs === null`；`competition` 別名讀得到同一個物件；寫入只發生在 `competitionByMode`。

```js
// tools/check_cs_schema_v11.mjs（節錄）
import { useProfileStore } from "../src/platform/profileStore.js";
const v10 = JSON.parse(readFileSync("review/fixtures/competition/s7e_player_one.json", "utf8"));
localStorage.setItem("esmo.profile.v1", JSON.stringify(v10));
const st = useProfileStore.getState();
ck("v10 存檔升版後 moba instance 逐值相同",
  JSON.stringify(st.competitionByMode.moba) === JSON.stringify(v10.competition));
ck("cs instance 初始為 null", st.competitionByMode.cs === null);
ck("competition 別名指向 moba instance", st.competition === st.competitionByMode.moba);
ck("schemaVersion 升到 11", st.schemaVersion === 11);
```

- [x] **Step 2: 跑測試確認失敗** — `node tools/check_cs_schema_v11.mjs` → 預期 FAIL（`competitionByMode` undefined）。
- [x] **Step 3: 實作遷移** — initial state 改為 `competitionByMode: { moba: null, cs: null }`；`load()` 遇到 v10 存檔時把 `saved.competition` 搬進 `.moba`；`competition` 改為 getter；`PROFILE_SCHEMA_VERSION = 11`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: 跑既有回歸** — `node tools/check_competition_release_gate.mjs` 必須 **11/11**。這是本 task 真正的驗收：遷移不得動到 Q7f。
- [x] **Step 6: Commit** — `git commit -m "feat: key season state by game mode with read-through aliases"`

> **與計畫的兩處偏差（2026-08-21 實作時記錄，不是事後合理化）**
>
> 1. **Step 1/2 的順序沒有照做。** 實際是先實作再補 verifier，然後才回頭證明它在
>    改動前是紅的——把 `git show HEAD:src/platform/profileStore.js` 取出成暫存模組跑一次，
>    實測 `schemaVersion = 10`、`competitionByMode === undefined`、`competitionView("dota")`
>    不丟例外，⇒ §1／§3 的斷言在改動前確實全紅。**red 步驟是補做的，不是原生的。**
> 2. **`competition` 沒有做成 getter。** zustand 的 `set()` 是 `Object.assign` 語義，
>    getter 在第一次 `set({ competition })` 之後就會被**求值後的純值**覆蓋，
>    等於別名當場退化成第二份 truth。改用寫入轉接（`routeCompetitionWrite`）＋
>    投影別名，達成同樣的契約（別名永遠是 canonical 的同一個參考）且對呼叫端零改動。
>    細節與 `useProfileStore.setState` 也必須包的理由見規格 §3.3b。

### Task M0-2: 既有 API 加 mode 參數

**Files:**
- Modify: `src/platform/profileStore.js:787`（`ensureCompetitionSeason`）、`:1290`（`competitionView`）、`activeCompetitionEvent`、`_syncSeasonStateV2`

**Interfaces:**
- Produces: `competitionView(mode = "moba")`、`ensureCompetitionSeason(mode = "moba")`、`activeCompetitionEvent(mode = "moba")`

- [x] **Step 1: 寫失敗測試** — 在 `check_cs_schema_v11.mjs` 追加：`competitionView()` 與 `competitionView("moba")` 回傳逐值相同；`competitionView("cs")` 在無 CS 賽季時回 `hasSeason: false`。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — 四支 API 加 `mode` 參數，內部一律讀 `competitionByMode[mode]`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: 跑 Release Gate 確認 11/11**（預設參數證明既有呼叫端不受影響）。
- [x] **Step 6: Commit** — `git commit -m "feat: parameterise competition selectors by game mode"`

---

## M1 — CS 聯賽 lifecycle（模擬／棄權）

**目標**：CS S1 可以從建立走到封存，全程不需要玩家實際下場。

### Task M1-1: CS 賽季建立

**Files:**
- Modify: `src/platform/competition/regularSeason.js`（`buildRegularSeason` 支援 cs 隊伍池）
- Modify: `src/platform/profileStore.js`（`ensureCompetitionSeason("cs")`）
- Test: `tools/check_cs_season_lifecycle.mjs`（新建）

**Interfaces:**
- Consumes: `csAiTeams.js` 的 `CS_AI_TEAM_COUNT = 8`、`CsAiTeam.v1`
- Produces: `ensureCompetitionSeason("cs")` → `competitionByMode.cs` 為合法 SeasonState，`gameMode === "cs"`，8 位參賽者，14 場玩家賽程

- [x] **Step 1: 寫失敗測試**

```js
const st = useProfileStore.getState();
st.startNewGame("standard");
st.ensureCompetitionSeason("cs");
const cs = st.competitionByMode.cs;
ck("CS 賽季建立且 gameMode 正確", cs?.schema && activeCompetitionOf(cs).gameMode === "cs");
ck("8 位參賽者", participantsOf(cs).length === 8);
ck("賽事 id 帶 cs 命名空間", activeCompetitionOf(cs).id.startsWith("comp:cs:s1:"));
ck("MOBA instance 完全未被影響", st.competitionByMode.moba === null);
```

- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — `buildRegularSeason({ gameMode: "cs" })` 從 `csAiTeams.js` 取 7 支 AI ＋ 玩家；`createCompetition({ gameMode: "cs", tier: "regular" })`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: build a CS regular season from the CS AI pool"`

### Task M1-2: CS 賽程模擬與棄權

**Files:**
- Modify: `src/platform/profileStore.js`（`advanceDay` 對兩個 instance 都結算）
- Test: `tools/check_cs_season_lifecycle.mjs`

**Interfaces:**
- Consumes: `simulateFixture()`（已讀 `fixture.gameMode`，免費支援 CS）
- Produces: `advanceDay(n)` 同時推進 `competitionByMode.moba` 與 `.cs`

- [x] **Step 1: 寫失敗測試** — 斷言：`advanceDay` 後 CS 的 AI 對戰產生 outcome；`forfeitFixture(csFixtureId)` 記為敗場；MOBA instance 的 outcome 數不受影響。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — `advanceDay` 迴圈改為 `for (const mode of ["moba", "cs"])`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: settle both disciplines when the day advances"`

### Task M1-3: CS 賽季封存

**Files:**
- Modify: `src/platform/profileStore.js`（`_sealSeasonIfFinished` per-mode）
- Test: `tools/check_cs_season_lifecycle.mjs`

**Interfaces:**
- Produces: CS 全部賽程完成 → `competitionByMode.cs.final` 為 SeasonSeal；`competitionHistoryByMode.cs` 得到一筆 FinalStandings

- [x] **Step 1: 寫失敗測試** — 全部 CS 賽程棄權後，斷言 `final` 非 null、`careerFinal.rows.length === 8`、`playerRank` 有值、MOBA 的 `final` 仍為 null。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — `_sealSeasonIfFinished(mode)`，只封存該 instance。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: 跑 Release Gate 11/11 ＋ `npm run build`**。
- [x] **Step 6: Commit** — `git commit -m "feat: seal each discipline's season independently"`

> **M1 與計畫的三處偏差（2026-08-21 實作時記錄）**
>
> 1. **`competitionHistoryByMode.cs` 在封存時**不會**拿到 FinalStandings。**
>    計畫的 Produces 這樣寫，但 MOBA 的既有語義是「封存寫 `Event.final` 與
>    `state.final`，**歷史是換季（`rollToNextSeason`）才寫的**」。照計畫寫等於
>    給 CS 一套與 MOBA 不同的 history 語義 —— 違反 §3.4「不得修改 SeasonState
>    既有語義」與 D1「同一套 canonical engine」。CS 的換季屬 M1 之後。
>    驗收改為斷言 `tryCareerFinalStandingsOf(cs)` 有 8 列、`playerRank` 有值
>    （與計畫 M1-3 Step 1 的斷言完全一致）。
> 2. **`buildRegularSeason` 的「取 7 支 AI」計畫沒有說取哪 7 支。**
>    `csAiTeams.js` 實際有 8 支。**已由使用者裁示（2026-08-21）並修正實作**：
>    CS MVP 頂級聯賽維持 8 隊，Neon Comets 定位為 development / challenger，
>    本季不打頂級聯賽也不直接進 Major，未來 Qualifier／升降級／擴充 10 隊時再納入。
>    ⚠ 第一版的兩個契約錯誤已一併修掉，**不要再犯**：
>    ① 把「9 隊不能排循環賽」寫成產品規則（實際是 `scheduleGenerator.js`
>       還沒實作輪空，隊數是產品決策）；
>    ② 用 `strengthBand === "developing"` 當參賽資格（那是實力描述，
>       調整平衡會默默改變聯賽名單）。
>    改為明文的 participant eligibility：`src/platform/competition/csSeasonConfig.js`。
>    詳見規格 §3.3c 第 1 點，守門 `tools/check_cs_league_eligibility.mjs`。
> 3. **`advanceDay` 不是單純 `for (const mode of ["moba", "cs"])`。**
>    兩個賽季共用 `meta.days`，各推各的會讓同一個日曆對兩個賽季說不同的話。
>    實作改為「先試算、取兩者交集、再落地」；只有一個賽季時完全走舊路徑，
>    一次都不多算（既有存檔的推進效能逐值不變）。

---

## M2 — 玩家實際出戰（CS Season MVP 的最低完成線）

### Task M2-1: CsMatchResult → MatchResult 橋頭

**Files:**
- Create: `src/platform/competition/csResultBridge.js`
- Test: `tools/check_cs_result_bridge.mjs`（新建）

**Interfaces:**
- Consumes: `CsMatchResult.v1`（`contracts/CsMatchResult.js`）
- Produces: `outcomeFromCsResult(csResult, { playerTeamId })` → `{ winner: "us"|"opponent", score: { us, opponent }, durationSec, seed }`

⚠ 這一支**只換座標，一個數字都不重算**——與 `fixtureResultBridge.js` 同一紀律。

- [x] **Step 1: 寫失敗測試**

```js
const cs = { schema: "CsMatchResult.v1", winner: "us", ourScore: 13, enemyScore: 7, durationSec: 2100, seed: 42 };
const out = outcomeFromCsResult(cs);
ck("勝負照抄不重算", out.winner === "us");
ck("比分照抄", out.score.us === 13 && out.score.opponent === 7);
ck("拒收 BattleResult", outcomeFromCsResult({ schema: "BattleResult.v2" }).ok === false);
```

- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — 純函式，簽名上只收 `CsMatchResult.v1`，schema 不符即回 `{ ok: false }`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: translate CS results into the neutral match outcome"`

### Task M2-2: CS 賽程 → MatchSession

**Files:**
- Modify: `src/platform/profileStore.js:915`（`startFixtureMatch` 已呼叫 `matchEntry(fixture.gameMode)`，確認 CS 路徑）
- Modify: `src/screens/fps/CsPrepScreen.jsx`（接收 fixture origin）
- Modify: `src/AppShell.jsx:192`（CS 完賽改走 fixture 結算而非直接 `settleCsMatch`）
- Test: `tools/check_cs_active_match.mjs`（新建）

**Interfaces:**
- Consumes: `outcomeFromCsResult()`、`createMatchResult({ session, outcome })`、`fixtureOutcomeInputFrom()`
- Produces: CS fixture 可 `launched` → `completed`，產生 `FixtureOutcome`

- [x] **Step 1: 寫失敗測試** — 斷言：`startFixtureMatch(csFixtureId)` 產生 `session.mode === "cs"` 且 `origin.kind === "fixture"`；完賽後 CS fixture 狀態為 `completed`；`csHistory` **不再**是賽程賽果的唯一去處。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — CS 賽前流程接 fixture origin；`CsMatchScreen.onFinish` 依 `isFixtureSession(session)` 分流：賽程場次走 `completeFixtureMatch`，訓練賽維持 `settleCsMatch`。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: route CS fixtures through the shared match session"`

### Task M2-3: CS ActiveMatch resume

**Files:**
- Modify: `src/screens/common/matchPrepAction.js`（確認 CS 路徑）
- Test: `tools/check_cs_active_match.mjs`

**Interfaces:**
- Consumes: `ActiveMatch.v1`（`contracts/matchSession.js`）、`activeMatchView()`

- [x] **Step 1: 寫失敗測試** — 斷言：CS `launched` session ＋ 有效 ActiveMatch snapshot ⇒ `primaryActionFor()` 回 resume；legacy／invalid ⇒ 不顯示 resume（與 R63 TTL 契約一致）。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作** — CS 各階段呼叫 `setActiveMatchContext`（已部分存在，補齊 fixture 情境）。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: 跑 `node tools/check_r63_active_match_ttl.mjs` 確認 9/9 未退化**。
- [x] **Step 6: Commit** — `git commit -m "feat: let a CS fixture match be resumed like a MOBA one"`

> **M2 與計畫的三處偏差（2026-08-21 實作時記錄）**
>
> 1. **`setActiveMatchContext` 不必補齊。** 計畫寫「CS 各階段呼叫
>    `setActiveMatchContext`（已部分存在，補齊 fixture 情境）」——實測 AppShell
>    的 CS 流程**每一階段本來就在呼叫**（map / tactic / loading / battle），
>    而 fixture 綁定掛在 session 的 `origin` 上、不在 context 裡。
>    ⇒ 這一步實際上不需要改任何東西，resume 直接就回同一場。
> 2. **CS 比分投影是計畫沒寫、但必要的行為。** `MatchResult.v1` 對 CS 帶的是
>    Codex 的回合比分（13:7），沿用既有 `fixtureOutcomeInputFrom` 會把回合數
>    直接寫進 `FixtureOutcome`。橋接因此新增 CS 分支，只讀 `winner`，
>    投影成地圖數（規格 D4 ＋ ownership lock）。這是 M2 **唯一新增的行為**。
> 3. **加了一個暫用的 UI 進場口。** 計畫沒提入場點，但沒有入口就談不上
>    「玩家實際出戰」。`CsPrepScreen` 加了一個小區塊（開季／出戰今日賽程）。
>    ⚠ 它**不是** CS Season UI，M4 做完整賽事頁時應取代它。
>
> 另有兩條斷言在實測後被修正（第一版寫錯，理由見規格 §3.3d）：
> 「同一場不可重複 launch」的實際規則、以及「中離不得規避敗場」的實際機制。

---

## M3 — 年度 Major（single_elim ＋ BO3）

### Task M3-1: single_elim 賽程產生器

**Files:**
- Modify: `src/platform/competition/scheduleGenerator.js`
- Modify: `src/platform/contracts/competition.js:39`（`IMPLEMENTED_FORMATS` 加入 `single_elim`）
- Test: `tools/check_single_elim.mjs`（新建）

**Interfaces:**
- Produces: `buildSingleElim({ participants, stage })` → 4 隊 ⇒ 2 準決賽 ＋ 季軍戰 ＋ 決賽（與 `playoffs.js` 既有 `playoffKey` 命名一致：`sf1 / sf2 / bronze / final`）

- [x] **Step 1: 寫失敗測試** — 斷言 4 隊產生 4 場、`playoffKey` 齊全、種子順序為 standings 前四。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作**。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: generate a four-team single elimination bracket"`

> **M3-1 完成後的實作決策（2026-08-21）**——上面的 Files / Interfaces 是動工前寫的，
> 有兩項實際上**刻意沒做**，這裡照實記下：
>
> 1. **沒有新增 `buildSingleElim()`，也沒有動 `scheduleGenerator.js`。**
>    `playoffs.js` 已經是一台驗過的「4 隊單淘汰」機器（Q6 用了一整個 milestone）。
>    再寫一支等於第二套單淘汰產生器。實際做法：新增 `src/platform/competition/csMajor.js`
>    只負責 `playoffs.js` 不該知道的事（席位來自哪張榜、獨立 Event、排在哪幾天），
>    配對規則一條都不重寫。測試檔名因此是 `tools/check_cs_major.mjs` 而非 `check_single_elim.mjs`。
> 2. **沒有把 `single_elim` 加進 `IMPLEMENTED_FORMATS`。** 那個常數的語意是
>    「`generateSchedule()` 排得出來的賽制」，而 Major 根本不經過 `generateSchedule()`。
>    加進去等於讓常數說謊，下一個人照它去排單淘汰會拿到 `odd_participants` 之類的錯。
>
> 另外兩件計畫沒寫、但實作必須決定的事：
> - **Major 賽制條目的 `stage` 與 `playoff` 是同一個賽段。** Major 整個賽制就是一張
>   對戰表。這同時讓 `canSealEvent` 的 `expectsPlayoff` 守住「不得用半張對戰表封存」。
> - **CS 一季從此有兩個 Event** ⇒ 賽季封存物變成 `SeasonSeal.v1`（依設計沒有 `id`）。
>   `check_cs_season_lifecycle.mjs` 有兩條斷言隨之更新（50 → 51 條）。

### Task M3-2: BO3 series

**Files:**
- Modify: `src/platform/competition/scheduleGenerator.js`（Major fixture 帶 `matchFormat`）
- Test: `tools/check_cs_series.mjs`（新建）

**Interfaces:**
- Produces: Major fixture 的 `matchFormat = { series: "bo3", mapPool: CS_MAPS.map(m => m.key), veto: null }`；`FixtureOutcome.score` 記**地圖數**

⚠ 三張地圖池下 BO3 ＝ 打滿三張、先拿兩張者勝。**不假裝有 veto 博弈**（規格 §D4）。

- [x] **Step 1: 寫失敗測試** — 斷言：一個 BO3 series 只產生**一個** Fixture 與**一個** FixtureOutcome；`score` 為地圖數（如 `2:1`）而非回合數；SeasonState 內**找不到任何地圖識別碼**。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作**。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: Commit** — `git commit -m "feat: score a CS series by maps won, not rounds"`

> **M3-2 完成後的實作決策（2026-08-22）**
>
> 1. **`matchFormat` 掛在 `ensurePlayoffFixtures`，不在 `scheduleGenerator.js`。**
>    Major 的對戰表根本不經過 `generateSchedule()`（M3-1 的決策），所以帶
>    `matchFormat` 的地方也在對戰表產生器。上面的 Files 欄寫錯了對象。
> 2. **新增 `CS_SERIES_SIMULATOR_VERSION`（`fixtureSim.cs1.bo3`），不就地升版 `cs1`。**
>    版本字串會進亂數流的 hash，就地升版會讓既有的 CS 聯賽賽果全部平移。
>    已用基線 worktree 逐位元證實 56 場聯賽賽果 IDENTICAL。
> 3. **玩家出戰 BO3 兩道 fail-closed。** 一場 MatchResult 只代表一張地圖，
>    結算不了一個 series。擋在**進場**（而非結算）是為了避免賽程卡在 `launched`
>    造成日曆 soft-lock。series 流程屬 M4。
> 4. **棄權仍記 `0:0`**（共用的 `FORFEIT_SCORE`），不改成 `2:0`。

### Task M3-3: Major → honors ＋ CS 封存

**Files:**
- Modify: `src/platform/competition/honors.js`（CS 年度冠軍 honorType）
- Modify: `src/platform/profileStore.js`（CS 封存需經 Major）
- Test: `tools/check_cs_season_lifecycle.mjs`

- [x] **Step 1: 寫失敗測試** — 斷言：Major 完成後 `honors` 多一筆 CS 年度冠軍；CS `final` 才出現；MOBA honors 不受影響。
- [x] **Step 2: 跑測試確認失敗**。
- [x] **Step 3: 實作**。
- [x] **Step 4: 跑測試確認通過**。
- [x] **Step 5: 跑全套 ＋ `npm run build`**。
- [x] **Step 6: Commit** — `git commit -m "feat: crown a CS annual champion and seal the season"`

---

> **M3-3 完成後的實作決策（2026-08-22）**
>
> 1. **`cs_annual_champion` 是新的 honorType，不是把亞洲年度冠軍參數化。**
>    兩者來源賽事不同；合成一個之後「這筆榮耀怎麼來的」只剩 gameMode 可以猜。
>    規則仍只有一份：兩者共用抽出的 `honorFromEvent()`。
> 2. **只有年度 Major 發獎金，CS 聯賽不發。** 聯賽是資格賽，而玩家同一條日曆上
>    還跑著 MOBA 賽季——兩個項目都按聯賽發會讓一季名次收入翻倍，那是經濟平衡
>    的變更，不由這一輪決定。
> 3. **`CS_MAJOR_PRIZE` = 50/28/15/8**（約 MOBA 年度賽事的六成），獨立常數，
>    第一版基準、未校正。
> 4. **順手補上 `prizeTableFor()`**：`Event.prizePolicy.table` 在此之前是裝飾用的
>    （結算端永遠拿預設表）。MOBA 走 `default` 逐值不變。

## M4 — CS Season Recap ＋ 換季（UI 階段）

> **Owner**：Claude Code 統籌，**Codex 執行前端實作**。
> UI 階段開始前**另建** UI contract 與 implementation prompt（見規格 §7）。
> Codex 只能讀既有 selectors / adapters / store API。

### Task M4-1: CS Recap 呈現層

**Files:**
- Create: `src/screens/manage/seasonRecap/`（CS 變體，**沿用既有元件不重寫**）
- Modify: CS 賽事頁

**Interfaces:**
- Consumes: `competitionView("cs")` 的 `final` / `careerFinal` / `honorsView` / `award` / `canRoll`

⚠ Q7f 的六個區塊與 CTA 位置是**已定稿契約**，CS 版沿用其結構；差異只在 CS 沒有巡迴區塊、
亞洲年度總決賽區塊換成 Major。**不得重新設計已固定的 Recap 契約。**

- [x] **Step 1: 寫 browser gate** — `tools/browser_check_cs_season_recap_ui.mjs`，fixture 放 `review/fixtures/competition/`。
- [x] **Step 2: 跑 gate 確認失敗**。
- [x] **Step 3: 實作呈現層**。
- [x] **Step 4: 跑 gate 確認通過**。
- [x] **Step 5: 把 `cs_season_recap` 加入 Competition Release Gate（區段數 11 → 12）**。
- [x] **Step 6: Commit**。

### Task M4-2: 真實存檔驗收

- [x] **Step 1: 用真實存檔跑 CS 完整 lifecycle**（方法同 `review/q7-manual-save-acceptance/`：只在最開頭注入起始存檔，之後全用正式 gameplay action）。
- [x] **Step 2: 驗收 12 項**（載入 / 賽事頁 / standings / 自然封存 / Recap / 資料合理 / 無 undefined / CTA 一顆 / rollover / reload / Team Development / console 無 error）。
- [x] **Step 3: 確認 MOBA 完全未受影響**（MOBA Release Gate 仍 11/11、MOBA 賽季仍可獨立換季）。
- [x] **Step 4: 記錄到 `docs/handoff/05_Sprint紀錄.md`**。
- [x] **Step 5: Commit**。

---

## Self-Review

**Spec coverage**：規格 §D1→M0；§D2→M2；§D3→M1/M3；§D4→M3-2；§D5→M1-2；§D6→M1-3/M3-3；§D7→文件（無 task，刻意）；§D8→M0；§5 賽事模型→M1/M3；§6 verifier→本輪已交付；§7 ownership→M4 標註。

**Placeholder scan**：無 TBD / TODO；每個 code step 都有實際斷言或明確檔案位置。

**Type consistency**：`competitionByMode` / `competitionHistoryByMode` / `competitionView(mode)` / `outcomeFromCsResult()` 在 M0→M3 各 task 間名稱一致；`playoffKey` 沿用 `playoffs.js` 既有的 `sf1/sf2/bronze/final`。

**已知風險**：M2-2 要改 `AppShell.jsx` 的 CS 分流，那是高衝突檔案（共同契約 §12 列管）——實作前先確認沒有其他工作線同時在改。

> **M4 完成後的實作決策（2026-08-22）**
>
> M4 實際拆成 **M4-A（可玩的 BO3）→ M4-A.1（跨 session series 修正）→
> M4-B（Recap／換季／real-save lifecycle）** 三輪，而不是計畫原本寫的
> 「M4-1 Recap 呈現層 ＋ M4-2 真實存檔驗收」兩步。原因：M3-2 把 Major 做成 BO3
> 之後，玩家**根本打不了**（一場 MatchResult 結算不了一個 series），
> 所以呈現層之前必須先補上可玩性。
>
> 1. **Recap read model 擴充既有的 `competitionView(mode)`**，不另開 recap store。
>    新增 `view.csMajor`（形狀對齊既有的 `asiaFinals`）與三個 CS 榮耀欄位。
> 2. **UI 共用 MOBA 的四個 Recap 元件**（Header / League / Prize / Honor），
>    只有**對戰表**是新版面 —— 那是 MOBA Recap 沒有對應呈現的唯一一段。
>    `RecapHonor` 加一個 `champions` prop 就共用，不複製第二份。
> 3. **CS 換季走短路徑 `rollToNextCsSeason()`**，與 `_sealCsSeasonIfFinished`
>    同一條紀律；共用的是 `canRollSeason` / `rollToNextSeason` 兩支純函式。
> 4. **入口暫時掛在 CS 賽前頁**（賽季封存後改成「查看賽季成績單」）。
>    完整的 CS 賽事頁仍未做 —— 賽季**進行中**看不到 Major 對戰表，列在風險文件。
