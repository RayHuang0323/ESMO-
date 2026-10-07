#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_tactical_ai_p2.mjs — Tactical AI Phase 2（moba-sim.v20）gate
//
//  ① Combat Intent：ALLIN／TRADE／POKE／KITE 由同一份情境決定、風險傾向改變門檻、殘血劣勢不開、Trade 有退開段
//  ② 兵線優先：身邊有敵兵 ⇒ 兵線未處理；救人／夾擊／物件／呼叫可打斷
//  ③ Team Call：發出、回應、拒絕；溝通／配合高的人回應較多；收不到超出距離的呼叫（非全圖）
//  ④ Gank 評分選路（看不到人就不出發）、追擊先估擊殺
//  ⑤ 物件雙評估、懲戒在物件不迫近時可清野
//  整場：決定性、對照（同一棵樹關掉 v20 開關 ≈ v19）——判準是方向，不是絕對值。
//  執行：ESMO_BALANCE_SKILLS=on ESMO_BALANCE_TALENTS=on node tools/check_moba_tactical_ai_p2.mjs
// ============================================================================
import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = process.cwd();
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
process.env.ESMO_BALANCE_SKILLS ??= "on";
process.env.ESMO_BALANCE_TALENTS ??= "on";
const { LogicEngine } = await imp("src/LogicEngine.js");
const { rulesFor } = await imp("src/battle/moba/matchProgression.js");
const PS = await imp("src/battle/moba/mobaPlayerStats.js");
const Runner = await imp("tools/balance/moba_items_balance_runner.mjs");
const M = await Runner.modules();

const A = [];
const ck = (name, ok, detail = "") => A.push([name, !!ok, detail]);
const V20_FLAGS = ["combatIntentV20", "waveFirstV20", "teamCallV20", "gankScoreV20", "chaseKillableV20", "objectiveEvalV20", "smiteCampV20"];
const R3 = rulesFor("v3");
ck("R0 v3 正式規則集開啟全部 Phase 2 旗標", V20_FLAGS.every((k) => R3[k] === true), V20_FLAGS.filter((k) => R3[k] !== true).join(","));

// ── ① Combat Intent（直接餵情境）───────────────────────────────────────────────
{
  const e = new LogicEngine(3);
  const p = e.players.find((q) => q.id === "b1"), t = e.players.find((q) => q.id === "r1");
  p.pos = { x: 150, y: 150 }; t.pos = { x: 154, y: 150 };
  const base = { alliesN: 1, foesN: 1, enemyAwareness: [{ q: t, d: 4 }], allies: [p], inTowerRisk: false, hasWave: false, towerDefenders: 0, enemyTower: null, action: "ENGAGE" };
  const at = (score, extra = {}) => e._combatIntentV20(p, t, { ...base, score, ...extra });
  const ladder = [1.2, 0.5, 0.15, -0.3].map((s) => at(s));
  ck("I1 分數由高到低 ⇒ ALLIN → TRADE → POKE/KITE（不是只有一種反應）", ladder[0] === "ALLIN" && ladder[1] === "TRADE" && ["POKE", "KITE"].includes(ladder[3]), ladder.join(","));
  const orig = e._riskV19.bind(e);
  e._riskV19 = () => -0.15; const aggr = at(0.5);
  e._riskV19 = () => 0.2; const caut = at(0.5);
  e._riskV19 = orig;
  ck("I2 同一情境：積極的人 All-in、謹慎的人不 All-in（個性改變決策，決定性）", aggr === "ALLIN" && caut !== "ALLIN", `${aggr}/${caut}`);
  p.hp = p.maxHp * 0.3; t.hp = t.maxHp * 0.9;
  const low = at(1.5);
  ck("I3 殘血 30%、人數不佔優、對方血多 ⇒ 不 All-in／不 Trade（低血量不合理開戰）", low !== "ALLIN" && low !== "TRADE", low);
  p.hp = p.maxHp;
  const allies3 = [p, ...e.players.filter((q) => q.side === "blue" && q !== p).slice(0, 2)];
  allies3.slice(1).forEach((q, i) => { q.pos = { x: 140, y: 140 + i }; });
  const reinf = at(0.45, { allies: allies3 });
  ck("I4 援軍在路上（交戰圈外 2 名隊友）⇒ 意圖升級", reinf === "ALLIN" && at(0.45) !== "ALLIN", `${reinf}/${at(0.45)}`);
  p.intentV20 = "TRADE"; p.intentTradeT0 = e.t;
  const seq = [];
  for (const dt of [0, 1, 2.4, 2.6, 4.4, 4.6]) { e.t = dt; seq.push(e._tradeOutV20(p) ? "out" : "in"); }
  ck("I5 Trade 有交手段與退開段（2.5 秒換血／2 秒退開，循環）", seq.join(",") === "in,in,in,out,out,in", seq.join(","));
}

// ── ② 兵線優先 ───────────────────────────────────────────────────────────────
{
  const e = new LogicEngine(4);
  for (let i = 0; i < 400; i++) e.tick(0.5);   // 讓兵線出來
  const p = e.players.find((q) => q.side === "blue" && q.lane === "mid" && q.role !== "jungle");
  const key = "rm", list = e.lanes.mid[key].filter((m) => m.hp > 0);
  ck("W0 情境成立：中路有敵方小兵", list.length > 0, `n=${list.length}`);
  if (list.length) {
    const mpos = e._minionPos("mid", list[0]);
    p.pos = { x: mpos.x + 1, y: mpos.y };
    ck("W1 敵兵在身邊 ⇒ 兵線未處理", e._waveBusyV20(p) === true);
    p.pos = { x: mpos.x + 60, y: mpos.y + 60 };
    ck("W2 敵兵遠離 ⇒ 兵線已處理", e._waveBusyV20(p) === false);
  }
  const jg = e.players.find((q) => q.side === "blue" && q.role === "jungle");
  ck("W3 打野不受兵線優先限制", e._waveBusyV20(jg) === false);
}

// ── ③ Team Call：距離、素質差異、拒絕 ─────────────────────────────────────────
function callScenario(stats) {
  const proto = LogicEngine.prototype;
  const e = new LogicEngine(9);
  if (stats) e.configurePlayers(PS.toEnginePlayerMods({ blue: ["b1", "b2", "b3", "b4", "b5"].map((id) => ({ id, stats })), red: [] }));
  void proto;
  const blue = e.players.filter((q) => q.side === "blue"), red = e.players.filter((q) => q.side === "red");
  const foe = red[0]; foe.pos = { x: 160, y: 160 };
  red.slice(1).forEach((q, i) => { q.pos = { x: 300 + i, y: 300 }; });
  blue[0].pos = { x: 163, y: 160 };
  blue.slice(1).forEach((q, i) => { q.pos = { x: 160 + 8 + i * 4, y: 172 }; });
  const c = e._issueCallV20("blue", "lowhp", blue[0], foe.pos, foe.id);
  let yes = 0, no = 0;
  const alive = e.players.filter((q) => !q.dead);
  for (const q of blue.slice(1)) { if (e._answerCallV20(q, c, alive)) yes++; else no++; }
  return { yes, no, e, c };
}
{
  const S = (v) => Object.fromEntries(["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, ["comms", "synergy", "leadership"].includes(k) ? v : 70]));
  const hi = callScenario(S(95)), lo = callScenario(S(45));
  ck("C1 同一呼叫：溝通／配合／領導 95 的隊伍回應人數 ≥ 45 的隊伍，且兩者不同", hi.yes >= lo.yes && hi.yes !== lo.yes, `hi ${hi.yes}/4 lo ${lo.yes}/4`);
  ck("C2 有人拒絕（回應不是無條件）", lo.no > 0, `lo declined ${lo.no}`);
  const e = hi.e;
  const far = e.players.find((q) => q.id === "b5"); far.pos = { x: 20, y: 20 };
  e.callsV20.blue = [hi.c]; hi.c.answered = []; hi.c.declined = [];
  e._teamCallsV20(e.players.filter((q) => !q.dead), new Map());
  ck("C3 超出呼叫距離的隊友收不到（不是全圖透視）", !hi.c.answered.includes("b5") && !hi.c.declined.includes("b5"));
  const dup = e._issueCallV20("blue", "lowhp", e.players[0], hi.c.pos, hi.c.targetId);
  ck("C4 同類同目標短時間內不重複呼叫", dup === null);
}

// ── ④ Gank／追擊 ────────────────────────────────────────────────────────────
{
  const e = new LogicEngine(6);
  const jg = e.players.find((q) => q.side === "blue" && q.role === "jungle");
  const alive = () => e.players.filter((q) => !q.dead);
  for (const q of e.players) if (q !== jg) q.pos = q.side === "blue" ? { x: 20, y: 20 } : { x: 310, y: 310 };
  jg.pos = { x: 165, y: 165 };
  ck("G1 看不到任何敵方對線者 ⇒ 不出發 Gank（不再靠計時器＋亂數）", e._gankPickV20(jg, alive(), { top: 1, mid: 1, bot: 1 }) === null);
  const ally = e.players.find((q) => q.side === "blue" && q.lane === "mid" && q.role !== "jungle");
  const foe = e.players.find((q) => q.side === "red" && q.lane === "mid" && q.role !== "jungle");
  const tw = e.frontTower("blue", "mid");
  foe.pos = { x: tw.pos.x + (165 - tw.pos.x) * 0.6, y: tw.pos.y + (165 - tw.pos.y) * 0.6 };
  ally.pos = { x: foe.pos.x - 4, y: foe.pos.y - 4 };
  foe.hp = foe.maxHp * 0.35;
  const g = e._gankPickV20(jg, alive(), { top: 1, mid: 1, bot: 1 });
  ck("G2 中路敵人殘血、壓線、我方中路在場 ⇒ 選中路", g?.lane === "mid", JSON.stringify(g));
  foe.hp = foe.maxHp * 0.2; foe.pos = { x: tw.pos.x + 1, y: tw.pos.y + 1 };
  const p = ally; p.pos = { x: tw.pos.x + 12, y: tw.pos.y + 12 };
  ck("K1 殘血敵人已在自家塔邊、只有一人追 ⇒ 估不出擊殺、不追", e._chaseKillableV20(p, foe, alive()) === false);
  foe.pos = { x: 165, y: 165 }; p.pos = { x: 167, y: 165 }; foe.hp = foe.maxHp * 0.05;
  ck("K2 殘血 5%、離塔很遠 ⇒ 追", e._chaseKillableV20(p, foe, alive()) === true);
}

// ── ⑤ 物件／懲戒 ────────────────────────────────────────────────────────────
{
  const { e } = Runner.configure(8, "standard", M, 1);
  for (let i = 0; i < 2000 && !e.neutrals.baron.alive; i++) e.tick(0.5);
  const ev5 = e._objectiveEvalV20("blue");
  const reds = e.players.filter((q) => q.side === "red");
  reds.slice(0, 2).forEach((q) => { q.dead = true; });
  const evUp = e._objectiveEvalV20("blue");
  ck("O1 人數優勢 ⇒ 物件評估分數上升（不是擲骰）", evUp && ev5 && evUp.v > ev5.v, `${ev5?.v?.toFixed(2)} → ${evUp?.v?.toFixed(2)}`);
  reds.slice(0, 2).forEach((q) => { q.dead = false; });
  const blues = e.players.filter((q) => q.side === "blue");
  blues.slice(0, 2).forEach((q) => { q.dead = true; });
  const evDown = e._objectiveEvalV20("blue");
  ck("O2 3 打 5 ⇒ 不選巴龍（龍或低分）", !evDown || evDown.key !== "baron" || evDown.v < e.rules.objEvalOpenAt, JSON.stringify(evDown));
  blues.slice(0, 2).forEach((q) => { q.dead = false; });
  const jg = blues.find((q) => q.role === "jungle");
  const camp = e.neutrals.camps.find((c) => c.side === "blue" && c.type !== "buff" && c.members?.length);
  if (camp) {
    const v = camp.members[0]; const hp0 = v.hp; v.hp = v.maxHp * 0.3;
    for (const q of e.players) if (q.role === "jungle" && q.side === "red") q.pos = { x: 5, y: 5 };
    jg.hp = jg.maxHp; jg.pos = { ...camp.pos };
    e.fsm3.blue.objGo = false;
    e.neutrals.dragon.alive = true; e.neutrals.baron.alive = false; e.neutrals.baron.respawnAt = e.t + 300;   // 情境：龍在場、巴龍不在
    const far = e._smiteWorthOnCamp(camp, v, [jg]);
    jg.pos = { x: e.neutrals.dragon.pos.x + 3, y: e.neutrals.dragon.pos.y };
    const near = e._smiteWorthOnCamp(camp, v, [jg]);
    v.hp = hp0;
    ck("S1 物件不迫近 ⇒ 懲戒可清野；打野就在龍坑邊 ⇒ 保留給物件", far === true && near === false, `${far}/${near}`);
  } else ck("S1 情境成立：有一般營地", false);
}

// ── 整場：決定性與對照 ───────────────────────────────────────────────────────
{
  const a = Runner.configure(21, "standard", M, 1).e, b = Runner.configure(21, "standard", M, 1).e;
  for (let i = 0; i < 1200; i++) { a.tick(0.5); b.tick(0.5); }
  ck("D1 同 seed 兩次 600 秒逐位元相同（無新亂數）", JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()));
}
function runGame(seed, off) {
  const { e } = Runner.configure(seed, "standard", M, 1);
  if (off) for (const k of V20_FLAGS) e.rules = { ...e.rules, [k]: false };
  const labels = new Set();
  while (!e.over && e.t < 3600) { e.tick(0.5); for (const p of e.players) if (p.state) labels.add(p.state); }
  return { s: [e.tacStatsV20.blue, e.tacStatsV20.red], min: e.t / 60, over: e.over, labels };
}
const SEEDS = [1, 2, 3, 4, 5, 6];
const on = SEEDS.map((s) => runGame(s, false)), off = SEEDS.map((s) => runGame(s, true));
const sum = (runs, f) => runs.reduce((x, r) => x + r.s.reduce((y, s) => y + f(s), 0), 0);
const fsA = (runs) => sum(runs, (s) => s.firstSightAllIn) / Math.max(1, sum(runs, (s) => s.firstSight));
ck(`S2 看到敵人立即 All-in 比例下降：v20 ${(fsA(on) * 100).toFixed(1)}% vs 關閉 ${(fsA(off) * 100).toFixed(1)}%（需 ≤ 0.85×）`, fsA(on) <= fsA(off) * 0.85);
const intents = new Set(on.flatMap((r) => r.s.flatMap((s) => Object.keys(s.intent).filter((k) => s.intent[k] > 0))));
ck(`S3 四種意圖都實際出現（${[...intents].join("／")}）`, ["ALLIN", "TRADE", "POKE", "KITE"].every((k) => intents.has(k)));
const lowOn = sum(on, (s) => s.lowHpEngage), lowOff = sum(off, (s) => s.lowHpEngage);
ck(`S4 低血量不合理開戰下降：v20 ${lowOn} vs 關閉 ${lowOff}`, lowOn < lowOff);
const callsOn = sum(on, (s) => Object.values(s.callIssued).reduce((x, y) => x + y, 0));
ck(`S5 Team Call 有發出、有回應、有拒絕（發 ${callsOn}／應 ${sum(on, (s) => s.callAnswered)}／拒 ${sum(on, (s) => s.callDeclined)}）`,
  callsOn > 0 && sum(on, (s) => s.callAnswered) > 0 && sum(on, (s) => s.callDeclined) > 0);
ck(`S6 遊走一律在兵線處理後才出發（${sum(on, (s) => s.roamAfterClear)}/${sum(on, (s) => s.roamStart)}）`, sum(on, (s) => s.roamAfterClear) === sum(on, (s) => s.roamStart));
const gsOn = sum(on, (s) => s.gankKill) / Math.max(1, sum(on, (s) => s.gankStart)), gsOff = sum(off, (s) => s.gankKill) / Math.max(1, sum(off, (s) => s.gankStart));
ck(`S7 Gank 成功率不低於計時器版（v20 ${(gsOn * 100).toFixed(1)}% vs 關閉 ${(gsOff * 100).toFixed(1)}%）`, gsOn >= gsOff);
const lab = new Set(on.flatMap((r) => [...r.labels]));
ck(`S8 走位分支讀 intent（出現 強開／換血／消耗 狀態）`, ["強開", "換血", "消耗"].every((k) => lab.has(k)), [...lab].join(","));
ck(`S9 對局全部正常結束（v20：${on.map((r) => r.min.toFixed(1)).join("／")} 分）`, on.every((r) => r.over && r.min <= 45));

let pass = 0;
for (const [n, ok, d] of A) { console.log(`${ok ? "✅" : "❌"} ${n}${ok || !d ? "" : `　${d}`}`); if (ok) pass++; }
console.log(`\nMOBA Tactical AI Phase 2：${pass}/${A.length} ${pass === A.length ? "PASS" : "FAIL"}`);
process.exit(pass === A.length ? 0 : 1);
