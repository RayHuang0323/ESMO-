# MOBA → CS 整合交接（2026-11-21）

> 給負責整合的 Codex。**本文件只描述狀態，沒有做任何整合**：沒有 merge、沒有 push、沒有新增 Worktree、沒有動 CS 工作區。

## 1. MOBA 狀態

| 項目 | 內容 |
|---|---|
| Worktree | `.sprints/moba-v21-sprint0` |
| 分支 | `feature/moba-tower-edge-v23`（只在本機，遠端沒有這個分支） |
| 成果 SHA | **`47914b16`**（v24 Calibration Sprint 結果）；本交接文件的 commit 在它之上，只加這一份文件 |
| 工作樹 | 乾淨：0 個未提交、0 個未追蹤檔案 |
| 與 origin/main（`7cf1cebc`） | 領先 52 個 commit、落後 0；`src/` 有 17 支檔案不同（v22～v24 候選語意，全部被正式旗標關著） |
| 正式旗標 | `mobaTacticalDirectorV21`、`mobaJungleV22`、`mobaSafeRouteV23`、`mobaTacticExecV24` **全部預設 false**（`src/featureFlags.js`） ⇒ 合併後正式站行為不變 |
| 指紋 | v24 `9727c0b4ae8beb3d`、v23（凍結）`69237cce78edf2be` |

## 2. 已完成的 Sprint（v24 線，全部只在本機）

| Sprint | Commit | 結論 |
|---|---|---|
| Sprint 0／0.5、診斷 | `0801b892`～`00382eda` | 影子研究、威脅模型、紅藍不對稱拆解 |
| 交付點 A／Sprint 1 | `77780df3`、`e9d86b32`～`ce32c4ca` | v24 規則集、`adaptive.v1` |
| Sprint 1.1／1.2 | `218e74e8`～`4c1da80a`、`29218c8d`～`8ae1f5f6` | `adaptive.v1.1`、`adaptive.v1.2` |
| Sprint 1.3（終局護線） | `bf9184a8`～`541721dd` | `adaptive.v1.3`（目前 v24 規則集的值） |
| Acceptance Closure | `7139a418`～`feed38c1` | E2、E3 PASS；S2 新契約 s2.v2 |
| Sprint 2 Preflight | `910792ac` | 根因：工具路徑沒有英雄技能 |
| **Calibration Sprint** | `11c3b907`、`47914b16` | Career-Parity 量測環境；入侵校準依規則停止（候選 v1.4 只是補丁，沒有進 `src/`）；E7 PASS |

都**沒有**核准發布；Sprint 2 未啟動。

## 3. 「7 支校準工具」

整合方看到的未追蹤檔案，是 Calibration Sprint 進行中途的快照。現在全部已提交，沒有任何未追蹤檔案：

| 檔案 | Commit | 必要性 |
|---|---|---|
| `tools/owner_preview/lib_parity_env_v24.mjs` | `11c3b907` | **必要**：Career-Parity 環境的宣告與逐場驗證（Owner 決策：之後 v24 正式驗收都要用） |
| `tools/owner_preview/diag_te24_cal_invade.mjs` | `11c3b907` | **必要**：正式驗證的自然對局量測工具 |
| `tools/owner_preview/run_te24_cal.mjs` | `11c3b907` | **必要**：單線批次執行器（可續跑、STOP 檔、中斷紀錄） |
| `tools/owner_preview/stress_parity_e7_v24.mjs` | `11c3b907` | **必要**：E7 平衡設計 |
| `tools/owner_preview/judge_cal_parity_v24.mjs` | `11c3b907` | **必要**：S16 登記的判定工具 |
| `tools/check_cal_parity_v24.mjs` | `47914b16` | **必要**：本輪守門（6 項） |
| `tools/owner_preview/pin_v13_baseline_v24.mjs` | `11c3b907` | 證據：v1.3 釘點的錄製方式 |
| `tools/owner_preview/cal_analyze_v24.mjs`、`cal_fit_belief_v24.mjs`、`cal_fit_success_v24.mjs`、`cal_report_arms_v24.mjs` | `11c3b907` | 證據：校準與消融的分析（S16_CALIBRATION 的數字由它們產生） |

全部是 `tools/` 下的量測工具，`src/` 沒有 import 任何一支（`check_cal_parity_v24` C6 釘住）。

## 4. `tools/verify.mjs`

本輪（以及整個 v24 線）**沒有**改 `tools/verify.mjs`。兩邊自共同祖先 `7cf1cebc` 之後的改動：

| 一邊 | Commit | 改了什麼 | 必須保留 |
|---|---|---|---|
| MOBA | `ce0ab800`（2026-11-14 v23 凍結） | **出處戳記（provenance）**：每次執行記下 HEAD、`src/`／`tools/` 是否有未提交變更（及其內容雜湊）、模擬版本與指紋；`--resume` 只沿用「同一個 commit、同一個指紋、工作樹相同」時記下的 PASS，否則判 STALE 重跑。另加 `--dry-run`（只列出會跑哪些段，不執行、不寫狀態檔）與 `--trust-legacy-state`（明確選擇沿用舊 PASS，會印警告） | **全部**：沒有出處戳記，`--resume` 會拿程式改動前的 PASS 跳過驗證（這是當初加它的原因） |
| CS | `506357f7` | `cs_major_shader_warmup` 段的預期輸出 12/12 → 14/14 | 是（CS 那支 Gate 現在有 14 項） |

兩邊改的是不同區塊。只讀預演（`git merge-tree --write-tree 47914b16 c70bfeca`，沒有建立任何分支或參照、沒有動工作樹）：**整體 0 個衝突檔案**；合併後的 `verify.mjs` 同時有出處戳記（`computeProv`／`staleReason`／`--dry-run`／`--trust-legacy-state`）與 CS 的 14/14，`node --check` 語法通過；MOBA 的指紋與四個旗標（false）在合併樹裡不變。

## 5. 驗證結果（`47914b16` 的程式；本交接 commit 只多一份文件）

| Gate | 結果 |
|---|---|
| `check_cal_parity_v24` | 6/6 PASS |
| `check_s15_preflight_v24` | 5/5 PASS |
| `check_s2_contract_v24` | 55/55 PASS |
| `check_simulation_version_gate` | 106/106 PASS |
| `check_tactic_exec_v24` | 19/19 PASS |
| `check_layer_isolation_v24` | 8/8 PASS（v20～v23 逐 tick 相同） |
| `regress`／`regress2` | 結束率 15/15／節奏門檻 8/8 |
| `npm run build` | 通過（built in 23.25s） |
| 5644 隔離瀏覽器流程 | 正常生涯、僵局 Seed 快速完成：都回到總部，錯誤 0 |

紀錄：`review/tactic-book-3a/v24_calibration/results/gates/`。

### 與 CS checkpoint `c70bfeca` 的重疊（只讀比對，共同祖先 `7cf1cebc`）

| 項目 | 結果 |
|---|---|
| `src/` 檔案 | CS 改 24 支（`src/battle/fps`、`src/screens/fps`、`src/screens/manage`、`src/platform/contracts`、`AppShell.jsx`、`profileStore.js`）、MOBA 改 17 支，**重疊 0 支** |
| MOBA 語意指紋清單（73 支） | CS 改的檔案**沒有一支**在清單裡 ⇒ 整合後 v24 `9727c0b4ae8beb3d`、v23 `69237cce78edf2be` 不變，不需要重新登記 |
| `src/featureFlags.js` | CS 沒有改；合併樹裡四個 MOBA 旗標仍是 false |
| 整體合併預演 | 0 衝突 |

### 整合之後

任何「可整合／可發版」結論前，照 CLAUDE.md 用 `tools/release_gate.mjs` 綁定 Target SHA。建議重跑：`check_simulation_version_gate`、`check_layer_isolation_v24`、`check_tactic_exec_v24`、`regress`、`regress2`、`npm run build`；MOBA 規則集或旗標有疑慮時再加 `check_match_golden_v21a`。

⚠ 有三支是「本輪 `src/` 沒動」的快照守門，**整合進 CS 的 `src/` 之後這幾項必然變紅，不是回歸**：

| Gate | 項目 | 釘住的基準 |
|---|---|---|
| `check_s2_contract_v24` | T13b「src/ 與上一輪結果 commit 相同」 | `541721dd` |
| `check_s15_preflight_v24` | P5「src/ 與 feed38c1 相同」 | `feed38c1` |
| `check_cal_parity_v24` | C3「src/ 與 910792ac 相同」（同一項裡「補丁仍可套用」仍然有效，因為 CS 沒碰那三支檔案） | `910792ac` |

這三支的其他項目仍然有意義；判讀時把那一項當成「已知會因整合而變」，或把基準改成整合後的 SHA（要改請記在新的 commit 裡，不要回頭改舊結論）。

## 6. 未完成事項（不影響整合安全，但不能宣稱完成）

1. **Owner 決策待定**：入侵的產品取捨 A～D（`S16_CALIBRATION.md` §6，建議 A＋D）。
2. Career-Parity 正式結果：S2-A／S2-C 在工具與生涯都 FAIL；生涯 S5 FAIL；Sprint 2 條件**尚未具備**。
3. 候選 `adaptive.v1.4` 只是補丁（`candidate_adaptive_v1_4.patch`），沒有進 `src/`。
4. 沒有實測：手機 390px、手動選戰術、1×／2× 全程觀看、僵局 Replay。
5. 共用 stash 裡有一筆舊的 CS 項目（`stash@{0}: On release/moba-combat-closure: WIP CS Retreat R5 before offline 2026-08-10`），不是 MOBA 這條線的，沒有動。

## 7. 結論

MOBA 這條線可以安全交給 Codex 整合：工作樹乾淨、成果全部已提交、正式旗標全關、與 CS checkpoint `c70bfeca` 只讀預演 0 衝突。整合本身、push、deploy 都由 Codex 與 Owner 決定，本 Worktree 不會自行進行。
