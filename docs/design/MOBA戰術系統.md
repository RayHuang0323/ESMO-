# MOBA 戰術系統（Sprint24）

`src/platform/contracts/MobaTacticConfig.js` 的設計說明與映射表。
契約檔註解指向本文件；改契約或改引擎映射時，兩邊要一起更新。

## 這個 Sprint 解決的問題

Sprint 19–23 的戰術一直是 **Presentation 級**：TacticScreen 選了戰術，只傳到
Loading / HUD 顯示，不進 LogicEngine，對比賽沒有任何影響。

Sprint24 讓戰術**真的進引擎**，但守住一條紅線：

> 戰術只改「行為權重 / 傾向 / 時機 / 路線 / 風險」，
> **不加傷害、不加勝率、不加金錢係數、不寫死勝負。**

勝負仍由陣容 loadout、比分、經濟、地圖事件與 seed 決定。戰術改變的是「這五個人
怎麼打」，不是「這五個人打得贏」。

## 三層結構

```
TacticScreen（選卡）
      │  MobaTacticConfig.v1（正式契約，八張卡 m1–m8）
      ▼
useLocalServer.start({tactic})
      │  toEngineTactic() → 行為權重 knobs（純數值，無語意）
      ▼
LogicEngine.configureMatch({ blue, red, meta })
      │  引擎「不 import 契約」，只認 knobs 形狀 → 契約可獨立演化
      ▼
snapshot.tacticExec（引擎真實計數）→ BattleResult.tacticExecution → BattleEndScreen
```

**引擎不 import 契約**是刻意的：引擎只認得一組匿名數值旋鈕，契約層可以改欄位、
加卡片、換公式而不用動引擎。

## Balance 凍結保證

`LogicEngine` 的戰術層是**嚴格附加**：

- `constructor` 只多設 `this.tacticOn = false`。
- 不呼叫 `configureMatch()` ⇒ `tacticOn` 恆假 ⇒ 所有 S24 分支短路，
  走的是與 Sprint23 完全相同的程式碼路徑與**同一條 rng 序列**。
- 戰術層用獨立的 `rng2`（由 `seed ^ 0x9e3779b9` 派生），
  **不污染主 rng**——這是「未啟用時位元一致」的關鍵。
- `snapshot()` 只在 `tacticOn` 時才附加 `tacticMeta` / `tacticExec`
  ⇒ 舊消費者看到的快照形狀完全不變。

實測：20 seeds、每 20 tick 抓一次「全體選手座標 / HP / KDA + 全部塔血 + 雙方金錢」
指紋，與 Sprint23 基準**逐位元一致**。

## 契約 → 引擎 knobs 映射表

`toEngineTactic(t)` 的完整對照。中性值 = 舊版行為常數。

| knob | 公式 | 範圍 | 中性值（舊行為） | 引擎作用點 |
|---|---|---|---|---|
| `joinFight` | `0.6 + (grouping − 0.5) × 0.3` | 0.35–0.85 | **0.6** | 非龍/巴龍熱點的團戰參與擲骰 |
| `dragonJoin` | `0.45 + dragonPriority × 0.4` | 0.35–0.88 | 0.6 | 熱點 = 小龍坑時的參戰率 |
| `baronJoin` | `0.45 + baronPriority × 0.4` | 0.35–0.88 | 0.6 | 熱點 = 巴龍坑時的參戰率 |
| `retreatAt` | `0.25 − (riskTolerance − 0.5) × 0.12` | 0.15–0.34 | **0.25** | 撤退血量門檻（回血 60% 才回場的遲滯不變） |
| `laneOffset` | `LANE_OFF[lanePlan] + (aggression−0.5)×0.04 + (towerPriority−0.5)×0.03` | ±0.09 | **0** | 推線深度偏移（加在原 base 公式上） |
| `splitLane` / `splitPush` | `lanePlan` 有 `split` 的那一路 / `macro.splitPush` | 0–1 | null / 0 | 熱點出現時該路仍留線帶線（6 秒黏性重評） |
| `gankInterval` | `tempo` → fast 32 / standard 45 / slow 58 | 秒 | 45 | 打野 Gank 週期 |
| `gankWeights` | `aggressive` 路 +0.7；`jungle:farm` 全路 ×0.4 | 相對權重 | 1/1/1 | Gank 挑路擲骰 |
| `invadeChance` | `jungle:invade` ⇒ `max(0.7, invadePriority)`，否則 `invadePriority` | 0–1 | **0** | 開局前 50 秒野區入侵 |
| `invadeWithMid` | `tempo=fast && invadePriority ≥ 0.3` | bool | false | 中路是否跟進入侵 |
| `roamRate` | `economy.supportRoamRate` | 0–1 | **0** | 輔助週期性遊走中路 |

粗體 = 與舊版常數相同，代表「中性戰術 ≈ 舊行為」。

## 誠實邊界：保留但未映射的欄位

引擎沒有對應系統的欄位，**保留在契約裡但不進 knobs**，只用於適性計算與展示。
不假裝有效果、也不編造統計：

| 欄位 | 為何未映射 |
|---|---|
| `objectives.heraldPriority` | 引擎無「預示者」這個目標 |
| `economy.carryPriority` / `jungleResourceShare` | 引擎無金流分配機制（擊殺金全歸擊殺者 + 團隊金） |
| `vision.*`（river / enemyJungle / objectiveSetup） | 引擎無視野系統（戰爭迷霧是呈現層） |

## 執行統計（tacticExecution）

引擎**真實計數**，不是事後估算：

`invadeAttempts` `invadeKills` `topGanks` `midGanks` `botGanks` `gankKills`
`dragonContests` `baronContests` `groupedFights` `splitPushActions` `towerPushes` `supportRoams`

節流規則（避免逐 tick 灌水）：推塔波次同隊 10 秒一次；分推波次 8 秒一次；
會戰以「該隊 ≥3 人同時處於團戰狀態」的上升緣計一次；龍/巴龍以「該隊有人進入
9 距離內」在該目標存活期間計一次。

賽後 `BattleEndScreen` 用每張卡的 `evidence`（觀察指標 + 參考目標）顯示
**執行度 = 達標數 / 指標數**，並明確標示「**非勝負**」——
戰術執行成功不等於贏，這是刻意的產品語意。

## 對手戰術

目前**沒有可靠的對手戰術來源**，因此紅方固定 `STANDARD_OPP_TACTIC`
（全欄位中性 0.5，等於舊行為）。不虛構對手 AI。
未來若接上對手戰術系統，換掉這一份即可，引擎與契約都不用動。

## 驗證

`node tools/check_moba_tactic24.mjs` — 27 項，涵蓋：

- **契約**：八卡齊全、id 唯一、全數通過 `validateMobaTacticConfig`、
  Legacy m1–m8 名稱逐字、knobs 欄位白名單（確保沒有偷渡傷害/勝率係數）。
- **接線**：TacticScreen 讀契約、GameView `start({tactic})`、
  useLocalServer → `configureMatch`。
- **引擎行為**：同 seed 同戰術可重現；同 seed 異戰術（m7 vs m8）執行統計顯著不同；
  m7 真的入侵、m8 幾乎不入侵；m2 真的分推；m4 小龍參戰 ≥ m1；m6 Gank > m4；
  m3/m8 跨 16 seeds 勝負皆有出現（**證明沒寫死 winner**）。
- **向下相容**：無戰術 ⇒ snapshot 無 tactic 欄位、BattleResult.tactic = null、
  BattleResult.v2 結構未變。
- **CS 隔離**：CS 畫面/引擎零 MOBA 戰術引用。

另有 Balance 凍結實測（20 seeds 逐 tick 指紋位元一致），見上節。
