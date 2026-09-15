// ============================================================================
//  tools/moba_items_legacy_fingerprint.mjs — itemsV1 OFF 的 legacy 模擬指紋（M2）
//
//  用途：證明「沒有呼叫 configureItems ⇒ 模擬逐位元不變」。
//  做法：對同一組 seed，在兩棵程式碼樹（M1 基準 vs 目前）各跑一次，比對輸出 JSON。
//    · bare        只 new LogicEngine(seed)
//    · configured  照 useLocalServer.start 的順序：
//                  configurePlayers → configureHeroes → configureArchetypes → configureSpells → configureMatch
//  每一場記錄：取樣 snapshot 串流雜湊、終局 snapshot 雜湊、rng／rng2／rng3 呼叫次數、
//  snapshot 頂層與英雄層的 key 集合、比分／金錢／勝方。
//
//  用法：node tools/moba_items_legacy_fingerprint.mjs --root=<repo 根目錄> [--seeds=7,42,99] [--ticks=3600]
//        [--items=off|null]   null ⇒ 在 configure 之後多呼叫一次 configureItems(null)（只有 M2 以後的樹有）
//  輸出：stdout 一行 JSON。
//  ⚠ 只讀：不寫檔、不改引擎。
// ============================================================================
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const ROOT = path.resolve(arg("root", process.cwd()));
const SEEDS = arg("seeds", "7,42,99").split(",").map(Number);
const MAX_TICKS = Number(arg("ticks", 3600));
const ITEMS = arg("items", "off");
const SAMPLE_EVERY = 40;

const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { LogicEngine } = await load("src/LogicEngine.js");
const { CHAMPIONS_100, heroById } = await load("src/data/heroDatabase.js");
const { toEnginePlayerMods } = await load("src/battle/moba/mobaPlayerStats.js");
const { STAT_DEF } = await load("src/data/playerModel.js");
const { toEngineHeroMods } = await load("src/battle/moba/mobaHeroProfile.js");
const { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } = await load("src/data/heroCombatArchetypes.js");
const { buildLoadout, toEngineSpells } = await load("src/battle/moba/mobaHeroLoadout.js");
const { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION } = await load("src/platform/contracts/MobaTacticConfig.js");

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const COMP = { blue: ["坦克", "刺客", "法師", "射手", "輔助"], red: ["戰士", "戰士", "法師", "射手", "坦克"] };

/** 決定性名單：每個席位取該定位的第 k 隻英雄（兩側錯開，不重複）。 */
function fixedRoster() {
  const used = new Set();
  const roster = {};
  for (const [side, ids] of [["blue", BLUE], ["red", RED]]) {
    ids.forEach((id, i) => {
      const hero = CHAMPIONS_100.find((h) => h.arch === COMP[side][i] && !used.has(h.id));
      used.add(hero.id);
      roster[id] = { heroId: hero.id };
    });
  }
  const loadout = buildLoadout(roster, heroById);
  for (const [seat, entry] of Object.entries(loadout)) roster[seat].spells = entry.spells;
  return roster;
}

/** 決定性能力：每位選手 16 項能力在 55–84 之間錯開（不是中性 70 ⇒ 真的會擲 rng3）。 */
const statsFor = (seatIdx) => Object.fromEntries(STAT_DEF.map((s, k) => [s.key, 55 + ((seatIdx * 7 + k * 5) % 30)]));

function countRng(e, key, counts) {
  if (typeof e[key] !== "function") return;
  const f = e[key];
  counts[key] = 0;
  e[key] = () => { counts[key]++; return f(); };
}

function runOne(seed, mode) {
  const e = new LogicEngine(seed);
  const rng = {};
  countRng(e, "rng", rng);
  if (mode === "configured") {
    e.configurePlayers(toEnginePlayerMods({
      blue: BLUE.map((id, i) => ({ id, stats: statsFor(i) })),
      red: RED.map((id, i) => ({ id, stats: statsFor(i + 5) })),
    }));
    countRng(e, "rng3", rng);
    const roster = fixedRoster();
    const heroMods = toEngineHeroMods(roster, heroById);
    if (heroMods) e.configureHeroes(heroMods);
    const archMods = toEngineArchetypes(roster);
    const blue = {}, red = {};
    for (const [pid, mod] of Object.entries(archMods)) (pid[0] === "r" ? red : blue)[pid] = mod;
    e.configureArchetypes({ blue, red, meta: { version: COMBAT_ARCHETYPE_CONTRACT_VERSION, seats: Object.keys(archMods).length } });
    const spellMods = toEngineSpells(roster);
    if (spellMods) e.configureSpells(spellMods);
    e.configureMatch({
      blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC),
      meta: { tacticId: STANDARD_OPP_TACTIC.tacticId, tacticName: STANDARD_OPP_TACTIC.name, version: MOBA_TACTIC_VERSION, opponentTacticId: STANDARD_OPP_TACTIC.tacticId },
    });
    countRng(e, "rng2", rng);
  }
  if (ITEMS === "null") {
    if (typeof e.configureItems !== "function") throw new Error("--items=null 需要 M2 以後的引擎");
    e.configureItems(null);
  }
  const stream = crypto.createHash("sha1");
  let ticks = 0;
  for (; ticks < MAX_TICKS && !e.over; ticks++) {
    e.tick(0.5);
    if (ticks % SAMPLE_EVERY === 0) stream.update(JSON.stringify(e.snapshot()));
  }
  const snap = e.snapshot();
  const finalJson = JSON.stringify(snap);
  return {
    seed, mode, ticks, over: e.over, winner: e.winner, t: e.t,
    bK: e.bK, rK: e.rK, bGold: e.bGold, rGold: e.rGold,
    kda: e.players.map((p) => `${p.id}:${p.k}/${p.d}/${p.a}:${Math.round(p.gold)}:${Math.round(p.dmg)}:${Math.round(p.heal)}:${p.mlv}`).join(" "),
    streamHash: stream.digest("hex").slice(0, 16),
    finalHash: sha(finalJson),
    rngCalls: rng,
    snapshotKeys: Object.keys(snap).join(","),
    playerKeys: Object.keys(snap.players[0]).join(","),
  };
}

const t0 = Date.now();
const runs = [];
for (const seed of SEEDS) for (const mode of ["bare", "configured"]) runs.push(runOne(seed, mode));
console.log(JSON.stringify({ root: path.basename(ROOT), items: ITEMS, maxTicks: MAX_TICKS, elapsedMs: Date.now() - t0, runs }));
