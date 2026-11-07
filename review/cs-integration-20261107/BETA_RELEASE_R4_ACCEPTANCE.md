# CS Beta R4 正式站驗收清單

受測／已部署SHA：7cf1cebc10915f096a256885388ecd8a7052e5f3。**CONDITIONAL GO：桌機快速練習opt-in公開測試版；不宣稱全面Release Gate PASS。**

| 項目 | 狀態 | 證據／範圍 |
|---|---|---|
| 原R3 FAIL／黑畫面截圖 | 保留 | 原收據hash不變，原影片／獨立Console與Network當時未捕捉 |
| 同Build／Replay／Chrome對照 | 完成 | 正式站冷載入未ready即判斷；本機較早ready；同正式站分頁ready後12→14 |
| 根因 | 工具前置缺漏 | 原腳本未確認map-preparing消失與Canvas visible；未確認產品BUG |
| 本機三圖完整原生Replay | PASS 38/38 | 匯入、seek、播放、pause、返回原場、不重跑模擬、卸載 |
| 正式站三圖完整原生Replay | PASS 38/38 | 同上，十名Rigged、WebGL未lost；離場後context lost／detached及sceneChildren0 |
| 正式站Console／素材與Worker網路 | PASS | 無頁面例外／error、無HTTP錯誤或非取消失敗；保留既有Three.js warning |
| 最新main／版本與Build | PASS | origin/main=7cf1cebc，首頁與11JS逐byte一致，既有Actions42413502348 SUCCESS |
| 正確SHA最後assert | PASS 29組／exit0 | 同來源／環境／有效期；舊FAIL不刪、最新同gate採新PASS |
| 三圖正式流程／MOBA／B1B-C-D | 有效PASS | 同7cf各48/48、90/90、43/43、38/38、27/27，守門重驗收據有效性 |
| 產品／Repo工具／部署 | 未修改／無新部署 | 只修Git外Smoke；不需要Hotfix／回退，不Push |
| 原34WIP／CS／RC／Claude | 保留 | 原status、逐檔與備份hash一致；其他工作區不改 |
| 四個本輪測試Profile | 保留 | 程序正常關閉、profileRemoved=false、目錄仍存在 |
| Android／低RAM／實際熱降頻 | NOT_RUN／未認證 | 390px與桌機不是手機實測 |
| CPU4×／2118MiB峰值 | FAIL／已知風險保留 | 不降低畫質／人數或放寬門檻豁免 |
| 自然容量覆蓋 | 3/4 NOT_TRIGGERED | 受控38/38已過，不重做 |
| TD-DEPLOY-1～4 | OPEN | 本輪無新部署耗時，不用Smoke PASS關閉部署通道技術債 |
| C／D只讀盤點／清理 | 完成／未刪除 | 52工作樹＋5證據／Profile根目錄；新舊Profile與證據皆保留 |

完整命令／收據／根因：[BETA_RELEASE_R4_REVIEW.md](BETA_RELEASE_R4_REVIEW.md)。
