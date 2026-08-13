# R36 CS 領導力（Leadership）Measurement / Semantic Readiness

## 範圍

本輪只審查 `led`，不調整平衡、不新增 leadership AI、RNG、scenario、16 項其他素質或賽事系統。量測採 R22：5 role、low / baseline / high、16 固定 seed；Level 4 只作 secondary observation。

## Production read-chain

- raw `stats.led` 由 `toShortStats` 保留。
- `POS_PROFILE` 只在 IGL 讀取 `led`（最高權重 5），形成 raw role-fit。
- `persStat(player,"led")` 提供 personality-adjusted值，但沒有 Leadership-specific live consumer。
- `_mechKeys`、`combatSkill`、`aggr`、`tacticEdge`、`simulateFps` 都不讀 `led`。IGL 的 tactic、route、site commitment 與 teammate response 來自固定 tactic / simulator 邏輯，不是 Leadership。

## R22 evidence boundary

IGL 是唯一 applicable role；Entry、Rifler、AWP、Lurker 是 deterministic controls。Level 2 的 team direction、tactic execution、route / site commitment 與 teammate response 沒有可歸因的 player-stat opportunity；Level 3 沒有 team conversion；Level 4 只作 secondary observation。suite digest：`6909e5080c0992eecaa48108dd0e48f083bfd6387d71ffdb4ab72e3e50efbb16`。

## Semantic classification / verdict

- 分類：**B. Narrow role-fit only**。
- Measurement：Go / PASS。
- Semantic readiness：Revise。要成為「讓全隊執行方向」的 Leadership，需另開小型 team-direction / response Sprint。
- Calibration：No-Go / Deferred；不能將 IGL 個人 combat role-fit 當 team leadership KPI。

## Boundary

Leadership = 使隊伍理解並執行方向；Comms = 資訊傳輸；TacticalIQ = 自己理解戰術。三者目前沒有共用 team bonus，故沒有 live double-counting。
