# CS受控結算容量與Allocation Sampling驗收

2026-11-08，接續6d1163bb，僅隔離整合工作樹。**Release Gate HOLD，停Owner Review。** 本輪無產品修改、不重新整合、不重跑有效大型矩陣，不merge／push／deploy。

## TD-INT-01：受控覆蓋已補

原W1第228天自然累積slim-cs仍3/4，因第244天日曆先滿而未觸發下一場CS結算；原失敗與日曆恢復32/32保留，未改原斷言或產品保護。

新增獨立controlled-cs-quota：全新Chrome載入同一W1存檔，真UI到第233天CS、選圖／戰術／戰鬥就緒後，在**非產品key** `review.cs.quota.fixture`填149949字元、保留4096字元空間，再以原QuickFinish完成真比賽。未修改產品key／賽程／winner、未攔截setItem或偽造QuotaExceededError，實際超出Chrome容量。此為明示storage fixture的受控補證，不是自然累積測試。

quota-controlled-r3 **38/38 PASS，native0，約103秒**：

- 產品實際正式戰報顯示CS MATCH REPORT、「結算未完成（未發獎）」及「比賽結果沒有存起來」，alert kind=match（不是日曆save）；帳本仍100、資金不增加、原場保留launched。
- 真UI備份／取消／同意／整理、冷啟動與備份逐位元檢查通過；總量5238976→1522761字元，整理不改帳本、資金、熟練或賽程數量。
- 「返回進行中的對戰」實際回到同場戰鬥並結算，帳本100→101、獎金只加350000一次、CS歷史28→29；日誌與提示清除。重新整理無重複發獎，不能再次返回同場。

r1／r2各37/38仍保留。唯一失敗是新工具錯用舊Receipt的「這場沒有入帳」文字；r2新增原始body／buttons與截圖，證明專業戰報實際用上述兩個明確訊息。r3要求終局戰報、兩個訊息、無Canvas、未入帳與match類別，並保留全部恢復／冪等斷言；沒有修改產品或降低未入帳要求。

結論：TD-INT-01所缺的「CS結算實際超限→整理→返回原場→只入帳一次」受控功能覆蓋已補。原自然3/4仍NOT_TRIGGERED，不覆寫成PASS；受控與自然條件分開交Owner審閱。

## RG-CS-02：實際配置採樣

Foundry原fixture SHA `931b85da435e1309e46c05e7124797e3ec384f097c5602dfa3d314528234fc86`，同700產品來源feeed6c8…83ab7。專用diagnostic-r31保留場景probe，加具名委派wrapper辨識TextDecoder／join／JSON.parse；minify=false、sourcemap=true，產品src未改。與pristine不是相同bundle，不用其時間／Heap冒充發布版改善。工具與Build manifest保存，可重建。

桌機Chrome預設路徑安裝版本156.0.8078.80（事後讀檔資訊，未在profile內記錄Browser.getVersion）、1366×900、DPR1、ANGLE default。CDP HeapProfiler採樣間距32768 bytes，includeObjectsCollectedByMajorGC／MinorGC=true；無強制GC、無Heap Snapshot。共7份原始.heapprofile：normal-mount、三次import、三次return，6/6 runtime檢查通過，native0。三次匯入後均可返回原場、十人、零保存位置偏差、無頁面錯誤。

首輪累積配置估計（MiB；含已GC物件，非同時存活／retained size）：

| 歸因 | import-0 | return-0 |
|---|---:|---:|
| 字串join | 209.69 | 0 |
| JSON.parse | 103.22 | 0 |
| 玩家Pool展開 | 2.57 | 0 |
| Foundry Pool展開 | 8.43 | 0 |
| 共面表面resolveFpsCoplanarSurfaces | 527.03 | 470.31 |
| 其他Foundry環境建構 | 66.76 | 112.08 |
| 服裝createFpsTailoredClothing | 474.09 | 487.39 |
| grounding sampler | 54.49 | 54.18 |
| 其他未歸因 | 227.86 | 208.99 |

三次join皆約209.69MiB，JSON.parse約101～104MiB；詳細所有分組與可重現分析在allocation-r1/attribution.json、attribution-reproduced-r2.json，原profile不提交Git。這是統計採樣量，非精確全體配置或峰值拆帳；不能將表格加總後等同2118MiB。

分析工具首次用一般物件查函式名，誤把profile中的valueOf當繼承欄位，約0.05MiB被分至非法群組。allocation-attribution-r1有限值／獨立結果比對失敗收據保留；改用Object.hasOwn後r2通過，七份原profile結果逐值一致。首次Build工具生成器也曾有跳脫換行SyntaxError，由node --check攔下，修正後才開始Build，未產出失敗產品包；工具呼叫輸出保留，最終manifest另記摘要。

**新證據**：匯入與返回均重新建構環境／服裝，返回沒有parse也有約1.3GiB累積配置。只把高Heap歸因於JSON.parse或Pool重複資料不成立。resolveFpsCoplanarSurfaces的三角形資料、網格key／Set／Array與服裝切縫是具體配置熱點；這不等於已證明洩漏。

**未量化部分**：allocationDecode樣本幾乎0，不代表解碼沒有配置；native DecompressionStream／外部buffer及Worker配置不在本次主執行緒V8採樣完整範圍。normal-mount的worker.onmessage約64.67MiB估計，是訊息接收堆疊、不是原比賽快取的精確retained bytes。原快取的強持有路徑與正常返回必要性沿用前輪五份Snapshot，不把整頁Heap叫快取大小。正常掛載含其他初始化配置，亦不能與import直接作配置率比較。

採樣會干預GC／時序，當時每輪import結束Heap約191～195MiB、return約112～113MiB，**不能聲稱2118→195MiB改善**。本輪沒有自然峰值Before／After，也未完全建立2118MiB峰值的因果拆分。

## 最小修正決策與剩餘風險

沒有採入產品修正。字串提早釋放與共面空間索引暫存配置可作後續小步候選，但收益需自然Heap重現，且環境幾何／材質／碰撞／所有三圖要逐值等價；服裝快取還涉及dispose與動畫生命週期。這輪沒有足夠證據保證這些修改同時維持美術與峰值改善，故不為了降數字動解析格式或重構Replay。

RG-CS-02仍部分完成／發布阻擋：原2118MiB、低RAM峰值／OS回收、native解壓與Worker／快取精確配置歸因未關。真Android與低RAM仍NOT_RUN；不再追求CPU4×全面優化，既有FAIL保留，不自行豁免。Owner美術／戰術接受、cloth18/19與utility6/9技術債保持。

產品src／public／Vite與6d1163bb完全不變；三圖、Replay、BP-9、MOBA、16能力、TD-FDR-01、Shader／RAF原有效收據沿用，沒有冒稱本輪全部重跑。Progress25 33/33、日曆恢復32/32仍有效。原34份WIP需在最終manifest逐檔核對，其他工作樹不變。

fetch最新origin/main仍3e615157；相對原整合基線7d59dab5只有文件差異，未再次整合。獨立預覽仍localhost:5207/ESMO-/，HTTPS僅對話／controller記憶體。安全停點與收據SHA見evidence/quota-allocation-checkpoint-r1/manifest.json。

Reference ledger：threejs-debug-profiler的references/debug-profile-checklists.md與checklists/performance-profile.md均已讀（yes），使用Build識別、記憶體／GC壓力、生命週期及同條件歸因檢查；無跳過或以手機模擬替代真機。
