# CS Owner 驗收支援與競技品質 — 本機停點

接續 e86ef026f939f7e1e87a88ea33999cda0572b84a；分支 feature/cs-professional-expansion-20261116。原始5190預覽保持可用，新候選5191。沒有新增Worktree、Push、Deploy、改正式預設池、清理WIP或修改Claude工作區。

## 已完成與真實前提

- 自然聯賽：新局原始名單，14場全跑 canonical CS 引擎及正式結算，10勝4敗、聯賽第1。沒有棄權、補Major席位、改積分榜或指定勝負。日曆正常推進，Major名單來自完整聯賽前4。
- 自然Major：瀏覽器正式準決賽0:2（Foundry8:13、Dune16:19）；每張已打地圖皆原生下載本場新Replay，檢查保存幀播放、暫停、匯入、返回原場、原場重整恢復、同一檔案重新開啟、正式戰報／入史一致與唯一系列結果，25/25 PASS。0:2不強迫打第三圖。
- 後續自然季軍戰由canonical引擎完成0:2（Dune8:13、Foundry6:13）；Major四場完成、CS第88天正常封季，MOBA賽季逐值未變。這是Node正式路徑＋Browser Major的混合證據，不宣稱整季每一場都人工觀看。
- Replay重整的產品行為：原正式比賽恢復；外部Replay檔須手動重新開啟，並不宣稱Replay游標自動持久化。

## 真產品修正：原生匯出的Dune Replay無法匯回

自然Major實際匯出7,061幀的Dune檔案：gzip30,204,913 bytes、解壓354,427,827 bytes，超過既有256MiB限制；原生UI 2/3 PRODUCT_FAIL及原檔保留。主要重複欄位utilityPlans約145.9MB、holdCoverPlan約11.1MB。

只針對Confluence／Dune傳輸加入可辨識的 `round-prefix-tactical-pool.v1`，重用既有無損tactical plan interning。舊tag／Foundry codec／引擎／Frame／Result schema與64MiB／256MiB匯入限制不變。相同Dune戰果新wire200,635,538 bytes、gzip8,461,154 bytes；全部幀、所有欄位、simulation、metadata、rawResult雜湊一致，真檔案匯入API通過。新tag需要本候選decoder，舊已發布客戶端會明確拒絕未知編碼；既有舊檔仍可在新候選讀取。既有超限舊檔本輪不原地改寫。

## 競技基準（描述性，非公平性認證）

72場完整模擬：三圖、seed61001／61002、6種條件、A／B交換初始引擎槽位。起始CT是測試隊伍放置，不是新增玩家選項。只變A隊一項能力的配對，其他初始名單／對手／戰術／seed不變。隊伍對照Shadow Wolves／Iron Vanguard；角色與人格不同，不能把整隊差異當單能力因果。

| A隊條件（每組12場） | 勝場 | 命中／射擊 | 反應episode平均延遲 |
|---|---:|---:|---:|
| 同能力70 | 6 | 63.88% | 303.45ms |
| accuracy35 | 0 | 47.79% | 300.05ms |
| accuracy95 | 10 | 72.98% | 311.36ms |
| reflex95 | 10 | 65.54% | 235.19ms |
| 改選另一攻點戰術 | 7 | 63.15% | 305.06ms |

命中率是真shots/hits，反應值依episode數加權；路徑／武器／經濟在介入後會分歧，不能把不同情境平均當獨立單發公式。高能力仍有同seed敗場，全部保留，不按勝率調公式。

同能力案例的T／CT回合：Confluence52:50、Dune28:72、Foundry48:56；Foundry起始T隊4/4勝，但只有兩個seed，仍是警訊而非固定隊伍優勢的證明。另選攻點在三圖均4/4改變round digest，戰術不是未接線；Foundry改善、Dune退步，不能給全圖通用最佳戰術。

72場illegalWallCrossings與spawnAnchorViolations均0。navigationAudit.unresolvedStuckEpisodes合計177：它是全場診斷episode數、偵測後未標resolved的狀態計數；其中會含意圖結束／回合終止等情境，非失敗移動秒數、非玩法勝負KPI，不以此宣稱177次產品故障。各角色ADR／rating／首死已留比較資料，但沒有等職責／等武器介入，尚不能宣稱角色能力失衡已證實或公平性已通過。

## 驗證與原始失敗

- 新Replay codec：同一原生超限檔完整無損往返＋實際受限File importer＋壞引用／錯場景拒絕PASS。
- 舊Confluence／Dune／Foundry三份受保護Replay逐幀／所有欄位／Result／metadata往返PASS。
- CS Major Replay UI51/51、Replay Input15/15，以及Progress與MOBA presentation replay回歸PASS。
- 原有C4、反應敏感度、首殺戰報、Training／Learning、BO1／BO3與地圖池不重做。後續最終SHA Gate以同目錄final-*收據／stdout／stderr為準，不能把此處precommit結果冒充新SHA。
- 原工具失敗保留：natural-r1誤只判alreadyApplied；r2因已知來源欄位誤判中止；r3誤讀matchFormat欄位，但14場真實聯賽已完成，由完整存檔續接r4；baseline-r1誤假設每圖都有rush，改比較真實另一攻點並以input digest核對已完成8場續跑；Browser r1依賴dev-only scene global，改讀production真DOM；r2遇超限原始HARNESS_FAIL後另以原生UI確認PRODUCT_FAIL；首次Replay regression誤用major.v3／缺少canonical fixture，改指定既有D槽canonical資料重跑，不放寬舊斷言。
- `tools/check_cs_integration_replay.mjs`只新增輸入根目錄／輸出環境參數，預設保留；原逐幀deep equality沒有更動。原始log與probe output不提交。

## 下一階段與保留風險

可實作的戰報→Training方案見 docs/design/CS_戰報訓練實戰追蹤方案_v1.md；唯讀原型由本輪真戰報產生2份建議，使用calculateCourse，輸入存檔逐值未變。尚未接玩家UI、沒有第二套統計或發獎權威。

優先：①擴充Dune的同戰術／攻守／武器／實際plant與retake因果分析；②以配對角色能力介入分開Foundry起始方與職責差異；③把唯讀訓練建議接既有戰報與Training，先解決跨場playerId、同名與資料不足，不搶改共享Store。

Android／低RAM／熱降頻NOT_RUN；CPU4×FAIL與2118MiB歷史風險保留，新codec不等於解碼RAM峰值已修好。超長OT仍可能觸及既有檔案限制，未宣稱任意長度Replay都可匯入。BP-9完整112/112為e86ef026既有收據，本輪未改Store／SaveSlim；若未另跑新SHA，不能宣稱新的BP-9壓力PASS。

完整原始證據：C:\Users\ifikn\esmo-measure\cs-competitive-quality-20261116。保護原34WIP、D槽歷史及Claude77780df3的6修改／2未追蹤。正式預設池與舊歷史身分不變；完成停止Owner Review。
