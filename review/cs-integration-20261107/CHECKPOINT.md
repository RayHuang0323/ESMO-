# CS Map v2 隔離整合續作停點

> R2最新：Claude9afe58b2已交付並整合；受測候選7cf1cebc完成核心回歸，但補充正式包Replay Smoke為HARNESS_FAIL／BLOCKED，最後assert exit2，未Push main／Deploy。最新入口：[BETA_RELEASE_R2_CHECKPOINT.md](BETA_RELEASE_R2_CHECKPOINT.md)。下列均為前輪保留紀錄。

> 2026-11-08 最新停點：**WAITING_RELEASE_GATE_HANDOFF**。公開桌機測試版候選 `db97d102` 已保存，等待 Claude 正式 SHA／指令／收據；沒有 Push main／Merge main／Deploy。請先讀 [BETA_CHECKPOINT.md](BETA_CHECKPOINT.md)。下列 RC 內容保留為歷史。

## 本機RC最新停點

本機分支rc/cs-map-v2-20261108，起點3b8f75ff；main仍3e615157、無新產品差異，不需要再次整合。原34份WIP逐SHA／Git狀態相符，另存evidence/rc-recovery-r1；rehearsal／原CS工作區與其他worktree不動。產品來源維持原受測版本，不採入清chunks實驗。

Confluence／Dune固定保存Replay完整原生1×長局已各6/6、native0，約29.5／27.5分鐘；時間軸／十人／保存位置／無重模擬／自然末幀／卸載通過。Foundry長局6/6及其餘有效三圖／BP-9／MOBA／Progress25／容量／Shader／RAF收據沿用。18份有效native收據加runtime29索引通過；兩場並行只判功能，不作效能／低RAM／真機驗收。preview-r3 production native0，JS／CSS／700來源與受測包相同。最終tag／SHA與服務結果見evidence/rc-final-r1/manifest.json。

RC_REPORT.md、RC_RECOVERY.md與RC_AI_HANDOFF.md為交付入口，Gate HOLD；預覽helper校驗包與PID後只處理本RC5207／61048。真機／低RAM／熱降頻NOT_RUN，CPU4×失敗與2118MiB風險保持。完成所有收尾後停Owner Review，不自動進正式整合／發布。

公開RC入口r1是HARNESS_FAIL／0/0（新工具內嵌selector字串跳脫），非產品回歸；原stdout／stderr／harness與語法診斷保留。只修selector並加頁面表達式語法預檢，9項要求不變，最終封存以manifest引用的native0／9/9收據為準。

## 前輪已完成停點歷史

最新RG-CS-02續作：REPLAY_LIVE_HEAP_REVIEW.md。沿用七份Allocation Profiles，新增主執行緒／Worker／GC階段觀測與三次匯入返回。r3基線、r4僅診斷Build清chunks實驗、r5基線校準均9/9；3865幀逐幀SHA256一致、同一原比賽物件返回。GC前高水位約1538／1243／1550MiB，輪詢used高水位1245／1236／1263MiB，匯入時間混合；未證明2118MiB歷史峰值可靠改善，停止擴修，不採入產品。Worker末段約5.5MiB，窗口後單獨GC幾乎不變；原生解壓／backing／renderer RAM與最高reachable heap仍有歸因缺口。r1／r2的11/11因輪間hash污染，不作自然峰值基線。全部raw trace／收據保留。

產品src／public／Vite對4e155007不變，不重跑TD-INT-01或大型矩陣；main仍3e615157、未重新整合。安全本機SHA與證據SHA見evidence/live-heap-checkpoint-r1/manifest.json。Gate HOLD，低RAM／Android NOT_RUN、CPU4×既有FAIL不豁免；無認證最低手機RAM，8GB以上只是候選驗收起點。預覽5207／controller61048保持；停Owner Review，不merge／push／deploy。下方保留前輪歷史。

2026-11-08最新：CONTROLLED_QUOTA_ALLOCATION_REVIEW.md。受控storage fixture在真CS戰鬥後填非產品key、觸發實際Chrome quota；38/38證明CS結算match保護、整理後返回原場只入帳一次，原自然3/4仍NOT_TRIGGERED。兩輪37/38為工具預期舊Receipt文字，原body／截圖／失敗保留。Foundry Allocation Sampling七份raw profile、6/6 runtime；join約210MiB、parse103MiB、Pool11MiB，場景共面處理527MiB與服裝474MiB是更大累積配置來源。native解壓／Worker／正常快取精確retained bytes與2118MiB峰值完整因果仍未量化，不採產品修正。分析工具繼承欄位錯分已以Object.hasOwn修正，獨立比對通過。產品來源未改、既有有效大型收據沿用；main仍3e615157、不再次整合。

本輪最終SHA及原34份WIP／raw profile／stdout／stderr／exit SHA在evidence/quota-allocation-checkpoint-r1/manifest.json。預覽5207／controller61048不變。Gate HOLD，Android／低RAM NOT_RUN、CPU4×既有FAIL保留；停Owner Review，不merge／push／deploy。下方保留前輪歷史。

最新續作完成：REMAINING_GAPS_REVIEW.md為本輪報告。只有兩支tools與文件修改，無產品改動。progress25修正v2舊假設為正式v3 runtime＋v2相容／非法版本拒絕，gaps-progress-r2 33/33；首次錯沿用v2之r1失敗保留。gaps-cs-runtime-r1仍3/4，確認第244天日曆先滿；新增calendar-cs-diagnostic 32/32證明備份／同意／整理／冷啟動後CS續玩入帳102→103，不代替指定CS結算超限／原場返回。Replay2118MiB風險仍開，沒有推測性產品修正。fetch main=3e615157，僅四份docs差異，未再次整合。

本輪安全保存見evidence/gaps-checkpoint-r1/manifest.json（最終SHA與收據索引），Git本機提交；原34份WIP SHA相符。原預覽5207／controller61048保持，HTTPS仍只存對話與記憶體。Owner Review／HOLD；不merge、push、deploy。下方為前輪完整停點歷史，最新結果優先。

第二階段工程候選與第三階段限定桌機驗收已完成；第四階段僅準備計畫。**Release Gate HOLD，停止於Owner Review，等Owner隔日確認。** 無merge至main／push／deploy；不得自動開始下一階段。

原CS a7398436及34份WIP保持，原r50核對後另存r51。必要Shader／RAF三檔在獨立checkpoint工作樹提交5fc2463b，沒有大型證據。整合worktree：C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107，分支rehearsal/cs-map-v2-main-20261107，基線7d59dab5；沒有git merge或cherry-pick。

第二階段收據：三圖正式UI快速練習各48/48；TD-FDR-01 49/49；Shader14/14、RAF7/7；三圖逐幀Replay無損往返；BP-9 Node1464/1464與112/112；browser normal11/11、slim-30044/44；runner runtime2935/35。progress2532/33與slim-cs3/4紅燈保留，完整根因見INTEGRATION_REVIEW.md。這些紅燈不洗綠，也不阻止Owner已授權的隔離桌機品質驗收。

122份FPS來源內容與5fc2463b相同；577份其餘main來源逐blob相同。整合產品Checkpoint b22b7a61，行尾整理8cd2584d；第三階段僅工具／文件，沒有產品修正。最終完整preview-r2的700來源／CS素材與vite指紋feeed6c82edbf1e41e7fc5549d8c6576e9c5ab513a6989497a032c066af83ab7，與第三階段diagnostic-r1相同；第二階段35b6來源至此只差EOF整理。pristine／完整預覽JS bundle仍皆b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370。證據在本目錄evidence與本工作樹review/cs-major-upgrade/evidence，禁止清理或提交原始輸出。

第三階段：phase3-long-r1完整Foundry原生1× 0→3864，6/6 PASS／native0，65次取樣約32.5分鐘；phase3-reset-r1三圖各三次匯入／reset／seek／返回／卸載49/49 PASS／native0。完整stdout／stderr／exit／audit／截圖保留。RAF平均59.53 FPS，最後窗口p95／p99 18.1／18.2ms，不是全局perf gate。Foundry重匯入返回取樣2118MiB，卸載10秒291.9MiB；Dune卸載10秒888.7MiB。無新Snapshot，不宣稱低RAM、零洩漏或全部Heap恢復通過。

獨立預覽localhost:5207/ESMO-/、控制61048，提供完整preview-r2及owner-review/報告入口；實際PID見evidence最終manifest，避免沿用已重啟PID。controller23764、cloudflared34716；原CS三組預覽全保留。HTTPS URL僅對話與controller記憶體。預覽包含完整main素材，三個雲端公開設定在建置時留空，不代替正式CI環境。

第三階段工具／文件的最終本機提交SHA以git log -1及evidence/final-checkpoint-r1/manifest.json為準；不將Git SHA寫死成自我參照提交。最終manifest另列原34份WIP SHA比對、收據／log SHA及預覽PID；原始大檔不入Git。文件入口：INTEGRATION_REVIEW.md、PHASE3_QUALITY_REVIEW.md、RELEASE_GATE_ACCEPTANCE.md、RELEASE_INTEGRATION_PLAN.md。

下一步只能由Owner決定：補TD-INT-01指定CS結算滿檔路徑、處置progress25文字斷言紅燈、真機／低RAM／CPU4×及其他長局矩陣，或審核具名接受範圍。Android、低RAM裝置、OS回收及實際熱降頻均NOT_RUN；CPU4×舊FAIL仍保持。再次正式整合前須重新fetch／pin main並比對六共享檔。不得自行重跑全部長測試、merge、push、deploy或影響其他worktree。
# 2026-11-08 公開測試版最新停點

Owner 已授權條件式桌機公開測試版，但最新補充指定等待 Claude Release Gate 正式交接。產品候選 `db97d102` 已在獨立發布工作區保存；RC `67f46145` 已備份至獨立 GitHub 分支與標籤。沒有 Push main／Merge main／Deploy。最新入口：[BETA_CHECKPOINT.md](BETA_CHECKPOINT.md)、[BETA_RELEASE_PREPARATION.md](BETA_RELEASE_PREPARATION.md)。以下為保留的 RC／前輪歷史，不代表新整合 SHA 已通過最後 Gate。

## 2026-11-08 CS Beta R3：已部署，正式站驗收 HOLD

正式站7cf1cebc已部署，Actions42413502348 SUCCESS；部署後補充Replay PRODUCT_FAIL，最後assert FAIL，狀態HOLD。以[BETA_RELEASE_R3_REVIEW.md](BETA_RELEASE_R3_REVIEW.md)、[BETA_RELEASE_R3_ACCEPTANCE.md](BETA_RELEASE_R3_ACCEPTANCE.md)與[BETA_RELEASE_R3_CHECKPOINT.md](BETA_RELEASE_R3_CHECKPOINT.md)為最新結果；既有R2／WAITING紀錄只作歷史。沒有在失敗後再次Push、部署或回退。

## 2026-11-08 CS Beta R4：Replay阻擋關閉，桌機Beta正式站驗收通過

最新結果見[BETA_RELEASE_R4_REVIEW.md](BETA_RELEASE_R4_REVIEW.md)／[R4清單](BETA_RELEASE_R4_ACCEPTANCE.md)／[R4停點](BETA_RELEASE_R4_CHECKPOINT.md)：同7cf1cebc正式站三圖Replay38/38，29組assert PASS。R3新阻擋已關閉；僅外部Smoke前置修正，沒有產品Hotfix／新Push／新部署。Android／低RAM未認證及CPU4×／記憶體風險維持，不改寫全面PASS。
