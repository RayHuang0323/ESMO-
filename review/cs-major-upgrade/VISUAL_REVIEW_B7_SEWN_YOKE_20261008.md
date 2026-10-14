# B7 寬面肩裁片 Fresh-Eyes：尚未放行

獨立 reviewer `b7_sewn_yoke_fresh` 只收到完整 capture set、scorecard 與 metrics／pixel-metrics／gallery metadata。實際 original 看完 D28＋M28＝56 PNG，另看3/3 anchors；未讀source／checkpoint／歷史review，未改檔或跑browser。沒有 before，不推論改善幅度。

資料：`evidence/phase-b7-sewn-yoke-desktop-20261008/1366`、`evidence/phase-b7-sewn-yoke-mobile-20261008/390`。各37/37、RESULT=PASS、native0；各28/28 pixels MEASURED、NOT_MEASURED0、ERROR0。全組包含每隊三身份的 front／rear／rear-left／rear-right，加 active／overview／detail／pov，不挑圖。來源與bundle以兩目錄metrics／build-manifest精確SHA為準。

每格為桌機／390視窗，各身份合併四角度的實際可見證據；遮擋區不補分。

| 身份 | 肩 | 肘 | 前臂 | 袖口 | 衣料 | 袖輪廓 |
|---|---|---|---|---|---|---|
| ct1 assault | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |
| ct2 support | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |
| ct3 marksman | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |
| t1 assault | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |
| t2 support | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |
| t3 marksman | 1／1 | 2／2 | 2／2 | 1／1 | 1／1 | 2／2 |

肩頂有小突起與局部暗線，但 front 仍讀成大面平滑鼓包，兩個背側角度也缺持續可辨的肩帽邊界，CT2 front／T2 rear-left 最直接。肘布面有轉折、收縮與縫線，硬護具未計分。前臂正面縱／斜縫與分片起伏可見，support最直接；被自身與装備遮擋的背側前臂無證據。手套／袖布交接仍是暗色連續體，缺布製收口厚度、翻邊或扣片／壓褶，marksman硬環不補分。大面衣料缺穩定織物細度、粗糙度差異與受力壓褶；背袋波紋不補袖分。袖輪廓有寬度、屈肘與向腕收束，但不支持3分。

active／overview人物尺度不足以判車縫；detail只支持大形；POV不挪為第三人稱證據。整體 E 十類≥2／平均≥2.3規則未改，本次不是十類整體scorecard。

| 診斷 | D1366 | M390 |
|---|---:|---:|
| FPS | 35.29 | 49.79 |
| calls p95 | 444 | 450 |
| triangles p95 | 214496 | 210630 |
| geometries／textures | 348／38 | 348／38 |
| entropy 範圍 | 3.055–4.121 | 3.251–4.792 |
| edge density 範圍 | .0263–.1027 | .0237–.0492 |
| contrast 範圍 | 70–178 | 71–211 |

自製pixel fallback含場景，不證明袖品質。技術PASS不作美術或效能放行。390為桌機GPU，真手機FPS／觸控／safe area／音訊未實測。

owner實看CT2 front／T2 rear-right同意肩與袖口仍弱；獨立較低分採用。幾何覆蓋診斷native0：46個肩候選頂點中28個yoke×mask>.25、無yoke>.5且mask<.1者，不能歸因全部被mask排除。下一輪聚焦更寬、更可辨的肩帽／袖根接縫、布製袖口、沿受力的衣料細節，不重做已可見的肘／前臂，也不拿Node守門替代圖證。


## 2026-10-12 舊 CS archive 停用索引

此頁較早的候選 archive 連結屬歷史取證。E 收件後 root 僅按明確清單清理淘汰建置；原圖、完整 stdout／stderr、native exit、gate／metrics、來源與 bundle 指紋均保留。原失敗及分數不改寫，唯一恢復點及目前可用版本保留；實際刪除結果以 RESUME_CHECKPOINT.md／Owner Review 為準。

對應來源、結果與保留證據請從[歷史 archive 索引](evidence/retention-policy-20261011/e-approved-root-review-history-v2.md)接續；不可把已停用 archive 的舊連結當作目前預覽。
