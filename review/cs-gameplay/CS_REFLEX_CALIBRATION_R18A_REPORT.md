# CS Reflex Calibration Pilot — R18-A Evidence

## Verdict

`CS Reflex Calibration Pilot R18-A: PASS` means the focused verifier and its correctness gates passed. It does **not** mean the calibration candidate was accepted.

結論：本輪只產出 calibration evidence；沒有 accepted candidate，沒有 production calibration patch。

## Frozen setup

- simulator source SHA-256：`7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- seed set：16 fixed paired seeds，`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- scenario：`inferno / t_aexec / c_std`
- target：5 個 T-side roles，各自 `low / baseline / high`
- treatment：只改 target `stats.rxn`，baseline 周圍 `±12`；每個 treatment 與 baseline 同 seed 配對
- simulations：`528`
- simulation RNG call sites：`21`，R18-A 沒有新增 RNG
- production source：未修改；所有 instrumentation 都是 Vite memory transform
- suite digest：`4813bc9cef3b71727a6563257a1695271d9490e5994c61958707a5edecf82801`

## Read-chain correctness

Focused verifier verified the real chain:

`stats.rxn → personality-adjusted combatSkill → Pt → fire/conversion → result/event KPI`

每個 arm 都做 instrumentation-off / instrumentation-on / repeated-on 比對，並檢查 input immutability、event chain `opportunity → fire → probability → conversion`、source SHA、RNG token sequence 與 fixed seed hash。

## Primary KPI paired effects

數字是 treatment − baseline 的 16-seed paired mean；括號為 standardized paired effect size。`low` 預期應為負、`high` 預期應為正，但這只作 monotonicity 判讀，不是 balance target。

| role | rxn low/base/high | target conversions low / high | target kills low / high | target effective damage low / high |
|---|---:|---:|---:|---:|
| entry | 66 / 78 / 90 | -1.6875 (-0.267) / +0.875 (+0.343) | -0.875 (-0.384) / +0.25 (+0.222) | -29.1875 (-0.127) / +61.25 (+0.311) |
| rifler | 72 / 84 / 96 | -4.4375 (-0.367) / -1.5625 (-0.143) | -1.5625 (-0.229) / -0.25 (-0.049) | -216.0625 (-0.296) / -33.25 (-0.055) |
| awp | 70 / 82 / 94 | -0.1875 (-0.073) / +0.4375 (+0.097) | -0.0625 (-0.049) / +0.4375 (+0.275) | -21.5 (-0.185) / +67.3125 (+0.284) |
| lurker | 67 / 79 / 91 | +0.1875 (+0.069) / -0.6875 (-0.162) | +0.375 (+0.327) / +0.1875 (+0.087) | +41.6875 (+0.229) / -8.875 (-0.039) |
| igl | 62 / 74 / 86 | +1.0625 (+0.147) / +4.75 (+0.621) | +0.25 (+0.093) / +2.125 (+0.677) | +34.75 (+0.167) / +219.25 (+0.659) |

## Secondary KPI / shape checks

- `targetOpportunities`、`fireTriggers`、round wins、total effective damage、upper/lower clamp rate 均已在 focused suite 計算 paired mean、SD、effect size 與 seed sign distribution。
- secondary shape 也不是單一方向：例如 rifler total effective damage low/high 為 `-207.5625 / -173.1875`，awp 為 `-204.625 / +432.5`，lurker 為 `+70.625 / -163.4375`，igl 為 `+307.625 / +160.5625`。
- clamp / saturation：5 個 role 都是 `not-observed`；沒有 high/low 端達到既有 bounded probability 的 saturation signal，也沒有足以宣稱 plateau 的 marginal-response evidence。
- monotonicity：`0/15` primary KPI checks passed；entry/awp 的 aggregate low/high 方向部分相符，但 seed-level signed majority 不足；rifler、lurker、igl 出現方向反轉或同向偏移。

## Calibration decision

`baseline ±12` 只能保留為下一輪 measurement 的 pilot band，不能接受為 production calibration range。原因是 role-specific direction inversion、低 effect size / 高 seed variance，以及 personality-adjusted/raw stats 混用使結果不適合直接轉成全域 balance patch。

因此：

- accepted candidate：`none`
- focused accepted-candidate regression：`not run; no candidate passed acceptance criteria`
- production calibration patch：`not proposed`
- full 16-stat calibration：`not claimed`
- R18-B MapAware semantics：尚未開始

## Historical checkpoint

以 `tools/verify.mjs --only=<14 CS segments>` 執行完整 CS historical gate；每支 child 的 exit code 與 output shape 均通過：`14/14 PASS`。

包含 `cs_measure_r1`、`cs_instrument_r2`、`cs_stat_wiring_r3`、`cs_clutch_r4`、`cs_retreat_r5`、`cs_defuse_r6`、`cs_result_metrics_r8`、`cs_determinism_migration_r10`、`cs_bomb_result_semantics_r11`、`cs_flash_attribution_r12`、`cs_player_smoke_los_r13`、`cs_he_gameplay_r14`、`cs_molly_gameplay_r15`、以及正式註冊的 `cs_calibration_readiness_r17`。`--resume` 後 runner exit code 為 `0`，確認 14 個 state 都是 PASS。

本 checkpoint 沒有 rebaseline、沒有 production source write；它只確認 R18-A tooling 在 R1–R17 historical safety net 之上成立。
