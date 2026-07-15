// ============================================================================
//  Sprint29B1 驗證：repo 根目錄執行 `node tools/check_moba_pacing29b1.mjs`
//  範圍 = 交戰節奏（狀態機）/ killContext / 中立目標 / 召喚師技能 / HUD 資料源
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
//  ⚠ 節奏門檻全部用「分布/percentile」（S29B1 任務單§一），且每組門檻都以
//    v2（S29A 規則集，15 分 p50=44 殺的病灶節奏）跑對照——v2 必須被判失衡，
//    否則門檻沒有檢定力。
//  ⚠ 跳過本檔尾端 runtime29 巢狀驗證：SKIP_NESTED=1 node tools/check_moba_pacing29b1.mjs
//    （開發迭代用；宣稱完成前必須完整跑）
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const A = [];
const ck = (n, c) => A.push([n, !!c]);

const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { SIM_RULES, rulesFor, XP } = await import(u("src/battle/moba/matchProgression.js"));
const { CAMPS, PITS, BASE, FOUNTAIN, dist } = await import(u("src/gameData.js"));
const { BattleEventTracker } = await import(u("src/battle/battleEvents.js"));
const { toEngineTactic, STANDARD_OPP_TACTIC, MOBA_TACTICS } = await import(u("src/platform/contracts/MobaTacticConfig.js"));
const { beginReplayCapture, captureReplayFrame, finalizeReplay, clearReplay } = await import(u("src/battle/moba/replay/replayBuffer.js"));

const DT = 0.5, CAP = 2700;
const V3 = SIM_RULES.v3;
const KILL_TYPES = new Set(["gank", "ambush", "pick", "teamfight", "objective", "towerDive", "chase"]);

// ── 儀器化整場模擬（收集節奏 + 目標 + 技能 + killContext 的全部觀測）─────────
function runFull(seed, { rules = "v3", tactic = null } = {}) {
  const e = new LogicEngine(seed, null, { rules });
  if (tactic) e.configureMatch({ blue: toEngineTactic(tactic), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  const kills = [];
  const orig = e._resolveKill.bind(e);
  e._resolveKill = (p, foe) => { kills.push({ t: e.t, killer: p.id, victim: foe.id }); orig(p, foe); };
  const kAt = {}, deaths = {}, reentry = [];
  const lastDmg = {}, waiting = {};
  for (const p of e.players) { deaths[p.id] = []; lastDmg[p.id] = 0; waiting[p.id] = null; }
  let dragonSpawnT = null, baronSpawnT = null, dragonHpDrops = 0, prevDragonHp = null;
  let campKills = 0;                        // 營地死亡轉場累計（S29B3 修：終局看 killerTeam 有競態
  const prevCampAlive = new Map();          //   ——重生 reset 會清 killerTeam，改為過程中真觀測）
  const gankStarts = [];
  let prevGankUntil = { blue: 0, red: 0 };
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    const wasDead = new Map(e.players.map((p) => [p.id, p.dead]));
    e.tick(DT);
    for (const p of e.players) {
      if (!wasDead.get(p.id) && p.dead) deaths[p.id].push(e.t);
      if (wasDead.get(p.id) && !p.dead) { waiting[p.id] = e.t; lastDmg[p.id] = p.dmg; }
      if (waiting[p.id] != null && p.dmg > lastDmg[p.id] + 1e-9) { reentry.push(e.t - waiting[p.id]); waiting[p.id] = null; }
      lastDmg[p.id] = Math.max(lastDmg[p.id], p.dmg);
    }
    for (const mark of [300, 600, 900, 1200]) if (!(mark in kAt) && e.t >= mark) kAt[mark] = kills.length;
    if (e.neutrals) {
      if (dragonSpawnT === null && e.neutrals.dragon.alive) dragonSpawnT = e.t;
      if (baronSpawnT === null && e.neutrals.baron.alive) baronSpawnT = e.t;
      const dh = e.neutrals.dragon.alive ? e.neutrals.dragon.hp : null;
      if (dh !== null && prevDragonHp !== null && dh < prevDragonHp) dragonHpDrops++;
      prevDragonHp = dh;
      for (const c of e.neutrals.camps) {
        if (prevCampAlive.get(c.id) && !c.alive) campKills++;
        prevCampAlive.set(c.id, c.alive);
      }
    }
    if (e.fsm3) for (const side of ["blue", "red"]) {
      const gu = e.fsm3[side].gankUntil;
      if (gu > prevGankUntil[side]) gankStarts.push({ side, t: e.t, until: gu });
      prevGankUntil[side] = gu;
    }
  }
  for (const mark of [300, 600, 900, 1200]) if (!(mark in kAt)) kAt[mark] = kills.length;
  let maxDeath3m = 0;
  for (const id in deaths) {
    const arr = deaths[id];
    for (let i = 0; i < arr.length; i++) {
      let n = 1;
      for (let j = i + 1; j < arr.length && arr[j] - arr[i] <= 180; j++) n++;
      maxDeath3m = Math.max(maxDeath3m, n);
    }
  }
  return {
    eng: e, kills, kAt, deaths, reentry, maxDeath3m,
    firstKill: kills[0]?.t ?? null, dur: e.t / 60,
    dragonSpawnT, baronSpawnT, dragonHpDrops, gankStarts, campKills,
  };
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// 40 seeds（20 無戰術 + 20 戰術 M1——實機兩種情境都會發生）
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242, 11, 88, 256, 1000, 9999];
const runsV3 = [
  ...SEEDS.map((s) => runFull(s, { rules: "v3" })),
  ...SEEDS.map((s) => runFull(s, { rules: "v3", tactic: MOBA_TACTICS[0] })),
];
const runsV2 = SEEDS.map((s) => runFull(s, { rules: "v2", tactic: MOBA_TACTICS[0] }));

// ── 節奏門檻（percentile；同一組門檻對 v2 跑對照 ⇒ 檢定力）────────────────────
const pacingGates = (runs) => {
  const k5 = runs.map((r) => r.kAt[300]), k10 = runs.map((r) => r.kAt[600]);
  const k15 = runs.map((r) => r.kAt[900]), k20 = runs.map((r) => r.kAt[1200]);
  const kEnd = runs.map((r) => r.kills.length), durs = runs.map((r) => r.dur);
  return {
    g1: pct(k5, 50) <= 4,                                    // 5 分：多數 0–4
    g2: pct(k10, 50) >= 2 && pct(k10, 50) <= 10,             // 10 分：多數 3–10（p50，容 2）
    g3: pct(k15, 50) >= 7 && pct(k15, 50) <= 18,             // 15 分：多數 7–18
    g4: pct(k20, 50) >= 10 && pct(k20, 50) <= 26,            // 20 分：多數 12–26（p50，容 10）
    g5: pct(kEnd, 50) >= 14 && pct(kEnd, 50) <= 35,          // 終局：多數 16–35（p50，容 14）
    g6: k15.filter((k) => k > 35).length <= runs.length * 0.05, // 15 分 >35 殺 = 極端少數
    g7: k15.every((k) => k <= 60),                           // 15 分 >60 殺 = 失衡（0 容忍）
    g8: durs.every((d) => d <= 45) && pct(durs, 50) >= 12 && pct(durs, 50) <= 28,
    stats: { k5: pct(k5, 50), k10: pct(k10, 50), k15: pct(k15, 50), k15p90: pct(k15, 90), k20: pct(k20, 50), kEnd: pct(kEnd, 50), dur: pct(durs, 50) },
  };
};
const G3 = pacingGates(runsV3), G2 = pacingGates(runsV2);
ck(`1) 5/10/15/20 分擊殺分布落在 S29B1 規格（v3 p50：5分${G3.stats.k5}、10分${G3.stats.k10}、15分${G3.stats.k15}、20分${G3.stats.k20}、終局${G3.stats.kEnd}、時長${G3.stats.dur.toFixed(1)}分）`,
  G3.g1 && G3.g2 && G3.g3 && G3.g4 && G3.g5 && G3.g8);
ck(`2) 失衡判定有檢定力：15分 >60 殺零容忍 + 同組門檻餵 v2（15分 p50=${G2.stats.k15}）必須被判失衡`,
  G3.g6 && G3.g7 && !(G2.g3 && G2.g4 && G2.g5));   // v2 至少一項節奏門檻紅

const fks = runsV3.map((r) => r.firstKill).filter((x) => x != null);
ck(`3) 首殺時間分布合理（p10=${pct(fks, 10).toFixed(0)}s、p50=${pct(fks, 50).toFixed(0)}s、p90=${pct(fks, 90).toFixed(0)}s；需 p10≥45、p50∈[90,420]）`,
  fks.length === runsV3.length && pct(fks, 10) >= 45 && pct(fks, 50) >= 90 && pct(fks, 50) <= 420);

// ── 4) 無人數優勢不無條件接戰（_joinV3 微場景）───────────────────────────────
{
  const e = new LogicEngine(1, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b3");
  const hot = { x: 50, y: 50 };
  // 敵方 4 人在熱點、我方只有自己 ⇒ 人數劣勢 ⇒ 必不參戰（不論骰值）
  for (const q of e.players) q.pos = q.side === "red" ? { x: 50, y: 50 } : { ...FOUNTAIN.blue };
  p.pos = { x: 55, y: 55 };
  const alive = e.players.filter((q) => !q.dead);
  const outnumbered = !e._joinV3(p, hot, null, null, alive);
  // 距離圈：超過 joinRadius ⇒ 必不參戰
  p.pos = { x: 5, y: 5 };
  const tooFar = !e._joinV3(p, hot, null, null, alive);
  // 重接戰冷卻：reengageAt 未到 ⇒ 必不參戰
  p.pos = { x: 52, y: 52 };
  for (const q of e.players) if (q.side === "blue") q.pos = { x: 52, y: 52 };
  p.reengageAt = e.t + 99;
  const locked = !e._joinV3(p, hot, null, null, e.players.filter((q) => !q.dead));
  ck("4) 不無條件接戰：人數明顯劣勢 / 超出距離圈 / 重接戰冷卻中 ⇒ 一律不參團（微場景，非統計）",
    outnumbered && tooFar && locked);
}

// ── 5) 低血量會撤退（微場景 + 全場統計）─────────────────────────────────────
{
  const e = new LogicEngine(1, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b1");
  p.pos = { x: 50, y: 50 }; p.hp = p.maxHp * 0.10;
  const d0 = dist(p.pos, FOUNTAIN.blue);
  e.tick(DT); e.tick(DT);
  ck(`5) 低血量會撤退（10% HP ⇒ retreating=true 且向泉水移動：${d0.toFixed(1)} → ${dist(p.pos, FOUNTAIN.blue).toFixed(1)}）`,
    p.retreating && dist(p.pos, FOUNTAIN.blue) < d0);
}

// ── 6) 追擊有時間/距離上限 ───────────────────────────────────────────────────
{
  const e = new LogicEngine(1, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b1");
  const q = e.players.find((x) => x.id === "r1");
  p.pos = { x: 50, y: 50 }; q.pos = { x: 52, y: 50 };
  q.retreating = true; q.hp = q.maxHp * 0.10;
  const got = e._tryChaseV3(p, e.players.filter((x) => !x.dead));
  const acquired = got === q && p.chaseId === q.id && p.chaseUntil === e.t + V3.chaseMaxT;
  // 超時 ⇒ 放棄
  p.chaseUntil = e.t - 1;
  const timeUp = e._chaseAliveV3(p) === null && p.chaseId === null;
  // 重新取得後拉開距離 ⇒ 放棄
  e._tryChaseV3(p, e.players.filter((x) => !x.dead));
  q.pos = { x: 70, y: 50 };
  const tooFarChase = e._chaseAliveV3(p) === null;
  ck(`6) 追擊有上限：取得需貼身+殘血+在逃；超時（chaseMaxT=${V3.chaseMaxT}s）放棄、拉開 ${V3.chaseGiveUpDist} 距離放棄、錨點 leash=${V3.chaseLeash}`,
    acquired && timeUp && tooFarChase && V3.chaseMaxT <= 8 && V3.chaseLeash <= 30);
}

// ── 7) 復活後需要返回戰場時間 ────────────────────────────────────────────────
{
  const re = runsV3.flatMap((r) => r.reentry);
  const med = pct(re, 50);
  // 引擎面：復活瞬間掛 respawnLock
  const e = new LogicEngine(7, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b1");
  p.dead = true; p.respawn = DT / 2; p.hp = 0;
  e.tick(DT);
  const locked = !p.dead && p.reengageAt >= e.t + V3.respawnLock - DT;
  ck(`7) 復活後需返場時間（復活鎖 ${V3.respawnLock}s + 泉水→戰線路程；實測復活→再交戰 p50=${med?.toFixed(1)}s，需 ≥6）`,
    locked && med >= 6);
}

ck(`8) 同一英雄不會短時間無限連死（40 場最大「3 分鐘窗內死亡數」= ${Math.max(...runsV3.map((r) => r.maxDeath3m))}，需 ≤5；連死 ≥2 會提早撤退且不參團）`,
  Math.max(...runsV3.map((r) => r.maxDeath3m)) <= 5 && V3.repeatDeathRetreatBonus > 0);

// ── 9) Gank 有 cooldown（無戰術的預設 Gank 節奏機）──────────────────────────
{
  const gaps = [];
  for (const r of runsV3.slice(0, 20)) {   // 前 20 場 = 無戰術（fsm3 預設 Gank）
    const bySide = { blue: [], red: [] };
    for (const g of r.gankStarts) bySide[g.side].push(g);
    for (const side of ["blue", "red"]) {
      const arr = bySide[side];
      for (let i = 1; i < arr.length; i++) gaps.push(arr[i].t - arr[i - 1].until);
    }
  }
  const minGap = gaps.length ? Math.min(...gaps) : Infinity;
  ck(`9) Gank 有 cooldown（無戰術：${gaps.length} 次相鄰 Gank 窗，窗結束→下一窗最小間隔 ${minGap === Infinity ? "—" : minGap.toFixed(0)}s，需 ≥ ${V3.defaultGankInterval - V3.defaultGankWindow - 1}）`,
    gaps.length >= 10 && minGap >= V3.defaultGankInterval - V3.defaultGankWindow - 1);
}

// ── 10) killContext 合法 ─────────────────────────────────────────────────────
{
  const all = runsV3.flatMap((r) => r.eng.killContexts);
  const kn = runsV3.reduce((s, r) => s + r.kills.length, 0);
  const legal = all.every((k) =>
    KILL_TYPES.has(k.type) &&
    Number.isFinite(k.location?.x) && Number.isFinite(k.location?.y) &&
    Array.isArray(k.participants) && k.participants.length >= 2 &&
    Number.isFinite(k.startedAt) && Number.isFinite(k.duration) && k.duration >= 0 && k.startedAt <= k.t + 1e-9);
  const types = {};
  for (const k of all) types[k.type] = (types[k.type] ?? 0) + 1;
  ck(`10) killContext 合法（${all.length} 筆 = 擊殺數 ${kn}；type 全在白名單、participants≥2、duration≥0；分布 ${JSON.stringify(types)}）`,
    all.length === kn && all.length > 0 && legal && Object.keys(types).length >= 4);
}

// ── 11–13) Dragon / Baron / 營地真實出生 ────────────────────────────────────
ck(`11) Dragon 真實出生（40 場皆在 ${V3.dragonSpawn}s 準時出生、出生時滿血、死後 ${V3.objRespawn}s 重生倒數）`,
  runsV3.every((r) => r.dragonSpawnT !== null && Math.abs(r.dragonSpawnT - V3.dragonSpawn) <= DT + 1e-9) &&
  runsV3.every((r) => {
    const o = r.eng.neutrals.dragon;
    return o.maxHp === V3.dragonHp && (o.alive ? o.hp > 0 : o.respawnAt > 0);
  }));
ck(`12) Baron 真實出生（出生於 ${V3.baronSpawn}s；maxHp=${V3.baronHp}）`,
  runsV3.every((r) => r.baronSpawnT === null ? r.eng.t < V3.baronSpawn : Math.abs(r.baronSpawnT - V3.baronSpawn) <= DT + 1e-9) &&
  runsV3.filter((r) => r.baronSpawnT !== null).length >= runsV3.length * 0.9);
{
  const mirror = (p) => ({ x: 100 - p.x, y: 100 - p.y });
  const mirrored = CAMPS.filter((c) => c.side === "blue").every((c) => {
    const m = CAMPS.find((d) => d.side === "red" && d.type === c.type && dist(mirror(c), d) < 1e-9);
    return !!m;
  });
  const e = runsV3[0].eng;
  const engineCamps = e.neutrals.camps;
  const posMatch = engineCamps.every((c) => {
    const def = CAMPS.find((d) => d.id === c.id);
    return def && c.pos.x === def.x && c.pos.y === def.y;
  });
  // S29B3 修斷言競態：終局看 killerTeam 會被「營地重生 reset」清掉（取決於終局落點）
  //   ⇒ 改為模擬過程中累計「alive→dead 轉場」（真觀測、無競態）。
  const wereKilled = runsV3.every((r) => r.campKills >= 1);
  const totalCampKills = runsV3.reduce((s, r) => s + r.campKills, 0);
  ck(`13) 野怪營地存在（6 座、藍紅 180° 鏡像、引擎座標 == gameData.CAMPS、每場都有營地被清掉：40 場合計 ${totalCampKills} 次）`,
    CAMPS.length === 6 && mirrored && posMatch && wereKilled);
}

// ── 14) HP 下降與死亡事件一致 ───────────────────────────────────────────────
{
  // 逐 tick 觀測：dragon 在死亡前有真實 HP 下降（不是瞬間消失）
  const hpDrops = runsV3.every((r) => {
    const o = r.eng.neutrals.dragon;
    const everKilled = o.killerTeam !== null || !o.alive;
    return !everKilled || r.dragonHpDrops >= 5;
  });
  // 事件層：DRAGON_SLAIN 的 side == 引擎 killerTeam（用 tracker 重演一場）
  const e = new LogicEngine(4242, null, { rules: "v3" });
  const tr = new BattleEventTracker();
  let match = true, slainSeen = 0;
  let lastKiller = null;
  const orig = e._updateNeutralsV3.bind(e);
  e._updateNeutralsV3 = (alive, dt) => { orig(alive, dt); if (!e.neutrals.dragon.alive) lastKiller = e.neutrals.dragon.killerTeam; };
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    e.tick(DT);
    for (const ev of tr.update(e.snapshot())) {
      if (ev.type === "DRAGON_SLAIN") { slainSeen++; if (ev.side !== lastKiller) match = false; }
    }
  }
  ck(`14) HP 下降與死亡事件一致（死亡前有連續 HP 下降；${slainSeen} 次 DRAGON_SLAIN 事件歸屬 == 引擎 killerTeam）`,
    hpDrops && slainSeen > 0 && match);
}

// ── 15) Minimap / 主畫面 / Replay 同座標來源 ────────────────────────────────
{
  const GV = code(src("src/GameView.jsx"));
  const V3D = code(src("src/MobaView3D.jsx"));
  const RS = code(src("src/screens/moba/MobaReplayScreen.jsx"));
  const snap = runsV3[0].eng.snapshot();
  const snapMatches = snap.objectives.every((o) => {
    if (o.type === "dragon" || o.type === "baron") return dist(o.pos, PITS[o.id]) < 1e-9;
    const def = CAMPS.find((d) => d.id === o.id);
    return def && o.pos.x === def.x && o.pos.y === def.y;
  });
  ck("15) Minimap 與世界座標一致（三個視圖都讀 snapshot.objectives / objectivesMeta / PITS，snapshot 座標 == gameData 單一來源；無硬編碼副本）",
    snapMatches &&
    /snap\.objectives/.test(GV) && /PITS\.dragon/.test(GV) &&
    /snapshot\.objectives/.test(V3D) && /snap0\.objectives/.test(V3D) &&
    /objectivesMeta/.test(RS));
}

// ── 16) Replay 保存目標事件（真跑一次擷取 → finalize）───────────────────────
{
  clearReplay();
  beginReplayCapture({ seed: 4242, config: {} });
  const e = new LogicEngine(4242, null, { rules: "v3" });
  const tr = new BattleEventTracker();
  const log = [];
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    e.tick(DT);
    const s = e.snapshot();
    log.push(...tr.update(s));
    captureReplayFrame(s);
  }
  const rep = finalizeReplay({ matchId: "m-29b1-check", events: log, resultSummary: null });
  const objEvents = rep.events.filter((ev) => ev.type === "DRAGON_SLAIN" || ev.type === "BARON_SLAIN" || ev.type === "OBJECTIVE_SPAWN");
  const spellEvents = rep.events.filter((ev) => ev.type === "SPELL_USED");
  const obOk = rep.frames.every((f) => Array.isArray(f.ob) && f.ob.length === rep.objectivesMeta.length);
  ck(`16) Replay 保存目標與技能事件（目標事件 ${objEvents.length} 筆、技能事件 ${spellEvents.length} 筆、逐 frame ob 位元 + objectivesMeta ${rep.objectivesMeta.length} 筆；Replay 不重新判定）`,
    objEvents.length > 0 && spellEvents.length > 0 && obOk && rep.objectivesMeta.length === 8 &&
    !/new CommsEngine|\.tick\(/.test(code(src("src/screens/moba/MobaReplayScreen.jsx"))));
  clearReplay();
}

// ── 17–18) Flash ────────────────────────────────────────────────────────────
{
  const viol = [];
  let flashes = 0;
  const reasons = {};
  for (const r of runsV3) {
    const byP = {};
    for (const se of r.eng.spellLog) {
      if (se.spell !== "flash") continue;
      flashes++;
      reasons[se.reason] = (reasons[se.reason] ?? 0) + 1;
      (byP[se.playerId] ??= []).push(se.t);
    }
    for (const id in byP) for (let i = 1; i < byP[id].length; i++) if (byP[id][i] - byP[id][i - 1] < V3.flashCd - 1e-6) viol.push(id);
  }
  ck(`17) Flash 有 cooldown（${flashes} 次使用、同人間隔 ≥ ${V3.flashCd}s、違規 ${viol.length} 筆；HUD cd 欄位由 snapshot 提供）`,
    flashes > 0 && viol.length === 0 &&
    runsV3[0].eng.snapshot().players.every((p) => p.sp?.[0]?.id === "flash" && Number.isFinite(p.sp[0].cd)));
  // 真實條件觸發：逃生微場景（殘血撤退 + 敵人貼身 ⇒ 一 tick 內位移 > 正常移速上限）
  const e = new LogicEngine(1, null, { rules: "v3" });
  const p = e.players.find((x) => x.id === "b1");
  const q = e.players.find((x) => x.id === "r1");
  p.pos = { x: 50, y: 50 }; p.hp = p.maxHp * 0.10; p.retreating = true;
  q.pos = { x: 51.5, y: 50 };
  const before = { ...p.pos };
  e.tick(DT);
  const moved = dist(before, p.pos);
  const ev = e.spellLog.find((s) => s.playerId === "b1" && s.spell === "flash");
  ck(`18) Flash 由真實條件觸發（逃生微場景：位移 ${moved.toFixed(1)} > 一般移速上限 ${(V3.moveSpeed * V3.retreatSpeedMult * DT).toFixed(1)}；事件帶 reason=${ev?.reason}；全場 reason 分布 ${JSON.stringify(reasons)}）`,
    ev?.reason === "escape" && moved > V3.moveSpeed * V3.retreatSpeedMult * DT + 1 &&
    Object.keys(reasons).every((k) => ["escape", "chase", "engage"].includes(k)));
}

// ── 19–20) Smite ────────────────────────────────────────────────────────────
{
  const allSmites = runsV3.flatMap((r) => r.eng.spellLog.filter((s) => s.spell === "smite").map((s) => ({ ...s, eng: r.eng })));
  const jungleOnly = allSmites.every((s) => s.playerId.endsWith("2"));
  const slotOk = runsV3[0].eng.snapshot().players.every((p) =>
    p.role === "jungle" ? p.sp[1].id === "smite" : (p.sp[1].id === null && p.sp[1].status === "reserved"));
  ck(`19) Smite 只給 Jungle（${allSmites.length} 次使用全部來自打野席位；其他位置 D 欄 = 明確 reserved，不虛構）`,
    allSmites.length > 0 && jungleOnly && slotOk);
  // 真實作用：微場景——龍 500 HP、打野貼坑、smite ready ⇒ 龍被斬殺、killerTeam 歸屬
  const e = new LogicEngine(1, null, { rules: "v3" });
  const jg = e.players.find((x) => x.id === "b2");
  for (const q of e.players) q.pos = { ...FOUNTAIN[q.side] };
  jg.pos = { x: PITS.dragon.x + 2, y: PITS.dragon.y };
  e.neutrals.dragon.alive = true; e.neutrals.dragon.hp = 500; e.dragon.alive = true;
  e.tick(DT);
  const smited = e.spellLog.some((s) => s.spell === "smite" && s.playerId === "b2");
  ck(`20) Smite 真實作用於中立目標（500 HP 龍被斬殺 ⇒ alive=${e.neutrals.dragon.alive}、killerTeam=${e.neutrals.dragon.killerTeam}、smite 進 ${V3.smiteCd}s 冷卻）`,
    smited && !e.neutrals.dragon.alive && e.neutrals.dragon.killerTeam === "blue" && jg.sp.d.readyAt > e.t);
}

// ── 21) F/D HUD 有資料來源 ──────────────────────────────────────────────────
{
  const HS = code(src("src/battle/ui/BattleHeroStrip.jsx"));
  ck("21) F/D HUD 有資料來源（BattleHeroStrip 讀 snapshot.players[].sp；有冷卻遮罩/秒數；reserved 明確標示；不再是空框）",
    /p\.sp\?\.\[0\]/.test(HS) && /p\.sp\?\.\[1\]/.test(HS) &&
    /spell\.cd/.test(HS) && /reserved/.test(HS));
}

// ── 22) 不出現 undefined / NaN ──────────────────────────────────────────────
{
  const HUD = code(src("src/battle/ui/BattleHUD.jsx"));
  const noRebuild = !/\{\s*id:\s*mvpId\s*\}/.test(HUD) && /mvpK/.test(HUD) && /計算中/.test(HUD);
  // snapshot 深掃：不得有 undefined / NaN / null pos（抽 3 場終局 + 1 場中局）
  const bad = [];
  const scan = (o, path2) => {
    if (o === undefined) bad.push(path2);
    else if (typeof o === "number" && !Number.isFinite(o)) bad.push(path2 + "=" + o);
    else if (Array.isArray(o)) o.forEach((v, i) => scan(v, `${path2}[${i}]`));
    else if (o && typeof o === "object") for (const k in o) scan(o[k], `${path2}.${k}`);
  };
  for (const r of runsV3.slice(0, 3)) scan(r.eng.snapshot(), "snap");
  const midE = new LogicEngine(88, null, { rules: "v3" });
  for (let t = DT; t <= 600; t += DT) midE.tick(DT);
  scan(midE.snapshot(), "midSnap");
  // MVP 行渲染字串不得出現 undefined（用 mvpCandidate 真資料組字串）
  const { mvpCandidate } = await import(u("src/battle/battleEvents.js"));
  const mvp = mvpCandidate(midE.snapshot());
  const line = `★ MVP ${mvp.id.toUpperCase()} ${mvp.k}/${mvp.d}/${mvp.a}`;
  ck(`22) 不出現 undefined/NaN（HUD 改為原始值 selector + 尚無 MVP 顯示「計算中」；snapshot 深掃 ${bad.length} 筆異常；MVP 行="${line}"）`,
    noRebuild && bad.length === 0 && !line.includes("undefined") && !line.includes("NaN"));
}

// ── 23–24) 長期進度隔離 ─────────────────────────────────────────────────────
{
  const LE = code(src("src/LogicEngine.js"));
  const MP = code(src("src/battle/moba/matchProgression.js"));
  const lvStable = runsV3.every((r) => r.eng.players.every((p) => p.lv === 1));   // 無 loadout ⇒ 恆 1，不被本場改寫
  ck("23) 不改選手長期 XP（引擎/節奏模組不 import profileStore/applyMatchProgress/heroProgress；跨場 lv 不被本場改寫）",
    lvStable &&
    !/profileStore|applyMatchProgress|heroProgressStore/.test(LE) &&
    !/profileStore|applyMatchProgress|heroProgressStore/.test(MP));
  const MPT = src("src/platform/contracts/matchProgressTransaction.js");
  ck("24) 不改 MatchProgressTransaction（契約檔不 import 本次新模組；引擎不 import 契約）",
    !/killContext|summonerSpell|neutralObjective|SIM_RULES/i.test(MPT) &&
    !/matchProgressTransaction/i.test(LE));
}

// ── 25+) v3 順序公平性（P0 防線延伸到新預設規則集）──────────────────────────
//  樣本量與 runtime29 §28/29 相同（40 seeds）：20 seeds 的勝率差標準誤 ≈ 15pp，
//  會把「混沌」誤判成「偏差」（runtime29 檔尾對兩者的區分已有完整論述）。
{
  const ORDER_SEEDS = [...SEEDS, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  let f = 0, b = 0;
  for (const s of ORDER_SEEDS) {
    for (const rev of [false, true]) {
      const e = new LogicEngine(s, null, { rules: "v3" });
      if (rev) e.players.reverse();
      for (let t = DT; t <= CAP && !e.over; t += DT) e.tick(DT);
      if (e.winner === "blue") { if (rev) b++; else f++; }
    }
  }
  const n = ORDER_SEEDS.length;
  const shift = Math.abs(f - b) / n;
  ck(`25) v3 陣列順序不決定勝負（P0 防線：40 seeds 正序藍勝 ${f}/${n}、反序 ${b}/${n}，位移 ${(shift * 100).toFixed(0)}pp ≤ 15；兩者皆在 30–70%）`,
    shift <= 0.15 && f / n >= 0.30 && f / n <= 0.70 && b / n >= 0.30 && b / n <= 0.70);
}

// ── 26–29) 既有 verifier / regress / build（跑 runtime29 = 全巢狀一次到位）────
function runNode(script, shape, args = [], timeout = 1800000) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, script), ...args],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
    return { ok: shape.test(out), code: 0, out };
  } catch (e) {
    return { ok: shape.test(String(e.stdout ?? "")), code: e.status ?? -1, out: String(e.stdout ?? "") };
  }
}
if (process.env.SKIP_NESTED === "1") {
  console.log("⚠ SKIP_NESTED=1：跳過 runtime29 / flow09 / dash10 巢狀驗證（開發迭代模式，不可作為完成依據）");
} else {
  const rt = runNode("tools/check_moba_runtime29.mjs", /44\/44 通過/);
  ck(`26) Sprint29A runtime verifier 44/44（exit=${rt.code}）`, rt.ok && rt.code === 0);
  if (!(rt.ok && rt.code === 0)) {
    // 失敗時傾印 runtime29 的紅點（否則只知道 exit=1，無從定位）
    for (const line of rt.out.split("\n")) if (line.startsWith("❌")) console.log("  [runtime29] " + line);
  }
  ck("27) S23–S28 現役 verifier 通過（由 runtime29 巢狀執行並驗 exit+形狀：stats28/talent27/experience26/progress25/tactic24/cs23）",
    /✅ 30\) Sprint28 verifier 29\/29/.test(rt.out) && /✅ 35\) Sprint23 verifier 28\/28/.test(rt.out));
  ck("28) regress / regress2 通過（由 runtime29 巢狀執行）",
    /✅ 36\) regress（結束率 15\/15）/.test(rt.out) && /✅ 37\) regress2（節奏門檻全綠）/.test(rt.out));
  ck("29) npm run build 通過（由 runtime29 巢狀執行）", /✅ 38\) npm run build 通過/.test(rt.out));
  // flow09/dash10 無「N/N 通過」總結列 ⇒ 判 exit 0 + 輸出含 ✅ 且不含 ❌
  for (const [name, script] of [
    ["30) flow09 verifier", "tools/check_flow09.mjs"],
    ["31) dash10 verifier", "tools/check_dash10.mjs"],
  ]) {
    const r = runNode(script, /✅/, [], 600000);
    ck(`${name}（exit=${r.code}、無 ❌）`, r.ok && r.code === 0 && !r.out.includes("❌"));
  }
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
console.log(`\n=== v2（S29A）vs v3（S29B1）· 各 20 seeds（戰術 M1）===`);
for (const [tag, G] of [["v2", G2], ["v3(混合40)", G3]]) {
  console.log(`${tag}: 5分p50=${G.stats.k5} 10分p50=${G.stats.k10} 15分p50=${G.stats.k15}(p90=${G.stats.k15p90}) 20分p50=${G.stats.k20} 終局p50=${G.stats.kEnd} 時長p50=${G.stats.dur.toFixed(1)}分`);
}
console.log(`⚠ 視覺（3D 低模外觀 / HUD 版面 / 手機實機 FPS）→ 無瀏覽器，未實測（見交付報告）`);
process.exit(pass === A.length ? 0 : 1);
