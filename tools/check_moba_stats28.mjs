// ============================================================================
//  Sprint28 MOBA 選手能力注入驗證：repo 根目錄執行 `node tools/check_moba_stats28.mjs`
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//
//  核心命題（逐項驗證，不靠宣稱）：
//    · 天賦 → derived stats → adapter → mods → LogicEngine 真的改變對戰行為
//    · 但 **不碰** power / tough / winner / 獎勵（無傷害、無勝率、無金錢係數）
//    · feature off / 中性能力 ⇒ 逐位元回到 S27 baseline
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const A = [];
const ck = (n, c) => A.push([n, !!c]);
/** 原始碼掃描前先剝掉註解——否則「禁止 winRate」這句註解本身會被判成違規。 */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const r2 = (v) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;   // = mobaReplay.round2

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { buildPlayerStatSlots, ENGINE_SLOT_IDS, buildEngineSlots } = await import(u("src/battle/moba/mobaRosterAdapter.js"));
const { toEnginePlayerMods, toPlayerMods, NEUTRAL_MODS, NEUTRAL_STAT, STAT_MAP, MOBA_PLAYER_STATS_VERSION } =
  await import(u("src/battle/moba/mobaPlayerStats.js"));
const { getPlayerDerivedStats } = await import(u("src/platform/talents/playerDerivedStats.js"));
const { INITIAL_PLAYERS } = await import(u("src/data/players.js"));
const { STAT_DEF } = await import(u("src/data/playerModel.js"));
const { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTICS, MOBA_TACTIC_VERSION } =
  await import(u("src/platform/contracts/MobaTacticConfig.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { mobaResultToTransaction } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { toFpsRoster } = await import(u("src/battle/fps/fpsRoster.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } =
  await import(u("src/battle/moba/replay/replayBuffer.js"));

const STAT_KEYS = STAT_DEF.map((s) => s.key);
const DT = 0.5;                                  // = useLocalServer DT_SIM
const M1 = MOBA_TACTICS[0];
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271];

// ── fixtures ────────────────────────────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE5 = clone(INITIAL_PLAYERS);            // 真實種子名單（id = b1–b5）
const RANKS = {
  op:     { operation_1: 3, operation_2: 3, operation_3: 3 },   // rxn+3 acc+3 apm+6 pos+6
  tac:    { tactics_1: 3, tactics_2: 3, tactics_3: 3 },         // vis+3 tac+3 dec+6 adp+6
  mental: { mental_1: 3, mental_2: 3, mental_3: 3 },            // str+3 foc+3 cou+6 res+6
  team:   { team_1: 3, team_2: 3, team_3: 3 },                  // com+3 coo+3 led+6 lrn+6
};
const withTalent = (players, id, ranks) =>
  players.map((p) => (p.id === id ? { ...p, talents: { ranks, spentPoints: 0, updatedAt: null } } : p));
const modsOf = (players) => toEnginePlayerMods({ blue: buildPlayerStatSlots(players, "blue"), red: [] });
const neutral5 = () => ["b1", "b2", "b3", "b4", "b5"].map((id) => ({
  id, name: "N" + id, role: "中路", status: "主力",
  stats: Object.fromEntries(STAT_KEYS.map((k) => [k, NEUTRAL_STAT])),
}));

/** 跑完整一場；回傳 { snap, eng }。mods=null ⇒ 不呼叫 configurePlayers（feature off）。 */
function run(seed, { mods = null, tactic = null } = {}) {
  const eng = new LogicEngine(seed);
  if (mods) eng.configurePlayers(mods);                        // ⚠ 必須在 configureMatch 之前
  if (tactic) eng.configureMatch({
    blue: toEngineTactic(tactic), red: toEngineTactic(STANDARD_OPP_TACTIC),
    meta: { tacticId: tactic.tacticId, tacticName: tactic.name, version: MOBA_TACTIC_VERSION, opponentTacticId: STANDARD_OPP_TACTIC.tacticId },
  });
  for (let t = DT; t <= 1800 && !eng.over; t += DT) eng.tick(DT);
  return { snap: eng.snapshot(), eng };
}
/** 剝掉 S28 新增的 gated 欄位 → 用來證明「其餘一切逐位元相同」。 */
const strip = (s) => { const { playerStatsMeta, playerStatsExec, ...rest } = s; return rest; };
/** 行為指紋：只取「行為」欄位（不含 power/tough——那本來就不該變）。 */
const fingerprint = (s) => JSON.stringify([
  s.bK, s.rK, s.winner, s.ts, s.tacticExec ?? null,
  s.players.map((p) => [p.id, p.k, p.d, p.a, p.state]),
  s.playerStatsExec ?? null,
]);

// ═══ 1–6：Adapter（derived stats / 安全降級 / playerId 對位）═══════════════
const talented = withTalent(BASE5, "b3", RANKS.op);
const slotsT = buildPlayerStatSlots(talented, "blue");
const b3T = slotsT.find((s) => s.id === "b3");
const b3Base = BASE5.find((p) => p.id === "b3");

ck("1) mobaRosterAdapter 使用 derived stats（天賦加成真的進 slot）",
  b3T.stats.reflex === b3Base.stats.reflex + 3 && b3T.stats.apm === b3Base.stats.apm + 6 &&
  b3T.stats.positioning === b3Base.stats.positioning + 6 &&
  JSON.stringify(b3T.stats) === JSON.stringify(getPlayerDerivedStats(talented.find((p) => p.id === "b3"))));

ck("2) base stats 不被修改（天賦只走 derived 層）",
  JSON.stringify(talented.find((p) => p.id === "b3").stats) === JSON.stringify(b3Base.stats) &&
  JSON.stringify(BASE5) === JSON.stringify(clone(INITIAL_PLAYERS)));

const noTalentState = BASE5.map((p) => { const q = { ...p }; delete q.talents; return q; });
ck("3) 無 talent state ⇒ 安全降級（derived === base，逐鍵相等）",
  buildPlayerStatSlots(noTalentState, "blue").every((s) => {
    const base = BASE5.find((p) => p.id === s.id).stats;
    return STAT_KEYS.every((k) => s.stats[k] === base[k]);
  }));

ck("4) 缺 player ⇒ 安全失敗（不丟例外、不虛構選手）",
  buildPlayerStatSlots(null, "blue").length === 0 &&
  buildPlayerStatSlots(undefined, "blue").length === 0 &&
  buildPlayerStatSlots([], "blue").length === 0 &&
  buildPlayerStatSlots([null, {}, { id: "zz" }], "blue").length === 0 &&
  toEnginePlayerMods({ blue: [], red: [] }) === null &&
  toEnginePlayerMods({}) === null);

const shuffled = [...BASE5].reverse();
const recruit = [...BASE5, { id: "r" + Date.now(), name: "新秀", stats: b3Base.stats }];
const renamed = BASE5.map((p) => ({ ...p, name: "改名" + p.id }));   // 改名不得影響對位
ck("5) playerId 對應穩定（id 對位；非名字、非陣列索引；順序無關；新秀不誤入席位）",
  slotsT.every((s) => s.id === s.playerId && ENGINE_SLOT_IDS.blue.includes(s.id)) &&
  // 打亂 profileStore 順序 ⇒ slots 仍依 ENGINE_SLOT_IDS 排序、mods 逐鍵相同（非索引對位）
  JSON.stringify(buildPlayerStatSlots(shuffled, "blue").map((s) => s.id)) === JSON.stringify(ENGINE_SLOT_IDS.blue) &&
  JSON.stringify(modsOf(shuffled)) === JSON.stringify(modsOf(BASE5)) &&
  JSON.stringify(modsOf(renamed)) === JSON.stringify(modsOf(BASE5)) &&
  buildPlayerStatSlots(recruit, "blue").length === 5 &&
  !buildPlayerStatSlots(recruit, "blue").some((s) => s.id.startsWith("r")));

const modsA = modsOf(BASE5);
ck("6) match config 帶入 roster（mods 封包含版本與對位證據）",
  modsA.meta.version === MOBA_PLAYER_STATS_VERSION &&
  JSON.stringify(modsA.meta.blueIds) === JSON.stringify(ENGINE_SLOT_IDS.blue) &&
  modsA.meta.redIds.length === 0 && modsA.meta.neutralStat === NEUTRAL_STAT);

// ═══ 7–9：LogicEngine 收到 roster ／ baseline 保證 ═════════════════════════
const rOff = run(4242, { tactic: M1 });                       // feature off（S27 行為）
const rOn = run(4242, { mods: modsA, tactic: M1 });
ck("7) LogicEngine 收到 roster（playerStatsOn / pmod / snapshot meta）",
  rOn.eng.playerStatsOn === true &&
  ENGINE_SLOT_IDS.blue.every((id) => rOn.eng.pmod[id]) &&
  rOn.snap.playerStatsMeta.version === MOBA_PLAYER_STATS_VERSION &&
  Object.keys(rOn.snap.playerStatsExec).length === 10);

const rOffNoTac = run(777).snap;
ck("8) feature off ⇒ baseline 不變（snapshot 不含 S28 欄位；同 seed 逐位元一致）",
  rOff.eng.playerStatsOn === false &&
  !("playerStatsMeta" in rOffNoTac) && !("playerStatsExec" in rOffNoTac) &&
  !("playerStatsMeta" in rOff.snap) && !("playerStatsExec" in rOff.snap) &&
  JSON.stringify(run(777).snap) === JSON.stringify(rOffNoTac));

const NEUT_MODS = modsOf(neutral5());
const neutralIsNeutral = ENGINE_SLOT_IDS.blue.every(
  (id) => JSON.stringify(NEUT_MODS.blue[id]) === JSON.stringify(NEUTRAL_MODS));
const neutBaseline = SEEDS.slice(0, 6).every((s) => {
  const off = run(s, { tactic: M1 }).snap;
  const neu = run(s, { mods: NEUT_MODS, tactic: M1 }).snap;
  const offNoTac = run(s).snap;
  const neuNoTac = run(s, { mods: NEUT_MODS }).snap;
  return JSON.stringify(strip(neu)) === JSON.stringify(off) &&
         JSON.stringify(strip(neuNoTac)) === JSON.stringify(offNoTac);
});
ck("9) 中性能力（全 70）⇒ mods 全中性，且 6 seed 逐位元 == feature off（含/不含戰術）",
  neutralIsNeutral && neutBaseline);

// ═══ 10–11：derived stats 真的改變引擎輸入與行為 ═══════════════════════════
const modsB = modsOf(withTalent(BASE5, "b3", RANKS.op));      // 操作
const modsC = modsOf(withTalent(BASE5, "b3", RANKS.tac));     // 戰術
const modsD = modsOf(withTalent(BASE5, "b3", RANKS.team));    // 團隊
ck("10) derived stats 改變引擎輸入（A/B/C/D 的 b3 mods 兩兩不同；其餘席位不變）",
  JSON.stringify(modsA.blue.b3) !== JSON.stringify(modsB.blue.b3) &&
  JSON.stringify(modsA.blue.b3) !== JSON.stringify(modsC.blue.b3) &&
  JSON.stringify(modsB.blue.b3) !== JSON.stringify(modsC.blue.b3) &&
  JSON.stringify(modsA.blue.b1) === JSON.stringify(modsB.blue.b1) &&
  // 團隊天賦（領導力）⇒ 隊伍層級項 ⇒ 隊友的 joinAdj/objAdj 也會動（這是設計）
  JSON.stringify(modsA.blue.b1) !== JSON.stringify(modsD.blue.b1));

const diffSeeds = (m1, m2) => SEEDS.filter((s) =>
  fingerprint(run(s, { mods: m1, tactic: M1 }).snap) !== fingerprint(run(s, { mods: m2, tactic: M1 }).snap));
const dB = diffSeeds(modsA, modsB), dC = diffSeeds(modsA, modsC), dD = diffSeeds(modsA, modsD);
ck(`11) 多 seed 行為輸出改變（B ${dB.length}/${SEEDS.length}、C ${dC.length}/${SEEDS.length}、D ${dD.length}/${SEEDS.length} seed 行為不同）`,
  dB.length > 0 && dC.length > 0 && dD.length > 0);

// ═══ 12–13：紅線（不寫 winner、不偷渡傷害/勝率欄位）═══════════════════════
const ENG_SRC = code(src("src/LogicEngine.js"));
const MPS_SRC = code(src("src/battle/moba/mobaPlayerStats.js"));
// winner 只有 3 處賦值：constructor 的 null 初始化 ＋ 兩座主堡血量歸零。能力層不碰 winner。
const winnerWrites = (ENG_SRC.match(/this\.winner\s*=/g) ?? []).length;
const winnerDecided = (ENG_SRC.match(/this\.winner\s*=\s*"(blue|red)"/g) ?? []).length;
ck("12) 不直接寫 winner（勝負只由主堡血量歸零決定；能力層完全不碰 winner）",
  winnerWrites === 3 && winnerDecided === 2 &&
  /towers\.blue_nexus\.hp <= 0[^\n]*this\.winner = "red"/.test(ENG_SRC) &&
  /towers\.red_nexus\.hp <= 0[^\n]*this\.winner = "blue"/.test(ENG_SRC) &&
  !/winner|over\s*=/.test(MPS_SRC));

const ALLOWED = ["retreatAdj", "returnAdj", "joinAdj", "objAdj", "laneAdj",
  "gankIntervalScale", "gankWindowScale", "roamAdj", "splitAdj", "invadeAdj"];
const modKeysOk = Object.values(modsB.blue).every(
  (m) => Object.keys(m).length === ALLOWED.length && Object.keys(m).every((k) => ALLOWED.includes(k)));
const rA = run(4242, { mods: modsA, tactic: M1 }), rD = run(4242, { mods: modsD, tactic: M1 });
const powerOf = (e) => JSON.stringify(e.players.map((p) => [p.id, p.power, p.tough, p.maxHp]));
ck("13) 無 winRate/damageMultiplier 偷渡欄位（mods 只有 10 個行為鍵；power/tough/maxHp 不受天賦影響）",
  modKeysOk &&
  !/(winRate|winProbBonus|damageMult|dmgMult|goldMult|powerMult|toughMult)/.test(MPS_SRC) &&
  powerOf(rA.eng) === powerOf(rD.eng) &&
  powerOf(rA.eng) === powerOf(run(4242, { tactic: M1 }).eng) &&
  Object.keys(STAT_MAP).every((k) => ALLOWED.includes(k)));

// ═══ 14–15：角色公平性（Support / Jungle 必須有可觀察作用）════════════════
const supBehav = (m, s) => { const x = run(s, { mods: m, tactic: M1 }).snap;
  return JSON.stringify([x.tacticExec.blue.supportRoams, x.tacticExec.blue.groupedFights, x.playerStatsExec.b5]); };
const supMods = modsOf(withTalent(BASE5, "b5", RANKS.team));
const supDiff = SEEDS.filter((s) => supBehav(modsA, s) !== supBehav(supMods, s));
ck(`14) Support（b5）天賦有可觀察作用（遊走/集結/個人行為：${supDiff.length}/${SEEDS.length} seed 不同）`,
  supDiff.length > 0);

const jgBehav = (m, s) => { const x = run(s, { mods: m, tactic: M1 }).snap; const e = x.tacticExec.blue;
  return JSON.stringify([e.topGanks, e.midGanks, e.botGanks, e.gankKills, e.invadeAttempts, x.playerStatsExec.b2]); };
const jgMods = modsOf(withTalent(BASE5, "b2", RANKS.tac));
const jgDiff = SEEDS.filter((s) => jgBehav(modsA, s) !== jgBehav(jgMods, s));
ck(`15) Jungle（b2）天賦有可觀察作用（Gank 節奏/入侵/個人行為：${jgDiff.length}/${SEEDS.length} seed 不同）`,
  jgDiff.length > 0);

// 五路全覆蓋（§7）：每一路都至少有一個作用點會動
const laneCover = ["b1", "b2", "b3", "b4", "b5"].every((id) => {
  const m = modsOf(withTalent(BASE5, id, RANKS.mental));
  return JSON.stringify(m.blue[id]) !== JSON.stringify(modsA.blue[id]);
});
ck("   五路（top/jungle/mid/adc/sup）皆有能力作用點（心理天賦皆改變 mods）", laneCover);

// ═══ 16–18：Replay / Result / Progress 回歸 ═══════════════════════════════
const RB_SRC = code(src("src/battle/moba/replay/replayBuffer.js"));
const RS_SRC = code(src("src/screens/moba/MobaReplayScreen.jsx"));
// 跑一場「有天賦」的真實比賽並同步擷取重播；只保留精簡位置指紋（不囤 snapshot）。
clearReplay();
beginReplayCapture({ seed: 4242, config: { tacticId: M1.tacticId } });
const engR = new LogicEngine(4242);
engR.configurePlayers(modsB);       // ⚠ 先 configurePlayers 再 configureMatch
engR.configureMatch({ blue: toEngineTactic(M1), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
const truthAtT = new Map();         // round2(ts) → 該 tick 的真實位置指紋
for (let t = DT; t <= 1800 && !engR.over; t += DT) {
  engR.tick(DT);
  const s = engR.snapshot();
  truthAtT.set(r2(s.ts), JSON.stringify(s.players.map((p) => [r2(p.pos.x), r2(p.pos.y)])));
  captureReplayFrame(s);
}
const rep = finalizeReplay({ matchId: "m_test28", events: [], resultSummary: { winner: engR.winner }, tacticMeta: null });
// 每一個 replay frame 的位置，都必須等於「那個 tick 實際跑出來的位置」（frame 形狀 = {t, p:[[x,y,...]]}）
const framesAreReal = rep.frames.length > 0 && rep.frames.every((f) =>
  truthAtT.has(f.t) && JSON.stringify(f.p.map((a) => [a[0], a[1]])) === truthAtT.get(f.t));
ck(`16) Replay frames 來自實際比賽（${rep.frames.length} 幀逐幀位置 == 該 tick 真實 snapshot，非重新模擬）`,
  framesAreReal && !/import[^;]*LogicEngine/.test(RB_SRC) && !/\.tick\(/.test(RB_SRC));

ck("17) Replay 不重複結算（replay 模組不 import 引擎、不呼叫發獎/入史/寫 Store）",
  !/applyMatchProgress|recordCsMatch|recordResult|recordBattleResult|purchasePlayerTalent/.test(RB_SRC) &&
  !/import[^;]*LogicEngine/.test(RS_SRC) &&
  !/\.tick\(|applyMatchProgress|recordResult/.test(RS_SRC));

const brStats = snapshotToBattleResult(run(4242, { mods: modsB, tactic: M1 }).snap, []);
const tx = mobaResultToTransaction(brStats, { players: BASE5, streak: 0, fansNow: 1000 });
const st0 = { players: clone(BASE5), finance: { funds: 0 }, meta: { fans: 0, reputation: 0 }, processedMatchTransactions: {} };
const a1 = applyProgressToState(st0, tx);
const a2 = applyProgressToState(a1.nextState, tx);
ck("18) Progress 冪等不受影響（同 tx 二次套用 ⇒ alreadyApplied，不重複發獎）",
  brStats.schema === "BattleResult.v2" && !!tx && tx.playerProgress.length === 5 &&
  tx.playerProgress.every((pp) => ENGINE_SLOT_IDS.blue.includes(pp.playerId)) &&
  !!a1.nextState && a2.nextState === null && a2.receipt.alreadyApplied === true);

// ═══ 19：CS 不受影響 ═══════════════════════════════════════════════════════
const FPS_SRC = code(src("src/battle/fps/fpsRoster.js"));
const fpsT = toFpsRoster(withTalent(BASE5, "b3", RANKS.op));
const fpsA = toFpsRoster(BASE5);
ck("19) CS derived stats 不受影響（fpsRoster 仍走 getPlayerDerivedStats，天賦照樣生效）",
  /getPlayerDerivedStats/.test(FPS_SRC) &&
  fpsT.find((x) => x._gid === "b3").stats.rxn === fpsA.find((x) => x._gid === "b3").stats.rxn + 3 &&
  fpsT.find((x) => x._gid === "b3").stats.apm === fpsA.find((x) => x._gid === "b3").stats.apm + 6 &&
  fpsT.find((x) => x._gid === "b1").stats.rxn === fpsA.find((x) => x._gid === "b1").stats.rxn);

// ═══ 20–27：既有 verifier / regress / build 全綠 ══════════════════════════
function runNode(script, shape, args = []) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script), ...args],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: shape.test(String(e.stdout ?? "")), code: e.status ?? -1, out: String(e.stdout ?? "") };
  }
}
for (const [name, script, shape] of [
  ["20) Sprint27 verifier 44/44", "tools/check_talent27.mjs", /44\/44 通過/],
  ["21) Sprint26 verifier 35/35", "tools/check_moba_experience26.mjs", /35\/35 通過/],
  ["22) Sprint25 verifier 34/34", "tools/check_progress25.mjs", /34\/34 通過/],
  ["23) Sprint24 verifier 27/27", "tools/check_moba_tactic24.mjs", /27\/27 通過/],
  ["24) Sprint23 verifier 28/28", "tools/check_cs23.mjs", /28\/28 通過/],
  ["25) regress（結束率 15/15）", "tools/regress.mjs", /結束率 15\/15/],
  ["26) regress2（達標 19/20）", "tools/regress2.mjs", /達標 19\/20/],
]) {
  const r = runNode(script, shape);
  ck(`${name}（exit=${r.code}）`, r.ok && r.code === 0);
}
const build = runNode("node_modules/vite/bin/vite.js", /built in/, ["build"]);
ck(`27) npm run build 通過（exit=${build.code}）`, build.ok && build.code === 0);

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);

// ── 固定 seed 比較表（§6 可觀察證據；同 seed / 同英雄 / 同戰術 / 同 roster，只改 b3 天賦）──
console.log(`\n=== 固定比較 seed=4242、戰術 ${M1.name}、只改 b3 天賦 ===`);
const row = (label, m) => {
  const x = run(4242, { mods: m, tactic: M1 }).snap;
  const e = x.tacticExec.blue, pe = x.playerStatsExec.b3;
  const p3 = x.players.find((p) => p.id === "b3");
  console.log(`${label} b3 mods{join ${m.blue.b3.joinAdj.toFixed(3)} obj ${m.blue.b3.objAdj.toFixed(3)} retreat ${m.blue.b3.retreatAdj.toFixed(3)} lane ${m.blue.b3.laneAdj.toFixed(3)}}` +
    ` │ KDA ${p3.k}/${p3.d}/${p3.a} 撤退 ${pe.retreats} 團戰 ${pe.fights} 目標 ${pe.objTicks}` +
    ` │ 隊 會戰 ${e.groupedFights} 分推 ${e.splitPushActions} 龍爭 ${e.dragonContests} │ ${x.winner} ${x.bK}:${x.rK}`);
};
row("A 無天賦  ", modsA);
row("B 操作天賦", modsB);
row("C 戰術天賦", modsC);
row("D 團隊天賦", modsD);
console.log(`多 seed 行為差異：B ${dB.length}/${SEEDS.length}、C ${dC.length}/${SEEDS.length}、D ${dD.length}/${SEEDS.length} seed（Support ${supDiff.length}、Jungle ${jgDiff.length}）`);

process.exit(pass === A.length ? 0 : 1);
