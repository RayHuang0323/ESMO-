# R21 CS APM Measurement / Calibration Readiness Report

日期：2026-08-12
Verifier：tools/check_cs_apm_measurement_r21.mjs
Aggregate：cs_apm_measurement_r21
狀態：**Measurement Go；Calibration Readiness Revise**

## 1. 執行摘要

R21 已完成 APM 的 production read-chain measurement，沒有修改 production source、RNG、stat formula、role mapping 或其他 stat。

本輪 evidence：

- 5 roles × low / baseline / high × 16 fixed seeds。
- 每個 arm 另做 uninstrumented + 2 次 instrumented deterministic comparison，共 528 次 simulator execution。
- suite digest：0380561f76b66ddf774fdf86decf048bd261082c23fe06a978553d637a8d429a。
- 第二次完整 focused run 產生相同 digest。
- engine source SHA：57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29。
- RNG call sites：21，未新增 RNG。

Direct read-chain 在五個 role 都符合預期：effective APM 與 combatSkill / aggr 的 direct effect monotonic；但 match-level target KPI 受 deterministic path amplification 影響，沒有形成跨 role、跨 seed 的可靠 calibration signal。

## 2. Read-chain 結論

| Read point | 實際結果 |
|---|---|
| raw APM | 由 target roster 的 stats.apm 讀取 |
| effective APM | persStat(apm) 只做 personality adjustment；awp calm、igl shotcaller 為 -4，lurker lonewolf 為 +6，其餘本輪目標無 APM personality delta |
| posSkill() | 保留 raw APM；只有 entry profile 的 APM role-fit weight 為 3，rifler / awp / lurker / igl 為 0 |
| combatSkill() | mechanical／weapon read 使用 effective APM；結果另包含 raw posSkill role-fit component，因此 entry 的 APM 有雙重 downstream exposure，R21 分開記錄兩者 |
| aggr() | 使用 effective APM，係數 0.16 / 100；直接 aggr read 五個 role 皆為 16/16 monotonic |
| movement | movement speed line 仍只使用 sta，沒有 APM 直接 speed consumer |
| downstream | aggr 會影響 pair fire chance；aggr < 0.82 會進入 retreat gate，形成離散 downstream path |

## 3. Treatment levels 與 direct measurement

| Role | Personality | raw low / base / high | effective low / base / high | combatSkill mean low / base / high | aggr mean low / base / high |
|---|---|---:|---:|---:|---:|
| entry | aggressive | 68 / 80 / 92 | 68 / 80 / 92 | 82.4505 / 84.3426 / 86.2747 | 1.0858 / 1.1050 / 1.1242 |
| rifler | genius | 75 / 87 / 99 | 75 / 87 / 99 | 86.3284 / 87.8730 / 89.6264 | 0.9212 / 0.9404 / 0.9596 |
| awp | calm | 66 / 78 / 90 | 62 / 74 / 86 | 85.4747 / 86.3885 / 86.9588 | 0.6432 / 0.6624 / 0.6816 |
| lurker | lonewolf | 72 / 84 / 96 | 78 / 90 / 99 | 88.4605 / 90.0846 / 92.1685 | 0.7896 / 0.8088 / 0.8232 |
| igl | shotcaller | 60 / 72 / 84 | 56 / 68 / 80 | 76.3333 / 77.7788 / 79.7640 | 0.7578 / 0.7770 / 0.7962 |

posSkill() role-fit mean：entry 78.3333 / 80.7333 / 83.1333；rifler 85.8 / 85.8 / 85.8；awp 84.8 / 84.8 / 84.8；lurker 82.2667 / 82.2667 / 82.2667；igl 89 / 89 / 89。這確認 APM 不是所有 role 的 role-fit positioning input；entry 會同時經 raw role-fit 與 effective mechanical 兩條下游路徑影響 live result。

## 4. Target-player-only KPI

以下 KPI 只取目標玩家自己的 attacker-side attackerKills / attackerDamageDealt，以及分開的 defender-side defenderDeaths；對手輸出另存為 spillover，沒有併入 target attacker KPI。

| Role | attacker kills low / base / high | attacker damage low / base / high | defender deaths low / base / high | survival rate low / base / high |
|---|---:|---:|---:|---:|
| entry | 76 / 93 / 112 | 8,003 / 9,178 / 10,960 | 101 / 91 / 87 | 0.3804 / 0.4451 / 0.4759 |
| rifler | 135 / 149 / 173 | 16,078 / 17,950 / 20,523 | 145 / 144 / 150 | 0.1049 / 0.1220 / 0.1329 |
| awp | 64 / 67 / 70 | 7,516 / 7,904 / 8,292 | 64 / 63 / 61 | 0.6025 / 0.6159 / 0.6391 |
| lurker | 121 / 110 / 120 | 13,877 / 12,693 / 13,015 | 87 / 84 / 74 | 0.4821 / 0.4878 / 0.5316 |
| igl | 79 / 74 / 116 | 8,880 / 8,403 / 12,219 | 147 / 146 / 143 | 0.1302 / 0.1098 / 0.1588 |

## 5. Monotonicity / effect size / saturation

所有數字均為 16 seeds；strict majority 是 > 8：

| Role | direct effective APM | direct combatSkill | direct aggr | target damage monotonic | target kills monotonic | target damage effect size low→base / base→high |
|---|---:|---:|---:|---:|---:|---:|
| entry | 16/16 | 16/16 | 16/16 | 10/16 | 8/16 | -0.3989 / 0.4621 |
| rifler | 16/16 | 13/16 | 16/16 | 5/16 | 5/16 | -0.2421 / 0.2607 |
| awp | 16/16 | 14/16 | 16/16 | 3/16 | 2/16 | -0.3433 / 0.3513 |
| lurker | 16/16 | 16/16 | 16/16 | 7/16 | 7/16 | -0.2993 / 0.0708 |
| igl | 16/16 | 16/16 | 16/16 | 7/16 | 9/16 | 0.1801 / 0.7855 |

註：awp 的 effect size 以 focused verifier 的 paired output 為準；其 direct mean effect 很小，且 target KPI 僅少數 seed 通過。8/16 的結果一律視為未通過，沒有用寬鬆 majority。

Saturation / clamp：

- entry、rifler、awp、igl：本輪沒有 runtime APM clamp。
- lurker：lonewolf +6 使 high effective APM 到 99，highClampReads=2083；仍沒有 high-vs-baseline effective plateau seed，但已出現上界 clamp，不能把 high 當作無限線性區間。
- 沒有因為 clamp 而改 treatment 或 scenario。

## 6. Threshold discontinuity 與 deterministic path amplification

- lurker 的 aggr 從 0.7896 → 0.8088 → 0.8232，跨過 0.82；16/16 seed 都被 verifier 標記為 threshold crossing。其 retreat trigger rate 為 1 → 1 → 0，屬離散 gate 行為。
- entry / rifler 在 threshold 之上，awp / igl 在 threshold 之下；本輪沒有其他 role 的跨線。
- 五個 role 的 low / high strict simulation digest 都是 16/16 changed，代表 deterministic path 會被 APM treatment 改變；但 target-only KPI 只在 2～10/16 seeds 改變，且 target damage 非單調 seed 數為：entry 6、rifler 11、awp 13、lurker 9、igl 9。
- target kill 非單調 seed 數為：entry 8、rifler 11、awp 14、lurker 9、igl 7。

因此 direct effect 並非不存在，而是經由 pair admission、攻守交換、存活與 round path 後，不能直接當成穩定 calibration signal。

## 7. Readiness 與風險

### Blocking

無 verifier、attribution、determinism 或 historical evidence blocking issue。

### Non-blocking / calibration risk

- APM live combat direct read-chain 已可量測，但主要 target KPI 尚未跨五 role 達到 strict-majority monotonic。
- lurker 的 aggr < 0.82 crossing 與 effective APM high clamp 是真實 product path，不應用改 threshold 或改 scenario 消除。
- posSkill() 只有 entry 使用 APM role-fit weight；若未來要宣稱「全 role APM positioning calibration」，需另做產品語意決策，R21 不擴大 scope。
- focused verifier 執行的是 memory-only simulator，沒有宣稱 Three.js browser FPS、GPU 或真機 UX；本輪未做瀏覽器 renderer profile。

### 結論

- APM measurement：**Go**
- APM semantic status：**已確認，無需 semantic patch**
- APM calibration readiness：**Revise / No-Go for balance calibration**
- 本輪不提出 production calibration patch；保留下一輪針對 path attribution 或 scenario-independent measurement 的工作，但不在 R21 自動開始。
