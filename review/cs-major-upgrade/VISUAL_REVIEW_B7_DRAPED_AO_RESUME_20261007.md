# B7 離線布褶含AO候選完整複審

本報告保存唯讀代理 `b7_draped_ao_resume_fresh_review` 的獨立結果。代理逐張查看52/52原PNG及3/3校準anchors，取得完整inventory、metrics及pixels，未提供產品source、checkpoint或歷史評分。來源為72f1ffe83eb23563b86139912a8994d28fbb518480379849560915c837817e79；不適用後續腕軸修正版。before未提供，不能宣稱前後改善。

## 十類獨立評分

| 類別 | 分數 |
| --- | ---: |
| Art | 2 |
| Hero/player | 1 |
| Obstacles/enemies | 1 |
| Rewards/interactables | 0 |
| World | 2 |
| Materials | 2 |
| Lighting | 2 |
| VFX | 1 |
| UI | 1 |
| Performance | 2 |

合計14/30，平均1.4，B未放行。Rewards/interactables只有C4文字及A/B標記，證據不足；不能推論產品不存在。場景有authored world，不將其誤報成完全空白primitive arena。

## 具名不足

- 五槍族：pistol2、rifle2、shotgun2、SMG1、sniper2。SMG仍像盒形，手及握把合成暗團；黑步槍吞細節、狙擊鏡硬棱塊、木托棕色平。
- 左右手各1、手套1、第一人稱袖1、第三人稱袖1。主手手指粗短柱列，食指、拇指與掌根受力難讀。支撐手長槍方向基本合理，手槍雙手仍像夾握塊；換彈圖只證握拳離開，未證机械操作。
- 手套像橡膠團，皮革、布與掌片層次弱，黑袖口厚硬環。POV袖長直均勻，缺腕口堆布、肘內壓縮及外侧拉伸；SMG明暗波紋像柔噪聲，缺受力依據。
- 六身份正、背均1。第三人稱肩臂圓管膨脹，T灰／棕臂環像硬套圈；抬臂背褶不對應張力。CT1盾板背包／T1木塊護具，CT2/T2袋面規則槽，CT3/T3窄袋可辨身份但body／face重複。
- 390版資訊卡遮腿，重置按鈕遮腕／槍托；pistol語音toast與介面重疊。真輸入、動態、手機及safe area未獨立驗證。

## 同版技術證據

- D與M各58/58 PASS、native exit0，各26PNG；pixels各26/26 MEASURED、無錯誤。完整inventory：`evidence/b7-draped-ao-full-capture-inventory-resume-20261007.json`。
- D：59.648FPS、p95/p99 16.8ms、max33.4ms、calls444、tri214498。M：60.158FPS、p95/p99 16.8ms、max16.9ms、calls450、tri210156。這是10秒桌機AMD GPU窄版，不是真手機或60秒結果。
- geometry348、textures38、materials985、meshes1253、instanced2。D/M texture估74.393/70.393MB，heap172.735/175.733MB；D DPR約1、shadow2048、canvas1120×630；M DPR1.5、shadow1024、canvas555×655。
- coldReady8169/10109ms包含模擬及素材；calls超D300/M150 advisory，不隱藏。取捨不構成分數3。
- 全圖fallback像素範圍：D entropy3.273519–4.359232、dominant.149130–.405638、edge.024007–.126872、contrast70–183；M entropy3.394130–4.220308、dominant.149741–.315037、edge.022225–.055730、contrast78–187。edge<.04：D8/26、M18/26。非官方像素工具，不能代替品質判讀。
- Active D entropy3.720838／dominant.194736／edge.030751／contrast90；M3.740966／.189963／.033466／93。Overview D3.273519／.405638／.027033／70；M3.451325／.283830／.030112／78。CT3rear darkclip M.073081／D.056099，暗布與包／箱合併。

## 後續診斷（不混入本次評分）

Root按真來源+Z腕軸診斷五族：主手約85–88°、支撐約60–90°偏離腕向肘方向。`evidence/b7-wrist-axis-audit-resume-20261007.json`保存原值；新增實際接合斷言先重現36/37失敗，再修Major-only手朝向為真肘軸，保留掌向內、握點與端點。修後三段Node3/3通過。新版GPU及視覺另取證，尚不據此放行B。
