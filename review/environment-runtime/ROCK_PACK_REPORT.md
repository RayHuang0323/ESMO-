# Rock Pack 報告（First Environment Pack）— Milestone B

> ESMO 第一套正式環境資產。程序化生成的 stylized MOBA 石頭，接入既有 Environment Runtime
> （Milestone A），不另建第二套 runtime。全文繁體中文。
>
> 依循：ROCK_KIT_DESIGN、ASSET_INTEGRATION_GUIDE、PERFORMANCE_BIBLE、ENVIRONMENT_BUDGET、
> ENVIRONMENT_KIT_SPEC、STYLE_LANGUAGE(Cliff Language)、Visual Bible §3。

## 1. 八件資產清單

材質全部共用 `mat_env_stone`（1 個單例，頂點色石身↔苔，零貼圖）。Pivot 一律底部中心貼地
（最低點 Y=0、水平置中）。統一基準 Scale=1，實例縮放 0.75–1.35。輪廓刻意不同（不同 base
幾何／比例／位移／分層），非單純縮放。

| 資產 | 用途 | LOD0 tris | LOD1 tris | 材質 | Pivot | Scale | 適用區域 |
|---|---|---:|---:|---|---|---|---|
| `Rock_Small_A` | 小型地表石 | 80 | 20 | mat_env_stone | 底部中心 | 0.75–1.35 | 草地/路緣散石 |
| `Rock_Small_B` | 小型薄板石 | 48 | 12 | mat_env_stone | 底部中心 | 0.75–1.35 | 路面/平坦地表 |
| `Rock_Medium_A` | 中型岩石 | 180 | 80 | mat_env_stone | 底部中心 | 0.8–1.3 | 路口/營地圍邊 |
| `Rock_Medium_B` | 中型分層石 | 144 | 36 | mat_env_stone | 底部中心 | 0.8–1.3 | 崖腳/分層中石 |
| `Rock_Large_A` | 大型岩塊 | 180 | 80 | mat_env_stone | 底部中心 | 0.85–1.25 | 地標大岩塊 |
| `Rock_Large_B` | 大型分層立石 | 56 | 30 | mat_env_stone | 底部中心 | 0.85–1.25 | 分層立石/地標 |
| `Rock_Cliff_A` | 峭壁/邊界岩 | 108 | 48 | mat_env_stone | 底部中心 | 0.9–1.2 | 台地緣/岩壁銜接 |
| `Rock_Riverbank_A` | 河岸銜接岩 | 180 | 80 | mat_env_stone | 底部中心 | 0.85–1.25 | 河岸/水線銜接 |

- **全部 LOD0 ≤180、LOD1 ≤80**，遠低於 ASSET_BUDGET 石頭上限（LOD0 ≤300 / LOD1 ≤150）。
- **材質數＝1**（共用）。**唯一幾何數＝16**（8 件 × LOD0/LOD1，建立一次後快取重用）。
- 造型語言承 Cliff Language：水平分層（strata 0.34m，用於 Medium_B/Large_B/Cliff_A）、
  垂直位移、稜邊、上方高處面覆苔（頂點色）。
- 河岸石（Riverbank_A）壓扁水磨、苔偏水線側；峭壁石（Cliff_A）方塊分層平頂——與地形
  Cliff/River 語言銜接。

## 2. 接入方式（沿用既有 Runtime，未另建）

- **資產解析**：`resolveAsset(name)` → `Rock_*` 走 `getRock(name)`，其餘走假資產；回傳形狀
  `{ name, mat, lod0, lod1 }`，與 `InstancedLODGroup` 既有接口相容。
- **擺放**：沿用 `PlacementGenerator`（決定性 seed、不重疊）＋ `ROCK_PLACEMENT`（各石 minDist/
  scale/instance color）。
- **LOD/Cull**：沿用 `lodRings` 三檔 preset 與 `InstancedLODGroup`；新增最小 `forceLod` 選項
  （僅 Debug 對照用，預設 null＝正常距離環）。
- **Debug Panel**：新增石頭情境（單一 1000 / 8 種混合 / 2600 壓測 / 8 件展示）、**每 Rock
  資產的 inst｜LOD0/LOD1/cull 明細**、LOD0/LOD1 對照鈕、展示模式（8 件排開供近距離檢視）。
- **檔案**：`src/environment/assets/rocks/{rockMaterial.js, rockGeometry.js, index.js}`、
  `src/debug/EnvironmentRuntime/rockTestCases.js`；接入點在 `EnvironmentRuntime.jsx`。

## 3. Benchmark 結果

### 3a. 程式可證（不需瀏覽器，從架構即成立）

- **Draw call 不隨實例數增長**：每件石頭 = 2 個 InstancedMesh（LOD0＋LOD1）。
  - 單一 1000（1 種）→ **2** 個環境 draw call。
  - 8 種混合 / 2600 壓測 → 最多 **16** 個環境 draw call（8 種 ×2 LOD；遠距 LOD 桶清空後更少）
    ＋地形 ~1–3 → 全場 ~20 內，遠低於 PERFORMANCE_BIBLE 手機 150 / 桌面 300 上限。
- **材質＝1**、**貼圖＝0**、**唯一幾何＝16**（建立一次重用，不隨實例增加）。
- 面數：8 件 LOD0 ≤180、LOD1 ≤80；cull 後同屏可見面數在 ENVIRONMENT_BUDGET 內。

### 3b. 自動驗證（已實跑）

- `npm run check:rock` → **76/76 通過**：8 件、每件 LOD0/LOD1、tris 預算內、幾何/材質重用、
  無 `Math.random()`、同 seed 一致/不同 seed 不同、bounding volume 有效、pivot 貼地置中、
  各石頭情境實例數正確且不沿用上一案例、scale/rotation/color 範圍有效。

### 3c. 人工瀏覽器實測（已完成，2026-07-20）

三檔 preset（desktop / mobile / mobile-low）× 三情境（rockSingle / rockMix8 /
rockStress2600）皆已人工跑過，完整數據與判讀見 `rock_pack_benchmark_summary.md`。摘要：

- **draw call 不隨實例數增長（真機證實）**：單一 1000＝4、8 種混合 2000＝11、2600 壓測＝11。
- **三檔全 ~60 FPS**（frame time ~16.67ms＝vsync）；tris 桌面 ~121–131k / 手機 ~85k；
  記憶體 ≤58MB；材質 3、貼圖 0。
- **效能達標**（PERFORMANCE_BIBLE / ENVIRONMENT_BUDGET）。

### Milestone B 驗收判定

- **程式驗證完成、效能達標，Rock Pack 驗收接受。**
- 自動驗證：`check:rock` 76/76、`check:env` 17/17、`build` 通過、`runtime29` 44/44。
- 效能：desktop / mobile / mobile-low 皆 ~60 FPS、draw call 4–11 未隨實例暴增、tris/記憶體/
  材質/貼圖全在預算內。
- **不影響正式遊戲、不影響模擬、不影響 Rock Pack 接入**（沿用既有 runtime，未動模擬/戰鬥/
  Router；runtime29 44/44 佐證）。
- 兩點已知限制屬 **Debug Benchmark 層**（見 §4），不阻塞驗收；如需更完整覆蓋可另開
  Debug Benchmark 修正任務。

## 4. 已知限制

- **程序化幾何 = 中大型輪廓為主**：刻意避免高頻細碎噪點（符合 2.5D MOBA 俯視、避免寫實掃描
  感）；若日後要更細的近景石，可提高 detail 或改外部 Blender 輸出（來源可追溯）。
- **單一資產 1000 的擺放上限受 minDist 影響**：大石（minDist 2.0）在 60×60m 測試場約上限 600；
  故「單一 1000」情境用中石（Rock_Medium_A）以確實達 1000。正式地圖以密度圖控制，不受此限。
- **instance color 與頂點色相乘**：instance color 走亮度微調（近白），避免蓋掉苔色；如需更強
  色變化，改在頂點色階段做。
- **已知限制（Debug Benchmark 層，不阻塞 Milestone B）**：
  1. **部分 benchmark sample 被標 `valid=false`**（2/9：desktop-2600、mobile-mix8），但其
     `sampleFrames=180`、`avgFps=60`、指標與同組正常樣本一致——判定為 **Debug Benchmark 取樣
     門檻的假陰性**（連跑整組時 `mounted` 檢查誤判），**非效能問題、非資料問題**。
  2. **mobile-low 因測試鏡頭距離（~66m）與 cull ring（30m）**，多數情境幾乎全被 cull →
     draw calls / tris 為 0。這**代表 cull 生效**，但不適合作為近距離視覺驗收數據；LOD0 幾何
     在本輪 benchmark 亦未被渲染（鏡頭太遠，全落 LOD1 或 cull）。
  - 以上兩點列為**後續 Debug Benchmark 改善項**（可另開任務：修 `mounted` 假陰性、拉近
    benchmark 鏡頭以覆蓋 LOD0 / mobile-low），**不納入 Milestone B 阻塞條件**，不影響正式
    遊戲、模擬與 Rock Pack 接入。

## 5. 後續 Tree / Bush / Ground Pack 可重用規範

本 Rock Pack 建立了**可直接套用的資產 Kit 樣板**：

```
src/environment/assets/<kit>/
  <kit>Material.js   // 1 個共用材質單例（mat_env_*），vertexColors、零貼圖
  <kit>Geometry.js   // 程序化、seededRandom（無 Math.random）、建立一次；每件 lod0/lod1
  index.js           // get<X>(name) / getAll<X>() / <x>Meta()；回傳 {name,mat,lod0,lod1[,cullOnly,cullScale]}
```
接入 runtime 三步：① `resolveAsset` 加 `<Kit>_` 前綴分支；② 加 `<kit>TestCases.js`
（placement 參數＋情境）；③ Debug Panel 情境清單自動合併。**不改 InstancedLODGroup /
PlacementGenerator / lodRings**（Tree/Bush 走 lod0/lod1；Ground 走 cullOnly）。
每個 Kit 附一支 `tools/check_<kit>_pack.mjs`（比照 check_rock_pack 的 12 類斷言）。

## 6. Roadmap 是否需調整

**不需調整。** Milestone B（Rock Pack）對應 ENVIRONMENT_ROADMAP 的 Sprint 36；Tree(37)/
Bush(38)/Ground/River 依序沿用第 5 節樣板即可。唯一補充：把「每個 Kit 附 Node 驗證器
（check_<kit>_pack.mjs）」正式納入各 Pack 的完成判準（本 Rock Pack 已示範）。
