# Season vNext V4 實作計畫 — 生涯階段與市場價值

> **For agentic workers:** 本計畫按任務逐一執行，每個任務自帶 red → green → commit 循環。

**Goal：** 讓「生涯階段」變成真正顯示得出來的推導值，並讓年齡開始影響市場價值——**不動任何能力值、不動週薪**。

**Architecture：** 兩支新的純模組。`progress/careerStage.js` 由 `age` 與 `maturity`（主能力平均 / 潛力）推導出五個階段；`economy/marketValue.js` 由能力、未實現潛力與年齡推導資產價值。兩者都**推導不落盤**，沿用 N2 立下的「唯一計算點」形狀。

**Tech Stack：** 純 ES module、無相依；驗證用 `tools/check_*.mjs`（專案既有慣例，無測試框架）。

**Spec：** `docs/design/Season_vNext_V4_選手生涯階段與年齡效果.md`（本計畫依使用者核准的兩點調整修訂，見下）

## Global Constraints

- **不做**：能力衰退、退休、Off-season、AI 老化、選手離隊。
- **不改週薪**：`weeklySalaryOf` / `economyConfig.SALARY` 逐值不變。
  Audit 已證明不需要同步調整——`weeklySettlement.js:121` 明寫「薪資唯一來源 = economy/salary.js，**不再讀 `players[].salary`**」⇒ 動市場價值結構上碰不到週薪。
- **不含 `retired` 階段**：退役留給後續的退休事件與 lifecycle state，**不得由 age 推導**。
- **推導不落盤**：`players[]` 不得出現 `careerStage` / `marketValue` 欄位。
- **零能力改動**：任何一項 `stats` 都不得被 V4 觸碰。
- **`ageEfficiency` 逐值不變**：成長是 V0A/V0B 校準過的，V4 不順手改。
- 常數集中在各自模組的一個 frozen 物件裡，**calibration 之後可調，本輪不 freeze**。

---

## 常數的證據（`tools/careerstage_calibration.mjs` 實跑）

| 量測 | 值 | 用途 |
|---|---|---|
| 同齡期望 maturity | 15:0.67 → 21:0.90 → 24:0.95 → 27+:0.97 | `EXPECTED_MATURITY` 表 |
| 青年期（≤21）殘差跨度 | **0.22** | K = 2×2/0.22 ≈ **18** ⇒ 兩端差 ±2 年 |
| 30 歲殘差跨度 | 0.06 | 偏移**自己淡出**，不需為老將寫特例 |
| 單次課程最大 Δmaturity | **0.01** | × K=18 ⇒ effectiveAge 最多動 **0.18 年** |
| `ageEfficiency` 轉折點 | **29 歲**（0.98 → 0.87） | 巔峰期結束 & 折舊起點的共同錨 |

⇒ **最窄階段區間 4 年 ≫ 0.18 年** ⇒ 一次訓練連一階都跳不了，遑論多階。

---

### Task 1：`careerStage` 純模組

**Files:**
- Create: `src/platform/progress/careerStage.js`
- Test: `tools/check_player_lifecycle_v4.mjs`（§S 階段判定）

**Interfaces:**
- Produces: `CAREER_STAGES`（frozen，五個 id）、`STAGE_BANDS`、`MATURITY`、
  `maturityOf(player)`、`effectiveCareerAgeOf(player)`、`careerStageOf(player)`
- Consumes: `levelGrowth.growthKeysFor`（既有的定位主能力規則，不另寫一套）

- [ ] Step 1：寫 gate §S（階段邊界、單調性、缺資料回 null）
- [ ] Step 2：跑 gate 確認紅
- [ ] Step 3：實作模組
- [ ] Step 4：跑 gate 確認綠

**判定：** `effectiveAge = age + clamp(K × (maturity − expected(age)), ±MAX)`，
再依 `STAGE_BANDS` 分段。`age` 缺值 ⇒ 回 `null`（不編造）。

### Task 2：`marketValue` 純模組

**Files:**
- Create: `src/platform/economy/marketValue.js`
- Test: `tools/check_player_lifecycle_v4.mjs`（§V 市場價值）

**Interfaces:**
- Produces: `MARKET`（frozen 費率）、`ageMultiplier(age)`、`marketValueOf(player)`
- Consumes: `salary.overallOf`（**既有**綜合能力函式，不另寫一套）

**公式：** `(base + 綜合能力項 + 未實現潛力項) × ageMultiplier(age)`，夾在 [min, max]。
- 「未實現潛力項」＝ `potential − 主能力平均`，**年輕高潛的資產溢價由它自然產生**
- `ageMultiplier`：≤28 歲為 1，之後逐年遞減至下限

### Task 3：接上 UI（`careerStageOf` 與市場價值）

**Files:**
- Modify: `src/ui/playerProfileFoundation.js`（`careerStageOf` 改讀新模組；新增 `marketValuePresentationOf`）
- Modify: `src/ui/PlayerProfileFoundation.jsx`（生涯分頁顯示市場價值）
- Test: `tools/check_player_lifecycle_v4.mjs`（§U）＋ `browser_check_player_lifecycle.mjs`

⚠ `ui/playerProfileFoundation.careerStageOf` **保留既有簽章**
（`{available, label, source}`）⇒ 兩個既有畫面（`RosterScreen:258`、`CareerPanel`）
一行都不用改就會有值。

### Task 4：不變式與回歸

**Files:**
- Modify: `tools/check_player_lifecycle_v4.mjs`（§A 不變式、§M sentinel）

釘住：不改能力、不改週薪、不落盤、`LogicEngine` 仍不讀 `.age`、
`ageEfficiency` 逐值不變、無 `retired` 階段、單次課程不跳階。
