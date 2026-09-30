#!/usr/bin/env node
// ============================================================================
//  tools/audit_objective_access.mjs — MOBA Objective Access Symmetry Audit（藍／紅到巨龍／巴龍的存取差異）
//
//  用法：ESMO_BALANCE_SKILLS=on ESMO_BALANCE_TALENTS=on \
//        node tools/audit_objective_access.mjs [--seeds=60] [--scenarios=natural,dragonOnly,baronOnly] [--json=<檔>]
//  ① 靜態幾何：正式 findPath（A*，英雄半徑）從泉水／各席位的外塔站位／己方 buff 走到坑邊，路徑長與移動時間。
//  ② 動態鏡像情境：正式 runner 的鏡像名單（同一 seed 兩邊英雄完全相同）＋正式引擎逐 tick 觀測：
//     natural    ＝正式時間表（巨龍 240 s、巴龍 480 s）
//     dragonOnly ＝只有巨龍（240 s），巴龍不生成
//     baronOnly  ＝只有巴龍，且改在 240 s 生成（與 dragonOnly 同一時刻 ⇒ 兩坑可直接做旋轉鏡像比較）
//     每個物件第一次生成後，兩邊各自記錄：到場（任一英雄進坑 9 單位）、3 人到場、開團隊目標窗、first-hit、
//     first-hit 當下坑邊（16 單位）己方人數、最先到場者的角色；物件第一次被擊殺時的擊殺方。
//  只讀引擎、不改任何規則數值（情境只改物件的「生成時刻」這一個狀態欄位）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { modules, configure } from "./balance/moba_items_balance_runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEEDS = Number(arg("seeds", 60));
const SCENARIOS = String(arg("scenarios", "natural,dragonOnly,baronOnly")).split(",");
const JSON_OUT = arg("json", null);
const DT = 0.5, PIT_R = 9, NEAR_R = 16, WATCH_S = 600;

const G = await load("src/gameData.js");
const NAV = await load("src/battle/moba/nav/mobaNavigation.js");
const r1 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const pct = (a, b) => (b ? r1((a / b) * 100) : null);
const mean = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null; };

// ── ① 靜態幾何 ────────────────────────────────────────────────────────────────
function pathLen(from, to) {
  const a = NAV.projectToWalkable(from.x, from.y, NAV.HERO_RADIUS, null);
  const b = NAV.projectToWalkable(to.x, to.y, NAV.HERO_RADIUS, null);
  const pts = NAV.findPath(a, b, NAV.HERO_RADIUS, null);
  if (!pts) return null;
  let len = 0, prev = a;
  for (const p of pts) { len += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
  return len;
}
const M0 = await modules();
const R0 = new M0.LE.LogicEngine(1).rules;
const SPEED = R0.moveSpeed;
const buff = (side) => G.CAMPS.find((c) => c.side === side && c.type === "buff");
function staticGeometry() {
  const rows = [];
  for (const side of ["blue", "red"]) {
    const origins = { fountain: G.FOUNTAIN[side], jungleBuff: buff(side) };
    for (const role of G.ROLES) {
      if (role === "jungle") continue;
      const wl = G.worldLaneForSide(side, G.ROLE_LANE[role]);
      const outerT = side === "blue" ? G.TOWER_T.blue[2] : G.TOWER_T.red[2];
      origins[`${role}@${wl}`] = G.posOnLane(wl, outerT);
    }
    for (const [from, pos] of Object.entries(origins)) {
      const d = pathLen(pos, G.PITS.dragon), b = pathLen(pos, G.PITS.baron);
      rows.push({ side, from, toDragon: r1(d), toBaron: r1(b), tDragonS: r1(d / SPEED), tBaronS: r1(b / SPEED) });
    }
  }
  return rows;
}

// ── ② 動態鏡像情境 ────────────────────────────────────────────────────────────
const RULE_OVERRIDES = process.env.ESMO_BALANCE_RULES ? JSON.parse(process.env.ESMO_BALANCE_RULES) : null;
//  坑的「近側」：巨龍坑緊鄰藍方雙人路、巴龍坑緊鄰紅方雙人路（P0-A 己方視角路線）。
const nearSideOfPit = (pos) => (G.dist(pos, G.PITS.dragon) < 1 ? "blue" : G.dist(pos, G.PITS.baron) < 1 ? "red" : null);

function observe(seed, scenario) {
  const { e } = configure(seed, "standard", M0);
  if (RULE_OVERRIDES) e.rules = { ...e.rules, ...RULE_OVERRIDES };
  const N = e.neutrals;
  if (scenario === "fullMatch") {
    //  整場：每一次龍／巴龍擊殺記錄 [物件, 坑的近側, 擊殺方]
    const kills = [], wasAlive = { dragon: false, baron: false }, pitAt = {};
    while (!e.over && e.t < 3600) {
      e.tick(DT);
      for (const key of ["dragon", "baron"]) {
        const n = N[key];
        if (n.alive) { wasAlive[key] = true; pitAt[key] = nearSideOfPit(n.homePos); }
        else if (wasAlive[key]) { wasAlive[key] = false; kills.push([key, pitAt[key], n.killerTeam ?? null]); }
      }
    }
    return { seed, winner: e.over ? e.winner : null, kills };
  }
  if (scenario === "dragonOnly") { N.baron.spawnAt = N.baron.respawnAt = 1e9; }
  if (scenario === "baronOnly") { N.dragon.spawnAt = N.dragon.respawnAt = 1e9; N.baron.spawnAt = N.baron.respawnAt = N.dragon.spawnAt === 1e9 ? R0.dragonSpawn : N.baron.spawnAt; }
  const keys = scenario === "dragonOnly" ? ["dragon"] : scenario === "baronOnly" ? ["baron"] : ["dragon", "baron"];
  const obs = {};
  for (const key of keys) obs[key] = { spawnT: null, killT: null, killer: null, side: { blue: {}, red: {} } };
  const cap = Math.max(...keys.map((k) => N[k].spawnAt)) + WATCH_S;
  while (!e.over && e.t < cap && keys.some((k) => obs[k].killT === null)) {
    e.tick(DT);
    for (const key of keys) {
      const o = obs[key], n = N[key];
      if (o.killT !== null) continue;
      if (n.alive && o.spawnT === null) o.spawnT = e.t;
      if (o.spawnT === null) continue;
      if (!n.alive) { o.killT = e.t; o.killer = n.killerTeam ?? null; continue; }
      for (const side of ["blue", "red"]) {
        const S = o.side[side];
        const mine = e.players.filter((p) => p.side === side && !p.dead);
        const inPit = mine.filter((p) => G.dist(p.pos, n.pos) <= PIT_R);
        if (S.arriveT === undefined && inPit.length) { S.arriveT = e.t - o.spawnT; S.firstRole = inPit[0].role; }
        if (S.arrive3T === undefined && inPit.length >= 3) S.arrive3T = e.t - o.spawnT;
        const T = e.fsm3?.[side];
        if (S.windowT === undefined && T?.objGo && T.objKey === key) S.windowT = e.t - o.spawnT;
        if (S.firstHitT === undefined && (n.dmgBy?.[side] ?? 0) > 0) {
          S.firstHitT = e.t - o.spawnT;
          S.supportAtHit = mine.filter((p) => G.dist(p.pos, n.pos) <= NEAR_R).length;
          S.foesAtHit = e.players.filter((p) => p.side !== side && !p.dead && G.dist(p.pos, n.pos) <= NEAR_R).length;
        }
      }
    }
  }
  return obs;
}

function aggregate(list, key) {
  const out = { n: 0, killed: 0, securePct: {}, arriveFirstPct: {}, hitFirstPct: {} };
  const acc = { blue: {}, red: {} };
  for (const obs of list) {
    const o = obs[key]; if (!o || o.spawnT === null) continue;
    out.n++;
    if (o.killer) out.killed++;
    const B = o.side.blue, Rr = o.side.red;
    const firstOf = (f) => { const b = B[f] ?? Infinity, r = Rr[f] ?? Infinity; return b < r ? "blue" : r < b ? "red" : (b === Infinity ? null : "tie"); };
    for (const [f, bucket] of [["arriveT", "arriveFirstPct"], ["firstHitT", "hitFirstPct"]]) {
      const w = firstOf(f); if (w) out[bucket][w] = (out[bucket][w] ?? 0) + 1;
    }
    if (o.killer) out.securePct[o.killer] = (out.securePct[o.killer] ?? 0) + 1;
    for (const side of ["blue", "red"]) {
      const S = o.side[side], A = acc[side];
      for (const f of ["arriveT", "arrive3T", "windowT", "firstHitT", "supportAtHit", "foesAtHit"]) (A[f] ??= []).push(S[f]);
      A.present = (A.present ?? 0) + (S.arriveT !== undefined ? 1 : 0);
      A.window = (A.window ?? 0) + (S.windowT !== undefined ? 1 : 0);
      A.hit = (A.hit ?? 0) + (S.firstHitT !== undefined ? 1 : 0);
      if (S.firstRole) { A.roles ??= {}; A.roles[S.firstRole] = (A.roles[S.firstRole] ?? 0) + 1; }
    }
  }
  for (const b of ["securePct", "arriveFirstPct", "hitFirstPct"]) for (const k of Object.keys(out[b])) out[b][k] = pct(out[b][k], out.n);
  out.side = {};
  for (const side of ["blue", "red"]) {
    const A = acc[side];
    out.side[side] = {
      arrivedPct: pct(A.present ?? 0, out.n), windowOpenedPct: pct(A.window ?? 0, out.n), hitPct: pct(A.hit ?? 0, out.n),
      arriveMeanS: mean(A.arriveT ?? []), arrive3MeanS: mean(A.arrive3T ?? []), windowMeanS: mean(A.windowT ?? []),
      firstHitMeanS: mean(A.firstHitT ?? []), supportAtHitMean: mean(A.supportAtHit ?? []), foesAtHitMean: mean(A.foesAtHit ?? []),
      firstArriverRoles: A.roles ?? {},
    };
  }
  return out;
}

//  整場：同一場內是否仍有固定單側優勢（近側拿下率、每場龍數差的符號分佈）
function aggregateFull(list) {
  let near = 0, total = 0, sameSideMatches = 0, matches = 0;
  const byPit = { blue: { n: 0, blue: 0 }, red: { n: 0, red: 0 } };
  const ctl = { dragon: { blue: 0, red: 0 }, baron: { blue: 0, red: 0 } };
  let bWins = 0, fin = 0;
  const firstOf = { dragon: { blue: 0, red: 0 }, baron: { blue: 0, red: 0 } };
  for (const m of list) {
    if (m.winner) { fin++; if (m.winner === "blue") bWins++; }
    const k = m.kills.filter((x) => x[2]);
    for (const key of ["dragon", "baron"]) { const f = k.find((x) => x[0] === key); if (f) firstOf[key][f[2]]++; }
    for (const [key, nearSide, killer] of k) {
      total++; if (nearSide === killer) near++;
      ctl[key][killer]++;
      if (nearSide === "blue") { byPit.blue.n++; if (killer === "blue") byPit.blue.blue++; }
      if (nearSide === "red") { byPit.red.n++; if (killer === "red") byPit.red.red++; }
    }
    //  「固定單側」：這場所有龍都在同一側坑生成
    const dragonPits = new Set(m.kills.filter((x) => x[0] === "dragon").map((x) => x[1]));
    if (m.kills.some((x) => x[0] === "dragon")) { matches++; if (dragonPits.size === 1) sameSideMatches++; }
  }
  const n = list.length;
  return {
    n, bluePct: pct(bWins, fin),
    firstDragon: { blue: pct(firstOf.dragon.blue, n), red: pct(firstOf.dragon.red, n) },
    firstBaron: { blue: pct(firstOf.baron.blue, n), red: pct(firstOf.baron.red, n) },
    dragonShare: { blue: pct(ctl.dragon.blue, ctl.dragon.blue + ctl.dragon.red), red: pct(ctl.dragon.red, ctl.dragon.blue + ctl.dragon.red) },
    baronShare: { blue: pct(ctl.baron.blue, ctl.baron.blue + ctl.baron.red), red: pct(ctl.baron.red, ctl.baron.blue + ctl.baron.red) },
    nearSideSecurePct: pct(near, total),
    blueNearPitSecuredByBlue: pct(byPit.blue.blue, byPit.blue.n), redNearPitSecuredByRed: pct(byPit.red.red, byPit.red.n),
    matchesAllDragonsOneSidePct: pct(sameSideMatches, matches),
  };
}

const report = { engineRules: { moveSpeed: SPEED, dragonSpawn: R0.dragonSpawn, baronSpawn: R0.baronSpawn, sideRelativeFormationMovement: !!R0.sideRelativeFormationMovement },
  seeds: SEEDS, geometry: staticGeometry(), scenarios: {} };
console.log("① 靜態幾何（findPath，英雄半徑；時間＝路徑長 ÷ 移速 " + SPEED + "）");
for (const g of report.geometry) console.log(`  ${g.side.padEnd(5)} ${g.from.padEnd(14)} →龍 ${String(g.toDragon).padStart(6)}（${g.tDragonS}s）  →巴龍 ${String(g.toBaron).padStart(6)}（${g.tBaronS}s）`);
const t0 = Date.now();
for (const sc of SCENARIOS) {
  const list = [];
  for (let s = 1; s <= SEEDS; s++) {
    list.push(observe(s, sc));
    if (s % 20 === 0) console.log(`  … ${sc} ${s}/${SEEDS}（${Math.round((Date.now() - t0) / 1000)}s）`);
  }
  if (sc === "fullMatch") {
    report.scenarios[sc] = aggregateFull(list);
    console.log(`\n② fullMatch：${JSON.stringify(report.scenarios[sc])}`);
    continue;
  }
  report.scenarios[sc] = {};
  for (const key of sc === "dragonOnly" ? ["dragon"] : sc === "baronOnly" ? ["baron"] : ["dragon", "baron"]) {
    const a = aggregate(list, key);
    report.scenarios[sc][key] = a;
    console.log(`\n② ${sc} / ${key}：n=${a.n} 擊殺=${a.killed}　secure% ${JSON.stringify(a.securePct)}　先到 ${JSON.stringify(a.arriveFirstPct)}　先打 ${JSON.stringify(a.hitFirstPct)}`);
    for (const side of ["blue", "red"]) console.log(`   ${side.padEnd(5)} ${JSON.stringify(a.side[side])}`);
  }
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
