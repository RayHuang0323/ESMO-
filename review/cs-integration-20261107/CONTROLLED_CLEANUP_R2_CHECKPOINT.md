# CS 桌機 Beta 受控清理 R2 Checkpoint

2026-11-08；基於文件 4fbfaf6c，正式產品仍 7cf1cebc10915f096a256885388ecd8a7052e5f3。

- 只以無 --force 的正常 Git remove 移除核准 cs-beta-baseline-20261108；其 HEAD 3e615157 已獨立遠端備份且逐追蹤檔 byte 核驗。
- C 槽可歸因配置釋放 457,993,032 bytes／436.78 MiB；D 僅該工作樹私有 Git metadata 446,776 bytes／0.43 MiB。兩個大型 D 工作區釋放 0。
- 四個精確核准 Temp Profile 全部 SKIP；m8cwme 含實際 ESMO 存檔，另外三個 session／WebApp 必要性與獨立備份仍不明，未強刪。
- 剩餘 109 個註冊 Worktree，CS 相關 51；原 34 WIP／recovery、1,009 份證據、三圖 Replay、R4 Profile、共用依賴與其他工作樹保護核驗完整。
- D 封存方案僅提案：42.773 GiB 實體配置，3.584 GiB 共用必留；39.188 GiB 為備份恢復核驗及 Owner 核准後理論上限（含 21.576 GiB 尚未核實 Build 候選），不是目前可刪量。
- 最終本機文件 commit／tag、獨立 archive 分支回讀、C／D 最終可用容量與逐檔證據 index 見 `C:\Users\ifikn\esmo-measure\cs-beta-controlled-cleanup-r2-20261108\final-checkpoint.json`。本文件不自我寫死包含自身的 commit SHA。
- 桌機 Beta 已結案 CONDITIONAL GO；Android／低 RAM／熱降頻 NOT_RUN、CPU4× FAIL、2118 MiB 峰值與自然容量 3/4 覆蓋缺口維持。沒有新的產品 Gate 或部署。
- 沿用既有獨立封存分支 archive/cs-map-v2-beta-r4-20261108 備份必要 Markdown 交接，正常非 force；不 Push main，不上傳大型原始資料。最終結果以遠端回讀收據為準。

[清理完整報告](CONTROLLED_CLEANUP_R2_20261108.md) · [D 分層封存／退役提案](D_WORKSPACE_ARCHIVE_PLAN_20261108.md) · [R4 驗收](BETA_RELEASE_R4_REVIEW.md)

停止點：Owner Review；下一輪須先核准獨立儲存目的與具體清單，不能直接刪剩餘 Profile、D 證據、共用 host 或其他現役工作區。
