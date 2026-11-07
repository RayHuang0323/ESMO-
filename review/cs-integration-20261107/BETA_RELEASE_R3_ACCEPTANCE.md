# CS Beta R3 驗收清單

2026-11-08，受測／部署`7cf1cebc10915f096a256885388ecd8a7052e5f3`。**已公開但驗收HOLD；不得以本表部分PASS宣稱全面發布完成。** 詳見[BETA_RELEASE_R3_REVIEW.md](BETA_RELEASE_R3_REVIEW.md)。

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| 原34WIP／RC／Claude／三文件祖先 | 保留 | preservation.json與收尾preservation-final.json |
| 正確SHA、乾淨追蹤來源、main祖先 | PASS | 7cf1cebc；main舊3e615157，正常FF後同7cf1cebc |
| R2 19組run收據有效性 | PASS | SHA Guard重新assert，同環境／24小時內，不跨SHA |
| Replay details原生展開前置 | PASS | TD-GATE-CS-01關閉；舊HARNESS_FAIL保留 |
| Node20部署Build | PASS | 官方20.20.2，CI同版本，11JS逐byte同本機 |
| 本機正式包Replay返回／卸載 | PASS | 三圖25/25；不代表正式站 |
| 部署前及Push後最後assert | PASS | 各21組；完整stdout／stderr |
| 非force Push／main舊版備份／Beta tag | 完成 | push.json；main7cf1cebc；backup3e615157 |
| GitHub Actions／實際網站版本 | SUCCESS／相符 | run42413502348，首頁與全部11JS比對 |
| 正式站首頁／CS三圖正式流程 | PASS | 各48/48，十人戰鬥、戰報、練習結算、返回 |
| 正式站MOBA／Replay／舊存檔續玩 | PASS | 90/90；390只是桌機模擬 |
| 正式站B1B／B1C／B1D | PASS | 43/43、38/38、27/27，含各自Console檢查 |
| 正式站補充原生Replay播放 | **FAIL** | Confluence5/6，index12未推進，PRODUCT_FAIL；TD-GATE-CS-02 |
| 正式站補充Replay返回／卸載／其後Console | **NOT_RUN** | Confluence遇FAIL即停；Dune／Foundry亦未進行該補充腳本 |
| 正式站最後assert | **FAIL** | 29組要求，28有效PASS、1最新FAIL；exit1 |
| 手機Android／低RAM／熱降頻 | **NOT_RUN／未認證** | 不用390px／CPU模擬代替 |
| CPU4× | **既有FAIL** | 不再全面優化／放寬門檻 |
| Replay2118MiB峰值 | **已知風險保留** | 沒有宣稱已消除或低RAM可用 |
| 自然CS容量累積 | **3/4 NOT_TRIGGERED** | 受控38/38已過，不重跑洗綠 |
| TD-DEPLOY-1～4 | **OPEN** | 本次3分02秒，尚未達連續正常發版2分鐘內條件 |
| C／D／CS磁碟盤點 | 完成，只讀 | 57個根目錄，未跟隨目錄連結；未刪檔 |
| 全面Release Gate／Owner最終驗收 | **HOLD** | 等Owner處置正式站Replay新阻擋 |

沒有在FAIL之後再次Push、部署、重測或回退。後續文件Checkpoint只在本機，不能拿它的SHA繼承7cf1cebc的PASS。
