# R43 CS 準確度（Accuracy）Calibration Pilot 規格

## 範圍

本 Sprint 只量測 CS 既有 Accuracy read-chain，不新增 miss/hit branch，不改 weapon、recoil、spread、RNG、scenario 或其他素質平衡。Accuracy 的產品語意維持為「已進入合法交戰後的射擊品質、傷害品質與爆頭品質」，不是完整命中率。

## 測量設計

- 地圖／戰術：`inferno`／`t_aexec`／`c_std`
- 角色：Entry、Rifler、AWP、Lurker、IGL
- raw Accuracy：60、70、80、90、100
- 每角色每 level 使用相同 16 個 fixed seeds，共 `5 × 5 × 16 = 400` arms
- 每個 arm 都跑 instrumentation-off、instrumentation-on、repeated-on；輸入、模擬結果與事件 digest 必須一致
- seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`

## 三條獨立作用路徑

1. Raw role-fit：`posSkill()` 讀 raw `stats.acc`；Entry、Rifler、AWP 有 profile weight，Lurker／IGL 沒有 Accuracy role-fit weight。
2. Effective combat：`persStat(p,"acc")` 進 mechanics、weapon 與 combatSkill，並反映在合法 duel 的 `Pt`。
3. Headshot：既有 firearm exchange 使用 effective Accuracy 計算 headshot chance；實際 headshot 次數只作 secondary RNG observation。

`aggr` 沒有 Accuracy read，且不作為 Accuracy 的 gameplay consumer。現有 firearm exchange 沒有獨立 miss branch，因此不把 hit rate 或 landed-shot rate 當主要 KPI。

## Gate

主要 gate 是 effective Accuracy → combatSkill、headshot chance、local duel opportunity 的 direction、strict-majority、effect size、clamp/saturation 與 role coverage。整場 kills、damage、survival 與 winner 只作次要觀察；不得以它們的非單調性推翻 local causal 結果。

## 允許的結論

若 60–90 的 direct local effect 穩定，保留作 stable pilot range；若 effective stat 在 99 clamp，90–100 另列 high-end diminishing-return band，不視為普通線性區間。沒有充分 evidence 時不修改 production coefficient。
本規格結論：R43 只驗證既有 Accuracy identity，不擴充命中、後座力或移動射擊系統。
