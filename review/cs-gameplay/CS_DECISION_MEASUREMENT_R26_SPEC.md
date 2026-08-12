# R26 CS Decision Measurement / Calibration Readiness 規格

日期：2026-08-13
狀態：Decision focused audit / measurement
Production patch：無
Calibration：本輪不執行

## 1. 目的與產品語意

R26 沿用 R22 Local Causal Calibration Framework，先回答 production 裡的 `decision`（`dec`）
實際被誰讀取，再判斷是否可進 balance calibration。名稱叫「決策力」不代表它已控制目標選擇、
撤退、投擲物 timing 或戰術選擇；所有結論都必須由 production read-chain 證明。

本輪將資料分為四個邊界：

| 邊界 | Production 語意 |
|---|---|
| raw Decision | `player.stats.dec`；角色適性與拆彈公式直接讀取 |
| personality-adjusted effective Decision | `persStat(player,"dec")`；aggressive -4、calm +6，再 clamp 1～99 |
| state-adjusted output | morale / condition 不改 Decision；`formMul()` 最後乘在整個 `combatSkill` 結果 |
| live gameplay consumer | 全角色 `combatSkill` 的 4%；IGL / lurker 額外有 raw role-fit；CT 拆彈進度另讀 raw Decision |

## 2. 必查 read-chain

正向 consumer：

1. `posSkill()`：IGL profile 的 Decision 權重 3，lurker 權重 4；其他三個 T-side roles 為 0。
2. `combatSkill()`：`S("dec") * 0.04`，`S` 由 `persStat` 取得 effective Decision；五個角色皆適用。
3. duel：`combatSkill` 進 `Pt = clamp(0.5 + (tSk-cSk)*0.013 + ...)`，改變交火中誰成為 attacker。
4. defuse：`0.45 + focus/250 + decision/300`，直接讀 CT defuser 的 raw stats。

必須以負向 source gates 證明下列不是 consumer：

- target / engagement pair 選擇；
- retreat / re-engage 與 `aggr()`；
- player utility timing；
- plant / buy / role-route / tactic choice。

## 3. 固定量測

- Scenario：`inferno / t_aexec / c_std`，不修改 scenario。
- 五個 T-side roles：entry、rifler、awp、lurker、IGL。
- 每個角色只改 raw `stats.dec`：low / baseline / high = baseline -10 / baseline / baseline +10。
- 16 fixed seeds，seed-set SHA-256：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- 每個 arm 執行 off / instrumented / repeated-instrumented，總計 528 次 simulation。
- instrumentation 只用 exact reversible Vite memory transform；production、RNG token sequence、input、
  roster 其餘欄位及完整 sim JSON 必須不受 instrumentation 影響。

## 4. R22 四層證據

### Level 1 — direct consumer

- raw / adjusted / effective Decision、personality adjustment、clamp reads；
- raw role-fit result 與 Decision weight；
- isolated `combatSkill` 與 form multiplier；
- morale=40 control：effective Decision 不變，僅 final combat output 乘 0.83；
- raw defuse delta 與 effective counterfactual delta。

### Level 2 — local opportunity

- deterministic isolated duel opportunity：固定 opponent、weapon、options，直接算 `Pt`；
- runtime visible pair、fire gate、admitted exchange；
- baseline bomb tick、CT proximity、progress gate；
- utility opportunity只作「非 consumer」控制，不得解讀成 Decision effect。

### Level 3 — immediate action / conversion

- primary：isolated `Pt`（Decision → combatSkill → duel attacker probability）；
- runtime secondary：target attacker conversion rate；
- independent defuse branch：progress delta / completion coverage。

### Level 4 — downstream outcome

- target-only kills、damage、deaths、survival；
- strict sim / structural / target KPI changed-seed；
- 全部只作 secondary observation，不可覆蓋 Level 1～3 的 causal interpretation。

## 5. Readiness gate

Strict-majority 是 `passingSeeds > totalSeeds / 2`，所以 8/16 不通過、9/16 才通過。

即使 combat direct chain 單調，只要以下任一成立，Decision calibration 維持 Deferred：

- raw defuse consumer 與 effective combat consumer 語意不一致；
- 五個 T-side role sweep 無法直接 treatment CT-only defuse consumer；
- named decision behaviors 沒有 Decision read point；
- immediate realized action / Level 4 被 deterministic path amplification 支配；
- TacticalIQ、MapAware、Focus 的 consumer 語意尚未拆清。

## 6. 邊界與禁止事項

- 不新增 Decision gameplay feature、RNG 或 scenario。
- 不改 Accuracy / Reflex / Positioning / APM / Courage / MapAware / Synergy / Learning。
- 不改 balance、role mapping、result contract、Store、Progress、Replay 或 UI。
- 不 rebaseline R1～R25 historical evidence。
- 若 read-chain 不完整，只完成 focused audit / measurement，不用新 gameplay 補名稱語意。

## 7. Provenance

- Verifier：`tools/check_cs_decision_measurement_r26.mjs`
- Live source SHA-256：`68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`
- Static RNG call sites：21
- Expected suite digest：`f8f3db1e6568f5d7fd4171f4d2b82bdf441e09bb9e45cd57924ce9307d68ccb4`
