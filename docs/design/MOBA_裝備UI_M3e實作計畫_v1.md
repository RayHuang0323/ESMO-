# MOBA 裝備 UI M3e 實作計畫 v1 — Item Replay Integration

> 狀態：Owner Review M3d APPROVED 後開始（2026-09-15）。只做 Replay；不做 balance、不正式啟用 itemsV1。
> 規格來源：`docs/design/MOBA_裝備系統_v1.md` §8、`docs/design/MOBA_裝備UI_M3規格_v1.md` §9（M3e）。

## 全域限制（Owner 照錄）

- Replay 記錄本場 buildStrategy、purchase events、item metadata；additive optional fields；舊 MobaReplay.v1 繼續相容。
- 播放不重新跑 AI；用實際 purchase events；以 foldPurchasesAt 還原指定時間的 Inventory；seek／pause／resume 後一致。
- UI：timeline 加 Item purchase track；T3／升級鞋標記比一般組件明顯；選英雄顯示該時間 6 格；標記可跳到購買時間；mobile-first、不擁擠。
- 策略：顯示我方本場 Build Strategy、紅方 Standard；不重新計算 previewStrategy。
- 舊 Replay 沒有 itemMeta／purchases：正常播放、不顯示 Item track、不報錯。
- 不動：LogicEngine、dmgK、income、item balance、TacticScreen。
- 驗證：purchase timeline deterministic、fold at T = snapshot inventory、seek 前後、pause 不改狀態、refresh／resume 正確、舊 Replay 相容、M1／M2／M3、build／relevant regress、320／390／768／1366、console clean。
- local commit，不 push、不 deploy，停止等 Owner Review。

## 現況與取捨

- `foldPurchasesAt` 尚不存在（M3 規格 §9 列為 M3e 新增）⇒ 本輪新增於 `src/battle/moba/items/itemReplay.js`。
- 引擎只保留最近 40 筆購買（環形緩衝）；戰鬥中重新整理後恢復，引擎先安靜重跑到保存時間 ⇒ 之前的事件拿不到。
  ⇒ Replay 在第一格 frame 記 **baseline**（10 人 6 格＋lastSeq＋策略），只收 seq > baseline.seq 的事件。
- Replay 本身只存在 session 記憶體（既有設計，不寫 localStorage）⇒ 頁面重新整理後沒有上一場重播；
  「refresh／resume」驗證＝戰鬥中重新整理後恢復的那一場，其 Replay 仍正確。

## 格式（MobaReplay.v1 附加 optional）

```
itemMeta  = { version: "moba-items.replay.v1", catalogVersion, itemIds[], strategyByPlayer[n],
              baseline: { t, seq, slots[n][6] (itemIds 索引，-1 空格) }, gaps }
purchases = [[seq, t, seatIdx, actionCode(0 buy/1 combine/2 dropStarter), itemIdx, cost, unspentAfter], …]
```

- seatIdx＝playersMeta／frame.p 順序；frame 不存背包。
- `validateMobaReplay`：兩欄都沒有 ⇒ 不檢查；有其一 ⇒ 兩者形狀、索引、seq／t 遞增都要正確。

## 還原

- `decodeItemsReplay(replay)`：舊 Replay ⇒ null。
- `foldPurchasesAt(items, t)`：baseline 起，依 seq 套用 t 以前的事件；格位用 `purchaseCost`＋`applyPurchase`（與引擎購買同一規則）；dropStarter 由下一筆購買依同規則處理。
- `selectReplayPurchaseMarkers`、`selectReplayHeroItemsAt`、`selectReplayStrategies`（讀保存的引擎策略原值）。

## UI（`MobaReplayScreen`）

| 區塊 | 設計 |
|---|---|
| 標頭 | 「我方出裝 ○○」「紅方 標準」兩個籤（有裝備紀錄才出現） |
| 時間軸 | 滑桿下方購買軌：沒選英雄 ⇒ 只畫全場 T3／升級鞋；選了英雄 ⇒ 該英雄全部購買（組件細刻度、升級鞋青色菱形、T3 金色大菱形）。整條軌可點（手機高 44），跳到最近的標記 |
| 裝備面板 | 控制列「🛒 裝備」切換（桌機預設開、手機預設收）：10 位英雄頭像鈕（44×44，藍紅兩列）、選中英雄該時間 6 格＋完成件數＋策略、該英雄 T3／升級鞋購買籤（44 高，可跳時間，橫向捲動） |
| 舊 Replay | 沒有裝備紀錄 ⇒ 購買軌、裝備鈕、策略籤都不出現 |

## 任務

1. `itemReplay.js`（純函式）＋ `replayBuffer` 擷取／定稿＋ `mobaReplay` 形狀驗證。
2. `ReplayItemTrack`、`ReplayItemPanel`（`src/battle/ui/items/`）＋ `MobaReplayScreen` 接線。
3. M3 驗證器 G13（格式、fold＝snapshot、determinism、恢復 baseline、舊 Replay、seek 順序無關）、G14（接線靜態）；G6／G8 調整；M1 模組數 15、G13 允許 replayBuffer／MobaReplayScreen。
4. `tools/browser_review_moba_items_m3e.mjs`：OFF 場（舊格式）與 ON 場（真實流程＋前期壓制、戰鬥中重新整理恢復、快速完成）分兩段；四寬度量測與截圖。
5. build、M1／M2／M3、replay 相關 regress；handoff；local commit。
