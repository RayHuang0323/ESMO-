# 第三階段桌機品質驗收

2026-11-07，Owner在第二階段執行中追加授權，自動接續可在桌機完成的品質驗收。正式merge／push／deploy仍未授權，第四階段只有計畫。最終狀態以本文件完成補記與CHECKPOINT.md為準，執行中的測試不能當PASS。

## 範圍與沿用證據

- 第二階段本機Checkpoint為b22b7a61，另以8cd2584d整理新工具CRLF／新檔EOF空白。產品邏輯不變；原CS工作區及34份WIP保持。
- 沿用第二階段三圖正式UI各48/48、Replay逐幀無損往返、TD-FDR-01 49/49、Shader14/14、RAF7/7、BP-9 Node1464/1464與112/112、browser normal11/11／slim-30044/44、runtime2935/35。
- progress2532/33、slim-cs3/4及其根因原收據保持。沒有修改產品，因此不重跑已有可信的大型回歸。
- 第三階段使用本工作樹的diagnostic-r1：700來源／CS素材與vite指紋feeed6c82edbf1e41e7fc5549d8c6576e9c5ab513a6989497a032c066af83ab7；只加唯讀scene probe，不改模擬或Replay。與第二階段的來源指紋差異只有明列行尾整理，不能把不同指紋直接冒充完全同檔。

## 完整長Replay：限定案例PASS

Foundry固定fixture `match-foundry-execute-b-830102-r14.replay.json.gz`，SHA `931b85da435e1309e46c05e7124797e3ec384f097c5602dfa3d314528234fc86`；Build與逐次數據在`evidence/phase3-long-r1/audit.json`及progress.json。共3865保存幀，原生1×、每幀0.5秒，從0自然播到3864；不seek至末段、不加速、不強制GC或擷取Snapshot。每30秒存進度、Heap、GPU資源、Rigged數、保存位置漂移與滾動frame-time。

`phase3-long-r1`原始native exit 0，6/6 PASS，整支1983.492秒；65次取樣，最後觀測1951.476秒（理論保存時間1932秒，末幀後等待下一個30秒取樣）。十名Rigged、零保存位置偏差、無contextLost、渲染持續、模擬啟動計數不增加；末幀playing=false。原生離場後Canvas disconnected、場景group children=0、全域scene probe移除。截圖natural-end.png與完整stdout／stderr保留。

| 指標 | 實際觀測 | 解讀邊界 |
|---|---|---|
| 監測RAF平均 | 59.53 FPS | 116181次RAF／觀測時間；不是renderer提交FPS或效能門檻驗收 |
| 最後4096筆窗口 | p95 18.1ms／p99 18.2ms／max 107.5ms | 不是整場百分位 |
| 各窗口紀錄中的最大幀 | 233.3ms | 陣列4096筆有界；不是完整無遺漏trace的最長幀保證 |
| JS Heap | 起點559.7MiB；取樣範圍214.6～600.9MiB；末幀293.8MiB | 30秒取樣，匯入瞬時峰值可能未包含 |
| 離場後Heap | 立即296.2MiB；10秒297.1MiB | 未強制GC；不能聲稱已回到初始值或零持有 |
| renderer資源計數 | geometry 390→671；texture 51→67 | 後段geometry停於671；非GPU bytes，卸載檢查不等於完整GPU回收證明 |

未確認新的持有參照根因，因此本階段沒有修改產品或清除原比賽快取。自然Heap未持續單調增加，但本輪沒有Heap Snapshot，不能由這份收據獨自宣稱無洩漏。前輪2GiB級匯入峰值與低RAM風險繼續保持。

此為一場Foundry完整長局，不代表三張圖全seed／全局即時播放矩陣。Confluence／Dune完整資料相容性由第二階段逐幀往返與正式UI流程證明；其餘完整即時播放範圍未跑時仍NOT_RUN。

記憶體取樣是Chrome JS Heap，非OS全部RAM／GPU記憶體，30秒取樣最大值不是連續峰值。frame-time陣列有界4096筆，p95／p99屬滾動窗口，不是整場全體百分位。自然GC鋸齒不能直接叫洩漏；沒有Snapshot便不聲稱找到持有參照。

本輪不並行另一個自有3D功能gate，保留其他Claude／使用者行程。外部負載、GPU時脈與實際熱狀態未鎖定，不能當手機／熱穩定或硬體最低規格證明。

## 重複匯入／卸載恢復：限定功能PASS，記憶體風險保持

使用同一整合diagnostic-r1、同一三圖fixture（SHA逐一核對既有performance-r1），同一Chrome依序導航三圖，每圖三次原生匯入／返回、前後seek與卸載。`phase3-reset-r1`原始native0，49/49 PASS，167.367秒。每次從reset 0到24、倒數第二幀、12，再返回；slider／live index一致、render持續、十名Rigged及保存位置漂移檢查通過。每圖各循環返回的原比賽物件以WeakRef核對一致，未為檢查新增強持有快取。三圖離場均Canvas disconnected、環境children=0、scene probe移除；無頁面錯誤。

| 圖 | 三次匯入後Heap（MiB） | 三次返回後Heap（MiB） | 卸載10秒（MiB） | 當時Documents |
|---|---|---|---|---|
| Confluence | 410.7／708.3／1313.0 | 495.9／796.1／1414.1 | 121.5 | 1 |
| Dune | 822.3／830.9／810.5 | 887.2／885.6／881.9 | 888.7 | 2 |
| Foundry | 769.6／1362.2／1960.0 | 942.2／1509.9／2118.0 | 291.9 | 3 |

同Chrome跨圖導航存在待GC的舊document／context；不可將三列當成三個獨立程序的峰值效能排名或Before／After改善。取樣不是連續峰值；Foundry返回已見約2.07GiB，Dune卸載10秒仍888.7MiB，不能以功能49/49宣稱Heap恢復全過。沒有Snapshot／強制GC，亦沒有確認新的不必要常駐參照；只記觀測，不臆測修產品。前輪持有路徑證據及2GiB風險保持。

不把單份原比賽返回快取當成洩漏，也不強制刪快取以壓低Heap。前輪五份Heap Snapshot仍可查，不因新桌機窗口而宣稱低RAM風險關閉。

## 仍未驗收／未通過

| 項目 | 狀態 |
|---|---|
| 真Android FPS／觸控／safe area | NOT_RUN |
| 真低RAM裝置／OS回收恢復 | NOT_RUN |
| 實際發熱／熱降頻 | NOT_RUN |
| 整合Build CPU4×重新量測 | NOT_RUN；既有候選CPU4×FAIL仍未解 |
| 三張圖所有長局／seed全矩陣 | NOT_RUN |
| 正式merge至main／push／deploy | 未授權、未執行 |

Release Gate維持HOLD。限定Foundry完整長局與三圖重複匯入功能已補證；低RAM峰值、完整記憶體壓力／系統回收恢復、其餘全局矩陣與真機沒有因此通過。RG-CS-04隔離移植及主要回歸已完成，progress25與TD-INT-01仍須處置；RG-CS-05仍待Owner接受。詳細勾選見RELEASE_GATE_ACCEPTANCE.md。

## 最終Build與保存

完整production preview-r2建置native0；700來源指紋與本階段diagnostic-r1相同feeed6c8…83ab7；JS bundle為b27a69e9…e370，與第二階段pristine-r1／r2及preview-r1逐byte相同。無新產品修改，因此不重跑已有效的BP-9／三圖UI／TD-FDR-01大型回歸。診斷bundle因唯讀probe與pristine不同，沒有冒稱二者檔案完全相同。

完整stdout／stderr／native exit、audit／progress／自然末幀及三圖seek截圖在本工作樹evidence/。原CS所有證據與34份WIP不改。第四階段僅RELEASE_INTEGRATION_PLAN.md計畫；正式merge、push、deploy均未執行。最終Git SHA與預覽封存見CHECKPOINT.md。

preview-r2公開正式首頁實際CS／MOBA入口2/2 PASS／native0；另核對5個頁面HTML，以及17份JS／Build manifest／報告，均HTTP200且HTTPS／localhost／本機檔案SHA一致，收據public-r2。此為桌機公開預覽可用性，不是Android驗收。僅重啟本輪專用5207 preview，原CS各服務及其他worktree不變。
