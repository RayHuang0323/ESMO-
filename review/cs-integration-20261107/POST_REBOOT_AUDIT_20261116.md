# 2026-11-16 重開機後 Worktree 與 D 槽容量核對

狀態：唯讀範圍核對；本次核對依據的 CS 封存 checkpoint 為 40e1816c6959fe0771e60d54bc059de66da5bcaf；本輪文件將以本機 commit 保存交接更新。未掃描整個 D 槽、未執行封存／清理、未修改產品、未新增 Worktree、未刪除、未 Push、未 Deploy。

## 109 → 110 Worktree 差異

以 2026-11-08 的 post-removal-verification.json（109 筆）對照目前 git worktree list（110 筆），新增項目只有：

- 路徑：D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0
- 分支：feature/moba-tower-edge-v23
- HEAD：77780df3e4fe5dded402459d8455c20dec43bc88
- 建立時間：2026-11-10 14:38:21（本機時間）；最近工作目錄更新 2026-11-15。
- HEAD 提交由 RayHuang0323 撰寫，2026-11-15，主旨為 moba-sim.v24 candidate。該 checkout 的修改涉及 LogicEngine、MOBA match assembler、tactic arbitration、MOBA ruleset 與 v24 tactic execution，判定用途是現役 MOBA v24 候選開發，與 CS 封存無關。
- Git worktree metadata 不記錄建立命令由哪個 agent／工具執行，因此不能據此確認是 Claude 建立。核對時該 worktree 已有 6 個追蹤修改及 2 個未追蹤檔；本輪沒有更動它們。

## D 槽容量差異

- R2 最終收據記錄 D 槽可用 14,337,929,216 bytes（約 13.35 GiB）；本輪讀值 11,591,790,592 bytes（約 10.796 GiB），減少 2,746,138,624 bytes（約 2.558 GiB）。
- 只對新增的 moba-v21-sprint0 做目錄 metadata 枚舉，跳過 node_modules Junction：5,032 個檔案，邏輯大小 630,061,855 bytes（約 0.587 GiB）；其中 review 約 0.201 GiB、dist 約 0.125 GiB。Junction 指向既有 cs-fps-major-upgrade\node_modules，目標存在。
- 這個新工作區是可見的部分容量來源，但 0.587 GiB 是邏輯檔案總量，不是精確的實體可用空間變化；它不能單獨解釋 2.558 GiB 的差額。約 1.97 GiB 的差額尚未定位。本輪沒有對其他工作區或整個 D 槽做遞迴掃描，不能推定其餘空間的來源。

## 執行狀態與未完成事項

目前註冊 worktree 共 110 個；路徑皆存在，沒有 prunable 記錄。已移除的 cs-beta-baseline-20261108 仍不存在且未註冊。已抽核的預覽埠沒有 listener；沒有其他程序引用該已移除基線。AI worktree 的 node_modules Junction 目標可解析。

CS 桌機 Beta 文件封存、R2 清理及 C 槽基線移除仍依 40e1816c 收據完成。D 槽兩個大型 CS 工作區的獨立備份、逐檔 SHA 與恢復驗證尚未開始；42.773 GiB 大型資料仍在來源，立即安全回收量為 0。Replay／Heap／Build 全量內容完整性本輪未驗證。

停止點：Owner Review。下一步只在 Owner 指定真正獨立的備份目的地後，依 D_WORKSPACE_ARCHIVE_PLAN_20261108.md 分層封存與驗證。此報告與交接更新僅包含文件，將由本機文件 checkpoint commit 保存，不代表新的產品或 D 槽封存驗證。