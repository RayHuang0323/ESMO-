# CS Beta R4 正式驗收後：C／D安全清理提案

2026-11-08，正式站38/38與最後29組assert通過後才執行只讀盤點。**沒有刪除、移動或移除任何既有證據、Profile、Worktree或共用依賴；本輪4個新Profile亦保留。以下全部是未核准執行的提案。**

| 槽 | 總容量GiB | 可用GiB | 本次範圍配置GiB | 未來條件式候選GiB |
|---|---:|---:|---:|---:|
| C | 200.00 | 8.05 | 14.52 | 1.38 |
| D | 275.69 | 13.36 | 49.33 | 1.30 |

取樣時間2026-11-07T22:10:37.5223165Z；C、D位於同一顆Disk0 NVMe SSD，D不算獨立實體備份。空間會隨系統使用變動。

範圍52個CS相關註冊工作樹（路徑或分支名辨識），加measure及4個既有臨時Profile根目錄，共57根目錄；本輪4個新Profile位於發布工作樹內，已隨該根計入。第一輪只按路徑匹配50工作樹，未含分支為CS但路徑為bp1-release／codex-c2b的兩處；第二輪補分支條件、重新完整盤點52處，原50處盤點保留，不混加或重複計算。

以NTFS AllocationSize記配置大小，hardlink全掃描依volume/file ID去重，不跟隨目錄reparse point、不重複計入巢狀註冊worktree，只開read-attributes handle，不讀取檔案內容；錯誤0。跳過連結清單與完整逐項紀錄保留，不能把範圍視為整顆C／D或連結後方共用目錄全部。最終邏輯80.24 GiB、配置63.85 GiB。

## 保護與未來候選

| 分類 | 配置GiB | 建議 |
|---|---:|---|
| 原始證據／review | 52.10 | 保護，含R3 FAIL、R4影片／Network／Console、Heap、Replay；不直接清理 |
| 原始碼／其他 | 5.49 | 保護，包含未提交成果與原34WIP |
| 全部測試Chrome Profile | 1.93 | 暫不刪；未來逐一核對用途、證據保存及無在用程序，另經Owner核准 |
| 其中本輪4個新Profile | 0.49 | 明確保護，為本次重現／補證資料，不列立即清理 |
| 可重建dist | 0.63 | 未來保留正式7cf受測Build後，再審核舊包；不可直接處理他人工作樹 |
| 本輪可重下載Node20工具／zip | 0.11 | 最後順位，先保留匹配CI的驗證環境、官方版本與SHA |
| 共用依賴／快取 | 3.58 | 不刪，不把共用node_modules或在用cache當安全候選 |

候選上限約 **2.67 GiB**，包含所有測試Profile、dist與可重下載工具；其中本輪Profile約0.49 GiB需保留，排除後舊候選約2.18 GiB。**目前保證立即可安全刪除容量仍為0；未得到刪除授權。** 取樣未見esmo-cdp活動程序，不等於日後可直接刪除；本輪Chrome確實已關閉、Profile目錄仍存在。

建議順序：先核對舊測試Profile是否純測試且無獨有存檔／證據；其次確認舊dist可重建且沒有preview引用；最後才考慮portable下載。所有項目都需另行核准，執行前重查使用中程序與實際路徑。大型證據若將來要搬離，先封存到真正獨立磁碟、核驗備份，不能把同SSD的D槽當獨立復原副本。

## 候選明細（本輪均保留）

| 配置MiB | 類別 | 路徑 |
|---:|---|---|
| 186.2 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-TgVJJz` |
| 166.7 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-cXVJMI` |
| 141.6 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-wZpgG9` |
| 141.5 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-m8cwme` |
| 132.8 | 本輪Profile：保護 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\review\browser-profiles\esmo-cdp-8hMPuD` |
| 130.1 | 本輪Profile：保護 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\review\browser-profiles\esmo-cdp-aSa5l3` |
| 129.2 | BUILD_OUTPUT_REVIEW | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\dist` |
| 129.2 | BUILD_OUTPUT_REVIEW | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-integration-20261107\dist` |
| 128.7 | BUILD_OUTPUT_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\.sprints\bp1-release\dist` |
| 128.6 | BUILD_OUTPUT_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-major-release-v1-20261018\dist` |
| 128.0 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-zufiD2` |
| 128.0 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-0k1yDl` |
| 127.5 | BUILD_OUTPUT_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\dist` |
| 124.7 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-foundry-circuit\review\browser-profiles\esmo-cdp-xymubR` |
| 123.0 | 本輪Profile：保護 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\review\browser-profiles\esmo-cdp-STbpLP` |
| 121.0 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-7ZGkb7` |
| 120.7 | 本輪Profile：保護 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108\review\browser-profiles\esmo-cdp-UOAEgD` |
| 119.1 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-W3oPNl` |
| 112.7 | PORTABLE_TOOL_REDOWNLOAD_REVIEW | `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108` |
| 67.7 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-44ldfr` |
| 64.9 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-7OpN5Y` |
| 25.5 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-3vROGT` |
| 19.2 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-Dmqrpr` |
| 16.7 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\AppData\Local\Temp\esmo-cdp-wx6wQX` |
| 14.5 | TEST_PROFILE_REVIEW | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-foundry-circuit\review\browser-profiles\esmo-cdp-WUzbgx` |
| 8.0 | TEST_PROFILE_REVIEW | `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\review\browser-profiles\esmo-cdp-1mk6OD` |

portable分類Path顯示measure根目錄，但只計該根內portable-node20及下載zip，不能整個measure刪除。

## 大型Worktree（保護，不列安全移除）

| 配置GiB | 路徑 |
|---:|---|
| 23.81 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-fps-major-upgrade` |
| 18.96 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-map-v2-ai` |
| 10.06 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-foundry-circuit` |
| 1.79 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107` |
| 1.59 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-v1.0.1-mobile-hotfix` |
| 1.24 | `C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-beta-release-20261108` |
| 1.08 | `D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-major-release-v1-20261018` |
| 0.55 | `D:/OneDrive/文件/GitHub/ESMO/.sprints/bp1-release` |

不能只憑HEAD較舊或已在main祖先就移除工作樹；還需審核未提交／未追蹤成果、證據、分支備份、現役服務與外部引用。原CS34WIP、RC、Claude／MOBA與發布工作區不動。本輪沒有進行這類刪除或移除。

完整結果：C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r4\inventory-complete\disk-inventory.json，連同script／stdout／stderr／exit保存。
