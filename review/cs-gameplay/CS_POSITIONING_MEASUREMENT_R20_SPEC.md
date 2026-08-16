# CS Positioning Measurement Completion R20 規格

日期：2026-08-12

## 1. Scope 與邊界

R20 只完成 CS `positioning` 的產品語意確認、read-chain 追蹤與 focused deterministic
measurement。不得直接做 balance calibration，也不修改 production gameplay、RNG、其他 15
項 stat、role mapping、balance constant、contract、Store、Progress 或 historical evidence。

R19 Reflex 狀態在本輪固定為：

- semantic correction：`Done / Go`
- calibration：`Deferred / Revise`
- 原因：direct effect 正向，但 match-level deterministic path amplification 使目前 KPI 不具
  reliable monotonic calibration signal。

## 2. Positioning 產品語意

R20 將 positioning 分成兩條明確語意：

- `raw stats.pos`：選手原始走位能力／role-fit positioning aptitude 基礎值。
- `persStat(p,"pos")`：人格／狀態修正後，投入 live combat 與 positional decision 的
  effective positioning contribution。

既有 read-chain 定義如下：

```text
raw stats.pos
  └─ posSkill(profile, raw stats) ── role-fit / positioning aptitude
                                   └─ combatSkill role-fit component

raw stats.pos ── persStat(pos)
                  ├─ combatSkill mechanics / weapon / holding / lurk option
                  ├─ aggr()
                  │    ├─ retreat gate: aggr < 0.82
                  │    └─ fireChance → combat pair admission
                  └─ live combat state consequence

route movement speed ── sta（目前沒有直接讀 positioning）
retreat branch ─────── safeMove 3.2 displacement
```

目前 `posSkill()` 的產品語意比較接近 role-fit / positioning aptitude，而不是 live combat
performance；因此保留 raw `stats.pos` 是一致的。live positional behavior 則由 effective
`persStat(pos)` 消費端量測，不把 `posSkill` 直接當作實際走位結果。

## 3. Measurement design

- scenario：`inferno / t_aexec / c_std`
- target：T 方 entry、rifler、awp、lurker、igl 五個 role，各自只改 target `stats.pos`
- levels：low / baseline / high，使用 baseline ±12
- seeds：固定 16 seeds，`CsMeasurementSeedSet.v1`，seed-set SHA-256：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- 每個 arm 執行 production simulator off、instrumented on-1、instrumented on-2；
  共 `16 × (1 + 5 × 2) × 3 = 528` 次 simulation
- treatment 只改 target `stats.pos`；不新增 RNG，不改其他 stat 或 roster mapping。

## 4. Read points 與 KPI

verifier 建立 test-only `CsPositioningMeasurementEvent.v1`，使用 memory-only Vite transform
側錄既有 simulator。事件必須保留 actor / participant / attacker / defender attribution：

| 層級 | read point / KPI |
|---|---|
| raw / effective | `persStatPos`、`posSkill`、`combatSkillPosRead`、`aggr` |
| retreat trigger | opportunity、`aggr < 0.82` gate、trigger timing |
| displacement | trigger 對應的 `from → to` 實際距離，並驗證不超過 3.2 |
| re-engage | retreat episode、recontact、re-engage timing 與順序 |
| outcome | round-player survival、death exposure、attacker-side damage / kills |
| pair admission | candidate、fire-gate rejected / admitted、實際 attacker / defender exchange |
| movement | frame-level actual movement distance；與 retreat displacement 分開 |

## 5. Correctness gates

verifier 必須通過：

1. current FPS source SHA 與 21 個 `rand()` call sites 固定。
2. memory transform 可逆，transformed RNG token sequence 與 production source 完全一致。
3. off / on-1 / on-2 simulation result exact equal。
4. on-1 / on-2 event stream exact equal；固定 seed repeated run deterministic。
5. input roster / tactic immutable。
6. opportunity → trigger → displacement → episode → recontact / re-engage → round result
   關聯完整。
7. pair candidate → rejected / admitted partition 完整；每個 admitted pair 都有 attacker /
   defender exchange，雙方 side 必須相反。
8. raw / effective expected value、role profile、retreat threshold 與 source 行為一致。

R20 evidence 只判斷 measurement coverage 與 calibration readiness，不把 verifier 的
 structural/source gates 當作 gameplay balance 通過證明。
