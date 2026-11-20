#!/usr/bin/env node
// ============================================================================
//  tools/check_jungle_camp_v22.mjs — jungleCamp 層＋invasion 層（moba-sim.v22 候選）：Buff 營脫戰反覆回滿 Bug 的修正、野區入侵 v2、與版本隔離（Owner 2026-11-11）
//
//  根因（review/tactic-book-3a/v21_OwnerPreview_UI與對戰品質檢查.md §3）：打野站在營地成員座標上 ⇒ 站到成員外側 ⇒ 離營地出生點 > campLeashRange（7.5）
//  ⇒ 營地回營並回滿血（最後一隻小怪 8→84 無限循環）。修法：jungleCamp "v2" 站在成員朝出生點的內側。
//
//   J  版本隔離：v20／v21 規則集沒有 jungleCamp 鍵；v22＝v21 逐欄相同＋{id、simVersion、jungleCamp、一個旗標}；旗標預設全關；解析不串線
//   G  站位幾何（純函式）：legacy 回傳成員座標；v2 回傳的點離成員 ≤ 傷害距離 3.5、比成員更靠近出生點、離出生點 < 成員離出生點
//   B  行為（走正式開局入口 prepareLiveMatch，公開的小 Seed）：
//        B0 負向對照：legacy（career.v21）確實會重現 Bug（Buff 營回滿次數大）——否則這個 gate 量不到東西
//        B1 v22：Buff 營在時限內清完、回滿次數低、藍紅對稱
//        B2 v22：營地清完後會重生；打野會接續農其他營地、也會 Gank
//   N  v20／v21 的引擎旗標是 false（沒有任何路徑讓舊規則集走到新站位）
//   I  野區入侵 v2：失敗條件的單元測試（血量、被圍、沒目標、搶到、輸掉競速、陣亡、結束後不再入侵）＋行為（走到敵方野怪旁、打到、搶到、紅藍對稱）＋ legacy 負向對照
//  ⚠ 不重錄任何 Golden；v20／v21 的逐位元不變由 check_match_setup_3a（v20 黃金 39 案）與 check_match_golden_v21a 負責。
// ============================================================================
import { careerContext } from "./lib/careerLiveInputs.mjs";
import { MATCH_RULESETS, resolveRulesetForMode, jungleCampOf, invasionOf, validateRuleset } from "../src/platform/contracts/matchRuleset.js";
import { FEATURE_FLAGS } from "../src/featureFlags.js";

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;

// ── J 版本隔離 ──────────────────────────────────────────────────────────
for (const id of ["career.v20", "challenge.v20", "balanceTool.v20", "career.v21", "balanceTool.v21", "challenge.v21"])
  ck(`J1 ${id} 沒有 jungleCamp／invasion 鍵（setup 雜湊與比賽結果逐位元不變）`, !("jungleCamp" in MATCH_RULESETS[id].layers) && !("invasion" in MATCH_RULESETS[id].layers) && jungleCampOf(MATCH_RULESETS[id]) === "legacy" && invasionOf(MATCH_RULESETS[id]) === "legacy");
for (const [v21, v22] of [["career.v21", "career.v22"], ["balanceTool.v21", "balanceTool.v22"]]) {
  const a = MATCH_RULESETS[v21], b = MATCH_RULESETS[v22];
  const { jungleCamp, invasion, ...restLayers } = b.layers;
  ck(`J2 ${v22}＝${v21} 逐欄相同，只多 jungleCamp／invasion "v2"、新的 id 與 simVersion v22${v22 === "career.v22" ? "、一個旗標" : ""}`,
    jungleCamp === "v2" && invasion === "v2" && J(restLayers) === J(a.layers) && b.kind === a.kind && b.simVersion === "moba-sim.v22" && a.simVersion === "moba-sim.v21" && b.rulesetId === v22
    && J(b.releaseRequirements.slice(0, a.releaseRequirements.length)) === J(a.releaseRequirements)
    && b.releaseRequirements.length === a.releaseRequirements.length + (v22 === "career.v22" ? 1 : 0), J({ extra: b.releaseRequirements.slice(a.releaseRequirements.length) }));
  ck(`J3 ${v22} 通過 validateRuleset（正式規則集的旗標要求都列了）`, validateRuleset(b).ok, J(validateRuleset(b).errors));
}
ck("J4 mobaJungleV22 預設關閉；mobaTacticalDirectorV21、mobaChallengeV21 也還是關閉（不開任何正式旗標）",
  FEATURE_FLAGS.mobaJungleV22 === false && FEATURE_FLAGS.mobaTacticalDirectorV21 === false && FEATURE_FLAGS.mobaChallengeV21 === false);
const base = { heroSkillsV1: true, heroBattleTalentsV1: true, itemsV1: true };
const idOf = (flags, mode = "career") => resolveRulesetForMode({ mode, flags: { ...base, ...flags } }).rulesetId;
ck("J5 旗標解析：只開導演→career.v21；導演＋jungle→career.v22；只開 jungle→career.v20（jungle 單獨沒有作用）；都關→career.v20",
  idOf({ mobaTacticalDirectorV21: true }) === "career.v21" && idOf({ mobaTacticalDirectorV21: true, mobaJungleV22: true }) === "career.v22"
  && idOf({ mobaJungleV22: true }) === "career.v20" && idOf({}) === "career.v20");
ck("J6 Challenge 不受影響：不論 jungle 旗標，challenge 解析結果與沒有這個旗標時相同",
  ["career", "challenge"].slice(1).every(() => idOf({ mobaTacticalDirectorV21: true, mobaChallengeV21: true, mobaJungleV22: true }, "challenge") === "challenge.v21"
    && idOf({ mobaJungleV22: true }, "challenge") === "challenge.v20" && idOf({ mobaTacticalDirectorV21: true, mobaJungleV22: true }, "challenge") === "challenge.v20"));
const bad = { ...MATCH_RULESETS["career.v22"], layers: { ...MATCH_RULESETS["career.v22"].layers, jungleCamp: "v9" } };
ck("J7 未知的 jungleCamp／invasion 值被 validateRuleset 拒絕（負向對照）", !validateRuleset(bad).ok && validateRuleset(bad).errors.includes("jungleCamp")
  && validateRuleset({ ...bad, layers: { ...bad.layers, jungleCamp: "v2", invasion: "v9" } }).errors.includes("invasion"));
const noFlag = { ...MATCH_RULESETS["career.v22"], releaseRequirements: MATCH_RULESETS["career.v21"].releaseRequirements };
ck("J8 正式規則集少列 mobaJungleV22 ⇒ validateRuleset 拒絕（RS-1；兩個層各自被擋；負向對照）", !validateRuleset(noFlag).ok
  && validateRuleset(noFlag).errors.some((e) => e.startsWith("jungleCamp v2 requires")) && validateRuleset(noFlag).errors.some((e) => e.startsWith("invasion v2 requires")));

// ── 引擎與開局入口 ──────────────────────────────────────────────────────
const C = await careerContext();
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
ck("J9 引擎宣告 SUPPORTS_JUNGLE_CAMP 與 SUPPORTS_INVASION（組裝器的能力檢查依據）", LogicEngine.SUPPORTS_JUNGLE_CAMP === true && LogicEngine.SUPPORTS_INVASION === true);

const SEEDS = [11, 13, 17, 19, 23, 29];
const HORIZON = 200, DT = 0.5;
const flagsOf = (id) => ({ ...C.G.featureFlags, ...(id === "career.v21" ? { mobaTacticalDirectorV21: true } : id === "career.v22" ? { mobaTacticalDirectorV21: true, mobaJungleV22: true } : {}) });
//  tpl：藍方戰術書的模板。noInvade：把雙方的入侵都關掉（開局擲骰已經在 configureMatch 做完，這裡把窗清成 0）——
//  只驗 Buff 營修法（B 系列）時用，不讓「藍方 std 擲中 10% 入侵、真的去搶紅 Buff」污染清野時間。
function build(id, seed, tpl = "std", noInvade = false) {
  const flags = flagsOf(id);
  const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== id) throw new Error(`flags resolved ${ruleset.rulesetId}, wanted ${id}`);
  const plan = C.createTacticPlan({ templateId: tpl, choices: {} }).plan;
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length];
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `jc22-${seed}`, mode: "moba", tacticPlanBinding: C.bindTacticPlanToCurrentVersions(plan) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players: C.G.inputs.players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`prepareLiveMatch rejected ${id} ${seed}: ${J(out.errors).slice(0, 200)}`);
  if (noInvade) { out.engine._tac.blue.invadeUntil = 0; out.engine._tac.red.invadeUntil = 0; }
  return out.engine;
}
// N：舊規則集的引擎旗標是 false；新規則集是 true
const e21 = build("career.v21", 11), e22 = build("career.v22", 11);
ck("N1 career.v21 的引擎 _jungleCampV2／_invasionV2 都是 false 且沒有 invObs；career.v22 兩個都是 true 且有 invObs（旗標只經規則集層進引擎）",
  e21._jungleCampV2 === false && e21._invasionV2 === false && e21.invObs === undefined && e22._jungleCampV2 === true && e22._invasionV2 === true && !!e22.invObs);

// ── G 站位幾何（純函式，用真的營地）──────────────────────────────────────
{
  const camp = e22.neutrals.camps.find((c) => c.id === "camp_blue_buff");
  for (const m of camp.members) { m.alive = true; m.hp = m.maxHp; }
  const far = { pos: { x: camp.homePos.x + 40, y: camp.homePos.y - 40 } };   // 從外側很遠的地方來
  let okV2 = true, okLegacy = true, worst = 0;
  for (const m of camp.members) {
    // 讓 m 是離英雄最近的那一隻：其餘成員標死
    const saved = camp.members.map((x) => [x, x.alive, x.hp]);
    for (const x of camp.members) { x.alive = x === m; x.hp = x === m ? x.maxHp : 0; }
    e22._jungleCampV2 = true; const v2 = e22._campStandTarget(far, camp);
    e22._jungleCampV2 = false; const leg = e22._campStandTarget(far, camp);
    e22._jungleCampV2 = true;
    for (const [x, a, h] of saved) { x.alive = a; x.hp = h; }
    const dM = Math.hypot(v2.x - m.pos.x, v2.y - m.pos.y), dHomeV2 = Math.hypot(v2.x - camp.homePos.x, v2.y - camp.homePos.y), dHomeM = Math.hypot(m.pos.x - camp.homePos.x, m.pos.y - camp.homePos.y);
    worst = Math.max(worst, dHomeV2);
    if (!(dM <= 3.5 && dM <= 2.0 + 1e-9 && (dHomeM < 2.0 || dHomeV2 < dHomeM) && dHomeV2 < 7.5)) okV2 = false;
    if (!(leg.x === m.pos.x && leg.y === m.pos.y)) okLegacy = false;
  }
  ck("G1 v2 站位：離成員 ≤ 2.0（在傷害距離 3.5 內）、比成員更靠近出生點、離出生點 < leash 7.5", okV2, `最遠離出生點 ${worst.toFixed(2)}`);
  ck("G2 legacy 站位：回傳的就是成員座標（舊行為逐字不變）", okLegacy);
}

// ── B 行為 ──────────────────────────────────────────────────────────────
function run(id, seed) {
  const e = build(id, seed, "std", true);
  const camps = e.neutrals.camps;
  const S = Object.fromEntries(camps.map((c) => [c.id, { clearAt: null, resets: 0, respawnedAt: null, prevHp: c.hp, prevAlive: c.members.map((m) => m.alive), was: c.alive }]));
  while (e.t < HORIZON && !e.over) {
    e.tick(DT);
    for (const c of camps) {
      const s = S[c.id], now = c.members.map((m) => m.alive);
      const revived = now.some((a, i) => a && !s.prevAlive[i]);
      if (c.alive && s.was && !revived && c.hp > s.prevHp + 0.5) s.resets++;
      if (s.was && !c.alive && s.clearAt === null) s.clearAt = e.t;
      if (!s.was && c.alive && s.clearAt !== null && s.respawnedAt === null) s.respawnedAt = e.t;
      s.prevHp = c.hp; s.prevAlive = now; s.was = c.alive;
    }
  }
  const ex = e.exec?.blue ?? {};
  return { S, ganks: (ex.topGanks ?? 0) + (ex.midGanks ?? 0) + (ex.botGanks ?? 0) };
}
const legacy = SEEDS.map((s) => run("career.v21", s)), v22 = SEEDS.map((s) => run("career.v22", s));
const sum = (R, c, k) => R.reduce((a, r) => a + r.S[c][k], 0);
const med = (xs) => { const a = xs.filter((x) => x !== null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
const legacyResets = sum(legacy, "camp_blue_buff", "resets") + sum(legacy, "camp_red_buff", "resets");
ck("B0 負向對照：legacy（career.v21）確實重現 Bug：6 場兩座 Buff 營的回滿次數合計 ≥ 60（v22 的對應數字見 B1）", legacyResets >= 60, `legacy ${legacyResets}`);
for (const c of ["camp_blue_buff", "camp_red_buff"]) {
  const clr = v22.map((r) => r.S[c].clearAt), rs = v22.map((r) => r.S[c].resets);
  ck(`B1 v22 ${c}：6 場都在 75 秒內清完、單場回滿 ≤ 5 次`, clr.every((x) => x !== null && x <= 75) && Math.max(...rs) <= 5, `clear ${J(clr)} resets ${J(rs)}`);
}
const mb = med(v22.map((r) => r.S.camp_blue_buff.clearAt)), mr = med(v22.map((r) => r.S.camp_red_buff.clearAt));
ck("B1 v22 藍紅對稱：兩座 Buff 營清完時間的中位數差 ≤ 6 秒（legacy 差約 56 秒）", mb !== null && mr !== null && Math.abs(mb - mr) <= 6, `藍 ${mb} 紅 ${mr}`);
const v22Resets = sum(v22, "camp_blue_buff", "resets") + sum(v22, "camp_red_buff", "resets");
ck("B1 v22 回滿總次數 ≤ legacy 的 1/5", v22Resets * 5 <= legacyResets, `v22 ${v22Resets} legacy ${legacyResets}`);
ck("B2 v22 營地清完後會重生（200 秒內，Buff 營重生 90 秒 ⇒ 6 場藍方 Buff 營都再次出現）", v22.every((r) => r.S.camp_blue_buff.respawnedAt !== null), J(v22.map((r) => r.S.camp_blue_buff.respawnedAt)));
ck("B2 v22 打野接續農野：6 場裡藍方另外兩座營地都在 180 秒內清完", v22.every((r) => ["camp_blue_a", "camp_blue_b"].every((c) => r.S[c].clearAt !== null && r.S[c].clearAt <= 180)), J(v22.map((r) => [r.S.camp_blue_a.clearAt, r.S.camp_blue_b.clearAt])));
//  Gank：早期（200 秒）兩個版本都很少抓人（實測 10 場合計 legacy 3、v22 1），所以改看 600 秒，並與 legacy 對比——防的是「Gank 完全消失」這種退步，
//  不要求逐場相同（v22 的打野較早清完野，節奏本來就會不同）。
function gankRun(id, seed) {
  const e = build(id, seed, "std", true);
  while (e.t < 600 && !e.over) e.tick(DT);
  const x = e.exec?.blue ?? {};
  return (x.topGanks ?? 0) + (x.midGanks ?? 0) + (x.botGanks ?? 0);
}
const gl = SEEDS.map((s) => gankRun("career.v21", s)), g22 = SEEDS.map((s) => gankRun("career.v22", s));
const total = (a) => a.reduce((p, q) => p + q, 0);
ck("B2 v22 打野仍會 Gank：600 秒內抓人次數合計 ≥ legacy 的 70%，且至少 5/6 場有藍方抓人（legacy 作對照）", total(g22) >= 0.7 * total(gl) && g22.filter((x) => x > 0).length >= 5, `v22 ${J(g22)}（合計 ${total(g22)}）legacy ${J(gl)}（合計 ${total(gl)}）`);

// ── I 野區入侵 v2 ────────────────────────────────────────────────────────
//  失敗條件的單元測試：在開局 40 秒的 career.v22 引擎上，直接呼叫 _invadeStepV2 並改前置條件（不跑模擬，決定性）。
function inv(setup) {
  const e = build("career.v22", 11, "v2.jungle_invasion");
  e.t = 40;
  const jg = e.players.find((p) => p.side === "blue" && p.role === "jungle");
  const S = e._tac.blue; S.invadeUntil = 90;
  const foeCamps = e.neutrals.camps.filter((c) => c.side === "red");
  for (const c of foeCamps) { c.alive = true; c.hp = c.maxHp; for (const m of c.members) { m.alive = true; m.hp = m.maxHp; } c.killerTeam = null; }
  for (const q of e.players) if (q.side === "red") { q.dead = false; q.pos = { x: 5, y: 5 }; }   // 敵方英雄都放到很遠
  setup({ e, jg, S, foeCamps });
  const r = e._invadeStepV2(jg, S, e.players.filter((p) => !p.dead));
  return { e, jg, r, reason: jg._invV2?.reason ?? null, ends: e.invObs.blue.ends };
}
const base0 = inv(() => {});
ck("I1 基本情況：目標是敵方 Buff 營、移動目標是營地成員內側的站位、入侵還沒結束", !!base0.r && base0.r.st === "入侵" && !base0.jg._invV2.done && base0.jg._invV2.camp === "camp_red_buff");
ck("I2 失敗條件 hp：血量 < 55% ⇒ 放棄（回傳 null，原因 hp）", (() => { const x = inv(({ jg }) => { jg.hp = jg.maxHp * 0.5; }); return x.r === null && x.reason === "hp" && x.ends.hp === 1; })());
ck("I3 失敗條件 outnumbered：身邊 14 內有 2 個敵方英雄 ⇒ 放棄", (() => { const x = inv(({ e, jg }) => { let n = 0; for (const q of e.players) if (q.side === "red" && n < 2) { q.pos = { x: jg.pos.x + 3, y: jg.pos.y }; n++; } }); return x.r === null && x.reason === "outnumbered"; })());
ck("I3b 只有 1 個敵方英雄在身邊 ⇒ 不放棄（單挑可以打，繼續入侵）", (() => { const x = inv(({ e, jg }) => { const q = e.players.find((p) => p.side === "red"); q.pos = { x: jg.pos.x + 3, y: jg.pos.y }; }); return x.r !== null && x.reason === null; })());
ck("I4 失敗條件 no_target：敵方營地都死了、最近一座 40 秒內不會出生 ⇒ 放棄", (() => { const x = inv(({ e, foeCamps }) => { for (const c of foeCamps) { c.alive = false; c.respawnAt = e.t + 200; } }); return x.r === null && x.reason === "no_target"; })());
ck("I4b 營地還沒出生但 40 秒內會出生 ⇒ 不放棄，往入口走去等（開局第 0 秒就是這個情況）", (() => { const x = inv(({ e, foeCamps }) => { for (const c of foeCamps) { c.alive = false; c.respawnAt = e.t + 20; } }); return x.r !== null && x.reason === null; })());
ck("I5 搶到：目標營被我方清掉 ⇒ 結束（stolen）並記為搶到；被對方清掉 ⇒ lost_race", (() => {
  const mk = (killer) => inv(({ jg, foeCamps }) => { jg._invV2 = { done: false, camp: "camp_red_buff", dmg0: 0, dmgMax: 0, arrivedAt: null, contact: 0, lastT: 39 }; const c = foeCamps.find((x) => x.id === "camp_red_buff"); c.alive = false; c.killerTeam = killer; });
  const a = mk("blue"), b = mk("red");
  return a.reason === "stolen" && a.e.invObs.blue.steals === 1 && b.reason === "lost_race" && b.e.invObs.blue.steals === 0; })());
ck("I6 入侵者陣亡 ⇒ 記為 killed（擊殺處理的呼叫點：_invadeEndV2(foe, 'killed')）", (() => { const x = inv(() => {}); const before = x.jg._invV2.done; x.e._invadeEndV2(x.jg, "killed"); return before === false && x.jg._invV2.reason === "killed" && x.e.invObs.blue.ends.killed === 1; })());
ck("I7 結束後不再入侵：同一個英雄再被呼叫只回傳 null，原因不會被覆蓋、次數不重複記", (() => { const x = inv(({ jg }) => { jg.hp = jg.maxHp * 0.4; }); const r2 = x.e._invadeStepV2(x.jg, x.e._tac.blue, x.e.players); return x.reason === "hp" && r2 === null && x.jg._invV2.reason === "hp" && x.e.invObs.blue.ends.hp === 1; })());

//  行為：生涯路徑（藍方入侵模板，10 個公開小 Seed，150 秒）；legacy 當負向對照
const SEEDS_I = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29];
function runInv(id, tpl, seed) {
  const e = build(id, seed, tpl);
  const foeCamps = e.neutrals.camps.filter((c) => c.side === "red");
  let reached = false, dmgAny = false;
  const jg = e.players.find((p) => p.side === "blue" && p.role === "jungle");
  while (e.t < 150 && !e.over) {
    e.tick(DT);
    if (!jg.dead) for (const c of foeCamps) for (const m of c.members) if (m.alive && Math.hypot(jg.pos.x - m.pos.x, jg.pos.y - m.pos.y) <= 3.5) reached = true;
    //  整場任何一刻都記：被搶的營地重生時會清掉 dmgBy／killerTeam，只在結尾讀會讀到 0。
    if (foeCamps.some((c) => c.dmgBy.blue > 0 || c.killerTeam === "blue")) dmgAny = true;
  }
  return { trig: e.exec.blue.invadeAttempts > 0, reached, dmgAny, O: e.invObs?.blue ?? null, hasObs: e.invObs !== undefined };
}
const invL = SEEDS_I.map((s) => runInv("career.v21", "v2.jungle_invasion", s)), inv2 = SEEDS_I.map((s) => runInv("career.v22", "v2.jungle_invasion", s));
const trig2 = inv2.filter((r) => r.trig);
ck("I8 負向對照：legacy（career.v21）沒有入侵觀測、擲中的入侵幾乎不會打到敵方野怪（≤ 20%）", invL.every((r) => !r.hasObs) && invL.filter((r) => r.trig && r.dmgAny).length <= Math.ceil(0.2 * invL.filter((r) => r.trig).length), `legacy 擲中 ${invL.filter((r) => r.trig).length} 場，打到野怪 ${invL.filter((r) => r.trig && r.dmgAny).length} 場`);
ck("I9 v22 擲中入侵的場次裡 ≥ 80% 走到敵方野怪旁並打到它", trig2.length >= 3 && trig2.filter((r) => r.reached && r.dmgAny).length >= 0.8 * trig2.length, `擲中 ${trig2.length} 場，走到並打到 ${trig2.filter((r) => r.reached && r.dmgAny).length}`);
ck("I10 v22 搶得到、也會失敗：至少 1 場搶到敵方營地，而且失敗條件（hp／outnumbered／lost_race／killed／retreat）至少出現過 1 次", (() => {
  const ends = {}; for (const r of trig2) for (const [k, v] of Object.entries(r.O?.ends ?? {})) ends[k] = (ends[k] ?? 0) + v;
  const fail = ["hp", "outnumbered", "lost_race", "killed", "retreat"].reduce((a, k) => a + (ends[k] ?? 0), 0);
  return (ends.stolen ?? 0) >= 1 && fail >= 1; })(), J(trig2.map((r) => r.O?.ends)));
ck("I11 v22 入侵不是必成：擲中入侵的場次裡，搶到的 ≤ 90%（防止「入侵＝必搶到」）", trig2.filter((r) => (r.O?.steals ?? 0) > 0).length <= 0.9 * trig2.length, `搶到 ${trig2.filter((r) => (r.O?.steals ?? 0) > 0).length}/${trig2.length}`);
//  對稱：工具路徑，紅藍雙方都用入侵模板（balanceTool.v22）
const { configure, modules } = await import("./balance/moba_items_balance_runner.mjs");
const MM = await modules();
const symRuns = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33].map((seed) => {
  const b = { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: "v2.jungle_invasion", choices: {} }).plan) };
  const { e } = configure(seed, "standard", MM, 1, null, { blue: b, red: b }, "balanceTool.v22");
  while (e.t < 150 && !e.over) e.tick(DT);
  return e.invObs;
});
const stealRate = (s) => { const o = symRuns.map((x) => x[s]).filter((x) => x.starts > 0); return o.length ? o.filter((x) => x.steals > 0).length / o.length : 0; };
const nStart = (s) => symRuns.filter((x) => x[s].starts > 0).length;
ck("I12 紅藍對稱（雙方都用入侵模板）：兩邊都至少有 4 場入侵、搶到率的差 ≤ 0.30", nStart("blue") >= 4 && nStart("red") >= 4 && Math.abs(stealRate("blue") - stealRate("red")) <= 0.30, `藍 ${nStart("blue")} 場搶到率 ${stealRate("blue").toFixed(2)}；紅 ${nStart("red")} 場搶到率 ${stealRate("red").toFixed(2)}`);

const failed = results.filter((r) => !r.ok);
console.log(`\njungleCamp v22 Gate：${results.length - failed.length}/${results.length} ${failed.length ? "FAIL" : "PASS"}`);
process.exit(failed.length ? 1 : 0);
