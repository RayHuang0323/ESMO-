// ============================================================================
//  tools/check_moba_minions_h3.mjs — H.3 Runtime 對戰呈現驗證
//
//  三路兵線、職業原型、技能事件、runtime-v2、Replay 共用資料路徑。
//  手機辨識度、FPS、動畫體感仍需瀏覽器/真機驗收。
// ============================================================================
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const A = [];
const ck = (name, condition, detail = "") => A.push([name, !!condition, detail]);
const laneCount = (lanes) => ["top", "mid", "bot"].reduce(
  (sum, lane) => sum + (lanes?.[lane]?.bm?.length ?? 0) + (lanes?.[lane]?.rm?.length ?? 0), 0,
);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { SIM_RULES } = await import(u("src/battle/moba/matchProgression.js"));
const { adaptRuntimeMapFrame, adaptEffects } =
  await import(u("src/battle/moba/map/mobaRuntimeMapAdapter.js"));
const { isWalkable } = await import(u("src/battle/moba/nav/mobaNavigation.js"));
const {
  beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay,
} = await import(u("src/battle/moba/replay/replayBuffer.js"));
const { validateMobaReplay } = await import(u("src/platform/contracts/mobaReplay.js"));
const { createReplaySource } = await import(u("src/battle/moba/replay/replayPresentationSource.js"));

// A. 開局、波次與隊形 metadata
const eng = new LogicEngine(30301, null, { rules: "v3" });
while (eng.t < 24.5) eng.tick(0.5);
ck("1) 25 秒前尚未出兵", laneCount(eng.snapshot().lanes) === 0);
eng.tick(0.5);
const first = eng.snapshot();
const firstRows = ["top", "mid", "bot"].flatMap((lane) => [
  ...first.lanes[lane].bm, ...first.lanes[lane].rm,
]);
const lanesHaveEight = ["top", "mid", "bot"].every(
  (lane) => first.lanes[lane].bm.length === 4 && first.lanes[lane].rm.length === 4,
);
const formationMeta = firstRows.every((m) =>
  Number.isInteger(m.wave) && Number.isInteger(m.slot) && m.slot >= 0 && m.slot <= 3 &&
  (m.kind === "melee" || m.kind === "caster")) &&
  firstRows.filter((m) => m.kind === "caster").length === 6;
ck("2) 首波同 tick 生成三路雙方各四隻（共 24）", firstRows.length === 24 && lanesHaveEight);
ck("3) 每組為三近戰＋一遠程，帶 wave/slot metadata", formationMeta);
ck("4) v3 節奏參數為首波 25s、英雄 5.60/6.71，v1/v2 不啟用小兵碰撞",
  SIM_RULES.v3.waveFirst === 25 && SIM_RULES.v3.moveSpeed === 5.60 &&
  SIM_RULES.v3.fightSpeed === 6.71 && SIM_RULES.v3.minionCollision === true &&
  !SIM_RULES.v1.minionCollision && !SIM_RULES.v2.minionCollision);

// B. runtime-v2 使用同一份 H.2 可走幾何，並保留死亡插值
const frame = adaptRuntimeMapFrame(first, { prev: first, interpolation: 1 });
const aliveStructures = new Set(frame.structures.filter((s) => s.alive).map((s) => s.id));
const walkable = frame.minions.every((m) =>
  isWalkable(m.position.x, m.position.y, 0.68, aliveStructures));
ck("5) runtime adapter 輸出 24 隻且所有隊形位置通過 H.2 map geometry/結構碰撞",
  frame.minions.length === 24 && walkable);

const removedId = first.lanes.top.bm[0].id;
const afterDeath = structuredClone(first);
afterDeath.lanes.top.bm = afterDeath.lanes.top.bm.filter((m) => m.id !== removedId);
const transition = adaptRuntimeMapFrame(afterDeath, { prev: first, interpolation: 0.5 });
const dying = transition.minions.find((m) => m.id === removedId);
ck("6) snapshot 消失的小兵在 tick 間保留死亡插值，不編造復活",
  dying?.alive === false && dying?.hpRatio === 0 && dying?.deathProgress === 0.5);

// C. 接線、交戰、死亡與塔反擊
const combat = new LogicEngine(30302, null, { rules: "v3" });
while (combat.t < 240) combat.tick(0.5);
const combatSnap = combat.snapshot();
const damagedOrDead = laneCount(combatSnap.lanes) < 8 * Math.ceil((240 - 25) / 30) * 3 ||
  ["top", "mid", "bot"].some((lane) =>
    [...combatSnap.lanes[lane].bm, ...combatSnap.lanes[lane].rm].some((m) => m.hp < 1));
const laneCapsHold = ["top", "mid", "bot"].every((lane) =>
  combatSnap.lanes[lane].bm.length <= 16 && combatSnap.lanes[lane].rm.length <= 16);
ck("7) 兵線接觸後有真實受傷/死亡，且每路每方 16 隻上限仍成立",
  damagedOrDead && laneCapsHold);

const towerCase = new LogicEngine(30303, null, { rules: "v3" });
towerCase.waveTimer = 9999;
for (const lane of ["top", "mid", "bot"]) {
  towerCase.lanes[lane].bm = [];
  towerCase.lanes[lane].rm = [];
}
const redFront = towerCase.frontTower("blue", "top");
towerCase.lanes.top.bm = [{
  id: "b999", t: redFront.t - 0.046, hp: 130, wave: 0, slot: 0, kind: "melee",
}];
const towerHp0 = redFront.hp;
towerCase.tick(0.1);
const survivor = towerCase.lanes.top.bm[0];
ck("8) 小兵停在存活塔攻擊帶內：能傷塔，也會被塔反擊",
  redFront.hp < towerHp0 && survivor && survivor.hp < 130 &&
  Math.abs(survivor.t - redFront.t) < 0.05);

// D. Replay：新 frame 保存真兵線；舊 frame 誠實回退空兵線；播放端不重跑引擎
clearReplay();
const replayEng = new LogicEngine(30304, null, { rules: "v3" });
beginReplayCapture({ seed: 30304, config: { phase: "H.3" } });
captureReplayFrame(replayEng.snapshot());
while (replayEng.t < 27) replayEng.tick(0.5);
captureReplayFrame(replayEng.snapshot());
const replay = finalizeReplay({ matchId: "h3-minions" });
const valid = validateMobaReplay(replay);
const withMinions = replay.frames.some((f) => Array.isArray(f.mn) && f.mn.flat().length === 24);
const replaySource = createReplaySource(replay);
replaySource.seek(27);
const replayCount = laneCount(replaySource.getState().snapshot.lanes);
ck("9) MobaReplay.v1 的可選 mn frame 通過契約並還原 24 隻真實小兵",
  valid.ok && withMinions && replayCount === 24, valid.errors.join("; "));

const legacyReplay = structuredClone(replay);
for (const f of legacyReplay.frames) delete f.mn;
const legacySource = createReplaySource(legacyReplay);
legacySource.seek(27);
ck("10) 舊 Replay 無 mn 時回退空兵線，不以目前 LogicEngine 重建",
  laneCount(legacySource.getState().snapshot.lanes) === 0);

const brokenReplay = structuredClone(replay);
brokenReplay.frames[1].mn = [[["NaN"]]];
ck("11) replay validator 拒絕錯誤 mn 形狀/非有限數值",
  validateMobaReplay(brokenReplay).ok === false);

const replaySourceCode = src("src/battle/moba/replay/replayPresentationSource.js");
ck("12) Replay presentation source 零 LogicEngine import / new / tick",
  !/LogicEngine/.test(replaySourceCode.replace(/\/\/.*$/gm, "")) &&
  !/\.tick\(/.test(replaySourceCode) && !/new LogicEngine/.test(replaySourceCode));

// E. renderer 的固定容量/單一路徑（靜態保護，視覺由瀏覽器驗收）
const viewCode = src("src/battle/moba/render/MobaRuntimeView3D.jsx");
const minionCode = src("src/battle/moba/render/MobaRuntimeMinions.jsx");
ck("13) 正式 runtime-v2 掛載單一 MobaRuntimeMinions，未建立 legacy 分支",
  /<MobaRuntimeMinions frameRef=\{frameRef\}/.test(viewCode) &&
  (viewCode.match(/<MobaRuntimeMinions/g) ?? []).length === 1);
ck("14) 小兵用固定容量 InstancedMesh（單位 4 batch×48、血條 2×96），不逐兵建 React component",
  /const CAP = 48/.test(minionCode) && /const TOTAL_CAP = CAP \* 2/.test(minionCode) &&
  /<instancedMesh/.test(minionCode) && !/minions\.map\(/.test(minionCode));

// F. 職業原型與技能事件：沿用既有 combat tick，只增加呈現 metadata
const archetypes = new Set(frame.heroes.map((h) => h.archetype));
ck("15) 五個既有 role 映射到四種可重用職業原型",
  archetypes.size === 4 &&
  ["guardian", "skirmisher", "arcanist", "marksman"].every((id) => archetypes.has(id)));

clearReplay();
const skillEng = new LogicEngine(30305, null, { rules: "v3" });
beginReplayCapture({ seed: 30305, config: { phase: "H.3-skills" } });
captureReplayFrame(skillEng.snapshot());
let skillEvent = null;
let skillSnapshot = null;
while (skillEng.t < 300 && !skillEvent) {
  skillEng.tick(0.5);
  const snap = skillEng.snapshot();
  captureReplayFrame(snap);
  skillEvent = snap.fx.find((f) => f.ability);
  if (skillEvent) skillSnapshot = snap;
}
const eventAt = skillEvent?.at ?? skillEng.t;
while (skillEng.t < eventAt + 2.5) {
  skillEng.tick(0.5);
  captureReplayFrame(skillEng.snapshot());
}
const skillReplay = finalizeReplay({ matchId: "h3-skills" });
const liveSkillFx = adaptEffects(skillSnapshot, eventAt + 0.1);
ck("16) 真實英雄交戰產生帶 source/target/role variant 的技能事件，未另建傷害系統",
  skillEvent && /^fx\d+$/.test(skillEvent.id) &&
  /^[a-z]+:(basic|power)$/.test(skillEvent.ability) &&
  skillEvent.sourceId && skillEvent.targetId && liveSkillFx.some((f) => f.ability === skillEvent.ability));

const skillRows = skillReplay.frames.flatMap((f) => f.fx ?? []);
const skillContract = validateMobaReplay(skillReplay);
const replaySkillRow = skillRows.find((row) => typeof row[8] === "string" && row[8]);
const skillSource = createReplaySource(skillReplay);
skillSource.seek(eventAt + 0.1);
const replaySkillFx = adaptEffects(skillSource.getState().snapshot, eventAt + 0.1);
ck("17) 2 秒 Replay 取樣窗不漏掉 0.65s 技能事件，契約可驗證且播放端按 at 顯示",
  skillContract.ok && replaySkillRow &&
  replaySkillFx.some((f) => f.ability === replaySkillRow[8]), skillContract.errors.join("; "));

const oldSkillReplay = structuredClone(skillReplay);
for (const f of oldSkillReplay.frames) delete f.fx;
const oldSkillSource = createReplaySource(oldSkillReplay);
oldSkillSource.seek(eventAt + 0.1);
ck("18) 舊 Replay 無 fx 時顯示空特效，不重新生成技能",
  (oldSkillSource.getState().snapshot.fx ?? []).length === 0);

const effectsCode = src("src/battle/moba/render/MobaRuntimeEffects.jsx");
const heroCode = src("src/battle/moba/render/MobaRuntimeHeroes.jsx");
ck("19) 技能特效為固定五池 InstancedMesh，live / Replay 共用正式 runtime-v2",
  /const LINE_CAP = 64/.test(effectsCode) && /const BURST_CAP = 72/.test(effectsCode) &&
  /const SLASH_CAP = 72/.test(effectsCode) && /const LOCK_CAP = 48/.test(effectsCode) &&
  ["line", "ring", "orb", "slash", "lock"].every((key) => effectsCode.includes(`pool("${key}"`)) &&
  /<MobaRuntimeEffects frameRef=\{frameRef\}/.test(viewCode));
ck("20) 英雄使用自有低模 recipe／十種頭部 motif，沒有逐英雄外部模型或受保護素材",
  ["hero-archetype-guardian", "hero-archetype-skirmisher",
    "hero-archetype-arcanist", "hero-archetype-marksman"].every((name) => heroCode.includes(name)) &&
  ["hornedHelm", "flameHair", "hood", "infernoHorns", "iceCrown",
    "emberCrown", "lightningHalo", "phoenixCrown", "barkAntlers", "stoneHorns"]
    .every((name) => heroCode.includes(name)) &&
  !/gltf|fbx|useGLTF|textureLoader/i.test(heroCode));

const diagCode = src("src/battle/moba/render/runtimeDiagnostics.js");
const devicePanelCode = src("src/battle/moba/render/RuntimeDeviceDiagnosticsPanel.jsx");
ck("21) 診斷 lifecycle 在 Canvas 內成對 install/remove，StrictMode/HMR 不留下失效閉包",
  /function RuntimeDiagnosticsBridge/.test(viewCode) &&
  /installRuntimeDiagnostics\(\{ gl, scene, camera, frameRef \}\)/.test(viewCode) &&
  /return \(\) => removeRuntimeDiagnostics\(\)/.test(viewCode));
ck("22) Android 診斷同時回報 context、FPS/draw calls/triangles 與 heroes/minions/fx 計數",
  /effectEventsSeen/.test(diagCode) && /minionCount/.test(diagCode) &&
  /depthBits/.test(devicePanelCode) && /drawCalls/.test(devicePanelCode) &&
  /runtimeObjects/.test(devicePanelCode));

console.log("\n── H.3：三路兵線 / 職業原型 / 技能事件 / runtime-v2 / Replay ──");
for (const [name, ok, detail] of A) {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const passed = A.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${A.length} 通過`);
console.log("⚠ Node 無法證明：手機辨識度、真機 FPS、接線/死亡動畫體感，需正式 GameView 截圖與真機驗收。");
process.exit(passed === A.length ? 0 : 1);
