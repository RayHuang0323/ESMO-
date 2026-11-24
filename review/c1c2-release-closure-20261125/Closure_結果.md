# C1＋C2 Release Blocker Closure　結果（交 Owner Review）

2026-11-25。分支 `release/c1c2-closure-20261125`（worktree `.sprints/c1c2-release-closure`），從已驗證的整合版本 `9f4902a3` 開出。

- **最終候選 SHA：`a76e9d08e21c28ce940ffba9b14a27167b3ecc22`**（所有 Release Gate 綁定這個 SHA）。本文件所在的下一個 commit 只新增文件，與 `a76e9d08` 的差異只在 `docs/`、`review/`。
- `src/` 相對 `9f4902a3` 零變更；moba-sim.v26 指紋 `360474218ca774b9` 不變；`mobaDetMathV25`、`mobaDetMathV26` 仍為 `false`，其他正式旗標未動。
- 不 Push、不 Deploy、不 Merge；遠端 main 仍是 `053fd582`。
- 證據：`C:\Users\ifikn\esmo-measure\c1c2-release-closure-20261125\`（P2v2 在 `p2v2\`，最終 Readiness 在 `final\`）；整合輪舊資料在 `…\c1c2-integration-20261124\`，分開保存。

## 1. main 既有缺陷（Owner 核准：更新測試定位＋行為回歸；只改測試，`017470e7`）

| 項目 | 結果 |
|---|---|
| TD-59 `check_moba_experience26`「Tactic grid 有 min() 防護」 | 已處理。最終 SHA 上 experience26 **29/29**；`check_tactic_grid_guard_closure` 8/8（7 個拿掉防護的反向測試全部判不成立）；`browser_check_tactic_grid_narrow` 9/9（180px 容器、320、390；注入拿掉防護的 CSS 被抓到） |
| TD-60 `check_moba_stats28` §18 | 已處理。最終 SHA 上 stats28 **21/21**；`check_progress_idempotency_closure` 32/32（兩個故意改壞冪等的結算函式都被判 FAIL） |

原 FAIL 證據（main `053fd582` 與 `9f4902a3` 逐行相同）與原收據 `20261124T095702Z__9f4902a328f1__c1c2-active__FAIL.json` 保留。

## 2. P2

- 舊 P2：**FAIL，永久保留**（`20261124T134803Z__9f4902a328f1__c1c2-perf-p2__FAIL.json`）。
- P2v2（事前登記 `P2v2_事前登記.md`，先提交於 `a76e9d08` 才量測；工具雜湊相符）：**PASS 11/11**，收據 `20261124T201722Z__a76e9d08e21c__c1c2-closure-perf-p2v2__PASS.json`。3 場新比賽（種子 31001～31003）× ABBA，12 次全部同場驗證通過、產品流程全 PASS、Chrome 157.0.8103.79 一致、全程接電。

| 指標（6 次中位數） | BASE | CAND | 門檻 |
|---|---|---|---|
| 快速完成 ms | 7803 | 7977 | ≤ 8583 |
| 觀看 1×／2×／4× p95 ms | 16.8 | 16.8 | ≤ 19.5 |
| Replay p95 ms | 33.4 | 33.4 | ≤ 37.7 |
| 全程最高 heap MB | 121.7 | 106.5 | ≤ 149.9 |
| Replay 20 秒 heap（未 GC）MB | 77.5 | 84.2 | ≤ 101.2 |
| Replay 播放峰值 heap MB | 121.7 | 102.2 | ≤ 149.9 |
| Replay 開著 GC 後 heap MB | 65.9 | 67.3 | ≤ 88.5 |
| 三輪增長 MB | 3.05 | 3.05 | ≤ 8.05，且每次 CAND ≤ 10（最大 3.6） |
| 卡頓 >50 ms（合計） | 19 | 19 | ≤ 33.5 |

## 3. match_golden_v21a

97/137 FAIL（收據 `20261124T214725Z__a76e9d08e21c__c1c2-closure-v21a__FAIL.json`）。最終 SHA 上失敗的 40 案與 3a-B 已登記的預期變化、main、`9f4902a3` **逐案相同**。證據與可選處置見 `match_golden_v21a_40案處置證據.md`。**未豁免、未重錄、未改判準；待 Owner 決定。**

## 4. 最終 Release Readiness（全部綁定 `a76e9d08`）

| Gate | 結果 | 內容 |
|---|---|---|
| c1c2-moba | PASS | 14/14（MOBA、v20～v24 隔離與凍結、Live、Tactic Save、整合界線） |
| c1c2-det | PASS | 11/11（v25／C1 Golden、v20～v26 版本化範圍與隔離、DetMath、P3 核心交錯污染 4/4） |
| c1c2-platform | PASS | 8/8（Training、CS 系列／身分／池、存檔 B1B、BP-9 原子提交 1464、瘦身、Replay 三圖無損） |
| c1c2-production | PASS | `vite build` built in |
| c1c2-active | PASS | verify 7/7（runtime29、tactic24、experience26、talent27、stats28、cs23、match_setup_3a）＋flow09、dash10＋兩支 closure 回歸 |
| c1c2-closure-v21a | **FAIL** | 97/137，已知 40 案，待 Owner |
| c1c2-closure-perf-p1 | PASS | v24 +3.20%、v20 +3.04%（≤10%），終局摘要相同 |
| c1c2-closure-perf-p2v2 | PASS | 見上 |
| c1c2-closure-fourengine | PASS | Chrome／Firefox／WebKit 各 80/80 IDENTICAL；repeat 8/8×4；judge PASS；H8 9/9；geometry 與 C2 紀錄逐項相同（TD-TAC-65 監看） |
| c1c2-closure-browser | PASS | MOBA 桌機 9/9、390 9/9；CS 池 81/81（含 Replay）；教練 47/47；戰鬥消耗；縮放 14/14；Tactic grid 窄寬度 9/9 |

環境：最低剩餘實體記憶體 4.1 GB、認可量 3.0 GB；全程接電。

## 5. 是否 GO

**否。** 唯一剩下的 Release Gate FAIL 是 `match_golden_v21a`（已知 40 案預期變化），需要 Owner 依既有程序決定處置（維持現狀或核准版本化預期變化）。在 Owner 決定前只能提出條件式整合建議，不得宣稱正式發布 GO。其他所有 Gate 在最終 SHA 上 PASS。
