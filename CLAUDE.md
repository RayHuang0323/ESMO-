# ESMO 專案守則

React 18 + Vite 5 + Three.js/R3F + zustand 的電競經營遊戲。部署到 GitHub Pages（push main 後由 GitHub Actions 建置）。沒有測試框架：驗證 = `npm run build` + `tools/*.mjs` 腳本 + 流程清單。

## 最高原則（完整版在 docs/handoff/README_給Claude先讀.md）

Legacy Experience + Modern Architecture：UI/UX/流程/資訊密度以 `src/EsportsGame.jsx`（Legacy）為規格；架構（Store/Router/LogicEngine/BattleResult/HeroProgress/SeasonStore/battleStore）以目前主幹為準。不可建第二套 Store、第二套 Hero Database，不可重寫 LogicEngine，不可用 Legacy 覆蓋主幹。

**與 README 的一個衝突，以本檔為準**：README 要求「先讀完全部 9 份 handoff 文件再動工」。不要這樣做——按下面的路由表，只讀當次任務需要的文件。

## 危險巨檔（先看這張表再讀任何檔）

| 檔案 | 大小 | 規則 |
|---|---|---|
| `src/EsportsGame.jsx` | 1.4 MB | 絕對禁止整檔 Read。已知 key／符號名 → 自己 Grep 定位＋Read offset/limit ≤300 行；開放式找規格、不知關鍵字 → 派 Explore subagent |
| `src/data/heroImages.js` | 396 KB | 全是 data URI。永遠不讀內容，只 Grep key 名 |
| `src/App.jsx` | 378 KB | 同 EsportsGame 規則 |

## 任務 → 文件路由表（取代「全部讀完」）

| 任務類型 | 先讀 |
|---|---|
| 接手新 sprint / 不知道現在做到哪 | `docs/handoff/05_Sprint紀錄.md` 最後一節 + `08_目前待辦與風險.md` |
| 動主幹架構（Store/Router/Battle 流程） | `docs/handoff/06_目前主幹架構.md` |
| 恢復 Legacy 功能或 UI | `docs/handoff/02_Legacy_Recovery_規格.md`，規格細節派 Explore 查 EsportsGame.jsx |
| 不確定編碼風格 / 命名 / 禁區 | `docs/handoff/03_開發規範.md` |
| 規劃下一步 / 排優先序 | `docs/handoff/04_Roadmap.md` |

## 驗證命令（宣稱完成前必跑，輸出貼回報）

```
npm run build           # 必跑，看到 "built in" 才算過
node tools/regress.mjs  # 一律跑（若存在）
node tools/regress2.mjs # 一律跑（若存在）
```
`tools/check_*.mjs` 共十餘支：檔名含本次改動模組關鍵字（hero/dash/flow/mount/equiv…）的都跑；判斷不了就列出檔名問使用者哪些是現役，並把答案寫回本檔。
UI 流程改動：build 過之後，仍要在回報中列出「未經瀏覽器實測」的項目，交給使用者或 verifier 檢查，不可宣稱流程正確。

## Sprint 收尾協議（每次 commit 前做）

1. 把本次完成項、未完成項、已知風險，追加到 `docs/handoff/05_Sprint紀錄.md`（追加新節，不改舊內容）。
2. 先 `git status` 核對：清單裡出現本次沒動過的檔案（OneDrive 暫存、log、scratch）→ 先查明，不加入。然後 `git add <明確檔案清單>`（不用 `git add .`）→ `git commit -m "Sprint NN: <內容>"` → `git push origin main`（只在使用者要求 push 時）。
3. 禁止 `git reset --hard`、`git clean`、`rm -rf`（全域 CLAUDE.md 已規定，這裡再提醒一次）。

## 派工與驗收

派 subagent、選 model、驗收規則：讀 `~/.claude/playbook/10_DISPATCH.md`。
