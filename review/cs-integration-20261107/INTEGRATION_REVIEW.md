# ESMO CS Map v2 獨立工程整合演練

2026-11-07。**工程候選已完成選擇性移植與指定驗證，停Owner Review；Release Gate維持HOLD。沒有merge至main、push或deploy。**

## 基線、範圍與保存

- 開工時原CS HEAD為a7398436，recovery-r50的34份WIP逐一SHA相符；先另存recovery-r51。原CS全部WIP、證據及預覽保持，沒有reset／clean、沒有在原CS工作區commit。
- 必要產品Checkpoint在新工作樹`cs-map-v2-checkpoint-20261107`建立，本機提交`5fc2463b`，只含Shader預熱與Shader／RAF兩支驗證器，共三檔；沒有大型證據或不明檔案。
- fetch確認main為`7d59dab5e408ef275b11b8fe727427bb3b406d55`，以此建立全新`cs-map-v2-integration-20261107`、分支`rehearsal/cs-map-v2-main-20261107`。未使用git merge／cherry-pick；候選來源與main的共同祖先為b4f8e0c3。
- 選擇性移植FPS地圖／地形／美術／動畫／煙霧／導航／TD-FDR-01／Replay與Worker CSS邊界。原創三圖仍只在快速練習opt-in與明確scene入口啟用；沒有擅自開啟正式聯賽／BO1／BO3原創圖預設。
- 排除候選的MOBA Lineup、PlayerDetail與非必要賽前詳情UI，保留main版本。驗證依賴只保留本輪使用的閉包；未用的候選開發腳本不帶入提交，原CS全部保留。清單見selection.json、verifier-scope.json、dependency-additions.json。
- 577份其餘main來源逐blob相同，包括LogicEngine、MOBA、Store、Persistence、Progress／Reward契約、規則／旗標。122份FPS來源與5fc2463b內容相同；只清理明列新增行尾空白，沒有邏輯改動。證據main-protection.json、fps-source-equivalence.json。

## 六個共享產品檔的處置

| 檔案 | 整合結果與保護條件 |
|---|---|
| AppShell.jsx | 三方patch只移植CS scene／名稱與結算receipt呈現接線；保留main的SaveSlim、安全開機、pending commit恢復、MOBA Live規則／TacticPlanBinding與旗標。沒有整檔取候選版本 |
| settleCsMatch.js | 保留main的commitCsMatch原子結算／賽程／歷史／寫入回滾邊界；候選拒絕receipt的檢查放在build callback內，拒絕時不recordCsMatch，不拆成兩次寫入 |
| CsPrepScreen.jsx | 保留main返回賽事中心與摘要歷史；只加地圖預載，不帶候選選手詳情功能與跨域MOBA UI |
| CsProfessionalReport.jsx | 衝突只在import區，合併保留ARCHIVED_SUMMARY／文字與CS practice來源；保留歷史瘦身後的摘要語意，沒有補假統計 |
| CsResultScreen.jsx | 保留main未入帳狀態；加入拒絕receipt傳遞與三圖戰報路由，畫面不發獎、不寫Store |
| RewardReceiptPanel.jsx | 在函式header衝突區保留main unsaved hook／「這場沒有入帳」，同時保留候選summaryOnly／練習顯示及錯誤物件可讀訊息。只呈現實際receipt，不另算獎勵 |

全部共享檔均以base→候選的局部差異及main現況審查，未做整檔ours／theirs覆蓋。三方patch暫存檔不提交。

## 實際驗證收據

完整stdout／stderr／native exit在`evidence/`；三圖原生UI gate的JSON／截圖在本工作樹`review/cs-major-upgrade/evidence/integration-*`。所有測試已結束，未把執行中、被中斷或工具錯誤當PASS。

| 驗證 | 結果 | 邊界 |
|---|---|---|
| Production build／完整預覽 | PASS、native0 | 最終完整主幹public素材，建置時三個公開雲端設定明確留空；未部署 |
| Confluence正式UI快速練習 | 48/48 PASS | Dashboard→賽前→選圖勾選→四階段戰術→Loading→十人→QuickFinish→Result→返回；無c5c捷徑或注入fixture |
| Dune同流程 | 48/48 PASS | 真場景／雷達與導航牆逐值核對，練習零獎勵／不入史、返回不重複結算 |
| Foundry同流程 | 修正工具後48/48 PASS | 原r1為47/48 PRODUCT_FAIL，原因是移用Dune gate時把Foundry安包區rect也當牆；產品未改，r2保存實際矩形並精確選取牆體，不改門檻 |
| TD-FDR-01受控 | 49/49 PASS | 五個原案例、合法情報／視線／可達與第二seed牆邊接路，不保證勝負或全seed平衡 |
| Shader／RAF | 14/14、7/7 PASS | 已完成成果保留；RAF reset／seek接線未退回舊直接字串假設 |
| 三圖保存Replay | PASS、native0 | 原相同fixture，逐一比較每幀全部欄位、metadata與rawResult；無損serialize/read，不重跑引擎 |
| BP-9 P0-A Node | 1464/1464 PASS | 真MOBA／CS賽果、寫入故障、配額不足、重送、重新整理、撤回與原子提交 |
| BP-9 P0-B Node | 112/112 PASS | W1真存檔、備份同意、冷啟動驗證、摘要、還原、防重、失敗回滾、首次授權及20季壓力 |
| BP-9 browser normal | 11/11 PASS | 先完成真CS再完成真MOBA，結算／熟練／Season／日誌與重新整理防重 |
| BP-9 browser slim-300 | 44/44 PASS | 第300天真滿檔→備份／同意／整理→返回MOBA重打只入帳一次→冷啟動→後續MOBA與CS賽程 |
| runtime29（runner flat） | 35/35 PASS | 另有9段委派排除分母；不是全部MOBA長矩陣或真機驗收 |
| progress25（runner flat） | **32/33 FAIL，native1** | §13硬找`schema: "BattleResult.v2"`文字，main已無此直接字串；此檔與checker皆與main相同。其餘32條通過，沒有為CS改MOBA／放寬斷言 |
| BP-9 browser slim-cs | **3/4 PRODUCT_FAIL，native1；指定前提未觸發** | 第228天起點打兩場CS後，第244天推進日曆先遇真實存檔已滿保護；未達下一場CS結算超限。不能聲稱該案例的整理後CS返回流程已通過，也不因slim-300通過而洗掉此紅燈 |

## 失敗與工具修復紀錄

1. Confluence r1缺少owner2PracticeReportProbe，啟動即ERR_MODULE_NOT_FOUND，屬工具依賴問題；只補明確靜態依賴，r2通過，原收據保留。
2. TD-FDR-01 r1缺少第二seed原始診斷JSON，尚未完成整支；補讀原CS同一份具名檔，r2 49/49。未重造樣本或改planner。
3. Foundry radar r1 selector遞迴包含plant zone。實際Renderer的牆是hidden group的直接rect，plant zone在子group。r2保留完整wall rect清單與plant zone，修正selector對象；不是刪去牆比較或改產品幾何。
4. progress25 §13為main繼承的靜態文字斷言落差，仍FAIL。沒有擅自修改MOBA驗證器。
5. slim-cs原始UI明示「存檔空間已滿，進度先暫停保護」，有整理／重試按鈕；失敗是測試指定「CS結算超限」路徑未到，不是已證明新日曆或結算故障。此第244天情境另列TD-INT-01，不能重開已結案的舊TD-BP9-23。需後續決定如何補相同條件的CS指定前提驗證；本輪未改seed、填充容量、放寬判定或改MOBA／日曆。

## Build一致性與Release Gate

受測pristine-r1、最終pristine-r2與完整preview-r1 JS bundle皆為`b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370`。最終700來源指紋`35b6eb1c046c2be602559942471b5dbd737d727de3ee48ca9855d502e848b579`；與舊候選不同是因main整合，不能沿用舊指紋宣稱同一Build。行尾整理前後bundle逐byte相同，所以沒有重跑全部既有大測試。

**Android真機、低RAM峰值、CPU4×、完整長局仍未通過／未驗收。** 本輪功能gate中的30秒FPS僅診斷，而且部分功能gate平行執行，不是乾淨效能A/B，不取代既有CPU4×紅燈。前輪五份Heap Snapshot與2GiB峰值風險保持；沒有重新宣稱無洩漏／手機可用。

可交Owner檢視這份隔離工程候選；不建議因此直接正式merge或發布。剩餘條件包括TD-INT-01指定CS滿檔路徑、progress25原紅燈處置、真Android／低RAM／長局／CPU4×及Owner美術／戰術接受。main若再更新，須重新比對共享語意與適用回歸；本輪沒有自動追著main合併。

## 預覽與保存

獨立桌機預覽`http://localhost:5207/ESMO-/`，控制器61048；與原CS的5187／5188／5197完全分開。HTTPS host僅留對話與controller記憶體，不寫文件。完整主幹素材保留，預覽包雲端設定留空。原工作樹與大型證據不清理。

產品本機Checkpoint及最終Git SHA、公開比對與保存細節見CHECKPOINT.md。沒有正式merge、push、deploy；完成後停Owner Review。
