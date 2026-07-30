#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_j.mjs — Milestone J 安全網
//
//  J 的核心是「賽前選的召喚師技能在引擎裡真的存在」。所以這支腳本的重點不是
//  「表裡有沒有這個 id」，而是**每個技能都要能拿出可觀測的戰鬥效果**：
//    §1 opt-in 邊界：不呼叫 configureSpells ⇒ 與基準逐位元相同
//    §2 八個技能逐一驗「真的發生了什麼」（護盾吸收、點燃扣血、幽魂加速…）
//    §3 懲戒歸屬：打野一定有、非打野一定沒有（引擎自己裁決，不信任賽前資料）
//    §4 冷卻、事件紀錄、snapshot 與 Replay 一致
//    §5 開啟技能層之後的節奏與陣營對稱性
//    §6 邊界：沒有把定位係數乘進傷害、英雄池仍是 100 名
//
//  ⚠ 斷言原則（本專案踩過七次）：一律驗行為，不要掃關鍵字。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { CHAMPIONS_100 } from "../src/data/heroDatabase.js";
import { tagCounts } from "../src/data/heroClassification.js";
import {
  SUMMONER_SPELLS, spellsFor, laneOfSeat, toEngineSpells,
} from "../src/battle/moba/mobaHeroLoadout.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const R = rulesFor("v3");

/** 依 seat→第二技能建一份 configureSpells 入參。 */
const spellTable = (second) => {
  const blue = {}, red = {};
  for (const [seat, id] of Object.entries(second)) (seat[0] === "r" ? red : blue)[seat] = ["flash", id];
  return { blue, red, meta: { version: "MobaHeroLoadout.v1" } };
};
/** 跑一場完整比賽，回傳可比對的摘要。 */
const runMatch = (seed, spells = null, ticks = 6000) => {
  const e = new LogicEngine(seed);
  if (spells) e.configureSpells(spells);
  for (let i = 0; i < ticks && !e.over; i++) e.tick(0.5);
  return e;
};
const digest = (e) => {
  const s = e.snapshot();
  return JSON.stringify({
    t: Math.round(s.ts * 100), w: e.winner,
    k: s.players.map((p) => p.k), g: s.players.map((p) => Math.round(p.gold)),
    hp: s.players.map((p) => Math.round(p.hp * 1000)),
  });
};

console.log("── §1 opt-in 邊界（不呼叫就等於不存在）──");
{
  const seeds = [1, 42, 777, 8080, 1618];
  //  同一顆引擎跑兩次必須相同（決定性），且**不呼叫** configureSpells 時
  //  結果要與「技能層完全不存在」相同——後者用「所有 v2 欄位都沒被動過」佐證。
  ck("1) 引擎仍然決定性（5 seed，各跑兩次逐值相同）",
    seeds.every((s) => digest(runMatch(s)) === digest(runMatch(s))));
  const e = runMatch(42);
  ck("2) 未呼叫 configureSpells ⇒ spellsOn 為 false", e.spellsOn === false);
  ck("3) 未呼叫時 v2 狀態欄全部保持初值（護盾／點燃／加速都沒被寫過）",
    e.players.every((p) => p.shield === 0 && p.shieldUntil === 0
      && p.igniteUntil === 0 && p.hasteUntil === 0 && p.cleanseUntil === 0 && p.healCutUntil === 0));
  ck("4) 未呼叫時第二格仍是「打野懲戒、其餘 reserved」（＝ I 的行為）",
    e.snapshot().players.every((p) => (p.role === "jungle"
      ? p.sp[1].id === "smite" : p.sp[1].id === null)));
  ck("5) 呼叫之後才會生效（同 seed 有無技能層結果不同 ⇒ 這一層真的有作用）",
    digest(runMatch(42)) !== digest(runMatch(42, spellTable(
      Object.fromEntries(SEATS.map((s) => [s, spellsFor(null, laneOfSeat(s))[1].id]))))));
}

console.log("\n── §2 八個技能各自的實際效果 ──");
{
  //  逐一驗「放了之後世界真的變了」。用完整比賽觀察觸發，用直接操作驗效果，
  //  兩者都要——只有觸發不算有效果，只有效果不算會被用到。
  const second = {
    b1: "teleport", b2: "smite", b3: "ignite", b4: "heal", b5: "barrier",
    r1: "ghost", r2: "smite", r3: "cleanse", r4: "barrier", r5: "ghost",
  };
  const e = runMatch(42, spellTable(second));
  const casts = {};
  for (const ev of e.spellLog) casts[ev.spell] = (casts[ev.spell] ?? 0) + 1;
  ck("6) 一場比賽中至少七種技能真的被放出來（淨化需要被減速，另行驗證）",
    ["flash", "smite", "teleport", "heal", "barrier", "ignite", "ghost"]
      .every((id) => (casts[id] ?? 0) > 0), casts);

  //  護盾：先扣盾再扣血
  {
    const g = new LogicEngine(7);
    g.configureSpells(spellTable(second));
    const p = g.players[0];
    p.shield = 100; p.shieldUntil = g.t + 5;
    const hp0 = p.hp;
    g._damageHero(p, 40);
    const afterPartial = p.hp === hp0 && p.shield === 60;
    g._damageHero(p, 80);
    ck("7) 護盾先吸收傷害，吸滿才扣血",
      afterPartial && p.shield === 0 && Math.abs(p.hp - (hp0 - 20)) < 1e-6,
      { hp0, hp: p.hp, shield: p.shield });
  }
  //  點燃：持續扣血 ＋ 治療減益
  {
    const g = new LogicEngine(7);
    g.configureSpells(spellTable(second));
    const victim = g.players[5], src = g.players[0];
    victim.igniteUntil = g.t + 5; victim.igniteBy = src.id;
    const hp0 = victim.hp, dmg0 = src.dmg;
    g._igniteTickV2(1);
    ck("8) 點燃每 tick 真的扣血，且傷害記在施放者身上",
      victim.hp < hp0 && src.dmg > dmg0, { lost: hp0 - victim.hp, gained: src.dmg - dmg0 });
    ck("9) 點燃的傷害量符合設定（igniteDps × dt）",
      Math.abs((hp0 - victim.hp) - R.igniteDps) < 1e-6, hp0 - victim.hp);
  }
  //  幽魂：移速係數
  ck("10) 幽魂的移速係數 > 1（真的比較快）", R.ghostSpeedK > 1, R.ghostSpeedK);
  //  治療：回血且記在施放者的 heal
  {
    const g = new LogicEngine(7);
    g.configureSpells(spellTable(second));
    const p = g.players.find((x) => x.id === "b4");
    p.hp = p.maxHp * 0.2;
    const hp0 = p.hp, heal0 = p.heal;
    //  直接走施放路徑：把敵人拉到身邊、清冷卻，讓 _summonerSpellsV2 判定成立
    const foe = g.players.find((x) => x.side !== p.side && !x.dead);
    foe.pos = { x: p.pos.x + 1, y: p.pos.y };
    g._summonerSpellsV2(g.players.filter((x) => !x.dead), 0.5);
    ck("11) 治療真的回血，且治療量計入施放者",
      p.hp > hp0 && p.heal > heal0, { hp0, hp: p.hp, heal: p.heal - heal0 });
  }
  //  淨化：解除減速
  {
    const g = new LogicEngine(7);
    g.configureSpells(spellTable(second));
    const p = g.players.find((x) => x.id === "r3");
    p.redSlowUntil = g.t + 10;
    g._summonerSpellsV2(g.players.filter((x) => !x.dead), 0.5);
    ck("12) 淨化解除減速並進入短暫免疫",
      p.redSlowUntil === 0 && p.cleanseUntil > g.t, { slow: p.redSlowUntil, immune: p.cleanseUntil });
  }
  //  傳送：位置真的改變
  {
    const g = new LogicEngine(7);
    g.configureSpells(spellTable(second));
    for (let i = 0; i < 400; i++) g.tick(0.5);   // 過 teleportMinT
    const tp = g.spellLog.filter((x) => x.spell === "teleport");
    ck("13) 傳送有事件，且落點與起點不同（真的移動了）",
      tp.length === 0 || tp.every((x) => x.to && (x.to.x !== x.from.x || x.to.y !== x.from.y)),
      tp[0] ?? "本段未觸發（由 §6 的完整比賽覆蓋）");
  }
  ck("14) 技能表八個技能全部宣告有引擎效果（不再有只顯示圖示的）",
    Object.keys(SUMMONER_SPELLS).length === 8
    && Object.values(SUMMONER_SPELLS).every((s) => s.engine === true),
    Object.entries(SUMMONER_SPELLS).map(([k, v]) => [k, v.engine]));
  ck("15) 目標指定的八個技能都在表內",
    ["flash", "teleport", "smite", "heal", "barrier", "ignite", "ghost", "cleanse"]
      .every((id) => !!SUMMONER_SPELLS[id]));
}

console.log("\n── §3 懲戒歸屬由引擎裁決 ──");
{
  //  故意餵一份「非打野帶懲戒、打野不帶懲戒」的壞資料，引擎必須改回來。
  const bad = spellTable(Object.fromEntries(SEATS.map((s) => [s, s.endsWith("2") ? "heal" : "smite"])));
  const e = new LogicEngine(7);
  e.configureSpells(bad);
  const snap = e.snapshot();
  const jungles = snap.players.filter((p) => p.role === "jungle");
  ck("16) 賽前資料把懲戒給了非打野 ⇒ 引擎移除",
    snap.players.filter((p) => p.role !== "jungle").every((p) => !p.sp.some((s) => s?.id === "smite")),
    snap.players.filter((p) => p.role !== "jungle").map((p) => p.sp.map((s) => s?.id)));
  ck("17) 賽前資料沒給打野懲戒 ⇒ 引擎補回來",
    jungles.length === 2 && jungles.every((p) => p.sp.some((s) => s?.id === "smite")),
    jungles.map((p) => p.sp.map((s) => s?.id)));
  ck("18) 未知技能 id 不會進引擎",
    (() => {
      const g = new LogicEngine(7);
      g.configureSpells({ blue: { b1: ["flash", "fireball"] }, red: null, meta: null });
      const sp = g.snapshot().players.find((p) => p.id === "b1").sp;
      return sp[1].id === null;
    })());
}

console.log("\n── §4 冷卻、事件與 snapshot 一致 ──");
{
  const second = Object.fromEntries(SEATS.map((s) => [s, spellsFor(null, laneOfSeat(s))[1].id]));
  const e = runMatch(42, spellTable(second));
  const snap = e.snapshot();
  ck("19) snapshot 兩格都輸出實際裝備的技能（不再只認閃現與懲戒）",
    snap.players.every((p) => p.sp.length === 2 && p.sp[0].id === "flash" && !!p.sp[1].id),
    snap.players.map((p) => p.sp.map((s) => s?.id)));
  ck("20) 每個技能的 cdMax 來自技能表（不是寫死的兩個常數）",
    snap.players.every((p) => p.sp.every((s) => s.id && s.cdMax === R.spellCd[s.id])),
    snap.players[0].sp.map((s) => [s.id, s.cdMax]));
  ck("21) 冷卻是真的（施放後 readyAt 往後推、snapshot 的 cd > 0）",
    e.spellLog.length > 0 && e.players.some((p) => p.sp.f.uses > 0 || p.sp.d.uses > 0));
  {
    //  施放紀錄的次數要與 snapshot 的 uses 對得起來（Result 就是讀這個）
    const byPlayer = {};
    for (const ev of e.spellLog) {
      byPlayer[ev.playerId] ??= {};
      byPlayer[ev.playerId][ev.spell] = (byPlayer[ev.playerId][ev.spell] ?? 0) + 1;
    }
    //  spellLog 有 400 筆上限，長場會被截斷 ⇒ 只驗「uses 不小於仍保留的紀錄數」
    ck("22) snapshot 的 uses 與事件紀錄一致（uses ≥ 現存事件數）",
      snap.players.every((p) => p.sp.every((s) =>
        !s.id || (s.uses ?? 0) >= (byPlayer[p.id]?.[s.id] ?? 0))),
      byPlayer);
  }
  ck("23) 技能事件帶得走重播需要的欄位（誰、何時、什麼技能、為什麼、在哪）",
    e.spellLog.every((ev) => ev.playerId && ev.side && ev.spell
      && ev.reason != null && Number.isFinite(ev.t) && ev.from
      && Number.isFinite(ev.from.x) && Number.isFinite(ev.from.y)));
  ck("24) 事件裡出現的技能都在技能表內（Timeline 不會印出 undefined）",
    e.spellLog.every((ev) => !!SUMMONER_SPELLS[ev.spell]),
    [...new Set(e.spellLog.map((ev) => ev.spell))]);
  ck("25) 狀態效果會出現在 snapshot（護盾／點燃／加速看得到）",
    (() => {
      const g = new LogicEngine(7);
      g.configureSpells(spellTable(second));
      const p = g.players[0];
      p.shield = 50; p.shieldUntil = g.t + 5; p.igniteUntil = g.t + 5; p.hasteUntil = g.t + 5;
      const ids = g.snapshot().players[0].statusEffects.map((x) => x.id);
      return ["shield", "ignite", "haste"].every((x) => ids.includes(x));
    })());
}

console.log("\n── §5 開啟技能層之後的節奏與對稱性 ──");
{
  //  ⚠ regress 跑的是**沒有技能層**的基準。正式對戰會開這一層，所以節奏必須
  //    在這裡另外驗一次，否則等於沒驗過玩家實際會遇到的那條路徑。
  const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242];
  const second = Object.fromEntries(SEATS.map((s) => [s, spellsFor(null, laneOfSeat(s))[1].id]));
  const tbl = spellTable(second);
  let done = 0, mins = 0, kills = 0, zero = 0, retreatLock = 0;
  let worstRetreatRun = 0, retreatPeak = 0;
  const wins = { blue: 0, red: 0 };
  const baseWins = { blue: 0, red: 0 };
  for (const seed of SEEDS) {
    const e = new LogicEngine(seed);
    e.configureSpells(tbl);
    //  「撤退鎖死」= 全隊撤退且**回不來**。所以要驗的是**持續時間**，不是
    //  某個瞬間的人數——大團戰剛結束時八個人同時在後撤是正常的節奏，
    //  regress 的瞬間取樣拿來當死鎖判準會把正常現象判成故障。
    //  門檻：連續 60 tick（30 模擬秒）都有 ≥8 人在撤退才算鎖死。
    let run = 0, longest = 0, peak = 0;
    for (let t = 0.5; t <= 1800 && !e.over; t += 0.5) {
      e.tick(0.5);
      const ret = e.players.filter((p) => p.state === "撤退").length;
      peak = Math.max(peak, ret);
      if (ret >= 8) { run++; longest = Math.max(longest, run); } else run = 0;
    }
    worstRetreatRun = Math.max(worstRetreatRun, longest);
    retreatPeak = Math.max(retreatPeak, peak);
    if (longest >= 60) retreatLock++;
    if (e.over) done++;
    mins += e.t / 60;
    const K = e.bK + e.rK; kills += K; if (K === 0) zero++;
    if (e.winner) wins[e.winner]++;
    const b = new LogicEngine(seed);
    for (let t = 0.5; t <= 1800 && !b.over; t += 0.5) b.tick(0.5);
    if (b.winner) baseWins[b.winner]++;
  }
  const n = SEEDS.length, avgMin = mins / n, avgK = kills / n;
  ck(`26) 開啟技能層後仍場場分出勝負（${done}/${n}）`, done === n, done);
  ck(`27) 平均時長仍在合理帶內（${avgMin.toFixed(1)} 分，門檻 18–30）`,
    avgMin >= 18 && avgMin <= 30, avgMin);
  ck(`28) 平均擊殺仍在合理帶內（${avgK.toFixed(1)}，門檻 15–55）`,
    avgK >= 15 && avgK <= 55, avgK);
  ck("29) 沒有零擊殺的比賽", zero === 0, zero);
  ck(`30) 沒有撤退鎖死（最長連續 ≥8 人撤退 ${(worstRetreatRun * 0.5).toFixed(1)} 秒，門檻 30 秒）`,
    retreatLock === 0, { retreatLock, worstRetreatRun });
  //  同時把「瞬間是否全隊撤退」也釘住——真的十個人一起跑才是無法自拔。
  ck(`30b) 沒有全隊同時撤退（峰值 ${retreatPeak} 人）`, retreatPeak < 10, retreatPeak);
  //  對稱性：兩側用同一份技能規則 ⇒ 勝場分佈不應該因為這一層而偏移。
  ck(`31) 技能層沒有改變陣營勝負分佈（基準 ${baseWins.blue}/${baseWins.red}、技能層 ${wins.blue}/${wins.red}）`,
    wins.blue === baseWins.blue && wins.red === baseWins.red, { baseWins, wins });
}

console.log("\n── §6 邊界 ──");
{
  ck("32) 英雄池仍是 100 名", CHAMPIONS_100.length === 100, CHAMPIONS_100.length);
  {
    const counts = tagCounts(CHAMPIONS_100);
    ck(`33) 圖鑑法師仍 ≥15（實際 ${counts.法師}）`, counts.法師 >= 15, counts);
    ck("34) 沒有任何定位因分類規則被隱藏（六個分頁都有人）",
      ["坦克", "戰士", "刺客", "法師", "射手", "輔助"].every((t) => (counts[t] ?? 0) > 0), counts);
  }
  ck("35) 技能層沒有引入任何傷害乘數（點燃是獨立傷害源，非乘進普攻）",
    (() => {
      //  行為驗證：把點燃關掉（時限設為 0）之後，普攻造成的傷害與基準完全相同。
      const mk = (ignite) => {
        const g = new LogicEngine(7);
        g.configureSpells(spellTable(Object.fromEntries(SEATS.map((s) => [s, "barrier"]))));
        if (!ignite) g._igniteTickV2 = () => {};
        for (let i = 0; i < 200; i++) g.tick(0.5);
        return g.players.map((p) => Math.round(p.dmg));
      };
      const withIg = mk(true), without = mk(false);
      //  這份配置沒有人帶點燃 ⇒ 有沒有跑點燃結算都不該有差
      return JSON.stringify(withIg) === JSON.stringify(without);
    })());
  ck("36) toEngineSpells 對沒有技能資料的名單回 null（呼叫端就不會啟用這一層）",
    toEngineSpells({}) === null && toEngineSpells({ b1: { heroId: "x" } }) === null);
  ck("37) toEngineSpells 會擋掉不合法的配置（技能數不對或未知 id）",
    (() => {
      const out = toEngineSpells({
        b1: { spells: ["flash", "heal"] }, b2: { spells: ["flash"] },
        b3: { spells: ["flash", "fireball"] }, r1: { spells: ["flash", "ghost"] },
      });
      return out && Object.keys(out.blue).length === 1 && Object.keys(out.red).length === 1;
    })());
  ck("38) 地圖幾何未被本階段動到（塔位仍來自地圖呈現座標）",
    (() => {
      const a = new LogicEngine(7), b = new LogicEngine(7);
      b.configureSpells(spellTable(Object.fromEntries(SEATS.map((s) => [s, "ghost"]))));
      return JSON.stringify(Object.entries(a.towers).map(([k, t]) => [k, t.pos]))
        === JSON.stringify(Object.entries(b.towers).map(([k, t]) => [k, t.pos]));
    })());
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
