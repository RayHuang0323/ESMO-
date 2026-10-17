# B7 握把pivot版本完整獨立目視審核（未放行）

- 來源指紋：`e6522607124340700863c83247d83c6b365c38c3e0bb7887a9eb6c16a352753f`，53檔；不適用後續側向包握／拉皺候選。
- 獨立reviewer `/root/b7_grip_pivot_fresh_review` 只讀全部capture圖片、量測與scorecard／三張校準圖，未讀產品程式、git、handoff、舊分數，未寫檔／browser／build／test。實際觀看50/50 PNG與三張校準圖，沒有挑圖。
- 完整集合：`phase-b7-grip-pivot-desktop-mirage-20261005/1366` 14張、`phase-b7-grip-pivot-mobile-mirage-20261005/390` 14張、`phase-b7-grip-pivot-desktop-othermaps-coverage-20261005/1366` 18張、`phase-b7-grip-pivot-desktop-othermaps-20261005/1366` 4張中斷capture。目錄皆在evidence根下；前46張全MEASURED／0error，中斷4張無metrics，只目視，不套別組量測。

| 類別 | 獨立分數 | 具體可見證據及限制 |
|---|---:|---|
| Art direction | 2 | 三圖active／POV的砂石水務、金屬貨港、窯塔／管線有不同建築與材質，人物和袖仍偏基本。 |
| Hero/player | 1 | Mirage handling-crouch／reload可辨衣裝、頭盔、背包與姿態，但大面平滑；第一人稱手臂與抓握不足。 |
| Obstacles/enemies | 1 | 三圖active有功能遮蔽物，gallery人物主要兩套配色、相近人形／背包，未見三種明確形體／telegraph差異。 |
| Rewards/interactables | 1 | 有A/B與C4攜帶者提示，缺兩種完整互動本體及idle/collect狀態證據。 |
| World/environment | 2 | 拱梁／屋面／塔／桶與室內外前中後景接近scene-2；overview外圍平面、重複小屋及Inferno sniper大牆取景不足3。 |
| Materials/textures | 2 | 砌石／碎石／波紋金屬與槍的銀色金屬／木色分工；手套／袖normal雖有量測，capture仍不易讀。 |
| Lighting/render | 2 | 日照、接觸與深度清楚，未靠霧或黑暗遮缺形；衣物偏平、黑槍部分細節偏暗。 |
| VFX/motion | 1 | 亮環、黃準星、抬槍姿態有狀態線索；靜圖未支持完整事件VFX及動作銜接。 |
| UI/HUD | 2 | 比分、回合、HP／ammo、播放退出有遊戲語意；角色卡與重新置中局部交疊、聊天／姓名牌搶視線待修。 |
| Performance evidence | 2 | 完整圖片／pixel／renderer／預算及資源紀錄；calls皆超advisory，缺完整狀態取捨及真機證據。 |

總16/30、平均1.6/3；before未提供，不評。Owner採獨立較低結論，不以assertion數提高分數。Premium每類至少2、平均至少2.3未達。

## 第一人稱四項

| 項目 | 分數 | 視覺判斷 |
|---|---:|---|
| 槍械本體 | 2 | 三圖五族gallery均有可辨滑套／機匣／托架／護木／瞄具／木色槍身；最低authored silhouette與材質分工成立，仍有硬邊大面。 |
| 握持 | 1 | rifle／shotgun／sniper的左手呈張開托掌，缺包護木的C形；SMG手掌／機匣／托架擠在一起，pistol兩袖腕交接使拇指／食指接觸不清。 |
| 手套 | 1 | 分指可見，但指節粗短、護片／縫線／皮革不清，偏塑膠；載入1Knormal不是可見品質證明。 |
| 袖 | 1 | POV與gallery大多長且平滑的色塊筒，厚袖口；缺前臂收束、拉力皺褶與布料重量感。 |

最小追修：長槍畫面左下掌心外緣三至四個可見指端向右上護木底緣收合、彎到側面成C形，拇指對側支撐；整理掌根／腕／袖連線。右手食指與其餘握把指分離。手套補清楚掌背護片，袖做漸收與2–3條斜向拉皺。解析度不足逐指命名；是否穿模、完全無接觸皆為推論，靜圖不能裁定。

## 量測與邊界

| active集合 | FPS | p95／p99 ms | calls／advisory | triangles | geometry／texture | 貼圖估計MB |
|---|---:|---|---|---:|---|---:|
| Mirage桌機 | 59.87 | 16.8／17.1 | 444／300 | 211450 | 348／36 | 63.71 |
| Mirage390 | 60.10 | 16.8／17.0 | 450／150 | 207712 | 348／36 | 59.71 |
| Dust2桌機 | 60.11 | 16.8／16.8 | 460／300 | 211702 | 350／36 | 63.72 |
| Inferno桌機 | 60.09 | 16.8／17.0 | 481／300 | 216350 | 364／36 | 63.71 |

完整46張entropy均>3、dominant<.6、contrast>60；多張edge<.04，支持稀疏／大面取景疑慮，不能以地面紋理當模型精製證明。各pixel-metrics.json保留逐圖數值與方法；自製fallback不是官方inspector，亮度未線性化、edge為相鄰像素差。textile紀錄2張1Knormal／10.67MiB估計、4888私有tri，不代表VRAM／美術分數。所有GPU是AMD桌機，390是viewport／DPR1.5／shadow1024，非真手機。

獨立審核沒有由限定圖片確證automatic failure；已有active、renderer、預算、來源紀錄，不假報缺少，也不由簡化手反推default primitives。UI局部交疊具名但不推論操作失效。真input可玩性、safe area、觸控、音訊聽感與動畫連續性未驗；未知不是PASS。即使未確證automatic failure，類別低於2與平均1.6仍明確不放行。
