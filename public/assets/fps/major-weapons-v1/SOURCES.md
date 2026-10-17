# CS Major 武器模型來源

## pistol.glb

- 作者：loafbrr_1 / loafbrr。
- 來源：[Pistol](https://opengameart.org/content/pistol-5)。
- 授權：CC0；來源頁及下載包 `README.txt` 均明列 Creative Commons 0。
- 原始包：`https://opengameart.org/sites/default/files/pistolfbxgltftexturesblend_1.zip`。
- 下載日期：2026-10-05。原始包及原 README 保存在本機 review evidence，不提交測試輸出。
- 原始 ZIP SHA-256：`3aa9970b4b601fc37a6e6034bfe53f1ebc00fd56cc0a2abb6542abf34e7754f0`。
- 首輪 GLB SHA-256：`97e175bb6c8c081186003dd20b92c691018a4ad7d7667b4edb136625fb0e33b8`；2243 triangles、單材質／單 mesh，貼圖沿用原作者。
- 處理：排除展示底座及旁置備用彈匣；合併七個本體零件；烘入作者原始物件 transform；校正 +X 槍口方向及 grip 本地尺度；使用原作者 1K Albedo、Metalness、Roughness、Normal，匯出 GLB。
- 2026-10-06組裝修正：先固定七件的全部matrix_world，再解除父子關係、轉至作者Pistol_Frame座標與烘焙；避免逐件更改父物件後再次套用變換。新版SHA-256 6665515998470bf8dc020b88ad21ddea9c49356b5586b8af9e613b1cdded84d3；仍2243tri、2564匯出頂點、原四張1K貼圖與UV，無新Mesh／材質／Texture。槍口取真管口50個最前端頂點中心 [.532445967,-.033827716,-.000000071]，握點取y=-.245握把截面中線x=.074063027；前版GLB與錯位圖／報告保留ignored evidence。原.blend未修改。仍需GPU實圖複審，不以離線修正宣稱品質達標。
- 不包含 Valve／CS 原作模型或貼圖；只以實際 CS 畫面作比例與呈現參考。
- 此檔僅記來源，不表示武器視覺或整個 Major Upgrade 已驗收完成。

## rifle.glb（Owner近景追修版）

- 作者：nisu／3DModelsCC0；[M4A1 Assault Rifle](https://opengameart.org/content/m4a1-assault-rifle)，作者頁與下載項目明列CC0。
- 原始包：`https://opengameart.org/sites/default/files/m4a1_0.zip`，下載2026-10-05；ZIP SHA-256 `ed5779ec82718861964227e2aad2a900978ea087081154365d6d86246be62f0d`。
- 原FBX9236 triangles、有真UV與獨立Magazine；烘入world transform並解除FBX父物件，轉成+X前方／+Y上方；比例校正至來源實際握把／槍口。
- 幾何簡化至3772 triangles，保留主體與300tri真彈匣兩個mesh，不提高4000tri rifle上限。原作者Base Color／Normal／Metallic／Roughness縮至1024px，GLB嵌入Base Color／Normal／合併Metallic-Roughness；不使用Height，不造替代貼圖。
- 輸出GLB SHA-256 `0d8f3f208b7f7b54d56185fa69abff6541727703ea124fe377579c6dc44da944`。原包、舊Tabasco rifle及首次父transform異常候選均保存在本機ignored evidence，不提交測試生成物。
- 仍是rifle槍族共用來源，不表示AK／AUG等每把槍已逐一還原，也不是Valve素材。

## sniper.glb

- 作者：Tabasco；[Various Small Arms](https://opengameart.org/content/various-small-arms-assault-rifles-sniper-pistol)。
- 授權：CC0；作者於2023-12-15明確將此組放入public domain；來源頁另保留舊CC-BY 3.0選項，本專案依CC0使用。
- 原始包：`https://opengameart.org/sites/default/files/smallarms.zip`；下載2026-10-05。
- 採用SVD來源幾何，烘入作者transform、轉為+X前方／+Y上方；ESMO新增少量倒角及獨立PBR硬質材質。無外部貼圖。
- 5388 triangles。只保留靜態展示幾何；舊Blender動畫未匯入或聲稱可用。舊Tabasco M4已由上述有真UV的來源替換，舊輸出保留本機。
- 2026-10-05獨立實圖review發現前後反向，原來源Y/Z geometry投影確認槍口在+Y、原握點誤落護木之外。重新讀作者未改的 `dragunov.blend`（SHA `ccdc960c722b58752cf33cd04f391b7fb9ea9a2352d4299c3605c409d5868eda`，匯出前後逐byte hash一致），真握把中心選在來源 `[-4.83959,-2.82,-.53]`，+Y前向以正交、determinant +1轉換為GLTF +X，不再反射／反向。
- 真管口最前端9個來源頂點中心為 `[-4.83959246,4.99016809,.09337596]`；新local muzzle `[2.54115200,.09324654,-.0000007391]`，support `[1.30419993,.07979999,0]`在真護木、grip仍 `[.12,-.1,0]`。原PBR材質／倒角不變、仍5388tri≤5500；初輪GLB SHA `d1b31be8287d7496587408daf13ffc87f46ad1bcab0adaa7b414952c8a2b9e0c`。前版成品及錯向實圖／review均保存ignored evidence，不覆寫歷史結果。

## smg.glb

- 作者：GGBotNet；[SMG-10 3D](https://opengameart.org/content/smg-10-3d)，CC0。
- 原始包：`https://opengameart.org/sites/default/files/smg-10_3d.zip`；下載2026-10-05。
- 原作者1140 triangles，ESMO校正尺度／方向及握點、少量倒角／表面normal與原創PBR材質，輸出2708 triangles；無外部貼圖。

## shotgun.glb

- 作者：crookedmouth；[Semi-Auto Shotgun with Magazine](https://opengameart.org/node/68988)。作者明列 **Model itself is CC0**。
- 原始包：`https://opengameart.org/sites/default/files/myShotgun.zip`；下載2026-10-05。
- 只用OBJ幾何；**不使用下載包貼圖或聲音**。另含聲音是CC-BY，不屬本輸出。材質為ESMO原創PBR。
- 共平面簡化後3047 triangles，保留握把、扳機護圈、前護木、雙管外觀與彈匣；校正+X前方及握把／槍口socket。

這些目前是五個「槍族」模型，不是22把槍逐一對應的官方CS模型；例如AWP家族暫共用SVD來源，Deagle家族暫共用M1911輪廓。武器視覺名稱／輪廓對應及Owner品質驗收仍待，不能宣稱逐槍還原。

## hands.glb

- 作者：para；[FPS arms (rigged only)](https://opengameart.org/content/fps-arms-rigged-only)，CC0。原作者明列mesh／texture來自MakeHuman，清理、重UV與rig由para處理；[MakeHuman官方核心資產授權](https://static.makehumancommunity.org/about/license.html)同為CC0。
- 原包：`https://opengameart.org/sites/default/files/fps%20arms.7z`，下載2026-10-05；只用T-Pose blend的手部幾何與既有手指骨權重。不使用來源皮膚貼圖、sample animation或燈／相機。
- 原包SHA-256 `31f6c7bd5caea8856c4aafca8461f38a3c8bfdd3d8f05c898e403b9475e54562`；最新成品GLB SHA-256 `8436897cfdedc012718f3ef5f2dc044fec75379f005ee88f6d972bfa9457af1d`。前版GLB SHA `440927be3fe832bedd04c191457c39ebd2386fe455d0151667b50aa969b3e882` 保留於ignored evidence。
- ESMO在離線工具清除IK／finger constraints，設定握持指節姿態，擷取各側hand／palm／finger／thumb權重超過0.5的完整三角形、轉為腕點局部米制座標。最新左手四指收合，右食指保持扳機分離；來源3196tri先降為1597tri，再合入原創掌背護片與三片指節護墊，最終每手1773tri。保留原1800上限與平滑法線，無新增runtime Mesh。雙側為作者各自真來源，不用鏡像代替。
- 只輸出靜態geometry。POV私有clone並增加原創手套掌背／指縫／袖口顏色及微表面；無新runtime骨架，不改第三人稱Quaternius來源或釋放source cache。舊Quaternius手部GLB已保留本機ignored evidence，不抹除比較資料。
- 尚無五族專用作者換彈clip，不宣稱原sample animation就是正式CS換彈。

## 第一人稱手套／袖子法線（2026-10-05）

- 作者 Rob Tuytel／Poly Haven：[Leather White](https://polyhaven.com/a/leather_white) 與 [Fabric Pattern 05](https://polyhaven.com/a/fabric_pattern_05)，[官方資產 CC0 授權](https://polyhaven.com/license)。只使用資產下載法線，不使用網站預覽圖、logo 或使用者投稿。
- 原始 1K OpenGL tangent-space JPEG，無修改／重壓縮；正常資料以 NoColorSpace 載入。皮革來源物理寬0.3m、布料0.5m，POV UV 按米制尺度，不把大型花紋貼成微粒。
- `leather-white-normal-1k.jpg`：670610 bytes，MD5 `4226eb91e17693722f3368cd41a3b1c9`（與作者公開API一致），SHA-256 `51bdac4b76da70dc54c288cffea4ecaf837ebb6ed9264664bf5c9a1fc79aa074`；原網址 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/leather_white/leather_white_nor_gl_1k.jpg`。
- `fabric-pattern-05-normal-1k.jpg`：903085 bytes，MD5 `9cf8fe9343eb29021eb0bf9faf174e0c`（與作者公開API一致），SHA-256 `caa5a948c768c7173b1d8647aa2618d39b4ec5ba4575820e02fb500dac54596d`；原網址 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fabric_pattern_05/fabric_pattern_05_nor_gl_1k.jpg`。
- 兩張 1024² 貼圖共估計 10.67MiB RGBA＋mipmap，非實際VRAM；major-only 有界app cache借用，POV只釋放私有材質，legacy不下載。原RGBA程序微表面仍作來源未備妥的回退，完整載入後停用重複bump支路。
- ESMO原創手套掌背／指節墊片、車線與袖口分區沿原私有geometry修改，不改作者source geometry。袖輪廓新增腕部壓縮／肘部折線與袖口厚度；不新增Mesh／runtime骨架／燈光或模擬事件，原每手1800tri保留。

## 第一人稱素織布／皮革色彩追修（2026-10-05）

- 素織布採用 [Terlenka](https://polyhaven.com/a/terlenka)，作者 colormass（Photography）／Rico Cilliers（Processing）；皮革沿用上述 Rob Tuytel 的 Leather White。均依 [Poly Haven 官方 CC0](https://polyhaven.com/license) 使用原資產下載檔，無重新壓縮或圖片編輯。Fabric Pattern 05 法線保留歷史來源，但新版不載入；其棋盤格 albedo 未採用。
- `terlenka-colour-1k.jpg`：691195 bytes，MD5 `202624e89023d9ace2845b372015490c`，SHA-256 `74c4333ed05e133928b0cf6d52e732135c8c0ce6dc8623efa590fb31b90f15c0`；原網址 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/terlenka/terlenka_diff_1k.jpg`。
- `terlenka-normal-1k.jpg`：877301 bytes，MD5 `88d445044fb8519c516c97acabf93ef1`，SHA-256 `05d7152ff680a6699018f5c37456a14e16eb1e70014a79d4d500dfd2e099c8f9`；原網址 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/terlenka/terlenka_nor_gl_1k.jpg`。
- `leather-white-colour-1k.jpg`：728363 bytes，MD5 `a580e1c45d806a56d89331f9a549ecb2`，SHA-256 `4d916dfe89c9d2b88bf52e0c70c6a9798a5c29c8c2fcb6ba1ab7b7ded9ef3ed5`；原網址 `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/leather_white/leather_white_diff_1k.jpg`。
- 以上 MD5 均逐 byte 對照官方 `/files/<id>` API。色彩以 sRGB、OpenGL法線以 NoColorSpace 載入；袖 UV 按官方 Terlenka dimensions 265.708×266.300mm 換算，制服色仍讀原 actor 材質並 copy，不改來源色。袖上原創肘部補強區與接縫、斜向壓皺保留同一私有 geometry，無新 Mesh／燈光／模擬欄位。
- 最新只載入皮革及素織布各一張 colour／normal；原JPEG皮革1024×1024、素織布1024×1026（官方1K標籤不是方形保證），共估計21.35MiB RGBA＋mipmap，非實際VRAM。相較前版增加兩張色彩圖約10.68MiB；所有法線方向／sRGB資料與借用生命期不變。只 major-only 有界 app cache 借用，POV不釋放借用texture；legacy不下載。原 private RGBA fallback 一次釋放測試與每手1800／整套私有5200tri上限保留。未以素材接線宣稱品質完成。
- 原 albedo 線性RGB平均（逐像素讀原JPEG，沒有修改圖片）：Terlenka `[.5599919667,.4279488581,.3184268931]`，Leather White `[.3040372419,.2905569558,.2157295487]`。材質 tint 使用各通道平均的倒數校正，保留制服原actor色與手套原vertex配色的平均明度，保留原作者局部織紋／皮革磨損；避免把原有制服再次乘上米色／棕色而壓暗。不是新增燈光或改actor來源材質。
- ESMO原創車線遮罩：128² RGBA私有DataTexture（65536 bytes，無mipmap），按同一真手UV的米制座標對齊四個原創護墊，透明背景保留原CC0皮革；僅縫線／護墊有覆色。標準PBR材質單次shader注入，固定customProgramCacheKey、無時間uniform／額外draw／Mesh／燈光。POV共享一份私有遮罩給左右手並在dispose只釋放一次；原作者JPEG無修改。最新browser shader編譯及可讀性仍待驗證。

- 正式軸向成品GLB SHA `afab27895b8bba29b8843a2f4fe5d9ecbde2276f4c6f897dc3415eb1e9cb4f48`，含來源+Y／真握點extras。首輪未設定export_extras，新增來源證據檢查36/37紅燈，保留原log及候選；補實際來源metadata後37/37，不移除檢查或放寬幾何門檻。

## 人物連續布料與腕口追修（UTC2026-10-05／台灣2026-10-06）

- 同兩張原Terlenka colour／normal延伸借用到major人物上衣、褲與布製背包；沒有新增圖片、重新壓縮、修改作者JPEG、紋理transform或legacy下載。rigid及SkinnedMesh私有材質各自校色，原制服color保持原值；固定shader均值補償與POV共用常數，避免POV再次複乘。
- 原CC0人體衍生geometry新增7432頂點×3×4=89184 bytes的私有共用colour欄位；按原bind手骨／前臂骨定位20mm腕口過渡，深色手套連續插值，不使用原superhero塗裝，也不增加三角、骨架或draw。原source geometry／65骨／權重不變；geometry依原末一actor引用釋放。
- POV手套採較暗中性色；原17徑向節點最近縱縫角距的sin約.092，修正.08未落在節點的接縫判斷為.12，仍同5118私有tri。背包蓋與織帶跟隨同一major後移，避免埋在包體內。外觀仍需全圖審查，不能由接線推定達標。

- major正面assault肩墊／support胸包／marksman肩墊僅呈現身份；不改模擬角色或原資料。軟包／護具採原創封閉44tri真倒角，六個面、十二條邊、八角，維持22000整人／17000本體／5200 owned／8材質預算；legacy原RoundedBox幾何不變。

- UTC2026-10-05／台灣2026-10-06：原CC0布料JPEG未改，新增原創bind-space細摺與雙線topstitch shader，nominal1.6mm，真表面導數擾動normal、隨原蒙皮穩定，不加texture或Mesh。POV原袖幾何減環形鼓起、增加袖口厚度；5118私有tri與原骨架／source／budget不改。正面既有肩墊與胸包調整主要輪廓，不新增小配件。

- CC0 GGBotNet SMG-10的原始單steel slot衍生ESMO原創receiver panel與握把grooves shader、橡膠／鋼roughness及metalness分區；只在major有界借用材質池，2708tri、geometry／UV、真socket與原GLB byte不改，零新增texture／Mesh／draw。此為槍族美術追修，仍不是官方MP9逐槍還原。

- major頭具按真CC0頭／Eyes bounds修正：球帽從68%殼修為上半球，T前band移至眉上，讓原65骨臉與Eyes露出；legacy原殼與band不變，不新增geometry成本或更換來源。


## 2026-10-06 POV可見拼片與SMG分區候選

- POV只修改私有袖的既有頂點色：3cm袖口帶與中段補強拼片；在原布料helper上加同一shader的袖口雙車線／拼片邊，不新增Mesh／Texture／tri。手套原64KiB透明車線遮罩增大掌背／指節護片的可讀範圍與灰綠層次，原RGBA大小／來源JPEG不改，護片與布面粗糙度分區；不是新來源素材。
- 原CC0 SMG-10仍2708tri、GLB逐byte未改。ESMO材質分區加機匣側面凹口／邊緣光、握把rubber區有下界，避免將整支真彈匣錯染橡膠。POV整組（槍／雙手／袖）上移6cm以保留真彈匣畫布讀感，不改武器長度或任何simulation數值。所有視覺效果需同版GPU／實圖驗證，尚不宣稱達標。

## 2026-10-06 內前臂拼片方向與近景材料

- 私有袖仍24環×17徑向段、每袖782tri、全POV owned5118tri≤5200；原頂點環集中於四道非對稱壓褶，原JPEG、UV物理尺度、Mesh／Texture數量與手部素材不改。近景袖獨立設定5mm布面摺痕與12%明暗層次，人物制服／背包仍用原1.6mm／4%，只改私有材質shader參數。
- 原袖只對齊肘腕軸，沒有roll，內前臂拼片在五種槍姿都落在視角背面。現在按原手掌+Y面投影到肘腕軸的垂直平面，對齊內前臂裁片與接縫；跟隨真手姿、暫停與保存換彈進度，不追隨鏡頭、不改握點或腕端位置。原POV37內補獨立幾何對齊斷言，原腕點誤差及成本門檻保留。
- 台灣2026-10-07：完整101圖複審仍指出POV袖自然張力不足。只改私有24×17袖頂點：前臂增加布料鬆量、四組不等寬／不等深斜壓褶與捲邊、周向錯位與軸向起伏；端環及肘腕中心保持，owned5118tri／5200上限不改、不增加Mesh／材質／Texture／draw。UV從Lathe的環索引改成實際表面米數，避免密集腕環將來源織紋沿軸拉長；原CC0 JPEG與手部素材不改。尚待同版GPU／原圖複審，不能以新幾何存在宣稱品質完成。
- 同日完整78圖複審仍退回管狀袖、手／手套與人物正面輪廓。新候選改用ESMO原創離線Blender布料：50cm未壓縮布料、固定肘／腕兩端在20幀內收至42cm，60幀接觸前臂後凍結、簡化為每袖779tri；未壓縮布面依原Terlenka265.708×266.300mm建立UV並保留縫口loop，原CC0 JPEG不改。`fpsDrapedSleeveData.js`只保存位置／法線／三角面／UV；runtime複製私有BufferGeometry，不增加solver／Mesh／材質／Texture／draw。原端點frame與roll維持，移除前臂大平面補強色塊，車線shader保留。尚待新同版Node／GPU與完整獨立複審，不宣稱自然布料已達標。原離線pin不精確失敗與恢復實驗留在ignored evidence，不提交作者工具／log／blend。
- 離線布褶首次桌機58/58 PASS，但POV凹褶明暗仍弱。只對同779tri幾何用Cycles CPU烘焙4cm半徑／32sample局部self-AO，402頂點實測AO範圍0.4390625–0.9974609375；runtime沿原vertexColor乘`.25+.75*AO`，有正下界、不靠鏡頭／事件另算，不新增AO pass或貼圖。此資料不是品質分數；新source須另收實圖／複審，不挪用未含AO的GPU成績。
- crookedmouth CC0 shotgun原3047tri／GLB／socket逐byte不改；其原單steel slot借用材質加入ESMO原創木製前托／握把、細木紋與止滑刻紋，鋼／木粗糙度與金屬度分區。沒有作者貼圖修改、額外Mesh／Texture／draw，與人物及POV共用同一有界lease。此為代表槍族的原創呈現，不是官方Sawed-Off逐槍還原；同版GPU／實圖品質尚待驗收。

- 2026-10-07 真腕軸診斷後，Major私有POV袖新增原創離線布版：54cm布收至42cm，100幀前臂碰撞／自碰撞，袖口30mm半徑依真CC0手腕26.475mm加衣料餘量、肘端60mm；彎曲stiffness .035，固定端點，簡化780tri／404頂點，原休止布物理UV與Cycles4cm／32sample self-AO（.039388–.998047）有界頂點色。零runtime solver／AO pass／Mesh／Texture／draw；每袖原782tri及POV5200上限保持。離線原圖／blend／候選／完整logs保留於ignored evidence/offline-sleeve-fitted-cuff-20261007，不宣稱美術PASS。真手原來源GLB/JPEG未修改；手+Z腕軸沿實際肘方向、掌向內、真socket及換彈／pause幀保持。
