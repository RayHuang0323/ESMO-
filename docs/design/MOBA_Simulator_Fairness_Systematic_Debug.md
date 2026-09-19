# MOBA Simulator Fairness — Systematic Debug Record

> 日期：2026-09-18
> 分支：`main`
> 基準：`b065846f5fcedc6928c412a9d3af55cfcfba0c56`
> 方法：`debugging-and-error-recovery`（reproduce → localize → reduce → hypothesis test → regression gate）

## 裁決

本輪已穩定重現 Side Bias，但**沒有接受任何模擬器程式修正**。目前證據顯示它不是單一 `findPath`、塔區或 target-selection 參數造成，而是至少兩個結構問題疊加：

1. **已證實的結構缺陷：角色到 lane 的 mapping 沒有依 side 做 180° mirror。**
   `src/LogicEngine.js` 以 side-blind 的 `ROLE_LANE[role]` 建立兩側玩家；但地圖的真實 mirror 是
   `blue_top ↔ red_bot`、`blue_bot ↔ red_top`、`mid ↔ mid`。這在 deterministic mirror harness 的 tick 0 即可重現。
2. **已定位但尚未修好的放大器：formation／movement 在同一 tick 讀取 live opponent／ally geometry。**
   它讓玩家陣列順序、gank RNG 與導航碰撞時序把微小差異放大；凍結 formation snapshot 能改善平均值與勝率方向，但 P90/max 仍變差，所以不是可接受的 root-cause fix。

另外，LaneSwap 後在 t=19 的 mid-only mirror divergence 顯示仍有動態 navigation timing residual；這是獨立 navigation debt，沒有修改 `mobaNavigation.js` 或 `findPath`。

## 固定重現基線

使用既有正式 runner、固定 seed range 與現有 gates，沒有換 seed、沒有修改 baseline：

```text
node tools/balance/moba_items_balance_runner.mjs \
  --seeds=200 --configs=off --workers=6 \
  --out=D:/OneDrive/文件/GitHub/ESMO-worktrees/_fairness-p0-baseline-repro
```

乾淨 Items OFF n=200：

| 指標 | 固定重現結果 |
| --- | ---: |
| finish rate | 200/200 |
| Blue win | 49/200 = 24.5% |
| duration median / P90 / max | 25.35 / 31.90 / 40.85 分 |
| raw `rK/bK` | 1.752（closure 文件沿用四捨五入記錄 1.71） |
| per-role symptom | Red top K/D 6.264、Red jungle 2.211；Blue top 0.772、Blue jungle 0.510 |

同一 clean baseline 的多次執行逐場 deterministic；因此不是單次抽樣或偶然 console 結果。

## Hypothesis ledger

| 假設 | 單一實驗／證據 | 結論 |
| --- | --- | --- |
| H1：角色 lane mirror 錯配是結構來源 | exact 180° mirrored roster；目前 mapping 在 tick 0 讓 top／adc／sup 先破 mirror；暫時只做 red top↔bot 後 tick 0 對齊 | **Confirmed contributor**；但單獨 LaneSwap n=200 只有 Blue 35.0%、`rK/bK=1.3663`，P90 32.633、max 52.675，不能出貨 |
| H2：靜態地圖／塔／營地不對稱 | `check_moba_nav_h2` 14/14、mesh checked 97,760 violations 0、camp routes 6+6/3 pairs、camp placement 43/43 | **Not primary root** |
| H3：findPath fix 是唯一根因 | 原 closure findPath candidate：Blue 24.5%→28.5%，McNemar p≈0.43；P90/max 惡化 | **Rejected**；不改 findPath |
| H4：spawn jitter 是唯一根因 | center/symmetric-spawn probes 沒有同時修復 winner、ratio、tail | **Rejected as sole root**；未改出生規則 |
| H5：tower zone 是唯一根因 | 移除 tower-zone 行為反而使 n=40 Blue 8/40、`rK/bK=1.9135` | **Rejected** |
| H6：target selection 是唯一根因 | same-lane combat target probe 與 freeze-selection probe 均沒有同時改善公平與 tail；strict lane scope 甚至造成長局 | **Rejected** |
| H7：shared RNG／players order 是唯一根因 | 固定 RNG、reverse、interleave、per-side gank RNG probes 改變結果但沒有穩定滿足所有 gates | **Order/RNG amplifier, not sole root** |
| H8：live formation geometry 是唯一根因 | no-formation / freeze geometry / freeze snapshot 均能改變 bias；但 accepted gate 仍失敗 | **Confirmed amplifier, incomplete fix** |
| H9：FX RNG、decisionTemper、per-player quality RNG | 各自隔離後不能解釋 baseline；FX RNG n=40 與 baseline 完全相同 | **Falsified** |

每個 probe 均只切換一個假設或一個明確 isolation layer；沒有調整 balance 數值、seed、baseline 或 gate threshold。

## Mirror invariant evidence

### Static layer

- lane／structure mirror verifier：`14 PASS / 0 FAIL`。
- distance field raw mismatch 雖有未對稱化對照值，正式對稱化後為 `0`。
- blue/red route reachability：`0 / 0` unreachable；mirror route length max difference `0.00`。
- tower placement mirror error `0.000`；camp exact mirror `43/43`。

### Runtime layer

Deterministic mirrored roster、同一 seed、decisionTemper=0、固定 RNG、紅方初始位置設為藍方 180° mirror：

- 目前 side-blind role mapping：tick 0 即由 top／adc／sup 破 mirror。
- 套用**只在 probe 中存在**的 red top↔bot lane swap：tick 0 對齊。
- LaneSwap 後第一個差異在 tick 38（t=19），只剩 mid；關閉 nav collision 只能把差異延後，不能消除。

這把「資料語意／角色路線」與「動態導航 timing」分開：不是把所有差異都歸咎於 findPath。

## 為何沒有留下 partial fix

以下兩個 composition 只作診斷，不是產品修法：

| probe | n=200 結果 | 裁決 |
| --- | --- | --- |
| LaneSwap | Blue 35.0%、`rK/bK=1.3663`、P90 32.633、max 52.675 | 平均值改善但 tail 惡化，**未解決** |
| LaneSwap + freezeArchSnapshot | Blue 42.0%、`rK/bK=1.0104`、P90 32.10、max 42.825 | ratio 接近 1，但 P90/max 仍高於固定基線，**未解決** |

因此本輪沒有把任何「平均值變好」誤標為 root-cause fix，也沒有留下會改變 `moba-sim.v6` 語意的半成品。

## Additional controlled evidence (2026-09-18)

The diagnostic-only `baseline+noArch` control was run with the same `moba-sim.v6`, roster construction, seeds, and OFF configuration; it bypassed `_archPosition` without changing engine source:

| control | n | Blue win | rK/bK | P90 | max | unfinished |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| official baseline | 200 | 24.5% | 1.7520 | 31.90 | 40.85 | 0 |
| baseline + noArch diagnostic bypass | 200 | 43.5% | 0.9740 | 30.683 | 39.408 | 0 |

This is causal evidence that the live formation layer is the dominant fairness surface, not an acceptable product fix: removing formation changes intended gameplay behavior. `mirrorSpawn` alone was unchanged from baseline in the 40-seed control; `LaneSwap` improved mean winner/kill metrics but failed the tail (`max=52.675` at n=200). Therefore the lane mapping is an independent geometry contributor, while the accepted root boundary is the interaction between side-blind lane mapping and live formation/target geometry in the per-player movement loop.

Static navigation, route/camp/tower mirror gates remain green. Pure target-selection probes, tower-zone probes, spawn probes, FX RNG, decision temperature, and per-player quality RNG were rejected as sole roots. No production code fix is accepted by this sprint because the candidate fixes either remove formation behavior or worsen P90/max. `mobaNavigation.js` and `findPath` remain untouched.

## Scope boundary

- 未修改 `src/LogicEngine.js`、`src/gameData.js`、`mobaNavigation.js` 或 `findPath`。
- 未 bump `moba-sim.v7`。
- 未改 Items、balance、seed、baseline 或 acceptance threshold。
- Competitive／Challenge／Ranked 仍 disabled；Item v1 release 與 Formal PvE 邊界不變。

```text
FAIRNESS_ROOT_CAUSE_EVIDENCE = LOCKED
FAIRNESS_CLOSED = NO
COMPETITIVE_ENABLE_READY = NO
```

下一個可接受的 code change 必須同時保護 role/lane mirror invariant 與 movement/formation 的 tick-level symmetry，並在固定 n=200 上同時通過 winner、`rK/bK`、P90、max、determinism、regress、build；本輪不開始該修正。

## Candidate C10 — immutable movement view（2026-09-18）

針對「每名英雄依序移動時，後面的 formation／movement decision 讀到前面英雄已更新的位置」做單一候選驗證：movement／formation／tower-zone／join 讀取 tick 內快照，combat resolve 保留 live state。固定 `moba-sim.v6`、Items OFF、同一 mirrored roster 與 seeds 1–40：Blue `18/40 = 45.0%`、`rK/bK=1.0018`、mean `27.815` 分、P90 `31.785` 分、max `50.117` 分、unfinished `0`；對照 n=40 baseline Blue `30.0%`、`rK/bK=1.6183`、P90 `34.667` 分、max `40.333` 分。

這是「平均／ratio 改善但 tail 退化」的明確反例：max 增加約 9.8 分，故不升級到 n=200、不跑 release gate、不接受為產品修正。候選 source patch 已完整撤回；本輪只保留證據文件，`LogicEngine`、`mobaNavigation.js`、`findPath`、baseline、seed、gate 與 `moba-sim.v6` 均未改動。

## Candidate C11 — combat nearest-target tie-break（2026-09-18）

假設是 `_combatStep` 的 nearest-target 在等距時沿用 `alive` 陣列順序，造成集火側偏；加入以 `player.id` 為次排序鍵的最小候選後，固定 OFF、seeds 1–40 得 Blue `12/40 = 30.0%`、`rK/bK=1.6385`、P90 `34.792` 分、max `40.333` 分、unfinished `0`，與 baseline `30.0% / 1.6183 / 34.667 / 40.333 / 0` 無實質改善。假設否決，source 已撤回。

## Candidate C12 — formation nearest-anchor tie-break（2026-09-18）

假設是 `_archPosition` 在等距最近敵人時沿用 `alive` 陣列順序，讓 formation anchor 選擇受 blue-first player order 影響。只加入 `player.id` deterministic secondary key，固定 OFF、`moba-sim.v6`、seeds 1–40 得 Blue `12/40 = 30.0%`、`rK/bK=1.6385`、P90 `34.79` 分、max `40.33` 分、unfinished `0`；與同一 n=40 baseline 的 `30.0% / 1.6183 / 34.667 / 40.333 / 0` 無實質改善。假設否決，source 已撤回，未升級到 n=200。

## Candidate C13 — formation tick-start view only（2026-09-18）

假設是只有 `_archPosition` 讀取到前面玩家已移動後的 live geometry 才造成 side bias；因此只把 formation helper 的 `alive`／position 輸入換成 tick-start snapshot，其他 movement、tower、combat 與 navigation 維持原狀。固定 OFF、`moba-sim.v6`、seeds 1–40 得 Blue `25.0%`、`rK/bK=1.2119`、mean `27.85` 分、P90 `33.69` 分、max `48.83` 分、unfinished `0`。雖 P90／ratio 有局部改善，winner 未改善且 max 從 baseline `40.33` 惡化，依 tail gate 否決；source 已撤回，未升級到 n=200。

## Candidate C14 — support ally reposition isolation（2026-09-18）

假設是 support formation 依 live ally HP／position 選擇保護目標，造成 side-ordered movement 放大器；只停用 `_archPosition` 的 support ally reposition，保留其他 formation、lane、combat、tower 與 navigation。固定 OFF、seeds 1–40 得 Blue `32.5%`、`rK/bK=1.7458`、P90 `31.85` 分、max `40.33` 分、unfinished `0`。P90 有改善但 kill ratio 變差且 winner 仍不公平，假設否決，source 已撤回。

## Candidate C15/C16 — lane component isolation（2026-09-18）

為分解已確認的 role/lane contributor，分別只改一個紅方 lane component：

| candidate | change | Blue | rK/bK | P90 | max | unfinished | verdict |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| C15 | red top → bot | 28.2% | 1.8588 | 32.62 | 60.00 | 1 | reject |
| C16 | red adc/sup bot → top | 37.5% | 1.4634 | 32.43 | 42.37 | 0 | reject |

兩個 component 都不能同時滿足 winner、ratio、P90、max；C15 甚至產生 unfinished。這支持「lane mapping × role/formation interaction」而非單一路線 root，兩個 source 候選均已撤回，未升級到 n=200。

## Candidate C17/C18 — lane mirror × movement order interaction（2026-09-18）

在 H1 lane contributor 與 movement-order amplifier 已分別被定位後，測試兩者的最小組合：完整 red top↔bot mirror，並讓 movement loop 以同 role 的 blue/red 成對順序執行。

| candidate | Blue | rK/bK | P90 | max | unfinished | verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| C17 lane mirror + paired movement | 47.5% | 1.0410 | 30.64 | 44.68 | 0 | reject: max tail |
| C18 C17 + formation tick-start view | 55.0% | 0.8225 | 33.46 | 42.62 | 0 | reject: ratio/tail |

C17 是目前最接近公平面的組合，但 max 仍比 n=40 baseline `40.33` 惡化；C18 再次證明 snapshot 不是根因修正。兩個 source candidate 均撤回，依 tail gate 不升級到 n=200。

## Navigation residual diagnostic — same-lane directionality（2026-09-18）

既有 `check_moba_nav_h2` 驗的是 180° mirror route（例如 `blue_top` ↔ `red_bot`），不等於同一 global lane 的雙向 path symmetry。新增唯讀診斷，以同一路線 `t=.25 ↔ .75` 比較 `findPath` 長度；`alive` 為空與全活塔集合結果相同：

| lane | forward | reverse | difference |
| --- | ---: | ---: | ---: |
| top | 168.595 | 165.745 | +2.850 |
| mid | 115.210 | 114.399 | +0.810 |
| bot | 165.745 | 168.595 | −2.850 |

更近的 `t=.35 ↔ .65` 仍為 top `+1.449`、bot `−1.449`。這不是 tower alive state；它是靜態 A*／路徑簡化的方向性 residual。它與 side-blind role/lane distribution 及 live formation 的 interaction 可解釋為何 180° mirror gate 全綠仍有 Side Bias，但原 closure 的 findPath candidate 已被 n=200 paired gate 否決；本輪依使用者紅線不修改 `mobaNavigation.js` 或 `findPath`。

## P0-A — Side-relative Formation / Movement closure（2026-09-19）

TDD verifier `tools/check_moba_side_relative_p0a.mjs` 先在未修正狀態得到 `3 PASS / 4 FAIL`：top、adc、sup 的 lane assignment 與 movement intent 不符合 180° mirror；加入 canonical lane transform 後，再以可觀測 live movement 加強 contract，得到 `6 PASS / 1 FAIL`，鎖定同 tick 內「先算目標即移動」仍讓後迭代方讀到新位置。最小結構修正如下：

- `ROLE_LANE` 明確定義為己方 canonical tactical lane；runtime 透過 `worldLaneForSide()` 映射到 world lane。
- 紅方 formation 先轉到己方 canonical frame，執行同一份 `_archPositionCanonical()`，再以 180° transform 回 world coordinates。
- `twoPhaseTick` 先收集全員 immutable movement intent，全部決策完成後才套用位移；v1 legacy path 不變。

修正後 symmetry contract `8 PASS / 0 FAIL`；其中新增的 v2 相容性測試先以 `7/1` 失敗，加入僅限 v3 的 `sideRelativeFormationMovement` 規則開關後轉綠，歷史 v1/v2 的 lane 與 movement iteration 語意保持不變。固定 Items OFF、`moba-sim.v6`、seeds 1–200 的 A/B/C 證據：

| 組別 | Blue win | rK/bK | median | P90 | max | unfinished |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A 原始 baseline | 24.5% | 1.7520 | 25.35 | 31.90 | 40.85 | 0 |
| B side-relative formation/movement | 48.5% | 0.9335 | 27.28 | 33.58 | 48.92 | 0 |

B 證明 lane/formation/movement 是 causal root：winner 與 kill ratio 大幅收斂，且 `regress`、`regress2`、build、正式 180° navigation mirror gate 均通過。但 P90/max 相對 A 惡化，因此不宣稱整體 fairness closure。

C 以 `tools/measure_moba_navigation_directionality_p0b.mjs` 量測未修改的 `findPath`：t=.25↔.75 的 same-lane forward/reverse 差為 top `+4.308`、mid `+0.810`、bot `−4.308`；t=.35↔.65 仍為 top `+1.449`、mid `+0.138`、bot `−1.449`。這與既有 180° mirror `14/14` 並不衝突，正式切為 P0-B Navigation Mirror Sprint。

```text
P0_A_CLOSED = YES
FAIRNESS_CLOSED = NO
COMPETITIVE_ENABLE_READY = NO
P0_B_NAVIGATION_MIRROR = READY / NOT STARTED
```

## P0-B — Navigation Mirror closure（2026-09-19）

依 systematic-debugging + TDD 先建立 `tools/check_moba_navigation_mirror_p0b.mjs` failing contract：初版 `8 PASS / 6 FAIL`，穩定重現 top `+4.308`、mid `+0.810`、bot `−4.308` 的 same-lane forward/reverse path cost 差異。逐一隔離後確認：`ε=1.7` weighted A* 的 early goal/tie ordering 會讓無向 graph 產生方向性；greedy waypoint simplification 也會放大不同 traversal ordering；endpoint projection 若只回傳 projected goal，連續 path cost 會再引入方向差。

最小採用修正：A* 改為 admissible `ε=1.0`、保留既有 180° canonical half mirror normalization、回溯保留完整 grid waypoint ordering（不使用方向性 greedy simplify），public API 仍不回傳 caller 起點。未採用的 pair-order/full-endpoint 候選曾破壞 C3 或 regress2，均未保留。

導航證據：

| lane / t pair | 修正前 delta | 修正後 delta |
| --- | ---: | ---: |
| top .25↔.75 | `+4.308` | `+0.407` |
| mid .25↔.75 | `+0.810` | `0.000` |
| bot .25↔.75 | `−4.308` | `−0.407` |
| top .35↔.65 | `+1.449` | `−0.319` |
| mid .35↔.65 | `+0.138` | `0.000` |
| bot .35↔.65 | `−1.449` | `+0.319` |

P0-B symmetry `14/14`、nav H2 `14/14`（C3 mirror path max diff `0.00`）、mesh `97,760/0`、regress `15/15`、regress2 `8/8`、runtime29 flat `35/35`、build PASS。固定 Items OFF、`moba-sim.v6`、seeds 1–200 的 A/B/C：

| 組別 | Blue win | rK/bK | median | P90 | max | unfinished |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A 原始 baseline | 24.5% | 1.7520 | 25.35 | 31.90 | 40.85 | 0 |
| B P0-A | 48.5% | 0.9335 | 27.28 | 33.58 | 48.92 | 0 |
| C P0-A + P0-B | 49.0% | 0.945512 | 26.90 | 35.19 | 47.67 | 0 |

P0-B 確實修正了 navigation directional contributor，且 max 由 `48.92 → 47.67`；但 P90 由 `33.58 → 35.19`，仍明顯高於 baseline，故 navigation 不是剩餘 long-tail 的充分根因。C 組 runner wall time `184s → 304s`、`wall_ms_mean 5465.59 → 9053.36`，性能成本列為後續風險，不以調參掩蓋。

```text
P0_A_CLOSED = YES
P0_B_CLOSED = YES
FAIRNESS_CLOSED = NO
COMPETITIVE_ENABLE_READY = NO
P0_C_TAIL_LONG_MATCH = READY / NOT STARTED
```

## P0-C Tail / Long Match Root Cause closure（2026-09-19）

本輪依 `debugging-and-error-recovery` 的 systematic-debugging + TDD 流程，固定 `moba-sim.v6`、Items OFF、同一批 seeds 1–200；沒有改 baseline、seed、balance、fairness gate、Item v1、`findPath` 或 version。觀測工具為 `tools/check_moba_tail_rootcause_p0c.mjs`，守門工具為 `tools/check_moba_tail_p0c_invariant.mjs`。

### Hypothesis decision

| 假設 | 證據 | 裁決 |
| --- | --- | --- |
| H1：優勢方失去有效 structure progression | top-tail 的長 gap 可由 `structureProgress`、tower lead、alive power 對照重現；不是單看 duration | 需要拆分 healthy / pathological，不能直接壓 tail |
| H2：kill / chase 取代 objective | chase、pick、teamfight 與 objective kill 都存在；top-tail 仍有 tower/core progression | 不是單一 causal root |
| H3：retreat / re-engage、formation oscillation 阻止 siege | trace 有大量 transition，但 power、lead、tower progress 會反覆翻轉 | 是行為訊號，不足以單獨修正 |
| H4：respawn cycle 重複關閉 siege window | respawn 與 gap 同時存在，但 close match 會重新推塔或反殺 | 是 healthy comeback 的一部分，不以 timeout 消除 |
| H5：tower-zone / nexus-wave gating 造成 pre-core deadlock | H12 seed 80 在 `t=3600` 已雙方 11 個非 nexus structure 全倒，但 nexus 仍為 `7200/7200`、沒有 base wave/core progress | **Confirmed pathological root** |
| H6：長局是 draft / scaling / tactic comeback | top 8 tail 全部有 comeback、power/kill/structure lead 反轉與後續 objective progression；固定 roster/tactic 是 mirrored | **HEALTHY_LONG_MATCH 應保留** |
| H7：targetless `LANE` 被跨 lane 遠距離敵人當 formation anchor | seed 129 在 structure advantage `4` 時可重現；H12 後 cross-lane offenders `0`，同線敵人仍保留自然接戰 | **Confirmed contributor；採最小 guard** |

### Accepted minimal fixes

1. `_archPositionCanonical()` 只在 `decisionAction=LANE`、沒有明確 target、且最近敵人跨 lane 且超過 engage range 時，拒絕跨線 formation anchor；沒有廣泛停用 formation，也沒有改 combat target selection。
2. 小兵 advance 只在 `blocker.lane === "nexus"` 的 base assault 解開雙方 minion blocker；仍保留 nexus `stopT`，因此不改 damage、速度、塔血或 respawn。這使 wave 能到達主堡，修正「中線互卡 → 永遠沒有 objective progression」。

H12 的 seed 129 invariant 與 H13 的 seed 80 base-assault invariant 均在 `tools/check_moba_tail_p0c_invariant.mjs` 通過。修正後 seed 80 於 `t=2759s` 正常結束，blue nexus `-2450.42`，不再到 `3600s` 未結束。

### Top-tail classification

固定 D 組的 top 8 tail（seed `176, 80, 11, 6, 85, 55, 156, 169`）全部 `comeback=true`，每場都有 `structureProgressEvents`、`coreProgressEvents` 與至少一側的 base-wave evidence；gap 期間的關鍵對照如下。power 為 gap 起點附近的 blue/red alive power，結構為 `blueDown/redDown`。

| seed | D duration | winner | post-1200 gap | gap 起點 → 結束（structure；power） | classification |
| ---: | ---: | --- | ---: | --- | --- |
| 176 | 50.52m | red | 727.5s | 6/5、312/249 → 7/6、274/182 | HEALTHY_LONG_MATCH：戰力與擊殺 lead 反覆翻轉，後續繼續拆塔並完成 core |
| 80 | 45.98m | red | 601.0s | 5/6、324/173 → 6/6、359/242 | HEALTHY_LONG_MATCH（H13 後）：comeback、objective progression；原 H12 狀態才是 pathological base deadlock |
| 11 | 40.39m | red | 628.5s | 5/5、330/234 → 5/6、289/273 | HEALTHY_LONG_MATCH：combat / kill / structure lead 改變後仍繼續推進 |
| 6 | 40.10m | blue | 415.5s | 4/4、312/280 → 4/5、351/309 | HEALTHY_LONG_MATCH：雙方接近、合理翻盤後 blue close |
| 85 | 38.88m | red | 418.0s | 6/3、287/336 → 6/4、264/353 | HEALTHY_LONG_MATCH：red 有 combat/objective 優勢並持續推塔，非 deadlock |
| 55 | 38.51m | blue | 580.5s | 5/5、306/235 → 5/5、348/201 | HEALTHY_LONG_MATCH：同結構、持續團戰與後期推進 |
| 156 | 37.38m | red | 369.5s | 5/6、313/270 → 6/7、244/334 | HEALTHY_LONG_MATCH：kill lead 與戰力由 blue/red 互換 |
| 169 | 37.38m | red | 673.0s | 6/4、278/277 → 6/4、333/245 | HEALTHY_LONG_MATCH：接近戰力造成拉鋸，後段仍有 structure/core progression |

這些 fixed mirrored roster / mirrored tactic trace 沒有 draft side 差異；marksman 有既有 early/late authored signal，其餘角色多為 `unmodeled`，所以只記錄「可能的 scaling／戰術翻盤證據」，不把它誇大成已證明的 draft 根因。20–28 分鐘 controls 為約 `21.2–26.7m`，均正常結束並持續有 structure/core progression。`HEALTHY_LONG_MATCH` 因此仍然存在，沒有為了降低 max 而消除。

### A / B / C / D fixed-seed comparison

| 組別 | Blue win | rK/bK | median | P90 | P95 | max | unfinished | kills mean | towers20 mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A 原始 baseline | 24.5% | 1.7520 | 25.35 | 31.90 | 34.11 | 40.85 | 0 | 25.36 | 7.915 |
| B P0-A | 48.5% | 0.9335 | 27.28 | 33.58 | 37.42 | 48.92 | 0 | 27.93 | 7.755 |
| C P0-A + P0-B | 49.0% | 0.945512 | 26.90 | 35.19 | 37.57 | 47.67 | 0 | 30.885 | 7.135 |
| D P0-A + P0-B + P0-C | 46.5% | 0.960015 | 25.90 | 30.81 | 35.88 | 50.52 | 0 | 26.715 | 7.825 |

D 相對 C 的 P90 `35.19 → 30.81`、P95 `37.57 → 35.88`，unfinished 維持 `0`；max `50.52` 並非新的未結束 deadlock，而是 seed 176 的 healthy close match。D 的 final tower averages 為 blue/red `7.085/6.775`，blue/red core destroyed `107/93`；A/B/C/D 均 `violations=0`、`conservationFails=0`。因此 P0-C 關閉的是 pathological B，不把 healthy tail 當 bug。

### Verification and boundary

- P0-C invariant：H12 cross-lane `PASS`；H13 base-assault `PASS`。
- P0-A symmetry `8/8 PASS`；P0-B navigation mirror `14/14 PASS`。
- runtime29 flat `35/35 PASS`；regress `15/15`；regress2 節奏門檻 `8/8`；Vite build `2908 modules PASS`。
- same-seed：simulation columns 逐欄一致；runner 只有 `wallMs` 計時欄不同。
- 沒有修改 `mobaNavigation.js`／`findPath`、Item v1、baseline、seed、balance、gate、`moba-sim.v6` 或 Competitive。

```text
P0_A_CLOSED = YES
P0_B_CLOSED = YES
P0_C_CLOSED = YES
FAIRNESS_CLOSED = NO
COMPETITIVE_ENABLE_READY = NO
```

`P0_C_CLOSED=YES` 只代表 pathological long-match root 已以最小結構修正關閉；`FAIRNESS_CLOSED=NO` 保持既有全球 gate，不因 healthy tail 的重新分類而放寬競技標準。Competitive／Challenge／Ranked 維持 disabled。
