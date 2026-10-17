# B7 平面裁片獨立袖審：未放行

`planar_cut_sleeve_fresh_review` 逐張以 original 看完 inventory 所列32/32 PNG與3/3 anchors，讀兩組 metrics／pixel-metrics；未讀產品 source、checkpoint、歷史 review，未改檔或跑 gate。沒有 before，不能推論改善。source `9bfa90851d3e25f0ac1492f14432847e62c006f12aadf0e6eb0c37ece6847e2c`，bundle `d9a23a179f00073fed3a579d22766175f8f6fbdb8fc6dbd39346d099b9a9c483`。

每格依序為袖輪廓／衣料材質細節／裁片摺面；D1366、M390。0為缺可讀證據，不宣稱底層資產不存在。

| 身份 | D正 | D反 | M正 | M反 |
|---|---|---|---|---|
| CT1 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |
| CT2 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |
| CT3 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |
| T1 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |
| T2 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |
| T3 | 1／1／1 | 1／1／0 | 1／1／1 | 1／1／0 |

24張必要袖視圖均未達2。CT2與T2正面露袖充分，是最強低分反例：肩、肘、前臂仍連續圓弧陰影，細縫線沒有對應裁片轉折、壓縮摺面或袖口堆疊。CT1窄弧帶、CT3灰環、T1／T3棕環均不能補袖構造。反面背包／背板遮住中央，露出的肩袖平滑；背包波紋不計袖分。

其餘8圖逐張已看：D/M active及overview角色太小，缺袖構造證據；detail可辨第三人稱持槍但衣料細節不足；POV近處第一人稱袖不可補第三人稱，中遠景人物仍太小。完整覆蓋為各尺寸4張根目錄圖及12張operator-gallery六身份正反圖。Anchors為scene-1／2／3.jpg。

兩尺寸各25/25、native0，像素各16/16 MEASURED、ERROR0；短窗D48.865／M54.877 FPS，p95 33.4／33.3ms，calls444／450超advisory。canvas像素統計沒有袖專用ROI，不能推導袖2；同桌機GPU窄viewport不是手機真機。另60秒D7/7、native0，約45.8 FPS／p95 33.4ms，不當作效能放行。前版fdaa即時同情境控制約54.1／p95 33.4ms，仍須釐清落差。

控制首次錯把reuseWidth與referencePhase混用，被工具參數檢查擋下、native1、未進產品斷言，列HARNESS_FAIL_ARGUMENT_PRECHECK，不是PRODUCT_FAIL。完整失敗log保留；修正參數的新phase重跑7/7、native0，未改工具或產品去掩蓋。

後續唯讀geometry audit指出：現有plane只覆蓋x=.060–.185，上臂中段；真肘約.251、腕約.4945，肩根／肘／前臂／袖口未覆蓋。接續分段袖型是新來源，不能套用本報告的PASS或分數。B仍未放行，C／D／E未開始。
