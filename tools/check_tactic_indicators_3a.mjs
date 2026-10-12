// ============================================================================
//  tools/check_tactic_indicators_3a.mjs — 戰術指標（Phase 3a T11，秒級）
//
//  執行：node tools/check_tactic_indicators_3a.mjs
//
//  § P  計畫輪廓：六軸 0–1；經典模板的形狀符合文案（m7 前期最高、m8 後期最高、m2 分推最高…）；選擇會改變輪廓
//  § F  席位任務適性：任務來自解析後的設定；素質係數只來自 STAT_MAP（獨立重算＋原始碼掃描）；對素質單調；
//       換人 ⇒ 適性重算、plan 不變；英雄適配由呼叫端注入
//  § C  配合度負擔：std＝0；capacity 由 synergy＋comms 推導、單調、有界
//  § X  矛盾提示：每一條都對得到 G-A7 結果表裡達標的兩筆現象（附對照組：引用量不到的現象必須被擋下）
//  § E  敵意輸入：不丟例外
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as I from "../src/platform/tactics/tacticIndicators.js";
import { createTacticPlan, tacticPlanHash } from "../src/platform/tactics/tacticPlan.js";
import { TACTIC_TEMPLATES } from "../src/platform/tactics/tacticTemplates.js";
import { liveRows } from "../src/platform/tactics/capabilityRegistry.js";
import { bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { STAT_MAP, toPlayerMods, NEUTRAL_STAT } from "../src/battle/moba/mobaPlayerStats.js";
import { MOVEMENT_PROFILES, getHeroCombatArchetype, listArchetypeHeroIds } from "../src/data/heroCombatArchetypes.js";
import { stripComments } from "./lib/stripComments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const plan = (templateId, choices = {}) => { const r = createTacticPlan({ templateId, choices }); if (!r.ok) throw new Error(`fixture plan failed: ${templateId} ${J(r.errors)}`); return r.plan; };
const bind = (templateId, choices = {}) => { const b = bindTacticPlanToCurrentVersions(plan(templateId, choices)); if (!b) throw new Error("fixture bind failed"); return b; };
const TEMPLATE_IDS = Object.keys(TACTIC_TEMPLATES);
const CLASSIC = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].map((m) => `classic.${m}`);
const STAT_KEYS = [...new Set(Object.values(STAT_MAP).flatMap((t) => Object.keys(t)))].sort();
const GRADE_RANK = { D: 0, C: 1, B: 2, A: 3 };
const flat = (v) => Object.fromEntries(STAT_KEYS.map((k) => [k, v]));

// ════════════════════════════════════════════════════════════════════════════
//  § P  計畫輪廓
// ════════════════════════════════════════════════════════════════════════════
{
  const prof = Object.fromEntries(TEMPLATE_IDS.map((id) => [id, I.planProfile(bind(id))]));
  const bad = TEMPLATE_IDS.filter((id) => !prof[id] || J(Object.keys(prof[id])) !== J(I.PROFILE_AXES) || !I.PROFILE_AXES.every((a) => Number.isFinite(prof[id][a]) && prof[id][a] >= 0 && prof[id][a] <= 1));
  ck(`P1 ${TEMPLATE_IDS.length} 個模板都有六軸、每軸是 0–1 的有限數字`, bad.length === 0, bad.join(","));
  const top = (axis) => CLASSIC.slice().sort((a, b) => prof[b][axis] - prof[a][axis]);
  const show = (axis) => top(axis).slice(0, 3).map((id) => `${id.slice(8)}=${prof[id][axis]}`).join(" ");
  ck("P2a 八套經典：前期最高的是 m7（前期壓制）", top("early")[0] === "classic.m7" && prof["classic.m7"].early > prof[top("early")[1]].early, show("early"));
  ck("P2b 八套經典：後期團戰最高的是 m8（後期決戰）", top("lateTeamfight")[0] === "classic.m8" && prof["classic.m8"].lateTeamfight > prof[top("lateTeamfight")[1]].lateTeamfight, show("lateTeamfight"));
  ck("P2c 八套經典：分推最高的是 m2（四一分推），其他沒有帶線路的都是 0", top("splitPressure")[0] === "classic.m2" && CLASSIC.filter((id) => id !== "classic.m2").every((id) => prof[id].splitPressure === 0), show("splitPressure"));
  ck("P2d 八套經典：物件最高的是 m4（龍堆運營）", top("objectives")[0] === "classic.m4", show("objectives"));
  ck("P2e 八套經典：風險最高的是 m7、最低的是 m8", top("risk")[0] === "classic.m7" && top("risk")[7] === "classic.m8", show("risk"));
  ck("P2f 八套經典：中期控圖最高的是 m3 或 m6（強開團／全圖游走），最低的不是它們", ["classic.m3", "classic.m6"].includes(top("midControl")[0]), show("midControl"));
  ck("P2g 兩個單帶模板的分推 > 0", ["v2.top_solo_split", "v2.mid_solo_split"].filter((id) => prof[id]).every((id) => prof[id].splitPressure > 0) && ["v2.top_solo_split", "v2.mid_solo_split"].some((id) => prof[id]), TEMPLATE_IDS.filter((id) => prof[id].splitPressure > 0).join(","));
  const std = I.planProfile(bind("std"));
  ck("P3a std：分推 0、風險 0.5、物件 0.5", std.splitPressure === 0 && std.risk === 0.5 && std.objectives === 0.5, J(std));
  const bold = I.planProfile(bind("std", { risk: { tolerance: "bold" } }));
  const split = I.planProfile(bind("std", { lanes: { top: { stance: "split" } } }));
  const invade = I.planProfile(bind("std", { jungle: { focus: "invade" } }));
  ck("P3b 選擇會改變輪廓：風險大膽 ⇒ 風險軸上升；上路帶線 ⇒ 分推從 0 變正；打野入侵 ⇒ 前期上升", bold.risk > std.risk && split.splitPressure > 0 && invade.early > std.early, `risk ${std.risk}→${bold.risk} split 0→${split.splitPressure} early ${std.early}→${invade.early}`);
  ck("P3c 選擇只動它該動的軸：風險大膽不改分推與物件", bold.splitPressure === std.splitPressure && bold.objectives === std.objectives);
  const b = bind("classic.m2");
  ck("P4 binding 與裸 plan 得到相同的輪廓；重算逐值相同；回傳是凍結的", J(I.planProfile(b)) === J(I.planProfile(b.plan)) && J(I.planProfile(b)) === J(I.planProfile(bind("classic.m2"))) && Object.isFrozen(I.planProfile(b)));
}

// ════════════════════════════════════════════════════════════════════════════
//  § F  席位任務適性
// ════════════════════════════════════════════════════════════════════════════
{
  const fit = (templateId, choices, seatPlayers, heroLookup) => I.seatMissionFit({ binding: bind(templateId, choices), seatPlayers, heroLookup });
  const neutral = fit("std");
  ck("F1 沒有選手資料（＝全中性）：五個席位都是 B、分數 0、沒有最強／最弱項", I.SEATS.every((s) => neutral[s].grade === "B" && neutral[s].score === 0 && neutral[s].strongest === null && neutral[s].weakest === null), J(Object.fromEntries(I.SEATS.map((s) => [s, neutral[s].grade]))));
  ck("F1b 素質全 70 與沒有資料相同", J(fit("std", {}, Object.fromEntries(I.SEATS.map((s) => [s, { stats: flat(NEUTRAL_STAT) }])))) === J(neutral));

  const mis = (templateId, choices = {}) => { const f = fit(templateId, choices); return Object.fromEntries(I.SEATS.map((s) => [s, f[s].mission + (f[s].core ? "*" : "")])); };
  ck("F2a 任務來自解析後的設定：std", J(mis("std")) === J({ b1: "lane", b2: "gank", b3: "lane", b4: "lane", b5: "support" }), J(mis("std")));
  ck("F2b m2（四一分推）：上路帶線、輔助保護", mis("classic.m2").b1 === "split" && mis("classic.m2").b5 === "protect", J(mis("classic.m2")));
  ck("F2c m7（前期壓制）：三路壓制、打野入侵", J(mis("classic.m7")) === J({ b1: "pressure", b2: "invade", b3: "pressure", b4: "pressure", b5: "support" }), J(mis("classic.m7")));
  ck("F2d m8（後期決戰）：三路守線、打野刷野、輔助保護", J(mis("classic.m8")) === J({ b1: "hold", b2: "farm", b3: "hold", b4: "hold", b5: "protect" }), J(mis("classic.m8")));
  ck("F2e m5（下路強攻）：射手是核心；m6：中路是核心", mis("classic.m5").b4 === "pressure*" && mis("classic.m6").b3 === "pressure*", `${J(mis("classic.m5"))} ${J(mis("classic.m6"))}`);
  ck("F2f 選擇會改任務：std＋輔助遊走 ⇒ roam；std＋上路核心 ⇒ b1 是核心", mis("std", { seats: { b5: { mission: "roam" } } }).b5 === "roam" && mis("std", { seats: { b1: { priority: "core" } } }).b1 === "lane*");
  const usedMissions = new Set(TEMPLATE_IDS.flatMap((id) => Object.values(mis(id)).map((m) => m.replace("*", ""))));
  for (const m of ["roam", "invade", "split", "farm", "protect"]) usedMissions.add(m);
  ck("F2g 任務表涵蓋所有會出現的任務，且每個任務的作用點都是 STAT_MAP 的鍵", [...usedMissions].every((m) => Object.hasOwn(I.MISSION_POINTS, m)) && Object.values(I.MISSION_POINTS).every((pts) => pts.length > 0 && pts.every(([k, d]) => Object.hasOwn(STAT_MAP, k) && (d === 1 || d === -1))) && Object.hasOwn(STAT_MAP, I.CORE_POINT[0]), [...usedMissions].sort().join(","));

  //  係數來源：用 STAT_MAP 獨立重算「單一素質拉到 100」的分數。
  const CASES = [                                         // [模板, 選擇, 席位, 任務]
    ["std", { lanes: { top: { stance: "split" } } }, "b1", "split"],
    ["classic.m7", {}, "b1", "pressure"], ["classic.m8", {}, "b1", "hold"], ["std", {}, "b3", "lane"],
    ["std", {}, "b2", "gank"], ["classic.m8", {}, "b2", "farm"], ["std", { jungle: { focus: "invade" } }, "b2", "invade"],
    ["std", { seats: { b5: { mission: "roam" } } }, "b5", "roam"], ["std", { seats: { b5: { mission: "protect" } } }, "b5", "protect"], ["std", {}, "b5", "support"],
  ];
  const expectScore = (mission, core, key, u) => {
    const pts = [...I.MISSION_POINTS[mission]];
    if (core && !pts.some(([k]) => k === I.CORE_POINT[0])) pts.push(I.CORE_POINT);
    let s = 0;
    for (const [p, d] of pts) { const t = STAT_MAP[p]; const norm = Object.values(t).reduce((a, w) => a + Math.abs(w), 0); if (Object.hasOwn(t, key)) s += (d * t[key] * u) / norm / pts.length; }
    return s;
  };
  let mismatch = [], checked = 0;
  for (const [tpl, ch, seat, mission] of CASES) {
    const base = fit(tpl, ch)[seat];
    if (base.mission !== mission) { mismatch.push(`${tpl}/${seat} 任務是 ${base.mission} 不是 ${mission}`); continue; }
    for (const key of STAT_KEYS) for (const v of [40, 100]) {
      const got = fit(tpl, ch, { [seat]: { stats: { [key]: v } } })[seat].score;
      const want = expectScore(mission, base.core, key, (v - 70) / 30);
      checked++;
      if (!near(got, want)) mismatch.push(`${mission}.${key}@${v}: ${got} ≠ ${want}`);
    }
  }
  ck(`F3a 分數＝STAT_MAP 的係數（${CASES.length} 個任務 × ${STAT_KEYS.length} 項素質 × 高低兩端，獨立重算）`, mismatch.length === 0 && checked === CASES.length * STAT_KEYS.length * 2, mismatch.slice(0, 3).join("；"));
  const coreBase = fit("classic.m5", {}, { b4: { stats: { accuracy: 100 } } }).b4, plainBase = fit("classic.m7", {}, { b4: { stats: { accuracy: 100 } } }).b4;
  ck("F3b 核心席位多看一個作用點（xpRateScale）：同樣是壓制任務，射手精準度只在他是核心時才計分", near(coreBase.score, expectScore("pressure", true, "accuracy", 1)) && coreBase.score > 0 && plainBase.score === 0, `core=${coreBase.score} plain=${plainBase.score}`);
  const uBad = [40, 55, 70, 85, 100, 20, 130].filter((v) => !near(I.statU({ mapAware: v }, "mapAware") * STAT_MAP.roamAdj.mapAware, toPlayerMods({ mapAware: v }).roamAdj));
  ck("F3c 素質正規化與 mobaPlayerStats 相同（用 toPlayerMods 的輸出反推；含超出範圍的值）", uBad.length === 0, uBad.join(","));
  const src = stripComments(fs.readFileSync(path.join(ROOT, "src/platform/tactics/tacticIndicators.js"), "utf8"));
  const ownWeights = STAT_KEYS.filter((k) => new RegExp(`\\b${k}\\s*:\\s*[+-]?[\\d.]`).test(src));
  ck("F3d 原始碼掃描：指標模組沒有自己寫任何「素質: 數字」的權重", ownWeights.length === 0, ownWeights.join(","));
  //  對照組：同一個掃描器要抓得到真的權重表
  ck("F3d′ 對照組：同一個掃描器在 mobaPlayerStats.js 上抓得到權重", STAT_KEYS.filter((k) => new RegExp(`\\b${k}\\s*:\\s*[+-]?[\\d.]`).test(stripComments(fs.readFileSync(path.join(ROOT, "src/battle/moba/mobaPlayerStats.js"), "utf8")))).length >= 10);

  //  單調：任何任務、任何素質，從 40 掃到 100，分數只會往同一個方向走；方向與 STAT_MAP 的符號一致。
  const sweep = [40, 50, 60, 70, 80, 90, 100];
  let nonMono = [], gradeDrop = [];
  for (const [tpl, ch, seat, mission] of CASES) for (const key of STAT_KEYS) {
    const rows = sweep.map((v) => fit(tpl, ch, { [seat]: { stats: { [key]: v } } })[seat]);
    const sign = Math.sign(expectScore(mission, rows[0].core, key, 1));
    for (let i = 1; i < rows.length; i++) {
      const d = rows[i].score - rows[i - 1].score;
      if ((sign > 0 && d < -1e-9) || (sign < 0 && d > 1e-9) || (sign === 0 && Math.abs(d) > 1e-9)) nonMono.push(`${mission}.${key}`);
      if (sign > 0 && GRADE_RANK[rows[i].grade] < GRADE_RANK[rows[i - 1].grade]) gradeDrop.push(`${mission}.${key}`);
    }
  }
  ck("F4a 適性分數對每一項素質單調，方向與 STAT_MAP 的符號一致", nonMono.length === 0, [...new Set(nonMono)].slice(0, 5).join(","));
  ck("F4b 提高任務相關素質 ⇒ 等級不降（所有正向素質）", gradeDrop.length === 0, [...new Set(gradeDrop)].slice(0, 5).join(","));
  const splitKeys = Object.keys(STAT_MAP.splitAdj);
  const splitLow = fit("classic.m2", {}, { b1: { stats: Object.fromEntries(splitKeys.map((k) => [k, 45])) } }).b1;
  const splitHigh = fit("classic.m2", {}, { b1: { stats: Object.fromEntries(splitKeys.map((k) => [k, 95])) } }).b1;
  ck("F4c 帶線任務：帶線相關素質全低 ⇒ D、全高 ⇒ A；最強／最弱項是帶線作用點的素質", splitLow.grade === "D" && splitHigh.grade === "A" && splitKeys.includes(splitHigh.strongest) && splitKeys.includes(splitLow.weakest) && splitHigh.weakest === null && splitLow.strongest === null, `${splitLow.grade}/${splitLow.weakest} → ${splitHigh.grade}/${splitHigh.strongest}`);
  const mixed = fit("classic.m2", {}, { b1: { stats: { adaptability: 100, courage: 40 } } }).b1;
  ck("F4d 最強＝貢獻最大的素質、最弱＝拖累最多的素質", mixed.strongest === "adaptability" && mixed.weakest === "courage", `${mixed.strongest}/${mixed.weakest}`);
  const holdBrave = fit("classic.m8", {}, { b1: { stats: { courage: 100 } } }).b1;
  ck("F4e 方向 −1 的任務：守線時勇氣越高越不合適（引擎裡勇氣讓人推得更深）", holdBrave.score < 0 && holdBrave.weakest === "courage", `score=${holdBrave.score}`);

  //  換人：適性重算，plan／binding 不變。
  const b = bind("classic.m2"), before = J(b), hashBefore = tacticPlanHash(b.plan);
  const a1 = I.seatMissionFit({ binding: b, seatPlayers: { b1: { stats: Object.fromEntries(splitKeys.map((k) => [k, 95])) } } });
  const a2 = I.seatMissionFit({ binding: b, seatPlayers: { b1: { stats: Object.fromEntries(splitKeys.map((k) => [k, 45])) } } });
  ck("F5 換人後適性重算（A → D），binding 與 planHash 完全沒變", a1.b1.grade === "A" && a2.b1.grade === "D" && J(b) === before && tacticPlanHash(b.plan) === hashBefore && J(I.planProfile(b)) === J(I.planProfile(bind("classic.m2"))));
  const slots = I.SEATS.map((s, i) => ({ id: s, playerId: `p${i}`, stats: flat(60 + i * 8) }));
  const asObj = Object.fromEntries(slots.map((s) => [s.id, { stats: s.stats }]));
  ck("F6 選手資料的兩種形狀（buildPlayerStatSlots 的陣列／以席位為鍵的物件）結果相同；順序打亂也相同", J(fit("classic.m6", {}, slots)) === J(fit("classic.m6", {}, asObj)) && J(fit("classic.m6", {}, slots.slice().reverse())) === J(fit("classic.m6", {}, slots)));

  //  英雄適配
  const fitKeysOk = Object.entries(I.MISSION_HERO_FIT).every(([m, t]) => Object.hasOwn(I.MISSION_POINTS, m) && Object.entries(t).every(([p, v]) => MOVEMENT_PROFILES.includes(p) && (v === 1 || v === -1)));
  ck("F7a 英雄適配表：任務都存在、移動原型都是 HeroCombatArchetype 的合法值、值只有 ±1", fitKeysOk && J(Object.keys(I.MISSION_HERO_FIT).sort()) === J(Object.keys(I.MISSION_POINTS).sort()));
  const hero = (profile) => fit("classic.m2", {}, null, { b1: profile }).b1;
  ck("F7b 合適的英雄加一級距、不合適減一級距、沒列或不認得的＝中性", near(hero("flank").score, I.HERO_FIT_STEP) && near(hero("protect").score, -I.HERO_FIT_STEP) && hero("kite").score === 0 && hero("???").score === 0 && hero("flank").hero.fit === 1 && hero("protect").hero.profile === "protect", `${hero("flank").score}/${hero("protect").score}`);
  const ids = listArchetypeHeroIds();
  const viaReal = I.seatMissionFit({ binding: bind("classic.m2"), heroLookup: (seat) => (seat === "b1" ? getHeroCombatArchetype(ids[0]) : null) });
  ck("F7c heroLookup 可以是函式並回傳 getHeroCombatArchetype 的物件；丟例外的 lookup ⇒ 當作沒有英雄", viaReal.b1.hero.profile === getHeroCombatArchetype(ids[0]).movementProfile && I.seatMissionFit({ binding: bind("std"), heroLookup: () => { throw new Error("x"); } }).b1.hero.profile === null, `${ids[0]}→${viaReal.b1.hero.profile}`);
  ck("F7d 分數夾在 −1～+1；等級門檻遞減、中性落在 B", I.gradeOf(1) === "A" && I.gradeOf(0) === "B" && I.gradeOf(-0.01) === "C" && I.gradeOf(-1) === "D" && I.GRADE_FLOORS.every(([, f], i, a) => i === 0 || f < a[i - 1][1]));
}

// ════════════════════════════════════════════════════════════════════════════
//  § C  配合度負擔
// ════════════════════════════════════════════════════════════════════════════
{
  const std = I.coordinationLoad(bind("std"));
  ck("C1 std、中性隊伍：load 0、capacity＝基準值、沒有超載、沒有項目", std.load === 0 && std.capacity === I.COORDINATION.capacityBase && std.over === false && std.items.length === 0, J(std));
  const all = Object.fromEntries(TEMPLATE_IDS.map((id) => [id, I.coordinationLoad(bind(id))]));
  const badSum = TEMPLATE_IDS.filter((id) => !near(all[id].items.reduce((s, x) => s + x.weight, 0), all[id].load, 1e-5) || !(all[id].load >= 0) || all[id].items.some((x) => !(x.weight > 0)));
  ck(`C2 ${TEMPLATE_IDS.length} 個模板：load＝各項目加總、每項 > 0`, badSum.length === 0, CLASSIC.map((id) => `${id.slice(8)}=${all[id].load}`).join(" "));
  ck("C2b 需要配合的打法負擔比穩健打法高：m6（全圖游走）、m7（前期壓制）、m3（強開團）都高於 m8（後期決戰）", ["classic.m6", "classic.m7", "classic.m3"].every((id) => all[id].load > all["classic.m8"].load));
  const roam = I.coordinationLoad(bind("std", { seats: { b5: { mission: "roam" } } }));
  const inv = I.coordinationLoad(bind("std", { jungle: { focus: "invade" } }));
  ck("C3 選擇會改負擔：std＋輔助遊走 ⇒ 多一項 roam；std＋入侵 ⇒ 多一項 invade", roam.load === I.COORDINATION.roam && roam.items[0].id === "roam" && inv.items.some((x) => x.id === "invade") && inv.load >= I.COORDINATION.invade, `${roam.load} / ${inv.load}`);
  const team = (syn, com) => I.SEATS.map((s) => ({ id: s, stats: { synergy: syn, comms: com } }));
  const caps = [40, 55, 70, 85, 100].map((v) => I.coordinationLoad(bind("classic.m7"), team(v, v)).capacity);
  ck("C4 capacity 對 synergy／comms 單調不減，夾在上下界之內", caps.every((c, i) => i === 0 || c >= caps[i - 1]) && caps[0] < caps[4] && caps.every((c) => c >= I.COORDINATION.capacityMin && c <= I.COORDINATION.capacityMax), caps.join(" "));
  const onlySyn = I.coordinationLoad(bind("std"), team(100, 70)).capacity, onlyCom = I.coordinationLoad(bind("std"), team(70, 100)).capacity, other = I.coordinationLoad(bind("std"), I.SEATS.map((s) => ({ id: s, stats: { courage: 100, apm: 100 } }))).capacity;
  ck("C5 capacity 只讀 synergy 與 comms（各自都有作用；其他素質沒有）", onlySyn > std.capacity && onlyCom > std.capacity && other === std.capacity, `${onlySyn}/${onlyCom}/${other}`);
  const m7 = bind("classic.m7");
  ck("C6 over＝load > capacity；同一份計畫，隊伍越合拍越不會超載；load 與選手無關", I.coordinationLoad(m7, team(40, 40)).over === true && I.coordinationLoad(m7, team(100, 100)).over === false && I.coordinationLoad(m7, team(40, 40)).load === I.coordinationLoad(m7, team(100, 100)).load);
}

// ════════════════════════════════════════════════════════════════════════════
//  § X  矛盾提示
// ════════════════════════════════════════════════════════════════════════════
{
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/tactic_truth_3a.json"), "utf8"));
  const rowOf = (e) => table.rows.find((r) => r.role === "primary" && r.template === "std" && r.side === "blue" && r.dimension === e.dimension && r.choice === e.choice && r.metric === e.metric);
  /** 一條規則是否站得住：每筆 evidence 在結果表裡是 pass／marginal，且 when 的每一項都有對應的 evidence。 */
  const ruleProblems = (rule) => {
    const out = [];
    for (const e of rule.evidence) {
      const row = rowOf(e);
      if (!row) out.push(`找不到 ${e.dimension}=${e.choice} ${e.metric}`);
      else if (!["pass", "marginal"].includes(row.verdict)) out.push(`${e.dimension}=${e.choice} 的結果是 ${row.verdict}（z=${row.z.toFixed(2)}）`);
    }
    for (const [dim, choice] of rule.when) if (!rule.evidence.some((e) => e.dimension === dim && e.choice === choice)) out.push(`${dim}=${choice} 沒有對應的現象`);
    return out;
  };
  const live = Object.fromEntries(liveRows().map((r) => [r.dimension, r.choices]));
  const probs = I.CONTRADICTION_RULES.flatMap((r) => ruleProblems(r).map((p) => `${r.id}: ${p}`));
  ck(`X1 ${I.CONTRADICTION_RULES.length} 條規則：每一條引用的現象都在 G-A7 結果表（std／藍方）裡達標，且每個條件都有對應現象`, I.CONTRADICTION_RULES.length > 0 && probs.length === 0, probs.slice(0, 3).join("；"));
  ck("X1′ 對照組：引用量不到的現象（打野節奏快）、反向的現象（中路進攻）、不存在的指標 ⇒ 都被同一個檢查擋下", [
    { id: "x", when: [["jungle.tempo", "fast"]], evidence: [{ dimension: "jungle.tempo", choice: "fast", metric: "ganksPerMin" }] },
    { id: "y", when: [["lanes.mid.stance", "aggressive"]], evidence: [{ dimension: "lanes.mid.stance", choice: "aggressive", metric: "laneForward.mid" }] },
    { id: "z", when: [["jungle.focus", "invade"]], evidence: [{ dimension: "jungle.focus", choice: "invade", metric: "noSuchMetric" }] },
    { id: "w", when: [["jungle.focus", "invade"], ["risk.tolerance", "bold"]], evidence: [{ dimension: "jungle.focus", choice: "invade", metric: "invasionsActed" }] },
  ].every((r) => ruleProblems(r).length > 0));
  ck("X2 規則的條件都是 live 維度的合法選擇；id 不重複；文案非空", I.CONTRADICTION_RULES.every((r) => r.when.length >= 2 && r.when.every(([d, c]) => live[d]?.includes(c)) && typeof r.text === "string" && r.text.length > 8) && new Set(I.CONTRADICTION_RULES.map((r) => r.id)).size === I.CONTRADICTION_RULES.length);
  const nest = (pairs) => { const o = {}; for (const [d, c] of pairs) d.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? c : (n[k] ?? {}), n[k]), o); return o; };
  const unfired = I.CONTRADICTION_RULES.filter((r) => !I.contradictions(bind("std", nest(r.when))).some((x) => x.id === r.id && x.text === r.text));
  ck("X3 每一條規則都觸發得到：std＋它的條件 ⇒ 出現該提示", unfired.length === 0, unfired.map((r) => r.id).join(","));
  const half = I.CONTRADICTION_RULES.filter((r) => I.contradictions(bind("std", nest([r.when[0]]))).some((x) => x.id === r.id));
  ck("X4 只成立一半不提示；std 本身沒有任何提示", half.length === 0 && I.contradictions(bind("std")).length === 0, half.map((r) => r.id).join(","));
  const m8 = I.contradictions(bind("classic.m8", { jungle: { focus: "invade" } }));
  ck("X5 模板自己的值也算：m8 的團戰姿態本來就是保守 ⇒ 加上打野入侵就提示", m8.some((x) => x.id === "invade_vs_passive_fights") && I.effectiveChoices(bind("classic.m8"))["teamfight.posture"] === "passive", J(m8.map((x) => x.id)));
  const perTemplate = Object.fromEntries(TEMPLATE_IDS.map((id) => [id, I.contradictions(bind(id)).map((x) => x.id)]));
  ck("X6 每個模板自己的提示清單（記錄用；模板本身不該一打開就滿是矛盾：每個 ≤ 1 條）", Object.values(perTemplate).every((l) => l.length <= 1), J(Object.fromEntries(Object.entries(perTemplate).filter(([, l]) => l.length))));
  const eff = I.effectiveChoices(bind("std", { risk: { tolerance: "bold" } }));
  ck("X7 有效選擇：涵蓋每個 live 維度；明確選的優先", J(Object.keys(eff)) === J(liveRows().map((r) => r.dimension)) && eff["risk.tolerance"] === "bold" && eff["jungle.focus"] === "gank");
}

// ════════════════════════════════════════════════════════════════════════════
//  § E  敵意輸入
// ════════════════════════════════════════════════════════════════════════════
{
  const cyc = {}; cyc.plan = cyc;
  const hostile = [null, undefined, 0, "std", [], {}, { plan: null }, { plan: { templateId: "nope" } }, { templateId: "std", choices: { teamfight: { style: "dive" } } }, { templateId: "std", choices: { risk: { tolerance: 0.9 } } }, cyc,
    new Proxy({}, { get() { throw new Error("boom"); } }), { get plan() { throw new Error("boom"); } }];
  let threw = 0, notNull = 0;
  for (const h of hostile) {
    try {
      if (I.planProfile(h) !== null) notNull++;
      if (I.seatMissionFit({ binding: h }) !== null) notNull++;
      if (I.coordinationLoad(h) !== null) notNull++;
      if (I.effectiveChoices(h) !== null) notNull++;
      if (J(I.contradictions(h)) !== "[]") notNull++;
    } catch { threw++; }
  }
  ck(`E1 敵意輸入（${hostile.length} 種 × 5 個入口）⇒ null／[]，從不丟例外`, threw === 0 && notNull === 0, `threw=${threw} notNull=${notNull}`);
  let threw2 = 0;
  for (const sp of [null, 7, "x", [null, 3, { id: "zz" }, { id: "b1", stats: "x" }], { b1: null, b2: { stats: 5 }, b3: { stats: { courage: "high", apm: NaN, focus: Infinity } } }]) {
    try { const f = I.seatMissionFit({ binding: bind("classic.m7"), seatPlayers: sp, heroLookup: 5 }); if (!f || !I.SEATS.every((s) => f[s].grade === "B")) threw2++; if (!I.coordinationLoad(bind("classic.m7"), sp)) threw2++; } catch { threw2++; }
  }
  ck("E2 壞掉的選手資料（非物件、缺 stats、非數字素質）⇒ 當作中性，不丟例外", threw2 === 0, `bad=${threw2}`);
  ck("E3 seatMissionFit() 不帶參數 ⇒ null", I.seatMissionFit() === null);
}

console.log(`\nTactic Indicators 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
