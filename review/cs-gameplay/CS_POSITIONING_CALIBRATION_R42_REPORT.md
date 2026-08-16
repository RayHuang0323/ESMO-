# R42 CS 站位（Positioning）Calibration Pilot 報告

## 結論先說

Positioning 的既有數值 consumer 具備穩定 local signal，但目前還不能宣稱是完整的「站位能力」：它主要被當成 role-fit、combatSkill 與 aggr 輸入，沒有直接用於 cover、LOS、隊友間距、敵我間距或 reposition decision。故本輪可做受限 calibration pilot，gameplay identity 仍是 **incomplete / semantic gap**。

## Sweep 與 provenance

`60 / 70 / 80 / 90 / 100 × entry / rifler / awp / lurker / igl × 16 fixed seeds = 400 arms`。

- focused verifier：`tools/check_cs_positioning_calibration_r42.mjs`
- suite digest：`800ffc3d60d2a9b216299577ca18d3e276f123085888d6a904b1e8817a957a0a`
- engine source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- production source modified：否；只使用 memory-only transform
- RNG、scenario、historical evidence：未改、未 rebaseline

## 每增加 10 點的 local effect

| role | combatSkill（平均） | aggr | raw role-fit |
|---|---:|---:|---:|
| Entry | +0.9767 | +0.0120 | 0 |
| Rifler | +1.2652 | +0.0120 | +2.00 |
| AWP | +1.6713 | +0.0120 | +2.00 |
| Lurker | +1.9878 | +0.0120 | +2.00 |
| IGL | +0.9870 | +0.0120 | 0 |

`aggr` 的一般公式斜率是 `0.12 / 100`，所以每 +10 點約 +0.012。高端遇到 effective clamp 後，90→100 約只剩 +0.0108。Combat 斜率包含既有 mechanics／weapon／holding／lurk 路徑；不能把它解讀成單一空間站位品質分數。

## Threshold 判讀

- Entry：整段約 `aggr 1.075→1.1218`，始終高於 threshold；不是 Positioning 新造成的撤退消失。
- Rifler：約 `0.9104→0.9572`，始終高於 threshold。
- AWP：約 `0.6384→0.6852`，始終低於 threshold，仍保留撤退 eligibility。
- Lurker：`90→100` 約 `0.8136→0.8244`，跨過 `aggr < 0.82`；高端 retreat trigger 變為 0。
- IGL：約 `0.7578→0.8046`，本輪沒有跨過 threshold。

因此主要 threshold danger 是 Lurker 的 `90–100`；IGL 雖未 crossing，但高端已靠近邊界。Positioning 與 Courage、APM 共用同一 `aggr < 0.82` 行為 gate，存在 downstream attribution／重疊風險，但本輪沒有修改 shared threshold。

## Clamp / 合理區間

- **穩定 range：60–90**；Lurker 的 90→100 另行視為 threshold-aware band。
- **推薦 pilot：60–90，90–100 僅作高端邊界觀測。**
- **clamp / saturation：90–100**。全部 target 的 effective Positioning 在 raw 100 受到上限 99；邊際 aggr 由 +0.012 降為 +0.0108。
- 沒有證據顯示現行 Positioning coefficient 需要修改；若未來調整，應另開單一係數 Sprint，不改 retreat threshold 或其他 stat。

## Gameplay identity 與重疊

目前 production 確實讀取距離、牆／LOS、煙霧與 pair admission，但這些是通用 combat context；Positioning stat 本身沒有直接改變 cover、LOS、teammate spacing、enemy spacing、advantageous position 或 reposition。結論是：**數值 calibration 可做，完整站位 gameplay identity 尚未成立。**

Positioning 與 Courage／APM 都會進 `aggr` 並共同影響 retreat；Courage 偏「敢不敢打」、APM 偏操作節奏、Positioning 偏 combat／role-fit 輸入，但 shared threshold 使結果 attribution 必須分開記錄。Map Awareness 與 Decision 的直接 spatial／choice consumer 本輪沒有被新增或合併。

## Production 判定與 gates

- production patch：無
- R42 focused verifier：PASS（aggr 20/20；raw role-fit applicable roles = rifler／awp／lurker）
- R20、R22、R38、R39／R40／R41 methodology：沿用
- historical／progress／reward／Q7a／build／review：本 Sprint 變更後重跑

**Positioning verdict：Calibration Ready（受限 local pilot）＋ Gameplay Identity Incomplete。**
本報告結論：Positioning 可進入受限 local calibration pilot；不修改 production balance，且 gameplay identity 仍不完整。
