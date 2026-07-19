# 自我檢查報告（Self-Check）— Sprint 30B：Terrain Material Pass

> 交付前依 ESMO 美術規範（Visual Bible）與本 Sprint 規範逐項自我檢查。以下如實回報，
> 包含「未做」與「尚未驗證」的項目。

## 一、Sprint 規範逐條檢查

| # | 規範要求 | 結果 | 說明 |
|---|---|---|---|
| 1 | 保留 Terrain Sculpt，不改地形形狀／高度／河道／岩壁 | ✅ | 直接開啟 `terrain_sculpt.blend` 加材質，**幾何零改動**（未動任何頂點） |
| 2 | 不建立任何 Rock／Tree／Bush／Cliff 資產包 | ✅ | 完全未建立 |
| 3 | 不加建築／橋梁／裝飾／特效／遊戲物件 | ✅ | 皆無 |
| 4 | 僅建立地表材質：草地／泥土道路／岩石／河床／河水 | ✅ | 五種皆建立 |
| 5 | 配色完全遵守 Visual Bible，不複製 LoL 官方材質 | ✅ | 取自 Visual Bible §3 色表，純學設計語言、原創 |
| 6 | 重點：可讀性／大色塊／遠距辨識／stylized／painterly／非寫實／非貼圖／非素材感 | ✅ | 平塗大色塊、無貼圖、無寫實反光 |
| 7 | 不追求細節，建立可長期沿用的 Ground Material Language | ✅ | 用高度＋坡度規則自動判定，未來地圖可沿用 |
| 8 | 只輸出到 `review/terrain-prototype/`，不匯入正式專案 | ✅ | 僅輸出到該資料夾 |

## 二、Visual Bible 檢查清單（§19）對應

- ✅ **配色（On-palette）**：草地／泥土／岩石／河床＝Grass Field／Path Dirt／Stone Warm／
  Stone Cool；河水為介於淺水與深水之間的青綠，皆屬 §3 色系，無自創跳色。
- ✅ **可讀性（Readability）**：明度層次成立（草地亮 → 泥岸中間 → 岩石灰 → 河床／水下凹暗），
  功能用顏色即可分辨。
- ✅ **材質規則（Material）**：Principled、介電（非金屬）、高粗糙、平塗、無貼圖／法線貼圖。
- ✅ **光影（Lighting）**：預覽採 Visual Bible §15 的單一暖色主光＋冷色補光。
- ✅ **語言（Language）**：本文件與審查文件皆繁體中文，術語附（English）。
- ⚠️ **面數／效能**：本階段未改幾何（仍約 13,440 三角面）；材質為共用平塗、無貼圖，對效能友善。

## 三、已知限制（如實回報）

- **交界鋸齒**：材質是逐面（每個三角面）判定，鋪在 0.25 公尺的地形網格上，色塊交界會有階梯狀
  鋸齒。已加隨機擾動緩和，但仍非平滑筆刷邊。屬第一版可接受範圍，未來可用更細的漸層或
  頂點混色改善。
- **俯視盆地水色**：河水半透明，正上方看深水區會透出較暗河床。已把水調得較不透明以改善，
  但仍保留一點透明作為深度感。
- **岩石佔比小（約 4%）**：岩壁是地圖邊緣窄帶，面積本就小；已放寬坡度門檻讓整片岩壁面
  讀成岩石，45° 視角可見岩壁為灰岩、頂為草地。

## 四、尚未驗證 / 尚未進行

- **未在 Three.js / R3F 或任何 glTF 檢視器實際載入 `terrain_material.glb` 驗證**
  （Blender 匯出成功 ≠ 引擎內驗證，特別是半透明水面在不同引擎的呈現可能不同）。
- **未匯入正式專案、未修改任何遊戲程式。**
- **未開始下一個 Sprint、未建立任何 Asset Pack。**
- 本次檔案與腳本（`tools/blender_scripts/gen_terrain_material.py`）**尚未 git commit**。

## 五、交付物清單（`review/terrain-prototype/`）

| 檔案 | 內容 |
|---|---|
| `terrain_material.blend` | Blender 檔（含五種材質與半透明水面） |
| `terrain_material.glb` | 匯出模型（地形＋水面） |
| `preview_top.png` / `preview_45.png` / `preview_player.png` | 三視角預覽（已覆蓋為材質版） |
| `TERRAIN_MATERIAL_REVIEW.md` | 地表材質審查（繁體中文） |
| `SELF_CHECK_30B.md` | 本自我檢查報告 |

> `terrain_sculpt.*` 與 `terrain_blockout.*` 保留作為前兩階段對照。

**結論：Sprint 30B 目標達成——建立 ESMO 第一版地表材質語言，符合全部規範。等待您確認。**
