# R24 CS Accuracy Measurement / Calibration Readiness 規格

日期：2026-08-12
範圍：只做 Accuracy 的 gameplay measurement 與 calibration readiness 判定，不修改 production gameplay 或 balance。

## 1. 目的與產品邊界

本輪要回答的是：「Accuracy 在目前 CS 模擬器裡，實際控制哪一段行為？」不是直接決定 Accuracy 應該調高或調低。

R24 沿用 R22 Local Causal Calibration Framework，將證據分成四層：

1. Level 1：原始值、有效值、直接公式輸出、clamp。
2. Level 2：選手是否取得可以受 Accuracy 影響的射擊機會。
3. Level 3：機會是否轉成對槍、爆頭與有效傷害。
4. Level 4：擊殺、總傷害、存活與勝負；只作 secondary observation，不作 Accuracy 的主要 monotonicity gate。

本輪不把現有的 `hitRate = 1` 解讀成 Accuracy 已完成命中率系統。現行 production 在被接納的 firearm exchange 中沒有獨立 miss 分支；Accuracy 主要影響 combatSkill 與 headshot chance / damage。

## 2. 已確認的 production read-chain

| Read point | 目前語意 | R24 判定 |
|---|---|---|
| `stats.acc` | 選手原始 Accuracy | raw input |
| `persStat(p,"acc")` | 套用 personality boost / nerf 後，再經 `clamp(1,99)` 的 effective Accuracy | live combat consumer |
| `posSkill()` | role-fit / positioning aptitude；只讀 raw stats，profile 有 `acc` 才使用 | role-fit consumer |
| `combatSkill()` | mechanics 與 weapon fit 使用 `persStat(acc)` 的 effective Accuracy | live combat consumer |
| headshot formula | `g.hs * (0.72 + 0.55 * rawAcc / 100)`，目前仍讀 `at.stats.acc` | raw consumer；與 combatSkill 的 effective 語意不一致 |
| `aggr()` / `fireChance` / retreat | 目前不直接讀 Accuracy；使用 courage、strength、APM、positioning 等其他值 | no direct Accuracy consumer |

Accuracy profile weight：`rifler = 5`、`entry = 2`、`awp = 5`；`lurker` 與 `igl` 的 `posSkill()` profile 不含 Accuracy。五種角色仍可能透過 live `combatSkill()` 使用 effective Accuracy。

## 3. Sweep 設計

- 角色：`entry`、`rifler`、`awp`、`lurker`、`igl`。
- 每個角色：low / baseline / high。
- treatment：只改目標 T 選手的 `stats.acc`，固定 raw ±10；其他 player、role、personality、scenario 不變。
- seeds：16 個固定 seed，`CsMeasurementSeedSet.v1`。
- scenario：`inferno`、`t_aexec`、`c_std`。
- 每一個 simulator execution 都執行 uninstrumented、instrumented、repeated-instrumented 對照；總計 528 次。
- verifier 使用 Vite memory transform，只在測試記憶體中加觀測點；production source、RNG token sequence、scenario 與 input 必須保持不變。

## 4. KPI 與 attribution

### Level 1

- raw / effective Accuracy。
- `persStat(acc)` adjustment 與 clamp reads。
- `posSkill` raw Accuracy read 與 role weight。
- `combatSkill` effective Accuracy read、輸出與 call count。
- headshot chance formula 與實際 headshot roll。

### Level 2

- fire opportunity / `combat_pair_candidate`。
- pair admission / rejection。
- attacker、defender、target 的 pair attribution。
- `aggr < 0.82` retreat threshold 是否被 Accuracy 直接穿越。

### Level 3

- target player 作為 attacker 的 exchange、headshot、firearm effective damage。
- firearm `hitRate`；這裡應明確呈現目前「每個 admitted exchange 都會 apply damage」的結構。
- effective damage 與 overkill 分開記錄。

### Level 4

- target-player-only attacker-side firearm kills / damage。
- defender-side firearm damage taken / deaths / survival。
- opponent totals 只標記為 spillover，不混入 target attacker KPI。

16 seeds 的 strict-majority 必須是 `passingSeeds > totalSeeds / 2`；因此 8/16 不通過，至少 9/16 才能通過。

## 5. Readiness 規則

Accuracy 只有在下列條件都成立時，才可標記為 local calibration pilot ready：

- Level 1 raw/effective/direct consumer attribution 正確。
- direct/local monotonicity 以 strict majority 通過。
- Level 2 opportunity coverage 足夠。
- Level 3 immediate conversion 沒有被 hidden threshold 主導。
- 沒有尚未決定的 raw/effective semantic ambiguity。
- Level 4 path amplification 只能降低信心，不可單獨推翻已成立的 direct/local evidence；但若 semantic boundary 尚未決定，calibration 仍必須 Deferred / Revise。

本輪已知 headshot consumer 使用 raw Accuracy，而 combatSkill 使用 effective Accuracy。這是必須保留在報告中的 semantic ambiguity，不得用調整 balance constant 掩蓋。

## 6. 保護條款

- 不新增 RNG。
- 不改 role mapping、balance constant、scenario 或 production gameplay。
- 不 rebaseline R1～R23 historical evidence。
- 不處理 Reflex、Positioning、APM、Courage、MapAware、Synergy、Learning。
- 不建立第二套 simulator，不做大幅重構。

## 7. Provenance

- verifier：`tools/check_cs_accuracy_measurement_r24.mjs`
- source SHA-256：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`
- fixed seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- static RNG call sites：21
- measurement suite digest：`3c6d1625a06684b91b3b99424cdfb4c79c963f17da82411b825264d0f77eaf05`
