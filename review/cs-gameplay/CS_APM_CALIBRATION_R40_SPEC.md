# R40 CS APM／操作量 Calibration Pilot

## 範圍

本 Sprint 只量測既有 APM read-chain，不修改 production source、balance、role mapping、RNG、scenario 或 historical evidence。APM 的主要 calibration KPI 是 local causal path；kills、damage、survival 與回合結果只作 secondary observation。

## 固定量測形狀

- scenario：`inferno / t_aexec / c_std`
- target roles：`entry / rifler / awp / lurker / igl`
- raw APM levels：`60 / 70 / 80 / 90 / 100`
- 每個 role／level 使用 16 fixed seeds，共 `5 × 5 × 16 = 400` arms
- 每個 arm 依序執行 instrumentation-off、instrumentation-on、repeated-on，確認 memory-only instrumentation 不改變結果或 RNG sequence。
- seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`

## R22 四層

1. Level 1：`effective APM`、mechanics、`combatSkill`、`aggr`、既有 raw role-fit。
2. Level 2：target-player combat opportunity、aggr／retreat opportunity。
3. Level 3：Pt、attacker-side local conversion、retreat threshold crossing。
4. Level 4：kills、damage、survival、round result；不作主要 gate。

## 安全邊界

verifier 以 Vite memory transform 讀取目前 FPS source，所有 marker 均要求唯一匹配、可逆還原，並比較 instrumentation-off／on／repeated-on digest。固定檢查 source SHA、RNG token sequence、輸入不可變與既有 `aggr < 0.82` retreat threshold；不建立新 RNG 或新 gameplay consumer。
本規格結論：只做 deterministic measurement，不建立新的 gameplay consumer。
