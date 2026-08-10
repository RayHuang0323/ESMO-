# CS Combat Instrumentation R2 — 完成報告

日期：2026-08-10
狀態：**PASS／可作後續 Audit 量測基礎**
Calibration：**No-Go**

## 完成範圍

新增：

- `tools/check_cs_instrumentation_r2.mjs`
- `tools/verify.mjs` 的 `cs_instrument_r2` segment

未修改：

- `src/battle/fps/EsportsFPS3D.jsx`
- `tools/check_cs23.mjs`
- R1 `CsGameplayDigest.v1` schema、fixed seeds 與 expected baseline
- gameplay／contract／Store／UI／dependency／平衡值

正式 FPS source SHA-256 仍為：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 實作

Verifier 透過 Vite test-only memory transform，在既有 `simulateFps` combat inner loop
旁路記錄三類 `CsCombatInstrumentation.v1` events：

1. `combat_opportunity`：pair 通過 range／LOS／smoke／cap／alive／used gates，準備消耗既有 fire roll。
2. `combat_trigger`：既有 fire roll 通過，暴露 fireChance、雙方 combatSkill、Pt 與 clamp components。
3. `combat_conversion`：既有 duel／headshot／damage rolls 完成，記錄 headshot、有效傷害、
   overkill 與 kill conversion。

所有 injection marker 都必須精確命中一次，逆轉後逐字等於原始來源。原始 21 個
`rand()` call tokens 的數量與順序也必須完全相同。

## 等價性 hard gates

固定 R1 的 16 seeds、Inferno、`t_aexec`、`c_std` 與既有 ROSTER。每 seed 執行：

- collector off
- collector on-1
- collector on-2

合計 48 simulations。逐 seed hard gate：

- off／on-1／on-2 完整 sim JSON 完全相同。
- on-1／on-2 event canonical digest 完全相同。
- 每筆 trigger 都有較早的同 identity opportunity。
- trigger 與 conversion 1:1。
- probability／clamp／damage／kill invariants 全部成立。
- 輸入 hash 前後相同；target `t2` 確實有 opportunity 與 conversion。

R2 不自己取代 formal gameplay baseline；聯合 gate 仍由 `cs_measure_r1`
保護 `CsGameplayDigest.v1`。

## 固定輸入結果

eventSuiteDigest：
`5720e45fd72e5e5428ff6e8e800068012a7f6b2b04c4886ce8e9f0cfb1a50089`

| KPI | 結果 |
|---|---:|
| simulations | 48 |
| combat opportunities | 4,385 |
| fire triggers | 2,133 |
| trigger rate | 48.643% |
| conversions | 2,133 |
| kill conversions | 1,079 |
| kill conversion rate | 50.586% |
| headshot results | 971 |
| headshot result rate | 45.523% |
| Pt lower clamp | 5 |
| Pt upper clamp | 1 |
| overkill events | 1,069 |
| overkill damage | 53,309 |
| `t2` opportunities | 1,257 |
| `t2` conversions | 606 |

這些只描述固定情境的 action-point measurement，不是勝率／權重 calibration，
不算 p-value，也不得用來自動換 seed。

## 新證據與分類

### A. ADR overkill 是 measurement bug

現行 gameplay 在扣血後仍把完整 rolled damage 寫入 `dmgDealt`／`roundDmg`，
沒有截到 defender 的剩餘 HP。R2 在 16 場固定 baseline 中量到 1,069 次 overkill、
合計 53,309 額外傷害；因此 ADR／rating 會被系統性放大。

本輪只補證據，**不修改**既有 result、contract、rating 或 digest。修正會改
`CsGameplayDigest.v1`，必須另開 migration／contract-aware Sprint。

### B. Pt clamp 已能量測

固定情境 2,133 次 trigger 中只命中 lower clamp 5 次、upper clamp 1 次。
這表示本情境沒有廣泛 clamp 飽和，但不能外推到其他角色／地圖／素質。

### B. 尚未覆蓋的 instrumentation

retreat opportunity／trigger、真正 1vN clutch opportunity、defuse opportunity／progress
仍未量測，必須分開處理，避免跨 state machine 擴大 R2。

### C／D. 忠實揭露、不在本輪修

- headshot chance 直接讀 raw `stats.acc`，沒有走 `persStat`。
- `utilDmg` 仍固定 0。
- learning／player-side synergy 接線與文件宣稱仍待 16 項矩陣確認。

## 驗證

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,cs_instrument_r2,build --timeout=600000
```

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS；expected suite digest 仍為
  `546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`。
- `cs_instrument_r2`：PASS。
- `build`：PASS。
- runner 本次 4/4，exit 0；其餘 13 segments 未跑，不宣稱全套通過。
- `git diff --check`：PASS。

## 下一階段

使用 R1／R2 作安全網，建立 16 項素質逐項矩陣與最小 wiring probe。先回答
「是否真的改變 simulateFps」與「在哪個 action point 作用」，不做全面 calibration。
learning／synergy 接線、公式、角色定位、權重與新 gameplay branch 只提出證據與建議。
