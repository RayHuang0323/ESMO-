// ============================================================================
//  tools/lib/taskArbitrationObs.mjs — TaskArbitration.v1 step A (RECORD ONLY) passive observer.
//
//  Contract: review/tactic-book-3a/MOBA_複雜問題整合審查.md §2.3. For every hero that is alive at tick
//  start, one record per tick: { winner, kind?, reason, approx, suppressed[], rewrites[] }.
//
//  The engine (src/) is frozen, so this lives outside it:
//   · reads hero/engine state before and after e.tick(), and at the moments the wrapped methods are called;
//   · wraps methods on the engine INSTANCE only. Each wrapper calls the original with the same `this` and
//     args, returns its result unchanged and lets exceptions propagate. Observer bookkeeping lives in Maps
//     owned by this module; no engine or hero field is ever written, no engine method is called by the
//     observer itself (only the engine calls them, through the wrappers).
//
//  How the per-hero chain is tracked: inside LogicEngine.tick the hero loop is sequential. A hero's turn
//  starts at the unnested call `_qual(p, "retreatLate")` (the only top-level call with that key) and ends
//  at the unnested `_heroTauntTarget(p, tgt)`. "Unnested" = not called from inside another wrapped method
//  (a depth counter). Calls are attributed to the hero whose turn is open, and only in the expected phase.
//
//  Stage 1 (winner):   retreat ⇔ the M1.7 tower-zone block (`_siegeTargetV19(p, st)` call) was skipped
//                      (that block runs iff !p.retreating); otherwise the stage-1 label `st` is the argument
//                      of `_siegeTargetV19` unless the v19 task commit replaced it (then the winner was the
//                      lane default, which is the only thing the commit may override). Ambiguous labels are
//                      resolved with the results of the branch predicates (_invadeStepV2, _chaseAliveV3,
//                      _objJoinV3, _initiativeSiegeV3, _callForV20/_seenV20, _joinV3, _combatDecisionV3).
//  Stage 2 (rewrites): in/out comparison of each layer method; task commit from p._taskV19 identity.
// ============================================================================

export const TASKS = Object.freeze(["retreat", "invade", "chase", "disengage", "tower_fallback", "objective_window",
  "initiative_siege", "team_call", "fight_join", "local", "default"]);
export const DEFAULT_KINDS = Object.freeze(["lane", "farm", "gank", "roam", "push", "other"]);
export const REASONS = Object.freeze(["hp_low", "local_retreat", "edge_retreat", "invade_window", "chase_hold", "disengage",
  "tower_fallback", "objective_window", "initiative_siege", "call_focus", "call_lowhp", "fight_join", "local_engage",
  "default_lane", "default_farm", "gank_window", "roam_window"]);
export const REWRITES = Object.freeze(["rewrite:formation", "rewrite:task_commit", "rewrite:tower_zone", "rewrite:idle_retask",
  "rewrite:edge_hold", "rewrite:safe_route", "rewrite:taunt"]);
/** Suppressed entries: a task name, or the default sub-kinds whose window is open (gank / support roam). */
export const SUPPRESSED_KEYS = Object.freeze(["invade", "disengage", "tower_fallback", "objective_window", "initiative_siege",
  "team_call", "fight_join", "local", "default:gank", "default:roam"]);
/** Tasks whose stage-1 decision a stage-2 re-task should not override (contract rule "locked"). */
export const LOCKABLE = Object.freeze(["invade", "chase", "objective_window", "team_call", "fight_join"]);

export const UNOBSERVED_PRECONDITIONS = Object.freeze({
  chase: "chase hold is decided by _chaseAliveV3, which is only called when the hero is not retreating and has no invade target; it mutates p.chaseId, so it cannot be evaluated from outside for the retreat/invade winners",
  "objective_window(per-hero)": "only the team window (fsm3[side].objGo) is read; the per-hero _objJoinV3 check is sticky/stateful and is not re-evaluated",
  "fight_join(per-hero)": "only the hotspot (engine._hotNow) is read; the per-hero _joinV3 decision is sticky/stateful and is not re-evaluated",
  "team_call(vision)": "the _seenV20 vision test of the call target is not evaluated for suppressed calls (only call validity, type, target alive, range, reengage lock)",
  "initiative_siege(risk)": "the v19 risk term (_riskV19) of the follow-up HP floor is not evaluated; only window, target tower, recall, RETURN/RESPAWN and the base initiativeHpMin",
  skipFight: "the split-push skip (director knobs splitLane + _tac.splitGo) is not read; objective_window / initiative_siege / team_call / fight_join / local preconditions ignore it",
});
/** Every stage-2 layer is observable (task commit from p._taskV19 identity at the tower-zone call). */
export const UNOBSERVED_REWRITES = Object.freeze([]);

/** Exact vs approximate, and the engine field / method each value is read from. */
export const EXACTNESS = Object.freeze({
  winner: {
    retreat: ["exact", "_siegeTargetV19 not called in the hero's turn (M1.7 block requires !p.retreating; needs rules.decisionV17)"],
    invade: ["exact", "_invadeStepV2 result non-null (or stage-1 label 入侵 on the non-v2 path)"],
    chase: ["exact", "_chaseAliveV3 result non-null"],
    disengage: ["exact", "stage-1 label 脫戰 (arg of _siegeTargetV19)"],
    tower_fallback: ["exact", "_combatDecisionV3 plan.action FALLBACK + label 避塔"],
    objective_window: ["exact", "_objJoinV3 returned true"],
    initiative_siege: ["exact", "_initiativeSiegeV3 returned true"],
    team_call: ["exact", "_callForV20 type focus/lowhp + _seenV20 true + range at turn start + label 支援 + _joinV3 not called"],
    fight_join: ["exact", "_joinV3 returned true"],
    local: ["exact", "label in {支援,追擊,強開,換血,消耗,拉扯,接戰} not claimed by chase/team_call"],
    default: ["exact for lane/farm/gank/roam; approx for push/other", "stage-1 label; task commit ⇒ lane"],
  },
  reason: {
    hp_low: ["exact when _qual(p,'retreatLate')===0 and p.retreatReason!=null; approx otherwise (hysteresis carry-over or retreatLate shift)", "p.retreatReason, _qual result"],
    local_retreat: ["exact", "_combatDecisionV3 plan.action RETREAT"],
    edge_retreat: ["exact when the hero was not retreating before the tick; approx otherwise", "p._edgeRetreatV23 before tick"],
    invade_window: ["exact", "_invadeStepV2"], chase_hold: ["exact", "_chaseAliveV3"], disengage: ["exact", "label"],
    tower_fallback: ["exact", "plan.action"], objective_window: ["exact", "_objJoinV3"], initiative_siege: ["exact", "_initiativeSiegeV3"],
    call_focus: ["exact", "_callForV20().type"], call_lowhp: ["exact", "_callForV20().type"], fight_join: ["exact", "_joinV3"],
    local_engage: ["exact", "label"], default_lane: ["exact for 對線/游走/commit; approx for push (帶線/攻門牙塔/圍攻主堡/圍攻) and other (回防)", "label"],
    default_farm: ["exact", "label 打野"], gank_window: ["exact", "label 抓人"], roam_window: ["exact", "label 遊走"],
  },
  suppressed: {
    invade: ["exact", "_invadeEndV2(p,'retreat') called unnested in the hero's turn"],
    disengage: ["exact", "p.fsm==='DISENGAGE' && t<p.fsmUntil at turn start (rules.engagementFsm)"],
    tower_fallback: ["exact", "_combatDecisionV3 plan.action FALLBACK"],
    objective_window: ["approx (team window only)", "fsm3[side].objGo && engine.neutrals"],
    initiative_siege: ["approx (no risk term)", "fsm3[side].initKind/initUntil/initTarget, p.recallT, p.fsm, hp/maxHp ≥ rules.initiativeHpMin, not retreating"],
    team_call: ["approx (no vision test)", "p.callV20 type/until/target, rules.callRange, p.reengageAt"],
    fight_join: ["approx (hotspot only)", "engine._hotNow"],
    local: ["approx (no skipFight)", "_combatDecisionV3 plan action/targetId/fresh + distances at turn start"],
    "default:gank": ["exact", "(tacticOn ? _tac : fsm3)[side].gankUntil > t, jungle, read at the hero's taunt call"],
    "default:roam": ["exact", "_tac[side].roamUntil > t, support, tacticOn"],
  },
  rewrites: {
    "rewrite:formation": ["exact", "_archPosition in/out (|Δ|>1e-6)"],
    "rewrite:task_commit": ["exact", "p._taskV19 at the _siegeTargetV19 call === p._taskV19 before tick; target T.pos vs _archPosition output (counted when formation was skipped)"],
    "rewrite:tower_zone": ["exact", "_towerZoneV17 results inside the M1.7 block: final tz.inZone && !tz.allow"],
    "rewrite:idle_retask": ["exact", "_nextTaskV17 returned non-null"],
    "rewrite:edge_hold": ["exact", "_towerEdgeHoldV23 in/out"],
    "rewrite:safe_route": ["exact", "_safeWaypointV23 in/out"],
    "rewrite:taunt": ["exact", "_heroTauntTarget in/out"],
  },
});

const RANK = Object.fromEntries(TASKS.map((k, i) => [k, i]));
const SUPP_RANK = { "default:gank": RANK.default, "default:roam": RANK.default };
const LOCAL_LABELS = new Set(["支援", "追擊", "強開", "換血", "消耗", "拉扯", "接戰"]);
const DEFAULT_KIND = { "對線": "lane", "游走": "lane", "打野": "farm", "抓人": "gank", "遊走": "roam",
  "帶線": "push", "攻門牙塔": "push", "圍攻主堡": "push", "圍攻": "push", "回防": "other" };
const KIND_REASON = { lane: "default_lane", farm: "default_farm", gank: "gank_window", roam: "roam_window", push: "default_lane", other: "default_lane" };
const EPS = 1e-6;
const moved = (a, b) => {
  if (!a || !b) return a !== b;
  return Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

const WRAPPED = Object.freeze(["tick", "_qual", "_riskAssessV18", "_combatDecisionV3", "_invadeStepV2", "_invadeEndV2",
  "_chaseAliveV3", "_objJoinV3", "_initiativeSiegeV3", "_callForV20", "_seenV20", "_joinV3", "_towerEdgeAvoidV23",
  "_archPosition", "_siegeTargetV19", "_towerZoneV17", "_idleReasonV17", "_nextTaskV17", "_towerEdgeHoldV23",
  "_safeWaypointV23", "_heroTauntTarget"]);

export function attachTaskArbitration(engine, opts = {}) {
  const keep = !!opts.keep;
  const records = [];
  const errors = [];
  const A = { ticks: 0, records: 0, unseen: 0, approx: 0, winners: {}, kinds: {}, reasons: {}, reasonApprox: {},
    suppressed: {}, rewrites: {}, overridden: {} };
  let lastTick = [];
  let depth = 0;          // nesting of wrapped (non-tick) calls
  let inTick = false;
  let pre = null;         // Map id → pre-tick snapshot
  let H = null;           // Map id → per-hero turn state for this tick
  let cur = null;         // hero whose turn is open
  let plans = null;       // Map id → { action, targetId, fresh }
  const R = () => engine.rules ?? {};

  const safe = (fn) => { try { fn(); } catch (err) { errors.push(String(err?.stack ?? err)); } };
  const turnOf = (p) => (inTick && cur && p && p === cur ? H.get(p.id) : null);

  // ── hooks (all read-only) ────────────────────────────────────────────────────────────
  function enterTurn(p, rLate) {
    const t = engine.t, rules = R();
    const players = engine.players;
    const aliveNow = (id) => { const q = players.find((x) => x.id === id); return q && pre.has(q.id) && pre.get(q.id).living && !q.dead ? q : null; };
    const s = { phase: "S1", rLate, stArg: undefined, commitApplied: false, inv: null, invEndRetreat: false, chase: false,
      objJoin: false, init: false, call: null, seenPending: false, seen: undefined, joinCalled: false, join: false,
      fallbackAvoid: false, formIn: null, formOut: null, formCalled: false, tz: [], idleCalled: false, next: false,
      edge: null, safeRoute: null, taunt: null, done: false, gankOpen: false, roamOpen: false };
    // turn-start reads (fsm not yet touched by this hero's branches)
    s.fsm = p.fsm ?? null; s.fsmUntil = p.fsmUntil ?? null;
    s.hot = !!engine._hotNow;
    const F = engine.fsm3?.[p.side] ?? null;
    s.objGo = !!(rules.engagementFsm && engine.neutrals && F?.objGo);
    const tw = F?.initTarget != null ? engine.towers?.[F.initTarget] : null;
    s.initPre = !!(rules.engagementFsm && F && F.initKind === "siege" && t < F.initUntil && tw && tw.hp > 0 &&
      !((p.recallT ?? 0) > 0) && p.fsm !== "RETURN" && p.fsm !== "RESPAWN" &&
      p.hp / p.maxHp >= (rules.initiativeHpMin ?? 0));
    // team call precondition (vision not evaluated) + exact range for winner disambiguation
    const c = p.callV20;
    s.callPre = false; s.callInRange = false;
    if (rules.teamCallV20 && c && t < c.until && (c.type === "focus" || c.type === "lowhp")) {
      const tq = c.targetId != null ? aliveNow(c.targetId) : null;
      if (tq) {
        s.callInRange = dist(p.pos, tq.pos) <= (rules.callRange?.[c.type] ?? 25) + 6;
        s.callPre = s.callInRange && t >= (p.reengageAt ?? -Infinity);
      }
    }
    // local decision precondition (skipFight not evaluated)
    const pl = plans.get(p.id) ?? null;
    s.plan = pl;
    s.localPre = false;
    if (pl) {
      const lt = pl.targetId != null ? aliveNow(pl.targetId) : null;
      if (pl.fresh && pl.action === "SUPPORT" && lt) s.localPre = true;
      else if (lt) {
        const d = dist(p.pos, lt.pos);
        s.localPre = (pl.action === "ENGAGE" && d <= 6.5) || (pl.action === "PURSUE" && d <= (rules.decisionContact ?? 0)) ||
          (!!pl.fresh && pl.action === "KITE" && d <= 6.5);
      }
    }
    H.set(p.id, s);
    cur = p;
  }

  const HOOKS = {
    _qual(args, r, top) {
      if (!top || !inTick || args[1] !== "retreatLate") return;
      const p = args[0];
      if (!p || !pre.has(p.id) || !pre.get(p.id).living || H.has(p.id)) return;
      enterTurn(p, r);
    },
    _combatDecisionV3(args, r) {
      if (!inTick || !args[0]) return;
      plans.set(args[0].id, r ? { action: r.action ?? null, targetId: r.targetId ?? null, fresh: !!r.fresh } : null);
    },
    _invadeStepV2(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") s.inv = r ? { st: r.st } : null; },
    _invadeEndV2(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1" && args[1] === "retreat") s.invEndRetreat = true; },
    _chaseAliveV3(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") s.chase = !!r; },
    _objJoinV3(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") s.objJoin = !!r; },
    _initiativeSiegeV3(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") s.init = !!r; },
    _callForV20(args, r, top) {
      const s = top && turnOf(args[0]);
      if (s && s.phase === "S1") { s.call = r ? { type: r.type, targetId: r.targetId ?? null } : null; s.seenPending = true; }
    },
    _seenV20(args, r, top) {
      if (!top || !inTick || !cur) return;
      const s = H.get(cur.id);
      if (s && s.seenPending && s.phase === "S1") { s.seen = !!r; s.seenPending = false; }
    },
    _joinV3(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") { s.joinCalled = true; s.join = !!r; } },
    _towerEdgeAvoidV23(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "S1") s.fallbackAvoid = true; },
    _archPosition(args, r, top) {
      const s = top && turnOf(args[0]);
      if (s && s.phase === "S1") { s.formCalled = true; s.formIn = args[1] ? { x: args[1].x, y: args[1].y } : null; s.formOut = r ? { x: r.x, y: r.y } : null; s.phase = "F"; }
    },
    _siegeTargetV19(args, r, top) {
      const p = args[0], s = top && turnOf(p);
      if (!s || (s.phase !== "S1" && s.phase !== "F")) return;
      s.stArg = args[1];
      const T0 = pre.get(p.id).task;
      s.commitApplied = T0 != null && p._taskV19 === T0;
      if (s.commitApplied) s.commitPos = { x: T0.pos.x, y: T0.pos.y };
      s.phase = "Z";
    },
    _towerZoneV17(args, r, top) {
      const s = top && turnOf(args[0]);
      if (s && s.phase === "Z" && r) s.tz.push({ at: args[3] != null, inZone: !!r.inZone, allow: !!r.allow });
    },
    _idleReasonV17(args, r, top) { const s = top && turnOf(args[0]); if (s && !s.done) { s.idleCalled = true; s.phase = "I"; } },
    _nextTaskV17(args, r, top) { const s = top && turnOf(args[0]); if (s && s.phase === "I") s.next = !!r; },
    _towerEdgeHoldV23(args, r, top) { const s = top && turnOf(args[0]); if (s && !s.done) { s.edge = moved(args[3], r); s.phase = "E"; } },
    _safeWaypointV23(args, r, top) { const s = top && turnOf(args[0]); if (s && !s.done) { s.safeRoute = moved(args[1], r); s.phase = "W"; } },
    _heroTauntTarget(args, r, top) {
      const p = args[0], s = top && turnOf(p);
      if (!s || s.done) return;
      s.taunt = moved(args[1], r);
      const t = engine.t;
      const GS = engine.tacticOn ? engine._tac?.[p.side] : engine.fsm3?.[p.side];
      s.gankOpen = p.role === "jungle" && !!GS && t < (GS.gankUntil ?? 0);
      s.roamOpen = p.role === "sup" && !!engine.tacticOn && !!engine._tac?.[p.side] && t < (engine._tac[p.side].roamUntil ?? 0);
      s.done = true; s.phase = "DONE";
      cur = null;
    },
  };

  // ── classification ───────────────────────────────────────────────────────────────────
  function classify(p, s, P) {
    const rules = R(), t = engine.t;
    let winner, kind = null, reason, approx = false;
    if (!rules.decisionV17) {
      approx = true;   // no M1.7 block ⇒ cannot separate stage 1 from stage 2; fall back to the final label
    }
    const retreatInLoop = s.stArg === undefined;
    const st = s.commitApplied ? (p.role === "jungle" ? "游走" : "對線") : s.stArg;
    if (retreatInLoop) {
      winner = "retreat";
      const hpFlag = p.retreatReason != null;
      const edge = P.edgeRetreat != null && t - P.edgeRetreat <= 1;
      if (hpFlag && s.rLate === 0) reason = "hp_low";
      else if (s.plan?.action === "RETREAT") reason = "local_retreat";
      else if (hpFlag) { reason = "hp_low"; approx = true; }
      else if (edge) { reason = "edge_retreat"; if (P.retreating) approx = true; }
      else { reason = "hp_low"; approx = true; }
    } else if (s.inv || st === "入侵") { winner = "invade"; reason = "invade_window"; if (!s.inv) approx = true; }
    else if (s.chase) { winner = "chase"; reason = "chase_hold"; }
    else if (st === "脫戰") { winner = "disengage"; reason = "disengage"; }
    else if (st === "避塔" && s.plan?.action === "FALLBACK") { winner = "tower_fallback"; reason = "tower_fallback"; }
    else if (s.objJoin) { winner = "objective_window"; reason = "objective_window"; }
    else if (s.init) { winner = "initiative_siege"; reason = "initiative_siege"; }
    else if (st === "支援" && s.call && (s.call.type === "focus" || s.call.type === "lowhp") && s.seen === true && s.callInRange && !s.joinCalled) {
      winner = "team_call"; reason = s.call.type === "lowhp" ? "call_lowhp" : "call_focus";
    }
    else if (s.join) { winner = "fight_join"; reason = "fight_join"; }
    else if (LOCAL_LABELS.has(st)) { winner = "local"; reason = "local_engage"; }
    else {
      winner = "default";
      kind = DEFAULT_KIND[st] ?? "other";
      reason = KIND_REASON[kind];
      if (kind === "push" || kind === "other") approx = true;
    }
    // suppressed (lower priority than the winner, precondition observably true)
    const wr = RANK[winner], sup = [];
    const add = (k, on) => { if (on && (SUPP_RANK[k] ?? RANK[k]) > wr) sup.push(k); };
    add("invade", s.invEndRetreat);
    add("disengage", !!(rules.engagementFsm && s.fsm === "DISENGAGE" && t < (s.fsmUntil ?? 0)));
    add("tower_fallback", s.plan?.action === "FALLBACK");
    add("objective_window", s.objGo);
    add("initiative_siege", s.initPre && !retreatInLoop);
    add("team_call", s.callPre);
    add("fight_join", s.hot);
    add("local", s.localPre);
    if (winner !== "default") { add("default:gank", s.gankOpen); add("default:roam", s.roamOpen); }
    // rewrites in application order
    const rw = [];
    if (s.formCalled && moved(s.formIn, s.formOut)) rw.push("rewrite:formation");
    if (s.commitApplied && (!s.formCalled || moved(s.formOut, s.commitPos))) rw.push("rewrite:task_commit");
    if (s.tz.length) {
      let tz = s.tz[0];
      const at = s.tz[1];
      if (at && at.inZone && !at.allow) tz = at;
      if (tz.inZone && !tz.allow) rw.push("rewrite:tower_zone");
    }
    if (s.next) rw.push("rewrite:idle_retask");
    if (s.edge) rw.push("rewrite:edge_hold");
    if (s.safeRoute) rw.push("rewrite:safe_route");
    if (s.taunt) rw.push("rewrite:taunt");
    const rec = { t, id: p.id, winner, reason, approx, suppressed: sup, rewrites: rw };
    if (kind) rec.kind = kind;
    return rec;
  }

  function finalizeTick(t0) {
    if (engine.t === t0) { lastTick = []; return; }   // tick returned early (match over): no decisions were made
    A.ticks++;
    const out = [];
    for (const p of engine.players) {
      const P = pre.get(p.id);
      if (!P?.living) continue;
      const s = H.get(p.id);
      let rec;
      if (!s || !s.done) {
        A.unseen++;
        rec = { t: engine.t, id: p.id, winner: "default", kind: "other", reason: "default_lane", approx: true, suppressed: [], rewrites: [], unseen: true };
      } else rec = classify(p, s, P);
      out.push(rec);
      A.records++;
      if (rec.approx) { A.approx++; inc(A.reasonApprox, rec.reason); }
      inc(A.winners, rec.winner);
      if (rec.kind) inc(A.kinds, rec.kind);
      inc(A.reasons, rec.reason);
      for (const k of rec.suppressed) inc(A.suppressed, `${k}>${rec.winner}`);
      for (const k of rec.rewrites) {
        inc(A.rewrites, `${k}|${rec.winner}`);
        if ((k === "rewrite:idle_retask" || k === "rewrite:task_commit") && LOCKABLE.includes(rec.winner)) inc(A.overridden, `${k}|${rec.winner}`);
      }
      if (keep) records.push(rec);
    }
    lastTick = out;
  }

  // ── transparent instance wrapping ────────────────────────────────────────────────────
  const saved = [];
  const missing = [];
  function wrap(name, make) {
    const orig = engine[name];
    if (typeof orig !== "function") { missing.push(name); return; }
    saved.push({ name, orig, own: Object.prototype.hasOwnProperty.call(engine, name) });
    engine[name] = make(orig);
  }
  wrap("tick", (orig) => function wrappedTick(...args) {
    if (inTick) return orig.apply(this, args);   // re-entrancy guard (never expected)
    const t0 = engine.t;
    safe(() => {
      pre = new Map(); H = new Map(); plans = new Map(); cur = null; depth = 0;
      for (const p of engine.players) pre.set(p.id, { living: !p.dead, edgeRetreat: p._edgeRetreatV23 ?? null, retreating: !!p.retreating, task: p._taskV19 ?? null });
    });
    inTick = true;
    let r;
    try { r = orig.apply(this, args); } finally { inTick = false; cur = null; }
    safe(() => finalizeTick(t0));
    return r;
  });
  for (const name of WRAPPED) {
    if (name === "tick") continue;
    const hook = HOOKS[name];
    wrap(name, (orig) => function wrapped(...args) {
      const top = depth === 0;
      depth++;
      let r;
      try { r = orig.apply(this, args); } finally { depth--; }
      if (hook && inTick) safe(() => hook(args, r, top));
      return r;
    });
  }

  function detach() {
    for (const { name, orig, own } of saved.slice().reverse()) {
      if (own) engine[name] = orig;
      else delete engine[name];
    }
    saved.length = 0;
  }
  function summary() {
    const rules = R();
    return { contract: "TaskArbitration.v1", step: "A", ...A, errors: errors.length, firstError: errors[0] ?? null, missingMethods: missing.slice(),
      rules: { decisionV17: !!rules.decisionV17, taskCommitV19: !!rules.taskCommitV19, engagementFsm: !!rules.engagementFsm,
        teamCallV20: !!rules.teamCallV20, twoPhaseTick: !!rules.twoPhaseTick, tacticOn: !!engine.tacticOn,
        invasionV2: !!engine._invasionV2, towerEdgeV23: !!engine._towerEdgeV23, safeRouteV23: !!engine._safeRouteV23 } };
  }
  return { afterTick: () => lastTick, summary, records, detach, wrapped: saved.map((x) => x.name), errors };
}
