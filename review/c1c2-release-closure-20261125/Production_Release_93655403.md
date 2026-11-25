# C1＋C2 正式發布報告：93655403（已發布，Owner 正式結案）

- 日期：2026-11-26（Asia/Taipei）
- 正式站：https://rayhuang0323.github.io/ESMO-/
- Owner 結論：正式接受 C1＋C2 發布成果，Production Smoke PASS，C1＋C2 正式結案。

## 1. 發布內容

| 項目 | 值 |
|---|---|
| 正式 main | `93655403806340bbc1456623fb7834b92f331ce3`（`git push origin 93655403…:refs/heads/main`，`053fd582..93655403`，fast-forward，沒有 force） |
| 發布前 Release Gate | 10 張 PASS 收據全部綁 `93655403`；`assert --require-ancestor 053fd582 --expect-remote-main 053fd582` ⇒ PASS。索引見 `Release_Readiness_93655403.md`，P2v2 在 `93655403` 重測 PASS（收據 `20261125T160118Z`） |
| Workflow | 「Deploy Vite site to GitHub Pages」run **45650627711** |
| 第 1 次執行 | build 成功；deploy 失敗：`Failed to create deployment (status: 500)`（GitHub 服務異常）。正式站維持舊版，沒有半套發布 |
| 第 2 次執行 | Owner 按 Re-run，**success**，head_sha `93655403…`，完成時間 2026-11-25T18:25:58Z |
| 版本定位 | v26（det.v2，指紋 `360474218ca774b9`）是後續主要候選；v25（det.v1）保留為歷史版本；正式旗標全部 `false` |

## 2. 正式站 bundle 證據

部署前的正式站入口是 `assets/index-S6a2NE21.js`（Last-Modified 2026-11-21 09:27:16/17 GMT）。部署後：

| 檔案 | 大小（bytes） | sha256 |
|---|---|---|
| `index.html` | | `3650c376633929da922bb27ec7c77871ea7e82655faf773322612493478fc244` |
| `assets/index-BMEGjo1f.js`（入口） | 5414048 | `c288d2daac186d9dd225f967af1765ff354e505b23c859b9d1b3f95218ae1582` |
| `assets/fpsSim.worker-DngQJW49.js` | 1732467 | `349d4573449ca2e128fe9e80f703558e7f45dacde689879d909f6eddb274691e` |
| `assets/index-DXrKDBuF.js` | 231874 | `e912666282cd99df32993f511f273276c66ad38cfb3df7b2c9d21bf57f2efdd0` |
| `assets/index-BfQXX-uw.css` | 155353 | `4cdd54e7993ba72470cc3b8386910ba1e0148f8d615a34243ab17b41da0f61e7` |
| 其餘 8 個 chunk | | 見 repo 外 `prod-verify/MIRROR.sha256` |
| 11 個 JS 的合計雜湊 | | `2616f64df5a5ad55e9777391bdba03e9925a8681dec9b5db3985f49c5a9b7a21`（CS 正式流程工具的 bundleSha256 算法：檔名＋內容依檔名排序） |

- Last-Modified 是 2026-11-25 18:25:54 GMT。
- 入口 bundle 含 `moba-sim.v26`。
- 旗標預設物件逐項是 `!1`：`mobaTacticalDirectorV21`、`mobaChallengeV21`、`mobaJungleV22`、`mobaSafeRouteV23`、`mobaTacticExecV24`、`mobaDetMathV25`、`mobaDetMathV26`。
- 指紋 `360474218ca774b9` 在執行時才算出，正式站讀不到 `/src/`（TD-31），所以以 `93655403` 原始碼上的 Release Gate 收據為準。
- 注意：CI 的 bundle 雜湊不能和本機 build 直接比。CI 的 `VITE_SUPABASE_*` 是空字串，而且 CI 用 `npm install`、不是 `npm ci`。以後比對正式站，請用這份清單（正式站對正式站）。

## 3. Production Smoke

### `browser_check_prod_release_3aB`：90/90，RESULT=PASS（199 秒）

1366 與 390 各跑一次，每次都用獨立的瀏覽器 profile：

| 段 | 內容 | 結果 |
|---|---|---|
| A | 打包結果（沒有 `/src/`）；bundle 已換新版；v21 旗標關；沒有「戰術書」；沒有水平溢出 | ✅ |
| M | MOBA：賽前 → Ban/Pick → v20 戰術頁 → 對戰 → 快速完成 → 結算；入帳 0→1，恰好一次 | ✅ 1366／390 |
| R | Replay 開啟、地圖載入、陣容 10 列、時間軸前進（2.5→17／2.5→15.5） | ✅ |
| S | 重整後存檔相同（5 人、1 筆）；沒有 `.corrupt` 隔離檔；localStorage 沒有 v21 標記 | ✅ |
| T | Training 安排「精準射擊訓練」，存檔有 1 人在訓練，重整後還在 | ✅ |
| H | Competition Hub 的 moba／cs 分頁切得動，沒有溢出 | ✅ |
| O | 舊存檔（部署前從正式站抓的 `prod-save-before.json`）：沒有被隔離；manager／team／lineup／players／finance／processedMatchTransactions／competitionByMode／csHistory 逐值相同；沒有欄位被丟；再打一場入帳 1→2，隊伍與選手數不變 | ✅ |
| E | page error 0、console error 0 | ✅ |

### `browser_check_cs_major_formal_flow --url=<正式站>`

`--buildDir` 是正式站 bundle 的逐位元鏡像（`dist/prod-mirror-BMEGjo1f`，gitignored）。

| 寬度 | 結果 | 進場到 Battle | QuickFinish |
|---|---|---|---|
| 1366 | 63/63 PASS（79 秒） | 35.5 秒 | 1.1 秒 |
| 390 | 63/63 PASS（71 秒） | 27.0 秒 | 1.0 秒 |

檢查範圍：
- Dashboard → CS 一般對戰 → ready-check → 地圖 → 四層戰術 → Battle（10 名選手、HUD、canvas 不是空的）→ QuickFinish 只確認一次 → 真比分。
- 進階戰報：十人 KDA／ADR／KAST 逐人等於入史結果。
- 320／360／390／430 都沒有溢出，按鈕至少 44px。
- 結算只入帳、入史一次；回到 Dashboard 沒有第二次完成。
- Roster／Profile 正常；console 與 page error 都是 0。

### 結論

沒有白畫面、沒有重大 console error、沒有回歸、沒有存檔損壞。不需要回滾。

## 4. 證據位置（repo 外，不進 git）

都在 `C:\Users\ifikn\esmo-measure\c1c2-release-20261126\`：
- `capture/prod-save-before.json`、`capture.stdout.log`：部署前從舊正式站抓的存檔，8/8
- `prod-verify/`：index.html、入口 bundle、`MIRROR.sha256`
- `smoke-3aB/stdout.log`：90/90
- `smoke-cs/stdout-{1366,390}.log`，以及 `smoke-cs/prod-smoke-93655403-{1366,390}/`：gate.json、harness.json、截圖
- `C1C2_正式發布報告_93655403.md`：發布當下的原始報告

## 5. 過程中的事件（保留紀錄）

- **Pages 500**：Workflow 第 1 次執行失敗，因為 GitHub 服務異常。這台電腦沒有權杖，由 Owner 手動 Re-run。
- **監看誤報**：CDN 各節點的 Last-Modified 會差 1 秒。監看改成看「入口檔名是否改變」。
- **錯誤的 shell 指令**：Git Bash 的 `find /c` 被當成 Unix `find`，開始掃 C 槽。只讀不寫，已經用 TaskStop 停掉自己的背景任務，沒有影響。
- **Owner 的 Chrome**：Smoke 期間沒有用埠號或名稱關閉任何行程（AGENTS.md §12）。Chrome 行程數開始前 37、結束後 35，Owner 的 Chrome 沒有被關。

## 6. 仍開放

- 未驗證：真實手機與低階裝置（Android、iOS／macOS Safari、低 RAM、CPU 4×）。390 是桌機 Chrome 模擬的。
- TD-61（v21 開啟時的 Golden）
- TD-62（純文件 Commit 的證據沿用；方案見 `TD-62_純文件Commit證據沿用方案.md`）
- TD-TAC-65（v18 地圖模組原生三角函數，只監看）
