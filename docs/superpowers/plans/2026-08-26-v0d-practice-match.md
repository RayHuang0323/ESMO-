# TD-36 + V0D 快速練習 Implementation Plan

> **For agentic workers:** 依 `superpowers:executing-plans` 逐項執行。步驟用 `- [ ]` 追蹤。

**Goal:** 讓「快速練習」成為一個有明確 `MatchOrigin` 的正式產品模式，並解除 TD-36
（`practice` 目前只是「拿不到來源」的退路，倍率因此動不了）。

**Architecture:** 完全重用既有進場管線。快速練習是**第三個 origin 生產者**，
與 `competitionGateway`（賽程）的關係就像 `mockGateway`（排隊）與它的關係——
三者都呼叫同一個 `createRoom` / `createSession`，之後的 poll / confirm / launch /
battle / result / settlement 一行都不分岔。

**Tech Stack:** 既有 `contracts/matchOrigin.js`、`contracts/matchRoom.js`、
`contracts/matchSession.js`、`progress/*`、zustand `profileStore`。

**Spec:** `docs/design/Season_vNext_長期生涯與競賽框架.md` §5.1；TD-36（`docs/09_技術債務清單.md`）

---

## Global Constraints

- **不得建立第二套 battle pipeline**：快速練習不得有自己的 Result 畫面、
  自己的結算、自己的 Room/Session 工廠。
- **不得建立第二套 settlement**：入帳一律 `applyMatchProgress`。
- **不得靠 UI route / 畫面名稱 / stage / 臨時 flag 判斷來源**（V0C 的紅線）。
- MOBA / CS **共用同一份**定義與同一個入口元件。
- 不做 Career Clock、年齡、老化、退休、Ranked、真人連線。
- `fanSourceWeight.js` 維持零 diff（粉絲行為逐值不變）。

---

## Audit 結論（先做完才動手）

**既有一般比賽流程（兩種模式共用）**

```
matchEntry(mode)            ← 陣容 → MatchEntryRequest.v1
  → createTicket / originFromFixture     ← 來源（票券 or 賽程）
  → createAssignment                     ← 對手 + seed（gateway 決定）
  → createRoom                           ← 房間
  → pollMatchRoom → confirmMatchReady    ← 雙方確認
  → createSession → launchMatchSession   ← 一次性 launchToken
  → Battle（MOBA: draft→tactic→battle／CS: tactic→battle）
  → adapter → settleMatchThroughSession → applyMatchProgress
```

**可重用度：100%。** 唯一缺的是「第三種來源」。`competitionGateway` 已經證明
**多一個 origin 生產者不需要動管線**——它自己 `createAssignment` / `createRoom` /
`createSession`，剩下全部走既有的。

**三個必須改的分派點**（否則練習房間會被當成失效票券關掉）

| 位置 | 現況 | 問題 |
|---|---|---|
| `pollMatchRoom` | `isFixtureRoom = room.origin?.kind === "fixture"` | 練習房間不是 fixture ⇒ 走票券檢查 ⇒ 沒有票券 ⇒ **一開就被關掉** |
| `createMatchSession` | `room.origin?.kind === "fixture" ? 賽事閘道 : openSession({ticket})` | 練習落到 `openSession`，沒有票券 ⇒ `createSession` 拒發 |
| `primaryActionFor` 的 retry | 非賽程一律 `requeue` → `enqueueMatch` | **練習失敗後重試會變成一場真的競技比賽**（來源被偷換） |

**產品規則的落點（為什麼放在這裡）**

| 規則 | 落點 | 理由 |
|---|---|---|
| 不給錢 / 粉絲 | `rewardFormulas.teamRewardsFor` | 那是**唯一**的獎勵公式所在地；放在 adapter 會變兩份 |
| 不給 XP | `rewardFormulas.playerXpFor` | 同上；XP = 0 ⇒ 不升級 ⇒ 不發天賦點 ⇒ 不觸發能力成長 |
| 不給永久成長 | adapter 的 `playerProgress: []` ＋ `sourceBase.practice = 0` | **雙保險**：交易單裡沒有東西可發（結構），就算有也乘 0（數值） |
| 不消耗體力 | `playerProgress: []` ⇒ `applyMatchWear` 根本不會被呼叫 | **不需要在結算裡加分支**——這是選 `playerProgress: []` 而非「xp 0 的名單」的主要理由 |
| 不計戰績 | `useBattleFeed` / `settleCsMatch` 跳過 history | 兩處各一行，來源由 origin 決定 |
| 不影響賽季 | 天然成立 | 練習來源不是 `fixture`，`completeFixtureMatch` 永遠不會被觸發 |

**「不消耗正式體力」的裁量**：採用（＝不消耗）。理由：TD-38 已量到訓練與比賽
搶同一份體力，若練習也扣體力，玩家每試一次陣容就要付出訓練效率的代價
⇒ 「試新人／試戰術」這個用途會直接死掉。純測試場不該有機會成本。

**TD-36 的解法**：`MATCH_SOURCE` 增加 `unknown`。`matchSourceFromOrigin(null)`
從 practice 改回 **unknown（base 1.0，永遠中性）**，`practice` 於是可以安全地設為 0——
「明確是練習」與「查不到來源」從此是兩件事。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/platform/contracts/matchOrigin.js` | 修改 | 第三種 kind `practice` ＋ `originFromPractice()` |
| `src/platform/progress/matchSource.js` | 修改 | `unknown` 分類；`isPracticeSource()` |
| `src/platform/progress/careerGrowth.js` | 修改 | `sourceBase.practice = 0`、`unknown = 1.0` |
| `src/platform/progress/rewardFormulas.js` | 修改 | 練習來源 ⇒ 錢／粉絲／XP 全 0 |
| `src/platform/progress/adapters/*.js` | 修改 | 傳 `matchSource`；練習 ⇒ `playerProgress: []` |
| `src/platform/matchmaking/practiceGateway.js` | **新增** | 第三個 origin 生產者（對照 `competitionGateway`） |
| `src/platform/profileStore.js` | 修改 | `startPracticeMatch()`；兩個分派點改吃 origin kind |
| `src/battle/useBattleFeed.js` | 修改 | 練習不寫 season history / hero progress |
| `src/platform/progress/settleCsMatch.js` | 修改 | 練習不寫 csHistory |
| `src/screens/common/matchPrepAction.js` | 修改 | 練習的 retry ＝ 重開練習，不是重新配對 |
| `src/screens/common/useMatchFlow.js` | 修改 | 暴露 `startPractice`；處理 `repractice` |
| `src/screens/common/MatchPrepFrame.jsx` | 修改 | 底部次要按鈕「快速練習」（MOBA / CS 自動共用） |
| `tools/check_practice_match_v0d.mjs` | **新增** | gate |

---

### Task 1: 契約層——第三種來源

**Files:** Modify `src/platform/contracts/matchOrigin.js`

**Interfaces:**
- Produces: `ORIGIN_KINDS.practice`、`originFromPractice(entryRequest) → {ok, origin, errors}`

- [ ] **Step 1: 先寫 gate 的 §O 段並跑紅**（`ORIGIN_KINDS.practice` 不存在）
- [ ] **Step 2: 加 kind、label、工廠、`validateOrigin` 分支**

```js
export const ORIGIN_KINDS = Object.freeze({ ticket: "ticket", fixture: "fixture", practice: "practice" });

export function originFromPractice(entryRequest) {
  if (!entryRequest?.transactionId) {
    return { ok: false, origin: null, errors: [{ code: "entry", message: "缺少出賽申請單，無法建立快速練習來源" }] };
  }
  return { ok: true, errors: [], origin: {
    schema: ORIGIN_VERSION, kind: ORIGIN_KINDS.practice,
    originId: `practice:${entryRequest.transactionId}`,
    mode: entryRequest.mode,
    entryTransactionId: entryRequest.transactionId,
    rosterVersion: entryRequest.rosterVersion ?? null,
    teamId: entryRequest.teamId ?? null,
    competitionId: null, stageId: null, fixtureId: null,
  } };
}
```

`validateOrigin`：把「不得帶賽事欄位」那條從 `kind === ticket` 擴成
`kind !== fixture`（practice 與 ticket 同一條規則）。

- [ ] **Step 3: 跑 gate §O 轉綠**

---

### Task 2: TD-36——把「查不到來源」與「明確是練習」分開

**Files:** Modify `src/platform/progress/matchSource.js`、`careerGrowth.js`

- [ ] **Step 1: gate §T 先紅**（`matchSourceFromOrigin(null)` 目前回 practice）
- [ ] **Step 2: 實作**

```js
export const MATCH_SOURCE = Object.freeze({
  unknown: "unknown", practice: "practice", competitive: "competitive", official: "official",
});
export function matchSourceFromOrigin(origin) {
  if (!origin || typeof origin !== "object") return MATCH_SOURCE.unknown;
  if (origin.kind === ORIGIN_KINDS.fixture) return MATCH_SOURCE.official;
  if (origin.kind === ORIGIN_KINDS.ticket) return MATCH_SOURCE.competitive;
  if (origin.kind === ORIGIN_KINDS.practice) return MATCH_SOURCE.practice;
  return MATCH_SOURCE.unknown;
}
export const isPracticeSource = (v) => normalizeMatchSource(v) === MATCH_SOURCE.practice;
```

`careerGrowth.js`：`GROWTH_SOURCES.unknown`；`sourceBase` → `practice: 0.0`、`unknown: 1.0`。

- [ ] **Step 3: gate §T 轉綠；`check_foundation_calibration` §S4 需同步更新**
      （原本斷言 `practice === competitive`，現在該斷言 `unknown === competitive` 且 `practice === 0`）

---

### Task 3: 獎勵歸零（單一定義）

**Files:** Modify `src/platform/progress/rewardFormulas.js`、兩支 adapter

- [ ] **Step 1: gate §Z 先紅**
- [ ] **Step 2:** `teamRewardsFor` 與 `playerXpFor` 各加一行早退：

```js
if (isPracticeSource(matchSource)) return { prizeWan: 0, money: 0, fans: 0 };   // teamRewardsFor
if (isPracticeSource(matchSource)) return 0;                                    // playerXpFor
```

- [ ] **Step 3:** 兩支 adapter 計算 `const source = matchSourceFromOrigin(ctx.origin ?? null)`，
      傳給上面兩支，並在練習時送 `playerProgress: []`
- [ ] **Step 4: gate §Z 轉綠**

---

### Task 4: 練習閘道（第三個 origin 生產者）

**Files:** Create `src/platform/matchmaking/practiceGateway.js`

**Interfaces:**
- Consumes: `originFromPractice`、`createAssignment`、`createRoom`、`createSession`、`MOCK_OPPONENTS`
- Produces: `issuePracticeMatch({entryRequest, players, now})`、`openRoomForPractice({assignment, now})`、
  `openSessionForPractice({room, assignment, now})`、`isPracticeAssignment(a)`

- [ ] **Step 1: gate §G 先紅**
- [ ] **Step 2: 實作**（逐段對照 `competitionGateway`；對手與 seed 由
      `entryRequest.transactionId` 決定性推導，前端不得挑）
- [ ] **Step 3: gate §G 轉綠**

---

### Task 5: Store 入口與兩個分派點

**Files:** Modify `src/platform/profileStore.js`

- [ ] **Step 1: gate §S 先紅**
- [ ] **Step 2:** `startPracticeMatch(mode, now)`——對照 `startFixtureMatch`：
      驗陣容 → 擋「已有進行中的對戰」→ `issuePracticeMatch` → `openRoomForPractice`
      → `set({ matchmaking: { ticket: null, practiceAssignment, room, session: null, launch: null } })`
- [ ] **Step 3:** `pollMatchRoom`：`isFixtureRoom` → `isTicketRoom = origin?.kind === ORIGIN_KINDS.ticket`，
      票券檢查只套在 ticket 房間
- [ ] **Step 4:** `createMatchSession`：改成依 `room.origin.kind` 三向分派
- [ ] **Step 5:** `matchPracticeContext()` → `{ inPractice: boolean }`
- [ ] **Step 6: gate §S 轉綠**

---

### Task 6: 不計戰績

**Files:** Modify `src/battle/useBattleFeed.js`、`src/platform/progress/settleCsMatch.js`

- [ ] **Step 1: gate §H 先紅**
- [ ] **Step 2:** 兩處各加一個由 origin 推出的 `practice` 判斷，跳過
      `useSeasonStore.recordResult` / `useHeroProgressStore.recordBattleResult` / `recordCsMatch`
- [ ] **Step 3: gate §H 轉綠**

> ⚠ Replay **不跳過**：能回看自己剛剛試的陣容正是快速練習的用途。

---

### Task 7: UI 入口（MOBA / CS 共用一顆按鈕）

**Files:** Modify `matchPrepAction.js`、`useMatchFlow.js`、`MatchPrepFrame.jsx`

- [ ] **Step 1: gate §U 先紅**
- [ ] **Step 2:** `primaryActionFor` 增加 `practice` context ⇒ retry 變
      `{ key: "repractice", label: "重新開始快速練習" }`
- [ ] **Step 3:** `useMatchFlow` 暴露 `startPractice()`、處理 `repractice`、
      吐出 `practice: { inPractice }`
- [ ] **Step 4:** `MatchPrepFrame` 底部在**閒置且陣容就緒**時多一顆次要按鈕
      「🧪 快速練習（不影響戰績與數值）」
- [ ] **Step 5: gate §U 轉綠**

---

### Task 8: 驗收與收尾

- [ ] **Step 1:** `node tools/check_practice_match_v0d.mjs` 全綠（含 mutation sentinel）
- [ ] **Step 2:** 既有 gate：`foundation_calibration` / `match_source_v0c` / `pcgm_v0a` /
      `fan_system` / `authoritative_o7` / `result_flow_o71` / `competition_q4` / `competition_q6`
- [ ] **Step 3:** `verify.mjs --only=progress25,talent27,growth_p0,growth_ui_p1,regress,regress2,build`
- [ ] **Step 4:** 更新 TD-36 為已解、Sprint 紀錄、Roadmap、架構文件
- [ ] **Step 5:** local commit（不 push、不 deploy）

---

## Grilling（實作前的自我壓力測試）

| 問題 | 這份計畫的答案 |
|---|---|
| 會不會刷永久能力？ | `playerProgress: []` ⇒ 交易單裡沒有選手；`sourceBase.practice = 0` ⇒ 就算有也乘 0。雙保險。 |
| 會不會刷 Fans / 金錢？ | `teamRewardsFor` 早退回 0。那是**唯一**的獎勵公式所在地，adapter 不得自己算。 |
| 會不會污染正式季賽？ | 練習來源不是 `fixture` ⇒ `completeFixtureMatch` / `applyLaunch` 永遠不會被觸發。天然成立，gate 再驗一次。 |
| 會不會被誤算成一般競技？ | **這是最危險的一條**：舊的 retry 路徑會把失敗的練習變成 `requeueMatch` ⇒ 真的競技比賽。Task 7 Step 2 專門修這個。 |
| 會不會建立第二套 battle pipeline？ | 練習沒有自己的 Room/Session 工廠、沒有自己的 Result、沒有自己的結算。gate §G 用 reference identity 釘住三個生產者共用同一個 `createRoom`/`createSession`。 |
| 體力不扣會不會變成「打練習比打正式賽划算」？ | 練習給 0 成長、0 錢、0 粉絲、0 戰績 ⇒ 沒有任何可累積的收益，不存在「划算」。 |
| `unknown` 會不會變成新的漏洞？ | `unknown` base = 1.0 ≤ `official` 3.0 ⇒ 沒有人有動機去弄掉 origin。而且 §R1 已證明正常路徑發不出無 origin 的場次。 |
