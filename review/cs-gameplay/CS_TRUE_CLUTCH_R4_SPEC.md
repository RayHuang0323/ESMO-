# CS True Clutch / LastAlive Instrumentation R4 — 封版規格與審查

日期：2026-08-10
狀態：**Reviewed / Go**
Calibration：**No-Go**

## 1. 目的

R3 證明 `resilience` 只有 `combatSkill(... lastAlive)` 靜態讀取，但固定 probe 0/16；
同時現行 result `clutches` 只以「勝方剩一人且該人本回合至少一 kill」計數，沒有記錄
真正 1vN opportunity。本 Sprint 只建立以下量測鏈：

```text
lastAlive state opportunity
  → clutch combat opportunity
  → fire trigger
  → duel/damage conversion
  → round win/lose conversion
  ↔ legacy clutches 對照
```

只回答機會是否存在、如何走到結果，以及 legacy summary 是否量到同一件事；不調
`clutch/str`、`resilience/res`、權重、公式或結果契約。

## 2. 硬邊界

允許：

- 新增 `tools/check_cs_clutch_instrumentation_r4.mjs`；
- `tools/verify.mjs` 只新增 `cs_clutch_r4` segment；
- 新增 review 報告並更新必要 handoff。

禁止：

- 修改 `src/battle/fps/EsportsFPS3D.jsx`、CS23、R1、R2、R3 verifier；
- 修改 gameplay / result / contract / Store / UI / roster adapter；
- 新增 dependency、helper、正式 export 或第二套 `simulateFps`；
- 新增 RNG、改 RNG 消耗順序或更動 branch；
- 修改 `combatSkill`、lastAlive 公式、legacy `clutchId`、ADR/rating 或任何平衡值；
- calibration、stat treatment、p-value、換 seed、追加 seed、自動 rebaseline。

正式 FPS source SHA-256 保持：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 3. 定義

### 3.1 LastAlive state opportunity

在每個 gameplay tick 建立 fresh `aliveT` / `aliveCT` 後、任何本 tick movement/combat 前：

- 我方存活人數恰為 1；
- 敵方存活人數至少 1；
- 同一 round / player 尚未記錄。

第一次滿足時記一筆 `clutch_opportunity`，包含 round、sec、player/side、HP、weapon、
敵方存活數與 IDs。此位置與本 tick 傳給 `combatSkill` 的 `lastAlive` 判斷使用同一份
fresh alive arrays，避免用 combat 後的 stale array 誤判。

`opponentCount = 1` 時，1v1 的雙方各有一筆 lastAlive opportunity；
`opponentCount >= 2` 才另外標成 disadvantaged 1vN。兩者分開統計，不偷換定義。

### 3.2 Clutch combat opportunity / trigger / conversion

只有 active lastAlive player 參與的既有 combat pair 才旁路記錄：

- `clutch_combat_opportunity`：pair 已通過 range／LOS／smoke／engagement cap／alive／used
  gates，正要消耗既有 fire roll；
- `clutch_combat_trigger`：既有 fire roll 通過，已算出 `combatSkill` 與 Pt；
- `clutch_combat_conversion`：既有 duel/headshot/damage rolls 完成。

1v1 時 pair 可能同時對應兩名 lastAlive players，event 以排序後 ID 字串保留兩者，
不可重複製造兩筆 combat event。

### 3.3 Round conversion 與 legacy 對照

每個 state opportunity 在 round 結束時記一筆 `clutch_round_result`：winner/how、是否勝利、
round kills、是否被現行 `clutchId` 計數。每回合另記 `round_clutch_summary`，即使沒有
opportunity 或 legacy clutch 也要存在，供完整性檢查。

legacy clutch 與 true opportunity 不要求相等；不一致正是量測結果，不得為了 PASS
修改定義或放寬資料。

## 4. 固定輸入與執行

- `CsMeasurementSeedSet.v1` 原固定 16 seeds 與 seed hash；
- Inferno；T `t_aexec`；CT `c_std`；既有 ROSTER；
- 每 seed 跑 collector off、on-1、on-2，共 48 simulations；
- 不做 stat treatment。

Event schema：`CsTrueClutchInstrumentation.v1`。首輪 candidate 經人工檢查後以明確
suite digest literal 鎖定；不提供 update/rebaseline CLI。

## 5. PASS / FAIL

1. 不接受任何 CLI flag；source SHA、markers、seed generation/hash 必須精確一致。
2. 所有 memory transforms 可逆轉後逐字回到原 source。
3. 原始與 transformed 的 21 個 `rand()` call tokens 及全部 RNG token 序列一致。
4. collector off/on-1/on-2 完整 sim JSON 逐 seed完全相同。
5. on-1/on-2 canonical event digest 逐 seed相同；輸入 simulate 前後 hash 一致。
6. state opportunity `(round, player)` 唯一，fresh alive 條件與欄位範圍合法。
7. 每筆 clutch combat event 都能連回較早或同 tick 的 state opportunity。
8. combat opportunity ≥ trigger，trigger = conversion；damage/kill invariants 成立。
9. 每筆 state opportunity 恰有一筆 round result；每個 played round 恰有一筆 summary。
10. summary 的 legacy clutch 累計必須等於未修改 sim result 的 `players[].clutches`。
11. 固定 suite 至少有一筆 `opponentCount >= 2`、一筆 clutch combat opportunity 與一筆
    conversion，否則本 Sprint 沒量到宣稱的 action point而 FAIL。
12. expected event suite digest 必須匹配人工鎖定 literal；禁止自動更新。

以下不是 FAIL：

- 某位玩家（含 t2）沒有 lastAlive opportunity；
- true opportunity 沒有 combat 或沒有贏；
- legacy clutch 沒有對應 measured opportunity，或 opportunity win 未被 legacy 計數；
- `resilience` 尚無可見 outcome 差異；
- 結果不符合設計直覺。

## 6. 嚴格審查

| 高風險假設 | 修正版 |
|---|---|
| 回合最後只剩一人就代表曾有 lastAlive gameplay opportunity | 在 fresh alive arrays 建立後即記 transition；另保留 legacy-only discrepancy |
| combat 後的 `aliveT.length` 仍是 fresh | 禁止在 combat 後判定；既有 array 不會因 `p.dead=true` 自動縮短 |
| 1v1 與 1v3 是同一種難度 | state schema保留 opponentCount，報告分開 1v1 與 N≥2 |
| `clutches` summary 就是真實 outcome | 只作 legacy 對照；主 KPI 是 state opportunity→round conversion |
| state opportunity 自動代表發生對槍 | 另設 combat opportunity/trigger/conversion 三層，不以 state counter 代替 |
| 為了量測可以重算 alive、改 branch 或多抽 RNG | hook 只讀既有 state；off/on 完整 sim 與 RNG sequence 是 hard gate |
| R4 可以順便修 result 定義 | 禁止；修 legacy contract 會改 digest，另需 contract-aware Sprint |

審查結論：**Go**。Marker 與資料都在單一既有 round/combat state machine 內，且可用
test-only exact hooks 完成；不需正式程式修改、helper 或 dependency。

## 7. 下一階段准入

R4 PASS 後只代表 `clutch/str`、`resilience/res` 的 opportunity coverage 補齊。是否能進
calibration 仍取決於：固定 suite 是否有足夠 N≥2 opportunities、action/result 是否可重現、
ADR overkill 是否被隔離，以及另行封版的 treatment sample plan。R4 本身不授權 calibration。
