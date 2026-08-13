# R30 CS「殘局能力（Clutch）」量測與校準準備度規格

日期：2026-08-13

## 範圍

本 Sprint 只做 CS Clutch 的 production read-chain audit、R22 四層量測與 deterministic readiness。沒有修改 `src/` production gameplay、balance constant、role mapping、scenario、RNG、contract 或 historical baseline。

固定場景為 `inferno / t_aexec / c_std`，沿用 R22 的 16 seeds（seed-set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`），T-side 五個 role 各做 low / baseline / high（`stats.str ±10`）。

## 產品語意與 production read-chain

本引擎沒有獨立的 `clutch` 欄位；產品上的「殘局能力」目前落在 legacy `stats.str`（原始欄位名偏「抗壓」）。它代表的是壓力下的戰鬥穩定與局部轉換能力，不是完整的 1vN 決策 AI，也不負責自動選目標、拆彈或道具時機。

| 層次 | 真正讀取 | 目前作用 |
|---|---|---|
| raw Clutch | `stats.str` | `posSkill()` 的 entry / rifler / awp / lurker role-fit；IGL 不讀 `str` 做 role-fit |
| effective Clutch | `persStat(p,"str")` | personality 修正後、clamp 1–99 的實戰值；被 `combatSkill()` mechanics、`aggr()`、low-HP 與 lastAlive 分支讀取 |
| lastAlive consumer | `if(opts.lastAlive)` | `effective str` 加成 `(str - 76) * 0.22`；同一分支另有 Resilience `(res - 76) * 0.12` |
| low-HP consumer | `if(opts.lowHP)` | `str` 進入低血量 combat modifier |
| generic action path | `aggr()` | `str * 0.22` 影響 fire chance，並可間接影響 `aggr < 0.82` retreat gate |
| negative consumers | source slice verified | 不直接控制 target selection、utility timing、defuse progress、bomb choice、tactic choice 或 buy choice |

人格是目前唯一的 Clutch adjustment；morale / condition 不改 `persStat(str)`，只由 `formMul()` 乘在最後的 combat output 上。

## R22 四層量測

- Level 1：raw / adjusted / effective read、role-fit、normal combat、lastAlive combat、aggr、local duel `Pt`；五個 role 的直接 combat / lastAlive 公式均為 16/16 strict-majority monotonic。
- Level 2：實際 lastAlive opportunity，記錄 1v1、1v2、1v3、1v4、1v5 與 `oneVsMany`。
- Level 3：lastAlive pair admission、trigger、conversion、damage / kill chain；不得把「有機會」當成「已經贏」。
- Level 4：round win、survival、kills、damage 只作 secondary observation。

R4 的獨立 true-clutch evidence 仍保留：158 opportunities、32 opportunity wins、27 legacy clutches、5 wins 不在 legacy counter。R30 不以舊 counter 作唯一證據。

## Readiness gate

使用 R22 `monotonicity`、`pairedEffect`、`clampSummary`、`thresholdCrossing` 與 `classifyCausalReadiness`。直接公式證據成立；但 per-role runtime opportunity 不均，尤其 rifler / IGL 稀疏，且 lurker 的 `aggr < 0.82` crossing 會放大路徑差異。因此 Level 2 / Level 3 不能以現有 16 seeds 建立校準級 strict-majority，Level 4 只保留 secondary。

## Determinism / provenance

- verifier：`tools/check_cs_clutch_measurement_r30.mjs`
- event schema：`CsClutchMeasurementEvent.v1`
- suite schema：`CsClutchMeasurementSuite.v1`
- live engine SHA-256：`f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`
- static `rand()` call sites：21；memory transform round-trip 與 RNG token sequence 均不變
- R4 historical event digest：`e3a32ac8990a1bd866936827701352cb4fdd8c665b1984e9eb2fd3942d6d0b0d`
- R4 event-only digest：`4d8b082092a5a735c76b0c75d5618d3eec7be8f45ac7ce59ed8a25a3ab7f053c`
- R30 suite digest：`56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c`
- 176 logical arms / 528 simulator executions；repeated digest PASS

## 本輪明確不做

不新增 1vN decision feature、clutch-only RNG、defuse / utility / retreat 新分支，不調整 balance，不重做 legacy counter，不 rebaseline historical evidence。
