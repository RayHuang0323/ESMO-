#!/usr/bin/env node
// ============================================================================
//  tools/verify.mjs — 驗證分段執行器（Milestone K0）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  `check_moba_runtime29` 與 `check_moba_stats28` 自 I-close 起就跑不完
//  （四次嘗試全部逾時，見 TD-17）。之前的判斷是「它們很大、很慢」。
//  實際展開巢狀呼叫圖之後，根因是**重複執行**：
//
//      一次 runtime29 = 63 個子行程
//      tactic24 ×16、cs23 ×8、progress25 ×8、regress ×8、regress2 ×8、
//      flow09 ×6、experience26 ×4、talent27 ×2、build ×2、stats28 ×1
//
//  regress 單跑就要好幾分鐘，跑八遍當然跑不完。斷言本身沒有問題，
//  問題是同一份斷言被重跑了八次。
//
//  ── 這支做什麼 ────────────────────────────────────────────────────────────
//  **不是第二套驗證框架**，是一個驅動器：它不定義任何新斷言、不改任何判準，
//  只負責「把既有的腳本各跑一次、記住結果、可以續跑」。
//
//    node tools/verify.mjs --list                 列出所有區段
//    node tools/verify.mjs --only=regress,regress2   跑指定區段（單段／多段）
//    node tools/verify.mjs                        跑全部（依序）
//    node tools/verify.mjs --resume               只跑「還沒通過」的區段
//    node tools/verify.mjs --resume --only=a,b    兩者可併用
//
//  搭配 `ESMO_VERIFY_FLAT=1`（本檔會自動設給子行程）讓會 fan-out 的腳本
//  跳過它們的巢狀子驗證——因為那些子項目本 runner 已經各跑一次了。
//  被跳過的區段會**明確標成 SKIP 並排除在分母外**，不會假裝通過。
//
//  ── 誠實規則（不可妥協）──────────────────────────────────────────────────
//   · 只要有任何區段 FAIL ⇒ exit 1
//   · 跑全部時只要有區段沒跑完／被中斷 ⇒ exit 2（**不允許 exit 0**）
//   · 狀態檔記錄每段的 exit code 與輸出尾巴，未完成就是未完成
// ============================================================================
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const STATE = resolve(ROOT, "tools/.verify-state.json");

/**
 * 區段登記表。
 *
 * `shape` 是「這支腳本跑成功時的輸出長相」——沿用各腳本原本就在用的判準，
 * 本 runner **不新增也不放寬任何斷言**。exit code 與 shape 兩者都要成立。
 *
 * 順序＝由快到慢、由基礎到整合，讓失敗盡早出現。
 */
const SEGMENTS = [
  { id: "cs_awareness_steering", script: "tools/check_cs_awareness_steering.mjs", shape: /CS Awareness Steering: 15\/15 PASS/, note: "Owner4真來源pure視線wrap／corner pace／TTL情報與公開地圖cover peek安全及禁用條件；非runtime或GPU" },
  { id: "cs_owner4_contact_runtime", script: "tools/check_cs_owner4_contact_runtime.mjs", shape: /CS Owner4 Contact Runtime: 12\/12 PASS/, note: "Owner4三圖同seed真5v5可視loaded reaction-ready actor timeline；>=1.5s等待守門與多射手/反擊OBSERVED或NOT_TRIGGERED" },
  { id: "cs_utility_purchase_named30", script: "tools/check_cs_utility_purchase_plan_runtime.mjs", shape: /CS Utility Purchase Plan Runtime: 30\/30 PASS/, note: "原45列涉及30個具名舊canonical inputs，只驗受影響30場新版purpose/window/inventory因果" },
  { id: "cs_utility_purchase_plan_runtime", script: "tools/check_cs_utility_purchase_plan_runtime.mjs", shape: /CS Utility Purchase Plan Runtime: 4\/4 PASS/, note: "原Utility反覆購入零用四個具名真5v5案例；購入purpose／carry／真window／throw一對一" },
  { id: "cs_owner5_runtime", script: "tools/check_cs_owner5_runtime.mjs", shape: /CS Owner5 Runtime: 6\/6 PASS/, note: "Owner五項新問題：指定單圖／fresh陣容真對局與出生／道具起步／責任分工" },
  { id: "cs_gameplay_legacy_exact_equivalence", script: "tools/check_cs_gameplay_legacy_exact_equivalence.mjs", shape: /CS Gameplay Legacy Exact Equivalence: 3\/3 PASS/, note: "本輪Major變更後舊c9封存與新源同inputs完整Legacy全sim SHA相等" },
  { id: "cs_gameplay_authenticity_diagnostic", script: "tools/check_cs_gameplay_authenticity_matrix.mjs", shape: /CS Gameplay Authenticity Matrix: 3\/3 COMPLETE/, note: "Owner7問題新版三圖完整真對局診斷，非最終gameplay acceptance" },
  { id: "cs_gameplay_authenticity_fixture_retry", script: "tools/check_cs_gameplay_authenticity_matrix.mjs", shape: /CS Gameplay Authenticity Matrix: 1\/1 COMPLETE/, note: "僅補原生保存失敗而缺證據的Mirage完整對局，其他已PASS不重跑" },
  { id: "cs_gameplay_authenticity_matrix", script: "tools/check_cs_gameplay_authenticity_matrix.mjs", shape: /CS Gameplay Authenticity Matrix: 55\/55 COMPLETE/, note: "新版55場真對局含UI選擇，各回合分布與炸彈道具統計另判讀" },
  { id: "cs_bounds_sampler", script: "tools/check_cs_bounds_sampler.mjs", shape: /CS bounds sampler: 14\/14 PASS/, note: "CS 原生bounds等價／單次矩陣走訪／動態掛件與隱藏幾何" },
  { id: "cs_visibility_bounds", script: "tools/check_cs_visibility_bounds.mjs", shape: /CS visibility bounds: 8\/8 PASS/, note: "CS 真實產品visibility snapshot原生／major完整欄位等價與安全診斷" },
  { id: "cs_major_navigation_cache", script: "tools/check_cs_major_navigation_cache.mjs", shape: /CS Major Navigation Cache: 23\/23 PASS/, note: "CS major 有界精確路段快取／三圖路線及完整模擬與未快取等價" },
  { id: "cs_major_room_fixtures", script: "tools/check_cs_major_room_fixtures.mjs", shape: /CS Major Room Fixtures: 15\/15 PASS/, note: "CS major 工位同源bounds／正式移動與LOS／4.8m通廊半徑帶／雙門導航" },
  { id: "cs_major_shader_warmup", script: "tools/check_cs_major_shader_warmup.mjs", shape: /CS Major Shader Warmup: 12\/12 PASS/, note: "CS major 屋頂／真透明Standard特效一次性預熱／共用資產不改動／取消與釋放生命週期" },
  { id: "cs_major_scene_v1", script: "tools/check_cs_major_scene_v1.mjs", shape: /CS Major Scene v1: 120\/120 PASS/, note: "CS Major 原創場景／CC0來源／幾何預算／collision與高度／雙入口與工位實際幾何／設施足跡眼高／道路shader隔離／平面陰影單pass／淡出釋放" },
  { id: "cs_major_camera_framing", script: "tools/check_cs_major_camera_framing.mjs", shape: /CS Major camera framing: 16\/16 PASS/, note: "CS Major 桌機／窄版真實透視、近拍前側背、縮放焦點與legacy保持、炸彈邊界" },
  { id: "cs_camera_recovery", script: "tools/check_cs_camera_recovery.mjs", shape: /CS camera recovery: 21\/21 checks passed/, note: "CS 鏡頭恢復／局部遮擋／POV實牆／major透明shader狀態切換／legacy保留" },
  { id: "cs_major_character_v1", script: "tools/check_cs_major_character_v1.mjs", shape: /CS Major Character v1: 87\/87 PASS/, note: "CS Major 真實 rig／配件合批／形體等價／mobile 品質與釋放" },
  { id: "cs_major_weapon_sockets", script: "tools/check_cs_major_weapon_sockets.mjs", shape: /CS Major Weapon Sockets B1: 63\/63 PASS/, note: "CS major 真GLB／五槍族手骨握把及世界槍口／真動畫／原成本預算／legacy隔離" },
  { id: "cs_major_support_grip", script: "tools/check_cs_major_support_grip.mjs", shape: /CS Major Support Grip B7: 21\/21 PASS/, note: "CS major真五族支撐接觸／真動畫骨長不變／射擊蹲姿及移動／暫停seek不漂移／換彈受擊死亡交還動畫／不可達fail closed／零繪製成本及legacy隔離" },
  { id: "cs_major_gunplay_sockets", script: "tools/check_cs_major_gunplay_sockets.mjs", shape: /CS Major Gunplay Sockets: 18\/18 PASS/, note: "CS major 槍口position及direction接線／權威彈道終點／高度回退／244池上限／legacy保留" },
  { id: "cs_major_animation_lifecycle", script: "tools/check_cs_major_animation_lifecycle.mjs", shape: /CS Major Animation Lifecycle B2: 19\/19 PASS/, note: "CS major 真GLB暫停／地形接地／倒帶及seek／回合重置／legacy舊流程保留" },
  { id: "cs_major_weapon_pose_layers", script: "tools/check_cs_major_weapon_pose_layers.mjs", shape: /CS Major Weapon Pose Layers B4: 26\/26 PASS/, note: "CS major 真GLB互斥雙層／跑射相位／共享clip不共享action／暫停seek／原hit及death／零新增Mesh" },
  { id: "cs_major_weapon_handling", script: "tools/check_cs_major_weapon_handling.mjs", shape: /CS Major Weapon Handling B7: 21\/21 PASS/, note: "CS major權威逐發扣彈／空匣換彈／死亡拾槍／真GLB蹲姿及換彈進度／pause與seek／真事件彈量" },
  { id: "cs_major_pov_weapon", script: "tools/check_cs_major_pov_weapon.mjs", shape: /CS Major POV Weapon B5: 41\/41 PASS/, note: "CS major五族真POV模型共用geometry／grip及support socket／真來源手部私有clone／狙擊槍真管口幾何與後槍托軸向／真GLB PBR分區／權威POV換彈pause及seek／合批手套預算／硬質材質反射共用及末一釋放／跨actor材質池末一釋放／私有RGBA布料與車線末一釋放／pause及seek時鐘／幀內roundSec shotAtMs／真射擊抬槍及眼側kick／null actor與真投擲上臂橋接袖口／四type循環scene恆四part且私有tree嚴格5200tri／私有資源釋放" },
  { id: "cs_major_tailored_clothing", script: "tools/check_cs_major_tailored_clothing.mjs", shape: /CS Major Tailored Clothing B6: 37\/37 PASS/, note: "CS major真65骨連續服裝／領腰面積守恆／真腕口私有連續顏色／雙袖bind裁片與shader隔離／方向性肘皺與位移上限／裁片共面與包邊／真肩肘前臂袖口覆蓋／寬面肩裁片外肘袖口方向性／局部GLSL有界與非袖隔離／布料借用及skinned校色／來源不變／末一釋放／50套真GLB槍成本與legacy原上限" },
  { id: "cs_major_audio_pool", script: "tools/check_cs_major_audio_pool.mjs", shape: /CS Major Audio Pool B3: 22\/22 PASS/, note: "CS 原生Gain／Panner有界重用／排程取消／priority／stale callback／一次性source回收" },
  { id: "cs_major_ambient_audio", script: "tools/check_cs_major_ambient_audio.mjs", shape: /CS Major Ambient Audio B7: 14\/14 PASS/, note: "CS major CC0環境loop／來源SHA／單graph／frame時間定位／pause及seek清理／晚到取消" },
  { id: "cs_major_audio_playback", script: "tools/check_cs_major_audio_playback.mjs", shape: /CS Major Audio Playback B3: 25\/25 PASS/, note: "CS major正向播放gate／真位置及鏡頭左右／腳步唯一事件／legacy與frame不變" },
  { id: "cs_major_simulation_v1", script: "tools/check_cs_major_simulation_v1.mjs", shape: /CS Major Simulation v1: 24\/24 PASS/, note: "CS Major 原創空間／廠房雙入口／路線／決定性／舊進行中比賽相容" },
  { id: "cs_major_utility_rules", script: "tools/check_cs_major_utility_rules.mjs", shape: /CS Major Utility Rules C1: 37\/37 PASS/, note: "CS Major 秒制致盲／真庫存飛行／煙火合計非空因果／拆彈中斷保槍轉交" },
  { id: "cs_major_tactical_coordinator", script: "tools/check_cs_major_tactical_coordinator.mjs", shape: /CS Major Tactical Coordinator: 42\/42 PASS/, note: "CS Major 不偷攻點／隊伍情報意圖／六點交叉站位／真trade與clutch純規則" },
  { id: "cs_major_tactical_runtime", script: "tools/check_cs_major_tactical_runtime.mjs", shape: /CS Major Tactical Runtime C2-C4: 34\/34 PASS/, note: "CS Major 三圖真情報／目標角色lane與phase游標／trade與1vN／保槍／假攻因果" },
  { id: "cs_major_tactical_edge_runtime", script: "tools/check_cs_major_tactical_edge_runtime.mjs", shape: /CS Major Tactical Edge Runtime: 10\/10 PASS/, note: "CS Major 單一合法遠距CT輔助陣容，同seed真交叉火力／保槍／晚安包權威倒數" },
  { id: "cs_major_replay_ui", script: "tools/check_cs_major_replay_ui.mjs", shape: /CS Major Replay UI D: 51\/51 PASS/, note: "CS Major 保存真frame重播／compact全欄位／逐回合ADR與stable隊伍HUD／v1可選真統計與legacy形狀；需ESMO_CS_D_FIXTURE" },
  { id: "cs_major_replay_input", script: "tools/check_cs_major_replay_input.mjs", shape: /CS Major Replay Input D: 15\/15 PASS/, note: "CS Major Replay損壞輸入中文拒絕／歷史游標防未來曝光／唯一真1111frames與21round唯讀相容" },
  { id: "cs_identity_gap_r38", script: "tools/check_cs_identity_gap_r38.mjs", shape: /CS 16-Stat Gameplay Identity Gap Closure R38: PASS/, note: "CS seven identity-gap classification and prioritization" },
  { id: "cs_reflex_calibration_r39", script: "tools/check_cs_reflex_calibration_r39.mjs", shape: /CS Reflex Calibration Pilot R39: PASS/, note: "CS Reflex finite calibration sweep" },
  { id: "cs_apm_calibration_r40", script: "tools/check_cs_apm_calibration_r40.mjs", shape: /CS APM Calibration Pilot R40: PASS/, note: "CS APM finite calibration sweep" },
  { id: "cs_courage_calibration_r41", script: "tools/check_cs_courage_calibration_r41.mjs", shape: /CS Courage Calibration Pilot R41: PASS/, note: "CS Courage finite calibration sweep" },
  { id: "cs_positioning_calibration_r42", script: "tools/check_cs_positioning_calibration_r42.mjs", shape: /CS Positioning Calibration Pilot R42: PASS/, note: "CS Positioning finite calibration sweep" },
  { id: "cs_accuracy_calibration_r43", script: "tools/check_cs_accuracy_calibration_r43.mjs", shape: /CS Accuracy Calibration Pilot R43: PASS/, note: "CS Accuracy finite calibration sweep" },
  { id: "cs_focus_semantic_correction_r44", script: "tools/check_cs_focus_semantic_correction_r44.mjs", shape: /CS Focus Semantic Correction Readiness R44: PASS/, note: "CS Focus raw/effective semantic correction readiness" },
  { id: "cs_batch_calibration_r45", script: "tools/check_cs_batch_calibration_r45.mjs", shape: /CS Batch Calibration R45: PASS/, note: "CS Focus / Decision / Clutch(str) / Resilience(res) batch local calibration" },
  { id: "cs_distribution_baseline_r46", script: "tools/check_cs_distribution_r46.mjs", shape: /CS Distribution Baseline R46: PASS/, note: "CS mature-stat role distribution and generation baseline" },
  { id: "cs_identity_consumers_r47", script: "tools/check_cs_identity_consumers_r47.mjs", shape: /CS Identity Consumers R47: PASS/, note: "CS MapAware / Adaptability / TacticalIQ minimal live consumers" },
  { id: "cs_team_identity_consumers_r48", script: "tools/check_cs_team_identity_consumers_r48.mjs", shape: /CS Team Identity Consumers R48: PASS/, note: "CS Comms / Leadership / Synergy minimal team consumers" },
  { id: "cs_reflex_read_chain_r19", script: "tools/check_cs_reflex_read_chain_r19.mjs", shape: /CS Reflex Read-Chain \/ Role Interaction Audit R19: PASS/, note: "CS Reflex historical read-chain semantic verifier" },
  { id: "cs_learning_lifecycle_r16b", script: "tools/check_cs_learning_lifecycle_r16b.mjs", shape: /CS Learning Lifecycle \/ State Design R16-B: PASS/, note: "CS Learning historical lifecycle evidence" },
  { id: "cs_mapaware_semantics_r18b", script: "tools/check_cs_mapaware_semantics_r18b.mjs", shape: /CS MapAware Semantics \/ Read-Point Design R18-B: PASS/, note: "CS MapAware historical spatial read-point evidence" },
  { id: "cs_learning_measurement_r37", script: "tools/check_cs_learning_measurement_r37.mjs", shape: /CS Learning Measurement \/ Calibration Readiness R37: PASS/, note: "CS Learning cross-match lifecycle measurement" },
  { id: "cs_learning_lifecycle_r55", script: "tools/check_cs_learning_lifecycle_r55.mjs", shape: /CS Learning Lifecycle R55: PASS/, note: "CS Learning post-match XP absorption lifecycle" },
  { id: "cs_roster_v1_r56", script: "tools/check_cs_roster_v1_r56.mjs", shape: /CS Roster v1 R56: PASS/, note: "CS formal AI teams and roster v1" },
  { id: "cs_matchup_acceptance_r57", script: "tools/check_cs_matchup_acceptance_r57.mjs", shape: /CS Matchup Acceptance R57: PASS/, note: "CS formal AI-team deterministic matchup acceptance" },
  { id: "roster_ui_r58", script: "tools/check_roster_ui_r58.mjs", shape: /Roster UI R58: PASS/, note: "MOBA / CS unified roster UI and free role identity" },
  { id: "roster_ui_r581", script: "tools/check_roster_ui_r581.mjs", shape: /Roster UI R58\.1: PASS/, note: "MOBA / CS roster hierarchy and mode-specific role suitability" },
  { id: "roster_ui_r582", script: "tools/check_roster_ui_r582.mjs", shape: /Roster UI R58\.2: PASS/, note: "Roster summary/detail information architecture and player language" },
  { id: "team_development_recovery", script: "tools/check_team_development_recovery.mjs", shape: /Team Development recovery contract: PASS/, note: "P0.6B Team Development UI／persistence／consumer recovery contract" },
  { id: "team_development_v15", script: "tools/check_team_development_v1.mjs", shape: /Team Development v1\.5: PASS/, note: "戰隊發展 v1.5 路線、migration、UI 與真實效果" },
  { id: "r61_ui_fixture", script: "tools/check_r61_ui_fixture.mjs", shape: /R61 UI Fixture: PASS/, note: "R61 UI／GSAP／mobile fixture" },
  { id: "player_ui_r62", script: "tools/check_r62_player_ui_fixture.mjs", shape: /R62 fixture: Roster \/ Recruit \/ Profile UI anchors: PASS/, note: "Player Profile career／contract／status UI foundation" },
  { id: "active_match_r63", script: "tools/check_r63_active_match.mjs", shape: /R63 Active Match focused: 13\/13 通過/, note: "R63 active match resume／fast finish／shared speed controls" },
  { id: "r63_competition_integration", script: "tools/check_r63_competition_integration.mjs", shape: /R63 × Competition combined gate: 19\/19 passed/, note: "R63 ActiveMatch × Competition fixture／settlement integration" },
  { id: "p06b_browser_presence", script: "tools/browser_check_p06b_product_presence.mjs", shape: /P0\.6B browser product-presence: 12\/12 PASS/, note: "P0.6B browser product presence／reload／mobile widths" },
  { id: "cs_mapaware_measurement_r37", script: "tools/check_cs_mapaware_measurement_r37.mjs", shape: /CS Map Awareness Measurement \/ Calibration Readiness R37: PASS/, note: "CS Map Awareness spatial read-point measurement" },
  { id: "cs_clutch_measurement_r30", script: "tools/check_cs_clutch_measurement_r30.mjs", shape: /CS Clutch Measurement \/ Calibration Readiness R30: PASS/, note: "CS Clutch read-chain deterministic calibration-readiness measurement" },
  { id: "cs_resilience_measurement_r31", script: "tools/check_cs_resilience_measurement_r31.mjs", shape: /CS Resilience Measurement \/ Calibration Readiness R31: PASS/, note: "CS Resilience read-chain deterministic calibration-readiness measurement" },
  { id: "cs_clutch_resilience_semantics_r32", script: "tools/check_cs_clutch_resilience_semantics_r32.mjs", shape: /CS Clutch × Resilience Semantic Boundary Audit R32: PASS/, note: "CS Clutch／Resilience semantic ownership boundary audit" },
  { id: "cs_adaptability_measurement_r34", script: "tools/check_cs_adaptability_measurement_r34.mjs", shape: /CS Adaptability Measurement \/ Calibration Readiness R34: PASS/, note: "CS Adaptability read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_tactical_iq_measurement_r35", script: "tools/check_cs_tactical_iq_measurement_r35.mjs", shape: /CS TacticalIQ Measurement \/ Semantic Readiness R35: PASS/, note: "CS TacticalIQ read-chain／semantic-readiness measurement" },
  { id: "cs_synergy_semantics_r16a", script: "tools/check_cs_synergy_semantics_r16a.mjs", shape: /CS Synergy Semantics \/ Read-Chain R16-A: PASS/, note: "CS Synergy historical team-level read-chain evidence" },
  { id: "cs_comms_measurement_r36", script: "tools/check_cs_team_stats_measurement_r36.mjs", args: ["--stat=com"], shape: /CS Comms Measurement \/ Semantic Readiness R36: PASS/, note: "CS Comms read-chain／team-information semantic-readiness measurement" },
  { id: "cs_leadership_measurement_r36", script: "tools/check_cs_team_stats_measurement_r36.mjs", args: ["--stat=led"], shape: /CS Leadership Measurement \/ Semantic Readiness R36: PASS/, note: "CS Leadership read-chain／team-direction semantic-readiness measurement" },
  { id: "cs_synergy_measurement_r36", script: "tools/check_cs_team_stats_measurement_r36.mjs", args: ["--stat=coo"], shape: /CS Synergy Measurement \/ Semantic Readiness R36: PASS/, note: "CS Synergy read-chain／coordination semantic-readiness measurement" },
  { id: "milestone_b4", script: "tools/check_moba_milestone_b4.mjs", shape: /Milestone B\.4 verifier: PASS/, note: "B.4：小兵離散攻擊／並行選敵／Replay" },
  { id: "milestone_j_close", script: "tools/check_moba_milestone_j_close.mjs", shape: /✅ PASS/, note: "J-close" },
  { id: "milestone_j", script: "tools/check_moba_milestone_j.mjs", shape: /✅ PASS/, note: "J：召喚師技能引擎效果" },
  { id: "milestone_i_close", script: "tools/check_moba_milestone_i_close.mjs", shape: /✅ PASS/, note: "I-close" },
  { id: "milestone_i", script: "tools/check_moba_milestone_i.mjs", shape: /31\/31 通過/, note: "I" },
  { id: "milestone_h", script: "tools/check_moba_milestone_h.mjs", shape: /31\/31 通過/, note: "H：英雄定位" },
  { id: "milestone_g", script: "tools/check_moba_milestone_g.mjs", shape: /30\/30 通過/, note: "G" },
  { id: "milestone_f", script: "tools/check_moba_milestone_f.mjs", shape: /30\/30 通過/, note: "F" },
  { id: "milestone_e", script: "tools/check_moba_milestone_e.mjs", shape: /49\/49 通過/, note: "E" },
  { id: "tactic24", script: "tools/check_moba_tactic24.mjs", shape: /29\/29 通過/, note: "S24 戰術" },
  { id: "cs23", script: "tools/check_cs23.mjs", shape: /28\/28 通過/, note: "S23 CS 流程" },
  { id: "cs_match_completion", script: "tools/check_cs_match_completion.mjs", shape: /CS MR12 completion: 36\/36 PASS/, note: "CS MR12／halftime／OT／Quick Finish completion regression" },
  { id: "cs_measure_r1", script: "tools/check_cs_measurement_r1.mjs", shape: /CS Measurement R1: PASS/, note: "CS gameplay 決定性量測 pilot" },
  { id: "cs_instrument_r2", script: "tools/check_cs_instrumentation_r2.mjs", shape: /CS Instrumentation R2: PASS/, note: "CS combat opportunity→conversion 旁路量測" },
  { id: "cs_stat_wiring_r3", script: "tools/check_cs_stat_wiring_r3.mjs", shape: /CS Stat Wiring R3: PASS/, note: "CS 16 項素質 paired wiring measurement" },
  { id: "cs_clutch_r4", script: "tools/check_cs_clutch_instrumentation_r4.mjs", shape: /CS True Clutch R4: PASS/, note: "CS lastAlive／1vN opportunity→round conversion" },
  { id: "cs_retreat_r5", script: "tools/check_cs_retreat_instrumentation_r5.mjs", shape: /CS Retreat R5: PASS/, note: "CS retreat opportunity→displacement→re-engage" },
  { id: "cs_defuse_r6", script: "tools/check_cs_defuse_instrumentation_r6.mjs", shape: /CS Defuse R6: PASS/, note: "CS defuse opportunity→progress→round conversion" },
  { id: "cs_result_metrics_r8", script: "tools/check_cs_result_metrics_r8.mjs", shape: /CS Result Metrics R8(?: Legacy Evidence)?: PASS/, note: "CS ADR overkill／result metrics migration" },
  { id: "cs_determinism_migration_r10", script: "tools/check_cs_determinism_migration_r10.mjs", shape: /CS Determinism Migration R10: PASS/, note: "CS defuse stale-state determinism migration" },
  { id: "cs_bomb_result_semantics_r11", script: "tools/check_cs_bomb_result_semantics_r11.mjs", shape: /CS Bomb Result Semantics R11: PASS/, note: "CS bomb round-end result semantics" },
  { id: "cs_flash_attribution_r12", script: "tools/check_cs_flash_attribution_r12.mjs", shape: /CS Flash Attribution R12: PASS/, note: "CS flash source attribution／same-roll counterfactual" },
  { id: "cs_player_smoke_los_r13", script: "tools/check_cs_player_smoke_los_r13.mjs", shape: /CS Player Smoke LOS R13: PASS/, note: "CS player-smoke LOS causal migration／lifetime attribution" },
  { id: "cs_he_gameplay_r14", script: "tools/check_cs_he_gameplay_r14.mjs", shape: /CS HE Gameplay R14: PASS/, note: "CS deterministic HE damage／utilDmg causal migration" },
  { id: "cs_molly_gameplay_r15", script: "tools/check_cs_molly_gameplay_r15.mjs", shape: /CS Molly Gameplay R15: PASS/, note: "CS player-molly deterministic DoT／utilDmg causal migration" },
  { id: "cs_calibration_readiness_r17", script: "tools/check_cs_calibration_readiness_r17.mjs", shape: /CS 16-Stat Calibration Readiness Audit R17: PASS/, note: "CS 16-stat calibration readiness gate" },
  { id: "cs_positioning_measurement_r20", script: "tools/check_cs_positioning_measurement_r20.mjs", shape: /CS Positioning Measurement Completion R20: PASS/, note: "CS positioning read-chain／retreat measurement" },
  { id: "cs_apm_measurement_r21", script: "tools/check_cs_apm_measurement_r21.mjs", shape: /CS APM Measurement \/ Calibration Readiness R21: PASS/, note: "CS APM read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_local_causal_framework_r22", script: "tools/check_cs_local_causal_framework_r22.mjs", shape: /CS Local Causal Calibration Framework R22: PASS/, note: "CS local causal calibration measurement layers／readiness gate" },
  { id: "cs_courage_measurement_r23", script: "tools/check_cs_courage_measurement_r23.mjs", shape: /CS Courage Measurement \/ Calibration Readiness R23: PASS/, note: "CS Courage read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_accuracy_measurement_r24", script: "tools/check_cs_accuracy_measurement_r24.mjs", shape: /CS Accuracy Measurement \/ Calibration Readiness R24: PASS/, note: "CS Accuracy read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_accuracy_semantics_r25", script: "tools/check_cs_accuracy_semantics_r25.mjs", shape: /CS Accuracy Semantic Audit \/ Minimal Correction R25: PASS/, note: "CS Accuracy product semantics／minimal raw-effective headshot correction" },
  { id: "cs_decision_measurement_r26", script: "tools/check_cs_decision_measurement_r26.mjs", shape: /CS Decision Measurement \/ Calibration Readiness R26: PASS/, note: "CS Decision read-chain／deterministic calibration-readiness measurement" },
  { id: "cs_decision_semantics_r27", script: "tools/check_cs_decision_semantics_r27.mjs", shape: /CS Decision Semantic Audit \/ Minimal Correction R27: PASS/, note: "CS Decision product semantics／minimal raw-effective defuse correction" },
  { id: "cs_focus_measurement_r28", script: "tools/check_cs_focus_measurement_r28.mjs", shape: /CS Focus Measurement \/ Calibration Readiness R28: PASS/, note: "CS Focus read-chain／deterministic calibration-readiness measurement" },
  //  ⚠ 下面五支在 flat 模式下的分母會變小（巢狀子驗證改由本 runner 各跑一次）。
  //    這裡填的是**該支自己健康時的完整數字**，不是遷就現況——所以
  //    experience26（§17 replay 容量，TD-19）與 runtime29（§29 順序公平性，TD-21）
  //    會如實回報 FAIL。**沒有放寬任何門檻。**
  { id: "progress25", script: "tools/check_progress25.mjs", shape: /33\/33 通過/, note: "S25 結算（flat：1 段委派）" },
  { id: "experience26", script: "tools/check_moba_experience26.mjs", shape: /29\/29 通過/, note: "S26 體驗（flat：6 段委派；§17 replay 容量既有紅燈 TD-19）" },
  { id: "talent27", script: "tools/check_talent27.mjs", shape: /37\/37 通過/, note: "S27 天賦（flat：7 段委派）" },
  { id: "stats28", script: "tools/check_moba_stats28.mjs", shape: /21\/21 通過/, note: "S28 選手能力（flat：8 段委派）" },
  //  P 系列：選手成長 → MOBA 戰鬥品質。三支都是純邏輯、秒級。
  { id: "growth_p0", script: "tools/check_growth_loop_p0.mjs", shape: /25\/25 通過/, note: "P0 等級→能力成長" },
  { id: "ability_p02", script: "tools/check_moba_ability_p02.mjs", shape: /20\/20 通過/, note: "P0-2 能力→本場經驗速率" },
  { id: "quality_p03", script: "tools/check_moba_quality_p03.mjs", shape: /53\/53 通過/, note: "P0-3 能力→戰鬥品質（A/B 雙方皆真實能力）" },
  { id: "growth_ui_p1", script: "tools/check_growth_ui_p1.mjs", shape: /80\/80 通過/, note: "P1 成長可視化＋Training v1.1（含 UI 未定義識別字掃描）" },
  { id: "regress", script: "tools/regress.mjs", shape: /結束率 15\/15/, note: "回歸：15 seeds" },
  { id: "regress2", script: "tools/regress2.mjs", shape: /節奏門檻 8\/8 通過/, note: "節奏門檻" },
  { id: "runtime29", script: "tools/check_moba_runtime29.mjs", shape: /35\/35 通過/, note: "S29 執行期（flat：9 段委派；§29 順序公平性既有紅燈 TD-21）" },
  { id: "q4_history", script: "tools/check_competition_q4.mjs", shape: /68\/68 通過/, note: "Q4 FinalStandings / award historical gate" },
  { id: "q5_history", script: "tools/check_competition_q5.mjs", shape: /66\/66 通過/, note: "Q5 cross-season history gate" },
  { id: "q6_playoffs", script: "tools/check_competition_q6.mjs", shape: /57\/57 通過/, note: "Q6 stage/playoff historical gate" },
  { id: "q7a_safety", script: "tools/check_q7a_safety.mjs", shape: /18\/18/, note: "Q7a single live session / same-day fixture safety" },
  { id: "q7b_season_state_v2", script: "tools/check_season_state_v2_migration_q7b.mjs", shape: /SeasonState v2 Q7b: 35\/35 PASS/, note: "Q7b/3b-M1 SeasonState.v2 migration-safe foundation" },
  { id: "m2_season_state_v2_sealing", script: "tools/check_season_state_v2_sealing_m2.mjs", shape: /SeasonState v2 M2 sealing: 24\/24 PASS/, note: "3b-M2 Event / Season sealing boundaries" },
  { id: "hero_skills_round2", script: "tools/check_hero_skills_round2.mjs", shape: /Hero Skills Round 2: PASS 17\/17/, note: "Elemental choreography / pose / mirror" },
  { id: "hero_skills_phase1", script: "tools/check_hero_skills_phase1.mjs", shape: /Hero Skills Phase 1: PASS 10\/10/, note: "Hero skill contract / replacement boundary" },
  { id: "hero_presentation_l", script: "tools/check_hero_presentation_l.mjs", shape: /✅ PASS/, note: "Historical presentation compatibility" },
  { id: "pacing29b1", script: "tools/check_moba_pacing29b1.mjs", shape: /\d+\/\d+ 通過/, note: "Pacing gate" },
  { id: "presentation29b2", script: "tools/check_moba_presentation29b2.mjs", shape: /\d+\/\d+ 通過/, note: "Presentation and replay gate" },
  { id: "controls29b3", script: "tools/check_moba_controls29b3.mjs", shape: /\d+\/\d+ 通過/, note: "Controls and replay gate" },
  { id: "fairness_p0a", script: "tools/check_moba_side_relative_p0a.mjs", shape: /8 PASS \/ 0 FAIL/, note: "P0-A invariant" },
  { id: "fairness_p0b", script: "tools/check_moba_navigation_mirror_p0b.mjs", shape: /14 PASS \/ 0 FAIL/, note: "P0-B invariant" },
  { id: "fairness_p0c", script: "tools/check_moba_tail_p0c_invariant.mjs", shape: /PASS/, note: "P0-C invariant" },
  { id: "fairness_p0d", script: "tools/check_moba_nexus_wave_p0d.mjs", args: ["--out=tmp/hero-skills/seed608.json"], shape: /"pass": true/, note: "P0-D seed608" },
  { id: "simulation_version", script: "tools/check_simulation_version_gate.mjs", shape: /PASS|通過/, note: "Simulation fingerprint" },
  { id: "build", script: "node_modules/vite/bin/vite.js", args: ["build"], shape: /built in/, note: "production build" },
];

const argv = process.argv.slice(2);
// 查用法或拼錯參數不可默默展開全部長驗證／資料產出。
if (argv.includes('--help')) {
  console.log('用法：node tools/verify.mjs [--list] [--only=<id,...>] [--resume] [--timeout=<ms>]');
  process.exit(0);
}
const unsupported = argv.filter(arg => !['--list','--resume'].includes(arg) && !/^--(only|timeout)=.+$/.test(arg));
if (unsupported.length) {
  console.error(`不支援的參數：${unsupported.join(', ')}。請用 --help 查看用法；未啟動驗證。`);
  process.exit(2);
}
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const loadState = () => {
  if (!existsSync(STATE)) return { runs: {} };
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return { runs: {} }; }
};
const saveState = (s) => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2), "utf8");
};

if (flag("list")) {
  const st = loadState();
  console.log("區段清單（--only=<id>[,<id>...] 可指定單段或多段）\n");
  for (const s of SEGMENTS) {
    const r = st.runs?.[s.id];
    const mark = !r ? "  未執行" : r.status === "PASS" ? "✅ PASS " : r.status === "SKIP" ? "⏭ SKIP " : "❌ FAIL ";
    const when = r?.finishedAt ? `　${r.finishedAt.slice(0, 19).replace("T", " ")}　${(r.ms / 1000).toFixed(0)}s` : "";
    console.log(`${mark} ${s.id.padEnd(20)} ${s.note}${when}`);
  }
  console.log(`\n狀態檔：${STATE}`);
  process.exit(0);
}

const only = val("only");
const wanted = only ? only.split(",").map((x) => x.trim()).filter(Boolean) : null;
if (wanted) {
  const unknown = wanted.filter((w) => !SEGMENTS.some((s) => s.id === w));
  if (unknown.length) {
    console.error(`❌ 未知區段：${unknown.join(", ")}\n   可用區段：${SEGMENTS.map((s) => s.id).join(", ")}`);
    process.exit(2);
  }
}

const state = loadState();
const resume = flag("resume");
const timeoutMs = Number(val("timeout") ?? 0) || 45 * 60 * 1000;

let queue = SEGMENTS.filter((s) => !wanted || wanted.includes(s.id));
if (resume) {
  const before = queue.length;
  queue = queue.filter((s) => state.runs?.[s.id]?.status !== "PASS");
  console.log(`--resume：略過 ${before - queue.length} 個已通過的區段\n`);
}

if (!queue.length) {
  console.log("沒有需要執行的區段（--resume 之下代表全部已通過）。");
  process.exit(0);
}

/** 跑一個區段；回傳結果物件。子行程帶 ESMO_VERIFY_FLAT=1 以避免巢狀重跑。 */
function runSegment(seg) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, [resolve(ROOT, seg.script), ...(seg.args ?? [])], {
      cwd: ROOT,
      env: { ...process.env, ESMO_VERIFY_FLAT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      const killed = signal === "SIGKILL";
      const ok = code === 0 && seg.shape.test(out);
      // AGENTS requires full stdout + stderr, not only the six-line checkpoint tail.
      const logDir = resolve(ROOT, 'tmp/verify-logs');
      mkdirSync(logDir, { recursive: true });
      writeFileSync(resolve(logDir, `${seg.id}.log`), `${out}\n--- STDERR ---\n${err}`, 'utf8');
      done({
        id: seg.id,
        status: killed ? "TIMEOUT" : ok ? "PASS" : "FAIL",
        exitCode: code, signal: signal ?? null, ms,
        finishedAt: new Date().toISOString(),
        //  留下輸出尾巴：失敗時要看得出是斷言紅了還是被砍了
        tail: (out + err).split("\n").filter(Boolean).slice(-6).join("\n"),
      });
    });
  });
}

console.log(`執行 ${queue.length} 個區段（逾時 ${(timeoutMs / 60000).toFixed(0)} 分／段）\n`);
const results = [];
for (const seg of queue) {
  process.stdout.write(`▶ ${seg.id.padEnd(20)} ${seg.note} … `);
  const r = await runSegment(seg);
  results.push(r);
  state.runs[seg.id] = r;
  saveState(state);                 // 每段跑完就寫，中斷也不會丟掉已完成的部分
  const mark = r.status === "PASS" ? "✅" : r.status === "TIMEOUT" ? "⏱" : "❌";
  console.log(`${mark} ${r.status}　${(r.ms / 1000).toFixed(0)}s`);
  if (r.status !== "PASS") console.log(r.tail.split("\n").map((l) => `      ${l}`).join("\n"));
}

// ── 彙整 ────────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL");
const timedOut = results.filter((r) => r.status === "TIMEOUT");
console.log(`\n${"═".repeat(64)}`);
console.log(`本次：${pass}/${results.length} 通過` +
  (failed.length ? `　❌ 失敗 ${failed.length}（${failed.map((r) => r.id).join(", ")}）` : "") +
  (timedOut.length ? `　⏱ 逾時 ${timedOut.length}（${timedOut.map((r) => r.id).join(", ")}）` : ""));

//  全域狀態：把沒跑過的區段也算進來，避免「只跑兩段全綠」被讀成「全部通過」
const notRun = SEGMENTS.filter((s) => !state.runs?.[s.id]);
const globalPass = SEGMENTS.filter((s) => state.runs?.[s.id]?.status === "PASS").length;
console.log(`累計：${globalPass}/${SEGMENTS.length} 區段通過` +
  (notRun.length ? `　（尚未執行 ${notRun.length}：${notRun.map((s) => s.id).join(", ")}）` : ""));
console.log(`狀態檔：${STATE}　（--resume 續跑、--list 查看）`);

//  ⚠ 不允許把「沒跑完」粉飾成通過
if (failed.length) process.exit(1);
if (timedOut.length) process.exit(2);
if (!wanted && notRun.length) {
  console.log(`\n⚠ 仍有 ${notRun.length} 個區段沒有結果 ⇒ 不得宣稱全綠`);
  process.exit(2);
}
process.exit(0);
