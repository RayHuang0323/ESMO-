# CS 桌機 Beta 第二批受控清理報告

2026-11-08；來源文件 Checkpoint **4fbfaf6c164e2cbf8e6a42b22380b58f8c88de12**。
狀態：**清理完成／部分項目安全跳過／停 Owner Review**。正式站仍 **7cf1cebc10915f096a256885388ecd8a7052e5f3**，桌機 Beta CONDITIONAL GO 已結案。

## 本輪實際成果

只移除 Owner 精確核准的 `C:\Users\ifikn\.codex\worktrees\ESMO\cs-beta-baseline-20261108`。使用正常 `git worktree remove -- <精確路徑>`，exit 0，未使用 --force。四個舊 Temp Profile 全部跳過，未刪其內任何檔案。沒有新增 Worktree、修改產品、Push main、Deploy、reset、clean、prune 或 gc。

| 範圍 | 可歸因的已移除檔案配置 | 該批操作前後可用容量差 | 說明 |
|---|---:|---:|---|
| C 槽核准基線 | 457,993,032 bytes（436.78 MiB／0.427 GiB） | +459,292,672 bytes（438.02 MiB） | 基線檔案已移除；不是忽略檔案的 junction 目標大小 |
| D 槽 | 446,776 bytes（0.43 MiB） | +450,560 bytes（0.43 MiB） | 僅 Git 正常移除該 Worktree 的私有管理檔；兩個大型 CS 工作區資料釋放 **0** |

操作前可用：C 10,339,332,096／D 14,339,579,904 bytes；操作後：C 10,798,624,768／D 14,340,030,464 bytes。可用空間差含目錄／系統同時活動，不能把整個任務期間的磁碟波動全算清理成果。最終讀值另外保存 final-checkpoint.json。

## 基線逐項核驗與恢復

- Detached HEAD **3e61515747bd786b01317ff68eecc7e908c8479d**；遠端 `backup/main-before-cs-map-v2-beta-20261108` 精確回讀一致。沒有獨有 Commit、追蹤修改、未追蹤檔或私有未封存 refs；私有 reflog 僅此 HEAD。
- 3,861 個追蹤檔逐檔 Git blob SHA 與 HEAD byte 一致。原生目錄掃描除 `.git` 指標外沒有額外私有檔案。ignored 27,830 個路徑全部在共用 `node_modules` junction 下，並非此 C 工作區獨有資料。
- 共用目標為 `D:\OneDrive\文件\GitHub\ESMO\worktrees\cs-fps-major-upgrade\node_modules`。先確認父路徑及 junction 的精確目標，僅以非遞迴 Directory.Delete(alias, false) 解除本地 junction，再交正常 Git 移除；未讓遞迴刪除碰到 D 目標。
- 使用程序命令列及工作目錄檢查，44 個相關程序中目標引用 0，關鍵未知 0；刪除前重新取樣且逐檔排他讀取成功。沒有中止任何他人工序或預覽。
- 原始碼可由已封存的 3e615157 Git 物件／遠端分支恢復；必要時先取得 Owner 的新工作樹授權，再正常 `git worktree add --detach <新路徑> 3e61515747bd786b01317ff68eecc7e908c8479d` 並重新連接既有依賴。**本輪未新建工作樹，也未執行恢復。**

## 四個舊 Profile：核准不等於可刪，全部保留

精確共同上層為 `C:\Users\ifikn\AppData\Local\Temp`；只審核以下四個名稱，未擴大範圍。

| 名稱 | 配置 MiB | 結果 | 保留原因 |
|---|---:|---|---|
| `esmo-cdp-44ldfr` | 67.65 | 保留／未刪除 | 未見 ESMO 持久存檔，但加密 Sessions／WebApp 資源的用途與獨立備份未確認 |
| `esmo-cdp-cXVJMI` | 166.71 | 保留／未刪除 | 未見 ESMO 持久存檔，但加密 Sessions／WebApp 資源的用途與獨立備份未確認 |
| `esmo-cdp-m8cwme` | 141.49 | 保留／未刪除 | 含 ESMO profile／season／heroProgress，未找到已核驗獨立備份 |
| `esmo-cdp-wx6wQX` | 16.65 | 保留／未刪除 | 未見 ESMO 持久存檔，但加密 Sessions／WebApp 資源的用途與獨立備份未確認 |

合計 **392.50 MiB**，本輪回收 0。LevelDB WAL 以 record CRC／WriteBatch 只讀解析；SQLite 用 immutable/read-only 查詢，沒有啟動 Chrome、清除 localStorage、寫入存檔或輸出存檔值。`m8cwme` 可見 `esmo.profile.v1`、`esmo.season.v1`、`esmo.heroProgress.v2`；不因其被命名 Temp 就假定可重建。另三個並非確認含重要遊戲存檔，但 Sessions_Encrypted／Web Applications 資源仍有未確定性。即使無在用程序，也不符合本輪完整刪除前提。

四個 Profile 清理前後原生檔案 ID／大小／mtime／配置／link metadata manifest SHA 一致。這是未異動核驗，**不是獨立內容備份**，不得把 metadata hash 當整份 Profile 的封存完成證明。

## 保護核驗

- Git 共用 refs 在移除前後 byte 一致；最終只允許本輪文件 Checkpoint／獨立封存分支及標籤新增或前進，main 不動。
- 註冊 Worktree **110 → 109**；CS 相關 **52 → 51**。除核准基線外，其他工作樹 membership／HEAD 及所有依賴 alias 未變。
- 共用 node_modules **27,830** 個項目 metadata SHA 前後一致；Vite 5.4.21 可正常解析。未刪共用依賴或其 `.cache`。
- **1,009** 份 R2／R3／R4 證據逐一 SHA-256 一致；原 **34 WIP** 與獨立 recovery 副本、狀態逐檔一致；三圖正式 Replay fixture SHA 一致；R4 四個必要 Profile 仍保留。
- RC 67f46145 與 Claude 9afe58b2 工作區保持乾淨，原文件提交祖先保留。產品 src／public／tools／套件／workflow 與正式 7cf1cebc 無差異。未重跑大型矩陣，也不以文件 SHA 宣稱產品 Gate PASS。
- 現有預覽 5187／5188／5197／5207 及其他工作區服務不停止。正式站僅 HTTP 版本核驗，不重新開發或重新驗收功能。

## D 槽下一批

[分層封存與退役方案](D_WORKSPACE_ARCHIVE_PLAN_20261108.md)：兩根實際配置合計去重 **42.773 GiB**；必留共用依賴及混合 Profile cache **3.584 GiB**。只有完整獨立備份、逐 byte SHA 核驗、恢復抽測與 Owner 核准後，退役理論上限 **39.188 GiB**。其中歷史 Build 候選上限 **21.576 GiB** 尚未證明可重建，包含於前述上限，不能相加。目前確認立即可安全刪除的 D 大型資料仍為 **0**。

本輪兩個 D 根都沒有巢狀註冊 Worktree；先前路徑加總偏大源於 hardlink 多個名稱，不是多個實體副本。所有 raw scan／修正計數及原失敗診斷保留。

## 完整收據與邊界

本機證據根：`C:\Users\ifikn\esmo-measure\cs-beta-controlled-cleanup-r2-20261108`。
主要檔案：baseline-audit.json、removal-preparation.json、process-audit-predelete.json、profile-data-audit.json、scan-before-final-summary.json、scan-profiles-after-summary.json、removal-result.json、post-removal-verification.json、protected-final.json、d-layer-analysis.json、final-checkpoint.json、evidence-index.json。原始 stdout／stderr／exit 及 scoped process-reader 工具也保留本機，不上傳 GitHub。

Android／低 RAM／實際熱降頻仍 NOT_RUN／未認證，CPU4× FAIL、Replay 歷史 2118 MiB 峰值、自然容量 3/4 覆蓋缺口保留。正式站限桌機快速練習 opt-in；本輪清理不代表全面 Release Gate PASS。後續只等待 Owner 選擇獨立儲存位置及下一批具體授權，不自行搬移或刪除大型證據。
