#!/usr/bin/env node
// ============================================================================
//  tools/measure_stat_sensitivity.mjs — 16 項素質的**實測敏感度矩陣**
//
//  執行：`node tools/measure_stat_sensitivity.mjs [seeds]`（預設 8 個 seed）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  先前用「各作用點係數相加」當作影響力指標是**錯的**：
//  `gankIntervalScale` 是倍率、`focusRate` 是機率、`retreatAdj` 是門檻平移、
//  `xpRateScale` 是經驗倍率——單位與槓桿都不同，相加沒有意義。
//  這支改為直接量**對局結果**。
//
//  ── 方法 ──────────────────────────────────────────────────────────────────
//  · 其餘 15 項固定 70，單一受測素質設 40 / 70 / 90
//  · 同一組 seed、同一套戰術（中性 knobs）、同一組召喚師技能、對手固定全 70
//  · **鏡像對跑**：受測方分別當藍方與紅方各跑一次再平均
//    ⇒ 抵銷技能層既有的陣營偏斜（未注入能力時藍方勝率就偏低，是既有技術債）
//  · 70 的基準只需算一次（16 項在 70 時完全相同）
//
//  ⚠ 不修改任何傷害公式、門檻或權重。這支**只量測**，不寫回任何東西。
// ============================================================================
import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SEEDS_N = Number(arg("seeds", argv[0] || 8));
const ONLY = (arg("stats", "") || "").split(",").filter(Boolean);
const SCENARIO = arg("scenario", "neutral");
const TAG = arg("out", SCENARIO === "neutral" ? "sensitivity" : `scenario_${SCENARIO}`);
//  固定 seed 池：第二輪擴大時前 8 個與第一輪相同 ⇒ 兩輪可直接對照
const SEED_POOL = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242,
  31337, 65535, 1024, 2048, 4096, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43,
  47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
  127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
  //  ── 以下為第三輪（每場只擲一次的指標，如入侵，需要 100+ seeds）補充。
  //     只在尾端追加：前 60 個順序不變 ⇒ 與 8 / 30 seeds 的舊結果仍可直接對照。
  197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 277, 281,
  283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379,
  383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463,
  467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571];
//  ⚠ `slice` 對超出長度不會報錯，只會靜默給少一點——`--seeds=100` 曾因此
//     實際只跑 60 個 seed，而 JSON 仍記成「已完成」。寧可直接停。
if (SEEDS_N > SEED_POOL.length) {
  console.error(`seed 池只有 ${SEED_POOL.length} 個，要求 ${SEEDS_N} 個。請先擴充 SEED_POOL。`);
  process.exit(1);
}
const SEEDS = SEED_POOL.slice(0, SEEDS_N);
//  ⚠ 警語必須由**本次實際樣本數**算出，不得硬編碼。
//  舊版寫死「8 seeds 的勝率不可用（±26pp）」，100 seeds 的輸出檔裡也照抄同一句，
//  讀 JSON 的人會據此低估自己手上資料的精度。
//  比例類（每場一次擲骰：勝率、入侵）的常態近似：單格 ±1.96×sqrt(0.25/n)、
//  兩格相減 ±1.96×sqrt(0.5/n)。逐 tick 累積的指標精度遠高於此，不適用。
const CELL_N = SEEDS.length * 2;
const CI1 = (1.96 * Math.sqrt(0.25 / CELL_N) * 100).toFixed(1);
const CI2 = (1.96 * Math.sqrt(0.5 / CELL_N) * 100).toFixed(1);
const CAVEAT =
  `每格 ${CELL_N} 場（${SEEDS.length} seeds × 藍紅鏡像）。` +
  `每場一次擲骰的比例指標（勝率、入侵）單格 95% CI ≈ ±${CI1}pp、兩格相減 ≈ ±${CI2}pp` +
  `⇒ 只能辨識大於此幅度的差異，勝率一律僅作旁證。` +
  `逐 tick 累積的指標（補刀、空揮、撤退、集火）事件數為每場數百～數千，精度遠高於此。`;
const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const MAX_TICKS = 4200;

const statsWith = (key, v) => Object.fromEntries(KEYS.map((k) => [k, k === key ? v : 70]));
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));

/**
 * 情境 knobs。
 * ⚠ `_neutralKnobs()` 的 `invadeChance` / `roamRate` / `splitPush` 都是 **0**，
 *   所以中性情境下勇氣（invadeAdj）、溝通與領導力（roamAdj）、應變力（splitAdj）
 *   的主要作用點**基準值就是零**——量到 0 不代表素質沒用，是情境沒給機會。
 *   第二組專屬情境把對應的基準值開起來，才量得到真實差異。
 */
function knobsFor(e, scenario) {
  const k = e._neutralKnobs();
  switch (scenario) {
    case "invade":    return { ...k, invadeChance: 0.5, invadeWithMid: true, gankInterval: 35 };
    case "roam":      return { ...k, roamRate: 0.5 };
    case "objective": return { ...k, dragonJoin: 0.85, baronJoin: 0.85 };
    case "teamfight": return { ...k, joinFight: 0.85, gankInterval: 28 };
    case "split":     return { ...k, splitPush: 0.6, splitLane: "top" };
    //  逆風／低資源：撤退門檻拉高（更常被迫脫戰）⇒ 放大「何時敢回去打」的差異，
    //  也就是韌性的 returnAdj 真正管的事。雙方同一組 knobs，不偏袒任何一方。
    case "comeback":  return { ...k, retreatAt: 0.42, joinFight: 0.7 };
    //  ── 正式遊戲的實際預設（2026-08-09 新增）
    //  ⚠ `_neutralKnobs()` **不是**正式對局的條件。正式流程走
    //     `useLocalServer.js:191` → `toEngineTactic(tactic)`，而所有戰術預設
    //     （含對手固定的 `STANDARD_OPP_TACTIC`）的 `roamRate` / `invadeChance` /
    //     `splitPush` 都是**非零**：
    //       supportRoamRate 預設 0.3（各預設 0.15–0.7）
    //       invadePriority  預設 0.1（各預設 0.1–0.35）
    //       splitPush       預設 0.1（各預設 0.05–0.85）
    //     中性情境把這三個設 0 ⇒ 直接關掉 roamSightAdj / roamInfoAdj /
    //     roamGateAdj / roamFollowAdj / invadeAdj / splitAdj 六個作用點。
    //     也就是說「中性情境量到 0」對這些素質不是「沒有用」，
    //     而是**實驗條件把它們的作用點關掉了**，且該條件在正式遊戲中不存在。
    //  本情境逐鍵照抄 `toEngineTactic(STANDARD_OPP_TACTIC)` 的輸出，
    //  是 16 項素質在**真實對局條件**下唯一有代表性的量測基準。
    case "standard":  return { ...k, joinFight: 0.6, dragonJoin: 0.65, baronJoin: 0.65,
      retreatAt: 0.25, splitPush: 0.1, splitLane: null, gankInterval: 45,
      invadeChance: 0.1, invadeWithMid: false, roamRate: 0.3 };
    default:          return k;
  }
}

/** 跑一場；`testSide` 是受測方，另一方固定全 70。 */
function run(seed, key, value, testSide) {
  const e = new LogicEngine(seed);

  //  ⚠ 順序很重要：`configurePlayers` 必須在 `configureMatch` **之前**。
  //  開局野區入侵在 `configureMatch` 當下就擲骰，並讀該側打野的 `invadeAdj`
  //  （`_modById(side[0] + "2")`）——能力層還沒注入就會讀到 null，
  //  `invadeAdj` 等於完全不生效。正式流程 `useLocalServer.js:136` 已註明此順序，
  //  是本量測工具第一版寫反了（實測：入侵次數 40 分與 90 分都是 0.47，完全沒差）。
  const test = statsWith(key, value);
  const baseStats = statsWith(key, 70);
  e.configurePlayers(toEnginePlayerMods({
    blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : baseStats })),
    red: RED.map((id) => ({ id, stats: testSide === "red" ? test : baseStats })),
  }));

  //  順序與正式 runtime 一致（useLocalServer.js）：
  //    configurePlayers(143) → configureHeroes(152) → configureSpells(186) → configureMatch(192)
  //  ⚠ 四步全部照抄，**包含 `configureHeroes`**。本工具不注入英雄定位層，
  //     而 `configureHeroes({blue:null, red:null})` 在引擎裡是
  //     `if (!blue && !red) return;`（`LogicEngine.js:395`）⇒ **逐位元的 no-op**：
  //     不改狀態、不消耗 rng、`heroesOn` 維持 false。
  //     正式流程 `useLocalServer.js:152` 也是「無 roster 時不呼叫」⇒ 兩者等價。
  //     這一行留著只為讓四步順序在程式碼裡看得見，避免日後又被誤判成「少一步」。
  //     （實測 5 seeds：加與不加，終局時間／勝負／雙方金錢逐位元相同。）
  e.configureHeroes({ blue: null, red: null, meta: null });
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "sens" } });
  const knobs = knobsFor(e, SCENARIO);
  e.configureMatch({ blue: knobs, red: knobs, meta: { tacticId: SCENARIO } });

  //  越塔評估的攔截統計（純觀測，不改行為、不動 rng）
  let diveTry = 0, diveOk = 0;
  const orig = e._diveAssessV18.bind(e);
  e._diveAssessV18 = (...a) => { const r = orig(...a); diveTry++; if (r.ok) diveOk++; return r; };

  //  ── 目標（龍／巴龍）集結決策的攔截（純觀測：原函式只呼叫一次，不動 rng）
  //  `_objJoinV3` 是 objAdj 唯一的作用點（`LogicEngine.js:734-747`）。
  //  ⚠ 打野與輔助在擲骰**之前**就無條件 return true（`:738`）⇒ 每次只有 3/5 人
  //     真的吃 objAdj。只統計會擲骰的那 3 人，否則分母被灌水。
  //  ⚠ 也不能數「呼叫次數」：黏性機制下多數呼叫只是回傳上次的 `p.objGo`。
  //     以 `p.objEvalT` 是否前進來判定「這次真的擲了骰」，時點與引擎完全一致。
  let objRolls = 0, objRollGo = 0;
  const origObjJoin = e._objJoinV3.bind(e);
  e._objJoinV3 = (p, key, K, M) => {
    const before = p.objEvalT;
    const r = origObjJoin(p, key, K, M);
    if (p.side === testSide && p.role !== "jungle" && p.role !== "sup" && p.objEvalT !== before) {
      objRolls++; if (p.objGo) objRollGo++;
    }
    return r;
  };

  //  逐 tick 取樣：撤退中的比例與「重返作戰」次數（韌性的 returnAdj 真正管的事）
  let aliveTicks = 0, retreatingTicks = 0, returns = 0;
  let retreatAtSum = 0, retreatAtTicks = 0;
  const wasRetreating = new Map();

  //  ── 遊走「支援結果」的觀測（純取樣：只讀 p.state / p.atkTicks / k / a，
  //     不改行為、不動 rng、不呼叫引擎方法）。
  //  ⚠ 引擎裡**沒有「支援」這個事件**：`roamRate` 命中只是讓輔助的 effLane 改成
  //     中路、持續 8 秒（`LogicEngine.js:3217-3221`）。沒有「請求支援 → 抵達 →
  //     成功/失敗」的結構可讀。以下是**代理指標**，命名刻意不叫「支援成功率」，
  //     避免被當成引擎的一級概念：
  //       roamEpisodes — 遊走段落數（由 exec.supportRoams 的增量偵測 ⇒ 恆等於 roams）
  //       roamEngaged  — 段落窗內該輔助自己 atkTicks 有增加 ⇒ 真的接上戰鬥
  //       roamPaid     — 段落窗內該側 K+A 有增加 ⇒ 換到人頭參與
  //       roamMissed   — roamEpisodes − roamPaid ⇒ 走了但什麼都沒換到
  //  ⚠ 段落**不可**用 `p.state === "遊走"` 偵測：`stOv` 只在對線分支才寫進
  //     `p.state`（`:3415`／`:3499`），一開走就接上戰鬥的那些會被戰鬥狀態覆蓋 ⇒
  //     系統性漏掉**成功**的段落（實測 2 seeds：段落 7.5 vs 引擎 roams 11.0，
  //     接戰率被壓到 10%）。改盯引擎計數器的增量，時點與擲骰完全一致。
  //  ── 團戰參與決策的攔截（純觀測，同 _objJoinV3 的作法）
  //  `_joinV3`（`LogicEngine.js:712`）是 joinAdj 唯一的作用點，也是 synergy
  //  唯一的作用點（`STAT_MAP.joinAdj.synergy = +0.040`，全表僅此一處）。
  //  ⚠ 打野／輔助照樣擲骰，但額外吃 `R.jgSupJoinBonus` ⇒ 排除，否則與理論不可比。
  //  ⚠ `_teamBehindV3` 為真時引擎會再扣 0.2（`:731`）——這是**落後方更常防守**的
  //     內生回饋，會與素質效果混在一起。一併記錄擲骰當下的落後比例以量化這個混淆。
  //     `_teamBehindV3` 只讀擊殺數與塔狀態，純函式、無 rng，呼叫安全。
  let tfRolls = 0, tfGo = 0, tfBehind = 0;
  const origJoin = e._joinV3.bind(e);
  e._joinV3 = (p, hot, K, M, alive) => {
    const before = p.joinEvalT;
    const r = origJoin(p, hot, K, M, alive);
    if (p.side === testSide && p.role !== "jungle" && p.role !== "sup" && p.joinEvalT !== before) {
      tfRolls++; if (p.joinGo) tfGo++; if (e._teamBehindV3(p.side)) tfBehind++;
    }
    return r;
  };

  //  ── 團戰規模與勝負的觀測（proxy）
  //  ⚠ 人數定義**直接沿用引擎自己的那一條**（`:3550`）：
  //     `!dead && state === "團戰!"`。段落開關也照抄引擎（≥3 開、<2 關，`:3551-3552`）
  //     ⇒ 不新增第二套決策模型，tfEpisodes 應與 exec.groupedFights 對齊。
  //       tfHeadMean  — 每 tick 該側處於「團戰!」的人數平均（含 0 人的 tick）
  //       tfPeakMean  — 每個段落的人數峰值，再對段落取平均 ⇒「同時進場人數」
  //       tfEpisodes  — 段落數
  //       tfWon       — 段落內該側 Δ擊殺 > Δ死亡 ⇒「多人作戰成功」proxy
  //                     （平手不算贏；這是淨交換比，不是引擎的勝負概念）
  let tfHeadSum = 0, tfHeadTicks = 0, tfEpisodes = 0, tfWon = 0, tfPeakSum = 0;
  let tfEp = null;

  //  ── 目標坑的集結觀測（純取樣：只讀 o.alive / o.pos / o.killerTeam 與座標）
  //  ⚠ 引擎**沒有「呼叫集結」這個事件**，也沒有「集結成功」的旗標
  //     （`exec.dragonContests` / `baronContests` 宣告了但從未 ++，是死欄位）。
  //     以下全部是 proxy，先定義再解讀：
  //       objSpawns     — 觀測到的龍／巴龍生成次數
  //       objRallies    — 生成後該側在坑內（半徑 9，與引擎結算傷害的半徑同）
  //                       人數首次達到 3 的次數 ⇒「有集結起來」
  //       objRallyRate  — objRallies / objSpawns
  //       objRallyDelay — 生成 → 首次達 3 人的秒數（只對有集結的那些取平均；
  //                       沒集結的不算進去 ⇒ 這是**條件平均**，不是全體平均）
  //       objHeadMean   — 目標存活期間，坑內該側平均人數（含 0 人的 tick）
  //       objHeadPeak   — 每次生成期間坑內人數的最大值，再對生成次數取平均
  //       objKills      — o.killerTeam === 受測方 的擊殺數（引擎原生歸屬，非 proxy）
  const PIT_R = 9;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pitSt = { dragon: null, baron: null };
  let objSpawns = 0, objRallies = 0, objKills = 0;
  let objDelaySum = 0, objDelayN = 0, objHeadSum = 0, objHeadTicks = 0, objPeakSum = 0, objPeakN = 0;

  const ROAM_WIN = Math.round((8 + 5) / 0.5);   // 遊走窗 8 秒 ＋ 5 秒尾窗（收益常在回程結算）
  const mineP = e.players.filter((p) => p.side === testSide);
  const sup = mineP.filter((p) => p.role === "sup");
  let roamEpisodes = 0, roamEngaged = 0, roamPaid = 0;
  let prevRoams = e.exec?.[testSide]?.supportRoams ?? 0;
  let epLeft = 0, epAtk0 = 0, epKa0 = 0, epEngaged = false, epPaid = false;
  const closeEp = () => { if (epEngaged) roamEngaged++; if (epPaid) roamPaid++; epLeft = 0; };
  const supAtk = () => sup.reduce((s, p) => s + (p.atkTicks ?? 0), 0);

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(0.5);
    for (const p of e.players) {
      if (p.side !== testSide || p.dead) continue;
      aliveTicks++;
      //  引擎把這一 tick 實際採用的撤退門檻寫在 p.dbgRetreatAt（`LogicEngine.js:3170`）
      //  ⇒ 可直接驗證 retreatAdj 的理論值，不必從行為反推。純讀取。
      //  ⚠ 這是**套用所有情境修正之後**的值（落後 +0.05、連死 +0.05、人數劣勢、
      //     短期換血、支援/逃生減免…），不是 `0.42 + retreatAdj` 的裸值。
      if (Number.isFinite(p.dbgRetreatAt)) { retreatAtSum += p.dbgRetreatAt; retreatAtTicks++; }
      if (p.retreating) retreatingTicks++;
      const prev = wasRetreating.get(p.id) ?? false;
      if (prev && !p.retreating) returns++;
      wasRetreating.set(p.id, !!p.retreating);
    }

    //  團戰段落取樣（人數與開關條件完全照抄引擎 `:3550-3552`）
    {
      const fighters = mineP.filter((p) => !p.dead && p.state === "團戰!").length;
      tfHeadSum += fighters; tfHeadTicks++;
      const kNow = mineP.reduce((s, p) => s + (p.k ?? 0), 0);
      const dNow = mineP.reduce((s, p) => s + (p.d ?? 0), 0);
      if (fighters >= 3 && !tfEp) {
        tfEp = { k0: kNow, d0: dNow, peak: fighters }; tfEpisodes++;
      } else if (tfEp) {
        if (fighters > tfEp.peak) tfEp.peak = fighters;
        if (fighters < 2) {
          tfPeakSum += tfEp.peak;
          if (kNow - tfEp.k0 > dNow - tfEp.d0) tfWon++;
          tfEp = null;
        }
      }
    }

    //  目標坑取樣（neutralObjectives 關閉時 e.neutrals 不存在 ⇒ 整段跳過）
    for (const key of ["dragon", "baron"]) {
      const o = e.neutrals?.[key];
      if (!o) continue;
      let st = pitSt[key];
      if (o.alive && !st?.live) {
        st = { live: true, spawnT: e.t, rallied: false, peak: 0 };
        pitSt[key] = st; objSpawns++;
      }
      if (!st) continue;
      if (o.alive) {
        const heads = mineP.filter((p) => !p.dead && dist2(p.pos, o.pos) < PIT_R).length;
        objHeadSum += heads; objHeadTicks++;
        if (heads > st.peak) st.peak = heads;
        if (heads >= 3 && !st.rallied) {
          st.rallied = true; objRallies++;
          objDelaySum += e.t - st.spawnT; objDelayN++;
        }
      } else if (st.live) {
        st.live = false;
        objPeakSum += st.peak; objPeakN++;
        if (o.killerTeam === testSide) objKills++;
      }
    }

    const teamKA = mineP.reduce((s, p) => s + (p.k ?? 0) + (p.a ?? 0), 0);
    const nowRoams = e.exec?.[testSide]?.supportRoams ?? 0;
    if (nowRoams > prevRoams) {
      //  同一窗內又觸發新的一次 ⇒ 先結算舊的（實務上間隔 40–55 秒，不會發生）
      if (epLeft > 0) closeEp();
      roamEpisodes += nowRoams - prevRoams;
      epLeft = ROAM_WIN; epAtk0 = supAtk(); epKa0 = teamKA; epEngaged = false; epPaid = false;
    }
    prevRoams = nowRoams;
    if (epLeft > 0) {
      if (supAtk() > epAtk0) epEngaged = true;
      if (teamKA > epKa0) epPaid = true;
      if (--epLeft === 0) closeEp();
    }
  }
  if (epLeft > 0) closeEp();   // 比賽結束時仍開著的段落
  if (tfEp) {                  // 比賽結束時仍開著的團戰段落
    tfPeakSum += tfEp.peak;
    const kEnd = mineP.reduce((s, p) => s + (p.k ?? 0), 0);
    const dEnd = mineP.reduce((s, p) => s + (p.d ?? 0), 0);
    if (kEnd - tfEp.k0 > dEnd - tfEp.d0) tfWon++;
    tfEp = null;
  }

  const side = testSide;
  const mine = e.players.filter((p) => p.side === side);
  const sum = (f) => mine.reduce((s, p) => s + (f(p) ?? 0), 0);
  const ex = e.exec?.[side] ?? {};
  const px = e.pexec ?? {};

  return {
    decided: e.over && (e.winner === "blue" || e.winner === "red"),
    winner: e.winner ?? null,
    win: e.winner === side,
    minutes: e.t / 60,
    k: sum((p) => p.k), d: sum((p) => p.d), a: sum((p) => p.a),
    ganks: (ex.topGanks ?? 0) + (ex.midGanks ?? 0) + (ex.botGanks ?? 0),
    gankKills: ex.gankKills ?? 0,
    roams: ex.supportRoams ?? 0,
    //  Combat Decision C：遊走決策的純觀測計數（引擎 `roamObs`，不在 exec 內）
    roamDeclined: e.roamObs?.[side]?.declined ?? 0,
    roamAborted: e.roamObs?.[side]?.aborted ?? 0,
    roamRetargeted: e.roamObs?.[side]?.retargeted ?? 0,
    roamLaneTop: e.roamObs?.[side]?.lanes?.top ?? 0,
    roamLaneMid: e.roamObs?.[side]?.lanes?.mid ?? 0,
    roamLaneBot: e.roamObs?.[side]?.lanes?.bot ?? 0,
    groupedFights: ex.groupedFights ?? 0,
    roamEpisodes, roamEngaged, roamPaid,
    retreatAtSum, retreatAtTicks,
    tfRolls, tfGo, tfBehind, tfEpisodes, tfWon, tfPeakSum, tfHeadSum, tfHeadTicks,
    //  Combat Decision B：同步閘的純觀測（引擎 `tfObs`，不在 exec 內）
    tfSoloEntry: e.tfObs?.[side]?.soloEntry ?? 0,
    tfEntries: e.tfObs?.[side]?.entries ?? 0,
    tfHeld: e.tfObs?.[side]?.held ?? 0,
    tfReleasedSync: e.tfObs?.[side]?.releasedSync ?? 0,
    tfReleasedTimeout: e.tfObs?.[side]?.releasedTimeout ?? 0,
    tfCommit: e.tfObs?.[side]?.commit ?? 0,
    tfHoldN: e.tfObs?.[side]?.hold ?? 0,
    tfDecline: e.tfObs?.[side]?.decline ?? 0,
    tfBadCommit: e.tfObs?.[side]?.badCommit ?? 0,
    tfReadySum: e.tfObs?.[side]?.readyAtEngage ?? 0,
    tfSpreadSum: e.tfObs?.[side]?.spreadSum ?? 0,
    tfSpreadN: e.tfObs?.[side]?.spreadN ?? 0,
    dragonContests: ex.dragonContests ?? 0, baronContests: ex.baronContests ?? 0,
    objSpawns, objRallies, objKills, objRolls, objRollGo,
    objDelaySum, objDelayN, objHeadSum, objHeadTicks, objPeakSum, objPeakN,
    invades: ex.invadeAttempts ?? 0,
    invadeKills: ex.invadeKills ?? 0,
    towerPushes: ex.towerPushes ?? 0,
    splitPush: ex.splitPushActions ?? 0,
    focusSwap: sum((p) => p.focusSwap),
    castTry: sum((p) => p.castTry), castOk: sum((p) => p.castOk),
    atkTicks: sum((p) => p.atkTicks), atkWasted: sum((p) => p.atkWasted),
    csAttempt: sum((p) => p.csAttempt), csHit: sum((p) => p.csHit),
    retreats: mine.reduce((s, p) => s + (px[p.id]?.retreats ?? 0), 0),
    chaseDropped: sum((p) => p.chaseDropped),
    mlv: sum((p) => p.mlv) / mine.length,
    diveTry, diveOk,
    fightUptime: aliveTicks > 0 ? 1 - retreatingTicks / aliveTicks : null,
    returns,
  };
}

/** 鏡像對跑並平均，抵銷陣營偏斜。 */
//  逐場 raw sample 與摘要分開存：摘要檔要能被人讀，raw 可能上萬列。
//  ⚠ 必須宣告在第一次呼叫 measure()（中性基準）**之前**，否則 TDZ。
let rawRows = [];

//  `label` 讓中性基準那一格標成 `__baseline__`：16 項在 70 分時完全相同，
//  引擎只跑一次、`at70` 對所有素質共用同一個物件（`store.stats[].at70 = base`）。
//  若把它記成 `reflex@70`，raw 裡就會「只有 reflex 有 70 分的列」，
//  驗證器會誤判成缺格。標成 baseline 才如實反映這個共用結構。
function measure(key, value, label = key) {
  const rows = [];
  for (const seed of SEEDS) {
    for (const side of ["blue", "red"]) {
      const r = run(seed, key, value, side);
      //  ⚠ 逐場 raw sample：沒有它就算不出「每場一個值」欄位的變異數
      //  （撤退／推塔／死亡／場長／objRallyDelay 全部卡在這裡）。
      //  只加欄位、不改任何計算，摘要仍由同一批 rows 算出 ⇒ 兩者恆等，可交叉驗證。
      rawRows.push({ stat: label, value, seed, side, ...r });
      rows.push(r);
    }
  }
  const n = rows.length;
  const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / n;
  const decided = rows.filter((r) => r.decided);
  const rate = (num, den) => { const d = avg(den); return d > 0 ? avg(num) / d : null; };
  return {
    n,
    winRate: decided.length ? decided.filter((r) => r.win).length / decided.length : null,
    decidedRate: decided.length / n,
    minutes: avg((r) => r.minutes),
    k: avg((r) => r.k), d: avg((r) => r.d), a: avg((r) => r.a),
    ganks: avg((r) => r.ganks), gankKills: avg((r) => r.gankKills),
    gankRate: rate((r) => r.gankKills, (r) => r.ganks),
    roams: avg((r) => r.roams),
    roamDeclined: avg((r) => r.roamDeclined),
    roamAborted: avg((r) => r.roamAborted),
    roamRetargeted: avg((r) => r.roamRetargeted),
    //  出發傾向命中後，有多少比例被評分擋下來（＝「正確地不去」的比例）
    roamDeclineRate: rate((r) => r.roamDeclined, (r) => r.roamDeclined + r.roams),
    roamLaneTop: avg((r) => r.roamLaneTop),
    roamLaneMid: avg((r) => r.roamLaneMid),
    roamLaneBot: avg((r) => r.roamLaneBot),
    groupedFights: avg((r) => r.groupedFights),
    roamEpisodes: avg((r) => r.roamEpisodes),
    roamEngaged: avg((r) => r.roamEngaged),
    roamPaid: avg((r) => r.roamPaid),
    roamMissed: avg((r) => r.roamEpisodes - r.roamPaid),
    roamEngageRate: rate((r) => r.roamEngaged, (r) => r.roamEpisodes),
    roamPaidRate: rate((r) => r.roamPaid, (r) => r.roamEpisodes),
    retreatAtMean: rate((r) => r.retreatAtSum, (r) => r.retreatAtTicks),
    tfRolls: avg((r) => r.tfRolls),
    tfSoloEntry: avg((r) => r.tfSoloEntry),
    tfEntries: avg((r) => r.tfEntries),
    tfHeld: avg((r) => r.tfHeld),
    tfReleasedSync: avg((r) => r.tfReleasedSync),
    tfReleasedTimeout: avg((r) => r.tfReleasedTimeout),
    tfSoloRate: rate((r) => r.tfSoloEntry, (r) => r.tfEntries),
    tfCommit: avg((r) => r.tfCommit),
    tfHoldN: avg((r) => r.tfHoldN),
    tfDecline: avg((r) => r.tfDecline),
    tfBadCommit: avg((r) => r.tfBadCommit),
    //  B′-3 主指標：投入當下有效戰力比 < 1 的比例
    tfBadCommitRate: rate((r) => r.tfBadCommit, (r) => r.tfCommit),
    tfDeclineRate: rate((r) => r.tfDecline, (r) => r.tfCommit + r.tfHoldN + r.tfDecline),
    //  B′-4 主指標：每場團戰的交換比
    tfExchange: rate((r) => r.k, (r) => r.d),
    tfReadyAtEngage: rate((r) => r.tfReadySum, (r) => r.tfEntries),
    tfArrivalSpread: rate((r) => r.tfSpreadSum, (r) => r.tfSpreadN),
    tfGoRate: rate((r) => r.tfGo, (r) => r.tfRolls),
    tfBehindRate: rate((r) => r.tfBehind, (r) => r.tfRolls),
    tfEpisodes: avg((r) => r.tfEpisodes),
    tfWonRate: rate((r) => r.tfWon, (r) => r.tfEpisodes),
    tfPeakMean: rate((r) => r.tfPeakSum, (r) => r.tfEpisodes),
    tfHeadMean: rate((r) => r.tfHeadSum, (r) => r.tfHeadTicks),
    dragonContests: avg((r) => r.dragonContests),
    baronContests: avg((r) => r.baronContests),
    objSpawns: avg((r) => r.objSpawns),
    objRallies: avg((r) => r.objRallies),
    objKills: avg((r) => r.objKills),
    objRallyRate: rate((r) => r.objRallies, (r) => r.objSpawns),
    objKillRate: rate((r) => r.objKills, (r) => r.objSpawns),
    //  ⚠ 條件平均：分母只含「有集結起來」的生成次數
    objRallyDelay: rate((r) => r.objDelaySum, (r) => r.objDelayN),
    objHeadMean: rate((r) => r.objHeadSum, (r) => r.objHeadTicks),
    objHeadPeak: rate((r) => r.objPeakSum, (r) => r.objPeakN),
    objRolls: avg((r) => r.objRolls),
    objRollGoRate: rate((r) => r.objRollGo, (r) => r.objRolls),
    invades: avg((r) => r.invades),
    towerPushes: avg((r) => r.towerPushes),
    splitPush: avg((r) => r.splitPush),
    focusSwap: avg((r) => r.focusSwap),
    castMissRate: 1 - (rate((r) => r.castOk, (r) => r.castTry) ?? 1),
    wasteRate: rate((r) => r.atkWasted, (r) => r.atkTicks) ?? 0,
    csRate: rate((r) => r.csHit, (r) => r.csAttempt) ?? 1,
    retreats: avg((r) => r.retreats),
    chaseDropped: avg((r) => r.chaseDropped),
    mlv: avg((r) => r.mlv),
    diveTry: avg((r) => r.diveTry), diveOk: avg((r) => r.diveOk),
    fightUptime: avg((r) => r.fightUptime ?? 0),
    returns: avg((r) => r.returns),
  };
}

const f = (v, d = 2) => (v == null ? "—" : (typeof v === "number" ? v.toFixed(d) : String(v)));
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

console.log(`# 敏感度矩陣｜情境 ${SCENARIO}｜${SEEDS.length} seeds × 鏡像對跑 = 每格 ${SEEDS.length * 2} 場`);
console.log(`# 對手固定全 70；受測方藍紅各跑一次再平均（抵銷陣營偏斜）\n`);

const base = measure(KEYS[0], 70, "__baseline__");   // 70 時 16 項完全相同，只算一次
console.log("## 中性基準（全 70）");
console.log(`勝率 ${pct(base.winRate)}｜收束 ${pct(base.decidedRate)}｜時長 ${f(base.minutes,1)} 分｜K/D/A ${f(base.k,1)}/${f(base.d,1)}/${f(base.a,1)}`);
console.log(`Gank ${f(base.ganks,1)}（成功率 ${pct(base.gankRate)}）｜遊走 ${f(base.roams,1)}｜入侵 ${f(base.invades,2)}｜推塔 ${f(base.towerPushes,1)}｜分推 ${f(base.splitPush,1)}`);
console.log(`集火 ${f(base.focusSwap,1)}｜技能放空 ${pct(base.castMissRate)}｜無效攻擊 ${pct(base.wasteRate)}｜補刀 ${pct(base.csRate)}`);
console.log(`撤退 ${f(base.retreats,1)}｜放棄追擊 ${f(base.chaseDropped,2)}｜本場等級 ${f(base.mlv,2)}｜越塔 ${f(base.diveTry,2)} 次（准 ${f(base.diveOk,2)}）\n`);

console.log("## 逐項：40 / 90 相對中性的變化");
const out = [];
const OUT_DIR = "review/moba-combat";
fs.mkdirSync(OUT_DIR, { recursive: true });
const JSON_PATH = `${OUT_DIR}/${TAG}.json`;
const RAW_PATH = `${OUT_DIR}/${TAG}.raw.json`;

//  ⚠ 每測完一項就落檔：這個環境的背景工作會被中途收掉，
//  「全部算完才輸出」等於每次被收就整批白跑（已經發生兩次）。
//  已存在的結果直接沿用 ⇒ 重跑同一個指令即可續跑。
let store = { generatedBy: "tools/measure_stat_sensitivity.mjs", scenario: SCENARIO,
  seeds: SEEDS, matchesPerCell: SEEDS.length * 2, maxTicks: MAX_TICKS,
  method: "其餘 15 項固定 70；受測項 40/70/90；對手固定全 70；受測方藍紅鏡像對跑後平均",
  caveat: CAVEAT,
  neutralBaseline: base, stats: [] };
try {
  const prev = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  //  ⚠ 續跑條件只比對「情境」與「seed 數」，且情境缺欄位時視為相容。
  //  第一版寫成 `prev.scenario === SCENARIO`，但舊檔沒有 scenario 欄位 ⇒
  //  `undefined === "neutral"` 永遠為 false ⇒ **每次都從頭跑並覆蓋既有結果**
  //  （實測：8 項完成的資料被一次 `--stats=focus` 的續跑覆蓋掉）。
  const sameScenario = (prev.scenario ?? SCENARIO) === SCENARIO;
  if (sameScenario && prev.seeds?.length === SEEDS.length) {
    store = { ...prev, scenario: SCENARIO };
  }
} catch { /* 沒有舊檔就從頭來 */ }
//  續跑時舊檔可能帶著上一版的硬編碼警語 ⇒ 一律以本次實際樣本數重算。
//  （續跑條件已保證 seeds 數相同，所以這不會改變任何數值的意義。）
store.caveat = CAVEAT;
const done = new Set(store.stats.map((x) => x.key));

//  raw 的續跑條件與摘要**完全相同**，且只保留 done 之內的列 ⇒
//  不會出現「摘要有這項但 raw 沒有」或反過來的漂移。
try {
  const prevRaw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  if ((prevRaw.scenario ?? SCENARIO) === SCENARIO && prevRaw.seeds?.length === SEEDS.length) {
    //  本次跑出來的中性基準留著（與舊檔恆等，但用本次的比較誠實），
    //  舊檔只取「摘要也認得」的項 ⇒ raw 與摘要不可能單邊漂移。
    rawRows = [
      ...rawRows.filter((r) => r.stat === "__baseline__"),
      ...(prevRaw.rows ?? []).filter((r) => done.has(r.stat)),
    ];
  }
} catch { /* 沒有舊 raw 就從頭來 */ }

const flush = () => {
  fs.writeFileSync(JSON_PATH, JSON.stringify(store, null, 2), "utf8");
  //  raw 與摘要在**同一次 flush** 落檔 ⇒ 中途被收掉也不會一邊有一邊沒有。
  fs.writeFileSync(RAW_PATH, JSON.stringify({
    generatedBy: "tools/measure_stat_sensitivity.mjs",
    scenario: SCENARIO, seeds: SEEDS, matchesPerCell: SEEDS.length * 2,
    maxTicks: MAX_TICKS, summaryFile: `${TAG}.json`,
    note: "逐場 raw sample。摘要由同一批列算出 ⇒ 可用 tools/verify_sensitivity_raw.mjs 交叉驗證。",
    rows: rawRows,
  }), "utf8");
  const COLS2 = ["winRate", "fightUptime", "returns", "decidedRate", "minutes", "k", "d", "a",
    "groupedFights", "roamEpisodes", "roamEngaged", "roamPaid", "roamMissed",
    "roamEngageRate", "roamPaidRate",
    "roamDeclined", "roamAborted", "roamRetargeted", "roamDeclineRate",
    "roamLaneTop", "roamLaneMid", "roamLaneBot",
    "retreatAtMean",
    "tfRolls", "tfGoRate", "tfBehindRate", "tfEpisodes", "tfWonRate", "tfPeakMean", "tfHeadMean",
    "tfSoloEntry", "tfSoloRate", "tfReadyAtEngage", "tfArrivalSpread",
    "tfCommit", "tfHoldN", "tfDecline", "tfBadCommit", "tfBadCommitRate", "tfDeclineRate", "tfExchange",
    "dragonContests", "baronContests",
    "objSpawns", "objRallies", "objRallyRate", "objRallyDelay", "objHeadMean",
    "objHeadPeak", "objKills", "objKillRate", "objRolls", "objRollGoRate",
    "ganks", "gankKills", "gankRate", "roams", "invades", "towerPushes", "splitPush", "focusSwap",
    "castMissRate", "wasteRate", "csRate", "retreats", "chaseDropped", "mlv", "diveTry", "diveOk"];
  const rows2 = ["key,zh,cat,value," + COLS2.join(",")];
  for (const st of store.stats) {
    for (const [v, m] of [[40, st.at40], [70, st.at70], [90, st.at90]]) {
      rows2.push([st.key, st.zh, st.cat, v, ...COLS2.map((c) => (m?.[c] == null ? "" : m[c]))].join(","));
    }
  }
  fs.writeFileSync(`${OUT_DIR}/${TAG}.csv`, rows2.join(String.fromCharCode(10)), "utf8");
};

const TARGETS = (ONLY.length ? STAT_DEF.filter((x) => ONLY.includes(x.key)) : STAT_DEF)
  .filter((x) => !done.has(x.key));
if (done.size) console.log(`（續跑：已完成 ${[...done].join("/")}，跳過）`);
for (const s of TARGETS) {
  const lo = measure(s.key, 40);
  const hi = measure(s.key, 90);
  out.push({ s, lo, hi });
  store.stats.push({ key: s.key, zh: s.zh, cat: s.cat, at40: lo, at70: base, at90: hi });
  flush();
  const dd = (a, b, d = 2) => `${f(a, d)} → ${f(b, d)}`;
  console.log(`\n### ${s.zh}（${s.key}・${s.cat}）`);
  console.log(`  勝率      ${pct(lo.winRate)} → ${pct(base.winRate)} → ${pct(hi.winRate)}   Δ(90−40) ${lo.winRate != null && hi.winRate != null ? ((hi.winRate - lo.winRate) * 100).toFixed(1) + "pp" : "—"}`);
  console.log(`  時長/收束 ${dd(lo.minutes, hi.minutes, 1)} 分｜${pct(lo.decidedRate)} → ${pct(hi.decidedRate)}`);
  console.log(`  K/D/A     ${f(lo.k,1)}/${f(lo.d,1)}/${f(lo.a,1)} → ${f(hi.k,1)}/${f(hi.d,1)}/${f(hi.a,1)}`);
  console.log(`  Gank      ${dd(lo.ganks, hi.ganks, 1)}（成功率 ${pct(lo.gankRate)} → ${pct(hi.gankRate)}）`);
  console.log(`  遊走/入侵 ${dd(lo.roams, hi.roams, 1)}｜${dd(lo.invades, hi.invades)}`);
  console.log(`  遊走段落  ${dd(lo.roamEpisodes, hi.roamEpisodes, 1)}（接戰 ${pct(lo.roamEngageRate)} → ${pct(hi.roamEngageRate)}｜換到人頭 ${pct(lo.roamPaidRate)} → ${pct(hi.roamPaidRate)}）`);
  console.log(`  空手遊走  ${dd(lo.roamMissed, hi.roamMissed, 1)}｜參團 ${dd(lo.groupedFights, hi.groupedFights, 1)}`);
  console.log(`  遊走決策  婉拒 ${dd(lo.roamDeclined, hi.roamDeclined, 1)}（${pct(lo.roamDeclineRate)} → ${pct(hi.roamDeclineRate)}）｜取消 ${dd(lo.roamAborted, hi.roamAborted, 1)}｜改道 ${dd(lo.roamRetargeted, hi.roamRetargeted, 1)}`);
  console.log(`  遊走路別  上 ${dd(lo.roamLaneTop, hi.roamLaneTop, 1)}｜中 ${dd(lo.roamLaneMid, hi.roamLaneMid, 1)}｜下 ${dd(lo.roamLaneBot, hi.roamLaneBot, 1)}`);
  console.log(`  團戰段落  ${dd(lo.tfEpisodes, hi.tfEpisodes, 1)}（淨交換勝 ${pct(lo.tfWonRate)} → ${pct(hi.tfWonRate)}）｜同時進場 ${dd(lo.tfPeakMean, hi.tfPeakMean)} 人／均 ${dd(lo.tfHeadMean, hi.tfHeadMean)}`);
  console.log(`  同步進場  單獨 ${dd(lo.tfSoloEntry, hi.tfSoloEntry, 2)}（${pct(lo.tfSoloRate)} → ${pct(hi.tfSoloRate)}）｜到場已就位 ${dd(lo.tfReadyAtEngage, hi.tfReadyAtEngage)} 人｜抵達離散 ${dd(lo.tfArrivalSpread, hi.tfArrivalSpread)} 秒`);
  console.log(`  投入決策  commit ${dd(lo.tfCommit, hi.tfCommit, 1)}｜hold ${dd(lo.tfHoldN, hi.tfHoldN, 1)}｜decline ${dd(lo.tfDecline, hi.tfDecline, 1)}（${pct(lo.tfDeclineRate)} → ${pct(hi.tfDeclineRate)}）`);
  console.log(`  投入品質  不利投入 ${pct(lo.tfBadCommitRate)} → ${pct(hi.tfBadCommitRate)}｜交換比 ${dd(lo.tfExchange, hi.tfExchange, 3)}`);
  console.log(`  （參考）  待命 ${dd(lo.tfHeld, hi.tfHeld, 1)} tick｜對齊放行 ${dd(lo.tfReleasedSync, hi.tfReleasedSync, 2)}｜逾時放行 ${dd(lo.tfReleasedTimeout, hi.tfReleasedTimeout, 2)}`);
  console.log(`  參團擲骰  ${dd(lo.tfRolls, hi.tfRolls, 1)}（命中 ${pct(lo.tfGoRate)} → ${pct(hi.tfGoRate)}｜擲骰時落後 ${pct(lo.tfBehindRate)} → ${pct(hi.tfBehindRate)}）`);
  console.log(`  目標生成  ${dd(lo.objSpawns, hi.objSpawns, 2)}｜集結 ${dd(lo.objRallies, hi.objRallies, 2)}（${pct(lo.objRallyRate)} → ${pct(hi.objRallyRate)}）｜到場 ${dd(lo.dragonContests + lo.baronContests, hi.dragonContests + hi.baronContests, 1)}`);
  console.log(`  集結延遲  ${dd(lo.objRallyDelay, hi.objRallyDelay, 1)} 秒｜坑內人數 均 ${dd(lo.objHeadMean, hi.objHeadMean)}／峰 ${dd(lo.objHeadPeak, hi.objHeadPeak)}`);
  console.log(`  目標擊殺  ${dd(lo.objKills, hi.objKills, 2)}（${pct(lo.objKillRate)} → ${pct(hi.objKillRate)}）｜集結擲骰 ${dd(lo.objRolls, hi.objRolls, 1)}（命中 ${pct(lo.objRollGoRate)} → ${pct(hi.objRollGoRate)}）`);
  console.log(`  推塔/分推 ${dd(lo.towerPushes, hi.towerPushes, 1)}｜${dd(lo.splitPush, hi.splitPush, 1)}`);
  console.log(`  集火      ${dd(lo.focusSwap, hi.focusSwap, 1)}`);
  console.log(`  技能放空  ${pct(lo.castMissRate)} → ${pct(hi.castMissRate)}`);
  console.log(`  無效攻擊  ${pct(lo.wasteRate)} → ${pct(hi.wasteRate)}`);
  console.log(`  補刀      ${pct(lo.csRate)} → ${pct(hi.csRate)}`);
  console.log(`  撤退/棄追 ${dd(lo.retreats, hi.retreats, 1)}｜${dd(lo.chaseDropped, hi.chaseDropped)}`);
  console.log(`  本場等級  ${dd(lo.mlv, hi.mlv)}`);
  console.log(`  越塔      ${dd(lo.diveTry, hi.diveTry)} 次（准 ${dd(lo.diveOk, hi.diveOk)}）`);
  console.log(`  作戰持續  ${pct(lo.fightUptime)} → ${pct(hi.fightUptime)}｜重返 ${dd(lo.returns, hi.returns, 1)}`);
  console.log(`  撤退門檻  ${dd(lo.retreatAtMean, hi.retreatAtMean, 4)}（實際採用值，含所有情境修正）`);
}

//  ── 摘要：哪些素質真的有可觀測影響 ──────────────────────────────────────
console.log("\n\n## 摘要：|Δ| 由大到小（勝率 pp／等級／關鍵行為）");
const rows = out.map(({ s, lo, hi }) => ({
  zh: s.zh, key: s.key, cat: s.cat,
  dWin: (lo.winRate != null && hi.winRate != null) ? (hi.winRate - lo.winRate) * 100 : null,
  dMlv: hi.mlv - lo.mlv,
  dGank: hi.ganks - lo.ganks,
  dRoam: hi.roams - lo.roams,
  dFocus: hi.focusSwap - lo.focusSwap,
  dCast: (lo.castMissRate - hi.castMissRate) * 100,
  dWaste: (lo.wasteRate - hi.wasteRate) * 100,
  dCs: (hi.csRate - lo.csRate) * 100,
  dRetreat: hi.retreats - lo.retreats,
}));
rows.sort((a, b) => Math.abs(b.dWin ?? 0) - Math.abs(a.dWin ?? 0));
console.log("素質        分類  Δ勝率   Δ等級  ΔGank  Δ遊走  Δ集火  Δ技能  Δ空揮  Δ補刀  Δ撤退");
for (const r of rows) {
  console.log(
    r.zh.padEnd(10),
    r.cat.padEnd(4),
    (r.dWin == null ? "—" : r.dWin.toFixed(1) + "pp").padStart(7),
    r.dMlv.toFixed(2).padStart(7),
    r.dGank.toFixed(1).padStart(6),
    r.dRoam.toFixed(1).padStart(6),
    r.dFocus.toFixed(1).padStart(6),
    (r.dCast.toFixed(1) + "pp").padStart(7),
    (r.dWaste.toFixed(1) + "pp").padStart(7),
    (r.dCs.toFixed(1) + "pp").padStart(7),
    r.dRetreat.toFixed(1).padStart(6),
  );
}
console.log("\n（Δ = 90 分減 40 分。Δ技能／Δ空揮為「失誤率下降幅度」，正值代表高素質失誤較少。）");

//  ⚠ 檔尾原本還有一段「機器可讀輸出」，會在跑完後用**本次跑的 `out`** 覆蓋
//  增量檔 —— 那正是「續跑後只剩最後幾項、scenario 欄位消失」的原因。
//  增量落檔已由上面的 `flush()` 負責，這裡不再重複寫檔。
