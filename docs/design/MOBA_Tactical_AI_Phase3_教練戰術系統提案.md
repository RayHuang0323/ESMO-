# MOBA Tactical AI Phase 3：教練戰術系統——長期架構與產品設計（v2 提案）

> **⚠ 已由正式架構取代（2026-10-09）**：`docs/design/MOBA_Tactical_AI_Phase3_正式架構.md`。本文件保留為決策過程紀錄；
> 兩者不一致時以正式架構為準（例：ruleset 明確化、Challenge 裝備邊界、數值只在版本化模板資料、AI 教練列入 v21 步驟）。

> **狀態：架構提案 v2（2026-10-09）。未實作、未 commit。** 基準：main `1d0e219`（moba-sim.v20 RELEASED）。
> **v2 與 v1 的根本差異**：Owner 指示「架構正確性、產品深度、擴充性優先於短期方便」。v1 以「3a 不改引擎、不升版」為前提，
> 把組合器放在指紋清單外——那是為短期方便做的設計，會讓戰術真相繼續分散在三個投影與兩份白名單裡，也沒處理
> Live／Challenge 組裝不一致與賽季統計模型不讀戰術兩個結構問題。**v2 撤回該前提**，改為下列長期架構。
> 所有「現況」敘述均以 `檔案:行號` 對照程式；凡標「需新引擎能力」者，現在的引擎**做不到**，不得先上 UI。

---

## 目錄
0. 一頁摘要
1. 需求與成功標準
2. 現況 Audit（結構問題清單）
3. 設計原則
4. 長期系統架構
5. 核心資料契約
6. 戰術維度模型（職業宏觀深度）
7. 16 項素質、個性、配合度、主 Call、英雄特性、對手戰術的交互
8. 一次教練介入：跨模式設計
9. 單機賽季與線上對戰操作流程
10. 線上權威模擬、指令紀錄、反作弊與公平性驗證
11. 現有系統：保留／重構／淘汰
12. 版本、相容與資料遷移
13. 工程分期、依賴與驗收 Gate
14. UI／UX 設計
15. 技術風險與對策
16. Owner 待決問題（grilling 第一輪）
17. 不在範圍

---

## 0. 一頁摘要

**目標**：一套能長期擴充的電競經理人戰術系統——玩家（教練）以職業語言組出戰術計畫，計畫透過選手的能力、個性、配合度、主 Call 與英雄特性**在場上被執行**，並與對手的計畫互動；同一套規則服務單機賽季、快速模擬、觀戰、同步線上、非同步線上。

**五個架構支柱**

| 支柱 | 作用 | 解決的現況問題 |
|---|---|---|
| **① MatchSetup.v1 ＋ 唯一組裝器** | 每一場比賽（任何模式）只有一份正規化輸入、一支組裝函式 | Live 與 Challenge 組裝不一致（Challenge 沒有英雄技能／裝備／佈局）；工具各自組裝 |
| **② TacticPlan.v2（只含選擇）** | 戰術計畫只存列舉值、排序、席位指派、條件規則——**沒有任何數值** | 戰術真相分散在 `toEngineTactic`／`toEngineTacticIdentity`／變體白名單；數值可被竄改 |
| **③ Tactic Resolver（純函式、版本化）** | 計畫＋陣容（素質／個性／英雄）＋對手可見資訊 → 引擎可執行的**隊伍方針與席位指令** | 素質、英雄特性與戰術之間沒有交互，只是各自加總 |
| **④ Tactical Director（引擎內指揮層）** | 依時期與條件切換方針，經 **Team Call（v20）由主 Call 發令**，選手依既有回應模型執行 | 引擎沒有時期切換、條件應變、中途介入；Team Call 只由「最近者」發話 |
| **⑤ Capability Registry ＋ Command Log** | 每個戰術維度登記「引擎掛點、最低模擬版本、驗證 gate」；比賽中所有教練指令以決定性 tick 記錄 | 假選項只能靠人工審；線上無指令紀錄、無法重算 |

**分期**：3a 地基（統一組裝＋新契約＋解析器＋UI；Live 行為與 v20 逐位元對等，Challenge 因補齊技能／裝備／佈局而修正，故升 v21）→ 3b 深度（指揮層、席位任務、主 Call、團戰指揮、包夾、資源交換、兵線、條件應變、單機教練介入）→ 3c 跨模式（非同步預約介入、同步線上協議規格、賽季統計模型校準、多路帶線）。每階段各自 Release、各自可停。

---

## 1. 需求與成功標準

**Owner 要求（本輪）**：共用規則跨單機賽季／線上 PvP／觀戰／快速模擬；職業級多維戰術；自由組合且與素質、個性、配合度、主 Call、英雄、對手**真正交互**；一場一次教練介入並分別設計三種模式的公平規則；重審九個既有系統；允許必要重構、新契約與遷移；預先設計線上權威、指令紀錄、決定性、版本、反作弊；UI 新手可用、進階可深。

**成功標準（可驗證）**
- S1 **真實性**：Registry 中每個「上線中」的戰術選項，都有 gate 證明同 seed 下「選 vs 不選」改變其宣稱的場上事件（新 seeds、樣本量足夠）。
- S2 **交互性**：同一個任務，執行者的相關素質越高，任務事件的成功率可量測地越高；同一份計畫對不同對手計畫的結果分布不同。
- S3 **跨模式一致**：同一份 `MatchSetup`＋同一份指令紀錄，在 Live、無畫面快速模擬、Challenge、（未來）伺服器裁決產生**逐位元相同**的結果雜湊。
- S4 **可重算**：任何一場（含教練介入）可由 `MatchSetup`＋`CommandLog`＋模擬版本完整重算；Replay 可標示並還原介入時點。
- S5 **相容**：既有 Replay 可播放；既有存檔可遷移；歷史挑戰依 `canReplay` 規則明確拒絕或照舊。
- S6 **易用**：新手三步內上場；進階玩家可組到席位任務與條件應變；桌機與 390px 流程完整。

---

## 2. 現況 Audit（結構問題清單）

| # | 問題 | 證據 | 影響 |
|---|---|---|---|
| A1 | **Live 與 Challenge 組裝不同的引擎** | `useLocalServer.js` 呼叫 `configureHeroSkills`／`configureItems`／`configureObjectiveLayout`；`challengeRunner.js:137–194` 都沒有 | 同陣容在兩模式是不同模擬；v20 驗收中 Challenge 巨龍側偏差與正式對戰不同的根因之一 |
| A2 | **引擎組裝散落** | `configureMatch` 等在 src 5 處、tools 24 支腳本各自組裝 | 新增任何輸入都要改 N 處，極易漏 |
| A3 | **戰術真相分散** | `MobaTacticConfig.js` 兩個投影（`toEngineTactic` 13 knob、`toEngineTacticIdentity`）＋`tacticVariant.js` 白名單／禁改清單 | 禁改清單已過時（把 v17 已映射的時期與 carryPriority 鎖住）；同一事實三處維護 |
| A4 | **契約含原始數值** | `macro.aggression` 等 0–1 數值直接是契約欄位 | 線上必須重驗每個數值；UI 容易做成假精確滑桿 |
| A5 | **戰術只在開局設定一次** | `LogicEngine.js:364–411`（`tk`、`tid` 只在 `configureMatch` 寫入） | 無時期切換、無條件應變、無中途介入 |
| A6 | **Team Call 沒有主 Call** | v20 由最近者發話（`LogicEngine.js:3222–3258`），回應吃發話者 leadership | 「主 Call」無法表達；leadership 的價值取決於誰剛好最近 |
| A7 | **戰術以隊伍為單位，沒有席位任務** | `lanePlan` 依位置，非依選手；`carryPriority` 只有路名 | 無法指定「誰開團、誰帶線、誰保誰」 |
| A8 | **賽季 AI 對 AI 不讀戰術** | `simulateFixture.js:13`「不碰 LogicEngine」、只用 `teamStrength` | AI 隊伍的戰術風格對聯賽結果無影響；跨模式規則不共用 |
| A9 | **未映射欄位** | `heraldPriority`、`jungleResourceShare`、`vision.*`；素質 `accuracy`、`learning` 無 MOBA 作用點 | 任何 UI 不得暴露 |
| A10 | **MatchConfig 不是正規化輸入** | `launchConfigOf`（`matchSession.js:252`）只有 sessionId／mode／seed／opponent；戰術、天賦、出裝散在 `activeMatch.config` | 線上裁決無法用單一雜湊描述「這一場的輸入」 |
| A11 | **Challenge 快照只存戰術 id** | `challengeRunner.js:133–160` | 自訂戰術無法表達 |
| A12 | **指紋以原始碼語意計算** | `check_simulation_version_gate.mjs:73`；清單含 `LogicEngine.js`、`MobaTacticConfig.js`、`challengeRunner.js`、`mobaPlayerStats.js` 等 | 任何引擎相關改動必升版（這是正確的紀律，不是要繞過的限制） |

**可直接沿用的資產**：16 項素質→行為偏移（`mobaPlayerStats.js`，14 項有作用點、紅線清楚）；v20 Combat Intent 與 Team Call 回應模型（`_answerCallV20` 已吃距離、血量、定位、comms、synergy、發話者 leadership、風險傾向）；英雄戰鬥原型（`MOVEMENT_PROFILES`：engage／hold／kite／flank／protect／zone；`TARGETING_PROFILES`；`heroTags`）；Online Foundation（`battleTalentBinding` 的「客戶端只送選擇」模式、`matchAdjudication` 的 inputsHash、Ed25519 簽章信封）；Replay 的「只附加 optional 欄位」演進慣例；`canReplay` 的版本拒絕紀律。

---

## 3. 設計原則

1. **單一輸入、單一組裝、單一規則**：所有模式從 `MatchSetup` 經同一支組裝器建立引擎；差別只在「誰推進 tick、是否繪製」。
2. **契約只存選擇，數值只存在版本化的解析器**：線上只需驗「選擇合法」；平衡調整＝升解析器版本，不改玩家資料。
3. **真實性由結構保證**：UI 只能渲染 Capability Registry 中「在本模擬版本上線、且有 gate」的選項。沒有掛點的維度在資料層就不存在於可選清單。
4. **計畫→指令→執行三層分離**：教練寫計畫；指揮層依情境把計畫轉成指令；選手依既有決策模型決定是否、多快、多好地執行。素質與個性只在「執行」層起作用，不在計畫層加成。
5. **無傷害／勝率倍率**：延續 S28 紅線。戰術與素質只改傾向、門檻、優先序、目標選擇、參與與時機。
6. **決定性與可重算**：不新增亂數；條件評估在固定 tick 節奏；所有外部輸入（教練指令）帶 tick；`MatchSetup`＋`CommandLog`＋版本＝完整重算。
7. **對稱**：玩家能用的，AI 教練用同一套契約、同一支解析器、同一套指令。
8. **版本紀律**：每個改變模擬語意的階段升 `moba-sim`；歷史版本指紋全保留；`canReplay` 明確拒絕跨版本重算。

---

## 4. 長期系統架構

```
                ┌──────────────────────── 經營層（不進模擬） ────────────────────────┐
                │  TacticBook（玩家戰術書：模板／自訂／條件）  Scouting（對手情報）    │
                │  Doctrine／Mastery（流派與熟練：解鎖深度，不解鎖數值）               │
                └───────────────┬──────────────────────────────────────────────────┘
                                │ 選擇（ID／列舉／排序／席位）
                                ▼
 ┌──────────── MatchSetup.v1（每場唯一正規化輸入，含 inputsHash）─────────────┐
 │ seed · simVersion · ruleset · layout · mode                                    │
 │ sides.{blue,red}: roster(16 素質＋個性) · heroes · spells · talents · items     │
 │                    · TacticPlanBinding（計畫的選擇＋計畫雜湊）                    │
 └───────────────┬──────────────────────────────────────────────────────────────┘
                 │  assembleMatch(setup)  ← 唯一組裝器（Live／Headless／Challenge／Server／tools）
                 ▼
 ┌─────────────── 模擬核心（在指紋清單內）────────────────────────────────────────┐
 │ Tactic Resolver vN（純函式）                                                   │
 │   plan × roster × heroes × 對手可見資訊 → TeamDoctrine（隊伍方針）＋SeatOrders    │
 │ LogicEngine                                                                    │
 │   Tactical Director（每隊一個）：時期切換、條件應變、套用教練指令（CommandLog）    │
 │        │ 以 Team Call 發令（主 Call 發話；leadership／comms／synergy 影響傳遞）     │
 │        ▼                                                                       │
 │   既有決策點：Combat Intent、兵線、Gank、遊走、帶線、物件評估、撤退、團戰投入     │
 │   ＋新決策點（3b）：兵線控制、包夾、資源交換、團戰目標優先、多路帶線（3c）         │
 └───────────────┬──────────────────────────────────────────────────────────────┘
                 │ snapshot / events / tacticExec / directorLog
      ┌──────────┼───────────────┬─────────────────────┐
      ▼          ▼               ▼                     ▼
  T0 Live 觀戰   T1 Headless      Replay（逐格＋        Result／賽季
  （畫面、介入）  快速完成／Challenge  CommandLog 標記）   （BattleResult、FixtureOutcome）
                ／伺服器裁決
                                 T2 統計模擬（AI 對 AI 大量賽程）
                                    teamStrength ＋ TacticMatchup 模型（由 T1 批次校準、版本化）
```

### 4.1 模擬分層（同一套規則，不同保真度）
| 層級 | 引擎 | 用途 | 規則一致性 |
|---|---|---|---|
| **T0 Live** | LogicEngine＋畫面 | 玩家觀戰、教練介入 | 基準 |
| **T1 Headless** | 同一個 LogicEngine，無畫面（Worker／Node） | 快速完成、Challenge、伺服器裁決、玩家跳過的賽程 | 與 T0 **逐位元相同**（S3 gate） |
| **T2 統計** | `simulateFixture`＋**TacticMatchup**（新） | 賽季 AI 對 AI 大量場次 | **校準**到 T1（3c）；明確標示為近似、版本化 |

> T2 不是第二套規則：它的輸入是同一份 `TacticPlan`＋同一支 Resolver 算出的「計畫特徵向量」，輸出由 T1 大樣本批次回歸得出，附 `CalibrationEvidence`。不校準的版本不得宣稱戰術影響聯賽結果。

---

## 5. 核心資料契約

### 5.1 `TacticPlan.v2`（玩家／AI 共用；只含選擇）
```
TacticPlan.v2 {
  schema: "TacticPlan.v2", planId, name, templateId | null,
  winCondition: "early_snowball" | "objective_control" | "split_pressure" | "teamfight_scaling" | "pick_skirmish",
  phases: {                                  // 邊界由 ruleset 定義；v20 現值＝0–8／8–16／16+ 分（LogicEngine.js:429 `_tidPhase`）
    early | mid | late: {                    //   若日後比賽長度往 20–40 分調整，邊界隨 ruleset 升版調整，不寫死在契約
      stance: "aggressive" | "standard" | "defensive" | "scaling",
      focusLane: "top" | "mid" | "bot" | "none",
      grouping: "spread" | "standard" | "group",
      objectiveOrder: ["dragon" | "baron" | "towers"],   // 排序；預示者等引擎有系統時以新列舉加入（Registry 管控），不預留空位
      tradePolicy: "contest" | "trade" | "concede"                  // 資源交換（3b）
    }
  },
  lanes: { top | mid | bot: { stance, wave: "push" | "freeze" | "slowPush" | "standard" } },   // wave＝3b
  jungle: { route: "topside" | "botside" | "flexible", focus: "gank" | "farm" | "invade" },
  seats: { "<seatId>": { mission: Mission, priority: 1 | 2 | 3 } },   // 依「席位」而非路名
  teamfight: { style: "hardEngage" | "pick" | "frontToBack" | "pokeSiege" | "disengage",
               engager: seatId | null, focusTarget: "carry" | "backline" | "nearest" | "lowest",
               peelFor: seatId | null },
  risk: { tolerance: "low" | "mid" | "high", comeback: "stall" | "standard" | "coinflip" },
  comms: { shotcaller: seatId, secondCaller: seatId | null },
  contingencies: [ { id, when: Condition, then: Adjustment, latch: "once" | "while" } ]   // 上限由模式決定
}
Mission = "carry" | "splitPusher" | "engager" | "peeler" | "roamer" | "ganker" | "objectiveControl" | "laneHold"
Condition = 固定詞彙：goldDiff≤/≥k檔、phase=、towersLost≥n、objectiveUp(dragon|baron)、enemySplitPusher、teamDead≥n …
Adjustment = 僅能改計畫中的列舉欄位（例：phases.mid.stance→defensive、seats.X.mission→peeler）
```
- **不含任何數值**：權重、門檻、機率只存在 Resolver。
- **條件與調整都是封閉詞彙**，可窮舉測試；不允許任意表達式。
- `seats` 以席位 id 綁定（b1–b5），由 Lineup 決定誰坐哪個席位；換人不改計畫，Resolver 重算適性。

### 5.2 `TacticPlanBinding.v1`（進入比賽的那一份）
比照 `battleTalentBinding`：只含選擇、`planHash`（正規化後雜湊）、`resolverVersion`、`simVersion`、模板來源。**不修改 `SquadSnapshot.v1`**（避免既有防守快照雜湊變動），與天賦綁定並列進 `MatchSetup`。

### 5.3 `MatchSetup.v1`
```
MatchSetup.v1 { schema, mode: "career" | "general" | "practice" | "challenge" | "ranked" | "spectate",
  seed, simVersion, rulesetId, objectiveLayout,
  sides: { blue | red: { roster, heroes, spells, talentBinding, itemsConfig, tacticPlanBinding, aiCoachProfile? } },
  intervention: InterventionPolicy,         // 依 mode（§8）
  inputsHash }                              // 正規化雜湊；線上裁決輸入即此
```
`assembleMatch(setup) → LogicEngine`：**唯一**組裝器。`useLocalServer`、`challengeRunner`、headless runner、tools、未來伺服器全部改呼叫它。

### 5.4 `ResolvedTactic`（Resolver 輸出，引擎輸入；不落盤）
```
{ resolverVersion,
  doctrine: { 每時期：engageBias, joinBias, retreatShift, commitShift, groupingK, siegeBias, tradePolicy… },
  seatOrders: { seat: { mission, adherence(0–1), roleFit(A–D), laneStance, waveOrder, peelTarget, … } },
  callChannel: { shotcaller, relay, transmission },   // 由 leadership／comms／synergy 推導
  contingencies: [編譯後的條件與調整] }
```
`adherence`／`roleFit` 由 16 項素質、個性、英雄特性推導（§7），**是傾向與執行率，不是傷害**。

### 5.5 `TacticCommand.v1` 與 `CommandLog`
```
TacticCommand.v1 { seq, side, tick, kind: "coachIntervention" | "contingencyFired" | "aiCoachIntervention",
                   payload: { interventionId, targetSeat? }, issuer: "player" | "ai" | "server",
                   commandHash }
CommandLog = 依 (tick, side, seq) 排序；任何模式都記錄（單機也記），進 Result 與 Replay（optional additive）
```

### 5.6 `CapabilityRegistry`（新；防假選項的結構保證）
```
{ dimension: "teams.teamfight.style.pick",
  engineHooks: ["Director.applyDoctrine", "_combatDecisionV3.targeting"],
  minSimVersion: "moba-sim.v22", gate: "check_tactic_truth §TF-PICK",
  status: "live" | "design" | "retired" }
```
UI、模板編輯器、AI 教練只能使用 `status: live` 且 `minSimVersion ≤ 當前版本` 的選項。Registry 本身有 gate：每一列的 hook 必須存在、gate 必須存在且通過。

---

## 6. 戰術維度模型（職業宏觀深度）

| 維度 | 職業語言 | 計畫欄位 | 引擎（現有／新） | 階段 |
|---|---|---|---|---|
| 勝利條件 | 這場靠什麼贏 | `winCondition` | Resolver 依此給各時期預設方針 | 3a |
| 時期節奏 | 對線期／中期／後期 | `phases.*.stance/grouping` | 現有 phaseEngage／phaseJoin → Director 依時期切換 | 3a（對等）／3b（Director） |
| 分路策略 | 強邊、弱邊、打野站邊 | `focusLane`、`jungle.route`、`lanes.*.stance` | 現有 laneOffset／gankWeights；`route` 需新 | 3a／3b |
| 兵線控制 | 推線、控線、慢推、凍線 | `lanes.*.wave` | **需新**（兵線管理決策；H.3 小兵系統可承載） | 3b |
| 壓制 | 線上壓制、入侵 | `stance: aggressive`、`jungle.focus: invade` | 現有 laneAdj／invade | 3a |
| 包夾 | 二打一、三人包抄 | `teamfight.style`＋條件 `enemySplitPusher` | v20 已有 pincer 判斷，**需新**戰術旋鈕與 Team Call 類型 | 3b |
| 分推 | 四一、一三一 | `seats.X.mission: splitPusher` | 四一＝現有 splitLane；**一三一需多路帶線** | 3a（四一）／3c（一三一） |
| 資源交換 | 放龍換塔、跨圖交換 | `phases.*.tradePolicy` | **需新**（對方開物件時的跨圖決策） | 3b |
| 物件優先 | 龍／巴龍／塔 | `objectiveOrder` | 現有 dragonJoin／baronJoin／siegeBias＋v20 物件雙評估 | 3a |
| 團戰指揮 | 開團、抓單、前排推進、消耗、撤團 | `teamfight.style/engager/focusTarget/peelFor` | 現有 Combat Intent、TARGETING／MOVEMENT_PROFILES；**需新**目標優先覆寫 | 3b |
| 選手角色 | 核心、帶線、開團手、保排、遊走 | `seats.*.mission` | 現有帶線／遊走／護人；**需新**席位級任務 | 3a（對等）／3b |
| 主 Call | 誰指揮 | `comms.shotcaller` | **需新**（Team Call 發話者指定） | 3b |
| 條件應變 | 落後怎麼打、對面帶線怎麼辦 | `contingencies` | **需新**（Director 條件評估） | 3b |
| 落後策略 | 拖、穩、賭 | `risk.comeback` | 現有 `_teamBehindV3` 擴充 | 3b |
| 視野、預示者、金流分配 | — | — | 引擎無系統 | **不列入**（Registry 標 `design`，UI 不出現） |

---

## 7. 交互：素質、個性、配合度、主 Call、英雄特性、對手戰術

**原則：計畫決定「要做什麼」，人與英雄決定「做不做、多快、做得多好」。** 全部在 Resolver（推導執行率）與既有決策點（實際執行）完成，不加任何戰力倍率。

| 元素 | 在哪裡起作用 | 具體交互 |
|---|---|---|
| **16 項素質** | Resolver：`roleFit`、`adherence`；引擎：既有 `toEnginePlayerMods` 偏移 | 帶線者：adaptability／decision／courage／focus（`splitAdj`）決定帶線深度與撤退時機；開團手：courage＋positioning 決定開團時機品質；遊走者：mapAware／comms／decision（`roamSight/Info/Gate`）；物件控制：mapAware／tacticalIQ／focus／comms（`objAdj`） |
| **個性** | 既有 `_riskV19` 風險傾向 | 高風險個性在「穩守」計畫下會偏離（adherence 降低、Combat Intent 仍偏 All-in）；在「強開」計畫下如魚得水。**偏離本身是可觀察的劇情**（賽後顯示「誰沒照計畫打」） |
| **配合度（默契）** | `synergy`（`commitAdj`）、`comms`（`roamInfoAdj`）；Team Call 回應 | 指令傳遞率與團戰同步（現有 tfObs 同步窗）；低配合度隊伍的複雜計畫（多條件、多任務）執行率下降——**複雜度有代價** |
| **主 Call** | Team Call 發話者＝`shotcaller` | leadership 影響全隊跟隨（`roamFollowAdj` 已存在於回應分數）；主 Call 陣亡時由 `secondCaller` 接手、無則退回最近者；主 Call 本身 decision／tacticalIQ 影響條件觸發時機的「判讀延遲」 |
| **英雄特性** | Resolver：`roleFit`；引擎：既有原型 | `MOVEMENT_PROFILES` engage 英雄當開團手 roleFit 高；flank／kite 適合帶線或抓單；protect 適合保排；`heroTags` 推導陣容特性（開團數、帶線能力、後期強度）→ 確認頁提示「陣容與計畫不合」 |
| **對手戰術** | Resolver 讀「對手可見資訊」；Director 讀場上狀態 | 條件詞彙含對手行為（`enemySplitPusher`、對手開龍）；Scouting 提供對手近期計畫類型；AI 教練依對手選計畫（§9.3） |

**交互的可驗證性（S2）**：每條交互都有 gate——例：固定計畫「帶線」，僅改帶線者的 `splitAdj` 相關素質（高／低），新 seeds 配對，帶線產生的推塔與被抓率有方向一致的差異。

---

## 8. 一次教練介入：跨模式設計

### 8.1 共同核心（所有模式一致）
- **一場一次**（每隊）。介入＝從**介入卡庫**選一張（6 張起：全員控龍、推進拆塔、穩住發育、主動開團、一人帶線、保護核心；3b 再加「包夾帶線者」「放龍換塔」）。
- 介入內容＝**計畫的封閉調整**（與 `contingencies.then` 同一詞彙），持續到「下一個時期邊界」或 90 秒（ruleset 定義），之後回到計畫。
- 生效：記為 `TacticCommand.v1`，在**指定 tick 的決策邊界**由 Director 套用，並由主 Call 以 Team Call 發令；選手依既有回應模型執行。
- 雙方可見：介入生效時，**雙方**畫面都顯示「X 方教練介入：◯◯」（資訊對稱；職業比賽中暫停也是公開的）。
- 決定性：同 `MatchSetup`＋同 `CommandLog` ⇒ 逐位元相同。

### 8.2 各模式規則
| 項目 | 單機（生涯／一般對戰） | 同步線上（Ranked 即時，未來） | 非同步線上（Challenge） |
|---|---|---|---|
| 暫停 | **可暫停**：打開介入面板時模擬停止（1×）；2×／4× 自動降回 1× 並暫停 | **不暫停**；介入面板最多開 10 秒（真實時間） | 無即時操作 |
| 指令時點 | 關閉面板當下的 tick＋1 | 伺服器收到時的 tick＋**固定延遲 D**（例 4 sim 秒），雙方同步生效 | 賽前預約：`autoIntervention { when: Condition, interventionId }` |
| 對手 AI | AI 教練依決定性觸發條件介入一次 | 真人對真人；斷線方由 AI 託管 | 防守方的預約介入存在其快照綁定中；挑戰方同樣只能預約（**排位挑戰**）；休閒挑戰可允許挑戰方即時介入（明確標示「不計排位」） |
| 斷線 | 不適用（本機） | 斷線方：計畫照跑＋若有預約介入則依條件觸發；**不會**自動用掉手動介入；重連可繼續觀戰與介入（若未用） | 不適用 |
| AI 託管 | 玩家「快速完成」時：未用的介入改由玩家預設的預約介入（若有）觸發，否則不使用 | 斷線、逾時未回應 | 全程 |
| Replay 還原 | CommandLog 標記；跳到該 tick 顯示介入卡與主 Call 發令 | 同左（伺服器簽章的 CommandLog） | 同左 |
| 反作弊 | 不需要 | 伺服器權威：客戶端只送 `interventionId`；伺服器驗剩餘次數、合法性、蓋 tick | 預約內容進快照雜湊與簽章 |

### 8.3 為什麼同步線上要「固定延遲 D」
不同網路延遲的玩家，如果以「收到時刻」立即生效，延遲低者有優勢。固定延遲讓生效 tick＝伺服器收到 tick＋D，雙方在同一個 tick 看到效果；D 同時是「對手看到預告、可以反應」的視窗（可選：是否先顯示預告，§16 Q6）。

---

## 9. 單機賽季與線上對戰操作流程

### 9.1 單機賽季（一場比賽）
```
賽程頁（下一場對手） → 對手情報（近期計畫類型、核心選手、陣容傾向）
 → 陣容與席位（Lineup：誰坐 b1–b5）
 → Ban/Pick（既有）
 → 戰術書：選模板／載入我的戰術書 → 調整（快速／標準／專業）
     · 即時指標：計畫輪廓、席位任務適性（16 素質＋英雄）、配合度負擔、矛盾提示、陣容契合
 → 確認頁（計畫摘要、預約介入、主 Call）
 → 載入 → 觀戰（1×／2×／4×；可介入一次；可快速完成＝T1 headless，結果相同）
 → 結算（計畫執行報告：哪些任務達成、誰偏離計畫、介入效果、主 Call 傳遞率）
 → Replay（時間軸含介入與條件觸發標記）
```
跳過整場（不觀戰）：T1 headless 直接結算（與觀戰結果逐位元相同），預約介入照常觸發。

### 9.2 賽季層（AI 對 AI）
T2 統計模擬，使用 AI 隊伍的計畫特徵；3c 前 T2 **不讀戰術**（維持現狀並明示），3c 校準後才讓戰術影響聯賽。

### 9.3 AI 教練（對稱）
`aiCoachProfile { philosophy（對應 style）, adaptability, scoutingDepth }` → 依**自己選手的素質與英雄**組計畫、依**對手近期計畫**調整（adaptability 高才調整）→ 決定性（seed＋賽程 id）。AI 也有一次介入（決定性條件觸發）。

### 9.4 同步線上（未來；本輪只定規格）
```
配對 → 伺服器簽發票券（含 simVersion、resolverVersion）
 → 雙方 Ban/Pick → 雙方各自鎖定 TacticPlanBinding（逾時＝最後儲存的計畫或模板）
 → 伺服器建立 MatchSetup、算 inputsHash、權威模擬（T1）
 → 客戶端收逐格 snapshot 觀戰；介入只送 interventionId
 → 伺服器簽出 AdjudicatedMatchResult（含 CommandLog 雜湊）
```

### 9.5 非同步線上（Challenge）
防守方提交：陣容快照（既有 `SquadSnapshot.v1`）＋`TacticPlanBinding`＋預約介入；挑戰方同樣提交；Runner 以 `assembleMatch` T1 模擬；結果與 CommandLog 存檔。

---

## 10. 線上權威模擬、指令紀錄、反作弊與公平性驗證

| 面向 | 設計 |
|---|---|
| 權威 | 伺服器跑 T1；客戶端結果永遠不是裁決依據（延續 `matchAdjudication.js`） |
| 輸入 | `MatchSetup.inputsHash`＝陣容快照雜湊＋天賦綁定雜湊＋計畫綁定雜湊＋seed＋版本；伺服器重算並比對 |
| 指令 | 客戶端只送 `interventionId`（＋可選目標席位）；伺服器驗：剩餘次數、卡片在本版本 Registry 為 live、目標合法；伺服器蓋 tick；`commandHash` 串接（每筆含前一筆雜湊）防插入／重排 |
| 版本 | 票券登記 `simVersion`＋`resolverVersion`＋`interventionDeckVersion`；不符一律拒 |
| 數值竄改 | 契約沒有數值可改；Resolver 只在伺服器與客戶端同版本執行 |
| 公平性驗證 | 離線批次：(a) 同 setup 在 T0／T1／伺服器 runner 結果雜湊一致；(b) 各模板與隨機合法計畫的勝率分布、STANDARD／SWAPPED side bias、時長；(c) 介入延遲 D 的對稱性測試（雙方在同 tick 介入時的處理順序固定：blue 先 red 後並同 tick 生效） |
| 資訊對稱 | 雙方看到相同的公開資訊（介入公告、主 Call 發令不公開內容）；Scouting 只用公開歷史 |

---

## 11. 現有系統：保留／重構／淘汰

| 系統 | 決定 | 理由與做法 |
|---|---|---|
| `MobaTacticConfig.v1`（契約） | **降級為 Legacy 格式、凍結** | 含原始數值、依位置不依席位、兩個投影。保留為遷移來源與 Legacy 文案；新程式不再以它為輸入 |
| `toEngineTactic`／`toEngineTacticIdentity` | **淘汰為主路徑** | 由 Resolver 取代；3a 期間作為「對等基準」：Resolver 對經典模板的輸出必須等價於這兩個投影（gate），之後移出生產路徑，只留給歷史工具 |
| m1～m8 | **保留為「經典模板」** | Legacy 文案逐字保留；以 `TacticPlan.v2` 表達（遷移表），並與模板 v2 並列 |
| `TacticVariant.v1` | **重構為 PlanOverlay** | 保留「宣告式取捨」精神；改為對 `TacticPlan.v2` 的封閉調整；過時的禁改清單由 Capability Registry 取代 |
| Doctrine／ClubMastery | **保留、改接計畫** | 流派由計畫特徵推導（函式），不再查戰術 id 表；熟練度解鎖**深度**（條件槽、介入卡、模板），不解鎖數值；既有計數遷移（§12） |
| Team Call（v20） | **保留並升格為指揮通道** | Director 經主 Call 發令；新增呼叫類型（包夾、交換、集結、撤團）；回應模型沿用 |
| LogicEngine | **保留核心＋新增 Tactical Director 模組** | Director 為獨立檔（在指紋清單），引擎決策點逐步改讀 `director.orderFor(seat)`；`tk`／`tid` 直接讀取點收斂到 Director（一次一個決策點，各有等價 gate） |
| MatchConfig（`launchConfigOf`／`activeMatch.config`） | **重構為 MatchSetup.v1** | 單一正規化輸入＋inputsHash；`activeMatch.config` 改存 setup 參照 |
| Challenge（`challengeRunner`） | **重構** | 改用 `assembleMatch`（修 A1）；快照外掛 `TacticPlanBinding`；預約介入；`SquadSnapshot.v1` 不改 |
| Replay（`MobaReplay.v1`） | **保留、附加 optional** | `tacticPlanSummary`、`commandLog`、`directorEvents`；播放仍是逐格；不需 v2 |
| 賽季 `simulateFixture` | **重構（3c）** | 加 TacticMatchup 元件，升 `SIMULATOR_VERSION`；歷史賽果不可變（D11）不重算 |
| 工具腳本 24 支組裝 | **重構** | 全部改用 `assembleMatch`（分批，各支 gate 結果需與重構前一致） |

---

## 12. 版本、相容與資料遷移

| 項目 | 方案 |
|---|---|
| 模擬版本 | 3a（統一組裝＋Resolver 對等）→ `moba-sim.v21`：**Challenge 語意改變**（補上技能／裝備／佈局），Live 對等；3b → v22；3c 的多路帶線／T2 校準 → v23／SIMULATOR_VERSION 升版 |
| 指紋清單 | 新增 `tacticResolver.js`、`tacticalDirector.js`、`matchSetup.js`（組裝器）、`interventionDeck.js`；v1～v20 指紋全保留 |
| 舊 Replay | 逐格播放不受影響；無 `commandLog` ⇒ 無標記 |
| 歷史挑戰 | v20 以前由 `canReplay` 明確拒絕（既有慣例）；顯示快照中保存的戰術名稱，不查新表 |
| 存檔遷移 | 新切片 `tacticBook`（雲端，`CLOUD_PROFILE_KEYS`）；`activeMatch.config.tactic`（v1 config）→ 啟動時以遷移表轉 `TacticPlan.v2`；`clubMastery.tacticUsage`（以 m1～m8 為鍵）保留原鍵並新增 `planUsage`（以 templateId／doctrine 為鍵）；遷移冪等、可重跑、失敗隔離（沿用 B1C `.corrupt` 原則） |
| Challenge 防守快照 | 既有防守方（只有戰術 id）⇒ 以經典模板遷移成 `TacticPlanBinding`（標記 `source: "legacyMigrated"`）；`SquadSnapshot.v1` 雜湊不變 |
| 線上 | 票券新增 `resolverVersion`、`interventionDeckVersion` 欄位（Online Foundation 契約升版，屆時處理既有斷言） |

---

## 13. 工程分期、依賴與驗收 Gate

```
3a 地基 ──► 3b 深度 ──► 3c 跨模式
 │           │            │
 ├ MatchSetup＋assembleMatch（先）      ├ Director（依賴 Resolver）       ├ 非同步預約介入（依賴 3b 介入）
 ├ TacticPlan.v2＋遷移                  ├ 席位任務／主 Call／團戰指揮      ├ 同步線上協議規格＋伺服器 runner 介面
 ├ Resolver v1（對等）                  ├ 兵線／包夾／資源交換            ├ T2 TacticMatchup 校準
 ├ Capability Registry                  ├ 條件應變                        ├ 多路帶線（一三一）
 ├ UI：戰術書（快速／標準）＋指標        ├ 單機教練介入＋CommandLog        ├ Scouting 深化
 └ AI 教練 v1（依 style＋素質）          └ UI：專業模式＋介入面板          └ Challenge 自訂計畫上線
```

### 3a 地基（`moba-sim.v21`）
| 交付 | 驗收 Gate |
|---|---|
| `MatchSetup.v1`＋`assembleMatch`；Live／Challenge／headless 改用 | **G-A1 跨模式一致**：同 setup 在 Live 驅動（無畫面）、headless、Challenge 結果雜湊逐位元相同；**G-A2** Live 結果與 v20 逐位元相同（Live 對等） |
| `TacticPlan.v2`、遷移表、`TacticPlanBinding.v1` | **G-A3** 經典模板經 Resolver 的輸出 ≡ 既有兩個投影（逐欄）；遷移冪等 |
| Resolver v1（只實作 v20 已有行為） | **G-A4 對等**：用經典模板跑 Live，結果與 v20 逐位元相同 |
| Capability Registry | **G-A5**：每個 live 選項有 hook、有 gate、gate 通過；UI 渲染清單＝Registry live 清單 |
| 戰術書 UI（快速／標準）、指標、確認頁 | **G-A6** 桌機＋390 瀏覽器 gate；**G-A7 真實性**：每個 live 選項配對 seeds 有效果 |
| AI 教練 v1 | **G-A8** 決定性；主導計畫掃描（STANDARD／SWAPPED、新 seeds）；side bias 不劣於 v20 |
| 存檔遷移 | **G-A9**：舊存檔載入→遷移→再存→再載入一致；B1B／B1C／B1D 既有 gate 全綠 |

### 3b 深度（`moba-sim.v22`）
| 交付 | 驗收 Gate |
|---|---|
| Tactical Director、時期切換 | **G-B1**：無條件、無介入的計畫 ⇒ 與 3a 行為對等（決策點逐一搬遷，每點一個等價 gate） |
| 席位任務、主 Call、團戰指揮、包夾、資源交換、兵線 | **G-B2 真實性**（每個新選項）；**G-B3 交互**（素質高低、英雄原型對任務事件的方向性） |
| 條件應變 | **G-B4**：條件觸發決定性；每個 Condition 詞彙有觸發／不觸發測例 |
| 單機教練介入＋CommandLog＋Replay 標記 | **G-B5**：同 setup＋同 log ⇒ 逐位元相同；Replay 跳到介入 tick 顯示正確；暫停／倍速降速行為 |
| UI 專業模式、介入面板、賽後執行報告 | **G-B6** 桌機＋390 |
| 平衡 | **G-B7**：主導計畫掃描、時長分布、side bias、介入卡勝率影響（不得有「必用卡」） |

### 3c 跨模式
| 交付 | 驗收 Gate |
|---|---|
| 非同步預約介入、Challenge 自訂計畫 | **G-C1**：Challenge 重算一致；預約條件觸發決定性 |
| 同步線上協議規格（不實作伺服器）＋伺服器 runner 介面（Node headless 可跑） | **G-C2**：伺服器 runner 與客戶端 headless 雜湊一致；延遲 D 對稱測試 |
| T2 TacticMatchup 校準 | **G-C3**：預測勝率與 T1 批次差 ≤ 容忍值；附 CalibrationEvidence；未通過不得宣稱戰術影響聯賽 |
| 多路帶線 | **G-C4** 真實性＋平衡 |

**驗證成本控管**（v20 的教訓）：大樣本量測一律分批、可續跑、最多 3–4 個運算行程，避免與 CS 測試並行；可疑結果用**事前指定的新 seeds** 重驗後才判 blocker。

---

## 14. UI／UX 設計

### 14.1 三種深度（同一個畫面，不是三套 UI）
| 深度 | 看得到的內容 | 目標玩家 |
|---|---|---|
| **快速** | 選模板＋3 個核心選擇（勝利條件、強邊、物件第一）＋確認 | 新手、手機快速開場 |
| **標準** | 五層：時期／分路／資源／團戰／風險 | 一般玩家 |
| **專業** | 席位任務、主 Call、條件應變、預約介入 | 進階玩家（流派熟練度解鎖條件槽數） |

### 14.2 手機（390px）
```
① 對手情報  ② 戰術書  ③ 確認          ← 步驟條
┌──────────────────────────────┐
│ 模板 ◀ 前期壓制｜龍坑運營｜… ▶  │  分類：前期／控圖／分推／團戰／穩健／經典
│ 深度 [快速][標準][專業]         │
│ 勝利條件 [滾雪球][控資源][…]    │
│ 強邊     [上][中][下]           │
│ 物件     ⠿巨龍 ⠿推塔 ⠿巴龍      │
│ ▸ 時期節奏                      │  摺疊
│ ▸ 團戰與風險                    │
├──────────────────────────────┤
│ 計畫輪廓 ◢◣  配合度負擔 ▮▮▯▯   │
│ ⚠ 2 則提示（點開）               │
│            [下一步 →]           │
└──────────────────────────────┘
專業模式・席位任務（每位選手一張卡）
┌──────────────────────────────┐
│ b1 Kaiser（上）任務 [帶線▾]  B │ 強 adaptability 88／弱 focus 61
│ b2 Nacht（野）  任務 [抓人▾]  A │ 英雄：flank ✓
│ … 主 Call [Nacht▾]  leadership 84 │
│ 條件 1：若 落後 ≥3k 且 中期 → 穩住發育 │
│ [+ 新增條件]（剩 1 格）           │
└──────────────────────────────┘
```

### 14.3 桌機（1366）
```
┌ 左：組裝（模板列＋深度切換＋分層面板） ┬ 右：即時指標                     ┐
│ 模板分類列                           │ 計畫輪廓（6 軸，傾向非勝率）        │
│ 勝利條件／時期／分路／資源／團戰／風險 │ 席位任務適性（5 人 × 素質＋英雄）   │
│ 席位任務（專業）  主 Call  條件應變    │ 配合度負擔（計畫複雜度 vs synergy）  │
│                                      │ 陣容契合（heroTags）  對手情報       │
│                                      │ ⚠ 矛盾提示（每條附模擬證據）         │
└──────────────────────────────────────┴───────────────────────────────────┘
                                          [存成我的戰術書] [確認上場 ▶]
```

### 14.4 觀戰中
- HUD：`[📋 教練介入 ×1]`；主 Call 發令以小字顯示在戰報（例：「Nacht：全員往龍坑集合」）。
- 介入面板：6 張卡，每張寫「會改變什麼」與「持續到何時」；單機會暫停。
- 雙方介入公告橫幅；Replay 時間軸有介入與條件觸發的標記。

### 14.5 賽後「計畫執行報告」
任務達成（例：帶線推塔 3／目標 2）、偏離計畫的選手與原因（個性／血量／指令未收到）、介入前後 90 秒的關鍵事件、主 Call 傳遞率。**這是讓玩家理解「戰術真的有用」的關鍵回饋。**

---

## 15. 技術風險與對策

| 風險 | 等級 | 對策 |
|---|---|---|
| 範圍過大 | 高 | 三階段各自 Release、各自可停；3a 只做地基與對等，不加新行為 |
| Director 重構引入回歸 | 高 | 決策點逐一搬遷，每點一個等價 gate（3a 對等基準）；搬遷期間不同時改行為 |
| 統一組裝改變 Challenge 結果 | 中 | 明確升 v21；歷史挑戰依 `canReplay` 拒絕並顯示原因；屬修正既有不一致，Owner 需知情 |
| 假選項 | 高 | Capability Registry＋真實性 gate；UI 只渲染 live 選項 |
| 主導計畫／必用介入卡 | 中 | 每階段主導掃描；AI 教練對稱；介入卡不含數值 |
| side bias（v20 已觀察） | 中 | 所有掃描分 STANDARD／SWAPPED、事前指定新 seeds、Challenge 也依 seed 決定佈局（統一組裝後自然達成） |
| 驗證耗時與記憶體 | 中 | 分批、可續跑、≤ 4 行程、不與 CS 並行；verify.mjs 新增區段 |
| T2 校準漂移 | 中 | 每次 simVersion 升版必重新校準；未校準即不讀戰術（明示） |
| 存檔遷移失敗 | 中 | 冪等、隔離、可重跑；B1B／B1C gate |
| 線上延遲公平 | 中（未來） | 固定延遲 D、伺服器蓋 tick、雙方同 tick 生效 |
| UI 複雜度 | 中 | 三種深度；手機摺疊；專業功能由熟練度逐步解鎖 |
| 節奏（v20 中位約 18.5 分） | 低 | 主導掃描同時檢查時長；不以戰術強行拉長比賽 |

---

## 16. Owner 待決問題（grilling 第一輪）

❓ **Q1 - 3a 是否接受升 v21 以統一組裝**：統一組裝會讓 Challenge 補上英雄技能、裝備、依 seed 的佈局，Challenge 結果因此改變，歷史挑戰無法重算。
➡️ 建議：接受。這是修正既有不一致（A1），也是跨模式共用規則的前提。

❓ **Q2 - 契約是否「只含選擇、零數值」**：玩家永遠看不到、也調不到 0.65 這種數字；平衡只透過 Resolver 版本調整。
➡️ 建議：是。對線上反作弊與長期平衡都是最穩的基礎。

❓ **Q3 - 席位任務綁「席位」還是「選手」**：綁席位（b1–b5），換人時計畫不變、適性重算；或綁選手 id，換人時任務跟著人走。
➡️ 建議：綁席位。賽季中換人頻繁，計畫應屬於隊伍而非個人。

❓ **Q4 - 熟練度解鎖什麼**：深度（條件槽數、介入卡種類、專業模板），還是也解鎖數值強化？
➡️ 建議：只解鎖深度；Ranked 中所有人槽數相同（公平），生涯中依熟練度。

❓ **Q5 - 同步線上介入是否暫停**：不暫停＋固定延遲 D，或雙方各有一次 30 秒戰術暫停。
➡️ 建議：不暫停＋固定延遲 D。暫停會讓觀戰節奏斷裂，也增加斷線處理複雜度。

❓ **Q6 - 介入是否先預告對手**：生效前 D 秒先公告「藍方教練介入：全員控龍」，給對手反應；或生效時才公告。
➡️ 建議：生效時才公告卡片名稱（不預告），避免介入變成被反制的訊號；但雙方都看得到。

❓ **Q7 - 排位非同步 Challenge 的挑戰方能否即時介入**：只能預約（與防守方對稱），或允許即時（不對稱）。
➡️ 建議：排位只能預約；休閒挑戰可即時並標示「不計排位」。

❓ **Q8 - 賽季 AI 對 AI 何時讓戰術生效**：3c 校準後才生效；或 3a 就用簡化規則。
➡️ 建議：3c 校準後。未校準就讓戰術影響聯賽，等於宣稱一個沒證據的效果。

❓ **Q9 - 玩家自己的賽程被跳過時用哪一層**：T1（真引擎、與觀戰相同）或 T2（統計）。
➡️ 建議：T1。玩家自己的比賽必須與觀戰結果一致，否則「跳過」會變成另一個遊戲。

❓ **Q10 - 經典 m1～m8 的命運**：雙軌保留為經典模板（Legacy 文案逐字）；或改寫。
➡️ 建議：雙軌保留。新模板 v2 依職業宏觀語言重新設計 9～12 個。

❓ **Q11 - 配合度負擔是否成為正式機制**：計畫越複雜（條件數、任務數），低配合度隊伍執行率越低。
➡️ 建議：是。它讓「簡單計畫」也有存在價值，避免全員追求最複雜組合。

❓ **Q12 - 賽後計畫執行報告的優先序**：與 3b 一起（建議），或延後。
➡️ 建議：與 3b 一起。沒有這份報告，玩家感受不到戰術深度。

---

## 17. 不在範圍
Map／Topology（FROZEN）、CS／FPS、Online／DB 實作與伺服器（本輪只定規格）、任何傷害或勝率倍率、視野系統、預示者、金流分配。

---

### 附：參考
- 職業 LoL／傳說對決宏觀語言：勝利條件、強邊／弱邊、兵線管理（推線、控線、慢推）、資源交換、四一與一三一分推、主 Call 與副 Call、落後止血——通行教練與賽評用語，非單一來源。
- [Teamfight Manager（Steam）](https://store.steampowered.com/app/1372810/Teamfight%20Manager)：深度在 Ban/Pick 與英雄搭配；比賽為 1 分鐘死鬥。借鏡「組合感」。
- [Esports Godfather（Steam）](https://store.steampowered.com/app/1278540/)、[Esports Godfather Origin（RAWG）](https://rawg.io/games/esports-godfather-origin)：以選手使用的戰術卡為核心、隨 meta 調整。借鏡「戰術綁在選手身上」。
- ESMO 的差異化：引擎真實模擬宏觀決策——計畫能在場上被看見、被量測、並在賽後被驗證。
