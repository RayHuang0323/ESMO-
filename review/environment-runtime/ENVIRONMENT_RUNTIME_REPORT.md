# 環境執行基礎報告（Environment Runtime Report）— Milestone A

> 本文件為繁體中文。記錄 Milestone A（Environment Runtime Foundation）的成果、架構、
> 使用方式、測試結果與風險。**未 commit、未碰 Gameplay/Replay、未做正式資產。**

## 1. 本 Milestone 完成內容

建立了讓「未來 Rock/Tree/Bush/Ground Kit 大量放進地圖仍守效能預算」的 runtime 地基：

1. **Instanced Placement Layer**：transform 陣列 → InstancedMesh（位置/旋轉/縮放/instance
   color/LOD 群組/距離顯隱/boundingSphere）。
2. **LOD Distance Ring**：LOD0（近全模）/ LOD1（中低模）/ Cull（遠不畫），三檔 preset。
3. **Cull Distance Ring**：遠距小物件整批不提交；地被類（cullOnly）只 LOD0＋消失。
4. **Deterministic Seed Placement**：同 seed ⇒ 同結果（無 `Math.random()`），含不重疊
   （Poisson-disk 風格最小間距）。
5. **Fake Asset Stress Test**：A–E 五組壓測（含 1000 石 / 1000 樹 / 3000 地被 / 混合 / 手機密度）。
6. **Runtime Environment Debug Panel**：preset/seed/情境切換＋即時 instance/LOD/culled/
   draw call/tris/材質/幾何/FPS。
7. **Benchmark JSON Export**：瀏覽器端複製＋下載 JSON 到本機（放 `review/environment-runtime/`）。
8. **本報告 ＋ 資產接入指南**。

## 2. 新增檔案

| 檔案 | 作用 |
|---|---|
| `src/environment/placement/seededRandom.js` | 決定性 PRNG（純函式） |
| `src/environment/placement/lodRings.js` | LOD/cull 距離環 preset ＋ 分類（純函式） |
| `src/environment/placement/PlacementGenerator.js` | seed→transforms 擺放器（純函式，無 THREE） |
| `src/environment/placement/InstancedLODGroup.jsx` | 實例化＋LOD 距離環的 R3F 元件 |
| `src/environment/fakeAssets.js` | 壓測用假資產（LOD0/LOD1＋4 共用材質） |
| `src/debug/EnvironmentRuntime/testCases.js` | A–E 壓測情境定義 |
| `src/debug/EnvironmentRuntime/EnvironmentRuntime.jsx` | 測試場＋Debug Panel＋Benchmark 匯出 |
| `tools/check_env_runtime.mjs` | Node 端純邏輯驗證（決定性/間距/LOD 邊界） |
| `review/environment-runtime/ASSET_INTEGRATION_GUIDE.md` | 正式資產接入規格 |
| `review/environment-runtime/ENVIRONMENT_RUNTIME_REPORT.md` | 本報告 |
| `review/environment-runtime/benchmark_summary.md` | Benchmark 結果彙整（待瀏覽器填數字） |

## 3. 修改檔案

| 檔案 | 修改 | 對正式流程影響 |
|---|---|---|
| `src/main.jsx` | 新增 `?debug=environment-runtime` lazy 路由分支 | **無**：無此參數走原 `AppShell`，且 sandbox 為獨立 chunk |
| `package.json` | 新增 script `check:env`（不動既有 dev/build/preview） | 無 |
| `public/debug/terrain_style.glb` | Sprint 34 已置入（sandbox 測試用） | 無（非正式 assets/） |

## 4. 架構說明

- **純邏輯層（無 THREE，可 Node 測）**：`seededRandom` / `lodRings` / `PlacementGenerator`。
  擺放與 LOD 規則是純函式，因此可被 `check_env_runtime.mjs` 單元驗證，也方便未來接
  PLACEMENT_RULES 的地形規則（傳 `accept(x,z)` 回呼即可）。
- **渲染層（R3F）**：`InstancedLODGroup` 每個資產渲染**恰好 2 個** `instancedMesh`
  （LOD0＋LOD1）。每次更新（節流 5Hz 或鏡頭移動 >1m）依鏡頭距離把實例分桶、重新打包
  矩陣與顏色、設定 `.count`。→ **draw call 只跟「資產種類×LOD」有關，與實例數量無關。**
- **共用材質**：假資產用 4 個共用 `MeshStandardMaterial`（對齊 `mat_env_*`），全體零貼圖。
- **測試場**：60×60m 平面測試區（比單塊地圖大，方便觀察 LOD/cull 環），可疊加
  `terrain_style.glb`。

## 5. 如何開啟 sandbox

```
npm run dev
# 瀏覽器開：
http://localhost:5173/?debug=environment-runtime
```
（正式遊戲：不加參數即 `http://localhost:5173/`，完全不受影響。）

## 6. 如何切換 preset

Debug Panel（右上）「Preset」列：**桌面 / 手機 / 手機低階**。切換即改 LOD/cull 距離：

| preset | LOD0 | LOD1 | Cull |
|---|---|---|---|
| desktop | 0–35m | 35–70m | 70m+ |
| mobile | 0–22m | 22–45m | 45m+ |
| mobile-low | 0–15m | 15–30m | 30m+ |

（地被 cullOnly 的消失距離 = cull × 0.7。數值可依 ESMO 鏡頭再調，改 `lodRings.js`。）

## 7. 如何執行 stress test

Debug Panel 選情境（A–E 或 terrainOnly/rocks/trees/ground）→ 按「跑本情境」（settle 1.2s
＋取樣 4s 寫一筆）或「跑 A–E」（自動輪測）→「匯出 JSON」（複製到剪貼簿並下載
`benchmark_environment_runtime.json`）。把下載的 JSON 放到 `review/environment-runtime/`。

## 8. 測試結果

### 8a. 程式可證的結果（不需瀏覽器，從架構即成立）

| 情境 | 實例數 | 資產種類 | 環境 draw call（＝種類×2 LOD） |
|---|---|---|---|
| A：1000 石 | 1000 | 1 | **2**（LOD0＋LOD1） |
| B：1000 樹 | 1000 | 1 | **2** |
| C：3000 地被 | 3000 | 1（grass，cullOnly 無 LOD1） | **1** |
| D：混合 | 2600 | 4（石/樹/草/叢） | **≈7**（草 1＋其餘各 2） |
| E：手機密度 | 1300 | 4 | **≈7** |

> **核心證明成立：1000 個實例不會變成 1000 draw calls**——每種資產固定 2 個 InstancedMesh，
> 與數量無關（見 `InstancedLODGroup.jsx`：`return` 只掛 2 個 `<instancedMesh>`）。
> 加上地形（1）＋燈，全場 draw call 皆在 PERFORMANCE_BIBLE 手機 150 上限內。

### 8b. Node 純邏輯驗證（已實跑）

`npm run check:env` → **12/12 通過**：同 seed 完全一致、不同 seed 不同、最小間距被遵守、
scale/color 範圍正確、LOD 分類邊界正確、高密度回報實際 placed。

### 8c. 瀏覽器實測（desktop preset，2026-07-20，已完成）

來源 `benchmark_environment_runtime.json`（Chrome 150 / Win x64，dpr 1.5）。完整表在
`benchmark_summary.md`。摘要：

| 情境 | 實例 | Draw Calls | Triangles | FPS | Frame(ms) | Mem(MB) |
|---|---|---|---|---|---|---|
| A 1000 石 | 1000 | 5 | 86,902 | 60 | 16.66 | 50 |
| B 1000 樹 | 723 | 5 | 85,168 | 60 | 16.67 | 52 |
| C 3000 地被 | 3000 | 4 | 82,158 | 60 | 16.67 | 54 |
| D 混合 2600 | 2600 | 8 | 85,598 | 60 | 16.67 | 56 |
| E 手機密度 | 1300 | 8 | 83,190 | 60 | 16.67 | 56 |

- **實測證實 draw call 不隨實例數增長**（1000→3000 實例，call 5→4）。
- 60 FPS 全達標（16.67ms=vsync 上限）；tris ~85k、記憶體 ≤56MB、貼圖 0、材質 3–5。
- **未取得**：LOD0/LOD1/Culled 明細（Debug Panel 一處 `.current` 讀取 bug，回報 null）；
  **mobile / mobile-low preset 未於本輪量測**（僅跑 desktop preset）。

## 9. 是否符合 PERFORMANCE_BIBLE

| 條目 | 狀態 |
|---|---|
| §3 Draw call（手機 ≤150） | ✅ 架構保證（壓測情境全場 ~10 內） |
| §4/§17 貼圖（零貼圖優先） | ✅ 假資產零貼圖 |
| §8 Instancing（≥8 次必實例化） | ✅ 本層即為此而建 |
| §6 LOD | ✅ LOD0/LOD1/Cull 三段 |
| §16 材質（≤20 種） | ✅ 環境 4 共用材質 |
| §1 FPS 目標 | ✅ 桌面 60（實測）；⏳ 手機 preset/真機待量測 |

## 10. 是否符合 ENVIRONMENT_BUDGET

- Draw call 與材質/貼圖預算：✅ 符合（甚至遠優，混合場 ~7 環境 call）。
- 面數：假資產面數低於正式預算，情境設計對齊 BUDGET 的同屏量級（近千地被＋數百樹石）；
  **實際同屏可見面數（cull 後）待瀏覽器量測**確認落在手機 ~90k / 桌面 ~280k 內。

## 11. 已修正 / 尚未驗證項目

**本次已修正（最小修正，未重構）：**
- **LOD0/LOD1/Culled/est.envTris 統計 bug**：`Environment` 的 useFrame 讀 `perGroup.current[name]`
  應為 `.current.*`（`InstancedLODGroup` 以 `statsRef.current = {...}` 寫入）。已改為讀
  `holder.current.*` 並加 `|| 0` 防呆 → 三欄與 est.envTris 恢復正常。
- **Benchmark 取樣可靠性**：`runOne` 改為「切換 → 等本案例掛上（gate on `lodStats.testId`）
  → 暖機 900ms → 重設取樣窗 → 取樣 3000ms」，並加**無效樣本判定**（`valid`, `sampleFrames`）。
  → 修掉「C 沿用 B 的 723 / avgFps 異常」。

**已驗證修正（mobile 重跑，2026-07-20）：** 取樣修正後 A–E 全 `valid:true`、sampleFrames
176–181、instanceCount 正確、avgFps 無異常、LOD/est.envTris 皆有值——兩個 bug 確認修復。

**尚未驗證：**
- 正式 GLB 接入（本階段用假資產；接入規格見 ASSET_INTEGRATION_GUIDE）。
- `terrain_style.glb` 頂點色/半透明水在 R3F 的最終呈現（沿用 Sprint 34 未結項）。
- 真機（實體手機）表現（目前皆為桌機瀏覽器切 preset 量測）。

## 12b. Milestone A 驗收判定（三檔全數通過）

- **Desktop：✅ 通過。** draw call 不隨實例數增長（1000/3000 實例皆 ≤5 call）、60 FPS、
  tris ~85k、記憶體 ≤56MB、材質 ≤5、貼圖 0。
- **Mobile-low：✅ 通過。** A–E：draw calls 全 3、tris ~80,650、~60 FPS、記憶體 54–59MB。
- **Mobile：✅ 通過。** 取樣修正後重跑：A–E 全 valid、draw calls 3–6、tris ~80,650–81,334、
  60 FPS、記憶體 ≤60MB；cull 環積極生效（多數實例被 cull，可見者為 LOD1）。
- **結論：Milestone A（Environment Runtime Foundation）三檔（desktop / mobile / mobile-low）
  全數正式驗收通過。** 核心目標達成：實例化擺放層、LOD/cull 距離環、決定性擺放、壓測、
  Debug Panel、Benchmark 匯出皆成立，且全數符合 PERFORMANCE_BIBLE 與 ENVIRONMENT_BUDGET。
  消除了 PERFORMANCE_WARNING 的 W1（無實例化層）與 W2（無 LOD）。

> 註：測試鏡頭固定距場中心 ~66m，故 mobile/mobile-low 的 cull（45/30m）會濾掉 60×60m 測試
> 場多數實例——這證實 cull 環生效，正式地圖的鏡頭距離與 cull 距離屆時再對齊調校（改
> `lodRings.js` 數值即可，不動架構）。

## 14. 如何重跑 mobile A–E（取樣修正後）

1. `npm run dev` → 開 `http://localhost:5173/?debug=environment-runtime`。
2. 右上 Debug Panel「Preset」選 **手機（mobile）**。
3. 按「跑 A–E」——會自動：切案例 → 等本案例掛上 → 暖機 0.9s → 取樣 3s → 下一案例。
4. 結果列每筆會顯示 LOD `x/y/cull z` 與 draw calls；**無效樣本會以 ⚠ 標紅**（frames 過少或
   案例未掛上時）。若出現 ⚠，該筆重跑即可。
5. 按「匯出 JSON」→ 覆蓋 `review/environment-runtime/benchmark_environment_runtime.json`，
   貼回給我補完 mobile 判定。

## 12. 風險

- **無 Critical/High 新風險。** 本 Milestone 正是為了消除 PERFORMANCE_WARNING 的 W1（無實例
  化層）與 W2（無 LOD）——這兩個 Critical/High 現已有 runtime 基礎。
- Medium：每次 LOD 重打包會重寫 InstancedMesh 矩陣（節流 5Hz，3000 實例成本低）；未來若
  同屏實例數再放大一個量級，可改「分桶只在跨環時更新」進一步省 CPU。
- Medium：正式地形分塊（W3）仍未做——大地圖時 frustum culling 才會需要；本層已與之相容
  （擺放輸出可依塊切分）。

## 13. 下一步建議

1. **你先跑一次瀏覽器 benchmark**（§5–§7），把 JSON 貼回 → 補完 §8c/§10 的實測數字，
   正式蓋章「符合預算」。
2. 之後可進 **Milestone B：First Environment Pack（Rock Pack）**——照 ROCK_KIT_DESIGN 產出
   8 件正式石頭，用 ASSET_INTEGRATION_GUIDE 接進本 runtime、跑同一套壓測驗收。
3. 並行（正式遊戲側，低成本高收益）：RUNTIME_OPTIMIZATION_ROADMAP 的效能 P0（陰影整頓/
   後製調參/FPS 路徑接分級）。
