# ESMO 文件索引

> 所有 AI agent（Claude Code、Codex CLI、GPT、其他）接手前的**文件導航**。
> 跨模型硬規則見 `../AGENTS.md`。**不得預設讀完整個 `docs/`**——按下面選讀。

## 一、新 Agent 最低必讀

新 Agent、Claude Code、Codex CLI 接手時，**預設只讀**：

1. `../AGENTS.md`
2. `ai/CODEX使用規範.md`（Codex 使用時）
3. `ai/跨模型交接流程.md`（跨模型接手時）
4. `handoff/00_目前專案狀態.md`
5. `handoff/08_目前待辦與風險.md`
6. 本次 Sprint 提示詞
7. `git status --short`
8. `git diff --stat`

**不得預設讀完整個 `docs/`。**

## 二、視任務選讀（依工作範圍）

- **主幹架構**：`handoff/06_目前主幹架構.md`
- **Sprint 歷史**：`handoff/05_Sprint紀錄.md`
  —— 只有需要追溯歷史決策時才讀，**不是預設必讀**。
- **MOBA 對戰執行／時間／節奏**：
  `design/MOBA對戰執行與時間系統.md`、`design/MOBA交戰節奏與擊殺模型.md`
- **MOBA HUD／手機**：`design/MOBA對戰HUD與手機版.md`
- **MOBA 地圖／場景**：
  `design/MOBA世界尺度與路線幾何.md`、`design/MOBA場景視覺規範.md`、
  `design/MOBA地圖可讀性規範.md`、`design/MOBA中立目標與野區系統.md`
- **MOBA 導播／測試控制**：`design/MOBA導播鏡頭與測試控制.md`
- **MOBA 召喚師技能**：`design/MOBA召喚師技能系統.md`
- **MOBA 戰術**：`design/MOBA戰術系統.md`、`design/MOBA戰術播報系統.md`
- **Replay**：`design/MOBA重播系統.md`（＋ 對應 handoff 段落）
- **Progress／Reward／Talent**：只在任務碰到對應系統時讀相關設計文件
  （`design/賽後結算與選手成長系統.md`、`design/選手天賦與能力成長系統.md`、`design/MOBA選手能力注入.md`）

## 三、不應預設閱讀

以下不應在每次接手時全部讀取：

- `handoff/05_Sprint紀錄.md` 全文
- 歷史 Sprint 報告
- `handoff/_archive/`
- `_backup_*`
- 舊 verifier 輸出
- 暫存分析（`docs/analysis/` 等）
- 與本次任務無關的 `design/` 文件

## 四、文件角色

- **`AGENTS.md`**：跨模型硬規則、閱讀入口與高風險規則。
- **`CLAUDE.md`**：Claude Code 專用工作方式、hooks 與 Claude-specific 規則。
- **`docs/ai/`**：Codex 與跨模型交接方式。
- **`docs/handoff/`**：目前狀態、主幹架構、Sprint 紀錄、待辦與風險。
- **`docs/design/`**：各系統詳細設計——**不應全部複製進 `AGENTS.md`**。

## 五、文件衝突優先順序

文件內容若衝突，依以下順序（高 → 低）：

1. 使用者本次明確指令
2. 硬性 safety hooks、verifier 與不可破壞契約
3. `AGENTS.md` 的跨模型硬規則
4. `handoff/00_目前專案狀態.md`
5. `handoff/08_目前待辦與風險.md`
6. `handoff/06_目前主幹架構.md`
7. 與本次系統直接相關、且內容最新的 `design/` 文件
8. `handoff/05_Sprint紀錄.md`
9. 舊 Sprint、歷史、備份與 `_archive` 文件

**舊文件不得覆蓋目前狀態文件。發現實質衝突時必須回報，不得自行猜測。**

## 六、維護原則

- `AGENTS.md` **不**複製完整 Sprint 歷史。
- `AGENTS.md` **不**複製每套系統的完整欄位與數值。
- 詳細設計只留在 `docs/design/`。
- `handoff/00` 與 `handoff/08` 必須維持**精簡且最新**。
- 過時文件應標記為歷史或移至 `_archive`，但**不要一次大量搬動**既有文件。
