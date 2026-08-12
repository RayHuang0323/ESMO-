# R23 CS Courage Measurement / Calibration Readiness Report

日期：2026-08-12
Verifier：`tools/check_cs_courage_measurement_r23.mjs`
Aggregate：`cs_courage_measurement_r23`
狀態：**Measurement Go；Calibration Readiness Revise / Deferred**

## 1. 白話結論

這次確認了 Courage 不是只存在於選手資料裡：它確實會讓選手更願意進入交火，也會影響突破手的直接對槍表現；當勇氣影響進攻性時，還會改變「是否開火」以及殘血時是否撤退。

但目前不能安全地直接調整 Courage 強弱。原因不是 Courage 沒有效果，而是不同角色走的路徑不同：`lurker` 與 `igl` 的高值會跨過既有 `aggr < 0.82` 撤退門檻，造成整批離散行為；其他角色則會受到配對、攻守交換、存活等固定路徑連鎖影響。這些後續結果會放大或抵銷 Courage 的局部效果。

因此本輪完成的是可重複的測量與 readiness 判定，不是 balance calibration。

## 2. 執行與保護結果

- 5 roles × low / baseline / high × 16 fixed seeds。
- 每個 arm：1 次未加觀測、2 次加觀測；共 **528 次 simulator execution**。
- suite digest：`5809adbd6fff29662cf6adc6eb4fc9adcde5a672d47f6735f1e2b57d1349f271`。
- engine source SHA：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`。
- RNG call sites：21；沒有新增 RNG。
- instrumentation 只存在於 verifier 的 memory transform；production source 沒有改動。
- historical R1～R22 evidence 保留，沒有 rebaseline。

## 3. 真正的 read-chain

| Read point | 實際行為 |
|---|---|
| raw courage | 直接讀 `p.stats.cou`。這是原始能力與 role-fit 基礎值。 |
| effective courage | `persStat(p,"cou")` 只套 personality delta 並 clamp 到 1～99；本輪沒有發現 Courage 專用的 morale / condition adjustment。 |
| role-fit | `posSkill()` 的 entry profile 第一項是 `cou`，所以 entry 讀 raw courage、權重 5；rifler / awp / lurker / igl 的 profile 沒有 courage，不能宣稱它們有 raw Courage positioning consumer。 |
| live combat | `combatSkill()` 只有在 `opts.entry` 時讀 effective courage，增加 `effectiveCourage * 0.06`；所以這是 entry 專屬的直接對槍 consumer。 |
| live aggression | `aggr()` 五個 role 都讀 effective courage，係數為 `0.5 / 100`；這是 Courage 最廣泛的 live consumer。 |
| immediate actions | `aggr()` 影響 pair fire chance；`aggr < 0.82` 會進入撤退判定，再影響 displacement / re-engage。 |

`formMul` 仍是整個 `combatSkill` 的 morale / condition 倍率，不是 Courage 專用修正；因此 raw/effective Courage 的語意沒有發現需要 production semantic patch 的問題。

## 4. 五個 role 的 direct/local 結果

以下數字是 16 seeds 的平均；`strict majority` 的規則是必須 **> 8/16**。

| Role | Personality | raw low / base / high | effective low / base / high | role-fit Courage | aggression | entry combat direct |
|---|---|---:|---:|---:|---:|---:|
| entry | aggressive | 78 / 88 / 98 | 84 / 94 / 99 | 16/16 monotonic | 16/16 monotonic | 16/16 monotonic |
| rifler | genius | 74 / 84 / 94 | 74 / 84 / 94 | N/A（無 raw read） | 16/16 monotonic | N/A（無 entry read） |
| awp | calm | 64 / 74 / 84 | 60 / 70 / 80 | N/A（無 raw read） | 16/16 monotonic | N/A（無 entry read） |
| lurker | lonewolf | 70 / 80 / 90 | 70 / 80 / 90 | N/A（無 raw read） | 16/16 monotonic | N/A（無 entry read） |
| igl | shotcaller | 68 / 78 / 88 | 68 / 78 / 88 | N/A（無 raw read） | 16/16 monotonic | N/A（無 entry read） |

`combatSkill()` 的一般結果在非 entry role 仍可能改變，但本輪沒有把它誤報成 Courage direct read；非 entry 的可證明 Courage local path 是 `aggr()`，而不是 `combatSkill()` 內的 Courage 項。

## 5. Local KPI 與 downstream 結果

| Role | pair candidate low / base / high | pair admission rate | retreat trigger rate | target attacker damage | target attacker kills | target survival |
|---|---:|---:|---:|---:|---:|---:|
| entry | 814 / 773 / 746 | 0.4509 / 0.4644 / 0.4678 | 0 / 0 / 0 | 9,139 / 9,178 / 9,224 | 90 / 93 / 94 | 0.4063 / 0.4451 / 0.4430 |
| rifler | 1,178 / 1,224 / 1,242 | 0.4788 / 0.4771 / 0.4726 | 0 / 0 / 0 | 16,110 / 17,950 / 17,253 | 139 / 149 / 149 | 0.0976 / 0.1220 / 0.1071 |
| awp | 502 / 502 / 502 | 0.5040 / 0.5040 / 0.5040 | 1 / 1 / 1 | 7,904 / 7,904 / 7,904 | 67 / 67 / 67 | 0.6159 / 0.6159 / 0.6159 |
| lurker | 827 / 818 / 735 | 0.4837 / 0.4939 / 0.5456 | 1 / 1 / 0 | 12,408 / 12,693 / 14,210 | 109 / 110 / 130 | 0.4691 / 0.4878 / 0.5647 |
| igl | 988 / 978 / 1,002 | 0.4312 / 0.4284 / 0.4501 | 1 / 1 / 0 | 8,630 / 8,403 / 10,745 | 77 / 74 / 83 | 0.1152 / 0.1098 / 0.0602 |

這裡的 kills / damage / survival 都是 target-player-only secondary observation：目標玩家作為 attacker 的輸出只算目標自己的事件；目標作為 defender 的 deaths / survival 分開；CT 的輸出另列 spillover，沒有混進 target KPI。

## 6. Monotonicity、effect size、clamp 與 threshold

| Role | local aggression | pair admission | target damage | target kills | damage effect size low→base / base→high |
|---|---:|---:|---:|---:|---:|
| entry | 16/16 | 8/16（不通過） | 6/16（不通過） | 5/16（不通過） | -0.0166 / 0.0417 |
| rifler | 16/16 | 5/16（不通過） | 4/16（不通過） | 5/16（不通過） | -0.2469 / -0.0873 |
| awp | 16/16 | 0/16（不通過） | 0/16（不通過） | 0/16（不通過） | 0 / 0 |
| lurker | 16/16 | 6/16（不通過） | 10/16（通過） | 9/16（通過） | -0.0906 / 0.3066 |
| igl | 16/16 | 11/16（通過） | 9/16（通過） | 7/16（不通過） | 0.4091 / 0.5115 |

### Clamp / saturation

- `entry` 的 personality 加成使 high effective courage 到 99；high arm 觀測到 runtime clamp，但沒有 high-vs-baseline effective plateau seed。
- 其他四個 role 本輪沒有 Courage clamp，也沒有 effective high plateau。
- treatment 本身沒有越過 raw 1～99；使用 ±10 是為了避免 t1 raw high=100 的非法 treatment。

### Threshold

- `entry`：1.055 / 1.105 / 1.130，都在 0.82 以上。
- `rifler`：0.8904 / 0.9404 / 0.9904，都在 0.82 以上。
- `awp`：0.6124 / 0.6624 / 0.7124，都在 0.82 以下；所以本輪撤退 gate 有 coverage，但不會因 treatment crossing 改變。
- `lurker`：0.7588 / 0.8088 / 0.8588，16/16 crossing 0.82；高值會從每個 opportunity 都撤退變成不撤退。
- `igl`：0.727 / 0.777 / 0.827，16/16 crossing 0.82；高值同樣改變 retreat 的離散分支。

## 7. Path amplification 與 readiness

所有 role 的 low/high strict simulation digest 都是 16/16 changed，表示 deterministic path 會看到 Courage treatment；但 match-level target KPI 的變化不等於穩定的局部效果：

- entry / rifler 的 pair、攻守交換與整場結果造成 primary local action 不穩定。
- awp 的 effective Courage / aggr 會變，但既有固定路徑沒有把變化傳到本輪 pair 或結果，這是 opportunity / consumer coverage 限制，不是公式反轉。
- lurker / igl 的 threshold crossing 會造成離散 retreat 行為，並進一步放大整場路徑。

R22 framework 成功重用：本輪共用同一組分層、paired effect、strict-majority、threshold、clamp、changed-seed 與 target attribution 邏輯，沒有建立第二套 simulator。

## 8. Findings / 決策

### Blocking

無 verifier、attribution、determinism、RNG、production diff 或 historical evidence blocking issue。

### Non-blocking / calibration risk

- Courage 的 direct local signal 已被證明存在，但五個 role 的即時 action 不具一致 monotonic calibration signal。
- lurker / igl 的 0.82 threshold crossing 是真實產品行為，不應為了讓 calibration 通過而修改 threshold 或 scenario。
- entry 有 raw role-fit 與 effective live combat 兩條不同用途的 read；這是既定產品語意，不是 duplicate read 或 double counting proof。
- 本輪 verifier 是 memory-only simulator measurement，沒有宣稱 Three.js browser renderer、GPU、FPS 或真機 UX 已完成 profile。

### 最終判定

- Courage measurement：**Go**
- Courage semantic：**已確認，無需 production patch**
- Courage calibration readiness：**Revise / Deferred**
- 下一項 Courage balance calibration：**No-Go**；應先處理 role-aware local opportunity coverage 或另定不受 threshold 放大的 calibration read point，但不在本輪擴大。
