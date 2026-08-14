# R39 CS 反應力正式 Calibration Pilot 報告

## 結論

R39 使用 5 個 role、5 個 Reflex level、16 fixed seeds，共 400 arms。主要 direct combat KPI 在 20 個相鄰 role bands 全部通過 strict-majority；沒有新增 RNG、scenario 或 production balance patch。

suite digest：`6c1ef1bd1fb68e866b9c81571045778cd3cd92326b6a7d6c045d803ced21cb08`

## 每增加 10 點的 direct effect

| role | combatSkill | mechanics | weapon | raw role-fit / posSkill | Pt |
|---|---:|---:|---:|---:|---:|
| entry | +0.1983 | +0.1490 | +0.2680 | +0.2667 | +0.00220 |
| rifler | +0.1998 | +0.1490 | +0.2703 | +0.2667 | +0.00293 |
| awp | +0.1288 | +0.1760 | +0.1111 | +0.0667 | +0.00180 |
| lurker | +0.1442 | +0.1490 | +0.2672 | +0 | +0.00199 |
| igl | +0.1970 | +0.1760 | +0.3260 | +0 | +0.00240 |

這是同一個固定場景下的 local paired mean，不是整場勝率或獎勵換算。

## 區間與 clamp

- 60→90：五個 role 的 direct `combatSkill` 都大致線性、20/20 adjacent bands strict-majority。
- 90→100：aggressive / genius / lonewolf 的 raw 100 會被 effective clamp 到 99，因此 entry、rifler、lurker 的斜率明顯變小；這是 saturation boundary，不是反應力係數過低。
- awp 的 direct scaling 最小；rifler、entry、IGL 約 0.197～0.200，沒有證據顯示 entry 額外 consumer 把 Reflex 價值推到不合理高點。
- 沒有觀測到 direct effect 過大的區間；60→70 的 AWP local effect 較小，但仍保持正向，屬 role scaling 而非失效。

## Level 2 / 3 / 4

- opportunity coverage：entry 約 44～50、rifler 68～79、awp 29～30、lurker 48～57、IGL 63～78；五個 role 都有合法 opportunity，但數量不同。
- `Pt` 的五段平均均維持上升，且納入 direct strict-majority；local conversions 大致隨 Reflex 上升，但 entry 在 80→90、lurker 在 80→90 出現小幅波動，符合 downstream path amplification 風險。
- kills / damage 只作 secondary：AWP 低段與 lurker 中段可出現非單調，不能用來否定 direct local calibration。

## Calibration 判定

- production patch：**無**。目前不需要改 coefficient、clamp 或 role mapping。
- 建議 calibration range：**60～90 作為量測與 pilot range；70～90 作為較穩定的日常平衡工作區間**。
- raw 100 應視為 effective 99 的 saturation boundary，不宜當作一般線性校準點。
- Reflex：**Calibration Ready（local pilot）**；尚非「最終 balance Done」，因為整場 outcome 仍受離散路徑放大。

## Provenance / review

- current source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- R19 read-chain verifier：PASS（以 current-source adapter 保留 R19 historical view）
- R22 framework、R38 status、historical / progress / Q7a / build gates：PASS
- historical evidence 未 rebaseline；R18-A / R19 evidence 保留不覆寫。
