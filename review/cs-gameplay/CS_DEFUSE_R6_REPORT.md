# CS Defuse Instrumentation R6 — 完成報告

日期：2026-08-10
狀態：**PASS／defuse opportunity→progress coverage 已建立**
Calibration：**No-Go**

## 完成範圍

新增：

- `tools/check_cs_defuse_instrumentation_r6.mjs`
- `tools/verify.mjs` 的 `cs_defuse_r6` segment

未修改：

- `src/battle/fps/EsportsFPS3D.jsx`
- CS23、R1–R5 verifier
- gameplay／result／contract／Store／UI／roster adapter／dependency／平衡值

正式 FPS source SHA-256 仍為：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 正式 defuse 語意

- Gameplay loop 每次 `sec += 2`，一個 defuse tick 是 2 秒。
- plant 設 `c4t=20`，同一 tick 後段先 `c4t--`；畫面顯示 `c4t * 2` 秒。
- production 取 tick-start `aliveCT` 中第一個距離包點 `<6` 的玩家；不是最近者，沒有 kit。
- `aliveT` 中任一距離 `<9` 且 LOS 通的玩家令 contested 成立。
- progress delta 是 `0.45 + focus/250 + decision/300`，累計到 `3.5` 完成。
- `defuseProg` 是 round-global accumulator，中斷、換人或死亡不 reset。
- `aliveT/aliveCT` 在 combat 前建立；defuse 在 combat 後讀同一陣列，成員可能已 `dead=true`。

## 量測鏈與 hard gates

`CsDefuseInstrumentation.v1` 以 Vite test-only exact hooks 記錄：

1. `defuse_plant`；
2. 每個 planted tick 的 production/fresh candidate、contestant、gate 與 progress-before；
3. 真正通過 production gate 的 progress before/delta/after；
4. progress crossing 後的 complete；
5. 每個 planted round 的 final progress、c4t、survivors 與 winner/how。

固定 R1 的 16 seeds、Inferno、`t_aexec`、`c_std`、既有 ROSTER；每 seed collector
off/on-1/on-2，共 48 simulations。逐 seed證明：

- off／on-1／on-2 完整 sim JSON 相同；
- on-1／on-2 events 相同；
- transform 逆轉後逐字等於正式 source；
- 21 個 `rand()` call tokens 與全部 RNG token 序列不變；
- input hash 不變；plant/tick/frame/progress/complete/result identities 全部閉合。

第一次執行顯示 fixed baseline 沒有 progress-start 後 pause。原規格把 pause `>0` 當 hard gate
會迫使更換 seed，故依 debugging 流程修正為：零值保留；pause/owner switch 繼續由同一純函式
推導，並以 start→pause→owner-switch synthetic chain 自我驗證。沒有追加或更換 seed。

R6 event suite：
`9c33c3c2b10ff48bf0acdc59067184a48f5408f6b32b88324137fdd9fa0d7368`。

## 固定情境結果

16 場／171 rounds 的單份 collector events：

| KPI | 結果 |
|---|---:|
| planted rounds | 20（11.696%） |
| bomb ticks | 140 |
| production / fresh proximity ticks | 27 / 24 |
| contested ticks | 11 |
| progress ticks | 16（11.429% bomb ticks；59.259% proximity） |
| progress-started rounds | 4 |
| pause ticks after start / owner switches | 0 / 0 |
| total / average progress delta | 17.0053 / 1.0628 |
| completes / defuse results | 4 / 4 |
| incomplete-progress rounds | 0 |
| `how=bomb` results | 16 |
| `how=bomb` 且 c4t=0 / c4t>0 | 1 / 15 |
| `how=bomb` 且 final fresh CT=0 | 14 |
| stale defuser ticks | 3 |
| dead-defuser progress / completes | 0 / 0 |
| stale contestant refs / gate disagreements | 1 / 1 |

只有兩名 CT 真正增加進度：

| 玩家 | 角色 | focus / decision | progress ticks | total progress | completes |
|---|---|---:|---:|---:|---:|
| ct2 | awp | 88 / 80 | 12 | 12.8240 | 3 |
| ct3 | rifler | 83 / 79 | 4 | 4.1813 | 1 |

這些是 baseline action counts，不是 focus/decision treatment effect、顯著性或 calibration 結論。

## 新證據與分類

### A. Defuse branch 使用 stale alive arrays

三個 tick 的 production selected defuser 已在同 tick combat 死亡；本 fixed suite 都因 contested
而沒有增加進度，也沒有死者完成拆彈。因此目前證明的是**錯誤 actor selection**，不是已證明的
勝負改變。

另有一筆真正 gate 分歧：

```text
seed 3820910912 · round 5 · sec 62
selected ct3（仍存活、距離內）
production contestant t1（已死亡）
production progressGate=false；fresh progressGate=true
```

這是 **A 類真 gameplay branch bug**：死者不應阻擋拆彈。它可能延遲 progress，但 R6 沒有
執行 fresh-array counterfactual，故不宣稱此 tick 一定改變回合結果。修正會改 gameplay digest，
必須另開 gameplay bug Sprint；本輪不修。

### A. `how="bomb"` 是過載的 result 語意

16 個 `how="bomb"` 結果只有 1 個在 `c4t=0`；15 個仍有時間，其中 14 個 final fresh CT=0。
正式程式在 post-plant CT 全滅或 round clock 到期也使用 `how:"bomb"`，而 UI 把該值一律顯示
「炸彈引爆」。因此它不是可靠的 timer-explosion KPI，也是 **A 類 result/UI semantic bug**。
本輪不改 contract、歷史資料或 UI。

### B → closed for baseline：defuse instrumentation 缺口已補

現在可分開量 bomb tick、proximity、contest gate、progress increment、complete 與 round result，
也能暴露 production/fresh 差異；不再只能讀 `roundHist.how`。

### C / E：累積規則與 fixed sample 都限制 calibration

- progress 靜態上跨 pause／換人保留，屬 gameplay/design 語意；fixed baseline 沒有實際 pause／
  owner switch，不能判定這個設計的結果影響。
- 20 個 planted rounds 只有 4 個開始進度，且全部由 ct2/ct3 完成；作用情境窄、角色分布不全。
- focus/decision 公式確實通電，但 R6 沒有 treatment，也沒有分離兩項的效果。

Calibration 維持 No-Go。

## 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,cs_stat_wiring_r3,cs_clutch_r4,cs_retreat_r5,cs_defuse_r6,build --timeout=600000
```

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS；`CsGameplayDigest.v1` expected suite 未變。
- R2／R3／R4／R5／R6：全 PASS。
- build：PASS。
- runner 本次 8/8、exit 0；其餘 13 segments 未執行，不宣稱全套通過。
- 正式 source、RNG、gameplay/result shape 均未變。
- `git diff --check`：PASS。

## 下一個最小安全任務

先做 **CS Utility Damage Audit R7（唯讀）**：確認 HE／molly／flash／smoke 的正式 branch 是否
真的產生 damage、`roundDmg`／ADR 是否有可達 utility attribution，以及 `utilDmg:0` 是 measurement
缺口還是 gameplay/design 缺口。只做 read-chain、分類與最小量測規格；不得加入假 damage、
武器/經濟值或 calibration。
