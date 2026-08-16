# CS Reflex Read-Chain / Role Interaction Audit — R19

## 狀態與邊界

R19 本輪只做 audit / measurement，不修改 production gameplay、RNG、stat formula、role mapping、balance constant、contract 或 historical evidence。R18-A 修正版 evidence 是本輪 outcome reference；R19 不 rebaseline R1–R18，也不把 read-chain audit 宣稱為 calibration completion。

R18-A repair reference suite digest：`104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b`。

## Audit questions

本輪必須分開回答：

1. `stats.rxn` 在 adapter、display、role fit、combat、fire chance、result 哪些位置被讀取？
2. 哪些 read point 使用 raw stats，哪些使用 `persStat` 後的 personality-adjusted value？
3. 每個 role 的 rxn exposure 是否不同，是否存在多重讀取 / double counting？
4. 直接 `combatSkill` / `Pt` 方向與 R18-A target-attacker KPI 方向是否一致？
5. 反轉是否來自 stat clamp、Pt clamp，或 deterministic state / threshold branching？

## Read-point contract

| 層 | Read point | rxn 語意 | 本輪判定 |
|---|---|---|---|
| derived / adapter | `getPlayerDerivedStats` → `fpsRoster.STAT_L2S.reflex = "rxn"` → `toShortStats` | derived short `stats.rxn`；尚未套 personality | 不是 duplicate personality adjustment |
| display | `fpsOvr` / `ovr` | raw/derived short `stats.rxn`，只供 HUD / rating 顯示 | 不算 gameplay consumer |
| role fit | `posSkill` → `POS_PROFILE` | raw `p.stats`；entry/rifler 權重 4、awp 權重 1、lurker/igl 權重 0 | role-specific raw read |
| combat mechanics | `combatSkill` → `_mechKeys` / `FPS_W.rxn` | `persStat(p,"rxn")` | 所有 role 皆讀 |
| weapon fit | `combatSkill` → rifle/pistol branch | 非狙擊武器再讀 `persStat(p,"rxn")`；狙擊 branch 不讀 weapon rxn | weapon-dependent duplicate read |
| role option | `combatSkill` → `opts.entry` | entry 再加 `persStat(p,"rxn") * 0.02` | entry-only extra read |
| fire chance | `aggr` → `fireChance` | `aggr` 不讀 rxn | rxn 無直接 fire-chance path |
| duel probability | `Pt` | `combatSkill` 差值經 `0.013` 與 clamp | downstream threshold |
| headshot / damage | `isHS`、damage | headshot 讀 raw `stats.acc`；damage 不直接讀 rxn | rxn 只透過 attacker / defender duel 結果影響 |

## Measurement design

- 固定 `inferno / t_aexec / c_std`、同一 16 seeds、同一 `±12` low/baseline/high band。
- 五個 T-side role：entry、rifler、awp、lurker、igl。
- 每個 role 以 16 baseline + 16 low + 16 high arms 做 read-chain audit，共 176 simulations；R18-A 修正版 528-simulation outcome evidence 不重建為 historical baseline。
- memory-only transform 觀測：`persStatRxn`、`posSkill`、`combatSkillRxnRead`、`combatSkill`、`aggr`、`Pt`、clamp。
- 每個 arm 必須通過：source SHA、RNG token sequence、off/on/repeated-on exact result、event determinism、input immutability、transform reversibility。
- 不新增 RNG；instrumentation 不得改變 simulation result。

## Role formula reference

`combatSkill` 的 direct formula 保持現況觀測：

```text
mech = Σ persStat(stat) × FPS_W[stat] / _mechW
weapon = weapon-class formula using persStat
v = mech × 0.5 + weapon × 0.28 + posSkill(raw) × 0.14
    + persStat(vis) × 0.04 + persStat(dec) × 0.04
role options = holding / entry / lurk / lastAlive / lowHP
result = v × formMul
```

R19 不修改此公式；只測量其對 rxn 的實際暴露與下游 outcome 差異。

## Acceptance / non-goals

- 必須能區分 direct formula effect 與 downstream deterministic path effect。
- 若 direct `combatSkill` / `Pt` 單調，但 result KPI 反轉，必須標示為 state / threshold path evidence，不得直接調 balance 修正。
- 不提出 production patch，除非 raw/adjusted 語意選擇、role-fit 語意與 replay/digest 影響先獲得獨立決策。
- 不處理其他 15 項 stat、synergy、learning 或全面 balance calibration。

## R19 semantic correction revalidation

R19 production semantic boundary 已封版並以最小 patch 實作：

- `rawReflex = stats.rxn` 是 raw role-fit 基礎值。
- `effectiveReflex = persStat(p, "rxn")` 是 live combat contribution。
- `posSkill(p, rawReflex)` 只讀 raw role-fit reflex。
- `combatSkill` mechanics / weapon / entry contribution 只讀 effectiveReflex alias；其他 stat 維持既有 effective read。

本段不改寫前段 audit snapshot，也不把目前 `vis` 或任何單一 outcome KPI 宣稱為完整 calibration evidence。新的 R19 / R18-A 結果與 checkpoint 由 `CS_REFLEX_SEMANTIC_CORRECTION_R19_REVALIDATION_REPORT.md` 保存。
