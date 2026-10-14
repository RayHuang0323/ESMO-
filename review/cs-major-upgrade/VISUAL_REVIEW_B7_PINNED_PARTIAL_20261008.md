# B7 pinned候選：桌機Fresh-Eyes完成，手機未看

## 額度恢復後完成審查（2026-10-08）

同一reviewer已補M28原圖，累計D28／M28／anchors3完整original檢視，並讀兩份metrics與pixel-metrics；未重看已完成桌機、不讀程式或歷史。兩尺寸像素各28/28 MEASURED、ERROR0、native0。**B7仍未放行**，沒有before，不判斷改善幅度。下方「手機未看」保留為上一停點歷史。

以下兩尺寸分開檢視後分數相同，依序肩／肘／前臂／真正布袖口／衣料／袖輪廓：

| 身份 | D1366 | M390 |
|---|---|---|
| ct1 assault | 2/1/1/1/1/1 | 2/1/1/1/1/1 |
| ct2 support | 2/1/2/1/1/1 | 2/1/2/1/1/1 |
| ct3 marksman | 2/1/2/1/1/1 | 2/1/2/1/1/1 |
| t1 assault | 2/1/2/1/2/1 | 2/1/2/1/2/1 |
| t2 support | 2/2/2/1/2/2 | 2/2/2/1/2/2 |
| t3 marksman | 2/1/2/1/2/1 | 2/1/2/1/2/1 |

六身份共通：正面肩／前臂縫線可見；背面肩腰大皺可見但裝備遮住前臂；左右後視袖形仍平滑。T2露出最多布袖，壓縮隆起較可讀；CT深色合併暗部，ct3窄版後右鏡位較遠。所有布袖口只有與手套交界，無獨立翻折厚度，不能借護具／手套加分。active／overview角色太小，不驗衣料；detail可讀輪廓但不足袖口；POV不替第三人稱加分。

十類目前截圖證據評分依scorecard順序：Art2／Hero2／Enemies1／Interactables1／World2／Materials2／Lighting2／VFX1／UI2／Performance2，平均1.7，未達各類≥2與平均≥2.3。部分1分來自本組截圖缺互動／動態證據，不直接當既有系統不存在或重新實作依據。

D59.00FPS／p9516.8ms／calls444／tri218616；M60.00／16.8／450／214276；geometries348／textures38，估計texture74.39／70.39MB。calls超advisory300／150，不能以桌機60FPS判真手機通過。pixel為自製fallback，不是官方inspector，也不推翻局部CT暗部的可讀性問題。

本source233b2f81完整審查結束；下一候選僅先做support兩身份正面／後左局部診斷，確認造型有效才做完整驗收，避免無差別重拍56圖。

因官方每週codex剩0%停止。唯讀reviewer `b7_pinned_fresh` 已逐張original檢視 `phase-b7-pinned-recovered-desktop-20261008/1366` 根目錄4PNG與gallery六身份各4角度，共28PNG，以及3張scorecard anchors；讀同目錄metrics。未讀產品程式、checkpoint或歷史報告，未修改檔案。手機0/28；没有最終分數、Premium結論或改善幅度判定。

## 已完成桌機觀察

- 六身份均能辨識肩部接縫、背腰大皺；正面肩線與前臂細線較容易讀到。
- support露袖最完整；assault護具遮肘，marksman肘帶亦不能作布袖口證據。
- CT深藍暗部合併，肘窩／前臂受力摺較難辨識；T綠衣明暗摺較可讀。
- 六身份真正布袖口均缺乏獨立於手套的翻折邊與縫製厚度證據；不把手套外緣算為袖口。
- 背視支持肩背大皺與裝備差異，但前臂／袖口多被遮住；左右後視補袖輪廓，仍偏平滑管狀。
- active／overview人物過小，不能支持衣料细節；detail支持輪廓但不足證明袖口；POV手套交界不能替第三人稱布邊厚度加分。
- 場景有石牆、拱窗、工業屋頂與道路層次；近景地面紋理密集，人物暗部與配件塊狀感仍突出。

桌機metrics：59.00FPS、p95 16.8ms、calls444、triangles218616、geometries348、textures38、materials985、estimated texture memory74.39MB。此JSON不含像素熵／邊緣密度／對比／主色佔比與renderBudget，不補造。本輪pixel audit尚未執行。

## 續接

M390完整28PNG已由Owner收取，gate35/35／native0，同來源archive；尚未交reviewer讀圖。額度恢復後僅補M28、像素稽核與最終評分，不重看已完成D28／anchors3，也不重跑D/M取證或36/36衣料驗證。B7未放行，C/D/E未開始。真手機視覺／FPS／觸控仍未測。
