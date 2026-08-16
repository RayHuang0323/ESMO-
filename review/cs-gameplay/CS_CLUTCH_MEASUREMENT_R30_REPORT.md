# R30 CS「殘局能力」量測報告

日期：2026-08-13

## 結論

- focused measurement：Go / PASS
- Clutch semantic completeness：Revise
- Clutch balance calibration：No-Go / Deferred
- overall：Revise

## 白話結果

現在的 Clutch 不是「只要進入 1vN 就會替玩家做決策」。它實際上是 `stats.str`：一部分進角色適性，一部分進有效 combat mechanics；在 `lastAlive` 時額外給 combat modifier，在低血量也有 modifier；另外透過 `aggr()` 影響開火與可能的 retreat threshold。

它確實有作用。直接把五個 T role 的 raw `str` 做 low / baseline / high，effective 值、lastAlive combat、lastAlive bonus、local duel `Pt` 與 `aggr` 都是 16/16 strict-majority 單調；但這是「公式直接作用」證據，不等於每個 role 在實戰中都有足夠殘局樣本。

## 五個 role

| role | raw low/base/high | effective low/base/high | role-fit Clutch weight | baseline 真實殘局機會 |
|---|---:|---:|---:|---:|
| entry | 65 / 75 / 85 | 65 / 75 / 85 | 1 | 7 |
| rifler | 76 / 86 / 96 | 76 / 86 / 96 | 1 | 3 |
| awp | 74 / 84 / 94 | 80 / 90 / 99 | 2 | 0（但有一般 pair 觀察） |
| lurker | 68 / 78 / 88 | 68 / 78 / 88 | 1 | 25 |
| IGL | 75 / 85 / 95 | 75 / 85 / 95 | 0 | 3 |

基準五個 T role 合計 134 個 lastAlive opportunities，其中 122 個為 one-vs-many、29 個機會最後贏回合、215 個 clutch pair conversions；這些是機會與局部轉換，不是 215 個回合勝利。AWP 的 calm personality 使 high effective Clutch clamp 到 99，證明 saturation 邊界存在。Lurker baseline crossing `aggr` 0.82，顯示 generic aggression threshold 會放大 path；這不是專屬 Clutch threshold。

## 重疊與責任邊界

- Resilience：和 Clutch 共用 `lastAlive` combat 分支，但係數獨立；兩者目前是「同一情境的兩個 cofactor」，有責任重疊風險。
- Focus：不讀 lastAlive / aggr / defuse 的 Clutch 分支；Focus 負責 mechanics、weapon/holding 與 raw CT defuse progress。
- Decision：不讀 lastAlive Clutch 分支；Decision 留在 generic combat / defuse execution。
- Courage：和 Clutch 一樣進 `aggr`、fire / retreat path，但不等於 lastAlive Clutch coefficient。
- Defuse、utility、target choice、tactic、buy：本輪 source evidence 沒有 Clutch consumer。

## Review / gate

Blocking：無。verifier 具備 reversible transform、off/on/repeated-on output equality、event schema、R4 historical checkpoint、R22 four-level evidence 與 RNG token gate。

Non-blocking：真正 lastAlive opportunity 在五個 role 間很不均；runtime Level 2/3 strict-majority 不成立，且 generic `aggr < 0.82` path threshold 會產生 role-specific amplification。這些足以阻止 balance calibration，但不阻止 measurement 完成。

未做 semantic production patch：目前 evidence 支持先保留現有 read-chain，另開 semantic ownership Sprint 再決定是否把 legacy `str` 拆成「抗壓」與「殘局」責任；本輪不猜、不用調參掩蓋。

## 驗證

`node tools/check_cs_clutch_measurement_r30.mjs` PASS；`node tools/verify.mjs --only=cs_clutch_measurement_r30 --timeout=600000` PASS；528 simulator executions、repeated deterministic digest PASS、R4/R26 provenance gate PASS。Production source、RNG、scenario 與 historical evidence 未改。
