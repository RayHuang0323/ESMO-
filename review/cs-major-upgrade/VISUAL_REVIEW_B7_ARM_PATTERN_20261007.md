# B7 真骨袖裁片：完整32圖獨立審查

審查者 `arm_pattern_fresh_review`，逐張original看32/32 PNG及3/3 anchors，只讀完整inventory、兩組metrics與pixel-metrics、原量表。未讀source、歷史評分或checkpoint。無before，不推論改善幅度。

來源 `evidence/b7-arm-pattern-complete-inventory-20261007.json`；source `2236b8549ddcccda470ef1f9bf4d72a7ad9876cbbbeaf840fac094cadda4b5f4`，bundle `78c80ce353376fc6db9b823f298ed54e5d3df044e657efed372b6d390c87f106`。集合D16／M16為`phase-b7-arm-pattern-{desktop,mobile}-recovered-20261007`。後續perf60圖不在本批集合；本報告不是最終全任務複審。

| 原十類 | 分數 | 可見依據／缺口 |
|---|---:|---|
| Art direction | 2 | 砂岩、水務、青綠金屬及兩隊配色一致，個性細節不足。 |
| Hero/player | 1 | 護具、衣縫、持槍可見，但肩臂圓滑管狀、袋甲硬塊、臉靴簡化。 |
| Obstacles/enemies | 1 | 背包三差異可見，主體／頭形／姿勢相似，遠景難辨职能。 |
| Rewards/interactables | 1 | A/B與C4資訊可讀，本集缺兩種authored互動形態及狀態。 |
| World/environment | 2 | 屋頂、拱架、管線、水槽與高低路面，外圍疏、石牆重複。 |
| Materials/textures | 2 | 石木金屬衣料可分、衣縫可見；窗板及衣甲大面積仍平滑。 |
| Lighting/render | 2 | 日照、陰影與深度可讀，CT暗面弱、桌機POV亮白槍火偏大。 |
| VFX/motion | 1 | 有槍火／曳光／環形提示；靜圖與此組null動態欄位不足證明完整時序。 |
| UI/HUD | 2 | 窄版比分時間／血條／觀戰具類型感；控制需下捲，桌機本集未露出比分。 |
| Performance evidence | 2 | production及renderer／frame time齊；同桌機GPU、10秒短窗、calls超advisory。 |

總分16/30、平均1.6；不是Premium。owner接受第三人稱袖仍未過門檻，不以Node／shader證據推翻可見品質。

## 袖專項：1/3，B未放行

- CT `ct2-support-front` 最清楚：縱向縫線與肘附近弧形接縫；ct3亦可見，但淺色環帶比布料結構醒目。肩峰至上臂平滑圓鼓，彎臂受力不清。
- CT三種背面：背甲／背包辨識，肩背寬緩明暗；袖裁片與肘壓縮褶仍不足，背包波紋不是袖褶。
- T `t2-support-front`局部接近2：前臂縫線與肘部弧形明暗。t1／t3亦有縱線，但粗袖口帶及硬塊主導，上臂裁片轉折弱。
- T三種背面：連續平滑綠肩，露出的袖結構仍弱。腰袋波紋不能代替袖證據。
- active／detail正常觀戰尺寸，gallery細線多數消失；不可用放大正面單圖宣稱兩隊正背全部達2。

下一次應優先修肩到肘的裁片轉折、肘內外不同張力與背面可讀性，保留六身份正背兩尺寸完整集合，不只再加細線。

## 量測

32/32像素MEASURED，error／notMeasured0，自製fallback不是官方inspector。D／M callsP95=444／450，超advisory300／150；triP95=214498／210760，geometry348、texture38、material985。短窗FPS57.70／60.05，p95=16.9／16.8ms，page／console error均空；兩者都是同AMD桌機GPU，非真手機。

| 尺寸／state | entropy | edgeDensity | contrast | dominant |
|---|---:|---:|---:|---:|
| D active | 3.723 | .0295 | 89 | .195 |
| D detail | 3.510 | .0617 | 74 | .249 |
| D overview | 3.243 | .0263 | 69 | .410 |
| D POV | 4.106 | .0625 | 134 | .208 |
| M active | 3.702 | .0328 | 91 | .195 |
| M detail | 3.464 | .0414 | 72 | .204 |
| M overview | 3.374 | .0288 | 71 | .296 |
| M POV | 4.061 | .0342 | 131 | .156 |

active／overview edge<.04與屋頂／空地及遠景人物細節少一致。性能長窗在本審查後另量測，不能用本表短窗反駁後續下降。C／D／E尚未放行，真手機未測。
