# MOBA 戰鬥屬性契約 v1 — CombatStatsV1（草稿）

> 狀態：**M0 架構草稿，未實作**。本文件定義裝備如何進入 `LogicEngine`，而**不改變**既有的 power／tough 架構。
> 行號以 `main = a7fba81` 的 `src/LogicEngine.js` 為準；實作時行號會漂移，以符號名稱為準。
> 所有常數都是**草案**，M3 校準前不得視為定案。

---

## 0. 目標與非目標

**目標**

1. 讓 HP、AD、AP、Armor、MR、Attack Speed、Crit、Move Speed、Ability Haste、Armor Pen、Magic Pen、Lifesteal／Omnivamp
   **各自在引擎內有真的消費點**。
2. 以 adapter 接在引擎既有的**單一出口**，不重寫傷害模型。
3. `configureItems()` 不呼叫 ⇒ legacy 模擬**逐位元不變**。
4. 決定性：不新增、不移除任何 rng 呼叫。

**非目標（v1 不做）**

- 不把英雄熟練度（`heroProgress.attrs`）或本場等級改寫成 CombatStatsV1；它們繼續決定 `power`／`maxHp` 的**基礎通道**。
- 不引入離散普攻、真實暴擊擲骰、英雄技能冷卻、法力。
- 不改 `dmgK`、節奏常數與任何 v1／v2／v3 規則集內容。

---

## 1. 現況（adapter 要接的出口）

| 出口 | 位置 | 現在做什麼 |
|---|---|---|
| E1 輸出 | `_combatStep` L2364–2366 | `dmgAmt = power × dt × dmgK × lateFactor × buffK × dragonPowerK(p.side) ÷ dragonGuardK(foe.side)` |
| E2 結算 | L2392（`pendingHits`，同時結算）→ tick 結算相 | 全員算完後才扣血，避免陣列順序偏差 |
| E3 扣血 | `_damageHero` L637–645 | `spellsOn` 時先扣護盾再扣血 |
| E4 回復 | L2314–2344 | `healK`（點燃減療）× 三段式回復 |
| E5 最大生命 | `_applyMatchLevel` L712–718 | `maxHp = baseMaxHp × hpMultFor(mlv)`；升級補上新增的那段血 |
| E6 移速 | L3872–3877 | 交戰／移動基速 × 撤退 × 紅藍 Buff × 幽魂 × dt |
| E7 購買時點 | 出生 L111–118；復活 L3392–3394；回城抵達 L3618–3622 | — |
| E8 輸出 | `snapshot()` L4009+ | players 欄位、隊伍金錢、winProb |

關鍵事實：**`tough` 目前只決定 `maxHp`（L118），沒有任何減傷**。所以護甲／魔抗是全新的乘法通道，不能拿 tough 代替。

---

## 2. CombatStatsV1 資料形狀與單位

```js
// 由 combatStatsV1.js 純函式產生；快取在 p.cs；只在 inventory 或等級改變時重算。
CombatStatsV1 = {
  schema: "CombatStatsV1",
  hp: 0,                 // 平面最大生命（引擎生命值）
  ad: 0,                 // 攻擊力（點）
  ap: 0,                 // 法術強度（點，已含 apAmp）
  armor: 0, mr: 0,       // 抗性（點）
  attackSpeed: 0,        // 小數：0.35 = +35%
  critChance: 0,         // 小數：0..1（clamp）
  critDamage: 1.75,      // 暴擊倍率（基礎 1.75 + critAmp）
  abilityHaste: 0,       // 點（上限 AH_CAP）
  moveSpeed: 0,          // 小數：0.08 = +8%
  armorPenFlat: 0, armorPenPct: 0,
  magicPenFlat: 0, magicPenPct: 0,
  lifesteal: 0, omnivamp: 0,   // 小數
  healShieldPower: 0,          // 小數
  regenPctPerSec: 0,           // 加在 R.regen.outOfCombatPctPerSec 上
  effects: [/* 已解析的 primitive 實例（依 unique group 去重） */],
}
```

| 常數（草案） | 值 | 意義 |
|---|---:|---|
| `K_AD` | 100 | AD 100 點 ≈ 攻擊通道 +100% |
| `K_AP` | 150 | AP 150 點 ≈ 技能通道 +100% |
| `R_ABILITY_AD` | 0.6 | AD 對物理技能通道的比例 |
| `R_ATTACK_AP` | 0.3 | AP 對法術攻擊通道的比例 |
| `CRIT_BASE` | 1.75 | 暴擊倍率 |
| `AH_CAP` | 60 | 技能加速上限 |
| `ONHIT_BASE_RATE` | 1.0 | 基準「每秒攻擊次數」，on-hit 以 × (1 + attackSpeed) 換算 |
| `RESIST_K` | 100 | 減傷 = K ÷ (K + 有效抗性) |

## 3. 英雄傷害 Profile（定位推導，草案）

英雄資料目前**沒有傷害類型**。v1 由 `correctedArch(hero)` 推導，另允許少量逐隻覆寫（上限 15 隻）。

| 定位 | 物理占比 | 法術占比 | 攻擊通道 | 技能通道 |
|---|---:|---:|---:|---:|
| 坦克 | 0.70 | 0.30 | 0.50 | 0.50 |
| 戰士 | 0.85 | 0.15 | 0.55 | 0.45 |
| 刺客 | 0.80 | 0.20 | 0.35 | 0.65 |
| 法師 | 0.05 | 0.95 | 0.20 | 0.80 |
| 射手 | 0.90 | 0.10 | 0.80 | 0.20 |
| 輔助 | 0.30 | 0.70 | 0.30 | 0.70 |

四個通道權重：`wPA = phys × attack`、`wPB = phys × ability`、`wMA = magic × attack`、`wMB = magic × ability`（總和 = 1）。
Profile 由呼叫端（`configureItems`）傳入，引擎不 import `heroDatabase`（沿用 `configureArchetypes` 的邊界）。

---

## 4. 公式

### 4.1 輸出（E1）

```
D0 = 既有 dmgAmt（L2364–2366 原式，一個係數都不改）

atkK   = (1 + ad / K_AD) × (1 + attackSpeed) × (1 + critChance × (critDamageEff − 1))
abPK   = (1 + ad × R_ABILITY_AD / K_AD) × hasteK
maAK   = (1 + ap × R_ATTACK_AP / K_AP) × (1 + attackSpeed)
maBK   = (1 + ap / K_AP) × hasteK
hasteK = 1 + min(abilityHaste, AH_CAP) / 100
critDamageEff = critDamage × (1 − foe.antiCrit)          // ANTI_CRIT 讀防守方

physOut  = D0 × (wPA × atkK + wPB × abPK)
magicOut = D0 × (wMA × maAK + wMB × maBK)

onHit (每個 ON_HIT 實例，依 unique group 去重)：
  base = flat + ratioAP × ap + pctCurrent × foe.hp + pctMax × foe.maxHp
  amt  = base × ONHIT_BASE_RATE × (1 + attackSpeed) × dt × lateFactor
  依 damageType 加到 physOut 或 magicOut

execute：foe.hp / foe.maxHp < threshold ⇒ physOut、magicOut 各 × (1 + bonus)
```

**零屬性短路**：攻擊者 `p.cs` 為空（沒有任何裝備）時直接輸出 `physOut = D0 × physShare`、`magicOut = D0 × magicShare`，
不做乘法鏈，避免浮點誤差讓「無裝備 = 無影響」不成立。

### 4.2 結算與減傷（E2、E3）

`pendingHits` 由 `[p, foe, dmgAmt]` 擴充為 `[p, foe, dmgAmt, { phys, magic }]`（itemsOn 才帶第四欄；關閉時形狀不變）。

```
effArmor = max(0, (foe.cs.armor + foe.auraArmor) × (1 − p.cs.armorPenPct) − p.cs.armorPenFlat)
effMr    = max(0, (foe.cs.mr + foe.auraMr) × (1 − p.cs.magicPenPct) − p.cs.magicPenFlat)
physTaken  = phys  × RESIST_K / (RESIST_K + effArmor)
magicTaken = magic × RESIST_K / (RESIST_K + effMr)

_damageHero(foe, physTaken, magicTaken)
  1. 只擋法傷的護盾先吸 magicTaken
  2. 一般護盾（召喚師屏障與裝備護盾共用一個池，取 max(amount)、max(until)）吸剩餘
  3. 扣血
```

- 護盾出口條件由 `this.spellsOn` 放寬為 `this.spellsOn || this.itemsOn`；兩者都關閉時與舊碼逐位元相同。
- 擊殺判定仍在全部 `pendingHits` 扣完之後，沿用既有同時結算語意。

### 4.3 回復（E4）

```
healCut = max(igniteCut if ignite active, grievousCut if grievous active)   // 取最強，不相加
healK   = 1 − healCut

lifesteal heal = physAttackTaken × p.cs.lifesteal × healK        // 物理攻擊通道的實際承傷
omnivamp heal  = (physTaken + magicTaken) × p.cs.omnivamp × healK
                 （光環／持續傷害類 × 1/3，v1.1 BURN 起適用）
```

- 吸血與全能吸血在**結算相**、扣血之後套用，保持順序無關。
- `GRIEVOUS_WOUNDS` 把既有的 `healCutUntil` 泛化為 `{ until, cut }`；點燃仍寫入同一欄。
- `healShieldPower` 放大該英雄**施放**的治療量與護盾量（召喚師治療、屏障、裝備給友軍的護盾），不放大自身吸血。
- `regenPctPerSec` 加在 `R.regen.outOfCombatPctPerSec` 之上，仍受脫戰 7 秒延遲與交戰閘門管制。

### 4.4 最大生命（E5）

```
maxHp = baseMaxHp × hpMultFor(mlv) + cs.hp
```

- 買到加血裝：比照升級，補上新增的那段血（`hp += max(0, gain)`），**不是全補**。
- 升級時公式同上，`cs.hp` 已在內，不重複加。

### 4.5 移速（E6）

```
spd × (1 + cs.moveSpeed + auraMs) × slowK
slowK = min(紅 Buff 緩速, 裝備緩速)   // 緩速取最強，不相乘；淨化免疫期仍阻擋
```

### 4.6 光環（每 tick 前置相）

- tick 開始、移動前，以**席位固定順序**（b1→b5、r1→r5）計算每名英雄的 `auraArmor`、`auraMr`、`auraMs`。
- 同一 unique group 的光環只取最大值，不疊加。

---

## 5. 購買時點與屬性重算（E7）

| 事件 | 引擎位置 | 行為 |
|---|---|---|
| 出生 | 建構子完成後、第一個 tick 前（`configureItems` 內部立即執行一次開窗） | 買 starter／組件 |
| 復活落地 | L3392–3394 之後 | 開窗 |
| 回城抵達 | L3618–3622 之後 | 開窗 |

- 開窗呼叫 `buildPolicy.nextStep()`（純函式）與 `itemEconomy.purchase()`（帳本）；**不讀 rng**。
- 任何 inventory 變化或 `_applyMatchLevel` 之後呼叫 `_recomputeCombatStats(p)` 更新 `p.cs`。

---

## 6. Opt-in 邊界與 legacy 不變保證

```js
constructor(...)  { this.itemsOn = false; this.itemMeta = null; }

configureItems({ catalog, profiles, strategies, economy, meta } = {}) {
  if (!catalog) return;              // 不帶資料 ⇒ 等於沒呼叫
  this.itemsOn = true;
  ...
}
```

| 保證 | 做法 | 驗證 |
|---|---|---|
| 不呼叫 ⇒ 逐位元不變 | 每個出口以 `if (this.itemsOn)` 包住新邏輯；`pendingHits` 形狀與 `_damageHero` 參數在關閉時不變 | regress 15 seeds 終局 snapshot 雜湊與 `a7fba81` 基線相同 |
| rng 中立 | 裝備、光環、AI、購買不呼叫 `rng`／`rng2`／`rng3` | 測試環境包裝三條 rng 計數，items 開／關的呼叫次數相同（同一場軌跡內） |
| snapshot 形狀不變 | 新欄位只在 `itemsOn` 時展開（沿用 `...(this.tacticOn ? {...} : {})` 慣例） | items 關閉時 snapshot key 集合與基線相同 |
| 舊規則集不動 | 裝備常數放在 `ITEM_RULES.v1`，不寫進 `SIM_RULES.v1/v2/v3` | 語意指紋：v3 規則集內容不變 |
| 同時結算語意不變 | 吸血、護盾、on-hit 全在結算相套用 | runtime29 陣列順序公平性檢查 |

---

## 7. snapshot 追加欄位（itemsOn 才出現）

```js
players[i] += {
  inv: [itemId|null ×6],
  goldUnspent, goldSpent,            // 整數
  cs: { hp, ad, ap, ar, mr, as, cr, ah, ms, ls, ov },   // 緊湊摘要（四捨五入到整數或兩位小數）
  build: { strategy, lockedSlot, reasons: [...] },
}
snapshot += {
  itemMeta: { catalogVersion, rulesVersion },
  purchases: [{ seq, t, playerId, action, itemId, cost, unspentAfter }],   // 最近 N 筆環形緩衝
}
```

- `players[i].gold` 維持「累計獲得」語意（legacy 相同）。
- 隊伍金錢 `bGold／rGold`：itemsOn 時改為個人 `earned` 加總；items 規則集需重估 `winProb` 的金錢差係數。

---

## 8. 版本與語意指紋

| 項目 | 規則 |
|---|---|
| 模擬版本 | 正式流程（GameView／Challenge runner）開始呼叫 `configureItems` 的那一次 commit，bump `MOBA_SIMULATION_VERSION` → `moba-sim.v5` |
| 語意檔案清單 | `SIMULATION_SEMANTICS_FILES` 追加：`itemCatalog.js`、`itemRecipes.js`、`itemEconomy.js`、`buildPolicy.js`、`combatStatsV1.js`、`itemEffects.js` |
| 快照輸入 | `SNAPSHOT_INPUTS.buildStrategy`；runner 對「宣告卻未實作」一律拒跑（沿用 draftPolicy 護欄） |
| 客戶端禁止欄位 | `FORBIDDEN_CLIENT_KEYS` 追加 `inventory`、`items`、`gold`、`purchases`、`combatStats` |

---

## 9. 效能

- `p.cs` 快取；只有購買、合成、starter 丟棄與升級時重算（每場每人約 20–40 次）。
- 光環每 tick O(10 × 10)；on-hit 與減傷是常數時間。
- 目標：itemsOn 的 tick 耗時增加 ≤ 10%（Gate 13）。

---

## 10. 驗證清單（M2 實作時的最低要求）

1. items 關閉：regress 終局雜湊、rng 呼叫次數、snapshot key 集合與基線相同。
2. 零裝備英雄在 itemsOn 下的輸出 = `D0 × 占比`（短路路徑）。
3. 單元夾具：每個 primitive 一組固定輸入 → 固定輸出（含 unique group 去重、緩速取最強、減療取最強）。
4. 護盾順序：只擋法傷 → 一般護盾 → 血量，逐筆可驗。
5. 最大生命：買裝補新增段、升級不重複加。
6. 同時結算：交換陣列順序，吸血與護盾結果相同。
7. 光環：固定席位順序計算，交換陣營鏡像結果對稱。

---

## 11. 已知限制（誠實揭露）

1. 暴擊、攻速、on-hit 是**期望值**，畫面上沒有真的暴擊事件；呈現層若要顯示「暴擊」只能是示意，不得宣稱真實判定。
2. Ability Haste 只作用於技能通道期望輸出，不縮短任何冷卻。
3. 英雄傷害類型由定位推導，混合型英雄會失真。
4. 抗性是全新通道，TTK 必然改變，items 規則集必須重新校準 `dmgK`（M3），否則節奏門檻失守。
