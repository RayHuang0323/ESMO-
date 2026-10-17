# B7 真腕口：獨立視覺檢視未放行

Fresh-Eyes `b7_true_wrist_fresh` 實際以 original 逐張看完 D28／M28＝56 PNG、3 anchors 及 metrics／gallery／pixels；未讀 source、checkpoint、歷史評分，未改檔或跑測試。沒有 before，不能推論改善幅度。護具、背袋與 POV 不借第三人稱布袖分。

來源 SHA `ab90fba4504d2e9bb737cfd6dd29c3d8b369948b4724373c04ce8f3be2bd1db0`，59 檔。取證目錄 `evidence/phase-b7-true-wrist-desktop-20261008/1366`、`phase-b7-true-wrist-mobile-20261008/390`，各37/37、native0、28 PNG、28/28 pixels MEASURED／ERROR0。四段 scoped runner 87／63／37／34，4/4、native0；完整子 logs／state 在 `evidence/b7-true-wrist-local-scoped-20261008/`。技術通過不作美術放行。

0＝無證據／placeholder，1＝基本造型，2＝可讀衣物結構，3＝展示級。以下每格為 D／M 分開檢視後的分數。

| 身份 | 肩 | 肘 | 前臂 | 袖口 | 衣料 | 袖輪廓 |
|---|---|---|---|---|---|---|
| ct1 assault | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 |
| ct2 support | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 2／2 |
| ct3 marksman | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 |
| t1 assault | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 |
| t2 support | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 2／2 |
| t3 marksman | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 | 1／1 |

D／M 各36項平均1.06/3，不是整體遊戲十類 scorecard 平均。

- ct1 `front` 肩橫縫及前臂細線可見，前臂仍平滑圓筒，手套接處無清楚布翻邊；兩個後斜面灰硬護具主導肘，`rear` 背板遮住袖身。
- ct2 `front` 衣料由肩至腕連續、有收束，因此輪廓2；縫線仍像表面描線。兩個後斜面肘只有粗略隆起，無可辨壓縮摺群，袖口缺包邊厚度；`rear` 背袋遮擋。
- ct3 `front` 淺灰環带偏硬護具，不證明布邊；後斜面袖身／護具／手套成深色區。M `rear-right` 半徑4.348，人物更小、細節證據更弱。
- t1 `front` 綠袖與線可定位，棕環带及大型護具主導；後斜面肩背寬波紋不等於肘受力摺，外肘被硬件遮住；`rear` 腕和前臂被遮擋。
- t2 `front` 純袖連續及軟形收束可給輪廓2；內肘隆起仍像單一平滑折彎。後斜面肩袖可辨，但袖口無可讀翻邊／縫製厚度，衣料大片均勻綠色；背袋／腰袋不計袖分。
- t3 `front` 肩／前臂線存在，棕環带不能證明布邊；後斜面仍圓滑上臂＋環带＋前臂，欠裁片與受力摺共同證據；`rear` 背袋遮袖中心、腕不可判。

上述圖名在兩組 `operator-gallery/mirage-<身份>-<角度>.png`。active／overview 角色太小，detail 不足證明局部結構；POV 不納入第三人稱。gallery 各24張皆 frame36、playing=false、bodyVisible=true，支持身份／取景狀態，不能證明局部未遮擋或動態摺痕。

| 診斷 | D1366×900 | M390×844 |
|---|---:|---:|
| FPS／p95ms | 35.65／33.7 | 44.64／33.5 |
| calls p95／triangles p95 | 444／218326 | 450／214364 |
| geometries／textures | 348／38 | 348／38 |
| texture estimate MB | 74.39 | 70.39 |
| entropy 全組範圍 | 3.056–4.119 | 3.221–4.793 |
| edge 全組範圍 | .026–.103 | .024–.049 |
| contrast 全組範圍 | 69–178 | 72–211 |
| dominant 全組範圍 | .181–.443 | .111–.401 |

calls 超過 advisory D300／M150；同桌機 GPU 的不同 viewport／品質層，非手機真機。pixels 自製 fallback 為全 canvas 統計，含地面／牆面，不能由 entropy／contrast 推翻袖結構分數；無部位量測／before-after。

下一步須讓肩裁片接合、內肘壓縮與前臂拉伸摺、袖口布翻邊共同可讀，優先 support 的少遮擋證據。B7 未放行；C／D／E 尚未實作，十類≥2／平均≥2.3原門檻不變。手機 FPS／觸控／動態袖可讀性未真機實測。不動 MOBA，不 commit／push／deploy。


## 2026-10-12 舊 CS archive 停用索引

此頁較早的候選 archive 連結屬歷史取證。E 收件後 root 僅按明確清單清理淘汰建置；原圖、完整 stdout／stderr、native exit、gate／metrics、來源與 bundle 指紋均保留。原失敗及分數不改寫，唯一恢復點及目前可用版本保留；實際刪除結果以 RESUME_CHECKPOINT.md／Owner Review 為準。

對應來源、結果與保留證據請從[歷史 archive 索引](evidence/retention-policy-20261011/e-approved-root-review-history-v2.md)接續；不可把已停用 archive 的舊連結當作目前預覽。
