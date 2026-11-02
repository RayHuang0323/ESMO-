# Phase 3a-B Release Integration Preflight（唯讀初步分析）

- 日期：2026-11-03；獨立唯讀子代理執行，**沒有合併、沒有建置、沒有在合併後的樹上跑任何 gate**。
- 比對：`feature/moba-phase3a-stage1`（`a7a75f16`）對本機 `origin/main`（`b4f8e0c3`，未 fetch）；合併基準 `1d0e219a`。

## 結論

**合併本身容易；真正的風險是時機。** 建議等正式驗收通過後才整合，並在每次凍結前重跑這份檢查。

## 規模與衝突

| | 分支 | origin/main |
|---|---|---|
| Commit | 283 | 7 |
| 檔案 | 303 | 513（`src` 86 個，其中 76 個是 `src/battle/fps`） |
| `.github`、`package.json`、lockfile | 沒動 | 沒動 |

兩邊都改到的只有 3 個檔案：

| 檔案 | 狀況 |
|---|---|
| `docs/handoff/05_Sprint紀錄.md` | 檔尾一段衝突，兩邊都保留 |
| `docs/handoff/08_目前待辦與風險.md` | 檔尾一段衝突，兩邊都保留 |
| `tools/verify.mjs` | 自動合併，`node --check` 通過，要人工看一次 |

**產品程式沒有衝突。** 唯一陷阱是換行：05、08 是混合換行，要用位元組層級的腳本處理，不能用 Edit、Python 文字模式或 `sed -i`。預期數字：05 CRLF 24,005／LF 2,799；08 CRLF 126／LF 14,466。

## 語意風險

| 項目 | 結果 |
|---|---|
| 語意指紋 `0cc52b48cfb9348a` | 目前 origin/main 沒有動到任何語意檔（50 個）與真實性表載入檔（共 84 個受監看檔案）。**推論不變**，沒有在合併後的樹上實算 |
| v20 指紋、黃金 fixture | 沒動 |
| 存檔、旗標、AppShell、GameView、matchRuleset | 只有分支改，沒有重疊 |
| CS 隔離 | 分支沒碰 CS 檔案 |

## 合併後預期會紅、要處理的

| Gate | 原因 |
|---|---|
| `check_formal_acceptance_3aB` B1 | 基準 commit 與新的合併基準不同 |
| `check_stage1_split_3aB` S9a | push 之後，它比對的 `origin/main:TacticScreen.jsx` 變了 |
| `record_verify_baseline --compare` | 合併後多 54 段，基準不得修改 |
| `cs_distribution_baseline_r46`、`check_squad_o1` | 可能紅（未驗證） |

## 建議順序

1. 現在不合併。
2. 每次凍結前重跑檢查。**如果 main 碰到受監看的檔案，先合併再凍結。**
3. 凍結，跑正式步驟 1–9，提交結果。
4. 有 Owner 明確指示後，在獨立分支與 worktree 做真正的 merge commit；**不要 rebase 或 squash**（工具釘著 commit、讀歷史）。
5. 用位元組腳本處理 05、08，跑 gate；指紋必須等於凍結值。
6. S9a、B1 用一個看得見、Owner 核准的 commit 修正。
7. 更新 handoff，fast-forward main，等 Actions 結果，再跑正式站 gate。

## 會迫使正式驗收重做的事

| 觸發 | 後果 |
|---|---|
| 平衡研究的語意修正 | 不論何時合併都要整輪重做（約 17 小時） |
| main 的 commit 碰到語意檔或真實性表載入檔 | 指紋或真實性表失效 |
| esbuild 版本變動 | 指紋文字改變 |
| 在登記與 `--run` 之間合併 | 工具拒跑 |
| 在 `--run` 與 `--report` 之間合併 | 工具拒絕出報告，保留 Seeds 收不回來 |

## 工作量（子代理估計，未實測）

合併與文件 30–45 分鐘；步驟 10 gate 約 1 小時；建議的 gate 與瀏覽器約半天；S9a、B1 約 1 小時。**合計約 1 個工作天**，不含正式驗收和完整 159 段 verify。

## 順帶發現（交給 CS 線，沒有修）

main 把 `中路` 對應到 `support`，但 `CS_ROLE_DISTRIBUTION_PROFILES` 沒有 `support` 這一項，`中路` 新秀的 bias 是 0、上限 90。自 `a8438c9a` 起已在正式站，不確定是否刻意。

## 未驗證

沒有在合併後的樹上跑 build、gate 或瀏覽器；import 分析是 regex；沒有讀 main 大部分的 CS 程式；`moba-sim.v21` 版本標籤在發布前要 Owner 決定（`simulationVersion.js` 約 43 行）。
