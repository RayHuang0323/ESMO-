# R18-A Verifier Repair — CS Reflex Calibration Pilot

## 判定摘要

- verifier repair：**PASS**。
- R18-A calibration conclusion：**Revise**；不提出 production calibration patch。
- R19：**仍有必要**，但本輪不開始。修正 attribution 後，role-specific direction reversal / non-monotonic response 仍存在，且 personality-adjusted / raw `rxn` read-chain 與 role formula coupling 尚未釐清。
- production gameplay、RNG、stat formula、role mapping：**未修改**。
- R18-B historical snapshot：**未 rebaseline、未改 evidence**；只在本報告註記其與本次 R18-A repair 的邊界。

## 修正前後的解讀邊界

修正前的 `CS_REFLEX_CALIBRATION_R18A_REPORT.md` 保留為 historical snapshot。其 target conversion / kill / damage 是以 `tPlayerId` 篩選的 combat-pair 結果，沒有要求 target player 必須是 attacker，因此不能作為 target-player causal KPI，也不能直接支持角色方向結論。

本次 repair 將 resolution / conversion event 明確記錄 `attackerId`、`defenderId`、雙方 side 與 headshot，再把 target player 的 attacker-side 與 defender-side 分區。修正後的主要 KPI 僅為 target player 作為 attacker 的：

- `targetAttackerConversions`
- `targetAttackerKills`
- `targetAttackerDamage`

opponent 作為 attacker 的事件不會進入上述 KPI；target player 作為 defender 的 hits、deaths、damage taken 與 headshot 指標另列，不混入 attacker-side。

## Verifier repair scope

- strict-majority 使用 `count > total / 2`；固定 16 seeds 時 9/16 通過、8/16 不通過，並由 verifier 自檢此 invariant。
- 每個 role 都輸出 low→baseline、baseline→high、low→high 的 paired mean difference、SD、effect size 與 seed distribution。
- 每個 treatment pair 都輸出 strict changed-seed 與 target-metric changed-seed count / ratio。
- resolution event 補上 headshot；report secondary output 補上 attacker-side / defender-side headshot 與 damage 指標。
- treatment input diff 必須恰好是 `roster.<target>.stats.rxn`；HUD、其他 stats、RNG token sequence 與 production source 均受 gate 保護。

## Deterministic sweep evidence

- verifier：`tools/check_cs_reflex_calibration_r18a.mjs`
- event schema：`CsReflexCalibrationRepairEvent.v1`
- suite schema：`CsReflexCalibrationRepairSuite.v1`
- source SHA-256：`7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- seed set：16 fixed seeds；SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- scenario：`inferno / t_aexec / c_std`
- sweep：5 T-side roles × low / baseline / high × 16 seeds，加上 16 baseline arms，共 **528 simulations**
- static RNG call sites：`21`，未新增或改變順序
- suite digest：`104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b`
- production source modified：`no (memory transform only)`
- monotonicity：`0/15` primary KPI checks passed
- saturation：`0/5` signals；`not-observed`，不宣稱 plateau

## 修正後 role-by-role primary KPI

下表為 target-player-only attacker KPI；數值是 treatment 相對 baseline 的 paired mean difference，括號為 effect size。`L/B` 為 low→baseline，`H/B` 為 high→baseline；每列的 `L/H` 是 low→high mean difference。

| role | conversions L/B | conversions H/B | kills L/B | kills H/B | damage L/B | damage H/B | conversions L/H | damage L/H | monotonicity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| entry | -1.7500 (-0.4261) | +1.0000 (+0.3873) | -1.1250 (-0.4319) | +0.3750 (+0.2757) | -53.6250 (-0.2903) | +69.1250 (+0.3645) | -2.7500 | -122.7500 | 0/3 |
| rifler | -3.8125 (-0.3869) | -0.8125 (-0.1115) | -1.7500 (-0.2822) | -0.1875 (-0.0447) | -215.0625 (-0.3404) | -25.4375 (-0.0529) | -3.0000 | -189.6250 | 0/3 |
| awp | -0.8125 (-0.4949) | +0.6875 (+0.2915) | -0.5625 (-0.5144) | +0.5625 (+0.3447) | -56.1875 (-0.5415) | +67.2500 (+0.3752) | -1.5000 | -123.4375 | 0/3 |
| lurker | +0.5000 (+0.2795) | -0.0625 (-0.0208) | +0.3125 (+0.5190) | +0.2500 (+0.1443) | +57.3125 (+0.4413) | +9.2500 (+0.0524) | +0.5625 | +48.0625 | 0/3 |
| igl | +0.5000 (+0.1018) | +3.7500 (+0.7383) | +0.1250 (+0.0542) | +2.2500 (+0.7445) | +13.6875 (+0.0772) | +213.3125 (+0.7600) | -3.2500 | -199.6250 | 0/3 |

主要 observations：

- entry / awp 的 attacker-side primary KPI 多數呈現低端負、高端正，但固定 seed signed-majority / 全部 primary checks 仍未通過。
- rifler 的 low/high 仍同向負移，顯示單靠 attribution repair 未消除非單調反應。
- lurker 的 low 端為正，且 conversions 的 high 端略為負；這是 role-specific direction inversion。
- igl 的 low/high attacker KPI 為正向高端放大，low 端沒有預期的負向 paired effect；方向異常仍存在。

## Secondary / changed-seed evidence

- attacker headshot-rate paired mean difference（low→baseline / high→baseline）：entry `+3.7663 / -0.7784`、rifler `-1.9702 / +1.3749`、awp `+2.4206 / +1.5118`、lurker `+2.3968 / +6.9134`、igl `+0.5970 / +6.0051`。
- target-metric changed-seed ratio（low→baseline / high→baseline / low→high）：entry `0.6875 / 0.3750 / 0.8125`、rifler `0.8125 / 0.5625 / 0.9375`、awp `0.3750 / 0.1875 / 0.5000`、lurker `0.4375 / 0.5625 / 0.6875`、igl `0.5000 / 0.6250 / 0.8750`。
- 所有 role 的 saturation status 都是 `not-observed`；這只表示本三點 pilot 沒有觀察到 clamp / marginal saturation signal，不代表已證明 plateau。
- `targetDefenderDamageTaken`、defender hits/deaths、pair/context 與 clamp 指標均保留在 secondary output，未被冒充為 target attacker KPI。

## 修正前後結論比較

修正後，原報告中由 pair-level target KPI 得出的 role reversal 判讀不再具有相同的 attribution 意義；但以 target-player-only attacker KPI 重新計算後，rifler、lurker、igl 仍出現非單調或方向異常，且整體 `0/15` monotonicity checks 通過。因此 R19 的問題不是被 repair 消除，而是由錯誤歸因改為可驗證的 target-player read-chain / role interaction 問題。

R18-A 仍不可接受為 production calibration。下一步若重新進入 R19，應先 audit `rxn` 的 personality-adjusted / raw 使用邊界與 role formula，並重新解釋上述 primary KPI；本輪不執行 R19、不擴大 sweep、不修改 production。
