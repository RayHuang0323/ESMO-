// ============================================================================
//  platform/contracts/simulationVersion.js — SimulationVersion.v1（Player Challenge Slice 1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  Challenge 的結果**不存畫面、不存回放**，只存輸入，需要看的時候重算
//  （`docs/design/Player_Challenge_Async_PvP_Architecture_v1.md` §4.1）。
//  「重算得出同一個結果」有三個前提：同一份快照、同一個 `matchSeed`、
//  **同一版模擬語意**。前兩個是資料，第三個不是——它是 `LogicEngine.js`
//  當時的行為，而那份行為會隨版本改變。
//
//  ⇒ 沒有這一層的話，`LogicEngine` 一改版，所有歷史 Challenge 的重播就會
//    默默對不上，而且**看起來像快照漏了欄位**——那是最難查的一種假警報。
//
//  ── 刻意不做的事 ──────────────────────────────────────────────────────────
//  · **不做 migration framework。** 舊版 Challenge 不會被「升級」到新語意。
//  · **不假裝跨版本可以重算。** `canReplay()` 對版本不符一律回 false 並附中文原因，
//    呼叫端要照實告訴玩家「這場是舊版模擬產生的，只能看紀錄，不能重播」。
//    寧可少承諾，不可多承諾——這與 `MATCH_TIER_LABELS` 是同一條原則。
//  · **不自動偵測 `LogicEngine` 改了沒。** 版本是**人宣告**的：改了模擬語意
//    就要手動 bump，而 `tools/check_player_challenge_slice1.mjs` 會釘住
//    「ChallengeInstance 一定帶版本」，不會釘住「版本一定正確」——
//    後者沒有任何程式判得出來，假裝判得出來只會給人虛假的安全感。
//
//  純函式：不 import React / zustand / localStorage / LogicEngine。
// ============================================================================

export const SIMULATION_VERSION_SCHEMA = "SimulationVersion.v1";

/**
 * 目前的 MOBA 模擬語意版本。
 *
 * ⚠ **什麼時候要 bump**：任何會讓「同一份輸入 ＋ 同一個 seed 跑出不同結果」
 *   的改動——`LogicEngine.js` 的數值、判定順序、tick 語意、
 *   `mobaPlayerStats.js` 的 `STAT_MAP` / clamp、`MobaTacticConfig.js`
 *   的 `toEngineTactic()` 映射、`heroProgress.js` 的 `attrs(level)` 曲線。
 * ⚠ **什麼時候不用 bump**：純呈現層、UI、文案、log。
 * ⚠ 版本字串一旦發布就**不可回收再用**：舊 Challenge 存著它。
 */
//  2026-10-09 moba-sim.v21 = **UNRELEASED CANDIDATE**（feature/moba-phase3a，Phase 3a Task 3）。
//   ⚠ 正式站仍是 moba-sim.v20（指紋 050b3f66620f0f57 永不變更；正式站 smoke gate 仍期待 v20）。
//   v21 只因語意檔案清單多收了 matchRuleset.js／matchAssembler.js 而換指紋：
//   Live／Challenge／平衡工具經 assembleMatch 的結果與 v20 golden（tools/fixtures/match_golden_v20.json，
//   39 案）逐位元相同（check_match_assembler_3a）。發布前須由 Owner 決定是否以此版號上線。
export const MOBA_SIMULATION_VERSION = "moba-sim.v21";

/** 已知版本。歷史 Challenge 帶的版本若不在其中 ⇒ 不明版本，一律不可重播。 */
//  ⚠ 舊版本**留著不刪**：它是歷史挑戰「當初用哪一版跑的」的憑據。
export const KNOWN_SIMULATION_VERSIONS = Object.freeze(["moba-sim.v1", "moba-sim.v2", "moba-sim.v3", "moba-sim.v4", "moba-sim.v5", "moba-sim.v6", "moba-sim.v7", "moba-sim.v8", "moba-sim.v9", "moba-sim.v10", "moba-sim.v11", "moba-sim.v12", "moba-sim.v13", "moba-sim.v14", "moba-sim.v15", "moba-sim.v16", "moba-sim.v17", "moba-sim.v18", "moba-sim.v19", "moba-sim.v20", MOBA_SIMULATION_VERSION]);

/**
 * **決定模擬語意的檔案清單**（Slice 2 的版本閘門）。
 *
 * ── 這個清單要解決什麼 ────────────────────────────────────────────────────
 * 光有一個 `MOBA_SIMULATION_VERSION` 欄位是不夠的：它是**人宣告**的，
 * 而人會忘記。忘記的後果不是報錯，是**歷史挑戰默默重播出不同的結果**——
 * 沒有任何程式會發現，玩家也不會發現，直到有人比對舊紀錄為止。
 *
 * ⇒ `tools/check_simulation_version_gate.mjs` 對這些檔案取**語意指紋**，
 *   與下面 `SIMULATION_SEMANTICS_FINGERPRINTS` 裡「目前版本」那一格比對。
 *   對不上 ⇒ 驗證器變紅，逼人做一次判斷：
 *     · 這次改動會改變同一份輸入的結果嗎？
 *       會   ⇒ bump `MOBA_SIMULATION_VERSION` 並替新版本登記指紋
 *       不會 ⇒ 不會發生（純註解／空白／格式**不會**改變語意指紋，見下）
 *
 * ── 為什麼是「語意指紋」而不是原始內容雜湊 ──────────────────────────────
 * ⚠ 初版直接雜湊檔案內容，於是**改一行註解就會紅**。那是 false positive：
 *   規則是「simulation semantics 發生實質變化才要 bump」，而註解不是語意。
 *   讓人習慣「紅了就貼新指紋」，等於把這個閘門訓練成雜訊。
 * ⇒ 現在先用 `esbuild` 做**只去空白與註解**的正規化（不改識別名、不改語法），
 *   再雜湊。⇒ 註解／縮排／換行／格式一律不觸發；**任何真的程式碼改動都會觸發**。
 *
 * ⚠ 它仍然**不判斷**「這個程式碼改動有沒有改變結果」——那沒有程式判得出來。
 *   它只保證：**真的動到程式碼時，沒有人能默默略過那個判斷。**
 * ⚠ 這不是 migration framework。
 * ⚠ 清單漏了檔案 ⇒ 閘門對那支檔案無效。新增任何會進引擎的輸入轉換時，
 *   必須同時把它加進這裡。
 *
 * ── 收與不收的判準：**改它會不會讓「同一份快照」重播出不同結果** ──────
 * 這條界線比「看起來相關嗎」精確得多，而且有實際的分界案例：
 *   · `challengeRunner.js`   **收**。它決定凍結的快照怎麼變成引擎狀態
 *                            ⇒ 改它，同一份舊快照就會重播出不同結果。
 *   · `snapshotAuthority.js` **不收**。它只決定**新**快照裡放什麼
 *                            （例如 Slice 5 改了預設的 draftPolicy）。
 *                            既有快照是凍結的值，重播逐位元不受影響。
 * ⚠ 所以「改了發布邏輯」不等於「要 bump」。要 bump 的是改了**解讀**，
 *   不是改了**生成**。搞混這兩者會讓清單無限膨脹，閘門就變成雜訊。
 */
export const SIMULATION_SEMANTICS_FILES = Object.freeze([
  "src/battle/moba/skills/heroSkillGameplay.js",
  //  2026-09-29：Hero Passive P v1 規則（heroPassivesV1 預設關閉）
  "src/battle/moba/skills/heroPassiveGameplay.js",
  //  2026-10-01（moba-sim.v17）：Hero Power Curve v1——曲線契約與字面表（推導規則 heroPowerCurveDerive.js 只給產生器／gate，不在執行期）
  "src/battle/moba/heroPowerCurve.js",
  "src/battle/moba/heroPowerCurveTable.js",
  "src/battle/moba/skills/heroSkillLevels.js",
  "src/battle/moba/skills/heroSkillTargetCapabilities.js",
  "src/battle/moba/talents/heroBattleTalents.js",
  //  引擎本體：數值、判定順序、tick 語意
  "src/LogicEngine.js",
  //  能力 → 行為 mods 的映射與 clamp
  "src/battle/moba/mobaPlayerStats.js",
  //  戰術 → 行為權重（`toEngineTactic`）
  "src/platform/contracts/MobaTacticConfig.js",
  //  英雄熟練等級 → power/tough 倍率曲線（`attrs`）
  "src/hero/heroProgress.js",
  //  Challenge 的引擎組裝點：dt、時間上限、注入哪些輸入
  "src/platform/challenge/challengeRunner.js",

  //  ── 2026-09-09 Owner Decision：地圖與規則幾何也是 simulation semantics ──
  //  判準（Owner 給的）：**直接被 LogicEngine / Challenge simulation 消費，
  //  而且修改會改變結果**。以下五項逐項有證據，不是「看起來相關就加」。

  //  · 路線錨點 / 野區坑位 / 地圖範圍。LogicEngine 直接 import。
  //    ⚠ 實測證據：Rift 330 改了本檔之後，`regress` 的對局時長 22.5→21.9 分、
  //      平均擊殺 19.7→19.1、hot 60%→58%。⇒ 它不是 presentation data。
  "src/gameData.js",
  //  · `RIFT_EXTENT_RATIO` 與 `placeRiftAnchor` —— **`gameData.js` 用它來位移
  //    每一條路線與每一個坑位**。⚠ 沒有它，上面那一條就有洞：
  //    改 `RIFT_EXTENT_RATIO` 會改變 `gameData` 的**輸出**，
  //    但 `gameData.js` 的**文字**一個字都不會變 ⇒ 指紋抓不到。
  "src/battle/moba/map/riftMapMetrics.js",
  //  · `rulesFor` / `SIM_RULES` / `powerMultFor` / `hpMultFor` / XP 曲線。
  //    ⚠ LogicEngine 每一個 tick 都在讀，是最核心的戰鬥縮放與規則集。
  "src/battle/moba/matchProgression.js",
  //  · 尋路與可通行判定。LogicEngine 直接 import ⇒ 走位改變 = 結果改變。
  "src/battle/moba/nav/mobaNavigation.js",
  //  · 塔的座標。LogicEngine 直接 import。
  "src/battle/moba/map/mobaTowerPlacement.js",
  //  ── 2026-09-30（moba-sim.v16 Objective Access Symmetry）：補上導航幾何的洞 ──────────
  //  `mobaNavigation.js` 的碰撞場由 `buildMobaLayout()` → `buildTerrainShapes()` 推導；
  //  坑壁腳印（PIT_FOOTPRINT）住在 mapTerrainShapes ⇒ 改它會改變走位，但 nav 的文字不變 ⇒ 指紋抓不到。
  //  （與上面 riftMapMetrics 是同一種洞。）⚠ 實證：v16 統一坑壁腳印後 regress 對局結果即改變。
  "src/battle/moba/map/mapTerrainShapes.js",
  "src/battle/moba/map/mobaMapLayout.js",
  //  · Objective Layout 契約：LogicEngine 直接 import（STANDARD／SWAPPED 決定大型物件在哪個坑）。
  "src/platform/contracts/objectiveLayout.js",
  //  ── 2026-10-06（moba-sim.v18 Topology Final）：同一種洞的另外兩處 ──────────
  //  · 野區／外環牆量體由 mapJungleTopology 生成（mapTerrainShapes 只 import 它）⇒ 改走道寬或房間位置會改走位。
  //  · 碰撞場的點陣化與淨寬距離（buildField）住在 mapPassability；mobaNavigation 直接 import 它。
  "src/battle/moba/map/mapJungleTopology.js",
  "src/battle/moba/map/mapPassability.js",

  //  ── 2026-09-09（Slice 5）：**選角成為戰鬥輸入** ────────────────────────
  //  在這一輪之前，Challenge 完全不呼叫 configureHeroes / configureArchetypes /
  //  configureSpells ⇒ 下面這些檔案改了也不影響任何 Challenge 結果。
  //  現在它們每一支都在**決定五個席位各拿到哪隻英雄、以及那隻英雄怎麼打**。
  //  ⚠ 實測證據（同一份快照／同一個 matchSeed／同一個戰術，只換一個合法的
  //    Draft outcome）：challengerWin 1512 秒 12–7  ⇄  defenderWin 1344 秒 3–13。

  //  · 防守方的凍結方針怎麼一手一手解出來（含 byRole 定位補齊）
  "src/platform/challenge/draftPolicy.js",
  //  · 這一場的 Ban/Pick 怎麼凍成 DraftResult，挑戰方沒選滿時怎麼補
  "src/platform/challenge/draftResult.js",
  //  · picks → 五個席位的指派（窮舉 5! 取最高分，字典序平手）
  "src/battle/moba/mobaDraftAssignment.js",
  //  · 英雄定位 → 引擎行為 mods（`configureHeroes`）
  "src/battle/moba/mobaHeroProfile.js",
  //  · 席位 × 英雄 → 召喚師技能（`configureSpells`）
  "src/battle/moba/mobaHeroLoadout.js",
  //  · heroId → 交戰距離／站位（`configureArchetypes`）
  "src/data/heroCombatArchetypes.js",
  //  · `heroTags` —— 席位指派的適性評分讀它
  "src/data/heroClassification.js",
  //  · `SEAT_LANE_ZH` —— Draft 的 byRole 補位讀它。
  //    ⚠ 這張表看起來只是 UI 詞彙，但它現在決定「b4 該補哪一路的英雄」。
  "src/platform/contracts/matchLineup.js",

  //  ── 2026-10-09（Phase 3a T3，moba-sim.v21 候選）：唯一組裝器 ───────────────────
  //  · ruleset 的層與組裝順序（assemblyOrder）決定 configure* 呼不呼叫、以什麼順序呼叫。
  "src/platform/contracts/matchRuleset.js",
  //  · MatchSetup → LogicEngine 的唯一組裝點（Live／Challenge／平衡工具共用）：順序、短路、tool 覆寫。
  "src/battle/moba/matchAssembler.js",
  //  ── 2026-10-09（Phase 3a T5，moba-sim.v21 候選）：Challenge 改走組裝器 ─────────────
  //  · 快照／DraftResult → MatchSetup 的轉換（取代 challengeRunner 內的 sideInputs 與 Heroes/Archetypes/Spells 組裝）。
  "src/platform/challenge/challengeMatchSetup.js",
  //  · 組裝器 deps 的 adapter 清單（唯一一份；Live 的 matchAssemblerDeps.js 只是其上補預設查表的薄層）。
  "src/battle/moba/matchAssemblerDepsCore.js",
  //  ── 2026-10-11（Phase 3a T7，moba-sim.v21 候選）：組裝路徑上其餘「決定引擎輸入」的模組 ───────────────
  //  判準同上：**改它會不會讓同一份輸入跑出不同結果**。前面幾輪只收了組裝器、ruleset 與 Challenge builder，
  //  Live 這一側與 deps 清單上的 adapter 還留在清單外——現在三個模式共用同一個組裝器，這個洞就不能留。
  //  tools/check_match_setup_3a.mjs §V4 會自動檢查：組裝入口模組的每一條相對 import 都必須在這份清單裡（或是有理由的例外）。
  //  · 出裝引擎 adapter（`toEngineItems`）：英雄陣容＋出裝策略 → configureItems 的設定（含各席位的購買序）。
  "src/battle/moba/items/itemsEngineAdapter.js",
  //  · `matchItemsConfig`／`normalizeBuildStrategy`：Live 的出裝設定與策略名稱正規化（deps 清單上的 adapter）。
  "src/battle/moba/items/buildStrategyPrep.js",
  //  · `BUILD_STRATEGIES`：組裝器驗證 buildStrategy 用的詞彙，也是上面兩支與出裝 runtime 的購買序來源。
  "src/battle/moba/items/buildPolicy.js",
  //  · `buildPlayerStatSlots`／`applyFatigueToLoadout`：Live 的選手素質席位與疲勞後 loadout（直接成為 configurePlayers／建構子輸入）。
  "src/battle/moba/mobaRosterAdapter.js",
  //  · Live 的 MatchSetup builder（seed 正規化、天賦選擇與出裝策略的濾除、紅方戰術來源）。
  "src/battle/moba/liveMatchSetup.js",
  //  · Live 用的 deps 層（在 core 上補預設查表 heroById 與模組內單例）。
  "src/battle/moba/matchAssemblerDeps.js",
  //  · MatchSetup 契約：哪些欄位合法、哪些被正規化／拒絕、生產／工具分界（tool_field_in_production）。
  "src/platform/contracts/matchSetup.js",
  //  ── 2026-10-11（Phase 3a T8，moba-sim.v21 候選）：戰術變體的數值來源 ────────────────────────────────
  //  · 覆蓋層資料（由 TacticVariant 原樣遷移）：`applyVariant` 讀它 ⇒ Live 戰術設定（activeMatch.config.tactic）⇒ toEngineTactic。
  //    ⚠ 改任何一個 changedFields 數值＝改比賽結果，所以資料檔本身必須在清單內，而不只是 MobaTacticConfig.js。
  "src/platform/tactics/tacticOverlays.js",
  //  · `applyVariant`／`TACTIC_VARIANTS`：決定哪些欄位准被覆蓋（allowed／forbidden）與如何套用。以前不在清單內（既有缺口），此處補上。
  "src/platform/mastery/tacticVariant.js",
  //  ── 2026-10-11（Phase 3a T9，moba-sim.v21 候選）：Tactic Resolver 與它決定的輸入 ─────────────────────
  //  組裝器現在能接受 plan binding：binding → MobaTacticConfig → toEngineTactic／toEngineTacticIdentity。
  //  · Resolver 與它的選擇對照表（CHOICE_MAPPING）：改任何一格＝同一份 binding 解析出不同旋鈕。
  "src/battle/moba/tactics/tacticResolver.js",
  //  · 選擇對照表（CHOICE_MAPPING）、applyChoice、提供清單與 plan 層語意檢查（fix 1 由 resolver 搬到 platform，plan 與 resolver 共用唯一一份）。
  "src/platform/tactics/tacticChoiceMapping.js",
  //  · 模板資料：binding 的起點設定（經典模板由 MobaTacticConfig 派生，v2 模板是新輸入）。
  "src/platform/tactics/tacticTemplates.js",
  //  · plan 驗證器（createTacticPlan）：決定哪些輸入被接受、標準形長什麼樣（resolver 每次都重新驗證）。
  "src/platform/tactics/tacticPlan.js",
  //  · 能力登錄表：哪些維度是 live、每個維度允許哪些選擇（plan 與 resolver 的接受範圍）。
  "src/platform/tactics/capabilityRegistry.js",
  //  ── 2026-10-15（Phase 3a-C2，moba-sim.v21 候選）：Tactical Director ────────────────────────────────
  //  · LogicEngine 直接 import；引擎內每一個戰術讀取點（knobs／Tactical Identity／戰術階段界線 480／960 秒）都經它。
  //    static 模式＝設定值原樣回傳，但改它（例如階段界線、identity 反查）就會改結果 ⇒ 必須在清單。
  //    它 import 的 tacticalDirective.js 只供 directive() 契約視圖用，不在引擎熱路徑上 ⇒ C2 不收（C3 接上動態模式時再評估）。
  "src/battle/moba/tactics/tacticalDirector.js",
  //  ── 2026-10-25（Phase 3a-B T15，moba-sim.v21 候選）：AI 教練 v1 ─────────────────────────────────────
  //  · career.v21（redTactic aiCoachV1）的紅方計畫在組裝時由它從對手隊伍推導（liveMatchSetup.buildLiveMatchSetup）：
  //    改它的規則表＝同一份 live 輸入（同一個對手）組出不同的紅方 binding ⇒ 必須在清單。
  //    （platform/challenge/challengeVersion.js 不收：它只決定**新**挑戰記下哪個版本，同 snapshotAuthority.js 的判準；
  //     既有挑戰由記下的版本經 matchRuleset.challengeRulesetForVersion 決定規則集，那一段在清單內。）
  "src/platform/tactics/aiCoach.js",
]);

/**
 * ⚠ **已知的殘留缺口：本清單是「檔案清單」，不是「模組圖」。**
 *
 * `mobaNavigation.js` 自己還 import 了
 * `map/mapPassability.js`、`map/mobaMapLayout.js`、`map/mapTerrainShapes.js`；
 * `mobaTowerPlacement.js` 也 import 了後兩者。
 * 改**那些**檔案會改變模擬結果，但不會改變本清單裡任何一支的文字 ⇒ 指紋抓不到。
 *
 * ⇒ 目前**刻意不收**它們（Owner：不要無限擴張清單）。要真正堵死這個缺口，
 *   正確做法是改成「對 LogicEngine 可達的整個模組圖取指紋」，
 *   代價是任何一次地圖／渲染重構都會讓閘門變紅。那是下一次的取捨題，
 *   不是這一輪偷偷做掉的事。
 * ⚠ 在那之前，改動下列檔案時**要自己記得**做一次版本判斷：
 */
export const KNOWN_TRANSITIVE_GAPS = Object.freeze([
  "src/battle/moba/map/mapPassability.js",
  //  Topology Final：野區／邊界量體與河道形狀也經由 mapTerrainShapes → 導航距離場影響結果。
  "src/battle/moba/map/mapJungleTopology.js",
  "src/battle/moba/map/mapRiverStyle.js",
  "src/battle/moba/map/mobaMapLayout.js",
  "src/battle/moba/map/mapTerrainShapes.js",
  //  ⚠ Slice 5 新增的缺口，**刻意**不收進上面的清單：
  //    `heroDatabase.js` 有 150 KB，而且是英雄文案與數值的日常編輯對象。
  //    把它納入指紋 ⇒ 改一句技能描述就讓閘門變紅 ⇒ 閘門被訓練成雜訊。
  //  ⚠ 但它**確實**有三個欄位會改變 Challenge 的結果，改到它們要自己 bump：
  //      · `arch`（定位）      → `toEngineHeroMods` 的行為 mods
  //      · `lane`（擅長路線）  → Draft 的 byRole 補位與席位適性評分
  //      · `P`/`Q`/`W`/`E`/`R` 技能**名稱** → `heroTags` 的關鍵字比對
  //    改 `stats` / `skills.desc` / `title` / `color` 則**不會**——
  //    Challenge 的組裝路徑一個字都沒讀它們。
  "src/data/heroDatabase.js",
]);

/**
 * 每個模擬版本對應的**語意指紋**。
 *
 * ⚠ **指紋是綁在版本上的，不是綁在檔案上的。** 這是刻意的：
 *   語意變了就是新版本，所以「新指紋」與「新版本」必須一起出現。
 *   只改指紋不改版本，等於宣稱「語意變了但版本沒變」——那正是要擋的事。
 *
 * 流程（改動上列任一檔案的**程式碼**之後）：
 *   1. `node tools/check_simulation_version_gate.mjs --print` 取得新指紋
 *   2. 判斷：同一份輸入會跑出不同結果嗎？
 *      · 會   ⇒ 在 `MOBA_SIMULATION_VERSION` 開新版號、加進
 *               `KNOWN_SIMULATION_VERSIONS`，並在這裡替**新版本**登記指紋
 *      · 不會 ⇒ 仍要登記（同版本換指紋），但請在 commit 訊息寫清楚為什麼不算語意變化
 *   ⚠ 舊版本的指紋**保留不刪**：它是歷史挑戰「當初是用哪一版跑的」的憑據。
 */
export const SIMULATION_SEMANTICS_FINGERPRINTS = Object.freeze({
  //  2026-09-08（Slice 3）：`challengeRunner.js` 在 tick 迴圈**結束之後**多讀一次
  //  `eng.snapshot().tacticExec`，把戰術執行計數放進 `ChallengeResult`
  //  （賽後「宣告 vs 實際」的資料來源）。
  //  ⚠ **判定為不改變模擬語意**：它發生在模擬跑完之後，沒有回寫引擎、
  //    沒有改變任何 tick 的輸入。⇒ 沿用 `moba-sim.v1`，只換指紋。
  //  ⚠ 這個判定不是憑感覺 —— Slice 1/2 的「同一場重播逐值相同」與
  //    「reload 後重播與當初一致」在改動後仍然全綠，等於實測過
  //    `snapshot()` 沒有副作用。
  //  2026-09-09（Slice 4）：`challengeRunner.js` 新增一道**拒絕**用的護欄——
  //  若快照把 `draftPolicy` 列進 `capturedInputs` 卻沒有實作注入，就直接拒跑。
  //  ⚠ **判定為不改變模擬語意**：目前沒有任何快照宣告 `draftPolicy`
  //    （`SLICE1_CAPTURED_INPUTS` 沒有它），所以這道護欄對每一份既有輸入
  //    都不會觸發 ⇒ 同一份輸入的結果逐值不變。⇒ 沿用 `moba-sim.v1`。
  //  ⚠ 真正會改變語意的是「**把 draftPolicy 接成戰鬥輸入**」——那一天要
  //    開新版號，而且會讓既有挑戰的重播全部失效。這道護欄存在的目的，
  //    就是不讓那件事在沒有 bump 版本的情況下悄悄發生。
  //  ⚠ v1 的指紋是在**舊的檔案清單**（5 支）下算出來的。清單在 v2 擴充成 10 支
  //    之後，這個值**再也重算不出來**——它是歷史紀錄，不是可再驗的斷言。
  //    閘門只比對「目前版本」那一格，所以這不影響正確性；留著它是為了記住
  //    「v1 當時是什麼」。
  "moba-sim.v1": "ca2f3e8693ce194e",

  //  2026-09-09（Owner Decision）：**正式的 simulation semantics change**。
  //  Rift 330 已經實際改動 lane anchors / pit positions / map extents，
  //  而且**實測讓 regress 的結果改變**（時長 22.5→21.9 分、擊殺 19.7→19.1、
  //  hot 60%→58%）。⇒ 這不是「同版本換指紋」，是新版本。
  //  同時把 `gameData.js` 等五支地圖／規則檔案納入語意清單（見上）。
  //  ⚠ 後果（已知且接受）：所有以 `moba-sim.v1` 記錄的歷史挑戰**不再可重播**，
  //    並且會被 `canReplay` 明確拒絕——不是靜默用新地圖重算。
  "moba-sim.v2": "824a89582f8e9014",

  //  2026-09-09（Slice 5）：**選角真的成為戰鬥輸入**。
  //  在 v2 之前，Challenge 一次都沒有呼叫 `configureHeroes` /
  //  `configureArchetypes` / `configureSpells` —— 五個席位在引擎眼中是
  //  五個沒有英雄的中性單位。現在 `DraftResult.v1` 決定他們各拿到誰，
  //  而那決定了交戰距離、站位、行為 mods 與召喚師技能。
  //  ⚠ 這是**實測過的**語意變化，不是推論。保持快照／matchSeed／戰術／
  //    對手／版本全部相同，只換一個合法的 Draft outcome：
  //      A（照方針補位）challengerWin  1512 秒  12–7
  //      B（玩家自己選）defenderWin    1344 秒   3–13
  //    ⇒ 若這裡沒有差異，就不該宣稱 Draft 是 combat input，也不該開 v3。
  //  ⚠ 同時修掉一個 Slice 4 的靜默失效：`draftPolicy.js` 自己另立了一套
  //    **英文**路名，而注入的 `laneOf` 回的是中文路名 ⇒ `byRole` 補位
  //    一次都沒命中過。修好之後補位才會照席位補定位（見該檔說明）。
  //  ⚠ 後果（已知且接受）：`moba-sim.v1` / `v2` 的歷史挑戰**不再可重播**，
  //    由 `canReplay` 明確拒絕，不是靜默用新規則重算。
  //  ⚠ 這一版的量測數字（見上）是**修正解算順序之前**跑的；順序修好之後
  //    重跑：新存檔對同級陪練所 38%（原本 19%），難度梯度仍在。
  "moba-sim.v3": "a9ac2b91b46341ae",

  //  2026-09-10（玩家回報的 bug 修復）：兩座野怪營地原本壓在兵線上
  //  （`camp_blue_b` 距下路 1.0、鏡像 `camp_red_b` 距上路 1.0，規則要求 ≥5.5）。
  //  根因是 2026-07-16 重新塑形 `LANES` 之後沒有重新驗證營地——路線從營地
  //  底下移走了。營地移到合規位置（距路線 8.0、導航淨空 19.2、鏡像不變）。
  //  ⚠ **判定為真的語意變化，而且是量出來的**：同一組 seed 的 regress
  //    平均擊殺 19.1 → 15.9、平均時長 21.9 → 21.6 分。野怪站在兵線上時
  //    會被路過的小兵與英雄順手打掉，移回野區之後那些交戰不再發生。
  //  ⇒ 這不是「同版本換指紋」，是新版本。
  //  ⚠ 後果（已知且接受）：v1/v2/v3 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  //
  //  2026-09-15（Item System v1 M2：Engine Integration）：LogicEngine 新增 opt-in 的
  //  `configureItems` 與 `itemsOn` 閘門下的戰鬥／收入／購買窗掛點。
  //  ⚠ **判定為不改變模擬語意**，而且是實測，不是推論：
  //    `tools/check_moba_items_m2.mjs` G1 把 M1 commit 6a7d40a 的引擎解出來，
  //    與改動後的引擎逐場比對（3 seed × bare／照 useLocalServer 全配置；
  //    snapshot 串流雜湊、終局雜湊、rng／rng2／rng3 呼叫次數、key 集合）⇒ 全部相同；
  //    `configureItems(null)` 也相同。正式流程與 Challenge 都沒有呼叫 configureItems
  //    ⇒ 任何既有輸入到不了裝備層。⇒ 沿用 `moba-sim.v4`，只換指紋（舊值 d2335417a7c170af）。
  //  ⚠ 裝備模組刻意**不列入**上面的語意清單：它們只在 itemsOn 時被執行，v4 的任何輸入都不會經過。
  //    **正式流程或 Challenge 第一次呼叫 configureItems 的那一天必須開 moba-sim.v5**，
  //    並同時把裝備模組加進清單（Item System 設計 §8 已定）。
  "moba-sim.v4": "870f893d7a1aa43a",

  //  2026-09-16（MOBA Item System M4b.5：Tower Safety & Dive Fix）：**正式的 simulation semantics change**。
  //  v3 規則集新增 `towerSafetyV1`（v1/v2 沒有這個鍵 ⇒ 歷史規則集逐位元不變）：
  //    · 塔打英雄的射程＝碰撞外緣＋本場最長英雄攻擊距離（路塔 12.7–13.6、門牙塔 12.8）
  //    · 塔對英雄單發與 lateFactor 脫鉤、可以擊殺（擊殺歸屬 8 秒內最後出手的敵方英雄）
  //    · 塔的仇恨：沒有小兵時不清英雄鎖定、「有兵先打兵」改用世界距離
  //    · AI 越塔／風險／塔區退出／撤退門檻用同一個塔傷函式估算
  //  ⚠ 實測的語意變化：regress2 同 20 seeds 中位時長 21.2 → 25.4 分、平均擊殺 15.8 → 22.9。
  //  ⚠ 後果（已知且接受）：v1–v4 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v5": "a47541d98096db2e",

  //  2026-09-16（M4b.6：Siege Tempo Audit & Fix）：**正式的 simulation semantics change**。
  //  v5 的塔保護射程讓「一路清空」從 16–18 分延後到 21–27 分（8 seeds 實測）。根因與修正：
  //    · 塔只有**一個射程**（Owner：與 LoL 一致，對小兵與對英雄同值）⇒ `towerMinionRange: "same"`
  //    · 無守軍的圍攻不套 `diveMinHp` 血量門檻（打贏的低血英雄才推得動塔）
  //    · 門牙塔的「沒有兵線 ⇒ 傷害歸零」改為既有 `nexusGuardNoWaveK` 0.62 倍率（LoL 沒有硬歸零）
  //    · 扣塔血的人數條件由「嚴格優勢」改為「人數相等即可」（效率倍率不變）
  //  ⚠ 實測（regress2 同 20 seeds）：最長 36.4 → 29.9 分、平均 25.9 → 24.2、中位 25.4 → 23.6，
  //    節奏門檻 7/8 → **8/8**；regress 13/15 → 15/15。
  //  ⚠ 後果（已知且接受）：v1–v5 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v6": "795922935aaaed78",
  //  2026-09-19（P0-A～P0-D fairness release）：side-relative formation /
  //  navigation mirror / tail-deadlock fixes 改變同一輸入的模擬結果，
  //  因此開 v7；v6 指紋保留供歷史 replay 版本判定。
  "moba-sim.v7": "f3ff0bee0a052168",
  //  2026-09-22（Hero Skills v1）：LogicEngine 新增 skill-gated QWER
  //  authority path。skill-off 已以 clean v7 做 1000/1000 per-seed
  //  comparison，未改變 baseline trajectory；正式 skill-on 語意已不同，
  //  因此以新版本保留舊 v7 fingerprint，避免 replay 靜默重算。
  "moba-sim.v8": "ba046ce4a129b1a9",
  //  2026-09-22（MOBA Combat Quality v1）：**正式的 simulation semantics change**。
  //  v3 規則集新增 `cqHeroFarmV1` / `cqMinionV1`（v1／v2 沒有這些鍵 ⇒ 歷史規則集逐位元不變）：
  //    · 英雄真的會攻擊小兵（v8 之前從不打兵），對線站位改跟兵線走（原本只跟時間走）
  //    · 小兵種類／射程／橫向列位／目標分配／英雄仇恨與反擊；每 3 波攻城兵；已破路出超級兵
  //      （取代 laneBreachHpK／laneBreachFightK 的整波倍率）
  //  ⚠ 實測語意變化：同 8 seeds 對線補刀 top/mid/adc 由「不存在」變成每場 35／33／53，
  //    20 分鐘平均倒塔 9.5 → 12.3（fairness 與節奏量測見 docs/design/MOBA_Combat_Quality_v1.md）。
  //  ⚠ 後果（已知且接受）：v1–v8 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v9": "4d7cf571c8122219",
  //  2026-09-24（feature/moba-spectacle-vision）：**正式的 simulation semantics change**（skill-on）。
  //  v3 規則集新增 `objSkillV1`／`objSkillDmgK`（v1／v2 沒有這些鍵 ⇒ 歷史規則集逐位元不變）：
  //    · Root cause：傷害技能的目標只找射程內的敵方英雄 ⇒ 打野怪／龍／巴龍時**從不施法**（A/B 實測 0 次）。
  //    · 現在：沒有敵方英雄在射程內、且英雄正在打中立目標 ⇒ 對它施放傷害技能；傷害走既有的
  //      applyMemberHits／龍巴龍歸屬路徑（擊殺、參與、重生不變）。塔仍只吃普攻。
  //    · 呈現：英雄推塔新增每秒一條普攻特效；打龍／巴龍的彈道由「最多 2 人」改為全員（零 rng）。
  //  ⚠ 全部（技能打中立目標＋兩種攻擊特效）只在 hero skills 開啟時有作用 ⇒ skill-off 的 snapshot 串流與 v9 逐位元相同
  //    （check_moba_items_m2 G1 驗證）；Challenge 不開 hero skills ⇒ 行為不變，但 LogicEngine 原始碼變了。
  //  ⚠ 實測（20 組×5 seeds 鏡像，skills on，各 100 場）：對物件施法 0 → 111／場；首營清完 118.7 → 98.7 秒；
  //    龍 4.37 → 5.37／場；平均時長 21.6 → 21.3 分；倒塔 15.4 → 15.4。
  //  ⚠ 後果（已知且接受）：v1–v9 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v10": "27dc4e0161024c06",
  //  2026-09-24（feature/moba-combat-polish-r2）：**simulation semantics change**（skill-on）。
  //  v3 規則集新增 `objIdleFixV1`：打龍／巴龍時「打目標」列入 M1.7 合法停留理由，且全隊改在坑周圍分散站位
  //  （原本全員走向同一坑中心 ⇒ 避碰推開、被改派離開、下一 tick 又被拉回 ⇒ 每 0.5 秒來回、朝向反轉＝打大型物件時搖晃）。
  //  ⚠ 只在 hero skills 開啟時生效 ⇒ skill-off 串流與 v10 逐位元相同（check_moba_items_m2 G1）；Challenge 行為不變。
  //  ⚠ 後果（已知且接受）：v1–v10 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v11": "617b9eebcc50b848",
  //  2026-09-25（feature/moba-lane-jungle-balance）：**simulation semantics change**（skill-on）。
  //  v3 規則集新增 `laneSkillV1`（純傷害技能在沒有英雄／中立目標時清兵：單體只收得掉才打、範圍 ≥2 隻 ×0.5 最多 3 隻、大招不用、
  //  對線期後只在自己推進時用）、`smiteAiV1`（context：目標 > 50% 不用；Buff 主怪／敵方打野在旁／自己低血才用；龍巴龍在場或將重生則保留；龍／巴龍的斬殺規則不變）
  //  與 `jungleReachV1`（打野走向要打的那一隻，修正 Buff 跟班永遠在傷害距離外）。塔規則未動。
  //  ⚠ 只在 hero skills 開啟時生效 ⇒ skill-off 串流與 v11 逐位元相同；Challenge 行為不變。
  //  ⚠ 後果（已知且接受）：v1–v11 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕。
  "moba-sim.v12": "16b5b32d90165817",
  // 2026-09-27: skill-on non-hero capability hits and symmetric phase scaling.
  // Existing Baron wave buff remains separate; skill-off and historical rules are unchanged.
  "moba-sim.v13": "366b671a16d2f12c",
  // Hero Battle Talent v1 and Skill Level v1 change skill-on rules.
  // v14 remains an unpublished feature candidate; v13 stays for historical Replay.
  "moba-sim.v14": "20eb0e6130e1a933",
  //  2026-09-29（feature/moba-mobile-hud-polish，C 段）：**simulation semantics change**（skill-on）。
  //  v3 規則集新增 `laneWaveAnchorV15`：對線期沒有交戰目標的對線英雄（非打野／輔助）留在兵線交戰點，
  //  不被原型站位層改寫成相對對手英雄的站位；到點後身邊有敵兵＝在吃線，不再被 _nextTaskV17 派走。
  //  ⚠ 只在 hero skills 開啟時生效 ⇒ skill-off（含 Challenge）串流與 v14 逐位元相同。
  //  ⚠ A/B（tools/balance/moba_lane_farm_ab.mjs，正式 skill＋talent 設定）見 05_Sprint紀錄 同日一節。
  //  ⚠ 後果（已知且接受）：v1–v14 的歷史挑戰不再可重播，由 `canReplay` 明確拒絕；v14 仍為已知版本。
  //  2026-09-29（feature/moba-gameplay-presentation-audit）：**不是**語意變更，同版號重新登記。
  //  ① pushFx 技能特效保留窗 ≥ life（fx 從不被模擬讀取）② snapshot 加 `mhp`（只呈現用）
  //  ③ objectiveStakesV1／nexusSiegeCapV1／heroPassivesV1 三個候選規則**預設關閉**。
  //  證據：正式設定 40 場逐場結果、12 場整份 snapshot 串流（去掉 fx／mhp）、legacy 指紋 6 場皆與 f285f5f 逐位元相同。
  //  任何一個候選旗標開啟＝語意變更 ⇒ 必須開 moba-sim.v16。
  //  2026-09-30（feature/moba-persistent-combat-state-v1）：**不是**語意變更，同版號重新登記。
  //  CombatState.v1：statusEffects 抽成 _statusEffectsOf（輸出逐位元相同）、每 tick 推導持續狀態生命期（不回寫 gameplay、
  //  不耗 rng）、領域排程加 zoneId／castAt、snapshot 加 combatStates 與受害者 dot。證據：正式設定 12 場整份 snapshot
  //  串流（去掉新增的呈現欄位）與 legacy 指紋 6 場皆與 75f44c8 逐位元相同。
  "moba-sim.v15": "eb940085e9536b94",
  //  2026-09-30 moba-sim.v16 **正式範圍**（Owner 決策）：**simulation semantics change**。
  //  ① Objective Stakes v1：**OFF**（objectiveStakesV1＝false）。程式碼保留為候選；它讓「本場抽到巨龍側」的單場優勢
  //     約 3pp → 8pp，不接受。重新開啟需新版本、新指紋與 A/B。
  //  ② TD-CS1：split-projectile 命中套用規則宣告的減速（liuxing:Q、miwu:E）（hero skills 開啟時生效）。
  //  ③ Objective Access Symmetry：
  //     · 巨龍坑／巴龍坑 gameplay 腳印統一（R15.5／坑口 0.74／壁厚 5.7，巴龍坑＝巨龍坑的 180° 鏡射）
  //       ⇒ 碰撞與導航改變，**所有模式**都受影響（含 skill-off 與 Challenge）——
  //       原本「skill-off 與 v15 逐位元相同」的性質**不再成立**。
  //     · Objective Layout Variant（STANDARD／SWAPPED，每場開局由 seed 推導一次、整場固定）；
  //       未設定＝STANDARD（Challenge 目前不設定 ⇒ STANDARD）。
  //     · 指紋檔案清單補上 mapTerrainShapes／mobaMapLayout／objectiveLayout（導航幾何的洞）。
  //  ⚠ n=1000 A/B 見 docs/design/MOBA_Objective_Access_Symmetry_v16.md §7；v15 保留為已知版本，歷史 v15 挑戰由 canReplay 明確拒絕。
  "moba-sim.v16": "dad316e9344e94c8",
  //  2026-10-01 moba-sim.v17（feature/hero-identity-combat-depth-v1）：**simulation semantics change**（skill-on；Tactical Identity 也影響 Challenge）。
  //  ① Hero Passive Runtime v2：heroPassivesV1＝on，100 名英雄（full 72／approx 24／info 4）走同一套觸發／效果語彙。
  //  ② Hero Power Curve v1：heroPowerCurveV1＝on，前／中／後期倍率（三段平均＝1），唯一掛點 _applyMatchLevel。
  //  ③ Tactical Identity v1：tacticIdentityV1＝on，戰術契約的決策投影；std 對 std 與未接線逐位元相同。
  //  Objective Stakes／Nexus cap 仍 OFF；坑位／layout 不變。n=1000 A/B 見 docs/design/Hero_Identity_Combat_Depth_v1.md。
  //  2026-10-01（Release 前）：TD-HI5 在 MobaTacticConfig.js 新增 TEAM_STYLE_TACTIC／mobaTacticForTeamStyle（只決定紅方選哪套戰術，
  //  同一份戰術輸入的引擎結果不變）⇒ v17 未發布，同版號重新登記。
  "moba-sim.v17": "6bcd77c7ff63ee5e",
  //  2026-10-06 moba-sim.v18（feature/moba-map-topology-v18）：**simulation semantics change**（地圖幾何；skill-on／off 與 Challenge 都受影響）。
  //  MOBA Map Topology Final：野區改為走道優先的權威拓樸（mapJungleTopology，藍方生成＋180° 鏡射）、外環封邊、
  //  河道貫通、營地移到 LoL 深度、草叢 30 叢、findPath 保留起點格心（正反向對稱）。坑位腳印沿用 v16 規格（R 15.5／thick 5.7），
  //  坑周平台 pitBulge 24.5。英雄／裝備／技能／戰鬥數值不變。指紋清單補上 mapJungleTopology／mapPassability。
  //  ⚠ 後果（已知且接受）：v17 歷史挑戰不再可重播，由 canReplay 明確拒絕；v1～v17 指紋全數保留。
  "moba-sim.v18": "4c1cda877c698a17",
  //  2026-10-07 moba-sim.v19（feature/moba-tactical-ai-p1）：**simulation semantics change**（Tactical AI Phase 1；skill-off／on 與 Challenge 都受影響）。
  //  P0-1 塔邊決策震盪：塔區血量遲滯（enter 0.55／exit 0.45，取代 45%／55% 死區）、退塔最短承諾、FALLBACK 吃決策鎖、
  //    對線站位點死區、對線期等兵線合法化、發呆再任務承諾（推進除外）。
  //  P0-2 HeroSkillLevel.v2：Lv1／2／3 依序解鎖基本技能、R 於 Lv6 解鎖並在 Lv11／16 升級（上限 3）；AI 大招保留。
  //  P0-3 勝利條件優先：敵方高地已破、人數不劣且推得動（人數優勢或目標旁有己方兵線）⇒ 收尾推進優先於龍／巴龍；
  //    圍攻窗的塔區判斷與實際建築攻擊共用同一座 canonical siege target（_siegeTargetV19）。
  //  選手差異只來自既有作用點的風險傾向（英雄定位／選手素質 retreatAdj／戰術身分），決定性、不擲骰。
  //  ⚠ 後果（已知且接受）：v18 歷史挑戰由 canReplay 明確拒絕；v1～v18 指紋全數保留。
  "moba-sim.v19": "dc005e5f57977e3d",
  //  2026-10-08 moba-sim.v20（feature/moba-tactical-ai-p2）：**simulation semantics change**（Tactical AI Phase 2；skill-off／on 與 Challenge 都受影響）。
  //  ① Combat Intent：ALLIN／TRADE／POKE／KITE，走位與出手讀同一個 intent（等級／經濟、R 與閃現、援軍、退路、風險傾向）。
  //  ② 兵線優先：對線者身邊有敵兵 ⇒ 不為一般接觸離線（救人／夾擊／物件／呼叫例外）。③ 引擎內 Team Call（集火／殘血／Gank／撤退／物件），
  //    回應吃距離、定位、溝通／配合／領導、風險傾向。④ Gank 評分選路、追擊先估擊殺。⑤ 龍／巴龍雙評估取代擲骰、懲戒在物件不迫近時清野。
  //  全部決定性（不新增亂數；Gank／物件改評分後少抽 rng）。⚠ 後果（已知且接受）：v19 歷史挑戰由 canReplay 明確拒絕；v1～v19 指紋全數保留。
  "moba-sim.v20": "050b3f66620f0f57",
  //  2026-10-09 moba-sim.v21（feature/moba-phase3a，**UNRELEASED CANDIDATE**）：語意清單新增 matchRuleset.js 與
  //  matchAssembler.js（Phase 3a T3 唯一組裝器）。LogicEngine 與所有 adapter 未改；Live／Challenge／runner 經組裝器
  //  的結果與 v20 golden 39 案逐位元相同（configure 序列、引數雜湊、digest、streamHash）。
  //  ⚠ v20 指紋不變、v1～v20 全數保留；正式站仍為 v20，發布前須 Owner 決定。
  //  T3 fix round 1：組裝器改以正規席位順序（b1…b5, r1…r5）重建交給 adapter 的 roster／天賦選擇（同雜湊 ⇒ 同模擬由構造保證）；
  //  golden 39 案仍逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 6b706cbfd4419710 未曾發布）。
  //  T4（Live 改走組裝器）：matchAssembler.js 只多回傳 applied.depsFingerprint（deps 身分描述，不進引擎、不進 setup 雜湊）
  //  ⇒ 不是語意變化；golden 39 案＋Live 9 案仍逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 d5af0958688d277a 未曾發布）。
  //  T5（Challenge 改走組裝器）：runChallenge 經 challenge.v20 組裝，golden 12 個 Challenge 案經真實 runChallenge 逐位元相同；
  //  語意清單新增 challengeMatchSetup.js、matchAssemblerDepsCore.js。v21 未發布 ⇒ 同版號重新登記（舊值 e94f45f2c87e9573 未曾發布）。
  //  T6 fix（平衡工具 ESMO_BALANCE_ROOT 跨版本 A/B 必須量到同一棵樹）：組裝器不再 import 任何 adapter，引擎側 adapter
  //  （PlayerMods／HeroMods／Passives／PowerCurve／Spells／matchItemsConfig／toEngineItems／Tactic／Identity／STANDARD_OPP_TACTIC）
  //  改經 deps.engineAdapters，預設接線只在 matchAssemblerDepsCore.js；tool 規則集容忍舊樹引擎缺 configure 方法。
  //  結果與 v20 golden 39 案逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 d8935d1e9c0f2f8f 未曾發布）。
  //  T6 fix 1：tool 規則集只容忍引擎缺 v20 runner 有護欄的三個方法（TOOL_TOLERATED_ENGINE_METHODS）；tool 的技能層把
  //  selectBattleTalents 的結果原樣交給 toEngineHeroSkills（production 空選擇仍 ⇒ null）。結果與 v20 golden 逐位元相同。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 fe407dd69bda620b 未曾發布）。
  //  T7（跨模式一致 gate，3a-A 架構完成點）：語意清單再收 7 支組裝路徑上的模組（itemsEngineAdapter／buildStrategyPrep／buildPolicy／
  //  mobaRosterAdapter／liveMatchSetup／matchAssemblerDeps／matchSetup.js；理由見清單內註解）。只增加清單、沒有改任何一支的程式碼
  //  ⇒ 不是語意變化：Live／Challenge／runner 的結果與 v20 golden 39 案（live 9、challenge 12、runner 18）逐位元相同——
  //  由 tools/check_match_setup_3a.mjs 走三個真實包裝逐案驗證（G-A2 39/39；G-A1 三個 ruleset × 6 seeds 同 setup 多路徑結果相同）。
  //  ⚠ v20 指紋 050b3f66620f0f57 與 v1～v20 全表不變（gate V2 釘整表雜湊）；正式站仍為 v20；v21 發布前須 Owner 決定。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 5caac9332cdf1e21 未曾發布）。
  //  T8（TacticPlan.v2／模板／覆蓋層）：三個 TacticVariant 的數值遷移到 tactics/tacticOverlays.js，tacticVariant.js 改為投影它；
  //  語意清單新增這兩支（變體數值是 Live 戰術設定的來源，以前只靠 tacticVariant.js 的字面值而且不在清單內）。
  //  行為不變：applyVariant 對 9 個戰術 × 9 種變體輸入（81 組）的輸出與遷移前逐位元相同（tools/check_tactic_plan_3a.mjs §O，
  //  fixture 擷取自 a7adeb9）；LogicEngine、組裝器與所有 adapter 未改 ⇒ 不是語意變化，v20 golden 39 案維持逐位元相同。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 b6264e0fa16c3b2d 未曾發布）。
  //  2026-10-11（Phase 3a T9）：語意清單新增 tacticResolver.js、tacticTemplates.js、tacticPlan.js、capabilityRegistry.js；組裝器多一條
  //  binding 分支（經 deps.engineAdapters.resolveTactic；fix 1 起 legacy／std 也走它）、matchSetup/matchRuleset 多「ruleset 接受的戰術種類」檢查。
  //  行為不變：legacy／std 路徑一個位元都沒動，golden 39 案＋Live 9 案以 binding 輸入皆逐位元相同（check_tactic_resolver_3a）。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 e695aa910251481a 未曾發布）。
  //  2026-10-12（Phase 3a T9 fix 1）：選擇對照表搬到 tacticChoiceMapping.js（新增進清單）；`split` 選擇連帶把 macro.splitPush 提到
  //  classic.m2 的值（離開 split 降回 std 的值）；組裝器對 legacy／std／binding 一律經 resolveTactic。
  //  legacy／std 路徑的旋鈕一個位元都沒動，golden 39 案＋Live 9 案（binding 輸入）仍逐位元相同。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 048375d5ab576f18 未曾發布）。
  //  2026-10-12（Phase 3a T9 fix 2）：戰術 adapter 只在用到時才必要（STANDARD_OPP_TACTIC 只在有一方是 std 時）；resolver 輸出先驗形狀；
  //  resolver 不再凍結投影回傳的物件（先複製）。合法輸入的旋鈕一個位元都沒動，golden 39 案仍逐位元相同。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 88f4175a94025c1a 未曾發布）。
  //  2026-10-12（Phase 3a T9 fix 3）：組裝器把注入 resolver 的結果在護欄內一次讀成純資料（ok 須嚴格為 true）。合法輸入的旋鈕一個位元都沒動。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 b1271c151bed7955 未曾發布）。
  //  2026-10-12（Phase 3a T10 事前登記）：capabilityRegistry.js 的 live 列多了 resolverFields／engineReads／gate（真實性 gate 的事前登記資料）與
  //  CAPABILITIES／liveCapabilities 別名；isLiveChoice 多一個可省略的 simVersion 參數。都是純資料／查詢，解析器與對照表一個位元都沒動，
  //  golden 39 案仍逐位元相同 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 0300a71fcbc3a7df 未曾發布）。
  //  2026-10-12（Phase 3a T10 結果）：Registry 多了 MEASURED_EXCLUSIONS（G-A7 量測不到效果的選擇逐模板不提供；23 筆），
  //  offeredChoiceDetail 多一個可省略的 opts.withMeasured 與 tacticBookOptions（UI 選項清單）；resolver 重新匯出它。
  //  排除表只影響「提供給玩家挑哪些」（offeredChoices／tacticBookOptions）；createTacticPlan 驗的仍是結構上合法（withMeasured:false），
  //  所以**不改任何輸入的解析結果**、不碰引擎與組裝器：golden 39 案仍逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 355cf3ef13b6b7e4 未曾發布）。
  //  2026-10-13（Phase 3a T10 Phase 2 事前登記）：對照表與 Registry 多了五個整場型 live 維度（teamfight.posture／grouping、objectives.dragon／baron／tower），
  //  數值全部引用既有模板在同一欄位上的值。既有十三個維度的解析一個位元都沒動；沒選這些新鍵的輸入解析結果不變，golden 39 案仍逐位元相同。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 5419139708e72275 未曾發布）。
  //  2026-10-13（Phase 3a T10 Phase 2 結果）：MEASURED_EXCLUSIONS 多 7 筆（集結 tight、巨龍 low／high、巴龍 low／high、推塔 low，以及 classic.m3 上的推塔 high）。
  //  只影響提供給玩家挑的清單，不改任何輸入的解析結果：golden 39 案仍逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 96d6b4652146eaf1 未曾發布）。
  //  2026-10-13（Phase 3a T12）：liveMatchSetup.js 的藍方戰術多一個來源——opts.tacticPlanBinding（戰術書）優先，沒有才走 v1 戰術物件。
  //  沒帶 binding 的輸入走的是原本那一行，golden 39 案仍逐位元相同；binding（classic.mN、無額外選擇）整場結果＝同一套經典戰術的 golden
  //  （tools/check_tactic_save_3a.mjs M2）。v21 未發布 ⇒ 同版號重新登記（舊值 839ca79b396026b7 未曾發布）。
  //  2026-10-14（Phase 3a-A 複驗撤下）：Registry 多了 REPLICATION_WITHHELD（4 筆：上路 split、下路 aggressive、b1 core、謹慎風險；複驗 seeds 1001–1400 紅藍雙方沒站住）
  //  與 replicationWithheld 查詢；offeredChoiceDetail 預設再套用這張表（原因 not_replicated），withMeasured:false 兩張表都不套。
  //  只影響提供給玩家挑的清單，不改任何輸入的解析結果（createTacticPlan／resolver 驗的仍是結構上合法）：golden 39 案仍逐位元相同。
  //  同批另有：矛盾提示（tacticIndicators.js，不在語意清單內）改為證據含撤下選擇的規則不回報；planProblems 多一段註解——兩者都不改指紋（註解不計）。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 e66f38390c351919 未曾發布）。
  //  2026-10-15（Phase 3a-C1）：matchRuleset.js 多了可選層 tacticalDirector（缺少 ≡ "static"；validateRuleset 只收 "static"）與兩個讀取輔助。
  //  v20 三份 ruleset 與 resolveRulesetForMode 的輸出逐字不變（tools/check_match_ruleset_3a.mjs R16／R17）、沒有任何檢查點讀它 ⇒ 不是語意變化：
  //  golden 39 案仍逐位元相同。v21 未發布 ⇒ 同版號重新登記（舊值 a7d5b68e24d1f313 未曾發布）。
  //  2026-10-15（Phase 3a-C2）：C2: engine tactic reads go through TacticalDirector (static); results bit-identical to the v21-A golden.
  //  LogicEngine 的每一個戰術讀取點（knobs／Tactical Identity／戰術階段）改經 battle/moba/tactics/tacticalDirector.js（新增進語意清單）；
  //  static 模式回傳設定的同一份物件，階段界線 480／960 原樣搬過去。v21-A golden 109 案與 v20 golden 39 案逐位元相同 ⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 29140fe0cb5a4c86 未曾發布）。
  //  2026-10-15（Phase 3a-C3-1 E-1）：C3-1 E-1: observer fields removed, mode list merged; behaviour unchanged.
  //  LogicEngine.configureMatch 不再指派 this.tk／this.tid（aa38625 之後沒有讀者）；TACTICAL_DIRECTOR_MODES 只在 matchRuleset.js 定義一份，
  //  tacticalDirector.js 改為 import／轉出同一個物件。不改任何輸入的解析結果與引擎行為：golden 逐位元相同 ⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 ed0daff971db2d7a 未曾發布）。
  //  2026-10-15（Phase 3a-C3-1）：C3-1: phase skeleton core.v1 + career.v21/balanceTool.v21; behaviour unchanged.
  //  matchRuleset.js 多了 career.v21／balanceTool.v21（tacticalDirector "core.v1"）與 RS-1 擴充；Resolver 只在要求時多回每時期方針
  //  （三份共用整場物件）；組裝器只在 core.v1 時把 phases 交給 configureMatch；Director core.v1 依 phase(clock()) 挑選。
  //  v20 規則集與既有輸入的解析結果、configureMatch 引數完全不變（golden 131／153 逐位元相同）；v21 規則集下引擎輸出亦逐位元相同
  //  （tools/check_c3_phase_skeleton.mjs G-AC1 ②）⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 eb0249883e225fc4 未曾發布）。
  //  2026-10-16（Phase 3a-C3-1 laneFrame）：C3-1 laneFrame: red lane-keyed knobs team-relative under career.v21/balanceTool.v21; legacy unchanged.
  //  matchRuleset.js 多了 laneFrame 層（legacyMirror｜teamRelative；缺少 ≡ legacyMirror），career.v21／balanceTool.v21 帶 teamRelative；
  //  組裝器只在層存在時把 laneFrame 交給 configureMatch（並對未宣告支援的引擎報 deps_missing）；LogicEngine 原樣轉交；
  //  tacticalDirector.js 在 teamRelative 下把紅方按路分的 knobs（LANE_KEYED_KNOBS）以 gameData.js 的映射轉成世界路名（TD-3A-23，Owner D-1 = A）。
  //  **這是 v21 規則集下的語意變化**（紅方上下路不對稱的案例改變：事前登記的 9 個 v21-A 案，tools/check_laneframe_c3.mjs C3）；
  //  v20 規則集與既有輸入完全不變（golden 131／153 逐位元相同）。v21 仍是未發布候選 ⇒ 依 TD-3A-23 §3.6 選項 1 同版號重新登記
  //  （舊值 79436579b2f999cf 未曾發布）。
  //  2026-10-21（Phase 3a-C3-2 前置）：C3-2 prereq: identityOfKnobs falls back to a construction-time knobs->identity map; behaviour unchanged.
  //  tacticalDirector.js core.v1 的 identityOfKnobs 先查目前時期（不變），查不到才查建立時登記的「每份 knobs → 同時期 identity」。
  //  今天三個時期共用同一份物件 ⇒ 第一步永遠命中，回答與之前逐參照相同（tools/check_tactical_director_3c.mjs C4）；
  //  golden 131／153 與 v21 規則集下的引擎輸出逐位元相同 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 6c8db7e7cff3ae6a 未曾發布）。
  //  2026-10-22（Phase 3a-C 每時期方針基礎建設）：C-infra: per-phase choices (objectiveOrder / grouping / focusLane) resolve to per-phase
  //  objects; legacy phaseChoices only under tool rulesets; behaviour unchanged when no per-phase choice is given.
  //  tacticChoiceMapping.js 多了 PHASE_CHOICE_MAPPING（每個值都是既有模板的值）；tacticResolver 在有每時期選擇時才另建該時期的物件，
  //  沒有時三份仍共用整場物件（R-4）；matchSetup／matchAssembler 只在工具規則集接受 legacy 的 phaseChoices。
  //  所有既有輸入都沒有每時期選擇 ⇒ golden 131／153 與 v21 規則集下的輸出逐位元相同 ⇒ 不是語意變化（新行為只在選了才出現）。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 49faf7d28aa9ebfb 未曾發布）。
  //  （同日審查後補強：static 收到每時期選擇改為拒絕、數值覆寫取較高者；仍只影響帶了每時期選擇的輸入。舊值 6a5ab2a437d9a28e 未曾發布。）
  //  2026-10-22（Phase 3a-C3-2 收尾）：C3-2 closeout: six phase stances offered on n=400 replication evidence; registry data only.
  //  capabilityRegistry.js：時期姿態的 G-A7 指標改為 phaseEngageDecisionsPerMin.<p>（舊指標列入 retiredClaims）、新增 REPLICATION_CONFIRMED（6 筆）、
  //  REPLICATION_WITHHELD 多 2 筆 owner_hold（前期／中期 scaling）、MEASURED_EXCLUSIONS 拿掉被 n=400 複驗取代的 8 列時期姿態。
  //  只改「提供給玩家挑哪些」與量測登記；同一份輸入（含帶這些選擇的計畫）解析出的旋鈕與引擎輸出都不變 ⇒ 不是語意變化。
  //  ⚠ 但畫面載入舊存檔時的 offeredChoicesOnly（TacticScreen）不再拿掉這 6 個選擇 ⇒ 同一份**存檔計畫**送進對局的選擇會不同（預期行為）。
  //  tacticIndicators.ruleSuppressed 只看 not_replicated（owner_hold 的證據成立，不抑制規則）；今天沒有規則引用時期姿態。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 6a57c36c98d8b7ee 未曾發布）。
  //  （同日審查後補強：弱點模板照舊由真實性表判定、ruleSuppressed 只看 not_replicated（tacticIndicators.js）。舊值 2fc8cf8703647876 未曾發布。）
  //  2026-10-22（真實性表以新指標整輪重測後）：MEASURED_EXCLUSIONS 加 4 筆弱點模板的時期姿態排除（classic.m4 前期 scaling、
  //  v2.defensive_hold 中期 scaling、classic.m1 後期 defensive／scaling；n=40 的 phaseEngageDecisionsPerMin.<p>）。只改提供哪些選擇；
  //  非時期的 72 列與前一版逐位元相同 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 a5ce0d283ead3e5c 未曾發布）。
  //  2026-10-23（Phase 3a-C3-3／C4 升級 live）：Phase 3a-C3-3/C4 live: per-phase grouping/objectiveOrder (director rulesets only); per-match filter; behaviour unchanged for existing inputs.
  //  capabilityRegistry.js：phases.<p>.grouping／objectiveOrder 改 live（requires Director core.v1）、REPLICATION_CONFIRMED／WITHHELD 加 C3-3／C4 列、
  //  整場巨龍／巴龍的 G-A7 指標改為 contestShare（舊指標列入 retiredClaims；v21 證據只留在 REPLICATION_V21_SCOPE_ONLY，Owner 裁定不開放 v20）。
  //  tacticChoiceMapping.js：objectiveOrder 加不覆寫值 none、共用 phaseProjectionOf（tacticResolver 改呼叫它，成功路徑輸出逐位元相同）、
  //  選擇引擎提供每時期選擇、tacticBookOptions 依 Director 模式過濾。liveMatchSetup.js：本場規則集用不到的選擇只從本場 binding 拿掉（記在 notes）——
  //  以前這種輸入會被組裝器拒絕（沒有輸出），現在開得了局；所有本來開得了局的輸入結果不變（golden 131／setup 153 實跑相同）⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 21a219764652fd1d 未曾發布）。
  //  2026-10-23（真實性表整輪重測後，Owner 裁定）：整場巨龍／巴龍的 G-A7 指標改回 v20 原本的 objectiveFightEntriesPerMin（v20 的能力與
  //  排除表完全依 v20 既有證據；上面「改為 contestShare」那一段作廢，retiredClaims 與其封存檔一併拿掉）；MEASURED_EXCLUSIONS 加 9 筆
  //  每時期型的弱點模板排除（classic.m2／m8，n=40）。只改提供哪些選擇 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 265bf51eeec97f55 未曾發布）。
  //  2026-10-23（C5R 強邊一次受控重新設計，Owner 核准；review/tactic-book-3a/C5R_強邊重新設計.md）：LogicEngine._gankPickV20 多一個 focus 參數——
  //  knobs 帶 gankFocusLane 時那一路加 gankFocusAdd × 0.2（不做最大值正規化），其他路不變；tacticChoiceMapping.phaseProjectionOf 的強邊改帶
  //  gankFocusLane／gankFocusAdd、不再覆寫 gankWeights；tacticalDirector LANE_KEYED_KNOBS 加 gankFocusLane（值型）。這兩個欄位只在選了強邊
  //  （design，只限工具規則集的 phaseChoices）的時期出現 ⇒ 所有既有輸入行為不變（golden 131／setup 153 實跑相同）⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 24661fa8041eb9a3 未曾發布）。
  //  同日（C5R 量測前審查後＋跨版本證據隔離）：gankFocusAdd 改為正規化後的增量（÷ 本來的最大權重，std 仍是 0.7）；MEASURED_EXCLUSIONS 加
  //  scope 欄位與 2 筆只在 static 生效的時期姿態排除（v20 不用 v21 證據，Owner 2026-10-23），measuredExclusion／提供清單／開局過濾依模式套用。
  //  既有輸入的模擬行為不變 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 e3ba74f04a6ba3e0 未曾發布）。
  //  同日（隔離審查 #2）：liveMatchSetup 的 scope 判定改為直接查帶本場模式 scope 的列（與排除表順序無關）；行為不變 ⇒ 同版號重新登記（舊值 2ae772222d157170
  //  未曾發布；C5R 量測在 2ae772222d157170 下開始與完成，這次改動只在開局過濾、不在量測路徑上）。
  //  2026-10-24（Owner 第二輪 Review 核准）：C5R strong side live (v21 director rulesets only); C6 win-condition fill (design); stance+objectiveOrder plan fix.
  //  capabilityRegistry.js：phases.<p>.focusLane 改 live（requires Director core.v1；宣稱 ganksOwnPerMin.<lane>.<p>）、REPLICATION_CONFIRMED 加 C5R 9 列、
  //  新增 REPLICATION_PRESET_CONFIRMED（快速模式強邊 3 列，只留證據）；winCondition 仍是 design（列舉先登記）。
  //  tacticChoiceMapping.js：WIN_CONDITION_PRESETS＋winConditionFill／effectiveChoices（只替沒選的維度預填既有選擇，tacticResolver 改用展開後的選擇；
  //  沒有 winCondition ⇒ 展開結果＝原選擇，逐位元相同）；強邊列加 reads／phaseTouchedFieldsOf（資料說明，不影響解析）；
  //  phaseOfferedDetail 修正：同一時期的 phases.<p>.stance（整場對照表的維度）不再被當成未知的每時期維度 ⇒「前期姿態＋前期物件優先」
  //  以前整份計畫被拒絕（沒有輸出），現在接受；所有本來接受的計畫解析結果不變。強邊選了才出現的 knob 在 C5R 已登記。
  //  ⇒ 所有既有輸入（含 v20、v21-A 黃金）的模擬行為不變（golden 131／setup 153 實跑相同）⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 70a8af6428b02a03 未曾發布）。
  //  同日（C6 量測前審查 F3／F4）：winConditionFill 跟著 withMeasured、plan 層不再以「完整組合」拒絕帶勝利條件的計畫、戰術書的其他維度以展開後的選擇算提供清單；
  //  勝利條件仍是 design ⇒ 所有既有輸入的模擬行為不變 ⇒ 不是語意變化。v21 未發布 ⇒ 同版號重新登記（舊值 30b44a789b4c7548 未曾發布）。
  //  2026-10-24（C6 正式量測 tools/fixtures/phase_options_result_c6.json 後，Owner 核准前期滾雪球升為 v21 候選 live）：
  //  capabilityRegistry.js：winCondition 改 live（requires Director core.v1 ⇒ v20／static 開局拿掉，量測前審查 F5）、REPLICATION_CONFIRMED 加
  //  前期滾雪球、REPLICATION_WITHHELD 加控圖運營（insufficient）與中路分推（one_sided）；新增 WIN_CONDITION_COMPONENTS（資料說明）。
  //  tacticChoiceMapping.js：帶 winCondition＝none 的計畫不再被拒絕（none＝不填任何格）。勝利條件只展開成既有 live 選擇（引擎不認得它），
  //  沒有勝利條件的輸入解析結果逐位元相同 ⇒ 所有既有輸入（含 v20、v21-A 黃金）的模擬行為不變 ⇒ 不是語意變化。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 3d7ee3c4ac59f162 未曾發布；C6 量測在 3d7ee3c4ac59f162 下開始與完成）。
  //  同日（升級後真實性表重測 tools/fixtures/tactic_truth_3a.json，58d999709c239ca4 下 163 批、0 失敗；舊 119 列逐位元相同）：
  //  capabilityRegistry.js 的 MEASURED_EXCLUSIONS 照結果表推導加 6 筆弱點模板列（強邊 4、勝利條件 2，只對該模板不提供）。
  //  這會改變「那幾個模板＋那幾個選擇」的計畫在開局被拿掉與否（勝利條件兩列本來就撤下）；其他輸入不變。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 58d999709c239ca4 未曾發布）；simulationVersion.js 被量測載入 ⇒ 真實性表再整輪重測。
  //  2026-10-25（Phase 3a-B P1；Owner 2026-10-25 核准開工，所有 P1 語意變更合併登記一次）：
  //  ① T16 challenge.v21（matchRuleset.js 新規則集＋旗標解析＋challengeRulesetForVersion；challengeRunner／challengeMatchSetup 依挑戰記下的
  //     版本選規則集）：旗標關 ⇒ 新挑戰記 moba-sim.v20、跑 challenge.v20，與正式站逐位元相同（challenge setup 12/12）；旗標開 ⇒ challenge.v21。
  //  ② T15 AI 教練 v1（aiCoach.js 加入本清單；career.v21 的 redTactic 改 aiCoachV1）：career.v21 有 AI 對手的 live 輸入紅方改用教練計畫
  //     （事前登記 tools/fixtures/ai_coach_registration_3aB.json：v21-A 恰好 6 案改變）；career.v20、balanceTool.v20／v21 不變。
  //  ③ 後期上／中／下強邊改回 design（capabilityRegistry.js：REPLICATION_CONFIRMED → REPLICATION_WITHHELD owner_hold）：提供清單少了這三個，
  //     帶著它們的已存計畫照舊解析（同控圖運營）；其他輸入不變。
  //  ④ liveMatchSetup.js 多回傳 droppedChoices（畫面提示用，不進 setup）。
  //  v21 未發布 ⇒ 同版號重新登記（舊值 b37772a2f1777b03 未曾發布）；matchRuleset.js 被量測載入 ⇒ 真實性表必須在語意凍結後整輪重測（先跑預演批次）。
  //  2026-10-25（Owner Review 決策 5，語意凍結前）：AI 教練加證據規則——模板以外的選擇只加在有 n=400 紅藍複驗的 std 上
  //  （積極型＝std＋前期滾雪球、均衡型＝std＋依素質的輔助任務；v2 模板用純模板；不用強邊；不用未量過的「野區入侵＋前期滾雪球」）。
  //  只改 career.v21 有 AI 對手時的紅方計畫；其他輸入不變。v21 未發布 ⇒ 同版號重新登記（舊值 e3acf891023937e9 未曾發布）。
  "moba-sim.v21": "0578fa882d74b205",
});

export const isKnownSimulationVersion = (v) =>
  typeof v === "string" && KNOWN_SIMULATION_VERSIONS.includes(v);

/**
 * 這個版本的 Challenge 現在還重播得出來嗎？
 *
 * @param {string} recorded  Challenge 當初記下的版本
 * @param {string} [current] 現在的版本（預設取本檔常數）
 * @returns {{ ok: boolean, reason: string|null }} `reason` 是可直接顯示的中文
 */
export function canReplay(recorded, current = MOBA_SIMULATION_VERSION) {
  if (!isKnownSimulationVersion(recorded)) {
    return { ok: false, reason: `不明的模擬版本（${recorded ?? "未記錄"}），無法重播` };
  }
  if (recorded !== current) {
    //  ⚠ 這裡**不做相容性推測**。「小版號不同應該還是一樣吧」正是
    //    會讓一份對不上的重播被當成正確結果的想法。
    return { ok: false, reason: `這場使用 ${recorded} 的模擬語意，目前是 ${current}，不可重播` };
  }
  return { ok: true, reason: null };
}
