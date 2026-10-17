# CS Major 真 GPU／Browser 補驗佇列

## Owner 人物美術收尾與清理授權（最新）

2026-10-11 Owner 最新指示：人物美術接受目前完成度，停止人體／手指完美化，不再以舊獨立 1／U findings 阻擋反覆追修；原審查分數與遮擋限制保留，不宣稱獨立藝術 PASS 或量測90分。只收必要 B 技術驗證後直接 C → D → E，完成停 Owner Review，不 push／deploy、不動 MOBA。升級完成後已授權清理本 CS 工作區淘汰 evidence／profile-builds，保留最終可用版、必要完整驗證紀錄、素材授權與唯一恢復點；執行前逐份核對明確清單、resolved path、連結及使用中程序。

Worker 誤測更正：session55430/native1 的12項失敗實際來源為舊 dist（fpsSim.worker-DErVJcoY.js），因 supervisor 指令漏 -- 而未傳 buildDir／headless；原 gate 標 PRODUCT_FAIL 及完整 logs 原樣保留，此結果不能歸因當前 f7a181dd source。正確 archive 的 headless CPU Worker 補驗 session17955 尚待原生 exit。產品未因誤測修改。

以下較早狀態及分數屬歷史，下一步以 RESUME_CHECKPOINT.md 最新段為準。

2026-10-09，依 Ray 明確指示：MOBA worktree 正在正式 Release 驗證。CS 只繼續 Blender 作者檢查、資產修模及離線驗證；不啟動或平行執行重型 Browser／GPU gate，不中止、搶占、接管或干擾 MOBA 程序。

## 2026-10-11 佇列狀態

MOBA Release已由Owner確認全部結束。source4c5424f1…局部GPU17/17、pixels4/4/native0、完整四圖／三anchors及獨立審查已完成；Chrome清理confirmed、沒有執行中gate或背景排程。手／肘1、遮擋U，B7未過，此版本不補更多角度。先作者實質改善，才依v4最少新來源取證，未受影響已完成gate不重跑。完整B、本source Worker與C/D/E尚未開始。以下原始隊列僅歷史，不借舊source放行。

## 啟動條件

須有可靠的 MOBA Release gate 已結束資訊，再查 CS 官方額度高於 3%、資源及既有隔離守門。單次沒有外部 Chrome PID 不代表整批 Release 已結束，不能據此搶占空檔。這份文件只是待辦，沒有背景排程或自動執行程序。

## 序列順序

1. **當前產品真保存幀作者 packet，0PNG**：新 diagnostic phase，`--runtimeAuthoring=true --captureMode=metrics`，重用 `diagnostic-b7-thin-cuff-20261009` archive。先由真 UI 確認暫停、選手、CT/T support sniper 與 frame，再匯出；新探針尚未實跑。source `08c66c9f…`／bundle `27783afd…` 逐 byte 核對。不重跑既有 16/16 圖庫或重拍兩圖。
2. **用真 Browser packet 校對 Blender 作者疑點**：當前 fixture 的扳機手遮擋分層不直接代表真保存幀穿模。先確認一致性；若不一致修作者工具，不改產品迎合診斷。
3. **有證據的候選才整合**：袖口候選 `b7-blender-cuff-rim-20261009/merged-candidate-affine.mjs` 通過作者結構 preflight、150次蒙皮／接縫診斷，候選法線／AO已準備，產品整合、完整動作及真藝術仍缺。保留已過 423 筆作者資料，核對有改動部分的 bind／UV／AO。握姿候選仍不採用。所有必要產品 CPU 檢查先完成。
4. **只跑必要 B7 局部真 GPU**：產品 source 真改動才建立一份新 archive，固定原必要 CT/T 視角、不挑有利图；局部袖口最多四圖，明確握槍遮擋缺口才補必要兩圖。全量六身份／雙尺寸／五槍族驗收在局部藝術解除後才補缺，不縮減正式範圍。新 source 不借舊圖放行。
5. **B7 完整放行後**：依 checkpoint 收 B gate，再 C → D → E，完成停 Owner Review。不 push／deploy，不動 MOBA。

每個 gate 等前一個程序完全收尾才啟動下一個；保存完整 stdout／stderr、原生 exit、隔離及來源資料。`HARNESS_FAIL` 修環境或工具，不能當產品回歸。額度剩 3%（含以下）立即停止新工序、保存停點並暫停既有 goal。
