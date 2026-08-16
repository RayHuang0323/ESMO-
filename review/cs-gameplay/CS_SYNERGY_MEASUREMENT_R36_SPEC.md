# R36 CS 配合度（Synergy）Measurement / Semantic Readiness

## 範圍

本輪只審查 `coo`，不新增 coordination engine、team state machine、RNG、scenario、16 項其他素質或賽事系統。量測採 R22：5 個玩家 role、low / baseline / high、16 固定 seed；Level 4 只作 secondary observation。

## Production read-chain

- raw `stats.coo` 由 `toShortStats` 保留。
- current `POS_PROFILE` 只在 Support 讀取 `coo`（權重 5）；現有玩家 adapter 的五個可達 role 沒有 Support。
- `persStat(player,"coo")` 沒有 team-level live consumer。
- `_mechKeys`、`combatSkill`、`aggr`、`tacticEdge`、`simulateFps` 都不讀 `coo`。R16-A 的 CT Support path 是既有歷史 evidence：它可觀察 role-fit 路徑，但不代表玩家 team coordination 已成立。

## R22 / R16 evidence boundary

5 個玩家 role 都是 deterministic controls，CT Support 只作既有可達 path reference。Level 2 的共同執行、補位、trade / assist、crossfire、utility coordination 沒有玩家 team-level read point；Level 3 沒有 team conversion；Level 4 只作 secondary observation。suite digest：`aa5f90bc1c582ea5210c304604df8c69001ba9d7646b98d873519f307d66095b`。R16-A digest `db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022` 以歷史 adapter 重跑並保留。

## Semantic classification / verdict

- 分類：**C. Semantic / gameplay design gap**。
- Measurement：Go / PASS（control coverage 與 deterministic boundary 完成）。
- Semantic readiness：Revise / design decision first。
- Calibration：No-Go；不能把 Support role-fit 或 `posSkill` 包裝成 team synergy。

## Boundary

Synergy = 收到資訊後共同執行、補位與協同；Comms = 資訊傳輸；Leadership = 統一方向。要補真正 team-level consumer，必須另開獨立 gameplay Sprint。
