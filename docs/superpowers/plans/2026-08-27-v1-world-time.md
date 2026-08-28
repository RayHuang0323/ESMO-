# Season vNext V1：世界時間基礎 Implementation Plan

> 依 `superpowers:executing-plans` 逐項執行。

**Goal:** 讓 `meta.days` 真正成為全俱樂部共用的世界時間——有明確的**擁有者**、
明確的**活動歸屬**、**不可能被凍結**，且與正式賽程對得起來。

**Architecture:** 不新增第二個時鐘。`advanceDay` 仍是唯一實作，
新增一層**契約與命名入口**（`platform/time/worldClock.js` ＋
`profileStore.advanceWorldDays`），把「誰有權推進」「哪些活動屬於世界時間」
從隱性慣例變成可驗證的宣告。

**Spec:** `docs/design/Season_vNext_長期生涯與競賽框架.md` §3；TD-34

---

## Global Constraints

- `meta.days` 仍是**唯一**世界時間來源，不得出現第二個計數器。
- MOBA / CS **共用同一條**時間（已成立，本輪只是釘住）。
- 賽季容器**不得**控制選手時間。
- 快速練習**不推進**世界時間。
- **不做**：age +1、衰退、退休、Off-season、Ranked、真人連線。
- 不鎖死「每種活動消耗幾天」——一般競技比賽的成本本輪標記為**未定案**。

---

## Audit 結論（先做完才動手）

### ① 世界時間卡在哪：不是「推得慢」，是**推不動**

`meta.days` 的寫入點全 repo 只有兩處，而且都在同一條路上：

| 寫入點 | 誰呼叫 |
|---|---|
| `economy/weeklySettlement.js:260`（`advanceDaysInState`） | 只有 `profileStore.advanceDay` |
| `profileStore.js:2909`（`_startNewGame`） | 開新局 |

⇒ **單一時鐘本來就成立。** 真正的問題在**入口**：

| `advanceDay` 的呼叫端 | 性質 |
|---|---|
| `TrainingScreen`「推進訓練日」 | **正式 UI 唯一入口** |
| `DevQuickRecovery` | DEV-only，上線前要移除（TD-30） |

而那個唯一入口第 55 行是：

```js
if (training.length === 0) { push("無選手在訓練中"); return; }
```

⇒ **沒有人在訓練，世界就完全停住。** 不是慢，是零。
這是 TD-34 記的問題，但比記載的更嚴重：TD-34 寫「只靠訓練推進」，
實際是「**必須真的有人在訓練**才推得動」。

### ② 已經正確、本輪只需釘住的部分（不要動它們）

| 事項 | 現況 | 依據 |
|---|---|---|
| MOBA / CS 共用一條時間 | ✅ 已正確 | `_advanceCompetition` 對兩個項目取**交集**，並明文禁止各推各的 |
| 賽季 rollover 不影響世界時間 | ✅ 結構上不可能 | rollover 只改 `competitionByMode`，`meta.days` 不在其中 |
| 快速練習不推進時間 | ✅ 結構上不可能 | 練習路徑從不呼叫 `advanceDay` |
| 賽程 ↔ 世界日期 | ✅ 已有唯一換算 | `seasonState.absoluteDayOf(state, fixture) = startDay + fixture.day - 1`，檔內已寫「所有跟時鐘比對的地方都要用這一支」 |
| 同一天重複結算 | ✅ 已防 | 週結算冪等鍵是**累計週次**（跨賽季不重置） |

### ③ 84 天年度邊界：兩個「賽季」同長不同錨

- `timeline.deriveTime(days).season`：**世界年度**，84 天，錨在第 1 天。
- `seasonState`：**賽事賽季**，`SEASON_DAYS = 84`，錨在**建立當天**（`startDay`）。

檔內註解自己承認「兩者本來就會逐季偏移」。

⇒ 未來的年齡系統必須用**世界年度**（不受賽事容器影響），
本輪把它命名出來（`careerYearOf`），並斷言它與 `deriveTime` 同源、
且目前與 `SEASON_DAYS` 相等——**允許未來分開，但必須是刻意的**。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/platform/time/worldClock.js` | **新增** | 世界時間契約：年度邊界、推進理由白名單、活動→時間成本表 |
| `src/platform/profileStore.js` | 修改 | `advanceWorldDays(n, {reason})` 具名入口 ＋ `worldTimeView()` 單一讀取點 |
| `src/screens/manage/TrainingScreen.jsx` | 修改 | 拿掉「沒人訓練就不能推進」的早退 |
| `src/screens/DashboardScreen.jsx` | 修改 | 首頁加一張**世界時間卡**（非訓練的推進入口） |
| `tools/check_world_time_v1.mjs` | **新增** | gate |

---

### Task 1: 世界時間契約（`worldClock.js`）

- [ ] gate §Y／§A 先紅
- [ ] `CAREER_YEAR` 由 `timeline.js` 的常數推導（**不得**再寫一次 84）
- [ ] `careerYearOf(days)` → `{ year, dayOfYear, weekOfYear, daysPerYear }`
- [ ] `ADVANCE_REASONS` 白名單 ＋ `PRODUCTION_REASONS`
- [ ] `WORLD_TIME_COST`：training 1／rest 1／practice **0**／official **0**／
      competitive **null（未定案）**
- [ ] gate 轉綠

### Task 2: 具名推進入口與單一讀取點

- [ ] gate §O 先紅
- [ ] `advanceWorldDays(n, { reason })`：理由不在白名單 ⇒ **拒絕推進**並回中文原因
- [ ] `worldTimeView()`：`{ day, week, careerYear, dayOfYear, daysPerYear, nextFixture }`
- [ ] `advanceDay` 保留為實作（標記為內部），既有呼叫端行為逐值不變
- [ ] gate 轉綠

### Task 3: 解凍

- [ ] gate §F 先紅
- [ ] `TrainingScreen` 拿掉 `training.length === 0` 早退；文案隨狀態改
- [ ] `DashboardScreen` 加世界時間卡（`reason: "rest"`）
- [ ] gate 轉綠

### Task 4: 驗收與收尾

- [ ] `check_world_time_v1` 全綠（含 sentinel）
- [ ] 既有 gate：q1/q3/q4/q6、cs_season_*、flow09、dash10、practice_v0d、foundation_calibration
- [ ] `verify.mjs --only=…,build`
- [ ] docs（TD-34 結案、Sprint 紀錄、Roadmap、架構）
- [ ] local commit

---

## Grilling

| 問題 | 答案 |
|---|---|
| 加了首頁推進，會不會變成第二個時鐘？ | 不會。它呼叫 `advanceWorldDays` → `advanceDay` → `advanceDaysInState`，與訓練中心**同一條**。gate §C 斷言 `meta.days` 的寫入點仍只有兩處。 |
| 「休息一天」會不會變成免費跳過比賽日？ | 不會。`advanceDay` 既有的 D15 規則沒動：走得進比賽日，比賽沒收尾就走不出去（`stoppedBy`）。 |
| 世界還可能被凍住嗎？ | 產品面不會——首頁入口不依賴任何前置條件。但**比賽日仍會擋**，那是刻意的（不自動判棄權）。gate §F 分開驗這兩件事。 |
| MOBA / CS 會不會各推各的？ | 不會，`_advanceCompetition` 取交集。gate §D 用兩個賽季實跑驗證。 |
| 年度邊界可靠嗎？ | `careerYearOf` 與 `deriveTime` 同源，84 由 7×12 推導。gate §Y 斷言兩者一致，且改任一常數會連動。 |
| 一般競技比賽的時間成本？ | **本輪不定**。表裡標 `null`，gate §A 斷言它是「明確未定」而不是「填了 0」。 |
