# Owner4H 完成紀錄

## 2026-10-18 Owner4H 工程完成，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無probe owner4h-pristine-review-20261018，source e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4（144檔）、bundle 1e3fa1b8391fbf610d3a30d34f9d37570a81f18f15b479a9161373ecde22f57c，PID 134304；HTTP逐byte吻合。HEAD仍4f168947；未commit／push／deploy，不改MOBA，既有D／E／F／G成果保留。

五項：真命中血花／環境血跡、室內路線利用、觀戰平移／旋轉／縮放／聚焦與POV鎖定、正常隱藏死亡X及可選分析、正式AI因果感知／方向掩體／近距補槍／守包回防／拆彈。另修POV透牆名牌／血條；音效／五職16能力／已通過美術保留。

固定三圖前後各六場：124→116回合，安包34→45，拆彈10→15，房間去重到訪70→158；不是勝率或戰術品質保證。公平性36次、9/9決定性；獨立350回合T51.43%／CT48.57%，原門檻通過、有限樣本不代表全域公平保證。

最新版GPU／FPS／正式流程與完整log見 OWNER4H_CLOSURE.md、evidence/owner4h-review-20261018/engineering-complete.json。4229幀／20回合保存Replay逐欄與Result相同、原容量不提高。手機真機FPS／觸控與長時間壓力未測；部分房間或安靜狙擊守包若未自然觸發，具名保留NOT_TRIGGERED。

■ 實作｜■ CPU／對局／公平性｜■ GPU／FPS｜■ 正式流程／5183／文件｜▣ Owner Review。工程剩餘0分鐘，Owner驗收由Owner安排。


## 五項交付

1. 正式傷害事件產生血花與地面／牆面血跡；兩個InstancedMesh、48血跡／24液滴固定上限，20秒／0.18秒生命、暫停／倒帶／換回合同步，reduced motion支援。不從HP差額猜命中。
2. 三圖12處原可玩室內連通通過；九個authored中心供正式戰術選點使用。未改碰撞、裝飾建築或美術，不強迫所有角色進所有房間。
3. 桌機左拖平移、右拖旋轉、滾輪縮放、雙擊實際拾取點聚焦／重置；觸控單指平移、雙指平移縮放，POV不能改選手aim／FOV。
4. 大型X來自死亡位置兩片Plane及遠景放大；正常Major對戰隱藏，分析按鈕可選顯示，POV隱藏。
5. 正式感知區分視力與武器射程、多觀察者visibleTo、當前敵優先、近26m補槍、真槍聲／隊友死亡有限TTL情報、身體寬度方向掩體、已知威脅守包／回防／拆彈；不讀隱藏敵方佔位或用精確隱藏座標中斷拆彈。公開全殲時解除舊槍聲警戒；同tick已中斷拆彈者不能開槍後繼承舊進度。詳 OWNER4H_AI_AUDIT.md／OWNER4H_DESIGN.md。

## 實際A/B

同三圖、505001／505002、同陣容與crossfire，原G完整獨立副本與最終H各六場。

| 指標 | G | 最終H |
|---|---:|---:|
| 完整回合 | 124 | 116 |
| 真安包事件 | 34 | 45 |
| 真拆彈成功 | 10 | 15 |
| 房間到訪（回合×角色×房間去重） | 70 | 158 |
| 實際發射 | 2230 | 2026 |
| 實際命中 | 1414 | 1304 |
| 未解釋停火 | 0 | 0 |

回合長度／結果隨AI改變，總數不能直接當專業品質提升率。到訪每回合0.56→1.36；聲音／死亡情報7128是角色×0.5秒取樣，不是槍聲事件數。原G公平性獨立351回合T49.57%／CT50.43%；新H350回合51.43%／48.57%，原雙指標門檻不變而通過，不能宣稱完全沒有側偏。

## 最新版 GPU／FPS

- gpu-final-r2：30/30 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/gpu-final-r2/gate.json
- gpu-detail-final-r3：7/7 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/gpu-detail-final-r3/gate.json
- room-final-r2：19/19 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/room-final-r2/gate.json
- occlusion-final-r2：16/16 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/occlusion-final-r2/gate.json
- objective-final-r3：9/9 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/objective-final-r3/gate.json
- objective-mirage-second-r1：4/4 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/objective-mirage-second-r1/gate.json
- perf-final：70/70 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/perf-final/gate.json
- native-replay-final-r2：4/4 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/native-replay-final-r2/gate.json
- formal-final-1366：63/63 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/formal-final-1366/gate.json
- formal-final-390：63/63 PASS；review/cs-major-upgrade/evidence/owner4h-review-20261018/formal-final-390/gate.json

同AMD／1366／DPR1、原品質／1x、十角色、串行A/B；opening／smoke／POV及Inferno真八煙10秒，Mirage相同保存Replay另有60秒跨回合A/B。median≤原×1.10+.5ms、p95≤原×1.15+1ms，draw calls≤原×1.05+2、triangles≤原×1.05+1000，全部維持原門檻。

| 場景 | FPS G→H | p95 ms G→H | calls p95 G→H |
|---|---:|---:|---:|
| mirage／opening | 58.4 → 59.8 | 16.80 → 16.80 | 427 → 387 |
| mirage／smoke | 54.3 → 59.8 | 33.30 → 16.80 | 433 → 398 |
| mirage／pov | 60.2 → 60.1 | 16.80 → 16.80 | 265 → 223 |
| mirage／transition | 59.0 → 59.7 | 16.80 → 16.80 | 465 → 427 |
| dust2／opening | 60.0 → 54.3 | 16.80 → 16.80 | 447 → 407 |
| dust2／smoke | 54.5 → 59.8 | 33.30 → 16.80 | 447 → 407 |
| dust2／pov | 60.1 → 60.1 | 16.80 → 16.80 | 339 → 294 |
| inferno／opening | 60.1 → 60.1 | 16.80 → 16.80 | 433 → 393 |
| inferno／smoke | 60.1 → 60.1 | 16.80 → 16.70 | 438 → 411 |
| inferno／peak8 | 58.8 → 53.1 | 16.80 → 16.80 | 517 → 477 |
| inferno／pov | 60.1 → 60.1 | 16.80 → 16.80 | 290 → 256 |

室內自然觸發資料完整保存在room-final-r2/gate.json；NOT_TRIGGERED不算PASS。近景首輪取景未對準真命中，雖狀態7/7但不採該圖作血跡外觀證據；補正原生平移取景、加入命中點距離斷言後重新拍攝。

## 回歸與保存資料

perception12/12、血花12/12、POV7/7、因果視力／拆彈11/11、topology12/12；Coordinator42/42、runtime34/34、animation19/19、handling21/21、audio pool22/22、playback26/26、utility37/37、F rules17/17、D rules13/13、Competition19/19、Replay UI51/51、input15/15。最後完整Mirage4229幀／20回合、每個可序列化欄位／metadata／rawResult相同，未重跑引擎、刪幀、四捨五入或改codec。wire 171401116、gzip 14673212 bytes，原256MiB／64MiB上限保留。Legacy一場完整Mirage前後Simulation SHA相同（15回合），不是三圖Legacy全驗。

## 失敗分類與工具修正

- perception原版2/6、薄中心掩體／隱藏敵佔位10/12、視力與拆彈透視0/2均保留反例；公開全殲仍被舊聲音中斷的定向反例10/11，修後11/11。這些是實際產品問題，修後重跑最終完整對局、公平性與GPU。
- H1室內18/19 PRODUCT_FAIL：Mirage牆後名牌；H2修後19/19，H3全新版另驗。不以中間版GPU／FPS當最終PASS。
- runtime初次fixture拒覆寫屬工具前提；後續oracle改為每一真觀察者、聲音來源及決策前陣亡快照，避免拿當tick決策後死亡作情報。保留34項；未更改產品去迎合錯誤oracle。
- utility原37項只有正式call來源擷取regex需對齊新isThreatened及中斷Set，首次runner該段失敗，修工具後37/37。拓樸r1/r2任意外探點落相鄰建物，改驗真合法portal、原半徑與每.2m碰撞；不移牆或降門檻。
- Dust2 capture最初把JS undefined與JSON省略欄位誤判不同；改為全JSON往返規格比較，沒有刪除可序列化欄位。
- 早期before crouch counter用錯字，該欄位無效；before-v2重新測量。中間版after-v2／after-h3-v2不當最終A/B，最終只讀after-final-r2-v2。
- Owner4F-H1舊C9、H2歷史R8/R11來源轉換、H3固定edge無安包仍是具名歷史未過，不宣稱全部歷史綠燈。全部stdout／stderr／native exit保存在 authenticity-closure-20261012/owner4h-*，runner完整child logs與checkpoint保存在本輪evidence。

## 剩餘風險／Owner驗收

手機真機FPS、觸控手感、長時間壓力與真人主觀觀感未實測；桌機短窗及一分鐘不等於長時穩定。競技AI仍是既有簡化模擬，有限樣本不代表真人職業水準或所有seed。H3歷史完整30回合Replay曾接近原256MiB上限；H4實際容量見上表，較長OT可能超量，沒有提高容量掩蓋風險。cloudflared若未安裝，不自行安裝；localhost僅供同電腦，沒有捏造手機外網網址。原敘述六項只有五項具體內容，Owner回ok而未補第六項，沒有自造需求。

## H3紅燈後的H4補修

H3真保存對局GPU守包／拆彈為9/10 PRODUCT_FAIL：Mirage t1持scout，被同隊t3通過狹窄架點推離4.44m，完成路徑又無法復位。逐幀trace及前後同走廊反例保留；新增同隊路徑預留檢查與守包／拆彈掩護離位復位，9/9定向斷言。H4 source e8d9b1eb…重新完成六場、CPU、公平性、保存Replay、GPU與FPS。相對G僅十個CS檔案不同，其餘產品／資產逐byte相同，沒有變更角色碰撞半徑或穿牆規則。H3原版30回合／6563幀資料及舊A/B不作最終H4數據。

第一個H4串行pipeline的Replay UI段因env鍵誤寫而無fixture，屬HARNESS前提失敗；改用原ESMO_CS_D_FIXTURE／ESMO_CS_D_RAW_RESULT接真完整保存Replay續跑，沒有改產品或縮短fixture。原雙stream／native結果保留。

## 真保存幀守包穩定性A/B

同Mirage505001，原G 24／H4 20回合。排除前往架點、改點與未抵達期，連續已抵達角色×0.5秒配對574→469，移動>.05m樣本6→0，反向移動0→0；H4既定架點修改5次均有reported-flank來源。這是全角色局部診斷，不能直接稱狙擊專業戰術成功率或所有seed保證。資料holds-before.json／holds-final-r2.json，未重跑保存幀。

objective-final-r2因Dust2 505001真對局沒有成功拆彈而HARNESS_FAIL，原前提紅燈保留；另取原已宣告36次公平性矩陣的Dust2 505018 base完整16回合，原矩陣比分／安包／reaction首發診斷對帳及全幀JSON往返後，objective-final-r3正向情境補驗。沒有把505001改seed冒充PASS，也沒有更改六場A/B。補充capture第一輪把實際235發錯當191次交戰首發，斷言錯誤保留；改比reactionTelemetry相同欄位，沒有更改產品／數據。Mirage安靜5秒狙擊若未觸發，仍保留NOT_TRIGGERED。

## 八煙尾端診斷與嚴格複核

完整70項原門檻通過，但首輪八煙平均58.8→53.1 FPS、p99 33.3→132.9ms；另一次同Chrome孤立配對7/8 PRODUCT_FAIL（p95 16.8→33.3ms），紅燈保留peak8-isolated-r1。沒有忽略、刪資料或調門檻。CPU profile配對58.4→58.6 FPS、p95同16.8ms，未重現降速；主要CPU仍是既有骨架／矩陣／render工作，後半段Documents 1→5、JS heap約0.8→1.65GB，兩版比較時存留文件與記憶體條件不一致。未據此斷言已證明某個產品記憶體洩漏或確定為BFCache。

補充每個phase獨立新Chrome、確認Documents=1，三組AB／BA／AB交替次序，同原G／H4 artifact、原保存幀、原10秒1x與原畫質、原median／p95／calls／triangles門檻，不修改產品或降低品質：

| 配對 | FPS G→H | p95 ms G→H | p99 ms G→H |
|---|---:|---:|---:|
| 1 | 59.4→59.5 | 16.80→16.80 | 33.20→33.30 |
| 2 | 59.1→59.3 | 16.80→16.80 | 33.30→33.30 |
| 3 | 59.3→58.9 | 16.80→16.80 | 33.30→33.30 |

三組原相對門檻全通過，未重現同程序後段降速；第一輪尖峰與失敗不被覆寫。長時間、多次頁面導航／匯入的尾端卡頓風險仍需Owner實測，不能用短窗證明永不掉幀。完整profile／Performance metrics與fresh-comparison JSON均保存。

## Mirage固定第二種子正向補驗

原先505001安靜五秒狙擊守包未觸發記錄保留；另以原本就列在原生Replay驗證的505002完整24回合／5465幀、由正式UI匯出的新版檔案，objective-mirage-second-r1 4/4 PASS，包含真安靜狙擊架點位置／預留角度穩定與真持續拆彈，不移人／改幀／強迫開槍。三圖均有新版真狙擊守包及持續拆彈正向GPU證據。

## 最終工作樹與停點核對

2026-10-18工程剩餘0分鐘，停Owner Review。HEAD仍4f168947，5183僅127.0.0.1、PID134304，pristine source e8d9b1eb…；未commit／push／deploy，不改MOBA。最新官方週額度剩10%，未達5%暫停門檻。git status與diff stat完整保存，既有未提交工作保留。原始git diff --check exit2是CRLF被當行尾空白，未刪改產品換行；以保留原blank-at-eol／blank-at-eof／space-before-tab並明確認可Windows cr-at-eol重查exit0、無實際空白錯誤；兩份原始結果均保留。這不改任何遊戲gate或repo設定。

桌機 http://localhost:5183/ESMO-/ ，請重新整理後開新對局驗收。三圖最新真狙擊守包與持續拆彈正向GPU皆完成；室內三處未自然觸發仍具名保留。八煙原同程序尖峰及7/8紅燈保留，三組每phase全新Chrome同原門檻皆通過；長時尾端卡頓、真手機與長OT容量仍是Owner風險。
