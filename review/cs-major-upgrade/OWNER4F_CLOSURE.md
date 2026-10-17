# Owner4F 四項收件

狀態：OWNER_REVIEW。2026-10-15T19:42:39.534Z。

## 四項修改

1. Post-plant：預約角色距離、真掩體、對包LOS及不同隊友角度。AWPer穩定架線，3秒TTL的新側線才觸發重選。CT仍以真導航回防，拆彈者停住，其他CT選掩護點。
2. 拆彈：真C4 LOS、致盲／死亡／壓制／離位／保槍與剩時判斷；交接不繼承進度，不保證成功。維持原秒制與能力速率；精確完成tick優先，不能借過期時間。
3. 槍聲：22把正式GUNS與音色鍵逐一相等，五份既有CC0實錄搭配個別pitch／gain／尾音；每發仍一聲源、原64／32聲池，未新增buffer／filter成本。空彈、換彈起止依保存狀態與真幀內毫秒排程，pause／seek沿用取消與去重。來源：https://opengameart.org/content/the-free-firearm-sound-library ，來源台帳：public/audio/cs/c5a2/SOURCES.md。沒有Valve音源。
4. Entry／Lurker／Support／AWPer／IGL正式任務進Simulation；Rifler是武器適性／購槍偏好／步槍能力profile，沒有轉成Lurker。舊資料留在原來源，舊Replay／Result讀保存欄位。16能力及成長接線逐項見OWNER4F_16_STATS.md；Learning是賽後XP吸收，不假稱直接加槍法。

## 真A/B

基線是精確重建Owner4E source 8894ef32a557379b9e6a5b8895a67121753320aef4ed8c27af8d802a6a6d3618，不是HEAD舊碼；所有指定輸入不變。比分按穩定我方／對手記錄，兩隊隨半場換T／CT。

| 地圖 | seed | 原版比分 | 新版比分 | 拆彈結案回合 |
|---|---:|---:|---:|---:|
| mirage | 505001 | 13:6 | 13:16 | 2 → 7 |
| mirage | 505002 | 13:3 | 8:13 | 0 → 4 |
| dust2 | 505001 | 2:13 | 0:13 | 2 → 0 |
| dust2 | 505002 | 0:13 | 0:13 | 0 → 1 |
| inferno | 505001 | 8:13 | 13:16 | 2 → 0 |
| inferno | 505002 | 1:13 | 13:10 | 2 → 1 |

六場原版拆彈結案8次，新版13次；回合長度與接觸不同，不能把這些數字包裝成勝率提升。Mirage505001無情報且靜止AWPer平均每0.5秒轉頭 17.19°（17樣本）→0.72°（95樣本）；角色存活時間不同，不是同幀配對。另以完全相同位置／公開地圖／無情報160次輸入做純規則A/B：平均轉頭3.41°→0°、正弦掃視峰值12°→0°。Mirage舊版拆彈期間9個取樣仍移動；新持續責任鎖為0移動／0開槍，中斷後合法交戰另外計算。

原C5D門檻不變：|round delta|>=0.08且|paired effect|>=0.75才判系統側偏。本輪36場執行包含18個非重複配對樣本、9個決定性重跑組。actual startSides已逐人確認換邊，非只看測試輸入。結果：NO_T_SIDE_SYSTEMIC_BIAS，round delta -0.011，paired effect 1，決定性9/9。這是有限樣本，不宣稱所有種子平衡。

## 新硬體GPU與FPS

| 地圖 | 平均FPS原→新 | p95 frame time原→新 | p95 draw calls原→新 |
|---|---:|---:|---:|
| mirage | 59.9 → 58.2 | 16.8 → 16.8 ms | 424 → 427 |
| dust2 | 60.0 → 60.0 | 16.8 → 16.8 ms | 431 → 446 |
| inferno | 59.8 → 60.1 | 16.8 → 16.8 ms | 433 → 433 |

同硬體、同1366視窗、原生overview／1x／開局保存幀，每段10秒；原相對median／p95／draw／triangle門檻維持。不是手機或長時間60秒基準。GPU使用最新source的真AWP／Scout與18°POV、守包、持續拆彈進度、正式分工及22槍OfflineAudioContext波形，與實際射擊AudioBufferSourceNode接線分開取證。Inferno預設控圖case無安包時標NOT_TRIGGERED，另透過原生file input匯入本輪指定完整Inferno Replay，不patch frame／camera／結果。

## 相容與原失敗

完整5104幀Replay按正式compact wire逐欄位往返，265894540 bytes，仍在原256MiB解壓上限內但接近上限；沒有放寬64MiB壓縮輸入或256MiB解壓界線。原始診斷展開JSON超過Node單字串上限，因此測試reader逐幀讀取並逐份核對相同history SHA後恢復精確共享參照，不刪幀或欄位。實際Legacy比對before=b834fdfff0196f5983dad3663b62bb29c6607418025801080498997f947d379f、after=b834fdfff0196f5983dad3663b62bb29c6607418025801080498997f947d379f。Competition／Learning／Replay input與真正正式Result收據／入史／冪等保留。

本輪真紅燈均保留：共享戰術陣列造成Dust2 route差異已以一行clone修正，新增凍結反例；新增守包偏移點距C4不足4的反例已以相同嚴格界線修正；defuse intent補完整null欄位，不偽造情報；幀內160ms換彈聲提早的before反例native1、after native0。最初GPU把未觸發Inferno安包誤列產品紅燈，原證據保留，改用真保存Replay的正式匯入觀察。中途人工終止的公平性run為INTERRUPTED，未列PASS；正式最終矩陣完整跑完。

角色R56／R58／R58.1因本輪正式需求由舊Rifler職業表改為五職＋獨立步槍能力；保留全部身分／stats／潛力／組成／持久化斷言，增加Lurker真權重、步槍適性及舊Rifler不可當Lurker的斷言。戰術34項保留舊authored-node守門，另加新偏移守包點的同範圍／可達／不共點驗證，不降低標準。Sprint紀錄追加記錄。賽前第三席原RIFLER標籤亦修為SUPPORT，新版完整重建後重跑GPU／FPS／正式桌機／390流程。最初GPU黑圖定位為原生暫停按鈕捲離Canvas，已加截圖viewport前置與四張真像素量測，未以黑圖交付。名單工具原文字點擊未確認hit的HARNESS_FAIL保留，改用原生可見點擊與前置檢查。

### 歷史未通過

- Owner4F-H1：cs_gameplay_legacy_exact_equivalence。舊C9比較未通過；本輪起點已相同，實際Owner4E→新版Legacy完整SHA相等。證據：review/cs-major-upgrade/evidence/owner4f-review-20261016/legacy-r1.json
- Owner4F-H2：cs_result_metrics_r8 / cs_bomb_result_semantics_r11。歷史R15文字轉換標記在before及after同樣失敗，未執行到產品斷言。證據：review/cs-major-upgrade/evidence/owner4f-review-20261016/baseline-debt-audit.json
- Owner4F-H3：cs_major_tactical_edge_runtime。原固定Inferno特製case在起點及新版皆未觸發安包，原10項不改標PASS。證據：review/cs-major-upgrade/evidence/owner4f-review-20261016/edge-v4.json

原則：歷史工具不能執行或場景沒觸發都不冒充PASS。baseline-debt-audit.json使用原Owner4E模組隔離確認，原C9／R8／R11／edge總計四支原守門紅燈保留。

## Owner Review

## 2026-10-16 Owner4F 四項收件：新版5183，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無probe owner4f-pristine-review-20261016；source 307c9e99a2a0884374bbee4b986ee3593841834a5358e3cf76e05c536099cd11（128份），bundle bc5de222a38f2fd8e70645a6a964c164a496e24ca8cae7cbeb47dc5330b5f25a，Preview PID96328。HTML、全部JS/CSS、五份CC0槍聲、三份原創C4及換彈click均HTTP200逐byte吻合。音效須按開啟。

四項：真職業／地形／情報守包與穩定架槍、CT拆彈責任鎖／掩護及安全時間判斷、22槍各自音色與幀內換彈／空彈同步、五正式戰術職業＋Rifler武器適性／偏好與完整16能力接線。修正Lurker寫入共享戰術陣列造成後場路線污染。保留舊選手與保存Replay／Result，不重做美術。

最新版三圖各兩seed六場完成；與起點六場真A/B並列。原三圖三seed換起始方／決定性共36場、9/9一致，側偏門檻通過（round delta=-0.011、paired effect=1）。定向規則17/17、完整戰術34/34；新GPU 23/23、相對FPS19/19，正式桌機／390px各57/57（含320/360/390/430戰報與角色檔案）。完整Mirage 5104幀／29回合Replay逐欄位往返與Result對帳，持續拆彈0移動／0開槍；實際Legacy完整SHA與Owner4E相等。

原歷史未通過守門保留：Owner4F-H1舊C9、H2歷史R8/R11轉換工具、H3固定edge case無安包；before隔離已證實同樣存在，未刪斷言或降低標準。原始紅燈／stdout／stderr／native與新版證據總索引：review/cs-major-upgrade/evidence/owner4f-review-20261016/engineering-complete.json。詳OWNER4F_CLOSURE.md、OWNER4F_16_STATS.md。手機真機FPS／觸控／音色未實測；聲音偏好與長Replay上限仍由Owner驗收。

■ 四項實作｜■ CPU／公平性／Replay／GPU／正式流程｜■ 新Preview／文件｜▣ Owner Review。工程剩餘0分鐘；Owner驗收由Owner安排。未commit／push／deploy，MOBA未修改。

手機真機FPS／觸控、耳機實聽辨識度、長時間熱機、既有間歇白頁／全視角牆面體感仍待Owner驗收。原美術／動畫資產未重做，沒有使用Blender。
