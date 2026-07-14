# MOBA 戰術播報系統（Sprint 29A · F）

> 規則式（**不接生成式 API**）的隊伍溝通播報。每一則訊息都能指回一個
> **真實引擎事實**；有冷卻、有優先級、決定性（同 seed ⇒ 同一串播報）。

實作：`src/battle/moba/tacticalComms.js`（純函式 + 顯式狀態，可 Node 驗證）
接線：`battleStore.ingest` → `CommsEngine.update(snap, newEvents)` → `battleStore.comms`

---

## 1. 紅線

- **不接生成式 API**（無 fetch / 無 LLM；驗證第 15 項靜態掃描）。
- **不用亂數挑句子**（無 `Math.random`）⇒ 同 seed 必得同一串播報。
- **只由真實事件觸發**——每則訊息都帶 `evidence`（觸發它的引擎事實），
  不存在「隨機找句子講」的路徑（S29 §11：不得讓對話使用不存在的事件）。
- **不洗版**：同 ruleId 有各自 cooldown，另有全域最小間隔 6 模擬秒。

## 2. 訊息與資料流

```
LogicEngine snapshot ─┐
                      ├─→ CommsEngine.update() ─→ { id, t, ruleId, side, speakerId,
BattleEventTracker ───┘                             speaker, text, priority, evidence }
                                                          │
                        battleStore.comms ←───────────────┤（與 events/log **分開存**
                                                          │  ⇒ BattleResult.timeline 不變）
                        BattleTimeline（💬 對話樣式）←────┤
                        replayBuffer.finalizeReplay ←─────┘（原封存入，Replay 不重新生成）
```

**同一 tick 只播「優先級最高」的一則**（不洗版）。

## 3. 觸發條件（全部是引擎的真實狀態，不是猜的）

| ruleId | 優先 | 冷卻 | 真實觸發來源 |
|---|---|---|---|
| `OBJECTIVE_TAKEN` | 90 | 10s | `DRAGON_SLAIN` / `BARON_SLAIN` 事件 |
| `RETREAT` | 85 | 15s | ≥2 名我方 `state === "撤退"` |
| `GANK_INCOMING` | 80 | 18s | 打野 `state` 轉為 `"抓人"`（S24 Gank 窗） |
| `COUNTER_GANK` | 78 | 25s | 敵方打野在我方英雄 12 單位內 |
| `TOWER_DOWN` | 75 | 10s | `TOWER_DESTROYED` 事件（我方拆的） |
| `TEAMFIGHT` | 72 | 20s | ≥3 名我方 `state === "團戰!"` |
| `INVADE` | 70 | 40s | 打野 `state` 轉為 `"入侵"`（S24 開局入侵） |
| `DEFEND_BEHIND` | 68 | 30s | 經濟差 > 4000（`bGold`/`rGold` 真實值） |
| `KILL_SUCCESS` | 65 | 8s | `snapshot.feed` 新增我方擊殺 |
| `TRADE` | 62 | 20s | 同一幀我方既有擊殺也有陣亡 |
| `OBJECTIVE_SOON` | 60 | 35s | `dragon/baron.respawn ≤ 30`（引擎真實倒數） |
| `ENEMY_MISSING` | 55 | 25s | ≥2 名敵方不在我方任何英雄 20 單位內 |
| `TOWER_PUSH` | 45 | 30s | ≥3 名我方在推進狀態且 t > 300 |
| `SPLIT_PUSH` | 40 | 35s | 有我方 `state === "帶線"`（S24 分推） |

## 4. 誰在講、講什麼

- **是否觸發** → 只看上表的真實狀態。
- **誰講 / 講哪句變體** → 看 `role`（定位）與 `personality`（個性，來自 roster）。
  例：`RETREAT` 在 `steady` 個性是「先退，等下一波」，在 `aggressive` 是「可惡…先退一下」。
- **個性/定位不會憑空生出事件**——它只挑語氣。

## 5. Timeline 的三種列

| 類型 | 樣式 | 來源 |
|---|---|---|
| 系統事件（塔破/龍/巴龍/ACE） | 原 `Row` | `battleStore.events` |
| 擊殺 | 原 `Row`（含擊殺者/受害者） | `battleStore.events` |
| **隊伍溝通** | `CommsRow`（💬 + 說話者 +「引號」+ 斜體） | `battleStore.comms` |

三者在 Timeline 合併按時間排序，但**視覺上明確可區分**（S29 §八要求）。

## 6. Replay

`finalizeReplay({ comms })` 把**本場實際產生的原始訊息**原封存入 `replay.comms`。
`MobaReplayScreen` 只讀這份 —— **不 import CommsEngine、不重新生成對話**
（驗證第 14、18 項靜態掃描）。

## 7. 實測（seed 4242、戰術 m1、完整一場）

- 產生訊息數與密度、全域最小間隔、cooldown 違規數：見
  `node tools/check_moba_runtime29.mjs` 的第 15–18 項與結尾統計。
- 決定性：同 seed 跑兩次，`[t, ruleId, text]` 串**逐位元相同**。

## 8. 已知限制

- **只播我方（藍隊）**：紅方是 AI，沒有 roster/個性來源，不虛構。
- 句庫是手寫的固定變體（每個 ruleId 3 句左右），長局會重複。擴充句庫即可，
  不需要改任何觸發邏輯。
- `nearestLane()` 用固定錨點判斷「最接近哪一路」，是幾何近似（不是引擎的 lane 欄位，
  因為遊走/Gank 時 `p.lane` 不代表當下位置）。
