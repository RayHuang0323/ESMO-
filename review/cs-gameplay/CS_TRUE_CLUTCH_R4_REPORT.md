# CS True Clutch / LastAlive Instrumentation R4 — 完成報告

日期：2026-08-10
狀態：**PASS／clutch opportunity coverage 已建立**
Calibration：**No-Go**

## 完成範圍

新增：

- `tools/check_cs_clutch_instrumentation_r4.mjs`
- `tools/verify.mjs` 的 `cs_clutch_r4` segment

未修改：

- `src/battle/fps/EsportsFPS3D.jsx`
- CS23、R1、R2、R3 verifier
- gameplay／result／contract／Store／UI／roster adapter／dependency／平衡值

正式 FPS source SHA-256 仍為：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 量測鏈

Vite test-only exact memory hooks 建立 `CsTrueClutchInstrumentation.v1`：

1. `clutch_opportunity`：每 tick fresh alive arrays 建立後，某 side 恰剩一人且敵方仍有人；
2. `clutch_combat_opportunity`：lastAlive player 所在 pair 已通過 range／LOS／smoke／cap，
   正要消耗既有 fire roll；
3. `clutch_combat_trigger`：既有 fire roll 通過且 Pt 已計算；
4. `clutch_combat_conversion`：既有 duel/headshot/damage rolls 完成；
5. `clutch_round_result`：該 state opportunity 最終勝負；
6. `round_clutch_summary`：每回合 legacy `clutchId` 與 opportunity IDs 對照。

State hook 刻意放在 combat 前的 fresh `aliveT/aliveCT` 後。combat 發生死亡後，既有 array
只會讓成員的 `dead` 改變，`.length` 不會自動縮短；若在 combat 後讀 length，會製造
錯誤 lastAlive 判定。

1v1 時雙方都是 lastAlive，所以一個 1v1 state 可產生兩筆 player opportunity；
`opponentCount >= 2` 另列為 disadvantaged 1vN，不混在一起解讀。

## 等價性 hard gates

固定 R1 的 16 seeds、Inferno、`t_aexec`、`c_std`、既有 ROSTER。每 seed 執行：

- collector off
- collector on-1
- collector on-2

共 48 simulations。逐 seed 證明：

- off／on-1／on-2 完整 sim JSON 相同；
- on-1／on-2 event digest 相同；
- transform 逆轉後逐字等於正式 source；
- 21 個 `rand()` call tokens 與全部 RNG token 序列不變；
- state opportunity 唯一且能連到 combat／round events；
- combat opportunity ≥ trigger，trigger＝conversion；damage／kill invariants 成立；
- 每個 played round 恰有一筆 summary；legacy event 累計等於原 sim `players[].clutches`；
- 輸入前後 hash 相同。

R4 event suite：
`1a0e78c1073dea522dffa52e87aab4f094f4116a778d4cfe7a9fe9127aedc6d3`。

## 固定情境結果

16 場共 171 rounds：

| KPI | 結果 |
|---|---:|
| simulations | 48（off/on-1/on-2） |
| lastAlive player opportunities | 158 |
| T / CT opportunities | 85 / 73 |
| 1v1 opportunities | 18 |
| 1v2+ opportunities | 140 |
| 1v2 / 1v3 / 1v4 / 1v5 | 24 / 50 / 40 / 26 |
| opportunity wins | 32（20.253%） |
| 1v2+ wins | 22（15.714%） |
| clutch combat opportunities | 444 |
| fire triggers / conversions | 266 / 266（59.91%） |
| conversion kills | 159 |
| kills by active clutch attacker | 74 |
| legacy `clutches` | 27 |
| legacy without measured opportunity | 0 |
| opportunity wins not counted by legacy | 5 |
| omitted wins by how | bomb 1 / time 4 / defuse 0 / elim 0 |
| target `t2` state / combat opportunities / wins | 1 / 2 / 1 |

這些是固定情境的 action/result counts，不是權重強弱或統計顯著性結論。

## 新證據與分類

### A. Legacy `clutches` 是 kill-involved subset，不是完整 1vN wins

固定情境 32 次 lastAlive opportunity wins 中，legacy 只記 27 次。五次未記入都沒有符合
「本回合至少一 kill」：1 次炸彈引爆、4 次時間結束。反向的 legacy false positive 為 0。

因此現有 contract 欄位忠實實作 legacy 條件，但若 UI／文件把它解讀為「全部 clutch wins」，
就是 **A 類 measurement/semantic bug**。本輪不改欄位、result shape 或歷史資料。

### B → closed for baseline. True-clutch instrumentation 缺口已補

現在能分開量 state opportunity、combat pair opportunity、fire trigger、duel conversion 與
round conversion，不再用 summary counter 代替 outcome。這只關閉 fixed baseline 的
instrumentation 缺口，不代表 sample 已足以 calibration。

### E. `resilience` 確實是極窄 lastAlive 素質

R3 的 `t2.res 84→64` 在 16 seeds 為 0/16 gameplay differences；R4 證明同一 baseline 中
`t2` 不是完全沒機會，而是只有 **1 次 state opportunity、2 次 combat opportunities、1 次勝利**。
這個樣本太稀疏，不能判定接線失效、權重過輕或效果合理。病因維持情境限定，Calibration No-Go。

## 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,build --timeout=600000
```

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS；`CsGameplayDigest.v1` expected suite 未變。
- `cs_instrument_r2`：PASS。
- `cs_stat_wiring_r3`：PASS。
- `cs_clutch_r4`：PASS。
- build：PASS。
- runner 本次 6/6、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- `git diff --check`：PASS。

## 下一個最小 Sprint

建議只做 **CS Retreat Instrumentation R5**：fresh retreat opportunity→`aggr < 0.82`
gate→actual displacement→後續 re-engage / survive / round result，服務 `apm/positioning/courage/clutch`。
不夾帶 defuse、公式修改、threshold 調整或 calibration；仍以 test-only hooks 與逐 seed
`CsGameplayDigest.v1` 等價性保護。
