//  Combat Decision B — Teamfight Commitment 驗收（B′-1 ~ B′-10）
//  規格：review/moba-combat/TEAMFIGHT_COMMITMENT_SPEC.md §4
//
//  ⚠ 只跑模擬與斷言，不改任何檔案。
//  用法：node tools/check_moba_teamfight_commit.mjs

import { LogicEngine } from "../src/LogicEngine.js";
import { STAT_MAP, NEUTRAL_MODS, toPlayerMods, toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";

const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"], RED = ["r1", "r2", "r3", "r4", "r5"];
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242, 31337];
const MAX_TICKS = 4200;

let pass = 0, fail = 0;
const ck = (n, c, extra = "") => {
  if (c) { pass++; console.log(`✅ ${n}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${n}${extra ? "  " + extra : ""}`); }
};
const ref = (n, extra) => console.log(`ℹ️  ${n}  ${extra}`);   // 參考指標，不計入 gate

const statsWith = (k, v) => Object.fromEntries(KEYS.map((x) => [x, x === k ? v : 70]));
const spellsFor = (ids) => Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));

function run(seed, value, side, { inject = true } = {}) {
  const e = new LogicEngine(seed);
  if (inject) {
    const t = statsWith("synergy", value), b = statsWith("synergy", 70);
    e.configurePlayers(toEnginePlayerMods({
      blue: BLUE.map((id) => ({ id, stats: side === "blue" ? t : b })),
      red: RED.map((id) => ({ id, stats: side === "red" ? t : b })),
    }));
  }
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "tfc" } });
  const K = { ...e._neutralKnobs(), joinFight: 0.85, gankInterval: 28 };
  e.configureMatch({ blue: K, red: K, meta: { tacticId: "teamfight" } });
  for (let i = 0; i < MAX_TICKS && !e.over; i++) e.tick(0.5);

  const mine = e.players.filter((p) => p.side === side);
  const O = e.tfObs[side], ex = e.exec[side];
  const k = mine.reduce((s, p) => s + p.k, 0), d = mine.reduce((s, p) => s + p.d, 0);
  return {
    commit: O.commit, hold: O.hold, decline: O.decline, badCommit: O.badCommit,
    solo: O.soloEntry, entries: O.entries,
    grouped: ex.groupedFights, towerPushes: ex.towerPushes, roams: ex.supportRoams,
    retreats: mine.reduce((s, p) => s + (e.pexec?.[p.id]?.retreats ?? 0), 0),
    k, d, exchange: d > 0 ? k / d : null,
    win: e.winner === side, decided: e.over && (e.winner === "blue" || e.winner === "red"),
    digest: `${e.t.toFixed(6)}|${e.winner}|${e.bGold.toFixed(6)}|${e.rGold.toFixed(6)}`,
  };
}

const cell = (v) => {
  const rows = [];
  for (const s of SEEDS) { rows.push(run(s, v, "blue")); rows.push(run(s, v, "red")); }
  return rows;
};
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varS = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
//  配對檢定（同 seed 同陣營）——與 analyze_sensitivity_raw 同一套方法
function paired(A, B, f) {
  const d = A.map((a, i) => f(B[i]) - f(a)).filter((x) => Number.isFinite(x));
  const mu = mean(d), se = Math.sqrt(varS(d) / d.length);
  return { d: mu, lo: mu - 1.96 * se, hi: mu + 1.96 * se, sig: Math.abs(mu) > 1.96 * se };
}
const fmt = (p) => `Δ=${p.d.toFixed(3)} [${p.lo.toFixed(3)}, ${p.hi.toFixed(3)}]${p.sig ? " ★" : ""}`;

console.log("# Combat Decision B — Teamfight Commitment 驗收");
console.log(`# 情境 teamfight（joinFight 0.85）｜${SEEDS.length} seeds × 鏡像 = 每格 ${SEEDS.length * 2} 場\n`);

// ═══ B′-1：中性紅線 ═══════════════════════════════════════════════════════
{
  const st = statsWith("synergy", 70);
  ck("B′-1a 中性 mods 與 NEUTRAL_MODS 逐鍵逐序相同（stats28 §9 對順序敏感）",
    JSON.stringify(toPlayerMods(st)) === JSON.stringify(NEUTRAL_MODS));
  const same = SEEDS.slice(0, 8).every((s) => {
    const a = run(s, 40, "blue", { inject: false });
    const b = run(s, 90, "blue", { inject: false });
    return a.digest === b.digest;
  });
  ck("B′-1b 未注入能力層時，能力值完全不影響結果（引擎預設模型）", same);
  const inj = run(4242, 70, "blue"), off = run(4242, 70, "blue", { inject: false });
  ck("B′-1c 注入全 70 ⇒ 逐位元 == feature off", inj.digest === off.digest, inj.digest);
}

// ═══ B′-10：決定性 ════════════════════════════════════════════════════════
{
  const a = run(4242, 90, "blue"), b = run(4242, 90, "blue");
  ck("B′-10 固定 seed 重跑一致（不新增 rng 抽樣）",
    a.digest === b.digest && a.commit === b.commit && a.decline === b.decline);
  ck("B′-10b synergy 只掛在 commitAdj，且已移出 joinAdj",
    !("synergy" in STAT_MAP.joinAdj) &&
    STAT_MAP.commitAdj && Object.keys(STAT_MAP.commitAdj).length === 1 &&
    "synergy" in STAT_MAP.commitAdj);
  ck("B′-10c commitAdj 中性為 0（不給任何直接加成）",
    toPlayerMods(statsWith("synergy", 70)).commitAdj === 0 && NEUTRAL_MODS.commitAdj === 0);
}

const c40 = cell(40), c70 = cell(70), c90 = cell(90);
const show = (lbl, c) => console.log(
  `  ${lbl}: commit ${mean(c.map((r) => r.commit)).toFixed(2)}｜hold ${mean(c.map((r) => r.hold)).toFixed(2)}` +
  `｜decline ${mean(c.map((r) => r.decline)).toFixed(2)}｜不利投入率 ${(mean(c.map((r) => r.badCommit)) / Math.max(1e-9, mean(c.map((r) => r.commit))) * 100).toFixed(1)}%` +
  `｜團戰 ${mean(c.map((r) => r.grouped)).toFixed(2)}｜交換比 ${mean(c.map((r) => r.exchange).filter(Number.isFinite)).toFixed(3)}` +
  `｜死亡 ${mean(c.map((r) => r.d)).toFixed(2)}｜推塔 ${mean(c.map((r) => r.towerPushes)).toFixed(1)}`);
console.log("\n## synergy 40 / 70 / 90");
show("40", c40); show("70", c70); show("90", c90);
console.log("");

const pBad = paired(c40, c90, (r) => r.badCommit);
const pDecline = paired(c40, c90, (r) => r.decline);
const pHold = paired(c40, c90, (r) => r.hold);
const pGrouped = paired(c40, c90, (r) => r.grouped);
const pD = paired(c40, c90, (r) => r.d);
const pTower = paired(c40, c90, (r) => r.towerPushes);
const pRetreat = paired(c40, c90, (r) => r.retreats);
const pRoam = paired(c40, c90, (r) => r.roams);
const pEx = paired(c40, c90, (r) => r.exchange);
const pSolo = paired(c40, c90, (r) => r.solo);

ck("B′-2 團戰次數不被單調拉高（不得顯著上升）", !(pGrouped.sig && pGrouped.d > 0), fmt(pGrouped));
ck("B′-3 不利投入顯著下降（**核心目標**）", pBad.sig && pBad.d < 0, fmt(pBad));
ck("B′-3b decline 隨 synergy 顯著上升", pDecline.sig && pDecline.d > 0, fmt(pDecline));
ck("B′-3c hold 隨 synergy 顯著上升", pHold.sig && pHold.d > 0, fmt(pHold));
//  ⚠ B′-4 只要求「方向改善或至少無惡化證據」——不得寫成顯著改善。
ck("B′-4 交換比未惡化（方向改善或 CI 含 0；**不宣稱顯著改善**）",
  pEx.d >= 0 || !pEx.sig, fmt(pEx));
ck("B′-6 死亡不得隨 synergy 顯著上升（改動前為 +2.117 ★）", !(pD.sig && pD.d > 0), fmt(pD));
ck("B′-7 推塔不得顯著下降", !(pTower.sig && pTower.d < 0), fmt(pTower));
ck("B′-8 不污染 A：撤退不得顯著變化", !pRetreat.sig, fmt(pRetreat));
ck("B′-9 不污染 C：遊走不得顯著變化", !pRoam.sig, fmt(pRoam));

//  B′-5 已降級為參考指標（2026-08-08 決策）：實測 1.90/1.87/1.90 幾乎不動，
//  且診斷已證明進場本來就高度同步 ⇒ solo 進場不是本模型的病灶。
ref("B′-5（參考，非 gate）solo 進場", fmt(pSolo));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} 通過 / ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
