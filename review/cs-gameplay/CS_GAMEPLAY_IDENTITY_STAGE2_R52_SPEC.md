# R52 CS Gameplay Identity：四項 consumer coverage closure 規格

## Scope

R52 只量測既有 CS production consumer 的可觀測性與歸因邊界：

- Adaptability (`adp`)
- TacticalIQ (`tac`)
- Comms (`com`)
- Synergy (`coo`)

本 Sprint 不修改 `src/battle/fps/EsportsFPS3D.jsx`、balance、role mapping、scenario、RNG、contract、Store、Progress、reward 或 Learning lifecycle。verifier 以 Vite memory transform 注入 collector，production source 只讀取現有 consumer。

## Fixed evidence

- Scenario：`inferno / t_aexec / c_std`
- 16 fixed seeds；Level 2 opportunity 與 Level 3 immediate action 分層；Level 4 match result 只作 secondary observation
- 每項必須通過 off / on / repeated-on deterministic、input immutability、treatment isolation、threshold/clamp、role attribution、consumer marker 與 digest
- 靜態 `rand()` call sites 必須維持 21；不得新增 RNG

## Readiness rule

- `Calibration Ready - Limited`：primary / secondary 都有 opportunity 與 action，且兩層的 strict-majority monotonicity 成立。
- `Measurement Ready - Coverage Limited`：已有真實 consumer 與可歸因 action，但任一 layer 缺少 strict-majority、secondary coverage 或跨 role exposure。
- `Deferred`：沒有可觀測 consumer opportunity。

R52 的目標是把四項的 current consumer evidence 鎖定，不把 sparse coverage 或 Level 4 結果誇大為完整 calibration。
