# 附錄 A：戰術選項 → 執行動作 → 能力影響 → 證據（2026-11-14）

- 基準：`feature/moba-tower-edge-v23` 206383b3。
- 來源：唯讀搜尋代理依程式碼與 fixture 整理。主文件 `MOBA_複雜問題整合審查.md` §四 寫明我抽查了哪些。
- 路徑縮寫：CR＝`src/platform/tactics/capabilityRegistry.js`；TCM＝`tacticChoiceMapping.js`（同資料夾）；MTC＝`src/platform/contracts/MobaTacticConfig.js`；LE＝`src/LogicEngine.js`；PS＝`src/battle/moba/mobaPlayerStats.js`；TT＝`tools/fixtures/tactic_truth_3a.json`；FU＝`tools/fixtures/tactic_followup_3a_replication.json`。

## 先知道的兩件事

1. **所有真實性與複驗量測都沒開選手能力層。** `balanceTool.v20／v21` 是 `playerStatSides:"none"`（`matchRuleset.js:88、:100`），`career.v21` 是 `"blue"`（:97）。下表「能力」欄列出的每一個作用，和戰術選項的交互作用都沒有量過。
2. **證據全部過期。**
   - TT 量於指紋 0578fa882d74b205（commit 1d64ecd6）。
   - v21 凍結值是 620196ccea5a8249；T2 已判定過期（`3a-B_已知紅燈帳.md:15`）。兩者之間 LE 沒有改動，只改了 resolver、mapping、templates。
   - 複驗證據只在 0578 重播過，在 620196 沒有跑（`v21_發布解鎖規劃.md:34`）。
   - v22（c2b507e0cc723382）、v23（目前 69237cce78edf2be）都沒有重測。

## 矩陣

判定欄：std 主列「判定（n, z）」。RC＝n=400 紅藍複驗通過（CR:531 起）；FU✓＝FU 的 confirmed；RW＝複驗後撤下；ME＝量測排除。

| 維度＝選項 | 旋鈕（MTC） | 引擎讀取點 | 會影響同一行為的能力 | std 判定（TT） | 複驗 |
|---|---|---|---|---|---|
| 每時期姿態 stance：aggressive／defensive／scaling | phaseEngage、phaseJoin（MTC:282-288） | `_combatDecisionV3` 接戰分數 LE:3466；`_joinChance` LE:512 | joinAdj＝勇氣、戰術、溝通、反應＋全隊領導（PS:67,258） | 前期 agg pass(40, 5.00)、def pass(−5.49)、scaling pass(−3.40)；中期 agg fail(1.83)、def pass、scaling fail(−1.79)；後期 def／scaling marginal(23) | 6 個 RC；前期與中期 scaling 為 owner_hold（CR:497-498） |
| 打野節奏 tempo：slow／fast | gankInterval 32／45／58（MTC:256） | 出發抓人 LE:7125 | gankIntervalScale＝地圖意識、手速、決策（PS:84）；gankWindowScale（PS:86） | 兩個都 fail(−0.85／0.42) | 無；ME "*"，不提供（CR:401-402） |
| 打野重心 focus：farm／invade | gankIntervalK、gankWeights、invadeChance（MTC:258,291） | LE:7125、`_gankPickV20` LE:3757-3766、入侵擲骰 LE:495 | invadeAdj＝勇氣、地圖意識，只讀打野（PS:118）；選路吃 roamGateAdj＝決策 與 `_riskV19` | farm marginal(−2.39)、invade pass(6.42) | 兩個都 FU✓ |
| 各路姿態 lanes.*.stance | laneOffset、gankWeights、splitLane、splitPush（MTC:239-255） | 推線深度 LE:7469；帶線 LE:7083-7085 | laneAdj＝勇氣、手速、關鍵、走位、決策（PS:81）；splitAdj（PS:116） | 上路 agg fail、def reversed(3.35)、split marginal；中路 agg reversed(−3.23)、def fail、split marginal(−2.30)；下路 agg marginal、def fail | 只有中路 split FU✓；上路 split、下路 agg 為 RW |
| 輔助任務：roam／protect | roamK、protectHp（MTC:292-293） | 遊走 LE:7142、`_roamPickV1` LE:3162-3241；護人 LE:3437 | roamAdj＝地圖意識；roamSight／Info／Gate／Follow（PS:99-114）；護人沒有選手能力 | roam pass(5.36)、protect pass(5.52) | 兩個都 FU✓ |
| 核心位 priority：core | protectRole（MTC:294） | LE:3440（只是護人排序） | 無 | b1 marginal、b3／b4 fail | b1 為 RW；b3／b4 ME "*" |
| 風險傾向：cautious／bold | retreatAt、retreatFloorShift、commitShift（MTC:252,289-290） | LE:6967-6968；`_riskV19` LE:581；緊急撤退 LE:3472；`_commitGateV1` LE:3140 | retreatAdj＝走位、決策、專注、勇氣、關鍵、韌性（PS:53）；returnAdj（PS:56）；commitAdj＝配合（PS:77）；retreatLate（PS:164） | cautious marginal(2.63)、bold fail | cautious 為 RW；bold ME "*" |
| 團戰姿態：passive／aggressive | engageBias、laneOffset（MTC:286） | LE:3466 | 只有 laneAdj（透過站位） | passive pass(−3.97)、agg marginal(2.80) | 兩個都 FU✓；m3／m6 在 BALANCE_EXCLUSIONS（CR:449-463） |
| 集結 grouping：tight；每時期 group | joinFight（MTC:249） | `_joinChance` LE:508 → `_joinV3` LE:3061 | joinAdj | tight fail；前期 group marginal(2.40)、中期 marginal(2.09)、後期 fail(23, 1.00) | tight ME "*"；三個時期都 RC |
| 龍／巴龍優先：low／high | dragonJoin、baronJoin（MTC:250-251） | `_objJoinV3` LE:3254；`_objectiveEvalV20` LE:3275 | objAdj＝地圖意識、戰術、專注、溝通＋領導（PS:79,259） | 四個都 fail；巴龍 high 為 reversed(−2.03) | 都是 ME "*"；有 RC 但不開放（CR:578） |
| 塔優先：low／high | siegeBias、laneOffset（MTC:295,240） | `_openInitiativeV3` LE:4533、`_maybeInitiativeV3` LE:4584 | 只有 laneAdj | low fail、high pass(3.15) | high FU✓；low ME "*" |
| 每時期物件順序：dragon／baron／towers | 每時期覆寫，同上（TCM:157-163） | 同上；Director 依 480／960 秒切換時期（`tacticalDirector.js:92`） | objAdj、laneAdj | 前期 dragon／towers marginal；中期 towers pass、dragon fail(1.62)、baron fail(1.96)；後期 dragon fail、towers fail、baron unmeasurable(19) | 前期 2、中期 3、後期 dragon 為 RC；後期 baron／towers 為 RW |
| 每時期強邊 focusLane：top／mid／bot | gankFocusLane、gankFocusAdd（TCM:257-269） | `_gankPickV20` LE:3757 | roamGateAdj（決策）、`_riskV19`、gankIntervalScale | 前／中期 pass 或 marginal；後期 mid fail、top／bot marginal | 前／中期 6 個 RC；後期 3 個 owner_hold |
| 勝利條件：earlySnowball／objectiveControl／midSplitPressure | 預設組合（TCM:200-205） | 各組成維度的讀取點 | 各組成維度的能力 | 依序 pass(4.35)、marginal、marginal | earlySnowball RC；另兩個 RW |

16 項能力中，準度（accuracy）與學習（learning）只掛在 xpRateScale、lastHitLoss、attackWaste（PS:139,155-157），不影響任何戰術作用點。

## 數量

- Registry 共 48 個維度：live 28、design 20。live 選項 87 個，其中 28 個是基準值或「不覆寫」，從來沒量過。design 列的選項是空的。
- TT 147 列：pass 37、marginal 29、fail 71、reversed 5、unmeasurable 5。
- 以 std 主列算 59 個非基準選項：pass 16、marginal 18、fail 21、reversed 3、unmeasurable 1。
- std 實際提供（Director core.v1）：17 個維度、30 個非預設選項；static 模式是 13 個。
- `戰術能力缺口.md` 寫「48 個維度中 30 個是 design」是 3a-A 當時的數字。之後有 10 列升為 live（時期集結 3、物件順序 3、強邊 3、勝利條件 1），所以現在是 20 列。

## 有「假功能」風險的選項

有提供，但證據是 fail／reversed／unmeasurable 或沒有複驗：

1. **std 的 n=40 主列沒過，靠 n=400 複驗在提供**：中期 stance agg、後期 grouping、中期物件順序 dragon、中期物件順序 baron、後期物件順序 dragon。
2. **紅方主列 fail、仍在提供**：passive、farm、後期 stance def、中期與後期 grouping、後期物件順序 dragon。規則是紅方量不到只記為「不對稱」，不排除。
3. **弱點模板 marginal、沒複驗、仍在提供**：classic.m1 中路 split（z −2.02）、v2.standard_macro 團戰姿態 agg（z 2.73）。
4. **非 std 模板的選項大多是推論**，沒有直接量過（`戰術能力缺口.md` §0 第 4 點）。

目前擋住或放行的機制：
- 正式站旗標 `mobaTacticalDirectorV21:false`，玩家看不到戰術書。
- `offeredDetail` 會套用 ME、BE、RW 三張排除表（TCM:362-364）。
- 每時期維度要求 Director core.v1（CR:80）。
- 已存計畫用 `withMeasured:false` 解析，已撤下的選擇照常生效（TCM:504-506）。

## v22／v23 可能改變量測效果的地方（只列項目）

- **v22 入侵 v2**：入侵窗 50 秒 → 90 秒，有放棄條件（LE:98、1389-1419）。量測指標仍寫「開局 50 秒窗」（`tools/lib/tacticTruthSim.mjs:14`）。受影響：打野重心 invade、打野節奏 fast。
- **v22 Buff 營站位**（LE:439、1377）：受影響 ganksPerMin，也就是 tempo、farm、focusLane。
- **v23 safeRoute v5**：
  - 繞塔路點 → Gank、遊走、入侵的路線。
  - 塔邊承諾與避塔 → 各路姿態的推線深度、攻城窗（塔優先、物件順序 towers）。
  - 塔邊等待後改判撤退 → 撤退次數（風險傾向）。
- 這些層在規則集沒帶時，舊行為逐位元不變。
