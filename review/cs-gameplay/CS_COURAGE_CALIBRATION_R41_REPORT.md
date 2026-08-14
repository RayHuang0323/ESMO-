# R41 CS 勇氣 Calibration Pilot 報告

## 結論先說

Courage 的主要 live consumer 是 `aggr`，而不是五個 role 都有同等的 combatSkill bonus。每增加 10 點 effective Courage，`aggr` 約增加 `+0.05`；這比 APM 的斜率大，且會把部分角色推過既有 `aggr < 0.82` retreat gate。因此 Courage 可以進入 local Calibration Ready，但必須使用 threshold-aware 區間，不應把整個 60–100 當作普通線性平衡區間。

## Sweep 與 provenance

`60 / 70 / 80 / 90 / 100 × entry / rifler / awp / lurker / igl × 16 fixed seeds = 400 arms`。

- focused verifier：`tools/check_cs_courage_calibration_r41.mjs`
- suite digest：`6f6e54d56845e2b7b4d9554eaf9568bcba9af337293993af9664aa9c88b3912f`
- engine source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- production source modified：否；只使用 memory-only transform
- RNG、scenario、historical evidence：未改、未 rebaseline

## 每增加 10 點的 direct effect

| role | effective Courage | aggr（一般區間） | Courage-specific combat / role-fit |
|---|---:|---:|---:|
| Entry | +10 | +0.05 | combat 約 +0.83；raw role-fit 約 +3.33 |
| Rifler | +10 | +0.05 | 沒有 Courage-specific combat / role-fit consumer |
| AWP | +10 | +0.05 | 沒有 Courage-specific combat / role-fit consumer |
| Lurker | +10 | +0.05 | 沒有 Courage-specific combat / role-fit consumer |
| IGL | +10 | +0.05 | 沒有 Courage-specific combat / role-fit consumer |

Entry 的 combat 斜率來自既有 raw role-fit 與 `opts.entry` 的 Courage bonus；其他角色 sweep 中看到的 combat／Pt 波動是 `aggr` 與 deterministic path spillover，不應誤報為直接 Courage combat arithmetic。

## Threshold 判讀

- Entry：整個 sweep 都在 `0.82` 以上，不會撤退；這是既有 Entry aggressive profile 與 Courage 的組合。
- Rifler：60 點時約 `aggr=0.8204`，已略高於 threshold；本輪沒有 crossing，但非常接近邊界。
- AWP：60–100 約 `0.5924 → 0.7924`，始終低於 threshold；仍保留 retreat eligibility。
- Lurker：`80→90` 約 `0.8088 → 0.8588`，跨過 threshold；90 以上 retreat trigger 變為 0。
- IGL：`80→90` 約 `0.7870 → 0.8370`，跨過 threshold；90 以上 retreat trigger 變為 0。

所以 `80–90` 是主要行為模式切換區，不是普通線性區；高 Courage 會讓 Lurker／IGL 在目前 scenario 中幾乎不再撤退。這是既有 threshold 的結果，R41 不修改 threshold 或 retreat system。

## Clamp / saturation 與合理區間

- **穩定區間：60–80**。不把 Lurker／IGL 推過 retreat gate，適合比較一般 Courage 斜率。
- **推薦 pilot 範圍：60–80；80–90 僅作 threshold-aware pilot。**
- **threshold danger：80–90**。Lurker、IGL 發生 gate crossing；Rifler 也在 60 點貼近邊界。
- **clamp / saturation：90–100**。Entry 的 aggressive `+6` personality adjustment 使 effective Courage 在高端由 96 只到 99，`aggr` 邊際從 +0.05 降到 +0.015；其餘 role 高端也可能因 effective clamp 只增加 +0.045。

## Role 與是否過強

Entry 最吃 Courage，因為同時有 raw role-fit 與 Entry combat bonus；這是既有雙 exposure，值得日後另做 attribution，但本輪沒有證據要求改 coefficient。Lurker／IGL 不是 combat arithmetic 最強，卻最容易因 `aggr` crossing 進入「不撤退」模式。AWP 的 Courage 主要體現在 aggr／retreat，不是直接 sniper combat power。

現有公式不需要在 R41 修改。若未來要調整，應另開只針對 Courage coefficient 的小 Sprint，並把 80–90 threshold 區間與 90–100 clamp 區間分開處理；不可順手改 retreat threshold。

## Gate 結果

- R41 focused verifier：PASS（aggr 20/20 strict-majority；Entry combat／raw role-fit 各 4/4）
- R23 Courage measurement、R22 framework、R38 status：沿用並通過
- historical／progress／reward／Q7a／build／review：本 Sprint 變更後重跑

**Courage verdict：Calibration Ready（threshold-aware local pilot）；不是最終 balance Done。**
本報告結論：Courage 可進入 threshold-aware local calibration pilot；不修改 production balance。
