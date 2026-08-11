# R19 CS Reflex Read-Chain / Role Interaction Audit Report

## 判定摘要

- R19 audit / measurement：**Go / PASS**。
- production semantic patch：**Revise**；根因已足夠明確，但 raw/adjusted role-fit 語意仍需先決策。
- production calibration / balance patch：**No-Go**。
- 本輪未修改 production、RNG、stat formula、role mapping、balance constant 或 historical evidence。
- 不開始下一個 calibration sweep；不提出 balance constant。

## Evidence

- verifier：`tools/check_cs_reflex_read_chain_r19.mjs`
- event schema：`CsReflexReadChainAuditEvent.v1`
- suite schema：`CsReflexReadChainAuditSuite.v1`
- source SHA-256：`7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- fixed seed set：16 seeds；SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- R18-A repair evidence reference：`104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b`
- R19 read-chain sweep：176 simulations；suite digest `37db1597d443b399c4c02d0e47023aa8730b5c714e572933bbcad11a46e9ddda`
- static RNG call sites：21；未新增 RNG
- production source modified：`no (memory transform only)`

R19 verifier 另外通過 off/on/repeated-on exact result、event deterministic、input immutable、source SHA、RNG token sequence、transform reversibility 與 role coverage gates。

## Root cause

### 1. Raw / personality-adjusted semantic inconsistency（已證明）

`fpsRoster` 先把 base + talent bonus 形成 derived short `stats.rxn`；這一層沒有套 personality。進入 `EsportsFPS3D` 後：

- `combatSkill` 的 mechanics、weapon 與 entry option 使用 `persStat(p,"rxn")`。
- `posSkill` 直接使用 raw `p.stats`，沒有 `persStat`。
- `fpsOvr` / `ovr` 讀 raw/derived short 值，但只供顯示。
- `aggr` 不讀 rxn，因此 `fireChance` 沒有直接 rxn consumer。

這不是 personality 被套兩次；adapter 的 derived layer 與 simulator 的 `persStat` 分工清楚。但同一場 combat 的不同 component 對「有效 rxn」定義不一致，造成 calibration input 不是單一語意。

### 2. Role-specific multiple read / double counting（已證明）

同一次 `combatSkill` 可能同時讀：

- mechanics 的 `persStat(rxn)`；
- 非狙擊 weapon fit 的 `persStat(rxn)`；
- entry option 的 `persStat(rxn)`；
- 另外把 raw `posSkill` 以 `0.14` 混入。

R19 baseline 觀測到的 target-side `persStat(rx n)` reads / `combatSkill` calls：

| role | baseline raw→adjusted rxn | raw `posSkill` rxn weight | persStat rxn reads / combatSkill calls | 平均每次 combatSkill read |
|---|---:|---:|---:|---:|
| entry | 78 → 84 | 4 | 960 / 359 | 2.674 |
| rifler | 84 → 90 | 4 | 1168 / 584 | 2.000 |
| awp | 82 → 82 | 1 | 325 / 253 | 1.285 |
| lurker | 79 → 85 | 0 | 808 / 404 | 2.000 |
| igl | 74 → 74 | 0 | 838 / 419 | 2.000 |

這是功能權重的多重暴露，不代表同一個 `persStat` call 被錯誤重複套 personality；但對 calibration 而言，它確實是 role-dependent double counting risk。

### 3. Direct formula 本身沒有反向（已證明）

R19 memory evidence 中，五個 role 的 target direct `combatSkill` 與 `Pt` 都是 low 負、high 正；`aggr` low/high paired effect 全部為 0：

| role | raw `posSkill` low/base/high | combatSkill low→base / high→base | Pt low→base / high→base | aggr low/high | Pt clamp（low/high） |
|---|---:|---:|---:|---:|---:|
| entry | 77.5333 / 80.7333 / 83.9333 | -2.8351 / +2.7805 | -0.0382 / +0.0268 | 0 / 0 | 1 / 0 |
| rifler | 82.6000 / 85.8000 / 89.0000 | -2.5820 / +2.0893 | -0.0318 / +0.0279 | 0 / 0 | 0 / 2 |
| awp | 84.0000 / 84.8000 / 85.6000 | -1.8229 / +1.3748 | -0.0245 / +0.0266 | 0 / 0 | 0 / 0 |
| lurker | 82.2667 / 82.2667 / 82.2667 | -2.1141 / +2.2154 | -0.0298 / +0.0272 | 0 / 0 | 0 / 0 |
| igl | 89.0000 / 89.0000 / 89.0000 | -2.1317 / +2.5642 | -0.0211 / +0.0322 | 0 / 0 | 3 / 2 |

因此 R18-A 的 final KPI 反轉不是由 `rxn` 直接進入 `combatSkill` 後算出反向數值，也不是 `aggr` / fireChance 直接反向。

### 4. Deterministic threshold / state-path amplification（已由 source + paired evidence 支持）

`Pt` 會經過 `rand() < Pt` 決定 attacker；後續 kill / death 會改變 alive count、pair admission、route/reposition、economy、weapon 與下一回合狀態。固定 seed 仍然 deterministic，但 treatment 改變後，分支可能消耗不同數量的 RNG calls，導致後續 state path 分叉。

R18-A 修正版 target-attacker conversion low→baseline / high→baseline：

| role | conversions | kills | effective damage |
|---|---:|---:|---:|
| entry | -1.7500 / +1.0000 | -1.1250 / +0.3750 | -53.6250 / +69.1250 |
| rifler | -3.8125 / -0.8125 | -1.7500 / -0.1875 | -215.0625 / -25.4375 |
| awp | -0.8125 / +0.6875 | -0.5625 / +0.5625 | -56.1875 / +67.2500 |
| lurker | +0.5000 / -0.0625 | +0.3125 / +0.2500 | +57.3125 / +9.2500 |
| igl | +0.5000 / +3.7500 | +0.1250 / +2.2500 | +13.6875 / +213.3125 |

這與 R19 的 direct `combatSkill` / `Pt` 單調證據對照後，將非單調性定位為 downstream discrete path amplification，而非 arithmetic sign reversal。R18-A 的 `0/15` strict monotonicity、changed-seed evidence 與 R19 direct read evidence 必須一起解讀；不能以調高或調低 balance constant 掩蓋。

## 各 role read-chain

### entry

`raw rxn → raw posSkill(weight 4) + persStat mechanics + persStat weapon + entry persStat bonus → combatSkill → Pt → attacker branch → downstream round state`。

entry 有最高的 direct role-specific rxn exposure；aggressive personality 又將 raw 78 調為 84。這是最明顯的 multiple-read / semantic split role，但 direct result 仍單調，final KPI 的 seed-level失真主要落在 downstream branch。

### rifler

`raw rxn → raw posSkill(weight 4) + persStat mechanics + persStat rifle weapon → combatSkill → Pt`。

genius personality 將 84 調為 90；direct `combatSkill` / `Pt` 單調，但 R18-A high 仍低於 baseline，證明 raw/adjusted multi-read 與 discrete state path 共同造成結果不可直接當作單一 rxn effect。

### awp

`raw rxn → raw posSkill(weight 1) + persStat mechanics → combatSkill → Pt`；只有 pistol branch 時才額外出現 weapon rxn read，sniper branch 不讀 weapon rxn。

awp 的 direct exposure 最窄；calm personality 不改 rxn。R18-A final KPI 多數符合低負高正，但 signed majority 不足，不能宣稱 calibration pass。

### lurker

`raw rxn → persStat mechanics + persStat weapon → combatSkill → Pt`；`posSkill` 的 lurker profile 不含 rxn，lurk option 讀的是 vis / pos，`aggr` 亦不讀 rxn。

lonewolf 將 79 調為 85；direct `combatSkill` / `Pt` 單調，但 R18-A low 端 target attacker KPI 反而為正，表示反轉不來自 raw `posSkill` rxn weight，而是 downstream branch / opportunity path。

### igl

`raw rxn → persStat mechanics + persStat weapon → combatSkill → Pt`；IGL `posSkill` profile 是 led/com/dec/tac/adp，不含 rxn，且沒有 entry/lurk bonus。shotcaller 不調整 rxn，raw 74 與 adjusted 74 相同。

IGL direct `combatSkill` / `Pt` 仍單調，但 R18-A low 端沒有負向效果、high 端大幅正向，最能顯示 result KPI 受 round/economy/branch path 放大的程度。

## 分類判定

| 類型 | 判定 | 證據 |
|---|---|---|
| duplicate read | **是，功能層級** | mechanics、weapon、entry option、raw role-fit 同場讀 rxn |
| double counting | **有風險且 role-dependent** | entry/rifler raw pos weight 4；entry 另有 rxn bonus；非狙擊 weapon 再讀 adjusted rxn |
| role formula interaction | **是** | `POS_PROFILE`、weapon class、entry/lurk options 造成每 role exposure 不同 |
| raw/adjusted semantic inconsistency | **是，核心問題** | `posSkill` raw；combat mechanics/weapon/options `persStat` |
| stat clamp | **未支持為根因** | R18-A saturation `0/5`；R19 raw rxn band 未碰 1/99 |
| Pt clamp | **不是主要根因** | clamp 事件極少，未形成 saturation signal |
| deterministic threshold / state branching | **是，downstream amplification** | direct skill/Pt 單調，但 `rand()<Pt`、kill/death、alive/pair/economy 分支使 fixed-seed path 分叉 |
| personality double application | **未發現** | derived adapter 與 simulator `persStat` 分層，沒有第二次 personality layer |

## 最小修正方案

目前最小安全方案不是改權重，而是先凍結語意：

1. 將 `stats.rxn` 定義為 adapter boundary 的 raw/derived input；將 personality-adjusted value 命名為獨立的 effective combat value。
2. 將 `posSkill` 明確標示為 raw role-fit 或 effective role-fit，不能再隱含混用；`combatSkill` 需能分別輸出 role-fit 與 mechanics/weapon 的 rxn contribution。
3. 在 production patch 前，先以同一個 R19 verifier 做 before/after component evidence；不改 `FPS_W`、`0.013`、Pt clamp、武器或 role mapping。
4. 若產品決定 role-fit 也應受 personality 影響，這是 semantic decision，不是本輪可自行假設的修 bug；若決定 role-fit 維持 raw，則必須把這個邊界寫入 contract / verifier，而不是讓它保持隱性。

本輪不提出 production diff，因此尚未進入使用者要求的短 Grill；若下一輪要採用上述任一 production semantic patch，必須先 Grill 再修改。

## Determinism / migration

- 本次 audit：**不造成 determinism migration**。memory-only transform、RNG token sequence、production source、contract 與 replay frame 都未改。
- 未來任何 raw/adjusted/role formula production 修正都會改變未來 simulation 的 source SHA、suite digest 與結果分布；需要新的 checkpoint / verifier evidence，不能 rebaseline 或覆寫 R1–R18 historical evidence。
- 既有 replay 以 stored frames 播放，不需重跑舊 replay；但 future match result 的生成語意會改變，應以新 source/digest 明確區隔。

## 結論

- R19 audit evidence：**Go / PASS**。
- R19 semantic correction：**Revise**，等待 raw/adjusted role-fit 產品決策與短 Grill。
- R19 production calibration / balance：**No-Go**。
