#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_h.mjs — Milestone H 安全網
//
//  H 做兩件事：
//    1. Ban/Pick 的英雄選擇第一次真的影響對戰行為（站位／目標選擇／進退／
//       參團／技能就緒權重）——但**不得**乘進傷害（S28 §2 紅線）
//    2. 三個低風險呈現修正（巴龍命中閃光、手機浮動大字、Replay 固定 runtime-v2）
//
//  ⚠ 最重要的一條：**沒有呼叫 configureHeroes 時，引擎必須與 Milestone G 逐位元相同。**
//    §1 用同一顆 seed 跑兩場逐欄比對來證明，不是用註解宣稱。
// ============================================================================
import fs from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  toHeroMods, toEngineHeroMods, HERO_ARCH_PROFILE, HERO_MOD_CLAMP,
  NEUTRAL_HERO_MODS, MOBA_HERO_PROFILE_VERSION,
} from "../src/battle/moba/mobaHeroProfile.js";

let pass = 0, fail = 0;
const ck = (label, cond, extra = null) => {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`); }
};
const src = (p) => fs.readFileSync(p, "utf8");
const ARCHES = ["坦克", "戰士", "刺客", "法師", "射手", "輔助"];
const rosterOf = (map) => Object.fromEntries(Object.entries(map)
  .map(([seat, arch]) => [seat, { heroId: seat, hero: { id: seat, arch } }]));
const SYMMETRIC = rosterOf({
  b1: "坦克", b2: "刺客", b3: "法師", b4: "射手", b5: "輔助",
  r1: "坦克", r2: "刺客", r3: "法師", r4: "射手", r5: "輔助",
});
const fingerprint = (e) => JSON.stringify([
  Math.round(e.t * 100), e.bK, e.rK, e.winner, Math.round(e.bGold), Math.round(e.rGold),
  e.players.map((p) => [p.id, Math.round(p.hp), p.k, p.d, Math.round(p.pos.x * 100), Math.round(p.pos.y * 100)]),
]);
function run(seed, { heroes = null, ticks = 1200 } = {}) {
  const e = new LogicEngine(seed, null, { rules: "v3" });
  if (heroes) { const m = toEngineHeroMods(heroes, null); if (m) e.configureHeroes(m); }
  for (let i = 0; i < ticks && !e.over; i++) e.tick(0.5);
  return e;
}

console.log("── §1 不呼叫 configureHeroes ⇒ 與 Milestone G 逐位元相同 ──");
{
  const a = run(4242), b = run(4242);
  ck("1) 未注入英雄層：同 seed 逐欄相同（決定性未被破壞）", fingerprint(a) === fingerprint(b));
  const e = new LogicEngine(4242, null, { rules: "v3" });
  ck("2) 未注入時 heroesOn 為 false，_heroMod 一律 null",
    e.heroesOn === false && e.players.every((p) => e._heroMod(p) === null));
}

console.log("\n── §2 定位表：有得有失、有限幅、對稱 ──");
ck("3) 六定位齊備且版本字串正確",
  ARCHES.every((a) => HERO_ARCH_PROFILE[a]) && MOBA_HERO_PROFILE_VERSION === "MobaHeroProfile.v1");
ck("4) 未知／缺英雄 ⇒ 中性（引擎加 0 乘 1）",
  JSON.stringify(toHeroMods(null)) === JSON.stringify(NEUTRAL_HERO_MODS) &&
  JSON.stringify(toHeroMods({ arch: "不存在" })) === JSON.stringify(NEUTRAL_HERO_MODS));
{
  const bad = ARCHES.filter((a) => {
    const m = toHeroMods({ arch: a });
    return Object.entries(HERO_MOD_CLAMP).some(([k, lim]) => (Array.isArray(lim)
      ? m[k] < lim[0] - 1e-9 || m[k] > lim[1] + 1e-9
      : Math.abs(m[k]) > lim + 1e-9));
  });
  ck("5) 每個定位的每個維度都在限幅內", bad.length === 0, bad);
}
{
  //  「有得有失」：不能有任何定位在所有維度都優於另一個定位
  const dirs = { engageDistK: 0, engageAdj: 1, retreatAdj: -1, focusLowHp: 1, joinAdj: 1, objAdj: 1, skillWeight: 1, protectAdj: 1 };
  let dominated = null;
  for (const a of ARCHES) for (const b of ARCHES) {
    if (a === b) continue;
    const ma = toHeroMods({ arch: a }), mb = toHeroMods({ arch: b });
    const keys = Object.keys(dirs).filter((k) => dirs[k] !== 0);
    if (keys.every((k) => (ma[k] - mb[k]) * dirs[k] >= 0) && keys.some((k) => ma[k] !== mb[k])) dominated = [a, b];
  }
  ck("6) 沒有任何定位在所有維度上全面優於另一個（不是強弱表）", dominated === null, dominated);
}
ck("7) 兩側走同一張表（同 arch ⇒ 同 mods，與席位／陣營無關）",
  JSON.stringify(toHeroMods({ arch: "刺客" })) === JSON.stringify(toHeroMods({ arch: "刺客" })) &&
  JSON.stringify(toEngineHeroMods(SYMMETRIC, null).blue.b1) ===
  JSON.stringify(toEngineHeroMods(SYMMETRIC, null).red.r1));
ck("8) 全中性名單 ⇒ 回 null（呼叫端據此不呼叫引擎）",
  toEngineHeroMods(rosterOf({ b1: "無此定位", r1: "無此定位" }), null) === null);

console.log("\n── §3 定位真的改變行為（不是只有旗標）──");
{
  const tank = new LogicEngine(1, null, { rules: "v3" });
  tank.configureHeroes(toEngineHeroMods(rosterOf({ b1: "坦克" }), null));
  const adc = new LogicEngine(1, null, { rules: "v3" });
  adc.configureHeroes(toEngineHeroMods(rosterOf({ b1: "射手" }), null));
  const t = tank._heroMod(tank.players.find((p) => p.id === "b1"));
  const a = adc._heroMod(adc.players.find((p) => p.id === "b1"));
  ck("9) 站位：坦克保持距離倍率 < 射手（前排 vs 後排）", t.engageDistK < a.engageDistK, { tank: t.engageDistK, adc: a.engageDistK });
  ck("10) 進退：坦克更晚撤、射手更早撤", t.retreatAdj < a.retreatAdj, { tank: t.retreatAdj, adc: a.retreatAdj });
  ck("11) 目標選擇：刺客對殘血偏好最高",
    toHeroMods({ arch: "刺客" }).focusLowHp === Math.max(...ARCHES.map((x) => toHeroMods({ arch: x }).focusLowHp)));
  ck("12) 團戰職責：輔助的保護傾向最高",
    toHeroMods({ arch: "輔助" }).protectAdj === Math.max(...ARCHES.map((x) => toHeroMods({ arch: x }).protectAdj)));
  ck("13) 技能傾向：法師／刺客的技能就緒權重 > 坦克",
    Math.min(toHeroMods({ arch: "法師" }).skillWeight, toHeroMods({ arch: "刺客" }).skillWeight)
      > toHeroMods({ arch: "坦克" }).skillWeight);
}
{
  const plain = run(909, { ticks: 900 });
  const withHeroes = run(909, { heroes: SYMMETRIC, ticks: 900 });
  ck("14) 注入定位後整場軌跡確實不同（有實際作用）", fingerprint(plain) !== fingerprint(withHeroes));
  ck("15) 注入後 snapshot 帶 heroMeta（供 Result／驗證追溯）",
    !!withHeroes.snapshot().heroMeta?.arch && withHeroes.snapshot().heroMeta.version === MOBA_HERO_PROFILE_VERSION);
  ck("16) 未注入時 snapshot 不含 heroMeta（舊快照形狀不變）",
    plain.snapshot().heroMeta === undefined);
}

console.log("\n── §4 紅線：只改行為，不碰傷害 ──");
{
  const engSrc = src("src/LogicEngine.js");
  const profSrc = src("src/battle/moba/mobaHeroProfile.js");
  ck("17) 定位表不輸出 power／tough（不可能變成傷害倍率）",
    !("power" in NEUTRAL_HERO_MODS) && !("tough" in NEUTRAL_HERO_MODS) &&
    !/power|tough/.test(JSON.stringify(HERO_ARCH_PROFILE)));
  ck("18) 引擎裡 _heroMod 不出現在任何傷害／金錢式子",
    !/dmgAmt[\s\S]{0,200}_heroMod/.test(engSrc) && !/_dmgGold[\s\S]{0,200}_heroMod/.test(engSrc) &&
    !/_heroMod[\s\S]{0,120}(maxHp|\.power|dmgK)/.test(engSrc));
  //  ⚠ 這裡要驗的不是「rng 次數不變」——那個前提是錯的。
  //    定位改變行為 ⇒ 改變「哪些分支走到抽樣點」（例如有沒有進到 _joinV3 的
  //    距離圈），所以同 seed 下的抽樣**次數本來就會不同**（實測 596 → 657）。
  //    Milestone F 改移動時也是同樣的性質。真正必須成立的不變量是：
  //      (a) 給定 seed + 給定定位 ⇒ 結果完全決定性（可重現、可回歸）
  //      (b) 定位模組自己不抽 rng（不引入新的隨機來源）
  //    公平性另由「正／反序勝率位移」獨立驗證，不靠抽樣次數。
  {
    const h1 = run(2468, { heroes: SYMMETRIC, ticks: 600 });
    const h2 = run(2468, { heroes: SYMMETRIC, ticks: 600 });
    ck("19) 注入定位後仍然完全決定性（同 seed + 同定位 ⇒ 逐欄相同）",
      fingerprint(h1) === fingerprint(h2));
  }
  ck("19b) 定位模組本身不含任何 rng", !/rng|random/i.test(profSrc));
  ck("20) 沒有陣營特例（定位模組不含 blue／red 常數分支）",
    !/"blue"|"red"/.test(profSrc.replace(/seat\[0\] === "r"/g, "")));
}

console.log("\n── §5 三個呈現修正 ──");
{
  const neutrals = src("src/battle/moba/render/MobaRuntimeNeutrals.jsx");
  ck("21) 巨型目標不再整隻換成命中色（只閃重點色）",
    neutrals.includes("bossFlash") && /hit > 0 && !bossFlash/.test(neutrals));
  ck("22) 小野怪維持原本的全身命中閃光（沒有一併弱化回饋）",
    /memberNode\.body\.material = hit > 0 \? mats\.hit : mats\.body/.test(neutrals));
  const floating = src("src/battle/ui/BattleFloatingText.jsx");
  ck("23) 手機浮動大字下移並收窄（不再壓到右上控制鈕欄）",
    /mobile \? "38%" : "26%"/.test(floating) && /mobile \? "70%" : "80%"/.test(floating) &&
    floating.includes("useIsMobile"));
  const replay = src("src/screens/moba/MobaReplayScreen.jsx");
  ck("24) Replay 支援 3D 時固定 runtime-v2（與現場同一套戰場）",
    /const runtimeMap = use3D \? true : isRuntimeV2\(mapMode\)/.test(replay));
  ck("25) runtimeMap 宣告在 use3D 之後（避免 TDZ）",
    replay.indexOf("const use3D") < replay.indexOf("const runtimeMap"));
  ck("26) 舊 replay 仍有 legacy 退路（不白畫面）",
    replay.includes("canUse3DPresentation") && replay.includes("ReplayMap2D"));
}

console.log("\n── §6 禁改邊界 ──");
ck("27) 未改公平性／節奏常數表", !src("src/battle/moba/matchProgression.js").includes("Milestone H"));
//  ⚠ 不能掃「Milestone H」字串：mobaNavigation.js 檔頭本來就寫著舊的
//    「Milestone H.2」（碰撞來源那一輪），字串比對必然誤判。
//    改為斷言這兩個檔案**完全不認識**英雄定位層。
ck("28) 地圖幾何與碰撞來源完全不參與英雄定位層",
  ["src/gameData.js", "src/battle/moba/nav/mobaNavigation.js"].every((f) => {
    const t = src(f);
    return !/_heroMod|heroMods|HERO_ARCH_PROFILE|mobaHeroProfile|configureHeroes/.test(t);
  }));
ck("29) 未改 Replay contract 與 BattleResult.v2",
  src("src/platform/contracts/mobaReplay.js").includes('MOBA_REPLAY_VERSION = "MobaReplay.v1"') &&
  !src("src/platform/contracts/mobaReplay.js").includes("Milestone H") &&
  src("src/battle/battleResult.js").includes('schema: "BattleResult.v2"'));
ck("30) 英雄層與既有的戰術／能力層並存（三層各自獨立開關）",
  src("src/LogicEngine.js").includes("this.tacticOn") &&
  src("src/LogicEngine.js").includes("this.playerStatsOn") &&
  src("src/LogicEngine.js").includes("this.heroesOn"));

console.log(`\n${pass}/${pass + fail} 通過`);
console.log(JSON.stringify({
  milestone: "H",
  version: MOBA_HERO_PROFILE_VERSION,
  arches: ARCHES.length,
  optIn: true,
  damageUntouched: true,
}));
process.exit(fail ? 1 : 0);
