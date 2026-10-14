# B7 內前臂裁片與鋼木 shotgun 完整獨立複審

Owner保存 `/root/b7_resume_fresh_review` 的唯讀結果。只給完整capture、metrics／pixel JSON、原十類量表與3張anchors，未給source、歷史或既有評分；未開browser／修改圖片。54/54原PNG與3/3anchors均已查看。Owner來源對照為 `055a2302ddedd0dbac1755f96b18e37a3948f97440a0c3ff469737b88171fa5e`／57檔；bundle `55f008d49201b68c4e9c1d2531115175e277cc9ffa705234baeb083ade45daa8`。完整build manifest在profile-builds，未提供給代理；代理沒有假稱看過。

集合（以下路徑相對本文件）：D＝`evidence/phase-b7-palm-panel-shotgun-desktop-mirage-20261006/1366`，M＝`evidence/phase-b7-palm-panel-shotgun-mobile-mirage-20261006/390`，P＝`evidence/phase-b7-palm-panel-shotgun-perf60-desktop-20261006/1366`。D/M各26張、P兩張，包含所有子目錄。各集合像素26/26、26/26、2/2 MEASURED／0error／原生exit0。D/M技術58/58 PASS、P技術6/6 PASS，均exit0；技術PASS不等於效能或藝術品質PASS。before全NOT_PROVIDED。

| 原十類量表 | 獨立 After | Owner After | 正常畫面證據／限制 |
|---|---:|---:|---|
| Art direction | 2 | 2 | D/pov、M/overview的砂岩、深青金屬、水務及隊服一致；表面未全面有showcase個性。 |
| Hero/player | 2 | 2 | CT1 front／T3 rear有完整人體、配件與背包分型；正面仍相近。 |
| Obstacles/enemies | 2 | 2 | D/active的箱、桶、拱架與裝備差異可辨；靜圖不證anticipation。 |
| Rewards/interactables | 1 | 1 | P/overview可讀C4掉落可拾取，但物體外形／拾取前後證據不足。 |
| World/environment | 2 | 2 | 拱架、屋頂、設備、水槽及尺度層次；overview外圍平地與建築重複。 |
| Materials/textures | 2 | 2 | 石、地、金屬、木柄與布料角色成立；正常鏡頭衣物細部仍較弱。 |
| Lighting/render | 2 | 2 | D/detail方向陰影／接地／深度可讀；光照較均勻。 |
| VFX/motion | 1 | 1 | reload黃準星、角色環與雙殺回饋可見；缺多類戰鬥VFX／連續動作。 |
| UI/HUD | 2 | 2 | M/active播放與倍率控制清楚、pov返回／關閉／資訊可讀；追蹤卡遮近景下肢、小字偏弱。 |
| Performance evidence | 2 | 2 | 短長窗、renderer、資產及紋理量測具備；長窗明顯掉幀、缺受控before及超預算取捨。 |

兩組均18/30＝**1.8/3**，取低值仍1.8。沒有達到Premium各項≥2／平均≥2.3，不宣稱完成E／AAA／Showcase。Owner原圖直讀M rifle／SMG及D shotgun確認返回觀戰與×存在；沒有以舊代理未保存的控制缺失推論修改產品。

五槍族 **pistol2／rifle2／shotgun2／SMG2／sniper2**；左右手各2、手套2、**衣袖2**。shotgun正常尺寸可辨短雙管、木握柄與獨立形體；M rifle／shotgun可辨長向裁片、接縫及表面起伏，織紋仍不突出。SMG有短機匣、長彈匣及後框架，但局部表面仍偏塊狀；不是精確官方CS模型。手指接觸／穿插不能全部讀清，不能因此宣稱連續完全正確。pistol／sniper實際reload圖可見抬槍／支撐手移開；其他三族無錄得reload PNG，NOT_MEASURED，不能以模型存在代替證據。

CT/T assault、support、marksman各正反全部2；正面袋具／臂帶、背面硬板／寬袋／長袋可區分。M CT3 front偏側視，局部腿部被場景遮擋，不稱正面完整全身。追蹤卡遮近景下半身列D的UX改善，尚不能推定阻斷實際play path。

| GPU量測 | D約10秒 | M約10秒 | P約60秒 |
|---|---:|---:|---:|
| FPS | 59.9311 | 59.9173 | **29.8660** |
| p95／p99／max ms | 16.8／17／33.4 | 16.8／16.9／33.3 | **99.9／166.7／716.6** |
| calls p95／tri p95 | 444／214498 | 450／210156 | 453／237858 |
| geometries／textures | 348／38 | 348／38 | 365／42 |
| 紋理估計／heap MB | 74.39／172.14 | 70.39／176.45 | 74.39／181.97 |

三者同AMD桌機ANGLE D3D11；M只viewport模擬，真機FPS／觸控／safe area未實測。calls超advisory D/P300、M150；不能標成本PASS。P主執行緒一次self longtask565ms，根因未確認；短窗接近60不能抵銷長窗。隔離只前後快照，不保證全期間無其他負載。續跑乾淨重測被另一工作區GPU gate擋在測試前，HARNESS_FAIL／exit2，產品NOT RUN；不操作對方行程，不修改產品／放寬門檻。

| Canvas像素：entropy／edge／dominant／contrast | active | overview |
|---|---|---|
| D | 3.721／.0308／.1946／89 | 3.271／.0270／.4064／70 |
| M | 3.740／.0334／.1900／93 | 3.446／.0302／.2841／77 |
| P | 3.869／.0506／.1720／86 | 3.486／.0381／.3692／88 |

全部逐圖數值保留各pixel-metrics.json。這是自製fallback：512 RGB bins、鄰近luma差>16、p95−p05；不是官方inspector／Sobel、不直接證Premium。低edge與overview大面積地面／屋頂相符，限制環境至多2。

Automatic failures：目前未有足夠證據確認硬性failure；不是primitive＋glow主角、純debug HUD或黑暗掩缺內容。真實輸入可玩／真機safe area尚未驗證，不標PASS亦不倒推已壞。原圖底部返回／關閉可讀，POV面板矩形不相交／不overflow不代表全部HUD無遮擋。已有renderer／資產診斷，超calls預算取捨仍缺。

B7藝術子門檻的五槍／手／手套／袖／六身份已達2；**B整體仍待同來源長窗效能、另外兩地圖、音效／動畫及正式Worker驗證，尚未放行C**。C/D/E再補目標物／互動狀態、多類戰鬥事件及UI改善，不能用本輪1.8當Premium完成。
