# R53 CS 16 項 Coverage Closure + 整合驗收規格

## Scope

R53 將 R52 已建立的四項 current production consumer evidence 收斂成 CS 16 項最終狀態矩陣：

- `adaptability` / 應變力
- `tacticalIQ` / 戰術理解
- `comms` / 溝通
- `synergy` / 配合度

本輪只補 closure observability 與 verifier-level integration evidence，不新增 production consumer，不改 fixed seeds、`inferno / t_aexec / c_std`、RNG、balance coefficient、role map、scenario、賽季／賽事、contract、Progress、reward 或 Learning system。

## Coverage closure rule

四項都已有真實 consumer、Level 2 opportunity 或可辨識的 scenario boundary、以及 Level 3 action evidence。若不足來自 fixed scenario 的 secondary layer、role exposure、threshold 或 path observability，而非 consumer 缺失，狀態收斂為 `Calibration Ready - Limited`，並在矩陣保留 `Coverage Limited` caveat；不人工製造 opportunity，也不以 kills、winner 或 Level 4 結果替代 Level 2/3。

若沒有可歸因 consumer 或 action evidence，才保留 `Deferred`。本輪沒有此類新增項目；`learning` 維持唯一 `Lifecycle`。

## 16 項狀態規則

狀態只能使用：`Calibration Ready`、`Calibration Ready - Limited`、`Measurement Ready - Coverage Limited`、`Deferred`、`Lifecycle`。R53 focused verifier 必須確認 16 個 unique canonical keys、production consumer markers、static RNG call sites = 21、R46 distribution digest 與四項 R52 suite digest。

## Acceptance boundary

R53 的 `Calibration Ready - Limited` 代表可進第一版正式角色能力分布／實戰驗收，並非宣稱所有 role、scenario、secondary layer 都已完成 calibration。若要補齊 post-plant、retake、cross-role communication、T-side coordination 或 Learning，另開對應 Sprint；不在 R53 偷渡 balance 或大型 AI。
