# B7 張力衣袖完整78圖 Fresh-Eyes

唯讀代理 `b7_tension_drape_fresh_review`：逐張view_image實看78/78原PNG與3/3 anchors；只讀本候選完整capture、metrics、pixels及原量表，未讀產品source、歷史review或checkpoint，未修改檔案／開browser／build。D、M、ML各26張完整集合；不是挑圖或拼接縮圖評分。

- D：`evidence/phase-b7-tension-drape-desktop-mirage-20261007/1366`
- M：`evidence/phase-b7-tension-drape-mobile-mirage-20261007/390`
- ML：`evidence/phase-b7-tension-drape-mobile-logged-mirage-20261007/390`
- root核對來源：ba9074e345c70a8557f1f9d07e61a827ed7fd0059e4accf3036993d67f235f67；bundle2b0f01fd8b1a2c1b8225d0095cc3917bc596d7dd69c379e43551b60daefc549b。這些關聯未提供給盲審代理。

## 原十類與保守採分

| 類別 | 獨立 | Owner採較低分 | 圖證與限制 |
|---|---:|---:|---|
| Art direction | 2 | 2 | 石材、水務設施、CT/T配色與電競HUD一致。 |
| Hero/player | 1 | 1 | 近景光滑肢體、大厚板／方包，手指與袖仍原型感。 |
| Obstacles/enemies | 1 | 1 | 臉、身形／持槍姿勢相近，職業主要靠附加包具，正面差異弱。 |
| Rewards/interactables | 1 | 1 | C4文字與場地標記，缺兩種完整authored互動物／取得狀態。 |
| World/environment | 2 | 2 | 有拱架、窗、屋頂、水塔、前中後景；外圍稀疏，石牆／屋頂重複。 |
| Materials/textures | 2 | 2 | 石、木、金屬有分工；近景布料、手套與設備層次弱。 |
| Lighting/render | 2 | 2 | 投影與接地可辨，未靠霧暗掩蓋；整體明暗較平。 |
| VFX/motion | 1 | 1 | 跑／蹲／抬槍／換彈取樣存在，單圖無法證明流暢與事件VFX完成。 |
| UI/HUD | 2 | 2 | 類型HUD可讀，窄版有資訊卡與重置提示遮擋。 |
| Performance evidence | 2 | 2 | 三組combat metrics、renderer／資產診斷；calls超advisory，無新長窗與真機。 |

獨立與Owner均16/30＝1.6/3。Premium原門檻每類≥2且平均≥2.3，未達；B尚未放行。不能以歷史1.9或技術綠燈抵銷本次具名缺口。不是因平均退步就假造產品regression，這是獨立視覺判讀。

## 五槍／手部／衣袖

五槍各2：pistol銀色滑套、rifle機匣／彈匣／槍托、shotgun短雙管／木握把、SMG短機匣／長彈匣／框尾、sniper鏡筒／長管／鏤空木托均可辨。rifle深黑吞細節、SMG方機匣、sniper切面接合仍偏硬。兩種reload圖只證明取樣姿態，不證明完整機械操作或全五族換彈。

手1、手套1：可辨分指，但指節／掌根／指尖仍圓管小塊感；掌墊、指節護片、布／橡膠分工不足。未宣稱完全無穿插。第三人稱袖1、第一人稱袖1：長前臂光滑且管狀，粗臂帶像硬環；褶皺更像均勻鼓包／壓紋，未清楚表達肘內壓縮、外側張力、袖口收束與重力垂墜。直接圖證為三組 `mirage-pov.png` 與全部 `weapon-gallery/mirage-{pistol,rifle,shotgun,smg,sniper}.png`。

CT/T陣營可辨，六身份正面均1；CT1/T1背面1，其他四身份背面2。CT1大臂包／胸三袋／平背板、T1沙色臂包／黑背板厚塊感重；支援寬背袋、狙擊長中央包能辨但正面高度相似。CT3部分圖是側後而非正背，M/ML左下前景遮腿，不宣稱角色缺失。

全部26 states逐張覆蓋：active/detail/crouch/handling POV reload/handling reload/overview/POV七圖，六身份front/rear十二圖，五槍gallery五圖，pistol/sniper reload兩圖；每state D/M/ML各一張，共78。

## 實測與自動失敗

三組pixels各26 MEASURED、notMeasured0、error0。fallback非官方inspector，不能代替藝術品質。

| 指標 | D | M | ML |
|---|---:|---:|---:|
| entropy範圍 | 3.274370–4.363116 | 3.396500–4.237220 | 3.397408–4.237244 |
| edge範圍 | .024029–.126625 | .022176–.055747 | .022176–.055658 |
| contrast範圍 | 70–184 | 78–187 | 78–187 |
| dominant範圍 | .148830–.405140 | .148954–.314239 | .148954–.315267 |
| edge<.04圖數 | 8/26 | 18/26 | 18/26 |
| FPS | 59.4435 | 60.0316 | 59.9838 |
| p95/p99 ms | 16.8/33.2 | 16.8/16.8 | 16.8/16.8 |
| calls p95／advisory | 444/300 | 450/150 | 450/150 |
| tri p95 | 214498 | 210156 | 210156 |
| texture估計MB | 74.393 | 70.393 | 70.393 |

348 geometries、38 textures、985 materials、1253 meshes、2 instanced。D DPR約1／shadow2048；M/ML DPR1.5／shadow1024。全部AMD桌機GPU／ANGLE D3D11；390px不是真手機。combat取樣不代表每張gallery效能，缺新60秒／before-after。全部entropy>3、contrast>60、dominant<.6，不支持霧暗壓縮；多數低edge支持簡化構圖，高edge也可能只是碎石紋理。

獨立審查確認UI overlaps：窄版選手卡遮下肢，POV／sniper「重新置中」膠囊遮袖／槍托，通訊與回合提示占部分場景。Owner保留這些改善項；單張卡片遮腿不直接證明輸入被阻斷，但也不能宣稱safe area完全通過。未確認整場primitive-dominant；世界有 authored題材層次，不能誇大為純預設幾何。真實輸入、連續動畫、完整互動與手機safe area未獨立驗證。

下一步針對自然受力布褶、手指／手套接合與六身份正面輪廓修正；維持成本與權威frame邊界。B藝術未過，暫不對此退回候選追加正式Worker／長窗來冒充完成；後續新候選再收同版證據。C/D/E未開始，最終Owner Review；真手機視覺／FPS／觸控／safe area未實測。


## 2026-10-12 舊 CS archive 停用索引

此頁較早的候選 archive 連結屬歷史取證。E 收件後 root 僅按明確清單清理淘汰建置；原圖、完整 stdout／stderr、native exit、gate／metrics、來源與 bundle 指紋均保留。原失敗及分數不改寫，唯一恢復點及目前可用版本保留；實際刪除結果以 RESUME_CHECKPOINT.md／Owner Review 為準。

對應來源、結果與保留證據請從[歷史 archive 索引](evidence/retention-policy-20261011/e-approved-root-review-history-v2.md)接續；不可把已停用 archive 的舊連結當作目前預覽。
