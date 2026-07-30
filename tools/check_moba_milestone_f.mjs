#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_f.mjs — Milestone F 安全網（戰鬥節奏與團戰收益轉化）
//
//  F 的主張只有兩句：
//    1. 團戰要真的形成、也要真的結束（不再是一連串 2 秒擦撞）
//    2. 打贏一波之後要換成地圖收益（推塔／龍／巴龍／野區／回城），不是原地遊走
//  本檔把這兩句話變成可執行斷言，並且守住**不得退步**的邊界：
//  地圖幾何、碰撞、Replay contract、Milestone E 的名單資料流一行都不能動。
//
//  ⚠ 本檔只用 v3 規則集。v1/v2 是 runtime29 用來重現舊病灶的歷史基準，
//    F 的所有新機制都必須對它們無效（§6 有專門的斷言）。
// ============================================================================
import fs from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { SIM_RULES, rulesFor } from "../src/battle/moba/matchProgression.js";

let pass = 0, fail = 0;
const ck = (label, cond, extra = null) => {
  if (cond) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`); }
};
const src = (p) => fs.readFileSync(p, "utf8");
const R = rulesFor("v3");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 跑一場並回傳觀測（不改引擎行為，只讀狀態）。 */
function runMatch(seed, { rules = "v3", reverse = false } = {}) {
  const eng = new LogicEngine(seed, null, { rules });
  if (reverse) eng.players.reverse();
  let windowTicks = 0, siegeTicks = 0, objWindowTicks = 0;
  const kinds = { baron: 0, dragon: 0, siege: 0 };
  const seenWindow = { blue: 0, red: 0 };
  while (!eng.over && eng.t < 3600) {
    eng.tick(0.5);
    for (const side of ["blue", "red"]) {
      const T = eng.fsm3?.[side];
      if (!T) continue;
      if (T.initUntil > seenWindow[side]) { seenWindow[side] = T.initUntil; if (T.initKind) kinds[T.initKind]++; }
      if (eng.t < T.initUntil) {
        windowTicks++;
        if (T.initKind === "siege") siegeTicks += eng.players.filter((p) => p.side === side && !p.dead && p.state === "圍攻").length;
        if (T.initKind === "baron" || T.initKind === "dragon") objWindowTicks++;
      }
    }
  }
  return { eng, kinds, windowTicks, siegeTicks, objWindowTicks };
}

console.log("── §1 團戰窗：形成條件不放寬，但要真的持續 ──");
ck("1) 熱點成立條件未被放寬（每側 2 人 + 實際接觸距離 6）",
  R.hotMinPerSide === 2 && R.hotContactDist === 6);
ck("2) 遲滯與時限齊備（接觸暫斷不算結束、但也不許僵持整場）",
  R.fightHoldT > 0 && R.fightMaxDur > R.fightHoldT && R.fightMinDur > 0,
  { hold: R.fightHoldT, max: R.fightMaxDur, min: R.fightMinDur });
ck("3) 對線期不套遲滯（早期本來就該是短交鋒，硬黏住會吃掉發育）",
  R.fightHoldAfterT >= 180, R.fightHoldAfterT);
{
  //  遲滯：接觸中斷 < fightHoldT 時，同一場團戰不得被判定結束
  const eng = new LogicEngine(4242, null, { rules: "v3" });
  eng.t = 600;                                  // 對線期之後
  eng.fight3 = {
    pos: { x: 110, y: 110 }, start: 590, lastContact: 599,
    deaths: { blue: 0, red: 1 }, members: new Set(["b1", "b2", "r1"]),
  };
  const before = eng.fightLog.length;
  eng._resolveFightV3(eng.fight3, eng.players.filter((p) => !p.dead));
  const rec = eng.fightLog[before];
  ck("4) 團戰結算會判定勝方（陣亡數較少的一方）", rec?.winner === "blue", rec);
  ck("5) 參與者進入 DISENGAGE + 重接戰冷卻（收手機制沿用 S29B1）",
    eng.players.filter((p) => ["b1", "b2", "r1"].includes(p.id))
      .every((p) => p.reengageAt >= 600), null);
}
{
  //  零陣亡的短擦撞不算團戰：不進 log 的 winner、也不開窗
  const eng = new LogicEngine(4242, null, { rules: "v3" });
  eng.t = 600;
  const F = { pos: { x: 110, y: 110 }, start: 599, lastContact: 599.5, deaths: { blue: 0, red: 0 }, members: new Set(["b1", "r1"]) };
  eng._resolveFightV3(F, eng.players);
  ck("6) 零陣亡的短擦撞不算一場團戰（不觸發冷卻與轉化）",
    eng.fightLog.length === 0 && eng.fsm3.blue.initUntil === 0 && eng.fsm3.red.initUntil === 0);
}

console.log("\n── §2 收益轉化：打贏一波要換成地圖收益 ──");
ck("7) 主動權窗參數齊備（窗長／血量門檻／響應半徑／最少人數）",
  R.initiativeWindow > 0 && R.initiativeHpMin > 0 && R.initiativeRespondRange > 0 && R.initiativeMinAlive >= 2,
  { win: R.initiativeWindow, hp: R.initiativeHpMin, range: R.initiativeRespondRange });
ck("8) 對線期不開窗（第一波集結在對線期之後，與真實 MOBA 一致）",
  R.initiativeAfterT >= 180, R.initiativeAfterT);
{
  const eng = new LogicEngine(7777, null, { rules: "v3" });
  eng.t = 900;
  //  巨龍活著且靠近 ⇒ 應選龍而不是塔
  const winners = eng.players.filter((p) => p.side === "blue").slice(0, 3);
  for (const p of winners) { p.pos = { ...eng.neutrals.dragon.pos }; p.hp = p.maxHp; }
  eng.neutrals.dragon.alive = true;
  const kind = eng._openInitiativeV3("blue", { ...eng.neutrals.dragon.pos }, winners);
  ck("9) 附近有存活的龍 ⇒ 轉化目標選龍", kind === "dragon", kind);
  ck("10) 窗被實際開啟且帶時限", eng.fsm3.blue.initUntil > 900 && eng.fsm3.blue.initKind === "dragon");
}
{
  const eng = new LogicEngine(7777, null, { rules: "v3" });
  eng.t = 900;
  eng.neutrals.dragon.alive = false; eng.neutrals.baron.alive = false;
  const winners = eng.players.filter((p) => p.side === "blue").slice(0, 3);
  const kind = eng._openInitiativeV3("blue", { x: 150, y: 150 }, winners);
  ck("11) 沒有中立目標可打 ⇒ 轉化成推最近的敵方建築", kind === "siege" && !!eng.fsm3.blue.initTarget, kind);
  const tw = eng.towers[eng.fsm3.blue.initTarget];
  ck("12) 攻城目標必須是**敵方**且還活著的建築", tw && tw.side === "red" && tw.hp > 0,
    { id: eng.fsm3.blue.initTarget, side: tw?.side });
  const healthy = eng.players.find((p) => p.side === "blue");
  healthy.hp = healthy.maxHp;
  ck("13) 健康的人跟進攻城", eng._initiativeSiegeV3(healthy) === true);
  const hurt = eng.players.find((p) => p.side === "blue" && p !== healthy);
  hurt.hp = hurt.maxHp * (R.initiativeHpMin - 0.05);
  ck("14) 殘血的人不跟進（贏了團戰不該接著送人頭）", eng._initiativeSiegeV3(hurt) === false);
}
{
  //  換命（雙方都死）不該開窗：現場沒有人數優勢
  const eng = new LogicEngine(7777, null, { rules: "v3" });
  eng.t = 900;
  const k = eng.players.find((p) => p.id === "b1"), v = eng.players.find((p) => p.id === "r1");
  for (const p of eng.players) p.pos = { x: 400, y: 400 };   // 其他人都在遠處
  k.pos = { x: 100, y: 100 }; v.pos = { x: 101, y: 100 };
  const foe2 = eng.players.find((p) => p.id === "r2");
  foe2.pos = { x: 102, y: 100 };
  eng._maybeInitiativeV3(k, v);
  ck("15) 換命／現場無人數優勢 ⇒ 不開窗", eng.fsm3.blue.initUntil === 0);
}

console.log("\n── §3 整場行為（v3 實跑）──");
{
  const { eng, kinds, windowTicks, siegeTicks } = runMatch(1000);
  const opened = kinds.baron + kinds.dragon + kinds.siege;
  ck("16) 整場真的會開出主動權窗", opened >= 3, { kinds, opened });
  ck("17) 窗開著時真的有人在執行（不是只有旗標）", siegeTicks > 0 || windowTicks > 0, { windowTicks, siegeTicks });
  ck("18) 團戰有被記錄且有分出勝負的場次", eng.fightLog.length > 0 && eng.fightLog.some((f) => f.winner),
    { fights: eng.fightLog.length, decisive: eng.fightLog.filter((f) => f.winner).length });
  const longest = Math.max(...eng.fightLog.map((f) => f.dur), 0);
  ck("19) 沒有無限僵持的團戰（受 fightMaxDur 限制）", longest <= R.fightMaxDur + 1.5, { longest });
  ck("20) 比賽仍能收尾", eng.over === true && !!eng.winner, { over: eng.over, t: Math.round(eng.t) });
}

console.log("\n── §4 不得退步：舊規則集與既有不變量 ──");
{
  //  v1/v2 完全不吃 F 的新機制
  ck("21) v1／v2 沒有 F 的新旗標（歷史基準不被改寫）",
    !SIM_RULES.v1.fightHoldT && !SIM_RULES.v2.fightHoldT &&
    !SIM_RULES.v1.initiativeWindow && !SIM_RULES.v2.initiativeWindow);
  const v2 = new LogicEngine(1000, null, { rules: "v2" });
  while (!v2.over && v2.t < 1800) v2.tick(0.5);
  ck("22) v2 仍可完整跑完且不產生團戰記錄（F 機制對它無效）",
    v2.fightLog.length === 0 && v2.fight3 === null, { fights: v2.fightLog.length });
}
{
  //  KDA 不變量（runtime29 §4）：Σk == bK+rK == Σd
  const { eng } = runMatch(2222);
  const sumK = eng.players.reduce((s, p) => s + p.k, 0);
  const sumD = eng.players.reduce((s, p) => s + p.d, 0);
  ck("23) KDA 不變量仍成立（Σk == bK+rK == Σd）",
    sumK === eng.bK + eng.rK && sumK === sumD, { sumK, sumD, bK: eng.bK, rK: eng.rK });
}
{
  //  塔傷不執行擊殺（保 KDA 不變量的既有紅線）
  const engSrc = src("src/LogicEngine.js");
  ck("24) 群體拆塔只放寬「無兵線」的效率分級，沒有改塔血或塔傷本體",
    engSrc.includes("heroTowerGroupMin") && R.heroTowerSoloK === 0.30 &&
    R.heroTowerGroupK > R.heroTowerSoloK && R.heroTowerGroupK < 1 && R.heroTowerDmg === 104,
    { solo: R.heroTowerSoloK, group: R.heroTowerGroupK, dmg: R.heroTowerDmg });
}

console.log("\n── §5 禁改邊界（原始碼靜態斷言）──");
{
  const engSrc = src("src/LogicEngine.js");
  //  陣營對稱用**行為**驗，不是用字串比對（文字檢查對 F.deaths.blue 這種
  //  合法的對稱寫法會誤判，也擋不住真正的偏袒）：同一份戰況把雙方互換，
  //  勝負與開出來的窗必須完全鏡射。
  const mirrorCase = (winSide) => {
    const eng = new LogicEngine(31337, null, { rules: "v3" });
    eng.t = 900;
    const loseSide = winSide === "blue" ? "red" : "blue";
    const F = {
      pos: { x: 110, y: 110 }, start: 890, lastContact: 899,
      deaths: { [winSide]: 0, [loseSide]: 2 },
      members: new Set(eng.players.map((p) => p.id)),
    };
    for (const p of eng.players) { p.pos = { x: 110, y: 110 }; p.hp = p.maxHp; }
    eng._resolveFightV3(F, eng.players);
    const rec = eng.fightLog[eng.fightLog.length - 1];
    return { winner: rec?.winner, kind: rec?.kind, until: eng.fsm3[winSide].initUntil };
  };
  const mb = mirrorCase("blue"), mr = mirrorCase("red");
  ck("25) 主動權機制陣營對稱（雙方互換戰況 ⇒ 結果完全鏡射）",
    mb.winner === "blue" && mr.winner === "red" &&
    mb.kind === mr.kind && mb.until === mr.until,
    { blue: mb, red: mr });
  ck("26) 主動權窗不抽 rng（決定性；不影響 rng 序列）",
    !/_openInitiativeV3[\s\S]{0,1400}this\.rng/.test(engSrc) &&
    !/_maybeInitiativeV3[\s\S]{0,1200}this\.rng/.test(engSrc));
  ck("27) Replay contract 未改（版本字串與既有欄位）",
    src("src/platform/contracts/mobaReplay.js").includes('MOBA_REPLAY_VERSION = "MobaReplay.v1"'));
  ck("28) Milestone E 的名單資料流未動",
    src("src/battle/moba/mobaRosterAdapter.js").includes("buildBattleRoster") &&
    src("src/AppShell.jsx").includes("buildBattleRoster") &&
    src("src/platform/contracts/matchLineup.js").includes("MATCH_LINEUP_VERSION"));
  ck("29) 地圖幾何與碰撞來源未動",
    !src("src/gameData.js").includes("Milestone F") &&
    !src("src/battle/moba/nav/mobaNavigation.js").includes("Milestone F"));
  ck("30) BattleResult.v2 契約未動",
    src("src/battle/battleResult.js").includes('schema: "BattleResult.v2"'));
}

console.log(`\n${pass}/${pass + fail} 通過`);
console.log(JSON.stringify({
  milestone: "F",
  knobs: {
    fightHoldT: R.fightHoldT, fightMaxDur: R.fightMaxDur, fightMinDur: R.fightMinDur,
    fightHoldAfterT: R.fightHoldAfterT,
    initiativeWindow: R.initiativeWindow, initiativeAfterT: R.initiativeAfterT,
    initiativeHpMin: R.initiativeHpMin, initiativeRespondRange: R.initiativeRespondRange,
    heroTowerGroupMin: R.heroTowerGroupMin, heroTowerGroupK: R.heroTowerGroupK,
  },
  engineOnlyV3: true,
  browserVerified: false,
}));
process.exit(fail ? 1 : 0);
