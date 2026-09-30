# Hero Identity & Combat Depth v1（moba-sim.v17）

> 狀態：**READY_TO_REVIEW（Owner Review）**。未 push、未部署。
> 分支：`feature/hero-identity-combat-depth-v1`（基於 main `f9de4c9`＝moba-sim.v16 RELEASED）。
> 本輪沒有修改：v16 坑位／STANDARD／SWAPPED、Objective Stakes（仍 OFF）、Nexus cap（仍 OFF）、Jungle 地形、Competitive／Online Backend。

## 0. 一頁摘要

| 項目 | 結果 |
|---|---|
| 被動 P 覆蓋 | **100/100 有規則**：完整實作 72、近似實作 24（每位都寫明差異）、資訊類 4（誠實標示「不影響戰鬥」） |
| Power Curve 覆蓋 | **100/100**，22 種曲線；強勢期 前 18／中 41／後 41；倍率 0.92–1.08，三段平均＝1 |
| 已接線戰術 | 7 類欄位進入既有 AI 決策點（見 §3）；std 對 std 與未接線**逐位元相同** |
| 最終公平性（n=1000） | 藍 49.5%（v16 50.6%）；巨龍側單場優勢 +5.4pp（v16 +4.1，配對 z 0.59＝雜訊內）；純藍方地利 −0.3pp |
| 節奏／病態局 | 時長中位 16.7 分（v16 17.1）、P90 24.3、最長 38.5；未結束 0、> 45 分 0 |
| Replay／snapshot | 被動（frame.pp＋config meta）與曲線（heroId＋等級）重播逐值還原；舊重播不捏造 |

## 1. Passive P Runtime v2

**做法**：不寫 100 套 hard-code。`heroPassiveGameplay.js`（受模擬指紋保護）用一套**語彙**描述 100 名英雄，
引擎 `_heroPassiveStep` 只認語彙、不認 heroId（gate A7 掃原始碼：LogicEngine 沒有任何英雄 id 字面值）。

- 觸發（18 種）：單次重傷、累積受傷、受傷、低血量、週期、脫戰、靜止、移動、草叢／河道、擊殺、擊殺或助攻、
  隊友低血量、隊友受重傷、普攻節拍、技能命中、被技能命中、施放技能、對隊友施法；共通欄位：第 N 次、冷卻、條件。
- 效果（18 種）：護盾（自身／目標／最弱隊友／全隊、可疊層）、減傷、治療、加速、戰力、隱身、冷卻縮短、
  額外一擊（可濺射／連鎖／真實傷害／已損血比例）、燃燒中毒（可疊層）、減速（可疊到下限）、暈眩、標記增傷、
  反彈、疊層、蓄力（下一次普攻／技能釋放）、血量轉移。
- 常駐修正：輸出傷害（上限 ×1.35）、承受傷害（下限 ×0.75）、移速（上限 ×1.3）；條件含目標低血、目標比我肥、
  自身已損血、疊層數、目標燃燒／被減速、移動中、所在區域、連擊同一目標。
- 接點：普攻節拍（atkCd 到點那一下）、技能命中迴圈、施放迴圈、傷害式乘數、`_heroGuardFactor`（普攻／技能／裝備三路一次涵蓋）、移速。
- 不耗 rng、固定玩家順序 ⇒ 決定性；規則關閉 ⇒ 與 v16 逐位元相同（gate B2；另以 runner 30 場逐筆比對 v16 RC：30/30 相同）。

**資訊類 4 名**：mingyun（看敵方 CD）、shiguang（預判友方軌跡）、huanjing（看見隱形）、linghun（感知友方狀態）。
引擎沒有視野／資訊層，所以不影響戰鬥；UI 顯示「資訊類被動 · 不影響戰鬥」。
另有 10 名「資訊＋戰鬥」混合被動只實作戰鬥那一半（例：hunpo 只實作擊殺回血），標為近似。

**UI**：HUD／英雄面板／技能詳情顯示「已實裝（近似）· 觸發條件 · 觸發 N 次／加成 N 次 · 疊層 · 已蓄力 · 冷卻」，
近似者附實作說明；規則未開或舊重播 ⇒「本場未生效」，不冒充生效。

## 2. Hero Early／Mid／Late Power Curve v1

- 來源（全部是既有資料）：① Legacy 規格 `EsportsGame.jsx` ROLE_PROFILE.curve（依英雄主路線）
  ② 職業微調 ③ 英雄自身屬性成長（同職業內比較）與被動型態（永久疊層＝後期、伏擊蓄力＝前期）。
- `heroPowerCurveTable.js` 是產生檔（`tools/gen_hero_power_curve.mjs`），因為 heroDatabase 不在指紋內；gate 以 `--check` 驗證沒有漂移。
- 引擎唯一掛點 `_applyMatchLevel`：power ×k、最大生命 ×（半幅）；階段以本場等級判定（Lv4 前期／Lv7 中期／Lv11 後期，段間內插）。
- UI：英雄面板與圖鑑「強勢期曲線」三段長條，標出目前階段與當下倍率；重播由 heroId＋frame 等級還原同一個值。

## 3. Tactical Identity v1

**Audit 結論**（接線前）：13 個 knob 進引擎；`macro.early/mid/lateGame`、`economy.carryPriority`、`lanePlan.support`
完全沒讀；`lanePlan.jungle=farm` 以 ×0.4 全路權重實作，正規化後**等於沒改**；`riskTolerance` 的「晚撤退」被 0.28 保底門檻吃掉。
紅方在 Live 固定 std（Challenge 用防守方戰術）。

**接線**（`toEngineTacticIdentity`，與 `toEngineTactic` 同一份契約、同一個檔；tactic24 的 13 knob 白名單未動）：

| 契約欄位 | 接到的既有決策點 | 效果 |
|---|---|---|
| macro.aggression | `_combatDecisionV3` 接戰分數 | ±0.12 |
| macro.early/mid/lateGame | 接戰分數＋`_joinChance` 參團率，依時間分段（<8／8–16／≥16 分） | aggressive ±0.08；scaling 前中期 −0.05、後期 +0.08 |
| macro.riskTolerance | 緊急撤退保底門檻、`_commitGateV1` 投入門檻 | ±0.05／±0.1 |
| lanePlan.jungle＝farm | 打野 gank 週期 | ×1.35 |
| lanePlan.support | 輔助遊走率、護人觸發血量 | roam ×1.5；protect ×0.5 且 0.55→0.70 |
| economy.carryPriority | 護人目標排序 | 指定那一路優先 |
| objectives.towerPriority | 主動權窗：先推塔 vs 轉打巨龍、響應血量門檻 | siegeBias ≥0.2 ⇒ 附近有塔先推塔 |

藍紅雙方、Live（useLocalServer）與 Challenge（challengeRunner）一律用這一個 builder；引擎不認戰術 id（沒有第二套 AI）。
TacticScreen 的「引擎效果」摘要同源顯示這些項目。仍未映射：heraldPriority（無預示者）、jungleResourceShare（無金流分配）、vision.*（無視野系統）。

## 4. A/B（runner＝正式 skill＋talent 設定、鏡像名單、Items ON；基準＝v16 RC 同 seed）

| 階段 | n | 藍 | 巨龍側優勢 | 純藍 | 時長中位／P90／最長 | 配對 |
|---|---|---|---|---|---|---|
| v16 基準 | 1000 | 50.6 | +4.1 | +0.8 | 17.1／24.0／33.3 | — |
| ① 被動 | 600 | 48.0（基準 50.7） | +7.5（基準 +2.2） | −2.0 | 17.2／24.8／34.0 | →巨龍側淨 32（z 1.82） |
| ①＋② 曲線 | 200 | 54.5 | +8.2 | +4.9 | 16.6／23.1／31.3 | 對 ①：巨龍側淨 −2（z −0.19） |
| ①＋②＋③（std 對 std 與 ② 逐位元相同） | **1000** | **49.5** | **+5.4** | **−0.3** | **16.7／24.3／38.5** | 對 v16：→巨龍側淨 13（z 0.59） |

- 未結束／> 45 分：全部 0。
- ① 在 n=600 的 +7.5pp 在 n=1000 收斂到 +5.4pp（與 v16 差 +1.3pp，雜訊內）⇒ **不需要調降被動數值**。
- **單邊證據（被動真的有作用）**：只給藍方被動，n=150：藍 47.3% → 63.3%（翻轉 49：25，z 2.79）。
- **曲線**：只給藍方曲線，150 場中 80 場勝方翻轉；分三分位的「前期型在短局更強」**統計上無法確認**（每格約 25 場，±13pp）。機制層面由 gate 證明（Lv3 前期型 ×1.016 vs 後期型 ×0.951；Lv12 反過來）。
- **戰術（藍＝戰術、紅＝std，各 40 場，±8pp）**：m3 67.5→60.0、m4 50.0→62.5、m7 55.0→47.5（平均時長 20.1→18.4 分）、m8 35.0→55.0（19.2→20.3 分）。
  後期決戰從明顯吃虧變成可行選擇；沒有戰術變成壓倒性。

## 5. Gate

| Gate | 結果 |
|---|---|
| `check_hero_passive_runtime_v17` | 23/23 |
| `check_hero_power_curve_v17` | 17/17 |
| `check_tactical_identity_v17` | 19/19 |
| `check_simulation_version_gate` | 61/61（v17 指紋 `49ca18d32e3a3473`；新增 heroPowerCurve.js／heroPowerCurveTable.js 進指紋清單） |
| `check_moba_objective_stakes_v16` | 17/17（V1／V2 的版本事實改為 v17；Stakes／Nexus OFF 斷言原樣） |

## 6. 新技術債

- TD-HI1：正式站 gate `browser_check_prod_objective_layout_v16` 檢查線上 bundle 含 `moba-sim.v16`；部署 v17 後需同步改成 v17。
- TD-HI2：24 名近似被動（暴擊反彈、鏡像擋刀、治療增幅等）等引擎有對應系統後再升級成完整實作。
- TD-HI3：AI 傷害估算（`_combatDecisionV3` 等）不含被動加成與曲線以外的條件修正 ⇒ AI 對「帶被動的對手」略微低估。
- TD-HI4：Power Curve 的「前期型短局更強」需要非鏡像 runner 才量得出來（目前 runner 是鏡像名單）。
- TD-HI5：紅方 Live 仍固定 std 戰術；對手戰術來源仍待設計（Challenge 已是真實戰術）。
- TD-HI6：Replay frame 多了 `pp` 欄位（每名英雄 5 個數）⇒ replay 容量略增（既有 TD-19 相關）。

## 7. 下一階段四項 Audit 與規劃（本輪不實作）

### 7.1 Jungle Topology v1
- **現況缺口**：地圖旋轉對稱，巨龍坑緊鄰藍方下路；v16 已把「藍方偏差」拆成巨龍側 +4.1pp（v17 +5.4）。
  坑肩牆實驗（只收窄入口）讓優勢變成 +12.7pp——先到者更好守。缺的是**遠端隊伍的接近路線**。gate：`tools/audit_jungle_topology.mjs`。
- **與 Hero Identity 的依賴**：被動讓團戰更有決定性（① 階段 n=600 +7.5pp 的訊號），地形不對稱會被放大；草叢／河道被動（langwang、yeiren、haixiao、binghe…）直接吃地形分區。
- **順序**：**第一優先**。必須獨立 Sprint（改地形＝改碰撞／導航／GLB，需要 Blender＋n=1000）。

### 7.2 Objective Stakes v2
- **現況缺口**：v1 程式碼在但 OFF（開啟時巨龍側 +8.1pp）；龍魂提示已在 OFF 時關閉。
- **依賴**：Stakes 的戰力倍率與被動常駐增傷、曲線後期倍率疊乘；必須在 Jungle Topology 之後，否則又放大巨龍側。
- **順序**：第二。可與 Nexus／Base Defense 同一 Sprint 做 screening（兩者都是「優勢如何轉成勝利」），但要分開 A/B。

### 7.3 Nexus／Base Defense
- **現況缺口**：主堡第一次掉血到爆中位數約 6 秒（lateFactor×structureFactor 可達 ×40）；`nexusSiegeCapV1`（cap 6）OFF。
  最長局從 33.3 分變成 38.5 分（v17），後期 Power Curve 讓後期型陣容更需要「守得住」的基地。
- **依賴**：後期曲線（後期型 41 名）與 m8 後期決戰戰術只有在基地不會瞬間蒸發時才有意義。
- **順序**：第二（可與 7.2 同 Sprint）。不需地形改動。

### 7.4 MOBA UI/UX Polish v2
- **現況缺口**：本輪新增的被動觸發／疊層、強勢期、戰術效果只在面板與 HUD 文字呈現；
  缺觸發瞬間的特效、疊層圖示、強勢期切換提示、戰術執行回饋（賽後「宣告 vs 實際」目前只有 exec 計數）。
- **依賴**：純呈現層，讀 snapshot 的 `heroPassive`／`powerCurve`／`tidObs`，不改模擬。
- **順序**：可與任何一項**並行**（不同檔案、不碰 LogicEngine），適合與 7.2＋7.3 同一個 Sprint 一起做。

**建議 Roadmap**：v17 review → Jungle Topology v1（獨立）→ Objective Stakes v2＋Nexus／Base Defense（同 Sprint、分開 A/B）＋ UI/UX Polish v2（並行）。
