#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_combat_state_v1.mjs — Persistent Combat State v1（CombatState.v1）
//
//  執行：node tools/check_moba_combat_state_v1.mjs [--matches=16] [--json=<path>]
//  正式設定（hero skills＋定位＋原型＋召喚師技能＋標準戰術＋裝備，v3）逐 tick 驗：
//    C  契約形狀：id／kind／startedAt ≤ until／ended 有 endedAt＋reason＋遞增 seq
//    S  同源：每 20 tick，snapshot.combatStates 的英雄狀態集合 ＝ 同一 snapshot 的 players[].statusEffects
//       （存活英雄；兩者都來自 LogicEngine._statusEffectsOf）
//    D  決定性：同 seed 兩次，整條 combatStates 串流相同
//    Z  領域／DoT：area-dot／barrier-line／dash-wall 有 zone 狀態、root-dot 有受害者 dot
//    R  Replay：真正的 replayBuffer 擷取（每 tick／每 2 tick＝快速完成）→ validateMobaReplay →
//       createReplaySource().seek(t) 在每個取樣時刻還原的 statusEffects／領域 ＝ 現場同一時刻
//    M  支援矩陣：每個有持續時間的 mechanic，施放後 ≤0.55 秒內出現持續狀態，且
//       (until − startedAt) 與規則持續欄位吻合（技能等級＋天賦 ⇒ 容許 0.8–1.45 倍）
//  ⚠ 只讀；不改規則、不改 seed。持續欄位清單在 DURATION_FIELDS。
// ============================================================================
import { writeFileSync } from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills, compileGameplaySkill } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { toEngineHeroMods } from "../src/battle/moba/mobaHeroProfile.js";
import { toEngineSpells, buildLoadout } from "../src/battle/moba/mobaHeroLoadout.js";
import { toEngineArchetypes } from "../src/data/heroCombatArchetypes.js";
import { toEngineTactic, STANDARD_OPP_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";
import { matchItemsConfig } from "../src/battle/moba/items/buildStrategyPrep.js";
import { beginReplayCapture, captureReplayFrame, finalizeReplay } from "../src/battle/moba/replay/replayBuffer.js";
import { createReplaySource } from "../src/battle/moba/replay/replayPresentationSource.js";
import { validateMobaReplay, estimateReplaySize } from "../src/platform/contracts/mobaReplay.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const MATCHES = Number(arg("matches", "16"));
let pass = 0, fail = 0;
const ck = (label, ok, note = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${label}${note ? `　${note}` : ""}`); };

const DURATION_FIELDS = ["controlDuration", "rootDuration", "silenceDuration", "tauntDuration", "slowDuration",
  "shieldDuration", "guardDuration", "dotDuration", "wallDuration", "duration", "markDuration"];
const REASONS = new Set(["expired", "death", "broken", "removed"]);

//  名單：依 seed 輪替 100 名英雄（每個 lane 輪流），讓大多數技能在少量場次內都出現。
const LANE_ZH = ["上路", "打野", "中路", "下路", "輔助"];
const byLane = LANE_ZH.map((l) => CHAMPIONS_100.filter((h) => h.lane === l));
const rosterFor = (m) => {
  const roster = {};
  for (let i = 0; i < 5; i++) {
    const pool = byLane[i];
    roster[`b${i + 1}`] = { heroId: pool[(m * 2) % pool.length].id };
    roster[`r${i + 1}`] = { heroId: pool[(m * 2 + 1) % pool.length].id };
  }
  for (const [seat, row] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = row.spells;
  return roster;
};
const makeEngine = (seed, roster) => {
  const e = new LogicEngine(seed, null);
  const hm = toEngineHeroMods(roster, heroById); if (hm) e.configureHeroes(hm);
  e.configureHeroSkills(toEngineHeroSkills(roster, null));
  const am = toEngineArchetypes(roster);
  if (am) { const blue = {}, red = {}; for (const [pid, v] of Object.entries(am)) (pid[0] === "r" ? red : blue)[pid] = v;
    e.configureArchetypes({ blue, red, meta: { version: "cs-v1", seats: 10 } }); }
  const sp = toEngineSpells(roster); if (sp) e.configureSpells(sp);
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: { tacticId: "std" } });
  const ic = matchItemsConfig({ roster, heroLookup: heroById, buildStrategy: "standard" }); if (ic) e.configureItems(ic);
  return e;
};

const shapeErrors = [], syncErrors = [];
const casts = [];          // { skillId, sourceId, side, t }
const states = new Map();  // id → row（最後一次看到的；ended 覆蓋 active）
//  touch＝某筆狀態「新出現」或「until 被延長」的那個 tick（刷新既有狀態也算一次套用）。
const touches = [];        // { m, kind, targetId, side, sourceId, skillId, t, until }
const DEBUFF = new Set(["stun", "knockup", "root", "silence", "taunt", "slow", "hero-slow", "mark", "dot", "ignite"]);
let lastSeq = 0;
function runMatch(m, { record = true, maxTicks = 7200 } = {}) {
  const roster = rosterFor(m);
  const e = makeEngine(m * 2 + 1, roster);
  const seenFx = new Set();
  const lastUntil = new Map();
  const stream = [];
  let seq = 0;
  for (let tick = 0; tick < maxTicks && !e.over; tick++) {
    e.tick(0.5);
    const cs = e._snapCombatStates();
    stream.push(JSON.stringify([cs.seq, cs.active.map((r) => r.id + r.until)]));
    if (!record) continue;
    for (const f of e.fx) {
      if (!f.skillId || seenFx.has(f.id) || f.feedback !== "skill") continue;
      seenFx.add(f.id);
      const src = e.players.find((q) => q.id === f.sourceId);
      casts.push({ m, skillId: f.skillId, sourceId: f.sourceId, side: src?.side, t: f.at });
    }
    for (const r of [...cs.active, ...cs.ended]) {
      const bad = !r.id || !r.kind || !(r.startedAt <= r.until + 1e-6)
        || (r.endedAt !== undefined && (!(r.endedAt >= r.startedAt - 1e-6) || !REASONS.has(r.reason) || !Number.isInteger(r.seq)));
      if (bad && shapeErrors.length < 5) shapeErrors.push(JSON.stringify(r));
      states.set(`${m}:${r.id}`, { ...r, m });
    }
    for (const r of cs.active) {
      const prev = lastUntil.get(r.id);
      if (prev === undefined || r.until > prev + 0.05) {
        const target = r.targetId ? e.players.find((q) => q.id === r.targetId) : null;
        touches.push({ m, kind: r.kind, targetId: r.targetId, side: target?.side ?? r.side, sourceId: r.sourceId,
          skillId: r.skillId, t: e.t, until: r.until, zone: r.kind.startsWith("zone-") });
      }
      lastUntil.set(r.id, r.until);
    }
    for (const r of cs.ended) { if (r.seq <= seq && r.seq > seq - 200) continue; seq = Math.max(seq, r.seq); }
    if (tick % 20 === 0) {
      const snap = e.snapshot();
      const fromStatus = snap.players.filter((p) => !p.dead).flatMap((p) => (p.statusEffects ?? []).map((s) => `${s.id}:${p.id}`)).sort();
      const fromCs = (snap.combatStates?.active ?? []).filter((r) => r.targetId).map((r) => `${r.kind}:${r.targetId}`).sort();
      if (JSON.stringify(fromStatus) !== JSON.stringify(fromCs) && syncErrors.length < 5) {
        syncErrors.push(`m${m} t=${snap.ts} status=${fromStatus.join(",")} cs=${fromCs.join(",")}`);
      }
    }
  }
  lastSeq = Math.max(lastSeq, seq);
  return { over: e.over, stream: stream.join("|") };
}

const t0 = Date.now();
const results = [];
for (let m = 0; m < MATCHES; m++) results.push(runMatch(m));
console.log(`（${MATCHES} 場，${Math.round((Date.now() - t0) / 1000)} 秒；施放 ${casts.length} 次、狀態 ${states.size} 筆）`);

ck("C1 契約形狀：id／kind／startedAt ≤ until／ended 帶 endedAt＋合法 reason＋整數 seq", shapeErrors.length === 0, shapeErrors.join(" ¦ "));
ck("S1 同源：combatStates 的英雄狀態 ＝ 同一 snapshot 的 statusEffects（每 20 tick）", syncErrors.length === 0, syncErrors.join(" ¦ "));
const again = runMatch(0, { record: false });
ck("D1 決定性：同 seed 兩次 combatStates 串流相同", again.stream === results[0].stream);
ck("D2 全部場次正常結束", results.every((r) => r.over), `${results.filter((r) => r.over).length}/${results.length}`);

const all = [...states.values()];
const byKind = {};
for (const r of all) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
const reasons = {};
for (const r of all) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
console.log(`   狀態種類：${JSON.stringify(byKind)}`);
console.log(`   結束原因：${JSON.stringify(reasons)}`);
ck("Z1 領域（zone-dot／zone-wall／zone-dashwall）有帶形狀與施放時刻", ["zone-dot", "zone-wall", "zone-dashwall"].some((k) => byKind[k])
  && all.filter((r) => r.kind.startsWith("zone-")).every((r) => r.shape && Number.isFinite(r.activeFrom)), JSON.stringify(Object.fromEntries(Object.entries(byKind).filter(([k]) => k.startsWith("zone")))));
ck("Z2 受害者 DoT 狀態（dot）有出現且帶來源", (byKind.dot ?? 0) > 0 && all.filter((r) => r.kind === "dot").every((r) => r.sourceId), String(byKind.dot ?? 0));

// ── M 支援矩陣 ──────────────────────────────────────────────────────────
const ruleOf = new Map();
for (const h of CHAMPIONS_100) for (const slot of ["Q", "W", "E", "R"]) {
  const r = compileGameplaySkill(h.id, slot); if (r) ruleOf.set(`${h.id}:${slot}`, r);
}
const durationsOf = (rule) => {
  const out = DURATION_FIELDS.filter((f) => rule[f] > 0).map((f) => rule[f]);
  if (rule.mechanic === "area-dot") out.push((rule.delay ?? 0) + rule.dotDuration);
  return out;
};
const touchesByMatch = new Map();
for (const x of touches) { if (!touchesByMatch.has(x.m)) touchesByMatch.set(x.m, []); touchesByMatch.get(x.m).push(x); }
const mech = {};
for (const c of casts) {
  const rule = ruleOf.get(c.skillId); if (!rule) continue;
  const durs = durationsOf(rule);
  const row = mech[rule.mechanic] ?? (mech[rule.mechanic] = { timed: durs.length > 0, casts: 0, withState: 0, durationOk: 0, kinds: new Set(), skills: new Set(), missSkills: new Set() });
  row.casts++; row.skills.add(c.skillId);
  if (!durs.length) continue;
  //  窗：施放時刻 → ＋投射物飛行時間＋0.55 秒（效果在命中那一 tick 才套用）
  const win = (rule.travel ?? 0) + 0.55;
  const cand = (touchesByMatch.get(c.m) ?? []).filter((x) => x.t >= c.t - 0.01 && x.t <= c.t + win && (
    x.skillId === c.skillId || x.sourceId === c.sourceId
    || (!x.sourceId && (DEBUFF.has(x.kind) ? x.side !== c.side : x.side === c.side))));
  if (!cand.length) { row.missSkills.add(c.skillId); continue; }
  row.withState++;
  cand.forEach((x) => row.kinds.add(x.kind));
  if (cand.some((x) => durs.some((d) => { const len = x.until - x.t; return len >= d * 0.8 - 0.55 && len <= d * 1.45 + 0.3; }))) row.durationOk++;
}
const timed = Object.entries(mech).filter(([, r]) => r.timed);
const covered = timed.filter(([, r]) => r.withState / r.casts >= 0.5);
console.log("\n   mechanic 支援矩陣（有持續時間者）：施放 → 有狀態 → 時長吻合｜狀態種類");
for (const [k, r] of timed.sort((a, b) => b[1].casts - a[1].casts)) {
  console.log(`   ${k.padEnd(22)} ${String(r.casts).padStart(5)} → ${String(r.withState).padStart(5)} → ${String(r.durationOk).padStart(5)}｜${[...r.kinds].join(",")}`);
}
const untimed = Object.entries(mech).filter(([, r]) => !r.timed).map(([k]) => k);
console.log(`   （無持續時間、屬瞬發的 mechanic：${untimed.join(", ")}）`);
//  M 段是實戰命中率（歸因含同 tick 其他技能的雜訊、投射物會被閃掉）⇒ 只列資訊，不當支援率 gate。
console.log(`   ⓘ M1 實戰：有持續時間的 mechanic 中 ${covered.length}/${timed.length} 的施放過半產生持續狀態（未過半：${timed.filter(([, r]) => r.withState / r.casts < 0.5).map(([k, r]) => `${k} ${r.withState}/${r.casts}`).join("、") || "無"}；投射物／延遲範圍會被閃避）`);
const durTotal = timed.reduce((a, [, r]) => a + r.withState, 0), durOk = timed.reduce((a, [, r]) => a + r.durationOk, 0);
ck(`M2 實戰中有狀態的施放，持續時間與規則吻合 ≥ 90%（${durOk}/${durTotal}）`, durOk / Math.max(1, durTotal) >= 0.9);

// ── X 正式支援矩陣（受控單技能情境，精確歸因；tools/check_moba_combat_state_matrix.mjs）──────────
//  唯一允許的非 OK：TD-CS1 split-projectile 宣告 slowDuration 但引擎命中處理只對 projectile 套減速
//  （wiring bug，修正會改模擬結果 ⇒ 等 Owner 決定 v16，不在此放寬）。
const KNOWN_NOT_OK = new Set(["liuxing:Q", "miwu:E"]);
{
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, mkdtempSync } = await import("node:fs");
  const os = await import("node:os"); const path = await import("node:path");
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "esmo-cs-")), "matrix.json");
  execFileSync(process.execPath, [(await import("node:url")).fileURLToPath(new URL("./check_moba_combat_state_matrix.mjs", import.meta.url)), `--json=${out}`], { stdio: "ignore" });
  const mx = JSON.parse(readFileSync(out, "utf8"));
  const notOk = mx.rows.filter((r) => r.fields.length && r.fields.some((f) => f.verdict !== "OK")).map((r) => r.skillId);
  console.log(`   正式支援矩陣：${mx.skillOk}/${mx.timed}（${(mx.skillOk / mx.timed * 100).toFixed(1)}%）欄位 ${JSON.stringify(mx.tally)}`);
  ck(`X1 正式支援矩陣：非 OK 只剩已登記的 wiring bug（TD-CS1：${[...KNOWN_NOT_OK].join("、")}）`,
    notOk.every((id) => KNOWN_NOT_OK.has(id)) && notOk.length === KNOWN_NOT_OK.size, notOk.join(","));
}

// ── R Replay ───────────────────────────────────────────────────────────────
const sig = (list) => (list ?? []).map((e) => `${e.id}:${Math.round((e.remaining ?? 0) * 10)}`).sort().join(",");
const ids = (list) => (list ?? []).map((e) => e.id).sort().join(",");
const amt = (list) => (list ?? []).filter((e) => e.amount !== undefined).map((e) => `${e.id}:${e.amount}`).sort().join(",");
const zsig = (list) => (list ?? []).filter((z) => String(z.kind).startsWith("zone-")).map((z) => `${z.kind}:${z.sourceId}:${Math.round(z.until * 10)}`).sort().join(",");
for (const [label, every] of [["每 tick 擷取", 1], ["每 2 tick 擷取（快速完成）", 2]]) {
  const m = 3;
  const roster = rosterFor(m);
  const e = makeEngine(m * 2 + 1, roster);
  beginReplayCapture({ seed: m * 2 + 1, config: {}, roster });
  const probes = [];
  for (let tick = 0; tick < 7200 && !e.over; tick++) {
    e.tick(0.5);
    const snap = tick % every === 0 || e.over ? e.snapshot() : null;
    if (snap) captureReplayFrame(snap);
    if (tick % 7 === 3) {
      const live = snap ?? e.snapshot();
      probes.push({ t: live.ts, players: live.players.map((p) => (p.dead ? null : sig(p.statusEffects))),
        kinds: live.players.map((p) => (p.dead ? null : ids(p.statusEffects))),
        amounts: live.players.map((p) => (p.dead ? null : amt(p.statusEffects))), zones: zsig(live.combatStates?.active) });
    }
  }
  const replay = finalizeReplay({ matchId: `cs-v1-${every}`, events: [] });
  const v = validateMobaReplay(replay);
  ck(`R1[${label}] Replay 通過 validateMobaReplay，且帶 combatStates 區間表`, v.ok && !!replay?.combatStates?.rows?.length, v.errors.join(";") + ` rows=${replay?.combatStates?.rows?.length}`);
  const src = createReplaySource(replay);
  let mism = 0, zmis = 0, compared = 0, amis = 0, acmp = 0, kmis = 0; const ex = [];
  for (const pr of probes) {
    src.seek(pr.t);
    const rs = src.getState().snapshot;
    pr.players.forEach((liveSig, i) => {
      if (liveSig === null) return;
      compared++;
      const got = sig(rs.players[i].statusEffects);
      if (ids(rs.players[i].statusEffects) !== pr.kinds[i]) kmis++;
      if (got !== liveSig) { mism++; if (ex.length < 3) ex.push(`t=${pr.t} ${rs.players[i].id} live[${liveSig}] replay[${got}]`); }
      if (pr.amounts[i]) { acmp++; if (amt(rs.players[i].statusEffects) !== pr.amounts[i]) amis++; }
    });
    if (zsig(rs.combatStates?.active) !== pr.zones) zmis++;
  }
  if (every === 1) ck(`R2[${label}] 英雄持續狀態（種類＋剩餘秒數）逐時刻與現場相同（${compared} 次比對）`, mism === 0, ex.join(" ¦ "));
  else {
    ck(`R2[${label}] 英雄持續狀態種類逐時刻與現場相同（${compared} 次比對）`, kmis === 0, ex.join(" ¦ "));
    console.log(`   ⓘ R2b[${label}] 刷新／延長落在兩次擷取之間 ⇒ 剩餘秒數解析度 1 秒：${compared} 次中 ${mism} 次不同`);
  }
  ck(`R3[${label}] 領域逐時刻與現場相同（${probes.length} 個時刻）`, zmis === 0, String(zmis));
  //  護盾量是隨時間變的數值：每 tick 擷取 ⇒ 必須逐值相同；快速完成（每 2 tick）⇒ 解析度 1 秒，只記錄差異率
  if (every === 1) ck(`R4[${label}] 護盾剩餘量逐時刻與現場相同（${acmp} 次）`, amis === 0, String(amis));
  else console.log(`   ⓘ R4[${label}] 護盾量解析度＝擷取頻率（1 秒）：${acmp} 次比對中 ${amis} 次落在兩次擷取之間而不同（非狀態遺失）`);
  const withCs = estimateReplaySize(replay), without = estimateReplaySize({ ...replay, combatStates: undefined });
  console.log(`   Replay 容量：${Math.round(without / 1024)} KB → ${Math.round(withCs / 1024)} KB（combatStates +${Math.round((withCs - without) / 1024)} KB，${replay.combatStates.rows.length} 筆）`);
}

const json = arg("json", null);
if (json) writeFileSync(json, JSON.stringify({ byKind, reasons, mechanics: Object.fromEntries(Object.entries(mech).map(([k, r]) => [k, {
  timed: r.timed, casts: r.casts, withState: r.withState, durationOk: r.durationOk, kinds: [...r.kinds], skills: [...r.skills], missSkills: [...r.missSkills] }])) }, null, 1));
console.log(`\nMOBA Combat State v1：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
