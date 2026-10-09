#!/usr/bin/env node
// ============================================================================
//  tools/check_replay_team_buff_scrub.mjs — Replay 拖曳時間軸：團隊增益（龍層／龍魂／巴龍）不得提早出現
//
//   在每個團隊增益變化時刻（拿龍、龍魂、巴龍取得與到期）前後 ±3 秒，以 0.25 秒步距往前、往後拖曳 seek：
//     S1 每次 seek 的龍層／龍魂／巴龍有無 ＝ 現場「最後一個 ≤ t 的 tick」
//     S2 往前拖曳時龍層數單調不減（不會「先出現、再消失」）
//   正式預設（objectiveStakesV1 OFF）與機制開啟（ON，才有龍魂／巴龍英雄戰力）各跑一次。
//
//  背景：v16 的 teamBuffsFromCombatStates 在「此刻沒有任何 CombatState 作用」時回 null，
//  呼叫端退回 2.5 秒一格、可能是下一格的 frame.tb ⇒ 拿龍前一刻 seek 會提早顯示龍層
//  （v19 fde17c7 實測 40 場 344 個變化時刻：56 次不一致、6 次非單調）。2026-10-09 修正。
//
//  跑法：node tools/check_replay_team_buff_scrub.mjs（約 2–4 分鐘）
// ============================================================================
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { LogicEngine } = await imp("src/LogicEngine.js");
const { CHAMPIONS_100, heroById } = await imp("src/data/heroDatabase.js");
const { toEngineHeroSkills } = await imp("src/battle/moba/skills/heroSkillGameplay.js");
const { toEngineHeroMods } = await imp("src/battle/moba/mobaHeroProfile.js");
const { toEngineSpells, buildLoadout } = await imp("src/battle/moba/mobaHeroLoadout.js");
const { toEngineArchetypes } = await imp("src/data/heroCombatArchetypes.js");
const { toEngineTactic, STANDARD_OPP_TACTIC } = await imp("src/platform/contracts/MobaTacticConfig.js");
const { matchItemsConfig } = await imp("src/battle/moba/items/buildStrategyPrep.js");
const { beginReplayCapture, captureReplayFrame, finalizeReplay } = await imp("src/battle/moba/replay/replayBuffer.js");
const { createReplaySource } = await imp("src/battle/moba/replay/replayPresentationSource.js");

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const t0 = Date.now();
let pass = 0, fail = 0;
const ck = (label, ok, note = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${label}${note ? `　${note}` : ""}`); };

//  與 check_moba_objective_stakes_v16 相同的建場方式。
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
const makeEngine = (seed, stakes) => {
  const roster = rosterFor(seed);
  const e = new LogicEngine(seed, null);
  if (stakes) e.rules = { ...e.rules, objectiveStakesV1: true };
  const hm = toEngineHeroMods(roster, heroById); if (hm) e.configureHeroes(hm);
  e.configureHeroSkills(toEngineHeroSkills(roster, null));
  const am = toEngineArchetypes(roster);
  if (am) { const blue = {}, red = {}; for (const [pid, v] of Object.entries(am)) (pid[0] === "r" ? red : blue)[pid] = v;
    e.configureArchetypes({ blue, red, meta: { version: "scrub", seats: 10 } }); }
  const sp = toEngineSpells(roster); if (sp) e.configureSpells(sp);
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: { tacticId: "std" } });
  const ic = matchItemsConfig({ roster, heroLookup: heroById, buildStrategy: "standard" }); if (ic) e.configureItems(ic);
  return { e, roster };
};

const key = (tb) => ["blue", "red"].map((s) => [tb?.[s]?.dragonStacks ?? 0, !!tb?.[s]?.soul, (tb?.[s]?.baronRemaining ?? 0) > 0]);
const res = { games: 0, events: 0, seeks: 0, mis: 0, nonMono: 0, ex: [] };
for (const stakes of [false, true]) for (const seed of SEEDS) {
  const { e, roster } = makeEngine(seed, stakes);
  beginReplayCapture({ seed, config: {}, roster });
  const live = [], changes = []; let prev = null;
  for (let tick = 0; tick < 7200 && !e.over; tick++) {
    e.tick(0.5);
    const snap = e.snapshot();
    captureReplayFrame(snap);
    const k = JSON.stringify(key(snap.teamBuffs));
    live.push({ t: snap.ts, tb: snap.teamBuffs });
    if (prev !== null && k !== prev) changes.push(snap.ts);
    prev = k;
  }
  res.games++;
  const src = createReplaySource(finalizeReplay({ matchId: `scrub-${seed}`, events: [] }));
  const liveAt = (t) => { let r = null; for (const x of live) { if (x.t <= t + 1e-6) r = x; else break; } return r; };
  for (const c of changes) {
    res.events++;
    const ts = [];
    for (let d = -3; d <= 3 + 1e-9; d += 0.25) ts.push(+(c + d).toFixed(2));
    for (const order of [ts, [...ts].reverse()]) {
      const seen = [];
      for (const t of order) {
        const L = liveAt(t);
        if (!L) continue;
        src.seek(t);
        const lk = key(L.tb), rk = key(src.getState().snapshot.teamBuffs);
        res.seeks++;
        if (JSON.stringify(lk) !== JSON.stringify(rk)) {
          res.mis++;
          if (res.ex.length < 3) res.ex.push(`seed ${seed}${stakes ? "+stakes" : ""} @${c} seek(${t}) live${JSON.stringify(lk)} replay${JSON.stringify(rk)}`);
        }
        seen.push([rk[0][0], rk[1][0]]);
      }
      if (order === ts) for (let i = 1; i < seen.length; i++) {
        if (seen[i][0] < seen[i - 1][0] || seen[i][1] < seen[i - 1][1]) { res.nonMono++; break; }
      }
    }
  }
}

ck(`S0 有涵蓋到團隊增益變化（${res.games} 場、${res.events} 個變化時刻）`, res.events >= res.games);
ck(`S1 拖曳 seek 的龍層／龍魂／巴龍＝現場（${res.seeks} 次）`, res.mis === 0, res.ex.join(" ¦ "));
ck("S2 往前拖曳龍層單調不減（不會先出現再消失）", res.nonMono === 0, String(res.nonMono));
console.log(`\nReplay team-buff scrub：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}　耗時 ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(fail ? 1 : 0);
