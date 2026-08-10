# CS Defuse Stale State Repair R9 — 封版規格

日期：2026-08-10
狀態：**Counterfactual audit No-Go／production 未修改**
Calibration：**No-Go**

## 1. 目標

只修正 `simulateFps` 的 defuse block 在 combat 後仍沿用 tick-start `aliveT/aliveCT`：

- 死亡 CT 不再被選成 defuser；
- 死亡 T 不再被算成 contestant、阻擋有效拆彈；
- defuse candidate／contestant 一律使用同 tick post-combat alive state。

不處理 `how:bomb`、utility、learning、synergy、progress reset/owner transfer、kit、距離、
公式、threshold、balance 或 calibration。

## 2. 最小 production 修法

只在既有 `if(planted&&c4t!==null)` block 內建立 local post-combat views：

```js
const defuseAliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);
const defuseAliveT=ps.filter(p=>p.side==="t"&&!p.dead);
const defuser=defuseAliveCT.find(cp=>dist(cp.pos,c4pos)<6);
const contested=defuser&&defuseAliveT.some(...);
```

禁止重算或覆寫 tick-wide `aliveT/aliveCT`。後者仍供原有 movement、plant、comms 與 elimination
branches 使用，避免把非 defuse stale semantics 夾帶進本 Sprint。不得移動 combat／defuse
順序、不得新增 RNG、不得修改 progress／distance／winner／how 公式。

## 3. R9 verifier

新增 `tools/check_cs_defuse_stale_repair_r9.mjs` 與 `tools/verify.mjs` 的
`cs_defuse_repair_r9` segment。使用真實 simulator 與 Vite test-only memory transform，
不建立第二套 `simulateFps`、正式 export、helper 或 dependency。

### 3.1 兩側證據

- legacy branch：tick-start `aliveT/aliveCT`；
- repaired branch：defuse-local post-combat views；
- 固定 `CsMeasurementSeedSet.v1`、Inferno、`t_aexec`、`c_std`、現有 ROSTER；
- baseline 加 R3 現有 16 個單一 treatment cases，逐 seed legacy/repaired paired 比較；
- repaired arm 重跑決定性由 R1/R3 與 R9 gate 共同保護；不換 seed、不追加 seed。

### 3.2 hard gates

1. legacy/repaired marker 各只能命中一次，memory transform 可逆；source SHA、21 個 `rand()`
   call sites 與 RNG token sequence fail-closed。
2. 每個 case/seed 的 score、round winners/how、round count、kills/deaths/assists、HP/dead、
   damage、economy、position、routes、combat events 與 final MVP 必須相同。
3. 完整 sim JSON diff 使用精確 path allowlist；允許值必須可由 fresh defuse gate 重算：
   - live CT 在包點且沒有 live T contestant 時，該 frame 的 player `state` 可改為 `拆彈中`；
   -第一次合法 progress 可新增既有「我拆，掩護我！」comm；
   - 不允許 result、roundHist、score、winner/how 或非 defuse player fields 改變。
4. fixed evidence 必須實際涵蓋舊 stale defuser 與 stale contestant；repaired side 的
   selected-dead-defuser、dead contestant、production/fresh gate disagreement 必須全為 0。
5. 任何 fixed case 的 score／winner 改變，或任何非 allowlist diff，R9 立即 FAIL，本 Sprint
   停止；禁止以新 baseline 掩蓋。

## 4. R1–R8 migration 順序

1. 在舊 production source 鎖定 R9 legacy/candidate evidence、現有 R1 v2 suite、R2/R4/R5/R6
   event-only suites、R3 16-case evidence、R8 damage/progress evidence。
2. R9 legacy→candidate exact diff PASS 後才修改 production source。
3. production 後 R9 必須再次 PASS，且 source 只能是封版 local defuse change。
4. 再跑 R2/R4/R5 event-only、R3 effect summaries、R8 effective-damage/Progress gates。
5. 最後才人工遷移受 source SHA 或 defuse presentation/output 影響的 expected suites；所有
   old→new hashes 都保留，無 update/rebaseline CLI。

正式 gameplay digest 升為 `CsGameplayDigest.v3`，新增明確語意
`defuseAliveSnapshot: postCombat.v1`；v1/v2 永久保留。R6 instrumentation 升版並要求 stale
diagnostics 歸零。這是 schema migration，不是 calibration。

## 5. 修改範圍

允許：

- `src/battle/fps/EsportsFPS3D.jsx` 的 defuse candidate/contestant 四行最小修正；
- 新增 R9 verifier、增加 runner segment；
- R1–R6/R8 的 source provenance 與人工 expected migration；
- R6/R9 report/spec 與必要 handoff 追加／現況更新。

禁止：contract、Store、UI、Progress、settlement、roster、map、weapon、economy、tactic、
`how:bomb`、utility、learning、synergy、balance、calibration、大重構、自動 rebaseline。

## 6. 簡短 grill 結論

- **最高風險：** 若刷新共用 alive arrays，會改 elimination／movement 等非 defuse gameplay。
  修正：只用 block-local `defuseAliveT/CT`。
- **量測風險：** baseline 只有一個 gate disagreement，不代表 treatments 沒有差異。
  修正：R9 納入 R3 全 16 cases，不只單一 baseline。
- **migration 風險：** 先更新 expected hash 會掩蓋 outcome regression。
  修正：legacy/candidate exact diff 必須先 PASS；hash migration 永遠最後。
- **範圍風險：** stale elimination 與 `how:bomb` 雖相鄰，但不屬本 Sprint。
  修正：score/winner/how 一律 zero-diff hard gate，不順手修。

原 Grill 判定：**Go with hard gates**。只有 exact diff、score/winner zero-diff、RNG
consumption zero-diff 與 stale diagnostics 歸零同時成立才可完成；任一不成立即 No-Go，
不擴大修法。

## 7. Counterfactual audit 結果

在 production source 尚未修改時，以 Vite memory transform 對同一支真實 simulator 執行
legacy／candidate paired audit。Candidate 只把 defuse 的 actor views 改為 post-combat alive：

- legacy source SHA：`870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b`；
- candidate source SHA：`8cac7a4b8611045baaa96b7c0ff440e761874170b8374aeda496e23c5024e880`；
- 21 個 RNG call sites 與 source token sequence 不變；
- baseline seed `3820910912`：stale T 不再阻擋 ct3，defuse 提前一個 tick 完成；新舊比分、
  round winner/how、最終 player result 與 RNG call count相同，但 legacy 多一個 round 5
  `sec=70` 的空白 defuse-tail frame；
- `reflex` treatment、seed `1011896540`：legacy 已死亡 ct5 在 round 9 `sec=76` 被選為
  defuser，`branchGate=true` 並留下／持續「拆彈中」state；candidate 能正確移除，證實修法
  有效且 R6 baseline 低估 treatment coverage；
- `clutch` treatment、seed `4200255727`：candidate 讓 runtime RNG consumption 從
  **2005 降為 2004**。比分／round winner/how／最終 player result 在該 gate 前仍相同，
  但後續 RNG stream 已不再具備 zero-diff 保證。

因此 R9 依 hard gate 判定 **No-Go**。沒有修改 `EsportsFPS3D.jsx`、R1–R8 expected hashes、
contract、Store、UI、Progress 或任何 gameplay value，也沒有建立 R9 verifier segment。

不採用的規避方式：

- 補一個 dummy `rand()`：會刻意改 RNG consumption，且把測試需求寫進 gameplay；
- 特判延遲 defuse complete：新增不合理 gameplay branch；
- 每回合重設／分流 RNG：屬重大 simulator architecture 與 determinism migration；
- 放寬 verifier／更新 digest：會掩蓋真正非零 RNG trajectory。

後續若要修，需另行決定「正確 defuse gameplay 可合法改變後續 seeded trajectory」是否可接受，
或先設計獨立 per-round RNG architecture Sprint；兩者都超出本輪最小修正授權。

No-Go 收尾後重跑 `cs23`、R1–R8、`progress25` 與 production build，共 **10/10 PASS**；
確認 production checkpoint 與所有既有 measurement/digest baseline 未受 counterfactual audit 污染。
