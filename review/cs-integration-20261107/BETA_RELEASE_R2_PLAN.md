# CS Beta：Claude SHA 守門整合與正式驗證計畫

2026-11-08，接續 `31f7bbbd`。Owner 已指定 Claude 交接分支 tooling/release-gate-sha-guard、SHA `9afe58b260c1177a780b87e321f3869c28ac0bdc`，允許符合條件後正常非 force 發布；不新增工作樹、不直接刪除資料。

## 已核對的交接

Claude 工作區 HEAD 與指定 SHA 相符、追蹤檔乾淨；當下 origin/main／遠端 main 為 `3e61515747bd786b01317ff68eecc7e908c8479d`。四份原始 JSON 收據（build、regress、regress2、release-gate-guard）已回讀，以 Claude 自己的 assert 驗證其 SHA 鏈、版本、環境、時間、摘要與命令結果。**這些只證明交接來源有效，不是 CS 候選 PASS。** 原收據與選取紀錄另存本機 `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r2\`。

本輪選取三個工具、新用法文件與 AGENTS／CLAUDE／Codex 規範的必要新增區塊；兩份 Claude handoff 只追加原新增段落，原 CS 及三份未 Push 文件提交不覆蓋。CLAUDE 新增九行的 CRLF 在 diff check 被判尾端空白，只將這九行換為 LF，規則文字不變、驗證標準不變；原始檔先備份。產品 `src/`、`public/`、Vite、package 均不改，仍與 RC 的產品一致。

## 正式候選與收據規則

先將整合工具／必要規範／本計畫 commit。**Target SHA 必須從這個新提交的 HEAD 即時取得**，不得沿用本文件的前輪 SHA；測試期間不改追蹤檔、不推進 HEAD。preflight 必須檢查 main 祖先、遠端 main 未移動、依賴與 Chrome。任何重要 Gate FAIL、BLOCKED、SHA 不符、未解主幹衝突，都停止部署、保存原始收據，不放寬斷言或自動洗綠。

| Gate 類別 | 本輪應執行內容 |
|---|---|
| SHA／工具 | preflight、候選自己的 release-gate-guard 自測；最後 assert 只收候選 SHA 的最新有效收據 |
| Build | Supabase 環境檢查、npm run build；保存 Bundle 指紋與原生退出碼 |
| regress／regress2 | 候選自己的 tools/verify.mjs 各指定單段，保留完整 log／state／輸出形狀 |
| Node 核心 | runner 的 progress25、runtime29；BP-9 P0-A／P0-B、Shader、RAF、三圖 Replay 無損、TD-FDR-01 必要檢查 |
| 三圖正式 UI | production Build 的 Confluence／Dune／Foundry 快速練習原創圖勾選、戰鬥十人、真 Quick Finish、戰報、練習結算／存檔及 Console |
| Replay Runtime | 同候選來源的獨立診斷包，既有三圖固定 Replay 匯入／reset／seek／返回原比賽／卸載；不把診斷包稱為正式發布 Bundle |
| BP-9／MOBA Browser | 真比賽 normal 與既有受控容量／整理恢復必要路徑；MOBA Battle／Result／Replay；正式站存檔 smoke 另外保留 B1B／B1C／B1D |
| 最後 assert | 所有本輪要求 gate 的候選 SHA 收據有效，且遠端 main 仍為核對值；不接受 preflight-only 代替產品驗證 |

既有大型全 seed／完整長局收據保留作歷史旁證，不冒充本候選新 PASS，也不重做已完成 CS 開發。若需測試輸入，只複製已知具 SHA 的必要 fixture 到本工作區 ignored evidence，原始證據不移動、不覆寫。

## 有限公開與發布後要求

僅桌機公開測試版與既有快速練習 opt-in，不擴大聯賽／BO1／BO3 地圖池。Android、低RAM、熱降頻 NOT_RUN／未認證，CPU4×既有 FAIL 與 Replay2118MiB風險、自然容量3/4覆蓋缺口及既有 cloth／utility 債都保留，絕不宣稱全面 Release Gate PASS。

全部必要驗證符合條件後，重新查 main；以已驗證候選作正常 fast-forward Push（不動被其他工作樹佔用的舊本機 main），不 force、不改 deploy.yml／timeout。部署前保存舊 main SHA 與回退界線；若遠端移動、衝突或 Gate 失敗便停止。程式回退須新提交＋CI，不能恢復 SaveSlim 已摘要化歷史，玩家仍須原備份。

部署後核對 Actions／部署 SHA／Bundle／Last-Modified，實測正式首頁、MOBA、三張圖入口／戰鬥／Replay／戰報／結算／Console 與存檔 smoke。實際結果、未測項目、完整命令與原始 logs 留在本機報告及收據索引；最後只讀盤點 CS worktree、證據、快取、Profile 與 C／D 槽容量，提出清理方案，不刪除任何資料。
