# CS桌機Beta結案：封存／清理Checkpoint

2026-11-08。**ARCHIVED_DESKTOP_BETA_CONDITIONAL_GO**，沒有CS功能開發。

- 正式部署：7cf1cebc10915f096a256885388ecd8a7052e5f3；https://rayhuang0323.github.io/ESMO-/ 。
- R4固定文件版本：eb209b967165cb14ce3216ac2b3ef35d2480c208，已Push至archive/cs-map-v2-beta-r4-20261108及checkpoint/cs-beta-release-20261108-r4-desktop-verified；不是Push main。
- 本輪沿既有release/cs-map-v2-beta-20261108工作區保存清理文件；最終commit、tag checkpoint/cs-beta-archive-cleanup-20261108與獨立分支回讀見C:\Users\ifikn\esmo-measure\cs-beta-archive-cleanup-20261108\final-checkpoint.json。
- 只刪C槽Node20下載ZIP1檔，配置30,285,824 bytes（28.88MiB）；D槽0。Node20解壓runtime、官方SHA與下載紀錄留存，恢復工具在同量測目錄restore-node20-archive.mjs。
- 失敗預檢／未實際執行刪除的首次execute與WindowsPS5.1編碼根因均保留；UTF8 BOM＋AST單檔守門後才完成正常刪除。無Force／遞迴。
- 成功後1009份證據、34WIP與備份、3個Replay Fixture、4個R4 Profile完整；src／public／Repo tools／套件／workflow不變，沒有大型測試或新產品Gate。
- Worktree保留110個（CS52），沒有prune／gc／reset／clean；4個舊預覽port5187／5188／5197／5207仍在使用，未停服務。
- 剩餘資料未刪。下一批只建議Owner審核C槽基線Worktree約0.43GiB與4個舊Temp Profile約392.50MiB；必要證據／WIP／共用依賴／正式Chrome／Claude／MOBA／BP-9與備份不動。
- [完整封存清理報告](ARCHIVE_CLEANUP_REVIEW_20261108.md)、原[R4驗收報告](BETA_RELEASE_R4_REVIEW.md)與[驗收清單](BETA_RELEASE_R4_ACCEPTANCE.md)保留。

桌機Beta保持CONDITIONAL GO，Android／低RAM／熱降頻未認證，CPU4×FAIL與2118MiB風險不關閉。封存commit不是新的正式發布版本；不Push main、不Deploy。完成後停Owner Review。
