# R33 CS Clutch × Resilience Semantic Ownership + Pressure / Low-HP

## Scope

本 Sprint 只處理 CS 16 項素質線；不碰 SeasonState、Circuit、Event、competition、賽事資料、scenario 或其他 stat calibration。

## 封版責任邊界

- Clutch：`raw stats.str` 經 role-fit / `persStat(str)` 後，負責 `combatSkill` 的主動戰鬥能力與 `lastAlive` / 1vN 局部勝負轉換。
- Resilience：`raw stats.res` 經 `persStat(res)` 後，負責既有 `lowHP` 分支的穩定保留，抵銷低血量造成的表現衰退。
- `aggr`、fire、retreat、defuse、utility、target、tactic、buy：沒有新增 Resilience consumer。
- morale / condition 仍由既有 `formMul` 作用於最終輸出，不被誤稱為 effective Resilience。

## 最小修正

原本 `lastAlive` 同時加上 Clutch `+0.22` 與 Resilience `+0.12`，造成 attribution risk。R33 將既有 Resilience `0.12` 移到同一個已存在的 `lowHP` penalty；不改係數、不加 RNG、不改角色、不加 state machine。

## 量測規格

使用 R22 四層：Level 1 direct formula、Level 2 low-HP opportunity、Level 3 local combat/conversion、Level 4 kills/damage/survival secondary。固定 5 roles（entry/rifler/awp/lurker/igl）、16 seeds、low/baseline/high；target-player-only attribution。

## Gate

- R30 historical view：`56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c`
- R31 current low-HP measurement：`6cfac07a531b5e1e7d410bf822b0b2ae820400773c405ebc346a79cf034804c3`
- R32 ownership audit：`f6328d28096ff0845ad2f6db6293c234079984ecef3701e09468c133bcc26272`
- R33 focused verifier：`30ebd902a9ad819d4c96cdd0609d8f4ba4a4f59bd8f0acacf9c09bbb6d05a372`

Calibration remains deferred: direct low-HP path is monotonic, but role opportunity coverage and immediate conversion are not strict-majority across all roles; Level 4 is secondary.
