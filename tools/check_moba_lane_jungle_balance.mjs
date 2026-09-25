#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_lane_jungle_balance.mjs — feature/moba-lane-jungle-balance node 驗收
//
//  O  skill-off：laneSkillV1／smiteAiV1 開關的 snapshot 串流逐位元相同（Challenge 行為不變）
//  L  技能清兵規則：只用純傷害類型、不用大招與控制類；單體只收得掉才打；範圍 ≥2 隻、×0.5、最多 3 隻；
//     對線期之後只在自己推進時用；實戰真的會清兵
//  S  懲戒 AI：小野怪個體 > 35% 不用；龍／巴龍仍「能斬殺才放」（價值不變）；實戰不再秒滿血小野怪
//  V  版本：moba-sim.v12 目前版本、v11 保留、跨版本拒絕重播
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };

const { LogicEngine } = await load("src/LogicEngine.js");
const { CHAMPIONS_100 } = await load("src/data/heroDatabase.js");
const { toEngineHeroSkills } = await load("src/battle/moba/skills/heroSkillGameplay.js");
const { rulesFor } = await load("src/battle/moba/matchProgression.js");
const SV = await load("src/platform/contracts/simulationVersion.js");
const rosterOf = (g) => {
  const ids = CHAMPIONS_100.slice(g * 5, g * 5 + 5).map((h) => h.id);
  return Object.fromEntries([...ids.map((id, i) => [`b${i + 1}`, { heroId: id }]), ...ids.map((id, i) => [`r${i + 1}`, { heroId: id }])]);
};
const mk = (seed, { skills, lane, smite, reach = smite, group = 0 }) => {
  const e = new LogicEngine(seed, null, { rules: "v3" });
  e.rules = { ...rulesFor("v3"), laneSkillV1: lane, smiteAiV1: smite, jungleReachV1: reach };
  if (skills) e.configureHeroSkills(toEngineHeroSkills(rosterOf(group)));
  return e;
};
const R = rulesFor("v3");

// ── O ──
{
  let same = true, where = "";
  for (const seed of [7, 2024]) {
    const a = mk(seed, { skills: false, lane: true, smite: true }), b = mk(seed, { skills: false, lane: false, smite: false });
    for (let i = 0; i < 1600 && !a.over; i++) {
      a.tick(0.5); b.tick(0.5);
      if (i % 20 === 0 && JSON.stringify(a.snapshot()) !== JSON.stringify(b.snapshot())) { same = false; where = `seed ${seed} tick ${i}`; break; }
    }
    if (!same) break;
  }
  ck("O1 skill-off：laneSkillV1／smiteAiV1／jungleReachV1 開關的 snapshot 串流逐位元相同（Challenge 不受影響）", same, where);
  const src = read("src/LogicEngine.js");
  ck("O2 三個規則的作用點都另判 heroSkillsOn", /!this\.rules\.laneSkillV1 \|\| !this\.heroSkillsOn/.test(src) && /R\.smiteAiV1 && this\.heroSkillsOn/.test(src) && /R\.jungleReachV1 && this\.heroSkillsOn/.test(src));
}

// ── L：規則單元（直接呼叫目標選擇）──
{
  const e = mk(3, { skills: true, lane: true, smite: true });
  for (let i = 0; i < 200; i++) e.tick(0.5);               // 100 秒：兵線已交戰
  const p = e.players.find((q) => q.side === "blue");
  const base = { damage: 90, powerRatio: 0.5, range: 60 };
  const t = (mech, extra = {}) => e._laneSkillTarget(p, { ...base, mechanic: mech, skillId: "x:Q", ...extra });
  ck("L1 大招（:R）不用在兵上", e._laneSkillTarget(p, { ...base, mechanic: "delayed-area", radius: 3, skillId: "x:R" }) === null);
  ck("L2 控制類（area-control／control-target／root-target／area-root／area-silence）不用在兵上",
    ["area-control", "control-target", "root-target", "area-root", "area-silence", "root-dot"].every((m) => t(m, { radius: 3 }) === null));
  ck("L3 位移類（dash-strike／blink-strike／dash-blast）不用在兵上", ["dash-strike", "blink-strike", "dash-blast"].every((m) => t(m, { radius: 3 }) === null));
  ck("L4 無傷害技能不用在兵上", t("projectile", { damage: 0, powerRatio: 0 }) === null);
  const key = p.side === "blue" ? "rm" : "bm";
  const all = ["top", "mid", "bot"].flatMap((ln) => e.lanes[ln][key].filter((m) => m.hp > 0).map((m) => ({ ln, m })));
  const tiny = t("projectile", { damage: 1, powerRatio: 0 });
  ck("L5 單體：收不掉就不打（1 點傷害 ⇒ 找不到目標，除非有 ≤1 血的兵）", tiny === null || all.find((x) => x.m.id === tiny.memberId)?.m.hp <= 1);
  const big = t("projectile", { damage: 9999 });
  ck("L6 單體：收得掉 ⇒ 打 1 隻、全額傷害", !big || (big.lane.max === 1 && big.lane.area === false && big.lane.amount >= 9999));
  const area = t("delayed-area", { radius: 4 });
  ck("L7 範圍：×laneSkillAreaK（0.5）、最多 laneSkillAreaMax（3）隻", !area || (area.lane.area && area.lane.max === 3 && Math.abs(area.lane.amount - (90 + p.power * 0.5) * e._heroSkillPowerFactor(p) * 0.5) < 1e-6),
    area ? JSON.stringify(area.lane) : "本時點沒有 ≥2 隻的兵群");
  ck("L8 規則值：laneSkillAreaK 0.5、laneSkillAreaMax 3", R.laneSkillAreaK === 0.5 && R.laneSkillAreaMax === 3);
  // 對線期後：非推進狀態不清兵
  const late = mk(3, { skills: true, lane: true, smite: true });
  for (let i = 0; i < 200; i++) late.tick(0.5);
  late.t = (R.laneWaveHoldUntil ?? 840) + 10;
  const lp = late.players.find((q) => q.side === "blue"); lp.state = "對線";
  ck("L9 14 分鐘後：不在推進狀態就不清兵（沿用既有兵線限制）", late._laneSkillTarget(lp, { ...base, mechanic: "delayed-area", radius: 4, skillId: "x:Q" }) === null);
  // 實戰：真的會清兵、而且沒有大招／控制被用在兵上（fx 的 skillId 以 :R 結尾且 targetKind minion 的數量）
  let ultOnMinion = 0, casts = 0, kills = 0;
  for (const seed of [1, 42]) {
    const g = mk(seed, { skills: true, lane: true, smite: true });
    const seen = new Set();
    while (!g.over && g.t < 1500) {
      g.tick(0.5);
      for (const fx of g.fx ?? []) { const k = `${fx.at}|${fx.sourceId}|${fx.skillId}|${fx.targetId}`; if (seen.has(k)) continue; seen.add(k); if (fx.targetKind === "minion" && String(fx.skillId ?? "").endsWith(":R")) ultOnMinion++; }
    }
    casts += g.laneSkillStats.casts; kills += g.laneSkillStats.kills;
  }
  ck("L10 實戰：技能會清兵（casts > 0、kills > 0），大招沒有用在兵上", casts > 0 && kills > 0 && ultOnMinion === 0, `casts ${casts}／kills ${kills}／ult→minion ${ultOnMinion}`);
}

// ── S：懲戒 ──
{
  //  ⚠ 量測：懲戒目標的血量必須取「決策當下被懲戒的那一隻」。舊寫法（這一 tick 有懲戒、任何營地任何一隻
  //    > 90% 的怪死掉就算）會把別處被普攻／技能打死的怪也算進去，是錯的（2026-09-25 audit）。
  //    這裡用唯讀 Proxy：trySmite 選好 victim（第一隻活著的）後一定會讀 R.smiteAiV1 ⇒ 在那一刻記下各營地第一隻活怪；
  //    同一 tick 會讀多次 ⇒ 結算時取「現在已死的那一隻」的最後一筆＝決策當下。Proxy 不改任何結果（另有逐位元比對）。
  const count = (smite) => {
    let full = 0, over50 = 0, smites = 0, objSmite = 0, kills5 = 0, identical = true;
    for (const seed of [1, 42]) {
      const e = mk(seed, { skills: true, lane: true, smite });
      const plain = mk(seed, { skills: true, lane: true, smite });
      const reads = new Map();
      const rules = e.rules;
      e.rules = new Proxy(rules, { get(target, prop) {
        if (prop === "smiteAiV1" && e.neutrals) for (const c of e.neutrals.camps) {
          const v = c.members?.find((m) => m.alive && m.hp > 0);
          if (v) { if (!reads.has(c.id)) reads.set(c.id, []); reads.get(c.id).push({ id: v.id, ratio: v.hp / v.maxHp }); }
        }
        return target[prop];
      } });
      while (!e.over && e.t < 1500) {
        reads.clear();
        const pre = new Map(); for (const c of e.neutrals.camps) for (const m of c.members ?? []) pre.set(m.id, m.alive);
        const sl0 = e.spellLog.length; e.tick(0.5); plain.tick(0.5);
        for (const c of e.neutrals.camps) for (const m of c.members ?? []) if (pre.get(m.id) && !m.alive && m.killerTeam && e.t <= 300) kills5++;
        const s = e.spellLog.slice(sl0).filter((x) => x.spell === "smite");
        smites += s.length;
        objSmite += s.filter((x) => /dragon|baron/.test(String(x.reason))).length;
        for (const x of s) {
          const camp = e.neutrals.camps.find((c) => c.id === String(x.reason));
          if (!camp) continue;
          const d = [...(reads.get(camp.id) ?? [])].reverse().find((r) => !camp.members.find((m) => m.id === r.id)?.alive);
          if (d && d.ratio >= 0.9) full++;
          if (d && d.ratio > 0.5) over50++;
        }
      }
      if (JSON.stringify(e.snapshot()) !== JSON.stringify(plain.snapshot())) identical = false;
    }
    return { full, over50, smites, objSmite, kills5: kills5 / 4, identical };
  };
  const off = count(false), on = count(true);
  ck("S0 量測用的 Proxy 不改變模擬（與未包 Proxy 的同一場逐位元相同）", off.identical && on.identical);
  ck("S1 懲戒 AI 開：決策當下目標 ≥ 90% 的懲戒 ＝ 0、> 50% ＝ 0；關（v11）時滿血懲戒存在", on.full === 0 && on.over50 === 0 && off.full > 0, `關 ${off.full}／開 ${on.full}（>50%：${on.over50}）`);
  const src = read("src/LogicEngine.js");
  ck("S2 龍／巴龍規則不變（o.hp ≤ smiteDmg 能斬殺才放）；AI 判斷只對 o.members（野怪營地），走 _smiteWorthOnCamp",
    /o\.hp > 0 && o\.hp <= R\.smiteDmg/.test(src) && /if \(o\.members && R\.smiteAiV1 && this\.heroSkillsOn && !this\._smiteWorthOnCamp\(o, victim, casts\)\) return;/.test(src));
  ck("S3 懲戒數值未動（smiteDmg 550、smiteCd 75、smiteRange 6.5）；context 模式、目標上限 50%", R.smiteDmg === 550 && R.smiteCd === 75 && R.smiteRange === 6.5 && R.smiteAiMode === "context" && R.smiteContextMaxHpFrac === 0.5);
  //  ⚠ 2 場樣本只能驗「仍會施放、且仍會用在龍／巴龍」；比例（v11 13% → 24%）是 400 場 A/B 的統計結論，見 05 本節，不在這裡斷言。
  ck("S4 懲戒仍會施放，且仍會用在龍／巴龍（保留斬殺價值）", on.smites > 0 && on.objSmite > 0, `開 ${on.smites}（龍巴 ${on.objSmite}）／關 ${off.smites}（龍巴 ${off.objSmite}）`);
  ck("J1 清野沒有倒退：前 5 分鐘每隊擊殺野怪 ≥ v11（jungleReachV1：打野走向要打的那一隻）", on.kills5 >= off.kills5, `v11 ${off.kills5}／候選 ${on.kills5}`);
}

// ── V ──
ck("V1 moba-sim.v12 為目前版本；v11 保留（指紋 617b9eebcc50b848）且拒絕重播",
  SV.MOBA_SIMULATION_VERSION === "moba-sim.v12" && SV.KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v11")
  && SV.SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v11"] === "617b9eebcc50b848" && SV.canReplay("moba-sim.v11").ok === false);
ck("V2 塔規則未動（heroTowerDmg 104、towerAttackInterval 0.5、towerMinionDamage 60、towerAggroRange 6、towerHeroShot 25）",
  R.heroTowerDmg === 104 && R.towerAttackInterval === 0.5 && R.towerMinionDamage === 60 && R.towerAggroRange === 6 && R.towerHeroShot === 25);

console.log(`\nMOBA lane／jungle balance：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
