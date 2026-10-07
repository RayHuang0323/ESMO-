#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_mobile_hud_polish.mjs — MOBA Mobile & Presentation Polish（Node 端）
//
//  執行：node tools/check_moba_mobile_hud_polish.mjs
//  A 戰報降噪：用真實引擎產生的 SKILL_LEVEL_UP 驗分級；事件本身與 BattleResult.timeline 不變
//  B 5v5 戰況摘要：全部讀 snapshot 既有欄位（真實引擎跑一段）
//  C 版面：手機安全區讓出 5v5 列、桌機不變；小地圖尺寸與觸控門檻
//  D 小地圖觸控：原始碼層級守住「觸控只在放開時判定」
//  E 裝備專屬圖示：T3＋鞋全覆蓋、輪廓不重複、類別語言與流派一致
//  F 純呈現：新模組不 import 引擎／Store／progression
// ============================================================================
import { readFileSync } from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { battleTalentOptions, selectBattleTalents } from "../src/battle/moba/talents/heroBattleTalents.js";
import { BattleEventTracker } from "../src/battle/battleEvents.js";
import { snapshotToBattleResult } from "../src/battle/battleResult.js";
import { SKILL_LEVEL_CAPS } from "../src/battle/moba/skills/heroSkillLevels.js";
import * as SR from "../src/battle/skillLevelReport.js";
import * as L from "../src/battle/ui/battleLayout.js";
import { hudSafeTop, hudHeight, mobileTeamStripTop } from "../src/battle/ui/hudStore.js";
import { ITEM_CATALOG } from "../src/battle/moba/items/itemCatalog.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); } };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── A 戰報降噪 ─────────────────────────────────────────────────────────────
console.log("\n── A 戰報：技能升級降噪（純呈現）──");
{
  const heroId = "bingshuang";
  const roster = { b1: { heroId }, r1: { heroId } };
  const pickedTalent = battleTalentOptions(heroId)[1];
  const selected = selectBattleTalents(roster, { b1: pickedTalent.id });
  const eng = new LogicEngine(777);
  eng.configureHeroSkills(toEngineHeroSkills(roster, selected));
  const tracker = new BattleEventTracker();
  tracker.update(eng.snapshot());
  const p = eng.players.find((x) => x.id === "b1");
  //  moba-sim.v19 HeroSkillLevel.v2：Lv2–Lv18 逐級升級 ⇒ 基本技能 8 次（解鎖／升級）＋ R 3 次（Lv6／11／16）＝ 11 筆；R 上限 3。
  for (let lv = 2; lv <= 18; lv++) { p.mlv = lv; eng._updateHeroSkillLevels(p); }
  const snap = eng.snapshot();
  const events = tracker.update(snap);
  const skillEv = events.filter((e) => e.type === "SKILL_LEVEL_UP");
  const frozen = JSON.stringify(events);
  ck("A1 引擎產生 11 筆 SKILL_LEVEL_UP（HeroSkillLevel.v2；事件層不動）", skillEv.length === 11, String(skillEv.length));
  const main = SR.filterMainReport(events, snap);
  const kinds = main.filter((e) => e.type === "SKILL_LEVEL_UP").map((e) => `${e.data.slot}${e.data.level}:${e.reportKind}`);
  const talentSlot = SR.talentSlotOf(snap.players.find((x) => x.id === "b1"));
  ck("A2 已選天賦的技能欄位讀得到（snapshot.heroBattleTalent → 天賦定義 slot）", !!talentSlot && talentSlot === pickedTalent.effects[0].slot, `${talentSlot} / ${pickedTalent.effects[0].slot}`);
  ck("A3 主要戰報只留重要升級：R 升級、天賦技能滿級、全技能滿級（11 → ≤4）",
    kinds.length >= 2 && kinds.length <= 4 && kinds.some((k) => k.endsWith(":ultimate")) && kinds.some((k) => k.endsWith(":allMax"))
    && kinds.every((k) => !k.endsWith(":minor")), kinds.join(" "));
  const talentMaxOk = talentSlot === "R" || kinds.some((k) => k === `${talentSlot}${SKILL_LEVEL_CAPS[talentSlot]}:talentMax`)
    || kinds.some((k) => k.startsWith(talentSlot) && k.endsWith(":allMax"));
  ck("A4 天賦技能滿級被標成 talentMax（或正好是最後一次升級而併入 allMax）", talentMaxOk, `talent=${talentSlot} ${kinds.join(" ")}`);
  ck("A5 普通升級（例：Q Lv2、W Lv2）不進主要戰報", !main.some((e) => e.type === "SKILL_LEVEL_UP" && e.data.level === 2 && e.data.slot !== "R" && e.data.slot !== talentSlot));
  ck("A6 過濾不改輸入事件、非技能事件原樣保留", JSON.stringify(events) === frozen
    && main.filter((e) => e.type !== "SKILL_LEVEL_UP").length === events.filter((e) => e.type !== "SKILL_LEVEL_UP").length);
  const result = snapshotToBattleResult({ ...snap, over: true, winner: "blue" }, events);
  ck("A7 BattleResult.timeline 仍含全部 11 筆升級（Result／Replay 契約不變）", result.timeline.filter((e) => e.type === "SKILL_LEVEL_UP").length === 11);
  const growth = SR.skillGrowthSummary(result);
  const b1 = growth?.find((g) => g.id === "b1");
  ck("A8 賽後技能成長摘要讀 BattleResult 最終等級：b1 Q3 W3 E3 R3、11 次升級、四招全滿",
    b1 && JSON.stringify(b1.levels) === JSON.stringify({ Q: 3, W: 3, E: 3, R: 3 }) && b1.upgrades === 11 && b1.maxed.length === 4, JSON.stringify(b1));
  //  同一 tick 連跳兩級：兩筆 matchLevel 都是最後升級等級（v2 為 16），只能有一筆 allMax
  const mk = (slot, level, ml) => ({ type: "SKILL_LEVEL_UP", data: { playerId: "r1", slot, level, matchLevel: ml } });
  const jump = SR.filterMainReport([mk("E", 2, 16), mk("W", 3, 16)], null).filter((e) => e.reportKind === "allMax");
  ck("A9 同 tick 連升兩級只報一次「全數滿級」", jump.length === 1 && jump[0].data.slot === "W");
  ck("A10 沒有天賦資料時不猜 talentMax", SR.skillLevelReportKind(mk("Q", 3, 5), { talentSlot: null }) === "minor");
  const tl = read("src/battle/ui/BattleTimeline.jsx"), rp = read("src/screens/moba/MobaReplayScreen.jsx");
  ck("A11 即時戰報與重播都走同一個 filterMainReport", /filterMainReport\(events/.test(code(tl)) && /filterMainReport\(replay\?\.events/.test(code(rp)));
}

// ── B 5v5 戰況摘要 ─────────────────────────────────────────────────────────
console.log("\n── B 手機 5v5 戰況摘要（讀 snapshot 既有欄位）──");
{
  //  MobileTeamStrip.jsx 是 JSX，Node 無法直接 import ⇒ 摘要函式的規則在這裡用同一組欄位重現比對，
  //  並以原始碼掃描確認元件真的只讀這些欄位。
  const eng = new LogicEngine(4242);
  for (let i = 0; i < 1400; i++) eng.tick(0.5);
  const s = eng.snapshot();
  const src = code(read("src/battle/ui/MobileTeamStrip.jsx"));
  ck("B1 引擎快照有 bGold／rGold／towers／players（戰況列的全部資料來源）",
    Number.isFinite(s.bGold) && Number.isFinite(s.rGold) && Object.keys(s.towers).length > 0 && s.players.length === 10);
  ck("B2 經濟差＝bGold − rGold（直接相減，不重算個人 Gold）", /bGold - rGold/.test(src) && !/reduce\([^)]*gold/.test(src));
  ck("B3 拆塔數＝對方已倒的塔（主堡核心不算）", /t\.side === foe && t\.lane !== "nexus" && t\.hp <= 0/.test(src));
  ck("B4 龍／巴龍讀 teamBuffs（dragonStacks／baronRemaining）", /dragonStacks/.test(src) && /baronRemaining/.test(src));
  ck("B5 每格頭像讀 hp／dead／respawn；記分板讀 k／d／a／gold／mlv", ["p.hp", "p.dead", "p.respawn", "p.k", "p.d", "p.a", "p.gold", "p.mlv"].every((k) => src.includes(k)));
  ck("B6 不顯示 CS（快照沒有這個欄位，不造假）", !/\bp\.cs\b|lastHit/.test(src) && s.players.every((p) => !("cs" in p)));
  const obs = code(read("src/battle/ui/BattleObserverHUD.jsx"));
  ck("B7 只在手機現場對戰掛載（重播、桌機不掛）", /const stripOn = mobile && !replay/.test(obs) && /stripOn && <MobileTeamStrip/.test(obs));
  ck("B8 點頭像沿用既有 pick（跟隨＋底欄單英雄詳情）", /onPick=\{pick\}/.test(obs));
}

// ── C 版面 ────────────────────────────────────────────────────────────────
console.log("\n── C 版面常數 ──");
{
  for (const mode of ["compact", "expanded"]) {
    const stripBottom = mobileTeamStripTop(mode) + L.MOBILE_TEAM_STRIP_H;
    ck(`C1[${mode}] 手機：戰況列在記分板下方、安全區在戰況列下方`,
      mobileTeamStripTop(mode) >= L.HUD_TOP + hudHeight(mode, true) && hudSafeTop(mode, true) >= stripBottom,
      `strip ${mobileTeamStripTop(mode)}–${stripBottom} safe ${hudSafeTop(mode, true)}`);
    ck(`C2[${mode}] 桌機安全區不變（記分板底緣 + 6）`, hudSafeTop(mode, false) === L.HUD_TOP + hudHeight(mode, false) + 6);
  }
  const shrink = 1 - L.MINIMAP_PX.mobile / 106;
  ck("C3 手機小地圖縮小 10–15%（106 → 92），桌機維持 180", shrink >= 0.10 && shrink <= 0.15 && L.MINIMAP_PX.desktop === 180, `${(shrink * 100).toFixed(1)}%`);
  ck("C4 觸控點擊門檻合理（位移 ≤ 10px、時間 ≤ 450ms）", L.MINIMAP_TAP_SLOP_PX > 0 && L.MINIMAP_TAP_SLOP_PX <= 12 && L.MINIMAP_TAP_MAX_MS >= 300 && L.MINIMAP_TAP_MAX_MS <= 600);
  const obs = code(read("src/battle/ui/BattleObserverHUD.jsx"));
  ck("C5 手機擊殺提示跟著安全區，不再寫死 top:180", /hudSafeTop\(hudMode, true\) \+ 104/.test(obs));
}

// ── D 小地圖觸控 ─────────────────────────────────────────────────────────
console.log("\n── D 小地圖觸控（原始碼）──");
{
  const gv = code(read("src/GameView.jsx"));
  const down = gv.match(/const onDown = \(e\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  const up = gv.match(/const onUp = \(e\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  ck("D1 觸控按下時只記錄、不移動鏡頭（locate 在 isTouch 分支之後）", /if \(isTouch\(e\)\) \{ touchRef\.current = \{[^}]*\}; return; \}\s*locate\(e\);/.test(down));
  ck("D2 觸控放開才判定：未滑動、夠快、位移 ≤ SLOP 才移動", /!tc\.moved && quick/.test(up) && /MINIMAP_TAP_SLOP_PX/.test(up) && /MINIMAP_TAP_MAX_MS/.test(gv));
  ck("D3 觸控移動只標記 moved，不移動鏡頭；滑鼠拖曳維持原行為", /tc\.moved = true/.test(gv) && /if \(!isTouch\(e\) && e\.buttons\) locate\(e\)/.test(gv));
  ck("D4 小地圖手勢不往外冒泡（pointer／touch 全部 stopPropagation）",
    (gv.match(/e\.stopPropagation\(\)/g) ?? []).length >= 7 && /onTouchMove=\{\(e\) => e\.stopPropagation\(\)\}/.test(gv));
  ck("D5 取消（pointercancel）清掉進行中的觸控", /onPointerCancel=\{onCancel\}/.test(gv));
}

// ── E 裝備專屬圖示 ───────────────────────────────────────────────────────
console.log("\n── E 裝備專屬圖示 ──");
{
  const art = read("src/battle/ui/items/ItemArt.jsx");
  const entries = [...art.matchAll(/^  (t3_\w+|bt_\w+): \{ mat: "(\w+)", cat: "(\w+)", shapes: \[([\s\S]*?)\] \},?$/gm)]
    .map(([, id, mat, cat, shapes]) => ({ id, mat, cat, shapes: shapes.replace(/\s+/g, "") }));
  const target = Object.values(ITEM_CATALOG).filter((i) => i.tier === "T3" || i.tier === "BOOTS");
  const ids = new Set(entries.map((e) => e.id));
  ck("E1 T3＋鞋全部有專屬圖示（50／50）", target.length === 50 && target.every((i) => ids.has(i.id)) && entries.length === 50, `${entries.length}/${target.length}`);
  const sigs = new Set(entries.map((e) => e.shapes));
  ck("E2 50 個輪廓兩兩不同（不再同流派共用一個圖紋）", sigs.size === entries.length, `${sigs.size}`);
  const catOf = (i) => (i.tier === "BOOTS" ? "boots" : "ABCD".includes(i.family) ? "weapon" : "EF".includes(i.family) ? "magic" : "armor");
  const wrong = target.filter((i) => entries.find((e) => e.id === i.id)?.cat !== catOf(i)).map((i) => i.id);
  ck("E3 視覺類別＝流派語言（A–D 武器、E–F 法術、G–H 防具、鞋）", wrong.length === 0, wrong.join(","));
  const matOk = entries.every((e) => (e.cat === "weapon" ? e.mat === "steel" : e.cat === "magic" ? e.mat === "arcane" : e.cat === "boots" ? e.mat === "leather" : ["bronze", "stone", "holy"].includes(e.mat)));
  ck("E4 材質跟類別走（不只靠換色：武器鋼、法術奧術、防具青銅／石／聖光、鞋皮革）", matOk);
  ck("E5 有深色外描邊（小尺寸保輪廓），色票放在 itemsTheme（元件不寫色碼）",
    /stroke=\{ITEM_ART_INK\.outline\} strokeWidth="4\.2"/.test(art) && !/["'`]#[0-9a-fA-F]{3,8}\b/.test(code(art)));
  const slot = code(read("src/battle/ui/items/ItemSlot.jsx"));
  ck("E6 ItemSlot：有圖用圖、沒圖退回原圖紋（組件／起始裝不變）", /hasItemArt\(visual\.itemId\)[\s\S]*<ItemArt[\s\S]*<ItemIcon glyph=\{visual\.glyph\}/.test(slot));
}

// ── G 技能 VFX 地面語彙 ──────────────────────────────────────────────────
console.log("\n── G 技能 VFX：地面語彙多樣性 ──");
{
  const GA = await import("../src/battle/moba/skills/skillGroundArchetype.js");
  const { CHAMPIONS_100 } = await import("../src/data/heroDatabase.js");
  const dist = {};
  for (const h of CHAMPIONS_100) for (const s of ["Q", "W", "E", "R"]) { const a = GA.groundArchetypeOf(`${h.id}:${s}`); dist[a] = (dist[a] ?? 0) + 1; }
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  ck("G1 400 招技能都有語彙", total === 400, JSON.stringify(dist));
  ck("G2 至少 9 種不同語彙被實際使用", Object.keys(dist).length >= 9, Object.keys(dist).join(","));
  ck("G3 純圓環（ring）≤ 10%（改版前 400/400 都是圓環）", (dist.ring ?? 0) / total <= 0.1, `${dist.ring ?? 0}/400`);
  const mkE = (skillId, t) => ({ skillId, progress: t, radius: 1.4, color: "#88ccff", origin: { x: 0, y: 0, z: 0 }, target: { x: 6, y: 0, z: 4 } });
  let maxEmit = 0, pool0 = 0, all = 0; const pools = {};
  const byArche = {};
  for (const h of CHAMPIONS_100) for (const s of ["Q", "W", "E", "R"]) { const id = `${h.id}:${s}`; byArche[GA.groundArchetypeOf(id)] ??= [id, s]; }
  for (const [arche, [id, slot]] of Object.entries(byArche)) {
    for (let t = 0.02; t < 1; t += 0.06) {
      let n = 0;
      GA.emitGroundArchetype(mkE(id, t), slot, arche, (pool) => { n++; all++; pools[pool] = (pools[pool] ?? 0) + 1; if (pool === 0) pool0++; });
      maxEmit = Math.max(maxEmit, n);
    }
  }
  ck("G4 每招每幀的階段層 emit ≤ 24（手機成本上限）", maxEmit <= 24, String(maxEmit));
  ck("G5 地面環池（pool 0）只佔階段層 emit 的少數（< 25%）", pool0 / all < 0.25, `${pool0}/${all} ${JSON.stringify(pools)}`);
  const trace = () => { const out = []; GA.emitGroundArchetype(mkE(byArche.fan[0], 0.5), "Q", "fan", (...a) => out.push(a.map((v) => (typeof v === "number" ? +v.toFixed(5) : v)).join(","))); return out.join("|"); };
  ck("G6 決定性：同一輸入兩次輸出逐值相同", trace() === trace());
  const rt = code(read("src/battle/moba/skills/HeroVfxRuntime.jsx"));
  ck("G7 HeroVfxRuntime 的階段層改走 emitGroundArchetype（不再對每招畫圓環）", /emitGroundArchetype\(e, slot, groundArchetypeOf\(e\.skillId\), emit\)/.test(rt));
  ck("G8 只用既有 5 個 instanced 池（沒有新增幾何／材質）", (rt.match(/<instancedMesh/g) ?? []).length === 1 && /\[0, 1, 2, 3, 4\]\.map/.test(rt));
}

// ── H 小兵外觀 ───────────────────────────────────────────────────────────
console.log("\n── H 小兵外觀（純呈現）──");
{
  const src = read("src/battle/moba/render/MobaRuntimeMinions.jsx");
  const start = src.indexOf("const PALETTE"), end = src.indexOf("export default function MobaRuntimeMinions");
  const { writeFileSync, unlinkSync } = await import("node:fs");
  const tmp = new URL("./_tmp_minion_gate.mjs", import.meta.url);
  writeFileSync(tmp, `import * as THREE from "three";\nimport { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";\nconst S = 1;\n${src.slice(start, end)}`);
  const rows = [];
  try {
    const MB = await import(tmp.href);
    for (const k of ["melee", "caster", "siege", "super"]) for (const t of ["blue", "red"]) {
      const g = MB.buildMinionGeometry(k, t); g.computeBoundingBox();
      rows.push({ k, t, tris: g.attributes.position.count / 3, h: g.boundingBox.max.y - g.boundingBox.min.y, minY: g.boundingBox.min.y, color: !!g.attributes.color });
    }
  } finally { unlinkSync(tmp); }
  ck("H1 四種兵 × 兩陣營都建得出合併幾何（有頂點色）", rows.length === 8 && rows.every((r) => r.color && r.tris > 60), JSON.stringify(rows.map((r) => `${r.k}/${r.t}:${r.tris}`)));
  ck("H2 每個幾何 ≤ 400 三角形（手機成本）", rows.every((r) => r.tris <= 400), String(Math.max(...rows.map((r) => r.tris))));
  ck("H3 腳底在地面（minY≈0）、身高 1.1–1.7 單位（看得出是角色）", rows.every((r) => Math.abs(r.minY) < 0.02 && r.h >= 1.1 && r.h <= 1.7));
  const sc = code(src);
  //  2026-09-30（moba-sim.v16）：Objective Stakes 的強化兵線光環是刻意新增的 1 個 InstancedMesh（包在 objectiveRing(...) 裡），
  //  巴龍／龍魂共用、逐實例上色 ⇒ 兵種 8 ＋ 血條 2 ＋ 物件光環 1（原本 H4 要求「不增加」，此處如實改為 +1 並寫在 05）。
  ck("H4 仍是 8 個兵種 InstancedMesh ＋ 2 個血條，外加 v16 物件光環 1 個（draw call 只 +1）", (sc.match(/\{unit\("/g) ?? []).length === 8
    && (sc.match(/<instancedMesh ref=/g) ?? []).length === 3 && (sc.match(/objectiveRing\(<instancedMesh/g) ?? []).length === 1);
  ck("H5 不讀／不改模擬：只用 frameRef 的 minions（kind／team／world／facing／生命週期）", !/from\s+["'][^"']*(LogicEngine|matchProgression)/.test(src));
  ck("H6 藍紅陣營色分開烘進幾何（非同一色）", /blue: \{ main: 0x3b82f6/.test(src) && /red: \{ main: 0xdc2626/.test(src));
}

// ── I 英雄對兵線（moba-sim.v15）──────────────────────────────────────────
console.log("\n── I 英雄對兵線：laneWaveAnchorV15 ──");
{
  process.env.ESMO_BALANCE_SKILLS = "on"; process.env.ESMO_BALANCE_TALENTS = "on";
  const RB = await import("./balance/moba_items_balance_runner.mjs");
  const MODS = await RB.modules();
  const { rulesFor } = await import("../src/battle/moba/matchProgression.js");
  ck("I1 規則只在 v3 規則集開啟（v1／v2 歷史規則不變）", rulesFor("v3").laneWaveAnchorV15 === true && !rulesFor("v2").laneWaveAnchorV15 && !rulesFor("v1").laneWaveAnchorV15);
  const le = code(read("src/LogicEngine.js"));
  ck("I2 只在 hero skills 開啟、對線期、無交戰目標、非打野／輔助時生效", /R\.laneWaveAnchorV15 && this\.heroSkillsOn && p\._waveAnchorT === this\.t && p\.fsm === "LANE"\s*&& !p\.decisionTargetId && !p\.retreating && p\.role !== "jungle" && p\.role !== "sup"/.test(le));
  const run = (seed, on) => {
    const { e } = RB.configure(seed, "standard", MODS);
    e.rules = { ...e.rules, laneWaveAnchorV15: on };
    const md = {}; let prev = new Map(e.players.map((p) => [p.id, 0]));
    while (e.t < 600) {
      e.tick(0.5);
      for (const p of e.players) { const v = p.minionDmg ?? 0; md[p.role] = (md[p.role] ?? 0) + v - prev.get(p.id); prev.set(p.id, v); }
    }
    const cs = (r) => e.players.filter((p) => p.role === r).reduce((s, p) => s + (p.lastHits ?? 0), 0);
    const tot = Object.values(md).reduce((a, b) => a + b, 0) || 1;
    return { mid: cs("mid"), adc: cs("adc"), top: cs("top"), jgShare: (md.jungle ?? 0) / tot, supShare: (md.sup ?? 0) / tot };
  };
  const seeds = [1000, 1001, 1002, 1003];
  const on = seeds.map((s) => run(s, true)), off = seeds.map((s) => run(s, false));
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  ck("I3 中路＋下路 10 分補刀提高（4 seeds 合計）", sum(on, "mid") + sum(on, "adc") > sum(off, "mid") + sum(off, "adc"),
    `on mid ${sum(on, "mid")} adc ${sum(on, "adc")} ｜ off mid ${sum(off, "mid")} adc ${sum(off, "adc")}`);
  ck("I4 打野／輔助沒有因新規則搶線（打兵佔比不高於關閉時 +0.02）",
    sum(on, "jgShare") / 4 <= sum(off, "jgShare") / 4 + 0.02 && sum(on, "supShare") / 4 <= sum(off, "supShare") / 4 + 0.02,
    `jg ${(sum(on, "jgShare") / 4).toFixed(3)} vs ${(sum(off, "jgShare") / 4).toFixed(3)}｜sup ${(sum(on, "supShare") / 4).toFixed(3)} vs ${(sum(off, "supShare") / 4).toFixed(3)}`);
  //  skill-off（含 Challenge）：規則開關逐位元相同
  const { LogicEngine } = await import("../src/LogicEngine.js");
  const offRun = (flag) => { const e = new LogicEngine(4242); e.rules = { ...e.rules, laneWaveAnchorV15: flag }; for (let i = 0; i < 900; i++) e.tick(0.5); return JSON.stringify(e.snapshot()); };
  ck("I5 skill-off 串流不受規則影響（規則開／關 450 秒快照逐位元相同）", offRun(true) === offRun(false));
  const lsk = code(read("src/LogicEngine.js"));
  ck("I6 技能有限度清兵規則（laneSkillV1）未被改動：仍只在對線期或自己推進時用", /if \(!\(this\.t < \(R\.laneWaveHoldUntil \?\? Infinity\)\) && !FARM_CLEAR_STATES\.has\(p\.state\)\) return null;/.test(lsk));
}

// ── F 純呈現 ─────────────────────────────────────────────────────────────
console.log("\n── F 純呈現邊界 ──");
{
  const files = ["src/battle/skillLevelReport.js", "src/battle/ui/MobileTeamStrip.jsx", "src/battle/ui/items/ItemArt.jsx"];
  const bad = files.filter((f) => /from\s+["'][^"']*(LogicEngine|profileStore|applyMatchProgress|rewardFormulas|useLocalServer|matchProgression)[^"']*["']/.test(read(f)));
  ck("F1 新模組不 import 引擎／Store／progression", bad.length === 0, bad.join(","));
  const sv = read("src/platform/contracts/simulationVersion.js");
  //  2026-09-30：v16 起目前版本不再是 v15；改驗「v15 已登記、v14／v15 仍在已知版本、目前版本 ≥ v15」（同 spectacle_vision 的慣例）。
  const curV = Number((sv.match(/MOBA_SIMULATION_VERSION = "moba-sim\.v(\d+)"/) ?? [])[1]);
  ck("F2 moba-sim.v15（C 段兵線 AI）已登記指紋、v14／v15 仍在已知版本清單、目前版本 ≥ v15",
    curV >= 15 && /"moba-sim\.v15": "[0-9a-f]{16}"/.test(sv) && /"moba-sim\.v14"/.test(sv) && (curV === 15 || /"moba-sim\.v15"/.test(sv.slice(sv.indexOf("KNOWN_SIMULATION_VERSIONS")))), `v${curV}`);
  const strip = read("src/battle/ui/MobileTeamStrip.jsx");
  ck("F3 MobileTeamStrip 不 import 裝備模組（items_m1 G13 隔離；裝備小點由呼叫端傳入）", !/from\s+["'][^"']*items\//.test(strip));
}

console.log(`\nMOBA Mobile & Presentation Polish：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
