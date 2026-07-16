# CODEX 使用規範

> Codex CLI / codex-plugin-cc 的專用規範。動工前**必先讀 `AGENTS.md`**。
> 交接細節見 `docs/ai/跨模型交接流程.md`。

## 1. 使用定位

Codex 可用於：Claude token 不足時**接手**、review、adversarial review、rescue、
局部 bug fix、verifier 改善、小型 UI 或工具任務。

**Codex 不應在沒有 owner 指示時，自行接管整個大型 Sprint。**
大型 Sprint 需要使用者或 owner agent 明確授權範圍與禁區。

## 2. Codex 開發前必讀

1. `AGENTS.md`
2. `docs/README.md`（文件索引；決定本次要選讀哪些 design）
3. 本文件
4. `docs/ai/跨模型交接流程.md`
5. `docs/handoff/00_目前專案狀態.md`、`08_目前待辦與風險.md`
6. 本次 Sprint 提示詞
7. `git status --short` / `git diff --stat`

**閱讀策略**：

- Codex 接手時**先讀 `docs/README.md`**，再依本次任務**選讀** design 文件。
- **不得預設讀完整個 `docs/`**（浪費 token）。
- `handoff/05_Sprint紀錄.md`、`06_目前主幹架構.md` 只在需要時讀（06 動架構才讀、05 追查歷史才讀）。
- **舊 Sprint 紀錄只用於追查歷史決策，不可作為目前狀態來源**（目前狀態以 `handoff/00`、`08` 為準）。

## 3. 適合 Codex 的任務

- 修 debug gate（如 `src/ui/debugMode.js`）
- 修 replay 入口 / 資料流
- 寫 / 改 verifier（`tools/*.mjs`）
- review current diff
- 檢查 Progress / Replay 風險
- 整理 rescue plan

## 4. 不適合 Codex 的任務（未授權一律不做）

- 未授權完整重寫 `LogicEngine`
- 未授權完整重做地圖世界 / 場景
- 未授權改 Progress / Reward / `matchProgressTransaction` 架構
- 未授權清除 localStorage
- 未授權直接 commit / push

## 5. Review Output Format

1. **Blocking issues**（會壞 build / 契約 / determinism / 發獎的問題）
2. **Non-blocking risks**（可上線但需追蹤）
3. **Missing verifier**（缺哪些測試覆蓋）
4. **Minimal fixes**（最小改動建議）
5. **Files inspected**（實際看過哪些檔）

## 6. Rescue Output Format

1. **Current git status**
2. **Modified files**
3. **Completed work**
4. **Incomplete work**
5. **Risks**
6. **Safe next steps**
7. **Do-not-touch areas**（高風險 / 別人正在改的區域）

## 7. Commit / Push Rule

Codex **預設不得 commit / push**，除非使用者或 Sprint 指令**明確授權**。
若獲授權 commit / push：

- 先跑 required verifier（依 `AGENTS.md` §7 影響範圍）並確認全綠 + exit 0。
- `git add <明確清單>`（不用 `git add .`），commit message 清楚描述。
- **不 commit** scratchpad / `_backup_*` / logs。

## 8. Codex 完成後必須回報

- 修改檔案清單
- 根因（若是修 bug）
- 已跑驗證（含 exit code / 輸出形狀）
- 未驗證項（尤其手機 UX / FPS / 視覺，誠實標記）
- 是否 commit / push
- 建議的下一步 / 交還對象
