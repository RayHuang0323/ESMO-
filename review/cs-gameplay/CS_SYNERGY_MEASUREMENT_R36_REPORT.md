# R36 CS Synergy Measurement / Semantic Readiness Report

## 結論

目前 `coo` 沒有玩家側真正的 team coordination。它只存在於 Support role profile，而玩家五人 adapter 不產生 Support；R16-A 仍證明 CT Support path 可觀察 role-fit / generic simulator path，卻沒有 player team-level coordination output。沒有 assist / trade、crossfire、補位或 utility coordination 的 `coo` consumer。

Focused verifier：`tools/check_cs_team_stats_measurement_r36.mjs --stat=coo`，並重跑 `tools/check_cs_synergy_semantics_r16a.mjs`。

- fixed seeds：16；5 roles × low / baseline / high；512 repeated simulator executions
- R36 suite digest：`aa5f90bc1c582ea5210c304604df8c69001ba9d7646b98d873519f307d66095b`
- R16-A historical digest：`db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022`
- production source / RNG / scenario：未修改

判定：Measurement Go；Semantic Revise / design gap；Calibration No-Go。後續應另開小型 verifier-first team coordination Sprint，不能用 Support role-fit 或調權重假裝完成。
