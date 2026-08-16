# CS Synergy Semantics / Read-Chain R16-A

日期：2026-08-11  
狀態：**Reviewed / PASS**  
Calibration：**No-Go**  
Production gameplay：**未修改**

## 1. 目的

本 Sprint 只確認 `synergy` 的實際資料鏈與 gameplay read point，並把玩家側與內建
CT `support` path 分開驗證。R16-A 不把現有個人 role-fit 讀取誤稱為 team-level
coordination，也不自行改動玩家 role mapping。

## 2. 封版邊界

允許：

- 新增 `tools/check_cs_synergy_semantics_r16a.mjs`。
- 以 Vite memory transform 暴露既有 `simulateFps`、`ROSTER`、`TACTICS_DB`；transform
  只存在 verifier process，不寫回 production。
- 對固定既有 16 seeds 做 focused paired read-chain probe。
- 新增本 evidence/spec 與 handoff 追加紀錄。

禁止：

- 修改 `src/battle/fps/EsportsFPS3D.jsx`、`fpsRoster.js`、`playerModel.js`。
- 修改 player role mapping；不得把玩家「輔助」改成 `support`。
- 新增 RNG、dummy RNG、第二套 team model 或新的 runtime/result/Store/Progress contract。
- balance/calibration、完整 16-stat matrix、utility、learning、tactic molly。
- 自動 rebaseline R1～R15 constants/digests。

## 3. 已確認的 read-chain

### 3.1 資料進入 CS

`playerModel` 的 `synergy` 經 `getPlayerDerivedStats` 進入 `fpsRoster.toShortStats`，
再轉為 CS short key `coo`。`fpsOvr` 也包含 `coo`，但它是 HUD/display-only，不能
當作 gameplay read。

### 3.2 玩家側

目前 `MOBA2FPS` 是：

```text
上路→entry、打野→lurker、中路→rifler、下路→awp、輔助→igl
```

因此玩家五席沒有任何 `support` role。引擎的 `POS_PROFILE.support` 雖然讀取
`coo/tac/com/pos/vis`，但玩家側不可達；玩家目前的 `igl` profile 讀的是
`led/com/dec/tac/adp`。

### 3.3 內建 CT

內建 `ROSTER.ct5` 是 `support`，`combatSkill → posSkill → POS_PROFILE.support`
會實際讀取 `coo`。這是目前可觀察的 **個人 support role-fit** path，不等於 team-level
coordination。

### 3.4 現有 team-level candidate

Static audit 檢查了既有候選：

- `tacticEdge`：讀 tactic type/site，不讀 `coo`。
- `contactCalled` / `comms.push`：事件與播報，不讀 `coo`。
- `teamAvg`：只讀 economy money，不讀 `coo`。
- `posSkill`：是個人 role-fit，不是 team-level coordination。

因此目前沒有可直接宣稱為 synergy team coordination 的 gameplay read point。

## 4. Focused verifier

Verifier：`tools/check_cs_synergy_semantics_r16a.mjs`

- 固定 `CsMeasurementSeedSet.v1` 的 16 seeds。
- 7 focused treatments × 16 seeds = 112 paired runs：
  - 玩家 `t1` entry、`t2` rifler、`t3` awp、`t4` lurker、`t5` igl 各自 `coo -20`。
  - 內建 `ct5 support` `coo -20`。
  - 內建 `ct1 igl` 作非-support control `coo -20`。
- output projection 排除 roster input stats，只比較 gameplay/result/frame state。
- memory-only RNG collector 用於確認 paired run；正式 source static `rand()` call sites
  維持 21。
- 同一 arm 會重跑兩次，先驗證 determinism，再比較 paired effect。

## 5. Evidence 結果

| Treatment | output changed | RNG changed | 結論 |
|---|---:|---:|---|
| 玩家 t1 entry | 0/16 | 0/16 | player-side 不可達 |
| 玩家 t2 rifler | 0/16 | 0/16 | player-side 不可達 |
| 玩家 t3 awp | 0/16 | 0/16 | player-side 不可達 |
| 玩家 t4 lurker | 0/16 | 0/16 | player-side 不可達 |
| 玩家 t5 igl | 0/16 | 0/16 | player-side 不可達 |
| CT ct5 support | 4/16 | 3/16 | 現有 support role-fit 可達 |
| CT ct1 igl control | 0/16 | 0/16 | 非-support control |

固定 evidence：

```text
source SHA-256: 7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89
CsSynergySemantics.v1: db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022
```

## 6. 產品語意建議

建議將 canonical `synergy` 定義為 **team-level coordination**，而非個人
`support role-fit`：

- `synergy` 在 player model 的中文語意是「配合度」，team talent 也以團隊默契描述。
- `support role-fit` 是定位契合，已由 `POS_PROFILE.support` 表達，不能代替 team
  coordination。
- 未來若要實作，必須先指定既有 team event / opportunity / conversion read point；
  不能只把玩家 role 改成 `support`，也不能把 `posSkill` 改名包裝成團隊效果。

## 7. Gate 結論

- R16-A focused audit：**Go / PASS**。
- 玩家 synergy gameplay wiring：**No-Go**，因 team-level read point 尚未被產品與
  gameplay 規格指定。
- CT support 個人 role-fit：已存在，不在本 Sprint 修改或重新平衡。
- R1～R15 historical evidence：保留，不 rebaseline。

下一階段可進入已封版的 R16-B `CS Learning Lifecycle / State Design`；不把
`synergy` implementation 混入 R16-B。
