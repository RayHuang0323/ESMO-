# R31 CS「韌性／抗壓」量測報告

日期：2026-08-13

## 結論

- focused measurement：Go / PASS
- Resilience 的 direct read-chain：成立
- semantic completeness：Revise
- Resilience balance calibration：No-Go / Deferred
- overall：Revise

白話說，現在的「韌性」不是一個完整的低血量抗壓、撤退、拆彈或士氣系統。它目前只在玩家成為該回合單邊最後存活者時，透過 `combatSkill` 加上一個有效值 cofactor；一般對槍、low HP、role-fit、`aggr`／撤退、defuse、utility、target 或 tactic choice 都不直接讀 Resilience。

## 實際作用與五個 role

五個 role 的 direct effective Resilience、lastAlive combat、lastAlive bonus 與 local duel `Pt` 都是 16/16 strict-majority 正向；這證明它不是 dead stat。差異主要來自既有 lastAlive opportunity coverage，不是 role-fit 權重：

| role | raw low/base/high | effective low/base/high | baseline lastAlive opportunities | low-HP opportunities | role-fit Resilience weight |
|---|---:|---:|---:|---:|---:|
| entry | 66 / 76 / 86 | 66 / 76 / 86 | 7 | 1 | 0 |
| rifler | 74 / 84 / 94 | 70 / 80 / 90 | 3 | 2 | 0 |
| awp | 72 / 82 / 92 | 72 / 82 / 92 | 37 | 2 | 0 |
| lurker | 70 / 80 / 90 | 70 / 80 / 90 | 25 | 7 | 0 |
| igl | 76 / 86 / 96 | 76 / 86 / 96 | 3 | 2 | 0 |

全 baseline 16 seeds 合計：134 opportunities、19 low-HP opportunities、122 次 1vN、29 次 opportunity wins、215 次 pair conversions、24 次 legacy clutch，沒有 legacy-without-opportunity。機會數不是回合勝率；AWP 與 lurker 的機會較多，只表示固定 scenario 的生存路徑較常進 lastAlive。

Rifler 的 genius personality 對 Resilience 有 -4 effective adjustment；其餘代表 personality 在本 treatment 沒有 Resilience delta。所有本輪 ±10 值都未碰到 1/99 clamp。低 HP boundary 顯示 lowHP-only combat 值在 low/base/high 完全不變；包含 lastAlive 的 lowHP 值會跟著 Resilience 改變，原因是仍同時走 lastAlive cofactor，不是 Resilience 控制 low-HP modifier。

## 語意重疊

- Clutch：兩者共用 `lastAlive` combat branch；`str` 是 `(str - 76) * 0.22`，Resilience 是 `(res - 76) * 0.12`。責任可在公式上分開，但產品上都有「殘局 combat」含義，存在 duplicate ownership risk。
- Courage：Resilience 沒有直接進 `aggr`、fire chance 或 retreat gate；只因同屬 combat output 可能被玩家感覺為泛用抗壓，不能由本輪推論 Courage ownership。
- Focus：沒有 Resilience read 進 Focus mechanics、holding、weapon 或 defuse；兩者在 production read-chain 上可分離。
- morale / condition：`formMul` 會改最終 combat output，但不改 effective Resilience；這是 state multiplier 與 stat read 的邊界。

## 四層 evidence 與 readiness

- Level 1：5/5 role 的 direct effective/lastAlive/local duel signal 均 16/16 strict-majority；讀鏈、personality adjustment、role-fit weight 0、RNG zero-diff 與 input immutability 均 PASS。
- Effect / clamp / threshold：Resilience ±10 造成固定的 direct lastAlive bonus ±1.2（係數 0.12），local duel `Pt` 也呈固定同方向差；paired effect 的 seed 差異標準差為 0，因此 effectSize 依 R22 規則為非統計值（null），不是樣本推論。raw/effective clamp 都是 0/3，`aggr` 值完全不變，`aggr < 0.82` 沒有因 Resilience crossing。
- Level 2：baseline 有 134 次 opportunity，但 role coverage 不均（entry 7、rifler 3、awp 37、lurker 25、igl 3）；低 HP 僅 19 次，不能宣稱完整 low-HP calibration。
- Level 3：pair conversion 共有 215 次，但 treatment 的 immediate conversion 沒有跨 role 穩定 strict-majority；AWP high 的 structural path 只有 2/16 seeds 改變，顯示 deterministic path amplification，而非可直接拿來校準的單調訊號。
- Level 4：kills / damage / survival / winner 保留為 secondary；不可用整場結果反推 Resilience 的單一責任。

因此 measurement = **Go**，但 calibration readiness = **No-Go / Deferred**。需要先決定 Clutch 與 Resilience 是否都保留 lastAlive combat cofactor、各自責任如何命名與量測，再談 balance。

## 驗證與 provenance

- verifier：`tools/check_cs_resilience_measurement_r31.mjs`
- event schema：`CsResilienceMeasurementEvent.v1`
- suite schema：`CsResilienceMeasurementSuite.v1`
- suite digest：`fd43e879354d70de15d208d04e6f0b7d6a2f78c6204adfb197cc71caa882fd9a`
- engine source SHA-256：`f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`
- historical R4 event digest：`e3a32ac8990a1bd866936827701352cb4fdd8c665b1984e9eb2fd3942d6d0b0d`
- historical R4 event-only digest：`4d8b082092a5a735c76b0c75d5618d3eec7be8f45ac7ce59ed8a25a3ab7f053c`
- fixed seeds：16；`rand()` call sites：21；production source changed：no
- repeated deterministic digest、aggregate registration、historical gates、build 與 review 均需在 commit 前重跑；本 verifier 本身只做 memory transform，不新增 RNG 或 gameplay。
