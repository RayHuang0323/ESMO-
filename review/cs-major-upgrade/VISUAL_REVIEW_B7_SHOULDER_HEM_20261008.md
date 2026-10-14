# B7 肩帽／袖口第二輪：未放行

Fresh-Eyes reviewer `b7_shoulder_hem_fresh` 實際 original 查看完整D28＋M28＝56PNG及3/3 anchors，只讀圖、metrics／pixel-metrics／gallery metadata與量表。沒有before，不推論改善。來源4d4a294fbced1d76cb37b9b8a052066382010e0aa7f4e13eba0c51cffa60ccc7／59檔，bundle4ff70608c3e23206ac28fc45e463f935060577772525aec507c50ea3be30ea58。

資料：`evidence/phase-b7-shoulder-hem-desktop-uniform-20261008/1366` 與 `phase-b7-shoulder-hem-mobile-20261008/390`，各37/37、native0，各28/28pixels MEASURED／ERROR0。原桌機36/37 PRODUCT_FAIL／native1完整保留：browser全材質.0016斷言過時，GPU上衣實際.0032正確。工具改為四角色精確strength／tone .0016,.0016,.0032,.0016及.04,.04,.08,.04，沒有放寬成本／來源／借用／骨架守門。重用同精確build重驗，不覆寫紅燈。

表內D／M；各身份完整四角度合併。遮擋區不補分，硬護具、背袋、POV袖不借分。

| 身份 | 肩 | 肘 | 前臂 | 袖口 | 衣料 | 袖輪廓 |
|---|---|---|---|---|---|---|
| ct1 assault | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 1／1 |
| ct2 support | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 2／2 |
| ct3 marksman | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 1／1 |
| t1 assault | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 1／1 |
| t2 support | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 2／2 |
| t3 marksman | 1／1 | 1／1 | 2／2 | 1／1 | 1／1 | 1／1 |

D／M各44/108、1.22/3，這是袖專項不是E十類整體分數。獨立較低分採用；上一輪評分保留，不把不同reviewer的分差當受控退化證據。

- ct1／t1 front有前臂縫线；rear-left肩背寬起伏仍無裁片邊界，護具遮肘並主導輪廓。
- ct2／t2 front前臂與局部折面可讀；rear-left連續袖身有完整曲線，但肩仍平滑隆起、肘缺內壓外拉摺痕。袖口未看清布邊厚度／縫製。
- ct3／t3 front前臂縫線可讀；腕部灰／棕環帶讀成護具，非布製包邊證據；rear-left/right肘及腕多被裝備／手套／槍遮擋。
- 肩起伏規律且寬大，衣料仍大面色塊與寬摺，缺清楚接縫、局部拉力、穩定織物與縫製厚度。active／overview尺度不能判袖細節，detail只能確認整體衣服／動作。

| 診斷 | D1366 | M390 |
|---|---:|---:|
| 短窗FPS | 41.77 | 49.83 |
| p95／p99 ms | 33.5／33.6 | 33.4／33.5 |
| calls p95 | 444 | 450 |
| triangles p95 | 214496 | 210098 |
| geometries／textures | 348／38 | 348／38 |
| texture estimate MB | 74.39 | 70.39 |
| entropy範圍 | 3.063–4.182 | 3.250–4.642 |
| edge density範圍 | .0263–.1025 | .0239–.0491 |
| contrast範圍 | 69–178 | 71–209 |

calls超過自製advisory target300／150，不代表正式效能放行；pixels包含背景不能證明袖品質。390為桌機AMD GPU，不是真手機。gallery是原生paused，不能證明動態變形品質。

另同精確新build60秒 `phase-b7-shoulder-hem-perf60-desktop-20261008` 6/6／native0，36.1FPS／p9533.7／calls455／tri237860；緊接封存fdaa控制 `phase-b7-shoulder-control-fdaa-perf60-desktop-20261008` 同條件6/6／native0，33.9FPS／p9546.6／calls455／tri237870。新舊都未恢復舊約60FPS，不能把這組短順序樣本推為source優化或環境根因已證明。完整logs／exit／隔離／metrics保存。

下一輪聚焦肩袖接縫、沿真袖座標的肘壓褶及布袖口包邊，不再只放大body-y波紋。B7未放行，C／D／E仍未實作；最終十類≥2／平均≥2.3門檻不變。不動MOBA、不commit／push／deploy。真手機FPS、觸控、safe area及音訊未實測。
