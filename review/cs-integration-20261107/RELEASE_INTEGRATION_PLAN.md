# 第四階段：正式整合／部署計畫（僅規劃）

## 2026-11-08 授權與等待條件更新

Owner 最新授權：RC67f46145 可在正確 Gate 通過後發布為桌機公開測試版，限既有快速練習 opt-in，允許獨立備份 Push 與有條件正常 Push main／Pages。隨後明確補充：Claude Code 仍在修復 Release Gate，正式交接 SHA／指令／結果交付前，不 Push main、不 Merge main、不 Deploy。已完成 RC 遠端備份及本機候選 db97d102；最新執行清單見 BETA_RELEASE_PREPARATION.md／BETA_CHECKPOINT.md。下列「尚未授權」文字是前輪歷史，已由本節限縮授權取代；工程 Gate 與真實收據條件沒有豁免。

Owner只授權準備此計畫，尚未授權merge至main、push或deploy。本文件不是執行核准，也不是Release Gate PASS。實際候選SHA、第三階段結果以最新CHECKPOINT.md與品質報告為準。

## Owner決策前的條件

1. 明確決定真Android、低RAM匯入峰值、CPU4×及完整長局的接受範圍；沒有實測的項目保持NOT_RUN，不能用桌機390px、CPU降速或一般GPU視窗代替。正式發佈若接受風險須Owner明確決策，不能由agent自行豁免。
2. 處理progress25繼承的BattleResult文字斷言紅燈：驗證器適配須保留舊收據並有契約runtime證據，不得只改數字或刪斷言。
3. 補TD-INT-01的指定CS結算滿檔／整理後返回路徑；slim-300的44/44不能冒充slim-cs前提已觸發。
4. Owner檢視三圖美術、十人動畫、戰術AI與TD-FDR-01；目前不把全seed平衡、全路線使用或零滑步當成已完成。

## 正式整合前的工程步驟

- 重新fetch並pin當時的origin/main；比較本輪基線7d59dab5之後的新提交。若共享語意改變，建立新的隔離候選，不能覆蓋Claude／MOBA或直接將目前檔案塞回main。
- 仍採選擇性移植，六共享檔依本輪衝突紀錄再審；main的commitCsMatch、SaveSlim、Progress、恢復、MOBA規則／旗標為保護基線。必要時逐段調整並重驗，不整檔ours/theirs。
- 維持原創三圖practice opt-in；聯賽／BO1／BO3接入是獨立功能決策，這份整合不自動開啟。
- 在最終候選重建production並記錄來源與bundle指紋；只在新改動／新失敗影響到的範圍重跑，可信且相同Build的既有收據不重跑冒充新成果。

## 最終驗證清單

- 三圖正式UI路徑、原創圖勾選與正式賽事原預設，保存Replay匯入／自然播放／seek／卸載恢復及Result。
- BP-9 P0-A／P0-B、滿檔／部分寫入／重送／冷啟動／備份同意／還原、摘要歷史與未入帳提示；不可把無法觸發的情境當PASS。
- MOBA正式核心流程、規則與旗標、存檔恢復、必要runner段；明列既有紅燈與未跑段，禁止因幾支PASS宣稱全部159段通過。
- 真機／低規／長時品質依Owner決定補驗，保留所有原始失敗、stdout／stderr、native exit、Checkpoint與裝置條件。
- 正式Bundle與雲端環境設定另外核對。本輪預覽刻意留空三個雲端設定，不能代替正式CI環境檢查；不自行修改GitHub Variables或部署設定。

## 未來發布與回退（本輪不執行）

只有Owner另行明確授權後，才能將指定且已驗證的候選整合至main、push並執行部署。正式站smoke必須先由畫面確認scenario前提，再驗證CS／MOBA／存檔，不能只靠localStorage注入後推定成功。

回退須以新提交與重新建置處理；不強制改寫歷史。BP-9已摘要化的歷史無法靠程式回退還原，只能使用玩家整理前的備份，因此必須保留現有備份確認與還原契約。原始證據與各候選Build不刪。

本輪停止點是Owner Review，等Owner隔日確認；無自動正式整合、push或deploy流程。
