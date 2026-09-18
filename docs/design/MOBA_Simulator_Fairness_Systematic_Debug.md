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
