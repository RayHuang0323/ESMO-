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

## 2026-11-20 休眠停點：Tactical Fairness v2

- 保存時間：2026-11-20 18:31:21 +08:00。Owner 通知約三分鐘後休眠，本輪立即停止新測試與產品修改。
- 有效產品 Checkpoint：4f681c34b0e59b02d7a5bb0e6bed00576c8af4b5；分支 feature/cs-professional-expansion-20261116。追加本節之前 git status --short 為空。
- 本輪僅完成接手核對、既有證據閱讀與 Dune 程式追查；沒有修改產品、啟動測試、預覽服務或新增 Worktree。
- Claude／MOBA 保護工作區：D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0；分支 feature/moba-tower-edge-v23，觀察 HEAD feed38c14ee18f2a28652d3a1bc959c69b9fe1d4。續跑仍須重新核對，禁止覆蓋其成果。
- 本輪唯讀觀察的遠端 main：7cf1cebc10915f096a256885388ecd8a7052e5f3；未 Push、未 Deploy。

### 階段狀態與證據限制

- A 部分完成：既有鏡像配對結果顯示 Dune native CT 132/188（70.21%）、共用 P250 CT 133/190（70.00%）；這是既有證據，非本輪重跑。樣本僅 2–4 組 seed 配對，不可把相關回合當獨立樣本。
- 已定位兩處待驗證線索：EsportsFPS3D.jsx 的進點推進約 1835 行與 C4 plant fallback 約 2107 行，皆可能經由 aConn/car 重建 site-execute 路線。尚未證明它們造成持包者折返或偏差，不能據此修改產品。
- 已確認模擬 frame 保留 roundSec、routePoints、routeIdx、路線來源／種類、持包與 droppedBomb，足以建立完整事件時間線。注意 waypointHistory.round 為零起算，routeBuilds 與 bomb-recovered.round 為一起算。
- B 未完成本輪驗收：既有培養建議與合法 Training 閉環保留；仍需從正常賽後入口操作，先前以開發用網址起始的 browser PASS 不足以證明自然玩家入口。
- C 未開始本輪驗收：沒有新的 build、BO1／BO3、Replay、BP-9、SaveSlim 或 Release Gate 收據。11/16 舊收據已超過 24 小時，不可聲稱本輪最終 SHA 已通過。
- 沒有本輪啟動且需要中止的測試；既有預覽程序尚未重新確認所屬與可用性，不任意關閉他人程序。

### 恢復後的最小下一步

1. 查詢每週額度、確認目前 HEAD／工作區差異與 Claude 現役狀態；不要重做本次完整接手盤點。
2. 沿用 tools/trace_cs_dune_timeout.mjs 與 tools/lib/fpsMajorTestApi.mjs，以既有 seed 61001 建立有限時間線，對齊 C4 掉落／拾取、routeBuild、waypoint 與 stage 切換，先證明根因；僅在必要時加入有限鏡像對照。
3. 若因果未確認，保留分析並直接完成正常賽後戰報→培養建議→Training→確認→能力紀錄→下一場消費的驗收；不得硬修勝率。
4. 修改完成後才跑受影響回歸、所需 BP-9／SaveSlim 與釘住最終產品 SHA 的新 Release Gate，並提供 production preview。

既有證據位置：C:\Users\ifikn\esmo-measure\cs-tactical-coaching-20261116（fairness-r1、dune-timeout-trace.json、final-coachingloop、既有收據與 OWNER_REVIEW.md）；自然賽季案例位於 C:\Users\ifikn\esmo-measure\cs-competitive-quality-20261116。不得重建大型 Replay／Heap／Profile，不刪除原始 FAIL。

本次暫停係配合 Owner 休眠；Dune 根因／修正、正常入口及本輪整合驗收尚未完成。等待 Owner 恢復後續跑。

## 2026-11-20 CS Tactical Fairness v2／Owner Review

產品候選：7bc1ce1504df116fc0ca2d07c7203fc513589dfd，分支 feature/cs-professional-expansion-20261116。Dune seed61001 真事件證明：拾回C4後的 site-execute 路線於下一幀被 phase-transition 覆寫為戰術開場路線。最小修正只在未下包、可進點、非假打接近且仍指向同一目標的T持包者保留路線游標；Legacy、碰撞、射擊、傷害、情報與Replay格式不動。修前PRODUCT_FAIL 3次覆寫，修後0次；獨立重跑結果一致。

正常玩家入口補齊：首頁→CS→歷史→戰報→培養建議→原Training確認。不需手動開發網址；既有analytics／calculateCourse／growthLog仍為唯一來源，不從戰報直接加能力或發獎。完整操作31/31、歷史四寬度／恢復7/7；合法走位78→79.1、地圖意識82.25→83.2、體力62→50，下一場真Worker消費新能力，合法成長固定條件比較保持決定性。

32場有限Before/After對照：三圖原生武器24場，加Dune統一P250／護甲／無投擲物8場；同actor／stats70／戰術／seed與起始方交換。兩配對seed下Dune原生CT 71/95→61/98（74.7%→62.2%），逾時32→13；P250 CT 75/108→56/86（69.4%→65.1%），逾時47→17。Confluence CT49/91→46/118（53.8%→39.0%），Foundry50/100→47/99（50.0%→47.5%）。回合相關，只有兩seed配對，不能視為母體公平性認證；Dune剩餘CT優勢與Confluence修後方向均保留待查，不補償勝率。

完整證據與新SHA Gate位於 C:\Users\ifikn\esmo-measure\cs-tactical-fairness-v2-20261120；細項見 review/cs-tactical-coaching-20261116/RESUME_CHECKPOINT.md 本日追加章。原始PRODUCT_FAIL／工具FAIL收據保留，不覆寫歷史。正式預設池不變，Claude／MOBA、共享Store／Progress／SaveSlim契約、34 WIP與舊Replay不動；未Push／Deploy／新增Worktree。真Android／低RAM／熱降頻NOT_RUN、CPU4×FAIL及2118MiB風險保留。停止Owner Review，不自動擴樣本或開始下一Sprint。

### 本輪實際驗證與限制

- 產品SHA四項Release Gate與assert PASS：cs-tactical-v2-core／pool／coaching／history，target=actual=7bc1ce1504df。完整stdout／stderr／每一子行程exit保留於上述外部證據根。
- 新核心：build PASS；C4 objective route PASS eligible128 violations0（兩次獨立結果逐值一致）；advice17／Training×Competition13／map identity6／original pool12／series46／save bundle86 PASS。
- BP-9 P0-B 20季112/112，P0-A原子結算1464/1464，核心runner本次5/5：progress25、regress、regress2、presentation29b2、cs_major_shader_warmup。沒有將runner其餘151個NOT_RUN列為PASS。
- 正式Browser81/81：Foundry BO1 13:1、Confluence13:10、Dune11:13；BO3 Dune9:13／Foundry12:16，自然0:2結束，唯一fixture outcome。三圖BO1／BO3選圖去重、對手快照、正常賽後培養分頁、舊Replay匯入返回、戰鬥與結算reload／發獎冪等通過。本輪BO3決勝第三圖未發生，不強制勝負補案例。
- 舊三圖Replay全保存幀／rawResult／metadata逐值無損往返PASS，不重跑舊Replay引擎。
- 培養Browser31/31、獨立歷史入口7/7；Seelöwe合法成長、存檔恢復、重複確認、下一場Worker及同條件模擬差異PASS。課程本身$0.0萬，日曆推進仍有原俱樂部開支；不新增第二套計算。
- 原始失敗保留：c4-objective-before PRODUCT_FAIL（3次覆寫）位於舊tactical-coaching證據根；新根pairs.stderr.log為未找到default戰術的工具錯誤（修fallback取值，不改seed）；gate-coaching.stdout.log為錯誤fixture路徑；gate-core.stdout.log為唯一輸出保護拒絕既有c4-final.json。後兩者Release Gate確實FAIL，修外部執行腳本後於新目錄重跑，不改產品或放寬斷言。
- 真Android／低RAM／熱降頻及本輪SaveSlim Browser UI NOT_RUN；Node完整BP-9／SaveSlim已通過。CPU4×既有FAIL與2118MiB峰值風險保留。競技公平性仍OPEN，不能全面啟用新池。

### Owner操作與續跑

production preview：http://127.0.0.1:5192/ESMO-/ ，本輪PID87476；首頁→CS→歷史→戰報→培養建議→前往訓練→明確確認。原創正式池仍由既有賽事測試選項opt-in，正式預設不動。cloudflared不在PATH，不安裝，不提供無效手機區網地址；未建立HTTPS tunnel。

如需重現已封季的培養案例，可於獨立瀏覽器設定檔使用既有備份匯入介面讀取 C:\Users\ifikn\esmo-measure\cs-tactical-coaching-20261116\owner-coaching.backup.json；不要覆寫Owner原存檔。自然Major／新季驗收入口備份沿用 cs-competitive-quality-20261116 的 owner-natural-major.backup.json／owner-league-start.backup.json。不要手動輸入csCoach開發網址才找建議。

Claude現役工作區 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0，feature/moba-tower-edge-v23；本輪結束觀察HEAD910792acc6fb33d11bd1faefecf15c9cea59ac8d且乾淨。任務期間由feed38c1自然前進；本輪沒有修改該工作區。main重新resolve仍7cf1cebc10915f096a256885388ecd8a7052e5f3。

下一步僅列Owner Review：①分開Dune植包前與CT回防／拆包時間成本、Confluence修後方向；②增加角色／等武器的獨立配對seed，仍維持固定有限預算，不補償勝率；③真Android／低RAM與CPU4×風險實測，以及既有analytics訓練後三場追蹤的純呈現提案。

本節文件提交後另以精確文件Checkpoint執行新Gate：確認src／tools／public／依賴等相對產品SHA完全不變，並實際重跑C4／Training／identity檢查。完整四項產品收據釘住7bc1ce15，文件Checkpoint不是另一個產品版本；最後SHA與收據以本輪最終回報為準。停止Owner Review，僅保留預覽，不啟動下一Sprint。


## 2026-11-20 CS RC UX／Integration Readiness（Owner Review）

新產品7a8a25fadac1：手機五分頁改為單列橫向滑動，useViewport判斷、44px觸控、唯一選取與尺寸變動自動揭露；桌機設計保留。檢查320／390／430px獎勵、長姓名與培養卡片。正常首頁→CS歷史→戰報→培養→Training→合法成長→下一場真Worker47/47，完整存檔重複確認逐值一致；正式池81/81、核心runner4/4與新SHA三項Gate／assert PASS。並行負載下曾46/47 PRODUCT_FAIL（320px縮放裁切），同SHA隔離47/47及獨立連續縮放14/14；原始FAIL保留，負載／渲染時序尚未完全歸因，Owner須覆核轉向，不能宣稱所有負載已認證。

相對c6cf4bb8，引擎／共享Store／Training公式／契約不變；Dune CT62～65%、Confluence小樣本CT39%風險維持，不重調勝率。本輪完整BP-9壓力NOT_RUN，前輪收據不冒充本輪；受影響Progress／Training／SaveBundle／Replay畫面新跑。main仍7cf1cebc，Claude現役910792ac及新未追蹤校準工具保護。唯一共同修改檔tools/verify.mjs，外部三方文字試合併無衝突，仍未驗真正整合SHA。

完整差異、失敗、截圖、受控整合／部署步驟：review/cs-rc-ux-20261120/RELEASE_READINESS.md。production preview http://127.0.0.1:5193/ESMO-/（舊5192保持），無HTTPS tunnel。正式預設池／原34WIP／Replay／Owner存檔不動；不Push main、不Deploy、不新增Worktree。真Android／低RAM／CPU4×FAIL與2118MiB風險保留。保存乾淨文件Checkpoint後停止Owner Review。
