# MOBA 選手能力注入（Sprint 28）

> 一句話：**選手的 16 項能力（含天賦）現在真的會改變 MOBA 引擎的行為**——
> 但只透過「行為傾向 / 決策門檻 / 節奏 / 路線」，**沒有任何傷害、勝率、金錢係數**。

關聯文件：`選手天賦與能力成長系統.md`（天賦樹本身）、`MOBA戰術系統.md`（S24 戰術層，
本層的同構前例）、`Phase11_MOBA戰力公式設計.md`（power/tough 公式，**刻意未採用**，見 §6）。

---

## 1. Sprint 28 之前的實況（Audit）

| 問題 | 實況 |
|---|---|
| MOBA 引擎有讀 16 項能力嗎？ | **完全沒有。** |
| 那它用什麼？ | `LogicEngine` constructor 兩個寫死陣列：`power = [30,34,36,42,18]`、`tough = [1.6,1.15,0.9,0.8,1.25]`（依 `ROLES` 索引），外加 Hero Progress 的 `loadout` 倍率。**與選手是誰無關。** |
| S27 的 `mobaRosterAdapter` 呢？ | 只被 `src/App.jsx`（Legacy 沙盒，`main.jsx` 明確不掛載）import。`applyRosterToEngine` 是能力偵測，永遠回 `applied:false`。**主幹是死碼。** |
| 所以 S27 的 MOBA 天賦？ | 只影響 UI 與戰術適性（`tacticFit`）。**對戰輸出零影響**——S27 自己也把這列為技術債 #1。 |

Sprint 28 關掉這個缺口。

## 2. 資料流（唯一計算點）

```
PlayerTalentScreen 購買天賦
   → profileStore.players[].talents          （持久化，base stats 永不被寫）
   → getPlayerDerivedStats(player)           （base + 天賦 → clamp 1–99）
   → mobaRosterAdapter.buildPlayerStatSlots  （依 playerId 對位；依席位順序輸出）
   → mobaPlayerStats.toEnginePlayerMods      （16 能力 → 10 個行為偏移量）
   → useLocalServer.start()                  （★ 唯一計算點）
   → engine.configurePlayers(mods)           （★ 必須在 configureMatch 之前）
   → LogicEngine tick：門檻/機率/節奏平移
   → snapshot.playerStatsExec                （個人行為真實計數）
   → BattleResult.v2 → Replay / Result / Progress
```

**對位靠 `playerId`**：`profileStore.players` 的 id（`b1`–`b5`，由 `data/players.js`
自 `ROSTER` 鍵派生）＝ `LogicEngine` 的 `player.id`（`gameData.ROLES` 順序）＝
`mobaProgressAdapter` 發 XP 用的 id。同一組 id 貫穿三邊。
**不用名字、不用陣列索引**：打亂 `profileStore` 順序或改名，輸出逐鍵不變（verifier 第 5 項）。

不得違反的邊界：TacticScreen 不算一份、Battle 不再算一份；不讀 Legacy 靜態 `ROSTER` 的能力。

## 3. 16 項能力映射表

中性值 **70**（＝ `mobaRosterAdapter` 的 `ANCHOR`）。正規化 `u = clamp((v−70)/30, −1, +1)`
⇒ 70 分 = `u=0` = **零偏移**。每個作用點都有限幅（`MOD_CLAMP` / `SCALE_CLAMP`）。

| 能力 | 作用點（權重） | 語意 |
|---|---|---|
| reflex 反應 | joinAdj +.03、returnAdj −.04 | 接戰反應、更快回場 |
| accuracy 精準 | **未映射**（見 §5） | — |
| apm 操作速度 | laneAdj +.015、gankIntervalScale −.08、roamAdj +.06 | 行動頻率 |
| positioning 走位 | retreatAdj +.04、returnAdj +.03、laneAdj −.02 | 安全距離、早撤 |
| mapAware 視野 | objAdj +.05、gankIntervalScale −.12、gankWindowScale +.10、roamAdj +.10、invadeAdj +.06 | Gank／入侵／目標偵測 |
| tacticalIQ 戰術 | joinAdj +.04、objAdj +.05、gankWindowScale +.05 | 目標與團戰決策 |
| decision 決策 | retreatAdj +.03、laneAdj −.01、gankIntervalScale −.06、splitAdj +.06 | 風險選擇、換資源 |
| adaptability 應變 | returnAdj −.03、splitAdj +.08 | 局勢變化時調整 |
| courage 勇氣 | joinAdj +.05、retreatAdj −.05、laneAdj +.02、splitAdj +.05、invadeAdj +.08 | 主動接戰與進攻 |
| clutch 抗壓 | retreatAdj −.04、laneAdj +.01 | 低血量下續戰 |
| focus 專注 | retreatAdj +.02、objAdj +.04、splitAdj +.04 | 目標執行穩定度 |
| resilience 韌性 | retreatAdj −.02、returnAdj −.05 | 劣勢/死亡後恢復 |
| comms 溝通 | joinAdj +.03、objAdj +.03、roamAdj +.08 | 協同 Gank／集結 |
| leadership 領導 | roamAdj +.05、**＋隊伍層級**：全隊 joinAdj +.02×ū、objAdj +.04×ū | 隊伍決策一致性 |
| synergy 配合 | joinAdj +.04 | 團戰參與與支援 |
| learning 學習 | **未映射**（見 §5） | — |

**隊伍層級項（leadership）**：取該側 leadership 平均的 `u`，加到**全隊每個人**的
`joinAdj` / `objAdj`。這是 Support（IGL，led 最高）能影響整隊、而非只影響自己的機制。

### 9 個引擎作用點（能力唯一能碰的東西）

| 作用點 | 引擎原值 | 限幅 |
|---|---|---|
| `retreatAdj` | 撤退門檻 0.25（或戰術 `retreatAt`） | ±0.10，最終 clamp [0.10, 0.45] |
| `returnAdj` | 重返戰場門檻 0.60 | ±0.10，最終 clamp [0.45, 0.80] |
| `joinAdj` | 團戰參與率 0.60（或戰術 `joinFight`） | ±0.15，最終 clamp [0.05, 0.98] |
| `objAdj` | 龍/巴龍集結率 0.60（或戰術 `dragonJoin`/`baronJoin`） | ±0.15，同上 |
| `laneAdj` | 推線深度偏移 0 | ±0.04 |
| `gankIntervalScale` | 打野 Gank 週期（戰術 `gankInterval`） | ×[0.75, 1.25] |
| `gankWindowScale` | 打野 Gank 停留窗 9 秒 | ×[0.85, 1.15] |
| `roamAdj` | 輔助遊走率（戰術 `roamRate`） | ±0.20，clamp [0,1] |
| `splitAdj` | 分推承諾度（戰術 `splitPush`） | ±0.15，clamp [0,1] |
| `invadeAdj` | 開局入侵率（戰術 `invadeChance`，只讀該側**打野**） | ±0.12，clamp [0,1] |

## 4. 紅線：能力**不能**碰什麼

`power` / `tough` / `maxHp` / `winner` / gold / XP / reward **完全不受能力影響**
（verifier 第 12、13 項逐項驗證：A 與「全隊滿天賦」的 `p.power`、`p.tough`、`p.maxHp` 逐值相同）。

`mobaPlayerStats.js` 的輸出**只有 10 個行為鍵**，沒有 `damageMultiplier` / `winRate` /
`goldMultiplier` 之類欄位（靜態掃描 + 鍵集合驗證）。

## 5. 未映射能力（誠實揭露，不虛構作用點）

- **accuracy（精準度）**：引擎唯一「精準」的表面是**傷害**（`dmgAmt = p.power * dt * 0.92`
  與塔傷 `40*dt`）。注入它就是 damage multiplier ＝ 違反紅線。**寧可不映射，也不假裝有效。**
- **learning（學習力）**：引擎沒有跨場成長迴圈可掛。

兩者在 **CS 引擎（fpsRoster）與戰術適性仍完整生效**——只是 MOBA 引擎目前沒有可靠作用點。
要讓它們在 MOBA 生效，需要引擎有「小規模交戰命中/失誤模型」（Sprint 29 候選，見 §8）。

## 6. 為什麼**不**用 Phase 13 的 `calcMobaPower`

`mobaRosterAdapter.calcMobaPower / calcMobaTough`（Phase 11 設計、Phase 12 驗證）會把
選手實力換算成 `power` / `tough`。**Sprint 28 刻意不採用它**：引擎的 `p.power` 直接乘進
傷害式，注入即等同 damage multiplier，違反本 Sprint §2 紅線。該公式保留供展示與未來使用，
但**不進引擎**。這是自覺取捨，不是遺漏。

## 7. Baseline 保證（三重）

1. **feature flag**：不呼叫 `configurePlayers` ⇒ `playerStatsOn = false` ⇒ 所有新分支短路，
   snapshot 也不含 `playerStatsMeta` / `playerStatsExec`（舊消費者零影響）。
2. **中性值**：全 70 分 ⇒ mods 全 0 / 倍率 1 ⇒ 公式加 0、乘 1 ⇒ **逐位元**回到 baseline
   （verifier 第 9 項：6 個 seed × 含/不含戰術，snapshot 逐位元相同）。
3. **不動 rng**：能力層**不新增任何 rng 抽樣**，只平移既有抽樣要比對的**門檻**。
   `rng`（主）與 `rng2`（戰術）序列完全不變——這比 S24 的「獨立 rng2 流」更嚴格。

## 8. 已知平衡風險（實測，不是猜測）

160 seeds、同戰術（m1 速推流）、同 roster、只改天賦，藍方勝率（±1σ ≈ 3.9pp）：

| 變體 | 藍勝率 | 解讀 |
|---|---|---|
| OFF（無能力層） | 48% | S27 baseline |
| A 無天賦（能力層開） | 49% | **開啟能力層不送勝率**（+1pp，噪音內）——映射確實置中 |
| B 操作天賦（b3） | 47% | 噪音內 |
| C 戰術天賦（b3） | 53% | +4pp |
| F 心理天賦（b3） | 50% | 噪音內 |
| **D 團隊天賦（b3）** | **44%** | **−5pp，兩次取樣都是負的** ⚠ |
| G b3 十二節點全滿 | 59% | +10pp，天賦投資確實有回報 |
| E 全隊全滿 | 54% | +5pp |

**風險 D**：團隊天賦（comms/synergy/leadership）讓全隊**更常參與團戰**，但這個引擎的勝負來自
**主堡血量**，而主堡靠**兵線與推塔**破——「打團打得多」在此引擎不必然轉化為勝利。
這是**引擎的平衡屬性**，不是注入層的 bug。

**刻意不處理**：把權重調到讓 D 變正 = 對著勝率調參，那正是本 Sprint 禁止的事情的變體。
正解是 Sprint 29 讓團戰勝利真的轉化為推進收益（見下），而不是偷偷加係數。

其他風險：紅方（AI 對手）**無 profileStore 選手 ⇒ 全隊中性**，是天然對照組，但也意味著
藍方能力平均高於 70 分時會取得**行為面**優勢。要對稱，需要 AI 對手也有選手能力
（＝ AI Teams，本 Sprint 明令禁止開始）。

## 9. Sprint 29 候選

1. **團戰收益轉化**：團戰勝利 → 目標（龍/巴龍/塔）→ 經濟 → 推進，讓「集結」類能力有正回報
   （修 §8 風險 D 的根因）。
2. **交戰命中/失誤模型**：讓 accuracy / focus 有非傷害的作用點（命中率、技能失誤），
   才能誠實映射 accuracy（§5）。
3. **AI 對手選手能力**（AI Teams）：紅方不再永遠中性。
4. **先發配置 → 引擎席位**：目前引擎席位固定 `b1`–`b5`，招募的新秀（id = `r`+timestamp）
   無法上場注入。
