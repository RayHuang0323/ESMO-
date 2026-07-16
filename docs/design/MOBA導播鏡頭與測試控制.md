# MOBA 導播鏡頭與測試控制（Sprint 29B3）

> 相機：`src/battle/cameraStore.js`（狀態）＋ `src/battle/ui/BattleCameraController.jsx`（行為）
> ＋ `src/MobaView3D.jsx`（點擊互動）。測試控制：`src/ui/debugMode.js` ＋
> `useLocalServer.fastForward`。驗證：`tools/check_moba_controls29b3.mjs` §1–4、§8–11。

## 1. 相機模式（cameraStore，預設 director）

| 模式 | 進入方式 | 行為 |
|---|---|---|
| `director` | 預設／雙擊空白／「回到導播」按鈕／heroFocus 到期 | `computeSpectatorFocus` 自動跟焦點（VICTORY > ACE/連殺 > 塔/龍/巴龍事件 > 交戰聚類 > 重心）＋焦點死區 6 單位防抖 |
| `objectiveFocus` | 導播的**自動子模式**：焦點鎖在龍/巴龍坑（爭奪中） | 同 director，模式標籤反映「正在看目標戰」 |
| `heroFocus` | **點擊英雄**（raycast 命中英雄模型） | zoom-in 聚焦該英雄 4 秒（規格 3–5s），較快跟隨（posLerp 0.09）、更近 zoom（fit×1.85／手機 ×2.1）；到期自動回 director |
| `free` | 拖曳 >8px／滾輪縮放／點擊空白 | 控制器完全不介入（OrbitControls 手動；桌機拖曳/滾輪、手機單指拖曳/雙指縮放）；顯示單一「🎥 回到導播」小按鈕 |

- **不再有「導播鏡頭／自由鏡頭」兩顆大按鈕**——模式由互動自然切換。
- 取景沿用 29B2：`fitZoomFor(w,h,mobile)`（桌機全圖／手機聚焦戰場，真 ortho zoom）。
- **任何模式都不可能改變模擬結果**：cameraStore／控制器零引擎 import；
  verifier §11 實測「模擬中每秒翻轉模式 ⇒ 結果逐位元相同」。

點擊判定（MobaView3D，pointer events）：按下→放開位移 <8px = tap；tap 命中英雄
（Raycaster 對英雄 capsule）⇒ `focusHero(id)`；tap 空白 ⇒ free；移動 >8px = 拖曳 ⇒ free；
雙擊 ⇒ 回 director；滾輪 ⇒ free。開局（`begin`）重置為 director。

## 2. 測試用比賽控制（Debug complete match）

**正式多人版不能有玩家手動結束對戰** ⇒ 舊「⏹ 結束」按鈕已移除。
取而代之：測試模式限定的「⏩ 快速完成比賽」。

- **顯示閘門** `isDebugMode()`（`src/ui/debugMode.js`）：Vite DEV／URL `?debug=1`／
  `localStorage.esmo_debug="1"` 任一成立。**正式部署預設不顯示**；
  Ray 實機測試在網址加 `?debug=1` 即可看到。
- **行為** `useLocalServer.fastForward()`：對**同一顆引擎**分塊推進（每 macrotask
  20 模擬秒、每 2 模擬秒 push 一幀）直到終局。
  - Replay 取樣（FRAME_INTERVAL_S=2）完整覆蓋全場（verifier §4：660 frames、
    最大間隔 2.0s）；Timeline 事件流照常 ingest。
  - 終局幀走**既有** useBattleFeed 流程 ⇒ BattleResult →（冪等）發獎 → Replay 定稿
    → EndScreen/Result，與自然跑完**同一條路**；不重複發獎（transactionId 冪等）、
    不像重新開始（不 new 引擎、不 reset）。
  - 結果與自然跑完**逐位元相同**（verifier §2：分塊＋途中 snapshot 不改模擬）。
- 尚未做（列候選）：timeline 進度條拖曳／快轉到指定時間點——目前只有
  1×/2×/4× 倍率與 complete match；拖曳快轉需要「引擎快照回放緩衝」設計，非本 Sprint 範圍。

## 3. 未經真機實測

點英雄/雙擊/拖曳手勢、`?debug=1` 的 UI 流程、heroFocus 觀感——需 Ray 實測。

---

## S29B6 增補：地圖不能移動的根因、單一控制來源、2.5D 手勢

> 視角方向的政策見 `MOBA_2.5D視角與資產策略.md`（29B6 新增）。本節只記相機實作。

### 根因：`enablePan` 被寫死成 debug

Ray 29B5 部署後手機實測「地圖無法自由拖曳或雙指縮放，只能單一視角觀看」。
根因在 `MobaView3D` 的一行：

```jsx
<OrbitControls makeDefault ... enablePan={debug} minZoom={1.6} maxZoom={9} />
```

`debug` 是 `MobaView3D` 的 prop，預設 `false`，而 **`GameView` 從來沒有傳過它**
⇒ 正式版 `enablePan` **恆為 false**。OrbitControls 的預設是「左鍵/單指 = 旋轉、
雙指 = dolly+pan」，於是：

- 單指拖曳 → 去**旋轉**一個本來就不該旋轉的 2.5D 正交戰場；
- 雙指 → pan 被關掉，只剩 dolly；
- 真正要的「平移地圖」**根本沒有實作**。

29B3 的 pointer handler 也只是「切 camera mode」，不做位移——位移一直是
OrbitControls 的職責，而它被關著。

### 修法：移除 OrbitControls，cameraStore 成為單一來源

| 層 | 職責 |
|---|---|
| `battle/cameraStore.js` | **唯一狀態源**：`mode` ＋ `pan`（邏輯世界座標）＋ `zoom`（正交）。`userPanTo` / `userZoomTo` **一律先切 free**；`setAutoTarget` 只寫值不改 mode。pan 一律 `clampPan` 於 `WORLD_BOUNDS`、zoom clamp 於 `ZOOM_MIN..ZOOM_MAX` |
| `MobaView3D` 手勢層 | 單指拖曳 → pan（**地面 y=0 平面 raycast**：抓住的地面點跟著手指走）；雙指 → pinch zoom ＋ 中點 pan；滾輪 → 中心 zoom；tap 英雄 → `focusHero`；tap 空白 → free；雙擊 → 回導播。`touchAction="none"`（原本由 OrbitControls 設，移除後自己設） |
| `BattleCameraController` | **唯一控制點**：把 cameraStore 的 pan/zoom 套到相機（固定俯角 `CAM_OFFSET`，零旋轉）。自動模式先平滑再把**螢幕上實際看到的**視野寫回 store ⇒ 玩家一伸手指切 free，視野無縫接續、不跳回導播目標點 |

- `CameraRig`（29B2 的非跟隨取景）**併入控制器**——相機只能有一個驅動點。
- 滾輪縮放以**畫面中心**為錨：單次離散事件無法像捏合那樣逐幀收斂到指標錨點
  （相機那一幀還是舊 zoom），硬做會漂移 ⇒ 維持中心縮放，行為可預期。
- **模擬結果不受影響**：cameraStore / 控制器零引擎 import、零 Store 寫入；
  verifier 29B6 §5 實測「模擬中每秒 pan+zoom+翻模式共 1500 次 ⇒ 結果逐位元相同」。

### 對 29B3 §1 表格的更新

`free` 列的「控制器完全不介入（OrbitControls 手動）」**已不成立**：free 的 pan/zoom
現在由 cameraStore 持有、由控制器套用。free 真正的語意是
**「控制器不跑導播、不與玩家搶鏡頭」**（不呼叫 `computeSpectatorFocus`，直接套用玩家視野）。
`check_moba_controls29b3` §10 的斷言已隨之更新（理由見 `05_Sprint紀錄.md` 29B6 節）。

---

## S29B4 增補：測試控制可見性與 debug gate 強化

- **?debug=1 根因修**：`isDebugMode`（`src/ui/debugMode.js`）舊版只讀
  `window.location.search`；GitHub Pages 上帶 hash 的網址（`.../ESMO-/#/x?debug=1`）
  search 為空 ⇒ 讀不到 debug。修法：`parseDebug` **同時解析 search 與 hash**，且 URL
  認定 debug=1 後**寫入 `localStorage.esmo_debug`** 持久化（本專案用 useState 換畫面、
  URL 不變，持久化確保後續畫面仍為測試模式）。`?debug=0` 可清除。
- **按鈕可見性根因修**：「⏩ 快速完成比賽」原本巢狀在手機 ⚙ 收合面板（`showCtl`）內，
  手機預設收合 ⇒ 看不到。改為**測試模式常駐可見**（脫離 ⚙，zIndex 12），桌機/手機皆然。
- 行為不變：`useLocalServer.fastForward` 同引擎分塊推進到終局、走既有 Result/發獎
  （冪等）/Replay 定稿流程；與自然跑完逐位元相同（verifier §6 實測）。
