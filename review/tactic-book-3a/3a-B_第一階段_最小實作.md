# Phase 3a-B 第一階段：發布規格登記與最小實作（Live 戰術 v21 先發布、Challenge 留 v20）

- 日期：2026-10-30（開發期實作；**未凍結語意、未跑 15–18 小時正式驗證、未啟用任何發布旗標**）
- 分支：`feature/moba-phase3a-stage1`（本機，從 `feature/moba-phase3a` 的登記 commit `f3986c44` 分出；未 push／deploy／整合 main，未碰 CS）
- 依據：Owner 2026-10-30 第三次裁定（六項決策；下一步＝第一階段發布規格的事前登記、獨立審查、最小實作與快速回歸）
- 事前登記：`tools/fixtures/stage1_release_registration_3aB.json`（`f3986c44`）
- 新 gate：`tools/check_stage1_split_3aB.mjs`（S1–S13，41 條）

## 0. Owner 裁定與本輪對應

| # | 裁定 | 本輪處理 |
|---|---|---|
| 1 | mid_jungle_sync 接受 NO_CANDIDATE，保留原樣，正式確認仍依原 G-A8 判準 | 不改；修正表不含它 |
| 2 | M3_C、M7_M、M8_C 為 v21 修正候選，使用版本化修正表，不得修改 v20 既有行為 | `TEMPLATE_BALANCE["v21.b1"]`，只有帶 `templateBalance` 層的 v21 規則集讀得到（§2.1） |
| 3 | m7 v21 文案：前期野區入侵／風險中／重點打野／描述／缺點；保留 classic.m7 ID | `TEMPLATE_COPY["v21.b1"]`，只給畫面看（§2.6） |
| 4 | AI 教練不可用退回固定戰術時，依本場規則集套用 v21 修正、不得重複套用；v20 不變 | 由 id 重建、絕對值、一次（§2.4） |
| 5 | 最小發布拆分：Live 戰術 v21 與 Challenge v21 分開控制；戰術書納入總旗標；Challenge 第一階段 v20；保護存檔、進行中比賽、Replay、旗標回滾 | 新旗標 `mobaChallengeV21`、總開關、2×2 矩陣（§2.2–§2.5） |
| 6 | G-A8 與 Challenge STOP 保留；確認性 G-A8 若仍 STOP 就停止發布並回報，不放寬門檻、不重抽 seeds、不事後改範圍 | 寫進第一階段正式驗收規格（先跑 G-A8，STOP 即停下其餘量測） |

## 1. 事前登記與獨立審查

| 對象 | 結果 |
|---|---|
| 第一階段登記（第 1 輪） | APPROVE WITH CHANGES：5 Major／8 minor，全部採納。最重要的是 M1：原設計會讓戰術書顯示的值與引擎實際打的值不同（例：v21 下 m7 實際是標準站位，畫面卻顯示「積極」） |
| 第一階段登記（第 2 輪，針對 M1 重審） | APPROVE WITH CHANGES：4 Major／7 minor，全部採納（聯集合法性也要用在 Resolver 的再驗證、v21 名稱要經組裝器進賽果、std／v2 計畫在 v20 下的處理、排除表依修正表區分） |
| 實作程式碼審查 | IMPL_REVIEW |

## 2. 實作內容（`src/` 共 16 個檔，另新增 1 個畫面檔）

### 2.1 版本化修正表（Owner 第 2 點）

- `tacticTemplates.js` 新增 `TEMPLATE_BALANCE["v21.b1"]`：m3（aggression 0.6、riskTolerance 0.5）、m7（0.5／0.5、節奏 standard、三路 standard）、m8（0.5／0.5）。**絕對值**，套兩次＝套一次。
- 模板物件（`tacticTemplates.v1`）與 `MOBA_TACTICS` 一個字都沒改（S3a 以改動前的雜湊釘住）。
- 規則集新增可選層 `templateBalance`：只有 `career.v21`、`balanceTool.v21` 帶 `"v21.b1"`；三份 v20 規則集與 `challenge.v21` **逐位元不變**（S1）。
- 選擇引擎每個實例綁一張修正表：自己的值、提供清單、勝利條件展開、合併、確認頁設定、指標都從修正後的模板開始（審查 M1；S11 實測 494 格「畫面＝引擎」）。
- 計畫合法性改成**聯集**：在出貨版或任一張修正表下合法就合法，與規則集無關 ⇒ 存好的計畫、binding、planHash 都不受影響，旗標來回切換時計畫不會失效（S4b：m7 前期強邊上路在出貨版是空轉、v21.b1 下有效，兩個方向都解析得出來）。
- 量測排除表的查表多了 `templateBalance` 條件；現有每一列都不帶它 ⇒ 兩種設定下照舊生效（保守撤下，凍結前重新判定，S13）。
- 結果：v21 下 m3／m7／m8 解析出的旋鈕＝篩選臂 M3_C／M7_M／M8_C（S4a）；v20 下＝出貨模板。

### 2.2 Live 與 Challenge 分開控制（Owner 第 5 點）

- 新旗標 `mobaChallengeV21`（預設 false）。Challenge 要用 `challenge.v21` 必須 `mobaTacticalDirectorV21`、`heroSkillsV1`、`mobaChallengeV21` 三者都開；只在 `resolveRulesetForMode` 的 challenge 分支加條件，`challenge.v21` 物件不動（S2）。
- 第一階段旗標（只開 Live v21）下：Live＝`career.v21`、Challenge＝`challenge.v20`、新挑戰記 `moba-sim.v20` ⇒ 正式站既有挑戰照常可重播（S2b、S7）。
- Challenge 路徑沒有任何一支讀修正表（S7a）。

### 2.3 總開關（戰術書納入總旗標管理）

- `AppShell.jsx` 以開局時同一個解析函式判斷：Live 規則集是 static（career.v20）⇒ 顯示 `TacticScreenV20.jsx`；Director core.v1（career.v21）⇒ 戰術書。
- `TacticScreenV20.jsx` 是正式站 v20（`1d0e219`，＝目前 origin/main）戰術畫面的**逐字副本**，只有第 2 行檔名說明不同（S9a），不產生戰術書 binding。
- `AppShell` 只在有 binding、或要清掉本場先前留下的一份時才寫 `tacticPlanBinding`（正式站從不寫這個鍵）。

### 2.4 Live 2×2 矩陣（依本場規則集的層決定，不直接看旗標）

| 本場規則集 | 有 binding | 沒有 binding |
|---|---|---|
| core.v1（career.v21） | ① 用 binding，Resolver 套修正表 | ② legacy 戰術：在修正表裡就由 id 重建（修正後的經典＋原本的變體，修正在變體之前） |
| static（career.v20、DEV 工具） | ③ 不用 binding：經典計畫 ⇒ 正式站同一個經典戰術（＋經典變體）；std／v2 計畫 ⇒ 標準運營＋「模板被替換」提示；計畫的每個選擇都列為本場拿掉 | ④ 與正式站 v20 相同 |

- 紅方：AI 教練的 binding 只經 Resolver 套一次；教練排不出來時的風格模板（aggressive→m7、defensive→m8、skirmish→m3）用同一個重建函式套一次，v20 不變（S5）。教練自己的 STYLE_TEMPLATES 不會選到 m3／m7／m8（S5b）。
- 恢復進行中的比賽：沿用落盤的規則集（旗標已關、落盤的是 career.v21 ⇒ 照 v21 打完，S6）。
- 回退只能用旗標；重新部署舊 bundle 會在下一次存檔刪掉玩家的戰術書（第四輪 §3.3，寫進驗收規格）。

### 2.5 存檔與 Replay

- `tacticBook` 存檔切片照常讀寫，兩種旗標狀態都不刪；帶修正表模板與 v21 選擇的計畫存檔→讀回原樣（S10）。
- Live 重播只在記憶體、不重新模擬；Challenge 重播依記下的版本（v20）選規則集。

### 2.6 v21 文案（Owner 第 3 點）

- `TEMPLATE_COPY["v21.b1"]["classic.m7"]`：名稱「前期野區入侵」、風險中、重點打野、描述與缺點逐字照 Owner；**細節（detail）沿用描述**（Owner 未指定，待確認）；archetype、emoji、fit、證據目標、id 都不變（S8）。
- 顯示面：模板列、標題／定位／風險、優勢（detail）、缺點、確認頁名稱、對手情報（含退回名稱）、AI 教練概要、歷史表現列、讀取畫面與對戰 HUD（讀確認時的顯示物件）、賽果與重播名稱（S12：career.v21 下 m7 的 `tacticMeta`／`replayConfig` 名稱是「前期野區入侵」，v20 仍是「前期壓制」）。
- 引擎設定不帶文案（S8b）。
- m3、m8 的文案**沒有改**（Owner 只定了 m7）：m3 的缺點「撤退門檻極低」在 risk 0.5 下不成立、風險標示「高」；m8 風險標示「低」——需 Owner 定稿（凍結前提）。

## 3. 快速回歸（改動前基準 vs 改動後，同一台機器單線）

| gate | 改動前 | 改動後 | 判讀 |
|---|---|---|---|
| `npm run build` | — | built in 19.44s | 通過 |
| **check_stage1_split_3aB（新）** | — | **41/41** | 通過 |
| check_match_setup_3a（含 **v20 黃金 39 案**） | 153/153 | **153/153** | v20 不變 |
| check_challenge_golden_v21 | 6/6 | 6/6 | Challenge 不變 |
| check_challenge_setup_3a | 65/65 | 65/65 | 不變 |
| check_player_challenge_slice1–8 | 108／79／100／60／71／30／35／122 | 相同 | 不變（slice3 §③ 是已知 flaky 統計 gate，這次兩次都 100） |
| check_save_bundle_b1b／hardening_b1c／cloud_save_b1d | 86／76／126 | 相同 | 存檔不變 |
| check_live_setup_3a／ai_coach_3a／balance_runner_setup_3a | 119／11／122 | 相同 | 不變 |
| check_tactical_director_3c／directive_3c／tactic_plan_3a／tactic_replication_3a | 97／61／219／53 | 相同 | 不變 |
| regress／regress2 | 15/15／8/8 | 相同 | 不變（不是戰術改動的證據） |
| check_match_ruleset_3a | 51/51 | 48/51 → 替代斷言後 **51/51** | 預期（R19／R20／R22） |
| check_tactic_book_view_3a | 25/25 | 23/25 → **25/25** | V11 預期；V13 未事前列出（§4） |
| check_tactic_book_ui_3aB | 9/9 | 8/9 → **9/9** | U5b 未事前列出（U5 同族） |
| check_tactic_evidence_scope_3a | 7/7 | 6/7 → **7/7** | E5 預期 |
| check_tactic_save_3a | 38/38 | 35/38 → **38/38** | **M1／M4／M5 未事前列出**（§4） |
| check_career_v21_tactics_c6 | 6/6 | 5/6 → **6/6** | **V4 未事前列出**（§4） |
| check_tactic_truth_3a | 34/34 | 33/34 | T2 過期：預期（matchAssembler.js、matchRuleset.js 改了），凍結時整輪重測 |
| check_career_golden_v21 | 5/5 | 4/5 | setup 雜湊改變（gate 列出 phase-stance s11／s23／s29）：career.v21 多了一層，預期；**未重錄** |
| check_match_golden_v21a | 137/137 | 97/137 | **40 案改變，事前預測錯誤**（§4）；**未重錄** |
| verify --only=tactic24,runtime29 | — | tactic24 29/29（668 秒）、runtime29 flat 35/35（102 秒） | 通過 |
| 瀏覽器 gate | — | **未跑** | 見 §5 |

## 4. 與事前登記不一致的地方（照實記錄）

1. **v21a 黃金 40 案的範圍預測錯了。** 登記寫「只有 career.v21／balanceTool.v21 的案例可能改變」。實際改變的是 `bind-template`（12 個 v2 模板 × 2 seeds＝24 案）與 `bind-choice`（16 案）：它們跑的是 **Live 路徑、career.v20 規則集、帶戰術書 binding**——本分支 Task 12 才有的組合（正式站 v20 從未出現）。總開關讓 career.v20 不再使用 binding，所以這 40 案現在打的是經典戰術或標準運營（同一個 seed 上不同模板結果相同，正是「binding 被忽略」的特徵）。經典模板與 std 的 binding 案、正式站 v20 的 39 案、工具路徑的 12 案都沒變。
2. **四支 gate 的紅燈沒有在登記裡逐條列出**：check_tactic_book_view_3a V13、check_tactic_book_ui_3aB U5b、check_tactic_save_3a M1／M4／M5、check_career_v21_tactics_c6 V4。它們都在驗「career.v20 下仍使用戰術書 binding」（2026-10-25 決策 4 的行為），被總開關取代。替代斷言照登記的同一條規則（case ③）改寫，並保留原本仍然適用的保護：被竄改的 binding 在 career.v21 下照樣被拒絕開局（M5'）、Resolver 的 scope 隔離在函式層照舊（E5'）。
3. 瀏覽器 gate `browser_check_battle_notices_3aB` 的 D 已改成 D1'（多驗模板替換提示），**沒有在瀏覽器跑過**。

## 5. 未驗證的項目

- 瀏覽器：戰術書 v21 在真實 build 開旗標（桌機＋390px）、旗標關閉時的 v20 戰術畫面、對戰中的替換提示（D1'）、讀取畫面與 HUD 的 v21 文案——**全部未經瀏覽器實測**，只有程式與資料層的 gate（S8、S9、S11、S12）。
- 15–18 小時正式驗證（G-A8 確認、E1、E2、career 側偏、證據重播、真實性表、黃金重錄）：依 Owner 指示未啟動。

## 6. 是否具備一次語意凍結與正式重驗的條件

**結論：實作與快速回歸已經就緒，但還不具備凍結條件。** 剩下的是 Owner 決策與兩項開發期工作：

| # | 凍結前提 | 狀態 |
|---|---|---|
| P1 | m3、m8 的 v21 文案（m3 缺點「撤退門檻極低」、風險標示；m8 風險標示） | **待 Owner**（硬前提） |
| P2 | m7 的 detail 沿用描述；career.v21 下賽果／重播顯示 v21 名稱 | **待 Owner 確認** |
| P3 | 總開關取代 2026-10-25 決策 4（career.v20 下不再使用戰術書 binding） | **待 Owner 確認** |
| P4 | career.v20 下 std／v2 計畫的處理（改用標準運營＋替換提示） | **待 Owner 確認**（目前的預設） |
| P5 | m3／m7／m8 現有量測排除列在 v21.b1 下重新判定（新 seeds、事前登記的開發期量測），避免正式真實性重測翻動提供清單、逼出第二次凍結 | 未做（開發期，需登記） |
| P6 | 瀏覽器實測：戰術書 v21（開旗標）、旗標關閉的 v20 畫面、替換提示 | 未做 |
| P7 | 第一階段正式驗收規格（G-A8 確認先跑；STOP 即停止發布並回報）事前登記＋獨立審查 | 草案在登記檔 `formalAcceptance`，未另行登記 |
| P8 | v21a／career 黃金重錄（凍結後、Owner 同意） | 依規定凍結後才做 |

- 凍結時要做的事：重新登記 v21 候選指紋 → 真實性表整輪重測（約 70 分）→ 黃金重錄（Owner 同意）→ 一次性正式重驗（約 15–18 小時，G-A8 確認先跑）。
- 預期風險不變：確認性 G-A8 至少一個模板判 STOP 約 36–57%（three_lane_pressure、m1 不修，mid_jungle_sync 不修）；若 STOP 就停止發布並回報（Owner 第 6 點）。

## 7. 獨立審查紀錄

REVIEW_SECTION
