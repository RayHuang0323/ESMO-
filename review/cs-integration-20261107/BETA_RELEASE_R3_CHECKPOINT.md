# CS Beta R3 Checkpoint：已部署／正式站 FAIL

2026-11-08。**DEPLOYED_SMOKE_FAIL_HOLD**。Actions成功，正式站補充CS Replay Gate失敗；停止後續修改、重測、Push、部署及回退，沒有豁免失敗。

- 正式站／受測來源：`7cf1cebc10915f096a256885388ecd8a7052e5f3`。
- 正式網址：https://rayhuang0323.github.io/ESMO-/ 。[Actions42413502348成功](https://github.com/RayHuang0323/ESMO-/actions/runs/42413502348)。
- 起點9c5747d0與R2 HARNESS_FAIL保留；本輪只修Git外Smoke原生details前置，產品與Repo工具未變。
- 部署前21組assert PASS；正式站三圖各48/48、MOBA90/90、B1B43/43、B1C38/38、B1D27/27；補充Replay PRODUCT_FAIL 5/6，正式站29組assert FAIL exit1。
- 新阻擋TD-GATE-CS-02：Confluence seek至12後播放1.2秒仍12，截圖黑canvas；載入就緒前置與產品播放根因尚未區分。正式站原生返回／卸載及其後步驟NOT_RUN，不冒充PASS。
- 原details前置TD-GATE-CS-01：本機三圖25/25通過，舊失敗仍保留。
- 既有發布工作區：`C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108`；既有本機分支`release/cs-map-v2-beta-20261108`只保存後續文件，不Push、不觸發第二次部署。
- 本機來源tag：`checkpoint/cs-beta-release-20261108-r3-production-fail-source` →7cf1cebc；文件完成tag：`checkpoint/cs-beta-release-20261108-r3-deployed-smoke-fail`。
- 精確文件Checkpoint、遠端refs回讀、34WIP完整性與最終文件清單：`C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r3\final-checkpoint.json`。文件HEAD不是重新通過產品Gate的SHA。
- 原main備份：遠端`backup/main-before-cs-map-v2-beta-20261108` → `3e61515747bd786b01317ff68eecc7e908c8479d`；Beta tag→7cf1cebc；RC備份→67f46145。
- [完整發布／失敗報告](BETA_RELEASE_R3_REVIEW.md)、[驗收清單](BETA_RELEASE_R3_ACCEPTANCE.md)、[只讀清理提案](CS_DISK_CLEANUP_REVIEW_20261108.md)。原始logs／receipts／截圖均在上述release-r3；R2與Git common receipts不刪。
- 未修改其他worktree，原34WIP、CS、Claude／MOBA、BP-9及三份文件祖先保留；沒有新增worktree或清理資料。

下一步只交Owner Review。若後續獲准，先釐清真實UI載入就緒再驗播放／返回／卸載；保留FAIL、不降門檻、不拿別的SHA充數。目前公開版未回退，回復方式見完整報告。Android／低RAM／熱降頻NOT_RUN，CPU4×FAIL及2118MiB風險不關閉。
