# R28 CS Focus Measurement / Calibration Readiness 完成報告

日期：2026-08-13

Focused verifier：PASS

Focus measurement：Go

Focus semantic completeness：Revise

Focus calibration：No-Go / Deferred

## 1. 白話結論

Focus 在目前 ESMO CS 裡確實有作用，但作用不是「會不會撤退、何時丟道具或是否打出 clutch」。
它目前主要代表持續執行品質，實際接到：

- rifler / awp 的 raw role-fit；
- 全角色 live `combatSkill` 的 mechanical input；
- AWP weapon fit 與 holding bonus；
- 已通過距離與 uncontested gate 後的 CT 拆彈 progress。

utility timing、retreat / re-engage、`aggr()`、lastAlive clutch / resilience、target selection、
purchase、plant 與 tactic choice 都沒有 Focus read。

## 2. Production read-chain

| Consumer | 實際讀取 | 判定 |
|---|---|---|
| raw Focus | `stats.foc` | rifler / awp `posSkill()` role-fit；CT defuse progress |
| effective Focus | `persStat(player,"foc")` | `combatSkill()` mechanics、AWP weapon fit、holding |
| state | `formMul()` | 只乘最後 combat output；不生成 state-adjusted Focus |
| utility | 固定 `rand() < 0.06` | 不讀 Focus |
| retreat | `aggr()` 只讀 Courage / Strength / APM / Positioning | 不讀 Focus |
| clutch / resilience | lastAlive 分支讀 Strength / Resilience | 不讀 Focus |

目前 defuse progress 是：

`0.45 + raw Focus / 250 + effective Decision / 300`

因此 live combat 使用 effective Focus，但 defuse 使用 raw Focus。這個差異是語意風險，不是未接線。

## 3. 五個 role 的 deterministic direct evidence

下表為 low / baseline / high；`combatSkill` 與 `Pt` 都是 isolated production formula，五角色均為
16/16 strict-majority 單調。Role-fit 只有 rifler / awp 適用。

| Role | raw Focus | effective Focus | raw role-fit weight | combatSkill | local Pt |
|---|---:|---:|---:|---:|---:|
| entry（aggressive） | 60 / 70 / 80 | 56 / 66 / 76 | 0 | 83.7974 / 84.4919 / 85.1863 | 0.5226 / 0.5316 / 0.5406 |
| rifler（genius） | 75 / 85 / 95 | 75 / 85 / 95 | 2 | 85.7159 / 86.5970 / 87.4781 | 0.5475 / 0.5589 / 0.5704 |
| awp（calm） | 78 / 88 / 98 | 78 / 88 / 98 | 4 | 90.1378 / 92.5456 / 94.9533 | 0.6050 / 0.6363 / 0.6676 |
| lurker（lonewolf） | 72 / 82 / 92 | 72 / 82 / 92 | 0 | 90.8094 / 92.0039 / 93.1983 | 0.6137 / 0.6292 / 0.6448 |
| IGL（shotcaller） | 73 / 83 / 93 | 73 / 83 / 93 | 0 | 76.1155 / 76.8099 / 77.5044 | 0.4227 / 0.4317 / 0.4407 |

Focus 的 role 差異很清楚：awp 的 role-fit weight 最大，rifler 次之；entry、lurker、IGL 沒有 raw
Focus role-fit，但仍透過 live combat mechanics 受到 effective Focus 影響。固定 T roster 只有
aggressive entry 有 `-4` effective adjustment；CT semantic audit 另外確認 grinder `+6` 與
aggressive `-4` 的 Focus personality 路徑。

## 4. R22 四層結果

### Level 1 — direct consumer：PASS

- 五個 role 的 effective Focus、combatSkill、isolated `Pt` 均 16/16 單調。
- rifler / awp raw role-fit 均 16/16 單調；其餘 role 的不適用項不算失敗。
- low / baseline / high 沒有 Focus clamp 或 saturation；clamp reads 為 `0 / 0 / 0`。
- morale=40 不改 effective Focus，只讓 final combat output 乘 0.83。

### Level 2 — local opportunity：combat 足夠，defuse 不足

五個 treatment 都有大量 combat pair opportunities 與 admitted exchanges。baseline 全 suite 有
134 bomb ticks、20 proximity ticks、17 progress ticks、4 completes；defuse progress owner 只有
ct2 AWP grinder（16 ticks）與 ct5 support calm（1 tick）。這證明 Focus defuse branch 會執行，
但不足以用五個 T-side treatment 代表完整 CT-side calibration。

### Level 3 — immediate action / conversion：公式穩定，realized action 被路徑放大

Isolated `Pt` 是穩定單調；runtime combatSkill mean 多數角色也維持方向。但 engagement admission、
target attacker rate、utility throw rate 與 defuse progress tick count 都未達跨角色 strict-majority，
因為既有對槍、死亡、回合長度與 bomb gate 會改變後續路徑。這些不是 Focus arithmetic 失效。

### Level 4 — secondary only

Kills、damage、survival 與 round result 保留作 secondary observation；它們有 deterministic path
amplification，不能作 Focus calibration primary gate。

## 5. Defuse 與相鄰 stat

- Focus：持續執行與穩定度；現況只以 progress cofactor 粗略代理。
- Decision：已通過 gate 後的行動承諾；同一公式的另一個 cofactor。兩者目前有 coarse overlap，
  但沒有 start / stick / abort 或完整 bomb-state action。
- TacticalIQ：目前沒有 Focus read，也沒有 Focus 讀取的 planning branch。
- Resilience / Clutch：lastAlive 分支使用 Strength / Resilience；Focus 沒有專屬 clutch consumer。
- Utility / retreat：沒有 Focus read；不能因 Focus 名稱推導成投擲或撤退能力。

raw Focus 用於 defuse、effective Focus 用於 combat，與 personality 已宣告的 live execution 語意不
完全一致。R28 只完成 measurement，不直接把 defuse 改成 effective，也不調 `/250` 或其他 balance。
若產品決定拆除這個 mismatch，應另開最小 semantic Sprint，獨立處理 CT-side opportunity 與 historical
boundary。

## 6. Determinism / provenance

- `CsFocusMeasurementEvent.v1` / `CsFocusMeasurementSuite.v1`。
- `inferno / t_aexec / c_std`、5 roles、16 fixed seeds；off / on / repeated-on 共 528 executions。
- live source SHA：`f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`。
- R26 historical adapter SHA：`68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`。
- static `rand()` call sites：21；instrumentation 不改完整 simulation、RNG token sequence 或 input。
- repeated suite digest：`7f6e08393a54d5c594bd9c9abce49adbf70a9a6297a197fe4d9624151b4b69a0`。
- 未修改 production、balance、scenario、role mapping、contracts 或 historical evidence。

## 7. `/review`

1. **Blocking issues**：沒有 build、contract、RNG determinism、source adapter 或 verifier blocker。
2. **Non-blocking risks**：defuse owner coverage 只有 ct2 / ct5；raw/effective Focus boundary 未決；
   Level 3 / 4 受 deterministic path amplification；Focus / Decision 共用 defuse progress。
3. **Missing verifier**：若未來批准 effective Focus defuse correction，需補 CT 五角色 treatment、
   first-boundary actor/progress attribution 與 historical digest gate；若要真正 clutch / retreat /
   utility feature，需另案定義 action state machine。
4. **Minimal fixes**：R28 不提出 production patch；最小下一步是先決定 defuse Focus 應保留 raw 還是
   改 effective，再獨立做 semantic verifier。
5. **Files inspected**：`EsportsFPS3D.jsx` stat/personality/role/combat/utility/retreat/defuse/round
   區段、R6/R17/R22～R27 verifier、historical adapters、R22 framework 與 handoff。

## 8. Verdict

- Focus measurement：**Go / PASS**。
- Focus semantic completeness：**Revise**。
- Focus balance calibration：**No-Go / Deferred**。
- 本輪沒有 production patch；local commit 另於交付摘要提供，未 push。

## 9. SeasonState.v2 整合後重驗（2026-08-13）

- 驗證基準為已整合的 `7438ad389bb471a3584522965e53d503b1c1db1b`；R28 live source 仍維持
  byte-exact SHA `f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`，沒有因
  SeasonState.v2 merge 改動 CS production。
- `check_cs_focus_measurement_r28.mjs` repeated deterministic suite digest 仍為
  `7f6e08393a54d5c594bd9c9abce49adbf70a9a6297a197fe4d9624151b4b69a0`，focused gate PASS。
- aggregate gate `cs_decision_semantics_r27,cs_focus_measurement_r28`：**2/2 PASS**；production
  build：**PASS**；historical R26 adapter：**PASS**。
- 本節只記錄整合後重驗，不新增 gameplay、不調 balance、不改 RNG、scenario 或 historical evidence。
