# R40 CS APM／操作量 Calibration Pilot 報告

## 結論先說

APM 的 local direct consumer 已足夠穩定進入 Calibration Ready（local pilot scope），但不是「最終 balance Done」。每增加 10 點 raw APM，effective APM 通常使 mechanics／combatSkill／aggr 小幅上升；高端區間受 personality clamp 與既有 `aggr < 0.82` retreat gate 影響，不能當成全段線性值。

## Sweep 與 provenance

`60 / 70 / 80 / 90 / 100 × entry / rifler / awp / lurker / igl × 16 fixed seeds = 400 arms`。

- focused verifier：`tools/check_cs_apm_calibration_r40.mjs`
- suite digest：`d7b46c27099f894c52a27311b9b43503d78d87ecf6220b15cf0d71b14c0595d0`
- engine source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- production source modified：否；只使用 memory-only transform
- RNG、scenario、historical evidence：未改、未 rebaseline

## 每增加 10 點的 local direct effect

下表是五段 sweep 的 paired mean；這是 Level 1／local causal 讀值，不是整場勝率承諾。

| role | combatSkill | mechanics | aggr |
|---|---:|---:|---:|
| entry | +0.1576 | +0.1354 | +0.0156 |
| rifler | +0.1388 | +0.1354 | +0.0156 |
| awp | +0.0686 | +0.1389 | +0.0160 |
| lurker | +0.1241 | +0.1146 | +0.0132 |
| igl | +0.1571 | +0.1389 | +0.0160 |

APM 的 `aggr` 公式係數仍是 `0.16 / 100`，所以未碰到 clamp 時，+10 點約為 `+0.016`。表中 lurker 與高端 role 的平均略低，是既有 effective clamp 的結果，不是新公式。

## 區間判讀

- **穩定線性工作區：70–90**。五個 role 的 direct combat／aggr 相鄰 20 bands 全部 strict-majority positive（20/20、20/20）。
- **量測／pilot 可用範圍：60–90**。60 可作低端 anchor，但不應與 90–100 的 threshold 行為混在同一線性係數。
- **threshold danger：90–100**。lurker 的 aggr 約由 `0.8184` 到 `0.8232`，跨過既有 `aggr < 0.82`；igl 約由 `0.8058` 到 `0.8218`，同樣在高端跨過 gate。兩者的 retreat opportunity／trigger 因而離散下降，不是 APM arithmetic 失效。
- **clamp／saturation：高端 100**。entry 的 effective APM 到 99；rifler 到 99；lurker 因 lonewolf +6 到 99。awp／igl 目前仍受各自 personality -4，但沒有新增 clamp path；高端仍應保留觀測。

## Role 差異與特別風險

- entry、IGL 的 direct combat slope 最大；entry 另外保留 raw APM role-fit，故存在既有雙 exposure，不能把 entry 的總價值直接外推給其他 role。
- rifler 的 combat slope 接近 entry，但沒有 APM role-fit consumer。
- lurker 的 combat slope 中等，卻是 threshold 最敏感的角色；90→100 的 effective clamp 與 retreat gate 同時出現。
- AWP 的 combat slope 最低，因 sniper weapon branch 不直接讀 APM；它仍有 mechanics／aggr 讀值，不能宣稱「完全不吃 APM」。
- Level 2／3 的 opportunity、Pt、conversion 會隨 deterministic path 放大或反轉；Level 4 kills／damage 只作 secondary，沒有拿來否定 Level 1 direct calibration。

## Production 判定

本輪 **沒有 production patch**。現有 coefficient 與 retreat threshold 沒有足夠證據需要修改；若未來要調參，應限制在 70–90 stable range，並另開小型 calibration Sprint，不能順手改 threshold 或 retreat system。

## Gate 結果

- R40 focused verifier：PASS（direct combat 20/20、direct aggr 20/20）
- R21 APM measurement、R22 framework、R38 status：沿用並通過
- historical／progress／reward／Q7a／build／review：本 Sprint 變更後重跑

**APM verdict：Calibration Ready（local causal pilot）；不是最終 balance Done。**
本報告結論：APM 可進入 local calibration pilot；不修改 production balance。
