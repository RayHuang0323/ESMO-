## 最新 f7a181dd：皮革／fragment指節，仍未放行（2026-10-11）

## Owner 人物美術收尾與清理授權（最新）

2026-10-11 Owner 最新指示：人物美術接受目前完成度，停止人體／手指完美化，不再以舊獨立 1／U findings 阻擋反覆追修；原審查分數與遮擋限制保留，不宣稱獨立藝術 PASS 或量測90分。只收必要 B 技術驗證後直接 C → D → E，完成停 Owner Review，不 push／deploy、不動 MOBA。升級完成後已授權清理本 CS 工作區淘汰 evidence／profile-builds，保留最終可用版、必要完整驗證紀錄、素材授權與唯一恢復點；執行前逐份核對明確清單、resolved path、連結及使用中程序。

以下較早狀態及分數屬歷史，下一步以 RESUME_CHECKPOINT.md 最新段為準。

source f7a181ddd115f59fa594010d156f5d4b179d5fc9e4f1fb882cfefd9829eb491c，bundle 826e35f9b0a0b78b8cae530c13e129d6d2bf614203f4521980611a071bad4b49；完整4張1366×900 PNG位於 evidence/diagnostic-b7-glove-leather-joints-20261011/1366/operator-gallery。Owner與獨立 b7_leather_joints_fresh_review 都original看4/4及anchors3/3。只讀新圖／本scorecard／新metrics，reviewer沒讀產品或舊分數；全4圖是完整局部capture set，不借舊source圖。本sourceGPU17/17與pixels4/4/native0；藝術**NOT PASS**。

下表獨立評分，左右為角色自身；U不當0、不可跨圖補證。肩／肘／前臂／布袖口／衣料連續／輪廓依序：CT-FL左 U/U/2/2/U/2、右2/2/2/2/2/2；CT-FR左2/2/2/2/2/2、右全U；T-FL左U/U/2/2/U/2、右2/2/2/2/2/2；T-FR左2/2/2/2/2/2、右全U。Owner在肘仍評1；採較低而不由材質改動提高形體分。

|圖／手|掌體|拇指|食指近/中/末|中指近/中/末|無名指近/中/末|小指近/中/末|
|---|---:|---:|---|---|---|---|
|CT-FL左|1|U|1/U/U|1/U/U|1/U/U|1/U/U|
|CT-FL右|1|U|2/1/U|U/U/U|U/U/U|U/U/U|
|CT-FR左|2|2|2/2/1|2/2/1|2/2/1|2/1/1|
|CT-FR右|U|U|U/U/U|U/U/U|U/U/U|U/U/U|
|T-FL左|1|U|1/U/U|1/U/U|1/U/U|1/U/U|
|T-FL右|1|U|U/U/U|U/U/U|U/U/U|U/U/U|
|T-FR左|2|2|2/2/1|2/2/1|2/2/1|2/1/1|
|T-FR右|U|U|U/U/U|U/U/U|U/U/U|U/U/U|

左護木四圖僅可見外緣2、掌內接觸全U；右握把只兩front-left外緣2，掌內與各指接觸全U，兩front-right全U。未見足以指認懸空的外緣，不等於已驗所有接觸或無穿插。Owner左四指完整形體仍1、局部手背／掌根1；右完整掌／四指／握把U。

獨立具體缺陷px（完整PNG左上原點）：CT-FL左1080–1195/248–395背掌厚塊、四個短圓指根，掌指缺收窄；右797–977/224–326掌背粗厚過渡，895–973/256–287伸指關節弱，下側874–932/282–321數短圓指塊無法可靠分配身份。CT-FR左153–284/247–400，末節184–271/289–329方厚、圓塊接圓塊，小指長短階梯弱；拇指232–282/319–372可辨2。T-FL左941–1028/91–207指根凸塊相近、掌指過厚，中末節U；右745–849/146–218、789–841/169–214指端轉折／長短差不足且身份U。T-FR左371–478/64–201、末節405–470/101–145短方厚；小指上緣接canvas裁切。雙手內側仍U，不以遮擋推斷產品穿模。

獨立十類before全U；after依序Art2、Hero1、ObstaclesU、RewardsU、World2（局部）、Materials2（局部）、Light2、VFXU、UI1、Perf1，11/7=1.57；Owner WorldU，其餘同，9/6=1.5。所有類別無3。這不是全遊戲Premium／AAA／showcase。4張paused CT94/T224，未提供本組active-play screenshot；手機、動態握槍、完整敵人／互動／safearea仍未實測。完整technical-art calls超advisory取捨尚缺，不因有renderer diagnostics宣稱全部性能證據2。

|圖|entropy|dominant|fallback edge|contrast|darkclip|
|---|---:|---:|---:|---:|---:|
|CT-FL|3.863036|.198568|.023940|120|.017717|
|CT-FR|3.679948|.193483|.018764|177|.009295|
|T-FL|3.329001|.280352|.029630|108|.036771|
|T-FR|3.807430|.211808|.020871|130|.008228|

亮clip四圖0，4/4MEASURED/error0，PNG CRC；canvas crop(116,65)→(1235,694)、1119×629／703851pixels，非手ROI；fallback是相鄰luma差>16，不是Sobel，不套.04硬門檻。combat578frames/10.0064秒57.763fps，p50/p95/p99=16.7/17/33.4ms、max33.5；calls434/444>advisory300、tri218256、geo348、texture38、materials985、mesh1253、instanced2；texture估74.39MB、heap181.69MB、AMD Radeon ANGLE D3D11、page/console errors空。這不是各gallery FPS，也不證真手機。

下一步：先改善可見掌指過渡／末节漸細與關節比例，離線／作者形體成立才最少GPU；不要為本source左指1補整套角度。必要右掌直見補證仍排在真形體改善之後。完整新native、logs與manifest在retention-policy-20261011/glove-joints-*。

# B7 薄袖口／手部局部審查（2026-10-11）

## 最新4c5424f1…：自然彎指／比例技術通過，藝術未放行

source `4c5424f17a746587de6e01dd643ac69df190bbc2fc87e986eb1884280b93cf5f`（88檔），bundle `5b94edb395cb8957d43415c7375b1deaf72e06299802ba256476b14f810869f2`。唯一新archive diagnostic-b7-natural-glove-proportion-20261011-1366；prepare23.503秒/native0、Browser17/17/native0、wrapper/native0，四PNG及完整兩log共3,808,951bytes。public40硬連結、獨立copy／new cache0。pixels4/4 MEASURED、ERROR0/native0。Chrome172256 close confirmed、profileRemoved true，前後foreign gate空；不據此宣稱期間完全無負載。

Owner與唯讀Fresh-Eyes `b7_natural_proportion_fresh_review`均完整4/4原圖及3/3校準anchors／original；代理只讀完整capture、metrics、pixels、gallery與scorecard，未讀產品程式、checkpoint或舊評分。沒有before圖，before全U。以下為獨立完整逐角度評分；Owner同意手／肘／輪廓1、袖料及可見袖口2，遮擋U不借其他角度填分。

| 解剖項目 | CT前左 | CT前右 | T前左 | T前右 |
|---|---:|---:|---:|---:|
| 左肩 | U | 2 | U | 2 |
| 右肩 | 2 | U | 2 | U |
| 左肘 | U | 1 | U | 1 |
| 右肘 | 1 | U | 1 | U |
| 左前臂 | 2 | 2 | 2 | 2 |
| 右前臂 | 2 | U | 2 | U |
| 左真布袖口 | 2 | 2 | 2 | 2 |
| 右真布袖口 | 2 | U | 2 | U |
| 左袖料連續 | 2 | 2 | 2 | 2 |
| 右袖料連續 | 2 | U | 2 | U |
| 左臂／腕／手局部輪廓 | 1 | 1 | 1 | 1 |
| 右臂／腕／手局部輪廓 | 1 | U | 1 | U |
| 左掌面可見部分 | U | 1 | U | 1 |
| 左拇指 | 1 | 2 | 1 | 2 |
| 左四指分節 | 1 | 1 | 1 | 1 |
| 左護木可見接觸 | 2 | 2 | 2 | 2 |
| 完整左掌及全部接觸面 | U | U | U | U |
| 右掌面 | U | U | U | U |
| 右拇指完整辨識 | U | U | U | U |
| 右四指完整分節 | U | U | U | U |
| 右握把可見局部接觸 | 1 | U | 1 | U |
| 完整右握把接觸 | U | U | U | U |

px座標以1366×900原圖左上為原點，目視區域不是幾何量測：

- CT前左：右肩550–737/65–245有肩線／布紋2；右肘576–687/307–442為巨大圓鼓塊、缺主要壓縮衣褶1；右前臂641–782/274–363、右袖口749–794/253–324連續2但外緣硬片未3。左前臂897–1052/318–394、袖口1020–1076/343–399為2；左肩肘遮擋U。左手1080–1194/250–395仍寬厚連續塊、只以頂端凸起數指，分節1；拇指1084–1112/269–339融合1。右手794–973/220–331僅手背／伸指，891–973/250–286伸指粗長，完整掌／拇指／四指／內側接觸U，可見靠槍1。
- CT前右：左肩461–654/78–257有線／縫2；左肘375–500/284–398鼓厚缺肘褶1；前臂303–449/313–399、袖口274–328/320–405連續2。右臂遮擋U。左四指153–277/247–337指腹厚、細部屈曲不足1；左掌193–268/342–399為厚U形1；拇指240–294/326–370獨立斜向輪廓2。可見護木在抓握區2，完整掌側／全部指尖U。右手398–470/222–291被槍／左臂／胸口遮住，完整項U。
- T前左：右肩520–666/75–220為2；右肘572–668/230–355鼓厚缺褶1；右前臂622–711/194–299、袖口686–732/187–243為2。左前臂826–941/188–265、袖口920–967/176–233為2，肩肘U。左手949–1027/89–214指列為連續圓凸冠，957–1017/103–170缺指節階段1；拇指997–1027/158–212粗短融合1；掌側U，可見護木2。右手726–844/143–218只有背與伸指，783–842/177–216聚合粗厚，局部1、完整項U。
- T前右：左肩632–801/82–217為2；左肘545–688/201–284以鼓厚體塊說明彎曲1；左前臂456–603/172–271、袖口429–472/176–236為2。左四指372–473/64–141雖有指列折角，近中末節仍厚、完整屈曲不清1；掌381–455/143–200為厚硬U形1；拇指408–466/146–183獨立方向2；可見護木2、完整掌侧／全部接觸U。右手538–630/139–185受槍／前臂／胸口阻擋，完整掌／指／袖／接觸U。

可見接觸2只指該部分沒有明顯懸空，不代表全部指尖／掌側驗證；不以遮擋推定穿模、不把投影資料當自然解剖證明。

| 十類scorecard（before全U） | 獨立after | Owner採用／範圍 |
|---|---:|---|
| Art direction | 2 | 2，CT/T軍事色與布袖一致，局部 |
| Hero/player | 1 | 1，手套／肘部粗厚，完整握持缺證 |
| Obstacles/enemies | U | U，無敵人變體／預告證據 |
| Rewards/interactables | U | U |
| World/environment | 2局部 | U，Owner不以配景核定全地圖 |
| Materials/textures | 2局部 | 2，織紋與石材可辨，非3 |
| Lighting/render | 2局部 | 2，體積明暗／陰影與分離 |
| VFX/motion | U | U，四圖均paused |
| UI/HUD | 1 | 1，診斷標籤／卡片不能證明完整HUD |
| Performance evidence | 1 | 1，桌機診斷有量測、缺全套預算／手機 |

獨立可評平均11/7=1.57，Owner可評9/6=1.5；U不當0、不在分母。兩者只屬本組，不作全案平均或Premium門檻。採較低可評結果仍不放行B7。

pixels CT前左／前右／T前左／前右：entropy3.868588/3.677561/3.344559/3.803371；dominant.194118/.191533/.276272/.214140；fallback edge.023982/.018570/.029369/.020323；contrast120/177/107/130；darkClip.017313/.009292/.036045/.008236；brightClip皆0。canvas實採116,65–1235,694／1119×629。自製相鄰亮度fallback不是Sobel／官方inspector，不機械套.04判產品失敗。

combat599frames／10.0096秒、59.8426fps，p50/95/99=16.7/16.8/17ms、max33.7ms；calls434/444、218258tri、348geometry／38texture／985material／1253meshes／2instanced；texture估74.39MB、heap190.56MB、coldReady13379ms、10rigged、DPR≈1、2048shadow、AMD Radeon/ANGLE D3D11、page／console errors空。calls444>advisory300，E成本取捨尚待，不以60fps代替預算。combat不是四張gallery各自效能；CT frame94／T224且playing:false。

automatic／缺證：本四圖沒有active-play screenshot，不能主張全案Premium；renderer診斷確有，不稱缺失，但technical-art budget／超calls取捨未提供。完整敵人／互動變體、真輸入、完整HUD／mobile safe area及全地圖primitive dominance皆U，不猜通過或失敗。完整左掌接觸、完整右掌／拇指／四指／握把、動態接觸與320/360/390/430真機FPS／觸控皆缺證。

**下一步先修左四指主要彎折、指尖與厚度轉換及掌根／肘褶。此版不追加更多角度；只有左手具體改善後才最少新來源GPU，必要時補右掌直接可見證據。B7未通過，C/D/E未開始。**

## 上一版cc5f5506…：技術通過，藝術未放行（不得套最新）

source `cc5f5506887de73d012d2323d2f57fd9f2b217ff282f0a4aa2dc1e3aa8e85ca2`（87檔）／bundle `73518379be80b0927194b2952de56bb83449db4fe73d96be0a41b65705d31bfd`。本phase全4圖與3anchor：Owner4/4＋3/3 original、獨立Fresh-Eyes4/4＋3/3 original；代理只讀指定圖、scorecard與metrics，未讀程式／舊評分。GPU17/17、pixels4/4/error0、prepare/browser/wrapper native0。**Hero/player1、可評指節1，B7未通過。**完整capture不是全場或真手機驗收。

| 項目（解剖左右，獨立分數／Owner採較低） | CT前左 | CT前右 | T前左 | T前右 |
|---|---:|---:|---:|---:|
| 肩（右／左） | U／U | U／2 | U／U | U／2 |
| 肘（右／左） | 2／U | U／2 | 2／U | U／2 |
| 前臂（右／左） | 2／2 | U／2 | 2／2 | U／2 |
| 真布袖口外觀（右／左） | 2／2 | U／2 | 2／2 | U／2 |
| 衣料 | 2 | 2 | 2 | 2 |
| 局部輪廓 | 1 | 1 | 1 | 1 |
| 左掌面 | U | 1 | U | 1 |
| 左拇指 | U | 1 | U | 1 |
| 左指分節 | 1 | 1 | 1 | U |
| 右掌面 | U | U | U | U |
| 右拇指（獨立／Owner） | 2／U | U | 1／U | U |
| 右指分節 | 1 | U | 1 | U |
| 左手護木接觸 | U | 2 | U | 2 |
| 右手握把接觸 | U | U | U | U |

Owner採衣料／袖口可見外觀2、指分節／掌塊1，右拇指若不能可靠區分獨立thumb與伸指則保留U；不借其他角度補分、不計全場平均。獨立報可評5類局部1.6，只為本組、不能當全場門檻。

主要px缺陷：CT前左左手1080–1195/245–397，短厚圓柱／圓塊，右手800–975/220–333下方指連厚塊；CT前右左手151–280/246–399、掌面粗厚開口環，承托局部226–272/317–358可讀；T前左左手943–1027/87–211、右手729–846/144–220仍短厚；T前右左手371–475/65–202、掌根及拇指厚塊，左指y65被canvas裁切，承托405–463/134–175可讀。右掌／握把內側皆遮擋。前左完整肩上緣裁切／遠側肩肘遮擋，故U；袖口2只指可見布面／縫邊／衣袖連續，不證明3D厚度或拓撲。袖邊仍較直硬，但未再見原棋盤整片縫帶。

10類（before皆U）：Art direction局部2、Hero/player1、Obstacles/enemies U、Rewards/interactables U、World/environment U、Materials/textures2、Lighting/render2、VFX/motion U、UI/HUD U、Performance evidence1。不得用背景陪襯評全場。根與代理一致不放行，下一步處理指頭比例／掌根過渡／自然彎折，並有必要時才補未遮擋接觸面。

entropy CT前左／右、T前左／右＝3.870230／3.676960／3.346290／3.819444；fallback edge .023977／.018633／.029572／.020877，不直接套官方Sobel .04；contrast121／177／108／131，dominant .193916／.191781／.276297／.208502。combat59.385fps、594frames／10.0025s、p50/95/99=16.7/16.8/33.3ms；calls444>advisory300、218256tri／348geometry／38texture／74.39MB估算texture。不是逐gallery state效能／真手機。完整來源gate／metrics／pixels／gallery在evidence/diagnostic-b7-glove-anatomy-fixed-20261011/1366。

## 前兩版歷史結論（不得套最新source）

目前 source `dcec5089447d4d5f36fc58b8c6eeaa945585acd78e086e3e62e6b9c583f33c98`，bundle `437e81471ab7709c1515b38912c25a6bc39342da14eeb8066c9ba594e07cae5e`。四張原圖各1366×900與三張anchor各800×450，Owner及獨立Fresh-Eyes均original完整檢視；獨立代理僅讀指定圖、scorecard與三份metrics，未讀產品程式或舊評分。來源：evidence/diagnostic-b7-thin-glove-stitch-fixed-20261011/1366。**B7未通過；指分節仍1，遮擋U，不平均、不借其他角度填分。**

| 項目（角色解剖左右） | CT前左 | CT前右 | T前左 | T前右 |
|---|---:|---:|---:|---:|
| 肩／肘／前臂／真布袖口／衣料／局部輪廓（各項） | 2 | 2 | 2 | 2 |
| 左掌面 | U | 2 | U | 2 |
| 右掌面 | U | U | U | U |
| 左拇指 | U | 2 | 2 | 2 |
| 右拇指 | U | U | U | U |
| 左指分節 | 1 | 1 | 1 | U |
| 右指分節 | 1 | U | 1 | U |
| 左手／護木接觸 | 2 | 2 | 2 | 2 |
| 右手／握把接觸 | 2 | U | 2 | U |

缺陷座標為完整原圖左上角：CT前左左指(1086–1190,245–391)、右指(802–973,222–326)仍圓柱團塊；CT前右左指(151–275,243–326)缺中／末節轉折，右握持(410–482,224–290)遮擋；T前左左指(947–1023,88–158)、右指(789–841,158–213)分節不足，袖邊(691–737,181–243)/(919–969,174–236)略鋸齒；T前右左指(373–455,65–95)頂邊截掉、右手(546–627,137–184)遮擋，左袖(426–482,168–233)折線較機械。未見可可靠指認的大塊懸浮車縫片；靜態圖不能證明動作無穿插／閃爍。Owner同意袖口局部2，保守保留指節1及遮擋U。

10類scorecard：Art direction局部2；Hero/player衣料局部2但雙手細項未完成；Obstacles/enemies U；Rewards/interactables U；World/environment可見背景局部2；Materials/textures局部2；Lighting/render局部2；VFX/motion U；UI/HUD U；Performance evidence1（未有此source完整build／手機與成本取捨驗收）。不計整體平均或宣稱全場Premium。

四圖entropy依CT前左／前右／T前左／前右：3.869092／3.678357／3.346517／3.802155。edge density為既有fallback指標，不能直接當官方Sobel的.04 advisory通過／失敗。10秒combat樣本59.055708fps，p95 16.8ms，calls444>advisory300，tri約218258、348geometry／38texture、74.39MB估算texture；不是逐圖效能／真手機結果。

歷史source644578b4…／bundle21a0c196…的獨立4圖＋3anchors審查：肩／肘／前臂／衣料／局部輪廓2，袖口4圖1；可評雙手指節1、完整扳機掌／拇指／接觸多U。CT前左袖帶(764–807,255–328)/(1020–1069,348–393)、CT前右(278–322,327–404)、T前左(686–736,178–242)/(921–973,170–232)、T前右(430–477,165–233)為高對比棋盤帶。此否決只屬舊source；v19真fragment距離已消除該問題，不覆寫舊gate或將舊評分當新版結果。
