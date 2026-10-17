# Owner4E 六項收件

狀態：OWNER_REVIEW。2026-10-15T13:38:38.373Z。

## 五職的正式來源

主要五職以src/platform/contracts/matchSquad.js的CS_SEAT_ROLE為準。突破手走首波進點；游走手保留側線與牽制路線；步槍手跟進補槍與交叉；狙擊手在正式購槍評估／射程／選路架線有專屬分支；指揮依情報／領導協調及目標責任參與。fpsBombObjectivePlanning、正式route／tacticalDuty、combatSkill與weaponAuthority實際服務Simulation，不是本輪新增一組UI分工假數據。既有額外Support角色保留。三圖每個主要定位的真存活任務／射擊／回合樣本見five-role-audit.json。

## 數據來源與契約

fpsMatchAnalytics.js在賽後只讀一遍真roundStats、shotCadenceTelemetry與保存事件／任務；十人表、首殺／首死、多殺、trade／clutch、逐局傷害／比分／開局資金、道具、安包／拆包、擊殺座標均由同一資料來源。槍械傷害占比只含真子彈傷害；ADR與道具傷害沿用引擎真值。煙霧交戰線秒與新增致盲秒的意義已在畫面說明，不推算未記錄的勝率／阻擋擊殺／官方評分。

CsMatchResult.v1只增加Major可選analytics的深拷貝，既有欄位／獎勵／入史／Replay優先沿用保存幀保持。舊資料缺進階欄位顯示—，不回跑Simulation補資料。真Replay51/51及15/15，契約與十人數據對帳通過。

## 呈現與原創音效

C4標記由!dead&&hasBomb控制，姓名截斷不影響標籤；狙擊鏡由真武器／動作／槍口時間控制18°相機、鏡窗、退鏡與復鏡，沒有改傷害或增加命中。三個WAV由create_owner4e_c4_audio.mjs數學生成，非官方原音；正確路徑為public/audio/cs/c5a2/。40秒保存炸彈時鐘驅動加速、A/B音高及最後10秒警示，暫停／seek取消排程，不造另一個倒數。

## 原失敗與校正

首輪late5–6秒窗口缺失，工具錯分PRODUCT_FAIL；原紀錄保留，沒有藉此修改產品。第二輪13項呈現斷言通過，但音效preload readiness HARNESS_FAIL，獨立HTTP確認產品URL回SPA HTML而非RIFF：新WAV原放錯目錄。修正目錄後HTTP與真正AudioBufferSourceNode均驗證。其後17/19的兩項是末段在1.5秒後已結束回合，原固定3.5秒期望至少六聲的oracle不成立；現在每一實際經過的保存幀脈衝必須全數對帳、音源與波形精確符合、並比較真context時間間隔（約1.01秒→0.40秒），不放寬為有聲就PASS。所有原stdout／stderr／exit與失敗JSON保留。

初稿驗證清單將額外support列入五職；後續依真正CS_SEAT_ROLE校正為lurker，直接唯讀核對原三圖真分析樣本15/15，未改名單／造局。最新pure20/20已按五主職驗證。

新戰報取代原簡版，因此正式browser gate改讀十人真表、原生切換分頁／選手／回合、展開收據後確認UI，不再依舊文字「本隊數據」猜通過；原26項流程維持，增至49項。完整截圖與人工視覺審閱另存image-review.json。必要工具變更均為驗新功能或修正無效前提，未刪安全網。

## 交付

## 2026-10-15 Owner4E 六項收件：新版5183，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無probe owner4e-pristine-20261015，source 8894ef32a557379b9e6a5b8895a67121753320aef4ed8c27af8d802a6a6d3618（121份），bundle fa42dbed171c796363c7e6ef7a34a1208756cfca23571c841b0e42bc03e908ca；HTML及全部10個JS HTTP200且逐byte吻合，Preview PID84740。攜包列獨立金色C4標籤／金框、真18°狙擊鏡與射擊時鐘、實際職業任務、原創加速C4滴聲、真煙閃效益與專業四分頁戰報已交新版。音效須點選開啟。

驗證：三圖正式CPU36/36、五主職15組／15組、最新純規則20/20、音訊26/26＋pool22/22、handling21/21、Replay／Result51/51＋15/15。新播放GPU19/19、effects25/25、同GPU前後效能19/19、pristine正式流程桌機與390px各49/49（含四分頁320/360/390/430排版、十人／逐局對帳與冪等），native均0。Mirage完整sim移除新增唯讀觀測後，JSON SHA與Owner4D完全相等，不用UI／特效冒充AI效果。

證據總索引：review/cs-major-upgrade/evidence/owner4e-review-20261015/engineering-complete.json；詳細來源／限制／原紅燈：OWNER4E_CLOSURE.md、OWNER4E_SCOPE.md。原創PCM目錄錯誤由HTTP PRODUCT_FAIL定位並修正；最初晚段窄窗口與跨回合計聲oracle錯誤完整保留，改為真保存時鐘完整脈衝對帳及實測間隔，未改seed／產品狀態或降低產品gate。五主職依CS_SEAT_ROLE為Entry/Lurker/Rifler/AWP/IGL，額外Support保留。

同AMD GPU／桌機1366每段10秒：新版Mirage約57.5FPS、Dust2約58.8FPS、Inferno約56.8FPS，calls／triangles與Owner4D相同，短測未見相對退步；不是60秒或真手機效能承諾。所有圖表來自真結果／shot／roundStats／events，未知為—；ESMO評分非官方評級。煙霧為敵對交戰線×秒，非阻擋擊殺；閃光記真增量並分隊友，不包裝為勝率。手機真機FPS、觸控與聲音體感未實測，cloudflared未找到，未安裝。原間歇空白回報仍保留。

■ 六項實作｜■ 分階段真CPU／GPU／流程｜■ 新Preview／交接｜▣ Owner Review。工程剩餘0分鐘，Owner驗收由Owner安排。未commit／push／deploy、不動MOBA、不重做已通過美術。
