# 剩餘發布缺口補證

接續本機5d9da010，僅隔離工作樹。Release Gate仍HOLD。原34份WIP依recovery-r51逐檔SHA相符，原CS HEAD a7398436保持；本輪沒有修改src／public／Vite或其他worktree。

## progress25：驗證器版本落後，已修正

原§13用原始碼字串要求`schema: "BattleResult.v2"`。實際main的battleResultVersion.js已明定新結果為v3（新增heroSkillLevels），v2僅為可讀舊資料。這是驗證器契約假設過時，並非產品輸出錯誤或瀏覽器環境問題。

只修改tools/check_progress25.mjs：呼叫實際snapshotToBattleResult，以終局fixture驗證v3輸出、選手欄位與數量，透過正式serializer／deserializer驗證v3往返、v2相容、非法版本拒絕，保留不得接入MatchProgressTransaction的邊界。既有其餘32項與門檻不變，runner flat gaps-progress-r2為33/33 PASS／native0，另1委派SKIP不入分母。第一次runtime補驗仍錯沿用v2而32/33，gaps-progress-r1及獨立segment log保留；沒有改產品配合驗證器。

## CS滿檔：指定前提仍未觸發

gaps-cs-runtime-r1重新以相同W1第228天存檔／同一production Build，在全新Chrome走真UI，無容量填充或setItem故障注入。第233／239天兩場CS正常結算，帳本100→101→102；第二場後總量5239468字元。第244天下一次日曆寫入先遇Chrome容量5242880限制，UI顯示「存檔空間已滿，進度先暫停保護」，下一場CS尚未開始。

原slim-cs斷言完全保留，仍3/4 PRODUCT_FAIL／native1；這個紅燈代表「CS結算超限」的指定前提沒有觸發，不是已證明CS結算產品故障。不能將正確保護日曆的行為改掉以湊情境，也不能改seed／斷言聲稱指定前提已成立。

新增獨立calendar-cs-diagnostic分支，明列不替代slim-cs。使用同一存檔自然走到日曆滿檔，再透過原備份／取消／同意／整理／冷啟動檢查及真CS續玩補證。gaps-calendar-r1為32/32 PASS／native0，184.020秒；總量5241139→1372770字元、整理前後帳本鍵／資金／熟練不變，下一場CS帳本102→103且畫面無提示。本診斷僅要求CS續玩，最後共用工具標題雖寫「MOBA與CS」，不代表本輪重跑MOBA比賽。TD-INT-01指定CS結算滿檔／原場返回完整覆蓋仍保持未關。

## Replay峰值：安全評估，沒有採入推測性產品修正

沿用五份Heap Snapshot及整合長局／49/49原始證據，不重跑已有效的大型量測。前輪Snapshot已證明匯入Replay可回收，正常同場返回保留一份lastMountSimulation；跨圖另有多個頁面context，不能將其直接稱為三份Replay洩漏。整合Foundry第三次返回2118MiB、卸載10秒291.9MiB；Dune卸載10秒仍888.7MiB，低RAM風險沒有關閉。

本輪串流計算相同fixture解壓大小：Confluence148479800 bytes、Dune161166464、Foundry110169020；收據gaps-memory-main-assessment.json。原生匯入走loadCsReplayFile→解壓／TextDecoder chunks→join→readCsReplay(string)→JSON.parse及pool展開→setImportedReplay。原生路徑沒有進replayData prop的structuredClone分支，不能把該分支武斷當成原生匯入的重複複製根因。原比賽與保存Replay是兩場不同資料，同時存在服務「返回原比賽」，不能刪正常快取壓低數字。

可能降低暫存重疊的方向是解析前釋放chunks或分段解析；目前沒有allocation sampling可定量證明2118MiB由哪一類配置主導，V8字串rope／GC時機也可能改變效果。前者收益尚未證明，後者涉及解析／錯誤處理較大變更，這輪不以未驗證優化冒險。未變更保存幀、pool、數值、結果、畫質或人物；也不宣稱峰值改善。RG-CS-02仍部分完成／發布阻擋；後續需獨立配置採樣及相同fixture自然Heap比較，低RAM／OS回收仍NOT_RUN。

## main與回歸範圍

重新fetch的origin/main為3e61515747bd786b01317ff68eecc7e908c8479d；相對原基線7d59dab5只有四份docs變更，為Pages部署事件／恢復紀錄，無src或部署設定改動。本輪只評估差異，沒有再次整合。

產品來源未變，因此沿用同Build三圖正式UI各48/48、逐幀Replay無損、TD-FDR-01 49/49、Shader14/14、RAF7/7、BP-9 Node1464/1464與112/112、browser normal11/11及slim-30044/44、runtime29 35/35與完整Foundry長局6/6、三圖匯入49/49。不將沿用收據冒充本輪重跑；本輪新增progress及CS指定情境／日曆補證結果另列。

真Android、低RAM實機、OS回收、熱降頻與整合Build CPU4×保持NOT_RUN；既有CPU4×FAIL、cloth18/19、utility6/9原技術債及Owner美術／戰術接受保持。沒有merge至main、push、deploy，交付停Owner Review。
