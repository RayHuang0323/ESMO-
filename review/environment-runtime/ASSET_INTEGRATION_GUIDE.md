# 環境資產接入指南（Asset Integration Guide）v1 — Milestone A

> **用途：** 未來正式 Rock / Tree / Bush / Ground 的 GLB 做好後，如何接進本 Milestone 建立
> 的 Environment Runtime（實例化擺放層）。照這份做，就能直接享有 Instancing＋LOD＋Cull，
> 不改 runtime 程式。**本階段用假資產驗證了整條路，正式資產照樣接。**

## 1. GLB 命名規範

```
esmo_<kit>_<piece>_<variant>_<lod>.glb    或   單一 GLB 內含 <...>_lod0 / <...>_lod1 兩個 mesh
```
- `<kit>`：`rock` / `tree` / `bush` / `ground`
- 例：`esmo_rock_boulder_a_lod0`、`esmo_tree_pine_hero_a_lod1`
- 全小寫、ASCII、底線；落在 `assets/<kit>/`（TERRAIN_FOLDER_STRUCTURE）。

## 2. LOD0 / LOD1 命名與規格

- 中/大型資產（石、樹、崖段）：**必須**同時提供 `_lod0` 與 `_lod1`（LOD1 約 40–55% 面）。
- 地被（草/蕨/苔…）：只需 `_lod0`，靠**距離消失**（無 LOD1）——接入時標記 `cullOnly: true`。
- 命名尾碼固定 `_lod0` / `_lod1`，讓載入器自動配對成一組 `asset`。

## 3. 共用材質規則

- 每個資產**只能有 1 個材質**，且必須是 4 個共用材質之一（`mat_env_stone/foliage/ground/water`）。
- 顏色差異走**頂點色（Vertex Color）**；跨變體共用同一材質實例（不要 clone）。
- 載入後，接入層會把資產材質**指到共用材質單例**（避免每 GLB 各自一份材質 → program 爆量）。

## 4. Pivot 要求

- **底部中心、貼地**（最低頂點 Y=0，glTF Y-up）。
- **+Y（Blender）→ glTF 匯出後對應 forward**；實例旋轉以 Yaw（繞上軸）為主。
- Pivot 不正確 → 實例會浮空/入土，QA 直接退（ASSET_QA 第 2、3 項）。

## 5. Bounding Box 要求

- 資產 AABB 尺寸須與其 KIT_DESIGN 標示相符（±10%）。
- 冠幅/半徑記錄於設計文件，供 PLACEMENT_RULES 的最小間距使用。
- 接入層會對整批實例計算 boundingSphere（涵蓋擺放區），確保 frustum culling 正常。

## 6. Instance Color 支援

- 每實例可帶一個顏色（`transform.color = [r,g,b]`），接入層透過 `InstancedMesh.setColorAt`
  套用 → 用來做「同一棵樹的明暗變化 / 石頭色差」，不需要多做變體。
- 材質需 `vertexColors` 或 `instanceColor` 生效（正式材質建立時開啟）。

## 7. Placement Transform 格式（擺放層的輸入）

`PlacementGenerator.generate()` 或未來地形取樣器輸出的每筆：
```js
{
  pos:  [x, y, z],   // 世界座標（公尺）
  rotY: number,      // Yaw 弧度
  scale: number,     // 等比縮放（或未來 [sx,sy,sz]）
  color: [r,g,b]     // 選用，0..1
}
```
- 一整批 transforms 陣列直接餵給 `<InstancedLODGroup asset={...} transforms={...} ring={...} />`。
- 這就是「1000 個實例 → 2 draw call（LOD0+LOD1）」的接口，不需為每實例建 mesh。

## 8. QA 流程（接入前必過）

依 `review/environment-foundation/ASSET_QA.md` 九項：Triangle / Bounding Box / Pivot /
Material(=1) / Texture(=0) / LOD / Draw Call / Preview / Wireframe。每件填實測數字。

## 9. 匯入 review 後如何接 sandbox 測試

1. 把 GLB 放到 `public/debug/<kit>/`（sandbox 測試用；正式匯入才進 `assets/`）。
2. 寫一支載入器把 `_lod0`/`_lod1` mesh 取出、材質指到共用單例、包成 `asset` 物件
   （形狀同 `fakeAssets.js` 的 `{name, mat, lod0, lod1, cullOnly?, cullScale?}`）。
3. 在 `EnvironmentRuntime` 的 `FAKE_ASSETS` 位置改用真資產（或加一個 `realAssets` 開關）。
4. 開 `?debug=environment-runtime`，跑壓測、看 draw call / 面數是否符合 ENVIRONMENT_BUDGET，
   匯出 benchmark JSON 留檔。
5. 通過後才依 TERRAIN_FOLDER_STRUCTURE 搬進正式 `assets/<kit>/`。

> 重點：**runtime 已經寫好了**。正式資產要做的只是「符合上述規格的 GLB」，接入是替換
> `asset` 物件，不是改架構。
