# CS Tactical Fairness & Coaching Loop v1

2026-11-16；起點 aec4cb1ea5790f5c26d22dee7fc227fa3802eac7；本機候選，完成後停止 Owner Review，不 Push／Deploy。

## 接手與保護

沿用 feature/cs-professional-expansion-20261116、原工作區與共用依賴。即時遠端 main 為 7cf1cebc10915f096a256885388ecd8a7052e5f3；Claude 現役 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0，feature/moba-tower-edge-v23／77780df3e4fe5dded402459d8455c20dec43bc88，6 修改／2 未追蹤保持。未修改 MOBA、Store、Progress、SaveSlim、BP-9、引擎、正式預設池或既有 Replay。原 34 WIP 與 D 槽證據不動。

## Phase A：診斷完成，根因與修正未完成

原 28:72 是上一輪同能力條件下的 T／CT「回合」統計，不是隊伍勝率；上一輪交換的是球員槽位，不能當作相同 actor 真正交換初始方。本輪保留同十人 ID／角色／能力70，以唯讀測試來源掛鉤，僅交換 createCsRuleState 的初始方；產品來源不變。

36 場完整模擬：三圖 native／shared-p250、Dune 4 個固定配對 seed，另外兩圖各 2 個；再加 Dune 另一路 authored tactic 的 2 個 seed 配對。shared-p250 在購買後同時給雙方 P250／甲盔、清空投擲物；實際每發武器核對一致。這是因果診斷，不是正式競賽配置；經濟仍原生，不能把所有因素都視為固定。另一路同時改雙方戰術投影，也不是只隔離 T 路線。

| 地圖／配置 | 場數 | T:CT 回合 | CT 比例 | 配對 seed 比例範圍 |
|---|---:|---:|---:|---:|
| Confluence native | 4 | 42:49 | 53.85% | 52.63–54.72% |
| Confluence shared-p250 | 4 | 42:43 | 50.59% | 47.37–53.19% |
| Dune native | 8 | 56:132 | 70.21% | 60.98–80.00% |
| Dune shared-p250 | 8 | 57:133 | 70.00% | 64.91–74.51% |
| Dune alternate shared-p250 | 4 | 34:50 | 59.52% | 57.14–61.90% |
| Foundry native | 4 | 50:50 | 50.00% | 50.00–50.00% |
| Foundry shared-p250 | 4 | 42:53 | 55.79% | 53.49–57.69% |

這些範圍是描述性範圍，不是信賴區間。每組只有2或4個配對 seed、回合相依、同一組角色，不足以認證地圖公平性。36 場 illegalWallCrossings／spawnAnchorViolations 均0。

Dune native CT勝中 time60／elimination48／defuse24；P250則 time89／elimination10／defuse34。故偏差不只來自槍枝與初始方，無C4的時間結束值得優先追。追加一場 seed61001、只留前三個超時回合60／85／100／114秒的稀疏 trace：carrier已在 entry／canAdvance，仍有折返或晚撿C4，例如第5回合85秒(87.7,38)→100秒(83,68)→114秒(68.6,82.4)，目標(81,26)。尚不能區分路線 cursor 重建、C4掉落拾取與幾何障礙；不是已證實的「缺少時間壓力」單一根因。未硬修、未調命中或勝率。TD-CS-QUAL-02 保持 OPEN。

## Phase B：玩家 UI 與合法成長閉環已實作

- 既有 CsProfessionalReport 四頁保留，增加「培養建議」。同一個 csCoachingAdvice model 同時供 UI 與原型工具使用，不新增 analytics 或成長公式。
- 同一 competitionMapId／layoutId／sceneVersion、同角色、最近最多10場；matchId 去重。本場 result.players.playerId 經唯一姓名對 analytics；同名、離隊、版本或欄位不足拒絕猜測。此範圍收斂後，真實封季 fixture 原型的2份建議變為1份，未放寬門檻。
- 1至3張建議：真體能恢復、至少3場100發的射擊覆核、至少3場首死差的走位覆核。門檻只是覆核線索，武器、對手與距離不一致的限制明示；不是因果教練或勝率保證。
- 預估直接 calculateCourse；顯示能力、體力、課程 $0.0萬、基礎天數與日常支出說明。潛力封頂、已有課程保留真實狀態。
- 「前往訓練」只預選，既有 TrainingScreen 明確確認才 assignTraining，原世界時間／applyCourse／growthLog 完成。進行中的場次／BO3不能透過新入口改訓練；直達URL也同樣阻擋。
- URL 僅保存可丟棄的 UI 位置與 ID，不存能力、獎勵或新 schema。刷新從既有 history／training 恢復，不重結算，不新增永久追蹤權威。
- 實測 Seelöwe／b5：8場同 Foundry／角色，首殺7／首死21；positioning 78→79.1、mapAware 82.25→83.2、體力62→50，正常推進2天（88→90）完成，唯一 growthLog 保留。既有 growthLog 對 gains 採一位小數；畫面依其權威 beforeAfter 顯示82.2，不改共享紀錄精度。
- 真下一場 Worker 消費更新後能力。固定同體力、隊伍、對手、戰術、Foundry、seed2776，僅換合法成長前後基礎能力：比分13:16→11:13（都落敗），actor trace與round digest改變，After重跑完全一致。不宣稱訓練必定改善比分。

## 驗證、原始失敗與 SHA

提交前：coaching-r4 Browser 30/30 PASS；建議邊界17/17；Training×Competition13/13；runner progress25／regress／regress2／presentation29b2／cs_major_shader_warmup 5/5；公平性矩陣36場及固定來源 hash檢查 PASS；build完成。桌機與320／360／390／430px無水平溢出、按鈕至少44px、reduced-motion仍保留資訊；原四頁、刷新、重複確認、合法成長、實際下一場、舊可選欄位缺失與進行中阻擋均驗。

R1 Browser 是 HARNESS_FAIL：工具以不存在的文字箭頭選返回，修為既有 aria-label；原始收據保留，不是產品根因。R4 build的Vite實際完成19.44秒，但PowerShell以NativeCommandError包裝stderr警告導致外層exit1；不當作build PASS收據，最終由Release Gate子行程重新執行取得真exit。沒有降低斷言。

最終產品 SHA 為包含本文件的本機 Checkpoint（git log 查）；提交後必須以該完整SHA執行 final-core、final-coaching、final-pool 及 assert，才有本輪放行結論。原始stdout／stderr、收據與 final-summary.json 留在下述外部證據根，不能引用上一輪SHA的PASS。正式三圖BO1／BO3、結果／獎勵唯一與Replay的本輪最終結果以 final-pool 為準。若中止或紅燈，實際狀態回報，不沿用舊83/83。

本輪不碰共享權威，完整BP-9壓力與SaveSlim壓力 NOT_RUN；既有e86ef026的112/112不算新SHA結果。SaveBundle、Progress冪等、Training整合及MOBA presentation回歸重新執行。自然賽季沿用aec4cb1真實封季fixture，不重產大型系列Replay。舊三圖Replay逐幀往返重新核對。

## Owner 入口與下一步

Production preview http://127.0.0.1:5192/ESMO-/ 。5190／5191舊預覽保留。需要真實戰報資料時，在獨立瀏覽器設定檔透過既有存檔備份畫面匯入外部證據根的 owner-coaching.backup.json，再開 `?csCoach=report&csMatchId=cs_9ba97433`。它來自正常18場已封季存檔，不含假勝負。不得覆寫Owner原存檔。進行中的正式系列賽先完成才可訓練。Quick Tunnel未在PATH，不安裝、不提供無效區網手機網址；390px僅桌機模擬，真Android／觸控／低RAM／熱降頻 NOT_RUN，CPU4× FAIL與2118MiB歷史風險保留。

證據根：C:\Users\ifikn\esmo-measure\cs-tactical-coaching-20261116；fairness-r1、dune-timeout-trace、coaching-r1..r4、combat-r1、final-*。不提交原始存檔、log、probe或大型資料。

下一步僅提案：①Dune單因素追蹤route cursor與C4交接，分開plant／retake；②累積角色等武器配對而非聚合勝率；③沿既有analytics做訓練後相同條件三場追蹤，持久化若需新契約先交共享owner。此輪完成後停止Owner Review。

## 新UI九問檢查

服務覆盤選手培養；解決看完戰報不知如何練；唯一主任務是選擇培養重點；首屏只1至3項、證據折疊；真資料來自analytics與calculateCourse；只導向既有Training確認；缺資料明示；手機使用單欄44px動作與原GC語意；動態僅進場並支援reduced-motion，不寫Store。
