# MOBA Item System v1 — Final Closure

> 日期：2026-09-18
> 功能分支：`design/moba-items-v1-m0`
> 收尾基準：`9d17f47`（M4d CLOSED）

## 結論

```text
ITEM_V1_CLOSED = YES
FORMAL_PVE_ENABLE_READY = YES
COMPETITIVE_ENABLE_READY = NO
```

Item v1 的功能範圍已完成收尾。正式啟用前的競技阻擋原因只有既有的 `MOBA Simulator Fairness` P0 debt；它在 Item v1 之前就存在，不是裝備系統造成。正式站本輪沒有啟用 `itemsV1`、沒有 deploy，也沒有開始 v1.1。

## 凍結邊界

- 模擬版本維持 `moba-sim.v6`，語意指紋 `795922935aaaed78`；沒有 bump `moba-sim.v7`。
- Item balance 使用 income `1.9` candidate；沒有再調 balance 數值、沒有新增功能。
- `itemsV1` 仍是 opt-in；OFF 時沿用 legacy 行為，ON 時由既有 items runtime／selector／Replay contract 提供裝備資料。
- 收尾前發現的 `mobaNavigation.js` findPath 實驗（22 insertions／4 deletions）已撤回至 `9d17f47`；同次未追蹤 mirror verifier 沒有進 commit。

## Final Gate 證據

| 範圍 | 結果 |
| --- | --- |
| M1 pure item foundation | `69/69 PASS`，exit 0 |
| M2 engine integration／OFF baseline／economy／determinism | `53/53 PASS`，exit 0 |
| M3 UI／strategy／Replay contract | `66/66 PASS`，exit 0 |
| simulation version gate | `51/51 PASS`，exit 0；仍為 `moba-sim.v6` |
| `regress` | 15/15 完成；平均 25.0 分、撤退鎖死 0；exit 0 |
| `regress2` | `8/8 PASS`；20/20 完成、最長 29.9 分、平均 24.2、中位 23.6；exit 0 |
| Tower／Siege relevant audit | Tower attack audit exit 0；有敵人無動作 0、扣血無 FX 0；M4b.6 siege `regress2` 8/8 evidence 保留 |
| Counter behavior | M4d 30 組離線對位／策略 evidence；帳務／背包違規 0；v1 不支援破盾與不足以觸發的反暴擊，不以提高購買率硬改 |
| Replay／snapshot contract | 正式流程 `24/24 PASS`，exit 0；purchase 140 筆逐欄、696 tick inventory fold、final snapshot／Replay fold、Result 一致，console/page exception 0 |
| production build | Vite `2908 modules`，exit 0；僅保留既有 large-chunk warning |

M4 paired evidence（`reports/moba-items-m4d/off-vs-on/summary.json`）為 `off`／`standard` 各 200 seeds、income `1.9`、worker failure 0：OFF finish `200/200`、Blue win baseline `24.5%`；ON standard finish `199/200`，items 帳務、背包、守恆與 rejected 均為 0。M4b.6 的 T3 timing 為第一／二／三件約 `8.98／16.45／20.25` 分，20 分每人約 `2.37` 件。

## 獨立 P0 Engine Debt：MOBA Simulator Fairness

這不是 Item v1 debt，也不納入本輪修正：

- Items OFF Blue win baseline：`24.5%`。
- 未採用的 findPath fix 實驗後：`28.5%`；`n=200`、McNemar `p≈0.43`，不顯著。
- `rK/bK = 1.71`；P90／max 反而變差，因此不把 navigation fix 帶入 Item v1。
- Side Bias 在 Item v1 前即存在；lane／role distribution／`engageRange` interaction 會放大觀測偏差。
- `findPath` mirror invariant defect 另列 navigation debt；本輪只撤回實驗，不再追 Side Bias。
- Fairness 修正前，Competitive／Challenge／Ranked 不得把 side 結果視為公平競技依據。

## 交付邊界

正式 PvE enable 所需的 Item v1 contract、economy、inventory legality、T3 timing、counter、Tower／Siege、Replay 與 deterministic same-seed evidence 已具備；競技模式維持 disabled-ready boundary，唯一原因是上述既有 P0 Simulator Fairness。手機真機 touch／GPU／FPS 與視覺體感不由 Node／桌面 browser gate 代替，仍交 Owner 驗收。

## Production Release Addendum（2026-09-18）

Closure 後已完成正式發布整合：`FEATURE_FLAGS.itemsV1 = true`，Formal PvE 使用既有
Item v1 runtime；Competitive／Challenge／Ranked 維持 disabled。M1／M2／M3、flat
release gate、build 與 browser closure 均在 release commit 前重跑通過。

```text
ITEM_V1_RELEASED = YES
FORMAL_PVE_ENABLED = YES
COMPETITIVE_ENABLED = NO
```

本 addendum 不改寫原始 M0～M4d closure evidence；`moba-sim.v6`、income `1.9`
candidate、findPath 邊界與既有 Fairness debt 均維持原裁決。

Production verification：程式 release commit `c05bfad` 的 GitHub Pages workflow
`35312451020` success；正式站 Item v1 smoke `7/7 PASS`。正式站未帶
`itemsDev` query，Formal PvE 的策略選擇、Loading lock、Battle `items-on`／10 seats
與 console/page errors `0` 均通過。
