# B7 貼合袖與外置 HUD：完整 78 圖獨立複審

審查者：b7_fitted_hud_full_fresh_review。逐張 original 實看 78/78 PNG，另看 3/3 anchors；只讀 inventory、圖、四組 metrics／pixel-metrics 與量表，未讀產品 source、歷史評分或設計。沒有 before，不能推論改善幅度。

來源：`evidence/b7-fitted-hud-complete-capture-inventory-20261007.json`。D23/M23 為 `phase-b7-fitted-cloth-hud-{desktop,mobile}-mirage-20261007`；D16/M16 為 `phase-b7-fitted-hud-true-facing-{desktop,mobile}-20261007`。四組 source fingerprint 同為 `e7f57af92fd1259073eb10b754d9ed68c12d12f26baa8548daa34ed23547e5f5`。本次集合不包含後續 perf60 圖。

## 原十類評分

| 類別 | 0–3 | 可見證據與限制 |
|---|---:|---|
| Art direction | 2 | active/detail 石造水務設施、青綠機械、制服形成一致主題，未達 anchor 3 的個性。 |
| Hero/player | 2 | true-facing ct1-front、t1-rear 有連續衣型、背甲、腰包與持槍手勢；臉簡化、裝備邊硬。 |
| Obstacles/enemies | 2 | detail 的掩體、桶與機械，六身份有裝備變體；連續預備動作缺證。 |
| Rewards/interactables | 0 | active 有 C4 持有文字及區域標記，缺兩種 authored 互動物及 idle/collect 狀態證據；不代表整個產品沒有互動物。 |
| World/environment | 2 | overview/detail 有拱梁、屋頂機組、蓄水塔、地形與通道；外圍疏，牆窗／箱體重複。 |
| Materials/textures | 2 | POV/gallery/detail 可分石、砂礫、木、金屬；第三人稱布料單色平滑，normal map 診斷不能代替可見品質。 |
| Lighting/render | 2 | 日光與接觸陰影建立深度，POV 槍焰過曝，人物暗面較弱。 |
| VFX/motion | 1 | detail/POV 有槍焰、tracer 與環狀回饋，仍基本 star/line；靜態圖不證明動作銜接。 |
| UI/HUD | 2 | 390px 資訊面板位於 canvas 外、文字適配；頁面長，控制列在視窗下方，圖不能證明滾動手感。 |
| Performance evidence | 2 | 有 renderer、frame time、viewport、品質層與 advisory；缺 before、真手機及超預算取捨。 |

**總分 17/30，平均 1.7/3，不能宣稱整體 Premium／AAA／Showcase。** Rewards、VFX 尚低於 2。B 局部門檻與 E 最終門檻分開判定，不以技術 PASS 取代美術品質。

## B 近鏡分項

五槍 gallery：pistol 2（滑套、槍口、握把刻線）；rifle 2（槍托、彈匣、導軌、長管，暗部弱）；shotgun 2（雙管與木握把，細節較少）；smg 2 下緣（機匣、長彈匣、框架槍托，表面平）；sniper 2 下緣（長管、瞄鏡、木托開孔，材質簡化）。左手 2、右手 2、手套 2：支持握持、指節與分區可辨，遮蔽部位及全角度穿插仍缺證。POV 袖 2：縫線、袖口與面板可見，織紋仍不清楚。**第三人稱袖 1**：真正面圖仍光滑單色及色帶。B 角色整體近鏡 2 下緣，不代表每一表面皆 2。

真正正背六身份 ct1/ct2/ct3/t1/t2/t3 全部正 2、背 2。assault 肩甲／寬背板、support 收納包／雙帶、marksman 長縱包是主要差別；背面差異強於正面，不能誇大成六個獨立造型。D23/M23 ct3-front 實為側背，沒有照檔名充正面；D16/M16 圖面胸前／背包與 bodyFacing 前提一致。部分足部超出 canvas，靴子全貌缺證。

## UI 與風險

- D23/M23 toolsIntersects、panelIntersects、povPanel.intersects、overflow 均 false；D16/M16 該 HUD 欄位 null，不能冒稱同份量測。
- 開局橫幅遮部分姓名／血條，gallery pistol 可見；需要動態證據確認消退，不以單張判永久遮擋。邊緣姓名／血條有視野裁切，不等於頁面水平溢出。
- 沒有直接證據顯示主角主要由 default primitives 加 glow 構成、世界空平面或濃霧掩飾；不能把矩形資訊面板直接當 debug card。
- 四組 calls 全超 advisory，仍缺具體 technical-art 取捨。真手機 FPS／safe area／觸控／真實輸入、完整抽匣插匣復位、跑射銜接與動作時序均缺證；68 reloadFrames 診斷不能代替完整可見動畫。

## 四組技術證據

| 指標 | D23 | M23 | D16 | M16 |
|---|---:|---:|---:|---:|
| calls p50/p95 | 434/444 | 442/450 | 434/444 | 442/450 |
| triangles p95 | 214496 | 210106 | 214470 | 210106 |
| geometries/textures | 348/38 | 348/38 | 348/38 | 348/38 |
| materials/meshes/instanced | 985/1253/2 | 985/1253/2 | 985/1253/2 | 985/1253/2 |
| texture estimate MB | 74.393 | 70.393 | 74.393 | 70.393 |
| JS heap MB | 146.662 | 127.273 | 163.145 | 172.577 |
| 10s FPS | 56.064 | 56.468 | 55.723 | 59.405 |
| frame p50/p95/p99/max ms | 16.7/33.3/33.4/33.5 | 16.7/33.3/33.4/33.6 | 16.7/33.3/33.4/33.9 | 16.7/16.8/33.3/33.4 |
| coldReady ms | 10544 | 12351 | 11867 | 9886 |
| canvas buffer | 1120×630 | 555×655 | 1120×630 | 555×655 |
| DPR/shadow | 1/2048 | 1.5/1024 | 1/2048 | 1.5/1024 |
| advisory calls | 300 | 150 | 300 | 150 |

皆同桌機 AMD Radeon／ANGLE D3D11；M 為窄 viewport，非手機 GPU。10 players/10 rigged，shadows=true，activePointAndSpot=0，page/console errors 空。coldReady 包含模擬與資產，不是純地圖載入。

像素 23+23+16+16=78 全 MEASURED，notMeasured/errors=0。完整逐圖六指標保存在 inventory 指向的四份 pixel-metrics JSON，為自製 fallback，非官方 inspector。entropy 皆≥3、dominant<.6、contrast≥60；active/overview/五槍及不少窄版角色 edge<.04，不能由高 entropy 推論服裝精緻。M23 POV brightClip 約 7.586%、D23 約 3.098%，可見白色槍焰應在最終 polish 縮小。後續需补第三人稱袖可見細節、完整換彈動態、開局橫幅消退、真輸入／真機及超預算取捨；本報告不替 Owner 放行，也不宣稱任務完成。
