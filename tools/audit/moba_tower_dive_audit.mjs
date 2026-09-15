#!/usr/bin/env node
// ============================================================================
//  tools/audit/moba_tower_dive_audit.mjs — Tower Dive Audit（只量測、找根因，不修任何塔規則）
//
//  用法：node tools/audit/moba_tower_dive_audit.mjs [--seeds=10] [--out=reports/moba-tower-dive-audit]
//
//  做法：照正式配置（OFF，與 balance runner 同一個 configure）暖機（預設 150 秒；後期情境 1200 秒），
//  然後清兵線、停出兵、其他英雄移出場外（dead + 超長復活），用瞬移擺出情境。
//  三類量測：
//    pinned  每 tick 前把英雄釘在固定距離 ⇒ 只量「塔」本身（射程、攻速、傷害、仇恨、兵線坦傷）
//    ai      只擺起點，之後交給 AI（守方可選擇釘在塔下）⇒ 量 AI 的越塔決策、吃幾發、何時撤、死不死
//    late    真實對局在 10／15／20／25 分的英雄血量與 lateFactor ⇒ 塔單發佔最大生命的比例
//  開火判定：塔冷卻在 tick 開頭遞減、開火時設回 towerAttackInterval
//    ⇒ tick 結束時 atkCd === towerAttackInterval 就是「這個 tick 開火」，目標看 targetKind／targetId。
//  決定性：引擎 rng 由 seed 決定；所有距離都是 tick 當下實測值。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const [LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData, runner] = await Promise.all([
  load("src/LogicEngine.js"), load("src/data/heroDatabase.js"), load("src/battle/moba/mobaHeroProfile.js"),
  load("src/data/heroCombatArchetypes.js"), load("src/battle/moba/mobaHeroLoadout.js"), load("src/platform/contracts/MobaTacticConfig.js"),
  load("src/battle/moba/items/itemsEngineAdapter.js"), load("src/battle/moba/items/itemCatalog.js"), load("src/battle/moba/items/itemEconomy.js"),
  load("src/battle/moba/items/itemInventory.js"), load("src/gameData.js"), load("tools/balance/moba_items_balance_runner.mjs"),
]);
const M = { LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData };
const { posOnLane, FOUNTAIN } = gameData;

const DT = 0.5;
const SEEDS = Number(arg("seeds", 10));
const OUT = path.resolve(ROOT, arg("out", "reports/moba-tower-dive-audit"));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (from, to) => { const d = dist(from, to) || 1; return { x: (to.x - from.x) / d, y: (to.y - from.y) / d }; };
const along = (o, u, k) => ({ x: o.x + u.x * k, y: o.y + u.y * k });
const r2 = (v) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 100) / 100);
const pct = (p) => r2((p.hp / p.maxHp) * 100);
const avg = (xs) => { const a = xs.filter((x) => Number.isFinite(x)); return a.length ? r2(a.reduce((x, y) => x + y, 0) / a.length) : null; };

const lateFactorOf = (e) => {
  const R = e.rules;
  return 1 + Math.max(0, e.t - 360) / 600 + (R.lateAccelT ? Math.max(0, e.t - R.lateAccelT) / R.lateAccelDiv : 0);
};
const fired = (e, tw) => tw.atkCd === e.rules.towerAttackInterval;
const firedOnHero = (e, tw, heroId) => fired(e, tw) && tw.targetKind === "hero" && tw.targetId === heroId;
/** 開火當下用的增幅：開火後 lockShots 已 +1 ⇒ 用的是 lockShots − 1。 */
const shotDamage = (e, tw, lf) => {
  const R = e.rules;
  return R.towerAggroDmg * R.towerAttackInterval * lf * Math.min(R.towerLockRampMax ?? 1, 1 + Math.max(0, (tw.lockShots ?? 1) - 1) * (R.towerLockRamp ?? 0));
};

// ─────────────────────────────────────────────────────────────────────────────
//  場景基底
// ─────────────────────────────────────────────────────────────────────────────
function base(seed, { warmS = 150, lateT = null } = {}) {
  const { e } = runner.configure(seed, "off", M);
  let tmpl = null;
  for (let i = 0; i < warmS / DT && !e.over; i++) {
    e.tick(DT);
    for (const ln of ["mid", "top", "bot"]) if (!tmpl && e.lanes[ln].bm[0]) tmpl = JSON.parse(JSON.stringify(e.lanes[ln].bm[0]));
  }
  if (!tmpl) throw new Error(`seed ${seed}: 暖機後找不到小兵樣板`);
  for (const ln of ["top", "mid", "bot"]) { e.lanes[ln].bm = []; e.lanes[ln].rm = []; }
  e.waveTimer = 1e9;
  for (const p of e.players) { p.dead = true; p.respawn = 1e9; }
  if (lateT != null) e.t = lateT;
  return { e, tmpl, warmS: e.t };
}
function revive(e, p, hpFrac, pos) {
  p.dead = false; p.respawn = 0;
  p.hp = p.maxHp * hpFrac;
  p.retreating = false; p.retreatDeep = false; p.retreatHolding = false;
  p.hitBy?.clear?.();
  p.towerHits = 0; p.recallT = 0; p.reengageAt = 0; p.chaseId = null;
  p.fsm = "LANE"; p.towerThreatUntil = 0;
  e._navTeleport(p, pos);
}
const hero = (e, id) => e.players.find((p) => p.id === id);
/** 紅方路塔：優先中路最外側還活著的，否則任一路最外側還活著的。 */
function redLaneTower(e) {
  const alive = Object.entries(e.towers).filter(([, t]) => t.side === "red" && ["top", "mid", "bot"].includes(t.lane) && t.hp > 0);
  const outer = (ln) => alive.filter(([, t]) => t.lane === ln).sort((a, b) => a[1].t - b[1].t)[0];
  return outer("mid") ?? outer("top") ?? outer("bot") ?? null;
}
const guardTower = (e, side) => Object.entries(e.towers).filter(([, t]) => t.side === side && t.lane === "nexus_guard" && t.hp > 0)[0] ?? null;

/** 藍方小兵在紅塔前：沿 lane 往藍方（t 變小）找世界距離 ≥ target 的 t。 */
function tForDist(ln, tw, target) {
  for (let t = tw.t; t >= 0; t -= 0.0005) if (dist(posOnLane(ln, t), tw.pos) >= target) return t;
  return 0;
}
function makeMinion(tmpl, i, t) {
  const m = JSON.parse(JSON.stringify(tmpl));
  m.id = `audit_m${i}`; m.t = t; m.hp = tmpl.maxHp ?? tmpl.hp;
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
//  pinned：只量塔
// ─────────────────────────────────────────────────────────────────────────────
function runPinned(seed, o) {
  const { e, tmpl } = base(seed, { lateT: o.lateT ?? null });
  const R = e.rules;
  const [twId, tw] = o.tower === "guard" ? guardTower(e, "red") : redLaneTower(e);
  //  門牙塔不在任何 lane 上（lane = nexus_guard）；門牙塔測試不放小兵
  const ln = o.tower === "guard" ? "mid" : tw.lane;
  const u = o.tower === "guard" ? unit(tw.pos, FOUNTAIN.blue) : unit(tw.pos, posOnLane(ln, tw.t - 0.08));
  const diver = hero(e, "b3");
  revive(e, diver, 1, along(tw.pos, u, o.d));
  let def = null;
  if (o.defender) { def = hero(e, "r3"); revive(e, def, 1, along(tw.pos, u, 1.5)); }
  const minionTs = o.tower === "guard" ? [] : (o.waveDists ?? []).map((d) => tForDist(ln, tw, d));
  if (minionTs.length) e.lanes[ln].bm = minionTs.map((t, i) => makeMinion(tmpl, i, t));
  const ticks = Math.round((o.dur ?? 10) / DT);
  const out = { shots: 0, measuredDmg: 0, formulaDmg: 0, shotDmg: [], shotT: [], minionShots: 0, measuredD: [], targetKinds: {}, threatTicks: 0, attackTicks: 0, lockMax: 0 };
  for (let i = 0; i < ticks; i++) {
    const inPhase = !o.flicker || (i % o.flicker.period) < o.flicker.inTicks;
    e._navTeleport(diver, along(tw.pos, u, inPhase ? o.d : o.flicker.outD));
    diver.hp = diver.maxHp;
    if (def) { def.dead = false; def.hp = def.maxHp; e._navTeleport(def, along(tw.pos, u, 1.5)); }
    if (o.forceThreat) diver.towerThreatUntil = e.t + (R.towerChampionThreatT ?? 3);
    for (let k = 0; k < minionTs.length; k++) {
      const m = e.lanes[ln].bm.find((x) => x.id === `audit_m${k}`);
      if (m) { m.t = minionTs[k]; m.hp = tmpl.maxHp ?? tmpl.hp; } else e.lanes[ln].bm.push(makeMinion(tmpl, k, minionTs[k]));
    }
    out.measuredD.push(r2(dist(diver.pos, tw.pos)));
    const hp0 = diver.hp, dfHp0 = def?.hp;
    const lf = lateFactorOf(e) + 0;   // tick 內 t 先 +dt 再算 lateFactor：取 tick 後的值
    e.tick(DT);
    const lfNow = lateFactorOf(e);
    if ((diver.towerThreatUntil ?? 0) > e.t) out.threatTicks++;
    if (def && def.hp < dfHp0) out.attackTicks++;
    const kind = tw.targetKind ?? "none";
    out.targetKinds[kind] = (out.targetKinds[kind] ?? 0) + 1;
    out.lockMax = Math.max(out.lockMax, tw.lockShots ?? 0);
    if (firedOnHero(e, tw, diver.id)) {
      out.shots++;
      const f = shotDamage(e, tw, lfNow);
      out.formulaDmg += f; out.shotDmg.push(r2(f)); out.shotT.push(r2(e.t));
      if (!def) out.measuredDmg += hp0 - diver.hp;
    } else if (fired(e, tw) && tw.targetKind === "minion") out.minionShots++;
    out.lateFactor = r2(lfNow);
    void lf;
  }
  const ds = out.measuredD, secs = ticks * DT;
  return {
    seed, tower: twId, towerLane: tw.lane, engineTowerRange: e.towerRange(tw), heroAggroRange: R.towerAggroRange,
    dReq: o.d, dMeasured: { min: Math.min(...ds), max: Math.max(...ds) },
    shots: out.shots, shotsPerSec: r2(out.shots / secs), minionShotsPerSec: r2(out.minionShots / secs),
    formulaDmgPctPerSec: r2((out.formulaDmg / diver.maxHp) * 100 / secs),
    measuredDmgPctPerSec: def ? null : r2((out.measuredDmg / diver.maxHp) * 100 / secs),
    shotDmg: out.shotDmg.slice(0, 10), lockShotsMax: out.lockMax, targetKinds: out.targetKinds, threatTicks: out.threatTicks,
    diverHitDefenderTicks: def ? out.attackTicks : null, diverEngageRange: e._engageRange(diver), lateFactor: out.lateFactor, diverMaxHp: r2(diver.maxHp),
    minionWorldD: minionTs.map((t) => r2(dist(posOnLane(ln, t), tw.pos))), minionDt: minionTs.map((t) => Math.round(Math.abs(t - tw.t) * 10000) / 10000),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ai：量 AI
// ─────────────────────────────────────────────────────────────────────────────
function runAi(seed, sc) {
  const { e, tmpl, warmS } = base(seed, { warmS: sc.warmS ?? 150 });
  const R = e.rules;
  const pick = redLaneTower(e);
  if (!pick) return null;
  const [twId, tw] = pick;
  const ln = tw.lane;
  const u = unit(tw.pos, posOnLane(ln, tw.t - 0.08));
  const start = sc.start ?? 9;
  const diver = hero(e, sc.diverId ?? "b3"), def = hero(e, "r3");
  const defSpot = along(tw.pos, u, sc.defDist ?? 1.5);
  revive(e, def, sc.defHp, defSpot);
  revive(e, diver, sc.diverHp, along(tw.pos, u, start));
  const allies = (sc.allies ?? []).map((id, i) => { const p = hero(e, id); revive(e, p, sc.allyHp ?? 1, along(tw.pos, u, start + 1.2 + i)); return p; });
  if (sc.wave) e.lanes[ln].bm = Array.from({ length: sc.wave }, (_, i) => makeMinion(tmpl, i, tForDist(ln, tw, 2 + i * 0.8)));
  const RANGE = R.towerAggroRange;
  const rel = () => r2(e.t - warmS);
  const s = {
    seed, tower: twId, t0: r2(warmS), lateFactor0: r2(lateFactorOf(e)), diverId: diver.id, diverRole: diver.role,
    diverArch: e._arch(diver)?.id ?? e._arch(diver)?.arch ?? null, diverEngageRange: e._engageRange(diver), defEngageRange: e._engageRange(def),
    diverMaxHp: r2(diver.maxHp), diverPower: r2(diver.power), defMaxHp: r2(def.maxHp), defPower: r2(def.power),
    entered: false, firstInT: null, inRangeSec: 0, towerShots: 0, towerDmgPct: 0, maxConsecShots: 0, shotsOnAllies: 0,
    exitT: null, hpAtExit: null, minHp: 100, diverDied: false, diverDeathT: null, defDied: false, defDeathT: null,
    diverHitDefFromOutsideRangeTicks: 0, diverHitDefInsideRangeTicks: 0,
    retreatT: null, retreatHp: null, shotsAfterRetreat: 0, retreatToOutSec: null, minD: Infinity,
    states: {}, intents: {}, assessWhy: {}, zoneBlocks: {}, allyMinD: allies.map(() => Infinity),
  };
  let consec = 0;
  const trace = [];
  for (let i = 0; i < Math.round(sc.dur / DT); i++) {
    if (sc.holdDef && !def.dead) e._navTeleport(def, defSpot);
    const hpBefore = diver.hp, defHpBefore = def.hp;
    e.tick(DT);
    const lf = lateFactorOf(e);
    const d = dist(diver.pos, tw.pos);
    allies.forEach((a, k) => { if (!a.dead) s.allyMinD[k] = Math.min(s.allyMinD[k], dist(a.pos, tw.pos)); if (firedOnHero(e, tw, a.id)) s.shotsOnAllies++; });
    if (!diver.dead) {
      s.minD = Math.min(s.minD, d);
      if (d < RANGE) { s.inRangeSec += DT; if (!s.entered) { s.entered = true; s.firstInT = rel(); } }
      else if (s.entered && s.exitT == null) { s.exitT = rel(); s.hpAtExit = pct(diver); }
      s.minHp = Math.min(s.minHp, pct(diver));
      if (!def.dead && def.hp < defHpBefore) { if (d < RANGE) s.diverHitDefInsideRangeTicks++; else s.diverHitDefFromOutsideRangeTicks++; }
      if (firedOnHero(e, tw, diver.id)) {
        s.towerShots++; consec++; s.maxConsecShots = Math.max(s.maxConsecShots, consec);
        s.towerDmgPct += Math.min(shotDamage(e, tw, lf), hpBefore - 1) / diver.maxHp * 100;
        if (s.retreatT != null) s.shotsAfterRetreat++;
      } else if (d >= RANGE) consec = 0;
      if (diver.retreating && s.retreatT == null) { s.retreatT = rel(); s.retreatHp = pct(diver); }
      if (s.retreatT != null && s.retreatToOutSec == null && d >= RANGE && s.entered) s.retreatToOutSec = r2(rel() - s.retreatT);
      const st = diver.actionState ?? diver.state ?? "?";
      s.states[st] = (s.states[st] ?? 0) + 1;
      if (diver.intent) s.intents[diver.intent] = (s.intents[diver.intent] ?? 0) + 1;
      if (diver.dbgTower && !diver.dbgTower.allow) {
        const why = !diver.dbgTower.hp ? "hp" : diver.dbgTower.shots >= (R.diveMaxShots ?? 3) ? "shots" : "noWaveNoKill";
        s.zoneBlocks[why] = (s.zoneBlocks[why] ?? 0) + 1;
      }
      if (!def.dead && d <= e.towerRange(tw) + 4 && def.hp <= def.maxHp * (R.diveKillHp ?? 0.35)) {
        const a = e._diveAssessV18(diver, def, tw, e.players.filter((p) => !p.dead));
        const k = a.ok ? "ok" : a.why;
        s.assessWhy[k] = (s.assessWhy[k] ?? 0) + 1;
      }
    }
    if (diver.dead && !s.diverDied) { s.diverDied = true; s.diverDeathT = rel(); }
    if (def.dead && !s.defDied) { s.defDied = true; s.defDeathT = rel(); }
    if (i % 2 === 1 && trace.length < 40) {
      trace.push({ t: rel(), d: r2(d), hp: diver.dead ? 0 : pct(diver), defHp: def.dead ? 0 : pct(def), ret: !!diver.retreating,
        st: diver.actionState ?? diver.state, intent: diver.intent ?? null, tower: tw.targetKind ? `${tw.targetKind}:${tw.targetId}:${tw.lockShots}` : null,
        zone: diver.dbgTower ?? null, towerHits: diver.towerHits ?? 0 });
    }
  }
  s.minD = r2(s.minD); s.towerDmgPct = r2(s.towerDmgPct); s.allyMinD = s.allyMinD.map(r2);
  return { summary: s, trace };
}

// ─────────────────────────────────────────────────────────────────────────────
//  late：真實對局的血量與 lateFactor
// ─────────────────────────────────────────────────────────────────────────────
function lateSample(seed) {
  const { e } = runner.configure(seed, "off", M);
  const R = e.rules;
  const out = [];
  for (const T of [600, 900, 1200, 1500]) {
    while (e.t < T && !e.over) e.tick(DT);
    if (e.over) break;
    const lf = lateFactorOf(e);
    const hp = avg(e.players.map((p) => p.maxHp));
    const shot = R.towerAggroDmg * R.towerAttackInterval * lf;
    out.push({ seed, t: T, lateFactor: r2(lf), heroMaxHpMean: hp, shot: r2(shot), shotPctMaxHp: r2(shot / hp * 100),
      shotPctMaxHpAtRampMax: r2(shot * (R.towerLockRampMax ?? 1) / hp * 100), heroPowerMean: avg(e.players.map((p) => p.power)) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  測試清單
// ─────────────────────────────────────────────────────────────────────────────
const PINNED = [
  //  射程：路塔（塔打英雄 dist < towerAggroRange；AI 塔區 dist <= towerRange）
  ...[4, 5.8, 6.2, 7].map((d) => ({ id: `range_lane_d${d}`, tower: "lane", d, dur: 10 })),
  //  射程：門牙塔（AI 塔區 nexusGuardRange 13；塔打英雄的候選仍用 towerAggroRange）
  ...[4, 5.8, 6.2, 9, 12].map((d) => ({ id: `range_guard_d${d}`, tower: "guard", d, dur: 10 })),
  //  攻速／連續命中增幅
  { id: "cadence_lane_12s", tower: "lane", d: 3, dur: 12 },
  { id: "cadence_guard_12s", tower: "guard", d: 3, dur: 12 },
  //  進出射程：每 3 秒出去 0.5 秒
  { id: "flicker_lane", tower: "lane", d: 3, dur: 24, flicker: { period: 7, inTicks: 6, outD: 7 } },
  { id: "flicker_guard", tower: "guard", d: 3, dur: 24, flicker: { period: 7, inTicks: 6, outD: 7 } },
  //  小兵坦塔：己方小兵在世界射程內
  { id: "wave_in_range_hero_idle", tower: "lane", d: 3, dur: 10, waveDists: [2.5, 3.5] },
  //  仇恨切換：有兵線＋塔下敵方英雄（自然出手）
  { id: "wave_defender_natural", tower: "lane", d: 3, dur: 10, waveDists: [2.5, 3.5], defender: true },
  //  仇恨切換：有兵線＋直接標記「攻擊塔下英雄」（只量塔端）
  { id: "wave_forced_threat", tower: "lane", d: 3, dur: 10, waveDists: [2.5, 3.5], forceThreat: true },
  //  判定不一致：小兵在 lane band（|Δt| < 0.05）內、但世界距離在射程外
  { id: "band_minion_out_of_world_range", tower: "lane", d: 3, dur: 10, waveDists: [9] },
  { id: "band_minion_out_of_world_range_forced_threat", tower: "lane", d: 3, dur: 10, waveDists: [9], forceThreat: true },
];
const AI = [
  //  守方固定在塔下（越塔題目本身）
  { id: "S1_full_solo_no_wave", diverHp: 1, defHp: 1, holdDef: true, dur: 30 },
  { id: "S2_half_solo_no_wave", diverHp: 0.5, defHp: 1, holdDef: true, dur: 30 },
  { id: "S3_full_vs_low_enemy", diverHp: 1, defHp: 0.2, holdDef: true, dur: 30 },
  { id: "S3b_half_vs_low_enemy", diverHp: 0.5, defHp: 0.2, holdDef: true, dur: 30 },
  { id: "S4_full_vs_full_with_wave", diverHp: 1, defHp: 1, wave: 4, holdDef: true, dur: 30 },
  { id: "S4b_full_vs_low_with_wave", diverHp: 1, defHp: 0.2, wave: 4, holdDef: true, dur: 30 },
  { id: "S5_2v1_full_vs_low", diverHp: 1, defHp: 0.4, allies: ["b1"], holdDef: true, dur: 30 },
  { id: "S5b_3v1_full_vs_low", diverHp: 1, defHp: 0.4, allies: ["b1", "b2"], holdDef: true, dur: 30 },
  { id: "S5c_3v1_full_vs_full", diverHp: 1, defHp: 1, allies: ["b1", "b2"], holdDef: true, dur: 30 },
  { id: "S6_start_inside_range_half_hp", diverHp: 0.5, defHp: 1, start: 3, holdDef: true, dur: 30 },
  { id: "S6b_start_inside_range_full_hp_vs_full", diverHp: 1, defHp: 1, start: 3, holdDef: true, dur: 30 },
  //  守方自由（參照：守方會不會自己出塔）
  { id: "R1_free_defender_full_vs_low", diverHp: 1, defHp: 0.2, dur: 30 },
  //  後期（真實 20 分鐘英雄等級與 lateFactor）
  { id: "L1_late_full_solo", diverHp: 1, defHp: 1, holdDef: true, dur: 30, warmS: 1200 },
  { id: "L3_late_full_vs_low", diverHp: 1, defHp: 0.2, holdDef: true, dur: 30, warmS: 1200 },
  { id: "L5_late_3v1_vs_low", diverHp: 1, defHp: 0.4, allies: ["b1", "b2"], holdDef: true, dur: 30, warmS: 1200 },
  { id: "L6_late_start_inside_half", diverHp: 0.5, defHp: 1, start: 3, holdDef: true, dur: 30, warmS: 1200 },
  //  近戰越塔（上路 b1：戰士／坦克；攻擊距離短於塔射程 ⇒ 要打塔下目標必須進塔）
  { id: "M1_melee_full_solo", diverId: "b1", diverHp: 1, defHp: 1, holdDef: true, dur: 30 },
  { id: "M2_melee_half_solo", diverId: "b1", diverHp: 0.5, defHp: 1, holdDef: true, dur: 30 },
  { id: "M3_melee_full_vs_low", diverId: "b1", diverHp: 1, defHp: 0.2, holdDef: true, dur: 30 },
  { id: "M3b_melee_half_vs_low", diverId: "b1", diverHp: 0.5, defHp: 0.2, holdDef: true, dur: 30 },
  { id: "M4_melee_full_vs_full_with_wave", diverId: "b1", diverHp: 1, defHp: 1, wave: 4, holdDef: true, dur: 30 },
  { id: "M4b_melee_full_vs_low_with_wave", diverId: "b1", diverHp: 1, defHp: 0.2, wave: 4, holdDef: true, dur: 30 },
  { id: "M5_melee_2v1_vs_low", diverId: "b1", diverHp: 1, defHp: 0.4, allies: ["b2"], holdDef: true, dur: 30 },
  { id: "M5b_melee_3v1_vs_low", diverId: "b1", diverHp: 1, defHp: 0.4, allies: ["b2", "b4"], holdDef: true, dur: 30 },
  { id: "M5c_melee_3v1_vs_full", diverId: "b1", diverHp: 1, defHp: 1, allies: ["b2", "b4"], holdDef: true, dur: 30 },
  { id: "M6_melee_start_inside_half", diverId: "b1", diverHp: 0.5, defHp: 1, start: 3, holdDef: true, dur: 30 },
  { id: "ML3_late_melee_full_vs_low", diverId: "b1", diverHp: 1, defHp: 0.2, holdDef: true, dur: 30, warmS: 1200 },
  { id: "ML5_late_melee_3v1_vs_low", diverId: "b1", diverHp: 1, defHp: 0.4, allies: ["b2", "b4"], holdDef: true, dur: 30, warmS: 1200 },
  { id: "ML6_late_melee_start_inside_half", diverId: "b1", diverHp: 0.5, defHp: 1, start: 3, holdDef: true, dur: 30, warmS: 1200 },
];

const RULE_KEYS = ["towerAggroRange", "nexusGuardRange", "towerAggroDmg", "towerAttackInterval", "towerMinionDamage", "towerLockRamp", "towerLockRampMax",
  "towerChampionThreatT", "towerRangeWorld", "towerMinionBand", "lateAccelT", "lateAccelDiv", "diveMinHp", "diveMaxShots", "diveKillHp", "diveAssess",
  "diveMaxTtk", "diveSafetyMargin", "diveEscapeMargin", "towerSafePad", "riskAssess", "decisionV17", "moveSpeed", "fightSpeed", "retreatSpeedMult",
  "baseRetreatBonus", "dmgK", "heroTowerDmg", "heroTowerSoloK", "heroTowerGroupK", "nexusGuardNoWaveK", "nexusWaveGate"];

const t0 = Date.now();
const { e: probe } = runner.configure(1, "off", M);
const rules = Object.fromEntries(RULE_KEYS.map((k) => [k, probe.rules[k] ?? null]));
const pinned = [];
for (const o of PINNED) for (let seed = 1; seed <= 3; seed++) pinned.push({ id: o.id, ...runPinned(seed, o) });
const ai = [];
for (const sc of AI) for (let seed = 1; seed <= SEEDS; seed++) { const r = runAi(seed, sc); if (r) ai.push({ id: sc.id, ...r }); }
const late = [];
for (let seed = 1; seed <= 3; seed++) late.push(...lateSample(seed));

//  彙整
const agg = {};
for (const r of ai) {
  const a = (agg[r.id] ??= { n: 0, entered: 0, inRangeSec: 0, towerShots: 0, towerDmgPct: 0, maxConsec: 0, diverDied: 0, defDied: 0, retreat: 0, retreatHp: [], hpAtExit: [], minHp: [], shotsAfterRetreat: 0, retreatToOut: [], minD: [], shotsOnAllies: 0, hitOut: 0, hitIn: 0, engage: [], lf: [], assessWhy: {}, zoneBlocks: {}, states: {}, intents: {} });
  const s = r.summary;
  a.n++; a.entered += s.entered ? 1 : 0; a.inRangeSec += s.inRangeSec; a.towerShots += s.towerShots; a.towerDmgPct += s.towerDmgPct;
  a.maxConsec = Math.max(a.maxConsec, s.maxConsecShots); a.diverDied += s.diverDied ? 1 : 0; a.defDied += s.defDied ? 1 : 0;
  if (s.retreatT != null) { a.retreat++; a.retreatHp.push(s.retreatHp); }
  if (s.hpAtExit != null) a.hpAtExit.push(s.hpAtExit);
  if (s.retreatToOutSec != null) a.retreatToOut.push(s.retreatToOutSec);
  a.minHp.push(s.minHp); a.shotsAfterRetreat += s.shotsAfterRetreat; a.minD.push(s.minD); a.shotsOnAllies += s.shotsOnAllies;
  a.hitOut += s.diverHitDefFromOutsideRangeTicks; a.hitIn += s.diverHitDefInsideRangeTicks; a.engage.push(s.diverEngageRange); a.lf.push(s.lateFactor0);
  for (const [k, v] of Object.entries(s.assessWhy)) a.assessWhy[k] = (a.assessWhy[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.zoneBlocks)) a.zoneBlocks[k] = (a.zoneBlocks[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.states)) a.states[k] = (a.states[k] ?? 0) + v;
  for (const [k, v] of Object.entries(s.intents)) a.intents[k] = (a.intents[k] ?? 0) + v;
}
const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n);
const aiSummary = Object.fromEntries(Object.entries(agg).map(([id, a]) => [id, {
  n: a.n, lateFactor0: avg(a.lf), diverEngageRangeMean: avg(a.engage),
  enteredRate: r2(a.entered / a.n), inRangeSecMean: r2(a.inRangeSec / a.n), towerShotsMean: r2(a.towerShots / a.n),
  towerDmgPctMean: r2(a.towerDmgPct / a.n), maxConsecShots: a.maxConsec, diverDiedRate: r2(a.diverDied / a.n), enemyDiedRate: r2(a.defDied / a.n),
  minHpMean: avg(a.minHp), retreatRate: r2(a.retreat / a.n), retreatHpMean: avg(a.retreatHp), hpAtExitMean: avg(a.hpAtExit),
  shotsAfterRetreatMean: r2(a.shotsAfterRetreat / a.n), retreatToOutSecMean: avg(a.retreatToOut), minDMean: avg(a.minD), shotsOnAlliesMean: r2(a.shotsOnAllies / a.n),
  diverHitDefTicksOutsideRange: a.hitOut, diverHitDefTicksInsideRange: a.hitIn,
  assessWhy: a.assessWhy, zoneBlocks: a.zoneBlocks, topStates: top(a.states, 5), topIntents: top(a.intents, 4),
}]));
const pinnedSummary = {};
for (const r of pinned) {
  const p = (pinnedSummary[r.id] ??= { lane: r.towerLane, engineTowerRange: r.engineTowerRange, heroAggroRange: r.heroAggroRange, diverEngageRange: [], dMeasured: [], shotsPerSec: [], minionShotsPerSec: [], formulaDmgPctPerSec: [], measuredDmgPctPerSec: [], lockShotsMax: [], targetKinds: [], threatTicks: [], diverHitDefenderTicks: [], lateFactor: r.lateFactor, shotDmgSeed1: null, minionWorldD: r.minionWorldD, minionDt: r.minionDt });
  p.diverEngageRange.push(r.diverEngageRange); p.dMeasured.push(r.dMeasured.min); p.shotsPerSec.push(r.shotsPerSec); p.minionShotsPerSec.push(r.minionShotsPerSec);
  p.formulaDmgPctPerSec.push(r.formulaDmgPctPerSec); p.measuredDmgPctPerSec.push(r.measuredDmgPctPerSec); p.lockShotsMax.push(r.lockShotsMax);
  p.targetKinds.push(r.targetKinds); p.threatTicks.push(r.threatTicks); p.diverHitDefenderTicks.push(r.diverHitDefenderTicks);
  if (r.seed === 1) p.shotDmgSeed1 = r.shotDmg;
}
const lateSummary = Object.fromEntries([600, 900, 1200, 1500].map((T) => {
  const xs = late.filter((x) => x.t === T);
  return [T, { n: xs.length, lateFactor: avg(xs.map((x) => x.lateFactor)), heroMaxHpMean: avg(xs.map((x) => x.heroMaxHpMean)), shot: avg(xs.map((x) => x.shot)),
    shotPctMaxHp: avg(xs.map((x) => x.shotPctMaxHp)), shotPctMaxHpAtRampMax: avg(xs.map((x) => x.shotPctMaxHpAtRampMax)), heroPowerMean: avg(xs.map((x) => x.heroPowerMean)) }];
}));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify({ tool: "moba-tower-dive-audit.v1", dt: DT, seeds: SEEDS, rules, lateSummary, pinnedSummary, aiSummary, late, pinned, ai }, null, 2), "utf8");
console.log(JSON.stringify({ rules }));
console.log("LATE", JSON.stringify(lateSummary));
for (const [id, p] of Object.entries(pinnedSummary)) console.log("PIN", id, JSON.stringify(p));
for (const [id, a] of Object.entries(aiSummary)) console.log("AI ", id, JSON.stringify(a));
console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.relative(ROOT, OUT)}`);
