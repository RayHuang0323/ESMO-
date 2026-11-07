# CS 只讀磁碟盤點與清理審核提案

2026-11-08，取樣時間 2026-11-07T21:19:23.3028930Z。**本次盤點沒有刪除、移動或移除任何既有Worktree／Profile／快取。所有容量只是後續人工審核參考，不是授權立即清理。**

## C／D實際容量

| 槽 | 總容量GiB | 可用GiB | 本次範圍配置GiB | 條件式候選GiB |
|---|---:|---:|---:|---:|
| C | 200.00 | 8.63 | 13.94 | 0.88 |
| D | 275.69 | 13.36 | 49.33 | 1.30 |

Get-Partition／Get-Disk確認C、D都是Disk0（SAMSUNG MZALQ512HBLU-00BL2，NVMe）的不同分割區；D不是獨立實體備份磁碟。可用量會隨系統變動，不等同保證可用空間。

## 取樣方法與範圍

52個CS相關註冊Worktree，加本輪esmo-measure與4個既有esmo-cdp臨時Profile，共57個根目錄。以NTFS FILE_STANDARD_INFO AllocationSize取得實際配置大小，同時記錄邏輯大小；hardlink依磁碟與file ID去重，不跟隨目錄reparse point、不重複計入巢狀註冊Worktree。只開read-attributes handle，不讀檔案內容，不觸發內容校驗或刪除。掃描錯誤0；連結跳過清單保留於disk-inventory.json，因此不宣稱已盤點整個C／D或連結背後的共用資料。

本範圍邏輯 79.66 GiB、配置 63.27 GiB。OneDrive／NTFS壓縮／稀疏檔會令兩者不同，以配置大小估容量；刪除後的系統實際回收量仍可能受硬連結及服務影響。第一次Get-Volume未辨識C槽而失敗，原logs保留；第二次先存掃描結果，改用System.IO.DriveInfo取得檔案系統容量，metadata盤點exit0。沒有因此改測試Gate或產品。

## 分類與保護

| 分類 | 配置GiB | 處置 |
|---|---:|---|
| 原始證據／review | 52.02 | 保護，不列直接清理；失敗logs、Heap、Replay與診斷證據不可因體積大就刪 |
| 原始碼／其他 | 5.49 | 保護，含分支／WIP／工具，不能用容量判定過期 |
| Chrome測試Profile | 1.44 | 先逐一核對無使用者資料、無在用程序且證據已保存，才可另行核准清理 |
| dist Build | 0.63 | 可重建，但本輪公開站失敗診斷仍需留本機受測包；結案後再審核 |
| 本輪portable工具／下載 | 0.11 | 可重新下載，先保留官方版本／SHA及Node20回歸能力，最後處理 |
| 共用依賴 | 0.25 | 不刪；node_modules連結大多未跟隨，不把此數當全部共用依賴 |
| 共用node_modules內快取 | 3.33 | 不列安全候選；可能被其他Worktree／工具使用，須跨工作區協調 |

條件式候選上限 **2.18 GiB**＝測試Profile＋dist＋本輪可重下工具；**目前沒有保證立即可安全回收的容量**。取樣未見帶esmo-cdp user-data-dir的活動程序，這只代表當時快照，實際清理前仍須重查；不涵蓋私人Chrome Profile。未把3.33 GiB共用快取加進候選。

## 候選明細（全部尚未刪除）

| 分類 | 配置MiB | 路徑 |
|---|---:|---|
| TEST_PROFILE_REVIEW | 186.2 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-TgVJJz` |
| TEST_PROFILE_REVIEW | 166.7 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-cXVJMI` |
| TEST_PROFILE_REVIEW | 141.6 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-wZpgG9` |
| TEST_PROFILE_REVIEW | 141.5 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-m8cwme` |
| BUILD_OUTPUT_REVIEW | 129.2 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\dist` |
| BUILD_OUTPUT_REVIEW | 129.2 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-integration-20261107\dist` |
| BUILD_OUTPUT_REVIEW | 128.7 | `D:\OneDrive\文件\GitHub\ESMO\.sprints\bp1-release\dist` |
| BUILD_OUTPUT_REVIEW | 128.6 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-major-release-v1-20261018\dist` |
| TEST_PROFILE_REVIEW | 128.0 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-zufiD2` |
| TEST_PROFILE_REVIEW | 128.0 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-0k1yDl` |
| BUILD_OUTPUT_REVIEW | 127.5 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\dist` |
| TEST_PROFILE_REVIEW | 124.7 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-foundry-circuit\review\browser-profiles\esmo-cdp-xymubR` |
| TEST_PROFILE_REVIEW | 121.0 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-7ZGkb7` |
| TEST_PROFILE_REVIEW | 119.1 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-W3oPNl` |
| PORTABLE_TOOL_REDOWNLOAD_REVIEW | 112.7 | `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108` |
| TEST_PROFILE_REVIEW | 67.7 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-44ldfr` |
| TEST_PROFILE_REVIEW | 64.9 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-7OpN5Y` |
| TEST_PROFILE_REVIEW | 25.5 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-3vROGT` |
| TEST_PROFILE_REVIEW | 19.2 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-Dmqrpr` |
| TEST_PROFILE_REVIEW | 16.7 | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-wx6wQX` |
| TEST_PROFILE_REVIEW | 14.5 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-foundry-circuit\review\browser-profiles\esmo-cdp-WUzbgx` |
| TEST_PROFILE_REVIEW | 8.0 | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-1mk6OD` |

portable分類的Path是measure根目錄，但只計入該根下本輪portable-node20／下載zip，不代表整個measure都可刪；原logs／報告／失敗截圖必須保留。原CS工作樹下Profile也不是授權改動該Worktree，仍需Owner明確清理決定。

## 大型Worktree（保護，不列安全移除）

| 配置GiB | Worktree |
|---:|---|
| 23.81 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-fps-major-upgrade` |
| 18.96 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-map-v2-ai` |
| 10.06 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-foundry-circuit` |
| 1.79 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107` |
| 1.59 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-v1.0.1-mobile-hotfix` |
| 1.08 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-major-release-v1-20261018` |
| 0.75 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-beta-release-20261108` |
| 0.55 | `D:/OneDrive/文件/GitHub/ESMO/.sprints/bp1-release` |
| 0.43 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-beta-baseline-20261108` |
| 0.42 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-checkpoint-20261107` |
| 0.30 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/codex-cs-p0-baseline` |
| 0.28 | `D:/OneDrive/文件/GitHub/ESMO-worktrees/cs-loading-v2` |

單靠HEAD在main之前不能認定整個Worktree可刪，還要核對未提交／未追蹤成果、分支與tag是否備份、在用服務、外部引用及Owner用途。原34WIP所在cs-foundry-circuit、RC與發布工作區、Claude／MOBA及共用依賴明確保護；本輪不移除任何註冊工作樹。大型證據可在未來另行核准後先封存到真正獨立磁碟並核驗備份，不能以同顆SSD的D分割區當獨立備份。

原始完整52個工作樹HEAD／branch與57根目錄逐項配置：`C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r3\disk-inventory.json`；腳本inventory-r2.ps1、首輪失敗與第二輪完整stdout／stderr／exit均保留。
