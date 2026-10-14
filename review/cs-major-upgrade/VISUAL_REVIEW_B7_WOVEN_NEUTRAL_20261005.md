# B7 素織布校色版獨立 Fresh-Eyes 審核

- reviewer `/root/b7_woven_neutral_fresh_review`，只收圖片、scorecard及metrics／pixels／gate；無來源碼、handoff或舊評分，唯讀不修改檔案／不執行browser。完整28/28PNG與三個錨點已檢視。
- 唯一來源 `d07b128cda625440d8dc5bb7a9a9d7a1776186a99438c492b716c7b48a65ca2d`：`evidence/phase-b7-woven-neutral-desktop-mirage-20261005/1366`及`phase-b7-woven-neutral-mobile-mirage-20261005/390`。每尺寸14張全檢，包括active／detail／overview／pov、handling三種、五族槍及pistol／sniper換彈兩種。不是後續車線版的評分。

| 類別 | 分數 | 圖像證據 |
|---|---:|---|
| Art direction | 2 | 石牆、青綠金屬屋頂與水務主題一致，角色精度與石材紋理不協調。 |
| Hero/player | 1 | 人形／護具／腰帶成立，肩臂／背板／衣服為簡化大面，POV手部欠構造。 |
| Obstacles/enemies | 1 | 桶箱／建築可分，人物主要同身體／背板與隊色，缺三種可讀剪影。 |
| Rewards/interactables | 0 | 本集只有A／B標記及C4持有文字，缺實體及操作證據；不表示功能不存在。 |
| World/environment | 2 | 拱窗／架、管線／屋頂機組／塔／桶箱分層，外圍平地、水面與樹木偏疏。 |
| Materials/textures | 2 | 石、木、金屬分工清楚，服裝／手套／黑槍精度低。 |
| Lighting/render | 2 | 方向投影與層次可讀，近距角色與槍欠接觸與高光。 |
| VFX/motion | 1 | 射線、槍口亮點、手機受擊環可見，靜圖不能證明全動畫。 |
| UI/HUD | 2 | 類型HUD與響應式成立，但手機多行戰況及過大姓名遮視野。 |
| Performance evidence | 2 | 兩viewport renderer／timing／pixels／budget齊全，calls超advisory、無本次before/after。 |

平均1.7/3，未達Premium門檻。Owner接受未放行結論；技術PASS不能取代美術。手槍握持／手套／袖各1；長槍整體各1，其中rifle／shotgun／smg握持單項可2，但sniper朝向疑點不允許全家族2。

優先問題：兩尺寸sniper圖中鏤空棕色槍托在前方左上、長黑槍管／準星延向右下，與其他長槍不一致。這是圖像方向疑點，尚未證明實際射擊方向。其次手機五行戰況遮中央左側、近景袖口／指節／握把分界弱、角色大背板與圓肩像原型。應先複核真來源軸向，再改實際握持與袖口結構，不只提高normal強度。

| 量測 | 1366 | 390 |
|---|---:|---:|
| PNG／像素 | 14/14 | 14/14 |
| active entropy／dominant share | 3.721885／.195374 | 3.740613／.189972 |
| active edges／contrast | .030685／89 | .033407／93 |
| callsP95／target | 444／300 | 450／150 |
| trianglesP95 | 211448 | 207108 |
| geometries／textures | 348／36 | 348／36 |
| materials／meshes | 985／1253 | 985／1253 |
| texture estimate MB | 63.71 | 59.71 |
| FPS／p95ms | 57.97／16.90 | 60.04／16.80 |
| gate | 42/42 PASS／exit0 | 42/42 PASS／exit0 |

材質maps確實載入，不能說沒有貼圖，但可見皮革與織物差異仍弱。active與overview edges低於.04支持遠景不應3；entropy／contrast不差不能抵消低細節剪影。兩組是同AMD桌機GPU不同viewport，不是真手機。

Automatic failures：手機長槍／換彈五行戰況遮路徑與視野；嚴格判準下敵人仍重複同剪影。未認定active整體primitive-dominant或靠霧／暗度遮掩。真輸入、safe area未由本次資料證明PASS。

未量測：真機FPS／熱節流／觸控／瀏海safe area、完整換彈連續性、全程接觸／碰撞、真射擊方向、reduced-motion。靜圖不得替代上述驗證。
