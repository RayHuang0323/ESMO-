# CS 16-Stat Calibration Readiness Audit R17

日期：2026-08-11

狀態：**Audit PASS；本輪數值 calibration No-Go；下一階段採 Revise 後分批進入**

## 1. 範圍與不可變條件

R17 只整理既有 R1～R16 evidence，不修改 `src/`、`FPS_W`、`combatSkill`、任何權重、
clamp、balance constant、result contract、Store、Progress 或 runtime contract。

- 固定 R3 matrix：16 seeds × 16 treatments = 256 paired comparisons；含 baseline 的總模擬數為 544。
- R3 verifier：`tools/check_cs_stat_wiring_r3.mjs`，`CsStatWiringDigest.v2`。
- R3 seed set：`52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- R3 wiring suite：`6501b46d7f8c37e78877e9cb9fb17f2e87520a5422f11f2d1880d7078ac29e00`。
- R3 trajectory suite：`00fa99fee39a80d85d6fb713fee65c11081266bbd0c6a4dbd113f1720874f2f0`。
- static RNG call sites：21；R17 不新增 RNG、不補 dummy RNG。
- 歷史 digest 永久保留，不自動 rebaseline。

R3 的 changed-seed count 只代表固定 probe 是否觀察到差異，不是 effect size、勝率或
校準強弱排名。R2 的 4,385 combat opportunities、2,133 fire triggers、1,079 kill
conversions、1,069 overkill events / 53,309 overkill damage 也是 measurement evidence，
不是可直接調權重的樣本估計。

## 2. 16 項 readiness matrix

R3 count 格式為 `behavior / final result / round outcome` changed seeds（分母 16）。
「paired test」表示可否用現有 read-chain 與 KPI 做配對比較；不代表本輪已完成校準。

| 素質 | 目前 gameplay read-chain / KPI | 範圍 | R3 | paired readiness | 分類 | 主要風險 |
|---|---|---|---:|---|---|---|
| `reflex` | `mechanics`、weapon、entry bonus、entry/rifler/awp profile；R2 combat opportunity → fire → conversion | 廣泛 | 13/13/13 | 可用現有 combat KPI | 可直接進 calibration | 與 accuracy、APM、positioning 的 mechanics effect 重疊；需先看 effect size |
| `accuracy` | weapon / entry-rifler-awp、headshot chance；R2 combat、headshot、damage 結果 | 廣泛 | 15/15/15 | 需先修正/隔離 ADR overkill 與 raw/effective headshot measurement | 需先補 measurement | 固定 probe 看似很強可能是 overkill 或 result 汙染，不可直接調高低 |
| `apm` | `aggr()` 的 fire / retreat gate；R2 fireChance 與 combat | 廣泛但情境限定 | 11/11/11 | 需 retreat opportunity → trigger → displacement/re-engage | 需先補 measurement | 與 reflex、positioning、courage 共用 aggressive gate；現有 KPI 不能證明退撤品質 |
| `positioning` | mechanics、role profile、holding/lurk、`aggr()`；R2 combat 與 retreat | 廣泛但情境限定 | 12/12/11 | 需 retreat measurement | 需先補 measurement | holding/lurk、fire、retreat 混合，容易把站位效果誤歸因為交火數 |
| `mapAware` | `combatSkill` 4% 路徑、lurker/support profile、lurk bonus；R2 combat O→conversion | 情境限定 | 6/6/5 | 可做 paired pilot，但需拆 global 與 lurk/support | 可直接進 calibration | role profile coverage 小，效果可能被 seed / lurk opportunity 稀釋 |
| `tacticalIQ` | IGL/support role profile；目前多為 role-fit / duel path | 情境限定 | 4/4/2 | 現有 KPI 不足以代表 tactic decision/execution | 需重新設計語意 | 若直接調 combat 權重，會把 team tactic 誤做個人 duel skill |
| `decision` | IGL/lurker `combatSkill`，CT raw defuse progress；R2 combat / defuse 尚缺完整 KPI | 情境限定 | 3/3/2 | 需 defuse opportunity、progress、success | 需先補 measurement | combat 與 defuse 兩條語意重疊；需要拆 read point |
| `adaptability` | IGL/lurker role profile；R2 O→conversion | 情境限定 | 2/2/2 | 目前 coverage 太低，不能作 effect test | 建議維持現狀 | 近乎無感可能是 scenario coverage，不應急調數值 |
| `courage` | entry profile / bonus、`aggr()`，fire / retreat | 廣泛但情境限定 | 10/10/10 | 需 retreat KPI | 需先補 measurement | 與 APM、positioning、clutch 共用 aggressive / last-alive branch |
| `clutch` | mechanics、role、`aggr()`、lastAlive、lowHP；R2 combat，但 `clutches` 非真 1vN | 廣泛但需狀態條件 | 13/13/11 | 需 true 1vN opportunity / N / conversion | 需先補 measurement | 現有 clutches 語意不等於 1vN；高 changed count 不能當強度證明 |
| `focus` | mechanics、rifler/awp、holding；CT raw defuse progress | 情境限定 | 7/7/7 | 需 defuse KPI | 需先補 measurement | 與 decision 同時進 defuse，若無 opportunity 會形成假陰性/重疊 |
| `resilience` | `lastAlive` combatSkill bonus | 情境限定且目前未觀察 | 0/0/0 | 需 true lastAlive / 1vN coverage | 需先補 measurement | 0/16 是 coverage evidence，不是 stat 無效或必須加大數值 |
| `comms` | IGL/support role profile；目前沒有可驗證 team communication event | 情境限定 | 6/6/5 | 現有 KPI 不足 | 需重新設計語意 | 缺 team event / call quality read point，直接接 combat 會製造假 team effect |
| `leadership` | IGL role profile；目前沒有 team leadership / tactic execution event | 情境限定 | 7/7/6 | 現有 KPI 不足 | 需重新設計語意 | 與 tacticalIQ/comms team 語意重疊，需先定義 team-level outcome |
| `synergy` | 現有 `coo` 是 player role-fit adapter；R16-A 建議 canonical 語意為 team-level coordination，尚未 production wiring | 未接線（team-level） | 0/0/0 | 不可用現有單人 combat KPI | 需重新設計語意 | 不能把 support role-fit 或 `posSkill` 包裝成 team synergy |
| `learning` | training / talent / derived / roster lifecycle 有資料鏈；沒有 simulator、combat、tactic、utility 或單局 damage consumer | 未接線（跨場） | 0/0/0 | 不可用單局 paired test | 需重新設計語意 | 必須先定義跨場 observation、state、update、persistence；不可塞入單局公式 |

## 3. Readiness 分類

### 可直接進 calibration

- `reflex`：現有 combat opportunity / fire / conversion 足以作第一個小範圍 calibration pilot。
- `mapAware`：可進 paired pilot，但必須把 global 與 lurk/support role coverage 分開解讀。

這個分類只代表 measurement gate 已接近可用，不代表已核准修改數值。

### 需先補 measurement

`accuracy`、`apm`、`positioning`、`decision`、`courage`、`clutch`、`focus`、`resilience`。

最小補測順序是：先處理 ADR / effective damage 與 headshot attribution；再補 retreat
opportunity、trigger、displacement、re-engage；再補 true 1vN；最後補 defuse
opportunity、progress、success。這些 measurement sprint 不應偷偷改數值。

### 需重新設計語意

`tacticalIQ`、`comms`、`leadership`、`synergy`、`learning`。

前四項中前三項先定義 team event / opportunity / conversion，`synergy` 沿用 R16-A 的
team-level coordination；`learning` 沿用 R16-B 的跨場 lifecycle / adaptation。兩者都
暫不進單局 combat，也不新增第二套 team model。

### 建議維持現狀

`adaptability`：固定 scenario 只有 2/16 changed seeds，現有 evidence 只能證明低 coverage，
不能支持調高、調低或重寫語意；先維持，不進本階段 calibration。

## 4. Calibration 優先順序

1. `reflex`：最適合作為第一個 direct calibration pilot，先做 paired effect-size / KPI
   distribution read，不調數值與不修改 baseline。
2. `mapAware`：第二個 pilot，分開 global、lurk、support role coverage。
3. `positioning`：retreat measurement 完成後再做，避免把 holding/lurk/fire 混成一個 KPI。
4. `apm`：與 positioning 使用同一組 retreat evidence，避免重複發明 instrumentation。
5. `courage`：同 retreat gate 後進行；確認 aggressive fire / retreat 的語意後再校準。

`focus` / `decision` 等 defuse-linked stats 應等待 defuse KPI；`clutch` / `resilience` 應等待
true 1vN KPI；`accuracy` 應等待 effective damage / headshot attribution measurement。

## 5. Synergy / Learning 保護結論

- Synergy：canonical 語意為 **team-level coordination**；R16-A 只完成 read-chain audit，
  暫不 production wiring。
- Learning：canonical 語意為 **跨場 lifecycle / adaptation state**；R16-B 只完成 state
  design audit，暫不進單局 combat。
- R1～R16 historical evidence 永久保留；R17 新增 `CsCalibrationReadiness.v1` evidence，
  不建立新的 gameplay digest、不 rebaseline 歷史 digest。

## 6. Gate

- R17 evidence synthesis：**Go / PASS**。
- 本輪直接修改 balance / calibration constants：**No-Go**。
- 進入下一階段分批 calibration：**Revise**，必須先按上列 measurement gates 分批進入。

Verifier：`tools/check_cs_calibration_readiness_r17.mjs`

```text
CsCalibrationReadiness.v1: e5838664749625863caa2b35fe6d4b999dbda7fd8c3600fee50523b5415573ad
```
