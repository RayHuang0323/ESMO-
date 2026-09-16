# MOBA Counter Ecosystem & Build Reachability（M4d）v1

> 狀態：2026-09-17 **M4D_CLOSED = YES**（配對 200-seed gate 已通過，見 §8）。
> 2026-09-16 Counter 偵測改為 capability 優先、情境裝可達性修復完成。
> 基準固定：`moba-sim.v6`、income 1.9、Tower／Siege 規則未動。
> 範圍：**只動 `buildPolicy.js`**（＋`itemsViewModel`／`itemsUiSelectors` 的新 reason 文案）。
> 未動：item stats、income、Tower／Siege、全域戰鬥公式、verifier。
> 證據：`reports/moba-items-m4d/`（BEFORE／AFTER 對位量測、capability 分布）。

## 1. Audit 結論（改動前）

`enemyProfile` 的五個訊號中，**只有 heal 真的讀 capability，而它在實戰中恆偽**：

| 訊號 | 舊判定 | 資料源 |
|---|---|---|
| heal | `healer \|\| sustain >= 0.08` | 技能文字正則 ＋ 真實屬性 |
| tanks | `arch==="坦克" \|\| G族件數>=2` | 標籤／族字母 |
| burst | `arch==="刺客" \|\| (法師 && E族>=1)` | 標籤／族字母 |
| crit | **不存在** | — |
| shield | **不存在** | — |

- `HEAL_RX = /治療|復甦|庇護|回復|吸取/` 比對技能文字，**100 名英雄只命中 2 名**。
- 裝備路徑要求 sustain ≥ 0.08，但 v1 可達上限是 `t3_lifespring` 的 **0.07**
  （唯一的 0.08 是 `t2_fang`，只是 1.1 裝備的組件、不在任何 v1 path）。
- 可達性：`seq.push(...situ, ...alt, ...fallback)` 讓情境裝固定落在第 4 順位之後，
  而 v1 每人平均只完成 2.4–3 件 T3 ⇒ 等同買不到。

## 2. Counter 訊號（改動後）

一律先讀敵方即時 `CombatStatsV1` ＋ `effects`；**`arch`／`healer` 標籤只作 fallback**
（敵方還沒買裝備時 capability 全為 0，沒有 fallback 會在開局完全看不到威脅）。

| 訊號 | 新判定 | 門檻依據（實測 v1 可達分布） |
|---|---|---|
| tanks | `armor >= 70` ‖ 坦克標籤 | 坦克 80(3件)／165(滿裝)；戰士 60、刺客 60、輔助 50 ⇒ 70 乾淨分離 |
| heal | `sustain >= 0.10` ‖ `healShieldPower >= 0.15` ‖ healer 標籤 | 見 §2.1 |
| burst | `ap >= 130` ‖ 刺客標籤 | 星隕法冠單件 ap = 110×1.2 = 132（實測含組件 146） |
| crit | `critChance >= 0.40` | v1 上限 0.20 ⇒ **預期永不觸發，這是正確結果**（見 §2.2） |
| mr | `mr >= 60` → 只記錄 `mrCount` | v1 法穿只有法師的虛空裂杖，而它本來就在核心序列 |
| shield | `lowHpShieldCount` 只記錄 | **v1 UNSUPPORTED**（見 §2.3） |

**硬規則：門檻不得高於實測可達上限，否則就是死碼。** 舊的 sustain 0.08 正是踩到這點。

### 2.1 heal 門檻為何是 0.10 而不是 0.07

v1 續航分布只有 `{0, 0.07}`，而 0.07 正是**每個法師的核心裝**生命法泉 —— 普遍存在、
毫無鑑別度。實測把門檻設在 0.07 會讓 counter 策略（門檻 1 人）在**完全沒有治療陣容時誤觸發**。
0.10 對應 v1.1 的血誓長弓；v1 因此「無法單靠裝備構成回復威脅」，
heal 訊號改由 `healShieldPower ≥ 0.15`（救贖之環）與 healer 標籤維持 —— **不是死碼**。

### 2.2 反暴擊：偵測是真的，不買才是正確答案

`ANTI_CRIT reduction 0.25` 作用在暴擊傷害上。對滿裝射手：

| 敵方暴擊率 | 攻擊通道倍率 | 加上反暴擊 | 實際減傷 |
|---|---|---|---|
| 0.15（3 件） | 1.1275 | 1.0581 | **6.2%** |
| 0.20（v1 上限） | 1.17 | 1.0775 | **8.0%** |

要到約 0.40 才有 15% 減傷。⇒ 門檻訂 0.40，v1 永不觸發。
依 Owner 指示**不 buff 反暴擊數值**，允許 AI 不買堅壁重盾。

### 2.3 破盾：v1 沒有任何反制手段

護盾來源是 `LOW_HP_SHIELD`（不屈戰旗／靈能護符／靜海披風／聖盾誓約）與 `healShieldPower`，
引擎在 `itemsEngineRuntime.js:303-312` 直接吸收。`STAT_KEYS` 無削盾屬性、`PRIMITIVES` 無反護盾原語。
`t3_shieldbreaker`「碎盾重錘」的實際效果是 `ON_HIT { pctMax: 0.02 }` ＝ **反高血量，不是反護盾**（名字會騙人）。
⇒ 列為 **v1 UNSUPPORTED、留給 v1.1**，不新增 primitive。

## 3. 可達性修復

明確 counter 成立時，把優先序最高的情境裝提前進 core：

| 嚴重度 | 插入位置 | 效果 |
|---|---|---|
| hard（capability 判定達 2 人） | core index 1 | 最早第 2 件 T3 |
| normal | core index 2 | 最早第 3 件 T3 |
| 無訊號 | 不插入 | 原 build 不變 |

**每位玩家最多只提前 1 件**（`promoted` 旗標）；已由既有的 `tanksReplacesCore`
或 counter 策略分支提前過就不再提前 ⇒ 多個 counter 不會吃掉整套 core build。

## 4. 量測（BEFORE → AFTER，絕對第幾件／第幾分鐘）

| 對位 | standard | counter | survival |
|---|---|---|---|
| 高回復→重傷 | 3/5 第4件@22.68 → **第3件@18.2** | 3/5 第2件@13.35（不變） | 第4.33@24.12 → 第3.67@21.35 |
| 高護甲→穿甲 | 第3@18.08 → **第2.67@16.91** | 第2.33@15.58（不變） | 第2.5@14.44 → **第2@12.69** |
| 高 MR→法穿 | 1/5 第2@13.23（不變） | 同左 | 第3@15.77 |
| 高暴擊→反暴擊 | **0/5**（收益不足，正確） | 0/5 | 0/5 |
| 高護盾→破盾 | **0/5**（v1 無裝備） | 0/5 | 0/5 |

- **CORE_BUILD_PRESERVED**：前 3 件 T3 與「無威脅」同定位同策略的交集，**最低 2/3**；
  「每人最多提前 1 件」**零違規**；無任何案例保留 ≤1 件核心。
- **LEGALITY**：30 組（6 對位 × 5 策略）**帳務／背包違規 0**。
- **FALSE_POSITIVES**：無威脅組在 counter 策略下 ✅ 乾淨。standard／early／scaling 仍會提前
  靈能護符／靜海披風，但落在**第 4 順位以後、core 3 件完整保留**；且該陣容確實含 1 名刺客
  與 1 名 AP≥130 的法師 ⇒ 屬正確偵測，不是誤判。

## 5. 一次 differential debug：G11 回歸的真正根因

改動後 `check_moba_items_m3` 的 G11「策略真的改變 AI」變紅（`purchasesSame=counter`）。
**我先用「M4d 規格與 G11 契約政策衝突」解釋，那個判斷是錯的，已撤回。**

依 Owner 指示做一次精準 differential debug（seed 42 / blue b1 / t=1092.5s，
HEAD 與現行版本各擷取完整決策快照，依欄位順序找第一個不同）：

| 欄位 | HEAD | 我的版本 |
|---|---|---|
| **`enemyProfile.burstCount`** | **1** | **0** |

**同一組 `items` 代入兩種規則驗證因果**（排除「輸入不同」的混淆）：
r3 法師持有 1 件 E 族 T3（星隕法冠，ap=146）⇒ 舊規則計入、`ap>=250` 不計入、`ap>=130` 計入。
兩組快照都得到 HEAD=1 / 250版=0 / 130版=1 ⇒ **規則本身造成翻轉，與輸入無關**。

- **CAUSE**：`burstAp` 訂成 250（＝完成 3 件核心的法師），把舊語意「持有 ≥1 件 E 族 T3」
  的觸發點從**第 1 件**推遲到**第 3 件**，改變了雙方 `situational.burst` 的出裝並級聯成購買分岔。
- **IS_REAL_POLICY_CONFLICT = NO** —— 與 `counterPromote` 無關。
- **FIX**：`burstAp` → **130**；同時移除我自行擴張的 `armorPenFlat >= 15` 條件
  （舊規則對物理爆發只用刺客標籤，那是超出最小修正的偵測面，列為 v1.1 候選）。

### 過程中試過並回退的做法

把 counter 策略的插入點從 core index 1 改到 index 0，想與 standard 的 hard 提前拉開差距。
**無效**（G11 detail 一字未變），因為刺客／射手的 tanks 走 `tanksReplacesCore`、不進 `situ`，
那條分支根本沒執行；而連帶的文案修改還打破了 G9 的教練分析斷言 ⇒ 整組回退。

## 6. 驗證

| 驗證 | 結果 |
|---|---|
| `check_moba_items_m1` | **69/69 PASS**（G8 四個釘死的 situational fixture 與 `enemyProfile` 等值斷言全綠） |
| `check_moba_items_m2` | **53/53 PASS** |
| `check_moba_items_m3` | **65/66** —— 只有 G6「相對 HEAD 無改動」擋下刻意修改的 `buildPolicy.js`，commit 後回綠 |
| counter audit 30 組 | 帳務／背包違規 **0** |

配對 200-seed gate 當時因可用記憶體低於 Owner 指定的 5 GB 門檻而未跑（依指示不硬跑）；
**已於 2026-09-17 記憶體回升後補跑完成，結果見 §8**。

## 7. 沒有動的東西

item stats、income 1.9、Tower／Siege 規則、`K_AD`／`K_AP`／`CRIT_BASE`、全域戰鬥公式、
AI build path 的既有順序（只新增提前規則）、任何 verifier、既有 reason code 名稱。

## 8. 配對 200-seed gate（2026-09-17）

固定條件：`moba-sim.v6`、income 1.9、commit `d9538f7`、OFF vs ON 同 seeds、200 seeds。
400 場、失敗 0、耗時 329 秒（6 workers；runner 文件明載 worker 數不影響輸出）。
證據：`reports/moba-items-m4d/off-vs-on/`。**本輪未改任何程式。**

### 8.1 MATCH_DURATION（ON）

| 指標 | M4c ON | **M4d ON** |
|---|---|---|
| median／p75／P90 | 23.62／25.15／26.94 | **23.48／25.13／27.12** |
| max／mean | 60／24.39 | **60／24.36** |
| >30／>35／>40 | 4.5%／2.0%／1.0% | **4.5%／3.0%／0.5%** |
| finish／60 分未結束 | 0.995／1 場 | **0.995／1 場** |

中位與平均略降、P90 +0.18 分、max 與未結束場數持平。兩個小幅波動照實記錄：
**>35 由 2.0% 升到 3.0%**（200 場中 4 → 6 場），而 **>40 反而由 1.0% 降到 0.5%**（2 → 1 場）。
以 200 seeds 而言屬雜訊範圍，且 P90 27.12 遠低於 30–32 的目標帶。

### 8.2 OFF_BASELINE：逐項相同（差異欄位數 0）

`duration_min`（median 25.35／p75 28.33／P90 31.9／max 40.85／mean 26.64）、
`over30/35/40_rate`、`finish_rate` 1.0、`unfinished_at_60` 0、`blue_win_rate` 0.245、
`kills_at`（2.84／6.89／12.99／25.36）、`towers_at_20` 7.92、`n` 200
—— 十個欄位全部與既有 baseline 一致 ⇒ **OFF 路徑未受 M4d 影響**。

### 8.3 T3_TIMING / LEGALITY / WIN_RATE

- T3 1/2/3 件中位 **8.98／16.35／20.19**（M4c 8.98／16.38／20.25），
  `reach3_rate` 0.797（M4c 0.799）、`first_before_11_rate` 0.95 ⇒ **實質不變**。
- LEGALITY：`rejected_total` 0、`inventory_violations` 0、`conservation_fails` 0。
- WIN_RATE（只記錄、未修）：OFF 藍勝率 0.245（與 baseline 相同）、ON 0.367 → **0.397**。
  kills 10/15/20/end = 2.02／5.92／15.81／32.48；`towers_at_20` OFF 7.92 / ON 10.21。

### 8.4 COUNTER_PURCHASE（每 100 場購買數）

| 裝備 | M4c | **M4d** | 變化 |
|---|---|---|---|
| `t3_finalstring`（穿甲） | 86 | **105** | +22% |
| `t3_psyward`（反爆發） | 56.5 | **92.5** | +64% |
| `t3_thornmail`（反治療） | 89.5 | **95.5** | +6.7% |
| `t3_rendspear`（反治療） | 68.5 | **73** | +6.6% |
| `t3_calmveil` | 218 | **227.5** | +4.4% |
| `t3_soulrend` | 0（計畫席次 0） | **1**（計畫席次 3） | 首次脫離結構性零購買 |
| `t3_shieldbreaker` | 174.5 | **167** | −4.3%，與「每人最多提前 1 件」的額度重分配一致 |

**⚠ 時點與購買率的來源不可混用**：計畫席次與購買率出自本次 200 場對局；
**逐件 counter 的購買時點出自離線對位量測**（§4），因為本資料集不含逐件購買時間戳
（`item_purchases.csv` 只有次數、`players.csv` 只有每位玩家的 T3 完成時點）。

### 8.5 ⚠ `counterPlanned` 欄位的正確讀法

`players.csv` 的 `counterPlanned` **只代表該玩家的 build target 曾經包含 counter item**
（含排在 fallback 順位、實際永遠買不到的那些）。實測 ON 的 2000 名玩家**全部非空（100%）、
六個定位都是 100%**，因此它：

- **不能代表 counter signal 實際觸發**；
- **不得用來當 trigger rate 的證據**。

它的有效用途只有兩個：交叉驗證 `counter_items.planned_player_slots`
（792／592／584／424／400／395／3／3，與 summary 完全一致），以及提供 ON 的 T3 完成時點。
要判斷訊號是否真的觸發，必須看 `reasons` 中的 `enemyHeal`／`enemyTanks`／`enemyBurst`／
`counterPromote`，或用 `tools/audit/moba_counter_audit.mjs` 的中性對照差異法。

### 8.6 結論

**M4D_TARGET_MET = YES**　**M4D_CLOSED = YES**　**READY_FOR_M4E = YES**

duration 與 legality 無明顯退步、OFF baseline 逐項相同、T3 timing 實質不變、
counter 購買率全面提升。未 push、未 deploy。
