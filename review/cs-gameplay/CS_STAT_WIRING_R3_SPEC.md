# CS 16 項素質 Wiring Measurement R3 — 封版規格與嚴格審查

日期：2026-08-10
狀態：**Reviewed / Go**
Calibration：**No-Go**

## 1. 目的

在不修改正式 FPS 程式的前提下，逐項回答玩家 16 項素質：

1. 是否有真實 gameplay 讀取位置；
2. 在固定、代表性角色上調整單一素質時，既有 `simulateFps` 的輸出行為是否改變；
3. 已有哪一層 opportunity / trigger / conversion KPI，還缺哪一層；
4. 問題屬 A measurement bug、B instrumentation 缺口、C gameplay/design 缺口、
   D 文件錯誤或 E 正常但作用範圍窄；
5. 哪些項目具備進入後續 calibration 的最低量測條件。

本輪是 wiring audit / measurement，不比較強弱是否合理，不算 p-value，不調整任何權重。

## 2. 硬邊界

允許：

- 新增 `tools/check_cs_stat_wiring_r3.mjs`；
- `tools/verify.mjs` 只新增 `cs_stat_wiring_r3` segment；
- 新增 review 報告並更新必要 handoff。

禁止：

- 修改 `src/battle/fps/EsportsFPS3D.jsx`；
- 修改 `tools/check_cs23.mjs`、R1 或 R2 verifier；
- 修改 gameplay / contract / Store / UI / roster adapter；
- 新增 dependency、helper、第二套 `simulateFps` 或正式 export；
- 修改 `FPS_W`、`combatSkill`、`0.013`、`MAP_EDGE`、clamp、武器、經濟、戰術或角色映射；
- calibration、統計顯著性、換 seed、追加 seed、自動 rebaseline。

正式 FPS source SHA-256 固定為：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 3. 量測方法

### 3.1 最低侵入入口

沿用 R1 已證明的 Vite test-only memory export：只在記憶體把既有
`simulateFps`、`ROSTER`、`TACTICS_DB` 暴露給 verifier。Transform 必須：

- marker 各精確命中一次；
- inverse transform 後逐字等於原始來源；
- 不寫回正式檔；
- 原始與 transform 後的 `rand()` / `Math.random()` token 序列完全相同；
- 任一步失敗即 fail-closed，不退回複製 simulator。

本輪不注入新的 runtime collector。Combat action-point KPI 由已通過的 R2 證據判定；
R3 只新增 paired output measurement，避免複製 R2 hooks 形成第二套量測真相。

### 3.2 固定情境

- map：Inferno
- T tactic：`t_aexec`
- CT tactic：`c_std`
- roster：正式檔目前的既有 `ROSTER`
- seeds：完整沿用 `CsMeasurementSeedSet.v1` 的固定 16 seeds 與既有 hash
- 每個 baseline / treatment arm 各跑兩次，逐 seed 證明 deterministic

Baseline 每 seed 可安全重用；所有 stat case 仍各自驗證 treatment 輸入與輸出。

### 3.3 固定 treatment cases

每個 case 只降低一名 T 方代表角色的一個短鍵 20 點。`accuracy` 沿用 R1 的
`t2.acc 88 → 68`；其餘也使用固定 −20，不因結果改角色、改幅度或改 seed。

| 長鍵 | 短鍵 | 角色 | treatment |
|---|---|---|---:|
| reflex | rxn | `t1` entry | 78 → 58 |
| accuracy | acc | `t2` rifler | 88 → 68 |
| apm | apm | `t1` entry | 80 → 60 |
| positioning | pos | `t2` rifler | 85 → 65 |
| mapAware | vis | `t4` lurker | 84 → 64 |
| tacticalIQ | tac | `t5` igl | 88 → 68 |
| decision | dec | `t4` lurker | 78 → 58 |
| adaptability | adp | `t4` lurker | 83 → 63 |
| courage | cou | `t1` entry | 88 → 68 |
| clutch | str | `t2` rifler | 86 → 66 |
| focus | foc | `t3` awp | 88 → 68 |
| resilience | res | `t2` rifler | 84 → 64 |
| comms | com | `t5` igl | 90 → 70 |
| leadership | led | `t5` igl | 92 → 72 |
| synergy | coo | `t5` igl | 88 → 68 |
| learning | lrn | `t2` rifler | 80 → 60 |

Treatment integrity 是 hard gate：完整 scenario deep diff 必須只有
`roster.<target>.stats.<shortKey>` 一條；不得重算 HUD `fps` / `moba` / OVR。

## 4. `CsStatWiringDigest.v1`

R1 的正式 `CsGameplayDigest.v1` 用於 regression，scenario 內刻意含
`inputSha256`；完整 sim JSON 的 frame player 也含輸入 `stats`。因此兩者只要 treatment
輸入不同就會不同，**不能**證明 gameplay effect。

R3 新增的 `CsStatWiringDigest.v1` 只作 paired effect detection，schema 最小包含：

- final score、round count；
- 每位選手的 K/D/A、ADR、HS、KAST、MVP rounds、clutches、entry kills、rating；
- 每回合 winner / how / score；
- frame 中的 gameplay state：位置、HP、dead/state、gun/economy、bomb、nades、
  route progress、shooting、K/D/A、damage、events、smokes、molly、throwables、掉槍與門狀態。

明確排除：

- roster `stats`、`fps`、`moba` 與任何 input hash；
- casts / comms 等純呈現文字；
- component identity 與 UI state。

另輸出三個較窄的診斷 digest：final result、round outcomes、target player result。
完整 strict sim digest 只用來驗證同一 arm 重跑一致，不能跨 treatment 判斷 effect。

## 5. PASS / FAIL

`cs_stat_wiring_r3` 只有下列 hard gates：

1. 不接受任何 CLI flag；
2. source SHA、export markers、seed generation、seed set hash 全部精確一致；
3. memory transform 可精確逆轉，且 RNG token 數量與順序不變；
4. map、tactics、16 cases 的 target identity / role / baseline value 全部精確；
5. 每個 treatment deep diff 只有指定的一個 stat 欄位；
6. baseline 與每個 treatment 輸入在 simulate 前後 hash 不變；
7. 每個 seed 的 baseline A1/A2、每個 treatment B1/B2，其完整 sim JSON 與所有 digest
   必須一致；
8. output-only digest 建立前後不得改變 sim；
9. 16 cases 全部完成，輸出固定 seed、hash、generation version、各 case changed-seed counts；
10. 人工檢查首輪 candidate 後，suite digest 以明確 literal 鎖定；無 update/rebaseline 路徑。

以下**不是** FAIL：

- treatment 與 baseline output-only digest 相同；
- 勝率或 final result 沒變；
- 差異不顯著或方向不符合直覺。

零差異一般只能寫成「此固定角色／地圖／戰術／seed set 未觀察到」。只有同時有靜態
read-chain 證據，才可進一步判定接線狀態。

## 6. 嚴格審查

| 風險假設 | 嚴重性 | 修正後邊界 |
|---|---:|---|
| 完整 sim digest 不同就代表 gameplay 不同 | 極高 | stats 本身被 frame 展開；跨 arm 只看排除輸入的 output-only digest |
| R1 gameplay digest 可直接比較 treatment | 極高 | R1 含 input hash；R3 不改 R1，另建 effect-only schema |
| 零差異等於未接線 | 極高 | 除靜態無讀取鏈外，只能判定固定情境未觀察到 |
| 16 個 case 可用來比較權重強弱 | 高 | 固定 −20 只做 wiring probe，禁止跨 stat 比 effect 大小或進 calibration |
| `fpsOvr` 改變代表引擎效果 | 高 | OVR 明確是 HUD display-only；treatment 不重算 OVR |
| R2 combat counters 等於最終 outcome | 高 | event 是 action-point 診斷；另列 final/round/behavior digest，不互相替代 |
| `clutches` 能代表 1vN opportunity | 高 | 現行欄位只看勝方單一 survivor + kill；標為 KPI 缺口，不作真 clutch 結論 |
| player-side `synergy` 可由 support case 測得 | 高 | adapter 不產生 support；固定用真實 t5 IGL，搭配靜態 role-chain 判定 |
| 一張圖可概括所有情境 | 中 | 報告限制外推；resilience/retreat/defuse 等保留情境 instrumentation 缺口 |

審查結論：**Go**。範圍只有一支 test-only verifier、一個 runner segment 與文件；
不修改 production，也不把量測結果誤當 calibration。

## 7. 下一階段准入

完成 R3 不會自動允許全面 calibration。單一素質只有在下列條件全滿足時才可列為候選：

1. 靜態 read-chain 明確且 player-side 可達；
2. 對應 action point 有正確的 opportunity / trigger / conversion KPI；
3. KPI 的層級、遞增條件、節流與上限已記錄；
4. paired output measurement deterministic；
5. `CsGameplayDigest.v1`、cs23、build 與 RNG gates 維持；
6. 無未解的 A 類 measurement bug 會污染該素質的主要 outcome。

未滿足者下一階段仍是 instrumentation 或 design decision，不是 calibration。
