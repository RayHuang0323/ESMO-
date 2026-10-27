# Phase 3a-B P2 執行紀錄（發布量測）

- 日期：2026-10-25 登記 → 2026-10-27 第一次停在 Owner Review → 2026-10-28 完成兩項核准研究，再次停在 Owner Review
- 分支：`feature/moba-phase3a`（本機；未 push／deploy／整合 main，發布旗標未啟用，未碰 CS）
- 語意凍結：`176ccac0`，`moba-sim.v21` 候選指紋 `0578fa882d74b205`；P2 期間 `src/` 未改
- 依據：Owner 2026-10-25 條件式核准 P2；2026-10-27 當機後恢復；同日兩次裁定（G-A8 方案 (b)＋(c)、Challenge 側偏方案 (a)）

## 1. 進度總覽

| 項目 | 狀態 | Commit |
|---|---|---|
| P2-1 真實性表正式重測（6,520 場） | 完成：147 列、排除、不對稱與前一版逐位元相同 | `1d64ecd6` |
| challenge.v21 黃金在凍結指紋重錄並釘死 | 完成 6/6 | `0e0cb5a2` `17f41038` |
| 證據延續重播（凍結指紋） | 完成：2,600/2,600 場逐值相同 | `d130c7e4` |
| P2-2 E1 經濟／疊加（8,400 場） | **PASS**（含 WARN） | `1eaeee2c` |
| P2-3 E2 career.v21 正式入口行為（1,600 場） | **PASS** | `a161b443` |
| P2-4 G-A8 主導戰術掃描（8,400 場） | **STOP**（保留） | `0024a067` |
| P2-4b G-A8 v20 對照診斷（8,400 場） | 完成（診斷，不改判定） | 登記 `6a3d9464`，結果 `f7abd883` |
| P2-5 側偏 career（4,058 場） | **PASS** | `c07e0481` |
| P2-5 側偏 challenge（4,098 場） | **STOP**（保留） | `b2af521b` |
| P2-5b challenge 雙向配對研究（4,098 場） | **SIDE_CONFIRMED ⇒ STOP 保留**（§8.1） | 登記 `64980533`，Owner 確認 `d3ae9ae2`，結果 `6a805453` |
| P2-4c G-A8 方案 A 旋鈕診斷（18,400 場） | 完成：DIAGNOSED，G-A8 維持 STOP（§8.2） | 登記 `1768e753` `e110d401` `c7aa5b0a`，結果 `85f173a2` |
| P2-6 career.v21 黃金（24 案） | 完成 5/5 | `7e28b1d3` |
| 完整 Node gate（42 支） | 42/42（修正一支過期斷言後） | `fb7045a1` |
| build | 通過 | — |
| verify 全套／瀏覽器 gate | 無新回歸（見 §7） | — |

當機恢復：G-A8 在 `defensive_hold` 234/400 處中斷，於同一資料夾續跑剩下的 166 場；challenge 側偏被記憶體保護砍在 271/4,098，等 Owner 說「繼續」後同資料夾續跑。兩者都沒有重跑有效場次，也沒有改門檻。

## 2. G-A8 版本對照（v20 vs v21，同 seeds）

方法：與 G-A8 相同的 21 模板 × 400 seeds、紅藍交替，只把規則集換成 `balanceTool.v20`（Director static、laneFrame legacyMirror）。事前登記 `tools/fixtures/ga8_v20_control_registration_3aB.json`；可比性 C1–C6 8/8 通過後才開跑；Reviewer APPROVE（第 2 輪）。結果：`tools/fixtures/ga8_v20_control_result_3aB.json`，錯誤 0，儀器／C6 違規 0。

預期（開跑前由 Reviewer 指出並登記）：沒有 v21 專用選擇時，v21 與 v20 的旋鈕相同，唯一差別是紅方路線鏡像（TD-3A-23）⇒ 當藍方的那一半必然逐場相同，資訊全在當紅方的那一半。實測吻合：所有「當藍方」配對差 0。

| 模板 | v20 | v21 | 配對差 D（95% CI） | 紅半 +/− | 分類 |
|---|---|---|---|---|---|
| classic.m3 | 68.3% | 68.3% | 0.0 | 0/0 | **PRE_EXISTING（STOP）** |
| classic.m7 | 67.3% | 67.3% | 0.0 | 0/0 | **PRE_EXISTING（STOP）** |
| classic.m1 | 60.3% | 60.3% | 0.0 | 0/0 | **PRE_EXISTING（STOP）** |
| v2.three_lane_pressure | 60.3% | 60.3% | 0.0 | 0/0 | **PRE_EXISTING（STOP）**，v20 數字為反事實 |
| v2.mid_jungle_sync | 60.3% | 60.3% | 0.0 | 0/0 | **PRE_EXISTING（STOP）**，v20 數字為反事實 |
| classic.m2 | **61.5%** | 54.8% | −6.8（−11.5..−2.0） | 35/62，p 0.008 | **只有 v20 是 STOP**（v21 的路線修正把它拉回來） |
| classic.m5 | 57.0% | 59.8% | +2.8（−1.9..7.4） | 50/39，p 0.29 | PRE_EXISTING（WARN 強） |
| classic.m6 | 59.0% | 59.0% | 0.0 | 0/0 | PRE_EXISTING（WARN 強） |
| v2.hard_engage_stack | 57.5% | 57.5% | 0.0 | 0/0 | PRE_EXISTING（WARN 強） |
| classic.m8 | 36.3% | 36.3% | 0.0 | 0/0 | PRE_EXISTING（WARN 弱） |
| v2.defensive_hold | 28.5% | 28.5% | 0.0 | 0/0 | PRE_EXISTING（WARN 弱） |
| v2.mid_solo_split | 46.3% | 42.3% | −4.0（−8.9..0.9） | 43/59，p 0.14 | **UNRESOLVED**（v21 偏弱，差異未達顯著） |
| classic.m4 | 41.8% | 44.5% | +2.8（−2.0..7.5） | 52/41 | 只有 v20 是 WARN 弱 |
| v2.protect_core_scaling | 40.0% | 43.8% | +3.8（−1.3..8.8） | 60/45 | 只有 v20 是 WARN 弱 |
| std（對照） | 54.8% | 54.8% | 0.0 | 0/0 | 兩版都在 0.50 ± 0.05 內 |

其餘模板（jungle_invasion、bot_duo_pressure、support_roamer、dragon_pit_macro、top_solo_split、standard_macro）兩版都沒有旗標。

**結論（照 Owner 裁定措辭）**
- 五個 STOP 模板在 v20 以相同 seeds 得到**逐位元相同**的勝率 ⇒ 這個主導戰術問題在 v20 規則下就存在（其中 three_lane_pressure、mid_jungle_sync 是 v2 模板，v20 從未上線，它們的 v20 數字是反事實；三個 classic 模板是正式站實際存在的問題）。這是**證據**，不再只是推測；但它**不是 PASS**：G-A8 判定維持 STOP，五個模板仍阻擋 v21 正式發布。
- v21 沒有讓任何模板新進 STOP；反而 classic.m2 在 v20 是 STOP、在 v21 不是（紅半顯著改善，p 0.008），符合 TD-3A-23 修正的方向。
- v2.* 模板 v20 從未上線，那 12 列的 v20 數字是反事實，只用來分辨原因。

## 3. G-A8 原因線索與修正方案（只是提案；未改係數、未隱藏模板、未改 Registry）

**描述性線索（事後、未事前登記，不是證據）**：21 個模板的勝率與 `macro.aggression` 相關 r = 0.92，與 `macro.riskTolerance` 相關 r = 0.86；但這兩個旋鈕彼此相關 r = 0.95，不是兩條獨立線索，而且高侵略模板同時在 lanePlan、objectives、tempo 上也不同（例如 m1 towerPriority 0.9），有混淆。對應只是**部分**的：STOP 的 m3 0.8／0.8、m7 0.85／0.85 在高端，m1 0.65／0.6、three_lane_pressure 0.7／0.6 中高，mid_jungle_sync 0.6／0.5（riskTolerance 與 std 相同）；反過來 m6 0.7／0.7（59.0%）、hard_engage_stack 0.7／0.7（57.5%）、jungle_invasion 0.65／0.7（53.3%）旋鈕更高卻不是 STOP。最弱的 m8、defensive_hold 都是 0.25／0.2。⇒ 假說是「侵略／風險帶來的收益大於引擎目前給的代價」：riskTolerance 已會移動 retreatAt、retreatFloorShift、commitShift（`MobaTacticConfig.js:252, 289–290`），問題比較可能是代價不夠，而不是沒有代價。

| 方案 | 內容 | 代價／風險 | 需要 |
|---|---|---|---|
| A. 先確認假說（建議第一步） | 事前登記一個旋鈕掃描：以 std 為底、固定其餘旋鈕，aggression 與 riskTolerance **分開掃**（因子設計，例如各 0.2–0.9 數個點交叉 × 新 seeds；兩者共線，一起動就分不出是哪一個），再加一組「只換 lanePlan／objectives、旋鈕不動」的對照，看勝率是不是單調、在哪裡跨過 0.60 | 只有量測，約 1.5–2 小時；不改語意 | Owner 核准登記 |
| B. 補代價（根本修正） | 高侵略／高風險時，引擎的追擊與越塔決策要承擔更高的被反打風險（例如撤退門檻、追擊距離隨風險上升的懲罰） | 語意變更 ⇒ 重新登記 v21 指紋、真實性表整輪重測（約 2 小時）、所有黃金重錄、G-A8 與 E1／E2／側偏重跑（約 12 小時） | Owner 核准語意變更＋新的事前登記 |
| C. 壓縮旋鈕幅度（資料修正） | 模板的 aggression／riskTolerance 與 0.5 的距離乘上一個係數 | 改的是模板資料，不改引擎；但會改所有用到這些模板的雜湊與黃金；m3／m7 的「個性」會變淡 | Owner 核准改 Registry／模板；仍要重跑 G-A8 |
| D. 不修，改成揭露 | 保留模板，在戰術書標示強度並把 STOP 模板移出 AI 對手可選範圍 | 玩家仍可選到主導戰術；與 G-A8 的目的衝突 | Owner 改變發布標準（不建議） |

建議順序：A → 依結果選 B 或 C。任何方案都要用**新 seeds** 重跑 G-A8（原門檻不變），不得用這次已觀察到的結果調門檻。

## 4. 偏弱模板風險紀錄（Owner 裁定第 6 點）

| 模板 | v21 | v20 | 風險 |
|---|---|---|---|
| v2.defensive_hold | 28.5% | 28.5% | 最弱；玩家選了幾乎必輸。與 G-A8 主導戰術是同一個旋鈕軸的另一端 |
| classic.m8 | 36.3% | 36.3% | 同上 |
| v2.mid_solo_split | 42.3% | 46.3% | v21 比 v20 低 4.0pp（UNRESOLVED，CI −8.9..0.9），可能跟紅方路線修正有關，需再觀察 |
| v2.support_roamer | 44.0% | 44.3% | 未達 WARN，接近邊界 |
| classic.m4／v2.protect_core_scaling | 44.5%／43.8% | 41.8%／40.0% | v21 已離開 WARN 區，但仍偏弱 |

這些都納入後續平衡評估；修 G-A8 時（方案 B／C）要同時看弱端是否被拉回，不能只壓強端。

## 5. 紅藍側偏（兩種單位並列，Owner 裁定第 4 點）

定義：
- **藍方勝率變動 pp** ＝（v21 藍方勝率 − v20 藍方勝率）× 100
- **側偏惡化 pp（worse_pp）** ＝（|v21 藍方勝率 − 50%| − |v20 藍方勝率 − 50%|）× 100，也就是「離 50% 的距離」變大多少。判準用這一欄，加上配對 z 與時長比（登記原文：STOP＝惡化 ≥ 5pp，或在惡化方向 z ≥ 3；WARN＝惡化 ≥ 3pp，或時長中位數比偏離 > 10%）。
- 兩者的關係：v20、v21 都在 50% 以上時**相等**；都在 50% 以下時**大小相同、正負號相反**（career 就是這樣：藍勝上升 1.75pp＝側偏改善 1.75pp）；跨過 50% 時才真的不同（challenge STANDARD 49.4% → 54.7%：勝率變動 +5.34、側偏惡化 +4.10）。
- 兩欄都用未四捨五入的勝率計算（來源 `side_bias_result_*_3aB.json`）。

| 研究 | 佈局 | v20 藍勝 | v21 藍勝 | 勝率變動 | 側偏惡化 | z | 判定 |
|---|---|---|---|---|---|---|---|
| career | STANDARD | 39.8% | 41.6% | +1.75 | **−1.75** | −0.89 | PASS |
| career | SWAPPED | 32.1% | 35.5% | +3.40 | **−3.40** | −1.71 | PASS |
| challenge | STANDARD | 49.4% | 54.7% | +5.34 | **+4.10** | 3.46 | STOP（z ≥ 3） |
| challenge | SWAPPED | 50.6% | 58.3% | +7.60 | **+7.60** | 4.56 | STOP（≥ 5） |

（佈局欄：career 是實際地圖；challenge 是 seed 的 bySeed 分層——challenge.v20 永遠打 STANDARD 地圖，所以 challenge SWAPPED 那列的 v20 50.6% 其實是 STANDARD 地圖，該列的比較混入了換地圖的效果。）

**Challenge STOP 的限制**：登記的研究每個配對只跑一個方向（挑戰者永遠在藍方），所以「藍方」混入了挑戰者隊伍的強弱。例：rotation 對 balanced 64.1% → 97.1%，mirror 對 topheavy 68.5% → 53.9%。v21 同時開了技能、依 seed 換佈局、接 Director，隊伍強弱的變化會直接出現在藍方勝率裡。

**雙向配對研究（P2-5b，已登記未開跑）**：同 seed、同兩隊、同凍結的選角、同戰術，只交換紅藍。用 s＝（正向藍勝＋反向藍勝）／2 在期望上消掉隊伍強弱的主效應（隊伍×邊的交互作用——包括 v20 legacyMirror 讓同一戰術在紅方表現不同——以及 TD-21 引擎順序、laneFrame 修正的效果仍留在 S 裡，所以 S 不是「純地圖側」），再用同一套 STOP／WARN 判準比較 v20 與 v21。驗證 V1–V4 5/5（V1：工具路徑與既有 80 筆 runChallenge 紀錄逐場相同）；審查 APPROVE（第 2 輪）。正式跑 4,098 場（登記估約 80 分鐘，3 workers），**需要 Owner 在登記檔填 `owner.confirmedAt` 才會開跑**（工具會擋）。任何結果標籤都不是發布 PASS；challenge 側偏維持 STOP、challenge.v21 維持旗標關閉。

## 6. Reviewer

| 標的 | 結果 |
|---|---|
| P2 四份事前登記 | 兩輪；APPROVE WITH CHANGES 全部採納 → APPROVE（`7f44d19f` `176ccac0`） |
| G-A8 v20 對照登記＋工具 | APPROVE WITH CHANGES（9 項，含 C3 子行程繼承 `ESMO_BALANCE_SKILLS` 永遠過不了）→ 全部採納 → APPROVE |
| challenge 雙向登記＋工具 | APPROVE WITH CHANGES（3 Major／5 minor，含即時檢查用錯欄位而空轉）→ 全部採納 → APPROVE |
| P2 收尾（本紀錄、文件、gate 修正） | APPROVE WITH CHANGES（1 Major：側偏兩欄單位四捨五入不一致；8 minor）→ 全部採納 |
| G-A8 旋鈕診斷登記＋工具 | 第 1 輪 APPROVE WITH CHANGES（3 Major／8 minor）→ 採納（另以程式碼更正 reviewer 對 risk 可選值的誤判，第 2 輪確認）；第 2 輪 APPROVE WITH CHANGES（R1–R4）→ 採納 |
| 兩項研究結果與白話分析（§8–§10） | APPROVE WITH CHANGES（7 Major／5 minor：側別／強弱變化量口徑、「兩個旋鈕一起才強」過度解讀、「沒偵測到」寫成「沒有」、m3 順序相依、m7 只壓 risk 仍 60.0%、機制因果過頭、**C 的成本估錯——模板檔是語意檔，C 同樣換指紋**）→ 全部採納 |

## 7. 測試

- 42 支 Node gate（逐支單線，45.5 分）：41/42 → 修 `check_tactic_book_view_3a` V11 後 42/42。V11 是比對原始碼文字的斷言，P1 審查修正 `dcfa341c` 把同一個呼叫拆成兩步，行為相同、斷言過期；修正只放寬寫法比對（`fb7045a1`），不是 P2 回歸。
- `npm run build`：built in 33.39s；dist 0 個檔案含 `heroSkillsDev`。
- `node tools/verify.mjs` 全套：51/118 段通過；67 段紅**全部**在 v20 發布基準（`v20-baseline-1d0e219` 狀態檔）就紅，失敗訊息逐字相同 67/67 ⇒ 沒有新的回歸。Phase 3a 各段、tactic24、runtime29、experience26、regress／regress2 都 PASS。
- 瀏覽器（單線）：tactic book v21 30/30、static 31/31、battle notices 3a-B 11/11、exit flush 12/12、Player Challenge slice8 50/50。

## 8. 2026-10-27 Owner 裁定後的兩項研究

Owner 裁定（2026-10-27）：核准 challenge 雙向研究正式開跑；核准 G-A8 方案 A（旋鈕分開掃描，事前登記、獨立 Reviewer 通過後可自主執行）；方案 B／C 暫不授權；兩項 STOP 保留、v21 發布旗標關閉。兩項研究依序單線執行，都用 checkpoint。

### 8.1 Challenge 雙向配對研究（P2-5b）

- 登記 `tools/fixtures/challenge_bidir_registration_3aB.json`（Owner 確認 `d3ae9ae2`）；結果 `tools/fixtures/challenge_bidir_result_3aB.json`（`6a805453`）。
- 新跑 4,098 場（反向 × v20／v21 兩版，2,049 seeds），正向重用已提交的單向研究紀錄；錯誤 0、無效 0，85.5 分鐘。時長比 0.950／0.953，未觸發 WARN。
- **判定 STOP ⇒ SIDE_CONFIRMED**，challenge 側偏 STOP 不變。

拆成三塊來看：

| 成分 | 數字 | 解讀 |
|---|---|---|
| **側別**（S＝正反兩向藍勝平均，在期望上消掉隊伍強弱主效應） | STANDARD：v20 −2.7pp → v21 +0.8pp（側偏惡化 −1.91pp，z −3.16，未觸發）<br>SWAPPED：v20 −1.2pp → v21 +3.1pp（側偏惡化 +1.93pp，上界 4.15，**z 3.86 ⇒ STOP**） | v21 讓藍方優勢變大約 2pp（以「離 50% 的距離」計）。合併拆解：v21 純藍方 +2.0pp、巨龍側 −1.2pp。S 仍含引擎順序（TD-21）與 laneFrame 修正，不是純地利 |
| **隊伍強弱** | SWAPPED：v21 單向藍勝 58.3%，偏離 50% 的 8.3pp 中 5.1pp 是強弱項、3.1pp 是側別（STANDARD：4.0 vs 0.8）。**從 v20 到 v21 增加的 7.6pp 裡，側別占 +4.4pp、強弱項占 +3.2pp**；用登記的「側偏大小」口徑看，側別惡化 1.9pp（v20 的 −1.2pp 先被抵銷才翻正） | 單向研究的藍勝同時混了兩者；兩者都有份 |
| **交互作用**（配對 × 版本） | mirror 對 topheavy：挑戰隊勝率 71.3% → 48.2%（−23.0pp，CI −27.4..−18.7），強弱翻轉<br>rotation 對 balanced：65.2% → 95.4%（+30.3pp，CI 26.7..33.8），強弱放大<br>其餘三組變動 ≤ 2.4pp | v21（技能、佈局、Director）讓特定陣容強弱大幅改變；這主要是**強弱的平衡訊號**（mirror／topheavy 的 v21 側別也有 +5.7pp），會影響挑戰模式的體感 |

限制：S 仍含隊伍 × 邊的交互（含 v20 legacyMirror 與 TD-21 引擎順序），所以不是「純地圖側」；判準與登記相同，沒有依結果調整。

### 8.2 G-A8 方案 A：旋鈕診斷研究（P2-4c）

- 登記 `tools/fixtures/ga8_knob_registration_3aB.json`（`1768e753` → 第 1 輪審查 `e110d401` → 第 2 輪 `c7aa5b0a`）；工具 `tools/measure_ga8_knob_3aB.mjs`（selftest 9/9）。
- 驗證 5/5：V4 G-A8 資料夾完整；V2 46 臂設定只改宣告欄位；V3a 旋鈕非空轉；**V1 legacy 路徑與 G-A8 紀錄 180 場逐場相同**；V3b 254 場確認 t＝0 的 Director 數值＝臂設定。
- 正式 18,400 場（46 臂 × G-A8 的 400 seeds，配對），錯誤 0，374.6 分；9 個重複臂 400/400 與 G-A8 相同。結果 `tools/fixtures/ga8_knob_result_3aB.json`（`85f173a2`）。**outcome DIAGNOSED；G-A8 維持 STOP**。

名詞：FULL＝原模板；NEUTRAL＝原模板內容但旋鈕回 0.5／0.5；K＝FULL − NEUTRAL（旋鈕效果）；C＝NEUTRAL − std（內容效果）；Kstd＝把同一組旋鈕放到 std 上的效果；I＝K − Kstd（旋鈕與模板內容的交互）。數字是勝率 pp，括號是 95% CI（未校正）。

| 模板（旋鈕） | 原模板 | 旋鈕回中 | 只回中 aggression／只回中 risk | std＋同旋鈕 | K 旋鈕效果 | C 內容效果 | 標籤／歸因 |
|---|---|---|---|---|---|---|---|
| classic.m3（0.8／0.8） | 68.3% | 54.5% | 59.0%／56.3% | 61.5% | **+13.8**（6.9..20.6） | −0.3 | KNOB_DRIVEN（邊界）。旋鈕整體效果明確，但**拆不出是哪一個**（ORDER_DEPENDENT：順序 A 只有 aggression 顯著、順序 B 只有 risk 顯著；BOTH 是平均後的結果）；沒有觸發任何提示 |
| classic.m7（0.85／0.85） | 67.3% | 55.8% | 66.5%／**60.0%** | 62.0% | **+11.5**（5.2..17.8） | +1.0 | KNOB_DRIVEN（邊界）／**主要是 riskTolerance**（Krisk +9.0；Kagg +2.5 不顯著）；提示 RISK_C_SUFFICES_FOR_REACHABILITY。但只把 risk 回 0.5 仍是 60.0%（STOP 邊界） |
| classic.m1（0.65／0.6） | 60.3% | 55.0% | 52.8%／59.0% | 53.5% | +5.3（−1.5..12.0） | +0.3 | UNRESOLVED（邊界） |
| v2.three_lane_pressure（0.7／0.6） | 60.3% | 57.0% | 59.3%／55.3% | 59.8% | +3.3（−3.3..9.8） | +2.3 | CONTENT_DRIVEN（邊界）：依登記，意思是「在這個檢定力下沒偵測到旋鈕效果」（MDE 約 9.3pp） |
| v2.mid_jungle_sync（0.6／0.5） | 60.3% | 51.7% | — | 52.0% | **+8.5**（1.5..15.5） | −3.0 | KNOB_DRIVEN／只變 aggression；提示 FAVOURS_C：**只在這個模板內容上才強**（I +11.3，1.4..21.1）。經 Bonferroni 校正後 K 下界 −1.2，不顯著 |
| v2.defensive_hold（0.25／0.2） | 28.5% | 32.0% | 29.8%／33.3% | 36.5% | −3.5 | **−22.8**（−29.5..−16.0） | CONTENT_DRIVEN：內容本身就極弱 |
| classic.m8（0.25／0.2） | 36.3% | 43.3% | 40.8%／42.5% | 36.5% | −7.0（−13.8..−0.2） | **−11.5** | KNOB_DRIVEN（邊界）／歸因 NONE。旋鈕回中後的勝率區間含 43%，所以 KNOB_DRIVEN 與 MIXED 由資料決定不了 |
| v2.mid_solo_split（0.45／0.5） | 42.3% | 46.5% | — | 52.5% | −4.3 | −8.3（−15.2..−1.3） | UNRESOLVED（邊界），內容偏弱 |
| std（0.5／0.5） | 54.8% | — | — | — | — | — | 對照 |

std 上的單旋鈕掃描（\* ＝玩家在戰術書選得到）：
- aggression：0.2 46.0、0.25\* 50.2、0.35 50.5、0.45 52.5、0.5\* 54.8、0.6 52.0、0.65 51.5、0.8 58.5（WARN 強）、0.85\* 53.5；斜率每 +0.1 約 +1.1pp（0.4..1.9），**不單調**。
- riskTolerance：0.2 44.8、0.35 50.2、0.5\* 54.8、0.65 57.8（WARN 強）、0.8 52.0；斜率每 +0.1 約 +1.5pp（0.4..2.5），**不單調**。
- 兩個旋鈕同時拉高：std＋0.8／0.8 61.5%、std＋0.85／0.85 62.0%，**點估計**落在 STOP 區，但都是單臂結果，CI 下界約 56.7／57.2；0.8／0.8 的聯合交互 +5.8（−4.3..15.8，不顯著）。同時壓低：std＋0.25／0.2 36.5%（WARN 弱）。

機制（描述性、無 CI）：旋鈕效果伴隨少丟塔（m3 每場少 0.32 座、m7 0.20 座、mid_jungle_sync 0.27 座）；m7 的擊殺差反而減少約 1.1。少丟塔本來就是勝場多的自然結果之一，不能證明是「守得住」造成的。

注意：
- 每個標籤都用 G-A8 已用過的 seeds 計算，是**診斷**，不是 G-A8 重跑；多個模板落在邊界。任何修正都必須用**新 seeds**、原門檻重跑 G-A8。
- 區間未做多重比較校正；Bonferroni 參考下，m3、m7 的 K 仍成立，mid_jungle_sync 不成立。
- 模板的時期姿態與 aggression 共用接戰通道，所以「內容效果」有一部分其實是另一種形式的積極度。

## 9. 白話分析（給 Owner）

**問題根因**
1. 登記的 FAVOURS_B 條件**沒有成立**：玩家在戰術書選得到的兩個點（std 上 aggression 0.85、0.25）都沒有 STOP／WARN 標籤（53.5%、50.2%；std 54.8%）；riskTolerance 玩家只能選 0.5。但 aggression 整體有小幅正斜率，旁邊的 0.8 是 WARN 強——這只表示**這次沒偵測到**，不代表戰術書的選項一定安全。
2. 過強主要來自**模板自己內建的高旋鈕值**：m3、m7 的旋鈕回 0.5 後掉回 54–56%；同一組旋鈕放到中性的 std 上，點估計也有 61–62%。但「一定要兩個旋鈕一起才強」**現有資料斷定不了**：聯合交互不顯著，單一旋鈕的曲線不單調、雜訊大。
3. 各模板不同：
   - m7 主要來自 riskTolerance（K +11.5 中 Krisk +9.0）。
   - m3 旋鈕整體效果明確，但拆不出是哪一個。
   - mid_jungle_sync 是旋鈕和它自己的路線／目標內容互相加乘，旋鈕放到 std 上沒效果；校正多重比較後不顯著。
4. 弱端同理反向：0.25／0.2 的組合本身偏弱（std 上 36.5%）；defensive_hold 另外連內容本身都弱（旋鈕回中後仍只有 32%）。
5. m1、three_lane_pressure 落在 60% 門檻邊緣，這次的檢定力不足以歸因（K 不顯著）。

**對遊戲平衡的實際影響**
- 三個 classic 模板（m3、m7、m1）**v20 正式站就已存在**：選 m3／m7 的隊伍在這批 seeds 上約 67–68% 勝率，比 std 高約 13pp，是玩家容易發現的「最優解」。v2 的兩個（three_lane_pressure、mid_jungle_sync）尚未上線。
- 另一端 defensive_hold 28.5%、m8 36.3%：選了幾乎必輸，等於戰術書裡有「陷阱選項」。
- 戰術書本身開放的選擇（團戰姿態、風險只開放平衡），這次**沒偵測到**新的主導策略。

**B 還是 C 比較合理**：**偏向 C（改模板資料）**，但有前提與限制：
- 支持 C 的登記條件：m7 觸發 RISK_C_SUFFICES_FOR_REACHABILITY（risk 0.85 只存在於模板本身）；mid_jungle_sync 觸發 FAVOURS_C（但校正後不顯著）。沒有任何模板觸發 FAVOURS_B。
- m3 沒有觸發任何提示；「C 比較合理」對 m3 **沒有登記條件支持**，只是 K 明確、Kstd 也偏強的描述性推論。
- C 能解決問題的前提是**玩家選不到高 riskTolerance**。Kstd 顯示這組旋鈕在 std 上也偏強；若日後開放「大膽」（0.8，目前被 MEASURED_EXCLUSIONS 排除），問題會回來。
- C 不能只是「把旋鈕往 0.5 壓」：
  - m7 只把 risk 回 0.5 仍是 60.0%（STOP 邊界），兩個旋鈕要一起考慮。
  - three_lane_pressure、defensive_hold 是 CONTENT_DRIVEN，要動的是模板內容（lanePlan／objectives／時期姿態）。
  - m1、mid_solo_split 未判定，壓了也不保證回到區間。
- B（引擎補代價）改的是所有隊伍的語意，目前沒有證據指向引擎對玩家可選值的反應有問題，誤傷戰術書正常選項的風險最高。

**修正成本估計**（都需要 Owner 先核准，並事前登記）

模板在 `src/platform/tactics/tacticTemplates.js`，它是語意檔（`simulationVersion.js:209`，不在文字雜湊豁免清單裡）。所以 **C 和 B 一樣會改 v21 候選指紋**，所有釘在 `0578fa882d74b205` 的證據都要重做；兩者差在影響面，不在量測量。

| 方案 | 動到 | 需要重做 | 約略時間 |
|---|---|---|---|
| C（建議）：調 m3／m7 的旋鈕值（兩個一起看），調 mid_jungle_sync、three_lane_pressure、defensive_hold、m8 的內容或旋鈕 | `tacticTemplates.js`（語意檔）⇒ 新指紋 | 重新登記指紋；真實性表整輪重測（約 70 分）；v21a 黃金重錄（需 Owner 核准）；P2 全部證據：career／challenge 黃金、E1、E2、兩項側偏（含已 PASS 的 career）、G-A8 用新 seeds | 量測約 10 小時以上＋審查；只影響選了這些模板的隊伍 |
| B：引擎對高風險／高侵略加代價 | `src/` 引擎語意 ⇒ 新指紋 | 同上全部，另需針對新代價的設計與登記 | 約 12 小時以上＋審查；影響所有隊伍，風險最高 |

**後續建議**
1. 先做 C 的**最小版本**：處理 m7、m3 的旋鈕值（事前登記時把兩個旋鈕的值一起列進去；在這批 seeds 上只把 m7 的 risk 回 0.5 仍是 60.0%，可能不夠），用新 seeds 重跑 G-A8；不碰門檻。
2. 同時處理弱端：defensive_hold 要改內容；把 m8 的 0.25／0.2 往中間調。不能只壓強端。
3. m1、three_lane_pressure 落在門檻邊緣，修正後用新 seeds 再看，不要用這次的 seeds 決定。
4. 如果將來要開放 riskTolerance「大膽」，要先重新量測，因為高 risk 在 std 上也偏強。
5. Challenge 側偏：側別惡化約 2pp，已達登記的 STOP（z 3.86）；陣容強弱的大翻轉（mirror／topheavy、rotation／balanced）是另一個平衡問題，建議另立「挑戰模式陣容平衡」項目。側偏 STOP 的放行條件由 Owner 決定。

## 10. 待 Owner

1. **G-A8**：是否核准方案 C（改 `tacticTemplates.js` 模板資料，屬語意變更、會換指紋並重做 P2 證據）的最小版本與其事前登記；B 是否繼續擱置。
2. **Challenge 側偏**：SIDE_CONFIRMED（SWAPPED 側偏惡化 +1.9pp、z 3.86）。STOP 維持；是否另立挑戰模式陣容平衡項目。
3. 偏弱模板（defensive_hold、m8、mid_solo_split）是否與 C 一起處理。
4. 兩項 STOP 都在時，v21 不發布；3a-B 停在這裡等 Owner Review。
