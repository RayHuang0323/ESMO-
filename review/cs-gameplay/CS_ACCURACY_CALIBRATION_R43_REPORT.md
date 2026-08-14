# R43 CS 準確度（Accuracy）Calibration Pilot 報告

## 結果摘要

focused verifier：`tools/check_cs_accuracy_calibration_r43.mjs` PASS。400 arms（5 roles × 5 levels × 16 seeds）全部通過 instrumentation-off/on/repeated-on、輸入不變、RNG token sequence 不變與 deterministic event digest gate。

- schema：`CsAccuracyCalibrationPilotR43.v1`
- engine source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- suite digest：`4ac077fd277cf742ee46ee79c32439ee3e98c73e279124a6377f21a84771ed00`
- production source modified：否（memory-only transform）
- miss branch：不存在；沒有把 hit rate 當 KPI

## 每增加 10 點的 local effect

下表是四個相鄰區間的平均每 10 點差異（60→70、70→80、80→90、90→100），由 16 個 paired seeds 計算；主 KPI 是 direct local consumer。

| Role | combatSkill / +10 | headshot chance / +10 | local duel Pt / +10 | raw role-fit / +10 |
|---|---:|---:|---:|---:|
| Entry | 0.236445 | 0.002597 | 0.003042 | 0.133333 |
| Rifler | 0.281710 | 0.002439 | 0.003503 | 0.333333 |
| AWP | 0.276829 | 0.002221 | 0.003945 | 0.333333 |
| Lurker | 0.213429 | 0.002203 | 0.002725 | 0 |
| IGL | 0.237653 | 0.002182 | 0.002969 | 0 |

五個角色的四個相鄰區間，combatSkill、headshot chance 與 local Pt 都是 strict-majority 正向。AWP 的 weapon branch 是 sniper：Accuracy 權重為 `0.45`，和 rifle `0.42`、pistol `0.55` 不同；因此 AWP 的 Accuracy scaling 不是單純沿用 Rifler 的數字。實際高端差異仍受武器組成與 personality 調整影響。

## Clamp、線性區間與角色差異

- 60–90：五個角色的 effective Accuracy direct effect 穩定、方向一致，建議作 stable pilot range。
- 90–100：Entry、Rifler、AWP、Lurker 的 effective Accuracy 由 100 進入 99 clamp，combat 與 headshot 的最後一段邊際效果下降；應標記為 high-end diminishing-return band。
- IGL 的 personality adjustment 使 effective Accuracy 為 56／66／76／86／96，沒有碰到 99 clamp，但仍不宜把 90–100 與中段視為完全同斜率。
- Raw role-fit 只有 Entry、Rifler、AWP；Lurker、IGL 的 Accuracy 作用來自 effective combat/headshot，不應捏造 role-fit。
- `aggr` 在五角色與所有相鄰區間均無 Accuracy delta；Accuracy 不控制 fire／retreat threshold。

## Gameplay identity 判定

目前 Accuracy 可以校準的 identity 是：合法交戰成立後的射擊品質、combatSkill／局部 duel quality、effective damage quality 與 headshot quality。它仍不是完整命中率，因為 firearm exchange 沒有獨立 miss determination。recoil、spread、first-shot、movement accuracy 也不在本 Sprint。

## Production 與 gate

本輪沒有 production patch；現有 coefficient 與 headshot scaling 證據足以進入 calibration-ready 狀態，不需要為了留下 diff 而改公式。R24、R25、R22、R38 及本輪 focused gate 均 PASS；R39–R42 只沿用其 local causal 方法，未重設 historical evidence。整場 kills／damage／survival 仍只作 secondary observation。

**Verdict：Go／Calibration Ready（local pilot 完成）；不啟動 miss system。**
本報告結論：Accuracy 可進入受控 calibration，90→100 必須保留 clamp-aware 解讀。
