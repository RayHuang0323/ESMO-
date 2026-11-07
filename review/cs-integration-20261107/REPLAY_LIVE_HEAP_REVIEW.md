# RG-CS-02：同時存活記憶體歸因與隔離實驗

接續4e155007，2026-11-08。**Release Gate HOLD；本輪沒有產品修改，停Owner Review。** TD-INT-01受控38/38與自然3/4歷史不重跑；原七份Allocation Profiles沿用。不merge／push／deploy，不再次整合，不擴做CPU4×。

## 方法與可信度

同一Foundry保存Replay SHA `931b85da435e1309e46c05e7124797e3ec384f097c5602dfa3d314528234fc86`、3865幀；產品來源feeed6c8…83ab7保持。Chrome/156.0.8078.80由Browser.getVersion實際記錄，桌機1366×900／DPR1／ANGLE default。r41為基線診斷Build，r42唯一實驗是在文字join後`chunks.length=0`，只清已解碼片段的陣列參照，joined字串與解析流程不改；兩者均只在Build plugin中轉換，src不動。不是pristine bundle，不能把其數值直接當正式版改善。

用Tracing紀錄GC與階段TimeStamp，Runtime.getHeapUsage觀測主執行緒usedSize、backingStorageSize、embedderHeapUsedSize；Target auto-attach另量Worker的獨立heap。要求100ms輪詢，但長任務／CDP回應會延後，實際每輪只有約122～125份觀測，**不是無遺漏連續峰值**。保留原trace.jsonl、audit.json、stage／GC／Worker與完整stdout／stderr／exit。

四個口徑分開：

- Allocation Profile是含已GC物件的累積配置估計；不能相加當同時存活量。
- Runtime usedSize與GC前usedHeapSize含尚未回收的垃圾，不能稱為全部reachable live objects。
- Major GC後的used heap更接近當時存活資料，但不是全流程最高reachable heap。
- backing／embedder是額外API觀測欄位，非原生解壓器專用RAM；不把各自不同時刻的最大值相加，亦不冒稱整個Chrome／GPU／裝置RAM。

階段內performance.memory值未開precise flag，只作coarse輔助。部分coarse值大於同時段CDP／GC觀測，可能涉及計數範圍／更新時機；不能拿它精確拆帳2118MiB。

## 基線、實驗與反向校準

順序：r3基線→r4清chunks實驗→r5基線校準，各自新Chrome、同Fixture、三次連續匯入／返回。窗口內無強制GC、無Allocation Sampling、無Heap Snapshot；逐幀SHA256移到全部窗口後的另一次匯入，以免完整性檢查的字串配置污染下一輪。全部三份正式量測均9/9 PASS／native0：每輪十名Rigged、保存位置零偏差、返回同一原比賽物件（WeakRef identity）、無頁面錯誤；窗口外3865幀每幀全部欄位SHA256與Node原Fixture一致。

| 指標（MiB） | r3基線 | r4隔離實驗 | r5基線校準 |
|---|---:|---:|---:|
| 主執行緒輪詢used高水位 | 1245.1 | 1235.6 | 1262.7 |
| 主執行緒GC事件前最高used | 1538.4 | 1243.2 | 1549.7 |
| backingStorage最高觀測 | 431.7 | 320.8 | 431.7 |
| embedderHeap最高觀測 | 18.9 | 18.5 | 19.0 |
| Worker最高used觀測 | 78.5 | 72.3 | 72.9 |

r4／r5的三次「file-start→read-complete」分別約1349／1152／982ms與1328／877／1176ms；到場景ready及同樣原生控制操作後約4735／3214／2971ms與4395／2779／3375ms，沒有一致變快。r3尚未記錄perfAt，不能補猜完整ready時間，僅有讀取／解析1260／884／1068ms。

實驗的GC前高水位約低20%、backing觀測約低26%，有縮短暫存文字壽命的訊號；但輪詢used高水位僅差約2%、時間方向混合，樣本很少且Inspector／GC時序有干預。**尚未證明原正式2118MiB峰值可可靠降低，不採入產品，也不擴修場景／服裝。** 原2118收據不刪、不回寫為新數據。

## 峰值階段與Worker

r3主執行緒最高GC事件發生在第三次`joined`標記後、JSON.parse期間：MajorGC前1538.4MiB，該事件後415.1MiB。r5最高亦在第三次joined後，約1549.7MiB。之前的匯入／返回環境與服裝重建已累積暫存配置，下一輪又新增解壓文字、合併字串與解析物件，GC在此回收大量不可達資料。這支持「前輪暫存未回收＋本輪讀取／解析重疊」的機制，而不是把全部2118MiB當成Replay強持有。

原七份profile顯示scene／服裝累積配置大於parse與Pool，現在可以對應到重建後尚未GC的高used；但沒有對原2118那一瞬間補拍Snapshot，不能聲稱已完全重建它的每個持有類別或最高reachable live heap。

Worker有獨立isolate，掛載模擬階段觀測約72～78MiB；量測末段自然回到約5.5MiB。全部窗口結束後才做Worker專用collectGarbage診斷，約5.48→5.48MiB，backing約6.13MiB，與窗口數據分開。匯入／返回沒有建立新Worker、原比賽物件保持；本輪高水位主要在主執行緒，不能將Worker與主執行緒不同時刻的max相加。Worker瞬時峰值仍可能漏採。

## 原生解壓與原比賽快取：仍有邊界

原生DecompressionStream解壓輸出110169020 bytes，解碼完成後才join，再JSON.parse／Pool展開。API backing觀測最多約432MiB，證明只看V8 used不能涵蓋所有儲存；但它也包含外部字串／ArrayBuffer等，沒有原生解壓器獨立allocator trace，**解壓器實際同時RAM與整個renderer RSS仍未完整歸因**，不以輸出bytes冒充原生RAM。

正常快取以WeakRef確認三輪返回同一物件，不是每輪新增一份normal sim；前輪五份Snapshot的lastMountSimulation持有路徑沿用。整頁Heap包括場景、字串等，不能拿它當快取精確大小。原快取同時存活量與最高reachable heap尚未逐類定量，不刪快取、不重跑引擎、不犧牲返回功能來降數字。

## 原始收據與工具修正

r1／r2各11/11功能通過，但逐幀hash插在各輪之間，會影響後續配置；不採為自然峰值基線。一次工具產生器因PowerShell中文字串marker不匹配而未寫檔，r2仍跑舊設計；原工具輸出與兩份收據保留，沒有把它們當新覆蓋。改用明確patch後，r3起完整性全移到量測窗口外。最終audit舊的全域「無強制GC」文字須以實際postWindowWorkerGC欄位及本報告為準：自然窗口無GC干預，窗口後Worker GC明確另列。最後工具說明已修正。

Reference ledger：threejs-debug-profiler/SKILL.md、references/debug-profile-checklists.md、references/checklists/performance-profile.md已讀，使用Build／裝置、GC壓力、生命週期與相同條件比較檢查。新量測工具不改既有verifier門檻。

## 支援規格與Release Gate

停止擴修產品。不能由桌機結果認證手機最低RAM，亦不能把2GB級used觀測當成整機只需2GB。建議大型Replay暫不承諾2～4GB低RAM手機支援；若有現成裝置，優先以8GB以上真Android作下一輪候選驗收起點，仍是NOT_RUN、不是已支援下限或購機建議。正式最低規格須經實機匯入峰值、背景／OS回收及返回流程後才能公布。

RG-CS-02保持發布阻擋：2118MiB歷史峰值完整拆分、原生解壓／renderer RAM、低RAM／OS回收與全長局矩陣仍未完成。真Android／低RAM NOT_RUN；CPU4×既有FAIL不豁免、不擴做；Owner美術／戰術接受與cloth／utility原技術債保持。有效三圖、BP-9、MOBA、TD-FDR-01、Shader／RAF與TD-INT-01收據沿用，本輪不重跑大型矩陣。

main仍3e615157，相對原基線只有文件差異；未重新整合。原34份WIP與所有其他工作樹保持，產品src／public／Vite對4e155007不變。最終安全停點及raw trace／Build／收據SHA在evidence/live-heap-checkpoint-r1/manifest.json。預覽仍獨立5207／controller61048，HTTPS僅對話／記憶體。
