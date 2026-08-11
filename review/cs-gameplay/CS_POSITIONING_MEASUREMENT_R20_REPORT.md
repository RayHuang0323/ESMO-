# CS Positioning Measurement Completion R20 報告

日期：2026-08-12

## 結論

R20 measurement completion：`Go / PASS`。

Positioning calibration readiness：`Revise`（目前不可直接進 calibration）。

原因不是 positioning 沒有 read-chain，而是 read-chain 在 direct consumer 層可重現、在
retreat / pair / survival 的 match-level KPI 層受到 role baseline 與 `aggr < 0.82` 硬門檻、
alive / pair / kill / economy state path 放大；目前不能把結果宣稱為可靠的 monotonic
calibration signal。

本輪沒有修改 production source、RNG、stat formula、role mapping、balance constant 或
historical evidence。

## R19 checkpoint

R19 checkpoint `f26d4e0113d74740aa4883be3fa7a031dde84ea3` 已 push 至
`release/moba-combat-closure`。push 後確認：

- local `HEAD`：`f26d4e0113d74740aa4883be3fa7a031dde84ea3`
- tracking branch：`origin/release/moba-combat-closure`
- tracking SHA：`f26d4e0113d74740aa4883be3fa7a031dde84ea3`
- remote SHA：`f26d4e0113d74740aa4883be3fa7a031dde84ea3`

R20 改動仍只在 local，未 push。

## Verifier 與 evidence

- verifier：`tools/check_cs_positioning_measurement_r20.mjs`
- aggregate gate：`tools/verify.mjs` 的 `cs_positioning_measurement_r20`
- event schema：`CsPositioningMeasurementEvent.v1`
- scenario：`inferno / t_aexec / c_std`
- source SHA-256：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`
- static RNG call sites：21
- fixed seed set SHA-256：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- simulations：528
- suite digest：`6849de4fc39b6b8311c67e91411a7aaf6c1844e435c729c631c7d03e600f410c`
- accepted focused regression：第二次完整執行 digest 相同

coverage 包含 target-only retreat timing / trigger / displacement / re-engage、round
survival / death exposure、combat pair admission，以及 target 作為 attacker / defender 的
exchange attribution。每個 arm 都通過 off/on-1/on-2 exact result 與 repeated event
determinism。

## Read-chain audit

| read point | 實際語意與 evidence |
|---|---|
| `posSkill` | 使用 raw `p.stats` 與 role profile；是 role-fit aptitude，不是實際 live movement |
| `combatSkill` | `persStat(pos)` 進入 mechanics、weapon，以及 holding / lurk 情境；是 live combat contribution |
| `aggr` | `persStat(pos) × 0.12`，影響 retreat gate 與 pair fireChance |
| retreat | opportunity 先由 enemy distance / HP / mate 數暴露，再由 `aggr < 0.82` 決定 trigger；實際 `safeMove` displacement 上限為 3.2 |
| pair admission | pair distance / LOS / occupied slot 後，`fireChance` gate 決定 rejected / admitted；exchange 另記實際 attacker / defender |
| movement | route movement speed 目前讀 `sta`，不直接讀 `pos`；frame movement 只作 downstream observation |

semantic control probe：CT `ct3 / rifler / steady` 的 raw `pos=82`，`posSkill` 保留 raw
read；`combatSkill` 的 effective `persStat(pos)=88`。這證明 raw role-fit 與 effective live
consumer 是兩條可辨識的 read-chain，而不是把目前 `vis` 或某個單一輸出直接當成
positioning 完成態。

## Role-by-role 結果

以下為 16 seeds 的 aggregate；百分比以小數表示，`trigger` 是 target opportunity 通過
retreat gate 的 trigger rate，`reengage` 是 episode 中成功 re-engage 的比例，`pair` 是
combat pair fire-gate admission rate。`A/D` 分別是 target 作為 attacker / defender 的
實際 combat exchange 次數。

| role | level | combatSkill | aggr | trigger | avg displacement | reengage | survival | death exposure | pair | A / D |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| entry | low / base / high | 83.1171 / 84.3426 / 85.5629 | 1.0906 / 1.1050 / 1.1194 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | .3789 / .4451 / .4472 | .6211 / .5549 / .5528 | .4652 / .4644 / .4661 | 156/205 · 168/191 · 170/181 |
| rifler | low / base / high | 86.3047 / 87.8730 / 89.4941 | .9260 / .9404 / .9548 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | .1062 / .1220 / .1329 | .8938 / .8780 / .8671 | .4617 / .4771 / .4755 | 264/272 · 306/278 · 345/285 |
| awp | low / base / high | 84.1451 / 86.3886 / 88.0640 | .6480 / .6624 / .6768 | 1 / 1 / 1 | 3.1295 / 3.1251 / 3.1227 | .2857 / .3333 / .4000 | .6149 / .6159 / .6265 | .3851 / .3841 / .3735 | .5137 / .5040 / .5228 | 105/139 · 113/140 · 114/127 |
| lurker | low / base / high | 87.8560 / 90.0846 / 93.2253 | .7944 / .8088 / .8232 | 1 / 1 / 0 | 2.6516 / 2.6807 / 0 | .3409 / .3617 / 0 | .4765 / .4878 / .5696 | .5235 / .5122 / .4304 | .5012 / .4939 / .5227 | 235/181 · 225/179 · 227/153 |
| igl | low / base / high | 76.7488 / 77.7788 / 79.3025 | .7626 / .7770 / .7914 | 1 / 1 / 1 | 3.1202 / 3.1162 / 3.0558 | .3276 / .2727 / .2069 | .1265 / .1098 / .1598 | .8735 / .8902 / .8402 | .4340 / .4284 / .4380 | 164/273 · 152/267 · 198/268 |

### Direct chain

五個 role 的 effective position、`combatSkill` 與 `aggr` 都是 fixed-seed paired direct
monotonic：low → baseline → high 的 `effectivePos` 每次為 +12，`aggr` 每次為 +0.0144；
`combatSkill` 的 16-seed direction 也全部由 low 到 high 向上。這表示 positioning 的
direct read-chain 存在且可量測。

### Retreat / downstream chain

- entry 與 rifler 的 baseline `aggr` 已高於 0.82，因此三個 level 都沒有 retreat trigger、
  displacement 或 re-engage coverage；這兩個 role 不能用目前 retreat KPI 做 calibration。
- awp 的三個 level 都通過 gate，trigger coverage 存在；re-engage rate 由 `.2857 → .3333 →
  .4000`，但 effect size 小且事件數有限，仍不足以直接 balance。
- lurker 從 baseline `aggr=.8088` 到 high `aggr=.8232` 跨過 0.82；high level 的 16-seed
  retreat trigger 全部被 gate 擋下，造成 trigger / displacement / re-engage 的離散跳變。
  這是可證明的 clamp / threshold effect，不是單純 positioning continuous effect。
- igl 三個 level 都通過 gate，但 re-engage rate `0.3276 → 0.2727 → 0.2069` 與 survival
  / attacker exchange 受到 downstream state path 影響，沒有形成可直接拿來校準的穩定單調
  KPI。

pair admission 也不是一致的 role signal：high 相對 baseline 的 admission-rate 差異為
entry `+0.0027`、rifler `-0.0044`、awp `+0.0105`、lurker `+0.0166`、igl `+0.0107`。
因此 pair admission 可作 measurement read point，但不能在本輪升格為 balance KPI。

## Raw / effective 語意判定

R20 沒有發現需要立即修改 production 的 semantic ambiguity：

1. role-fit `posSkill` 使用 raw `stats.pos` 是合理且可由 profile / control probe 證明的。
2. live combat、`aggr`、retreat gate 與 pair admission 使用 effective `persStat(pos)`，
   也符合 live behavior 語意。
3. 實際 route movement 讀 `sta`，所以目前不能把 positioning 宣稱成直接控制跑速或所有
   frame displacement。

因此本輪不做 production patch；若未來要改命名，應維持最小 raw/effective boundary，不能
用調整 balance constant 代替語意釐清。

## Historical / production boundary

- R1～R19 historical evidence 保留，未 rebaseline。
- R19 checkpoint push 完成；R20 僅新增 verifier、spec、report、handoff 與 aggregate gate，
  尚未 push。
- production `src/` 沒有 diff；沒有新增 RNG、contract 或 stat formula 變更。

## Verification

- `node tools/check_cs_positioning_measurement_r20.mjs`：PASS
- accepted focused regression：PASS，suite digest exact equal
- `node tools/verify.mjs --only=cs_positioning_measurement_r20 --timeout=600000`：PASS
- historical checkpoint gate：14 個既有區段均已 PASS，`--resume` 無需重跑；沒有 rebaseline
- `npm.cmd run build`：PASS，Vite 5.4.21、2,643 modules；保留既有 large-chunk warning
- production source：未修改

## Decision

- R20 positioning measurement completion：`Go`
- positioning calibration readiness：`Revise / No-Go`
- production calibration patch：不提出
- blocking production issue：無
- non-blocking / readiness issue：retreat gate 對 baseline role 的 coverage 不均，且 lurker
  存在明確 0.82 threshold discontinuity；需要另外的 measurement / scenario design 後才可
  重新評估 calibration，不在本輪調參。
