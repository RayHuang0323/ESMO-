# R39 CS 反應力正式 Calibration Pilot

## 範圍

本輪只量測 Reflex（`stats.rxn`）。不修改其他 15 項素質、RNG、scenario、role mapping、combat architecture 或 balance constant。

## 固定實驗

- scenario：`inferno / t_aexec / c_std`
- roles：T-side `entry / rifler / awp / lurker / igl`
- sweep：raw Reflex `60 / 70 / 80 / 90 / 100`
- 每個 role、每個 level 使用同一組 16 fixed seeds；共 400 arms
- 每個 arm 都執行 instrumentation-off、on、repeated-on，確認結果與事件 digest 不變
- production source 只讀取並以 Vite memory transform instrument；不寫入 `src/`

## 分層 KPI

### Level 1（主要）

`effectiveReflex`、`combatSkill`、mechanics、weapon、raw role-fit / `posSkill`。
相鄰每 10 點的 paired difference 與 strict-majority 是主要 calibration gate。

### Level 2

target-player 的合法 pair opportunity coverage。它是路徑觀察，不直接當作 Reflex balance KPI。

### Level 3

target-side `Pt`、attacker resolution、attacker conversion、有效傷害。`Pt` 與 direct combat 的 attribution 分開記錄。

### Level 4（次要）

kills、damage、survival。回合／整場結果可能受離散 attacker branch、alive count、economy 與 route amplification 影響，不作主要 monotonicity gate。

## 判定規則

- direct `combatSkill` 每個 role、每個相鄰區間均須保持正向 strict-majority。
- 90→100 若因 `persStat` clamp 變成較小斜率，標記 saturation boundary，不調整 coefficient 掩蓋。
- 若 entry 的 direct slope 沒有明顯高於 rifler / IGL，不視為 entry bonus 過度放大。
- 只有在 direct local KPI 不合理時，才提出單一 Reflex coefficient / clamp 的最小 patch；否則保持 production 零 diff。
