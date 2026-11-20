#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_cal_invade.mjs — v24 Calibration Sprint：真實戰鬥（Career-Parity）下的入侵診斷（只讀；2026-11-20）
//
//  只在「已用過」的 Seeds 上跑（診斷與調整用，不是驗證）。每場記錄：
//   · 環境：實際生效的技能／被動／成長／天賦／選手能力／佈局／規則集／戰術版本（lib_parity_env_v24.assertEnv；不符就丟錯）
//   · 每邊：出發、到營地、60 秒內搶到、45 秒內帶隊者陣亡、陣亡、被塔擊殺、自家營、敵方營（S5／S6 的同一種計數）
//   · 每次評估（有入侵傾向的一邊）：決策、每座敵方營的合法情報特徵（看見／記憶／先驗、相信活著的起點、敵方打野最後位置與秒數、我方清營速度）
//     與 v1.3 經濟複本（diag_te24_s15_invade.makeReplica）；真值只放在離線標籤欄（tAlive、真值時間線），決策層讀不到
//   · 每次出發：目標、情況、信念、到場時是否真的活著（離線標籤）、結果
//  臂：v13＝目前 v24 規則集（adaptive.v1.3）；off＝v23 行為（工具 ESMO_BALANCE_TACTICEXEC=off；生涯 career.v23）；
//      之後的候選臂由 --variant 指定（工具 ESMO_BALANCE_TACTICEXEC，生涯在第一個 tick 前切換），--tune='{"..."}' 只給消融診斷用。
//  單場：--env=parity --path=tool --cfg=inv --arm=v13 --seeds=142201,142203 --out=<jsonl> [--lite=1]
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : x);
const ENV = arg("env", "parity"), PATH = arg("path", "tool"), TIER = arg("tier") || null, CFG = arg("cfg") || null, ARM = arg("arm", "v13");
const VARIANT = arg("variant") || null, TUNE = arg("tune") ? JSON.parse(arg("tune")) : null, POSTURE = arg("posture") || null, LAYOUT = arg("layout") || null, OUT = arg("out");
//  --lite=1：只記出發那一次的決策快照（正式驗證用；S2／S5／S6 只需要出發、結果與計數），每次評估的特徵不記。
const LITE = arg("lite") === "1";
const L = await import("./lib_parity_env_v24.mjs");
L.applyEnv(ENV);
if (LAYOUT) process.env.ESMO_BALANCE_LAYOUT = LAYOUT;
const P = await import("./pin_v20_v23_stream.mjs");
const T = { ...(await import("../../src/battle/moba/tactics/tacticExecV24.js")), ...(await import("../../src/battle/moba/nav/mobaNavigation.js")) };
const { makeReplica } = await import("./diag_te24_s15_invade.mjs");
const R = makeReplica(T);
const TPL = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };

function build(seed) {
  if (PATH === "tool") {
    const tex = ARM === "off" ? "off" : VARIANT;
    if (tex) process.env.ESMO_BALANCE_TACTICEXEC = tex;
    try { return { e: P.build("balanceTool.v24", TPL[CFG][0], TPL[CFG][1], seed, null), rulesetId: "balanceTool.v24" }; } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
  }
  if (ARM === "off") return { e: P.build("career.v23", "v2.jungle_invasion", null, seed, TIER), rulesetId: "career.v23" };
  const e = P.build("career.v24", "v2.jungle_invasion", null, seed, TIER);
  if (VARIANT && VARIANT !== e._tacExecVariant) throw new Error(`career variant switch not supported here: ${VARIANT}`);
  return { e, rulesetId: "career.v24" };
}

function campFeatures(E, X, S, c, alive, jg) {
  const sd = X.side[S], b = R.believedCamp(E, X, S, c, alive), B = sd.bel?.get(c.id) ?? null, m = sd.campMem.get(c.id) ?? null;
  const foe = S === "blue" ? "red" : "blue", ej = E.players.find((q) => q.side === foe && q.role === "jungle"), em = ej ? sd.foeMem.get(ej.id) : null;
  const ejSeen = !!ej && !ej.dead && E._seenV20(S, ej, alive);
  return { id: c.id, type: c.type === "buff" ? "buff" : "camp", bAlive: !!b.alive, intel: b.intel,
    belSince: B?.since ?? null, belUntil: B?.until ?? null, memT: m?.t ?? null, memAlive: m ? !!m.alive : null, memRespawnAt: m && Number.isFinite(m.respawnAt) ? m.respawnAt : null,
    ejLastT: ejSeen ? E.t : em?.t ?? null, ejLastD: ejSeen ? r4(dist(ej.pos, c.pos)) : em ? r4(dist(em.pos, c.pos)) : null, ejDead: !!ej?.dead,
    eta: jg ? r4((dist(jg.pos, c.pos) * T.TACTIC_EXEC_V24.detour) / Math.max(1e-6, E.rules.moveSpeed ?? 5.6)) : null,
    tAlive: !!c.alive };
}

function runOne(seed) {
  const { e, rulesetId } = build(seed);
  const desc = L.assertEnv(L.describeEngine(e, rulesetId), ENV, PATH, { layout: LAYOUT, variant: ARM === "off" ? null : VARIANT ?? (e._tacExecVariant ?? null) });
  const X = e.tacExec ?? null;
  if (X && POSTURE) for (const S of ["blue", "red"]) if (X.side[S].posture) { X.side[S].posture = POSTURE; X.obs[S].posture = POSTURE; }
  if (X && TUNE) X.tune = { ...(X.tune ?? {}), ...TUNE };
  const evals = { blue: [], red: [] }, truth = {};
  if (X) {
    const hook = []; hook.push = function (rec) {
      if (rec && rec.kind === "invade" && X.side[rec.side]?.posture && (!LITE || rec.d === "go")) {
        const S = rec.side, alive = e.players.filter((q) => !q.dead), jg = e.players.find((p) => p.side === S && p.role === "jungle");
        const v = { t: e.t, d: rec.d, busy: rec.busy ?? null, target: rec.target ?? null, cond: rec.cond ?? null, pAlive: rec.pAlive ?? null, ev: rec.ev ?? null, cost: rec.cost ?? null, n: rec.n ?? null,
          lam: X.v12 ? r4((X.side[S].ownClears + 0.009 * 300) / (Math.max(0, e.t - (e.rules.campFirstSpawn ?? 30)) + 300)) : null, ownClears: X.side[S].ownClears ?? null, belObs: X.side[S].belObs ? { fresh: [...X.side[S].belObs.fresh], stale: [...X.side[S].belObs.stale] } : null,
          jg: jg ? { dead: !!jg.dead, hp: r4(jg.hp / jg.maxHp) } : null,
          camps: jg && !jg.dead ? (e.neutrals?.camps ?? []).filter((c) => c.side !== S).map((c) => campFeatures(e, X, S, c, alive, jg)) : null };
        evals[S].push(v);
      }
      return Array.prototype.push.call(this, rec);
    };
    X.log = hook;
  }
  const h = createHash("sha1"), was = new Map(), campAlive = new Map(), tk = e._towerKillerFor.bind(e), towerKilled = new Set();
  e._towerKillerFor = (foe) => { towerKilled.add(foe.id); return tk(foe); };
  const st = Object.fromEntries(["blue", "red"].map((S) => [S, { deaths: 0, towerDeaths: 0, ownCampKills: 0, enemyCampKills: 0, enemyCampLost: 0 }]));
  const deathT = { blue: [], red: [] }, captures = [];
  for (const c of e.neutrals?.camps ?? []) truth[c.id] = [];
  let ticks = 0;
  while (!e.over && e.t < 3000) {
    e.tick(0.5); ticks++;
    let s = String(e.t);
    for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
    h.update(s + "\n");
    for (const p of e.players) {
      if (p.dead && !was.get(p.id)) { st[p.side].deaths++; if (towerKilled.has(p.id)) st[p.side].towerDeaths++; if (p.role === "jungle") deathT[p.side].push(e.t); }
      if (!p.dead) towerKilled.delete(p.id);
      was.set(p.id, !!p.dead);
    }
    for (const c of e.neutrals?.camps ?? []) {
      const w = campAlive.get(c.id) ?? false;
      if (w !== !!c.alive) truth[c.id].push([e.t, c.alive ? 1 : 0]);
      if (w && !c.alive && c.killerTeam) {
        if (c.killerTeam === c.side) st[c.side].ownCampKills++; else { st[c.killerTeam].enemyCampKills++; st[c.side].enemyCampLost++; captures.push({ t: e.t, side: c.killerTeam, camp: c.id }); }
      }
      campAlive.set(c.id, !!c.alive);
    }
  }
  h.update(`END|${e.winner ?? "none"}|${e.t}|${e.exec !== undefined ? JSON.stringify(e.exec) : ""}`);
  const log = X ? [...X.log] : [];
  const ends = log.filter((r) => r.kind === "invade_end"), partner = log.filter((r) => r.kind === "partner_end");
  const starts = [];
  for (const S of ["blue", "red"]) for (const v of evals[S]) {
    if (v.d !== "go") continue;
    const end = ends.find((x) => x.side === S && x.t >= v.t), tgt = v.camps?.find((c) => c.id === v.target);
    starts.push({ side: S, t: v.t, target: v.target, type: tgt?.type ?? null, cond: v.cond, pAlive: v.pAlive, n: v.n, intel: tgt?.intel ?? null, eta: tgt?.eta ?? null, tAliveAtStart: tgt?.tAlive ?? null,
      arrived: !!end?.arrived, endReason: end?.reason ?? null, endT: end?.t ?? null, hp1: end?.hp1 ?? null,
      captured: captures.some((c) => c.side === S && c.camp === v.target && c.t >= v.t && c.t <= v.t + 60), leaderDied: deathT[S].some((t) => t >= v.t && t <= v.t + 45) });
  }
  const obs = X ? Object.fromEntries(["blue", "red"].map((S) => [S, { posture: X.obs[S].posture, evals: X.obs[S].evals, starts: X.obs[S].starts, arrived: X.obs[S].arrived, declined: X.obs[S].declined, partnerArrived: X.obs[S].partnerArrived ?? 0, partnerEnds: X.obs[S].partnerEnds, defend: { starts: X.obs[S].defend.starts, arrived: X.obs[S].defend.arrived } }])) : null;
  const gold = Object.fromEntries(["blue", "red"].map((S) => [S, Math.round(e.players.filter((p) => p.side === S).reduce((a, p) => a + (p.gold ?? 0), 0))]));
  return { seed, env: ENV, path: PATH, tier: TIER, cfg: CFG, arm: ARM, variant: VARIANT, tune: TUNE, posture: POSTURE, desc, duration: e.t, over: !!e.over, winner: e.winner ?? null, ticks,
    hash: h.digest("hex").slice(0, 20), stats: st, gold, obs, starts, partner: partner.map((r) => ({ t: r.t, side: r.side, reason: r.reason, arrived: r.arrived ?? null })), evals, truth };
}

for (const seed of arg("seeds", "").split(",").filter(Boolean).map(Number)) fs.appendFileSync(OUT, JSON.stringify(runOne(seed)) + "\n");
