# R36 CS Comms Measurement / Semantic Readiness Report

## 結論

目前 `com` 真正能影響的是 IGL / Support 的個人 role-fit 輸入；它沒有控制 callout、敵情共享、bomb / utility information、隊友 awareness 或 team coordination。IGL 可達到直接 role-fit strict-majority；其他四個玩家 role 是 deterministic controls，Support 另有既有 role profile evidence。`combatSkill`、`aggr` 與 route / tactic / utility 行為不讀 `com`。

Focused verifier：`tools/check_cs_team_stats_measurement_r36.mjs --stat=com`。

- fixed seeds：16；5 roles × low / baseline / high；512 repeated simulator executions
- suite digest：`e8dc743f39af3aa02b0a44c47b9c29245475366038be07a1bec93ec856063a33`
- R16 / R17 / R3 evidence：保留
- production source / RNG / scenario：未修改

判定：Measurement Go；Semantic Revise；Calibration No-Go / Deferred。後續若要讓 Comms 成為真實資訊 consumer，另開 verifier-first gameplay Sprint，不在本輪硬接 combat bonus。
