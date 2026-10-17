# CS Major Upgrade v1.0 正式發布紀錄

## 2026-10-18 授權與保存

狀態：**RELEASED_WITH_BASELINE_DEBT**。Owner 已完成人工驗收並授權正式發布；CS v1.0 已正常 push、GitHub Pages 部署與正式站 Smoke Test 通過。其他 worktree 與未提交修改完整保留，未強刪鎖或 force push。

Owner 核准產品 source：`e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4`，144 檔。工程結論與歷史紅燈見 `OWNER4H_CLOSURE.md`、`OWNER4G_CLOSURE.md`。原始研究音效及暫存不入庫，正式所需轉製音效與來源說明隨產品保存。

初始狀態／tracked patch／未追蹤檔案清冊：本機 `evidence/release-v1-20261018/initial-*`。未追蹤共 3020 檔，包含研究錄音及暫存；不得全部提交。

## Release Gate

依序：安全保存 → fetch／隔離整合最新 main → CS Simulation／三圖完整對局／Replay／Result／Competition → production build → 桌機與 390px 正式流程 → MOBA 基本回歸 → remote head 再確認 → 正常 fast-forward push → GitHub Pages 精確 SHA 部署 → 正式站 Smoke Test。

所有新 gate 必須保留完整 stdout／stderr、native exit 與前提，尚未執行不得標 PASS。環境問題先分辨 HARNESS_FAIL；不修改產品救環境、不降低門檻。

### 本輪整合驗證

- 最新整合基線 `1d0e219aae20a946bbc04d36349cb988e6e5ba7b`（moba-sim.v20）；CS 保存 `75044c9c`。獨立 worktree `cs-major-release-v1-20261018`，其他 main／MOBA／SeasonState worktree 不修改。
- 四份 handoff 只有雙邊追加衝突，皆保留。產品無衝突；MOBA protected source 與主幹相同、CS source／素材與 Owner 核准 commit 相同。main 原有 105 個 verifier 段落全保留，整合後共 146 段，不代表本輪全數執行。
- 三圖各兩場共六場／116 回合：45 次安包、15 次拆彈；比分、回合／幀、射擊／命中、AI／移動診斷均與 Owner 核准版相同（排除耗時欄位）。比較報告 `evidence/release-v1-20261018/owner-outcome-comparison.json`。
- CS 選定 12 個 CPU 段落均有新版有效 PASS：首次 11/12，Owner4E 因漏傳 report 路徑為工具前提失敗；補參數只重跑該段 20/20 通過，未改產品或斷言。原始失敗完整保留。
- 五項 H 規則：感知 12/12、因果視力／拆彈 11/11、命中 12/12、POV 遮擋 7/7、守包預留／復位 9/9。
- 新完整保存 Replay：4,229 幀／20 回合，全欄位及 Result 完全一致；171,401,116 wire bytes／14,673,212 gzip bytes，原 256MiB／64MiB 上限不變。Replay UI 51/51、input 15/15；Competition 19/19。四個陣容／選手 UI 段落全過。
- 全部 stdout／stderr／native exit、分段 verifier 狀態與完整子 log 保存於本機 `evidence/release-v1-20261018/`，真對局保存於該隔離 worktree 的 `evidence/owner4h-review-20261018/`。

- production build native exit 0；正式無 probe 整合 bundle `f02126061c035f7647f4b308a00a243d9516ee2fe009ad6fa2ec5a85703f7d50`。桌機 1366 與 390px 新版正式 UI 流程各 63/63、native 0，含真 Dashboard→CS→Battle→Result／戰報／冪等；320／360／390／430 排版與角色資訊一起驗證。兩個 browser 自有 Chrome 與 profile 均確認清除。
- MOBA 本輪 5/7 段通過：experience26 29/29、15 seeds 結束率、節奏 8/8、runtime29 35/35、presentation29b2。委派項目為 SKIP，未當 PASS。
- **基線債務 CSREL-1**：progress25 32/33，§13 仍找 `BattleResult.v2` 內聯字串，main 自 v14 已為 `BattleResult.v3`；不修改產品契約或斷言。
- **基線債務 CSREL-2**：controls29b3 16/18，§2 要求 v2、§16 仍找 GameView 內聯地圖常數。實際 chunked／plain 結果相同且能生成正式終局，失敗仍如實保留；不以其宣稱完整控制 Gate PASS。
- 兩項均已在 main 的 `08_目前待辦與風險.md` 列為 verifier baseline debt；本輪相關 Engine／地圖／GameView／結果契約／verifier 與 main 逐位元一致（正規化 CRLF），`moba-baseline-debts.json` 保存 SHA 與前後相同失敗前提。風險評估：本輪 CS 未變更 MOBA 行為；保留既有紅燈與未測事項，依 Owner 允許評估歷史紅燈的授權繼續發布。沒有刪除或調鬆 gate。

正式站實測另列於下方，與本機結果分開記錄。

## 保留風險

- 真手機 FPS、觸控與實機音效未實測；390px Chrome 不代表手機。
- 長時／多次導覽或匯入尾端卡頓：八煙同程序歷史紅燈保留；三組每階段新 Chrome 的原門檻重驗通過，未證明長時風險消失。
- 長 OT Replay 仍受既有容量上限；未調高 gate。
- 三處室內未自然觸發，不宣稱全部視角已通過。
- 舊 MOBA 與 CS 工具債務需與最新 main 分別核對，不以歷史紅燈冒充新版 PASS。

## 發布結果

| 項目 | 實際結果 |
|---|---|
| 產品 release main commit | `a8438c9a10cf24ad6191b1790bce81dc7607e484`；parents 為 main `1d0e219a` 與 CS 保存 `75044c9c` |
| push | 正常 `HEAD:refs/heads/main`，`1d0e219a → a8438c9a` fast-forward，native 0，未 force |
| Pages | [Actions 39074829702](https://github.com/RayHuang0323/ESMO-/actions/runs/39074829702)，build／deploy success，精確 SHA 如上 |
| 正式站 | https://rayhuang0323.github.io/ESMO-/ |
| CI artifact | ID `12116915679`，ZIP SHA-256 `8893c6419ae02d28d8f34c1aa94bc725a27ec9ef85145dd7c1a360a87e9daad9`，下載 bytes 與 GitHub digest 一致 |
| CI bundle | `be97779500a8f73f96ae1a794c5e4ce3a65accbd98915a48935d5cc21cf52051`，10 個 JS |
| 正式站 HTTP | HTML＋全部 JS／CSS＋52 份 CS 正式素材／來源，共 **64/64** HTTP200 且逐 byte 符合實際 CI artifact／Git 來源 |
| 線上 CS 桌機／390px | 各 **63/63 PASS**、native 0；真 Dashboard→CS→Battle→Result／完整戰報／冪等，無 fixture 或 localStorage seed／清除；Chrome／profile cleanup confirmed |
| 線上 MOBA | **11/11 PASS**、native 0，moba-sim.v20／可見 2:33 戰鬥推進／390 與桌機 HUD／升級／狀態／技能圖；page error 0；新截圖已檢視 |
| 桌機 5183 | http://localhost:5183/ESMO-/ ，PID `127716`，CI env 重現建置 `release-ci-env-repro-a8438c9a` |

### 建置差異追查（保留首輪失敗）

第一輪拿 Windows 缺省環境建置與正式站比對，HTML 不同，**該輪 FAIL 保留，未改標 PASS**。取得精確 release SHA 的 GitHub artifact 後，正式站 64/64 逐 byte 相同。再以 CI workflow 實際設定的三個空值 `VITE_SUPABASE_URL`／`VITE_SUPABASE_ANON_KEY`／`VITE_SUPABASE_REDIRECT_URL` 在 Windows 同源重建，HTML 與全部 JS／CSS **12/12 完全相同**，確認環境輸入差異，無須改產品。詳細在 `ci-artifact-provenance.json`、`ci-env-rebuild.json`、`http-code.json`（首輪失敗）與 `http-ci-code.json`。

### 最終文件提交與保存

產品 commit 發布後僅更新 Release／設計／handoff 文件，不改 src／public／package 或 Vite 設定。最終文件提交仍正常 push，須再確認其 Pages success、正式站資源仍與上述已實測 CI 產物逐 byte 相同；最終 main SHA／第二次 Actions run 寫入本機 `evidence/release-v1-20261018/final-closure.json` 並於交付回報，避免文件自我引用 SHA。

本機另一 worktree 的 `main` 保留原 `cfa755be`，沒有切換或改動它。整合以獨立 release 分支正常 fast-forward 更新遠端 main；CS 自有工作樹僅在確認 tracked clean 後 fast-forward 到已驗證最終版本，原始研究資料與未追蹤檔案保留。沒有開始新 Sprint；真手機、長時效能、Replay 長 OT 與 CSREL-1／CSREL-2 仍為已揭露風險。
