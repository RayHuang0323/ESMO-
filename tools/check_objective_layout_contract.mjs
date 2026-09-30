#!/usr/bin/env node
// ============================================================================
//  tools/check_objective_layout_contract.mjs — Objective Layout Variant 契約（moba-sim.v16）
//
//  用法：node tools/check_objective_layout_contract.mjs
//  流向：Match config（useLocalServer 唯一推導點）→ LogicEngine → snapshot → 呈現（小地圖／導播／戰報／地形／標記）→ Replay
//    L1 缺值／不明值一律 STANDARD（舊資料向下相容）；明確指定優先於 seed 推導
//    L2 推導對兩邊期望值相同（隨機 seed 50±1.5%）；正式 seed 一律奇數（|1）時仍平衡
//    L3 預設（從未設定）與明確 STANDARD：模擬串流逐位元相同；bare 串流沒有 objectiveLayout 欄位
//    L4 SWAPPED：巨龍在上方坑、巴龍在下方坑；snapshot.objectiveLayout／objectives[] 位置一致
//    L5 開場後（t>0）再設定一律無效（整場不換坑）
//    L6 整場固定：每次重生都在同一個坑
//    L7 frame adapter 帶 objectiveLayout；舊 snapshot ⇒ STANDARD
//    L8 Replay：finalize 帶 objectiveLayout；重播 toSnapshot 帶回；舊 replay 無欄位 ⇒ STANDARD
//    L9 導播（battleFocus）與戰報（battleEvents）在 SWAPPED 讀本場坑位
//    L10 原始碼：正式呈現檔不得直接讀 PITS 坑位；推導只在 useLocalServer 一處
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const [C, G, LE, AD, RB, RS, BF, BE] = await Promise.all([
  load("src/platform/contracts/objectiveLayout.js"), load("src/gameData.js"), load("src/LogicEngine.js"),
  load("src/battle/moba/map/mobaRuntimeMapAdapter.js"), load("src/battle/moba/replay/replayBuffer.js"),
  load("src/battle/moba/replay/replayPresentationSource.js"), load("src/battle/battleFocus.js"), load("src/battle/battleEvents.js"),
]);
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
const { STANDARD, SWAPPED } = C.OBJECTIVE_LAYOUT;

// L1
ck("L1 缺值／不明值 ⇒ STANDARD；明確指定優先", C.normalizeObjectiveLayout(undefined) === STANDARD && C.normalizeObjectiveLayout("x") === STANDARD
  && C.objectiveLayoutOf({}) === STANDARD && C.resolveObjectiveLayout({ explicit: SWAPPED, seed: 1 }) === SWAPPED
  && C.resolveObjectiveLayout({ explicit: STANDARD, seed: 2 }) === STANDARD);

// L2
let rs = 12345; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0));
const split = (seeds) => seeds.reduce((a, s) => (a[C.objectiveLayoutForSeed(s)]++, a), { STANDARD: 0, SWAPPED: 0 });
const r1 = split(Array.from({ length: 20000 }, rnd)), r2 = split(Array.from({ length: 20000 }, () => rnd() | 1));
const within = (r) => Math.abs(r.SWAPPED / (r.SWAPPED + r.STANDARD) - 0.5) < 0.015;
ck("L2 推導平衡（隨機 seed、正式奇數 seed）", within(r1) && within(r2), `${JSON.stringify(r1)} ${JSON.stringify(r2)}`);

// L3
const run = (seed, layout, ticks = 900) => {
  const e = new LE.LogicEngine(seed);
  if (layout !== undefined) e.configureObjectiveLayout(layout);
  const out = [];
  for (let i = 0; i < ticks && !e.over; i++) { e.tick(0.5); if (i % 30 === 0) { const s = e.snapshot(); delete s.objectiveLayout; out.push(JSON.stringify(s)); } }
  return { e, out };
};
const a = run(7, undefined), b = run(7, STANDARD);
ck("L3 從未設定＝明確 STANDARD（串流逐位元相同）；bare 串流無 objectiveLayout 欄位",
  a.out.join("\n") === b.out.join("\n") && !("objectiveLayout" in new LE.LogicEngine(7).snapshot()), `frames ${a.out.length}`);

// L4
const e4 = new LE.LogicEngine(9); e4.configureObjectiveLayout(SWAPPED);
const s4 = e4.snapshot();
const objPos = (s, id) => (s.objectives ?? []).find((o) => o.id === id)?.pos;
ck("L4 SWAPPED：巨龍在上方坑、巴龍在下方坑（引擎＋snapshot）",
  same(e4._pitOf("dragon"), G.PITS.baron) && same(e4._pitOf("baron"), G.PITS.dragon)
  && same(e4.neutrals.dragon.homePos, G.PITS.baron) && s4.objectiveLayout === SWAPPED
  && same(objPos(s4, "dragon"), G.PITS.baron) && same(objPos(s4, "baron"), G.PITS.dragon));

// L5
const e5 = new LE.LogicEngine(11); e5.configureObjectiveLayout(STANDARD); e5.tick(0.5);
const r5 = e5.configureObjectiveLayout(SWAPPED);
ck("L5 開場後再設定無效（整場不換坑）", r5 === false && e5.objectiveLayout === STANDARD && same(e5._pitOf("dragon"), G.PITS.dragon));

// L6
const e6 = new LE.LogicEngine(13); e6.configureObjectiveLayout(SWAPPED);
let spawns = 0, moved = 0, wasAlive = false;
for (let i = 0; i < 4200 && !e6.over; i++) {
  e6.tick(0.5);
  const d = e6.neutrals.dragon;
  if (d.alive && !wasAlive) { spawns++; if (!same(d.homePos, G.PITS.baron)) moved++; }
  wasAlive = d.alive;
}
ck("L6 整場固定：每次巨龍重生都在同一個坑", spawns >= 2 && moved === 0, `重生 ${spawns} 次、換坑 ${moved} 次`);

// L7
ck("L7 frame adapter 帶 objectiveLayout；舊 snapshot ⇒ STANDARD",
  AD.adaptRuntimeMapFrame(s4).objectiveLayout === SWAPPED && AD.adaptRuntimeMapFrame(a.e.snapshot()).objectiveLayout === STANDARD);

// L8
RB.beginReplayCapture({ seed: 9, config: {}, roster: null, objectiveLayout: SWAPPED });
const e8 = new LE.LogicEngine(9); e8.configureObjectiveLayout(SWAPPED);
for (let i = 0; i < 40; i++) { e8.tick(0.5); RB.captureReplayFrame(e8.snapshot()); }
const rep = RB.finalizeReplay({ matchId: "layout-l8" });
const src = RS.createReplaySource(rep);
const f0 = src.getState?.().snapshot ?? null;
const oldRep = { ...rep }; delete oldRep.objectiveLayout;
const oldSrc = RS.createReplaySource(oldRep);
ck("L8 Replay 帶 objectiveLayout；重播 snapshot 帶回；舊 replay ⇒ STANDARD",
  rep?.objectiveLayout === SWAPPED && (f0 ? f0.objectiveLayout === SWAPPED : true)
  && C.objectiveLayoutOf(oldRep) === STANDARD && !!oldSrc,
  `replay.objectiveLayout=${rep?.objectiveLayout} snapshot=${f0?.objectiveLayout ?? "（source 無 getState，改由 L8b）"}`);
if (!f0) {
  //  直接走 toSnapshot 等價路徑：seek 到第一幀
  src.seek?.(0);
  const s = src.getState?.()?.snapshot;
  ck("L8b 重播 seek 後的 snapshot 帶 objectiveLayout", s?.objectiveLayout === SWAPPED, String(s?.objectiveLayout));
}

// L9
//  兩名對立英雄在坑兩側相距 8.4（> 交戰半徑 8、各距坑 4.2 < 9）⇒ 只會觸發「物件爭奪」焦點
const P = G.PITS.baron;
const players = [{ id: "b1", side: "blue", pos: { x: P.x - 4.2, y: P.y }, dead: false }, { id: "r1", side: "red", pos: { x: P.x + 4.2, y: P.y }, dead: false }];
const fz = BF.computeFocus({ ts: 300, objectiveLayout: SWAPPED, players, fx: [], dragon: { alive: true }, baron: { alive: false } });
ck("L9a 導播：SWAPPED 時巨龍爭奪焦點在上方坑", fz?.kind === "objective" && fz.key === "dragon" && same(fz, P),
  JSON.stringify(fz && { kind: fz.kind, key: fz.key, x: fz.x, y: fz.y }));
//  戰報：正式引擎（SWAPPED）跑到巨龍第一次刷新，逐 tick 餵 BattleEventTracker
const tr = new BE.BattleEventTracker(), e9 = new LE.LogicEngine(21); e9.configureObjectiveLayout(SWAPPED);
let spawnEv = null;
for (let i = 0; i < 700 && !spawnEv && !e9.over; i++) {
  e9.tick(0.5);
  const out = tr.update(e9.snapshot()) ?? [];
  spawnEv = (Array.isArray(out) ? out : []).find((x) => x.type === "OBJECTIVE_SPAWN" && x.data?.objective === "dragon") ?? null;
}
ck("L9b 戰報：SWAPPED 時巨龍刷新事件位置在上方坑", !!spawnEv && same(spawnEv.pos, P), JSON.stringify(spawnEv?.pos ?? null));

// L10
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PRESENTATION = ["src/GameView.jsx", "src/battle/battleFocus.js", "src/battle/battleEvents.js", "src/battle/moba/tacticalComms.js",
  "src/battle/moba/replay/replayPresentationSource.js", "src/battle/moba/map/mobaRuntimeMapAdapter.js"];
const direct = PRESENTATION.filter((f) => /\bPITS\s*(\.|\[)\s*("?)(dragon|baron|key|k)\b/.test(strip(fs.readFileSync(path.join(ROOT, f), "utf8"))));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
const derive = walk(path.join(ROOT, "src")).filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("objectiveLayout.js"))
  .filter((f) => /\b(objectiveLayoutForSeed|resolveObjectiveLayout)\s*\(/.test(strip(fs.readFileSync(f, "utf8"))))
  .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
ck("L10 正式呈現檔不直接讀 PITS 坑位；推導只在 useLocalServer 一處",
  direct.length === 0 && derive.length === 1 && derive[0] === "src/useLocalServer.js", `直接讀 PITS：${JSON.stringify(direct)}；推導點：${JSON.stringify(derive)}`);

console.log(`\nObjective Layout 契約：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
