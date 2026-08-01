#!/usr/bin/env node
// ============================================================================
//  tools/bench_combat_l2.mjs — L Hotfix 2：塔／野怪／Boss 威脅感 ＋ 平衡基準
//
//  兩件事一起量，因為它們必須一起看：
//    A. **威脅感**（產品目標）：塔與 Boss 到底打不打得動人？
//       · 塔在射程內每秒對英雄造成多少傷害、要幾發才把人打殘
//       · 英雄「站在敵方塔射程內」的 tick 數（＝無視塔的程度）
//       · 龍／巴龍／野怪對英雄的實際 DPS
//    B. **平衡**（回歸標準）：完成率／勝率／時長 p50 p95／擊殺／破塔／龍巴龍
//
//  ⚠ 全部讀**引擎內部狀態**，不讀 snapshot（snapshot 不是引擎狀態的全集：
//    towers 只序列化 side/lane/tier/pos/hp——Hotfix 1 踩過這個坑）。
//  ⚠ 唯讀：不呼叫任何 setter、不改 rng。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { dist } from "../src/gameData.js";
import { SIM_RULES } from "../src/battle/moba/matchProgression.js";

const arg = (k, d) => {
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  if (eq) return eq.slice(k.length + 1);
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const N = Number(arg("--seeds", "24"));
const MAX_TICKS = Number(arg("--maxTicks", "6000"));
const LABEL = arg("--label", "run");
const JSON_OUT = arg("--json", "");
const R = SIM_RULES.v3 ?? SIM_RULES;
//  M1：--arch=1 ⇒ 啟用戰鬥原型層（近戰／遠程距離 + 職業站位）。
//  預設關閉 ⇒ 與 M 基礎層之前的量測可直接比較。
const USE_ARCH = arg("--arch", "0") === "1";
const A = USE_ARCH ? await import("../src/data/heroCombatArchetypes.js") : null;
const ARCH_LINEUP = ["ironclad", "duskblade", "bingshuang", "leiting", "shengguang",
  "cinderfist", "chichuan", "lieyan", "yanfeng", "dadi"];
const archCfg = (() => {
  if (!A) return null;
  const seats = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
  const roster = Object.fromEntries(seats.map((s2, i) => [s2, { heroId: ARCH_LINEUP[i] }]));
  const mods = A.toEngineArchetypes(roster);
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(mods)) (pid[0] === "r" ? red : blue)[pid] = m;
  return { blue, red, meta: null };
})();

const SEEDS = Array.from({ length: N }, (_, i) => [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555,
  314, 271, 1618, 8080, 4242, 31, 64, 128, 256, 512, 1024, 2048, 4096, 8192][i] ?? (10007 + i * 97));

const pct = (a, b) => (b ? (a / b) * 100 : 0);
const quant = (arr, q) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

const rows = [];
for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  if (archCfg) e.configureArchetypes(archCfg);
  let towerDmgToHeroes = 0, towerShots = 0;
  let bossDmgToHeroes = 0, bossShots = 0, campDmgToHeroes = 0, campShots = 0;
  let towerCleanShots = 0, bossCleanShots = 0, campCleanShots = 0;
  let heroTicksInTowerRange = 0, heroTicksInTowerRangeLowHp = 0;
  let dragonKills = 0, baronKills = 0;
  let prevDragonAlive = true, prevBaronAlive = true;
  let hp = new Map(e.players.map((p) => [p.id, p.hp]));
  let i = 0;

  for (; i < MAX_TICKS && !e.over; i++) {
    const fxLast = e.fx.length ? e.fx[e.fx.length - 1].id : null;
    //  攻擊前的 HP（用來歸因這一 tick 的傷害來源）
    const before = new Map(e.players.map((p) => [p.id, p.hp]));
    e.tick(0.5);

    //  這個 tick 新推的 fx（照 id 找新尾巴）
    const newFx = [];
    for (let j = e.fx.length - 1; j >= 0; j--) {
      if (e.fx[j].id === fxLast) break;
      newFx.push(e.fx[j]);
    }
    //  逐筆歸因：塔 / Boss / 野怪 對英雄的傷害
    //  ⚠ 一個 tick 可能有多個來源打同一個人。用「這個 tick 該來源開了幾發 × 名目傷害」
    //     會不準；改成「該目標這一 tick 的實際掉血」按來源數量均分，並記錄發數。
    const dropBy = new Map();
    for (const p of e.players) {
      const b = before.get(p.id) ?? p.hp;
      const d = b - p.hp;
      if (d > 0) dropBy.set(p.id, d);
    }
    //  ⚠ 只採計「這一 tick 只被單一來源打到」的乾淨樣本。
    //     否則同一 tick 的英雄傷害會被算進塔／Boss 帳上（第一版就量出
    //     「塔每發 88.5」這種被污染的數字，實際名目只有 33×lateFactor）。
    const srcOf = { tower: new Map(), boss: new Map(), camp: new Map() };
    const heroHit = new Set();
    for (const f of newFx) {
      const tgt = f.targetId;
      if (!tgt) continue;
      const kind = f.ability === "tower:basic" ? "tower"
        : String(f.ability ?? "").startsWith("boss:") ? "boss"
          : f.ability === "neutral:basic" ? "camp" : null;
      if (kind) { srcOf[kind].set(tgt, (srcOf[kind].get(tgt) ?? 0) + 1); continue; }
      heroHit.add(tgt);                            // 英雄／小兵／技能打到的目標
    }
    for (const [tgt, drop] of dropBy) {
      const t = srcOf.tower.get(tgt) ?? 0, bo = srcOf.boss.get(tgt) ?? 0, ca = srcOf.camp.get(tgt) ?? 0;
      const kinds = (t ? 1 : 0) + (bo ? 1 : 0) + (ca ? 1 : 0);
      if (kinds === 0) continue;
      //  發數一律計（那是精確的）；傷害只在「單一來源且沒有英雄同時打」時採計
      towerShots += t; bossShots += bo; campShots += ca;
      if (kinds > 1 || heroHit.has(tgt)) continue;
      if (t) { towerDmgToHeroes += drop; towerCleanShots += t; }
      else if (bo) { bossDmgToHeroes += drop; bossCleanShots += bo; }
      else if (ca) { campDmgToHeroes += drop; campCleanShots += ca; }
    }

    //  「英雄站在敵方塔射程內」的 tick 數——這是「無視塔」的直接量測
    for (const p of e.players) {
      if (p.dead) continue;
      const enemy = p.side === "blue" ? "red" : "blue";
      const inRange = Object.values(e.towers).some((tw) =>
        tw.hp > 0 && tw.side === enemy && dist(p.pos, tw.pos) < R.towerAggroRange);
      if (inRange) {
        heroTicksInTowerRange++;
        if (p.hp / p.maxHp < 0.35) heroTicksInTowerRangeLowHp++;
      }
    }

    if (prevDragonAlive && !e.dragon.alive) dragonKills++;
    if (prevBaronAlive && !e.baron.alive) baronKills++;
    prevDragonAlive = e.dragon.alive; prevBaronAlive = e.baron.alive;
    hp = new Map(e.players.map((p) => [p.id, p.hp]));
  }

  const towersDown = Object.values(e.towers).filter((t) => t.hp <= 0 && t.lane !== "nexus").length;
  rows.push({
    seed, over: e.over, min: e.t / 60, ticks: i,
    winner: e.over ? (e.players.reduce((s, p) => s + (p.side === "blue" ? p.k : 0), 0)
      >= 0 ? (e.winner ?? null) : null) : null,
    kills: e.players.reduce((s, p) => s + p.k, 0),
    towersDown, dragonKills, baronKills,
    towerDmg: towerDmgToHeroes, towerShots, towerCleanShots,
    bossDmg: bossDmgToHeroes, bossShots, bossCleanShots,
    campDmg: campDmgToHeroes, campShots, campCleanShots,
    towerRangeTicks: heroTicksInTowerRange,
    towerRangeLowHpTicks: heroTicksInTowerRangeLowHp,
  });
}

const done = rows.filter((r) => r.over);
const mins = done.map((r) => r.min);
const blue = done.filter((r) => r.winner === "blue").length;
const red = done.filter((r) => r.winner === "red").length;

const summary = {
  label: LABEL, seeds: rows.length,
  completion: pct(done.length, rows.length),
  unfinished: rows.length - done.length,
  blueWin: pct(blue, done.length), redWin: pct(red, done.length),
  meanMin: mean(mins), medMin: quant(mins, 0.5), p95Min: quant(mins, 0.95),
  meanKills: mean(rows.map((r) => r.kills)),
  meanTowers: mean(rows.map((r) => r.towersDown)),
  meanDragon: mean(rows.map((r) => r.dragonKills)),
  meanBaron: mean(rows.map((r) => r.baronKills)),
  //  威脅感指標
  towerDmgPerMatch: mean(rows.map((r) => r.towerDmg)),
  towerShotsPerMatch: mean(rows.map((r) => r.towerShots)),
  towerDmgPerShot: mean(rows.filter((r) => r.towerCleanShots).map((r) => r.towerDmg / r.towerCleanShots)),
  bossDmgPerMatch: mean(rows.map((r) => r.bossDmg)),
  bossShotsPerMatch: mean(rows.map((r) => r.bossShots)),
  bossDmgPerShot: mean(rows.filter((r) => r.bossCleanShots).map((r) => r.bossDmg / r.bossCleanShots)),
  campDmgPerMatch: mean(rows.map((r) => r.campDmg)),
  campShotsPerMatch: mean(rows.map((r) => r.campShots)),
  campDmgPerShot: mean(rows.filter((r) => r.campCleanShots).map((r) => r.campDmg / r.campCleanShots)),
  towerRangeTicksPerMatch: mean(rows.map((r) => r.towerRangeTicks)),
  towerRangeLowHpShare: pct(
    rows.reduce((s, r) => s + r.towerRangeLowHpTicks, 0),
    Math.max(1, rows.reduce((s, r) => s + r.towerRangeTicks, 0))),
};

const f1 = (x) => x.toFixed(1);
console.log(`══ ${LABEL} ══  ${rows.length} seeds`);
console.log("── 平衡 ──");
console.log(`完成率      ${f1(summary.completion)}%（未結束 ${summary.unfinished}）`);
console.log(`勝率        藍 ${f1(summary.blueWin)}% / 紅 ${f1(summary.redWin)}%`);
console.log(`時長        平均 ${f1(summary.meanMin)} 中位 ${f1(summary.medMin)} p95 ${f1(summary.p95Min)} 分`);
console.log(`擊殺        ${f1(summary.meanKills)}`);
console.log(`破塔        ${f1(summary.meanTowers)}`);
console.log(`龍 / 巴龍   ${f1(summary.meanDragon)} / ${f1(summary.meanBaron)}`);
console.log("── 威脅感（對英雄的實際傷害）──");
console.log(`塔   ${f1(summary.towerShotsPerMatch)} 發/場 ⇒ 乾淨樣本每發 ${f1(summary.towerDmgPerShot)} 傷害`);
console.log(`Boss ${f1(summary.bossShotsPerMatch)} 發/場 ⇒ 乾淨樣本每發 ${f1(summary.bossDmgPerShot)} 傷害`);
console.log(`野怪 ${f1(summary.campShotsPerMatch)} 發/場 ⇒ 乾淨樣本每發 ${f1(summary.campDmgPerShot)} 傷害`);
console.log(`英雄待在敵塔射程內 ${f1(summary.towerRangeTicksPerMatch)} tick/場，其中殘血占 ${f1(summary.towerRangeLowHpShare)}%`);

if (JSON_OUT) {
  const fs = await import("node:fs");
  fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, rows }, null, 2), "utf8");
  console.log(`\n→ ${JSON_OUT}`);
}
