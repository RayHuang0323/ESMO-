# R36 CS Leadership Measurement / Semantic Readiness Report

## 結論

目前 `led` 真正能影響的是 IGL 個人 role-fit。沒有讀取 `led` 的 team modifier，也沒有 tactic execution、route / site commitment 或 teammate-response consumer；固定 simulator 顯示的 IGL call / route 行為不代表玩家 Leadership 已接線。IGL 是唯一有直接 role-fit 的 role，其餘四個 role 是 controls。

Focused verifier：`tools/check_cs_team_stats_measurement_r36.mjs --stat=led`。

- fixed seeds：16；5 roles × low / baseline / high；512 repeated simulator executions
- suite digest：`6909e5080c0992eecaa48108dd0e48f083bfd6387d71ffdb4ab72e3e50efbb16`
- R16 / R17 / R3 evidence：保留；production source / RNG / scenario：未修改

判定：Measurement Go；Semantic Revise；Calibration No-Go / Deferred。後續若要做真正 IGL 影響隊伍的行為，另開 verifier-first team-direction Sprint，不與 Comms 或 TacticalIQ 直接疊加同一 bonus。
