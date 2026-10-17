# B7 拼片／機匣凹口候選獨立視覺審查

來源 `800c385f273a6745a570f347a59e179351e0cf84f5b70f0a856bb2888c256c1a`。唯讀 Fresh-Eyes `/root/b7_panel_port_fresh_review`，未讀 source、handoff、歷史、其他 review 或既有評分，未操作 browser、修改或處理圖片。逐張檢視兩寬各26原圖，共52/52 PNG及3/3 anchors；另讀全部 metrics／52筆像素資料。Owner 保存本文，不挪作後續版本評分。before 全部 NOT_PROVIDED。

完整圖集位於 `evidence/phase-b7-pov-panel-port-desktop-mirage-20261006/1366`（D）及 `evidence/phase-b7-pov-panel-port-mobile-mirage-20261006/390`（M）。各57/57技術PASS／原生exit0、26/26像素MEASURED／0error，不能代替視覺或手機實測。

| 原十類量表 | After | 證據與限制 |
|---|---:|---|
| Art direction | 2 | active／overview砂岩、青綠鐵皮、水務設備與隊色呼應；局部敘事與細部造形仍有限。 |
| Hero/player | 2 | assault前後與五槍族有完整人物、握持、裝備及槍形；附件厚塊、臉部及衣料層次仍有限。 |
| Obstacles/enemies | 1 | 三身份需gallery放大才能區分，正常active距離主要靠隊色／標籤；缺telegraph／anticipation連續證據。 |
| Rewards/interactables | 0 | C4持有文字與A/B標記不足以證明實體、安裝／拆除前後。缺證據，不要求新增loot／pickup玩法。 |
| World/environment | 2 | overview／detail有拱梁、槽、塔、路徑與屋頂機械；平直牆、矩形建物及場外平地仍多，未到scene-3。 |
| Materials/textures | 2 | 石、地面、金屬、木箱、皮手套有材料角色差異；石材重複強，袖子及裝備仍常讀成平色。 |
| Lighting/render | 2 | active／pov陰影和遮蔽有深度；略灰、深藍人與黑槍分離有限。全組contrast最低71／77，不支持整體不可讀判定。 |
| VFX/motion | 1 | reload姿勢與黃準星有狀態提示；沒有連續換彈、發射、命中與轉場影片，active muzzleEvents=0。 |
| UI/HUD | 1 | 比分、回合格、HP／彈量有觀戰語言；四張M gallery未見完整返回／關閉／資訊控制，部分姓名／血條被邊界截去。 |
| Performance evidence | 2 | 有renderer、frame分位、資源與全像素資料；缺真正before/post、真手機及超calls預算取捨證明。 |

合計 **15/30＝1.5/3**，未達每類≥2、平均≥2.3的最終Premium門檻。沒有3分項；技術PASS不代表藝術完成。

五族外形均2：pistol滑套／槍口／握把；rifle長管／機匣／瞄具／槍托；shotgun短雙管；SMG短機匣／長直彈匣，390下端完整可見但表面偏平；sniper長管／鏡／褐色開孔槍托。各為一支代表槍，不代表所有變體。右主握2、左支撐2、手套2；手指、接觸、指節／袖口／接縫可讀，但遮擋角度不能證扳機精確接觸或連續動作無穿插。**袖子1**：長前臂仍像平滑直管，正常尺寸看不穩定織紋／褶皺。pistol／sniper有真保存reload截圖；其餘三族 NOT_MEASURED_NO_RECORDED_RELOAD，靜圖不證明完整動畫。

| 身份剪影 | 正面 | 背面 |
|---|---:|---:|
| CT assault | 2 | 2 |
| CT support | 2 | 2 |
| CT marksman | 1 | 1 |
| T assault | 2 | 2 |
| T support | 1 | 2 |
| T marksman | 1 | 2 |

隊伍區分2。marksman圖偏側斜、390前景遮腿，不能據gallery推定戰場身份可讀；圖名variation不等同卡片職務或gameplay職責。

M 的 `weapon-gallery/mirage-rifle.png`、`mirage-smg.png`、`mirage-sniper.png`及`weapon-reload-gallery/mirage-sniper.png`只有名字／槍／HP／彈量可見，返回觀戰／✕／選手資訊未見。標準povPanel量測D canvas64.969–694.969、panel702.969–818.302；M canvas152.969–589.563、panel597.563–712.896；均不相交、不水平溢出、控制44px。該單一狀態不能覆蓋上述四張圖；尚不能宣稱按鈕功能失效或推定根因。

| active 十秒量測 | D | M |
|---|---:|---:|
| 秒／frames／FPS | 10.103／560／55.43 | 10.016／569／56.81 |
| p50／p95／p99／max ms | 16.7／16.8／33.4／200.1 | 16.7／16.8／17.3／200 |
| calls p50／p95 | 434／444 | 442／450 |
| calls advisory target | 300 | 150 |
| triangles p95 | 214496 | 210156 |
| geometries／textures／materials | 348／38／985 | 348／38／985 |
| meshes／instanced | 1253／2 | 1253／2 |
| texture estimate／heap MB | 74.39／179.62 | 70.39／164.68 |
| coldReady ms | 10440 | 9537 |
| DPR／shadow | 約1／2048 | 1.5／1024 |

兩者均AMD桌機GPU、10/10 rigged、page／console error0。calls超advisory為風險，不自動算PRODUCT_FAIL。暫停POV額外raster量測D53.91FPS／calls323／185595tri、M51.25FPS／calls319／179737tri；不同狀態不能作before/post。獨立範圍不含後續60秒樣本，Owner另保存6/6 PASS、59.885FPS／p95與p9916.8ms／max150ms、一次self-longtask162ms；保留上表短樣本尖峰。

像素為自製fallback，不是官方inspector：512-bin RGB entropy、相鄰luma差>16的edgeDensity、非線性luma p95−p05 contrast，完整canvas與viewport交集，透明排除0。D每圖1119×629、M740×873（PNG scale2）。D全26張entropy3.304246–4.350680／edge .023918–.126833／contrast71–184／dominant .147533–.396598／darkClip .000010–.061733／brightClip0–.000080；M全26張entropy3.399080–4.229059／edge .022107–.055651／contrast77–187／dominant .150593–.315165／darkClip0–.074623／brightClip0–.000580。低edge<.04為D8／M18，不能單憑像素判primitive-dominant，也不能以高值證authored幾何。

已見active、renderer diagnostics、多掩體剪影；沒有充分證據判整場primitive-dominant、hero primitive stack＋glow或霧／黑暗掩蓋。仍缺real input獨立操作、全部UI狀態與320／360／430、安全區與真手機FPS／觸控、預算取捨、拓撲／穿插、既有C4及連續事件動作；缺證據不改寫成產品壞掉。

下一步：核對M各POV控制差異；完成袖子可見輪廓／材質層次及必要身份剪影；補既有C4、連續射擊／命中／換彈與效能取捨，保留未錄到的三族reload狀態。B7未放行，C／D／E尚待，未READY_TO_REVIEW。

Owner覆核中：直接view_image上述M rifle原圖，面板實際可見「返回觀戰」、✕與「選手資訊」。已要求原審查者重看四張指定原圖並核對判讀；原始分數暫保留待其修訂，不能依未確認finding修改產品或宣稱控制壞掉。


Owner覆核補充（2026-10-05T18:42:17.444Z）：原審查者重讀後撤回rifle／sniper reload缺控制，仍稱SMG／sniper未見；Owner直接view_image這兩張原圖均可見返回觀戰、✕與選手資訊。原檔未被Owner改動；不臆測工具顯示原因，該finding不成立於Owner可見證據，不據此改產品。獨立原始分數保持，不套用944719新候選。
