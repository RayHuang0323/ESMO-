# CS桌機Beta：版本封存與安全清理報告

2026-11-08。**CS Map v2桌機Beta已結案，CONDITIONAL GO保持。** 正式產品仍為7cf1cebc；本輪只封存文件與清理已確認的安裝下載快取，不新增CS功能、不改產品、不Push main、不Deploy。

## 遠端封存與版本

| 項目 | 實際結果 |
|---|---|
| 正式部署 | 7cf1cebc10915f096a256885388ecd8a7052e5f3 |
| R4文件Checkpoint | eb209b967165cb14ce3216ac2b3ef35d2480c208 |
| 獨立備份分支 | [archive/cs-map-v2-beta-r4-20261108](https://github.com/RayHuang0323/ESMO-/tree/archive/cs-map-v2-beta-r4-20261108)；清理前已回讀確認eb209b96 |
| R4固定標籤 | checkpoint/cs-beta-release-20261108-r4-desktop-verified → eb209b96，已Push |
| Beta／RC／舊main備份 | 既有Beta tag→7cf1cebc、backup/cs-map-v2-rc-20261108→67f46145、backup/main-before-cs-map-v2-beta-20261108→3e615157保留 |
| 後續清理文件 | 僅在既有發布工作區commit，正常非force備份至同一獨立分支；精確SHA／最終遠端回讀見final-checkpoint.json |

首次備份只有48個新增Git blob，最大約2MiB，檔案差異僅文件與既有.gitignore；沒有新增大型Profile、Replay、Heap、影片或診斷原始資料。Pages workflow只接受main push，本輪未Push main或呼叫workflow_dispatch；沒有正式部署。原34份WIP仍在原工作區與本機RC recovery備份，**沒有把未確認WIP或原始證據混入GitHub封存**。

正式首頁SHA與R4已驗證內容相符。R4的同7cf1cebc三圖正式流程各48/48、MOBA90/90、B1B／B1C／B1D及Replay38/38、最後29組Gate是已完成驗收的歷史收據；本輪沒有產品修改或新發布候選，不重跑大型Build／Runtime，也不把文件Checkpoint冒充新產品SHA的PASS。

## 本輪容量與可歸因清理量

| 槽 | 總GiB | 盤點前可用GiB | 盤點後可用GiB | 全程可用淨變化MiB | 已確認移除配置MiB |
|---|---:|---:|---:|---:|---:|
| C | 200.00 | 9.61 | 9.64 | 22.06 | 28.88 |
| D | 275.69 | 13.36 | 13.36 | 0.00 | 0.00 |

前取樣2026-11-08T08:53:37.2445557Z；後取樣2026-11-08T09:02:53.7098680Z。C、D為同一顆Disk0 SSD的不同分割區，不能把D當獨立實體備份。

**可歸因本輪的刪除只有C槽28.88 MiB；D槽0。** 刪除當下C槽可用空間增加28.90 MiB，與檔案配置差16384 bytes；整段任務還有系統／OneDrive／日誌寫入等活動，因此不把全部磁碟可用量變動算成清理成果。與前輪R4的8.05GiB比較更不能全數歸因本輪。

## 第1批：單一Node20下載ZIP

- 路徑：`C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r3\node-v20.20.2-win-x64.zip`。
- 移除1檔，邏輯30283903 bytes、實際配置30285824 bytes，單一hardlink、不是reparse point或目錄。
- SHA-256：dc3700fdd57a63eedb8fd7e3c7baaa32e6a740a1b904167ff4204bc68ed8bf77，與保留的官方SHASUMS與node20-download.json一致。
- 執行前確認無下載／解壓／引用程序，獨占開檔成功；驗證絕對路徑與每層父目錄，沒有萬用字元、遞迴、Force或跨shell列舉刪除。
- 保留解壓後Node20 v20.20.2 runtime、官方hash／下載紀錄與正式受測Build；runtime清理前後均可正常執行。ZIP不是目前驗收工具輸入，也不在R3必要證據index內，是已完成解壓的可重下載快取。
- 固定版本恢復網址：https://nodejs.org/dist/v20.20.2/node-v20.20.2-win-x64.zip；HEAD驗證200、Content-Length30283903。
- 必要時恢復：`node C:/Users/ifikn/esmo-measure/cs-beta-archive-cleanup-20261108/restore-node20-archive.mjs --restore`。先下載到記憶體核對固定SHA才寫回，拒絕覆寫已存在檔案，不做全域安裝；本輪沒有重新下載以抵銷釋放量。

每批完整preflight／stdout／stderr／exit與容量記在batch-1-plan-utf8bom.json、batch-1-result-utf8bom.json及對應logs。沒有第二批刪除，也沒有移除任何Worktree／Profile／原始證據。

### 維護工具失敗與處理（非產品回歸）

首次不刪檔預檢因FileInfo與DirectoryInfo的Parent屬性不同而中止，當時未刪資料；修正為從已驗證父目錄開始逐層檢查。其後第一個execute退出1，檔案仍存在，立即停止其他清理並驗證1009份證據未變。

唯讀AST查證：Windows PowerShell5.1／Codepage950讀未帶BOM的UTF-8腳本時，中文註解吞進下一行Remove-Item；ParseFile看到0個刪除命令，但明確UTF-8 ParseInput看到1個，原刪除實際沒有執行。另存UTF-8 BOM版本，只改編碼與收據檔名，保留同一組路徑／SHA／程序／獨占／非共享守門；AST確認0語法錯誤、且僅有1個`Remove-Item -LiteralPath $actualPath -ErrorAction Stop`，再做plan與正常單檔刪除才成功。不是權限繞過，未改用更強刪除方法。原失敗logs、原腳本、AST診斷與修正版皆保留。

## 保全驗證

| 項目 | 結果 |
|---|---|
| 原34WIP與recovery備份 | status與逐檔hash均一致；原CS HEAD a7398436未改 |
| R2必要證據 | 113檔hash相符 |
| R3必要證據 | 125檔hash相符，包含原FAIL |
| R4必要證據 | 771檔hash相符，含影片／Console／Network／PASS與FAIL |
| 三份正式Replay fixture | 保存檔hash與replay-roundtrip相符 |
| R4四個測試Profile | 目錄全保留，不刪其Cache或存檔 |
| CS／MOBA／BP-9產品與Repo工具 | src／public／tools／套件／Vite／workflow相對正式產品無差異 |
| RC／Claude工作區 | 保全快照記錄，未修改 |
| Git與其他系統 | 無reset／clean／force push／手動prune／gc；不移動main，不動共用node_modules或Chrome正式Profile |

清理前／失敗後／成功後的保全檢查均保留，不以檔案存在代替必要證據hash驗證。原始巨大Heap／其他歷史證據只做配置與存在範圍盤點，沒有宣稱逐位元重驗全部歷史資料；本輪未對它們執行任何刪除。

## 剩餘分類與下一批建議

目前**沒有另一項已確認可自行安全清除的資料**；下面都是Owner審核候選，不代表立即可刪、容量不能保證全數回收。

| 分類 | 配置GiB | 處置／風險 |
|---|---:|---|
| Profile | 1.93 | 原始測試Profile可能含唯一存檔／診斷，全部保留；R4四份約0.49GiB明確保護 |
| dist Build | 0.63 | 正式受測／RC恢復或歷史工作區產物，未確認可退役，不刪 |
| Node20解壓runtime | 0.08 | 可重下載但仍為匹配CI的驗證環境，保留 |
| 非共用可重建cache | 0.00 | 未找到其他符合本輪自主刪除條件的項目 |
| 共用依賴／內部cache | 3.58 | 禁止自行清理；連結後方未全掃，不是全域總量 |
| 原始證據／review | 52.11 | 原Heap／Replay／Profile等不可重建資料保護，不列直接清理 |
| 原始碼／其他 | 5.49 | 原碼、歷史版本與其他工具保護 |

Profile＋Build＋runtime合計約2.64GiB僅供未來逐項審核，不含共用cache與大型證據；與下方整個Worktree容量重疊，不能相加。

優先C槽的下一批建議：

1. **先審核cs-beta-baseline-20261108**：約0.43GiB，沒有可見WIP，HEAD3e615157已在主幹／舊main備份；仍需確認ignored證據、外部引用與Owner不再需要，才可另外核准移除。
2. **再審核四個舊Temp esmo-cdp Profile**：合計約392.50MiB；目前沒有對應使用中程序，但可能有獨有存檔／失敗證據，必須先核對／封存、由Owner逐項核准。R4四Profile不含在此提案。
3. cs-map-v2-checkpoint-20261107約0.42GiB，沒有可見WIP，但未見包含HEAD5fc2463b的origin追蹤ref；先獨立備份該歷史版本與ignored資料，再談退役，不能假設R4分支已涵蓋全部歷史。
4. 原cs-foundry-circuit約10.06GiB含34WIP與5187／5188／5197現役預覽；RC工作區約1.79GiB含5207現役預覽與必要證據。全部保持，不停止服務或刪包；若Owner日後要退役，先指定哪個服務／版本可以結束。
5. 大型Heap／Replay如需移出，先經Owner核准，封存到真正獨立磁碟並核對SHA；D與C同顆SSD，不足以作獨立復原副本。

舊Temp Profile明細：

| 配置MiB | 路徑 |
|---:|---|
| 67.65 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-44ldfr` |
| 166.71 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-cXVJMI` |
| 141.49 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-m8cwme` |
| 16.65 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-wx6wQX` |

## 剩餘Worktree完整清單

**全部註冊110個未減少；CS相關52個全部保留。** 52個CS工作樹中，26個有追蹤修改或可見未追蹤路徑；26個可見status乾淨也不代表沒有ignored證據。以下為文件整理前的唯讀盤點，沒有改他人index或工作檔；目前封存工作區的最終文件HEAD另記Checkpoint。

配置數來自NTFS AllocationSize，掃描hardlink去重、不跟隨目錄連結；不是刪除授權，也不是保證回收量。52工作樹＋2個CS量測根目錄＋4個舊Temp Profile＋4個CPU取樣原證據，共62根目錄，錯誤0。沒有掃描私人Chrome資料內容。

| 配置GiB | Worktree | 盤點HEAD | 追蹤修改／未追蹤路徑數 | 保護與風險 |
|---:|---|---|---|---|
| 0.43 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-beta-baseline-20261108` | 3e615157 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 10.06 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-foundry-circuit` | a7398436 | 13／21 | 原34WIP＋5187／5188／5197現役預覽，保護 |
| 1.24 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-beta-release-20261108` | eb209b96 | 0／0 | 目前封存工作區、R4 Profile／正式受測Build，保護 |
| 0.42 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-checkpoint-20261107` | 5fc2463b | 0／0 | 僅本機Checkpoint，未見包含HEAD的origin追蹤ref；先備份才可審核 |
| 1.79 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107` | 67f46145 | 0／0 | RC／原始證據＋5207現役預覽，保護 |
| 0.55 | `D:/OneDrive/文件/GitHub/ESMO/.sprints/bp1-release` | 435f8c6d | 0／0 | CS／BP共用歷史發布工作區，保護 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/.sprints/codex-ui-migration-roster-profile-post-cs` | 6e074395 | 2／3 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/.sprints/codex-ui-migration-roster-profile-post-cs-final` | 4e69729c | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/club-identity-v2-cs-push-clean` | 1179e9f5 | 4／0 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-android-owner-review-v2` | cae4f9c3 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.17 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-android-owner-review-v3-release` | 53bc02d0 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.22 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-awp-slot-collapse-minimal-fix` | e86ace11 | 7／11 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-awp-slot-collapse-triage` | e86ace11 | 0／4 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c2c-character-art` | 2352a659 | 0／8 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c3-environment-slice` | aac1ac49 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c3-release` | 695fa0f8 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c4a-mirage-full` | 695fa0f8 | 6／4 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c4b-main-integration` | eeda2688 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c4b-two-map-environment` | eeda2688 | 5／2 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c5a-gunplay-impact` | 1883b330 | 0／6 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.22 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c5b-utility-fx` | a23362d1 | 0／2 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.22 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c5c-match-presentation-audio` | e86ace11 | 14／14 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c5v-map-selection-veto` | e86ace11 | 0／8 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.23 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c6a-product-closure-audit` | e86ace11 | 7／4 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.21 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c6b-full-match-simulation-audit` | e86ace11 | 6／7 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-c6c-long-match-progress-ux` | e86ace11 | 7／5 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-dashboard-release-integration` | 0d32f8da | 0／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-final-integration-candidate` | 511e79bb | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 23.81 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-fps-major-upgrade` | b4f8e0c3 | 0／35 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 1.08 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-major-release-v1-20261018` | b4f8e0c3 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 18.96 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-map-v2-ai` | 7f38e9e8 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-mr12-quick-finish-fix` | a9d38180 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-p0-final-integration` | 07a86c74 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-p1-camera-candidate` | 7eb136e9 | 5／3 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-residual-tactic-sync-p1` | ef9f50e1 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.16 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-td54-route-planner-perf` | 51aebeef | 0／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 1.59 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-v1.0.1-mobile-hotfix` | 898d0742 | 19／42 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-cs-integration` | f91509cb | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-cs-season` | 97de2296 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-c2b` | d72f2112 | 0／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs` | ca110e87 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-c2` | 32b2bc64 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-c2-forward` | 0f06298c | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.30 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-p0-baseline` | b065846f | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-p0-integration` | 68125dd3 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.08 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-p0-main-release` | dc520f1c | 6／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-p0-visibility` | 4f59c669 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |
| 0.28 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/cs-loading-v2` | 968526b3 | 1／0 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/cs-p0-flicker-isolation` | d72f2112 | 1／2 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/cs-p0-history-good` | ab627ecf | 0／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/cs-p0-main-preview` | a886e39d | 0／1 | 有修改／未追蹤路徑，先保存WIP，禁止自行移除 |
| 0.00 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/seasonstate-v2-runtime/cs-mr12` | 651fedd0 | 0／0 | 歷史Worktree，需Owner核准；clean不包含ignored證據 |

52處完整HEAD／分支／可見WIP／本機origin追蹤refs與逐類容量另存worktree-review.json；origin追蹤refs不是逐一遠端備份已確認的保證。全部110個原始工作樹清單、現役程序與port、before／after容量、清理及保全logs保存在C:\Users\ifikn\esmo-measure\cs-beta-archive-cleanup-20261108。

## 結案與交接

CS桌機Beta已結案，未開始新功能或下一Sprint。Android／低RAM／熱降頻NOT_RUN，CPU4×FAIL、Replay2118MiB峰值、自然容量3/4與既有歷史技術債保留。TD-DEPLOY-1～4仍OPEN，本輪沒有新部署耗時可填。原R4正式驗收報告不覆寫；本輪文件與必要交接另作本機Checkpoint及獨立分支封存，最終SHA／push回讀／正式站核對見final-checkpoint.json。完成後停Owner Review，剩餘清理等待Owner逐項核准。
