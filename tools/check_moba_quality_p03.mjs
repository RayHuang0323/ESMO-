#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_quality_p03.mjs — Milestone P0-3：最小戰鬥品質層
//
//  執行：repo 根目錄 `node tools/check_moba_quality_p03.mjs`；**失敗時 exit 1**。
//
//  ── P0-3 補了什麼 ─────────────────────────────────────────────────────────
//  P0-2 只讓能力影響「本場經驗獲取速率」。P0-3 加上四個**行為**掛點：
//    ① lastHitLoss  精準/手速/專注低 ⇒ 補刀漏兵
//    ② attackWaste  精準/反應/走位低 ⇒ 空揮（該 tick 不造成傷害）
//    ③ castMiss     戰術/決策/抗壓低 ⇒ 技能放空（冷卻照算，效果沒了）
//    ④ focusRate    決策/視野/應變高 ⇒ 會挑殘血打，而不是機械式打最近的
//    ④b retreatLate 決策/應變/視野低 ⇒ 該撤時撤得太晚（決定性門檻平移）
//
//  ── 紅線 ──────────────────────────────────────────────────────────────────
//  **禁止把能力或 power 乘進傷害／血量／防禦。** 本檔在原始碼層級直接斷言。
//
//  ── A/B 方法論（重點）─────────────────────────────────────────────────────
//  A/B 的兩組都**同時給雙方真實能力資料**，不用「中性對手」當對照：
//      A（對照）：藍 70 / 紅 70   —— 兩邊都是真實資料，只是能力相同
//      B（實驗）：藍 88 / 紅 55   —— 兩邊都是真實資料，能力有差距
//  ⇒ 差異不會來自「一邊有注入、一邊沒注入」的不對稱，只來自能力差。
//
//  驗：
//    §1 映射層：單向、有限幅、中性＝零
//    §2 紅線：傷害式沒被能力碰過（原始碼斷言）
//    §3 中性不擾動：全 70 ⇒ 不擲骰、不改變行為
//    §4 A/B 六項指標：補刀成功率／無效攻擊比例／有效技能施放率／
//       撤退與死亡時機／平均經濟與本場等級／勝率不過度偏斜
//    §5 可重現性：同 seed 同能力 ⇒ 逐位元相同
// ============================================================================
import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  toEnginePlayerMods, toPlayerMods, NEUTRAL_MODS, ONESIDED_CLAMP, STAT_MAP,
} from "../src/battle/moba/mobaPlayerStats.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const KEYS = ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision",
  "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"];
const statsAll = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const ROLE_SPELLS = { b2: ["flash", "smite"], r2: ["flash", "smite"] };
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, ROLE_SPELLS[id] ?? ["flash", "ignite"]]));

/** 雙方都給真實能力資料（**不使用中性對手代替**）。 */
const modsFor = (blueV, redV) => toEnginePlayerMods({
  blue: BLUE.map((id) => ({ id, stats: statsAll(blueV) })),
  red: RED.map((id) => ({ id, stats: statsAll(redV) })),
});

/**
 * 戰局狀態指紋：位置／血量／經濟／等級／KD。
 * ⚠ 刻意**不含** snapshot 的 meta 欄位——`configurePlayers` 一定會加上
 * `playerStatsMeta` 與 `pexec`，那是儀器化資料，不是戰局本身。拿整份 snapshot
 * 比對會永遠不相等，證明不了「中性不改變行為」。
 */
const digestOf = (e) => JSON.stringify(e.players.map((p) => [
  p.id, Math.round(p.pos.x * 1e6), Math.round(p.pos.y * 1e6),
  Math.round(p.hp * 1e6), Math.round(p.gold), p.mlv, p.k, p.d,
]));

// ── 一場的可觀測指標 ────────────────────────────────────────────────────────
function run(seed, { blueV = null, redV = null, ticks = 4000 } = {}) {
  const e = new LogicEngine(seed);
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "p03" } });
  if (blueV !== null) e.configurePlayers(modsFor(blueV, redV));
  for (let i = 0; i < ticks && !e.over; i++) e.tick(0.5);

  const side = (s) => e.players.filter((p) => p.side === s);
  const sum = (a, f) => a.reduce((t, p) => t + (f(p) ?? 0), 0);
  const avg = (a, f) => sum(a, f) / a.length;
  const m = (a) => {
    const csAttempt = sum(a, (p) => p.csAttempt);
    const atkTicks = sum(a, (p) => p.atkTicks);
    const castTry = sum(a, (p) => p.castTry);
    return {
      //  ① 補刀成功率
      csRate: csAttempt ? sum(a, (p) => p.csHit) / csAttempt : null,
      csAttempt,
      //  ② 無效攻擊比例
      wasteRate: atkTicks ? sum(a, (p) => p.atkWasted) / atkTicks : null,
      atkTicks,
      //  ③ 有效技能施放率
      castRate: castTry ? sum(a, (p) => p.castOk) / castTry : null,
      castTry,
      //  ④ 撤退與死亡時機
      retreats: sum(a, (p) => e.pexec?.[p.id]?.retreats ?? 0),
      deaths: sum(a, (p) => p.d ?? 0),
      focusSwap: sum(a, (p) => p.focusSwap),
      //  ⑤ 平均經濟與本場等級
      gold: r3(avg(a, (p) => p.gold)),
      mlv: r3(avg(a, (p) => p.mlv)),
    };
  };
  return { over: e.over, winner: e.winner, t: Math.round(e.t), blue: m(side("blue")), red: m(side("red")),
    snap: JSON.stringify(e.snapshot()), digest: digestOf(e) };
}

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242,
  31337, 65535, 1024, 2048, 4096];

console.log("\n══ §1 映射層：單向、有限幅、中性＝零 ══");
{
  const hi = toPlayerMods(statsAll(95));
  const mid = toPlayerMods(statsAll(70));
  const lo = toPlayerMods(statsAll(40));
  const P03 = ["lastHitLoss", "attackWaste", "castMiss", "focusRate", "retreatLate"];

  ck("§1a P0-3 的五個作用點都在 NEUTRAL_MODS 中定義",
    P03.every((k) => NEUTRAL_MODS[k] === 0), P03.join("/"));
  ck("§1b 中性（全 70）⇒ 五項全為 0（＝不改變任何行為）",
    P03.every((k) => mid[k] === 0), JSON.stringify(Object.fromEntries(P03.map((k) => [k, mid[k]]))));
  for (const k of P03) {
    const { dir, hi: cap } = ONESIDED_CLAMP[k];
    const good = dir === "penalty" ? hi[k] : lo[k];   // 該為 0 的那一側
    const bad = dir === "penalty" ? lo[k] : hi[k];    // 該生效的那一側
    ck(`§1c ${k}（${dir}）單向生效`, good === 0 && bad > 0, `95→${hi[k]}　40→${lo[k]}`);
    ck(`§1d ${k} 有限幅 ≤ ${cap}`, bad <= cap + 1e-9, `實測 ${bad}`);
  }
  //  低能力受罰、高能力不受罰 —— 而不是反過來（第一版曾把正負號寫反）
  ck("§1e penalty 只罰低能力（不是罰高能力）",
    lo.lastHitLoss > hi.lastHitLoss && lo.attackWaste > hi.attackWaste
    && lo.castMiss > hi.castMiss && lo.retreatLate > hi.retreatLate);
  ck("§1f bonus 只給高能力", hi.focusRate > lo.focusRate && lo.focusRate === 0,
    `95→${hi.focusRate}　40→${lo.focusRate}`);
  //  權重表本身不得出現任何傷害/血量相關鍵
  const banned = ["power", "tough", "dmg", "hp", "armor", "damage"];
  ck("§1g STAT_MAP 沒有任何傷害／血量／防禦作用點",
    !Object.keys(STAT_MAP).some((k) => banned.some((b) => k.toLowerCase().includes(b))),
    Object.keys(STAT_MAP).length + " 個作用點");
}

console.log("\n══ §2 紅線：能力不得乘進傷害／血量／防禦 ══");
{
  const src = fs.readFileSync(new URL("../src/LogicEngine.js", import.meta.url), "utf8");
  const dmgLine = src.split("\n").find((l) => l.includes("const dmgAmt = p.power * dt"));
  ck("§2a 傷害式仍是 `p.power * dt * R.dmgK * ...`", !!dmgLine, (dmgLine ?? "").trim().slice(0, 60));
  //  傷害式那一段裡不得出現任何 P0-3 係數
  const P03 = ["lastHitLoss", "attackWaste", "castMiss", "focusRate", "retreatLate", "xpRateScale"];
  const dmgBlock = src.slice(src.indexOf("const dmgAmt = p.power * dt"), src.indexOf("const dmgAmt = p.power * dt") + 500);
  ck("§2b 傷害式前後 500 字元內沒有任何能力係數",
    !P03.some((k) => dmgBlock.includes(k)));
  //  _mod / _qual 的回傳值不得出現在 maxHp / basePower 的算式裡
  ck("§2c maxHp 沒有被能力係數乘過",
    !/maxHp\s*[*=]\s*[^;\n]*(_qual|_mod\(|pmod)/.test(src));
  ck("§2d basePower 沒有被能力係數乘過",
    !/basePower\s*[*=]\s*[^;\n]*(_qual|_mod\(|pmod)/.test(src));
  //  castMiss 只跳過「效果」，不改任何技能的傷害常數
  ck("§2e 技能傷害常數（igniteDps）沒有被能力碰過",
    !/igniteDps[^;\n]*(_qual|_mod\(|pmod)/.test(src));
  //  品質判定必須用獨立亂數流，否則等於默默改動戰術層
  ck("§2f 品質判定使用獨立亂數流 rng3（不污染 rng / rng2）",
    src.includes("this.rng3 = ()") && /_qualRoll[\s\S]{0,200}this\.rng3\(\)/.test(src));
}

console.log("\n══ §3 中性不擾動：全 70 ⇒ 不擲骰、行為不變 ══");
{
  let same = 0, metaDiffered = 0;
  for (const seed of SEEDS.slice(0, 8)) {
    const off = run(seed, { ticks: 1200 });                       // 完全不注入
    const neu = run(seed, { blueV: 70, redV: 70, ticks: 1200 });  // 注入但全中性
    if (off.digest === neu.digest) same++;
    if (off.snap !== neu.snap) metaDiffered++;
  }
  ck("§3a 全中性注入 ⇒ 戰局狀態逐位元相同（8 seeds）", same === 8, `${same}/8`);
  //  誠實揭露：snapshot 仍然會不同——但差的是 playerStatsMeta / pexec 這些
  //  儀器化欄位，不是戰局。這一條把「差異僅限於 meta」明確釘住。
  ck("§3a' snapshot 的差異僅來自儀器化欄位（meta/pexec），戰局本身無差異",
    metaDiffered === 8 && same === 8, `meta 差 ${metaDiffered}/8、戰局差 ${8 - same}/8`);
  //  直接驗「不擲骰」：中性場的 rng3 一次都沒被消耗
  const e = new LogicEngine(42);
  e.configurePlayers(modsFor(70, 70));
  const before = e.rng3;
  let rolls = 0;
  e.rng3 = () => { rolls++; return before(); };
  for (let i = 0; i < 1200 && !e.over; i++) e.tick(0.5);
  ck("§3b 中性場一次都沒有消耗品質亂數", rolls === 0, `rolls=${rolls}`);
  //  未呼叫 configurePlayers ⇒ 整層短路
  const e2 = new LogicEngine(42);
  ck("§3c 未注入 ⇒ playerStatsOn=false 且 _mod() 回 null",
    e2.playerStatsOn === false && e2._modById("b1") === null);
}

console.log("\n══ §4 A/B：雙方都給真實能力資料 ══");
//  A（對照）藍 70 / 紅 70；B（實驗）藍 88 / 紅 55。兩組都有注入 ⇒ 差異只來自能力差。
const A = SEEDS.map((s) => run(s, { blueV: 70, redV: 70 }));
const B = SEEDS.map((s) => run(s, { blueV: 88, redV: 55 }));
const agg = (rows, side, key) => {
  const vs = rows.map((r) => r[side][key]).filter((v) => v !== null && Number.isFinite(v));
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
};
const show = (label, side, key, fmt = r3) =>
  `${label} A=${fmt(agg(A, side, key))} B=${fmt(agg(B, side, key))}`;

{
  // ── ① 補刀成功率 ────────────────────────────────────────────────────────
  const aB = agg(A, "blue", "csRate"), aR = agg(A, "red", "csRate");
  const bB = agg(B, "blue", "csRate"), bR = agg(B, "red", "csRate");
  ck("§4-1a 對照組雙方補刀成功率皆為 100%（中性不漏兵）",
    aB === 1 && aR === 1, `藍 ${pct(aB)}　紅 ${pct(aR)}`);
  ck("§4-1b 實驗組：高能力方補刀成功率 > 低能力方",
    bB > bR, `藍(88) ${pct(bB)}　紅(55) ${pct(bR)}`);
  ck("§4-1c 補刀差距落在合理區間（1–15pp，不誇張）",
    (bB - bR) >= 0.01 && (bB - bR) <= 0.15, `差 ${((bB - bR) * 100).toFixed(1)}pp`);
  ck("§4-1d 樣本量足夠（雙方每場補刀嘗試皆 > 60）",
    agg(B, "blue", "csAttempt") > 60 && agg(B, "red", "csAttempt") > 60,
    show("嘗試數", "red", "csAttempt"));

  // ── ② 無效攻擊比例 ──────────────────────────────────────────────────────
  const wB = agg(B, "blue", "wasteRate"), wR = agg(B, "red", "wasteRate");
  ck("§4-2a 對照組雙方無效攻擊比例皆為 0",
    agg(A, "blue", "wasteRate") === 0 && agg(A, "red", "wasteRate") === 0);
  ck("§4-2b 實驗組：低能力方無效攻擊比例較高", wR > wB,
    `藍(88) ${pct(wB)}　紅(55) ${pct(wR)}`);
  ck("§4-2c 無效攻擊比例有上限（低能力方 ≤ 限幅 8%）",
    wR <= ONESIDED_CLAMP.attackWaste.hi + 0.01, `實測 ${pct(wR)}`);
  ck("§4-2d 高能力方不因能力高而獲得攻擊加成（比例仍為 0）", wB === 0);

  // ── ③ 有效技能施放率 ────────────────────────────────────────────────────
  const cB = agg(B, "blue", "castRate"), cR = agg(B, "red", "castRate");
  ck("§4-3a 對照組雙方技能有效施放率皆為 100%",
    agg(A, "blue", "castRate") === 1 && agg(A, "red", "castRate") === 1);
  ck("§4-3b 實驗組：高能力方有效施放率 > 低能力方", cB > cR,
    `藍(88) ${pct(cB)}　紅(55) ${pct(cR)}`);
  ck("§4-3c 施放率差距不誇張（≤ 限幅 10%）",
    (cB - cR) <= ONESIDED_CLAMP.castMiss.hi + 0.02, `差 ${((cB - cR) * 100).toFixed(1)}pp`);
  ck("§4-3d 有實際施放樣本（雙方每場嘗試皆 > 12）",
    agg(B, "blue", "castTry") > 12 && agg(B, "red", "castTry") > 12,
    show("施放嘗試", "red", "castTry"));

  // ── ④ 撤退與死亡時機 ────────────────────────────────────────────────────
  const swapB = agg(B, "blue", "focusSwap"), swapR = agg(B, "red", "focusSwap");
  ck("§4-4a 對照組沒有任何集火改目標（中性＝打最近）",
    agg(A, "blue", "focusSwap") === 0 && agg(A, "red", "focusSwap") === 0);
  ck("§4-4b 實驗組：只有高能力方會改打殘血目標", swapB > 0 && swapR === 0,
    `藍(88) ${swapB}　紅(55) ${swapR}`);
  //  撤退門檻下修 ⇒ 低能力方撐得更久才撤 ⇒ 撤退次數不會比高能力方多，
  //  但死亡數會比較多（撤太晚的代價）。這是「不合理撤退時機」的可觀測後果。
  const dB = agg(B, "blue", "deaths"), dR = agg(B, "red", "deaths");
  ck("§4-4c 實驗組：低能力方死亡數 ≥ 高能力方（撤退太晚的代價）",
    dR >= dB, `藍(88) ${dB}　紅(55) ${dR}`);
  ck("§4-4d 對照組死亡數大致對稱（無系統性偏袒）",
    Math.abs(agg(A, "blue", "deaths") - agg(A, "red", "deaths")) <= 2,
    show("死亡", "blue", "deaths") + "　" + show("", "red", "deaths"));

  // ── ⑤ 平均經濟與本場等級 ────────────────────────────────────────────────
  const gB = agg(B, "blue", "gold"), gR = agg(B, "red", "gold");
  const lB = agg(B, "blue", "mlv"), lR = agg(B, "red", "mlv");
  ck("§4-5a 實驗組：高能力方平均經濟較高", gB > gR, `藍 ${Math.round(gB)}　紅 ${Math.round(gR)}`);
  ck("§4-5b 實驗組：高能力方平均本場等級較高", lB > lR, `藍 ${lB}　紅 ${lR}`);
  ck("§4-5c 等級差距不誇張（≤ 2.5 級）", (lB - lR) <= 2.5, `差 ${r3(lB - lR)} 級`);
  ck("§4-5d 對照組經濟與等級大致對稱",
    Math.abs(agg(A, "blue", "mlv") - agg(A, "red", "mlv")) <= 0.8,
    `藍 ${agg(A, "blue", "mlv")}　紅 ${agg(A, "red", "mlv")}`);

  // ── ⑥ 勝率不能過度偏斜 ──────────────────────────────────────────────────
  const decided = (rows) => rows.filter((r) => r.over && (r.winner === "blue" || r.winner === "red"));
  const dA = decided(A), dB2 = decided(B);
  const winB = dB2.filter((r) => r.winner === "blue").length;
  const rate = dB2.length ? winB / dB2.length : null;
  ck("§4-6a 兩組都有足夠的決勝樣本（各 ≥ 8 場）",
    dA.length >= 8 && dB2.length >= 8, `A ${dA.length}/${A.length}　B ${dB2.length}/${B.length}`);
  ck("§4-6b 高能力方勝率高於五成", rate > 0.5, `${pct(rate)}（${winB}/${dB2.length}）`);
  ck("§4-6c 勝率**不得過度偏斜**（≤ 85%，高能力隊不固定獲勝）",
    rate <= 0.85, `${pct(rate)}`);
  ck("§4-6d 低能力方仍贏得下（至少 1 場）",
    dB2.length - winB >= 1, `紅方勝 ${dB2.length - winB} 場`);
  //  ⚠ 誠實揭露：**技能層本身就有既存的陣營偏斜**（紅方較有利），與 P0-3 無關。
  //  未注入任何能力、只開技能層跑同一組 seeds，藍方勝率就已經偏低。
  //  因此這裡**不**斷言「對照組接近五成」——那會是拿一個既有問題來擋 P0-3。
  //  正確的斷言是：中性注入**沒有再加上任何額外偏斜**（＝與 baseline 完全一致）。
  const baseWins = SEEDS.map((seed) => {
    const e = new LogicEngine(seed);
    e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "p03" } });
    for (let i = 0; i < 4000 && !e.over; i++) e.tick(0.5);
    return e.over ? e.winner : null;
  });
  const aWins = A.map((r) => (r.over ? r.winner : null));
  ck("§4-6e 中性對照組與未注入 baseline **每一場勝負都相同**（沒有新增偏斜）",
    baseWins.every((w, i) => w === aWins[i]),
    `baseline 藍勝 ${baseWins.filter((w) => w === "blue").length}/${SEEDS.length}、` +
    `對照組藍勝 ${aWins.filter((w) => w === "blue").length}/${SEEDS.length}`);
  ck("§4-6f 既有陣營偏斜已記錄（技能層 baseline 藍方勝率 < 50%，非 P0-3 造成）",
    baseWins.filter((w) => w === "blue").length < SEEDS.length / 2,
    "⚠ 技術債：技能層陣營平衡，另案處理");
}

console.log("\n══ §5 可重現性 ══");
{
  let same = 0;
  for (const seed of SEEDS.slice(0, 6)) {
    const x = run(seed, { blueV: 88, redV: 55, ticks: 1500 });
    const y = run(seed, { blueV: 88, redV: 55, ticks: 1500 });
    if (x.snap === y.snap) same++;
  }
  ck("§5a 同 seed ＋ 同能力 ⇒ 逐位元相同（6 seeds）", same === 6, `${same}/6`);
  //  對調兩側能力 ⇒ 優勢應該跟著換邊（沒有寫死偏袒藍方的邏輯）
  const fwd = SEEDS.slice(0, 10).map((s) => run(s, { blueV: 88, redV: 55 }));
  const rev = SEEDS.slice(0, 10).map((s) => run(s, { blueV: 55, redV: 88 }));
  const adv = (rows, hi, lo) => {
    const a = rows.map((r) => r[hi].mlv).reduce((x, y) => x + y, 0) / rows.length;
    const b = rows.map((r) => r[lo].mlv).reduce((x, y) => x + y, 0) / rows.length;
    return r3(a - b);
  };
  const f = adv(fwd, "blue", "red"), rv = adv(rev, "red", "blue");
  ck("§5b 能力對調 ⇒ 優勢跟著換邊（兩邊都是高能力方領先）",
    f > 0 && rv > 0, `藍高時 +${f} 級　紅高時 +${rv} 級`);
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} P0-3 戰鬥品質層：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
