# Season vNext V4 — 選手生涯階段與年齡效果（Audit ＋ 最小可行設計）

> **本輪性質**：Audit / Plan，**未實作，`src/` 零改動**。
> **基準 HEAD**：`03f473c`（V3 CLOSED）　**日期**：2026-08-26
> ⚠ 先前一次誤觸 grilling 產生的 Q1～Q4 已作廢，本檔**不沿用那些答案**，全部重新盤點。

---

## 0. 一句話

**目前年齡只改變「還能不能進步」，不改變「現在多強」也不改變「值多少錢」。**
V4 的最小範圍是把後半句補上——**讓年齡改變價值，而不是改變能力**。

---

## 1. Audit：年齡在主幹上的完整足跡

### 1.1 age 怎麼推進（乾淨，單一來源）

`platform/time/careerYearRollover.js` 的 `applyCareerYearRollover`，
**唯一觸發點是 `profileStore.advanceDay`**（唯一時鐘）。用**年度編號差**而非天數差，
折進同一個 `set()`。沒有 `age` 的舊存檔原樣帶過，**不補假年齡**。
由 `check_time_block_v2` §R／§G 與 `check_time_block_v3` §Y 釘住。

⇒ **這一塊不需要改。V4 站在它上面。**

### 1.2 age 的作用範圍：**只有一個函式**

| 位置 | 內容 |
|---|---|
| `data/trainingCalculator.js:47` `ageEfficiency(age)` | 唯一的年齡曲線 |
| `data/trainingCalculator.js:116` | 訓練成長吃它 |
| `progress/careerGrowth.js:114` `export const ageFactor = ageEfficiency` | 比賽成長（PCGM）吃**同一支** |

實測曲線（本輪直接跑出來的，不是抄文件）：

```
age  ageEfficiency
 20    1.10  ██████████████████████████████████
 24    1.04  ███████████████████████████████
 28    0.98  █████████████████████████████
 29    0.87  ██████████████████████████
 32    0.54  ████████████████
 34    0.32  ██████████
 36+   0.20  ██████   ← 下限，刻意保留（歸零會讓訓練畫面出現「永遠 +0」的死路）
```

`trainingCalculator.js` 的註解自己講得很清楚：
> ⚠ 這**不是**衰退：能力不會下降，只是「還能再進步多少」隨年齡收斂。

### 1.3 age **不影響**的東西（逐項查證）

| 面向 | 現況 | 查證方式 |
|---|---|---|
| 比賽表現 | **完全不影響** | `LogicEngine.js` 出現 `.age` **0 次**；`calcPower` 沒有 age 輸入 |
| 週薪 | **完全不影響** | `weeklySalaryOf` = base + 綜合能力 + 等級 + 潛力，**沒有年齡項** |
| 身價（`players[].salary`） | **完全不影響** | 同一組來源（`economyConfig` 註解：身價 = 綜合能力 + 等級 + 潛力） |
| 生涯階段顯示 | **永遠「未啟用」** | 見 §1.4 |
| 衰退 / 退休 | **不存在** | 全 repo 無 `retirement` / `decline` 欄位 |

### 1.4 careerStage：**一個已經接好線、但永遠沒有值的 placeholder**

`ui/playerProfileFoundation.js`：

```js
export function careerStageOf(player) {
  const raw = player?.careerStage ?? player?.lifecycleStage ?? player?.career?.stage ?? null;
  if (!raw) return { available: false, label: "未啟用", source: "unavailable" };
  ...
}
```

**沒有任何地方寫入這三個欄位** ⇒ 恆為「未啟用」。

但它**已經被兩個畫面接好了**：
- `screens/manage/RosterScreen.jsx:258` —— 名單列
- `ui/PlayerProfileFoundation.jsx` `CareerPanel` —— 選手頁「生涯」分頁，
  `data-testid="player-lifecycle-panel"`，旁邊就是已經在運作的「年齡」欄位

而且 `CAREER_STAGE_LABELS` **六個階段的標籤早就定義好了**：
`rookie / growth / peak / mature / veteran / retired`（含中文別名）。

⇒ **UI 契約已經存在，V4 只需要產生那個值。** 這是本輪範圍很小的主要原因。

### 1.5 新秀與 AI 的年齡分佈

| 來源 | 年齡 | 會不會變老 |
|---|---|---|
| 新秀池 `data/recruitPool.js` | **15–24**（四種原型 15–23，早熟 −2／晚熟 +2，clamp 15–24） | 簽進來後會（進 `players[]`） |
| AI 聯賽選手 `competition/aiTeams.js` | **19–27**（`19 + rng()*9`） | **永遠不會**（賽季內 roster 靜態，年齡曲線明講留待後續） |

⚠ AI 選手**刻意不進 `players[]`**（規格 D9：那張表的定義是「會被經營系統寫入的人」）。
⇒ 這對 V4 是**好消息**：生涯階段與薪資改動**結構上碰不到 AI**。

---

## 2. 問題陳述：老將為什麼永遠不需要被換掉

把 §1 的發現合起來，「老將仍可長期維持高能力」這個問題的**精確形狀**是：

> 一名 35 歲、綜合 85 的選手，在遊戲**觀察得到的每一個面向**上，
> 與一名 22 歲、綜合 85 的選手**完全相同**：
> 同樣的比賽輸出、同樣的週薪、同樣的身價、名單列上同樣的一行。
> 唯一的差別是他進步比較慢——而那只在「你還想讓他進步」時才有意義。

⇒ **沒有任何機制讓老將變弱、變貴、或變得不值得留。**
⇒ 陣容更替**沒有驅動力**。這不是平衡沒調好，是這條因果根本不存在。

⚠ 注意這裡**不是**「年齡沒有效果」。`ageEfficiency` 是真的在作用，
而且在多年尺度上很強（34 歲只有 20 歲的 **29%**）。
問題是它的效果**只落在未來**（進步變慢），**完全不落在現在**（現在一樣強、一樣便宜）。
一個已經練滿的老將，`ageEfficiency` 對他等於零影響。

---

## 3. 核心問題：年齡應如何改變選手的生涯狀態與價值？

### 3.1 裁決：**改變價值，不改變能力**

V4 **不做能力衰退**。三個理由，每一個都是 audit 推出來的，不是偏好：

1. **破壞性且與剛校準完的成長系統打架。** V0A/V0B 的 Foundation Calibration 才剛把
   「Year 1 可輪換 / Year 2 穩定主力 / Year 3–4 接近巔峰」調出來。
   在上面疊一層扣 stats，等於同時動成長與衰退兩端，**任何一邊出問題都分不出是誰造成的**。
2. **能力不能在週三突然掉。** 衰退若不綁在一個明確的階段邊界上，玩家會在推進日曆時
   莫名其妙看到選手變弱。要不突兀就需要 **Off-season（V5）** ⇒ 衰退**必然把 V5 拉進來**。
3. **AI 永遠 19–27 歲且不會老。** 一旦玩家的選手會變弱，而 AI 隊每年都是同一批青壯年，
   結果是**只有玩家的世界會老** ⇒ 單方面懲罰玩家。要修就得做 **AI turnover（V6）**。

⇒ **衰退的正確位置是 V5，而且它會連帶要求 V6。** 這正是使用者要求的「除非 Audit 證明是必要前置」——
audit 的結論是**反過來**：退休 / Off-season / AI 老化不是 V4 的前置，
**它們是「做衰退」的前置**，所以 V4 不做衰退就一個都不需要碰。

### 3.2 那年齡該改變什麼？——**持有成本與資產價值**

現實世界的形狀很清楚，而且玩家一秒就懂：

> **老將身價低，但週薪高。** 便宜簽得到，貴在養得起，而且賣不掉。

這一組把「年齡」變成一個**經濟取捨**，全程**不碰任何一項能力值**：

| | 年輕（19–23） | 巔峰（24–28） | 老將（30+） |
|---|---|---|---|
| 週薪（持有成本） | 低 | 高 | **更高**（資歷溢價） |
| 身價（資產價值） | **高**（有未來） | 高 | **低**（折舊） |
| `ageEfficiency`（既有） | 1.10 | 0.98–1.04 | 0.20–0.54 |

⇒ 老將 = **貴、練不動、賣不掉**，但**現在就是強**。
⇒ 年輕人 = **便宜、練得動、有轉手價值**，但**現在不夠強**。

**這就是換血的驅動力，而且它是取捨不是懲罰。** 想撐著老將奪冠？可以，付週薪。
想重建？賣不到錢，但薪資立刻下降。兩條路都成立。

---

## 4. V4 最小可行範圍

三件事，**一件都不能少，也不該再多**。

### V4-1. `careerStage` 變成真的（**推導，不落盤**）

新增純模組 `src/platform/progress/careerStage.js`：

```
careerStageOf(player) → "rookie" | "growth" | "peak" | "mature" | "veteran"
```

- **必須推導，不得存進 `players[]`**。存了就有第二份真相、需要遷移、
  且會與 `age` / `stats` 不同步——與 `careerYearOf` 同一個紀律。
- **主軸是 age**（穩定、單調、玩家看得懂）。
  `closedRatio`（已關閉多少潛力空間）**只**用來區分 rookie 與 growth
  ——「年輕且空間還很大」才是新秀。
  ⚠ 不讓 stage 大量吃 `closedRatio`：那會讓**一次訓練就跳階**，
  玩家會覺得階段在亂跳。
  ⚠ `closedRatio` 目前**只存在於 calibration 工具**，runtime 沒有。
  可由 `stats` 與 `potential` 現場算出，**不新增欄位**。
- **不含 `retired`**：那是 V5 的事。V4 產生的五個值都是「還在隊上」的狀態。
- `ui/playerProfileFoundation.careerStageOf` 改為讀這一支
  ⇒ 兩個已經接好線的畫面（名單列、生涯分頁）**當天就有值**。

### V4-2. 週薪加入年齡項（**持有成本**）

`platform/economy/salary.js` 的 `weeklySalaryOf` 加一個年齡係數，
費率放進**既有的** `economyConfig.SALARY`（那裡已經有 base / perOverall / perLevel /
perPotential / min / max）⇒ **單一常數點，符合既有形狀，不新建第二套薪資模型**。

### V4-3. 身價加入年齡折舊（**資產價值**）

`players[].salary`（這個欄位的語意是**身價／轉會用**，見
`recruit/applyRecruitment.js:106` 的註解，不是週薪）隨年齡折價。

### 明確不在 V4 內

- ❌ 能力衰退（扣 stats）→ **V5**
- ❌ 退休 / `retirementIntention` / `retired` 階段 → **V5**
- ❌ Off-season 八步序列 → **V5**
- ❌ AI roster 老化與換血 → **V6**
- ❌ 任何真人玩法

---

## 5. 不變式（V4 的守門）

| # | 不變式 | 為什麼 |
|---|---|---|
| **A1** | **V4 不改變任何選手的任何一項能力值** | 這是「改變價值不改變能力」的可驗證形式；sentinel：讓 V4 動到 `stats` ⇒ 紅 |
| **A2** | **V4 不改變任何比賽結果** | `LogicEngine` 現在讀 `.age` 0 次，V4 之後仍須是 0 |
| **A3** | `careerStage` **推導，不落盤**——`players[]` 不得出現該欄位 | 不建第二份真相 |
| **A4** | 階段判定是**純函式**，同一個 player 永遠得到同一個階段 | 可驗算、可測試 |
| **A5** | 薪資／身價仍**只有一個計算點** | 不得出現第二套薪資模型 |
| **A6** | 舊存檔（無 `age`）**不得炸、不得被補假年齡** | 沿用 `careerYearRollover` 已建立的紀律 |
| **A7** | `ageEfficiency` 曲線**逐值不變** | V4 不順手改成長；成長是 V0A/V0B 校準過的東西 |
| **A8** | AI 選手仍**不進** `players[]` | 規格 D9；V4 的改動結構上碰不到 AI |

## 6. 需要的 gate

| Gate | 釘住 |
|---|---|
| `check_player_lifecycle_v4`（新增） | A1–A8；階段邊界；薪資／身價的年齡方向性（老將週薪↑、身價↓） |
| 既有必跑 | `check_finance_n3`（薪資由能力導出）、`check_foundation_calibration`（成長未被動到）、`check_time_block_v2/v3`、`check_no_player_injury`（`age` 欄位不得被順手刪） |
| 瀏覽器 | 生涯分頁 `player-lifecycle-panel` 不再顯示「未啟用」 |

## 7. 數值**不在本輪決定**

年齡係數的形狀與大小、巔峰窗口的起訖、折舊速率——全部由 calibration 決定。
⚠ 尤其是**資歷溢價不能大到讓老將完全沒人要**：那會把「取捨」變成「懲罰」，
正是 §3.2 要避免的東西。判準應該是**產品體感**（撐老將奪冠是一條成立但昂貴的路），
不是某個係數等於某個值——沿用 Foundation Calibration 已經立好的驗收方式。

---

## 8. READY_TO_IMPLEMENT_V4

**YES（就上面這個範圍）。**

前置條件都在主幹上跑著：age 推進（V1/V2）、快轉（V3）、成長曲線（V0A/V0B）、
薪資由能力導出（N2，`check_finance_n3` 已驗）、UI 契約（`careerStageOf` 已接線）。

⚠ 開工前唯一還沒定的是 §7 的數值，而那**本來就該在實作中量測**，不該現在猜。
