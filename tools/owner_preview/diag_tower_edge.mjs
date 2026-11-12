#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_tower_edge.mjs — 塔邊決策診斷（2026-11-12；量測工具，不改引擎）
//
//  只在引擎「實例」上包函式（不改原型），每 tick 對每名英雄記：
//   · 避塔 tick（state === "避塔"），分來源：決策層 FALLBACK（fsm SETUP）／移動層 M1.7（fsm DISENGAGE）
//   · 原地挨打（stillHit）：避塔中、這一 tick 移動 < 0.3、而且這一 tick 被塔實際開火命中
//       成因分類：noNav（移動目標離自己 ≤ 0.6 ⇒ 引擎根本不移動）／goalInRange（_navMove 會把目標推回通道中心，推回後的點仍在該塔射程內）
//                 ／rawUnwalk（原始目標不可走）／blocked（其他：有目標、可走，但走不動）
//   · 重派（reissue）：離開對某座塔的避塔後 8 秒內又因同一座塔進入避塔；記下中間做了什麼（state）
//   · 塔邊乒乓：同一名英雄 6 秒內在敵塔射程邊界進出 ≥ 3 次（與 measure_route_safety 同定義）
//   · safeRoute 求不到路（blockedFallback）：記當時情境（是否撤退、起點／終點可走、不帶禁區時求不求得到路、終點離塔多遠）
//  戰鬥品質：陣亡、塔收頭、英雄收頭（陣亡 − 塔收頭）、推掉的塔、Gank 出發／成功、對局時長、每 tick 耗時、逐 tick 串流雜湊。
//  用法：node tools/owner_preview/diag_tower_edge.mjs --rulesets=balanceTool.v22,balanceTool.v23 [--templates=v2.jungle_invasion,classic.m7 | --pairs=藍/紅,…] [--n=10] [--first=11] [--seeds=…] [--horizon=600|end] [--out=...]
//  safeRoute 層對照：ESMO_BALANCE_SAFEROUTE=v1（上一版 v23）／未設定（v23 規則集＝v2）。
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext } from "../lib/careerLiveInputs.mjs";
import { isWalkable, recenterToCorridor, findPath, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = Number(arg("n", "10")), FIRST = Number(arg("first", "11"));
const HZ = arg("horizon", "600"), HORIZON = HZ === "end" ? 3000 : Number(HZ);
const OUT = arg("out", null);
const RULESETS = arg("rulesets", "balanceTool.v22,balanceTool.v23").split(",");
const TEMPLATES = arg("templates", "v2.jungle_invasion").split(",");
const SWAP = process.argv.includes("--swap");
const SEEDS = arg("seeds", null)?.split(",").map(Number) ?? Array.from({ length: N }, (_, i) => FIRST + i * 2);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bindingOf = (templateId) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId, choices: {} }).plan);

export function runOne(rulesetId, seed, tplBlue, tplRed) {
  const bb = { kind: "binding", binding: bindingOf(tplBlue) }, br = { kind: "binding", binding: bindingOf(tplRed) };
  const { e } = configure(seed, "standard", M, 1, null, { blue: bb, red: br }, rulesetId);
  const shot = new Set(), shotBy = new Map();
  { const pf = e.pushFx.bind(e); e.pushFx = (fx) => { if (fx?.type === "tower" && fx.targetKind === "hero") { shot.add(fx.targetId); shotBy.set(fx.targetId, e.towers[fx.sourceId]); } return pf(fx); }; }
  const navT = new Map(), rawT = new Map();
  { const nm = e._navMove.bind(e); e._navMove = (p, t, spd) => { navT.set(p.id, { x: t.x, y: t.y }); return nm(p, t, spd); }; }
  const finalT = new Map(), examples = [];
  { const tt = e._heroTauntTarget.bind(e); e._heroTauntTarget = (p, t) => { const o = tt(p, t); if (o) finalT.set(p.id, { x: o.x, y: o.y }); return o; }; }
  const towerKill = new Set();
  { const tk = e._towerKillerFor.bind(e); e._towerKillerFor = (foe) => { towerKill.add(foe.id); return tk(foe); }; }
  const blocked = [];
  if (typeof e._safeWaypointV23 === "function" && e.routeObs) {
    const sw = e._safeWaypointV23.bind(e);
    e._safeWaypointV23 = (p, tgt) => {
      if (tgt) rawT.set(p.id, { x: tgt.x, y: tgt.y });
      const before = e.routeObs[p.side].blockedFallback;
      const out = sw(p, tgt);
      if (e.routeObs[p.side].blockedFallback > before) {
        const alive = e._aliveStructs;
        let nearT = null, nd = Infinity;
        for (const tw of Object.values(e.towers)) { if (tw.hp <= 0 || tw.side === p.side) continue; const d = dist(tgt, tw.pos); if (d < nd) { nd = d; nearT = tw; } }
        blocked.push({ t: e.t, id: p.id, role: p.role, st: p.state, ret: !!p.retreating, pos: { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1) }, tgt: { x: +tgt.x.toFixed(1), y: +tgt.y.toFixed(1) },
          startWalk: isWalkable(p.pos.x, p.pos.y, HERO_RADIUS, alive), goalWalk: isWalkable(tgt.x, tgt.y, HERO_RADIUS, alive),
          plainPath: !!findPath(p.pos, tgt, HERO_RADIUS, alive)?.length, goalToNearTower: +(nd - e.towerRange(nearT) - (e.rules.towerSafePad ?? 2.5)).toFixed(1) });
      }
      return out;
    };
  }
  const S = { avoidTicks: 0, avoidFallback: 0, avoidM17: 0, avoidInRange: 0, stillHit: 0, still_noNav: 0, still_goalInRange: 0, still_rawUnwalk: 0, still_blocked: 0,
    shotsWhileAvoid: 0, reissue: 0, pingPong: 0, deaths: 0, towerDeaths: 0, heroDeaths: 0, deathsAfterAvoid: 0, gankStart: 0, gankKill: 0, towersDown: 0, duration: 0, holdTicks: 0, longHold: 0, reHit: 0 };
  const reissueEx = [], hist = new Map(), holdRun = new Map();
  const between = {}, prevPos = new Map(), prevState = new Map(), avoidTower = new Map(), lastAvoidEnd = new Map(), mid = new Map(), edgeLog = new Map(), prevIn = new Map(), lastAvoidT = new Map();
  const h = createHash("sha1");
  let tickMs = 0, ticks = 0;
  const enemyTowers = (p) => Object.values(e.towers).filter((t) => t.hp > 0 && t.side !== p.side);
  const nearestTower = (p) => { let b = null, bd = Infinity; for (const t of enemyTowers(p)) { const d = dist(p.pos, t.pos); if (d < bd) { bd = d; b = t; } } return b; };
  for (const p of e.players) prevPos.set(p.id, { ...p.pos });
  while (e.t < HORIZON && !e.over) {
    shot.clear(); shotBy.clear(); navT.clear(); rawT.clear(); finalT.clear();
    const t0 = performance.now(); e.tick(0.5); tickMs += performance.now() - t0; ticks++;
    const alive = e._aliveStructs;
    for (const p of e.players) {
      h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`);
      if (p.dead) {
        if (!prevIn.has(p.id + ":dead")) {
          prevIn.set(p.id + ":dead", true); S.deaths++;
          if (towerKill.has(p.id)) { S.towerDeaths++; S["towerDeaths_" + p.side] = (S["towerDeaths_" + p.side] ?? 0) + 1; } else S.heroDeaths++;
          towerKill.delete(p.id);
          if (e.t - (lastAvoidT.get(p.id) ?? -99) <= 5) S.deathsAfterAvoid++;
        }
        prevState.set(p.id, null); avoidTower.delete(p.id); prevPos.set(p.id, { ...p.pos });
        continue;
      }
      prevIn.delete(p.id + ":dead");
      let inTw = null;
      for (const tw of enemyTowers(p)) if (dist(p.pos, tw.pos) <= e.towerRange(tw)) { inTw = tw; break; }
      const was = prevIn.get(p.id) ?? null;
      if (!!inTw !== !!was) { const L = (edgeLog.get(p.id) ?? []).filter((t) => e.t - t <= 6); L.push(e.t); edgeLog.set(p.id, L); if (L.length === 3) { S.pingPong++; const tw0 = inTw ?? was; const kind = tw0 && e._towerMinionsInRange(tw0) > 0 ? "wave" : (p.state === "避塔" || p.intent === "塔邊等待時機") ? "avoid" : (p.fsm === "ENGAGE" || p.fsm === "CHASE" || p.state === "團戰!") ? "fight" : (p.retreating ? "retreat" : "other"); S["pp_" + kind] = (S["pp_" + kind] ?? 0) + 1; } }
      prevIn.set(p.id, inTw);
      const moved = dist(prevPos.get(p.id) ?? p.pos, p.pos);
      const ps = prevState.get(p.id);
      { const T0 = nearestTower(p); const H = hist.get(p.id) ?? []; H.push(`${e.t}:${p.state}/${p.fsm}/${p.decisionAction ?? "-"}/d${T0 ? (dist(p.pos, T0.pos) - e.towerRange(T0)).toFixed(1) : "-"}${shot.has(p.id) ? "/HIT" : ""}${p.dbgTower ? "/z" + (p.dbgTower.allow ? "A" : "D") + (p.dbgTower.wave ? "w" : "") : ""}${p.intent === "塔邊等待時機" ? "/HOLD" : ""}${p._edgeV23 ? "/C" : ""}`); if (H.length > 16) H.shift(); hist.set(p.id, H); }
      { const L = lastAvoidEnd.get(p.id); const by = shotBy.get(p.id); if (p.state !== "避塔" && L && by && by === L.tower && e.t - L.t <= 8) { S.reHit++; S["reHit_" + p.side] = (S["reHit_" + p.side] ?? 0) + 1; } }
      if (p.state === "避塔") {
        S.avoidTicks++; lastAvoidT.set(p.id, e.t);
        if (p.fsm === "SETUP") S.avoidFallback++; else S.avoidM17++;
        if (inTw) S.avoidInRange++;
        if (shot.has(p.id)) S.shotsWhileAvoid++;
        const T = nearestTower(p);
        if (ps !== "避塔") {
          const L = lastAvoidEnd.get(p.id);
          if (L && T && L.tower === T && e.t - L.t <= 8) { S.reissue++; if (reissueEx.length < 12) reissueEx.push({ id: p.id, role: p.role, hist: [...(hist.get(p.id) ?? [])] }); for (const s of mid.get(p.id) ?? []) between[s] = (between[s] ?? 0) + 1; }
        }
        avoidTower.set(p.id, T); mid.set(p.id, new Set());
        if (moved < 0.3 && shot.has(p.id)) {
          S.stillHit++; S["stillHit_" + p.side] = (S["stillHit_" + p.side] ?? 0) + 1;
          const g = navT.get(p.id);
          const tw = inTw ?? T;
          if (examples.length < 40) { const f = finalT.get(p.id); examples.push({ t: e.t, id: p.id, role: p.role, fsm: p.fsm, intent: p.intent, ret: !!p.retreating, dec: p.decisionAction, pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2) }, raw: rawT.get(p.id) ?? null, final: f ? { x: +f.x.toFixed(2), y: +f.y.toFixed(2) } : null, dFinal: f ? +dist(f, p.pos).toFixed(2) : null, dTower: tw ? +dist(p.pos, tw.pos).toFixed(2) : null, range: tw ? +e.towerRange(tw).toFixed(2) : null, hp: +(p.hp / p.maxHp).toFixed(2), ctrl: (p.heroSkillControlUntil ?? 0) > e.t }); }
          if (!g) S.still_noNav++;
          else {
            const rc = recenterToCorridor(g.x, g.y, HERO_RADIUS, alive);
            const raw = rawT.get(p.id) ?? g;
            if (tw && dist(rc, tw.pos) <= e.towerRange(tw)) S.still_goalInRange++;
            else if (!isWalkable(raw.x, raw.y, HERO_RADIUS, alive)) S.still_rawUnwalk++;
            else S.still_blocked++;
          }
        }
      } else {
        if (ps === "避塔") lastAvoidEnd.set(p.id, { tower: avoidTower.get(p.id), t: e.t });
        mid.get(p.id)?.add(p.state);
      }
      //  塔邊等待：連續停在出口的長度（過度保守的監看：≥ 20 秒記一次 longHold）
      if (p.intent === "塔邊等待時機") { S.holdTicks++; const h0 = (holdRun.get(p.id) ?? 0) + 0.5; holdRun.set(p.id, h0); if (h0 === 20) S.longHold++; } else holdRun.set(p.id, 0);
      prevState.set(p.id, p.state); prevPos.set(p.id, { ...p.pos });
    }
  }
  const ts = e.tacStatsV20 ?? {};
  S.gankStart = (ts.blue?.gankStart ?? 0) + (ts.red?.gankStart ?? 0);
  S.gankKill = (ts.blue?.gankKill ?? 0) + (ts.red?.gankKill ?? 0);
  S.towersDown = Object.values(e.towers).filter((t) => t.hp <= 0).length;
  S.duration = +e.t.toFixed(1);
  for (const sd of ["blue", "red"]) for (const [k, v] of Object.entries(e.routeObs?.[sd] ?? {})) S["route_" + k] = (S["route_" + k] ?? 0) + v;
  return { rulesetId, seed, tplBlue, tplRed, over: !!e.over, winner: e.winner ?? null, S, between, blocked, examples, reissueEx, tickMs: +(tickMs / ticks).toFixed(3), streamHash: h.digest("hex").slice(0, 16) };
}

if (process.argv[1] && process.argv[1].endsWith("diag_tower_edge.mjs")) {
  const rows = [];
  //  --pairs=藍模板/紅模板,…（紅藍互換就把同一組反過來再列一次）；未給 ⇒ 每個模板雙方同戰術（--swap 為舊用法）。
  const PAIRS = arg("pairs", null)?.split(",").map((x) => x.split("/")) ?? TEMPLATES.map((tpl) => SWAP ? [TEMPLATES[1] ?? tpl, tpl] : [tpl, tpl]);
  const total = RULESETS.length * PAIRS.length * SEEDS.length; let done = 0;
  for (const rs of RULESETS) for (const [b, r] of PAIRS) for (const seed of SEEDS) {
    rows.push(runOne(rs, seed, b, r));
    if (++done % 10 === 0 || done === total) process.stderr.write(`[diag] ${rs} ${done}/${total}
`);
  }
  const agg = {};
  for (const r of rows) {
    const A = agg[r.rulesetId] ??= { matches: 0, ended: 0, tickMs: 0, between: {}, blockedKinds: {} };
    A.matches++; if (r.over) A.ended++; A.tickMs += r.tickMs;
    for (const [x, v] of Object.entries(r.S)) A[x] = (A[x] ?? 0) + v;
    for (const [x, v] of Object.entries(r.between)) A.between[x] = (A.between[x] ?? 0) + v;
    for (const b of r.blocked) { const k = `${b.ret ? "ret" : "move"}|start${b.startWalk ? "W" : "X"}|goal${b.goalWalk ? "W" : "X"}|plain${b.plainPath ? "Y" : "N"}`; A.blockedKinds[k] = (A.blockedKinds[k] ?? 0) + 1; }
  }
  for (const A of Object.values(agg)) { A.tickMs = +(A.tickMs / A.matches).toFixed(3); A.duration = +(A.duration / A.matches).toFixed(1); }
  console.log(JSON.stringify(agg, null, 1));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_tower_edge", seeds: SEEDS, horizon: HZ, pairs: PAIRS, agg, rows }, null, 1));
}
