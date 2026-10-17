# B7 完整截圖獨立視覺審核（2026-10-05）

本輪針對來源模型／真手／比例版本，來源 fingerprint `00f244574ef9d493f264a4146f3b3a81ae6de340a0c455a5cd3abc9068ff1f68`。不是後續材質池／袖口／戰場外選手面板版本的驗收。

依 `threejs-aaa-graphics-builder/references/visual-scorecard.md` 的 Fresh-Eyes Review，唯讀代理只收到完整截圖、pixel-metrics.json與評分文件／校準圖，未收到產品原始碼、git、handoff或先前評分。代理逐張看完75張及3張校準圖，未修改檔案或啟動browser／build。

## 證據完整性

以下均在 `review/cs-major-upgrade/evidence/`，未挑選最佳鏡位：

| 集合 | PNG | 像素MEASURED／NOT_MEASURED |
|---|---:|---:|
| phase-b7-pov-reload-authority-desktop-20261005/1366 | 7 | 7／0 |
| phase-b7-pov-reload-authority-mobile-20261005/390 | 12 | 7／5 |
| phase-b7-source-models-long-desktop-20261005/1366 | 27 | 12／15 |
| phase-b7-source-models-long-mobile-20261005/390 | 27 | 12／15 |
| phase-b7-source-models-clean-reference-20261005/1366 | 2 | 2／0 |

共桌機36／窄版39張；三圖四鏡位及五族圖庫，Mirage另有蹲姿／第三人稱與POV換彈。35張武器圖庫缺當時canvas rect，全部列NOT_MEASURED，但全數視覺檢視。圖庫多為購買／回合開始，不能冒稱全是交火；320／360／430、影片、真手機尚無此輪證據。

## 評分與取較低分

Owner agent初評為部分重點圖的暫評，未冒稱完整75張自評；獨立代理看完整集合。下表採較低值，不以實作量或純檢查推翻圖片判斷。

| 類別 | Owner暫評 | 獨立評分／採用 | 主要可見證據 |
|---|---:|---:|---|
| Art direction | 2 | 2 | 三圖active有石材水務／港區／工業主題，但成熟度不一致 |
| Hero/player | 2 | 1 | 桌機handling-crouch／pov：軀幹、袖管、背包簡化 |
| Obstacles/enemies | 2 | 1 | dust2-rifle／mirage-pistol圖庫：隊員身形重複 |
| Rewards/interactables | 1 | 1 | dust2-detail／窄版active有C4，缺完整拾取前後證據 |
| World/environment | 2 | 1 | inferno-overview／mirage-overview：方形院落、重複建築和平地 |
| Materials/textures | 2 | 2 | 石材、地面、金屬有角色分工，手套／袖管偏純色 |
| Lighting/render | 2 | 2 | 方向陰影／天空可讀，手套暗且平 |
| VFX/motion | 2 | 1 | 靜態換彈不足以證明機械動作、節奏和衝擊感 |
| UI/HUD | 1 | 1 | 窄版人物卡遮雙手／槍，訊息競爭戰場視線 |
| Performance evidence | 2 | 2 | 有桌機GPU counts／分位數／雙尺寸，但calls超advisory，非真手機 |
| 平均 | 1.8 | **1.4** | **未達Premium／AAA／Showcase** |

Automatic failures：主世界大量重複長方建築與平地、隊員輪廓重複、UI覆蓋第一人稱視線。沒有看見以濃霧／黑暗掩藏全場的明確證據。真input可玩性與動態safe area無法由限定圖片確認，不把未測當失敗或通過。

## 量測限制與後續修正

- 自製fallback像素法，不是官方inspector／Sobel。已量測entropy約3.262–4.296、contrast70–158，沒有嚴重純色／明暗壓縮；多張edgeDensity低於.04支持稀疏構圖，地面紋理會增加edge，不能證明模型精細。
- 桌機calls444–480（advisory300），窄版450–472（advisory150）；triangles207712–235532。全為同一AMD Radeon桌機GPU，390只代表窄版。長樣本Mirage最大150ms；乾淨同artifact桌機59.301FPS／p99 17.2／max133.3ms，不能隱藏尖峰。
- 武器優先：先移出遮槍卡片；補袖口／皺摺／布料；提高拇指、指節與握把接觸可讀性；改善長槍近側大平面與機匣層次；換彈需清楚操作手／彈匣階段及影片證據。靜態圖不能直接斷言穿模或沒有動畫。
- 已據此開始後續呈現追修：major POV卡片移至戰場外、44px控制與詳情收合；袖口／皺摺／布料微表面；支援手依每次保存進度更新並在結束復位。另實測發現五族材質每actor複製19個，改為有引用計數的共用池，末一釋放，不改來源材質。
- 後續版本需重新build／browser／看圖，不沿用本輪1.4作為新版本已驗收，也不因上述修改宣稱視覺問題已全部解決。全案B→C→D→E仍在同一授權任務內，不push／deploy，最終Owner Review。
