# moba-sim.v24 候選：交付點 A（基礎版本）（2026-11-15）

依據：Owner Review（2026-11-15）核准建立 moba-sim.v24 候選，分兩個交付點。這份是 **A：v24 基礎版本**。

- 基準：`feature/moba-tower-edge-v23` 的 `00382eda`（v23 凍結值 `69237cce78edf2be`，safeRoute "v5"）。
- **A 不改任何對局**：v24 的層只有「仲裁紀錄」與「承諾設定＝現狀」；v24 的對局與 v23 逐 tick 相同，v20～v23 的對局逐 tick 不變。
- 沒有 Push、沒有 Deploy；所有正式旗標仍是 false。

## 1. 做了什麼

| 項目 | 內容 | 檔案 |
|---|---|---|
| 新版本 | `MOBA_SIMULATION_VERSION`＝`moba-sim.v24`（未發布候選）；`moba-sim.v23` 加進已知版本清單 | `simulationVersion.js` |
| 新指紋 | **`78d1fb305ba1f72a`**（v24 未凍結：B 會同版號重新登記，舊值寫在註解）。v20～v23 的登記值一個字都沒動 | 同上 |
| 語意清單 | 補上 22 支：裝備 8、地圖幾何 13（驗證可靠性盤查案 2 盤出的 21 支）＋新的仲裁紀錄模組。`tacticalDirective.js` 照舊不收（引擎沒有呼叫 `directive()`） | 同上 |
| 新規則集 | `career.v24`、`balanceTool.v24`：從 v23 逐欄衍生，只多兩個層鍵 | `matchRuleset.js` |
| 新層 `taskArbitration` | `"none"`（缺少＝none）／`"v1"`：引擎每 tick 替每名存活英雄記一筆仲裁紀錄（贏的任務、原因碼、被壓下的任務、第二段改寫）。**只寫紀錄** | `matchRuleset.js`、`LogicEngine.js`、新檔 `battle/moba/tactics/taskArbitrationLedger.js` |
| 新層 `taskCommit` | `"v19"`（缺少＝v19＝現狀）／`"v19push"`：推進也承諾。**兩份 v24 規則集的登錄值都是 "v19"**；正式規則集被 `createMatchSetup` 鎖住，只有工具規則集能用 `ESMO_BALANCE_TASKCOMMIT=v19push` 覆寫做量測（Owner 決策 4：預設關閉，要先獨立驗證） | 同上；`tools/balance/moba_items_balance_runner.mjs` |
| 正式旗標 | `mobaTacticExecV24: false`（只在 v21、v22、v23 三個旗標都開時才有意義；只開它 ⇒ 仍是 `career.v20`） | `featureFlags.js` |
| 組裝器 | 層存在才把鍵傳給 `configureMatch`；引擎要宣告 `SUPPORTS_TASK_ARBITRATION`／`SUPPORTS_TASK_COMMIT` | `matchAssembler.js` |

引擎的改動（`LogicEngine.js`）：
- `configureMatch` 多收 `taskArbitration`、`taskCommit`，各自只變成引擎自己的一個旗標，不經過 Director。
- 英雄決策鏈的每個分支多一行「這一分支贏了」的紀錄；第二段每一層多一個「有沒有改寫目標」的比對。層不存在時那些紀錄全部不執行（`ARB`／`AT` 為 null）。
- v19 承諾那一行多一個 `|| this._commitPushV24 === true` 條件（預設 false ⇒ 與原式相同）。

## 2. 證據：v20～v23 完全不變、v24 與 v23 逐 tick 相同

新 gate **`node tools/check_layer_isolation_v24.mjs`：8/8 PASS（201 秒）**。基準是**改動前**在 `00382eda` 錄的 48 場整場逐 tick 雜湊（`pins_v20_v23_at_00382eda.json`，工具 `tools/owner_preview/pin_v20_v23_stream.mjs`）。雜湊內容：每 tick 的時間，每名英雄的 id、原始浮點座標、血量、存亡、狀態字串、金錢；結尾加勝方、結束時間、戰術執行計數。

| # | 證據 | 結果 |
|---|---|---|
| I1 | v20、v21、v22、v23 各 12 場（工具 6、生涯 6，含低／中／高素質）＝改動前的基準 | **48/48 相同** |
| I2 | v24（仲裁 v1＋承諾 v19）與同輸入的 v23 | **12/12 逐 tick 相同**，12 場都有仲裁帳 |
| I3 | v20～v23 的 48 場裡，v24 的程式沒有啟動（沒有仲裁帳、承諾推進旗標關） | 0 洩漏 |
| I4a | 仲裁帳每名存活英雄每 tick 恰好一筆，值都在契約清單內 | 1,996 tick，0 錯 |
| I4b | 引擎內的帳與引擎外的步驟 A 觀測器，第一段贏的任務逐筆比對 | **19,108／19,108 一致** |
| I5 | v20～v23 規則集沒有 v24 的層；v24＝v23 逐欄＋兩個新鍵；旗標解析（全關→v20、三個→v23、四個→v24、只開 v24→v20） | 成立 |
| I6 | v23 凍結清單的語意檔只改了刻意的 3 支（LogicEngine、matchRuleset、matchAssembler）；補進清單的 21 支依賴檔＝凍結時的內容；`tacticalDirective.js` 不變 | 成立 |
| I7 | `v19push` 用工具覆寫後對局真的改變；正式規則集改成 v19push 會被拒 | 成立 |

## 3. Gate（依序單線，log 在 `gates/`）

| Gate | 結果 | 判讀 |
|---|---|---|
| `check_simulation_version_gate` | 105/105 PASS | 清單多 22 支（原 83） |
| `check_v23_freeze` | 3/3 PASS | F1 三項（v23 登記值、safeRoute v5、清單常數）都過。版本已是 v24 ⇒ F2／F3 依設計只報差異；F3 原本釘的 22 支改由 `check_layer_isolation_v24` I6 釘住 |
| `check_match_ruleset_3a` | 60/60 PASS | |
| `check_match_setup_contract_3a` | 85/85 PASS | |
| `check_match_setup_3a` | 153/153 PASS | 含 v20 黃金 39 案。V3 改成「目前版本 v24、v23 釘在凍結值」（舊斷言全部保留） |
| `check_match_assembler_3a` | PASS | v20 黃金 39 案 |
| `check_tactical_director_3c` | 97/97 PASS | S2d 加上 v24 兩個引數的斷言（舊斷言全部保留） |
| `check_tactical_directive_3c` | PASS | |
| `check_live_setup_3a`、`check_stage1_split_3aB` | PASS | |
| `check_jungle_camp_v22`、`check_safe_route_v23`、`check_tower_edge_v23`、`check_tower_edge_fix_v23`、`check_nav_safety_v23` | 全部 PASS | v22／v23 的歷史釘點 |
| `check_layer_isolation_v21` | 30/30 PASS | v21 凍結點的 9 個釘點 |
| `check_layer_isolation_v24` | 8/8 PASS | 見 §2 |
| `check_match_golden_v21a` | 97/137 | **既有紅燈（TD-REL-02）**：40 案全是 `bind-*`，與 v23 帳本的失敗清單逐案相同（差異 0） |
| `check_career_golden_v21` | 3/5 | **既有紅燈**：P2（fixture 在 v21 指紋 `0578…` 時期錄的）與 R（只差 setupHash）。在改動前的 `00382eda` 匯出樹上重跑，結果完全相同 |
| `check_challenge_golden_v21` | 5/6 | **既有紅燈**：只有 P2（同上）；12 案重跑逐位元相同。在 `00382eda` 上同樣 5/6 |
| `check_task_arbitration_obs_v1` | 5/6 | ⑥「src 沒有未提交改動」在提交前必紅；提交後重跑見 §4 |
| `npm run build` | `✓ built in 22.41s` | |

沒有重錄、沒有放寬任何 Golden 或 Gate。

## 4. 提交後的複驗

（提交後補上：`check_task_arbitration_obs_v1`、`check_v24_diag_sprint`。）

## 5. 沒有做的事

沒有改 v20～v23 任何規則集物件與登記指紋；沒有改任何對局行為；沒有重錄 Golden、沒有動 G-A8；沒有開任何正式旗標；沒有 Push、沒有 Deploy；沒有動 CS 與其他 Worktree。
