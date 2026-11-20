# ESMO CS × MOBA 本機整合交付（2026-11-21）

## 結論

**本機整合候選已完成並通過本輪必要桌機Gate，可交Owner Review；尚未正式發布。** 本輪沒有Push main、Deploy、force、共用stash、新Worktree、清理原WIP或重寫歷史資料。先前INTEGRATION_BLOCKED是當時來源未提交的有效紀錄，現在已由Claude正式交接解決；原報告、FAIL與BLOCKED收據全部保留。

- 分支：integration/cs-moba-20261121；沿用原Codex工作區。
- CS來源：e0bd56140fa6002ba3e6077ab61321a6711f6208（含CS功能7a8a25fadac1f04e7dd145c0006c047dbd5f608f、文件c70bfeca）。
- MOBA交接：0b577dab4bdae7648bdfc5afe2373a6c6c3de688；成果47914b16d1e4b7b09bc8351b75cf84f7d8d4dc15。
- 遠端main／共同祖先：7cf1cebc10915f096a256885388ecd8a7052e5f3。本機main在另一舊Worktree，不當作本輪新基線。
- 正常merge commit：7b5199cbcddd06811e4ae43f3eaed05e4fc91b63，parents完整保留CS e0bd5614及MOBA0b577dab。
- **最終整合產品SHA：00ab310906ae5c89c262c4f451b00d18c1b45b00**（正常合併＋驗證工具的精確來源適配，未新增戰鬥語意）。
- 文件Checkpoint為此產品之後只追加交接的commit；精確SHA及新收據見最終交付與外部final-*紀錄，不以文件提交冒充另一版未驗產品。

## 來源保護與合併

兩個來源工作區開始時皆無tracked／untracked變更，CS相對共同祖先24個提交、MOBA53個提交（含handoff）。11支交接工具全部在MOBA已提交tree中，逐檔blob及最後commit收據見外部source-tools.json；沒有從未提交工作區撈檔、代Claude提交或省略校準／證據工具。

CS與MOBA已提交src分別24／17檔，沒有共同src路徑；唯一共同修改的追蹤檔是tools/verify.mjs。git merge --no-ff --no-commit正常三方合併，0衝突檔案，先build再保存merge。沒有使用ours／theirs批次策略。MOBA歷史文件帶有既存CRLF／空白警告，保留原文而不批次正規化。PowerShell初次build外層exit受stderr處理干擾，後續Node執行器取得真正child exit0；不拿外層訊號推定產品失敗或通過。

Claude工作區 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0 未修改，交付前重核仍0b577dab且乾淨。其他Worktree、共用stash、原34WIP及必要證據未操作；註冊Worktree清單保存於外部worktrees-final.txt，未新增Worktree。

## verify.mjs保留功能

- MOBA computeProv／staleReason／HEAD、dirty內容、模擬版本與指紋出處戳記。
- --resume僅沿用同commit／相同來源的有效結果；--dry-run不執行、不改狀態；--trust-legacy-state保留但須明確選用並印警告，本輪正式Gate沒有用它信任舊PASS。
- CS shader warmup輸出形狀14/14保留。
- 新增7個明確runner區段供整合守門，未刪除既有區段。argv之後的provenance／runner本體與MOBA交接版本逐位元相同。
- 已實測同產品SHA resume＋dry-run略過本輪2個有效結果，狀態檔前後SHA一致；明確legacy旗標的警告保留，日誌verify-resume-current.log／verify-trust-explicit.log。文件Checkpoint後另檢查舊產品SHA的state會被標為STALE，不借用舊出處。

## 三項特殊Gate：先留FAIL，再精確修工具

原始Gate均在merge SHA7b5199cb先實際執行，完整stdout／stderr及code1保存於raw-special-*與raw-special.summary.json：

| Gate | 原始結果 | 實際原因 | 適配後整合結果 |
|---|---|---|---|
| S2 T13b | 54/55 FAIL | 舊541721dd的全src相等假設，被合法CS24檔打破；T13c指紋與其他54項通過 | 55/55 PASS |
| Preflight P5 | 4/5 FAIL | srcSame=false，指紋未變、offenders=[]，其餘4項通過 | 5/5 PASS |
| Career-Parity C3 | 5/6 FAIL | srcSame=false；規則仍v1.3、無合法v1.4值、patchApplies=true，C2整場釘點等其他項通過 | 6/6 PASS |

適配commit00ab3109新增tools/lib/mobaIntegrationScope.mjs，三支Gate仍使用各自原始基準541721dd／feed38c1／910792ac。**不是改基準為目前HEAD，也不是只排除某個失敗項。** 保護完整73支MOBA語意檔，並要求所有非明確CS白名單的src仍與原基準相同；只接受已知24個CS來源路徑，不豁免整個fps目錄或任意非MOBA檔。任何未知新增來源、MOBA邏輯、旗標、版本／規則契約變更或dirty src仍FAIL；語意清單與CS白名單若重疊亦拒絕。

check_moba_integration_scope 12項正反例PASS，涵蓋LogicEngine／featureFlags／simulationVersion／matchRuleset、未知FPS檔、語意重疊、dirty src及三個原基準。原門檻、S2契約s2.v2、合法資訊檢查、工具不進src、v1.4規則排除與git apply --check均保留，沒有套用候選補丁。

## 以00ab3109實際重跑的驗證

| 範圍 | 結果／內容 |
|---|---|
| MOBA runner | 本次14/14 PASS；完整child stdout＋stderr複製至moba-child-logs |
| 模擬版本與層隔離 | simulationVersion106/106；v23 freeze PASS；v24戰術19/19；v20～v23逐tick與v24層隔離8/8 |
| 版本指紋 | v23 69237cce78edf2be、v24 9727c0b4ae8beb3d，73檔清單不改、不重登記 |
| 特殊Gate | S2 55/55、Preflight5/5、Career-Parity6/6；含Career-Parity環境拒絕反例與No-Skills／Career既有整場雜湊重算 |
| 其餘runner | progress25、regress15 seeds、regress2、presentation29b2、live_setup_3a、tactic_save_3a PASS；未跑的其他區段不算PASS |
| 正常MOBA Browser | 9/9 PASS：首頁、配對、選角、戰術、真戰鬥、唯一交易、新Replay開啟／關閉、回首頁／重整、切CS且CS歷史不變 |
| CS正式池 Browser | 81/81 PASS：三圖BO1、BO3、map identity／對手快照／選圖去重／戰術、真結算、戰報、Replay匯入返回、戰鬥與結算恢復、唯一正式結果／獎勵冪等 |
| CS培養閉環 | 與實際MOBA Node Gate並行47/47 PASS；正常首頁→CS歷史→戰報→培養→Training→確認→成長→下一場真Worker；重複確認後完整存檔一致；固定條件成長前後行為差異與決定性PASS |
| 合法能力 | 走位78→79.1、地圖意識82.25→83.2、體力62→50；仍由原calculateCourse／Training／growthLog計算，不保證勝率 |
| Training／賽季 | Training×Competition13/13，含MOBA／CS正式賽日、練習不推日曆、封季／換季保持訓練；CS series46/46 |
| 存檔／獎勵 | SaveBundle86/86；BP-9原子結算1464/1464，含CS／MOBA寫入失敗、重整／重試、BO3單圖等邊界；SaveSlim完整20季112/112 |
| Replay | 舊CS三圖全部保存幀、rawResult與metadata無損往返PASS；新MOBA Replay實際開啟／返回不重發獎 |
| production build | 真正child exit0；integration-production Release Gate PASS |

正常MOBA為真實敗場，正式交易18→19；沒有指定winner。CS BO1：Foundry13:1、Confluence13:10、Dune11:13；BO3 Dune9:13／Foundry12:16，自然0:2結束，唯一fixture outcome。本輪第三圖決勝局未發生，不造勝負補出三圖；三張場景各有真BO1覆蓋。20季SaveSlim是既有真資料模板經Store action做容量／冪等壓力，不能說成新打了2720場真實比賽。Career-Parity大型統計結果與E7 Calibration維持已提交歷史，不重新校準平衡或聲稱本輪重跑全部統計樣本。

MOBA UI原始兩次HARNESS_FAIL均保留：moba-ui.json漏按房間「進入Ban/Pick」；moba-ui-r2在按鈕尚未啟用就嘗試操作。Release Gate確實BLOCKED exit2；修外部腳本前置後moba-ui-r3真流程9/9 PASS，沒有因此修改產品或注入假狀態。

## 320px並行風險補證

1. 完整47項CS流程與實際MOBA live_setup／runner並行；parallel-processes.json保存兩個實際PID與命令，parallel-metrics.ndjson保存179個CPU／RAM樣本。整個監測窗最高host CPU busy約72.1%、最低可用RAM約2.14GiB；這是監測窗描述，不能把窗內峰值直接說成每一個320px斷言當下的負載。
2. 再做有界並行CPU工作者試驗：2個Worker、每個16MiB、最長90秒，跑完即關閉，只用於負載，不修改瀏覽器狀態／戰果；連續320／360／430／390／320／390／430縮放及歷史／重整共14/14 PASS（resize-loaded.json與.load.json）。
3. 320／390／430px均檢查單列分頁、選中項完整可見；完整流程另查頁面不橫溢、觸控、獎勵、長姓名與卡片。沒有改斷言或以隔離PASS消除風險。
4. 前輪46/47 PRODUCT_FAIL及resize-before8/10原始證據仍在cs-rc-ux-20261120；本輪並行PASS補上有限實測，**不是所有負載、CPU4×或真低RAM的全面認證**。原偶發問題列為需Owner實機轉向／壓力覆核的風險，不抹除歷史FAIL。

## Release Gate與原始證據

全部正式產品Gate target=actual=00ab310906ae5c89c262c4f451b00d18c1b45b00：
integration-moba、integration-platform、integration-coaching-parallel、integration-moba-browser、integration-cs-pool、integration-320-loaded、integration-production均PASS；七項總assert PASS（product-assert.stdout.log）。沒有借用原CS／MOBA分支的PASS冒充整合PASS。

證據根：C:\Users\ifikn\esmo-measure\cs-moba-integration-20261121。每一子行程code、耗時、SHA及stdout／stderr在各mode.summary.json及*.log；runner完整14份child log另存。保留原始三Gate FAIL、MOBA工具BLOCKED及原CS手機FAIL，未修改原始收據。最終文件Checkpoint再跑新SHA Gate：確認src／tools／public／依賴與此已驗產品完全相同，並重跑精確來源守門與三項特殊Gate；具體final-*收據及Checkpoint SHA以最終回報為準。

## 產品邊界與Owner預覽

- 四個正式MOBA旗標mobaTacticalDirectorV21／mobaJungleV22／mobaSafeRouteV23／mobaTacticExecV24仍預設false；正常預覽走正式預設規則，v24候選由明確Gate檢驗，不把候選旗標偷偷打開。
- Sprint2未啟動；未實作入侵A～D或建議A＋D；adaptive.v1.4仍只是可審閱補丁，沒有進src。
- CS original-v1仍opt-in，正式預設聯賽池、舊mirage／dust2／inferno歷史身分與存檔不migration。
- **整合production preview：http://127.0.0.1:5194/ESMO-/**，PID92728。舊5192／5193未關閉；cloudflared不在PATH，沒有安裝或虛構手機HTTPS網址。
- 正常首頁有MOBA／CS入口。CS：首頁→CS→歷史→戰報→培養建議→Training；正式原創池在既有賽事的明確測試選項選擇，不能改全域預設。
- 若要直接驗已有建議，先備份Owner存檔，使用獨立瀏覽器設定檔由既有備份匯入介面讀取 C:\Users\ifikn\esmo-measure\cs-tactical-coaching-20261116\owner-coaching.backup.json；自然Major／聯賽入口備份仍可用，不以開發網址作正常入口。
- 實際截圖：moba-ui-r3/integrated-home.png、integrated-moba-battle.png、integrated-moba-result.png；coaching/report-tabs-320.png、report-tabs-390.png、report-tabs-430.png、training-complete-390.png（均在外部證據根）。
- 本輪重用既有Replay／真賽季Fixture，只保留一份整合build、有界文字／JSON／截圖；沒有新增大Replay／Heap／Chrome永久Profile。各Browser收據均確認Chrome關閉與測試Profile移除，只有Owner預覽服務保留。

## 發布建議與未完成事項

**桌機技術整合Gate已通過，可進Owner整合驗收；不直接正式發布。** 尚需Owner接受／裁決風險與授權發布範圍，之後才可對真正main整合／部署SHA重新驗證並做正式站smoke。本輪不Push main、不Deploy；不能把localhost PASS當正式站驗收。

仍未解決：Android／真機觸控、低RAM／熱降頻NOT_RUN；CPU4×歷史FAIL、Replay2118MiB峰值風險；Dune CT約62～65%與Confluence小樣本CT39%未認證；MOBA Career-Parity S2-A／S2-C及生涯S5的既有FAIL／A～D取捨未裁決，旗標關閉不等於已完成校準；320px偶發裁切仍須Owner實機與更廣負載覆核。沒有以降低門檻、重登記指紋或調勝率消掉這些風險。

完成後停止Owner Review，不自動開下一Sprint或部署。

