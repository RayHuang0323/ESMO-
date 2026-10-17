# CS Major 證據產出與保留政策

## Owner 人物美術收尾與清理授權（最新）

2026-10-11 Owner 最新指示：人物美術接受目前完成度，停止人體／手指完美化，不再以舊獨立 1／U findings 阻擋反覆追修；原審查分數與遮擋限制保留，不宣稱獨立藝術 PASS 或量測90分。只收必要 B 技術驗證後直接 C → D → E，完成停 Owner Review，不 push／deploy、不動 MOBA。升級完成後已授權清理本 CS 工作區淘汰 evidence／profile-builds，保留最終可用版、必要完整驗證紀錄、素材授權與唯一恢復點；執行前逐份核對明確清單、resolved path、連結及使用中程序。

以下較早狀態及分數屬歷史，下一步以 RESUME_CHECKPOINT.md 最新段為準。

## 2026-10-11 再次稽核：目前產出確實過快

本輪先唯讀盤點／修正產出工具，再做逐SHA相同內容硬連結收斂。所有原證據路徑與bytes保留；僅移除已保留同內容的交易暫存獨立副本，沒有刪歷史證據、圖庫或build目錄。完整SHA盤點retention-audit-latest.json、native0；輕量容量與file identity盤點growth-audit-latest.json、native0。後續小報表不混入當時快照。

| 項目 | 本輪量測 | 與2026-10-08快照差異／原因 |
|---|---|---|
| evidence | 3,829,230,448bytes；434第一層目錄；9189檔；4206PNG | +341,176,937bytes／+253PNG |
| evidence深層資料夾／根散檔 | 1144／1943（輕量掃描時間稍後） | 離線小步各建目錄／分散檔案，增加檢索與OneDrive成本 |
| 圖片 | 3,431,725,449bytes，約90% evidence | 反覆不同候選圖庫；不是完全相同bytes造成 |
| JSON／logs | 242,065,161／29,147,986bytes | 含trace、作者packet與完整失敗；應避免同payload再印log |
| 作者packet | 16份，51,606,508bytes | 約1.35%，不是主因；目前不改格式／大重構 |
| profile-builds | 19,194,233,625logical bytes；164第一層／15958深層目錄；74227檔 | +2,558,764,782logical bytes／+31第一層目錄 |
| build按dev/ino去硬連結 | 17,785,581,753bytes／73267個file identity | 排除1,408,651,872bytes重複路徑；不是實際磁碟配置／可回收量 |
| build副檔名 | GLB9.92GB／WAV5.58GB／PNG2.16GB／JS0.99GB／64500SVG | 舊整份public封存包含CS不需要的英雄、音檔與圖示，主要成本 |
| 完全相同PNG | 6組；重複1,543,529bytes | 不到主要成本；近似圖不得當相同檔 |
| 同source／實際bundlebuild | 19組；85份缺manifest | 不等於完整public相同或可刪除 |

**合理性結論：不同版本真正驗證與失敗證據有必要；每個局部試探都封存整份public／重拍全圖庫、以及重印同診斷payload不合理。過去做法已造成主要累積成本，修正新產出不代表歷史容量已回收。**

### 本輪已落地的額外修正

1. authorReport.mjs完整JSON一次，stdout只含結果／標量／檔案路徑／bytes／SHA；audit_glove_surface_candidate、audit_grip_candidate_skin、audit_grip_candidate_states、audit_cuff_pose_candidate、preflight_cuff_candidate、refine_visible_grip_candidate已採用。失敗cases、faces、resolvedStates保留，native exit不變。真180候選失敗驗證report68,072bytes、log962bytes，完整報表SHA與摘要一致；不再在log重印約38470bytes同payload。不是刪stdout／stderr，實際stdout與stderr仍完整保留。
2. run_isolated_gpu_gate.ps1 v4預設Diagnostic：明確單地圖、support最多4PNG（trigger兩圖），或metrics零PNG；本輪證據及prepare/browser完整logs預算32MiB、局部最高64MiB。超計畫保留原生結果與證據、回HARNESS_FAIL_EVIDENCE_BUDGET，不刪檔／改產品。失敗metrics允許單張timeout诊断，不能冒充成功0PNG。正式Acceptance與Performance須寫具體必要性、列預算，不能默默展開全量；正式驗收仍跑完整既定範圍。PlanOnly6項/native0、8項syntax/native0，沒有本輪browser／build；尚未實跑超預算收尾branch，不宣稱已量測。
3. 新作者小步合併單一run目錄（本輪retention-policy-20261011），完整packet只在新真幀／需要新來源時產出。先離線修模與Blender作者檢查，幾何成立並有具體可見改善才局部4圖；不為每個數值試探產build／圖庫。現有同source逐byte重用archive、CS-only public硬連結維持，24份新manifest共960link／0copy，私有cache新增僅58,693,828bytes。
4. 最新visual review合併同一份各來源版本表，checkpoint保留目前狀態與歷史連結；handoff只指canonical checkpoint，不各自複製整段完整結果。小型歷史停點封存一次，保持可恢復性。

驗證與完整資料：evidence/retention-policy-20261011/{policy-plan-validation.json,syntax-checks.json,output-validation.json,glove-anatomy-states.json,glove-anatomy-states-full.log,glove-anatomy-states.exit.txt}。候選native1只表明需修模，不是產品regression、B7或新產出政策藝術通過。

### 歷史資料刪除仍待逐份核對

舊66份build約8.48GB僅為原dry-run候選，尚未核全public／使用中程序／唯一恢復點，不能宣稱可安全刪除或可回收8.48GB。此次不做按日期刪图／刪build、不操作MOBA或任何使用者browser資料。先核保留最終／最新recovercandidate／必要before-after／代表失敗，再形成明确清單；完整logs、native exit、metrics及來源關聯保留。NTFS硬連結與OneDrive雲端占用要另核，不能把logical bytes當回收量。

### 2026-10-11 本機同內容收斂已完成

plan逐檔SHA核4419舊CS副本與既有40 cache相同，共7,486,337,972bytes；僅profile-builds/assets/fps與audio/cs，不包含任何MOBA worktree／英雄檔／使用者資料。可逆交易INTENT→原檔同目錄暫存→link→同file identity驗證→移除單個相同bytes暫存，保留全部原路徑及內容。完整result/native0；4419次收尾審核與40 cache重新SHA/native0，暫存0、cache新增0。失敗則還原原檔／保留暫存並停止，不默默刪除任何其他路徑。

再次metadata盤點native0：build按dev/ino去重17,785,581,753→10,324,018,459bytes，約17.79→10.32GB（期間增加一份新CS archive）；逐路徑logical19,277,702,131bytes仍保留，165第一層目錄／74282files／15968深層目錄。**這是本機獨立檔案內容的去重，不能宣稱磁碟配置或OneDrive雲端已少7.49GB。** 路徑／資料夾數保留是為維持所有舊證據連結；後續folder增長由新產出守門控制，不為減數量任意搬歷史目錄。可以把每個link複製成獨立檔還原，不需要重建原source。

本輪真v4 GPU已實跑：17/17/native0、4PNG、兩logs及證據3,811,463bytes<32MiB、40資產link／0新cache，Chrome收尾confirmed。藝術仍手部1／U，不因此再拍全圖庫。新增自然骨姿候選只存小報表／稀疏patch與一張必要CPU作者圖，未整合／無新build或Browser。原超預算failure收尾branch仍未被實跑，不宣稱已驗。

完整plan／journal／result／audit／native與before-after growth在evidence/retention-policy-20261011。原66份build刪除dry-run仍未執行；這次沒有刪任何build目錄、PNG、logs、唯一恢復點或歷史結論。

## 2026-10-08 既有措施與歷史快照

2026-10-08重新審視已完成。主要浪費是多輪近似圖集與整份public反覆封存，並非大量完全相同PNG。以下規則已實作及實測；歷史檔案尚未刪除。

## 已落地的產出修正

- 局部袖修只產出兩隊support正面／前左54度，共4PNG，必須使用diagnostic- phase。早期JSON的FRONT_REAR_LEFT舊標籤不覆寫；以actual view／角度／檔名判定。局部結果不代表正式六身份驗收。
- 純效能、生命週期或成本補驗使用captureMode=metrics，0PNG；不可搭配人物、武器或動作圖庫。完整logs、stderr、native exit、metrics及隔離紀錄仍保存。
- source／assets／trace／probe版本相同，自動重用production archive；逐byte核对JS bundle與CS public資產，瀏覽器結果每次獨立執行。舊manifest缺probe版本時不得猜測相容性；探針注入內容改動須升probeVersion。
- 新隔離archive只封存public/assets/fps與public/audio/cs，sourceFingerprint涵蓋角色rig與舊槍聲。正式npm build與部署設定不變；archive不能當全站發佈包。
- 新增內容定址CS public快取：獨立複製來源至profile-builds/.cs-public-cache-v1/<SHA256>，archive優先硬連結這份私有內容，不連結可變的public來源；不支援硬連結則獨立複製。來源改動建立新內容地址，損毀快取拒絕使用及覆寫，每個archive仍可獨立讀取。此保留區不是build，不列為缺manifest建置；舊archive不搬移。來源隔離／重用／來源修改保留舊archive／copy fallback／禁止覆寫／損毀拒絕六項fixture驗證已通過，實際硬連結3檔；真CS production載入已由draped與sewn兩次必要局部GPU實測；sewn重用40硬連結、0copy、新cache檔0／bytes0。快取及archive真唯讀，誤寫拒絕亦已實測，不因測試另做build。
- 只有實際source改動才建立一份新archive。局部視覺未通過時，不重拍六身份與雙尺寸完整圖集；正式驗收範圍不縮減。
- 明確遮擋缺口可補必要視角：`operatorFrontQuarter=true`只允許完整六身份，加front-left且保留原四角度，每尺寸34PNG／34像素量測。此為完整56圖審查具名的裝甲內肘／翻回布面遮擋補證，不是每輪固定增加圖片，也不能挑單一角色或替換不利角度。最新反面染色候選owner已看完整局部4圖並判2後才執行此完整補證；尚未由此宣稱藝術通過。
- checkpoint只保留目前狀態、精確来源與必要連結；候選合併同一review，Sprint只追加批次成果。原196357bytes checkpoint原樣封存evidence/checkpoint-history-before-compact-20261008.md，不再每輪複製時間線。

實測：局部GPU13/13與4/4pixels、同源純效能6/6與0PNG；三圖生命週期87/87與0PNG；rounded-roll成本補驗13/13與0PNG，均native0且共用各自同源archive。這些只證明產出策略與技術結果，不代表藝術放行。對應完整logs／exit／manifest／metrics保留於evidence；最新產品狀態見RESUME_CHECKPOINT.md。

精簡archive55檔／83,186,541bytes，對舊完整public archive569檔／131,565,917bytes，少514檔（90.3%）與48,379,376bytes（36.8%）。正式部署包不在此比較內。

## 新工序的實測補充（2026-10-11）

新source4c5424f1…必要一次建置／單地圖4PNG，完整證據＋prepare/browser logs3,808,951bytes，32MiB內；public40檔全link、0copy／0新cache，GPU17/17與pixels4/4/native0，但藝術1／U仍拒絕，不因技術PASS繼續擴大拍圖。同一run保存3,213,908bytes完整真失敗JSON及約1KB stdout摘要／SHA，沒有再將大payload重印log；修正後完整報表約53KB。只一張新CPU作者圖931376bytes與約219KB稀疏patch，0新packet／GLB／blend／scene。

另外修runner參數解析，避免查--help或拼錯參數默默啟動123長區段：help原生0只印用法、unsupported原生2不啟動verifier；產品斷言與正式驗收範圍不變。已誤啟輪立即中止/native1，原捕獲stdout及未完成結果保留，不宣稱PASS。

## 建置與 GPU 程序隔離

2026-10-09 Blender 作者補充：已有帶來源／蒙皮／bind矩陣的基準packet時，後續修形只保存參數、script SHA、稀疏edits、bind候選與診斷；不為每個小數值重複完整packet、GLB、`.blend`或遊戲圖庫。新的骨姿／矩陣才需要新packet；GLB只在入口／出口相容性有新問題時產出。已產出的無效與失敗證據保留，不自動刪除。最新袖口候選81頂點共用同一packet、0新build／Browser／遊戲PNG；不可把這當成藝術或產品通過。

MOBA正式Release gate進行時，CS真GPU／Browser全部排隊，Blender作者與離線檢查可以繼續；不搶空檔、不關外部程序、不平行跑重型gate。等待條件與補驗順序見GPU_VALIDATION_QUEUE.md。

2026-10-09補充：真狙擊握槍缺口使用`operatorHandClose=true`及`operatorHandFamily=sniper`，仍只產出兩隊各兩角度，共4PNG。首輪為正面／前左，原圖及U項不覆寫；因扳機手遮擋，後續固定前右／前左觀察兩側，原生面向角度仍須成立，不挑選有利圖片。角色與槍型須來自真保存幀，近拍前提檢查雙腕及十指端點；明列`WRISTS_AND_FINGERS_NOT_FULL_BODY`，不代替六身份、全身或雙尺寸驗收。找不到兩隊真情境須明確失敗，不改槍型或種子。

wrapper v3為artifact準備與browser程序分別保存完整stdout／stderr及原生exit。前置隔離攔截的輪次不執行build或browser，保留`HARNESS_FAIL`及`NOT RUN`，不產額外PNG。其他工作區程序不操作。前後快照不能證明全程沒有其他CPU負載，不能據此宣稱乾淨效能基準。

薄袖口四圖審查具名的扳機手遮擋，只用`operatorTriggerClose=true`補CT/T各一張（總2PNG）。觀察側由真右肩／左肩的世界方向決定，原生環繞對齊並檢查鏡頭實際低於真槍柄，保持同正常姿勢／保存幀。明列`DIAGNOSTIC_ONLY_TRIGGER_SIDE_TWO_PNG_NOT_FULL_BODY`；若仍遮擋保留U，不重拍整套或改角色姿勢。此branch不增加原正式驗收範圍。

`run_isolated_gpu_gate.ps1` v2將production artifact準備與browser測試分成兩個序列短命Node程序。`--prepareOnly=true`只建置或逐byte核對同源archive後退出，明確輸出browser NOT RUN，不產gate或PNG，不是RESULT=PASS；總supervisor時限扣除準備耗時。實測three-fold-cuff同archive重試：準備native0、沒有新build，第二程序GPU17/17/native0、四PNG及4/4pixels。此前同程序240秒HARNESS_FAIL/native2原結果保留，不能改寫成產品regression或PASS；尚未證明程序記憶體是唯一原因。

## 唯讀盤點快照

工具tools/audit_evidence_retention.mjs串流SHA256核對PNG與實際JS bundle，只有報表輸出，沒有刪除／搬移入口。完整log retention-audit-refined-20261008、native0；JSON evidence/retention-audit-latest.json為盤點當時快照，後续產出不混入舊數字。

容量數字是逐路徑logical file sizes，不能當NTFS實際配置或壓縮容量。新增硬連結後同一內容可能有多個路徑，不能把各路徑size相加宣稱磁碟占用或已回收容量；硬連結／獨立copy／新內容bytes由新manifest的publicStorage分列。

本輪真CS資產已驗：diagnostic-b7-draped-return-20261008 build18.68秒、局部GPU17/17、4/4pixels、native0。40份靜態資產共58,693,828logical bytes，全部硬連結至私有內容cache、獨立copy0，來源不變。另一份真資產封存（無build／browser、0PNG）共用同cache：40硬連結、新cache檔0／bytes0，native0。完整logs cs-public-artifact-store-20261008及cs-public-real-reuse-20261008；不是刪除舊檔回收58.69MB，也不借舊browser PASS。

| 項目 | 當時數量／容量 | 判讀 |
|---|---|---|
| evidence | 3,488,053,511bytes；3,953PNG | 包含不同候選與必要失敗證據 |
| profile-builds | 16,635,468,843bytes；133份 | 主要儲存成本 |
| 完全相同PNG | 6組；重複1,543,529bytes | 相同bytes才算重複 |
| source與實際JS bundle相同build | 19組 | 尚不證明整份public相同 |
| 缺manifest | 85份 | 不得假稱可安全清理 |
| 相同尺寸與情境圖名反覆產出 | 120組 | 不同畫面，不是exact duplicate |

同情境輪次例：桌機active／overview各195，detail146、POV145；390px各100／99／87／87。這量化反覆取證成本，不是逐檔刪除理由。

## 清理邊界

結案保留正式最終版、最新可恢復候選、必要before／after及具體失敗代表圖；完整文字logs、native exit、metrics、來源關聯必留。66份舊build約8.48GB僅列於evidence/build-cleanup-candidates-20261008.json，尚未清理。

清理前逐份核對用途、CS public完整性、唯一恢復快照、審查狀態與活躍程序；提出具體清單與可回收容量。依AGENTS取得刪除授權後，以PowerShell LiteralPath操作，resolved path須全部位於本worktree。禁止跨shell、萬用字元掃除、git clean或單純按日期刪除。logs、PNG、build與scratch不提交Git。清理不影響MOBA或使用者browser資料。


## 2026-10-12 E收件後明確清理結果

root依既有Owner授權与manifest真SHA審核後，以單shell PowerShell LiteralPath完成10份舊CS archive刪除，native0／10 DELETED_CONFIRMED／0不完整；logical1,315,147,939bytes只是移除路徑的logical大小，不代表磁碟或OneDrive回收量。elbow之前cwd UNKNOWN保留，沒有重試洗綠；55份其他不確定候選、全部PNG/evidence/full log/native/metrics/原失敗/cache/素材授權/唯一B恢复点與新C/D/E/source恢復gzip/dist保留。沒有控制使用者或其他worktree程序。

執行前逐份核source/bundle/evidence SHA、resolved path、全檔handles与cwd；完整review/manifest/INTENT journal/result/native/stdout/stderr在retention-policy-20261011/e-root-cleanup-final-*。原審查數與失敗不改，127歴史refs由e-approved-root-review-history-v2.md接續，8active docs追加索引，歷史checkpoint bytes不改。工具核對的操作時政策原bytes另存e-policy-at-cleanup-20261012.md；本節於執行後追加，不能倒改當時快照。完成停Owner Review，不push/deploy/commit，真手機與視覺未實測。
