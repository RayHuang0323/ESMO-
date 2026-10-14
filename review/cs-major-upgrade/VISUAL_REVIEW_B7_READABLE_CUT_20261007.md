# B7 可讀尺度袖專項獨立審查

`readable_cut_sleeve_review` 獨立逐張 original 看完整32/32 PNG及3/3 anchors，讀兩組metrics／pixel-metrics；未讀source、checkpoint或歷史review，無before、不推論改善。來源fdaa888cbb675e4a738d9b863e6fc836efb90408e91cc806b80194e68bc6af56，完整inventory `evidence/b7-readable-cut-complete-inventory-20261007.json`。

六身份CT1／CT2／CT3／T1／T2／T3，在D1366正／背與M390正／背共24張均袖1/3，無一達2；B不放行。

- CT1：圓鼓深藍袖、彎曲縫線與灰附件可辨，布料層次不清；背肩袖單一圓弧。
- CT2：縫向及少量肘輪廓最清楚，裁片缺厚度／邊界／分層；背面被包遮，露出區平滑。
- CT3：硬灰袖環醒目，排除後仍基本袖形＋細線；背包波紋不計。
- T1：綠袖縫線與輕微起伏可辨，硬袖環／側袋不屬袖層次；背肩平滑。
- T2為最強反例：可見淺肘凹凸，不是無造型，但裁片交界不清，維持1。
- T3：環件／縫線清楚，袖仍像T1；背包／袋件層次不能補袖。

正常active與overview各D/M袖證據0（人物太小，只表示該鏡頭袖不可辨）、detail各1；POV各1屬第一人稱，不能補第三人稱gate，這項不是重審已完成POV整套武器／手持品質。

像素各16/16 MEASURED、error0；自製fallback不能證明袖fold。active entropy／edge／contrast／dominant：D3.7249／.02965／89／.19495，M3.7068／.03320／91／.19543。callsP95 D444／M450超advisory，同AMD桌機GPU非真手機。全本批短窗D59.96／M60.12FPS、p95各16.8ms；後收60秒D59.676／p9516.8／p9917／max183.4ms，7/7 native0，只代表該版本效能證據，不挪給後續版。

下一步需改真正裁片平面與包邊，而非繼續放大Gaussian圓鼓。袖仍未放行，C／D／E未開始。
