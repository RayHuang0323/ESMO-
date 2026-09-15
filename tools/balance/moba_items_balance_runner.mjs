#!/usr/bin/env node
// ============================================================================
//  tools/balance/moba_items_balance_runner.mjs — MOBA Item System M4a 平衡基線量測（只量測，不調數值）
//
//  用法：
//    node tools/balance/moba_items_balance_runner.mjs --seeds=200 --workers=8 --out=reports/moba-items-m4a
//    node tools/balance/moba_items_balance_runner.mjs --seeds=8 --configs=off,standard --out=<暫存目錄>
//
//  決定性：每場只由 (config, seed) 決定；worker 數量與完成順序不影響輸出（依 config、seed 排序後寫檔）。
//  對局設定：與 useLocalServer／check_moba_items_m2 configured() 同序
//    configureHeroes → configureArchetypes → configureSpells → configureMatch(雙方 STANDARD) → [configureItems]
//  名單：每個 seed 以獨立 LCG（不碰引擎 rng）挑一組五定位英雄，**藍紅雙方同陣容（鏡像）**。
//  設定：
//    off       itemsV1 關閉
//    standard  itemsV1 開啟，雙方 standard（鏡像 ⇒ 量側邊偏差）
//    early／scaling／counter／survival
//              itemsV1 開啟，偶數 seed 藍方用該策略、奇數 seed 紅方用該策略，另一方 standard
//              ⇒ 策略對標準的勝率不受側邊偏差影響
//  上限 3600 模擬秒（60 分），觀測長局不被截斷；未結束的場次標記 over=0。
//  承傷為近似值：逐 tick 血量下降總和（死亡當 tick 算到 0；回血不扣除）。引擎未記錄承傷。
//  OFF 的 player.gold 是舊版的個人金錢欄位，與 itemsV1 的個人帳本不同語意 ⇒ 兩者的 gold/min 不可直接比較。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

export const RUNNER_VERSION = "moba-items.balance-runner.v1";
const ALL_CONFIGS = ["off", "standard", "early", "scaling", "counter", "survival"];
const DT = 0.5;
const CAP_S = 3600;
const SAMPLE_S = [600, 900, 1200, 1500, 1800];
const LANES = ["top", "mid", "bot"];
const ROLE_ARCH = {
  top: ["戰士", "坦克"],
  jungle: ["刺客", "戰士"],
  mid: ["法師"],
  adc: ["射手"],
  sup: ["輔助", "坦克"],
};
export const COUNTER_ITEMS = Object.freeze(["t3_thornmail", "t3_calmveil", "t2_scythe", "t3_finalstring", "t3_soulrend", "t3_psyward", "t3_rendspear", "t3_shieldbreaker"]);

// ─────────────────────────────────────────────────────────────────────────────
//  跑一場
// ─────────────────────────────────────────────────────────────────────────────
let MODS = null;
async function modules() {
  if (MODS) return MODS;
  const [LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData] = await Promise.all([
    load("src/LogicEngine.js"), load("src/data/heroDatabase.js"), load("src/battle/moba/mobaHeroProfile.js"),
    load("src/data/heroCombatArchetypes.js"), load("src/battle/moba/mobaHeroLoadout.js"), load("src/platform/contracts/MobaTacticConfig.js"),
    load("src/battle/moba/items/itemsEngineAdapter.js"), load("src/battle/moba/items/itemCatalog.js"), load("src/battle/moba/items/itemEconomy.js"),
    load("src/battle/moba/items/itemInventory.js"), load("src/gameData.js"),
  ]);
  MODS = { LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData };
  return MODS;
}

/** 與引擎無關的決定性亂數（名單挑選用）。 */
function lcg(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function mirroredRoster(seed, M) {
  const rnd = lcg(seed);
  const roles = M.gameData.ROLES;
  const roster = {};
  const used = new Set();
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const archs = ROLE_ARCH[role];
    const arch = archs[Math.floor(rnd() * archs.length)];
    const pool = M.heroes.CHAMPIONS_100.filter((h) => h.arch === arch && !used.has(h.id));
    const hero = pool[Math.floor(rnd() * pool.length)];
    used.add(hero.id);
    roster[`b${i + 1}`] = { heroId: hero.id };
    roster[`r${i + 1}`] = { heroId: hero.id };
  }
  for (const [seat, e] of Object.entries(M.loadout.buildLoadout(roster, M.heroes.heroById))) roster[seat].spells = e.spells;
  return roster;
}

export function configure(seed, config, M, incomeK = 1) {
  const roster = mirroredRoster(seed, M);
  const e = new M.LE.LogicEngine(seed);
  const heroMods = M.profile.toEngineHeroMods(roster, M.heroes.heroById);
  if (heroMods) e.configureHeroes(heroMods);
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(M.arche.toEngineArchetypes(roster))) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: null });
  e.configureSpells(M.loadout.toEngineSpells(roster));
  e.configureMatch({ blue: M.tactic.toEngineTactic(M.tactic.STANDARD_OPP_TACTIC), red: M.tactic.toEngineTactic(M.tactic.STANDARD_OPP_TACTIC), meta: null });
  let strategySide = null;
  if (config !== "off") {
    const strategies = {};
    if (config !== "standard") {
      strategySide = seed % 2 === 0 ? "blue" : "red";
      for (const pid of Object.keys(roster)) strategies[pid] = (pid[0] === "b") === (strategySide === "blue") ? config : "standard";
    }
    const itemsCfg = M.adapter.toEngineItems({ roster, heroLookup: M.heroes.heroById, strategies, defaultStrategy: "standard" });
    e.configureItems(itemsCfg);
    //  M4b 量測：倍率直接寫進裝備 runtime（不動 LogicEngine ⇒ moba-sim 指紋不變）。
    //  configureItems 當下只有出生購買（花開局金錢，不入帳）⇒ 第一個 tick 前設定等同從頭生效。
    if (incomeK !== 1) e.items.incomeK = incomeK;
  }
  return { e, roster, strategySide };
}

/** 各側塔況：路線塔（上中下 9 座）倒幾座、其餘非主堡塔（門牙塔）倒幾座、主堡血量。 */
const towerState = (e) => {
  const out = { blue: { lane: 0, guard: 0, laneTotal: 0, guardTotal: 0, nexusHp: 0 }, red: { lane: 0, guard: 0, laneTotal: 0, guardTotal: 0, nexusHp: 0 } };
  for (const t of Object.values(e.towers)) {
    const s = out[t.side];
    if (t.lane === "nexus") { s.nexusHp = Math.round(t.hp); continue; }
    if (LANES.includes(t.lane)) { s.laneTotal++; if (t.hp <= 0) s.lane++; } else { s.guardTotal++; if (t.hp <= 0) s.guard++; }
  }
  return out;
};
const towersDown = (e) => {
  const s = towerState(e);
  return { blue: s.blue.lane + s.blue.guard, red: s.red.lane + s.red.guard };
};

export async function runMatch(config, seed, incomeK = 1) {
  const M = await modules();
  const started = performance.now();
  const { e, roster, strategySide } = configure(seed, config, M, incomeK);
  const itemsOn = !!e.items;
  const getItem = M.catalog.getItem;
  const players = e.players;
  const P = Object.fromEntries(players.map((p) => [p.id, {
    id: p.id, side: p.side, role: p.role, heroId: roster[p.id]?.heroId ?? null,
    arch: M.heroes.heroById(roster[p.id]?.heroId)?.arch ?? null,
    strategy: itemsOn ? e.items.stateOf(p.id).strategy : null,
    taken: 0, t3Times: [], samples: {}, prevHp: p.hp, prevDead: p.dead,
  }]));
  const purchaseCount = {};
  const counterBought = {};
  let lastSeq = -1;
  let dragons = 0, barons = 0, prevDragon = e.dragon.alive, prevBaron = e.baron.alive;
  let violations = 0, conservationFails = 0;
  const samples = {};
  let lastTowerFallT = null;
  let prevTowers = towersDown(e);
  const laneTowersClearedT = { blue: null, red: null };
  let guardDamageAfterClear = { blue: 0, red: 0 };
  const sampleSet = new Set(SAMPLE_S);

  const sampleItems = (label) => {
    for (const p of players) {
      const entry = { k: p.k, d: p.d, a: p.a, gold: Math.round(p.gold), mlv: p.mlv ?? p.lv ?? 1, dmg: Math.round(p.dmg) };
      if (itemsOn) {
        const s = e.items.stateOf(p.id);
        const ids = s.inventory.slots.filter(Boolean);
        entry.completed = ids.filter((id) => getItem(id)?.tier === "T3").length;
        entry.full = s.inventory.slots.every(Boolean) ? 1 : 0;
        entry.unspent = Math.floor(s.ledger.unspentMilli / M.economy.MILLI);
        entry.earned = Math.floor(M.economy.totalEarnedMilli(s.ledger) / M.economy.MILLI);
        entry.earnedBy = Object.fromEntries(Object.entries(s.ledger.earnedMilli).map(([k, v]) => [k, Math.floor(v / M.economy.MILLI)]));
        if (!M.economy.checkConservation(s.ledger).ok) conservationFails++;
        if (!M.inventory.validateInventory(s.inventory).ok) violations++;
      }
      P[p.id].samples[label] = entry;
    }
    samples[label] = { t: e.t, kills: e.bK + e.rK, bK: e.bK, rK: e.rK, towers: towersDown(e), towerState: towerState(e), dragons, barons, bGold: Math.round(e.bGold ?? 0), rGold: Math.round(e.rGold ?? 0) };
  };

  const guardHp = (side) => Object.values(e.towers).filter((t) => t.side === side && t.lane !== "nexus" && !LANES.includes(t.lane)).reduce((s, t) => s + Math.max(0, t.hp), 0);
  let prevGuardHp = { blue: guardHp("blue"), red: guardHp("red") };

  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    e.tick(DT);
    const t = e.t;
    for (const p of players) {
      const st = P[p.id];
      if (!st.prevDead) {
        if (p.dead) st.taken += Math.max(0, st.prevHp);
        else if (p.hp < st.prevHp) st.taken += st.prevHp - p.hp;
      }
      st.prevHp = p.hp; st.prevDead = p.dead;
    }
    if (prevDragon && !e.dragon.alive) dragons++;
    if (prevBaron && !e.baron.alive) barons++;
    prevDragon = e.dragon.alive; prevBaron = e.baron.alive;
    if (itemsOn) {
      const list = e.items.purchases;
      for (let j = 0; j < list.length; j++) {
        const ev = list[j];
        if (ev.seq <= lastSeq) continue;
        lastSeq = ev.seq;
        if (ev.action === "dropStarter") continue;
        const it = getItem(ev.itemId);
        purchaseCount[ev.itemId] = (purchaseCount[ev.itemId] ?? 0) + 1;
        if (COUNTER_ITEMS.includes(ev.itemId)) counterBought[ev.itemId] = (counterBought[ev.itemId] ?? 0) + 1;
        if (it?.tier === "T3") P[ev.playerId].t3Times.push(ev.t);
      }
    }
    const td = towersDown(e);
    if (td.blue !== prevTowers.blue || td.red !== prevTowers.red) {
      lastTowerFallT = t;
      const ts = towerState(e);
      for (const side of ["blue", "red"]) if (laneTowersClearedT[side] === null && ts[side].lane >= ts[side].laneTotal) laneTowersClearedT[side] = t;
    }
    prevTowers = td;
    for (const side of ["blue", "red"]) {
      const hp = guardHp(side);
      if (laneTowersClearedT.blue !== null && laneTowersClearedT.red !== null && hp < prevGuardHp[side]) guardDamageAfterClear[side] += prevGuardHp[side] - hp;
      prevGuardHp[side] = hp;
    }
    if (sampleSet.has(t)) sampleItems(String(t));
  }
  sampleItems("end");

  const counterPlanned = {};
  const planned = {};
  if (itemsOn) {
    for (const p of players) {
      const s = e.items.stateOf(p.id);
      const pathIds = s.plan?.buildPath ?? [];
      for (const id of COUNTER_ITEMS) if (pathIds.includes(id)) counterPlanned[id] = (counterPlanned[id] ?? 0) + 1;
      planned[p.id] = pathIds.filter((id) => COUNTER_ITEMS.includes(id));
    }
  }
  const winner = e.winner ?? null;
  const bothLaneClearedT = laneTowersClearedT.blue !== null && laneTowersClearedT.red !== null ? Math.max(laneTowersClearedT.blue, laneTowersClearedT.red) : null;
  const players_out = players.map((p) => {
    const st = P[p.id];
    const minutes = Math.max(1 / 60, e.t / 60);
    return {
      id: p.id, side: p.side, role: p.role, arch: st.arch, heroId: st.heroId, strategy: st.strategy,
      won: winner ? (winner === p.side ? 1 : 0) : null,
      k: p.k, d: p.d, a: p.a, dmg: Math.round(p.dmg), taken: Math.round(st.taken), gold: Math.round(p.gold),
      goldPerMin: Math.round((p.gold / minutes) * 10) / 10,
      t3_1: st.t3Times[0] ?? null, t3_2: st.t3Times[1] ?? null, t3_3: st.t3Times[2] ?? null, t3Count: st.t3Times.length,
      samples: st.samples, counterPlanned: planned[p.id] ?? [],
    };
  });
  const endTowers = towerState(e);
  return {
    config, seed, strategySide, runner: RUNNER_VERSION,
    over: e.over ? 1 : 0, duration: e.t, winner,
    strategyWon: strategySide && winner ? (winner === strategySide ? 1 : 0) : null,
    kills: e.bK + e.rK, bK: e.bK, rK: e.rK, dragons, barons, towers: towersDown(e), towerState: endTowers, lastTowerFallT,
    laneTowersClearedT, bothLaneClearedT,
    stallMin: bothLaneClearedT !== null ? Math.round(((e.t - bothLaneClearedT) / 60) * 100) / 100 : null,
    guardDamageAfterClear: { blue: Math.round(guardDamageAfterClear.blue), red: Math.round(guardDamageAfterClear.red) },
    rejected: itemsOn ? e.items.counters.rejected : 0, violations, conservationFails,
    purchaseCount, counterBought, counterPlanned, samples, players: players_out,
    wallMs: Math.round(performance.now() - started),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Worker 模式／主程序入口
// ─────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--worker")) {
  process.on("message", async (task) => {
    if (task?.type !== "run") return;
    try {
      const r = await runMatch(task.config, task.seed, task.incomeK ?? 1);
      process.send({ type: "done", key: task.key, result: r });
    } catch (err) {
      process.send({ type: "error", key: task.key, error: String(err?.stack ?? err) });
    }
  });
  process.send({ type: "ready" });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  //  延到模組全部求值完才執行：main() 會用到檔案後段才宣告的 quant／mean／summarize（直接 await 會踩到 TDZ）
  setImmediate(() => { main().catch((err) => { console.error(err); process.exit(1); }); });
}

async function main() {
  const seeds = Number(arg("seeds", 200));
  const seedStart = Number(arg("seedStart", 1));
  const configs = String(arg("configs", ALL_CONFIGS.join(","))).split(",").filter((c) => ALL_CONFIGS.includes(c));
  const workers = Math.max(1, Math.min(Number(arg("workers", Math.max(1, Math.min(6, os.cpus().length - 2)))), 12));
  const outDir = path.resolve(ROOT, arg("out", "reports/moba-items-m4a"));
  //  M4b：個人收入倍率（只影響 itemsV1 設定；off 不受影響）
  const incomeK = Number(arg("incomeK", 1));
  if (!(incomeK > 0)) throw new Error(`--incomeK 必須為正數：${incomeK}`);
  fs.mkdirSync(outDir, { recursive: true });
  const tasks = [];
  for (const config of configs) for (let i = 0; i < seeds; i++) tasks.push({ type: "run", key: `${config}:${seedStart + i}`, config, seed: seedStart + i, incomeK });
  const results = new Map();
  const t0 = Date.now();
  let next = 0, done = 0, failed = 0;
  const log = (s) => process.stdout.write(s + "\n");
  log(`M4a balance runner：${configs.join(",")} × ${seeds} seeds（${tasks.length} 場），workers=${workers}，輸出 ${path.relative(ROOT, outDir)}`);

  await new Promise((resolveAll) => {
    let alive = 0;
    const spawnWorker = () => {
      const child = fork(fileURLToPath(import.meta.url), ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      const feed = () => {
        if (next >= tasks.length) { child.kill(); return; }
        child.send(tasks[next++]);
      };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        if (m.type === "done") results.set(m.key, m.result);
        if (m.type === "error") { failed++; results.set(m.key, { error: m.error, key: m.key }); log(`✗ ${m.key}: ${m.error.slice(0, 200)}`); }
        done++;
        if (done % 50 === 0 || done === tasks.length) {
          const el = (Date.now() - t0) / 1000;
          log(`  ${done}/${tasks.length}　${el.toFixed(0)}s　預估剩餘 ${(el / done * (tasks.length - done)).toFixed(0)}s`);
        }
        feed();
      });
      child.on("exit", () => { alive--; if (alive === 0) resolveAll(); });
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) spawnWorker();
  });

  const ordered = tasks.map((t) => results.get(t.key)).filter(Boolean);
  const ok = ordered.filter((r) => !r.error);
  await modules();   // 主程序寫 item_purchases.csv 需要物品目錄（worker 各自載入，主程序這裡才載）
  writeOutputs(outDir, ok, { seeds, seedStart, configs, incomeK, workers, failed, wallS: Math.round((Date.now() - t0) / 1000) });
  log(`完成：${ok.length} 場、失敗 ${failed}，耗時 ${Math.round((Date.now() - t0) / 1000)}s`);
  process.exit(failed ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  彙整
// ─────────────────────────────────────────────────────────────────────────────
const quant = (arr, q) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round((a[lo] + (a[hi] - a[lo]) * (pos - lo)) * 100) / 100;
};
const mean = (arr) => {
  const a = arr.filter((x) => Number.isFinite(x));
  return a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100 : null;
};
const rate = (arr, pred) => (arr.length ? Math.round((arr.filter(pred).length / arr.length) * 1000) / 1000 : null);
const min = (s) => (Number.isFinite(s) ? Math.round((s / 60) * 100) / 100 : null);

export function summarize(rows) {
  const byConfig = {};
  for (const r of rows) (byConfig[r.config] ??= []).push(r);
  const out = {};
  for (const [config, list] of Object.entries(byConfig)) {
    const durM = list.map((r) => r.duration / 60);
    const finished = list.filter((r) => r.over);
    const players = list.flatMap((r) => r.players.map((p) => ({ ...p, duration: r.duration, over: r.over })));
    const roles = ["top", "jungle", "mid", "adc", "sup"];
    const byRole = Object.fromEntries(roles.map((role) => [role, players.filter((p) => p.role === role)]));
    const archs = [...new Set(players.map((p) => p.arch))];
    const byArch = Object.fromEntries(archs.map((a) => [a, players.filter((p) => p.arch === a)]));
    const itemsOn = config !== "off";
    const t3Stats = (ps) => ({
      first_median_min: min(quant(ps.map((p) => p.t3_1), 0.5)), first_p90_min: min(quant(ps.map((p) => p.t3_1), 0.9)),
      second_median_min: min(quant(ps.map((p) => p.t3_2), 0.5)), third_median_min: min(quant(ps.map((p) => p.t3_3), 0.5)),
      reach1_rate: rate(ps, (p) => p.t3_1 !== null), reach2_rate: rate(ps, (p) => p.t3_2 !== null), reach3_rate: rate(ps, (p) => p.t3_3 !== null),
      first_before_11_rate: rate(ps, (p) => p.t3_1 !== null && p.t3_1 <= 660),
    });
    const sampleMean = (ps, label, key) => mean(ps.map((p) => p.samples?.[label]?.[key]).filter((x) => x !== undefined));
    const incomeShare = (ps, label) => {
      const totals = {};
      let all = 0;
      for (const p of ps) for (const [k, v] of Object.entries(p.samples?.[label]?.earnedBy ?? {})) { totals[k] = (totals[k] ?? 0) + v; all += v; }
      const n = ps.filter((p) => p.samples?.[label]).length || 1;
      return Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { per_player: Math.round(v / n), share: Math.round((v / Math.max(1, all)) * 1000) / 1000 }]));
    };
    const perRole = Object.fromEntries(Object.entries(byRole).map(([role, ps]) => [role, {
      n: ps.length,
      goldPerMin: mean(ps.map((p) => p.goldPerMin)),
      dmgPerMin: mean(ps.map((p) => p.dmg / (p.duration / 60))),
      takenPerMin: mean(ps.map((p) => p.taken / (p.duration / 60))),
      deathsPerMatch: mean(ps.map((p) => p.d)), killsPerMatch: mean(ps.map((p) => p.k)),
      ...(itemsOn ? {
        t3: t3Stats(ps),
        completed: Object.fromEntries(["600", "900", "1200", "end"].map((l) => [l, sampleMean(ps, l, "completed")])),
        unspent: Object.fromEntries(["600", "900", "1200", "end"].map((l) => [l, sampleMean(ps, l, "unspent")])),
        earnedAt: Object.fromEntries(["600", "900", "1200"].map((l) => [l, sampleMean(ps, l, "earned")])),
        incomeAt1200: incomeShare(ps, "1200"),
      } : {}),
    }]));
    const perArch = Object.fromEntries(Object.entries(byArch).map(([a, ps]) => [a, {
      n: ps.length, goldPerMin: mean(ps.map((p) => p.goldPerMin)), deathsPerMatch: mean(ps.map((p) => p.d)),
      ...(itemsOn ? { t3: t3Stats(ps), completedAt1200: sampleMean(ps, "1200", "completed"), unspentAt1200: sampleMean(ps, "1200", "unspent") } : {}),
    }]));
    const sampleKills = (label) => mean(list.map((r) => r.samples?.[label]?.kills).filter((x) => x !== undefined));
    const purchase = {};
    const counterBought = {}, counterPlanned = {};
    for (const r of list) {
      for (const [id, n] of Object.entries(r.purchaseCount ?? {})) purchase[id] = (purchase[id] ?? 0) + n;
      for (const [id, n] of Object.entries(r.counterBought ?? {})) counterBought[id] = (counterBought[id] ?? 0) + n;
      for (const [id, n] of Object.entries(r.counterPlanned ?? {})) counterPlanned[id] = (counterPlanned[id] ?? 0) + n;
    }
    const bucket = (lo, hi) => list.filter((r) => r.duration / 60 > lo && r.duration / 60 <= hi);
    const bucketFeatures = (bl) => ({
      n: bl.length,
      kills_per_min: mean(bl.map((r) => r.kills / (r.duration / 60))),
      towers_at_20: mean(bl.map((r) => { const s = r.samples["1200"]; return s ? s.towers.blue + s.towers.red : null; }).filter((x) => x !== null)),
      towers_end: mean(bl.map((r) => r.towers.blue + r.towers.red)),
      both_lane_towers_cleared_rate: rate(bl, (r) => r.bothLaneClearedT !== null),
      both_lane_towers_cleared_min: mean(bl.map((r) => min(r.bothLaneClearedT)).filter((x) => x !== null)),
      stall_min_after_both_cleared: mean(bl.map((r) => r.stallMin).filter((x) => x !== null)),
      guard_towers_down_end: mean(bl.map((r) => r.towerState.blue.guard + r.towerState.red.guard)),
      loser_nexus_hp_end: mean(bl.map((r) => (r.winner ? r.towerState[r.winner === "blue" ? "red" : "blue"].nexusHp : Math.min(r.towerState.blue.nexusHp, r.towerState.red.nexusHp)))),
      gold_diff_at_20: mean(bl.map((r) => { const s = r.samples["1200"]; return s ? Math.abs(s.bGold - s.rGold) : null; }).filter((x) => x !== null)),
      kill_diff_at_20: mean(bl.map((r) => { const s = r.samples["1200"]; return s ? Math.abs(s.bK - s.rK) : null; }).filter((x) => x !== null)),
      barons: mean(bl.map((r) => r.barons)), dragons: mean(bl.map((r) => r.dragons)),
      team_completed_at_20: itemsOn ? mean(bl.map((r) => r.players.reduce((acc, p) => acc + (p.samples?.["1200"]?.completed ?? 0), 0) / 2)) : null,
      full_inventory_end_rate: itemsOn ? rate(bl.flatMap((r) => r.players), (p) => p.samples?.end?.full === 1) : null,
      unspent_end: itemsOn ? mean(bl.flatMap((r) => r.players.map((p) => p.samples?.end?.unspent ?? null)).filter((x) => x !== null)) : null,
      deaths_per_min: mean(bl.map((r) => r.players.reduce((s, p) => s + p.d, 0) / (r.duration / 60))),
    });
    out[config] = {
      n: list.length, finish_rate: rate(list, (r) => r.over), unfinished_at_60: list.filter((r) => !r.over).length,
      duration_min: { median: quant(durM, 0.5), p75: quant(durM, 0.75), p90: quant(durM, 0.9), max: quant(durM, 1), mean: mean(durM) },
      over30_rate: rate(list, (r) => r.duration > 1800), over35_rate: rate(list, (r) => r.duration > 2100), over40_rate: rate(list, (r) => r.duration > 2400),
      blue_win_rate: rate(finished, (r) => r.winner === "blue"),
      strategy_team_win_rate: config === "off" || config === "standard" ? null : rate(finished.filter((r) => r.strategyWon !== null), (r) => r.strategyWon === 1),
      kills_at: { 10: sampleKills("600"), 15: sampleKills("900"), 20: sampleKills("1200"), end: mean(list.map((r) => r.kills)) },
      towers_at_20: mean(list.map((r) => { const s = r.samples["1200"]; return s ? s.towers.blue + s.towers.red : null; }).filter((x) => x !== null)),
      per_role: perRole, per_arch: perArch,
      ...(itemsOn ? {
        t3_all: t3Stats(players),
        team_completed_at: Object.fromEntries(["600", "900", "1200", "1500", "end"].map((l) => [l, mean(list.map((r) => {
          const s = r.players.reduce((acc, p) => acc + (p.samples?.[l]?.completed ?? 0), 0); return r.players.some((p) => p.samples?.[l]) ? s / 2 : null;
        }).filter((x) => x !== null))])),
        earned_per_player_at: Object.fromEntries(["600", "900", "1200"].map((l) => [l, sampleMean(players, l, "earned")])),
        income_share_at: { 600: incomeShare(players, "600"), 1200: incomeShare(players, "1200") },
        unspent_at: Object.fromEntries(["600", "900", "1200", "end"].map((l) => [l, { mean: sampleMean(players, l, "unspent"), p90: quant(players.map((p) => p.samples?.[l]?.unspent), 0.9) }])),
        purchase_top: Object.entries(purchase).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id, n]) => ({ id, per_match: Math.round((n / list.length) * 100) / 100 })),
        purchase_all: purchase,
        counter_items: Object.fromEntries(COUNTER_ITEMS.map((id) => [id, {
          bought_per_100_matches: Math.round(((counterBought[id] ?? 0) / list.length) * 10000) / 100,
          planned_player_slots: counterPlanned[id] ?? 0, bought: counterBought[id] ?? 0,
        }])),
        rejected_total: list.reduce((s, r) => s + r.rejected, 0),
        inventory_violations: list.reduce((s, r) => s + r.violations, 0),
        conservation_fails: list.reduce((s, r) => s + r.conservationFails, 0),
      } : {}),
      duration_buckets: { le26: bucketFeatures(bucket(0, 26)), b26_35: bucketFeatures(bucket(26, 35)), gt35: bucketFeatures(bucket(35, 999)) },
      long_matches: list.filter((r) => r.duration > 2100).map((r) => ({
        seed: r.seed, min: min(r.duration), over: r.over, winner: r.winner, kills: r.kills, barons: r.barons,
        laneCleared: { blue: min(r.laneTowersClearedT.blue), red: min(r.laneTowersClearedT.red) }, stallMin: r.stallMin,
        guardsDown: r.towerState.blue.guard + r.towerState.red.guard, nexusHp: { blue: r.towerState.blue.nexusHp, red: r.towerState.red.nexusHp },
        guardDamageAfterClear: r.guardDamageAfterClear,
      })),
      wall_ms_mean: mean(list.map((r) => r.wallMs)),
    };
  }
  return out;
}

function writeOutputs(outDir, rows, meta) {
  const summary = summarize(rows);
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ runner: RUNNER_VERSION, meta, capS: CAP_S, dt: DT, summary }, null, 2), "utf8");
  const mh = ["config", "seed", "strategySide", "over", "duration_min", "winner", "strategyWon", "kills", "kills10", "kills15", "kills20", "bK", "rK", "towers_blue_down", "towers_red_down", "towers20",
    "blue_lane_cleared_min", "red_lane_cleared_min", "stall_min", "guards_down_end", "blue_nexus_hp_end", "red_nexus_hp_end", "dragons", "barons", "lastTowerFall_min", "team_t3_20", "rejected", "violations", "conservationFails", "wallMs"];
  const csv = (vals) => vals.map((v) => (v === null || v === undefined ? "" : String(v).includes(",") ? `"${v}"` : v)).join(",");
  const matchLines = [mh.join(",")];
  const playerLines = [["config", "seed", "pid", "side", "role", "arch", "heroId", "strategy", "won", "k", "d", "a", "dmg", "taken_approx", "gold", "goldPerMin", "t3_1_min", "t3_2_min", "t3_3_min", "t3Count",
    "completed10", "completed15", "completed20", "completedEnd", "unspent10", "unspent15", "unspent20", "unspentEnd", "earned10", "earned15", "earned20",
    "earned20_passive", "earned20_minion", "earned20_kill", "earned20_assist", "earned20_tower", "earned20_camp", "earned20_objective", "earned20_tithe", "counterPlanned"].join(",")];
  for (const r of rows) {
    const s = r.samples;
    const t20 = r.players.reduce((acc, p) => acc + (p.samples?.["1200"]?.completed ?? 0), 0);
    matchLines.push(csv([r.config, r.seed, r.strategySide, r.over, min(r.duration), r.winner, r.strategyWon, r.kills, s["600"]?.kills, s["900"]?.kills, s["1200"]?.kills, r.bK, r.rK, r.towers.blue, r.towers.red,
      s["1200"] ? s["1200"].towers.blue + s["1200"].towers.red : null, min(r.laneTowersClearedT.blue), min(r.laneTowersClearedT.red), r.stallMin,
      r.towerState.blue.guard + r.towerState.red.guard, r.towerState.blue.nexusHp, r.towerState.red.nexusHp,
      r.dragons, r.barons, min(r.lastTowerFallT), r.config === "off" ? null : t20 / 2, r.rejected, r.violations, r.conservationFails, r.wallMs]));
    for (const p of r.players) {
      const sm = p.samples ?? {};
      const by = sm["1200"]?.earnedBy ?? {};
      playerLines.push(csv([r.config, r.seed, p.id, p.side, p.role, p.arch, p.heroId, p.strategy, p.won, p.k, p.d, p.a, p.dmg, p.taken, p.gold, p.goldPerMin, min(p.t3_1), min(p.t3_2), min(p.t3_3), p.t3Count,
        sm["600"]?.completed, sm["900"]?.completed, sm["1200"]?.completed, sm.end?.completed, sm["600"]?.unspent, sm["900"]?.unspent, sm["1200"]?.unspent, sm.end?.unspent,
        sm["600"]?.earned, sm["900"]?.earned, sm["1200"]?.earned,
        by.passive, by.minion, by.kill, by.assist, by.tower, by.camp, (by.dragon ?? 0) + (by.baron ?? 0) || (sm["1200"] ? 0 : null), by.tithe,
        (p.counterPlanned ?? []).join("|")]));
    }
  }
  fs.writeFileSync(path.join(outDir, "matches.csv"), matchLines.join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(outDir, "players.csv"), playerLines.join("\n") + "\n", "utf8");
  const itemLines = ["config,itemId,tier,purchases,per_match"];
  for (const [config, sm] of Object.entries(summary)) {
    for (const [id, n] of Object.entries(sm.purchase_all ?? {}).sort((a, b) => b[1] - a[1])) {
      itemLines.push([config, id, MODS?.catalog?.getItem(id)?.tier ?? "", n, Math.round((n / sm.n) * 100) / 100].join(","));
    }
  }
  fs.writeFileSync(path.join(outDir, "item_purchases.csv"), itemLines.join("\n") + "\n", "utf8");
}
