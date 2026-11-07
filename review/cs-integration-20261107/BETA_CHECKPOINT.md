# 公開測試版準備 Checkpoint

> 2026-11-08 R2最新停點：**HOLD／BLOCKED**。Claude9afe58b2已交付整合，候選7cf1cebc已實測；補充Replay Smoke工具漏開面板，最後assert exit2。沒有Push main／部署。先讀 [BETA_RELEASE_R2_CHECKPOINT.md](BETA_RELEASE_R2_CHECKPOINT.md) 與 [R2完整報告](BETA_RELEASE_R2_REVIEW.md)。以下WAITING是前輪歷史。

2026-11-08，**WAITING_RELEASE_GATE_HANDOFF**。

- 產品 Checkpoint：`db97d1026e4ec172df3c267eb8e9520272f2ddd4`；分支 `release/cs-map-v2-beta-20261108`。
- 發布工作區：`C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108`。
- 文件 Checkpoint：本文件所在提交；最終 SHA／tag／狀態保存在 `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\final-checkpoint.json`，避免文件自我引用 SHA。
- RC 與遠端備份：`67f46145`，`backup/cs-map-v2-rc-20261108`，遠端 RC tag `rc/cs-map-v2-20261108-hold-r1`。
- 本輪來源／原 WIP／回讀證據與四項短驗證見 [完整準備報告](BETA_RELEASE_PREPARATION.md)。大型證據只留本機，不入 Git。
- main pin：`3e615157`；Claude 三個未 Push 文件提交 `a0ec13a1`／`6fa61083`／`3cae571f` 皆是本候選祖先，原工作區保持不變。
- Build native 0；Shader 14/14、RAF 7/7。這是準備檢查，不是最後整合 Release Gate。
- 原 34 WIP 與 RC 保留；未 reset／clean／刪除，也未影響 Claude／MOBA 或 BP-9 工作區。
- 額外唯讀基線工作區 `cs-beta-baseline-20261108` 已停止重複測試並保留；**不得當作 Claude 修復基線，不再新增工作樹**。
- 沒有 Push main、Merge main、Deploy；沒有新版部署 SHA，沒有部署後驗收／磁碟清理。

恢復時先讀 Owner 最新指示與 Claude 正式交接 SHA、驗證指令、結果，再重新 fetch／比對差異，於既有發布工作區處理。最後 Gate 前不要宣稱新版本 CS／MOBA／BP-9 全綠。若 Claude 尚未交付，維持本停點，不背景續跑、不重做產品。
