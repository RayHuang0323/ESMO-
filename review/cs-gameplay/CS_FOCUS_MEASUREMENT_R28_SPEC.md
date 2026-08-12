# R28 CS Focus Measurement / Calibration Readiness 規格

日期：2026-08-13

範圍：只量測 Focus 的 production read-chain 與 local causal readiness；不做 balance calibration，
不新增 Focus gameplay。

## 1. 產品語意與 production 邊界

Focus（專注力）代表選手在既定行動中維持注意力與穩定執行的能力。名稱不代表它已控制
utility、retreat、clutch 或完整壓力 AI；所有結論以 production read-chain 為準。

| 邊界 | 正式語意 |
|---|---|
| raw Focus | `player.stats.foc`；穩定基礎值，供 rifler / awp `posSkill()` role-fit，並供 CT defuse progress |
| effective Focus | `persStat(player,"foc")`；personality 調整後 clamp 1～99 的 live execution value |
| state-adjusted Focus | 不存在；morale / condition 經 `formMul()` 只乘 final `combatSkill`，不改 Focus |
| role-fit consumer | `posSkill()` 的 rifler / awp profile 直接讀 raw Focus；其他三個 T roles 不讀 Focus |
| live gameplay consumer | effective Focus 進 mechanical `combatSkill()`、AWP weapon fit 與 holding bonus，再影響 duel `Pt` |
| defuse consumer | 通過 proximity / uncontested gate 後，raw Focus 以 `/250` 線性增加 defuse progress |

## 2. 必查 negative consumers

Verifier 必須以 source slice 證明 Focus 不讀取：

- target / engagement pair selection；
- retreat / re-engage 與 `aggr()`；
- utility timing；
- plant / bomb-state choice、purchase、role-route、tactic choice；
- lastAlive clutch / resilience branch。

## 3. Deterministic measurement

- Scenario 固定：`inferno / t_aexec / c_std`。
- 五個 T roles：entry、rifler、awp、lurker、IGL。
- 每次只改 target raw `stats.foc`：low / baseline / high = baseline -10 / baseline / baseline +10。
- 16 fixed seeds，沿用 R22 seed set：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- 每個 arm 執行 off / instrumented / repeated-instrumented，共 528 次 simulation。
- instrumentation 只能使用 exact reversible Vite memory transform；production source、RNG token
  sequence、scenario、input roster 其餘欄位與完整 simulation output 必須不變。

## 4. R22 四層 gate

### Level 1 — direct consumer

- raw / adjusted / effective Focus 與 personality adjustment；
- raw role-fit output 與 Focus weight；
- effective Focus 對 `combatSkill` 與 isolated duel `Pt`；
- morale=40 control：effective Focus 不變，只有 final combat output 乘 0.83；
- clamp / saturation reads。

### Level 2 — local opportunity

- combat pair candidate / admitted exchange；
- target attacker / defender attribution；
- CT bomb tick、proximity、uncontested progress gate；
- utility opportunity 只作 non-consumer control，不作 Focus effect。

### Level 3 — immediate action / conversion

- primary：effective Focus → combatSkill → local duel `Pt`；
- secondary：target attacker conversion；
- independent defuse progress / completion branch。

### Level 4 — downstream outcome

Kills、damage、survival、round result 只作 secondary observation。不得用 Level 4 取代 direct/local
gate，也不得把 deterministic path amplification 誤稱為 Focus arithmetic 失效。

## 5. Readiness / semantic boundary

- strict-majority 固定為 `passingSeeds > totalSeeds / 2`；8/16 不通過，9/16 才算通過。
- raw role-fit 與 effective live combat 是不同 consumer；不得用其中一條推論另一條。
- 現行 defuse formula 讀 raw Focus，而 combat 讀 effective Focus；若 personality 對 Focus 有調整，
  這是 semantic boundary risk。R28 只保留證據，不直接修 production。
- 若 full-product calibration 仍缺 CT-side Focus treatment、defuse action attribution 或被 path
  amplification 主導，結果維持 Deferred / No-Go。

## 6. 限制

- 不修改 Focus balance constant、role mapping、scenario、RNG、contract、Store、Progress、Replay 或 UI。
- 不處理 Decision calibration、Accuracy miss system、Reflex、Positioning、APM、Courage、MapAware、
  Synergy、Learning 或其他 stat。
- 不 rebaseline R1～R27 historical evidence。

## 7. Provenance

- Verifier：`tools/check_cs_focus_measurement_r28.mjs`
- Live source：R27 checkpoint `f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`
- Historical check：`csR27R26Source()` 還原 R26 source SHA `68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`
- Static RNG call sites：21
- Expected suite digest：`7f6e08393a54d5c594bd9c9abce49adbf70a9a6297a197fe4d9624151b4b69a0`
