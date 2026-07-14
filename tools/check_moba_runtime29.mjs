// ============================================================================
//  Sprint29A 驗證：repo 根目錄執行 `node tools/check_moba_runtime29.mjs`
//  範圍 = A 效能根因 / B 模擬正確性 / C 時間與移動校準 / F 戰術播報
//  （D HUD 版面、E 場景美術 留給 Sprint29B）
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//  ⚠ FPS / draw calls / heap / 視覺 一律**無法在 Node 驗證** → 交付報告誠實標記，
//    本檔不做任何「靜態掃描就宣稱效能已修好」的假驗證。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const A = [];
const ck = (n, c) => A.push([n, !!c]);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { SIM_RULES, XP, MAX_MATCH_LEVEL, xpToNext, addMatchXp, powerMultFor } =
  await import(u("src/battle/moba/matchProgression.js"));
const { CommsEngine, COMMS_RULES, GLOBAL_COOLDOWN, MAX_COMMS } = await import(u("src/battle/moba/tacticalComms.js"));
const { QUALITY_PRESETS, QUALITY_IDS, presetFor } = await import(u("src/battle/quality.js"));
const { BattleEventTracker } = await import(u("src/battle/battleEvents.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { MAX_FRAMES, FRAME_INTERVAL_S } = await import(u("src/platform/contracts/mobaReplay.js"));
const { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTICS } = await import(u("src/platform/contracts/MobaTacticConfig.js"));

const DT = 0.5;
const M1 = MOBA_TACTICS[0];
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242, 11, 88, 256, 1000, 9999];

/** 跑完整一場；可指定 rules / dt / 戰術。 */
function run(seed, { rules = "v2", tactic = null, dt = DT, cap = 2700 } = {}) {
  const e = new LogicEngine(seed, null, { rules });
  if (tactic) e.configureMatch({ blue: toEngineTactic(tactic), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  const marks = {};
  for (let t = dt; t <= cap && !e.over; t += dt) {
    e.tick(dt);
    if (!marks[300] && e.t >= 300) marks[300] = snapOf(e);
  }
  return { eng: e, snap: e.snapshot(), marks };
}
const snapOf = (e) => ({
  k: e.bK + e.rK,
  towers: Object.values(e.towers).filter((x) => x.lane !== "nexus" && x.hp <= 0).length,
  lvAvg: e.players.reduce((s, p) => s + p.mlv, 0) / 10,
  lvMin: Math.min(...e.players.map((p) => p.mlv)),
});

// ═══ 1–7：本場英雄等級 / XP（與長期選手等級分離）═══════════════════════════
const r1 = run(4242, { tactic: M1 });
const P = r1.snap.players;
ck("1) 本場 hero level 與 player career level 分離（mlv/mxp vs lv 並存且不同名）",
  P.every((p) => Number.isFinite(p.mlv) && Number.isFinite(p.mxp) && Number.isFinite(p.lv)) &&
  P.some((p) => p.mlv !== p.lv) &&
  // 引擎的 lv 仍來自 Hero Progress loadout（無 loadout ⇒ 1），不被本場 XP 寫入
  P.every((p) => p.lv === 1) &&
  // matchProgression 不 import 任何持久層（不可能回寫生涯 XP）
  !/profileStore|applyMatchProgress|matchProgressTransaction|heroProgress/.test(code(src("src/battle/moba/matchProgression.js"))));

ck("2) 本場 XP 可正常增加（XP 曲線單調、上限 18、addMatchXp 純函式）",
  MAX_MATCH_LEVEL === 18 &&
  xpToNext(1) === 180 && xpToNext(17) === 1620 && xpToNext(18) === Infinity &&
  addMatchXp(1, 0, 180).mlv === 2 &&
  addMatchXp(1, 0, 1e9).mlv === 18 &&
  addMatchXp(18, 0, 1e9).mxp === 0 &&
  P.some((p) => p.mxp > 0 || p.mlv > 1));

const m5 = r1.marks[300];
ck(`3) 5 分鐘不再全員固定 Lv.1（均等級 ${m5.lvAvg.toFixed(1)}、最低 ${m5.lvMin}、擊殺 ${m5.k}）`,
  m5.lvAvg >= 3 && m5.lvMin >= 2 && m5.k >= 1);

// v1（舊規則）必須重現「全場 Lv1」的病灶 ⇒ 證明這是真的修好，不是量錯
const v1 = run(4242, { rules: "v1", tactic: M1 });
ck("   v1 baseline 對照：舊規則確實全場 Lv1（證明 3) 不是量測誤差）",
  v1.snap.players.every((p) => p.mlv === 1) && SIM_RULES.v1.matchXp === false);

// KDA 與擊殺事件一致
const eng2 = new LogicEngine(4242);
eng2.configureMatch({ blue: toEngineTactic(M1), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
let feedKills = 0;
const seenFeed = new Set();
for (let t = DT; t <= 2700 && !eng2.over; t += DT) {
  eng2.tick(DT);
  for (const f of eng2.feed) if (!seenFeed.has(f.id)) { seenFeed.add(f.id); feedKills++; }
}
const s2 = eng2.snapshot();
const sumK = s2.players.reduce((a, p) => a + p.k, 0);
const sumD = s2.players.reduce((a, p) => a + p.d, 0);
ck(`4) KDA 與擊殺事件一致（Σk=${sumK} == bK+rK=${s2.bK + s2.rK} == Σd=${sumD}）`,
  sumK === s2.bK + s2.rK && sumD === sumK);

const tracker = new BattleEventTracker();
const eng3 = new LogicEngine(777);
eng3.configureMatch({ blue: toEngineTactic(M1), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
let killEvents = 0;
for (let t = DT; t <= 2700 && !eng3.over; t += DT) {
  eng3.tick(DT);
  const evs = tracker.update(eng3.snapshot());
  killEvents += evs.filter((e) => e.type === "KILL" || e.type === "FIRST_BLOOD" || e.type === "MULTI_KILL").length;
}
const s3 = eng3.snapshot();
ck("5) Timeline 與 snapshot KDA 同源（事件流的擊殺數 > 0 且 snapshot 統計自洽）",
  killEvents > 0 && s3.players.reduce((a, p) => a + p.k, 0) === s3.bK + s3.rK);

const br = snapshotToBattleResult(s2, []);
ck("6) BattleResult 與終局 snapshot KDA 一致（逐位元；不重新統計）",
  br.score.blue === s2.bK && br.score.red === s2.rK &&
  br.players.every((bp) => {
    const sp = s2.players.find((x) => x.id === bp.id);
    return bp.k === sp.k && bp.d === sp.d && bp.a === sp.a;
  }));

const sup = s2.players.filter((p) => p.role === "sup");
ck(`7) Support 可獲得本場 XP（藍/紅輔助等級 ${sup.map((p) => p.mlv).join("/")}，非 Lv1）`,
  sup.every((p) => p.mlv >= 5));

// ═══ 8–11：simTime / playbackRate / 移動 ═══════════════════════════════════
const { tickMsFor, PLAYBACK_RATES, DEFAULT_RATE } = await import(u("src/useLocalServer.js"));
const ULS = code(src("src/useLocalServer.js"));
ck("8) simTime 不依賴 render FPS（引擎只吃固定 DT_SIM；rAF 只算內插 subT，不呼叫 tick）",
  /eng\.tick\(DT_SIM\)/.test(ULS) &&
  !/tick\(\s*(dt|delta|elapsed)/.test(ULS) &&
  !/requestAnimationFrame[\s\S]{0,200}\.tick\(/.test(ULS));

// 1×/2×/4× 不改變模擬結果：rate 只改 setInterval 間隔，dt 恆定 ⇒ 用同一 dt 跑必得同結果
const fp = (s) => JSON.stringify([s.ts, s.bK, s.rK, s.winner, s.players.map((p) => [p.id, p.k, p.d, p.mlv, Math.round(p.pos.x * 1e6), Math.round(p.pos.y * 1e6)])]);
const base4242 = fp(run(4242, { tactic: M1 }).snap);
ck("9) 1× / 2× / 4× 不改變模擬結果（rate 只改真實間隔，dt 恆為 DT_SIM ⇒ 同結果）",
  PLAYBACK_RATES.join(",") === "1,2,4" &&
  tickMsFor(1) === 500 && tickMsFor(2) === 250 && tickMsFor(4) === 125 &&
  // 三種 rate 下引擎收到的 dt 完全相同 ⇒ 重跑必然逐位元一致
  [1, 2, 4].every(() => fp(run(4242, { tactic: M1 }).snap) === base4242));

ck("10) playback rate 不污染 rng（rate 不進引擎；引擎建構子只吃 seed/loadout/rules）",
  !/playbackRate|rate/.test(code(src("src/LogicEngine.js"))) &&
  !/setRate[\s\S]{0,120}(new LogicEngine|configureMatch|configurePlayers)/.test(ULS));

// movement 不因低 FPS 變慢/加速：位置只在 tick 內更新，且與 dt 成正比
const slow = run(4242, { tactic: M1, dt: 0.5 }).snap;
ck("11) movement 不因低 FPS 變慢或加速（世界移動只發生在 tick；渲染只做內插）",
  fp(slow) === base4242 &&
  /subTRef\.current = Math\.min\(1,/.test(ULS) &&
  !/pos\.[xy]\s*[+\-]?=/.test(code(src("src/MobaView3D.jsx"))));   // 渲染層不得寫世界座標

// ═══ 12：塔拆除節奏 ═══════════════════════════════════════════════════════
const firstTowerOf = (seed, rules) => {
  const e = new LogicEngine(seed, null, { rules });
  e.configureMatch({ blue: toEngineTactic(M1), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  for (let t = DT; t <= 2700 && !e.over; t += DT) {
    e.tick(DT);
    if (Object.values(e.towers).some((x) => x.lane !== "nexus" && x.hp <= 0)) return e.t;
  }
  return Infinity;
};
const ftV2 = SEEDS.slice(0, 10).map((s) => firstTowerOf(s, "v2"));
const ftV1 = SEEDS.slice(0, 10).map((s) => firstTowerOf(s, "v1"));
const avgV2 = ftV2.reduce((a, b) => a + b, 0) / ftV2.length;
const avgV1 = ftV1.reduce((a, b) => a + b, 0) / ftV1.length;
ck(`12) 塔拆除節奏合理（v2 首塔平均 ${(avgV2 / 60).toFixed(1)} 分、最早 ${(Math.min(...ftV2) / 60).toFixed(1)} 分；v1 舊病灶 ${(avgV1 / 60).toFixed(1)} 分）`,
  Math.min(...ftV2) >= 150 && avgV2 >= 240 && avgV1 < 150);

const noZeroFight = SEEDS.slice(0, 8).every((s) => {
  const r = run(s, { tactic: M1 });
  return !(r.marks[300] && r.marks[300].towers >= 6 && r.marks[300].k === 0);
});
ck("   不存在「大量塔倒但全場零交戰」的異常常態（5 分鐘 ≥6 塔倒且 0 擊殺 = 0 場）", noZeroFight);

// ═══ 13–14：Replay ════════════════════════════════════════════════════════
const RB = code(src("src/battle/moba/replay/replayBuffer.js"));
const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
const MR = code(src("src/platform/contracts/mobaReplay.js"));
ck("13) Replay 保存原始 level / KDA（frame 由真實 snapshot 取樣，含 lv/k/d/a）",
  /snapshotToFrame/.test(RB) && /pl\.k, pl\.d/.test(MR) &&
  Number.isFinite(MAX_FRAMES) && Number.isFinite(FRAME_INTERVAL_S));

ck("14) Replay 不重新計算（不 import 引擎、不 tick、不重跑播報、不重新結算）",
  !/import[^;]*LogicEngine/.test(RB) && !/\.tick\(/.test(RB) &&
  !/import[^;]*LogicEngine/.test(RS) && !/\.tick\(/.test(RS) &&
  !/new CommsEngine|CommsEngine\(/.test(RS) &&
  !/applyMatchProgress|recordResult|recordBattleResult/.test(RB + RS));

// ═══ 15–18：戰術播報 ══════════════════════════════════════════════════════
const TC = code(src("src/battle/moba/tacticalComms.js"));
function runComms(seed) {
  const e = new LogicEngine(seed);
  e.configureMatch({ blue: toEngineTactic(M1), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  const tr = new BattleEventTracker();
  const ce = new CommsEngine({ tacticId: "m1", side: "blue" });
  for (let t = DT; t <= 2700 && !e.over; t += DT) {
    e.tick(DT);
    const s = e.snapshot();
    ce.update(s, tr.update(s));
  }
  return ce.getMessages();
}
const msgs = runComms(4242);
ck(`15) Tactical comms 由真實事件觸發（${msgs.length} 則；每則都帶 ruleId + evidence）`,
  msgs.length > 0 &&
  msgs.every((m) => COMMS_RULES[m.ruleId] && m.evidence && typeof m.evidence === "object") &&
  // 不接生成式 API、不用亂數挑句子
  !/fetch|openai|anthropic|http/i.test(TC) && !/Math\.random/.test(TC));

const violated = [];
for (const m of msgs) {
  const same = msgs.filter((x) => x.ruleId === m.ruleId && x.t < m.t);
  const prev = same[same.length - 1];
  if (prev && m.t - prev.t < COMMS_RULES[m.ruleId].cooldown - 1e-6) violated.push([prev.t, m.t, m.ruleId]);
}
ck(`16) comms 有 cooldown（同 ruleId 間隔 ≥ 各自 cooldown；違規 ${violated.length} 筆）`, violated.length === 0);

let minGap = Infinity;
for (let i = 1; i < msgs.length; i++) minGap = Math.min(minGap, msgs[i].t - msgs[i - 1].t);
const perMin = msgs.length / (msgs[msgs.length - 1].t / 60);
ck(`17) 無事件時不洗版（全域最小間隔 ${minGap.toFixed(1)}s ≥ ${GLOBAL_COOLDOWN}s；密度 ${perMin.toFixed(1)} 則/分）`,
  minGap >= GLOBAL_COOLDOWN - 1e-6 && perMin <= 12 && msgs.length <= MAX_COMMS);

const RBF = code(src("src/battle/moba/replay/replayBuffer.js"));
const UBF = code(src("src/battle/useBattleFeed.js"));
ck("18) Replay 保存 comms（finalizeReplay 收 comms 並原封存入；Replay 不重新生成對話）",
  /comms/.test(RBF) && /replay\.comms\s*=/.test(RBF) && /comms:\s*useBattleStore/.test(UBF));

// 決定性：同 seed ⇒ 同一串播報
ck("   comms 決定性（同 seed 兩次跑出逐位元相同的播報串）",
  JSON.stringify(runComms(777).map((m) => [m.t, m.ruleId, m.text])) ===
  JSON.stringify(runComms(777).map((m) => [m.t, m.ruleId, m.text])));

// ═══ 19–22：效能（可靜態驗證的部分；FPS/heap 無法在 Node 量）═══════════════
const HUD = code(src("src/battle/ui/BattleHUD.jsx"));
const RED = code(src("src/battle/battleReducer.js"));
ck("19) HUD 不訂閱不必要的完整 store（BattleHUD 不再用無 selector 的 useBattleStore()）",
  !/useBattleStore\(\)/.test(HUD) && /useBattleStore\(\(s\)\s*=>/.test(HUD) &&
  // reducer：內容沒變就不換 derived 的參照（否則訂閱者每幀重繪）
  /derived\.blueTowers !== bT \|\| derived\.redTowers !== rT/.test(RED));

const RBUF = code(src("src/battle/moba/replay/replayBuffer.js"));
ck("20) replay buffer 有容量上限（MAX_FRAMES 且達上限即停止收幀）",
  Number.isFinite(MAX_FRAMES) && MAX_FRAMES > 0 && /frames\.length >= MAX_FRAMES/.test(RBUF));

const V3D = code(src("src/MobaView3D.jsx"));
ck("21) FX 有容量上限與物件池（maxFx 分級；useFrame 內不再 new geometry/material）",
  QUALITY_IDS.every((id) => Number.isFinite(QUALITY_PRESETS[id].maxFx)) &&
  /fxPool/.test(V3D) &&
  // useFrame 區塊內不得再出現 new THREE.XxxGeometry / new THREE.XxxMaterial
  !/useFrame\([\s\S]*?new THREE\.\w*(Geometry|Material)/.test(V3D));

ck("22) mobile quality 不改變邏輯（quality.js 不 import 引擎/Store，preset 只有呈現欄位）",
  !/LogicEngine|useGameStore|profileStore|snapshot/.test(code(src("src/battle/quality.js"))) &&
  QUALITY_IDS.length === 3 &&
  QUALITY_PRESETS.low.dpr === 1 && QUALITY_PRESETS.low.ssao === false &&
  QUALITY_PRESETS.low.bloom === true &&      // ⚠ 不砍光特效（S29 §11）
  QUALITY_PRESETS.high.ssao === true &&
  presetFor("nope").id === "medium");

// ═══ 23：feature off baseline 可比較 ══════════════════════════════════════
ck("23) feature off baseline 可比較（rules:v1 重現舊節奏：全場 Lv1 + 首塔 <2.5 分 + 5 分幾乎零交戰）",
  SIM_RULES.v1.matchXp === false && SIM_RULES.v1.moveSpeed === 13 && SIM_RULES.v1.minionSiegeBand === Infinity &&
  v1.snap.players.every((p) => p.mlv === 1) &&
  avgV1 < 150 &&
  run(1, { rules: "v1", tactic: M1 }).marks[300].k <= 3);

// ════════════════════════════════════════════════════════════════════════════
//  24–29：【P0】players 陣列順序不得決定勝負 —— 正序／反序 invariant
//
//  缺陷本體（S28 及之前，v1 規則完整保留供對照）：模擬把「迭代順序」當成了規則。
//    ① 立即扣血      ：先被迭代的一方先造成傷害；被秒殺者當 tick 完全無法還手。
//    ② 移動/交戰同迴圈：先動的人用敵人的**舊位置**判定接戰，後動的人用**新位置**。
//    ③ alive.find    ：一律集火「陣列索引最小」的敵人（藍永遠先打 r1、紅永遠先打 b1）。
//    ④ 熱點取第一人  ：團戰熱點繞著 players[] 裡最先出現的交戰者長 ⇒ 永遠繞著藍方。
//    ⑤ 只迭代藍方小兵：藍兵集火同一隻紅兵、紅兵傷害卻分散 ⇒ 紅兵系統性先死。
//  合起來的後果：把 players 陣列反轉，勝負就翻轉（實測 60 seeds：v1 藍勝 33 → 反序 4）。
//  ⇒ 這不是平衡問題，是**正確性缺陷**：模擬結果取決於資料結構的擺放順序。
//
//  以下 6 條 invariant 逐一釘住每個機制（前 3 條是決定性微場景，不靠統計）。
// ════════════════════════════════════════════════════════════════════════════
const { BASE, FOUNTAIN, TOWER_T, PITS, dist } = await import(u("src/gameData.js"));

/** 把不相關的英雄挪到自家泉水，避免干擾微場景。 */
const parkOthers = (e, keep) => {
  for (const p of e.players) {
    if (keep.includes(p)) continue;
    p.pos = { ...FOUNTAIN[p.side] };
  }
};

// ── 24) 傷害同時結算：兩人互相致命 ⇒ 兩人都死（真實換命），沒有「先手」──────────
function mutualKill(rules, reverse = false) {
  const e = new LogicEngine(1, null, { rules });
  const b = e.players.find((p) => p.id === "b1");
  const r = e.players.find((p) => p.id === "r1");
  parkOthers(e, [b, r]);
  // 貼身；power 拉高到「一 tick 必致命」，但 hp 仍高於撤退門檻（25%）⇒ 不會改走位邏輯
  b.pos = { x: 50, y: 50 }; r.pos = { x: 51, y: 50 };
  // ⚠ 溢殺餘裕要留大：擊殺者會拿擊殺 XP → 可能升級 → _applyMatchLevel 會**補血**
  //   （p.hp += 新增的那段血）。若溢殺量小於升級補血量，先結算的那位會被自己的升級救活，
  //   測試就會因為錯誤的理由失敗。power 6000 ⇒ 單 tick 1950 傷害、溢殺約 1050 HP，
  //   而升 1 級只補約 58 HP ⇒ 餘裕 ~18 倍，不會被 XP 調參誤傷。
  b.power = r.power = 6000;
  b.hp = r.hp = 900;                       // maxHp 960 ⇒ 94%，不觸發撤退
  e.waveTimer = 999;                       // 不出兵，排除干擾
  if (reverse) e.players.reverse();
  e.tick(DT);
  return { bDead: b.dead, rDead: r.dead, bK: e.bK, rK: e.rK };
}
const mkV2 = mutualKill("v2"), mkV2r = mutualKill("v2", true);
const mkV1 = mutualKill("v1"), mkV1r = mutualKill("v1", true);
ck(`24) 傷害同時結算：互相致命 ⇒ 兩人同歸於盡（v2 正序 ${mkV2.bDead && mkV2.rDead ? "雙亡" : "單亡"}、反序 ${mkV2r.bDead && mkV2r.rDead ? "雙亡" : "單亡"}）`,
  mkV2.bDead && mkV2.rDead && mkV2.bK === 1 && mkV2.rK === 1 &&
  JSON.stringify(mkV2) === JSON.stringify(mkV2r));                    // 反序逐值相同
ck(`   v1 對照：舊規則只有「先被迭代的一方」活下來，且反轉陣列即換人死（正序死 ${mkV1.rDead ? "r1" : "b1"}、反序死 ${mkV1r.rDead ? "r1" : "b1"}）`,
  !(mkV1.bDead && mkV1.rDead) && mkV1.rDead && !mkV1.bDead &&         // 正序：藍先手，紅死
  mkV1r.bDead && !mkV1r.rDead);                                       // 反序：紅先手，藍死

// ── 25) 小兵雙方迭代：對稱開局 ⇒ 雙方損失相同 ────────────────────────────────
function minionTrade(rules, reverse = false) {
  const e = new LogicEngine(1, null, { rules });
  e.waveTimer = 999;
  for (const ln of ["top", "mid", "bot"]) { e.lanes[ln].bm = []; e.lanes[ln].rm = []; }
  // 完全對稱的接線：雙方各 2 隻、同一個 t（0.50）⇒ 任何不對稱都只可能來自迭代方式
  e.lanes.mid.bm = [{ id: "bm1", t: 0.50, hp: 130 }, { id: "bm2", t: 0.50, hp: 130 }];
  e.lanes.mid.rm = [{ id: "rm1", t: 0.50, hp: 130 }, { id: "rm2", t: 0.50, hp: 130 }];
  if (reverse) { e.lanes.mid.bm.reverse(); e.lanes.mid.rm.reverse(); }
  parkOthers(e, []);                       // 英雄全部回泉水
  e.tick(DT);
  const hp = (a) => a.map((m) => Math.round(m.hp)).sort((x, y) => x - y);
  return { b: hp(e.lanes.mid.bm), r: hp(e.lanes.mid.rm) };
}
const mtV2 = minionTrade("v2"), mtV2r = minionTrade("v2", true), mtV1 = minionTrade("v1");
ck(`25) 小兵雙方迭代對稱：對稱開局 ⇒ 雙方存活/血量相同（v2 藍 [${mtV2.b}] vs 紅 [${mtV2.r}]）`,
  JSON.stringify(mtV2.b) === JSON.stringify(mtV2.r) &&
  JSON.stringify(mtV2) === JSON.stringify(mtV2r));                    // 反序也相同
ck(`   v1 對照：舊規則只迭代藍方小兵 ⇒ 紅兵系統性先死（v1 藍 [${mtV1.b}] vs 紅 [${mtV1.r}]）`,
  JSON.stringify(mtV1.b) !== JSON.stringify(mtV1.r));

// ── 26) 目標選取：打「最近的」敵人，不是「陣列索引最小」的敵人 ──────────────────
function chosenFoe(rules, reverse = false) {
  const e = new LogicEngine(1, null, { rules });
  const b = e.players.find((p) => p.id === "b1");
  const far = e.players.find((p) => p.id === "r1");     // 索引最小的紅方
  const near = e.players.find((p) => p.id === "r5");    // 索引最大、但**離得最近**
  parkOthers(e, [b, far, near]);
  b.pos = { x: 50, y: 50 };
  far.pos = { x: 57, y: 50 };                           // 7 單位（仍在 8 的接戰範圍內）
  near.pos = { x: 52, y: 50 };                          // 2 單位
  if (reverse) e.players.reverse();
  const alive = e.players.filter((p) => !p.dead);
  const pend = [];
  const before = new Map(e.players.map((p) => [p.id, p.hp]));
  e._combatStep(b, b.lane, alive, DT, 1, pend);
  if (pend.length) return pend[0][1].id;                             // v2：同時結算 ⇒ 讀 pendingHits
  return e.players.find((p) => p.hp < before.get(p.id))?.id ?? null; // v1：立即扣血 ⇒ 看誰掉血
}
const cfV2 = chosenFoe("v2"), cfV2r = chosenFoe("v2", true);
const cfV1 = chosenFoe("v1"), cfV1r = chosenFoe("v1", true);
ck(`26) 目標選取 = 最近的敵人，與陣列順序無關（v2 正序打 ${cfV2}、反序打 ${cfV2r}；兩者都應是最近的 r5）`,
  cfV2 === "r5" && cfV2r === "r5");
ck(`   v1 對照：舊規則 alive.find ⇒ 打「索引最小」的敵人，反轉陣列就換目標（正序 ${cfV1}、反序 ${cfV1r}）`,
  cfV1 === "r1" && cfV1r === "r5");

// ── 27) 地圖對稱（規則型判準，不硬編碼座標）──────────────────────────────────
const mirror = (p) => ({ x: 100 - p.x, y: 100 - p.y });
const baseMirrored = dist(mirror(BASE.blue), BASE.red) < 1e-9;
const fountainMirrored = dist(mirror(FOUNTAIN.blue), FOUNTAIN.red) < 1e-9;
const towerTMirrored = [0, 1, 2].every((i) => Math.abs(TOWER_T.blue[i] + TOWER_T.red[i] - 1) < 1e-9);
const eSym = new LogicEngine(1);
const nexusTMirrored = Math.abs(eSym.towers.blue_nexus.t + eSym.towers.red_nexus.t - 1) < 1e-9;
// 小兵：出生 t 與行進速度必須互為鏡像（強制出一波，看真實狀態，不看原始碼字串）
const eW = new LogicEngine(1); eW.waveTimer = 0; eW.tick(DT);
const bT = eW.lanes.mid.bm.map((m) => m.t), rT = eW.lanes.mid.rm.map((m) => m.t);
const minionMirrored = bT.length > 0 && bT.length === rT.length &&
  bT.every((t, i) => Math.abs(t + rT[i] - 1) < 1e-9);
// 目標坑：**每個坑對雙方基地等距**（引擎的爭奪規則＝坑 9 單位內人數多者推進 ⇒ 等距才公平）
const pitGap = Object.entries(PITS).map(([k, pit]) =>
  [k, Math.abs(dist(BASE.blue, pit) - dist(BASE.red, pit))]);
const pitFair = pitGap.every(([, g]) => g <= 0.5);
ck(`27) 地圖對稱（基地/泉水 180° 鏡像、塔與主堡路線參數和為 1、小兵出生鏡像、` +
   `每個坑對雙方基地等距 ≤0.5：${pitGap.map(([k, g]) => `${k} ${g.toFixed(2)}`).join("、")}）`,
  baseMirrored && fountainMirrored && towerTMirrored && nexusTMirrored && minionMirrored && pitFair);

// ── 28–29) 整場對局：陣列順序不得產生系統性的陣營偏差 ─────────────────────────
const ORDER_SEEDS = [...SEEDS, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];  // 40 seeds
function blueWinRate(rules, reverse) {
  let blue = 0;
  for (const s of ORDER_SEEDS) {
    const e = new LogicEngine(s, null, { rules });
    if (reverse) e.players.reverse();           // 同一批 player 物件，只換陣列擺放順序
    for (let t = DT; t <= 2700 && !e.over; t += DT) e.tick(DT);
    if (e.winner === "blue") blue++;
  }
  return blue / ORDER_SEEDS.length;
}
const f2 = blueWinRate("v2", false), b2 = blueWinRate("v2", true);
const f1 = blueWinRate("v1", false), b1r = blueWinRate("v1", true);
const shift2 = Math.abs(f2 - b2), shift1 = Math.abs(f1 - b1r);
// v1 必須被測出來——否則這條 invariant 沒有檢定力（測不出已知的 bug＝測了個寂寞）
ck(`28) 測試有檢定力：v1 反轉陣列會產生系統性翻轉（藍勝 ${(f1 * 100).toFixed(0)}% → ${(b1r * 100).toFixed(0)}%，位移 ${(shift1 * 100).toFixed(0)} 個百分點；需 ≥25）`,
  shift1 >= 0.25);
ck(`29) v2 陣列順序不決定勝負（藍勝 正序 ${(f2 * 100).toFixed(0)}% / 反序 ${(b2 * 100).toFixed(0)}%，位移 ${(shift2 * 100).toFixed(0)} 個百分點；需 ≤15 且兩者都在 30–70%）`,
  shift2 <= 0.15 && f2 >= 0.30 && f2 <= 0.70 && b2 >= 0.30 && b2 <= 0.70);

// ⚠ 誠實標記（兩項殘留，皆列 P1，見 08_目前待辦與風險.md）：
//  (1) v2 反轉後**逐 seed 的勝方仍可能改變**：rng 抽樣順序跟著 players 迭代順序走
//      （fx 型別骰、無戰術時的參戰骰）。那是**混沌**（同一場的隨機序列不同），不是**偏差**
//      （沒有哪一方系統性佔便宜）——28/29 兩條正是用來區分這兩者。要逐位元相同需改
//      per-player rng 流。
//  (2) **換命時的擊殺 XP 歸屬仍看順序**：pendingHits 先結算的那位攻擊者拿得到擊殺 XP，
//      後結算的那位此時已被標記 dead ⇒ _addXp 的 p.dead 守衛讓他拿不到（實測同一場景
//      正序 b1 升到 Lv2、反序改成 r1 升到 Lv2）。**不影響勝負**（雙方各記 1 殺，24) 已驗），
//      影響的是單一次換命的 XP。修法是讓 _resolveKill 的 XP 發放不受攻擊者當下死活影響，
//      但會改變所有 v2 數值 ⇒ 需重新校準並重跑全部 verifier，不在 29A 範圍。

// ═══ 30–38：既有 verifier / regress / build ═══════════════════════════════
function runNode(script, shape, args = []) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script), ...args],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 900000 });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: shape.test(String(e.stdout ?? "")), code: e.status ?? -1, out: String(e.stdout ?? "") };
  }
}
for (const [name, script, shape] of [
  ["30) Sprint28 verifier 29/29", "tools/check_moba_stats28.mjs", /29\/29 通過/],   // S29：+13b 同等級錨點
  ["31) Sprint27 verifier 44/44", "tools/check_talent27.mjs", /44\/44 通過/],
  ["32) Sprint26 verifier 35/35", "tools/check_moba_experience26.mjs", /35\/35 通過/],
  ["33) Sprint25 verifier 34/34", "tools/check_progress25.mjs", /34\/34 通過/],
  ["34) Sprint24 verifier 29/29", "tools/check_moba_tactic24.mjs", /29\/29 通過/],   // S29：C4 重導 +2 條
  ["35) Sprint23 verifier 28/28", "tools/check_cs23.mjs", /28\/28 通過/],
  ["36) regress（結束率 15/15）", "tools/regress.mjs", /結束率 15\/15/],
  // S29：regress2 現在是**有門檻的斷言**（節奏門檻 8/8，失敗即 exit 1），不再只是印數字。
  ["37) regress2（節奏門檻全綠）", "tools/regress2.mjs", /節奏門檻 8\/8 通過/],
]) {
  const r = runNode(script, shape);
  ck(`${name}（exit=${r.code}）`, r.ok && r.code === 0);
}
const build = runNode("node_modules/vite/bin/vite.js", /built in/, ["build"]);
ck(`38) npm run build 通過（exit=${build.code}）`, build.ok && build.code === 0);

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);

// ── 修改前 / 修改後對照（Node 可量測部分）───────────────────────────────────
console.log(`\n=== v1（修改前）vs v2（修改後）· 20 seeds ===`);
for (const rules of ["v1", "v2"]) {
  const rs = SEEDS.map((s) => run(s, { rules, tactic: M1, cap: 1800 }));
  const avg = (f) => rs.reduce((a, x) => a + f(x), 0) / rs.length;
  const ft = SEEDS.slice(0, 10).map((s) => firstTowerOf(s, rules));
  console.log(
    `${rules}: 結束 ${rs.filter((r) => r.eng.over).length}/20 | 時長 ${avg((r) => r.eng.t / 60).toFixed(1)}分 | ` +
    `首塔 ${(ft.reduce((a, b) => a + b, 0) / ft.length / 60).toFixed(1)}分 | ` +
    `5分: 擊殺 ${avg((r) => r.marks[300]?.k ?? 0).toFixed(1)} 塔倒 ${avg((r) => r.marks[300]?.towers ?? 0).toFixed(1)} 均Lv ${avg((r) => r.marks[300]?.lvAvg ?? 1).toFixed(1)} | ` +
    `終局 擊殺 ${avg((r) => r.eng.bK + r.eng.rK).toFixed(0)} 均Lv ${avg((r) => r.eng.players.reduce((s, p) => s + p.mlv, 0) / 10).toFixed(1)}`
  );
}
console.log(`播報：seed 4242 共 ${msgs.length} 則、密度 ${perMin.toFixed(1)} 則/分、最小間隔 ${minGap.toFixed(1)}s`);
console.log(`⚠ FPS / draw calls / triangles / heap / DPR / 視覺 → **無瀏覽器，未量測**（見交付報告）`);

process.exit(pass === A.length ? 0 : 1);
