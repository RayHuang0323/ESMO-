// Sprint 29B5 — logical world scale, map synchronization, objective identity, and regression gate.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const A = [];
const ck = (name, condition) => A.push([name, !!condition]);
const pct = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p / 100)))] ?? NaN;
};

const data = await import(u("src/gameData.js"));
const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { SIM_RULES } = await import(u("src/battle/moba/matchProgression.js"));
const { MOBA_TACTICS, STANDARD_OPP_TACTIC, toEngineTactic } = await import(u("src/platform/contracts/MobaTacticConfig.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));
const {
  WORLD_BOUNDS, MAP_BOUNDS, WORLD_SIZE, WORLD_SCALE, LANES, RIVER, WALLS, BUSHES,
  BASE, FOUNTAIN, PITS, CAMPS, OBJECTIVE_PRESENTATION, laneLength, posOnLane, dist,
} = data;

const OLD = {
  size: 100,
  lanes: {
    top: [{x:11,y:82},{x:9,y:68},{x:8,y:52},{x:9,y:38},{x:12,y:26},{x:17,y:18},{x:26,y:13},{x:38,y:11},{x:52,y:10},{x:64,y:11},{x:75,y:13},{x:83,y:15}],
    mid: [{x:15,y:85},{x:24,y:76},{x:33,y:67},{x:42,y:58},{x:50,y:50},{x:58,y:42},{x:66,y:34},{x:74,y:26},{x:81,y:19},{x:86,y:15}],
    bot: [{x:15,y:88},{x:30,y:88},{x:45,y:87},{x:60,y:85},{x:73,y:82},{x:82,y:76},{x:87,y:64},{x:89,y:50},{x:89,y:36},{x:88,y:24},{x:86,y:17}],
  },
  fountain: { blue: {x:9,y:93}, red: {x:91,y:7} },
  pits: { dragon: {x:74,y:73}, baron: {x:33,y:34} },
  minionContact: 83.0,
  heroContactP50: 83.5,
  invasionEarliest: 15.5,
  moveSpeed: 4.5,
  minionWorldSpeed: 1.8,
};
const arc = (pts) => pts.slice(1).reduce((n, p, i) => n + dist(pts[i], p), 0);
const pointOn = (pts, t) => {
  const total = arc(pts), target = total * t;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const n = dist(pts[i - 1], pts[i]);
    if (walked + n >= target) {
      const f = (target - walked) / n;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    walked += n;
  }
  return pts.at(-1);
};
const laneArrival = (lanes, fountains, getter) => Object.fromEntries(["top", "mid", "bot"].map((lane) => {
  const b = getter(lanes[lane], 0.15, lane), r = getter(lanes[lane], 0.85, lane);
  return [lane, { blue: dist(fountains.blue, b), red: dist(fountains.red, r) }];
}));
const oldArrival = laneArrival(OLD.lanes, OLD.fountain, pointOn);
const newArrival = laneArrival(LANES, FOUNTAIN, (_, t, lane) => posOnLane(lane, t));

const refDir = path.join(ROOT, "docs/reference/moba-map");
const refs = fs.existsSync(refDir) ? fs.readdirSync(refDir) : [];
const images = refs.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const videos = refs.filter((f) => /\.(mp4|webm|mov)$/i.test(f));
ck(`1) reference pack 存在（圖片 ${images.length}、影片 ${videos.length}）`, images.length >= 2 && videos.length >= 1);
ck(`2) 世界邏輯尺寸由 ${OLD.size} 增至 ${WORLD_SIZE}，不是 camera/CSS scale`, WORLD_SIZE >= OLD.size * 2 && WORLD_BOUNDS.width === WORLD_SIZE && WORLD_BOUNDS.height === WORLD_SIZE);
ck("3) WORLD_BOUNDS / MAP_BOUNDS / WORLD_SIZE / WORLD_SCALE 為正式單一 metadata", MAP_BOUNDS === WORLD_BOUNDS && WORLD_SCALE > 0 && WORLD_BOUNDS.centerX === WORLD_SIZE / 2);
ck(`4) 三路弧長均顯著增加（${["top","mid","bot"].map((l) => `${l} ${laneLength(l).toFixed(1)}`).join(" / ")}）`, ["top","mid","bot"].every((l) => laneLength(l) > arc(OLD.lanes[l]) * 2));
ck("5) 雙方泉水到三路線上距離均增加至少 80%", ["top","mid","bot"].every((l) => newArrival[l].blue > oldArrival[l].blue * 1.8 && newArrival[l].red > oldArrival[l].red * 1.8));
const oldObjD = Object.values(OLD.pits).flatMap((pit) => [dist(OLD.fountain.blue, pit), dist(OLD.fountain.red, pit)]);
const newObjD = Object.values(PITS).flatMap((pit) => [dist(FOUNTAIN.blue, pit), dist(FOUNTAIN.red, pit)]);
ck("6) 泉水到 Dragon / Baron 距離均顯著增加", Math.min(...newObjD) > Math.min(...oldObjD) * 1.8);

const DT = 0.5;
const samples = [];
for (let seed = 1; seed <= 12; seed++) {
  const e = new LogicEngine(seed, null, { rules: "v3" });
  e.configureMatch({ blue: toEngineTactic(MOBA_TACTICS[0]), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  let minionHit = null, heroContact = null, firstTower = null;
  const killTs = [];
  const resolveKill = e._resolveKill.bind(e);
  e._resolveKill = (killer, victim) => { killTs.push(e.t); resolveKill(killer, victim); };
  const towerHp = Object.fromEntries(Object.entries(e.towers).map(([k, v]) => [k, v.hp]));
  while (!e.over && e.t < 2700) {
    e.tick(DT);
    if (minionHit == null && Object.values(e.lanes).some((l) => [...l.bm, ...l.rm].some((m) => m.hp < 130))) minionHit = e.t;
    if (heroContact == null) {
      const b = e.players.filter((p) => p.side === "blue" && !p.dead), r = e.players.filter((p) => p.side === "red" && !p.dead);
      if (b.some((p) => r.some((q) => dist(p.pos, q.pos) <= 8))) heroContact = e.t;
    }
    if (firstTower == null && Object.entries(e.towers).some(([k, v]) => towerHp[k] > 0 && v.hp <= 0)) firstTower = e.t;
  }
  samples.push({ minionHit, heroContact, firstTower, firstKill: killTs[0] ?? null, kills: killTs, duration: e.t });
}
const minionP50 = pct(samples.map((s) => s.minionHit), 50);
const heroP50 = pct(samples.map((s) => s.heroContact), 50);
const invasionEarliest = Math.min(...samples.map((s) => s.heroContact));
ck(`7) 小兵首次受傷增加（p50 ${minionP50.toFixed(1)}s > 舊 ${OLD.minionContact}s）`, minionP50 > OLD.minionContact + 20);
ck(`8) 英雄首次可接觸增加（p50 ${heroP50.toFixed(1)}s > 舊 ${OLD.heroContactP50}s）`, heroP50 > OLD.heroContactP50 + 15);
ck(`9) 戰術入侵最早接觸不再極端過早（最早 ${invasionEarliest.toFixed(1)}s > 舊 ${OLD.invasionEarliest}s）`, invasionEarliest >= 45);
ck("10) 英雄 / 小兵速度未依地圖倍率同步提高", SIM_RULES.v3.moveSpeed === OLD.moveSpeed && SIM_RULES.v3.minionWorldSpeed === OLD.minionWorldSpeed && WORLD_SIZE / OLD.size > 2);

const mirror = (p) => ({ x: WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX - p.x, y: WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY - p.y });
const fair = Object.values(PITS).every((pit) => Math.abs(dist(FOUNTAIN.blue, pit) - dist(FOUNTAIN.red, pit)) < 0.5) &&
  dist(mirror(BASE.blue), BASE.red) < 1e-9 && dist(mirror(FOUNTAIN.blue), FOUNTAIN.red) < 1e-9;
ck("11) 雙方基地、泉水與主要目標距離維持公平", fair);
ck("12) 三路、河道、牆體、草叢、雙側野區與 camps 可由資料辨識", Object.keys(LANES).length === 3 && RIVER.points.length >= 5 && WALLS.length >= 20 && BUSHES.length >= 8 && CAMPS.some((c) => c.side === "blue") && CAMPS.some((c) => c.side === "red"));
const identities = ["dragon", "baron", "blueBuff", "redBuff", "jungleCamp"].map((k) => OBJECTIVE_PRESENTATION[k]);
ck("13) Dragon / Baron / Blue Buff / Red Buff / Jungle Camp presentation metadata distinct", identities.every(Boolean) && new Set(identities.map((p) => p.silhouette)).size === 5 && new Set(identities.map((p) => p.icon)).size === 5);

const V3D = src("src/MobaView3D.jsx"), GV = src("src/GameView.jsx"), RS = src("src/screens/moba/MobaReplayScreen.jsx"), RB = src("src/battle/moba/replay/replayBuffer.js");
ck("14) 中立目標以程序化 silhouette 為主，無常駐光圈 / 目標 PointLight", /makeNeutralVisual/.test(V3D) && /wide-winged/.test(src("src/gameData.js")) && (V3D.match(/new THREE\.PointLight/g) ?? []).length <= 1);
ck("15) Minimap 與主場景共用 bounds / objective metadata", /WORLD_BOUNDS/.test(GV) && /mapNormX/.test(GV) && /presentationForObjective/.test(GV) && /WORLD_BOUNDS/.test(V3D));

clearReplay();
const replayEngine = new LogicEngine(29, null, { rules: "v3" });
beginReplayCapture({ seed: 29, config: { sprint: "29B5" } });
captureReplayFrame(replayEngine.snapshot()); replayEngine.tick(DT); captureReplayFrame(replayEngine.snapshot());
const replay = finalizeReplay({ matchId: "worldscale29b5" });
ck("16) Replay 保存同一 bounds / lanes / river 與 presentationKey，且舊 replay 有 100x100 fallback", replay?.mapMeta?.bounds?.width === WORLD_SIZE && replay.mapMeta.lanes.mid.length === LANES.mid.length && replay.mapMeta.river.points.length === RIVER.points.length && /legacyBounds/.test(RS) && /presentationForObjective/.test(RS) && /mapMeta/.test(RB));

const life = new LogicEngine(30, null, { rules: "v3" });
while (life.t < SIM_RULES.v3.dragonSpawn) life.tick(DT);
const spawnedFull = life.neutrals.dragon.alive && life.neutrals.dragon.hp === life.neutrals.dragon.maxHp;
life.neutrals.dragon.hp = 1;
const jungler = life.players.find((p) => p.side === "blue" && p.role === "jungle");
jungler.pos = { ...PITS.dragon }; jungler.sp.d.readyAt = life.t;
life._updateNeutralsV3(life.players.filter((p) => !p.dead), DT);
const slain = !life.neutrals.dragon.alive && life.neutrals.dragon.respawnAt > life.t;
life.t = life.neutrals.dragon.respawnAt; life._updateNeutralsV3(life.players.filter((p) => !p.dead), DT);
ck("17) Objective 真實 HP / death / respawn 生命週期維持 29B1", spawnedFull && slain && life.neutrals.dragon.alive && life.neutrals.dragon.hp === life.neutrals.dragon.maxHp);

const recall = new LogicEngine(31, null, { rules: "v3" });
const rp = recall.players.find((p) => p.id === "b1");
for (const q of recall.players.filter((p) => p.side === "red")) q.pos = { ...FOUNTAIN.red };
rp.pos = { x: WORLD_BOUNDS.centerX, y: WORLD_BOUNDS.centerY }; rp.hp = rp.maxHp * 0.1;
for (let i = 0; i < 40 && dist(rp.pos, FOUNTAIN.blue) > 1; i++) recall.tick(DT);
ck("18) Recall / fountain 行為仍使用新世界座標並可返回泉水", dist(rp.pos, FOUNTAIN.blue) < 12 && rp.hp > rp.maxHp * 0.1);
const visible = [src("src/battle/ui/BattleHUD.jsx"), src("src/battle/moba/tacticalComms.js"), RS, V3D].join("\n");
ck("19) 可見命名統一為 Dragon / Baron / Buff / Jungle Camp，內部 id 相容", /Dragon/.test(visible) && /Baron/.test(visible) && /Blue Buff/.test(V3D) && /Red Buff/.test(V3D) && /Jungle Camp/.test(V3D));
ck("20) 塔 / 主堡常態低亮、受擊 pulse、摧毀 FX，未增加大量 PointLight", /IDLE_EMISS = isNexus \? 0\.14 : 0\.06/.test(V3D) && /flashT \/ 0\.25/.test(V3D) && /spawnViewFx/.test(V3D) && (V3D.match(/new THREE\.PointLight/g) ?? []).length <= 1);

function runNode(script, shape, env = {}, timeout = 2400000) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout, env: { ...process.env, ...env } });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: false, code: e.status ?? -1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}
if (process.env.SKIP_NESTED === "1") {
  console.log("⚠ SKIP_NESTED=1：跳過 21–25 巢狀驗證（僅供開發迭代）");
} else {
  for (const [name, script, shape] of [
    ["21) pacing29b1 擊殺分布", "tools/check_moba_pacing29b1.mjs", /25\/25 通過/],
    ["22) presentation29b2", "tools/check_moba_presentation29b2.mjs", /12\/12 通過/],
    ["23) controls29b3", "tools/check_moba_controls29b3.mjs", /18\/18 通過/],
    ["24) recovery29b4（Quick complete / Replay / 10 portraits）", "tools/check_moba_recovery29b4.mjs", /21\/21 通過/],
  ]) {
    const r = runNode(script, shape, { SKIP_NESTED: "1" });
    ck(`${name}（exit=${r.code}，輸出形狀符合）`, r.code === 0 && r.ok);
    if (!(r.code === 0 && r.ok)) console.log(r.out);
  }
  const runtime = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  const runtimeShape = /Sprint28 verifier 29\/29/.test(runtime.out) && /Sprint23 verifier 28\/28/.test(runtime.out) && /regress/.test(runtime.out) && /regress2/.test(runtime.out) && /npm run build/.test(runtime.out);
  ck(`25) runtime29 + S23–S28 + regress / regress2 / build（exit=${runtime.code}，44/44 與必要輸出形狀）`, runtime.code === 0 && runtime.ok && runtimeShape);
  if (!(runtime.code === 0 && runtime.ok && runtimeShape)) console.log(runtime.out);
}

let passed = 0;
for (const [name, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (ok) passed++; }
console.log(`\n${passed}/${A.length} 通過`);
console.log(`\n=== S29B5 travel / pacing sample（12 seeds）===`);
console.log(`泉水→線上（世界單位） blue ${Object.values(newArrival).map((v) => v.blue.toFixed(1)).join("/")}；red ${Object.values(newArrival).map((v) => v.red.toFixed(1)).join("/")}`);
console.log(`泉水→Dragon/Baron（秒@4.5） ${newObjD.map((d) => (d / SIM_RULES.v3.moveSpeed).toFixed(1)).join("/")}`);
console.log(`小兵首次受傷 p50=${minionP50.toFixed(1)}s；英雄首次接觸 p50=${heroP50.toFixed(1)}s；最早=${invasionEarliest.toFixed(1)}s`);
console.log(`首殺 p50=${pct(samples.map((s) => s.firstKill), 50).toFixed(1)}s；首塔 p50=${pct(samples.map((s) => s.firstTower), 50).toFixed(1)}s；比賽時長 p50=${(pct(samples.map((s) => s.duration), 50) / 60).toFixed(2)}分`);
console.log(`5/10/15/20 分擊殺 p50=${[300,600,900,1200].map((t) => pct(samples.map((s) => s.kills.filter((k) => k <= t).length), 50)).join("/")}`);
process.exit(passed === A.length ? 0 : 1);
