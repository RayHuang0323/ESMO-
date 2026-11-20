#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_task_commit_push_v24.mjs — taskCommitPush 的工具層對照（2026-11-15，診斷 Sprint）
//
//  不改任何規則集物件：對局建好之後，只在**這個引擎實例**上把 e.rules 換成一份淺拷貝，
//  其中 taskCommitPush 設成指定值。v23 規則集、指紋、登錄表一律不動。
//  三個臂：
//    plain  不碰 e.rules（基準）
//    off    走同一條覆寫路徑，但值仍是 false ⇒ 必須與 plain 逐 tick 相同（覆寫機制本身不改對局）
//    on     taskCommitPush: true（推進也會被 v19 再任務承諾鎖住 2～6 秒）
//  兩條建局路徑：
//    career  生涯 v23（career.v21 旗標＋mobaJungleV22＋mobaSafeRouteV23），v2.jungle_invasion，全素質＝tier 值
//            （與 task_arbitration_v1.mjs、diag_move_anomalies_v23.mjs 相同）
//    tool    balanceTool.v23，雙方 classic.m7
//  每場量（觀測器 tools/lib/taskArbitrationObs.mjs 與 diag_move_anomalies_v23.mjs 的定義）：
//    stateLanePush  **主要指標**：最終狀態字串 p.state 在「對線」↔「推進」之間轉換的次數
//                   （與上一輪 diag_task_conflicts_v23.mjs K7 同一個量；「推進」是第二段發呆再任務寫的，所以要看最終狀態）
//    statePingPong  轉回前一個狀態、而且中間那段 ≤ 3 秒的次數；statePingPongLanePush＝其中是對線↔推進的
//    lanePush   觀測器第一段「贏的任務」在 default:lane ↔ default:push 之間互換的次數（參考；第一段幾乎不會出現推進）
//    retask     任何一次任務代碼改變的次數
//    commit     第二段改寫裡 rewrite:task_commit 的次數（確認覆寫真的生效）
//    zig        6 秒內移動方向反轉 ≥ 4 次的事件數；zigLanePush＝其中狀態同時含「對線」與推進類的
//    stuck      存活、離泉水 ≥ 25、9 單位內沒有敵方英雄、非回城，連續 20 秒移動 < 0.05 的事件數
//    結果      時長、勝方、各方被拆的塔數、陣亡數、killContexts 類型
//  用法：node tools/owner_preview/diag_task_commit_push_v24.mjs --path=career --tier=mid --arm=on --seeds=98801,98803 --out=<json>
//        node tools/owner_preview/diag_task_commit_push_v24.mjs --selfcheck [--seed=93001]   （plain 與 off 整場雜湊相同；on 不同）
// ============================================================================
import fs from "node:fs";
import { createHash } from "node:crypto";
import { careerContext, FLAG_SETS } from "../lib/careerLiveInputs.mjs";
import { attachTaskArbitration } from "../lib/taskArbitrationObs.mjs";
import { BASE } from "../../src/gameData.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TICK = 0.5, CAP = 3000;
const TIER_VALUE = { low: 30, mid: 60, high: 90 };
const PUSH_STATES = new Set(["推進", "帶線", "攻門牙塔", "圍攻主堡", "圍攻"]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);

function build(seed, path, tier) {
  if (path === "career") {
    const flags = { ...FLAG_SETS(C.G)["career.v21"], mobaJungleV22: true, mobaSafeRouteV23: true };
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    if (ruleset.rulesetId !== "career.v23") throw new Error(`resolved ${ruleset.rulesetId}`);
    const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = TIER_VALUE[tier];
    const players = C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
    const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `recheck-${seed}`, mode: "moba", tacticPlanBinding: bindingOf("v2.jungle_invasion") };
    const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
    if (!out?.engine) throw new Error(`career setup rejected ${seed}`);
    return out.engine;
  }
  if (path === "tool") return configure(seed, "standard", M, 1, null, { blue: { kind: "binding", binding: bindingOf("classic.m7") }, red: { kind: "binding", binding: bindingOf("classic.m7") } }, "balanceTool.v23").e;
  throw new Error(`unknown path ${path}`);
}

function applyArm(e, arm) {
  if (arm === "plain") return;
  if (arm !== "off" && arm !== "on") throw new Error(`unknown arm ${arm}`);
  e.rules = { ...e.rules, taskCommitPush: arm === "on" };
}

const tickLine = (e) => { let s = String(e.t); for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`; return s; };

/** 一場。observe=false ⇒ 只算雜湊。 */
function runMatch(seed, { path, tier, arm, observe = true }) {
  const e = build(seed, path, tier);
  applyArm(e, arm);
  const h = createHash("sha1");
  const obs = observe ? attachTaskArbitration(e, { keep: false }) : null;
  const M_ = { lanePush: 0, retask: 0, zig: 0, zigLanePush: 0, stuck: 0, heroTicks: 0, stateTrans: 0, stateLanePush: 0, statePingPong: 0, statePingPongLanePush: 0 };
  const S = new Map(), lastCode = new Map();
  while (!e.over && e.t < CAP) {
    e.tick(TICK);
    h.update(tickLine(e) + "\n");
    if (!obs) continue;
    for (const r of obs.afterTick()) {
      const code = r.winner === "default" ? `default:${r.kind ?? "other"}` : r.winner, prev = lastCode.get(r.id);
      if (prev != null && prev !== code) {
        M_.retask++;
        if ((prev === "default:lane" && code === "default:push") || (prev === "default:push" && code === "default:lane")) M_.lanePush++;
      }
      lastCode.set(r.id, code);
    }
    for (const p of e.players) {
      let R = S.get(p.id); if (!R) { R = { prev: { ...p.pos }, still: 0, dv: null, flips: [], states: [] }; S.set(p.id, R); }
      if (p.dead) { R.prev = { ...p.pos }; R.still = 0; R.dv = null; R.st = null; lastCode.delete(p.id); continue; }
      M_.heroTicks++;
      //  最終狀態字串的轉換（與 diag_task_conflicts_v23.mjs K7 同一個量：p.state 的 A→B；折返＝回到前一個狀態而且段長 ≤ 3 秒）
      const st = p.state;
      if (R.st == null) { R.st = st; R.stStart = e.t; R.stPrev = null; }
      else if (st !== R.st) {
        M_.stateTrans++;
        const lp = (R.st === "對線" && st === "推進") || (R.st === "推進" && st === "對線");
        if (lp) M_.stateLanePush++;
        if (st === R.stPrev && e.t - R.stStart <= 3) { M_.statePingPong++; if (lp) M_.statePingPongLanePush++; }
        R.stPrev = R.st; R.st = st; R.stStart = e.t;
      }
      const mv = { x: p.pos.x - R.prev.x, y: p.pos.y - R.prev.y }, moved = Math.hypot(mv.x, mv.y);
      const foeClose = e.players.some((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= 9);
      if (moved < 0.05 && dist(p.pos, BASE[p.side]) >= 25 && !foeClose && !String(p.state).includes("回城")) { if (++R.still === 40) M_.stuck++; } else R.still = 0;
      if (moved >= 0.5) {
        if (R.dv && R.dv.x * mv.x + R.dv.y * mv.y < 0) {
          R.flips = R.flips.filter((t) => e.t - t <= 6); R.flips.push(e.t); R.states.push(p.state);
          if (R.flips.length === 4) { M_.zig++; const st = new Set(R.states.slice(-4)); if (st.has("對線") && [...st].some((x) => PUSH_STATES.has(x))) M_.zigLanePush++; R.flips = []; R.states = []; }
        }
        R.dv = mv;
      }
      R.prev = { ...p.pos };
    }
  }
  h.update(`END|${e.winner ?? ""}`);
  const hash = h.digest("hex").slice(0, 16);
  if (!obs) return { hash };
  const sum = obs.summary(); obs.detach();
  const commit = Object.entries(sum.rewrites).filter(([k]) => k.startsWith("rewrite:task_commit")).reduce((s, [, v]) => s + v, 0);
  const towersLost = { blue: 0, red: 0 };
  for (const t of Object.values(e.towers ?? {})) if (t.hp <= 0) towersLost[t.side]++;
  const deaths = { blue: 0, red: 0 };
  for (const p of e.players) deaths[p.side] += (p.deathsT ?? []).length;
  const kc = {}; for (const k of e.killContexts ?? []) kc[k.type] = (kc[k.type] ?? 0) + 1;
  return { hash, row: { seed, path, tier: path === "career" ? tier : null, arm, winner: e.winner ?? null, duration: +e.t.toFixed(1), over: !!e.over,
    ...M_, commit, arbErrors: sum.errors, arbUnseen: sum.unseen, towersLost, deaths, killContexts: kc,
    rulesSeen: { taskCommitPush: e.rules.taskCommitPush, taskCommitV19: !!e.rules.taskCommitV19 } } };
}

if (process.argv.includes("--selfcheck")) {
  const seed = Number(arg("seed", "93001")), path = arg("path", "career"), tier = arg("tier", "mid");
  const plain = runMatch(seed, { path, tier, arm: "plain", observe: false }).hash;
  const off = runMatch(seed, { path, tier, arm: "off", observe: false }).hash;
  const offObserved = runMatch(seed, { path, tier, arm: "off", observe: true }).hash;
  const on = runMatch(seed, { path, tier, arm: "on", observe: false }).hash;
  const ok = plain === off && off === offObserved && on !== plain;
  console.log(JSON.stringify({ selfcheck: "override_harness_is_neutral", seed, path, plain, off, offObserved, on, ok }));
  process.exit(ok ? 0 : 1);
}

const PATH = arg("path", "career"), TIER = arg("tier", "mid"), ARM = arg("arm", "on");
const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number), OUT = arg("out", null);
if (!seeds.length || !OUT) { console.error("need --seeds and --out"); process.exit(2); }
const rows = [], t0 = Date.now();
for (const s of seeds) {
  rows.push(runMatch(s, { path: PATH, tier: TIER, arm: ARM }).row);
  process.stderr.write(`[commitPush] ${PATH}${PATH === "career" ? ":" + TIER : ""} ${ARM} seed ${s} done (${rows.length}/${seeds.length})\n`);
}
fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_task_commit_push_v24", gitHead: arg("head", null), path: PATH, tier: PATH === "career" ? TIER : null, arm: ARM, seeds, wallSec: Math.round((Date.now() - t0) / 1000), rows }));
const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
console.log(JSON.stringify({ ok: true, n: rows.length, arm: ARM, lanePush: sum("lanePush"), commit: sum("commit"), zig: sum("zig"), stuck: sum("stuck"), meanDur: +(sum("duration") / rows.length).toFixed(1) }));
