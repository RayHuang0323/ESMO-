# AI 地圖資產審核區（review/）

所有 **AI 產生的新地圖資產一律先放這裡**，經作者確認後才匯入正式專案。
此資料夾內的東西**不屬於正式遊戲**，不被任何遊戲程式引用。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `review/assets/` | 匯出的 `.glb` 模型檔（正式候選） |
| `review/preview/` | 每個模型的 `512x512` 預覽圖 `.png`（快速目視審核用） |

## 產生方式

美術參考：《英雄聯盟》召喚師峽谷（`docs/reference/moba-map/*.png`）。
低模物件由 Blender headless 腳本生成（不動正式專案）：

```
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" `
  --background `
  --python tools\blender_scripts\gen_lowpoly_assets.py `
  -- review\assets review\preview
```

腳本：`tools/blender_scripts/gen_lowpoly_assets.py`
- 程序化生成、固定亂數種子（可重現）
- Principled PBR 材質，每物件 base + accent 兩個材質槽（石＋苔、葉＋冠）
- 每個物件：匯出 `<name>.glb` + 渲染 `768x768` `<name>.png`
- 預覽用 EEVEE：三點打光（暖日光 key／冷光 fill／rim）＋接地平面與真實陰影，透明背景

## 目前資產（2026-07-19，Blender 5.2.0 LTS，MOBA 峽谷風）

| 物件 | GLB | 面數 | 說明 |
|---|---|---|---|
| boulder | `assets/boulder.glb` | 123 | 有稜角分層石板，上緣覆苔（stone + moss 兩材質） |
| pine | `assets/pine.glb` | 120 | 深綠針葉松叢：主樹＋兩棵幼樹，錐體多層破碎輪廓 |
| bush | `assets/bush.glb` | 480 | 圓潤樹叢（brush），深綠葉＋亮綠冠頂 |

## 匯入正式專案的流程（作者確認後才做）

1. 作者看過 `review/preview/*.png` 確認外觀。
2. 確認後才把選定的 `.glb` 複製/搬進正式資產目錄，並接上遊戲程式。
3. 未確認前：**不匯入、不改遊戲程式**。

## Rift 大型物件坑修正（2026-09-30，v16 Objective Pit art fix，等 Owner Review）

這不是新資產，而是**修改已整合的正式 Rift 地圖**，所以候選 GLB 已放在正式路徑（本機 commit、未 push／未 deploy），
舊版保留在 git 歷史，Owner 不同意時可直接還原。

| 項目 | 修正前 | 修正後 |
|---|---|---|
| 正式 GLB | `src/assets/moba/rift-v1/esmo-rift.glb` 13,425,188 bytes／167,612 面 | 13,370,736 bytes／166,622 面 |
| 巨龍坑（Dragon Pit） | 半徑 16.95、牆厚 4.54、紫色光暈、壁高 9.5 | 半徑 15.47、牆厚 5.07、**中性**光暈、壁高 11.5 |
| 巴龍坑（Baron Pit） | 半徑 13.94、牆厚 5.62、金色光暈、壁高 13.5 | 與巨龍坑**完全鏡射**（岩壁頂點 100% 重合） |
| 小地圖貼圖 | `rift-albedo.png` | 只有兩坑 18 單位內 21,687 像素改變 |

預覽（同一套相機）：`preview/rift-pits-before-{dragon,baron}-pit.png`、`preview/rift-pits-after-{dragon,baron}-pit.png`、
`preview/rift-pits-after-overview.png`。巨龍／巴龍身分改由遊戲內的坑位標記（ObjectivePitMarkers）表示。

重建方式（可重現）：`node tools/export_esmo_rift_source.mjs --scope=pits` →
`blender --background --factory-startup --python art/moba-rift/build_rift.py`（說明見 `art/moba-rift/build_rift.py` 檔頭）。
