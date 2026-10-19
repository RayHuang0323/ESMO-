# laneFrame D-20 側偏研究：修訂事前登記

- 登記日：2026-10-20，**在任何正式側偏資料之前**。
- 機器可讀版：`tools/fixtures/laneframe_registration_c3_d20rev.json`。兩份內容不一致時，以 JSON 為準。
- 修訂對象：`tools/fixtures/laneframe_registration_c3.json`（commit `166ade7`）的 `gates.sideBias`。**原檔不改**；行為鏡像、靜態、回歸釘、停止規則都照原登記。

## 0. Owner 授權（2026-10-20）

| 項目 | Owner 決定 |
|---|---|
| 方法 | 用真正的 career 規則集，保留正式對局的規則與選手條件。<br>配置由 seed 推導，不覆寫。<br>固定順序補足；同一批 seed 做 v20／v21 配對；不依勝負挑選。<br>同時做整體與 m4 分層分析。<br>先提交修訂登記並通過獨立審查，才開跑。<br>工具孿生只當補充診斷。<br>不放寬門檻、不調係數。 |
| 種子區段與正規化 | 核准從 9101 起補充，不佔用 C8 的 6001–7000。<br>計數單位是 Live 正規化後的 effectiveSeed：對應到同一個 effectiveSeed 的場次，不得當成獨立樣本。<br>5001–6000 先去重；6000 會對應到 6001，所以排除。<br>可以直接用奇數序列。<br>**這項授權只涵蓋區段與正規化。** |
| m4 分層 | 配對 z ≥ 3（惡化方向）才 STOP；worse_pp ≥ 5 一定回報為「需 Owner 判讀」，不自動放行。 |
| 代表性 | 接受，但要照實揭露：這是「正式 career 規則集＋正式組裝路徑＋固定的工具名單與陣容」，不得寫成「真實生涯」。 |

## 1. 為什麼要修訂

原登記寫的是「career.v21 vs career.v20，STANDARD／SWAPPED 各 n = 1000，seeds 5001–6000」，這**照字面做不到**：

- 正式規則集的配置是 `bySeed`，會被 matchSetup 鎖成由 seed 推導；正式規則集也不收 `tool.forcedLayout`。
- 所以同一個 seed 沒辦法兩種配置各跑一次。

原本的替代方案是工具孿生（balanceTool.v20/v21 強制配置），Owner 決定它**不得取代正式 gate**。

## 2. 量測設定

| 項目 | 內容 |
|---|---|
| 規則集 | `resolveLiveRuleset`，旗標用 v20 golden 的 featureFlags；v21 另外打開 `mobaTacticalDirectorV21`。解析出來的 rulesetId 必須等於該臂 |
| 組裝路徑 | Live 的 `prepareLiveMatch`，不用工具覆寫 |
| 選手條件 | v20 golden 的選手素質與陣容（只有藍方有素質，與生涯規則相同）、熟練 loadout |
| 名單 | `mirroredRoster(seed)`：兩側同英雄 |
| 藍方戰術 | 戰術書 `std` 模板的 binding（新開局的正式路徑） |
| 紅方 | `AI_TEAMS[seed % 7]` 固定指派，戰術是 `mobaTacticForTeamStyle(style)` |
| 引擎種子 | `normalizeLiveSeed(seed, "session") = seed \| 1`；配置由這個值推導 |
| tick | 0.5 秒，比賽結束或到 3600 秒為止 |

**藍方必須帶戰術**：藍方完全沒有戰術時，Live 不會呼叫 `configureMatch`，紅方風格根本沒套上（controller 實測）。工具因此在**開打前**就檢查：沒有 Director ⇒ 該 seed 失敗。

## 3. 取樣

- **計數單位**：effectiveSeed。只走奇數，所以奇數 seed 本身就是 effectiveSeed，每個樣本的引擎種子都不同。工具在走 seed 時會檢查：遇到不是奇數、或 effectiveSeed 重複，就直接丟錯。
- **順序**：
  1. 先走 5001–5999 的奇數：249 個 STANDARD、251 個 SWAPPED。6000 會對應到 6001，已排除。
  2. 再從 9101 起往上走奇數。
- **停止點**：在**兩種配置都達到 ≥ 1000 個有效 seed** 的那一個 seed 停下。
  - 若全部有效：停在 **12113**，共 **2007 個 seed、4014 場**（STANDARD 1000、SWAPPED 1007；m4 分層 134／152）。
  - 先前估計的 2056 個 seed、約 4100 場是錯的，已作廢（當時沒算正規化）。
- **上限**：走到 16000 還沒達標 ⇒ incomplete，交 Owner 決定。樣本門檻不降。
- **斷路器**：每 200 個 seed 檢查一次。無效 seed 超過 20 個，或已走 ≥ 100 個之後無效比例 > 2 % ⇒ 停止排程，判 STOP，交 Owner。
- **有效 seed**：兩臂都有紀錄，而且每筆紀錄都符合以下條件：
  - rulesetId 等於該臂；
  - 引擎種子等於 effectiveSeed；
  - 配置等於由 effectiveSeed 推導的配置；
  - Director 是 `static／legacyMirror`（v20）或 `core.v1／teamRelative`（v21）；
  - 紅方 tacticId 等於該 seed 指派的戰術。

  勝負、平手、逾時都不影響有效性。失敗的 seed 記進 `<臂>.errors.jsonl`，續跑時仍視為無效，不挑著重跑。
- **不依勝負挑選**：任何 seed 都不丟。所以兩種配置的 n 不相等。

## 4. 指標與門檻

- 指標：藍方勝率；`bias = 藍方勝率 − 0.5`。
- **新規則**：3600 秒沒有勝方的場次算 0.5（原登記的 d 只有 −1／0／1 三種值）。
- `worse_pp = (|bias21| − |bias20|) × 100`，每種配置各算一次。
- 配對 z：`d = (勝21 − 勝20) × sign(bias20)`，`z = mean(d) / (sd(d)/√n)`。
- **整體**：照原登記。
  - STOP：惡化 ≥ 5 pp，或惡化方向 z ≥ 3，或出現新回歸。
  - WARN：惡化 ≥ 3 pp，或比賽時長中位數變動 > 10 %。

## 5. 分層與判定

| 層 | 規則 |
|---|---|
| 整體 | 登記的 D-20 gate，照原門檻 |
| m4（每種配置） | 配對 z ≥ 3 才 STOP。worse_pp ≥ 5 標 OWNER_REVIEW，判定變成 owner_review（不是 pass）。這一層不套 WARN |
| 非 m4 逐場相同 | v21 必須和 v20 同勝方、同時長。只要有一場不同 ⇒ ANOMALY ⇒ STOP（獨立審查已逐一核對 7 種風格的 knobs 與 directive，非 m4 全部 JSON 相同） |

**判定順序**：

1. 斷路器觸發，或出現任何 ANOMALY ⇒ **stop**。
2. 還沒走完 ⇒ **incomplete**。
3. 資料完整後：整體觸發 STOP，或 m4 的 z 觸發 STOP ⇒ **stop**。
4. 否則，整體觸發 WARN ⇒ **warn**。
5. 否則，m4 有 OWNER_REVIEW ⇒ **owner_review**。
6. 否則 ⇒ **pass**。

**門檻旗標只在資料完整時才發**，避免中途偷看結果。

## 6. 統計限制（寫入驗收紀錄）

1. **整體被稀釋**：只有 m4 對手（約 1/7）可能在兩版之間不同，所以整體 worse_pp 約被稀釋 7 倍。這就是目前均勻分配下，生涯對局受修正影響的比例。
   - 整體數字回答「曝光量」的問題；
   - m4 分層回答「這個風格本身」的問題。
2. **m4 幾乎沒有配對效益**：knob 改一點，整場就等於重新擲骰。例如診斷時的 seed 5002：v20 紅方在 1501.5 秒獲勝，v21 藍方在 1023.5 秒獲勝。
   - 配對 z 的檢定力約等於不配對的比較。
   - n 約 134／152 時，mean(d) 的標準誤約 5–6 pp。
   - 修正若完全沒影響，worse_pp ≥ 5 每種配置約有 15–20 % 機率出現（兩種合計約 30 %）。這就是它只當 OWNER_REVIEW 的原因。
   - z ≥ 3 的誤報率每種配置約 0.1 %。
3. **勝負改變是預期中的**：m4 的 pairsChangedOutcome 會接近 2p(1−p) 的比例；勝負改變本身不代表偏差改變。
4. **整體誤報率**：2 種配置 × 2 層 × 多條判準。
   - 整體 z 與 m4 z（門檻都是 3）合起來，誤判 STOP 的機率低於約 0.5 %。
   - OWNER_REVIEW 與整體 worse_pp 的誤報率較高，要搭配 z 值一起判讀。
5. **起始偏差未量測**：生涯規則只有藍方有素質，但探針中紅方也會贏；起始偏差的大小與方向由結果回報，不預設。gate 比的是兩版在同一批 seed 上的差，不是 bias 和 0 的差。
6. **代表性（Owner 接受並要求揭露）**：
   - 藍方用 std binding；
   - 鏡像名單，不是真實選角；
   - 對手均勻分配（m4 曝光率 1/7）；
   - 只用一支固定的 golden 陣容與旗標。

   其他陣容、選角、藍方戰術、出裝策略都沒有涵蓋。
7. **m4 每場的差異來源**：m4 唯一的上下路不對稱是 `laneOffset`（己方視角上路 −0.007、下路 −0.057）；gankWeights 相等，沒有 splitLane。

## 7. 工具孿生

`--study=sidebias-twin` 只當補充診斷，結果檔會標明它不是 career 驗收，永遠不參與 gate 判定。
