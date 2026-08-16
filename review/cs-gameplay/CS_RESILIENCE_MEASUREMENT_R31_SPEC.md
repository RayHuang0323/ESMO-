# R31 CS「韌性／抗壓」量測與校準準備度規格

日期：2026-08-13

## 範圍

本 Sprint 只做 CS `Resilience` 的 production read-chain audit 與 R22 local causal measurement。正式 gameplay、balance、RNG、scenario、contract、歷史 baseline 與其他 15 項素質均不修改；不碰 SeasonState、Circuit、Event 或 competition 系統。

固定情境為 `inferno / t_aexec / c_std`，沿用 R22 的 16 fixed seeds（seed-set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`）。對 T-side 五個 target role（entry、rifler、awp、lurker、igl）各做 raw Resilience low / baseline / high（±10）處理；baseline 與每個 treatment 都以 off / on / repeated-on 驗證，共 176 logical arms、528 simulator executions。

## Production read-chain 邊界

| 層次 | 實際讀取 | R31 產品解讀 |
|---|---|---|
| raw Resilience | `p.stats.res` | 原始能力資料；目前沒有任何 `posSkill` role-fit 權重。 |
| effective Resilience | `persStat(p,"res")` | 只在 live `combatSkill()` 的 `lastAlive` 分支讀取；人格 boost/nerf 後 clamp 到 1–99。 |
| lastAlive consumer | `(S("res") - 76) * 0.12` | 殘局時的實戰 combat cofactor；與 `str` 的 Clutch cofactor 同一分支但係數不同。 |
| low HP | `opts.lowHP` | 目前只讀 `str`；Resilience 沒有 low-HP modifier。 |
| role-fit | `posSkill()` | 角色 profile 沒有 `res`；變更 Resilience 不改 role-fit。 |
| aggr / retreat | `aggr()` | 只讀 `cou`、`str`、`apm`、`pos`；沒有 Resilience，因此沒有 retreat / re-engage consumer。 |
| defuse / utility / target / tactic / buy | production source slice | 沒有 Resilience read。 |
| morale / condition | `formMul()` | 只縮放 combat output，不改 `persStat(res)`；是 state output boundary，不是 Resilience adjustment。 |

## R22 四層量測

1. Level 1：raw/effective read、role-fit、normal/lastAlive combat、lastAlive bonus、low-HP boundary、local duel `Pt` 與 aggr boundary。
2. Level 2：真實 `lastAlive` opportunity、low-HP opportunity、1v1 / 1vN coverage。
3. Level 3：pair admission、conversion、damage / kill chain；機會與立即轉換分開記錄。
4. Level 4：round result、survival、kills、damage、winner 只作 secondary observation。

所有 collector 都是可逆 memory transform；off / on / repeated-on 的 simulation output 必須完全相同，輸入不可被改寫，`rand()` token sequence 必須維持 21 個 call sites。

## readiness gate

使用 R22 `monotonicity`、strict-majority（16 seeds 至少 9）、paired effect、clamp、threshold crossing、changed-seed 與 `classifyCausalReadiness`。Level 1 直接 consumer 應可量測；Level 2/3 必須有足夠 opportunity 與穩定 immediate conversion 才能進 calibration；Level 4 不作 primary gate。

本輪只產生 evidence。若發現 Clutch / Resilience 的 lastAlive ownership 需要產品決策，另開 semantic Sprint，不以 balance 調參或新增 gameplay 掩蓋。
