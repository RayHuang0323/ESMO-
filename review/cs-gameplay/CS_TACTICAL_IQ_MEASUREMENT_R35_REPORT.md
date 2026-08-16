# R35 CS「戰術理解（TacticalIQ）」量測報告

日期：2026-08-14
verifier：`tools/check_cs_tactical_iq_measurement_r35.mjs`
suite：`CsTacticalIQMeasurementSuite.v1`

## 白話結論

戰術理解現在不是一個會自己改戰術的 AI。它目前真正做的事，是在 IGL／Support 的角色適性公式裡提供 raw `tac`。`persStat(tac)` 可以算人格修正值，但沒有接到即時 tactical action。模擬器的 tactic、site、route、smoke、molly、CT/T 行為，來自固定的 tactic input 與既有 simulator 規則，不是玩家 tac 值。

## 五個 role

| role | tac role-fit | live TacticalIQ action | 結論 |
|---|---:|---|---|
| Entry | 無 | 無 | 只受其他 role-fit / combat 路徑影響 |
| Rifler | 無 | 無 | 沒有 tac consumer |
| AWP | 無 | 無 | 沒有 tac consumer |
| Lurker | 無 | 無 | `vis`／`dec`／`pos` 不是 TacIQ |
| IGL | 有，profile 第 4 項 | 無 | 只有 raw role-fit 間接作用 |

Support 在 production profile 也讀 tac（第 2 項），但不在本輪五個 T-side role 的 target sweep；因此它是額外的 role-fit coverage，不應被誤報成全角色 gameplay coverage。

## R22 結果

- repeated deterministic digest：PASS。
- 16 fixed seeds；512 simulator executions。
- Level 1：IGL／Support role-fit 的直接公式證據；effective tac 只有 producer-level evidence。
- Level 2：沒有 TacticalIQ-owned tactical opportunity。
- Level 3：沒有 tac-owned tactic execution／site／route／rotation／utility／bomb／target action。
- Level 4：kills／damage／survival／winner 只作 secondary observation。
- clamp／threshold：±10 treatment 沒有 tac-specific clamp；`aggr` threshold 不受 tac 影響。

## `/review`

Blocking：無。
Non-blocking：戰術理解 role-fit 只覆蓋 IGL／Support；真正 tactic execution 缺少 player-stat consumer；CT/T 的 tactic 差異是固定 input，不是 tac causal path。
建議：維持現有資料與 role-fit，若產品需要真正戰術理解，另開 gameplay Sprint，先做單一可量測 action；不要在 R35 硬接新公式。

## Verdict

Measurement：**Go / PASS**。
Semantic readiness：**Revise**。
Calibration：**No-Go / Deferred**。
本輪沒有修改 production、RNG、scenario、role mapping、contracts、歷史證據或任何 Season/Circuit/Event/competition 系統。
