# CS Map v2 Beta R3：已部署，正式站驗收 HOLD

2026-11-08。**GitHub Pages 已成功發布 `7cf1cebc`，但部署後補充 Replay Gate FAIL；本次發布驗收沒有完成，不得宣稱全面 PASS。** 已依 Owner 的失敗停止條件停止後續重測、修改、Push、部署及回退，只保存證據、文件與只讀容量盤點。

## 實際版本與發布範圍

| 項目 | 實際值 |
|---|---|
| 起點文件 Checkpoint | `9c5747d05b3834b137a85aa4bcd233b68669900a`，保留原 R2 HARNESS_FAIL |
| 本次受測、Push、部署 SHA | **`7cf1cebc10915f096a256885388ecd8a7052e5f3`** |
| Claude 工具交接 | `9afe58b260c1177a780b87e321f3869c28ac0bdc`，已由 R2 選擇性整合；沒有拿 Claude PASS 當 CS PASS |
| 發布前 main／回退比較基線 | `3e61515747bd786b01317ff68eecc7e908c8479d` |
| 正式網址 | https://rayhuang0323.github.io/ESMO-/ |
| Actions | [42413502348：SUCCESS](https://github.com/RayHuang0323/ESMO-/actions/runs/42413502348)，head SHA＝7cf1cebc |
| 正式入口 JS | `index-C106wmX6.js`；全 11 份 JS 指紋 `b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370` |
| HTTP 比對 | 正式首頁及全部 11 份 JS 與本機 Node20 Build 逐 byte 一致；Last-Modified＝`Sat, 07 Nov 2026 20:58:25 GMT` |
| 工作區 | `C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108`；沿用既有工作區，未新增 Worktree |
| R3 原始收據根目錄 | `C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r3\` |

Owner 授權的範圍仍僅桌機公開測試版、既有快速練習 opt-in：首頁 → CS → 快速練習 → 勾選原創地圖 → Confluence Station／Dune Exchange／Foundry Circuit。沒有擴大正式聯賽、BO1、BO3 地圖池。Android、低RAM、實際熱降頻未認證，CPU4×既有 FAIL、Replay 2118MiB 歷史峰值保留。這些已接受的有限測試版風險，**不包含豁免本次新出現的正式站 Replay FAIL**。

## R2 前置缺漏修正與正確 SHA 驗證

補充 Smoke 位於 Git 外的 `release-r3/production-replay-smoke.mjs`。只補原生點擊 `<summary>` 展開保存重播面板，並檢查 `details.open`／返回按鈕可見；原有原生 hit-test、匯入、seek、自然推進、返回原比賽與卸載斷言均保留。不使用 JS 假點擊，不改產品、Repo 內工具、勝負、畫質或驗證門檻。

原腳本 SHA-256 `c988d52258eb54246da573aa761adf2db8df08ba16473bba07ac820e557c75dd`；修正後 `402d33a09e139e0b13e1658303b731777532f562ccc0f38cf39d6079f19771b6`，差異與兩版原件保留。Git 受測來源沒有因外部 Smoke 修正改變，仍為 7cf1cebc。正式 Gate 在該 commit 的乾淨追蹤來源執行，完成後才返回文件分支記錄；後續文件 Checkpoint 不是另一次產品 PASS。

| 部署前項目 | 結果與收據 |
|---|---|
| R2 的 19 組 run Gate | 同 SHA／同環境／24 小時內，重新由 SHA Guard assert 判定全部有效；沒有重跑大型矩陣，也沒有跨 SHA 沿用 |
| 新增 Node20 Build | PASS，原生 exit0；官方 Node20.20.2 portable，核對官方 SHA-256，不改全域 Node；Vite Build 與既有 Node24 產物全 JS 一致 |
| 修正後正式包本機 Replay Smoke | **25/25 PASS**，原生 exit0；三圖匯入、seek、自然播放、返回同一原比賽、離開 Battle 卸載完成；無 scene probe |
| 最後部署前 assert | **21 組要求 Gate PASS，exit0**，target＝actual＝7cf1cebc；遠端 main 仍為 3e615157 |
| Push 後 assert | 同 21 組 PASS，expect-remote-main＝7cf1cebc |

19 組包含 SHA Guard118/118、Build、regress15/15、regress2 8/8、Progress33/33、runtime35/35、BP-9 Node1464/1464與112/112、Shader14/14、RAF7/7、Replay無損、TD-FDR-01 49/49、三圖正式UI各48/48、BP-9 Browser11/11／38/38／44/44、MOBA89/89、Replay診斷及Reset／Seek／返回／卸載49/49等。runtime委派項仍列SKIP；詳細命令與完整輸出沿用 [R2 報告](BETA_RELEASE_R2_REVIEW.md) 及原始收據，而非宣稱全部歷史驗證器通過。

`existing-19-assert.json`、`node20-build.exit.json`、`cs-production-replay-local.exit.json`、`final-assert.json`、`post-push-assert.json` 及各自 stdout／stderr 保留完整參數、exit code、SHA與收據路徑。TD-GATE-CS-01 的 details 前置問題依本機25/25關閉；舊 BLOCKED 原件仍在 R2 與 Git common receipts，沒有覆寫。

## Push 與實際 CI

先保存舊 main，正常 atomic、非 force、fast-forward 將受測來源推至遠端 main，並同時建立：

- `backup/main-before-cs-map-v2-beta-20261108` → 舊 main `3e615157`。
- `beta/cs-map-v2-desktop-20261108` → 已驗證來源 `7cf1cebc`。
- 既有 `backup/cs-map-v2-rc-20261108`／`rc/cs-map-v2-20261108-hold-r1` → RC67f46145，保留。

沒有移動其他工作區的本機 main，沒有 rebase／merge commit／force，也沒有改 GitHub Pages workflow 或 timeout。三個 Claude 文件提交 `a0ec13a1`、`6fa61083`、`3cae571f` 為已發布 SHA 的祖先，沒有遺失。

Actions 於 2026-11-07 20:57:16 UTC 開始、21:00:18 完成，約3分02秒；Build job約56秒、deploy約1分59秒。實際 CI Node20.20.2、Supabase UNCONFIGURED；Vite Build18.52秒，部署log回報成功。這次耗時超過既有「連續2～3次全程2分鐘內」結案條件，TD-DEPLOY-1～4保持OPEN，不重跑CI洗耗時。

## 正式站實測與新阻擋

全部下列新收據綁定 target＝actual＝7cf1cebc，並打正式 HTTPS 網址，沒有拿舊 RC 或本機 PASS 充數。

| 正式站 Gate | 實測結果 |
|---|---|
| Confluence 正式快速練習 | **48/48 PASS** |
| Dune 正式快速練習 | **48/48 PASS** |
| Foundry 正式快速練習 | **48/48 PASS** |
| MOBA 正式流程／Replay／舊存檔相容續玩 | **90/90 PASS**，1366／390 桌機模擬，不是真 Android |
| B1B／B1C／B1D 核心／BP-9／存檔 | **43/43、38/38、27/27 PASS** |
| 補充 CS 原生保存 Replay | **PRODUCT_FAIL，5/6，exit1**；Confluence播放未推進，立即停止 |
| 最後正式站 assert | **FAIL，exit1**；要求29組，最新 `prod-cs-native-replay` 為 FAIL，其餘28組有效 |

前三圖皆走真正式入口、十人戰鬥、真快速完成、戰報、練習結算及返回；通過組的Console檢查一併保留。MOBA包含舊正式站測試存檔讀回與續玩。這些 PASS 不取代下列失敗。

**TD-GATE-CS-02／OPEN：正式站補充 Replay 自然推進失敗。** 該補充路徑使用既有 `?c5c=battle&map=mirage&scene=major.v3&seed=830102` review route 準備原比賽，不是快速練習入口；兩種路徑的證據不能混稱。Confluence完成原比賽十人DOM／canvas存在、原生匯入3497保存幀、seek24／3495／12；點播放、等待1.2秒、暫停後仍為index12。result為 `PRODUCT_FAIL pass=5 fail=1`，Gate映射FAIL。截圖顯示黑色戰場，`canvas:true`只證明DOM存在，不證明3D已可呈現。

這次面板已展開、返回按鈕可見，故不是原R2的details問題。只讀程式觀察：`EsportsFPS3D.jsx`會在非legacy場景等待`presentationReady`才推進，資源準備前亦會隱藏canvas；但本次沒有捕捉該內部旗標，**不足以判定是冷載入前置缺漏還是真產品播放回歸**。保留實際PRODUCT_FAIL分類，不擅自降級HARNESS_FAIL，不以本機25/25或其他正式站PASS豁免。

正式站補充測試的Confluence返回／卸載、Dune／Foundry原生Replay與該腳本最後Console檢查均 **NOT_RUN**。本機三圖返回／卸載25/25及診斷49/49已通過，兩者僅描述各自環境，不冒充正式站覆蓋。

失敗原始證據：`production-replay-public/result.json`、`harness.json`、`confluence.png`、`provenance.json`、`prod-cs-native-replay.stdout.log`／`stderr.log`、`STOP-PRODUCTION.json`、`production-final-assert.json`／完整logs。Chrome cleanup已確認關閉且移除本輪自有臨時Profile；沒有清除玩家localStorage或刪原始證據。

原始Gate最後一行：

```text
RELEASE_GATE RESULT=FAIL exit=1 version=1.0.0 gate=prod-cs-native-replay target=7cf1cebc1091 actual=7cf1cebc1091 receipt=D:\OneDrive\文件\GitHub\ESMO\.git\esmo-release-gate\receipts\20261107T211200Z__7cf1cebc1091__prod-cs-native-replay__FAIL.json
```

完整29組assert最後行在`production-final-assert.stdout.log`，native exit1。沒有在文件Checkpoint上跑新assert並宣稱產品已通過。

## 保護、回復與最小待辦

原34份WIP的status與逐檔hash保持，原CS HEAD a7398436、RC67f46145及Claude9afe58b2工作區均保留。未新增Worktree；本輪沒有產品修改、畫質／人數／勝負變更或新Replay格式。只讀盤點結果見 [容量與清理提案](CS_DISK_CLEANUP_REVIEW_20261108.md)，沒有刪除資料。

本機來源標籤 `checkpoint/cs-beta-release-20261108-r3-production-fail-source` 指向7cf1cebc。後續文件Checkpoint只存於既有發布分支，**未Push**，不會觸發第二次部署；精確SHA見 [R3 Checkpoint](BETA_RELEASE_R3_CHECKPOINT.md) 指向的`final-checkpoint.json`。

目前結論 **HOLD**。最低接續工作是先以真實UI證明載入完成／canvas可見、保存播放當下的可呈現證據，確認此次Smoke是否缺冷載入前置；若前置成立仍不推進，才定位產品根因。必須保留原FAIL與原播放斷言，之後補齊正式站三圖返回／卸載及Console，對正確SHA重新取得要求的最新收據與最後assert。依Owner本輪停止條件，這些工作沒有繼續執行。

**目前公開站仍為7cf1cebc；沒有自動回退或第二次Push。** 若Owner決定回復，舊main備份只是比較基線；建議以新提交關閉新增三圖opt-in入口，保留已開場次／Replay讀取、BP-9原子結算、SaveSlim、Progress與MOBA契約，驗證後正常非force發布。不可盲目整包換舊、強改main；SaveSlim已摘要化歷史需整理前玩家備份才能還原。完整原方案留在`release-r3/ROLLBACK_PLAN.md`。

Android／低RAM／熱降頻NOT_RUN；CPU4×FAIL、2118MiB風險、自然容量3/4 NOT_TRIGGERED、cloth18/19／utility6/9具名技術債仍保留。沒有把有限Beta授權改寫成全面Release Gate PASS。下一步交Owner Review，等待對正式站FAIL與是否回復的決定。
