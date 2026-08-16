# R21 CS APM Measurement / Calibration Readiness Spec

## 1. 目的與邊界

本規格只做 APM 的 gameplay read-chain 追蹤、deterministic measurement 與 calibration-readiness 判斷。

- 不修改 production gameplay、balance constant、role mapping、RNG、contract 或其他 15 項 stat。
- 不處理 Reflex、Positioning calibration、MapAware、Synergy、Learning。
- 不修改 retreat threshold，也不為了增加 coverage 改 scenario。
- 不 rebaseline R1～R20 historical evidence。
- R21 的 calibration 結論只代表目前固定 scenario / 固定 seed sweep 的證據，不代表已完成 balance。

## 2. 已封版的 APM semantic boundary

| 層級 | 產品語意 | R21 量測方式 |
|---|---|---|
| raw APM | stats.apm，選手的原始操作速度／role-fit 基礎值 | treatment roster 只改目標玩家 stats.apm |
| effective APM | persStat(p, "apm")，人格修正後投入 live combat 的 effective 值 | 記錄 raw、personality adjustment、clamp 與 effective 值 |
| role-fit consumer | posSkill() 的 POS_PROFILE | 保留 raw APM；目前只有 entry profile 以 weight 3 讀 APM，其餘目標 role 的 APM weight 為 0 |
| live combat consumer | combatSkill() 的 mechanical／rifle read | 讀 effective APM；FPS_W.apm = 1.0；同一結果仍包含 raw posSkill role-fit component |
| live behavior consumer | aggr()、pair fire chance、retreat gate | aggr() 讀 effective APM，係數為 0.16 / 100；movement speed 仍只讀 sta |

目前沒有獨立的 state／morale／condition APM adjustment；R21 將此狀態明確記為 personality-only effective read。
因此 entry 的 APM 會同時出現在 raw role-fit component 與 effective mechanical component；R21 將兩條 exposure 分開量測，不把它們誤合併成單一 adjusted 值。

## 3. 固定 measurement matrix

- 目標 role：entry、rifler、awp、lurker、igl
- 每個 role：low / baseline / high paired treatment，±12
- fixed seeds：16 個，CsMeasurementSeedSet.v1
- scenario：inferno、t_aexec、c_std
- 每一個 arm 執行 production simulator 一次未掛鉤、兩次掛鉤；比較 simulation digest 與 event digest
- 目標玩家固定為 T 方目標，target KPI 不使用 opponent event 值

## 4. Event / attribution contract

CsApmMeasurementEvent.v1 只存在 verifier memory transform：

- persStatApm：raw / adjusted / effective / clamp / personality-only attribution。
- posSkillApmRead：profile、raw APM、APM role-fit weight、posSkill result。
- combatSkillApmRead、combatSkill：effective APM read 與 live combat result。
- aggr：effective APM 與 aggr result。
- pair / exchange / retreat events：只做 downstream observation。
- round_player_result：
  - attacker-side：attackerKills、attackerDamageDealt
  - defender-side：defenderDeaths、survived
  - assists 與 opponent spillover 分開保留，不混入 target attacker KPI。

## 5. 驗證與 readiness gate

Verifier 必須通過：

1. production source SHA、固定 RNG call-site 數與 fixed seed set。
2. 所有 memory transforms 可逆，RNG token sequence 不變。
3. instrumented / uninstrumented simulation 結果完全一致。
4. 同 seed 重跑 event digest 完全一致。
5. 事件 schema、raw/effective attribution、role-fit weight、attacker/defender attribution、pair partition、round coverage 全部 behavioral 驗證。
6. monotonicity 使用 strict majority：16 seeds 必須 > 8；8/16 不通過。
7. 產出 effect size、clamp / saturation、threshold crossing、target-only KPI、secondary spillover 與 deterministic path digest。

Pass 只代表 measurement evidence 完整。只有主要 target KPI 在 role-by-role paired evidence 中具備可靠 monotonic signal，才可把 calibration readiness 判為 Go；本規格不授權任何 balance patch。
