# CS Map v2 Beta R2：SHA 正式驗證與部署停止報告

2026-11-08。**HOLD／BLOCKED，未 Push main、未部署。** Claude Release Gate 交接已完成並整合，本輪不再等待 Claude；停止原因是補充正式包 Replay Smoke 的工具前置缺漏。Owner 指定任何重要 Gate 失敗／環境無法完成時停止部署、保存 Checkpoint，因此保留阻擋，不以其他通過收據取代。

## 版本、交接與保護

| 項目 | 實際資料 |
|---|---|
| 起點 | CS Beta Checkpoint `31f7bbbdde712f82df99612f4c16767387a09731` |
| Claude 正式交接 | `tooling/release-gate-sha-guard`，`9afe58b260c1177a780b87e321f3869c28ac0bdc` |
| 受測候選 Target SHA | **`7cf1cebc10915f096a256885388ecd8a7052e5f3`**，於候選自己的工作區讀取 HEAD |
| 遠端 main | `3e61515747bd786b01317ff68eecc7e908c8479d`，收尾回讀仍相同 |
| 工作區 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108`，沿用既有工作區，沒有新增專案 worktree |
| 分支 | `release/cs-map-v2-beta-20261108`，本機 |
| 受測發布包 | 全 JS 指紋 `b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370`；三個雲端環境欄位明確留空以對齊既有 CI 未設定情境 |
| 原始收據與完整 logs | `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r2\` |
| 受測來源停點 tag | `checkpoint/cs-beta-release-20261108-r2-blocked-source` → `7cf1cebc`；僅本機 |

Claude 四份原始收據已複製留存、核對其 SHA 鏈／摘要／環境／時間，Claude 自己的 assert 通過；**沒有把它的 PASS 算成本候選 PASS**。選取三個工具、新用法文件及 AGENTS／CLAUDE／Codex 的必要新增規範；兩份 Claude handoff 只追加原新增段落。原 CS、MOBA、BP-9 工作區與三個文件提交 `a0ec13a1`／`6fa61083`／`3cae571f` 均保留。本輪只新增工具／規範／文件，產品 `src/`、`public/`、Vite 與套件仍與 RC67f46145 相同。未整檔覆蓋共享產品檔，未改部署 workflow。

CLAUDE 新增九行 CRLF 曾觸發 diff check，只將這九行轉 LF，文字不改，原始檔備份與 line-endings.json 保留。其後先 commit 成 `7cf1cebc` 才執行所有正式 Gate；測試過程 HEAD 未移動、追蹤檔乾淨。原 34 WIP 的收尾完整性另見本輪 preservation-final.json，沒有 reset／clean 或覆蓋 WIP。

## 本候選實際驗證

所有下列執行都使用候選自己的工具／來源，並由 Release Gate v1.0.0 綁定 `target=actual=7cf1cebc1091`；長 verifier 經 tools/verify.mjs，完整子輸出另存 runner-logs，沒有只留最後計數。

| 類別 | 實際結果與範圍 |
|---|---|
| preflight | PASS；main 祖先、遠端 main 未移動、14 個頂層依賴／lock、Node、Chrome、空間、乾淨來源均通過 |
| SHA Guard 自測 | **118/118 PASS**，本候選重跑，非沿用 Claude 版本收據 |
| Build | 原生 0；一般 Build 與 CI 空白雲端設定對齊 Build 均通過；本機 Supabase UNCONFIGURED，不等於已驗證未執行的本輪 CI |
| regress／regress2 | runner PASS；**15/15 正常結束、8/8 節奏門檻** |
| Progress25／runtime29 | **33/33、35/35**；runtime29 的 9 個委派項仍明列 SKIP，不宣稱全部 verifier 通過 |
| BP-9 Node | P0-A **1464/1464**；P0-B **112/112**，包括既有 20 季容量壓力 |
| Shader／RAF | **14/14、7/7** |
| 三圖 Replay 無損 | Confluence3497／Dune3256／Foundry3865 保存幀；逐幀所有欄位、metadata、rawResult 無損往返 |
| TD-FDR-01 | **49/49**；固定事故純規劃及合法情報／責任接線，不以勝負或拆彈率當唯一判準 |
| 三圖正式快速練習 UI | Confluence、Dune、Foundry 各 **48/48**，同一發布包；Dashboard → opt-in 選圖 → 十人戰鬥 → 真 Quick Finish → 戰報／練習結算／返回，沒有 c5c 捷徑或 fixture 注入 |
| 真 Chrome BP-9 | normal **11/11**；受控 CS 結算超限／整理／返回原場 **38/38**；slim-300 **44/44** |
| MOBA 正式流程與 Replay | **89/89**；1366／390 桌機模擬、正式賽前／戰鬥／結算／Replay、旗標關閉、舊正式站測試存檔恢復與續玩。沒有使用低畫質捷徑；390 不是真 Android |
| Replay 診斷包 Runtime | **49/49**；三圖各三次 reset／seek／返回同一原比賽及卸載；與正式包分開封存，未當作正式包無 probe 證明 |
| 部署前舊正式站測試存檔 | 已由獨立 Chrome Profile 保存，只用作相容輸入，不冒充新版本正式站 Smoke |
| 補充正式包 Replay 原生操作 | **BLOCKED／HARNESS_FAIL**；Confluence 已完成 6 個檢查，之後無法完成原生返回操作；Dune／Foundry及後續步驟 **NOT_RUN** |
| 最後 assert | **BLOCKED，native exit 2**；檢查20個要求 gate，19份 run PASS，1份最新收據 BLOCKED；不接受其較早通過項目代替 |
| 本輪 Push／Actions／部署後 Smoke／C與D盤點 | **NOT_RUN**；沒有本輪部署 SHA／新 Actions，既有 main／正式站不變 |

本機桌機環境：Windows11 Build22000、Ryzen5 5600U、約19.8GiB實體記憶體、AMD Radeon、Chrome156.0.8078.80、Node24.18.0。這只描述驗證電腦，不能據此宣稱低RAM或手機支援。

## 阻擋根因：補充 Smoke 漏開摺疊面板

新增的只讀 DOM／原生操作 Smoke 位於本機 `production-replay-smoke.mjs`，使用本候選的 harness／CDP／原生滑桿與檔案輸入 helper；沒有 scene probe、Store 注入或修改產品。它用既有 c5c review route 準備原比賽，只補驗正式包保存 Replay 控制；正式快速練習入口已由上方三圖 48/48 分別驗證，不能混為同一路徑。

實際已通過：Confluence 正式包十人原比賽、原生檔案匯入3497幀、原生 seek 到24／3495／12、保存 Replay 自然推進。接著 `clickFpsDNative` 對 `[data-testid=cs-replay-exit]` 做 hit-test，中心為 `(363,413.33)`，命中的卻是「陣亡位置：隱藏」，因此依既有規則拒絕點擊，回傳 HARNESS_FAIL，Release Gate 正確映射為 BLOCKED。

只讀核對發現前置缺漏：產品把「返回原比賽」放在 `<details class="fps-major-replay">` 裡，預設摺疊；新增 Smoke 透過原生 file input 匯入，**漏了先點 summary 展開**。保留的 confluence.png 顯示面板仍摺疊。既有 fpsFoundryReview.mjs、fpsNetworkReview.mjs 與 Replay UI gate 都有先展開 summary。這是已定位的工具流程問題，**不是已確認產品 UI／存檔缺陷**；但本次返回與卸載沒有完成，不能記 PASS。

此外，該補充腳本的初版在執行前表達式語法檢查曾發現 selector 引號跳脫問題；已保存 browser-expression-r1 stdout／stderr，改為 JSON.stringify selector，靜態重驗通過才開始上述真 Browser Gate。語法檢查不算產品驗證。實際 Browser 的摺疊前置問題在本輪**未修改、未重跑、未繞過**；不改用 element.click、不跳過 hit-test、不降低斷言。

## 原始收據與最後判定

根目錄 `release-r2/` 含 candidate.json、integration-selection.json、Claude原收據、各步 stdout／stderr、node-results.json、browser-results.json、fixtures.json、production-build.json、environment-host.json。正式包補充 Smoke 的 result／harness／截圖位於 `production-replay-local/`，失敗收據原件亦在 Git common dir，副本在 candidate-receipts。完整 runner 子輸出已另複製 runner-logs；原檔不刪。

失敗 Gate 原始最後一行：

```text
RELEASE_GATE RESULT=BLOCKED exit=2 version=1.0.0 gate=cs-production-replay-local target=7cf1cebc1091 actual=7cf1cebc1091 receipt=D:\OneDrive\文件\GitHub\ESMO\.git\esmo-release-gate\receipts\20261107T202119Z__7cf1cebc1091__cs-production-replay-local__BLOCKED.json
```

完整最後 assert 的20項名稱與實際輸出在 final-assert.json／final-assert.stdout.log，原生退出碼2。沒有執行會虛構成功的 preflight-only assert，也沒有刪除 BLOCKED 收據。

## 最小接續工作與保留風險

1. 先讀本報告與 BETA_RELEASE_R2_CHECKPOINT.md。文件 Checkpoint 與受測來源 `7cf1cebc` 分開；只用既有工作區恢復，先確認乾淨並保存文件停點，再切回受測來源，避免把文件 HEAD 當同一 SHA。
2. 僅修補充 Smoke 的面板前置：用原生點擊 summary，證明 details.open、按鈕可見且 hit-test 正確，再做匯入／返回／卸載；以新目錄保留重跑，不覆寫本次失敗。**不需改 CS 產品**。
3. 重新 pin 最新遠端 main。若來源仍7cf1cebc、環境相同且收據未過24小時，可由守門工具決定哪些收據仍有效；補驗失敗項後必須再跑完整要求的最後 assert。若 main／產品／工具 SHA、環境或有效期改變，依工具要求重新整合／驗證，不假造沿用。
4. 只有最新全部要求通過後才具備恢復有限桌機 Beta 發布的工程條件；本輪沒有部署。不得跳過此次 BLOCKED 直接 Push。

Android、低RAM、實際熱降頻仍 NOT_RUN／未認證；CPU4×既有FAIL、Replay2118MiB峰值、自然容量3/4 NOT_TRIGGERED、cloth18/19／utility6/9既有具名債保留。Owner的桌機快速練習 opt-in 公開測試授權不等於全面 Release Gate PASS，也不擴大聯賽／BO1／BO3地圖池。

本輪無新的正式站版本或回退操作；遠端 main3e615157 未移動。未刪除既有工作樹、原始證據、共用 node_modules 或現役工具資料。部署後只讀磁碟盤點尚未到執行條件，列 NOT_RUN，不虛構可回收容量。
