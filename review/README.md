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
