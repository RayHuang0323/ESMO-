# R22 — CS Local Causal Calibration Framework 報告

## 1. 結論

R22 framework：**Go / PASS**。

本輪沒有修改 production source、balance constant、retreat threshold、role mapping、RNG、
scenario 或 R1～R21 historical evidence。沒有開始 Courage calibration；Courage 只可作為
下一項 **measurement design / focused verifier**，不可直接進入 balance calibration。

R22 的 `Ready for calibration pilot` 是 local causal pilot readiness，不是完整 match-level
balance approval：

| Stat | Level 1 direct | Level 2 opportunity | Level 3 immediate action | Level 4 downstream | Readiness |
|---|---|---|---|---|---|
| Reflex | monotonic | `Pt` 可歸因且 aggregate monotonic | conversion 被 path 放大 | kill / damage 非 primary gate | **Ready for calibration pilot** |
| Positioning | 5 roles direct monotonic | entry / rifler coverage 不足 | `0.82` gate 主導，離散跳變 | survival / pair 受 path 放大 | **Deferred** |
| APM | effective / combatSkill / aggr direct monotonic | pair / retreat opportunity 可量測 | admission / retreat 作 spillover | kill / damage 非 primary gate | **Ready for calibration pilot** |

註：Reflex 的 R19 historical report 公布的是每個 role 的 aggregate paired direction，沒有
公布 seed-level passing mask；R22 沒有把它誤報成 `16/16`。下一個 Reflex calibration pilot
仍必須補上 16 fixed seeds 的 strict-majority output。

## 2. Framework 與 verifier

新增：

- `tools/cs_calibration_measurement.mjs`：純 measurement helper，不建立第二套 simulator。
- `tools/check_cs_local_causal_framework_r22.mjs`：只回放既有 R18-A、R19、R20、R21 report
  的固定 evidence metadata 與數值；以 prior report SHA-256 防止 historical snapshot 被靜默改寫。
- `review/cs-gameplay/CS_LOCAL_CAUSAL_CALIBRATION_R22_SPEC.md`：分層、KPI 與 gate 規格。
- `tools/verify.mjs`：新增 `cs_local_causal_framework_r22` aggregate segment。

分層如下：

1. **Level 1 — Stat / Direct Consumer**：raw、effective、direct formula、clamp / threshold。
2. **Level 2 — Local Opportunity**：stat 有資格影響的 opportunity，明確 attacker / defender /
   target。
3. **Level 3 — Immediate Action / Conversion**：opportunity 是否觸發 local action。
4. **Level 4 — Downstream Match Outcome**：kill、damage、survival、economy、winner，只作
   secondary spillover。

16 seeds 的 strict-majority 固定為 `passingSeeds > totalSeeds / 2`；8/16 不通過，9/16 才
通過。helper behavioral contract 另外驗證 paired effect、monotonicity、threshold crossing
與 clamp。

R22 framework evidence：

- fixed seed metadata：16；seed set SHA-256：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- source SHA-256：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`
- static RNG call sites：21；R22 無新增 RNG。
- prior R18-A / R19 / R20 / R21 report SHA 與 suite digest 全部通過 provenance gate。
- framework suite digest：`b0c4db3a0122f720006f679b33792de06dddc0f05c6412afbcca92d8838a4b38`

## 3. Reflex reclassification

R19 已證明五個 role 的 direct `combatSkill` / `Pt` paired direction 都是 low 端下降、high
端上升；R18-A 修正版仍保留 target-player-only conversion / kill / damage 的 `0/15` outcome
monotonic checks。R22 將兩者分層，而不是互相覆蓋：

| Role | direct combatSkill low→base / high→base | direct Pt low→base / high→base | raw posSkill rxn weight | downstream path |
|---|---:|---:|---:|---|
| entry | -2.8351 / +2.7805 | -0.0382 / +0.0268 | 4 | 有 |
| rifler | -2.5820 / +2.0893 | -0.0318 / +0.0279 | 4 | 有 |
| awp | -1.8229 / +1.3748 | -0.0245 / +0.0266 | 1 | 有 |
| lurker | -2.1141 / +2.2154 | -0.0298 / +0.0272 | 0 | 有 |
| igl | -2.1317 / +2.5642 | -0.0211 / +0.0322 | 0 | 有 |

**判定：**

- primary：`effectiveReflex / combatSkill` 與 `Pt` local opportunity 有正向 direct/local signal。
- evidence mode：本輪 Reflex direct gate 是 R19 aggregate paired direction；沒有宣稱 seed-level
  strict-majority，下一個 pilot 必須補齊該輸出。
- secondary：target attacker-only conversion / kill / damage 保留，但受到 `Pt → attacker
  branch → alive / pair / economy / round state` 的 deterministic path amplification。
- semantic ambiguity：R19 已完成 rawReflex / effectiveReflex boundary，未再發現新的 semantic
  blocking issue。
- saturation：R18-A 三點 pilot 為 `0/5`，是未觀察到 saturation，不是已證明 plateau。
- readiness：**Ready for calibration pilot（僅 local causal scope）**。此判定不推翻 R18-A
  match-level `Revise`，也不提出 balance patch。

## 4. Positioning reclassification

R20 的 direct consumer 五個 role 都有 low / baseline / high 正向讀鏈，effective position 每次
增加 12、`aggr` 每次增加 0.0144；但 local behavior coverage 與 threshold 仍不足：

| Role | effective combatSkill low / base / high | aggr low / base / high | local retreat boundary |
|---|---:|---:|---|
| entry | 83.1171 / 84.3426 / 85.5629 | 1.0906 / 1.1050 / 1.1194 | coverage 不足；三段均無 trigger |
| rifler | 86.3047 / 87.8730 / 89.4941 | 0.9260 / 0.9404 / 0.9548 | coverage 不足；三段均無 trigger |
| awp | 84.1451 / 86.3886 / 88.0640 | 0.6480 / 0.6624 / 0.6768 | 有 coverage；事件少、downstream path |
| lurker | 87.8560 / 90.0846 / 93.2253 | 0.7944 / 0.8088 / 0.8232 | high 跨 `aggr < 0.82`，16/16 threshold crossing |
| igl | 76.7488 / 77.7788 / 79.3025 | 0.7626 / 0.7770 / 0.7914 | 有 coverage；re-engage / survival path 放大 |

**判定：** positioning direct read-chain 不是 formula failure；但 Level 2 coverage 不足、Level
3 retreat 被硬門檻主導，故為 **Deferred**。不得修改 `0.82` threshold，也不得為了 coverage
修改 scenario。

## 5. APM reclassification

R21 的 effective APM、combatSkill、aggr direct read 均有正向 signal；combatSkill strict-majority
為 entry `16/16`、rifler `13/16`、awp `14/16`、lurker `16/16`、igl `16/16`。8/16 的 target
KPI 不被視為 pass。

| Role | direct combatSkill | direct aggr | target damage monotonic | target kills monotonic | threshold / clamp |
|---|---:|---:|---:|---:|---|
| entry | 16/16 | 16/16 | 10/16 | 8/16 | 無 |
| rifler | 13/16 | 16/16 | 5/16 | 5/16 | 無 |
| awp | 14/16 | 16/16 | 3/16 | 2/16 | 無 |
| lurker | 16/16 | 16/16 | 7/16 | 7/16 | `aggr` 跨 0.82；high clamp reads 2083 |
| igl | 16/16 | 16/16 | 7/16 | 9/16 | 無 |

**判定：**

- primary：raw/effective APM、combatSkill、aggr direct consumer 可作 local causal gate。
- secondary：pair admission、retreat trigger、target damage / kill、survival、winner 不作
  primary monotonic gate。
- lurker 的 `0.7896 → 0.8088 → 0.8232` crossing 與 high effective clamp 是真實 boundary，
  已被隔離為 threshold / saturation spillover，沒有用調 threshold 或 scenario 消除。
- readiness：**Ready for calibration pilot（僅 local causal scope）**；不等同 R21 原本的
  match-level balance calibration `Revise / No-Go`。

## 6. Deterministic path amplification 是否隔離

**已成功在 measurement gate 層級隔離，未消除 production path。**

R22 將可直接歸因的 Level 1～2 signal 與 Level 3～4 的離散結果分開報告；因此：

- direct/local monotonic 不再被 match-level kill / damage / survival 的非單調直接否決。
- threshold dominated、insufficient opportunity coverage、downstream path amplified 分別
  標記，不能混稱為 stat formula non-monotonic。
- historical match KPI 沒有刪除或重算，只降低其 calibration gate 層級。
- R22 沒有做 rebaseline；既有 R18-A、R19、R20、R21 report 由 SHA-256 provenance gate 保護。

## 7. Courage 下一步

Courage 可成為下一個 **measurement-only stat**：**Go**。

前提是沿用 R22 四層框架，先定義 courage 的 raw/effective boundary、實際 opportunity、
immediate action 與 target attribution；Level 4 kill / survival / winner 只能作 secondary。
本輪不建立 Courage simulator sweep、不改 balance、不開始 calibration。

## 8. 驗證與 Review

- `node tools/check_cs_local_causal_framework_r22.mjs`：PASS，helper contracts、historical
  provenance、classification 與 repeated digest 均 PASS。
- repeated digest：相同 `b0c4db3a0122f720006f679b33792de06dddc0f05c6412afbcca92d8838a4b38`。
- `node tools/verify.mjs --only=cs_local_causal_framework_r22 --timeout=600000`：PASS，aggregate
  runner 以 exit code 0 通過。
- historical checkpoint gate：PASS；`node tools/verify.mjs --resume` 略過 16 個既有通過區段
  （R1～R17、R20、R21），沒有重跑或 rebaseline；R18-A / R19 則由 prior report SHA-256 與
  suite digest provenance gate 保護。
- `npm.cmd run build`：PASS，Vite 5.4.21、2,643 modules；保留既有 large-chunk warning，
  沒有因此改架構。
- `/review`：PASS；確認 verifier 不是只做 keyword/結構檢查，而是執行 helper behavioral
  contracts、數值 readiness classification、historical SHA provenance 與 repeated digest；
  Level 4 沒有被當成 primary，沒有 production/RNG/contract diff，handoff 與本報告一致。

## 9. 最終判定

- R22 local causal framework：**Go**。
- Reflex local causal readiness：**Ready for calibration pilot**；match-level calibration 維持
  Deferred / Revise。
- Positioning local causal readiness：**Deferred**。
- APM local causal readiness：**Ready for calibration pilot**；match-level calibration 維持
  Deferred / Revise。
- Courage measurement：**Go（只做 measurement design）**。
- Production balance patch：**No-Go／本輪不提出**。
