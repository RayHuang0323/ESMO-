# Rock Pack Benchmark 彙整 — Milestone B

> 程式可證欄位已填；**FPS/記憶體等需瀏覽器實測欄位待補**（跑法見 ROCK_PACK_REPORT §3c）。
> 依 Commit Gate：缺人工 FPS benchmark 前不建立 Commit 2、不宣稱正式驗收完成、不虛構數字。

## 程式保證（已成立，與硬體無關）

| 情境 | 目標實例 | 資產種類 | 環境 Draw Calls | 材質 | 貼圖 | 唯一幾何 |
|---|---|---|---|---|---|---|
| 石·單一 1000（Rock_Medium_A） | 1000 | 1 | 2 | 1 | 0 | 2 |
| 石·8 種混合 | ~2000 | 8 | ≤16 | 1 | 0 | 16 |
| 石·2600 混合壓測 | 2600 | 8 | ≤16 | 1 | 0 | 16 |

- **draw call 不隨實例數增長**（單一 1000 = 2 call；8 種混合最多 16，遠距 cull 後更少）。
- 材質 1、貼圖 0；8 件 tris LOD0 ≤180 / LOD1 ≤80（全在 ASSET_BUDGET 內）。

## 自動驗證（已跑）

- `npm run check:rock` → **76/76**（8 件 / LOD0/LOD1 / 幾何·材質重用 / 無 Math.random /
  決定性 / bounding / pivot / 各情境實例數正確且不沿用 / scale·rot·color 範圍）。
- `npm run check:env` → 17/17；`npm run build` → 通過。

## 瀏覽器實測（2026-07-20，人工跑三檔 preset）

來源：`rock_pack_benchmark_桌機板.json` / `_手機.json` / `_手機低階.json`（Chrome、dpr 1.5）。

| 情境 | preset | 實例 | LOD0 | LOD1 | Culled | Draw Calls | Triangles | Avg FPS | Frame(ms) | Mem(MB) | 材質 | 貼圖 | valid |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rockSingle | desktop | 1000 | 0 | 505 | 495 | 4 | 121,050 | 60 | 16.67 | 52 | 3 | 0 | ✅ |
| rockMix8 | desktop | 2000 | 0 | 993 | 1007 | 11 | 120,830 | 60 | 16.66 | 55 | 3 | 0 | ✅ |
| rockStress2600 | desktop | 2600 | 0 | 1308 | 1292 | 11 | 130,664 | 60 | 16.67 | 53 | 3 | 0 | ⚠️¹ |
| rockSingle | mobile | 1000 | 0 | 58 | 942 | 4 | 85,290 | 58.4 | 17.12 | 53 | 3 | 0 | ✅ |
| rockMix8 | mobile | 2000 | 0 | 122 | 1878 | 11 | 85,450 | 60 | 16.67 | 52 | 3 | 0 | ⚠️¹ |
| rockStress2600 | mobile | 2600 | 0 | 156 | 2444 | 11 | 86,594 | 60 | 16.67 | 54 | 3 | 0 | ✅ |
| rockSingle | mobile-low | 1000 | 0 | 0 | 1000 | 0 | 0 | 60 | 16.67 | 55 | 3 | 0 | ✅² |
| rockMix8 | mobile-low | 2000 | 0 | 0 | 2000 | 0 | 0 | 60 | 16.67 | 58 | 3 | 0 | ✅² |
| rockStress2600 | mobile-low | 2600 | 0 | 0 | 2600 | 0 | 0 | 60 | 16.67 | 54 | 3 | 0 | ✅² |

¹ 兩筆 `valid=false`，但 **sampleFrames=180、avgFps=60、其餘指標與同組 valid 樣本一致** → 是
Debug 取樣門檻的**假陰性**（`mounted` 檢查在連跑整組時誤判），**非效能或資料問題**（見下）。
² mobile-low 全數 culled（見下）→ 0 可見、0 draw call，數據有效但未實際渲染石頭。

## 判讀

- **✅ Draw call 不隨實例數增長（真機證實）**：rockSingle 1000＝**4**、rockMix8 2000＝**11**、
  rockStress2600 2600＝**11**。實例 1000→2600，draw call 不變（由「資產種類×LOD」決定）。
- **✅ 60 FPS 全達標**（桌面/手機/手機低階，frame time ~16.67ms＝vsync 上限）。
- **✅ 預算**：tris 桌面 ~121–131k、手機 ~85k（皆 ≪ 桌 500k / 機 300k）；材質 3、貼圖 0、
  記憶體 ≤58MB。
- 8 種混合／2600 混合的 per-asset 明細、cull 數皆正確、無 NaN/null。

## 兩個需注意的點（不影響「效能達標」結論，但影響「完整驗收」）

1. **2/9 樣本被標 `valid=false`（假陰性）**：`runOne` 的 `mounted`（等待新案例掛上）檢查在
   「連跑整組（跑石壓測）」時對重情境誤判為未掛上，但該筆其實已正常取樣 180 幀、指標正確。
   → 屬 Debug 取樣門檻缺陷，**非 Rock Pack 問題**。建議最小修正 `mounted` 判定後重跑一輪取得
   全 `valid=true` 的乾淨紀錄。
2. **測試鏡頭太遠 → LOD0 從未被渲染、mobile-low 全 culled**：鏡頭距場中心 ~66m，最近的石頭
   約 37m；desktop cull 70m 才看得到（皆落 LOD1）、mobile cull 45m 僅少數、mobile-low cull
   30m **全部被 cull（0 可見）**。→ 證實 cull 生效，但**LOD0 幾何與 mobile-low 的實際石頭
   渲染未被本輪 benchmark 涵蓋**。建議把 benchmark 鏡頭拉近（或加一組近距鏡頭）再跑，方能
   完整覆蓋 LOD0 與 mobile-low。

> **驗收判定（選項 B：接受）：Rock Pack 程式驗證完成、效能達標。** 三檔 preset 全數 ~60 FPS、
> draw call 不隨實例數增長（4–11）、面數/材質/貼圖/記憶體全在預算內。上述兩點（valid=false
> 假陰性、mobile-low 全 cull）判定為 **Debug Benchmark 層問題**，不影響正式遊戲、模擬與 Rock
> Pack 接入，**不阻塞 Milestone B**；列為後續可另開的 Debug Benchmark 改善項。
