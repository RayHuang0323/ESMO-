# R45 CS 四項批次 Calibration Pilot 報告

## 結論

本輪完成 4 個 stat、5 個 T role、5 個 sweep level、16 fixed seeds，並另做 Focus / Decision 的 CT 五角色拆彈 arms，共 2,400 次 deterministic simulation。所有 hooks 都是 memory-only；production source、balance constants、RNG、scenario、historical evidence 均未修改。

Production source 的 canonical label 是 `str = 抗壓`、`res = 韌性`。既有產品語意仍把 legacy `str` 當作 Clutch／殘局能力；這是產品映射，不是本輪改名。

## 每 +10 的 local 斜率（60→100 四段平均）

| stat | Entry | Rifler | AWP | Lurker | IGL | 主要作用 |
|---|---:|---:|---:|---:|---:|---|
| Focus combat | +0.694 | +0.864 | **+1.869** | +0.677 | +0.677 | effective combat；AWP holding 額外 +0.487（共 +2.357） |
| Decision combat | +0.400 | +0.390 | +0.330 | **+0.763** | +0.670 | effective combat；raw role-fit 只在 Lurker(4)、IGL(3) |
| Clutch (`str`) normal | +0.974 | +0.974 | +0.932 | +0.974 | +0.880 | mechanics；role-fit 除 IGL 外存在 |
| Clutch (`str`) lastAlive | +3.119 | +3.119 | +2.747 | +3.119 | +3.025 | 主要 lastAlive / 1vN local combat ownership |
| Resilience (`res`) normal | 0 | 0 | 0 | 0 | 0 | 不提供一般對槍 bonus |
| Resilience (`res`) low-HP | +1.170 | **+1.200** | +1.170 | +1.170 | +1.170 | 既有 low-HP stability retention |

`Pt` local conversion 斜率：Focus 約 +0.009～+0.031、Decision 約 +0.004～+0.010、Clutch 約 +0.011～+0.013；Resilience 為 0，因其只在 low-HP combat formula 中保留穩定性，不直接改一般 Pt。

## 各項判定

### Focus（專注力）

- raw role-fit：Rifler weight 2、AWP weight 4；Entry/Lurker/IGL 沒有 raw Focus role-fit。
- effective consumer：combat、holding、CT defuse。R44 已把 defuse 從 raw 改為 effective，R45 沒再改 wiring。
- AWP 最吃 Focus；holding exposure 會再增加約 +0.49 / +10。Rifler 次之。
- 60–90 是穩定 pilot 區；90–100 有 effective 99 clamp 風險（Entry 未碰到，其他多數 personality 會碰到）。CT defuse progress 的實際 tick 很稀疏，不能用整場 tick 單調性當主要 gate。
- 狀態：**Calibration Ready - Limited**（direct / holding 足夠；defuse coverage 仍窄）。

### Decision（決策力）

- raw role-fit 只在 Lurker 與 IGL；combat 使用 effective Decision 約 4% consumer。
- CT defuse 已使用 effective Decision；沒有 target selection、route、utility timing、retreat、bomb choice、tactic 或 aggr consumer。
- 60–100 的 combat slope 近似線性；AWP 最小、Lurker 最大。拆彈的 progress/tick 受 opportunity path 影響而斷續，故不把 sparse runtime 當全面平衡證據。
- 狀態：**Calibration Ready - Limited**（combat direct 清楚；defuse runtime coverage 限制）。

### Clutch（殘局能力；legacy `str` canonical label 為「抗壓」）

- `str` 有 mechanics、raw role-fit、aggr、low-HP 與 lastAlive consumer；真正的 lastAlive active ownership 仍由 Clutch 持有。
- 五 role 都有 lastAlive opportunity（每 role sweep 合計約 191～711）；這是局部機會，不等於回合勝率。AWP 的 lastAlive slope 稍低，IGL 沒 raw role-fit。
- Lurker 的 aggr 由 80→90 跨過既有 `aggr < 0.82` retreat gate（0.8132→0.8352），這是 shared downstream threshold，不是 Clutch 專屬新 threshold。高端 90→100 另有 effective 99 clamp。
- 建議 stable 60–80；80–90 只做 threshold-aware pilot；90–100 視為 clamp / 行為切換區。
- 狀態：**Calibration Ready - Limited**（lastAlive coverage 已有；threshold / 1vN path 仍限制）。

### Resilience（韌性；`res`）

- 沒有 raw role-fit，沒有 aggr / retreat / defuse / utility / target consumer。
- R33 ownership boundary 維持：`res` 不再加 lastAlive direct bonus，只在既有 low-HP penalty 中提供穩定保留；因此與 Clutch 不共用 lastAlive direct bonus。
- 五 role 的 low-HP local opportunity 都有覆蓋（約 649～1,587）；每 +10 約 +1.17～+1.20 retained combatSkill，正常 combat 與 Pt 為 0 slope。
- 狀態：**Calibration Ready - Limited**（low-HP local formula 可量測；沒有更廣 pressure state，不能宣稱完整抗壓系統）。

## Clamp、threshold、coverage

- Effective clamp 是共同 high-end 風險：Focus/Decision 多數 role 在高值碰 99；Clutch 幾乎各 role 都有 clamp；Resilience 除 Rifler 外多數 role 在 sweep 中可見 clamp。
- 唯一明確 retreat crossing 是 Clutch/`str` 的 Lurker、80→90；Focus、Decision、Resilience 不讀 `aggr`，沒有 stat-specific crossing。
- Level 4 kills / damage / winner 未作 primary gate；R22 local direct / opportunity / conversion 才是本輪 evidence。

## Production 與下一步

- production patch：**無**。沒有為了留下 diff 而調 coefficient；RNG call sites、scenario、historical digest 均不變。
- 目前 CS 16 項中，先前完整 `Calibration Ready` 為 4 項（Reflex、APM、Courage、Accuracy）；Positioning 是受限 Ready；本輪四項新增為 **Calibration Ready - Limited**，不是最終 balance Done。
- 下一批最適合一起做：先做 Accuracy / Focus 的射擊品質與 holding 對照、Decision / Clutch 的 local conversion 對照，再單獨做 Resilience low-HP pilot。不要把 Resilience 與 Clutch 合併成同一 bonus。

## Gate 結果

- focused R45 verifier：PASS（2,400 simulations；repeated digest；suite digest `d3449641722a2d3bd02f19e453c8a296ee0a258b41659b3e566ebc470be326d2`）
- production source SHA：`80a6ef4e776c825f602f5b41a8a7d9e6c97546dd157e87de2e6f4e3e69fced5e`
- relevant R24–R44 / R22 / historical / progress / Q7a / build / review：待 R45 末段統一重跑並記錄。

## Final closure review（2026-08-15）

- 已核對 `tools/.verify-state.json`：R22、R24、R26、R27、R28、R30、R31、R32、R34、R35、R36、R37、R38、R39、R40、R41、R42、R44、historical、progress、Q7a 與 build 均已有 exit code 0 / PASS checkpoint；不重跑既有 calibration 或昂貴 aggregate。
- R45 focused verifier 本身已有 exit code 0 / PASS checkpoint，2,400 simulations 與本報告 suite digest `d3449641722a2d3bd02f19e453c8a296ee0a258b41659b3e566ebc470be326d2` 一致。
- 狀態檔中的 R43 calibration 失敗為既有 Sprint 的 Windows memory-allocation exit `3221226505`，不改寫 R43 證據、不在 R45 重做 calibration；R24 focused measurement 仍為 PASS。
- 本次 review 僅完成 checkpoint / diff / verifier source audit；沒有降低 gate、改 seed、rebaseline、跳過失敗項或修改 production balance。

**R45 verdict：Go（local calibration pilot）；四項均為 Calibration Ready - Limited，無 production patch。**
