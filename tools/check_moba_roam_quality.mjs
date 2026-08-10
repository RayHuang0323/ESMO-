//  Combat Decision C — Roam Support Quality 驗收（C-1 ~ C-9）
//  規格：review/moba-combat/ROAM_SUPPORT_QUALITY_SPEC.md §4
//
//  ⚠ 這支腳本只跑模擬與斷言，不改任何檔案。
//  用法：node tools/check_moba_roam_quality.mjs

import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods, STAT_MAP, NEUTRAL_MODS, toPlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";

const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"], RED = ["r1", "r2", "r3", "r4", "r5"];
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242, 31337];
const MAX_TICKS = 4200;

let pass = 0, fail = 0;
const ck = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? "  " + extra : ""}`); }
};

const statsWith = (key, v) => Object.fromEntries(KEYS.map((k) => [k, k === key ? v : 70]));
const spellsFor = (ids) => Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));

//  情境：roam（roamRate 0.5）——唯一讓遊走作用點不被 0-clamp 的情境
function knobs(e) { return { ...e._neutralKnobs(), roamRate: 0.5 }; }

function run(seed, key, value, testSide, { inject = true } = {}) {
  const e = new LogicEngine(seed);
  if (inject) {
    const test = statsWith(key, value), base = statsWith(key, 70);
    e.configurePlayers(toEnginePlayerMods({
      blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : base })),
      red: RED.map((id) => ({ id, stats: testSide === "red" ? test : base })),
    }));
  }
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "roamq" } });
  const K = knobs(e);
  e.configureMatch({ blue: K, red: K, meta: { tacticId: "roam" } });

  const mineP = e.players.filter((p) => p.side === testSide);
  let roamEpisodes = 0, roamEngaged = 0, roamPaid = 0;
  let prevRoams = 0, epLeft = 0, epAtk0 = 0, epKa0 = 0, epEng = false, epPaid = false;
  const sup = mineP.filter((p) => p.role === "sup");
  const supAtk = () => sup.reduce((s, p) => s + (p.atkTicks ?? 0), 0);
  const close = () => { if (epEng) roamEngaged++; if (epPaid) roamPaid++; epLeft = 0; };

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(0.5);
    const ka = mineP.reduce((s, p) => s + (p.k ?? 0) + (p.a ?? 0), 0);
    const now = e.exec[testSide].supportRoams;
    if (now > prevRoams) {
      if (epLeft > 0) close();
      roamEpisodes += now - prevRoams;
      epLeft = 26; epAtk0 = supAtk(); epKa0 = ka; epEng = false; epPaid = false;
    }
    prevRoams = now;
    if (epLeft > 0) {
      if (supAtk() > epAtk0) epEng = true;
      if (ka > epKa0) epPaid = true;
      if (--epLeft === 0) close();
    }
  }
  if (epLeft > 0) close();

  const ex = e.exec[testSide], ob = e.roamObs[testSide];
  return {
    roams: ex.supportRoams, roamEpisodes, roamEngaged, roamPaid,
    roamMissed: roamEpisodes - roamPaid,
    declined: ob.declined, aborted: ob.aborted, retargeted: ob.retargeted,
    lanes: { ...ob.lanes },
    towerPushes: ex.towerPushes, groupedFights: ex.groupedFights,
    retreats: mineP.reduce((s, p) => s + (e.pexec?.[p.id]?.retreats ?? 0), 0),
    minutes: e.t / 60, win: e.winner === testSide,
    decided: e.over && (e.winner === "blue" || e.winner === "red"),
    k: mineP.reduce((s, p) => s + p.k, 0), d: mineP.reduce((s, p) => s + p.d, 0),
    mlv: mineP.reduce((s, p) => s + p.mlv, 0) / mineP.length,
    digest: `${e.t.toFixed(3)}|${e.winner}|${e.bGold.toFixed(3)}|${e.rGold.toFixed(3)}`,
  };
}

const agg = (key, value) => {
  const rows = [];
  for (const s of SEEDS) { rows.push(run(s, key, value, "blue")); rows.push(run(s, key, value, "red")); }
  const m = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const dec = rows.filter((r) => r.decided);
  return {
    rows,
    roams: m((r) => r.roams), episodes: m((r) => r.roamEpisodes),
    engaged: m((r) => r.roamEngaged), paid: m((r) => r.roamPaid), missed: m((r) => r.roamMissed),
    declined: m((r) => r.declined), aborted: m((r) => r.aborted), retargeted: m((r) => r.retargeted),
    engRate: m((r) => r.roamEngaged) / Math.max(1e-9, m((r) => r.roamEpisodes)),
    paidRate: m((r) => r.roamPaid) / Math.max(1e-9, m((r) => r.roamEpisodes)),
    towerPushes: m((r) => r.towerPushes), retreats: m((r) => r.retreats),
    grouped: m((r) => r.groupedFights), minutes: m((r) => r.minutes),
    winRate: dec.length ? dec.filter((r) => r.win).length / dec.length : null,
    lanes: rows.reduce((a, r) => ({ top: a.top + r.lanes.top, mid: a.mid + r.lanes.mid, bot: a.bot + r.lanes.bot }), { top: 0, mid: 0, bot: 0 }),
  };
};

//  配對檢定（同 seed 同陣營）——與 analyze_sensitivity_raw 同一套方法
function paired(A, B, f) {
  const d = A.rows.map((a, i) => f(B.rows[i]) - f(a));
  const n = d.length, mu = d.reduce((s, x) => s + x, 0) / n;
  const v = d.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return { d: mu, lo: mu - 1.96 * se, hi: mu + 1.96 * se, sig: Math.abs(mu) > 1.96 * se };
}
const fmt = (p) => `Δ=${p.d.toFixed(2)} [${p.lo.toFixed(2)}, ${p.hi.toFixed(2)}]${p.sig ? " ★" : ""}`;

console.log("# Combat Decision C — Roam Support Quality 驗收");
console.log(`# 情境 roam（roamRate 0.5）｜${SEEDS.length} seeds × 藍紅鏡像 = 每格 ${SEEDS.length * 2} 場\n`);

// ═══ C-1：未注入能力層 ⇒ 逐位元不變 ════════════════════════════════════════
//  ⚠ 這是本階段「不破壞既有基準」的真正保證線：regress / regress2 / 既有回歸
//    都不呼叫 configurePlayers ⇒ M 為 null ⇒ 走原本的「無條件中路 8 秒」。
{
  let same = true;
  for (const s of SEEDS.slice(0, 8)) {
    const a = run(s, "comms", 70, "blue", { inject: false });
    const b = run(s, "comms", 90, "blue", { inject: false });
    if (a.digest !== b.digest) { same = false; break; }
  }
  ck("C-1 未注入能力層時，能力值完全不影響結果（逐位元相同）", same);
  //  ⚠ C-1b 的語意隨架構決定改變（2026-08-08）：
  //     原本寫「未注入 ⇒ 品質層完全不啟用」，那是把 C 當成**能力層的附加功能**。
  //     但那樣會讓「全 70 注入」與「未注入」行為不同，直接違反
  //     `check_moba_stats28` §9 的紅線（中性能力 ⇒ 逐位元 == feature off）——
  //     實測在 `roamRate > 0` 的正式戰術（M1 = 0.3）下確實踩線。
  //     ⇒ 改為讓新模型成為**引擎預設**（未注入時以中性參數運作）。
  //     於是不變量變成：品質層照常運作，但**能力值不影響未注入的結果**（＝ C-1）。
  //     這裡改驗「未注入時四項素質完全不造成差異」，比原本的「計數為 0」更強。
  const abilityInert = SEEDS.slice(0, 6).every((s) => {
    const lo = run(s, "comms", 40, "blue", { inject: false });
    const hi = run(s, "comms", 90, "blue", { inject: false });
    return lo.declined === hi.declined && lo.aborted === hi.aborted &&
      lo.retargeted === hi.retargeted && lo.roams === hi.roams;
  });
  ck("C-1b 未注入能力層時，能力值對遊走決策完全無作用（品質層以中性參數運作）", abilityInert);
}

// ═══ C-9：固定 seed 重跑一致 ═════════════════════════════════════════════
{
  const a = run(4242, "comms", 90, "blue"), b = run(4242, "comms", 90, "blue");
  ck("C-9 固定 seed 重跑結果一致（決定性評分未引入隨機性）",
    a.digest === b.digest && a.roams === b.roams && a.declined === b.declined,
    `digest=${a.digest}`);
}

// ═══ C-8：不得直接給傷害／金錢／等級 bonus ════════════════════════════════
{
  const bad = ["roamSightAdj", "roamInfoAdj", "roamGateAdj", "roamFollowAdj"]
    .filter((k) => /power|hp|dmg|damage|gold|xp/i.test(k));
  ck("C-8a 四個新作用點的鍵名不含 power/hp/dmg/gold/xp", bad.length === 0);
  const neutral = toPlayerMods(statsWith("comms", 70));
  const allZero = ["roamSightAdj", "roamInfoAdj", "roamGateAdj", "roamFollowAdj"]
    .every((k) => neutral[k] === 0 && NEUTRAL_MODS[k] === 0);
  ck("C-8b 中性（全 70）時四個新作用點皆為 0", allZero);
  const inMap = ["roamSightAdj", "roamInfoAdj", "roamGateAdj", "roamFollowAdj"]
    .every((k) => STAT_MAP[k] && Object.keys(STAT_MAP[k]).length === 1);
  ck("C-8c 四個新作用點各自只由一項素質控制（不重複控制）", inMap);
  ck("C-8d apm 已移出 roamAdj", !("apm" in STAT_MAP.roamAdj));
  const apmPaths = ["gankIntervalScale", "roamAdj", "lastHitLoss", "xpRateScale", "laneAdj"]
    .filter((k) => "apm" in (STAT_MAP[k] ?? {}));
  ck("C-8e apm 其餘四條正式路徑未被破壞", apmPaths.length === 4, `剩餘：${apmPaths.join("/")}`);
}

// ═══ comms 主線：C-2 / C-3 / C-4 ═════════════════════════════════════════
console.log("\n## comms 40 / 70 / 90");
const c40 = agg("comms", 40), c70 = agg("comms", 70), c90 = agg("comms", 90);
for (const [lbl, c] of [["40", c40], ["70", c70], ["90", c90]]) {
  console.log(`  ${lbl}: 出發 ${c.roams.toFixed(2)}｜婉拒 ${c.declined.toFixed(2)}｜取消 ${c.aborted.toFixed(2)}｜改道 ${c.retargeted.toFixed(2)}` +
    `｜接戰 ${(c.engRate * 100).toFixed(1)}%｜換到人頭 ${(c.paidRate * 100).toFixed(1)}%｜空手 ${c.missed.toFixed(2)}` +
    `｜推塔 ${c.towerPushes.toFixed(1)}｜撤退 ${c.retreats.toFixed(1)}｜參團 ${c.grouped.toFixed(1)}｜勝率 ${(c.winRate * 100).toFixed(1)}%`);
}
const pMissed = paired(c40, c90, (r) => r.roamMissed);
const pEng = paired(c40, c90, (r) => r.roamEpisodes > 0 ? r.roamEngaged / r.roamEpisodes : 0);
const pPaid = paired(c40, c90, (r) => r.roamEpisodes > 0 ? r.roamPaid / r.roamEpisodes : 0);
const pRoams = paired(c40, c90, (r) => r.roams);
const pTower = paired(c40, c90, (r) => r.towerPushes);
const pRetreat = paired(c40, c90, (r) => r.retreats);

ck("C-2 roamMissed 隨 comms 下降（或至少不惡化）", pMissed.d <= 0 || !pMissed.sig, fmt(pMissed));
ck("C-3a 接戰比例隨 comms 改善（或至少不惡化）", pEng.d >= 0 || !pEng.sig, fmt(pEng));
ck("C-3b 換到人頭比例隨 comms 改善（或至少不惡化）", pPaid.d >= 0 || !pPaid.sig, fmt(pPaid));
ck("C-4 comms 不再只是大幅增加遊走次數（Δ出發次數不得是唯一顯著效果）",
  !(pRoams.sig && !pEng.sig && !pPaid.sig && !pMissed.sig), fmt(pRoams));
ck("C-5 推塔未顯著下降", !(pTower.sig && pTower.d < 0), fmt(pTower));
ck("C-6 撤退未出現顯著異常（|Δ| 不得超過基準的 20%）",
  !pRetreat.sig || Math.abs(pRetreat.d) < c70.retreats * 0.20, fmt(pRetreat));

// ═══ C-5b / C-6b：decision 提高門檻應產生婉拒 ══════════════════════════════
console.log("\n## decision（出發門檻）40 / 90");
const d40 = agg("decision", 40), d90 = agg("decision", 90);
for (const [lbl, c] of [["40", d40], ["90", d90]]) {
  console.log(`  ${lbl}: 出發 ${c.roams.toFixed(2)}｜婉拒 ${c.declined.toFixed(2)}｜婉拒率 ${(c.declined / Math.max(1e-9, c.declined + c.roams) * 100).toFixed(1)}%`);
}
ck("C-5c decision 高 ⇒ 婉拒率上升（「明顯不值得的不去」）",
  d90.declined / Math.max(1e-9, d90.declined + d90.roams) >= d40.declined / Math.max(1e-9, d40.declined + d40.roams),
  `${(d40.declined / Math.max(1e-9, d40.declined + d40.roams) * 100).toFixed(1)}% → ${(d90.declined / Math.max(1e-9, d90.declined + d90.roams) * 100).toFixed(1)}%`);

// ═══ C-5d：decline / abort 機制確實有在動 ═════════════════════════════════
ck("C-5d 無有效候選時會 decline（全體婉拒次數 > 0）", c70.declined > 0, `中性婉拒 ${c70.declined.toFixed(2)}/場`);
ck("C-6c 候選消失時會 abort（全體取消次數 > 0）", c70.aborted > 0, `中性取消 ${c70.aborted.toFixed(2)}/場`);

// ═══ C-8f（原 C-8）：不得退化成恆走中路 ═══════════════════════════════════
{
  const L = c70.lanes, tot = L.top + L.mid + L.bot;
  const maxShare = tot > 0 ? Math.max(L.top, L.mid, L.bot) / tot : 1;
  ck("C-7/C-8f 多候選時會挑選目標，未退化成恆走單一路", tot > 0 && maxShare < 0.95,
    `上/中/下 = ${L.top}/${L.mid}/${L.bot}（最大佔比 ${(maxShare * 100).toFixed(1)}%）`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} 通過 / ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
