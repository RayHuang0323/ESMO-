# R51 CS Gameplay Identity 第二階段規格：Leadership × Synergy

## Scope

本 Sprint 只處理正式素質：

- 領導力／Leadership：led
- 配合度／Synergy：coo

不修改九項成熟 calibration，不碰 Adaptability、TacticalIQ、Comms、Learning、賽季／賽事系統；每項最多新增一個第二層 consumer。

## Production consumers

### Leadership

沿用既有 finalizeKill 與 teammate route reassignment。leadershipFollowUpAfterKill() 尋找存活 IGL 與一名隊友；當 IGL effective led >= 90 時，使用 IGL 既有 route 的下一個 anchor 與既定目標建立 follow-up route，並寫入既有 ROTATE／route state。

這是「隊友倒下後的執行一致性」consumer，不是 command AI、morale、dynamic tactic switching 或 strategic learning。

### Synergy

沿用既有 visible trade pair、synergyTradeCandidate() 與 partner ENGAGE。synergyCoverFollowUpRoute() 使用 partner 與 victim 的既有座標，計算 attacker 的固定 cover follow-up route，寫入既有 route／ROTATE state。

這是單一 immediate cover follow-up，不是完整 crossfire、assist accounting、utility coordination 或 coordination engine。

## Measurement

tools/check_cs_gameplay_identity_r51.mjs 必須以 --item=leadership 或 --item=synergy 單項執行，固定：

- inferno / t_aexec / c_std
- R22 固定 16 seeds
- low / baseline / high
- off / on / repeated-on deterministic instrumentation
- Level 2 opportunity 與 Level 3 immediate action 分開
- role attribution、local monotonicity、effect size、threshold、clamp、changed seeds、digest
- input immutability、RNG static call sites、production consumer marker

Level 4 match result 只作 secondary，不合併兩項 evidence。

## Readiness rule

- Calibration Ready-Limited：applicable IGL／pair coverage 足夠，L2/L3 local evidence 通過 strict-majority，且 threshold／clamp boundary 明確記錄。
- Measurement Ready / Deferred：雖有 L2/L3 行為，但 opportunity monotonicity、role coverage、threshold exposure 或 conversion 不足。

coverage 不足不得用零 evidence、match result 或 role-fit 代替。
