# CS Beta R4 Checkpoint

2026-11-08。**CONDITIONAL_GO_DESKTOP_BETA_VERIFIED**。TD-GATE-CS-02已關閉；正式站產品不需Hotfix或回退。

- 已部署／已驗證／origin/main：7cf1cebc10915f096a256885388ecd8a7052e5f3。正式網址：https://rayhuang0323.github.io/ESMO-/ 。
- 起點文件SHA：1deb49cb299bbad027f426ecc3248426a23b489f；本輪沿用既有release/cs-map-v2-beta-20261108工作區，不新增Worktree。
- 根因：Smoke漏等UI地圖準備結束與Canvas可見；正式站原生play已開始，資源未ready，舊檢查提早失敗。原R3 FAIL保留；同頁ready後播放正常。
- 本機三圖原生Replay合計38/38、正式站三圖原生Replay合計38/38；播放、pause、返回同一原場、模擬不重啟、WebGL釋放、場景清空、Console／Network全部完成。
- 最後assert：29組PASS／exit0，target=actual=7cf1cebc；首頁及11JS逐byte相符；不跨SHA繼承PASS。
- 僅修Git外Smoke與證據工具，src／public／Repo tools／套件／workflow未改；本輪沒有Push／部署／回退。原34WIP與備份完整、Claude／MOBA與RC不改，4個新Profile均保留。
- 證據：C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r4；含Before／After影片、原影格、Console、Network、完整FAIL／PASS與29組assert logs。R3原始資料不覆寫。
- 文件Checkpoint與本機tag：checkpoint/cs-beta-release-20261108-r4-desktop-verified；精確SHA及證據雜湊見該證據目錄final-checkpoint.json。文件HEAD不是新的產品Gate PASS。
- [完整報告](BETA_RELEASE_R4_REVIEW.md)、[驗收清單](BETA_RELEASE_R4_ACCEPTANCE.md)、[安全清理方案](CS_DISK_CLEANUP_REVIEW_R4_20261108.md)。
- 發布前舊main3e615157的遠端備份及Beta tag→7cf1cebc、RC備份→67f46145保留。日後回復應正常新提交並保護玩家資料，不能force改寫或盲目回裝。

桌機Beta範圍內無本輪剩餘阻擋，停Owner Review。Android／低RAM／熱降頻NOT_RUN、CPU4×FAIL、2118MiB、自然容量3/4與既有技術債維持；沒有自行擴大競賽池或開始下一Sprint，不刪資料。
