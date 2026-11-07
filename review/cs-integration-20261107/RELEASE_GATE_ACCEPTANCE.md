# 整合候選Release Gate驗收清單

## 本機RC唯一現行總表

本輪以RC_REPORT.md、最終RC證據索引與rc-manifest.json為準；下方歷史表格保留，不再當最新狀態。

| Gate | RC現況 | 最小剩餘條件 |
|---|---|---|
| RG-CS-01 | NOT_RUN／發布阻擋 | 真Android三圖FPS、觸控、安全區、背景恢復、發熱／熱降頻 |
| RG-CS-02 | 桌機限定長局已補／發布仍阻擋 | 三圖固定完整長局各6/6；2118MiB、低RAM／OS回收仍未關，不再無限實驗 |
| RG-CS-03 | 既有FAIL保持 | CPU4×原門檻未達；Owner決定實際支援範圍，不自行豁免 |
| RG-CS-04 | 隔離工程與主要回歸已完成 | main產品無新差異；Progress25已33/33、受控CS容量38/38，原自然3/4保持覆蓋缺口；未正式merge |
| RG-CS-05 | 待Owner | 美術／動畫／戰術及practice opt-in範圍；cloth／utility具名延期決策 |
| RG-CS-06 | 已補限定缺口 | RAF7/7、原生reset／seek／卸載49/49保留；不抹去舊6/7 |

正式發布判定：**HOLD**。Confluence／Dune長局各6/6已補；18份native有效收據加runtime29索引通過。Release Gate不因工程RC封存而自動PASS。

## 歷史收據與前輪描述（不是現行Gate總表）

RG-CS-02最新：REPLAY_LIVE_HEAP_REVIEW.md。主執行緒高水位有暫存重疊／GC延後證據，Worker非主要來源；基線／最小隔離實驗／基線校準均9/9完整性通過，收益未足以確認正式2118MiB峰值改善，不採產品修正。native解壓／renderer RAM／最高reachable heap、真低RAM／Android仍未關；CPU4×既有FAIL保持。TD-INT-01不重跑，整體HOLD。

2026-11-08追加：TD-INT-01受控CS結算超限→整理→返回原場冪等38/38已補；原自然3/4仍NOT_TRIGGERED、原斷言不動。RG-CS-02新增七份Allocation profiles與6/6 runtime，但2118MiB峰值／native解壓／Worker及低RAM仍未關，沒有產品修正。最新範圍以CONTROLLED_QUOTA_ALLOCATION_REVIEW.md為準，其餘歷史保留，整體HOLD。

2026-11-07，僅本機隔離候選；**HOLD，停Owner Review**。原CS Release Gate／失敗收據保留，本文件補記此次整合及第三階段結果，不修改原工作區。

| Gate | 最新狀態 | 收據與剩餘條件 |
|---|---|---|
| RG-CS-01 真Android | NOT_RUN／發布阻擋 | Owner已明示無法操作真機；FPS、觸控、安全區、發熱及熱降頻均未驗收 |
| RG-CS-02 Replay記憶體／長局 | 部分完成／仍阻擋 | Foundry一場完整原生1× 6/6、三圖各三次reset／seek／匯入返回／卸載49/49；仍觀測2118MiB返回取樣。低RAM／OS回收、全矩陣未驗收，無新的持有根因／產品修正 |
| RG-CS-03 低規效能 | 既有FAIL保持 | 最新原CS三圖CPU4×各三輪皆未達30FPS／p95≤50ms；本整合Build未重跑CPU4×。本次長局RAF平均不是正式perf gate或最低手機規格證明 |
| RG-CS-04 主幹衝突／整合驗證 | 隔離主要工程完成；仍有驗證缺口 | 六共享檔逐段處理、main577檔保護、production／三圖正式UI／Replay／BP-9／runtime29通過；progress25 32/33及TD-INT-01指定CS滿檔路徑3/4保留，未正式merge |
| RG-CS-05 Owner接受 | 待Owner | 三圖美術／十人動畫／戰術體感、TD-FDR-01及正式競賽接入範圍；不得自行豁免 |
| RG-CS-06 RAF驗證 | 限定缺口已補 | 既有RAF7/7、原reset／seek49/49及19/19保留；整合三圖新runtime49/49，不抹去舊6/7失敗 |

## 已完成且不重跑的可信項目

- [x] 原34份WIP比對recovery-r50後另存r51；必要Shader／RAF三檔獨立本機Checkpoint 5fc2463b。
- [x] 基於origin/main 7d59dab5的新隔離worktree；保留BP-9、SaveSlim、Progress、MOBA與存檔恢復契約。
- [x] Production build；三圖正式UI快速練習各48/48；Replay全保存欄位無損；TD-FDR-01 49/49；Shader14/14、RAF7/7。
- [x] BP-9 Node1464/1464與112/112；browser normal11/11、slim-30044/44；runtime29 35/35（另9委派SKIP）。
- [x] 本整合Build的Foundry完整1×長局及三圖各三次匯入／seek／返回／卸載功能；原始證據另存。
- [x] 第四階段正式整合／部署／回退計畫；本輪只準備文件。

## 保留／未驗收項目

- [x] progress25舊32/33已由本輪33/33取代：原要求v2，但正式輸出為v3；改驗v3實際輸出、v2讀取相容與非法版本拒絕，產品不改，舊失敗保留。
- [ ] TD-INT-01：第244天日曆先滿，未觸發指定CS結算滿檔；slim-300不能代替該前提。
- [x] TD-INT-01受控條件：真CS已進戰鬥後，以非產品storage fixture觸發實際結算容量超限，38/38；不以受控PASS回寫上一項自然觸發收據。
- [x] 同存檔「日曆先滿→備份／同意／整理→冷啟動→下一場CS續玩」獨立Runtime32/32；不代替上一項。
- [ ] 低RAM峰值、系統回收恢復、實際GPU bytes回收、Android及熱降頻：NOT_RUN／未充分驗證。
- [ ] Confluence／Dune完整即時全局與三圖全seed矩陣：NOT_RUN；不以Foundry單例代替。
- [ ] 整合Build CPU4×：NOT_RUN；既有FAIL不關閉。沒有真機證據，不宣稱最低支援裝置。
- [ ] TD-FDR-04 cloth18/19、DUNE-F06／TD-FDR-08 utility6/9：原技術債／具名Owner決策保持，沒有重跑或豁免。
- [ ] Owner核准正式整合及後續發布：尚未取得，無merge至main／push／deploy。

完整範圍、原始失敗與原因見INTEGRATION_REVIEW.md；長局、Heap表及量測限制見PHASE3_QUALITY_REVIEW.md；停點與後續見CHECKPOINT.md。

本輪最新覆蓋以REMAINING_GAPS_REVIEW.md為準；RG-CS-04的progress25缺口已關，指定CS結算滿檔仍未關。其餘原表描述保留作前輪紀錄，整體HOLD。
