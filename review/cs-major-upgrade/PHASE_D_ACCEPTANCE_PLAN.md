# Phase D：保存幀與觀戰介面

2026-10-11 UTC15:44：C已收件，D產品已接線；production封存建置native0，D Node與Browser待收，不代表驗收通過。

畫面主題是電競觀戰：戰場與真比分是第一層，通訊／回合走勢是第二層，經濟／逐回合十人統計／重播檔案操作預設收合。沿用 GC 的 bg/card/blueL/gold/green/red/gray 與 FONT/MONO，不另建色票。識別元素採真回合序列，可 seek 至該回合；隊伍名稱與五人身份固定，攻守另標文字。

## 接線與邊界

- 新 `fpsReplay.js`：CsReplay.v1 包含合法metadata、保存simulation與原rawResult；純驗證／深拷貝，frame roundHist只保存可見prefix。輸入不合法時提供可讀中文，不執行模擬。
- 新 `fpsMatchUi.js`：stable team分組、真金額格式、依roundSec窗口重建casts/comms。倒帶與暫停不借未來frame或牆鐘timer。
- `replayData` 必須優先於同步／Worker，Progress／completion／QuickFinish在重播阻擋。匯入是同畫面呈現層狀態，不新增Store／Router／reward寫入。
- Major的目標／結果banner移出戰場，kill feed限制寬度與截字；選手詳細卡維持戰場外。播放／相機／離開控制44px、固定頂部離開、safe area、reduced-motion，顯示狀態有文字。
- 賽後只展示真ADR/KAST/utility damage與每局十人資料。CS Result契約的必要向後相容修正／扩充須先說明並跑相關verifier，不能另算reward或混入MOBA。

## 最小正式證據

1. Node：合成非法反例明確標示，真C simulation只保存一份作JSON roundtrip／全部frames／真統計驗證，不再次重跑模擬。
2. 同一production Battle掛載，四寬度320/360/390/430依序resize；以真UI確認canvas、range、radio存在再驗overflow、44px、panel戰場分離。
3. 原生pause／seek／換邊，讀真UI的游標、訊息與playerIds；匯出真檔後原生匯入同檔，確認重播終局不增加sim/Worker/Progress/completion計數。
4. 損壞JSON匯入後有可讀錯誤、原比賽保持可操作。額外pristine production正式流程Dashboard→CS賽前→地圖→戰術→Battle→QuickFinish→Result，不以review query入口冒充正式流程。
5. 小型代表截圖与pixel audit，沿用同archive，不重拍人物圖庫。完整stdout/stderr、native exit、metrics与來源保留。真手機FPS／觸控／音效仍未實測。

Tools-only reviewer已準備 `tools/check_cs_major_replay_ui.mjs` 與 `tools/browser/fpsReplayUiProbe.mjs`；語法native0，正式Node／Browser仍NOT_RUN。

## 實作與唯一資料來源

新增fpsReplayFiles.js以JSON或gzip下載／原生file input匯入，64MiB檔案與256MiB展開界限，compact只去重frame的roundHist，其他保存欄位全部保持。正常simulation/cursor cache與completedRef隔離，重播不呼叫模擬／Worker／Progress／completion；CsMatchScreen外層save與結果入口同時阻擋。

C接受的domain hash89c34e18…經d-preserves-c-domain.json核對完全相同；UI改動不重跑C。唯一d-canonical-replay.json.gz 2,096,234bytes，1111frames/21rounds，7/7封裝檢查native0；rawResult為真buildMatchResult、13:8，沒有重模擬／大raw副本。Major-only CsMatchResult.v1可選roundDetails/utilityDamage直接攜帶真資料，legacy不新增欄位，Reward原路徑不改。


## 2026-10-12 正式收件

D51/51、契約28/28、completion36/36；原48重播行為與四寬度分段補驗；新增壞輸入Node15/15与真Legacy原生Browser15/15全native0。原失敗保留，非單次full53/53；Legacy本輪原游標0，非零還原未在新增情境實測。詳見OWNER_REVIEW.md與最新RESUME_CHECKPOINT.md，停止新開發等待Owner Review。
