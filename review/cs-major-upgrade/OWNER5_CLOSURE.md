# Owner 五項實戰問題：2026-10-13（技術收件完成，待 Owner Review）

最新結果以文末「最新技術收件」與 `evidence/owner5-review-20261013/gameplay-owner-review-final.json` 為準：READY_TO_OWNER_REVIEW，桌機 Preview 使用 localhost:5182/ESMO-/。下方各輪進度與失敗是保存的歷史紀錄。舊55場／v11 ROI證據不替新source背書；不push／deploy、不改MOBA／Store／Reward／Router，手機真機與體感仍待Owner驗收。

## 設計契約

玩家承諾：選擇戰術與觀戰，能從真路線、架槍、情報、道具與炸彈流程理解兩隊決策。攻方以控圖／找機會／集結掩護／突破／安包防守為目的；守方部署兩點、有限取資訊、依真正報點回防。角色專長保留，但每個合法五人組成都分配持包／突破／補槍／側翼責任。損失與勝負仍由既有戰鬥、導航、經濟與炸彈權威計算，不指定結果。

核心循環：賽前配置→購買靜止與部署→真可見接敵／資訊共享→架槍或調整路線→掩護進點／安包或守點／回防→真戰果與資源後果。Rush保留直接入點；Default依真正控圖／情報後集結；Pick先架槍找突破；Execute保留集結／道具窗口。階段是已發生事實，不能因routeIdx重設或道具消耗而倒退；26秒只保留既有phase提示，不能無條件讓全隊衝點。

場域契約：沿用三圖原導航、牆與LOS，不改地圖id。主要入口與側翼形成角度，CT無情報不得偷讀秘密攻點。近物裝飾分層只改可見面，不新增戰術掩體。壓力来自回合時間、敵情、傷亡、道具消耗與炸彈，不靠假結果。失敗後保留真回合／位移／死亡與用途證據供玩家判讀。

CS攻防目標參照Valve官方[About](https://blog.counter-strike.net/about/)；這不是CS規則或專業水準完全相同的宣稱。ESMO既有比分／經濟／地圖契約保留。

## 已證根因與Before

1. 出生滑步：Major沿用Legacy購買期sin/cos位移，真outgoing velocity觸發walk；不是只修mixer便能解。
2. 戰術：default/pick規劃同形、26秒backup無條件進點、hold意圖仍pace>0，正式fresh雙entry／雙rifler／IGL沒有側翼／支援責任。pure baseline1/12 PASS、11 PRODUCT_FAIL。
3. 投擲：原飛行已有插值，煙霧age/tl與HE/flash boom只每0.5秒保存幀跳階。真renderer fixture baseline5/9、native1；flight本身4項通過，不能整體加速道具。新投擲同tick先推進0.5秒才存frame，缺手上起步。
4. 通訊：只有文字、無voice播放；首次報點把aliveT.length當觀測人數、部分台詞與地圖／真部署不符、POV看到雙方通訊。
5. 近物閃爍：完整牆、腰線／基座／立面柱部分共面不同paint；CPU三圖實geometry證明存在。第一次分層後仍有內部重疊，CPU pair數不等於可见閃爍；必須新POV場景驗證。

## 第一輪實作與新反例

產品單一owner修改，子代理只讀或tools-only。購買期安全分離一次後固定位置；tactical duty/stage補位、保留選定lane、CT有限前壓／site anchors、真own接敵停止；煙霧／爆炸保存幀間連續，初始投擲t0；通訊報點使用真正visibleCount與補位回覆，POV只同隊；可選本機中文朗讀，無中文voice就誠實顯示不可用，不假裝已發聲。

pure第一輪12/12；追加轉換反例12/15，發現stage倒退／shared-intel freeze／entry commit被消耗回退三P0，修後15/15。這只證pure規劃，不替實戰／Browser背書。

第一次整合runner場景120/120、相機21/21通過；utility/runtime尚未收件時因上述已證產品缺口安全中止owned runner176324樹，wrapper native1/324158ms，標ABORTED_SUPERSEDED_BY_CONFIRMED_PRODUCT_FIX，未標PASS。不停止MOBA／外部或未知程序。完整streams/native与中止原因保留。

## 來源、Reference ledger與驗證停點

- source Before唯一7檔bytes與SHA：`evidence/owner5-review-20261013/before-source.json.gz`（515340 raw bytes）。
- 戰術pure工具：`tools/check_cs_owner5_tactical_contract.mjs`，baseline／transition before／After report與完整streams/native。
- Utility真geometry/material工具：`tools/check_cs_owner5_utility_continuity.mjs`，before與After9/9（非GPU／完整投擲演出）。
- 垂直共面工具：`tools/audit_cs_major_vertical_surface_overlap.mjs`，只CPU geometry diagnostic，canonical maps/obstacles/fade footprint未mutate。
- 新fresh roster實戰工具：`tools/check_cs_owner5_runtime.mjs`，走`tools/verify.mjs --only=cs_owner5_runtime`，指定map／selection／唯一report；完整stdout/stderr/native保留。首Dust II default正在收件，不預寫PASS。
- Skills已讀：threejs-game-director、gameplay-systems、debug-profiler、debugging-and-error-recovery。Refs已讀：director phase-playbook；gameplay-workflows/game-design-level-design/game-feel與相應checklists；debug-profile-checklists/scene-debugging。UI依ESMO_UIUX設計原則。QA-release、game-ui-designer、audio-generator在skill path ladder找不到，依phase-playbook與現有Browser Harness fallback；語音僅可選OS中文朗讀，不宣稱專業人聲素材。
- 素材：沿用既有已授權CS人物／武器／地圖與音效；本輪不重B7或重生成資產，處理runtime與裝飾共面來源，不宣稱AAA藝術或90分。

階段：■ 根因與反例｜▣ 最小修正／實戰收件｜□ 新近牆POV／投擲／radio Browser｜□ 文件／pristine Preview。未完成前持續在已授權範圍處理，資源不足依既有界線保存停止，週quota≤3%保存暫停。

## 2026-10-13 Owner五項新source收件（原Closure仍有未結項）

Major-only修正：購買期安全固定出生、tactical duty／control-pick-regroup-utility-entry stage事實latch、接敵停移／共享intel仍可前進、CT不偷秘密target、t0投擲與煙/爆炸sub連續、垂直共面分層、真visible報點／補位reply、POV同隊通訊與可選本機中文朗讀。未改MOBA／Store／Reward／Router，未push／deploy。專業人聲素材未生成，TTS不當真人。

pure15/15、utility transforms9/9；core-v3 utility37/37／coordinator42/42／tactical runtime34/34（含三圖與同seed相同SHA）。六場新fresh5v5每場6/6且actual preMatchLayout selection==requested：Dust f1/f2/f4/f5，Mirage f5，Inferno f5；default/pick/execute有真control／pick／regroup／utility／entry不同階段，rush保留直入。單seed不當勝率／專業水準KPI。全部buy位移與walk0、throw onset t0。原錯selection工具退default的場次不當戰術比較證據。

新source近牆/radio Browser三圖41/41 native0/93597ms，12PNG＋180telemetry、真1×POV、同隊文字、OS中文真onstart/speaking、pause/seek不重播、390px不溢出。root人工看12PNG未見同型跳色，僅代表樣本，不是全程/全圖保證。Utility Dust真1×三型23/23 native0/36158ms，smoke/HE/flash真t0→flight→detonation→snapshot內實FX連續；未加速飛行。獨立pristine build native0/43669ms，bundle71a3c23200b6432410be1b4998f95968bbefc4ed81f66a1c4ab0e3458beadb7a，source dfb164781051c7a530e90e96808a72ebc30a056ef03ae7bf3f54d8dc9c235a7b。正式Dashboard→CS→Battle16/16 native0/34938ms；新Preview localhost5181 session86164 HTTP200，5180保留舊v11。Chrome自有profile cleanup confirmed，未動foreign/MOBA/未知程序。

必要scene最終120/120；Legacy完整JSON與c9一致SHA b90b4296…，913frames/15rounds，但雙方plant0故原安包情境NOT_TRIGGERED、gate保留2/3/native1，不洗綠。新品出生實際mixer Browser待補。工具失敗完整保留：SSR PostCSS模組讀取TIMEOUT後tools-only空plugin修復、錯5人與錯selection無效前提、core-v2舊purpose/hold斷言修成明列真八purpose與stopMovement/pace0強約束（沒刪安全斷言）、fixture重名防覆寫換唯一檔。詳細原native/streams見owner5-collection.json與OWNER5_CLOSURE.md。

原55場／v11只作Before；45列反覆購入零投擲與purchase purpose UNKNOWN尚未閉合，不能宣稱Gameplay全部Closure／READY。接著唯讀audit duty與purchase／投擲窗口錯配；每次購入需可靠purpose與真上下文，不靠死亡豁免或亂投。手機真機FPS／觸控／safe-area／音效未測。週quota最近52%/pausefalse，本root get_goal=null，沒有假造完成goal。

## Owner五項出生Browser補證：2026-10-13 UTC13:31

兩個真不同回合購買期、十名角色真mixer原生1×播放14/14 RESULT=PASS、native0/28309ms：lower Idle_Loop、saved/root/model位移0、mixer正常前進保留呼吸，沒有假凍結。完整native/streams與spawn-freeze-browser/gate.json已保存，自有Chrome cleanup confirmed。Owner五項當前dfb16478 source已收件並有5181 pristine Preview；手機真機與全圖全時間體感仍Owner驗收。整體Closure未完成，繼續原Utility45列的purpose與duty/purchase錯配；不重本五項有效Browser。

## 最新技術收件：2026-10-13T14:19:48.032Z — READY_TO_OWNER_REVIEW（待Owner體感／真機驗收）

五項修正與原Utility購入用途缺口已完成本輪技術驗證。最新桌機Preview http://localhost:5182/ESMO-/，session56480；正式獨立pristine source 6f73780fe3ceb1054d29d7a05c23a99dd19c52f00ed92d75a4bd1a76cc1b4275、bundle 530527c0fa7ea80f013d915e6be2852ef6d633858c8c140b9d5d3cd9296d7360。HTTP200、HTML與全部JS逐byte同archive。5180舊v11／5181前一版保留作對照，不能當最新After。詳細收件 gameplay-owner-review-final.json SHA b7d688e28493a836aef34c82db98095201bd30e3059573b75a302282dd831d0e。

最後同source Browser：正式Dashboard→CS→Battle16/16、三圖近牆真1×POV／radio41/41、Dust煙/HE/flash真飛行展開23/23、兩個不同回合十人出生真mixer14/14，全部RESULT=PASS/native0，自有Chrome cleanup confirmed/profileRemoved。新12PNG root人工看全數未見同型跳色；僅代表影格，180telemetry不冒充180張RGB；390px是emulation不是真機。語音真OS中文onstart/speaking已觀測、pause/seek不播舊窗口；不是真人聲優。原完整7項／B7視覺音效相關有效證據保留，不重無關美術或舊55。

用途：prebuy duty與同來源plan決定kit／費用／carry；每type窗口（低優先合法明示eligible-deferred-priority）、planId連投擲。真nested tacticalDuty、CTstack own deployment／information null不假A、HE observed或clear-calledsite、真flash牆盾、遍歷安全其他teamintel已修。四個独立反例0/4→4/4；pure13/13；合法無優先角色carrier反例1/2→2/2，專用完整fresh5v5 6/6。CT anchor手槍局不買道具，rotator flash／information smoke；不是每role必須買的契約，不以使用率強迫投擲。

原45列涉及30個配置全部保持原canonical seed／layout／actual UI choice驗證，segment30/30：31列有真使用、5無新購入、9有明確條件性備用且無被選中的eligible窗口。不能把carry重指派purpose當原購入purpose；no-safe-*仍未細分所有子原因。30場原source之最後carrier fallback只有at(-1)→[0]；main與其他authority檔byte相同、helper精確反轉SHA相同、原ROSTER雙方均有優先職位及全持包情形duty相同，source equivalence3/3限定這30配置，非所有陣容，不重30場。原combined runner native1是後接core existing-fixture guard，不升整個runner綠。新版core utility37/37、最後三圖tactical34/34包含退/保/交易/假攻與同seed全JSON SHA相同，native0/96913ms。

完整失敗不覆寫：runtime v1工具沒傳source；named30 v1前12有效後JSON.stringify全sim超V8字串限、不是simulation regression；明確Product反例已修；core env舊fixture防覆寫與完整fixture stringify上限。tools-only串流writer保持原JSON順序與所有資料，不改產品frames／roundHist契約，582959474 logical bytes／42427494 gzip bytes、解壓全SHA與重跑hash相同；共享roundHist JSON序列化重複，不以字串上限推定Chrome壞。完整stdout/stderr/native/child logs與checkpoint保留。Legacy本輪完整c9對照SHA同b90b4296…、913frames/15rounds/plant0，安包前提NOT_TRIGGERED，gate仍2/3/native1，沒有洗綠或改seed。

■ 修正｜■ 必要驗證｜■ 文件／Preview｜□ Owner體感與真機驗收。工程工作完成，Owner驗收時間由Owner安排；不宣稱全位置閃爍/專業水準或真機已完成。未commit/push/deploy，不開始下一Sprint；MOBA/Store/Reward/Router未改，foreign／未知程序未動。本root get_goal=null，未假造goal complete；最後週quota45%未觸3%。沒有CS背景測試仍在跑（保留三個Review preview服務）；程序核對以最後resume-state為準。

2026-10-13新記憶已寫AGENTS.md§5：每個任務適時回報進度條與剩餘時間，估算不含中斷。
