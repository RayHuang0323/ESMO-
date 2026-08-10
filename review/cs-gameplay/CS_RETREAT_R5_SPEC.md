# CS Retreat Instrumentation R5 — 封版規格與嚴格審查

日期：2026-08-10
狀態：**Reviewed / Go**
Calibration：**No-Go**

## 1. 目的

R3 確認 `apm/positioning/courage/clutch` 都會進 `aggr()`；現行 retreat branch 在玩家
殘血、敵人接近、隊友仍存活時，以 `aggr(p) < 0.82` 決定是否後撤。R5 只建立：

```text
retreat player-tick opportunity
  → aggr threshold trigger
  → actual displacement
  → round-level retreat episode
  → recontact
  → fire re-engage
  → survive / round result
```

不判斷退得多是好或壞，不以 retreat 次數代替生存/勝負，也不修改 threshold、公式或 AI。

## 2. 硬邊界

允許：

- 新增 `tools/check_cs_retreat_instrumentation_r5.mjs`；
- `tools/verify.mjs` 只新增 `cs_retreat_r5` segment；
- 新增 review 報告並更新必要 handoff。

禁止：

- 修改 `EsportsFPS3D.jsx`、CS23、R1–R4 verifier；
- 修改 gameplay/result/contract/Store/UI/roster adapter；
- 新增 dependency、helper、正式 export 或第二套 `simulateFps`；
- 新增 RNG、改 RNG 消耗順序或 gameplay branch；
- 修改 `aggr` 權重、`0.82`、HP/distance/mates gates、位移 3.2、武器/地圖/戰術；
- calibration、stat treatment、p-value、換/加 seed、自動 rebaseline。

正式 FPS source SHA-256：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 3. KPI 定義與遞增條件

### 3.1 `retreat_opportunity`

層級是 **player-tick**。在既有 player movement loop，以下結構條件全成立時每 2 秒最多一筆：

- nearest alive enemy 存在且距離 `< 32`；
- 非 buy phase；
- player HP `< 48`；
- 同 side tick-start alive count `> 1`。

沒有額外 throttle；理論上限是該玩家每回合 gameplay ticks。它是 threshold exposure，
不是「撤退次數」或 gameplay outcome。

Event 旁路讀一次 collector-only `aggr(p)`，記錄數值、threshold 與 gatePassed。正式 branch
仍保留原本自己的 `aggr(p) < 0.82` 判斷，不改寫條件。

### 3.2 `retreat_trigger` / `retreat_displacement`

原 branch 真正通過時各記一筆：

- trigger：player、enemy、HP、mates、aggr、from position；
- displacement：from/to 與 `Math.hypot` 真實移動距離。

trigger 與 displacement 必須 1:1。牆面可能讓距離小於 3.2，甚至 0；零位移是診斷結果，
不可為了 PASS 排除。

### 3.3 Round-level retreat episode

量測器把同一 `round + player` 的第一次 trigger 建立為一個 episode，後續連續或重複
trigger ticks 累加 `triggerTicks` 與 `totalDistance`。這是 measurement grouping，不是引擎 state，
也不宣稱每個 trigger 都是獨立戰術決策。

### 3.4 Recontact / re-engage

- `retreat_recontact`：retreat episode 開始後的較晚 tick，該玩家第一次再次進入已通過
  range/LOS/smoke/cap 的 combat pair，正要消耗 fire roll；
- `retreat_reengage`：episode 後該玩家所在 pair 第一次真正通過 fire roll。

兩者分開。只看到敵人不等於重新開火；fire roll 未通過也不算 re-engage。

### 3.5 `retreat_round_result`

每個 episode 在 round 結束記一次 survived、won、round kills、trigger ticks、total distance、
是否 recontact/re-engage。每回合另有 summary，包含 episode player IDs，證明沒有漏 result。

這些 outcome 只作 paired chain 的終點，不證明 retreat 導致結果。

## 4. 固定輸入

- `CsMeasurementSeedSet.v1` 原固定 16 seeds／hash；
- Inferno、T `t_aexec`、CT `c_std`、既有 ROSTER；
- 每 seed collector off/on-1/on-2，共 48 simulations；
- baseline only，無 stat treatment。

Event schema：`CsRetreatInstrumentation.v1`。Candidate 必須經人工檢查後以 literal 鎖定，
沒有 update/rebaseline CLI。

## 5. PASS / FAIL

1. 無 CLI flag；source SHA、markers、seed generation/hash 精確一致。
2. memory transform 精確可逆；21 個 `rand()` 與全部 RNG token 序列不變。
3. off/on-1/on-2 完整 sim JSON 逐 seed相同；on-1/on-2 events 逐 seed相同。
4. input simulate 前後 hash 不變。
5. player-tick opportunity identity 唯一；distance/HP/mates/aggr/gate flag 合法。
6. 每個 trigger 有同 identity opportunity 且 `gatePassed=true`；trigger = displacement。
7. displacement 是 from/to 的真實距離、介於 0 與 3.2（容許浮點誤差）。
8. episode trigger ticks/total distance 等於其所有 trigger/displacement 累計。
9. 每名 episode player 最多一個 recontact 與一個 re-engage；re-engage 必須先有 recontact。
10. 每 episode 恰有一筆 round result；每 played round 恰有一筆 summary，winner/how 對回 sim。
11. fixed suite 至少有 opportunity、trigger、episode、recontact、re-engage；否則未量到作用鏈而 FAIL。
12. expected event suite digest 匹配人工鎖定 literal；禁止自動更新。

以下不是 FAIL：

- opportunity 未通過 aggr gate；
- trigger displacement 為 0；
- episode 沒有 recontact/re-engage；
- retreat player 死亡或輸掉回合；
- t1/t2 某人沒有 episode；
- 結果方向與直覺不同。

## 6. 嚴格審查

| 高風險假設 | 修正版 |
|---|---|
| retreat trigger count 就是 retreat 效果 | count 只作 gate action；另量 displacement、re-engage、survive、round result |
| 每個 2 秒 trigger 都是獨立 episode | player-tick 與 round-player episode 分層，不誇大決策次數 |
| 位移指令 3.2 就等於真的移動 3.2 | 記 safeMove 後 from/to；牆面造成的 0/縮短如實保留 |
| 再進 combat pair 就算 re-engage | recontact 與 fire-roll pass 分開 |
| 多讀一次 `aggr` 一定無影響 | 只在 collector-on 且函式純計算；off/on 完整 sim JSON 為 hard gate |
| retreat 後存活等於 retreat 導致存活 | 只報 chain outcome，不作因果/calibration 結論 |
| 可順便調 0.82 或 3.2 讓 AI 好看 | 明確禁止；R5 只量測 |

審查結論：**Go**。所需 markers 都在單一既有 retreat/combat/round state machine，
不需正式程式、helper 或 dependency 修改。

## 7. 下一階段准入

R5 PASS 後只補足 `apm/positioning/courage/clutch` 的 retreat action-point coverage。
是否能 calibration 仍需 stat treatment sample plan、作用點分離、ADR overkill 隔離與明確 outcome；
R5 本身不授權 calibration。下一個候選安全量測是 CT defuse opportunity/progress。
