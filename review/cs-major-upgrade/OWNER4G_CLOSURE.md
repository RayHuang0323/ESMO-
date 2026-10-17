# Owner4G 四項實戰修正收件

## 2026-10-16 Owner4G 完成工程驗證：新版5183，停 Owner Review

桌機：[ESMO Preview](http://localhost:5183/ESMO-/)；[手槍新舊A/B](http://localhost:5183/ESMO-/owner4g-audio-ab.html)。正式無probe owner4g-pristine-review-20261016；source cf3d243e7f0f386fcd4bc79e44f3810b70aeea61e673d8db8754dca7021559d0（141份）、bundle 308e87925520c98e740331ed664ff9dac38a6206515c5a5aded5712b44abf7db、Preview PID100532。所有JS／CSS、原族錄音、C4、五新手槍／三機械聲及A/B附件HTTP200逐byte吻合。

四項：修正R6真煙與薄煙／僅前四煙可見的不一致，不強制AI開火，加入真停火原因；C4開始／持續／完成依角色既有碰撞半徑與外框、樓層、資格接觸；五人陣容自由同職、主副適性與16能力保留；合法五手槍及機械聲與正式事件同步，提供原版／新版試聽。

驗證：六場原版與六場新版完整A/B；原側偏36場、9/9決定性，T49.57%／CT50.43%，原門檻PASS。最後版GPU32/32、煙霧22/22（Inferno8顆皆有核心）、同真保存POV5/5、同AMD含真8煙Replay壓力FPS43/43。正式桌機／390各63/63，含320／360／390／430賽前與戰報／檔案；A/B真WebAudio21/21。新原生完整Replay匯出匯入4/4；Legacy Mirage完整Simulation SHA一致；Replay／Result51/51、input15/15、utility37/37、handling21/21、pool22/22、playback26/26、規則17/17及10/10、Learning與Competition通過。

風險：手機真機、長時間FPS及真人耳聽仍待Owner；五手槍中USP／P250／Tec9是合法錄音設計而非原槍錄音。Replay新wire壓縮無損、不提高原容量；超容量舊檔需離線重編碼，舊client不支援新encoding。Owner4F-H1／H2／H3歷史未過守門仍具名保留，不宣稱全歷史綠燈。完整證據與失敗紀錄見 OWNER4G_CLOSURE.md、OWNER4G_DESIGN.md、OWNER4G_AUDIO_AUDIT.md、evidence/owner4g-review-20261016/engineering-complete.json。

■ 實作｜■ CPU／對局／公平性／Replay／GPU／正式流程｜■ 5183／文件｜▣ Owner Review。工程剩餘0分鐘；Owner驗收由Owner安排。HEAD維持4f168947，未commit／push／deploy、MOBA未改。


## 真實A/B

505002配對完整對局；距離是世界中心距離，正式以C4外框gap<=1.35判定，並非中心<=1.35。六場完整比分、安包／拆彈與無槍原因見six-match-ab-r1.json。

| 地圖 | 原版最遠拆彈 | 新版最遠拆彈 | 拆彈完成數 |
| --- | ---: | ---: | ---: |
| mirage | 5.943 | 0.448 | 4 → 3 |
| dust2 | 4.627 | 1.459 | 1 → 1 |
| inferno | 5.016 | 1.909 | 1 → 1 |

## 同機FPS

AMD硬體、1366桌機、1×、逐場10秒，opening／smoke／Inferno真舊保存八煙Replay，未改原median／p95與draw-budget門檻；不是手機或長時間FPS保證。

| 圖／場景／版本 | FPS | median ms | p95 ms | calls p95 | triangles p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| mirage／opening／before | 60.10 | 16.70 | 16.80 | 427 | 222567 |
| mirage／opening／after | 58.79 | 16.70 | 16.80 | 427 | 222567 |
| mirage／smoke／before | 59.97 | 16.70 | 16.80 | 432 | 221843 |
| mirage／smoke／after | 59.68 | 16.70 | 16.80 | 433 | 222371 |
| dust2／opening／before | 60.08 | 16.70 | 16.80 | 446 | 222884 |
| dust2／opening／after | 60.07 | 16.70 | 16.80 | 447 | 223286 |
| dust2／smoke／before | 60.09 | 16.70 | 16.80 | 446 | 223844 |
| dust2／smoke／after | 60.08 | 16.70 | 16.80 | 447 | 224372 |
| inferno／opening／before | 60.07 | 16.70 | 16.80 | 433 | 225068 |
| inferno／opening／after | 60.09 | 16.70 | 16.80 | 433 | 225068 |
| inferno／smoke／before | 59.80 | 16.70 | 16.80 | 437 | 225036 |
| inferno／smoke／after | 60.07 | 16.70 | 16.80 | 438 | 225564 |
| inferno／peak8／before | 59.97 | 16.70 | 16.80 | 509 | 244953 |
| inferno／peak8／after | 60.11 | 16.70 | 16.80 | 517 | 249157 |

## Replay

原版真正5465幀／28回合匯出280455183 bytes已超256MiB，新增無損玩家共用資料表，舊檔重編碼216763558 bytes／gzip18267818，所有frame／其餘Simulation／rawResult相同，不重跑引擎、不刪欄位。新原生匯出4935幀／24回合，wire 196607985、gzip 16792785 bytes，經正式UI匯入與全欄Result往返。

## 工具與失敗紀錄

完整stdout、stderr、native exit與child logs均保存。早期runtime r1／r2只是既有fixture拒覆寫，r3新路徑34/34。舊原生Replay超容量匯入為HARNESS前置失敗，另以真資料重編碼證實修正。Replay UI50/51之V8單字串上限改逐frame相同JSON往返與全欄比較，原51個斷言保留；utility只更新新參數擷取錨點，原37不變。

smoke r2／r3圓柱形雖過計數但視覺不採用；G2八核雙面不寫深度產生碎片，G3改FrontSide／depthWrite後重新完成全部GPU／FPS。smoke-maps-r1 7/10 PRODUCT_FAIL是新工具誤把首次窗末DEFUSE要求成窗初內部鎖；正式state已正確，改驗真首次接觸／state／objectiveState，持續鎖由32項原守門驗證，不修改產品去迎合錯誤旗標。gpu-r2隨continuation啟動中斷，無行程／無native結果，明記NOT_RUN_INTERRUPTED，未冒充PASS。

原Owner4F-H1舊C9、H2歷史R8/R11來源轉換、H3固定edge沒有安包，原版已有證據，仍保留未過標記，不放寬門檻。所有來源、素材授權、有限樣本與未實測界線詳設計／音訊稽核。

## 正向開火實證與覆蓋界線

完整新Mirage原生Replay第18回合130秒窗：當回合T方（穩定ID ct1、ct2，已換邊）對CT拆彈者t2開火。AK於130242ms未中，AWP於130287ms造成56傷害，目標HP56→0、拆彈取消；此前進度2.6416667。actual fov／lineOfSight／engagementPermission均true、彈藥正常扣除，沒有強制開火；詳saved-fire-mirage-r2.json。判定依當回合side，不以ID字首猜隊伍。

Dust2／Inferno原真保存樣本與另外各三組預先固定的戰術／seed／換邊完整對局，沒有自然觸發T對既有拆彈者射擊；保留NOT_TRIGGERED，不能列作該正向情境PASS。各場已完成且unexplained=0，三圖的實際煙霧遮擋／接觸拆彈／正式射擊另有完整證據。此限制交Owner實戰驗收，不透過改seed、移人或強制開槍掩蓋。

側偏36次模擬由18場獨立配對與18場決定性重跑組成；勝率只計獨立配對的351回合，重跑不重複計入。樣本不代表所有seed／戰術與設備的全域保證。

## 額外HE工具舊假設修正

原工具在精確Owner4F來源與新版皆24/27，三項相同失敗：漏傳正式detonatedAtRoundSec導致新HE／短flash不可見；仍期待舊單層.62透明度，未對齊已通過的三層.64／.54／.44；把永遠可見但沒有可見子物件的容器當殘留特效。更新fixture時間、驗三層精確alpha與實際祖先可見drawables，保留27項與完整dispose斷言，結果27/27。不修改已通過HE美術、不放寬產品門檻；before、首輪紅燈與修後雙stream／native均保留。

正式流程首輪收件metadata以子字串比對Probe，將window.__ESMO_FPS_SCENE__===scene的清理比較誤認成賦值。實際bundle只有比較／delete，無scene賦值；修正檢查排除equality，另新增正式Battle全域scene／callback確實未掛載的瀏覽器斷言，桌機與390各重新63/63。首次finalize在文件寫入前因此拒絕收件，失敗log保留；未修改產品或放寬原斷言。
