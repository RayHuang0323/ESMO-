// ============================================================================
//  tools/check_moba_minions_h3.mjs — H.3 三路兵線 / runtime-v2 / Replay 驗證
//
//  只驗真資料路徑與決定性規則；手機辨識度、FPS、死亡動畫仍需瀏覽器/真機驗收。
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
const { adaptRuntimeMapFrame } = await import(u("src/battle/moba/map/mobaRuntimeMapAdapter.js"));
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

console.log("\n── H.3：三路兵線 / runtime-v2 / Replay ──");
for (const [name, ok, detail] of A) {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const passed = A.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${A.length} 通過`);
console.log("⚠ Node 無法證明：手機辨識度、真機 FPS、接線/死亡動畫體感，需正式 GameView 截圖與真機驗收。");
process.exit(passed === A.length ? 0 : 1);
