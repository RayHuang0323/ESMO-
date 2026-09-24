#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_spectacle_vision.mjs — feature/moba-spectacle-vision 契約守門
//
//  執行：node tools/check_moba_spectacle_vision.mjs；失敗 exit 1。瀏覽器實測見 browser_check_moba_spectacle_vision。
//    V  技能家族（天降／落雷／砸地／彈道）涵蓋 ≥ 3 種、每族都有 motif；家族層不加地面環（只有 sky 的落點預告）
//    S  狀態對照表涵蓋引擎 snapshot 的每一個 statusEffects id，且護盾／增益／減益／控制用不同造型
//    N  營地底下的常駐 objective-ring 與 rigged 野怪的 contact ring 已移除
//    F  迷霧是純函式的本幀衍生：隱藏視野外敵方英雄、濾掉敵方小兵與迷霧中的特效；不 import 引擎／store
//    J  引擎：hero skills 開啟時英雄會對中立目標施法；objSkillV1 只在 v3 規則集；塔不是技能目標
//    C  導播節拍純函式（擊殺 ⇒ 特寫、團戰、物件、巡線）與四種鏡頭
//    R  simulation 版本：moba-sim.v10 已登記、v9 保留
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); } else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); } };

console.log("══ MOBA spectacle ＋ vision ══\n");

// ── V ──
const vfxSrc = read("src/battle/moba/skills/HeroVfxRuntime.jsx");
const famRe = [...vfxSrc.matchAll(/\['(sky|lightning|slam|trail)', (\/[^\n]+\/)\]/g)].map(([, k, re]) => [k, new Function(`return ${re}`)()]);
const { MOTIFS } = await load("src/battle/moba/skills/skillChoreography.js");
const famCount = Object.fromEntries(famRe.map(([k, re]) => [k, MOTIFS.filter((m) => re.test(m)).length]));
ck("V1 四個技能家族都有對應的 motif", famRe.length === 4 && Object.values(famCount).every((n) => n > 0), JSON.stringify(famCount));
const spect = vfxSrc.slice(vfxSrc.indexOf("function spectacle("), vfxSrc.indexOf("const preview = previewRef"));
ck("V2 家族層不靠地面環：pool 0（地面環）只出現在 sky 的落點預告一次", (spect.match(/emit\(0,/g) ?? []).length === 1, `emit(0) × ${(spect.match(/emit\(0,/g) ?? []).length}`);
ck("V3 具名技能飽和度略升（只在具名技能繪製期間）", /saturate = true;[\s\S]{0,120}spectacle\(e, slot\);[\s\S]{0,40}saturate = false;/.test(vfxSrc));

// ── S ──
const engine = read("src/LogicEngine.js");
const statusBlock = engine.slice(engine.indexOf("statusEffects: ["), engine.indexOf("heroSkills: Object.fromEntries"));
const snapIds = new Set([...statusBlock.matchAll(/\[\{ id: "([a-z-]+)"/g)].map((m) => m[1]));
for (const k of ["stun", "knockup", "root"]) snapIds.add(k);   // heroSkillControlKind
const meta = await load("src/battle/moba/presentation/heroStatusMeta.js");
const missing = [...snapIds].filter((id) => !meta.STATUS_META[id]);
ck("S1 引擎 statusEffects 的每一個 id 都在對照表（不再顯示英文 id）", missing.length === 0, missing.length ? `缺：${missing.join(",")}` : `${snapIds.size} 種`);
const fxByCat = {};
for (const m of Object.values(meta.STATUS_META)) (fxByCat[m.cat] ??= new Set()).add(m.fx);
const shieldFx = [...fxByCat.shield], controlFx = [...fxByCat.control];
ck("S2 護盾與控制不共用造型（包覆型 vs 頭頂／腳下）", shieldFx.every((f) => !controlFx.includes(f)), `shield ${shieldFx}／control ${controlFx}`);
ck("S3 HUD 兩處都讀同一份對照表", read("src/battle/ui/BattleHeroStrip.jsx").includes("statusMetaOf") && read("src/battle/ui/BattleHeroSheet.jsx").includes("statusMetaOf"));

// ── N ──
ck("N1 營地／大型目標底下的常駐 objective-ring 已不渲染", !code(read("src/battle/moba/render/MobaRuntimeStructures.jsx")).includes("objective-ring"));
ck("N2 rigged 野怪沒有 ringGeometry（contact ring 已移除）", !/ringGeometry/i.test(code(read("src/battle/moba/render/RiggedMobaRuntimeNeutrals.jsx"))));

// ── F ──
const fog = await load("src/battle/moba/presentation/fogOfWar.js");
const fogSrc = code(read("src/battle/moba/presentation/fogOfWar.js"));
ck("F1 迷霧模組不 import 引擎、store 或 React（純函式）", !/LogicEngine|useGameStore|profileStore|from "react"/.test(fogSrc));
const frame = {
  heroes: [
    { id: "b1", team: "blue", alive: true, world: { x: 0, z: 0 } },
    { id: "r1", team: "red", alive: true, world: { x: 10, z: 0 } },
    { id: "r2", team: "red", alive: true, world: { x: 400, z: 0 } },
  ],
  structures: [], minions: [{ id: "m1", team: "red", world: { x: 5, z: 0 } }, { id: "m2", team: "red", world: { x: 500, z: 0 } }],
  effects: [{ id: "e1", sourceId: "r2", targetId: "r1", targetWorld: { x: 600, z: 0 } }, { id: "e2", sourceId: "r2", targetId: "b1", targetWorld: { x: 0, z: 0 } }],
};
fog.applyFogToFrame(frame, "blue");
ck("F2 視野外敵方英雄標記 fogHidden、視野內不標", frame.heroes[2].fogHidden === true && frame.heroes[1].fogHidden === false && frame.heroes[0].fogHidden === false);
ck("F3 視野外敵方小兵從本幀移除", frame.minions.map((m) => m.id).join() === "m1");
ck("F4 迷霧中的特效：打不到我方視野 ⇒ 移除；打我方看得到的單位 ⇒ 保留", frame.effects.map((e) => e.id).join() === "e2");
ck("F5 迷霧預設關（View3D fogSide 預設 off）；Battle 與 Replay 以 blue 視角", /fogSide = "off"/.test(read("src/battle/moba/render/MobaRuntimeView3D.jsx"))
  && read("src/GameView.jsx").includes('fogSide="blue"') && read("src/screens/moba/MobaReplayScreen.jsx").includes('fogSide="blue"'));

// ── J ──
const { rulesFor } = await load("src/battle/moba/matchProgression.js");
ck("J1 objSkillV1 只在 v3 規則集（v1／v2 逐位元不變）", rulesFor("v3").objSkillV1 === true && !rulesFor("v1").objSkillV1 && !rulesFor("v2").objSkillV1);
const { LogicEngine } = await load("src/LogicEngine.js");
const { CHAMPIONS_100 } = await load("src/data/heroDatabase.js");
const { toEngineHeroSkills } = await load("src/battle/moba/skills/heroSkillGameplay.js");
const ids = CHAMPIONS_100.slice(0, 5).map((h) => h.id);
const roster = Object.fromEntries([...ids.map((id, i) => [`b${i + 1}`, { heroId: id }]), ...ids.map((id, i) => [`r${i + 1}`, { heroId: id }])]);
const countObjCasts = (skills) => {
  const e = new LogicEngine(42, null, { rules: "v3" });
  if (skills) e.configureHeroSkills(toEngineHeroSkills(roster));
  const nids = new Set(); for (const o of e.neutrals.list) { nids.add(o.id); for (const m of o.members ?? []) nids.add(m.id); }
  const seen = new Set(); let n = 0;
  for (let i = 0; i < 1200 && !e.over; i++) { e.tick(0.5); for (const f of e.fx) { if (seen.has(f.id)) continue; seen.add(f.id); if (String(f.ability ?? "").startsWith("hero:") && nids.has(f.targetId)) n++; } }
  return n;
};
const on = countObjCasts(true), off = countObjCasts(false);
ck("J2 hero skills 開啟：英雄會對野怪／龍／巴龍施法（前 10 分鐘）", on > 0, `${on} 次`);
ck("J3 hero skills 關閉：不會出現對物件施法（skill-off 不變）", off === 0, `${off} 次`);
ck("J4 塔不是技能目標（_objectiveSkillTarget 只看 dragon／baron／camps）", !/towers/.test(engine.slice(engine.indexOf("_objectiveSkillTarget(p, rule) {"), engine.indexOf("_heroSkillStep() {"))));

// ── C ──
const cam = await load("src/battle/cameraStore.js");
const ctrl = read("src/battle/ui/BattleCameraController.jsx");
ck("C1 四種鏡頭：導播／標準／近戰／全景", JSON.stringify(cam.CAMERA_SHOTS) === JSON.stringify(["auto", "tactical", "close", "wide"]));
const beatFor = new Function(`${ctrl.slice(ctrl.indexOf("export const BEAT_SHOT"), ctrl.indexOf("export default function")).replace(/export /g, "")}; return beatFor;`)();
ck("C2 導播節拍：擊殺 ⇒ 特寫；物件；團戰；交戰；巡線",
  beatFor(10, { intensity: 0.1 }, [{ t: 9, type: "KILL" }], false) === "punch"
  && beatFor(10, { intensity: 0.5 }, [], true) === "objective"
  && beatFor(10, { intensity: 0.7 }, [], false) === "fight"
  && beatFor(10, { intensity: 0.3 }, [], false) === "skirmish"
  && beatFor(10, { intensity: 0 }, [{ t: 1, type: "KILL" }], false) === "roam");
ck("C3 防暈眩：換鏡停留用真實時間、yaw 不動", /performance\.now\(\) \/ 1000/.test(ctrl) && /BEAT_DWELL = 3\.2/.test(ctrl) && !/yawDeg \+/.test(ctrl));

// ── R ──
const SV = await load("src/platform/contracts/simulationVersion.js");
ck("R1 moba-sim.v10 為目前版本、v9 保留、v9 的歷史重播明確拒絕", SV.MOBA_SIMULATION_VERSION === "moba-sim.v10"
  && SV.KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v9") && SV.canReplay("moba-sim.v9").ok === false);

console.log(`\nMOBA spectacle ＋ vision：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
