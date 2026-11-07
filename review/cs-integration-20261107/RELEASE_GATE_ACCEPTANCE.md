# 整合候選Release Gate驗收清單

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
- [x] 同存檔「日曆先滿→備份／同意／整理→冷啟動→下一場CS續玩」獨立Runtime32/32；不代替上一項。
- [ ] 低RAM峰值、系統回收恢復、實際GPU bytes回收、Android及熱降頻：NOT_RUN／未充分驗證。
- [ ] Confluence／Dune完整即時全局與三圖全seed矩陣：NOT_RUN；不以Foundry單例代替。
- [ ] 整合Build CPU4×：NOT_RUN；既有FAIL不關閉。沒有真機證據，不宣稱最低支援裝置。
- [ ] TD-FDR-04 cloth18/19、DUNE-F06／TD-FDR-08 utility6/9：原技術債／具名Owner決策保持，沒有重跑或豁免。
- [ ] Owner核准正式整合及後續發布：尚未取得，無merge至main／push／deploy。

完整範圍、原始失敗與原因見INTEGRATION_REVIEW.md；長局、Heap表及量測限制見PHASE3_QUALITY_REVIEW.md；停點與後續見CHECKPOINT.md。

本輪最新覆蓋以REMAINING_GAPS_REVIEW.md為準；RG-CS-04的progress25缺口已關，指定CS結算滿檔仍未關。其餘原表描述保留作前輪紀錄，整體HOLD。
