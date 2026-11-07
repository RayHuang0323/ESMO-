# CS Map v2 公開桌機測試版：發布準備與等待交接

2026-11-08。**狀態：WAITING_RELEASE_GATE_HANDOFF，尚未發布。** Owner 已授權條件式發布，但最新補充明確指定：Claude Code 正在獨立修復 Release Gate，交付正式 SHA、指令與結果前，不 Push main、不 Merge main、不 Deploy。本報告不取代該交接，也不把 RC 舊收據當新版本通過。

## 版本與保存

| 項目 | 實際版本／位置 |
|---|---|
| 原 RC | `67f46145b9ab9e2e5a1a78bc8f8ef685fbbbe1fe` |
| 已驗證遠端備份 | [backup/cs-map-v2-rc-20261108](https://github.com/RayHuang0323/ESMO-/tree/backup/cs-map-v2-rc-20261108) |
| 已驗證遠端標籤 | `rc/cs-map-v2-20261108-hold-r1`；解參照為上述 RC |
| 本次 pin 的 origin/main | `3e61515747bd786b01317ff68eecc7e908c8479d` |
| Claude 三份文件提交 | `a0ec13a1`、`6fa61083`、`3cae571f`，原分支保留，新候選也保留完整祖先歷史 |
| 新隔離產品 Checkpoint | `db97d1026e4ec172df3c267eb8e9520272f2ddd4` |
| 新隔離分支 | `release/cs-map-v2-beta-20261108`，本機，沒有 Push |
| 新隔離工作區 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108` |
| 本輪完整本機證據 | `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108` |

RC 備份使用正常 `git push --atomic`，只新增獨立備份分支及 RC 標籤，遠端回讀確認 main 仍為 `3e615157`。133 個 RC 差異路徑沒有大型 Heap、Replay、診斷原始證據或 node_modules。原 34 份 WIP 的 Git 狀態及逐檔 SHA 與 recovery-r51 相符，核對收據在原 RC 工作區 `review/cs-integration-20261107/evidence/beta-preflight-r1/preservation.json`；遠端回讀為同目錄 `github-backup.json`。這不是宣稱將所有原 WIP／原始證據上傳；它們仍完整留在本機備份與原工作區。

## 隔離處置與保護

- 新候選以 `3cae571f` 建立，包含最新 main 與三個未 Push 文件提交。未更動原 RC、原 CS、Claude／MOBA、BP-9、main 或其他既有工作樹。
- 比對 `7d59dab5` 至 `3e615157`，`src/`、`public/`、`tools/`、套件與 Vite 設定沒有新增差異。以 RC 對最新 main 的選擇性三方 patch 移植 124 個產品、工具、RC 歷史報告路徑；handoff 文件沒有整檔覆蓋。沒有未解決衝突。
- 新候選的 `src/`、`public/`、`vite.config.js` 與 RC 逐內容相同。main 未被 CS patch 選取的 577 個來源檔保持原 Git blob；LogicEngine、profileStore、SaveSlim、MOBA 規則／旗標、競賽狀態與存檔恢復未改。
- 六共享檔逐段核對：AppShell 只承接 sceneVersion 與結算 receipt；settleCsMatch 保留 main 的 commitCsMatch 原子邊界並拒絕失敗 receipt 入史；CsPrep 保留名單／摘要契約並加資產預載；CsProfessionalReport 與 CsResult 保留存檔摘要並呈現原創圖及未入帳狀態；RewardReceiptPanel 保留未存檔警告與正式收據來源，只呈現練習無獎勵。沒有整檔 ours/theirs。
- CsMatchResult.v1 名稱及結構保留，只延伸辨識既有 major.v2–v5 場景；Replay、十人角色、TD-FDR-01、Shader、RAF 與動畫均沿用 RC，沒有重做產品開發。
- 原創圖勾選仍是快速練習 opt-in；BO1／BO3／聯賽地圖池檔未改，沒有自動擴大正式賽事範圍。Legacy 無 selection 的既有相容路徑保留，正式發布前仍須在實際 UI 重驗範圍。

## 本輪實際驗證

受測內容的 Git tree 為 `0bcd93ad0f404986acaddaab45bd7023cb669c9e`，與產品提交 `db97d102` 的完整 tree 對應。執行時 HEAD 尚為文件基線 `3cae571f`，124 檔已 staged；因此同時保存 HEAD、index tree、命令、stdout、stderr、native exit，沒有冒稱當時 HEAD 已是新提交。後續文件 Checkpoint 不改受測產品。

| 驗證 | 本輪結果 | 限制 |
|---|---|---|
| `node tools/check_supabase_env.mjs` | native 0，UNCONFIGURED | 只證明本機 Build；CI Variables 與正式 Bundle 尚未驗 |
| `node tools/check_cs_major_shader_warmup.mjs` | native 0，14/14，RESULT=PASS | 短版守門，不代替效能／真機 |
| `node tools/check_cs_raf_fidx_coherence.mjs` | native 0，7/7，RESULT=PASS | 靜態守門，不代替整合後 reset／seek Runtime |
| `node node_modules/vite/bin/vite.js build` | native 0，built in 19.72s | 等同現行 npm build 的 Vite 指令；不是最後 Release Gate |
| source／main／三文件祖先保護 | 產品與 RC 相同，577 檔保護 | 詳見 source-protection.json／final-checkpoint.json |
| 最後 Release Gate、整合後 CS／Replay／結算／Progress／BP-9／MOBA 全套 | **NOT_RUN：等待 Claude 正式交接** | 舊 RC 有效收據只作歷史證據，不能填成本版本 PASS |
| 正式 main Push／Actions／正式站 smoke | **NOT_RUN** | 沒有部署 SHA，不能聲稱新版已上線 |

所有短驗證 stdout／stderr／native exit 在 `preparation-r1/`。第一個臨時 wrapper 因 PowerShell 將中文 regexp 轉為問號，在 Node 解析階段失敗，未開始任何驗證；保存為 `wrapper-r1-notrun.json`，改用 ASCII wrapper 後才執行上述四項。這是 HARNESS_FAIL，不是產品回歸。

本輪 `dist/assets/*.js` 全包指紋為 `09c155268343e9dd90454e01e9f47e3f7135be943483176bd6fbe602d7ecf764`，不是沿用 RC 預覽的 Bundle 指紋，也尚未經最後 Runtime Gate。收尾再次確認原 34 WIP 共 4,851,554 bytes 的逐檔 SHA 與狀態相符，原 RC 乾淨；詳見 preservation-final.json。source-protection 原始分析把尾端空 NUL 欄位多算成一路徑，原收據保留，r2 更正為 124；不影響已逐檔核對的 577 個來源 blob。

在 Owner 澄清抵達前，另外建立了 detached `cs-beta-baseline-20261108@3e615157` 並啟動現行 Competition Release Gate。收到澄清後，核對自有 PID 58916，停止其子行程；前三個 Node 區段已完成，但整體為 **ABORTED_BY_OWNER_STEERING，絕非 Release Gate PASS 或 PRODUCT_FAIL**。完整外層 stdout／stderr／exit、子區段 logs 與 owner-stop.json 留在 `baseline-r1/`；該工作樹不刪、不再續跑，也不作 Claude 修復後基線。沒有修改其追蹤原始碼。

## 發布範圍與仍未通過事項

Owner 接受的是桌機公開測試版、既有快速練習選圖入口，且最終工程 Gate 通過後才能發布；不是全面 Release Gate PASS。

| 項目 | 目前狀態 |
|---|---|
| Claude Release Gate 修復 SHA／指令／正式收據 | **發布前阻擋：尚未交付** |
| 本輪整合後完整核心回歸 | **NOT_RUN／待正式基線** |
| 真 Android、低 RAM、實際熱降頻 | **NOT_RUN／未認證**，排除桌機測試版認證範圍 |
| RG-CS-02 | 2118MiB 歷史峰值風險保留，未證明可靠改善；低 RAM／OS 回收未驗 |
| RG-CS-03 | CPU4× 既有 FAIL 保持，不降低畫質、角色數或門檻 |
| TD-INT-01 | RC 受控 38/38 保留；自然累積 3/4 為 NOT_TRIGGERED 覆蓋缺口，本輪不重跑 |
| TD-FDR-04／DUNE-F06／TD-FDR-08 | cloth 18/19、utility 6/9 既有紀錄具名保留，不寫成全面 PASS |
| TD-DEPLOY-1～4 | OPEN；通道最近曾達 8m02，不改 workflow／timeout，不用空提交測部署 |

## Claude 交接抵達後的最小續跑

1. 取得明確交接 SHA、工作區、產品／工具修改清單、完整命令、native exit、輸出形狀、原始失敗與修復後收據。先核對 Git tree 與依賴，不能只看「已修好」文字。
2. 重新 fetch 並 pin 最新 origin/main；比對本候選祖先 `3cae571f`、RC `67f46145` 與 Claude 修復。只在現有發布工作區逐段處理必要差異，保留三文件提交與 BP-9 等契約；若有未解決衝突或產品 FAIL，停止 main Push。
3. 在最終整合 SHA 執行 Claude 指定 Release Gate 與本次影響範圍回歸：Build、三圖正式快速練習 UI／十人戰鬥、Replay、戰報、結算、存檔、Progress25、BP-9、MOBA。長 verifier 仍走 tools/verify.mjs；browser gate 保留 PASS／PRODUCT_FAIL／HARNESS_FAIL 分類與原始收據。
4. 核對既有競賽地圖池未擴大、CI 雲端設定與 Bundle。部署前保存當時舊 main SHA、待發布 SHA 與回退清單，確認無進行中的衝突部署，才正常非 force Push main。
5. 核對 Actions 成功、部署 SHA、正式站 Last-Modified／Bundle，使用隔離 Chrome Profile 實測首頁、MOBA、三圖入口／戰鬥／Replay／戰報／結算與 Console；存檔發布另跑既有 B1B／B1C／B1D。保留情境 UI 前提，不用 localStorage 狀態冒充。
6. 成功後記錄實際耗時於部署追蹤；再做磁碟只讀盤點與安全清理提案，不直接刪任何現役工作樹、證據、共用 node_modules 或使用中的 Profile。

程式回退必須以新提交與 CI 重新建置，不 force 改寫 main；不可部署舊 Bundle 破壞 BP-9。SaveSlim 已摘要化的歷史不能靠程式回滾還原，只能用玩家整理前備份。尚未部署，因此本輪沒有執行回退，也沒有部署後清理盤點。

本輪結論：**HOLD／等待 Release Gate 正式交接**。可安全執行的準備已完成，不再重做 CS 開發、不開新工作樹、不繼續重複基線測試。
