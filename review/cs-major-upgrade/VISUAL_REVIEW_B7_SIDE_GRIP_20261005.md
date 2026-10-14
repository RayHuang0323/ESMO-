# B7 側向包握／袖皺獨立 Fresh-Eyes 審核

- reviewer：`/root/b7_side_grip_fresh_review`，獨立唯讀、無來源碼／handoff／舊評分。完整28/28 PNG與三張校準錨點已檢視。
- 唯一評估版本：`6b5887fc627d0c5fc8c2db8db464363a83a4ddc4c72e1b05b1c9bedcd8648c5e`。完整集：`evidence/phase-b7-side-grip-folds-desktop-mirage-20261005/1366`、`evidence/phase-b7-side-grip-folds-mobile-mirage-20261005/390`，各14 PNG及metrics／pixel-metrics／gate.json。不挪作後續素織布版本評分。
- 每個尺寸均檢視 active、detail、overview、pov、handling-crouch／reload／pov-reload、五族 weapon-gallery 與 pistol／sniper weapon-reload-gallery；沒有挑圖。

| 類別 | 獨立評分 | 證據 |
|---|---:|---|
| Art direction | 2 | 水務設施、石材、青綠鐵皮、塔管與比分配色有共同方向。 |
| Hero/player | 1 | 人體成立，但肩膀／背包／服裝仍為平滑大面，第一人稱手部欠構造。 |
| Obstacles/enemies | 1 | 箱桶與建築可辨識，人物近景主要靠色與相近裝備輪廓區分。 |
| Rewards/interactables | 0 | 本集只有C4持有文字，互動物件與操作狀態不足以評分；不是功能不存在的斷言。 |
| World/environment | 2 | 屋頂、拱架、塔、水槽具有前中後景，近景重複與空地偏疏。 |
| Materials/textures | 2 | 石／碎石／鐵皮／木角色清楚，手套／服裝／部分槍身精度不一致。 |
| Lighting/render | 2 | 日光、投影與深度清楚，細部接觸陰影／材質反應不足。 |
| VFX/motion | 1 | 選取環、準星與換彈姿態可辨識；靜圖不能證明動畫連續性或射擊衝擊。 |
| UI/HUD | 1 | 比分與回合／觀戰成立，手機五行通訊遮左中戰場與人物。 |
| Performance evidence | 2 | 雙viewport、renderer／timing／pixel／資產診斷齊全，沒有本版before/after；calls超advisory。 |

平均 **1.4/3**，未達每類≥2、平均≥2.3。只評本次完整捕獲，不是版本差分，不據此宣稱退步。Owner接受未放行結論；沒有用技術PASS提高美術分。

| 近景項目 | 手槍 | 長槍 | 證據與建議 |
|---|---:|---:|---|
| 握持 | 2 | 2 | 雙手握把與前托／後握清楚；手槍支援掌界面擁擠，長槍掌與槍欠接觸層。依族調掌面／拇指／手指弧度，保留槍邊線。 |
| 手套 | 1 | 1 | 指節圓塊、皮革／掌背／袖口分區弱；增加材質接觸層、清晰護墊與暗縫。 |
| 袖子 | 1 | 1 | 平滑錐形大面明暗多於布料摺線；腕部加方向一致且窄版可見的壓縮摺線／袖口結構。 |

靜圖評分不等於IK／穿模／整段動畫量測。sniper換彈左手在畫面底部，操作目標未量測；不得認定作者專用clip或接觸已過。

| 指標 | 桌機1366 | 390 viewport |
|---|---:|---:|
| active entropy／dominant share | 3.723801／0.194014 | 3.740422／0.189934 |
| active edge density／contrast | 0.030789／90 | 0.033328／93 |
| 全14圖 entropy | 3.274298–4.365583 | 3.454023–4.230159 |
| 全14圖 edge density | 0.026594–0.126459 | 0.020392–0.048917 |
| 全14圖 contrast | 71–162 | 78–167 |
| FPS／p95 ms | 58.91／16.8 | 60.10／16.8 |
| calls p95／advisory target | 444／300 | 450／150 |
| triangles p95 | 211450 | 207108 |
| geometries／textures／materials | 348／36／985 | 348／36／985 |
| texture estimate／heap MB | 63.71／134.47 | 59.71／167.03 |

兩集gate均42/42 PASS／exit0，各14/14像素MEASURED。active edge密度低於約.04支持遠景較疏，不能靠碎石地面高邊緣把人物／世界評為3。兩viewport使用同一AMD桌機GPU，非手機真機效能。

Automatic failure確認：手機rifle／smg／shotgun gallery及兩張reload gallery的五行通訊覆蓋左中角色與路徑（UI overlaps the play path）。其餘未確認；真輸入可玩性、實機safe area與預算取捨不由本材料判定PASS。真手機FPS、觸控、safe area及動畫連續性未測／未量測。後續須補互動物件真狀態、動態證據，並修手機遮擋。
