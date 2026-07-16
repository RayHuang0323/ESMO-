# MOBA 世界尺度與路線幾何（Sprint 29B5）

## 1. Reference Gate

本 Sprint 使用 `docs/reference/moba-map/` 內 Ray 提供的兩張圖片作結構參考：大型角落基地、
對角河道、外圈三路、分艙野區、獨立 Dragon / Baron 坑與 camps。影片 metadata 可讀
（25 秒、576×1280、約 30fps），但本機無 ffmpeg、Python 不可執行，未擷取畫面；不得據此
宣稱鏡頭或移動節奏已比對完成。參考檔只供 Audit，不作為遊戲貼圖、模型或 icon。

## 2. 單一世界資料源

`src/gameData.js` 匯出 `WORLD_BOUNDS` / `MAP_BOUNDS` / `WORLD_SIZE` / `WORLD_SCALE`，
邏輯範圍為 `(0,0)–(220,220)`，中心 `(110,110)`，3D 映射倍率仍為 1.7。主場景、
Minimap、Camera 與新 Replay `mapMeta` 都由這組資料推導；舊 Replay 沒有 `mapMeta` 時保留
100×100 fallback。禁止再在視圖散落 `100`、`50` 或自行複製座標。

## 3. 幾何配置

- 基地／泉水：blue `(22,202)` / `(14,210)`；red 為 180° 鏡像。
- 三路弧長：top 312.14、mid 226.27、bot 306.79（舊 133.98 / 99.74 / 129.79）。
- 河道：七點對角折線、資料寬 22；Dragon `(160,157.83)`、Baron `(60,62.17)`。
- 野區：28 個鏡像牆體、12 片草叢；每側各一座 Buff 與兩座 Jungle Camp。
- 路線前沿：`laneAdvanceWorldSpeed=0.25` 世界單位／秒；不再用 `t/600` 令長路線隱性加速。
- 小兵：`minionWorldSpeed=1.8`、英雄一般移速 4.5，均未隨世界倍率提高。

## 4. 修改前後量測

修改前基準：100×100；小兵首次受傷約 82.5 秒、接觸約 83 秒；英雄接觸 p50 83.5 秒；
M1 極端最早 15.5 秒；首殺 p50 324 秒、首塔 p50 232 秒；5/10/15/20 分擊殺
0/5/11/15；時長 p50 17.34 分。

29B5 12-seed verifier 樣本：小兵首次受傷 p50 111.5 秒；英雄首次／最早接觸
110 秒；泉水到線上約 57.2–63.3 世界單位（12.7–14.1 秒 @4.5）；雙方泉水到
Dragon / Baron 約 34.4–34.5 秒；首殺 p50 303 秒、首塔 p50 305 秒；
5/10/15/20 分擊殺 0/3/7/15；比賽時長 p50 約 24–25 分。40-seed pacing 樣本仍須以
`check_moba_pacing29b1` 的輸出為正式節奏防線。

## 5. 收尾與公平性

世界擴大後前期 travel time 不以速度抵銷。為避免長局無法結束，v3 僅在 9 分鐘後增加
既有雙方對稱的 late combat factor，並在 20 分鐘後增加**建築傷害**收尾係數；兩者不寫死
winner、擊殺數或時長。基地／泉水精確鏡像，每個 pit 到雙方泉水距離差 <0.5。

## 6. 驗證與人工驗收

`tools/check_moba_worldscale29b5.mjs` 驗證 reference pack、bounds、距離、接觸時間、速度、
公平性、presentation、Minimap、Replay、生命週期、Recall，以及 29B1–29B4 / runtime29
完整鏈的 exit code 與輸出形狀。

Node 無法證明地圖視覺真的放大 2–3 倍、手機 FPS/draw calls、觸控鏡頭手感、objective
美術品質或影片相似度；這些必須由 Ray 真機驗收。

## 7. S29B6 增補：世界邊界成為相機 pan 的 clamp 來源

29B5 建立的 `WORLD_BOUNDS` 在 29B6 多了一個消費者：**相機平移邊界**。

- `battle/cameraStore.js` 的 `clampPan(x, y)` 一律把鏡頭注視點夾在
  `WORLD_BOUNDS.minX..maxX / minY..maxY` 內 ⇒ 玩家再怎麼拖也**滑不出地圖黑區**。
- `pan` 存的是**邏輯世界座標**（0–220），不是 3D 座標；3D 換算仍走
  `worldX/worldZ`（`WORLD_SCALE = 1.7`）⇒ 尺度知識沒有第二份。
- `BattleCameraController.fitZoomFor` 與焦點死區（`WORLD_BOUNDS.width * 0.027`）
  同樣由 bounds 推導，未新增魔術數字。
- 29B5 的規則不變：**禁止再在視圖散落 `100`、`50` 或自行複製座標**。
  29B6 移除 OrbitControls 時，連同它寫死的 `minZoom/maxZoom` 一併收進
  `cameraStore.ZOOM_MIN/ZOOM_MAX`（值不變：1.6 / 9）。

verifier `check_moba_camera_replay29b6.mjs` §4 實測：`clampPan(+∞, −∞) = (220, 0)`、
`clampPan(−∞, +∞) = (0, 220)`、store 實際 pan 也被夾住。
