# Owner4C：Owner Review

## 2026-10-15 Owner4C 收件：新版 Preview 已更新，Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。已由舊Owner4B換成無probe正式 `owner4c-pristine-20261015`；source `8692541d4cad0bd2117ad31c946a40d3bda806be973de1c9c7f6282ccaac522d`（109份）、bundle `71e334f71d8247322c5e27c0fb1eb0955a74218840bfdeabd9905d419d058b73`，HTML與全部10個JS HTTP200且逐byte吻合。Preview PID63640，僅保留該Review服務。

本輪沿用checkpoint `4f168947`產品修正，未再改產品／MOBA。新GPU HE7/7、時序／無halo／真POV致盲25/25、第一人稱／投擲／安包／射擊／命中動作29/29、正式Dashboard→CS→Battle→Result桌機與390px各26/26，native皆0、Chrome cleanup/profileRemoved確認。Mirage泵房／中央主泵廊／調壓廊各12張新移動裁圖與全景已保存，真畫面抽查未見共面雜色。原牆面gate7/8及調壓廊1/2為取證前提缺失，完整保留；高台眼高／三角面observer修正後調壓廊4/4，不將原整支假稱PASS。

精確反推108份舊source完全吻合Owner4B，只有HE／閃光呈現、既有sampleGroundHeight工廠接線、房間幾何及原創alpha貼圖差異；AI／移動／道具傷害／動畫／POV模型／contracts未變，原有效contact12/12、tactical34/34等沿用，不重跑B7／30／55。新版原31/31長worldflash假設由更嚴格短閃onset／.12s expiry／無halo／真blind驗證取代，未降低gate。新工具首輪誤把槍口共用貼圖算作道具光暈、Preview啟動前ECONNREFUSED等原失敗均保留。

完整stdout／stderr／native／SHA索引：`review/cs-major-upgrade/evidence/owner4c-review-20261015/engineering-complete.json`；驗收說明：`review/cs-major-upgrade/OWNER4C_CLOSURE.md`。1709全圖幾何候選、全角度／全時間、間歇空白與專業CS體感仍保留限制；手機真機FPS／觸控／視覺未實測，cloudflared未找到，無手機HTTPS網址。本輪非60秒FPS基準。

■ 停點核對｜■ 新GPU／必要回歸｜■ 新Preview／文件｜▣ Owner Review（待Owner驗收）。工程剩餘0分鐘；Owner驗收時間由Owner安排。官方每週剩97%，5%（含以下）停工規則保留。未commit／push／deploy，不開始下一Sprint。


## 驗證工具修正原因

- owner4c-effects-20261015：原工具將共用貼圖的槍口／命中特效誤算成道具閃光與致盲halo；原PRODUCT_FAIL/native1完整保留，不認定為產品迴歸。修正物件池辨識後25/25。
- owner4c-walls-20261015：原7/8包含兩區有效取證；調壓廊取證前提未成立。不得將整支稱PASS。
- owner4c-pressure-windows-20261015：原1/2固定世界高度頂點篩選漏掉高台3.96m眼高；原PRODUCT_FAIL/native1保留。依真indexed triangles與眼高取樣、第一opaque命中更嚴格後4/4。
- owner4c-preview-proof-20261015：服務尚未開始監聽造成ECONNREFUSED/native1；未改產品，開始監聽後逐byte核對成功。

## 本輪修改

只新增Owner4C唯讀瀏覽器取證／source差異／Preview逐byte核對與收件工具，pristine builder加入明確新archive名稱；產品修正已在4f168947，今日本輪未再改src或public。不得把本次收件解讀為專業CS體感或所有角度通過。

## 參考檢查

已讀threejs-debug-profiler的debug-profile-checklists與scene-debugging；已使用debugging-and-error-recovery定位原工具誤判，沒有改產品救測試。完整reference ledger及限制見engineering-final.json。
