# R23 CS Courage Measurement / Calibration Readiness Spec

日期：2026-08-12
範圍：只做 Courage measurement / readiness；不調 balance、不修改 production gameplay。

## 1. 目的

R23 使用 R22 Local Causal Calibration Framework，確認 Courage 在目前 CS simulator 中實際讀到哪裡、影響哪一個局部行為，以及哪些結果只是後續整場連鎖反應。

本輪不宣稱完成 Courage balance calibration，也不把 kills、damage、survival 或 winner 當作唯一 primary monotonic gate。

## 2. 已封版語意

| 名稱 | 產品語意 |
|---|---|
| `raw stats.cou` | 選手原始勇氣能力，也是 role-fit 基礎資料 |
| `persStat(p,"cou")` | 套用 personality 後的 effective courage，供 live combat 使用 |
| state adjustment | 沒有發現 Courage 專用的 morale / condition 修正；`formMul` 是整個 combatSkill 的狀態倍率，不是 Courage 專用 read |
| `posSkill()` | role-fit / positioning aptitude；只有 `entry` profile 讀 raw courage，權重為 5，其餘本輪五個目標 role 為 0 |
| `combatSkill()` | 只有 `opts.entry` 讀 effective courage，係數為 `0.06`；非 entry 不把 Courage 當作直接 combatSkill 輸入 |
| `aggr()` | 五個 role 都讀 effective courage，係數為 `0.5 / 100` |
| downstream | `aggr` 影響 pair fire chance，並通過 `aggr < 0.82` 進入 retreat gate |

## 3. Measurement 分層

| R22 層級 | Courage 本輪 read point / KPI | 用途 |
|---|---|---|
| Level 1 — Stat / Direct Consumer | raw/effective courage、personality delta、clamp、entry raw `posSkill`、entry `combatSkill` read、全 role `aggr` | primary causal evidence |
| Level 2 — Local Opportunity | target player 的 pair candidate、retreat opportunity、`aggr < 0.82` gate | 確認目標玩家真的有機會被 Courage 影響 |
| Level 3 — Immediate Action / Conversion | pair admitted / rejected、retreat trigger、displacement、re-engage、target attacker exchange | 確認局部機會是否轉成行為 |
| Level 4 — Downstream Match Outcome | target-only attacker kills / damage、defender deaths / survival；CT 另列 spillover | secondary observation，不作所有 Courage primary gate |

## 4. Sweep 設計

- 5 個 T 方目標 role：`entry`、`rifler`、`awp`、`lurker`、`igl`。
- 每個 role：low / baseline / high。
- 16 個固定 seed：沿用 `CsMeasurementSeedSet.v1`；seed set SHA 不變。
- Courage treatment 使用 raw `±10`。t1 baseline raw courage 為 88，因此若使用 `+12` 會越過 raw 99；本輪用 `±10` 避免把 treatment 本身的非法上限與 runtime personality clamp 混在一起。
- 每個 arm 執行 uninstrumented 一次、instrumented 兩次，檢查輸出與事件 digest 一致。
- 預計 528 次 simulator execution。
- instrumentation 使用 Vite memory transform；production source、RNG call sequence、role mapping、scenario 均不變。

## 5. Gate

- 16 seeds 必須嚴格大於 8 才算 strict majority；8/16 不通過。
- Direct/effective courage 與 `aggr` 是五個 role 的共同 primary local gate。
- raw `posSkill` 與 entry `combatSkill` 只在實際有對應 read 的 role 判定；沒有 read 的 role 標為 not applicable，不把 path 變化誤報成 direct consumer。
- threshold crossing、clamp、opportunity coverage、changed seeds 與 downstream path amplification 必須個別列出。
- Level 4 只做 target-player-only secondary attribution：目標玩家作為 attacker 的 kills / damage 不混入 CT；目標作為 defender 的 deaths / survival 另列；CT 結果列為 spillover。

## 6. 保護範圍

- 不新增 RNG。
- 不 rebaseline R1～R22 historical evidence。
- 不修改 gameplay balance constant、retreat threshold、role mapping 或 scenario。
- 不處理 Reflex、Positioning、APM calibration，也不碰 MapAware、Synergy、Learning。
- verifier 必須能證明 memory transform 可逆、RNG token sequence 不變、instrumentation 不改 simulation output、兩次觀測 digest 相同。
