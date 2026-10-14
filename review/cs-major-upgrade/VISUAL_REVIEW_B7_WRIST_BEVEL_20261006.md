# B7 真腕口／布料與省面護具完整 Fresh-Eyes 審查

台灣2026-10-06；來源 `52368c9f3c7abae273300fdff584e63cc7fb98016b2e4473659b4f72defafd55`。獨立唯讀 `/root/b7_wrist_bevel_fresh_review`（fork_turns=none）實際用view_image看完52/52截圖及3張校準圖，只讀完整清單、scorecard、兩份metrics與兩份pixel JSON；不讀source、handoff、歷史或先前評分。本文為Owner保存的獨立結論，不挪作下一版本評分。

完整清單 `evidence/b7-woven-wrist-bevel-complete-review-inputs-20261006.json`。Mirage桌機1366與390各26圖：active／detail／overview／pov／三種handling、五槍族、pistol與sniper真保存換彈、兩隊三身份各正反。各56/56 browser PASS／原生exit0、26/26像素MEASURED／exit0；圖片不是連續motion或真手機驗證。

| 原量表類別 | 獨立分數 | 圖證據與判斷 |
|---|---:|---|
| Art direction | 2 | active／overview／pov的砂岩、藍綠金屬及水務設施一致；人物與環境完成度不一。 |
| Hero/player | 1 | ct1-assault-front、t2-support-front、crouch的臉與肩臂仍光滑橢圓／軟管；衣褲摺線與接縫弱。 |
| Obstacles/enemies | 1 | active下三身份主要依衣色與名牌，正面輪廓難辨；木箱／桶較簡化。 |
| Rewards/interactables | 1 | A／B與C4提示可見，但兩種完整互動前後圖未提供；不是說功能不存在。 |
| World/environment | 2 | 拱架、機房、水塔、屋面有前中遠層次；overview外圍較空，石屋重複。 |
| Materials/textures | 2 | 石裂、礫石、金屬波紋、木箱與槍材料可辨；手套及衣袖貼圖就緒不等於可見質感完成。 |
| Lighting/render | 2 | 方向投影、明暗分區可讀，不靠暗霧／bloom；暗裝備細節黏合。 |
| VFX/motion | 1 | 選取環、換彈準星、蹲姿有基本狀態；缺完整命中／爆炸事件捕獲，靜圖不能證motion。 |
| UI/HUD | 2 | 類型專用比分、回合、觀戰與彈藥；390手槍回合banner與通訊疊字，選手卡遮腳。 |
| Performance evidence | 2 | 有renderer／frame times／像素／成本與error空陣列；本集未提供before或真手機，calls超advisory。 |

平均16/30＝**1.6/3**。before＝NOT_PROVIDED。不達Premium每類≥2且平均≥2.3門檻。

專項：pistol／rifle／shotgun／sniper外形各2，SMG1（大平機匣仍方塊感）；右手2、左手1、手套1、袖1。長槍前掌容易被槍遮、手槍合握像堆疊手指；sniper換彈拳頭懸下，單張不能判動作含義。六身份正面各1、背面各2，12剪影平均1.5；寬板／方包／長包可辨但正面尚弱。不能靠再加小配件代替主要形體改善。

| 指標 | desktop1366 | 390 viewport |
|---|---:|---:|
| active FPS／frames | 59.56／596 | 59.86／599 |
| p95／p99／max ms | 16.8／17.8／33.4 | 16.8／16.9／33.3 |
| calls p95／advisory | 444／300 | 450／150 |
| triangles p95 | 214498 | 210156 |
| geometry／texture | 348／38 | 348／38 |
| materials／meshes／instanced | 985／1253／2 | 985／1253／2 |
| texture estimate／heap MB | 74.39／171.63 | 70.39／152.49 |
| coldReady ms | 10625 | 9951 |
| active entropy／dominant | 3.7206／.1952 | 3.7397／.1899 |
| active edge／contrast | .03067／89 | .03316／93 |
| 全26圖edge<.04 | 8 | 18 |

兩組是同一AMD桌機GPU的10秒採樣；390不是手機。paused-pov-raster-only約60FPS不作完整戰鬥性能。coldReady含模擬及素材，不是純載圖。自製fallback像素不是官方inspector；全圖entropy≥3、dominant<.6、contrast≥70，仍不能抵銷低細節形體；ct3背面dark clip約6.04%／6.88%。

Automatic failure成立：390 pistol回合提示與通訊疊字。其他角色卡遮腳須連續回放判是否持續遮行動區。人物簡化不反推mesh一定是default primitives；已有三種背具與分層世界，不另判純空arena或單一敵人。真輸入、連續motion、真機FPS／熱衰退／觸控／safe-area未測。

下一輪：衣物摺線、袖口、皮革掌墊與縫線要在交付尺度可見，正面要有主要輪廓差異；SMG大平面要有材質／功能層次。D修390 banner／通訊與卡遮擋，E補連續事件與效能取捨。未達標就繼續追修，不把技術PASS算成美術完成。
