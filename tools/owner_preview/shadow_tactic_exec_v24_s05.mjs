#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/shadow_tactic_exec_v24_s05.mjs — 自適應入侵影子量測 0.5 版（2026-11-14；量測工具，不改引擎）
//
//  以 shadow_tactic_exec_v24.mjs 為底，差異：
//   · DETOUR 1.25 → 1.17。
//   · 每名英雄保留位置歷史（tick＝0.5 秒 ⇒ 往回 4 個 tick＝2.0 秒前），用來判定「正在接近」。
//   · 每筆有目標的評估多記原始欄位：jHp／jLv／jDist／jAvail、tgtHp／tgtBuff、
//     cands＝[role, baseAvail, eta, hpFrac, mlv, laneCost]、威脅位元遮罩（nowFull／nowKnown／apprFull／apprKnown）、
//     reachKnown（＝舊 enemyKnown.count）。
//   · noLeader 仍沿用舊規則（打野 hp>=0.55 等）設旗標，但**不提早返回**：新欄位、威脅遮罩、真值一律記錄；
//     只有 ownPower／partyEta／partyLaneCost／ratio* 在 noLeader 時略過。
//   · 真值（往後回填）：arrMaskW＝(t, t+Wc]、arrMask15＝(t, t+15] 內進入目標 14 範圍的敵方英雄遮罩；
//     actualArrivals＝popcount(arrMaskW)；jArr＝本側打野在 (t, t+Wc] 內是否進入目標 14 範圍。
//     Wc＝min(etaJ＋10, 40)，對每一筆有目標的評估都這樣定義（打野可用時與舊版相同，因舊版 qual[0] 恆為打野）。
//   · 入侵結束紀錄多記 arrivedAt／camp／contact（在呼叫被包的函式之前讀取）。
//  敵方位元：bit i 對應 ["top","jungle","mid","adc","sup"][i]（bit0＝top）。
//  被動性：只讀引擎狀態、只在實例上包 _invadeEndV2；--selfcheck 以 Seed 11（路徑 inv）有／無影子各跑一次比雜湊。
//
//  用法：node tools/owner_preview/shadow_tactic_exec_v24_s05.mjs --path=inv --seeds=11 --out=<json>
//        node tools/owner_preview/shadow_tactic_exec_v24_s05.mjs --selfcheck
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { findPath, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";

const TOOL = "shadow_tactic_exec_v24_s05";
const SPRINT0_HASH = "c314a2613fccd44a";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "inv"), TIER = arg("tier", "mid");
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
const DETOUR = 1.17, EVAL_EVERY = 5, EVAL_UNTIL = 600, TRUTH_WINDOW = 15, TRUTH_RADIUS = 14, PATH_EVERY = 6;
const THREAT_RADIUS = 14, APPROACH_MIN = 4, APPROACH_LOOKBACK = 2.0, TICK = 0.5;
const APPROACH_NEAR_ETA = 15;                              // 「逼近而且 15 秒內到得了」：apprNear*（主對話 2026-11-14 加，量測前）
const HIST_LEN = Math.round(APPROACH_LOOKBACK / TICK) + 1;   // 含目前這個 tick ⇒ 5 筆
const CANDIDATE_ROLES = ["jungle", "mid", "sup", "top"];   // 固定順序；adc 永遠不加入
const ENEMY_BITS = ["top", "jungle", "mid", "adc", "sup"];  // bit0＝top
const bitOf = (role) => { const i = ENEMY_BITS.indexOf(role); return i < 0 ? 0 : 1 << i; };
const popcount = (m) => { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);

//  工具路徑的雙方戰術
const TOOL_TEMPLATES = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };

//  與 shadow_tactic_exec_v24.mjs 的 build() 逐字相同
function build(seed, path = PATH, tier = TIER) {
  if (path === "career") {
    const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    if (ruleset.rulesetId !== "career.v23") throw new Error(`resolved ${ruleset.rulesetId}`);
    const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
    const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, TIER_VALUE[tier]])) }));
    const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
    const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
    if (!out.ok) throw new Error(`rejected ${seed}`);
    return { e: out.engine, meta: { opponent: team.id } };
  }
  const tt = TOOL_TEMPLATES[path];
  if (!tt) throw new Error(`unknown path ${path}`);
  const [tb, tr] = tt;
  return { e: configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf(tb) }, red: { kind: "binding", binding: bindingOf(tr) } }, "balanceTool.v23").e, meta: { blueTemplate: tb, redTemplate: tr } };
}

const tickHash = (h, e) => { for (const p of e.players) h.update(`${p.id}${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.hp.toFixed(3)},${p.dead ? 1 : 0};`); };
const strengthOf = (hpFrac, mlv) => hpFrac * (1 + 0.1 * ((mlv ?? 1) - 1));
const otherSide = (s) => (s === "blue" ? "red" : "blue");
const heroIdOf = (e, p) => e.items?.ps?.get?.(p.id)?.heroId ?? e.heroSkillBaseRules?.[p.id]?.heroId ?? null;
//  野怪營地剩餘血量比例：存活成員的 hp 總和 ÷ 全部成員的 maxHp 總和（成員欄位 hp／maxHp／alive，見 LogicEngine mk()）。
//  沒有成員的中立物件（理論上 camps 只含 camp／buff，都有成員）退回營地本體的 hp／maxHp。
function campHpFrac(c) {
  if (Array.isArray(c.members) && c.members.length) {
    let hp = 0, mx = 0;
    for (const m of c.members) { mx += m.maxHp ?? 0; if (m.alive && m.hp > 0) hp += m.hp; }
    return mx > 0 ? hp / mx : null;
  }
  return c.maxHp > 0 ? c.hp / c.maxHp : null;
}

/** 跑一場。shadow=false ⇒ 純對局（只算雜湊）；shadow=true ⇒ 掛上影子儀器。 */
function runMatch(seed, { path = PATH, tier = TIER, shadow = true, cap = 3000 } = {}) {
  const b = build(seed, path, tier), e = b.e;
  const h = createHash("sha1");
  if (!shadow) { while (!e.over && e.t < cap) { e.tick(TICK); tickHash(h, e); } return { hash: h.digest("hex").slice(0, 16) }; }

  const evals = [], invasionStarts = [], invasionEnds = [];
  const cost = { euclidMs: 0, pathMs: 0, evals: 0, pathCalls: 0 };
  const mem = { blue: new Map(), red: new Map() };
  const lastEvalIdx = { blue: null, red: null }, targetEvals = { blue: 0, red: 0 };
  const hadInv = new Map(), pending = [], invStartT = new Map();
  const hist = [];                                          // [{ t, pos: Map(id → {x,y}) }]，最多 HIST_LEN 筆（最新在尾端）
  let nextEval = 0;

  const posAgo = (id) => {                                  // 2.0 秒前的位置；沒有 ⇒ null
    const want = e.t - APPROACH_LOOKBACK;
    for (const s of hist) if (Math.abs(s.t - want) < 1e-6) return s.pos.get(id) ?? null;
    return null;
  };

  const endEntry = (p, reason) => {
    const tEnd = e.t, tStart = invStartT.get(p.id) ?? e.t;
    const evalIdxs = []; let evalIdxBefore = null;
    evals.forEach((r, i) => { if (r.side !== p.side || r.t > tEnd) return; evalIdxBefore = i; if (r.t >= tStart) evalIdxs.push(i); });
    const I = p._invV2 ?? null;                             // 呼叫被包的函式之前讀取
    return { t: r2(tEnd), tStart: r2(tStart), id: p.id, side: p.side, role: p.role, reason, evalIdxs, evalIdxBefore,
      arrivedAt: I && I.arrivedAt != null ? r2(I.arrivedAt) : null, camp: I?.camp ?? null, contact: I ? r2(I.contact) : null };
  };
  if (typeof e._invadeEndV2 === "function") {
    const f = e._invadeEndV2.bind(e);
    e._invadeEndV2 = (p, reason) => {
      if (p && p._invV2 && !p._invV2.done) invasionEnds.push(endEntry(p, reason));
      return f(p, reason);
    };
  }

  const moveSpeed = Math.max(1e-6, e.rules?.moveSpeed ?? 5.6);
  function evaluate(S, alive) {
    const t0 = performance.now();
    const foe = otherSide(S);
    const jungler = e.players.find((p) => p.side === S && p.role === "jungle");
    const camps = (e.neutrals?.camps ?? []).filter((c) => c.alive && c.side !== S);
    const base = { t: r2(e.t), side: S, invading: !!(jungler?._invV2 && !jungler._invV2.done) };
    if (!jungler || !camps.length) { cost.euclidMs += performance.now() - t0; cost.evals++; return { rec: { ...base, noTarget: true } }; }
    let target = camps[0];
    for (const c of camps) if (dist(jungler.pos, c.pos) < dist(jungler.pos, target.pos)) target = c;
    const eta = (pos) => (dist(pos, target.pos) * DETOUR) / moveSpeed;
    const etaJ = eta(jungler.pos);
    const rec = { ...base, targetType: target.type, targetId: target.id, etaJ: r2(etaJ) };
    //  打野與目標的原始欄位（不論打野可不可用都記）
    rec.jHp = r3(jungler.hp / jungler.maxHp);
    rec.jLv = jungler.mlv ?? 1;
    rec.jDist = r2(dist(jungler.pos, target.pos));
    rec.jAvail = !jungler.dead && !jungler.retreating && !(jungler.recallT > 0) ? 1 : 0;
    rec.tgtHp = r3(campHpFrac(target));
    rec.tgtBuff = target.type === "buff" ? 1 : 0;

    //  我方候選
    const cands = [];
    for (const role of CANDIDATE_ROLES) {
      const hh = e.players.find((p) => p.side === S && p.role === role);
      if (!hh) continue;
      const hpFrac = hh.hp / hh.maxHp;
      let laneCost = 0;
      if (role !== "jungle" && e.lanes?.[hh.lane]) {
        const tw = e.frontTower(foe, hh.lane);
        const mins = e.lanes[hh.lane][S === "blue" ? "rm" : "bm"] ?? [];
        if (tw && mins.some((m) => m.hp > 0 && dist(e._minionPos(hh.lane, m), tw.pos) <= 18)) laneCost = 1;
      }
      const baseAvail = !hh.dead && !hh.retreating && !(hh.recallT > 0);
      cands.push({ role, baseAvail, avail: baseAvail && hpFrac >= 0.55, eta: eta(hh.pos), hpFrac, mlv: hh.mlv ?? 1, strength: strengthOf(hpFrac, hh.mlv), laneCost });
    }
    rec.cands = cands.map((c) => [c.role, c.baseAvail ? 1 : 0, r2(c.eta), r3(c.hpFrac), c.mlv, c.laneCost]);
    const jc = cands.find((c) => c.role === "jungle");
    const noLeader = !jc?.avail;                            // 舊規則（含 hp>=0.55），只為可比性
    if (noLeader) rec.noLeader = true;
    const Wc = Math.min(etaJ + 10, 40);                     // 每筆有目標的評估都這樣定義
    if (!noLeader) {
      const qual = cands.filter((c) => c.avail && c.eta <= etaJ + 6);
      const ownPower = [], partyEta = [], partyLaneCost = [];
      for (let n = 1; n <= 4; n++) {
        if (qual.length < n) { ownPower.push(null); partyEta.push(null); partyLaneCost.push(null); continue; }
        const party = qual.slice(0, n);
        ownPower.push(r3(party.reduce((s, c) => s + c.strength, 0)));
        partyEta.push(r2(Math.max(...party.map((c) => c.eta))));
        partyLaneCost.push(party.reduce((s, c) => s + c.laneCost, 0));
      }
      if (qual[0]?.role !== "jungle") rec.qual0NotJungle = true;   // 核對：舊版 W 用 qual[0].eta，應恆為打野
      rec.ownPower = ownPower; rec.partyEta = partyEta; rec.partyLaneCost = partyLaneCost;
    }
    rec.W = r2(etaJ + 10); rec.w = r2(Wc);
    rec._wc = Wc;

    //  敵方威脅：舊版完整／已知（窗 Wc）
    const foes = alive.filter((q) => q.side === foe);
    const full = { count: 0, power: 0 };
    for (const q of foes) if (eta(q.pos) <= Wc) { full.count++; full.power += strengthOf(q.hp / q.maxHp, q.mlv); }
    const known = { count: 0, power: 0, unseen: 0, never: 0 };
    //  新版威脅遮罩（半徑 14、接近判定）
    let nowFull = 0, nowKnown = 0, apprFull = 0, apprKnown = 0, apprNearFull = 0, apprNearKnown = 0;
    for (const q of foes) {
      const seen = e._seenV20(S, q, alive);
      let etaK, str;
      if (seen) { etaK = eta(q.pos); str = strengthOf(q.hp / q.maxHp, q.mlv); }
      else {
        known.unseen++;
        const m = mem[S].get(q.id);
        if (m) { etaK = Math.max(0, eta(m.pos) - (e.t - m.t)); str = strengthOf(m.hpFrac, m.mlv); }
        else {
          known.never++; str = 1;
          if (q.role === "jungle") etaK = 6;
          else { const tw = e.lanes?.[q.lane] ? e.frontTower(S, q.lane) : null; etaK = tw ? eta(tw.pos) : Infinity; }
        }
      }
      if (etaK <= Wc) { known.count++; known.power += str; }
      const bit = bitOf(q.role), dNow = dist(q.pos, target.pos);
      if (dNow <= THREAT_RADIUS) { nowFull |= bit; if (seen) nowKnown |= bit; }
      else {
        const old = posAgo(q.id);
        if (old && dNow <= dist(old, target.pos) - APPROACH_MIN) { apprFull |= bit; if (seen) apprKnown |= bit; if (eta(q.pos) <= APPROACH_NEAR_ETA) { apprNearFull |= bit; if (seen) apprNearKnown |= bit; } }
      }
    }
    rec.enemyFull = { count: full.count, power: r3(full.power) };
    rec.enemyKnown = { count: known.count, power: r3(known.power), unseen: known.unseen, never: known.never };
    rec.reachKnown = known.count;
    rec.nowFull = nowFull; rec.nowKnown = nowKnown; rec.apprFull = apprFull; rec.apprKnown = apprKnown; rec.apprNearFull = apprNearFull; rec.apprNearKnown = apprNearKnown;
    if (!noLeader) {
      rec.ratioFull = rec.ownPower.map((p) => (p == null ? null : r3(p / (full.power + 0.5))));
      rec.ratioKnown = rec.ownPower.map((p) => (p == null ? null : r3(p / (known.power + 0.5))));
    }
    cost.euclidMs += performance.now() - t0; cost.evals++;
    return { rec, jungler, target };
  }

  function exactPathRatio(jungler, target) {
    const t0 = performance.now();
    const pts = findPath(jungler.pos, target.pos, HERO_RADIUS, e._aliveStructs);
    let len = null;
    if (pts) { len = 0; let a = jungler.pos; for (const q of pts) { len += dist(a, q); a = q; } }
    cost.pathMs += performance.now() - t0; cost.pathCalls++;
    const eu = dist(jungler.pos, target.pos);
    return len == null || eu <= 1e-9 ? null : r3(len / eu);
  }

  const finalizeW = (o) => { o.rec.arrMaskW = o.maskW; o.rec.actualArrivals = popcount(o.maskW); o.rec.jArr = o.jArr; o.doneW = true; };
  const finalize15 = (o) => { o.rec.arrMask15 = o.mask15; o.done15 = true; };

  while (!e.over && e.t < cap) {
    e.tick(TICK); tickHash(h, e);
    const alive = e.players.filter((p) => !p.dead);
    for (const p of e.players) {
      const has = !!p._invV2;
      if (has && !hadInv.get(p.id)) invasionStarts.push({ t: r2(e.t), id: p.id, side: p.side, role: p.role, evalIdx: lastEvalIdx[p.side] });
      hadInv.set(p.id, has);
    }
    for (const p of e.players) if (p._invV2 && !invStartT.has(p.id)) invStartT.set(p.id, e.t);
    //  真值回填：Wc 窗與 15 秒窗各自結算
    for (let i = pending.length - 1; i >= 0; i--) {
      const o = pending[i];
      if (e.t > o.t) {
        const inW = e.t <= o.t + o.w, in15 = e.t <= o.t + TRUTH_WINDOW;
        for (const q of alive) {
          if (dist(q.pos, o.pos) > TRUTH_RADIUS) continue;
          if (q.side !== o.side) { const bit = bitOf(q.role); if (inW) o.maskW |= bit; if (in15) o.mask15 |= bit; }
          else if (q === o.jungler && inW) o.jArr = 1;
        }
      }
      if (!o.doneW && e.t >= o.t + o.w) finalizeW(o);
      if (!o.done15 && e.t >= o.t + TRUTH_WINDOW) finalize15(o);
      if (o.doneW && o.done15) pending.splice(i, 1);
    }
    if (e.t > EVAL_UNTIL) continue;
    //  位置歷史：每 tick 全部英雄
    hist.push({ t: e.t, pos: new Map(e.players.map((p) => [p.id, { x: p.pos.x, y: p.pos.y }])) });
    if (hist.length > HIST_LEN) hist.shift();
    for (const S of ["blue", "red"]) for (const q of alive) {
      if (q.side === S || !e._seenV20(S, q, alive)) continue;
      mem[S].set(q.id, { pos: { x: q.pos.x, y: q.pos.y }, t: e.t, hpFrac: q.hp / q.maxHp, mlv: q.mlv ?? 1 });
    }
    if (e.t < nextEval) continue;
    nextEval += EVAL_EVERY;
    for (const S of ["blue", "red"]) {
      const out = evaluate(S, alive);
      const rec = out.rec;
      if (!rec.noTarget) {
        if (targetEvals[S] % PATH_EVERY === 0) rec.pathRatio = exactPathRatio(out.jungler, out.target);
        targetEvals[S]++;
        rec.actualArrivals = null; rec.arrMaskW = null; rec.arrMask15 = null; rec.jArr = null;
        pending.push({ rec, t: e.t, w: rec._wc, side: S, jungler: out.jungler, pos: { x: out.target.pos.x, y: out.target.pos.y }, maskW: 0, mask15: 0, jArr: 0, doneW: false, done15: false });
      }
      delete rec._wc;
      lastEvalIdx[S] = evals.length;
      evals.push(rec);
    }
  }
  //  比賽結束時沒走完的窗 ⇒ 該窗的真值維持 null（Wc 窗與 15 秒窗各自判定）
  for (const p of e.players) if (p._invV2 && !p._invV2.done) invasionEnds.push(endEntry(p, "open"));

  const lineup = Object.fromEntries(["blue", "red"].map((S) => [S, e.players.filter((p) => p.side === S).map((p) => { const id = heroIdOf(e, p); return id == null ? null : `${p.role}:${id}`; })]));
  const invObs = e.invObs ? JSON.parse(JSON.stringify(e.invObs)) : null;
  return {
    hash: h.digest("hex").slice(0, 16),
    row: { seed, path, tier: path === "career" ? tier : null, ...b.meta, winner: e.winner ?? null, duration: +e.t.toFixed(1), invObs,
      lineup: Object.values(lineup).every((l) => l.every((x) => x == null)) ? null : lineup,
      cost: { euclidMs: r3(cost.euclidMs), pathMs: r3(cost.pathMs), evals: cost.evals, pathCalls: cost.pathCalls },
      counts: { evals: evals.length, noTarget: evals.filter((r) => r.noTarget).length, noLeader: evals.filter((r) => r.noLeader).length, qual0NotJungle: evals.filter((r) => r.qual0NotJungle).length, invasionStarts: invasionStarts.length, invasionEnds: invasionEnds.length },
      evals, invasionStarts, invasionEnds },
  };
}

if (process.argv.includes("--selfcheck")) {
  const plain = runMatch(11, { path: "inv", shadow: false }).hash;
  const shadowed = runMatch(11, { path: "inv", shadow: true }).hash;
  const ok = plain === shadowed;
  console.log(JSON.stringify({ selfcheck: "shadow_is_passive", tool: TOOL, plain, shadowed, ok, expected: SPRINT0_HASH, matchesSprint0: plain === SPRINT0_HASH && shadowed === SPRINT0_HASH }));
  process.exit(ok ? 0 : 1);
}

const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number), OUT = arg("out", null);
if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [], t0 = Date.now();
for (const s of seeds) {
  rows.push(runMatch(s).row);
  process.stderr.write(`[shadow] ${PATH}${PATH === "career" ? ":" + TIER : ""} seed ${s} done (${rows.length}/${seeds.length}) rss ${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);
}
const wallSec = Math.round((Date.now() - t0) / 1000);
fs.writeFileSync(OUT, JSON.stringify({ tool: TOOL, gitHead: arg("head", null), path: PATH, tier: PATH === "career" ? TIER : null, seeds, detour: DETOUR, wallSec, rows }));

//  摘要
const mean = (xs) => (xs.length ? r3(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const all = rows.flatMap((r) => r.evals), tg = all.filter((r) => !r.noTarget);
const ends = {};
for (const r of rows) for (const x of r.invasionEnds) ends[x.reason] = (ends[x.reason] ?? 0) + 1;
console.log(JSON.stringify({
  ok: true, tool: TOOL, n: rows.length, evals: all.length,
  invasionStarts: rows.reduce((s, r) => s + r.invasionStarts.length, 0), invasionEnds: ends,
  meanNowKnown: mean(tg.map((r) => popcount(r.nowKnown))),
  meanApprKnown: mean(tg.map((r) => popcount(r.apprKnown))),
  meanReachKnown: mean(tg.map((r) => r.reachKnown)),
  meanActualArrivals: mean(tg.map((r) => r.actualArrivals).filter((x) => x != null)),
  meanArr15: mean(tg.filter((r) => r.arrMask15 != null).map((r) => popcount(r.arrMask15))),
  qual0NotJungle: rows.reduce((s, r) => s + r.counts.qual0NotJungle, 0),
  wallSec,
}));
