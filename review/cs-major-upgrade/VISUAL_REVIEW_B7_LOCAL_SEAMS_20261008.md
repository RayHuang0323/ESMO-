# B7 局部縫製第三輪：未放行

Fresh-Eyes `b7_local_seams_fresh` 實際view_image original看完D28＋M28＝56PNG與3anchors，只读metrics／pixel-metrics／gallery／量表，不讀source／歷史review，不改檔不跑測試。沒有before，不推改善或退化。

來源120908abea1fb2a85ef59232dd5fcb19ac83bf92e24c679c0ba4b0f7d54c2ff8／59檔，bundle660c8c96c1a8eee1e1456a0dbab872e3bfddaf19ac7a6384ea5f0c2c0ed94745。`evidence/phase-b7-local-seams-desktop-20261008/1366` 與 `phase-b7-local-seams-mobile-20261008/390` 各37/37／native0，28/28pixels MEASURED／ERROR0；技術PASS不作美術放行。

表格為D／M，各身份四角度合併。0表示布製收邊不可辨，不推論模型不存在。護具、背袋、POV不借分；不同reviewer分差不當受控退化。

| 身份 | 肩 | 肘 | 前臂 | 袖口 | 衣料 | 袖輪廓 |
|---|---|---|---|---|---|---|
| ct1 assault | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |
| ct2 support | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |
| ct3 marksman | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |
| t1 assault | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |
| t2 support | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |
| t3 marksman | 1／1 | 1／1 | 1／1 | 0／0 | 1／1 | 1／1 |

- ct1／t1 front淡肩線、前臂點縫存在，硬護具主導肘與輪廓。rear-left/right上臂光滑膨脹圓管，背板線不補袖分。
- ct2／t2 support front肩與前臂雙線可見，最直接的衣袖證據；肘仍圓滑彎折，無內壓外拉摺組。rear-left/right肩到肘平滑，腕與手套交界偏暗，布邊不可確認。
- ct3／t3 front肩線、前臂點縫存在，灰／棕環带讀成附件；rear-left/right上臂缺轉折與局部摺，袖口遮擋。M人物較小不能借D或較大正面圖補分。
- 縫線目前讀成光滑管面裝飾，尚未共同形成肩裁片→肘受力→前臂收束→布袖口。T明暗較易讀，但仍不足2。active／overview太小，detail不足局部解析，POV不借第三人稱。

metadata兩組gallery各24 MEASURED、selected／target／variation一致、frame36／bodyVisible=true，只證明身份及基本可見，不證明每處袖部未遮擋。pixels自製fallback含背景，不是官方inspector；M780×1688截圖對應390CSS、renderer DPR1.5，同桌機GPU，不是真手機。

| 診斷 | D | M |
|---|---:|---:|
| 短窗FPS／p95ms | 33.54／49.9 | 40.59／33.6 |
| calls p95／triangles p95 | 444／214470 | 450／210630 |
| geometries／textures | 348／38 | 348／38 |
| texture estimateMB | 74.39 | 70.39 |
| active entropy／edge／contrast | 3.725／.0301／89 | 3.707／.0332／91 |
| overview entropy／edge／contrast | 3.242／.0262／69 | 3.376／.0289／71 |

同來源draw歸屬診斷 `phase-b7-local-seams-draw-inventory-20261008` 6/6／native0：raw763＝colour454＋shadow309；actor colour294／shadow274、world73／35、other87／0。所有callback／GL方法descriptor finally還原、pixels／state／矩陣／flags／退出完整性一致。A/B/A paused median19.95／14.20／19.55ms。只定位submission，不當正式FPS；尚未產品優化。

下一步做真幾何裁片／肘壓褶／布袖口，不再只依shader描線。原骨架、來源bytes、面積與總成本預算需保留；新增細分須真記額外vertices／tri，不能冒稱零成本。B未放行、C／D／E未開始，最終十類≥2／平均≥2.3不變。不動MOBA、不commit／push／deploy。真手機FPS／觸控／safe area／音訊未實測。


## 2026-10-12 舊 CS archive 停用索引

此頁較早的候選 archive 連結屬歷史取證。E 收件後 root 僅按明確清單清理淘汰建置；原圖、完整 stdout／stderr、native exit、gate／metrics、來源與 bundle 指紋均保留。原失敗及分數不改寫，唯一恢復點及目前可用版本保留；實際刪除結果以 RESUME_CHECKPOINT.md／Owner Review 為準。

對應來源、結果與保留證據請從[歷史 archive 索引](evidence/retention-policy-20261011/e-approved-root-review-history-v2.md)接續；不可把已停用 archive 的舊連結當作目前預覽。
