// ============================================================================
//  battle/moba/tactics/tacticExecV24.js — TacticalExecution.v1（moba-sim.v24 候選，tacticExec "adaptive.v1"，v24 Sprint 1）
//
//  Owner 2026-11-15 核准的 Sprint 1 範圍（不多做）：
//   · 動態入侵評估（整場、不擲骰）＋ go／declined:<原因> 原因碼
//   · 目標選擇：先確認情報可信度、營地價值、可達性、安全撤退，再從合格目標中選最近的（Buff 也要過門檻）
//   · 冷卻（只有真正開始執行才算）＋任務仲裁（物件窗、物件意圖、物件即將重生、隊員忙碌）
//   · 1～2 人編隊；敵方合理可知資訊下的回防觸發；任務鎖定、放棄與撤退原因紀錄
//  不做：3～4 人護送、完整隊友救援、Gank Q1／Q2、taskCommitPush（各自另案）。
//
//  原則：決定性（不讀 rng、固定的迭代順序）；新的評估只讀「看得見＋記憶＋公開資訊」（設計 §4），
//  敵方英雄位置一律經 knownFoe()／seen()；不新增 16 項素質係數；層不存在 ⇒ LogicEngine 不呼叫這裡任何函式。
//  執行沿用既有的入侵生命週期（_invadeStepV2 打野、失敗條件 hp／outnumbered／lost_race／stolen）；
//  這裡只決定「要不要出發、去哪、帶誰」，以及隊友與回防者每 tick 的移動目標。
// ============================================================================
import { INVASION_POINT } from "../../../gameData.js";
import { findPath, HERO_RADIUS } from "../nav/mobaNavigation.js";

export const TACTIC_EXEC_CONTRACT = "TacticalExecution.v1";
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const otherSide = (s) => (s === "blue" ? "red" : "blue");
const ENEMY_BITS = ["top", "jungle", "mid", "adc", "sup"];   // bit0＝top（與影子研究相同）
const bitOf = (role) => { const i = ENEMY_BITS.indexOf(role); return i < 0 ? 0 : 1 << i; };
const typeOf = (c) => (c.type === "buff" ? "buff" : "camp");
const popcount = (m) => { let c = 0; m >>>= 0; while (m) { c += m & 1; m >>>= 1; } return c; };

/** 參數（全部是常數；改任何一格＝改對局 ⇒ 同版號重新登記指紋）。 */
export const TACTIC_EXEC_V24 = Object.freeze({
  evalEvery: 5,               // 入侵評估週期（秒）
  defendEvery: 1,             // 回防觸發檢查週期（秒）
  detour: 1.17,               // 到場時間＝直線 × detour ÷ 移速（Sprint 0 量的路徑比）
  seenR: 16,                  // 與 _seenV20 相同的視野半徑（營地狀態的可見判定也用它）
  threatR: 14, approachMin: 4, approachLookback: 2, approachNearEta: 15,
  ejNearEta: 15, ejMemFresh: 10,
  introPriorSec: 150,         // 從沒看過的敵方營地：開局這麼多秒內相信它照時間表出生；之後要有視野或記憶才算可信
  memoryFreshSec: 10,         // 已知敵人「最近看過」的期限（威脅的可到場項）
  candidateRoles: ["jungle", "mid", "sup", "top"],   // ADC 不參加
  value: { buff: 1.0, camp: 0.67 },                   // 收益：Buff＝90 金＋增益；一般營 60 金 ⇒ 60/90
  clearSec: { buff: 12, camp: 8 },                    // 清營估計秒數（× 剩餘血量比例）
  exitPad: 6,                 // 營地離敵塔危險圓（射程＋towerSafePad）不到 exitPad ⇒ 撤退路線不安全
  windowPad: 30, windowMax: 70,   // 入侵窗＝打野到場時間＋windowPad，上限 windowMax
  objHorizonPad: 20,          // 物件即將重生的判定窗：到場時間＋清營＋這麼多秒
  objIntentMargin: 0.1,       // 物件評估分數 ≥ 開窗門檻 − 這個值 ⇒ 隊伍有意圖打物件
  objJoinMin: 0.5,            // 物件即將重生時，參團旋鈕 ≥ 這個值才算「要去搶」
  partnerHp: 0.4, partnerStand: 3,
  laneEmergencyR: 8,
  defend: { window: 20, clearSec: 4, hpMin: 0.5, abortHp: 0.4, etaMax: 18, cooldown: 30, invaderR: 22, size: 2 },
  //  威脅模型（Sprint 0.5 暫定版＝"s05"）。Owner：回防引入後必須重新校準，不得沿用舊模型直接宣稱通過。
  //  "s05reach" 另外加上「最近看過、而且在 approachNearEta 秒內到得了」的敵人（回防者）。兩個預測都寫進紀錄，校準只看紀錄、不必重跑。
  threatModel: "s05",
  postures: Object.freeze({
    //  Owner 決策 2：保守型允許 1～2 人安全試探，不要求人數優勢；保持高風險門檻（打野血量、距離、看得見的敵人一律不去）。
    //  abortHp＝中止門檻（入侵中血量低於它就放棄）：保守早、全力晚。必須明顯低於出發門檻 jHpMin，否則挨一下就中止。
    conservative: { jHpMin: 0.8, memberHpMin: 0.7, etaMax: 14, marginMin: 0, sizeMin: 1, sizeMax: 2, laneCostMax: 0, partyEtaSlack: 6, cooldown: 180, rateMin: 0.040, noSeenThreat: true, abortHp: 0.5 },
    auto:         { jHpMin: 0.65, memberHpMin: 0.55, etaMax: 17, marginMin: 0, sizeMin: 1, sizeMax: 2, laneCostMax: 0, partyEtaSlack: 6, cooldown: 120, rateMin: 0.033, abortHp: 0.4 },
    aggressive:   { jHpMin: 0.5, memberHpMin: 0.5, etaMax: 22.5, marginMin: 0, sizeMin: 2, sizeMax: 2, laneCostMax: 1, partyEtaSlack: 6, cooldown: 90, rateMin: 0.028, abortHp: 0.32 },
    allin:        { jHpMin: 0.4, memberHpMin: 0.4, etaMax: 28, marginMin: -1, sizeMin: 2, sizeMax: 2, laneCostMax: 2, partyEtaSlack: 8, cooldown: 120, rateMin: 0.025, abortHp: 0.25 },
  }),
});
const C = TACTIC_EXEC_V24;

/**
 *  Sprint 1.1（tacticExec "adaptive.v1.1"，Owner 2026-11-17 核准）的追加參數。adaptive.v1 不讀這裡任何一格（Sprint 1 原樣重現）。
 *  根因（Sprint 1 驗證資料，已用過的 Seeds 99301–99559，只做診斷）：92% 的出發是「預估 1 名敵人（敵方打野先驗）＋單人＋敵方 Buff」，
 *  到場率 17.5%；一般營 83%。中止多在血量 0.4、一般撤退接手、被圍 ⇒ 打野半血回家、自家營少清 1.9 座，敵方營幾乎沒多拿（+0.03）。
 */
export const TACTIC_EXEC_V24_1 = Object.freeze({
  partyEtaSlack: 3,           // 隊友的實際尋路到場時間最多比帶隊者晚這麼多秒（v1 是直線估計＋6 秒）
  regroupLagSec: 1,           // 到場前隊友落後超過這麼多秒 ⇒ 帶隊者原地等（等到落後 ≤ regroupResumeSec 才繼續）；兩人一起到，帶隊者不先單獨撞上對方
  regroupResumeSec: 0.5,
  regroupMaxSec: 4,           // 累計等超過這麼久 ⇒ 用當下資訊重評：單人條件成立 ⇒ 放隊友回去、單人繼續（partner_released）；否則 partner_lag 撤退
  campEtaExtra: 5,            // 一般營的到場時間上限＝傾向的 etaMax ＋ 這麼多秒（一般營成功率高；往返成本另由 econ11 把關）
  priorAnyTimeTypes: ["camp"],   // 從沒看過的一般營：任何時間都依公開的首次出生時間當作活著（Sprint 1 一般營目標到場時還活著 52/54；對方打野平常只清得到理論上限的約 2 成）。Buff 仍要 introPriorSec 內或有情報
  soloPriorTypes: ["camp"],   // 只有「敵方打野先驗」這一項威脅時，單人只去一般營（Buff 是敵方打野的預設位置，Sprint 1 單人 Buff 到場率 17.5%）
  memberHpMin: 0.7,           // 隊友出發血量（v1 是傾向的 memberHpMin 0.5～0.7）：低於這個值的線上英雄常在半路被一般撤退接手
  contactR: 7,                // 看得見的敵人離帶隊者這麼近 ⇒ 算已接觸（不論是否在營地旁）
  approachR: 28,              // 逼近只算在營地這麼近以內的敵人（線上走動的英雄不算）
  partnerWithR: 22,           // 隊友離帶隊者這麼近（約 4 秒路程）⇒ 動態撤退把他算在我方在場人數裡
  //  野區經濟（期望值，Owner 本輪第 3 項；單位＝營地價值 value，Buff 1、一般營 0.67）：
  //  期望收益＝價值 × 成功率（依目標類型與出發時的威脅情況）×（1＋denyShare）；
  //  機會成本＝lossPerSec × 自家營平均價值 × 往返秒數（到場＋清營＋回到最近的自家營地）。期望收益 < econK × 機會成本 ⇒ 這個目標不合格（own_farm）。
  //  兩個數字都在「已用過的」Seeds 上量，登記在這裡、不在新 Seeds 上調：
  //   · 成功率＝搶到營地的比例（Sprint 1 驗證資料，Seeds 99301–99559，2,561 次出發）：一般營 clear 6/7、prior 40/54＝0.74、contested 2/7；
  //     Buff clear 33/71＝0.46、prior 248/2296＝0.11、contested 25/110＝0.23（clear＝預估 0 名敵人；prior＝唯一的威脅是沒看見的敵方打野；contested＝其他）
  //   · lossPerSec＝打野清自家營的實際效率（v23 臂，Seeds 98401–98419：每邊在自家營旁 430 秒、清 7.42 座 ⇒ 0.0173 座／秒）。
  //     ⚠ 第一版用 Sprint 1 的實際損失 0.0218（含失敗入侵的血量與陣亡連鎖）⇒ 30 個用過的 Seeds 上每邊每場只出發 0.06 次，等於禁止入侵，所以改用時間本身的成本。
  //   · prior_early（開局 earlyPriorSec 秒內的 prior）：v1.1 第十版在用過的 Seeds 99301–99359 上量的，單人一般營 28/209＝0.13（對方打野這時在清自己的野區）；
  //     同一版開局後 300～900 秒單人一般營 53/74＝0.72（與 Sprint 1 的 0.74 一致，沿用 0.74）。Buff 沒有分開的資料，沿用 0.11。
  successP: Object.freeze({ camp: Object.freeze({ clear: 0.85, prior: 0.74, prior_early: 0.13, contested: 0.29 }), buff: Object.freeze({ clear: 0.46, prior: 0.11, prior_early: 0.11, contested: 0.23 }) }),
  earlyPriorSec: 300,
  //  successP2：2 人編隊的成功率（v1.1 第十一版，用過的 Seeds 99301–99359）：一般營 prior (101+27)/(297+72)＝0.35、clear (7+4+0)/(26+11+3)＝0.28
  //  （隊友實際到場只有 34%：途中被既有的撤退／回城／回線接手，或在塔邊等待）。其他格沒有 2 人資料，沿用單人值。
  //  2 人仍然優先：2 人的期望收益 ≥ 機會成本才 2 人出發；否則單人條件成立就單人，不成立就不出發（own_farm）。
  successP2: Object.freeze({ camp: Object.freeze({ clear: 0.28, prior: 0.35, prior_early: 0.13, contested: 0.29 }), buff: Object.freeze({ clear: 0.46, prior: 0.11, prior_early: 0.11, contested: 0.23 }) }),
  stuckSec: 6, stuckMin: 3,   // 到場前每 stuckSec 秒離營地沒有近 stuckMin 以上（等隊友的時間不算）⇒ stuck 撤退（塔邊進不去的營地）
  lossPerSec: 0.0173,
  //  denyShare：搶到的敵方營，對方本來會清到的比例（v23 臂，Sprint 1 驗證資料 780 個邊×場：每邊清自家營 10.73 座 ÷ 理論上限 31.6 座＝0.34）。
  //  ⚠ 第二、三版只算成功率（單位＝座數）⇒ 30 個用過的 Seeds 上每邊每場出發 0.17～0.24 次（一般營往返 44～52 秒，成本 0.76～0.9 座 > 0.74），Owner 2026-11-17 選方案 1：
  //    以經濟與安全為主、目標每邊每場約 1 次有價值的入侵，優先一般營、Buff 不永久封死 ⇒ 改成價值單位並計入拒絕收益。
  denyShare: 0.34,
  //  econK（選擇性）：期望收益至少是機會成本的 econK 倍才出發。Owner 2026-11-17 方案 1：目標每邊每場約 1 次有實際價值的入侵、不得幾乎禁止。
  //  用過的 Seeds 99301–99359（工具路徑 180 個邊×場）的取捨：1.0 ⇒ 每邊每場出發 2.69、營地 Δ−0.99；1.1 ⇒ 1.46、Δ−0.75；1.2 ⇒ 0.62、Δ−0.78；1.4 ⇒ 0.07（幾乎禁止，不採用）。
  //  取 1.1（最接近「約 1 次」且不是禁止）；之後不再調，獨立驗證在事先登記的新 Seeds 上做。
  econK: 1.1,
  postures: Object.freeze({
    //  needAdvantage：預估有敵人時，人數必須多於預估（auto）。Owner 決策 2：保守型不要求人數優勢（仍保留看得見的敵人一律不去）。
    //  contestedAbortHp：看得見敵人在場時的中止血量（比單純清營的 abortHp 高 ⇒ 及早撤離）。powK：敵方看得見的血量和 > 我方 × powK ⇒ 不利。
    conservative: { needAdvantage: false, contestedAbortHp: 0.65, powK: 0.8 },
    auto:         { needAdvantage: true, contestedAbortHp: 0.6, powK: 1.0 },
    aggressive:   { needAdvantage: false, contestedAbortHp: 0.5, powK: 1.25 },
    allin:        { needAdvantage: false, contestedAbortHp: 0.4, powK: 1.5 },
  }),
});
const C1 = TACTIC_EXEC_V24_1;

/**
 *  Sprint 1.2（tacticExec "adaptive.v1.2"，Owner 2026-11-18 核准）的追加參數。adaptive.v1／v1.1 不讀這裡任何一格（兩版都原樣重現）。
 *  根因（Sprint 1.1 驗證資料，Seeds 110001–110599 已用過，只做診斷）：
 *   · 自家營全清、往返期間也不重生 ⇒ v1.1 機會成本＝0 ⇒ 期望值 0.15 的 2 人 Buff 也出發（生涯 70 次，到時營地已被清 88～100%）
 *   · 生涯對方打野清營很勤（營地存活比例 0.43～0.47、重生後中位數 35 秒被清；工具路徑 0.81～0.97、68～172 秒）⇒ 「沒看過的一般營當作活著」在生涯落空
 *   · 積極／全力的 sizeMin 2 碰上 2 人成功率 0.35 ⇒ 期望值永遠不夠 ⇒ 每邊每場 0.03 次
 *   · 威脅模型 s05 把「沒看見的敵方打野」一律算 1 人 ⇒ 目標多半是一般營時高估（偏差 0.59）
 */
export const TACTIC_EXEC_V24_2 = Object.freeze({
  //  ① 時間價值：我方打野這場對局的實際產出（我方自家營被我方清掉的座數 ÷ 首次出生後經過的秒數；自己隊伍的資訊），加先驗 λ0 × T0。
  //     往返期間自家有營可打的那一段用 max(lossPerSec, λ)，沒有營可打的那一段用 λ（其他有效行動的機會成本）⇒ 不會歸零。
  //     λ0＝v23 臂每邊每場清自家營 10.95 座 ÷ 約 1,170 秒（Sprint 1.1 驗證資料，已用過）≈ 0.009；T0＝300 秒。
  lambda0: 0.009, lambdaT0: 300,
  //  ② 敵方營存活信念：我方每次「開始看見」一座我們以為活著的敵方營，記一筆它當下活或死（是我方自己清掉的不算）。
  //     依「最後一次確認活著（或公開重生時間）到現在」分 fresh（< freshSec）與 stale 兩格，各自用 Beta(α, β) 的平均當作到場時還活著的機率。
  //     先驗見 belPrior（在已用過的 Seeds 上選）。只用我方視野與公開的重生計時；不讀看不見的營地狀態。
  freshSec: 40,
  //  先驗＝兩條路徑合計的真實存活率（已用過的 Seeds 110001–110011、110201–110211，每 10 秒取樣、只在離線診斷讀真值）：
  //  fresh（< 40 秒）工具 0.99、生涯 0.85 ⇒ 0.9；stale 工具 0.87～0.97、生涯 0.38～0.41 ⇒ 0.65；權重 4（對局內觀測很快蓋過）。
  belPrior: Object.freeze({ fresh: Object.freeze([3.6, 0.4]), stale: Object.freeze([2.6, 1.4]) }),
  //  successP 是在工具路徑量的（那時營地到場時還活著：一般營 96.4%、Buff 88%）⇒ 換成「活著的前提下」的成功率＝successP ÷ aliveRef，再乘存活信念。
  aliveRef: Object.freeze({ camp: 0.964, buff: 0.88 }),
  //  ③ 傾向的人數下限（sizeMin）只在預估有敵人（威脅 ≥ 1）時要求；預估 0 人時與其他傾向同樣可以單人（安全條件不變）。
  //  ④ 威脅模型 "s12"：敵方打野「沒看見而且最後一次看見已超過 ejStaleSec 秒」才算 1 人；從沒看過、或 10～30 秒內看過 ⇒ 不算
  //     （看得見、或 10 秒內的記憶照 s05）。在已用過的 Seeds 上（1,640 筆）選的：偏差 0.41、誤差 0.52、涵蓋 0.85；只看 v1.1 臂 0.40／0.47／0.66。
  //     依目標類型分開量時一般營旁打野到場只有 3～11%，但整數預測加上涵蓋 ≥ 0.6 的限制下，最好的規則只取決於新鮮度（見 S12_PROGRESS.md）。
  ejStaleSec: 30,
  //  econK（v1.2）：期望收益（已乘存活信念、含時間價值成本）≥ econK × 成本。與 v1.1 同一條規則選（最接近「每邊每場約 1 次」、不是禁止）：
  //  已用過的 Seeds（工具 110001–110059 ×3 配置、生涯 110201–110219 ×3 素質）：1.0 ⇒ 工具 0.43／生涯 0.07；**0.9 ⇒ 1.12／0.20（合計 0.89）**；0.8 ⇒ 2.10／0.53。
  //  0.8 的 S2 較高（工具 0.87）但出發是目標的兩倍，而且是看到結果才知道 ⇒ 不改選，列入產品取捨。之後不再調。
  econK: 0.9,
});
const C2 = TACTIC_EXEC_V24_2;

/** 傾向：Sprint 1 由戰術書既有的入侵傾向決定（玩家自選傾向屬 Sprint 3）。 */
export function postureOf(knobs) {
  const ic = knobs?.invadeChance ?? 0;
  if (ic >= 0.7) return "auto";
  if (ic >= 0.3) return "conservative";
  return null;
}

const newObs = () => ({
  posture: null,
  evals: 0, go: 0, starts: 0, declined: {}, partySize: { 1: 0, 2: 0 }, targets: { buff: 0, camp: 0 },
  ends: {}, partnerEnds: {}, arrived: 0, steals: 0,
  defend: { checks: 0, triggers: 0, go: 0, declined: {}, starts: 0, defenders: 0, ends: {}, arrived: 0 },
});

/** configureMatch 時建立。 */
export function createTacticExecState(E) {
  const v13 = E._tacExecVariant === "adaptive.v1.3";
  const v12 = E._tacExecVariant === "adaptive.v1.2" || v13;
  const st = { log: [], hist: [], obs: { blue: newObs(), red: newObs() }, side: {}, v11: E._tacExecVariant === "adaptive.v1.1" || v12 };
  if (v12) st.v12 = true;
  if (v13) st.v13 = true;
  for (const S of ["blue", "red"]) {
    const K = E.director?.knobs(S) ?? null;
    const posture = postureOf(K);
    st.obs[S].posture = posture;
    st.side[S] = { posture, nextEval: 0, nextDefend: 0, cooldownUntil: -Infinity, defendCooldownUntil: -Infinity,
      foeMem: new Map(), campMem: new Map(), campDmg: new Map(), active: null };
    if (v12) {
      st.side[S].bel = new Map(); st.side[S].ownAlive = new Map(); st.side[S].ownClears = 0;
      st.side[S].belObs = { fresh: [...C2.belPrior.fresh], stale: [...C2.belPrior.stale] };
      st.obs[S].belief = { observed: 0, foundDead: 0 };
    }
  }
  return st;
}

/**
 * Sprint 1.3 終局護線（adaptive.v1.3）。只回答「這一隊現在該護送哪一路」；移動與清兵都走引擎既有的路徑。
 * 成立條件（每邊各自判定）：敵方主堡已經暴露（某一路的前線建築就是主堡），而且連續 stallSec 秒沒有任何己方兵線抵達主堡。
 * 成立後這一邊一直保持護線（兵線到主堡時回傳 null，照常打主堡）。沒成立 ⇒ 一律回傳 null ⇒ 對局逐 tick 不變。
 * stallSec 240＝8 波兵；開發 Seed 上的勝方最長等待 P99 是 210 秒（review/tactic-book-3a/v24_sprint1/S13_PROGRESS.md）。
 * 選路：已暴露的路裡，己方兵線走得最深的一路，每 laneHoldSec 秒才重選一次。同分時的檢查順序紅藍互為鏡像（藍：中上下；紅：中下上），不讀亂數。
 */
export const ENDGAME_V13 = Object.freeze({ stallSec: 240, laneHoldSec: 20, order: Object.freeze(["mid", "top", "bot"]), orderRed: Object.freeze(["mid", "bot", "top"]) });
const exposedLanes13 = (E, S) => (S === "blue" ? ENDGAME_V13.order : ENDGAME_V13.orderRed).filter((ln) => E.frontStructure(S, ln)?.lane === "nexus");
/** 每 tick、每邊：更新「主堡暴露後多久沒有兵線抵達」的計時。 */
export function endgameTick13(E, X) {
  if (!X?.v13) return;
  const eg = (X.eg ??= { blue: { since: null, on: false, onAt: null, lane: null, until: -Infinity }, red: { since: null, on: false, onAt: null, lane: null, until: -Infinity } });
  for (const S of ["blue", "red"]) {
    const g = eg[S];
    if (g.on) continue;
    if (g.since == null) { if (exposedLanes13(E, S).length) g.since = E.t; else continue; }
    if (E._hasWaveAtStructure(S, E.towers[`${otherSide(S)}_nexus`])) g.since = E.t;
    else if (E.t - g.since >= ENDGAME_V13.stallSec) { g.on = true; g.onAt = E.t; }
  }
}
export function endgameEscortLane(E, X, S) {
  const g = X?.eg?.[S];
  if (!g?.on || E._hasWaveAtStructure(S, E.towers[`${otherSide(S)}_nexus`])) return null;
  if (E.t >= g.until) {
    const key = S === "blue" ? "bm" : "rm", lanes = exposedLanes13(E, S);
    let best = lanes[0] ?? null, bestDepth = -1;
    for (const ln of lanes) {
      let d = -1;
      for (const m of E.lanes[ln][key]) if (m.hp > 0) d = Math.max(d, S === "blue" ? m.t : 1 - m.t);
      if (d > bestDepth) { bestDepth = d; best = ln; }
    }
    g.lane = best; g.until = E.t + ENDGAME_V13.laneHoldSec;
  }
  return g.lane;
}

const LOG_MAX = 4000;
function pushLog(X, rec) { if (X.log.length < LOG_MAX) X.log.push(rec); }
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

// ── 資訊：看得見＋記憶 ───────────────────────────────────────────────────────────
const seen = (E, S, q, alive) => E._seenV20(S, q, alive);
function campVisible(E, S, c, alive) { return alive.some((a) => a.side === S && dist(a.pos, c.pos) <= C.seenR); }
/** 我方相信這座敵方營地現在活著嗎？看得見 ⇒ 實際；否則用記憶＋公開的重生時間；從沒看過 ⇒ 首次出生之後就當作活著。 */
function believedCamp(E, X, S, c, alive) {
  if (campVisible(E, S, c, alive)) return { alive: c.alive, intel: "seen", hp: c.alive ? campHpFrac(c) : 0 };
  const m = X.side[S].campMem.get(c.id);
  if (m) return m.alive ? { alive: true, intel: "memory", hp: m.hp } : { alive: E.t >= m.respawnAt, intel: "memory", hp: 1 };
  return { alive: E.t >= (E.rules.campFirstSpawn ?? 30), intel: "prior", hp: 1 };
}
function campHpFrac(c) {
  if (Array.isArray(c.members) && c.members.length) {
    let hp = 0, mx = 0;
    for (const m of c.members) { mx += m.maxHp ?? 0; if (m.alive && m.hp > 0) hp += m.hp; }
    return mx > 0 ? hp / mx : 0;
  }
  return c.maxHp > 0 ? c.hp / c.maxHp : 0;
}

/** 每 tick：更新記憶（敵方英雄、敵方營地）與 2 秒內的位置歷史。只讀引擎狀態。 */
export function tacticExecObserve(E, X, alive) {
  X.hist.push({ t: E.t, pos: new Map(E.players.map((p) => [p.id, { x: p.pos.x, y: p.pos.y }])) });
  const keep = Math.round(C.approachLookback / 0.5) + 1;
  while (X.hist.length > keep) X.hist.shift();
  for (const S of ["blue", "red"]) {
    const sd = X.side[S];
    for (const q of alive) {
      if (q.side === S || !seen(E, S, q, alive)) continue;
      sd.foeMem.set(q.id, { pos: { x: q.pos.x, y: q.pos.y }, t: E.t, hp: q.hp / q.maxHp });
    }
    for (const c of E.neutrals?.camps ?? []) {
      if (c.side === S || !campVisible(E, S, c, alive)) continue;
      sd.campMem.set(c.id, { alive: c.alive, hp: c.alive ? campHpFrac(c) : 0, respawnAt: c.alive ? -Infinity : (c.respawnAt ?? E.t + (c.respawn ?? 90)), t: E.t });
    }
    if (X.v12) observeBelief12(E, X, S, alive);
  }
}

/**
 * Sprint 1.2 敵方營存活信念與我方時間價值（每 tick、每邊）。只讀：我方自家營（自己隊伍的資訊）、我方看得見的敵方營、公開的重生計時。
 *  · 自家營由活轉死而且是我方清的 ⇒ ownClears＋1（時間價值 λ 的分子）
 *  · 敵方營：B.since＝我們相信它從何時起一直活著（從沒看過 ⇒ 首次出生時間；看見活著 ⇒ 現在；看見死了 ⇒ 改記 B.until＝公開的重生時間，到時改成 since）
 *  · 一段「開始看見」而我們以為它活著 ⇒ 一筆觀測：活 ⇒ α＋1，死（不是我方清的）⇒ β＋1；依 now − since 分 fresh／stale
 */
function observeBelief12(E, X, S, alive) {
  const sd = X.side[S], O = X.obs[S].belief, first = E.rules.campFirstSpawn ?? 30;
  for (const c of E.neutrals?.camps ?? []) {
    if (c.side === S) {
      const was = sd.ownAlive.get(c.id) ?? false;
      if (was && !c.alive && c.killerTeam === S) sd.ownClears++;
      sd.ownAlive.set(c.id, !!c.alive);
      continue;
    }
    const B = sd.bel.get(c.id) ?? { since: first, until: null, vis: false };
    const vis = campVisible(E, S, c, alive);
    if (B.since == null && B.until != null && E.t >= B.until) { B.since = B.until; B.until = null; }
    if (vis && !B.vis && B.since != null && E.t >= B.since && !(!c.alive && c.killerTeam === S)) {
      const k = E.t - B.since < C2.freshSec ? "fresh" : "stale";
      sd.belObs[k][c.alive ? 0 : 1]++;
      O.observed++; if (!c.alive) O.foundDead++;
    }
    if (vis) {
      if (c.alive) { B.since = E.t; B.until = null; }
      else { B.since = null; B.until = c.respawnAt ?? E.t + (c.respawn ?? 90); }
    }
    B.vis = vis;
    sd.bel.set(c.id, B);
  }
}
/** 到場時（現在＋eta）這座敵方營還活著的信念。 */
function pAlive12(E, X, S, c, eta) {
  const sd = X.side[S], B = sd.bel.get(c.id) ?? { since: E.rules.campFirstSpawn ?? 30, until: null };
  const since = B.since ?? B.until;
  if (since == null) return 0;
  const k = E.t + eta - since < C2.freshSec ? "fresh" : "stale";
  const [a, b] = sd.belObs[k];
  return a / (a + b);
}
/** 我方打野的時間價值（座／秒）：我方清自家營的實際速度＋先驗。 */
function lambdaTime12(E, X, S) {
  const sd = X.side[S], el = Math.max(0, E.t - (E.rules.campFirstSpawn ?? 30));
  return (sd.ownClears + C2.lambda0 * C2.lambdaT0) / (el + C2.lambdaT0);
}
function posAgo(X, id, t) {
  const want = t - C.approachLookback;
  for (const s of X.hist) if (Math.abs(s.t - want) < 1e-6) return s.pos.get(id) ?? null;
  return null;
}

// ── 忙碌判定（任務仲裁：只有「沒在做更重要的事」的人才能出發）────────────────────────
const BUSY_STATES = new Set(["團戰!", "支援", "圍攻", "追擊", "避塔", "脫戰", "抓人", "強開", "換血", "消耗", "拉扯", "接戰", "回城", "回城中", "撤退"]);
const BUSY_FSM = new Set(["OBJECTIVE", "CHASE", "ENGAGE", "RETREAT", "RECALL", "RETURN", "RESPAWN"]);
export function busyReason(E, p) {
  if (p.dead) return "dead";
  if (p.retreating) return "retreat";
  if ((p.recallT ?? 0) > 0) return "recall";
  if (p._invV2 && !p._invV2.done) return "invading";
  if (p._tacPartnerV24 || p._defV24) return "executing";
  if (BUSY_FSM.has(p.fsm)) return `fsm:${p.fsm}`;
  if (BUSY_STATES.has(p.state)) return `state:${p.state}`;
  if (p.role === "jungle") { const T = E._tac?.[p.side]; if (T && E.t < (T.gankUntil ?? 0)) return "gank"; }
  if (p.role === "sup") { const T = E._tac?.[p.side]; if (T && E.t < (T.roamUntil ?? 0)) return "roam"; }
  return null;
}

// ── 物件仲裁（Owner 修訂：不是「物件活著就禁止」，而是看時間窗、隊伍意圖與實際競爭）────────────
function objectiveBlock(E, S, horizon) {
  const R = E.rules, F = E.fsm3?.[S];
  if (!E.neutrals || !F) return null;
  if (F.objGo) return "objective_window";
  const K = E.director?.knobs(S) ?? null;
  //  ① 隊伍對活著的物件有意圖（沿用引擎既有的物件評估分數：人數、血量、離坑距離、看得見的敵人、是否已有人在打）
  if (R.objectiveEvalV20 && (E.neutrals.dragon?.alive || E.neutrals.baron?.alive)) {
    const ev = E._objectiveEvalV20(S);
    if (ev && ev.v >= (R.objEvalOpenAt ?? 0.75) - C.objIntentMargin) return "objective_intent";
  }
  //  ② 物件會在這趟入侵的時間窗內重生，而且隊伍會想去搶（參團旋鈕）
  for (const k of ["dragon", "baron"]) {
    const n = E.neutrals[k];
    if (!n || n.alive || !Number.isFinite(n.respawnAt)) continue;
    const join = K ? (k === "baron" ? K.baronJoin : K.dragonJoin) : 0.6;
    if (n.respawnAt - E.t <= horizon && join >= C.objJoinMin) return "objective_soon";
  }
  return null;
}

// ── 入侵評估 ─────────────────────────────────────────────────────────────────────
function laneCostOf(E, S, hh) {
  if (hh.role === "jungle" || !E.lanes?.[hh.lane]) return 0;
  const foe = otherSide(S);
  const tw = E.frontTower(foe, hh.lane);
  const mins = E.lanes[hh.lane][S === "blue" ? "rm" : "bm"] ?? [];
  return tw && mins.some((m) => m.hp > 0 && dist(E._minionPos(hh.lane, m), tw.pos) <= 18) ? 1 : 0;
}
/** 可達性：用既有 A*（findPath）求一條避開敵塔危險圓（射程＋towerSafePad）的路；起點或終點所在的圓不放進禁區。走不到 ⇒ null。 */
function routeLength(E, S, from, to) {
  const pad = E.rules.towerSafePad ?? 2.5, disks = [];
  for (const tw of Object.values(E.towers)) {
    if (tw.side === S || tw.hp <= 0) continue;
    const r = E.towerRange(tw) + pad;
    if (dist(from, tw.pos) < r || dist(to, tw.pos) < r) continue;
    disks.push({ x: tw.pos.x, y: tw.pos.y, r });
  }
  const path = findPath(from, to, HERO_RADIUS, E._aliveStructs, disks);
  if (!path || !path.length) return null;
  let len = 0, a = from;
  for (const q of path) { len += dist(a, q); a = q; }
  return len;
}
function exitSafe(E, S, c) {
  const pad = E.rules.towerSafePad ?? 2.5;
  for (const tw of Object.values(E.towers)) {
    if (tw.side === S || tw.hp <= 0) continue;
    if (dist(tw.pos, c.pos) < E.towerRange(tw) + pad + C.exitPad) return false;
  }
  return true;
}
/** 威脅：s05＝（看得見的在場＋逼近且 15 秒內到得了，不含敵方打野）＋敵方打野先驗；reach＝另加最近看過、15 秒內到得了的其他敵人。 */
function threatOf(E, X, S, target, alive, eta) {
  const foe = otherSide(S);
  let nowOrAppr = 0, reach = 0;
  for (const q of E.players) {
    if (q.side !== foe || q.dead) continue;
    const bit = bitOf(q.role);
    if (seen(E, S, q, alive)) {
      const dNow = dist(q.pos, target.pos);
      if (dNow <= C.threatR) { nowOrAppr |= bit; continue; }
      const old = posAgo(X, q.id, E.t);
      if (old && dNow <= dist(old, target.pos) - C.approachMin && eta(q.pos) <= C.approachNearEta) nowOrAppr |= bit;
      else if (eta(q.pos) <= C.approachNearEta) reach |= bit;
    } else {
      const m = X.side[S].foeMem.get(q.id);
      if (m && E.t - m.t <= C.memoryFreshSec && Math.max(0, eta(m.pos) - (E.t - m.t)) <= C.approachNearEta) reach |= bit;
    }
  }
  const JG = bitOf("jungle");
  //  敵方打野先驗：沒有反證就當作在他自己的野區
  const ej = E.players.find((q) => q.side === foe && q.role === "jungle");
  let ejBit = 0, ejKind = "none", ejBit12 = 0, ejAge = -1;
  if (ej && !ej.dead) {
    if (seen(E, S, ej, alive)) { ejBit = eta(ej.pos) <= C.ejNearEta ? JG : 0; ejKind = "seen"; ejBit12 = ejBit; ejAge = 0; }
    else {
      const m = X.side[S].foeMem.get(ej.id);
      const fresh = !!m && E.t - m.t <= C.ejMemFresh;
      ejBit = fresh && eta(m.pos) - (E.t - m.t) > C.ejNearEta ? 0 : JG;
      ejKind = fresh ? "memory" : "prior";
      ejAge = m ? E.t - m.t : -1;
      //  s12（Sprint 1.2）：10 秒內的記憶照 s05；更舊的記憶只有超過 ejStaleSec 才算；從沒看過不算
      ejBit12 = fresh ? ejBit : m && E.t - m.t >= C2.ejStaleSec ? JG : 0;
    }
  }
  const s05 = (nowOrAppr & ~JG) | ejBit;
  const s05reach = s05 | (reach & ~JG);
  const s12 = (nowOrAppr & ~JG) | ejBit12;
  return { s05: popcount(s05), s05reach: popcount(s05reach), seenNear: popcount(nowOrAppr), mask: s05, maskReach: s05reach, ejKind,
    s12: popcount(s12), mask12: s12, ejAge };
}

/** 匯出給 gate（8a 規則對稱、資訊公平的行為測試）；引擎只經 tacticExecTick 呼叫。 */
export function evaluateInvade(E, X, S, alive) {
  const sd = X.side[S], O = X.obs[S], P = C.postures[sd.posture];
  O.evals++;
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const jg = E.players.find((p) => p.side === S && p.role === "jungle");
  const rec = { t: E.t, side: S, kind: "invade", posture: sd.posture };
  const decline = (r, extra = {}) => { inc(O.declined, r); Object.assign(rec, { d: `declined:${r}` }, extra); pushLog(X, rec); return null; };
  if (sd.active) return decline("in_progress");
  if (E.t < sd.cooldownUntil) return decline("cooldown");
  if (!jg) return decline("no_leader");
  const jb = busyReason(E, jg);
  if (jb) return decline("busy", { busy: jb });
  if (!(jg.hp / jg.maxHp >= P.jHpMin)) return decline("hp");
  const eta = (from, to) => (dist(from, to) * C.detour) / moveSpeed;
  //  目標：先篩合格（情報、價值、安全撤退），再依直線到場時間由近到遠，用實際尋路確認可達性（避開敵塔危險圓），第一個走得到的就是目標。
  const foeCamps = (E.neutrals?.camps ?? []).filter((c) => c.side !== S);
  const ok = []; const why = {};
  for (const c of foeCamps) {
    const b = believedCamp(E, X, S, c, alive);
    if (!b.alive) { inc(why, "no_target"); continue; }
    //  情報可信度：看得見、或有記憶（重生時間是公開資訊）⇒ 可信；從沒看過 ⇒ 只在開局 introPriorSec 內相信「首次出生之後就在」
    if (b.intel === "prior" && E.t > C.introPriorSec && !(X.v11 && C1.priorAnyTimeTypes.includes(c.type === "buff" ? "buff" : "camp"))) { inc(why, "no_intel"); continue; }
    const etaJ = eta(jg.pos, c.pos);
    const etaCap = P.etaMax + (X.v11 && c.type !== "buff" ? C1.campEtaExtra : 0);
    if (etaJ > etaCap) { inc(why, "too_far"); continue; }
    const type = c.type === "buff" ? "buff" : "camp";
    const rate = C.value[type] / (etaJ + C.clearSec[type] * Math.max(0.2, b.hp));
    //  v1.1：價值改由 econ11 判斷（期望收益 vs 往返機會成本，已含距離）；舊的收益率門檻等於「一般營超過 12 秒就不合格」，而敵方一般營都在 18 秒以上。
    if (rate < P.rateMin && !X.v11) { inc(why, "low_value"); continue; }
    if (!exitSafe(E, S, c)) { inc(why, "no_exit"); continue; }
    ok.push({ c, etaJ, type, rate, intel: b.intel, hp: b.hp });
  }
  ok.sort((a, b) => a.etaJ - b.etaJ || String(a.c.id).localeCompare(String(b.c.id)));
  let best = null;
  for (const cand of ok) {
    const len = routeLength(E, S, jg.pos, cand.c.pos);
    if (len == null) { inc(why, "unreachable"); continue; }
    const etaPath = len / moveSpeed;
    if (etaPath > P.etaMax + (X.v11 && cand.type !== "buff" ? C1.campEtaExtra : 0)) { inc(why, "too_far"); continue; }
    if (X.v11) { const ev = (X.v12 ? econ12 : econ11)(E, X, S, alive, { ...cand, etaJ: etaPath }, eta); if (!ev.ok) { inc(why, "own_farm"); rec.econFail ??= { target: cand.c.id, type: cand.type, ...ev.rec }; continue; } cand.econ = ev; }
    best = { ...cand, etaJ: etaPath };
    break;
  }
  if (!best) {
    const order = ["own_farm", "unreachable", "too_far", "low_value", "no_exit", "no_intel", "no_target"];
    return decline(order.find((k) => why[k]) ?? "no_target", { why });
  }
  Object.assign(rec, { target: best.c.id, targetType: best.type, etaJ: Math.round(best.etaJ * 100) / 100, intel: best.intel });
  //  物件仲裁
  const horizon = best.etaJ + C.clearSec[best.type] + C.objHorizonPad;
  const ob = objectiveBlock(E, S, horizon);
  if (ob) return decline(ob);
  if (X.v11) return evaluateParty11(E, X, S, alive, { jg, best, P, rec, decline, eta, moveSpeed });
  //  編隊（打野＋最多一名隊友；隊友依登記的角色順序 mid → sup → top）
  const members = [jg];
  for (const role of C.candidateRoles) {
    if (role === "jungle") continue;
    const hh = E.players.find((p) => p.side === S && p.role === role);
    if (!hh || busyReason(E, hh)) continue;
    if (hh.hp / hh.maxHp < P.memberHpMin) continue;
    if (eta(hh.pos, best.c.pos) > best.etaJ + P.partyEtaSlack) continue;
    members.push(hh);
  }
  if (members.length < P.sizeMin) return decline("no_party");
  const th = threatOf(E, X, S, best.c, alive, (pos) => eta(pos, best.c.pos));
  Object.assign(rec, { threat: th.s05, threatReach: th.s05reach, seenNear: th.seenNear });
  if (P.noSeenThreat && th.seenNear > 0) return decline("threat_seen");
  const T = C.threatModel === "s05reach" ? th.s05reach : th.s05;
  let marginOk = false, pick = null;
  for (let n = P.sizeMin; n <= Math.min(P.sizeMax, members.length); n++) {
    if (n - T < P.marginMin) continue;
    marginOk = true;
    const lc = members.slice(0, n).reduce((s, h) => s + laneCostOf(E, S, h), 0);
    if (lc <= P.laneCostMax) { pick = members.slice(0, n); break; }
  }
  if (!pick) return decline(marginOk ? "lane_cost" : "threat");
  O.go++; O.partySize[pick.length]++; O.targets[best.type]++;
  Object.assign(rec, { d: "go", n: pick.length, members: pick.map((h) => h.id) });
  pushLog(X, rec);
  return { target: best.c, etaJ: best.etaJ, members: pick };
}

/**
 * Sprint 1.1 野區經濟（目標篩選的一部分；單位＝營地價值）：期望收益＝價值 × successP[類型][威脅情況] ×（1＋denyShare）；
 * 機會成本＝lossPerSec × 自家營平均價值 × 往返秒數
 * （到場＋清營 × 剩餘血量比例＋回到最近的自家營地）。另外，自家營地都還沒重生、往返期間也不會重生 ⇒ 打野這段時間本來就沒有自家營可清 ⇒ 機會成本 0。
 * 不是「自家有野怪就禁止」：期望收益夠高的目標（一般營、敵方打野已知在別處的 Buff）照樣可以去。
 */
function econ11(E, X, S, alive, cand, eta) {
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const own = (E.neutrals?.camps ?? []).filter((c) => c.side === S);
  let back = Infinity;
  for (const c of own) back = Math.min(back, eta(cand.c.pos, c.pos));
  if (!Number.isFinite(back)) back = 0;
  const trip = cand.etaJ + C.clearSec[cand.type] * Math.max(0.2, cand.hp ?? 1) + back;
  const idleOwn = own.some((c) => c.alive || (Number.isFinite(c.respawnAt) && c.respawnAt - E.t < trip));
  const th = threatOf(E, X, S, cand.c, alive, (pos) => eta(pos, cand.c.pos));
  const cond0 = th.s05 === 0 && th.seenNear === 0 ? "clear" : th.s05 === 1 && th.mask === bitOf("jungle") && th.ejKind === "prior" && th.seenNear === 0 ? "prior" : "contested";
  const cond = cond0 === "prior" && E.t < C1.earlyPriorSec ? "prior_early" : cond0;
  const ownValue = own.length ? own.reduce((sum, c) => sum + C.value[typeOf(c)], 0) / own.length : 0;
  const ev = C.value[cand.type] * C1.successP[cand.type][cond] * (1 + C1.denyShare);
  const cost = idleOwn ? C1.lossPerSec * ownValue * trip : 0;
  //  X.tune 只有量測工具的診斷臂會設（引擎從不設）⇒ 對局一律用登記的 econK。
  const ev2 = C.value[cand.type] * C1.successP2[cand.type][cond] * (1 + C1.denyShare);
  const k = X.tune?.econK ?? C1.econK;
  return { ok: ev >= k * cost, duoOk: ev2 >= k * cost, rec: { trip: r4(trip), ev: r4(ev), ev2: r4(ev2), cost: r4(cost), cond } };
}

/**
 * Sprint 1.2 野區經濟：
 *  · 機會成本＝自家營平均價值 ×（max(lossPerSec, λ) × 自家有營可打的往返秒數 ＋ λ × 其餘往返秒數）；λ＝我方打野的時間價值（lambdaTime12）。
 *    「自家有營可打」＝從現在起最早一座自家營可打（活著＝0，否則公開的重生剩餘秒數）之後的那段往返時間 ⇒ 下一次重生落在往返期間就照比例計入。
 *  · 期望收益＝價值 × min(0.95, successP ÷ aliveRef) × 到場時還活著的信念（pAlive12）×（1＋denyShare）；2 人用 successP2。
 */
function econ12(E, X, S, alive, cand, eta) {
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const own = (E.neutrals?.camps ?? []).filter((c) => c.side === S);
  let back = Infinity, availFrom = Infinity;
  for (const c of own) {
    back = Math.min(back, eta(cand.c.pos, c.pos));
    availFrom = Math.min(availFrom, c.alive ? 0 : Number.isFinite(c.respawnAt) ? Math.max(0, c.respawnAt - E.t) : Infinity);
  }
  if (!Number.isFinite(back)) back = 0;
  const trip = cand.etaJ + C.clearSec[cand.type] * Math.max(0.2, cand.hp ?? 1) + back;
  const overlap = Number.isFinite(availFrom) ? Math.max(0, Math.min(trip, trip - availFrom)) : 0;
  const lam = lambdaTime12(E, X, S), lamFarm = Math.max(C1.lossPerSec, lam);
  const ownValue = own.length ? own.reduce((sum, c) => sum + C.value[typeOf(c)], 0) / own.length : 0;
  const cost = ownValue * (lamFarm * overlap + lam * (trip - overlap));
  const th = threatOf(E, X, S, cand.c, alive, (pos) => eta(pos, cand.c.pos));
  const cond0 = th.s05 === 0 && th.seenNear === 0 ? "clear" : th.s05 === 1 && th.mask === bitOf("jungle") && th.ejKind === "prior" && th.seenNear === 0 ? "prior" : "contested";
  const cond = cond0 === "prior" && E.t < C1.earlyPriorSec ? "prior_early" : cond0;
  const pA = pAlive12(E, X, S, cand.c, cand.etaJ);
  const gv = (tbl) => C.value[cand.type] * Math.min(0.95, tbl[cand.type][cond] / C2.aliveRef[cand.type]) * pA * (1 + C1.denyShare);
  const ev = gv(C1.successP), ev2 = gv(C1.successP2);
  const k = X.tune?.econK ?? C2.econK;
  return { ok: ev >= k * cost, duoOk: ev2 >= k * cost, rec: { trip: r4(trip), ev: r4(ev), ev2: r4(ev2), cost: r4(cost), cond, pAlive: r4(pA), lambda: r4(lam), overlap: r4(overlap) } };
}

/**
 * Sprint 1.1 出發前的後半段（只在 adaptive.v1.1）：
 *  ① 野區經濟已在目標篩選時做完（econ11：期望收益 vs 往返機會成本；不合格的目標跳過，換下一個近的）。
 *  ② 威脅（同 s05）；保守型看得見威脅一律不去。
 *  ③ 編隊：預估有敵人 ⇒ 優先 2 人（auto 要人數多於預估）；隊友要不忙、血量夠、自己那一路沒被壓塔，而且「實際尋路」到場時間
 *     ≤ 帶隊者 + partyEtaSlack。找不到 ⇒ 只有單人條件成立才單人：沒有看得見／逼近／最近看過的敵人，預估 0；
 *     或唯一的威脅是「沒看見、也沒有新鮮記憶的敵方打野先驗」而且目標是一般營（不是 Buff）。
 */
function evaluateParty11(E, X, S, alive, { jg, best, P, rec, decline, eta, moveSpeed }) {
  const O = X.obs[S], sd = X.side[S], P1 = C1.postures[sd.posture];
  const r4 = (x) => Math.round(x * 10000) / 10000;
  Object.assign(rec, best.econ.rec);
  const th = threatOf(E, X, S, best.c, alive, (pos) => eta(pos, best.c.pos));
  //  v1.2：記錄與編隊用的威脅改成 s12（威脅校準 S11 讀的就是這一欄）；s05 另記一欄。「唯一的威脅是打野先驗」仍以 s05 的位元判斷（情報種類）。
  Object.assign(rec, { threat: X.v12 ? th.s12 : th.s05, threatReach: th.s05reach, seenNear: th.seenNear, ej: th.ejKind },
    X.v12 ? { threat05: th.s05, tmask: th.mask12, ejAge: th.ejAge < 0 ? -1 : Math.round(th.ejAge * 10) / 10 } : {});
  if (P.noSeenThreat && th.seenNear > 0) return decline("threat_seen");
  const T = X.v12 ? th.s12 : th.s05, JG = bitOf("jungle");
  const quiet = th.seenNear === 0 && th.s05reach === th.s05;
  const priorOnly = th.s05 === 1 && th.mask === JG && th.ejKind === "prior";
  //  v1.2：傾向的人數下限只在預估有敵人時要求（預估 0 人 ⇒ 下限 1）
  const sizeMin = X.v12 && T === 0 ? 1 : P.sizeMin;
  const soloOk = sizeMin <= 1 && quiet && (T === 0 || (priorOnly && C1.soloPriorTypes.includes(best.type)));
  const need = T === 0 ? 1 : P1.needAdvantage ? T + 1 : Math.max(1, T + P.marginMin);
  let partner = null;
  const why2 = {};
  if (!(T === 0 && soloOk) && P.sizeMax >= 2) {
    for (const role of C.candidateRoles) {
      if (role === "jungle") continue;
      const hh = E.players.find((p) => p.side === S && p.role === role);
      if (!hh) continue;
      if (busyReason(E, hh)) { inc(why2, "busy"); continue; }
      if (hh.hp / hh.maxHp < Math.max(P.memberHpMin, C1.memberHpMin)) { inc(why2, "hp"); continue; }
      if (laneCostOf(E, S, hh) > P.laneCostMax) { inc(why2, "lane_cost"); continue; }
      if (dist(hh.pos, best.c.pos) / moveSpeed > best.etaJ + C1.partyEtaSlack) { inc(why2, "late"); continue; }
      const len = routeLength(E, S, hh.pos, best.c.pos);
      if (len == null || len / moveSpeed > best.etaJ + C1.partyEtaSlack) { inc(why2, "late"); continue; }
      partner = hh; break;
    }
  }
  let pick = null;
  if (partner && need <= 2 && best.econ.duoOk) pick = [jg, partner];
  else if (soloOk) pick = [jg];
  if (!pick) return decline(partner && need <= 2 ? "own_farm" : need > P.sizeMax ? "threat" : "no_party", { party: why2, need, soloOk });
  O.go++; O.partySize[pick.length]++; O.targets[best.type]++;
  Object.assign(rec, { d: "go", n: pick.length, members: pick.map((h) => h.id), need, soloOk });
  pushLog(X, rec);
  return { target: best.c, etaJ: best.etaJ, members: pick, soloOk };
}

/** 出發：沿用既有入侵生命週期（打野 _invadeStepV2；目標預先指定），隊友由 partnerStep 帶。冷卻只在這裡開始計算。 */
function startInvade(E, X, S, go) {
  const sd = X.side[S], O = X.obs[S], P = C.postures[sd.posture];
  const [leader, partner] = go.members;
  const T = E._tac[S];
  T.invadeUntil = E.t + Math.min(C.windowMax, go.etaJ + C.windowPad);
  leader._invV2 = { done: false, camp: go.target.id, dmg0: go.target.dmgBy[S], dmgMax: go.target.dmgBy[S], arrivedAt: null, contact: 0, lastT: E.t, abortHp: P.abortHp, hp0: leader.hp / leader.maxHp };
  if (E.invObs) E.invObs[S].starts++;
  E.exec[S].invadeAttempts++;
  if (partner) partner._tacPartnerV24 = { leaderId: leader.id, camp: go.target.id, startedAt: E.t, arrivedAt: null };
  sd.active = { leaderId: leader.id, partnerId: partner?.id ?? null, camp: go.target.id, startedAt: E.t };
  if (X.v11) { sd.active.soloOk = !!go.soloOk; sd.active.soloNow = partner == null; sd.active.n0 = go.members.length; }
  sd.cooldownUntil = E.t + P.cooldown;
  O.starts++;
}

// ── 回防觸發（只用防守方合理知道的事：看得見的營地被打、或看見入侵者在自家野區）────────────────
function defendCheck(E, X, D, alive) {
  const sd = X.side[D], O = X.obs[D].defend;
  O.checks++;
  const foe = otherSide(D);
  const ownCamps = (E.neutrals?.camps ?? []).filter((c) => c.side === D);
  let trigger = null;
  for (const c of ownCamps) {
    const prev = sd.campDmg.get(c.id) ?? 0, now = c.dmgBy?.[foe] ?? 0;
    sd.campDmg.set(c.id, now);
    if (!trigger && c.alive && now > prev + 1e-9 && campVisible(E, D, c, alive)) trigger = { camp: c, why: "camp_attacked" };
  }
  if (!trigger) {
    for (const q of alive) {
      if (q.side !== foe || !seen(E, D, q, alive)) continue;
      const c = ownCamps.find((cc) => dist(cc.pos, q.pos) <= C.defend.invaderR);
      if (c) { trigger = { camp: c, why: "invader_seen", invader: q.id }; break; }
    }
  }
  if (!trigger) return;
  if (E.players.some((p) => p.side === D && p._defV24)) return;            // 回防進行中
  if (E.t < sd.defendCooldownUntil) return;
  O.triggers++;
  const rec = { t: E.t, side: D, kind: "defend", why: trigger.why, camp: trigger.camp.id };
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const eta = (from) => (dist(from, trigger.camp.pos) * C.detour) / moveSpeed;
  const knownFoes = alive.filter((q) => q.side === foe && seen(E, D, q, alive) && dist(q.pos, trigger.camp.pos) <= C.defend.invaderR).length;
  const cands = [];
  for (const role of C.candidateRoles) {
    const hh = E.players.find((p) => p.side === D && p.role === role);
    if (!hh || busyReason(E, hh) || hh.hp / hh.maxHp < C.defend.hpMin) continue;
    const e = eta(hh.pos);
    if (e > C.defend.etaMax) continue;
    cands.push({ hh, e });
  }
  cands.sort((a, b) => a.e - b.e || String(a.hh.id).localeCompare(String(b.hh.id)));
  const decline = (r) => { inc(O.declined, r); rec.d = `declined:${r}`; rec.known = knownFoes; pushLog(X, rec); sd.defendCooldownUntil = E.t + 5; };
  if (!cands.length) return decline("no_one_free");
  const n = Math.min(C.defend.size, cands.length);
  if (n < knownFoes) return decline("outnumbered");
  const pick = cands.slice(0, Math.max(1, Math.min(n, Math.max(1, knownFoes))));
  for (const { hh } of pick) hh._defV24 = { camp: trigger.camp.id, until: E.t + C.defend.window, startedAt: E.t, lastSeenFoe: E.t, arrivedAt: null };
  O.go++; O.starts++; O.defenders += pick.length;
  sd.defendCooldownUntil = E.t + C.defend.cooldown;
  Object.assign(rec, { d: "go", n: pick.length, members: pick.map((x) => x.hh.id), known: knownFoes });
  pushLog(X, rec);
}

/** 每 tick 開頭（英雄迴圈之前）呼叫：記憶、回防觸發、入侵評估。 */
export function tacticExecTick(E, X, alive) {
  tacticExecObserve(E, X, alive);
  //  陣亡的隊友／回防者：這一刻結束（英雄迴圈對死者直接跳過，不會走到 step）
  for (const p of E.players) {
    if (!p.dead) continue;
    if (p._tacPartnerV24) endPartner(X, p, "killed", E.t);
    if (p._defV24) { const O = X.obs[p.side].defend; inc(O.ends, "killed"); if (p._defV24.arrivedAt != null) O.arrived++; pushLog(X, { t: E.t, side: p.side, kind: "defend_end", id: p.id, reason: "killed" }); p._defV24 = null; }
  }
  for (const S of ["blue", "red"]) {
    const sd = X.side[S];
    if (E.t >= sd.nextDefend) { sd.nextDefend = E.t + C.defendEvery; defendCheck(E, X, S, alive); }
    //  進行中的入侵：帶隊者結束 ⇒ 整隊結束（隊友同一刻收到）
    if (sd.active) {
      const L = E.players.find((p) => p.id === sd.active.leaderId);
      if (!L || L.dead || !L._invV2 || L._invV2.done) {
        const reason = !L || L.dead ? "killed" : L._invV2?.reason ?? "ended";
        const P2 = sd.active.partnerId ? E.players.find((p) => p.id === sd.active.partnerId) : null;
        if (P2 && P2._tacPartnerV24) endPartner(X, P2, `leader_${reason}`, E.t);
        inc(X.obs[S].ends, reason);
        pushLog(X, { t: E.t, side: S, kind: "invade_end", reason, camp: sd.active.camp, dur: Math.round((E.t - sd.active.startedAt) * 10) / 10,
          arrived: L?._invV2?.arrivedAt != null, hp0: L?._invV2?.hp0 ?? null, hp1: L && !L.dead ? Math.round((L.hp / L.maxHp) * 1000) / 1000 : 0, contact: L?._invV2 ? Math.round(L._invV2.contact * 10) / 10 : null,
          ...(X.v11 ? { n: sd.active.n0 ?? (sd.active.partnerId ? 2 : 1), released: !!sd.active.released, held: Math.round((sd.active.regroup?.held ?? 0) * 10) / 10 } : {}) });
        if (L?._invV2?.arrivedAt != null) X.obs[S].arrived++;
        if (reason === "stolen") X.obs[S].steals++;
        sd.active = null;
      }
    }
    if (!sd.posture || E.t < sd.nextEval) continue;
    sd.nextEval = E.t + C.evalEvery;
    const go = evaluateInvade(E, X, S, alive);
    if (go) startInvade(E, X, S, go);
  }
}

/** 入侵進行中的額外中止條件（在 _invadeStepV2 之前問）：本隊物件窗打開 ⇒ objective_call。回傳原因或 null。 */
export function invadeGuard(E, p, X = null, alive = null) {
  if (E.fsm3?.[p.side]?.objGo) return "objective_call";
  if (!X?.v11 || !alive) return null;
  return retreatCheck11(E, X, p, alive);
}

/**
 * Sprint 1.1 動態撤退（帶隊者每 tick；只讀看得見的敵人＋2 秒前的位置歷史，與評估同一套資訊公平規則）：
 *  · 看得見的敵人在營地 threatR 內、離帶隊者 contactR 內、或在營地 approachR 內且（2 秒內）朝營地逼近 approachMin 以上 ⇒ 算在場敵人 F
 *    （血量比例相加＝fPow）。只是路過、待在線上的敵人不算（Sprint 1.1 第一、二輪量測：途中看見線上英雄就撤，到場率反而更低）。
 *  · 我方在場＝帶隊者＋離帶隊者 partnerWithR 內的隊友 M（血量比例相加＝mPow）
 *  · 有敵人在場而帶隊者血量 < contestedAbortHp ⇒ retreat_hp（及早撤離，不等到 abortHp）
 *  · F > M，或 fPow > mPow × powK ⇒ retreat_threat（戰力不利）
 *  · 到場前每 stuckSec 秒離營地沒有近 stuckMin（不含等隊友）⇒ stuck
 *  · 到場前隊友沒了（陣亡、撤退、回城、自己的失敗條件）⇒ 用當下看得見的資訊重新評估：F＝0 而且單人條件成立
 *    （s05 預估 0，或唯一的威脅是敵方打野先驗而目標是一般營）⇒ 單人繼續；否則 partner_lost
 *  撤退之後的再出發受冷卻限制（從出發算起），不會反覆出發／撤退。
 */
export function retreatCheck11(E, X, p, alive) {
  const sd = X.side[p.side], A = sd.active;
  if (!A || A.leaderId !== p.id) return null;
  const P1 = C1.postures[sd.posture];
  if (!P1) return null;
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp) ?? null;
  const foe = otherSide(p.side);
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  let F = 0, fPow = 0;
  for (const q of alive) {
    if (q.side !== foe || !seen(E, p.side, q, alive)) continue;
    const near = dist(q.pos, p.pos) <= C1.contactR || (!!camp && dist(q.pos, camp.pos) <= C.threatR);
    let appr = false;
    if (!near && camp && dist(q.pos, camp.pos) <= C1.approachR) {
      const old = posAgo(X, q.id, E.t);
      appr = !!old && dist(q.pos, camp.pos) <= dist(old, camp.pos) - C.approachMin && (dist(q.pos, camp.pos) * C.detour) / moveSpeed <= C.approachNearEta;
    }
    if (near || appr) { F++; fPow += q.hp / q.maxHp; }
  }
  const partner = A.partnerId ? E.players.find((q) => q.id === A.partnerId) ?? null : null;
  const pOk = !!partner && !partner.dead && !!partner._tacPartnerV24;
  const pNear = pOk && dist(partner.pos, p.pos) <= C1.partnerWithR;
  const M = 1 + (pNear ? 1 : 0), mPow = p.hp / p.maxHp + (pNear ? partner.hp / partner.maxHp : 0);
  if (F > 0 && p.hp / p.maxHp < P1.contestedAbortHp) return "retreat_hp";
  if (camp && p._invV2?.arrivedAt == null && !A.regroup?.holding) {
    const d = dist(p.pos, camp.pos), G = (A.prog ??= { t: E.t, d });
    if (E.t - G.t >= C1.stuckSec) { if (G.d - d < C1.stuckMin) return "stuck"; G.t = E.t; G.d = d; }
  }
  if (F > M || (F > 0 && fPow > mPow * P1.powK)) return "retreat_threat";
  if (A.partnerId && !pOk && p._invV2?.arrivedAt == null && !A.soloNow) {
    if (F > 0 || !camp || !soloNow11(E, X, p.side, camp, alive)) return "partner_lost";
    A.soloNow = true;                 // 已改成單人繼續（之後照單人處理，不再重算）
  }
  return null;
}
/** 單人條件（出發後重評用；與出發時同一套）：沒有看得見／逼近／最近看過的敵人，預估 0；或唯一的威脅是敵方打野先驗而目標是一般營。 */
function soloNow11(E, X, S, camp, alive) {
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const th = threatOf(E, X, S, camp, alive, (pos) => (dist(pos, camp.pos) * C.detour) / moveSpeed);
  const T = X.v12 ? th.s12 : th.s05;
  if (X.v12 && T > 0 && (C.postures[X.side[S].posture]?.sizeMin ?? 1) > 1) return false;   // v1.2：有預估敵人時，2 人下限的傾向不改單人
  return th.seenNear === 0 && th.s05reach === th.s05 && (T === 0 || (th.s05 === 1 && th.mask === bitOf("jungle") && th.ejKind === "prior" && C1.soloPriorTypes.includes(typeOf(camp))));
}

/**
 * Sprint 1.1 等隊友（帶隊者每 tick，在 _invadeStepV2 之後）：到場前隊友落後 > regroupLagSec ⇒ 原地等，
 * 落後 ≤ regroupResumeSec 才繼續（遲滯，避免走走停停）；累計等超過 regroupMaxSec ⇒ 用當下資訊重評單人條件：
 * 成立 ⇒ 放隊友回去（partner_end released）、單人繼續；不成立 ⇒ partner_lag 撤退。adaptive.v1 原樣回傳。
 */
export function invadeLead(E, X, p, inv, alive = null) {
  if (!X?.v11 || !inv) return inv;
  const A = X.side[p.side].active, I = p._invV2;
  if (!A || A.leaderId !== p.id || !A.partnerId || !I || I.arrivedAt != null) return inv;
  const partner = E.players.find((q) => q.id === A.partnerId);
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp);
  if (!partner || partner.dead || !partner._tacPartnerV24 || !camp) return inv;
  const G = (A.regroup ??= { holding: false, held: 0, lastT: E.t });
  const dt = E.t - G.lastT; G.lastT = E.t;
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6);
  const lag = (dist(partner.pos, camp.pos) - dist(p.pos, camp.pos)) / moveSpeed;
  if (G.holding ? lag > C1.regroupResumeSec : lag > C1.regroupLagSec) {
    if (G.holding) G.held += dt;
    G.holding = true;
    if (G.held > C1.regroupMaxSec) {
      if (alive && soloNow11(E, X, p.side, camp, alive)) {      // 單人條件成立 ⇒ 放隊友回去，帶隊者單人繼續
        endPartner(X, partner, "released", E.t);
        A.partnerId = null; A.soloNow = true; A.released = true; G.holding = false;
        return inv;
      }
      E._invadeEndV2(p, "partner_lag"); return null;
    }
    return { tgt: { x: p.pos.x, y: p.pos.y }, st: "入侵" };
  }
  G.holding = false;
  return inv;
}

function endPartner(X, p, reason, t = null) {
  inc(X.obs[p.side].partnerEnds, reason);
  if (X.v11) {
    const arrived = p._tacPartnerV24?.arrivedAt != null;
    if (arrived) X.obs[p.side].partnerArrived = (X.obs[p.side].partnerArrived ?? 0) + 1;
    pushLog(X, { t, side: p.side, kind: "partner_end", id: p.id, reason, arrived });
    p._tacPartnerV24 = null;
    return;
  }
  pushLog(X, { t, side: p.side, kind: "partner_end", id: p.id, reason });
  p._tacPartnerV24 = null;
}
/** 隊友每 tick：跟著帶隊者到營地旁（站在營地與帶隊者之間），自己的失敗條件：血量、被圍、自己那一路的塔被壓、物件窗。 */
export function partnerStep(E, X, p, alive) {
  const A = p._tacPartnerV24;
  if (!A) return null;
  const L = E.players.find((q) => q.id === A.leaderId);
  const end = (r) => { endPartner(X, p, r, E.t); return null; };
  if (!L || L.dead || !L._invV2 || L._invV2.done) return end("leader_ended");
  if (p.retreating) return end("retreat");
  if (p.hp / p.maxHp < C.partnerHp) return end("hp");
  if (E.fsm3?.[p.side]?.objGo) return end("objective_call");
  const foes = alive.filter((q) => q.side !== p.side && dist(q.pos, p.pos) < 14).length;
  const mates = alive.filter((q) => q.side === p.side && dist(q.pos, p.pos) < 14).length;
  if (foes >= mates + 2) return end("outnumbered");
  for (const tw of Object.values(E.towers)) {
    if (tw.side !== p.side || tw.hp <= 0 || tw.lane !== p.lane) continue;
    if (alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < C.laneEmergencyR)) return end("lane_emergency");
  }
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp);
  const anchor = camp?.pos ?? INVASION_POINT[p.side];
  if (A.arrivedAt == null && dist(p.pos, anchor) <= 8) { A.arrivedAt = E.t; }
  const dx = L.pos.x - anchor.x, dy = L.pos.y - anchor.y, d = Math.hypot(dx, dy) || 1;
  return { tgt: { x: anchor.x + (dx / d) * C.partnerStand, y: anchor.y + (dy / d) * C.partnerStand }, st: "入侵" };
}

/** 回防者每 tick：去營地，看得見入侵者就去入侵者那裡。結束條件：清空、血量、被壓制、物件窗、時間到。 */
export function defendStep(E, X, p, alive) {
  const A = p._defV24;
  if (!A) return null;
  const O = X.obs[p.side].defend;
  const end = (r) => { inc(O.ends, r); if (A.arrivedAt != null) O.arrived++; pushLog(X, { t: E.t, side: p.side, kind: "defend_end", id: p.id, reason: r }); p._defV24 = null; return null; };
  if (p.retreating) return end("retreat");
  if (p.hp / p.maxHp < C.defend.abortHp) return end("hp");
  if (E.fsm3?.[p.side]?.objGo) return end("objective_call");
  if (E.t >= A.until) return end("window");
  const camp = (E.neutrals?.camps ?? []).find((c) => c.id === A.camp);
  if (!camp) return end("no_camp");
  const foe = otherSide(p.side);
  const invaders = alive.filter((q) => q.side === foe && seen(E, p.side, q, alive) && dist(q.pos, camp.pos) <= C.defend.invaderR);
  if (invaders.length) A.lastSeenFoe = E.t;
  else if (E.t - A.lastSeenFoe >= C.defend.clearSec && (A.arrivedAt != null || E.t - A.startedAt >= C.defend.clearSec)) return end("cleared");
  const mates = alive.filter((q) => q.side === p.side && dist(q.pos, p.pos) < 14).length;
  if (invaders.filter((q) => dist(q.pos, p.pos) < 14).length >= mates + 2) return end("outnumbered");
  if (A.arrivedAt == null && dist(p.pos, camp.pos) <= 8) A.arrivedAt = E.t;
  let tgt = camp.pos;
  if (invaders.length) { let b = invaders[0]; for (const q of invaders) if (dist(q.pos, p.pos) < dist(b.pos, p.pos)) b = q; tgt = b.pos; }
  return { tgt: { x: tgt.x, y: tgt.y }, st: "回防" };
}

export function tacticExecSummary(X) {
  return { contract: TACTIC_EXEC_CONTRACT, threatModel: C.threatModel, blue: X.obs.blue, red: X.obs.red, logSize: X.log.length };
}
