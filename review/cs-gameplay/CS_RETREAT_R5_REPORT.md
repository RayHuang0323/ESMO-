# CS Retreat Instrumentation R5 — 完成報告

日期：2026-08-10
狀態：**PASS／retreat action-point coverage 已建立**
Calibration：**No-Go**

## 完成範圍

新增：

- `tools/check_cs_retreat_instrumentation_r5.mjs`
- `tools/verify.mjs` 的 `cs_retreat_r5` segment

未修改：

- `src/battle/fps/EsportsFPS3D.jsx`
- CS23、R1–R4 verifier
- gameplay／result／contract／Store／UI／roster adapter／dependency／平衡值

正式 FPS source SHA-256 仍為：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 量測鏈

Vite test-only exact memory hooks 建立 `CsRetreatInstrumentation.v1`：

1. `retreat_opportunity`：既有 movement tick 中，距離、HP、隊友存活等結構條件成立；
2. `retreat_trigger`：正式 `aggr(p) < 0.82` branch 真正通過；
3. `retreat_displacement`：`safeMove` 後的真實 from/to 與距離；
4. round-player retreat episode：把同回合、同玩家的重複 trigger 分組；
5. `retreat_recontact`：之後再次進入既有 combat pair 並即將消耗 fire roll；
6. `retreat_reengage`：該 episode 後第一次真正通過既有 fire roll；
7. `retreat_round_result`：episode 最終 survived／won 與 round kills。

`retreat_opportunity` 是 player-tick exposure，不是撤退決策數；episode 是量測分組，不是
引擎 state。survive／won 只作 action chain 終點，不能解讀為 retreat 導致勝負。

## 等價性 hard gates

固定 R1 的 16 seeds、Inferno、`t_aexec`、`c_std` 與既有 ROSTER。每 seed 執行：

- collector off
- collector on-1
- collector on-2

共 48 simulations，逐 seed 證明：

- off／on-1／on-2 完整 sim JSON 相同；
- on-1／on-2 events 相同；
- transform 逆轉後逐字等於正式 source；
- 21 個 `rand()` call tokens 與全部 RNG token 序列不變；
- input simulate 前後 hash 相同；
- opportunity→gate→trigger→displacement、episode→recontact→re-engage→result identities
  與累計值全部閉合；
- 每個 played round 恰有一筆 summary，winner／how 對回 sim。

R5 event suite：
`4e94fc5c2e95633f7972d19b8864e846b793a893dbdb9a8610e84f01c87c6f20`。

## 固定情境結果

16 場、171 rounds 的單份 collector events：

| KPI | 結果 |
|---|---:|
| player-tick opportunities | 1,492 |
| 平均 opportunity `aggr` | 0.8765 |
| gate passes / blocked | 895 / 597 |
| trigger rate | 59.987% |
| `aggr` 介於 0.82–0.87 的近門檻 opportunities | 0 |
| triggers / actual displacements | 895 / 895 |
| total / average displacement | 2,440.276 / 2.727 |
| zero displacements | 6 |
| round-player episodes | 261（T 104 / CT 157） |
| recontacts | 94（36.015% episodes） |
| fire re-engages | 74（28.352% episodes） |
| survived episodes | 60（22.989%） |
| won episodes | 124（47.510%） |
| survived and won | 48 |

結果欄沒有做 p-value、顯著性或因果判定。尤其 124 次 won episodes 不能與沒有 retreat 的
反事實比較，也不能當成 retreat 效果大小。

### 玩家分布

| 玩家／角色 | opportunities | 平均 `aggr` | triggers | episodes | recontacts / re-engages |
|---|---:|---:|---:|---:|---:|
| t1 / entry | 137 | 1.1050 | 0 | 0 | 0 / 0 |
| t2 / rifler | 272 | 0.9404 | 0 | 0 | 0 / 0 |
| t3 / awp | 21 | 0.6624 | 21 | 7 | 1 / 1 |
| t4 / lurker | 148 | 0.8088 | 148 | 47 | 20 / 17 |
| t5 / igl | 187 | 0.7770 | 187 | 50 | 19 / 11 |
| ct1 / igl | 275 | 0.7792 | 275 | 50 | 6 / 3 |
| ct2 / awp | 82 | 0.7368 | 82 | 20 | 3 / 3 |
| ct3 / rifler | 62 | 0.8020 | 62 | 31 | 15 / 14 |
| ct4 / entry | 188 | 1.1320 | 0 | 0 | 0 / 0 |
| ct5 / support | 120 | 0.7040 | 120 | 56 | 30 / 25 |

固定 roster 的 `aggr` 呈現離散分段：五名玩家全部通過，三名高 aggression 玩家全部阻擋，
且沒有近門檻 exposure。這不是「branch 未生效」；它證明 branch 有大量作用機會，但本 baseline
不適合拿來判斷 threshold 附近的 treatment sensitivity。

## 新證據與分類

### B → closed for baseline：retreat instrumentation 缺口已補

現在能分開量 structural opportunity、threshold trigger、真實位移、episode、重新接敵、重新開火
與 round result，不再以 trigger counter 代替 gameplay outcome。

### E：作用範圍受固定 roster 分布限制

`t1`／`t2`／`ct4` 在固定 baseline 有 597 次 blocked opportunities，但沒有 trigger；其餘
五名低於門檻玩家則每次 exposure 都通過。R5 只證明接線與分布，不足以判斷
`apm/positioning/courage/clutch` 的 retreat 權重或 calibration 方向。

### 診斷，不是 bug：6 次 trigger 的實際位移為 0

正式 branch 有執行，但 `safeMove` 因牆面／碰撞沒有位移。R5 保留此真實輸出；不能排除事件
或把指令距離 3.2 當成實際位移。是否要改路徑行為屬 gameplay/design 問題，本輪不修改。

## 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,cs_retreat_r5,build --timeout=600000
```

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS；`CsGameplayDigest.v1` expected suite 未變。
- R2／R3／R4／R5：全 PASS。
- build：PASS。
- runner 本次 7/7、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- 正式 source、RNG、gameplay/result shape 均未變。
- `git diff --check`：PASS。

## 下一個最小 Sprint

建議只做 **CT Defuse Instrumentation R6**：建立 bomb planted 後的 CT defuse opportunity→
start/continue/progress→interrupt/complete→round result，並先讀現行 0.1 秒 tick、距離、存活與
kit/progress 條件。仍只用 test-only hooks，不修改 defuse 規則、時間、地圖、經濟或結果契約；
Calibration 維持 No-Go。
