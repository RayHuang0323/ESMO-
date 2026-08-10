#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_ability_p02.mjs — Milestone P0-2：能力影響 MOBA 戰鬥品質
//
//  執行：repo 根目錄 `node tools/check_moba_ability_p02.mjs`；**失敗時 exit 1**。
//
//  P0-2 之前：MOBA 只注入行為 mods（撤退／gank／roam／分推／推線深度／參團），
//  **沒有任何一項影響戰力** ⇒ 練功不會讓 MOBA 打得更好。
//
//  P0-2 的做法：能力小幅影響**本場經驗獲取速率**，其餘交給引擎既有的
//  `p.power = p.basePower * powerMultFor(p.mlv)` 曲線。
//  ⇒ 不把任何係數乘進傷害式（S28 紅線）。
//
//  驗：
//    ① 未注入能力 ⇒ **逐位元與 baseline 相同**（regress 不會被影響）
//    ② 注入後有**可驗證、可重現**的差異
//    ③ 幅度**不誇張**且有硬限幅
//    ④ 只縮放正向獲得，不縮放 drain（不給雙重優勢）
//    ⑤ 雙方對稱：同樣能力給兩邊 ⇒ 沒有系統性偏袒
//    ⑥ 傷害式沒有被動過（原始碼層級斷言）
// ============================================================================
import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  toEnginePlayerMods, toPlayerMods, NEUTRAL_MODS, SCALE_CLAMP, STAT_MAP,
} from "../src/battle/moba/mobaPlayerStats.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const KEYS = ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision",
  "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"];
const statsAll = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const SEATS = ["b1", "b2", "b3", "b4", "b5"];
const slots = (v) => SEATS.map((id) => ({ id, stats: statsAll(v) }));
const modsFor = (blueV, redV = null) => toEnginePlayerMods({
  blue: slots(blueV),
  red: redV === null ? [] : SEATS.map((id) => ({ id: id.replace("b", "r"), stats: statsAll(redV) })),
});

/** 跑一場並回報可觀測指標。 */
function run(seed, mods = null, ticks = 2400) {
  const e = new LogicEngine(seed);
  if (mods) e.configurePlayers(mods);
  for (let i = 0; i < ticks && !e.over; i++) e.tick(0.5);
  const blue = e.players.filter((p) => p.side === "blue");
  const red = e.players.filter((p) => p.side === "red");
  const avg = (a, f) => a.reduce((s, p) => s + f(p), 0) / a.length;
  return {
    over: e.over, winner: e.winner, t: Math.round(e.t),
    blueLv: Math.round(avg(blue, (p) => p.mlv) * 100) / 100,
    redLv: Math.round(avg(red, (p) => p.mlv) * 100) / 100,
    bK: e.bK, rK: e.rK,
    snap: JSON.stringify(e.snapshot()),
  };
}
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242];

console.log("══ Milestone P0-2：能力影響 MOBA 戰鬥品質 ══\n");

// ── 1) 未注入能力 ⇒ baseline 逐位元不變 ────────────────────────────────
{
  let identical = true;
  for (const s of SEEDS.slice(0, 6)) {
    if (run(s, null, 400).snap !== run(s, null, 400).snap) { identical = false; break; }
  }
  ck("1) 同 seed 未注入能力 → 自身可重現", identical);
  //  ⚠ 這裡要驗的是「**P0-2 的改動**在中性時不生效」，
  //  而不是「configurePlayers 中性 ⇒ 與未注入相同」——後者**本來就不成立**：
  //  實測（含與不含 xpRateScale 兩種都試過）`configurePlayers` 本身就會切換
  //  S28 的程式路徑而改變模擬結果，那是 P0-2 之前就有的既有性質。
  //  真正保護 regress 的是：regress 走 `new LogicEngine(seed)`、**不呼叫
  //  configurePlayers** ⇒ `_mod` 回 null ⇒ 本改動完全不生效。
  const neutral = modsFor(70, 70);
  const stripXp = (m) => ({
    ...m,
    blue: Object.fromEntries(Object.entries(m.blue).map(([k, v]) => {
      const { xpRateScale, ...rest } = v; return [k, rest];
    })),
  });
  let same = true, firstDiff = null;
  for (const s of SEEDS.slice(0, 6)) {
    //  同一組中性 mods，有／無 xpRateScale 欄位 ⇒ 必須逐位元相同
    if (run(s, neutral, 400).snap !== run(s, stripXp(neutral), 400).snap) { same = false; firstDiff = s; break; }
  }
  ck("1b) **中性能力時 xpRateScale 完全不生效**（有無此欄位逐位元相同）",
    same, same ? "6 seeds 全等" : `seed ${firstDiff} 不同`);
  ck("1c) 中性 mods 的 xpRateScale 恰為 1",
    NEUTRAL_MODS.xpRateScale === 1 && toPlayerMods(statsAll(70)).xpRateScale === 1);
  ck("1d) 未 configurePlayers ⇒ 引擎沒有任何能力係數（regress 的保護）",
    (() => { const e = new LogicEngine(1); return e.playerStatsOn === false && e._mod(e.players[0]) === null; })());
}

// ── 2) 注入後有可驗證、可重現的差異 ────────────────────────────────────
{
  const strong = modsFor(95, 70);     // 藍方強、紅方中性
  const weak = modsFor(45, 70);
  ck("2) 同 seed ＋ 同能力 → 結果可重現",
    run(7, strong, 1200).snap === run(7, strong, 1200).snap);

  //  等級差：強隊本場等級應高於弱隊（多 seed 平均，避免單場噪音）
  let sumStrong = 0, sumWeak = 0, wins = 0;
  for (const s of SEEDS) {
    const a = run(s, strong, 1600);
    const b = run(s, weak, 1600);
    sumStrong += a.blueLv; sumWeak += b.blueLv;
    if (a.blueLv > b.blueLv) wins++;
  }
  const avgS = Math.round(sumStrong / SEEDS.length * 100) / 100;
  const avgW = Math.round(sumWeak / SEEDS.length * 100) / 100;
  ck("2b) **強能力隊的本場等級高於弱能力隊**（15 seeds 平均）",
    avgS > avgW, `強 ${avgS} vs 弱 ${avgW}（逐場勝出 ${wins}/${SEEDS.length}）`);
  ck("2c) 差異一致（多數 seed 同向，不是噪音）",
    wins >= Math.ceil(SEEDS.length * 0.7), `${wins}/${SEEDS.length} 場同向`);
  //  能力確實改變了模擬結果（不是只有數字沒進引擎）
  let changed = 0;
  for (const s of SEEDS.slice(0, 8)) if (run(s, strong, 800).snap !== run(s, weak, 800).snap) changed++;
  ck("2d) 能力差異確實改變模擬結果", changed === 8, `${changed}/8 seeds 不同`);
}

// ── 3) 幅度不誇張且有硬限幅 ────────────────────────────────────────────
{
  const [lo, hi] = SCALE_CLAMP.xpRateScale;
  ck("3) 經驗速率限幅為 ±6%", lo === 0.94 && hi === 1.06, `[${lo}, ${hi}]`);
  ck("3b) 全 100 分不超過上界",
    toPlayerMods(statsAll(100)).xpRateScale <= hi, `${toPlayerMods(statsAll(100)).xpRateScale}`);
  ck("3c) 全 1 分不低於下界",
    toPlayerMods(statsAll(1)).xpRateScale >= lo, `${toPlayerMods(statsAll(1)).xpRateScale}`);
  //  等級差距要「看得出來但不壓倒」：平均差距落在合理區間
  let diff = 0;
  for (const s of SEEDS) diff += run(s, modsFor(95, 70), 1600).blueLv - run(s, modsFor(45, 70), 1600).blueLv;
  const avgDiff = Math.round(diff / SEEDS.length * 100) / 100;
  ck("3d) **不誇張**：極端能力差的本場等級差距在 0.1–2.5 級之間",
    avgDiff > 0.1 && avgDiff < 2.5, `平均差 ${avgDiff} 級`);
  //  ⚠ 精確比對的 allowlist：任何新增的取樣項都必須在這裡明確登記過。
  //  2026-08-07 補上 `learning`（學習力）——它是 16 項素質中最後一項沒接進戰鬥的，
  //  語意就是「這一場學得多快」，掛在本場經驗速率上最貼切。權重最小（+0.006）。
  ck("3e) 取樣能力項是「補刀與清線」相關項 ＋ 學習力",
    Object.keys(STAT_MAP.xpRateScale).sort().join() === "accuracy,apm,focus,learning,mapAware",
    Object.keys(STAT_MAP.xpRateScale).join("/"));
}

// ── 4) 只縮放正向獲得，不縮放 drain ────────────────────────────────────
{
  const src = fs.readFileSync("src/LogicEngine.js", "utf8");
  ck("4) 只在 amt > 0 時套用（drain 不縮放，不給雙重優勢）",
    /if \(amt > 0\) \{\s*\n\s*const xpK = this\._mod\(p\)\?\.xpRateScale;/.test(src));
  ck("4b) 未 configurePlayers 時係數不存在（_mod 回 null）",
    /Number\.isFinite\(xpK\)/.test(src));
}

// ── 5) 雙方對稱，沒有系統性偏袒 ────────────────────────────────────────
{
  //  兩邊同樣強 ⇒ 與兩邊同樣中性相比，勝負分佈不應系統性偏向某一方
  //  ⚠ tick 要夠長，否則多數場次未分勝負 ⇒ 這條會空過（先前 2400 tick 就是 0/0）
  const bothStrong = modsFor(95, 95);
  let blueWins = 0, decided = 0;
  for (const s of SEEDS) {
    const r = run(s, bothStrong, 4000);
    if (r.over) { decided++; if (r.winner === "blue") blueWins++; }
  }
  ck("5) 雙方同能力 → 勝負沒有系統性偏袒（且確實有分出勝負）",
    decided >= Math.ceil(SEEDS.length * 0.6) &&
    blueWins / decided >= 0.25 && blueWins / decided <= 0.75,
    `藍勝 ${blueWins}/${decided} 場`);
  //  對稱性：兩邊同能力時，雙方平均等級應接近
  let gap = 0;
  for (const s of SEEDS) { const r = run(s, bothStrong, 1600); gap += Math.abs(r.blueLv - r.redLv); }
  ck("5b) 雙方同能力 → 兩邊本場等級接近",
    gap / SEEDS.length < 1.5, `平均等級差 ${Math.round(gap / SEEDS.length * 100) / 100}`);
}

// ── 6) 傷害式沒有被動過（S28 紅線）─────────────────────────────────────
{
  const src = fs.readFileSync("src/LogicEngine.js", "utf8");
  const dmgLine = src.split("\n").find((l) => l.includes("const dmgAmt = p.power * dt"));
  ck("6) 傷害式仍是 `p.power * dt * ...`，沒有夾帶能力係數",
    !!dmgLine && !/xpRate|Adj|mod\(/.test(dmgLine), (dmgLine ?? "").trim().slice(0, 70));
  ck("6b) 能力**沒有**被注入 power / tough",
    !/power:\s*.*xpRateScale|tough:/.test(JSON.stringify(modsFor(95, 70))));
  ck("6c) 戰力仍由本場等級導出（既有機制未變）",
    /p\.power = p\.basePower \* powerMultFor\(p\.mlv\)/.test(src));
}

console.log("\n── 機制摘要 ──────────────────────────────────────────────────");
{
  console.log(`   能力 → 本場經驗速率（${Object.keys(STAT_MAP.xpRateScale).join("/")}），限幅 ${SCALE_CLAMP.xpRateScale.join("–")}`);
  console.log(`   全 100 分 ⇒ ×${toPlayerMods(statsAll(100)).xpRateScale}｜全 70 分 ⇒ ×${toPlayerMods(statsAll(70)).xpRateScale}｜全 40 分 ⇒ ×${toPlayerMods(statsAll(40)).xpRateScale}`);
  console.log("   其餘交給引擎既有的 mlv → power/HP 曲線；傷害式一行未動");
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
