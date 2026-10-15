# laneFrame 修正（TD-3A-23）事前登記

登記日：2026-10-15。機器可讀版：`tools/fixtures/laneframe_registration_c3.json`（兩份必須一致）。
依據：`review/tactic-book-3a/TD-3A-23_紅方路線對調修正方案.md`（§2、§3、§4、§5）。
授權：Owner D-1 = A（只在新的 v21 規則集修；舊規則集行為不變）、D-20（側別偏差門檻）。
本輪不建立 `challenge.v21`，Player Challenge 仍為 legacyMirror。

**鐵則：結果出來後不得修改本檔的任何判準。任何結果落在登記範圍外 ⇒ 保留檢查點、停手、由 Owner 決定。**

## 1. 修什麼

- 新規則集層 `laneFrame`，值 `legacyMirror`（現狀）｜`teamRelative`（修正）；欄位不存在 ≡ `legacyMirror`。
- 只放進 `career.v21`、`balanceTool.v21`（皆 `teamRelative`）。v20 規則集一個字元都不得改。
- 規則集沒有該層時，`configureMatch` 參數裡**整個 `laneFrame` 鍵都不得出現**（否則參數雜湊全變）。
- 按路分的旋鈕登記表 `LANE_KEYED_KNOBS`：`laneOffset`（鍵型）、`gankWeights`（鍵型）、`splitLane`（值型）。轉換方式：top 與 bot 互換、mid 與 null 不動、數值不改；只准用 `gameData.js` 的 `worldLaneForSide`／`sideRelativeLane`。

## 2. 靜態 gate（只 configure，不跑 tick）

輸入：21 個模板 × Registry `lanes.*` 每個提供選擇，合計 **186** 組。

| 項 | 檢查 | 通過 |
|---|---|---|
| A1 | 紅藍逐席位（top／mid／adc）讀值 | 不符 0 筆；藍方物件同一參照（例外 0）；藍方物件被改 0；上下路相同的紅方設定轉換前後相等 |
| A2 | `LANE_KEYED_KNOBS` 完整 | 沒有漏登、沒有未宣告欄位（掃 186 組已解析 knobs，並要求明列宣告鍵型／值型） |
| A3 | 單一轉換點（三個子條件全成立） | ① 單一轉換點在 Director；② Director 的路名映射只從 `gameData.js` 取；③ 引擎讀 knob 只經 Director（掃 import 識別字，先剝註解） |
| A4 | 負對照 | `legacyMirror` 下**必須**回報 **120** 筆紅≠藍；`teamRelative` 為 0 |
| A5 | 參照／identity 釘 | `teamRelative` 下 `knobs("red")` 每次呼叫回同一參照且轉換後物件已凍結；紅方 identity 原本非 null 就不得變 null；列出 blue===red 同物件情形（legacy 行為釘住：紅方拿藍方 identity；組裝器不可達，只有直接呼叫 `configureMatch` 的工具會碰到） |

上下路不對稱的模板（紅方列允許不同的唯一範圍，共 8／21）：`classic.m2`、`classic.m4`、`classic.m5`、`v2.bot_duo_pressure`、`v2.support_roamer`、`v2.top_solo_split`、`v2.mid_solo_split`、`v2.protect_core_scaling`（TD-3A-23 §1.5）。

## 3. 回歸 gate

- **C1**：v20 三份規則集與任何沒有 `laneFrame` 的規則集，`knobs(side)` 與設定物件同一參照，例外 0。
- **C2**：既有規則集逐位元不變：`check_match_setup_3a` **153／153**、`check_match_golden_v21a` **131／131**（含每個 configure 呼叫的參數雜湊）。
- **C3**：gate 以 **(fixture, id)** 為鍵。新規則集下只重跑 v21-A fixture 的 live＋runner 案。**恰好下列 9 個 v21-A id** 的 digest／streamHash／resultHash 至少一項改變；其餘重跑的 v21-A live／runner 案三項都必須相同。比對基準＝fixture 內存的值（舊規則集下錄製）。v20 fixture 的 `live-m8-23` 與 `v20:live-m8-23` 是同一輸入，**依構造計入**（不重跑）。`configureMatch` 參數雜湊與 setup 雜湊在新規則集下每案都會變，屬預期、不計入。Challenge 案：**本輪不重跑**（不是「不會變」）。
- **C4**：改用 `balanceTool.v21` 重測真實性表後，藍方列（藍方計畫、紅方 std）必須與舊表逐值相同；紅方列只允許在上述不對稱模板的列改變。真實性表 91 列在 v20 路徑上須與舊表相同。**禁止**用 `ESMO_BALANCE_ROOT` 指向舊樹來量（舊樹會默默忽略 `laneFrame`）。
- **支援 gate（必須全綠）**：`check_tactical_director_3c`（R-4 改寫後）、`check_match_ruleset_3a`（v20 物件不變）、`check_simulation_version_gate`、`npm run build`。
- **實作項目（不是 gate）**：組裝器能力檢查——規則集是 `teamRelative` 而引擎／Director 沒宣告支援 ⇒ 開局前報 `deps_missing`（跨樹執行用）。

### 3.1 事前列名的案例（v21-A 9 個＋v20 依構造 1 個）

為什麼是這 10 個：只有「紅方 knobs 上下路不同」的案例會變；藍方恆等映射，紅方上下路相同時轉換前後數值相同。判準來自 TD-3A-23 §3.7，以 `tools/fixtures/` 的兩份 fixture 實際核對過 id 存在（2026-10-15）。

| # | fixture | id | 為何會變 |
|---|---|---|---|
| 1 | `match_golden_v20.json` | `live-m8-23` | 紅方 m4 |
| 2 | `match_golden_v21a.json` | `v20:live-m8-23` | v21-A 重跑 v20 的 39 案，這是 #1 的副本 |
| 3 | `match_golden_v21a.json` | `bind-red:red-top_solo_split:s7` | 紅方 `v2.top_solo_split` |
| 4 | 同上 | `bind-red:red-top_solo_split:s23` | 同上 |
| 5 | 同上 | `bind-red:red-mid_solo_split:s11` | 紅方 `v2.mid_solo_split` |
| 6 | 同上 | `bind-red:red-mid_solo_split:s29` | 同上 |
| 7 | 同上 | `bind-red:red-protect_core_scaling:s19` | 紅方 `v2.protect_core_scaling` |
| 8 | 同上 | `bind-red:red-protect_core_scaling:s3` | 同上 |
| 9 | 同上 | `bind-red:both-bot_duo_vs_top_split:s3` | 紅方為 `v2.top_solo_split` |
| 10 | 同上 | `bind-red:both-bot_duo_vs_top_split:s19` | 同上 |

注意：
- 實際比對的改變集合＝#2–#10 共 **9** 個 v21-A id；#1 為 v20 fixture，與 #2 同一輸入，依構造計入、不重跑。C7／D-1 原先漏列了 #2 這個副本。
- 8 個 `bind-red` 在 fixture 裡的完整 id 帶 `bind-red:` 前綴。
- 不變的案例（須三項雜湊相同）：`bind-red:red-mid_jungle_sync`、`bind-red:red-std_mid.split`（皆對稱）、紅方為 std 的 binding-template／binding-choice live 案、runner 案。
- 12 個 challenge 案（防守方 m7／m3／m1 對稱）：本輪**不重跑**。

## 4. 行為 gate（跑對局）

來源：TD-3A-23 §4-b（提案，經 D-1 核准）。

- 規則集 `balanceTool.v21`、`laneFrame = teamRelative`；計畫 P ∈ { std＋上路帶線、std＋下路進攻、`classic.m4`、`classic.m5` }，對照組 std 對 std。
- 每個 P 兩臂：P 在藍方、P 在紅方（對手皆 std）。每個 seed 跑 STANDARD 與 SWAPPED 各一場（強制配置）。
- 計畫的 Registry 選擇 id：`std` ＋ `lanes.top.stance=split`；`std` ＋ `lanes.bot.stance=aggressive`；模板 `classic.m4`、`classic.m5`。
- seeds：**9001–9100**；workers：**3**。seed 9091 被兩支單 seed gate 順帶用到，不是區段衝突。
- 規模：每臂 100 seeds × 2 配置；總量約 1,800 場。**必須跑滿 n**；任何縮減跑法只算診斷。
- 統計（單位＝seed，配對）：對計畫 P、指標 m、seed s、配置 L，`effect_side(s,L) = m(P 在該側 vs std) − m(std 對 std 對照組，同側、同 s、同 L)`，m 取己方視角。`D(s)` ＝兩配置 [effect_紅 − effect_藍] 的平均；`z_diff = mean(D) / (sd(D)/√n)`，n = 100。
- 指標：
  - **B1 帶線者身分**：逐場判定，帶線 tick 由己方該路席位完成的比例，**每一場**都 ≥ 0.99（決定性）。
  - **B2 抓人路線**（§2.7 helper 轉己方視角的 `gankShare.<lane>`）與 **B3 站位**（`laneForward.<lane>`）：通過 ＝ |z_diff| < 2 且份額型指標（值域 [0,1]）|mean(D)| ≤ 0.05；非份額型指標 |mean(D)| ≤ 0.05 × |mean(effect_藍)|（藍方效果的 5 %）。「同號」＝在每個藍方效果 |z| ≥ 2（z 的算法同上）的計畫×指標上，sign(mean effect_藍) = sign(mean effect_紅)。
  - 容忍度來源：TD-3A-23 §4-b，經 Owner D-1 = A（2026-10-15）採納；殘留世界順序不對稱從未量過，未通過＝停手交 Owner，不是調整容忍度的理由。
- 負對照：同設計在 `legacyMirror` 下跑 B1，**紅方在上路帶線計畫必須失敗**（legacy 紅方己方路席位比例 < 0.5；這取代原本無法檢驗的「≈ 0」）；不失敗代表量錯東西。

## 5. 側別偏差 gate（Owner D-20）

比較 `career.v21` 對 `career.v20`（目前程式碼上的 `career.v20` 依 G-AC1 就是 v21-A 基線，兩個名稱都記錄），STANDARD／SWAPPED 各 n = 1000 seeds（兩規則集同 seeds），seeds 5001–6000（`C3_開工清單.md` §4）。此次使用標記為「C3-1 laneFrame D-20」；5001–6000 是共用的平衡檢查列，後續階段可為自己的 D-20 檢查重用同一列（草案 §1.3 定義為平衡列）。

- 指標：藍方勝率；`bias(規則集, 配置) = 藍方勝率 − 0.5`；`worse_pp = (|bias21| − |bias20|) × 100`，逐配置。`z`＝逐 seed 配對結果差 d ∈ {−1,0,1}：`mean(d)/(sd(d)/√n)`。
- 停手（交 Owner）：任一配置 worse_pp ≥ 5，或在變差方向 |z| ≥ 3，或任何新回歸。
- 警告：worse_pp ≥ 3，或 |median 時長21 / median 時長20 − 1| > 0.10。
- 「新回歸」＝本登記或 CLAUDE.md Phase 3a 區塊中，在 commit b3cbd1d 為綠、現在轉紅的任何 gate（tactic24 既有的兩個紅燈按名排除）。

## 6. 不涵蓋的範圍

- Player Challenge 在 `challenge.v21` 建立前仍為 legacyMirror（本輪沒有 challenge 規則集注入）。
- 行為對稱只能是**統計意義**，不是逐 seed 完全對稱：引擎有以世界順序決定平手的地方（`_gankPickV20` top→mid→bot、勝利條件 mid→top→bot、擲骰區間、藍方先迭代；TD-3A-23 §1.4-8、§8），再加上大型物件（巨龍／巴龍坑）配置非對稱。
- 歷史挑戰的證據顯示是否套用 §2.7 helper（TD §7 第 3 項）：屬 Owner 決定，不在本登記內。
- Owner 決定待定，不是本輪：TD §7 第 2 項（v21 或 v22；本輪把修正留在未發布的 v21 候選內，經 `career.v21`／`balanceTool.v21`）、第 4 項（塔被摧毀事件文字的路名）、第 5 項（`simulationVersion.js` 選項 a／b）、第 6 項（7 個選項重測哪幾個；本輪不重測）。

## 7. 停手規則

任何結果落在本登記範圍外 ⇒ 保留檢查點、停手，由 Owner 決定。事後不得修改判準。

## 8. 未決（open）

無。原先三項已由 controller 於 2026-10-15 裁定：

1. 行為 gate seeds：**9001–9100**。提案範例 6001–6100 與草案 §1.3 保留給 C8 家族抽樣的 6001–7000 重疊，且 4601–5000 保留給 Owner 指定；9001–9100 不在草案 §1.3 表任何已登記區段內（controller 於 2026-10-15 完成帳本核對），也從未被戰術量測使用（1–40、1001–1400、1401–1800、2001–2060）。
2. B2／B3 容忍度（同號、|z_diff| < 2、≤ 0.05）：照提案登記，來源為「TD-3A-23 §4-b，經 Owner D-1 = A（2026-10-15）採納」。殘留的世界順序不對稱從未量過，所以未通過是「停手交 Owner」事件，不是調整容忍度的理由。
3. 行為 gate workers：**3**。

## 9. 補充定義（主控於實作與量測前加入，2026-10-15）

- 比例型指標：`gankShare.<路>`、B1 己方路帶線比例（門檻 |平均 D| ≤ 0.05）；非比例型：`laneForward.<路>`（門檻 ≤ 藍方效果平均絕對值的 5%）。
- side bias「變差方向」：每種佈局逐 seed 取 d = (v21 藍勝 − v20 藍勝) × sgn(v20 偏差)（v20 偏差為 0 時改用 v21 的符號）；d 為正代表原有偏差擴大；z = 平均(d)/(sd(d)/√n) ≥ 3 或 worse_pp ≥ 5 ⇒ 停。
- 「新增回歸」逐一列名：golden_v21a、match_setup_3a、tactical_director_3c、tactical_directive_3c、match_ruleset_3a、simulation_version_gate、tactic_truth_3a、tactic_replication_3a、c3_phase_skeleton、verify tactic24、verify runtime29、build；排除 tactic24 兩條既有紅燈（m6／m4 gank、BattleResult.v2）。
- 列舉來源：21 模板／186 輸入於執行時由已提交的 Registry 與模板資料列舉（數量不是 186 ⇒ 停）；不變清單以「前綴＋:s<seed>」比對；A2 路名欄位偵測＝在 186 組解析結果中，物件鍵恰為 {top,mid,bot} 或值為 top／bot 的旋鈕欄位。
