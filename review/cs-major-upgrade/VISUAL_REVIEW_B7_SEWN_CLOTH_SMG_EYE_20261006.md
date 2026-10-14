# B7 細摺／SMG／眼部候選完整獨立視覺審查

台灣2026-10-06；來源 `3ae20faf46264e845782854bcb0a14df1fd07d3c082714b0c865151e179a5f1e`。唯讀 Fresh-Eyes `/root/b7_sewn_cloth_smg_eye_fresh_review`，fork_turns=none，逐張view_image檢視52/52原圖與3張量表校準圖；只讀兩組metrics／pixel JSON與原scorecard，未讀source、handoff、歷史或舊分數，沒有寫檔或跑browser。本文由Owner保存，不套用後續手槍組裝修正版。

完整圖集：`evidence/phase-b7-sewn-cloth-smg-eye-desktop-mirage-retry-20261006/1366` 與 `evidence/phase-b7-sewn-cloth-smg-eye-mobile-mirage-20261006/390`，各26圖。各有active／detail／overview／pov、crouch及兩種reload、五槍族、pistol／sniper真保存reload、兩隊三身份全正反共12圖。各57/57技術PASS／原生exit0、26/26像素MEASURED／原生exit0；不是視覺PASS、連續動畫或真手機驗證。before均NOT_PROVIDED。

| 原十類量表 | After | 原圖判斷 |
|---|---:|---|
| Art direction | 2 | active／pov砂岩、水務設備、金屬棚與隊伍配色一致；人物簡化與高頻石材尺度仍不完全統一。 |
| Hero/player | 2 | ct1／t1 assault-front有人體、手指、護具及裝備層次；臉、靴、護具仍簡化。 |
| Obstacles/enemies | 1 | t2／t3-front頭身與持槍剪影相近，戰鬥距離難辨三身份；未有完整telegraph證據。 |
| Rewards/interactables | 0 | 只有C4持有者及A／B標誌，缺既有兩種互動前後證據；不代表應加任務外蒐集系統。 |
| World/environment | 2 | 棚、拱梁、槽、屋、桶箱有空間層次；外圍稀疏、長牆與地面重複。 |
| Materials/textures | 2 | 石、木、金屬與背包布面可辨；POV袖與手套多讀成平滑色塊。 |
| Lighting/render | 2 | 世界投影／角色明暗可讀；桌機pov左下射擊光過亮壓掉細節。 |
| VFX/motion | 2 | detail／pov有射擊光、彈道與窄版受擊環；靜圖不能證連續流暢或節奏。 |
| UI/HUD | 2 | 分數／回合／觀戰／播放可讀；窄版角色卡遮腿、重新置中鈕遮手槍，工程文字仍待D清理。 |
| Performance evidence | 2 | 有renderer、frame times與全部像素資料；缺before、預算取捨與真手機。 |

平均 **17/30＝1.7/3**；不達每類≥2且平均≥2.3的最終Premium門檻，未有任何3分項。B7亦未放行：SMG／手套／袖仍1。互動證據與HUD問題保留C／D／E工作，不為湊分新增任務外玩法。

五槍族外形：pistol2／rifle2／SMG1／shotgun2／sniper2；各族左右握持各2，但精確指節接觸與連續換彈未證。SMG短機匣／環狀槍托可辨，側面大平板及下垂彈匣在POV延伸至畫布下緣；不能單憑圖斷言真模型長度錯誤。手套1：分指有體積，掌面／護片／縫線未穩定讀出。袖1：長袖平滑，袖口存在但拼片／受力摺痕弱。

兩隊三身份：CT assault與T assault正面2／背面2；CT／T support、marksman各正面1／背面2。寬肩甲／寬背板、鼓起背包、長窄背包有差異，正面依然弱。ct3-front偏側向且窄版有前景遮腿，證據較弱。兩隊整體辨識2：CT藍與T綠棕可區分。以上評可見形狀，不以圖名當成身份可辨。

| active實際指標 | 1366×900 | 390×844 |
|---|---:|---:|
| 秒／frames／FPS | 10.0122／534／53.33 | 10.0073／586／58.56 |
| p50／p95／p99／max ms | 16.7／33.3／33.4／216.6 | 16.7／16.8／17.2／200.1 |
| calls p50／p95 | 434／444 | 442／450 |
| advisory target | 300 | 150 |
| triangles p95 | 214496 | 210156 |
| geometries／textures／materials | 348／38／985 | 348／38／985 |
| meshes／instanced | 1253／2 | 1253／2 |
| texture估算／heap MB | 74.39／161.77 | 70.39／160.13 |
| canvas／DPR／shadow | 1120×630／約1／2048 | 555×655／1.5／1024 |
| coldReady ms／page與console errors | 13688／0 | 10273／0 |

皆AMD ANGLE D3D11桌機GPU；390 viewport不等於真手機。以上是active十秒，不擴充到全部52圖狀態。

自製fallback像素、非官方inspector：各26/26 MEASURED／0error。桌機全部entropy3.285958–4.349553、dominant .148223–.402406、edge .023969–.127205、contrast71–184；窄版entropy3.412990–4.216918、dominant .151029–.315232、edge .022203–.055689、contrast77–187。active桌機3.722672／.196002／.030670／90，窄版3.738204／.189994／.033180／93（entropy／dominant／edge／contrast）。桌機pov brightClip .030542；窄版ct3-rear darkClip .077406。像素不能證拓撲或槍形達標。

自動失敗與缺口：未確認整體primitive-dominant；有renderer與active截圖，不觸發這兩種缺證據型失敗。窄版重新置中與角色卡遮驗收內容，尚不能從觀戰靜圖斷定阻擋play path，不宣稱safe-area通過。320／360／430、真手機FPS／觸控／熱節流、reduced-motion、連續動畫及真實input完整可玩性尚未足夠證據。calls超advisory需保留取捨與後續實測，不放寬門檻。

優先：改善SMG機匣／彈匣讀感，手套與袖做可見材質層次，強化support／marksman正面整體剪影；C／D／E捕捉既有C4真互動、清除HUD遮擋並補尺寸與效能證據。不能再以不可見細線或微小配件當品質完成。

Owner補充（不改獨立分數）：後續唯讀原.blend矩陣及GLB檢查發現手槍匯出仍有根節點旋轉／位移，且逐件烘焙會改動其他零件依賴的父變換；修正候選與新的真槍口／握點回歸驗證正在進行。此後續產品證據不回填此審查。
