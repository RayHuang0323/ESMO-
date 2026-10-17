# B7 真腕軸接續候選完整獨立複審

唯讀 `b7_wrist_axis_fixed_fresh_review` 逐張以original查看46/46 PNG（D23＋M23），另看3/3校準anchors；只讀完整inventory、同版metrics／pixels及原量表，未讀source／歷史review／checkpoint、未改檔案／重跑測試。before未提供，不推論改善。

來源fd8b70b4ac88942dffee5c2fbb7e18b4f792236563342493a4ee26cac347cb31／58檔，bundle0038524d2aa7147604c924a2297a3713ffaae24714cfa32c09b8bbfdb7cac85a。完整inventory `evidence/b7-wrist-axis-fixed-full-capture-inventory-20261007.json`。不適用後續4b80離線袖口版。

## 原十類

| 類別 | 分數 | 圖證及限制 |
| --- | ---: | --- |
| Art direction | 2 | active／pov砂岩、水務工業、青灰金屬及戰術服裝一致，仍缺專屬身份。 |
| Hero/player | 2 | 六身份連續衣身、手指、護具、背包及姿態可見；ct1 front面部／耳機／護臂仍塊狀。 |
| Obstacles/enemies | 2 | 桶箱拱架及裝備有變體，detail辨敵方／健康；不能證時序。 |
| Rewards/interactables | 1 | active／overview有A/B、倒地角色／槍，C4主要文字，未见兩種完整操作形態。 |
| World/environment | 2 | 牆窗、拱架、屋頂、桶箱及前中後景，overview外圍平且樹稀疏，模組重複。 |
| Materials/textures | 2 | 石磚、礫地、波紋金屬、槍械面板可辨；衣服／面部較平，木箱尺度不一致。 |
| Lighting/render | 2 | detail／pov接觸陰影與深度；D pov槍火大片過曝。 |
| VFX/motion | 1 | 有槍火／曳光、M環形提示，只證少數瞬間，未證完整事件與時序。 |
| UI/HUD | 1 | 比分、回合格、HP、彈藥可辨；M pistol通訊／回合框遮準星，人物卡遮腿，卡片感。 |
| Performance | 2 | 有全圖及active量測；calls超預算、无before／真機／可見取捨，不給3。 |

總分17/30，平均1.7，四類<2；不支持Premium／AAA／Showcase。Root採用此獨立結論，不把少數已看的圖冒充另一份完整評分。B仍未放行。

## 五族／手與衣物

五族pistol、rifle、shotgun、SMG、sniper皆2。銀滑套／握柄、長步槍護木／彈匣／托、霰彈雙管／木握柄、緊湊SMG機匣／框形後部／長彈匣、狙擊管／鏡／木托可辨。步槍黑細節偏暗、SMG較方；M pistol中央遮擋、M sniper重置鈕覆槍托。

左右手、手套、第一人稱袖、第三人稱袖各2。可辨握柄手與支撐手，未見整臂斷開或明顯反折；遮擋仍不能證全部握點／腕軸／換彈。手套有指節／明暗／黑袖口，但皮革細紋／縫線弱；128²seam與1k素材存在不等於可見品質。POV袖青藍／綠與車線可辨，仍長直、缺肘摺層。第三人稱連續、彎肘可讀，近景布平、護臂交界硬。

換彈姿態1：只有D/M各pistol／sniper凍結狀態，pistol左手多在画外；不能證抓彈匣、插入、復位或完整連續動作。

| 身份 | 正／背 | 理由 |
| --- | --- | --- |
| CT1 assault | 2／2 | 胸彈匣、硬護臂、板包；臉／護具仍方。 |
| CT2 support | 2／2 | 手槍、重腰具、背軟包分段。 |
| CT3 marksman | 1／2 | front實際偏側背，M屋面遮腿，正面證據不足；窄長包／臂帶可辨。 |
| T1 assault | 2／2 | 褐護臂／黑板包；面部共用感。 |
| T2 support | 1／2 | 正面近T3、靠文字，軟綠包／腰包清楚。 |
| T3 marksman | 1／2 | 正面獨立輪廓不足，背長縱綠包／側黑板不同。 |

## UI具名與自動失敗

- M pistol五行通訊進中央準星／路徑，回合開始框重疊；**UI overlaps play path**已成立。
- M operator底部卡遮腿腳（CT1正背、T2背尤清楚）；M sniper及pistol／sniper reload重置鈕覆手／武器。
- M rifle／shotgun左人名及CT2背右上健康條切邊，屬world-label裁切，不冒充真機safe-area結果。
- D POV爆光遮牆邊／槍火來源；M當刻無同等爆光不推論更優。

有active圖、renderer及imported asset diagnostics，不能說主角全default primitives，也不把模組化直接判自動失敗。真輸入可玩性與手機safe area未由靜態圖證明。

## 像素量測

順序entropy／dominant／edge／contrast。D active3.721366／.195932／.030730／89，detail3.585558／.243829／.058067／88，overview3.270351／.406616／.027031／70，POV4.276040／.185589／.064638／158。M active3.739989／.190025／.033359／93，detail3.687151／.182586／.045056／100，overview3.445764／.285031／.030255／77，POV4.099131／.153941／.035098／134。

全23圖範圍D entropy3.270351–4.348360、dominant.151028–.406616、edge.024314–.092068、contrast70–184；M3.401581–4.209952／.150409–.315424／.022641–.055717／77–187。edge<.04：D8/23、M15/23，支持World／Hero不給>2，非單獨失敗。自製fallback非官方inspector。各23/23 MEASURED／無error。

## Renderer與限制

| 指標 | D1366 | M390 |
| --- | ---: | ---: |
| calls P50／P95 | 434／444 | 442／450 |
| triangles P95 | 214470 | 210098 |
| geometry／textures | 348／38 | 348／38 |
| materials／meshes／instanced | 985／1253／2 | 985／1253／2 |
| texture估MB | 74.39 | 70.39 |
| calls advisory | 300 | 150 |
| active FPS／p95ms | 55.20／33.30 | 59.19／16.80 |

均OVER_ADVISORY_TARGET。同AMD桌機GPU，M是窄版／品質層模擬，非真手機；量測限定active、不扩張gallery/VFX peak，不隱藏D55.20FPS／33.30ms。兩版各52/52技術PASS／native0，D96837ms、M95294ms，不能代替CS美術品質。

不能證其他地圖／seed／時刻、完整動態與腕軸、實際輸入、before→after或真機FPS／觸控。下一pass：中央通訊／人物卡遮擋、CT3有效正面構圖、T2/T3正面識別、互動物狀態與可核對calls取捨。
