# R42 CS 站位（Positioning）Calibration Pilot

## 範圍

本 Sprint 只量測既有 Positioning read-chain，不修改 production source、balance、role mapping、RNG、scenario 或 historical evidence。證據拆成 raw role-fit、effective combat、aggr／retreat 三條路徑；kills、damage、survival、round result 只作 secondary observation。

## 固定量測形狀

- scenario：`inferno / t_aexec / c_std`
- target roles：`entry / rifler / awp / lurker / igl`
- raw Positioning levels：`60 / 70 / 80 / 90 / 100`
- 每個 role／level 使用 16 fixed seeds，共 `5 × 5 × 16 = 400` arms
- 每個 arm 依序執行 instrumentation-off、instrumentation-on、repeated-on，確認 memory-only instrumentation 不改結果或 RNG sequence。
- seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`

## 三條作用路徑

1. Role-fit：`posSkill()` 對 raw `stats.pos` 的 profile weight。
2. Combat：`persStat(pos)` 進 mechanics／weapon／holding／lurk 等既有 `combatSkill` 路徑。
3. Behavior：`persStat(pos) * 0.12` 進 `aggr`，再影響 fire／retreat eligibility 與 `aggr < 0.82` gate。

## Spatial identity boundary

Production 有 distance、wall／LOS、smoke 與 teammate／enemy pair admission，但本輪 read-chain audit 顯示 Positioning stat 沒有直接被 cover、LOS、spacing 或 reposition decision 消費；因此本 Sprint 不新增 pathfinding 或 positioning AI，並將「數值可量測、完整 gameplay identity 尚缺」列為正式結論。
本規格結論：只做 deterministic measurement，不建立新的 positioning AI 或 pathfinding consumer。
