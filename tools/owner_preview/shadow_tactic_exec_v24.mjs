#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/shadow_tactic_exec_v24.mjs — 「自適應戰術執行」的影子量測（2026-11-14；量測工具，不改引擎）
//
//  目的：為未來的自適應入侵設計收集資料。只「觀察」現行引擎的對局：
//   · 每 5 秒（遊戲時間，只看 e.t <= 600）替雙方各做一次評估：打野最近的敵方野怪、我方可成團人數與戰力、
//     敵方威脅（完整資訊 vs 已知資訊兩個版本，窗＝Wc＝min(打野 eta＋10, 40)）、比值；
//     同一個窗 (t, t+Wc] 走完後回填「實際有幾名敵方英雄趕到」作為真值。
//   · 記錄實際入侵的開始與結束原因；結束紀錄附上入侵期間該側的評估索引（evalIdxs／evalIdxBefore）。
//  被動性：只在引擎「實例」上包 _invadeEndV2（先記錄、再原樣呼叫、原樣回傳），不寫引擎狀態、不讀 rng。
//   --selfcheck 以同一場（工具路徑 inv、Seed 11）有／無影子儀器各跑一次，逐 tick 雜湊必須相同。
//
//  路徑：--path=career --tier=low|mid|high（玩家在藍方，素質 30／60／90）
//        --path=inv（工具路徑，雙方都綁 v2.jungle_invasion）
//        --path=AB（藍 v2.jungle_invasion、紅 classic.m7）｜--path=BA（反過來）
//  用法：node tools/owner_preview/shadow_tactic_exec_v24.mjs --path=inv --seeds=11,13 --out=<json>
//        node tools/owner_preview/shadow_tactic_exec_v24.mjs --selfcheck
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { findPath, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "inv"), TIER = arg("tier", "mid");
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
const DETOUR = 1.25, EVAL_EVERY = 5, EVAL_UNTIL = 600, TRUTH_WINDOW = 15, TRUTH_RADIUS = 14, PATH_EVERY = 6;
const CANDIDATE_ROLES = ["jungle", "mid", "sup", "top"];   // 固定順序；adc 永遠不加入
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

//  與 measure_side_fairness_v23.mjs 的 build() 相同（career 路徑逐字沿用；工具路徑改成雙方綁定戰術）
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
//  英雄 id：引擎玩家物件上沒有 heroId（引擎刻意不認得）；從裝備執行期（items.ps）或技能規則的設定讀（唯讀）。
const heroIdOf = (e, p) => e.items?.ps?.get?.(p.id)?.heroId ?? e.heroSkillBaseRules?.[p.id]?.heroId ?? null;

/** 跑一場。shadow=false ⇒ 純對局（只算雜湊）；shadow=true ⇒ 掛上影子儀器。 */
function runMatch(seed, { path = PATH, tier = TIER, shadow = true, cap = 3000 } = {}) {
  const b = build(seed, path, tier), e = b.e;
  const h = createHash("sha1");
  if (!shadow) { while (!e.over && e.t < cap) { e.tick(0.5); tickHash(h, e); } return { hash: h.digest("hex").slice(0, 16) }; }

  const evals = [], invasionStarts = [], invasionEnds = [];
  const cost = { euclidMs: 0, pathMs: 0, evals: 0, pathCalls: 0 };
  const mem = { blue: new Map(), red: new Map() };          // mem[S].get(q.id) = { pos, t, hpFrac, mlv }
  const lastEvalIdx = { blue: null, red: null }, targetEvals = { blue: 0, red: 0 };
  const hadInv = new Map(), pending = [], invStartT = new Map();
  let nextEval = 0;                                         // 第一個 tick（t=0.5）就評估一次，之後 5、10、15…

  //  入侵期間的評估：該側 start.t <= 評估.t <= end.t 的索引；evalIdxBefore＝該側 t <= end.t 的最後一筆
  const endEntry = (p, reason) => {
    const tEnd = e.t, tStart = invStartT.get(p.id) ?? e.t;   // 同一個 tick 內開始又結束 ⇒ 開始時間＝現在
    const evalIdxs = []; let evalIdxBefore = null;
    evals.forEach((r, i) => { if (r.side !== p.side || r.t > tEnd) return; evalIdxBefore = i; if (r.t >= tStart) evalIdxs.push(i); });
    return { t: r2(tEnd), tStart: r2(tStart), id: p.id, side: p.side, role: p.role, reason, evalIdxs, evalIdxBefore };
  };
  //  唯一的包裝：結束入侵時先記錄（只在真的會結束時），再原樣呼叫、原樣回傳
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
    if (!jungler || !camps.length) { cost.euclidMs += performance.now() - t0; cost.evals++; return { ...base, noTarget: true }; }
    let target = camps[0];
    for (const c of camps) if (dist(jungler.pos, c.pos) < dist(jungler.pos, target.pos)) target = c;
    const eta = (pos) => (dist(pos, target.pos) * DETOUR) / moveSpeed;
    const etaJ = eta(jungler.pos);
    const rec = { ...base, targetType: target.type, targetId: target.id, etaJ: r2(etaJ) };

    //  我方候選
    const cands = [];
    for (const role of CANDIDATE_ROLES) {
      const hh = e.players.find((p) => p.side === S && p.role === role);
      if (!hh) continue;
      const hpFrac = hh.hp / hh.maxHp;
      let laneCost = 0;
      if (role !== "jungle" && e.lanes?.[hh.lane]) {
        const tw = e.frontTower(foe, hh.lane);              // S 自己防守的前線塔
        const mins = e.lanes[hh.lane][S === "blue" ? "rm" : "bm"] ?? [];
        if (tw && mins.some((m) => m.hp > 0 && dist(e._minionPos(hh.lane, m), tw.pos) <= 18)) laneCost = 1;
      }
      cands.push({ role, avail: !hh.dead && !hh.retreating && !(hh.recallT > 0) && hpFrac >= 0.55, eta: eta(hh.pos), strength: strengthOf(hpFrac, hh.mlv), laneCost });
    }
    rec.cands = cands.map((c) => [c.role, c.avail ? 1 : 0, r2(c.eta), r3(c.strength), c.laneCost]);
    const jc = cands.find((c) => c.role === "jungle");
    if (!jc?.avail) { rec.noLeader = true; cost.euclidMs += performance.now() - t0; cost.evals++; return { rec, pathT: null, jungler, target }; }
    const qual = cands.filter((c) => c.avail && c.eta <= etaJ + 6);
    const ownPower = [], partyEta = [], partyLaneCost = [];
    for (let n = 1; n <= 4; n++) {
      if (qual.length < n) { ownPower.push(null); partyEta.push(null); partyLaneCost.push(null); continue; }
      const party = qual.slice(0, n);
      ownPower.push(r3(party.reduce((s, c) => s + c.strength, 0)));
      partyEta.push(r2(Math.max(...party.map((c) => c.eta))));
      partyLaneCost.push(party.reduce((s, c) => s + c.laneCost, 0));
    }
    const W = qual[0].eta + 10;                            // partyEta[1]（＝打野自己）＋10 秒
    const Wc = Math.min(W, 40);                            // 預測與真值共用同一個窗（上限 40 秒）

    //  敵方威脅：完整資訊
    const foes = alive.filter((q) => q.side === foe);
    const full = { count: 0, power: 0 };
    for (const q of foes) if (eta(q.pos) <= Wc) { full.count++; full.power += strengthOf(q.hp / q.maxHp, q.mlv); }
    //  敵方威脅：已知資訊（看得到 ⇒ 實際；看過 ⇒ 記憶外推；沒看過 ⇒ 假設在自家前線塔，打野假設 6 秒）
    const known = { count: 0, power: 0, unseen: 0, never: 0 };
    for (const q of foes) {
      let etaK, str;
      if (e._seenV20(S, q, alive)) { etaK = eta(q.pos); str = strengthOf(q.hp / q.maxHp, q.mlv); }
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
    }
    rec.ownPower = ownPower; rec.partyEta = partyEta; rec.partyLaneCost = partyLaneCost; rec.W = r2(W); rec.w = r2(Wc);
    rec._wc = Wc;                                          // 真值窗（寫檔前刪掉）
    rec.enemyFull = { count: full.count, power: r3(full.power) };
    rec.enemyKnown = { count: known.count, power: r3(known.power), unseen: known.unseen, never: known.never };
    rec.ratioFull = ownPower.map((p) => (p == null ? null : r3(p / (full.power + 0.5))));
    rec.ratioKnown = ownPower.map((p) => (p == null ? null : r3(p / (known.power + 0.5))));
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

  while (!e.over && e.t < cap) {
    e.tick(0.5); tickHash(h, e);
    const alive = e.players.filter((p) => !p.dead);
    //  入侵開始偵測（_invV2 第一次出現）
    for (const p of e.players) {
      const has = !!p._invV2;
      if (has && !hadInv.get(p.id)) invasionStarts.push({ t: r2(e.t), id: p.id, side: p.side, role: p.role, evalIdx: lastEvalIdx[p.side] });
      hadInv.set(p.id, has);
    }
    //  入侵開始時間（給 invasionEnds 的 tStart）
    for (const p of e.players) if (p._invV2 && !invStartT.has(p.id)) invStartT.set(p.id, e.t);
    //  真值回填：(t, t+Wc] 內進入目標 14 範圍的不同敵方英雄（Wc＝該筆預測用的窗）
    for (let i = pending.length - 1; i >= 0; i--) {
      const o = pending[i];
      if (e.t > o.t && e.t <= o.t + o.w) for (const q of alive) if (q.side !== o.side && dist(q.pos, o.pos) <= TRUTH_RADIUS) o.seen.add(q.id);
      if (e.t >= o.t + o.w) { o.rec.actualArrivals = o.seen.size; pending.splice(i, 1); }
    }
    if (e.t > EVAL_UNTIL) continue;
    //  已知資訊記憶：每 tick 更新
    for (const S of ["blue", "red"]) for (const q of alive) {
      if (q.side === S || !e._seenV20(S, q, alive)) continue;
      mem[S].set(q.id, { pos: { x: q.pos.x, y: q.pos.y }, t: e.t, hpFrac: q.hp / q.maxHp, mlv: q.mlv ?? 1 });
    }
    if (e.t < nextEval) continue;
    nextEval += EVAL_EVERY;
    for (const S of ["blue", "red"]) {
      const out = evaluate(S, alive);
      const rec = out.rec ?? out;
      if (!rec.noTarget) {
        if (targetEvals[S] % PATH_EVERY === 0) rec.pathRatio = exactPathRatio(out.jungler, out.target);
        targetEvals[S]++;
        if (!rec.noLeader) { rec.actualArrivals = null; pending.push({ rec, t: e.t, w: rec._wc, side: S, pos: { x: out.target.pos.x, y: out.target.pos.y }, seen: new Set() }); }
      }
      delete rec._wc;
      lastEvalIdx[S] = evals.length;
      evals.push(rec);
    }
  }
  for (const o of pending) o.rec.actualArrivals = null;   // 比賽結束時窗還沒走完
  //  比賽結束時仍在進行的入侵 ⇒ reason "open"（只讀，不呼叫引擎）
  for (const p of e.players) if (p._invV2 && !p._invV2.done) invasionEnds.push(endEntry(p, "open"));

  const lineup = Object.fromEntries(["blue", "red"].map((S) => [S, e.players.filter((p) => p.side === S).map((p) => { const id = heroIdOf(e, p); return id == null ? null : `${p.role}:${id}`; })]));
  const invObs = e.invObs ? JSON.parse(JSON.stringify(e.invObs)) : null;
  return {
    hash: h.digest("hex").slice(0, 16),
    row: { seed, path, tier: path === "career" ? tier : null, ...b.meta, winner: e.winner ?? null, duration: +e.t.toFixed(1), invObs,
      lineup: Object.values(lineup).every((l) => l.every((x) => x == null)) ? null : lineup,
      cost: { euclidMs: r3(cost.euclidMs), pathMs: r3(cost.pathMs), evals: cost.evals, pathCalls: cost.pathCalls },
      counts: { evals: evals.length, noTarget: evals.filter((r) => r.noTarget).length, noLeader: evals.filter((r) => r.noLeader).length, invasionStarts: invasionStarts.length, invasionEnds: invasionEnds.length },
      evals, invasionStarts, invasionEnds },
  };
}

if (process.argv.includes("--selfcheck")) {
  const plain = runMatch(11, { path: "inv", shadow: false }).hash;
  const shadowed = runMatch(11, { path: "inv", shadow: true }).hash;
  const ok = plain === shadowed;
  console.log(JSON.stringify({ selfcheck: "shadow_is_passive", plain, shadowed, ok }));
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
fs.writeFileSync(OUT, JSON.stringify({ tool: "shadow_tactic_exec_v24", gitHead: arg("head", null), path: PATH, tier: PATH === "career" ? TIER : null, seeds, detour: DETOUR, wallSec, rows }));

//  摘要
const mean = (xs) => (xs.length ? r3(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const all = rows.flatMap((r) => r.evals), done = all.filter((r) => r.actualArrivals != null && r.enemyFull);
const ends = {};
for (const r of rows) for (const x of r.invasionEnds) ends[x.reason] = (ends[x.reason] ?? 0) + 1;
const engineStarts = rows.reduce((s, r) => s + (r.invObs ? r.invObs.blue.starts + r.invObs.red.starts : 0), 0);
const sum = (k) => rows.reduce((s, r) => s + r.cost[k], 0);
console.log(JSON.stringify({
  ok: true, n: rows.length, evals: all.length,
  invasionStarts: rows.reduce((s, r) => s + r.invasionStarts.length, 0), engineInvStarts: engineStarts, invasionEnds: ends,
  meanRatioKnown1: mean(all.map((r) => r.ratioKnown?.[0]).filter((x) => x != null)),
  meanRatioFull1: mean(all.map((r) => r.ratioFull?.[0]).filter((x) => x != null)),
  meanAbsArrivalErrFull: mean(done.map((r) => Math.abs(r.enemyFull.count - r.actualArrivals))),
  meanAbsArrivalErrKnown: mean(done.map((r) => Math.abs(r.enemyKnown.count - r.actualArrivals))),
  resolved: done.length,
  invasionsWithEvals: rows.reduce((s, r) => s + r.invasionEnds.filter((x) => x.reason !== "open" && x.evalIdxs.length > 0).length, 0),
  costPerEvalMs: { euclid: sum("evals") ? r3(sum("euclidMs") / sum("evals")) : null, path: sum("pathCalls") ? r3(sum("pathMs") / sum("pathCalls")) : null },
  wallSec,
}));
