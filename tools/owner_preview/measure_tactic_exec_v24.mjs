#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/measure_tactic_exec_v24.mjs — v24 Sprint 1 的量測（2026-11-15；量測工具，不改引擎）
//
//  每個 Seed 跑兩臂：adaptive（balanceTool.v24／career.v24 原樣）與 off（tacticExec 覆寫成 "off"＝交付點 A＝v23 的行為）。
//  Sprint 1.1（2026-11-17）：v24 規則集改成 adaptive.v1.1；多一臂 s1＝原 Sprint 1（adaptive.v1）。
//    工具路徑：ESMO_BALANCE_TACTICEXEC=adaptive.v1；生涯路徑（正式規則集鎖層）：建好引擎、第一個 tick 之前把 tacExec.v11 關掉
//    （createTacticExecState 只差這一格；check_tactic_exec_v24 T7 驗兩種做法逐 tick 相同，且與 Sprint 1 的驗證雜湊相同）。
//   --path=tool    三種模板配置：inv（雙方 v2.jungle_invasion）、AB（藍 v2.jungle_invasion／紅 classic.m7）、BA（反過來）。
//                  AB 與 BA 是同 Seed、同陣容（鏡像）的換邊配對 ⇒ 驗收 8b 的差中之差。
//   --path=career  生涯（career.v24 vs 同旗標但 tacticExec off 的 career.v23 等價臂），藍方 v2.jungle_invasion，素質＝--tier。
//                  ⚠ 生涯的 off 臂用 career.v23（旗標只開到 v23）：career.v24 是正式規則集，層值被鎖住、不能覆寫成 off；
//                    交付點 A 已證明 career.v24 在 tacticExec 不存在時與 career.v23 逐 tick 相同。
//  每場記錄（只讀；唯一的包裝是 _towerKillerFor，原樣呼叫、原樣回傳）：
//    勝方、時長、雙方金錢（結束時與 900 秒時）、陣亡、被塔擊殺、被拆的塔、
//    野怪：雙方清掉的自家營與敵方營（camp 由活轉死時的 killerTeam）、野區擊殺（陣亡位置在任一營地 20 單位內）、
//    tacExec 的摘要與紀錄、invObs；威脅校準：每筆有目標的入侵評估，預測（s05、s05reach）與 15 秒內實際進入目標 14 單位的敵方英雄數。
//  用法：node tools/owner_preview/measure_tactic_exec_v24.mjs --path=tool --seeds=11,13 --out=<json>
//        node tools/owner_preview/measure_tactic_exec_v24.mjs --path=career --tier=mid --seeds=93001 --out=<json>
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "tool"), TIER = arg("tier", "mid"), OUT = arg("out", null);
const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number);
const CONFIGS = (arg("configs", "inv,AB,BA")).split(",");
const ARMS = (arg("arms", "off,adaptive")).split(",");
const S1_VIA = arg("s1via", "env");   // env | flip（工具路徑；生涯一律 flip）
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const { tacticExecSummary } = await import("../../src/battle/moba/tactics/tacticExecV24.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };

function build(seed, cfg, arm) {
  if (PATH === "tool") {
    const [tb, tr] = TEMPLATES[cfg];
    if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
    if (arm === "s1" && S1_VIA === "env") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1";
    try { const e = configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e; return arm === "s1" && S1_VIA === "flip" ? flipToS1(e) : e; }
    finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
  }
  const flags = { ...C.G.featureFlags, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true, mobaTacticExecV24: arm !== "off" };
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== (arm !== "off" ? "career.v24" : "career.v23")) throw new Error(`resolved ${ruleset.rulesetId}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = TIER_VALUE[TIER];
  const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `te24-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected ${seed}`);
  return arm === "s1" ? flipToS1(out.engine) : out.engine;
}
/** 原 Sprint 1：同一個模組、v11 關掉（第一個 tick 之前）。 */
function flipToS1(e) {
  if (!e.tacExec || e._tacExecVariant !== "adaptive.v1.1" || e.t !== 0) throw new Error("flipToS1: expected a fresh adaptive.v1.1 engine");
  e._tacExecVariant = "adaptive.v1"; e.tacExec.v11 = false;
  return e;
}

//  診斷臂（只給根因分析，不進驗證判準；實例層、第一個 tick 之前）：
//   nodef＝adaptive 但雙方回防永遠不觸發（回防冷卻設成無限大）；noinv＝adaptive 但雙方都不評估入侵（傾向設成 null）；bare＝兩者皆是。
const DIAG = { nodef: [true, false], noinv: [false, true], bare: [true, true] };
//  戰術傾向報告臂（Sprint 1.1 登記的「只報」項；實例層、第一個 tick 之前）：pc／pg／pl＝adaptive 但有入侵意圖的一邊強制成 conservative／aggressive／allin。
//  Sprint 1 的傾向來自戰術書的 invadeChance（模板 v2.jungle_invasion＝auto），玩家自選傾向屬 Sprint 3 ⇒ 其他三種只能這樣量。
const POSTURE_ARMS = { pc: "conservative", pg: "aggressive", pl: "allin" };
function runMatch(seed, cfg, arm) {
  const tuneK = /^k(\d+(?:\.\d+)?)$/.exec(arm);   // 診斷臂 k<值>＝adaptive 但 econK 換成這個值（只給取捨曲線，不進驗證）
  const e = build(seed, cfg, DIAG[arm] || tuneK || POSTURE_ARMS[arm] ? "adaptive" : arm);
  if (POSTURE_ARMS[arm]) for (const S of ["blue", "red"]) if (e.tacExec.side[S].posture) { e.tacExec.side[S].posture = POSTURE_ARMS[arm]; e.tacExec.obs[S].posture = POSTURE_ARMS[arm]; }
  if (tuneK) e.tacExec.tune = { econK: Number(tuneK[1]) };
  if (DIAG[arm]) for (const S of ["blue", "red"]) {
    if (DIAG[arm][0]) e.tacExec.side[S].defendCooldownUntil = Infinity;
    if (DIAG[arm][1]) { e.tacExec.side[S].posture = null; e.tacExec.obs[S].posture = null; }
  }
  const h = createHash("sha1");
  const towerKilled = new Set();
  const tk = e._towerKillerFor.bind(e);
  e._towerKillerFor = (foe) => { towerKilled.add(foe.id); return tk(foe); };
  const S = () => ({ deaths: 0, towerDeaths: 0, jungleDeaths: 0, ownCampKills: 0, enemyCampKills: 0, enemyCampLost: 0 });
  const st = { blue: S(), red: S() };
  const wasDead = new Map(), campAlive = new Map();
  const pending = [], threat = [];
  let gold900 = null, logIdx = 0;
  const camps = () => e.neutrals?.camps ?? [];
  while (!e.over && e.t < 3000) {
    e.tick(0.5);
    for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.hp.toFixed(2)};`);
    for (const p of e.players) {
      const was = wasDead.get(p.id) ?? false;
      if (p.dead && !was) {
        st[p.side].deaths++;
        if (towerKilled.has(p.id)) st[p.side].towerDeaths++;
        if (camps().some((c) => dist(c.pos, p.pos) <= 20)) st[p.side].jungleDeaths++;
      }
      if (!p.dead) towerKilled.delete(p.id);
      wasDead.set(p.id, p.dead);
    }
    for (const c of camps()) {
      const was = campAlive.get(c.id) ?? false;
      if (was && !c.alive && c.killerTeam) {
        if (c.killerTeam === c.side) st[c.killerTeam].ownCampKills++;
        else { st[c.killerTeam].enemyCampKills++; st[c.side].enemyCampLost++; }
      }
      campAlive.set(c.id, c.alive);
    }
    if (gold900 == null && e.t >= 900) gold900 = { blue: e.players.filter((p) => p.side === "blue").reduce((s, p) => s + (p.gold ?? 0), 0), red: e.players.filter((p) => p.side === "red").reduce((s, p) => s + (p.gold ?? 0), 0) };
    //  威脅校準：新的評估紀錄（有目標的）⇒ 開一個 15 秒的真值窗
    const log = e.tacExec?.log ?? [];
    for (; logIdx < log.length; logIdx++) {
      const r = log[logIdx];
      if (r.kind !== "invade" || !r.target || r.threat == null) continue;
      const c = camps().find((x) => x.id === r.target);
      if (c) pending.push({ t: r.t, side: r.side, pos: { x: c.pos.x, y: c.pos.y }, pred: r.threat, predReach: r.threatReach, d: r.d, mask: 0, invading: false });
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const o = pending[i];
      if (e.t > o.t && e.t <= o.t + 15) for (const q of e.players) if (!q.dead && q.side !== o.side && dist(q.pos, o.pos) <= 14) o.mask |= 1 << ["top", "jungle", "mid", "adc", "sup"].indexOf(q.role);
      if (e.t >= o.t + 15) { let n = 0, m = o.mask; while (m) { n += m & 1; m >>>= 1; } threat.push([o.t, o.side === "blue" ? 0 : 1, o.pred, o.predReach, n, o.d === "go" ? 1 : 0]); pending.splice(i, 1); }
    }
  }
  const goldEnd = { blue: e.players.filter((p) => p.side === "blue").reduce((s, p) => s + (p.gold ?? 0), 0), red: e.players.filter((p) => p.side === "red").reduce((s, p) => s + (p.gold ?? 0), 0) };
  const towersLost = { blue: 0, red: 0 };
  for (const t of Object.values(e.towers ?? {})) if (t.hp <= 0) towersLost[t.side]++;
  const te = e.tacExec ? tacticExecSummary(e.tacExec) : null;
  const events = e.tacExec ? e.tacExec.log.filter((r) => r.kind !== "invade" || r.d === "go") : [];
  return { seed, path: PATH, tier: PATH === "career" ? TIER : null, cfg, arm, winner: e.winner ?? null, duration: +e.t.toFixed(1), over: !!e.over,
    hash: h.digest("hex").slice(0, 16), goldEnd, gold900, towersLost, stats: st, invObs: e.invObs ?? null, exec: e.exec ?? null, te, events, threat };
}

if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [], t0 = Date.now();
for (const s of seeds) for (const cfg of PATH === "tool" ? CONFIGS : ["career"]) for (const arm of ARMS) {
  rows.push(runMatch(s, cfg, arm));
  process.stderr.write(`[te24] ${PATH}${PATH === "career" ? ":" + TIER : ""} ${cfg} ${arm} seed ${s} (${rows.length}/${seeds.length * (PATH === "tool" ? CONFIGS.length : 1) * ARMS.length})\n`);
}
fs.writeFileSync(OUT, JSON.stringify({ tool: "measure_tactic_exec_v24", gitHead: arg("head", null), path: PATH, tier: PATH === "career" ? TIER : null, seeds, configs: CONFIGS, arms: ARMS, wallSec: Math.round((Date.now() - t0) / 1000), rows }));
console.log(JSON.stringify({ ok: true, n: rows.length, wallSec: Math.round((Date.now() - t0) / 1000) }));
