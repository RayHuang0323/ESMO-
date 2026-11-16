# Original Competition Pool — 本機候選驗收

2026-11-16；接續 4577c858，分支 feature/cs-professional-expansion-20261116。限 Owner Review，本輪不 push／deploy，不變更正式預設地圖池。

## 根因與修正

1. 原 dev preview 的 Worker import JSX 被 Vite React Refresh 注入 /@react-refresh:603 的 window 存取，Worker 報 ReferenceError，退回主執行緒重算。真實 Worker 輸入已保存；同一 Foundry／seed64640／名單在 canonical Node 模擬 8.87秒完成、24回合11:13、4306幀。這是 dev 工具環境問題，正式驗收與 Owner 入口改用 production preview 5190，沒有放寬45秒進場斷言。
2. 舊 Browser 工具 await button.click() 遇到原生 window.confirm 會等待對話框，直到 supervisor。工具現在只對「快速完成本場」的原生 confirm 正常接受，再點產品「查看賽後戰報」。沒有覆寫 confirm、注入結果或繞過就緒。
3. Replay 切換揭露 PRODUCT_FAIL：Three compileAsync 計時器仍檢查已釋放的場景材質，拋 currentProgram.isReady 例外。可變整場景改同步 compile；獨立屋頂 probes 保留原 async 生命週期。原59/60 FAIL保留，修後同Replay矩陣60/60、Console/page errors為0。
4. 正式場次原只顯示對手名稱，沒有傳入對手actors，3D退回內建Compulsary。新增CS專屬純Adapter，消費同一csAiRosterAt／csAiLineupAt／careerYearOf；新正式賽傳真實五人名單並保存 opponentSnapshot，恢復優先讀快照。已有模擬快照但缺新欄位的舊場次維持原actors，不migration。8隊純測通過。
5. 原創歷史評分以 competitionMapId＋layoutId 篩選；legacy 排除原創scene，無資料保持未知基準。測試池只能在手動Veto前啟用，從同seed重建該池Veto，保存到原fixture帳本，不重置已開始系列。舊歷史不寫回、不改名。6/6分群反例通過。mapFit／style仍是既有選圖模型，尚非三圖獨立校準或公平性認證。

## 真實流程與測試前提

production preview 的新正式對手矩陣71/71 PASS，三圖BO1、BO3、戰報、既有Replay匯入／返回、歷史身分及結算後重整通過。

| 案例 | 真實比分 |
|---|---|
| Foundry BO1（完整三圖Ban） | 13:1 |
| Confluence BO1 | 13:9 |
| Dune BO1 | 14:16 |
| Major BO3 | Dune11:13 → Foundry13:8 → Confluence10:13，我方1:2落敗 |

以上是中間候選紀錄，不保證後續每次戰果相同；不以勝率作驗收門檻。Confluence／Dune BO1在測試存檔的fixture宣告單圖池，只改測試情境、不改產品聯賽預設；Foundry仍走原Ban流程。Major測試沿用既有工具的半決賽席位情境，不宣稱自然晉級全季已實玩。所有模擬、獎勵與結算均走正式程式，沒有注入勝負。

最終工具另加戰鬥中真reload／resume、每局新增交易、系列至少兩勝與唯一fixture outcome、結果重整冪等斷言。最終SHA及結果以新Release Gate收據／交付回報為準；不得把此處中間候選PASS套用到其他SHA。

Replay重用受保護的三份R4 gz fixture，未生成新大型Replay／Heap；測試用新隔離Chrome，未操作Owner日常存檔。Console錯誤不忽略，舊失敗log不改寫。

## 整合檢查與保護

本輪完整BP-9 20季×136場容量壓力112/112 PASS（之前INTERRUPTED仍保留）。Progress／regress／regress2通過。Shader warmup子測試14/14 PASS而runner仍期待12/12，造成工具shape FAIL；只同步期待14/14，沒有刪除或放寬子測試，重跑PASS。

原C4、反應敏感度、首殺戰報、Learning／Training成果保留。Claude MOBA工作樹未修改；其6修改／2未追蹤與未推送提交保護。34WIP、D槽歷史Replay／Heap／Build及原失敗證據不清理。

完整本機證據根：C:\Users\ifikn\esmo-measure\cs-professional-pool-closure-20261116。包含dialog-fix、diagnostic、worker-timing、worker-roundtrip、exact-sim、expanded、replay-expanded、shader-fixed、canonical及最後Gate stdout／stderr。新輸出使用獨立名稱，不覆蓋前輪收據。

## Owner入口與邊界

最後實際截圖覆核補正：BO3順序籤曾固定查Legacy CS_MAPS，與已正確顯示的原創卡片不一致；改為使用本場同一份maps呈現，加入Browser三個原創名稱及不含Legacy名稱斷言。此前506357f7的Browser82/82、BP-9 112/112及三Gate assert均PASS；本項顯示修改之後需對新Checkpoint重新取得收據，不能沿用506357f7的PASS。原截圖與全部失敗證據均保留。

http://127.0.0.1:5190/ESMO-/ （production preview，取代有React Refresh問題的5189 dev入口）。進CS正式賽程→準備／確認→選圖前點「啟用本系列原創三圖測試池」→戰術→比賽；可用產品「快速完成」及原生確認→查看戰報。比賽中的「保存與開啟重播」沿用既有匯入／匯出入口。賽程需依真實遊戲日出現，不新增偽造Owner戰果或修改日常存檔。

本機測試候選不等於正式發版。Android／低RAM／熱降頻NOT_RUN，CPU4×FAIL、Replay2118MiB歷史風險保留。自然Major晉級全季與大樣本公平性未認證；三圖mapFit／style權重獨立校準仍列待辦。最終Gate若不通過，維持HOLD。
