# MOBA 裝備 UI 資料契約 v1（M2 準備、M3 消費）

> 狀態：M2 定稿（引擎輸出與 view-model 已實作並有驗證器）。M3 Item UI／UX 只能讀本契約，不得另開資料管道。
> 相關：`docs/design/MOBA_裝備系統_v1.md`（規則）、`docs/architecture/MOBA_戰鬥屬性契約_v1.md`（戰鬥屬性）。

## 1. 資料流（唯一一條）

```
roster ──toEngineItems()──▶ engine.configureItems(cfg)        （opt-in；不呼叫 ⇒ legacy 逐位元不變）
                               │
engine.tick() ── ItemsEngineRuntime（帳本／背包／AI 出裝／戰鬥效果）
                               │
engine.snapshot().items   ◀── MobaItemsSnapshot.v1（本文件 §3）
                               │
itemsViewModel.select*()  ──▶ M3 UI（HUD／Shop／Build／賽後）
```

| 層 | 檔案 | 規則 |
|---|---|---|
| Adapter | `src/battle/moba/items/itemsEngineAdapter.js` | roster → `{ players: { [seat]: { heroId, arch, healer, strategy } }, meta }`；引擎不認得 heroId |
| Runtime | `src/battle/moba/items/itemsEngineRuntime.js` | 只在 `engine.itemsOn` 時執行；決定性、無亂數、無時間 |
| Snapshot | `LogicEngine.snapshot()` 的 `items` key | 未 `configureItems` ⇒ **key 不存在**（不是 null） |
| View-model | `src/battle/moba/items/itemsViewModel.js` | 純函式；UI 不得自己重算金錢、合成差價、出裝決策 |

⚠ UI 必須以「`snapshot.items` 是否存在」判斷本場有沒有裝備系統。不存在 ⇒ 整塊不顯示，**不得造假**（不得顯示 0 金或空格子）。

## 2. M3 需求 → 欄位對照

| M3 需要 | Snapshot 來源 | View-model 出口 |
|---|---|---|
| 玩家金錢 | `players[id].gold.{start,earned,spent,unspent}` | `selectPlayerItemsView().gold` |
| 6 格背包 | `players[id].inventory`（長度恆為 6，空格 `null`） | `.slots[]`（含 `index`、名稱、tier、family、價格） |
| 目前裝備 | 同上 | `.currentItems[]` |
| 下一件計畫裝備 | `players[id].plan.targetId`、`targetRemainingCost` | `.nextItem`（含 `remainingCost`、`affordable`、`recipe`） |
| 出裝策略 | `players[id].strategy` | `.strategy`、`.strategyLabel` |
| AI 決策理由 | `players[id].reasons[]`（機器碼） | `.decision.reasons[]`、`.decision.text[]`（中文） |
| 購買事件 | `purchases[]`（全場最近 40 筆，含 `seq`） | `selectPurchaseFeed()`、`.purchases[]` |
| 合成路線／出裝路徑 | `players[id].plan.buildPath[]` | `.buildPath[]`（`owned`、`isNext`）、`recipeTree()` |
| CombatStats 摘要 | `players[id].stats`（`CombatStatsV1` 取整） | `.stats` |
| 戰鬥狀態（加值） | `players[id].status`（重傷／緩速／法傷護盾／光環） | `.status` |
| 全隊摘要（加值） | — | `selectTeamItemsSummary(snapshot, side)` |

## 3. `MobaItemsSnapshot.v1`

```js
snapshot.items = {
  schema: "MobaItemsSnapshot.v1",
  runtimeVersion: "moba-items.runtime.v1",
  catalogVersion: "moba-items.catalog.v1",
  policyVersion: "moba-build-policy.v1",
  batch: "1.0",
  lastSeq: 110,                       // 最後一筆購買事件的 seq（沒有任何事件 ⇒ -1）
  purchases: [PurchaseEvent],         // 全場最近 40 筆，舊 → 新
  counters: { purchases, rejected, hits, mitigatedHits, lifestealHeal, omnivampHeal,
              grievousApplied, slowsApplied, lowHpShields, allyShields,
              magicShieldAbsorbed, auraActive },   // 驗證與 DEV Inspector 用；正式 UI 不讀
  players: { b1: PlayerItems, …, r5: PlayerItems },  // 固定席位順序 b1→b5、r1→r5
}
```

### 3.1 `PlayerItems`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `side` | `"blue"｜"red"` | |
| `seatRole` | `"top"｜"jungle"｜"mid"｜"adc"｜"sup"` | 限定席位的起始裝依此判斷 |
| `arch` | 六種定位之一 | 英雄定位；缺資料 ⇒ 依席位 fallback |
| `archSource` | `"hero"｜"seatFallback"` | fallback 時 UI 可提示「定位推定」 |
| `heroId` | `string｜null` | |
| `strategy` | `standard｜early｜scaling｜counter｜survival` | |
| `gold.start` | int | 起始金（500） |
| `gold.earned` | int | 累計收入（不含起始金） |
| `gold.spent` | int | 累計花費 |
| `gold.unspent` | int | 可用金錢；恆等式 `start + earned = spent + unspent`（帳本為 milli-gold 整數，顯示值向下取整） |
| `inventory` | `(itemId｜null)[6]` | 格位順序即背包順序 |
| `plan` | `object｜null` | 尚未開過任何購買窗 ⇒ `null` |
| `plan.targetId` | `itemId｜null` | 下一個目標；`null` 且 `complete` ⇒ 出裝完成 |
| `plan.targetRemainingCost` | `int｜null` | 以目前背包計算的補差價（已持有組件會折抵） |
| `plan.lockedTargetId` | `itemId｜null` | 已開始合成、下次開窗會繼續的目標 |
| `plan.buildPath` | `itemId[]` | 本場依敵方組成算出的完整路徑（含 starter、鞋、核心、情境） |
| `plan.complete` | bool | |
| `reasons` | `string[]` | 最近一次購買窗的決策理由（機器碼，見 §5） |
| `lastWindow` | `{ kind, t }｜null` | 最近一次購買窗；`kind ∈ spawn｜respawn｜recallArrive｜fountain` |
| `stats` | object | `CombatStatsV1` 取整：`hp ad ap armor mr attackSpeed critChance critDamage abilityHaste moveSpeed armorPenFlat armorPenPct magicPenFlat magicPenPct lifesteal omnivamp healShieldPower`，`effects` 為效果 type 陣列 |
| `status.grievous` | 秒 | 身上重傷剩餘秒數（0 ⇒ 無） |
| `status.slow` | 秒 | 裝備緩速剩餘秒數 |
| `status.magicShield` | int | 只擋法傷的護盾剩餘量 |
| `status.aura` | `{ armor, mr, moveSpeed }` | 本 tick 受到的友方光環 |

⚠ 一般護盾（召喚師屏障與裝備低血護盾共用）沿用既有 `players[].statusEffects` 的 `shield`；itemsOn 時即使沒有召喚師技能層也會出現。

### 3.2 `PurchaseEvent`

| 欄位 | 說明 |
|---|---|
| `seq` | 全場遞增序號（UI 以它去重／做「新購買」動畫；跨 snapshot 穩定） |
| `t` | 模擬秒（一位小數） |
| `playerId` | 席位 |
| `window` | `spawn｜respawn｜recallArrive｜fountain` |
| `action` | `buy`（直接買）／`combine`（消耗組件合成）／`dropStarter`（第 7 件擠掉起始裝，不退款） |
| `itemId` | |
| `cost` | 實付（合成時是補差價） |
| `consumed` | 被消耗的組件 itemId 陣列 |
| `unspentAfter` | 交易後可用金錢 |
| `targetId` | 這一步是為了哪個目標買的 |

## 4. View-model 形狀（`selectPlayerItemsView(snapshot, playerId)`）

```js
{
  version: "moba-items.view.v1",
  playerId, side, arch, strategy, strategyLabel,
  gold: { start, earned, spent, unspent },
  slots: [{ index, itemId, name, tier, family, familyLabel, price } | { index, itemId: null }] ×6,
  currentItems: [ …非空格 ],
  nextItem: { itemId, name, tier, family, familyLabel, price, remainingCost, affordable,
              recipe: RecipeNode } | null,
  buildPath: [{ itemId, name, tier, family, familyLabel, price, owned, isNext }],
  buildComplete: bool,
  decision: { reasons: string[], text: string[], lastWindow: { kind, t, label } | null },
  purchases: [PurchaseEvent + { name, actionLabel, windowLabel, consumedNames }]（本人，新 → 舊，預設 8 筆）,
  stats: { …PlayerItems.stats },
  status: { …PlayerItems.status },
}
RecipeNode = { itemId, name, tier, family, familyLabel, price, owned, components: RecipeNode[] }
```

- `recipe` 的 `owned` 以**格位消耗**計算（同名組件只算一次），與實際扣款規則 `itemRecipes.purchaseCost` 一致。
- 沒有 `snapshot.items` 或查無席位 ⇒ 回 `null`。

## 5. 決策理由碼（`reasons`）

| 碼 | 中文（`reasonText`） |
|---|---|
| `arch:<定位>` | 定位：… |
| `strategy:<id>` | 策略：… |
| `adShare:<0–1>` | 敵方物理占比 N% |
| `enemyHeal:<n>>=<門檻>` 等 | 敵方治療／爆發／坦克人數與門檻 |
| `counter` `survival` `scaling` | 策略把情境裝／保命裝／奢侈裝提前 |
| `lock:<itemId>` | 繼續合成：… |
| `insufficient:<itemId>` | 存錢中：… |
| `complete` | 出裝已完成 |
| `deathsRecent:<n>→lifeline` | 近期陣亡 n 次 ⇒ 優先保命裝 |
| `behindGold→cheapestCore` | 經濟落後 ⇒ 先補最便宜的核心裝 |
| `lateKd:<kd>→luxury` | 後期表現佳 ⇒ 優先奢侈裝 |
| `skip:<itemId>:<reason>` | 略過 … |
| `rejected:<reason>` | 購買被拒（正常情況不應出現；驗證器要求 0） |

未知碼 ⇒ `reasonText` 原樣回傳，不猜。

## 6. 更新頻率與成本

- 每次 `snapshot()` 都帶 `items`（10 人 × 約 30 欄 ＋ 最多 40 筆事件）。M3 若在意 Replay 容量，Replay 只收 `purchases`（以 `seq` 去重），其餘欄位可由購買事件重建——這是 M3 的取捨，M2 不先做。
- 購買只在四種窗發生，背包與屬性在窗與窗之間不變；UI 可用 `lastSeq` 判斷是否需要重算。

## 7. 不在本契約（M3 以後）

- 玩家手動購買／出售、快捷購買、推薦出裝覆寫。
- Replay／BattleResult 的正式欄位（M0 設計 §8 已定為選填欄位，接入時另訂版本）。
- 正式 UI 的圖示、配色、動畫。M2 只有 DEV Item Inspector（`?debug=items`，只在開發模式存在）。
