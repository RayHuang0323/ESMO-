# MOBA 裝備 UI M3b（Battle HUD）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 本輪由 Owner 指定在同一 session inline 執行。

**Goal:** 把 M3a 的裝備元件接進正式戰鬥畫面（桌機十人列＋焦點底欄、手機焦點底欄＋bottom sheet、購買通知），itemsV1 OFF 時完全不出現，完成後停止等 Owner Review。

**Architecture:**
- 唯一接點是現役戰鬥底層 `ObserverPanel`（`src/battle/ui/BattleObserverHUD.jsx`）。
  - `BattleHeroStrip` 已無 import，不動。
  - Replay 也掛 `ObserverPanel replay`，一律 `!replay` 才讀裝備。
- 資料：`selectHudItems(snapshot)`；購買通知：`selectPurchaseToasts`。
- 新元件都放 `src/battle/ui/items/`。

**Tech Stack:** React 18、既有 `battleObserver.css`、M3a 元件、CDP browser harness（真實戰鬥頁 `?debug=moba-runtime-battle&itemsDev=1`）。

**Spec:** `docs/design/MOBA_裝備UI_M3規格_v1.md` §9 M3b＋Owner M3b 指示（2026-09-15）。

## Global Constraints

- 不改 `LogicEngine`、`dmgK`、收入、裝備平衡、Replay（`src/screens/moba/MobaReplayScreen.jsx`、`src/battle/moba/replay/`、`src/platform/contracts/mobaReplay.js`）、`TacticScreen`。
- `FEATURE_FLAGS.itemsV1` 維持 `false`；`snapshot.items` 不存在 ⇒ 裝備 HUD 零 DOM，既有「裝備 · 未提供」佔位維持原樣。
- JSX 不重算金錢／背包／屬性／決策；只讀 `selectHudItems`、`selectPurchaseToasts`、`itemVisual`。
- 不加高：
  - 頂部記分板高度不變（`HUD_H`、`hudStore` 高度表不改）。
  - 桌機席位列高度 52px 不變。
  - 手機焦點底欄高度（112px，既有）不變。
- 手機可點元素 ≥ 44×44；購買通知 `pointer-events: none`、2.5 秒消失、同時最多 2 則。
- 截圖寬度 320／390／768／1366；不帶 `shot=` 參數（會開 WebGL 診斷與戰鬥 Debug 面板蓋住底欄）。

## 量測基準（M3b 前，真實戰鬥頁 itemsDev=1、ts≈93）

| 寬度 | 底欄 | 十人列 | 記分板 |
|---|---|---|---|
| 320 | 308×112（y 602） | 無（手機走「隊伍」sheet） | 307×64 |
| 390 | 378×112（y 726） | 無 | 374×64 |
| 768 | 480×115（y 897） | 160×284 ×2（y 112），席位 52 高 | 560×72 |
| 1366 | 740×115（y 773） | 160×284 ×2（y 112），席位 52 高 | 560×72 |

## 版面決策

| 位置 | 收合（常駐） | 展開（使用者點開） |
|---|---|---|
| 桌機十人列席位 | 名字列右側 6 顆微型指示；KDA 列右側 xs 金錢 | 「裝備視圖」：血條＋KDA 列換成 6 格 20px 真插槽＋金錢（席位仍 52 高） |
| 桌機底欄 | 原「裝備 · 未提供」按鈕換成焦點英雄指示＋金錢，點擊切換十人列裝備視圖 | — |
| 手機底欄 | 名字列右側焦點英雄指示＋金錢（按鈕點擊區只往下延伸到非互動的血條區，達 44px） | bottom sheet（貼在底欄上方）：焦點英雄 xs→lg 6 格＋大金錢＋點格子看名稱；其餘英雄精簡列（點選切換焦點）；關閉鈕 |
| 購買通知 | 桌機：記分板安全區下方置中；手機：底欄上方置中 | — |

- 十人列寬 160 → 192px（`.items-on`），才放得下 6 格 20px（6×20＋5×3＝135 ≤ 136）。
- 手機通知底距 `ITEM_TOAST_MOBILE_BOTTOM = 130`（底欄 112＋底距 6＋間隔 12），寫在 `battleLayout.js`。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/battle/moba/items/itemsUiSelectors.js` | 改 | `selectPurchaseToasts` |
| `src/battle/ui/items/BattlePurchaseToasts.jsx` | 新 | 通知佇列（掛載記 lastSeq、2.5 秒、最多 2 則、桌機／手機位置） |
| `src/battle/ui/items/SeatItemsCompact.jsx` | 新 | `SeatItemPips`、`SeatItemsExpanded` |
| `src/battle/ui/items/MobileItemsSheet.jsx` | 新 | 手機裝備 bottom sheet |
| `src/battle/ui/items/GoldChip.jsx` | 改 | `xs` 尺寸 |
| `src/battle/ui/battleLayout.js` | 改 | `ITEM_TOAST_MOBILE_BOTTOM` |
| `src/battle/ui/BattleObserverHUD.jsx` | 改 | 接線（`!replay` 且有 `snapshot.items` 才渲染裝備） |
| `src/battle/ui/battleObserver.css` | 改 | `.items-on` 十人列寬、指示列、手機 chip、sheet |
| `tools/check_moba_items_m3.mjs` | 改 | G7 通知篩選、G8 戰鬥接線靜態檢查 |
| `tools/browser_review_moba_items_m3b.mjs` | 新 | 真實戰鬥頁 OFF／ON × 四寬度量測與截圖 |

## Tasks

### Task 1：通知篩選 selector（已先寫紅燈 G7）
- [ ] `selectPurchaseToasts(snapshot, { afterSeq })`：只回完成 T3／鞋子升級、seq > afterSeq、OFF 回 null。
- [ ] `node tools/check_moba_items_m3.mjs` G7 綠。

### Task 2：戰鬥 HUD 元件
- [ ] `SeatItemPips`／`SeatItemsExpanded`／`MobileItemsSheet`／`BattlePurchaseToasts`／`GoldChip xs`。
- [ ] G3 隔離掃描綠（新檔在 `src/battle/ui/items/` 內）。

### Task 3：接進 ObserverPanel ＋ CSS
- [ ] `hudItems = replay ? null : selectHudItems(snapshot)`。
  - null ⇒ 所有既有 JSX 原樣（含「裝備 · 未提供」）。
  - 有值 ⇒ 依版面決策渲染。
- [ ] `data-items-ts`（渲染用的 snapshot.ts）與席位 `data-seat-gold`／`data-seat-slots`，給瀏覽器比對 snapshot。
- [ ] G8 靜態檢查：
  - 不 import 規則模組。
  - `replay` 閘門存在。
  - OFF 佔位字串仍在。
  - Replay／TacticScreen／LogicEngine／規則模組相對 HEAD 無改動。
  - `HUD_H` 與 `hudStore` 高度表未改。

### Task 4：真實戰鬥頁量測與截圖
- [ ] OFF（不帶 itemsDev）四寬度：
  - `snapshot.items` 不存在、裝備 DOM 0。
  - 佔位按鈕在、底欄高度＝基準。
- [ ] ON 四寬度：
  - 無水平溢出、console 無 error。
  - 底欄高度＝OFF（手機 112）、桌機席位 52。
  - 裝備元素不進入「中央戰場矩形」（十人列之間、記分板下緣到底欄上緣）。
  - DOM 金錢／背包＝同一 ts 的 `selectHudItems(snapshot)`。
  - 手機 chip ≥ 44。
- [ ] 手機開 sheet（390）：6 格 ≥ 44、關閉鈕 ≥ 44、截圖。
- [ ] 桌機開裝備視圖（1366）：席位仍 52、6 格可見、截圖。
- [ ] 通知：
  - 等到一則出現、2.5 秒內消失、`pointer-events: none`、截圖。
  - reduced-motion 下出現即最終狀態。

### Task 5：收尾
- [ ] `npm run build`、M1／M2／M3、`verify.mjs --only=regress,regress2`（一支一支跑，避免記憶體不足被砍）。
- [ ] 備份後追加 Sprint／風險文件；`git add` 明確檔案；local commit；停止等 Owner Review。
