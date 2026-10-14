# B7 受壓袖 geometry 完整獨立視覺審查

來源 `944719f9f66e9582636d89ae3e51a2cb41a53f1c8081264d8892ca3f7cc9a8ab`，57檔。唯讀 Fresh-Eyes `/root/b7_compressed_sleeve_fresh_review` 看完46/46原始PNG與3/3原量表anchors；只讀兩個集合的metrics／pixel JSON、原量表，未讀source、handoff、歷史或既有分數，未操作browser／修改圖片／寫檔。Owner保存本文，不套用後續garment-depth候選。

完整集合：`evidence/phase-b7-compressed-sleeve-desktop-mirage-20261006/1366`（D）與`evidence/phase-b7-compressed-sleeve-mobile-mirage-20261006/390`（M），各23張：active／overview／detail／pov4張、五槍族、pistol／sniper兩張reload、CT/T各三身份正反12張。兩寬各46/46技術PASS／exit0；各23/23像素MEASURED／0error／exit0。此輪沒有前三張handling capture，不宣稱涵蓋舊57項／52圖。before全NOT_PROVIDED。

| 原十類量表 | After | 原圖證據與限制 |
|---|---:|---|
| Art direction | 2 | 砂色水務、青灰屋頂、隊色與裝備一致；未形成每表面獨特身份。 |
| Hero/player | 2 | 五槍／雙手／operator有人體與裝備層次，非primitive stack；袖子、通用頭身仍限制3。 |
| Obstacles/enemies | 2 | 桶、箱、門洞及六套裝備可辨，缺連續anticipation／telegraph。 |
| Rewards/interactables | 0 | 沒有原量表既有目標互動前後足夠證據，不要求新增loot。 |
| World/environment | 2 | 屋頂、拱梁、塔、窗、水池及景深；場外稀疏與盒形重複限制3。 |
| Materials/textures | 2 | 石、地、木、金屬與槍有材料角色；布袖、槍托及部分裝備偏平。 |
| Lighting/render | 2 | 日光、接地陰影、前後深度可讀，未具展示級電影感層次。 |
| VFX/motion | 1 | reload姿態與黃準星可見，靜圖缺射擊／命中連續證據；active muzzleEvents0。 |
| UI/HUD | 2 | 比分、回合、播放、POV與資訊有類型語意；局部遮擋／低對比小字仍待。 |
| Performance evidence | 2 | GPU／renderer／來源／成本／兩寬全像素都有；缺before、真機、全狀態與超advisory取捨。 |

合計 **17/30＝1.7/3**。原固定分母、不排除缺證據類別，未達Premium每類≥2且平均≥2.3。未有3分項。

五槍族：pistol2／rifle2／SMG2／**shotgun1**／sniper2。各有可辨槍形，shotgun機匣／管部／材質正常畫面較單薄，像簡單組件；深色rifle機匣／槍托與sniper平色木托仍有材質缺口。左右握持各2、手套2：可見分指／指節／袖口細縫，未見明顯分離，不能因此證精確手勢或連續無穿插。**袖1**：常態rifle／shotgun／sniper多讀成平滑長管、柔和明暗、淡縫，肘部壓褶不突出；M SMG微弱縫／折光不能代表整套。Reload可見狀態1：只有pistol／sniper靜圖與0彈提示，其他三族NOT_MEASURED_NO_RECORDED_RELOAD，不能標PASS。資源shader存在不推翻正常尺寸觀察。

CT/T assault正反各2；CT/T support與marksman正面1、背面2。三身份靠肩／背／腰配件區分，正面頭身通用；CT3實際偏側面，M資訊卡／前景遮下肢，不能稱完整全身剪影。陣營藍／綠與頭戴可辨。

完整底部核對：D/M pov、全部五槍gallery與兩张reload均看得到返回觀戰、✕、選手資訊，不能報控制缺失。M pistol回合開始提示與聊天文字相交；M operator卡遮腿，T1 rear聊天遮背板。povPanel不相交與不overflow只證底部面板和canvas矩形分離，不證全HUD無遮擋。D面板可延伸視口外，實際滾動／操作需另驗。

| opening active 指標 | D | M |
|---|---:|---:|
| 秒／frames／FPS | 10.0062／477／47.6704 | 10.016／590／58.9058 |
| p50／p95／p99／max ms | 16.7／33.5／83.3／183.3 | 16.7／16.8／16.8／216.7 |
| calls p50／p95 | 425／426 | 423／423 |
| advisory calls target | 300 | 150 |
| triangles p95 | 216106 | 210870 |
| geometries／textures | 340／33 | 340／28 |
| materials／meshes／instanced | 985／1253／2 | 985／1253／2 |
| texture estimate／heap MB | 74.3927／161.7461 | 70.3927／164.9640 |
| coldReady ms | 14353 | 7630 |
| DPR／shadow | 約1／2048 | 1.5／1024 |

皆AMD桌機ANGLE D3D11，page／console error0，不是真手機。state是opening，不與前版combat冒充受控A/B。calls為OVER_ADVISORY_TARGET，不能稱預算PASS。coldReady包含模擬與資產。暫停POV另D60.2931FPS／calls244／167537tri／p9516.7/p9916.8/max17.4；M52.2098／calls157／142408tri／p9516.8/p99116.6/max150，不能取代active。兩種已測state範圍calls157–426／tri142408–216106；不是全23圖成本掃描。textiles快照geometries344、textures D37/M35；source weapon tri2243／2708／3772／3047／5388、private5118、有來源／CC0資料，不能拿來提高藝術分數。

全部像素cs-major-pixel-audit.v1為自製fallback：512 RGB bins entropy、相鄰luma差>16 edge、非線性luma p95−p05 contrast；原PNG未裁切／另存。D每圖703851像素1119×629、M646020像素740×873（scale2），各23measured／0notMeasured／0error、CRC驗證、透明排除0。

| 全23圖範圍 | D | M |
|---|---:|---:|
| entropy | 3.288198–4.352759 | 3.313045–4.239471 |
| dominant share | .149601–.397735 | .152179–.312507 |
| edge density | .023940–.092177 | .022124–.055798 |
| luma mean | 74.113980–113.650309 | 66.508522–105.657220 |
| contrast | 73–182 | 87–187 |
| dark clip | .000011–.059912 | 0–.070713 |
| bright clip | 0–.000080 | 0–.000512 |

全部原始逐圖值在各pixel-metrics.json。edge<.04為D7／M14，包含所有常態五槍，支持大片天空／牆與近景材料弱的保留，不單憑像素判geometry壞。CT3 rear深色clip各5.9912%／7.0713%值得保留。

自動失敗／缺證據：已見局部HUD聊天／卡片遮內容，不能宣稱全部UI無遮擋；未證primitive-dominant、hero只有primitives＋glow、單一敵人剪影或霧遮缺幾何。已提供active與renderer／來源成本。真input、真機safe area／觸控／FPS、before、事件動作連續性、超advisory取捨、全狀態成本仍缺。不是產品功能失敗的推論。B7仍未放行；下一步常態袖壓褶／裁片與shotgun材質、D消除提示聊天重疊，按全圖再驗。


## 2026-10-12 舊 CS archive 停用索引

此頁較早的候選 archive 連結屬歷史取證。E 收件後 root 僅按明確清單清理淘汰建置；原圖、完整 stdout／stderr、native exit、gate／metrics、來源與 bundle 指紋均保留。原失敗及分數不改寫，唯一恢復點及目前可用版本保留；實際刪除結果以 RESUME_CHECKPOINT.md／Owner Review 為準。

對應來源、結果與保留證據請從[歷史 archive 索引](evidence/retention-policy-20261011/e-approved-root-review-history-v2.md)接續；不可把已停用 archive 的舊連結當作目前預覽。
