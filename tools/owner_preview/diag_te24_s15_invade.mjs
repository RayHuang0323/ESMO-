#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_invade.mjs — Sprint 2 Preflight A：生涯入侵不足的根因診斷（只讀；2026-11-20）
//
//  只在「已用過」的 Seeds 上重跑（S14 自然對局 142201+／143001+），不是驗證，不產生任何 PASS／FAIL。
//  做法：建好引擎後、第一個 tick 之前，把 e.tacExec.log 換成一個會在 push 當下回呼的陣列。
//  評估寫入紀錄的那一刻（evaluateInvade 內、startInvade 之前）就是決策當時的精確狀態：
//  在這一刻用唯讀的複本重算每座敵方營地的情報、距離、可達與經濟數值（不寫入引擎任何欄位）。
//  整場串流雜湊與 lib_closure_natural_v24 同格式 ⇒ 和 S14 已記錄的雜湊逐值相同才代表沒有擾動對局。
//
//  複本（threatOf／pAlive12／lambdaTime12／econ12／believedCamp）照抄 src/battle/moba/tactics/tacticExecV24.js，
//  每一筆出發與經濟失敗紀錄都和引擎自己寫的數值比對（econCheck），不一致就照實記下。
//
//  單場：--path=career --tier=mid --seeds=143001,143003 --out=<jsonl>   或 --path=tool --cfg=inv
//  批次：--run --dir=<repo 外資料夾> [--n=30]（嚴格單線；每 10 個 Seed 一個子行程；可續跑；STOP 檔）
// ============================================================================
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SELF = fileURLToPath(import.meta.url), odd = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
const N = Number(arg("n", "30"));
export const DIAG_CELLS = Object.freeze([
  ...["low", "mid", "high"].map((tier) => ({ name: `career_${tier}`, path: "career", tier, seeds: odd(143001, N), ref: `career_${tier}.jsonl` })),
  ...["inv", "AB", "BA"].map((cfg) => ({ name: `tool_${cfg}`, path: "tool", cfg, seeds: odd(142201, N), ref: `holdout_tool_${cfg}.jsonl` })),
]);

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, "\\").toLowerCase();
if (isMain && process.argv.includes("--run")) {
  const DIR = arg("dir");
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = () => new Date().toISOString(), note = (file, rec) => fs.appendFileSync(`${DIR}/${file}`, JSON.stringify({ at: stamp(), ...rec }) + "\n");
  const count = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length : 0);
  const total = DIAG_CELLS.reduce((s, c) => s + c.seeds.length, 0), t0 = Date.now();
  const doneNow = () => DIAG_CELLS.reduce((s, c) => s + count(`${DIR}/${c.name}.jsonl`), 0), already = doneNow();
  if (already) note("interruptions.jsonl", { kind: "resume", matchesAlreadyDone: already });
  for (const c of DIAG_CELLS) {
    const f = `${DIR}/${c.name}.jsonl`;
    for (let d = count(f); d < c.seeds.length; d = count(f)) {
      if (fs.existsSync(`${DIR}/STOP`)) { note("interruptions.jsonl", { kind: "stop_file", cell: c.name, done: d }); process.exit(0); }
      const chunk = c.seeds.slice(d, d + 10), startedAt = stamp();
      const r = spawnSync(process.execPath, ["--max-old-space-size=1536", SELF, `--path=${c.path}`, `--tier=${c.tier ?? ""}`, `--cfg=${c.cfg ?? ""}`, `--seeds=${chunk.join(",")}`, `--out=${f}`], { stdio: ["ignore", "ignore", "inherit"] });
      note("batches.jsonl", { cell: c.name, from: chunk[0], to: chunk.at(-1), n: chunk.length, exit: r.status, startedAt });
      if (r.status !== 0) { note("interruptions.jsonl", { kind: "child_failed", cell: c.name, exit: r.status, from: chunk[0] }); process.exit(1); }
      const done = doneNow(), el = (Date.now() - t0) / 60000, rate = (done - already) / Math.max(1e-6, el), fill = Math.round((20 * done) / total);
      console.log(`[${"█".repeat(fill)}${"░".repeat(20 - fill)}] ${done}/${total} ${c.name} 已花 ${el.toFixed(1)} 分，預估剩 ${((total - done) / Math.max(1e-6, rate)).toFixed(0)} 分`);
    }
  }
  console.log("[all-done]");
  process.exit(0);
}

// ── 唯讀複本（照抄 tacticExecV24.js；只讀引擎與 X 的狀態）──────────────────────────────
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const otherSide = (s) => (s === "blue" ? "red" : "blue");
const ENEMY_BITS = ["top", "jungle", "mid", "adc", "sup"];
const bitOf = (role) => { const i = ENEMY_BITS.indexOf(role); return i < 0 ? 0 : 1 << i; };
const typeOf = (c) => (c.type === "buff" ? "buff" : "camp");
const popcount = (m) => { let c = 0; m >>>= 0; while (m) { c += m & 1; m >>>= 1; } return c; };
const r4 = (x) => Math.round(x * 10000) / 10000;

export function makeReplica(T) {
  const { TACTIC_EXEC_V24: C, TACTIC_EXEC_V24_1: C1, TACTIC_EXEC_V24_2: C2, findPath, HERO_RADIUS } = T;
  const seen = (E, S, q, alive) => E._seenV20(S, q, alive);
  const campVisible = (E, S, c, alive) => alive.some((a) => a.side === S && dist(a.pos, c.pos) <= C.seenR);
  function campHpFrac(c) {
    if (Array.isArray(c.members) && c.members.length) { let hp = 0, mx = 0; for (const m of c.members) { mx += m.maxHp ?? 0; if (m.alive && m.hp > 0) hp += m.hp; } return mx > 0 ? hp / mx : 0; }
    return c.maxHp > 0 ? c.hp / c.maxHp : 0;
  }
  function believedCamp(E, X, S, c, alive) {
    if (campVisible(E, S, c, alive)) return { alive: c.alive, intel: "seen", hp: c.alive ? campHpFrac(c) : 0 };
    const m = X.side[S].campMem.get(c.id);
    if (m) return m.alive ? { alive: true, intel: "memory", hp: m.hp } : { alive: E.t >= m.respawnAt, intel: "memory", hp: 1 };
    return { alive: E.t >= (E.rules.campFirstSpawn ?? 30), intel: "prior", hp: 1 };
  }
  function posAgo(X, id, t) { const want = t - C.approachLookback; for (const s of X.hist) if (Math.abs(s.t - want) < 1e-6) return s.pos.get(id) ?? null; return null; }
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
    const JG = bitOf("jungle"), ej = E.players.find((q) => q.side === foe && q.role === "jungle");
    let ejBit = 0, ejKind = "none", ejBit12 = 0, ejAge = -1;
    if (ej && !ej.dead) {
      if (seen(E, S, ej, alive)) { ejBit = eta(ej.pos) <= C.ejNearEta ? JG : 0; ejKind = "seen"; ejBit12 = ejBit; ejAge = 0; }
      else {
        const m = X.side[S].foeMem.get(ej.id), fresh = !!m && E.t - m.t <= C.ejMemFresh;
        ejBit = fresh && eta(m.pos) - (E.t - m.t) > C.ejNearEta ? 0 : JG; ejKind = fresh ? "memory" : "prior"; ejAge = m ? E.t - m.t : -1;
        ejBit12 = fresh ? ejBit : m && E.t - m.t >= C2.ejStaleSec ? JG : 0;
      }
    }
    const s05 = (nowOrAppr & ~JG) | ejBit, s05reach = s05 | (reach & ~JG), s12 = (nowOrAppr & ~JG) | ejBit12;
    return { s05: popcount(s05), s05reach: popcount(s05reach), seenNear: popcount(nowOrAppr), mask: s05, ejKind, s12: popcount(s12), ejAge };
  }
  function pAlive12(E, X, S, c, eta) {
    const sd = X.side[S], B = sd.bel.get(c.id) ?? { since: E.rules.campFirstSpawn ?? 30, until: null }, since = B.since ?? B.until;
    if (since == null) return 0;
    const k = E.t + eta - since < C2.freshSec ? "fresh" : "stale", [a, b] = sd.belObs[k];
    return a / (a + b);
  }
  function lambdaTime12(E, X, S) { const sd = X.side[S], el = Math.max(0, E.t - (E.rules.campFirstSpawn ?? 30)); return (sd.ownClears + C2.lambda0 * C2.lambdaT0) / (el + C2.lambdaT0); }
  function econ12(E, X, S, alive, cand, eta) {
    const own = (E.neutrals?.camps ?? []).filter((c) => c.side === S);
    let back = Infinity, availFrom = Infinity;
    for (const c of own) { back = Math.min(back, eta(cand.c.pos, c.pos)); availFrom = Math.min(availFrom, c.alive ? 0 : Number.isFinite(c.respawnAt) ? Math.max(0, c.respawnAt - E.t) : Infinity); }
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
    const succ = (tbl) => Math.min(0.95, tbl[cand.type][cond] / C2.aliveRef[cand.type]);
    const gv = (tbl) => C.value[cand.type] * succ(tbl) * pA * (1 + C1.denyShare);
    return { ev: gv(C1.successP), ev2: gv(C1.successP2), cost, trip, overlap, lam, pA, cond, succ: succ(C1.successP), ownValue, th };
  }
  function exitSafe(E, S, c) {
    const pad = E.rules.towerSafePad ?? 2.5;
    for (const tw of Object.values(E.towers)) { if (tw.side === S || tw.hp <= 0) continue; if (dist(tw.pos, c.pos) < E.towerRange(tw) + pad + C.exitPad) return false; }
    return true;
  }
  function routeLength(E, S, from, to) {
    const pad = E.rules.towerSafePad ?? 2.5, disks = [];
    for (const tw of Object.values(E.towers)) { if (tw.side === S || tw.hp <= 0) continue; const r = E.towerRange(tw) + pad; if (dist(from, tw.pos) < r || dist(to, tw.pos) < r) continue; disks.push({ x: tw.pos.x, y: tw.pos.y, r }); }
    const path = findPath(from, to, HERO_RADIUS, E._aliveStructs, disks);
    if (!path || !path.length) return null;
    let len = 0, a = from; for (const q of path) { len += dist(a, q); a = q; } return len;
  }
  return { C, C1, C2, believedCamp, threatOf, econ12, exitSafe, routeLength, campVisible };
}

/** 決策當下的完整拆解（只讀）。 */
function snapshot(E, X, S, rec, R) {
  const { C, C1, C2 } = R, sd = X.side[S], P = C.postures[sd.posture], alive = E.players.filter((q) => !q.dead);
  const moveSpeed = Math.max(1e-6, E.rules.moveSpeed ?? 5.6), eta = (a, b) => (dist(a, b) * C.detour) / moveSpeed;
  const jg = E.players.find((p) => p.side === S && p.role === "jungle"), foe = otherSide(S);
  const ej = E.players.find((p) => p.side === foe && p.role === "jungle");
  const camps = E.neutrals?.camps ?? [], own = camps.filter((c) => c.side === S), enemy = camps.filter((c) => c.side !== S);
  const out = { t: E.t, d: rec.d, busy: rec.busy ?? null, why: rec.why ?? null };
  if (rec.econFail) out.econFail = rec.econFail;
  if (rec.d === "go") out.go = { target: rec.target, type: rec.targetType, etaJ: rec.etaJ, ev: rec.ev, ev2: rec.ev2, cost: rec.cost, pAlive: rec.pAlive, lambda: rec.lambda, cond: rec.cond, n: rec.n, intel: rec.intel };
  if (!jg) return out;
  const nexus = E.towers[`${S}_nexus`]?.pos;
  out.jg = { x: r4(jg.pos.x), y: r4(jg.pos.y), hp: r4(jg.hp / jg.maxHp), dead: !!jg.dead, state: jg.state ?? null, fsm: jg.fsm ?? null,
    dOwnCamp: r4(Math.min(...own.map((c) => dist(c.pos, jg.pos)))), dEnemyCamp: r4(Math.min(...enemy.map((c) => dist(c.pos, jg.pos)))), dNexus: nexus ? r4(dist(nexus, jg.pos)) : null };
  out.ej = ej ? { dead: !!ej.dead, seen: !ej.dead && E._seenV20(S, ej, alive), dOwnCamp: r4(Math.min(...enemy.map((c) => dist(c.pos, ej.pos)))), memAge: sd.foeMem.get(ej.id) ? r4(E.t - sd.foeMem.get(ej.id).t) : -1 } : null;
  out.own = { alive: own.filter((c) => c.alive).length, n: own.length };
  out.enemyTrue = { alive: enemy.filter((c) => c.alive).length, n: enemy.length };
  if (jg.dead || !P) return out;
  //  每座敵方營地：情報、真值、直線到場、上限、撤退安全；在上限內的再算尋路與經濟（與引擎同一條規則，但不在第一個合格就停）
  out.camps = enemy.map((c) => {
    const b = R.believedCamp(E, X, S, c, alive), type = typeOf(c), etaJ = eta(jg.pos, c.pos), cap = P.etaMax + (type !== "buff" ? C1.campEtaExtra : 0);
    const row = { id: c.id, type, bAlive: !!b.alive, intel: b.intel, tAlive: !!c.alive, eta: r4(etaJ), cap, exit: R.exitSafe(E, S, c) };
    if (!b.alive || etaJ > cap || !row.exit) return row;
    const len = R.routeLength(E, S, jg.pos, c.pos);
    if (len == null) { row.route = null; return row; }
    row.route = r4(len / moveSpeed);
    if (row.route > cap) return row;
    const ev = R.econ12(E, X, S, alive, { c, etaJ: len / moveSpeed, type, hp: b.hp }, eta);
    Object.assign(row, { ev: r4(ev.ev), ev2: r4(ev.ev2), cost: r4(ev.cost), trip: r4(ev.trip), overlap: r4(ev.overlap), lam: r4(ev.lam), pA: r4(ev.pA), cond: ev.cond, succ: r4(ev.succ), ownValue: r4(ev.ownValue), s12: ev.th.s12, seenNear: ev.th.seenNear, ejKind: ev.th.ejKind });
    return row;
  });
  //  與引擎自己的數值比對（出發與第一筆經濟失敗）
  const chk = (ref) => { const row = out.camps.find((x) => x.id === ref.target); return row && row.ev != null ? Math.abs(row.ev - ref.ev) < 2e-4 && Math.abs(row.cost - ref.cost) < 2e-4 : null; };
  if (rec.econFail) out.econCheckFail = chk(rec.econFail);
  if (rec.d === "go") out.econCheckGo = chk({ target: rec.target, ev: rec.ev, cost: rec.cost });
  return out;
}

class HookArr extends Array { static get [Symbol.species]() { return Array; } }

export async function runDiag(e, meta, T) {
  const R = makeReplica(T), X = e.tacExec, evals = { blue: [], red: [] };
  const hook = new HookArr();
  hook.push = function (rec) {
    if (rec && rec.kind === "invade" && X.side[rec.side]?.posture) evals[rec.side].push(snapshot(e, X, rec.side, rec, R));
    return Array.prototype.push.call(this, rec);
  };
  X.log = hook;
  const h = createHash("sha1");
  let ticks = 0;
  while (!e.over && e.t < 3000) {
    e.tick(0.5); ticks++;
    let s = String(e.t);
    for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
    h.update(s + "\n");
  }
  h.update(`END|${e.winner ?? "none"}|${e.t}|${e.exec !== undefined ? JSON.stringify(e.exec) : ""}`);
  const log = [...X.log];
  const tail = log.filter((r) => r.kind === "invade_end" || r.kind === "partner_end").map((r) => ({ t: r.t, side: r.side, kind: r.kind, reason: r.reason, arrived: r.arrived ?? null, n: r.n ?? null, hp1: r.hp1 ?? null, contact: r.contact ?? null }));
  const obs = Object.fromEntries(["blue", "red"].map((S) => [S, { posture: X.obs[S].posture, evals: X.obs[S].evals, starts: X.obs[S].starts, arrived: X.obs[S].arrived, declined: X.obs[S].declined, partnerEnds: X.obs[S].partnerEnds, partnerArrived: X.obs[S].partnerArrived ?? 0, defend: X.obs[S].defend }]));
  return { ...meta, duration: e.t, over: !!e.over, winner: e.winner ?? null, ticks, hash: h.digest("hex").slice(0, 20), obs, tail, evals };
}

if (isMain) {
  const P = await import("./pin_v20_v23_stream.mjs");
  const T = { ...(await import("../../src/battle/moba/tactics/tacticExecV24.js")), ...(await import("../../src/battle/moba/nav/mobaNavigation.js")) };
  const PATH = arg("path"), TIER = arg("tier") || null, CFG = arg("cfg") || null, OUT = arg("out");
  //  --posture=conservative|aggressive|allin（診斷臂，只報）：有入侵意圖的一邊在第一個 tick 之前改成這個傾向（與 measure_tactic_exec_v24 的 pc／pg／pl 同一種做法）。
  //  正式遊戲只會自然出現 auto 與 conservative（postureOf 依 invadeChance）；aggressive／allin 只能這樣量。改了傾向 ⇒ 雜湊本來就不會等於 S14。
  const POSTURE = arg("posture") || null;
  if (POSTURE && !["conservative", "aggressive", "allin", "auto"].includes(POSTURE)) throw new Error(`unknown posture ${POSTURE}`);
  const TPL = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
  for (const seed of arg("seeds", "").split(",").filter(Boolean).map(Number)) {
    const e = PATH === "career" ? P.build("career.v24", "v2.jungle_invasion", null, seed, TIER) : P.build("balanceTool.v24", TPL[CFG][0], TPL[CFG][1], seed, null);
    if (e._tacExecVariant !== "adaptive.v1.3" || e.t !== 0) throw new Error(`expected fresh adaptive.v1.3, got ${e._tacExecVariant}`);
    if (POSTURE) for (const S of ["blue", "red"]) if (e.tacExec.side[S].posture) { e.tacExec.side[S].posture = POSTURE; e.tacExec.obs[S].posture = POSTURE; }
    const row = await runDiag(e, { seed, path: PATH, tier: TIER, cfg: CFG, posture: POSTURE, skills: process.env.ESMO_BALANCE_SKILLS === "on", talents: process.env.ESMO_BALANCE_TALENTS === "on" }, T);
    fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
  }
}
