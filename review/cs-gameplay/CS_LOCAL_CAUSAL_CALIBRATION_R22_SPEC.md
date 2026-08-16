# R22 — CS Local Causal Calibration Framework 規格

## 1. 目的與邊界

R22 建立可供後續 16-stat verifier 共用的 local causal measurement 分層。
本框架只整理並驗證既有 R18-A、R19、R20、R21 fixed-seed evidence，不修改
`src/battle/fps/EsportsFPS3D.jsx`、balance constant、role mapping、RNG、scenario 或
R1～R21 historical evidence，也不建立第二套 simulator。

`Ready for calibration pilot` 在本文件中只表示：stat 的 Level 1 direct consumer 與可歸因
的 Level 2 local opportunity 已有足夠的 monotonic causal signal，可以設計下一輪 focused
pilot；不表示 match-level balance 已完成，也不表示 Level 4 outcome 可以作 primary gate。

## 2. Measurement layers

| Level | 名稱 | 必要輸出 | Calibration 用法 |
|---|---|---|---|
| 1 | Stat / Direct Consumer | raw stat、effective stat、direct formula output、clamp / threshold | primary gate；先確認數值方向與 read-chain |
| 2 | Local Opportunity | stat 真正有資格影響的 opportunity、attacker / defender / target attribution | primary gate；確認作用點確實被觸發 |
| 3 | Immediate Action / Conversion | opportunity 是否轉成 action、local conversion、立即 displacement / retreat / fire / admission | 依 stat 語意作 primary 或 boundary evidence；若被離散 gate 放大，標記為 path-amplified |
| 4 | Downstream Match Outcome | kill、damage、survival、economy、winner | 一律 secondary observation；不可自動取代 Level 1～3 gate |

所有 paired sweep 保留 `low / baseline / high`、fixed seed、effect size、changed-seed、
clamp、threshold crossing 與 downstream spillover。16 seeds 的 strict-majority 定義是
`passingSeeds > totalSeeds / 2`；因此 `8/16` 不通過，至少 `9/16` 才是 majority。
若歷史報告只公布 aggregate paired direction 而沒有 seed-level passing mask，verifier 不得
自行捏造 `16/16`；必須標示 evidence mode，並要求下一個 calibration pilot 補 seed-level gate。

## 3. Reusable verifier helper

`tools/cs_calibration_measurement.mjs` 是純 evidence helper，不呼叫 simulator，提供：

- `pairedEffect()`：paired mean difference、SD、effect size、正／負／零 seed。
- `monotonicity()` 與 `monotonicityFromCounts()`：方向、passing mask、strict majority。
- `strictMajority()`：集中保護 `> total / 2` correctness gate。
- `thresholdCrossing()`：離散門檻跨線。
- `clampSummary()`：上下界命中與 saturation evidence。
- `changedSeedSummary()`：treatment 導致 deterministic path 改變的 seed 比例。
- `classifyCausalReadiness()`：區分 direct/local monotonic、threshold dominated、
  insufficient opportunity coverage、downstream path amplified、semantic ambiguity 與
  truly non-monotonic formula。

`tools/check_cs_local_causal_framework_r22.mjs` 只使用上一輪報告的 SHA-256、suite digest、
固定 seed metadata 與已公布數值；若任何 historical report 被改寫，verifier 會失敗，不能
靜默重建或 rebaseline 舊 evidence。helper 自身另有 8/16、9/16、effect、monotonicity、
threshold、clamp behavioral contract tests。

## 4. Stat-specific primary / secondary mapping

### Reflex

- Level 1 primary：`rawReflex`、`effectiveReflex`、`combatSkill`。
- Level 2 primary：`Pt` local combat opportunity；resolution 以 attacker / defender / target
  分區。
- Level 3 boundary：target-attacker conversion 可量測，但 `Pt → attacker branch → alive /
  pair / economy / round state` 會放大成 deterministic path，故不作直接 formula failure。
- Level 4 secondary：target attacker-only kill / damage，以及 defender-side、survival、economy、
  winner spillover。

### Positioning

- Level 1 primary：raw role-fit `posSkill`、effective position、`combatSkill`、`aggr`。
- Level 2 primary：distance、HP、teammate count 組成的 retreat eligibility opportunity。
- Level 3 primary candidate：retreat trigger、actual displacement、re-engage；但目前受
  `aggr < 0.82` 與 role coverage 限制。
- Level 4 secondary：pair admission、survival、death exposure、attacker / defender exchange。

### APM

- Level 1 primary：raw/effective APM、`combatSkill`、`aggr`。
- Level 2 primary：combat pair opportunity 與 retreat opportunity，並分開 attacker / defender /
  target attribution。
- Level 3 boundary：pair admission / retreat trigger 是 live spillover；APM pilot 的 primary
  gate 先使用 Level 1 direct consumer，不把離散 admission 當成 APM arithmetic failure。
- Level 4 secondary：target-player-only damage / kill、survival、winner。

## 5. Readiness rule

1. 若 raw/effective 語意未定義，結果為 `Deferred`，不得調 balance 掩蓋。
2. 若 direct formula 本身無法通過方向 gate，結果為 `Deferred / truly non-monotonic formula`。
3. 若 local opportunity coverage 不足，結果為 `Deferred / insufficient opportunity coverage`。
4. 若立即 action 被硬 threshold / clamp 主導，結果標為 `threshold dominated`，不將其誤稱為
   continuous stat failure。
5. 若 Level 1～2 可重現、但 Level 3～4 被 fixed-seed state path 放大，保留
   `downstream path amplified` boundary；若沒有其它 blocking boundary，可進入 local causal
   calibration pilot。
6. Level 4 KPI 永遠保留作 spillover / product observation，但不得單獨否決 Level 1～3 的
   direct/local calibration readiness。

## 6. Historical boundary

R18-A repair、R19 semantic revalidation、R20 positioning、R21 APM 的原始 report 與 suite
digest 全部保留。R22 的 digest 是 framework classification snapshot，不是新 gameplay
baseline，也不取代既有 match-level KPI。

## 7. Non-goals

- 不做 Courage calibration。
- 不改任何 production balance constant、retreat threshold、scenario、RNG、role mapping。
- 不處理 MapAware、Synergy、Learning 或其他 stat。
- 不因為 Level 4 非單調而重寫 simulator。
