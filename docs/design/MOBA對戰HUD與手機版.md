# MOBA 對戰 HUD 與手機版

> **狀態：規格 + Audit（Sprint 29A 完成）｜實作留待 Sprint 29B（D）**
>
> Sprint 29 拆成 29A（效能根因 / 模擬正確性 / 時間校準 / 戰術播報）與
> 29B（HUD 版面重構 / 場景美術升級）。**本文件的版面重構尚未實作**——
> 因為本環境無瀏覽器，一份從未執行過的 HUD 重寫風險過高（`build` 只擋語法錯，
> 擋不了 runtime 白畫面）。以下是 29B 動工前該有的規格與現況盤點。

---

## 1. 現況 Audit（29A 已完成的部分）

### 已修（29A，屬效能根因 A）

| 項目 | 舊行為 | 修正 |
|---|---|---|
| `BattleHUD` 訂閱 | `useBattleStore()` **無 selector** ⇒ 訂閱整個 store（events / log / floating / series 任一變動都重繪） | 收斂為 `(s) => s.mvp?.id`（字串，identity 穩定） |
| `battleReducer` | 每幀都 `new` 一個 `derived` 物件（即使推塔數沒變）⇒ 訂閱者每幀重繪 | 內容真的變了才換參照 |
| `Minimap` | **無節流的 rAF**（60fps 重繪整張 canvas），但引擎每秒只推 2–8 幀 | 節流到 12fps |

### 未修（留 29B）

| 問題 | 現況 |
|---|---|
| **面板遮擋戰場** | `BattleHeroStrip`（十人完整列）永久顯示在下方；手機尤其嚴重 |
| `BattleHUD` 寬度 | `width: min(96%, 560px)` 固定置頂置中，小螢幕會壓縮 |
| `BattleTimeline` | 固定 `left: 10, width: 226`，手機會蓋住左半場 |
| `Minimap` | 固定 `150×150` 貼右下，未考慮 safe area |
| Scoreboard | 只有桌機 TAB 鍵可開 ⇒ **手機完全無法看十人資料** |
| z-index | 散落在各元件（8 / 9 / 10 / 12），無統一規範 |
| `BattleHeroStrip` 訂閱 | 仍訂閱整份 `snapshot`（10 張卡每幀重繪）——需要拆成 per-player selector |

## 2. 29B 目標版面

### 桌機（≥1024px）

```
┌──────────────────────────────────────────────┐
│           比分 / 時間 / 目標倒數（上方）        │
│ ┌────────┐                                   │
│ │Timeline│            戰場                    │
│ │(可收合)│                        ┌─────────┐│
│ └────────┘                        │ 小地圖  ││
│      精簡十人列（點選展開詳細）      └─────────┘│
└──────────────────────────────────────────────┘
```
- Timeline 可收合（已有 `fold` 狀態，需補預設收合斷點）。
- 十人列**精簡**（頭像 + HP + KDA + 本場等級 `mlv`），詳細資料點選展開。

### 手機（<768px）

- 上方：**精簡**比分 / 時間（不放目標倒數細節）。
- 下方：**只顯示目前焦點英雄**（相機跟隨的那位）。
- 十人完整資料 → **bottom sheet**（上滑開啟），不常駐。
- Timeline → 抽屜 / 收合按鈕，預設收合。
- 小地圖固定在 safe area 內。
- 控制鈕（開始/鏡頭/倍速/畫質）→ 拇指可及範圍。

## 3. 共用規範（29B 必須遵守）

- **共用資料來源**：桌機與手機資訊密度不同，但**只有一份 store**
  （`useGameStore.snapshot` / `useBattleStore`）。不得為手機另做一套統計。
- **無水平捲軸**；所有浮層不得超出 safe area（`env(safe-area-inset-*)`）。
- **長名字**：統一截斷規則（`text-overflow: ellipsis` + `max-width`），不換行破版。
- **z-index 規範**（29B 建立）：
  | 層 | z-index |
  |---|---|
  | 3D Canvas | 0 |
  | 小地圖 / 信標 | 9 |
  | HUD / Timeline | 8 |
  | 控制鈕 | 10 |
  | Scoreboard / bottom sheet | 12 |
  | 終局畫面 | 20 |
- **禁止 `transform: scale` 縮小整頁**（S29 §11）——要用真正的響應式版面。
- **重播與正式對戰共用同一套顯示組件**（或明確的 read-only 變體）。

## 4. 需人工驗證的尺寸（29B 交付時）

320×568 / 360×800 / 390×844 / 430×932 / 768×1024 / 1366×768 / 1920×1080

驗證項：HUD 遮擋、Timeline 收合、十人 bottom sheet、小地圖位置、控制鈕可觸及、
無水平捲軸、長名字截斷。

## 5. S29A 新增、29B 需納入版面的控制項

- **播放倍率** 1× / 2× / 4×（`useLocalServer.setRate`）——目前暫置於右上。
- **畫質** 低 / 中 / 高（`battle/quality.js`）——目前暫置於右上，
  預設由 `detectQuality()` 依裝置判斷，手動選擇存 localStorage。

兩者在 29B 應併入正式設定面板（手機版尤其不該佔用戰場右上角）。

---

## 6. Sprint 29B2 實作紀錄（本文件 §2–3 的落地）

> 狀態更新：**手機 HUD 第一版已實作**（29B2）。以下為實際落地內容與 §2 規格的對照。

| 規格 | 落地 |
|---|---|
| Timeline 預設收合（手機） | `BattleTimeline`：`useState(() => isMobile)`；收合時 header 顯示**最新一則事件**（toast 語意），寬度 `min(226px, 62vw)` |
| 十人列 → bottom sheet | `BattleHeroStrip`：手機預設收合成**焦點對位列**（焦點 = 距 `computeFocus` 最近的藍方英雄所在 lane）；展開 = bottom sheet（46vh 捲動 + 背幕點擊收合）；桌機預設展開、可收合 |
| 英雄詳情 → 全螢幕 sheet | `HeroDetailPanel`：手機 inset 0 全螢幕；**關閉 ✕ 固定頂部列**（原本在長內容最下方）；桌機限高 84% 可捲動 |
| 小地圖 safe area | `GameView Minimap`：手機 106px、`bottom: calc(50px + env(safe-area-inset-bottom))`（抬離收合面板） |
| 控制鈕收納 | 手機：⚙ 展開（結束/鏡頭/倍率/畫質）；桌機原樣 |
| 響應式判斷 | 唯一來源 `src/ui/useViewport.js`（`useIsMobile`：寬 ≤700 或 touch-first ≤900） |

**尚未做**（列 29B3+）：z-index 統一常數表（現況沿用各元件既有值，無新增衝突）、
`BattleHeroStrip` per-player selector 拆分、Scoreboard 手機入口（TAB 鍵仍桌機限定）、
倍率/畫質併入正式設定面板。

### 相機/地圖比例（同屬 29B2，詳見 MOBA場景視覺規範.md §S29B2）

- `fitZoomFor(w, h, mobile)`（`BattleCameraController` 匯出）：以視窗尺寸推導正交 zoom，
  桌機全圖框滿、手機聚焦有效戰場（**真相機取景，非 CSS scale**）。
- 跟隨模式 base/fight zoom 改由 fitZoom 派生（手機 fight = ×1.8）；
  **焦點死區 6 邏輯單位**：聚類逐幀漂移不再造成高頻抖動。
- 非跟隨模式由 `CameraRig` 依視窗設定預設取景；滾輪/雙指縮放仍可手動調整。
- 英雄模型 ×1.3（`HK`）、小兵 ×1.25——可讀性放大，只動視覺不動座標。

⚠ **全部未經瀏覽器/手機實測**（§4 的尺寸矩陣仍需 Ray 人工驗收）。

---

## 7. Sprint 29B3 增補

- **隊伍面板手勢**（CS 式）：把手上滑展開完整 5v5 bottom sheet／下滑收合（閾值 24px、
  touchAction none、手機把手 padding 8px＋拖曳杆）；點擊把手與背幕點擊仍可用。
- **控制鈕再收斂**：移除「導播/自由」雙大按鈕（相機模式由點擊互動切換，free 時才出現
  單一「🎥 回到導播」）；移除正式版「⏹ 結束」——測試模式（?debug=1）才有
  「⏩ 快速完成比賽」（見 `MOBA導播鏡頭與測試控制.md`）。

---

## 8. Sprint 29B4 增補

- **10 英雄一致可點根因修**：`HeroDetailPanel` 舊碼 `if (!hero) return null`——對無
  HeroProgress 紀錄的英雄（對手方；或 heroId 不在既存 progress）回傳 null＝點了沒反應。
  改為 `storeHero ?? emptyHero()` 佔位＋「尚無成長紀錄」註記 ⇒ 藍紅 10/10 一致可開。
  點擊路徑（laneRow → SideCell onClick → mk → setOpen）藍紅同構，hitbox = 整列 cell。
- **「快速完成比賽」脫離 ⚙ 收合**：測試模式常駐可見（見 `MOBA導播鏡頭與測試控制.md`）。
- 面板收合手勢（上/下滑）、bottom sheet、頂部固定 ✕ 均沿用 29B2/29B3，未改。
