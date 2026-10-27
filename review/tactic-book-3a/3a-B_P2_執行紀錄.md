# Phase 3a-B P2 執行紀錄（發布量測）

- 日期：2026-10-25 登記 → 2026-10-27 停在 Owner Review
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
| P2-5b challenge 雙向配對研究 | **已登記、審查 APPROVE，未開跑**（等 Owner 確認） | `64980533` |
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

## 7. 測試

- 42 支 Node gate（逐支單線，45.5 分）：41/42 → 修 `check_tactic_book_view_3a` V11 後 42/42。V11 是比對原始碼文字的斷言，P1 審查修正 `dcfa341c` 把同一個呼叫拆成兩步，行為相同、斷言過期；修正只放寬寫法比對（`fb7045a1`），不是 P2 回歸。
- `npm run build`：built in 33.39s；dist 0 個檔案含 `heroSkillsDev`。
- `node tools/verify.mjs` 全套：51/118 段通過；67 段紅**全部**在 v20 發布基準（`v20-baseline-1d0e219` 狀態檔）就紅，失敗訊息逐字相同 67/67 ⇒ 沒有新的回歸。Phase 3a 各段、tactic24、runtime29、experience26、regress／regress2 都 PASS。
- 瀏覽器（單線）：tactic book v21 30/30、static 31/31、battle notices 3a-B 11/11、exit flush 12/12、Player Challenge slice8 50/50。

## 8. 待 Owner

1. **G-A8**：是否核准方案 A（旋鈕掃描事前登記），以及之後走 B（引擎代價）或 C（模板幅度）。
2. **Challenge 側偏**：是否確認開跑雙向配對研究（4,098 場）。確認方式：在 `tools/fixtures/challenge_bidir_registration_3aB.json` 填 `owner.confirmedAt` 並 commit。
3. 偏弱模板（defensive_hold、m8、mid_solo_split）要不要和 G-A8 一起處理。
4. 兩項 STOP 都在時，v21 不發布；P2 其他項目已完成，3a-B 停在這裡。
