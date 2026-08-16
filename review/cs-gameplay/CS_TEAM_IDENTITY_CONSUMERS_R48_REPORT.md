# R48 CS Team Gameplay Identity Sprint 報告

## 結論

R48 建立三個最小 production team consumers，均使用既有事件與 simulator state，沒有新增 RNG、scenario 或大型 AI。三項均具 Level 2 opportunity 與 Level 3 immediate action evidence，可進入下一階段 Measurement Ready；尚不代表 calibration ready。

## Production consumers

| 素質 | 正式 key | production 行為 | L2 opportunity | L3 immediate action |
|---|---|---|---|---|
| 溝通 | `com` | visible contact 後，將 enemy route/aim handoff 給附近同隊玩家，support 優先 | visible enemy + teammate/support context | receiver 立即 route/aim adjustment |
| 領導力 | `led` | 高 `led` IGL 的既有 tactic route 供非 IGL 隊友保持 route consistency | IGL + tactic + existing route | teammate 採用 leader route |
| 配合度 | `coo` | visible trade pair 成立時，partner 對同一 enemy 立即 aim/ENGAGE/shoot | visible trade partner + LOS | partner immediate engage response |

本輪只改 `src/battle/fps/EsportsFPS3D.jsx` 的上述三個 consumer；沒有改九項 calibration 的公式、clamp、threshold 或 role profile。

## Fixed-seed 結果

Verifier：`tools/check_cs_team_identity_consumers_r48.mjs`。

- scenario：`inferno / t_aexec / c_std`
- fixed seeds：16
- treatment：各 target `82 / 90 / 98`（只改單一 key）
- RNG call sites：21；new RNG：false
- deterministic：off/on/repeated-on simulator output、event digest、input digest 均穩定
- role coverage：Comms support；Leadership 非 IGL teammate；Synergy 實際 teammate partner

### 溝通 `com`

| level | opportunities | actions |
|---|---:|---:|
| low 82 | 24 | 0 |
| baseline 90 | 24 | 24 |
| high 98 | 25 | 25 |

### 領導力 `led`

| level | opportunities | actions |
|---|---:|---:|
| low 82 | 644 | 0 |
| baseline 90 | 596 | 596 |
| high 98 | 592 | 592 |

### 配合度 `coo`

| level | opportunities | actions |
|---|---:|---:|
| low 82 | 230 | 0 |
| baseline 90 | 231 | 231 |
| high 98 | 222 | 222 |

Opportunity volume 受既有 deterministic combat path 影響，並非把 action 數硬寫成單調；verifier 另外檢查 low/baseline/high 的 action direction 與 action rate，避免 downstream path volume 造成誤判。

## Digest 與歷史 evidence

- Comms evidence digest：`7f2afd50f54dc5675afd3a3f3c3b470a6320c1988cb8ee88757f4eca86d3dabb`
- Leadership evidence digest：`aada5ecbd0231d8d0efb182362597d87bb633c3020d677a7e99b7ba0fae6b5cd`
- Synergy evidence digest：`88df38c5f26abd196d9169f02b6535eecd7e1a46a888ff21bd1fb13c632628ff`
- R48 suite digest：`8b498c39ca1d7d9e12ad233d31cea1b48e6f1f5e46fb8aa3c734a641a7e2a0ef`

Relevant historical gates remain unchanged and PASS：

- R16-A Synergy semantics：`db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022`
- R36 Comms：`9ff9597c75c8ba31c67339f92d72fed88c47a372f50a46e6d65cdc9c5d15866d`
- R36 Leadership：`768d6ae19153ab4c4ab84e60f2f47b7387ca3e5ecfb19f1c7a8b8e1bc9cb53cb`
- R36 Synergy：`a27d7f9dd7f3119b007579dd63ef4be9edcf181092604f9986f9ccf702a1002c`
- R38 identity boundary：`ff5eb36206399eedbcfa124f6c5ac0f12cf9033e36d56d488436cbb4ca163508`
- R47 existing identity consumers：`e3a90541390b52b254bd684496450909358218f630222efa1b3ba3ca56e636c1`

R38 的舊分類仍是 design-only historical checkpoint；R48 不重寫該報告，而以本報告與 R48 verifier 記錄新增 consumer。

## Safety / scope

- 沒有新增 RNG；固定 21 個既有 call sites。
- 沒有改 fixed seeds、scenario、九項 calibration、MapAware / Adaptability / TacticalIQ balance、season/competition。
- 沒有新增 command AI、callout system 或 coordination engine。
- historical / progress / reward / Q7a gates 於收尾階段逐一重驗。

## Verdict

R48：**Go（Measurement Ready）**。三項可進入下一階段 measurement / calibration evidence accumulation；calibration 數值仍需後續 exposure、threshold saturation 與 cross-role evidence，不能由本輪直接宣告完成。
