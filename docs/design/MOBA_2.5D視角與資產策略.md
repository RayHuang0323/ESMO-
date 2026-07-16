# MOBA 2.5D 視角與資產策略（Sprint 29B6 正式定義）

> 本檔是 ESMO MOBA **視角方向與美術資產來源**的正式政策文件。
> 相機實作見 `MOBA導播鏡頭與測試控制.md`；場景視覺細節見 `MOBA場景視覺規範.md`；
> 世界尺度見 `MOBA世界尺度與路線幾何.md`。有衝突時，**視角方向以本檔為準**。

## 1. 為什麼現在要定這條線

29B1–29B5 一路把世界放大、把中立目標實體化、把地圖標籤補齊，但「這款遊戲的鏡頭
到底長什麼樣」從來沒有被寫下來。後果是實作上出現互相矛盾的設定：

- `MobaView3D` 掛著 drei `OrbitControls`，預設**可旋轉**（自由 3D 的作法）；
- 但 `enablePan` 被寫死成 `debug`（正式版永遠 false）⇒ **地圖不能平移**；
- 於是手機上唯一能做的事是「把 2.5D 正交戰場轉歪」——一個沒人想要的操作，
  同時真正需要的 pan / pinch zoom 不存在（Ray 29B5 部署後手機實測回報）。

先射箭再畫靶的結果就是這種組合。29B6 先把靶定下來：**ESMO MOBA 是 2.5D 正交戰術
視角**，然後讓相機實作服從它。

## 2. 政策（硬規則）

1. **ESMO MOBA 採 2.5D orthographic tactical view。**
2. **不追求自由旋轉的 3D MOBA。** 不做環繞鏡頭、不做第三人稱、不做可自由 orbit 的戰場。
3. **預設斜上方正交／類正交視角**，俯角固定
   （實作：`BattleCameraController.CAM_OFFSET`，沿用既有 `[55, 78, 78] × WORLD_SCALE` 的位移，
   29B6 移除 OrbitControls 後畫面角度逐值不變）。
4. **地圖可 pan / zoom，但不任意旋轉。** 相機自由度恰好兩個半：
   平移（XZ 平面）、正交 zoom；旋轉自由度**刻意為零**。
5. **英雄、塔、野怪可用 3D 低模。** 立體感來自模型與光影，不是來自轉鏡頭。
6. **地板、草叢、河道、牆體以可讀性優先。** 寫實度讓位給「一眼看得懂戰場」。
7. **手機以觀戰可讀性與效能優先。** 手機不要求一直看到完整地圖（`fitZoomFor` 手機聚焦
   有效戰場）；可讀性與 FPS 衝突時，先保 FPS 再保精緻度，但**不得砍光發光特效**
   （水晶／技能發光是 MOBA 的識別度來源，見 `MOBA場景視覺規範.md` §1）。
8. **未來正式資產使用 glTF／自有低模／可商用素材**，並維持 ESMO 自有輪廓。
9. **不使用 League of Legends／傳說對決等官方素材**（模型、貼圖、icon、截圖、音效一律不得引入）。
   參考影片／截圖只能作結構 Audit，不得成為遊戲資產（`docs/reference/` 的既有規則）。

## 3. 這條政策對相機實作的約束（29B6 落地）

| 項目 | 決定 | 實作位置 |
|---|---|---|
| 旋轉 | **零**（不提供任何旋轉入口） | 移除 `OrbitControls`（`MobaView3D`） |
| pan | 單指拖曳／滑鼠拖曳；抓住的地面點跟著手指走 | `MobaView3D` 手勢層 → `cameraStore.userPanTo` |
| zoom | 雙指捏合／滾輪；正交 zoom，**非 CSS scale** | `cameraStore.userZoomTo`（clamp `ZOOM_MIN..ZOOM_MAX`） |
| pan 邊界 | 一律 clamp 在 `WORLD_BOUNDS` 內 | `cameraStore.clampPan`（不得再散落 100/50 魔術數字） |
| 狀態來源 | pan/zoom **只存在 cameraStore**（單一狀態源） | `battle/cameraStore.js` |
| 套用者 | **只有** `BattleCameraController` 寫 three 相機（單一控制來源） | `battle/ui/BattleCameraController.jsx` |
| 模式 | director / objectiveFocus / heroFocus / free（29B3 定義不變） | 同上 |
| 模擬影響 | **零**——相機層零引擎 import、零 Store 寫入 | verifier 29B6 §5 逐位元對照 |

**單一控制來源是硬規則**：29B5 之前是「OrbitControls 持有 pan/zoom + 控制器每幀覆寫
`controls.target`」的雙頭馬車，這正是「拖曳沒反應／鏡頭被搶回去」這類問題的溫床。
之後若要加新的相機行為（例如小地圖點擊跳轉），**寫進 cameraStore，不要再引入第二個控制器**。

## 4. 資產策略

### 現況（29B6）

全部是 **Three.js 幾何程序化組合**的 MVP 低模與程序化貼圖：
Dragon（寬翼）／Baron（冠角蛇體）／Blue Buff／Red Buff／Jungle Camp（`makeNeutralVisual`）、
塔／主堡（三段圓柱＋八面體水晶）、程序化底圖（`makeRiftTexture`）。
**沒有使用任何第三方官方模型、icon、紋理或截圖。**

### 未來正式資產的驗收條件

1. 格式 **glTF/GLB**（低模、可 Draco 壓縮），或維持程序化幾何。
2. 授權：**自有**、或明確可商用（CC0／已購買授權），且授權文件與來源記錄在
   `docs/reference/` 或資產目錄的 `LICENSE`。
3. **輪廓必須是 ESMO 自有**——不得是任何既有商業 MOBA 角色的近似再製。
4. 效能：不得抵銷 S29A 的效能修復
   （動態 PointLight ≤2、FX 走物件池、共享材質、dpr 依畫質分級）。
5. 可讀性：在**手機正交取景**下仍可辨識陣營與單位類型；辨識度優先於細節量。

### 明確不做

- 自由 orbit／第一人稱／過場運鏡電影化。
- 為了「看起來像 3D」而犧牲正交戰術視角的可讀性。
- 未經授權的第三方 MOBA 素材（任何形式、任何理由）。

## 5. 未經真機驗收

本文件定義的是方向與約束，**不是已驗收的體感**。29B6 的觸控 pan/pinch、實機 FPS、
2.5D 取景在 320/360/390/430 的可讀性，Node 都證不了 —— 需 Ray 真機驗收
（見 `docs/handoff/08_目前待辦與風險.md`）。
