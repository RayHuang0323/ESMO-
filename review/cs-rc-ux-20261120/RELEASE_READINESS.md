# CS Release Candidate UX & Integration Readiness — 2026-11-20

## 判定與候選

狀態：可進Owner Review；本輪不Push main、不Deploy。新UI產品SHA為7a8a25fadac1f04e7dd145c0006c047dbd5f608f。後續文件Checkpoint只追加文件，不能把它說成另一個未驗產品。完整原始證據在 C:\Users\ifikn\esmo-measure\cs-rc-ux-20261120。

## UI與正常流程

- 手機使用useViewport的useIsMobile，五分頁為單列、導覽區內橫向滑動、每項至少44px；清楚的唯一選中狀態、原生觸控滑動、選中項自動揭露；ResizeObserver於尺寸變動重新揭露，cleanup解除observer。桌機原網格設計與分頁功能保留。
- 長選手名稱可換行；卡片狀態標示可換行；證據展開至少44px；獎勵標題允許換行。沒有改共享RewardReceiptPanel、獎勵數據或公式。
- 320／390／430px檢查單列、頁面不溢出、選中項可見、長名稱、獎勵完整；360px亦通過既有卡片／CTA檢查。長名稱是DOM呈現壓力測試，立即還原文字，沒有改存檔或捏造戰績。
- 正常首頁→CS→歷史→戰報→培養建議→Training→明確確認→完成訓練→下一場真Worker，沒有以開發網址起始。完整存檔在第一次／第二次確認後逐值一致，包含資金、體力、排程、正式歷史與交易；安排時不提前成長，重新整理不重複寫growthLog。
- 合法走位78→79.1、地圖意識82.25→83.2、體力62→50。原calculateCourse／Training／growthLog為唯一計算來源；真Worker消費新能力，固定條件成長前後行為差異及同輸入決定性PASS，不宣稱訓練保證勝率。
- production preview http://127.0.0.1:5193/ESMO-/，本輪PID2888；舊5192保持。cloudflared不在PATH，不安裝，沒有手機HTTPS入口。真Android／觸控手感／低RAM／熱降頻NOT_RUN，桌機CDP觸控不代表真機驗收。
- 截圖：isolated/coaching/report-tabs-320.png、report-tabs-390.png、report-tabs-430.png、coaching-desktop.png、training-complete-390.png（均在外部證據根）。

## 實際驗證與原始失敗

- 產品新SHA的cs-rc-ux-core／coaching／pool三項Release Gate及assert PASS。core為build、advice17、Training×Competition13、map identity6、series46、save bundle86，以及runner本次4/4（progress25／regress／regress2／presentation29b2）。其餘區段不列PASS。
- Browser培養閉環47/47（isolated目錄），獨立連續縮放14/14（resize-r2.json），正式池81/81（r2目錄）：三圖BO1、BO3、Replay匯入返回、正常賽後培養入口、正式結果與發獎／reload冪等。
- 初版固定分頁切換後縮放裁切：resize-before.json為8/10 PRODUCT_FAIL；補ResizeObserver及選中項斷言後，並行負載下r2仍記錄46/47 PRODUCT_FAIL（320px）。全部原始收據與截圖保留。
- 同一修正後產品SHA隔離完整重跑47/47，獨立連續尺寸切換14/14。沒有降低斷言／改seed；並行負載的渲染讀取時序尚未完全歸因，不能抹掉原PRODUCT_FAIL或宣稱已證明所有負載下的旋轉體驗。Owner需覆核320px切換／旋轉；非必現問題若再出現，先隔離工具與真機時序，不改引擎。
- 本輪沒有改Replay格式、Progress、SaveSlim或共享Store，因此未重跑完整BP-9壓力；前輪112/112及1464/1464僅歷史收據，本輪不借用為新SHA PASS。受影響的Training／SaveBundle／Progress與Replay畫面已新跑。
- 全倉read-only merge-tree診斷超過24MiB輸出上限而ENOBUFS，中止、NOT_RUN，不能據此聲稱全倉試合併成功。改以檔案交集與唯一共同檔的有界外部三方文字試合併核對；沒有執行真merge／checkout或修改index。

## 平衡與保存界線

相對c6cf4bb8，src/battle/fps、src/platform與playerModel完全沒有差異。本輪沒有重跑或修改模擬器。Dune原生約62%、P250約65% CT、Confluence小樣本CT39%是前輪有限seed描述，繼續OPEN，不把舊數字列為新統計或公平性認證。CPU4×既有FAIL與2118MiB歷史峰值風險保留。原34WIP、Replay、訓練資料與Owner正式存檔不動，不新增Worktree或大型Replay／Heap／Profile證據。

## 最新Git與共享邊界

- 遠端main重新resolve：7cf1cebc10915f096a256885388ecd8a7052e5f3；產品CS候選較main新增22個本機提交、落後0。這包含先前維護／功能／文件，不是本輪新增22個；文件Checkpoint另計。
- CS分支feature/cs-professional-expansion-20261116沒有upstream，遠端未找到同名分支。本輪提交前工作區乾淨，沒有混入他人未提交成果。
- Claude工作區 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0，feature/moba-tower-edge-v23，觀察HEAD910792acc6fb33d11bd1faefecf15c9cea59ac8d，相對main有50個本機新提交。工作中新增cal_analyze_v24.mjs、diag_te24_cal_invade.mjs、lib_parity_env_v24.mjs、run_te24_cal.mjs等未追蹤工具，全部保護、不提交進CS。
- 相對main，雙方沒有共同改動的src檔；唯一同時修改的追蹤路徑是tools/verify.mjs。CS改shader assertion shape12/12→14/14；Claude增加provenance／dry-run／resume來源保護。git merge-file -p只在外部文字副本試合併exit0、0衝突，兩者均保留，見integration-text-audit.json；未修改任一候選。
- 檔案不重疊不代表整合已驗：CS先前改AppShell、profileStore、CsMatchResult、csMapVeto、TrainingScreen與Replay；Claude改LogicEngine、MOBA組裝／戰術／導航、featureFlags、matchRuleset及simulationVersion。契約語意、版本與共享執行器仍須在真正整合SHA重驗。

## 安全整合與部署計畫（僅計畫，未執行）

1. Owner先驗收5193的手機導覽、正常歷史／培養／Training及原創正式池；存檔先用既有備份介面保護。沒有核准前維持本機候選，不Push main。
2. 核准整合當下重新resolve-main、核對CS／Claude HEAD與dirty／未Push成果，保存兩邊Checkpoint與必要證據。不沿用本文件固定SHA作為「永遠最新」；不新增Worktree、不reset／force覆蓋任何分支。
3. 建議先評估CS單獨進main，避免把尚未核准的50個MOBA提交綁進此次CS發布；Owner若決定共同整合，再由唯一整合owner依序處理。main仍為共同祖先時可評估fast-forward；main已前進則先審真正差異，不能機械套用。
4. 若合併MOBA，tools/verify.mjs需保留14/14 shape及Claude provenance，不能選ours／theirs丟掉一邊。維持MOBA freeze／規則版本與所有正式旗標語義，CS新地圖池維持original-v1 opt-in，正式預設池及舊歷史／存檔不migration。
5. 取得真正整合SHA後用Release Gate preflight釘SHA與依賴，重新build及受影響CS／MOBA／Progress／Replay／BP-9／SaveSlim回歸，包含Claude當期freeze／provenance verifier。不得使用本輪單支線PASS宣稱整合PASS；FAIL／BLOCKED／INTERRUPTED／NOT_RUN均分列。
6. Owner核准部署後才Push main（會自動觸發Pages Actions），確認Actions artifact及公開站資產為同SHA；用系統自己的畫面輸出確認情境後跑正式站smoke。確認手機分頁、戰報、合法訓練／獎勵冪等、舊檔恢復、Replay與正式預設池未變；不把localhost PASS冒充正式站PASS。
7. 正式站出現產品失敗即HOLD，保存原始證據，回退需Owner另行決定；不擅自force／改歷史證據／重寫玩家存檔。手機與CPU4×／2118MiB未驗風險不得改寫為通過。

本輪完成後停止Owner Review，不開始下一個CS功能Sprint。

