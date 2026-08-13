# R36 CS 溝通（Comms）Measurement / Semantic Readiness

## 範圍

本輪只審查 `com`，不調整平衡、不新增 team AI、不改 RNG、scenario、16 項其他素質或賽事系統。量測沿用 R22 Local Causal Calibration Framework：5 個玩家 role、low / baseline / high、16 個固定 seed；整場 kills / damage / survival 只作 Level 4 次要觀察。

## Production read-chain

- raw `stats.com` 由 `toShortStats` 保留。
- `POS_PROFILE` 只在 IGL（權重 4）與 Support（權重 3）讀取 `com`，形成 raw role-fit。
- `persStat(player,"com")` 是 personality-adjusted producer，但沒有獨立的 Comms live consumer。
- `_mechKeys`、`combatSkill`、`aggr`、`tacticEdge`、`simulateFps` 都沒有讀 `com`。模擬器裡的 `comms` 是固定 simulator event，不是玩家 Comms stat 的資訊品質結果。

## R22 evidence boundary

Level 1 的 IGL / Support role-fit 可做 deterministic low / baseline / high 量測；Entry、Rifler、AWP、Lurker 是 no-consumer controls。Level 2 callout、enemy / bomb / utility information sharing 與 coordination opportunity 沒有可歸因的 player-stat read point；Level 3 沒有 conversion；Level 4 只作 secondary observation。suite digest：`e8dc743f39af3aa02b0a44c47b9c29245475366038be07a1bec93ec856063a33`。

## Semantic classification / verdict

- 分類：**B. Narrow role-fit only**。
- Measurement：Go / PASS（read-chain、5 role controls、16 seed deterministic sweep）。
- Semantic readiness：Revise。若產品要「資訊傳遞品質」，必須另開小型資訊事件 / opportunity Sprint。
- Calibration：No-Go / Deferred；不能用 combat 結果替代 call quality 或 teammate awareness。

## Boundary

Comms = 資訊傳輸品質；不等於 Leadership 的方向統一，也不等於 Synergy 的共同執行。R16 / R17 historical evidence 保留，沒有 rebaseline。
