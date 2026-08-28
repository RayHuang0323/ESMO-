# V0A — Player Career Growth Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓比賽升級成長與訓練成長共用同一組 PCGM 係數，使 match growth 真正受
age / potential space / learning 約束。

**Architecture:** 新增 `platform/progress/careerGrowth.js` 作為 PCGM 的**單一入口**。
它**不重寫**三條既有曲線，而是**原樣 re-export** `data/trainingCalculator.js` 的
`ageEfficiency` / `learningEfficiency` / `conditionEfficiency`（**同一個 function reference**）。
`levelGrowth.applyLevelGrowth()` 改為向 `careerGrowth` 要係數。
⇒ `trainingCalculator.js` **零 diff**，Training v1.1 的無回歸由「檔案沒被改」直接成立。

**Tech Stack:** ES modules、純函式、無測試框架（驗證＝ `tools/check_*.mjs` gate）

**Spec:** `docs/design/Season_vNext_長期生涯與競賽框架.md`（§5 PCGM）

## Global Constraints

- **本 Sprint 只做 V0A。** 不做 V0B / Career Clock / aging / lifecycle / decline / retirement。
- **不修改 `data/trainingCalculator.js`**（Training v1.1 protected behavior）。
- **不修改 prospect generation**（`data/recruitPool.js` 屬 V0B）。
- **不建立 fake Ranked / server / 新 UI。** Ranked / Practice 只保留 source 可擴充性。
- **不新增玩家可見的 Practice 永久成長。**
- 所有 balance 常數標為 **provisional / calibration parameter**，
  **docs 不得標 FINAL**。
- `LEVEL_GROWTH` 的四個既有常數（`pointsPerLevel 3.0`、`roomFull 25`、
  `perStatCap 1.5`、`hardCap 99`）**逐字不動**——`check_growth_ui_p1 §8a` 用原始碼比對守著。
- UI 層不得出現任何成長公式識別字（`check_growth_ui_p1 §7` 守著）⇒ 本 Sprint **不碰 UI**。

---

### Task 1: V0A gate（先寫，必須先紅）

**Files:**
- Create: `tools/check_pcgm_v0a.mjs`

**Interfaces:**
- Consumes: 尚不存在的 `src/platform/progress/careerGrowth.js`
- Produces: 供 Task 3/4 驗收的判準函式（sentinel 會重用同一組判準）

- [ ] **Step 1: 寫 gate**，涵蓋驗收 A–H：
  A 年輕 > 老將｜B 潛力空間越小成長越低｜C learning 高則成長高｜
  D hardCap / perStatCap 仍在｜E 同一 MatchResult 重複結算不重複成長｜
  F Training v1.1 golden fixture 不變｜G PCGM 與 trainingCalculator 是同一個 function reference｜
  H 沒有 Ranked / Live Event 新產品功能
- [ ] **Step 2: 跑 gate 確認紅**
  `node tools/check_pcgm_v0a.mjs` → 預期 FAIL（`careerGrowth.js` 不存在）
- [ ] **Step 3: commit**

### Task 2: `careerGrowth.js`（PCGM 單一入口）

**Files:**
- Create: `src/platform/progress/careerGrowth.js`

**Interfaces:**
- Consumes: `data/trainingCalculator.js` 的三個 efficiency 函式（原樣 re-export）
- Produces:
  - `GROWTH_SOURCES = { training, formal, ranked, practice }`
  - `PCGM_PARAMS`（provisional，含 `sourceBase`）
  - `ageFactor` / `learningFactor` / `conditionFactor`（**=== trainingCalculator 的同一個 reference**）
  - `careerGrowthFactor({ source, player, budgetFactor })` → number

- [ ] **Step 1: 建檔**（re-export + source 契約 + 合成係數）
- [ ] **Step 2: 跑 gate**，G 應轉綠、A–C 仍紅（尚未接上 authoritative path）
- [ ] **Step 3: commit**

### Task 3: `applyLevelGrowth` 接上 PCGM

**Files:**
- Modify: `src/platform/progress/levelGrowth.js`

**Interfaces:**
- Consumes: `careerGrowth.careerGrowthFactor`
- Produces: `applyLevelGrowth(player, levelsGained, { source } = {})`
  ——**第三參數為選配**，既有兩參數呼叫端不受影響（預設 `source = "formal"`）

- [ ] **Step 1: 加入係數**（乘在既有 `perLevel` 之後、`perStatCap` clamp **之前**）
- [ ] **Step 2: 跑 V0A gate** → A/B/C/D 轉綠
- [ ] **Step 3: 跑 `check_growth_loop_p0` / `check_growth_ui_p1`** → 必須仍全綠
- [ ] **Step 4: commit**

### Task 4: `applyMatchProgress` 傳入 source

**Files:**
- Modify: `src/platform/progress/applyMatchProgress.js`

- [ ] **Step 1: 呼叫改為** `applyLevelGrowth(me, levelsGained, { source: GROWTH_SOURCES.formal })`
- [ ] **Step 2: 跑 V0A gate E**（冪等）與 `check_progress25` → 全綠
- [ ] **Step 3: commit**

### Task 5: Calibration report ＋ docs

**Files:**
- Modify: `tools/season_vnext_calibration.mjs`（加 V0A 區段）
- Modify: 設計文件 / Roadmap / Sprint 紀錄

- [ ] **Step 1: 量測公式本身**（各 age / learning / potential-space 的相對成長）
- [ ] **Step 2: 用現有 prospect pool 跑實際結果**
- [ ] **Step 3: 分開標示** V0A 問題 vs **Expected pending V0B**
- [ ] **Step 4: 更新 docs、commit**

## Self-Review

- **Spec 覆蓋**：§5.1（一個公式四來源）→ Task 2；§5.2（統一 age factor）→ Task 3。
  §5.3 `floorRate`／§5.4 新秀空間**刻意不在本 Sprint**（floorRate 會改變 Training v1.1
  的輸出值，屬 Foundation calibration；新秀空間屬 V0B）。
- **Placeholder**：無。
- **型別一致**：`applyLevelGrowth` 第三參數在 Task 3 定義、Task 4 使用，名稱一致。
