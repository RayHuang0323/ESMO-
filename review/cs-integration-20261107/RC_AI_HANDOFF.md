# ESMO CS Map v2 RC・AI交接摘要

工程RC已收斂，正式發布**HOLD，停止於Owner Review**。本機分支rc/cs-map-v2-20261108，起點3b8f75ff；最終SHA／tag與完整證據SHA在evidence/rc-final-r1/manifest.json，本機tag預定rc/cs-map-v2-20261108-hold-r1。這不是正式main或已發布版本，不自動開始下一Sprint／整合／效能實驗。

工作目錄務必明確指定`C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107`，不要在預設的cs-foundry-circuit覆蓋原34份WIP。原CS HEAD a7398436、recovery-r50／r51與34份WIP不變；本輪另存rc-recovery-r1並逐檔SHA核對。rehearsal仍停3b8f75ff，5fc2463b／b22b7a61／8cd2584d及其他工作樹保留；無reset／clean／merge／push／deploy。

main fetch仍3e615157，對7d59dab5只有文件變更，產品／依賴／部署設定無新差異；本輪不需要再次同步產品。577份非白名單main來源Git blob完全相同；FPS與候選只有已記錄fpsSolidObstacles檔尾空白整理，無邏輯差異。六共享檔保留BP-9原子結算、SaveSlim、Progress、恢復、MOBA規則／旗標，不整檔ours/theirs。

三圖正式UI各48/48、TD-FDR-01 49/49、Shader14/14、RAF7/7、Replay全保存欄位／結果／metadata無損、三圖各三次reset／seek／匯入返回／卸載49/49、BP-9 Node1464/1464及112/112、browser normal11/11及slim-30044/44、Progress25 33/33、runtime29 35/35（另9委派SKIP）、日曆恢復32/32、受控CS結算容量／原場冪等38/38收據有效沿用。本輪不重跑大型矩陣。

新增Confluence3497幀約29.5分鐘與Dune3256幀約27.5分鐘完整原生1×長局，各6/6／native0；Foundry3865幀約32.5分鐘6/6沿用。三場都自然播完、十名Rigged、零保存位置偏差、無contextLost／新模擬，離場Canvas／環境／probe釋放。新兩場並行只驗功能，不把FPS／Heap當效能／真機證明。18份native收據加runtime29索引已驗；三圖全seed／GPU bytes精確回收仍未驗。

最終preview-r3 production native0，JS／CSS／來源與受測preview-r2相同；700來源feeed6c8…83ab7，JS bundle b27a69e9…e370。所有清chunks實驗只留診斷Build，沒有採入src。原16能力、戰術AI／公平性、十人動畫、碰撞、模擬、勝負與Replay格式保持；不宣稱全clip零滑步或能力高低因果矩陣完成。

剩餘阻擋：真Android／低RAM／OS回收／熱降頻NOT_RUN；CPU4×既有FAIL與Replay2118MiB風險不豁免；Owner美術／動畫／戰術與practice opt-in範圍待接受。cloth18/19與utility6/9只是可提議延期，沒有Owner具名核准；自然滿檔3/4仍NOT_TRIGGERED，不用受控PASS洗掉。下一步應是選定實際支援裝置補驗與Owner決策，不繼續無限制工程研究。

三張原創圖只在快速練習opt-in／Owner直達場景，未擅自取代正式聯賽／BO預設。正式競賽／結算／存檔相容性保留；若要擴大原創圖正式聯賽接入範圍，須新的明確產品決策。

預覽恢復：`node tools/start_cs_rc_preview.mjs`，桌機5207、controller61048；`--stop`只關閉本RC。已實測啟動／停止／重啟，原CS5187／5188／5197保持。Quick Tunnel不保證跨重啟持續，URL只在對話與記憶體，不進文件／commit。若封存包遺失，依RC_RECOVERY.md從已核對tag重建，不能從未知WIP覆寫。

最終入口：RC_REPORT.md、RELEASE_GATE_ACCEPTANCE.md現行總表、RC_RECOVERY.md與CHECKPOINT.md。原始失敗、Snapshot、Allocation profiles、trace與log不刪，ignored證據不在Git內；本機tag與manifest共同保存停點。未經Owner正式發布核准，不merge至main、不push、不deploy。
