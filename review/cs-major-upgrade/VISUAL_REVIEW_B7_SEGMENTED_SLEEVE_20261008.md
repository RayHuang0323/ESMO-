# B7 分段袖型 Fresh-Eyes：尚未放行

`segmented_sleeve_fresh_review` 僅收到完整 inventory、截圖、scorecard 與兩尺寸 metrics／pixel-metrics；逐張使用 original 實際看完 **32/32 PNG、3/3 anchors**。未讀產品 source、checkpoint 或歷史 review，未修改檔案、未跑 browser。沒有 before，不推論改善幅度。

來源 `c2a744dcf506122591e67ce4070e528c2bf093f291516ea28d3cc49b183e8f4a`（59 檔），bundle `91a6bd28340d4697c3073f7b078e5d5fc6177e20c1b87d3afc61559ed4ed3921`。完整清單：`evidence/b7-segmented-sleeve-complete-inventory-20261008.json`；桌機 `phase-b7-segmented-sleeve-desktop-resume-20261008/1366`，窄版 `phase-b7-segmented-sleeve-mobile-resume-20261008/390`。

各格依序為 **袖輪廓／衣料細節／肩裁片／肘裁片／前臂裁片／袖口**；`0*` 為遮擋而缺可讀證據，不代表模型一定缺失。

| 身份 | D 正 | D 背 | M 正 | M 背 |
|---|---|---|---|---|
| CT1 assault | 2／1／1／1／2／1 | 1／1／1／1／0*／0* | 2／1／1／1／2／1 | 1／1／1／1／0*／0* |
| CT2 support | 2／1／1／1／2／1 | 1／1／1／0*／0*／0* | 2／1／1／1／2／1 | 1／1／1／0*／0*／0* |
| CT3 marksman | 2／1／1／1／2／1 | 1／1／1／0*／0*／0* | 2／1／1／1／2／1 | 1／1／1／0*／0*／0* |
| T1 assault | 2／2／1／1／2／1 | 1／1／1／1／0*／0* | 2／2／1／1／2／1 | 1／1／1／1／0*／0* |
| T2 support | 2／2／1／1／2／1 | 1／1／1／0*／0*／0* | 2／2／1／1／2／1 | 1／1／1／0*／0*／0* |
| T3 marksman | 2／2／1／1／2／1 | 1／1／1／0*／0*／0* | 2／2／1／1／2／1 | 1／1／1／0*／0*／0* |

正面前臂縫線、收束輪廓與 T 的斜折面可讀；肩仍是寬而平滑的鼓包，上臂至肘缺少能追蹤的裁片關係。CT 的深藍布料細節不充分。灰／棕環圈和硬盒附件不能當作肘裁片。全部身份的第三人稱袖口沒有獨立收邊，與黑色手部重疊。背面主要細節在背甲／袋件，不能挪作袖分；前臂與腕部位於身前，多數不可讀，需補正常遊戲三分之四背角度再判斷構造。

其餘 8 張也逐張已看：active／overview 人物太小；detail 的持槍或背面角色仍不足以讀完四段袖構造；pov 的近處第一人稱袖未挪作第三人稱證據。桌機 pov 的 C4 亮環／標示遮住遠端人物身體，留作後續整體可讀性風險。

| 量測 | D1366 | M390 |
|---|---:|---:|
| 短窗 FPS | 37.617 | 59.743 |
| p95／p99 ms | 33.7／50.1 | 16.8／17.2 |
| calls p95 | 444 | 450 |
| triangles p95 | 214470 | 210630 |
| geometries／textures | 348／38 | 348／38 |
| texture 估計 MB | 74.39 | 70.39 |
| JS heap 快照 MB | 113.05 | 170.98 |
| entropy 範圍 | 3.061–4.118 | 3.283–4.140 |
| edgeDensity 範圍 | .02645–.09306 | .02430–.04210 |
| luminance contrast 範圍 | 69–177 | 71–182 |
| dominantColorShare 範圍 | .178–.441 | .156–.399 |

雙尺寸技術各 25/25、native0，像素各 16/16 MEASURED、NOT_MEASURED0／ERROR0；完整 log／exit／isolation 保存，不覆寫原 HARNESS_FAIL。像素是自製 fallback 且分析含場景，不能證明袖品質。calls 超 desktop300／mobile150 advisory。390 仍是 AMD 桌機 GPU，非手機真機。

Owner 實際檢視桌機 CT2 正背、T2 正背，同意肩與袖口尚不足、背袋波紋不能補袖分；採獨立較低分，B7 不放行。下一步只修肩／肘／袖口可讀構造並補背側可見角度，保留全 capture set；不得為遮擋判定模型不存在，也不得拿技術 PASS 代替視覺。整體 E 十類 ≥2、平均 ≥2.3 門檻不變。
