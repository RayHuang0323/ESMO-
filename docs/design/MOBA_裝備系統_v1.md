# MOBA 裝備系統 v1 — Milestone 0 設計契約（草稿）

> 狀態：**M0 設計草稿，未實作**。未修改 `src/`、未 commit、未 push、未 deploy。
> 基準：`main = a7fba81`（worktree `ESMO-worktrees/moba-items-m0`，branch `design/moba-items-v1-m0`）。
> 姊妹文件：`docs/design/MOBA_裝備矩陣_v1.md`（88 件清單）、`docs/architecture/MOBA_戰鬥屬性契約_v1.md`（CombatStatsV1）。
> 所有數值都是**預算草案**，M3 平衡校準前不得視為定案。

---

## 0. 一頁摘要

- **裝備必須真的改變戰鬥**。做法不是把 88 件壓成 power／tough 百分比，而是在引擎既有的五個單一出口各接一段：
  輸出傷害、受到傷害、回復、最大生命、移動速度。
- **沿用引擎第六個 opt-in 層**：`configureItems()`。不呼叫 ⇒ 所有裝備程式碼短路 ⇒ 舊模擬逐位元不變
  （與 configureMatch／Players／Heroes／Archetypes／Spells 同一條慣例）。
- **Catalog**：規格 88 件結構合理，但**分兩批上線**——v1.0 先上 68 件（完成裝 24 件），v1.1 補齊剩下 20 件完成裝。
- **效果系統**：9 個 v1.0 primitive、4 個 v1.1、5 個延後。每件裝備是資料，不在 LogicEngine 寫個別 if。
- **經濟**：個人金錢帳本（earned／spent／unspent），整數帳、守恆驗證器；只能在出生、復活、回城抵達泉水時購買；
  禁止舊版「錢夠就送裝且不扣錢」。
- **AI 出裝**：依英雄主定位（坦克／戰士／刺客／法師／射手／輔助），只在購買時點決策；純函式、不使用任何 RNG，
  依敵方傷害類型、坦度、治療量、爆發威脅與自身狀態選情境裝，一旦開始合成就鎖定路線。
- **Replay／Online**：購買事件進 Replay 與 BattleResult（附加欄位、版本不變）；Challenge 以 `buildStrategy`
  作為新的凍結輸入，搭配 `moba-sim.v5`。
- **平衡**：本輪不改數值，只定義 13 道 gate，其中最硬的是「itemsV1 關閉時 legacy hash 不變」與「金錢守恆 0 誤差」。

---

## 1. Audit：現在真的有什麼（以程式為準）

### 1.1 戰鬥模型（`src/LogicEngine.js`）

| 事實 | 位置 | 對裝備的意義 |
|---|---|---|
| 英雄只有 `power`／`tough` 兩個總值；`basePower=[30,34,36,42,18]`、`baseTough=[1.6,1.15,0.9,0.8,1.25]`（依席位） | L86–91 | 沒有 AD／AP／攻速／暴擊 |
| `tough` **只決定最大生命**：`maxHp = 600 × tough` | L118、L128 | 目前沒有任何「減傷」概念，護甲／魔抗是全新通道 |
| 英雄傷害是**連續輸出**：`dmgAmt = power × dt × dmgK × lateFactor × buffK × dragonPowerK ÷ dragonGuardK` | L2364–2366 | 暴擊、攻速、on-hit 只能用**期望值**表達，不能擲骰 |
| `atkCd = 0.5` 與 `rng() < 0.2` 只決定特效種類（basic／power） | L2380–2391 | 不是真的普攻；不能拿來當 on-hit 事件 |
| 同時結算：傷害先進 `pendingHits`，全員算完才扣血 | L2392 | 吸血、on-hit 護盾必須在結算相套用，保持順序無關 |
| 唯一扣血出口 `_damageHero`：先扣護盾再扣血（只在 `spellsOn` 時） | L637–645 | 護盾類裝備沿用同一出口 |
| 回復三段式（交戰／脫戰／泉水），`healK` 已支援點燃減療 | L2314–2344 | 重傷與吸血直接接在 `healK` |
| 移速是一條乘法鏈（交戰速、撤退、紅藍 Buff、幽魂） | L3872–3877 | 移速與緩速接在同一條鏈 |
| 本場等級：`power = basePower × powerMultFor(mlv)`、`maxHp = baseMaxHp × hpMultFor(mlv)`（Lv18：×2.87／×2.02） | L712–718、`matchProgression.js` L81–86 | 裝備預算必須和等級成長一起看 |
| 技能冷卻只存在於召喚師技能（`spellCd`） | `matchProgression.js` L598–601 | **英雄技能沒有冷卻模型**，Ability Haste 沒有現成消費者（見 §5.4） |
| 三條亂數：`rng`（主）、`rng2`（戰術層）、`rng3`（選手能力層） | L67、L314、L396 | 裝備與 AI 出裝一條都不得使用 |

### 1.2 金錢

| 來源 | 目前歸屬 | 位置 |
|---|---|---|
| 開局 500 | **隊伍** `bGold/rGold` | L78 |
| 被動 14／秒 | 隊伍 | L3993 |
| 小兵死亡 20／隻 | 隊伍（不看距離） | L3093 |
| 塔 250 | 隊伍 | L3966 |
| 龍 200／巴龍 400 | 隊伍 | L2109 |
| 擊殺 300 | 隊伍 **＋** 擊殺者個人 `p.gold` | L2498 |
| 野怪營地 60／90 | 隊伍 ＋ 在場英雄個人分成 | L1980–1985 |

⇒ 個人 `p.gold` 只有擊殺與營地，**不夠支撐購買**。隊伍金錢則影響 `winProb`（L4010–4012）與 `BattleResult.gold`。

### 1.3 購買時點在引擎裡已經存在的事件

- 出生：建構子生成點（L111–118）。
- 復活：`p.respawn <= 0` 傳回泉水（L3392–3394）。
- 回城抵達：`recallT` 走完、`_navTeleport` 到泉水（L3618–3622）。

### 1.4 呈現、結算、重播、挑戰

- HUD：`BattleObserverHUD`「裝備 · 未提供」、`HeroDetailPanel`「裝備系統尚未整合，保留位置（不造假）」。
- `BattleResult.v2`（`src/battle/battleResult.js`）：隊伍 gold、個人 gold，無裝備。
- `MobaReplay.v1`（`src/platform/contracts/mobaReplay.js`）：frame `p=[x,y,hp,dead,k,d,a,gold,lv]`；
  歷來以**附加 optional 欄位**擴充、不改版本。
- Challenge：`squadSnapshot.js` 的 `capturedInputs` 宣告快照涵蓋哪些引擎輸入；`simulationVersion.js`
  以語意指紋守門，`draftPolicy` 成為戰鬥輸入時 bump 了 `moba-sim.v3`（單向門）。

### 1.5 Legacy（`src/EsportsGame.jsx` L755–812）

- 32 件、名稱與數值照搬外部遊戲；`itemStats()` 只加總顯示用屬性，**從未進入傷害**。
- 出裝規則：`itemCount = floor((gold + cs×30) / 2600)` ⇒ 錢夠就直接送、不扣錢。
- **可沿用的是概念**：四大類（物理／法術／坦克／功能）、依定位核心出裝、四種情境（反物理／反法術／反治療／破甲）、
  依敵方陣容換裝的判斷方向。
- **不可沿用**：名稱、icon、數值、只有文字的被動、不扣錢的自動送裝、舊的五職業分類（打野是席位不是定位）。

---

## 2. 設計紅線

1. **不照搬** LoL／傳說對決的名稱、icon、數值、被動名稱。結構（tier、合成、情境裝、爆發期）可以研究。
2. **裝備必須改變 Battle**：每一個屬性都要有真的消費點；沒有消費點的屬性不得出現在 v1 裝備上。
3. **不改 LogicEngine 架構**：只在既有單一出口接 adapter；不重寫傷害模型、不新增第二套戰鬥狀態。
4. **opt-in**：`configureItems()` 不呼叫 ⇒ legacy 逐位元不變（hash gate 釘死）。
5. **不使用 RNG**：暴擊、on-hit、AI 出裝、購買時序全部決定性；三條 rng 的呼叫次數與 items 關閉時相同。
6. **不在 LogicEngine 寫單件裝備 if**：引擎只認得 primitive；裝備是資料。
7. **金錢守恆**：整數帳、0 誤差、每 tick 可驗。
8. **本輪不改 Battle Balance**：`dmgK`、收入、塔、節奏常數一律不動；需要校準的一律列進 M3 並經 gate。

---

## 3. 系統總覽

```
itemCatalog（資料）──┐
itemRecipes（資料）──┼─> itemEconomy（帳本／購買合法性）──┐
buildPolicy（純函式）─┘                                   │
                                                          v
LogicEngine.configureItems({ catalog, strategies, meta }) ─> itemsOn
   ├─ 購買時點（出生／復活／回城抵達）→ AI 決策 → 帳本 → inventory
   ├─ inventory 或等級改變 → recomputeCombatStats(p) → p.cs（快取）
   ├─ 輸出傷害出口（L2364）→ CombatStatsV1 輸出倍率 ＋ on-hit ＋ 斬殺
   ├─ 結算相（pendingHits）→ 減傷（護甲／魔抗／穿透）→ _damageHero（護盾）→ 吸血
   ├─ 回復出口（L2339）→ healK（重傷）＋ 回復類效果
   ├─ 移速鏈（L3872）→ 移速％ ＋ 緩速
   └─ snapshot → inv／gold 帳本／購買事件環形緩衝
                                   │
                                   v
useBattleFeed → BattleResult.v2（附加 build）／MobaReplay.v1（附加 purchases）／HUD
```

建議新增模組（M1 起，全部純 JS、不 import React／store）：

| 模組 | 責任 |
|---|---|
| `src/battle/moba/items/itemCatalog.js` | 88 件資料、tier、屬性、primitive 參數、unique group、上線批次 |
| `src/battle/moba/items/itemRecipes.js` | 合成樹、差價計算、合法性檢查 |
| `src/battle/moba/items/itemEconomy.js` | 個人帳本、收入歸屬、購買交易、守恆不變量 |
| `src/battle/moba/items/buildPolicy.js` | 六定位出裝路線、敵方 profile、情境規則、鎖定、Build Strategy |
| `src/battle/moba/items/combatStatsV1.js` | inventory ＋ 等級 → CombatStatsV1（純函式） |
| `src/battle/moba/items/itemEffects.js` | primitive 的純計算（輸出倍率、減傷、護盾觸發、光環） |
| `src/battle/moba/items/itemSnapshot.js` | snapshot／Replay／BattleResult 的緊湊格式轉換 |

---

## 4. Catalog v1：數量評估

### 4.1 結論

| 類別 | Owner 目標 | 建議規格 | v1.0 上線 | v1.1 補齊 |
|---|---:|---:|---:|---:|
| T1 基礎組件 | 18 | **18** | 18 | — |
| T2 中階組件 | 16 | **16** | 16 | — |
| T3 完成裝 | 44 | **44** | **24** | 20 |
| Boots | 6 | **6**（基礎 1 ＋ 升級 5） | 6 | — |
| Role／starter | 4 | **4** | 4 | — |
| 合計 | 88 | **88** | **68** | 20 |

**規格數量維持 88，不調整**；調整的是**上線節奏**。理由：

1. **T1 18 件合理**：12 種屬性各需一個原子組件，另外 5 件是大小兩種尺寸（AD／AP／HP／護甲／魔抗），
   讓 AI 回城時能用 300–500 的顆粒度花錢，避免身上長期壓著用不掉的錢；再加治療強化與脫戰回復各 1。
2. **T2 16 件合理**：每個家族至少 1–2 條中間路徑，且包含兩件早期反治療組件（物理／法術各 1），讓反制不必等完成裝。
3. **T3 44 件的上限在「可分辨性」**：引擎是連續輸出模型、沒有技能冷卻與法力，許多外部遊戲靠主動技或技能互動區分的裝備，
   在 ESMO 會退化成屬性棒。44 件要靠 v1.0＋v1.1 的 13 個 primitive 撐出差異，**一次上 44 件會讓平衡 gate 的組合數爆炸**
   （反制情境 × 定位 × 裝備），也無法判斷是哪一件破壞節奏。
4. **v1.0 的 24 件**：八大家族各 3 件，保證每個定位都有核心 3 件、至少 1 條替代與 4 種反制；
   v1.1 的 20 件在 v1.0 通過全部 gate 後才開，並帶入 BURN／RAMPING 系列 primitive。

### 4.2 八大家族的 T3 分配（44）

| 家族 | 件數 | v1.0 | 主要定位 |
|---|---:|---:|---|
| A 暴擊／射手 | 6 | 3 | 射手 |
| B 攻速／On-hit | 5 | 3 | 射手、戰士、坦克破甲 |
| C 刺客／穿透 | 6 | 3 | 刺客、戰士 |
| D 戰士／鬥士 | 6 | 3 | 戰士、刺客 |
| E 法術爆發 | 6 | 3 | 法師 |
| F 法術續戰／功能 | 5 | 3 | 法師、輔助 |
| G 坦克／防禦 | 6 | 3 | 坦克、戰士 |
| H 輔助／團隊功能 | 4 | 3 | 輔助 |

逐件資料見 `MOBA_裝備矩陣_v1.md`。

### 4.3 Tier 與合成規則

| 規則 | 內容 |
|---|---|
| T1 | 300–500，單一屬性原子（少數雙屬性），不帶效果 |
| T2 | 850–1050，= 2 件 T1（可相同）＋ 合成費；可帶小型效果（僅反治療、小燃燒） |
| T3 | 2300–3600，= 2–3 件組件（T2／T1）＋ 合成費；完成裝屬性**不必**等於組件總和 |
| Boots | 基礎靴 300；升級靴 900–1000 = 基礎靴 ＋ 合成費；**最多 1 雙** |
| Starter | 400–450；**最多 1 件**；需要格子時自動丟棄、不退款（金錢記為已花） |
| 格子 | 6 格；組件也佔格；合成時先扣掉被消耗的組件再放入成品 |
| Unique group | 同組效果不疊加（例：`grievous`、`armorPenPct`、`lifeline`、`execute`、`aura:resist`）；AI 不會買同組第二件 |
| 差價 | 合成價 = 成品價 − 身上已擁有且被消耗的組件原價；不足則不能合成 |
| 出售 | **v1 不開放出售**（見開放問題 Q4） |

---

## 5. 效果系統（Item Effect Architecture）

### 5.1 原則

- 引擎只認得 **primitive**；裝備在 catalog 內宣告 `effects: [{ type, params }]`。
- 每個 primitive 有：**觸發時點**（重算屬性／輸出／結算／回復／移動／每 tick 光環）、**純計算函式**、
  **unique group**、**snapshot 表示**。
- primitive 不得呼叫 rng、不得讀取畫面資料、不得寫入其他玩家以外的狀態。

### 5.2 v1.0（9 個）

| Primitive | 語意（決定性） | 引擎接點 | 使用者（v1.0） |
|---|---|---|---|
| `STAT_BONUS` | 平面／百分比屬性（含暴擊傷害、法強放大、％穿透、治療護盾強度） | 重算 `p.cs` | 全部 |
| `ON_HIT` | 每「攻擊秒」追加傷害：平面、AP 比例、目標當前生命％、目標最大生命％；× (1+攻速) | 輸出出口 | 風暴三叉、奔流護腕、碎盾重錘 |
| `LIFESTEAL`／`OMNIVAMP` | 依**結算後**實際造成的傷害回復（吸血只算物理攻擊通道；全能吸血算全部） | 結算相 | 嗜紅牙（組件）、生命法泉 |
| `GRIEVOUS_WOUNDS` | 命中目標或被擊中時，對方 3 秒內回復 −40%（與點燃取較大，不相加） | 結算相 → `healCutUntil` 泛化 | 重創鐮、衰敗之瓶、裂傷刺矛、裂魂法杖、棘刺鎧 |
| `LOW_HP_SHIELD` | 目標（自己／最近隊友／只擋法傷）血量跌破門檻時給護盾；有冷卻 | 結算相後檢查 | 不屈戰旗、靈能護符、靜海披風、聖盾誓約 |
| `EXECUTE` | 目標血量比例低於門檻時，輸出 × (1 + bonus) | 輸出出口 | 暗影刃 |
| `ANTI_CRIT` | 受到的暴擊期望加成 × (1 − k) | 結算相減傷 | 堅壁重盾 |
| `AURA` | 範圍內友軍獲得平面護甲／魔抗（或移速％）；每 tick 由固定順序計算 | tick 前置光環相 | 守望聖壇 |
| `SLOW_ON_HIT` | 技能通道命中時，目標移速 −15%、1.5 秒；與其他緩速取最強，不相乘 | 移速鏈 | 冰霜法冠 |

### 5.3 v1.1（4 個）

| Primitive | 延後理由 |
|---|---|
| `BURN` | 需要持續傷害的擊殺歸屬（沿用點燃 `igniteBy` 模式），會影響 KDA 不變量驗證，v1.0 先驗證單次傷害 |
| `RAMPING_RESIST` | 需要「持續接觸秒數」的遲滯與衰減規則，易在拉扯中反覆震盪 |
| `RAMPING_STAT` | 同上（攻速／攻擊力隨接觸時間成長） |
| `SUSTAIN_REGEN` | 改變脫戰回復契約（`R.regen`），而 M1.5 的回復常數是節奏門檻的一部分，要單獨驗 |

### 5.4 延後到 v1.2 以後（5 個）

| Primitive | 延後理由 |
|---|---|
| `ON_ABILITY_HIT`／`SPELL_PROC` | 引擎沒有離散的英雄技能施放與冷卻；硬做只會是換名字的輸出倍率 |
| `REVIVE` | 會改寫死亡／復活與 `Σk == Σd` 的 KDA 不變量（runtime29 §4），風險過高 |
| `ACTIVE`（靜滯、淨化等主動） | 需要 AI 主動施放決策層，v1 只規劃資料欄位 `active: null` |
| `THORNS`（反傷） | 反傷會產生「無擊殺者的死亡」或雙重歸屬，需先定義歸屬規則 |
| `STRUCTURE_DAMAGE` | 直接改變拆塔節奏，而節奏是 regress2 最脆弱的門檻 |

### 5.5 Ability Haste 的誠實揭露

引擎目前**沒有英雄技能冷卻模型**。v1 的 Ability Haste 只有一個消費者：`CombatStatsV1` 的**技能通道輸出倍率**
`hasteK = 1 + min(AH, 60) / 100`（施放頻率提升換算成技能通道的期望輸出）。它**不縮短召喚師技能冷卻**、
不影響 AI 決策。若未來加入真的技能冷卻，AH 改接真實冷卻並 bump 版本。

---

## 6. 經濟與商店

### 6.1 個人帳本（整數，milli-gold）

```
startGold + Σ earned[source]  ==  unspentGold + spentGold
spentGold                     ==  Σ purchase.cost（含合成費與 starter 丟棄的沉沒成本）
unspentGold                   >=  0
teamEarned[side]              ==  Σ player.earned（itemsOn 時隊伍金錢改由個人加總得出）
```

- 帳本以整數 milli-gold 儲存，被動收入等小數在帳本層累加，**避免浮點漂移造成守恆 gate 假紅**。
- `snapshot.players[].gold` 維持「累計獲得」語意（與 legacy `p.gold` 相同，單調遞增），另外輸出 `goldUnspent`、`goldSpent`。

### 6.2 收入歸屬（itemsOn 時；數值沿用 legacy，不調整）

| 來源 | legacy 歸屬 | itemsV1 個人歸屬（草案） |
|---|---|---|
| 開局 | 隊伍 500 | **每人 500**（見 Q5） |
| 被動 | 隊伍 14／秒 | 每人 2.8／秒（= 14 ÷ 5，隊伍總量不變），`waveFirst` 後才開始 |
| 小兵 | 隊伍 20／隻 | 敵方英雄在 `XP.MINION_RADIUS` 內者均分；無人在場則流失 |
| 擊殺 | 擊殺者 300 | 擊殺者 300；助攻者均分 150（新增，見 Q5） |
| 塔 | 隊伍 250 | `XP.TOWER_RADIUS` 內攻方英雄均分；無人在場則全隊均分 |
| 龍／巴龍 | 隊伍 200／400 | 擊殺方存活成員均分 |
| 營地 | 隊伍＋在場個人 | 維持在場個人分成 |

均分餘數以**席位順序**（b1→b5、r1→r5）逐一分配 1 milli-gold，保證決定性與守恆。

### 6.3 購買時點（Shop Window）

- **只在三個事件開窗**：出生（開局 tick 0）、復活落地、回城抵達泉水。窗在事件當 tick 立即結算，不佔模擬時間。
- 走路撤退進泉水**預設不開窗**（見 Q3）。
- 死亡中不能買。沒有「隔空購買」。
- 結算順序：同 tick 多人開窗時依席位固定順序處理（買裝不互相影響，但固定順序讓事件序號決定性）。

### 6.4 購買交易（每次開窗）

```
loop:
  next = buildPolicy.nextStep(player, context)   // 純函式：下一個要買的東西（組件／合成／靴子／starter）
  if next == null: break
  cost = recipeCost(next, inventory)             // 差價
  if cost > unspent: break                       // 不夠就停，不跳買後面的東西
  if !slotAvailable(next, inventory): drop starter or break
  apply: unspent -= cost; spent += cost; inventory ← consume components, add next
  emit purchase event { t, seq, playerId, action: buy|combine|dropStarter, itemId, cost, unspentAfter }
recomputeCombatStats(player)
```

- **禁止**：錢夠就送、先給裝後扣錢、負債購買、跳過合成直接給成品、買 catalog 以外的 id、同 unique group 疊買。

### 6.5 Gold Conservation Verifier（M1 就要有）

- 每 tick 檢查 §6.1 四條等式（整數精確相等）。
- 每筆 purchase 事件的 `unspentAfter` 必須等於帳本重播結果。
- 終局：`Σ earned[source]` 對照各來源觸發次數（擊殺數 × 300 等）逐項核對。
- 以 60 seeds 全場跑，0 誤差才算通過。

---

## 7. AI 出裝

### 7.1 決策輸入（全部由凍結狀態計算，不讀畫面、不用 RNG）

| Profile | 定義（草案） |
|---|---|
| 自身定位 | `correctedArch(hero)`：坦克／戰士／刺客／法師／射手／輔助（出裝依英雄，不依席位） |
| 自身傷害 profile | 定位 → 物理／法術比例與攻擊／技能通道比例（見戰鬥屬性契約 §3） |
| 敵方 AD／AP | 敵方五人傷害 profile 加總的物理占比 `adShare`；`adShare ≥ 0.62` 為 AD 重、`≤ 0.45` 為 AP 重 |
| 敵方坦度 | 坦克定位人數 ＋ 已擁有 ≥2 件 G 家族完成裝的人數 |
| 敵方治療 | 技能文字命中治療類語彙（`heroClassification` 的輔助語彙）人數 ＋ 裝備吸血／全能吸血合計 ≥ 8% 的人數 |
| 敵方爆發威脅 | 刺客定位人數 ＋ 法師定位中擁有 ≥1 件 E 家族完成裝的人數 |
| 自身狀態 | 可用金錢、近 180 秒死亡數（沿用 `deathsT`）、個人 KD、隊伍金錢差 |
| 比賽階段 | 早（< 600s）、中（600–1200s）、晚（> 1200s） |
| Build Strategy | 賽前設定（§7.4） |

### 7.2 決策規則

1. **核心路線**：每個定位 3 件核心 ＋ 1 條替代 ＋ 1 雙靴子規則 ＋ 1 件 starter 規則。
2. **情境槽**：第 4 件（或核心被情境條件取代的那一格）依 profile 門檻選擇；條件以固定優先序比對（反治療 > 反爆發 > 反坦 > 反傷害類型）。
3. **鎖定（hysteresis）**：某一格一旦買下第一個組件，路線鎖定到該成品完成，不因局勢波動改道 ⇒ 不浪費錢、不抖動。
4. **靴子**：第二次開窗起才考慮升級；依 AD／AP 重與定位決定。
5. **晚期**：6 格滿後停止購買（v1 不出售、不替換）。
6. **平手**：同分以 catalog 固定順序（id 字典序）決定。
7. **可解釋**：每次決策輸出 `reasons`（例：`"enemyHeal:3 ≥ 2 → grievous"`），進 snapshot 與 Replay，沿用 `decisionReasons` 慣例。

六定位的完整路線表見 `MOBA_裝備矩陣_v1.md` §6。

### 7.3 狀態與階段調整（草案）

| 條件 | 調整 |
|---|---|
| 近 180 秒死亡 ≥ 2 | 下一件優先防禦類（戰士／刺客改走 D2 或對應抗性組件） |
| 隊伍金錢差 ≤ −3000 且中期 | 核心第 3 件以替代路線中較便宜者提前 |
| 晚期、KD ≥ 3 | 射手／法師提前奢侈裝（A1／E1） |
| 可用金錢不足任何下一步 | 直接結束開窗（不買無關小件，避免佔格） |

### 7.4 賽前 Build Strategy

- 玩家（經理）賽前**為每個席位**選一個預設：
  `standard`（標準）／`early`（前期壓制）／`scaling`（後期成型）／`counter`（反制優先）／`survival`（保命優先）。
- 預設只改變**權重與門檻**（例：`counter` 把治療門檻從 2 降到 1），不指定具體裝備 ⇒ AI 仍依局勢微調。
- 存放：比賽設定（與戰術同層）→ `configureItems({ strategies })`。
- Online／Challenge：客戶端**只送預設 id**，伺服器端與 runner 以 allowlist 驗證，不接受裝備清單或金錢值。

---

## 8. Replay／BattleResult／Challenge／Online

| 面向 | 設計 |
|---|---|
| snapshot | itemsOn 時每名英雄附加：`inv`（6 格 id 或 null）、`goldUnspent`、`goldSpent`、`cs`（緊湊屬性摘要）、`lastBuildReasons`；全域附加 `purchases`（最近 N 筆環形緩衝，帶遞增 `seq`） |
| MobaReplay.v1 | **附加 optional**：`itemMeta { catalogVersion, strategyByPlayer }`、`purchases: [[t, seatIdx, actionCode, itemIdx, cost, unspentAfter], …]`（依 `seq` 去重擷取）；frame 不存 inventory，播放端以 purchases 在時間 t 摺疊還原。容量約 250 筆 × 30 bytes ≈ 7.5KB，遠低於 experience26 §17 的 2MB 上限 |
| BattleResult.v2 | **附加 optional**：`items { catalogVersion, rulesVersion }`；`players[].build { final[6], boots, starterDropped, earned, spent, unspent, purchases, firstCompletedAt, completedCount }`。舊結果缺欄 ⇒ 消費端顯示「無裝備資料」，不造假 |
| Replay 決定性 | 以 purchases 摺疊出的最終裝備必須等於 BattleResult `build.final`；任一 frame 時間點摺疊結果必須等於當時 snapshot `inv` |
| Challenge | 新增 `SNAPSHOT_INPUTS.buildStrategy`；runner 呼叫 `configureItems`；語意檔案清單加入 §3 的 items 模組；上線即 bump **`moba-sim.v5`**（舊 v4 挑戰依 `canReplay` 明確拒絕，不靜默重算） |
| Online／Ranked | 伺服器權威：引擎在伺服器端跑、購買是引擎內決策；客戶端唯一輸入是 Build Strategy id。`FORBIDDEN_CLIENT_KEYS` 追加 `inventory`、`items`、`gold`、`purchases`、`combatStats`。未來若開放手動購買，指令需帶 tick 並由引擎在開窗時驗證 |

---

## 9. 平衡 Gates（本輪只定義，不改數值）

| # | Gate | 通過條件（草案） |
|---|---|---|
| 1 | Gold conservation | §6.1 四條等式每 tick 整數精確成立；60 seeds 0 誤差 |
| 2 | Inventory legality | ≤6 格、≤1 靴、≤1 starter、unique group 不疊、只含 catalog id、只在開窗事件購買、無負債 |
| 3 | Recipe legality | 合成只消耗身上真的有的組件；合成費 = 成品價 − 被消耗組件原價；組件不重複使用 |
| 4 | Deterministic build | 同 seed＋同設定跑兩次，purchases 雜湊相同；`buildPolicy` golden 表（profile → 決策）逐筆相同 |
| 5 | Legacy hash unchanged | 不呼叫 `configureItems`：regress 15 seeds 終局 snapshot 雜湊、rng／rng2／rng3 呼叫次數、snapshot key 集合與 `a7fba81` 基線逐位元相同；runtime29／stats28 等現役 verifier 不變 |
| 6 | Side bias | 同陣容交換陣營鏡像 200 seeds，藍方勝率 50 ± 4%；陣列順序公平性位移 ≤ 5pp |
| 7 | Match duration | 中位時長在 items 關閉基線 ±10% 內，且落在 regress2 既有區間；最長 ≤ 32 分；收得掉 ≥ 19/20 |
| 8 | Kill pacing | 10 分鐘擊殺 p50 ∈ [3, 10]、15 分鐘 p50 ∈ [7, 18]（S29B1 規格）；regress2 的 5 分鐘塔數與等級門檻不退 |
| 9 | Role power spike | 第一件完成裝時間 p50：射手／法師 9–13 分、戰士／刺客 8–12 分、坦克 10–14 分、輔助 12–17 分；鏡像陣容中任一定位勝率 45–55% |
| 10 | Item counter scenarios | 決定性對戰夾具：反治療使對方治療量下降 ≥ 30%；護甲堆疊使物理承傷下降、％穿透至少抵銷一半；魔抗對法術爆發同理；反暴擊對暴擊射手有效；**任一反制不得超過「2 倍時間差」的硬剋** |
| 11 | Economy pacing | 各定位每分鐘收入落在帶內；15 分鐘平均 ≥ 1 件完成裝、25 分鐘平均 3–5 件；開窗後仍持有 > 3000 未花金錢超過 90 秒的比例 ≤ 5% |
| 12 | Replay / Result consistency | purchases 摺疊結果 = snapshot `inv` = BattleResult `build.final` |
| 13 | Performance | itemsOn 的 tick 耗時增加 ≤ 10%（屬性快取；光環 O(10²)） |

---

## 10. 里程碑

| 里程碑 | 內容 | 驗收 |
|---|---|---|
| **M0**（本輪） | 設計契約、Catalog、CombatStatsV1、效果系統、經濟、AI、Replay、gates | Owner Review |
| M1 | 資料與純模組：catalog／recipes／economy／buildPolicy／combatStatsV1；離線模擬購買；不碰引擎 | gate 1–4、catalog 金錢效率帶、golden 表 |
| M2 | 引擎 adapter：`configureItems`、五個出口接點、v1.0 primitive、帳本與開窗；預設不啟用 | gate 5（legacy hash）、2、3、12、13 |
| M3 | AI 出裝＋平衡校準（只在 items 規則集內調整）＋ bump `moba-sim.v5` | gate 6–11 全綠 |
| M4 | 呈現：HUD 裝備欄、戰報購買、BattleResult／Replay、賽前 Build Strategy UI | 瀏覽器實測（桌機／390） |
| M5 | v1.1：20 件完成裝 ＋ BURN／RAMPING_RESIST／RAMPING_STAT／SUSTAIN_REGEN | 全部 gate 重跑 |

---

## 11. 架構風險

1. **LogicEngine 是受保護的 246KB 單檔**：接點分散在傷害（L2364）、結算（L2392）、扣血（L637）、回復（L2339）、
   移速（L3872）、出生／復活／回城、snapshot。每一處都必須以 `this.itemsOn` 短路，漏一處就破壞 legacy hash。
2. **tough 只有血量、沒有減傷**：護甲／魔抗是全新的乘法通道，TTK 必然改變 ⇒ items 規則集必須重新校準 `dmgK`，
   而節奏門檻（regress2）歷來非常脆弱。
3. **連續輸出模型**：暴擊、攻速、on-hit 只能是期望值。畫面上沒有真的暴擊跳字，玩家預期與數值可能落差。
4. **個人金錢歸屬改變隊伍金錢語意**：`winProb` 與 `BattleResult.gold` 依隊伍金錢差計算，items 規則集要重估 `winProb` 係數。
5. **模擬版本單向門**：bump `moba-sim.v5` 後所有 v4 挑戰不可重播（有 `canReplay` 明確拒絕）。
6. **英雄傷害類型不在資料裡**：由定位推導，混合型英雄會失真；`heroDatabase.js` 屬已知傳遞缺口（`KNOWN_TRANSITIVE_GAPS`）。
7. **Ability Haste 沒有真實冷卻消費者**（§5.5）。
8. **RNG 中立**：任何 primitive 不慎呼叫 rng 都會改變整場軌跡；需以呼叫次數計數器作為 gate。
9. **AI 浪費金錢或抖動**：以路線鎖定與固定優先序防範；gate 11 監測。
10. **Replay 容量**：purchases 必須緊湊，不得把 inventory 放進每一 frame。

---

## 12. 開放設計問題（需 Owner 決定）

| # | 問題 | 建議 |
|---|---|---|
| Q1 | 規格 88 件、v1.0 先上 68 件（完成裝 24）、v1.1 補 20 件，是否同意？ | 同意分批 |
| Q2 | 裝備總預算：滿裝射手／法師輸出約 ×1.8–2.0、坦克有效生命約 ×2.0；並允許**只在 items 規則集內**重新校準 `dmgK` 與收入？ | 同意，否則節奏必然失控 |
| Q3 | 走路撤退進泉水是否也開購買窗？ | 建議開（與回城抵達同效果），但這超出 Owner 原本列的三個時點，需明確批准 |
| Q4 | v1 不開放出售、starter 自動丟棄不退款，是否接受？ | 接受；出售留到有手動操作需求時 |
| Q5 | 個人金錢：開局每人 500、助攻分 150、小兵依距離歸屬、塔／龍分配方式；隊伍金錢改為個人加總 | 同意，並列入 M3 校準 |
| Q6 | v1 各定位是否要有基礎護甲／魔抗？ | 建議 v1 全部 0（legacy 對齊、穿透僅為情境價值），v1.1 再評估 |
| Q7 | Build Strategy 是每席位還是全隊一個？是否進 Challenge 凍結輸入？ | 每席位；進凍結輸入（隨 v5） |
| Q8 | 是否允許玩家手動覆寫購買？ | v1 不開放（經營模擬、伺服器權威較單純） |
| Q9 | REVIVE 與主動裝是否確認延後到 v1.2 以後？ | 確認延後 |
| Q10 | 裝備名稱與 icon 由誰定稿？ | 矩陣內為草案名稱，需美術／文案依 ESMO 風格定稿 |
| Q11 | Hero Progress 的 atk／armor／atkSpd 成長是否日後併入 CombatStatsV1？ | v1 維持 power／tough 基礎通道，不併入 |
| Q12 | 英雄傷害 profile 用定位推導，混合型英雄是否要逐隻覆寫表？ | v1 定位推導＋少量覆寫表（上限 15 隻） |
