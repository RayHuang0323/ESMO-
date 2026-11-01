# Phase 3a-B 第一階段：發布規格登記與最小實作（Live 戰術 v21 先發布、Challenge 留 v20）

- 日期：2026-10-30（開發期實作；**未凍結語意、未跑 15–18 小時正式驗證、未啟用任何發布旗標**）
- 分支：`feature/moba-phase3a-stage1`（本機，從 `feature/moba-phase3a` 的登記 commit `f3986c44` 分出；未 push／deploy／整合 main，未碰 CS）
- 依據：Owner 2026-10-30 第三次裁定（六項決策；下一步＝第一階段發布規格的事前登記、獨立審查、最小實作與快速回歸）
- 事前登記：`tools/fixtures/stage1_release_registration_3aB.json`（`f3986c44`）
- 新 gate：`tools/check_stage1_split_3aB.mjs`（S1–S16，44 條）

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
| 實作審查（第 1 次） | APPROVE WITH CHANGES：3 Major／7 minor，全部採納（矛盾提示改用修正表引擎、skeleton 漏跑、戰術存檔三條斷言變空轉、存檔預設名稱、std 不算替換、legacy 只在確實是經典＋變體時重建／改名、植入模板設定不被覆蓋）。修 gate 之前先把替代斷言登記在 `424d93ad` |
| 實作審查（第 2 次） | APPROVE WITH CHANGES：5 minor，全部採納（推導清單釘 6 個、XP1′ 計數並點名 m7 案例、M10 前置條件、賽後執行度目標列入凍結前提、提交） |

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


## 3. 快速回歸（改動前基準 vs 改動後；基準在 `f3986c44` 的臨時 worktree 上跑，同一台機器單線）

| 類別 | gate | 改動前 | 改動後（最終） | 判讀 |
|---|---|---|---|---|
| build | `npm run build` | — | built in 22.92s | 通過 |
| 新 gate | check_stage1_split_3aB | — | **44/44** | 通過 |
| **v20** | check_match_setup_3a（含 **v20 黃金 39 案**） | 153/153 | **153/153** | v20 不變 |
| Challenge | check_challenge_golden_v21／challenge_setup_3a／player_challenge_slice1–8／challenge_snapshot_fatigue_g4 | 全綠 | 全綠 | Challenge 不變（slice3 §③ 是已登記 flaky，兩次都 100） |
| 存檔 | check_save_bundle_b1b／save_hardening_b1c／cloud_save_b1d | 86／76／126 | 相同 | 存檔不變 |
| Live／AI | check_live_setup_3a／ai_coach_3a／balance_runner_setup_3a | 119／11／122 | 相同 | 不變 |
| Phase 3a | tactical_director_3c 97、directive_3c 61、tactic_plan_3a 219、replication_3a 53、indicators_3a 59、match_assembler_3a 227、setup_contract_3a 85、tactical_ai_p1 20、p2 33、phase_bucket_c3 23、phase_choices_c3 24、phase_study_c3 10、win_condition_c6 11、c7_diag_3c 9、study_seed_plan 34 | 全綠 | 相同 | 不變 |
| 替代斷言後恢復 | match_ruleset_3a 51、tactic_book_view_3a 25、tactic_book_ui_3aB 9、tactic_evidence_scope_3a 7、tactic_save_3a 39、career_v21_tactics_c6 6、tactic_registry_3a 35、tactic_resolver_3a 139、c3_phase_skeleton 171、laneframe_c3 55 | 全綠 | 全綠（替代斷言後） | 見 §4 |
| verify | tactic24／runtime29 | — | 29/29／flat 35/35 | 通過 |
| regress | regress／regress2 | 15/15／8/8 | 相同 | 不變（不是戰術改動的證據） |
| 預期紅（未重錄） | check_match_golden_v21a | 137/137 | 97/137 | 40 案（§4-1），兩次執行同一批 |
| 預期紅（未重錄） | check_career_golden_v21 | 5/5 | 4/5 | career.v21 多一層 ⇒ setup 雜湊 |
| 預期過期 | check_tactic_truth_3a | 34/34 | 33/34 | T2：語意檔改了，凍結時整輪重測 |
| 既有紅（不是回歸） | check_tactical_identity_v17 E1／E5、check_hero_skills_phase1 | 紅 | 紅 | 改動前基準就是紅 |
| **瀏覽器** | browser_check_tactic_book_v21（旗標開，桌機＋390） | — | **30/30** | 通過 |
| **瀏覽器** | browser_check_tactic_book_3a（元件在 static 下） | — | **31/31** | 通過 |
| **瀏覽器** | browser_check_battle_notices_3aB（D1′） | — | **11/11** | 通過 |

## 4. 與事前登記不一致的地方，以及怎麼處理（照實記錄）

1. **v21a 黃金 40 案的範圍預測錯了**：登記寫「只有 career.v21／balanceTool.v21 的案例會變」；實際變的是 Live 路徑、**career.v20＋戰術書 binding** 的 `bind-template`（12 個 v2 模板 × 2）與 `bind-choice`（16 案）——本分支才有、正式站沒有的組合。總開關讓 career.v20 不用 binding，所以它們改打經典戰術或標準運營。正式站 v20 的 39 案、經典模板與 std 的 binding 案、工具路徑都沒變。**未重錄**。
2. **第一次回歸沒有涵蓋所有 Phase 3a gate**（實作審查 M2）：補跑完整清單後找到 15 條新紅（skeleton 11、laneframe 1、registry 1、resolver 2），全部是改動的直接結果；替代斷言**先登記（`424d93ad`）後改 gate**：
   - skeleton／laneframe：預期改變集合多一份「由修正表推導」的 6 案（m3／m7／m8 的 bind-template），仍要求**完全相同**，並釘住 6 個；
   - registry U1′／resolver XP1′：計畫接受＝出貨版與修正表結構提供的聯集（m7 前期強邊上路是點名案例）；
   - resolver D1′：變體函式多兩個合法呼叫端（liveMatchSetup、tacticTemplates），只套計畫或設定已記下的變體。
3. **登記沒逐條列出、但同一條核准規則造成的替代斷言**：V13′、U5b′、M1′／M4′／M5′、V4′；實作審查指出 M6／M2／P1 變空轉，已改在 career.v21 下測並新增 M10。
4. 新規則：std 計畫在 v20 下打的就是標準運營，不算「替換」（只列出拿掉的選擇）；v2 計畫才顯示替換。

## 5. 仍未驗證的項目

- 瀏覽器沒有直接看到：v2 計畫在旗標關閉時的「替換」那一行（390px）、讀取畫面與對戰 HUD 上的 m7 v21 文案（node gate S8／S12／S15 有驗）、旗標關閉時經 AppShell 進到 v20 戰術畫面的完整流程（S9 以逐字副本＋解析函式驗）。
- 15–18 小時正式驗證：依 Owner 指示未啟動。

## 6. 是否具備一次語意凍結與正式重驗的條件

**結論：實作、快速回歸與兩次實作審查都完成；凍結前只剩 Owner 決策與兩項開發期工作。**

| # | 凍結前提 | 狀態 |
|---|---|---|
| P1 | m3、m8 的 v21 文案（m3 缺點「撤退門檻極低」在 risk 0.5 下不成立、風險標示；m8 風險標示） | **待 Owner**（硬前提） |
| P2 | m7 的 detail 沿用描述；career.v21 下賽果／重播顯示 v21 名稱 | **待 Owner 確認** |
| P3 | 總開關取代 2026-10-25 決策 4（career.v20 下不再使用戰術書 binding） | **待 Owner 確認** |
| P4 | career.v20 下 std／v2 計畫的處理（std＝標準運營、v2＝標準運營＋替換提示） | **待 Owner 確認** |
| P5 | 賽後「戰術執行」仍用 v20 的證據目標（例：m7 推塔波次 6）而名稱是 v21 的——v21 要不要有自己的證據目標 | **待 Owner**（第二次審查提出） |
| P6 | m3／m7／m8 現有量測排除列在 v21.b1 下重新判定（新 seeds、事前登記的開發期量測） | 未做 |
| P7 | 第一階段正式驗收規格（G-A8 確認先跑；STOP 即停止發布並回報）另行事前登記＋獨立審查 | 草案在登記檔 `formalAcceptance` |
| P8 | v21a／career 黃金重錄 | 依規定凍結後、Owner 同意才做 |

- 凍結時：重新登記 v21 候選指紋 → 真實性表整輪重測（約 70 分）→ 黃金重錄（Owner 同意）→ 一次性正式重驗（約 15–18 小時，G-A8 確認先跑）。
- 預期風險不變：確認性 G-A8 至少一個模板判 STOP 約 36–57%；若 STOP 就停止發布並回報（Owner 第 6 點）。

## 7. 本輪 commit（本機分支 `feature/moba-phase3a-stage1`）

- `f3986c44` 第一階段事前登記（兩輪審查）
- `424d93ad` 實作審查結論與第二輪替代斷言（先於改 gate）
- `9a98e36e` 實作與第一批替代斷言（WIP）
- 本文件與最終修正的 commit（見 05）
