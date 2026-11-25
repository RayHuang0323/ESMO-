# C1＋C2 Release Readiness（最終技術驗收，交 Owner 正式發布核准）

2026-11-25。分支 `release/c1c2-closure-20261125`（worktree `.sprints/c1c2-release-closure`）。Owner 已接受最終技術驗收成果並核准本文件收尾與本機 Commit；**正式發布（Push／Deploy／Merge main）尚未核准**。

## 0. 一句話

已驗證候選 **`93655403806340bbc1456623fb7834b92f331ce3`** 的每一個 Release Gate 都有綁定該 SHA 的有效 PASS 收據；歷史 FAIL 全部保留，各有對應的後續 PASS。P2v2 的 PASS 綁在前一候選 `a76e9d08`，依正式規則**不能自動沿用**到 `93655403`（見 §5）。本文件所在的文件 Commit 是新的 SHA，正式規則下**沒有收據**（見 §7）。

## 1. 候選與不變項

| 項目 | 值 |
|---|---|
| 已驗證候選 | `93655403806340bbc1456623fb7834b92f331ce3` |
| 遠端 main（`release_gate resolve-main`，2026-11-25） | `053fd5823522aad2cb07a4c91609020475e31a26`；候選包含它（`merge-base --is-ancestor` 成立） |
| `src/` | 相對 `a76e9d08`、`9f4902a3` 零變更 |
| 模擬版本／指紋 | `moba-sim.v26`／`360474218ca774b9`（所有量測紀錄一致） |
| 正式旗標 | `mobaTacticalDirectorV21`、`mobaChallengeV21`、`mobaJungleV22`、`mobaSafeRouteV23`、`mobaTacticExecV24`、`mobaDetMathV25`、`mobaDetMathV26` 全部 `false` |
| 版本定位 | v25（det.v1）保留為歷史版本；v26（det.v2）是後續主要候選；兩者都未啟用 |
| Push／Deploy／Merge | 都沒有做 |

## 2. Release Gate 收據索引（綁定 `93655403`）

收據目錄：`D:\OneDrive\文件\GitHub\ESMO\.git\esmo-release-gate\receipts\`（所有 worktree 共用、不進版控）。原始證據：`C:\Users\ifikn\esmo-measure\c1c2-golden-v21a-flagsoff-20261125\final\`；時間軸 `final\gates.progress`。

| Gate | 收據 | 內容 |
|---|---|---|
| c1c2-moba | `20261125T070137Z__936554038063__c1c2-moba__PASS.json` | MOBA runner、v20～v24 隔離與凍結、Live、Tactic Save、整合界線 |
| c1c2-det | `20261125T073229Z__936554038063__c1c2-det__PASS.json` | v25／C1 Golden、v20～v26 版本化範圍與隔離、DetMath、核心交錯污染 |
| c1c2-platform | `20261125T074021Z__936554038063__c1c2-platform__PASS.json` | Training 13/13、CS 系列／身分／池、存檔、BP-9 原子提交、瘦身、Replay 三圖無損 |
| c1c2-production | `20261125T074048Z__936554038063__c1c2-production__PASS.json` | `vite build` ✓ built in 23.70s |
| c1c2-active | `20261125T080548Z__936554038063__c1c2-active__PASS.json` | verify 現役段（experience26 29/29 等）＋flow09、dash10＋兩支 closure 回歸 |
| c1c2-v21a | `20261125T081229Z__936554038063__c1c2-v21a__PASS.json` | **Match Golden v21-A 146/146**（見 §3） |
| c1c2-closure-perf-p1 | `20261125T084921Z__936554038063__c1c2-closure-perf-p1__FAIL.json` | v24 INCONCLUSIVE、v20 PASS（見 §4） |
| c1c2-closure-perf-p1a-rerun | `20261125T090828Z__936554038063__c1c2-closure-perf-p1a-rerun__PASS.json` | v24 PASS（+6.09%） |
| c1c2-closure-fourengine | `20261125T100622Z__936554038063__c1c2-closure-fourengine__FAIL.json` | WebKit 引擎崩潰，0/80 筆紀錄（見 §6） |
| c1c2-closure-fourengine-resume | `20261125T104955Z__936554038063__c1c2-closure-fourengine-resume__PASS.json` | 三引擎各 80/80、重現性 8/8×4、H8 9/9 |
| c1c2-closure-browser-rerun1 | `20261125T145755Z__936554038063__c1c2-closure-browser-rerun1__PASS.json` | MOBA／CS 瀏覽器 7/7（見 §6） |

## 3. match_golden_v21a

`Match Golden v21-A：146/146 PASS`（原 137 項＋V0～V3＋VN1～VN5）。109 個逐案比對全部通過，其中 3a-B 登記的 40 案依 Owner 核准的旗標關閉版本化預期（`tools/fixtures/match_golden_v21a_flagsoff_v20.json`，main `053fd582` 基準＋三項獨立證據，內容雜湊釘在 Gate 常數）。原 v21 fixture、指紋、K 段、歷史收據未動。**v21 開啟時的 Golden 仍未驗證（TD-61）。** 說明：`Golden_v21a_版本化處置.md`。

## 4. 效能

**P1（Node 模擬成本，判準：同軌跡、離散度 ≤ 8%、CAND 不超過 BASE 10%）**

| 執行 | balanceTool.v24 | balanceTool.v20 | 收據 |
|---|---|---|---|
| P1 | INCONCLUSIVE：+8.28%，但 BASE 離散度 18.23%／CAND 24.69% 超過 8% | PASS +7.89% | FAIL（因 v24 不是 PASS） |
| P1a 重跑（只重跑 v24，判準程式與 P1 同一行） | **PASS +6.09%** | —（沿用同一 SHA 的 P1 結果） | PASS |

兩次軌跡都相同。`gates.progress` 記為事前登記的 INCONCLUSIVE 重跑；開始時 Codex 閒置。

**P2v2（瀏覽器效能）**：PASS 11/11，**綁定 `a76e9d08`**（`20261124T201722Z__a76e9d08e21c__c1c2-closure-perf-p2v2__PASS.json`）。數字見 `Closure_結果.md` §2。沿用判斷見 §5。

## 5. P2v2 能否沿用到 `93655403`：正式規則下不能自動沿用

| 規則（`docs/ai/Release_Gate_SHA驗證.md` §6、`tools/lib/releaseGate.mjs`） | P2v2 收據 | 結論 |
|---|---|---|
| `targetSha＝actualSha＝現在要驗的 SHA` | `a76e9d08…` ≠ `93655403…` | 不成立 |
| `treeSha` 相符 | 兩個 SHA 的 tree 不同（多了文件、v21a Gate 工具與 fixture） | 不成立 |
| 有效期 24 小時 | 2026-11-24T20:17Z，已超過 | 不成立 |
| `assert` 只看「該 SHA＋該 gate」的收據 | `93655403` 沒有 `c1c2-closure-perf-p2v2` 收據 | `assert` 會判 BLOCKED |
| P2v2 事前登記 §6 | 「一次執行就是最終結果」，綁定當時的 CAND（`a76e9d08`） | 沒有轉移條款 |

等價證據（**只供 Owner 判斷，不是收據**）：

- `git diff a76e9d08 93655403 -- src` 為空；差異只在 `docs/`、`review/`、`tools/check_match_golden_v21a.mjs`、`tools/capture_golden_v21a_flagsoff.mjs`、`tools/fixtures/match_golden_v21a_flagsoff_v20.json`（都不進產品 bundle）。
- 兩個 SHA 的 production build（各自的 production Gate 產物）581 個檔案逐位元相同（差異 0）。
- P2v2 量測工具在 repo 外，雜湊已在事前登記釘住。

**需要 Owner 決定**：① 依等價證據書面接受 P2v2 結果代表 `93655403`（登記為例外，不改收據）；或 ② 在最終要發布的 SHA 上重新執行 P2v2（新的一次量測，約 45 分鐘，需要接電）。在決定前，P2v2 對 `93655403` 的狀態是 **NOT VERIFIED（無收據）**。

## 6. 四引擎與瀏覽器

**四引擎**（C2 計畫與判準不變；種子 261001～261080；Chrome 157、Firefox 155、WebKit 26.6）

- 第一次（FAIL 收據）：Chrome 80/80、Firefox 80/80 與 Node 逐 tick 相同，重現性 Node／Chrome／Firefox 各 8/8；**WebKit 0/80**：formal 第一案 `page.evaluate: Target page, context or browser has been closed`、repeat `RangeError: Out of memory`。當時剩餘實體記憶體約 1.4～1.7 GB，判為環境失敗，不是分歧。
- 續跑（PASS 收據）：原證據整份複製到 `final\fourengine-resume\` 後，只以同一支 runner `--engines=webkit` 補跑。重建的 C2 預覽 bundle 與原輪 581 檔逐位元相同；Chrome／Firefox／Node 264 筆紀錄續跑前後雜湊不變；原證據資料夾不變。結果：**Chrome／Firefox／WebKit 各 80/80 IDENTICAL**，重現性 Node／Chrome／Firefox／WebKit 各 **8/8**，judge PASS（352 筆紀錄同 HEAD、同指紋），DetHypot H8 **9/9**。
- 地圖幾何探測（只報）：det.v2 與 native 兩支的結果與 `a76e9d08` 那輪逐項相同；**TD-TAC-65 繼續監看**。

**瀏覽器**（正式 build＝`93655403` production Gate 產物；預覽 5649）

- 第一次：MOBA 桌機、390 PASS 後，因 Owner 休眠，於 CS 池執行中被主動停止（瀏覽器 Gate 不可跨休眠），**沒有產生收據、不採用**，`gates.progress` 已記錄。
- 重跑（新資料夾 `final\browser-rerun1\`，腳本只改輸出路徑）：MOBA 桌機 9/9、MOBA 390 9/9、CS 正式池（含 Veto、重新載入、Replay fixture）**81/81**、CS 教練流程 47/47、戰鬥消耗 PASS、負載下縮放 14/14、Tactic grid 窄寬度 9/9 ⇒ **7/7 PASS**。重跑時筆電使用電池（功能驗證，非效能量測）。

## 7. 文件 Commit 後的 SHA 與收據

- 本文件與 handoff 增量更新放在 `93655403` 之上的一個本機 Commit，只改 `docs/`、`review/`、`AGENTS.md`，`src/`、產品 bundle 輸入、指紋、旗標不變。
- **正式規則沒有「只改文件可沿用」的例外**：收據綁完整 SHA 與 tree，該 Commit 的 SHA 沒有任何收據，`assert` 會是 BLOCKED。已登記技術債 TD-62。
- 因此發布的選項是：① 發布已驗證的 `93655403` 本身（文件 Commit 另行處理）；② Owner 書面核准文件 Commit 依等價證據沿用；③ 在文件 Commit 上重跑需要的 Gate。實際檢查結果見本輪 Sprint 紀錄與交接回報。

## 8. 歷史 FAIL 與後續有效 PASS 的對應

| 歷史 FAIL（永久保留） | 原因 | 後續有效 PASS |
|---|---|---|
| `9f4902a3` c1c2-active（TD-59／TD-60） | main 既有測試定位缺陷 | `a76e9d08`／`93655403` active PASS（只改測試＋行為回歸） |
| `9f4902a3` 舊 P2 | Replay 20 秒 heap 超標（舊判準） | P2v2 PASS（`a76e9d08`；`93655403` 尚無，見 §5） |
| `a76e9d08` c1c2-closure-v21a 97/137 | 40 案已登記的預期變化 | `93655403` c1c2-v21a 146/146（Owner 核准選項 2） |
| `93655403` perf-p1 | v24 離散度過大 INCONCLUSIVE | `93655403` perf-p1a-rerun PASS |
| `93655403` fourengine | WebKit 記憶體不足崩潰 | `93655403` fourengine-resume PASS |
| `93655403` browser（休眠前中斷，無收據） | 主動停止 | `93655403` browser-rerun1 PASS |

## 9. 仍然開放（未驗證，不得宣稱完成）

- **TD-61**：v21 開啟時的 Golden 未驗證；v21 重啟時在 `career.v21` 重錄，需 Owner 核准。
- **TD-TAC-65**：det.v2 塔位與結構仍經過 v18 地圖模組的原生三角函數；幾何分歧只監看。
- **真實裝置與低階裝置**：iOS／macOS Safari（WebKit Windows build 不代表）、Android、低 RAM、CPU 4× 降速、2118 MiB 風險，全部**未驗證**。
- **P2v2 對最終 SHA**：見 §5。
- **TD-62**：Release Gate 沒有只改文件的證據沿用規則。

## 10. 工具操作安全事件（2026-11-25）

休眠前停止瀏覽器 Gate 時，以埠號 5649 查到的 `OwningProcess` 執行 `taskkill /PID <pid> /T /F`；其中一筆 TIME_WAIT 連線的 PID 是 0，`/T` 因此對整棵行程樹動手。系統行程拒絕終止，但 **Owner 自己的 Chrome（35 個行程）被關閉**（`mem.log`：18:53 chrome=35 → 18:54 chrome=0）。驗證證據未受影響。規則已寫入 `AGENTS.md` §12。

## 後續（2026-11-26）：已正式發布

本報告寫於發布前，「未 Push／Deploy／Merge」等描述已經過時：
- `93655403` 已在 2026-11-25 推送為正式 main
- Pages Workflow 45650627711 第 2 次執行成功
- 正式站 Production Smoke 全部 PASS

發布結果見 `Production_Release_93655403.md`；TD-62 方案見 `TD-62_純文件Commit證據沿用方案.md`。
