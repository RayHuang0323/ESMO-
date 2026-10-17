# B7 完整101圖獨立複審

唯讀 `/root/b7_frozen101_fresh_review` 完成101/101原PNG＋3/3 anchors、9組metrics／pixel JSON；未讀source、handoff、歷史或其他review，未開browser、改檔或跑驗證。Owner保存結果，不宣稱已完成Premium或B放行。

完整集合為`evidence/b7-frozen-full-capture-inventory-20261007.json`所列9目錄。Owner來源對照055a2302…／57檔，代理未收source／建置背景。before全NOT_PROVIDED。97張像素MEASURED、4張NOT_MEASURED：中止D lifecycle的dust2-active／detail／overview／pov缺map metadata，原圖已全部查看；後來DI完整測試不能回填舊缺值。

| 原10類量表 | 獨立After | OwnerAfter | 正常畫面證據與限制 |
|---|---:|---:|---|
| Art direction | 2 | 2 | 三圖水務／貨港／鑄造題材可辨；仍有規整模型場感。 |
| Hero/player | 2 | 2 | 完整人體與耳機／胸甲／背包分層；同隊臉身重複。 |
| Obstacles/enemies | 2 | 2 | CT/T三身份正反、奔跑／蹲姿／reload可辨；正面差異較弱。 |
| Rewards/interactables | 1 | 1 | C4攜帶／掉落標示可見，缺近景物體與idle／collect。 |
| World/environment | 2 | 2 | 三圖屋頂／通道／塔槽／管線／碼頭與深度；規整殼體、場外平地限制3。 |
| Materials/textures | 2 | 2 | 石、金屬、木、槍與布角色；石牆尺度粗、窗面平、衣料規則紋理欠自然。 |
| Lighting/render | 2 | 2 | 通道明暗、接地可讀；光色偏平均，缺展示級焦點。 |
| VFX/motion | 2 | 2 | lifecycle Mirage detail／POV有真槍火與彈道；白黃星芒偏大、靜圖不證時序／流暢。 |
| UI/HUD | 2 | 2 | 回合／血量／彈數／播控／返回可辨；toast與訊息重疊、近景卡遮腿。 |
| Performance evidence | 2 | 2 | 雙長窗、D/M renderer／資源／advisory數據；無before、兩窗差異根因不明。 |

雙方19/30＝**1.9/3**，取低值仍1.9。五槍族pistol／rifle／sniper／SMG／shotgun全部2；左右手各2、手套2，**衣袖獨立1／Owner保守採1**。前臂表面偏平、規則線條較強，褶皺與自然張力不足；不以shader存在、之前54圖袖2或技術PASS推翻本輪具名缺口。手指接觸部分遮住，不能宣稱無穿插。pistol／sniper只有錄得的reload靜圖，不能代表完整五族編排。

三圖環境與角色可讀性均2：Mirage石牆／拱架／水塔；Dust2貨櫃／碼頭棚／船；Inferno管線／塔槽／鑄造棚。overview人物小、陰影區較弱，名字／血條是主要閱讀來源。隊伍辨識2、裝備變體2、臉部表情1。CT3 M front的前景屋頂遮部分腿，不倒推資產缺失。

可見播放／pause、前後步進、滑桿、倍率、快速完成、四種視角、音訊、返回／×、選手卡下拉。未由代理操作，不聲稱操作PASS；viewport外的部分播控不猜成缺失／不可捲動。「重新置中中」控制狀態不確定。

Automatic failures／風險：M pistol gallery回合toast與隊伍訊息文字壓住；主要overview規整矩形殼體主導風險，雖有authoring門窗／屋頂／設備，不能排除main world mostly stretched boxes／flat planes限制。未見用霧暗／粒子全面掩缺內容，人物非primitive＋glow；active及renderer已有。真input、真機safe area、技術美術取捨文件均不在代理允許證據中，NOT_VERIFIED，不推定失敗或PASS。

| Active像素：entropy／edge／contrast／dominant | 值 |
|---|---|
| Mirage HD | 3.719788／.030277／89／.194821 |
| Mirage HM | 3.740521／.033063／93／.190005 |
| Dust2 DI | 3.703820／.036936／93／.207281 |
| Dust2 LM | 4.071756／.041343／108／.152102 |
| Inferno DI | 3.626486／.043952／121／.239646 |
| Inferno LM | 3.705050／.039854／105／.205571 |

DI Inferno detail edge .016663／POV .024213、HD Mirage overview .026878，限制環境3，非產品錯誤證明。已測無entropy<3或dominant>.6，也不自動提高藝術分數。全部逐圖值留pixel JSON；自製fallback，不是官方inspector。

| final tier | calls p95／tri p95 | geometries／textures | 紋理估計MB |
|---|---|---|---:|
| Mirage HD／HM | 444／214496；450／210156 | 348／38；348／38 | 74.393／70.393 |
| Dust2 DI／LM | 460／214750；458／211204 | 350／38；350／37 | 74.403／70.403 |
| Inferno DI／LM | 483／219398；476／212622 | 364／38；364／37 | 74.393／70.393 |

calls全部OVER_ADVISORY_TARGET，D約1.48–1.61×300、M3.00–3.17×150。兩60秒同報：舊29.866FPS／p95100級／p99166.7／max716.6／calls453／237858tri；clean59.791／p95與p9916.8／max166.6／calls455／237870tri。page／console error均空；沒有因果證據解釋差異，不推成舊壞／新修好，不隱藏舊尾延遲。M均同AMD桌機GPU，真手機FPS／觸控／safe area／手感／motion未實測。

本輪**B仍未放行**，先改善POV袖的自然布料張力與可讀褶皺，再同版驗證／完整複審。C/D/E其餘精確工作：目標物近景與狀態、主要建築形體／場景變化、toast訊息重疊、角色臉部差異、超calls成本取捨及受控長窗。完整技術取捨見B7_GATE_REPORT_20261007.md，代理未被給此文件，不混入獨立分數。
