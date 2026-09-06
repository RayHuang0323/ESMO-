# Team Strength Pricing Calibration Assessment v1

> 建立日期：2026-09-07　基線：`origin/main` = `f21f5d0`
> 性質：**Audit ＋ Measurement ＋ Assessment**。未調任何平衡、未改 `src/`。
> 量測工具：`tools/measure_teamstrength_pricing_v1.mjs`（deterministic，可重跑逐值相同）
> 前置：`docs/design/Online_Competitive_Power_Contract_v1.md`（Conservative Model C）

---

## 0. 一句話

**`teamStrength.v1` 現在不足以當 Online squad pricing 的基礎，而且問題不是「權重沒調好」——
它量的東西和決定勝負的東西**基本上是兩回事**。**

最能說明的一組數字：

| | Δ定價 | 勝率變化 |
|---|---|---|
| **有定價**的最大擺動（全隊能力 55 → 85） | **+15**（+21%） | **0.0pp**（50.0% → 50.0%） |
| **未定價**的英雄熟練（power ×1.25） | **0.00** | **+44.4pp**（50.0% → 94.4%） |

⇒ 定價漲 21% 買不到任何勝率；一個定價完全看不到的維度可以把勝率推到 94%。

---

## 1. Audit：`teamStrength.v1` 實際上是什麼

### 1.1 計算路徑

```
teamStrength(roster, mode)
  = mean(calcPower(p, mode)) × 0.8  +  max(calcPower(p, mode)) × 0.2
              └─ COMBINE.mean          └─ COMBINE.top（star / outlier 的唯一處理）

calcPower(player, mode)
  = 16 項能力 × mode 權重（MOBA_WEIGHTS / FPS_WEIGHTS）
    × 個性 boost(+8) / nerf(−5)
    × MORALE_EFFECT(morale)
    × CONDITION_EFFECT[condition]
```

- **role / lineup**：`teamStrength` **完全不看**席位指派。同樣五個人，
  誰坐哪個位置，定價**逐值相同**。
- **star / outlier**：只有 `COMBINE.top = 0.2` 這一項，取「最強一人」。
  沒有陣容組合、沒有互補、沒有位置適配。
- **MOBA / CS**：**分流**——兩套權重表，16 項能力**全部**不同（16/16）。
  ⇒ 定價本身已經 mode-aware。

### 1.2 ⚠ 它自己宣告過不是戰力來源

`data/playerModel.js` 的 `calcPower` 檔頭逐字：

> **⚠ 純展示用（經營端）。不進 LogicEngine、不影響 Battle Balance。**

⇒ 把它升格成 Online 定價權威，**與它自己的契約直接衝突**。
這不是「後來才發現不準」，是**當初就標明用途不同**。

### 1.3 引擎真正吃什麼

| 引擎輸入 | 來源 | 有沒有被定價 |
|---|---|---|
| **`power` / `tough`**（直接決定戰鬥結果） | `basePower[role] × loadout.powerMult`（**英雄熟練**） | ❌ **完全沒有** |
| 16 項能力 → 行為偏移 | `configurePlayers(mods)`：撤退門檻、參戰率、集結率、投入決策、推線深度… | ✅ 有（但只影響**行為**，不影響傷害） |
| 英雄定位 arch/diff | `configureHeroes` | ❌ |
| 召喚師技能 | `configureSpells` | ❌ |
| 戰術／流派變體 | `configureMatch` | ❌ |
| 天賦 derived stats | `.map(withDerivedStats)` | ❌ |

`LogicEngine` 的 `configurePlayers` 檔頭逐字：

> 能力只改「門檻 / 機率 / 節奏 / 深度」——**沒有任何傷害、勝率、金錢係數**
> （power / tough 一律不受能力影響）。

⇒ **定價量的是「行為傾向」，決定勝負的是「power / tough」。**
這就是 §0 那組數字的結構性原因。

### 1.4 定價吃、但引擎完全不讀的輸入

`morale`、`condition`、`energy` 在 `LogicEngine.js` 與 `mobaPlayerStats.js` 的出現次數：**各 0 次**。
但 `calcPower` 直接乘上 `MORALE_EFFECT × CONDITION_EFFECT`。

實測可操縱範圍（同一批能力全 80 的選手，只改士氣／狀態）：

```
士氣 100 ＋ 狀態絕佳 → 定價 87
士氣  70 ＋ 狀態正常 → 定價 80
士氣  10 ＋ 狀態低迷 → 定價 64
可操縱區間 = 23.00（基準的 28.7%）　引擎反應 = 0
```

⇒ **這是一條現成的沙包管道**：把士氣／狀態壓到底，定價掉 28.7%（掉級），
而模擬側**一點都不變弱**。

⚠ 這正是 Season vNext **I13** 想擋的東西 —— 本量測證明 I13
**不是可選的保險，是承重結構**，而且量出了它承重多少。

---

## 2. 量測方法（可重跑）

`node tools/measure_teamstrength_pricing_v1.mjs --seeds 9`

- 引擎：**真實 `LogicEngine`**，headless，`DT = 0.5`，上限 1800s。
- 能力注入：`toEnginePlayerMods()` → `configurePlayers()`（產品同一條路徑）。
- **每個對戰組合，每個 seed 打兩場，受測隊各當一次藍方與紅方**。
  引擎為打破鏡像局有刻意的兩側不對稱；固定側量測會把**側邊偏差**算成定價誤差。
  （本工具第一版就是那樣寫的，量出「定價完全反向」——**那一半是側邊偏差造成的假象**，
  換邊對打後才得到下面的真實數字。）
- 側邊偏差對照（兩側完全相同）：藍方勝率 **44.4%** ⇒ 偏差存在但不大，換邊設計已消除。
- 每個組合 **18 場**（9 seeds × 2 側）。

⚠ 本量測**只啟用能力層**（不含英雄定位／召喚師技能／戰術），
因為那正是 `teamStrength` 所定價的範圍 —— 這是刻意的隔離，不是遺漏。

---

## 3. §1 靜態：定價權重 vs 引擎影響力（MOBA）

引擎影響力 = 該能力在 `STAT_MAP` 所有作用點的絕對權重總和（相對量級比較）。

| 能力 | 分類 | 定價佔比 | 引擎佔比 | 差 |
|---|---|---|---|---|
| **mapAware** | 戰術 | 8.4% | **25.0%** | **−16.6pp** ← 最被低估 |
| **decision** | 戰術 | 7.1% | 13.6% | −6.5pp |
| **comms** | 團隊 | 6.5% | 11.3% | −4.9pp |
| synergy | 團隊 | 7.1% | 9.4% | −2.3pp |
| courage / adaptability | — | — | — | ≈ 0 |
| tacticalIQ | 戰術 | 7.7% | 5.0% | +2.7pp |
| clutch | 心理 | 5.2% | 1.9% | +3.3pp |
| learning | 團隊 | 3.9% | **0.1%** | +3.7pp |
| reflex | 操作 | 6.5% | 2.7% | +3.8pp |
| apm | 操作 | 7.7% | 3.8% | +4.0pp |
| **positioning** | 操作 | 7.1% | 2.8% | **+4.3pp** ← 最被高估 |

**`MOST_UNDERPRICED_CAPABILITIES` = mapAware、decision、comms**（全部是戰術／團隊類）
**`MOST_OVERPRICED_CAPABILITIES` = positioning、apm、reflex、learning、clutch**（操作類為主）

⇒ 定價偏重**操作**，引擎偏重**戰術與資訊**。方向性的錯配，不是幅度誤差。

（沒有任何能力是「引擎完全不吃卻被定價」——16 項都至少有一個作用點。）

---

## 4. §2 動態：Δ定價 vs 真實勝率

基準「平均 70」定價 = 70。每列 18 場。

| 陣容 | 定價 | Δ定價 | 該隊勝率 | 平均擊殺差 |
|---|---|---|---|---|
| 平均 85 | 85 | **+15** | **50.0%** ❌ | +0.56 |
| 平均 55 | 55 | −15 | 27.8% ✅ | −3.00 |
| 偏科 操作 90 | 67 | −3 | 38.9% ✅ | −1.61 |
| 偏科 戰術 90 | 68 | −2 | 27.8% ✅ | −1.11 |
| 偏科 心理 90 | 65 | −5 | 44.4% ✅ | −5.22 |
| 偏科 團隊 90 | 66 | −4 | 33.3% ✅ | −1.89 |
| 單一明星 | 72.96 | +2.96 | **61.1%** ✅ | +0.50 |
| 三明星 | 76.48 | **+6.48** | **38.9%** ❌ | +0.56 |
| 高 synergy | 72 | +2 | 50.0% ❌ | −0.06 |
| 低 synergy | 68 | −2 | 50.0% ❌ | 0.00 |

方向一致率 **7/10**（|Δ定價| ≥ 0.5 者）。

**但一致率本身會誤導。** 真正的問題是**幅度完全脫節**：

- Δ定價 **+15**（能力 55→85，定價能做到的最大擺動）⇒ 勝率 **0pp** 變化。
- Δ定價 **+6.48**（三明星）⇒ 勝率 **−11.1pp**（比基準更差）。
- Δ定價 **+2.96**（單一明星）⇒ 勝率 **+11.1pp**（全表最佳）。

⇒ **定價與勝率之間看不出單調關係。** 一致的那 7 項多半集中在
「比基準弱」那一側（低定價確實會輸），但**加價買不到贏面**。

---

## 5. §3 免費戰力：定價完全相同

兩側 stats **逐值相同** ⇒ `teamStrength` 差 = **0.00**。唯一差異是英雄熟練 loadout。

| A 隊英雄熟練 | Δ定價 | A 勝率 | 平均擊殺差 |
|---|---|---|---|
| 無（對照） | 0.00 | 50.0% | 0.00 |
| power ×1.10 | 0.00 | **77.8%** | +4.72 |
| power ×1.25 | 0.00 | **94.4%** | +8.11 |
| power + tough ×1.25 | 0.00 | 88.9% | +8.78 |

**`FREE_POWER_GAP_EXISTS = YES`，而且是壓倒性的。**
一個定價看不到的維度，+10% 就值 **+27.8pp** 勝率，+25% 值 **+44.4pp**。

⚠ 英雄熟練是 **career progression 本身**（`heroProgressStore`）
⇒ 這正是 GAP-2 的實體，且幅度遠大於先前量到的天賦 5.8%。

---

## 6. §4 相近定價、不同組成

Δ定價 ≤ 1 的組合：

| 對戰 | Δ定價 | 勝率 |
|---|---|---|
| 偏科 操作 90（67）vs 偏科 戰術 90（68） | −1 | 55.6% |
| 偏科 操作 90（67）vs 偏科 團隊 90（66） | +1 | 44.4% |
| 偏科 操作 90（67）vs 低 synergy（68） | −1 | 38.9% |
| 偏科 戰術 90（68）vs 低 synergy（68） | **0** | **27.8%** |

**`SAME_PRICE_DIFFERENT_POWER_RISK = HIGH`**：
定價完全相同（Δ = 0）的兩支隊，勝率可以是 **27.8% vs 72.2%**。
整組相近定價的勝率跨度約 **28pp**。

⇒ 若今天就用這份定價做 Bracket，**同一級內的實力落差會比級與級之間還大**。

---

## 7. CS

**`CS_PRICING_QUALITY = UNKNOWN`（本輪無法量測，原因是結構性的）**

- CS 真實對戰是 `src/battle/fps/EsportsFPS3D.jsx`（React + Three），
  **無法在 Node headless 執行**；且它是 Codex-owned runtime，本輪禁止修改。
- `simulateFixture` 可以在 Node 跑，但**它的勝負就是 `teamStrength` 推導出來的**
  ⇒ 拿它當基準是**循環論證**，必然量出「完美相關」，零資訊量。

靜態上能說的：CS 定價用 `FPS_WEIGHTS`，與 MOBA **16/16 項全部不同**
⇒ 定價層本身已經 mode-aware；**未定價的向度**才是 mode 差異的真正來源
（CS 有 `mapFit`、經濟、槍械；MOBA 有英雄熟練、召喚師技能、英雄定位）。

要量 CS 需要一個 **headless CS 解算器**，那是獨立一輪，且必須與 CS owner 協調。

---

## 8. 判斷

```
TEAMSTRENGTH_READY_FOR_ONLINE_PRICING    = NO
FREE_POWER_GAP_EXISTS                    = YES（英雄熟練 +25% ⇒ +44.4pp 勝率）
MODE_SPECIFIC_PRICING_REQUIRED           = UNKNOWN（CS 量不到；MOBA 單獨已不合格）
EFFECTIVE_POWER_GUARDRAIL_STILL_REQUIRED = YES
NORMALIZATION_POLICY_CAN_REMAIN_NONE     = CONDITIONALLY
```

**`NORMALIZATION_POLICY_CAN_REMAIN_NONE` 的條件**：
只要 Cap／Bracket **還沒上線**，policy 維持 `none` 沒有任何影響（今天沒有線上對戰）。
但**一旦要用這份定價做分級，就不能維持 none** —— 否則同級內落差 28pp、
且英雄熟練是不用付錢的 +44pp。

### 可以先做什麼、不能先做什麼

| | 可否先做 | 理由 |
|---|---|---|
| **`SquadSnapshot.v1`** | ✅ **可以** | 它是**資料契約**（取值、正規化波動狀態、凍結、雜湊），**不依賴定價正確性**。而且它正好是修 §1.4 沙包管道的地方 |
| **`Cap`** | ❌ **不可以** | Cap 的度量衡就是定價。用現在的定價設上限＝用錯的尺 |
| **`Bracket`** | ❌ **不可以** | 級別由定價決定 ⇒ 同上 |
| **`LadderRating`** | ⚠ 技術上可以，但沒意義 | 沒有可信的分級，級內評分排的是錯的池子 |

⇒ **`CALIBRATION_REQUIRED_BEFORE_SQUADSNAPSHOT = NO`**
　 **`CALIBRATION_REQUIRED_BEFORE_CAP_BRACKET = YES`**

---

## 9. 建議的下一步：不是「調權重」

**⚠ 最重要的結論：這不是一個 calibration 問題，是一個 pricing authority 問題。**

把 `MOBA_WEIGHTS` 重新調權重**無法**修好 §5：英雄熟練根本不在 `calcPower` 的輸入裡，
再怎麼調 16 項能力的權重，都不會讓定價看見它。同理位置適配、召喚師技能、戰術變體。

三條可能的路（本輪不選，交 Owner）：

| 路線 | 做什麼 | 代價 |
|---|---|---|
| **P1 擴大定價輸入** | 定價改吃「引擎實際會用的那一組輸入」：power/tough（含熟練）＋ 行為 mods ＋ 位置 ＋ 英雄 | 定價與引擎耦合變高；但這是唯一能滿足 I12／I13 的路 |
| **P2 以模擬定價** | 用 headless LogicEngine 跑 N 場推導陣容價位（「這支隊值多少」＝ 它打得贏誰） | 昂貴（實測 4.7s／場），但**定義上**與模擬同源 |
| **P3 縮小線上輸入** | 線上只接受被定價的維度（例如熟練歸一、統一英雄池） | 犧牲養成表達；與 CAREER_OWNS_ROSTER 的精神衝突 |

**建議下一輪：`Online Pricing Authority Design v1`** —— 在 P1／P2／P3 之間做選擇，
而不是先動任何數值。**不要**在選定之前調 `COMBINE`、`MOBA_WEIGHTS` 或 `STAT_MAP`：
那會讓一個「量錯東西」的尺變成「量錯東西但看起來準」的尺。

---

## 10. 本輪未做

未調整：`COMBINE`、`MOBA_WEIGHTS`／`FPS_WEIGHTS`、`STAT_MAP`、`MATCH_BAND`、
Battle Engine、player stats、role logic、CBR、Rating。
未修改 `src/`（零 diff）。未實作 SquadSnapshot／Cap／Bracket／LadderRating／Server。

⚠ 量測工具本身在開發過程修過一次**方法學錯誤**（固定藍方 ⇒ 側邊偏差被算成定價誤差）。
修正後才產生本檔所有數字；舊的「定價完全反向」結論已作廢，不列入本檔。
