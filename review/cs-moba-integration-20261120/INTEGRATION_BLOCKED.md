# ESMO CS × MOBA 安全整合 — BLOCKED（2026-11-20）

## 決定

**先停止整合，沒有建立Integration Candidate、沒有執行真merge、沒有整合產品SHA。** Owner明確規定Claude有未完成或未提交開發就先停止。Claude現役工作區有6個未追蹤的Calibration Sprint工具，其中兩個fit工具在本輪前新增；不能自行把它們排除後將910792ac視為完整最新交接。

CS所有既有功能、原創池opt-in／正式預設池、Dune修正、正常培養閉環與舊Replay保留。本輪僅唯讀盤點及文件Checkpoint，不修改任何產品／驗證工具，不Push／Deploy／force／新增Worktree／清理歷史資料。沒有把未提交工具複製進CS或代Claude提交。

## 實際Git與Worktree

核對時間：2026-11-20T12:46:18.241Z（UTC）。
- CS起點：c70bfeca82a9ef38a05d73a7599969efec1c3687，feature/cs-professional-expansion-20261116，工作區乾淨；有效CS產品仍7a8a25fadac1f04e7dd145c0006c047dbd5f608f。相對共同祖先23個提交（包括先前文件／維護，非本輪產品工作）。
- Claude：910792acc6fb33d11bd1faefecf15c9cea59ac8d，feature/moba-tower-edge-v23；工作區 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0；相對祖先50個提交。已追蹤檔案沒有未提交差異，但下列6個未追蹤工具尚未納入Checkpoint。不要把「src乾淨」等同整個現役開發已完成。
- 最新遠端main與共同祖先：7cf1cebc10915f096a256885388ecd8a7052e5f3。本機main仍cfa755be0ba0fd8a1dd0b53dc6ace1c37917c9c2，在另一既有Worktree；不可將本機main當成遠端新基線。
- 遠端未找到同名CS／MOBA feature分支，兩支皆無upstream；未Push相對關係依實際遠端main計，不假定所有歷史commit在任何遠端都不存在。
- 全部110個註冊Worktree已核對路徑／HEAD／branch與tracked status：0失效路徑、0 status讀取失敗、23個有已追蹤差異。使用git --no-optional-locks，沒有刷新他人index；舊工作區不遞迴列未追蹤資料。原34WIP與歷史Replay／Heap／Build沒有重掃或完整性重測，也沒有改動。
- 完整唯讀清單與狀態在 C:\Users\ifikn\esmo-measure\cs-moba-integration-20261120\audit.json；原始stdout／stderr同目錄。Git註冊狀態不等於所有110個都在現役，不能推定其開發工具或owner。

## 明確阻擋：未提交的MOBA Calibration成果

下表均在tools/owner_preview/；mtime為UTC，SHA於讀取前後size／mtime一致的時點取得，後續仍可能由Claude更新。

| 檔案 | bytes | mtime UTC | SHA-256 |
|---|---:|---|---|
| cal_analyze_v24.mjs | 6108 | 2026-11-20T12:20:34.949Z | a2c5ca1ac8c010eb6448d828e783d68b6bee6bfa4852fff31d076c38013b6d27 |
| cal_fit_belief_v24.mjs | 6674 | 2026-11-20T12:30:14.027Z | 02b6b466780a10ab65029fb88bd57e3f545359292d2606f0e14fcceca4b1dccf |
| cal_fit_success_v24.mjs | 3247 | 2026-11-20T12:43:35.950Z | a187faaf3ee792d14f5bf0b60b64d6285cd6a166ecc9ba04071cc0a2e5deb9b5 |
| diag_te24_cal_invade.mjs | 9566 | 2026-11-20T12:16:17.986Z | 1e54c311f88b2e3e33eaf170a51e99f2ebdf8e3705128aacb779d001602dcb44 |
| lib_parity_env_v24.mjs | 4000 | 2026-11-20T12:15:25.190Z | ba938cf8baad00416da1ccbd4592718267a1caee7c825b5db1c889fdf959916c |
| run_te24_cal.mjs | 3905 | 2026-11-20T12:17:25.319Z | d6d5a485875b8808df25ebaf1ed5ae5a3366e4b3b1d7f488bf21173b3fbc9675 |

cal_fit_belief_v24與cal_fit_success_v24的檔頭分別標示合法營地存活信念表、入侵成功率表的Calibration Sprint擬合工具；不是可自行刪除或忽略的cache。沒有執行它們。

已提交的review/tactic-book-3a/v24_sprint1/S15_PREFLIGHT_RESULTS.md §5仍寫不能正式開始Sprint2，生涯S2-A／S2-C FAIL、E7 INCONCLUSIVE，§6要求分別決定量測環境／重新校準／產品目標。這是已提交交接的歷史判定，並非本輪重跑結果；新校準工具顯示仍在接續開發，不能把已提交文件推定為當下全數完成，也不能由Codex擅自修MOBA。

## 精簡整合影響清單（相對共同祖先）

| 範圍 | CS已提交差異 | MOBA已提交差異 | 真正整合後必要確認 |
|---|---|---|---|
| 戰鬥／場景 | EsportsFPS3D、weapon handling、C4路線保護 | LogicEngine、tacticExecV24、仲裁、導航 | 保持各自決定性／情報規則與既有預設旗標；不把v24校準順便啟用 |
| 正式賽事／契約 | original pool identity、CsMatchResult、csMapVeto、profileStore／MatchSession接線 | matchRuleset、simulationVersion、matchAssembler | 模式／版本語意、舊存檔／對手快照／正式結果及獎勵冪等；不migration歷史 |
| Replay／呈現 | fpsReplay與無損tactical pool、CS渲染生命週期 | MOBA RuntimeView／Structures／Prewarm | 播放保存幀、載入／返回／卸載；不能用重跑引擎替代舊Replay |
| 玩家流程 | AppShell、戰報／培養／TrainingScreen、手機分頁 | MOBA TacticScreen、tacticBook／Choice／Confirm UI | 正常MOBA遊玩與CS報告→訓練→新實戰並存，不跨Career／Online權威 |
| 守門工具 | verify.mjs的CS shader shape14/14 | verify.mjs的provenance／dry-run／resume來源保護 | 保留雙方功能，釘整合SHA、乾淨狀態與指紋，不信任舊state |

已提交src差異：CS24檔、MOBA17檔，沒有共同src路徑；全追蹤路徑唯一交集是tools/verify.mjs。這只是檔案交集，不證明共享契約沒有語意風險。

## tools/verify.mjs提案（未套入任一工作區）

以本輪兩端已提交檔案與7cf1cebc祖先在外部文字副本執行git merge-file -p：exit0、0文字衝突，CS 14/14 shape與MOBA trust-legacy-state／provenance均保留。收據verify-proposal.json，文字提案verify-proposal.txt在外部證據根。沒有使用ours／theirs，沒有修改CS或Claude的tools/verify.mjs；本輪未聲稱「已完成衝突解決與產品整合」。

## 本輪Gate狀態

| 項目 | 實際狀態 | 原因 |
|---|---|---|
| Integration Candidate | BLOCKED | Claude現役未提交開發，觸發Owner停止條件 |
| MOBA正常遊玩 | NOT_RUN | 無整合產品SHA，不借用Claude舊Gate |
| CS三圖BO1／BO3、戰報→Training→下一場 | NOT_RUN | 無整合產品SHA，不借用CS47/47或81/81 |
| Replay／存檔恢復／BP-9／SaveSlim | NOT_RUN | 同上，沒有重產大型證據 |
| 320px並行負載針對性回歸 | NOT_RUN | 停止整合後不另開無關重測；原46/47 PRODUCT_FAIL仍OPEN |
| 整合產品Release Gate | NOT_RUN | 沒有可釘住的整合SHA；不得以c70或文件Checkpoint冒充 |
| verify外部文字提案 | exit0，非產品Gate | 只證明唯一共同檔可保留兩端文字 |

320px原始FAIL：C:\Users\ifikn\esmo-measure\cs-rc-ux-20261120\r2\coaching（46/47 PRODUCT_FAIL與截圖），先前resize-before.json亦保留。isolated的47/47不能排除此風險。續跑須在真正整合版本，以有界且記錄CPU／記憶體與執行程序的並行負載情境重測320px轉向／縮放、選中項完整可見、頁面不溢出與觸控；不放寬斷言或以隔離PASS結案。

## 預覽與發布條件

既有CS production preview http://127.0.0.1:5193/ESMO-/ 本輪唯讀HTTP200，仍是CS單支線7a8a25fa build，**不是CS×MOBA整合預覽**。沒有啟動服務、沒有安裝tunnel；整合預覽未建立。

**不具備此次CS×MOBA發布條件。** 除來源未提交，尚無整合Gate／並行320px補證；MOBA S2／E7、CS Dune CT62～65%與Confluence小樣本CT39%、Android／低RAM／熱降頻NOT_RUN、CPU4×既有FAIL與2118MiB風險均不得改列PASS。

## 最小續跑條件與步驟

1. 由Claude完成必要成果的Checkpoint並交接明確可整合SHA／範圍；暫存診斷或原始log不應為求乾淨而強行提交。若仍有現役未提交開發，維持停止，除非Owner另外明確指定可凍結的已提交範圍。
2. 恢復時重核main、兩分支、Worktree與未提交狀態，不使用本報告的SHA當成永久最新。保留原始CS分支與所有未Push成果。
3. 僅在既有安全可用工作區建立隔離Integration分支，不新增Worktree；以唯一整合owner套入完整已提交來源，保留verify雙方邏輯，不碰Claude使用中的工作區。
4. 真正整合產品提交後，依上述矩陣釘新SHA執行必要CS／MOBA／BP-9／SaveSlim／Replay與320px並行回歸，保存所有FAIL／BLOCKED／INTERRUPTED／NOT_RUN；不重錄舊歷史或降低門檻。原創池持續opt-in，正式預設池不變。
5. 建立真正整合production preview與新Gate收據，交Owner Review。即使通過，本輪授權仍不包含Push main／Deploy。

本輪至文件Checkpoint後停止Owner Review。



### 2026-11-20 12:49:32 UTC 收尾來源再核對

Claude HEAD仍910792acc6fb33d11bd1faefecf15c9cea59ac8d；未提交工具由初查6個增至7個，新增tools/owner_preview/pin_v13_baseline_v24.mjs（2085 bytes，mtime 12:49:06 UTC，SHA-256 78bca1331200d74c4425aefbeab34b56e45d92acc6d8a6b7b4bc22624d0d1ebe）。全部7檔的最新收據在外部證據根claude-final-status.json。這是仍在現役開發的直接變化，維持BLOCKED，不開始Integration Candidate。上文6檔清單保留為初查時點，不覆寫原始證據。
