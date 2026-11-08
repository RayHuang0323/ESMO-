# D 槽 CS 大型工作區：分層封存與退役方案

2026-11-08，**只讀提案／尚未執行封存、搬移或刪除**。配合第二批 C 槽受控清理，不是新增 CS 開發 Sprint。

## 真實容量及來源狀態

| 精確根路徑（D:\OneDrive\文件\GitHub\ESMO\worktrees 下） | HEAD | 追蹤修改／未追蹤 | 配置 GiB（根內 file ID 去重） |
|---|---|---:|---:|
| cs-fps-major-upgrade | b4f8e0c367ef8678df23c125f97df41372e0c02e | 0／35 | 23.814 |
| cs-map-v2-ai | 7f38e9e80450930c9fe8a96d483d2e5909a2d802 | 0／0 | 18.959 |

兩根聯集唯一 file ID 配置 **42.773 GiB**。所有路徑 logical bytes 合計 **58.081 GiB**，包含 hardlink 別名，不能直接當物理回收量。掃描不跟隨 directory junction，按 NTFS file ID／AllocationSize／link count 去重，沒有掃描錯誤；這兩根都無巢狀註冊 Worktree。各分類以保護優先級分配 file ID，只計一次；不能把各根重疊子分類重新相加。

`cs-fps-major-upgrade` HEAD 已被 origin tracking refs 包含，但 35 份未追蹤 review 工具仍須獨立封存（約 148,283 logical bytes／221,408 配置 bytes）。完整精確路徑在本機 d-layer-analysis.json；包括 `review/cs-major-upgrade/tools/complete_owner4c_review.mjs`、`run_owner4h_final_browser_r2.mjs`、`verify_owner4f_pixels.mjs`，不得當 probe 雜物直接刪除。

`cs-map-v2-ai` 相對目前 origin tracking refs 有 **6 個本機獨有歷史 Commit**：7f38e9e8、f94f4658、8a29596a、e60d7bc6、898d0742、d474f86e。這是相對已取得 refs 的可達性判斷，不能推論每個遠端都無副本；也不能用較新的 R4 archive 分支就宣稱完整封存此分支。退役前須正常建立專用遠端 source 分支或獨立 Git bundle，核驗六個物件與祖先皆可恢復。

## 分層與真實可回收範圍

| 分層（兩根聯集，不重複） | 配置 GiB | 處置 |
|---|---:|---|
| 已追蹤原始碼／素材／文件 | 0.812 | 先獨立封存與恢復核驗，未准刪 |
| 用途仍不明，保留 | 0.066 | 先獨立封存與恢復核驗，未准刪 |
| 根 dist 可重建候選（未核實） | 0.125 | 須先證明重建／證據用途，未准刪 |
| Replay／Heap／影片等直接辨識證據 | 3.864 | 先獨立封存與恢復核驗，未准刪 |
| 共用依賴 | 0.283 | 必留現役 |
| 共用 host 內混合 Profile／cache | 3.301 | 必留現役 |
| 工作區內測試 Profile | 0.916 | 先獨立封存與恢復核驗，未准刪 |
| 其他歷史證據／JSON／log | 11.955 | 先獨立封存與恢復核驗，未准刪 |
| 歷史 Build 路徑候選（未核實） | 21.451 | 須先證明重建／證據用途，未准刪 |
| 35 份未追蹤工具 WIP | 0.000 | 先獨立封存與恢復核驗，未准刪 |

共用 host 合計 **3.584 GiB** 必留；其中 `.cache/esmo-fl-*` 等混有歷史 Chrome Profile，不是保證可重下載的快取。現役工作樹仍透過 alias 使用 host。即使退役 fps 工作樹，也不能刪掉整個根的 node_modules。

目前立刻可安全回收 **0 GiB**。只有完整獨立備份與核驗、解除現役引用、Owner 另批核准後，非共用、全部 hardlinks 已在這兩根內的配置理論上限 **39.188 GiB**。此上限包含不可重建證據與原始碼，**不是可直接刪除清單**。Build 路徑候選上限 **21.576 GiB** 為其中一部分；單憑 profile-builds／pristine／preview／diagnostic 名稱不足以證明可重建，也可能保留唯一的舊受測 bundle、素材或 sourcemap。沒有逐 Build 的 source SHA、lockfile、Node／環境、建置命令及輸出 SHA 核驗前，全部保留。

直接保護例子：fps 的 `review/cs-major-upgrade/assets-source/owner4g-audio/Prepared-SFX-Library.7z`（授權來源及素材）、`review/cs-major-upgrade/evidence/retention-policy-20261011/c-runtime-simulation.json`、`owner4h-review-20261018` 下 runtime 原件；ai 的 `review/cs-major-upgrade/evidence/tactical-network-20261020/scene-r1/actual-saved.replay.json`。不能因正式 Beta 已發布就刪掉舊失敗與 Before 證據。

## 建議獨立備份規格與步驟（待 Owner 核准）

1. 目標選**獨立外接硬碟**或有版本保留及完整下載能力的**私人可靠雲端**。現有 C／D 同屬 Disk 0，D 的另一個資料夾不算獨立備份；OneDrive 資料夾名稱也不證明雲端完整上傳與可恢復。勿將 Replay／Heap／Profile 或個資上傳公開 GitHub。
2. 容量先按所有路徑 logical **58.081 GiB** 保守準備，因工具不一定保留 hardlink；再加 Git bundle、manifest、恢復工作空間及至少三成餘裕，總體建議至少 **100 GiB 可用**，實際以完成清單重新核算。不要承諾壓縮率，也不要把雲端配額當已下載可恢復副本。
3. 第一層先封存 Git refs／提交：來源分支與六個 local-only commit，或 `git bundle create` 精確 refs；`git bundle verify` 後，在備份端驗證 commit/tree 物件可讀。與原 34 WIP recovery 分開保護。已追蹤 patch、35 未追蹤工具、其他 ignored 重要檔要列出獨立清單；Git bundle 不包含 WIP／ignored 證據。
4. 第二層按原 run／seed／source SHA／工具版本封存 Replay、Heap、Allocation、trace、影片、Console、Network、原始 FAIL、recovery manifest 及必要 Profile；保留 Unicode 路徑、mtime、檔案大小、hardlink 群組與 junction 目標清單，不跟隨 alias 複製現役目標。加密保管含存檔的 Profile；Chrome／DPAPI 可能綁 Windows 使用者與 Chrome 版本，須記錄恢復限制，不解密或輸出憑證。
5. 第三層才驗證可重建產物：每個 Build 補齊 source tree SHA／lockfile／Node／環境與命令，用獨立 staging 恢復建置並比對關鍵 bundle、素材 SHA；無法重建者升級為必要證據。不要為了省空間刪掉唯一受測輸出。這一步不在本輪執行。
6. 在來源與目的端分別逐檔 SHA-256，比對 path／bytes／SHA manifest；雲端需完整下載或讀回核驗，ETag、檔案數、同步圖示不能代替 SHA。保存 manifest 自身 SHA，抽樣恢復大 Heap、三圖 Replay 及完整一次驗證資料夾；確認原始檔仍可解析、必要的 Replay 可用保存幀播放。metadata-only scan 不是 payload 備份；本輪尚未對整批 58 GiB 讀值或製作獨立副本。
7. 等 Owner 核准清單、備份驗證與恢復報告後，才分批退役。不得 /MIR、force、reset、prune 或刪證據；每批記錄精確路徑、前後容量、程序引用與剩餘 refs。歷史 Worktree 最後才用正常 `git worktree remove`；ignored 重要資料未處置時不可硬移除。

## 分別的退役阻擋與建議順序

- **先處理 ai 的 source 安全備份**：0 WIP 不等於可刪，整根約 18.959 GiB 包含追蹤素材與大量 ignored 證據；六個 Commit 及必要檔案尚需可靠封存，核對程序、外部引用及還原後才考慮退役。
- **再做 Build 候選逐 run 核驗**：上限 21.576 GiB 包含於 39.188 GiB，優先挑來源／命令最完整的一小批，並保留正式 7cf 與 R4 所依賴 Build。此處只提出順序，沒有執行額外清理。
- **fps 最後**：35 WIP 封存完仍有共用 node_modules host 依賴。若要完整退休根路徑，需另外授權共用依賴搬遷及所有 alias 重新接線，會涉及其他現役工作樹，必須獨立安排與最小 CS／MOBA／BP-9 回歸；本輪不執行。也可以先保留該根及 host，只在 Owner 核准後處理已封存的歷史資料子目錄。
- **四個 C Temp Profile**：先完成存檔／session 私人獨立備份與用途確認，再逐項審核；目前 392.50 MiB 不計為安全回收承諾。

完成本輪後保持 Owner Review，不自行開始封存傳輸、共用依賴遷移或下一輪刪除。產品及已發布 7cf1cebc 不變。

原始清單與容量證據：`C:\Users\ifikn\esmo-measure\cs-beta-controlled-cleanup-r2-20261108\d-layer-analysis.json`、before-final-*-metadata.json.gz、scan-before-final-summary.json。SHA 核驗方案尚待執行，不能誤寫為已完成。
