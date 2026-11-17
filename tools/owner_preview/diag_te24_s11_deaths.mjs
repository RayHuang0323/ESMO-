#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s11_deaths.mjs — v24 Sprint 1.1 root cause: who dies, when, and how the jungle clock is spent
//  (used seeds only; read-only observer, the engine is not modified — same build path as measure_tactic_exec_v24 --path=tool)
//  Per death: role, phase relative to this side's invasions (during / within 30 s after an invade end of that hero / defender / other),
//  hp at the invade end, location (own jungle / enemy jungle / elsewhere).
//  Per side: jungler seconds spent invading, recalling, dead; own camps cleared.
//  Usage: node tools/owner_preview/diag_te24_s11_deaths.mjs --seeds=98401,98403 [--configs=inv,AB,BA] [--arms=off,adaptive] --out=<json>
// ============================================================================
import fs from "node:fs";
import { careerContext } from "../lib/careerLiveInputs.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = arg("out", null);
const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number);
const CONFIGS = arg("configs", "inv,AB,BA").split(",");
const ARMS = arg("arms", "off,adaptive").split(",");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };

function build(seed, cfg, arm) {
  const [tb, tr] = TEMPLATES[cfg];
  if (arm === "off") process.env.ESMO_BALANCE_TACTICEXEC = "off";
  try { return configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v24").e; }
  finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
}

function runMatch(seed, cfg, arm) {
  const e = build(seed, cfg, arm);
  const deaths = [];
  const wasDead = new Map();
  const lastInvEnd = new Map();     // hero id -> { t, hp, reason }
  const wasInv = new Map(), wasDef = new Map(), lastDefEnd = new Map();
  const jgState = { blue: {}, red: {} };
  const jg = { blue: { invading: 0, recall: 0, dead: 0, ownJungle: 0 }, red: { invading: 0, recall: 0, dead: 0, ownJungle: 0 } };
  const ownCamps = { blue: 0, red: 0 }, campAlive = new Map();
  const camps = () => e.neutrals?.camps ?? [];
  while (!e.over && e.t < 3000) {
    e.tick(0.5);
    for (const p of e.players) {
      const inv = !!(p._invV2 && !p._invV2.done) || !!p._tacPartnerV24;
      const prevInv = wasInv.get(p.id) ?? false;
      if (prevInv && !inv) lastInvEnd.set(p.id, { t: e.t, hp: p.dead ? 0 : p.hp / p.maxHp, reason: p._invV2?.reason ?? "partner" });
      wasInv.set(p.id, inv);
      const def = !!p._defV24, prevDef = wasDef.get(p.id) ?? false;
      if (prevDef && !def) lastDefEnd.set(p.id, e.t);
      wasDef.set(p.id, def);
      if (p.role === "jungle") {
        const J = jg[p.side];
        const sk = p.dead ? "dead" : `${p.state ?? "-"}`; jgState[p.side][sk] = (jgState[p.side][sk] ?? 0) + 0.5;
        if (p.dead) J.dead += 0.5; else if (inv) J.invading += 0.5; else if ((p.recallT ?? 0) > 0 || p.state === "回城" || p.state === "回城中") J.recall += 0.5;
        else if (camps().some((c) => c.side === p.side && dist(c.pos, p.pos) <= 12)) J.ownJungle += 0.5;
      }
      const was = wasDead.get(p.id) ?? false;
      if (p.dead && !was) {
        const le = lastInvEnd.get(p.id);
        const near = camps().filter((c) => dist(c.pos, p.pos) <= 20);
        const loc = near.some((c) => c.side === p.side) ? "own_jungle" : near.length ? "enemy_jungle" : "other";
        let phase = "other";
        if (inv || prevInv) phase = "during_invade";
        else if (le && e.t - le.t <= 30) phase = "after_invade_30s";
        else if (le && e.t - le.t <= 90) phase = "after_invade_90s";
        if (p._defV24 || prevDef) phase = "defending";
        else if (phase === "other" && lastDefEnd.has(p.id) && e.t - lastDefEnd.get(p.id) <= 30) phase = "after_defend_30s";
        deaths.push({ t: e.t, side: p.side, role: p.role, phase, loc, leHp: le?.hp ?? null, leReason: le?.reason ?? null });
      }
      wasDead.set(p.id, p.dead);
    }
    for (const c of camps()) {
      const was = campAlive.get(c.id) ?? false;
      if (was && !c.alive && c.killerTeam === c.side) ownCamps[c.side]++;
      campAlive.set(c.id, c.alive);
    }
  }
  return { seed, cfg, arm, winner: e.winner ?? null, duration: +e.t.toFixed(1), deaths, jg, jgState, ownCamps };
}

if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [], t0 = Date.now(), N = seeds.length * CONFIGS.length * ARMS.length;
for (const s of seeds) for (const cfg of CONFIGS) for (const arm of ARMS) {
  rows.push(runMatch(s, cfg, arm));
  process.stderr.write(`[deaths] ${cfg} ${arm} seed ${s} (${rows.length}/${N})\n`);
}
fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_te24_s11_deaths", seeds, configs: CONFIGS, arms: ARMS, wallSec: Math.round((Date.now() - t0) / 1000), rows }));
console.log(JSON.stringify({ ok: true, n: rows.length, wallSec: Math.round((Date.now() - t0) / 1000) }));
